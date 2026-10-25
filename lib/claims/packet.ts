import crypto from "node:crypto";
import { z } from "zod";
import { claudeEnabled } from "../engine/claude";
import type { AppState, Packet, Profile, Tile } from "../types";
import { draftFor, parseLine } from "./forms";
import { structured } from "../engine/llm";

// Ruth prepares; you submit. A packet is everything a claim needs (the filled form, the proof,
// the message), checked against Ruth's rules. Submitting requires your approval of the exact
// packet: its fingerprint must match, so nothing changes between what you saw and what's sent.

export const fingerprint = (p: Pick<Packet, "fields" | "attachments" | "message" | "amount" | "submitTo">) =>
  crypto.createHash("sha256").update(JSON.stringify([p.fields.map((f) => [f.key, f.value]), p.attachments.map((a) => a.lines), p.message ?? "", p.amount, p.submitTo])).digest("hex").slice(0, 16);

// Ruth's packet checklist. Deterministic: a packet that fails any of these can't be submitted.
export function checkPacket(p: Omit<Packet, "check" | "status" | "hash">, tile: Tile, s: AppState): Packet["check"] {
  const passed: string[] = [], issues: string[] = [];
  const verdict = s.reviews[tile.id];
  (verdict?.verdict === "approve" ? passed : issues).push(verdict?.verdict === "approve" ? "Ruth approved this claim" : "Ruth hasn't approved this claim");
  // A savings move is capped by what was rescued; a claim by what the documents support.
  const cap = tile.action.payload.rail === "nessie-savings" ? Number(tile.action.payload.amount) : tile.action.savings;
  (p.amount <= cap + 0.01 ? passed : issues).push(p.amount <= cap + 0.01 ? `Asks for ${fmt(p.amount)}, no more than the documents support` : `Asks for ${fmt(p.amount)}, more than the ${fmt(cap)} the documents support`);
  const blank = p.fields.filter((f) => f.required && !f.value.trim());
  if (blank.length) issues.push(`Only you can fill: ${blank.map((f) => f.label).join(", ")}`); else passed.push("Every required field is filled");
  const ungrounded = p.fields.filter((f) => f.source === "document" && f.cite && !s.docs.some((d) => d.text.includes(f.cite!)));
  if (ungrounded.length) issues.push(`Can't find the source for: ${ungrounded.map((f) => f.label).join(", ")}`); else passed.push("Every number quotes a line in your documents");
  const todo = p.attachments.find((a) => a.todo);
  if (todo) issues.push(todo.todo!); else if (p.attachments.length) passed.push(`Proof attached (${p.attachments.map((a) => a.name.split(":")[0]).join(", ")})`);
  (tile.daysLeft >= 0 ? passed : issues).push(tile.daysLeft >= 0 ? `Deadline still open (${tile.daysLeft} days left)` : "The deadline has passed");
  if (tile.ask && s.answers?.[tile.id] !== "go") issues.push(`Ruth asked "${tile.ask}" and is waiting for your answer`);
  return { ok: !issues.length, passed, issues };
}

const fmt = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "[member name]", "[your name]", "[member ID]": once you've filled the matching field, the
// message uses your answer instead of the placeholder.
const norm = (x: string) => x.toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(your|the)\b/g, "").replace(/\s+/g, " ").trim();
export function fillPlaceholders(message: string | undefined, fields: Packet["fields"], profile: Profile = {}) {
  if (!message) return message;
  return message.replace(/\[([^\]]{2,40})\]/g, (all, name: string) => {
    const n = norm(name);
    const f = fields.find((x) => x.value && (norm(x.label) === n || norm(x.label).includes(n) || n.includes(norm(x.label)) || (n.endsWith("name") && x.key === "fullName")));
    const fromProfile = n.endsWith("name") ? profile.fullName : undefined;
    return f?.value || fromProfile || all;
  });
}

function finish(d: Omit<Packet, "check" | "status" | "hash">, tile: Tile, s: AppState): Packet {
  d = { ...d, message: fillPlaceholders(d.message, d.fields, s.profile) };
  const check = checkPacket(d, tile, s);
  return { ...d, check, status: check.ok ? "ready" : "needs you", hash: fingerprint(d) };
}

