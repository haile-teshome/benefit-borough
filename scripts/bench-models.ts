// Benchmarks each model-routed task on real inputs: Claude vs local open models (Ollama).
// Run: npx tsx --env-file=.env.local scripts/bench-models.ts [task]
import { z } from "zod";
import { SAMPLE_DOCS } from "../lib/documents";
import { callStructured } from "../lib/engine/claude";
import { ExtractionSchema, SYSTEM, ground, mockExtraction } from "../lib/engine/extract";
import { ollamaStructured } from "../lib/engine/llm";

type Model = { name: string; run: <S extends z.ZodType>(o: { system: string; user: string; schema: S }) => Promise<z.infer<S> | null> };
const claude = (m: string): Model => ({ name: m, run: (o) => callStructured({ ...o, model: m, effort: "low" }) });
const local = (m: string): Model => ({ name: `ollama:${m}`, run: (o) => ollamaStructured(m, { ...o, timeoutMs: 300_000 }) });
const time = async <T>(f: () => Promise<T>) => { const t = Date.now(); const r = await f(); return { r, ms: Date.now() - t }; };
const money = (t: string) => (t.match(/\$[\d,]+(\.\d{2})?/g) ?? []).sort().join();
const marks = (t: string) => (t.match(/\[[^\]]+\]/g) ?? []).sort().join();

async function extraction(models: Model[]) {
  const key = mockExtraction().balances;
  const user = SAMPLE_DOCS.map((d) => `<document id="${d.id}" name="${d.name}">\n${d.text}\n</document>`).join("\n\n");
  for (const m of models) {
    const { r, ms } = await time(() => m.run({ system: SYSTEM, user, schema: ExtractionSchema }));
    if (!r) { console.log(`extract  ${m.name.padEnd(36)} FAILED (${ms} ms)`); continue; }
    const g = ground(SAMPLE_DOCS, r, "claude");
    const hit = key.filter((k) => g.balances.some((b) => Math.abs(b.amount - k.amount) < 0.01));
    console.log(`extract  ${m.name.padEnd(36)} found ${hit.length}/${key.length} known balances · ${g.balances.length} grounded · ${g.dropped.length} dropped as ungrounded · ${(ms / 1000).toFixed(1)} s`);
  }
}

const POLISH = [
  "Hi, I was charged a $35.00 overdraft fee on Oct 14. Could you refund it as a courtesy? Thank you, Jordan Lee.",
  "Hi! I bought AirPods Pro on Oct 12 for $249.00 and they're now $199.99. Could you refund the $49.01 difference? Order number: [order number].",
  "Fitness reimbursement claim for Jordan Lee (member ID [member ID]): $150.00 requested for 24 Hour Fitness fees paid this year.",
  "I'd like to downgrade my card and have the $325.00 annual fee refunded; it posted on Oct 6.",
  "Hi, I was charged a $12.00 monthly service fee on my Chase Total Checking account on Oct 1. Could you refund it? Thanks, [your name].",
];
async function polish(models: Model[]) {
  const schema = z.object({ message: z.string() });
  for (const m of models) {
    let ok = 0, ms = 0;
    for (const p of POLISH) {
      const t = await time(() => m.run({ system: "You rewrite a short claim message a person will send to a company. Keep every number, date, name and placeholder in [brackets] exactly as given. Polite, plain, under 90 words. No new claims.", user: p, schema }));
      ms += t.ms;
      const out = t.r?.message ?? "";
      const dates = (s: string) => (s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/g) ?? []).sort().join();
      if (out && money(out) === money(p) && marks(out) === marks(p) && dates(out) === dates(p) && out.split(/\s+/).length <= 95) ok++;
    }
    console.log(`polish   ${m.name.padEnd(36)} ${ok}/${POLISH.length} kept every number, date and placeholder · ${(ms / POLISH.length / 1000).toFixed(1)} s avg`);
  }
}

