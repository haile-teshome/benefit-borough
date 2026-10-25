import { NextResponse } from "next/server";
import { CATALOG, QUESTS, fresh, record, redeem, refund, type Contact, type Event } from "@/lib/rewards";
import { hydrate, load, log, save } from "@/lib/store";
import { sendGiftCard, tangoEnabled } from "@/lib/integrations/tango";

// Acorns. GET returns your balance, streak, quests and the reward catalog. POST records a visit,
// shop visit or villager chat (all low-value; the server decides what they're worth and caps the
// day), or redeems a reward.
export async function GET(req: Request) {
  const pid = new URL(req.url).searchParams.get("pid");
  await hydrate(pid);
  const s = load(pid);
  return NextResponse.json({ rewards: s.rewards ?? fresh(), catalog: available(), quests: QUESTS });
}

const CLIENT_EVENTS = new Set(["visit", "shop", "chat"]);
// Only rewards that can actually be delivered: gift cards need a connected Tango Card account.
const available = () => CATALOG.filter((c) => c.partner !== "tango" || tangoEnabled());

export async function POST(req: Request) {
  const body = (await req.json()) as { pid?: string; event?: Event; redeem?: string; contact?: Contact };
  await hydrate(body.pid);
  const s = load(body.pid);
  const r = (s.rewards ??= fresh());
  if (body.redeem) {
    if (!available().some((c) => c.id === body.redeem)) return NextResponse.json({ error: "That reward isn't available", rewards: r }, { status: 400 });
    const out = redeem(r, body.redeem, body.contact ?? {});
    if (!out.ok) return NextResponse.json({ error: out.error, rewards: r }, { status: 400 });
    const item = CATALOG.find((c) => c.id === body.redeem)!;
    if (item.id === "databoost") {
      s.autopilot ??= { mandate: { on: false, hour: 2, tzOffset: new Date().getTimezoneOffset(), prepare: "all", dataBudget: 0.25, signedAt: "" }, spent: { month: "", usd: 0 }, reports: [] };
      s.autopilot.mandate.dataBudget = Math.min(5, Math.round((s.autopilot.mandate.dataBudget + 0.25) * 100) / 100);
    }
    // Gift cards go out right away through Tango Card (monthly cap already checked); a failure refunds.
    if (item.partner === "tango") {
      try {
        const sent = await sendGiftCard({ amount: item.usd!, prefer: item.prefer ?? [], email: out.redemption.contact!.email!, firstName: out.redemption.contact!.firstName!, externalRefID: out.redemption.id, message: "Earned with acorns in Benefit Burrow." });
        out.redemption.status = "sent"; out.redemption.detail = `${sent.reward} · order ${sent.referenceOrderID}`;
      } catch (e) {
        refund(r, out.redemption.id, "failed", (e as Error).message);
      }
    }
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
