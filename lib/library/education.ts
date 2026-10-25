import type { Balance, Tile } from "../types";
import type { Answers, LibFinding } from "./build";
import type { Plan } from "./catalog";

// Education benefits: money for school, learning and student loans that has a deadline. Each plan
// is the general rule (with sources) plus a few of your own numbers; the farm shows what's left
// and Ruth prepares the claim, form or filing for you to submit.

const IRS970 = { label: "IRS Publication 970: Tax Benefits for Education", url: "https://www.irs.gov/publications/p970" };
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num = (v: unknown, d = 0) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s]/g, "")); return Number.isFinite(n) ? n : d; };
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const round2 = (n: number) => Math.round(n * 100) / 100;

export const EDU_PLANS: Plan[] = [
  {
    id: "edu-tuition-127", title: "Employer tuition assistance (Section 127, up to $5,250 tax-free)", issuer: "Your employer's education benefit", category: "Education",
    community: "Working professionals", year: "2026", tags: ["tuition", "reimbursement", "section 127", "education assistance", "guild", "edassist", "degree", "course", "employer"],
    sources: [{ label: "IRS FAQs on educational assistance programs (FS-2026-10)", url: "https://www.irs.gov/newsroom/frequently-asked-questions-about-educational-assistance-programs" }, IRS970],
    checked: "2026 cap is $5,250 per employee, tax-free; indexed for inflation from 2027. Your employer sets what's covered and the claim deadline.",
    terms: [
      "Employers can pay up to $5,250 a year of your tuition, fees, books or student loan payments tax-free under a Section 127 plan.",
      "Unused assistance does not carry over to the next year; most programs require receipts and a passing grade by the program's deadline.",
    ],
    questions: [
      { key: "limit", ask: "Your program pays up to (per year):", kind: "money", default: 5250 },
      { key: "used", ask: "Already reimbursed this year:", kind: "money", default: 0 },
      { key: "pending", ask: "Tuition you've paid but not submitted yet:", kind: "money", default: 1800 },
      { key: "year_end", ask: "Program year ends:", kind: "date", default: "2026-12-31" },
    ],
  },
  {
    id: "edu-loan-repay", title: "Employer student loan repayment benefit", issuer: "Your employer (often via Gradifi, Peanut Butter, Fidelity)", category: "Education",
    community: "Working professionals with student loans", year: "2026", tags: ["student loans", "loan repayment", "employer match", "section 127", "401k student loan match", "secure 2.0"],
    sources: [{ label: "IRS FAQs on educational assistance programs (FS-2026-10)", url: "https://www.irs.gov/newsroom/frequently-asked-questions-about-educational-assistance-programs" }, { label: "IRS Notice 2024-63: 401(k) match on student loan payments", url: "https://www.irs.gov/pub/irs-drop/n-24-63.pdf" }],
    checked: "Employer payments toward your loans count toward the same $5,250 Section 127 cap. Some employers instead match loan payments in your 401(k) (SECURE 2.0). Both need you to enroll.",
    terms: ["Employer payments toward your student loans are tax-free up to $5,250 a year (shared with tuition assistance), and only count once you enroll."],
    questions: [
      { key: "monthly", ask: "Your employer contributes up to (per month):", kind: "money", default: 100 },
      { key: "enrolled", ask: "Are you enrolled?", kind: "choice", options: ["No", "Yes"], default: "No" },
      { key: "year_end", ask: "Benefit year ends:", kind: "date", default: "2026-12-31" },
    ],
  },
  {
    id: "edu-credits", title: "Education tax credits: American Opportunity and Lifetime Learning", issuer: "IRS (Form 8863)", category: "Education",
    community: "Students, parents and anyone taking classes", year: "2026", tags: ["aotc", "american opportunity", "lifetime learning", "llc", "tax credit", "1098-t", "form 8863", "tuition"],
    sources: [IRS970, { label: "IRS: Education credits (AOTC and LLC)", url: "https://www.irs.gov/credits-deductions/individuals/education-credits-aotc-llc" }],
    checked: "AOTC: up to $2,500 per student for the first 4 years (40% refundable, up to $1,000). LLC: 20% of up to $10,000 of costs, up to $2,000 per return. Both phase out between $80,000-$90,000 (single) and $160,000-$180,000 (joint) MAGI.",
    terms: [
      "The American Opportunity credit is 100% of the first $2,000 and 25% of the next $2,000 of tuition, fees and course materials: up to $2,500 per student, for the first four years of college.",
      "The Lifetime Learning credit is 20% of up to $10,000 of tuition and fees (up to $2,000 per return) for any college or job-skills course.",
      "You claim either credit on Form 8863 with your tax return; the school sends Form 1098-T.",
    ],
    questions: [
      { key: "paid", ask: "Tuition, fees and course materials paid in 2026:", kind: "money", default: 4000 },
      { key: "which", ask: "Which fits?", kind: "choice", options: ["First 4 years of college", "Grad school or job-skills courses"], default: "First 4 years of college" },
      { key: "income", ask: "Is your income under $80,000 (single) or $160,000 (joint)?", kind: "choice", options: ["Yes", "No"], default: "Yes" },
    ],
  },
  {
    id: "edu-529", title: "529 plan: your state's tax deduction for contributions", issuer: "Your state's 529 plan", category: "Education",
    community: "Parents and anyone saving for school", year: "2026", tags: ["529", "college savings", "state tax deduction", "contribution deadline"],
    sources: [{ label: "Saving for College: 529 contribution deadlines for 2026", url: "https://www.savingforcollege.com/article/529-plan-contribution-deadlines" }],
    checked: "Most states require 2026 contributions by December 31, 2026; Georgia, Indiana, Kansas, Mississippi, Oklahoma, South Carolina and Wisconsin allow until April 15, and Iowa April 30. Some states (like California) give no deduction.",
    terms: ["Many states deduct 529 contributions from state income tax, up to a yearly cap, only for contributions made by the state's deadline (usually December 31)."],
    questions: [
      { key: "cap", ask: "Your state deducts up to (per year; 0 if none):", kind: "money", default: 5000 },
      { key: "contributed", ask: "Contributed this year so far:", kind: "money", default: 1000 },
      { key: "rate", ask: "Your state income tax rate:", kind: "percent", default: 6 },
      { key: "deadline", ask: "Your state's deadline:", kind: "date", default: "2026-12-31" },
    ],
  },
  {
    id: "edu-loan-interest", title: "Student loan interest deduction (up to $2,500)", issuer: "IRS (Form 1098-E)", category: "Education",
    community: "Anyone paying student loans", year: "2026", tags: ["student loan interest", "1098-e", "deduction", "taxes"],
    sources: [IRS970],
    checked: "Deduct up to $2,500 of student loan interest a year, even without itemizing; it phases out at higher incomes (see Publication 970 for the 2026 range).",
    terms: ["You can deduct up to $2,500 of student loan interest you paid during the year on your tax return; your servicer sends Form 1098-E."],
    questions: [
      { key: "interest", ask: "Student loan interest paid in 2026:", kind: "money", default: 1200 },
      { key: "rate", ask: "Your federal tax bracket:", kind: "percent", default: 22 },
      { key: "income", ask: "Is your income under the phase-out (about $80,000 single)?", kind: "choice", options: ["Yes", "No"], default: "Yes" },
    ],
  },
  {
    id: "edu-idr", title: "Income-driven repayment: annual recertification", issuer: "Federal Student Aid (studentaid.gov)", category: "Education",
    community: "Federal student loan borrowers", year: "2026", tags: ["idr", "income-driven repayment", "recertification", "pslf", "student loans", "studentaid.gov"],
    sources: [{ label: "Federal Student Aid: recertify your income-driven repayment plan", url: "https://studentaid.gov/manage-loans/repayment/plans/income-driven/recertify" }],
    checked: "You must recertify income and family size every year. If you miss the date, your payment can rise to the standard 10-year amount until you recertify.",
    terms: ["Income-driven repayment payments are recalculated each year; if you miss your recertification date, your monthly payment can jump to the standard 10-year plan amount."],
    questions: [
      { key: "due", ask: "Your recertification is due:", kind: "date", default: "2026-12-15" },
      { key: "now", ask: "Your monthly payment now:", kind: "money", default: 180 },
      { key: "standard", ask: "Your standard 10-year payment (on your servicer site):", kind: "money", default: 420 },
    ],
  },
  {
    id: "edu-fafsa", title: "FAFSA and state grant priority deadlines (2027-28)", issuer: "Federal Student Aid + your state", category: "Education",
    community: "College students and parents", year: "2027-28", tags: ["fafsa", "cal grant", "state grant", "financial aid", "pell", "priority deadline"],
    sources: [{ label: "NCAN: 2027-28 state financial aid deadlines", url: "https://www.ncan.org/Web/FAFSA/2027-2028-FAFSA/State-Systems-and-Financial-Aid-Deadlines.aspx" }],
    checked: "The 2027-28 FAFSA opened October 1, 2026. Some state aid is first-come, first-served; California's Cal Grant deadline is March 2, 2027 and Texas's priority date is January 15, 2027.",
    terms: ["State grants and some campus aid are awarded by priority deadline or until money runs out; filing the FAFSA after your state's date can cost you grant money you'd otherwise get."],
    questions: [
      { key: "grant", ask: "State and campus grant you got last year (or expect):", kind: "money", default: 3000 },
      { key: "deadline", ask: "Your state's priority deadline:", kind: "date", default: "2027-03-02" },
      { key: "filed", ask: "Filed the 2027-28 FAFSA yet?", kind: "choice", options: ["No", "Yes"], default: "No" },
    ],
  },
  {
    id: "edu-drop-refund", title: "Tuition refund: drop a class before the refund deadline", issuer: "Your college's registrar", category: "Education",
    community: "College students", year: "2026", tags: ["drop deadline", "tuition refund", "withdraw", "registrar", "add drop"],
    sources: [{ label: "Example: UC Berkeley Office of the Registrar, refund schedule", url: "https://registrar.berkeley.edu/tuition-fees-residency/tuition-fees/fee-payment/refund-schedule/" }],
    checked: "Most colleges refund 100% of a class's tuition only through the add/drop deadline, then on a shrinking schedule. Check your registrar's calendar.",
    terms: ["Colleges refund tuition for a dropped class in full only before the drop deadline; after it, the refund shrinks and then disappears."],
    questions: [
      { key: "dropping", ask: "Thinking about dropping a class?", kind: "choice", options: ["No", "Maybe", "Yes"], default: "No" },
      { key: "tuition", ask: "That class's tuition:", kind: "money", default: 1200 },
      { key: "deadline", ask: "Full-refund deadline:", kind: "date", default: "2026-11-07" },
    ],
  },
  {
    id: "edu-student-perks", title: "Student perks that end when you graduate", issuer: "Software and subscription companies", category: "Education",
    community: "College students", year: "2026", tags: ["github student pack", "microsoft 365", "prime student", "spotify student", "apple education", "adobe", "student discount", "graduation"],
    sources: [{ label: "GitHub Student Developer Pack terms (revalidate every 2 years)", url: "https://docs.github.com/en/education/about-github-education/github-education-for-students/github-terms-and-conditions-for-the-student-developer-pack" }],
    checked: "Student offers need proof of enrollment and end (or reprice) when you graduate. Prices and terms change often; we list what to plan for, not dollar values.",
    terms: [
      "Student software and subscription discounts require verified enrollment and end, or switch to full price, after graduation.",
      "Before graduating: export your files from school accounts, claim one-time student offers you'd use, and set reminders for subscriptions that will reprice.",
    ],
    questions: [
      { key: "grad", ask: "Your graduation date:", kind: "date", default: "2027-05-15" },
      { key: "perks", ask: "Which do you use?", kind: "used", items: ["GitHub Student Developer Pack", "Microsoft 365 through school", "Amazon Prime Student", "Spotify Premium Student", "Apple education pricing", "Adobe Creative Cloud student plan", "School Google or OneDrive storage"] },
    ],
  },
];

