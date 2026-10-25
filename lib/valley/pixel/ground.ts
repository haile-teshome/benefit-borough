import { hash, mix, shade } from "./draw";
import { BOUNDS, FACE, POND, STAIRS, WATERFALL, pavedDepth, tierAt, zoneAt } from "../world";

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

// Light stone with dark accents: one kind of pale sett everywhere (roads, district streets, the
// square), laid in straight rows with soft grey joints, and one dark curb wherever stone meets grass.
const LIGHT = ["#E6E1D6", "#DCD6CA", "#EDE9DF", "#D5CFC2", "#E2DDD1"];
const JOINT: [string, string] = ["#9A9288", "#B3ACA1"];
const DARK = ["#58524C", "#625B54", "#4F4943"];

// Setts in straight staggered rows: each stone lit along its top edge and shaded along its bottom,
// with softened corners.
function pavers(px: number, py: number, pal: string[], w = 7, h = 5) {
  const row = Math.floor(py / h), off = (row & 1) * (w >> 1);
  const col = Math.floor((px + off) / w);
  const ix = (px + off) % w, iy = py % h;
  if (ix === w - 1 || iy === h - 1) return crack(px, py, JOINT[0]);
  if ((ix === 0 || ix === w - 2) && (iy === 0 || iy === h - 2)) return JOINT[1];
  let c = pal[Math.floor(hash(col, row) * pal.length) % pal.length];
  if (iy === 0) c = shade(c, 0.08); else if (iy === h - 2) c = shade(c, -0.07);
  if (hash(px, py) > 0.99) c = shade(c, -0.1);
  return c;
}
const crack = (px: number, py: number, c: string) => { const h = hash(px * 1.3, py * 2.1); return h > 0.996 ? "#8CC65E" : c; };

// The dark curb: two rows of charcoal edging stones, lit along the top.
function curb(px: number, py: number) {
  const row = Math.floor(py / 3), col = Math.floor((px + (row & 1) * 3) / 6);
  if (py % 3 === 2 || (px + (row & 1) * 3) % 6 === 5) return "#3E3934";
  const c = DARK[Math.floor(hash(col, row * 1.7) * DARK.length) % DARK.length];
  return py % 3 === 0 ? shade(c, 0.12) : c;
}

// The town square is a garden plaza laid in the same setts as the roads: a fan of stone around the
// fountain inside a dark ring, and four lawns with flower borders, each edged with the same dark curb
// as the roads. Paths between the lawns line up with the four streets.
const BLOOMS = ["#F48FB1", "#FFD45A", "#FFFFFF", "#C8A8F0", "#FF8A65"];
function plaza(x: number, z: number, px: number, py: number) {
  const r = Math.hypot(x, z), path = 1.5; // paths as wide as the main road
  let th = Math.atan2(z, x); if (th < 0) th += Math.PI * 2;
  if (r < 2.75) { // fan of stones around the fountain
    const W = 0.5, ring = Math.floor(r / W), fr = r / W - ring;
    const segs = Math.max(8, Math.round((Math.PI * 2 * (ring + 0.5) * W) / 0.62));
    const sg = (th / (Math.PI * 2)) * segs + (ring & 1) * 0.5, fs = sg - Math.floor(sg);
    if (fr < 0.13 || fs * ((Math.PI * 2 * r) / segs) < 0.06) return JOINT[0];
    const c = LIGHT[Math.floor(hash(ring, Math.floor(sg)) * LIGHT.length) % LIGHT.length];
    return fr > 0.82 ? shade(c, 0.08) : fr < 0.28 ? shade(c, -0.06) : c;
  }
  if (r < 3.0) return curb(px, py);
  const ax = Math.abs(x), az = Math.abs(z);
  const lawn = Math.min(ax - path, az - path, r - 3.0, 6.1 - r); // > 0 inside a lawn
  if (lawn <= 0) return pavers(px, py, LIGHT);
  if (lawn < 0.2) return curb(px, py);
  if (lawn < 0.6) {
    const h = hash(Math.floor(px / 2), Math.floor(py / 2));
    if (h > 0.55) return BLOOMS[Math.floor(h * 97) % BLOOMS.length];
    return h > 0.25 ? "#4E8F3A" : "#3F7A30";
  }
  return grass(px, py + 3);
}

function paving(kind: string, px: number, py: number, x = 0, z = 0) {
  if (kind === "plaza") return plaza(x, z, px, py);
  // deck
  const plank = Math.floor(py / 4);
  if (py % 4 === 3 || (px + plank * 11) % 30 === 0) return "#7A4E2D";
  return shade("#C08A55", (hash(plank, Math.floor((px + plank * 11) / 30)) - 0.5) * 0.14);
}

