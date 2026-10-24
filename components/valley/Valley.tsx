"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react";
import * as THREE from "three";
import { DbConnection, tables } from "@/lib/valley_bindings";
import type { Player, Plot } from "@/lib/valley_bindings/types";
import { expire } from "@/lib/valley/expire";
import { ELDER_POS, mailboxPosition, slotPosition, usd } from "@/lib/valley/layout";
import type { AppState, DispatchResult, Tile, Verdict } from "@/lib/types";
import { sound } from "@/lib/valley/audio";
import { clockLabel, gameHour, setHour } from "@/lib/valley/clock";
import { Crop } from "./Actors";
import { AVATARS, type Emote, FarmerModel, type Mood, RuthModel } from "./Characters";
import { Farmstead, HexTerrain, Village } from "./HexWorld";
import { Fireflies } from "./Nature";
import { PostFX } from "./PostFX";
import { groundAt } from "@/lib/valley/hexgrid";
import { PIXEL_SIZE } from "@/lib/valley/toon";
import { type Burst, CoinBurst, DayNight, focus } from "./Effects";
import { anchors, labelEls, registerLabel, setAnchor } from "@/lib/valley/labels";
import { CROP_LOOK } from "@/lib/valley/layout";

const DB = "expire-valley";
const SPEED = 6.5;
const REACH = 2.2;

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
    ensureToken(slotKey()).then(setToken).catch((e) => setFailed(`Can’t reach the valley server (${(e as Error).message}). Is \`spacetime start\` running?`));
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
  if (!builder) return <div className="ev-loading">Walking into the valley…</div>;
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <Valley />
    </SpacetimeDBProvider>
  );
}

type Near = { kind: "crop"; tileId: string; label: string } | { kind: "elder"; label: string } | { kind: "mailbox"; label: string } | null;

