import { NextResponse } from "next/server";
import { reset } from "@/lib/store";

export function POST() {
  return NextResponse.json({ state: reset() });
}
