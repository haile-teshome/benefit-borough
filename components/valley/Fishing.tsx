"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FISH, type Fish } from "@/lib/fishing";
import type { Rewards } from "@/lib/rewards";
import { gameHour } from "@/lib/valley/clock";
import { sound } from "@/lib/valley/audio";
import styles from "./Fishing.module.css";
import { FishingScene, type FishView } from "./FishingScene";
import { Acorn } from "./PixelIcon";

// Pond fishing, seen first-person from the dock in 3D. Cast with a swinging power meter, wait for a bite, hit it in time, then reel:
// hold (space, mouse or touch) to lift the green bar and keep the fish inside it until the catch
// meter fills. The server picks the fish and pays the acorns.

type Journal = { caught: Record<string, number>; total: number; todayAcorns: number; cap: number };
type Phase = "aim" | "wait" | "bite" | "reel" | "result" | "journal";
type Result = { fish?: Fish; acorns: number; first: boolean; caught: boolean; note: string };

// 12x12 pixel fish: b body, l belly, f fin, k outline, w eye.
const FISH_ART = [
  "............", "......kk....", ".....kffk...", "..kkkbbbbk..", ".kbbbbbbwbk.", "kffkbbbbbbbk",
  "kffkllllllbk", ".kkkllllllk.", "....kkkkkk..", "............", "............", "............",
];
const BOOT_ART = [
  "............", "...kkkkk....", "...kbbbk....", "...kbbbk....", "...kbbbk....", "...kbbbkkkk.",
  "...kbbbbbbbk", "...kbbbbbbbk", "...klllllllk", "...kkkkkkkkk", "............", "............",
];
const RECEIPT_ART = [
  "...kkkkkk...", "...kbbbbk...", "...kbllbk...", "...kbbbbk...", "...kblllk...", "...kbbbbk...",
  "...kbllbk...", "...kbbbbk...", "...kffffk...", "...kfkfkf...", "............", "............",
];

export function FishSprite({ fish, size = 64, hidden }: { fish: Fish; size?: number; hidden?: boolean }) {
  const art = fish.id === "boot" ? BOOT_ART : fish.id === "receipt" ? RECEIPT_ART : FISH_ART;
  const pal: Record<string, string> = hidden ? { k: "#3b2412", b: "#5a4a3a", l: "#5a4a3a", f: "#5a4a3a", w: "#5a4a3a" } : { k: "#3b2412", b: fish.colors[0], l: fish.colors[1], f: fish.colors[2], w: "#fffaf0" };
  const cells: React.ReactElement[] = [];
  art.forEach((row, y) => [...row].forEach((ch, x) => { const c = pal[ch]; if (c) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />); }));
  return <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">{cells}</svg>;
}

