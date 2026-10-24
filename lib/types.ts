export type Category = "fsa" | "dental" | "deductible" | "dining" | "card_credit" | "tax_window";

export type Span = { doc: string; start: number; end: number; text: string };

export type Balance = {
  id: string;
  category: Category;
  label: string;
  amount: number;
  deadline: string; // ISO date
  source: Span;
  ruleText: string;
};

export type CareItem = {
  id: string;
  kind: "dental" | "medical";
  description: string;
  fee: number;
  coveragePct: number; // 0-100; for medical, coinsurance the plan pays after deductible
  source: Span;
};

export type SpendPattern = { category: Category; weeklyAvg: number; source: Span };

export type Extraction = {
  balances: Balance[];
  careItems: CareItem[];
  patterns: SpendPattern[];
  facts: Record<string, number>; // plan parameters used by calculators
  dropped: string[]; // claims the extractor made that we could not find in any document
  engine: "claude" | "mock";
};

export type ActionKind = "book_call" | "transfer" | "none";

export type Action = {
  kind: ActionKind;
  summary: string;
  savings: number; // dollars the ledger moves by when this action confirms
  payload: Record<string, string | number>;
};

export type Candidate = { id: string; label: string; costToUser: number; detail: string };

export type Tile = {
  id: string;
  category: Category;
  title: string;
  balanceIds: string[];
  deadline: string;
  daysLeft: number;
  atStake: number; // do-nothing cost; drives sort with urgency
  live: boolean; // false = detected tile with a static suggestion
  candidates: Candidate[];
  recommendation: string; // candidate id
  headline: string;
  tradeoff: string;
  doNothingCost: number;
  doNothing: string;
  action: Action;
  sources: Span[];
  engine: "claude" | "mock";
};

export type Verdict = {
  verdict: "approve" | "reject";
  rule_cited: number | null;
  reason: string;
  modified_action?: string;
  engine: "claude" | "rules";
  at: string;
};

export type ReviewSubject =
  | { kind: "tile"; tile: Tile }
  | { kind: "cart"; balance: Balance; items: string[] };

export type LedgerEntry = { id: string; tileId: string; amount: number; description: string; confirmation: string; at: string };

export type DispatchResult = {
  status: "confirmed" | "failed";
  confirmation: string;
  transcript: string[];
  audioBase64?: string;
  integration: string;
  mocked: boolean;
};

export type AuditEvent = { at: string; type: string; detail: string };

export type AppState = {
  docs: { id: string; name: string; text: string }[];
  extraction: Extraction | null;
  tiles: Tile[];
  reviews: Record<string, Verdict>; // keyed by tile id or "cart:<balanceId>"
  ledger: LedgerEntry[];
  done: string[]; // tile ids whose action confirmed
  audit: AuditEvent[];
};
