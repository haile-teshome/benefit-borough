// Adds the demo farmer's monthly gym charges to the Nessie sandbox (safe to re-run), so Ruth can
// find proof of payment for the gym reimbursement claim in live bank data.
// Run: npx tsx --env-file=.env.local scripts/seed-nessie-gym.ts
import { nessie } from "../lib/integrations/nessie";

async function main() {
  const accounts = await nessie<{ _id: string; nickname: string }[]>(`/customers/${process.env.NESSIE_CUSTOMER_ID}/accounts`);
  const freedom = accounts.find((a) => a.nickname === "Freedom Flex")?._id;
  if (!freedom) throw new Error("Run seed-nessie first");
  const have = await nessie<{ description?: string }[]>(`/accounts/${freedom}/purchases`);
  if (have.some((p) => /FITNESS/i.test(p.description ?? ""))) return console.log("Gym charges already seeded.");
  const m = await nessie<{ objectCreated: { _id: string } }>("/merchants", { method: "POST", body: { name: "24 Hour Fitness", category: "fitness", address: { street_number: "2500", street_name: "Shattuck Ave", city: "Berkeley", state: "CA", zip: "94704" }, geocode: { lat: 37.8635, lng: -122.2678 } } });
  for (const d of ["2026-08-01", "2026-09-01", "2026-10-01"])
    await nessie(`/accounts/${freedom}/purchases`, { method: "POST", body: { merchant_id: m.objectCreated._id, medium: "balance", purchase_date: d, amount: 49.99, status: "completed", description: "24 HOUR FITNESS MEMBERSHIP" } });
  console.log("Added 3 monthly gym charges.");
}
void main();
