// In-memory virtual file system in the browser: uploaded files are persisted to IndexedDB.
export const vfs = new Map<string, Blob | string>();
export const hooks: { onSet?: (p: string, v: Blob | string) => void; onDelete?: (p: string) => void } = {};
const norm = (p: string) => ('/' + String(p)).replace(/\/+/g, '/');
const enoent = (p: string) => { const e: any = new Error(`ENOENT: ${p}`); e.code = 'ENOENT'; return e; };
export function setFile(p: string, v: Blob | string) { vfs.set(norm(p), v); hooks.onSet?.(norm(p), v); }
export function existsSync(p: string) { return vfs.has(norm(p)); }
export function statSync(p: string) {
  const v = vfs.get(norm(p)); if (v === undefined) throw enoent(p);
  return { size: typeof v === 'string' ? new Blob([v]).size : v.size, isFile: () => true, isDirectory: () => false };
}
export function readFileSync(p: string) { const v = vfs.get(norm(p)); if (typeof v !== 'string') throw enoent(p); return v; }
export function readdirSync(dir: string) {
  const d = norm(dir).replace(/\/$/, '') + '/';
  return [...vfs.keys()].filter(k => k.startsWith(d) && !k.slice(d.length).includes('/')).map(k => k.slice(d.length));
}
export function mkdirSync() { /* каталоги не нужны */ }
export function rmSync(p: string) { const k = norm(p); if (vfs.delete(k)) hooks.onDelete?.(k); }
export function renameSync(a: string, b: string) { const v = vfs.get(norm(a)); if (v === undefined) throw enoent(a); rmSync(a); setFile(b, v); }
export function createWriteStream(p: string) { return { __path: norm(p) }; }
export function createReadStream(p: string) { return { pipe(res: any) { res.__blob = vfs.get(norm(p)); res.end?.(); } }; }
export default { existsSync, statSync, readFileSync, readdirSync, mkdirSync, rmSync, renameSync, createWriteStream, createReadStream };
