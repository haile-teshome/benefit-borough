// Same benchmark, local models only (no Claude calls). Run: BENCH_LOCAL=a,b npx tsx scripts/bench-local.ts [task]
process.env.BENCH_ONLY_LOCAL = "1";
import("./bench-models");
