import { ball, Grid, hash, mix, shade, type Sprite } from "./draw";

// Buildings, trees, crops and props, all painted in code at 16px per tile.

// ---------- icons for shop signs (7x7) ----------
const ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  cross: { rows: ["..rrr..", "..rrr..", "rrrrrrr", "rrrrrrr", "rrrrrrr", "..rrr..", "..rrr.."], pal: { r: "#E04848" } },
  tooth: { rows: [".wwwww.", "wwwwwww", "wwwwwbw", "wwwwwbw", ".ww.ww.", ".ww.ww.", ".w...w."], pal: { w: "#FFFFFF", b: "#BFD8EE" } },
  pill: { rows: ["...rr..", "..rrrr.", "..rrrr.", "..wwww.", "..wwww.", "...ww..", "......."], pal: { r: "#E04848", w: "#FFFFFF" } },
  coin: { rows: ["..yyy..", ".yYYYy.", "yYyyyYy", "yYyYyYy", "yYyyyYy", ".yYYYy.", "..yyy.."], pal: { y: "#E9A93A", Y: "#FFE07A" } },
  plane: { rows: ["...w...", "...w...", ".wwwww.", "wwwwwww", "...w...", "..www..", "......."], pal: { w: "#FFFFFF" } },
  food: { rows: ["w.w..w.", "w.w.ww.", "www.ww.", ".w..ww.", ".w...w.", ".w...w.", ".w...w."], pal: { w: "#FFFFFF" } },
  calendar: { rows: ["rrrrrrr", "rwrrrwr", "wwwwwww", "wkwkwkw", "wwwwwww", "wkwkwrw", "wwwwwww"], pal: { r: "#E04848", w: "#FFFFFF", k: "#6B6B7A" } },
  bread: { rows: [".......", "..ooo..", ".oOOOo.", "oOoOoOo", "ooooooo", ".......", "......."], pal: { o: "#C9822E", O: "#F2C27A" } },
  flower: { rows: ["..p.p..", ".ppppp.", "..pyp..", ".ppppp.", "..p.p..", "...g...", "..ggg.."], pal: { p: "#F06C8B", y: "#FFD45A", g: "#4E9D45" } },
  book: { rows: [".......", "bbb.ggg", "bwb.gwg", "bwb.gwg", "bbb.ggg", "bbbbggg", "......."], pal: { b: "#3E6E9E", g: "#3FA66B", w: "#FFFFFF" } },
  card: { rows: [".......", "ppppppp", "kkkkkkk", "ppppppp", "pppyypp", "ppppppp", "......."], pal: { p: "#8E5BD0", k: "#2F2340", y: "#FFD45A" } },
};

// ---------- buildings ----------
type Wall = "plaster" | "wood" | "brick" | "stone" | "white" | "blue" | "mint" | "cream";
export type BuildingStyle = {
  wall: Wall; roof: string; door: string; icon?: string; iconBg?: string; awning?: [string, string];
  columns?: boolean; chimney?: boolean; tower?: boolean; tall?: boolean; flowers?: boolean;
};

const WALL_BASE: Record<Wall, string> = {
  plaster: "#F2E3C6", wood: "#BE8350", brick: "#B95A40", stone: "#B9B3A6", white: "#F3F1EA", blue: "#BFD9EC", mint: "#CBE8D6", cream: "#F4E9CF",
};

function wallPixel(style: Wall, x: number, y: number, W: number, WH: number) {
  const base = WALL_BASE[style];
  const n = (hash(x * 0.37, y * 0.71) - 0.5) * 0.06;
  let c = n > 0 ? shade(base, n) : shade(base, n);
  if (style === "wood") {
    const row = Math.floor(y / 5);
    if (y % 5 === 4) c = shade(base, -0.3);
    else if ((x + row * 9) % 26 === 0) c = shade(base, -0.22);
    else c = shade(base, (hash(row, 3) - 0.5) * 0.14);
  }
  if (style === "brick") {
    const row = Math.floor(y / 4), off = (row % 2) * 4;
    if (y % 4 === 3 || (x + off) % 8 === 7) c = "#D9A784";
    else c = shade(base, (hash(Math.floor((x + off) / 8), row) - 0.5) * 0.18);
  }
  if (style === "stone") {
    const row = Math.floor(y / 6), off = (row % 2) * 5;
    if (y % 6 === 5 || (x + off) % 10 === 9) c = shade(base, -0.28);
    else c = shade(base, (hash(Math.floor((x + off) / 10), row) - 0.5) * 0.16 + ((x + off) % 10 === 0 || y % 6 === 0 ? 0.12 : 0));
  }
  if (style === "plaster" && (x < 2 || x >= W - 2 || (y >= Math.floor(WH * 0.42) && y < Math.floor(WH * 0.42) + 2))) c = "#7A4E2D";
  if (x >= W - 2) c = shade(c, -0.14);
  if (x < 1) c = shade(c, 0.1);
  return c;
}

export type BuildingArt = { spr: Sprite; windows: { x: number; y: number; w: number; h: number }[] };

