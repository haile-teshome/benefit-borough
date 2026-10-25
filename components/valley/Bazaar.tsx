"use client";

import { useState } from "react";
import type { AppState, Quest } from "@/lib/types";
import { shoppable } from "@/lib/market/shoppable";
import styles from "./Outbox.module.css";

// The Benefit Bazaar: tell Ruth what you need and which unspent benefit should pay, then press
// Search. The burrow's shopkeeper agents each search the web their own way and sell her their
// quotes over x402; she checks live prices and reviews every offer while you go about your day,
// and the shopkeeper calls you with the results. She never buys: the pick and the link are yours.

export type QuestRequest = { benefitId: string; need: string; maxPrice?: number; shopId?: string };

export function Bazaar({ state, preset, quest: shown, searching, keeper, onSearch, onCheckout, onClose }: {
  state: AppState; preset?: { need: string; benefitId: string; shopId?: string }; quest?: Quest | null; searching: string[]; keeper: string;
  onSearch: (req: QuestRequest) => void; onCheckout: () => void; onClose: () => void;
}) {
  const benefits = shoppable(state);
  const [benefitId, setBenefitId] = useState(preset?.benefitId ?? benefits[0]?.id ?? "");
  const b = benefits.find((x) => x.id === benefitId);
  const [need, setNeed] = useState(preset?.need ?? "");
  const [max, setMax] = useState<number | "">("");
  const [sent, setSent] = useState(false);
  const quest = shown ?? state.quests?.[0] ?? null;
  const busy = searching.includes(need.trim());

  function search() {
    if (!need.trim() || !benefitId) return;
    onSearch({ benefitId, need: need.trim(), maxPrice: max === "" ? undefined : max, shopId: preset?.shopId });
    setSent(true);
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">Benefit Bazaar</div>
        <div className={`ev-body ${styles.body}`} onKeyDown={(e) => e.stopPropagation()}>
          {!benefits.length && <p className="ev-sub">No unspent benefits to shop with yet. Plant your plans first.</p>}
          {benefits.length > 0 && (
            <>
              <p className="ev-sub">Name something you actually need. The burrow's shopkeeper agents compete to find the best one your benefit covers, for the least money. Press Search, then go about your day: {keeper} will call you when they've found it.</p>
              <div className={styles.fields}>
                <label className={styles.field}><span>Pay with</span>
                  <select value={benefitId} onChange={(e) => setBenefitId(e.target.value)} style={{ font: "15px var(--read)", padding: "5px 8px", border: "3px solid var(--wood)", background: "#fffaf0" }}>
                    {benefits.map((x) => <option key={x.id} value={x.id}>{x.label}: ${x.amount.toFixed(0)} left (by {new Date(`${x.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})</option>)}
                  </select>
                </label>
                <label className={styles.field}><span>Budget (optional)</span><input type="number" value={max} placeholder={b ? `up to $${b.amount.toFixed(0)}` : ""} onChange={(e) => setMax(e.target.value === "" ? "" : Number(e.target.value))} /></label>
              </div>
              <label className={styles.field}><span>What do you need?</span><input value={need} placeholder="e.g. contact lens solution for soft lenses, a good SPF 50 sunscreen, running shoes for flat feet" onChange={(e) => { setNeed(e.target.value); setSent(false); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} /></label>
            </>
          )}
          {(sent || busy) && (
            <div className={styles.block}>
              <b>The agents are out shopping</b>
              <span className="ev-sub">Dealer Fen, Scout Juniper, and Hazel and Rosa are searching; Ruth will pay for their quotes, check live prices and review every offer. It takes about a minute. You can leave: {keeper} will call you.</span>
            </div>
          )}
          {searching.length > 0 && !busy && <p className="ev-sub">Still searching: {searching.map((x) => `“${x}”`).join(", ")}.</p>}
          {quest && !sent && (
            <>
              <div className={styles.block}>
                <b>{shown ? "Results" : "Your last search"}: “{quest.need}” · paying with {quest.benefit.label}</b>
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
          {benefits.length > 0 && !sent && <button className="ev-btn" disabled={busy || !need.trim()} onClick={search}>{busy ? "Searching…" : "Search"}</button>}
          {sent && <button className="ev-btn" onClick={onClose}>Go explore (I'll wait for the call)</button>}
          {quest?.best && !sent && <button className="ev-btn ghost" onClick={onCheckout}>How should I pay?</button>}
          {!sent && <button className="ev-btn ghost" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}
