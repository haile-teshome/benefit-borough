import { NextResponse } from "next/server";
import { discover, type Who } from "@/lib/discover";

// Ruth looks up the benefits that come with your employer, health plan and school (Claude web
// search). Each fact cites its page; the onboarding shows them for you to confirm.
export async function POST(req: Request) {
  const who = (await req.json()) as Who;
  const clean = Object.fromEntries(Object.entries(who).map(([k, v]) => [k, typeof v === "string" ? v.trim().slice(0, 120) : undefined]).filter(([, v]) => v)) as Who;
  try {
    return NextResponse.json(await discover(clean));
  } catch (e) {
    return NextResponse.json({ found: null, error: (e as Error).message }, { status: 200 });
  }
}