export function building(widthTiles: number, s: BuildingStyle): BuildingArt {
  const Wd = widthTiles * 16;
  const WH = s.tall ? 40 : 31;
  const RH = Math.round(Wd * 0.26) + 12;
  const TM = s.tower ? 22 : s.chimney ? 6 : 1;
  const ox = 5;
  const g = new Grid(Wd + 10, TM + RH + WH + 2);
  const wy = TM + RH - 2; // wall top (hidden under the eave)
  const windows: BuildingArt["windows"] = [];
  const cx = ox + Wd / 2;

  // walls
  g.rect(ox, wy, Wd, WH, (x, y) => wallPixel(s.wall, x, y, Wd, WH));
  g.rect(ox, wy + WH - 3, Wd, 3, (x, y) => (y === 0 ? "#6F6A62" : (x + y * 3) % 7 === 0 ? "#6F6A62" : "#8D877C"));

  // awning
  if (s.awning) {
    for (let x = 0; x < Wd + 2; x++) for (let y = 0; y < 6 + ((x % 6) < 3 ? 1 : 0); y++) g.set(ox - 1 + x, wy + 2 + y, Math.floor(x / 6) % 2 ? s.awning[1] : shade(s.awning[0], y > 4 ? -0.2 : 0));
  }

  // columns
  if (s.columns) {
    const n = Math.max(2, widthTiles - 1);
    for (let i = 0; i < n; i++) {
      const x = Math.round(ox + 4 + (i * (Wd - 12)) / (n - 1));
      if (Math.abs(x + 2 - cx) < 9) continue;
      g.rect(x, wy + 3, 4, WH - 6, (xx) => (xx === 0 ? "#FFFFFF" : xx === 3 ? "#CFC8B8" : "#EFEBE0"));
      g.rect(x - 1, wy + 3, 6, 2, "#E2DCCD");
      g.rect(x - 1, wy + WH - 5, 6, 2, "#E2DCCD");
    }
  }

  // windows
  const doorW = 12, doorH = 18;
  const nWin = Math.max(1, Math.floor((Wd - doorW - 8) / 22));
  const slots: number[] = [];
  const half = Math.ceil(nWin / 2);
  for (let i = 0; i < half; i++) slots.push(ox + 6 + i * 22, ox + Wd - 16 - i * 22);
  if (!s.columns)
    for (const x of slots.slice(0, nWin + (nWin % 2))) {
      if (Math.abs(x + 5 - cx) < doorW) continue;
      const y = wy + (s.awning ? 11 : 8) + (s.tall ? 4 : 0);
      g.rect(x - 1, y - 1, 12, 12, "#F4EBDA");
      g.rect(x, y, 10, 10, (xx, yy) => ((xx + yy) % 7 === 0 && yy < 6 ? "#E3F4FF" : yy < 4 ? "#A7D8F2" : "#78B7DD"));
      g.rect(x + 4, y, 2, 10, "#F4EBDA");
      g.rect(x, y + 4, 10, 1, "#F4EBDA");
      windows.push({ x, y, w: 10, h: 10 });
      if (s.flowers) {
        g.rect(x - 1, y + 11, 12, 3, "#8A5A33");
        for (let i = 0; i < 6; i++) g.set(x + i * 2, y + 10, ["#F06C8B", "#FFD45A", "#FFFFFF"][i % 3]);
      } else g.rect(x - 2, y + 11, 14, 2, "#E0D3B8");
    }

  // door
  const dx = Math.round(cx - doorW / 2), dy = wy + WH - doorH;
  g.rect(dx - 2, dy - 2, doorW + 4, doorH + 2, "#F4EBDA");
  g.rect(dx, dy, doorW, doorH, (x, y) => (x === 5 || x === 6 ? shade(s.door, -0.25) : y < 7 && (x === 2 || x === 9) ? shade(s.door, 0.2) : s.door));
  if (s.icon === "plane" || s.icon === "card" || s.icon === "coin") g.rect(dx + 2, dy + 2, 8, 6, "#A7D8F2");
  g.rect(dx + 8, dy + 9, 2, 2, "#FFD45A");
  g.rect(dx - 3, wy + WH - 1, doorW + 6, 1, "#9C968A");

  // sign over the door
  if (s.icon) {
    const sx = Math.round(cx - 6), sy = dy - 13;
    g.rect(sx, sy, 12, 11, s.iconBg ?? "#8A5A33");
    g.rect(sx, sy, 12, 1, shade(s.iconBg ?? "#8A5A33", 0.2));
    const ic = ICONS[s.icon];
    if (ic) g.stamp(sx + 2, sy + 2, ic.rows, ic.pal);
  }

  // roof: shingle rows, narrowing toward the ridge, lit from the left
  for (let y = 0; y < RH; y++) {
    const inset = Math.round((RH - 1 - y) * 0.1);
    for (let x = ox - 4 + inset; x <= ox + Wd + 3 - inset; x++) {
      const row = Math.floor(y / 4), u = x + (row % 2) * 3;
      let c = s.roof;
      if (y % 4 === 3) c = shade(s.roof, -0.24);
      else if (u % 6 === 0) c = shade(s.roof, -0.13);
      else if (y % 4 === 0) c = shade(s.roof, 0.1);
      if (y < 3) c = shade(s.roof, 0.28);
      if (y >= RH - 3) c = shade(s.roof, -0.36);
      if (x - (ox - 4 + inset) < 2) c = shade(c, 0.12);
      if (ox + Wd + 3 - inset - x < 2) c = shade(c, -0.15);
      g.set(x, TM + y, c);
    }
  }
  if (s.chimney) {
    const x = ox + Wd - 20;
    g.rect(x, TM - 5, 7, 12, (xx, yy) => (yy % 3 === 2 || (xx + Math.floor(yy / 3)) % 4 === 0 ? "#8E4636" : "#B5573F"));
    g.rect(x - 1, TM - 6, 9, 2, "#6F6A62");
  }
  if (s.tower) {
    const tw = 18, tx = Math.round(cx - tw / 2);
    g.rect(tx, 8, tw, TM + 8, (x, y) => wallPixel("stone", x, y, tw, 30));
    for (let y = 0; y < 9; y++) { const hw = Math.round((y + 1) * 1.25); g.rect(Math.round(cx) - hw, y, hw * 2, 1, y === 8 ? shade(s.roof, -0.3) : shade(s.roof, y < 3 ? 0.2 : 0)); }
    g.ellipse(cx, 16, 4.5, 4.5, "#FFF8E8");
    g.line(cx, 16, cx, 13, "#3A2A50"); g.line(cx, 16, cx + 2, 16, "#3A2A50");
  }
  g.outline(0.55);
  return { spr: g.sprite(Math.round(cx), TM + RH + WH - 2), windows };
}

