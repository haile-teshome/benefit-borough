import { NextResponse } from "next/server";
import { BUGS, claim, DAILY_CAP, minigameLog, startRound, type Game } from "@/lib/minigames";
import { fresh } from "@/lib/rewards";
import { hydrate, load, save } from "@/lib/store";

// Balloons and bug catching. "start" sets up a round on the server; "claim" settles one pop or
// catch and pays acorns (capped per day). The client only plays.
const GAMES = new Set<Game>(["balloons", "bugs"]);
export async function POST(req: Request) {
  const body = (await req.json()) as { pid?: string; game: Game; action: "start" | "claim" | "journal"; index?: number; hour?: number };
  if (!GAMES.has(body.game)) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  await hydrate(body.pid);
  const s = load(body.pid);
  const r = (s.rewards ??= fresh());
  const log = minigameLog(r);
  const journal = () => ({ caught: log.journal[body.game] ?? {}, total: body.game === "bugs" ? BUGS.length : 0, todayAcorns: log.acorns[body.game] ?? 0, cap: DAILY_CAP[body.game] });
  if (body.action === "journal") return NextResponse.json({ journal: journal() });
  if (body.action === "start") {
    const items = startRound(r, body.game, Number.isFinite(body.hour) ? Number(body.hour) : new Date().getHours());
    save(s, body.pid);
    return NextResponse.json({ items, journal: journal() });
  }
  const out = claim(r, body.game, Number(body.index));
  save(s, body.pid);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
  return NextResponse.json({ ...out, rewards: r, journal: journal() });
}
