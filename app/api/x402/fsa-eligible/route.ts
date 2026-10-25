import { NextResponse, type NextRequest } from "next/server";
import { RULES } from "@/lib/checkout/advise";
import { MARKET } from "@/lib/integrations/x402";
import { paywall } from "@/lib/x402-server";

// The Pharmacy sells FSA/HSA eligibility checks for purchases.
export const dynamic = "force-dynamic";
const MEDICAL = RULES.find((r) => r.kind === "medical")!.item!;
const RX = /prescription|pharmacy|rx\b|copay|co-pay|dental|vision|optical|contact lens|glasses|bandage|first aid|thermometer/i;

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const items = req.nextUrl.searchParams.getAll("item").slice(0, 10);
  if (!items.length) return NextResponse.json({ error: "Pass ?item=<description>" }, { status: 400 });
  return NextResponse.json({ items: items.map((item) => ({ item, eligible: MEDICAL.test(item) || RX.test(item), basis: "IRS Publication 502 categories (medical care, prescriptions, first aid)" })) });
}

export const GET = paywall(handler, MARKET.eligibility.price, MARKET.eligibility.what);