export function eduLines(plan: Plan, a: Answers): string[] {
  switch (plan.id) {
    case "edu-tuition-127": return [`My program pays up to ${usd(num(a.limit, 5250))} a year; reimbursed so far: ${usd(num(a.used))}.`, `Tuition paid but not submitted: ${usd(num(a.pending))}.`, `Program year ends ${fmtDate(String(a.year_end || "2026-12-31"))}.`];
    case "edu-loan-repay": return [`My employer contributes up to ${usd(num(a.monthly, 100))} a month to my student loans.`, `Enrolled: ${a.enrolled === "Yes" ? "yes" : "no"}. Benefit year ends ${fmtDate(String(a.year_end || "2026-12-31"))}.`];
    case "edu-credits": return [`Tuition, fees and course materials I paid in 2026: ${usd(num(a.paid))}.`, `Which fits: ${a.which || "First 4 years of college"}. Income under the limit: ${a.income === "No" ? "no" : "yes"}.`];
    case "edu-529": return [`My state deducts 529 contributions up to ${usd(num(a.cap, 5000))} a year; I've contributed ${usd(num(a.contributed))} so far.`, `My state tax rate: ${num(a.rate, 6)}%. My state's deadline: ${fmtDate(String(a.deadline || "2026-12-31"))}.`];
    case "edu-loan-interest": return [`Student loan interest I paid in 2026: ${usd(num(a.interest))}.`, `My federal bracket: ${num(a.rate, 22)}%. Under the phase-out: ${a.income === "No" ? "no" : "yes"}.`];
    case "edu-idr": return [`My income-driven repayment recertification is due ${fmtDate(String(a.due || "2026-12-15"))}.`, `My payment now: ${usd(num(a.now, 180))} a month; the standard 10-year payment: ${usd(num(a.standard, 420))}.`];
    case "edu-fafsa": return [`State and campus grant I get: ${usd(num(a.grant, 3000))}.`, `My state's priority deadline: ${fmtDate(String(a.deadline || "2027-03-02"))}. Filed the 2027-28 FAFSA: ${a.filed === "Yes" ? "yes" : "no"}.`];
    case "edu-drop-refund": return [`Thinking about dropping a class: ${String(a.dropping || "No").toLowerCase()}.`, `That class's tuition: ${usd(num(a.tuition, 1200))}; full refund until ${fmtDate(String(a.deadline || "2026-11-07"))}.`];
    case "edu-student-perks": return [`I graduate on ${fmtDate(String(a.grad || "2027-05-15"))}.`, `Student perks I use: ${((a.perks as string[]) ?? []).join(", ") || "none listed"}.`];
    default: return [];
  }
}

