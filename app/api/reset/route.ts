import { NextResponse } from "next/server";
import { reset } from "@/lib/store";

export async function POST(req: Request) {
  const { pid } = (await req.json().catch(() => ({}))) as { pid?: string };
  return NextResponse.json({ state: reset(pid) });
}
