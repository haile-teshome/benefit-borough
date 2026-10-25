// Expire Valley: the shared farm world. The Expire engine (Next.js API) decides what money is at
// stake and confirms every rescue; this module holds what everyone in the valley sees: farmers,
// where they stand, the crops on each farm, harvests, gifts between farmers, and chat.
import { schema, SenderError, t, table, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

const player = table(
  { name: 'player', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    color: t.string(),
    farm: t.u32(), // which farm in the valley this player owns, in join order
    x: t.f32(),
    z: t.f32(),
    facing: t.f32(),
    online: t.bool(),
    rescued: t.f64(), // dollars confirmed by the Expire engine
    avatar: t.string().default(""), // which animal this farmer plays as ("" = by farm order)
  }
);

const plot = table(
  { name: 'plot', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    tileId: t.string(),
    category: t.string(),
    title: t.string(),
    headline: t.string(),
    atStake: t.f64(),
    daysLeft: t.u32(),
    slot: t.u32(), // position within the owner's field
    harvestable: t.bool(), // false for detected tiles with only a static suggestion
    harvested: t.bool(),
    saved: t.f64(),
  }
);

const gift = table(
  { name: 'gift', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    from: t.identity(),
    to: t.identity().index('btree'),
    amount: t.f64(),
    note: t.string(),
    opened: t.bool(),
    at: t.timestamp(),
  }
);

const chat = table(
  { name: 'chat', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    text: t.string(),
    at: t.timestamp(),
  }
);

// The Swap Market: surplus benefits that are actually transferable (Flex dollars, pooled hotel
// points, a companion seat, gym guest passes) posted by one farmer and taken by another.
const offer = table(
  { name: 'offer', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index('btree'),
    kind: t.string(), // "dining" | "points" | "pass" | "other"
    title: t.string(),
    amount: t.f64(), // in `unit`
    unit: t.string(), // "USD", "points", "pass", ...
    want: t.string(), // what they'd like back, or "free"
    status: t.string(), // "open" | "pending" | "done" | "cancelled"
    taker: t.identity().optional(),
    createdAt: t.timestamp(),
  }
);

const spacetimedb = schema({ player, plot, gift, chat, offer });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const AVATARS = ["ShibaInu", "Fox", "Husky", "Deer", "Cow"];
const PALETTE = ['#E2574C', '#3E8ED0', '#F2B33D', '#8E5BD0', '#3FA66B', '#E07BB0', '#2BB3B1', '#C77B3A'];
const FARM_SPACING = 14;

// Farms line both sides of the main road running south from the village square.
function farmOrigin(farm: number) {
  const side = farm % 2 === 0 ? -1 : 1;
  const row = Math.floor(farm / 2);
  return { x: side * 13, z: 16 + row * FARM_SPACING };
}

function me(ctx: Ctx) {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError('join the valley first');
  return p;
}

// Farmers are created by an explicit join from the game client, not on connect, so tools that
// connect (the CLI, dashboards) never spawn ghost avatars.
export const onConnect = spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) ctx.db.player.identity.update({ ...existing, online: true });
});

export const join = spacetimedb.reducer((ctx) => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    if (!existing.online) ctx.db.player.identity.update({ ...existing, online: true });
    return;
  }
  const farm = [...ctx.db.player.iter()].length;
  const o = farmOrigin(farm);
  ctx.db.player.insert({
    identity: ctx.sender,
    name: `Farmer ${farm + 1}`,
    color: PALETTE[farm % PALETTE.length],
    farm,
    x: o.x,
    z: o.z, // in the yard between the farmhouse and the field
    facing: 0,
    online: true,
    rescued: 0,
    avatar: AVATARS[farm % AVATARS.length],
  });
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) ctx.db.player.identity.update({ ...p, online: false });
});

export const setProfile = spacetimedb.reducer({ name: t.string(), color: t.string(), avatar: t.string() }, (ctx, { name, color, avatar }) => {
  const p = me(ctx);
  const clean = name.trim().slice(0, 20) || p.name;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new SenderError('bad color');
  if (avatar && !AVATARS.includes(avatar)) throw new SenderError('unknown avatar');
  ctx.db.player.identity.update({ ...p, name: clean, color, avatar: avatar || p.avatar });
});

export const move = spacetimedb.reducer({ x: t.f32(), z: t.f32(), facing: t.f32() }, (ctx, { x, z, facing }) => {
  const p = me(ctx);
  // The valley is bounded; clamp so a bad client can't walk off the world.
  const lim = 90;
  ctx.db.player.identity.update({ ...p, x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)), facing });
});

const PlotInput = t.object('PlotInput', {
  tileId: t.string(),
  category: t.string(),
  title: t.string(),
  headline: t.string(),
  atStake: t.f64(),
  daysLeft: t.u32(),
  harvestable: t.bool(),
  harvested: t.bool(),
  saved: t.f64(),
});

// Replace the caller's field with the crops from their latest Expire scan.
export const plantFarm = spacetimedb.reducer({ plots: t.array(PlotInput) }, (ctx, { plots }) => {
  const p = me(ctx);
  for (const old of [...ctx.db.plot.owner.filter(ctx.sender)]) ctx.db.plot.id.delete(old.id);
  plots.slice(0, 20).forEach((pi, slot) => {
    ctx.db.plot.insert({ id: 0n, owner: ctx.sender, slot, ...pi });
  });
  const rescued = plots.reduce((sum, pi) => sum + (pi.harvested ? pi.saved : 0), 0);
  ctx.db.player.identity.update({ ...p, rescued });
});