type Modal =
  | { kind: "intro" }
  | { kind: "crop"; tileId: string }
  | { kind: "confirm"; tileId: string }
  | { kind: "run"; tileId: string; lines: string[]; result: DispatchResult | null; to?: string }
  | { kind: "elder"; step: "hello" | "thinking" | "verdict"; verdict?: Verdict }
  | { kind: "gift" }
  | { kind: "avatar" }
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
    if (pid) expire.state(pid).then((r) => setState(r.state)).catch((e) => setError(e.message));
  }, [pid]);

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
    if (near.kind === "elder") setModal({ kind: "elder", step: "hello" });
    if (near.kind === "mailbox") void openGifts();
  }

  // Keyboard: E to interact, Esc to close, Enter to chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (title) return;
      if (e.key === "m" || e.key === "M") toggleMute();
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
    setHour(7); // every session starts at dawn, whatever the title screen idled through
    setTitle(false);
  }

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") (window as unknown as { __setHour?: (h: number) => void }).__setHour = setHour;
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
      <Canvas shadows orthographic camera={{ zoom: 42, position: [20, 24, 20], near: 0.1, far: 500 }} dpr={1 / PIXEL_SIZE} gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
        <DayNight />
        <Suspense fallback={null}>
        <Scene
          me={me}
          players={players}
          plots={plots}
          myHex={myHex}
          bubbles={bubbles}
          giftsWaitingFor={giftsWaitingFor}
          canMove={!modal && !chatOpen}
          onNear={setNear}
          conn={conn}
          myGiftCount={myGifts.length}
          attract={title}
          bursts={bursts}
          onBurstDone={(id) => setBursts((b) => b.filter((x) => x.id !== id))}
          emotes={emotes}
          ruthMood={ruthMood}
        />
        </Suspense>
        <PostFX />
      </Canvas>
      {!title && <Labels plots={plots} players={players} myHex={myHex} bubbles={bubbles} bursts={bursts} nearElder={near?.kind === "elder"} />}

      {title ? (
        <Title onPlay={play} connected={isActive} />
      ) : (
        <Hud me={me} others={others} isActive={isActive} state={state} busy={busy} onReplant={replant} muted={muted} onMute={toggleMute} onAvatar={() => setModal({ kind: "avatar" })} />
      )}

      {near && !modal && !title && (
        <button className="ev-prompt" onClick={interact}><kbd>E</kbd> {near.label}</button>
      )}
      {toast && <div className="ev-toast">{toast}</div>}
      {error && <div className="ev-toast bad" onClick={() => setError("")}>{error}</div>}
      {!title && <div className="ev-help">WASD or click to walk · E to interact · Enter to chat · M to mute</div>}

      {chatOpen && (
        <form className="ev-chat" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value; if (v.trim() && conn) void conn.reducers.say({ text: v }); setChatOpen(false); }}>
          <input name="t" autoFocus placeholder="Say something to the valley…" onKeyDown={(e) => e.key === "Escape" && setChatOpen(false)} />
        </form>
      )}

      {modal?.kind === "intro" && <Intro busy={busy} me={me} onPlant={plantDocs} onPick={pickAvatar} />}
      {modal?.kind === "avatar" && (
        <Dialogue speaker="Choose your farmer" onClose={() => setModal(null)}>
          <AvatarPicker value={me?.avatar ?? ""} onPick={pickAvatar} />
        </Dialogue>
      )}
      {modal?.kind === "crop" && tileById(modal.tileId) && (
        <CropCard tile={tileById(modal.tileId)!} state={state!} onClose={() => setModal(null)} onHarvest={() => setModal({ kind: "confirm", tileId: modal.tileId })} />
      )}
      {modal?.kind === "confirm" && tileById(modal.tileId) && (
        <Confirm tile={tileById(modal.tileId)!} others={others} onCancel={() => setModal({ kind: "crop", tileId: modal.tileId })} onConfirm={(to) => harvest(modal.tileId, to)} />
      )}
      {modal?.kind === "run" && tileById(modal.tileId) && (
        <Run tile={tileById(modal.tileId)!} lines={modal.lines} result={modal.result} toName={others.find((p) => hex(p.identity) === modal.to)?.name} onDone={() => setModal(null)} />
      )}
      {modal?.kind === "elder" && <ElderTalk step={modal.step} verdict={modal.verdict} onAsk={askElder} onClose={() => setModal(null)} />}
      {modal?.kind === "gift" && (
        <Dialogue speaker="Letter" onClose={() => setModal(null)}>
          <p>{gifts.filter((g) => hex(g.to) === myHex).slice(-1).map((g) => `${players.find((p) => hex(p.identity) === hex(g.from))?.name ?? "A farmer"} sent you ${usd(g.amount)}: “${g.note}”`)[0] ?? "Nothing here yet."}</p>
        </Dialogue>
      )}
    </div>
  );
}

// ---------- 3D scene ----------

