import { BUILDINGS } from "./world";

// Shop interiors. Each room is its own little map in tile units (x right, z down) with the door at
// the bottom center, a keeper behind the counter, furniture, and display spots for claims.

export type Furn = { kind: string; x: number; z: number; v?: number; color?: string; w?: number };
export type Interior = {
  id: string; w: number; h: number; floor: "wood" | "tile" | "checker" | "carpet" | "stone"; wall: string; trim: string;
  furniture: Furn[]; keeper: { x: number; z: number }; spots: { x: number; z: number }[]; solids: { x0: number; z0: number; x1: number; z1: number }[];
};

const WALL_H = 2.2; // the back wall's height in tiles

function room(id: string, w: number, h: number, floor: Interior["floor"], wall: string, trim: string, furniture: Furn[], spots?: { x: number; z: number }[]): Interior {
  const counterZ = 3.6;
  const solids = furniture.filter((f) => SOLID.has(f.kind)).map((f) => {
    const hw = (f.w ?? FOOT[f.kind]?.[0] ?? 1) / 2, d = FOOT[f.kind]?.[1] ?? 0.8;
    return { x0: f.x - hw, z0: f.z - d, x1: f.x + hw, z1: f.z };
  });
  const defaultSpots = [2.2, 4.2, w - 4.2, w - 2.2].flatMap((x) => [{ x, z: h - 2.9 }, { x, z: h - 1.5 }]);
  return { id, w, h, floor, wall, trim, furniture, keeper: { x: w / 2, z: counterZ - 0.7 }, spots: spots ?? defaultSpots, solids };
}

const SOLID = new Set(["counter", "shelf", "bed", "table", "rack", "vault", "dentalchair", "crates", "bookshelf", "kitchen", "desk", "sofa", "bedframe"]);
const FOOT: Record<string, [number, number]> = {
  counter: [4, 0.8], shelf: [2, 0.7], bed: [1.4, 2], table: [1.6, 1], rack: [2, 0.6], vault: [2.2, 0.6], dentalchair: [1.4, 1.6],
  crates: [2, 0.8], bookshelf: [2, 0.6], kitchen: [4, 0.8], desk: [2, 0.8], sofa: [2.4, 0.8], bedframe: [1.6, 2],
};

const back = (w: number) => WALL_H + 0.3;