// ---------- trees ----------
export function tree(kind: "oak" | "autumn" | "gold" | "pine" | "apple" | "red", seed = 0): Sprite {
  const g = new Grid(34, 44);
  const trunk = "#7A4E2D";
  g.rect(14, 30, 6, 12, (x) => (x === 0 ? shade(trunk, 0.15) : x >= 4 ? shade(trunk, -0.2) : trunk));
  g.rect(12, 40, 2, 2, shade(trunk, -0.1)); g.rect(20, 40, 2, 2, shade(trunk, -0.1));
  if (kind === "pine") {
    const c = "#3E8452";
    for (const [y, w] of [[30, 13], [22, 11], [14, 8], [7, 5]] as const)
      for (let j = 0; j < 10; j++) { const hw = Math.round((w * (j + 1)) / 10); g.rect(17 - hw, y - 10 + j + 4, hw * 2, 1, j > 7 ? shade(c, -0.25) : (j + y) % 3 ? c : shade(c, 0.12)); }
    return g.outline().sprite(17, 41);
  }
  const base = { oak: "#5BAA4A", autumn: "#E38A31", gold: "#E9BC3C", apple: "#5BAA4A", red: "#D0563C" }[kind];
  const blobs: [number, number, number][] = [[17, 15, 11], [9, 20, 7.5], [25, 20, 7.5], [17, 8, 7.5], [11, 11, 6], [23, 11, 6], [17, 23, 8]];
  for (const [x, y, r] of blobs) g.ellipse(x, y, r, r * 0.92, (nx, ny, px, py) => {
    const l = -(px - 13) * 0.05 - (py - 9) * 0.06;
    const n = hash(px + seed, py) * 0.5;
    if (l + n > 0.75) return shade(base, 0.24);
    if (l + n < -0.55) return shade(base, -0.3);
    if (l + n < -0.15) return shade(base, -0.13);
    return base;
  });
  if (kind === "apple") for (let i = 0; i < 7; i++) { const x = 8 + Math.floor(hash(i, seed + 1) * 18), y = 8 + Math.floor(hash(seed + 2, i) * 16); g.rect(x, y, 2, 2, "#E04848"); g.set(x, y, "#FF9A8A"); }
  return g.outline().sprite(17, 41);
}

export function bush(color = "#4E9D45", berries?: string): Sprite {
  const g = new Grid(20, 16);
  g.ellipse(6, 9, 5.5, 5, ball(color)); g.ellipse(14, 9, 5.5, 5, ball(color)); g.ellipse(10, 6, 6, 5, ball(color));
  if (berries) for (const [x, y] of [[5, 7], [10, 4], [14, 9], [8, 11], [13, 5]]) g.set(x, y, berries);
  return g.outline().sprite(10, 14);
}

export function rock(): Sprite {
  const g = new Grid(16, 12);
  g.ellipse(8, 7, 6.5, 4.5, ball("#9C98A0"));
  g.set(6, 5, "#C9C5CC");
  return g.outline().sprite(8, 10);
}

// ---------- crops ----------
const LEAF = "#5BAA4A";
const wilted = (c: string, w: number) => mix(c, "#A08A3C", w * 0.75);

