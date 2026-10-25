import { z } from "zod";
import { claudeEnabled } from "./engine/claude";
import { buildDoc, type Answers } from "./library/build";
import { LIBRARY } from "./library/catalog";
import { scan } from "./pipeline";
import { hydrate, load, log, save } from "./store";
import { fresh, record } from "./rewards";
import type { AppState } from "./types";
import { structured } from "./engine/llm";

// The weekly check-in, by form or by voice: update the answers behind your planted library plans,
// and say what's left of any plan limit from an uploaded guide, then rescan so the farm matches
// your week. Harvests already confirmed stay confirmed. Plans you don't have are reported, not applied.
export async function applyCheckin(pid: string | null | undefined, updates: Record<string, Answers>, how: "form" | "voice" = "form", balances: Record<string, number> = {}) {
  await hydrate(pid);
  const s = load(pid);
  const planted = new Set(s.docs.map((d) => d.meta?.plan).filter(Boolean));
  const ignored = Object.keys(updates ?? {}).filter((plan) => !planted.has(plan));
  const limits = new Set((s.extraction?.balances ?? []).filter((b) => b.basis === "plan_limit").map((b) => b.id));
  for (const [id, v] of Object.entries(balances ?? {})) {
    if (limits.has(id) && Number.isFinite(v) && v >= 0) (s.myBalances ??= {})[id] = Math.round(v * 100) / 100;
    else ignored.push(id);
  }
  const docs = s.docs.map((d) => {
    const plan = d.meta?.plan;
    if (!plan || !updates?.[plan]) return d;
    return buildDoc({ plan, answers: { ...(d.meta!.answers as Answers), ...updates[plan] } }) ?? d;
  });
  const state = await scan(docs, pid);
  state.checkedInAt = new Date().toISOString();
  const gained = record((state.rewards ??= fresh()), { kind: "checkin" });
  if (how === "voice") log(state, "checkin", `Voice check-in: updated ${Object.entries(updates).map(([p, a]) => `${p} (${Object.keys(a).join(", ")})`).join("; ")}`);
  save(state, pid);
  return { state, gained, ignored };
}

// What the person said → which answers change. Only questions the planted plans actually ask.
export async function understand(said: string, s: AppState): Promise<{ updates: Record<string, Answers>; changes: string[]; reply: string }> {
  const planted = s.docs.filter((d) => d.meta?.plan).map((d) => ({ doc: d, plan: LIBRARY.find((p) => p.id === d.meta!.plan)! })).filter((x) => x.plan);
  if (!planted.length) return { updates: {}, changes: [], reply: "Plant your plans first, then tell me what changed." };
  if (!claudeEnabled()) return { updates: {}, changes: [], reply: "I heard you, but I need Claude connected to understand check-ins by voice. Use the check-in form for now." };
  const catalog = planted.map(({ doc, plan }) => ({
    plan: plan.id, title: plan.title,
    questions: plan.questions.map((q) => ({ key: q.key, ask: q.ask, kind: q.kind, ...(q.kind === "choice" ? { options: q.options } : {}), ...(q.kind === "used" ? { items: (plan.credits ?? []).map((c) => ({ key: c.key, name: c.name })) } : {}), current: (doc.meta!.answers as Answers)[q.key] ?? null })),
  }));
  const out = await structured("checkin", {
    system: "You are Ruth, the careful reviewer in a benefits app. Turn what the person said into updates to their check-in answers. Only use plans and question keys from the catalog. Money and numbers as plain numbers. For 'used' questions return the full list of used credit keys (current ones plus new). For 'dental_used'-style running totals, add the new amount to the current value. If something is ambiguous, don't guess: leave it out and ask about it in the reply. Reply in one or two short, warm sentences, saying exactly what you changed.",
    user: `Catalog:\n${JSON.stringify(catalog)}\n\nThey said: "${said.slice(0, 600)}"`,
    schema: z.object({ updates: z.array(z.object({ plan: z.string(), key: z.string(), value: z.union([z.number(), z.string(), z.array(z.string())]), why: z.string() })), reply: z.string() }),
    effort: "low",
  });
  const updates: Record<string, Answers> = {};
  const changes: string[] = [];
  for (const u of out?.updates ?? []) {
    const p = planted.find((x) => x.plan.id === u.plan);
    const q = p?.plan.questions.find((x) => x.key === u.key);
    if (!p || !q) continue; // never invent a plan or a question
    if (q.kind === "used" && !Array.isArray(u.value)) continue;
    if (["money", "number", "percent"].includes(q.kind) && typeof u.value !== "number") continue;
    if (q.kind === "choice" && !q.options.includes(String(u.value))) continue;
    if (JSON.stringify(u.value) === JSON.stringify((p.doc.meta!.answers as Answers)[u.key])) continue; // unchanged, not an update
    (updates[u.plan] ??= {})[u.key] = u.value;
    changes.push(`${p.plan.title}: ${q.ask.replace(/:$/, "")} → ${Array.isArray(u.value) ? u.value.join(", ") : u.value}`);
  }
  return { updates, changes, reply: out?.reply ?? "Sorry, I didn't catch that. Could you say it another way?" };
}

// Cartesia speech-to-text (ink-whisper).
export async function transcribe(audio: Blob, name: string): Promise<string> {
  const key = process.env.CARTESIA_API_KEY;
  if (!key) throw new Error("Cartesia isn't connected");
  const form = new FormData();
  form.append("file", audio, name);
  form.append("model", "ink-whisper");
  form.append("language", "en");
  const res = await fetch("https://api.cartesia.ai/stt", { method: "POST", headers: { Authorization: `Bearer ${key}`, "X-API-Key": key, "Cartesia-Version": "2026-08-14" }, body: form, signal: AbortSignal.timeout(60_000) });
  const json = (await res.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
  if (!res.ok) throw new Error(`Cartesia STT ${res.status}: ${json.message ?? json.error ?? ""}`.trim());
  return (json.text ?? "").trim();
}
