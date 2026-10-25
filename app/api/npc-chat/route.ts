import { NextResponse } from "next/server";
import { z } from "zod";
import { claudeEnabled } from "@/lib/engine/claude";
import { usd } from "@/lib/engine/spans";
import { hydrate, load, save } from "@/lib/store";
import { heartsFor, KEEPERS, NPCS, STORY } from "@/lib/valley/people";
import { BUILDINGS } from "@/lib/valley/world";
import { structuredWithEngine } from "@/lib/engine/llm";

// Talk freely with a villager or shopkeeper. Claude plays the character from their personality
// sheet, using only facts from the game: the valley, and this player's claims. Real decisions
// (anything that moves money) stay with the crop cards and Ruth.

const Reply = z.object({ reply: z.string().describe("1 to 3 short sentences, in character, spoken aloud") });
type Turn = { from: "you" | "them"; text: string };

const VALLEY = `Benefit Borough is a cozy farming town where every benefit about to expire grows as a crop. Districts: the Healthcare District (Borough General Hospital, Dr. Okafor's Dental, the Pharmacy & Optical), the Financial District (Borough Bank for checking and savings, the Card House for every credit card, the Deal Desk for price matches and renewals), the Dining Commons, the Benefits Office (open enrollment Nov 1-21), Farmland to the south, a pond with a dock, a fountain plaza. Ruth, an alpaca in reading glasses, is the Reviewer: she approves or rejects every harvest by her rules and can't be argued out of one. `;
const SEASONS = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"];
const partOfDay = (h: number) => (h < 5 ? "the middle of the night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");
const sinceLast = (last?: string) => {
  if (!last) return "This is the first time you two have met.";
  const days = Math.floor((Date.now() - Date.parse(last)) / 86_400_000);
  return days < 1 ? "You already talked earlier today." : days === 1 ? "You last talked yesterday." : `You haven't seen them in ${days} days.`;
};
const today = () => new Date().toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export async function POST(req: Request) {
  const { pid, who, message, history = [] } = (await req.json()) as { pid?: string; who: string; message: string; history?: Turn[] };
  const npc = NPCS.find((n) => n.id === who);
  const keeper = KEEPERS[who];
  const person = npc ? { name: npc.name, persona: npc.persona, lines: npc.talk } : keeper ? { name: keeper.name, persona: keeper.persona, lines: [keeper.hello] } : null;
  if (!person) return NextResponse.json({ error: "Nobody by that name here" }, { status: 404 });
  if (!message?.trim()) return NextResponse.json({ error: "Say something first" }, { status: 400 });

  const fallback = person.lines[Math.floor(Math.random() * person.lines.length)];
  if (!claudeEnabled()) return NextResponse.json({ reply: fallback, engine: "script" });

  await hydrate(pid);
  const s = load(pid);
  const cats = keeper ? BUILDINGS.find((b) => b.id === who)?.place?.categories ?? [] : null;
  const claims = s.tiles.filter((t) => !cats || cats.includes(t.category)).filter((t) => !s.done.includes(t.id) && s.reviews[t.id]?.verdict !== "reject").sort((a, b) => b.atStake - a.atStake).slice(0, keeper ? 8 : 6);
  const rescued = s.ledger.reduce((sum, l) => sum + l.amount, 0);
  const p = person.persona;
  // Friendship: hearts grow with chats; at 1 and 3 hearts they share a story beat, once.
  const f = ((s.friends ??= {})[who] ??= { talks: 0, told: [], said: [] });
  const hearts = heartsFor(f.talks);
  const beat = STORY[who]?.findIndex((_, i) => hearts >= (i === 0 ? 1 : 3) && !f.told.includes(i)) ?? -1;
  const now = new Date();
  const lastHarvest = [...s.ledger].sort((a, b) => b.at.localeCompare(a.at))[0];
  const context = [
    `It's ${partOfDay(now.getHours())} in ${SEASONS[now.getMonth()]}.`,
    sinceLast(f.last),
    `Friendship: ${hearts} of 5 hearts (${f.talks} chats). ${hearts === 0 ? "You're polite but still getting to know them." : hearts < 3 ? "You're friendly and use their name." : "You're close friends: warm, teasing, a little more personal."}`,
    lastHarvest ? `Their latest harvest: ${lastHarvest.description} (${usd(lastHarvest.amount)}).` : "",
    beat >= 0 ? `Today, if it fits naturally, share this about yourself in your own words (you've never told them before): ${STORY[who][beat]}` : "",
    f.said.length ? `Things you've already said to them recently (don't repeat these): ${f.said.slice(-4).map((l) => `"${l}"`).join(" ")}` : "",
  ].filter(Boolean).join("\n");
  const { data: out, engine } = await structuredWithEngine("chat", {
    system: `You are ${person.name}, a resident of Benefit Borough, a cozy pixel-art farming game.
${VALLEY} It is now ${today()}.
Your personality: ${p.quirk} You talk like this: ${p.style} Catchphrase (use it sometimes, not every time): "${p.catchphrase}". You love ${p.loves}. Pet peeve: ${p.peeve}.
For the feel of your voice only (never repeat these or reuse their wording): ${person.lines.map((l) => `"${l}"`).join(" ")}
Rules: answer what the player just said, in fresh words. Don't greet them or introduce yourself or your shop unless they greet you first, and never say the same thing twice in a conversation. Stay in character and keep it short (1-3 sentences, spoken aloud, no stage directions, no emoji). Be kind and funny. Only mention dollar amounts and dates that appear in the player's claims below; never invent numbers. You can point the player to a claim, a shop or Ruth, but you never take actions or promise money: harvesting happens through the crop cards, and Ruth reviews every one. If asked for personal financial or medical advice beyond the game, say in character that you'd ask Ruth or a professional.`,
    user: `${context}\nThe player has rescued ${usd(rescued)} so far.\n${keeper ? "Claims at your shop" : "Their biggest open claims"}: ${claims.length ? claims.map((t) => `${t.title} (${t.atStake ? usd(t.atStake) : "options"}, ${t.daysLeft} days left)`).join("; ") : "none right now"}.\n\nConversation so far:\n${history.slice(-6).map((h) => `${h.from === "you" ? "Player" : person.name}: ${h.text}`).join("\n")}\nPlayer: ${message.slice(0, 300)}`,
    schema: Reply,
    effort: "low",
  });
  const reply = out?.reply ?? fallback;
  f.talks += 1; f.last = now.toISOString(); f.said = [...f.said, reply].slice(-6);
  if (out && beat >= 0) f.told.push(beat);
  save(s, pid);
  return NextResponse.json({ reply, engine: out ? engine : "script", hearts: heartsFor(f.talks), heartUp: heartsFor(f.talks) > hearts, told: out && beat >= 0 });
}
