// Purchases we can price-check, matched from statement lines to the store's product page, with the
// store's price-match window. Small on purpose: each entry is a page we know Apify can read.
export type Watch = { match: RegExp; store: string; name: string; url: string; matchDays: number; policy: string };

export const WATCHLIST: Watch[] = [
  {
    match: /target.*airpods pro|airpods pro.*target/i, store: "Target", name: "AirPods Pro 3",
    url: "https://www.target.com/p/apple-airpods-3rd-generation/-/A-85978609", matchDays: 14,
    policy: "Target matches its own lower price within 14 days of purchase.",
  },
];

export const watchFor = (line: string) => WATCHLIST.find((w) => w.match.test(line));
