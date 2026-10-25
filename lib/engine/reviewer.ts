import { z } from "zod";
import type { AppState, Extraction, ReviewSubject, Verdict } from "../types";
import { claudeEnabled } from "./claude";
import { usd } from "./spans";
import { structured } from "./llm";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Verdicts are cached by exactly what Ruth saw (the proposal, the documents, the model), so the
// same claim on the same terms is never reviewed twice. Any change to either means a fresh review.
const CACHE = path.join(process.cwd(), ".data", "review-cache.json");
let cache: Record<string, Verdict> | null = null;
const readCache = () => (cache ??= (() => { try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; } })());
function remember(key: string, v: Verdict) {
  const c = readCache(); c[key] = v;
  const keys = Object.keys(c); if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete c[k];
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(c)); } catch { /* cache is best-effort */ }
}

export const RULES = [
  "Reject any care action not present in the uploaded treatment plan, EOB history, or preventive schedule. No new care, ever.",
  "Reject any purchase whose items do not appear in the user's transaction history or stated needs; let the balance lapse instead. \"Using it up\" is not a reason.",
  "Every recommendation carries a do-nothing cost, shown next to the action.",
  "Apply carryover and grace rules before computing forfeiture; never overstate the dying amount.",
  "Tax and plan-election suggestions are labeled options with tradeoffs, never advice.",
  "A dollar enters the ledger only on confirmed action (call completed, transfer posted). Pending counts for nothing.",
];

const VerdictSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  rule_cited: z.number().int().nullable(),
  reason: z.string(),
  modified_action: z.string().optional(),
});

const now = () => new Date().toISOString();
const verdict = (v: Omit<Verdict, "at" | "engine">): Verdict => ({ ...v, engine: "rules", at: now() });

// Deterministic checks run first and always win: a model can tighten a verdict, never loosen one.
export function ruleCheck(subject: ReviewSubject, ex: Extraction, docsText: string): Verdict {
  const hay = docsText.toLowerCase();
  if (subject.kind === "cart") {
    const missing = subject.items.filter((item) => !hay.includes(item.toLowerCase().replace(/s$/, "")));
    if (missing.length) {
      return verdict({ verdict: "reject", rule_cited: 2, reason: `${missing.join(", ")} ${missing.length > 1 ? "do" : "does"} not appear in your transaction history or stated needs. Buying ${missing.length > 1 ? "them" : "it"} just to use the balance is not a reason; let it lapse instead.` });
    }
    const carry = ex.facts.fsa_carryover_limit ?? 0;
    if (subject.balance.category === "fsa" && subject.balance.amount <= carry) {
      return verdict({ verdict: "reject", rule_cited: 4, reason: `Your ${usd(subject.balance.amount)} FSA balance is under the ${usd(carry)} carryover limit, so nothing is forfeiting. No reason to spend now.` });
    }
    return verdict({ verdict: "approve", rule_cited: null, reason: "Every item matches your history or stated needs." });
  }
  const t = subject.tile;
  if (t.live && t.action.kind !== "none" && !(t.doNothing && Number.isFinite(t.doNothingCost))) {
    return verdict({ verdict: "reject", rule_cited: 3, reason: "No do-nothing cost attached to this recommendation." });
  }
  if (t.category === "dental" || t.category === "deductible") {
    const known = new Set(ex.careItems.map((c) => c.id));
    const unknown = String(t.action.payload.careIds ?? "").split(",").filter((id) => id && !known.has(id));
    if (unknown.length) return verdict({ verdict: "reject", rule_cited: 1, reason: `Care item ${unknown.join(", ")} is not in your treatment plan or EOB history.` });
  }
  if ((t.category === "tax_window" || t.category === "idle_cash" || t.category === "insurance" || t.category === "hsa" || t.category === "espp") && !/options?/i.test(t.headline)) {
    return verdict({ verdict: "reject", rule_cited: 5, reason: "Plan-election suggestions must be labeled as options." });
  }
  return verdict({ verdict: "approve", rule_cited: null, reason: t.action.kind === "none" ? "Informational tile; nothing to dispatch." : "Uses only what's already in your documents, with the do-nothing cost shown." });
}

