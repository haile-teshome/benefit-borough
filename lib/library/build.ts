import type { SourceDoc } from "../documents";
import type { Category } from "../types";
import { LIBRARY, LIBRARY_MONTHS, type Plan } from "./catalog";

// Turn a library plan plus a person's answers into a document (the plan's terms, then "your
// numbers") and the findings it supports. Every finding quotes a line of that document.

export type Answers = Record<string, string | number | string[] | undefined>;
export type Pick = { plan: string; answers: Answers };
export type LibFinding = { id: string; category: Category; label: string; amount: number; deadline: string; span: string; rule: string; facts?: Record<string, number> };

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num = (v: unknown, d = 0) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, "")); return Number.isFinite(n) ? n : d; };
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const addMonths = (iso: string, m: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildDoc(p: Pick): SourceDoc | null {
  const plan = LIBRARY.find((x) => x.id === p.plan);
  if (!plan) return null;
  const mine = personalLines(plan, p.answers);
  const credits = (plan.credits ?? []).map((c) => `${c.name}: ${usd(c.amount)} ${c.cadence}${c.note ? ` (${c.note})` : ""}, resets after ${fmtDate(c.ends)}.`);
  const text = [plan.title.toUpperCase(), `Source: ${plan.sources.map((s) => s.label).join("; ")}`, ...plan.terms, ...credits, "", "YOUR NUMBERS (entered by you)", ...mine].join("\n");
  return { id: `lib_${plan.id}`, name: `${plan.title} (Expire library)`, text, meta: { plan: plan.id, answers: p.answers } };
}

function personalLines(plan: Plan, a: Answers): string[] {
  switch (plan.id) {
    case "ucb-ship-2026": return [
      `Deductible met so far: ${usd(num(a.deductible_met))} of $450.`,
      `Applied to the out-of-pocket maximum so far: ${usd(num(a.oop_applied))} of $5,000.`,
      ...(num(a.ordered_care) > 0 ? [`Care a doctor already ordered, not yet done: estimated ${usd(num(a.ordered_care))}.`] : []),
      `My coinsurance after the deductible: ${num(a.coinsurance, 20)}%.`,
      `Dental maximum used this plan year: ${usd(num(a.dental_used))} of $2,000.`,
      `Cleanings since August 1: ${num(a.cleanings)} of 2.`,
      `Vision glasses or contacts allowance used this plan year: ${a.vision_used === "Yes" ? "yes" : "no"}.`,
    ];
    case "cal-dining-2026": return [`My Flex balance: ${usd(num(a.balance))}.`, `My spending: about ${usd(num(a.weekly, 30))} per week.`];
    case "irs-fsa-2026": return [`My FSA balance: ${usd(num(a.balance))}.`, `My plan's carryover: ${usd(num(a.carryover, 680))}.`, `My plan year ends: ${fmtDate(String(a.year_end || "2026-12-31"))}.`];
    case "irs-hsa-2026": return [`My HSA coverage: ${a.coverage === "Family" ? "family" : "self-only"}.`, `Contributed for 2026 so far: ${usd(num(a.contributed))}.`];
    case "venture-x-2026": return [`My account anniversary: ${fmtDate(String(a.anniversary || "2027-02-15"))}.`, `Travel credit used this cardmember year: ${usd(num(a.used_amount))} of $300.`];
    default:
      if (plan.credits) { const used = new Set((a.used as string[]) ?? []); return plan.credits.map((c) => `${c.name}: ${used.has(c.key) ? "used" : "not used yet"} this period.`); }
      if (plan.category === "Points & miles") return [`My balance: ${Math.round(num(a.balance)).toLocaleString("en-US")} points.`, `My last earning or redeeming: ${fmtDate(String(a.last_activity || "2025-01-15"))}.`, `Exempt from expiration: ${a.exempt === "Yes" ? "yes" : "no"}.`];
      return [];
  }
}

// Findings for one library document, given today's date.
export function libraryFindings(doc: SourceDoc, today: string): LibFinding[] {
  const plan = LIBRARY.find((x) => x.id === doc.meta?.plan);
  if (!plan) return [];
  const a = doc.meta!.answers as Answers;
  const lines = doc.text.split("\n");
  const line = (re: RegExp) => lines.find((l) => re.test(l)) ?? "";
  const id = (kind: string, n = "") => `lib_${plan.id.replace(/\W/g, "")}_${kind}${n ? `_${n}` : ""}`;
  const out: LibFinding[] = [];
  const reset = plan.terms[0] ?? "";

  if (plan.id === "ucb-ship-2026") {
    const fee = num(a.ordered_care), coins = num(a.coinsurance, 20) / 100, met = num(a.deductible_met), applied = num(a.oop_applied);
    if (fee > 0) {
      const dedLeft = Math.max(0, 450 - met), oopLeft = Math.max(0, 5000 - applied);
      const now = Math.min(Math.min(fee, dedLeft) + coins * Math.max(0, fee - dedLeft), oopLeft);
      const after = Math.min(Math.min(fee, 450) + coins * Math.max(0, fee - 450), 5000);
      const save = round2(after - now);
      if (save > 0) out.push({ id: id("health"), category: "deductible", label: "Ordered care before the SHIP plan year resets", amount: save, deadline: "2027-07-31", span: line(/already ordered/), rule: reset, facts: { now: round2(now), after: round2(after), fee } });
    }
    const left = Math.max(0, 2000 - num(a.dental_used)), cleanings = Math.max(0, 2 - num(a.cleanings));
    out.push({ id: id("dental"), category: "dental", label: "SHIP dental benefit left this plan year", amount: left, deadline: "2027-07-31", span: line(/Dental maximum used/), rule: reset, facts: { cleanings } });
    if (a.vision_used !== "Yes") out.push({ id: id("vision"), category: "vision", label: "SHIP glasses or contacts allowance", amount: 150, deadline: "2027-07-31", span: line(/Vision glasses/), rule: plan.terms[4] });
  }
  if (plan.id === "cal-dining-2026") out.push({ id: id("dining"), category: "dining", label: "Cal Dining Flex dollars", amount: num(a.balance), deadline: "2027-05-14", span: line(/My Flex balance/), rule: plan.terms[1], facts: { weekly: num(a.weekly, 30) } });
  if (plan.id === "irs-fsa-2026") {
    const forfeit = Math.max(0, round2(num(a.balance) - num(a.carryover, 680)));
    out.push({ id: id("fsa"), category: "fsa", label: "Health FSA balance over the carryover", amount: forfeit, deadline: String(a.year_end || "2026-12-31"), span: line(/My FSA balance/), rule: plan.terms[1], facts: { balance: num(a.balance), carryover: num(a.carryover, 680) } });
  }
  if (plan.id === "irs-hsa-2026") {
    const limit = a.coverage === "Family" ? 8750 : 4400;
    const room = Math.max(0, limit - num(a.contributed));
    if (room > 0) out.push({ id: id("hsa"), category: "hsa", label: "HSA contribution room for 2026", amount: room, deadline: "2027-04-15", span: line(/Contributed for 2026/), rule: plan.terms[1], facts: { limit } });
  }
  if (plan.id === "venture-x-2026") {
    const left = Math.max(0, 300 - num(a.used_amount));
    if (left > 0) out.push({ id: id("credit", "travel"), category: "card_credit", label: "Venture X travel credit", amount: left, deadline: String(a.anniversary || "2027-02-15"), span: line(/Travel credit used/), rule: plan.terms[0] });
  }
  if (plan.credits) {
    const used = new Set((a.used as string[]) ?? []);
    for (const c of plan.credits) if (!used.has(c.key) && c.ends >= today)
      out.push({ id: id("credit", c.key), category: "card_credit", label: `${plan.issuer} ${c.name}`, amount: c.amount, deadline: c.ends, span: line(new RegExp(`^${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: not used`)), rule: `${c.cadence} credit${c.note ? `, ${c.note}` : ""}` });
  }
  if (plan.category === "Points & miles" && a.exempt !== "Yes") {
    const [months, cents] = LIBRARY_MONTHS[plan.id];
    const expires = addMonths(String(a.last_activity || "2025-01-15"), months);
    const balance = num(a.balance);
    if (balance > 0 && expires >= today) out.push({ id: id("points"), category: "points", label: plan.title, amount: round2((balance * cents) / 100), deadline: expires, span: line(/My last earning/), rule: plan.terms[0], facts: { balance, cents } });
  }
  return out.filter((f) => f.span);
}
