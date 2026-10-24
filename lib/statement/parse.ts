// Turns an uploaded bank or card statement (CSV export or PDF text) into transactions.
// Every transaction keeps its raw line so findings can cite it verbatim.

export type Txn = { date: string; description: string; amount: number; raw: string };
// amount > 0 is money out (a charge or fee); amount < 0 is money in (payment, refund, deposit).

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function toIso(s: string, fallbackYear: number): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear;
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3] ?? fallbackYear}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

const money = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-") || /CR$/i.test(t);
  const n = parseFloat(t.replace(/[()\-+]|CR$/gi, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string, year: number): Txn[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hi = lines.findIndex((l) => l.includes(",") && /date/i.test(l) && /(amount|debit|credit)/i.test(l));
  if (hi < 0) return [];
  const head = splitCsv(lines[hi]).map((h) => h.toLowerCase());
  // First pattern that matches any column wins, so "Description" beats a "Details" column.
  const col = (...res: RegExp[]) => { for (const re of res) { const i = head.findIndex((h) => re.test(h)); if (i >= 0) return i; } return -1; };
  const iDate = col(/trans(action)?\.? date/, /post(ing)? date/, /date/);
  const iDesc = col(/description/, /merchant/, /payee/, /^name$/, /memo/, /details/);
  const iAmt = col(/^amount|amount$/);
  const iDebit = col(/debit|withdrawal/);
  const iCredit = col(/credit|deposit/);
  const rows = lines.slice(hi + 1).map((raw) => ({ raw, f: splitCsv(raw) }));
  let txns = rows.flatMap(({ raw, f }) => {
    const date = toIso(f[iDate] ?? "", year);
    if (!date) return [];
    let amount: number;
    if (iDebit >= 0 || iCredit >= 0) {
      const d = money(f[iDebit] ?? ""), c = money(f[iCredit] ?? "");
      amount = (Number.isFinite(d) ? Math.abs(d) : 0) - (Number.isFinite(c) ? Math.abs(c) : 0);
    } else amount = money(f[iAmt] ?? "");
    if (!Number.isFinite(amount) || amount === 0) return [];
    return [{ date, description: (f[iDesc] ?? "").replace(/\s+/g, " "), amount, raw }];
  });
  // Bank exports usually show charges as negative numbers; card exports as positive.
  if (iDebit < 0 && iCredit < 0) {
    const neg = txns.filter((t) => t.amount < 0).length;
    if (neg > txns.length / 2) txns = txns.map((t) => ({ ...t, amount: -t.amount }));
  }
  return txns;
}

// PDF statements: one transaction per line that starts with a date and ends with an amount.
export function parseLines(text: string, year: number): Txn[] {
  const re = /^\s*((?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)|(?:[A-Z][a-z]{2}\.?\s+\d{1,2}))\s+(.+?)\s+(-?\(?\$?[\d,]+\.\d{2}\)?(?:\s?CR)?)\s*$/;
  return text.split(/\r?\n/).flatMap((raw) => {
    const m = raw.match(re);
    if (!m) return [];
    const date = toIso(m[1], year);
    const amount = money(m[3]);
    if (!date || !Number.isFinite(amount) || amount === 0) return [];
    const description = m[2].replace(/\s+/g, " ").trim();
    // Payments and credits on card statements read as money in.
    const credit = /payment|thank you|refund|credit|deposit|direct dep|transfer from/i.test(description) && amount > 0;
    return [{ date, description, amount: credit ? -amount : amount, raw: raw.trim() }];
  });
}

export function statementYear(text: string, fallback: number) {
  const m = text.match(/\b(20\d{2})\b/);
  return m ? +m[1] : fallback;
}
