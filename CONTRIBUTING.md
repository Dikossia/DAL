# Contributing to Dal

1. Install Node.js 22.18+ (Node.js 24 LTS recommended). No npm dependencies are needed.
2. Run the server and tests:
   ```bash
   cd server
   npm start   # http://localhost:4000
   npm test
   ```
3. Business rules live in `server/src` (routes, `rules.ts`) and in database migrations (`server/migrations`). A new rule needs an automated test in `server/tests`.
4. A new migration must also be added to `web/src/entry.ts`; then rebuild the browser version with `node web/build.mjs` (requires esbuild).
5. New Russian interface strings need English translations in `web/i18n-en.js`.
6. Open a pull request; CI runs the tests automatically.
