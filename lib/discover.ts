import { z } from "zod";
import { claudeEnabled, searchStructured } from "./engine/claude";

// When you create your farmer, Ruth looks up the benefits that come with who you are: your
// employer's published benefits, your health plan's fitness reimbursement, your school's perks.
// Every fact she returns carries the page it came from and the words on that page, and you confirm
// it before anything is planted. What she can't source she leaves out; she never guesses a number.

export type Who = { employer?: string; jobType?: string; insurer?: string; healthPlan?: string; school?: string; homeState?: string };

// What Ruth can look up, and what each one means (sent to Claude with the schema).
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

export const FoundSchema = z.object({
  facts: z.array(z.object({
    key: z.enum(Object.keys(FACTS) as [FactKey, ...FactKey[]]),
    value: z.string().describe("the value: a plain number for amounts and percents, yes/no, or short text"),
    source: z.string().describe("URL of the page that states it"),
    quote: z.string().describe("the words on that page, copied exactly"),
  })),
  notes: z.array(z.string()).describe("Short notes on what couldn't be confirmed"),
});
export type Found = { facts: Partial<Record<FactKey, { value: string; source: string; quote: string }>>; notes: string[] };

export async function discover(w: Who): Promise<{ found: Found | null; searches: number }> {
  if (!claudeEnabled()) return { found: null, searches: 0 };
  const parts = [
    w.employer && `Employer: ${w.employer}${w.jobType ? ` (${w.jobType})` : ""}`,
    w.insurer && `Health insurance carrier: ${w.insurer}${w.healthPlan ? `, plan: ${w.healthPlan}` : ""}`,
    w.school && `School: ${w.school}`,
    w.homeState && `State: ${w.homeState}`,
  ].filter(Boolean);
  if (!parts.length) return { found: null, searches: 0 };
  const r = await searchStructured({
    system: `You research the employee and member benefits that come with a person's employer, health plan and school, for a benefits app. Prefer official pages (the employer's careers or benefits page, the carrier's member pages, the school's site); reputable reporting is acceptable when no official page exists. Report only facts you found on a page, each with its URL and an exact quote; leave out anything you can't source. Never estimate. Facts you can report:\n${Object.entries(FACTS).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
    user: `Find the publicly documented benefits for this person.\n${parts.join("\n")}`,
    schema: FoundSchema, maxSearches: 6, effort: "medium",
  });
  if (!r.data) return { found: null, searches: r.searches };
  const facts: Found["facts"] = {};
  for (const f of r.data.facts) if (/^https?:\/\//.test(f.source) && f.value.trim() && !facts[f.key]) facts[f.key] = { value: f.value.trim(), source: f.source, quote: f.quote };
  return { found: { facts, notes: r.data.notes }, searches: r.searches };
}