function Scene({ me, players, plots, myHex, bubbles, giftsWaitingFor, canMove, onNear, conn, myGiftCount, attract, bursts, onBurstDone, emotes, ruthMood }: {
  me?: Player; players: readonly Player[]; plots: readonly Plot[]; myHex: string; bubbles: Map<string, string>;
  giftsWaitingFor: Set<string>; canMove: boolean; onNear: (n: Near) => void; conn: DbConnection | null; myGiftCount: number;
  attract: boolean; bursts: Burst[]; onBurstDone: (id: number) => void; emotes: Record<string, Emote>; ruthMood: Mood;
}) {
  const lastStep = useRef(0);
  const pos = useRef<THREE.Vector3 | null>(null);
  const target = useRef<THREE.Vector3 | null>(null);
  const facing = useRef(0);
  const [walking, setWalking] = useState(false);
  const keys = useRef(new Set<string>());
  const meGroup = useRef<THREE.Group>(null);
  const lastSent = useRef({ t: 0, x: 0, z: 0 });
  const nearKey = useRef("");
  const { camera } = useThree();
  const [nearId, setNearId] = useState("");

  useEffect(() => {
    if (me && !pos.current) pos.current = new THREE.Vector3(me.x, 0, me.z);
  }, [me]);

  // Dev hook so tests can walk without simulating mouse rays: window.__walkTo(x, z).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __walkTo?: (x: number, z: number) => void }).__walkTo = (x, z) => { target.current = new THREE.Vector3(x, 0, z); };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.tagName !== "INPUT") keys.current.add(e.key.toLowerCase()); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const myPlots = plots.filter((p) => hex(p.owner) === myHex);
  // A stable string so the terrain only rebuilds when the set of claimed farms changes.
  const farmsKey = [...new Set(players.map((p) => p.farm))].sort((a, b) => a - b).join(",");

  useFrame(({ clock }, dt) => {
    // Title screen: slow orbit over the village instead of following a farmer.
    if (attract) {
      const a = clock.getElapsedTime() * 0.08;
      camera.position.set(Math.cos(a) * 30, 26, 14 + Math.sin(a) * 30);
      camera.lookAt(0, 0, 14);
      return;
    }
    const p = pos.current;
    if (!p || !me) return;
    const dir = new THREE.Vector3();
    if (canMove) {
      const k = keys.current;
      // Screen-aligned controls for the isometric camera.
      if (k.has("w") || k.has("arrowup")) dir.add(new THREE.Vector3(-1, 0, -1));
      if (k.has("s") || k.has("arrowdown")) dir.add(new THREE.Vector3(1, 0, 1));
      if (k.has("a") || k.has("arrowleft")) dir.add(new THREE.Vector3(-1, 0, 1));
      if (k.has("d") || k.has("arrowright")) dir.add(new THREE.Vector3(1, 0, -1));
      if (dir.lengthSq() > 0) target.current = null;
      else if (target.current) {
        const to = target.current.clone().sub(p);
        if (to.length() < 0.15) target.current = null;
        else dir.copy(to);
      }
    }
    const moving = dir.lengthSq() > 0;
    if (moving) {
      dir.normalize();
      p.addScaledVector(dir, Math.min(SPEED * dt, target.current ? p.distanceTo(target.current) : Infinity));
      p.x = Math.max(-88, Math.min(88, p.x));
      p.z = Math.max(-88, Math.min(88, p.z));
      facing.current = Math.atan2(dir.x, dir.z);
    }
    if (moving !== walking) setWalking(moving);
    if (moving && performance.now() - lastStep.current > 300) { lastStep.current = performance.now(); sound.step2(); }
    p.y = THREE.MathUtils.lerp(p.y, groundAt(p.x, p.z), Math.min(1, dt * 14));
    if (meGroup.current) meGroup.current.position.copy(p);
    focus.copy(p);
    setAnchor(`player:${myHex}`, p.x, p.y + 2.3, p.z);

    // Follow camera, isometric offset.
    const want = new THREE.Vector3(p.x + 20, p.y + 24, p.z + 20);
    camera.position.lerp(want, 1 - Math.pow(0.001, dt));
    camera.lookAt(camera.position.x - 20, camera.position.y - 24, camera.position.z - 20);

    // Tell the valley where we are, at most ~10 times a second.
    const now = performance.now();
    const ls = lastSent.current;
    if (conn && now - ls.t > 100 && (Math.abs(ls.x - p.x) > 0.05 || Math.abs(ls.z - p.z) > 0.05)) {
      lastSent.current = { t: now, x: p.x, z: p.z };
      void conn.reducers.move({ x: p.x, z: p.z, facing: facing.current }).catch(() => {});
    }

    // What's within reach?
    let best: Near = null;
    let bestD = REACH;
    let id = "";
    for (const pl of myPlots) {
      const [x, , z] = slotPosition(me.farm, pl.slot);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; id = pl.tileId; best = { kind: "crop", tileId: pl.tileId, label: pl.harvested ? `Look at ${pl.title}` : `Inspect ${pl.title} (${usd(pl.atStake)})` }; }
    }
    if (Math.hypot(p.x - ELDER_POS[0], p.z - ELDER_POS[2]) < REACH + 0.6) { id = "elder"; best = { kind: "elder", label: "Talk to Ruth, the Reviewer" }; }
    const mb = mailboxPosition(me.farm);
    if (myGiftCount > 0 && Math.hypot(p.x - mb[0], p.z - mb[2]) < REACH) { id = "mailbox"; best = { kind: "mailbox", label: "Open your letter" }; }
    if (id !== nearKey.current) { nearKey.current = id; setNearId(id); onNear(best); }
  });

  return (
    <group>
      <HexTerrain farms={farmsKey.split(",").filter(Boolean).map(Number)} onPoint={(pt) => { target.current = new THREE.Vector3(pt.x, 0, pt.z); }} />
      <Village />
      <Fireflies />
      <RuthModel position={ELDER_POS} mood={ruthMood} />
      {players.map((pl) => (
        <Farmstead key={`farm-${hex(pl.identity)}`} farm={pl.farm} color={pl.color} hasGift={giftsWaitingFor.has(hex(pl.identity))} />
      ))}
      {plots.map((pl) => {
        const owner = players.find((p) => hex(p.identity) === hex(pl.owner));
        if (!owner) return null;
        const mine = hex(pl.owner) === myHex;
        return (
          <Crop
            key={String(pl.id)}
            position={slotPosition(owner.farm, pl.slot)}
            category={pl.category}
            atStake={pl.atStake}
            daysLeft={pl.daysLeft}
            harvested={pl.harvested}
            highlighted={mine && nearId === pl.tileId}
          />
        );
      })}
      {me && (
        <group ref={meGroup} position={[me.x, 0, me.z]}>
          <FarmerModel farm={me.farm} avatar={me.avatar} facing={0} facingRef={facing} walking={walking} emote={emotes[myHex]} />
        </group>
      )}
      {players.filter((p) => p.online && hex(p.identity) !== myHex).map((p) => (
        <Remote key={hex(p.identity)} p={p} emote={emotes[hex(p.identity)]} />
      ))}
      {bursts.map((b) => <CoinBurst key={b.id} burst={b} onDone={onBurstDone} />)}
      <Projector />
    </group>
  );
}

