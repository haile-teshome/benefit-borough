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
  // The card list no longer contains the line the claim quotes, as if it had been made up.
  const docs = SAMPLE_DOCS.map((d) => (d.id === "cards" ? { ...d, text: d.text.replace(/Sapphire Reserve.*\n/, "") } : d));
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

test("an uploaded CSV statement yields grounded findings", async () => {
  const csv = `Posting Date,Description,Amount
09/22/2026,NETFLIX.COM 866-579-7172 CA,-15.49
10/22/2026,NETFLIX.COM 866-579-7172 CA,-15.49
10/15/2026,OVERDRAFT FEE,-34.00
10/18/2026,DOORDASH*CHIPOTLE,-23.41
10/18/2026,DOORDASH*CHIPOTLE,-23.41
10/11/2026,CVS/PHARMACY #09812,-38.62
10/16/2026,ACME CORP PAYROLL,2400.00`;
  const docs = [...SAMPLE_DOCS.filter((d) => d.id !== "statements"), { id: "upload_1", name: "chase.csv", text: csv }];
  const ex = await extract(docs);
  assert.equal(ex.dropped.length, 0);
  const up = ex.balances.filter((b) => b.id.startsWith("up_"));
  assert.deepEqual(up.map((b) => b.category).sort(), ["bank_fee", "dispute", "fsa_claim", "subscription"]);
  assert.equal(up.find((b) => b.category === "dispute")!.amount, 23.41);
  for (const b of up) assert.ok(csv.includes(b.source.text));
  const tiles = await optimize(ex);
  for (const t of tiles.filter((t) => t.id.startsWith("tile_up_"))) assert.equal(ruleCheck({ kind: "tile", tile: t }, ex, csv).verdict, "approve");
});

test("Ruth prepares, you submit: she waits for answers and never sends on her own", async () => {
  const { scan, dispatch, answer, prepare, submitPacket, editPacketFields } = await import("../pipeline");
  const pid = "test_ask";
  (await import("node:fs")).rmSync(`.data/state-${pid}.json`, { force: true });
  const s = await scan(SAMPLE_DOCS, pid);
  assert.ok(s.tiles.find((t) => t.id === "tile_subs")?.ask);
  // No packet, no submission: even with an approved tile, dispatch refuses.
  await assert.rejects(dispatch("tile_subs", pid), /never sends a claim on her own/);
  let { packet } = await prepare("tile_subs", pid);
  assert.equal(packet.status, "needs you");
  assert.ok(packet.check.issues.some((i) => /waiting for your answer/.test(i)));
  await assert.rejects(submitPacket(packet.id, packet.hash, pid), /Not ready/);
  await answer("tile_subs", "go", pid);
  ({ packet } = await prepare("tile_subs", pid));
  assert.equal(packet.fields.find((f) => f.key === "fullName")?.value, "Jordan Lee"); // prefilled from the statement
  assert.equal(packet.status, "ready");
  // The fingerprint you approved must match what's sent.
  await assert.rejects(submitPacket(packet.id, "0000", pid), /changed since you reviewed/);
  assert.equal((await submitPacket(packet.id, packet.hash, pid)).result.status, "confirmed");
  // Editing a packet changes its fingerprint, so an old approval no longer works.
  const fsa = await prepare("tile_fsa_claim", pid);
  const edited = await editPacketFields(fsa.packet.id, { employeeId: "E-4417" }, pid);
  assert.notEqual(edited.packet.hash, fsa.packet.hash);
  await answer("tile_annual_fee", "keep", pid);
  const fee = await prepare("tile_annual_fee", pid);
  await assert.rejects(submitPacket(fee.packet.id, fee.packet.hash, pid), /Not ready/);
  (await import("node:fs")).rmSync(`.data/state-${pid}.json`, { force: true });
});

