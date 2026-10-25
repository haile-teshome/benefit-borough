import { NextResponse } from "next/server";
import { answer } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { pid, tileId, reply } = (await req.json()) as { pid?: string; tileId: string; reply: "go" | "keep" };
  try {
    return NextResponse.json({ state: await answer(tileId, reply === "keep" ? "keep" : "go", pid) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
