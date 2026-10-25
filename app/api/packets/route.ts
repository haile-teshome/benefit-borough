import { NextResponse } from "next/server";
import { attachReceipt, editPacketFields, prepare, saveProfile, submitPacket } from "@/lib/pipeline";
import type { Profile } from "@/lib/types";

// Ruth's outbox. prepare: Ruth fills the claim (never sends it). edit: you change fields.
// submit: you send the exact packet you reviewed. profile: details Ruth reuses on every form.
type Body =
  | { pid?: string; action: "prepare"; tileId: string }
  | { pid?: string; action: "edit"; packetId: string; values: Record<string, string> }
  | { pid?: string; action: "submit"; packetId: string; hash: string }
  | { pid?: string; action: "profile"; profile: Profile }
  | { pid?: string; action: "attach"; packetId: string; name: string; text: string };

export async function POST(req: Request) {
  const b = (await req.json()) as Body;
  try {
    if (b.action === "prepare") return NextResponse.json(await prepare(b.tileId, b.pid));
    if (b.action === "edit") return NextResponse.json(await editPacketFields(b.packetId, b.values ?? {}, b.pid));
    if (b.action === "submit") return NextResponse.json(await submitPacket(b.packetId, b.hash, b.pid));
    if (b.action === "attach") return NextResponse.json(await attachReceipt(b.packetId, b.name ?? "receipt", b.text ?? "", b.pid));
    if (b.action === "profile") return NextResponse.json({ state: await saveProfile(b.profile ?? {}, b.pid) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
