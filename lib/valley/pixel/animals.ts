import { ball, dataUrl, Grid, shade, type Sprite } from "./draw";

// Chibi animal villagers: big head, round body, stubby legs. One painter handles every species
// from a short description, in four directions with a four-frame walk.

type Ears = "pointy" | "round" | "long" | "side" | "alpaca";
type Tail = "curl" | "bushy" | "fluff" | "stub" | "tuft";
type Look = {
  fur: string; light: string; inner?: string; dark?: string; eye?: string;
  ears: Ears; tail: Tail; snout?: boolean; spots?: string; antlers?: boolean; horns?: boolean; mask?: boolean; tuft?: boolean;
};
export type Outfit = { scarf?: string; body?: string; hat?: "chef" | "cap"; hatColor?: string; glasses?: boolean; badge?: string };
export type Dir = "down" | "up" | "left" | "right";

const LOOKS: Record<string, Look> = {
  shiba: { fur: "#E39A4B", light: "#FFF2DE", inner: "#F7C3A0", ears: "pointy", tail: "curl" },
  fox: { fur: "#EC7432", light: "#FFF7EC", dark: "#4A322A", ears: "pointy", tail: "bushy" },
  husky: { fur: "#7F8AA0", light: "#F5F7FB", inner: "#D9DEE8", eye: "#3E8ED0", ears: "pointy", tail: "fluff", mask: true },
  deer: { fur: "#BD7B4B", light: "#F4DEC2", inner: "#F2B8A8", ears: "side", tail: "stub", snout: true, spots: "#FBEBD5", antlers: true },
  cow: { fur: "#F8F4EC", light: "#F4BDBD", inner: "#F4BDBD", ears: "side", tail: "tuft", snout: true, spots: "#3B3533", horns: true },
  alpaca: { fur: "#F2E2C4", light: "#FFF9EE", inner: "#E8C9A8", ears: "alpaca", tail: "stub", snout: true, tuft: true },
  bear: { fur: "#9A6440", light: "#E8CBA6", inner: "#E8CBA6", ears: "round", tail: "stub" },
  cat: { fur: "#A3A1AE", light: "#F3F2F6", inner: "#F3B9C4", ears: "pointy", tail: "curl" },
  rabbit: { fur: "#F5F0E8", light: "#FFFFFF", inner: "#F6BFCB", ears: "long", tail: "stub" },
};

const W = 20, H = 24, CX = 10, HY0 = 9, BY0 = 17, LY = 20;
const NOSE = "#3A2420", BLUSH = "#F59A9A";

function earsFront(g: Grid, L: Look, hy: number, behind: boolean) {
  const m = (x: number) => 2 * CX - x;
  const fur = L.fur, inner = L.inner ?? L.light;
  if (L.ears === "pointy") {
    for (const s of [1, -1]) {
      const X = (x: number) => (s === 1 ? x : m(x));
      g.tri([X(CX - 5.6), hy - 1.5], [X(CX - 4.6), hy - 8], [X(CX - 1.2), hy - 4], fur);
      if (L.dark) for (let y = hy - 9; y < hy - 6; y++) for (let x = 0; x < W; x++) if (g.get(x, y) === fur) g.set(x, y, L.dark);
      if (!behind) continue;
      g.tri([X(CX - 4.7), hy - 3], [X(CX - 4.4), hy - 6.4], [X(CX - 2.5), hy - 4], inner);
    }
  }
  if (L.ears === "round") for (const x of [CX - 4.3, m(CX - 4.3)]) { g.ellipse(x, hy - 4.2, 2.3, 2.3, ball(fur)); if (behind) g.ellipse(x, hy - 4.2, 1.1, 1.1, inner); }
  if (L.ears === "long") for (const x of [CX - 2.6, m(CX - 2.6)]) { g.ellipse(x, hy - 7.5, 1.6, 4.2, ball(fur)); if (behind) g.ellipse(x, hy - 7, 0.7, 3, inner); }
  if (L.ears === "side") for (const s of [1, -1]) { const x = s === 1 ? CX - 6.6 : m(CX - 6.6); g.ellipse(x, hy - 1.6, 2.5, 1.3, fur); g.ellipse(x - s * 0.3, hy - 1.6, 1.3, 0.6, inner); }
  if (L.ears === "alpaca") for (const x of [CX - 3.6, m(CX - 3.6)]) g.ellipse(x, hy - 6.6, 1.3, 2.8, ball(fur));
}

