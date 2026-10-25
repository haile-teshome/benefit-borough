import { z } from "zod";
import { callStructured, claudeEnabled, MODEL } from "./claude";

// Which model does which job. Anything that touches money (reading documents, Ruth's review) stays
// on the strongest model; lighter jobs use smaller Claude models or open models running locally in
// Ollama. Every answer is checked against its schema, and if a local model fails or returns
// something invalid, the task falls back to Claude.
//
// Override any route with an env var, e.g. LLM_CHAT=ollama:qwen2.5:7b or LLM_POLISH=claude:claude-haiku-5-5

export type Task = "extract" | "review" | "defend" | "optimize" | "checkin" | "polish" | "chat" | "advise" | "rank";
type Route = { provider: "claude" | "ollama"; model: string };

const OPUS = MODEL, SONNET = "claude-sonnet-5-5", HAIKU = "claude-haiku-5-5";
const DEFAULTS: Record<Task, Route> = {
  extract: { provider: "claude", model: OPUS }, // exact figures with a quoted source line
  review: { provider: "claude", model: OPUS }, // Ruth's safety check
  defend: { provider: "claude", model: OPUS }, // Ruth answering a pushback
  optimize: { provider: "claude", model: SONNET }, // one-line headlines over computed numbers
  rank: { provider: "claude", model: SONNET }, // Ruth's shopping review
  checkin: { provider: "claude", model: SONNET },
  advise: { provider: "claude", model: HAIKU },
  polish: { provider: "claude", model: HAIKU },
  chat: { provider: "claude", model: HAIKU },
};

export function routeFor(task: Task): Route {
  const env = process.env[`LLM_${task.toUpperCase()}`];
  if (env) { const i = env.indexOf(":"); return { provider: env.slice(0, i) as Route["provider"], model: env.slice(i + 1) }; }
  return DEFAULTS[task];
}

const OLLAMA = () => process.env.OLLAMA_URL ?? "http://localhost:11434";

// One structured call to a local model. Ollama enforces the JSON schema while generating.
export async function ollamaStructured<S extends z.ZodType>(model: string, opts: { system: string; user: string; schema: S; timeoutMs?: number }): Promise<z.infer<S> | null> {
  try {
    const res = await fetch(`${OLLAMA()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, format: z.toJSONSchema(opts.schema), options: { temperature: 0.2 }, messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }] }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { message?: { content?: string } };
    const parsed = opts.schema.safeParse(JSON.parse(json.message?.content ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type Ran<T> = { data: T | null; engine: string };

// Run a task on its model; local failures fall back to Claude (the task's Claude default, or Haiku).
export async function structured<S extends z.ZodType>(task: Task, opts: { system: string; user: string; schema: S; effort?: "low" | "medium" | "high" }): Promise<z.infer<S> | null> {
  return (await structuredWithEngine(task, opts)).data;
}

export async function structuredWithEngine<S extends z.ZodType>(task: Task, opts: { system: string; user: string; schema: S; effort?: "low" | "medium" | "high" }): Promise<Ran<z.infer<S>>> {
  const r = routeFor(task);
  if (r.provider === "ollama") {
    const out = await ollamaStructured(r.model, opts);
    if (out !== null) return { data: out, engine: `ollama:${r.model}` };
    console.warn(`[llm] ${task}: ${r.model} failed or returned invalid JSON; falling back to Claude`);
  }
  if (!claudeEnabled()) return { data: null, engine: "none" };
  const model = r.provider === "claude" ? r.model : DEFAULTS[task].provider === "claude" ? DEFAULTS[task].model : HAIKU;
  return { data: await callStructured({ ...opts, model }), engine: `claude:${model}` };
}
