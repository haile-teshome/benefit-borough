"use client";

import { useState } from "react";
import { CATALOG, EARN, QUESTS, questProgress, type Rewards } from "@/lib/rewards";

// The Acorn Exchange: your streak and weekly quests, the reward catalog, and your history.
// Cosmetics unlock instantly; real-world rewards are recorded for a rewards partner to fulfill.
export function Exchange({ pid, rewards, onRewards, onWear, onClose }: { pid: string; rewards: Rewards; onRewards: (r: Rewards) => void; onWear: (color: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"earn" | "rewards" | "history">("earn");
  const [msg, setMsg] = useState("");
  const owned = new Set(rewards.redemptions.map((r) => r.item));

  async function buy(id: string) {
    setMsg("");
    const res = await fetch("/api/rewards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, redeem: id }) });
    const json = (await res.json()) as { rewards: Rewards; error?: string; redemption?: { name: string; status: string } };
    onRewards(json.rewards);
    setMsg(json.error ?? (json.redemption?.status === "unlocked" ? `${json.redemption.name} unlocked. Wear it below.` : `${json.redemption?.name} requested. In this demo it's recorded but not sent.`));
  }

  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-almanac">
        <div className="ev-speaker">Acorn Exchange</div>
        <div className="ev-acorn-head">
          <div><b>🌰 {rewards.acorns.toLocaleString("en-US")}</b><span>acorns to spend</span></div>
          <div><b>🔥 {rewards.streak}</b><span>day streak (best {rewards.best})</span></div>
          <div><b>{rewards.earned.toLocaleString("en-US")}</b><span>earned all time</span></div>
        </div>
        <div className="ev-tabs">
          <button className={tab === "earn" ? "on" : ""} onClick={() => setTab("earn")}>Earn</button>
          <button className={tab === "rewards" ? "on" : ""} onClick={() => setTab("rewards")}>Rewards</button>
          <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>History</button>
        </div>
        <div className="ev-body ev-almanac-body">
          {tab === "earn" && (
            <>
              <b>This week's quests</b>
              <ul className="ev-quests">
                {QUESTS.map((q) => {
                  const p = Math.min(q.goal, questProgress(rewards, q));
                  const done = rewards.week.claimed.includes(q.id);
                  return (
                    <li key={q.id} className={done ? "done" : ""}>
                      <span>{done ? "✓ " : ""}{q.label}</span>
                      <div className="track"><div style={{ width: `${(p / q.goal) * 100}%` }} /></div>
                      <em>{p}/{q.goal} · +{q.reward} 🌰</em>
                    </li>
                  );
                })}
              </ul>
              <b>Ways to earn</b>
              <ul className="ev-earn">
                <li><span>Visit once a day</span><em>+{EARN.visit}, plus +{EARN.streakStep} per day of streak (up to +{EARN.streakMax})</em></li>
                <li><span>Weekly check-in</span><em>+{EARN.checkin}</em></li>
                <li><span>Rescue money (confirmed harvests)</span><em>+{EARN.harvestBase}, plus +1 per $20 saved (up to +{EARN.harvestMax})</em></li>
                <li><span>Plant your first farm</span><em>+{EARN.firstPlant}</em></li>
              </ul>
              <p className="ev-sub">Up to 300 acorns a day. Harvests only count after Ruth approves and the action confirms, so acorns never reward spending you didn't need.</p>
            </>
          )}
          {tab === "rewards" && (
            <>
              <ul className="ev-catalog">
                {CATALOG.map((c) => {
                  const have = owned.has(c.id) && c.kind === "cosmetic";
                  return (
                    <li key={c.id}>
                      {c.color && <i style={{ background: c.color }} />}
                      <span><b>{c.name}</b><em>{c.blurb}{c.kind === "real" ? " · fulfilled by a rewards partner" : ""}</em></span>
                      <strong>{c.cost.toLocaleString("en-US")} 🌰</strong>
                      {have ? <button className="ev-btn" onClick={() => onWear(c.color!)}>Wear it</button>
                        : <button className="ev-btn ghost" disabled={rewards.acorns < c.cost} onClick={() => void buy(c.id)}>{rewards.acorns < c.cost ? `${(c.cost - rewards.acorns).toLocaleString("en-US")} to go` : "Redeem"}</button>}
                    </li>
                  );
                })}
              </ul>
              {msg && <p className="ev-good">{msg}</p>}
              <p className="ev-sub">Real-world rewards need a funded rewards partner (a gift card API or a Coinbase payout). In this demo, requests are recorded as pending and nothing is sent.</p>
            </>
          )}
          {tab === "history" && (
            <ul className="ev-earn">
              {rewards.redemptions.map((r) => <li key={r.id}><span>{r.name}</span><em>−{r.cost} 🌰 · {r.status}</em></li>)}
              {rewards.history.slice(0, 30).map((h, i) => <li key={i}><span>{h.note}</span><em>{h.amount > 0 ? "+" : ""}{h.amount} 🌰 · {new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</em></li>)}
              {!rewards.history.length && <li>Nothing yet. Come back tomorrow to start a streak.</li>}
            </ul>
          )}
        </div>
        <div className="ev-actions"><button className="ev-btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
