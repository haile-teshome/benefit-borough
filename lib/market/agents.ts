import { z } from "zod";
import { searchStructured } from "../engine/claude";

// The burrow's seller agents. Each shopkeeper searches the live web its own way and sells its
// quote to buyers (Ruth) over x402. Same request, different strategies: that's the market.

export type AgentId = "deal" | "quality" | "specialist";
export const AGENTS: Record<AgentId, { shop: string; keeper: string; strategy: string; prompt: string }> = {
  deal: { shop: "The Deal Desk", keeper: "Dealer Fen", strategy: "Lowest price that still does the job",
    prompt: "You are Dealer Fen, a bargain-hunting shopping agent. Find the cheapest products that genuinely meet the need. Skip anything with poor reviews (under 4.0 stars) or sketchy sellers." },
  quality: { shop: "Burrow General Store", keeper: "Scout Juniper", strategy: "Best reviewed within budget",
    prompt: "You are Scout Juniper, a quality-first shopping agent. Find the best-reviewed, most durable products that meet the need within the budget, from reputable US retailers." },
  specialist: { shop: "Pharmacy & Optical / The Card House", keeper: "Hazel & Rosa", strategy: "Only what this benefit actually covers",
    prompt: "You are a benefits specialist shopping agent. Find products that are clearly covered by the stated benefit (e.g. labeled HSA/FSA eligible, or sold by the merchant a card credit requires). Coverage first, then price." },
};

export const OfferSchema = z.object({
  offers: z.array(z.object({
    title: z.string(), merchant: z.string(), url: z.string().describe("the product page URL"), price: z.number().describe("current price in USD"),
    rating: z.number().nullable().describe("average star rating out of 5, if shown"), reviews: z.number().nullable().describe("number of reviews, if shown"),
    why: z.string().describe("one sentence: why this fits the need"),
  })).max(3),
});
export type RawOffer = z.infer<typeof OfferSchema>["offers"][number];

export type QuoteRequest = { agent: AgentId; need: string; benefit: string; constraint: string; maxPrice: number };

export async function quote(q: QuoteRequest, attempt = 1): Promise<{ offers: RawOffer[]; searches: number }> {
  const a = AGENTS[q.agent];
  const r = await searchStructured({
    system: `${a.prompt} Search the web for real products for sale right now. Use real product page URLs from major US retailers. Never invent a product, price or URL. Return up to 3 offers.`,
    user: `Need: ${q.need}\nPaying with: ${q.benefit}\nCoverage rule: ${q.constraint}\nBudget: up to $${q.maxPrice.toFixed(2)}`,
    schema: OfferSchema, maxSearches: 4,
  });
  const offers = (r.data?.offers ?? []).filter((o) => /^https?:\/\//.test(o.url) && o.price > 0);
  // A search that comes back empty gets one more try before the agent sits this one out.
  if (!offers.length && attempt < 2) { const again = await quote(q, attempt + 1); return { offers: again.offers, searches: r.searches + again.searches }; }
  return { offers, searches: r.searches };
}