export function Fishing({ pid, onClose, onRewards }: { pid: string; onClose: () => void; onRewards: (r: Rewards) => void }) {
  const [phase, setPhase] = useState<Phase>("aim");
  const [msg, setMsg] = useState("Press space or click to cast. Stop the meter near the top for rarer fish.");
  const [result, setResult] = useState<Result | null>(null);
  const [journal, setJournal] = useState<Journal | null>(null);
  const phaseRef = useRef<Phase>("aim");
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  // Live game state lives in refs and is drawn straight to the DOM, so the reel runs at 60fps.
  const g = useRef({ t0: 0, power: 0, difficulty: 1, biteAt: 0, biteUntil: 0, nibbles: [] as number[], holding: false, barY: 0.6, barV: 0, fishY: 0.5, fishT: 0.5, nextMove: 0, progress: 0.3, reelStart: 0 });
  const meterRef = useRef<HTMLDivElement>(null), barRef = useRef<HTMLDivElement>(null), fishRef = useRef<HTMLDivElement>(null), progRef = useRef<HTMLDivElement>(null), trackRef = useRef<HTMLDivElement>(null);
  // What the 3D scene shows; updated every frame from the game state.
  const view = useRef<FishView>({ phase: "aim", t0: 0, power: 0, castAt: 0, nibbles: [], biteAt: 0, fishY: 0.5, progress: 0.3, inside: true, difficulty: 1, landed: null });

  useEffect(() => { void fetch(`/api/fishing?pid=${encodeURIComponent(pid)}`).then((r) => r.json()).then((j) => setJournal(j.journal)).catch(() => {}); }, [pid]);

  const rewardsCb = useRef(onRewards); rewardsCb.current = onRewards; // a new callback must not restart the game loop
  const finish = useCallback(async (caught: boolean, note: string) => {
    go("result");
    try {
      const res = await fetch("/api/fishing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, action: "land", caught }) });
      const j = (await res.json()) as { fish?: Fish; acorns?: number; first?: boolean; rewards?: Rewards; journal?: Journal; error?: string };
      if (j.rewards) rewardsCb.current(j.rewards);
      view.current.landed = { caught: caught && !j.error, at: performance.now(), colors: j.fish?.colors, boot: j.fish?.id === "boot" };
      if (j.journal) setJournal(j.journal);
      setResult({ fish: j.fish, acorns: j.acorns ?? 0, first: Boolean(j.first), caught: caught && !j.error, note: j.error ? "The line snapped. Try again." : note });
      if (caught && !j.error) sound.coins(); else sound.refuse();
    } catch { setResult({ acorns: 0, first: false, caught: false, note: "The line snapped. Try again." }); }
  }, [pid]);

  const castLine = useCallback(async () => {
    const s = g.current;
    const p = 0.5 - 0.5 * Math.cos((performance.now() - s.t0) / 420); // the meter's swing, 0 to 1
    s.power = p; view.current.power = p; view.current.castAt = performance.now();
    sound.harvest();
    go("wait");
    setMsg(p > 0.9 ? "Perfect cast! Wait for a bite… don't pull too early." : "Nice cast. Wait for the bobber to dip…");
    try {
      const res = await fetch("/api/fishing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, action: "cast", power: p, hour: gameHour() }) });
      const j = (await res.json()) as { difficulty: number };
      s.difficulty = j.difficulty;
    } catch { s.difficulty = 2; }
    const now = performance.now();
    const wait = 1500 + Math.random() * 3200;
    s.biteAt = now + wait;
    s.nibbles = Array.from({ length: Math.floor(Math.random() * 3) }, () => now + Math.random() * (wait - 400));
  }, [pid]);

  const press = useCallback(() => {
    const p = phaseRef.current, s = g.current;
    if (p === "aim") void castLine();
    else if (p === "wait") { setMsg("Too early! You scared it off. Cast again."); sound.hmm(); void finish(false, "Too early: it swam away."); }
    else if (p === "bite") {
      go("reel"); sound.prompt();
      Object.assign(s, { barY: 0.6, barV: 0, fishY: 0.5, fishT: 0.5, nextMove: 0, progress: 0.3, reelStart: performance.now() });
      setMsg("Hold to lift the green bar. Keep the fish inside it!");
    }
  }, [castLine, finish]);

  // Input: space or mouse/touch. Press acts (cast, hook); holding lifts the bar while reeling.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== "e" && e.key !== "E") return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      g.current.holding = true; press();
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" || e.key === "e" || e.key === "E") g.current.holding = false; };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
  }, [press]);

  // The game loop.
  useEffect(() => {
    let raf = 0, last = performance.now();
    g.current.t0 = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = g.current, p = phaseRef.current;
      if (p === "aim" && meterRef.current) meterRef.current.style.height = `${(0.5 - 0.5 * Math.cos((now - s.t0) / 420)) * 100}%`;
      Object.assign(view.current, { phase: p, t0: s.t0, nibbles: s.nibbles, biteAt: s.biteAt, fishY: s.fishY, progress: s.progress, difficulty: s.difficulty });
      if (p === "wait" || p === "bite") {
        if (s.nibbles.some((t) => now > t && now < t + 20)) sound.blip();
        if (p === "wait" && s.biteAt && now > s.biteAt) { go("bite"); s.biteUntil = now + 820 - s.difficulty * 70; setMsg("!!! Now! Press space!"); sound.prompt(); }
        if (p === "bite" && now > s.biteUntil) { setMsg("Too slow, it got away."); void finish(false, "Too slow: it stole the bait."); }
      }
      if (p === "reel") {
        const d = s.difficulty;
        const barH = 0.3 - 0.03 * (d - 1);
        // the bar: lift while holding, gravity otherwise, soft bounce at the ends
        s.barV += (s.holding ? -3.6 : 2.6) * dt;
        s.barV *= Math.pow(0.12, dt); // a little drag, so the bar feels weighty but controllable
        s.barY += s.barV * dt;
        if (s.barY < 0) { s.barY = 0; s.barV *= -0.3; }
        if (s.barY > 1 - barH) { s.barY = 1 - barH; s.barV *= -0.35; }
        // the fish: picks new spots, darting more often and further the harder it is
        if (now > s.nextMove) {
          s.nextMove = now + (1700 - d * 230) * (0.45 + Math.random());
          const jump = 0.12 + d * 0.1;
          s.fishT = Math.max(0.03, Math.min(0.97, s.fishY + (Math.random() * 2 - 1) * jump));
        }
        s.fishY += (s.fishT - s.fishY) * Math.min(1, dt * (0.9 + d * 0.6));
        const inside = s.fishY >= s.barY && s.fishY <= s.barY + barH;
        view.current.inside = inside;
        s.progress += (inside ? 0.38 : -(0.1 + d * 0.035)) * dt;
        if (barRef.current) { barRef.current.style.top = `${s.barY * 100}%`; barRef.current.style.height = `${barH * 100}%`; barRef.current.classList.toggle(styles.on, inside); }
        if (fishRef.current) fishRef.current.style.top = `${s.fishY * 100}%`;
        if (progRef.current) { progRef.current.style.height = `${Math.max(0, Math.min(1, s.progress)) * 100}%`; progRef.current.style.background = s.progress > 0.66 ? "#3fa66b" : s.progress > 0.33 ? "#f2c94c" : "#e2574c"; }
        trackRef.current?.classList.toggle(styles.shake, !inside);
        if (s.progress >= 1) { setMsg("Caught it!"); void finish(true, "Caught!"); }
        else if (s.progress <= 0) { setMsg("It wriggled free!"); void finish(false, "It wriggled free."); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finish]);

  const again = () => { setResult(null); view.current.landed = null; g.current.t0 = performance.now(); g.current.biteAt = 0; go("aim"); setMsg("Press space or click to cast."); };
  const seen = journal?.caught ?? {};
  const count = Object.keys(seen).length;

  const hold = (on: boolean) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, [data-panel]")) return;
    if (on) { e.preventDefault(); if (phaseRef.current === "result" || phaseRef.current === "journal") return; g.current.holding = true; press(); } else g.current.holding = false;
  };

  // Full screen, first person: the 3D pond fills the view and the controls sit on top of it.
  return (
    <div className={styles.full} onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)}>
      <FishingScene live={view} />
      <div className={`ev-panel ${styles.top}`} data-panel>
        <b>Fishing at the pond</b>
        <span>Journal {count}/{FISH.length}{journal ? <> · <Acorn /> today {journal.todayAcorns}/{journal.cap}</> : ""}</span>
      </div>
      {phase === "bite" && <b className={styles.bang}>!</b>}
      {phase === "aim" && <div className={styles.meter}><div ref={meterRef} /><span>Power</span></div>}
      {phase === "reel" && (
        <div className={styles.reel}>
          <div ref={trackRef} className={styles.track}>
            <div ref={barRef} className={styles.bar} />
            <div ref={fishRef} className={styles.fish}><FishSprite fish={FISH[1]} size={30} hidden /></div>
          </div>
          <div className={styles.prog}><div ref={progRef} /></div>
        </div>
      )}
      {phase === "journal" ? (
        <div className={`ev-panel ${styles.journal}`} data-panel>
          <div className="ev-speaker">Fish journal</div>
          <p className="ev-sub">{count} of {FISH.length} found. Some only bite at night, some only by day.</p>
          <div className={styles.grid}>
            {FISH.map((f) => (
              <div key={f.id} className={styles.entry}>
                <FishSprite fish={f} size={48} hidden={!seen[f.id]} />
                <b>{seen[f.id] ? f.name : "???"}</b>
                <span>{seen[f.id] ? <>×{seen[f.id]} · {f.acorns} <Acorn /></> : f.when ? `Bites at ${f.when}` : "Not caught yet"}</span>
              </div>
            ))}
          </div>
          <div className="ev-actions"><button className="ev-btn" onClick={again}>Back to fishing</button></div>
        </div>
      ) : (
        <div className={`ev-panel ${styles.bottom}`} data-panel>
          {phase === "result" ? (
            result?.fish && result.caught ? (
              <div className={styles.resultRow}>
                <div className={styles.catch}><FishSprite fish={result.fish} size={64} />{result.first && <i className={styles.newTag}>New!</i>}</div>
                <div>
                  <h3>{result.fish.name}</h3>
                  <p>{result.fish.blurb}</p>
                  <p className={styles.gain}>{result.acorns > 0 ? `+${result.acorns} acorns${result.first ? " (first catch bonus)" : ""}` : result.fish.acorns === 0 ? "Worth nothing, but it's in your journal now." : "You've hit today's fishing acorn limit. It still counts for your journal."}</p>
                </div>
              </div>
            ) : (
              <div className={styles.resultRow}><div><h3>{result ? result.note : "Reeling in…"}</h3>{result?.fish && <p>It looked like a {result.fish.name}…</p>}</div></div>
            )
          ) : <p className={styles.msg}>{msg}</p>}
          <div className={styles.buttons}>
            {phase === "result" && <button className="ev-btn" onClick={again}>Cast again</button>}
            {(phase === "aim" || phase === "result") && <button className="ev-btn ghost" onClick={() => go("journal")}>Journal</button>}
            <button className="ev-btn ghost" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
