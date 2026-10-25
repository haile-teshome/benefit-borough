import { NextResponse, type NextRequest } from "next/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { apifyEnabled, livePrices } from "@/lib/integrations/apify";
import { FACILITATOR, X402_NETWORK, X402_PRICE } from "@/lib/integrations/x402";

// The Burrow's price desk: a live store price (via Apify) for $0.01 USDC per call, paid over x402.
// Settlement happens only after a successful response, so a failed lookup costs nothing.
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const urls = req.nextUrl.searchParams.getAll("u").slice(0, 5);
  if (!urls.length) return NextResponse.json({ error: "Pass ?u=<product url>" }, { status: 400 });
  if (!apifyEnabled()) return NextResponse.json({ error: "Price desk is closed (no Apify token)" }, { status: 503 });
  const prices = await livePrices(urls);
  if (urls.every((u) => prices[u] == null)) return NextResponse.json({ error: "No price found" }, { status: 502 });
  return NextResponse.json({ prices });
}

const payTo = process.env.X402_PAY_TO;
const server = new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(X402_NETWORK, new ExactEvmScheme());

export const GET = payTo
  ? withX402(handler, { accepts: [{ scheme: "exact", price: X402_PRICE, network: X402_NETWORK, payTo }], description: "Live store price for a Benefit Burrow price-match check", mimeType: "application/json" }, server)
  : async () => NextResponse.json({ error: "Price desk has no wallet (set X402_PAY_TO)" }, { status: 503 });
