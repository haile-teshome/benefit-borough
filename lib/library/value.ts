import { LIBRARY, type Plan } from "./catalog";

// What a plan is worth over a year if you use it, for the Almanac's what-if projections.
// Card fees are listed only where the research confirmed them.
const FEES: Record<string, number> = { "amex-platinum-2026": 895, "amex-gold-2026": 325, "venture-x-2026": 395, "citi-strata-elite-2026": 595 };
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, "calendar year": 1, "2026 only": 1 };

export type Yearly = { gross: number; fee: number | null; note: string };

export function yearlyValue(p: Plan): Yearly | null {
  if (p.credits) {
    const gross = p.credits.reduce((s, c) => s + c.amount * (PER_YEAR[c.cadence] ?? 1), 0);
    return { gross, fee: FEES[p.id] ?? null, note: `${p.credits.length} credits a year if you'd use every one` };
  }
  if (p.id === "venture-x-2026") return { gross: 400, fee: FEES[p.id], note: "$300 travel credit + 10,000 anniversary miles (about $100)" };
  if (p.id === "ucb-ship-2026") return { gross: 115, fee: null, note: "vision allowance net of copays; cleanings are free" };
  return null; // depends entirely on your balances (FSA, HSA, dining, points)
}

export const whatIfPlans = (planted: Set<string>) => LIBRARY.filter((p) => !planted.has(p.id) && yearlyValue(p));
