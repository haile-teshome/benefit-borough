import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_DOCS } from "../documents";
import { extract } from "./extract";
import { optimize } from "./optimize";
import { ruleCheck } from "./reviewer";

process.env.EXPIRE_MOCK_CLAUDE = "1";
const docsText = SAMPLE_DOCS.map((d) => d.text).join("\n");

test("extraction grounds every balance in a verbatim span", async () => {
  const ex = await extract(SAMPLE_DOCS);
  assert.equal(ex.dropped.length, 0);
  for (const b of ex.balances) {
    const doc = SAMPLE_DOCS.find((d) => d.id === b.source.doc)!;
    assert.equal(doc.text.slice(b.source.start, b.source.end), b.source.text);
  }
});

test("ungrounded claims are dropped", async () => {
  const docs = SAMPLE_DOCS.filter((d) => d.id !== "cards");
  const ex = await extract(docs);
  assert.ok(!ex.balances.some((b) => b.category === "card_credit"));
  assert.equal(ex.dropped.length, 1);
});

test("optimize numbers match the hand-checked math", async () => {
  const tiles = await optimize(await extract(SAMPLE_DOCS));
  const t = (id: string) => tiles.find((x) => x.id === id)!;
  const dental = t("tile_dental");
  assert.equal(dental.candidates.find((c) => c.id === "as_planned")!.costToUser, 1900);
  assert.equal(dental.candidates.find((c) => c.id === "phase")!.costToUser, 1550);
  assert.equal(dental.action.savings, 350);
  assert.equal(t("tile_deductible").candidates[0].costToUser, 360);
  assert.equal(t("tile_deductible").action.savings, 1440);
  assert.equal(t("tile_dining").action.savings, 195); // 412 - 29.5*51/7 = 197.07 -> floor to $5
  assert.equal(t("tile_fsa").atStake, 0); // carryover applied first (rule 4)
  assert.equal(tiles[0].id, "tile_deductible"); // largest dollars x urgency
});

test("reviewer rejects the sunscreen cart on rule 2", async () => {
  const ex = await extract(SAMPLE_DOCS);
  const fsa = ex.balances.find((b) => b.id === "fsa")!;
  const v = ruleCheck({ kind: "cart", balance: fsa, items: ["Sunscreen SPF 50", "Aloe gel"] }, ex, docsText);
  assert.equal(v.verdict, "reject");
  assert.equal(v.rule_cited, 2);
});

test("reviewer approves the phased dental booking and rejects new care", async () => {
  const ex = await extract(SAMPLE_DOCS);
  const tiles = await optimize(ex);
  const dental = tiles.find((x) => x.id === "tile_dental")!;
  assert.equal(ruleCheck({ kind: "tile", tile: dental }, ex, docsText).verdict, "approve");
  const upsell = { ...dental, action: { ...dental.action, payload: { ...dental.action.payload, careIds: "fill14,whitening" } } };
  const v = ruleCheck({ kind: "tile", tile: upsell }, ex, docsText);
  assert.equal(v.verdict, "reject");
  assert.equal(v.rule_cited, 1);
});

test("bank and card statement findings are grounded and computed", async () => {
  const ex = await extract(SAMPLE_DOCS);
  assert.equal(ex.dropped.length, 0);
  const tiles = await optimize(ex);
  const t = (id: string) => tiles.find((x) => x.id === id)!;
  assert.equal(t("tile_bonus").action.savings, 300);
  assert.equal(t("tile_fees").action.savings, 47);
  assert.equal(t("tile_annual_fee").action.savings, 325);
  assert.equal(t("tile_credit_move").action.savings, 31.98); // $15.99 x Nov, Dec
  assert.equal(t("tile_dispute").action.savings, 42.17);
  assert.equal(t("tile_price").action.savings, 50);
  assert.equal(t("tile_fsa_claim").action.savings, 92.45);
  assert.equal(t("tile_promo").action.savings, 286.2);
  assert.equal(t("tile_subs").action.savings, 107.98);
  assert.equal(t("tile_points").action.savings, 409.5); // 31,500 x 1.3 cents
  assert.equal(t("tile_rotating").action.savings, 10.74); // $120/mo x 68 days x 4 extra points
  assert.equal(t("tile_cash").live, false); // options only (rule 5)
  for (const tile of tiles) assert.equal(ruleCheck({ kind: "tile", tile }, ex, docsText).verdict, "approve", tile.id);
});
