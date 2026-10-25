"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { gameHour } from "@/lib/valley/clock";

// First-person 3D view from the end of the pond dock: low-poly water, the far shore with trees,
// the bluff and its waterfall, and your rod. Rendered at a low resolution and scaled up with
// crisp pixels so it matches the burrow's pixel art. The minigame drives it through `live`.

export type FishView = {
  phase: "aim" | "wait" | "bite" | "reel" | "result" | "journal";
  t0: number; power: number; castAt: number; nibbles: number[]; biteAt: number;
  fishY: number; progress: number; inside: boolean; difficulty: number;
  landed: { caught: boolean; at: number; colors?: [string, string, string]; boot?: boolean } | null;
};

const SCALE = 3; // one rendered pixel = 3 screen pixels

export function FishingScene({ live }: { live: React.MutableRefObject<FishView> }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    renderer.setPixelRatio(1);
    const canvas = renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;image-rendering:pixelated;";
    el.appendChild(canvas);

    const night = gameHour() < 6 || gameHour() >= 19;
    const scene = new THREE.Scene();
    const horizon = night ? 0x2a3a66 : 0xcfeaf7;
    scene.fog = new THREE.Fog(horizon, 45, 120);
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.05, 200);
    camera.position.set(0, 1.7, 0.4);
    camera.lookAt(0, 0.3, -10);
    scene.add(camera);

    scene.add(new THREE.HemisphereLight(night ? 0x7080c0 : 0xfff6e0, night ? 0x1a2030 : 0x4f7a35, night ? 0.85 : 1.0));
    const sun = new THREE.DirectionalLight(night ? 0xb8c8ff : 0xffe8c0, night ? 0.55 : 1.6);
    sun.position.set(-8, 14, 10); // in front and to the left, so the cliff faces catch the light
    scene.add(sun);

    const mat = (c: number | string, flat = true) => new THREE.MeshLambertMaterial({ color: c, flatShading: flat });
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    // Sky: a gradient dome, and a few chunky clouds drifting by.
    const skyGeo = new THREE.SphereGeometry(150, 16, 10);
    const skyCol: number[] = [];
    const zenith = new THREE.Color(night ? 0x0e1530 : 0x5fb0e8), hor = new THREE.Color(horizon);
    const sp = skyGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) { const c = hor.clone().lerp(zenith, Math.max(0, Math.min(1, sp.getY(i) / 70))); skyCol.push(c.r, c.g, c.b); }
    skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(skyCol, 3));
    scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) { const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(2, 3.4), 0), new THREE.MeshLambertMaterial({ color: night ? 0x5a6488 : 0xffffff, flatShading: true, fog: false })); puff.position.set(j * 2.6 - 4, rnd(-0.6, 0.8), rnd(-1, 1)); c.add(puff); }
      c.position.set(rnd(-70, 70), rnd(26, 40), rnd(-110, -70));
      clouds.push(c); scene.add(c);
    }
    if (night) {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(3, 14), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false })); moon.position.set(28, 34, -100); scene.add(moon);
      for (let i = 0; i < 80; i++) { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); st.position.set(rnd(-120, 120), rnd(30, 90), -120); scene.add(st); }
    }

    // The pond: an oval of water set into a grassy bank (the ground has an oval hole cut in it).
    const PX = 0, PZ = -13, RX = 11, RZ = 16;
    const groundShape = new THREE.Shape();
    groundShape.moveTo(-120, -120); groundShape.lineTo(120, -120); groundShape.lineTo(120, 120); groundShape.lineTo(-120, 120); groundShape.lineTo(-120, -120);
    const hole = new THREE.Path(); hole.absellipse(PX, -PZ, RX, RZ, 0, Math.PI * 2, true, 0); groundShape.holes.push(hole);
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape, 48), mat(night ? 0x2f5a2a : 0x6cae45));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0.32;
    scene.add(ground);
    const bankGeo = new THREE.CylinderGeometry(1, 1, 0.5, 48, 1, true); bankGeo.scale(RX, 1, RZ);
    const bank = new THREE.Mesh(bankGeo, new THREE.MeshLambertMaterial({ color: 0x8c6a44, side: THREE.DoubleSide, flatShading: true }));
    bank.position.set(PX, 0.08, PZ); scene.add(bank);
    const shoreAt = (a: number, k = 1) => new THREE.Vector3(PX + Math.cos(a) * RX * k, 0, PZ + Math.sin(a) * RZ * k);

    const waterGeo = new THREE.PlaneGeometry(2 * RX + 2, 2 * RZ + 2, 44, 60);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({ color: night ? 0x24507e : 0x3f8cc6, specular: night ? 0x445577 : 0xbfe6ff, shininess: 70, flatShading: true }));
    water.position.set(PX, 0.02, PZ);
    scene.add(water);
    const base = Float32Array.from(waterGeo.attributes.position.array as Float32Array);

    // Rolling hills behind the far shore.
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat(i % 2 ? (night ? 0x2a5226 : 0x5e9e3f) : (night ? 0x335e2c : 0x7bbc4e)));
      h.scale.set(rnd(10, 18), rnd(3, 6), rnd(6, 10)); h.position.set(-56 + i * 14, 0, rnd(-58, -48)); scene.add(h);
    }

    // Trees and bushes around the shore (not right in front of you).
    const trunkMat = mat(0x6e4428), leaf = [0x3f8a3a, 0x5e9e3f, 0xd8743e, 0xe0a526, 0x2f6e46, 0xc9483a];
    const tree = (p: THREE.Vector3, s: number, i: number) => {
      const h = rnd(1.6, 2.6) * s;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, h, 5), trunkMat); t.position.set(p.x, 0.3 + h / 2, p.z); scene.add(t);
      if (Math.random() < 0.3) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 2.8 * s, 6), mat(0x2f6e46)); c.position.set(p.x, 0.3 + h + 1.1 * s, p.z); scene.add(c); }
      else for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.9, 1.3) * s, 0), mat(leaf[(i + (j ? 0 : 1)) % leaf.length])); c.position.set(p.x + rnd(-0.6, 0.6) * s, 0.3 + h + rnd(0.2, 1) * s, p.z + rnd(-0.6, 0.6) * s); scene.add(c); }
    };
    for (let i = 0; i < 70; i++) {
      const a = rnd(Math.PI * 0.98, Math.PI * 2.02);
      const p = shoreAt(a, rnd(1.12, 1.9));
      if (p.z > -3) continue;
      tree(p, rnd(0.9, 1.4), i);
    }
    for (let i = 0; i < 26; i++) {
      const p = shoreAt(rnd(Math.PI * 0.9, Math.PI * 2.1), rnd(1.04, 1.15));
      if (p.z > -1.5) continue;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.4, 0.7), 0), mat(i % 3 ? 0x4e8f3a : 0x3f7a30)); b.position.set(p.x, 0.5, p.z); b.scale.y = 0.75; scene.add(b);
      if (i % 2) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), mat([0xf48fb1, 0xffd45a, 0xffffff, 0xc8a8f0][i % 4])); f.position.set(p.x + 0.2, 0.85, p.z); scene.add(f); }
    }
    for (let i = 0; i < 12; i++) { const p = shoreAt(rnd(0, Math.PI * 2), rnd(0.97, 1.03)); if (p.z > -2) continue; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.3, 0.7), 0), mat(i % 2 ? 0x9a9288 : 0xb3aca1)); r.position.set(p.x, 0.2, p.z); scene.add(r); }

    // Reeds and cattails along the water's edge, and lily pads with flowers.
    for (let i = 0; i < 18; i++) {
      const p = shoreAt(rnd(0, Math.PI * 2), rnd(0.88, 0.96)); if (p.z > -1.2) continue;
      for (let j = 0; j < 5; j++) {
        const h = rnd(0.7, 1.3), x = p.x + rnd(-0.35, 0.35), z = p.z + rnd(-0.35, 0.35);
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, h, 4), mat(0x5e7a2e)); reed.position.set(x, h / 2, z); reed.rotation.z = rnd(-0.12, 0.12); scene.add(reed);
        if (j % 2 === 0) { const cat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 5), mat(0x6e4428)); cat.position.set(x, h, z); scene.add(cat); }
      }
    }
    for (let i = 0; i < 16; i++) {
      const p = shoreAt(rnd(0, Math.PI * 2), rnd(0.2, 0.85)); if (p.z > -2.5) continue;
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.3, 0.6), 7, 0.3, Math.PI * 1.8), mat(0x5fae4a));
      pad.rotation.x = -Math.PI / 2; pad.rotation.z = rnd(0, 6); pad.position.set(p.x, 0.07, p.z); scene.add(pad);
      if (i % 3 === 0) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), mat(i % 2 ? 0xf49ac8 : 0xffffff)); f.position.set(p.x, 0.17, p.z); scene.add(f); }
    }

    // The bluff behind the pond: rugged blocks of layered earth in two tiers, trees on top, and a
    // waterfall that drops into a short stream feeding the pond.
    const rock = [0xa88866, 0x9c7b5c, 0xb39272, 0x8a6b4e];
    const FALL_X = -3;
    for (const [tierZ, tierY, tierH] of [[-31, 0.3, 3.6], [-37, 3.9, 3.4]] as const) {
      for (let x = -40; x <= 40; x += rnd(2.2, 3.4)) {
        if (Math.abs(x - FALL_X) < 1.3) continue;
        const h = tierH + rnd(-0.5, 0.7), w = rnd(2.4, 3.6), d = rnd(3, 4.2);
        const blk = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(rock[Math.floor(Math.random() * rock.length)]));
        blk.position.set(x, tierY + h / 2, tierZ + rnd(-0.6, 0.6)); scene.add(blk);
        const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.35, d + 0.2), mat(night ? 0x2f5a2a : 0x7bbc4e));
        lip.position.set(x, tierY + h + 0.17, blk.position.z); scene.add(lip);
        if (Math.random() < 0.45) tree(new THREE.Vector3(x + rnd(-0.6, 0.6), tierY + h - 0.1, blk.position.z - 0.5), rnd(0.8, 1.2), Math.floor(x));
      }
    }
    const fallTex = (() => {
      const c = document.createElement("canvas"); c.width = 16; c.height = 64;
      const x = c.getContext("2d")!;
      for (let y = 0; y < 64; y++) for (let i = 0; i < 16; i++) { const r = Math.random(); x.fillStyle = r > 0.8 ? "#ffffff" : r > 0.5 ? "#9fd5f0" : r > 0.2 ? "#5fb0e0" : "#3f8cc6"; x.fillRect(i, y, 1, 1); }
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 2); return t;
    })();
    const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, fog: true });
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.8), fallMat); upper.position.set(FALL_X, 5.8, -34.9); scene.add(upper);
    const lower = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.1), fallMat); lower.position.set(FALL_X, 2.3, -28.9); scene.add(lower);
    const streamTex = fallTex.clone(); streamTex.needsUpdate = true; streamTex.repeat.set(1, 3);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6), new THREE.MeshBasicMaterial({ map: streamTex }));
    stream.rotation.x = -Math.PI / 2; stream.position.set(FALL_X, 0.34, -32); scene.add(stream);
    const foam: THREE.Mesh[] = [];
    for (let i = 0; i < 18; i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffffff })); foam.push(p); scene.add(p); }
    const fireflies: THREE.Mesh[] = [];
    if (night) for (let i = 0; i < 24; i++) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: 0xfff27a, fog: false })); f.position.copy(shoreAt(rnd(Math.PI, Math.PI * 2), rnd(0.8, 1.1))).setY(rnd(0.6, 2)); fireflies.push(f); scene.add(f); }

    // The dock under you.
    for (let i = 0; i < 6; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.42), mat(i % 2 ? 0xb07a48 : 0xc08a55));
      plank.position.set(0, 0.32, 0.6 - i * 0.46); scene.add(plank);
    }
    for (const x of [-1.15, 1.15]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), mat(0x6e4428)); post.position.set(x, 0.05, -2.1); scene.add(post); }

    // Your rod, held in the lower right of the view.
    const rod = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 1.7, 5), mat(0x8a4f22));
    pole.position.y = 0.85; rod.add(pole);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), mat(0x58524c));
    reel.rotation.z = Math.PI / 2; reel.position.set(0.04, 0.25, 0); rod.add(reel);
    const tip = new THREE.Object3D(); tip.position.y = 1.7; rod.add(tip);
    rod.position.set(0.42, -0.55, -0.95);
    rod.scale.setScalar(0.7);
    camera.add(rod);

    // Bobber, line and splashes.
    const bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe2574c));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xfffaf0));
    bobber.add(top, bot);
    bobber.visible = false;
    scene.add(bobber);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3()));
    const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfffaf0 }));
    line.frustumCulled = false;
    scene.add(line);
    const rings: { m: THREE.Mesh; at: number }[] = [];
    const ring = (x: number, z: number, now: number) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z); scene.add(m); rings.push({ m, at: now });
    };
    const drops: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
    const splash = (p: THREE.Vector3, n: number) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xbee8f8 }));
        m.position.copy(p); scene.add(m);
        drops.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2) });
      }
    };

    // The fish that leaps out when you land it.
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat(0xffffff)); body.scale.set(1.5, 0.75, 0.5); fish.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(0xffffff)); belly.scale.set(1.3, 0.5, 0.45); belly.position.y = -0.1; fish.add(belly);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 4), mat(0xffffff)); tail.rotation.z = Math.PI / 2; tail.position.x = -0.6; fish.add(tail);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x3b2412 })); eye.position.set(0.32, 0.06, 0.15); fish.add(eye);
    fish.visible = false;
    scene.add(fish);

    const resize = () => {
      const w = Math.max(1, Math.floor(el.clientWidth / SCALE)), h = Math.max(1, Math.floor(el.clientHeight / SCALE));
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    const target = new THREE.Vector3(), tipW = new THREE.Vector3(), tmp = new THREE.Vector3();
    let raf = 0, last = performance.now(), lastPhase = "", lastInside = true, lastLanded: FishView["landed"] = null, nibbleSeen = new Set<number>();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = live.current, t = now / 1000;

      // waves
      const pos = waterGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 0.45 + t * 1.3) * 0.07 + Math.sin(z * 0.6 - t * 1.1) * 0.06 + Math.sin((x + z) * 0.9 + t * 2) * 0.03);
      }
      pos.needsUpdate = true; waterGeo.computeVertexNormals();
      fallTex.offset.y = (fallTex.offset.y + dt * 1.6) % 1;
      streamTex.offset.y = (streamTex.offset.y + dt * 0.8) % 1;
      foam.forEach((p, i) => { const k = (t * 0.8 + i / foam.length) % 1; const atTop = i % 2; p.position.set(FALL_X + Math.sin(i * 7.3) * 1.2, (atTop ? 3.95 : 0.35) + Math.sin(k * Math.PI) * 0.5, (atTop ? -34.6 : -28.6) + k * 1.0); p.scale.setScalar(1 - k * 0.6); });
      clouds.forEach((c, i) => { c.position.x += dt * (0.6 + i * 0.1); if (c.position.x > 90) c.position.x = -90; });
      fireflies.forEach((f, i) => { f.position.y += Math.sin(t * 2 + i) * dt * 0.3; f.visible = Math.sin(t * 3 + i * 1.7) > -0.3; });

      if (s.phase !== lastPhase) {
        if (s.phase === "aim") { bobber.visible = false; fish.visible = false; nibbleSeen = new Set(); }
        if (s.phase === "bite") { ring(target.x, target.z, now); splash(bobber.position, 6); }
        lastPhase = s.phase;
      }

      // where the cast lands: further with more power
      target.set(Math.sin(s.power * 9) * 1.5, 0.08, -4 - s.power * 11);
      // rodTilt: how far the tip leans out over the water (radians forward); lower winds it back
      let rodTilt = 0.95, rodBend = 0;
      if (s.phase === "aim") {
        rodTilt = 0.7 - (0.5 - 0.5 * Math.cos((now - s.t0) / 420)) * 1.2; // wind back with the meter
      } else if (s.phase === "wait" || s.phase === "bite" || s.phase === "reel" || (s.phase === "result" && s.landed && !s.landed.caught)) {
        bobber.visible = true;
        const k = Math.min(1, (now - s.castAt) / 700);
        tip.getWorldPosition(tipW);
        if (k < 1) { // the cast arc
          bobber.position.lerpVectors(tipW, target, k);
          bobber.position.y += Math.sin(k * Math.PI) * 3;
          rodTilt = -0.5 + Math.min(1, k * 2.5) * 1.45; // snap forward
        } else {
          bobber.position.copy(target);
          if (lastPhase === "wait" && now - s.castAt < 760 && !rings.some((r) => now - r.at < 300)) ring(target.x, target.z, now);
          let y = 0.08 + Math.sin(t * 2.4) * 0.025;
          for (const nb of s.nibbles) if (now > nb && now < nb + 260) { y -= 0.07; if (!nibbleSeen.has(nb)) { nibbleSeen.add(nb); ring(target.x, target.z, now); } }
          if (s.phase === "bite") y = -0.08 + Math.sin(t * 30) * 0.03;
          if (s.phase === "reel") {
            // the fish drags the bobber side to side; reeling pulls it toward the dock
            const pull = Math.max(0, Math.min(1, s.progress));
            bobber.position.x = target.x + (s.fishY - 0.5) * 2;
            bobber.position.z = target.z * (1 - pull * 0.45);
            y = -0.04 + Math.sin(t * 18) * 0.03;
            rodBend = 0.35 + (s.inside ? 0.1 : 0.3) + Math.sin(t * 14) * 0.04;
            if (!s.inside && Math.random() < dt * 8) splash(bobber.position, 2);
            if (s.inside !== lastInside && !s.inside) ring(bobber.position.x, bobber.position.z, now);
            lastInside = s.inside;
          }
          bobber.position.y = y;
        }
      }
      rod.rotation.set(-rodTilt - rodBend * 0.35, 0, 0.32 + rodBend * 0.15);

      // the fish leaps out toward you on a catch
      if (s.landed !== lastLanded) {
        lastLanded = s.landed;
        if (s.landed?.caught && s.landed.colors) {
          const [b, l, f] = s.landed.colors;
          (body.material as THREE.MeshLambertMaterial).color.set(b); (belly.material as THREE.MeshLambertMaterial).color.set(l); (tail.material as THREE.MeshLambertMaterial).color.set(f);
          fish.scale.set(1, 1, 1);
          if (s.landed.boot) fish.scale.set(0.8, 1.4, 1);
          fish.visible = true; bobber.visible = false;
          splash(bobber.position, 14); ring(bobber.position.x, bobber.position.z, now);
        } else if (s.landed && !s.landed.caught) { splash(bobber.position, 8); ring(bobber.position.x, bobber.position.z, now); }
      }
      if (fish.visible && s.landed) {
        const k = Math.min(1, (now - s.landed.at) / 900);
        const from = tmp.copy(bobber.position);
        fish.position.set(from.x * (1 - k), 0.1 + Math.sin(k * Math.PI) * 2.2 + k * 1.2, from.z * (1 - k) - k * 1.6);
        fish.rotation.set(0, t * 1.2, Math.sin(t * 8) * 0.3 * (1 - k * 0.7));
      }

      // the line: from the rod tip to the bobber (or the fish), with a little sag
      tip.getWorldPosition(tipW);
      const end = fish.visible ? fish.position : bobber.visible ? bobber.position : tipW;
      const pts = lineGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 16; i++) {
        const k = i / 15;
        const sag = s.phase === "reel" ? 0.1 : 0.6;
        pts.setXYZ(i, tipW.x + (end.x - tipW.x) * k, tipW.y + (end.y - tipW.y) * k - Math.sin(k * Math.PI) * sag, tipW.z + (end.z - tipW.z) * k);
      }
      pts.needsUpdate = true;
      line.visible = bobber.visible || fish.visible;

      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i], k = (now - r.at) / 900;
        if (k > 1) { scene.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); continue; }
        r.m.scale.setScalar(1 + k * 5); (r.m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt);
        if (d.m.position.y < 0) { scene.remove(d.m); d.m.geometry.dispose(); drops.splice(i, 1); }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); });
      fallTex.dispose(); renderer.dispose(); canvas.remove();
    };
  }, [live]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
