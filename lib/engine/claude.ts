import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";

export const claudeEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.EXPIRE_MOCK_CLAUDE !== "1";

let client: Anthropic | null = null;

// One structured-output call. Returns null on refusal or parse failure so callers fall back
// to the deterministic engine instead of showing the user a guess.
export async function callStructured<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  model?: string;
}): Promise<z.infer<S> | null> {
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: opts.model ?? MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    if (res.stop_reason === "refusal") return null;
    return (res.parsed_output as z.infer<S> | null) ?? null;
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("[claude] rate limited, using fallback engine");
    else if (err instanceof Anthropic.APIError) console.warn(`[claude] API error ${err.status}, using fallback engine`);
    else console.warn("[claude] call failed, using fallback engine", err);
    return null;
  }
}

// A structured answer that may search the web first (Claude's web search server tool). Long
// searches can pause mid-turn; we resume until Claude finishes or we hit the limit.
export async function searchStructured<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  maxSearches?: number;
  effort?: "low" | "medium" | "high";
  model?: string;
}): Promise<{ data: z.infer<S> | null; searches: number }> {
  client ??= new Anthropic();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: opts.user }];
  let searches = 0;
  try {
    for (let turn = 0; turn < 4; turn++) {
      const res = await client.beta.messages.parse({
        model: opts.model ?? MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: opts.maxSearches ?? 4 }],
        output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
        system: opts.system,
        messages,
      });
      searches += res.content.filter((b) => b.type === "server_tool_use").length;
      if (res.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }); continue; }
      if (res.stop_reason === "refusal") return { data: null, searches };
      if (process.env.DEBUG_SEARCH) console.log("[search]", res.stop_reason, JSON.stringify(res.parsed_output)?.slice(0, 300), res.content.filter((x) => x.type === "text").map((x) => (x as { text: string }).text.slice(0, 300)));
      return { data: (res.parsed_output as z.infer<S> | null) ?? null, searches };
    }
  } catch (err) {
    console.warn("[claude] search failed", err instanceof Anthropic.APIError ? err.status : err);
  }
  return { data: null, searches };
}
