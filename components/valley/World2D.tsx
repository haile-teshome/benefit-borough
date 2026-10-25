"use client";

import { useEffect, useRef } from "react";
import type { DbConnection } from "@/lib/valley_bindings";
import type { Player, Plot } from "@/lib/valley_bindings/types";
import { sound } from "@/lib/valley/audio";
import { nightAmount } from "@/lib/valley/clock";
import { anchors, focus, labelEls, setAnchor } from "@/lib/valley/labels";
import { ELDER_POS, mailboxPosition, slotPosition, usd } from "@/lib/valley/layout";
import { animalFrames, type Dir, type Outfit, speciesOf } from "@/lib/valley/pixel/animals";
import { mix, type Sprite } from "@/lib/valley/pixel/draw";
import { bakeGround, fieldPatch, type Ground } from "@/lib/valley/pixel/ground";
import * as P from "@/lib/valley/pixel/props";
import { bakeRoom, furniture, pedestal, poster, rugSprite } from "@/lib/valley/pixel/interior";
import { blockedInside, doorSpot, INTERIORS, type Interior } from "@/lib/valley/interiors";
import { CHATTER, KEEPERS } from "@/lib/valley/people";
import type { Tile } from "@/lib/types";
import {
  BOUNDS, BUILDINGS, blocked, DECOR, doorOf, FARM_MEADOW, farmLayout, farmRects, type Rect, FOUNTAIN, GLOWS, NPCS, SOLID_DECOR, STRINGS, BUNTING, TREE_KINDS, type Place,
} from "@/lib/valley/world";

const T = 16;
const SPEED = 5.2; // tiles per second
const REACH = 1.9;

export type Near =
  | { kind: "crop"; tileId: string; label: string }
  | { kind: "elder"; label: string }
  | { kind: "mailbox"; label: string }
  | { kind: "place"; id: string; place: Place; label: string }
  | { kind: "npc"; id: string; label: string }
  | { kind: "keeper"; id: string; label: string }
  | { kind: "claim"; tileId: string; label: string }
  | { kind: "exit"; label: string }
  | { kind: "fish"; label: string }
  | { kind: "balloons"; label: string }
  | { kind: "bugs"; label: string }
  | null;
export type WorldApi = { enter?: (buildingId: string) => void; exit?: () => void; home?: () => void };
export type Emote = { clip: "Cheer" | "Interact"; at: number } | null;
export type Mood = { kind: "approve" | "reject" | "thinking"; at: number } | null;
export type Burst = { id: number; at: [number, number, number]; amount: number; born: number };

type Props = {
  me?: Player; players: readonly Player[]; plots: readonly Plot[]; myHex: string; giftsWaitingFor: Set<string>;
  canMove: boolean; onNear: (n: Near) => void; conn: DbConnection | null; myGiftCount: number; attract: boolean;
  bursts: Burst[]; onBurstDone: (id: number) => void; emotes: Record<string, Emote>; ruthMood: Mood;
  tiles: Tile[]; done: string[]; api: WorldApi; onScene: (buildingId: string | null) => void;
};

const hex = (id: { toHexString(): string }) => id.toHexString();

const STYLES: Record<string, P.BuildingStyle> = {
  pharmacy: { wall: "mint", roof: "#3FA67A", door: "#2F7A58", icon: "pill", iconBg: "#2F7A58", awning: ["#3FA67A", "#FFFFFF"] },
  clinic: { wall: "white", roof: "#D2574A", door: "#8FB7D6", icon: "cross", iconBg: "#FFFFFF", tall: true, chimney: true },
  dental: { wall: "blue", roof: "#4E8FCB", door: "#3E6E9E", icon: "tooth", iconBg: "#3E8ED0", flowers: true },
  bank: { wall: "stone", roof: "#6E6A78", door: "#8A5A33", icon: "coin", iconBg: "#5E3A99", columns: true, tall: true },
  cards: { wall: "brick", roof: "#8E5BD0", door: "#5E3A99", icon: "card", iconBg: "#FFFFFF", awning: ["#8E5BD0", "#E9BC3C"], tall: true },
  deals: { wall: "wood", roof: "#E0A526", door: "#C9483A", icon: "coin", iconBg: "#C9483A", awning: ["#C9483A", "#FFFFFF"] },
  commons: { wall: "plaster", roof: "#D8743E", door: "#7A4E2D", icon: "food", iconBg: "#E0A526", awning: ["#E0A526", "#FFF6D8"], chimney: true },
  hall: { wall: "stone", roof: "#3E6E9E", door: "#7A4E2D", icon: "calendar", iconBg: "#FFFFFF", tower: true, tall: true, flowers: true },
  cottage1: { wall: "plaster", roof: "#D8574A", door: "#3E6E9E", chimney: true, flowers: true },
  cottage2: { wall: "wood", roof: "#3FA6A0", door: "#E0A526", chimney: true, flowers: true },
  cottage3: { wall: "brick", roof: "#D8743E", door: "#3FA66B", chimney: true, flowers: true },
  library: { wall: "stone", roof: "#2F6E46", door: "#7A4E2D", icon: "book", iconBg: "#F4E9CF", tall: true, flowers: true },
  bakery: { wall: "cream", roof: "#9A5A33", door: "#C9483A", icon: "bread", iconBg: "#FFF6D8", awning: ["#C9483A", "#FFFFFF"], chimney: true },
  florist: { wall: "mint", roof: "#E07BB0", door: "#B04A80", icon: "flower", iconBg: "#FFFFFF", awning: ["#E07BB0", "#FFFFFF"], flowers: true },
  inn: { wall: "plaster", roof: "#6A4C93", door: "#7A4E2D", chimney: true, flowers: true, tall: true },
};

type Art = {
  ground: Ground; field: HTMLCanvasElement;
  buildings: Map<string, P.BuildingArt>; farmhouse: Map<string, P.BuildingArt>;
  trees: Sprite[]; bushes: Sprite[]; props: Record<string, Sprite>; crops: Map<string, Sprite>;
  mailbox: Map<string, Sprite>; banners: Map<string, Sprite>; scarecrow: Map<string, Sprite>; magic: Map<string, Sprite>;
  coin: Sprite; heart: Sprite; bubbles: Record<string, Sprite>;
};

function makeArt(): Art {
  const L = farmLayout(0).field;
  return {
    ground: bakeGround(),
    field: fieldPatch(Math.round(L.x1 - L.x0 + 0.4), Math.round(L.z1 - L.z0)),
    buildings: new Map(BUILDINGS.map((b) => [b.id, P.building(b.w, STYLES[b.kind])])),
    farmhouse: new Map(),
    trees: TREE_KINDS.map((k, i) => P.tree(k, i * 7)),
    bushes: [P.bush(), P.bush("#4E9D45", "#E04848"), P.bush("#5BAA4A", "#FFFFFF")],
    props: {
      fountain: P.fountain(), desk: P.desk(), lamp: P.lamp(), bench: P.bench(), hedge: P.hedge(2), sign: P.sign(),
      picnic: P.picnic(), cart: P.cart(), atm: P.atm(), rock: P.rock(), crate: P.crate(), hay: P.hay(),
    },
    crops: new Map(), mailbox: new Map(), banners: new Map(), scarecrow: new Map(), magic: new Map(),
    coin: P.coin(), heart: P.heart(),
    bubbles: { "!": P.bubble("!"), "...": P.bubble("..."), x: P.bubble("x"), check: P.bubble("check") },
  };
}

