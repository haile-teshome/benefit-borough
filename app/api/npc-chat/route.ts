import { NextResponse } from "next/server";
import { z } from "zod";
import { callStructured, claudeEnabled } from "@/lib/engine/claude";
import { usd } from "@/lib/engine/spans";
import { hydrate, load } from "@/lib/store";
import { KEEPERS, NPCS } from "@/lib/valley/people";
import { BUILDINGS } from "@/lib/valley/world";

// Talk freely with a villager or shopkeeper. Claude plays the character from their personality
// sheet, using only facts from the game: the valley, and this player's claims. Real decisions
// (anything that moves money) stay with the crop cards and Ruth.

const Reply = z.object({ reply: z.string().describe("1 to 3 short sentences, in character, spoken aloud") });
type Turn = { from: "you" | "them"; text: string };

const VALLEY = `Expire Valley is a cozy farming town where every benefit about to expire grows as a crop. Districts: the Healthcare District (Valley Hospital, Dr. Okafor's Dental, the Pharmacy & Optical), the Financial District (Valley Bank for checking and savings, the Card House for every credit card, the Deal Desk for price matches and renewals), the Dining Commons, the Benefits Office (open enrollment Nov 1-21), Farmland to the south, a pond with a dock, a fountain plaza. Ruth, an alpaca in reading glasses, is the Reviewer: she approves or rejects every harvest by her rules and can't be argued out of one. Today is October 24, 2026.`;

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
  const claims = s.tiles.filter((t) => !cats || cats.includes(t.category)).filter((t) => !s.done.includes(t.id)).sort((a, b) => b.atStake - a.atStake).slice(0, keeper ? 8 : 3);
  const rescued = s.ledger.reduce((sum, l) => sum + l.amount, 0);
  const p = person.persona;
  const out = await callStructured({
    system: `You are ${person.name}, a resident of Expire Valley, a cozy pixel-art farming game.
${VALLEY}
Your personality: ${p.quirk} You talk like this: ${p.style} Catchphrase (use it sometimes, not every time): "${p.catchphrase}". You love ${p.loves}. Pet peeve: ${p.peeve}.
Things you'd typically say: ${person.lines.map((l) => `"${l}"`).join(" ")}
Rules: stay in character and keep it short (1-3 sentences, spoken aloud, no stage directions, no emoji). Be kind and funny. Only mention dollar amounts and dates that appear in the player's claims below; never invent numbers. You can point the player to a claim, a shop or Ruth, but you never take actions or promise money: harvesting happens through the crop cards, and Ruth reviews every one. If asked for personal financial or medical advice beyond the game, say in character that you'd ask Ruth or a professional.`,
    user: `The player has rescued ${usd(rescued)} so far.\n${keeper ? "Claims at your shop" : "Their biggest open claims"}: ${claims.length ? claims.map((t) => `${t.title} (${t.atStake ? usd(t.atStake) : "options"}, ${t.daysLeft} days left)`).join("; ") : "none right now"}.\n\nConversation so far:\n${history.slice(-6).map((h) => `${h.from === "you" ? "Player" : person.name}: ${h.text}`).join("\n")}\nPlayer: ${message.slice(0, 300)}`,
    schema: Reply,
    effort: "low",
  });
  return NextResponse.json(out ? { reply: out.reply, engine: "claude" } : { reply: fallback, engine: "script" });
}
