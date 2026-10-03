# Dal: backend

Русская версия: [README.ru.md](README.ru.md)

A Node.js and TypeScript server with **no external dependencies**: no `npm install` needed. The database is SQLite, built into Node.js. It is stored as a single file in `server/data`. Uploaded videos and covers are in `server/storage`.

## Running on Windows

1. Install **Node.js 24 LTS** from [nodejs.org](https://nodejs.org). Node.js 22.18 or newer also works.
2. Open PowerShell in the `server` folder:
   ```powershell
   cd "$env:USERPROFILE\Desktop\DAL\server"
   npm start
   ```
3. On first run the database is created and filled with demo data automatically. Then open:
   - <http://localhost:4000/docs> — API documentation;
   - <http://localhost:4000/> — the student site;
   - <http://localhost:4000/studio.html> — Dal Studio.

To stop the server: `Ctrl+C`.

### Demo accounts

All accounts share one password: `dal-demo-2026`.

| Role | Email | Who |
|---|---|---|
| Moderator | `moderator@dal.local` | Dal moderator |
| Expert | `aliya@dal.local` | Aliya Nurlanova (her dashboard is shown in Dal Studio) |
| Expert | `arman@dal.local`, `timur@dal.local` | Arman Sadykov, Timur Kim |
| Student | `student@dal.local` | Daryn Asylbek |
| Students | `aruzhan@`, `madina@`, `daniyar@`… `@dal.local` | 11 more students with purchases, progress and reviews |

### Commands

| Command | What it does |
|---|---|
| `npm start` | Starts the server |
| `npm run dev` | Starts the server and restarts it when code changes |
| `npm run reset` | **Deletes the database and uploaded files** and recreates the demo data |
| `npm test` | Runs the automated tests: 42 scenarios covering roles and rules |
| `npm run moderator -- email password Name` | Creates another moderator |

Settings (port, paths) are set in the `.env` file. See `.env.example` for a template.

## What the server does

- **Login and roles:** student, expert, moderator. Passwords are stored as scrypt hashes, and the database holds only a hash of the login token. Password guessing is limited: 10 failures per 15 minutes.
- **Catalog:** courses with search, filtering and sorting, course pages, experts with statistics, a public forecast journal.
- **Student:** purchase without payment (the price is fixed at purchase time), lessons in order, progress, a course "in progress", questions and comments under each lesson (the course expert answers there), a course review only after completing all lessons, refunds.
- **Sessions, clubs, ideas (stage 2):** one product model for the 7 types in the schema.
  - Consultations, classes, mentoring: a session package, the expert's schedule slots, booking, cancellation (student — 24 hours ahead, expert — any time), the call link only for those who booked, buying a new package.
  - Clubs and chats: a 30-day subscription (the term is set by the expert), renewal adds to the term, after expiry a new subscription starts from today; the chat is for members with an active subscription only.
  - Ideas and reviews: free ones are open to everyone, paid ones show the first 400 characters before purchase.
  - Product reviews and complaints, product moderation, income from renewals.
- **Teacher rating** per direction and overall — the arithmetic mean of the directions that have ratings. Expert social links (a link or @handle), profile photos for everyone, favorites in the account.
- **Solana:** every forecast has a text record (memo) with its terms and the hash of its rationale; the expert anchors it with a Solana Devnet transaction via Phantom (`web/solana.js`), the server stores the transaction link (`POST /studio/forecasts/:id/anchor`), and anyone can verify it. A course review is anchored the same way: the memo holds the review id, course, rating and the SHA-256 of the text; the student signs it in Phantom (`POST /reviews/:id/anchor`, migration `004_reviews_chain.sql`).
- **Server in the browser:** all the code in `src/` is bundled into `../web/engine.js` (`node ../web/build.mjs`) and runs on the page with SQLite in WebAssembly — this is how the site works on Vercel without a server.
- **Video:** upload as a file up to 4 GB (MP4, MOV, WEBM) with streaming writes to disk. Playback with seeking. Who can watch: free lessons — everyone, the rest — buyers, the author and the moderator.
- **Expert dashboard:**
  - courses: draft → moderation → catalog → hidden;
  - modules and lessons, covers;
  - forecasts;
  - students (without contact details);
  - replies to reviews and complaints;
  - income after commission;
  - profile.
- **Moderation:**
  - approving or returning courses with a comment;
  - complaints about reviews;
  - changes to experts' names and experience;
  - expert verification;
  - forecast outcomes.

## Expert rules enforced by the server

They match the "Rights" page in Dal Studio. The most important ones are also protected in the database itself: they cannot be bypassed even by going around the API.

| Rule | Where it is enforced |
|---|---|
| A published forecast cannot be changed or deleted; the outcome is set once | API + database triggers |
| One open forecast per ticker, at most 5 open forecasts | API + unique index |
| A course that has been purchased cannot be deleted | API + database trigger |
| Reviews are not deleted (moderation only hides them) | API + database trigger |
| A course under moderation cannot be edited | API |
| A lesson or video cannot be deleted from a published course, only replaced | API |
| No more than 2 free lessons | API |
| Only verified experts can sell courses and publish forecasts | API |
| An expert's name and experience change only through moderation | API |
| An expert cannot see students' email or phone numbers | API |
| Course refund — within 14 days and if less than 20% is completed | API |
| Sessions refund — within 14 days, while none is scheduled; subscriptions and materials are not refunded | API |
| A booked schedule slot cannot be deleted, only the booking cancelled | API + database trigger |
| A student cancels a booking no later than 24 hours ahead | API |
| A product that has been purchased cannot be deleted | API + database trigger |
| A product review is not deleted | API + database trigger |
| A club chat is for members with an active subscription only | API |
| Anchoring a forecast in Solana is done once and does not change | API + database trigger |
| A course review — only after completing all lessons, one per course, its rating and text cannot be changed | API + unique constraint + database trigger |
| Anchoring a review in Solana — only by its author, once, does not change | API + database trigger |
| Lesson questions — only course students, the course expert and moderators | API |

## Structure

```
server/
  bin/dal.mjs          launch: Node.js version check, reading .env
  src/cli.ts           start / reset / moderator commands
  src/app.ts           application assembly, readable database errors
  src/http.ts          router, JSON, file upload and serving with Range
  src/db.ts            SQLite and migrations
  src/auth.ts          passwords, tokens, login attempt limiting
  src/validate.ts      input validation
  src/rules.ts         all platform limits in one place
  src/courses.ts       shared course and access logic
  src/products.ts      consultations, clubs, ideas: access, checklist, cards
  src/experts.ts       teacher ratings by direction, photos
  src/routes/          API routes by section
  src/seed.ts          demo data (taken from ../data.js and ../studio-data.js)
  migrations/          database schema
  tests/               automated tests
  seed-assets/         demo video for lessons from the demo data
```

## Sites

The server serves the sites from the `DAL` folder, and they work through the API:

- `/` — the student site: all four directions, purchase, lessons, booking sessions, club chats, ideas, reviews, refunds, rating, forecasts, favorites.
- `/login.html` — login and sign-up (student or expert).
- `/studio.html` — Dal Studio for experts (courses, sessions, clubs and ideas, forecasts, students, reviews, income, profile); for moderators — the moderation queue.

After a code update, the new database schema is applied automatically on `npm start`. To see the new demo consultations, clubs and ideas, run `npm run reset` (this deletes your test data).

## What's next

- **Notifications.** Email or Telegram about bookings, cancellations and new club messages.
- **AI teacher description.** Requires a Claude API key.
- **Payments and payouts.** Purchases currently go through without charging money.
- **Quote source.** Needed for automatic forecast outcomes; for now the moderator enters the closing price.
- **Migration to PostgreSQL.** Will be needed when moving to a server. The schema in `migrations/` is written so that the move is mechanical: what changes is described in a comment at the top of the file.
- **Video.** On a server, it is better to store videos in cloud storage (S3-compatible) and transcode them for streaming.
