// Multi-store price feeds for the Bazaar's seller agents. One search returns live offers from many
// retailers, so the agents compare real listings instead of guessing from web pages:
// - Apify Google Shopping scraper (APIFY_TOKEN, already used for live prices): about 40 offers from
//   many stores in a few seconds, with store, price, rating and review count. The link opens
//   Google Shopping's compare-stores page for that product.
// - SerpApi Google Shopping (SERPAPI_API_KEY): offers across thousands of stores, with price,
//   store, rating and review count. Free tier: 250 searches a month.
// - eBay Browse API (EBAY_CLIENT_ID + EBAY_CLIENT_SECRET): new, fixed-price listings with seller
//   feedback. Free: 5,000 calls a day.
// Both are optional; without them the agents search the web with Claude as before.

export type FeedOffer = { title: string; merchant: string; url: string; price: number; rating: number | null; reviews: number | null; why: string; source: "apify" | "google" | "ebay" };

export const serpEnabled = () => Boolean(process.env.SERPAPI_API_KEY);
export const ebayEnabled = () => Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
export const apifyShoppingEnabled = () => Boolean(process.env.APIFY_TOKEN) && process.env.APIFY_SHOPPING !== "off";
export const feedEnabled = () => apifyShoppingEnabled() || serpEnabled() || ebayEnabled();

const SHOPPING_ACTOR = process.env.APIFY_SHOPPING_ACTOR ?? "damilo~google-shopping-apify";
const money = (x: unknown) => { const n = parseFloat(String(x ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };
async function apifyShopping(q: string, maxPrice: number): Promise<FeedOffer[]> {
  const res = await fetch(`https://api.apify.com/v2/acts/${SHOPPING_ACTOR}/run-sync-get-dataset-items?timeout=40`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    body: JSON.stringify({ query: q, country: "us", language: "en", num: "40", max_pages: 1, date_range: "anytime" }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Apify shopping ${res.status}`);
  const items = (await res.json()) as { title?: string; source?: string; link?: string; price?: string | number; rating?: number; ratingCount?: number }[];
  return items.flatMap((r) => {
    const price = money(r.price);
    if (!r.title || !r.link || !price || price > maxPrice + 0.01) return [];
    return [{ title: r.title, merchant: r.source ?? "Google Shopping", url: r.link, price, rating: r.rating ?? null, reviews: r.ratingCount ?? null, why: r.source ? `Sold by ${r.source}, found on Google Shopping` : "Found on Google Shopping", source: "apify" as const }];
  });
}

async function googleShopping(q: string, maxPrice: number): Promise<FeedOffer[]> {
  const u = new URL("https://serpapi.com/search.json");
  u.search = new URLSearchParams({ engine: "google_shopping", q, gl: "us", hl: "en", num: "20", tbs: `mr:1,price:1,ppr_max:${Math.ceil(maxPrice)}`, api_key: process.env.SERPAPI_API_KEY! }).toString();
  const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`SerpApi ${res.status}`);
  const j = (await res.json()) as { shopping_results?: { title?: string; source?: string; extracted_price?: number; rating?: number; reviews?: number; product_link?: string; link?: string; delivery?: string }[] };
  return (j.shopping_results ?? []).flatMap((r) => {
    const url = r.link ?? r.product_link;
    if (!r.title || !url || !r.extracted_price) return [];
    return [{ title: r.title, merchant: r.source ?? "Google Shopping", url, price: r.extracted_price, rating: r.rating ?? null, reviews: r.reviews ?? null, why: [r.source && `Sold by ${r.source}`, r.delivery].filter(Boolean).join(". ") || "Listed on Google Shopping", source: "google" as const }];
  });
}

let ebayToken: { value: string; until: number } | null = null;
async function ebaySearch(q: string, maxPrice: number): Promise<FeedOffer[]> {
  if (!ebayToken || Date.now() > ebayToken.until) {
    const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
    const t = await fetch("https://api.ebay.com/identity/v1/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope", signal: AbortSignal.timeout(15_000) });
    if (!t.ok) throw new Error(`eBay token ${t.status}`);
    const tj = (await t.json()) as { access_token: string; expires_in: number };
    ebayToken = { value: tj.access_token, until: Date.now() + (tj.expires_in - 120) * 1000 };
  }
  const u = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  u.search = new URLSearchParams({ q, limit: "15", filter: `price:[..${Math.ceil(maxPrice)}],priceCurrency:USD,buyingOptions:{FIXED_PRICE},conditions:{NEW}` }).toString();
  const res = await fetch(u, { headers: { Authorization: `Bearer ${ebayToken.value}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_US" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`eBay ${res.status}`);
  const j = (await res.json()) as { itemSummaries?: { title?: string; itemWebUrl?: string; price?: { value?: string }; seller?: { username?: string; feedbackPercentage?: string; feedbackScore?: number } }[] };
  return (j.itemSummaries ?? []).flatMap((r) => {
    const price = parseFloat(r.price?.value ?? "");
    if (!r.title || !r.itemWebUrl || !price) return [];
    const pct = parseFloat(r.seller?.feedbackPercentage ?? "");
    // Seller feedback stands in for a product rating: 99% positive ≈ 4.95 stars.
    return [{ title: r.title, merchant: `eBay · ${r.seller?.username ?? "seller"}`, url: r.itemWebUrl, price, rating: pct ? Math.round(pct / 20 * 10) / 10 : null, reviews: r.seller?.feedbackScore ?? null, why: pct ? `New, fixed price; seller ${pct}% positive` : "New, fixed price on eBay", source: "ebay" as const }];
  });
}

// Every configured feed at once, cached for ten minutes per search so each agent (and the paid
// x402 route) shares one lookup.
const cache = new Map<string, { at: number; offers: FeedOffer[] }>();
export async function marketFeed(need: string, maxPrice: number): Promise<FeedOffer[]> {
  const key = `${need.toLowerCase()}|${Math.ceil(maxPrice)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.offers;
  const runs = [apifyShoppingEnabled() ? apifyShopping(need, maxPrice) : null, serpEnabled() ? googleShopping(need, maxPrice) : null, ebayEnabled() ? ebaySearch(need, maxPrice) : null].filter(Boolean) as Promise<FeedOffer[]>[];
  const settled = await Promise.allSettled(runs);
  for (const r of settled) if (r.status === "rejected") console.warn("[shopping] feed failed:", (r.reason as Error).message);
  const offers = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((o) => o.price > 0 && o.price <= maxPrice + 0.01);
  cache.set(key, { at: Date.now(), offers });
  return offers;
}

// How each agent picks from the feed. Fen: the cheapest listings that are well rated (or unrated
// from a feed that has no ratings). Juniper: the best reviewed, weighting rating by review count.
export function pickFrom(offers: FeedOffer[], agent: "deal" | "quality", n = 3): FeedOffer[] {
  if (agent === "deal") return offers.filter((o) => o.rating == null || o.rating >= 4).sort((a, b) => a.price - b.price).slice(0, n);
  const score = (o: FeedOffer) => (o.rating ?? 0) * Math.log10(10 + (o.reviews ?? 0));
  return offers.filter((o) => (o.rating ?? 0) >= 4.2).sort((a, b) => score(b) - score(a)).slice(0, n);
}
