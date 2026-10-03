// Английская версия интерфейса: переводит текст на странице по словарю web/i18n-en.js.
// Переключатель EN / RU в шапке; выбор запоминается. ?lang=en или ?lang=ru в адресе тоже работает.
(() => {
  'use strict';
  const KEY = 'dal-lang';
  let lang = 'en';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'ru') localStorage.setItem(KEY, q);
    lang = localStorage.getItem(KEY) || 'en';  // по умолчанию английский; русский — кнопкой RU или ?lang=ru
  } catch (_) { /* хранилище недоступно */ }
  const set = l => { try { localStorage.setItem(KEY, l); } catch (_) { /* ничего */ } location.reload(); };
  window.DalLang = { lang, set };
  const toggle = () => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lang-toggle'; b.textContent = lang === 'en' ? 'RU' : 'EN';
    b.title = lang === 'en' ? 'Русская версия' : 'English version'; b.setAttribute('aria-label', b.title);
    b.onclick = () => set(lang === 'en' ? 'ru' : 'en');
    const host = document.querySelector('.header-actions');
    if (host) host.prepend(b); else { b.classList.add('floating'); document.body.append(b); }
    const st = document.createElement('style');
    st.textContent = '.lang-toggle{font:700 11px Manrope,Arial,sans-serif;letter-spacing:.04em;min-width:36px;height:30px;border:1px solid var(--line,#ddd);border-radius:16px;background:var(--surface,#fff);color:var(--text,#222);cursor:pointer;padding:0 10px}.lang-toggle:hover{border-color:var(--accent,#2f5d62);color:var(--accent,#2f5d62)}.lang-toggle.floating{position:fixed;top:14px;right:14px;z-index:95}';
    document.head.append(st);
  };
  document.addEventListener('DOMContentLoaded', toggle);
  if (lang !== 'en') return;

  document.documentElement.lang = 'en';
  const CYR = /[А-Яа-яЁё]/;
  const NUM = /\d+(?:[.,]\d+)?/g;
  const MONTHS = { 'января': 'January', 'февраля': 'February', 'марта': 'March', 'апреля': 'April', 'мая': 'May', 'июня': 'June', 'июля': 'July', 'августа': 'August', 'сентября': 'September', 'октября': 'October', 'ноября': 'November', 'декабря': 'December',
    'янв.': 'Jan', 'февр.': 'Feb', 'мар.': 'Mar', 'апр.': 'Apr', 'июн.': 'Jun', 'июл.': 'Jul', 'авг.': 'Aug', 'сент.': 'Sep', 'окт.': 'Oct', 'нояб.': 'Nov', 'дек.': 'Dec' };
  const DAYS = { 'понедельник': 'Monday', 'вторник': 'Tuesday', 'среда': 'Wednesday', 'четверг': 'Thursday', 'пятница': 'Friday', 'суббота': 'Saturday', 'воскресенье': 'Sunday', 'пн': 'Mon', 'вт': 'Tue', 'ср': 'Wed', 'чт': 'Thu', 'пт': 'Fri', 'сб': 'Sat', 'вс': 'Sun' };
  const fallback = s => s
    .replace(/(янв\.|февр\.|мар\.|апр\.|июн\.|июл\.|авг\.|сент\.|окт\.|нояб\.|дек\.|января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/gi, m => MONTHS[m.toLowerCase()] || m)
    .replace(/(^|[\s,(])(понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?=[\s,]|$)/gi, (_, a, d) => a + (DAYS[d.toLowerCase()] || d))
    .replace(/ в (\d{1,2}:\d{2})/g, ', $1').replace(/\s?г\.$/, '')
    .replace(/\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b( (\d{4}))?/g, (_, d, m, y, yy) => `${m} ${d}${yy ? ', ' + yy : ''}`);
  const cache = new Map();
  function tr(raw) {
    if (!raw || !CYR.test(raw)) return null;
    const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
    const t = raw.replace(/\s+/g, ' ').trim();
    if (cache.has(t)) { const c = cache.get(t); return c == null ? null : lead + c + tail; }
    const D = window.DAL_I18N_EN || {};
    let out = D[t];
    if (out == null) {
      const nums = t.match(NUM) || [], key = t.replace(NUM, '{n}');
      const tpl = D[key];
      if (tpl != null) { let i = 0; out = tpl.replace(/\{n\}/g, () => { const v = nums[i++] ?? ''; return /^\d+,\d+$/.test(v) ? v.replace(',', '.') : v; }); }
    }
    if (out == null) {
      // Подписи с подставленным именем или разделом.
      const m = /^(Меню|Открыть раздел|Профиль|Обложка|Ответ на отзыв|Удалить урок|Переместить урок) ?:? ?«?(.+?)»?$/.exec(t);
      const P = { 'Меню': 'Menu: ', 'Открыть раздел': 'Open ', 'Профиль': 'Profile: ', 'Обложка': 'Cover ', 'Ответ на отзыв': 'Reply to review: ', 'Удалить урок': 'Delete lesson ', 'Переместить урок': 'Move lesson ' };
      if (m && P[m[1]]) { const x = D[m[2]] ?? fallback(m[2]); out = P[m[1]] + x; }
    }
    if (out == null) {
      const g = /^(Доброе утро|Добрый день|Добрый вечер), (.+)$/.exec(t);
      if (g) out = { 'Доброе утро': 'Good morning', 'Добрый день': 'Good afternoon', 'Добрый вечер': 'Good evening' }[g[1]] + ', ' + (D[g[2]] ?? g[2]);
    }
    if (out == null) { const f = fallback(t); out = f !== t ? f : null; }
    cache.set(t, out);
    return out == null ? null : lead + out + tail;
  }
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  function walk(root) {
    if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v != null && v !== root.nodeValue) root.nodeValue = v; return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1 && ['SCRIPT', 'STYLE'].includes(root.tagName)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; const list = [];
    while ((n = w.nextNode())) list.push(n);
    for (const x of list) { if (x.parentElement && ['SCRIPT', 'STYLE'].includes(x.parentElement.tagName)) continue; const v = tr(x.nodeValue); if (v != null && v !== x.nodeValue) x.nodeValue = v; }
    const els = root.querySelectorAll ? root.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')) : [];
    for (const e of [root.nodeType === 1 ? root : null, ...els]) {
      if (!e || !e.getAttribute) continue;
      for (const a of ATTRS) { const v = e.getAttribute(a); const t = v && tr(v); if (t != null && t !== v) e.setAttribute(a, t); }
    }
  }
  const obs = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') walk(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); const t = v && tr(v); if (t != null && t !== v) m.target.setAttribute(m.attributeName, t); }
      else m.addedNodes.forEach(walk);
    }
    const tt = tr(document.title); if (tt != null && tt !== document.title) document.title = tt;
  });
  obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', () => walk(document.body));
  // Системные окна подтверждения тоже переводим.
  const oc = window.confirm.bind(window); window.confirm = m => oc(tr(m) ?? m);
})();
