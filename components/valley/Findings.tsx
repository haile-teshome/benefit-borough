"use client";

import { useMemo, useState } from "react";
import { LIBRARY } from "@/lib/library/catalog";
import { impliedPlans, prefillFor, reported, showFact, siteOf, LABEL, type FactKey, type Found } from "@/lib/findings";
import { openOutside } from "@/lib/valley/popup";
import type { AppState } from "@/lib/types";

// Ruth's lookup finished after you planted: here's what she found online (each with its page),
// exactly what it would change on your farm, and one button to apply it.

type Answers = Record<string, unknown>;
export type LateFindings = { found: Found; who: { employer?: string; insurer?: string; school?: string } };

const defaults = (id: string): Answers => Object.fromEntries((LIBRARY.find((p) => p.id === id)?.questions ?? []).map((q) => [q.key, q.kind === "used" ? [] : "default" in q ? q.default : undefined]));
const label = (planId: string, key: string) => LIBRARY.find((p) => p.id === planId)?.questions.find((q) => q.key === key)?.ask.replace(/:$/, "") ?? key;
const title = (planId: string) => LIBRARY.find((p) => p.id === planId)?.title.replace(/:.*$/, "").replace(/ \(.*\)$/, "") ?? planId;

export function FindingsReview({ pid, state, late, onApplied, onClose }: { pid: string; state: AppState; late: LateFindings; onApplied: (s: AppState, changes: number) => void; onClose: () => void }) {
  const facts = Object.entries(late.found.facts) as [FactKey, { value: string; source: string; quote: string }][];
  const [keep, setKeep] = useState<Set<FactKey>>(new Set(facts.map(([k]) => k)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Your planted plans, with Ruth's numbers merged in, plus any plan a finding says you have.
  const plan = useMemo(() => {
    const kept = Object.fromEntries(facts.filter(([k]) => keep.has(k))) as Found["facts"];
    const planted = state.docs.filter((d) => d.meta?.plan).map((d) => ({ plan: d.meta!.plan, answers: d.meta!.answers as Answers }));
    const salary = planted.map((p) => p.answers.salary).find((x) => typeof x === "number");
    const insurer = late.who.insurer ?? (planted.find((p) => p.plan === "health-fitness")?.answers.insurer as string | undefined);
    const added = impliedPlans(kept, { insured: Boolean(insurer) }).filter((id) => !planted.some((p) => p.plan === id));
    const changes: string[] = [];
    const all: { plan: string; answers: Answers }[] = [...planted, ...added.map((id) => ({ plan: id, answers: { ...defaults(id), ...(salary !== undefined ? { salary } : {}) } as Answers }))];
    const picks = all.map((p) => {
      const fill = prefillFor(p.plan, kept, insurer);
      const isNew = added.includes(p.plan);
      for (const [k, v] of Object.entries(fill)) if (!isNew && p.answers[k] !== v) changes.push(`${title(p.plan)}: ${label(p.plan, k)} ${p.answers[k] ?? "—"} → ${v}`);
      return { plan: p.plan, answers: { ...p.answers, ...fill } };
    });
    for (const id of added) changes.push(`Adds ${title(id)}`);
    return { picks, changes };
  }, [keep, state.docs]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, picks: plan.picks }) });
      const json = (await res.json()) as { state?: AppState; error?: string };
      if (!res.ok || !json.state) throw new Error(json.error ?? "Couldn't apply");
      onApplied(json.state, plan.changes.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const names = [late.who.employer, late.who.insurer, late.who.school].filter(Boolean).join(", ");
  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-library ev-onb">
        <div className="ev-speaker">Ruth found more</div>
        <div className="ev-onb-body" onKeyDown={(e) => e.stopPropagation()}>
          <p className="ev-lead">While you were planting, Ruth finished reading {names || "your benefit pages"}. Untick anything that isn't true for you.</p>
          <div className="ev-onb-found">
            <ul>{facts.map(([k, v]) => (
              <li key={k}><label><input type="checkbox" checked={keep.has(k)} onChange={() => setKeep((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; })} /> <span>{LABEL[k] ?? k}: <b>{showFact(k, v.value)}</b></span></label>
                <a href={v.source} target="_blank" rel="noreferrer" onClick={openOutside} title={v.quote}>{siteOf(v.source)}{reported(v.source) ? " · reported by employees" : ""}</a></li>
            ))}</ul>
          </div>
          <div className="ev-checkin-plan">
            <b>What this changes on your farm</b>
            {plan.changes.length ? <ul className="ev-onb-changes">{plan.changes.map((c) => <li key={c}>{c}</li>)}</ul> : <span className="ev-sub">Nothing: your farm already matches what Ruth found.</span>}
          </div>
          {error && <p className="ev-bad">{error}</p>}
        </div>
        <div className="ev-actions">
          <button className="ev-btn ghost" onClick={onClose}>Not now</button>
          <button className="ev-btn" disabled={busy || !plan.changes.length} onClick={() => void apply()}>{busy ? "Applying…" : `Apply to my farm${plan.changes.length ? ` (${plan.changes.length})` : ""}`}</button>
        </div>
      </div>
    </div>
  );
}
