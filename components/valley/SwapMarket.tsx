"use client";

import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { DbConnection, tables } from "@/lib/valley_bindings";
import type { Offer, Player } from "@/lib/valley_bindings/types";
import s from "./SwapMarket.module.css";
import { PixelIcon } from "./PixelIcon";
import { hex } from "@/lib/valley/ids";

type Kind = "dining" | "points" | "pass" | "other";

// What Ruth says about each kind before a swap. Only claim a transfer is allowed when the program
// actually allows it, and say plainly what can't move.
const KINDS: Record<Kind, { label: string; icon: string; unit: string; rule: string }> = {
  dining: { label: "Dining dollars", icon: "food", unit: "USD", rule: "Many campus plans (like Cal Dining Flex dollars) allow peer transfers between students. Meal swipes usually can't be transferred." },
  points: { label: "Points & miles", icon: "suitcase", unit: "points", rule: "Most hotel programs (Marriott Bonvoy, Hilton Honors) allow free points transfers to another member, within yearly limits. Airline miles often charge a fee." },
  pass: { label: "Passes & seats", icon: "gift", unit: "pass", rule: "Guest passes and companion seats are shared by bringing or naming the person. The pass itself stays on the holder's account." },
  other: { label: "Other", icon: "groceries", unit: "USD", rule: "Only post what the program lets you transfer. Benefits tied to you (FSA/DCFSA funds, insurance, meal swipes) can't be traded." },
};


function fmt(o: Offer) {
  if (o.unit === "USD") return `$${o.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${o.amount.toLocaleString("en-US")} ${o.unit}`;
}

export function SwapMarket({ conn, me, players, onClose }: { conn: DbConnection; me: string; players: Player[]; onClose: () => void }) {
  const [offers] = useTable(tables.offer);
  const [tab, setTab] = useState<"market" | "mine">("market");
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<Kind>("dining");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState(KINDS.dining.unit);
  const [want, setWant] = useState("");

  const who = (id: Parameters<typeof hex>[0]) => players.find((p) => hex(p.identity) === hex(id));
  const sorted = [...offers].sort((a, b) => Number(b.id - a.id));
  const market = sorted.filter((o) => hex(o.owner) !== me && (o.status === "open" || (o.status === "pending" && hex(o.taker) === me)));
  const mine = sorted.filter((o) => hex(o.owner) === me && o.status !== "cancelled");
  const openCount = mine.filter((o) => o.status === "open" || o.status === "pending").length;

  async function run(label: string, f: () => Promise<void>) {
    setMsg("");
    try { await f(); setMsg(label); } catch (e) { setMsg((e as Error).message); }
  }

  function post() {
    const n = Number(amount);
    if (!title.trim() || !(n > 0)) { setMsg("Add a title and a positive amount."); return; }
    void run("Your stall is up. Neighbors see it right away.", async () => {
      await conn.reducers.postOffer({ kind, title: title.trim(), amount: n, unit: unit.trim() || KINDS[kind].unit, want: want.trim() || "free" });
      setTitle(""); setAmount(""); setWant("");
    });
  }

  function Owner({ o }: { o: Offer }) {
    const p = who(o.owner);
    return <span className={s.owner}><i className={s.dot} style={{ background: p?.color ?? "#999" }} />{p?.name ?? "A farmer"}</span>;
  }

  function Row({ o, children }: { o: Offer; children?: React.ReactNode }) {
    const k = KINDS[(o.kind as Kind)] ?? KINDS.other;
    return (
      <li className={s.row}>
        <span className={s.icon} aria-hidden><PixelIcon name={k.icon} size={28} /></span>
        <span className={s.main}>
          <b>{o.title}</b>
          <em>{fmt(o)} · wants {o.want} · <Owner o={o} /></em>
          <small className={s.rule}>{k.rule}</small>
        </span>
        <span className={s.side}>{children}</span>
      </li>
    );
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue">
        <div className="ev-speaker">Swap Market</div>
        <div className="ev-tabs">
          <button className={tab === "market" ? "on" : ""} onClick={() => setTab("market")}>Market ({market.length})</button>
          <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>My stalls ({openCount}/5)</button>
        </div>
        <div className={`ev-body ${s.body}`}>
          <p className="ev-sub">One farmer&apos;s leftovers fill another&apos;s gap. Ruth checks the transfer rules before a swap, and the transfer itself happens in the program&apos;s own app or portal.</p>
          {tab === "market" && (
            <ul className={s.list}>
              {market.map((o) => (
                <Row key={String(o.id)} o={o}>
                  {o.status === "open"
                    ? <button className="ev-btn" onClick={() => void run(`Asked ${who(o.owner)?.name ?? "the owner"} for it. They confirm once it's sent.`, () => conn.reducers.takeOffer({ id: o.id }))}>Take</button>
                    : <>
                        <span className={s.pending}>Waiting on owner</span>
                        <button className="ev-btn ghost" onClick={() => void run("Released back to the market.", () => conn.reducers.cancelOffer({ id: o.id }))}>Release</button>
                      </>}
                </Row>
              ))}
              {!market.length && <li className={s.empty}>No open stalls right now. Post your own surplus under My stalls.</li>}
            </ul>
          )}
          {tab === "mine" && (
            <>
              <ul className={s.list}>
                {mine.map((o) => (
                  <Row key={String(o.id)} o={o}>
                    {o.status === "open" && <button className="ev-btn ghost" onClick={() => void run("Stall taken down.", () => conn.reducers.cancelOffer({ id: o.id }))}>Cancel</button>}
                    {o.status === "pending" && (
                      <>
                        <span className={s.pending}>{who(o.taker)?.name ?? "A farmer"} wants it</span>
                        <button className="ev-btn" onClick={() => void run("Swap done. It's in their letterbox.", () => conn.reducers.confirmSwap({ id: o.id }))}>Confirm sent</button>
                        <button className="ev-btn ghost" onClick={() => void run("Stall taken down.", () => conn.reducers.cancelOffer({ id: o.id }))}>Cancel</button>
                      </>
                    )}
                    {o.status === "done" && <span className={s.done}>✓ Swapped with {who(o.taker)?.name ?? "a farmer"}</span>}
                  </Row>
                ))}
                {!mine.length && <li className={s.empty}>You haven&apos;t posted anything yet.</li>}
              </ul>
              <div className={s.form} onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
                <b>Post a stall</b>
                <div className={s.kinds}>
                  {(Object.keys(KINDS) as Kind[]).map((k) => (
                    <button key={k} className={kind === k ? s.on : ""} onClick={() => { setKind(k); setUnit(KINDS[k].unit); }}><PixelIcon name={KINDS[k].icon} size={16} className="ev-ico" /> {KINDS[k].label}</button>
                  ))}
                </div>
                <p className={s.rule}>Ruth: {KINDS[kind].rule}</p>
                <div className={s.fields}>
                  <input placeholder="What you're offering (e.g. Flex dollars)" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <input placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={s.small} />
                  <input placeholder="Unit" maxLength={16} value={unit} onChange={(e) => setUnit(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className={s.small} />
                  <input placeholder="What you'd like back (or free)" maxLength={80} value={want} onChange={(e) => setWant(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") post(); }} />
                </div>
                <button className="ev-btn" disabled={openCount >= 5} onClick={post}>{openCount >= 5 ? "5 stalls max" : "Put it on the stall"}</button>
              </div>
            </>
          )}
          {msg && <p className={s.msg}>{msg}</p>}
        </div>
        <div className="ev-actions"><button className="ev-btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
