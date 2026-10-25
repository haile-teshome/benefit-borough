import { farmOrigin } from "./farms";
import type { Category } from "@/lib/types";

// The valley map, in tiles (x east, z south). The village square sits at the origin; themed
// districts branch off it and the farms line the main road to the south.

export const BOUNDS = { x0: -40, x1: 40, z0: -34, z1: 72 };
export const WALK = { x0: -35, x1: 35, z0: -29, z1: 67 };
export const FARM_ROWS = [16, 30, 44, 58];

export type Place = { name: string; categories?: Category[]; line: string };
export type BuildingDef = { id: string; kind: string; x: number; z: number; w: number; place?: Place };

// x, z is the bottom-center of the front wall; w is the width in tiles.
export const BUILDINGS: BuildingDef[] = [
  { id: "pharmacy", kind: "pharmacy", x: -11.5, z: -3, w: 4, place: { name: "Pharmacy & Optical", categories: ["fsa", "fsa_claim", "vision"], line: "FSA money, prescriptions and your glasses allowance, all at one counter." } },
  { id: "clinic", kind: "clinic", x: -18.5, z: -3, w: 6, place: { name: "Burrow General Hospital", categories: ["deductible", "fitness"], line: "Imaging, labs, and the front desk that pays back your gym fees." } },
  { id: "dental", kind: "dental", x: -26.5, z: -3, w: 5, place: { name: "Dr. Okafor’s Dental", categories: ["dental"], line: "Crowns, fillings and cleanings." } },
  { id: "bank", kind: "bank", x: 12.5, z: -3, w: 6, place: { name: "Burrow Bank", categories: ["bank_bonus", "bank_fee", "dispute", "idle_cash"], line: "Checking and savings: bonuses, fees, disputes, idle cash." } },
  { id: "store", kind: "cards", x: 20.5, z: -3, w: 5, place: { name: "The Card House", categories: ["card_credit", "annual_fee", "credit_move", "rotating", "promo_apr", "points"], line: "Every card you carry, managed in one place: credits, fees, cash back, store cards and miles." } },
  { id: "market", kind: "deals", x: 27, z: -3, w: 3, place: { name: "The Deal Desk", categories: ["price_adjust", "subscription"], line: "Price matches, returns and renewals before they bill." } },
  { id: "commons", kind: "commons", x: 17, z: -16, w: 8, place: { name: "Dining Commons", categories: ["dining"], line: "Meal-plan dollars spent here." } },
  { id: "hall", kind: "hall", x: 0, z: -10, w: 8, place: { name: "HR & Benefits Office", categories: ["tax_window", "insurance", "hsa", "retirement", "pto", "stipend", "dcfsa", "espp"], line: "Your workplace benefits: 401(k), PTO, stipends, dependent care, ESPP and open enrollment." } },
  // Homes and shops that make it a town (no balances live here, just flavor)
  { id: "cottage1", kind: "cottage1", x: -28, z: 8.8, w: 4, place: { name: "Rose Cottage", line: "Someone is baking cinnamon rolls." } },
  { id: "library", kind: "library", x: -21.5, z: 8.8, w: 5, place: { name: "Library", line: "A whole shelf on reading your benefits summary." } },
  { id: "bakery", kind: "bakery", x: -15, z: 8.8, w: 4, place: { name: "Bakery", line: "Fresh bread. Accepts dining dollars." } },
  { id: "florist", kind: "florist", x: 15, z: 8.8, w: 4, place: { name: "Flower Shop", line: "Marigolds are in season." } },
  { id: "cottage2", kind: "cottage2", x: 21.5, z: 8.8, w: 5, place: { name: "Willow House", line: "Wind chimes ring on the porch." } },
  { id: "cottage3", kind: "cottage3", x: 28, z: 8.8, w: 4, place: { name: "Maple Cottage", line: "A cat naps in the window." } },
  { id: "inn", kind: "inn", x: 30, z: -16, w: 5, place: { name: "The Sleepy Ledger Inn", line: "Rooms by the night. No hidden fees." } },
];

export const doorOf = (b: BuildingDef) => ({ x: b.x, z: b.z + 0.5 });

