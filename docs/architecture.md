# Dal — Architecture

## Components

| Path | Contents |
|---|---|
| `index.html`, `app.js`, `styles.css` | Student site: catalog, purchases, lessons with Q&A, booking, clubs, ideas, reviews, forecasts |
| `studio.html`, `studio.js`, `studio.css`, `studio-data.js` | Dal Studio for experts, moderation, expert rights page |
| `login.html`, `login.js` | Login and registration |
| `api.js` | API client; the same calls work in local-server mode and in browser mode |
| `server/` | Node.js server: routes, rules, migrations, demo data, tests ([server/README.md](../server/README.md)) |
| `web/engine.js`, `web/src/` | The same server code bundled for the browser (esbuild + shims) |
| `web/dal-local.js`, `sw.js` | Browser-mode switch; Service Worker serves videos, covers and photos from IndexedDB |
| `server/src/chain/` | Solana layer without an SDK: base58, Ed25519 (`ed25519.ts`), transaction building and PDAs (`tx.ts`), Memo / Token / ATA / Metaplex Core instructions (`programs.ts`), JSON-RPC (`rpc.ts`), built-in wallets (`wallets.ts`), the record queue (`service.ts`) |
| `server/src/certificates.ts`, `server/src/orders.ts` | Certificates (issue, NFT mint job) and orders (price breakdown, card and USDC payments, on-chain payment check) |
| `web/solana.js` | Reading records and NFTs from Solana in the browser, optional Phantom connection and USDC signing |
| `web/certificate.js`, `verify.html`, `verify.js` | Certificate card, PDF (canvas → JPEG → PDF, any alphabet) and the public verification page |
| `web/i18n.js`, `web/i18n-en.js` | English interface (dictionary keyed by Russian strings) |
| `data.js` | Directions, categories and demo content |
| `Dal.html`, `demo/` | Early standalone mockups |

## Two run modes

1. **Local server** — `cd server && npm start`. Node.js 22.18+ with built-in SQLite (`node:sqlite`), zero npm dependencies. Videos are stored on disk and streamed with HTTP Range.
2. **Server in the browser** (Vercel demo) — `web/engine.js` contains the same routes and rules from `server/src`, the database runs on [sql.js](https://github.com/sql-js/sql.js) (SQLite in WebAssembly) and is saved to IndexedDB. Activated automatically on any host other than `localhost`; `?engine=browser|server` forces a mode. The "Reset data" button restores the demo dataset.

Rebuild after changing server code: `node web/build.mjs`.

## Rules enforced by the server

- A forecast can't be modified or deleted; at most 5 open forecasts, one open forecast per ticker.
- A course review — only after completing all lessons, one per course; rating and text can't be changed.
- Reviews are not deleted, only hidden by a moderator after a complaint.
- Lesson questions — only course students, the course expert and moderators.
- A purchased course or product can't be deleted, only hidden; a booked schedule slot can't be deleted.
- Course refund within 14 days if less than 20% is completed; session refund within 14 days while none is scheduled.
- Only verified experts sell and publish forecasts; experts can't see students' contacts.
- Solana records are written once and never change; built-in wallets and issued certificates can't be changed or deleted.
- A course certificate is issued only when every lesson is completed.
- The network fee (5 ₸) is charged once per paid order that uses the blockchain and per published prediction.

Most rules are enforced twice: in the API and with a database trigger or unique constraint.

## Solana

### How it stays invisible

1. A business action (publish a prediction, complete a course, pay) is saved in SQLite right away.
2. A row is added to `chain_jobs`. A background worker (every 5 s; on the server and in the browser demo) builds the transaction, signs it and sends it. Failed attempts are retried with backoff; if a transaction is not confirmed in 2 minutes it is sent again (an NFT keeps the same address, so a retry never mints twice).
3. On confirmation the worker stores the signature and the actual cost (fee + storage deposit, from the issuer's balance change) and updates the business record (forecast anchor, certificate NFT address, order paid).

Users never see a wallet prompt:
- **DAL issuer wallet** (`DAL_SOLANA_SECRET`) is the fee payer and the NFT update authority.
- **Built-in wallets**: one per account, created on first use, the seed encrypted with the platform key (`DAL_WALLET_KEY`; in production a KMS/HSM). They co-sign predictions and own certificate NFTs. A password reset doesn't touch them; the owner can export the key (password required).

### Prediction terms (Memo, signed by DAL and the expert's built-in wallet)

```
DAL forecast v2 | id=<id> | <TICKER> UP|DOWN | start=<price> | target=<price> | deadline=<YYYY-MM-DD> | rule=close(<TICKER>, <date>) >= <target> USD | published=<ISO time> | expert=<wallet> | rationale_sha256=<hex>
```

### Prediction result (Memo, after the terms are confirmed)

```
DAL forecast result v1 | id=<id> | close=<price> | outcome=MET|NOT MET | rule=<rule> | resolved=<ISO time> | forecast_tx=<signature of the terms>
```

The moderator only enters the closing price; the outcome is computed by the rule fixed at publication. Older forecasts can still be anchored by the expert's Phantom (`POST /studio/forecasts/:id/anchor`, `DAL forecast v1`).

### Certificate (Metaplex Core NFT + Memo in one transaction)

```
DAL certificate v1 | id=DAL-XXXX-XXXX | course=<id> | title=<course> | student=<First L.> | holder_sha256=<sha256("<id>|<full name lowercased>")> | lessons=<n> | completed=<date> | expert=<First L.> | nft=<asset address>
```

The NFT (`CreateV1`, program `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`) is owned by the student's built-in wallet; its update authority is the DAL issuer; its URI is `cert-metadata.json`. `verify.html?c=<id>&nft=<asset>&tx=<signature>` checks that the record exists, was paid by the issuer, the NFT is a Core asset with the issuer as update authority, and lets anyone compare a name with `holder_sha256`.

### USDC payment (one transaction, DAL as fee payer, the buyer signs in Phantom)

`CreateIdempotent` token accounts for the expert and DAL → `TransferChecked` buyer → expert (price − commission) → `TransferChecked` buyer → DAL (commission + network fee) → Memo `DAL order v1 | id=…`. DAL signs first; the buyer's wallet adds its signature; the worker checks the confirmed transaction (no error, the order memo, exact token balance changes) before opening access.

### Measured costs (devnet, 3 Oct 2026)

| Record | Lamports | SOL | ≈ ₸ (1 SOL = 53,500 ₸) |
|---|---|---|---|
| Memo with 2 signatures | 10,000 | 0.00001 | 0.5 |
| Core NFT + Memo | 2,988,280 | 0.00299 | 160 |
| New associated token account | 2,039,280 | 0.00204 | 110 (once per wallet) |

## Tests

`cd server && npm test` — 48 scenarios with `node --test`: roles, purchases, lessons, reviews, lesson Q&A, refunds, products, booking, clubs, moderation, forecasts, Solana records (with a fake Solana node that checks every Ed25519 signature), certificates, the price breakdown, USDC payment checks and account recovery. CI runs them on every push (`.github/workflows/ci.yml`).
