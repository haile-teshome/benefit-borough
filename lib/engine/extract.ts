import { z } from "zod";
import type { SourceDoc } from "../documents";
import type { Balance, CareItem, Category, Extraction, SpendPattern } from "../types";
import { claudeEnabled } from "./claude";
import { DEMO_TODAY } from "../documents";
import { parseCsv, parseLines, statementYear } from "../statement/parse";
import { detect } from "../statement/detect";
import { libraryFindings } from "../library/build";
import { findSpan } from "./spans";
import { structured } from "./llm";

const CATEGORIES = [
  "fsa", "dental", "deductible", "dining", "card_credit", "tax_window",
  "bank_bonus", "bank_fee", "idle_cash", "annual_fee", "credit_move", "dispute", "rotating",
  "price_adjust", "fsa_claim", "promo_apr", "subscription", "points", "insurance", "vision", "hsa", "retirement", "pto", "stipend", "dcfsa", "espp", "fitness", "education",
] as const;

export const FACT_KEYS = [
  "fsa_carryover_limit",
  "deductible",
  "deductible_met",
  "oop_max",
  "oop_applied",
  "coinsurance_member_pct",
  "dental_annual_max",
  "dental_used",
  "checking_apy_pct",
  "credit_overlap_monthly",
  "price_now",
  "promo_balance",
] as const;

