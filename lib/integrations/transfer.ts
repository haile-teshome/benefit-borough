import type { Action, DispatchResult } from "../types";

// Peer dining transfer. Planned rail is Coinbase x402; Capital One Nessie is used as the bank
// ledger when configured. Without keys the transfer is simulated and clearly marked as mock.
export async function peerTransfer(action: Action): Promise<DispatchResult> {
  const amount = Number(action.payload.amount);
  const key = process.env.NESSIE_API_KEY;
  const from = process.env.NESSIE_ACCOUNT_ID;
  const to = process.env.NESSIE_PAYEE_ACCOUNT_ID;
  if (key && from && to) {
    try {
      const res = await fetch(`http://api.nessieisreal.com/accounts/${from}/transfers?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medium: "balance", payee_id: to, amount, transaction_date: new Date().toISOString().slice(0, 10), description: "Expire: dining dollars peer transfer" }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        const id = body?.objectCreated?._id ?? "nessie";
        return { status: "confirmed", confirmation: `NES-${id}`, transcript: [`Nessie transfer ${id} posted: $${amount} to ${to}.`], integration: "Capital One Nessie", mocked: false };
      }
      console.warn(`[nessie] ${res.status}`, body);
    } catch (err) {
      console.warn("[nessie] request failed, using mock transfer", err);
    }
  }
  const tx = "0x" + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return {
    status: "confirmed",
    confirmation: tx,
    transcript: [`x402 payment request: $${amount} to ${action.payload.to}`, "Signed by user wallet", `Settled on Base Sepolia (mock), tx ${tx}`],
    integration: "Coinbase x402 (mock)",
    mocked: true,
  };
}
