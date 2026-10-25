import { award, dayKey, type Rewards } from "./rewards";

// Two first-person minigames that pay a few acorns: popping gift balloons with a slingshot from
// the north bluff, and catching bugs with a net in the meadow. Like fishing, the server decides
// what's in each round (so a catch can't be faked), rejects claims that come too fast, and caps
// each game's acorns per day, since acorns can buy real gift cards.

export type Game = "balloons" | "bugs";
export type Bug = { id: string; name: string; blurb: string; weight: number; acorns: number; kind: "butterfly" | "beetle" | "dragonfly" | "firefly" | "bee"; colors: [string, string]; when?: "day" | "night"; speed: number };
export type Prize = { id: string; name: string; blurb: string; weight: number; acorns: number };

export const BUGS: Bug[] = [
  { id: "cabbage", name: "Cabbage White", blurb: "The most common butterfly in the borough. Always in a hurry.", weight: 30, acorns: 1, kind: "butterfly", colors: ["#fffaf0", "#3b2412"], speed: 1 },
  { id: "monarch", name: "Monarch", blurb: "Orange and proud. Migrates further than any farmer ever has.", weight: 14, acorns: 3, kind: "butterfly", colors: ["#f08a3c", "#3b2412"], when: "day", speed: 1.2 },
  { id: "bluebutterfly", name: "Receipt Blue", blurb: "Its wings are the color of a paid-in-full stamp.", weight: 10, acorns: 4, kind: "butterfly", colors: ["#5fb0e0", "#2b5f8e"], speed: 1.4 },
  { id: "honeybee", name: "Honeybee", blurb: "Works hard, never wastes a drop. Ruth approves.", weight: 18, acorns: 2, kind: "bee", colors: ["#f2c94c", "#3b2412"], when: "day", speed: 1.5 },
  { id: "ladybug", name: "Lucky Ladybug", blurb: "Count its spots: that's how many acorns it brings. (It's four.)", weight: 12, acorns: 4, kind: "beetle", colors: ["#e2574c", "#3b2412"], speed: 0.6 },
  { id: "stag", name: "Stag Beetle", blurb: "Sits on tree trunks pretending to be bark. You're not fooled.", weight: 6, acorns: 6, kind: "beetle", colors: ["#6e4428", "#3b2412"], speed: 0.8 },
  { id: "dragonfly", name: "Darner Dragonfly", blurb: "Zips over the pond faster than a deadline sneaks up.", weight: 8, acorns: 5, kind: "dragonfly", colors: ["#3fa6a0", "#2f6e46"], when: "day", speed: 2.2 },
  { id: "firefly", name: "Firefly", blurb: "Only comes out at night. Glows like a rescued dollar.", weight: 14, acorns: 4, kind: "firefly", colors: ["#fff27a", "#5a4433"], when: "night", speed: 1.1 },
  { id: "luna", name: "Luna Moth", blurb: "Pale green and rare. Seen by moonlight, if you're lucky.", weight: 4, acorns: 10, kind: "butterfly", colors: ["#b9e57a", "#5e7a2e"], when: "night", speed: 1 },
  { id: "goldbug", name: "Golden Scarab", blurb: "The legend of the meadow. Worth every step of sneaking.", weight: 2, acorns: 15, kind: "beetle", colors: ["#ffd23f", "#b9821e"], speed: 1.3 },
];

