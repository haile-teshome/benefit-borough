// Turn a page into sentences, then check each expected credit/limit against what the page says.
// The same logic lives in lib/integrations/terms-watch.ts (the app's local fallback); keep them in sync.

const STOP = new Set(['credit', 'credits', 'the', 'and', 'for', 'your', 'plan', 'plans', 'with', 'per', 'each', 'year', 'from', 'that', 'this', 'are', 'can', 'may', 'you', 'its', 'into', 'has', 'have', 'not', 'any', 'all', 'up', 'to', 'of', 'in', 'on', 'or', 'a', 'an', '2025', '2026', '2027']);
// Words that show up next to every amount; they only count once a more specific word has matched.
const GENERIC = new Set(['maximum', 'minimum', 'limit', 'benefit', 'benefits', 'network', 'in-network', 'annual', 'monthly', 'quarterly', 'statement', 'fee', 'fees', 'amount', 'total', 'contribution', 'deductible', 'travel', 'card']);
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(?!\d)/g;

export function htmlToText(html) {
    return html
        .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|li|h[1-6]|td|th|tr|dt|dd|div|section|article|blockquote|caption)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#36;|&dollar;/gi, '$')
        .replace(/&rsquo;|&#8217;|&lsquo;|&#8216;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&[a-z]+;/gi, ' ')
        .replace(/[ \t\r\f\v]+/g, ' ');
}

// Sentences, plus "label + value" pairs for table rows and definition lists where the name and
// the amount sit in neighbouring cells.
export function sentences(text) {
    const parts = text.split(/\n+|(?<=[.!?])\s+(?=[A-Z$])/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    parts.forEach((s, i) => {
        if (s.length >= 12 && s.length <= 500) out.push(s);
        if (s.length < 80 && !s.includes('$') && !/[.!?]$/.test(s) && parts[i + 1]?.includes('$')) out.push(`${s}: ${parts[i + 1]}`.slice(0, 500));
    });
    return out;
}

export const amounts = (s) => [...s.matchAll(MONEY)].map((m) => parseFloat(m[1].replace(/,/g, '') + (m[2] ?? '')));

const words = (s) => s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9+-]+/).filter((w) => w.length >= 3 && !STOP.has(w));

// One finding per expectation: "same" if a sentence about it still says the expected amount,
// "changed" if a sentence naming it quotes another amount, "missing" if it's discussed without the
// amount, "offpage" if the page never mentions it.
export function check(sents, { key, name, amount }) {
    const kws = [...new Set(words(name))];
    const need = Math.max(1, Math.ceil(kws.length * 0.5));
    const specific = kws.filter((k) => !GENERIC.has(k));
    const hits = sents
        .map((s) => {
            const lw = [...new Set(words(s))];
            const got = kws.filter((k) => lw.some((w) => w === k || w.startsWith(k) || (k.startsWith(w) && w.length >= 4)));
            return { s, score: got.length, ok: !specific.length || got.some((k) => !GENERIC.has(k)), all: specific.every((k) => got.includes(k)), nums: amounts(s) };
        })
        .filter((h) => kws.length && h.ok && h.score >= need)
        .sort((a, b) => b.score - a.score);
    const base = { key, name, expected: amount };
    const eq = (n, m) => Math.abs(n - amount * m) < 0.005 * m;
    const same = hits.find((h) => h.nums.some((n) => eq(n, 1)));
    if (same) return { ...base, seen: amount, snippet: clip(same.s), status: 'same' };
    // "$25 a month" is often written as "$300 a year": an annualized total still counts as unchanged.
    const annual = hits.find((h) => h.nums.some((n) => [2, 4, 12].some((m) => eq(n, m))));
    if (annual) return { ...base, seen: amount, snippet: clip(annual.s), status: 'same' };
    // "changed" needs every specific word of the item in the sentence: one shared word ("hotel") in a
    // sidebar about another card is not the same credit.
    const other = hits.find((h) => h.nums.length && h.all);
    if (other) {
        const seen = other.nums.reduce((best, n) => (Math.abs(n - amount) < Math.abs(best - amount) ? n : best), other.nums[0]);
        return { ...base, seen, snippet: clip(other.s), status: 'changed' };
    }
    // offpage: this page never mentions the item; the app lists it once as unchecked if no page does.
    if (!hits.length) return { ...base, seen: null, snippet: '', status: 'offpage' };
    return { ...base, seen: null, snippet: clip(hits[0].s), status: 'missing' };
}

const clip = (s) => (s.length > 240 ? `${s.slice(0, 237)}...` : s);
