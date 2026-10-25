"use client";

import { useState } from "react";
import type { AppState, Handoff, Packet } from "@/lib/types";
import styles from "./Outbox.module.css";
import { openOutside } from "@/lib/valley/popup";

// Ruth's outbox. She fills in every claim (form, proof, message) and checks it; you read it, fix
// anything, and press Submit. Nothing leaves the burrow without that press.

const SOURCE: Record<string, string> = { profile: "your profile", document: "your documents", computed: "Ruth's math", ruth: "Ruth wrote this", you: "you" };
const METHOD: Record<Packet["method"], string> = { portal: "Uploads to", email: "Emails", mail: "Mails to", phone: "Calls", chat: "Messages", app: "Files in", transfer: "Sends via" };

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/packets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

export function PacketReview({ pid, packet, onState, onSubmit, onClose }: {
  pid: string; packet: Packet; onState: (s: AppState, p: Packet) => void; onSubmit: (p: Packet) => void; onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dirty = Object.keys(values).length > 0 || message !== null;
  const done = packet.status === "submitted" || packet.status === "waiting";

  async function save() {
    setSaving(true); setError("");
    try {
      const r = await post<{ state: AppState; packet: Packet }>({ pid, action: "edit", packetId: packet.id, values: { ...values, ...(message !== null ? { __message: message } : {}) } });
      setValues({}); setMessage(null);
      onState(r.state, r.packet);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  const filled = packet.fields.filter((f) => f.value.trim()).length;
  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">{packet.form}</div>
        <div className={`ev-body ${styles.body}`}>
          <div className={styles.summary}>
            <div><b>${packet.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b><span>claimed</span></div>
            <div><b>{filled}/{packet.fields.length}</b><span>fields filled by Ruth</span></div>
            <div><b>~{packet.minutes.you} min</b><span>for you, instead of ~{packet.minutes.without}</span></div>
          </div>
          <p className="ev-sub">{METHOD[packet.method]} <b>{packet.submitTo}</b> when you press Submit. Ruth never sends it herself.</p>

          <div className={styles.fields} onKeyDown={(e) => e.stopPropagation()}>
            {packet.fields.map((f) => {
              const v = values[f.key] ?? f.value;
              const needs = f.required && !v.trim();
              return (
                <label key={f.key} className={`${styles.field} ${needs ? styles.needs : ""}`}>
                  <span>{f.label}<em>{needs ? "only you know this" : `from ${SOURCE[f.source]}`}</em></span>
                  {f.long ? <textarea value={v} disabled={done} rows={2} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                    : <input value={v} disabled={done} placeholder={needs ? "Type it here" : ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />}
                  {f.cite && <mark className={styles.cite}>{f.cite}</mark>}
                </label>
              );
            })}
          </div>

          {packet.message !== undefined && (
            <div className={styles.block} onKeyDown={(e) => e.stopPropagation()}>
              <b>{packet.method === "phone" ? "What Ruth will say" : "Message"}</b>
              <textarea value={message ?? packet.message ?? ""} disabled={done} rows={4} onChange={(e) => setMessage(e.target.value)} />
            </div>
          )}

          {packet.attachments.map((a) => (
            <div key={a.name} className={styles.block}>
              <b>📎 {a.name}</b>
              {a.lines.map((l, i) => <code key={i}>{l}</code>)}
              {a.todo && <p className="ev-bad">{a.todo}</p>}
              {a.todo && !done && (
                <label className="ev-btn ghost" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
                  Attach a receipt
                  <input type="file" hidden accept=".pdf,.csv,.txt,.png,.jpg,.jpeg" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = /text|csv/.test(file.type) || /\.(csv|txt)$/i.test(file.name) ? await file.text() : "";
                    try { const r = await post<{ state: AppState; packet: Packet }>({ pid, action: "attach", packetId: packet.id, name: file.name, text }); onState(r.state, r.packet); }
                    catch (err) { setError((err as Error).message); }
                  }} />
                </label>
              )}
            </div>
          ))}

          <div className={styles.block}>
            <b>Ruth checked</b>
            <ul className={styles.check}>
              {packet.check.passed.map((x) => <li key={x} className={styles.ok}>✓ {x}</li>)}
              {packet.check.issues.map((x) => <li key={x} className={styles.issue}>• {x}</li>)}
            </ul>
          </div>
          {error && <p className="ev-bad">{error}</p>}
          {done && <p className="ev-good">{packet.status === "waiting" ? `Filed ${new Date(packet.submittedAt!).toLocaleString("en-US")}${packet.handoff ? ` at ${packet.handoff.label}` : ""}. Waiting on ${packet.provider}.` : `Done ${new Date(packet.submittedAt!).toLocaleString("en-US")} · ${packet.confirmation}`}</p>}
        </div>
        <div className="ev-actions">
          <a className="ev-btn ghost" href={`/api/packets/pdf?pid=${pid}&id=${packet.id}`} target="_blank" rel="noreferrer" onClick={openOutside}>Open the filled form (PDF)</a>
          {!done && dirty && <button className="ev-btn ghost" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save my changes"}</button>}
          {!done && !dirty && !packet.check.ok && <button className="ev-btn ghost" disabled={saving} onClick={async () => {
            setSaving(true); setError("");
            try { const r = await post<{ state: AppState; packet: Packet }>({ pid, action: "prepare", tileId: packet.tileId }); onState(r.state, r.packet); }
            catch (e) { setError((e as Error).message); } finally { setSaving(false); }
          }}>{saving ? "Looking…" : "Ruth, look again"}</button>}
          {!done && <button className="ev-btn" disabled={dirty || !packet.check.ok} title={dirty ? "Save your changes first" : packet.check.ok ? "" : packet.check.issues[0]} onClick={() => onSubmit(packet)}>
            {packet.check.ok ? `I checked it · Submit` : "Needs you first"}
          </button>}
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function Outbox({ state, onOpen, onPaid, onClose }: { state: AppState; onOpen: (p: Packet) => void; onPaid: (p: Packet) => void; onClose: () => void }) {
  const packets = state.packets ?? [];
  const waiting = packets.filter((p) => p.status !== "submitted" && p.status !== "waiting");
  const ready = waiting.filter((p) => p.status === "ready");
  const value = waiting.reduce((s, p) => s + p.amount, 0);
  const saved = waiting.reduce((s, p) => s + p.minutes.without - p.minutes.you, 0);
  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">Ruth's outbox</div>
        <div className={`ev-body ${styles.body}`}>
          <div className={styles.summary}>
            <div><b>${value.toFixed(0)}</b><span>prepared, waiting on you</span></div>
            <div><b>{ready.length}</b><span>ready to submit</span></div>
            <div><b>~{saved} min</b><span>of paperwork Ruth did</span></div>
          </div>
          <p className="ev-sub">Ruth fills in the forms, finds the receipts and writes the messages. You check each one and press Submit.</p>
          <ul className={styles.list}>
            {packets.map((p) => (
              <li key={p.id}>
                <button onClick={() => onOpen(p)}>
                  <span><b>{p.form}</b><em>{p.provider} · {p.preparedBy === "autopilot" ? "prepared overnight" : "prepared by Ruth"}</em></span>
                  <strong>${p.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  <i className={p.status === "submitted" ? styles.ok : p.status === "ready" ? styles.ready : p.status === "waiting" ? "" : styles.issue}>{p.status === "submitted" ? "Done" : p.status === "ready" ? "Ready for you" : p.status === "waiting" ? `Filed, waiting on ${p.provider}` : `Needs you (${p.check.issues.length})`}</i>
                </button>
                {p.status === "waiting" && <button className="ev-btn" style={{ marginTop: 4 }} onClick={() => onPaid(p)}>Money arrived: count it</button>}
              </li>
            ))}
            {!packets.length && <li className="ev-sub">Nothing yet. Open a crop and ask Ruth to fill it in, or turn on Autopilot.</li>}
          </ul>
        </div>
        <div className="ev-actions"><button className="ev-btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// After Submit: the real place this claim goes, with everything Ruth prepared ready to paste.
export function HandoffPanel({ pid, packet, handoff, onClose }: { pid: string; packet: Packet; handoff: Handoff; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const open = (url: string) => { if (url.startsWith("mailto:")) { window.location.href = url; return; } const w = window.open(url, "_blank", "popup,width=1180,height=860"); if (w) w.opener = null; else window.open(url, "_blank", "noopener,noreferrer"); };
  async function copy() { try { await navigator.clipboard.writeText(handoff.script ?? packet.message ?? packet.fields.map((f) => `${f.label}: ${f.value}`).join("\n")); setCopied(true); } catch { /* clipboard blocked */ } }
  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">File it: {handoff.label}</div>
        <div className={`ev-body ${styles.body}`}>
          <p className="ev-lead">Ruth filled it in. Now it goes to {packet.provider}, from you.</p>
          {handoff.sample && <p className="ev-bad">This claim comes from the sample person's documents, so the office in it is part of the sample.</p>}
          <ol className={styles.check}>{handoff.steps.map((x) => <li key={x}>{x}</li>)}</ol>
          {handoff.phone && <p><b>Call:</b> <a className="ev-link" href={`tel:${handoff.phone.replace(/[^\d+]/g, "")}`}>{handoff.phone}</a></p>}
          {handoff.script && <div className={styles.block}><b>{handoff.kind === "phone" ? "What to say" : "Your message"}</b><span>{handoff.script}</span></div>}
          <p className="ev-sub">When {packet.provider} comes through, tap “Money arrived” in Ruth's outbox. That's when it counts as rescued.</p>
        </div>
        <div className="ev-actions">
          {handoff.url && <button className="ev-btn" onClick={() => open(handoff.url!)}>{handoff.kind === "email" ? "Write the email" : `Open ${handoff.label}`}</button>}
          {(packet.message || handoff.script) && <button className="ev-btn ghost" onClick={() => void copy()}>{copied ? "Copied" : "Copy the message"}</button>}
          <button className="ev-btn ghost" onClick={() => open(`/api/packets/pdf?pid=${pid}&id=${packet.id}`)}>Get the PDF</button>
          <button className="ev-btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
