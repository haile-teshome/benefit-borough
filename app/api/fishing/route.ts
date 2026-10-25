import { NextResponse } from "next/server";
import { cast, fishLog, FISH, FISH_DAILY_CAP, land } from "@/lib/fishing";
import { fresh } from "@/lib/rewards";
import { hydrate, load, save } from "@/lib/store";

// Pond fishing. "cast" picks the fish on the server; "land" settles the catch and pays acorns
// (capped per day). The client only plays the reeling game.
export async function POST(req: Request) {
  const body = (await req.json()) as { pid?: string; action: "cast" | "land"; power?: number; hour?: number; caught?: boolean };
  await hydrate(body.pid);
  const s = load(body.pid);
  const r = (s.rewards ??= fresh());
  if (body.action === "cast") {
    const fish = cast(r, Number(body.power) || 0, Number.isFinite(body.hour) ? Number(body.hour) : new Date().getHours());
    save(s, body.pid);
    // Only what the reel needs: how hard it fights. The name is a surprise until it's landed.
    return NextResponse.json({ difficulty: fish.difficulty });
  }
  const out = land(r, Boolean(body.caught));
  save(s, body.pid);
  if ("error" in out) return NextResponse.json({ error: out.error, rewards: r }, { status: 400 });
  const log = fishLog(r);
  return NextResponse.json({ ...out, rewards: r, journal: { caught: log.caught, total: FISH.length, todayAcorns: log.acorns, cap: FISH_DAILY_CAP } });
}

export async function GET(req: Request) {
  const pid = new URL(req.url).searchParams.get("pid");
  await hydrate(pid);
  const s = load(pid);
  const log = fishLog((s.rewards ??= fresh()));
  return NextResponse.json({ journal: { caught: log.caught, total: FISH.length, todayAcorns: log.acorns, cap: FISH_DAILY_CAP } });
}
