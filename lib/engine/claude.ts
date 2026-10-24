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
}): Promise<z.infer<S> | null> {
  client ??= new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: MODEL,
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
