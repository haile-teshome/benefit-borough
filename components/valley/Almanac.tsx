"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { AppState } from "@/lib/types";
import type { Player } from "@/lib/valley_bindings/types";
import { whatIfPlans, yearlyValue } from "@/lib/library/value";
import { usd } from "@/lib/valley/layout";

// The Burrow Almanac: a leaderboard by quarter, year or all time; your seasons (what you rescued,
// what you missed, what's coming due each quarter); and what-if projections for new benefits.
// Green is money you rescued, purple is money ahead of you (validated for color-blind readers).

const TODAY = "2026-10-24";
const qOf = (iso: string) => `${iso.slice(0, 4)} Q${Math.floor((+iso.slice(5, 7) - 1) / 3) + 1}`;
const quarterStart = (iso: string) => `${iso.slice(0, 4)}-${String(Math.floor((+iso.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
function nextQuarters(from: string, n: number) {
  const out: string[] = []; let y = +from.slice(0, 4), q = Math.floor((+from.slice(5, 7) - 1) / 3) + 1;
  for (let i = 0; i < n; i++) { out.push(`${y} Q${q}`); if (++q > 4) { q = 1; y++; } }
  return out;
}

type Bar = { label: string; a: number; b?: number; note?: string };
function Bars({ bars, aName, bName }: { bars: Bar[]; aName: string; bName?: string }) {
  const max = Math.max(1, ...bars.map((x) => x.a + (x.b ?? 0)));
  return (
    <div className="ev-bars">
      {bName && <div className="ev-legend"><span><i className="a" /> {aName}</span><span><i className="b" /> {bName}</span></div>}
      {bars.map((x) => (
        <div key={x.label} className="ev-bar-row" title={`${x.label}: ${aName} ${usd(x.a)}${bName ? `, ${bName} ${usd(x.b ?? 0)}` : ""}`}>
          <span className="q">{x.label}</span>
          <div className="track">
            {x.a > 0 && <div className="seg a" style={{ width: `${(x.a / max) * 100}%` }} />}
            {(x.b ?? 0) > 0 && <div className="seg b" style={{ width: `${((x.b ?? 0) / max) * 100}%` }} />}
          </div>
          <b>{usd(x.a + (x.b ?? 0))}</b>
        </div>
      ))}
    </div>
  );
}

function Board({ since, players, myPid }: { since?: string; players: readonly Player[]; myPid: string }) {
  const rows = useQuery(api.states.board, { since });
  const name = (pid: string) => players.find((p) => p.identity.toHexString().startsWith(pid))?.name ?? "A farmer";
  if (!rows) return <p className="ev-sub">Loading the Burrow ledger…</p>;
  if (!rows.length) return <p className="ev-sub">No harvests in this period yet. The first one takes the crown.</p>;
  return (
    <ol className="ev-board big">
      {rows.slice(0, 8).map((r, i) => <li key={r.pid} className={r.pid === myPid ? "me" : ""}><b>{i === 0 ? "👑" : i + 1}</b><span>{name(r.pid)}{r.pid === myPid ? " (you)" : ""}</span><em>{usd(r.total)}</em></li>)}
    </ol>
  );
}

export function Almanac({ state, players, myPid, live, onClose }: { state: AppState | null; players: readonly Player[]; myPid: string; live: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"board" | "seasons" | "whatif">("board");
  const [period, setPeriod] = useState<"quarter" | "year" | "all">("quarter");
  const [adds, setAdds] = useState<Set<string>>(new Set());
  const [use, setUse] = useState(60);
  const s = state;

  const seasons = useMemo(() => {
    const ledger = s?.ledger ?? [], tiles = s?.tiles ?? [], done = new Set(s?.done ?? []);
    const rescued = new Map<string, number>(), missed = new Map<string, number>(), due = new Map<string, number>();
    for (const l of ledger) rescued.set(qOf(l.at.slice(0, 10)), (rescued.get(qOf(l.at.slice(0, 10))) ?? 0) + l.amount);
    for (const t of tiles) {
      if (done.has(t.id) || !t.atStake) continue;
      const q = qOf(t.deadline);
      if (t.deadline < TODAY) missed.set(q, (missed.get(q) ?? 0) + t.atStake); else due.set(q, (due.get(q) ?? 0) + t.atStake);
    }
    const quarters = [...new Set([...nextQuarters("2026-01-01", 4), ...rescued.keys(), ...missed.keys(), ...due.keys()])].sort();
    const year = (y: string, m: Map<string, number>) => [...m].filter(([q]) => q.startsWith(y)).reduce((a, [, v]) => a + v, 0);
    return { quarters, rescued, missed, due, years: ["2026", "2027"].map((y) => ({ y, rescued: year(y, rescued), missed: year(y, missed), due: year(y, due) })) };
  }, [s]);

  const planted = new Set((s?.docs ?? []).map((d) => d.meta?.plan).filter(Boolean) as string[]);
  const options = whatIfPlans(planted);
  const added = options.filter((p) => adds.has(p.id)).map((p) => ({ p, v: yearlyValue(p)! }));
  const addedNet = added.reduce((sum, { v }) => sum + v.gross * (use / 100) - (v.fee ?? 0), 0);
  const ahead = nextQuarters(TODAY, 4);
  const projection: Bar[] = ahead.map((q) => ({ label: q, a: seasons.due.get(q) ?? 0, b: Math.max(0, addedNet / 4) }));
  const pace = [...seasons.due.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-almanac">
        <div className="ev-speaker">Burrow Almanac</div>
        <div className="ev-tabs">
          <button className={tab === "board" ? "on" : ""} onClick={() => setTab("board")}>Leaderboard</button>
          <button className={tab === "seasons" ? "on" : ""} onClick={() => setTab("seasons")}>Your seasons</button>
          <button className={tab === "whatif" ? "on" : ""} onClick={() => setTab("whatif")}>What if…</button>
        </div>
        <div className="ev-body ev-almanac-body">
          {tab === "board" && (
            <>
              <div className="ev-pick">
                {(["quarter", "year", "all"] as const).map((p) => <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>{p === "quarter" ? `This quarter (${qOf(TODAY)})` : p === "year" ? "This year (2026)" : "All time"}</button>)}
              </div>
              {live ? <Board since={period === "quarter" ? quarterStart(TODAY) : period === "year" ? "2026-01-01" : undefined} players={players} myPid={myPid} />
                : <p className="ev-sub">The live leaderboard needs Convex. You've rescued {usd((s?.ledger ?? []).reduce((a, l) => a + l.amount, 0))}.</p>}
              <p className="ev-sub">Totals count only confirmed harvests (Ruth's rule 6), synced live from Convex.</p>
            </>
          )}
          {tab === "seasons" && (
            <>
              <div className="ev-years">
                {seasons.years.map((y) => (
                  <div key={y.y} className="ev-year"><b>{y.y}</b><span className="ok">{usd(y.rescued)} rescued</span>{y.missed > 0 && <span className="no">{usd(y.missed)} expired</span>}<span className="due">{usd(y.due)} coming due</span></div>
                ))}
              </div>
              <Bars aName="Rescued" bName="Coming due" bars={seasons.quarters.map((q) => ({ label: q, a: seasons.rescued.get(q) ?? 0, b: seasons.due.get(q) ?? 0 }))} />
              {[...seasons.missed.values()].some(Boolean) && <p className="ev-bad">Expired before you harvested: {[...seasons.missed].map(([q, v]) => `${q} ${usd(v)}`).join(", ")}</p>}
              <p className="ev-sub">Past quarters fill in as you harvest; upcoming ones come from your real deadlines.</p>
            </>
          )}
          {tab === "whatif" && (
            <>
              <p>If you harvest everything on your farm on time, the next 12 months bring in <b>{usd(pace)}</b>. Add benefits you're considering to see what they'd be worth.</p>
              <ul className="ev-whatif">
                {options.map((p) => {
                  const v = yearlyValue(p)!;
                  const net = v.gross * (use / 100) - (v.fee ?? 0);
                  return (
                    <li key={p.id}>
                      <label><input type="checkbox" checked={adds.has(p.id)} onChange={(e) => setAdds((cur) => { const n = new Set(cur); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                        <span><b>{p.title}</b><em>{v.note}{v.fee != null ? ` · annual fee ${usd(v.fee)}` : p.credits ? " · annual fee not confirmed; check before deciding" : ""}</em></span></label>
                      <b className={net >= 0 ? "ev-good" : "ev-bad"}>{net >= 0 ? "+" : "−"}{usd(Math.abs(net))}/yr{v.fee == null && p.credits ? " before fee" : ""}</b>
                    </li>
                  );
                })}
              </ul>
              <label className="ev-use">How much of a card's credits would you really use? <b>{use}%</b>
                <input type="range" min={0} max={100} step={10} value={use} onChange={(e) => setUse(+e.target.value)} />
              </label>
              <Bars aName="On your farm now" bName="From added benefits" bars={projection} />
              <p className="ev-lead">Next 12 months: {usd(pace)}{added.length ? ` ${addedNet >= 0 ? "+" : "−"} ${usd(Math.abs(addedNet))} = ${usd(pace + addedNet)}` : ""}</p>
              <p className="ev-sub">Options, not advice. A card is only worth its fee if you'd use the credits on things you already buy; Ruth's rules still apply to every harvest.</p>
            </>
          )}
        </div>
        <div className="ev-actions"><button className="ev-btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
