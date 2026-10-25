import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppState, Balance, Category } from "../types";
import { advise } from "./advise";

process.env.EXPIRE_MOCK_CLAUDE = "1";

const bal = (id: string, category: Category, label: string, amount: number, text: string, deadline = "2099-12-31"): Balance => ({
  id, category, label, amount, deadline, ruleText: "", source: { doc: "d", start: 0, end: text.length, text },
});

const state = (balances: Balance[], done: string[] = []): AppState => ({
  docs: [], reviews: {}, ledger: [], audit: [], done,
  extraction: { balances, careItems: [], patterns: [], facts: {}, dropped: [], engine: "mock" },
  tiles: balances.map((b) => ({ id: `tile_${b.id}`, balanceIds: [b.id], category: b.category, title: b.label, deadline: b.deadline, daysLeft: 7, atStake: b.amount } as AppState["tiles"][number])),
});

const S = state([
  bal("saks", "card_credit", "American Express Platinum Saks credit", 50, "Saks credit: not used"),
  bal("fsa", "fsa", "Health FSA balance", 100, "Current balance: $100.00"),
  bal("learn", "stipend", "Learning stipend", 300, "My learning stipend left: $300."),
]);

test("Saks credit is capped at the remaining balance and cites its line", async () => {
  const a = await advise({ merchant: "Saks Fifth Avenue", items: [{ name: "Cashmere scarf", price: 120 }] }, S);
  const best = a.options[a.best];
  assert.equal(best.benefitId, "saks");
  assert.equal(best.rescued, 50);
  assert.equal(best.cite, "Saks credit: not used");
  assert.match(a.splits ?? "", /\$70\.00 on your everyday card/);
});

test("FSA covers only eligible pharmacy items (SPF 15+, not aloe)", async () => {
  const a = await advise({ merchant: "CVS", items: [{ name: "Sunscreen SPF 50", price: 14 }, { name: "Bandages", price: 6 }, { name: "Aloe gel", price: 8 }, { name: "Tanning oil SPF 4", price: 9 }] }, S);
  const fsa = a.options.find((o) => o.benefitId === "fsa")!;
  assert.equal(fsa.rescued, 20);
  assert.deepEqual(fsa.items, ["Sunscreen SPF 50", "Bandages"]);
  assert.ok(a.notes.some((n) => /Aloe gel/.test(n)));
  assert.ok(a.notes.some((n) => /SPF 4/.test(n)));
});

test("never invents a benefit the user doesn't have", async () => {
  const a = await advise({ merchant: "Uber Eats", items: [{ name: "Burrito", price: 18 }] }, S);
  assert.equal(a.options.length, 1);
  assert.equal(a.options[0].benefitId, undefined);
  assert.equal(a.options[0].rescued, 0);
  assert.equal(a.engine, "rules");
});

test("a used-up credit is skipped and rescue never exceeds the price", async () => {
  const used = state(S.extraction!.balances, ["tile_saks"]);
  const a = await advise({ merchant: "Saks", items: [{ name: "Gloves", price: 30 }] }, used);
  assert.ok(!a.options.some((o) => o.benefitId === "saks"));
  const b = await advise({ merchant: "Bookstore", items: [{ name: "Textbook", price: 42.5 }] }, S);
  assert.equal(b.options[0].benefitId, "learn");
  assert.equal(b.options[0].rescued, 42.5);
});
