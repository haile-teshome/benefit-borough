"use client";

import { useEffect, useRef, useState } from "react";
import type { AppState, Quest } from "@/lib/types";
import { shoppable } from "@/lib/market/shoppable";
import styles from "./Outbox.module.css";

// The Benefit Bazaar: tell Ruth what you need and which unspent benefit should pay. The burrow's
// shopkeeper agents each search the web their own way and sell her their quotes over x402; she
// checks live prices and reviews every offer. She never buys: the pick and the link are yours.

const AGENT_LINES = ["Dealer Fen is digging for the lowest price…", "Scout Juniper is reading reviews…", "Hazel and Rosa are checking what your benefit covers…", "Ruth is paying each agent for its quote (x402)…", "Checking live prices with Apify…", "Ruth is reviewing every offer…"];

export function Bazaar({ pid, state, preset, onState, onCheckout, onClose }: { pid: string; state: AppState; preset?: { need: string; benefitId: string }; onState: (s: AppState) => void; onCheckout: () => void; onClose: () => void }) {
  const benefits = shoppable(state);
  const [benefitId, setBenefitId] = useState(preset?.benefitId ?? benefits[0]?.id ?? "");
  const b = benefits.find((x) => x.id === benefitId);
  const [need, setNeed] = useState(preset?.need ?? "");
  const [max, setMax] = useState<number | "">("");
  const [quest, setQuest] = useState<Quest | null>(state.quests?.[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLine((l) => Math.min(l + 1, AGENT_LINES.length - 1)), 7000);
    return () => clearInterval(t);
  }, [busy]);

  // Picked from a shop shelf: send the agents right away.
  const started = useRef(false);
  useEffect(() => { if (preset && !started.current) { started.current = true; void go(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setBusy(true); setLine(0); setError("");
    try {
      const res = await fetch("/api/quest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, benefitId, need, maxPrice: max === "" ? undefined : max }) });
      const json = (await res.json()) as { quest?: Quest; error?: string };
      if (!res.ok || !json.quest) throw new Error(json.error ?? "The bazaar is closed");
      setQuest(json.quest);
      const st = await fetch(`/api/state?pid=${pid}`).then((r) => r.json()) as { state: AppState };
      onState(st.state);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">Benefit Bazaar</div>
        <div className={`ev-body ${styles.body}`} onKeyDown={(e) => e.stopPropagation()}>
          {!benefits.length && <p className="ev-sub">No unspent benefits to shop with yet. Plant your plans first.</p>}
          {benefits.length > 0 && (
            <>
              <p className="ev-sub">Name something you actually need. The burrow's shopkeeper agents compete to find the best one your benefit covers, for the least money.</p>
              <div className={styles.fields}>
                <label className={styles.field}><span>Pay with</span>
                  <select value={benefitId} onChange={(e) => setBenefitId(e.target.value)} style={{ font: "15px var(--read)", padding: "5px 8px", border: "3px solid var(--wood)", background: "#fffaf0" }}>
                    {benefits.map((x) => <option key={x.id} value={x.id}>{x.label}: ${x.amount.toFixed(0)} left (by {new Date(`${x.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})</option>)}
                  </select>
                </label>
                <label className={styles.field}><span>Budget (optional)</span><input type="number" value={max} placeholder={b ? `up to $${b.amount.toFixed(0)}` : ""} onChange={(e) => setMax(e.target.value === "" ? "" : Number(e.target.value))} /></label>
              </div>
              <label className={styles.field}><span>What do you need?</span><input value={need} placeholder="e.g. contact lens solution for soft lenses, a good SPF 50 sunscreen, running shoes for flat feet" onChange={(e) => setNeed(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && need.trim() && !busy) void go(); }} /></label>
            </>
          )}
          {busy && <div className={styles.block}><b>The agents are out shopping</b>{AGENT_LINES.slice(0, line + 1).map((l) => <span key={l} className="ev-sub">{l}</span>)}</div>}
          {error && <p className="ev-bad">{error}</p>}
          {quest && !busy && (
            <>
              <div className={styles.block}>
                <b>“{quest.need}” · paying with {quest.benefit.label}</b>
                <ul className={styles.check}>
                  {quest.agents.map((a) => <li key={a.id}>{a.keeper} ({a.strategy}): {a.offers} offer{a.offers === 1 ? "" : "s"} · {a.paid ? <>paid {a.paid.price} USDC over x402</> : <em>{a.note ?? "unpaid"}</em>}</li>)}
                </ul>
              </div>
              <ul className={styles.list} style={{ display: "grid" }}>
                {quest.offers.map((o) => (
                  <li key={o.url} className={styles.block} style={o.url === quest.best ? { outline: "3px solid var(--ok)", padding: 8 } : { padding: 8 }}>
                    <b>{o.url === quest.best ? "★ Ruth's pick · " : ""}{o.title}</b>
                    <span style={{ display: "block" }}>{o.merchant} · <b>${o.price.toFixed(2)}</b>{o.livePrice != null ? " (live price, Apify)" : ""}{o.rating ? ` · ${o.rating}★${o.reviews ? ` (${o.reviews.toLocaleString("en-US")})` : ""}` : ""} · found by {o.agent}</span>
                    <span className={o.verdict.ok ? styles.ok : styles.issue}>{o.verdict.ok ? `✓ Covered: $${o.covered.toFixed(2)} from ${quest.benefit.label}${o.outOfPocket > 0 ? `, $${o.outOfPocket.toFixed(2)} from you` : ", $0 from you"}` : `✕ ${!o.verdict.eligible ? "Not clearly covered by this benefit" : !o.verdict.fits ? "Doesn't fit your need" : "Over budget"}`} · quality {o.verdict.quality}/10</span>
                    {o.verdict.note && <span className="ev-sub">Ruth: {o.verdict.note}</span>}
                    <a href={o.url} target="_blank" rel="noreferrer" className="ev-link">Open at {o.merchant} ↗</a>
                  </li>
                ))}
              </ul>
              {quest.notes.map((n) => <p key={n} className="ev-sub">{n}</p>)}
              <p className="ev-sub">Ruth doesn't buy anything. Open the pick, check it, and pay with your benefit yourself.</p>
            </>
          )}
        </div>
        <div className="ev-actions">
          {benefits.length > 0 && <button className="ev-btn" disabled={busy || !need.trim()} onClick={() => void go()}>{busy ? "Agents shopping…" : "Send the agents"}</button>}
          {quest?.best && !busy && <button className="ev-btn ghost" onClick={onCheckout}>How should I pay?</button>}
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
