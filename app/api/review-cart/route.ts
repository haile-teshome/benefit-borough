import { NextResponse } from "next/server";
import { reviewCart } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { balanceId, items, pid } = (await req.json()) as { balanceId: string; items: string[]; pid?: string };
  try {
    return NextResponse.json(await reviewCart(balanceId, items, pid));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
