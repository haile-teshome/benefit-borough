import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => (await ctx.db.query("states").withIndex("by_pid", (q) => q.eq("pid", pid)).unique())?.data ?? null,
});

const Event = v.object({ at: v.string(), type: v.string(), detail: v.string() });
const Entry = v.object({ id: v.string(), tileId: v.string(), amount: v.number(), description: v.string(), confirmation: v.string(), at: v.string() });

// Upsert the state blob and append any ledger entries Convex hasn't seen yet. A reset clears both.
export const put = mutation({
  args: { pid: v.string(), data: v.string(), ledger: v.array(Entry), audit: v.optional(v.array(Event)) },
  handler: async (ctx, { pid, data, ledger, audit = [] }) => {
    const row = await ctx.db.query("states").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
    else await ctx.db.insert("states", { pid, data, updatedAt: Date.now() });
    const have = await ctx.db.query("ledger").withIndex("by_pid", (q) => q.eq("pid", pid)).collect();
    if (!ledger.length) for (const r of have) await ctx.db.delete(r._id);
    const seen = new Set(have.map((r) => r.entryId));
    for (const e of ledger) if (!seen.has(e.id)) await ctx.db.insert("ledger", { pid, entryId: e.id, tileId: e.tileId, amount: e.amount, description: e.description, confirmation: e.confirmation, at: e.at });
    // Audit events are append-only; a reset (empty audit) clears the farmer's trail.
    const last = await ctx.db.query("audit").withIndex("by_pid", (q) => q.eq("pid", pid)).order("desc").first();
    if (!audit.length) for (const r of await ctx.db.query("audit").withIndex("by_pid", (q) => q.eq("pid", pid)).collect()) await ctx.db.delete(r._id);
    for (const e of [...audit].reverse()) if (!last || e.at > last.at) await ctx.db.insert("audit", { pid, ...e });
  },
});

// The valley's latest rescues, newest first, for the live feed.
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 6 }) =>
    (await ctx.db.query("ledger").order("desc").take(limit)).map(({ pid, amount, description, at, confirmation }) => ({ pid, amount, description, at, confirmation })),
});

// One farmer's audit trail, newest first.
export const trail = query({
  args: { pid: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { pid, limit = 40 }) =>
    (await ctx.db.query("audit").withIndex("by_pid", (q) => q.eq("pid", pid)).order("desc").take(limit)).map(({ at, type, detail }) => ({ at, type, detail })),
});

// Everyone's rescued total, for a valley-wide leaderboard.
export const totals = query({
  args: {},
  handler: async (ctx) => {
    const sums = new Map<string, number>();
    for (const r of await ctx.db.query("ledger").collect()) sums.set(r.pid, (sums.get(r.pid) ?? 0) + r.amount);
    return [...sums].map(([pid, total]) => ({ pid, total })).sort((a, b) => b.total - a.total);
  },
});

// Rescued totals per farmer since a date (ISO), for the Almanac's quarter/year leaderboards.
export const board = query({
  args: { since: v.optional(v.string()) },
  handler: async (ctx, { since }) => {
    const sums = new Map<string, number>();
    for (const r of await ctx.db.query("ledger").collect()) if (!since || r.at >= since) sums.set(r.pid, (sums.get(r.pid) ?? 0) + r.amount);
    return [...sums].map(([pid, total]) => ({ pid, total })).sort((a, b) => b.total - a.total);
  },
});