function Remote({ p, emote }: { p: Player; emote?: Emote }) {
  const g = useRef<THREE.Group>(null);
  const [walking, setWalking] = useState(false);
  useFrame((_, dt) => {
    if (!g.current) return;
    const to = new THREE.Vector3(p.x, groundAt(p.x, p.z), p.z);
    const d = g.current.position.distanceTo(to);
    g.current.position.lerp(to, 1 - Math.pow(0.0005, dt));
    setAnchor(`player:${hex(p.identity)}`, g.current.position.x, g.current.position.y + 2.3, g.current.position.z);
    const w = d > 0.06;
    if (w !== walking) setWalking(w);
  });
  return (
    <group ref={g} position={[p.x, 0, p.z]}>
      <FarmerModel farm={p.farm} avatar={p.avatar} facing={p.facing} walking={walking} emote={emote} />
    </group>
  );
}

// Moves every registered DOM label to its anchor's screen position each frame.
function Projector() {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const [id, el] of labelEls) {
      const w = anchors.get(id);
      if (!w) { el.style.visibility = "hidden"; continue; }
      v.copy(w).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      el.style.visibility = visible ? "visible" : "hidden";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
      // Crop tags shrink to just the amount unless you're standing close.
      if (id.startsWith("crop:")) el.classList.toggle("far", Math.hypot(w.x - focus.x, w.z - focus.z) > 7);
    }
  });
  return null;
}

type LabelProps = { plots: readonly Plot[]; players: readonly Player[]; myHex: string; bubbles: Map<string, string>; bursts: Burst[]; nearElder: boolean };