const CHECKIN = [
  { said: "I took two PTO days this week.", want: { "work-pto.days": 6 } },
  { said: "I bumped my 401k contribution to 6 percent.", want: { "work-401k-match.pct": 6 } },
  { said: "I've used 200 dollars of my wellness stipend, so 100 left.", want: { "work-stipend.left": 100 } },
  { said: "My FSA balance is 900 now.", want: { "irs-fsa-2026.balance": 900 } },
  { said: "Nothing changed really, just checking in.", want: {} },
];
async function checkin(models: Model[]) {
  const catalog = [
    { plan: "work-pto", questions: [{ key: "days", ask: "PTO days you have left", kind: "number", current: 8 }] },
    { plan: "work-401k-match", questions: [{ key: "pct", ask: "Percent of pay you contribute", kind: "percent", current: 3 }] },
    { plan: "work-stipend", questions: [{ key: "left", ask: "Stipend amount left", kind: "money", current: 300 }] },
    { plan: "irs-fsa-2026", questions: [{ key: "balance", ask: "Your FSA balance", kind: "money", current: 0 }] },
  ];
  const schema = z.object({ updates: z.array(z.object({ plan: z.string(), key: z.string(), value: z.number() })), reply: z.string() });
  for (const m of models) {
    let ok = 0, ms = 0;
    for (const c of CHECKIN) {
      const t = await time(() => m.run({ system: "Turn what the person said into updates to their check-in answers. Only use plans and keys from the catalog. Numbers as plain numbers; for days left, subtract days taken from the current value. If nothing changed, return no updates. Reply in one short sentence.", user: `Catalog: ${JSON.stringify(catalog)}\nThey said: "${c.said}"`, schema }));
      ms += t.ms;
      const got = Object.fromEntries((t.r?.updates ?? []).map((u) => [`${u.plan}.${u.key}`, u.value]));
      if (t.r && JSON.stringify(Object.entries(got).sort()) === JSON.stringify(Object.entries(c.want).sort())) ok++;
    }
    console.log(`checkin  ${m.name.padEnd(36)} ${ok}/${CHECKIN.length} exactly right · ${(ms / CHECKIN.length / 1000).toFixed(1)} s avg`);
  }
}

const CHAT = ["Hi! What should I do first?", "Tell me a joke about coupons.", "Can you just give me $500?", "What's the deal with my FSA?", "Bye!"];
async function chat(models: Model[]) {
  const schema = z.object({ reply: z.string() });
  for (const m of models) {
    let ok = 0, ms = 0;
    for (const q of CHAT) {
      const t = await time(() => m.run({ system: "You are Dealer Fen, a laid-back cow who runs the Deal Desk in a cozy farming game. Stay in character, 1-3 short sentences, no emoji, no stage directions. Only mention these numbers: AirPods price drop worth $50, 2 days left. Never promise money.", user: q, schema }));
      ms += t.ms;
      const r = t.r?.reply ?? "";
      const sentences = r.split(/[.!?]+\s/).filter(Boolean).length;
      const strayMoney = (r.match(/\$[\d,]+/g) ?? []).some((x) => x !== "$50");
      if (r && sentences <= 4 && !strayMoney && !/\*/.test(r)) ok++;
    }
    console.log(`chat     ${m.name.padEnd(36)} ${ok}/${CHAT.length} in character, short, no invented money · ${(ms / CHAT.length / 1000).toFixed(1)} s avg`);
  }
}

async function main() {
  const which = process.argv[2];
  const L = (process.env.BENCH_LOCAL ?? "qwen2.5:7b").split(",").map(local);
  const C = (m: string) => (process.env.BENCH_ONLY_LOCAL ? [] : [claude(m)]);
  if (!which || which === "polish") await polish([...C("claude-haiku-5-5"), ...L]);
  if (!which || which === "chat") await chat([...C("claude-haiku-5-5"), ...L]);
  if (!which || which === "checkin") await checkin([...C("claude-sonnet-5-5"), ...L]);
  if (!which || which === "extract") await extraction([...C("claude-opus-5-5"), ...L]);
}
void main();