export function crop(category: string, wilt: number, harvested: boolean): Sprite {
  const g = new Grid(18, 26);
  const leaf = wilted(LEAF, wilt);
  g.ellipse(9, 23, 5.5, 1.7, "#6E4428");
  if (harvested) {
    g.line(9, 23, 9, 19, LEAF); g.rect(6, 18, 3, 2, LEAF); g.rect(10, 17, 3, 2, shade(LEAF, 0.2));
    return g.outline().sprite(9, 24);
  }
  const droop = wilt * 3;
  if (category === "deductible") {
    for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) {
      for (let t = 0; t < 12; t++) {
        const x = 9 + Math.sin(a) * t * 0.75, y = 22 - Math.cos(a) * t * 0.95 + (droop * t * t) / 60;
        g.set(x, y, shade(leaf, -0.15));
        if (t % 2 === 0 && t > 1) { g.set(x - 1, y, leaf); g.set(x + 1, y, shade(leaf, 0.15)); }
      }
    }
    g.rect(6, 12, 6, 7, "#FFFDF4"); g.rect(6, 12, 6, 2, "#D2413A"); g.rect(7, 15, 4, 1, "#B9B4A8"); g.rect(7, 17, 3, 1, "#B9B4A8");
  }
  if (category === "dental") {
    g.ellipse(5, 20, 3, 1.3, leaf); g.ellipse(13, 20, 3, 1.3, shade(leaf, 0.1));
    const tips: [number, number][] = [[4, 11 + droop], [9, 7 + droop], [14, 12 + droop]];
    for (const [x, y] of tips) g.line(9, 22, x, y + 4, shade(leaf, -0.1));
    for (const [x, y] of tips) g.stamp(Math.round(x) - 2, Math.round(y), [".www.", "wwwwb", "wwwwb", "ww.wb", "w...w"], { w: "#FFFFFF", b: "#BFD8EE" });
  }
  if (category === "dining") {
    g.rect(8, 5 + droop, 2, 18 - droop, leaf);
    g.line(9, 17, 3, 12 + droop, shade(leaf, 0.12)); g.line(9, 14, 15, 9 + droop, leaf); g.line(9, 20, 15, 16 + droop, shade(leaf, -0.1));
    for (const [x, y, ry] of [[11.5, 11 + droop, 3.4], [6, 14 + droop, 3]] as const) {
      g.ellipse(x, y, 1.9, ry, (nx, ny, px, py) => ((px + py) % 2 ? wilted("#F3C53D", wilt) : wilted("#FFE27A", wilt)));
      g.set(x, y + ry, leaf); g.set(x - 1, y + ry - 1, leaf);
    }
    g.rect(8, 3 + droop, 1, 2, "#E9BC3C"); g.rect(10, 3 + droop, 1, 2, "#E9BC3C");
  }
  if (category === "fsa") {
    g.ellipse(4, 19, 3.2, 2, leaf); g.ellipse(14, 18, 3.2, 2, shade(leaf, 0.1));
    const o = wilted("#EE8A2E", wilt);
    g.ellipse(9, 18.5 + droop * 0.3, 6, 4.4, (nx, ny) => (Math.abs(Math.abs(nx) - 0.42) < 0.12 ? shade(o, -0.2) : ball(o)(nx, ny)));
    g.rect(8, 12, 2, 3, "#6E8B3D"); g.set(10, 12, leaf); g.set(11, 11, leaf);
  }
  if (category === "card_credit") {
    g.ellipse(9, 18, 6, 4.5, ball(leaf));
    for (const [x, y, c] of [[5, 14, "#F39A2E"], [11, 12, "#FFC53D"], [8, 18, "#FFC53D"], [13, 17, "#F39A2E"], [4, 19, "#FFC53D"]] as const) {
      const cc = wilted(c, wilt);
      g.ellipse(x, y + droop * 0.5, 1.8, 1.8, ball(cc)); g.set(x, y + droop * 0.5, shade(cc, -0.3));
    }
  }
  if (category === "tax_window") {
    g.rect(8, 12, 2, 11, "#8A5A33");
    g.rect(3, 3, 12, 10, "#FFFDF4"); g.rect(3, 3, 12, 3, "#D2413A");
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.set(5 + i * 2.5, 8 + j * 2.5, "#8C8798");
    g.rect(12, 10, 2, 2, "#D2413A");
  }
  const extra = EXTRA_CROPS[category];
  if (extra) paintExtra(g, extra[0], wilted(extra[1], wilt), leaf, droop);
  return g.outline().sprite(9, 24);
}

// Crops for findings from bank and card statements: a shape and a bloom color each.
const EXTRA_CROPS: Record<string, [string, string]> = {
  bank_bonus: ["bean", "#E9BC3C"], bank_fee: ["bulb", "#C8A8F0"], idle_cash: ["flower", "#7C8CE0"], annual_fee: ["thistle", "#B48CF0"],
  credit_move: ["bean", "#7CC46B"], dispute: ["daisy", "#FFFFFF"], rotating: ["clover", "#5BAA4A"], price_adjust: ["bush", "#7FE3C0"],
  fsa_claim: ["bush", "#E04870"], promo_apr: ["bean", "#E04848"], subscription: ["bulb", "#E04848"], points: ["flower", "#F06C3B"], insurance: ["flower", "#F49AC8"],
};

