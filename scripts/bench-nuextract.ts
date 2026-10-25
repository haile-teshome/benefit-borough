// NuExtract3 with its native template prompt, one document at a time, scored on the same answer key.
import { SAMPLE_DOCS } from "../lib/documents";
import { mockExtraction } from "../lib/engine/extract";

const MODEL = "hf.co/numind/NuExtract3-GGUF:Q8_0";
const template = JSON.stringify({ balances: [{ label: "verbatim-string", amount: "number", deadline: "date-time", source_span: "verbatim-string" }] }, null, 2);

async function main() {
  const key = mockExtraction().balances;
  const t0 = Date.now();
  const got: { amount: number; source_span: string; doc: string }[] = [];
  for (const d of SAMPLE_DOCS) {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, stream: false, think: false, options: { temperature: 0, num_ctx: 16384 },
        messages: [{ role: "user", content: `# Template:\n${template}\n# Context:\nEvery money amount that expires, resets, is forfeited, or must be claimed or acted on by a deadline.\n\n${d.text}` }] }),
    });
    const j = (await res.json()) as { message?: { content?: string } };
    try {
      const out = JSON.parse((j.message?.content ?? "").replace(/^```json|```$/g, "").trim()) as { balances?: { amount?: number; source_span?: string }[] };
      for (const b of out.balances ?? []) if (typeof b.amount === "number") got.push({ amount: b.amount, source_span: b.source_span ?? "", doc: d.text });
    } catch { console.log("unparseable output for", d.id, (j.message?.content ?? "").slice(0, 120)); }
  }
  const grounded = got.filter((g) => g.source_span && g.doc.includes(g.source_span) && g.source_span.includes(String(Math.trunc(g.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")) || g.doc.includes(g.source_span));
  const hit = key.filter((k) => grounded.some((g) => Math.abs(g.amount - k.amount) < 0.01));
  console.log(`extract  NuExtract3 native template, per document: found ${hit.length}/${key.length} known balances · ${grounded.length} grounded of ${got.length} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
void main();
