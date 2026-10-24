"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpacetimeDBProvider, useSpacetimeDB, useTable } from "spacetimedb/react";
import * as THREE from "three";
import { DbConnection, tables } from "@/lib/valley_bindings";
import type { Player, Plot } from "@/lib/valley_bindings/types";
import { expire } from "@/lib/valley/expire";
import { ELDER_POS, mailboxPosition, slotPosition, usd } from "@/lib/valley/layout";
import type { AppState, DispatchResult, Tile, Verdict } from "@/lib/types";
import { Crop, Elder, Farmer } from "./Actors";
import { Farmstead, Ground, Village } from "./World";

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
      setToast(`${from?.name ?? "A farmer"} left you a gift at your mailbox`);
      setTimeout(() => setToast(""), 5000);
    }
  }, [myGifts, players]);

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
    if (!me || !state || myPlots.length > 0) return;
    if (!state.tiles.length) { if (modal === null) setModal({ kind: "intro" }); return; }
    if (!replanted.current) { replanted.current = true; void plant(state); }
  }, [me, state, myPlots.length, modal, plant]);

  async function plantDocs(name: string, color: string) {
    if (!conn) return;
    setBusy(true); setError("");
    try {
      if (name.trim()) await conn.reducers.setProfile({ name: name.trim(), color });
      const r = await expire.scan(pid);
      setState(r.state);
      await plant(r.state);
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
    try {
      const r = await expire.dispatch(pid, tileId);
      for (const line of r.result.transcript) {
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
    const r = await expire.reviewCart(pid, fsa.id, items);
    setState(r.state);
    setModal({ kind: "elder", step: "verdict", verdict: r.verdict });
  }

  async function openGifts() {
    if (!conn) return;
    for (const g of myGifts) await conn.reducers.openGift({ id: g.id });
    setModal({ kind: "gift" });
  }

  function interact() {
    if (!near || modal) return;
    if (near.kind === "crop") setModal({ kind: "crop", tileId: near.tileId });
    if (near.kind === "elder") setModal({ kind: "elder", step: "hello" });
    if (near.kind === "mailbox") void openGifts();
  }

  // Keyboard: E to interact, Esc to close, Enter to chat.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "e" || e.key === "E") interact();
      if (e.key === "Escape") setModal((m) => (m?.kind === "run" && !m.result ? m : null));
      if (e.key === "Enter" && !modal) { e.preventDefault(); setChatOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <Canvas shadows orthographic camera={{ zoom: 38, position: [20, 24, 20], near: 0.1, far: 500 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={["#BFE3F5"]} />
        <fog attach="fog" args={["#BFE3F5", 60, 140]} />
        <hemisphereLight args={["#FFF7E8", "#6C8F4E", 0.9]} />
        <directionalLight position={[30, 40, 15]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} />
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
        />
      </Canvas>

      <Hud me={me} others={others} isActive={isActive} state={state} busy={busy} onReplant={replant} />

      {near && !modal && (
        <button className="ev-prompt" onClick={interact}><kbd>E</kbd> {near.label}</button>
      )}
      {toast && <div className="ev-toast">{toast}</div>}
      {error && <div className="ev-toast bad" onClick={() => setError("")}>{error}</div>}
      <div className="ev-help">WASD or click to walk · E to interact · Enter to chat</div>

      {chatOpen && (
        <form className="ev-chat" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value; if (v.trim() && conn) void conn.reducers.say({ text: v }); setChatOpen(false); }}>
          <input name="t" autoFocus placeholder="Say something to the valley…" onKeyDown={(e) => e.key === "Escape" && setChatOpen(false)} />
        </form>
      )}

      {modal?.kind === "intro" && <Intro busy={busy} me={me} onPlant={plantDocs} />}
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
        <Dialogue speaker="Mailbox" onClose={() => setModal(null)}>
          <p>{gifts.filter((g) => hex(g.to) === myHex).slice(-1).map((g) => `${players.find((p) => hex(p.identity) === hex(g.from))?.name ?? "A farmer"} sent you ${usd(g.amount)}: “${g.note}”`)[0] ?? "Nothing here yet."}</p>
        </Dialogue>
      )}
    </div>
  );
}

