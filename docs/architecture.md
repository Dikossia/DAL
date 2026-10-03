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
| `web/solana.js` | Phantom connection, Memo transaction building, on-chain verification, header wallet button |
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
- Solana anchors are written once and never change.

Most rules are enforced twice: in the API and with a database trigger or unique constraint.

## Solana

The transaction is built manually in `web/solana.js` (no `@solana/web3.js`): a legacy transaction with one instruction to the Memo program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`, signed and sent by Phantom (`signAndSendTransaction`). Verification calls `getTransaction` (jsonParsed) on the public Devnet RPC and compares the memo with the record shown on the site.

### Forecast record

```
DAL forecast v1 | id=<id> | <TICKER> UP|DOWN | start=<price> | target=<price> | deadline=<YYYY-MM-DD> | published=<ISO time> | rationale_sha256=<hex>
```

Signed by the expert: Dal Studio → Forecasts → "Anchor on Solana". Endpoint `POST /studio/forecasts/:id/anchor { signature, wallet, cluster }`, table `forecast_anchors` (migration `003_solana.sql`).

### Course review record

```
DAL review v1 | id=<id> | course=<courseId> | rating=<1-5> | completed=true | created=<ISO time> | text_sha256=<hex>
```

Signed by the student who wrote the review: course page → your review → "Anchor on Solana". The text itself stays off-chain, only its SHA-256. Endpoint `POST /reviews/:id/anchor { signature, wallet, cluster }` (author only, once), table `review_anchors` (migration `004_reviews_chain.sql`).

### Verification

Any visitor clicks "Anchored on Solana · verify": the browser loads the transaction by its signature, extracts the memo and compares it with the record built from the data on the site. A match means the forecast terms or the review haven't been changed since anchoring. The blockchain confirms immutability, not correctness: a forecast's result is determined by the closing price on the deadline.

## Tests

`cd server && npm test` — 42 scenarios with `node --test`: roles, purchases, lessons, reviews, lesson Q&A, refunds, products, booking, clubs, moderation, forecasts and Solana anchors. CI runs them on every push (`.github/workflows/ci.yml`).
