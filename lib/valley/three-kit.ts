import * as THREE from "three";

// Shared pieces for the first-person minigames (balloons, bugs): a low-resolution renderer scaled
// up with crisp pixels to match the burrow's art, a gradient sky with drifting clouds, rolling
// hills, low-poly trees and flowers. Client-only.

export const SCALE = 3; // one rendered pixel = 3 screen pixels
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const mat = (c: number | string) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

export type Stage = { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement; clouds: THREE.Group[]; dispose: () => void };

export function makeStage(host: HTMLElement, night: boolean, fov = 62): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  const canvas = renderer.domElement;
  canvas.style.cssText = "width:100%;height:100%;display:block;image-rendering:pixelated;";
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  const horizon = night ? 0x2a3a66 : 0xcfeaf7;
  scene.fog = new THREE.Fog(horizon, 40, 130);
  const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.05, 220);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(night ? 0x7080c0 : 0xfff6e0, night ? 0x1a2030 : 0x4f7a35, night ? 0.8 : 1.0));
  const sun = new THREE.DirectionalLight(night ? 0xb8c8ff : 0xffe8c0, night ? 0.5 : 1.5);
  sun.position.set(-8, 14, 10);
  scene.add(sun);

  // Sky dome with a vertical gradient, and chunky clouds (or stars and a moon at night).
  const skyGeo = new THREE.SphereGeometry(160, 16, 10);
  const top = new THREE.Color(night ? 0x0e1530 : 0x5fb0e8), hor = new THREE.Color(horizon), col: number[] = [];
  const sp = skyGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) { const c = hor.clone().lerp(top, Math.max(0, Math.min(1, sp.getY(i) / 70))); col.push(c.r, c.g, c.b); }
  skyGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  const clouds: THREE.Group[] = [];
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(2, 3.4), 0), new THREE.MeshLambertMaterial({ color: night ? 0x5a6488 : 0xffffff, flatShading: true, fog: false })); p.position.set(j * 2.6 - 4, rnd(-0.6, 0.8), rnd(-1, 1)); c.add(p); }
    c.position.set(rnd(-80, 80), rnd(24, 40), rnd(-120, -70));
    clouds.push(c); scene.add(c);
  }
  if (night) {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(3, 14), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false })); moon.position.set(28, 36, -110); scene.add(moon);
    for (let i = 0; i < 90; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); s.position.set(rnd(-130, 130), rnd(25, 95), -130); scene.add(s); }
  }

  const resize = () => {
    const w = Math.max(1, Math.floor(host.clientWidth / SCALE)), h = Math.max(1, Math.floor(host.clientHeight / SCALE));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  return {
    renderer, scene, camera, canvas, clouds,
    dispose: () => {
      ro.disconnect();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[] | undefined; if (mm) (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); });
      renderer.dispose(); canvas.remove();
    },
  };
}

export const driftClouds = (clouds: THREE.Group[], dt: number) => clouds.forEach((c, i) => { c.position.x += dt * (0.6 + i * 0.1); if (c.position.x > 100) c.position.x = -100; });

// Rolling green ground: a low-poly plane with gentle hills (y offset grows with distance).
export function ground(scene: THREE.Scene, night: boolean, size = 160) {
  const g = new THREE.PlaneGeometry(size, size, 48, 48);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z);
    p.setY(i, Math.max(0, d - 14) * 0.06 * (1 + Math.sin(x * 0.12) * 0.6 + Math.cos(z * 0.1) * 0.4) + Math.sin(x * 0.4 + z * 0.3) * 0.12);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat(night ? 0x2f5a2a : 0x6cae45));
  scene.add(m);
  return m;
}

const LEAF = [0x3f8a3a, 0x5e9e3f, 0xd8743e, 0xe0a526, 0x2f6e46, 0xc9483a];
export function tree(scene: THREE.Scene, x: number, z: number, s = 1, seed = 0) {
  const h = (1.6 + (seed % 5) * 0.2) * s;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, h, 5), mat(0x6e4428));
  trunk.position.set(x, h / 2, z); scene.add(trunk);
  if (seed % 3 === 0) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.1 * s, 2.8 * s, 6), mat(0x2f6e46)); c.position.set(x, h + 1.1 * s, z); scene.add(c); }
  else for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry((0.9 + j * 0.15) * s, 0), mat(LEAF[(seed + j) % LEAF.length])); c.position.set(x + Math.sin(seed + j * 2) * 0.5 * s, h + (0.3 + j * 0.3) * s, z + Math.cos(seed + j) * 0.5 * s); scene.add(c); }
  return { trunk, height: h };
}

export function flowers(scene: THREE.Scene, n: number, area: [number, number, number, number]) {
  const colors = [0xf48fb1, 0xffd45a, 0xffffff, 0xc8a8f0, 0xff8a65];
  const spots: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const x = rnd(area[0], area[1]), z = rnd(area[2], area[3]);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 3), mat(0x3f7a30)); stem.position.set(x, 0.17, z); scene.add(stem);
    const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), mat(colors[i % colors.length])); f.position.set(x, 0.37, z); scene.add(f);
    spots.push(new THREE.Vector3(x, 0.4, z));
  }
  return spots;
}

// The 2D screen position (CSS pixels) of a world point.
export function toScreen(v: THREE.Vector3, camera: THREE.Camera, el: HTMLElement) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * el.clientWidth, y: (-p.y * 0.5 + 0.5) * el.clientHeight, behind: p.z > 1 };
}