// ---------- 3D scene ----------

function Scene({ me, players, plots, myHex, bubbles, giftsWaitingFor, canMove, onNear, conn, myGiftCount }: {
  me?: Player; players: readonly Player[]; plots: readonly Plot[]; myHex: string; bubbles: Map<string, string>;
  giftsWaitingFor: Set<string>; canMove: boolean; onNear: (n: Near) => void; conn: DbConnection | null; myGiftCount: number;
}) {
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

  useFrame((_, dt) => {
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
    if (meGroup.current) meGroup.current.position.copy(p);

    // Follow camera, isometric offset.
    const want = new THREE.Vector3(p.x + 20, 24, p.z + 20);
    camera.position.lerp(want, 1 - Math.pow(0.001, dt));
    camera.lookAt(camera.position.x - 20, 0, camera.position.z - 20);

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
    if (Math.hypot(p.x - ELDER_POS[0], p.z - ELDER_POS[2]) < REACH + 0.6) { id = "elder"; best = { kind: "elder", label: "Talk to Elder Ruth, the Reviewer" }; }
    const mb = mailboxPosition(me.farm);
    if (myGiftCount > 0 && Math.hypot(p.x - mb[0], p.z - mb[2]) < REACH) { id = "mailbox"; best = { kind: "mailbox", label: "Open your gift" }; }
    if (id !== nearKey.current) { nearKey.current = id; setNearId(id); onNear(best); }
  });

  return (
    <group>
      <Ground onPoint={(pt) => { target.current = new THREE.Vector3(pt.x, 0, pt.z); }} />
      <Village />
      <Elder position={ELDER_POS} highlighted={nearId === "elder"} />
      {players.map((pl) => (
        <Farmstead key={`farm-${hex(pl.identity)}`} farm={pl.farm} color={pl.color} name={pl.name} hasGift={giftsWaitingFor.has(hex(pl.identity))} />
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
            harvestable={pl.harvestable}
            saved={pl.saved}
            highlighted={mine && nearId === pl.tileId}
            label={mine || pl.harvested}
          />
        );
      })}
      {me && (
        <group ref={meGroup} position={[me.x, 0, me.z]}>
          <Farmer color={me.color} name={me.name} facing={facing.current} walking={walking} bubble={bubbles.get(myHex)} me />
        </group>
      )}
      {players.filter((p) => p.online && hex(p.identity) !== myHex).map((p) => (
        <Remote key={hex(p.identity)} p={p} bubble={bubbles.get(hex(p.identity))} />
      ))}
    </group>
  );
}

function Remote({ p, bubble }: { p: Player; bubble?: string }) {
  const g = useRef<THREE.Group>(null);
  const [walking, setWalking] = useState(false);
  useFrame((_, dt) => {
    if (!g.current) return;
    const to = new THREE.Vector3(p.x, 0, p.z);
    const d = g.current.position.distanceTo(to);
    g.current.position.lerp(to, 1 - Math.pow(0.0005, dt));
    const w = d > 0.06;
    if (w !== walking) setWalking(w);
  });
  return (
    <group ref={g} position={[p.x, 0, p.z]}>
      <Farmer color={p.color} name={p.name} facing={p.facing} walking={walking} bubble={bubble} />
    </group>
  );
}

// ---------- overlays ----------

