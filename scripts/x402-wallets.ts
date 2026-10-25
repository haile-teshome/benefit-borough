// Creates two Base Sepolia test wallets for x402 and appends them to .env.local:
// Ruth's payer wallet (X402_PAYER_KEY) and the price desk's receiving wallet (X402_PAY_TO).
// Prints addresses only. Test network only; never put real funds in these.
// Run: npx tsx scripts/x402-wallets.ts
import fs from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = ".env.local";
const env = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
if (/^X402_PAYER_KEY=\S/m.test(env)) {
  const m = env.match(/^X402_PAYER_KEY=(\S+)/m)!;
  console.log("Wallets already set. Ruth pays from:", privateKeyToAccount(m[1] as `0x${string}`).address);
  console.log("Price desk receives at:", env.match(/^X402_PAY_TO=(\S+)/m)?.[1]);
  process.exit(0);
}
const payer = generatePrivateKey();
const desk = generatePrivateKey();
const deskAddr = privateKeyToAccount(desk).address;
fs.appendFileSync(file, `\n# Coinbase x402 (Base Sepolia test wallets, made by scripts/x402-wallets.ts)\nX402_PAYER_KEY=${payer}\nX402_PAY_TO=${deskAddr}\nX402_DESK_KEY=${desk}\n`);
console.log("Ruth pays from:", privateKeyToAccount(payer).address);
console.log("Price desk receives at:", deskAddr);
console.log("Fund Ruth's address with test USDC at https://faucet.circle.com (network: Base Sepolia).");
