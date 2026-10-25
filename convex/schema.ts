import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Expire's saved state per farmer, plus the rescued-money ledger as real rows so it can be queried.
export default defineSchema({
  states: defineTable({ pid: v.string(), data: v.string(), updatedAt: v.number() }).index("by_pid", ["pid"]),
  ledger: defineTable({
    pid: v.string(), entryId: v.string(), tileId: v.string(), amount: v.number(), description: v.string(), confirmation: v.string(), at: v.string(),
  }).index("by_pid", ["pid", "entryId"]),
  // Ruth's record of work: every extraction, review, dispatch and ledger move, per farmer.
  audit: defineTable({ pid: v.string(), at: v.string(), type: v.string(), detail: v.string() }).index("by_pid", ["pid", "at"]),
});
