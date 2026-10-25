import type { SourceDoc } from "./documents";
import { extract } from "./engine/extract";
import { optimize } from "./engine/optimize";
import { defend, review } from "./engine/reviewer";
import { usd } from "./engine/spans";
import { bookingCall } from "./integrations/cartesia";
import { livePrices } from "./integrations/apify";
import { nessieEnabled, nessieStatement } from "./integrations/nessie";
import { attachProof } from "./claims/packet";
import { paidPrices, txUrl, x402Enabled } from "./integrations/x402";
import { requestAction } from "./integrations/request";
import { peerTransfer } from "./integrations/transfer";
import { hydrate, load, log, save } from "./store";
import type { AppState, DispatchResult } from "./types";
import { fresh, record } from "./rewards";
import { editPacket, fingerprint, preparePacket, profileFromDocs, refreshFromProfile } from "./claims/packet";
import type { Packet, Profile } from "./types";

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

// Ruth fills in the claim: the form, the proof and the message. She never sends it.
export async function prepare(tileId: string, pid?: string | null, by: Packet["preparedBy"] = "ruth") {
  await hydrate(pid);
  const s = load(pid);
  const tile = s.tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error("Unknown tile");
  if (!tile.live || tile.action.kind === "none") throw new Error("Nothing to claim here");
  if (s.done.includes(tileId)) throw new Error("Already claimed");
  s.profile = { ...profileFromDocs(s), ...(s.profile ?? {}) };
  // Receipts: Ruth reads your live bank activity too, so proof of payment is found, not asked for.
  if (nessieEnabled() && !s.docs.some((d) => d.id === "upload_nessie")) {
    try { s.docs = [...s.docs, await nessieStatement()]; log(s, "prepare", "Read your live bank activity (Capital One Nessie) to find receipts"); } catch { /* receipts can still be uploaded */ }
  }
  const packet = await preparePacket(tile, s, by);
  s.packets = [packet, ...(s.packets ?? []).filter((x) => x.id !== packet.id)];
  log(s, "prepare", `${by === "autopilot" ? "Autopilot" : "Ruth"} filled the ${packet.form} (${packet.fields.filter((f) => f.value).length}/${packet.fields.length} fields, ${packet.check.ok ? "ready for you to submit" : `${packet.check.issues.length} thing${packet.check.issues.length > 1 ? "s" : ""} need you`}). Not sent.`);
  save(s, pid);
  return { state: s, packet };
}

export async function editPacketFields(packetId: string, values: Record<string, string>, pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  const pk = s.packets?.find((x) => x.id === packetId);
  const tile = pk && s.tiles.find((t) => t.id === pk.tileId);
  if (!pk || !tile) throw new Error("Unknown packet");
  if (pk.status === "submitted") throw new Error("Already submitted");
  const next = editPacket(pk, values, tile, s);
  s.packets = s.packets!.map((x) => (x.id === packetId ? next : x));
  refreshFromProfile(s);
  log(s, "edit", `You edited ${Object.keys(values).filter((k) => k !== "__message").length} field(s) on the ${pk.form}`);
  save(s, pid);
  return { state: s, packet: s.packets!.find((x) => x.id === packetId)! };
}

// You attach a receipt Ruth couldn't find.
export async function attachReceipt(packetId: string, name: string, text: string, pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  const pk = s.packets?.find((x) => x.id === packetId);
  const tile = pk && s.tiles.find((t) => t.id === pk.tileId);
  if (!pk || !tile) throw new Error("Unknown packet");
  const next = attachProof(pk, name.slice(0, 120), text.slice(0, 20000), tile, s);
  s.packets = s.packets!.map((x) => (x.id === packetId ? next : x));
  log(s, "edit", `You attached ${name} to the ${pk.form}`);
  save(s, pid);
  return { state: s, packet: next };
}

export async function saveProfile(profile: Profile, pid?: string | null) {
  await hydrate(pid);
  const s = load(pid);
  s.profile = { ...(s.profile ?? {}), ...Object.fromEntries(Object.entries(profile).filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 200)])) };
  refreshFromProfile(s);
  save(s, pid);
  return s;
}

// You press Submit on a packet you've reviewed. The fingerprint you saw must match what's sent.
export async function submitPacket(packetId: string, hash: string, pid?: string | null) {
  await hydrate(pid);
  const s0 = load(pid);
  const pk = s0.packets?.find((x) => x.id === packetId);
  if (!pk) throw new Error("Unknown packet");
  if (pk.status === "submitted") throw new Error("Already submitted");
  if (!pk.check.ok) throw new Error(`Not ready: ${pk.check.issues[0]}`);
  if (hash !== pk.hash || fingerprint(pk) !== pk.hash) throw new Error("This packet changed since you reviewed it. Review it again.");
  const out = await dispatch(pk.tileId, pid, { packetId, hash });
  const s = out.state;
  s.packets = (s.packets ?? []).map((x) => (x.id === packetId ? { ...x, status: out.result.status === "confirmed" ? "submitted" : x.status, submittedAt: new Date().toISOString(), confirmation: out.result.confirmation } : x));
  save(s, pid);
  return out;
}

export async function dispatch(tileId: string, pid?: string | null, approval?: { packetId: string; hash: string }): Promise<{ state: AppState; result: DispatchResult }> {
  await hydrate(pid);
  const s = load(pid);
  const tile = s.tiles.find((t) => t.id === tileId);
  if (!tile) throw new Error("Unknown tile");
  // Ruth prepares, you submit: nothing goes out without your approval of the exact packet.
  const pk = approval && s.packets?.find((x) => x.id === approval.packetId && x.tileId === tileId);
  if (!pk || pk.hash !== approval!.hash) throw new Error("Review and submit Ruth's packet first; she never sends a claim on her own");
  if (s.reviews[tileId]?.verdict !== "approve") throw new Error("Reviewer has not approved this action");
  if (s.done.includes(tileId)) throw new Error("Already done");
  if (tile.action.kind === "none") throw new Error("Nothing to dispatch");
  if (tile.ask && s.answers?.[tileId] !== "go") throw new Error("Ruth is waiting for your answer first");

  log(s, "submit", `You approved and submitted the ${pk.form} (fingerprint ${pk.hash.slice(0, 8)})`);
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
