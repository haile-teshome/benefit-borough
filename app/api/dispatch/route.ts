import { NextResponse } from "next/server";
import { dispatch } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { tileId } = (await req.json()) as { tileId: string };
  try {
    return NextResponse.json(await dispatch(tileId));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
