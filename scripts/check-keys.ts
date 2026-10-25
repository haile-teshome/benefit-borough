// Checks each configured integration with one tiny request. Prints status only, never key values.
// Run: npx tsx --env-file=.env.local scripts/check-keys.ts
import { z } from "zod";
import { callStructured, claudeEnabled, MODEL } from "../lib/engine/claude";

async function claude() {
  if (!claudeEnabled()) return "not set";
  const out = await callStructured({ system: "Reply with ok=true.", user: "ping", schema: z.object({ ok: z.boolean() }), effort: "low" });
  return out?.ok ? `ok (${MODEL})` : "failed (see warning above)";
}

async function nessie() {
  const key = process.env.NESSIE_API_KEY;
  if (!key) return "not set";
  const res = await fetch(`https://api.nessieisreal.com/customers?key=${encodeURIComponent(key)}`);
  return res.ok ? `ok (${((await res.json()) as unknown[]).length} customers)` : `failed (HTTP ${res.status})`;
}

async function cartesia() {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) return "not set";
  const res = await fetch("https://api.cartesia.ai/voices?limit=1", { headers: { "X-API-Key": key, "Cartesia-Version": "2025-04-16" } });
  return res.ok ? `ok${process.env.CARTESIA_VOICE_ID ? "" : " (no voice chosen yet)"}` : `failed (HTTP ${res.status})`;
}

async function main() {
  for (const [name, fn] of [["Claude", claude], ["Nessie", nessie], ["Cartesia", cartesia]] as const) {
    console.log(`${name}: ${await fn().catch((e: Error) => `failed (${e.message})`)}`);
  }
}
void main();
