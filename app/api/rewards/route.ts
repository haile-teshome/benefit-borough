import { NextResponse } from "next/server";
import { CATALOG, QUESTS, fresh, record, redeem, type Event } from "@/lib/rewards";
import { hydrate, load, log, save } from "@/lib/store";

// Acorns. GET returns your balance, streak, quests and the reward catalog. POST records a visit,
// shop visit or villager chat (all low-value; the server decides what they're worth and caps the
// day), or redeems a reward.
export async function GET(req: Request) {
  const pid = new URL(req.url).searchParams.get("pid");
  await hydrate(pid);
  const s = load(pid);
  return NextResponse.json({ rewards: s.rewards ?? fresh(), catalog: CATALOG, quests: QUESTS });
}

const CLIENT_EVENTS = new Set(["visit", "shop", "chat"]);

export async function POST(req: Request) {
  const body = (await req.json()) as { pid?: string; event?: Event; redeem?: string };
  await hydrate(body.pid);
  const s = load(body.pid);
  const r = (s.rewards ??= fresh());
  if (body.redeem) {
    const out = redeem(r, body.redeem);
    if (!out.ok) return NextResponse.json({ error: out.error, rewards: r }, { status: 400 });
    log(s, "acorns", `Redeemed ${out.redemption.name} for ${out.redemption.cost} acorns (${out.redemption.status})`);
    save(s, body.pid);
    return NextResponse.json({ rewards: r, redemption: out.redemption });
  }
  if (!body.event || !CLIENT_EVENTS.has(body.event.kind)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const gained = record(r, body.event);
  if (gained.acorns) log(s, "acorns", `+${gained.acorns} acorns (${gained.notes.join(", ")})`);
  save(s, body.pid);
  return NextResponse.json({ rewards: r, gained });
}
