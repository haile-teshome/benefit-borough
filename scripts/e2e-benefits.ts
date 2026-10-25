// End-to-end check of every plan in the library: plant it with typical answers, run the real
// pipeline (extract, optimize, review), then see how each resulting benefit gets resolved:
// a claim form Ruth fills, a real destination to send it to, or a shopping quest in the Bazaar.
// Usage: npx tsx --env-file=.env.local scripts/e2e-benefits.ts [planId ...]
import fs from "node:fs";
import path from "node:path";
import { LIBRARY, type Plan } from "../lib/library/catalog";
import { buildDoc, type Answers } from "../lib/library/build";
import { scan } from "../lib/pipeline";
import { draftFor } from "../lib/claims/forms";
import { handoffFor } from "../lib/claims/destinations";
import { shoppable } from "../lib/market/shoppable";

const only = process.argv.slice(2);
const plans = LIBRARY.filter((p) => !only.length || only.includes(p.id));

// Realistic answers where a plan's defaults are zero (nothing at stake by default).
const REAL: Record<string, Answers> = {
  "cal-dining-2026": { balance: 600 }, "edu-drop-refund": { dropping: "Yes" }, "work-dcfsa": { balance: 1200, receipts: 400 },
  "work-vesting": { unvested: 8000, leaving: "Yes" }, "points-aadvantage": { balance: 40000 }, "points-marriott": { balance: 60000 },
  "points-hilton": { balance: 90000 }, "points-ihg": { balance: 30000 }, "irs-fsa-2026": { balance: 1400 },
};

function answersFor(p: Plan): Answers {
  const a: Answers = {};
  for (const q of p.questions) {
    if (q.kind === "used") { a[q.key] = q.key === "want" ? q.items.slice(0, 4) : []; continue; }
    if ("default" in q && q.default !== undefined) { a[q.key] = q.default; continue; }
    if (q.kind === "choice") a[q.key] = q.options[0];
    else if (q.kind === "date") a[q.key] = "2026-12-31";
    else if (q.kind === "percent") a[q.key] = 5;
    else if (q.kind === "money") a[q.key] = 500;
    else a[q.key] = 3;
  }
  return { ...a, ...REAL[p.id] };
}

async function one(p: Plan) {
  const pid = `e2e-${p.id}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const t0 = Date.now();
  const doc = buildDoc({ plan: p.id, answers: answersFor(p) });
  if (!doc) return { plan: p.id, error: "buildDoc returned nothing" };
  try {
    const s = await scan([doc], pid, { payForData: false });
    const shop = shoppable(s);
    const tiles = s.tiles.map((t) => {
      const d = draftFor(t, s);
      const h = handoffFor(t, { ...d, id: "x", check: { ok: true, issues: [] }, status: "draft", hash: "", preparedAt: "", preparedBy: "ruth", engine: "rules" } as never, s);
      const mine = d.fields.filter((f) => f.source === "you" && !f.value).length;
      return {
        title: t.title, category: t.category, atStake: t.atStake, daysLeft: t.daysLeft, action: t.action.kind,
        verdict: s.reviews[t.id]?.verdict, why: (s.reviews[t.id] as { reason?: string; summary?: string } | undefined)?.reason ?? (s.reviews[t.id] as { summary?: string } | undefined)?.summary,
        form: d.form, method: d.method, submitTo: d.submitTo, fields: d.fields.length, needsYou: mine,
        destination: h.url ?? h.phone ?? null, destKind: h.kind,
        shoppable: t.balanceIds.some((id) => shop.some((b) => b.id === id)),
      };
    });
    return { plan: p.id, title: p.title, seconds: Math.round((Date.now() - t0) / 1000), engine: s.extraction?.engine, balances: s.extraction?.balances.length ?? 0, found: s.extraction?.balances.map((b) => `${b.label} $${b.amount} by ${b.deadline}`), tiles };
  } catch (e) {
    return { plan: p.id, error: (e as Error).message.slice(0, 200) };
  } finally {
    fs.rmSync(path.join(process.cwd(), ".data", `state-${pid}.json`), { force: true });
  }
}

async function main() {
  const out: unknown[] = [];
  const queue = [...plans];
  await Promise.all(Array.from({ length: 6 }, async () => { for (let p = queue.shift(); p; p = queue.shift()) { const r = await one(p); out.push(r); console.error(`done ${p.id}`); } }));
  const file = process.env.E2E_OUT ?? "e2e-results.json";
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`wrote ${out.length} results to ${file}`);
}
void main();