export async function review(subject: ReviewSubject, ex: Extraction, docsText: string, opts: { terms?: boolean } = {}): Promise<Verdict> {
  const rules = ruleCheck(subject, ex, docsText);
  if (rules.verdict === "reject" || !claudeEnabled()) return rules;
  const task = opts.terms ? "review_terms" : "review";
  const shown = subject.kind === "cart" ? { balance: subject.balance, items: subject.items } : { title: subject.tile.title, headline: subject.tile.headline, waits_for_user_answer: subject.tile.ask ?? null, candidates: subject.tile.candidates, tradeoff: subject.tile.tradeoff, action: subject.tile.action, do_nothing: subject.tile.doNothing, do_nothing_cost: subject.tile.doNothingCost };
  const effort = opts.terms ? (process.env.REVIEW_TERMS_EFFORT as "low" | "medium" | undefined) ?? "medium" : "medium";
  const key = crypto.createHash("sha256").update(JSON.stringify([task, effort, RULES, docsText, shown])).digest("hex").slice(0, 32);
  const hit = readCache()[key];
  if (hit) return { ...hit, at: now() };
  const out = await structured(task, {
    system: `You are the Reviewer for Expire. You gate every action before the user can tap it. Your job is to protect the user's money, not to help them spend it.
Rules (cite by number):
${RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}
How Expire works: you review a proposal before the user taps it. "savings" is what the ledger will record only if the action later confirms, so a proposal never books money by itself (rule 6 is enforced at dispatch, not here). payload.steps is the planned script, including the reply we expect; it is not evidence that anything happened. "Rescued" money includes forfeiting value the user chooses to send to someone else. Options tiles list their choices in candidates. If waits_for_user_answer is set, nothing happens until the user answers that question yes; a yes is their stated need, so judge the proposal as if they said yes.
Approve only if every rule holds. Reasons are one or two short sentences, readable at a glance.`,
    user: `Documents:\n${docsText}\n\nProposed ${subject.kind === "cart" ? "purchase" : "action"}:\n${JSON.stringify(shown)}`,
    schema: VerdictSchema,
    effort,
  });
  if (!out) return rules;
  const v: Verdict = { ...out, modified_action: out.modified_action, engine: "claude", at: now() };
  remember(key, v);
  return v;
}

const DefenseSchema = z.object({
  stance: z.enum(["hold", "acknowledge"]).describe("hold = the verdict stands; acknowledge = the user has a fair point about the wording or reasoning, but the verdict still stands until a document proves otherwise"),
  reply: z.string().describe("Two or three short sentences in Ruth's voice: plain, kind, firm"),
  rule_cited: z.number().int().nullable(),
});
export type Defense = z.infer<typeof DefenseSchema> & { engine: "claude" | "rules" };

// Ruth answers a pushback on one of her verdicts. She can explain and concede wording, never flip it.
export async function defend(key: string, v: Verdict, message: string, s: AppState): Promise<Defense> {
  const rule = v.rule_cited ? RULES[v.rule_cited - 1] : null;
  const fallback: Defense = {
    stance: "hold", engine: "rules", rule_cited: v.rule_cited,
    reply: `${v.reason}${rule ? ` That's rule ${v.rule_cited}: ${rule}` : ""} If something's changed, upload the document that shows it and I'll look again.`,
  };
  if (!claudeEnabled()) return fallback;
  const tile = s.tiles.find((t) => t.id === key);
  const out = await structured("defend", {
    system: `You are Ruth, the Reviewer in Benefit Borough. You protect people's money, not merchants'. A user is pushing back on one of your verdicts.
Rules (cite by number):
${RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}
You never change a verdict because someone argues; new facts must arrive as documents you can check. Explain your reasoning, admit it plainly if the user has a fair point about how you phrased something, and tell them exactly what document would change your mind. Never invent facts.`,
    user: `Your verdict: ${JSON.stringify(v)}\nWhat it was about: ${tile ? JSON.stringify({ title: tile.title, headline: tile.headline, do_nothing: tile.doNothing, action: tile.action.summary }) : key}\nThe user says: "${message}"`,
    schema: DefenseSchema,
    effort: "low",
  });
  return out ? { ...out, engine: "claude" } : fallback;
}
