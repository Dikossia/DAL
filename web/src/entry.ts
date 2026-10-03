// All of Dal in the browser: the same server code (routes, rules, SQLite database) runs in the page.
// Used when the site is not served by a local server (e.g. on Vercel).
import { openDb, migrate } from '../../server/src/db.ts';
import { createRouter, HttpError, forbidden, notFound, type Ctx } from '../../server/src/http.ts';
import { mapError, type App } from '../../server/src/app.ts';
import { tokenFrom, userFromToken, createLoginLimiter } from '../../server/src/auth.ts';
import { seed } from '../../server/src/seed.ts';
import { registerAuth } from '../../server/src/routes/auth.ts';
import { registerCatalog } from '../../server/src/routes/catalog.ts';
import { registerLearning } from '../../server/src/routes/learning.ts';
import { registerStudioCourses } from '../../server/src/routes/studio-courses.ts';
import { registerStudioForecasts } from '../../server/src/routes/studio-forecasts.ts';
import { registerStudioOther } from '../../server/src/routes/studio-other.ts';
import { registerModeration } from '../../server/src/routes/moderation.ts';
import { registerProducts } from '../../server/src/routes/products.ts';
import { registerBlockchain } from '../../server/src/routes/blockchain.ts';
import { registerCertificateJobs } from '../../server/src/certificates.ts';
import { registerPaymentJobs } from '../../server/src/orders.ts';
import { createChain } from '../../server/src/chain/service.ts';
import { vfs, hooks, setFile } from './shims/fs.ts';
import { state } from './shims/sqlite.ts';
import m001 from '../../server/migrations/001_init.sql';
import m002 from '../../server/migrations/002_products.sql';
import m003 from '../../server/migrations/003_solana.sql';
import m004 from '../../server/migrations/004_reviews_chain.sql';
import m005 from '../../server/migrations/005_chain.sql';

const SEED_VIDEO = '/server/seed-assets/demo-lesson.mp4';
const IDB = 'dal-browser', VERSION = 1;

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, VERSION);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('files'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = <T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> =>
  new Promise((res, rej) => { const t = db.transaction(store, mode), r = fn(t.objectStore(store)); t.oncomplete = () => res((r as IDBRequest | undefined)?.result); t.onerror = () => rej(t.error); });

let app: App, store: IDBDatabase;

export async function init(SQL: any) {
  state.SQL = SQL;
  store = await idb();
  const saved = await tx<Uint8Array | undefined>(store, 'kv', 'readonly', s => s.get('db'));
  // Uploaded files (covers, photos, videos) are kept in IndexedDB next to the database.
  await new Promise<void>((res, rej) => {
    const r = store.transaction('files').objectStore('files').openCursor();
    r.onsuccess = () => { const c = r.result; if (!c) return res(); vfs.set(String(c.key), c.value); c.continue(); };
    r.onerror = () => rej(r.error);
  });
  hooks.onSet = (p, v) => { if (p.startsWith('/storage/')) tx(store, 'files', 'readwrite', s => s.put(v, p)); };
  hooks.onDelete = p => { if (p.startsWith('/storage/')) tx(store, 'files', 'readwrite', s => s.delete(p)); };
  vfs.set('/server/migrations/001_init.sql', m001);
  vfs.set('/server/migrations/002_products.sql', m002);
  vfs.set('/server/migrations/003_solana.sql', m003);
  vfs.set('/server/migrations/004_reviews_chain.sql', m004);
  vfs.set('/server/migrations/005_chain.sql', m005);
  const video = await fetch(SEED_VIDEO).then(r => r.ok ? r.blob() : new Blob([])).catch(() => new Blob([]));
  vfs.set(SEED_VIDEO, video);

  state.initial = saved ? new Uint8Array(saved) : null;
  const db = openDb('/data/dal.db');
  migrate(db, '/server/migrations');
  if (!saved) {
    const [dal, studio] = await Promise.all(['data.js', 'studio-data.js'].map(f => fetch('/' + f).then(r => r.text())));
    vfs.set('/site/data.js', dal); vfs.set('/site/studio-data.js', studio);
    db.tx(() => seed(db, '/site', '/server/seed-assets'));
  }
  // Demo mode: DAL's devnet issuer wallet signs in the browser; on a real deployment this runs on the server.
  const chain = createChain(db, { enabled: true, cluster: 'devnet', publicUrl: location.origin });
  app = { db, router: createRouter(), storageDir: '/storage', siteDir: '/site', seedDir: '/server/seed-assets', loginLimiter: createLoginLimiter(), chain, exposeRecoveryCodes: true };
  for (const reg of [registerAuth, registerCatalog, registerLearning, registerStudioCourses, registerStudioForecasts, registerStudioOther, registerModeration, registerProducts, registerBlockchain, registerCertificateJobs, registerPaymentJobs]) reg(app);
  await save();
  // Background worker: writes queued records to Solana; the site never waits for it.
  setInterval(async () => { try { if (await chain.tick()) await save(); } catch (e) { console.warn('Solana worker:', (e as any)?.message || e); } }, 5000);
}

async function save() { const bytes = state.current.export(); await tx(store, 'kv', 'readwrite', s => s.put(bytes, 'db')); }

export async function reset() { store?.close(); await new Promise(r => { const q = indexedDB.deleteDatabase(IDB); q.onsuccess = q.onerror = q.onblocked = r; }); }

export interface LocalResponse { status: number; data?: unknown; blob?: Blob; type?: string }

// Same order as the HTTP server: route → auth and role → body → handler → readable error.
export async function handle(method: string, rawUrl: string, headers: Record<string, string> = {}, body?: unknown): Promise<LocalResponse> {
  const url = new URL(rawUrl, 'http://local');
  const h: Record<string, string> = {}; for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v);
  const req: any = { method, headers: h, url: url.pathname + url.search, __blob: body instanceof Blob ? body : undefined };
  const res: any = { headersSent: false, status: 200, headers: {}, writeHead(s: number, hd: any) { this.status = s; this.headers = hd || {}; this.headersSent = true; }, setHeader() {}, end() {}, destroy() {}, on() {} };
  try {
    const m = app.router.match(method, url.pathname);
    if (m === null) throw notFound('Такого адреса нет');
    if (m === 'method') throw new HttpError(405, 'method_not_allowed', 'Метод не поддерживается для этого адреса');
    const { route, params } = m;
    const ctx: Ctx = { req, res, params, query: url.searchParams, body: {}, user: userFromToken(app.db, tokenFrom(req, url)) };
    if (route.auth) {
      if (!ctx.user) throw new HttpError(401, 'unauthorized', 'Нужно войти в аккаунт');
      if (Array.isArray(route.auth) && !route.auth.includes(ctx.user.role)) throw forbidden();
    }
    if (!route.raw && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) ctx.body = body && typeof body === 'object' && !(body instanceof Blob) ? JSON.parse(JSON.stringify(body)) : {};
    const result = await route.handler(ctx);
    if (method !== 'GET') await save();
    if (ctx.handled) return { status: res.status, blob: res.__blob, type: res.headers['Content-Type'] };
    const status = ctx.status ?? (result === undefined ? 204 : 200);
    return { status, data: result === undefined ? undefined : JSON.parse(JSON.stringify(result)) };
  } catch (e) {
    const err = mapError(e);
    if (err.status >= 500) console.error(e);
    return { status: err.status, data: { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } } };
  }
}
