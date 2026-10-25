import type { AppState, Attachment, Packet, PacketField, Profile, Tile } from "../types";

// One claim form per kind of benefit: which fields it asks for, where each value comes from, what
// proof goes with it, and where it's sent. Ruth fills everything she can find in your documents and
// profile; anything only you know is left blank and marked for you.

export type Draft = Omit<Packet, "id" | "check" | "status" | "hash" | "preparedAt" | "preparedBy" | "engine">;

type Line = { date: string; what: string; amount: number; text: string; doc: string; account?: string };

// One statement line as a receipt: "Oct 3   Walgreens — prescription  $28.15" or a CSV row like
// 2026-10-12,"TARGET AIRPODS PRO",-249.00,"Freedom Flex".
export function parseLine(text: string, doc = ""): Line | null {
  const t = text.trim();
  const m = t.match(/^([A-Z][a-z]{2} \d{1,2})\s+(.+?)\s+\$([\d,]+\.\d{2})/);
  if (m) return { date: m[1], what: m[2].trim(), amount: parseFloat(m[3].replace(/,/g, "")), text: t, doc };
  const c = t.match(/^(\d{4}-\d{2}-\d{2}),"?([^",]+)"?,\s*(-?[\d.]+)(?:,"?([^",]+)"?)?/);
  if (c) return { date: new Date(`${c[1]}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), what: c[2].trim(), amount: Math.abs(parseFloat(c[3])), text: t, doc, account: c[4]?.trim() };
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

// Which company to deal with, from the account a charge posted to.
const BANKS: [RegExp, string][] = [[/chase|freedom|sapphire/i, "Chase"], [/amex|american express|platinum|gold card/i, "American Express"], [/capital one|venture|quicksilver/i, "Capital One"], [/citi|strata|best buy/i, "Citi"], [/wells fargo/i, "Wells Fargo"], [/bank of america|boa\b/i, "Bank of America"]];
const bankOf = (account?: string, fallback = "your bank") => BANKS.find(([re]) => re.test(account ?? ""))?.[1] ?? fallback;
const plain = (l: Line) => `a ${usd(l.amount)} ${l.what.toLowerCase().replace(/\b(fee)\b/, "fee")} on ${l.date}`;

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

  // Payday: moving rescued money into your own savings.
  if (tile.action.payload.rail === "nessie-savings") return { ...base, amount: Number(tile.action.payload.amount), form: "Move rescued money to savings", provider: "Capital One Nessie", method: "transfer", submitTo: "Capital One Nessie: Chase Total Checking → Borough Savings",
      fields: [P("fullName", "Account holder", p), D("from", "From", "Chase Total Checking"), D("to", "To", "Borough Savings"), D("amount", "Amount", usd(Number(tile.action.payload.amount)), cite), D("why", "Why", "Money Ruth rescued since your last paycheck")],
      attachments: [{ name: "The paycheck that triggered this", kind: "statement", lines: tile.sources.map((x) => x.text) }], minutes: { you: 1, without: 5 } };

  switch (tile.category) {
    case "fitness": {
      const doc = s.docs.find((d) => d.meta?.plan === "health-fitness");
      const ans = (doc?.meta?.answers ?? {}) as Record<string, string | number>;
      const insurer = !ans.insurer || ans.insurer === "Other" ? "your health plan" : String(ans.insurer), gym = String(ans.gym ?? "your gym");
      const { found, att } = proof(lines, /fitness|gym|ymca|equinox|planet fitness|yoga|climb/i, "Proof of payment: gym charges from your statements");
      const letter: Attachment = { name: `Letter to request from ${gym}`, kind: "letter", lines: [`Hi ${gym} team,`, `Could you send me a payment history for my membership for ${new Date().getFullYear()} (dates and amounts, on letterhead)? My health plan needs it for a fitness reimbursement claim.`, `Thank you,`, p.fullName ?? "[your name]"], todo: found.length ? undefined : "No gym charges found in your statements. Send this note to your gym (or upload a receipt) and Ruth will attach it." };
      return { ...base, form: insurer === "your health plan" ? "Fitness reimbursement form" : `${insurer} fitness reimbursement form`, provider: insurer, method: "mail", submitTo: `${insurer} member services (mail or member portal upload)`,
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
      const bank = bankOf(dup[0]?.account, to);
      return { ...base, form: "Billing dispute", provider: bank, method: "app", submitTo: `${bank} app → Transactions → Dispute`,
        fields: [P("fullName", "Cardholder", p), D("txn", "Charge to dispute", dup[1]?.text ?? cite ?? "", cite), D("reason", "Reason", "Duplicate charge: same merchant, amount and minute as another charge"), D("amount", "Amount", usd(amount), cite), MINE("note", "Note to the issuer", "I was charged twice for one order. I'm keeping the first charge and disputing the duplicate.")],
        attachments: [{ name: "Both charges from your statement", kind: "statement", lines: dup.map((l) => l.text), cite: dup[0]?.doc }], minutes: { you: 1, without: 15 } };
    }
    case "bank_fee": {
      const fees = tile.sources.map((x) => parseLine(x.text, x.doc)).filter((x): x is Line => Boolean(x));
      const bank = bankOf(fees[0]?.account, to);
      const what = fees.length ? fees.map(plain).join(" and ") : (cite ?? "a fee");
      return { ...base, form: "Fee refund request", provider: bank, method: "chat", submitTo: `${bank} secure message`,
        fields: [P("fullName", "Account holder", p), D("fee", "Fee", cite ?? "", cite), D("amount", "Refund requested", usd(amount), cite)], attachments: [],
        minutes: { you: 1, without: 20 },
        message: `Hi, I was charged ${what}${fees[0]?.account ? ` on my ${fees[0].account} account` : ""}. It's the first in a long time; could you refund it as a courtesy? Thank you, ${p.fullName ?? "[your name]"}.` };
    }
    case "annual_fee": case "subscription": return { ...base, form: tile.category === "annual_fee" ? "Downgrade and fee refund request" : "Cancellation request", provider: to, method: "phone", submitTo: `${to} (call or chat)`,
      fields: [P("fullName", "Account holder", p), D("what", "Account", cite ?? tile.title, cite), D("amount", "Saved", usd(amount), cite)], attachments: [],
      minutes: { you: 2, without: 25 },
      message: tile.category === "annual_fee" ? `I'd like to downgrade my card to the no-annual-fee version and have the ${usd(amount)} annual fee refunded; it posted within the last 30 days. Please don't close the account (it keeps my credit history).` : `I'd like to cancel before the next renewal so I'm not charged. Please confirm the cancellation by email.` };
    case "retirement":
      // Unvested employer money: the move is timing your last day, so Ruth drafts a note to HR.
      if (tile.id.includes("vesting")) return { ...base, form: "Confirm your vesting date with HR", provider: "your HR or benefits team", method: "email", submitTo: "Your HR or benefits team (email)",
        fields: [P("fullName", "Employee", p), P("employer", "Employer", p), D("unvested", "Employer money not vested yet", usd(amount), cite), D("vests", "Vests on", tile.action.payload.deadline ? String(tile.action.payload.deadline) : (b?.deadline ?? "")), YOU("lastDay", "Last day you're considering")],
        attachments: [], minutes: { you: 1, without: 15 },
        message: `Hi, I'd like to confirm my 401(k) vesting schedule. My records show ${usd(amount)} of employer contributions vesting on ${b?.deadline ?? "my next vesting date"}. Could you confirm that date, and whether I need to be employed through that day (or through the end of that pay period) for it to vest? Thank you, ${p.fullName ?? "[your name]"}.` };
      return { ...base, form: "401(k) contribution change", provider: "your 401(k) recordkeeper", method: "portal", submitTo: "Your recordkeeper portal (Fidelity, Vanguard, Empower…) → Contributions",
      fields: [P("fullName", "Participant", p), P("employer", "Employer", p), D("from", "Current contribution", `${fact("pct") ?? "?"}% of pay`, cite), D("to", "New contribution", `${fact("cap") ?? "?"}% of pay`), D("effective", "Effective", "Next payroll")],
      attachments: [], minutes: { you: 1, without: 10 } };
    case "pto": return { ...base, form: "Time-off request", provider: "your HR system", method: "portal", submitTo: "Your HR system (Workday, Rippling, BambooHR…) → Time off",
      fields: [P("fullName", "Employee", p), P("employeeId", "Employee ID", p, false), D("days", "Days", String(fact("days") ?? "")), YOU("dates", "Which dates?", ""), MINE("note", "Note to your manager", "Taking a few days I'd otherwise lose at year end. I'll make sure my work is covered.")],
      attachments: [], minutes: { you: 1, without: 10 } };
    case "education": {
      if (tile.id.includes("educredits")) return { ...base, form: "IRS Form 8863: Education Credits", provider: "your tax return", method: "portal", submitTo: "Your tax software or preparer (attach to your 2026 Form 1040)",
        fields: [P("fullName", "Your name (as on your return)", p), P("school", "School name (on Form 1098-T)", p), YOU("school_ein", "School's EIN (box on Form 1098-T)"),
          D("expenses", "Qualified expenses paid in 2026", usd(fact("paid") ?? 0), cite), D("credit", fact("aotc") ? "American Opportunity credit (Part III)" : "Lifetime Learning credit (Part III)", usd(amount), cite),
          MINE("note", "Note", "Ruth never asks for your Social Security number: your tax software adds it when you file.")],
        attachments: [{ name: "Form 1098-T from your school", kind: "evidence", lines: [], todo: "Download Form 1098-T from your school's student portal (available by January 31) and attach it." }], minutes: { you: 3, without: 45 } };
      if (tile.id.includes("edutuition127")) {
        const { found, att } = proof(lines, /tuition|university|college|course|coursera|edx|udemy/i, "Tuition receipts from your statements");
        return { ...base, form: "Tuition reimbursement request", provider: "your employer", method: "portal", submitTo: "Your employer's education benefits portal (Guild, EdAssist, Workday…)",
          fields: [P("fullName", "Employee", p), P("employer", "Employer", p), P("employeeId", "Employee ID", p), YOU("course", "Course or program"), P("school", "School", p), YOU("grade", "Final grade (most programs need C or better)"),
            D("amount", "Amount requested", usd(amount), cite), MINE("attest", "Attestation", "This course relates to my job or degree program and hasn't been reimbursed elsewhere.")],
          attachments: [found.length ? att : { name: "Tuition receipt", kind: "receipt", lines: [], todo: "Attach your tuition receipt or the school's statement of account." }], minutes: { you: 2, without: 30 } };
      }
      return { ...base, form: String(tile.action.payload.title ?? tile.title), provider: to, method: "portal", submitTo: to,
        fields: [P("fullName", "Your name", p), D("what", "What Ruth will do", tile.action.summary, cite), D("amount", "Worth", usd(amount), cite)],
        attachments: [], minutes: { you: 1, without: 20 }, message: requestMessage(tile, p.fullName) };
    }
    case "dining": return { ...base, form: "Flex dollars transfer", provider: "Cal Dining", method: "transfer", submitTo: "Cal Dining peer transfer",
      fields: [P("fullName", "From", p), D("amount", "Amount", usd(Number(tile.action.payload.amount ?? amount)), cite), { key: "to", label: "To (a friend's name or student ID; or pick a farmer next)", value: "", source: "you" }], attachments: [], minutes: { you: 1, without: 10 } };
    default: return { ...base, form: tile.action.payload.title ? String(tile.action.payload.title) : tile.action.kind === "book_call" ? `Booking call to ${to}` : tile.action.summary.slice(0, 60), provider: to, method: tile.action.kind === "book_call" ? "phone" : "portal", submitTo: to,
      fields: [P("fullName", "Your name", p), P("phone", "Callback number", p, false), D("what", "What Ruth will ask for", tile.action.summary, cite), D("amount", "Worth", usd(amount), cite)],
      attachments: [], minutes: { you: 1, without: 15 }, message: requestMessage(tile, p.fullName) };
  }
}

// The note that goes with a request: what you're asking for and by when, in plain words.
function requestMessage(tile: Tile, name?: string) {
  const by = new Date(`${tile.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  const ask = tile.action.summary.replace(/^./, (c) => c.toLowerCase());
  return `Hi,\n\nI'd like to ${ask} before ${by}. Could you tell me what you need from me, or confirm it's done?\n\nThank you,\n${name || "[your name]"}`;
}