function paintExtra(g: Grid, shape: string, c: string, leaf: string, droop: number) {
  if (shape === "flower" || shape === "thistle") {
    g.line(9, 22, 9, 9 + droop, shade(leaf, -0.1));
    g.ellipse(6, 17, 2.6, 1.2, leaf); g.ellipse(12, 15, 2.6, 1.2, shade(leaf, 0.1));
    if (shape === "thistle") { g.ellipse(9, 7 + droop, 3, 3.4, ball(c)); g.rect(7, 10 + droop, 5, 2, leaf); }
    else { for (const [dx, dy] of [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]]) g.ellipse(9 + dx, 8 + droop + dy, 2.2, 2.2, ball(c)); g.ellipse(9, 8 + droop, 1.4, 1.4, "#FFD45A"); }
  }
  if (shape === "daisy") for (const [x, y] of [[6, 10], [12, 8]] as const) {
    g.line(9, 22, x, y + 3 + droop, shade(leaf, -0.1));
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) g.ellipse(x + dx, y + droop + dy, 1.6, 1.6, c);
    g.ellipse(x, y + droop, 1.2, 1.2, "#F6B93B");
  }
  if (shape === "bulb") {
    for (const dx of [-3, 0, 3]) g.line(9, 18, 9 + dx, 8 + droop + Math.abs(dx), dx ? leaf : shade(leaf, 0.12));
    g.ellipse(9, 20, 4, 3, ball(c));
  }
  if (shape === "clover") for (const [x, y] of [[5, 17], [12, 15], [9, 11]] as const) {
    g.line(9, 22, x, y + 2, shade(leaf, -0.1));
    for (const [dx, dy] of [[-1.6, 0], [1.6, 0], [0, -1.6]]) g.ellipse(x + dx, y + droop * 0.5 + dy, 1.6, 1.6, ball(c));
  }
  if (shape === "bean") {
    g.rect(8, 4, 2, 19, "#A86A3C");
    for (let y = 6; y < 21; y += 3) { g.ellipse(y % 2 ? 6 : 12, y + droop * 0.4, 2, 1.2, leaf); }
    for (const [x, y] of [[11, 9], [6, 13], [11, 17]] as const) g.rect(x, y + droop * 0.4, 2, 4, ball(c) as never), g.rect(x, y + droop * 0.4, 2, 4, c);
  }
  if (shape === "bush") {
    g.ellipse(9, 17, 6, 4.5, ball(leaf));
    for (const [x, y] of [[5, 15], [9, 12], [13, 15], [7, 19], [12, 19]] as const) g.rect(x, y + droop * 0.4, 1, 3, c);
  }
}

export function coin(): Sprite {
  const g = new Grid(9, 9);
  g.ellipse(4.5, 4.5, 3.6, 3.6, ball("#F2B33D", 0.25, 0.4));
  g.rect(4, 3, 1, 3, "#B9821E");
  return g.outline(0.5).sprite(4, 8);
}

// ---------- props ----------
export function lamp(): Sprite {
  const g = new Grid(10, 28);
  g.rect(4, 9, 2, 17, "#3D3A45"); g.rect(3, 24, 4, 2, "#3D3A45");
  g.rect(2, 3, 6, 7, "#3D3A45"); g.rect(3, 4, 4, 5, "#FFE48A"); g.set(3, 4, "#FFFBE0");
  g.rect(3, 1, 4, 2, "#3D3A45");
  return g.outline(0.4).sprite(5, 25);
}

export function bench(): Sprite {
  const g = new Grid(22, 14);
  g.rect(1, 2, 20, 3, "#A86A3C"); g.rect(1, 7, 20, 3, "#C08050"); g.rect(1, 7, 20, 1, "#D99A68");
  g.rect(3, 10, 2, 3, "#5A3B22"); g.rect(17, 10, 2, 3, "#5A3B22"); g.rect(3, 5, 2, 2, "#5A3B22"); g.rect(17, 5, 2, 2, "#5A3B22");
  return g.outline().sprite(11, 12);
}

export function fountain(): Sprite {
  const g = new Grid(52, 36);
  g.ellipse(26, 24, 24, 10, ball("#BDB6A8", 0.25, 0.2));
  g.ellipse(26, 23, 20, 7.5, (nx, ny) => (ny < -0.4 ? "#A8F4EC" : Math.abs(nx) < 0.5 && ny < 0.2 ? "#7FE3E0" : "#4FC2D4"));
  g.rect(23, 8, 6, 15, (x) => (x === 0 ? "#E0DACD" : x > 3 ? "#9C968A" : "#C6BFB1"));
  g.ellipse(26, 9, 7, 2.6, ball("#BDB6A8"));
  g.ellipse(26, 8.6, 5, 1.6, "#A8F4EC");
  g.rect(25, 2, 2, 6, "#D8FFF8");
  return g.outline(0.5).sprite(26, 33);
}

export function desk(): Sprite {
  const g = new Grid(32, 20);
  g.rect(1, 4, 30, 6, "#B57A47"); g.rect(1, 4, 30, 1, "#D69A62");
  g.rect(2, 10, 28, 8, (x, y) => (x % 9 === 0 || y === 0 ? "#7A4E2D" : "#93603A"));
  g.rect(4, 1, 8, 5, "#FFFDF4"); g.rect(5, 2, 6, 1, "#B9B4A8"); g.rect(5, 4, 4, 1, "#B9B4A8");
  g.rect(14, 2, 7, 4, "#F4EFE0"); g.rect(24, 2, 4, 3, "#C9483A"); g.rect(25, 0, 2, 2, "#7A4E2D");
  return g.outline().sprite(16, 18);
}

export function mailbox(color: string, flag: boolean): Sprite {
  const g = new Grid(14, 24);
  g.rect(6, 10, 2, 13, "#7A4E2D");
  g.rect(2, 4, 10, 7, ball(color) as never);
  g.rect(2, 4, 10, 7, (x, y) => (y === 0 ? shade(color, 0.25) : y > 5 ? shade(color, -0.2) : color));
  g.rect(3, 6, 1, 3, shade(color, -0.35));
  if (flag) { g.rect(11, 0, 1, 7, "#5A3B22"); g.rect(12, 0, 2, 3, "#E04848"); } else g.rect(11, 6, 3, 1, "#E04848");
  return g.outline().sprite(7, 22);
}

