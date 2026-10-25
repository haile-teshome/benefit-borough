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
  const surplus = Math.max(0, Math.round(balance - projected));
  return { projected, surplus, transfer: Math.floor(surplus / 5) * 5 };
}

export async function optimize(ex: Extraction): Promise<Tile[]> {
  const f = ex.facts;
  const tiles: Tile[] = [];
  // These builders read the sample documents; uploads and library plans have their own below.
  const by = (c: Balance["category"]) => ex.balances.find((b) => b.category === c && !b.id.startsWith("up_") && !b.id.startsWith("lib_"));
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
        { id: "transfer", label: `Keep ${usd(round2(dining.amount - s.transfer))} for your meals, transfer ${usd(s.transfer)} to a classmate`, costToUser: 0, detail: `At ${usd(pace.weeklyAvg)}/week you will spend about ${usd(Math.round(s.projected))} by Dec 14.` },
        { id: "nothing", label: "Do nothing", costToUser: s.surplus, detail: `${usd(s.surplus)} forfeits Dec 14.` },
      ],
      recommendation: "transfer",
      headline: `You'll use about ${usd(Math.round(s.projected))}; about ${usd(Math.round(s.surplus))} would forfeit. Send ${usd(s.transfer)} to a classmate.`,
      tradeoff: "We don't suggest buying extra food to burn the balance. Transfers are final.",
      doNothingCost: s.surplus, doNothing: `${usd(s.surplus)} is forfeited on Dec 14 and not refunded.`,
      action: { kind: "transfer", summary: `Transfer ${usd(s.transfer)} of dining dollars to a peer`, savings: s.transfer,
        payload: { amount: s.transfer, rail: "Cal Dining peer transfer", to: "a classmate you choose" } },
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
        { id: "same", label: "Option: keep this year's election", costToUser: 0, detail: "More tax saved; up to $640 unused carries over and anything beyond that is forfeited." },
      ],
      recommendation: "lower",
      headline: "Options, not advice: the window runs Nov 1 – Nov 21.",
      tradeoff: "Labeled options with tradeoffs (rule 5). Talk to HR or a tax professional for advice.",
      doNothingCost: 0, doNothing: "At most employers an FSA election does not carry into the next year: skip enrollment and you have no FSA in 2027. Check your plan.",
      action: { kind: "none", summary: "Static suggestion (detected tile)", savings: 0, payload: {} },
    });
  }

  tiles.push(...statementTiles(ex), ...uploadTiles(ex), ...libraryTiles(ex));

  const score = (t: Tile) => t.atStake / Math.sqrt(Math.max(t.daysLeft, 1));
  tiles.sort((a, b) => score(b) - score(a));
  return claudeEnabled() ? narrate(tiles) : tiles;
}

// ---------- bank and card statements ----------

// What a mile is worth when redeemed for a flight; conservative published valuations run 1.2-1.6 cents.
export const MILE_CENTS = 1.3;
// The high-yield rate we compare idle cash against. A labeled assumption, not a quote.
export const HYSA_APY = 4.0;
const CASH_BUFFER = 2000;

export function idleCashGain(balance: number, apyPct: number, daysLeft: number) {
  const movable = Math.max(0, balance - CASH_BUFFER);
  return { movable, gain: round2((movable * (HYSA_APY - apyPct)) / 100 * (daysLeft / 365)) };
}

export function rotatingBonus(monthlySpend: number, daysLeft: number) {
  // The card already earns 1%; activation adds 4 points on the category through the quarter.
  return round2(((monthlySpend * daysLeft) / 30.4) * 0.04);
}

type Req = { title: string; to: string; steps: string[]; confirmation: string };
const request = (summary: string, savings: number, r: Req) =>
  ({ kind: "request" as const, summary, savings: round2(savings), payload: { title: r.title, to: r.to, steps: r.steps.join("|"), confirmation: r.confirmation } });

