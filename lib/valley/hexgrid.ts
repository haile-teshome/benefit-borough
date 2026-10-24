import { farmOrigin } from "./farms";
import { fbm, flatDistance } from "./terrain";

// The valley is laid out on KayKit's pointy-top hex tiles. A tile model is 2 units across
// (x: -1..1) and 2.31 deep (z: ±1.155); TILE scales it into world units.
export const TILE = 2.5;
const W = 2 * TILE; // horizontal spacing
const H = 1.7320508 * TILE; // row spacing (1.5 × circumradius)
const LEVEL = 0.55 * TILE; // terrace step height
const EXTENT = 96;

export type Deco =
  | "trees_A_large" | "trees_A_medium" | "trees_A_small" | "trees_B_large" | "trees_B_medium" | "trees_B_small"
  | "hills_A_trees" | "hills_B_trees" | "hills_C_trees" | "mountain_A_grass_trees" | "mountain_B_grass_trees" | "mountain_C_grass_trees"
  | "rock_single_A" | "rock_single_B" | "rock_single_C" | "rock_single_D" | "tree_single_A" | "tree_single_B"
  | "waterlily_A" | "waterlily_B" | "waterplant_A" | "waterplant_B";

export type Tile = { col: number; row: number; x: number; z: number; y: number; kind: "grass" | "water" | "dirt"; deco?: Deco; rot: number };

function hash(a: number, b: number) {
  const s = Math.sin(a * 91.17 + b * 47.3) * 43758.5453;
  return s - Math.floor(s);
}

const center = (col: number, row: number) => ({ x: W * (col + 0.5 * (row & 1)), z: H * row });

// Nearest tile index for a world position (offset coordinates, odd rows shifted right).
function locate(x: number, z: number) {
  const row = Math.round(z / H);
  let best = { col: 0, row, d: Infinity };
  for (const r of [row - 1, row, row + 1]) {
    const col = Math.round(x / W - 0.5 * (r & 1));
    for (const c of [col - 1, col, col + 1]) {
      const p = center(c, r);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best.d) best = { col: c, row: r, d };
    }
  }
  return best;
}

// Spots kept flat and clear for village buildings (see HexWorld.Village).
export const RESERVED: [number, number][] = [[-4.5, -1], [6, -6], [-9, -11], [11, -18], [-20, -12], [25.5, -6], [-6.5, 6]];

let grid: Map<string, Tile> | null = null;
const key = (c: number, r: number) => `${c},${r}`;

const FOREST: Deco[] = ["trees_A_large", "trees_A_medium", "trees_B_large", "trees_B_medium", "trees_A_small", "trees_B_small"];
const HILLS: Deco[] = ["hills_A_trees", "hills_B_trees", "hills_C_trees"];
const PEAKS: Deco[] = ["mountain_A_grass_trees", "mountain_B_grass_trees", "mountain_C_grass_trees"];
const ROCKS: Deco[] = ["rock_single_A", "rock_single_B", "rock_single_C", "rock_single_D"];

function build() {
  const g = new Map<string, Tile>();
  const rows = Math.ceil(EXTENT / H);
  const cols = Math.ceil(EXTENT / W);
  for (let row = -rows; row <= rows; row++) {
    for (let col = -cols; col <= cols; col++) {
      const { x, z } = center(col, row);
      if (Math.abs(x) > EXTENT || Math.abs(z) > EXTENT) continue;
      const h = hash(col, row);
      const rot = Math.floor(h * 6) * (Math.PI / 3);
      const fd = flatDistance(x, z);
      const edge = Math.max(Math.abs(x), Math.abs(z)) / EXTENT;
      if (Math.hypot(x - 16, z + 8) < 8.5) {
        g.set(key(col, row), { col, row, x, z, y: 0, kind: "water", rot, deco: h < 0.35 ? (h < 0.17 ? "waterlily_A" : "waterlily_B") : h > 0.85 ? "waterplant_A" : undefined });
        continue;
      }
      if (RESERVED.some(([rx, rz]) => Math.hypot(x - rx, z - rz) < TILE * 1.6)) {
        g.set(key(col, row), { col, row, x, z, y: 0, kind: "grass", rot });
        continue;
      }
      // Terraces rise away from where people work; mountains ring the valley.
      const n = fbm(x * 0.04 + 7, z * 0.04 - 3);
      const lift = fd < 5 ? 0 : Math.max(0, Math.round((n - 0.42) * 6 + edge * 3 - 0.6));
      let deco: Deco | undefined;
      if (edge > 0.9 && h < 0.75) deco = PEAKS[Math.floor(h * 4) % 3];
      else if (fd > 9 && lift >= 3 && h < 0.5) deco = HILLS[Math.floor(h * 6) % 3];
      else if (fd > 4 && h < 0.42) deco = FOREST[Math.floor(hash(row, col) * FOREST.length)];
      else if (fd > 3 && h > 0.93) deco = ROCKS[Math.floor(hash(col + 3, row) * 4)];
      else if (fd > 2.5 && h > 0.88) deco = h > 0.905 ? "tree_single_A" : "tree_single_B";
      g.set(key(col, row), { col, row, x, z, y: Math.min(lift, 4) * LEVEL, kind: "grass", deco, rot });
    }
  }
  return g;
}

export function tiles() {
  grid ??= build();
  return grid;
}

// Top surface height of the tile under a world position (what feet stand on).
export function groundAt(x: number, z: number) {
  const { col, row } = locate(x, z);
  return tiles().get(key(col, row))?.y ?? 0;
}

// A farm's field: the 12 tile centres in front of its farmhouse, nearest-first, turned into dirt.
const fieldCache = new Map<number, { x: number; z: number }[]>();
export function farmField(farm: number) {
  const hit = fieldCache.get(farm);
  if (hit) return hit;
  const o = farmOrigin(farm);
  const cand: { x: number; z: number; d: number }[] = [];
  for (const t of tiles().values()) {
    const dx = t.x - o.x, dz = t.z - (o.z + 1.5);
    if (Math.abs(dx) < 9 && Math.abs(dz) < 6) cand.push({ x: t.x, z: t.z, d: Math.hypot(dx, dz * 1.3) });
  }
  cand.sort((a, b) => a.d - b.d || a.z - b.z || a.x - b.x);
  const slots = cand.slice(0, 8).sort((a, b) => a.z - b.z || a.x - b.x).map(({ x, z }) => ({ x, z }));
  fieldCache.set(farm, slots);
  return slots;
}

export function snapToTile(x: number, z: number) {
  const { col, row } = locate(x, z);
  return center(col, row);
}
