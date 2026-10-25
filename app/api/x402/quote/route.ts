import { NextResponse, type NextRequest } from "next/server";
import { AGENTS, quote, type AgentId } from "@/lib/market/agents";
import { MARKET } from "@/lib/integrations/x402";
import { paywall } from "@/lib/x402-server";

// A shopkeeper agent's quote, sold over x402: it searches the web for what you need and returns
// its best offers. Settles only if it returns at least one offer.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const q = req.nextUrl.searchParams;
  const agent = q.get("agent") as AgentId;
  if (!AGENTS[agent]) return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  const out = await quote({ agent, need: q.get("need") ?? "", benefit: q.get("benefit") ?? "", constraint: q.get("constraint") ?? "", maxPrice: Number(q.get("max") ?? 100) });
  if (!out.offers.length) return NextResponse.json({ error: "No offers found" }, { status: 404 });
  return NextResponse.json({ agent, shop: AGENTS[agent].shop, ...out });
}

export const GET = paywall(handler, MARKET.quote.price, MARKET.quote.what);
