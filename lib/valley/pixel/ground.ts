import { hash, mix, shade } from "./draw";
import { BOUNDS, POND, pavedDepth, roadAt, zoneAt } from "../world";

// Bakes the whole ground layer once, pixel by pixel: grass, cobbles, dirt roads, district paving,
// the pond and its dock. Sprites are drawn on top every frame.

const T = 16;

function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const GRASS = ["#5E9E3F", "#6CAE45", "#7BBC4E", "#8BC957"];
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function grass(px: number, py: number) {
  const n = vnoise(px / 40, py / 40) * 0.7 + vnoise(px / 9, py / 9) * 0.3;
  let i = n < 0.38 ? 0 : n < 0.55 ? 1 : n < 0.72 ? 2 : 3;
  const h = hash(px, py);
  // little two-pixel blades
  if (h > 0.965 || (hash(px, py - 1) > 0.965)) i = Math.max(0, i - 1);
  if (h < 0.012) i = Math.min(3, i + 1);
  // scattered flowers
  const cx = Math.floor(px / 6), cy = Math.floor(py / 6);
  const f = hash(cx * 3.1, cy * 7.7);
  if (f > 0.955) {
    const fx = cx * 6 + 3, fy = cy * 6 + 3, dx = px - fx, dy = py - fy;
    const col = ["#FFFFFF", "#FFD45A", "#F48FB1", "#C8A8F0"][Math.floor(f * 1000) % 4];
    if (dx === 0 && dy === 0) return "#F6B93B";
    if (Math.abs(dx) + Math.abs(dy) === 1) return col;
  }
  return GRASS[i];
}

// Rounded cobblestones: a jittered grid of stone centers (Voronoi). Mortar where two stones meet,
// a lit top-left and shaded bottom-right on each stone, and per-stone color variation.
function stones(px: number, py: number, palette: string[], size = 7, wear = 0, mortar: [string, string] = ["#5A4636", "#7A6150"], relief = 1) {
  const gx = Math.floor(px / size), gy = Math.floor(py / size);
  let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cxi = gx + i, cyi = gy + j;
    const sx = (cxi + 0.2 + hash(cxi, cyi) * 0.6) * size, sy = (cyi + 0.2 + hash(cyi * 3.7, cxi * 1.3) * 0.6) * size;
    const d = Math.hypot((px - sx) * 1.08, py - sy);
    if (d < d1) { d2 = d1; d1 = d; cx = sx; cy = sy; id = hash(cxi * 7.1, cyi * 3.3); } else if (d < d2) d2 = d;
  }
  if (d2 - d1 < 1.15) {
    const h = hash(px * 1.3, py * 2.1);
    if (h > 0.992) return h > 0.997 ? "#F7A8C4" : "#8CC65E"; // a tiny flower or moss in the cracks
    return d2 - d1 < 0.55 ? mortar[0] : mortar[1]; // mortar, softer at its edge
  }
  let c = palette[Math.floor(id * palette.length) % palette.length];
  c = shade(c, wear * 0.18);
  const dx = (px - cx) / size, dy = (py - cy) / size;
  if (dx + dy < -0.38) c = shade(c, 0.16 * relief); // light from the top-left
  else if (dx + dy > 0.34) c = shade(c, -0.14 * relief);
  if (hash(px, py) > 0.985) c = shade(c, -0.2); // pits and speckle
  return c;
}

// One paving family for the whole town: soft, rounded sandstone with gentle mortar. Districts get
// only a faint tint (mint for health, rose for finance, lavender for civic) so they read as areas
// without clashing patterns.
const SAND = ["#EAD7B4", "#E3CDA6", "#EFDDBE", "#DEC59D", "#E7D2AE"];
const tint = (pal: string[], to: string, t: number) => pal.map((c) => mix(c, to, t));
const ROAD = tint(SAND, "#C9A67C", 0.35);
const PLAZA = SAND;
const HEALTH = tint(SAND, "#CFEBDC", 0.38);
const FINANCE = tint(SAND, "#F3C8BE", 0.38);
const CIVIC = tint(SAND, "#DCD3F0", 0.4);
const CURB = tint(SAND, "#FFF6E2", 0.45);
const MORTAR: [string, string] = ["#B49773", "#C8AD88"];

