import { NextResponse } from "next/server";
import { reviewCart } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { balanceId, items } = (await req.json()) as { balanceId: string; items: string[] };
  try {
    return NextResponse.json(await reviewCart(balanceId, items));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
