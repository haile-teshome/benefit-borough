// A curated library of plan and benefit terms. Terms are the same for everyone on a plan, so we
// write them down once (with sources) and ask each person only for their own numbers. Every term
// line becomes part of a document, so findings still quote the exact line they rely on.

export type Question =
  | { key: string; ask: string; kind: "money" | "number" | "percent"; hint?: string; default?: number; optional?: boolean }
  | { key: string; ask: string; kind: "date"; hint?: string; default?: string; optional?: boolean }
  | { key: string; ask: string; kind: "choice"; options: string[]; default?: string }
  | { key: string; ask: string; kind: "used"; items: string[] }; // tick the credits you've already used

export type Credit = { key: string; name: string; amount: number; cadence: string; ends: string; note?: string };

export type Plan = {
  id: string; title: string; issuer: string; category: "Health plan" | "Dining" | "Credit card" | "Tax-advantaged account" | "Points & miles";
  community?: string; year: string; tags: string[];
  sources: { label: string; url: string }[];
  checked: string; // when and against what we last checked these terms
  terms: string[];
  credits?: Credit[];
  questions: Question[];
};

const TODAY = "2026-10-24";
const MONTH_END = "2026-10-31", YEAR_END = "2026-12-31";

export const LIBRARY: Plan[] = [
  {
    id: "ucb-ship-2026", title: "UC Berkeley Student Health Insurance Plan (SHIP) 2026-27", issuer: "UC Berkeley University Health Services", category: "Health plan",
    community: "UC Berkeley students", year: "2026-27", tags: ["ship", "berkeley", "cal", "student health", "uhs", "metlife dental", "vsp vision", "deductible"],
    sources: [
      { label: "UHS: SHIP Benefits (2026-27)", url: "https://uhs.berkeley.edu/insurance-ship/ship-benefits" },
      { label: "UHS: SHIP FAQs", url: "https://uhs.berkeley.edu/insurance-ship/ship-faqs" },
    ],
    checked: "Checked Oct 24, 2026 against the UHS SHIP Benefits page. The certificate of coverage governs if anything differs.",
    terms: [
      "Plan year: August 1, 2026 to July 31, 2027. Deductibles, out-of-pocket maximums and annual benefit maximums reset August 1, 2027.",
      "Medical deductible: $450 per plan year (does not apply to in-network office visits, urgent care, ER visits or outpatient prescriptions).",
      "Out-of-pocket maximum: $5,000 in-network per plan year.",
      "Dental (MetLife): $2,000 benefit maximum per plan year; $0 for exams and cleanings, twice per plan year.",
      "Vision (VSP): $10 eye exam copay; glasses (up to $150 per plan year) OR contact lenses (up to $150 per plan year), $25 copay.",
    ],
    questions: [
      { key: "deductible_met", ask: "How much of the $450 deductible have you met this plan year?", kind: "money", default: 0, hint: "On your SHIP member portal or latest EOB" },
      { key: "oop_applied", ask: "How much has gone toward your $5,000 out-of-pocket maximum?", kind: "money", default: 0 },
      { key: "ordered_care", ask: "Is there care a doctor already ordered that you haven't done yet? Its estimated cost:", kind: "money", optional: true, hint: "Leave blank if none. We never suggest new care." },
      { key: "coinsurance", ask: "Your share after the deductible (coinsurance), if you know it:", kind: "percent", default: 20, hint: "On your ID card or plan summary" },
      { key: "dental_used", ask: "How much of the $2,000 dental maximum has been used this plan year?", kind: "money", default: 0 },
      { key: "cleanings", ask: "Cleanings you've had since August 1:", kind: "choice", options: ["0", "1", "2"], default: "0" },
      { key: "vision_used", ask: "Have you used this year's $150 glasses or contacts allowance?", kind: "choice", options: ["No", "Yes"], default: "No" },
    ],
  },
  {
    id: "cal-dining-2026", title: "Cal Dining meal plan: Flex and Flex+ dollars 2026-27", issuer: "Berkeley Dining", category: "Dining",
    community: "UC Berkeley students", year: "2026-27", tags: ["cal dining", "berkeley", "flex dollars", "meal plan", "dining dollars"],
    sources: [{ label: "Berkeley Dining: 2026-27 meal plan FAQ", url: "https://dining.berkeley.edu/meal-plans/2026-2027/faq/" }],
    checked: "Checked Oct 24, 2026 against the Berkeley Dining 2026-27 FAQ. Confirm the last day of spring semester on the academic calendar.",
    terms: [
      "Flex and Flex+ dollars roll over from the fall semester to the spring semester.",
      "They do not roll over into the summer session or the following academic year. Any unused flex or flex+ dollars at the end of the spring semester will be forfeited (about May 14, 2027).",
    ],
    questions: [
      { key: "balance", ask: "Your current Flex dollar balance:", kind: "money", default: 0, hint: "Cal 1 Card or the Berkeley Dining app" },
      { key: "weekly", ask: "About how much do you spend per week?", kind: "money", default: 30 },
    ],
  },
  {
    id: "irs-fsa-2026", title: "Health FSA: 2026 IRS rules (any employer)", issuer: "IRS (Rev. Proc. 2025-32)", category: "Tax-advantaged account",
    year: "2026", tags: ["fsa", "flexible spending", "carryover", "grace period", "employer", "use it or lose it"],
    sources: [{ label: "IRS Rev. Proc. 2025-32 (2026 limits)", url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf" }],
    checked: "2026 IRS limits. Your employer chooses carryover OR a grace period (or neither); check your plan.",
    terms: [
      "2026 health FSA contribution limit: $3,400.",
      "Plans may allow up to $680 of unused 2026 funds to carry over into 2027, or a grace period of up to 2.5 months, but not both. Anything else is forfeited at the end of the plan year.",
    ],
    questions: [
      { key: "balance", ask: "Your FSA balance right now:", kind: "money", default: 0, hint: "FSA administrator portal (HealthEquity, WEX, etc.)" },
      { key: "carryover", ask: "How much does your plan let you carry over?", kind: "money", default: 680, hint: "$680 is the IRS maximum; some plans allow $0" },
      { key: "year_end", ask: "Plan year ends:", kind: "date", default: YEAR_END },
    ],
  },
  {
    id: "irs-hsa-2026", title: "HSA: 2026 contribution limits and deadline", issuer: "IRS (Rev. Proc. 2025-32)", category: "Tax-advantaged account",
    year: "2026", tags: ["hsa", "health savings account", "contribution", "tax"],
    sources: [{ label: "IRS Rev. Proc. 2025-32 (2026 limits)", url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf" }],
    checked: "2026 IRS limits. HSA money never expires; only the chance to contribute for 2026 does.",
    terms: [
      "2026 HSA contribution limit: $4,400 self-only, $8,750 family, plus $1,000 catch-up at 55 or older.",
      "Contributions for 2026 can be made until the tax-filing deadline, April 15, 2027.",
    ],
    questions: [
      { key: "coverage", ask: "Your HSA coverage:", kind: "choice", options: ["Self-only", "Family"], default: "Self-only" },
      { key: "contributed", ask: "Contributed for 2026 so far (you and your employer):", kind: "money", default: 0 },
    ],
  },
  {
    id: "amex-platinum-2026", title: "American Express Platinum: 2026 statement credits", issuer: "American Express", category: "Credit card",
    year: "2026", tags: ["amex", "platinum", "uber", "resy", "lululemon", "hotel credit", "clear", "walmart+", "digital entertainment"],
    sources: [{ label: "Motley Fool: Amex Platinum 2026 credits", url: "https://www.fool.com/money/credit-cards/articles/how-the-american-express-platinum-card-can-pay-for-its-annual-fee-3-times-over-in-2026" }],
    checked: "From 2026 reporting; confirm in the Amex app's Benefits tab. Many credits need enrollment.",
    terms: [],
    credits: [
      { key: "uber", name: "Uber Cash", amount: 15, cadence: "monthly", ends: MONTH_END, note: "add the card to your Uber account" },
      { key: "digital", name: "Digital entertainment credit", amount: 25, cadence: "monthly", ends: MONTH_END, note: "enrollment required" },
      { key: "walmart", name: "Walmart+ credit", amount: 12.95, cadence: "monthly", ends: MONTH_END },
      { key: "resy", name: "Resy credit", amount: 100, cadence: "quarterly", ends: YEAR_END, note: "enrollment required" },
      { key: "lulu", name: "lululemon credit", amount: 75, cadence: "quarterly", ends: YEAR_END, note: "enrollment required" },
      { key: "hotel", name: "Fine Hotels + Resorts / Hotel Collection credit", amount: 300, cadence: "semiannual", ends: YEAR_END, note: "prepaid through Amex Travel" },
      { key: "airline", name: "Airline incidental fee credit", amount: 200, cadence: "calendar year", ends: YEAR_END, note: "one selected airline" },
      { key: "uberone", name: "Uber One credit", amount: 120, cadence: "calendar year", ends: YEAR_END },
      { key: "clear", name: "CLEAR+ credit", amount: 219, cadence: "calendar year", ends: YEAR_END },
    ],
    questions: [{ key: "used", ask: "Tick the credits you've already used this period:", kind: "used", items: ["uber", "digital", "walmart", "resy", "lulu", "hotel", "airline", "uberone", "clear"] }],
  },
  {
    id: "amex-gold-2026", title: "American Express Gold: 2026 statement credits", issuer: "American Express", category: "Credit card",
    year: "2026", tags: ["amex", "gold", "uber", "dunkin", "resy", "dining credit"],
    sources: [
      { label: "AwardWallet: Amex Gold dining credit (2026)", url: "https://awardwallet.com/credit-cards/amex-gold-dining-credit/" },
      { label: "Upgraded Points: Amex Gold fee and credits", url: "https://upgradedpoints.com/news/is-amex-gold-card-annual-fee-worth-it" },
    ],
    checked: "From 2026 reporting; confirm in the Amex app. Resy may be limited to eligible restaurants from Aug 2026.",
    terms: [],
    credits: [
      { key: "uber", name: "Uber Cash", amount: 10, cadence: "monthly", ends: MONTH_END },
      { key: "dining", name: "Dining credit", amount: 10, cadence: "monthly", ends: MONTH_END, note: "participating partners only" },
      { key: "dunkin", name: "Dunkin' credit", amount: 7, cadence: "monthly", ends: MONTH_END },
      { key: "resy", name: "Resy credit", amount: 50, cadence: "semiannual", ends: YEAR_END, note: "enrollment required" },
    ],
    questions: [{ key: "used", ask: "Tick the credits you've already used this period:", kind: "used", items: ["uber", "dining", "dunkin", "resy"] }],
  },
  {
    id: "chase-sapphire-reserve-2026", title: "Chase Sapphire Reserve: 2026 credits", issuer: "Chase", category: "Credit card",
    year: "2026", tags: ["chase", "sapphire", "reserve", "csr", "the edit", "doordash", "lyft", "stubhub", "peloton"],
    sources: [
      { label: "Katie's Travel Tricks: Sapphire Reserve guide", url: "https://katiestraveltricks.com/portfolio-items/chase-sapphire-reserve/" },
      { label: "View from the Wing: CSR credits and rules", url: "https://viewfromthewing.com/30-chase-sapphire-reserve-benefits-credits-and-rules-even-seasoned-cardmembers-miss/" },
    ],
    checked: "From 2026 reporting; confirm in the Chase app's card benefits tracker.",
    terms: [],
    credits: [
      { key: "edit", name: "The Edit hotel credit", amount: 250, cadence: "semiannual", ends: YEAR_END, note: "prepaid 2+ night stays" },
      { key: "hotel2026", name: "2026 select-brand hotel credit", amount: 250, cadence: "2026 only", ends: YEAR_END },
      { key: "dining", name: "Exclusive Tables dining credit", amount: 150, cadence: "semiannual", ends: YEAR_END },
      { key: "stubhub", name: "StubHub credit", amount: 150, cadence: "semiannual", ends: YEAR_END },
      { key: "doordash", name: "DoorDash credits", amount: 25, cadence: "monthly", ends: MONTH_END },
      { key: "lyft", name: "Lyft credit", amount: 10, cadence: "monthly", ends: MONTH_END },
      { key: "peloton", name: "Peloton credit", amount: 10, cadence: "monthly", ends: MONTH_END },
    ],
    questions: [{ key: "used", ask: "Tick the credits you've already used this period:", kind: "used", items: ["edit", "hotel2026", "dining", "stubhub", "doordash", "lyft", "peloton"] }],
  },
  {
    id: "venture-x-2026", title: "Capital One Venture X: travel credit", issuer: "Capital One", category: "Credit card",
    year: "2026", tags: ["capital one", "venture x", "travel credit", "anniversary"],
    sources: [{ label: "AwardWallet: Venture X review", url: "https://awardwallet.com/blog/capital-one-venture-x-credit-card-review/" }],
    checked: "The $300 credit runs on your cardmember year, not the calendar year.",
    terms: ["$300 Capital One Travel credit each cardmember year, booked through Capital One Travel. Unused credit expires on the account anniversary."],
    questions: [
      { key: "anniversary", ask: "Your card's account anniversary:", kind: "date", default: "2027-02-15" },
      { key: "used_amount", ask: "How much of the $300 have you used this cardmember year?", kind: "money", default: 0 },
    ],
  },
  {
    id: "citi-strata-elite-2026", title: "Citi Strata Elite: 2026 credits", issuer: "Citi", category: "Credit card",
    year: "2026", tags: ["citi", "strata", "elite", "splurge", "blacklane", "hotel"],
    sources: [{ label: "TPG: Citi Strata Elite statement credits", url: "https://thepointsguy.com/credit-cards/citi-strata-elite-statement-credits/" }],
    checked: "From 2026 reporting; choose Splurge merchants at citi.com/splurgecredit.",
    terms: [],
    credits: [
      { key: "hotel", name: "Citi Travel hotel credit", amount: 300, cadence: "calendar year", ends: YEAR_END, note: "prepaid 2+ nights" },
      { key: "splurge", name: "Splurge credit", amount: 200, cadence: "calendar year", ends: YEAR_END, note: "up to two chosen merchants" },
      { key: "blacklane", name: "Blacklane credit", amount: 100, cadence: "semiannual", ends: YEAR_END },
    ],
    questions: [{ key: "used", ask: "Tick the credits you've already used this period:", kind: "used", items: ["hotel", "splurge", "blacklane"] }],
  },
  ...([
    ["aadvantage", "American Airlines AAdvantage miles", "American Airlines", 24, 1.3, "Miles expire after 24 months with no earning or redeeming activity (AAdvantage co-brand cardholders and members under 21 are exempt).", ["american", "aa", "aadvantage", "airline miles"]],
    ["marriott", "Marriott Bonvoy points", "Marriott", 24, 0.8, "Points expire after 24 months without qualifying activity.", ["marriott", "bonvoy", "hotel points"]],
    ["hilton", "Hilton Honors points", "Hilton", 24, 0.5, "Points expire after 24 months without earning or redeeming.", ["hilton", "honors", "hotel points"]],
    ["ihg", "IHG One Rewards points", "IHG", 12, 0.5, "Points expire after 12 months of inactivity (elite members are exempt).", ["ihg", "holiday inn", "hotel points"]],
  ] as const).map(([id, title, issuer, months, cents, rule, tags]): Plan => ({
    id: `points-${id}`, title, issuer, category: "Points & miles", year: "2026", tags: [...tags, "points", "expire", "inactivity"],
    sources: [{ label: "Frequent Miler: how to keep points and miles alive", url: "https://frequentmiler.com/how-to-keep-points-and-miles-alive/" }],
    checked: `Inactivity rule as reported in 2026. Values use a rough ${cents}¢ per point.`,
    terms: [rule, `Rough value used here: ${cents} cents per point (actual value depends on what you book).`],
    questions: [
      { key: "balance", ask: "Your balance:", kind: "number", default: 0 },
      { key: "last_activity", ask: "Date of your last earning or redeeming:", kind: "date", default: "2025-01-15" },
      { key: "exempt", ask: "Are you exempt (co-brand card, elite status, etc.)?", kind: "choice", options: ["No", "Yes"], default: "No" },
    ],
  })),
];

export const LIBRARY_MONTHS: Record<string, [number, number]> = { "points-aadvantage": [24, 1.3], "points-marriott": [24, 0.8], "points-hilton": [24, 0.5], "points-ihg": [12, 0.5] };
export const libraryToday = TODAY;

// What the client needs to search and ask (everything except nothing: the catalog is public).
export const catalog = () => LIBRARY;
