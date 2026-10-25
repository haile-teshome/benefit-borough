import { NextResponse } from "next/server";
import type { Answers } from "@/lib/library/build";
import { applyCheckin } from "@/lib/checkin";

// The weekly check-in form: update the answers behind your planted plans, then rescan.
export async function POST(req: Request) {
  const { pid, updates } = (await req.json()) as { pid?: string; updates: Record<string, Answers> };
  return NextResponse.json(await applyCheckin(pid, updates));
}
