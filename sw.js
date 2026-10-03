// Service worker for the "server in the browser" demo mode: serves lesson videos, covers and photos stored by the page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
const MEDIA = /^\/(lessons\/[^/]+\/video|media\/(covers|avatars)\/[^/]+)$/;
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET' || !MEDIA.test(u.pathname)) return;
  e.respondWith(serve(e, u));
});
async function ask(client, path) {
  const ch = new MessageChannel();
  const reply = new Promise(r => { ch.port1.onmessage = m => r(m.data); });
  client.postMessage({ type: 'dal-media', path }, [ch.port2]);
  return Promise.race([reply, new Promise(r => setTimeout(() => r({ status: 504 }), 20000))]);
}
async function serve(e, u) {
  let client = e.clientId ? await self.clients.get(e.clientId) : null;
  if (!client) client = (await self.clients.matchAll({ type: 'window' }))[0];
  if (!client) return new Response('', { status: 503 });
  const d = await ask(client, u.pathname + u.search);
  if (!d || !d.blob) return new Response('', { status: d?.status || 404 });
  const blob = d.blob, type = d.type || blob.type || 'application/octet-stream';
  const range = e.request.headers.get('range');
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, blob.size - Number(m[2])), end = m[1] && m[2] ? Number(m[2]) : blob.size - 1;
    end = Math.min(end, blob.size - 1);
    if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
    return new Response(blob.slice(start, end + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) } });
  }
  return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(blob.size) } });
}
