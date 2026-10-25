import { NextResponse } from "next/server";
import { runQuest } from "@/lib/market/quest";

// The Benefit Bazaar: run a shopping quest with the borough's seller agents.
export const maxDuration = 300;
export async function POST(req: Request) {
  const b = (await req.json()) as { pid: string; benefitId: string; need: string; maxPrice?: number };
  try {
    return NextResponse.json({ quest: await runQuest(b.pid, b) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