function statementTiles(ex: Extraction): Tile[] {
  const f = ex.facts;
  const all = (c: Balance["category"]) => ex.balances.filter((b) => b.category === c && !b.id.startsWith("up_") && !b.id.startsWith("lib_"));
  const one = (c: Balance["category"]) => all(c)[0];
  const base = (bs: Balance[]) => {
    const deadline = bs.map((b) => b.deadline).sort()[0];
    return { balanceIds: bs.map((b) => b.id), deadline, daysLeft: daysBetween(DEMO_TODAY, deadline), sources: bs.map((b) => b.source), engine: "mock" as const };
  };
  const out: Tile[] = [];
  const add = (t: Omit<Tile, "balanceIds" | "deadline" | "daysLeft" | "sources" | "engine">, bs: Balance[]) => out.push({ ...base(bs), ...t });

  const bonus = one("bank_bonus");
  if (bonus) add({
    id: "tile_bonus", category: "bank_bonus", title: "Checking bonus: route $500 of your paycheck to Chase",
    live: true, atStake: bonus.amount,
    candidates: [
      { id: "split", label: "Send $500 of each paycheck to Chase, the rest stays at Wells Fargo", costToUser: 0, detail: "One qualifying direct deposit before Nov 8 earns the bonus." },
      { id: "nothing", label: "Do nothing", costToUser: bonus.amount, detail: "No direct deposit by Nov 8, no bonus." },
    ],
    recommendation: "split",
    headline: `One $500 direct deposit before Nov 8 earns the ${usd(bonus.amount)} bonus.`,
    tradeoff: "Keep the account open 6 months after the bonus posts or it can be clawed back.",
    doNothingCost: bonus.amount, doNothing: `The ${usd(bonus.amount)} bonus window closes Nov 8.`,
    action: request("Submit a split direct-deposit form to Acme payroll", bonus.amount, { title: "Filing with Acme payroll", to: "Acme payroll portal", steps: ["Opening Acme payroll → Direct deposit", "Adding Chase Total Checking for $500 per paycheck", "Remainder stays at Wells Fargo", "Payroll: change effective with the Oct 31 paycheck"], confirmation: "DD-ACME-1031" }),
  }, [bonus]);

  const fees = all("bank_fee");
  if (fees.length) {
    const sum = round2(fees.reduce((s, b) => s + b.amount, 0));
    add({
      id: "tile_fees", category: "bank_fee", title: "Bank fees: ask Chase to refund them",
      live: true, atStake: sum,
      candidates: [{ id: "ask", label: "Ask for a courtesy refund of both fees", costToUser: 0, detail: "First overdraft in 12 months; banks routinely refund it once." }],
      recommendation: "ask",
      headline: `Ask Chase to reverse ${usd(sum)} in fees: a first-time overdraft and a service fee.`,
      tradeoff: "Courtesy refunds are discretionary; set up the direct deposit so the service fee stops.",
      doNothingCost: sum, doNothing: `${usd(sum)} stays charged.`,
      action: request("Message Chase to request a courtesy fee refund", sum, { title: "Messaging Chase support", to: "Chase secure message", steps: ["Expire: Hi, I was charged a $35 overdraft fee on Oct 14, my first in a year, and a $12 service fee. Could you refund them?", "Chase: Thanks for being a customer. We've refunded both fees as a one-time courtesy.", "Credit of $47.00 posting in 1-2 business days"], confirmation: "CH-RFD-1024" }),
    }, fees);
  }

  const gold = one("annual_fee");
  if (gold) add({
    ask: "Will you use Gold's dining and Uber credits in the next year?",
    id: "tile_annual_fee", category: "annual_fee", title: "Amex Gold: you used $0 of its credits; downgrade before Nov 5",
    live: true, atStake: gold.amount,
    candidates: [
      { id: "downgrade", label: "Downgrade to the no-fee Amex Green Basic, keep the account history", costToUser: 0, detail: `The ${usd(gold.amount)} fee is refunded in full inside the 30-day window.` },
      { id: "keep", label: "Keep Gold", costToUser: gold.amount, detail: "Worth it only if you will use the $424 of dining and Uber credits you haven't touched." },
    ],
    recommendation: "downgrade",
    headline: `You used $0 of Gold's $424 in credits. Downgrading by Nov 5 refunds the ${usd(gold.amount)} fee.`,
    tradeoff: "You lose 4x points on dining. Downgrade instead of closing so your credit history stays.",
    doNothingCost: gold.amount, doNothing: `After Nov 5 the ${usd(gold.amount)} fee is final for the year.`,
    action: { kind: "book_call", summary: "Call Amex to downgrade Gold and refund the annual fee", savings: gold.amount,
      payload: { to: "American Express", phone: "(800) 528-4800", patient: "Jordan Lee", thisYear: "a product change from Gold to a no-fee card with the annual fee refunded", nextYear: "", date: "2026-10-27", nextDate: "" } },
  }, [gold]);

  const move = one("credit_move");
  const overlap = f.credit_overlap_monthly;
  if (move && overlap) {
    const months = 2; // November and December credits are still ahead
    const save = round2(Math.min(move.amount, overlap) * months);
    add({
      id: "tile_credit_move", category: "credit_move", title: "Move Disney+ to Platinum to use its monthly credit",
      live: true, atStake: save,
      candidates: [{ id: "move", label: "Bill Disney+ to Platinum", costToUser: 0, detail: `The ${usd(move.amount)} monthly credit covers the ${usd(overlap)} charge.` }],
      recommendation: "move",
      headline: `Disney+ is on Freedom while Platinum's ${usd(move.amount)} monthly credit goes unused. Switch it: ${usd(save)} back this year.`,
      tradeoff: "Same subscription you already pay for; nothing new is bought.",
      doNothingCost: save, doNothing: `${usd(save)} of credits lapse by Dec 31.`,
      action: request("Change Disney+ billing to Amex Platinum", save, { title: "Updating Disney+ billing", to: "Disney+ account", steps: ["Opening Disney+ → Account → Payment", "Replacing Freedom Flex with Amex Platinum", "Next charge Nov 15 on Platinum, credited back automatically"], confirmation: "DSNY-PMT-1115" }),
    }, [move]);
  }

  const dupe = one("dispute");
  if (dupe) add({
    id: "tile_dispute", category: "dispute", title: "Dispute the duplicate Uber Eats charge",
    live: true, atStake: dupe.amount,
    candidates: [{ id: "dispute", label: "Dispute the second charge", costToUser: 0, detail: "Same merchant, amount and minute." }],
    recommendation: "dispute",
    headline: `Uber Eats charged you ${usd(dupe.amount)} twice on Oct 19. Dispute the copy before Dec 23.`,
    tradeoff: "Only the duplicate; the first order was real.",
    doNothingCost: dupe.amount, doNothing: `After Dec 23 the ${usd(dupe.amount)} can't be disputed.`,
    action: request("File a billing dispute for the duplicate charge", dupe.amount, { title: "Filing a dispute with Chase", to: "Chase disputes", steps: ["Selecting Oct 19 Uber Eats $42.17 (second charge)", "Reason: duplicate charge", "Chase: provisional credit issued while we review"], confirmation: "DSP-1019-UBR" }),
  }, [dupe]);

  const q4 = one("rotating");
  if (q4) {

    const gain = rotatingBonus(q4.amount, daysBetween(DEMO_TODAY, "2026-12-31"));
    add({
      id: "tile_rotating", category: "rotating", title: "Activate Freedom's 5% on Amazon for Q4",
      live: true, atStake: gain,
      candidates: [{ id: "activate", label: "Activate, keep shopping as usual", costToUser: 0, detail: `About ${usd(q4.amount)}/month on Amazon earns 5% instead of 1%.` }],
      recommendation: "activate",
      headline: `One tap: your usual Amazon spending earns ${usd(gain)} more this quarter.`,
      tradeoff: "Don't buy more to chase points; this counts only what you already spend.",
      doNothingCost: gain, doNothing: `${usd(gain)} of bonus cash back is skipped. Activation closes Dec 14.`,
      action: request("Activate Freedom Flex Q4 categories", gain, { title: "Activating 5% categories", to: "Chase app", steps: ["Opening Freedom Flex → Activate 5%", "Q4: Amazon, PayPal — activated"], confirmation: "Q4-ACT-2026" }),
    }, [q4]);
  }

  const pod = one("price_adjust");
  if (pod && f.price_now) {
    const diff = round2(pod.amount - f.price_now);
    add({
      id: "tile_price", category: "price_adjust", title: "Target dropped the AirPods price: claim the $50",
      live: true, atStake: diff,
      candidates: [{ id: "match", label: "Request Target's price match", costToUser: 0, detail: `Paid ${usd(pod.amount)}, now ${usd(f.price_now)}.` }],
      recommendation: "match",
      headline: `You paid ${usd(pod.amount)}; Target now sells them for ${usd(f.price_now)}. Ask for ${usd(diff)} back by Oct 26.`,
      tradeoff: "Same item you already own; nothing to return.",
      doNothingCost: diff, doNothing: `The price-match window closes Oct 26.`,
      action: request("Request a Target price adjustment", diff, { title: "Chatting with Target", to: "Target guest services", steps: ["Expire: Hi, I bought AirPods Pro on Oct 12 for $249. They're $199 now. Can you match it?", "Target: Yes, within 14 days. I've refunded $50.00 to your card."], confirmation: "TGT-PM-1012" }),
    }, [pod]);
  }

  const rx = all("fsa_claim");
  if (rx.length) {
    const sum = round2(rx.reduce((s, b) => s + b.amount, 0));
    add({
      id: "tile_fsa_claim", category: "fsa_claim", title: "FSA: reimburse yourself for two prescriptions",
      live: true, atStake: sum,
      candidates: [{ id: "claim", label: "Submit both receipts to the FSA", costToUser: 0, detail: "Prescriptions are FSA-eligible; you paid with a personal card." }],
      recommendation: "claim",
      headline: `${usd(sum)} of prescriptions went on your personal card. Your FSA pays you back tax-free.`,
      tradeoff: "Spends FSA money you'd carry over, on care you already had. Nothing new is bought.",
      doNothingCost: sum, doNothing: `The ${usd(sum)} you already paid stays out of pocket; after Mar 31, 2027 these receipts can't be claimed.`,
      action: request("Submit prescription receipts to the FSA", sum, { title: "Filing FSA claims", to: "Acme FSA portal", steps: ["Uploading CVS receipt $64.30 (Sep 28)", "Uploading Walgreens receipt $28.15 (Oct 3)", "FSA: both claims approved, paid to your bank"], confirmation: "FSA-CLM-2026-02" }),
    }, rx);
  }

  const bb = one("promo_apr");
  if (bb) add({
    id: "tile_promo", category: "promo_apr", title: "Best Buy promo: pay it off before Nov 30",
    live: true, atStake: bb.amount,
    candidates: [
      { id: "payoff", label: `Pay the ${usd(f.promo_balance ?? 0)} promo balance from checking`, costToUser: 0, detail: "Checking has $8,240; the interest is charged retroactively if any balance remains." },
      { id: "minimum", label: "Keep paying the minimum", costToUser: bb.amount, detail: "Deferred interest hits all at once on Dec 1." },
    ],
    recommendation: "payoff",
    headline: `Pay ${usd(f.promo_balance ?? 0)} by Nov 30 or ${usd(bb.amount)} of back interest lands at once.`,
    tradeoff: "Leaves about $7,100 in checking.",
    doNothingCost: bb.amount, doNothing: `${usd(bb.amount)} of deferred interest is charged Dec 1.`,
    action: request("Schedule a full payoff of the Best Buy promo balance", bb.amount, { title: "Scheduling a payment", to: "Best Buy Credit Card", steps: ["Paying $1,140.00 from Chase checking", "Scheduled for Nov 20, 10 days before the promo ends", "Citibank: payment scheduled"], confirmation: "BBY-PAY-1120" }),
  }, [bb]);

  const subs = all("subscription");
  if (subs.length) {
    const sum = round2(subs.reduce((s, b) => s + b.amount, 0));
    add({
      ask: "Are you watching Hulu or using Duolingo?",
      id: "tile_subs", category: "subscription", title: "Cancel the Hulu trial and Duolingo renewal",
      live: true, atStake: sum,
      candidates: [{ id: "cancel", label: "Cancel both before they bill", costToUser: 0, detail: "Duolingo unopened since June; the Hulu trial converts Nov 2." }],
      recommendation: "cancel",
      headline: `${usd(sum)} is about to bill for a trial and an app you stopped opening in June.`,
      tradeoff: "Keep Hulu if you're watching it; we only flagged what's about to charge.",
      doNothingCost: sum, doNothing: `${usd(sum)} bills: Hulu $17.99/month from Nov 2 and Duolingo $89.99 on Nov 9.`,
      action: request("Cancel the Hulu trial and Duolingo renewal", sum, { title: "Canceling subscriptions", to: "Hulu and Duolingo", steps: ["Hulu → Cancel trial: access continues until Nov 2, no charge", "Duolingo → Turn off auto-renew: Super ends Nov 9, no renewal"], confirmation: "SUB-CXL-2" }),
    }, subs);
  }

  const miles = one("points");
  if (miles) {
    const value = round2((miles.amount * MILE_CENTS) / 100);
    add({
      id: "tile_points", category: "points", title: "AAdvantage miles expire Jan 9",
      live: true, atStake: value,
      candidates: [{ id: "earn", label: "Earn one mile through AAdvantage Dining on a meal you'd buy anyway", costToUser: 0, detail: "Any activity resets the 24-month clock." }],
      recommendation: "earn",
      headline: `${miles.amount.toLocaleString("en-US")} miles (about ${usd(value)} in flights) expire Jan 9. One activity saves them.`,
      tradeoff: `Valued at ${MILE_CENTS}¢ a mile; real value depends on what you book.`,
      doNothingCost: value, doNothing: `All ${miles.amount.toLocaleString("en-US")} miles disappear Jan 9.`,
      action: request("Link a card to AAdvantage Dining to post activity", value, { title: "Linking AAdvantage Dining", to: "AAdvantage Dining", steps: ["Linking Freedom Flex to AAdvantage Dining", "Your next restaurant meal earns miles and resets expiry to 2029"], confirmation: "AAD-LINK-01" }),
    }, [miles]);
  }

  const cash = one("idle_cash");
  if (cash) {
    const b = base([cash]);
    const g = idleCashGain(cash.amount, f.checking_apy_pct ?? 0, b.daysLeft);
    if (g.gain > 0) add({
      id: "tile_cash", category: "idle_cash", title: "Idle cash: options for checking earning 0.01%",
      live: false, atStake: g.gain,
      candidates: [
        { id: "hysa", label: `Option: move ${usd(g.movable)} to a high-yield savings account`, costToUser: 0, detail: `At ${HYSA_APY}% (assumed) that's about ${usd(g.gain)} by Dec 31.` },
        { id: "stay", label: "Option: leave it", costToUser: g.gain, detail: "Keeps everything in one place." },
      ],
      recommendation: "hysa",
      headline: `Options, not advice: ${usd(cash.amount)} earns almost nothing. Keeping ${usd(CASH_BUFFER)} for bills and saving the rest would earn about ${usd(g.gain)} by year end.`,
      tradeoff: "Rates vary by bank; we assume 4% to show the size of it.",
      doNothingCost: g.gain, doNothing: `About ${usd(g.gain)} of interest by Dec 31.`,
      action: { kind: "none", summary: "Options only", savings: 0, payload: {} },
    }, [cash]);
  }

  const ins = one("insurance");
  if (ins) add({
    id: "tile_insurance", category: "insurance", title: "Auto insurance renews 22% higher on Nov 18",
    live: false, atStake: 0,
    candidates: [{ id: "quote", label: "Option: get two quotes before Nov 18", costToUser: 0, detail: "Same coverage, compared side by side." }],
    recommendation: "quote",
    headline: `Options, not advice: GEICO renews at ${usd(ins.amount)} for 6 months, up 22%. Compare quotes before it auto-renews.`,
    tradeoff: "We can't know a cheaper price until you quote; nothing is counted as saved.",
    doNothingCost: 0, doNothing: `Renews Nov 18 at ${usd(ins.amount)}.`,
    action: { kind: "none", summary: "Options only", savings: 0, payload: {} },
  }, [ins]);

  return out;
}