function build(id: string, kind: string): Interior {
  const c = (w: number, color = "#B57A47") => ({ kind: "counter", x: w / 2, z: 3.6, w: 4, color });
  switch (kind) {
    case "pharmacy": return room(id, 12, 9, "tile", "#CBE8D6", "#3FA67A", [c(12, "#E8F2EC"), { kind: "shelf", x: 1.8, z: back(12) + 0.7, v: 1 }, { kind: "shelf", x: 10.2, z: back(12) + 0.7, v: 2 }, { kind: "poster", x: 6, z: 1.2, v: 0 }, { kind: "plant", x: 0.9, z: 8.3 }, { kind: "plant", x: 11.1, z: 8.3 }]);
    case "clinic": return room(id, 13, 9, "tile", "#F3F1EA", "#D2574A", [c(13, "#FFFFFF"), { kind: "bed", x: 1.6, z: 5.6 }, { kind: "bed", x: 11.4, z: 5.6 }, { kind: "poster", x: 6.5, z: 1.2, v: 1 }, { kind: "plant", x: 0.9, z: 8.3 }],
      [{ x: 4, z: 6 }, { x: 9, z: 6 }, { x: 4, z: 7.4 }, { x: 9, z: 7.4 }]);
    case "dental": return room(id, 12, 9, "checker", "#BFD9EC", "#3E6E9E", [c(12, "#FFFFFF"), { kind: "dentalchair", x: 2, z: 6 }, { kind: "poster", x: 6, z: 1.2, v: 2 }, { kind: "plant", x: 11.1, z: 8.3 }],
      [{ x: 5, z: 6 }, { x: 8, z: 6 }, { x: 10, z: 6 }, { x: 5, z: 7.4 }, { x: 8, z: 7.4 }]);
    case "bank": return room(id, 14, 9, "stone", "#E7E2D6", "#5E3A99", [c(14, "#8A5A33"), { kind: "vault", x: 12, z: back(14) + 0.5 }, { kind: "poster", x: 2.4, z: 1.2, v: 3 }, { kind: "plant", x: 0.9, z: 8.3 }, { kind: "plant", x: 13.1, z: 8.3 }, { kind: "rope", x: 7, z: 5 }],
      [{ x: 2.4, z: 5.4 }, { x: 4.4, z: 5.4 }, { x: 9.6, z: 5.4 }, { x: 11.6, z: 5.4 }, { x: 2.4, z: 7.2 }, { x: 4.4, z: 7.2 }, { x: 9.6, z: 7.2 }, { x: 11.6, z: 7.2 }]);
    case "store": return room(id, 14, 9, "wood", "#EADFF7", "#8E5BD0", [c(14, "#5E3A99"), { kind: "rack", x: 2.2, z: back(14) + 0.6, v: 0 }, { kind: "rack", x: 11.8, z: back(14) + 0.6, v: 1 }, { kind: "poster", x: 7, z: 1.2, v: 4 }, { kind: "plant", x: 13.1, z: 8.3 }],
      [{ x: 2.4, z: 5.4 }, { x: 4.4, z: 5.4 }, { x: 9.6, z: 5.4 }, { x: 11.6, z: 5.4 }, { x: 2.4, z: 7.2 }, { x: 4.4, z: 7.2 }, { x: 9.6, z: 7.2 }, { x: 11.6, z: 7.2 }]);
    case "commons": return room(id, 14, 9, "wood", "#F4E1C1", "#E0A526", [{ kind: "kitchen", x: 7, z: 3.6, w: 4 }, { kind: "table", x: 2.6, z: 6.2 }, { kind: "table", x: 11.4, z: 6.2 }, { kind: "poster", x: 2.4, z: 1.2, v: 5 }, { kind: "plant", x: 0.9, z: 8.3 }],
      [{ x: 5.4, z: 6 }, { x: 8.6, z: 6 }, { x: 5.4, z: 7.4 }, { x: 8.6, z: 7.4 }]);
    case "hall": return room(id, 13, 9, "carpet", "#DCE6F0", "#3E6E9E", [{ kind: "desk", x: 6.5, z: 3.6, w: 3 }, { kind: "poster", x: 6.5, z: 1.2, v: 6 }, { kind: "bookshelf", x: 1.8, z: back(13) + 0.6 }, { kind: "flag", x: 11.6, z: 3.2 }, { kind: "plant", x: 0.9, z: 8.3 }]);
    case "market": return room(id, 11, 8, "wood", "#EFE3C8", "#3FA66B", [c(11), { kind: "crates", x: 2, z: 6 }, { kind: "crates", x: 9, z: 6, v: 1 }], []);
    case "bakery": return room(id, 11, 8, "checker", "#F7E8D4", "#C9483A", [c(11, "#C08050"), { kind: "shelf", x: 1.8, z: back(11) + 0.7, v: 3 }, { kind: "table", x: 8.6, z: 6.4 }], []);
    case "florist": return room(id, 11, 8, "tile", "#F9E3EE", "#E07BB0", [c(11, "#FFFFFF"), { kind: "crates", x: 2, z: 6, v: 2 }, { kind: "plant", x: 9, z: 6 }, { kind: "plant", x: 10, z: 6.6 }], []);
    case "library": return room(id, 12, 8, "carpet", "#E3DCCB", "#2F6E46", [{ kind: "desk", x: 6, z: 3.6, w: 3 }, { kind: "bookshelf", x: 2, z: back(12) + 0.6 }, { kind: "bookshelf", x: 10, z: back(12) + 0.6 }, { kind: "table", x: 6, z: 6.2 }], []);
    default: return room(id, 11, 8, "wood", "#F2E3C6", "#8A5A33", [{ kind: "sofa", x: 3, z: 4 }, { kind: "bedframe", x: 9, z: 5 }, { kind: "table", x: 5.5, z: 6.2 }, { kind: "plant", x: 0.9, z: 7.3 }, { kind: "rug", x: 5.5, z: 5.5 }], []);
  }
}

export const INTERIORS: Record<string, Interior> = Object.fromEntries(
  BUILDINGS.filter((b) => b.place).map((b) => [b.id, build(b.id, b.kind.startsWith("cottage") || b.kind === "inn" ? "home" : b.kind)]),
);

export const WALL = WALL_H;
export const doorSpot = (r: Interior) => ({ x: r.w / 2, z: r.h - 0.55 });

export function blockedInside(r: Interior, x: number, z: number) {
  if (x < 0.6 || x > r.w - 0.6 || z < WALL_H + 0.35 || z > r.h - 0.2) return true;
  if (Math.abs(x - r.keeper.x) < 0.5 && Math.abs(z - r.keeper.z) < 0.4) return true;
  for (const s of r.solids) if (x > s.x0 - 0.25 && x < s.x1 + 0.25 && z > s.z0 && z < s.z1 + 0.25) return true;
  for (const p of r.spots) if (Math.hypot(x - p.x, (z - p.z) * 1.4) < 0.5) return true;
  return false;
}
