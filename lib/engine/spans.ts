import type { SourceDoc } from "../documents";
import type { Span } from "../types";

// Locate a quoted span in a document. Returns null when the quote is not verbatim in the doc:
// that is how a hallucinated balance gets dropped instead of shown.
export function findSpan(docs: SourceDoc[], docId: string, quote: string): Span | null {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const ordered = [...docs.filter((d) => d.id === docId), ...docs.filter((d) => d.id !== docId)];
  for (const d of ordered) {
    const i = d.text.indexOf(quote);
    if (i >= 0) return { doc: d.id, start: i, end: i + quote.length, text: quote };
    const flat = norm(d.text);
    const j = flat.indexOf(norm(quote));
    if (j >= 0 && norm(quote).length > 0) {
      // Map back approximately by searching the first 12 chars of the quote.
      const head = norm(quote).slice(0, 12);
      const k = d.text.indexOf(head);
      if (k >= 0) return { doc: d.id, start: k, end: Math.min(d.text.length, k + quote.length), text: quote };
    }
  }
  return null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export const usd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
