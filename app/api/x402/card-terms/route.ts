import { NextResponse, type NextRequest } from "next/server";
import { latestReport } from "@/lib/integrations/terms-watch";
import { MARKET } from "@/lib/integrations/x402";
import { paywall } from "@/lib/x402-server";

// The Card House sells "are these card terms still current?" from the Benefit Terms Watcher.
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<NextResponse<unknown>> {
  const plan = req.nextUrl.searchParams.get("plan") ?? "";
  const r = latestReport();
  const page = r.pages.find((p) => p.planId === plan && p.ok);
  if (!page) return NextResponse.json({ error: "No recent check for that plan" }, { status: 404 });
  return NextResponse.json({ plan, checkedAt: page.fetchedAt, url: page.url, engine: r.engine, findings: page.findings });
}

export const GET = paywall(handler, MARKET.terms.price, MARKET.terms.what);
