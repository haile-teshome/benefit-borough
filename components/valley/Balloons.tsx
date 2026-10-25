"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Prize } from "@/lib/minigames";
import type { Rewards } from "@/lib/rewards";
import { gameHour } from "@/lib/valley/clock";
import { sound } from "@/lib/valley/audio";
import { driftClouds, flowers, ground, makeStage, mat, rnd, toScreen, tree } from "@/lib/valley/three-kit";
import fish from "./Fishing.module.css";
import styles from "./Minigame.module.css";
import { Acorn } from "./PixelIcon";

// Slingshot balloons, from the north bluff. Gift balloons drift across the sky on the wind; hold
// to pull the slingshot back, aim with the pointer, let go to fire. A popped balloon drops its
// present by parachute. The server decides what's inside each one.

type Phase = "ready" | "play" | "done";
type Got = { name: string; blurb: string; acorns: number };
const PELLETS = 12;
const COLORS = [0xe2574c, 0x3e8ed0, 0xf2c94c, 0x8e5bd0, 0x3fa66b, 0xf49ac8];

export function Balloons({ pid, onClose, onRewards }: { pid: string; onClose: () => void; onRewards: (r: Rewards) => void }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [pellets, setPellets] = useState(PELLETS);
  const [got, setGot] = useState<Got[]>([]);
  const [toast, setToast] = useState<Got | null>(null);
  const [today, setToday] = useState<{ todayAcorns: number; cap: number } | null>(null);
  const host = useRef<HTMLDivElement>(null), cross = useRef<HTMLDivElement>(null), meter = useRef<HTMLDivElement>(null);
  const g = useRef({ phase: "ready" as Phase, count: 0, startAt: 0, pellets: PELLETS, charging: 0, aim: { x: 0, y: 0 }, fire: null as null | { x: number; y: number; power: number }, popped: [] as number[], gone: 0 });
  const claims = useRef<Promise<unknown>>(Promise.resolve());
  const rewardsCb = useRef(onRewards); rewardsCb.current = onRewards; // a new callback must not rebuild the scene

  const begin = useCallback(async () => {
    const res = await fetch("/api/minigame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, game: "balloons", action: "start", hour: gameHour() }) });
    const j = (await res.json()) as { items: unknown[]; journal: { todayAcorns: number; cap: number } };
    setToday(j.journal);
    Object.assign(g.current, { phase: "play", count: j.items.length, startAt: performance.now(), pellets: PELLETS, popped: [], gone: 0 });
    setPellets(PELLETS); setGot([]); setToast(null); setPhase("play");
    sound.prompt();
  }, [pid]);

  // Settle each pop with the server, one at a time.
  const claim = useCallback((index: number) => {
    claims.current = claims.current.then(async () => {
      const res = await fetch("/api/minigame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, game: "balloons", action: "claim", index }) });
      const j = (await res.json()) as { item?: Prize; acorns?: number; rewards?: Rewards; journal?: { todayAcorns: number; cap: number } };
      if (j.rewards) rewardsCb.current(j.rewards);
      if (j.journal) setToday(j.journal);
      if (j.item) { const it = { name: j.item.name, blurb: j.item.blurb, acorns: j.acorns ?? 0 }; setGot((x) => [...x, it]); setToast(it); sound.coins(); }
      await new Promise((r) => setTimeout(r, 550));
    }).catch(() => {});
  }, [pid]);

  const claimRef = useRef(claim); claimRef.current = claim;
  useEffect(() => {
    const el = host.current!;
    const night = gameHour() < 6 || gameHour() >= 19;
    const stage = makeStage(el, night, 64);
    const { scene, camera } = stage;
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 5, -20);
    ground(scene, night);
    for (let i = 0; i < 26; i++) { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), r = rnd(18, 45); tree(scene, Math.cos(a) * r, Math.sin(a) * r, rnd(0.9, 1.5), i); }
    flowers(scene, 40, [-10, 10, -14, -2]);
    // A bench and the bluff's edge in the foreground: you're at the lookout.
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.45), mat(0xb07a48)); bench.position.set(-2.4, 0.45, -2.2); scene.add(bench);

    // The slingshot, held in front of you.
    const sling = new THREE.Group();
    const wood = mat(0x8a4f22);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 5), wood); handle.position.y = -0.16; sling.add(handle);
    for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 5), wood); arm.position.set(s * 0.07, 0.08, 0); arm.rotation.z = -s * 0.45; sling.add(arm); }
    const bandGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.12, 0.17, 0), new THREE.Vector3(0, 0.12, 0.05), new THREE.Vector3(0.12, 0.17, 0)]);
    const band = new THREE.Line(bandGeo, new THREE.LineBasicMaterial({ color: 0x3b2412 }));
    sling.add(band);
    const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), mat(0x6e4428)); sling.add(pouch);
    sling.position.set(0.05, -0.42, -0.85);
    camera.add(sling);

    type B = { group: THREE.Group; ball: THREE.Mesh; vx: number; base: number; phase: number; state: "wait" | "fly" | "popped" | "gone"; at: number; present?: THREE.Group; vy?: number };
    const balloons: B[] = [];
    const pellet: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
    const bits: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let built = 0, raf = 0, last = performance.now();

    const makeBalloon = (i: number): B => {
      const group = new THREE.Group();
      const color = COLORS[i % COLORS.length];
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshLambertMaterial({ color, flatShading: true })); ball.scale.y = 1.15; group.add(ball);
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.18, 5), mat(color)); knot.position.y = -0.85; knot.rotation.x = Math.PI; group.add(knot);
      const str = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.92, 0), new THREE.Vector3(0.05, -1.8, 0)]), new THREE.LineBasicMaterial({ color: 0xfffaf0 })); group.add(str);
      const box = new THREE.Group();
      box.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), mat(0xfffaf0)));
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.1), mat(color)); box.add(ribbon);
      const ribbon2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.44), mat(color)); box.add(ribbon2);
      box.position.y = -2; group.add(box);
      const fromLeft = i % 2 === 0;
      const z = rnd(-26, -14);
      group.position.set(fromLeft ? -26 : 26, rnd(4, 9), z);
      scene.add(group);
      return { group, ball, vx: (fromLeft ? 1 : -1) * rnd(2.2, 3.6), base: group.position.y, phase: rnd(0, 6), state: "wait", at: 0, present: box };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = g.current, t = now / 1000;
      driftClouds(stage.clouds, dt);
      if (s.phase === "play" && built < s.count && now - s.startAt > built * 2300 + 600) { const b = makeBalloon(built); b.state = "fly"; balloons.push(b); built++; }
      if (s.phase !== "play") { built = 0; for (const b of balloons) { scene.remove(b.group); } balloons.length = 0; }
      for (const [i, b] of balloons.entries()) {
        if (b.state === "fly") {
          const wind = Math.sin(t * 0.7 + b.phase) * 0.8;
          b.group.position.x += (b.vx + wind) * dt;
          b.group.position.y = b.base + Math.sin(t * 1.3 + b.phase) * 0.5;
          b.group.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.12;
          if (Math.abs(b.group.position.x) > 28) { b.state = "gone"; scene.remove(b.group); s.gone++; }
        } else if (b.state === "popped" && b.present) {
          // the present floats down under a little parachute
          b.vy = Math.max(-1.4, (b.vy ?? 0) - 3 * dt);
          b.present.position.y += b.vy * dt;
          b.present.rotation.y += dt;
          if (b.group.position.y + b.present.position.y < 0.3) { b.state = "gone"; scene.remove(b.group); }
        }
        void i;
      }
      // Charging and firing.
      if (s.charging) { const p = Math.min(1, (now - s.charging) / 900); pouch.position.set(0, 0.1, 0.05 + p * 0.25); (bandGeo.attributes.position as THREE.BufferAttribute).setXYZ(1, 0, 0.1, 0.05 + p * 0.25); bandGeo.attributes.position.needsUpdate = true; if (meter.current) meter.current.style.width = `${p * 100}%`; }
      if (s.fire) {
        const { x, y, power } = s.fire; s.fire = null;
        ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), mat(0x58524c));
        m.position.copy(camera.position).addScaledVector(ray.ray.direction, 0.8);
        pellet.push({ m, v: ray.ray.direction.clone().multiplyScalar(26 + power * 30) });
        scene.add(m);
        pouch.position.set(0, 0.12, 0.05); (bandGeo.attributes.position as THREE.BufferAttribute).setXYZ(1, 0, 0.12, 0.05); bandGeo.attributes.position.needsUpdate = true;
        sound.harvest();
      }
      for (let i = pellet.length - 1; i >= 0; i--) {
        const p = pellet[i];
        const from = p.m.position.clone();
        p.v.y -= 9.8 * dt;
        p.m.position.addScaledVector(p.v, dt);
        const seg = new THREE.Line3(from, p.m.position), closest = new THREE.Vector3();
        let hit = false;
        for (const [bi, b] of balloons.entries()) {
          if (b.state !== "fly") continue;
          seg.closestPointToPoint(b.group.position, true, closest);
          if (closest.distanceTo(b.group.position) < 1.05) {
            hit = true; b.state = "popped"; b.ball.visible = false; b.vy = 0;
            for (let k = 0; k < 14; k++) { const bit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), (b.ball.material as THREE.MeshLambertMaterial).clone()); bit.position.copy(b.group.position); scene.add(bit); bits.push({ m: bit, v: new THREE.Vector3(rnd(-4, 4), rnd(-1, 5), rnd(-4, 4)), life: 1 }); }
            // a parachute over the present
            const chute = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfffaf0)); chute.position.y = 0.75; b.present?.add(chute);
            s.popped.push(bi); claimRef.current(bi); sound.blip();
            break;
          }
        }
        if (hit || p.m.position.y < -2 || p.m.position.length() > 90) { scene.remove(p.m); pellet.splice(i, 1); }
      }
      for (let i = bits.length - 1; i >= 0; i--) { const b = bits[i]; b.v.y -= 9 * dt; b.m.position.addScaledVector(b.v, dt); b.m.rotation.x += dt * 8; b.life -= dt; if (b.life <= 0) { scene.remove(b.m); bits.splice(i, 1); } }
      // The round ends when every balloon has flown or popped, or the pellets run out.
      if (s.phase === "play" && built === s.count && s.count > 0 && balloons.every((b) => b.state !== "fly")) { s.phase = "done"; setPhase("done"); }
      if (s.phase === "play" && s.pellets <= 0 && !pellet.length && !s.charging) { setTimeout(() => { if (g.current.phase === "play") { g.current.phase = "done"; setPhase("done"); } }, 2500); s.pellets = -1; }
      stage.renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // Dev-only test hook: where the flying balloons are on screen (for scripted play-tests).
    if (process.env.NODE_ENV !== "production") (window as unknown as { __mg?: unknown }).__mg = { targets: () => balloons.filter((b) => b.state === "fly").map((b) => ({ ...toScreen(b.group.position, camera, el), z: b.group.position.z, vx: b.vx })) };
    return () => { cancelAnimationFrame(raf); stage.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (e: React.PointerEvent) => {
    const r = host.current!.getBoundingClientRect();
    g.current.aim = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (cross.current) { cross.current.style.left = `${g.current.aim.x}px`; cross.current.style.top = `${g.current.aim.y}px`; }
  };
  const down = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, [data-panel]")) return;
    move(e);
    if (g.current.phase === "play" && g.current.pellets > 0) g.current.charging = performance.now();
  };
  const up = () => {
    const s = g.current;
    if (!s.charging) return;
    const power = Math.min(1, (performance.now() - s.charging) / 900);
    s.charging = 0;
    if (meter.current) meter.current.style.width = "0%";
    s.fire = { ...s.aim, power };
    s.pellets -= 1; setPellets(Math.max(0, s.pellets));
  };

  useEffect(() => { const t = toast && setTimeout(() => setToast(null), 3200); return () => { if (t) clearTimeout(t); }; }, [toast]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  useEffect(() => { void fetch("/api/minigame", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pid, game: "balloons", action: "journal" }) }).then((r) => r.json()).then((j) => setToday(j.journal)).catch(() => {}); }, [pid]);

  const total = got.reduce((n, x) => n + x.acorns, 0);
  return (
    <div className={fish.full} onPointerMove={move} onPointerDown={down} onPointerUp={up} onPointerLeave={up} style={{ cursor: "none" }}>
      <div ref={host} style={{ position: "absolute", inset: 0 }} />
      <div ref={cross} className={styles.cross} style={{ left: "50%", top: "40%" }} />
      <div className={`ev-panel ${fish.top}`} data-panel><b>Slingshot balloons</b><span>{today ? <><Acorn /> today {today.todayAcorns}/{today.cap}</> : ""}</span></div>
      {phase === "play" && (
        <div className={styles.hud} data-panel>
          <span className={styles.pill}>Pellets: {pellets}</span>
          <span className={styles.pill}>Popped: {got.length}</span>
        </div>
      )}
      {phase === "play" && <div className={styles.power}><div ref={meter} style={{ width: "0%" }} /></div>}
      {toast && <div className={styles.toast} data-panel><div><b>{toast.name}</b><span>{toast.blurb}</span></div>{toast.acorns > 0 && <em>+{toast.acorns} <Acorn /></em>}</div>}
      <div className={`ev-panel ${fish.bottom}`} data-panel>
        {phase === "ready" && <p className={fish.msg}>Gift balloons are drifting over the bluff. Hold to pull back the slingshot, aim with your pointer, and let go to fire. Lead your shot: the wind pushes them.</p>}
        {phase === "play" && <p className={styles.keys}>Hold to pull back · release to fire · a longer pull flies farther</p>}
        {phase === "done" && (
          <>
            <p className={fish.msg}>{got.length ? `You popped ${got.length} balloon${got.length === 1 ? "" : "s"}: +${total} acorns` : "They all floated away. Try leading your shots!"}</p>
            {got.length > 0 && <ul className={styles.list}>{got.map((x, i) => <li key={i}><span><b>{x.name}</b> · {x.blurb}</span>{x.acorns > 0 && <em>+{x.acorns} <Acorn /></em>}</li>)}</ul>}
          </>
        )}
        <div className={fish.buttons}>
          {phase !== "play" && <button className="ev-btn" onClick={() => void begin()}>{phase === "ready" ? "Start" : "Play again"}</button>}
          <button className="ev-btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
