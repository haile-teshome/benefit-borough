import fs from "node:fs";
import path from "node:path";
import { SAMPLE_DOCS } from "./documents";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { AppState, AuditEvent } from "./types";

// State lives in a local file and, when NEXT_PUBLIC_CONVEX_URL is set, in Convex too: every save
// writes through, and a server with no local copy hydrates from Convex (see convex/states.ts).
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

const convexUrl = () => process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
let cx: ConvexHttpClient | null = null;
const convex = () => (convexUrl() ? (cx ??= new ConvexHttpClient(convexUrl()!)) : null);
export const convexEnabled = () => Boolean(convexUrl());

// Fill the cache from Convex when this server has never seen the player (fresh machine or deploy).
export async function hydrate(pid?: string | null) {
  const id = safe(pid);
  const c = convex();
  if (!c || cache.has(id) || fs.existsSync(fileFor(id))) return;
  try {
    const data = (await c.query(anyApi.states.get, { pid: id })) as string | null;
    if (data) cache.set(id, JSON.parse(data) as AppState);
  } catch (err) {
    console.warn("[convex] read failed, using local state", err);
  }
}

export function save(s: AppState, pid?: string | null) {
  const id = safe(pid);
  cache.set(id, s);
  fs.mkdirSync(path.dirname(fileFor(id)), { recursive: true });
  fs.writeFileSync(fileFor(id), JSON.stringify(s, null, 2));
  const c = convex();
  if (!c) return;
  // Uploaded statements are personal; their text stays on this machine and only findings sync.
  const shared = { ...s, docs: s.docs.map((d) => (d.id.startsWith("upload_") ? { ...d, text: "" } : d)) };
  const ledger = s.ledger.map(({ id: entry, tileId, amount, description, confirmation, at }) => ({ id: entry, tileId, amount, description, confirmation, at }));
  void c.mutation(anyApi.states.put, { pid: id, data: JSON.stringify(shared), ledger, audit: s.audit.slice(0, 60) }).catch((err: unknown) => console.warn("[convex] write failed; local state is saved", err));
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
