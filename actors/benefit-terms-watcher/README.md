# Benefit Terms Watcher

An Apify Actor built at Cal Hacks 13.0 for **Benefit Burrow**. It reads public benefit and terms pages (credit card benefit write-ups, plan pages, employer-benefit limit pages) and reports what each page says **today** about the credits and dollar limits you expect. It flags anything that changed or is no longer mentioned.

Benefit Burrow keeps a curated library of plan terms ("Amex Platinum: $200 airline fee credit", "SHIP: $450 deductible"). Issuers change these terms quietly. This Actor re-reads the sources so the library, and the people relying on it, find out.

## Input

```json
{
  "pages": [
    {
      "planId": "amex-platinum-2026",
      "url": "https://www.fool.com/money/credit-cards/articles/how-the-american-express-platinum-card-can-pay-for-its-annual-fee-3-times-over-in-2026",
      "expect": [
        { "key": "airline", "name": "Airline incidental fee credit", "amount": 200 },
        { "key": "clear", "name": "CLEAR+ credit", "amount": 219 }
      ]
    }
  ],
  "useProxy": true,
  "maxRetries": 2
}
```

## Output (default dataset, one item per page)

```json
{
  "planId": "citi-strata-elite-2026",
  "url": "https://thepointsguy.com/credit-cards/citi-strata-elite-statement-credits/",
  "fetchedAt": "2026-10-25T04:14:30.553Z",
  "ok": true,
  "title": "Citi Strata Elite Card statement credits: Earn maximum value - The Points Guy",
  "findings": [
    { "key": "splurge", "name": "Splurge credit", "expected": 200, "seen": 200, "status": "same",
      "snippet": "Splurge: $200 annually for select merchants (exclusions may apply)" }
  ]
}
```

`status` is one of:

- `same`: a sentence about this credit still quotes the expected amount. An annualized total, such as $300 a year for a $25 monthly credit, also counts.
- `changed`: sentences about this credit quote other amounts. `seen` is the closest one.
- `missing`: the page no longer mentions the credit with any amount.

If a page can't be fetched (blocked after retries, timed out, or a PDF), its item has `ok: false`, an `error`, and empty `findings`.

## How it works

`CheerioCrawler` (Crawlee) fetches each page, using Apify Proxy when it runs on the platform. `src/extract.js` then:

1. Turns the HTML into sentences, and joins each table label to the value cell next to it.
2. Finds the sentences that mention each expected credit's distinctive words.
3. Compares the dollar amounts in those sentences with the expected amount.

## Run locally (no Apify account needed)

```bash
cd actors/benefit-terms-watcher
npm install
# Input is read from storage/key_value_stores/default/INPUT.json
node src/main.js
# Results: storage/datasets/default/*.json
```

You can also use the Apify CLI: `npx apify-cli run --input-file=input.json`.

## Deploy to Apify

```bash
npm install -g apify-cli          # or use npx apify-cli ...
apify login                       # paste your API token from https://console.apify.com/settings/integrations
cd actors/benefit-terms-watcher
apify push                        # builds the Actor as <your-username>/benefit-terms-watcher
```

Then point the Benefit Burrow app at it by adding these to `.env.local` and restarting `next dev`:

```
APIFY_TOKEN=apify_api_...
APIFY_TERMS_ACTOR=<your-username>~benefit-terms-watcher
```

The app calls `POST https://api.apify.com/v2/acts/<your-username>~benefit-terms-watcher/run-sync-get-dataset-items`. Without those variables, the app runs the same extraction in-process as a fallback.