function Hud({ me, others, isActive, state, busy, onReplant }: { me?: Player; others: Player[]; isActive: boolean; state: AppState | null; busy: boolean; onReplant: () => void }) {
  const next = state?.tiles.filter((t) => !state.done.includes(t.id) && t.atStake > 0).sort((a, b) => a.daysLeft - b.daysLeft)[0];
  return (
    <>
      <div className="ev-panel ev-date">
        <div className="ev-title">Expire Valley</div>
        <div>Sat, Oct 24</div>
        {next && <div className="ev-sub">Next to wilt: {shortTitle(next.title).split(" ").slice(0, 3).join(" ")}… in {next.daysLeft}d</div>}
      </div>
      <div className="ev-panel ev-gold">
        <span className="coin" />
        <div>
          <div className="ev-title">{usd(me?.rescued ?? 0)}</div>
          <div className="ev-sub">rescued</div>
        </div>
      </div>
      <div className="ev-panel ev-who">
        <div className="ev-sub">{isActive ? `${others.length + (me ? 1 : 0)} in the valley` : "Connecting…"}</div>
        {me && <div className="who"><i style={{ background: me.color }} />{me.name} (you)</div>}
        {others.map((p) => <div key={p.identity.toHexString()} className="who"><i style={{ background: p.color }} />{p.name}</div>)}
        <button className="ev-link" disabled={busy} onClick={onReplant}>{busy ? "Replanting…" : "Replant (reset demo)"}</button>
      </div>
    </>
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

function Intro({ busy, me, onPlant }: { busy: boolean; me?: Player; onPlant: (name: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(me?.color ?? COLORS[0]);
  return (
    <Dialogue speaker="Welcome to Expire Valley" actions={<button className="ev-btn" disabled={busy} onClick={() => onPlant(name, color)}>{busy ? "Planting…" : "Plant my documents"}</button>}>
      <p>Every benefit you’re about to lose grows here as a crop. The closer its deadline, the more it wilts. Harvest it before it dies and the money is yours.</p>
      <label className="ev-field">Your name<input value={name} placeholder={me?.name ?? "Farmer"} onChange={(e) => setName(e.target.value)} maxLength={20} /></label>
      <div className="ev-colors">{COLORS.map((c) => <button key={c} aria-label={`Color ${c}`} className={c === color ? "on" : ""} style={{ background: c }} onClick={() => setColor(c)} />)}</div>
      <p className="ev-sub">We’ll read your benefits summary, dental plan, EOBs, dining statement and cards.</p>
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
      {verdict && tile.live && tile.action.kind !== "none" && <p className={verdict.verdict === "approve" ? "ev-good" : "ev-bad"}>Elder Ruth: {verdict.reason}</p>}
      {doc && src && <p className="ev-src"><span>{doc.name.replace(/\.txt$/, "")}:</span> <mark>{src.text}</mark></p>}
    </Dialogue>
  );
}

function Confirm({ tile, others, onCancel, onConfirm }: { tile: Tile; others: Player[]; onCancel: () => void; onConfirm: (to?: string) => void }) {
  const transfer = tile.action.kind === "transfer";
  const [to, setTo] = useState<string>(transfer && others[0] ? others[0].identity.toHexString() : "");
  return (
    <Dialogue
      speaker={transfer ? "Send to a classmate" : "Confirm the harvest"}
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
      {result && <p className="ev-good">Confirmed · {result.confirmation} · {result.integration}{toName ? ` · gift left at ${toName}’s mailbox` : ""}</p>}
    </Dialogue>
  );
}

const CARTS = [["Sunscreen SPF 50", "Aloe vera gel"], ["Electric toothbrush"], ["Reading glasses"]];

function ElderTalk({ step, verdict, onAsk, onClose }: { step: "hello" | "thinking" | "verdict"; verdict?: Verdict; onAsk: (items: string[]) => void; onClose: () => void }) {
  return (
    <Dialogue speaker="Elder Ruth, the Reviewer" onClose={onClose}
      actions={step === "hello" ? CARTS.map((c) => <button key={c.join()} className="ev-btn ghost" onClick={() => onAsk(c)}>Spend my FSA on {c.join(" + ").toLowerCase()}?</button>) : step === "verdict" ? <button className="ev-btn ghost" onClick={() => onAsk(CARTS[0])}>Ask again</button> : null}
    >
      {step === "hello" && <p>Every merchant in this valley profits when you spend. I don’t. Bring me a purchase and I’ll tell you if it’s worth it.</p>}
      {step === "thinking" && <p>Hmm. Let me read your papers…</p>}
      {step === "verdict" && verdict && (
        <p className={verdict.verdict === "approve" ? "ev-good" : "ev-bad big"}>
          {verdict.verdict === "approve" ? "Fine. " : "No. "}{verdict.reason}{verdict.rule_cited ? ` (Rule ${verdict.rule_cited})` : ""}
        </p>
      )}
    </Dialogue>
  );
}

