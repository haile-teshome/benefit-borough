import { z } from "zod";
import { DEMO_TODAY } from "../documents";
import type { Balance, Candidate, CareItem, Extraction, Span, Tile } from "../types";
import { callStructured, claudeEnabled } from "./claude";
import { daysBetween, usd } from "./spans";

// Calculators do the arithmetic; Claude (when configured) only chooses among candidates and
// writes the explanation. The numbers on screen never come from a model.

export type DentalPlan = { thisYear: CareItem[]; nextYear: CareItem[]; patientCost: number; insurerPays: number };

const covered = (items: CareItem[]) => items.reduce((s, i) => s + (i.fee * i.coveragePct) / 100, 0);
const fees = (items: CareItem[]) => items.reduce((s, i) => s + i.fee, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function dentalPlan(items: CareItem[], nextYearMask: number, remainingThisYear: number, annualMax: number): DentalPlan {
  const thisYear = items.filter((_, i) => !(nextYearMask & (1 << i)));
  const nextYear = items.filter((_, i) => nextYearMask & (1 << i));
  const pay1 = Math.min(covered(thisYear), remainingThisYear);
  const pay2 = Math.min(covered(nextYear), annualMax);
  const insurerPays = round2(pay1 + pay2);
  return { thisYear, nextYear, insurerPays, patientCost: round2(fees(items) - insurerPays) };
}

// Best split of the treatment plan across the two plan years; ties go to moving fewer items.
export function bestDentalSplit(items: CareItem[], remainingThisYear: number, annualMax: number): DentalPlan {
  let best: DentalPlan | null = null;
  let bestMoved = Infinity;
  for (let mask = 0; mask < 1 << items.length; mask++) {
    const p = dentalPlan(items, mask, remainingThisYear, annualMax);
    const moved = p.nextYear.length;
    if (!best || p.patientCost < best.patientCost - 0.005 || (Math.abs(p.patientCost - best.patientCost) < 0.005 && moved < bestMoved)) {
      best = p;
      bestMoved = moved;
    }
  }
  return best!;
}

export function mriCost(fee: number, f: Record<string, number>) {
  const coins = (f.coinsurance_member_pct ?? 20) / 100;
  const deductibleLeft = Math.max(0, (f.deductible ?? 0) - (f.deductible_met ?? 0));
  const oopLeft = Math.max(0, (f.oop_max ?? Infinity) - (f.oop_applied ?? 0));
  const thisYear = Math.min(Math.min(fee, deductibleLeft) + coins * Math.max(0, fee - deductibleLeft), oopLeft);
  const ded = f.deductible ?? 0;
  const nextYear = Math.min(Math.min(fee, ded) + coins * Math.max(0, fee - ded), f.oop_max ?? Infinity);
  return { thisYear: round2(thisYear), nextYear: round2(nextYear) };
}

export function diningSurplus(balance: number, weeklyAvg: number, daysLeft: number) {
  const projected = round2((weeklyAvg * daysLeft) / 7);
  const surplus = Math.max(0, round2(balance - projected));
  return { projected, surplus, transfer: Math.floor(surplus / 5) * 5 };
}

export async function optimize(ex: Extraction): Promise<Tile[]> {
  const f = ex.facts;
  const tiles: Tile[] = [];
  const by = (c: Balance["category"]) => ex.balances.find((b) => b.category === c);
  const base = (b: Balance, extra: Span[] = []) => {
    const daysLeft = daysBetween(DEMO_TODAY, b.deadline);
    return { balanceIds: [b.id], deadline: b.deadline, daysLeft, sources: [b.source, ...extra], engine: "mock" as const };
  };

  const dental = by("dental");
  const dentalItems = ex.careItems.filter((c) => c.kind === "dental");
  if (dental && dentalItems.length) {
    const max = f.dental_annual_max ?? dental.amount;
    const remaining = Math.max(0, max - (f.dental_used ?? 0));
    const asPlanned = dentalPlan(dentalItems, 0, remaining, max);
    const best = bestDentalSplit(dentalItems, remaining, max);
    const allNext = dentalPlan(dentalItems, (1 << dentalItems.length) - 1, 0, max);
    const savings = round2(asPlanned.patientCost - best.patientCost);
    const moved = best.nextYear.map((i) => i.description).join(" and ");
    const candidates: Candidate[] = [
      { id: "as_planned", label: "Everything in 2026, as the office planned", costToUser: asPlanned.patientCost, detail: `Insurance pays ${usd(asPlanned.insurerPays)}; the ${usd(remaining)} 2026 maximum caps it.` },
      { id: "phase", label: best.nextYear.length ? `Phase: ${moved} in January` : "Everything in 2026", costToUser: best.patientCost, detail: `2026 pays ${usd(Math.min(covered(best.thisYear), remaining))}, 2027 pays ${usd(Math.min(covered(best.nextYear), max))}. No new care: same four procedures.` },
      { id: "wait", label: "Wait and do it all in 2027", costToUser: allNext.patientCost, detail: `Forfeits the ${usd(remaining)} left in 2026 and delays care.` },
    ];
    const book = best.thisYear.map((i) => i.description).join(", ");
    tiles.push({
      id: "tile_dental", category: "dental", title: "Dental: split the treatment plan across plan years",
      ...base(dental, dentalItems.map((i) => i.source)), live: true,
      atStake: savings, candidates, recommendation: "phase",
      headline: `Phase the plan: ${usd(asPlanned.patientCost)} becomes ${usd(best.patientCost)}.`,
      tradeoff: best.nextYear.length ? `${moved} waits until January, so two visits instead of one. Ask Dr. Okafor if the delay is clinically fine.` : "No tradeoff.",
      doNothingCost: savings, doNothing: `Doing it all this year as planned costs ${usd(asPlanned.patientCost)}: the ${usd(remaining)} cap leaves ${usd(savings)} of coverage unused.`,
      action: { kind: "book_call", summary: `Call Bright Smile Dental to book ${book} before Dec 31 and ${moved || "nothing"} in January`, savings,
        payload: { careIds: dentalItems.map((i) => i.id).join(","), to: "Bright Smile Dental", phone: "(510) 555-0142", patient: "Jordan Lee", thisYear: book, nextYear: moved, date: "2026-12-29", nextDate: "2027-01-12" } },
    });
  }

  const oop = by("deductible");
  const mri = ex.careItems.find((c) => c.kind === "medical");
  if (oop && mri) {
    const cost = mriCost(mri.fee, f);
    const savings = round2(cost.nextYear - cost.thisYear);
    tiles.push({
      id: "tile_deductible", category: "deductible", title: "Deductible met: the ordered MRI is cheaper before Jan 1",
      ...base(oop, [mri.source]), live: true, atStake: savings,
      candidates: [
        { id: "before_reset", label: "MRI before Dec 31", costToUser: cost.thisYear, detail: `Deductible met; you pay 20% capped by the ${usd(oop.amount)} left to the out-of-pocket max.` },
        { id: "after_reset", label: "MRI in January", costToUser: cost.nextYear, detail: "Deductible resets Jan 1, so the full allowed amount falls in it." },
      ],
      recommendation: "before_reset",
      headline: `Do the MRI Dr. Patel already ordered before Dec 31: ${usd(cost.thisYear)} instead of ${usd(cost.nextYear)}.`,
      tradeoff: "Only care that is already ordered. Nothing new is suggested to use up the window.",
      doNothingCost: savings, doNothing: `If it slips to January it costs ${usd(cost.nextYear)}.`,
      action: { kind: "book_call", summary: "Call Bay Imaging Center to schedule the ordered MRI before Dec 31", savings,
        payload: { careIds: mri.id, to: "Bay Imaging Center", phone: "(510) 555-0199", patient: "Jordan Lee", thisYear: mri.description, nextYear: "", date: "2026-12-16", nextDate: "" } },
    });
  }

  const dining = by("dining");
  const pace = ex.patterns.find((p) => p.category === "dining");
  if (dining && pace) {
    const b = base(dining, [pace.source]);
    const s = diningSurplus(dining.amount, pace.weeklyAvg, b.daysLeft);
    tiles.push({
      id: "tile_dining", category: "dining", title: "Dining dollars: transfer the surplus before Dec 14",
      ...b, live: true, atStake: s.surplus,
      candidates: [
        { id: "transfer", label: `Keep ${usd(round2(dining.amount - s.transfer))} for your meals, transfer ${usd(s.transfer)} to a classmate`, costToUser: 0, detail: `At ${usd(pace.weeklyAvg)}/week you will spend about ${usd(s.projected)} by Dec 14.` },
        { id: "nothing", label: "Do nothing", costToUser: s.surplus, detail: `${usd(s.surplus)} forfeits Dec 14.` },
      ],
      recommendation: "transfer",
      headline: `You'll use about ${usd(s.projected)}; ${usd(s.surplus)} would forfeit. Send ${usd(s.transfer)} to a classmate.`,
      tradeoff: "We don't suggest buying extra food to burn the balance. Transfers are final.",
      doNothingCost: s.surplus, doNothing: `${usd(s.surplus)} is forfeited on Dec 14 and not refunded.`,
      action: { kind: "transfer", summary: `Transfer ${usd(s.transfer)} of dining dollars to a peer`, savings: s.transfer,
        payload: { amount: s.transfer, rail: "x402", to: "peer wallet (Cal Dining transfer program)" } },
    });
  }

  const fsa = by("fsa");
  if (fsa) {
    const carry = f.fsa_carryover_limit ?? 0;
    const forfeit = Math.max(0, round2(fsa.amount - carry));
    tiles.push({
      id: "tile_fsa", category: "fsa", title: forfeit ? "FSA: spend on real needs before Dec 31" : "FSA: your balance is safe",
      ...base(fsa), live: true, atStake: forfeit,
      candidates: [{ id: "carry", label: "Let it carry over", costToUser: 0, detail: `Up to ${usd(carry)} carries into 2027.` }],
      recommendation: "carry",
      headline: forfeit ? `${usd(forfeit)} forfeits after carryover.` : `${usd(fsa.amount)} is under the ${usd(carry)} carryover limit. Nothing forfeits.`,
      tradeoff: "Carryover applied before computing forfeiture (rule 4).",
      doNothingCost: forfeit, doNothing: forfeit ? `${usd(forfeit)} lost Dec 31.` : "Nothing is lost; it rolls into 2027.",
      action: { kind: "none", summary: "No action needed", savings: 0, payload: {} },
    });
  }

  const card = by("card_credit");
  if (card) {
    tiles.push({
      id: "tile_card", category: "card_credit", title: "Travel credit: put the Seattle flight on Sapphire",
      ...base(card), live: false, atStake: card.amount,
      candidates: [{ id: "use", label: "Book the Dec 20 Seattle flight on Sapphire Reserve", costToUser: 0, detail: "You said you're flying home Dec 20; the credit applies automatically." }],
      recommendation: "use",
      headline: `Book the Dec 20 flight you already planned on Sapphire Reserve; the ${usd(card.amount)} credit covers part of it.`,
      tradeoff: "Only because the trip is a stated need. We would not suggest a trip to use a credit.",
      doNothingCost: card.amount, doNothing: `${usd(card.amount)} credit expires Dec 31.`,
      action: { kind: "none", summary: "Static suggestion (detected tile)", savings: 0, payload: {} },
    });
  }

  const oe = by("tax_window");
  if (oe) {
    tiles.push({
      id: "tile_tax", category: "tax_window", title: "Open enrollment: 2027 FSA election",
      ...base(oe), live: false, atStake: 0,
      candidates: [
        { id: "lower", label: "Option: elect closer to what you actually spend", costToUser: 0, detail: "Less tax saved, less to forfeit." },
        { id: "same", label: "Option: keep this year's election", costToUser: 0, detail: "More tax saved; with $640 carryover the downside is capped." },
      ],
      recommendation: "lower",
      headline: "Options, not advice: the window runs Nov 1 – Nov 21.",
      tradeoff: "Labeled options with tradeoffs (rule 5). Talk to HR or a tax professional for advice.",
      doNothingCost: 0, doNothing: "Your current election rolls over by default at most employers; check yours.",
      action: { kind: "none", summary: "Static suggestion (detected tile)", savings: 0, payload: {} },
    });
  }

  const score = (t: Tile) => t.atStake / Math.sqrt(Math.max(t.daysLeft, 1));
  tiles.sort((a, b) => score(b) - score(a));
  return claudeEnabled() ? narrate(tiles) : tiles;
}

const NarrationSchema = z.object({
  tiles: z.array(z.object({ tile_id: z.string(), recommendation: z.string(), headline: z.string(), tradeoff: z.string() })),
});

// Claude picks among calculator candidates and writes the copy. It cannot change a number.
async function narrate(tiles: Tile[]): Promise<Tile[]> {
  const live = tiles.filter((t) => t.live);
  const out = await callStructured({
    system: `You are the Optimize step of Expire, which rescues expiring money. For each tile, pick the best candidate id and write a one-sentence headline and a one-sentence tradeoff for a stressed student.
Use only the dollar figures given; never compute new ones. Never recommend new care or new purchases. Plain words, no exclamation marks.`,
    user: JSON.stringify(live.map((t) => ({ tile_id: t.id, title: t.title, candidates: t.candidates, do_nothing: t.doNothing }))),
    schema: NarrationSchema,
    effort: "low",
  });
  if (!out) return tiles;
  return tiles.map((t) => {
    const n = out.tiles.find((x) => x.tile_id === t.id);
    // If Claude disagrees with the calculator's pick, keep the calculator's copy: the action is tied to it.
    if (!n || n.recommendation !== t.recommendation) return t;
    return { ...t, headline: n.headline, tradeoff: n.tradeoff, engine: "claude" };
  });
}
