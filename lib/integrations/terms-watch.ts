import fs from "node:fs";
import path from "node:path";
import type { Plan } from "@/lib/library/catalog";

// The fine-print watcher: re-reads each library plan's source pages and checks the credits and dollar
// limits we rely on. Runs our Benefit Terms Watcher actor on Apify (actors/benefit-terms-watcher)
// when APIFY_TOKEN + APIFY_TERMS_ACTOR are set, otherwise does the same extraction in-process.
// Reports are cached in .data/terms-watch.json for 12 hours.
const CACHE = path.join(process.cwd(), ".data", "terms-watch.json");
const TTL = 12 * 3600_000;
const MAX_PAGES = 12;

export type Expect = { key: string; name: string; amount: number };
export type WatchPage = { planId: string; url: string; expect: Expect[] };
export type Finding = { key: string; name: string; expected: number; seen: number | null; snippet: string; status: "same" | "changed" | "missing" };
export type PageReport = { planId: string; url: string; fetchedAt: string; ok: boolean; title: string; findings: Finding[]; error?: string };
export type TermsReport = { ranAt: string | null; engine: "apify" | "local" | null; pages: PageReport[]; note?: string };

export const termsWatchEnabled = () => Boolean(process.env.APIFY_TOKEN && process.env.APIFY_TERMS_ACTOR);

export function latestReport(): TermsReport {
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")) as TermsReport; } catch { return { ranAt: null, engine: null, pages: [] }; }
}

export async function runTermsWatch(plans: Plan[], { force = false } = {}): Promise<TermsReport> {
  const cached = latestReport();
  if (!force && cached.ranAt && Date.now() - Date.parse(cached.ranAt) < TTL) return cached;
  const pages = watchList(plans);
  let report: TermsReport | null = null;
  if (termsWatchEnabled()) {
    try { report = { ranAt: new Date().toISOString(), engine: "apify", pages: await viaApify(pages) }; }
    catch (err) { console.warn("[terms-watch] actor run failed, checking locally:", (err as Error).message); }
  }
  report ??= { ranAt: new Date().toISOString(), engine: "local", pages: await watchLocally(pages) };
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(report, null, 2));
  return report;
}

// Which pages to watch and what we expect each to say: credits first, then dollar amounts in terms.
// PDFs are skipped (the actor reads HTML only). First source of every plan, then extra sources.
export function watchList(plans: Plan[]): WatchPage[] {
  const withExpect = plans.map((p) => ({ p, expect: expectations(p) })).filter((x) => x.expect.length);
  const firsts: WatchPage[] = [], extras: WatchPage[] = [];
  for (const { p, expect } of withExpect) {
    p.sources.filter((s) => !/\.pdf($|\?)/i.test(s.url)).forEach((s, i) => (i ? extras : firsts).push({ planId: p.id, url: s.url, expect }));
  }
  return [...firsts, ...extras].slice(0, MAX_PAGES);
}

function expectations(plan: Plan): Expect[] {
  const out: Expect[] = (plan.credits ?? []).map((c) => ({ key: c.key, name: c.name, amount: c.amount }));
  plan.terms.forEach((term, i) => {
    [...term.matchAll(MONEY)].forEach((m, j) => {
      const before = term.slice(0, m.index);
      const prefix = before.includes(":") ? before.split(":")[0] : "";
      const local = before.slice(prefix.length).replace(MONEY, " ").replace(/[():;,]/g, " ").trim().split(/\s+/).slice(prefix ? -4 : -6).join(" ");
      const label = `${prefix} ${local}`;
      const after = term.slice(m.index! + m[0].length).split(/[,;.)(]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
      const name = `${label} ${after}`.replace(/\b20\d\d\b/g, "").replace(/\s+/g, " ").trim();
      const amount = toNum(m);
      if (amount >= 1 && !out.some((e) => e.name === name && e.amount === amount)) out.push({ key: `t${i}-${j}`, name, amount });
    });
  });
  return out.slice(0, 10);
}

async function viaApify(pages: WatchPage[]): Promise<PageReport[]> {
  const actor = encodeURIComponent(process.env.APIFY_TERMS_ACTOR!).replace("%7E", "~");
  const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=240`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
    body: JSON.stringify({ pages }),
    signal: AbortSignal.timeout(270_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as PageReport[];
}

// Same extraction as the actor (actors/benefit-terms-watcher/src/extract.js), with plain fetch.
export async function watchLocally(pages: WatchPage[]): Promise<PageReport[]> {
  return Promise.all(pages.map(async (page): Promise<PageReport> => {
    const fetchedAt = new Date().toISOString();
    try {
      const res = await fetch(page.url, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", Accept: "text/html,*/*" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 403 || res.status === 429 ? " (the site blocked the check)" : ""}`);
      if ((res.headers.get("content-type") ?? "").includes("pdf")) throw new Error("Page is a PDF; this watcher reads HTML pages only.");
      const html = await res.text();
      const title = htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
      const sents = sentences(htmlToText(html));
      return { planId: page.planId, url: page.url, fetchedAt, ok: true, title, findings: page.expect.map((e) => check(sents, e)) };
    } catch (err) {
      return { planId: page.planId, url: page.url, fetchedAt, ok: false, title: "", findings: [], error: (err as Error).message.slice(0, 300) };
    }
  }));
}

