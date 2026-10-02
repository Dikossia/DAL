const normalize = (p: string) => {
  const abs = p.startsWith('/'), out: string[] = [];
  for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
  return (abs ? '/' : '') + out.join('/');
};
export const sep = '/';
export const join = (...p: string[]) => normalize(p.filter(Boolean).join('/'));
export const resolve = (...p: string[]) => { let r = ''; for (const s of p) r = s.startsWith('/') ? s : r + '/' + s; return normalize(r.startsWith('/') ? r : '/' + r) || '/'; };
export const dirname = (p: string) => { const n = normalize(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); };
export const basename = (p: string) => normalize(p).split('/').pop() || '';
export const extname = (p: string) => { const b = basename(p), i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
export default { sep, join, resolve, dirname, basename, extname };
