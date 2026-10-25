import { award, dayKey, type Rewards } from "./rewards";

// Fishing in the pond: a little game that pays a few acorns. The server picks the fish when you
// cast (so a catch can't be faked) and caps fishing acorns per day, since acorns can buy real
// gift cards.

export type Fish = {
  id: string; name: string; blurb: string;
  weight: number;       // how often it bites (relative)
  difficulty: number;   // 1 (lazy) to 5 (wild): how fast and jumpy it moves
  acorns: number;
  colors: [string, string, string]; // body, belly, fin
  when?: "day" | "night";
};

export const FISH: Fish[] = [
  { id: "minnow", name: "Penny Minnow", blurb: "Small, shiny, adds up if you collect enough of them.", weight: 30, difficulty: 1, acorns: 1, colors: ["#B8C4CC", "#EEF3F6", "#8A9AA6"] },
  { id: "bluegill", name: "Bluegill", blurb: "The pond's friendliest regular.", weight: 22, difficulty: 2, acorns: 2, colors: ["#3E8ED0", "#F2C94C", "#2B5F8E"] },
  { id: "perch", name: "Paperwork Perch", blurb: "Covered in stripes like a tax form. Strangely calming.", weight: 16, difficulty: 2, acorns: 3, colors: ["#8DB04A", "#F3E3C3", "#5E7A2E"] },
  { id: "carp", name: "Coupon Carp", blurb: "Clip it before it expires.", weight: 12, difficulty: 3, acorns: 4, colors: ["#E08A3C", "#F7D7A8", "#B05E1E"] },
  { id: "boot", name: "Soggy Boot", blurb: "Someone's old work boot. Ruth says it isn't FSA-eligible.", weight: 8, difficulty: 1, acorns: 0, colors: ["#6E4428", "#8A5A36", "#4E2F18"] },
  { id: "receipt", name: "Lost Receipt", blurb: "Soggy, but the amount is still readable. Somebody's reimbursement!", weight: 5, difficulty: 3, acorns: 6, colors: ["#FFFAF0", "#E6E1D6", "#B8B0A8"] },
  { id: "catfish", name: "Deductible Catfish", blurb: "Big, slow, and it costs you a lot of effort up front.", weight: 6, difficulty: 4, acorns: 6, colors: ["#5A5560", "#A3A1AE", "#3B3640"] },
  { id: "moonfish", name: "Moonlit Guppy", blurb: "Only bites after dark. Glows a little.", weight: 7, difficulty: 3, acorns: 5, colors: ["#B48CF0", "#E8DAFF", "#7A5BC0"], when: "night" },
  { id: "trout", name: "Rainbow Rollover", blurb: "Its colors carry over into next year.", weight: 6, difficulty: 4, acorns: 7, colors: ["#F06C8B", "#9FD5F0", "#3FA66B"], when: "day" },
  { id: "koi", name: "Golden Koi", blurb: "The legend of the pond. Worth every acorn.", weight: 2, difficulty: 5, acorns: 15, colors: ["#F2C94C", "#FFF1B8", "#E2574C"] },
];

export const FISH_DAILY_CAP = 40;
export const FIRST_CATCH_BONUS = 5;
export type FishLog = { caught: Record<string, number>; day: string; acorns: number; pending?: { id: string; at: number } };

const isNight = (h: number) => h < 6 || h >= 19;
// A better cast (power 0 to 1) tilts the odds toward rarer fish.
export function pickFish(power: number, hour: number, rand = Math.random): Fish {
  const pool = FISH.filter((f) => !f.when || (f.when === "night") === isNight(hour));
  const weights = pool.map((f) => f.weight * (1 + power * (f.difficulty - 1) * 0.35));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) <= 0) return pool[i];
  return pool[0];
}

export const fishLog = (r: Rewards & { fish?: FishLog }) => (r.fish ??= { caught: {}, day: dayKey(), acorns: 0 });

export function cast(r: Rewards, power: number, hour: number, now = Date.now()): Fish {
  const log = fishLog(r);
  const fish = pickFish(Math.max(0, Math.min(1, power)), hour);
  log.pending = { id: fish.id, at: now };
  return fish;
}

// Land (or lose) the fish from your last cast. Reeling takes a few seconds, so an instant
// "catch" is refused.
export function land(r: Rewards, caught: boolean, now = new Date()): { fish: Fish; acorns: number; first: boolean } | { error: string } {
  const log = fishLog(r);
  const p = log.pending;
  if (!p) return { error: "Cast first" };
  log.pending = undefined;
  const fish = FISH.find((f) => f.id === p.id)!;
  if (!caught) return { fish, acorns: 0, first: false };
  if (now.getTime() - p.at < 2000) return { error: "Too quick" };
  if (log.day !== dayKey(now)) { log.day = dayKey(now); log.acorns = 0; }
  const first = !log.caught[fish.id];
  log.caught[fish.id] = (log.caught[fish.id] ?? 0) + 1;
  const want = Math.min(fish.acorns + (first ? FIRST_CATCH_BONUS : 0), FISH_DAILY_CAP - log.acorns);
  const got = want > 0 ? award(r, want, `Fishing: ${fish.name}${first ? " (new!)" : ""}`, now) : 0;
  log.acorns += got;
  return { fish, acorns: got, first };
}