// Decorations that come in variants (seeded flowers, colored stalls).
const DECO: Record<string, (v: number, color?: string) => Sprite> = {
  flowerbed: (v) => P.flowerbed(2, v), wildflowers: (v) => P.wildflowers(v), tallgrass: () => P.tallgrass(), planter: (v) => P.planter(v),
  topiary: () => P.topiary(), barrel: () => P.barrel(), stall: (v, c) => P.stall(c ?? "#E04848", v), arch: () => P.arch(),
  picket: () => P.picket(), post: () => P.picketPost(), stump: () => P.stump(), log: () => P.log(), well: () => P.well(),
};

const memo = <T,>(m: Map<string, T>, k: string, make: () => T) => { let v = m.get(k); if (!v) { v = make(); m.set(k, v); } return v; };

function dirOf(dx: number, dz: number, prev: Dir): Dir {
  if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return prev;
  return Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? "left" : "right") : dz < 0 ? "up" : "down";
}

type Particle = { x: number; z: number; y: number; vx: number; vz: number; vy: number; born: number; life: number; kind: "coin" | "heart" | "spark"; color?: string };

const SPARK = ["#FFF6B0", "#FFC8EC", "#B8F4FF", "#D8C4FF"];
const FLAGS = ["#E2574C", "#F2B33D", "#3E8ED0", "#3FA66B", "#E07BB0", "#FFFFFF"];
const BULBS = ["#FFD45A", "#F49AC8", "#7FE3E0", "#C8A8F0"];

// Ambient magic that lives in world space around the camera.
type Mote = { x: number; z: number; p: number; c: string };
type Leaf = { x: number; z: number; y: number; p: number; c: string };
type Fly = { x: number; z: number; hx: number; hz: number; p: number; c: string };