export function hedge(w = 2): Sprite {
  const g = new Grid(w * 16 + 2, 16);
  for (let i = 0; i < w * 2; i++) g.ellipse(5 + i * 8, 8, 5.5, 6, ball("#4E9D45"));
  for (let i = 0; i < w * 3; i++) g.set(3 + i * 5, 6 + (i % 2) * 3, ["#F06C8B", "#FFFFFF", "#FFD45A"][i % 3]);
  return g.outline().sprite(Math.round(w * 8) + 1, 14);
}

export function banner(color: string, icon?: string): Sprite {
  const g = new Grid(12, 34);
  g.rect(2, 2, 2, 31, "#5A3B22"); g.ellipse(3, 2, 1.6, 1.6, "#E9BC3C");
  g.rect(4, 5, 7, 14, (x, y) => (y > 11 && x % 3 === 1 ? null : x === 0 ? shade(color, 0.15) : color));
  if (icon && ICONS[icon]) {
    const ic = ICONS[icon];
    g.stamp(4, 7, ic.rows.map((r) => r.slice(0, 7)), Object.fromEntries(Object.entries(ic.pal).map(([k]) => [k, "#FFFFFF"])));
  }
  return g.outline().sprite(3, 32);
}

export function sign(): Sprite {
  const g = new Grid(24, 22);
  g.rect(11, 10, 2, 11, "#7A4E2D");
  g.rect(1, 2, 22, 10, (x, y) => (y === 0 ? "#D69A62" : y % 4 === 3 ? "#93603A" : "#B57A47"));
  return g.outline().sprite(12, 20);
}

export function picnic(): Sprite {
  const g = new Grid(32, 20);
  g.rect(2, 2, 28, 3, "#A86A3C"); g.rect(0, 6, 32, 7, "#C08050"); g.rect(0, 6, 32, 1, "#D99A68");
  g.rect(4, 13, 2, 5, "#5A3B22"); g.rect(26, 13, 2, 5, "#5A3B22"); g.rect(2, 16, 28, 2, "#A86A3C");
  g.rect(9, 7, 4, 3, "#FFFFFF"); g.rect(10, 7, 2, 1, "#E04848"); g.rect(19, 8, 3, 3, "#F3C53D");
  return g.outline().sprite(16, 18);
}

export function cart(): Sprite {
  const g = new Grid(30, 36);
  g.rect(14, 4, 2, 18, "#5A3B22");
  g.ellipse(15, 8, 13, 6, (nx, ny, x) => (ny > 0.2 ? null : Math.floor((x + 2) / 4) % 2 ? "#FFFFFF" : "#E04848"));
  g.rect(3, 18, 24, 10, (x, y) => (y === 0 ? "#D69A62" : y < 3 ? "#C08050" : "#93603A"));
  g.rect(6, 15, 4, 3, "#F3C53D"); g.rect(12, 15, 4, 3, "#E38A31"); g.rect(18, 15, 4, 3, "#7CC46B");
  g.ellipse(8, 29, 3, 3, ball("#3D3A45")); g.ellipse(22, 29, 3, 3, ball("#3D3A45"));
  return g.outline().sprite(15, 32);
}

export function atm(): Sprite {
  const g = new Grid(14, 22);
  g.rect(1, 2, 12, 19, (x, y) => (y === 0 ? "#B6BCCB" : x > 9 ? "#717A8E" : "#8E97AB"));
  g.rect(3, 5, 8, 6, "#78C8F0"); g.rect(4, 6, 3, 1, "#D9F2FF");
  g.rect(4, 13, 6, 1, "#2F2340"); g.rect(3, 15, 8, 3, "#5E667A");
  return g.outline().sprite(7, 20);
}

export function crate(): Sprite {
  const g = new Grid(14, 14);
  g.rect(1, 1, 12, 12, (x, y) => (x === 0 || y === 0 || x === 11 || y === 11 || x === y ? "#7A4E2D" : "#B57A47"));
  return g.outline().sprite(7, 12);
}

export function hay(): Sprite {
  const g = new Grid(18, 14);
  g.rect(1, 3, 16, 9, (x, y) => (y === 0 ? "#FBE59A" : (x + y * 2) % 5 === 0 ? "#C99A2E" : "#EBC556"));
  g.rect(1, 6, 16, 1, "#9A6B2A");
  return g.outline().sprite(9, 12);
}

export function scarecrow(color: string): Sprite {
  const g = new Grid(20, 30);
  g.rect(9, 10, 2, 19, "#7A4E2D"); g.rect(2, 12, 16, 2, "#7A4E2D");
  g.rect(5, 11, 10, 9, color); g.rect(5, 11, 10, 1, shade(color, 0.2));
  g.ellipse(10, 7, 4, 4, ball("#F2DFA8")); g.set(8, 7, "#3A2420"); g.set(11, 7, "#3A2420");
  g.ellipse(10, 3.5, 6.5, 1.6, "#D9A84A"); g.ellipse(10, 2.5, 3.5, 2.5, ball("#D9A84A"));
  return g.outline().sprite(10, 28);
}

export function heart(): Sprite {
  const g = new Grid(9, 8);
  g.stamp(1, 1, [".rr.rr.", "rRrrrrr", "rrrrrrr", ".rrrrr.", "..rrr..", "...r..."], { r: "#F0607A", R: "#FFC3CF" });
  return g.outline(0.5).sprite(4, 7);
}

