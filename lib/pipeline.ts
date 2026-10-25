import type { SourceDoc } from "./documents";
import { extract } from "./engine/extract";
import { optimize } from "./engine/optimize";
import { defend, review } from "./engine/reviewer";
import { usd } from "./engine/spans";
import { bookingCall } from "./integrations/cartesia";
import { livePrices } from "./integrations/apify";
import { paidPrices, txUrl, x402Enabled } from "./integrations/x402";
import { requestAction } from "./integrations/request";
import { peerTransfer } from "./integrations/transfer";
import { hydrate, load, log, save } from "./store";
import type { AppState, DispatchResult } from "./types";
import { fresh, record } from "./rewards";

const docsText = (s: AppState) => s.docs.map((d) => `[${d.name}]\n${d.text}`).join("\n\n");

// Extract → Optimize → Reviewer, for every tile. The board only offers a tap on approved tiles.
export async function scan(docs: SourceDoc[], pid?: string | null): Promise<AppState> {
  await hydrate(pid);
  const s = load(pid);
  s.docs = docs;
  const ex = await extract(docs);
  // Price watches: ask Apify for the store's live price of each watched purchase.
  const watched = ex.balances.filter((b) => b.id.startsWith("up_") && b.category === "price_adjust");
  if (watched.length) {
    const urlOf = (ruleText: string) => ruleText.match(/Live price: (\S+)/)?.[1] ?? "";
    const urls = watched.map((b) => urlOf(b.ruleText)).filter(Boolean);
    let prices: Record<string, number | null>;
    let bought = false;
    if (x402Enabled()) {
      // Ruth buys the price from the Burrow's price desk over x402.
      const paid = await paidPrices(urls);
      prices = paid.prices;
      bought = Boolean(paid.payment);
      if (paid.payment) log(s, "x402", `Paid ${paid.payment.price} USDC for ${urls.length} live price${urls.length > 1 ? "s" : ""} over x402 (Base Sepolia) · ${txUrl(paid.payment.transaction)}`);
      else {
        log(s, "x402", `x402 payment didn't go through (${paid.error ?? "no receipt"}); looked the price up directly instead`);
        prices = await livePrices(urls);
      }
    } else prices = await livePrices(urls);
    for (const b of watched) {
      const p = prices[urlOf(b.ruleText)];
      if (p != null) ex.facts[`price_now:${b.id}`] = p;
      log(s, "price", `${b.label}: paid $${b.amount}, live price ${p != null ? `$${p}` : "unavailable"} (Apify${bought ? ", bought over x402" : ""})`);
    }
  }
  s.extraction = ex;
  log(s, "extract", `${ex.balances.length} balances, ${ex.careItems.length} care items (${ex.engine})${ex.dropped.length ? `; dropped ${ex.dropped.length} ungrounded` : ""}`);
  s.tiles = await optimize(ex);
  log(s, "optimize", `${s.tiles.length} tiles`);
  const verdicts = await Promise.all(s.tiles.map((tile) => review({ kind: "tile", tile }, ex, docsText(s))));
  s.tiles.forEach((t, i) => {
    s.reviews[t.id] = verdicts[i];
    log(s, "review", `${t.id}: ${verdicts[i].verdict}${verdicts[i].rule_cited ? ` (rule ${verdicts[i].rule_cited})` : ""}`);
  });
  save(s, pid);
  return s;
}

export async function reviewCart(balanceId: string, items: string[], pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  const balance = s.extraction?.balances.find((b) => b.id === balanceId);
  if (!s.extraction || !balance) throw new Error("Scan documents first");
  const v = await review({ kind: "cart", balance, items }, s.extraction, docsText(s));
  s.reviews[`cart:${balanceId}`] = v;
  log(s, "review", `cart on ${balanceId} [${items.join(", ")}]: ${v.verdict}${v.rule_cited ? ` (rule ${v.rule_cited})` : ""}`);
  save(s, pid);
  return { state: s, verdict: v };
}

export async function dispatch(tileId: string, pid?: string | null): Promise<{ state: AppState; result: DispatchResult }> {
  await hydrate(pid);
  const s = load(pid);
  const tile = s.tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error("Unknown tile");
  if (s.reviews[tileId]?.verdict !== "approve") throw new Error("Reviewer has not approved this action");
  if (s.done.includes(tileId)) throw new Error("Already done");
  if (tile.action.kind === "none") throw new Error("Nothing to dispatch");
  if (tile.ask && s.answers?.[tileId] !== "go") throw new Error("Ruth is waiting for your answer first");

  log(s, "dispatch", `${tileId}: ${tile.action.summary}`);
  const result = tile.action.kind === "book_call" ? await bookingCall(tile.action) : tile.action.kind === "request" ? await requestAction(tile.action) : await peerTransfer(tile.action);
  // Rule 6: the ledger moves only on a confirmed action.
  if (result.status === "confirmed") {
    s.ledger.push({ id: `L${s.ledger.length + 1}`, tileId, amount: tile.action.savings, description: tile.action.summary, confirmation: result.confirmation, at: new Date().toISOString() });
    s.done.push(tileId);
    const r = (s.rewards ??= fresh());
    const got = record(r, { kind: "harvest", saved: tile.action.savings, title: tile.title });
    if (got.acorns) log(s, "acorns", `+${got.acorns} acorns (${got.notes.join(", ")})`);
    log(s, "ledger", `+${usd(tile.action.savings)} confirmed by ${result.integration} (${result.confirmation})`);
  } else {
    log(s, "dispatch", `${tileId} failed; ledger unchanged`);
  }
  save(s, pid);
  return { state: s, result };
}

// The user answers a question Ruth asked. "keep" means don't act: she records it and stands down.
export async function answer(tileId: string, reply: "go" | "keep", pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  const tile = s.tiles.find((t) => t.id === tileId);
  if (!tile?.ask) throw new Error("Ruth didn't ask about that");
  s.answers = { ...(s.answers ?? {}), [tileId]: reply };
  log(s, "ask", `${tileId}: "${tile.ask}" → ${reply === "go" ? "user said go ahead" : "user said keep it"}`);
  if (reply === "keep") {
    s.reviews[tileId] = { verdict: "reject", rule_cited: 2, reason: "You told me you still use it, so I won't touch it. That's your call, not mine.", engine: "rules", at: new Date().toISOString() };
  }
  save(s, pid);
  return s;
}

// The user pushes back on a verdict. Ruth explains and may soften her wording, but a pushback can
// never loosen a rule: new facts have to arrive as documents, where they can be checked.
export async function challenge(key: string, message: string, pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  const v = s.reviews[key];
  if (!v) throw new Error("No verdict to challenge");
  const reply = await defend(key, v, message.slice(0, 500), s);
  log(s, "challenge", `${key}: user said "${message.slice(0, 120)}" → Ruth ${reply.stance === "hold" ? "held" : "acknowledged"} (${reply.engine})`);
  save(s, pid);
  return { state: s, reply };
}
