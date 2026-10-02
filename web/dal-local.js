// Режим «сервер в браузере»: если сайт открыт не с локального сервера Dal (например, на Vercel),
// весь код сервера работает прямо на странице, а данные хранятся в браузере (IndexedDB).
// Включить вручную: ?engine=browser, вернуть сервер: ?engine=server.
(() => {
  'use strict';
  let forced = null;
  try {
    const q = new URLSearchParams(location.search).get('engine');
    if (q === 'browser' || q === 'server') localStorage.setItem('dal-engine', q);
    forced = localStorage.getItem('dal-engine');
  } catch (_) { /* хранилище недоступно */ }
  const onServer = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const enabled = forced ? forced === 'browser' : !onServer;
  if (!enabled) {
    navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.active?.scriptURL.endsWith('/sw.js') && r.unregister())).catch(() => {});
    window.DalLocal = { enabled: false };
    return;
  }
  const base = '/web/';
  const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Не удалось загрузить ' + src)); document.head.append(s); });

  // Видео, обложки и фото запрашивает сам браузер (<video>, <img>), поэтому их отдаёт сервис-воркер, спрашивая страницу.
  async function serviceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      if (!navigator.serviceWorker.controller) await Promise.race([new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })), new Promise(r => setTimeout(r, 4000))]);
    } catch (e) { console.warn('Сервис-воркер недоступен: видео и загруженные картинки не покажутся', e); }
  }

  const ready = (async () => {
    await Promise.all([load(base + 'sql-wasm.js'), load(base + 'engine.js')]);
    const SQL = await window.initSqlJs({ locateFile: f => base + f });
    await window.DalEngine.init(SQL);
    await serviceWorker();
  })();
  ready.catch(e => console.error('Dal в браузере не запустился', e));

  navigator.serviceWorker?.addEventListener('message', async e => {
    if (e.data?.type !== 'dal-media' || !e.ports[0]) return;
    try { await ready; const r = await window.DalEngine.handle('GET', e.data.path, {}); e.ports[0].postMessage({ status: r.status, blob: r.blob || null, type: r.type || '' }); }
    catch (_) { e.ports[0].postMessage({ status: 500 }); }
  });

  window.DalLocal = {
    enabled: true, ready,
    async handle(method, path, headers, body) { await ready; return window.DalEngine.handle(method, path, headers, body); },
    async reset() {
      try { localStorage.removeItem('dal-token'); } catch (_) { /* ничего */ }
      await window.DalEngine?.reset?.();
      location.href = '/';
    }
  };

  // Заметная плашка: проверяющий сразу понимает, где хранятся данные, и может начать заново.
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.className = 'local-badge';
    b.innerHTML = '<span>Демо: сервер работает в вашем браузере</span><button type="button">Сбросить данные</button>';
    b.querySelector('button').onclick = () => { if (confirm('Удалить все изменения и вернуть демо-данные?')) window.DalLocal.reset(); };
    document.body.append(b);
    const st = document.createElement('style');
    st.textContent = '.local-badge{position:fixed;left:12px;bottom:12px;z-index:90;display:flex;gap:10px;align-items:center;font:600 11px Manrope,Arial,sans-serif;background:#1f2a26;color:#e9f2ed;padding:8px 10px 8px 14px;border-radius:20px;box-shadow:0 6px 20px #0003}.local-badge button{font:inherit;color:#9cd6b8;background:none;border:0;cursor:pointer;text-decoration:underline}@media(max-width:760px){.local-badge span{display:none}}';
    document.head.append(st);
  });
})();
