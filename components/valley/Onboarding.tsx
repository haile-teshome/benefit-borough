"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LIBRARY, type Plan, type Question } from "@/lib/library/catalog";
import type { Found, FactKey } from "@/lib/discover";
import { AVATARS, portrait } from "@/lib/valley/pixel/animals";
import { openOutside } from "@/lib/valley/popup";
import type { AppState, Profile } from "@/lib/types";
import { type Answers, Field } from "./Library";

// Create your farmer: who you are (work, health plan, cards, school), not which persona you fit.
// While you answer, Ruth looks up the benefits that come with your employer, health plan and
// school online; on the last step you confirm what she found (each fact links to its page), check
// a few numbers, and plant. Your details also go into your profile so claim forms come pre-filled.

type Step = "you" | "work" | "health" | "money" | "school" | "review";
const COLORS = ["#E2574C", "#3E8ED0", "#F2B33D", "#8E5BD0", "#3FA66B", "#E07BB0"];
const JOBS = ["Full-time", "Part-time", "Student", "Student and working", "Self-employed", "Not working right now"];
const INSURERS = ["Aetna", "Anthem", "Blue Cross Blue Shield", "Cigna", "Kaiser Permanente", "UnitedHealthcare", "Tufts Health Plan", "Humana", "My school's student plan", "Other", "I don't have health insurance"];
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const CARDS = ["amex-platinum-2026", "amex-gold-2026", "chase-sapphire-reserve-2026", "venture-x-2026", "citi-strata-elite-2026"];
const MILES = ["points-aadvantage", "points-marriott", "points-hilton", "points-ihg"];

// The one to three questions per plan that change the answer most. Salary is asked once.
const KEY: Record<string, string[]> = {
  "work-401k-match": ["pct", "rate", "cap"], "work-pto": ["days", "rollover"], "irs-fsa-2026": ["balance"], "work-stipend": ["type", "left"],
  "work-dcfsa": ["balance", "receipts"], "health-fitness": ["insurer", "max", "monthly", "months"],
  "edu-tuition-127": ["limit", "used", "pending"], "edu-loan-repay": ["monthly", "enrolled"], "edu-credits": ["paid", "which"], "edu-529": ["cap", "contributed"], "edu-loan-interest": ["interest"], "edu-idr": ["due", "now", "standard"], "edu-fafsa": ["grant", "deadline", "filed"], "edu-student-perks": ["grad", "perks"], "irs-hsa-2026": ["contributed"], "work-espp": ["enrolled", "window", "discount"], "work-vesting": ["unvested", "leaving"],
  "ucb-ship-2026": ["deductible_met", "ordered_care"], "cal-dining-2026": ["balance"], "venture-x-2026": ["used_amount"],
  "points-aadvantage": ["balance", "last_activity"], "points-marriott": ["balance", "last_activity"], "points-hilton": ["balance", "last_activity"], "points-ihg": ["balance", "last_activity"],
};
const LABEL: Partial<Record<FactKey, string>> = {
  match_rate_pct: "401(k) match rate", match_cap_pct: "Match up to (of pay)", pto_days: "PTO days a year", pto_rollover_days: "PTO days that roll over", stipend_amount: "Stipend a year", stipend_type: "Stipend for",
  tuition_limit: "Tuition assistance a year", student_loan_monthly: "Student loan help a month", espp_discount_pct: "ESPP discount", offers_fsa: "Health FSA", offers_hsa: "HSA", offers_dcfsa: "Dependent care FSA",
  fitness_max: "Gym reimbursement a year", fitness_program: "Fitness program", student_health_plan: "Student health plan", dining_plan_expires: "Dining dollars expire",
};
const MONEY = new Set<FactKey>(["stipend_amount", "tuition_limit", "student_loan_monthly", "fitness_max"]);
const PCT = new Set<FactKey>(["match_rate_pct", "match_cap_pct", "espp_discount_pct"]);

const plan = (id: string) => LIBRARY.find((p) => p.id === id)!;
function defaults(p: Plan): Answers {
  const a: Answers = {};
  for (const q of p.questions) if ("default" in q && q.default !== undefined) a[q.key] = q.default; else if (q.kind === "used") a[q.key] = [];
  return a;
}
const num = (s?: string) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : undefined; };
const yes = (s?: string) => /^(yes|true|offered|available)/i.test(String(s ?? "").trim());

