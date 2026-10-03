// English UI: translates page text using the web/i18n-en.js dictionary.
// EN / RU switch in the header; the choice is remembered. ?lang=en or ?lang=ru in the URL also works.
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
  // Cyrillic → Latin for person names that are not in the dictionary.
  const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'q', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i' };
  const translit = w => [...w].map(c => { const l = c.toLowerCase(), r = LAT[l]; if (r == null) return c; return c === l ? r : r.charAt(0).toUpperCase() + r.slice(1); }).join('');
  const NAME = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)? [А-ЯЁ](?:[а-яё]+(?:-[А-ЯЁ][а-яё]+)?|\.)$/; // two words: First Last / First L.
  const ROLE_EN = { 'ученик': 'student', 'эксперт': 'expert', 'модератор': 'moderator' };

  // One lookup without splitting: dictionary, number templates, labels, greetings, dates.
  function base(t) {
    const D = window.DAL_I18N_EN || {};
    let out = D[t];
    if (out == null) {
      const nums = t.match(NUM) || [], key = t.replace(NUM, '{n}');
      const tpl = D[key];
      if (tpl != null) { let i = 0; out = tpl.replace(/\{n\}/g, () => { const v = nums[i++] ?? ''; return /^\d+,\d+$/.test(v) ? v.replace(',', '.') : v; }); }
    }
    if (out == null) {
      // Labels with an interpolated name or section.
      const m = /^(Меню|Открыть раздел|Профиль|Обложка|Ответ на отзыв|Удалить урок|Переместить урок) ?:? ?«?(.+?)»?$/.exec(t);
      const P = { 'Меню': 'Menu: ', 'Открыть раздел': 'Open ', 'Профиль': 'Profile: ', 'Обложка': 'Cover ', 'Ответ на отзыв': 'Reply to review: ', 'Удалить урок': 'Delete lesson ', 'Переместить урок': 'Move lesson ' };
      if (m && P[m[1]]) { const x = D[m[2]] ?? fallback(m[2]); out = P[m[1]] + x; }
    }
    if (out == null) {
      const g = /^(Доброе утро|Добрый день|Добрый вечер), (.+)$/.exec(t);
      if (g) out = { 'Доброе утро': 'Good morning', 'Добрый день': 'Good afternoon', 'Добрый вечер': 'Good evening' }[g[1]] + ', ' + (D[g[2]] ?? translit(g[2]));
    }
    if (out == null && NAME.test(t)) out = t.split(' ').map(w => D[w] ?? translit(w)).join(' ');
    if (out == null) { const f = fallback(t); out = f !== t ? f : null; }
    return out;
  }
  const T = s => { const v = base(s.trim()); return v == null ? s : v; };
  // Sentences with names, titles or dates inside.
  const PATTERNS = [
    [/^Урок «(.+)» будет удалён\.$/, m => `Lesson "${T(m[1])}" will be deleted.`],
    [/^Урок «(.+)» вместе с видео будет удалён\.$/, m => `Lesson "${T(m[1])}" and its video will be deleted.`],
    [/^Файл «(.+)» будет удалён из урока\.$/, m => `File "${m[1]}" will be removed from the lesson.`],
    [/^(Имя|Стаж): «(.+)» на модерации с (.+)$/, m => `${m[1] === 'Имя' ? 'Name' : 'Experience'}: "${T(m[2])}" under moderation since ${T(m[3])}`],
    [/^Опубликовать прогноз (\S+)\?$/, m => `Publish prediction ${m[1]}?`],
    [/^Цена закрытия (\S+) на (.+?) (не ниже|не выше) \$([\d\s.,]+?)(?: \(([+−-]?[\d,.]+)% от цены публикации\))?\.?$/, m => `${m[1]} closing price on ${T(m[2])} ${m[3] === 'не ниже' ? 'at or above' : 'at or below'} $${m[4].replace(/\s/g, '')}${m[5] ? ` (${m[5].replace(',', '.')}% from the price at publication)` : ''}`],
    [/^На модерации с (.+)\. Проверка обычно занимает до 2 рабочих дней\.$/, m => `Under moderation since ${T(m[1])}. Review usually takes up to 2 business days.`],
    [/^Роль: (\S+)\. С нами с (.+)\.$/, m => `Role: ${ROLE_EN[m[1]] || m[1]}. Member since ${T(m[2])}.`],
    [/^Код отправлен на (\S+)\. Он действует 30 минут\.$/, m => `The code was sent to ${m[1]}. It is valid for 30 minutes.`],
    [/^Сертификат (\S+)\. Сеть: Solana (\S+)\. Проверка выполняется в вашем браузере через публичный узел Solana\.$/, m => `Certificate ${m[1]}. Network: Solana ${m[2]}. The check runs in your browser via a public Solana node.`],
    [/^Создан (.+?)\. Сертификатов: (\d+)(?: · прогнозов, записанных в Solana: (\d+))?\.$/, m => `Created ${T(m[1])}. Certificates: ${m[2]}${m[3] != null ? ` · forecasts recorded on Solana: ${m[3]}` : ''}.`],
    [/^Зафиксировать (\S+) в Solana$/, m => `Anchor ${m[1]} on Solana`],
    [/^Жалоба: (.+)$/, m => `Report: ${T(m[1])}`],
    [/^от (.+)$/, m => `from ${T(m[1])}`],
    [/^Ближайшая встреча: (.+)$/, m => `Next session: ${T(m[1])}`],
    [/^обновлён (.+)$/, m => `updated ${T(m[1])}`],
    [/^Опубликован (.+)$/, m => `Published ${T(m[1])}`],
    [/^Записано (.+)$/, m => `Recorded ${T(m[1])}`],
    [/^отправлен (.+)$/, m => `submitted ${T(m[1])}`]
  ];
  function tr(raw) {
    if (!raw || !CYR.test(raw)) return null;
    const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0];
    const t = raw.replace(/\s+/g, ' ').trim();
    if (cache.has(t)) { const c = cache.get(t); return c == null ? null : lead + c + tail; }
    let out = base(t);
    if (out == null || CYR.test(out)) for (const [re, fn] of PATTERNS) { const m = re.exec(t); if (m) { out = fn(m); break; } }
    // "A · B · C": translate each part on its own (dates, names, counts).
    if ((out == null || CYR.test(out)) && t.includes(' · ')) {
      const parts = t.split(' · ').map(x => { const v = base(x); if (v != null && !CYR.test(v)) return v; for (const [re, fn] of PATTERNS) { const m = re.exec(x); if (m) return fn(m); } return v ?? x; });
      const joined = parts.join(' · ');
      if (joined !== t) out = joined;
    }
    cache.set(t, out);
    return out == null ? null : lead + out + tail;
  }
  // For text drawn outside the DOM (e.g. the certificate PDF).
  window.DalLang.t = s => { const v = tr(String(s)); return v == null ? s : v.trim(); };
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
  // Native confirm dialogs are translated too.
  const oc = window.confirm.bind(window); window.confirm = m => oc(tr(m) ?? m);
})();