// ---------- plan library ----------

// One tile per library finding. The math uses the plan's published terms and the person's answers.
function libraryTiles(ex: Extraction): Tile[] {
  const f = ex.facts;
  return ex.balances.filter((b) => b.id.startsWith("lib_")).flatMap((b): Tile[] => {
    const daysLeft = daysBetween(DEMO_TODAY, b.deadline);
    const by = new Date(`${b.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: daysLeft > 300 ? "numeric" : undefined, timeZone: "UTC" });
    const fact = (k: string) => f[`${b.id}:${k}`];
    const base = { balanceIds: [b.id], deadline: b.deadline, daysLeft, sources: [b.source], engine: "mock" as const, recommendation: "act" };
    const req = (title: string, to: string, lines: string[], savings = b.amount) => request(title, savings, { title, to, steps: lines, confirmation: `LIB-${b.id.slice(-6).toUpperCase()}` });
    const kind = b.id.split("_")[2];
    if (kind === "health") return [{ ...base, id: `tile_${b.id}`, category: "deductible", title: "Do the care that's already ordered before your plan year resets", live: true, atStake: b.amount, doNothingCost: b.amount,
      candidates: [{ id: "act", label: `Before ${by}`, costToUser: fact("now"), detail: "This plan year's deductible and out-of-pocket progress apply." }, { id: "wait", label: "After the plan year resets", costToUser: fact("after"), detail: "The deductible starts over." }],
      headline: `The care your doctor already ordered costs about ${usd(fact("now"))} now, ${usd(fact("after"))} after the reset.`, tradeoff: "Only care that's already ordered. We never suggest new care to use up a deductible.",
      doNothing: `It costs ${usd(b.amount)} more after the plan year resets.`, action: req("Schedule the ordered care", "your provider", ["Calling your provider's scheduling line", `Booking the ordered care before ${by}`, "Provider: you're booked"]) }];
    if (kind === "dental") return [{ ...base, id: `tile_${b.id}`, category: "dental", title: `Dental: ${usd(b.amount)} of coverage left, ${fact("cleanings")} free cleaning${fact("cleanings") === 1 ? "" : "s"}`, live: false, atStake: 0, doNothingCost: 0,
      candidates: [{ id: "act", label: "Book your free cleaning", costToUser: 0, detail: "Exams and cleanings are $0, twice per plan year." }],
      headline: `You have ${usd(b.amount)} of dental benefit and ${fact("cleanings")} free cleaning${fact("cleanings") === 1 ? "" : "s"} left until ${by}.`, tradeoff: "Only care you need; unused benefit doesn't carry over.",
      doNothing: `Unused dental benefit resets after ${by}.`, action: { kind: "none", summary: "Informational", savings: 0, payload: {} } }];
    if (kind === "vision") return [{ ...base, id: `tile_${b.id}`, category: "vision", title: "If you need glasses or contacts: use your $150 allowance", live: true, atStake: 115, doNothingCost: 115, ask: "Do you need new glasses or contacts this year?",
      candidates: [{ id: "act", label: "Book a VSP eye exam ($10) and use the allowance", costToUser: 35, detail: "$10 exam copay + $25 materials copay; the plan covers up to $150." }],
      headline: `If you need glasses or contacts, your plan covers up to $150 before ${by}: about $115 back after the $35 in copays.`, tradeoff: "Only if you actually need them; skipping an allowance you don't need costs nothing. Ruth asks first.",
      doNothing: `If you need them and wait past ${by}, you pay about $115 more yourself.`, action: req("Book a VSP eye exam", "a VSP eye doctor", ["Finding an in-network VSP eye doctor", "Booking an eye exam ($10 copay)", "Your $150 allowance applies to the glasses or contacts you choose"], 115) }];
    if (kind === "dining") {
      const s = diningSurplus(b.amount, fact("weekly") ?? 30, daysLeft);
      if (s.transfer <= 0) return [];
      return [{ ...base, id: `tile_${b.id}`, category: "dining", title: `Flex dollars: about ${usd(s.surplus)} would be forfeited in May`, live: true, atStake: s.surplus, doNothingCost: s.surplus,
        candidates: [{ id: "act", label: `Keep ${usd(round2(b.amount - s.transfer))}, send ${usd(s.transfer)} to a friend`, costToUser: 0, detail: `At ${usd(fact("weekly") ?? 30)} a week you'll spend about ${usd(Math.round(s.projected))} by ${by}.` }],
        headline: `At your pace you'll use about ${usd(Math.round(s.projected))}; ${usd(s.surplus)} would be forfeited at the end of spring.`, tradeoff: "Spend on what you'd eat anyway; send the rest. Don't stock up to burn it.",
        doNothing: `${usd(s.surplus)} is forfeited after ${by}.`, action: { kind: "transfer", summary: `Transfer ${usd(s.transfer)} of Flex dollars to a friend`, savings: s.transfer, payload: { amount: s.transfer, rail: "Cal Dining peer transfer", to: "a friend you choose" } } }];
    }
    if (kind === "fsa") return [{ ...base, id: `tile_${b.id}`, category: "fsa", title: b.amount ? `FSA: ${usd(b.amount)} would be forfeited` : "FSA: your balance is under the carryover", live: false, atStake: b.amount, doNothingCost: b.amount,
      candidates: [{ id: "act", label: "Submit receipts for care you already had", costToUser: 0, detail: `${usd(fact("carryover"))} carries over under your plan.` }],
      headline: b.amount ? `${usd(fact("balance"))} in your FSA, ${usd(fact("carryover"))} carries over, so ${usd(b.amount)} is forfeited after ${by} unless you use it on care you need.` : `Your ${usd(fact("balance"))} is under your plan's ${usd(fact("carryover"))} carryover. Nothing is forfeited.`,
      tradeoff: "Carryover applied before computing forfeiture (rule 4). Ruth rejects 'use it up' purchases.", doNothing: b.amount ? `${usd(b.amount)} lost after ${by}.` : "Nothing is lost.", action: { kind: "none", summary: "Informational", savings: 0, payload: {} } }];
    if (kind === "hsa") return [{ ...base, id: `tile_${b.id}`, category: "hsa", title: `HSA: ${usd(b.amount)} of 2026 contribution room left`, live: false, atStake: 0, doNothingCost: 0,
      candidates: [{ id: "act", label: "Option: contribute more for 2026", costToUser: 0, detail: `Limit ${usd(fact("limit"))}; contributions for 2026 are allowed until Apr 15, 2027.` }, { id: "skip", label: "Option: leave it", costToUser: 0, detail: "HSA money never expires; only the 2026 contribution window does." }],
      headline: `Options, not advice: you can still put up to ${usd(b.amount)} into your HSA for 2026, until April 15, 2027.`, tradeoff: "Contributing lowers your take-home pay now; in exchange each dollar goes in pre-tax and never expires. Talk to a tax professional about whether it fits your budget.",
      doNothing: "The 2026 contribution window closes April 15, 2027.", action: { kind: "none", summary: "Options only", savings: 0, payload: {} } }];
    if (kind === "match") return [{ ...base, id: `tile_${b.id}`, category: "retirement", title: `Get your full 401(k) match: ${usd(b.amount)} left this year`, live: true, atStake: b.amount, doNothingCost: b.amount,
      ask: `Can you set aside about ${usd(fact("perPaycheck"))} more per paycheck (${fact("cap") - fact("pct")}% of pay)?`,
      candidates: [{ id: "act", label: `Raise your contribution from ${fact("pct")}% to ${fact("cap")}%`, costToUser: 0, detail: `Worth ${usd(fact("yearly"))} a year in match; about ${fact("paychecks")} paychecks are left in 2026 once the change takes effect.` }],
      headline: `You contribute ${fact("pct")}% but your employer matches up to ${fact("cap")}%. Raising it gets about ${usd(b.amount)} more over the ${fact("paychecks")} paychecks left this year, and ${usd(fact("yearly"))} every year after.`,
      tradeoff: "It lowers take-home pay; only if your budget allows. The match itself is free money.",
      doNothing: `${usd(b.amount)} of employer match is left unclaimed this year.`, action: req("Raise your 401(k) contribution", "your 401(k) portal", ["Opening your recordkeeper (Fidelity, Vanguard, Empower…) → Contributions", `Changing from ${fact("pct")}% to ${fact("cap")}% of pay`, "Takes effect on the next payroll"]) }];
    if (kind === "pto") return [{ ...base, id: `tile_${b.id}`, category: "pto", title: `${fact("days")} PTO day${fact("days") === 1 ? "" : "s"} will be forfeited ${by}`, live: true, atStake: b.amount, doNothingCost: b.amount, ask: `Do you want to take ${fact("days")} day${fact("days") === 1 ? "" : "s"} off before ${by}?`,
      candidates: [{ id: "act", label: `Book ${fact("days")} day${fact("days") === 1 ? "" : "s"} off`, costToUser: 0, detail: `Each day is worth about ${usd(fact("day"))} of your pay.` }],
      headline: `${fact("days")} day${fact("days") === 1 ? "" : "s"} over your rollover cap disappear ${by}, about ${usd(b.amount)} of paid time.`, tradeoff: "Rest is the point; book days you'd enjoy, even a long weekend.",
      doNothing: `${fact("days")} paid day${fact("days") === 1 ? "" : "s"} (about ${usd(b.amount)}) forfeited ${by}.`, action: req("Request time off", "your HR system", ["Opening your HR system (Workday, Rippling, BambooHR…) → Time off", `Requesting ${fact("days")} day${fact("days") === 1 ? "" : "s"} before ${by}`, "Manager approval requested"]) }];
    if (kind === "dcfsa") {
      const claim = fact("claim") ?? 0;
      return [{ ...base, id: `tile_${b.id}`, category: "dcfsa", title: claim ? `Claim ${usd(claim)} of childcare from your dependent care FSA` : `Dependent care FSA: ${usd(b.amount)} has no carryover`, live: claim > 0, atStake: claim || b.amount, doNothingCost: claim || b.amount,
        candidates: [{ id: "act", label: "Submit your childcare receipts", costToUser: 0, detail: "Daycare, after-school care and summer day camp usually qualify." }],
        headline: claim ? `You've paid ${usd(fact("receipts"))} of childcare but haven't claimed it. Submit receipts to get ${usd(claim)} back tax-free.` : `${usd(b.amount)} in your dependent care FSA is forfeited after ${by} unless it covers childcare you pay.`,
        tradeoff: "Only childcare you already pay for. No carryover, so plan the rest of the year's care.", doNothing: `Unclaimed money is forfeited after ${by}.`,
        action: claim ? req("Submit childcare receipts", "your FSA portal", ["Uploading your childcare receipts", "Claim submitted; reimbursement to your bank"], claim) : { kind: "none", summary: "Informational", savings: 0, payload: {} } }];
    }
    if (kind === "stipend") return [{ ...base, id: `tile_${b.id}`, category: "stipend", title: `Use your ${usd(b.amount)} ${b.label.toLowerCase()} before ${by}`, live: true, atStake: b.amount, doNothingCost: b.amount, ask: "Is there something you'd buy anyway that it covers?",
      candidates: [{ id: "act", label: "Spend it on something you already planned", costToUser: 0, detail: "Gym, classes, books, a desk chair: whatever your program covers." }],
      headline: `${usd(b.amount)} of your ${b.label.toLowerCase()} resets ${by}, and stipends don't roll over.`, tradeoff: "Only on things you'd do or buy anyway.",
      doNothing: `${usd(b.amount)} resets ${by}.`, action: req("Use your stipend", "your stipend portal", ["Opening your stipend portal (Compt, Forma, Benepass…)", "Submitting a purchase you already planned", "Reimbursement approved"]) }];
    if (kind === "fitness") return [{ ...base, id: `tile_${b.id}`, category: "fitness", title: `Get ${usd(b.amount)} of your gym fees back from your health plan`, live: true, atStake: b.amount, doNothingCost: b.amount,
      candidates: [{ id: "act", label: "Send the claim form with your gym charges", costToUser: 0, detail: `You paid about ${usd(fact("paid"))} this year; the plan pays back up to ${usd(fact("max"))}.` }],
      headline: `You've paid about ${usd(fact("paid"))} in gym fees this year. Your health plan pays back up to ${usd(fact("max"))}, but only if you send a claim by ${by}.`, tradeoff: "Money for something you already paid for. Some plans treat it as taxable income.",
      doNothing: `${usd(b.amount)} of reimbursement is lost after ${by}.`, action: req("Send the gym reimbursement claim", "your health plan", ["Filling the plan's fitness reimbursement form", "Attaching proof of payment", "Claim submitted; a check or deposit follows"]) }];
    if (kind === "vesting") return [{ ...base, id: `tile_${b.id}`, category: "retirement", title: `Unvested 401(k): ${usd(b.amount)} vests ${by}`, live: false, atStake: b.amount, doNothingCost: b.amount,
      candidates: [{ id: "wait", label: `Option: time a move after ${by}`, costToUser: 0, detail: "Vesting is all-or-nothing on a cliff schedule." }, { id: "go", label: "Option: leave anyway", costToUser: b.amount, detail: "Sometimes the new job is worth more." }],
      headline: `Options, not advice: leaving before ${by} forfeits ${usd(b.amount)} of employer 401(k) money.`, tradeoff: "A start date a few weeks later can be worth asking for.",
      doNothing: `Leaving before ${by} forfeits ${usd(b.amount)}.`, action: { kind: "none", summary: "Options only", savings: 0, payload: {} } }];
    if (kind === "espp") return [{ ...base, id: `tile_${b.id}`, category: "espp", title: `ESPP window opens ${by}`, live: false, atStake: 0, doNothingCost: 0,
      candidates: [{ id: "join", label: `Option: enroll at ${fact("discount")}% off`, costToUser: 0, detail: `Contributing ${usd(fact("contrib"))} a year buys about ${usd(b.amount)} more stock than it costs, before taxes and price moves.` }, { id: "skip", label: "Option: skip", costToUser: 0, detail: "Keeps the cash; no stock risk." }],
      headline: `Options, not advice: your ESPP enrollment window opens ${by}. At a ${fact("discount")}% discount, ${usd(fact("contrib"))} a year buys about ${usd(b.amount)} of extra value.`, tradeoff: "Stock can fall; many people sell at purchase to lock in the discount. Taxes apply.",
      doNothing: `You'll wait for the next window to join.`, action: { kind: "none", summary: "Options only", savings: 0, payload: {} } }];
    if (kind === "credit") {
      const name = b.label;
      return [{ ...base, id: `tile_${b.id}`, category: "card_credit", title: `Use your ${usd(b.amount)} ${name.replace(/^(American Express|Chase|Citi|Capital One) /, "")}`, live: true, atStake: b.amount, doNothingCost: b.amount, ask: "Will you use it on something you'd buy anyway?",
        candidates: [{ id: "act", label: "Use it on something you already planned", costToUser: 0, detail: b.ruleText }],
        headline: `${name}: ${usd(b.amount)} unused, and it resets after ${by}.`, tradeoff: "Only on something you'd buy anyway. A credit isn't a reason to spend.",
        doNothing: `${usd(b.amount)} lapses after ${by}.`, action: req(`Use the ${name}`, name.split(" ")[0] === "Venture" ? "Capital One Travel" : name, ["Checking the credit is enrolled and the card is set as the payment method", `You'll use it on your next planned purchase before ${by}`, "Statement credit posts after the purchase"]) }];
    }
    if (kind === "points") return [{ ...base, id: `tile_${b.id}`, category: "points", title: `${b.label}: expiring ${by}`, live: true, atStake: b.amount, doNothingCost: b.amount,
      candidates: [{ id: "act", label: "Earn or redeem one point to reset the clock", costToUser: 0, detail: "A dining program or shopping portal purchase you'd make anyway counts." }],
      headline: `${Math.round(fact("balance")).toLocaleString("en-US")} points (about ${usd(b.amount)}) expire ${by} without activity. One small activity saves them.`, tradeoff: `Rough value at ${fact("cents")}¢ a point.`,
      doNothing: `All ${Math.round(fact("balance")).toLocaleString("en-US")} points disappear after ${by}.`, action: req("Post one activity to keep the points", b.label, ["Linking your card to the program's dining or shopping portal", "Your next everyday purchase posts activity and resets expiration"]) }];
    return [];
  });
}

