import { z } from "zod";
import { claudeEnabled } from "../engine/claude";
import { livePrices, apifyEnabled } from "../integrations/apify";
import { MARKET, buy, txUrl } from "../integrations/x402";
import { addSpend, canSpend } from "../pipeline";
import { hydrate, load, log, save } from "../store";
import type { Balance, Quest, QuestOffer } from "../types";
import { AGENTS, quote, type AgentId, type RawOffer } from "./agents";
import { shoppable } from "./shoppable";
import { structured } from "../engine/llm";

// A shopping quest. Ruth asks every shopkeeper agent for a quote (paying each over x402), checks
// live prices with Apify, then reviews each offer: does it fit the need, does the benefit cover it,
// is it good quality for the money. Ruth never buys; she hands you the pick and the link.

// What the benefit covers, in plain words the agents and Ruth both use.
function coverage(b: Balance): string {
  if (b.category === "fsa" || b.category === "hsa") return "Only IRS-eligible medical items (IRS Publication 502; since the 2020 CARES Act, over-the-counter medicines and menstrual products need no prescription). Eligible: prescriptions, OTC medicines (pain relievers, allergy, cold and flu), first aid and bandages, medical thermometers, blood pressure monitors, pulse oximeters, contact lens solution and supplies, reading glasses, broad-spectrum sunscreen SPF 15+, menstrual products, pregnancy and ovulation tests, condoms, hearing aids and batteries, heating pads, braces and supports, and anything labeled HSA/FSA eligible. A product in one of these categories is eligible even without a label. Not eligible: cosmetics, toiletries, vitamins and supplements, general wellness or fitness gear, kitchen or non-medical devices.";
  if (b.category === "card_credit") return `Only purchases that trigger this card credit: ${b.label}. ${b.ruleText}`;
  if (b.category === "stipend") return `Only what this stipend program covers: ${b.label} (e.g. fitness, classes, books, home office, per the program).`;
  if (b.category === "vision") return "Glasses or contact lenses from an in-network provider, up to the allowance.";
  if (b.category === "fitness") return "Gym or fitness memberships the health plan reimburses.";
  if (b.category === "dcfsa") return "Childcare for a dependent under 13 (daycare, after-school care, day camp).";
  return b.ruleText;
}

const Review = z.object({ reviews: z.array(z.object({ index: z.number().int(), fits: z.boolean(), eligible: z.boolean(), quality: z.number().min(0).max(10), note: z.string() })) });

