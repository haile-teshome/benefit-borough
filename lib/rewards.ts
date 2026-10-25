// Acorns: the burrow's loyalty currency. Earned for coming back (daily visits with a streak, the
// weekly check-in, weekly quests) and for rescuing money, but only on confirmed harvests, so nobody
// is ever rewarded for spending. Awarded on the server with a daily cap.

export type Quest = { id: string; label: string; goal: number; reward: number };
export type Contact = { email?: string; firstName?: string; wallet?: string };
export type Redemption = {
  id: string; item: string; name: string; cost: number; at: string;
  status: "unlocked" | "awaiting review" | "sent" | "rejected" | "failed" | "pending fulfillment";
  usd?: number; partner?: Partner; contact?: Contact; detail?: string; decidedAt?: string;
};
export type Rewards = {
  acorns: number; earned: number; streak: number; best: number; lastVisit?: string; // YYYY-MM-DD
  today: { day: string; earned: number };
  week: { key: string; harvests: number; checkin: boolean; shops: string[]; chats: number; claimed: string[] };
  history: { at: string; amount: number; note: string }[];
  redemptions: Redemption[];
  firstPlant?: boolean;
};

export const DAILY_CAP = 300;
export const EARN = { visit: 10, streakStep: 5, streakMax: 50, checkin: 50, firstPlant: 100, harvestBase: 5, harvestPer20: 1, harvestMax: 50 };

export const QUESTS: Quest[] = [
  { id: "harvest2", label: "Harvest 2 crops", goal: 2, reward: 40 },
  { id: "checkin", label: "Do your weekly check-in", goal: 1, reward: 40 },
  { id: "shops3", label: "Visit 3 shops", goal: 3, reward: 30 },
  { id: "chat1", label: "Chat with a villager", goal: 1, reward: 20 },
];

export type Partner = "tango" | "coinbase" | "manual";
export type Reward = { id: string; name: string; cost: number; kind: "cosmetic" | "real" | "perk"; blurb: string; color?: string; usd?: number; partner?: Partner; prefer?: string[] };
// Real-world rewards per person per calendar month, in dollars. Every real reward is reviewed first.
export const MONTHLY_USER_CAP = 10;
export const CATALOG: Reward[] = [
  { id: "scarf-gold", name: "Golden scarf", cost: 150, kind: "cosmetic", blurb: "Everyone in the burrow sees it.", color: "#E9BC3C" },
  { id: "scarf-ruth", name: "Ruth's purple scarf", cost: 200, kind: "cosmetic", blurb: "The Reviewer's own shade.", color: "#6A4C93" },
  { id: "scarf-mint", name: "Mint-condition scarf", cost: 120, kind: "cosmetic", blurb: "Fresh, like a refunded fee.", color: "#3FA6A0" },
  { id: "scarf-ink", name: "Midnight scarf", cost: 250, kind: "cosmetic", blurb: "For night owls who check in late.", color: "#2F2340" },
  // A real perk: more x402 data budget this month, so Ruth's agents can buy more live prices and checks.
  { id: "databoost", name: "Data boost for Ruth's agents", cost: 300, kind: "perk", blurb: "+$0.25 of x402 data budget this month: more live prices and eligibility checks." },
  // Gift cards are emailed by Tango Card and only show up when a Tango account is connected.
  { id: "coffee", name: "$5 coffee gift card", cost: 2500, kind: "real", blurb: "Emailed by Tango Card.", usd: 5, partner: "tango", prefer: ["Starbucks", "Dunkin", "Peet"] },
  { id: "giftcard10", name: "$10 gift card", cost: 5000, kind: "real", blurb: "Emailed by Tango Card.", usd: 10, partner: "tango", prefer: ["Amazon", "Target", "Visa"] },
];

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Weeks start Monday.
export function weekKey(d = new Date()) {
  const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);

export function fresh(): Rewards {
  return { acorns: 0, earned: 0, streak: 0, best: 0, today: { day: dayKey(), earned: 0 }, week: { key: weekKey(), harvests: 0, checkin: false, shops: [], chats: 0, claimed: [] }, history: [], redemptions: [] };
}

function roll(r: Rewards, now = new Date()) {
  if (r.today.day !== dayKey(now)) r.today = { day: dayKey(now), earned: 0 };
  if (r.week.key !== weekKey(now)) r.week = { key: weekKey(now), harvests: 0, checkin: false, shops: [], chats: 0, claimed: [] };
}

// Add acorns, respecting the daily cap. Returns what was actually added.
export function award(r: Rewards, amount: number, note: string, now = new Date()): number {
  roll(r, now);
  const add = Math.max(0, Math.min(amount, DAILY_CAP - r.today.earned));
  if (!add) return 0;
  r.acorns += add; r.earned += add; r.today.earned += add;
  r.history.unshift({ at: now.toISOString(), amount: add, note });
  r.history = r.history.slice(0, 60);
  return add;
}

export function questProgress(r: Rewards, q: Quest) {
  const w = r.week;
  return q.id === "harvest2" ? w.harvests : q.id === "checkin" ? Number(w.checkin) : q.id === "shops3" ? w.shops.length : w.chats;
}

