import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Co-op households. Members see each other's open claims, deadlines and Ruth's prepared packets,
// live, and can co-sign a packet ("I checked this too") before its owner submits it.

const code = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");

export const create = mutation({
  args: { pid: v.string(), name: v.string(), color: v.string(), house: v.string() },
  handler: async (ctx, { pid, name, color, house }) => {
    for (const m of await ctx.db.query("members").withIndex("by_pid", (q) => q.eq("pid", pid)).collect()) await ctx.db.delete(m._id);
    const c = code();
    await ctx.db.insert("households", { code: c, name: house.slice(0, 40) || "Our burrow", createdBy: pid });
    await ctx.db.insert("members", { code: c, pid, name: name.slice(0, 20), color, joinedAt: Date.now() });
    return c;
  },
});

export const join = mutation({
  args: { pid: v.string(), name: v.string(), color: v.string(), code: v.string() },
  handler: async (ctx, { pid, name, color, code: c }) => {
    const house = await ctx.db.query("households").withIndex("by_code", (q) => q.eq("code", c.toUpperCase())).unique();
    if (!house) throw new Error("No household with that code");
    for (const m of await ctx.db.query("members").withIndex("by_pid", (q) => q.eq("pid", pid)).collect()) await ctx.db.delete(m._id);
    if ((await ctx.db.query("members").withIndex("by_code", (q) => q.eq("code", house.code)).collect()).length >= 6) throw new Error("That household is full");
    await ctx.db.insert("members", { code: house.code, pid, name: name.slice(0, 20), color, joinedAt: Date.now() });
    return house.code;
  },
});

export const leave = mutation({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => { for (const m of await ctx.db.query("members").withIndex("by_pid", (q) => q.eq("pid", pid)).collect()) await ctx.db.delete(m._id); },
});

export const cosign = mutation({
  args: { pid: v.string(), code: v.string(), packetId: v.string(), owner: v.string() },
  handler: async (ctx, { pid, code: c, packetId, owner }) => {
    const me = (await ctx.db.query("members").withIndex("by_pid", (q) => q.eq("pid", pid)).collect()).find((m) => m.code === c);
    if (!me || pid === owner) throw new Error("Only another member can co-sign");
    await ctx.db.insert("cosigns", { code: c, packetId, owner, by: pid, at: Date.now() });
  },
});

type Tile = { id: string; title: string; atStake: number; daysLeft: number; live: boolean };
type Packet = { id: string; tileId: string; form: string; amount: number; status: string };
type State = { tiles?: Tile[]; done?: string[]; ledger?: { amount: number }[]; packets?: Packet[] };

// My household, with every member's live numbers read from their saved farm.
export const mine = query({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => {
    const me = await ctx.db.query("members").withIndex("by_pid", (q) => q.eq("pid", pid)).first();
    if (!me) return null;
    const house = await ctx.db.query("households").withIndex("by_code", (q) => q.eq("code", me.code)).unique();
    const cosigns = await ctx.db.query("cosigns").withIndex("by_code", (q) => q.eq("code", me.code)).collect();
    const members = [];
    for (const m of await ctx.db.query("members").withIndex("by_code", (q) => q.eq("code", me.code)).collect()) {
      const row = await ctx.db.query("states").withIndex("by_pid", (q) => q.eq("pid", m.pid)).unique();
      const s: State = row ? JSON.parse(row.data) : {};
      const done = new Set(s.done ?? []);
      const open = (s.tiles ?? []).filter((t) => t.live && !done.has(t.id) && t.atStake > 0).sort((a, b) => a.daysLeft - b.daysLeft);
      members.push({
        pid: m.pid, name: m.name, color: m.color, you: m.pid === pid,
        open: open.reduce((x, t) => x + t.atStake, 0), rescued: (s.ledger ?? []).reduce((x, l) => x + l.amount, 0),
        soon: open.slice(0, 4).map((t) => ({ title: t.title, atStake: t.atStake, daysLeft: t.daysLeft })),
        ready: (s.packets ?? []).filter((p) => p.status === "ready").map((p) => ({ id: p.id, form: p.form, amount: p.amount, cosignedBy: cosigns.filter((c) => c.packetId === p.id && c.owner === m.pid).map((c) => c.by) })),
      });
    }
    return { code: me.code, name: house?.name ?? "Our burrow", members };
  },
});