// The curb: a single row of rounded edging stones, lit on top.
function curb(px: number, py: number) {
  const seg = Math.floor((px + py) / 6);
  const c = CURB[Math.floor(hash(seg, 7.3) * CURB.length) % CURB.length];
  if ((px + py) % 6 === 0) return "#B49773";
  return (py % 3 === 0) ? shade(c, 0.1) : c;
}

function paving(kind: string, px: number, py: number) {
  if (kind === "plaza") return stones(px, py, PLAZA, 8, 0, MORTAR, 0.6);
  if (kind === "health") return stones(px, py, HEALTH, 8, 0, MORTAR, 0.6);
  if (kind === "credit") return stones(px, py, FINANCE, 8, 0, MORTAR, 0.6);
  if (kind === "slab") return stones(px, py, CIVIC, 8, 0, MORTAR, 0.6);
  // deck
  const plank = Math.floor(py / 4);
  if (py % 4 === 3 || (px + plank * 11) % 30 === 0) return "#7A4E2D";
  return shade("#C08A55", (hash(plank, Math.floor((px + plank * 11) / 30)) - 0.5) * 0.14);
}

export type Ground = { canvas: HTMLCanvasElement; water: number[] };

export function bakeGround(): Ground {
  const W = (BOUNDS.x1 - BOUNDS.x0) * T, H = (BOUNDS.z1 - BOUNDS.z0) * T;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const water: number[] = [];
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = BOUNDS.x0 + px / T, z = BOUNDS.z0 + py / T;
      let c = grass(px, py);
      // All stone paving (roads, plaza, districts) is one surface with one curb around its outside
      // edge: pale edging stones, a thin shadow line, then a soft shadow on the grass. Where a road
      // meets a plaza there's no curb, so the stones simply flow into each other.
      const paved = pavedDepth(x, z);
      const zk = zoneAt(x, z);
      if (zk === "deck") c = paving(zk, px, py);
      else if (paved >= 0.2) {
        const rd = roadAt(x, z);
        c = zk ? paving(zk, px, py) : stones(px, py, ROAD, 8, Math.min(1, -rd / 1.2) * 0.6, MORTAR, 0.6);
      } else if (paved >= 0.05) c = curb(px, py);
      else if (paved >= 0) c = "#9C7F5E";
      else if (paved > -0.14) c = shade(c, -0.14);
      const pd = Math.hypot(x - POND.x, z - POND.z) - POND.r + (vnoise(px / 12, py / 12) - 0.5) * 1.2;
      if (pd < 0.35 && pd >= 0) c = pd < 0.15 ? "#8C6A44" : "#B89668";
      if (pd < 0) {
        const deep = pd < -2.2;
        c = deep ? "#3F8CC6" : "#55A6D8";
        if (pd > -0.25) c = "#A8DDF4";
        else if ((px + py * 2) % 23 === 0 && hash(px, py) > 0.5) c = mix(c, "#FFFFFF", 0.35);
        if (hash(Math.floor(px / 7), Math.floor(py / 7)) > 0.97 && pd < -1) { // lily pads
          const lx = px % 7, ly = py % 7;
          if (lx > 1 && lx < 6 && ly > 2 && ly < 6 && !(lx === 3 && ly === 3)) c = lx === 2 ? "#3F8A3A" : "#5FAE4A";
        }
        if (pd < -0.3 && (px * 7 + py * 13) % 41 === 0) water.push(px, py);
      }
      // dock planks
      if (x > -13.4 && x < -11.6 && z > -17 && z < -13) {
        const iy = py % 4;
        c = iy === 3 ? "#6E4428" : px % 16 === 0 ? "#7A4E2D" : shade("#B07A48", (hash(Math.floor(py / 4), 2) - 0.5) * 0.15);
      }
      const [r, g, b] = rgb(c);
      const i = (py * W + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return { canvas, water };
}

// Tilled soil for an owned farm's field (drawn flat, under the crops).
export function fieldPatch(wTiles: number, hTiles: number) {
  const c = document.createElement("canvas");
  c.width = wTiles * T; c.height = hTiles * T;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const edge = x < 2 || y < 2 || x >= c.width - 2 || y >= c.height - 2;
      let col = y % 8 === 6 ? "#6E4428" : y % 8 === 0 ? "#A87146" : "#8E5B37";
      if (hash(x, y) > 0.94) col = shade(col, -0.15);
      if (edge) col = "#6E4428";
      const [r, g, b] = rgb(col);
      img.data.set([r, g, b, 255], (y * c.width + x) * 4);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}
