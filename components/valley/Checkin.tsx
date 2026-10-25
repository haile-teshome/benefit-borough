"use client";

import { useState } from "react";
import { LIBRARY } from "@/lib/library/catalog";
import type { AppState } from "@/lib/types";
import { usd } from "@/lib/valley/layout";
import { type Answers, Field } from "./Library";

// The weekly check-in: tick credits you used, nudge a balance or two, see what's due this week.
// About two minutes, and the farm replants to match.
export function Checkin({ state, pid, onDone, onLibrary, onClose }: { state: AppState; pid: string; onDone: (s: AppState) => void; onLibrary: () => void; onClose: () => void }) {
  const planted = state.docs.filter((d) => d.meta?.plan).map((d) => ({ plan: LIBRARY.find((p) => p.id === d.meta!.plan)!, answers: d.meta!.answers as Answers })).filter((x) => x.plan);
  const [updates, setUpdates] = useState<Record<string, Answers>>(Object.fromEntries(planted.map((x) => [x.plan.id, { ...x.answers }])));
  // Plan limits read from your own documents: tell Ruth what's left and they become real claims.
  const limits = (state.extraction?.balances ?? []).filter((b) => b.basis === "plan_limit" && !["espp", "tax_window"].includes(b.category));
  const [left, setLeft] = useState<Record<string, number | "">>(Object.fromEntries(limits.map((b) => [b.id, state.myBalances?.[b.id] ?? ""])));
  const [busy, setBusy] = useState(false);
  const week = state.tiles.filter((t) => !state.done.includes(t.id) && t.daysLeft <= 7 && t.atStake > 0).sort((a, b) => a.daysLeft - b.daysLeft);
  const last = state.checkedInAt ? new Date(state.checkedInAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, updates, balances: Object.fromEntries(Object.entries(left).filter(([, v]) => v !== "")) }) });
      const json = (await res.json()) as { state: AppState };
      onDone(json.state);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-library">
        <div className="ev-speaker">Weekly check-in</div>
        <p className="ev-sub">{last ? `Last check-in ${last}. ` : ""}Tick what you used and update what changed. Two minutes, then your farm replants to match.</p>
        <div className="ev-lib-list">
          <div className="ev-checkin-week">
            <b>Due in the next 7 days</b>
            {week.length ? week.map((t) => <span key={t.id}>{t.title} · <em>{usd(t.atStake)} · {t.daysLeft === 0 ? "today" : `${t.daysLeft}d`}</em></span>) : <span>Nothing this week. Nice.</span>}
          </div>
          {planted.map(({ plan }) => {
            const qs = plan.credits ? plan.questions : plan.questions.filter((q) => q.kind !== "date" || plan.category === "Points & miles").slice(0, 3);
            return (
              <div key={plan.id} className="ev-checkin-plan">
                <b>{plan.title}</b>
                {qs.map((q) => (
                  <Field key={q.key} q={q} plan={plan} value={updates[plan.id]?.[q.key]} onChange={(v) => setUpdates((cur) => ({ ...cur, [plan.id]: { ...cur[plan.id], [q.key]: v } }))} />
                ))}
              </div>
            );
          })}
          {limits.length > 0 && (
            <div className="ev-checkin-plan">
              <b>From your documents</b>
              {limits.map((b) => (
                <label key={b.id} className="ev-lib-q"><span>How much is left in your {b.label}? <em>Plan allows up to {usd(b.amount)}</em></span>
                  <input type="number" min={0} step="0.01" placeholder="Leave blank if you're not sure" value={left[b.id] ?? ""} onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => setLeft((cur) => ({ ...cur, [b.id]: e.target.value === "" ? "" : Number(e.target.value) }))} /></label>
              ))}
            </div>
          )}
          {!planted.length && !limits.length && <p>Your farm isn't built from library plans yet, so there's nothing to update here. Add your plans and next week's check-in takes seconds.</p>}
        </div>
        <div className="ev-actions">
          {!planted.length && !limits.length && <button className="ev-btn" onClick={onLibrary}>Find my plans</button>}
          <button className="ev-btn ghost" onClick={onClose}>Later</button>
          {(planted.length > 0 || limits.length > 0) && <button className="ev-btn" disabled={busy} onClick={() => void save()}>{busy ? "Replanting…" : "Save check-in"}</button>}
        </div>
      </div>
    </div>
  );
}
