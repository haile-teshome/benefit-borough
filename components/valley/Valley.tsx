"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react";
import { DbConnection, tables } from "@/lib/valley_bindings";
import type { Player, Plot } from "@/lib/valley_bindings/types";
import { expire } from "@/lib/valley/expire";
import { CROP_LOOK, ELDER_POS, slotPosition, usd } from "@/lib/valley/layout";
import type { AppState, DispatchResult, Tile, Verdict } from "@/lib/types";
import { playAudio, sound, speak } from "@/lib/valley/audio";
import { clockLabel, dateLabel, gameHour, setHour } from "@/lib/valley/clock";
import { anchors, registerLabel, setAnchor } from "@/lib/valley/labels";
import { AVATARS, portrait } from "@/lib/valley/pixel/animals";
import { BUILDINGS, DISTRICTS, NPCS } from "@/lib/valley/world";
import { LiveBoard } from "./LiveBoard";
import { PushBack, RuthAsks, RuthRecord } from "./Ruth";
import { TalkBox } from "./Talk";
import { Library } from "./Library";
import { Almanac } from "./Almanac";
import { Claims } from "./Claims";
import { Checkin } from "./Checkin";
import { Onboarding } from "./Onboarding";
import World2D, { type Burst, type Emote, type Mood, type Near, type WorldApi } from "./World2D";
import { KEEPERS, RUTH_VOICE } from "@/lib/valley/people";

const DB = "expire-valley";
// Convex holds saved state and the ledger; its live queries drive the valley leaderboard.
const convex = process.env.NEXT_PUBLIC_CONVEX_URL ? new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL) : null;

// ?farmer=2 in the URL gives a second identity in the same browser (a second player for demos).
function slotKey() {
  const n = new URLSearchParams(window.location.search).get("farmer") ?? "1";
  return `expire-valley/${DB}/token/${n.replace(/[^0-9a-z]/gi, "")}`;
}

const wsHost = () => process.env.NEXT_PUBLIC_SPACETIMEDB_HOST ?? `ws://${window.location.hostname}:3100`;

// Mint the identity over HTTP before connecting, so every socket carries a token. Without one,
// two racing first connections each get a fresh identity and leave a ghost farmer behind.
async function ensureToken(key: string) {
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const res = await fetch(`${wsHost().replace(/^ws/, "http")}/v1/identity`, { method: "POST" });
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(key, token);
  return token;
}

export default function ValleyApp() {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    ensureToken(slotKey()).then(setToken).catch((e) => setFailed(`Can’t reach the Benefit Burrow server (${(e as Error).message}). Is \`spacetime start\` running?`));
  }, []);
  const builder = useMemo(() => {
    if (!token) return null;
    const key = slotKey();
    return DbConnection.builder()
      .withUri(wsHost())
      .withDatabaseName(DB)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((_c, _id, t) => localStorage.setItem(key, t));
  }, [token]);
  if (failed) return <div className="ev-loading">{failed}</div>;
  if (!builder) return <div className="ev-loading">Walking into Benefit Burrow…</div>;
  const game = (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <Valley />
    </SpacetimeDBProvider>
  );
  return convex ? <ConvexProvider client={convex}>{game}</ConvexProvider> : game;
}


type Modal =
  | { kind: "intro" }
  | { kind: "crop"; tileId: string }
  | { kind: "confirm"; tileId: string }
  | { kind: "run"; tileId: string; lines: string[]; result: DispatchResult | null; to?: string }
  | { kind: "elder"; step: "hello" | "thinking" | "verdict"; verdict?: Verdict }
  | { kind: "gift" }
  | { kind: "avatar" }
  | { kind: "record" }
  | { kind: "npc"; id: string; line: number }
  | { kind: "keeper"; id: string }
  | { kind: "library" }
  | { kind: "almanac" }
  | { kind: "claims" }
  | { kind: "checkin" }
  | null;