export type District = { id: string; name: string; x: number; z: number; color: string };
export const DISTRICTS: District[] = [
  { id: "health", name: "Healthcare District", x: -8.6, z: 3.2, color: "#D2413A" },
  { id: "credit", name: "Financial District", x: 8.6, z: 3.2, color: "#8E5BD0" },
  { id: "civic", name: "Civic Center", x: -7.6, z: -6.2, color: "#3E6E9E" },
  { id: "dining", name: "Dining Commons", x: 9.5, z: -8.4, color: "#E0A526" },
  { id: "farms", name: "Farmland", x: 2.6, z: 8.2, color: "#3FA66B" },
];

export const ELDER: [number, number, number] = [-4.5, 0, -6];
export const FOUNTAIN = { x: 0, z: 1.2 };
export const POND = { x: -18, z: -20, r: 6 };

// Dirt roads (segments with a width) and paved zones.
export const ROADS: { a: [number, number]; b: [number, number]; w: number }[] = [
  { a: [0, 6], b: [0, 66], w: 3 },
  ...FARM_ROWS.map((z) => ({ a: [-13, z] as [number, number], b: [13, z] as [number, number], w: 2 })),
  { a: [-6, -5], b: [-13, -13], w: 2 },
  { a: [5, -5], b: [11, -10], w: 2 },
  { a: [-30, 10.2], b: [30, 10.2], w: 1.8 }, // cottage lane
  { a: [24.5, -13], b: [29, -13], w: 1.6 },   // to the inn
];
export type Zone = { kind: "plaza" | "slab" | "health" | "credit" | "deck"; rect?: [number, number, number, number]; circle?: [number, number, number] };
export const ZONES: Zone[] = [
  { kind: "health", rect: [-31, -3.6, -6, 3.4] },
  { kind: "credit", rect: [6, -3.6, 31, 3.4] },
  { kind: "deck", rect: [10, -16, 24.5, -10] },
  { kind: "slab", rect: [-7, -10.5, 7, -5] },
  { kind: "plaza", circle: [0, 0, 7.5] },
];

