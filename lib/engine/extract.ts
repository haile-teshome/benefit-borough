import { z } from "zod";
import type { SourceDoc } from "../documents";
import type { Balance, CareItem, Category, Extraction, SpendPattern } from "../types";
import { callStructured, claudeEnabled } from "./claude";
import { findSpan } from "./spans";

const CATEGORIES = ["fsa", "dental", "deductible", "dining", "card_credit", "tax_window"] as const;

export const FACT_KEYS = [
  "fsa_carryover_limit",
  "deductible",
  "deductible_met",
  "oop_max",
  "oop_applied",
  "coinsurance_member_pct",
  "dental_annual_max",
  "dental_used",
] as const;

const ExtractionSchema = z.object({
  balances: z.array(
    z.object({
      balance_id: z.string(),
      category: z.enum(CATEGORIES),
      label: z.string(),
      amount: z.number(),
      deadline: z.string().describe("ISO date YYYY-MM-DD"),
      source_doc: z.string(),
      source_span: z.string().describe("Verbatim quote from the document that states the amount"),
      rule_text: z.string().describe("The expiry, carryover or reset rule, quoted or closely paraphrased"),
    }),
  ),
  care_items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["dental", "medical"]),
      description: z.string(),
      fee: z.number().describe("Fee or estimated allowed amount in dollars"),
      coverage_pct: z.number().describe("Percent the plan pays; for medical after deductible use 100 - member coinsurance"),
      source_doc: z.string(),
      source_span: z.string(),
    }),
  ),
  spend_patterns: z.array(
    z.object({ category: z.enum(CATEGORIES), weekly_avg: z.number(), source_doc: z.string(), source_span: z.string() }),
  ),
  facts: z.array(
    z.object({ key: z.enum(FACT_KEYS), value: z.number(), source_doc: z.string(), source_span: z.string() }),
  ),
});

const SYSTEM = `You extract expiring money from a person's benefits, insurance, dining and card documents.
Return every balance that expires, resets or forfeits by a deadline, every pending or planned care item with its fee, spending rates, and the plan parameters listed in the schema.
Rules:
- source_span must be copied verbatim from the document, character for character, and must contain the number you report. Spans that are not verbatim are discarded.
- Report only what the documents state. Never estimate a balance that is not written down.
- Dates are ISO (YYYY-MM-DD). source_doc is the document id given in its header.
- Categories: fsa, dental (unused annual maximum), deductible (met deductible / out-of-pocket window that resets), dining, card_credit, tax_window (an enrollment or election window).`;

export async function extract(docs: SourceDoc[]): Promise<Extraction> {
  if (claudeEnabled()) {
    const user = docs.map((d) => `<document id="${d.id}" name="${d.name}">\n${d.text}\n</document>`).join("\n\n");
    const out = await callStructured({ system: SYSTEM, user, schema: ExtractionSchema, effort: "medium" });
    if (out) return ground(docs, out, "claude");
  }
  return ground(docs, mockExtraction(), "mock");
}

// Attach real character offsets to every claim; drop any claim whose span is not in a document.
function ground(docs: SourceDoc[], raw: z.infer<typeof ExtractionSchema>, engine: "claude" | "mock"): Extraction {
  const dropped: string[] = [];
  const balances: Balance[] = [];
  for (const b of raw.balances) {
    const span = findSpan(docs, b.source_doc, b.source_span);
    if (!span) { dropped.push(`${b.label} (${b.source_span})`); continue; }
    balances.push({ id: b.balance_id, category: b.category, label: b.label, amount: b.amount, deadline: b.deadline, source: span, ruleText: b.rule_text });
  }
  const careItems: CareItem[] = [];
  for (const c of raw.care_items) {
    const span = findSpan(docs, c.source_doc, c.source_span);
    if (!span) { dropped.push(`${c.description} (${c.source_span})`); continue; }
    careItems.push({ id: c.id, kind: c.kind, description: c.description, fee: c.fee, coveragePct: c.coverage_pct, source: span });
  }
  const patterns: SpendPattern[] = [];
  for (const p of raw.spend_patterns) {
    const span = findSpan(docs, p.source_doc, p.source_span);
    if (span) patterns.push({ category: p.category as Category, weeklyAvg: p.weekly_avg, source: span });
  }
  const facts: Record<string, number> = {};
  for (const f of raw.facts) if (findSpan(docs, f.source_doc, f.source_span)) facts[f.key] = f.value;
  return { balances, careItems, patterns, facts, dropped, engine };
}

