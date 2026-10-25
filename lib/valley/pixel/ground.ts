import { hash, mix, shade } from "./draw";
import { BOUNDS, POND, roadAt, zoneAt } from "../world";

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
  if (d2 - d1 < 1.15) return d2 - d1 < 0.55 ? mortar[0] : mortar[1]; // mortar, softer at its edge
  let c = palette[Math.floor(id * palette.length) % palette.length];
  c = shade(c, wear * 0.18);
  const dx = (px - cx) / size, dy = (py - cy) / size;
  if (dx + dy < -0.38) c = shade(c, 0.16 * relief); // light from the top-left
  else if (dx + dy > 0.34) c = shade(c, -0.14 * relief);
  if (hash(px, py) > 0.985) c = shade(c, -0.2); // pits and speckle
  return c;
}

const ROAD = ["#CDB08A", "#C4A57E", "#D6BC97", "#BC9C74", "#C9AD86"];
const PLAZA = ["#D3CBBA", "#CCC3B1", "#D8D0BF", "#C8BFAD"];
const CURB = ["#DCD2BE", "#D2C7B1", "#E4DBC8"];

function paving(kind: string, px: number, py: number) {
  if (kind === "plaza") return stones(px, py, PLAZA, 6, 0, ["#A79C8A", "#B7AD9B"], 0.55);
  if (kind === "slab") {
    const ix = px % 16, iy = py % 12;
    if (ix === 15 || iy === 11) return "#9A9184";
    return shade("#D6CEBD", (hash(Math.floor(px / 16), Math.floor(py / 12)) - 0.5) * 0.12 + (iy === 0 ? 0.1 : 0));
  }
  if (kind === "health") {
    const ix = px % 8, iy = py % 8;
    if (ix === 7 || iy === 7) return "#B9C9C2";
    return (Math.floor(px / 8) + Math.floor(py / 8)) % 2 ? "#EEF3EF" : "#DCEAE3";
  }
  if (kind === "credit") {
    // herringbone-ish brick
    const row = Math.floor(py / 4), off = (row % 2) * 4;
    if (py % 4 === 3 || (px + off) % 8 === 7) return "#7E3A2B";
    return shade("#B65A43", (hash(Math.floor((px + off) / 8), row) - 0.5) * 0.2);
  }
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
      // Roads: a curb of pale edging stones, cobbles inside that get lighter where feet wear them,
      // a thin shadow line under the curb, and grass tufts that spill over the edge.
      const jitter = (vnoise(px / 6, py / 6) - 0.5) * 0.12;
      const rd = roadAt(x, z) + jitter;
      const tuft = hash(px, py * 1.7) > 0.72 && vnoise(px / 3, py / 3) > 0.5;
      if (rd < -0.2) c = stones(px, py, ROAD, 7, Math.min(1, (-rd - 0.2) / 1.1));
      else if (rd < -0.04) c = tuft && rd > -0.1 ? GRASS[2] : stones(px + 3, py + 1, CURB, 4);
      else if (rd < 0.02) c = "#6B5440";
      else if (rd < 0.14) c = shade(c, -0.14);
      const zk = zoneAt(x, z);
      if (zk) c = paving(zk, px, py);
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
