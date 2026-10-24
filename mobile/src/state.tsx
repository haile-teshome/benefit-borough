import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import type { AppState } from "../../lib/types";
import { AppState as RNAppState } from "react-native";
import { api, API_URL, type Integrations } from "./api";

type Ctx = {
  state: AppState | null;
  setState: (s: AppState) => void;
  integrations: Integrations | null;
  error: string;
  setError: (e: string) => void;
  refresh: () => Promise<void>;
};

const ExpireContext = createContext<Ctx | null>(null);

// One copy of the server state shared by the board and the tile screen.
export function ExpireProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await api.state();
      setState(r.state);
      setIntegrations(r.integrations);
      setError("");
    } catch (e) {
      setError(`Can't reach the Expire server at ${API_URL}. Is \`npm run dev\` running? (${(e as Error).message})`);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Pick up changes made elsewhere (web board, another phone) when the app returns to the foreground.
    const sub = RNAppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);

  return <ExpireContext.Provider value={{ state, setState, integrations, error, setError, refresh }}>{children}</ExpireContext.Provider>;
}

export function useExpire() {
  const ctx = useContext(ExpireContext);
  if (!ctx) throw new Error("useExpire must be used inside ExpireProvider");
  return ctx;
}
