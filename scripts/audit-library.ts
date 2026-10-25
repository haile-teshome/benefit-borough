// Checks every plan in the library against its cited sources: does each source load, and does
// each dollar figure the plan states appear on at least one of its sources? Prints a report.
// Run: npx tsx scripts/audit-library.ts
import { extractText, getDocumentProxy } from "unpdf";
import { LIBRARY } from "../lib/library/catalog";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const has = (page: string, n: number) => {
  const plain = n.toLocaleString("en-US"), bare = String(n);
  return [plain, bare].some((f) => new RegExp(`\\$\\s?${f.replace(/[.,]/g, "\\$&")}(?![\\d])`).test(page));
};

async function fetchText(url: string): Promise<{ ok: boolean; status: number; page: string }> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("pdf") || url.endsWith(".pdf")) {
      const { text: t } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true });
      return { ok: res.ok, status: res.status, page: t.replace(/\s+/g, " ") };
    }
    return { ok: res.ok, status: res.status, page: text(await res.text()) };
  } catch (e) {
    return { ok: false, status: 0, page: "" };
  }
}

// Sources that block scripts but were opened and checked by hand in a browser.
const CHECKED_BY_HAND: Record<string, string> = {
  "https://www.napa-net.org/news/2025/2/do-401k-vesting-schedules-help-with-worker-retention/": "2026-10-25: \"Forfeitures occur in 30% of job separations\"",
  "https://www.pewresearch.org/short-reads/2023/08/10/more-than-4-in-10-u-s-workers-dont-take-all-their-paid-time-off/": "2026-10-25: \"Some 46% of U.S. workers...\"",
};

async function main() {
  for (const plan of LIBRARY) {
    const pages = await Promise.all(plan.sources.map((s) => fetchText(s.url)));
    const all = pages.map((p) => p.page).join(" ");
    const figures = new Set<number>();
    for (const c of plan.credits ?? []) figures.add(c.amount);
    for (const t of plan.terms) for (const m of t.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)) figures.add(parseFloat(m[1].replace(/,/g, "")));
    const missing = [...figures].filter((n) => !has(all, n));
    const src = plan.sources.map((s, i) => `${pages[i].ok ? "ok" : CHECKED_BY_HAND[s.url] ? `checked by hand ${CHECKED_BY_HAND[s.url]}` : `HTTP ${pages[i].status}`} ${s.url}`).join("\n     ");
    const broken = pages.some((p, i) => !p.ok && !CHECKED_BY_HAND[plan.sources[i].url]);
    console.log(`\n${missing.length || broken ? "✗" : "✓"} ${plan.id} (${plan.category})\n     ${src}\n     figures: ${[...figures].join(", ") || "none"}${missing.length ? `\n     NOT FOUND on sources: ${missing.join(", ")}` : ""}`);
  }
}
void main();
