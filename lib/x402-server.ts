import { NextResponse, type NextRequest } from "next/server";
import { withX402, x402ResourceServer } from "@x402/next";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { FACILITATOR, X402_NETWORK } from "./integrations/x402";

// The borough's data market: each shop sells one kind of data to agents over x402. Payment settles
// only after a successful answer, so a failed lookup costs nothing.
let server: x402ResourceServer | null = null;
const resourceServer = () => (server ??= new x402ResourceServer(new HTTPFacilitatorClient({ url: FACILITATOR })).register(X402_NETWORK, new ExactEvmScheme()));

export function paywall(handler: (req: NextRequest) => Promise<NextResponse<unknown>>, price: string, description: string) {
  const payTo = process.env.X402_PAY_TO;
  if (!payTo) return async () => NextResponse.json({ error: "This desk has no wallet yet (set X402_PAY_TO)" }, { status: 503 });
  return withX402(handler, { accepts: [{ scheme: "exact", price, network: X402_NETWORK, payTo }], description, mimeType: "application/json" }, resourceServer());
}