test("library plans plus a person's answers become grounded findings", async () => {
  const { buildDoc } = await import("../library/build");
  const docs = [
    buildDoc({ plan: "ucb-ship-2026", answers: { deductible_met: 450, oop_applied: 900, ordered_care: 1800, coinsurance: 20, dental_used: 300, cleanings: "1", vision_used: "No" } })!,
    buildDoc({ plan: "cal-dining-2026", answers: { balance: 900, weekly: 25 } })!,
    buildDoc({ plan: "amex-gold-2026", answers: { used: ["dunkin"] } })!,
    buildDoc({ plan: "points-aadvantage", answers: { balance: 20000, last_activity: "2025-03-01", exempt: "No" } })!,
  ];
  const ex = await extract(docs);
  assert.equal(ex.dropped.length, 0);
  for (const b of ex.balances) assert.ok(docs.find((d) => d.id === b.source.doc)!.text.includes(b.source.text), b.id);
  const tiles = await optimize(ex);
  const t = (re: RegExp) => tiles.find((x) => re.test(x.id))!;
  assert.equal(t(/ucbship2026_health/).atStake, 360); // $1,800 after reset: 450 + 20% of 1,350 = $720; now 20% of 1,800 = $360
  assert.equal(t(/ucbship2026_vision/).atStake, 115); // $150 allowance minus $35 in copays
  assert.ok(t(/caldining2026_dining/).action.savings > 0);
  assert.equal(tiles.filter((x) => x.id.includes("amexgold2026_credit")).length, 3); // Dunkin' already used
  assert.equal(t(/pointsaadvantage_points/).atStake, 260); // 20,000 x 1.3 cents
  assert.equal(t(/pointsaadvantage_points/).deadline, "2027-03-01");
  assert.equal(tiles.filter((x) => x.category === "points").length, 1); // no double-counting by the sample builders
  for (const tile of tiles) assert.equal(ruleCheck({ kind: "tile", tile }, ex, docs.map((d) => d.text).join("\n")).verdict, "approve", tile.id);
});

test("workplace benefits: 401(k) match, PTO, dependent care, stipend", async () => {
  const { buildDoc } = await import("../library/build");
  const docs = [
    buildDoc({ plan: "work-401k-match", answers: { salary: 100000, pct: 3, rate: 50, cap: 6 } })!,
    buildDoc({ plan: "work-pto", answers: { days: 9, rollover: 5, salary: 104000, year_end: "2026-12-31" } })!,
    buildDoc({ plan: "work-dcfsa", answers: { balance: 2000, receipts: 1200, year_end: "2026-12-31" } })!,
    buildDoc({ plan: "work-stipend", answers: { type: "Learning", left: 400, resets: "2026-12-31" } })!,
  ];
  const ex = await extract(docs);
  assert.equal(ex.dropped.length, 0);
  const tiles = await optimize(ex);
  const t = (re: RegExp) => tiles.find((x) => re.test(x.id))!;
  assert.equal(ex.facts["lib_work401kmatch_match:yearly"], 1500); // 100k x 3% gap x 50% match
  assert.equal(t(/_match$/).atStake, Math.round((1500 / 26) * 3 * 100) / 100); // 3 biweekly paychecks left after the change
  assert.equal(t(/_pto$/).atStake, 1600); // 4 days over the cap x $400/day
  assert.equal(t(/_dcfsa$/).action.savings, 1200);
  assert.equal(t(/_stipend$/).atStake, 400);
  for (const tile of tiles) assert.equal(ruleCheck({ kind: "tile", tile }, ex, docs.map((d) => d.text).join("\n")).verdict, "approve", tile.id);
});

test("acorns: streaks, daily cap, quests, and redemption", async () => {
  const { fresh, record, redeem, DAILY_CAP } = await import("../rewards");
  const r = fresh();
  const day = (d: number) => new Date(2026, 9, 20 + d, 10);
  assert.equal(record(r, { kind: "visit" }, day(0)).acorns, 10);
  assert.equal(record(r, { kind: "visit" }, day(0)).acorns, 0); // once a day
  assert.equal(record(r, { kind: "visit" }, day(1)).acorns, 15); // 2-day streak
  record(r, { kind: "visit" }, day(3)); // missed a day: streak resets
  assert.equal(r.streak, 1);
  assert.equal(record(r, { kind: "harvest", saved: 350, title: "Dental" }, day(3)).acorns, 22); // 5 + 17
  const q = record(r, { kind: "harvest", saved: 40, title: "Fee" }, day(3));
  assert.ok(q.notes.some((n) => n.includes("Harvest 2 crops")));
  for (let i = 0; i < 50; i++) record(r, { kind: "harvest", saved: 1000, title: "x" }, day(4));
  assert.equal(r.today.earned, DAILY_CAP); // capped
  const before = r.acorns;
  const out = redeem(r, "scarf-gold");
  assert.ok(out.ok);
  assert.equal(r.acorns, before - 150);
  assert.equal(redeem(r, "scarf-gold").ok, false); // cosmetics unlock once
  assert.equal(redeem(r, "giftcard10").ok, false); // not enough acorns
});
