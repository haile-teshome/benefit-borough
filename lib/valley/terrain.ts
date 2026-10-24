import { farmOrigin } from "./farms";

// Gentle hills everywhere except where people work and walk: the square, the roads, the farms and
// the pond stay flat. Shared by the ground mesh, the grass, the trees and the farmers' feet.

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number) {
  let f = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < 4; i++) { f += amp * valueNoise(x * freq, y * freq); freq *= 2.1; amp *= 0.5; }
  return f;
}

const FARMS = Array.from({ length: 8 }, (_, i) => farmOrigin(i));

function boxDist(x: number, z: number, cx: number, cz: number, hx: number, hz: number) {
  const dx = Math.max(Math.abs(x - cx) - hx, 0);
  const dz = Math.max(Math.abs(z - cz) - hz, 0);
  return Math.hypot(dx, dz);
}

// Distance to the nearest flat zone (0 inside one).
export function flatDistance(x: number, z: number) {
  let d = Math.max(0, Math.hypot(x, z) - 9); // village square
  d = Math.min(d, boxDist(x, z, 0, 42, 3, 42)); // main road south
  d = Math.min(d, boxDist(x, z, 0, 9, 36, 2.6)); // cross road
  d = Math.min(d, Math.max(0, Math.hypot(x - 16, z + 8) - 10)); // pond and its bank
  for (const o of FARMS) d = Math.min(d, boxDist(x, z, o.x, o.z - 2, 10, 11));
  return d;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function groundHeight(x: number, z: number) {
  const ramp = smooth(0, 7, flatDistance(x, z));
  if (ramp === 0) return 0;
  return (fbm(x * 0.045 + 3.1, z * 0.045 - 1.7) - 0.35) * 3.2 * ramp;
}
