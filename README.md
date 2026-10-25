# Benefit Burrow

**$100B+ a year in earned benefits goes unclaimed.** Benefit Burrow is a cozy multiplayer pixel-art farming town where every benefit you're about to lose grows as a crop, and AI agents find the money, fill your claims and shop your perks. Nothing is sent or bought without your approval.

Built at Cal Hacks 13.0. **[Watch the trailer and see it in action →](https://haile-teshome.github.io/benefit-burrow/)**

## What it does

- **Create your farmer.** Tell the game your employer, health plan, cards and school. Ruth, an alpaca in reading glasses and the town's AI reviewer, looks up your employer's, insurer's and school's published benefits online. Every fact comes with its source page and quote, and you confirm each one.
- **Plant your benefits** from 29 sourced plans (401(k) match, PTO, FSA/HSA, stipends, premium card credits, points and miles, tuition and education credits, FAFSA), or upload a benefits guide, a statement or a photo of one.
- **Ruth fills the claim.** She drafts the form, attaches matching receipts, and flags the fields only you can fill. You press Submit; she never sends anything herself. Money counts as rescued only when it arrives.
- **The Benefit Bazaar.** Name something you need and pick an unspent benefit; shopkeeper agents search live listings across stores, Ruth checks coverage, fit and quality, and the shopkeeper calls you with the pick.
- **A living town:** villagers who remember you, a first-person 3D fishing minigame, households, voice check-ins, and an overnight Autopilot that prepares claims while you sleep.

## Built with

| Technology | What it's used for |
| --- | --- |
| **Next.js + React** | The game, its interface and its API routes |
| **Canvas 2D** | The hand-drawn pixel-art town, villagers and crops |
| **three.js** | The first-person fishing minigame |
| **SpacetimeDB** | Real-time multiplayer: farms, movement, harvests, gifts, chat |
| **Convex** | Saved games, households, Ruth's audit trail, scheduled Autopilot runs |
| **Claude** (Opus, Sonnet, Haiku) | Reading documents with verbatim sources, Ruth's reviews, shopping agents, benefit lookups, villager conversations |
| **Ollama** (Qwen 3.5 4B) | Local model for light tasks, with a Claude fallback |
| **Apify** | Live product listings and store prices for the shopping agents |
| **x402** (Base Sepolia) | Shopkeeper agents sell their quotes for testnet USDC |
| **Cartesia** | Villager voices and speech-to-text check-ins |
| **Capital One Nessie** | Sandbox bank data and moving rescued money to savings |

## Run it

Requires Node 20+ and the [SpacetimeDB CLI](https://spacetimedb.com/install).

```bash
npm install
cp .env.example .env.local        # optional: add the keys you have; everything else falls back
npm run valley:server             # terminal 1: local SpacetimeDB on :3100
spacetime server add valley --url http://127.0.0.1:3100 --no-fingerprint   # once
npm run valley:publish            # publish the multiplayer world
npm run dev                       # terminal 2: open http://localhost:3000/valley
```

Open `http://localhost:3000/valley?farmer=2` in another window to play as a second farmer. `npm run valley:reset` wipes the world before a demo.

**Controls:** WASD or click to walk · E to interact · L your claims · H your farm · Enter to chat · M to mute.

**Tests and checks**

```bash
npm test                                                   # engine math, Ruth's rules, fishing, shopping picks
npx tsx --env-file=.env.local scripts/e2e-benefits.ts      # plants all 29 plans and checks how each resolves
npx tsx --env-file=.env.local scripts/time-plant.ts        # times each stage of planting a farm
npm run check:keys                                         # tests each configured key (never prints them)
```

## How it fits together

```
your details / documents ─▶ Extract (Claude; every number must quote its source) ─▶ Optimize (calculators)
   ─▶ Ruth's review (written rules + Claude) ─▶ crops on your farm ─▶ Ruth fills the claim ─▶ you submit ─▶ money arrives ─▶ rescued
```

| Piece | Where |
| --- | --- |
| Game and UI | `components/valley/` (`Valley.tsx`, `World2D.tsx`, `Onboarding.tsx`, `Bazaar.tsx`, `Fishing.tsx`) |
| Town map and terrain | `lib/valley/world.ts`, `lib/valley/pixel/` |
| Plan library (sourced terms) | `lib/library/` |
| Extract, Optimize, Ruth's review | `lib/engine/` |
| Claim forms and where they're filed | `lib/claims/` |
| Shopping agents and price feeds | `lib/market/`, `lib/integrations/shopping.ts` |
| Ruth's benefit lookup | `lib/discover.ts`, `lib/findings.ts` |
| Multiplayer world module | `valley-server/src/index.ts` |
| Saved state, Convex functions | `lib/store.ts`, `convex/` |

Sources for the $100B+ figure are in [`IMPACT_SOURCES.md`](IMPACT_SOURCES.md).

## What's simulated

- The other side of phone calls is scripted, and submitting to most providers opens their real page or a drafted email for you to send.
- x402 runs on the Base Sepolia testnet only.
- Card and plan terms are as published in 2026; they change, so the app links each one to its source.

`mobile/` holds an earlier Expo companion prototype.

## Credits

3D models in `public/models/` are CC0: the [KayKit Medieval Hexagon](https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0) and Adventurers packs by Kay Lousberg, and the [Quaternius Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html). Licenses are included alongside them. Fonts: Jersey 10 and Atkinson Hyperlegible (Google Fonts, OFL).
