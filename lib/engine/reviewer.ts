import { z } from "zod";
import type { Extraction, ReviewSubject, Verdict } from "../types";
import { callStructured, claudeEnabled } from "./claude";
import { usd } from "./spans";

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
  if (t.category === "tax_window" && !/options?/i.test(t.headline)) {
    return verdict({ verdict: "reject", rule_cited: 5, reason: "Plan-election suggestions must be labeled as options." });
  }
  return verdict({ verdict: "approve", rule_cited: null, reason: t.action.kind === "none" ? "Informational tile; nothing to dispatch." : "Uses only care and needs already in your documents, with the do-nothing cost shown." });
}

export async function review(subject: ReviewSubject, ex: Extraction, docsText: string): Promise<Verdict> {
  const rules = ruleCheck(subject, ex, docsText);
  if (rules.verdict === "reject" || !claudeEnabled()) return rules;
  const out = await callStructured({
    system: `You are the Reviewer for Expire. You gate every action before the user can tap it. Your job is to protect the user's money, not to help them spend it.
Rules (cite by number):
${RULES.map((r, i) => `${i + 1}. ${r}`).join("\n")}
Approve only if every rule holds. Reasons are one or two short sentences, readable at a glance.`,
    user: `Documents:\n${docsText}\n\nProposed ${subject.kind === "cart" ? "purchase" : "action"}:\n${JSON.stringify(
      subject.kind === "cart" ? { balance: subject.balance, items: subject.items } : { title: subject.tile.title, headline: subject.tile.headline, action: subject.tile.action, do_nothing: subject.tile.doNothing },
    )}`,
    schema: VerdictSchema,
    effort: "medium",
  });
  if (!out) return rules;
  return { ...out, modified_action: out.modified_action, engine: "claude", at: now() };
}
