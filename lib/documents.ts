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
  {
    id: "statements",
    name: "Bank & Card Statements Oct 2026.txt",
    text: `BANK & CARD STATEMENTS — OCTOBER 2026
Account holder: Jordan Lee    Statement date: October 24, 2026

CHASE TOTAL CHECKING (opened August 10, 2026)
New-account bonus: $300.00 after a qualifying direct deposit within 90 days of opening (by November 8, 2026).
Direct deposits this period: none. Acme Corp paycheck is deposited to Wells Fargo.
Average daily balance: $8,240.00   Interest rate: 0.01% APY
Oct 14  Overdraft fee  $35.00 (first overdraft in 12 months)
Oct 1   Monthly service fee  $12.00 (waived with $500+ in monthly direct deposits)

AMEX GOLD
Oct 6   Annual membership fee  $325.00. Cancel or downgrade within 30 days of the fee posting for a full refund (by November 5, 2026).
Card credits used this card year: $0.00 of $424.00

AMEX PLATINUM
Digital entertainment credit: $25.00 per month. Unused monthly credits do not roll over.
Disney+ $15.99/month is billed to Freedom Flex, not Platinum.

FREEDOM FLEX
Oct 19  Uber Eats  $42.17
Oct 19  Uber Eats  $42.17 (same merchant, amount and minute)
Billing disputes must be submitted within 60 days of the statement date (by December 23, 2026).
Q4 5% categories (Amazon, PayPal): not activated. Activate by December 14, 2026.
Amazon spending: about $120.00 per month.
Oct 12  Target — AirPods Pro  $249.00. Target now lists them at $199.00. Price match within 14 days of purchase (by October 26, 2026).
Sep 28  CVS Pharmacy — prescription  $64.30 (paid with personal card)
Oct 3   Walgreens — prescription  $28.15 (paid with personal card)
FSA claims for 2026 expenses can be submitted until March 31, 2027.

BEST BUY CREDIT CARD
Deferred-interest promo balance: $1,140.00. Pay in full by November 30, 2026 or $286.20 of accrued interest is charged.

SUBSCRIPTIONS
Hulu free trial ends November 2, 2026, then $17.99/month.
Duolingo Super annual renewal on November 9, 2026: $89.99. Last opened: June 2026.

LOYALTY
AAdvantage: 31,500 miles. Miles expire January 9, 2027 after 24 months with no activity.

INSURANCE
GEICO auto policy renews November 18, 2026: $1,284.00 for 6 months (up 22% from the last term).`,
  },
];
