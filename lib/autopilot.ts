import { convexEnabled, hydrate, load, log, save, allPids } from "./store";
import { prepare, scan } from "./pipeline";
import { checkPayday } from "./payday";
import { nessieEnabled } from "./integrations/nessie";
import type { Autopilot, Mandate, ShiftReport, Tile } from "./types";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// Ruth's night shift. Within your mandate she rescans your documents, buys fresh data over x402
// (within your budget), and prepares every claim she's approved, then leaves a morning report.
// She never submits, signs, pays or sends anything: those wait in her outbox for you.

const HEALTH = new Set(["fsa", "fsa_claim", "dcfsa", "hsa", "vision", "dental", "deductible", "fitness"]);
const MONEY_BACK = new Set([...HEALTH, "price_adjust", "bank_fee", "dispute", "annual_fee", "subscription", "stipend"]);
const allowed = (m: Mandate, t: Tile) => m.prepare === "all" || (m.prepare === "health" ? HEALTH : MONEY_BACK).has(t.category);

export const defaultMandate = (): Mandate => ({ on: false, hour: 2, tzOffset: new Date().getTimezoneOffset(), prepare: "all", dataBudget: 0.25, signedAt: "" });

export async function setMandate(pid: string, m: Partial<Mandate>) {
  await hydrate(pid);
  const s = load(pid);
  const cur: Autopilot = s.autopilot ?? { mandate: defaultMandate(), spent: { month: "", usd: 0 }, reports: [] };
  const mandate: Mandate = { ...cur.mandate, ...m, hour: Math.max(0, Math.min(23, Math.round(m.hour ?? cur.mandate.hour))), dataBudget: Math.max(0, Math.min(5, m.dataBudget ?? cur.mandate.dataBudget)), signedAt: m.on ? new Date().toISOString() : cur.mandate.signedAt };
  s.autopilot = { ...cur, mandate };
  log(s, "autopilot", mandate.on ? `You signed Ruth's mandate: night shift at ${mandate.hour}:00, prepare ${mandate.prepare === "all" ? "every approved claim" : mandate.prepare === "health" ? "health claims" : "money-back claims"}, data budget $${mandate.dataBudget.toFixed(2)}/month. Never submit.` : "You turned Autopilot off");
  save(s, pid);
  if (convexEnabled()) await cx()?.mutation(anyApi.autopilot.setMandate, { pid, on: mandate.on, hour: mandate.hour, tzOffset: mandate.tzOffset }).catch(() => undefined);
  return s;
}

export async function runShift(pid: string, why: ShiftReport["why"]) {
  await hydrate(pid);
  let s = load(pid);
  const ap = s.autopilot;
  if (!ap || (why === "schedule" && !ap.mandate.on)) return null;
  const month = new Date().toISOString().slice(0, 7);
  const spentBefore = ap.spent.month === month ? ap.spent.usd : 0;
  const before = new Set(s.tiles.map((t) => t.id));
  log(s, "autopilot", `Night shift started (${why === "now" ? "you asked for it now" : "scheduled by Convex"})`);
  save(s, pid);

  // 1. Rescan, buying live prices only while the month's data budget lasts.
  s = await scan(s.docs, pid, { payForData: spentBefore + 0.01 <= ap.mandate.dataBudget });
  // 2. Did a paycheck land? Payday suggests moving what Ruth rescued into savings.
  if (nessieEnabled()) { try { await checkPayday(pid); s = load(pid); } catch { /* the bank can wait until tomorrow */ } }
  // 3. Prepare every approved claim inside the mandate that isn't already waiting or submitted.
  const prepared: ShiftReport["prepared"] = [];
  for (const t of s.tiles) {
    if (!t.live || t.action.kind === "none" || s.done.includes(t.id) || s.reviews[t.id]?.verdict !== "approve" || !allowed(ap.mandate, t)) continue;
    if (s.packets?.some((p) => p.tileId === t.id && (p.status === "submitted" || p.status === "ready"))) continue;
    try {
      const { packet } = await prepare(t.id, pid, "autopilot");
      prepared.push({ packetId: packet.id, form: packet.form, amount: packet.amount, status: packet.status });
    } catch { /* a claim that can't be prepared stays on the farm */ }
  }
  s = load(pid);
  const waiting = (s.packets ?? []).filter((p) => p.status !== "submitted");
  const spentNow = s.autopilot!.spent.month === month ? s.autopilot!.spent.usd : 0;
  const report: ShiftReport = {
    at: new Date().toISOString(), why, prepared,
    newClaims: s.tiles.filter((t) => !before.has(t.id) && t.live).map((t) => t.title),
    urgent: s.tiles.filter((t) => t.live && !s.done.includes(t.id) && t.daysLeft <= 7 && t.atStake > 0).map((t) => `${t.title} (${t.daysLeft}d)`),
    value: waiting.reduce((x, p) => x + p.amount, 0),
    minutesSaved: prepared.reduce((x, p) => { const pk = s.packets!.find((k) => k.id === p.packetId); return x + (pk ? pk.minutes.without - pk.minutes.you : 0); }, 0),
    dataSpent: Math.round((spentNow - spentBefore) * 100) / 100,
    notes: [spentBefore + 0.01 > ap.mandate.dataBudget ? "Data budget used up this month, so I used cached prices." : "", "Nothing was submitted. Everything is waiting in my outbox for you."].filter(Boolean),
  };
  s.autopilot = { ...s.autopilot!, reports: [report, ...s.autopilot!.reports].slice(0, 14) };
  log(s, "autopilot", `Shift done: prepared ${prepared.length} claim${prepared.length === 1 ? "" : "s"} worth $${prepared.reduce((x, p) => x + p.amount, 0).toFixed(2)}, ${waiting.filter((p) => p.status === "ready").length} ready for you, spent $${report.dataSpent.toFixed(2)} on data. Nothing submitted.`);
  save(s, pid);
  if (convexEnabled()) await cx()?.mutation(anyApi.autopilot.reported, { pid, summary: `${prepared.length} prepared, $${report.value.toFixed(0)} waiting` }).catch(() => undefined);
  return { state: s, report };
}

let client: ConvexHttpClient | null = null;
const cx = () => { const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL; return url ? (client ??= new ConvexHttpClient(url)) : null; };

// Called every minute by the server. Convex decides who's due; without Convex, check locally.
let running = false;
export async function pollShifts() {
  if (running) return;
  running = true;
  try {
    const c = cx();
    if (c) {
      for (const pid of (await c.query(anyApi.autopilot.due, {})) as string[]) if (await c.mutation(anyApi.autopilot.claim, { pid })) await runShift(pid, "schedule");
    } else {
      for (const pid of allPids()) {
        const ap = load(pid).autopilot;
        if (!ap?.mandate.on) continue;
        const local = new Date(Date.now() - ap.mandate.tzOffset * 60_000);
        if (local.getUTCHours() >= ap.mandate.hour && ap.reports[0]?.at.slice(0, 10) !== local.toISOString().slice(0, 10)) await runShift(pid, "schedule");
      }
    }
  } catch (err) {
    console.warn("[autopilot] poll failed", err);
  } finally {
    running = false;
  }
}
