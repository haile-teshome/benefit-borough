import type { Category } from "../types";
import type { Txn } from "./parse";
import { watchFor } from "./products";

// Deterministic findings from a real statement. Each one quotes the transaction line it came from,
// so the extraction grounding step can verify it like any other balance.

export type Finding = {
  id: string; category: Category; label: string; amount: number; deadline: string; span: string; rule: string;
};

const FEE = /overdraft|\bnsf\b|insufficient funds|returned item|(monthly|service|maintenance) (service )?(fee|charge)|atm (fee|surcharge)|foreign (transaction|exchange) fee|late (payment )?fee|wire (transfer )?fee|paper statement fee/i;
const ANNUAL = /annual (membership |card )?fee|membership fee/i;
const SUBS = /netflix|spotify|hulu|disney|hbo|\bmax\b|youtube|apple\.com\/bill|icloud|google \*|adobe|audible|amazon prime|prime video|paramount|peacock|duolingo|chatgpt|openai|patreon|planet fitness|fitness|\bgym\b|dropbox|microsoft|xbox|playstation|nintendo|crunchyroll|siriusxm|nytimes|new york times|wsj|linkedin|notion|canva|grammarly|headspace|calm\.com|dashpass|uber one|instacart|walmart\+|tinder|bumble|hinge|masterclass|skillshare|coursera/i;
const HEALTH = /\bcvs\b|walgreens|rite aid|pharmacy|\brx\b|dental|\bdds\b|optometr|vision|eye ?care|lenscrafters|urgent care|clinic|medical|physician|hospital|labcorp|quest diag|therapy|counsel|chiropract/i;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysApart = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const merchant = (d: string) => d.toUpperCase().replace(/[#*]?\d[\d\-#*]*/g, " ").replace(/[^A-Z&.+' ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ");
const round2 = (n: number) => Math.round(n * 100) / 100;

// "NETFLIX.COM 866-579-7172 CA" → "Netflix.com", "CVS/PHARMACY #09812 BERKELEY CA" → "Cvs/Pharmacy".
export function prettyMerchant(d: string) {
  const base = d.replace(/\s+[#*]?\d[\d\-./]*.*$/, "").replace(/\s{2,}.*/, "").trim() || d;
  return base.toLowerCase().replace(/(^|[\s/*.-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()).replace(/\.Com\b/, ".com");
}

export function detect(txns: Txn[], docId: string, today: string): Finding[] {
  const out: Finding[] = [];
  const charges = txns.filter((t) => t.amount > 0);
  // Dispute windows run from the statement date; we read the statement today.
  const lastDate = [today, ...txns.map((t) => t.date)].sort().at(-1)!;
  const id = (cat: string) => `up_${docId.replace(/\W/g, "")}_${cat}_${out.length}`;

  // Duplicate charges: same day, same description, same amount.
  const seen = new Map<string, Txn[]>();
  for (const t of charges) {
    const k = `${t.date}|${merchant(t.description)}|${t.amount}`;
    seen.set(k, [...(seen.get(k) ?? []), t]);
  }
  for (const group of seen.values()) {
    if (group.length < 2 || FEE.test(group[0].description)) continue;
    out.push({ id: id("dispute"), category: "dispute", label: `Duplicate charge: ${prettyMerchant(group[0].description)}`, amount: round2(group[0].amount * (group.length - 1)),
      deadline: addDays(lastDate, 60), span: group[1].raw, rule: "Billing errors must be disputed within 60 days of the statement date." });
  }

  for (const t of charges) {
    const w = watchFor(t.description);
    if (w) {
      out.push({ id: id("price_adjust"), category: "price_adjust", label: `Price watch: ${w.name} at ${w.store}`, amount: t.amount, deadline: addDays(t.date, w.matchDays), span: t.raw,
        rule: `${w.policy} Live price: ${w.url}` });
      continue;
    }
    if (ANNUAL.test(t.description)) {
      out.push({ id: id("annual_fee"), category: "annual_fee", label: `Annual fee: ${prettyMerchant(t.description)}`, amount: t.amount, deadline: addDays(t.date, 30), span: t.raw,
        rule: "Most issuers refund the annual fee if you downgrade or cancel within about 30 days of it posting. Check your card's terms." });
    } else if (FEE.test(t.description)) {
      out.push({ id: id("bank_fee"), category: "bank_fee", label: `Fee: ${prettyMerchant(t.description)}`, amount: t.amount, deadline: addDays(t.date, 60), span: t.raw,
        rule: "Banks often refund a first or occasional fee when asked." });
    } else if (HEALTH.test(t.description)) {
      const y = +t.date.slice(0, 4);
      out.push({ id: id("fsa_claim"), category: "fsa_claim", label: `Health expense: ${prettyMerchant(t.description)}`, amount: t.amount, deadline: `${y + 1}-03-31`, span: t.raw,
        rule: "If you have an FSA or HSA, eligible care and prescriptions can be reimbursed. Many FSAs allow claims until about March 31 of the next year." });
    }
  }

  // Subscriptions: known services, or any merchant billing a similar amount about a month apart.
  const byMerchant = new Map<string, Txn[]>();
  for (const t of charges) byMerchant.set(merchant(t.description), [...(byMerchant.get(merchant(t.description)) ?? []), t]);
  const subs: Finding[] = [];
  for (const [m, list] of byMerchant) {
    if (!m || FEE.test(list[0].description) || ANNUAL.test(list[0].description) || HEALTH.test(list[0].description)) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted.at(-1)!;
    const recurring = sorted.some((t, i) => i > 0 && Math.abs(t.amount - sorted[i - 1].amount) < 1 && Math.abs(daysApart(sorted[i - 1].date, t.date) - 30) <= 4);
    if (!recurring && !SUBS.test(last.description)) continue;
    if (last.amount > 300) continue;
    subs.push({ id: "", category: "subscription", label: `Subscription: ${prettyMerchant(last.description)}`, amount: last.amount, deadline: addDays(last.date, 30), span: last.raw,
      rule: recurring ? "Bills about every 30 days at the same amount." : "Recurring service; renews unless canceled." });
  }
  subs.sort((a, b) => b.amount - a.amount).slice(0, 6).forEach((s) => out.push({ ...s, id: id("subscription") }));

  return out.filter((f) => f.deadline >= today);
}
