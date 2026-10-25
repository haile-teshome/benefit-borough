"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { AppState, AuditEvent } from "@/lib/types";
import { speak } from "@/lib/valley/audio";
import { expire } from "@/lib/valley/expire";

// Ruth's side of the Hyphenate pitch: what she may do, what's real, and her record of work.

const CAN = [
  "Read the documents you plant and quote the exact line behind every number.",
  "Propose actions with the cost of doing nothing shown next to them.",
  "Reject anything that isn't already in your documents or stated needs, including new care and \"using it up\" purchases.",
];
const CANNOT = [
  "Act without your tap, or move more than the amount on the card.",
  "Count a dollar before the call, transfer or refund confirms.",
  "Be argued out of a rule. New facts have to come as a document she can check.",
];

const TYPE: Record<string, string> = { extract: "READ", optimize: "PLAN", review: "REVIEW", dispatch: "ACT", ledger: "LEDGER", ask: "ASKED YOU", challenge: "DEFENDED" };

function Trail({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="ev-sub">Nothing yet. Plant your documents and I'll start keeping notes.</p>;
  return (
    <ol className="ev-trail">
      {events.slice(0, 40).map((e, i) => (
        <li key={`${e.at}${i}`} className={/reject|failed|declin|held/i.test(e.detail) ? "no" : e.type === "ledger" ? "ok" : ""}>
          <span className="t">{TYPE[e.type] ?? e.type.toUpperCase()}</span>
          <span className="d">{e.detail}</span>
          <span className="w">{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        </li>
      ))}
    </ol>
  );
}

function LiveTrail({ pid, fallback }: { pid: string; fallback: AuditEvent[] }) {
  const events = useQuery(api.states.trail, { pid, limit: 40 });
  return <Trail events={events?.length ? events : fallback} />;
}

export function RuthRecord({ state, pid, integrations, live, onClose }: { state: AppState | null; pid: string; integrations: Record<string, boolean>; live: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"record" | "real" | "rules">("record");
  const real: [string, boolean, string][] = [
    ["Reading your documents", Boolean(integrations.claude), integrations.claude ? "Claude extracts and reviews every balance" : "Rules engine on the sample documents"],
    ["Bank and card activity", Boolean(integrations.nessie), integrations.nessie ? "Live from Capital One Nessie (sandbox bank)" : "Sample statement"],
    ["Ruth's voice and booking calls", Boolean(integrations.cartesia), integrations.cartesia ? "Cartesia text-to-speech" : "Text only"],
    ["Saved games and the Burrow ledger", Boolean(integrations.convex), integrations.convex ? "Convex, live queries" : "Local file"],
    ["Multiplayer farms, gifts, chat", true, "SpacetimeDB"],
    ["Store prices for price matches", Boolean(integrations.apify), integrations.apify ? "Read live from the store's page with Apify" : "Price from the sample statement"],
    ["Ruth pays for the data she uses", Boolean(integrations.x402), integrations.x402 ? "Coinbase x402: $0.01 USDC per price check, settled on Base Sepolia" : "Not connected"],
    ["Dining-dollar transfers", Boolean(integrations.nessie), integrations.nessie ? "Posted as a Nessie transfer" : "Simulated x402 payment"],
    ["Filling in claim forms", true, "Ruth fills every claim (form, receipts, message, PDF) from your documents; you review and submit"],
    ["Night shifts (Autopilot)", Boolean(integrations.convex), integrations.convex ? "Scheduled by a Convex cron; prepares claims, never submits" : "Scheduled on this server; prepares claims, never submits"],
    ["Voice check-in", Boolean(integrations.cartesia), integrations.cartesia ? "Cartesia speech-to-text, Claude maps it onto your plans, Ruth answers in her voice" : "Typed check-in"],
    ["Payday and savings moves", Boolean(integrations.nessie), integrations.nessie ? "Paychecks read from Nessie; savings moves are real Nessie transfers you submit" : "Not connected"],
    ["Fine-print watch", true, integrations.termsActor ? "Benefit Terms Watcher, a custom Apify actor" : "Same checks run on this server until the Apify actor is deployed"],
    ["Swap Market", true, "SpacetimeDB: live offers between players; the transfer itself happens in each program's app"],
    ["Phone calls to offices", false, "Voice is real; the other side of the call is scripted"],
    ["Forms, chats and app taps (refunds, disputes, cancels)", false, "Scripted: each provider's API is the next step"],
  ];
  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue ev-record">
        <div className="ev-speaker">Ruth's record</div>
        <div className="ev-tabs">
          <button className={tab === "record" ? "on" : ""} onClick={() => setTab("record")}>What I did</button>
          <button className={tab === "real" ? "on" : ""} onClick={() => setTab("real")}>What's real</button>
          <button className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")}>What I'm allowed</button>
        </div>
        <div className="ev-body ev-record-body">
          {tab === "record" && (live ? <LiveTrail pid={pid} fallback={state?.audit ?? []} /> : <Trail events={state?.audit ?? []} />)}
          {tab === "real" && (
            <ul className="ev-real">
              {real.map(([what, isLive, how]) => <li key={what}><b className={isLive ? "live" : "sim"}>{isLive ? "LIVE" : "SIMULATED"}</b><span>{what}</span><em>{how}</em></li>)}
            </ul>
          )}
          {tab === "rules" && (
            <div className="ev-rules">
              <p><b>I can</b></p><ul>{CAN.map((c) => <li key={c}>{c}</li>)}</ul>
              <p><b>I can't</b></p><ul>{CANNOT.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="ev-actions"><button className="ev-btn ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

// Ruth asks before acting when only you know the answer (do you still use it? do you have an FSA?).
export function RuthAsks({ question, onAnswer }: { question: string; onAnswer: (reply: "go" | "keep") => void }) {
  return (
    <div className="ev-ask">
      <span className="who">Ruth asks</span>
      <p>{question}</p>
      <div className="ev-ask-actions">
        <button className="ev-btn ghost" onClick={() => onAnswer("keep")}>No, leave it</button>
        <button className="ev-btn" onClick={() => onAnswer("go")}>Yes, go ahead</button>
      </div>
    </div>
  );
}

// Push back on a verdict; Ruth answers in her own voice and the exchange goes in her record.
export function PushBack({ pid, verdictKey, onState }: { pid: string; verdictKey: string; onState: (s: AppState) => void }) {
  const [text, setText] = useState("");
  const [reply, setReply] = useState<{ stance: string; reply: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await expire.challenge(pid, verdictKey, text);
      setReply(r.reply);
      onState(r.state);
      void speak(r.reply.reply);
      setText("");
    } catch (e) {
      setReply({ stance: "hold", reply: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ev-push">
      {reply && <p className={`ev-push-reply ${reply.stance}`}><b>Ruth:</b> {reply.reply}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Disagree? Tell Ruth why…" maxLength={500} onKeyDown={(e) => e.stopPropagation()} />
        <button className="ev-btn ghost" disabled={busy || !text.trim()}>{busy ? "…" : "Push back"}</button>
      </form>
    </div>
  );
}
