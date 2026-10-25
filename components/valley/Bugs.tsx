"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BUGS, type Bug } from "@/lib/minigames";
import type { Rewards } from "@/lib/rewards";
import { gameHour } from "@/lib/valley/clock";
import { sound } from "@/lib/valley/audio";
import { driftClouds, flowers, ground, makeStage, mat, rnd, toScreen, tree } from "@/lib/valley/three-kit";
import fish from "./Fishing.module.css";
import styles from "./Minigame.module.css";

// Bug catching in the meadow, first person. Butterflies circle the flowers, bees zip between them,
// beetles sit on tree trunks, dragonflies dart over the pond, and fireflies come out at night.
// Walk with WASD, hold Shift to tiptoe (walking up fast startles them), aim with the pointer and
// click to swing the net. The server decides which bugs come out each round.

type Phase = "ready" | "play" | "done" | "journal";
type Spec = { kind: Bug["kind"]; colors: [string, string]; speed: number };
type Journal = { caught: Record<string, number>; total: number; todayAcorns: number; cap: number };
const REACH = 3.6, ROUND_SECONDS = 100;

export function Bugs({ pid, onClose, onRewards }: { pid: string; onClose: () => void; onRewards: (r: Rewards) => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [left, setLeft] = useState(0);
  const [got, setGot] = useState<{ bug: Bug; acorns: number; first: boolean }[]>([]);
  const [toast, setToast] = useState<{ bug: Bug; acorns: number; first: boolean } | null>(null);
  const [hint, setHint] = useState("");
  const [journal, setJournal] = useState<Journal | null>(null);
  const host = useRef<HTMLDivElement>(null), cross = useRef<HTMLDivElement>(null);
  const g = useRef({ phase: "ready" as Phase, specs: [] as Spec[], startAt: 0, keys: new Set<string>(), aim: { x: 0, y: 0 }, swing: 0, reset: false });
  const claims = useRef<Promise<unknown>>(Promise.resolve());
  const rewardsCb = useRef(onRewards); rewardsCb.current = onRewards; // a new callback must not rebuild the scene
  const api = (body: object) => fetch("/api/minigame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, game: "bugs", ...body }) }).then((r) => r.json());

  const begin = useCallback(async () => {
    const j = (await api({ action: "start", hour: gameHour() })) as { items: Spec[]; journal: Journal };
    setJournal(j.journal);
    Object.assign(g.current, { phase: "play", specs: j.items, startAt: performance.now(), reset: true });
    setGot([]); setToast(null); setLeft(j.items.length); setHint("Tiptoe with Shift so they don't fly off."); setPhase("play");
    sound.prompt();
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = useCallback((index: number) => {
    claims.current = claims.current.then(async () => {
      const j = (await api({ action: "claim", index })) as { item?: Bug; acorns?: number; first?: boolean; rewards?: Rewards; journal?: Journal };
      if (j.rewards) rewardsCb.current(j.rewards);
      if (j.journal) setJournal(j.journal);
      if (j.item) { const it = { bug: j.item, acorns: j.acorns ?? 0, first: Boolean(j.first) }; setGot((x) => [...x, it]); setToast(it); sound.coins(); }
      await new Promise((r) => setTimeout(r, 550));
    }).catch(() => {});
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const claimRef = useRef(claim); claimRef.current = claim;
  useEffect(() => {
    const el = host.current!;
    const hour = gameHour(), night = hour < 6 || hour >= 19;
    const stage = makeStage(el, night, 66);
    const { scene, camera } = stage;
    ground(scene, night);
    // The meadow: a ring of trees (beetles live on the trunks), flower patches, a small pond.
    const trunks: { x: number; z: number; h: number }[] = [];
    for (let i = 0; i < 9; i++) { const x = -9 + i * 2.3 + rnd(-0.4, 0.4), z = -12 - (i % 3) * 1.6; const t = tree(scene, x, z, rnd(1, 1.3), i); trunks.push({ x, z, h: t.height }); }
    for (let i = 0; i < 18; i++) { const a = rnd(0, Math.PI * 2), r = rnd(22, 40); tree(scene, Math.cos(a) * r, Math.sin(a) * r, rnd(1, 1.6), i + 3); }
    const spots = flowers(scene, 70, [-8, 8, -10, 2]);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(3.2, 14), new THREE.MeshLambertMaterial({ color: night ? 0x24507e : 0x4f9fd6, flatShading: true }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-9, 0.05, -5); scene.add(pond);
    if (night) { const glow = new THREE.PointLight(0xfff27a, 0.6, 12); glow.position.set(0, 2, -6); scene.add(glow); }

    // The net, held in front of you.
    const net = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1.1, 5), mat(0x8a4f22)); pole.position.y = 0.55; net.add(pole);
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 4, 14), mat(0x58524c)); hoop.position.y = 1.18; net.add(hoop);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); mesh.position.set(0, 1.18, 0.14); mesh.rotation.x = Math.PI / 2; net.add(mesh);
    net.scale.setScalar(0.7);
    net.position.set(0.42, -0.62, -0.75); net.rotation.set(-0.55, 0, 0.25);
    camera.add(net);

    type Live = { spec: Spec; group: THREE.Group; wings: THREE.Mesh[]; state: "idle" | "nervous" | "fleeing" | "caught" | "gone"; home: THREE.Vector3; target: THREE.Vector3; t: number; nervousAt: number; v: THREE.Vector3; trunk?: { x: number; z: number; h: number } };
    let bugs: Live[] = [];
    const player = new THREE.Vector3(0, 1.5, 4);
    let raf = 0, last = performance.now();

    const makeBug = (spec: Spec, i: number): Live => {
      const group = new THREE.Group();
      const [wingC, bodyC] = spec.colors;
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat(bodyC)); body.scale.set(1, 1, spec.kind === "dragonfly" ? 3 : 1.8); group.add(body);
      const wings: THREE.Mesh[] = [];
      if (spec.kind === "beetle") { const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(wingC)); shell.scale.z = 1.3; group.add(shell); }
      else {
        const size = spec.kind === "butterfly" ? 0.26 : spec.kind === "dragonfly" ? 0.3 : 0.12;
        for (const s of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(size, spec.kind === "dragonfly" ? size * 0.3 : size * 0.8), new THREE.MeshLambertMaterial({ color: wingC, side: THREE.DoubleSide, transparent: spec.kind !== "butterfly", opacity: spec.kind === "butterfly" ? 1 : 0.7, emissive: spec.kind === "firefly" ? new THREE.Color(wingC) : new THREE.Color(0), emissiveIntensity: spec.kind === "firefly" ? 1.4 : 0 }));
          w.geometry.translate(s * size / 2, 0, 0); w.rotation.x = -Math.PI / 2; wings.push(w); group.add(w);
        }
      }
      if (spec.kind === "firefly") { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff27a })); tail.position.z = 0.12; group.add(tail); }
      group.scale.setScalar(spec.kind === "beetle" ? 1.6 : 1.5);
      let home: THREE.Vector3, trunk: Live["trunk"];
      if (spec.kind === "beetle") { trunk = trunks[(i * 3 + 1) % trunks.length]; home = new THREE.Vector3(trunk.x, rnd(0.5, Math.min(1.4, trunk.h - 0.2)), trunk.z + 0.24); }
      else if (spec.kind === "dragonfly") home = new THREE.Vector3(-9 + rnd(-1.5, 1.5), rnd(0.6, 1.4), -5 + rnd(-1.5, 1.5));
      else home = spots[Math.floor(rnd(0, spots.length))].clone().add(new THREE.Vector3(0, rnd(0.4, 1.4), 0));
      group.position.copy(home);
      scene.add(group);
      return { spec, group, wings, state: "idle", home, target: home.clone(), t: rnd(0, 6), nervousAt: 0, v: new THREE.Vector3(), trunk };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = g.current, t = now / 1000;
      driftClouds(stage.clouds, dt);
      if (s.reset) { s.reset = false; for (const b of bugs) scene.remove(b.group); bugs = s.specs.map(makeBug); player.set(0, 1.5, 4); }

      // Walking: WASD, Shift to tiptoe.
      const tiptoe = s.keys.has("shift");
      const dir = new THREE.Vector3((s.keys.has("d") ? 1 : 0) - (s.keys.has("a") ? 1 : 0), 0, (s.keys.has("s") ? 1 : 0) - (s.keys.has("w") ? 1 : 0));
      const moving = dir.lengthSq() > 0 && s.phase === "play";
      if (moving) { dir.normalize(); player.addScaledVector(dir, (tiptoe ? 1.2 : 3.4) * dt); player.x = Math.max(-11, Math.min(11, player.x)); player.z = Math.max(-9, Math.min(6, player.z)); }
      camera.position.set(player.x, player.y + (moving ? Math.sin(t * (tiptoe ? 6 : 11)) * (tiptoe ? 0.015 : 0.04) : 0), player.z);
      camera.lookAt(player.x, 0.9, player.z - 8);

      // The net swings when you click.
      const sw = s.swing ? Math.min(1, (now - s.swing) / 260) : 0;
      net.rotation.set(-0.55 - Math.sin(sw * Math.PI) * 0.9, 0, 0.25 + Math.sin(sw * Math.PI) * 0.6);

      for (const [i, b] of bugs.entries()) {
        b.t += dt;
        const k = b.spec.kind, sp = b.spec.speed;
        if (b.state === "idle" || b.state === "nervous") {
          if (k === "beetle") { b.group.position.y = b.home.y + Math.sin(b.t * 0.4 * sp) * 0.15; b.group.rotation.set(-Math.PI / 2, 0, Math.sin(b.t) * 0.2); }
          else if (k === "dragonfly" || k === "bee") {
            if (b.group.position.distanceTo(b.target) < 0.15 || b.t > 2.4 / sp) { b.t = 0; b.target = k === "bee" ? spots[Math.floor(rnd(0, spots.length))].clone().add(new THREE.Vector3(0, 0.3, 0)) : new THREE.Vector3(-9 + rnd(-2, 2), rnd(0.6, 1.5), -5 + rnd(-2, 2)); }
            b.group.position.lerp(b.target, Math.min(1, dt * 1.6 * sp));
            b.group.lookAt(b.target);
          } else {
            // butterflies and fireflies flutter in loops around their flower
            b.group.position.set(b.home.x + Math.sin(b.t * 0.8 * sp) * 0.9, b.home.y + Math.sin(b.t * 2.3) * 0.25, b.home.z + Math.cos(b.t * 0.6 * sp) * 0.7);
            b.group.rotation.y = b.t * 0.8 * sp;
          }
          for (const [wi, w] of b.wings.entries()) w.rotation.y = (wi ? 1 : -1) * Math.sin(b.t * (k === "butterfly" ? 9 : 40)) * 0.9;
          if (k === "firefly") b.wings.forEach((w) => ((w.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + Math.max(0, Math.sin(b.t * 2.5)) * 1.6));
          // Startle: walking (not tiptoeing) close makes a bug nervous; stay loud and it flees.
          const d = camera.position.distanceTo(b.group.position);
          const scareAt = k === "beetle" ? 3.6 : k === "dragonfly" ? 4.4 : 3.2;
          if (moving && !tiptoe && d < scareAt) { if (b.state === "idle") { b.state = "nervous"; b.nervousAt = now; setHint("Careful! Hold Shift to tiptoe."); } else if (now - b.nervousAt > 450) { b.state = "fleeing"; b.v.set(rnd(-1, 1), 2.5, -3); sound.hmm(); } }
          else if (b.state === "nervous" && now - b.nervousAt > 1500) b.state = "idle";
          if (b.state === "nervous") b.group.position.x += Math.sin(now / 30) * 0.01;
        } else if (b.state === "fleeing") {
          b.group.position.addScaledVector(b.v, dt * (k === "beetle" ? 0.6 : 1.4));
          for (const [wi, w] of b.wings.entries()) w.rotation.y = (wi ? 1 : -1) * Math.sin(now / 20) * 1.1;
          if (b.group.position.y > 9 || b.group.position.z < -30) { b.state = "gone"; scene.remove(b.group); setLeft((x) => x - 1); void i; }
        }
      }

      // Swing check, once per swing at its midpoint.
      if (s.swing && sw >= 0.5 && (s as { checked?: number }).checked !== s.swing) {
        (s as { checked?: number }).checked = s.swing;
        let caught = false;
        for (const [i, b] of bugs.entries()) {
          if (b.state !== "idle" && b.state !== "nervous") continue;
          const d = camera.position.distanceTo(b.group.position);
          const scr = toScreen(b.group.position, camera, el);
          if (d < REACH && !scr.behind && Math.hypot(scr.x - s.aim.x, scr.y - s.aim.y) < 110) {
            b.state = "caught"; scene.remove(b.group); caught = true; claimRef.current(i); setLeft((x) => x - 1); sound.harvest();
            break;
          }
        }
        if (!caught) for (const b of bugs) if ((b.state === "idle" || b.state === "nervous") && camera.position.distanceTo(b.group.position) < REACH + 0.5 && Math.random() < 0.5) { b.state = "fleeing"; b.v.set(rnd(-1, 1), 2.5, -3); }
      }
      if (s.swing && sw >= 1) s.swing = 0; // the swing ends only after its catch check has run
      if (!s.swing) (s as { checked?: number }).checked = 0;

      // Hot crosshair when a bug is in reach under it.
      if (cross.current && s.phase === "play") {
        const hot = bugs.some((b) => (b.state === "idle" || b.state === "nervous") && camera.position.distanceTo(b.group.position) < REACH && (() => { const p = toScreen(b.group.position, camera, el); return Math.hypot(p.x - s.aim.x, p.y - s.aim.y) < 110; })());
        cross.current.classList.toggle(styles.hot, hot);
      }
      if (s.phase === "play" && (bugs.length && bugs.every((b) => b.state === "caught" || b.state === "gone") || now - s.startAt > ROUND_SECONDS * 1000)) { s.phase = "done"; setPhase("done"); }
      stage.renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Dev-only test hook: where the bugs are (for scripted play-tests).
    if (process.env.NODE_ENV !== "production") (window as unknown as { __mg?: unknown }).__mg = { targets: () => bugs.filter((b) => b.state === "idle" || b.state === "nervous").map((b) => ({ ...toScreen(b.group.position, camera, el), d: camera.position.distanceTo(b.group.position), x3: b.group.position.x, z3: b.group.position.z, kind: b.spec.kind })), player: () => ({ x: player.x, z: player.z }) };
    return () => { cancelAnimationFrame(raf); stage.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (on: boolean) => (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === "escape" && on) { onClose(); return; }
      if (["w", "a", "s", "d", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        e.preventDefault(); e.stopPropagation();
        const m: Record<string, string> = { arrowup: "w", arrowdown: "s", arrowleft: "a", arrowright: "d" };
        if (on) g.current.keys.add(m[key] ?? key); else g.current.keys.delete(m[key] ?? key);
      }
    };
    const d = k(true), u = k(false);
    window.addEventListener("keydown", d, true); window.addEventListener("keyup", u, true);
    return () => { window.removeEventListener("keydown", d, true); window.removeEventListener("keyup", u, true); };
  }, [onClose]);
  useEffect(() => { const t = toast && setTimeout(() => setToast(null), 3200); return () => { if (t) clearTimeout(t); }; }, [toast]);
  useEffect(() => { const t = hint && setTimeout(() => setHint(""), 2600); return () => { if (t) clearTimeout(t); }; }, [hint]);
  useEffect(() => { void api({ action: "journal" }).then((j) => setJournal(j.journal)).catch(() => {}); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    g.current.aim = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (cross.current) { cross.current.style.left = `${g.current.aim.x}px`; cross.current.style.top = `${g.current.aim.y}px`; }
  };
  const swing = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, [data-panel]")) return;
    move(e);
    if (g.current.phase === "play" && !g.current.swing) { g.current.swing = performance.now(); sound.step2(); }
  };

  const seen = journal?.caught ?? {};
  const total = got.reduce((n, x) => n + x.acorns, 0);
  return (
    <div className={fish.full} onPointerMove={move} onPointerDown={swing} style={{ cursor: "none" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <div ref={cross} className={styles.cross} style={{ left: "50%", top: "55%" }} />
      <div className={`ev-panel ${fish.top}`} data-panel><b>Bug catching</b><span>Journal {Object.keys(seen).length}/{BUGS.length}{journal ? ` · 🌰 today ${journal.todayAcorns}/${journal.cap}` : ""}</span></div>
      {phase === "play" && <div className={styles.hud} data-panel><span className={styles.pill}>Bugs left: {left}</span>{hint && <span className={styles.pill}>{hint}</span>}</div>}
      {toast && <div className={styles.toast} data-panel><span style={{ width: 22, height: 22, background: toast.bug.colors[0], boxShadow: "0 0 0 3px #3b2412", flex: "none" }} /><div><b>{toast.bug.name}{toast.first ? " · New!" : ""}</b><span>{toast.bug.blurb}</span></div>{toast.acorns > 0 && <em>+{toast.acorns} 🌰</em>}</div>}
      {phase === "journal" ? (
        <div className={`ev-panel ${fish.journal}`} data-panel>
          <div className="ev-speaker">Bug journal</div>
          <p className="ev-sub">{Object.keys(seen).length} of {BUGS.length} found. Some only come out at night, some only by day.</p>
          <div className={fish.grid}>
            {BUGS.map((b) => (
              <div key={b.id} className={fish.entry}>
                <span style={{ width: 40, height: 28, background: seen[b.id] ? b.colors[0] : "#5a4a3a", boxShadow: "0 0 0 3px #3b2412", borderRadius: b.kind === "beetle" ? "50% 50% 40% 40%" : 4 }} />
                <b>{seen[b.id] ? b.name : "???"}</b>
                <span>{seen[b.id] ? `×${seen[b.id]} · ${b.acorns} 🌰` : b.when ? `Comes out at ${b.when}` : "Not caught yet"}</span>
              </div>
            ))}
          </div>
          <div className="ev-actions"><button className="ev-btn" onClick={() => setPhase("ready")}>Back</button></div>
        </div>
      ) : (
        <div className={`ev-panel ${fish.bottom}`} data-panel>
          {phase === "ready" && <p className={fish.msg}>Bugs are out in the meadow. Walk with WASD, hold Shift to tiptoe up close, aim with your pointer, and click to swing the net.</p>}
          {phase === "play" && <p className={styles.keys}>WASD to walk · hold Shift to tiptoe · click to swing the net</p>}
          {phase === "done" && (
            <>
              <p className={fish.msg}>{got.length ? `You caught ${got.length} bug${got.length === 1 ? "" : "s"}: +${total} 🌰` : "They all got away. Tiptoe closer next time!"}</p>
              {got.length > 0 && <ul className={styles.list}>{got.map((x, i) => <li key={i}><span><b>{x.bug.name}</b>{x.first ? " · New!" : ""} · {x.bug.blurb}</span>{x.acorns > 0 && <em>+{x.acorns} 🌰</em>}</li>)}</ul>}
            </>
          )}
          <div className={fish.buttons}>
            {phase !== "play" && <button className="ev-btn" onClick={() => void begin()}>{phase === "ready" ? "Start" : "Catch more"}</button>}
            {phase !== "play" && <button className="ev-btn ghost" onClick={() => setPhase("journal")}>Journal</button>}
            <button className="ev-btn ghost" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
