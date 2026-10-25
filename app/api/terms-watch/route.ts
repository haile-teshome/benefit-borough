import { NextResponse } from "next/server";
import { LIBRARY } from "@/lib/library/catalog";
import { latestReport, runTermsWatch } from "@/lib/integrations/terms-watch";

// The fine-print watcher: GET returns the latest report; POST re-checks the library's source pages now.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET() {
  return NextResponse.json(latestReport());
}

export async function POST() {
  return NextResponse.json(await runTermsWatch(LIBRARY, { force: true }));
}