// What's inside the gift balloons: acorns, or a short (true) benefit tip with a few acorns.
export const PRIZES: Prize[] = [
  { id: "acorns3", name: "A pouch of acorns", blurb: "Three shiny acorns, tied with ribbon.", weight: 30, acorns: 3 },
  { id: "acorns6", name: "A sack of acorns", blurb: "Six acorns! Someone was generous.", weight: 14, acorns: 6 },
  { id: "acorns12", name: "A golden acorn chest", blurb: "Twelve acorns in a tiny chest. Rare!", weight: 3, acorns: 12 },
  { id: "tip-hsa", name: "Tip: HSAs don't expire", blurb: "HSA money rolls over every year and stays yours if you change jobs. An FSA is the one with a deadline.", weight: 8, acorns: 2 },
  { id: "tip-match", name: "Tip: the 401(k) match", blurb: "Contribute at least enough to get your employer's full match. Anything less leaves free money on the table.", weight: 8, acorns: 2 },
  { id: "tip-gym", name: "Tip: gym reimbursement", blurb: "Many health plans pay back part of a gym membership. Check your plan's wellness or fitness benefits.", weight: 8, acorns: 2 },
  { id: "tip-credits", name: "Tip: card credits reset", blurb: "Premium card credits reset monthly, twice a year or yearly. Unused ones don't roll over.", weight: 8, acorns: 2 },
  { id: "tip-dcfsa", name: "Tip: summer day camp", blurb: "A dependent care FSA can pay for summer day camp for kids under 13 (overnight camp doesn't count).", weight: 6, acorns: 2 },
  { id: "tip-pto", name: "Tip: use-it-or-lose-it PTO", blurb: "Many employers cap how many PTO days roll over. Days beyond the cap disappear at year end.", weight: 6, acorns: 2 },
];

export const DAILY_CAP: Record<Game, number> = { balloons: 30, bugs: 40 };
const ROUND = { balloons: 6, bugs: 5 };
export type Round = { game: Game; at: number; items: string[]; claimed: number[]; lastClaim: number };
export type MinigameLog = { day: string; acorns: Partial<Record<Game, number>>; journal: Partial<Record<Game, Record<string, number>>>; round?: Round };

export const minigameLog = (r: Rewards & { minigames?: MinigameLog }) => (r.minigames ??= { day: dayKey(), acorns: {}, journal: {} });
const isNight = (h: number) => h < 6 || h >= 19;

function pick<T extends { weight: number }>(pool: T[], rand: () => number): T {
  let x = rand() * pool.reduce((a, b) => a + b.weight, 0);
  for (const p of pool) if ((x -= p.weight) <= 0) return p;
  return pool[0];
}

// Start a round: the server decides what's in each balloon, or which bugs come out.
export function startRound(r: Rewards, game: Game, hour: number, now = Date.now(), rand = Math.random) {
  const log = minigameLog(r);
  const items = game === "bugs"
    ? Array.from({ length: ROUND.bugs }, () => pick(BUGS.filter((b) => !b.when || (b.when === "night") === isNight(hour)), rand).id)
    : Array.from({ length: ROUND.balloons }, () => pick(PRIZES, rand).id);
  log.round = { game, at: now, items, claimed: [], lastClaim: 0 };
  // The client needs to know how bugs move and look; balloon contents stay hidden until popped.
  return game === "bugs" ? items.map((id) => { const b = BUGS.find((x) => x.id === id)!; return { kind: b.kind, colors: b.colors, speed: b.speed }; }) : items.map(() => ({}));
}

// Claim one caught bug or popped balloon from the current round.
export function claim(r: Rewards, game: Game, index: number, now = new Date()): { item: Bug | Prize; acorns: number; first: boolean } | { error: string } {
  const log = minigameLog(r);
  const round = log.round;
  if (!round || round.game !== game) return { error: "Start a round first" };
  if (!Number.isInteger(index) || index < 0 || index >= round.items.length) return { error: "Nothing there" };
  if (round.claimed.includes(index)) return { error: "Already caught" };
  const t = now.getTime();
  if (t - round.at < 1200 || t - round.lastClaim < 500) return { error: "Too quick" };
  round.claimed.push(index); round.lastClaim = t;
  const id = round.items[index];
  const item = (game === "bugs" ? BUGS : PRIZES).find((x) => x.id === id)!;
  if (log.day !== dayKey(now)) { log.day = dayKey(now); log.acorns = {}; }
  const journal = (log.journal[game] ??= {});
  const first = !journal[id];
  journal[id] = (journal[id] ?? 0) + 1;
  const want = Math.min(item.acorns + (first && game === "bugs" ? 3 : 0), DAILY_CAP[game] - (log.acorns[game] ?? 0));
  const got = want > 0 ? award(r, want, `${game === "bugs" ? "Bug catching" : "Balloon"}: ${item.name}${first && game === "bugs" ? " (new!)" : ""}`, now) : 0;
  log.acorns[game] = (log.acorns[game] ?? 0) + got;
  return { item, acorns: got, first };
}