// ---- extraction (keep in sync with the actor's src/extract.js) ----
const STOP = new Set(["credit", "credits", "the", "and", "for", "your", "plan", "plans", "with", "per", "each", "year", "from", "that", "this", "are", "can", "may", "you", "its", "into", "has", "have", "not", "any", "all", "up", "to", "of", "in", "on", "or", "a", "an", "2025", "2026", "2027"]);
const GENERIC = new Set(["maximum", "minimum", "limit", "benefit", "benefits", "network", "in-network", "annual", "monthly", "quarterly", "statement", "fee", "fees", "amount", "total", "contribution", "deductible", "travel", "card"]);
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?!\d)/g;
const toNum = (m: RegExpMatchArray) => parseFloat(m[1].replace(/,/g, "") + (m[2] ?? ""));
const amounts = (s: string) => [...s.matchAll(MONEY)].map(toNum);
const words = (s: string) => s.toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9+-]+/).filter((w) => w.length >= 3 && !STOP.has(w));
const clip = (s: string) => (s.length > 240 ? `${s.slice(0, 237)}...` : s);

function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|td|th|tr|dt|dd|div|section|article|blockquote|caption)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#36;|&dollar;/gi, "$")
    .replace(/&rsquo;|&#8217;|&lsquo;|&#8216;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t\r\f\v]+/g, " ");
}

function sentences(text: string) {
  const parts = text.split(/\n+|(?<=[.!?])\s+(?=[A-Z$])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  parts.forEach((s, i) => {
    if (s.length >= 12 && s.length <= 500) out.push(s);
    if (s.length < 80 && !s.includes("$") && !/[.!?]$/.test(s) && parts[i + 1]?.includes("$")) out.push(`${s}: ${parts[i + 1]}`.slice(0, 500));
  });
  return out;
}

function check(sents: string[], { key, name, amount }: Expect): Finding {
  const kws = [...new Set(words(name))];
  const need = Math.max(1, Math.ceil(kws.length * 0.5));
  const specific = kws.filter((k) => !GENERIC.has(k));
  const hits = sents
    .map((s) => {
      const lw = [...new Set(words(s))];
      const got = kws.filter((k) => lw.some((w) => w === k || w.startsWith(k) || (k.startsWith(w) && w.length >= 4)));
      return { s, score: got.length, ok: !specific.length || got.some((k) => !GENERIC.has(k)), nums: amounts(s) };
    })
    .filter((h) => kws.length && h.ok && h.score >= need)
    .sort((a, b) => b.score - a.score);
  const base = { key, name, expected: amount };
  const eq = (n: number, m: number) => Math.abs(n - amount * m) < 0.005 * m;
  const same = hits.find((h) => h.nums.some((n) => eq(n, 1))) ?? hits.find((h) => h.nums.some((n) => [2, 4, 12].some((m) => eq(n, m))));
  if (same) return { ...base, seen: amount, snippet: clip(same.s), status: "same" };
  const other = hits.find((h) => h.nums.length);
  if (other) {
    const seen = other.nums.reduce((best, n) => (Math.abs(n - amount) < Math.abs(best - amount) ? n : best), other.nums[0]);
    return { ...base, seen, snippet: clip(other.s), status: "changed" };
  }
  return { ...base, seen: null, snippet: hits[0] ? clip(hits[0].s) : "", status: "missing" };
}
