import { NextResponse } from "next/server";
import { dispatch } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { tileId, pid } = (await req.json()) as { tileId: string; pid?: string };
  try {
    return NextResponse.json(await dispatch(tileId, pid));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
