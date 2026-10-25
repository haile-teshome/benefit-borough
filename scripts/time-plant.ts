// Times each stage of planting a typical 15-benefit farm (extract, optimize/narrate, reviews).
// Usage: npx tsx --env-file=.env.local scripts/time-plant.ts
import { LIBRARY } from "../lib/library/catalog";
import { buildDoc, type Answers } from "../lib/library/build";
import { extract } from "../lib/engine/extract";
import { optimize } from "../lib/engine/optimize";
import { review } from "../lib/engine/reviewer";

const IDS = ["work-401k-match", "work-pto", "irs-fsa-2026", "work-stipend", "work-espp", "health-fitness", "venture-x-2026", "edu-credits", "edu-fafsa", "edu-student-perks", "ucb-ship-2026", "cal-dining-2026", "edu-loan-interest", "edu-idr", "edu-tuition-127"];
const defaults = (id: string): Answers => Object.fromEntries(LIBRARY.find((p) => p.id === id)!.questions.map((q) => [q.key, q.kind === "used" ? [] : ("default" in q ? q.default : undefined)]));
async function main() {
  const docs = IDS.map((id) => buildDoc({ plan: id, answers: { ...defaults(id), ...(id === "irs-fsa-2026" ? { balance: 1400 } : {}), ...(id === "cal-dining-2026" ? { balance: 600, weekly: 10 } : {}) } })!).filter(Boolean);
  let t = Date.now();
  const ex = await extract(docs); console.log("extract", Date.now() - t, "ms,", ex.balances.length, "balances");
  t = Date.now();
  const tiles = await optimize(ex); console.log("optimize+narrate", Date.now() - t, "ms,", tiles.length, "tiles");
  const text = docs.map((d) => `[${d.id}] ${d.name}\n${d.text}`).join("\n\n");
  t = Date.now();
  const v = await Promise.all(tiles.map(async (tile) => { const s = Date.now(); const own = docs.filter((d) => tile.sources.some((x) => x.doc === d.id)); const r = await review({ kind: "tile", tile }, ex, own.length ? own.map((d) => `[${d.name}]\n${d.text}`).join("\n\n") : text, { terms: tile.balanceIds.every((id) => id.startsWith("lib_")) && !["vision", "dental", "deductible"].includes(tile.category) }); return { id: tile.id, title: tile.title, ms: Date.now() - s, v: r.verdict, why: r.reason, engine: r.engine }; }));
  for (const x of v.filter((y) => y.v !== "approve")) console.log("  rejected:", x.title, "→", x.why);
  console.log("reviews (parallel)", Date.now() - t, "ms; slowest", Math.max(...v.map((x) => x.ms)), "; approved", v.filter((x) => x.v === "approve").length, "/", v.length, "; engines", [...new Set(v.map((x) => x.engine))].join(","));
  console.log("docs chars", text.length);
}
void main();