// Cliffs: earthy rock in stacked layers under a grass lip, a dark base and a soft shadow on the
// grass below. Stairs are pale stone steps; the waterfall pours off the bluff into the pond.
const ROCK = ["#A88866", "#9C7B5C", "#B39272"];
function cliff(px: number, py: number, k: number, kpx: number) {
  if (k <= 2) return k === 1 ? "#6CAE45" : "#4E8F3A"; // grass lip hanging over the edge
  if (k >= kpx - 1) return "#5A4433"; // dark base
  const band = Math.floor((py + Math.floor(hash(Math.floor(px / 9), 3) * 3)) / 4);
  const iy = (py + Math.floor(hash(Math.floor(px / 9), 3) * 3)) % 4;
  if (iy === 3) return "#6E5440";
  if (hash(Math.floor(px / 5), band) > 0.82 && px % 5 === 0) return "#7A5E47"; // cracks
  const c = ROCK[Math.floor(hash(Math.floor(px / 6), band) * ROCK.length) % ROCK.length];
  return iy === 0 ? shade(c, 0.1) : c;
}
function stairs(px: number, py: number, k: number, x: number, s: { x: number; w: number }) {
  if (Math.abs(x - s.x) > s.w / 2 - 0.15) return "#5A4433"; // side walls
  const iy = k % 4;
  return iy === 0 ? "#EDE9DF" : iy === 3 ? "#8C8378" : hash(px >> 2, py >> 2) > 0.5 ? "#D5CFC2" : "#DCD6CA";
}
function waterfall(px: number, py: number, k: number) {
  const streak = hash(px, Math.floor((py + px * 3) / 5));
  return k <= 1 ? "#E8F7FF" : streak > 0.7 ? "#FFFFFF" : streak > 0.35 ? "#BEE8F8" : "#7FC8EE";
}

export type Ground = { canvas: HTMLCanvasElement; water: number[] };

export function bakeGround(): Ground {
  const W = (BOUNDS.x1 - BOUNDS.x0) * T, H = (BOUNDS.z1 - BOUNDS.z0) * T;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const water: number[] = [];
  // Terrain tier for every pixel, computed once.
  const tier = new Int8Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) tier[py * W + px] = tierAt(BOUNDS.x0 + px / T, BOUNDS.z0 + py / T);
  const KPX = FACE * T;
  // Rolling hills: a gentle height field lit from the north-west, so the open grass isn't flat.
  const hill = (px: number, py: number) => vnoise(px / 170, py / 170) * 0.7 + vnoise(px / 60, py / 60) * 0.3;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = BOUNDS.x0 + px / T, z = BOUNDS.z0 + py / T;
      let c = grass(px, py);
      const t = tier[py * W + px];
      const lit = hill(px - 10, py - 10) - hill(px + 10, py + 10);
      if (lit > 0.035) c = shade(c, 0.07); else if (lit < -0.035) c = shade(c, -0.08);
      if (t > 0) {
        c = mix(c, "#A6D86C", 0.1 * t); // higher ground is a touch sunnier
        if (py + 2 < H && tier[(py + 2) * W + px] < t) c = "#9BD066"; // bright lip along the edge
        else if ((px > 0 && tier[py * W + px - 1] < t) || (px + 1 < W && tier[py * W + px + 1] < t)) c = "#3F6E2E"; // side edges
      }
      // Roads and district paving: pale setts with a crisp dark curb along the outside edge and a
      // soft shadow on the grass. Where a road meets a square there's no curb; the stones flow on.
      const zk = zoneAt(x, z);
      const paved = pavedDepth(x, z);
      if (zk === "deck") c = paving(zk, px, py);
      else if (paved >= 0.04 && paved < 0.24) c = curb(px, py);
      else if (zk === "plaza") c = paving(zk, px, py, x, z);
      else if (paved >= 0.24) c = pavers(px, py, LIGHT);
      else if (paved > -0.12) c = shade(c, -0.15);
      // The pond sits on the valley floor; up on the bluff, a stream runs down to the falls.
      const stream = t > 0 && x > WATERFALL.x0 + 0.15 + Math.sin(z * 0.9) * 0.15 && x < WATERFALL.x1 - 0.15 + Math.sin(z * 0.9) * 0.15;
      const pd = t > 0 ? (stream ? -0.5 : 9) : Math.hypot(x - POND.x, z - POND.z) - POND.r + (vnoise(px / 12, py / 12) - 0.5) * 1.2;
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
      // Cliff faces sit just below a higher tier's edge and cover whatever is there.
      let k = 0;
      for (let d = 1; d <= KPX && py - d >= 0; d++) if (tier[(py - d) * W + px] > t) { k = d; break; }
      if (k) {
        const st = STAIRS.find((s) => Math.abs(x - s.x) < s.w / 2 && Math.abs(z - k / T - s.z) < 0.7);
        c = st ? stairs(px, py, k, x, st) : x > WATERFALL.x0 && x < WATERFALL.x1 && z > -34 && z < -22 ? waterfall(px, py, k) : cliff(px, py, k, KPX);
      } else if (py >= KPX + 3) {
        // soft shadow on the ground at the foot of a cliff, and spray where the waterfall lands
        for (let d = KPX + 1; d <= KPX + 3; d++) if (tier[(py - d) * W + px] > t) {
          const fall = x > WATERFALL.x0 - 0.3 && x < WATERFALL.x1 + 0.3 && z < -20;
          c = fall ? (hash(px, py) > 0.5 ? "#FFFFFF" : "#BEE8F8") : shade(c, -0.18);
          break;
        }
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