export function bubble(kind: "!" | "..." | "x" | "check"): Sprite {
  const g = new Grid(13, 13);
  g.rect(1, 1, 11, 9, "#FFFDF4"); g.rect(4, 10, 3, 1, "#FFFDF4"); g.set(4, 11, "#FFFDF4");
  const ink = kind === "x" ? "#D2413A" : kind === "check" ? "#3FA66B" : "#3A2420";
  if (kind === "!") { g.rect(6, 2, 1, 5, ink); g.set(6, 8, ink); }
  if (kind === "...") for (const x of [3, 6, 9]) g.set(x, 5, ink);
  if (kind === "x") { g.line(3, 2, 9, 8, ink); g.line(9, 2, 3, 8, ink); }
  if (kind === "check") { g.line(3, 5, 5, 7, ink); g.line(5, 7, 9, 2, ink); }
  return g.outline(0.7).sprite(4, 12);
}

// ---------- magic ----------
export function crystal(hue: "lilac" | "aqua" | "rose"): Sprite {
  const base = { lilac: "#B48CF0", aqua: "#6FE0E0", rose: "#F49AC8" }[hue];
  const g = new Grid(18, 22);
  const shard = (x: number, w: number, top: number, c: string) => {
    for (let y = top; y < 20; y++) {
      const hw = y < top + w ? Math.round(((y - top + 1) * w) / (w + 1)) : w;
      g.rect(x - hw, y, hw * 2, 1, (i) => (i < hw ? shade(c, 0.32) : shade(c, -0.05)));
    }
  };
  shard(5, 2, 9, shade(base, -0.08)); shard(13, 2, 11, shade(base, -0.12)); shard(9, 3, 3, base);
  g.set(8, 6, "#FFFFFF"); g.set(8, 7, "#FFFFFF");
  g.ellipse(9, 20, 7, 1.6, "#8C8798");
  return g.outline(0.5).sprite(9, 20);
}

export function mushrooms(cap: string): Sprite {
  const g = new Grid(20, 12);
  for (const [x, y, r] of [[4, 6, 3], [11, 4, 4], [16, 7, 2.6]] as const) {
    g.rect(x - 1, y, 2, 10 - y, "#F4EEDC");
    g.ellipse(x, y, r, r * 0.75, ball(cap));
    g.set(x - 1, y - 1, "#FFFFFF"); g.set(x + 1, y, "#FFFFFF");
  }
  return g.outline().sprite(10, 10);
}

// ---------- town decoration ----------
const FLOWERS = ["#F06C8B", "#FFD45A", "#FFFFFF", "#C8A8F0", "#F39A2E", "#E04848"];

function flowerDot(g: Grid, x: number, y: number, c: string) {
  g.set(x - 1, y, c); g.set(x + 1, y, c); g.set(x, y - 1, c); g.set(x, y + 1, c); g.set(x, y, "#F6B93B");
}

export function flowerbed(w = 2, seed = 0): Sprite {
  const W = w * 16;
  const g = new Grid(W + 2, 14);
  g.rect(1, 5, W, 8, (x, y) => (y === 0 || y === 7 || x === 0 || x === W - 1 ? ((x + y) % 4 ? "#A8A296" : "#8D877C") : "#6E4428"));
  for (let i = 0; i < w * 6; i++) g.ellipse(3 + hash(i, seed + 9) * (W - 4), 6 + hash(seed + 3, i) * 4, 2.4, 1.8, ball("#4E9D45"));
  for (let i = 0; i < w * 7; i++) flowerDot(g, 3 + Math.floor(hash(i, seed) * (W - 4)), 3 + Math.floor(hash(seed, i) * 7), FLOWERS[(i + seed) % 6]);
  return g.outline().sprite(Math.round(W / 2) + 1, 12);
}

export function wildflowers(seed = 0): Sprite {
  const g = new Grid(16, 10);
  for (let i = 0; i < 4; i++) g.line(3 + i * 3, 9, 3 + i * 3 + (i % 2), 5, "#4E9D45");
  for (let i = 0; i < 5; i++) flowerDot(g, 2 + Math.floor(hash(i, seed) * 12), 2 + Math.floor(hash(seed, i) * 4), FLOWERS[(i * 2 + seed) % 6]);
  return g.outline(0.45).sprite(8, 9);
}

export function tallgrass(): Sprite {
  const g = new Grid(14, 10);
  for (const [x, h] of [[2, 6], [4, 8], [6, 5], [8, 8], [10, 6], [12, 7]] as const) g.line(x, 9, x + (x % 4 ? 1 : -1), 9 - h, x % 4 ? "#4E9D45" : "#6CAE45");
  return g.sprite(7, 9);
}

export function planter(seed = 0): Sprite {
  const g = new Grid(12, 16);
  g.rect(2, 8, 8, 7, (x, y) => (y === 0 ? "#D9784A" : x > 5 ? "#A8552F" : "#C46A3E"));
  g.ellipse(6, 7, 5, 3.5, ball("#4E9D45"));
  for (let i = 0; i < 4; i++) flowerDot(g, 3 + Math.floor(hash(i, seed) * 6), 4 + Math.floor(hash(seed, i) * 4), FLOWERS[(i + seed) % 6]);
  return g.outline().sprite(6, 14);
}

