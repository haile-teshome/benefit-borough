import type { Action, DispatchResult } from "../types";

// Booking call. With CARTESIA_API_KEY + CARTESIA_VOICE_ID set, the agent's lines are voiced by
// Cartesia TTS and played in the browser; otherwise the scripted call runs as text.
// A real outbound phone call needs a Cartesia agent + phone number; this is the seam for it.
export async function bookingCall(action: Action): Promise<DispatchResult> {
  const p = action.payload;
  const fmt = (d: string | number) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const agentLine = `Hi, I'm calling on behalf of ${p.patient} to book ${p.thisYear} on ${fmt(p.date)}${p.nextYear ? `, and ${p.nextYear} on ${fmt(p.nextDate)}` : ""}. Is that available?`;
  const transcript = [
    `Dialing ${p.to} at ${p.phone}…`,
    `Expire: ${agentLine}`,
    `${p.to}: Let me check… yes, ${fmt(p.date)} at 10:30 works${p.nextYear ? `, and ${fmt(p.nextDate)} at 9:00` : ""}.`,
    `Expire: Great, please book ${p.nextYear ? "both" : "it"}. Thank you.`,
    `${p.to}: You're all set. Confirmation sent to the patient's email.`,
    "Call ended — booking confirmed.",
  ];
  const confirmation = `BK-${String(p.date).replaceAll("-", "")}-${String(p.to).slice(0, 3).toUpperCase()}`;

  const key = process.env.CARTESIA_API_KEY;
  const voice = process.env.CARTESIA_VOICE_ID;
  if (key && voice) {
    try {
      const res = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: "sonic-2",
          transcript: agentLine,
          voice: { mode: "id", id: voice },
          output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
          language: "en",
        }),
      });
      if (res.ok) {
        const audioBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
        return { status: "confirmed", confirmation, transcript, audioBase64, integration: "Cartesia", mocked: false };
      }
      console.warn(`[cartesia] ${res.status}: ${await res.text()}`);
    } catch (err) {
      console.warn("[cartesia] request failed, using scripted call", err);
    }
  }
  return { status: "confirmed", confirmation, transcript, integration: "Cartesia (mock)", mocked: true };
}
