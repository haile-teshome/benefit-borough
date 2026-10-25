import { test } from "node:test";
import assert from "node:assert/strict";
import { claim, DAILY_CAP, startRound } from "./minigames";
import { fresh } from "./rewards";

test("night-only bugs never come out by day", () => {
  const r = fresh();
  for (let i = 0; i < 200; i++) {
    startRound(r, "bugs", 13);
    assert.ok(!r.minigames!.round!.items.some((id) => id === "firefly" || id === "luna"));
  }
});

test("a claim needs a round, a real index, and some time to play", () => {
  const r = fresh();
  assert.deepEqual(claim(r, "balloons", 0), { error: "Start a round first" });
  startRound(r, "balloons", 12, Date.now());
  assert.deepEqual(claim(r, "balloons", 0), { error: "Too quick" });
  r.minigames!.round!.at -= 5000;
  assert.deepEqual(claim(r, "balloons", 99), { error: "Nothing there" });
  assert.ok(!("error" in claim(r, "balloons", 0)));
  assert.deepEqual(claim(r, "balloons", 0), { error: "Already caught" });
});

test("acorns stop at each game's daily cap", () => {
  const r = fresh();
  let total = 0;
  for (let round = 0; round < 20; round++) {
    startRound(r, "bugs", 12, Date.now() - 10_000);
    for (let i = 0; i < 5; i++) { r.minigames!.round!.lastClaim = 0; const out = claim(r, "bugs", i); if (!("error" in out)) total += out.acorns; }
  }
  assert.equal(total, DAILY_CAP.bugs);
});