export function topiary(): Sprite {
  const g = new Grid(14, 24);
  g.rect(6, 12, 2, 6, "#7A4E2D");
  g.ellipse(7, 8, 6, 6.5, ball("#4E9D45"));
  g.rect(3, 17, 8, 6, (x, y) => (y === 0 ? "#D9784A" : x > 4 ? "#A8552F" : "#C46A3E"));
  return g.outline().sprite(7, 22);
}

export function barrel(): Sprite {
  const g = new Grid(12, 14);
  g.ellipse(6, 7, 5, 6, (nx, ny, x, y) => (y === 3 || y === 10 ? "#5A3B22" : ball("#A86A3C")(nx, ny)));
  g.ellipse(6, 2.5, 4, 1.3, "#C99A64");
  return g.outline().sprite(6, 12);
}

export function stall(color: string, seed = 0): Sprite {
  const g = new Grid(34, 32);
  g.rect(3, 8, 2, 22, "#5A3B22"); g.rect(29, 8, 2, 22, "#5A3B22");
  for (let x = 0; x < 34; x++) for (let y = 2; y < 10 + (x % 6 < 3 ? 1 : 0); y++) g.set(x, y, Math.floor(x / 6) % 2 ? "#FFFFFF" : shade(color, y > 7 ? -0.2 : y < 4 ? 0.15 : 0));
  g.rect(2, 18, 30, 11, (x, y) => (y === 0 ? "#D69A62" : y < 3 ? "#C08050" : x % 7 === 0 ? "#7A4E2D" : "#93603A"));
  const goods = ["#E04848", "#F39A2E", "#FFD45A", "#7CC46B", "#C8A8F0", "#F06C8B"];
  for (let i = 0; i < 6; i++) { const c = goods[(i + seed) % 6]; g.ellipse(6 + i * 4.4, 16.5, 2, 1.8, ball(c)); }
  return g.outline().sprite(17, 29);
}

export function arch(): Sprite {
  const g = new Grid(36, 36);
  g.rect(3, 10, 3, 25, "#F4EEDC"); g.rect(30, 10, 3, 25, "#F4EEDC");
  for (let a = 0; a <= 40; a++) { const u = a / 40, x = 4.5 + u * 27, y = 12 - Math.sin(u * Math.PI) * 10; g.rect(x - 1, y - 1, 3, 3, "#F4EEDC"); }
  for (let i = 0; i < 30; i++) {
    const u = hash(i, 4), side = i % 3;
    const [x, y] = side === 0 ? [4.5 + u * 27, 12 - Math.sin(u * Math.PI) * 10] : side === 1 ? [4.5, 10 + u * 22] : [31.5, 10 + u * 22];
    g.ellipse(x + (hash(i, 7) - 0.5) * 3, y, 2, 1.7, ball("#4E9D45"));
    if (i % 2) flowerDot(g, Math.round(x + (hash(i, 9) - 0.5) * 3), Math.round(y), FLOWERS[i % 6]);
  }
  return g.outline().sprite(18, 34);
}

export function picket(): Sprite {
  const g = new Grid(18, 14);
  for (let x = 1; x < 17; x += 4) { g.rect(x, 3, 2, 10, "#F4EEDC"); g.set(x, 2, "#F4EEDC"); g.rect(x + 1, 4, 1, 9, "#D8CFBC"); }
  g.rect(0, 6, 18, 1, "#E8E0CC"); g.rect(0, 10, 18, 1, "#E8E0CC");
  return g.outline(0.45).sprite(9, 12);
}

export function picketPost(): Sprite {
  const g = new Grid(6, 14);
  g.rect(2, 3, 2, 10, "#F4EEDC"); g.set(2, 2, "#F4EEDC");
  return g.outline(0.45).sprite(3, 12);
}

export function stump(): Sprite {
  const g = new Grid(14, 12);
  g.rect(2, 5, 10, 6, (x) => (x > 6 ? "#6E4428" : "#8A5A33"));
  g.ellipse(7, 5, 5, 2, "#D9A86A"); g.ellipse(7, 5, 2.4, 0.9, "#B9824A");
  return g.outline().sprite(7, 10);
}

export function log(): Sprite {
  const g = new Grid(26, 12);
  g.rect(3, 3, 19, 7, (x, y) => (y === 0 ? "#A86A3C" : y > 4 ? "#6E4428" : "#8A5A33"));
  g.ellipse(22, 6.5, 2.4, 3.6, "#D9A86A"); g.set(22, 6, "#B9824A");
  g.ellipse(8, 3, 2, 1.3, "#5BAA4A");
  return g.outline().sprite(13, 10);
}

export function well(): Sprite {
  const g = new Grid(28, 34);
  g.rect(4, 6, 2, 18, "#7A4E2D"); g.rect(22, 6, 2, 18, "#7A4E2D");
  for (let y = 0; y < 8; y++) { const hw = 6 + y * 1.3; g.rect(Math.round(14 - hw), y, Math.round(hw * 2), 1, y > 5 ? "#8E3A2E" : "#C9483A"); }
  g.rect(6, 10, 16, 1, "#5A3B22"); g.rect(13, 10, 2, 6, "#5A3B22"); g.rect(12, 15, 4, 3, "#A86A3C");
  g.ellipse(14, 26, 11, 6, ball("#B9B3A6"));
  g.ellipse(14, 24.5, 8, 3.2, "#3F7FB0");
  return g.outline().sprite(14, 31);
}
