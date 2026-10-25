import { LIBRARY } from "./library/catalog";

// What Ruth can look up online about your benefits (see lib/discover.ts), and how a confirmed
// finding turns into plan answers. Shared by onboarding and by the "Ruth found more" card that
// appears when her lookup finishes after you've already planted. No server code here.

export const FACTS = {
  match_rate_pct: "401(k) match: percent of your contribution the employer matches (e.g. 50)",
  match_cap_pct: "401(k) match: up to what percent of pay (e.g. 6)",
  pto_days: "Paid time off days per year for a typical full-time employee",
  pto_rollover_days: "Unused PTO days that roll over to next year",
  stipend_amount: "Annual wellness, lifestyle or learning stipend, in dollars",
  stipend_type: "What the stipend is for: Wellness, Learning, Lifestyle, Home office or Phone/internet",
  tuition_limit: "Annual tuition assistance limit, in dollars",
  student_loan_monthly: "Monthly student loan repayment benefit, in dollars",
  espp_discount_pct: "Employee stock purchase plan discount, in percent",
  offers_fsa: "Whether a health FSA is offered (yes/no)",
  offers_hsa: "Whether an HSA is offered (yes/no)",
  offers_dcfsa: "Whether a dependent care FSA is offered (yes/no)",
  fitness_max: "The health plan's annual gym or fitness reimbursement, in dollars",
  fitness_program: "Name of the health plan's fitness reimbursement or discount program",
  student_health_plan: "Name of the school's student health insurance plan",
  dining_plan_expires: "When the school's unused meal plan or dining dollars expire",
} as const;
export type FactKey = keyof typeof FACTS;
export type Fact = { value: string; source: string; quote: string };
export type Found = { facts: Partial<Record<FactKey, Fact>>; notes: string[] };

export const LABEL: Partial<Record<FactKey, string>> = {
  match_rate_pct: "401(k) match rate", match_cap_pct: "Match up to (of pay)", pto_days: "PTO days a year", pto_rollover_days: "PTO days that roll over", stipend_amount: "Stipend a year", stipend_type: "Stipend for",
  tuition_limit: "Tuition assistance a year", student_loan_monthly: "Student loan help a month", espp_discount_pct: "ESPP discount", offers_fsa: "Health FSA", offers_hsa: "HSA", offers_dcfsa: "Dependent care FSA",
  fitness_max: "Gym reimbursement a year", fitness_program: "Fitness program", student_health_plan: "Student health plan", dining_plan_expires: "Dining dollars expire",
};
const MONEY = new Set<FactKey>(["stipend_amount", "tuition_limit", "student_loan_monthly", "fitness_max"]);
const PCT = new Set<FactKey>(["match_rate_pct", "match_cap_pct", "espp_discount_pct"]);

export const num = (s?: string) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : undefined; };
export const yes = (s?: string) => /^(yes|true|offered|available)/i.test(String(s ?? "").trim());
export const showFact = (k: FactKey, v: string) => (MONEY.has(k) && num(v) ? `$${num(v)!.toLocaleString("en-US")}` : PCT.has(k) && num(v) ? `${num(v)}%` : v);
export const siteOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
export const reported = (u: string) => /glassdoor|levels\.fyi|indeed|reddit|blind|perkup/i.test(u);

type Facts = Found["facts"];
// Plans a finding tells us you have (so they're planted even if you didn't tick them).
export function impliedPlans(f: Facts, opts: { insured?: boolean } = {}): string[] {
  const ids: string[] = [];
  if (yes(f.offers_fsa?.value)) ids.push("irs-fsa-2026");
  if (f.match_rate_pct) ids.push("work-401k-match");
  if (f.pto_rollover_days) ids.push("work-pto");
  if (f.stipend_amount) ids.push("work-stipend");
  if (f.espp_discount_pct) ids.push("work-espp");
  if (f.tuition_limit) ids.push("edu-tuition-127");
  if (f.student_loan_monthly) ids.push("edu-loan-repay");
  if (opts.insured && f.fitness_max) ids.push("health-fitness");
  return ids;
}

// The plan answers a finding fills in (only questions the plan actually asks).
export function prefillFor(planId: string, f: Facts, insurer?: string): Record<string, number | string> {
  const plan = LIBRARY.find((p) => p.id === planId);
  if (!plan) return {};
  const a: Record<string, number | string> = {};
  const put = (k: string, v?: number | string) => { if (v !== undefined && plan.questions.some((q) => q.key === k)) a[k] = v; };
  const choice = (k: string, v?: string) => { const q = plan.questions.find((x) => x.key === k); if (v && q?.kind === "choice" && q.options.includes(v)) a[k] = v; };
  if (planId === "work-401k-match") { put("rate", num(f.match_rate_pct?.value)); put("cap", num(f.match_cap_pct?.value)); }
  if (planId === "work-pto") put("rollover", num(f.pto_rollover_days?.value));
  if (planId === "work-stipend") { put("left", num(f.stipend_amount?.value)); choice("type", f.stipend_type?.value); }
  if (planId === "work-espp") put("discount", num(f.espp_discount_pct?.value));
  if (planId === "edu-tuition-127") put("limit", num(f.tuition_limit?.value));
  if (planId === "edu-loan-repay") put("monthly", num(f.student_loan_monthly?.value));
  if (planId === "health-fitness") { put("max", num(f.fitness_max?.value)); const q = plan.questions.find((x) => x.key === "insurer"); if (q?.kind === "choice" && insurer) a.insurer = q.options.includes(insurer) ? insurer : "Other"; }
  return a;
}
