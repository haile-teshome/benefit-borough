"use client";

import { useState, type KeyboardEvent } from "react";
import type { Advice } from "@/lib/checkout/advise";
import css from "./Checkout.module.css";

type Row = { name: string; price: string };

const EXAMPLES: { label: string; merchant: string; items: Row[] }[] = [
  { label: "Saks: cashmere scarf $120", merchant: "Saks Fifth Avenue", items: [{ name: "Cashmere scarf", price: "120" }] },
  { label: "CVS: sunscreen + bandages $31", merchant: "CVS Pharmacy", items: [{ name: "Sunscreen SPF 50", price: "19" }, { name: "Bandages", price: "12" }] },
  { label: "Delta: checked bag fee $35", merchant: "Delta Air Lines", items: [{ name: "Checked bag fee", price: "35" }] },
];

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const stop = (e: KeyboardEvent) => e.stopPropagation(); // the game listens to keys
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// "Before you buy" at the Card House: Ruth ranks the ways to pay by how much expiring money the
// purchase rescues, and quotes the line from your documents each option relies on.
export function Checkout({ pid, onClose }: { pid: string; onClose: () => void }) {
  const [merchant, setMerchant] = useState("");
  const [rows, setRows] = useState<Row[]>([{ name: "", price: "" }]);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const items = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), price: parseFloat(r.price.replace(/[^0-9.]/g, "")) || 0 }));

  async function ask() {
    setBusy(true); setErr(""); setAdvice(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, cart: { merchant, items } }) });
      const json = (await res.json()) as { advice?: Advice; error?: string };
      if (!res.ok || !json.advice) throw new Error(json.error ?? `HTTP ${res.status}`);
      setAdvice(json.advice);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const best = advice?.options[advice.best];

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue">
        <div className="ev-speaker">Before you buy</div>
        <div className={`ev-body ${css.body}`}>
          {!advice ? (
            <>
              <p>Tell Ruth what's in your cart. She'll pick the way to pay that uses money you're about to lose.</p>
              <div className={css.examples}>
                {EXAMPLES.map((x) => (
                  <button key={x.label} className={css.chip} onClick={() => { setMerchant(x.merchant); setRows(x.items.map((r) => ({ ...r }))); }}>{x.label}</button>
                ))}
              </div>
              <label className={css.field}>
                <span>Store</span>
                <input value={merchant} placeholder="e.g. Saks, CVS, Delta" onChange={(e) => setMerchant(e.target.value)} onKeyDown={stop} />
              </label>
              <div className={css.rows}>
                {rows.map((r, i) => (
                  <div key={i} className={css.row}>
                    <input className={css.name} value={r.name} placeholder="Item" onChange={(e) => set(i, { name: e.target.value })} onKeyDown={stop} />
                    <input className={css.price} value={r.price} placeholder="$0" inputMode="decimal" onChange={(e) => set(i, { price: e.target.value })} onKeyDown={stop} />
                    <button className={css.x} aria-label="Remove item" disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                <button className={css.add} onClick={() => setRows([...rows, { name: "", price: "" }])}>+ Add item</button>
              </div>
              {err && <p className={css.err}>{err}</p>}
            </>
          ) : (
            <>
              {best && best.rescued > 0
                ? <p className="ev-lead">Pay with <b>{best.payWith}</b> and rescue {usd(best.rescued)}.</p>
                : <p className="ev-lead">Nothing expiring covers this one.</p>}
              <ol className={css.options}>
                {advice.options.map((o, i) => (
                  <li key={i} className={`${css.option} ${i === advice.best && o.rescued > 0 ? css.best : ""}`}>
                    <div className={css.amount}>{o.rescued > 0 ? usd(o.rescued) : "$0"}<small>rescued</small></div>
                    <div className={css.detail}>
                      <div className={css.head}>
                        <b>{o.payWith}</b>
                        {o.deadline && <span className={`${css.due} ${(o.daysLeft ?? 99) <= 14 ? css.soon : ""}`}>{o.daysLeft != null && o.daysLeft >= 0 ? `${o.daysLeft}d left` : ""} · {fmtDate(o.deadline)}</span>}
                      </div>
                      <p>{o.why}</p>
                      {o.cite && <p className={css.cite}>From your documents: <mark>{o.cite}</mark></p>}
                    </div>
                  </li>
                ))}
              </ol>
              {advice.splits && <p className={css.split}>{advice.splits}</p>}
              {advice.notes.map((n, i) => <p key={i} className={css.note}>{n}</p>)}
              <p className={css.engine}>{advice.engine === "claude" ? "Numbers from your balances; wording by Claude." : "Numbers and wording from Ruth's rules."}</p>
            </>
          )}
        </div>
        <div className="ev-actions">
          {!advice
            ? <button className="ev-btn" disabled={busy || !items.length} onClick={() => void ask()}>{busy ? "Ruth is checking…" : "Ask Ruth how to pay"}</button>
            : <button className="ev-btn" onClick={() => setAdvice(null)}>Change the cart</button>}
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