// All floating labels, rendered by the main React tree and positioned by <Projector>.
function Labels({ plots, players, myHex, bubbles, bursts, nearElder }: LabelProps) {
  useEffect(() => { setAnchor("elder", ELDER_POS[0], 4.0, ELDER_POS[2]); }, []);
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
        setAnchor(id, x, pl.harvested ? 1.7 : 3.6, z);
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
        if (!anchors.has(id)) setAnchor(id, p.x, 2.35, p.z);
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
      <div ref={registerLabel("elder")} className="ev-anchor">
        <div className="ev-name-wrap"><div className={`ev-name elder ${nearElder ? "hl" : ""}`}>Ruth · the Reviewer</div></div>
      </div>
      {bursts.map((b) => {
        const id = `burst:${b.id}`;
        setAnchor(id, b.at[0], 2.6, b.at[2]);
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
  const [night, setNight] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { setLabel(clockLabel()); const h = gameHour(); setNight(h < 6 || h >= 19); }, 1000);
    return () => clearInterval(id);
  }, []);
  return { label, night };
}

function Hud({ me, others, isActive, state, busy, onReplant, muted, onMute, onAvatar }: { me?: Player; others: Player[]; isActive: boolean; state: AppState | null; busy: boolean; onReplant: () => void; muted: boolean; onMute: () => void; onAvatar: () => void }) {
  const next = state?.tiles.filter((t) => !state.done.includes(t.id) && t.atStake > 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const clock = useClock();
  return (
    <>
      <div className="ev-panel ev-date">
        <div className="ev-title">Expire Valley</div>
        <div className="ev-clock">Sat, Oct 24 · {clock.label} {clock.night ? "☾" : "☀"}</div>
        {next && <div className="ev-sub">Next to wilt: {shortTitle(next.title).split(" ").slice(0, 3).join(" ")}… in {next.daysLeft}d</div>}
      </div>
      <div className="ev-panel ev-gold">
        <span className="coin" />
        <div>
          <div key={me?.rescued ?? 0} className="ev-title ev-pop">{usd(me?.rescued ?? 0)}</div>
          <div className="ev-sub">rescued</div>
        </div>
      </div>
      <div className="ev-panel ev-who">
        <div className="ev-sub">{isActive ? `${others.length + (me ? 1 : 0)} in the valley` : "Connecting…"}</div>
        {me && <div className="who"><i style={{ background: me.color }} />{me.name} (you)</div>}
        {others.map((p) => <div key={p.identity.toHexString()} className="who"><i style={{ background: p.color }} />{p.name}</div>)}
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
          <span className="l1">Expire</span>
          <span className="l2">Valley</span>
          <span className="denom">GROW YOUR PAPERWORK · HARVEST YOUR MONEY</span>
        </div>
      </div>
      <p className="ev-tagline">Every benefit you’re about to lose grows here. Harvest it before it wilts.</p>
      {how ? (
        <div className="ev-panel ev-how">
          <p><b>Walk</b> with WASD or by clicking the ground. <b>E</b> to inspect a crop, talk, or open your mailbox. <b>Enter</b> to chat. <b>M</b> to mute.</p>
          <p>Each crop is a real balance from your documents: dental max, a deductible window, dining dollars, card credits. The closer the deadline, the more it wilts.</p>
          <p>Harvesting runs the real action (a booking call, a transfer) after Ruth, the Reviewer, approves it. Your rescued total is real money.</p>
        </div>
      ) : null}
      <div className="ev-title-actions">
        <button className="ev-btn big" onClick={onPlay} disabled={!connected}>{connected ? "Play" : "Connecting…"}</button>
        <button className="ev-btn ghost" onClick={() => setHow((h) => !h)}>{how ? "Got it" : "How to play"}</button>
      </div>
      <div className="ev-credit">Cal Hacks 13.0 · multiplayer on SpacetimeDB · powered by the Expire engine</div>
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
          <span className="icon">{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

function Intro({ busy, me, onPlant, onPick }: { busy: boolean; me?: Player; onPlant: (name: string, color: string, avatar: string) => void; onPick: (a: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  return (
    <Dialogue speaker="Welcome to Expire Valley" actions={<button className="ev-btn" disabled={busy} onClick={() => onPlant(name, color, me?.avatar ?? "")}>{busy ? "Planting…" : "Plant my documents"}</button>}>
      <p>Plant your paperwork and it grows: every benefit you’re about to lose becomes a crop bearing coins. The closer its deadline, the more it wilts. Harvest it before the date and the money is yours.</p>
      <div className="ev-field">Pick your farmer</div>
      <AvatarPicker value={me?.avatar ?? ""} onPick={onPick} />
      <label className="ev-field">Your name<input value={name} placeholder={me?.name ?? "Farmer"} onChange={(e) => setName(e.target.value)} maxLength={20} /></label>
      <div className="ev-colors">{COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
      <p className="ev-sub">Seeds: your benefits summary, dental plan, EOBs, dining statement and card list.</p>
    </Dialogue>
  );
}

function CropCard({ tile, state, onClose, onHarvest }: { tile: Tile; state: AppState; onClose: () => void; onHarvest: () => void }) {
  const done = state.done.includes(tile.id);
  const verdict = state.reviews[tile.id];
  const can = tile.live && tile.action.kind !== "none" && verdict?.verdict === "approve" && !done;
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
      actions={<button className="ev-btn" onClick={() => onConfirm(to || undefined)}>{transfer ? `Send ${usd(Number(tile.action.payload.amount))}` : "Yes, call them"}</button>}
    >
      <p>Expire will: {tile.action.summary}. Nothing else will be said or paid.</p>
      {transfer && (
        <div className="ev-pick">
          {others.map((p) => (
            <button key={p.identity.toHexString()} className={to === p.identity.toHexString() ? "on" : ""} onClick={() => setTo(p.identity.toHexString())}>
              <i style={{ background: p.color }} />{p.name}
            </button>
          ))}
          <button className={to === "" ? "on" : ""} onClick={() => setTo("")}>A classmate outside the valley</button>
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
  return (
    <Dialogue
      speaker={call ? `On the phone with ${tile.action.payload.to}` : "Sending dining dollars"}
      actions={result ? <button className="ev-btn" onClick={onDone}>Collect +{usd(tile.action.savings)}</button> : <span className="ev-sub">{call ? "Calling…" : "Settling…"}</span>}
    >
      <div className="ev-lines">{lines.map((l, i) => <p key={i} className="ev-line">{l}</p>)}</div>
      {result && (
        <div>
          <span className="ev-stamp ok">{call ? "Booked" : "Sent"}<small>{result.confirmation}</small></span>
          <p className="ev-sub">{result.integration}{toName ? ` · an envelope is waiting in ${toName}’s letterbox` : ""}</p>
        </div>
      )}
    </Dialogue>
  );
}

const CARTS = [["Sunscreen SPF 50", "Aloe vera gel"], ["Electric toothbrush"], ["Reading glasses"]];

function ElderTalk({ step, verdict, onAsk, onClose }: { step: "hello" | "thinking" | "verdict"; verdict?: Verdict; onAsk: (items: string[]) => void; onClose: () => void }) {
  return (
    <Dialogue speaker="Ruth, the Reviewer" onClose={onClose}
      actions={step === "hello" ? CARTS.map((c) => <button key={c.join()} className="ev-btn ghost" onClick={() => onAsk(c)}>Spend my FSA on {c.join(" + ").toLowerCase()}?</button>) : step === "verdict" ? <button className="ev-btn ghost" onClick={() => onAsk(CARTS[0])}>Ask again</button> : null}
    >
      {step === "hello" && <p>I audit every harvest in this valley. Merchants profit when you spend; I don’t. Show me what you want to buy with your FSA.</p>}
      {step === "thinking" && <p>Checking it against your receipts and stated needs…</p>}
      {step === "verdict" && verdict && (
        <div>
          <span className={`ev-stamp ${verdict.verdict === "approve" ? "ok" : "no"}`}>{verdict.verdict === "approve" ? "Approved" : "Declined"}{verdict.rule_cited ? <small>RULE {verdict.rule_cited}</small> : null}</span>
          <p className={verdict.verdict === "approve" ? "ev-good" : "ev-bad big"}>{verdict.verdict === "approve" ? "Fine. " : "No. "}{verdict.reason}</p>
        </div>
      )}
    </Dialogue>
  );
}

