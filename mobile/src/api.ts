import Constants from "expo-constants";
import type { AppState, DispatchResult, Verdict } from "../../lib/types";

// The Next.js server in ../ is the backend. In development the phone reaches it on the same
// host that serves the JS bundle; EXPO_PUBLIC_API_URL overrides that (e.g. a deployed URL).
function baseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:3000`;
}

export const API_URL = baseUrl();

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export type Integrations = { claude: boolean; cartesia: boolean; nessie: boolean };

export const api = {
  state: () => call<{ state: AppState; integrations: Integrations }>("/api/state"),
  scan: () => call<{ state: AppState }>("/api/scan", {}),
  reset: () => call<{ state: AppState }>("/api/reset", {}),
  dispatch: (tileId: string) => call<{ state: AppState; result: DispatchResult }>("/api/dispatch", { tileId }),
  reviewCart: (balanceId: string, items: string[]) => call<{ state: AppState; verdict: Verdict }>("/api/review-cart", { balanceId, items }),
};

export const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
