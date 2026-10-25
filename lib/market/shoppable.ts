import type { AppState, Balance } from "../types";

// Benefits you can spend on a purchase (so the Bazaar can shop for them), with money left. The
// amount is what you can spend (e.g. your whole FSA balance), not just the part at risk.
// (Dependent care FSA pays for childcare, not goods, so it isn't here.)
const SHOPPABLE = new Set(["fsa", "hsa", "stipend", "card_credit", "dining", "vision", "fitness"]);
export const shoppable = (s: Pick<AppState, "extraction" | "done">): Balance[] =>
  (s.extraction?.balances ?? [])
    .filter((b) => SHOPPABLE.has(b.category) && b.category !== "hsa" && !s.done.includes(`tile_${b.id}`))
    .map((b) => ({ ...b, amount: s.extraction?.facts[`${b.id}:balance`] ?? b.amount }))
    .filter((b) => b.amount > 0);
