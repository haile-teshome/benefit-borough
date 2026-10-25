"use client";

import { useMemo, useState } from "react";
import type { AppState, Tile } from "@/lib/types";
import { CROP_LOOK, usd } from "@/lib/valley/layout";
import { BUILDINGS } from "@/lib/valley/world";

// Everything you can claim, as a plain list: no walking required. Sort by deadline or value,
// filter by status, and open any claim to act on it. Also the home of the calendar export.

type Sort = "deadline" | "value";
type Show = "open" | "claimed" | "all";

const placeOf = (t: Tile) => BUILDINGS.find((b) => b.place?.categories?.includes(t.category))?.place?.name ?? "Your farm";

function status(t: Tile, s: AppState): { text: string; tone: "ok" | "wait" | "no" | "info" } {
  if (s.done.includes(t.id)) return { text: "Claimed", tone: "ok" };
  const v = s.reviews[t.id];
  if (!t.live || t.action.kind === "none") return { text: "Info", tone: "info" };
  if (v?.verdict === "reject") return { text: "Ruth said no", tone: "no" };
  if (t.ask && !s.answers?.[t.id]) return { text: "Ruth has a question", tone: "wait" };
  return { text: "Ready to harvest", tone: "ok" };
}

export function Claims({ state, pid, onOpen, onCheckin, onClose }: { state: AppState; pid: string; onOpen: (tileId: string) => void; onCheckin: () => void; onClose: () => void }) {
  const [sort, setSort] = useState<Sort>("deadline");
  const [show, setShow] = useState<Show>("open");
  const rows = useMemo(() => {
    const done = new Set(state.done);
    return state.tiles
      .filter((t) => (show === "all" ? true : show === "claimed" ? done.has(t.id) : !done.has(t.id)))
      .sort((a, b) => (sort === "deadline" ? a.deadline.localeCompare(b.deadline) : b.atStake - a.atStake));
  }, [state, sort, show]);
  const open = state.tiles.filter((t) => !state.done.includes(t.id));
  const openValue = open.reduce((s, t) => s + t.atStake, 0);
  const soon = open.filter((t) => t.daysLeft <= 14 && t.atStake > 0);
  const rescued = state.ledger.reduce((s, l) => s + l.amount, 0);
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: iso.slice(0, 4) !== "2026" ? "numeric" : undefined, timeZone: "UTC" });

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-claims-panel">
        <div className="ev-speaker">My claims</div>
        <div className="ev-claims-summary">
          <div><b>{usd(openValue)}</b><span>open across {open.length} claims</span></div>
          <div className={soon.length ? "warn" : ""}><b>{soon.length}</b><span>due in the next 14 days</span></div>
          <div className="ok"><b>{usd(rescued)}</b><span>rescued so far</span></div>
        </div>
        <div className="ev-claims-tools">
          <div className="ev-pick">
            {(["open", "claimed", "all"] as Show[]).map((x) => <button key={x} className={show === x ? "on" : ""} onClick={() => setShow(x)}>{x === "open" ? "Open" : x === "claimed" ? "Claimed" : "All"}</button>)}
          </div>
          <div className="ev-pick">
            <span className="ev-sub">Sort:</span>
            <button className={sort === "deadline" ? "on" : ""} onClick={() => setSort("deadline")}>Soonest</button>
            <button className={sort === "value" ? "on" : ""} onClick={() => setSort("value")}>Biggest</button>
          </div>
        </div>
        <div className="ev-claims-table" role="table" aria-label="My claims">
          <div className="row head" role="row"><span>Claim</span><span>Where</span><span>Due</span><span className="num">Value</span><span>Status</span></div>
          {rows.map((t) => {
            const st = status(t, state);
            return (
              <button key={t.id} className="row" role="row" onClick={() => onOpen(t.id)} title="Open this claim">
                <span className="what"><i style={{ background: CROP_LOOK[t.category]?.band ?? "#8a4f22" }} />{t.title}</span>
                <span className="where">{placeOf(t)}</span>
                <span className={t.daysLeft <= 14 && !state.done.includes(t.id) ? "due soon" : "due"}>{fmt(t.deadline)}<em>{state.done.includes(t.id) ? "" : `${t.daysLeft}d`}</em></span>
                <span className="num">{t.atStake ? usd(t.atStake) : "—"}</span>
                <span className={`st ${st.tone}`}>{st.text}</span>
              </button>
            );
          })}
          {!rows.length && <p className="ev-sub">{show === "claimed" ? "Nothing claimed yet." : "Nothing open. Plant your plans to get started."}</p>}
        </div>
        <div className="ev-actions">
          <a className="ev-btn ghost" href={`/api/calendar?pid=${pid}`} download="benefit-burrow.ics">Add deadlines to my calendar</a>
          <button className="ev-btn ghost" onClick={onCheckin}>Weekly check-in</button>
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
