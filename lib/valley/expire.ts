import type { AppState, DispatchResult, Packet, Verdict } from "../types";

// The Expire engine (this Next.js app's API) is the authority on money; the valley only mirrors it.
async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export const expire = {
  state: (pid: string) => call<{ state: AppState; integrations: Record<string, boolean> }>(`/api/state?pid=${pid}`),
  answer: (pid: string, tileId: string, reply: "go" | "keep") => call<{ state: AppState }>("/api/answer", { pid, tileId, reply }),
  challenge: (pid: string, key: string, message: string) =>
    call<{ state: AppState; reply: { stance: "hold" | "acknowledge"; reply: string; rule_cited: number | null; engine: string } }>("/api/challenge", { pid, key, message }),
  scan: (pid: string) => call<{ state: AppState }>("/api/scan", { pid }),
  prepare: (pid: string, tileId: string) => call<{ state: AppState; packet: Packet }>("/api/packets", { pid, action: "prepare", tileId }),
  submit: (pid: string, packetId: string, hash: string) => call<{ state: AppState; result: DispatchResult }>("/api/packets", { pid, action: "submit", packetId, hash }),
  reviewCart: (pid: string, balanceId: string, items: string[]) => call<{ state: AppState; verdict: Verdict }>("/api/review-cart", { pid, balanceId, items }),
  upload: async (pid: string, file: File) => {
    const form = new FormData();
    form.append("pid", pid);
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json as { state: AppState; found: number };
  },
  reset: (pid: string) => call<{ state: AppState }>("/api/reset", { pid }),
};