// Recorded after the Expire engine confirms the action (call completed, transfer posted).
export const harvest = spacetimedb.reducer({ tileId: t.string(), saved: t.f64() }, (ctx, { tileId, saved }) => {
  const p = me(ctx);
  const row = [...ctx.db.plot.owner.filter(ctx.sender)].find((r) => r.tileId === tileId);
  if (!row) throw new SenderError('no such crop on your farm');
  if (row.harvested) return;
  ctx.db.plot.id.update({ ...row, harvested: true, saved });
  ctx.db.player.identity.update({ ...p, rescued: p.rescued + saved });
});

export const sendGift = spacetimedb.reducer({ to: t.identity(), amount: t.f64(), note: t.string() }, (ctx, { to, amount, note }) => {
  me(ctx);
  if (!ctx.db.player.identity.find(to)) throw new SenderError('no such farmer');
  if (to.equals(ctx.sender)) throw new SenderError('cannot gift yourself');
  if (!(amount > 0 && amount <= 1000)) throw new SenderError('bad amount');
  ctx.db.gift.insert({ id: 0n, from: ctx.sender, to, amount, note: note.slice(0, 80), opened: false, at: ctx.timestamp });
});

export const openGift = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  const g = ctx.db.gift.id.find(id);
  if (!g || !g.to.equals(ctx.sender)) throw new SenderError('not your gift');
  ctx.db.gift.id.update({ ...g, opened: true });
});

export const say = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  me(ctx);
  const clean = text.trim().slice(0, 140);
  if (!clean) return;
  ctx.db.chat.insert({ id: 0n, sender: ctx.sender, text: clean, at: ctx.timestamp });
  // Keep the log short; this is a speech-bubble feed, not an archive.
  const all = [...ctx.db.chat.iter()].sort((a, b) => Number(a.id - b.id));
  for (const old of all.slice(0, Math.max(0, all.length - 50))) ctx.db.chat.id.delete(old.id);
});

const OFFER_KINDS = ['dining', 'points', 'pass', 'other'];
const MAX_OPEN_OFFERS = 5;

export const postOffer = spacetimedb.reducer(
  { kind: t.string(), title: t.string(), amount: t.f64(), unit: t.string(), want: t.string() },
  (ctx, { kind, title, amount, unit, want }) => {
    me(ctx);
    if (!OFFER_KINDS.includes(kind)) throw new SenderError('unknown kind');
    const cleanTitle = title.trim().slice(0, 60);
    if (!cleanTitle) throw new SenderError('give your offer a title');
    if (!(Number.isFinite(amount) && amount > 0 && amount <= 1_000_000)) throw new SenderError('amount must be positive');
    const cleanUnit = unit.trim().slice(0, 16);
    if (!cleanUnit) throw new SenderError('unit required');
    const cleanWant = want.trim().slice(0, 80) || 'free';
    const open = [...ctx.db.offer.owner.filter(ctx.sender)].filter((o) => o.status === 'open' || o.status === 'pending').length;
    if (open >= MAX_OPEN_OFFERS) throw new SenderError(`at most ${MAX_OPEN_OFFERS} open stalls per farmer`);
    ctx.db.offer.insert({
      id: 0n, owner: ctx.sender, kind, title: cleanTitle, amount, unit: cleanUnit, want: cleanWant,
      status: 'open', taker: undefined, createdAt: ctx.timestamp,
    });
  }
);

export const takeOffer = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  me(ctx);
  const o = ctx.db.offer.id.find(id);
  if (!o) throw new SenderError('no such offer');
  if (o.owner.equals(ctx.sender)) throw new SenderError('cannot take your own offer');
  if (o.status !== 'open') throw new SenderError('offer is not open');
  ctx.db.offer.id.update({ ...o, status: 'pending', taker: ctx.sender });
});

export const confirmSwap = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  me(ctx);
  const o = ctx.db.offer.id.find(id);
  if (!o) throw new SenderError('no such offer');
  if (!o.owner.equals(ctx.sender)) throw new SenderError('only the owner can confirm');
  if (o.status !== 'pending' || !o.taker) throw new SenderError('nothing to confirm');
  ctx.db.offer.id.update({ ...o, status: 'done' });
  if (o.unit === 'USD') {
    ctx.db.gift.insert({
      id: 0n, from: o.owner, to: o.taker, amount: o.amount,
      note: `Swap Market: ${o.title}`.slice(0, 80), opened: false, at: ctx.timestamp,
    });
  }
});

// The owner withdraws an offer; a taker can release a pending take back to the market.
export const cancelOffer = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  me(ctx);
  const o = ctx.db.offer.id.find(id);
  if (!o) throw new SenderError('no such offer');
  if (o.status === 'done' || o.status === 'cancelled') throw new SenderError('offer is closed');
  if (o.owner.equals(ctx.sender)) {
    ctx.db.offer.id.update({ ...o, status: 'cancelled' });
  } else if (o.status === 'pending' && o.taker && o.taker.equals(ctx.sender)) {
    ctx.db.offer.id.update({ ...o, status: 'open', taker: undefined });
  } else {
    throw new SenderError('not your offer');
  }
});
