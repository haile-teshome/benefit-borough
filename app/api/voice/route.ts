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
// Cartesia allows a few generations at a time per plan, so they're queued here (CONCURRENCY), a
// line being generated is never generated twice, and when the account is out of credits we stop
// asking for a while. Any failure answers 503 and the game speaks that line as an animal instead.
// POST answers 204 when Cartesia isn't configured.
const MODEL = "sonic-3";
const DIR = path.join(process.cwd(), ".data", "voice-cache");
const CONCURRENCY = Number(process.env.CARTESIA_CONCURRENCY ?? 2);
const lines = new Map<string, { text: string; voice: string; speed: number }>();
const inflight = new Map<string, Promise<Buffer | null>>();
let active = 0, noCreditsUntil = 0;
const waiting: (() => void)[] = [];

const fileFor = (id: string) => path.join(DIR, `${id}.mp3`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function slot() { while (active >= CONCURRENCY) await new Promise<void>((r) => waiting.push(r)); active++; }
function release() { active--; waiting.shift()?.(); }
const unavailable = (why: string) => new NextResponse(null, { status: 503, headers: { "x-voice": why } });

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
  const cached = fs.existsSync(fileFor(id));
  return NextResponse.json({ id, cached, available: cached || Date.now() > noCreditsUntil });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f]{24}$/.test(id)) return new NextResponse(null, { status: 400 });
  const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" };
  if (fs.existsSync(fileFor(id))) return new NextResponse(new Uint8Array(fs.readFileSync(fileFor(id))), { headers });
  // Someone is already generating this line: wait for it rather than paying for it twice.
  const pending = inflight.get(id);
  if (pending) { const buf = await pending; return buf ? new NextResponse(new Uint8Array(buf), { headers }) : unavailable("failed"); }
  const line = lines.get(id);
  const key = process.env.CARTESIA_API_KEY;
  if (!line || !key) return new NextResponse(null, { status: 404 });
  if (Date.now() < noCreditsUntil) return unavailable("no-credits");

  let done!: (b: Buffer | null) => void;
  inflight.set(id, new Promise((r) => (done = r)));
  const finish = (b: Buffer | null) => { done(b); inflight.delete(id); };
  await slot();
  let res: Response | null = null;
  try {
    // Busy (429): wait a moment and try again, a few times.
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: MODEL, transcript: line.text, voice: { mode: "id", id: line.voice }, language: "en",
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
          ...(line.speed !== 1 ? { generation_config: { speed: line.speed } } : {}),
        }),
      });
      if (res.status !== 429) break;
      await sleep(400 * (attempt + 1));
    }
  } catch { res = null; }
  if (!res || !res.ok || !res.body) {
    release();
    finish(null);
    if (res?.status === 402) noCreditsUntil = Date.now() + 10 * 60_000; // out of credits: stop asking for 10 minutes
    console.warn(`[cartesia] ${res?.status ?? "network"}: ${(await res?.text().catch(() => ""))?.slice(0, 160) ?? ""}`);
    return unavailable(res?.status === 402 ? "no-credits" : "busy");
  }
  // One copy plays now; the other is saved, so this line is instant next time.
  const [play, keep] = res.body.tee();
  void new Response(keep).arrayBuffer().then((ab) => {
    const buf = Buffer.from(ab);
    try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(fileFor(id), buf); } catch { /* cache is best-effort */ }
    finish(buf);
  }).catch(() => finish(null)).finally(release);
  return new NextResponse(play, { headers });
}