const hex = (id: { toHexString(): string } | undefined | null) => id?.toHexString() ?? "";
const shortTitle = (title: string) => {
  const rest = title.replace(/^[^:]{1,30}:\s*/, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

function Valley() {
  const { identity, isActive, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;
  const [players] = useTable(tables.player);
  const [plots] = useTable(tables.plot);
  const [gifts] = useTable(tables.gift);
  const [chats] = useTable(tables.chat);

  const myHex = hex(identity);
  const pid = myHex.slice(0, 16);
  const me = players.find((p) => hex(p.identity) === myHex);
  const myPlots = plots.filter((p) => hex(p.owner) === myHex);
  const myGifts = gifts.filter((g) => hex(g.to) === myHex && !g.opened);

  const [state, setState] = useState<AppState | null>(null);
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const worldApi = useRef<WorldApi>({}).current;
  const [inside, setInside] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [near, setNear] = useState<Near>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [title, setTitle] = useState(true);
  const [muted, setMuted] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [emotes, setEmotes] = useState<Record<string, Emote>>({});
  const [ruthMood, setRuthMood] = useState<Mood>(null);

  useEffect(() => {
    if (pid) expire.state(pid).then((r) => { setState(r.state); setIntegrations(r.integrations ?? {}); }).catch((e) => setError(e.message));
  }, [pid]);

  // Weekly check-in: open it from a calendar link (?checkin=1), or when a week has passed.
  const askedCheckin = useRef(false);
  useEffect(() => {
    if (askedCheckin.current || title || !state?.tiles.length || modal) return;
    const fromLink = new URLSearchParams(window.location.search).get("checkin") === "1";
    const stale = state.checkedInAt && Date.now() - Date.parse(state.checkedInAt) > 7 * 86_400_000;
    if (fromLink || stale) { askedCheckin.current = true; setModal({ kind: "checkin" }); }
  }, [title, state, modal]);

  // Step into the valley once connected (creates this farmer on first visit).
  const joined = useRef(false);
  useEffect(() => {
    if (conn && isActive && identity && !joined.current) {
      joined.current = true;
      void conn.reducers.join({}).catch((e: Error) => setError(e.message));
    }
  }, [conn, isActive, identity]);



  // Announce gifts as they arrive.
  const seenGifts = useRef(new Set<string>());
  useEffect(() => {
    for (const g of myGifts) {
      const k = String(g.id);
      if (seenGifts.current.has(k)) continue;
      seenGifts.current.add(k);
      const from = players.find((p) => hex(p.identity) === hex(g.from));
      sound.gift();
      setToast(`${from?.name ?? "A farmer"} sent you a letter. Check your letterbox.`);
      setTimeout(() => setToast(""), 5000);
    }
  }, [myGifts, players]);

  const harvestedSeen = useRef<Map<string, boolean> | null>(null);
  useEffect(() => {
    const prev = harvestedSeen.current;
    const next = new Map(plots.map((p) => [String(p.id), p.harvested]));
    if (prev) {
      for (const pl of plots) {
        if (!pl.harvested || prev.get(String(pl.id)) !== false) continue;
        const owner = players.find((p) => hex(p.identity) === hex(pl.owner));
        if (!owner) continue;
        sound.coins();
        setBursts((b) => [...b, { id: Date.now() + Math.random(), at: slotPosition(owner.farm, pl.slot), amount: pl.saved, born: performance.now() }]);
        setEmotes((e) => ({ ...e, [hex(owner.identity)]: { clip: "Cheer", at: performance.now() } }));
      }
    }
    harvestedSeen.current = next;
  }, [plots, players]);

  const plant = useCallback(async (s: AppState) => {
    if (!conn) return;
    const rows = s.tiles.map((t) => ({
      tileId: t.id,
      category: t.category,
      title: shortTitle(t.title),
      headline: t.headline,
      atStake: t.atStake,
      daysLeft: t.daysLeft,
      harvestable: t.live && t.action.kind !== "none",
      harvested: s.done.includes(t.id),
      saved: s.ledger.find((l) => l.tileId === t.id)?.amount ?? 0,
    }));
    await conn.reducers.plantFarm({ plots: rows });
  }, [conn]);

  // First visit: no crops yet, so offer to plant the documents. A returning farmer whose world
  // was reset gets their field replanted from the Expire state they already have.
  const replanted = useRef(false);
  useEffect(() => {
    if (title || !me || !state || myPlots.length > 0) return;
    if (!state.tiles.length) { if (modal === null) setModal({ kind: "intro" }); return; }
    if (!replanted.current) { replanted.current = true; void plant(state); }
  }, [title, me, state, myPlots.length, modal, plant]);

  async function plantDocs(name: string, color: string, avatar: string) {
    if (!conn) return;
    setBusy(true); setError("");
    try {
      await conn.reducers.setProfile({ name: name.trim(), color, avatar });
      const r = await expire.scan(pid);
      setState(r.state);
      await plant(r.state);
      sound.sprout();
      setModal(null);
      setToast("Your documents sprouted. Walk to a crop and press E.");
      setTimeout(() => setToast(""), 5000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Plant a real statement (CSV or PDF): findings grow as new crops on your farm.
  async function uploadStatement(file: File) {
    if (!conn) return;
    setBusy(true); setError("");
    try {
      if (me && !myPlots.length) await conn.reducers.setProfile({ name: me.name, color: me.color, avatar: me.avatar });
      const r = await expire.upload(pid, file);
      setState(r.state);
      await plant(r.state);
      sound.sprout();
      setModal(null);
      setToast(r.found ? `${file.name}: ${r.found} thing${r.found > 1 ? "s" : ""} to rescue sprouted on your farm.` : `${file.name}: nothing expiring found. Your farm keeps the sample crops.`);
      setTimeout(() => setToast(""), 6000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function libraryPlanted(s: AppState, found: number) {
    if (!conn) return;
    setState(s);
    await plant(s);
    sound.sprout();
    setModal(null);
    setToast(`${found} crop${found === 1 ? "" : "s"} planted from your plans. Walk to your farm, or visit the shops.`);
    setTimeout(() => setToast(""), 6000);
  }

  async function replant() {
    if (!conn) return;
    setBusy(true);
    try {
      await expire.reset(pid);
      const r = await expire.scan(pid);
      setState(r.state);
      await plant(r.state);
    } finally {
      setBusy(false);
    }
  }

  async function harvest(tileId: string, to?: string) {
    if (!conn || !state) return;
    const tile = state.tiles.find((t) => t.id === tileId)!;
    setModal({ kind: "run", tileId, lines: [], result: null, to });
    if (tile.action.kind === "book_call") sound.dial(); else sound.harvest();
    try {
      const r = await expire.dispatch(pid, tileId);
      if (r.result.audioBase64) playAudio(`data:audio/mpeg;base64,${r.result.audioBase64}`);
      for (const line of r.result.transcript) {
        sound.blip();
        setModal((m) => (m && m.kind === "run" ? { ...m, lines: [...m.lines, line] } : m));
        await new Promise((ok) => setTimeout(ok, 900));
      }
      setState(r.state);
      if (r.result.status === "confirmed") {
        await conn.reducers.harvest({ tileId, saved: tile.action.savings });
        const recipient = to ? players.find((p) => hex(p.identity) === to) : undefined;
        if (recipient) await conn.reducers.sendGift({ to: recipient.identity, amount: Number(tile.action.payload.amount), note: "Dining dollars, on me" });
      }
      setModal((m) => (m && m.kind === "run" ? { ...m, result: r.result } : m));
    } catch (e) {
      setError((e as Error).message);
      setModal(null);
    }
  }

  async function askElder(items: string[]) {
    const fsa = state?.extraction?.balances.find((b) => b.category === "fsa");
    if (!fsa) { setModal({ kind: "elder", step: "verdict", verdict: { verdict: "reject", rule_cited: null, reason: "Plant your documents first, child. I can only judge what I can read.", engine: "rules", at: "" } }); return; }
    setModal({ kind: "elder", step: "thinking" });
    sound.hmm();
    setRuthMood({ kind: "thinking", at: performance.now() });
    const r = await expire.reviewCart(pid, fsa.id, items);
    setState(r.state);
    if (r.verdict.verdict === "reject") sound.refuse(); else sound.coins();
    setRuthMood({ kind: r.verdict.verdict === "reject" ? "reject" : "approve", at: performance.now() });
    setModal({ kind: "elder", step: "verdict", verdict: r.verdict });
    void speak(`${r.verdict.verdict === "approve" ? "Fine." : "No."} ${r.verdict.reason}`, RUTH_VOICE);
  }

  async function answerRuth(tileId: string, reply: "go" | "keep") {
    sound.click();
    const r = await expire.answer(pid, tileId, reply);
    setState(r.state);
    void speak(reply === "go" ? "All right. It's yours to harvest." : "Then I'll leave it alone.");
  }

  async function openGifts() {
    if (!conn) return;
    for (const g of myGifts) await conn.reducers.openGift({ id: g.id });
    sound.gift();
    setModal({ kind: "gift" });
  }

  // Picking an avatar applies at once, so you see your new animal in the world behind the dialog.
  function pickAvatar(avatar: string) {
    if (!conn || !me) return;
    sound.click();
    void conn.reducers.setProfile({ name: me.name, color: me.color, avatar }).catch((e: Error) => setError(e.message));
  }

  function interact() {
    if (!near || modal || title) return;
    sound.click();
    if (near.kind === "crop") { setModal({ kind: "crop", tileId: near.tileId }); setEmotes((e) => ({ ...e, [myHex]: { clip: "Interact", at: performance.now() } })); }
    if (near.kind === "elder") { setModal({ kind: "elder", step: "hello" }); void speak("I audit every harvest in this burrow. Show me what you want to buy with your FSA."); }
    if (near.kind === "mailbox") void openGifts();
    if (near.kind === "place") worldApi.enter?.(near.id);
    if (near.kind === "exit") worldApi.exit?.();
    if (near.kind === "claim") setModal({ kind: "crop", tileId: near.tileId });
    if (near.kind === "keeper") { const k = KEEPERS[near.id]; setModal({ kind: "keeper", id: near.id }); if (k) void speak(k.hello, k.persona.voice); }
    if (near.kind === "npc") { const n = NPCS.find((x) => x.id === near.id); setModal({ kind: "npc", id: near.id, line: 0 }); if (n) void speak(n.talk[0], n.persona.voice); }
  }

  // Keyboard: E to interact, Esc to close, Enter to chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (title) return;
      if (e.key === "m" || e.key === "M") toggleMute();
      if ((e.key === "l" || e.key === "L") && !modal) setModal({ kind: "claims" });
      if (e.key === "e" || e.key === "E") interact();
      if (e.key === "Escape") setModal((m) => (m?.kind === "run" && !m.result ? m : null));
      if (e.key === "Enter" && !modal) { e.preventDefault(); setChatOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggleMute() {
    setMuted((m) => { sound.setMuted(!m); return !m; });
  }

  function play() {
    sound.start();
    sound.click();
    setTitle(false);
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __setHour?: (h: number | null) => void }).__setHour = setHour;
  }, []);

  // A soft chime when something new comes within reach.
  const lastNear = useRef("");
  useEffect(() => {
    const k = near ? `${near.kind}:${near.label}` : "";
    if (k && k !== lastNear.current && !title) sound.prompt();
    lastNear.current = k;
  }, [near, title]);

  const bubbles = useMemo(() => {
    const now = Date.now();
    const out = new Map<string, string>();
    for (const c of chats) {
      const at = Number(c.at.microsSinceUnixEpoch / 1000n);
      if (now - at < 8000) out.set(hex(c.sender), c.text);
    }
    return out;
  }, [chats]);

  const others = players.filter((p) => p.online && hex(p.identity) !== myHex);
  const giftsWaitingFor = new Set(gifts.filter((g) => !g.opened).map((g) => hex(g.to)));
  const tileById = (id: string) => state?.tiles.find((t) => t.id === id);

  return (
    <div className="ev-root">
      <World2D
        me={me}
        players={players}
        plots={plots}
        myHex={myHex}
        giftsWaitingFor={giftsWaitingFor}
        canMove={!modal && !chatOpen && !title}
        onNear={setNear}
        conn={conn}
        myGiftCount={myGifts.length}
        attract={title}
        bursts={bursts}
        onBurstDone={(id) => setBursts((b) => b.filter((x) => x.id !== id))}
        emotes={emotes}
        ruthMood={ruthMood}
        tiles={state?.tiles ?? []}
        done={state?.done ?? []}
        api={worldApi}
        onScene={setInside}
      />
      {!title && <Labels plots={plots} players={players} myHex={myHex} bubbles={bubbles} bursts={bursts} nearElder={near?.kind === "elder"} tiles={state?.tiles ?? []} done={state?.done ?? []} inside={inside} />}

      {title ? (
        <Title onPlay={play} connected={isActive} />
      ) : (
        <Hud inside={Boolean(inside)} me={me} others={others} isActive={isActive} state={state} busy={busy} onReplant={replant} muted={muted} onMute={toggleMute} onAvatar={() => setModal({ kind: "avatar" })} onUpload={uploadStatement} onRecord={() => setModal({ kind: "record" })} onLibrary={() => setModal({ kind: "library" })} onAlmanac={() => setModal({ kind: "almanac" })} onClaims={() => setModal({ kind: "claims" })} />
      )}

      {convex && !title && !inside && <div className="ev-live-wrap" onClick={() => setModal({ kind: "almanac" })} title="Open the Burrow Almanac"><LiveBoard players={players} myPid={pid} /></div>}
      {near && !modal && !title && (
        <button className="ev-prompt" onClick={interact}><kbd>E</kbd> {near.label}</button>
      )}
      {toast && <div className="ev-toast">{toast}</div>}
      {error && <div className="ev-toast bad" onClick={() => setError("")}>{error}</div>}
      {!title && <div className="ev-help">{inside ? `Inside ${BUILDINGS.find((b) => b.id === inside)?.place?.name} · walk to the door mat to leave` : "WASD or click to walk · E to interact or enter shops · L for your list · Enter to chat · M to mute"}</div>}

      {chatOpen && (
        <form className="ev-chat" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value; if (v.trim() && conn) void conn.reducers.say({ text: v }); setChatOpen(false); }}>
          <input name="t" autoFocus placeholder="Say something to the burrow…" onKeyDown={(e) => e.key === "Escape" && setChatOpen(false)} />
        </form>
      )}

      {modal?.kind === "intro" && <Onboarding pid={pid} me={me} busy={busy} onPlanted={libraryPlanted} onDemo={plantDocs} onPick={pickAvatar}
        onProfile={async (name, color, avatar) => { if (conn) await conn.reducers.setProfile({ name: name.trim(), color, avatar }); }} />}
      {modal?.kind === "avatar" && (
        <Dialogue speaker="Choose your farmer" onClose={() => setModal(null)}>
          <AvatarPicker value={me?.avatar ?? ""} onPick={pickAvatar} />
        </Dialogue>
      )}
      {modal?.kind === "crop" && tileById(modal.tileId) && (
        <CropCard tile={tileById(modal.tileId)!} state={state!} pid={pid} onState={setState} onAnswer={(r) => answerRuth(modal.tileId, r)} onClose={() => setModal(null)} onHarvest={() => setModal({ kind: "confirm", tileId: modal.tileId })} />
      )}
      {modal?.kind === "npc" && (() => {
        const n = NPCS.find((x) => x.id === modal.id)!;
        return (
          <Dialogue speaker={n.name} onClose={() => setModal(null)}
            actions={n.talk.length > 1 ? <button className="ev-btn ghost" onClick={() => { const i = (modal.line + 1) % n.talk.length; setModal({ ...modal, line: i }); void speak(n.talk[i], n.persona.voice); }}>Tell me more</button> : null}>
            <p className="ev-lead">{n.talk[modal.line]}</p>
            <p className="ev-sub ev-quirk">{n.persona.quirk}</p>
            <TalkBox key={n.id} pid={pid} who={n.id} name={n.name} voice={n.persona.voice} />
          </Dialogue>
        );
      })()}
      {modal?.kind === "keeper" && (() => {
        const k = KEEPERS[modal.id];
        const cats = BUILDINGS.find((b) => b.id === modal.id)?.place?.categories ?? [];
        const here = (state?.tiles ?? []).filter((t) => cats.includes(t.category)).sort((a, b) => b.atStake - a.atStake);
        const open = here.filter((t) => !state!.done.includes(t.id));
        const total = open.reduce((sum, t) => sum + t.atStake, 0);
        return (
          <Dialogue speaker={k.name} onClose={() => setModal(null)}>
            <p className="ev-lead">{k.hello}</p>
            {here.length ? (
              <>
                <p className="ev-sub">{open.length ? `${open.length} thing${open.length > 1 ? "s" : ""} to claim here, worth ${usd(total)}. They're on the stands too.` : "You've claimed everything here. Nicely done."}</p>
                <ul className="ev-claims">
                  {here.map((t) => (
                    <li key={t.id}>
                      <button className={state!.done.includes(t.id) ? "done" : ""} onClick={() => setModal({ kind: "crop", tileId: t.id })}>
                        <span>{t.title}</span><b>{state!.done.includes(t.id) ? "Claimed" : t.atStake ? usd(t.atStake) : "Options"}</b>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="ev-sub">Nothing of yours expires here. Come back anytime.</p>}
            {modal.id === "hall" && <button className="ev-btn" onClick={() => setModal({ kind: "library" })}>Find my plans in the library</button>}
            <TalkBox key={modal.id} pid={pid} who={modal.id} name={k.name} voice={k.persona.voice} />
          </Dialogue>
        );
      })()}
      {modal?.kind === "claims" && state && <Claims state={state} pid={pid} onOpen={(tileId) => setModal({ kind: "crop", tileId })} onCheckin={() => setModal({ kind: "checkin" })} onClose={() => setModal(null)} />}
      {modal?.kind === "checkin" && state && <Checkin state={state} pid={pid} onDone={async (s) => { setState(s); await plant(s); setModal(null); setToast("Check-in saved. Your farm is up to date."); setTimeout(() => setToast(""), 5000); }} onLibrary={() => setModal({ kind: "library" })} onClose={() => setModal(null)} />}
      {modal?.kind === "almanac" && <Almanac state={state} players={players} myPid={pid} live={Boolean(convex)} onClose={() => setModal(null)} />}
      {modal?.kind === "library" && <Library pid={pid} onPlanted={libraryPlanted} onClose={() => setModal(null)} />}
      {modal?.kind === "record" && <RuthRecord state={state} pid={pid} integrations={integrations} live={Boolean(convex)} onClose={() => setModal(null)} />}
      {modal?.kind === "confirm" && tileById(modal.tileId) && (
        <Confirm tile={tileById(modal.tileId)!} others={others} onCancel={() => setModal({ kind: "crop", tileId: modal.tileId })} onConfirm={(to) => harvest(modal.tileId, to)} />
      )}
      {modal?.kind === "run" && tileById(modal.tileId) && (
        <Run tile={tileById(modal.tileId)!} lines={modal.lines} result={modal.result} toName={others.find((p) => hex(p.identity) === modal.to)?.name} onDone={() => setModal(null)} />
      )}
      {modal?.kind === "elder" && <ElderTalk step={modal.step} verdict={modal.verdict} onAsk={askElder} onClose={() => setModal(null)} onRecord={() => setModal({ kind: "record" })}
        pushBack={state?.extraction?.balances.find((b) => b.category === "fsa") ? <PushBack pid={pid} verdictKey={`cart:${state!.extraction!.balances.find((b) => b.category === "fsa")!.id}`} onState={setState} /> : null} />}
      {modal?.kind === "gift" && (
        <Dialogue speaker="Letter" onClose={() => setModal(null)}>
          <p>{gifts.filter((g) => hex(g.to) === myHex).slice(-1).map((g) => `${players.find((p) => hex(p.identity) === hex(g.from))?.name ?? "A farmer"} sent you ${usd(g.amount)}: “${g.note}”`)[0] ?? "Nothing here yet."}</p>
        </Dialogue>
      )}
    </div>
  );
}

type LabelProps = { plots: readonly Plot[]; players: readonly Player[]; myHex: string; bubbles: Map<string, string>; bursts: Burst[]; nearElder: boolean; tiles: Tile[]; done: string[]; inside: string | null };

// All floating labels, rendered by the main React tree and positioned by <Projector>.
function Labels({ plots, players, myHex, bubbles, bursts, nearElder, tiles, done, inside }: LabelProps) {
  useEffect(() => { setAnchor("elder", ELDER_POS[0], 2.1, ELDER_POS[2]);
    for (const d of DISTRICTS) setAnchor(`district:${d.id}`, d.x, 1.15, d.z);
    for (const n of NPCS) setAnchor(`npc:${n.id}`, n.x, 1.7, n.z); }, []);
  const online = players.filter((p) => p.online || hex(p.identity) === myHex);
  return (
    <div className="ev-labels">
      {plots.map((pl) => {
        const owner = players.find((p) => hex(p.identity) === hex(pl.owner));
        if (!owner) return null;
        const mine = hex(pl.owner) === myHex;
        if (!mine && !pl.harvested) return null;
        const id = `crop:${String(pl.id)}`;
        const [x, , z] = slotPosition(owner.farm, pl.slot);
        setAnchor(id, x, -0.1, z);
        const look = CROP_LOOK[pl.category] ?? CROP_LOOK.fsa;
        const tax = pl.category === "tax_window";
        return (
          <div key={id} ref={registerLabel(id)} className="ev-anchor">
            <div className={`ev-tag ${pl.harvested ? "good" : pl.daysLeft <= 30 ? "warn" : ""} ${pl.harvestable || pl.harvested ? "" : "dim"}`}>
              <b>{tax ? "Enroll by Nov 21" : pl.harvested ? `+${usd(pl.saved)}` : usd(pl.atStake)}</b>
              <span>{tax ? "Open enrollment" : pl.harvested ? "Rescued" : `${look.name} · ${pl.daysLeft}d`}</span>
            </div>
          </div>
        );
      })}
      {online.map((p) => {
        const h = hex(p.identity);
        const id = `player:${h}`;
        if (!anchors.has(id)) setAnchor(id, p.x, 1.75, p.z);
        const bubble = bubbles.get(h);
        return (
          <div key={id} ref={registerLabel(id)} className="ev-anchor">
            <div className="ev-name-wrap">
              {bubble && <div className="ev-bubble">{bubble}</div>}
              <div className={`ev-name ${h === myHex ? "me" : ""}`}>{p.name}</div>
            </div>
          </div>
        );
      })}
      {DISTRICTS.map((d) => (
        <div key={d.id} ref={registerLabel(`district:${d.id}`)} className="ev-anchor">
          <div className="ev-district" style={{ borderColor: d.color }}>{d.name}</div>
        </div>
      ))}
      {NPCS.map((n) => (
        <div key={n.id} ref={registerLabel(`npc:${n.id}`)} className="ev-anchor">
          <div className="ev-name npc">{n.name}</div>
        </div>
      ))}
      {NPCS.map((n) => (
        <div key={`say-${n.id}`} ref={registerLabel(`say:${n.id}`)} className="ev-anchor">
          <div className="ev-bubble npc-say" />
        </div>
      ))}
      <div ref={registerLabel("keeper")} className="ev-anchor">
        <div className="ev-name keeper">{inside ? KEEPERS[inside]?.name : ""}</div>
      </div>
      {tiles.map((t) => (
        <div key={`claim-${t.id}`} ref={registerLabel(`claim:${t.id}`)} className="ev-anchor">
          <div className={`ev-tag ${done.includes(t.id) ? "good" : t.daysLeft <= 30 ? "warn" : ""}`}>
            <b>{done.includes(t.id) ? `+${usd(t.action.savings || t.atStake)}` : t.atStake ? usd(t.atStake) : "Options"}</b>
            <span>{done.includes(t.id) ? "Claimed" : `${CROP_LOOK[t.category]?.name ?? "Claim"} · ${t.daysLeft}d`}</span>
          </div>
        </div>
      ))}
      <div ref={registerLabel("elder")} className="ev-anchor">
        <div className="ev-name-wrap"><div className={`ev-name elder ${nearElder ? "hl" : ""}`}>Ruth · the Reviewer</div></div>
      </div>
      {bursts.map((b) => {
        const id = `burst:${b.id}`;
        setAnchor(id, b.at[0], 2.0, b.at[2]);
        return (
          <div key={id} ref={registerLabel(id)} className="ev-anchor">
            <div className="ev-burst">+{usd(b.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- overlays ----------

function useClock() {
  const [label, setLabel] = useState(clockLabel());
  const [date, setDate] = useState(dateLabel());
  const [night, setNight] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { setLabel(clockLabel()); setDate(dateLabel()); const h = gameHour(); setNight(h < 6 || h >= 19); }, 1000);
    return () => clearInterval(id);
  }, []);
  return { label, night, date };
}

function UploadButton({ busy, onUpload, className, label }: { busy: boolean; onUpload: (f: File) => void; className: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Reading…" : label}</button>
      <input ref={input} type="file" accept=".csv,.pdf,text/csv,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
    </>
  );
}

function Hud({ inside, me, others, isActive, state, busy, onReplant, muted, onMute, onAvatar, onUpload, onRecord, onLibrary, onAlmanac, onClaims }: { me?: Player; others: Player[]; isActive: boolean; state: AppState | null; busy: boolean; onReplant: () => void; muted: boolean; onMute: () => void; onAvatar: () => void; onUpload: (f: File) => void; onRecord: () => void; inside: boolean; onLibrary: () => void; onAlmanac: () => void; onClaims: () => void }) {
  const next = state?.tiles.filter((t) => !state.done.includes(t.id) && t.atStake > 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const clock = useClock();
  return (
    <>
      <div className="ev-panel ev-date">
        <div className="ev-title">Benefit Burrow</div>
        <div className="ev-clock">{clock.date} · {clock.label} {clock.night ? "☾" : "☀"}</div>
        {next && <div className="ev-sub">Next to wilt: {shortTitle(next.title).split(" ").slice(0, 3).join(" ")}… in {next.daysLeft}d</div>}
      </div>
      <div className="ev-panel ev-gold">
        <span className="coin" />
        <div>
          <div key={me?.rescued ?? 0} className="ev-title ev-pop">{usd(me?.rescued ?? 0)}</div>
          <div className="ev-sub">rescued</div>
        </div>
      </div>
      <div className="ev-panel ev-who" hidden={inside}>
        <div className="ev-sub">{isActive ? `${others.length + (me ? 1 : 0)} in the burrow` : "Connecting…"}</div>
        {me && <div className="who"><i style={{ background: me.color }} />{me.name} (you)</div>}
        {others.map((p) => <div key={p.identity.toHexString()} className="who"><i style={{ background: p.color }} />{p.name}</div>)}
        <button className="ev-link strong" onClick={onClaims}>My claims (list) · L</button>
        <button className="ev-link" onClick={onAlmanac}>Burrow Almanac (leaderboard)</button>
        <button className="ev-link" onClick={onLibrary}>Find my plans (plan library)</button>
        <button className="ev-link" onClick={onRecord}>Ruth's record (audit trail)</button>
        <UploadButton busy={busy} onUpload={onUpload} className="ev-link" label="Plant a bank statement (CSV/PDF)" />
        <button className="ev-link" disabled={busy} onClick={onReplant}>{busy ? "Replanting…" : "Replant (reset demo)"}</button>
        <button className="ev-link" onClick={onAvatar}>Change avatar</button>
        <button className="ev-link" onClick={onMute}>{muted ? "Sound off · M" : "Sound on · M"}</button>
      </div>
    </>
  );
}

function Title({ onPlay, connected }: { onPlay: () => void; connected: boolean }) {
  const [how, setHow] = useState(false);
  return (
    <div className="ev-title-screen">
      <div className="ev-sign">
        <div className="ev-sign-board">
          <span className="l1">Benefit</span>
          <span className="l2">Burrow</span>
          <span className="denom">GROW YOUR PAPERWORK · HARVEST YOUR MONEY</span>
        </div>
      </div>
      <p className="ev-tagline">Every benefit you’re about to lose grows here. Harvest it before it wilts.</p>
      {how ? (
        <div className="ev-panel ev-how">
          <p><b>Walk</b> with WASD or by clicking the ground. <b>E</b> to inspect a crop, talk, or open your mailbox. <b>Enter</b> to chat. <b>M</b> to mute.</p>
          <p>Each crop is a real balance from your documents: dental max, a deductible window, dining dollars, card credits. The closer the deadline, the more it wilts.</p>
          <p>Harvesting runs the real action (a booking call, a transfer, a refund request) after Ruth, the Reviewer, approves it. Your rescued total is real money.</p>
        </div>
      ) : null}
      <div className="ev-title-actions">
        <button className="ev-btn big" onClick={onPlay} disabled={!connected}>{connected ? "Play" : "Connecting…"}</button>
        <button className="ev-btn ghost" onClick={() => setHow((h) => !h)}>{how ? "Got it" : "How to play"}</button>
      </div>
      <div className="ev-credit">Cal Hacks 13.0 · multiplayer on SpacetimeDB · reviewed by Claude</div>
    </div>
  );
}

function Dialogue({ speaker, children, onClose, actions }: { speaker: string; children: React.ReactNode; onClose?: () => void; actions?: React.ReactNode }) {
  return (
    <div className="ev-dialogue-wrap">
      <div className="ev-panel ev-dialogue">
        <div className="ev-speaker">{speaker}</div>
        <div className="ev-body">{children}</div>
        <div className="ev-actions">
          {actions}
          {onClose && <button className="ev-btn ghost" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

const COLORS = ["#E2574C", "#3E8ED0", "#F2B33D", "#8E5BD0", "#3FA66B", "#E07BB0"];

function AvatarPicker({ value, onPick }: { value: string; onPick: (a: string) => void }) {
  return (
    <div className="ev-avatars" role="radiogroup" aria-label="Avatar">
      {AVATARS.map((a) => (
        <button key={a.id} role="radio" aria-checked={value === a.id} className={value === a.id ? "on" : ""} onClick={() => onPick(a.id)}>
          <img className="icon" src={portrait(a.id)} alt="" />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function Intro({ busy, me, onPlant, onPick, onUpload, onLibrary }: { busy: boolean; me?: Player; onPlant: (name: string, color: string, avatar: string) => void; onPick: (a: string) => void; onUpload: (f: File) => void; onLibrary: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  return (
    <Dialogue speaker="Welcome to Benefit Burrow" actions={<button className="ev-btn" disabled={busy} onClick={() => onPlant(name, color, me?.avatar ?? "")}>{busy ? "Planting…" : "Plant my documents"}</button>}>
      <p>Plant your paperwork and it grows: every benefit you’re about to lose becomes a crop bearing coins. The closer its deadline, the more it wilts. Harvest it before the date and the money is yours.</p>
      <div className="ev-field">Pick your farmer</div>
      <AvatarPicker value={me?.avatar ?? ""} onPick={onPick} />
      <label className="ev-field">Your name<input value={name} placeholder={me?.name ?? "Farmer"} onChange={(e) => setName(e.target.value)} maxLength={20} /></label>
      <div className="ev-colors">{COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
      <p className="ev-sub">Seeds: a sample benefits summary, dental plan, EOBs, dining statement, card list and bank statement.</p>
      <div className="ev-upload">
        <button className="ev-btn ghost" onClick={onLibrary}>Find my plans in the library</button>
        <UploadButton busy={busy} onUpload={onUpload} className="ev-btn ghost" label="Or plant your own bank statement" />
        <span className="ev-sub">CSV export or PDF. It stays on this computer.</span>
      </div>
    </Dialogue>
  );
}

function CropCard({ tile, state, pid, onState, onAnswer, onClose, onHarvest }: { tile: Tile; state: AppState; pid: string; onState: (s: AppState) => void; onAnswer: (r: "go" | "keep") => void; onClose: () => void; onHarvest: () => void }) {
  const done = state.done.includes(tile.id);
  const verdict = state.reviews[tile.id];
  const asking = Boolean(tile.ask) && verdict?.verdict === "approve" && !done && !state.answers?.[tile.id];
  const can = tile.live && tile.action.kind !== "none" && verdict?.verdict === "approve" && !done && !asking;
  const src = tile.sources[0];
  const doc = state.docs.find((d) => d.id === src?.doc);
  return (
    <Dialogue
      speaker={`${shortTitle(tile.title)} · ${tile.daysLeft} days`}
      onClose={onClose}
      actions={can ? <button className="ev-btn" onClick={onHarvest}>Harvest · save {usd(tile.action.savings)}</button> : done ? <span className="ev-good">Harvested</span> : null}
    >
      <p className="ev-lead">{tile.headline}</p>
      <ul className="ev-options">
        {tile.candidates.map((c) => (
          <li key={c.id} className={c.id === tile.recommendation ? "rec" : ""}><span>{c.label}</span><b>{usd(c.costToUser)}</b></li>
        ))}
      </ul>
      <p className="ev-sub">If you do nothing: {tile.doNothing}</p>
      {verdict && tile.live && tile.action.kind !== "none" && (
        <div>
          <span className={`ev-stamp ${verdict.verdict === "approve" ? "ok" : "no"}`}>{verdict.verdict === "approve" ? "Approved" : "Declined"}<small>RUTH · REVIEWER{verdict.rule_cited ? ` · RULE ${verdict.rule_cited}` : ""}</small></span>
          <p className="ev-sub">{verdict.reason}</p>
        </div>
      )}
      {asking && tile.ask && <RuthAsks question={tile.ask} onAnswer={onAnswer} />}
      {verdict && !done && <PushBack key={tile.id} pid={pid} verdictKey={tile.id} onState={onState} />}
      {doc && src && <p className="ev-src"><span>{doc.name.replace(/\.txt$/, "")}:</span> <mark>{src.text}</mark></p>}
    </Dialogue>
  );
}

function Confirm({ tile, others, onCancel, onConfirm }: { tile: Tile; others: Player[]; onCancel: () => void; onConfirm: (to?: string) => void }) {
  const transfer = tile.action.kind === "transfer";
  const [to, setTo] = useState<string>(transfer && others[0] ? others[0].identity.toHexString() : "");
  return (
    <Dialogue
      speaker={transfer ? "Send by letter" : "Confirm the harvest"}
      onClose={onCancel}
      actions={<button className="ev-btn" onClick={() => onConfirm(to || undefined)}>{transfer ? `Send ${usd(Number(tile.action.payload.amount))}` : tile.action.kind === "request" ? "Yes, do it" : "Yes, call them"}</button>}
    >
      <p>Expire will: {tile.action.summary}. Nothing else will be said or paid.</p>
      {transfer && (
        <div className="ev-pick">
          {others.map((p) => (
            <button key={p.identity.toHexString()} className={to === p.identity.toHexString() ? "on" : ""} onClick={() => setTo(p.identity.toHexString())}>
              <i style={{ background: p.color }} />{p.name}
            </button>
          ))}
          <button className={to === "" ? "on" : ""} onClick={() => setTo("")}>A classmate outside the burrow</button>
        </div>
      )}
      <ul className="ev-options">
        <li><span>Expire fee</span><b>$0.00</b></li>
        <li className="rec"><span>{transfer ? "Rescued from forfeit" : "You save"}</span><b>{usd(tile.action.savings)}</b></li>
      </ul>
      <p className="ev-sub">Expire never takes a cut of what it saves you.</p>
    </Dialogue>
  );
}

function Run({ tile, lines, result, toName, onDone }: { tile: Tile; lines: string[]; result: DispatchResult | null; toName?: string; onDone: () => void }) {
  const call = tile.action.kind === "book_call";
  const req = tile.action.kind === "request";
  return (
    <Dialogue
      speaker={call ? `On the phone with ${tile.action.payload.to}` : req ? String(tile.action.payload.title) : "Sending dining dollars"}
      actions={result ? <button className="ev-btn" onClick={onDone}>Collect +{usd(tile.action.savings)}</button> : <span className="ev-sub">{call ? "Calling…" : req ? "Working on it…" : "Settling…"}</span>}
    >
      <div className="ev-lines">{lines.map((l, i) => <p key={i} className="ev-line">{l}</p>)}</div>
      {result && (
        <div>
          <span className="ev-stamp ok">{call ? "Booked" : req ? "Done" : "Sent"}<small>{result.confirmation}</small></span>
          <p className="ev-sub">{result.integration}{toName ? ` · an envelope is waiting in ${toName}’s letterbox` : ""}</p>
        </div>
      )}
    </Dialogue>
  );
}

const CARTS = [["Sunscreen SPF 50", "Aloe vera gel"], ["Electric toothbrush"], ["Reading glasses"]];

function ElderTalk({ step, verdict, onAsk, onClose, onRecord, pushBack }: { step: "hello" | "thinking" | "verdict"; verdict?: Verdict; onAsk: (items: string[]) => void; onClose: () => void; onRecord: () => void; pushBack: React.ReactNode }) {
  return (
    <Dialogue speaker="Ruth, the Reviewer" onClose={onClose}
      actions={step === "hello" ? [...CARTS.map((c) => <button key={c.join()} className="ev-btn ghost" onClick={() => onAsk(c)}>Spend my FSA on {c.join(" + ").toLowerCase()}?</button>), <button key="rec" className="ev-btn ghost" onClick={onRecord}>Show me your record</button>] : step === "verdict" ? <button className="ev-btn ghost" onClick={() => onAsk(CARTS[0])}>Ask again</button> : null}
    >
      {step === "hello" && <p>I audit every harvest in this burrow. Merchants profit when you spend; I don’t. Show me what you want to buy with your FSA.</p>}
      {step === "thinking" && <p>Checking it against your receipts and stated needs…</p>}
      {step === "verdict" && verdict && (
        <div>
          <span className={`ev-stamp ${verdict.verdict === "approve" ? "ok" : "no"}`}>{verdict.verdict === "approve" ? "Approved" : "Declined"}{verdict.rule_cited ? <small>RULE {verdict.rule_cited}</small> : null}</span>
          <p className={verdict.verdict === "approve" ? "ev-good" : "ev-bad big"}>{verdict.verdict === "approve" ? "Fine. " : "No. "}{verdict.reason}</p>
          {pushBack}
        </div>
      )}
    </Dialogue>
  );
}

