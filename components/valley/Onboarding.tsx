"use client";

import { useMemo, useState } from "react";
import { LIBRARY, type Plan, type Question } from "@/lib/library/catalog";
import { AVATARS, portrait } from "@/lib/valley/pixel/animals";
import type { AppState } from "@/lib/types";
import { type Answers, Field } from "./Library";

// Sixty seconds from "who are you?" to a planted farm: pick what fits, answer only the few numbers
// that matter (salary once, a balance or two), and plant. Everything else uses sensible defaults
// that the weekly check-in can fix later.

type Preset = { id: string; label: string; blurb: string; plans: string[]; extras?: string[] };
const PRESETS: Preset[] = [
  { id: "pro", label: "Working professional", blurb: "401(k) match, PTO, FSA, stipends", plans: ["work-401k-match", "work-pto", "irs-fsa-2026", "work-stipend"], extras: ["health-fitness", "irs-hsa-2026", "work-espp", "work-vesting"] },
  { id: "parent", label: "Working parent", blurb: "Dependent care FSA, up to $7,500", plans: ["work-dcfsa"] },
  { id: "cards", label: "I have premium cards", blurb: "Every statement credit, before it resets", plans: [], extras: ["amex-platinum-2026", "amex-gold-2026", "chase-sapphire-reserve-2026", "venture-x-2026", "citi-strata-elite-2026"] },
  { id: "travel", label: "Frequent traveler", blurb: "Miles and points before they expire", plans: [], extras: ["points-aadvantage", "points-marriott", "points-hilton", "points-ihg"] },
  { id: "cal", label: "UC Berkeley student", blurb: "SHIP health plan and Flex dollars", plans: ["ucb-ship-2026", "cal-dining-2026"] },
];
// The one to three questions per plan that change the answer most. Salary is asked once.
const KEY: Record<string, string[]> = {
  "work-401k-match": ["pct", "rate", "cap"], "work-pto": ["days", "rollover"], "irs-fsa-2026": ["balance"], "work-stipend": ["type", "left"],
  "work-dcfsa": ["balance", "receipts"], "health-fitness": ["insurer", "max", "monthly", "months"], "irs-hsa-2026": ["contributed"], "work-espp": ["enrolled", "window"], "work-vesting": ["unvested", "leaving"],
  "ucb-ship-2026": ["deductible_met", "ordered_care"], "cal-dining-2026": ["balance"], "venture-x-2026": ["used_amount"],
  "points-aadvantage": ["balance", "last_activity"], "points-marriott": ["balance", "last_activity"], "points-hilton": ["balance", "last_activity"], "points-ihg": ["balance", "last_activity"],
};
const COLORS = ["#E2574C", "#3E8ED0", "#F2B33D", "#8E5BD0", "#3FA66B", "#E07BB0"];

const plan = (id: string) => LIBRARY.find((p) => p.id === id)!;
function defaults(p: Plan): Answers {
  const a: Answers = {};
  for (const q of p.questions) if ("default" in q && q.default !== undefined) a[q.key] = q.default; else if (q.kind === "used") a[q.key] = [];
  return a;
}