export function Onboarding({ pid, me, busy, onPlanted, onDemo, onPick, onProfile }: {
  pid: string; me?: { name: string; color: string; avatar: string }; busy: boolean;
  onPlanted: (s: AppState, found: number) => void; onDemo: (name: string, color: string, avatar: string) => void; onPick: (a: string) => void;
  onProfile: (name: string, color: string, avatar: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("you");
  const [name, setName] = useState("");
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  const [p, setP] = useState<Profile>({ jobType: "Full-time" });
  const [salary, setSalary] = useState<number | "">(95000);
  const [has, setHas] = useState<Set<string>>(new Set());      // accounts and perks you tick
  const [cards, setCards] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, Answers>>({});
  const [found, setFound] = useState<Found | null>(null);
  const [looking, setLooking] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [keep, setKeep] = useState<Set<FactKey>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [planting, setPlanting] = useState(false);
  const [beat, setBeat] = useState(0); // planting progress messages
  const [error, setError] = useState("");
  const lookedFor = useRef("");
  useEffect(() => { if (!planting) return; setBeat(0); const id = setInterval(() => setBeat((t) => t + 1), 6000); return () => clearInterval(id); }, [planting]);
  const PLANTING = ["Writing down your plans and numbers…", "Ruth is checking every claim against its rules…", "Working out where each one gets filed…", "Planting your crops…"];
  const body = useRef<HTMLDivElement>(null);

  const set = (k: keyof Profile, v: string) => setP((cur) => ({ ...cur, [k]: v }));
  const tick = (setter: typeof setHas, id: string) => setter((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const working = /Full|Part|working|Self/.test(p.jobType ?? "");
  const student = /Student/.test(p.jobType ?? "");
  const insured = p.insurer && p.insurer !== "I don't have health insurance";
  const order: Step[] = ["you", "work", "health", "money", ...(student ? (["school"] as Step[]) : []), "review"];
  const next = () => { setStep(order[Math.min(order.length - 1, order.indexOf(step) + 1)]); body.current?.scrollTo(0, 0); };
  const back = () => setStep(order[Math.max(0, order.indexOf(step) - 1)]);

  // Start Ruth's lookup when you move on from a step (never per keystroke), so it's ready by the
  // last step. It reruns only if what there is to look up changed.
  useEffect(() => {
    const who = { employer: working ? p.employer : undefined, jobType: p.jobType, insurer: insured && p.insurer !== "Other" ? p.insurer : undefined, healthPlan: p.healthPlan, school: student ? p.school : undefined, homeState: p.homeState };
    const key = JSON.stringify(who);
    if (!["money", "school", "review"].includes(step) || key === lookedFor.current || !(who.employer || who.insurer || who.school)) return;
    lookedFor.current = key;
    setLooking("busy");
    void fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: key })
      .then((r) => r.json()).then((j: { found: Found | null }) => { setFound(j.found); setKeep(new Set(Object.keys(j.found?.facts ?? {}) as FactKey[])); setLooking(j.found ? "done" : "failed"); })
      .catch(() => setLooking("failed"));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = (k: FactKey) => (keep.has(k) ? found?.facts[k] : undefined);
  // Which plans to plant, from who you are and what Ruth confirmed.
  const chosen = useMemo(() => {
    const ids = new Set<string>();
    if (working && p.jobType !== "Self-employed") { ids.add("work-401k-match"); ids.add("work-pto"); }
    if (has.has("fsa") || yes(f("offers_fsa")?.value)) ids.add("irs-fsa-2026");
    if (has.has("hsa")) ids.add("irs-hsa-2026");
    if (has.has("dcfsa")) ids.add("work-dcfsa");
    if (has.has("stipend") || f("stipend_amount")) ids.add("work-stipend");
    if (has.has("espp") || f("espp_discount_pct")) ids.add("work-espp");
    if (has.has("vesting")) ids.add("work-vesting");
    if (insured && (has.has("gym") || f("fitness_max"))) ids.add("health-fitness");
    cards.forEach((c) => ids.add(c));
    if (student) { ids.add("edu-credits"); ids.add("edu-fafsa"); ids.add("edu-student-perks"); if (/berkeley|\bucb\b/i.test(p.school ?? "")) { ids.add("ucb-ship-2026"); ids.add("cal-dining-2026"); } }
    if (has.has("loans")) { ids.add("edu-loan-interest"); ids.add("edu-idr"); }
    if (has.has("tuition") || f("tuition_limit")) ids.add("edu-tuition-127");
    if (f("student_loan_monthly")) ids.add("edu-loan-repay");
    return [...ids].map(plan).filter(Boolean);
  }, [working, student, insured, has, cards, p.jobType, p.school, keep, found]); // eslint-disable-line react-hooks/exhaustive-deps

  // Numbers Ruth found become the starting answers (you can still change them).
  const prefill = (pl: Plan): Answers => {
    const a: Answers = {};
    const put = (k: string, v?: number | string) => { if (v !== undefined && pl.questions.some((q) => q.key === k)) a[k] = v; };
    if (pl.id === "work-401k-match") { put("rate", num(f("match_rate_pct")?.value)); put("cap", num(f("match_cap_pct")?.value)); }
    if (pl.id === "work-pto") put("rollover", num(f("pto_rollover_days")?.value));
    if (pl.id === "work-stipend") { put("left", num(f("stipend_amount")?.value)); const t = f("stipend_type")?.value; const q = pl.questions.find((x) => x.key === "type"); if (t && q?.kind === "choice" && q.options.includes(t)) a.type = t; }
    if (pl.id === "work-espp") put("discount", num(f("espp_discount_pct")?.value));
    if (pl.id === "edu-tuition-127") put("limit", num(f("tuition_limit")?.value));
    if (pl.id === "edu-loan-repay") put("monthly", num(f("student_loan_monthly")?.value));
    if (pl.id === "health-fitness") { put("max", num(f("fitness_max")?.value)); const q = pl.questions.find((x) => x.key === "insurer"); if (q?.kind === "choice") a.insurer = q.options.includes(p.insurer ?? "") ? p.insurer! : "Other"; }
    return a;
  };
  const needsSalary = chosen.some((pl) => pl.questions.some((q) => q.key === "salary"));
  const value = (pl: Plan, q: Question) => answers[pl.id]?.[q.key] ?? prefill(pl)[q.key] ?? defaults(pl)[q.key];

  async function plant() {
    setPlanting(true); setError("");
    try {
      await onProfile(name, color, me?.avatar ?? "");
      // Your details pre-fill every claim form Ruth prepares.
      await fetch("/api/packets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, action: "profile", profile: { ...p, fullName: name.trim() || undefined } }) }).catch(() => {});
      const picks = chosen.map((pl) => ({ plan: pl.id, answers: { ...defaults(pl), ...prefill(pl), ...(needsSalary && salary !== "" ? { salary } : {}), ...(answers[pl.id] ?? {}) } }));
      let state: AppState | undefined, count = 0;
      if (picks.length) {
        const res = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, picks }) });
        const json = (await res.json()) as { state?: AppState; found?: number; error?: string };
        if (!res.ok || !json.state) throw new Error(json.error ?? "Couldn't plant");
        state = json.state; count = json.found ?? 0;
      }
      // Your own document (a benefits guide, a statement or a photo of one) is read on top.
      if (file) {
        const form = new FormData(); form.append("pid", pid); form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = (await res.json()) as { state?: AppState; error?: string };
        if (!res.ok || !json.state) throw new Error(json.error ?? "Couldn't read your document");
        state = json.state; count = json.state.tiles.length;
      }
      if (!state) throw new Error("Tell Ruth a little about your benefits first, or add a document.");
      onPlanted(state, count);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlanting(false);
    }
  }

  const factRows = (Object.entries(found?.facts ?? {}) as [FactKey, { value: string; source: string; quote: string }][]);
  const show = (k: FactKey, v: string) => (MONEY.has(k) && num(v) ? `$${num(v)!.toLocaleString("en-US")}` : PCT.has(k) && num(v) ? `${num(v)}%` : v);
  const site = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-library ev-onb">
        <div className="ev-speaker">{step === "you" ? "Create your farmer" : step === "review" ? "Ruth's findings" : "Tell Ruth about you"}</div>
        <ol className="ev-onb-steps" aria-label="Progress">{order.map((s) => <li key={s} className={s === step ? "on" : order.indexOf(s) < order.indexOf(step) ? "done" : ""}>{{ you: "You", work: "Work", health: "Health", money: "Cards", school: "School", review: "Plant" }[s]}</li>)}</ol>
        <div className="ev-onb-body" ref={body} onKeyDown={(e) => e.stopPropagation()}>
          {step === "you" && (
            <>
              <p className="ev-lead">Benefits you've earned shouldn't expire unused. Tell Ruth who you are and she'll find yours: your employer's perks, your health plan's extras, your cards' credits.</p>
              <div className="ev-onb-me">
                <div className="ev-avatars small" role="radiogroup" aria-label="Avatar">
                  {AVATARS.map((a) => <button key={a.id} role="radio" aria-checked={me?.avatar === a.id} className={me?.avatar === a.id ? "on" : ""} onClick={() => onPick(a.id)}><img className="icon" src={portrait(a.id, color)} alt={a.label} /></button>)}
                </div>
                <label className="ev-lib-q"><span>Your name</span><input value={name} placeholder={me?.name ?? "Farmer"} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
                <div className="ev-colors">{COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
              </div>
              <div className="ev-field">What do you do?</div>
              <div className="ev-pick ev-onb-chips">{JOBS.map((j) => <button key={j} className={p.jobType === j ? "on" : ""} onClick={() => set("jobType", j)}>{j}</button>)}</div>
              <label className="ev-lib-q"><span>State you live in</span>
                <select value={p.homeState ?? ""} onChange={(e) => set("homeState", e.target.value)}><option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
            </>
          )}

          {step === "work" && (
            working ? (
              <>
                <label className="ev-lib-q"><span>Employer</span><input value={p.employer ?? ""} placeholder="e.g. Salesforce, Kaiser Permanente, your county" onChange={(e) => set("employer", e.target.value)} /><em>Ruth looks up its published benefits for you.</em></label>
                <label className="ev-lib-q"><span>Annual salary (for your 401(k) match and what a PTO day is worth)</span><input type="number" value={salary} onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))} /></label>
                <div className="ev-field">Do you have any of these at work? (Not sure? Skip it; Ruth checks.)</div>
                <div className="ev-pick ev-onb-chips">
                  {[["fsa", "Health FSA"], ["hsa", "HSA"], ["dcfsa", "Dependent care FSA (kids)"], ["stipend", "Wellness or learning stipend"], ["espp", "Employee stock plan"], ["tuition", "Tuition assistance"], ["vesting", "401(k) not fully vested"]].map(([id, l]) => <button key={id} className={has.has(id) ? "on" : ""} onClick={() => tick(setHas, id)}>{has.has(id) ? "✓ " : ""}{l}</button>)}
                </div>
              </>
            ) : <p className="ev-lead">No employer benefits to look up. On to your health plan.</p>
          )}

          {step === "health" && (
            <>
              <label className="ev-lib-q"><span>Health insurance carrier</span>
                <select value={p.insurer ?? ""} onChange={(e) => set("insurer", e.target.value)}><option value="">Choose…</option>{INSURERS.map((s) => <option key={s}>{s}</option>)}</select></label>
              {insured && <label className="ev-lib-q"><span>Plan name (on your card or benefits page)</span><input value={p.healthPlan ?? ""} placeholder="e.g. Anthem Blue Cross PPO 500, Kaiser HMO" onChange={(e) => set("healthPlan", e.target.value)} /></label>}
              {insured && <label className="ev-lib-q"><span>Member ID (optional, goes on claim forms)</span><input value={p.memberId ?? ""} onChange={(e) => set("memberId", e.target.value)} /></label>}
              {insured && <div className="ev-pick ev-onb-chips"><button className={has.has("gym") ? "on" : ""} onClick={() => tick(setHas, "gym")}>{has.has("gym") ? "✓ " : ""}I pay for a gym</button></div>}
            </>
          )}

          {step === "money" && (
            <>
              <div className="ev-field">Which cards do you carry?</div>
              <div className="ev-pick ev-onb-chips">{CARDS.map((c) => <button key={c} className={cards.has(c) ? "on" : ""} onClick={() => tick(setCards, c)}>{cards.has(c) ? "✓ " : ""}{plan(c).title.replace(/:.*$/, "").replace(/ \(.*\)$/, "")}</button>)}</div>
              <div className="ev-field">Points or miles you collect?</div>
              <div className="ev-pick ev-onb-chips">{MILES.map((c) => <button key={c} className={cards.has(c) ? "on" : ""} onClick={() => tick(setCards, c)}>{cards.has(c) ? "✓ " : ""}{plan(c).title.replace(/:.*$/, "").replace(/ \(.*\)$/, "")}</button>)}</div>
              <div className="ev-pick ev-onb-chips"><button className={has.has("loans") ? "on" : ""} onClick={() => tick(setHas, "loans")}>{has.has("loans") ? "✓ " : ""}I have student loans</button></div>
            </>
          )}

          {step === "school" && (
            <label className="ev-lib-q"><span>School</span><input value={p.school ?? ""} placeholder="e.g. UC Berkeley" onChange={(e) => set("school", e.target.value)} /><em>Ruth looks up your student health plan and dining rules.</em></label>
          )}

          {step === "review" && (
            <>
              {looking === "busy" && <p className="ev-sub">🔎 Ruth is reading {[p.employer, insured && p.insurer !== "Other" ? p.insurer : "", student ? p.school : ""].filter(Boolean).join(", ")}'s benefit pages… (about a minute; you can plant now and add these later)</p>}
              {looking === "failed" && <p className="ev-sub">Ruth couldn't look that up right now. Your answers are enough to start.</p>}
              {factRows.length > 0 && (
                <div className="ev-onb-found">
                  <b>Ruth found these online. Untick anything that isn't true for you:</b>
                  <ul>{factRows.map(([k, v]) => (
                    <li key={k}><label><input type="checkbox" checked={keep.has(k)} onChange={() => tick(setKeep as typeof setHas, k)} /> <span>{LABEL[k] ?? k}: <b>{show(k, v.value)}</b></span></label>
                      <a href={v.source} target="_blank" rel="noreferrer" onClick={openOutside} title={v.quote}>{site(v.source)}{/glassdoor|levels\.fyi|indeed|reddit|blind|perkup/i.test(v.source) ? " · reported by employees" : ""}</a></li>
                  ))}</ul>
                </div>
              )}
              {looking === "done" && !factRows.length && <p className="ev-sub">Ruth didn't find published benefit pages for that. Your answers are enough to start.</p>}
              <div className="ev-lib-list">
                {needsSalary && salary === "" && <label className="ev-lib-q ev-checkin-plan"><span>Your annual salary</span><input type="number" value={salary} onChange={(e) => setSalary(e.target.value === "" ? "" : Number(e.target.value))} /></label>}
                {chosen.map((pl) => {
                  const qs = pl.questions.filter((q) => (KEY[pl.id] ?? (pl.credits ? ["used"] : [])).includes(q.key));
                  if (!qs.length) return null;
                  return (
                    <div key={pl.id} className="ev-checkin-plan">
                      <b>{pl.title}</b>
                      {qs.map((q) => <Field key={q.key} q={q} plan={pl} value={value(pl, q)} onChange={(v) => setAnswers((cur) => ({ ...cur, [pl.id]: { ...cur[pl.id], [q.key]: v } }))} />)}
                    </div>
                  );
                })}
              </div>
              <label className="ev-lib-q ev-onb-file"><span>Have a benefits guide, offer letter or statement? Add it and Ruth reads it too (PDF, CSV, text or a photo).</span>
                <input type="file" accept=".csv,.pdf,.txt,.png,.jpg,.jpeg,.webp,text/csv,text/plain,application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
              <p className="ev-sub">Not sure about a number? Leave it; the weekly check-in fixes it later. Every number cites where it came from.</p>
            </>
          )}
          {error && <p className="ev-bad">{error}</p>}
        </div>
        {planting && <p className="ev-sub ev-onb-progress">🌱 {PLANTING[Math.min(beat, PLANTING.length - 1)]} (about half a minute)</p>}
        <div className="ev-actions">
          {step === "you" && <button className="ev-btn ghost" disabled={busy} onClick={() => onDemo(name, color, me?.avatar ?? "")}>{busy ? "Planting…" : "Just show me a demo"}</button>}
          {step !== "you" && <button className="ev-btn ghost" onClick={back}>Back</button>}
          {step !== "review" ? <button className="ev-btn" onClick={next}>Next</button>
            : <button className="ev-btn" disabled={planting || (!chosen.length && !file)} onClick={() => void plant()}>{planting ? "Planting your farm…" : "Plant my farm"}</button>}
        </div>
      </div>
    </div>
  );
}