export async function runQuest(pid: string, req: { benefitId: string; need: string; maxPrice?: number }): Promise<Quest> {
  await hydrate(pid);
  let s = load(pid);
  const b = shoppable(s).find((x) => x.id === req.benefitId);
  if (!b) throw new Error("Pick a benefit you still have money on");
  const need = req.need.trim().slice(0, 200);
  if (!need) throw new Error("Tell Ruth what you need");
  const maxPrice = Math.max(1, Math.min(5000, req.maxPrice ?? b.amount));
  const rule = coverage(b);
  const notes: string[] = [];
  let spent = 0;
  log(s, "quest", `Shopping quest: "${need}" with ${b.label} ($${b.amount.toFixed(2)} left), budget $${maxPrice.toFixed(2)}`);

  // 1. Every seller agent quotes in parallel. Ruth pays each for its quote when her budget allows.
  const ids: AgentId[] = ["deal", "quality", "specialist"];
  const params = (id: AgentId) => new URLSearchParams({ agent: id, need, benefit: `${b.label} ($${b.amount.toFixed(2)} left)`, constraint: rule, max: String(maxPrice) }).toString();
  const results = await Promise.all(ids.map(async (id) => {
    if (canSpend(s, MARKET.quote.price)) {
      const r = await buy<{ offers: RawOffer[] }>(`${MARKET.quote.path}?${params(id)}`);
      if (r.payment && r.data) return { id, offers: r.data.offers, paid: { price: r.payment.price, tx: r.payment.transaction } };
      if (r.error && !/payment refused/.test(r.error)) return { id, offers: [] as RawOffer[], note: r.error };
      // Wallet can't pay: the agent still quotes, unpaid, and the record says so.
      const free = await quote({ agent: id, need, benefit: b.label, constraint: rule, maxPrice });
      return { id, offers: free.offers, note: /insufficient_balance/.test(r.error ?? "") ? "unpaid: Ruth's wallet has no USDC yet" : `unpaid (${r.error})` };
    }
    const free = await quote({ agent: id, need, benefit: b.label, constraint: rule, maxPrice });
    return { id, offers: free.offers, note: "unpaid (data budget used up)" };
  }));
  s = load(pid);
  for (const r of results) if (r.paid) { addSpend(s, r.paid.price); spent += parseFloat(r.paid.price.slice(1)); log(s, "x402", `Paid ${AGENTS[r.id].shop} ${r.paid.price} USDC for a quote · ${txUrl(r.paid.tx)}`); }

  // 2. Pool and de-duplicate the offers.
  const seen = new Set<string>();
  const pool = results.flatMap((r) => r.offers.map((o) => ({ ...o, agent: AGENTS[r.id].keeper }))).filter((o) => { const k = /google\.com\/search/.test(o.url) ? (o.url.match(/catalogid:(\d+)/)?.[1] ?? o.url) : o.url.split("?")[0]; if (seen.has(k)) return false; seen.add(k); return true; });

  // 3. Live prices for the cheapest few, via Apify (cached), so a stale quote can't win.
  // Capped at 45 seconds so a slow store page can't stall the quest; uncapped results stay cached.
  const timeout = new Promise<Record<string, number | null>>((ok) => setTimeout(() => ok({}), 45_000));
  const live: Record<string, number | null> = apifyEnabled() && pool.length ? await Promise.race([livePrices(pool.filter((o) => !/google\.com\/search/.test(o.url)).sort((x, y) => x.price - y.price).slice(0, 2).map((o) => o.url)).catch(() => ({})), timeout]) : {};
  if (apifyEnabled() && pool.some((o) => !/google\.com\/search/.test(o.url)) && !Object.keys(live).length) notes.push("Live price check took too long, so prices are the agents' quotes.");

  // 4. Ruth reviews each offer: fits the need, covered by the benefit, quality for the money.
  const rv = claudeEnabled() && pool.length ? await structured("rank", {
    system: "You are Ruth, a strict reviewer. For each offer decide: does it fit the stated need (not an upsell, not 'use it up' junk); is it covered by the benefit's rule; quality 0-10 from reviews, brand and specs. Be conservative: if coverage is unclear, eligible=false. Note: at most 7 words, written like a handwritten shop tag, e.g. 'Firm, well loved, great price' or 'Too big for what you need'. No dashes, no semicolons, no hedging words.",
    user: `Need: ${need}\nBenefit: ${b.label}\nCoverage rule: ${rule}\nOffers:\n${pool.map((o, i) => `${i}. ${o.title} | ${o.merchant} | $${o.price} | ${o.rating ?? "?"}★ (${o.reviews ?? "?"} reviews) | ${o.why}`).join("\n")}`,
    schema: Review, effort: "low",
  }) : null;
  const offers: QuestOffer[] = pool.map((o, i): QuestOffer => {
    const r = rv?.reviews.find((x) => x.index === i);
    const price = live[o.url] ?? o.price;
    const fits = r?.fits ?? true, eligible = r?.eligible ?? false, quality = r?.quality ?? (o.rating ? o.rating * 2 : 5);
    const ok = fits && eligible && price <= maxPrice + 0.01;
    const covered = Math.round(Math.min(price, b.amount) * 100) / 100;
    return { ...o, price, livePrice: live[o.url], verdict: { ok, fits, eligible, quality, note: r?.note ?? (claudeEnabled() ? "" : "Not reviewed (Claude offline)") + (price > maxPrice ? ` Over your $${maxPrice} budget.` : "") },
      covered, outOfPocket: Math.round((price - covered) * 100) / 100, score: ok ? quality * 10 : -1 };
  });
  // Best quality for the money: every doubling of price over the cheapest approved offer costs
  // 15 points, so a pricier pick has to be clearly better to win.
  const cheapest = Math.min(...offers.filter((o) => o.verdict.ok).map((o) => o.price), Infinity);
  for (const o of offers) if (o.verdict.ok) o.score = Math.round((o.score - 15 * Math.log2(o.price / cheapest)) * 10) / 10;
  offers.sort((x, y) => y.score - x.score);
  if (!offers.length) notes.push("No agent found a real offer for that. Try describing the need differently.");
  if (!offers.some((o) => o.verdict.ok) && offers.length) notes.push("Ruth didn't approve any offer: none was clearly covered by this benefit and a good fit.");

  const quest: Quest = {
    id: `q${Date.now().toString(36)}`, at: new Date().toISOString(), need, maxPrice,
    benefit: { id: b.id, label: b.label, amount: b.amount, deadline: b.deadline, category: b.category },
    agents: results.map((r) => ({ id: r.id, shop: AGENTS[r.id].shop, keeper: AGENTS[r.id].keeper, strategy: AGENTS[r.id].strategy, offers: r.offers.length, paid: r.paid, note: r.note })),
    offers, best: offers.find((o) => o.verdict.ok)?.url, notes, spent,
  };
  s.quests = [quest, ...(s.quests ?? [])].slice(0, 10);
  const best = offers.find((o) => o.verdict.ok);
  log(s, "quest", best ? `Ruth's pick for "${need}": ${best.title} at ${best.merchant}, $${best.price.toFixed(2)} (${best.covered.toFixed(2)} covered by ${b.label}). Not bought; the choice is yours.` : `No approved offer for "${need}"`);
  save(s, pid);
  return quest;
}
