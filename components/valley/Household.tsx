"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import styles from "./Outbox.module.css";

// Co-op household (Convex): share a live view of each other's expiring claims with a partner,
// family or roommates, and co-sign a packet before its owner submits it.
export function Household({ pid, name, color, onClose }: { pid: string; name: string; color: string; onClose: () => void }) {
  const house = useQuery(api.households.mine, { pid });
  const create = useMutation(api.households.create), join = useMutation(api.households.join), leave = useMutation(api.households.leave), cosign = useMutation(api.households.cosign);
  const [code, setCode] = useState("");
  const [houseName, setHouseName] = useState("");
  const [error, setError] = useState("");
  const run = async (f: () => Promise<unknown>) => { setError(""); try { await f(); } catch (e) { setError((e as Error).message.replace(/^.*Uncaught Error: /, "").split("\n")[0]); } };

  return (
    <div className="ev-dialogue-wrap">
      <div className={`ev-panel ev-dialogue ${styles.panel}`}>
        <div className="ev-speaker">{house ? `${house.name} · household` : "Co-op household"}</div>
        <div className={`ev-body ${styles.body}`} onKeyDown={(e) => e.stopPropagation()}>
          {house === undefined && <p className="ev-sub">Loading…</p>}
          {house === null && (
            <>
              <p className="ev-lead">Share your farm with a partner, family or roommates. You'll see each other's deadlines live, and can co-sign each other's claims before they're sent.</p>
              <div className={styles.fields}>
                <label className={styles.field}><span>Start a household</span><input value={houseName} placeholder="The Lee-Chen borough" onChange={(e) => setHouseName(e.target.value)} /></label>
                <label className={styles.field}><span>Or join with a code</span><input value={code} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
              </div>
            </>
          )}
          {house && (
            <>
              <p className="ev-sub">Invite code <b>{house.code}</b>: anyone in the borough can join with it. Live from Convex.</p>
              <div className={styles.summary}>
                <div><b>${house.members.reduce((x, m) => x + m.open, 0).toFixed(0)}</b><span>open across the household</span></div>
                <div><b>${house.members.reduce((x, m) => x + m.rescued, 0).toFixed(0)}</b><span>rescued together</span></div>
                <div><b>{house.members.reduce((x, m) => x + m.ready.length, 0)}</b><span>packets ready to submit</span></div>
              </div>
              <ul className={styles.list}>
                {house.members.map((m) => (
                  <li key={m.pid} className={styles.block}>
                    <b><i style={{ display: "inline-block", width: 10, height: 10, background: m.color, marginRight: 6 }} />{m.name}{m.you ? " (you)" : ""} · ${m.open.toFixed(0)} open · ${m.rescued.toFixed(0)} rescued</b>
                    <ul className={styles.check}>
                      {m.soon.map((t) => <li key={t.title} className={t.daysLeft <= 14 ? styles.issue : ""}>{t.title}: ${t.atStake.toFixed(0)}, {t.daysLeft}d</li>)}
                      {m.ready.map((p) => (
                        <li key={p.id} className={styles.ok}>
                          Ready: {p.form} (${p.amount.toFixed(2)}){p.cosignedBy.length ? ` · co-signed by ${p.cosignedBy.map((by) => house.members.find((x) => x.pid === by)?.name ?? "a member").join(", ")}` : ""}
                          {!m.you && !p.cosignedBy.includes(pid) && <button className="ev-link" onClick={() => void run(() => cosign({ pid, code: house.code, packetId: p.id, owner: m.pid }))}> Co-sign</button>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
          {error && <p className="ev-bad">{error}</p>}
        </div>
        <div className="ev-actions">
          {house === null && <button className="ev-btn" onClick={() => void run(() => create({ pid, name, color, house: houseName }))}>Start a household</button>}
          {house === null && <button className="ev-btn ghost" disabled={code.length < 6} onClick={() => void run(() => join({ pid, name, color, code }))}>Join</button>}
          {house && <button className="ev-btn ghost" onClick={() => void run(() => leave({ pid }))}>Leave household</button>}
          <button className="ev-btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
