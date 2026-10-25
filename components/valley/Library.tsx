"use client";

import { useEffect, useMemo, useState } from "react";
import type { Plan, Question } from "@/lib/library/catalog";
import type { AppState } from "@/lib/types";

// The plan library: search a curated set of plan and card terms, pick yours, answer only the
// questions that are personal, and plant. No uploads needed.
export type Answers = Record<string, string | number | string[]>;
const CATS = ["All", "Health plan", "Dining", "Credit card", "Tax-advantaged account", "Points & miles"] as const;

function defaults(p: Plan): Answers {
  const a: Answers = {};
  for (const q of p.questions) if ("default" in q && q.default !== undefined) a[q.key] = q.default; else if (q.kind === "used") a[q.key] = [];
  return a;
}

export function Field({ q, plan, value, onChange }: { q: Question; plan: Plan; value: Answers[string] | undefined; onChange: (v: Answers[string]) => void }) {
  if (q.kind === "choice") return (
    <div className="ev-lib-q"><span>{q.ask}</span>
      <div className="ev-pick">{q.options.map((o) => <button key={o} className={value === o ? "on" : ""} onClick={() => onChange(o)}>{o}</button>)}</div>
    </div>
  );
  if (q.kind === "used") {
    const set = new Set((value as string[]) ?? []);
    return (
      <div className="ev-lib-q"><span>{q.ask}</span>
        <div className="ev-lib-credits">
          {(plan.credits ?? []).map((c) => (
            <label key={c.key}><input type="checkbox" checked={set.has(c.key)} onChange={(e) => { const n = new Set(set); if (e.target.checked) n.add(c.key); else n.delete(c.key); onChange([...n]); }} />
              {c.name} <em>${c.amount} {c.cadence}</em></label>
          ))}
        </div>
      </div>
    );
  }
  return (
    <label className="ev-lib-q"><span>{q.ask}</span>
      <input type={q.kind === "date" ? "date" : "number"} value={value === undefined ? "" : String(value)} placeholder={q.kind === "money" ? "$" : q.kind === "percent" ? "%" : ""}
        onChange={(e) => onChange(q.kind === "date" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />
      {"hint" in q && q.hint && <em>{q.hint}</em>}
    </label>
  );
}

export function Library({ pid, onPlanted, onClose }: { pid: string; onPlanted: (s: AppState, found: number) => void; onClose: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [picked, setPicked] = useState<Record<string, Answers>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { void fetch("/api/library").then((r) => r.json()).then((j: { plans: Plan[] }) => setPlans(j.plans)); }, []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return plans.filter((p) => (cat === "All" || p.category === cat) && words.every((w) => [p.title, p.issuer, p.community ?? "", ...p.tags].join(" ").toLowerCase().includes(w)));
  }, [plans, query, cat]);

  function toggle(p: Plan) {
    setPicked((cur) => { const n = { ...cur }; if (n[p.id]) delete n[p.id]; else n[p.id] = defaults(p); return n; });
    setOpen(picked[p.id] ? null : p.id);
  }

  async function plant() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, picks: Object.entries(picked).map(([plan, answers]) => ({ plan, answers })) }) });
      const json = (await res.json()) as { state?: AppState; found?: number; error?: string };
      if (!res.ok || !json.state) throw new Error(json.error ?? "Couldn't plant those plans");
      onPlanted(json.state, json.found ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const n = Object.keys(picked).length;
  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-library">
        <div className="ev-speaker">Plan library</div>
        <p className="ev-sub">Plan terms are the same for everyone on a plan, so we keep them here with their sources. Pick yours and answer only what's personal.</p>
        <input className="ev-lib-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: Berkeley SHIP, Sapphire, Amex, FSA, AAdvantage…" onKeyDown={(e) => e.stopPropagation()} autoFocus />
        <div className="ev-pick">{CATS.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>
        <ul className="ev-lib-list">
          {shown.map((p) => (
            <li key={p.id} className={picked[p.id] ? "picked" : ""}>
              <div className="ev-lib-head">
                <div>
                  <b>{p.title}</b>
                  <span>{p.issuer} · {p.year}{p.community ? ` · ${p.community}` : ""}</span>
                </div>
                <button className={picked[p.id] ? "ev-btn" : "ev-btn ghost"} onClick={() => toggle(p)}>{picked[p.id] ? "Added ✓" : "Add"}</button>
              </div>
              {picked[p.id] && (
                <div className="ev-lib-form">
                  {open === p.id || p.questions.length <= 3 ? p.questions.map((q) => (
                    <Field key={q.key} q={q} plan={p} value={picked[p.id][q.key]} onChange={(v) => setPicked((cur) => ({ ...cur, [p.id]: { ...cur[p.id], [q.key]: v } }))} />
                  )) : <button className="ev-link" onClick={() => setOpen(p.id)}>Answer {p.questions.length} quick questions</button>}
                  <p className="ev-lib-src">{p.checked} {p.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</p>
                </div>
              )}
            </li>
          ))}
          {!shown.length && <li className="ev-sub">Nothing matches yet. You can still upload a statement from the menu.</li>}
        </ul>
        {error && <p className="ev-bad">{error}</p>}
        <div className="ev-actions">
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
          <button className="ev-btn" disabled={!n || busy} onClick={() => void plant()}>{busy ? "Planting…" : n ? `Plant ${n} plan${n > 1 ? "s" : ""}` : "Pick a plan"}</button>
        </div>
      </div>
    </div>
  );
}
