"use client";

import { useState } from "react";
import { CATALOG, EARN, QUESTS, questProgress, type Contact, type Rewards } from "@/lib/rewards";

// The Acorn Exchange: your streak and weekly quests, the reward catalog, and your history.
// Cosmetics unlock instantly; real-world rewards are recorded for a rewards partner to fulfill.
export function Exchange({ pid, rewards, tango, onRewards, onWear, onClose }: { pid: string; rewards: Rewards; tango: boolean; onRewards: (r: Rewards) => void; onWear: (color: string) => void; onClose: () => void }) {
  // Only rewards that can actually be delivered: gift cards need a connected Tango Card account.
  const catalog = CATALOG.filter((c) => c.partner !== "tango" || tango);
  const [tab, setTab] = useState<"earn" | "rewards" | "history">("earn");
  const [msg, setMsg] = useState("");
  const [asking, setAsking] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>({});
  const owned = new Set(rewards.redemptions.map((r) => r.item));

  async function buy(id: string) {
    setMsg("");
    const item = CATALOG.find((c) => c.id === id);
    if (item?.partner === "tango" && asking !== id) { setAsking(id); return; }
    const res = await fetch("/api/rewards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, redeem: id, contact }) });
    const json = (await res.json()) as { rewards: Rewards; error?: string; redemption?: { name: string; status: string } };
    onRewards(json.rewards);
    if (!json.error) setAsking(null);
    setMsg(json.error ?? (json.redemption?.status === "unlocked" ? `${json.redemption.name} unlocked. Wear it below.` : json.redemption?.status === "sent" ? `${json.redemption.name} is on its way to your email.` : json.redemption?.status === "failed" ? `Tango Card couldn't send it, so your acorns are back.` : `${json.redemption?.name}: done.`));
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
                {catalog.map((c) => {
                  const have = owned.has(c.id) && c.kind === "cosmetic";
                  return (
                    <li key={c.id}>
                      {c.color && <i style={{ background: c.color }} />}
                      <span><b>{c.name}</b><em>{c.blurb}</em></span>
                      <strong>{c.cost.toLocaleString("en-US")} 🌰</strong>
                      {have ? <button className="ev-btn" onClick={() => onWear(c.color!)}>Wear it</button>
                        : <button className="ev-btn ghost" disabled={rewards.acorns < c.cost} onClick={() => void buy(c.id)}>{rewards.acorns < c.cost ? `${(c.cost - rewards.acorns).toLocaleString("en-US")} to go` : "Redeem"}</button>}
                      {asking === c.id && (
                        <div className="ev-redeem-form" onKeyDown={(e) => e.stopPropagation()}>
                          {c.partner === "tango" ? (
                            <>
                              <input placeholder="First name" value={contact.firstName ?? ""} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
                              <input placeholder="Email for the gift card" type="email" value={contact.email ?? ""} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                            </>
                          ) : (
                            <input placeholder="Your wallet on Base (0x…)" value={contact.wallet ?? ""} onChange={(e) => setContact({ ...contact, wallet: e.target.value })} />
                          )}
                          <button className="ev-btn" onClick={() => void buy(c.id)}>Send request</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {msg && <p className="ev-good">{msg}</p>}
              <p className="ev-sub">{tango ? "Gift cards are emailed by Tango Card right away, up to $10 a month." : "Spend acorns on looks and on more data for Ruth's agents. Gift cards appear here once a Tango Card account is connected."}</p>
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
