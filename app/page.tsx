"use client";

import { useEffect, useRef, useState } from "react";
import { usd } from "@/lib/engine/spans";
import type { AppState, DispatchResult, Span, Tile, Verdict } from "@/lib/types";

type Integrations = { claude: boolean; cartesia: boolean; nessie: boolean };

const CATEGORY: Record<Tile["category"], string> = {
  dental: "Dental", deductible: "Medical", dining: "Dining dollars", fsa: "FSA", card_credit: "Card credit", tax_window: "Open enrollment",
  bank_bonus: "Bank bonus", bank_fee: "Bank fees", idle_cash: "Idle cash", annual_fee: "Annual fee", credit_move: "Card credit", dispute: "Dispute",
  rotating: "Cash back", price_adjust: "Price drop", fsa_claim: "FSA claim", promo_apr: "Deferred interest", subscription: "Subscriptions", points: "Miles", insurance: "Insurance", vision: "Vision", hsa: "HSA", retirement: "401(k)", pto: "PTO", stipend: "Stipend", dcfsa: "Dependent care", espp: "ESPP",
};

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setV(a + (target - a) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(v);
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [scanStep, setScanStep] = useState(-1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ state: AppState; integrations: Integrations }>("/api/state").then((r) => { setState(r.state); setIntegrations(r.integrations); });
  }, []);

  const ledgerTotal = state?.ledger.reduce((s, e) => s + e.amount, 0) ?? 0;
  const atStake = state?.tiles.filter((t) => !state.done.includes(t.id)).reduce((s, t) => s + t.atStake, 0) ?? 0;
  const ledger = useCountUp(ledgerTotal);
  const stake = useCountUp(atStake);
  const soonest = state?.tiles.length ? Math.max(...state.tiles.map((t) => t.daysLeft)) : 0;

  async function scan(files?: FileList | null) {
    setError("");
    let docs: { id: string; name: string; text: string }[] | undefined;
    if (files?.length) {
      docs = await Promise.all([...files].map(async (f, i) => ({ id: `upload${i}`, name: f.name, text: await f.text() })));
    }
    setScanStep(0);
    const t1 = setTimeout(() => setScanStep(1), 700);
    const t2 = setTimeout(() => setScanStep(2), 1400);
    try {
      const r = await api<{ state: AppState }>("/api/scan", { docs });
      await new Promise((ok) => setTimeout(ok, 1800));
      setState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(t1); clearTimeout(t2); setScanStep(-1);
    }
  }

  async function resetAll() {
    const r = await api<{ state: AppState }>("/api/reset", {});
    setState(r.state);
    setOpenId(null);
  }

  const open = state?.tiles.find((t) => t.id === openId) ?? null;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          Expire
          <small>Trackers remind. Advisors suggest. Expire rescues, in the best order, and does it.</small>
          {integrations && (
            <div className="badges">
              <span className={`badge ${integrations.claude ? "live" : ""}`}>Claude {integrations.claude ? "live" : "mock"}</span>
              <span className={`badge ${integrations.cartesia ? "live" : ""}`}>Cartesia {integrations.cartesia ? "live" : "mock"}</span>
              <span className={`badge ${integrations.nessie ? "live" : ""}`}>Nessie {integrations.nessie ? "live" : "mock"}</span>
              <span className="badge">x402 mock</span>
            </div>
          )}
        </div>
        {state?.tiles.length ? (
          <div className="stats">
            <div className="stat"><div className="k">At stake · next {soonest} days</div><div className="v">{usd(stake)}</div></div>
            <div className="stat ledger"><div className="k">Rescued (confirmed)</div><div className="v">{usd(ledger)}</div></div>
          </div>
        ) : null}
      </header>

      {error && <p className="err">{error}</p>}

      {!state ? null : !state.tiles.length ? (
        <div className="hero">
          <h1>Find the money you're about to lose</h1>
          <p>Upload benefits summaries, treatment plans, EOBs, dining and card statements. Every number links to the line it came from.</p>
          <div className="doclist">{state.docs.map((d) => <span key={d.id} className="doc">{d.name}</span>)}</div>
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="accent" disabled={scanStep >= 0} onClick={() => scan()}>Scan the 5 sample documents</button>
            <label className="secondary" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 16px", cursor: "pointer", fontWeight: 600 }}>
              Upload .txt files
              <input type="file" multiple accept=".txt,text/plain" hidden onChange={(e) => scan(e.target.files)} />
            </label>
          </div>
          {scanStep >= 0 && (
            <div className="steps">
              {["Extracting balances", "Optimizing each tile", "Reviewer checking every action"].map((s, i) => (
                <span key={s} className={i <= scanStep ? "on" : ""}>{i <= scanStep ? "●" : "○"} {s}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {state.extraction?.dropped.length ? (
            <p className="note">Dropped {state.extraction.dropped.length} claim(s) not found verbatim in your documents.</p>
          ) : null}
          <div className="board">
            {state.tiles.map((t) => <TileCard key={t.id} tile={t} verdict={state.reviews[t.id]} done={state.done.includes(t.id)} onOpen={() => setOpenId(t.id)} />)}
          </div>
          <details className="audit">
            <summary>Audit trail ({state.audit.length} events) · engine: {state.extraction?.engine}</summary>
            <ul>{state.audit.map((e, i) => <li key={i}>{e.at.slice(11, 19)} {e.type}: {e.detail}</li>)}</ul>
          </details>
          <div className="actions"><button className="secondary" onClick={resetAll}>Reset demo</button></div>
        </>
      )}

      {open && state && (
        <TileDrawer key={open.id} tile={open} state={state} onState={setState} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

function TileCard({ tile, verdict, done, onOpen }: { tile: Tile; verdict?: Verdict; done: boolean; onOpen: () => void }) {
  return (
    <button className={`tile ${done ? "done" : ""}`} onClick={onOpen}>
      <div className="row">
        <span className="cat">{CATEGORY[tile.category]}</span>
        {done ? <span className="pill ok">Done ✓</span> : !tile.live ? <span className="pill static">Detected</span> : verdict?.verdict === "approve" ? <span className="pill ok">Reviewer ✓</span> : verdict ? <span className="pill no">Blocked</span> : null}
      </div>
      <div className="row">
        <span className="amt">{usd(Math.round(tile.atStake))}</span>
        <span className="days">{tile.daysLeft} days</span>
      </div>
      <div className="title">{tile.title}</div>
      <div className="head">{tile.headline}</div>
    </button>
  );
}

function SourceView({ span, docs }: { span: Span; docs: AppState["docs"] }) {
  const doc = docs.find((d) => d.id === span.doc);
  if (!doc) return null;
  const lineStart = doc.text.lastIndexOf("\n", span.start - 1) + 1;
  const lineEndIdx = doc.text.indexOf("\n", span.end);
  const lineEnd = lineEndIdx < 0 ? doc.text.length : lineEndIdx;
  return (
    <div className="src">
      <span className="name">{doc.name} · chars {span.start}–{span.end}</span>
      {doc.text.slice(lineStart, span.start)}<mark>{doc.text.slice(span.start, span.end)}</mark>{doc.text.slice(span.end, lineEnd)}
    </div>
  );
}

function TileDrawer({ tile, state, onState, onClose }: { tile: Tile; state: AppState; onState: (s: AppState) => void; onClose: () => void }) {
  const verdict = state.reviews[tile.id];
  const done = state.done.includes(tile.id);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [error, setError] = useState("");
  const [cart, setCart] = useState("Sunscreen SPF 50, Aloe vera gel");
  const cartVerdict = state.reviews[`cart:${tile.balanceIds[0]}`];
  const rec = tile.candidates.find((c) => c.id === tile.recommendation);
  const canAct = tile.live && tile.action.kind !== "none" && verdict?.verdict === "approve" && !done;

  async function run() {
    setBusy(true); setError(""); setConfirming(false); setLines([]);
    try {
      const r = await api<{ state: AppState; result: DispatchResult }>("/api/dispatch", { tileId: tile.id });
      if (r.result.audioBase64) new Audio(`data:audio/mpeg;base64,${r.result.audioBase64}`).play().catch(() => {});
      for (const line of r.result.transcript) {
        setLines((l) => [...l, line]);
        await new Promise((ok) => setTimeout(ok, 900));
      }
      setResult(r.result);
      onState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkCart() {
    setBusy(true); setError("");
    try {
      const r = await api<{ state: AppState }>("/api/review-cart", { balanceId: tile.balanceIds[0], items: cart.split(",").map((s) => s.trim()).filter(Boolean) });
      onState(r.state);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="note">{CATEGORY[tile.category]} · {tile.daysLeft} days left · deadline {tile.deadline}</span>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        <h2>{tile.headline}</h2>

        <div className="section">
          <h3>Options</h3>
          <div className="cands">
            {tile.candidates.map((c) => (
              <div key={c.id} className={`cand ${c.id === tile.recommendation ? "rec" : ""}`}>
                <div className="c">{usd(c.costToUser)}</div>
                <div className="l">{c.label}{c.id === tile.recommendation ? " · recommended" : ""}</div>
                <div className="d">{c.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="three">
            <div><div className="k">Recommendation</div>{rec?.label}</div>
            <div><div className="k">Tradeoff</div>{tile.tradeoff}</div>
            <div><div className="k">Do-nothing cost · {usd(tile.doNothingCost)}</div>{tile.doNothing}</div>
          </div>
        </div>

        <div className="section">
          <h3>Reviewer</h3>
          {verdict && (
            <div className={`verdict ${verdict.verdict}`}>
              {verdict.verdict === "approve" ? "Approved" : "Rejected"}{verdict.rule_cited ? ` · rule ${verdict.rule_cited}` : ""}: {verdict.reason}
              <small>{verdict.engine === "claude" ? "Claude Reviewer + rule checks" : "Rule checks"}</small>
            </div>
          )}

          {tile.live && tile.action.kind !== "none" && (
            <>
              {done ? (
                <p><strong>Done.</strong> Ledger +{usd(tile.action.savings)} · confirmation {state.ledger.find((l) => l.tileId === tile.id)?.confirmation}</p>
              ) : confirming ? (
                <div className="section confirm">
                  <strong>Confirm before Expire acts:</strong> {tile.action.summary}. Nothing else will be said or paid.
                  <div className="actions">
                    <button className="accent" onClick={run}>Yes, do it</button>
                    <button className="secondary" onClick={() => setConfirming(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button className="accent" disabled={!canAct || busy} onClick={() => setConfirming(true)}>
                    {tile.action.kind === "book_call" ? "📞 Book it" : "Send transfer"} · saves {usd(tile.action.savings)}
                  </button>
                </div>
              )}
            </>
          )}

          {lines.length > 0 && (
            <div className="section">
              <h3>{tile.action.kind === "book_call" ? "Call" : "Transfer"} {result ? `· ${result.integration}` : "· in progress"}</h3>
              <div className="transcript">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>
            </div>
          )}

          {tile.category === "fsa" && (
            <div className="section cart">
              <h3>Try a purchase against this balance</h3>
              <input value={cart} onChange={(e) => setCart(e.target.value)} aria-label="Cart items, comma separated" />
              <div className="actions"><button disabled={busy} onClick={checkCart}>Ask the Reviewer</button></div>
              {cartVerdict && (
                <div className={`verdict ${cartVerdict.verdict}`} style={{ marginTop: 12 }}>
                  {cartVerdict.verdict === "approve" ? "Approved" : "Rejected"}{cartVerdict.rule_cited ? ` · rule ${cartVerdict.rule_cited}` : ""}: {cartVerdict.reason}
                </div>
              )}
            </div>
          )}
          {error && <p className="err">{error}</p>}
        </div>

        <div className="section">
          <h3>Where these numbers come from</h3>
          {tile.sources.map((s, i) => <SourceView key={i} span={s} docs={state.docs} />)}
        </div>
      </div>
    </div>
  );
}