function hornsFront(g: Grid, L: Look, hy: number) {
  const m = (x: number) => 2 * CX - x;
  if (L.antlers) {
    const c = "#E6CE9C";
    g.line(CX - 3, hy - 4, CX - 5, hy - 9, c); g.line(CX - 4, hy - 7, CX - 7, hy - 8, c);
    g.line(m(CX - 3) - 1, hy - 4, m(CX - 5) - 1, hy - 9, c); g.line(m(CX - 4) - 1, hy - 7, m(CX - 7) - 1, hy - 8, c);
  }
  if (L.horns) { const c = "#F0E2B6"; g.rect(CX - 5, hy - 6, 2, 2, c); g.set(CX - 6, hy - 7, c); g.rect(CX + 3, hy - 6, 2, 2, c); g.set(CX + 5, hy - 7, c); }
}

function hat(g: Grid, o: Outfit, hy: number, dir: Dir) {
  if (o.hat === "chef") { g.ellipse(CX, hy - 7.2, 4.2, 2.8, ball("#FFFFFF", 0.12)); g.rect(CX - 3, hy - 5.5, 6, 2, "#F1EEE8"); }
  if (o.hat === "cap") {
    const c = o.hatColor ?? "#3E8ED0";
    g.ellipse(CX, hy - 3.8, 5.2, 2.4, ball(c));
    if (dir === "down") g.rect(CX - 4, hy - 2, 8, 1, shade(c, -0.25));
    if (dir === "left") g.rect(CX - 6, hy - 2, 5, 1, shade(c, -0.25));
  }
}