export default function World2D(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const art = makeArt();
    let scale = 3, cw = 0, ch = 0;
    let roomFit: Interior | null = null; // set while inside a shop, so the room fills the screen
    const resize = () => {
      scale = Math.max(2, Math.round(Math.min(window.innerWidth / (T * 24), window.innerHeight / (T * 15))));
      if (roomFit) scale = Math.max(scale, Math.floor(Math.min((window.innerWidth + 8) / (roomFit.w * T), (window.innerHeight - 70) / (roomFit.h * T))));
      cw = Math.ceil(window.innerWidth / scale); ch = Math.ceil(window.innerHeight / scale);
      cv.width = cw; cv.height = ch;
      cv.style.width = `${cw * scale}px`; cv.style.height = `${ch * scale}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName !== "INPUT") keys.add(e.key.toLowerCase()); };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    const blur = () => keys.clear();
    window.addEventListener("blur", blur);

    let pos: { x: number; z: number } | null = null;
    let target: { x: number; z: number } | null = null;
    let myDir: Dir = "down";
    let walkT = 0, lastStep = 0, stuck = 0;
    let cam = { x: 0, z: 0 };
    let camLeft = 0, camTop = 0;
    const lastSent = { t: 0, x: 0, z: 0 };
    let nearKey = "";
    const remotes = new Map<string, { x: number; z: number; dir: Dir; walk: number }>();
    const particles: Particle[] = [];
    const seenBursts = new Set<number>();
    const seenEmotes = new Set<number>();
    const rnd = Math.random;
    const motes: Mote[] = Array.from({ length: 70 }, () => ({ x: rnd() * 40 - 20, z: rnd() * 30 - 15, p: rnd() * 10, c: SPARK[Math.floor(rnd() * 4)] }));
    const leaves: Leaf[] = Array.from({ length: 22 }, () => ({ x: rnd() * 40 - 20, z: rnd() * 30 - 15, y: rnd() * 4, p: rnd() * 10, c: ["#E38A31", "#E9BC3C", "#D0563C"][Math.floor(rnd() * 3)] }));
    const flies: Fly[] = Array.from({ length: 10 }, (_, i) => {
      const home = [[0, 0], [-19, 1], [18, 1], [-6, 10], [6, 20], [-17, -13], [17, -12], [-10, 26], [10, 40], [0, -8]][i];
      return { x: home[0], z: home[1], hx: home[0], hz: home[1], p: rnd() * 10, c: ["#F49AC8", "#FFFFFF", "#FFD45A", "#B8F4FF"][i % 4] };
    });
    const wrap = (v: number, c: number, span: number) => v - Math.round((v - c) / span) * span;

    // ---------- shops ----------
    let inside: Interior | null = null;
    const rooms = new Map<string, HTMLCanvasElement>();
    const furn = new Map<string, Sprite>();
    const posters = new Map<string, Sprite>();
    const stand = pedestal(), rug = rugSprite();
    const sprite = (k: string, make: () => Sprite) => memo(furn, k, make);
    live.current.api.enter = (id: string) => {
      const r = INTERIORS[id];
      if (!r || !pos) return;
      inside = r;
      roomFit = r; resize();
      nearKey = ""; live.current.onNear(null);
      const d = doorSpot(r);
      pos = { x: d.x, z: d.z - 0.6 };
      myDir = "up"; target = null;
      sound.click();
      live.current.onScene(id);
    };
    // Walk me home: put the farmer on the lane in front of their own farm.
    live.current.api.home = () => {
      const me = live.current.me;
      if (!me) return;
      if (inside) live.current.api.exit?.();
      const [mx, , mz] = mailboxPosition(me.farm);
      pos = { x: mx, z: mz + 1.2 };
      cam = { ...pos };
      myDir = "down"; target = null;
      nearKey = "";
    };
    live.current.api.exit = () => {
      if (!inside) return;
      const b = BUILDINGS.find((x) => x.id === inside!.id)!;
      inside = null;
      roomFit = null; resize();
      nearKey = ""; live.current.onNear(null);
      pos = { x: b.x, z: b.z + 1.1 };
      cam = { ...pos };
      myDir = "down"; target = null;
      sound.click();
      live.current.onScene(null);
    };

    // ---------- villagers ----------
    const folk = new Map(NPCS.map((n) => [n.id, { x: n.x, z: n.z, dir: "down" as Dir, walk: 0, seg: 0, pauseUntil: 0, idleAt: performance.now() + 2000 + Math.random() * 6000 }]));
    const icons = new Map<string, Sprite>();
    const armColors = new Map<string, [string, string]>();
    const confetti: { x: number; z: number; y: number; vx: number; vz: number; vy: number; c: string; born: number; spin: number }[] = [];
    const bubbles = new Map<string, { text: string; until: number }>();
    let chat: { lines: [string, string][]; i: number; next: number } | null = null;
    let nextChat = performance.now() + 2500;

    // Trailer finale (dev only): every villager, Ruth included, hurries into the town square,
    // lines up in front of the fountain, and on the beat everyone jumps and punches the air.
    const PUNCH_AT = 4800;
    type Gather = { sx: number; sz: number; tx: number; tz: number };
    let finale: { at: number; who: Map<string, Gather>; confetti: boolean } | null = null;
    const startFinale = () => {
      // two gentle arcs in front of the fountain, Ruth front and center
      const spots: [number, number][] = [];
      for (let i = 0; i < 10; i++) { const x = -5.85 + i * 1.3; spots.push([x, 3.3 - 0.05 * x * x]); }
      for (let i = 0; i < 9; i++) { const x = -5.2 + i * 1.3; spots.push([x, 5.1 - 0.04 * x * x]); }
      const order = NPCS.map((n) => n.id);
      order.splice(14, 0, "ruth");
      const who = new Map<string, Gather>();
      order.forEach((id, i) => {
        const [tx, tz] = spots[i];
        const a = Math.atan2(tz - 4, tx) + (Math.random() - 0.5) * 0.4, r = 11 + Math.random() * 3;
        who.set(id, { sx: tx + Math.cos(a) * r, sz: 4 + Math.sin(a) * r * 0.75, tx, tz });
      });
      finale = { at: performance.now(), who, confetti: false };
      chat = null; nextChat = Infinity; bubbles.clear();
    };
    // how high a gatherer is lifted and how far their arm is raised (0..1) right now
    const cheer = (i: number, now: number) => {
      if (!finale) return { lift: 0, arm: 0 };
      const local = now - finale.at - PUNCH_AT - i * 35;
      if (local < 0) return { lift: 0, arm: 0 };
      if (local < 1950) { const ph = (local % 650) / 650; return { lift: Math.round(Math.sin(ph * Math.PI) * 9), arm: ph < 0.12 ? ph / 0.12 : ph > 0.85 ? 0.5 : 1 }; }
      return { lift: Math.round(Math.max(0, Math.sin((local - 1950) / 260)) * 2), arm: 1 };
    };

    // Dev hooks so tests can drive the farmer without synthesizing clicks.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __walkTo: (x: number, z: number) => { target = { x, z }; }, __pos: () => pos && { ...pos }, __tp: (x: number, z: number) => { pos = { x, z }; cam = { x, z }; target = null; }, __finale: startFinale });

    const onDown = (e: PointerEvent) => {
      const p = live.current;
      if (p.attract || !p.canMove) return;
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / scale + camLeft, py = (e.clientY - r.top) / scale + camTop;
      target = { x: px / T, z: py / T };
    };
    cv.addEventListener("pointerdown", onDown);

    const blit = (s: Sprite, x: number, z: number, lift = 0, alpha = 1) => {
      const sx = Math.round(x * T - camLeft - s.ax), sy = Math.round(z * T - camTop - s.ay - lift);
      if (sx > cw || sy > ch || sx + s.w < 0 || sy + s.h < 0) return;
      if (alpha < 1) ctx.globalAlpha = alpha;
      ctx.drawImage(s.img, sx, sy);
      if (alpha < 1) ctx.globalAlpha = 1;
    };
    const shadow = (x: number, z: number, rx: number) => {
      const sx = x * T - camLeft, sy = z * T - camTop;
      if (sx < -40 || sy < -40 || sx > cw + 40 || sy > ch + 40) return;
      ctx.beginPath(); ctx.ellipse(Math.round(sx), Math.round(sy), rx, rx * 0.38, 0, 0, Math.PI * 2); ctx.fill();
    };

    const solids = SOLID_DECOR.concat(NPCS.filter((n) => !n.route).map((n) => ({ x: n.x, z: n.z, r: 0.5 })), [{ x: ELDER_POS[0], z: ELDER_POS[2], r: 0.5 }]);

    // Move every DOM label to its anchor. Inside a shop only that room's labels show.
    const projectLabels = () => {
      for (const [id, el] of labelEls) {
        const a = anchors.get(id);
        const here = inside ? /^(claim:|keeper$|player:|say:)/.test(id) && (!id.startsWith("player:") || id === `player:${live.current.myHex}`) : !/^(claim:|keeper$)/.test(id);
        if (!a || !here) { el.style.visibility = "hidden"; continue; }
        const sx = (a.x * T - camLeft) * scale, sy = (a.z * T - a.y * T - camTop) * scale;
        const vis = sx > -100 && sy > -40 && sx < cw * scale + 100 && sy < ch * scale + 80;
        el.style.visibility = vis ? "visible" : "hidden";
        // Crop tags hang under their plant like garden markers; everything else floats above its anchor.
        el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, ${id.startsWith("crop:") ? "0" : "-100%"})`;
        if (id.startsWith("crop:")) el.classList.toggle("far", Math.hypot(a.x - focus.x, a.z - focus.z) > 1.6);
        if (id.startsWith("claim:") && pos) el.classList.toggle("far", Math.hypot(a.x - pos.x, a.z - pos.z) > 1.4);
        // Name tags only for people close by, so the town square isn't a pile of labels.
        if ((id.startsWith("npc:") || id === "elder") && pos) el.classList.toggle("away", Math.hypot(a.x - pos.x, a.z - pos.z) > 3.5);
      }

    };

    // ---------- inside a shop ----------
    const drawInside = (r: Interior, now: number, t: number, moving: boolean) => {
      const p = live.current, here = pos!, me = p.me!;
      camLeft = Math.round((r.w * T) / 2 - cw / 2);
      camTop = Math.round((r.h * T) / 2 - ch / 2 + 6);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#2A1E1A"; ctx.fillRect(0, 0, cw, ch);
      const room = memo(rooms, r.id, () => bakeRoom(r));
      ctx.drawImage(room, -camLeft, -camTop);
      for (const f of r.furniture) {
        if (f.kind === "poster") blit(memo(posters, String(f.v ?? 0), () => poster(f.v ?? 0)), f.x, f.z + 0.2);
        if (f.kind === "rug") blit(rug, f.x, f.z);
      }
      type D = { z: number; draw: () => void; sh?: [number, number, number] };
      const list: D[] = [];
      for (const f of r.furniture) {
        if (f.kind === "poster" || f.kind === "rug") continue;
        const s = sprite(`${f.kind}${f.v ?? 0}${f.color ?? ""}${f.w ?? ""}`, () => furniture(f.kind, f.v, f.color, f.w));
        list.push({ z: f.z, draw: () => blit(s, f.x, f.z) });
      }
      const keeper = KEEPERS[r.id];
      if (keeper) {
        setAnchor("keeper", r.keeper.x, 1.8, r.keeper.z);
        const look: Dir = Math.abs(here.x - r.keeper.x) > 2 ? (here.x < r.keeper.x ? "left" : "right") : "down";
        const habit = t % 7 < 1.7 ? keeper.persona.idle : null;
        list.push({ z: r.keeper.z, sh: [r.keeper.x, r.keeper.z, 6], draw: () => {
          const fr = animalFrames(keeper.species, keeper.outfit)[look];
          blit(fr[0], r.keeper.x, r.keeper.z, Math.round(Math.max(0, Math.sin(t * 2)) * 0.8));
          if (habit) blit(memo(icons, habit, () => P.idleIcon(habit)), r.keeper.x + 0.35, r.keeper.z, 30 + Math.round((t % 7) * 4) % 6);
        } });
      }
      // Claims on display: every balance this shop handles, richest first.
      const cats = BUILDINGS.find((b) => b.id === r.id)?.place?.categories ?? [];
      const claims = p.tiles.filter((x) => cats.includes(x.category)).sort((a, b) => b.atStake - a.atStake).slice(0, r.spots.length);
      for (const [id] of anchors) if (id.startsWith("claim:") && !claims.some((c) => `claim:${c.id}` === id)) anchors.delete(id);
      claims.forEach((c, i) => {
        const at = r.spots[i];
        const harvested = p.done.includes(c.id);
        const wilt = harvested ? 0 : c.daysLeft <= 14 ? 0.8 : c.daysLeft <= 30 ? 0.45 : 0;
        const plant = memo(art.crops, `${c.category}${wilt}${harvested}`, () => P.crop(c.category, wilt, harvested));
        setAnchor(`claim:${c.id}`, at.x, -0.15, at.z);
        list.push({ z: at.z, sh: [at.x, at.z, 9], draw: () => {
          blit(stand, at.x, at.z);
          blit(plant, at.x, at.z, 8 + (harvested ? 0 : Math.round(Math.sin(t * 2 + i) * 0.6)));
          if (!harvested && c.live && c.action.kind !== "none") blit(art.coin, at.x + 0.5, at.z, 30 + Math.round(Math.sin(t * 3 + i) * 2));
        } });
      });
      setAnchor(`player:${p.myHex}`, here.x, 1.75, here.z);
      const e = p.emotes[p.myHex];
      list.push({ z: here.z, sh: [here.x, here.z, 6], draw: () => {
        const fr = animalFrames(speciesOf(me.avatar), { scarf: me.color })[myDir];
        blit(fr[moving ? Math.floor((walkT + 0.13) * 8) % 4 : 0], here.x, here.z);
        if (e && e.clip === "Interact" && now - e.at < 800) blit(art.bubbles["!"], here.x + 0.4, here.z, 30);
      } });
      ctx.fillStyle = "rgba(40, 24, 50, 0.22)";
      for (const d of list) if (d.sh) shadow(d.sh[0], d.sh[1], d.sh[2]);
      list.sort((a, b) => a.z - b.z);
      for (const d of list) d.draw();
      // warm lamp light
      const g = ctx.createRadialGradient(cw / 2, ch * 0.35, 10, cw / 2, ch * 0.35, Math.max(cw, ch) * 0.7);
      g.addColorStop(0, "rgba(255, 220, 160, 0.10)"); g.addColorStop(1, "rgba(30, 15, 30, 0.25)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
      projectLabels();

      // what's in reach
      let best: Near = null, id = "", bestD = 1.35;
      const kd = Math.hypot(here.x - r.keeper.x, here.z - r.keeper.z);
      if (keeper && kd < 2) { id = "keeper"; bestD = Math.min(bestD, kd - 0.6); best = { kind: "keeper", id: r.id, label: `Talk to ${keeper.name}` }; }
      claims.forEach((c, i) => {
        const d = Math.hypot(here.x - r.spots[i].x, here.z - r.spots[i].z);
        if (d < bestD) { bestD = d; id = `claim:${c.id}`; best = { kind: "claim", tileId: c.id, label: p.done.includes(c.id) ? `Look at ${c.title}` : `Inspect: ${c.title}` }; }
      });
      if (here.z > r.h - 1.4 && Math.abs(here.x - r.w / 2) < 1.4) { id = "exit"; best = { kind: "exit", label: "Leave (walk out the door)" }; }
      if (id !== nearKey) { nearKey = id; p.onNear(best); }
    };

    let farmSolids: Rect[] = [], farmKey = "-";
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const p = live.current;
      const me = p.me;

      // Farms change as farmers join, so their solid pieces are rebuilt when the set of claimed farms does.
      const claimedKey = [...new Set(p.players.map((pl) => pl.farm))].sort().join(",");
      if (claimedKey !== farmKey) {
        farmKey = claimedKey;
        const claimed = new Set(p.players.map((pl) => pl.farm));
        farmSolids = Array.from({ length: 8 }, (_, f) => farmRects(f, claimed.has(f))).flat();
      }

      // ---------- movement ----------
      let moving = false;
      if (me && !pos) pos = { x: me.x, z: me.z };
      if (pos && me && !p.attract) {
        let dx = 0, dz = 0;
        if (p.canMove) {
          if (keys.has("w") || keys.has("arrowup")) dz -= 1;
          if (keys.has("s") || keys.has("arrowdown")) dz += 1;
          if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
          if (keys.has("d") || keys.has("arrowright")) dx += 1;
          if (dx || dz) target = null;
          else if (target) {
            const tx = target.x - pos.x, tz = target.z - pos.z, d = Math.hypot(tx, tz);
            if (d < 0.12) target = null; else { dx = tx / d; dz = tz / d; }
          }
        }
        const len = Math.hypot(dx, dz);
        if (len > 0) {
          dx /= len; dz /= len;
          const step = SPEED * dt;
          const nx = pos.x + dx * step, nz = pos.z + dz * step;
          const before = { ...pos };
          const stop = (x: number, z: number) => (inside ? blockedInside(inside, x, z) : blocked(x, z, solids, farmSolids));
          if (!stop(nx, pos.z)) pos.x = nx;
          if (!stop(pos.x, nz)) pos.z = nz;
          moving = Math.hypot(pos.x - before.x, pos.z - before.z) > step * 0.2;
          if (!moving && target && (stuck += dt) > 0.4) { target = null; stuck = 0; }
          if (moving) stuck = 0;
          myDir = dirOf(dx, dz, myDir);
        }
        if (moving) { walkT += dt; if (now - lastStep > 300) { lastStep = now; sound.step2(); } } else walkT = 0;
        focus.x = pos.x; focus.z = pos.z;
        if (inside && pos.z > inside.h - 0.35 && Math.abs(pos.x - inside.w / 2) < 1) p.api.exit?.();
        if (!inside && p.conn && now - lastSent.t > 100 && (Math.abs(lastSent.x - pos.x) > 0.03 || Math.abs(lastSent.z - pos.z) > 0.03)) {
          lastSent.t = now; lastSent.x = pos.x; lastSent.z = pos.z;
          void p.conn.reducers.move({ x: pos.x, z: pos.z, facing: Math.atan2(dx, dz) }).catch(() => {});
        }
      }

      // ---------- camera ----------
      if (p.attract || !pos) {
        cam = { x: Math.sin(t * 0.05) * 14, z: -4 + Math.sin(t * 0.031) * 9 };
      } else {
        const k = 1 - Math.pow(0.002, dt);
        cam.x += (pos.x - cam.x) * k; cam.z += (pos.z - 0.6 - cam.z) * k;
      }
      if (finale) cam = { x: 0, z: 3.0 };
      camLeft = Math.round(Math.max(BOUNDS.x0 * T, Math.min(BOUNDS.x1 * T - cw, cam.x * T - cw / 2)));
      camTop = Math.round(Math.max(BOUNDS.z0 * T, Math.min(BOUNDS.z1 * T - ch, cam.z * T - ch / 2)));

      if (inside && pos && me) { drawInside(inside, now, t, moving); return; }

      // ---------- ground ----------
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#3E7A34"; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(art.ground.canvas, BOUNDS.x0 * T - camLeft, BOUNDS.z0 * T - camTop);
      ctx.fillStyle = "#FFFFFF";
      const W = art.ground.water;
      for (let i = 0; i < W.length; i += 2) {
        if (Math.sin(t * 2.2 + i * 1.7) < 0.9) continue;
        ctx.fillRect(W[i] + BOUNDS.x0 * T - camLeft, W[i + 1] + BOUNDS.z0 * T - camTop, 2, 1);
      }
      const owners = new Map(p.players.map((pl) => [hex(pl.identity), pl]));
      const farms = [...new Set(p.players.map((pl) => pl.farm))];
      for (const f of farms) {
        const L = farmLayout(f).field;
        ctx.drawImage(art.field, Math.round(L.x0 * T - camLeft), Math.round(L.z0 * T - camTop));
      }

      // ---------- y-sorted world ----------
      type D = { z: number; draw: () => void; sh?: [number, number, number] };
      const list: D[] = [];
      for (const b of BUILDINGS) {
        const a = art.buildings.get(b.id)!;
        list.push({ z: b.z, draw: () => blit(a.spr, b.x, b.z) });
      }
      const claimed = new Set(p.players.map((pl) => pl.farm));
      const meadows = FARM_MEADOW.flatMap((m, f) => (claimed.has(f) ? [] : m));
      for (const d of meadows.length ? DECOR.concat(meadows) : DECOR) {
        let s: Sprite | undefined;
        let sh = 0;
        if (d.kind === "tree") { s = art.trees[d.v ?? 0]; sh = 10; }
        else if (d.kind === "bush") { s = art.bushes[d.v ?? 0]; sh = 7; }
        else if (d.kind === "crystal") s = memo(art.magic, `c${d.color}`, () => P.crystal(d.color as "lilac"));
        else if (d.kind === "mushrooms") s = memo(art.magic, `m${d.color}`, () => P.mushrooms(d.color!));
        else if (DECO[d.kind]) s = memo(art.magic, `${d.kind}${d.v ?? 0}${d.color ?? ""}`, () => DECO[d.kind](d.v ?? 0, d.color));
        else if (d.kind === "banner") s = memo(art.banners, `${d.color}${d.icon}`, () => P.banner(d.color!, d.icon));
        else s = art.props[d.kind];
        if (d.kind === "lamp" || d.kind === "sign" || d.kind === "rock" || d.kind === "atm" || d.kind === "barrel" || d.kind === "topiary" || d.kind === "planter") sh = 5;
        if (d.kind === "stall" || d.kind === "well" || d.kind === "arch") sh = 12;
        if (d.kind === "fountain") sh = 0;
        if (!s) continue;
        const sprite = s;
        list.push({ z: d.z, draw: () => blit(sprite, d.x, d.z), sh: sh ? [d.x, d.z, sh] : undefined });
      }
      for (const f of farms) {
        const L = farmLayout(f);
        const owner = p.players.find((pl) => pl.farm === f)!;
        const house = memo(art.farmhouse, owner.color, () => P.building(5, { wall: f % 2 ? "plaster" : "wood", roof: mix(owner.color, "#D8743E", 0.35), door: owner.color, chimney: true, flowers: true }));
        list.push({ z: L.house.z, draw: () => blit(house.spr, L.house.x, L.house.z) });
        const flag = p.giftsWaitingFor.has(hex(owner.identity));
        const mb = memo(art.mailbox, `${owner.color}${flag}`, () => P.mailbox(owner.color, flag));
        const [mx, , mz] = mailboxPosition(f);
        list.push({ z: mz, draw: () => { blit(mb, mx, mz); if (flag) blit(art.bubbles["!"], mx, mz, 26 + Math.round(Math.sin(t * 4) * 2)); }, sh: [mx, mz, 4] });
        for (const d of L.decor) {
          const s = d.kind === "scarecrow" ? memo(art.scarecrow, owner.color, () => P.scarecrow(owner.color)) : DECO[d.kind] ? memo(art.magic, `${d.kind}0`, () => DECO[d.kind](0)) : art.props[d.kind];
          list.push({ z: d.z, draw: () => blit(s, d.x, d.z), sh: [d.x, d.z, 5] });
        }
      }
      for (const pl of p.plots) {
        const owner = owners.get(hex(pl.owner));
        if (!owner) continue;
        const [x, , z] = slotPosition(owner.farm, pl.slot);
        const wilt = pl.harvested ? 0 : pl.daysLeft <= 14 ? 0.8 : pl.daysLeft <= 30 ? 0.45 : 0;
        const s = memo(art.crops, `${pl.category}${wilt}${pl.harvested}`, () => P.crop(pl.category, wilt, pl.harvested));
        const mine = hex(pl.owner) === p.myHex;
        const sway = pl.harvested ? 0 : Math.round(Math.sin(t * 2 + pl.slot) * 0.6);
        list.push({ z, draw: () => {
          blit(s, x + sway / T, z);
          if (mine && pl.harvestable && !pl.harvested) blit(art.coin, x + 0.45, z, 22 + Math.round(Math.sin(t * 3 + pl.slot) * 2));
        } });
      }
      const drawAnimal = (species: string, outfit: Outfit, x: number, z: number, dir: Dir, walk: number, lift = 0) => {
        const fr = animalFrames(species, outfit)[dir];
        blit(fr[walk > 0 ? Math.floor(walk * 8) % 4 : 0], x, z, lift);
      };
      // a raised arm with a fist, coloured from the character's own sprite
      const armUp = (species: string, outfit: Outfit, x: number, z: number, lift: number, up: number) => {
        if (up <= 0) return;
        const s = animalFrames(species, outfit).down[0];
        const [sleeve, fur] = memo(armColors, species + JSON.stringify(outfit), () => {
          const c = s.img.getContext("2d")!;
          const at = (fx: number, fy: number) => { const d = c.getImageData(Math.floor(s.w * fx), Math.floor(s.h * fy), 1, 1).data; return d[3] > 200 ? `rgb(${d[0]},${d[1]},${d[2]})` : ""; };
          return [at(0.5, 0.72) || "#C98A4A", at(0.3, 0.32) || at(0.5, 0.2) || "#C98A4A"];
        });
        const sx = Math.round(x * T - camLeft - s.ax), sy = Math.round(z * T - camTop - s.ay - lift);
        // a short arm from the shoulder, the fist just above the ear line
        const ax = sx + Math.round(s.w * 0.74), base = sy + Math.round(s.h * 0.62);
        const top = Math.round(base - 8 * up);
        ctx.fillStyle = "#2B1A10"; ctx.fillRect(ax - 1, top, 4, base - top + 1);
        ctx.fillStyle = sleeve; ctx.fillRect(ax, top + 1, 2, base - top - 1);
        ctx.fillStyle = "#2B1A10"; ctx.fillRect(ax - 2, top - 5, 6, 6);
        ctx.fillStyle = fur; ctx.fillRect(ax - 1, top - 4, 4, 4);
        ctx.fillStyle = "#FFFFFF80"; ctx.fillRect(ax - 1, top - 4, 2, 1);
      };
      const gatherAt = (g: Gather, now: number) => {
        const k = Math.min(1, (now - finale!.at) / 3400), e = 1 - Math.pow(1 - k, 2.2);
        return { x: g.sx + (g.tx - g.sx) * e, z: g.sz + (g.tz - g.sz) * e, done: k >= 1 };
      };
      const hop = (e: Emote | undefined) => (e && e.clip === "Cheer" && now - e.at < 1200 ? Math.round(Math.abs(Math.sin(((now - e.at) / 1000) * Math.PI * 3)) * 6) : 0);
      // Villagers: wanderers walk their routes, everyone pauses to chat when a conversation starts.
      for (const n of NPCS) {
        const f = folk.get(n.id)!;
        const g = finale?.who.get(n.id);
        if (g) {
          const at = gatherAt(g, now);
          f.dir = at.done ? "down" : dirOf(at.x - f.x, at.z - f.z, f.dir); f.walk = at.done ? 0 : f.walk + dt;
          f.x = at.x; f.z = at.z;
          const c = cheer(NPCS.indexOf(n), now);
          list.push({ z: f.z, sh: [f.x, f.z, 6], draw: () => { drawAnimal(n.species, n.outfit as Outfit, f.x, f.z, f.dir, f.walk, c.lift); armUp(n.species, n.outfit as Outfit, f.x, f.z, c.lift, c.arm); } });
          continue;
        }
        if (n.route && now > f.pauseUntil) {
          const [tx, tz] = n.route[f.seg % n.route.length];
          const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
          if (d < 0.1) f.seg++;
          else { const st = Math.min(d, 1.7 * dt); f.x += (dx / d) * st; f.z += (dz / d) * st; f.dir = dirOf(dx, dz, f.dir); }
          f.walk = d < 0.1 ? 0 : f.walk + dt;
        } else f.walk = 0;
        setAnchor(`npc:${n.id}`, f.x, 1.7, f.z);
        const b = bubbles.get(n.id);
        if (b && now < b.until) setAnchor(`say:${n.id}`, f.x, 2.45, f.z); else anchors.delete(`say:${n.id}`);
        const look: Dir = n.route ? f.dir : f.dir !== "down" && now < f.pauseUntil ? f.dir : Math.sin(t * 0.3 + n.x) > 0.6 ? (n.x > 0 ? "left" : "right") : "down";
        // Their habit: every few seconds, unless they're talking, their quirk icon pops up.
        const talking = b && now < b.until;
        if (now > f.idleAt + 1800) f.idleAt = now + 3500 + Math.random() * 6000;
        const habit = !talking && now > f.idleAt ? n.persona.idle : null;
        const dozing = n.persona.idle === "zzz" && habit;
        const lift = f.walk ? 0 : dozing ? 0 : n.persona.idle === "alert" && habit ? Math.round(Math.abs(Math.sin(t * 9)) * 3) : Math.round(Math.max(0, Math.sin(t * 2 + n.x)) * 0.8);
        list.push({ z: f.z, draw: () => {
          drawAnimal(n.species, n.outfit as Outfit, f.x, f.z, dozing ? "down" : look, f.walk, lift);
          if (habit) blit(memo(icons, habit, () => P.idleIcon(habit)), f.x + 0.35, f.z, 30 + Math.round((now - f.idleAt) / 120) % 6);
        }, sh: [f.x, f.z, 6] });
      }
      // Small talk: start a conversation between two villagers standing near each other, near you.
      if (!chat && now > nextChat) {
        const close = CHATTER.filter((c) => {
          const A = folk.get(c.a)!, B = folk.get(c.b)!;
          return Math.hypot(A.x - B.x, A.z - B.z) < 3.4 && (!pos || Math.hypot(A.x - pos.x, A.z - pos.z) < 15);
        });
        if (close.length) {
          const c = close[Math.floor(Math.random() * close.length)];
          const fill = (txt: string) => txt.replace("{player}", p.me?.name ?? "A farmer").replace("{rescued}", usd(p.me?.rescued ?? 0));
          chat = { lines: c.lines.map(([who, txt]) => [who === 0 ? c.a : c.b, fill(txt)] as [string, string]), i: 0, next: now };
          const A = folk.get(c.a)!, B = folk.get(c.b)!;
          const until = now + c.lines.length * 2900 + 600;
          A.pauseUntil = B.pauseUntil = until;
          A.dir = dirOf(B.x - A.x, B.z - A.z, A.dir); B.dir = dirOf(A.x - B.x, A.z - B.z, B.dir);
        } else nextChat = now + 1500;
      }
      if (chat && now >= chat.next) {
        if (chat.i < chat.lines.length) {
          const [who, txt] = chat.lines[chat.i++];
          bubbles.set(who, { text: txt, until: now + 2800 });
          const el = labelEls.get(`say:${who}`);
          if (el) el.firstElementChild!.textContent = txt;
          chat.next = now + 2900;
        } else { chat = null; nextChat = now + 4000 + Math.random() * 5000; }
      }
      // Ruth, the Reviewer: an alpaca in reading glasses behind her audit desk.
      {
        const m = p.ruthMood;
        const age = m ? now - m.at : 1e9;
        const shake = m?.kind === "reject" && age < 700 ? Math.round(Math.sin(age / 30) * 1.5) / T : 0;
        const lift = m?.kind === "approve" && age < 1000 ? Math.round(Math.abs(Math.sin((age / 1000) * Math.PI * 3)) * 5) : 0;
        const g = finale?.who.get("ruth");
        if (g) {
          const at = gatherAt(g, now), c = cheer(NPCS.length, now), ro = { glasses: true, scarf: "#6A4C93" };
          const dir = at.done ? "down" : dirOf(g.tx - g.sx, g.tz - g.sz, "down");
          list.push({ z: at.z, sh: [at.x, at.z, 6], draw: () => { drawAnimal("alpaca", ro, at.x, at.z, dir, at.done ? 0 : now / 1000, c.lift); armUp("alpaca", ro, at.x, at.z, c.lift, c.arm); } });
        }
        const [ex, , ez] = ELDER_POS;
        if (!g) list.push({ z: ez, sh: [ex, ez, 6], draw: () => {
          drawAnimal("alpaca", { glasses: true, scarf: "#6A4C93" }, ex + shake, ez, "down", 0, lift);
          if (m?.kind === "thinking") blit(art.bubbles["..."], ex + 0.4, ez, 30);
          if (m?.kind === "reject" && age < 2500) blit(art.bubbles.x, ex + 0.4, ez, 30);
          if (m?.kind === "approve" && age < 2500) blit(art.bubbles.check, ex + 0.4, ez, 30);
        } });
      }
      // farmers
      for (const pl of p.players) {
        const h = hex(pl.identity);
        if (h === p.myHex) continue;
        if (!pl.online || finale) continue;
        const r = memo(remotes, h, () => ({ x: pl.x, z: pl.z, dir: "down" as Dir, walk: 0 }));
        const dx = pl.x - r.x, dz = pl.z - r.z, d = Math.hypot(dx, dz);
        const k = 1 - Math.pow(0.0005, dt);
        r.x += dx * k; r.z += dz * k;
        if (d > 0.04) { r.walk += dt; r.dir = dirOf(dx, dz, r.dir); } else r.walk = 0;
        if (d > 6) { r.x = pl.x; r.z = pl.z; }
        setAnchor(`player:${h}`, r.x, 1.75, r.z);
        const e = p.emotes[h];
        list.push({ z: r.z, sh: [r.x, r.z, 6], draw: () => drawAnimal(speciesOf(pl.avatar), { scarf: pl.color }, r.x, r.z, r.dir, r.walk, hop(e)) });
      }
      if (me && pos && !finale) {
        const here = pos;
        setAnchor(`player:${p.myHex}`, here.x, 1.75, here.z);
        const e = p.emotes[p.myHex];
        list.push({ z: here.z, sh: [here.x, here.z, 6], draw: () => {
          drawAnimal(speciesOf(me.avatar), { scarf: me.color }, here.x, here.z, myDir, moving ? walkT + 0.13 : 0, hop(e));
          if (e && e.clip === "Interact" && now - e.at < 800) blit(art.bubbles["!"], here.x + 0.4, here.z, 30);
        } });
      }
      // emote side effects: hearts on a cheer
      for (const [h, e] of Object.entries(p.emotes)) {
        if (!e || e.clip !== "Cheer" || seenEmotes.has(e.at)) continue;
        seenEmotes.add(e.at);
        const who = h === p.myHex ? pos : remotes.get(h);
        if (!who) continue;
        for (let i = 0; i < 5; i++) particles.push({ kind: "heart", x: who.x + (Math.random() - 0.5) * 0.8, z: who.z, y: 1.6, vx: (Math.random() - 0.5) * 0.6, vz: 0, vy: 1.2 + Math.random(), born: now + i * 120, life: 1400 });
      }
      // coin bursts
      for (const b of p.bursts) {
        if (seenBursts.has(b.id)) continue;
        seenBursts.add(b.id);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          particles.push({ kind: "coin", x: b.at[0], z: b.at[2], y: 0.8, vx: Math.cos(a) * (1 + Math.random() * 1.6), vz: Math.sin(a) * (0.6 + Math.random()), vy: 4 + Math.random() * 3, born: now, life: 1600 });
        }
        setTimeout(() => p.onBurstDone(b.id), 2000);
      }

      ctx.fillStyle = "rgba(40, 24, 50, 0.22)";
      for (const d of list) if (d.sh) shadow(d.sh[0], d.sh[1], d.sh[2]);
      list.sort((a, b) => a.z - b.z);
      for (const d of list) d.draw();
      if (finale && !finale.confetti && now - finale.at > PUNCH_AT) {
        finale.confetti = true;
        for (let i = 0; i < 260; i++) {
          const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
          confetti.push({ x: (Math.random() - 0.5) * 1.2, z: 1.0, y: 2.6, vx: Math.cos(a) * v * 0.9, vz: Math.sin(a) * v * 0.35, vy: 5 + Math.random() * 6,
            c: ["#FFD23F", "#E2574C", "#4FA3E3", "#7BC86C", "#E07BB0", "#FFFFFF", "#8E5BD0"][i % 7], born: now, spin: Math.random() * 6 });
        }
      }
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i], age = (now - c.born) / 1000;
        if (age > 6) { confetti.splice(i, 1); continue; }
        // a floaty fall: gravity with lots of drag and a sideways flutter
        const fall = Math.max(-1.6, c.vy - 9 * age);
        c.x += (c.vx * Math.exp(-age * 1.6) + Math.sin(age * 5 + c.spin) * 0.25) * dt; c.z += c.vz * Math.exp(-age * 1.6) * dt;
        c.y = Math.max(0, c.y + fall * dt);
        ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x * T - camLeft), Math.round((c.z - c.y) * T - camTop), Math.sin(age * 9 + c.spin) > 0 ? 3 : 1, 3);
      }

      const star = (sx: number, sy: number, c: string, big: boolean) => {
        ctx.fillStyle = c;
        ctx.fillRect(sx, sy, 1, 1);
        if (big) { ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); }
      };

      // ---------- particles ----------
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        const age = now - q.born;
        if (age < 0) continue;
        if (age > q.life) { particles.splice(i, 1); continue; }
        q.x += q.vx * dt; q.z += q.vz * dt;
        if (q.kind === "coin") { q.vy -= 12 * dt; q.y = Math.max(0, q.y + q.vy * dt); if (q.y === 0) { q.vy *= -0.4; q.vx *= 0.6; q.vz *= 0.6; } }
        else q.y += q.vy * dt;
        if (q.kind === "spark") {
          ctx.globalAlpha = Math.min(1, (q.life - age) / 500);
          star(Math.round(q.x * T - camLeft), Math.round((q.z - q.y) * T - camTop), q.color ?? "#FFFFFF", Math.sin(age / 90) > 0.3);
          ctx.globalAlpha = 1;
          continue;
        }
        const s = q.kind === "coin" ? art.coin : art.heart;
        blit(s, q.x, q.z, q.y * T, Math.min(1, (q.life - age) / 400));
      }

      // ---------- magic ----------
      if (Math.random() < dt * 9) particles.push({ kind: "spark", x: FOUNTAIN.x + (Math.random() - 0.5) * 0.5, z: FOUNTAIN.z - 0.1, y: 1.3, vx: (Math.random() - 0.5) * 0.8, vz: 0, vy: 1 + Math.random() * 1.2, born: now, life: 1600, color: SPARK[Math.floor(Math.random() * 4)] });
      const vw = cw / T, vh = ch / T, cxw = (camLeft + cw / 2) / T, czw = (camTop + ch / 2) / T;
      for (const m of motes) {
        m.x = wrap(m.x + Math.sin(t * 0.3 + m.p) * dt * 0.3, cxw, vw + 4);
        m.z = wrap(m.z - dt * 0.25, czw, vh + 4);
        const tw = Math.sin(t * 2.4 + m.p * 3);
        if (tw < 0.1) continue;
        ctx.globalAlpha = Math.min(1, tw * 1.2);
        star(Math.round(m.x * T - camLeft), Math.round(m.z * T - camTop - 12 - Math.sin(t + m.p) * 6), m.c, tw > 0.85);
      }
      ctx.globalAlpha = 1;
      for (const l of leaves) {
        l.y -= dt * 0.55;
        l.x += (Math.sin(t * 1.3 + l.p) * 0.9 + 0.4) * dt;
        if (l.y < 0) { l.y = 3 + Math.random() * 3; l.x = cxw + (Math.random() - 0.5) * vw; l.z = czw + (Math.random() - 0.5) * vh; }
        l.x = wrap(l.x, cxw, vw + 4); l.z = wrap(l.z, czw, vh + 4);
        const sx = Math.round(l.x * T - camLeft), sy = Math.round((l.z - l.y) * T - camTop);
        ctx.fillStyle = l.c;
        if (Math.sin(t * 5 + l.p) > 0) ctx.fillRect(sx, sy, 2, 1); else ctx.fillRect(sx, sy, 1, 2);
      }
      for (const f of flies) {
        f.x = f.hx + Math.sin(t * 0.5 + f.p) * 2.5 + Math.sin(t * 1.7 + f.p * 2) * 0.6;
        f.z = f.hz + Math.cos(t * 0.4 + f.p) * 1.8;
        const sx = Math.round(f.x * T - camLeft), sy = Math.round(f.z * T - camTop - 14 - Math.abs(Math.sin(t * 3 + f.p)) * 4);
        if (sx < -4 || sy < -4 || sx > cw + 4 || sy > ch + 4) continue;
        const open = Math.sin(t * 18 + f.p) > 0;
        ctx.fillStyle = f.c;
        if (open) { ctx.fillRect(sx - 2, sy - 1, 2, 2); ctx.fillRect(sx + 1, sy - 1, 2, 2); } else { ctx.fillRect(sx - 1, sy - 2, 1, 2); ctx.fillRect(sx + 1, sy - 2, 1, 2); }
        ctx.fillStyle = "#3A2420"; ctx.fillRect(sx, sy - 1, 1, 2);
      }
      // fairy lights strung between the lamps
      const bulbs: [number, number, string][] = [];
      for (const [x0, z0, x1, z1] of STRINGS) {
        const ax = x0 * T - camLeft, ay = z0 * T - camTop - 22, bx = x1 * T - camLeft, by = z1 * T - camTop - 22;
        if (Math.max(ax, bx) < -10 || Math.min(ax, bx) > cw + 10 || Math.max(ay, by) < -20 || Math.min(ay, by) > ch + 30) continue;
        const len = Math.hypot(bx - ax, by - ay), steps = Math.max(2, Math.round(len / 2));
        ctx.fillStyle = "#4A3A30";
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, sag = Math.sin(u * Math.PI) * Math.min(14, len * 0.08);
          const x = Math.round(ax + (bx - ax) * u), y = Math.round(ay + (by - ay) * u + sag);
          ctx.fillRect(x, y, 1, 1);
          if (i % 4 === 2) bulbs.push([x, y + 1, BULBS[(i / 4 + Math.round(x0)) & 3]]);
        }
      }
      for (const [x, y, c] of bulbs) { ctx.fillStyle = c; ctx.fillRect(x, y, 2, 2); }
      // festival bunting: little triangle pennants that sway in the breeze
      for (const [x0, z0, x1, z1] of BUNTING) {
        const ax = x0 * T - camLeft, ay = z0 * T - camTop - 30, bx = x1 * T - camLeft, by = z1 * T - camTop - 30;
        if (Math.max(ax, bx) < -10 || Math.min(ax, bx) > cw + 10 || Math.max(ay, by) < -30 || Math.min(ay, by) > ch + 30) continue;
        const len = Math.hypot(bx - ax, by - ay), steps = Math.max(2, Math.round(len / 2));
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, sag = Math.sin(u * Math.PI) * Math.min(18, len * 0.1);
          const x = Math.round(ax + (bx - ax) * u), y = Math.round(ay + (by - ay) * u + sag);
          ctx.fillStyle = "#5A4A3E"; ctx.fillRect(x, y, 1, 1);
          if (i % 5 === 0 && i > 0 && i < steps) {
            const sway = Math.round(Math.sin(t * 2.2 + i) * 1);
            ctx.fillStyle = FLAGS[(i / 5) % FLAGS.length];
            for (let k = 0; k < 5; k++) ctx.fillRect(x - 2 + Math.ceil(k / 2) + sway * (k > 2 ? 1 : 0), y + 1 + k, Math.max(1, 5 - k * 1.2 | 0), 1);
          }
        }
      }

      // ---------- day and night ----------
      const n = p.attract ? 0.15 : nightAmount();
      if (n > 0.01) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = n < 0.5 ? mix("#FFFFFF", "#F2B88C", n * 1.2) : mix("#F2B88C", "#4A5A9C", Math.min(1, (n - 0.5) * 2.2));
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalCompositeOperation = "lighter";
        const glow = (x: number, y: number, r: number, a: number) => {
          if (x < -r || y < -r || x > cw + r || y > ch + r) return;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(255, 200, 110, ${a})`); g.addColorStop(1, "rgba(255, 200, 110, 0)");
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        };
        for (const d of DECOR) if (d.kind === "lamp") glow(d.x * T - camLeft, d.z * T - camTop - 20, 34, 0.5 * n);
        for (const b of BUILDINGS) {
          const a = art.buildings.get(b.id)!;
          for (const w of a.windows) {
            const x = b.x * T - camLeft - a.spr.ax + w.x, y = b.z * T - camTop - a.spr.ay + w.y;
            ctx.fillStyle = `rgba(255, 190, 90, ${0.75 * n})`; ctx.fillRect(x, y, w.w, w.h);
            glow(x + w.w / 2, y + w.h / 2, 18, 0.35 * n);
          }
        }
        if (n > 0.4) {
          ctx.fillStyle = `rgba(255, 240, 140, ${(n - 0.4) * 1.4})`;
          for (let i = 0; i < 40; i++) {
            const fx = ((i * 97.3 + Math.sin(t * 0.4 + i) * 30) % (cw + 40)) - 20, fy = ((i * 61.7 + Math.cos(t * 0.3 + i * 2) * 20) % (ch + 40)) - 20;
            if (Math.sin(t * 3 + i) > 0.2) ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // magic glows all day, brighter after dusk
      {
        ctx.globalCompositeOperation = "lighter";
        const halo = (x: number, y: number, r: number, rgbS: string, a: number) => {
          if (x < -r || y < -r || x > cw + r || y > ch + r) return;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${rgbS}, ${a})`); g.addColorStop(1, `rgba(${rgbS}, 0)`);
          ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        };
        const k = 0.35 + n * 0.65;
        for (const d of DECOR) {
          if (d.kind !== "crystal" && d.kind !== "mushrooms") continue;
          const pulse = 0.75 + Math.sin(t * 2 + d.x) * 0.25;
          halo(d.x * T - camLeft, d.z * T - camTop - (d.kind === "crystal" ? 10 : 5), d.kind === "crystal" ? 26 : 18, GLOWS[d.color!] ?? "255, 255, 255", 0.45 * k * pulse);
        }
        halo(FOUNTAIN.x * T - camLeft, FOUNTAIN.z * T - camTop - 14, 40, "127, 227, 224", 0.3 * k);
        for (const [x, y, c] of bulbs) { const v = parseInt(c.slice(1), 16); halo(x + 1, y + 1, 6, `${v >> 16}, ${(v >> 8) & 255}, ${v & 255}`, 0.5 * k); }
        ctx.globalCompositeOperation = "source-over";
      }

      projectLabels();

      // ---------- what's in reach ----------
      if (!pos || !me || p.attract) return;
      let best: Near = null, bestD = REACH, id = "";
      for (const pl of p.plots) {
        if (hex(pl.owner) !== p.myHex) continue;
        const [x, , z] = slotPosition(me.farm, pl.slot);
        const d = Math.hypot(pos.x - x, pos.z - z);
        if (d < bestD) { bestD = d; id = pl.tileId; best = { kind: "crop", tileId: pl.tileId, label: pl.harvested ? `Look at ${pl.title}` : `Inspect ${pl.title} (${usd(pl.atStake)})` }; }
      }
      for (const b of BUILDINGS) {
        if (!b.place) continue;
        const dr = doorOf(b);
        const d = Math.hypot(pos.x - dr.x, pos.z - dr.z);
        if (d < bestD) { bestD = d; id = `place:${b.id}`; best = { kind: "place", id: b.id, place: b.place, label: `Enter ${b.place.name}` }; }
      }
      for (const n of NPCS) {
        const f = folk.get(n.id)!;
        const d = Math.hypot(pos.x - f.x, pos.z - f.z);
        if (d < Math.min(bestD, 1.5)) { bestD = d; id = `npc:${n.id}`; best = { kind: "npc", id: n.id, label: `Talk to ${n.name}` }; }
      }
      if (Math.hypot(pos.x - ELDER_POS[0], pos.z - (ELDER_POS[2] + 1.6)) < REACH + 0.3) { id = "elder"; best = { kind: "elder", label: "Talk to Ruth, the Reviewer" }; }
      // the end of the pond dock is a fishing spot
      if (pos.x > -13.6 && pos.x < -11.4 && pos.z < -14.6 && pos.z > -17.4) { id = "fish"; best = { kind: "fish", label: "Go fishing" }; }
      // the north bluff lookout: slingshot balloons; the east meadow: bug catching
      if (Math.hypot(pos.x + 4.6, pos.z + 25.8) < 2.2) { id = "balloons"; best = { kind: "balloons", label: "Shoot gift balloons" }; }
      if (Math.hypot(pos.x - 27.5, pos.z - 26) < 3) { id = "bugs"; best = { kind: "bugs", label: "Catch bugs" }; }
      const [mx, , mz] = mailboxPosition(me.farm);
      if (p.myGiftCount > 0 && Math.hypot(pos.x - mx, pos.z - mz) < REACH) { id = "mailbox"; best = { kind: "mailbox", label: "Open your letter" }; }
      if (id !== nearKey) { nearKey = id; p.onNear(best); }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur);
      cv.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return <canvas ref={canvas} className="ev-canvas" />;
}
