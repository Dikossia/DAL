# Dal — Investment Knowledge Marketplace with Verifiable Forecasts on Solana

[![CI](https://github.com/Dikossia/DAL/actions/workflows/ci.yml/badge.svg)](https://github.com/Dikossia/DAL/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-14F195.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF)](https://solana.com)
[![Hackathon](https://img.shields.io/badge/Colosseum-2026-14F195)](https://colosseum.org)

> A marketplace where investment experts in Kazakhstan sell courses, 1:1 consultations, paid clubs and research notes — and students choose an expert by a **verifiable track record**. Expert forecasts and course reviews are anchored on **Solana**, so nobody can rewrite them after the fact.

[Live Demo](https://dal-kappa.vercel.app/?lang=en) · [Video Walkthrough](#resources) · [Docs](docs/)

**Demo accounts** (password for all: `dal-demo-2026`): `student@dal.local` — student, `aliya@dal.local` — expert, `moderator@dal.local` — moderator. The demo runs fully in the browser — no installation needed.

---

![Dal home page](docs/screenshots/en/1-home.png)

---

## Submission to 2026 Solana National Hackathon

| Name | Role | Contact |
|------|------|---------|
| Diana Abdrakhmanova | Founder & Developer (KBTU, Computer Science) | [GitHub](https://github.com/Dikossia) |

---

## Problem and Solution

### 1. Expert results can't be verified
- **Problem:** A private investor pays for courses, signals and private chats but can't check how good an expert really is: failed forecasts get deleted, and terms get "clarified" after the fact.
- **Dal:** Every forecast is locked on publication (ticker, direction, start price, target, deadline, rationale hash) and anchored on Solana with a Memo transaction. Anyone can compare the terms on the site with the on-chain record.

### 2. Reviews can be faked or edited
- **Problem:** Course reviews on typical platforms can be written before taking the course, edited later or quietly removed.
- **Dal:** A course review can be left **only after completing all lessons**, only **once**, and can't be edited (database triggers). The author can anchor it on Solana: rating, course and the SHA-256 of the text go on-chain.

### 3. An expert's business is scattered across platforms
- **Problem:** Courses on one site, consultations in a messenger, the club in Telegram, payments by hand — clients and reputation are spread out.
- **Dal:** One platform with four directions — **Courses**, **Work with an Expert** (consultations, packages, mentorship with schedule booking), **Community** (clubs and chats with subscriptions), **Ideas & Analytics** (paid notes and forecasts) — and one expert rating.

### 4. Reputation mixes teaching and investing
- **Problem:** A great teacher isn't necessarily a great forecaster, and vice versa.
- **Dal:** Ratings are calculated separately for each direction from student reviews; forecast statistics are shown separately from teaching reviews.

---

## Why Solana

- **Cost** — anchoring a forecast or review costs a fraction of a cent, so it can be done for every record, not just a few
- **Speed** — the transaction is confirmed in seconds, while the expert or student is still on the page
- **Public verification** — any visitor's browser reads the transaction from a public RPC node; no trust in Dal's server is required
- **Wallet UX** — Phantom signs a Memo transaction in one click; the transaction is built manually in `web/solana.js` without extra libraries
- **Next steps fit the ecosystem** — USDC payments with automatic revenue split, Pyth price feeds for automatic forecast resolution, non-transferable completion certificates

![Forecast anchoring on Solana](docs/screenshots/en/6-solana-anchor.png)

---

## Summary of Features

- Catalog of four directions with search, shelves and expert pages with per-direction ratings
- Video lessons in order, progress tracking, refunds by the rules (within 14 days, less than 20% completed)
- **Questions and comments under each lesson**, answered by the course expert
- **Course review only after completion, one per course, immutable, anchorable on Solana**
- Consultation booking from the expert's weekly schedule, cancellation up to 24 hours ahead
- Clubs and chats with 30-day subscriptions, renewal and live chat
- Paid ideas with a preview before purchase
- **Forecasts anchored on Solana** with a "verify" button for every visitor
- "Connect wallet" button: Phantom address, Devnet balance, 1 test SOL airdrop, link to Solana Explorer
- Dal Studio for experts: courses with video upload, 7 product types, schedule, forecasts, students, reviews, income
- Moderation: courses and products before publication, review complaints, expert verification, forecast results
- English and Russian interface, light and dark themes, responsive layout

| | |
|---|---|
| ![Work with an Expert](docs/screenshots/en/2-experts.png) | ![Consultation booking](docs/screenshots/en/3-booking.png) |
| ![Expert schedule](docs/screenshots/en/5-studio-schedule.png) | ![Moderation](docs/screenshots/en/7-moderation.png) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| On-chain | Solana Devnet · Memo program · Phantom wallet |
| Solana client | Plain JavaScript (`web/solana.js`) · manual transaction building · JSON-RPC `getTransaction` |
| Frontend | HTML · CSS · JavaScript, no frameworks · Lucide icons |
| Backend | Node.js 22.18+ · TypeScript (type stripping) · zero dependencies |
| Database | SQLite (`node:sqlite`) · migrations · triggers for immutability rules |
| Browser mode | Same server code bundled with esbuild · sql.js (SQLite in WebAssembly) · IndexedDB · Service Worker |
| Hosting | Vercel (static) |
| Testing | `node --test` — 42 scenarios on roles and rules · GitHub Actions |

---

## Architecture

```
┌───────────────────┐  ┌──────────────────┐  ┌──────────────┐
│ Student site      │  │ Dal Studio       │  │ Login        │
│ index.html, app.js│  │ studio.html/.js  │  │ login.html   │
└─────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘
          └──────────────┬──────┴───────────────────┘
                         ▼
                  ┌─────────────┐   local mode   ┌─────────────────────────┐
                  │   api.js    │───────────────▶│ Node.js server/ +       │
                  └──────┬──────┘                │ SQLite + video files    │
                         │ browser mode (Vercel) └─────────────────────────┘
                         ▼
             ┌────────────────────────────┐
             │ web/engine.js              │  same server code,
             │ sql.js + IndexedDB + sw.js │  runs in the browser
             └────────────────────────────┘

┌───────────────┐  sign  ┌──────────┐  Memo tx  ┌───────────────┐
│ web/solana.js │───────▶│ Phantom  │──────────▶│ Solana Devnet │
└───────┬───────┘        └──────────┘           └───────┬───────┘
        │          verify: getTransaction(signature)    │
        └───────────────────────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for the full component breakdown and the format of Solana records.

---

## Quick Start

**Prerequisites:** Node.js 22.18+ (Node.js 24 LTS recommended). No other dependencies.

```bash
# Clone the repository
git clone https://github.com/Dikossia/DAL
cd DAL/server

# Start the server (the first launch creates the database with demo data)
npm start

# Run tests
npm test

# Restore demo data
npm run reset
```

Then open <http://localhost:4000> (student site), <http://localhost:4000/studio.html> (Dal Studio), <http://localhost:4000/docs> (API docs).

**Try Solana:** install [Phantom](https://phantom.app), enable Devnet (Settings → Developer Settings → Testnet mode), get test SOL at [faucet.solana.com](https://faucet.solana.com) or with the "Get 1 test SOL" button in the header.
- Forecast: log in as `aliya@dal.local` → Dal Studio → Forecasts → **Anchor on Solana**.
- Review: log in as `student@dal.local` → course "Portfolio in practice: open review" (already completed in the demo data) → **Leave a review** → **Anchor on Solana**.

After changing server code, rebuild the browser version: `node web/build.mjs` (requires esbuild). To publish your own copy, import the repository into [Vercel](https://vercel.com) (Framework: Other, no build command).

---

## Roadmap

- [x] Marketplace with four directions and per-direction expert ratings
- [x] Dal Studio for experts and moderation
- [x] Forecasts anchored on Solana Devnet with public verification
- [x] Course reviews after completion: immutable, anchored on Solana
- [x] Lesson Q&A with expert answers
- [x] Full backend running in the browser (Vercel demo)
- [ ] Card and Kaspi payments, expert payouts
- [ ] USDC payments with automatic expert / platform split in one Solana transaction
- [ ] Automatic forecast resolution with Pyth price feeds
- [ ] Non-transferable course completion certificates and club passes on Solana
- [ ] Mainnet, Kazakh language, servers in Kazakhstan

Full roadmap: [docs/roadmap.md](docs/roadmap.md)

---

## Resources

- [Live Application](https://dal-kappa.vercel.app/?lang=en)
- [Video Demo](#) <!-- TODO: add the demo video link -->
- [Project Presentation](#) <!-- TODO: add the presentation link -->
- [Server and API documentation](server/README.md)

---

## Prototype Limitations

Demo experts, prices, reviews and forecasts are fictional; profile photos are illustrative. Payments are not connected: access is granted without charging money. Records are anchored on the Solana Devnet test network. The platform does not provide investment advice.

Photos: Unsplash. Font: Manrope (SIL OFL). Icons: Lucide (ISC). SQLite in the browser: sql.js (MIT).

---

## License

MIT — see [LICENSE](LICENSE)
