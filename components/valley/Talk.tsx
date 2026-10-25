"use client";

import { useState } from "react";
import { speak } from "@/lib/valley/audio";

// Free-form chat with a villager or shopkeeper. They answer in character (Claude plays them from
// their personality sheet) and in their own Cartesia voice.
type Turn = { from: "you" | "them"; text: string };

export function TalkBox({ pid, who, name, voice, hearts: startHearts = 0, onSaid }: { pid: string; who: string; name: string; voice: string; hearts?: number; onSaid?: () => void }) {
  const [history, setHistory] = useState<Turn[]>([]);
  const [hearts, setHearts] = useState(startHearts);
  const [news, setNews] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setBusy(true); setText("");
    const next: Turn[] = [...history, { from: "you", text: msg }];
    setHistory(next);
    try {
      const res = await fetch("/api/npc-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, who, message: msg, history }) });
      const json = (await res.json()) as { reply?: string; error?: string; hearts?: number; heartUp?: boolean; told?: boolean };
      if (typeof json.hearts === "number") setHearts(json.hearts);
      setNews(json.heartUp ? `You and ${name} are closer now` : json.told ? `${name} told you something new` : "");
      const reply = json.reply ?? json.error ?? "…";
      setHistory([...next, { from: "them", text: reply }]);
      onSaid?.();
      void speak(reply, voice);
    } catch {
      setHistory([...next, { from: "them", text: "Sorry, I didn't catch that." }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ev-talk">
      <div className="ev-hearts" title={`Friendship with ${name}: ${hearts} of 5 hearts. Chat more to hear their stories.`}>
        {Array.from({ length: 5 }, (_, i) => <span key={i} className={i < hearts ? "on" : ""}>♥</span>)}
        {news && <em key={news}>{news}</em>}
      </div>
      {history.length > 0 && (
        <div className="ev-talk-log">
          {history.slice(-6).map((h, i) => <p key={i} className={h.from}><b>{h.from === "you" ? "You" : name}:</b> {h.text}</p>)}
          {busy && <p className="them"><b>{name}:</b> …</p>}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Say something to ${name}…`} maxLength={300} onKeyDown={(e) => e.stopPropagation()} />
        <button className="ev-btn ghost" disabled={busy || !text.trim()}>{busy ? "…" : "Say"}</button>
      </form>
    </div>
  );
}
