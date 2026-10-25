import type { Action, DispatchResult } from "../types";
import { nessie } from "./nessie";
import { savingsAccount } from "../payday";

// Transfers through Capital One Nessie (the sandbox bank): rescued money into savings, or dining
// dollars to a friend. If the bank call fails, nothing moves and the error says so.
export async function peerTransfer(action: Action): Promise<DispatchResult> {
  const amount = Number(action.payload.amount);
  // Payday: move rescued money from checking to Burrow Savings (both your own Nessie accounts).
  if (action.payload.rail === "nessie-savings") {
    const savings = await savingsAccount();
    const date = new Date().toISOString().slice(0, 10);
    const out = await nessie<{ objectCreated?: { _id: string } }>(`/accounts/${process.env.NESSIE_ACCOUNT_ID}/withdrawals`, { method: "POST", body: { medium: "balance", transaction_date: date, status: "completed", amount, description: "To Burrow Savings (rescued by Ruth)" } });
    await nessie(`/accounts/${savings}/deposits`, { method: "POST", body: { medium: "balance", transaction_date: date, status: "completed", amount, description: "From checking (rescued by Ruth)" } });
    const id = out.objectCreated?._id ?? "nessie";
    return { status: "confirmed", confirmation: `NES-${id}`, transcript: [`Capital One Nessie: $${amount.toFixed(2)} out of Chase Total Checking`, `$${amount.toFixed(2)} into Burrow Savings`, `Transfer id ${id}`], integration: "Capital One Nessie", mocked: false };
  }
  const key = process.env.NESSIE_API_KEY;
  const from = process.env.NESSIE_ACCOUNT_ID;
  const to = process.env.NESSIE_PAYEE_ACCOUNT_ID;
  if (key && from && to) {
    try {
      const res = await fetch(`https://api.nessieisreal.com/accounts/${from}/transfers?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The current Nessie API takes no payee field, so the recipient is named in the description.
        body: JSON.stringify({ status: "completed", amount, transaction_date: new Date().toISOString().slice(0, 10), description: `Expire: dining dollars to ${action.payload.to} (${to})` }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const id = body?.objectCreated?._id ?? "nessie";
        return { status: "confirmed", confirmation: `NES-${id}`, transcript: [`Capital One Nessie: transfer of $${amount} posted from checking`, `Recipient: ${action.payload.to}`, `Transfer id ${id}`], integration: "Capital One Nessie", mocked: false };
      }
      console.warn(`[nessie] ${res.status}`, body);
    } catch (err) {
      console.warn("[nessie] request failed, using mock transfer", err);
    }
  }
  throw new Error("The transfer didn't go through at the bank (Nessie); nothing was moved");
}
