// One paid price check from Ruth's wallet, end to end. Run: npm run x402:try
import fs from "node:fs";
import { paidPrices, txUrl } from "../lib/integrations/x402";

async function main() {
const url = process.argv[2] ?? Object.keys(JSON.parse(fs.readFileSync(".data/prices.json", "utf8")))[0];
const out = await paidPrices([url]);
console.log(out.payment ? `Paid ${out.payment.price} USDC · ${txUrl(out.payment.transaction)}` : `No payment: ${out.error}`);
console.log("Prices:", out.prices);
}
void main();
