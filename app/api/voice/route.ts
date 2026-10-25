import { NextResponse } from "next/server";

// Ruth's voice: short lines spoken with Cartesia TTS. 204 when Cartesia isn't configured.
export async function POST(req: Request) {
  const key = process.env.CARTESIA_API_KEY, voice = process.env.CARTESIA_VOICE_ID;
  if (!key || !voice) return new NextResponse(null, { status: 204 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: "sonic-2", transcript: text.slice(0, 400), voice: { mode: "id", id: voice }, output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 }, language: "en" }),
  });
  if (!res.ok) { console.warn(`[cartesia] ${res.status}: ${await res.text()}`); return new NextResponse(null, { status: 204 }); }
  return new NextResponse(await res.arrayBuffer(), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
