import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ALL_VOICES, VOICE_SPEED } from "@/lib/valley/people";

// Villager and Ruth voices (Cartesia TTS), built to start speaking the moment a dialogue opens:
// POST registers a line and returns its id (the same text in the same voice always gets the same
// id); GET streams it, from the disk cache when it's been spoken before, otherwise straight from
// Cartesia as it's generated, so <audio> starts playing before the line is finished. The game
// registers a villager's greeting as you walk up to them, before you press E.
// POST answers 204 when Cartesia isn't configured.
const MODEL = "sonic-3";
const DIR = path.join(process.cwd(), ".data", "voice-cache");
const lines = new Map<string, { text: string; voice: string; speed: number }>();

const fileFor = (id: string) => path.join(DIR, `${id}.mp3`);

export async function POST(req: Request) {
  const key = process.env.CARTESIA_API_KEY, fallback = process.env.CARTESIA_VOICE_ID;
  if (!key || !fallback) return new NextResponse(null, { status: 204 });
  const { text, voice: who } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 });
  const voice = who && ALL_VOICES.has(who) ? who : fallback; // only voices cast in the borough
  const speed = VOICE_SPEED.get(voice) ?? 1;
  const line = text.trim().slice(0, 400);
  const id = crypto.createHash("sha256").update(`${MODEL}|${voice}|${speed}|${line}`).digest("hex").slice(0, 24);
  lines.set(id, { text: line, voice, speed });
  return NextResponse.json({ id, cached: fs.existsSync(fileFor(id)) });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{24}$/.test(id)) return new NextResponse(null, { status: 400 });
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" };
  if (fs.existsSync(fileFor(id))) return new NextResponse(fs.readFileSync(fileFor(id)), { headers });
  const line = lines.get(id);
  const key = process.env.CARTESIA_API_KEY;
  if (!line || !key) return new NextResponse(null, { status: 404 });
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: MODEL, transcript: line.text, voice: { mode: "id", id: line.voice }, language: "en",
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
      ...(line.speed !== 1 ? { generation_config: { speed: line.speed } } : {}),
    }),
  });
  if (!res.ok || !res.body) { console.warn(`[cartesia] ${res.status}: ${await res.text().catch(() => "")}`); return new NextResponse(null, { status: 502 }); }
  // One copy plays now; the other is saved, so this line is instant next time.
  const [play, keep] = res.body.tee();
  void new Response(keep).arrayBuffer().then((buf) => {
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(fileFor(id), Buffer.from(buf)); } catch { /* cache is best-effort */ }
  }).catch(() => {});
  return new NextResponse(play, { headers });
}
