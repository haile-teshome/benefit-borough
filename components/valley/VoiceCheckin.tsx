"use client";

import { useRef, useState } from "react";
import type { AppState } from "@/lib/types";
import { speak } from "@/lib/valley/audio";
import { RUTH_VOICE } from "@/lib/valley/people";
import styles from "./Outbox.module.css";

// Talk to Ruth: hold the button and tell her what changed this week. Cartesia transcribes it,
// Ruth updates your plans (and asks when something's unclear), and answers out loud.

type Turn = { who: "you" | "ruth"; text: string; changes?: string[] };

export function VoiceCheckin({ pid, onState, onClose }: { pid: string; onState: (s: AppState) => void; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([{ who: "ruth", text: "What changed this week? Credits you used, PTO you took, a dentist visit, a raise. Hold the button and tell me." }]);
  const [rec, setRec] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const media = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function send(body: FormData) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/voice-checkin", { method: "POST", body });
      const json = (await res.json()) as { heard?: string; reply?: string; changes?: string[]; state?: AppState | null; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setTurns((t) => [...t, ...(json.heard ? [{ who: "you" as const, text: json.heard }] : []), { who: "ruth", text: json.reply ?? "", changes: json.changes }]);
      if (json.state) onState(json.state);
      void speak(json.reply ?? "", RUTH_VOICE);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("pid", pid);
        form.append("audio", blob, `checkin.${(r.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm"}`);
        void send(form);
      };
      r.start();
      media.current = r;
      setRec(true);
    } catch { setError("I couldn't use the microphone. You can type instead."); }
  }
  function stop() { media.current?.state === "recording" && media.current.stop(); setRec(false); }

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">Talk to Ruth · weekly check-in</div>
        <div className={`ev-body ${styles.body}`}>
          <ul className={styles.list}>
            {turns.map((t, i) => (
              <li key={i} className={styles.block}>
                <b>{t.who === "ruth" ? "Ruth" : "You"}</b>
                <span>{t.text}</span>
                {t.changes?.length ? <ul className={styles.check}>{t.changes.map((c) => <li key={c} className={styles.ok}>✓ {c}</li>)}</ul> : null}
              </li>
            ))}
          </ul>
          {busy && <p className="ev-sub">Ruth is listening back and updating your farm…</p>}
          {error && <p className="ev-bad">{error}</p>}
          <form className={styles.block} onKeyDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!typed.trim()) return; const f = new FormData(); f.append("pid", pid); f.append("text", typed); setTyped(""); void send(f); }}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type it: “I used my Uber credit and took 2 days off”" style={{ font: "15px var(--read)", padding: "6px 8px", border: "3px solid var(--wood)", background: "#fffaf0" }} />
          </form>
        </div>
        <div className="ev-actions">
          <button className="ev-btn" disabled={busy} onPointerDown={() => void start()} onPointerUp={stop} onPointerLeave={() => rec && stop()}>{rec ? "Listening… let go when done" : "Hold to talk"}</button>
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
