// Seeds the Nessie sandbox with the demo farmer's bank: checking, two cards, the October activity
// the statement detectors look for, and a classmate's account for dining-dollar transfers.
// Writes the new ids into .env.local. Run: npx tsx --env-file=.env.local scripts/seed-nessie.ts
import fs from "node:fs";
import { nessie } from "../lib/integrations/nessie";

type Created = { objectCreated: { _id: string } };
const address = { street_number: "2650", street_name: "Haste St", city: "Berkeley", state: "CA", zip: "94720" };
const geocode = { lat: 37.8659, lng: -122.2593 };

async function main() {
  if (process.env.NESSIE_CUSTOMER_ID) { console.log("Already seeded (NESSIE_CUSTOMER_ID is set). Remove it from .env.local to reseed."); return; }
  const id = (r: Created) => r.objectCreated._id;

  // Reuse what an earlier (partial) run created, so the script is safe to re-run.
  const customers = await nessie<{ _id: string; first_name: string; last_name: string }[]>("/customers");
  const customer = async (first_name: string, last_name: string) =>
    customers.find((c) => c.first_name === first_name && c.last_name === last_name)?._id ?? id(await nessie<Created>("/customers", { method: "POST", body: { first_name, last_name, address } }));
  const jordan = await customer("Jordan", "Lee");
  const maya = await customer("Maya", "Chen");
  const account = async (cust: string, type: string, nickname: string, balance: number) => {
    const have = await nessie<{ _id: string; nickname: string }[]>(`/customers/${cust}/accounts`);
    return have.find((a) => a.nickname === nickname)?._id ?? id(await nessie<Created>(`/customers/${cust}/accounts`, { method: "POST", body: { type, nickname, rewards: 0, balance } }));
  };
  const checking = await account(jordan, "Checking", "Chase Total Checking", 8240);
  const freedom = await account(jordan, "Credit Card", "Freedom Flex", 0);
  const gold = await account(jordan, "Credit Card", "Amex Gold", 0);
  const mayaChecking = await account(maya, "Checking", "Maya Checking", 300);

  const existing = await nessie<unknown[]>(`/accounts/${freedom}/purchases`);
  if (existing.length) { console.log("Transactions already seeded; saving ids only."); }
  const merchant = async (name: string, category: string) => id(await nessie<Created>("/merchants", { method: "POST", body: { name, category, address, geocode } }));
  if (!existing.length) {
  const m = {
    uber: await merchant("Uber Eats", "food"), cvs: await merchant("CVS Pharmacy", "health"), walgreens: await merchant("Walgreens", "health"),
    spotify: await merchant("Spotify", "entertainment"), target: await merchant("Target", "shopping"), amazon: await merchant("Amazon", "shopping"),
    amex: await merchant("American Express", "fees"), traderjoes: await merchant("Trader Joe's", "groceries"),
  };
  const buy = (acct: string, merchant_id: string, purchase_date: string, amount: number, description: string) =>
    nessie(`/accounts/${acct}/purchases`, { method: "POST", body: { merchant_id, medium: "balance", purchase_date, amount, status: "completed", description } });
  await buy(freedom, m.uber, "2026-10-19", 42.17, "UBER EATS");
  await buy(freedom, m.uber, "2026-10-19", 42.17, "UBER EATS");
  await buy(freedom, m.cvs, "2026-09-28", 64.3, "CVS PHARMACY PRESCRIPTION");
  await buy(freedom, m.walgreens, "2026-10-03", 28.15, "WALGREENS PRESCRIPTION");
  await buy(freedom, m.spotify, "2026-09-14", 11.99, "SPOTIFY USA");
  await buy(freedom, m.spotify, "2026-10-14", 11.99, "SPOTIFY USA");
  await buy(freedom, m.target, "2026-10-12", 249, "TARGET AIRPODS PRO");
  await buy(freedom, m.amazon, "2026-10-08", 63.4, "AMAZON MKTPL");
  await buy(freedom, m.amazon, "2026-10-21", 57.1, "AMAZON MKTPL");
  await buy(freedom, m.traderjoes, "2026-10-20", 61.3, "TRADER JOE'S");
  await buy(gold, m.amex, "2026-10-06", 325, "ANNUAL MEMBERSHIP FEE");
  const withdraw = (date: string, amount: number, description: string) =>
    nessie(`/accounts/${checking}/withdrawals`, { method: "POST", body: { medium: "balance", transaction_date: date, status: "completed", amount, description } });
  await withdraw("2026-10-14", 35, "OVERDRAFT FEE");
  await withdraw("2026-10-01", 12, "MONTHLY SERVICE FEE");
  }

  const ids = { NESSIE_CUSTOMER_ID: jordan, NESSIE_ACCOUNT_ID: checking, NESSIE_PAYEE_ACCOUNT_ID: mayaChecking };
  let env = fs.readFileSync(".env.local", "utf8");
  for (const [k, v] of Object.entries(ids)) env = env.match(new RegExp(`^${k}=.*$`, "m")) ? env.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
  fs.writeFileSync(".env.local", env);
  console.log("Seeded: Jordan Lee (checking, Freedom Flex, Amex Gold) and Maya Chen. Ids saved to .env.local.");
}
void main().catch((e: Error) => { console.error(e.message); process.exit(1); });