// Deterministic extraction of the sample documents, used when no API key is configured.
function mockExtraction(): z.infer<typeof ExtractionSchema> {
  const b = (balance_id: string, category: (typeof CATEGORIES)[number], label: string, amount: number, deadline: string, source_doc: string, source_span: string, rule_text: string) =>
    ({ balance_id, category, label, amount, deadline, source_doc, source_span, rule_text });
  const fact = (key: (typeof FACT_KEYS)[number], value: number, source_doc: string, source_span: string) => ({ key, value, source_doc, source_span });
  return {
    balances: [
      b("fsa", "fsa", "Health FSA", 612, "2026-12-31", "benefits", "Current balance: $612.00", "Up to $640 of unused funds carries over into the 2027 plan year."),
      b("dental_max", "dental", "Unused dental maximum", 1350, "2026-12-31", "benefits", "Annual maximum: $1,500 — used to date: $150", "Annual maximum resets January 1, 2027."),
      b("oop_window", "deductible", "Deductible met, $400 left to out-of-pocket max", 400, "2026-12-31", "benefits", "Out-of-pocket maximum: $4,000 — applied to date: $3,600", "Deductible and out-of-pocket accumulators reset January 1, 2027."),
      b("dining", "dining", "Dining dollars", 412, "2026-12-14", "dining", "Balance: $412.00", "Unused dining dollars are forfeited and not refunded."),
      b("travel_credit", "card_credit", "Sapphire Reserve travel credit", 300, "2026-12-31", "cards", "annual travel credit: $300.00 remaining, expires December 31, 2026", "Credit expires December 31, 2026."),
      b("open_enrollment", "tax_window", "2027 FSA election (open enrollment)", 3400, "2026-11-21", "benefits", "Open enrollment for 2027 runs November 1 – November 21, 2026.", "FSA election limit for 2027: $3,400."),
    ],
    care_items: [
      { id: "fill14", kind: "dental", description: "Filling, tooth #14", fee: 125, coverage_pct: 80, source_doc: "dental_plan", source_span: "1. Filling, tooth #14 (D2391) — fee $125.00 — basic, 80% coverage" },
      { id: "fill19", kind: "dental", description: "Filling, tooth #19", fee: 125, coverage_pct: 80, source_doc: "dental_plan", source_span: "2. Filling, tooth #19 (D2391) — fee $125.00 — basic, 80% coverage" },
      { id: "crown3", kind: "dental", description: "Crown, tooth #3", fee: 1500, coverage_pct: 50, source_doc: "dental_plan", source_span: "3. Crown, tooth #3 (D2740) — fee $1,500.00 — major, 50% coverage" },
      { id: "crown30", kind: "dental", description: "Crown, tooth #30", fee: 1500, coverage_pct: 50, source_doc: "dental_plan", source_span: "4. Crown, tooth #30 (D2740) — fee $1,500.00 — major, 50% coverage" },
      { id: "mri", kind: "medical", description: "MRI lumbar spine (CPT 72148)", fee: 1800, coverage_pct: 80, source_doc: "eob", source_span: "Pending: MRI lumbar spine (CPT 72148), ordered Oct 2, 2026 by Dr. Rahul Patel, not yet performed. Estimated allowed amount: $1,800.00" },
    ],
    spend_patterns: [
      { category: "dining", weekly_avg: 29.5, source_doc: "dining", source_span: "Spending, last 8 weeks: $236.00 (average $29.50 per week)" },
    ],
    facts: [
      fact("fsa_carryover_limit", 640, "benefits", "Up to $640 of unused funds carries over"),
      fact("deductible", 2000, "benefits", "Annual deductible: $2,000 — met to date: $2,000"),
      fact("deductible_met", 2000, "benefits", "Annual deductible: $2,000 — met to date: $2,000"),
      fact("oop_max", 4000, "benefits", "Out-of-pocket maximum: $4,000 — applied to date: $3,600"),
      fact("oop_applied", 3600, "benefits", "Out-of-pocket maximum: $4,000 — applied to date: $3,600"),
      fact("coinsurance_member_pct", 20, "benefits", "Coinsurance after deductible: 20%"),
      fact("dental_annual_max", 1500, "benefits", "Annual maximum: $1,500 — used to date: $150"),
      fact("dental_used", 150, "benefits", "Annual maximum: $1,500 — used to date: $150"),
    ],
  };
}