function segDist(px: number, pz: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

export function roadAt(x: number, z: number) {
  let best = Infinity;
  for (const r of ROADS) best = Math.min(best, segDist(x, z, r.a, r.b) - r.w / 2);
  return best; // < 0 inside a road
}

export function zoneAt(x: number, z: number): Zone["kind"] | null {
  let hit: Zone["kind"] | null = null;
  for (const zn of ZONES) {
    if (zn.rect && x >= zn.rect[0] && x <= zn.rect[2] && z >= zn.rect[1] && z <= zn.rect[3]) hit = zn.kind;
    if (zn.circle && Math.hypot(x - zn.circle[0], z - zn.circle[1]) <= zn.circle[2]) hit = zn.kind;
  }
  return hit;
}

// ---------- farms ----------
export function farmLayout(farm: number) {
  const o = farmOrigin(farm);
  const side = o.x < 0 ? -1 : 1;
  const slots = Array.from({ length: 20 }, (_, i) => ({ x: o.x + side + ((i % 5) - 2) * 1.6, z: o.z + 2.3 + Math.floor(i / 5) * 1.6 }));
  return {
    o, side, slots,
    house: { x: o.x + side * 2.5, z: o.z - 1.3 },
    mailbox: { x: o.x - side * 3.4, z: o.z - 1 },
    field: { x0: o.x + side - 4.2, x1: o.x + side + 4.2, z0: o.z + 1.3, z1: o.z + 8 },
    decor: [
      { kind: "scarecrow", x: o.x + side * 6.2, z: o.z + 4 },
      { kind: "hay", x: o.x - side * 1.2, z: o.z - 2.4 },
      { kind: "crate", x: o.x + side * 5.5, z: o.z - 1.6 },
      { kind: "barrel", x: o.x + side * 5.6, z: o.z - 0.6 },
      { kind: "planter", x: o.x + side * 1.3, z: o.z - 1 },
      { kind: "planter", x: o.x + side * 3.7, z: o.z - 1 },
      { kind: "flowerbed", x: o.x + side * 2.5, z: o.z - 0.4 },
      ...[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map((dx) => ({ kind: "picket", x: o.x + side + dx, z: o.z + 8.4 })),
      ...[2, 3, 4, 5, 6, 7, 8].flatMap((dz) => [{ kind: "post", x: o.x + side - 4.5, z: o.z + dz }, { kind: "post", x: o.x + side + 4.5, z: o.z + dz }]),
    ],
  };
}
const farmBox = (farm: number) => {
  const o = farmOrigin(farm);
  return [o.x - 7, o.z - 6.5, o.x + 7, o.z + 9] as const;
};

// ---------- static decor ----------
export type Decor = { kind: string; x: number; z: number; v?: number; color?: string; icon?: string };

function rand(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const FIXED: Decor[] = [
  { kind: "fountain", x: FOUNTAIN.x, z: FOUNTAIN.z },
  { kind: "desk", x: ELDER[0], z: ELDER[2] + 0.9 },
  ...[-5, 5].flatMap((x) => [{ kind: "lamp", x, z: -4.6 }, { kind: "lamp", x, z: 5.2 }]),
  { kind: "bench", x: 4.5, z: 3 }, { kind: "bench", x: -4.5, z: 3.4 },
  // Healthcare: hedges, banners, benches
  ...[-29, -22.5, -15].map((x) => ({ kind: "hedge", x, z: 3.1 })),
  ...[-28, -20, -13].map((x) => ({ kind: "banner", x, z: -2.7, color: "#D2413A", icon: "cross" })),
  { kind: "bench", x: -19, z: 2.6 },
  ...[-30, -24, -16, -9].map((x) => ({ kind: "lamp", x, z: 2.8 })),
  // Financial District
  { kind: "banner", x: 11, z: -2.7, color: "#5E3A99", icon: "coin" }, { kind: "banner", x: 19.5, z: -2.7, color: "#8E5BD0", icon: "card" }, { kind: "banner", x: 26, z: -2.7, color: "#E0A526", icon: "coin" },
  { kind: "atm", x: 16.3, z: -2.7 },
  ...[9, 16, 24, 30].map((x) => ({ kind: "lamp", x, z: 2.8 })),
  ...[15, 22.5, 29].map((x) => ({ kind: "hedge", x, z: 3.1 })),
  // Dining Commons
  { kind: "picnic", x: 13, z: -12.5 }, { kind: "picnic", x: 21, z: -12.5 }, { kind: "cart", x: 23, z: -11 },
  { kind: "banner", x: 11, z: -15.6, color: "#E0A526", icon: "food" },
  // Benefits Office
  { kind: "banner", x: -5.5, z: -9.8, color: "#3E8ED0", icon: "calendar" }, { kind: "banner", x: 5.5, z: -9.8, color: "#3E8ED0", icon: "calendar" },
  // District signposts (their names are DOM labels)
  ...DISTRICTS.map((d) => ({ kind: "sign", x: d.x, z: d.z })),
  { kind: "sign", x: 31.6, z: -12.2 },
  // Pond dock
  { kind: "rock", x: -12, z: -22 }, { kind: "rock", x: -23, z: -15 },
  // Plaza: flower beds ring the square, a well and a market stall
  ...[0.55, 1.0, 2.15, 2.6, 3.7, 4.15, 5.25, 5.7].map((a, i) => ({ kind: "flowerbed", x: Math.cos(a) * 6.6, z: Math.sin(a) * 6.6 + 0.4, v: i })),
  { kind: "stall", x: 4.4, z: -2, color: "#E04848", v: 1 },
  { kind: "topiary", x: -2.4, z: -4.4 }, { kind: "topiary", x: 2.4, z: -4.4 },
  // planters flank every shop door
  ...BUILDINGS.flatMap((b) => [{ kind: "planter", x: b.x - 1.25, z: b.z + 0.25, v: 1 }, { kind: "planter", x: b.x + 1.25, z: b.z + 0.25, v: 2 }]),
  // flower beds along both district streets
  ...[-27.5, -25, -21, -17, -13, -10.5].map((x, i) => ({ kind: "flowerbed", x, z: 3.2, v: i + 3 })),
  ...[10.5, 13, 18, 20.5, 26.5, 28.5].map((x, i) => ({ kind: "flowerbed", x, z: 3.2, v: i + 9 })),
  // cottage lane: gardens, fences, lamps
  ...[-29.5, -26.5, -23.5, -19.5, -16.5, -13.5, 13.5, 16.5, 19.5, 23.5, 26.5, 29.5].map((x, i) => ({ kind: "planter", x, z: 9.2, v: i })),
  ...[-25, -18, -11, 11, 18, 25].map((x) => ({ kind: "lamp", x, z: 11.4 })),
  ...[-30, -27, -23, -20, -16, -13].map((x) => ({ kind: "picket", x, z: 11.5 })), ...[13, 16, 20, 23, 27, 30].map((x) => ({ kind: "picket", x, z: 11.5 })),
  // lamps down the farm road, with lights strung across it
  ...[8, 23, 37, 51, 64].flatMap((z) => [{ kind: "lamp", x: -2.2, z }, { kind: "lamp", x: 2.2, z }]),
  // herb garden north of the Healthcare District
  { kind: "arch", x: -25, z: -6.6 },
  ...[-29, -27, -23, -21].flatMap((x, i) => [{ kind: "flowerbed", x, z: -8.6, v: 20 + i }, { kind: "flowerbed", x, z: -10.8, v: 30 + i }]),
  { kind: "well", x: -14.5, z: -8.4 }, { kind: "bench", x: -17.5, z: -8 },
  // farmers' market north of the Financial District
  { kind: "stall", x: 27.5, z: -7.6, color: "#3FA66B", v: 2 }, { kind: "stall", x: 31.5, z: -7.6, color: "#E0A526", v: 4 },
  { kind: "barrel", x: 25, z: -7.2 }, { kind: "crate", x: 33.4, z: -7.2 }, { kind: "crate", x: 33.4, z: -6.4 },
  // dining commons garnish
  { kind: "planter", x: 10.6, z: -10.4 }, { kind: "planter", x: 24, z: -10.4 }, { kind: "barrel", x: 25.4, z: -15 },
  // benefits office lawn
  { kind: "flowerbed", x: -3.4, z: -10.2, v: 40 }, { kind: "flowerbed", x: 3.4, z: -10.2, v: 41 },
  { kind: "bench", x: -10.6, z: -6.6 }, { kind: "bench", x: 10.6, z: -6.6 },
  // A little magic: crystals around the Benefits Office and the pond, glowing mushroom rings
  { kind: "crystal", x: -8.2, z: -10.6, color: "lilac" }, { kind: "crystal", x: 8.2, z: -10.4, color: "aqua" },
  { kind: "crystal", x: -24.6, z: -21, color: "rose" }, { kind: "crystal", x: -11, z: -24.5, color: "aqua" }, { kind: "crystal", x: -21.5, z: -12.8, color: "lilac" },
  { kind: "crystal", x: 4.2, z: 11, color: "rose" }, { kind: "crystal", x: -4.6, z: 22.5, color: "lilac" },
  { kind: "mushrooms", x: -6.5, z: 9.5, color: "#4FC3E8" }, { kind: "mushrooms", x: 6, z: 22.6, color: "#F06C8B" },
  { kind: "mushrooms", x: -27, z: -9, color: "#B48CF0" }, { kind: "mushrooms", x: 27, z: -8.5, color: "#4FC3E8" },
  { kind: "mushrooms", x: 3.5, z: 35.6, color: "#B48CF0" }, { kind: "mushrooms", x: -24, z: 7.5, color: "#F06C8B" },
];

const clearOf = (x: number, z: number) => {
  if (roadAt(x, z) < 1.4) return false;
  if (zoneAt(x, z)) return false;
  for (const zn of ZONES) if (zn.rect && x > zn.rect[0] - 1.5 && x < zn.rect[2] + 1.5 && z > zn.rect[1] - 1.5 && z < zn.rect[3] + 1.5) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.8) return false;
  for (const b of BUILDINGS) if (Math.abs(x - b.x) < b.w / 2 + 1.5 && z > b.z - 6 && z < b.z + 1.5) return false;
  for (let f = 0; f < 8; f++) { const [x0, z0, x1, z1] = farmBox(f); if (x > x0 && x < x1 && z > z0 && z < z1) return false; }
  for (const d of FIXED) if (Math.hypot(x - d.x, z - d.z) < 2) return false;
  return true;
};

export const TREE_KINDS = ["oak", "oak", "oak", "autumn", "autumn", "gold", "pine", "apple", "red"] as const;

export const DECOR: Decor[] = (() => {
  const r = rand(1337);
  const out = [...FIXED];
  for (let z = BOUNDS.z0 + 1; z < BOUNDS.z1; z += 1.9)
    for (let x = BOUNDS.x0 + 1; x < BOUNDS.x1; x += 1.9) {
      const jx = x + (r() - 0.5) * 1.6, jz = z + (r() - 0.5) * 1.6;
      const edge = jx < WALK.x0 + 1 || jx > WALK.x1 - 1 || jz < WALK.z0 + 1 || jz > WALK.z1 - 1;
      const roll = r();
      if (!clearOf(jx, jz)) continue;
      if (roll < (edge ? 0.9 : 0.12)) out.push({ kind: "tree", x: jx, z: jz, v: Math.floor(r() * TREE_KINDS.length) });
      else if (roll < (edge ? 0.95 : 0.22)) out.push({ kind: "bush", x: jx, z: jz, v: Math.floor(r() * 3) });
      else if (roll < (edge ? 0.96 : 0.24)) out.push({ kind: "rock", x: jx, z: jz });
      else if (roll < 0.26) out.push({ kind: r() < 0.5 ? "stump" : "log", x: jx, z: jz });
      else if (roll < 0.58) out.push({ kind: "wildflowers", x: jx + 0.6, z: jz + 0.4, v: Math.floor(r() * 6) });
      else if (roll < 0.82) out.push({ kind: "tallgrass", x: jx - 0.5, z: jz + 0.7 });
    }
  return out;
})();

// Strings of fairy lights between lamp posts: [x0, z0, x1, z1].
export const STRINGS: [number, number, number, number][] = [
  [-5, -4.6, 5, -4.6], [-5, 5.2, 5, 5.2], [-5, -4.6, -5, 5.2], [5, -4.6, 5, 5.2],
  [-30, 2.8, -24, 2.8], [-24, 2.8, -16, 2.8], [-16, 2.8, -9, 2.8],
  [9, 2.8, 16, 2.8], [16, 2.8, 24, 2.8], [24, 2.8, 30, 2.8],
  ...[8, 23, 37, 51, 64].map((z) => [-2.2, z, 2.2, z] as [number, number, number, number]),
  [-25, 11.4, -18, 11.4], [-18, 11.4, -11, 11.4], [11, 11.4, 18, 11.4], [18, 11.4, 25, 11.4],
];
export const GLOWS: Record<string, string> = { lilac: "180, 140, 240", aqua: "111, 224, 224", rose: "244, 154, 200", "#4FC3E8": "79, 195, 232", "#F06C8B": "240, 108, 139", "#B48CF0": "180, 140, 240" };

// Unclaimed farm plots stay pretty: a wildflower meadow, a few bushes and a sign until a farmer joins.
export const FARM_MEADOW: Decor[][] = Array.from({ length: 8 }, (_, f) => {
  const o = farmOrigin(f);
  const r = rand(500 + f * 31);
  const out: Decor[] = [{ kind: "sign", x: o.x, z: o.z - 0.6 }, { kind: "tree", x: o.x + (o.x < 0 ? -5 : 5), z: o.z - 3.5, v: 7 }];
  for (let i = 0; i < 44; i++) {
    const x = o.x + (r() - 0.5) * 12, z = o.z + (r() - 0.5) * 11 + 0.5;
    if (Math.abs(z - o.z) < 1.2 && Math.abs(x - o.x) < 2) continue;
    const roll = r();
    out.push(roll < 0.5 ? { kind: "wildflowers", x, z, v: Math.floor(r() * 6) } : roll < 0.78 ? { kind: "tallgrass", x, z } : roll < 0.93 ? { kind: "bush", x, z, v: Math.floor(r() * 3) } : { kind: "stump", x, z });
  }
  return out;
});

// ---------- NPCs ----------
export { NPCS, type Npc } from "./people";

// ---------- collision ----------
// Solid shapes. Everything you can see is solid over its whole drawn area (roofs and tree crowns
// included), so you walk around things and never disappear behind them.
export type Rect = { x0: number; z0: number; x1: number; z1: number };
const FOOT: Record<string, [number, number]> = { // [width, depth behind the base], in tiles
  tree: [1.7, 2.4], bush: [1.2, 0.8], rock: [0.9, 0.55], lamp: [0.45, 0.5], bench: [1.35, 0.7], hedge: [2.0, 0.8], banner: [0.45, 0.5], sign: [1.4, 0.8],
  desk: [2.0, 1.1], picnic: [2.0, 1.1], cart: [1.8, 1.8], atm: [0.85, 1.1], flowerbed: [2.0, 0.65], planter: [0.65, 0.6], topiary: [0.85, 1.2], barrel: [0.75, 0.7],
  stall: [2.1, 1.9], arch: [2.2, 2.0], well: [1.7, 1.9], stump: [0.85, 0.6], log: [1.5, 0.6], crystal: [1.0, 1.2], mushrooms: [1.1, 0.55],
  picket: [1.1, 0.4], post: [0.35, 0.4], crate: [0.85, 0.75], hay: [1.1, 0.7], scarecrow: [1.1, 1.7], mailbox: [0.7, 1.0], fountain: [3.1, 2.1],
};
export const footprint = (kind: string, x: number, z: number): Rect | null => {
  const f = FOOT[kind];
  return f ? { x0: x - f[0] / 2, z0: z - f[1], x1: x + f[0] / 2, z1: z + 0.12 } : null;
};
// A building's whole sprite: front wall, roof and (for the Benefits Office) its tower.
export const buildingRect = (x: number, z: number, w: number, tall = false): Rect => {
  const h = (w * 16 * 0.26 + 12 + (tall ? 40 : 31)) / 16;
  return { x0: x - w / 2 - 0.25, z0: z - h - 0.3, x1: x + w / 2 + 0.25, z1: z - 0.05 };
};
const TALL = new Set(["clinic", "bank", "cards", "hall", "library", "inn"]);
export const BUILDING_RECTS = BUILDINGS.map((b) => buildingRect(b.x, b.z, b.w, TALL.has(b.kind)));

// The farm pieces that are solid: the house, mailbox, decor and fences of a claimed farm, or the
// meadow's trees and bushes when nobody has claimed it yet.
export function farmRects(farm: number, claimed: boolean): Rect[] {
  if (!claimed) return FARM_MEADOW[farm].flatMap((d) => (d.kind === "wildflowers" || d.kind === "tallgrass" ? [] : [footprint(d.kind, d.x, d.z)!].filter(Boolean)));
  const L = farmLayout(farm);
  return [buildingRect(L.house.x, L.house.z, 5), footprint("mailbox", L.mailbox.x, L.mailbox.z)!, ...L.decor.map((d) => footprint(d.kind, d.x, d.z)).filter((r): r is Rect => Boolean(r))];
}

const PAD = 0.28; // the farmer's half-width
export function blocked(x: number, z: number, others: { x: number; z: number; r: number }[] = [], rects: Rect[] = []) {
  if (x < WALK.x0 || x > WALK.x1 || z < WALK.z0 || z > WALK.z1) return true;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r - 0.4 && !(x > -13.4 && x < -11.6 && z > -16.5)) return true;
  for (const r of BUILDING_RECTS) if (x > r.x0 - PAD && x < r.x1 + PAD && z > r.z0 && z < r.z1) return true;
  for (const r of SOLID_RECTS) if (x > r.x0 - PAD && x < r.x1 + PAD && z > r.z0 && z < r.z1 + 0.1) return true;
  for (const r of rects) if (x > r.x0 - PAD && x < r.x1 + PAD && z > r.z0 && z < r.z1 + 0.1) return true;
  for (const o of others) if (Math.hypot(x - o.x, z - o.z) < o.r) return true;
  return false;
}

export const SOLID_RECTS: Rect[] = DECOR.map((d) => footprint(d.kind, d.x, d.z)).filter((r): r is Rect => Boolean(r));
export const SOLID_DECOR: { x: number; z: number; r: number }[] = [];
