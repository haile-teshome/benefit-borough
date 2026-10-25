import { NextResponse } from "next/server";
import { submitPacket } from "@/lib/pipeline";

// Harvests go through Ruth's outbox: you submit the exact packet you reviewed.
export async function POST(req: Request) {
  const { pid, packetId, hash } = (await req.json()) as { pid?: string; packetId?: string; hash?: string };
  try {
    if (!packetId || !hash) throw new Error("Review and submit Ruth's packet first; she never sends a claim on her own");
    return NextResponse.json(await submitPacket(packetId, hash, pid));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
