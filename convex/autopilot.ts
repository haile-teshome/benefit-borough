import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// Ruth's Autopilot schedule. The mandate (on/off, the hour, your timezone) lives here; a cron
// checks every 5 minutes and marks a farmer due once per local night. Ruth only prepares claims on
// a shift; submitting is always yours.

const localDay = (tzOffset: number, now = Date.now()) => new Date(now - tzOffset * 60_000).toISOString().slice(0, 10);
const localHour = (tzOffset: number, now = Date.now()) => new Date(now - tzOffset * 60_000).getUTCHours();

export const setMandate = mutation({
  args: { pid: v.string(), on: v.boolean(), hour: v.number(), tzOffset: v.number() },
  handler: async (ctx, { pid, on, hour, tzOffset }) => {
    const row = await ctx.db.query("mandates").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    if (row) await ctx.db.patch(row._id, { on, hour, tzOffset, due: on && row.due });
    else await ctx.db.insert("mandates", { pid, on, hour, tzOffset, due: false, lastRun: "" });
  },
});

export const get = query({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => {
    const m = await ctx.db.query("mandates").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    return m ? { on: m.on, hour: m.hour, due: m.due, lastRun: m.lastRun, lastReport: m.lastReport ?? null } : null;
  },
});

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const m of await ctx.db.query("mandates").collect()) {
      if (!m.on || m.due) continue;
      if (localHour(m.tzOffset) >= m.hour && m.lastRun !== localDay(m.tzOffset)) await ctx.db.patch(m._id, { due: true });
    }
  },
});

export const due = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("mandates").withIndex("by_due", (q) => q.eq("due", true)).collect()).map((m) => m.pid),
});

// The app server claims a due shift before running it, so two servers never run the same night.
export const claim = mutation({
  args: { pid: v.string() },
  handler: async (ctx, { pid }) => {
    const m = await ctx.db.query("mandates").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    if (!m || !m.due) return false;
    await ctx.db.patch(m._id, { due: false, lastRun: localDay(m.tzOffset) });
    return true;
  },
});

export const reported = mutation({
  args: { pid: v.string(), summary: v.string() },
  handler: async (ctx, { pid, summary }) => {
    const m = await ctx.db.query("mandates").withIndex("by_pid", (q) => q.eq("pid", pid)).unique();
    if (m) await ctx.db.patch(m._id, { lastReport: summary });
  },
});
