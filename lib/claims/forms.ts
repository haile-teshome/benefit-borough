import type { AppState, Attachment, Packet, PacketField, Profile, Tile } from "../types";

// One claim form per kind of benefit: which fields it asks for, where each value comes from, what
// proof goes with it, and where it's sent. Ruth fills everything she can find in your documents and
// profile; anything only you know is left blank and marked for you.

export type Draft = Omit<Packet, "id" | "check" | "status" | "hash" | "preparedAt" | "preparedBy" | "engine">;

type Line = { date: string; what: string; amount: number; text: string; doc: string };

// One statement line as a receipt: "Oct 3   Walgreens — prescription  $28.15" or a CSV row like
// 2026-10-12,"TARGET AIRPODS PRO",-249.00,"Freedom Flex".
export function parseLine(text: string, doc = ""): Line | null {
  const t = text.trim();
  const m = t.match(/^([A-Z][a-z]{2} \d{1,2})\s+(.+?)\s+\$([\d,]+\.\d{2})/);
  if (m) return { date: m[1], what: m[2].trim(), amount: parseFloat(m[3].replace(/,/g, "")), text: t, doc };
  const c = t.match(/^(\d{4}-\d{2}-\d{2}),"?([^",]+)"?,\s*(-?[\d.]+)/);
  if (c) return { date: new Date(`${c[1]}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), what: c[2].trim(), amount: Math.abs(parseFloat(c[3])), text: t, doc };
  return null;
}

export function statementLines(s: AppState): Line[] {
  return s.docs.flatMap((d) => d.text.split("\n").map((l) => parseLine(l, d.name)).filter((x): x is Line => Boolean(x)));
}

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

const P = (key: keyof Profile, label: string, p: Profile, required = true): PacketField =>
  ({ key, label, value: p[key] ?? "", source: p[key] ? "profile" : "you", required, profileKey: key });
const D = (key: string, label: string, value: string, cite?: string): PacketField => ({ key, label, value, source: cite ? "document" : "computed", cite });
const YOU = (key: string, label: string, hint = ""): PacketField => ({ key, label, value: hint, source: "you", required: true });
const MINE = (key: string, label: string, value: string): PacketField => ({ key, label, value, source: "ruth", long: value.length > 80 });

// Receipts as a proof-of-payment attachment: the lines this claim was found on, or else every
// statement line that matches.
function proof(lines: Line[], re: RegExp, name: string, tile?: Tile): { found: Line[]; att: Attachment } {
  const own = (tile?.sources ?? []).map((x) => lines.find((l) => l.text === x.text.trim()) ?? parseLine(x.text, x.doc)).filter((x): x is Line => Boolean(x) && re.test(x!.what));
  const found = own.length ? own : lines.filter((l) => re.test(l.what));
  return { found, att: { name, kind: "statement", lines: found.map((l) => l.text), cite: found[0]?.doc, todo: found.length ? undefined : "No receipts found in your statements yet. Upload one and Ruth will attach it." } };
}

export function draftFor(tile: Tile, s: AppState): Draft {
  const p = s.profile ?? {};
  const ex = s.extraction;
  const b = ex?.balances.find((x) => tile.balanceIds.includes(x.id));
  const fact = (k: string) => (b ? ex?.facts[`${b.id}:${k}`] : undefined);
  const lines = statementLines(s);
  const cite = tile.sources[0]?.text;
  const amount = tile.action.savings;
  const base = { tileId: tile.id, amount, attachments: [] as Attachment[] };
  const to = String(tile.action.payload.to ?? "the provider");

  switch (tile.category) {
    case "fitness": {
      const doc = s.docs.find((d) => d.meta?.plan === "health-fitness");
      const ans = (doc?.meta?.answers ?? {}) as Record<string, string | number>;
      const insurer = String(ans.insurer ?? "your health plan"), gym = String(ans.gym ?? "your gym");
      const { found, att } = proof(lines, /fitness|gym|ymca|equinox|planet fitness|yoga|climb/i, "Proof of payment: gym charges from your statements");
      const letter: Attachment = { name: `Letter to request from ${gym}`, kind: "letter", lines: [`Hi ${gym} team,`, `Could you send me a payment history for my membership for ${new Date().getFullYear()} (dates and amounts, on letterhead)? My health plan needs it for a fitness reimbursement claim.`, `Thank you,`, p.fullName ?? "[your name]"], todo: found.length ? undefined : "No gym charges found in your statements. Send this note to your gym (or upload a receipt) and Ruth will attach it." };
      return { ...base, form: `${insurer} fitness reimbursement form`, provider: insurer, method: "mail", submitTo: `${insurer} member services (mail or member portal upload)`,
        fields: [P("fullName", "Member name", p), P("memberId", "Member ID (on your insurance card)", p), P("birthDate", "Date of birth", p), P("address", "Mailing address", p), P("email", "Email", p, false),
          D("gym", "Fitness club name", gym, doc ? `My gym: ${gym}` : undefined), D("period", "Membership period", `January 1 – ${today()}`),
          D("paid", "Total membership fees paid", usd(fact("paid") ?? amount), cite), D("amount", "Reimbursement requested", usd(amount), cite),
          MINE("attest", "Attestation", "I attest that I was an active member of the fitness club for the period above and paid the fees listed.")],
        attachments: [found.length ? att : letter], minutes: { you: 1, without: 25 },
        message: `Fitness reimbursement claim for ${p.fullName ?? "[member name]"} (member ID ${p.memberId ?? "[member ID]"}): ${usd(amount)} requested for ${gym} membership fees paid this year. Proof of payment attached.` };
    }
    case "fsa_claim": case "fsa": case "dcfsa": {
      const re = tile.category === "dcfsa" ? /daycare|child ?care|preschool|after-?school|camp/i : /pharmacy|prescription|cvs|walgreens|rite aid|copay|dental|vision|optical/i;
      const { found, att } = proof(lines, re, tile.category === "dcfsa" ? "Childcare receipts from your statements" : "Pharmacy and medical receipts from your statements", tile.category === "fsa_claim" ? tile : undefined);
      const total = found.reduce((t, l) => t + l.amount, 0);
      return { ...base, amount: Math.min(amount || total, total || amount), form: tile.category === "dcfsa" ? "Dependent care FSA claim form" : "Health FSA claim form", provider: "your FSA administrator", method: "portal", submitTo: "Your FSA administrator's portal (HealthEquity, WEX, Navia, Fidelity…)",
        fields: [P("fullName", "Participant name", p), P("employer", "Employer", p), P("employeeId", "Employee ID", p), P("email", "Email for the reimbursement notice", p, false),
          ...found.map((l, i) => D(`exp${i}`, `Expense ${i + 1}: ${l.date}`, `${l.what} · ${usd(l.amount)}`, l.text)),
          D("total", "Total requested", usd(total || amount), found[0]?.text ?? cite),
          ...(tile.category === "dcfsa" ? [YOU("provider_tin", "Care provider's tax ID (on their invoice)")] : []),
          MINE("attest", "Attestation", "These expenses were incurred by me or my dependents, were not reimbursed elsewhere, and are eligible under my plan.")],
        attachments: [att], minutes: { you: 1, without: 20 } };
    }
    case "price_adjust": {
      const buy = tile.sources.map((x) => parseLine(x.text, x.doc)).find(Boolean) ?? lines.find((l) => /target|best buy|walmart|amazon/i.test(l.what) && tile.sources.some((x) => x.text.includes(l.what.slice(0, 12))));
      const paidAudit = s.audit.find((e) => e.type === "x402" && /^Paid/.test(e.detail));
      return { ...base, form: "Price adjustment request", provider: to, method: "chat", submitTo: `${to} customer service chat`,
        fields: [P("fullName", "Name on the order", p), P("email", "Email on the order", p), YOU("order", "Order number (in your receipt email)"),
          D("item", "Item", buy?.what ?? tile.title, buy?.text ?? cite), D("paid", "You paid", buy ? usd(buy.amount) : "", buy?.text), D("refund", "Refund requested", usd(amount), cite)],
        attachments: [{ name: "Proof of the current price", kind: "evidence", lines: [cite ?? "", ...(paidAudit ? [`Live price checked by Ruth over x402: ${paidAudit.detail.split(" · ").pop()}`] : [])].filter(Boolean) }],
        minutes: { you: 1, without: 15 },
        message: `Hi! I bought ${buy?.what ?? "this item"} on ${buy?.date ?? "a recent date"} for ${buy ? usd(buy.amount) : "the original price"}, and it's now listed lower. Under your price match policy, could you refund the ${usd(amount)} difference to my original payment method? Order number: [order number]. Thank you!` };
    }
    case "dispute": {
      const dup = tile.sources.map((x) => parseLine(x.text, x.doc)).filter((x): x is Line => Boolean(x));
      return { ...base, form: "Billing dispute", provider: to, method: "app", submitTo: `${to} app → Transactions → Dispute`,
        fields: [P("fullName", "Cardholder", p), D("txn", "Charge to dispute", dup[1]?.text ?? cite ?? "", cite), D("reason", "Reason", "Duplicate charge: same merchant, amount and minute as another charge"), D("amount", "Amount", usd(amount), cite), MINE("note", "Note to the issuer", "I was charged twice for one order. I'm keeping the first charge and disputing the duplicate.")],
        attachments: [{ name: "Both charges from your statement", kind: "statement", lines: dup.map((l) => l.text), cite: dup[0]?.doc }], minutes: { you: 1, without: 15 } };
    }
    case "bank_fee": return { ...base, form: "Fee refund request", provider: to, method: "chat", submitTo: `${to} secure message`,
      fields: [P("fullName", "Account holder", p), D("fee", "Fee", cite ?? "", cite), D("amount", "Refund requested", usd(amount), cite)], attachments: [],
      minutes: { you: 1, without: 20 },
      message: `Hi, I was charged ${tile.sources.map((x) => x.text).join(" and ")}. It's my first in a long time; could you refund it as a courtesy? Thank you, ${p.fullName ?? "[your name]"}.` };
    case "annual_fee": case "subscription": return { ...base, form: tile.category === "annual_fee" ? "Downgrade and fee refund request" : "Cancellation request", provider: to, method: "phone", submitTo: `${to} (call or chat)`,
      fields: [P("fullName", "Account holder", p), D("what", "Account", cite ?? tile.title, cite), D("amount", "Saved", usd(amount), cite)], attachments: [],
      minutes: { you: 2, without: 25 },
      message: tile.category === "annual_fee" ? `I'd like to downgrade my card to the no-annual-fee version and have the ${usd(amount)} annual fee refunded; it posted within the last 30 days. Please don't close the account (it keeps my credit history).` : `I'd like to cancel before the next renewal so I'm not charged. Please confirm the cancellation by email.` };
    case "retirement": return { ...base, form: "401(k) contribution change", provider: "your 401(k) recordkeeper", method: "portal", submitTo: "Your recordkeeper portal (Fidelity, Vanguard, Empower…) → Contributions",
      fields: [P("fullName", "Participant", p), P("employer", "Employer", p), D("from", "Current contribution", `${fact("pct") ?? "?"}% of pay`, cite), D("to", "New contribution", `${fact("cap") ?? "?"}% of pay`), D("effective", "Effective", "Next payroll")],
      attachments: [], minutes: { you: 1, without: 10 } };
    case "pto": return { ...base, form: "Time-off request", provider: "your HR system", method: "portal", submitTo: "Your HR system (Workday, Rippling, BambooHR…) → Time off",
      fields: [P("fullName", "Employee", p), P("employeeId", "Employee ID", p, false), D("days", "Days", String(fact("days") ?? "")), YOU("dates", "Which dates?", ""), MINE("note", "Note to your manager", "Taking a few days I'd otherwise lose at year end. I'll make sure my work is covered.")],
      attachments: [], minutes: { you: 1, without: 10 } };
    case "dining": return { ...base, form: "Flex dollars transfer", provider: "Cal Dining", method: "transfer", submitTo: "Cal Dining peer transfer",
      fields: [P("fullName", "From", p), D("amount", "Amount", usd(Number(tile.action.payload.amount ?? amount)), cite), { key: "to", label: "To (a friend's name or student ID; or pick a farmer next)", value: "", source: "you" }], attachments: [], minutes: { you: 1, without: 10 } };
    default: return { ...base, form: String(tile.action.payload.title ?? tile.action.summary), provider: to, method: tile.action.kind === "book_call" ? "phone" : "portal", submitTo: to,
      fields: [P("fullName", "Your name", p), P("phone", "Callback number", p, false), D("what", "What Ruth will ask for", tile.action.summary, cite), D("amount", "Worth", usd(amount), cite)],
      attachments: [], minutes: { you: 1, without: 15 }, message: String(tile.action.payload.steps ?? "").split("|").join("\n") };
  }
}
