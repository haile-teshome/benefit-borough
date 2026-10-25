"use client";

import { useState } from "react";
import type { AppState, Quest } from "@/lib/types";
import { shoppable } from "@/lib/market/shoppable";
import styles from "./Outbox.module.css";
import card from "./Bazaar.module.css";
import { PixelIcon, iconFor } from "./PixelIcon";
import { openOutside } from "@/lib/valley/popup";

// The Benefit Bazaar: tell Ruth what you need and which unspent benefit should pay, then press
// Search. The borough's shopkeeper agents each search the web their own way and sell her their
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
              <p className="ev-sub">Name something you actually need. The borough's shopkeeper agents compete to find the best one your benefit covers, for the least money. Press Search, then go about your day: {keeper} will call you when they've found it.</p>
              <div className={styles.fields}>
                <label className={styles.field}><span>Pay with</span>
                  <select value={benefitId} onChange={(e) => setBenefitId(e.target.value)} style={{ font: "15px var(--read)", padding: "5px 8px", border: "3px solid var(--wood)", background: "#fffaf0" }}>
                    {benefits.map((x) => <option key={x.id} value={x.id}>{x.label}: {x.basis === "plan_limit" ? `up to $${x.amount.toFixed(0)}` : `$${x.amount.toFixed(0)} left`} (by {new Date(`${x.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })})</option>)}
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
          {quest && !sent && <Results quest={quest} fresh={Boolean(shown)} />}
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

const money = (n: number) => "$" + (n % 1 ? n.toFixed(2) : n.toFixed(0));

// The finds, as shop cards: a picture, the price tag, what your benefit pays, and Ruth's tag.
// Only what Ruth approved is shown up front; what she turned down (not covered, not a fit, over
// budget) is one click away, so the shelf is never full of things your benefit won't pay for.
function Results({ quest, fresh }: { quest: Quest; fresh: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...quest.offers].sort((a, b) => Number(b.verdict.ok) - Number(a.verdict.ok) || b.score - a.score);
  const approved = sorted.filter((o) => o.verdict.ok), turnedDown = sorted.length - approved.length;
  const offers = showAll || !approved.length ? sorted : approved;
  const total = quest.agents.reduce((n, a) => n + a.offers, 0);
  return (
    <>
      <b>{fresh ? "Here's what they found" : "Last search"}: {quest.need}</b>
      <div className={card.agents}>
        {quest.agents.map((a) => <span key={a.id} className={card.agent}>{a.keeper}<em>{a.offers} find{a.offers === 1 ? "" : "s"} · {a.paid ? `paid ${a.paid.price}` : "unpaid"}</em></span>)}
      </div>
      {!total && <p className={card.empty}>No luck this time. Try saying it another way.</p>}
      <ul className={card.grid}>
        {offers.map((o) => {
          const pick = o.url === quest.best;
          const why = !o.verdict.eligible ? "Not covered" : !o.verdict.fits ? "Not a fit" : !o.verdict.ok ? "Over budget" : "";
          const pct = Math.round((o.covered / Math.max(o.price, 0.01)) * 100);
          return (
            <li key={o.url} className={`${card.card} ${pick ? card.pick : ""} ${o.verdict.ok ? "" : card.no}`}>
              <div className={card.art}><PixelIcon name={iconFor(`${o.title} ${quest.need}`)} size={64} /></div>
              {pick && <span className={card.ribbon}>Ruth's pick</span>}
              {why && <span className={card.stamp}>{why}</span>}
              <span className={card.price}>{money(o.price)}</span>
              <div className={card.body}>
                <span className={card.title}>{o.title}</span>
                <div className={card.meta}>
                  <span>{o.merchant}</span>
                  {o.rating ? <span>★ {o.rating}{o.reviews ? ` · ${o.reviews.toLocaleString("en-US")}` : ""}</span> : null}
                  {o.livePrice != null && <span>Live price</span>}
                </div>
                {o.verdict.ok && (
                  <>
                    <div className={card.bar}><i style={{ width: `${pct}%` }} /></div>
                    <div className={card.split}><span>Benefit pays <b>{money(o.covered)}</b></span><span>You pay {money(o.outOfPocket)}</span></div>
                  </>
                )}
                {o.verdict.note && <span className={card.tag}>{o.verdict.note}</span>}
              </div>
              <a className={card.view} href={o.url} target="_blank" rel="noreferrer" onClick={openOutside}>View at {o.merchant.replace(/\s*\(.*\)$/, "")}</a>
            </li>
          );
        })}
      </ul>
      {turnedDown > 0 && approved.length > 0 && <button className="ev-link" onClick={() => setShowAll((v) => !v)}>{showAll ? "Hide what Ruth turned down" : `Show ${turnedDown} Ruth turned down (not covered, not a fit or over budget)`}</button>}
      {quest.notes.map((n) => <p key={n} className={card.empty}>{n}</p>)}
      <p className={card.empty}>Ruth never buys anything. Open the one you like and check out with your benefit.</p>
    </>
  );
}
