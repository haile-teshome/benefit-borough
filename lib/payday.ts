import { nessie, nessieEnabled } from "./integrations/nessie";
import { hydrate, load, log, save } from "./store";
import type { Tile } from "./types";

// Payday. When a paycheck lands in your Nessie checking account, Ruth looks at what changed: money
// she rescued since the last paycheck can move into savings (a real Nessie transfer you submit),
// and if your 401(k) contribution still misses the match, this paycheck is where it shows.

type Deposit = { _id: string; transaction_date: string; amount: number; description?: string };
type Account = { _id: string; nickname: string; type: string; balance: number };

const SAVINGS = "Borough Savings";

export async function savingsAccount(): Promise<string> {
  const accounts = await nessie<Account[]>(`/customers/${process.env.NESSIE_CUSTOMER_ID}/accounts`);
  const have = accounts.find((a) => a.nickname === SAVINGS);
  if (have) return have._id;
  const made = await nessie<{ objectCreated: { _id: string } }>(`/customers/${process.env.NESSIE_CUSTOMER_ID}/accounts`, { method: "POST", body: { type: "Savings", nickname: SAVINGS, rewards: 0, balance: 0 } });
  return made.objectCreated._id;
}

// Demo only: deposit a paycheck into the Nessie sandbox account.
export async function simulatePaycheck() {
  if (!nessieEnabled()) throw new Error("Nessie isn't connected");
  await nessie(`/accounts/${process.env.NESSIE_ACCOUNT_ID}/deposits`, { method: "POST", body: { medium: "balance", transaction_date: new Date().toISOString().slice(0, 10), status: "completed", amount: 2840, description: "ACME CORP PAYROLL" } });
}

export async function checkPayday(pid: string) {
  if (!nessieEnabled()) throw new Error("Nessie isn't connected");
  await hydrate(pid);
  const s = load(pid);
  const deposits = (await nessie<Deposit[]>(`/accounts/${process.env.NESSIE_ACCOUNT_ID}/deposits`)).filter((d) => /payroll|paycheck|direct dep/i.test(d.description ?? "")).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b._id.localeCompare(a._id));
  const pay = deposits[0];
  if (!pay) return { state: s, found: false };
  const id = `tile_payday_${pay._id.slice(-8)}`;
  if (s.tiles.some((t) => t.id === id)) return { state: s, found: false };

  const rescued = Math.round(s.ledger.filter((l) => !s.lastPayday || l.at > s.lastPayday).reduce((x, l) => x + l.amount, 0) * 100) / 100;
  s.lastPayday = new Date().toISOString();
  const match = s.tiles.find((t) => t.category === "retirement" && t.live && !s.done.includes(t.id));
  const perPaycheck = match ? Number(s.extraction?.facts[`${match.balanceIds[0]}:perPaycheck`] ?? 0) : 0;
  const line = `${pay.transaction_date},"${pay.description}",${pay.amount.toFixed(2)},"Chase Total Checking"`;
  const doc = { id: "upload_payday", name: "Paychecks (Capital One Nessie).csv", text: ["Posting Date,Description,Amount,Account", ...deposits.slice(0, 6).map((d) => `${d.transaction_date},"${d.description}",${d.amount.toFixed(2)},"Chase Total Checking"`)].join("\n") };
  s.docs = [...s.docs.filter((d) => d.id !== doc.id), doc];
  const tile: Tile = {
    id, category: "idle_cash", title: rescued > 0 ? `Payday: move the $${rescued.toFixed(2)} Ruth rescued into savings` : "Payday: your paycheck landed",
    balanceIds: [], deadline: pay.transaction_date, daysLeft: 0, atStake: 0, live: rescued > 0, engine: "mock", recommendation: "act",
    candidates: [{ id: "act", label: `Move $${rescued.toFixed(2)} to ${SAVINGS}`, costToUser: 0, detail: "Money you got back this pay period, set aside before it blends into spending." }],
    headline: `$${pay.amount.toFixed(2)} landed from ${pay.description}. ${rescued > 0 ? `Ruth rescued $${rescued.toFixed(2)} since your last paycheck; moving it to savings keeps it rescued.` : "Nothing rescued since the last one yet."}${perPaycheck ? ` This paycheck also missed about $${perPaycheck.toFixed(2)} of 401(k) match (see the HR office).` : ""}`,
    tradeoff: "Your money, between your own accounts. Nothing is spent.", doNothingCost: 0, doNothing: "Rescued money stays in checking.",
    action: { kind: "transfer", summary: `Move $${rescued.toFixed(2)} from checking to ${SAVINGS}`, savings: 0, payload: { amount: rescued, rail: "nessie-savings", to: SAVINGS } },
    sources: [{ doc: doc.id, start: doc.text.indexOf(line), end: doc.text.indexOf(line) + line.length, text: line }],
  };
  s.tiles = [tile, ...s.tiles];
  s.reviews[id] = { verdict: "approve", rule_cited: null, reason: "Moving money between your own accounts; nothing is spent and no one else is involved.", engine: "rules", at: new Date().toISOString() };
  log(s, "payday", `Paycheck landed: $${pay.amount.toFixed(2)} (${pay.description}, Nessie). ${rescued > 0 ? `Suggested moving $${rescued.toFixed(2)} rescued to savings.` : ""}${perPaycheck ? ` Flagged $${perPaycheck.toFixed(2)} of missed 401(k) match.` : ""}`);
  save(s, pid);
  return { state: s, found: true, tileId: id };
}
