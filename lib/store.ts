import fs from "node:fs";
import path from "node:path";
import { SAMPLE_DOCS } from "./documents";
import type { AppState, AuditEvent } from "./types";

// Local stand-in for the Convex tables (balances, actions, ledger, audit). Same shapes, so moving
// to Convex is a swap of load/save, not of callers.
const FILE = path.join(process.cwd(), ".data", "state.json");

const empty = (): AppState => ({ docs: SAMPLE_DOCS, extraction: null, tiles: [], reviews: {}, ledger: [], done: [], audit: [] });

const g = globalThis as unknown as { __expire?: AppState };

export function load(): AppState {
  if (g.__expire) return g.__expire;
  try {
    g.__expire = JSON.parse(fs.readFileSync(FILE, "utf8")) as AppState;
  } catch {
    g.__expire = empty();
  }
  return g.__expire!;
}

export function save(s: AppState) {
  g.__expire = s;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function reset(): AppState {
  const s = empty();
  save(s);
  return s;
}

export function log(s: AppState, type: string, detail: string) {
  const e: AuditEvent = { at: new Date().toISOString(), type, detail };
  s.audit.unshift(e);
  s.audit = s.audit.slice(0, 200);
}
