"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Player } from "@/lib/valley_bindings/types";
import { usd } from "@/lib/valley/layout";

// Live from Convex: the valley leaderboard and the latest rescues. Both are reactive queries, so
// every farmer's screen updates the moment anyone's harvest confirms.
export function LiveBoard({ players, myPid }: { players: readonly Player[]; myPid: string }) {
  const totals = useQuery(api.states.totals);
  const recent = useQuery(api.states.recent, { limit: 4 });
  const nameOf = (pid: string) => players.find((p) => p.identity.toHexString().startsWith(pid))?.name ?? "A farmer";
  const [flash, setFlash] = useState("");
  const newest = recent?.[0] ? `${recent[0].pid}${recent[0].at}` : "";
  const seen = useRef("");
  useEffect(() => {
    if (!newest) return;
    if (seen.current && seen.current !== newest) { setFlash(newest); setTimeout(() => setFlash(""), 1600); }
    seen.current = newest;
  }, [newest]);
  if (!totals || !recent) return null;
  return (
    <div className="ev-panel ev-live">
      <div className="ev-live-head"><span className="dot" /> Valley ledger <small>live · Convex</small></div>
      {totals.length === 0 && <div className="ev-sub">No harvests yet. Be the first.</div>}
      <ol className="ev-board">
        {totals.slice(0, 3).map((t, i) => (
          <li key={t.pid} className={t.pid === myPid ? "me" : ""}><b>{i + 1}</b><span>{nameOf(t.pid)}</span><em>{usd(t.total)}</em></li>
        ))}
      </ol>
      <ul className="ev-feed">
        {recent.map((r) => (
          <li key={`${r.pid}${r.at}`} className={flash === `${r.pid}${r.at}` ? "new" : ""}>
            <em>+{usd(r.amount)}</em> {nameOf(r.pid)}: {r.description.replace(/^(Call|Submit|Request|File|Cancel|Schedule|Change|Link|Activate|Transfer)\s/i, (m) => m.toLowerCase())}
          </li>
        ))}
      </ul>
    </div>
  );
}