// ---------- uploaded statements ----------

// One tile per finding from a real statement. Amounts are the transactions themselves; the rules are
// typical issuer and plan terms, so the copy says "check" where a term varies.
function uploadTiles(ex: Extraction): Tile[] {
  return ex.balances.filter((b) => b.id.startsWith("up_")).flatMap((b): Tile[] => {
    const daysLeft = daysBetween(DEMO_TODAY, b.deadline);
    const what = b.label.replace(/^[^:]+:\s*/, "");
    const by = new Date(`${b.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const common = { balanceIds: [b.id], deadline: b.deadline, daysLeft, sources: [b.source], engine: "mock" as const, live: true, atStake: b.amount, doNothingCost: b.amount, recommendation: "act" };
    const steps = (title: string, to: string, lines: string[], conf: string) => request(title, b.amount, { title, to, steps: lines, confirmation: `${conf}-${b.id.slice(-4).toUpperCase()}` });
    if (b.category === "dispute") return [{ ...common, id: `tile_${b.id}`, category: "dispute", title: `Dispute a duplicate charge: ${what}`,
      candidates: [{ id: "act", label: "Dispute the duplicate", costToUser: 0, detail: "Same merchant, amount and day." }],
      headline: `${what} charged you ${usd(b.amount)} twice. Dispute the copy.`, tradeoff: "Only the duplicate; check it wasn't two real orders.",
      doNothing: `${usd(b.amount)} stays charged; the dispute window closes ${by}.`, action: steps(`Dispute the duplicate ${what} charge`, "your card issuer", [`Selecting the duplicate ${what} charge`, "Reason: duplicate charge", "Issuer: provisional credit issued while we review"], "DSP") }];
    if (b.category === "bank_fee") return [{ ...common, id: `tile_${b.id}`, category: "bank_fee", title: `Ask for a refund: ${what}`,
      candidates: [{ id: "act", label: "Request a courtesy refund", costToUser: 0, detail: "Banks often waive an occasional fee." }],
      headline: `Ask your bank to reverse the ${usd(b.amount)} ${what.toLowerCase()}.`, tradeoff: "Refunds are discretionary; it costs nothing to ask.",
      doNothing: `${usd(b.amount)} stays charged.`, action: steps(`Request a refund of the ${what}`, "your bank", [`Expire: I was charged ${usd(b.amount)} (${what}). Could you refund it as a courtesy?`, "Bank: We've refunded it as a one-time courtesy."], "RFD") }];
    if (b.category === "annual_fee") return [{ ...common, ask: "Will you use this card's perks enough to cover the fee?", id: `tile_${b.id}`, category: "annual_fee", title: `Annual fee posted: downgrade by ${by} if it isn't worth it`,
      candidates: [{ id: "act", label: "Downgrade to a no-fee card and get the fee back", costToUser: 0, detail: "Keeps your credit history; check the issuer's refund window." }, { id: "keep", label: "Keep the card", costToUser: b.amount, detail: "Worth it only if you'll use its credits." }],
      headline: `A ${usd(b.amount)} annual fee just posted. Most issuers refund it if you downgrade within about 30 days.`, tradeoff: "You lose the card's perks; downgrade rather than close.",
      doNothing: `${usd(b.amount)} is final after about ${by}.`, action: { kind: "book_call", summary: "Call the issuer to downgrade and refund the annual fee", savings: b.amount,
        payload: { to: "your card issuer", phone: "the number on your card", patient: "you", thisYear: "a product change to a no-fee card with the annual fee refunded", nextYear: "", date: DEMO_TODAY, nextDate: "" } } }];
    if (b.category === "subscription") return [{ ...common, ask: `Do you still use ${what}?`, id: `tile_${b.id}`, category: "subscription", title: `Renews soon: ${what}`,
      candidates: [{ id: "act", label: "Cancel if you don't use it", costToUser: 0, detail: "Keep it if you do; we only see that it bills." }],
      headline: `${what} bills about ${usd(b.amount)} again around ${by}. Cancel it if you've stopped using it.`, tradeoff: "Harvest only if you really don't use it.",
      doNothing: `${usd(b.amount)} bills again around ${by}.`, action: steps(`Cancel ${what}`, what, [`Opening ${what} → Account → Subscription`, "Turning off auto-renew", "Access continues until the end of the paid period"], "CXL") }];
    if (b.category === "fsa_claim") return [{ ...common, ask: "Do you have an FSA or HSA this year?", id: `tile_${b.id}`, category: "fsa_claim", title: `Claim from your FSA/HSA: ${what}`,
      candidates: [{ id: "act", label: "Submit the receipt to your FSA or HSA", costToUser: 0, detail: "Only if you have one and the expense is eligible." }],
      headline: `${usd(b.amount)} at ${what} went on a regular card. If you have an FSA or HSA, get it back tax-free.`, tradeoff: "Eligibility depends on the item; keep the itemized receipt.",
      doNothing: `The ${usd(b.amount)} you already paid stays out of pocket (your FSA balance itself isn't forfeiting); most FSAs stop taking ${+b.deadline.slice(0, 4) - 1} claims around ${by}.`, action: steps(`Submit the ${what} receipt`, "your FSA/HSA portal", [`Uploading the ${what} receipt (${usd(b.amount)})`, "Claim submitted; reimbursement to your bank"], "FSA") }];
    if (b.category === "price_adjust") {
      const now = ex.facts[`price_now:${b.id}`];
      if (now == null || now >= b.amount) return []; // no drop (or no live price): nothing to claim yet
      const diff = round2(b.amount - now);
      const store = b.label.match(/ at (.+)$/)?.[1] ?? "the store";
      return [{ ...common, atStake: diff, doNothingCost: diff, id: `tile_${b.id}`, category: "price_adjust", title: `Price dropped: ${what}`,
        candidates: [{ id: "act", label: `Request ${store}'s price match`, costToUser: 0, detail: `Paid ${usd(b.amount)}; ${store} lists it at ${usd(now)} right now (checked live via Apify).` }],
        headline: `You paid ${usd(b.amount)}; ${store} sells it for ${usd(now)} today. Ask for ${usd(diff)} back by ${by}.`,
        tradeoff: "Same item you already own; nothing to return. The price was read live from the store's page.",
        doNothing: `${usd(diff)} stays with ${store}; the price-match window closes ${by}.`,
        action: request(`Request a ${store} price adjustment`, diff, { title: `Chatting with ${store}`, to: `${store} guest services`, steps: [`Expire: Hi, I bought ${what.replace(/ at .*/, "")} for ${usd(b.amount)}. It's ${usd(now)} on your site today. Could you match it?`, `${store}: Yes, that's within our price-match window. Refund of ${usd(diff)} issued.`], confirmation: `PM-${b.id.slice(-4).toUpperCase()}` }) }];
    }
    return [];
  });
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
