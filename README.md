**# Dal — A Knowledge Marketplace for Investing with Verifiable Forecasts on Solana**

**\*\*Dal\*\*** — a platform where investors and experts sell their educational, analytical, and consulting products, while students choose an expert based on a transparent history of their results. Expert forecasts are recorded on the **\*\*Solana\*\*** blockchain: an unsuccessful forecast cannot be rewritten retroactively, and anyone can verify it.

\> **\*\*Demo:\*\*** \`VERCEL_LINK\` — opens in a browser, no installation required.
\> Login: \`student@dal.local\` (student), \`aliya@dal.local\` (expert), \`moderator@dal.local\` (moderator). Password for all accounts: \`dal-demo-2026\`.
\> Language: **\*\*EN / RU\*\*** button in the website header (or \`?lang=en\` in the URL). / _\*Switch to Russian with the _**\*\*RU\*\***_ button in the header or \`?lang=ru\`.\*_

*\*English summary: Dal is a marketplace where investment experts sell courses, 1:1 consultations, paid clubs/chats and research notes. Every expert forecast can be anchored on Solana (devnet) via a Memo transaction signed in Phantom, so students can verify that the terms were never rewritten. The whole backend (Node.js + SQLite) also runs fully in the browser, so the live demo needs no server.\**

![Home](docs/screenshots/1-home.png)

**## Problem**

\- A private investor pays for courses, signals, and private chats, but **\*\*cannot verify\*\*** how good an expert really is: unsuccessful forecasts can be deleted, and the terms can be “clarified” retroactively.
\- An expert needs several platforms at once: courses on one platform, consultations in a messenger, a club in Telegram, and manual payments. Clients and reputation are scattered.

**## Solution**

One platform with four directions and a unified expert rating:

\| Direction | What the expert sells | What the student gets |
\|---|---|---|
\| **\*\*Courses\*\*** | Video lessons: beginner, advanced, practical workshops | Free lessons before purchase, lessons in order, progress |
\| **\*\*Work with an Expert\*\*** | One-time consultation, session package, long-term support | Booking a time slot from the expert’s schedule, call link, cancellation up to 24 hours in advance |
\| **\*\*Community\*\*** | Private club, chat with the expert | 30-day subscription with renewal, live participant chat |
\| **\*\*Ideas & Analytics\*\*** | Investment ideas, reviews, **\*\*forecasts (signals)\*\*** | Preview before purchase, full text after; forecast journal with results |

**\*\*Expert rating\*\*** is calculated separately for each direction based on student reviews; the overall rating is the average across directions. Forecast statistics are displayed separately from educational reviews.

**## Where Solana Comes In**

The forecast is the key feature that distinguishes an expert. Therefore, its terms are recorded on the blockchain:

1\. The expert publishes a forecast: ticker, direction, price at publication, target, verification date, and rationale. The forecast can no longer be modified or deleted on the server (this is enforced by database triggers).
2\. The **\*\*“Anchor to Solana”\*\*** button creates a **\*\*Memo\*\*** program transaction containing the forecast terms and the SHA-256 hash of the rationale. The expert signs it using the **\*\*Phantom\*\*** wallet, and the transaction is sent to the **\*\*Solana Devnet\*\***.
3\. The forecast receives the **\*\*“Anchored on Solana · verify”\*\*** label. Any student can click it: the website reads the transaction from a public Solana node and compares the recorded terms with those displayed on the website. A match confirms that the terms were not rewritten after publication.

The transaction is built manually, without libraries (\`web/solana.js\`), so no server is required for anchoring and verification. The blockchain confirms the immutability of the terms, but not the correctness of the forecast: the result is determined by the closing price on the verification date.

![Forecast anchoring on Solana](docs/screenshots/6-solana-anchor.png)

**\*\*To try it:\*\*** install [Phantom]\([https://phantom.app](https://phantom.app)\), enable Devnet (Settings → Developer Settings → Testnet mode), and get test SOL from [faucet.solana.com]\([https://faucet.solana.com](https://faucet.solana.com)\). Then log in as \`aliya@dal.local\` → Dal Studio → “Forecasts” → “Anchor to Solana”.

**## What Already Works**

**\*\*Student\*\*** — catalog of all directions with horizontal shelves, search, purchases (payment is currently simulated), video lessons and progress tracking, consultation booking and cancellation, clubs with chat and renewal, paid-access ideas, reviews, refunds according to the rules, favorites, expert ratings, expert page with social media and ratings by direction, and Solana forecast verification.

![Work with an Expert](docs/screenshots/2-experts.png)
![Consultation booking](docs/screenshots/3-booking.png)

**\*\*Expert (Dal Studio)\*\*** — courses with video upload and a checklist before moderation; consultations, clubs, chats, ideas, and reviews (7 product types) with price, duration, meeting packages, subscription period, and access conditions; recurring weekly schedule slots and student bookings; club chat; forecasts with limits and Solana anchoring; students, reviews and replies, income with platform commission, profile with social media and photo; expert rights page.

![Expert schedule](docs/screenshots/5-studio-schedule.png)

**\*\*Moderator\*\*** — course review (including video viewing) and product moderation before publication, complaints about reviews, changes to expert names and experience, expert verification, and forecast results.

![Moderation](docs/screenshots/7-moderation.png)

**\*\*Rules enforced by the server:\*\***
\- a forecast cannot be modified or deleted, no more than 5 open forecasts, one open forecast per ticker;
\- a purchased course or product cannot be deleted, only hidden;
\- a review cannot be deleted, only hidden by a moderator after a complaint;
\- a booked schedule slot cannot be deleted;
\- course refunds are available within 14 days if less than 20% has been completed; meeting refunds are available within 14 days as long as no meeting has been scheduled;
\- only verified experts can sell and publish forecasts;
\- experts cannot see students’ contact information.

**## How It Works**

\`\`\`
Student website (index.html, app.js)   Dal Studio (studio.html, studio.js)   Login (login.html)
                 \                              |                          /
                  api.js ── normal mode ──> Node.js server (server/) + SQLite + video files
                     \\
                      ── “server in browser” mode ──> web/engine.js: same server code + SQLite (WebAssembly)
                                                      data in IndexedDB, videos and images via sw.js
web/solana.js ──> Phantom (signature) ──> Solana Devnet: Memo transaction with forecast terms
\`\`\`

\- **\*\*Server\*\*** — Node.js + TypeScript with no external dependencies, built-in SQLite, 40 automated tests (\`server/\`, details in \`server/README.md\`).
\- **\*\*“Server in browser” mode\*\*** — for the Vercel demo. Server code from \`server/src\` is bundled into \`web/engine.js\`, the database runs through [sql.js]\([https://github.com/sql-js/sql.js](https://github.com/sql-js/sql.js)\) (SQLite in WebAssembly, MIT). It activates automatically if the site is opened somewhere other than \`localhost\`. Data is stored in the reviewer’s browser; the “Reset Data” button restores the demo dataset.
\- **\*\*Frontend\*\*** — HTML, CSS, and JavaScript without frameworks, responsive layout, light and dark themes, Russian and English versions (\`web/i18n.js\`, \`web/i18n-en.js\`).

**## Running**

**\*\*In a browser (as on Vercel):\*\*** open the demo link. To publish your own copy — import the repository into [vercel.com]\([https://vercel.com](https://vercel.com)\) (Framework: Other, no build command).

**\*\*With a server on your computer:\*\***
1\. Install Node.js 22.18 or newer (Node.js 24 LTS recommended).
2\. Run:
   \`\`\`bash
   cd server
   npm start          # first launch automatically creates the database with demo data
   npm test           # automated tests
   npm run reset      # restore demo data
   \`\`\`
3\. Open <[http://localhost:4000](http://localhost:4000)> (website), <[http://localhost:4000/studio.html](http://localhost:4000/studio.html)> (Dal Studio), <[http://localhost:4000/docs](http://localhost:4000/docs)> (API documentation).

After changing the server code, rebuild the browser version with \`node web/build.mjs\` (esbuild is required).

**## Structure**

\| Path | Contents |
\|---|---|
\| \`index.html\`, \`app.js\`, \`styles.css\` | Student website |
\| \`studio.html\`, \`studio.js\`, \`studio.css\`, \`studio-data.js\` | Dal Studio and moderation, expert rights |
\| \`login.html\`, \`login.js\` | Login and registration |
\| \`api.js\` | API client for both modes |
\| \`server/\` | Server: routes, rules, database migrations, demo data, tests |
\| \`web/\` | Server in browser (\`engine.js\`, \`dal-local.js\`, sql.js) and Solana (\`solana.js\`) |
\| \`sw\.js\` | Serves videos, covers, and photos in “server in browser” mode |
\| \`data.js\` | Directions, categories, and demo content |
\| \`Dal.html\`, \`Studio.html\`, \`demo/\` | Early standalone mockups |
\| \`docs/screenshots/\` | Screenshots for the README |

**## What’s Next**

\- Card and Kaspi payments with receipts, expert payouts; USDC payments with automatic splitting of the amount between the expert and the platform in a single Solana transaction.
\- Automatic verification of forecast results using a price oracle (Pyth) instead of manual moderator input.
\- Non-transferable course completion certificates on Solana and digital club passes valid for the subscription period.
\- **“Verified Purchase”** label next to reviews.
\- Notifications, Kazakh interface language, deployment of the server in Kazakhstan.

**## Prototype Limitations**

Demo experts, prices, reviews, and forecasts are fictional; profile photos are illustrative. Payments are not connected: access is granted without charging money. Forecasts are anchored on the Solana Devnet test network. The platform does not provide investment advice.

Photos: Unsplash. Font: Manrope (SIL OFL). Icons: Lucide (ISC). SQLite in the browser: sql.js (MIT).