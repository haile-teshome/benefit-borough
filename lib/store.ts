import fs from "node:fs";
import path from "node:path";
import { SAMPLE_DOCS } from "./documents";
import type { AppState, AuditEvent } from "./types";

// Local stand-in for the Convex tables (balances, actions, ledger, audit). Same shapes, so moving
// to Convex is a swap of load/save, not of callers.
// One state per player so Expire Valley farmers keep separate ledgers; "default" is the solo app.
const fileFor = (pid: string) => path.join(process.cwd(), ".data", pid === "default" ? "state.json" : `state-${pid}.json`);
const safe = (pid?: string | null) => (pid && /^[a-zA-Z0-9_-]{1,64}$/.test(pid) ? pid : "default");

const empty = (): AppState => ({ docs: SAMPLE_DOCS, extraction: null, tiles: [], reviews: {}, ledger: [], done: [], audit: [] });

const g = globalThis as unknown as { __expireByPlayer?: Map<string, AppState> };
const cache = (g.__expireByPlayer ??= new Map());

export function load(pid?: string | null): AppState {
  const id = safe(pid);
  const hit = cache.get(id);
  if (hit) return hit;
  let s: AppState;
  try {
    s = JSON.parse(fs.readFileSync(fileFor(id), "utf8")) as AppState;
  } catch {
    s = empty();
  }
  cache.set(id, s);
  return s;
}

export function save(s: AppState, pid?: string | null) {
  const id = safe(pid);
  cache.set(id, s);
  fs.mkdirSync(path.dirname(fileFor(id)), { recursive: true });
  fs.writeFileSync(fileFor(id), JSON.stringify(s, null, 2));
}

export function reset(pid?: string | null): AppState {
  const s = empty();
  save(s, pid);
  return s;
}

export function log(s: AppState, type: string, detail: string) {
  const e: AuditEvent = { at: new Date().toISOString(), type, detail };
  s.audit.unshift(e);
  s.audit = s.audit.slice(0, 200);
}
