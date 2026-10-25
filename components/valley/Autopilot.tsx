"use client";

import { useState } from "react";
import type { AppState, Mandate, ShiftReport } from "@/lib/types";
import styles from "./Outbox.module.css";

// Ruth's Autopilot. You sign a mandate: when her night shift runs, which claims she may prepare,
// and how much she may spend on data. The things she may never do are fixed, not settings.

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const SCOPE: Record<Mandate["prepare"], string> = { all: "Every claim I've approved", "money-back": "Only money-back claims (refunds, reimbursements, disputes)", health: "Only health claims (FSA, gym, vision, dental)" };

export function AutopilotPanel({ pid, state, live, onState, onOutbox, onClose }: { pid: string; state: AppState; live: boolean; onState: (s: AppState) => void; onOutbox: () => void; onClose: () => void }) {
  const ap = state.autopilot;
  const [m, setM] = useState<Mandate>(ap?.mandate ?? { on: false, hour: 2, tzOffset: new Date().getTimezoneOffset(), prepare: "all", dataBudget: 0.25, signedAt: "" });
  const [busy, setBusy] = useState<"" | "save" | "run">("");
  const [error, setError] = useState("");
  const spent = ap?.spent.month === new Date().toISOString().slice(0, 7) ? ap.spent.usd : 0;

  async function save(next: Mandate) {
    setBusy("save"); setError("");
    try { const r = await post<{ state: AppState }>({ pid, action: "mandate", mandate: { ...next, tzOffset: new Date().getTimezoneOffset() } }); setM(r.state.autopilot!.mandate); onState(r.state); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function run() {
    setBusy("run"); setError("");
    try { const r = await post<{ state: AppState }>({ pid, action: "run" }); onState(r.state); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">Ruth's Autopilot</div>
        <div className={`ev-body ${styles.body}`}>
          <p className="ev-lead">{m.on ? `Ruth works a night shift at ${m.hour}:00 and leaves you a morning report.` : "Let Ruth do the paperwork overnight. You wake up to claims filled in and waiting for your OK."}</p>
          <div className={styles.block}>
            <b>Ruth may</b>
            <ul className={styles.check}>
              <li className={styles.ok}>✓ Re-read your documents and bank activity</li>
              <li className={styles.ok}>✓ Buy live prices over x402, up to <select value={m.dataBudget} onChange={(e) => setM({ ...m, dataBudget: Number(e.target.value) })}>{[0, 0.1, 0.25, 0.5, 1].map((v) => <option key={v} value={v}>${v.toFixed(2)}</option>)}</select> a month (spent ${spent.toFixed(2)})</li>
              <li className={styles.ok}>✓ Fill in claims: <select value={m.prepare} onChange={(e) => setM({ ...m, prepare: e.target.value as Mandate["prepare"] })}>{Object.entries(SCOPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></li>
              <li className={styles.ok}>✓ Start her shift at <select value={m.hour} onChange={(e) => setM({ ...m, hour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{`${h % 12 || 12}:00 ${h < 12 ? "am" : "pm"}`}</option>)}</select> your time</li>
            </ul>
          </div>
          <div className={styles.block}>
            <b>Ruth may never</b>
            <ul className={styles.check}>
              <li className={styles.issue}>✕ Submit, send, sign or file anything</li>
              <li className={styles.issue}>✕ Move money or pay for anything except data within your budget</li>
              <li className={styles.issue}>✕ Change what she prepared after you've reviewed it</li>
            </ul>
          </div>
          <p className="ev-sub">{live ? "The schedule runs on Convex: a cron marks your shift due at your hour, and the burrow's server runs it." : "The schedule runs on this server."} {m.signedAt ? `Signed ${new Date(m.signedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` : ""}</p>
          {ap?.reports.length ? <ReportList reports={ap.reports} /> : null}
          {error && <p className="ev-bad">{error}</p>}
        </div>
        <div className="ev-actions">
          {m.on ? <button className="ev-btn ghost" disabled={!!busy} onClick={() => void save({ ...m, on: false })}>Stop Autopilot</button>
            : <button className="ev-btn" disabled={!!busy} onClick={() => void save({ ...m, on: true })}>{busy === "save" ? "Signing…" : "Sign the mandate"}</button>}
          {m.on && <button className="ev-btn ghost" disabled={!!busy} onClick={() => void save(m)}>Save changes</button>}
          <button className="ev-btn ghost" disabled={!!busy} onClick={() => void run()}>{busy === "run" ? "Ruth is on shift…" : "Run tonight's shift now"}</button>
          {(state.packets ?? []).some((p) => p.status !== "submitted") && <button className="ev-btn ghost" onClick={onOutbox}>Open the outbox</button>}
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ReportList({ reports }: { reports: ShiftReport[] }) {
  return (
    <div className={styles.block}>
      <b>Past shifts</b>
      <ul className={styles.check}>
        {reports.slice(0, 5).map((r) => <li key={r.at}>{new Date(r.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}: prepared {r.prepared.length}, ${r.value.toFixed(0)} waiting, ${r.dataSpent.toFixed(2)} on data</li>)}
      </ul>
    </div>
  );
}

// The morning report: what Ruth did while you were away.
export function MorningReport({ report, onOutbox, onClose }: { report: ShiftReport; onOutbox: () => void; onClose: () => void }) {
  const ready = report.prepared.filter((p) => p.status === "ready");
  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">While you were away</div>
        <div className={`ev-body ${styles.body}`}>
          <div className={styles.summary}>
            <div><b>${report.value.toFixed(0)}</b><span>prepared, waiting on you</span></div>
            <div><b>{ready.length}/{report.prepared.length}</b><span>claims ready to submit</span></div>
            <div><b>~{report.minutesSaved} min</b><span>of paperwork done</span></div>
          </div>
          <ul className={styles.check}>
            {report.prepared.map((p) => <li key={p.packetId} className={p.status === "ready" ? styles.ok : styles.issue}>{p.status === "ready" ? "✓" : "•"} {p.form}: ${p.amount.toFixed(2)} {p.status === "ready" ? "(ready)" : "(needs you)"}</li>)}
            {!report.prepared.length && <li>No new claims to prepare tonight.</li>}
          </ul>
          {report.urgent.length > 0 && <p className="ev-bad">Due within a week: {report.urgent.join("; ")}</p>}
          {report.newClaims.length > 0 && <p className="ev-sub">New since last time: {report.newClaims.join("; ")}</p>}
          <p className="ev-sub">Data bought over x402: ${report.dataSpent.toFixed(2)}. {report.notes.join(" ")}</p>
        </div>
        <div className="ev-actions">
          <button className="ev-btn" onClick={onOutbox}>Review the outbox</button>
          <button className="ev-btn ghost" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
}
