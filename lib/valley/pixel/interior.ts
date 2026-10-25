import { ball, Grid, hash, shade, type Sprite } from "./draw";
import type { Interior } from "../interiors";
import { WALL } from "../interiors";
import { banner, planter, topiary } from "./props";

// Shop interiors: the room (floor and walls) baked once per shop, plus furniture sprites.

const T = 16;
const rgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

function floorPixel(kind: Interior["floor"], x: number, y: number) {
  if (kind === "wood") {
    const row = Math.floor(y / 5);
    if (y % 5 === 4 || (x + row * 13) % 28 === 0) return "#8E5E35";
    return shade("#C08A55", (hash(row, Math.floor((x + row * 13) / 28)) - 0.5) * 0.14);
  }
  if (kind === "tile") return x % 10 === 9 || y % 10 === 9 ? "#C9D3CE" : shade("#F1F4F2", (hash(Math.floor(x / 10), Math.floor(y / 10)) - 0.5) * 0.05);
  if (kind === "checker") return (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? "#F3F1EA" : "#7FA9CF";
  if (kind === "carpet") return (x + y) % 6 === 0 ? "#7A3E52" : (x * 3 + y) % 11 === 0 ? "#B05A6E" : "#93485E";
  return x % 14 === 13 || y % 10 === 9 ? "#9A9184" : shade("#CFC9BC", (hash(Math.floor(x / 14), Math.floor(y / 10)) - 0.5) * 0.1);
}

export function bakeRoom(r: Interior): HTMLCanvasElement {
  const W = r.w * T, H = r.h * T, wallH = Math.round(WALL * T);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const doorX0 = W / 2 - T, doorX1 = W / 2 + T;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let col: string;
      if (y < wallH) {
        col = (x % 12 < 1) ? shade(r.wall, -0.06) : r.wall;
        if (y < 5) col = shade(r.trim, y < 2 ? 0.15 : -0.1);
        if (y >= wallH - 5) col = y >= wallH - 2 ? shade(r.trim, -0.35) : shade(r.trim, -0.15);
        for (const wx of [0.22, 0.78]) {
          const cx = Math.round(W * wx), top = 9, bot = wallH - 11;
          if (Math.abs(x - cx) <= 9 && y >= top && y <= bot) {
            const edge = Math.abs(x - cx) >= 8 || y === top || y === bot || x === cx || y === Math.round((top + bot) / 2);
            col = edge ? "#F4EBDA" : y < top + 6 ? "#BFE6FA" : "#8DC6E6";
          }
        }
      } else {
        col = floorPixel(r.floor, x, y);
        if (y < wallH + 3) col = shade(col, -0.25); // shadow under the back wall
      }
      if (x < 4 || x >= W - 4) col = shade(r.trim, -0.4);
      if (y >= H - 4 && (x < doorX0 || x >= doorX1)) col = shade(r.trim, -0.4);
      if (y >= H - 12 && y < H && x >= doorX0 + 2 && x < doorX1 - 2) col = (x + y) % 4 < 2 ? "#A0522D" : "#B8693E"; // door mat
      const [rr, gg, bb] = rgb(col);
      img.data.set([rr, gg, bb, 255], (y * W + x) * 4);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

const wood = (x: number, y: number, base = "#B57A47") => (y === 0 ? shade(base, 0.2) : (x + y * 3) % 17 === 0 ? shade(base, -0.2) : base);

export function furniture(kind: string, v = 0, color?: string, wTiles?: number): Sprite {
  if (kind === "plant") return topiary();
  if (kind === "flag") return banner("#3E6E9E", "calendar");
  if (kind === "planter") return planter(v);
  let g: Grid;
  switch (kind) {
    case "counter": {
      const W = (wTiles ?? 4) * T, base = color ?? "#B57A47";
      g = new Grid(W, 24);
      g.rect(0, 2, W, 7, (x, y) => (y === 0 ? shade(base, 0.3) : shade(base, 0.12)));
      g.rect(1, 9, W - 2, 14, (x, y) => (x % 16 === 0 ? shade(base, -0.25) : y < 2 ? shade(base, -0.15) : base));
      g.rect(W - 18, 0, 10, 6, "#4A4A55"); g.rect(W - 17, 1, 8, 2, "#7FE3C0"); // register
      g.rect(8, 0, 9, 4, "#FFFDF4"); g.rect(9, 1, 6, 1, "#B9B4A8"); // papers
      return g.outline(0.5).sprite(W / 2, 22);
    }
    case "kitchen": {
      const W = (wTiles ?? 4) * T;
      g = new Grid(W, 26);
      g.rect(0, 4, W, 20, (x, y) => (y < 3 ? "#D7DCE4" : x % 20 === 0 ? "#8C93A1" : "#B4BAC6"));
      for (const x of [10, 30, 50]) { g.ellipse(x, 6, 6, 2.5, "#3D3A45"); g.rect(x - 5, 0, 10, 5, x === 30 ? "#C9483A" : "#7C8596"); }
      return g.outline(0.5).sprite(W / 2, 24);
    }
    case "desk": {
      const W = (wTiles ?? 3) * T;
      g = new Grid(W, 22);
      g.rect(0, 3, W, 6, (x, y) => wood(x, y, "#93603A")); g.rect(2, 9, W - 4, 12, (x, y) => wood(x, y, "#7A4E2D"));
      g.rect(6, 0, 10, 4, "#FFFDF4"); g.rect(W - 16, 0, 9, 5, "#3E8ED0"); g.rect(W / 2 - 3, 1, 6, 3, "#C9483A");
      return g.outline(0.5).sprite(W / 2, 20);
    }
    case "shelf": {
      g = new Grid(34, 34);
      g.rect(1, 1, 32, 32, (x, y) => (x < 2 || x > 29 || y < 2 || y % 10 === 0 ? "#7A4E2D" : "#5A3B22"));
      const items = [["#E04848", "#FFFFFF", "#3FA66B"], ["#F3C53D", "#E04848", "#7CC4EA"], ["#FFFFFF", "#F06C8B", "#7FE3C0"], ["#C9822E", "#F2C27A", "#E9BC3C"], ["#8E5BD0", "#E9BC3C", "#3E8ED0"]][v % 5];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) { const x = 4 + i * 4.3, y = 4 + row * 10; g.rect(x, y + (i % 2), 3, 6 - (i % 2), items[(i + row) % 3]); g.set(x, y + (i % 2), "#FFFFFF"); }
      return g.outline(0.5).sprite(17, 33);
    }
    case "bookshelf": {
      g = new Grid(34, 36);
      g.rect(1, 1, 32, 34, (x, y) => (x < 2 || x > 29 || y < 2 || y % 11 === 0 ? "#7A4E2D" : "#4A2E1A"));
      const books = ["#C9483A", "#3E8ED0", "#3FA66B", "#E9BC3C", "#8E5BD0", "#F4EBDA"];
      for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) g.rect(3 + i * 3, 3 + row * 11 + (i % 3 === 0 ? 1 : 0), 2, 8 - (i % 3 === 0 ? 1 : 0), books[(i * 7 + row) % 6]);
      return g.outline(0.5).sprite(17, 35);
    }
    case "bed": case "bedframe": {
      g = new Grid(26, 36);
      g.rect(1, 2, 24, 32, "#7A4E2D");
      g.rect(3, 4, 20, 28, kind === "bed" ? "#FFFFFF" : "#E07BB0");
      g.rect(5, 5, 16, 6, "#F4F4F0"); g.rect(5, 5, 16, 1, "#FFFFFF");
      if (kind === "bedframe") for (let i = 0; i < 5; i++) g.rect(4 + i * 4, 14, 2, 16, "#F49AC8");
      return g.outline(0.5).sprite(13, 34);
    }
    case "dentalchair": {
      g = new Grid(26, 30);
      g.ellipse(13, 18, 9, 5, ball("#4E8FCB")); g.rect(9, 6, 8, 10, "#4E8FCB"); g.rect(11, 22, 4, 6, "#8C93A1");
      g.line(20, 4, 24, 0, "#3D3A45"); g.ellipse(24, 2, 2.5, 2, "#FFE48A");
      return g.outline(0.5).sprite(13, 28);
    }
    case "table": {
      g = new Grid(28, 22);
      g.ellipse(14, 8, 13, 6, ball("#C08050", 0.25, 0.2)); g.rect(12, 12, 4, 8, "#7A4E2D");
      g.rect(7, 5, 4, 3, "#FFFFFF"); g.rect(17, 6, 3, 3, "#E9BC3C");
      return g.outline(0.5).sprite(14, 20);
    }
    case "rack": {
      g = new Grid(34, 28);
      g.rect(2, 2, 30, 2, "#3D3A45"); g.rect(2, 2, 2, 25, "#3D3A45"); g.rect(30, 2, 2, 25, "#3D3A45");
      const shirts = v % 2 ? ["#8E5BD0", "#F4EBDA", "#3E8ED0", "#E07BB0"] : ["#C9483A", "#3FA66B", "#E9BC3C", "#3E6E9E"];
      for (let i = 0; i < 6; i++) g.rect(5 + i * 4, 4, 4, 14 + (i % 2) * 2, shirts[i % 4]);
      return g.outline(0.5).sprite(17, 27);
    }
    case "vault": {
      g = new Grid(38, 34);
      g.rect(1, 1, 36, 32, "#6F6A62");
      g.ellipse(19, 17, 13, 13, ball("#B4BAC6", 0.3, 0.3)); g.ellipse(19, 17, 4, 4, "#6F6A62");
      for (let a = 0; a < 6; a++) g.line(19, 17, 19 + Math.cos(a) * 9, 17 + Math.sin(a) * 9, "#8C93A1");
      return g.outline(0.5).sprite(19, 33);
    }
    case "crates": {
      g = new Grid(34, 18);
      for (const x of [1, 17]) g.rect(x, 4, 16, 13, (xx, yy) => (xx === 0 || yy === 0 || xx === 15 ? "#7A4E2D" : "#B57A47"));
      const fruit = [["#E04848", "#F39A2E"], ["#F3C53D", "#7CC46B"], ["#F06C8B", "#FFFFFF"]][v % 3];
      for (let i = 0; i < 8; i++) g.ellipse(4 + i * 3.7, 4, 2, 2, ball(fruit[i % 2]));
      return g.outline(0.5).sprite(17, 17);
    }
    case "sofa": {
      g = new Grid(40, 20);
      g.rect(2, 2, 36, 8, "#3FA6A0"); g.rect(0, 8, 40, 10, "#2F8A84"); g.rect(4, 8, 32, 5, "#3FA6A0");
      return g.outline(0.5).sprite(20, 18);
    }
    case "rope": {
      g = new Grid(44, 16);
      for (const x of [2, 40]) { g.rect(x, 4, 2, 11, "#E9BC3C"); g.ellipse(x + 1, 3, 2, 2, "#E9BC3C"); }
      for (let x = 4; x < 40; x++) g.set(x, 6 + Math.round(Math.sin(((x - 4) / 36) * Math.PI) * 3), "#C9483A");
      return g.outline(0.5).sprite(22, 15);
    }
    default: return planter(v);
  }
}