export function Onboarding({ pid, me, busy, onPlanted, onDemo, onPick, onProfile }: {
  pid: string; me?: { name: string; color: string; avatar: string }; busy: boolean;
  onPlanted: (s: AppState, found: number) => void; onDemo: (name: string, color: string, avatar: string) => void; onPick: (a: string) => void;
  onProfile: (name: string, color: string, avatar: string) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [presets, setPresets] = useState<Set<string>>(new Set(["pro"]));
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  const [salary, setSalary] = useState<number | "">(95000);
  const [answers, setAnswers] = useState<Record<string, Answers>>({});
  const [planting, setPlanting] = useState(false);
  const [error, setError] = useState("");

  const chosen = useMemo(() => {
    const ids = new Set<string>();
    for (const p of PRESETS) if (presets.has(p.id)) p.plans.forEach((x) => ids.add(x));
    extras.forEach((x) => ids.add(x));
    return [...ids].map(plan).filter(Boolean);
  }, [presets, extras]);
  const needsSalary = chosen.some((p) => p.questions.some((q) => q.key === "salary"));

  function togglePreset(id: string) { setPresets((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleExtra(id: string) { setExtras((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  const value = (p: Plan, q: Question) => answers[p.id]?.[q.key] ?? defaults(p)[q.key];

  async function plant() {
    setPlanting(true); setError("");
    try {
      await onProfile(name, color, me?.avatar ?? "");
      const picks = chosen.map((p) => ({ plan: p.id, answers: { ...defaults(p), ...(needsSalary && salary !== "" ? { salary } : {}), ...(answers[p.id] ?? {}) } }));
      const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, picks }) });
      const json = (await res.json()) as { state?: AppState; found?: number; error?: string };
      if (!res.ok || !json.state) throw new Error(json.error ?? "Couldn't plant");
      onPlanted(json.state, json.found ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlanting(false);
    }
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-library">
        <div className="ev-speaker">Welcome to Benefit Burrow</div>
        {step === 1 ? (
          <>
            <p className="ev-lead">Every benefit you're about to lose grows here as a crop. Let's plant yours. It takes about a minute.</p>
            <div className="ev-field">Who are you? Pick all that fit.</div>
            <div className="ev-presets">
              {PRESETS.map((p) => (
                <button key={p.id} className={presets.has(p.id) ? "on" : ""} onClick={() => togglePreset(p.id)}>
                  <b>{presets.has(p.id) ? "✓ " : ""}{p.label}</b><span>{p.blurb}</span>
                </button>
              ))}
            </div>
            {PRESETS.filter((p) => presets.has(p.id) && p.extras?.length).map((p) => (
              <div key={p.id} className="ev-extras">
                <span>{p.id === "cards" ? "Which cards?" : p.id === "travel" ? "Which programs?" : "Also have any of these?"}</span>
                <div className="ev-pick">{p.extras!.map((x) => <button key={x} className={extras.has(x) ? "on" : ""} onClick={() => toggleExtra(x)}>{plan(x).title.replace(/:.*$/, "").replace(/ \(.*\)$/, "")}</button>)}</div>
              </div>
            ))}
            <div className="ev-actions">
              <button className="ev-btn ghost" disabled={busy} onClick={() => onDemo(name, color, me?.avatar ?? "")}>{busy ? "Planting…" : "Just show me a demo"}</button>
              <button className="ev-btn" disabled={!chosen.length} onClick={() => setStep(2)}>Next: a few numbers</button>
            </div>
          </>
        ) : (
          <>
            <div className="ev-onb-me">
              <div className="ev-avatars small" role="radiogroup" aria-label="Avatar">
                {AVATARS.map((a) => (
                  <button key={a.id} role="radio" aria-checked={me?.avatar === a.id} className={me?.avatar === a.id ? "on" : ""} onClick={() => onPick(a.id)}>
                    <img className="icon" src={portrait(a.id, color)} alt={a.label} />
                  </button>
                ))}
              </div>
              <label className="ev-lib-q"><span>Your name</span><input value={name} placeholder={me?.name ?? "Farmer"} onChange={(e) => setName(e.target.value)} maxLength={20} onKeyDown={(e) => e.stopPropagation()} /></label>
              <div className="ev-colors">{COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
            </div>
            <div className="ev-lib-list">
              {needsSalary && (
                <label className="ev-lib-q ev-checkin-plan"><span>Your annual salary (used for your match, PTO value and ESPP)</span>
                  <input type="number" value={salary} onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} /></label>
              )}
              {chosen.map((p) => {
                const qs = p.questions.filter((q) => (KEY[p.id] ?? (p.credits ? ["used"] : [])).includes(q.key));
                if (!qs.length) return null;
                return (
                  <div key={p.id} className="ev-checkin-plan">
                    <b>{p.title}</b>
                    {qs.map((q) => <Field key={q.key} q={q} plan={p} value={value(p, q)} onChange={(v) => setAnswers((cur) => ({ ...cur, [p.id]: { ...cur[p.id], [q.key]: v } }))} />)}
                  </div>
                );
              })}
            </div>
            <p className="ev-sub">Not sure? Leave the defaults; the weekly check-in fixes them later. Every number stays on your farm and cites where it came from.</p>
            {error && <p className="ev-bad">{error}</p>}
            <div className="ev-actions">
              <button className="ev-btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="ev-btn" disabled={planting} onClick={() => void plant()}>{planting ? "Planting your farm…" : `Plant ${chosen.length} benefit${chosen.length > 1 ? "s" : ""}`}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