export const ExtractionSchema = z.object({
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

export const SYSTEM = `You extract expiring money from a person's benefits, insurance, dining and card documents.
Return every balance that expires, resets or forfeits by a deadline, every pending or planned care item with its fee, spending rates, and the plan parameters listed in the schema.
Rules:
- source_span must be copied verbatim from the document, character for character, and must contain the number you report. Spans that are not verbatim are discarded.
- Report only what the documents state. Never estimate a balance that is not written down.
- Dates are ISO (YYYY-MM-DD). source_doc is the document id given in its header.
- Categories: fsa, dental (unused annual maximum), deductible (met deductible / out-of-pocket window that resets), dining, card_credit, tax_window (an enrollment or election window).
- Facts: checking_apy_pct = the checking account's interest rate in percent; credit_overlap_monthly = the monthly price of a subscription billed to the wrong card (not the credit amount); price_now = an item's current lower price; promo_balance = the deferred-interest promo balance to pay off.
- From bank and card statements: bank_bonus (account bonus with a deadline), bank_fee (refundable fee), idle_cash (cash earning near-zero interest; amount = balance), annual_fee (fee refundable within a window), credit_move (a recurring charge on the wrong card while another card's monthly credit goes unused; amount = monthly credit), dispute (duplicate or wrong charge; amount = refund), rotating (bonus category not activated; amount = monthly spend in it), price_adjust (purchase now cheaper within a price-match window; amount = price paid), fsa_claim (eligible expense paid out of pocket; one balance per receipt), promo_apr (deferred interest that hits if the promo balance is not paid; amount = interest), subscription (trial or renewal about to bill; one balance per charge), points (miles or points about to expire; amount = points), insurance (policy renewal worth re-shopping; amount = premium).`;

export async function extract(docs: SourceDoc[]): Promise<Extraction> {
  const uploads = docs.filter((d) => d.id.startsWith("upload_"));
  const found = uploads.flatMap((d) => statementFindings(d));
  // Library plans are already structured, so their findings are computed, not extracted.
  const libs = docs.filter((d) => d.id.startsWith("lib_")).flatMap((d) => libraryFindings(d, DEMO_TODAY).map((f) => ({ f, d })));
  const libRaw = libs.map(({ f, d }) => ({ balance_id: f.id, category: f.category, label: f.label, amount: f.amount, deadline: f.deadline, source_doc: d.id, source_span: f.span, rule_text: f.rule }));
  const rest = docs.filter((d) => !d.id.startsWith("upload_") && !d.id.startsWith("lib_"));
  const ex = rest.length ? await extractDocs(rest, docs) : { balances: [], careItems: [], patterns: [], facts: {}, dropped: [], engine: "mock" as const };
  const extra = ground(docs, { balances: [...found, ...libRaw], care_items: [], spend_patterns: [], facts: [] }, ex.engine);
  for (const { f } of libs) for (const [k, v] of Object.entries(f.facts ?? {})) ex.facts[`${f.id}:${k}`] = v;
  return { ...ex, balances: [...ex.balances, ...extra.balances], dropped: [...ex.dropped, ...extra.dropped] };
}

// Uploaded statements go through the deterministic detectors (see lib/statement).
function statementFindings(d: SourceDoc) {
  const year = statementYear(d.text, +DEMO_TODAY.slice(0, 4));
  const csv = parseCsv(d.text, year);
  const txns = csv.length ? csv : parseLines(d.text, year);
  return detect(txns, d.id, DEMO_TODAY).map((f) => ({
    balance_id: f.id, category: f.category, label: f.label, amount: f.amount, deadline: f.deadline, source_doc: d.id, source_span: f.span, rule_text: f.rule,
  }));
}

async function extractDocs(docs: SourceDoc[], all: SourceDoc[]): Promise<Extraction> {
  if (claudeEnabled()) {
    const user = docs.map((d) => `<document id="${d.id}" name="${d.name}">\n${d.text}\n</document>`).join("\n\n");
    const out = await structured("extract", { system: SYSTEM, user, schema: ExtractionSchema, effort: "medium" });
    if (out) return ground(all, out, "claude");
  }
  // The mock knows the sample documents; skip any that were replaced (e.g. by an uploaded statement).
  const have = new Set(docs.map((d) => d.id));
  const m = mockExtraction();
  const keep = <T extends { source_doc: string }>(xs: T[]) => xs.filter((x) => have.has(x.source_doc));
  return ground(docs, { balances: keep(m.balances), care_items: keep(m.care_items), spend_patterns: keep(m.spend_patterns), facts: keep(m.facts) }, "mock");
}

// Attach real character offsets to every claim; drop any claim whose span is not in a document.
export function ground(docs: SourceDoc[], raw: z.infer<typeof ExtractionSchema>, engine: "claude" | "mock"): Extraction {
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
export function mockExtraction(): z.infer<typeof ExtractionSchema> {
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
      b("bonus", "bank_bonus", "Chase checking $300 bonus", 300, "2026-11-08", "statements", "New-account bonus: $300.00 after a qualifying direct deposit within 90 days of opening (by November 8, 2026).", "Bonus requires a direct deposit by November 8, 2026."),
      b("od_fee", "bank_fee", "Overdraft fee", 35, "2026-11-23", "statements", "Oct 14  Overdraft fee  $35.00 (first overdraft in 12 months)", "First overdraft in 12 months: banks usually refund on request."),
      b("svc_fee", "bank_fee", "Monthly service fee", 12, "2026-11-23", "statements", "Oct 1   Monthly service fee  $12.00 (waived with $500+ in monthly direct deposits)", "Waived with $500+ in monthly direct deposits."),
      b("idle", "idle_cash", "Checking earning 0.01%", 8240, "2026-12-31", "statements", "Average daily balance: $8,240.00   Interest rate: 0.01% APY", "Interest accrues daily; time out of a savings account is not recoverable."),
      b("gold_fee", "annual_fee", "Amex Gold annual fee", 325, "2026-11-05", "statements", "Oct 6   Annual membership fee  $325.00. Cancel or downgrade within 30 days of the fee posting for a full refund (by November 5, 2026).", "Full refund if downgraded within 30 days of the fee posting."),
      b("plat_ent", "credit_move", "Platinum digital entertainment credit", 25, "2026-11-30", "statements", "Digital entertainment credit: $25.00 per month. Unused monthly credits do not roll over.", "Unused monthly credits do not roll over."),
      b("dupe", "dispute", "Duplicate Uber Eats charge", 42.17, "2026-12-23", "statements", "Oct 19  Uber Eats  $42.17 (same merchant, amount and minute)", "Billing disputes must be submitted within 60 days of the statement date."),
      b("q4", "rotating", "Freedom Flex Q4 5% on Amazon", 120, "2026-12-14", "statements", "Amazon spending: about $120.00 per month.", "Q4 5% categories must be activated by December 14, 2026."),
      b("airpods", "price_adjust", "AirPods Pro price drop", 249, "2026-10-26", "statements", "Oct 12  Target — AirPods Pro  $249.00. Target now lists them at $199.00. Price match within 14 days of purchase (by October 26, 2026).", "Price match within 14 days of purchase."),
      b("rx_cvs", "fsa_claim", "CVS prescription", 64.3, "2027-03-31", "statements", "Sep 28  CVS Pharmacy — prescription  $64.30 (paid with personal card)", "FSA claims for 2026 expenses can be submitted until March 31, 2027."),
      b("rx_wag", "fsa_claim", "Walgreens prescription", 28.15, "2027-03-31", "statements", "Oct 3   Walgreens — prescription  $28.15 (paid with personal card)", "FSA claims for 2026 expenses can be submitted until March 31, 2027."),
      b("bestbuy", "promo_apr", "Best Buy deferred interest", 286.2, "2026-11-30", "statements", "Deferred-interest promo balance: $1,140.00. Pay in full by November 30, 2026 or $286.20 of accrued interest is charged.", "All accrued interest is charged if the promo balance is not paid in full by the date."),
      b("hulu", "subscription", "Hulu trial converts", 17.99, "2026-11-02", "statements", "Hulu free trial ends November 2, 2026, then $17.99/month.", "Bills monthly after the trial unless canceled."),
      b("duolingo", "subscription", "Duolingo Super renewal", 89.99, "2026-11-09", "statements", "Duolingo Super annual renewal on November 9, 2026: $89.99. Last opened: June 2026.", "Renews annually unless canceled before the date."),
      b("aa_miles", "points", "AAdvantage miles", 31500, "2027-01-09", "statements", "AAdvantage: 31,500 miles. Miles expire January 9, 2027 after 24 months with no activity.", "Any earning activity resets the 24-month clock."),
      b("geico", "insurance", "GEICO auto renewal", 1284, "2026-11-18", "statements", "GEICO auto policy renews November 18, 2026: $1,284.00 for 6 months (up 22% from the last term).", "Renews automatically at the new rate."),
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
      fact("checking_apy_pct", 0.01, "statements", "Interest rate: 0.01% APY"),
      fact("credit_overlap_monthly", 15.99, "statements", "Disney+ $15.99/month is billed to Freedom Flex, not Platinum."),
      fact("price_now", 199, "statements", "Target now lists them at $199.00."),
      fact("promo_balance", 1140, "statements", "Deferred-interest promo balance: $1,140.00."),
    ],
  };
}
