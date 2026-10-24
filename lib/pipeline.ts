import type { SourceDoc } from "./documents";
import { extract } from "./engine/extract";
import { optimize } from "./engine/optimize";
import { review } from "./engine/reviewer";
import { usd } from "./engine/spans";
import { bookingCall } from "./integrations/cartesia";
import { peerTransfer } from "./integrations/transfer";
import { load, log, save } from "./store";
import type { AppState, DispatchResult } from "./types";

const docsText = (s: AppState) => s.docs.map((d) => `[${d.name}]\n${d.text}`).join("\n\n");

// Extract → Optimize → Reviewer, for every tile. The board only offers a tap on approved tiles.
export async function scan(docs: SourceDoc[], pid?: string | null): Promise<AppState> {
  const s = load(pid);
  s.docs = docs;
  const ex = await extract(docs);
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
  const s = load(pid);
  const tile = s.tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error("Unknown tile");
  if (s.reviews[tileId]?.verdict !== "approve") throw new Error("Reviewer has not approved this action");
  if (s.done.includes(tileId)) throw new Error("Already done");
  if (tile.action.kind === "none") throw new Error("Nothing to dispatch");

  log(s, "dispatch", `${tileId}: ${tile.action.summary}`);
  const result = tile.action.kind === "book_call" ? await bookingCall(tile.action) : await peerTransfer(tile.action);
  // Rule 6: the ledger moves only on a confirmed action.
  if (result.status === "confirmed") {
    s.ledger.push({ id: `L${s.ledger.length + 1}`, tileId, amount: tile.action.savings, description: tile.action.summary, confirmation: result.confirmation, at: new Date().toISOString() });
    s.done.push(tileId);
    log(s, "ledger", `+${usd(tile.action.savings)} confirmed by ${result.integration} (${result.confirmation})`);
  } else {
    log(s, "dispatch", `${tileId} failed; ledger unchanged`);
  }
  save(s, pid);
  return { state: s, result };
}
