import { NextResponse } from "next/server";
import { challenge } from "@/lib/pipeline";

export async function POST(req: Request) {
  const { pid, key, message } = (await req.json()) as { pid?: string; key: string; message: string };
  if (!message?.trim()) return NextResponse.json({ error: "Say something to Ruth first" }, { status: 400 });
  try {
    return NextResponse.json(await challenge(key, message, pid));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