function paint(L: Look, o: Outfit, dir: "down" | "up" | "left", frame: number) {
  const g = new Grid(W, H);
  const bob = frame % 2 === 1 ? -1 : 0;
  const hy = HY0 + bob, by = BY0 + bob;
  const fur = L.fur, bodyC = o.body ?? fur, legC = L.dark ?? shade(fur, -0.22), eye = L.eye ?? "#2B1B17";
  const eyeAt = (x: number, y: number) => { g.rect(x, y, 2, 2, eye); g.set(x, y, "#FFFFFF"); };

  if (dir === "down") {
    if (L.tail === "bushy") { g.ellipse(CX + 5.6, by - 1.5, 2.6, 3.2, ball(fur)); g.ellipse(CX + 6.4, by - 4, 1.5, 1.3, L.light); }
    if (L.tail === "fluff") g.ellipse(CX + 5.2, by - 1.5, 2.1, 2.6, ball(fur));
    if (L.tail === "curl") g.ellipse(CX + 5, by - 2, 1.8, 1.8, ball(fur));
    hornsFront(g, L, hy);
    earsFront(g, L, hy, true);
    g.rect(CX - 3, LY, 2, frame === 1 ? 1 : 2, legC);
    g.rect(CX + 1, LY, 2, frame === 3 ? 1 : 2, legC);
    g.ellipse(CX, by, 4.3, 3.6, ball(bodyC));
    if (!o.body) g.ellipse(CX, by + 0.9, 2.5, 2.2, L.light);
    if (L.spots && !o.body) { g.ellipse(CX - 2.4, by - 1, 1.3, 1.1, L.spots); g.ellipse(CX + 2.6, by + 1, 1.1, 1, L.spots); }
    if (o.badge) { g.rect(CX + 1, by - 1, 3, 1, o.badge); g.rect(CX + 2, by - 2, 1, 3, o.badge); }
    g.rect(CX - 5, by - 1 + (frame === 1 ? -1 : 0), 1, 2, shade(bodyC, -0.15));
    g.rect(CX + 4, by - 1 + (frame === 3 ? -1 : 0), 1, 2, shade(bodyC, -0.15));
    if (o.scarf) { g.rect(CX - 4, hy + 4, 8, 2, o.scarf); g.rect(CX + 1, hy + 6, 2, 2, shade(o.scarf, -0.2)); }
    g.ellipse(CX, hy, 5.6, 5, (nx, ny) => {
      if (L.mask && (ny > 0.05 || (Math.abs(nx) < 0.16 && ny > -0.75))) return ny > 0.55 ? shade(L.light, -0.1) : L.light;
      return ball(fur)(nx, ny);
    });
    if (!L.mask) g.ellipse(CX, hy + 2.7, L.snout ? 3.6 : 3.1, L.snout ? 2.2 : 2, L.light);
    if (L.spots && L.horns) g.ellipse(CX + 3, hy - 3, 1.7, 1.3, L.spots);
    if (L.tuft) g.ellipse(CX, hy - 4.4, 3.3, 2.2, ball(L.light, 0.12, 0.1));
    if (L.ears === "side" || L.ears === "alpaca") earsFront(g, L, hy, false);
    eyeAt(CX - 4, hy - 1); eyeAt(CX + 2, hy - 1);
    g.rect(CX - 1, hy + 2, 2, 1, NOSE);
    g.set(CX - 5, hy + 1, BLUSH); g.set(CX + 4, hy + 1, BLUSH);
    if (o.glasses) {
      const f = "#3A2A50";
      for (const x of [CX - 5, CX + 1]) { g.rect(x, hy - 2, 4, 1, f); g.rect(x, hy + 1, 4, 1, f); g.set(x, hy - 1, f); g.set(x, hy, f); g.set(x + 3, hy - 1, f); g.set(x + 3, hy, f); }
      g.rect(CX - 1, hy - 1, 2, 1, f);
    }
  }

  if (dir === "up") {
    g.rect(CX - 3, LY, 2, frame === 1 ? 1 : 2, legC);
    g.rect(CX + 1, LY, 2, frame === 3 ? 1 : 2, legC);
    g.ellipse(CX, by, 4.3, 3.6, ball(bodyC));
    if (L.spots && !o.body) g.ellipse(CX + 1.6, by - 0.6, 1.4, 1.1, L.spots);
    g.rect(CX - 5, by - 1 + (frame === 3 ? -1 : 0), 1, 2, shade(bodyC, -0.15));
    g.rect(CX + 4, by - 1 + (frame === 1 ? -1 : 0), 1, 2, shade(bodyC, -0.15));
    if (L.tail === "curl") { g.ellipse(CX, by + 0.5, 2, 1.9, ball(fur)); g.set(CX, by, L.light); }
    if (L.tail === "bushy") { g.ellipse(CX + 0.6, by + 1, 2.6, 3, ball(fur)); g.ellipse(CX + 0.8, by + 3.2, 1.6, 1.1, L.light); }
    if (L.tail === "fluff") g.ellipse(CX, by + 1, 2.2, 2.4, ball(fur));
    if (L.tail === "stub") g.ellipse(CX, by + 1.8, 1.4, 1.1, L.light);
    if (L.tail === "tuft") { g.line(CX, by, CX + 1, by + 3, shade(fur, -0.2)); g.rect(CX, by + 3, 2, 2, "#3B3533"); }
    if (o.scarf) g.rect(CX - 4, hy + 4, 8, 2, o.scarf);
    hornsFront(g, L, hy);
    g.ellipse(CX, hy, 5.6, 5, ball(fur));
    if (L.spots && L.horns) g.ellipse(CX - 2, hy - 1, 1.8, 1.4, L.spots);
    if (L.tuft) g.ellipse(CX, hy - 4.4, 3.3, 2.2, ball(L.light, 0.12, 0.1));
    earsFront(g, { ...L, inner: fur }, hy, false);
  }

  if (dir === "left") {
    const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    if (L.tail === "bushy") { g.ellipse(CX + 6.2, by - 1.6, 2.7, 2.4, ball(fur)); g.ellipse(CX + 7.8, by - 2.6, 1.4, 1.3, L.light); }
    if (L.tail === "curl") g.ellipse(CX + 5.6, by - 2.4, 1.9, 1.9, ball(fur));
    if (L.tail === "fluff") g.ellipse(CX + 5.8, by - 1.5, 2.2, 2.2, ball(fur));
    if (L.tail === "stub") g.ellipse(CX + 5.2, by - 1, 1.3, 1.1, L.light);
    if (L.tail === "tuft") { g.line(CX + 4.5, by - 1, CX + 6.5, by + 1.5, shade(fur, -0.2)); g.rect(CX + 6, by + 1, 2, 2, "#3B3533"); }
    g.rect(CX - 3 - step, LY, 2, 2, legC);
    g.rect(CX + 2 + step, LY, 2, 2, legC);
    g.ellipse(CX + 1, by, 4.6, 3.4, ball(bodyC));
    if (!o.body) g.ellipse(CX + 0.5, by + 1.4, 2.6, 1.5, L.light);
    if (L.spots && !o.body) g.ellipse(CX + 2.6, by - 1, 1.4, 1.1, L.spots);
    g.rect(CX - 2 - step, by, 2, 2, shade(bodyC, -0.15));
    if (o.scarf) { g.rect(CX - 3, hy + 4, 6, 2, o.scarf); g.rect(CX + 2, hy + 5, 2, 3, shade(o.scarf, -0.2)); }
    if (L.antlers) { const c = "#E6CE9C"; g.line(CX + 1, hy - 4, CX + 2, hy - 9, c); g.line(CX + 1, hy - 7, CX - 1, hy - 8, c); }
    if (L.horns) { g.rect(CX + 1, hy - 6, 2, 2, "#F0E2B6"); g.set(CX + 2, hy - 7, "#F0E2B6"); }
    const earC = L.fur;
    if (L.ears === "pointy") { g.tri([CX + 0.4, hy - 3], [CX + 1.8, hy - 8.6], [CX + 4, hy - 3.6], earC); if (L.dark) for (let y = hy - 9; y < hy - 6; y++) for (let x = 0; x < W; x++) if (g.get(x, y) === earC) g.set(x, y, L.dark); }
    if (L.ears === "round") g.ellipse(CX + 2, hy - 4.2, 2.3, 2.3, ball(earC));
    if (L.ears === "long") g.ellipse(CX + 1.6, hy - 7.5, 1.6, 4.2, ball(earC));
    if (L.ears === "alpaca") g.ellipse(CX + 1.5, hy - 6.6, 1.3, 2.8, ball(earC));
    g.ellipse(CX + 0.5, hy, 5.2, 5, (nx, ny) => (L.mask && ny > 0.1 ? L.light : ball(fur)(nx, ny)));
    const sx = L.snout ? 2.9 : 2.3;
    g.ellipse(CX - 4.2, hy + 1.7, sx, 1.9, L.light);
    g.rect(Math.floor(CX - 4.2 - sx), hy + 1, 1, 1, NOSE);
    if (L.ears === "side") { g.ellipse(CX + 4.2, hy - 1.4, 2.5, 1.3, earC); g.ellipse(CX + 4.4, hy - 1.4, 1.3, 0.6, L.inner ?? L.light); }
    if (L.spots && L.horns) g.ellipse(CX + 3, hy - 2.6, 1.6, 1.3, L.spots);
    if (L.tuft) g.ellipse(CX + 0.8, hy - 4.4, 3, 2.1, ball(L.light, 0.12, 0.1));
    eyeAt(CX - 3, hy - 1);
    g.set(CX - 1, hy + 2, BLUSH);
    if (o.glasses) { const f = "#3A2A50"; g.rect(CX - 4, hy - 2, 4, 1, f); g.rect(CX - 4, hy + 1, 4, 1, f); g.set(CX - 4, hy - 1, f); g.set(CX - 4, hy, f); g.line(CX - 1, hy - 2, CX + 3, hy - 2, f); }
  }
  hat(g, o, hy, dir);
  return g.outline();
}

