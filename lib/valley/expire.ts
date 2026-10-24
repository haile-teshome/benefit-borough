import type { AppState, DispatchResult, Verdict } from "../types";

// The Expire engine (this Next.js app's API) is the authority on money; the valley only mirrors it.
async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const expire = {
  state: (pid: string) => call<{ state: AppState }>(`/api/state?pid=${pid}`),
  scan: (pid: string) => call<{ state: AppState }>("/api/scan", { pid }),
  dispatch: (pid: string, tileId: string) => call<{ state: AppState; result: DispatchResult }>("/api/dispatch", { pid, tileId }),
  reviewCart: (pid: string, balanceId: string, items: string[]) => call<{ state: AppState; verdict: Verdict }>("/api/review-cart", { pid, balanceId, items }),
  reset: (pid: string) => call<{ state: AppState }>("/api/reset", { pid }),
};
