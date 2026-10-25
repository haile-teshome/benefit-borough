import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFrom, type FeedOffer } from "./shopping";

const o = (title: string, price: number, rating: number | null, reviews: number | null): FeedOffer => ({ title, merchant: "x", url: `https://x/${title}`, price, rating, reviews, why: "", source: "google" });
const feed = [o("cheap-bad", 20, 3.2, 900), o("cheap-ok", 35, 4.3, 40), o("mid-great", 90, 4.8, 5000), o("pricey", 280, 4.9, 30), o("unrated", 25, null, null)];

test("the bargain agent takes the cheapest well-rated (or unrated) listings", () => {
  assert.deepEqual(pickFrom(feed, "deal").map((x) => x.title), ["unrated", "cheap-ok", "mid-great"]);
});

test("the quality agent weighs rating by how many people reviewed it", () => {
  assert.equal(pickFrom(feed, "quality")[0].title, "mid-great");
  assert.ok(!pickFrom(feed, "quality").some((x) => x.title === "cheap-bad" || x.title === "unrated"));
});