export type Frames = Record<Dir, Sprite[]>;
const cache = new Map<string, Frames>();

export function animalFrames(species: string, outfit: Outfit = {}): Frames {
  const key = species + JSON.stringify(outfit);
  const hit = cache.get(key);
  if (hit) return hit;
  const L = LOOKS[species] ?? LOOKS.shiba;
  const f = (dir: "down" | "up" | "left") => [0, 1, 2, 3].map((i) => paint(L, outfit, dir, i));
  const left = f("left");
  const out: Frames = {
    down: f("down").map((g) => g.sprite(CX, H - 2)),
    up: f("up").map((g) => g.sprite(CX, H - 2)),
    left: left.map((g) => g.sprite(CX, H - 2)),
    right: left.map((g) => g.mirror().sprite(CX, H - 2)),
  };
  cache.set(key, out);
  return out;
}

// Avatars farmers can pick. Ids match the server's list.
export const AVATARS = [
  { id: "ShibaInu", species: "shiba", label: "Shiba" },
  { id: "Fox", species: "fox", label: "Fox" },
  { id: "Husky", species: "husky", label: "Husky" },
  { id: "Deer", species: "deer", label: "Deer" },
  { id: "Cow", species: "cow", label: "Cow" },
] as const;

export const speciesOf = (avatar: string) => AVATARS.find((a) => a.id === avatar)?.species ?? "shiba";

export function portrait(avatar: string, scarf = "#E2574C") {
  return dataUrl(animalFrames(speciesOf(avatar), { scarf }).down[0], 4);
}
