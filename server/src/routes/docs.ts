import type { App } from '../app.ts';
import { sendHtml } from '../http.ts';
import { RULES } from '../rules.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ROLE_NAMES: Record<string, string> = { student: 'ученик', expert: 'эксперт', moderator: 'модератор' };

// Документация собирается из самих маршрутов, поэтому не расходится с кодом.
export function registerDocs(app: App) {
  const { router } = app;
  const list = () => router.routes.filter(r => r.group !== 'Служебное' || r.path === '/health').map(r => ({
    method: r.method, path: r.path, group: r.group, summary: r.summary, body: r.body ?? null,
    auth: !r.auth ? 'public' : r.auth === 'user' ? 'any user' : r.auth.join(', ')
  }));

  router.add({ method: 'GET', path: '/docs.json', group: 'Служебное', summary: 'Список методов API в JSON.', handler: () => ({ rules: RULES, routes: list() }) });

  router.add({
    method: 'GET', path: '/docs', group: 'Служебное', summary: 'Документация API.',
    handler: ctx => {
      const groups = new Map<string, ReturnType<typeof list>>();
      for (const r of list()) { if (!groups.has(r.group)) groups.set(r.group, []); groups.get(r.group)!.push(r); }
      const who = (a: string) => a === 'public' ? 'без входа' : a === 'any user' ? 'любой вошедший' : a.split(', ').map(x => ROLE_NAMES[x]).join(', ');
      const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dal API</title>
<style>
:root{--bg:#fafbf9;--fg:#242b28;--muted:#6f7872;--line:#e6eae5;--surface:#fff;--accent:#2f5d62;--get:#2f63a5;--post:#22704f;--put:#94600f;--patch:#7a4fb0;--delete:#ab5442;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--bg:#161c19;--fg:#e4eae5;--muted:#9ca79f;--line:#323c35;--surface:#1d2420;--accent:#9cc9cc;--get:#9cc0ec;--post:#91caaa;--put:#e9c37f;--patch:#c9b0ee;--delete:#e6ae9e;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:980px;margin:0 auto;padding:40px 20px 60px}h1{font-size:30px;margin:0 0 6px}h2{font-size:19px;margin:36px 0 10px}
p{color:var(--muted);margin:0 0 10px}code{font:12.5px ui-monospace,Consolas,monospace;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:1px 5px}
.route{display:grid;grid-template-columns:70px minmax(0,1fr);gap:4px 14px;padding:13px 0;border-top:1px solid var(--line)}
.m{font:700 11px ui-monospace,monospace;padding-top:3px}.GET{color:var(--get)}.POST{color:var(--post)}.PUT{color:var(--put)}.PATCH{color:var(--patch)}.DELETE{color:var(--delete)}
.path{font:600 13.5px ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.who{font-size:11px;color:var(--muted);margin-left:8px;font-family:system-ui}
.sum{grid-column:2;color:var(--fg)}.body{grid-column:2;font-size:12px;color:var(--muted)}
a{color:var(--accent)}.box{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin:18px 0}
</style></head><body><main>
<h1>Dal API</h1><p>Первый этап бэкенда: вход и роли, каталог, обучение, кабинет эксперта (курсы, видео, прогнозы, отзывы, доход), модерация.</p>
<div class="box"><p><b>Как вызывать.</b> Ответы в JSON. Войдите через <code>POST /auth/login</code> и передавайте токен в заголовке <code>Authorization: Bearer &lt;токен&gt;</code>. Ошибки приходят как <code>{ "error": { "code", "message", "details" } }</code>.</p>
<p>Видео загружается методом <code>PUT</code>: тело запроса — сам файл. Сайты-прототипы открываются здесь же: <a href="/">сайт для учеников</a>, <a href="/studio.html">Dal Studio</a>.</p></div>
${[...groups].map(([g, rs]) => `<h2>${esc(g)}</h2>${rs.map(r => `<div class="route"><span class="m ${r.method}">${r.method}</span><div class="path">${esc(r.path)}<span class="who">${esc(who(r.auth))}</span></div><div class="sum">${esc(r.summary)}</div>${r.body ? `<div class="body">Тело: <code>${esc(r.body)}</code></div>` : ''}</div>`).join('')}`).join('')}
</main></body></html>`;
      sendHtml(ctx.res, html);
      ctx.handled = true;
    }
  });
}