// Ruth writes the message in her own words, from the packet's facts only. Numbers never change.
async function polish(message: string, tile: Tile, provider: string): Promise<string | null> {
  if (!claudeEnabled() || !message) return null;
  const out = await structured("polish", {
    system: "You rewrite a short claim message a person will send to a company. Keep every number, date, name and placeholder in [brackets] exactly as given. Polite, plain, under 90 words. No new claims, no threats, no legal language.",
    user: `Company: ${provider}\nClaim: ${tile.title}\nDraft:\n${message}`,
    schema: z.object({ message: z.string() }),
    effort: "low",
  });
  const text = out?.message?.trim();
  // Reject a rewrite that dropped or changed any dollar amount.
  const amounts = (t: string) => (t.match(/\$[\d,]+(\.\d{2})?/g) ?? []).sort().join();
  return text && amounts(text) === amounts(message) ? text : null;
}

export async function preparePacket(tile: Tile, s: AppState, by: Packet["preparedBy"] = "ruth"): Promise<Packet> {
  const draft = draftFor(tile, s);
  const better = await polish(draft.message ?? "", tile, draft.provider);
  const prev = s.packets?.find((x) => x.tileId === tile.id && x.status !== "submitted");
  return finish({ ...draft, message: better ?? draft.message, id: prev?.id ?? `pk_${tile.id.replace(/^tile_/, "")}`, preparedAt: new Date().toISOString(), preparedBy: by, engine: better ? "claude" : "rules" }, tile, s);
}

// You edit a field. Profile fields are remembered for every future packet.
export function editPacket(p: Packet, values: Record<string, string>, tile: Tile, s: AppState): Packet {
  const fields = p.fields.map((f) => (f.key in values ? { ...f, value: values[f.key].slice(0, 500), source: "you" as const } : f));
  const profile: Profile = { ...(s.profile ?? {}) };
  for (const f of fields) if (f.profileKey && f.key in values && values[f.key].trim()) profile[f.profileKey] = values[f.key].trim();
  s.profile = profile;
  const message = values.__message !== undefined ? values.__message.slice(0, 2000) : p.message;
  return finish({ ...p, fields, message }, tile, s);
}

// A receipt you upload replaces the "please find proof" placeholder. Statement-style lines in it
// are quoted; otherwise the file itself is the proof.
export function attachProof(p: Packet, name: string, text: string, tile: Tile, s: AppState): Packet {
  const lines = text.split("\n").map((l) => parseLine(l)).filter(Boolean).map((l) => l!.text).slice(0, 12);
  const att = { name: `Receipt you attached: ${name}`, kind: "receipt" as const, lines: lines.length ? lines : [`${name} (attached by you)`] };
  const attachments = [...p.attachments.filter((a) => !a.todo), att];
  return finish({ ...p, attachments }, tile, s);
}

// Ruth adds evidence she bought or found (e.g. an eligibility check) to a packet.
export function withEvidence(p: Packet, att: Packet["attachments"][number], tile: Tile, s: AppState): Packet {
  return finish({ ...p, attachments: [...p.attachments.filter((a) => a.name !== att.name), att] }, tile, s);
}

// Fill blanks in packets that are waiting, after you've updated your profile.
export function refreshFromProfile(s: AppState) {
  const p = s.profile ?? {};
  s.packets = (s.packets ?? []).map((pk) => {
    if (pk.status === "submitted") return pk;
    const tile = s.tiles.find((t) => t.id === pk.tileId);
    if (!tile) return pk;
    const fields = pk.fields.map((f) => (f.profileKey && !f.value && p[f.profileKey] ? { ...f, value: p[f.profileKey]!, source: "profile" as const } : f));
    return finish({ ...pk, fields }, tile, s);
  });
}

// Prefill your profile from what your documents already say (e.g. "Account holder: Jordan Lee").
export function profileFromDocs(s: AppState): Profile {
  const text = s.docs.map((d) => d.text).join("\n");
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim();
  return {
    fullName: grab(/Account holder:\s*([A-Z][a-z]+(?: [A-Z][a-z]+)+)/) ?? grab(/(?:Member|Participant|Employee) name:\s*([^\n]+)/i),
    memberId: grab(/Member ID:\s*([A-Z0-9-]+)/i),
    employeeId: grab(/Employee ID:\s*([A-Z0-9-]+)/i),
    employer: grab(/(?:Employer|Group):\s*([^\n]+)/i) ?? grab(/([A-Z][a-z]+ Corp) paycheck/),
  };
}
