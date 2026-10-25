import { NextResponse } from "next/server";
import { advise, type Cart } from "@/lib/checkout/advise";
import { hydrate, load } from "@/lib/store";

// Before you buy: the best way to pay for a cart given the player's expiring benefits.
export async function POST(req: Request) {
  const { pid, cart } = (await req.json()) as { pid?: string; cart?: Cart };
  if (!cart || !Array.isArray(cart.items)) return NextResponse.json({ error: "cart with items is required" }, { status: 400 });
  try {
    await hydrate(pid);
    return NextResponse.json({ advice: await advise(cart, load(pid)) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
