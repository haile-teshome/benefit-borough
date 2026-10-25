// Ruth reads a call script aloud (Cartesia TTS), so you know exactly what to say when you call.
// Returns base64 MP3, or undefined when Cartesia isn't configured (the script is still on screen).
export async function ruthReads(text: string): Promise<string | undefined> {
  const key = process.env.CARTESIA_API_KEY, voice = process.env.CARTESIA_VOICE_ID;
  if (!key || !voice || !text.trim()) return undefined;
  try {
    const res = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: "sonic-2", transcript: text.slice(0, 600), voice: { mode: "id", id: voice }, output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 }, language: "en" }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer()).toString("base64");
    console.warn(`[cartesia] ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.warn("[cartesia] request failed", err);
  }
  return undefined;
}
