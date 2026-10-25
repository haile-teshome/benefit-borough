import { NextResponse, type NextRequest } from "next/server";
import { apifyEnabled, livePrices } from "@/lib/integrations/apify";
import { MARKET } from "@/lib/integrations/x402";
import { paywall } from "@/lib/x402-server";

// The Deal Desk sells a live store price (read with Apify).
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const urls = req.nextUrl.searchParams.getAll("u").slice(0, 5);
  if (!urls.length) return NextResponse.json({ error: "Pass ?u=<product url>" }, { status: 400 });
  if (!apifyEnabled()) return NextResponse.json({ error: "Price desk is closed (no Apify token)" }, { status: 503 });
  const prices = await livePrices(urls);
  if (urls.every((u) => prices[u] == null)) return NextResponse.json({ error: "No price found" }, { status: 502 });
  return NextResponse.json({ prices });
}

export const GET = paywall(handler, MARKET.prices.price, MARKET.prices.what);
