import { z } from "zod";
import { callStructured, claudeEnabled } from "../engine/claude";
import type { AppState, Balance, Category } from "../types";

// "Pay with what's expiring": before you buy, rank the ways to pay by how much expiring money the
// purchase rescues. Every number comes from the rules table below and the user's own balances;
// Claude (when enabled) only sorts ambiguous items into a known kind and rewrites the explanation.

export type Cart = { merchant: string; items: { name: string; price: number }[]; url?: string };

export type Option = {
  payWith: string;
  benefitId?: string;
  rescued: number;
  why: string;
  deadline?: string;
  daysLeft?: number;
  cite?: string;
  items?: string[]; // the cart items this option covers
};

export type Advice = { options: Option[]; best: number; splits?: string; notes: string[]; engine: "rules" | "claude" };

type Rule = {
  kind: string;
  merchant?: RegExp; // matches the whole cart
  item?: RegExp; // matches one item
  categories: Category[];
  label?: RegExp; // which balance of those categories
  payWith: (b: Balance) => string;
  why: (b: Balance, items: string[]) => string;
  rate?: number; // fraction of the price rescued (rotating 5%); default 1 = the credit covers it dollar for dollar
};

const CREDIT: Category[] = ["card_credit", "credit_move"];
const card = (b: Balance) => b.label.replace(/\s*(unused|not activated).*$/i, "").replace(/;.*$/, "");
const list = (items: string[]) => (items.length > 2 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items.join(" and "));

// Items the IRS does not treat as medical care, even when sold at a pharmacy.
const NOT_MEDICAL = /aloe|after[- ]?sun|lotion|moisturi[sz]er|cosmetic|makeup|vitamin|supplement|toothpaste|shampoo|candy|snack|soda|gum|deodorant|razor|perfume|lip ?balm(?!.*spf)/i;
const MEDICAL = /sunscreen|spf|band[- ]?aid|bandage|gauze|first[- ]?aid|contact (lens|solution)|saline|prescription|\brx\b|thermometer|ibuprofen|advil|tylenol|acetaminophen|aspirin|allergy|antacid|cold (medicine|relief)|cough|reading glasses|eyeglasses|condom|pregnancy test|tampon|menstrual|pads?\b|heating pad|blood pressure|knee brace|orthotic|nicotine/i;

