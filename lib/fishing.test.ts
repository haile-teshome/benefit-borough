import { test } from "node:test";
import assert from "node:assert/strict";
import { cast, FISH_DAILY_CAP, land, pickFish } from "./fishing";
import { fresh } from "./rewards";

test("night-only fish never bite by day, and day-only fish never at night", () => {
  for (let i = 0; i < 500; i++) {
    assert.notEqual(pickFish(Math.random(), 13).id, "moonfish");
    assert.notEqual(pickFish(Math.random(), 23).id, "trout");
  }
});

test("a catch needs a cast first and can't be instant", () => {
  const r = fresh();
  assert.deepEqual(land(r, true), { error: "Cast first" });
  cast(r, 0.5, 12, Date.now());
  assert.deepEqual(land(r, true), { error: "Too quick" });
});

test("catches pay acorns, with a first-catch bonus, up to the daily fishing cap", () => {
  const r = fresh();
  let total = 0;
  for (let i = 0; i < 60; i++) {
    cast(r, 1, 12, Date.now() - 5000);
    const out = land(r, true);
    assert.ok(!("error" in out));
    total += out.acorns;
  }
  assert.equal(total, FISH_DAILY_CAP);
  assert.equal(r.fish!.acorns, FISH_DAILY_CAP);
});

test("a lost fish pays nothing", () => {
  const r = fresh();
  cast(r, 0.5, 12, Date.now() - 5000);
  const out = land(r, false);
  assert.ok(!("error" in out) && out.acorns === 0);
});
