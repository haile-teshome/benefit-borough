import type { SourceDoc } from "../documents";

// Capital One Nessie (sandbox bank). When a customer is configured, the player's checking and card
// activity is read live from Nessie and run through the same statement detectors as an upload.
export const NESSIE = "https://api.nessieisreal.com";

export const nessieEnabled = () => Boolean(process.env.NESSIE_API_KEY && process.env.NESSIE_CUSTOMER_ID);

// The sandbox is slow and sometimes drops connections, so every call has a timeout and retries.
export async function nessie<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  let res: Response | null = null;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(`${NESSIE}${path}${sep}key=${process.env.NESSIE_API_KEY}`, {
        method: init?.method ?? "GET",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status < 500 || attempt === 4) break;
    } catch (err) {
      if (attempt === 4) throw new Error(`Nessie ${path.split("?")[0]}: ${(err as Error).message}`);
    }
    await new Promise((ok) => setTimeout(ok, 800 * attempt));
  }
  if (!res) throw new Error("Nessie: no response");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Nessie ${init?.method ?? "GET"} ${path.split("?")[0]}: HTTP ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json as T;
}

type Account = { _id: string; type: string; nickname: string; balance: number };
type Purchase = { merchant_id: string; purchase_date: string; amount: number; description?: string };
type Txn = { transaction_date: string; amount: number; description?: string };

// Lines the sample statement carries that Nessie now supplies as real transactions.
export const NESSIE_COVERS = [/Overdraft fee/i, /Monthly service fee/i, /Annual membership fee/i, /Uber Eats/i, /CVS Pharmacy/i, /Walgreens/i];

// Build a CSV statement from the customer's live Nessie accounts.
export async function nessieStatement(): Promise<SourceDoc> {
  const accounts = await nessie<Account[]>(`/customers/${process.env.NESSIE_CUSTOMER_ID}/accounts`);
  const merchants = new Map<string, string>();
  const name = async (id: string) => {
    if (!merchants.has(id)) merchants.set(id, await nessie<{ name: string }>(`/merchants/${id}`).then((m) => m.name).catch(() => "Merchant"));
    return merchants.get(id)!;
  };
  const rows: string[] = [];
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  for (const a of accounts) {
    const [purchases, withdrawals, deposits] = await Promise.all([
      nessie<Purchase[]>(`/accounts/${a._id}/purchases`).catch(() => []),
      nessie<Txn[]>(`/accounts/${a._id}/withdrawals`).catch(() => []),
      nessie<Txn[]>(`/accounts/${a._id}/deposits`).catch(() => []),
    ]);
    for (const p of purchases) rows.push(`${p.purchase_date},${q(p.description || (await name(p.merchant_id)))},${(-p.amount).toFixed(2)},${q(a.nickname)}`);
    for (const w of withdrawals) rows.push(`${w.transaction_date},${q(w.description || "Withdrawal")},${(-w.amount).toFixed(2)},${q(a.nickname)}`);
    for (const d of deposits) rows.push(`${d.transaction_date},${q(d.description || "Deposit")},${d.amount.toFixed(2)},${q(a.nickname)}`);
  }
  rows.sort();
  return { id: "upload_nessie", name: "Capital One Nessie (live accounts).csv", text: ["Posting Date,Description,Amount,Account", ...rows].join("\n") };
}
