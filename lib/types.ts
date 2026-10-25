export type Category =
  | "fsa" | "dental" | "deductible" | "dining" | "card_credit" | "tax_window"
  // found in bank and card statements
  | "bank_bonus" | "bank_fee" | "idle_cash" | "annual_fee" | "credit_move" | "dispute" | "rotating"
  | "price_adjust" | "fsa_claim" | "promo_apr" | "subscription" | "points" | "insurance"
  // from the plan library
  | "vision" | "hsa"
  // workplace benefits
  | "retirement" | "pto" | "stipend" | "dcfsa" | "espp"
  // health plan extras
  | "fitness"
  // school, learning and student loans
  | "education";

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

export type ActionKind = "book_call" | "transfer" | "request" | "none";

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
  ask?: string; // Ruth asks the user this before acting, when only they know the answer
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

// Where a claim goes when you press Submit: the real page, email or phone number, with Ruth's
// steps and script. Ruth can't file with most companies herself, so you do, in one tap.
export type Handoff = { kind: "web" | "email" | "mail" | "phone" | "app"; label: string; url?: string; phone?: string; steps: string[]; script?: string; sample?: boolean };

export type DispatchResult = {
  status: "confirmed" | "failed" | "handoff";
  handoff?: Handoff;
  confirmation: string;
  transcript: string[];
  audioBase64?: string;
  integration: string;
  mocked: boolean;
};

export type AuditEvent = { at: string; type: string; detail: string };

// ---------- claim packets: Ruth fills it in, you check it and press Submit ----------
export type FieldSource = "profile" | "document" | "computed" | "ruth" | "you";
export type PacketField = { key: string; label: string; value: string; source: FieldSource; cite?: string; required?: boolean; long?: boolean; profileKey?: keyof Profile };
export type Attachment = { name: string; kind: "receipt" | "statement" | "letter" | "evidence"; lines: string[]; cite?: string; todo?: string };
export type Packet = {
  id: string; tileId: string; form: string; provider: string;
  method: "portal" | "email" | "mail" | "phone" | "chat" | "app" | "transfer";
  submitTo: string; // where it goes when you press Submit
  fields: PacketField[]; attachments: Attachment[];
  message?: string; // the cover note, chat message or call script Ruth drafted
  amount: number; // what the packet asks for
  minutes: { you: number; without: number }; // your time with Ruth vs doing it yourself
  check: { ok: boolean; passed: string[]; issues: string[] };
  status: "needs you" | "ready" | "submitted" | "waiting" | "rejected"; // waiting: you filed it; waiting for the money
  handoff?: Handoff;
  hash: string; // fingerprint of exactly what you approve
  preparedAt: string; preparedBy: "ruth" | "autopilot"; engine: "claude" | "rules";
  submittedAt?: string; confirmation?: string;
};
export type Profile = { fullName?: string; email?: string; phone?: string; address?: string; birthDate?: string; memberId?: string; employeeId?: string; employer?: string };

export type AppState = {
  docs: { id: string; name: string; text: string; meta?: { plan: string; answers: Record<string, unknown> } }[];
  extraction: Extraction | null;
  tiles: Tile[];
  reviews: Record<string, Verdict>; // keyed by tile id or "cart:<balanceId>"
  ledger: LedgerEntry[];
  done: string[]; // tile ids whose action confirmed
  answers?: Record<string, "go" | "keep">; // the user's replies to Ruth's questions
  checkedInAt?: string; // last weekly check-in
  rewards?: import("./rewards").Rewards; // acorns, streaks, quests, redemptions
  audit: AuditEvent[];
  profile?: Profile; // what Ruth needs to fill forms; you enter it once
  packets?: Packet[]; // Ruth's outbox: prepared, never submitted without you
  autopilot?: Autopilot;
  lastPayday?: string; // when Ruth last saw a paycheck land (ISO)
  quests?: Quest[]; // shopping quests in the Benefit Bazaar
  friends?: Record<string, Friendship>; // chats with each villager or shopkeeper
};

// The Benefit Bazaar: you name a need and an unspent benefit; shopkeeper agents compete with live
// web offers, Ruth pays each for its quote over x402, checks live prices, and reviews every offer.
export type QuestOffer = {
  title: string; merchant: string; url: string; price: number; livePrice?: number | null; rating: number | null; reviews: number | null; why: string; agent: string;
  verdict: { ok: boolean; fits: boolean; eligible: boolean; quality: number; note: string };
  covered: number; outOfPocket: number; score: number;
};
export type Quest = {
  id: string; at: string; need: string; maxPrice: number;
  benefit: { id: string; label: string; amount: number; deadline: string; category: Category };
  agents: { id: string; shop: string; keeper: string; strategy: string; offers: number; paid?: { price: string; tx: string } ; note?: string }[];
  offers: QuestOffer[]; best?: string; notes: string[]; spent: number;
};

// Ruth's Autopilot: what you let her do on a night shift. She may rescan, buy data within a
// budget, and prepare claims. She may never submit, sign, pay or send anything.
export type Mandate = { on: boolean; hour: number; tzOffset: number; prepare: "all" | "health" | "money-back"; dataBudget: number; signedAt: string };
export type ShiftReport = {
  at: string; why: "schedule" | "now";
  prepared: { packetId: string; form: string; amount: number; status: Packet["status"] }[];
  newClaims: string[]; urgent: string[]; value: number; minutesSaved: number; dataSpent: number; notes: string[];
};
export type Autopilot = { mandate: Mandate; spent: { month: string; usd: number }; reports: ShiftReport[]; seen?: string };

// How well you know a villager: chats so far, when you last talked, story beats they've shared,
// and their own recent lines (so they don't repeat themselves).
export type Friendship = { talks: number; last?: string; told: number[]; said: string[] };
