// Tango Card "Rewards as a Service" (RaaS v2): e-gift cards by email, drawn from a prefunded account.
// Sandbox: https://integration-api.tangocard.com/raas/v2 · Production: https://api.tangocard.com/raas/v2
// Auth is HTTP Basic with your platform name and platform key.

const BASE = () => (process.env.TANGO_ENV === "production" ? "https://api.tangocard.com/raas/v2" : "https://integration-api.tangocard.com/raas/v2");

export const tangoEnabled = () => Boolean(process.env.TANGO_PLATFORM_NAME && process.env.TANGO_PLATFORM_KEY && process.env.TANGO_CUSTOMER_ID && process.env.TANGO_ACCOUNT_ID);
export const tangoMode = () => (process.env.TANGO_ENV === "production" ? "production" : "sandbox");

async function tango<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const auth = Buffer.from(`${process.env.TANGO_PLATFORM_NAME}:${process.env.TANGO_PLATFORM_KEY}`).toString("base64");
  const res = await fetch(`${BASE()}${path}`, {
    method: init?.method ?? "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tango ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json as T;
}

type Item = { utid: string; rewardName: string; currencyCode: string; status: string; valueType: string; faceValue?: number; minValue?: number; maxValue?: number; countries?: string[] };
type Brand = { brandName: string; items: Item[] };

// Pick a reward item that can be issued at `amount` USD, preferring the brands we name.
export async function findItem(amount: number, prefer: string[]): Promise<Item | null> {
  const { brands } = await tango<{ brands: Brand[] }>("/catalogs?verbose=false");
  const fits = (i: Item) => i.currencyCode === "USD" && /active/i.test(i.status) && (i.faceValue ? i.faceValue === amount : (i.minValue ?? 0) <= amount && amount <= (i.maxValue ?? Infinity));
  for (const p of prefer) {
    const b = brands.find((x) => x.brandName.toLowerCase().includes(p.toLowerCase()));
    const item = b?.items.find(fits);
    if (item) return item;
  }
  return brands.flatMap((b) => b.items).find(fits) ?? null;
}

export async function balance(): Promise<number> {
  const a = await tango<{ currentBalance: number }>(`/accounts/${process.env.TANGO_ACCOUNT_ID}`);
  return a.currentBalance;
}

export type Sent = { referenceOrderID: string; status: string; reward: string; utid: string };

// Send one e-gift card by email. externalRefID makes retries safe: Tango returns the existing order.
export async function sendGiftCard(opts: { amount: number; prefer: string[]; email: string; firstName: string; externalRefID: string; message: string }): Promise<Sent> {
  const item = (process.env.TANGO_UTID_DEFAULT ? { utid: process.env.TANGO_UTID_DEFAULT, rewardName: "Gift card" } : await findItem(opts.amount, opts.prefer));
  if (!item) throw new Error(`No $${opts.amount} USD reward available in the Tango catalog`);
  const order = await tango<{ referenceOrderID: string; status: string; reward?: { credentials?: unknown } }>("/orders", {
    method: "POST",
    body: {
      accountIdentifier: process.env.TANGO_ACCOUNT_ID, customerIdentifier: process.env.TANGO_CUSTOMER_ID,
      utid: item.utid, amount: opts.amount, deliveryMethod: "EMAIL",
      recipient: { email: opts.email, firstName: opts.firstName },
      sender: { firstName: "Benefit", lastName: "Burrow" },
      externalRefID: opts.externalRefID, message: opts.message, emailSubject: "Your Benefit Burrow reward",
    },
  });
  return { referenceOrderID: order.referenceOrderID, status: order.status, reward: item.rewardName, utid: item.utid };
}