// Pay out any quest that's newly complete.
function settleQuests(r: Rewards, now: Date): { quest: string; acorns: number }[] {
  const out: { quest: string; acorns: number }[] = [];
  for (const q of QUESTS) if (!r.week.claimed.includes(q.id) && questProgress(r, q) >= q.goal) {
    r.week.claimed.push(q.id);
    const got = award(r, q.reward, `Quest: ${q.label}`, now);
    out.push({ quest: q.label, acorns: got });
  }
  return out;
}

export type Event = { kind: "visit" } | { kind: "checkin" } | { kind: "harvest"; saved: number; title: string } | { kind: "shop"; id: string } | { kind: "chat" } | { kind: "plant" };

// Apply one event; returns a short summary for a toast.
export function record(r: Rewards, e: Event, now = new Date()): { acorns: number; notes: string[] } {
  roll(r, now);
  const notes: string[] = [];
  let got = 0;
  if (e.kind === "visit") {
    const today = dayKey(now);
    if (r.lastVisit === today) return { acorns: 0, notes };
    r.streak = r.lastVisit && daysBetween(r.lastVisit, today) === 1 ? r.streak + 1 : 1;
    r.best = Math.max(r.best, r.streak);
    r.lastVisit = today;
    const bonus = Math.min(EARN.streakMax, (r.streak - 1) * EARN.streakStep);
    got += award(r, EARN.visit + bonus, r.streak > 1 ? `Daily visit · ${r.streak}-day streak` : "Daily visit", now);
    notes.push(r.streak > 1 ? `${r.streak}-day streak` : "Daily visit");
  }
  if (e.kind === "checkin" && !r.week.checkin) { r.week.checkin = true; got += award(r, EARN.checkin, "Weekly check-in", now); notes.push("Weekly check-in"); }
  if (e.kind === "harvest") {
    r.week.harvests++;
    const amt = Math.min(EARN.harvestMax, EARN.harvestBase + Math.floor(e.saved / 20) * EARN.harvestPer20);
    got += award(r, amt, `Harvest: ${e.title}`, now); notes.push("Harvest");
  }
  if (e.kind === "shop" && !r.week.shops.includes(e.id)) r.week.shops.push(e.id);
  if (e.kind === "chat") r.week.chats++;
  if (e.kind === "plant" && !r.firstPlant) { r.firstPlant = true; got += award(r, EARN.firstPlant, "Planted your first farm", now); notes.push("First farm"); }
  for (const q of settleQuests(r, now)) { got += q.acorns; notes.push(`Quest done: ${q.quest}`); }
  return { acorns: got, notes };
}

export function monthSpent(r: Rewards, now = new Date()) {
  const m = now.toISOString().slice(0, 7);
  return r.redemptions.filter((x) => x.usd && x.at.startsWith(m) && x.status !== "rejected" && x.status !== "failed").reduce((s, x) => s + (x.usd ?? 0), 0);
}

export function redeem(r: Rewards, itemId: string, contact: Contact = {}, now = new Date()): { ok: true; redemption: Redemption } | { ok: false; error: string } {
  const item = CATALOG.find((c) => c.id === itemId);
  if (!item) return { ok: false, error: "No such reward" };
  if (item.kind === "cosmetic" && r.redemptions.some((x) => x.item === itemId)) return { ok: false, error: "Already unlocked" };
  if (r.acorns < item.cost) return { ok: false, error: `You need ${item.cost - r.acorns} more acorns` };
  if (item.partner === "tango" && !(contact.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) && contact.firstName?.trim())) return { ok: false, error: "Enter your first name and email so we can send it" };
  if (item.partner === "coinbase" && !/^0x[0-9a-fA-F]{40}$/.test(contact.wallet ?? "")) return { ok: false, error: "Enter a wallet address (0x…) on Base" };
  if (item.usd && monthSpent(r, now) + item.usd > MONTHLY_USER_CAP) return { ok: false, error: `Real-world rewards are capped at $${MONTHLY_USER_CAP} a month. Try again next month.` };
  r.acorns -= item.cost;
  const redemption: Redemption = {
    id: `R${r.redemptions.length + 1}-${now.getTime().toString(36)}`, item: item.id, name: item.name, cost: item.cost, at: now.toISOString(),
    status: item.kind === "real" ? "awaiting review" : "unlocked", usd: item.usd, partner: item.partner,
    contact: item.partner === "tango" ? { email: contact.email!.trim(), firstName: contact.firstName!.trim() } : item.partner === "coinbase" ? { wallet: contact.wallet } : undefined,
  };
  r.redemptions.unshift(redemption);
  r.history.unshift({ at: now.toISOString(), amount: -item.cost, note: `Redeemed: ${item.name}` });
  return { ok: true, redemption };
}

// A refused or failed real reward gives the acorns back.
export function refund(r: Rewards, redemptionId: string, status: "rejected" | "failed", detail: string, now = new Date()) {
  const x = r.redemptions.find((y) => y.id === redemptionId);
  if (!x || x.status === "rejected" || x.status === "failed" || x.status === "sent") return false;
  x.status = status; x.detail = detail; x.decidedAt = now.toISOString();
  r.acorns += x.cost;
  r.history.unshift({ at: now.toISOString(), amount: x.cost, note: `Refunded: ${x.name} (${status})` });
  return true;
}
