import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => (await ctx.db.query("states").withIndex("by_pid", (q) => q.eq("pid", pid)).unique())?.data ?? null,
});

const Entry = v.object({ id: v.string(), tileId: v.string(), amount: v.number(), description: v.string(), confirmation: v.string(), at: v.string() });

// Upsert the state blob and append any ledger entries Convex hasn't seen yet. A reset clears both.
export const put = mutation({
  args: { pid: v.string(), data: v.string(), ledger: v.array(Entry) },
  handler: async (ctx, { pid, data, ledger }) => {
    const row = await ctx.db.query("states").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    if (row) await ctx.db.patch(row._id, { data, updatedAt: Date.now() });
    else await ctx.db.insert("states", { pid, data, updatedAt: Date.now() });
    const have = await ctx.db.query("ledger").withIndex("by_pid", (q) => q.eq("pid", pid)).collect();
    if (!ledger.length) for (const r of have) await ctx.db.delete(r._id);
    const seen = new Set(have.map((r) => r.entryId));
    for (const e of ledger) if (!seen.has(e.id)) await ctx.db.insert("ledger", { pid, entryId: e.id, tileId: e.tileId, amount: e.amount, description: e.description, confirmation: e.confirmation, at: e.at });
  },
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
