# Expire

Trackers remind. Advisors suggest. **Expire rescues, in the best order, and does it.**

Cal Hacks 13.0. Expire reads your benefits summary, dental treatment plan, EOBs, dining statement and card list, finds money that is about to expire, works out the cheapest way to rescue it, and acts (books the appointment, sends the transfer). A Reviewer has to approve every action first.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine math + Reviewer rules
```

You don't need any keys. Each integration falls back to a deterministic mock, and a badge in the header shows whether it is **live** or **mock**. To go live, copy `.env.example` to `.env.local` and fill in the keys you have.

## Architecture

```
documents ─▶ Extract (Claude) ─▶ Optimize (calculators + Claude) ─▶ Reviewer (rules + Claude) ─▶ board ─▶ tap ─▶ confirm ─▶ dispatch ─▶ ledger
                │ every claim must quote a verbatim span        │ numbers never come from a model       │ a model can tighten a verdict, never loosen it
```

| Piece | File | Notes |
| --- | --- | --- |
| Extract | `lib/engine/extract.ts` | Structured output (`claude-opus-5-5`). A claim whose `source_span` isn't verbatim in a document gets dropped. |
| Optimize | `lib/engine/optimize.ts` | Plain functions do the math (dental year-split search, deductible/out-of-pocket window, dining burn rate). Claude only writes the copy, and only when it agrees with the calculator's pick. |
| Reviewer | `lib/engine/reviewer.ts` | The 6 rules from the build plan. Deterministic checks run first, then Claude. Every verdict goes into the audit trail. |
| Ledger + state | `lib/store.ts` | A local JSON stand-in for the Convex tables (`.data/state.json`). Rule 6: the ledger moves only on a confirmed action. |
| Booking call | `lib/integrations/cartesia.ts` | Cartesia TTS voices the agent line when `CARTESIA_API_KEY` and `CARTESIA_VOICE_ID` are set; otherwise it runs a scripted call. |
| Transfer | `lib/integrations/transfer.ts` | Capital One Nessie transfer when the `NESSIE_*` keys are set; otherwise a simulated x402 settlement. |

## Demo script (numbers come from `lib/documents.ts`)

1. Scan the 5 sample documents. The board shows **$2,287 at stake** in the next 68 days.
2. Medical tile: Dr. Patel already ordered the MRI. Before Jan 1 it costs **$360**; in January, **$1,800**. Saves $1,440.
3. Dental tile: the treatment plan costs **$1,900** if done all this year. Moving one crown to January makes it **$1,550**. Tap Book, confirm, watch the call, and the ledger goes up $350.
4. FSA tile: $612 is under the $640 carryover limit, so nothing is forfeiting. Ask the Reviewer about a sunscreen cart and it **rejects on rule 2**.
5. Dining tile: at $29.50/week you'll spend about $215 by Dec 14. Send the $195 surplus to a classmate.

## Not done yet

- Convex: the ledger is a local JSON file with the same shape. Swap `load`/`save` in `lib/store.ts` after running `npx convex dev`.
- x402: the transfer is simulated. Apify card-terms scrape: the terms are hardcoded in the sample docs.
- Cartesia: the call is TTS only. A real outbound phone call needs a Cartesia agent and a phone number.
