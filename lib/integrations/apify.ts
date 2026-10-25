import fs from "node:fs";
import path from "node:path";

// Live store prices through Apify's E-commerce Scraping Tool. Results are cached for 6 hours so a
// rescan doesn't pay for the same lookup twice.
const ACTOR = "apify~e-commerce-scraping-tool";
const CACHE = path.join(process.cwd(), ".data", "prices.json");
const TTL = 6 * 3600_000;

export const apifyEnabled = () => Boolean(process.env.APIFY_TOKEN);

type Cached = Record<string, { price: number | null; name?: string; at: number }>;
const readCache = (): Cached => { try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; } };

export async function livePrices(urls: string[]): Promise<Record<string, number | null>> {
  const cache = readCache();
  const out: Record<string, number | null> = {};
  const todo = urls.filter((u) => { const c = cache[u]; if (c && Date.now() - c.at < TTL) { out[u] = c.price; return false; } return true; });
  if (todo.length && apifyEnabled()) {
    try {
      const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?timeout=180`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.APIFY_TOKEN}` },
        body: JSON.stringify({ detailsUrls: todo.map((url) => ({ url })), scrapeMode: "AUTO", additionalProperties: false }),
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const items = (await res.json()) as { url?: string; name?: string; offers?: { price?: number | string | null } }[];
      for (const u of todo) {
        const hit = items.find((i) => i.url && (i.url === u || i.url.split("?")[0] === u.split("?")[0])) ?? (todo.length === 1 ? items[0] : undefined);
        const raw = hit?.offers?.price;
        const price = typeof raw === "number" ? raw : raw ? parseFloat(String(raw).replace(/[^0-9.]/g, "")) || null : null;
        out[u] = price;
        cache[u] = { price, name: hit?.name, at: Date.now() };
      }
      fs.mkdirSync(path.dirname(CACHE), { recursive: true });
      fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
    } catch (err) {
      console.warn("[apify] price check failed", err);
    }
  }
  return out;
}