export function eduFindings(plan: Plan, a: Answers, line: (re: RegExp) => string, id: (kind: string) => string, today: string): LibFinding[] {
  const out: LibFinding[] = [];
  const add = (f: Omit<LibFinding, "id" | "category"> & { facts?: Record<string, number> }) => out.push({ id: id("edu"), category: "education", ...f });
  if (plan.id === "edu-tuition-127") {
    const left = Math.max(0, num(a.limit, 5250) - num(a.used)), claim = Math.min(left, num(a.pending));
    if (left > 0) add({ label: "Employer tuition assistance", amount: claim || left, deadline: String(a.year_end || "2026-12-31"), span: line(/^Tuition paid but not submitted/), rule: plan.terms[1], facts: { left, claim } });
  }
  if (plan.id === "edu-loan-repay" && a.enrolled !== "Yes") {
    const months = Math.max(0, 12 - new Date(`${today}T12:00:00Z`).getUTCMonth() - 1);
    add({ label: "Employer student loan payments you're not enrolled in", amount: round2(num(a.monthly, 100) * Math.max(1, months)), deadline: String(a.year_end || "2026-12-31"), span: line(/^Enrolled:/), rule: plan.terms[0], facts: { monthly: num(a.monthly, 100), months: Math.max(1, months) } });
  }
  if (plan.id === "edu-credits" && a.income !== "No") {
    const paid = num(a.paid), aotc = a.which !== "Grad school or job-skills courses";
    const credit = aotc ? Math.min(2000, paid) + 0.25 * Math.max(0, Math.min(2000, paid - 2000)) : 0.2 * Math.min(10000, paid);
    if (credit > 0) add({ label: aotc ? "American Opportunity credit" : "Lifetime Learning credit", amount: round2(credit), deadline: "2027-04-15", span: line(/^Tuition, fees and course materials/), rule: plan.terms[2], facts: { paid, aotc: aotc ? 1 : 0 } });
  }
  if (plan.id === "edu-529" && num(a.cap, 5000) > 0) {
    const room = Math.max(0, num(a.cap, 5000) - num(a.contributed)), save = round2(room * num(a.rate, 6) / 100);
    if (save > 0) add({ label: "529 state tax deduction room", amount: save, deadline: String(a.deadline || "2026-12-31"), span: line(/^My state deducts 529/), rule: plan.terms[0], facts: { room, rate: num(a.rate, 6) } });
  }
  if (plan.id === "edu-loan-interest" && a.income !== "No") {
    const ded = Math.min(2500, num(a.interest)), save = round2(ded * num(a.rate, 22) / 100);
    if (save > 0) add({ label: "Student loan interest deduction", amount: save, deadline: "2027-04-15", span: line(/^Student loan interest I paid/), rule: plan.terms[0], facts: { ded, rate: num(a.rate, 22) } });
  }
  if (plan.id === "edu-idr") {
    const jump = Math.max(0, num(a.standard, 420) - num(a.now, 180));
    if (jump > 0 && String(a.due || "2026-12-15") >= today) add({ label: "IDR recertification", amount: round2(jump * 3), deadline: String(a.due || "2026-12-15"), span: line(/recertification is due/), rule: plan.terms[0], facts: { jump, now: num(a.now, 180), standard: num(a.standard, 420) } });
  }
  if (plan.id === "edu-fafsa" && a.filed !== "Yes" && num(a.grant, 3000) > 0) {
    add({ label: "State and campus grants (FAFSA priority deadline)", amount: num(a.grant, 3000), deadline: String(a.deadline || "2027-03-02"), span: line(/^State and campus grant/), rule: plan.terms[0] });
  }
  if (plan.id === "edu-drop-refund" && a.dropping && a.dropping !== "No" && String(a.deadline || "2026-11-07") >= today) {
    add({ label: "Full tuition refund for a dropped class", amount: num(a.tuition, 1200), deadline: String(a.deadline || "2026-11-07"), span: line(/^That class's tuition/), rule: plan.terms[0] });
  }
  if (plan.id === "edu-student-perks" && ((a.perks as string[]) ?? []).length) {
    add({ label: "Student perks that end at graduation", amount: 0, deadline: String(a.grad || "2027-05-15"), span: line(/^Student perks I use/), rule: plan.terms[0], facts: { count: ((a.perks as string[]) ?? []).length } });
  }
  return out;
}

type Req = (title: string, to: string, lines: string[], savings?: number) => Tile["action"];
const NONE: Tile["action"] = { kind: "none", summary: "Informational", savings: 0, payload: {} };

// The crop for an education finding.
export function eduTile(b: Balance, base: Omit<Tile, "id" | "category" | "title" | "live" | "atStake" | "doNothingCost" | "candidates" | "headline" | "tradeoff" | "doNothing" | "action">, fact: (k: string) => number, by: string, req: Req): Tile {
  const plan = b.id.replace(/^lib_/, "").replace(/_edu$/, "");
  const t = (title: string, headline: string, tradeoff: string, doNothing: string, action: Tile["action"], extra: Partial<Tile> = {}): Tile => ({
    ...base, id: `tile_${b.id}`, category: "education", title, live: action.kind !== "none", atStake: b.amount, doNothingCost: b.amount,
    candidates: [{ id: "act", label: action.summary, costToUser: 0, detail: b.ruleText }], headline, tradeoff, doNothing, action, ...extra,
  });
  switch (plan) {
    case "edutuition127": if (!fact("claim")) return t(`${usd(fact("left"))} of tuition assistance left this year`, `Your employer's program has ${usd(fact("left"))} of tax-free tuition assistance left until ${by}. It doesn't carry over, so if a course you already planned fits, take it this year.`, "Only courses you'd take anyway.", `Unused assistance resets after ${by}.`, NONE, { atStake: 0, doNothingCost: 0 });
      return t(`Submit ${usd(b.amount)} of tuition to your employer before ${by}`, `You've paid ${usd(b.amount)} of tuition your employer's program would reimburse tax-free. ${usd(fact("left"))} of this year's assistance is still unused and doesn't carry over.`, "Most programs need receipts and a passing grade; Ruth gathers them.", `Unused assistance resets after ${by}.`, req("Submit tuition reimbursement", "your employer's education benefits portal", ["Opening your education benefits portal (Guild, EdAssist, Workday…)", "Attaching tuition receipts and your grade", "Reimbursement requested"]));
    case "eduloanrepay": return t(`Enroll in your employer's student loan benefit: ${usd(b.amount)} this year`, `Your employer pays up to ${usd(fact("monthly"))} a month toward student loans, but only after you enroll. That's about ${usd(b.amount)} over the ${fact("months")} month${fact("months") === 1 ? "" : "s"} left this year.`, "Tax-free up to $5,250 a year (shared with tuition assistance).", `About ${usd(fact("monthly"))} a month goes unclaimed.`, req("Enroll in student loan repayment", "your benefits portal", ["Opening your benefits portal → Student loan repayment", "Linking your loan servicer account", "Enrollment submitted"]));
    case "educredits": return t(`Claim the ${fact("aotc") ? "American Opportunity" : "Lifetime Learning"} credit: ${usd(b.amount)}`, `You paid ${usd(fact("paid"))} in qualifying education costs this year. On your 2026 return that's a ${usd(b.amount)} ${fact("aotc") ? "American Opportunity" : "Lifetime Learning"} credit (Form 8863).`, "Needs your school's Form 1098-T. Not tax advice: a preparer can confirm.", `File without Form 8863 and the ${usd(b.amount)} credit is left on the table.`, req("Prepare Form 8863", "your tax return (Form 8863)", ["Reading your Form 1098-T", "Filling Form 8863", "Ready to add to your return"]));
    case "edu529": return t(`529: contribute by ${by} for about ${usd(b.amount)} off state taxes`, `You have ${usd(fact("room"))} of 529 deduction room left this year. At your ${fact("rate")}% state rate, contributing it by ${by} saves about ${usd(b.amount)}.`, "Only money you'd save for school anyway. Options, not advice.", `The deduction room resets after ${by}.`, req("Schedule a 529 contribution", "your state's 529 plan", ["Opening your 529 account → Contribute", `Scheduling the contribution before ${by}`, "Contribution scheduled"]));
    case "eduloaninterest": return t(`Deduct your student loan interest: about ${usd(b.amount)} back`, `You paid student loan interest this year; deducting ${usd(fact("ded"))} saves about ${usd(b.amount)} at your ${fact("rate")}% bracket.`, "You need Form 1098-E from your servicer (download it in January).", "Missed if you don't add it to your return.", req("Add the student loan interest deduction", "your tax return (Schedule 1)", ["Downloading Form 1098-E from your servicer", "Adding the deduction to Schedule 1", "Ready for your return"]));
    case "eduidr": return t(`Recertify your student loan payment before ${by}`, `Miss your recertification and your payment can jump from ${usd(fact("now"))} to ${usd(fact("standard"))} a month: about ${usd(b.amount)} more over three months until it's fixed.`, "Takes about 10 minutes on studentaid.gov; income can come straight from the IRS.", `Payment may jump to ${usd(fact("standard"))} after ${by}.`, req("Recertify income-driven repayment", "studentaid.gov", ["Opening studentaid.gov → Income-driven repayment", "Linking your IRS income data", "Recertification submitted"]));
    case "edufafsa": return t(`File the 2027-28 FAFSA before ${by} to keep ${usd(b.amount)} of grants`, `Your state awards grants by priority deadline. Filing the FAFSA by ${by} keeps you in line for about ${usd(b.amount)} like last year.`, "Free to file; takes about 30 minutes with the IRS data transfer.", `Grant money can run out after ${by}.`, req("File the FAFSA", "studentaid.gov", ["Opening studentaid.gov → FAFSA 2027-28", "Pulling tax info with the IRS data exchange", "FAFSA submitted"]));
    case "edudroprefund": return t(`Drop the class by ${by} for a full ${usd(b.amount)} refund`, `If you're going to drop it, doing it by ${by} refunds the full ${usd(b.amount)}; after that the refund shrinks.`, "Only if you've decided; check with your advisor about financial aid and enrollment status.", `The full refund ends ${by}.`, req("Drop the class", "your student portal", ["Opening your student portal → Enrollment", "Dropping the class", "Refund requested"]), { ask: "Have you decided to drop it?" });
    case "edustudentperks": return t(`${fact("count")} student perk${fact("count") === 1 ? "" : "s"} end when you graduate (${by})`, `When you graduate on ${by}, ${fact("count")} student offer${fact("count") === 1 ? "" : "s"} you use will end or switch to full price. Export school files and plan for the price changes.`, "No dollar values: prices change often.", "Surprise renewals at full price and lost school storage.", NONE, { atStake: 0, doNothingCost: 0 });
    default: return t(b.label, b.ruleText, "", "", NONE);
  }
}
