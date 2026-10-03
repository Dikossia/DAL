import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import type { Role } from './rules.ts';

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
export const notFound = (what = 'Не найдено') => new HttpError(404, 'not_found', what);
export const forbidden = (msg = 'Недостаточно прав') => new HttpError(403, 'forbidden', msg);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);

export interface User { id: string; email: string; name: string; role: Role }

export interface Ctx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  user: User | null;
  status?: number;
  handled?: boolean;
}

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  group: string;
  summary: string;
  auth?: 'user' | Role[];
  body?: string;     // request body description for /docs
  raw?: boolean;     // body is not parsed as JSON (file uploads)
  handler: (ctx: Ctx) => unknown | Promise<unknown>;
}
interface Compiled extends RouteDef { re: RegExp; keys: string[] }

export function createRouter() {
  const routes: Compiled[] = [];
  return {
    routes,
    add(def: RouteDef) {
      const keys: string[] = [];
      const re = new RegExp('^' + def.path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^\\/]+)'; }) + '\\/?$');
      routes.push({ ...def, re, keys });
    },
    match(method: string, pathname: string): { route: Compiled; params: Record<string, string> } | 'method' | null {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { route: r, params };
      }
      return pathMatched ? 'method' : null;
    }
  };
}
export type Router = ReturnType<typeof createRouter>;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-File-Name, X-Duration',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
  'Access-Control-Max-Age': '600'
};

export function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  if (res.headersSent) return;
  if (status === 204 || data === undefined) { res.writeHead(204, CORS); res.end(); return; }
  const body = JSON.stringify(data);
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

export function sendHtml(res: http.ServerResponse, html: string) {
  res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
  res.end(html);
}

async function readJson(req: http.IncomingMessage, limit = 1024 * 1024): Promise<any> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'too_large', 'Слишком большой запрос');
    chunks.push(chunk);
  }
  if (!size) return {};
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) throw new HttpError(415, 'unsupported_type', 'Ожидается JSON (Content-Type: application/json)');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'bad_json', 'Некорректный JSON'); }
}

// Receives the request body as a file: streamed, with a size limit.
export async function receiveFile(req: http.IncomingMessage, dest: string, maxBytes: number): Promise<number> {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) throw new HttpError(413, 'too_large', `Файл больше допустимого размера (${Math.round(maxBytes / 1024 ** 2)} МБ)`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  let size = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new HttpError(413, 'too_large', `Файл больше допустимого размера (${Math.round(maxBytes / 1024 ** 2)} МБ)`));
      else cb(null, chunk);
    }
  });
  try { await pipeline(req, counter, fs.createWriteStream(tmp)); }
  catch (e) { fs.rmSync(tmp, { force: true }); throw e instanceof HttpError ? e : new HttpError(400, 'upload_failed', 'Загрузка прервалась'); }
  if (!size) { fs.rmSync(tmp, { force: true }); throw new HttpError(400, 'empty_file', 'Файл пустой'); }
  fs.renameSync(tmp, dest);
  return size;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.m4v': 'video/x-m4v'
};

// Serves a file with Range support so video can be seeked.
export function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, type?: string) {
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { throw notFound('Файл не найден'); }
  if (!stat.isFile()) throw notFound('Файл не найден');
  const mime = type || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers: Record<string, string | number> = { ...CORS, 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=0' };
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start = m && m[1] ? Number(m[1]) : NaN, end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (m && !m[1] && m[2]) { start = Math.max(0, stat.size - Number(m[2])); end = stat.size - 1; }
    if (!m || isNaN(start) || start > end || start >= stat.size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` }); res.end(); return;
    }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

// Prototype sites (Dal.html, Studio.html and sources) are served from the project folder.
function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, siteDir: string, pathname: string, blocked: string[]): boolean {
  const rel = pathname === '/' ? '/index.html' : pathname;
  let decoded: string;
  try { decoded = decodeURIComponent(rel); } catch { return false; }
  if (decoded.split('/').some(p => p.startsWith('.'))) return false;
  const file = path.resolve(siteDir, '.' + decoded);
  // Paths are case-insensitive on Windows: compare case-insensitively, otherwise /Server/... would bypass the block.
  const key = (p: string) => process.platform === 'win32' ? p.toLowerCase() : p;
  if (!key(file).startsWith(key(path.resolve(siteDir) + path.sep))) return false;
  if (blocked.some(d => key(file) === key(d) || key(file).startsWith(key(d + path.sep)))) return false;
  const ext = path.extname(file).toLowerCase();
  if (!MIME[ext] || ['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  sendFile(req, res, file);
  return true;
}

export interface ServerOptions {
  router: Router;
  authenticate: (req: http.IncomingMessage, url: URL) => User | null;
  mapError: (e: unknown) => HttpError;
  siteDir?: string;
  blockedDirs?: string[];
  log?: boolean;
}

export function createHttpServer(o: ServerOptions): http.Server {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url || '/', 'http://localhost');
    res.on('finish', () => { if (o.log) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`); });
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    try {
      const m = o.router.match(req.method || 'GET', url.pathname);
      if (m === null) {
        if ((req.method === 'GET' || req.method === 'HEAD') && o.siteDir && serveStatic(req, res, o.siteDir, url.pathname, o.blockedDirs || [])) return;
        throw notFound('Такого адреса нет. Список методов: /docs');
      }
      if (m === 'method') throw new HttpError(405, 'method_not_allowed', 'Метод не поддерживается для этого адреса');
      const { route, params } = m;
      const ctx: Ctx = { req, res, params, query: url.searchParams, body: {}, user: o.authenticate(req, url) };
      if (route.auth) {
        if (!ctx.user) throw new HttpError(401, 'unauthorized', 'Нужно войти в аккаунт');
        if (Array.isArray(route.auth) && !route.auth.includes(ctx.user.role)) throw forbidden();
      }
      if (!route.raw && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) ctx.body = await readJson(req);
      const result = await route.handler(ctx);
      if (!ctx.handled && !res.headersSent) sendJson(res, ctx.status ?? (result === undefined ? 204 : 200), result);
    } catch (e) {
      const err = o.mapError(e);
      if (err.status >= 500) console.error(e);
      if (!res.headersSent) {
        if (err.status === 413) res.setHeader('Connection', 'close');
        sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
      } else res.destroy();
    }
  });
}
