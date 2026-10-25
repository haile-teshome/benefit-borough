"use client";

import type { AppState } from "@/lib/types";
import { usd } from "@/lib/valley/layout";

// Your own progress, not a race against other farmers: how much of what you're owed you've
// rescued, what you rescued this month, and your latest harvest.
export function Progress({ state }: { state: AppState }) {
  const rescued = state.ledger.reduce((s, l) => s + l.amount, 0);
  const open = state.tiles.filter((t) => !state.done.includes(t.id) && t.atStake > 0);
  const atStake = open.reduce((s, t) => s + t.atStake, 0);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = state.ledger.filter((l) => l.at.startsWith(month));
  const latest = [...state.ledger].sort((a, b) => b.at.localeCompare(a.at))[0];
  const pct = rescued + atStake > 0 ? Math.round((rescued / (rescued + atStake)) * 100) : 0;
  return (
    <div className="ev-panel ev-live ev-progress">
      <div className="ev-live-head">Your harvest <small>{pct}% rescued</small></div>
      <div className="ev-bar"><i style={{ width: `${Math.max(pct, 2)}%` }} /></div>
      <div className="ev-progress-row"><span>This month</span><b>+{usd(thisMonth.reduce((s, l) => s + l.amount, 0))}</b></div>
      <div className="ev-progress-row"><span>Still open ({open.length})</span><b className="open">{usd(atStake)}</b></div>
      {latest && <div className="ev-progress-latest">Latest: {latest.description}</div>}
    </div>
  );
}
