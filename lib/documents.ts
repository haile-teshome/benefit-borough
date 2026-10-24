// Synthetic documents for the demo. Every number on the board traces back to a line here.
export type SourceDoc = { id: string; name: string; text: string };

export const DEMO_TODAY = process.env.DEMO_TODAY ?? "2026-10-24";

export const SAMPLE_DOCS: SourceDoc[] = [
  {
    id: "benefits",
    name: "2026 Benefits Summary.txt",
    text: `ACME CORP — 2026 BENEFITS SUMMARY
Plan year: January 1, 2026 – December 31, 2026
Member: Jordan Lee

HEALTH FSA
Current balance: $612.00
Use-it-or-lose-it deadline: December 31, 2026
Carryover rule: Up to $640 of unused funds carries over into the 2027 plan year.

MEDICAL (PPO Silver)
Annual deductible: $2,000 — met to date: $2,000
Out-of-pocket maximum: $4,000 — applied to date: $3,600
Coinsurance after deductible: 20%
Deductible and out-of-pocket accumulators reset January 1, 2027.

DENTAL (Delta PPO)
Annual maximum: $1,500 — used to date: $150
Basic services (fillings): covered at 80%
Major services (crowns): covered at 50%
Annual maximum resets January 1, 2027.

OPEN ENROLLMENT
Open enrollment for 2027 runs November 1 – November 21, 2026.
FSA election limit for 2027: $3,400.`,
  },
  {
    id: "dental_plan",
    name: "Dental Treatment Plan.txt",
    text: `BRIGHT SMILE DENTAL — TREATMENT PLAN
Patient: Jordan Lee    Date: October 9, 2026    Office phone: (510) 555-0142
Provider: Dr. Amara Okafor, DDS

1. Filling, tooth #14 (D2391) — fee $125.00 — basic, 80% coverage
2. Filling, tooth #19 (D2391) — fee $125.00 — basic, 80% coverage
3. Crown, tooth #3 (D2740) — fee $1,500.00 — major, 50% coverage
4. Crown, tooth #30 (D2740) — fee $1,500.00 — major, 50% coverage

Total fees: $3,250.00
Estimated insurance payment (remaining 2026 annual maximum): $1,350.00
Estimated patient cost if completed in 2026: $1,900.00`,
  },
  {
    id: "eob",
    name: "EOBs Aug-Sep 2026.txt",
    text: `EXPLANATION OF BENEFITS — PPO Silver
Member: Jordan Lee

Claim 1 — Aug 12, 2026 — Emergency visit, Alta Bates
Allowed: $6,400.00   Plan paid: $3,520.00   You owe: $2,880.00
Deductible applied: $2,000.00 (deductible now met)

Claim 2 — Sep 18, 2026 — Orthopedic follow-up, Dr. Rahul Patel
Allowed: $300.00   Plan paid: $240.00   You owe: $60.00
Out-of-pocket applied to date: $3,600.00 of $4,000.00

Pending: MRI lumbar spine (CPT 72148), ordered Oct 2, 2026 by Dr. Rahul Patel, not yet performed. Estimated allowed amount: $1,800.00
In-network imaging: Bay Imaging Center, (510) 555-0199`,
  },
  {
    id: "dining",
    name: "Dining Dollars Statement.txt",
    text: `CAL DINING — DINING DOLLARS STATEMENT
Account holder: Jordan Lee
Balance: $412.00
Expiration: December 14, 2026. Unused dining dollars are forfeited and not refunded.

Spending, last 8 weeks: $236.00 (average $29.50 per week)
Transfers to another student are allowed through the Cal Dining peer transfer program.`,
  },
  {
    id: "cards",
    name: "Credit Cards.txt",
    text: `CARD WALLET
Sapphire Reserve — annual travel credit: $300.00 remaining, expires December 31, 2026
Freedom Flex — no active credits

Stated needs (from onboarding): Flying home to Seattle for winter break, Dec 20, 2026. Flight not yet booked.`,
  },
];
