import { decodePaymentResponseHeader, wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// Coinbase x402: Ruth pays per price check. The Burrow's price desk (/api/x402/prices) answers
// 402 Payment Required with a $0.01 USDC price on Base Sepolia; Ruth's wallet signs a USDC
// transfer authorization, the x402.org facilitator settles it on-chain, and the desk returns the
// live price. Ruth only pays when a price-match crop needs a fresh price.
export const X402_NETWORK = "eip155:84532"; // Base Sepolia
export const X402_PRICE = "$0.01";
export const FACILITATOR = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";
export const x402Enabled = () => Boolean(process.env.X402_PAYER_KEY && process.env.X402_PAY_TO);
export const txUrl = (tx: string) => `https://sepolia.basescan.org/tx/${tx}`;

export type Payment = { transaction: string; payer?: string; network: string; price: string };

export async function paidPrices(urls: string[]): Promise<{ prices: Record<string, number | null>; payment?: Payment; error?: string }> {
  const account = privateKeyToAccount(process.env.X402_PAYER_KEY as `0x${string}`);
  const pay = wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network: X402_NETWORK, client: new ExactEvmScheme(account) }] });
  const base = process.env.X402_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const qs = urls.map((u) => `u=${encodeURIComponent(u)}`).join("&");
  try {
    const res = await pay(`${base}/api/x402/prices?${qs}`, { signal: AbortSignal.timeout(240_000) });
    const json = (await res.json().catch(() => ({}))) as { prices?: Record<string, number | null>; error?: string };
    if (res.status === 402) {
      // The facilitator refused the payment; its reason rides back in the PAYMENT-REQUIRED header.
      const why = (() => { try { return JSON.parse(Buffer.from(res.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString()).error; } catch { return undefined; } })();
      return { prices: {}, error: `payment refused${why ? `: ${why}` : ""}` };
    }
    if (!res.ok) return { prices: {}, error: json.error ?? `price desk HTTP ${res.status}` };
    const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    const settled = header ? decodePaymentResponseHeader(header) : undefined;
    return {
      prices: json.prices ?? {},
      payment: settled?.transaction ? { transaction: settled.transaction, payer: settled.payer ?? account.address, network: String(settled.network ?? X402_NETWORK), price: X402_PRICE } : undefined,
    };
  } catch (err) {
    return { prices: {}, error: (err as Error).message };
  }
}