const POSTERS: [string, string][] = [["#3FA67A", "Rx"], ["#D2574A", "+"], ["#3E8ED0", "tooth"], ["#5E3A99", "$"], ["#8E5BD0", "plane"], ["#E0A526", "food"], ["#3E6E9E", "cal"]];

// Framed signs hung on the back wall (drawn flat, never in front of anyone).
export function poster(v: number): Sprite {
  const [col, kind] = POSTERS[v % POSTERS.length];
  const g = new Grid(26, 20);
  g.rect(0, 0, 26, 20, "#7A4E2D"); g.rect(2, 2, 22, 16, "#FFFDF4"); g.rect(2, 2, 22, 4, col);
  const ink = col;
  if (kind === "+") { g.rect(11, 7, 4, 10, "#E04848"); g.rect(8, 10, 10, 4, "#E04848"); }
  else if (kind === "tooth") g.stamp(10, 8, [".www.", "wwwww", "wwwww", "ww.ww", "w...w"], { w: "#BFD8EE" });
  else if (kind === "$") { g.rect(12, 7, 2, 10, ink); g.rect(9, 8, 7, 2, ink); g.rect(9, 11, 7, 2, ink); g.rect(9, 14, 7, 2, ink); }
  else if (kind === "Rx") { g.rect(8, 8, 2, 8, ink); g.rect(8, 8, 6, 2, ink); g.rect(12, 10, 2, 2, ink); g.line(11, 12, 16, 16, ink); }
  else for (let i = 0; i < 4; i++) g.rect(6 + i * 4, 9 + (i % 2) * 3, 3, 3, ink);
  return g.sprite(13, 20);
}

export function pedestal(): Sprite {
  const g = new Grid(22, 12);
  g.rect(1, 2, 20, 4, "#D69A62"); g.rect(1, 2, 20, 1, "#F2C27A");
  g.rect(3, 6, 16, 5, "#93603A"); g.rect(3, 6, 16, 1, "#7A4E2D");
  return g.outline(0.5).sprite(11, 11);
}

export function rugSprite(): Sprite {
  const g = new Grid(56, 34);
  g.ellipse(28, 17, 27, 16, (nx, ny) => (nx * nx + ny * ny > 0.75 ? "#C9483A" : (Math.abs(nx) + Math.abs(ny)) % 0.3 < 0.08 ? "#F2C27A" : "#E07050"));
  return g.sprite(28, 17);
}