export const RULES: Rule[] = [
  { kind: "saks", merchant: /saks/i, categories: CREDIT, label: /saks/i, payWith: card, why: (b) => `Saks purchases trigger the ${card(b)}. Use it before it resets.` },
  { kind: "uber", merchant: /uber/i, categories: CREDIT, label: /uber/i, payWith: card, why: (b) => `Uber rides and Uber Eats orders draw down ${card(b)} automatically once the card is in your Uber wallet.` },
  { kind: "airline", merchant: /delta|united|american airlines|southwest|alaska air|jetblue|spirit|frontier|hawaiian|airline/i, item: /bag(gage)? fee|checked bag|seat (selection|upgrade)|in-?flight|lounge (day )?pass/i, categories: CREDIT, label: /airline|incidental/i, payWith: card, why: (b) => `Airline incidental fees (bags, seats, in-flight) are what the ${card(b)} reimburses.` },
  { kind: "travel", merchant: /delta|united|american airlines|southwest|alaska air|jetblue|airline|expedia|airbnb|hotel|marriott|hilton|hyatt|amtrak|lyft|uber|parking|toll|travel/i, item: /flight|airfare|hotel|train ticket|bag(gage)? fee|checked bag/i, categories: CREDIT, label: /travel|hotel/i, payWith: card, why: (b) => `This is a travel purchase, so the ${card(b)} covers it.` },
  { kind: "streaming", merchant: /netflix|disney|hulu|spotify|peacock|paramount|youtube|nytimes|new york times|wall street journal|wsj|\bmax\b|hbo|audible|sirius/i, item: /subscription|streaming/i, categories: CREDIT, label: /entertainment|digital/i, payWith: card, why: (b) => `Streaming and news subscriptions qualify for the ${card(b)}; bill it to that card so the monthly credit isn't wasted.` },
  { kind: "walmart", merchant: /walmart/i, categories: CREDIT, label: /walmart/i, payWith: card, why: (b) => `The ${card(b)} applies here.` },
  { kind: "lululemon", merchant: /lululemon/i, categories: CREDIT, label: /lululemon/i, payWith: card, why: (b) => `lululemon purchases trigger the ${card(b)}.` },
  { kind: "resy", merchant: /resy/i, categories: CREDIT, label: /resy/i, payWith: card, why: (b) => `Resy restaurants trigger the ${card(b)}.` },
  { kind: "doordash", merchant: /doordash/i, categories: CREDIT, label: /doordash/i, payWith: card, why: (b) => `DoorDash orders use the ${card(b)}.` },
  { kind: "lyft", merchant: /lyft/i, categories: CREDIT, label: /lyft/i, payWith: card, why: (b) => `Lyft rides use the ${card(b)}.` },
  { kind: "peloton", merchant: /peloton/i, categories: CREDIT, label: /peloton/i, payWith: card, why: (b) => `Peloton membership uses the ${card(b)}.` },
  { kind: "stubhub", merchant: /stubhub|viagogo/i, categories: CREDIT, label: /stubhub/i, payWith: card, why: (b) => `StubHub tickets use the ${card(b)}.` },
  { kind: "dunkin", merchant: /dunkin/i, categories: CREDIT, label: /dunkin/i, payWith: card, why: (b) => `Dunkin' uses the ${card(b)}.` },
  { kind: "medical", item: MEDICAL, categories: ["fsa", "hsa"], label: /^(?!.*contribution room)/i, payWith: (b) => `FSA/HSA card (${b.label})`, why: (b, items) => `${list(items)} ${items.length > 1 ? "are" : "is"} FSA/HSA-eligible medical care, so your ${b.label.toLowerCase()} pays for it pre-tax.` },
  { kind: "childcare", merchant: /daycare|childcare|preschool|kindercare|bright horizons|after[- ]?school|day camp/i, item: /daycare|childcare|preschool|after[- ]?school|summer day camp|day camp|nanny|babysit/i, categories: ["dcfsa"], payWith: (b) => `Dependent care FSA (${b.label})`, why: () => `Childcare for a dependent under 13 is a dependent care FSA expense. Pay, then submit the receipt.` },
  { kind: "fitness", merchant: /gym|fitness|yoga|pilates|classpass|equinox|planet fitness|orangetheory|crunch|24 hour|climbing/i, item: /gym|membership|yoga|pilates|classpass|massage|running shoes|dumbbell|fitness/i, categories: ["stipend"], label: /wellness|lifestyle/i, payWith: (b) => `${b.label} (reimbursement)`, why: (b) => `Fitness is what your ${b.label.toLowerCase()} is for. Pay, then upload the receipt to your stipend portal.` },
  { kind: "learning", merchant: /udemy|coursera|masterclass|barnes|bookstore|o'?reilly|kindle|edx|skillshare/i, item: /\bbooks?\b|course|workshop|conference|textbook|certification|tuition/i, categories: ["stipend"], label: /learning|lifestyle/i, payWith: (b) => `${b.label} (reimbursement)`, why: (b) => `Books and courses are covered by your ${b.label.toLowerCase()}.` },
  { kind: "home_office", item: /monitor|desk|office chair|keyboard|webcam|headset|standing desk/i, categories: ["stipend"], label: /home office|lifestyle/i, payWith: (b) => `${b.label} (reimbursement)`, why: (b) => `Home office gear is covered by your ${b.label.toLowerCase()}.` },
  { kind: "campus_dining", merchant: /dining|cafeteria|campus|bear market|crossroads|dining hall/i, categories: ["dining"], payWith: (b) => b.label, why: (b) => `${b.label} work here and don't carry over.` },
  { kind: "amazon", merchant: /amazon/i, categories: ["rotating"], label: /amazon/i, rate: 0.05, payWith: (b) => `${card(b).replace(/ Q4.*$/, "")} (activate 5% first)`, why: () => `Amazon is a 5% category on Freedom Flex this quarter. Activate it before you check out.` },
];

const KINDS = RULES.map((r) => r.kind) as [string, ...string[]];
const round = (n: number) => Math.round(n * 100) / 100;
const daysUntil = (iso: string, now = Date.now()) => Math.ceil((new Date(`${iso}T23:59:59`).getTime() - now) / 86_400_000);

function sunscreenOk(name: string) {
  if (!/sunscreen|spf/i.test(name)) return true;
  const spf = name.match(/spf\s*(\d+)/i);
  return !spf || Number(spf[1]) >= 15; // IRS: broad-spectrum SPF 15+
}

function itemMatches(rule: Rule, name: string) {
  if (rule.kind === "medical") return MEDICAL.test(name) && !NOT_MEDICAL.test(name) && sunscreenOk(name);
  return Boolean(rule.item?.test(name));
}

// Balances the user actually has, still has money in, and hasn't already used up.
function usable(state: AppState): Balance[] {
  const done = new Set(state.tiles.filter((t) => state.done.includes(t.id)).flatMap((t) => t.balanceIds));
  return (state.extraction?.balances ?? []).filter((b) => b.amount > 0 && !done.has(b.id) && daysUntil(b.deadline) >= 0);
}

function build(cart: Cart, state: AppState, hints: Record<number, string> = {}): Option[] {
  const balances = usable(state);
  const out: Option[] = [];
  for (const rule of RULES) {
    const merchantHit = Boolean(rule.merchant?.test(cart.merchant));
    const covered = cart.items.filter((it, i) => it.price > 0 && (rule.kind === "medical" ? itemMatches(rule, it.name) && hints[i] !== "none" : merchantHit || itemMatches(rule, it.name) || hints[i] === rule.kind));
    // Claude may only add medical items that our blocklist doesn't already rule out.
    if (rule.kind === "medical") cart.items.forEach((it, i) => { if (hints[i] === "medical" && !NOT_MEDICAL.test(it.name) && sunscreenOk(it.name) && !covered.includes(it)) covered.push(it); });
    if (!covered.length) continue;
    const price = covered.reduce((s, it) => s + it.price, 0);
    for (const b of balances) {
      if (!rule.categories.includes(b.category) || (rule.label && !rule.label.test(b.label))) continue;
      if (out.some((o) => o.benefitId === b.id)) continue; // one option per balance (first rule wins)
      const rescued = round(rule.rate ? Math.min(price, 1500) * rule.rate : Math.min(price, b.amount));
      if (rescued <= 0) continue;
      const tile = state.tiles.find((t) => t.balanceIds.includes(b.id));
      const names = covered.map((c) => c.name);
      out.push({ payWith: rule.payWith(b), benefitId: b.id, rescued, why: rule.why(b, names), deadline: b.deadline, daysLeft: tile?.daysLeft ?? daysUntil(b.deadline), cite: b.source.text, items: names });
    }
  }
  return out.sort((a, b) => b.rescued - a.rescued || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}

// Greedy split: each item goes to the best option that covers it and still has room.
function split(cart: Cart, options: Option[], state: AppState): string | undefined {
  const balances = new Map((state.extraction?.balances ?? []).map((b) => [b.id, b]));
  const room = new Map(options.map((o) => [o, o.benefitId && balances.get(o.benefitId)?.category !== "rotating" ? o.rescued : Infinity]));
  const legs = new Map<string, number>();
  let rest = 0;
  for (const it of cart.items) {
    let left = it.price;
    for (const o of options) {
      if (left <= 0) break;
      if (!o.items?.includes(it.name) || o.payWith.includes("5%")) continue;
      const take = Math.min(left, room.get(o) ?? 0);
      if (take <= 0) continue;
      room.set(o, (room.get(o) ?? 0) - take);
      legs.set(o.payWith, (legs.get(o.payWith) ?? 0) + take);
      left -= take;
    }
    rest += left;
  }
  if (!legs.size || (legs.size === 1 && rest <= 0.005)) return undefined;
  const usd = (n: number) => `$${n.toFixed(2)}`;
  const parts = [...legs].map(([who, amt]) => `${usd(amt)} on ${who}`);
  if (rest > 0.005) parts.push(`the remaining ${usd(rest)} on your everyday card`);
  return `Split it: ${parts.join(", then ")}.`;
}

function notesFor(cart: Cart, state: AppState, options: Option[]): string[] {
  const notes: string[] = [];
  const balances = usable(state);
  const skipped = cart.items.filter((it) => /sunscreen|spf/i.test(it.name) && !sunscreenOk(it.name));
  if (skipped.length) notes.push(`${list(skipped.map((s) => s.name))}: below SPF 15, so it isn't FSA-eligible.`);
  const blocked = cart.items.filter((it) => NOT_MEDICAL.test(it.name) && options.some((o) => o.benefitId && /fsa|hsa/i.test(o.payWith)));
  if (blocked.length) notes.push(`${list(blocked.map((b) => b.name))} ${blocked.length > 1 ? "aren't" : "isn't"} medical care. Pay for ${blocked.length > 1 ? "them" : "it"} separately; Ruth won't approve it on the FSA.`);
  if (options.some((o) => /fsa|hsa/i.test(o.payWith))) notes.push("Ruth only approves FSA buys you actually need. Don't stock up just to spend the balance.");
  for (const b of balances.filter((b) => b.category === "price_adjust")) {
    const words = b.label.replace(/^Price watch:\s*/i, "").split(/\s+at\s+/i)[0].toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    if (cart.items.some((it) => words.some((w) => it.name.toLowerCase().includes(w)))) notes.push(`You already bought this (${b.label.replace(/^Price watch:\s*/i, "")}). Ask for a price adjustment before buying it again.`);
  }
  if (/american airlines|\baa\b/i.test(cart.merchant)) {
    const miles = balances.find((b) => b.category === "points" && /aadvantage/i.test(b.label));
    if (miles) notes.push(`Any AAdvantage purchase resets your ${miles.amount.toLocaleString("en-US")} miles' expiration clock (expires ${miles.deadline}).`);
  }
  if (!options.length) notes.push("Nothing you have that's expiring covers this cart. Use your everyday card.");
  return notes;
}

const ClassifySchema = z.object({
  items: z.array(z.object({ index: z.number().int(), kind: z.enum([...KINDS, "none"]).describe("which benefit kind this item belongs to, or none") })),
  whys: z.array(z.object({ benefitId: z.string(), why: z.string().describe("one or two plain sentences, no numbers that aren't in the input") })),
});

export async function advise(cart: Cart, state: AppState): Promise<Advice> {
  const clean: Cart = { ...cart, merchant: (cart.merchant ?? "").trim(), items: (cart.items ?? []).filter((i) => i.name?.trim()).map((i) => ({ name: i.name.trim(), price: Math.max(0, Number(i.price) || 0) })) };
  let options = build(clean, state);
  let engine: Advice["engine"] = "rules";

  const unmatched = clean.items.map((it, i) => ({ ...it, i })).filter((it) => !options.some((o) => o.items?.includes(it.name)));
  if (claudeEnabled() && (unmatched.length || options.length)) {
    const kinds = RULES.map((r) => `${r.kind}: ${r.merchant?.source ?? ""} ${r.kind === "medical" ? "FSA/HSA-eligible medical care (IRS Pub 502)" : r.item?.source ?? ""}`.trim()).join("\n");
    const res = await callStructured({
      system: "You help someone pick how to pay for a purchase using benefits that are about to expire. Classify each listed cart item into one benefit kind, or none if unsure. Then, for each option given, rewrite its 'why' as one short, plain sentence in Ruth's voice: friendly and direct, no metaphors, no dates or dollar amounts (the app shows those). Say what triggers the benefit and any condition the user must meet. Never mention a benefit or number not in the input.",
      user: `Merchant: ${clean.merchant}\nItems to classify:\n${unmatched.map((u) => `${u.i}. ${u.name} ($${u.price})`).join("\n") || "(none)"}\n\nKinds:\n${kinds}\n\nOptions to explain:\n${JSON.stringify(options.map((o) => ({ benefitId: o.benefitId, payWith: o.payWith, rescued: o.rescued, deadline: o.deadline, why: o.why, items: o.items })))}`,
      schema: ClassifySchema,
      effort: "low",
    });
    if (res) {
      engine = "claude";
      const hints: Record<number, string> = {};
      for (const h of res.items) if (unmatched.some((u) => u.i === h.index)) hints[h.index] = h.kind;
      if (Object.values(hints).some((k) => k !== "none")) options = build(clean, state, hints);
      for (const w of res.whys) { const o = options.find((x) => x.benefitId === w.benefitId); if (o && w.why.trim()) o.why = w.why.trim(); }
    }
  }

  const notes = notesFor(clean, state, options);
  const splits = split(clean, options, state);
  const total = clean.items.reduce((s, i) => s + i.price, 0);
  options.push({ payWith: "Your everyday card", rescued: 0, why: options.length ? "Use this for anything the options above don't cover." : "Nothing expiring covers this, so pay as usual.", items: clean.items.map((i) => i.name) });
  if (total <= 0) notes.unshift("Add a price to each item so Ruth can do the math.");
  return { options, best: 0, splits, notes, engine };
}
