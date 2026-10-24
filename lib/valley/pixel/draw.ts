// A tiny pixel-art toolkit. Every sprite in the valley is painted here at 1x, pixel by pixel,
// then outlined and blitted to a canvas. Nothing is downloaded: the art is ours.

export type Fill = string | null | ((x: number, y: number) => string | null);
export type Sprite = { img: HTMLCanvasElement; w: number; h: number; ax: number; ay: number };

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (r: number, g: number, b: number) => "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);

export function mix(a: string, b: string, t: number) {
  const x = rgb(a), y = rgb(b);
  return hex(Math.round(x[0] + (y[0] - x[0]) * t), Math.round(x[1] + (y[1] - x[1]) * t), Math.round(x[2] + (y[2] - x[2]) * t));
}

// Shadows lean purple and highlights lean warm, the way pixel artists hue-shift a ramp.
export const shade = (c: string, t: number) => (t < 0 ? mix(c, "#2a1838", -t) : mix(c, "#fff6d8", t));

// Three-tone "ball" lighting from the top-left for any ellipse fill.
export const ball = (base: string, lo = 0.24, hi = 0.26) => (nx: number, ny: number) => {
  const l = -nx * 0.45 - ny * 0.85;
  if (l > 0.55) return shade(base, hi);
  if (l < -0.4) return shade(base, -lo);
  return base;
};

export function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class Grid {
  px: (string | null)[];
  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }
  set(x: number, y: number, c: string | null) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }
  rect(x: number, y: number, w: number, h: number, c: Fill) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, typeof c === "function" ? c(i, j) : c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string | ((nx: number, ny: number, x: number, y: number) => string | null)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, typeof c === "function" ? c(nx, ny, x, y) : c);
      }
  }
  tri(a: [number, number], b: [number, number], c: [number, number], col: string) {
    const minX = Math.floor(Math.min(a[0], b[0], c[0])), maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1])), maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const s = (p: [number, number], q: [number, number], r: [number, number]) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const p: [number, number] = [x + 0.5, y + 0.5];
        const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
        const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) this.set(x, y, col);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // Paint a small icon from a string grid: each char maps to a color, "." is clear.
  stamp(x: number, y: number, rows: string[], pal: Record<string, string>) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) this.set(x + i, y + j, pal[ch]); }));
  }
  // Selective outline: every empty pixel touching a filled one takes a dark version of that color.
  outline(strength = 0.62) {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        const n = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => {
          const xx = x + dx, yy = y + dy;
          return xx < 0 || yy < 0 || xx >= this.w || yy >= this.h ? null : src[yy * this.w + xx];
        }).find(Boolean);
        if (n) this.px[y * this.w + x] = shade(n, -strength);
      }
    return this;
  }
  mirror() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.px[y * this.w + (this.w - 1 - x)] = this.px[y * this.w + x];
    return g;
  }
  sprite(ax: number, ay: number): Sprite {
    const img = document.createElement("canvas");
    img.width = this.w; img.height = this.h;
    const ctx = img.getContext("2d")!;
    const data = ctx.createImageData(this.w, this.h);
    this.px.forEach((c, i) => {
      if (!c) return;
      const [r, g, b] = rgb(c);
      data.data.set([r, g, b, 255], i * 4);
    });
    ctx.putImageData(data, 0, 0);
    return { img, w: this.w, h: this.h, ax, ay };
  }
}

// A sprite scaled up for the DOM (avatar picker portraits).
export function dataUrl(s: Sprite, scale = 4) {
  const c = document.createElement("canvas");
  c.width = s.w * scale; c.height = s.h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, 0, 0, c.width, c.height);
  return c.toDataURL();
}
