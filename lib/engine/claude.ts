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
// searches can pause mid-turn; we resume until Claude finishes or we hit the limit. The search
// budget spans every resumed turn (each turn is offered only what's left, at least one).
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
  const searched = new Set<string>(); // a resumed turn can repeat earlier blocks: count each search once
  const budget = opts.maxSearches ?? 4;
  let wrapUp = false; // once the budget is spent, one last resume to write the answer, then stop
  try {
    for (let turn = 0; turn < 4; turn++) {
      const res = await client.beta.messages.parse({
        model: opts.model ?? MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: Math.max(1, budget - searches) }],
        output_config: { effort: opts.effort ?? "low", format: betaZodOutputFormat(opts.schema) },
        system: opts.system,
        messages,
      });
      // Only web searches count: dynamic filtering also runs code-execution steps, which aren't searches.
      for (const b of res.content) if (b.type === "server_tool_use" && b.name === "web_search") searched.add(b.id);
      searches = searched.size;
      if (process.env.NODE_ENV !== "production") console.info(`[search] turn ${turn + 1}: ${searches}/${budget} searches, ${res.content.filter((b) => b.type === "server_tool_use").length - searches} filtering steps (${res.stop_reason})`);
      // Out of budget mid-search: one last turn to finish the answer, never a run of more searches.
      if (res.stop_reason === "pause_turn" && searches >= budget) { if (wrapUp) break; wrapUp = true; }
      if (res.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] }); continue; }
      if (res.stop_reason === "refusal") return { data: null, searches };
      if (process.env.DEBUG_SEARCH) console.log("[search]", res.stop_reason, JSON.stringify(res.parsed_output)?.slice(0, 300), res.content.filter((x) => x.type === "text").map((x) => (x as { text: string }).text.slice(0, 300)));
      return { data: (res.parsed_output as z.infer<S> | null) ?? null, searches };
    }
  } catch (err) {
    console.warn("[claude] search failed", err instanceof Anthropic.APIError ? `${err.status} ${err.message.slice(0, 300)}` : err);
  }
  return { data: null, searches };
}

// Read a photo or a scanned PDF: Claude transcribes every line of text (one table row per line,
// amounts and dates exactly as printed) so the normal pipeline can work from it.
export async function transcribe(data: ArrayBuffer, mediaType: string): Promise<string> {
  client ??= new Anthropic();
  const b64 = Buffer.from(data).toString("base64");
  const source = mediaType === "application/pdf"
    ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const)
    : ({ type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: b64 } } as const);
  const res = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: [source, { type: "text", text: "Transcribe all the text in this document exactly as printed. Keep one line of text per line, put each table row on a single line, and copy every amount, date, plan name and rule word for word. Output only the transcription." }] }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
}
