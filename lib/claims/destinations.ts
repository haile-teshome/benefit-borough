import type { AppState, Handoff, Packet, Tile } from "../types";

// Where each claim actually goes. Ruth prepares everything; pressing Submit opens the real place
// (an official page, a prefilled email or a phone number with her script) so you file it yourself.
// URLs were checked to load on 2026-10-25. Sample-person tiles point at sample offices.

type Dest = { re: RegExp; kind: Handoff["kind"]; label: string; url?: string; phone?: string; steps: string[] };

const DESTS: Dest[] = [
  { re: /target/i, kind: "web", label: "Target price match", url: "https://help.target.com/help/subcategoryarticle?childcat=Price+Match+Guarantee&parentcat=Policies+%26+Guidelines", steps: ["Open Target's price match help page and start a chat", "Paste Ruth's message", "Give your order number"] },
  { re: /chase.*dispute|dispute/i, kind: "web", label: "Chase: dispute a charge", url: "https://www.chase.com/personal/credit-cards/education/basics/how-to-dispute-a-credit-card-charge", steps: ["Sign in to the Chase app → the charge → Dispute", "Pick 'Duplicate charge'", "Paste Ruth's note"] },
  { re: /chase/i, kind: "web", label: "Chase customer service", url: "https://www.chase.com/digital/customer-service", steps: ["Sign in → Secure message", "Paste Ruth's message"] },
  { re: /american express|amex/i, kind: "phone", label: "American Express", url: "https://www.americanexpress.com/", phone: "1-800-528-4800", steps: ["Call the number on the back of your card (Amex: 1-800-528-4800)", "Ask for a product change; read Ruth's script"] },
  { re: /hulu/i, kind: "web", label: "Hulu: cancel", url: "https://help.hulu.com/article/hulu-cancel-subscription", steps: ["Follow Hulu's cancel steps before the trial ends"] },
  { re: /duolingo/i, kind: "web", label: "Duolingo: cancel Super", url: "https://support.duolingo.com/hc/en-us/articles/204830690", steps: ["Cancel through the store you subscribed with (App Store, Google Play or web)"] },
  { re: /disney/i, kind: "web", label: "Disney+ account", url: "https://www.disneyplus.com/account", steps: ["Account → Subscription → Payment → switch to your Amex Platinum"] },
  { re: /aadvantage/i, kind: "web", label: "AAdvantage Dining", url: "https://www.aadvantagedining.com/", steps: ["Join and link a card; one meal posts activity and resets the clock"] },
  { re: /freedom|5% categor/i, kind: "web", label: "Chase Freedom Flex", url: "https://www.chase.com/personal/credit-cards/freedom/flex", steps: ["Sign in → Activate this quarter's 5% categories"] },
  { re: /best buy/i, kind: "web", label: "Best Buy Credit Card (Citi)", url: "https://www.citi.com/credit-cards/best-buy-credit-card", steps: ["Sign in to your Best Buy card account", "Schedule a payment for the full promo balance"] },
  { re: /geico/i, kind: "web", label: "GEICO", url: "https://www.geico.com/", steps: ["Compare quotes before your renewal; switch or ask GEICO to match"] },
  { re: /vsp/i, kind: "web", label: "VSP: find an eye doctor", url: "https://www.vsp.com/eye-doctor", steps: ["Find an in-network doctor and book an exam"] },
  { re: /cal dining|flex dollars|dining/i, kind: "web", label: "Cal Dining", url: "https://dining.berkeley.edu/", steps: ["Use Cal Dining's transfer option to send Flex dollars to a friend"] },
  { re: /blue cross/i, kind: "web", label: "Blue Cross fitness reimbursement form", url: "https://www.bu.edu/hr/documents/BCBS_Fitness_Reimbursement_Form.pdf", steps: ["Print or fill the form (Ruth's PDF has your answers)", "Attach proof of payment", "Mail or upload in your member portal"] },
  { re: /tufts/i, kind: "web", label: "Tufts Health Plan fitness rebate", url: "https://tuftshealthplan.com/documents/members/health-wellness/fitness-rewards-member-fitness-rebate", steps: ["Submit online at mytuftshealthplan.com → Forms, or by mail", "Attach proof of payment"] },
  { re: /studentaid|fafsa/i, kind: "web", label: "FAFSA", url: "https://studentaid.gov/h/apply-for-aid/fafsa", steps: ["Sign in with your FSA ID and file the 2027-28 FAFSA"] },
  { re: /income-driven|recertif/i, kind: "web", label: "Recertify on studentaid.gov", url: "https://studentaid.gov/idr/", steps: ["Sign in → Income-driven repayment → Recertify", "Let it pull your income from the IRS"] },
  { re: /8863/i, kind: "web", label: "IRS Form 8863", url: "https://www.irs.gov/forms-pubs/about-form-8863", steps: ["Add Form 8863 in your tax software (Ruth's PDF has the numbers)", "Use your Form 1098-T"] },
  { re: /1098-e|loan interest/i, kind: "web", label: "IRS Form 1098-E", url: "https://www.irs.gov/forms-pubs/about-form-1098-e", steps: ["Download Form 1098-E from your servicer", "Enter the interest in your tax software"] },
  { re: /529/i, kind: "web", label: "Find your state's 529 plan", url: "https://www.savingforcollege.com/compare_529_plans", steps: ["Open your state's plan and schedule the contribution before the deadline"] },
  { re: /ship|university health services/i, kind: "web", label: "UC Berkeley SHIP", url: "https://uhs.berkeley.edu/insurance-ship", steps: ["Book through University Health Services"] },
];

const GENERIC: Record<Packet["method"], Handoff["kind"]> = { portal: "web", email: "email", mail: "mail", phone: "phone", chat: "web", app: "app", transfer: "web" };

export function handoffFor(tile: Tile, p: Packet, s: AppState): Handoff {
  const text = `${p.provider} ${p.submitTo} ${p.form} ${tile.action.summary}`;
  const sample = tile.sources.some((x) => s.docs.find((d) => d.id === x.doc)?.name.startsWith("Sample"));
  const d = DESTS.find((x) => x.re.test(text));
  const phone = d?.phone ?? (typeof tile.action.payload.phone === "string" && /\d{3}.*\d{4}/.test(tile.action.payload.phone) ? tile.action.payload.phone : undefined);
  const script = p.message ?? (tile.action.kind === "book_call" ? `Hi, I'm calling to ${tile.action.summary.replace(/^Call [^ ]+ ?[^ ]* to /i, "").toLowerCase()}.` : undefined);
  return {
    kind: d?.kind ?? (phone ? "phone" : GENERIC[p.method]),
    label: d?.label ?? p.submitTo,
    url: d?.url,
    phone,
    steps: d?.steps ?? [`Go to ${p.submitTo}`, p.method === "portal" ? "Upload Ruth's PDF and attachments" : "Send Ruth's message"],
    script,
    sample,
  };
}
