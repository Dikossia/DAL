(() => {
  'use strict';
  const SEED = window.STUDIO;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf = new Intl.NumberFormat('ru-RU');
  const money = n => !Number.isFinite(n) ? 'Цена не указана' : n === 0 ? 'Бесплатно' : nf.format(n) + ' ₸';
  const tenge = n => nf.format(Math.round(n)) + ' ₸';
  const usd = n => '$' + nf.format(n);
  const num = n => Number(n).toFixed(2).replace('.', ',');
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDate = iso => iso ? dateFmt.format(new Date(iso + 'T12:00:00')).replace(/\s?г\.$/, '') : '';
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => isoDate(new Date());
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const daysUntil = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5);
  const duration = s => { if (!Number.isFinite(s)) return 'длительность неизвестна'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const totalTime = s => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
  const bytes = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' ГБ' : Math.max(1, Math.round(n / 1e6)) + ' МБ';
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн' : Math.round(n / 1e3) + ' тыс';
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = o => JSON.parse(JSON.stringify(o));
  const imageSource = id => !id ? '' : id.startsWith('data:') ? id : (window.DAL_IMAGES?.[id] || `assets/${id}.jpg`);
  const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v';
  const MAX_VIDEO = 4 * 1024 ** 3, MAX_FREE = 2, MAX_OPEN = 5, COMMISSION = SEED.sales.commission;

  // ---------- Состояние ----------
  const KEY = 'dal-studio-v1';
  const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const fresh = () => ({ theme: systemDark() ? 'dark' : 'light', expert: clone(SEED.expert), courses: clone(SEED.courses), forecasts: clone(SEED.forecasts), reviews: clone(SEED.reviews), requests: [] });
  let state = fresh();
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object' && Array.isArray(s.courses)) state = { ...state, ...s }; } catch (_) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { toast('Браузер не сохранил изменения: закончилось место.'); } };
  let saveTimer;
  const persistSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 300); };

  // ---------- Хранилище видео (IndexedDB, в памяти как запасной вариант) ----------
  const videoStore = (() => {
    const mem = new Map(); let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      try { const r = indexedDB.open('dal-studio-video', 1); r.onupgradeneeded = () => r.result.createObjectStore('videos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
    }));
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const t = db.transaction('videos', mode), req = fn(t.objectStore('videos'));
      t.oncomplete = () => res(req.result); t.onerror = t.onabort = () => rej(t.error);
    }));
    return {
      put: (k, blob) => { mem.set(k, blob); return run('readwrite', s => s.put(blob, k)).then(() => true, () => false); },
      get: k => mem.has(k) ? Promise.resolve(mem.get(k)) : run('readonly', s => s.get(k)).catch(() => undefined),
      del: k => { mem.delete(k); return run('readwrite', s => s.delete(k)).catch(() => {}); },
      clear: () => { mem.clear(); return run('readwrite', s => s.clear()).catch(() => {}); }
    };
  })();
  const urls = new Map();
  const videoURL = async k => { if (urls.has(k)) return urls.get(k); const b = await videoStore.get(k); if (!b) return null; const u = URL.createObjectURL(b); urls.set(k, u); return u; };
  const dropURL = k => { if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } };
  const uploads = {};

  // ---------- Справочники и помощники ----------
  const main = $('#main'), modal = $('#modal');
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const findCourse = id => state.courses.find(c => c.id === id);
  const catName = id => SEED.categories.find(c => c.id === id)?.name || '';
  const allLessons = c => c.modules.flatMap(m => m.lessons);
  const findLesson = (c, lid) => { for (const m of c.modules) { const i = m.lessons.findIndex(l => l.id === lid); if (i > -1) return { module: m, lesson: m.lessons[i], index: i }; } return null; };
  const currentCourse = () => { const [page, id] = (location.hash || '').slice(1).split('/'); return page === 'course' ? findCourse(id) : null; };
  const isLive = c => c.status === 'published' || c.status === 'hidden';
  const locked = c => c.status === 'review';
  const courseTime = c => allLessons(c).reduce((a, l) => a + (Number.isFinite(l.video?.duration) ? l.video.duration : 0), 0);
  const freeCount = c => allLessons(c).filter(l => l.free).length;
  const chip = (label, cls, ic) => `<span class="chip ${cls}">${ic ? icon(ic) : ''}${label}</span>`;
  const COURSE_STATUS = { draft: ['Черновик', 'draft', 'pencil'], review: ['На модерации', 'review', 'hourglass'], published: ['В каталоге', 'live', 'circle-check'], hidden: ['Скрыт из каталога', 'hidden', 'eye-off'] };
  const courseChip = c => chip(...COURSE_STATUS[c.status]);
  const FC_STATUS = { active: ['Открыт', 'active', 'clock-3'], success: ['Условие выполнено', 'live', 'circle-check'], miss: ['Не выполнено', 'miss', 'x'] };
  const LEVELS = { yes: ['Можно', 'live', 'check'], review: ['После модерации', 'review', 'hourglass'], no: ['Нельзя', 'miss', 'ban'], rule: ['Правило платформы', 'hidden', 'info'] };
  const rating = v => `<span class="rating">${icon('star')}${num(v)}</span>`;
  const breadcrumb = items => `<nav class="breadcrumb" aria-label="Навигационная цепочка">${items.map(([name, href], i) => `${i ? icon('chevron-right') : ''}${href ? `<a href="${href}">${esc(name)}</a>` : `<span>${esc(name)}</span>`}`).join('')}</nav>`;
  const coverHTML = (c, cls = '') => c.cover ? `<img src="${imageSource(c.cover)}" alt="" class="${cls}" loading="lazy">` : `<span class="cover-empty ${cls}">${icon('image')}</span>`;
  const checks = c => {
    const ls = allLessons(c);
    return [
      ['Название не короче 10 символов', c.title.trim().length >= 10],
      ['Описание не короче 80 символов', c.description.trim().length >= 80],
      ['Выбрана обложка', !!c.cover],
      ['Указана цена', Number.isFinite(c.price) && c.price >= 0],
      ['Не меньше 3 уроков', ls.length >= 3],
      ['У всех уроков есть названия', ls.length > 0 && ls.every(l => l.title.trim().length >= 3)],
      ['Видео загружено во все уроки', ls.length > 0 && ls.every(l => l.video)]
    ];
  };
  const forecastStats = () => {
    const open = state.forecasts.filter(f => f.status === 'active'), done = state.forecasts.filter(f => f.status !== 'active');
    const ok = done.filter(f => f.status === 'success').length;
    return { open, done, ok, pct: done.length ? Math.round(ok / done.length * 100) : 0 };
  };
  const conditionText = f => {
    const change = (f.target - f.start) / f.start * 100;
    return `Цена закрытия ${esc(f.ticker)} на ${fmtDate(f.deadline)} ${f.direction === 'up' ? 'не ниже' : 'не выше'} ${usd(f.target)} (${change > 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}% от цены публикации).`;
  };
  const footer = () => `<footer class="page-footer"><span><span class="footer-logo">Dal.</span> &nbsp; Studio · кабинет эксперта</span><span>Демонстрационные данные. Загруженные видео хранятся только в вашем браузере.</span></footer>`;
  const empty = (title, text, name = 'search', href = '#overview', label = 'К обзору') => `<div class="empty">${icon(name)}<h2>${title}</h2><p>${text}</p><a class="btn secondary" href="${href}">${label} ${icon('arrow-right')}</a></div>`;

  // ---------- Оформление ----------
  function applyAppearance() {
    const dark = state.theme === 'dark', root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', dark ? '#9cc9cc' : '#2f5d62');
    root.style.setProperty('--soft', dark ? 'color-mix(in srgb, #9cc9cc 12%, #1d2420)' : 'color-mix(in srgb, #2f5d62 8%, white)');
    const t = $('.theme-toggle'); t.innerHTML = icon(dark ? 'sun' : 'moon'); t.title = dark ? 'Светлая тема' : 'Тёмная тема'; t.setAttribute('aria-label', t.title);
    $('#studioAvatar').innerHTML = `<img src="${imageSource(state.expert.image)}" alt="">`;
  }
  const NAV = [['overview', 'layout-dashboard', 'Обзор'], ['courses', 'clapperboard', 'Курсы'], ['forecasts', 'radio', 'Прогнозы'], ['students', 'users-round', 'Ученики'], ['reviews', 'message-square', 'Отзывы'], ['income', 'wallet', 'Доход'], ['rights', 'shield-check', 'Права']];
  function renderNav(page) {
    const cur = { course: 'courses', 'forecast-new': 'forecasts' }[page] || page || 'overview';
    const unanswered = state.reviews.filter(r => !r.reply && !r.reported).length;
    $('#studioNav').innerHTML = NAV.map(([id, ic, t]) => `<a href="#${id}" class="${cur === id ? 'active' : ''}" ${cur === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t}</span>${id === 'reviews' && unanswered ? `<span class="nav-count">${unanswered}</span>` : ''}</a>`).join('');
  }

  // ---------- Обзор ----------
  function overview() {
    const ex = state.expert, live = state.courses.filter(isLive);
    const students = live.reduce((a, c) => a + c.students, 0);
    const months = SEED.sales.months, gross = months.at(-1)[1], prev = months.at(-2)[1];
    const growth = Math.round((gross - prev) / prev * 100);
    const rated = live.filter(c => c.reviews), revCount = rated.reduce((a, c) => a + c.reviews, 0);
    const avg = revCount ? rated.reduce((a, c) => a + c.rating * c.reviews, 0) / revCount : 0;
    const fs = forecastStats();
    const hour = new Date().getHours(), hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const attention = [];
    state.courses.filter(c => c.status === 'draft').forEach(c => { const left = checks(c).filter(x => !x[1]).length; attention.push([`#course/${c.id}`, 'pencil', `«${esc(c.title || 'Новый курс')}»`, left ? `До отправки на модерацию: ${left} ${plural(left, 'пункт', 'пункта', 'пунктов')}` : 'Готов к отправке на модерацию']); });
    state.courses.filter(c => c.status === 'review').forEach(c => attention.push([`#course/${c.id}`, 'hourglass', `«${esc(c.title)}»`, `На модерации с ${fmtDate(c.submittedAt)}`]));
    fs.open.filter(f => daysUntil(f.deadline) <= 14).forEach(f => { const d = daysUntil(f.deadline); attention.push(['#forecasts', 'clock-3', `Прогноз ${esc(f.ticker)}`, d > 0 ? `Проверка через ${d} ${plural(d, 'день', 'дня', 'дней')}` : 'Проверка сегодня']); });
    const unanswered = state.reviews.filter(r => !r.reply && !r.reported).length;
    if (unanswered) attention.push(['#reviews', 'message-square', `${unanswered} ${plural(unanswered, 'отзыв', 'отзыва', 'отзывов')} без ответа`, 'Ответы видны всем ученикам']);
    const recent = [...state.courses].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 3);
    return `<div class="page-topline"><span class="eyebrow">КАБИНЕТ ЭКСПЕРТА</span>${ex.verified ? `<span class="chip live">${icon('badge-check')}Профиль подтверждён</span>` : ''}</div>
      <div class="heading-row"><h1>${hello}, ${esc(ex.name.split(' ')[0])}</h1><div class="head-actions"><button class="btn" data-action="new-course">${icon('plus')}Новый курс</button><a class="btn secondary" href="#forecast-new">${icon('radio')}Новый прогноз</a></div></div>
      <div class="kpis">
        <div class="kpi"><small>Учеников</small><strong>${nf.format(students)}</strong><span>в ${live.length} ${plural(live.length, 'курсе', 'курсах', 'курсах')}</span></div>
        <div class="kpi"><small>Продажи за сентябрь</small><strong>${tenge(gross)}</strong><span class="${growth >= 0 ? 'up' : 'down'}">${growth >= 0 ? '+' : ''}${growth}% к августу</span></div>
        <div class="kpi"><small>Оценка курсов</small><strong>${num(avg)}</strong><span>${revCount} ${plural(revCount, 'отзыв', 'отзыва', 'отзывов')}</span></div>
        <div class="kpi"><small>Прогнозы</small><strong>${fs.pct}%</strong><span>${fs.ok} из ${fs.done.length} выполнено</span></div>
      </div>
      <div class="overview-grid"><section><div class="section-head"><h2>Требует внимания</h2></div>${attention.length ? `<div class="attention">${attention.map(([href, ic, t, s]) => `<a class="attention-row" href="${href}"><span class="attention-icon">${icon(ic)}</span><span><strong>${t}</strong><small>${s}</small></span>${icon('chevron-right')}</a>`).join('')}</div>` : '<p class="subtitle">Всё в порядке.</p>'}</section>
      <section><div class="section-head"><h2>Недавние курсы</h2><a class="text-link" href="#courses">Все курсы ${icon('arrow-right')}</a></div><div class="mini-courses">${recent.map(c => `<a class="mini-course" href="#course/${c.id}">${coverHTML(c)}<span><strong>${esc(c.title || 'Новый курс')}</strong>${courseChip(c)}</span></a>`).join('')}</div></section></div>`;
  }

  // ---------- Курсы ----------
  let courseFilter = 'all';
  function coursesView() {
    const filters = [['all', 'Все'], ['draft', 'Черновики'], ['review', 'На модерации'], ['published', 'В каталоге'], ['hidden', 'Скрытые']];
    const list = state.courses.filter(c => courseFilter === 'all' || c.status === courseFilter);
    return `<div class="heading-row"><h1>Курсы</h1><button class="btn" data-action="new-course">${icon('plus')}Новый курс</button></div><p class="subtitle">Создавайте курсы, загружайте видео в уроки и отправляйте на модерацию.</p>
      <div class="tabs" role="tablist" aria-label="Статус курса">${filters.map(([id, t]) => { const n = id === 'all' ? state.courses.length : state.courses.filter(c => c.status === id).length; return `<button role="tab" aria-selected="${courseFilter === id}" class="tab ${courseFilter === id ? 'active' : ''}" data-action="course-filter" data-id="${id}">${t} <span class="tab-count">${n}</span></button>`; }).join('')}</div>
      ${list.length ? `<div class="course-list">${list.map(c => { const n = allLessons(c).length; return `<article class="course-row"><a class="course-cover" href="#course/${c.id}" tabindex="-1" aria-hidden="true">${coverHTML(c)}</a><div class="course-info"><div class="course-meta">${courseChip(c)}<span>${catName(c.category)}</span></div><h2><a href="#course/${c.id}">${esc(c.title || 'Новый курс')}</a></h2><p>${n} ${plural(n, 'урок', 'урока', 'уроков')} · ${totalTime(courseTime(c))} · обновлён ${fmtDate(c.updatedAt)}</p></div><dl class="course-stats"><div><dt>Учеников</dt><dd>${nf.format(c.students)}</dd></div><div><dt>Выручка</dt><dd>${tenge(c.revenue)}</dd></div><div><dt>Цена</dt><dd>${money(c.price)}</dd></div></dl><a class="btn secondary" href="#course/${c.id}">${c.status === 'draft' ? 'Продолжить' : 'Открыть'}${icon('arrow-right')}</a></article>`; }).join('')}</div>` : `<div class="empty">${icon('clapperboard')}<h2>Здесь пока пусто</h2><p>В этом статусе нет курсов.</p></div>`}`;
  }

  function newCourse() {
    const c = { id: uid('d'), title: '', category: 'beginner', price: null, description: '', cover: '', status: 'draft', students: 0, revenue: 0, rating: 0, reviews: 0, updatedAt: today(),
      modules: [{ id: uid('m'), title: 'Модуль 1', lessons: [{ id: uid('l'), title: '', free: true, video: null }] }] };
    state.courses.unshift(c); persist(); location.hash = `#course/${c.id}`;
  }

  function zoneHTML(c, l) {
    const up = uploads[l.id];
    if (up) return `<div class="upload-box"><div class="upload-row">${icon('file-video')}<span class="upload-text"><strong>${esc(up.name)}</strong><small>${bytes(up.size)} · загрузка <span data-pct>${up.pct}</span>%</small></span><button type="button" class="text-link" data-action="cancel-upload" data-id="${l.id}">Отменить</button></div><div class="progress"><span style="width:${up.pct}%"></span></div></div>`;
    if (l.video) {
      const v = l.video;
      return `<div class="video-ready" data-drop="${l.id}">${v.stored ? `<span class="video-thumb"><video data-thumb="${l.id}" muted playsinline preload="metadata" aria-hidden="true"></video>${icon('play')}</span>` : `<span class="video-thumb demo">${icon('film')}</span>`}<span class="video-text"><strong>${esc(v.name)}</strong><small>${duration(v.duration)} · ${bytes(v.size)}${v.demo ? ' · демо-запись' : ''}${v.updated ? ' · <b>Обновлено</b>' : ''}</small></span><span class="video-actions"><button type="button" class="btn ghost small" data-action="play" data-id="${l.id}">${icon('play')}Смотреть</button><label class="btn secondary small file-btn">${icon('refresh-cw')}Заменить<input type="file" class="sr-only" accept="${ACCEPT}" data-upload="${l.id}"></label>${isLive(c) ? '' : `<button type="button" class="icon-button" data-action="remove-video" data-id="${l.id}" title="Удалить видео" aria-label="Удалить видео">${icon('trash-2')}</button>`}</span></div>`;
    }
    return `<label class="dropzone" data-drop="${l.id}">${icon('upload')}<span><strong>Перетащите видео сюда или выберите файл</strong><small>MP4, MOV или WEBM, до 4 ГБ</small></span><input type="file" class="sr-only" accept="${ACCEPT}" data-upload="${l.id}"></label>`;
  }

  function moduleHTML(c, m, mi, offset) {
    const live = isLive(c), fc = freeCount(c);
    return `<div class="module"><div class="module-head"><span class="module-index">Модуль ${mi + 1}</span><input type="text" class="module-title" data-module="${m.id}" value="${esc(m.title)}" maxlength="80" aria-label="Название модуля ${mi + 1}" placeholder="Название модуля">${!live && c.modules.length > 1 ? `<button type="button" class="icon-button" data-action="delete-module" data-id="${m.id}" title="Удалить модуль" aria-label="Удалить модуль ${mi + 1}">${icon('trash-2')}</button>` : ''}</div>
      <ol class="lessons">${m.lessons.map((l, li) => { const n = offset + li + 1; return `<li class="lesson"><div class="lesson-top"><span class="lesson-num">${n}</span><input type="text" class="lesson-title" data-lesson-title="${l.id}" value="${esc(l.title)}" maxlength="100" placeholder="Название урока" aria-label="Название урока ${n}"><label class="free-toggle" title="${!l.free && fc >= MAX_FREE ? 'Бесплатных уроков может быть не больше двух' : 'Урок можно смотреть до покупки'}"><input type="checkbox" data-free="${l.id}" ${l.free ? 'checked' : ''} ${!l.free && fc >= MAX_FREE ? 'disabled' : ''}>Бесплатный</label><span class="lesson-tools"><button type="button" class="icon-button" data-action="move-up" data-id="${l.id}" ${li === 0 ? 'disabled' : ''} title="Выше" aria-label="Переместить урок ${n} выше">${icon('arrow-up')}</button><button type="button" class="icon-button" data-action="move-down" data-id="${l.id}" ${li === m.lessons.length - 1 ? 'disabled' : ''} title="Ниже" aria-label="Переместить урок ${n} ниже">${icon('arrow-down')}</button>${live ? '' : `<button type="button" class="icon-button" data-action="delete-lesson" data-id="${l.id}" title="Удалить урок" aria-label="Удалить урок ${n}">${icon('trash-2')}</button>`}</span></div><div class="video-zone" id="zone-${l.id}">${zoneHTML(c, l)}</div></li>`; }).join('')}</ol>
      <button type="button" class="text-link add-lesson" data-action="add-lesson" data-id="${m.id}">${icon('plus')}Добавить урок</button></div>`;
  }

  function panelHTML(c) {
    const list = checks(c), ready = list.every(x => x[1]);
    const checklist = `<ul class="checklist">${list.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${icon(ok ? 'circle-check' : 'circle')}${t}</li>`).join('')}</ul>`;
    const stats = `<dl class="panel-stats"><div><dt>Учеников</dt><dd>${nf.format(c.students)}</dd></div><div><dt>Выручка</dt><dd>${tenge(c.revenue)}</dd></div><div><dt>Оценка</dt><dd>${c.reviews ? rating(c.rating) : '—'}</dd></div></dl>`;
    let body = '';
    if (c.status === 'draft') body = `${checklist}<button class="btn wide" data-action="submit" ${ready ? '' : 'disabled'}>${icon('send')}Отправить на модерацию</button>${ready ? '' : '<p class="fine-print">Выполните все пункты, чтобы отправить курс.</p>'}`;
    if (c.status === 'review') body = `${checklist}<div class="notice">${icon('hourglass')} На модерации с ${fmtDate(c.submittedAt)}. Обычно проверка занимает до 2 рабочих дней.</div><button class="btn wide" data-action="approve">${icon('badge-check')}Демо: одобрить модерацией</button><button class="btn secondary wide" data-action="withdraw">Отозвать с модерации</button>`;
    if (c.status === 'published') body = `${stats}<button class="btn secondary wide" data-action="hide">${icon('eye-off')}Скрыть из каталога</button>`;
    if (c.status === 'hidden') body = `${stats}<div class="notice">Новые ученики курс не видят. Купившие сохраняют доступ.</div><button class="btn wide" data-action="unhide">${icon('eye')}Вернуть в каталог</button>`;
    const del = c.students > 0 ? `<p class="locked-line">${icon('lock')}Удалить нельзя: ${nf.format(c.students)} ${plural(c.students, 'ученик оплатил', 'ученика оплатили', 'учеников оплатили')} доступ.</p>` : c.status === 'review' ? '' : `<button class="text-link danger" data-action="delete-course">${icon('trash-2')}Удалить курс</button>`;
    return `<div class="panel-card"><span class="tiny-meta">Статус</span><div class="panel-status">${courseChip(c)}</div>${body}<button class="btn ghost wide" data-action="preview">${icon('eye')}Как увидит ученик</button>${del}</div>
      <div class="panel-card subtle"><h3>Что проверяет модерация</h3><ul class="plain-list"><li>Видео открывается и слышен звук</li><li>Нет обещаний доходности и персональных торговых советов</li><li>Описание соответствует содержанию</li></ul><a class="text-link" href="#rights">Все права эксперта ${icon('arrow-right')}</a></div>`;
  }

  function courseEditor(id) {
    const c = findCourse(id);
    if (!c) return empty('Курс не найден', 'Возможно, его удалили.', 'clapperboard', '#courses', 'К курсам');
    const lock = locked(c), live = isLive(c), ls = allLessons(c);
    const covers = ['foundations', 'analytics', 'workshop'];
    let offset = 0;
    const modules = c.modules.map((m, mi) => { const h = moduleHTML(c, m, mi, offset); offset += m.lessons.length; return h; }).join('');
    return `${breadcrumb([['Курсы', '#courses'], [c.title || 'Новый курс']])}
      <div class="heading-row"><h1 id="courseHead">${esc(c.title || 'Новый курс')}</h1>${courseChip(c)}</div><p class="subtitle">Изменения сохраняются автоматически · ${catName(c.category)}</p>
      ${lock ? `<div class="notice lock-note">${icon('lock')}Курс на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.</div>` : ''}
      ${live ? `<div class="notice">${icon('info')}Курс уже продаётся. Можно править тексты, менять цену, заменять видео и добавлять уроки. Удалять уроки нельзя: ученики уже проходят курс.</div>` : ''}
      <div class="editor"><div class="editor-main"><fieldset class="editor-fieldset" ${lock ? 'disabled' : ''}>
        <section class="editor-section"><h2>Основное</h2>
          <label class="form-label">Название курса<input type="text" id="f-title" data-field="title" maxlength="90" value="${esc(c.title)}" placeholder="Например: Читаем отчётность и оцениваем бизнес"></label>
          <div class="field-row"><label class="form-label">Направление<select id="f-category" data-field="category">${SEED.categories.map(k => `<option value="${k.id}" ${c.category === k.id ? 'selected' : ''}>${k.name}</option>`).join('')}</select></label>
          <label class="form-label">Цена, ₸<input type="number" id="f-price" data-field="price" min="0" step="100" inputmode="numeric" value="${Number.isFinite(c.price) ? c.price : ''}" placeholder="19 900"><span class="field-hint">${live ? 'Новая цена действует только для новых покупок.' : '0 — курс будет бесплатным.'}</span></label></div>
          <label class="form-label">Описание<textarea id="f-description" data-field="description" rows="5" maxlength="1500" placeholder="Чему научится ученик и для кого этот курс">${esc(c.description)}</textarea><span class="field-hint" id="descCounter">${c.description.length} / 1500</span></label>
          <div class="form-label">Обложка<div class="cover-picker">${covers.map(img => `<button type="button" class="cover-option ${c.cover === img ? 'active' : ''}" data-action="cover" data-id="${img}" aria-pressed="${c.cover === img}" aria-label="Обложка из библиотеки"><img src="${imageSource(img)}" alt=""></button>`).join('')}${c.cover && c.cover.startsWith('data:') ? `<span class="cover-option active"><img src="${c.cover}" alt="Своя обложка"></span>` : ''}<label class="cover-option cover-upload">${icon('image')}<span>Загрузить</span><input type="file" id="coverInput" class="sr-only" accept="image/jpeg,image/png,image/webp"></label></div></div>
        </section>
        <section class="editor-section"><div class="section-title-row"><h2>Программа</h2><span class="tiny-meta">${ls.length} ${plural(ls.length, 'урок', 'урока', 'уроков')} · ${totalTime(courseTime(c))} · бесплатных ${freeCount(c)} из ${MAX_FREE}</span></div>
          ${modules}
          <button type="button" class="btn secondary" data-action="add-module">${icon('plus')}Добавить модуль</button>
        </section>
      </fieldset></div><aside class="editor-panel" id="coursePanel">${panelHTML(c)}</aside></div>`;
  }
  function refreshPanel(c) { const p = $('#coursePanel'); if (p) { p.innerHTML = panelHTML(c); icons(); } }
  function refreshZone(lid) {
    const c = currentCourse(), z = $(`#zone-${lid}`); if (!c || !z) return;
    const f = findLesson(c, lid); if (!f) return;
    z.innerHTML = zoneHTML(c, f.lesson); icons(); hydrateThumbs(z);
  }
  function hydrateThumbs(root) {
    $$('video[data-thumb]', root).forEach(async v => {
      const u = await videoURL(v.dataset.thumb);
      if (u) v.src = u + '#t=1';
      else { const box = v.closest('.video-ready'); v.parentElement.classList.add('demo'); v.remove(); const s = box && $('.video-text small', box); if (s) s.textContent = 'Файл не найден в этом браузере. Загрузите видео заново.'; }
    });
  }

  const readDuration = file => new Promise(res => {
    const v = document.createElement('video'), u = URL.createObjectURL(file); let done = false;
    const finish = d => { if (done) return; done = true; URL.revokeObjectURL(u); res(d); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => finish(null); setTimeout(() => finish(null), 8000); v.src = u;
  });
  function handleFile(lid, file) {
    const c = currentCourse(); if (!c || locked(c) || !file) return;
    const okType = /^video\/(mp4|quicktime|webm|x-m4v)$/.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    if (!okType) { toast('Нужен видеофайл MP4, MOV или WEBM.'); return; }
    if (file.size > MAX_VIDEO) { toast('Файл больше 4 ГБ. Сожмите видео или разделите урок на части.'); return; }
    if (uploads[lid]) return;
    const up = uploads[lid] = { name: file.name, size: file.size, pct: 0, cancelled: false };
    refreshZone(lid);
    const meta = readDuration(file), total = Math.min(6000, Math.max(1400, file.size / 25e6 * 1000)), start = performance.now();
    up.timer = setInterval(() => {
      up.pct = Math.min(100, Math.round((performance.now() - start) / total * 100));
      const z = $(`#zone-${lid}`);
      if (z) { const b = $('.progress span', z); if (b) b.style.width = up.pct + '%'; const t = $('[data-pct]', z); if (t) t.textContent = up.pct; }
      if (up.pct >= 100) { clearInterval(up.timer); finish(); }
    }, 100);
    async function finish() {
      const dur = await meta; if (up.cancelled) return;
      const saved = await videoStore.put(lid, file); if (up.cancelled) return;
      delete uploads[lid]; dropURL(lid);
      const f = findLesson(c, lid); if (!f) return;
      f.lesson.video = { name: file.name, size: file.size, type: file.type, duration: dur, stored: true, updated: isLive(c) };
      c.updatedAt = today(); persist();
      if (currentCourse() === c) { refreshZone(lid); refreshPanel(c); const meta2 = $('.section-title-row .tiny-meta'); if (meta2) meta2.textContent = `${allLessons(c).length} ${plural(allLessons(c).length, 'урок', 'урока', 'уроков')} · ${totalTime(courseTime(c))} · бесплатных ${freeCount(c)} из ${MAX_FREE}`; }
      toast(saved ? `Видео «${file.name}» загружено` : 'Видео загружено, но браузер не сохранит его после перезагрузки: не хватает места.');
    }
  }
  function coverFromFile(file) {
    const c = currentCourse(); if (!c || !file) return;
    if (!/^image\//.test(file.type)) { toast('Нужна картинка JPG, PNG или WEBP.'); return; }
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const w = Math.min(960, img.width), h = Math.round(img.height * w / img.width), cv = document.createElement('canvas');
      cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(u);
      c.cover = cv.toDataURL('image/jpeg', .8); c.updatedAt = today(); persist(); render(); toast('Обложка обновлена');
    };
    img.onerror = () => { URL.revokeObjectURL(u); toast('Не удалось открыть картинку.'); };
    img.src = u;
  }
  async function play(lid) {
    const c = currentCourse(), f = c && findLesson(c, lid); if (!f?.lesson.video) return;
    const v = f.lesson.video, title = esc(f.lesson.title || 'Урок без названия');
    if (v.demo) { openDialog(title, `<div class="demo-player">${icon('film')}<p>Это демонстрационная запись «${esc(v.name)}». Сам файл в прототипе не хранится.</p><p class="fine-print">Загрузите своё видео в любой урок, и его можно будет посмотреть здесь.</p></div>`); return; }
    const u = await videoURL(lid);
    if (!u) { toast('Файл не найден в этом браузере. Загрузите видео заново.'); return; }
    openDialog(title, `<video class="player" controls playsinline src="${u}"></video><p class="fine-print" id="playerNote">${esc(v.name)} · ${duration(v.duration)}</p>`, 'wide');
    $('#modal video').addEventListener('error', () => { $('#playerNote').textContent = 'Браузер не может воспроизвести этот файл. Попробуйте MP4 с кодеком H.264.'; }, { once: true });
  }
  function preview(c) {
    const ls = allLessons(c), free = ls.filter(l => l.free), ex = state.expert;
    openDialog('Как увидит ученик', `<article class="preview-card"><div class="preview-cover">${coverHTML(c)}</div><div class="preview-body"><span class="product-kicker">${catName(c.category)}</span><h3>${esc(c.title || 'Новый курс')}</h3><span class="expert-inline"><img src="${imageSource(ex.image)}" alt=""><span>${esc(ex.name)}</span></span><p>${esc(c.description) || 'Описание пока не заполнено.'}</p><div class="product-meta"><span>${icon('play')}${ls.length} ${plural(ls.length, 'урок', 'урока', 'уроков')}</span><span>${icon('clock-3')}${totalTime(courseTime(c))}</span></div><div class="product-bottom"><strong>${money(c.price)}</strong></div></div></article>${free.length ? `<h4 class="preview-sub">Можно посмотреть до покупки</h4><ul class="plain-list">${free.map(l => `<li>${esc(l.title || 'Урок без названия')}</li>`).join('')}</ul>` : ''}`, 'wide');
  }

  // ---------- Прогнозы ----------
  let fcFilter = 'all', fcDraft = {};
  function forecastsView() {
    const fs = forecastStats(), full = fs.open.length >= MAX_OPEN;
    const list = state.forecasts.filter(f => fcFilter === 'all' || (fcFilter === 'active' ? f.status === 'active' : f.status !== 'active'));
    return `<div class="heading-row"><h1>Прогнозы</h1>${full ? `<button class="btn" disabled title="Открыто ${MAX_OPEN} из ${MAX_OPEN}">${icon('lock')}Лимит открытых прогнозов</button>` : `<a class="btn" href="#forecast-new">${icon('plus')}Новый прогноз</a>`}</div>
      <p class="subtitle">Прогноз фиксируется в момент публикации и остаётся в истории, даже если не сбылся.</p>
      <div class="kpis three"><div class="kpi"><small>Открыто</small><strong>${fs.open.length} из ${MAX_OPEN}</strong><span>лимит одновременно открытых</span></div><div class="kpi"><small>Завершено</small><strong>${fs.done.length}</strong><span>итог определён автоматически</span></div><div class="kpi"><small>Условие выполнено</small><strong>${fs.pct}%</strong><span>${fs.ok} из ${fs.done.length} · видно ученикам</span></div></div>
      <div class="tabs" role="tablist" aria-label="Фильтр прогнозов">${[['all', 'Все'], ['active', 'Открытые'], ['done', 'Завершённые']].map(([id, t]) => `<button role="tab" aria-selected="${fcFilter === id}" class="tab ${fcFilter === id ? 'active' : ''}" data-action="fc-filter" data-id="${id}">${t}</button>`).join('')}</div>
      <div class="fc-grid">${list.map(f => { const active = f.status === 'active', d = daysUntil(f.deadline); return `<article class="fc"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker)}</span><div><strong>${esc(f.name)}</strong><p>${esc(f.ticker)} · USD · ${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div>${chip(...FC_STATUS[f.status])}</div>
        <p class="fc-condition">${conditionText(f)}${active ? ` <b>${d > 0 ? `Через ${d} ${plural(d, 'день', 'дня', 'дней')}` : 'Сегодня'}</b>` : ''}</p>
        <div class="signal-values"><div><label>При публикации</label><strong>${usd(f.start)}</strong></div><div><label>Цель</label><strong>${usd(f.target)}</strong></div><div><label>${active ? 'Сейчас' : 'Итог'}</label><strong>${usd(f.current)}</strong></div></div>
        <p class="fc-rationale">${esc(f.rationale)}</p>
        ${f.updates.length ? `<ul class="fc-updates">${f.updates.map(u => `<li><small>${fmtDate(u.date)}</small>${esc(u.text)}</li>`).join('')}</ul>` : ''}
        <div class="fc-foot"><span class="locked-line">${icon('lock')}Зафиксирован ${fmtDate(f.publishedAt)}</span>${active ? `<button class="text-link" data-action="fc-comment" data-id="${f.id}">${icon('message-square')}Комментарий</button>` : ''}</div></article>`; }).join('')}</div>`;
  }
  function forecastNew() {
    const fs = forecastStats();
    if (fs.open.length >= MAX_OPEN) return empty('Открыто 5 прогнозов из 5', 'Новый прогноз можно опубликовать, когда завершится один из открытых.', 'lock', '#forecasts', 'К прогнозам');
    const d = fcDraft, v = k => esc(d[k] ?? '');
    return `${breadcrumb([['Прогнозы', '#forecasts'], ['Новый прогноз']])}<h1>Новый прогноз</h1><p class="subtitle">После публикации условие, цель и срок изменить нельзя.</p>
      <div class="editor"><form id="forecastForm" class="editor-main" novalidate>
        <section class="editor-section"><h2>Инструмент</h2><div class="field-row"><label class="form-label">Тикер<input type="text" id="fc-ticker" name="ticker" maxlength="6" autocomplete="off" placeholder="KSPI" value="${v('ticker')}"></label><label class="form-label">Компания или фонд<input type="text" id="fc-name" name="name" maxlength="60" placeholder="Kaspi.kz" value="${v('name')}"></label></div></section>
        <section class="editor-section"><h2>Условие</h2>
          <div class="choice-row" role="radiogroup" aria-label="Направление">${[['up', 'trending-up', 'Рост', 'Цена закрытия не ниже цели'], ['down', 'trending-down', 'Снижение', 'Цена закрытия не выше цели']].map(([id, ic, t, s]) => `<label class="choice"><input type="radio" name="direction" value="${id}" ${(d.direction || 'up') === id ? 'checked' : ''}><span>${icon(ic)}<strong>${t}</strong><small>${s}</small></span></label>`).join('')}</div>
          <div class="field-row three"><label class="form-label">Цена сейчас, $<input type="number" id="fc-start" name="start" min="0.01" step="0.01" value="${v('start')}" placeholder="96"><span class="field-hint">В продукте подставится из источника котировок</span></label><label class="form-label">Цель, $<input type="number" id="fc-target" name="target" min="0.01" step="0.01" value="${v('target')}" placeholder="108"></label><label class="form-label">Дата проверки<input type="date" id="fc-deadline" name="deadline" min="${addDays(1)}" max="${addDays(365)}" value="${v('deadline')}"><span class="field-hint">От завтра до года</span></label></div>
        </section>
        <section class="editor-section"><h2>Обоснование</h2><label class="form-label">Почему вы так считаете и что может помешать<textarea id="fc-rationale" name="rationale" rows="6" maxlength="2000" placeholder="Гипотеза, на чём она основана и главные риски">${v('rationale')}</textarea><span class="field-hint" id="fcCounter"></span></label></section>
        <label class="check-line"><input type="checkbox" id="fc-ack" name="ack" ${d.ack ? 'checked' : ''}><span>Понимаю, что после публикации прогноз нельзя изменить или удалить, а итог определится автоматически по цене закрытия.</span></label>
        <div id="fcErrors" class="form-errors" role="alert"></div>
        <div class="form-actions"><button class="btn" type="submit">${icon('send')}Опубликовать прогноз</button><a class="btn secondary" href="#forecasts">Отмена</a></div>
      </form><aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Так прогноз увидят ученики</span><div id="fcPreview"></div></div><div class="panel-card subtle"><h3>Правила прогнозов</h3><ul class="plain-list"><li>Не больше ${MAX_OPEN} открытых прогнозов одновременно</li><li>По одному тикеру только один открытый прогноз</li><li>Изменить или удалить после публикации нельзя</li><li>Можно добавлять комментарии, они не меняют условие</li></ul><a class="text-link" href="#rights">Все права эксперта ${icon('arrow-right')}</a></div></aside></div>`;
  }
  const readForecast = form => { const fd = new FormData(form); return { ticker: String(fd.get('ticker') || '').trim().toUpperCase(), name: String(fd.get('name') || '').trim(), direction: fd.get('direction') || 'up', start: parseFloat(fd.get('start')), target: parseFloat(fd.get('target')), deadline: String(fd.get('deadline') || ''), rationale: String(fd.get('rationale') || '').trim(), ack: fd.get('ack') === 'on' }; };
  const forecastErrors = f => {
    const e = [];
    if (!/^[A-Z0-9.]{1,6}$/.test(f.ticker)) e.push('Тикер: от 1 до 6 латинских букв или цифр.');
    if (f.ticker && state.forecasts.some(x => x.status === 'active' && x.ticker === f.ticker)) e.push(`По ${f.ticker} уже есть открытый прогноз. Дождитесь его итога.`);
    if (f.name.length < 2) e.push('Укажите компанию или фонд.');
    if (!(f.start > 0)) e.push('Укажите текущую цену.');
    if (!(f.target > 0)) e.push('Укажите цель.');
    if (f.start > 0 && f.target > 0 && (f.direction === 'up' ? f.target <= f.start : f.target >= f.start)) e.push(f.direction === 'up' ? 'Для роста цель должна быть выше текущей цены.' : 'Для снижения цель должна быть ниже текущей цены.');
    if (!f.deadline || f.deadline < addDays(1) || f.deadline > addDays(365)) e.push('Дата проверки: от завтра до года вперёд.');
    if (f.rationale.length < 120) e.push(`Обоснование: ещё ${120 - f.rationale.length} ${plural(120 - f.rationale.length, 'символ', 'символа', 'символов')} до минимума.`);
    if (!f.ack) e.push('Подтвердите, что понимаете правила публикации.');
    return e;
  };
  function updateFcPreview() {
    const form = $('#forecastForm'); if (!form) return;
    const f = readForecast(form); fcDraft = { ...f, start: form.elements.start.value, target: form.elements.target.value };
    const n = f.rationale.length; $('#fcCounter').textContent = n >= 120 ? `${n} / 2000` : `${n} / минимум 120`;
    const okNums = f.start > 0 && f.target > 0;
    $('#fcPreview').innerHTML = `<div class="fc fc-preview"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker || '—')}</span><div><strong>${esc(f.name || 'Компания')}</strong><p>${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div>${chip(...FC_STATUS.active)}</div><p class="fc-condition">${okNums && f.deadline ? conditionText({ ...f, ticker: f.ticker || '—' }) : 'Заполните цену, цель и дату, чтобы увидеть условие.'}</p><div class="fc-foot"><span class="locked-line">${icon('user-round')}${esc(state.expert.name)}</span></div></div>`;
    icons();
  }

  // ---------- Ученики ----------
  let stFilter = 'all';
  function studentsView() {
    const live = state.courses.filter(isLive), total = live.reduce((a, c) => a + c.students, 0);
    const list = SEED.students.filter(s => stFilter === 'all' || s.course === stFilter);
    const title = id => esc(findCourse(id)?.title || '');
    return `<h1>Ученики</h1><p class="subtitle">Всего ${nf.format(total)} ${plural(total, 'ученик', 'ученика', 'учеников')} в ${live.length} ${plural(live.length, 'курсе', 'курсах', 'курсах')}. Ниже последние активные.</p>
      <div class="notice lock-note">${icon('lock')}Почта и телефоны учеников скрыты. Связь только через сообщения курса на платформе.</div>
      <div class="toolbar"><label class="form-label inline">Курс<select id="stFilter"><option value="all">Все курсы</option>${live.map(c => `<option value="${c.id}" ${stFilter === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</select></label></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Ученик</th><th>Курс</th><th>Прогресс</th><th>Был на платформе</th></tr></thead><tbody>${list.map(s => `<tr><td><span class="person"><span class="user-avatar">${esc(s.name[0])}</span>${esc(s.name)}</span></td><td>${title(s.course)}</td><td><span class="progress-cell"><span class="progress"><span style="width:${s.progress}%"></span></span>${s.progress}%</span></td><td>${s.last}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- Отзывы ----------
  let rvFilter = 'all', editingReply = '';
  function reviewsView() {
    const all = state.reviews, avg = all.reduce((a, r) => a + r.rating, 0) / all.length;
    const unanswered = all.filter(r => !r.reply && !r.reported).length;
    const list = all.filter(r => rvFilter === 'all' || (!r.reply && !r.reported));
    return `<div class="heading-row"><h1>Отзывы</h1>${rating(avg)}</div><p class="subtitle">Отзывы нельзя удалить или изменить. Если отзыв нарушает правила, пожалуйтесь, и решение примет модерация.</p>
      <div class="tabs" role="tablist" aria-label="Фильтр отзывов">${[['all', `Все ${all.length}`], ['open', `Без ответа ${unanswered}`]].map(([id, t]) => `<button role="tab" aria-selected="${rvFilter === id}" class="tab ${rvFilter === id ? 'active' : ''}" data-action="rv-filter" data-id="${id}">${t}</button>`).join('')}</div>
      ${list.length ? `<div class="review-list">${list.map(r => `<article class="review-card"><div class="review-top"><span class="user-avatar">${esc(r.name[0])}</span><span class="review-who"><strong>${esc(r.name)}</strong><small>${esc(findCourse(r.course)?.title || '')} · ${fmtDate(r.date)}</small></span>${rating(r.rating)}</div><p>${esc(r.text)}</p>
        ${r.reported ? `<p class="flag-note">${icon('flag')}Жалоба отправлена модерации. Пока идёт проверка, отзыв виден ученикам.</p>` : ''}
        ${r.reply && editingReply !== r.id ? `<div class="reply"><span class="tiny-meta">Ваш ответ</span><p>${esc(r.reply)}</p><button class="text-link" data-action="edit-reply" data-id="${r.id}">${icon('pencil')}Изменить ответ</button></div>` : `<form class="reply-form" data-review="${r.id}"><textarea name="reply" rows="2" maxlength="1000" placeholder="Публичный ответ ученику" aria-label="Ответ на отзыв: ${esc(r.name)}">${esc(r.reply || '')}</textarea><button class="btn small" type="submit">${icon('send')}Ответить</button></form>`}
        ${r.reported ? '' : `<div class="review-actions"><button class="text-link muted" data-action="report" data-id="${r.id}">${icon('flag')}Пожаловаться</button></div>`}</article>`).join('')}</div>` : `<div class="empty">${icon('message-square')}<h2>На все отзывы есть ответ</h2><p>Новые отзывы появятся здесь.</p></div>`}`;
  }

  // ---------- Доход ----------
  function incomeView() {
    const s = SEED.sales, gross = s.months.at(-1)[1], fee = gross * COMMISSION, net = gross - fee, max = Math.max(...s.months.map(m => m[1]));
    const live = state.courses.filter(isLive);
    return `<h1>Доход</h1><p class="subtitle">Продажи, комиссия платформы и выплаты. Демонстрационные данные.</p>
      <div class="kpis"><div class="kpi"><small>Продажи за сентябрь</small><strong>${tenge(gross)}</strong><span>до комиссии</span></div><div class="kpi"><small>Комиссия Dal · ${COMMISSION * 100}%</small><strong>−${tenge(fee)}</strong><span>с каждой продажи</span></div><div class="kpi"><small>Ваш доход</small><strong>${tenge(net)}</strong><span>за сентябрь</span></div><div class="kpi"><small>Следующая выплата</small><strong>${fmtDate(s.nextPayout).replace(/\s\d{4}$/, '')}</strong><span>на счёт ${s.account}</span></div></div>
      <section class="chart-card"><div class="section-head"><h2>Продажи по месяцам</h2><span class="tiny-meta">до комиссии, ₸</span></div><div class="bars" role="img" aria-label="Продажи за 6 месяцев: ${s.months.map(m => `${m[0]} ${compact(m[1])}`).join(', ')}">${s.months.map(([m, v], i) => `<div class="bar ${i === s.months.length - 1 ? 'current' : ''}"><span class="bar-value">${compact(v)}</span><span class="bar-fill" style="height:${Math.round(v / max * 100)}%"></span><span class="bar-label">${m}</span></div>`).join('')}</div></section>
      <div class="section-head"><h2>По курсам</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Курс</th><th class="num">Учеников</th><th class="num">Продажи за всё время</th><th class="num">Ваш доход</th></tr></thead><tbody>${live.map(c => `<tr><td>${esc(c.title)}</td><td class="num">${nf.format(c.students)}</td><td class="num">${tenge(c.revenue)}</td><td class="num">${tenge(c.revenue * (1 - COMMISSION))}</td></tr>`).join('')}</tbody></table></div>
      <div class="section-head"><h2>Последние продажи</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Курс</th><th>Ученик</th><th class="num">Сумма</th><th class="num">Комиссия</th><th class="num">Вам</th></tr></thead><tbody>${s.recent.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(findCourse(r.course)?.title || '')}</td><td>${esc(r.student)}</td><td class="num">${tenge(r.amount)}</td><td class="num">−${tenge(r.amount * COMMISSION)}</td><td class="num">${tenge(r.amount * (1 - COMMISSION))}</td></tr>`).join('')}</tbody></table></div>
      <p class="rank-context">Возврат возможен в течение 14 дней, если ученик прошёл меньше 20% курса. Сумма возврата списывается с вашего баланса.</p>`;
  }

  // ---------- Профиль ----------
  function profileView() {
    const ex = state.expert, fs = forecastStats(), live = state.courses.filter(isLive), students = live.reduce((a, c) => a + c.students, 0);
    const pending = state.requests.filter(r => r.status !== 'done');
    const label = { name: 'Имя', experience: 'Стаж' };
    return `<h1>Публичный профиль</h1><p class="subtitle">Эти данные ученики видят на вашей странице и в рейтинге экспертов.</p>
      <div class="editor"><form id="profileForm" class="editor-main">
        <div class="verify-line">${icon('badge-check')}<span><strong>Личность и счёт подтверждены</strong><small>${fmtDate(ex.verifiedAt)} · можно продавать курсы и публиковать прогнозы</small></span></div>
        <section class="editor-section"><h2>Данные, которые проверяет модерация</h2>
          <div class="field-row"><div class="form-label">Имя и фамилия<div class="locked-field"><span>${esc(ex.name)}</span><button type="button" class="text-link" data-action="request" data-id="name">Запросить изменение</button></div></div><div class="form-label">Стаж<div class="locked-field"><span>${esc(ex.experience)}</span><button type="button" class="text-link" data-action="request" data-id="experience">Запросить изменение</button></div></div></div>
          ${pending.length ? `<ul class="plain-list pending">${pending.map(r => `<li>${icon('hourglass')}${label[r.field]}: «${esc(r.value)}» на модерации с ${fmtDate(r.date)}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="editor-section"><h2>Данные, которые можно менять сразу</h2>
          <label class="form-label">Специализация<input type="text" name="role" id="p-role" maxlength="80" value="${esc(ex.role)}" required></label>
          <label class="form-label">О себе<textarea name="bio" id="p-bio" rows="5" maxlength="800">${esc(ex.bio)}</textarea></label>
          <label class="form-label">Достижения, каждое с новой строки<textarea name="achievements" id="p-ach" rows="4" maxlength="600">${esc(ex.achievements.join('\n'))}</textarea></label>
          <button class="btn" type="submit">${icon('check')}Сохранить</button>
        </section>
      </form><aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Так вас видят ученики</span><div class="profile-card"><img src="${imageSource(ex.image)}" alt=""><strong>${esc(ex.name)}</strong><p>${esc(ex.role)}</p><div class="profile-card-stats"><span>${rating(ex.rating)}</span><span>${icon('users-round')}${nf.format(students)}</span><span>${icon('radio')}${fs.pct}% прогнозов</span></div><p class="profile-card-bio">${esc(ex.bio)}</p></div></div></aside></div>`;
  }

  // ---------- Права ----------
  function rightsView() {
    return `<div class="page-topline"><span class="eyebrow">ПРАВИЛА DAL STUDIO</span><span class="chip review">${icon('pencil')}Черновик для обсуждения</span></div><h1>Права эксперта</h1><p class="subtitle rights-intro">Что эксперт делает сам, что проходит модерацию и что запрещено. Эти правила уже работают в кабинете: недоступные действия заблокированы и объяснены.</p>
      <div class="legend">${Object.values(LEVELS).map(l => chip(...l)).join('')}</div>
      ${SEED.rights.map(g => `<section class="rights-group"><h2>${icon(g.icon)}${g.group}</h2><div class="rights-table">${g.items.map(([a, l, n]) => `<div class="right-row"><span class="right-action">${a}</span>${chip(...LEVELS[l])}<span class="right-note">${n}</span></div>`).join('')}</div></section>`).join('')}
      <p class="rank-context">Это предложение для обсуждения с командой и юристом. Лимиты, комиссия и сроки выплат указаны для демонстрации.</p>`;
  }

  // ---------- Рендер ----------
  let routeKey = '', lastNav = '';
  function render() {
    const hash = (location.hash || '#overview').slice(1), [page, id] = hash.split('/');
    const newRoute = hash !== routeKey; routeKey = hash;
    if (newRoute) editingReply = '';
    let html;
    switch (page) {
      case '': case 'overview': html = overview(); break;
      case 'courses': html = coursesView(); break;
      case 'course': html = courseEditor(id); break;
      case 'forecasts': html = forecastsView(); break;
      case 'forecast-new': html = forecastNew(); break;
      case 'students': html = studentsView(); break;
      case 'reviews': html = reviewsView(); break;
      case 'income': html = incomeView(); break;
      case 'profile': html = profileView(); break;
      case 'rights': html = rightsView(); break;
      default: html = empty('Страница не найдена', 'Вернитесь к обзору кабинета.');
    }
    main.innerHTML = `<div class="page ${newRoute ? '' : 'still'}">${html}${footer()}</div>`;
    renderNav(page); applyAppearance(); icons(); hydrateThumbs(main);
    if (page === 'forecast-new') updateFcPreview();
    document.title = `Dal Studio · ${$('h1', main)?.textContent || ''}`;
    closeMenu();
    if (newRoute) { window.scrollTo({ top: 0, behavior: 'instant' }); if (lastNav) main.focus({ preventScroll: true }); }
    lastNav = hash;
  }

  // ---------- Диалоги, меню, уведомления ----------
  let toastTimer, lastFocus, pendingConfirm = null;
  function toast(m) { clearTimeout(toastTimer); const t = $('#toast'); t.textContent = m; t.classList.add('visible'); toastTimer = setTimeout(() => t.classList.remove('visible'), 3200); }
  function openDialog(title, body, cls = '') {
    if (modal.open) modal.close();
    lastFocus = document.activeElement; modal.className = cls;
    modal.innerHTML = `<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-button" data-action="close-modal" title="Закрыть" aria-label="Закрыть">${icon('x')}</button></div>${body}`;
    icons(); modal.showModal();
  }
  function confirmDialog(title, text, okLabel, onOk, danger = false) {
    pendingConfirm = onOk;
    openDialog(title, `<p class="modal-text">${text}</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn ${danger ? 'danger' : ''}" data-action="confirm-ok">${okLabel}</button></div>`);
  }
  function closeMenu() { $('#profileMenu').hidden = true; $('.user-trigger').setAttribute('aria-expanded', 'false'); }
  function toggleMenu() {
    const p = $('#profileMenu'); if (!p.hidden) { closeMenu(); return; }
    const ex = state.expert;
    p.innerHTML = `<div class="popover-person"><span class="user-avatar"><img src="${imageSource(ex.image)}" alt=""></span><div><strong>${esc(ex.name)}</strong><p>${ex.verified ? 'Эксперт · профиль подтверждён' : 'Эксперт'}</p></div></div><a href="#profile">${icon('user-round')}<span>Публичный профиль</span></a><a href="#rights">${icon('shield-check')}<span>Права эксперта</span></a><div class="popover-separator"></div><button data-action="reset">${icon('refresh-cw')}<span>Сбросить демо-данные</span></button>`;
    p.hidden = false; $('.user-trigger').setAttribute('aria-expanded', 'true'); icons(); $('a', p).focus();
  }

  // ---------- События ----------
  document.addEventListener('click', e => {
    if (e.target.closest('.skip-link')) { e.preventDefault(); main.focus(); return; }
    if (!e.target.closest('#profileMenu,.user-trigger')) closeMenu();
    if (e.target.closest('a[href^="#"]') && modal.open) modal.close();
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    const { action, id } = b.dataset, c = currentCourse();
    const mutate = (fn, msg) => { fn(); if (c) c.updatedAt = today(); persist(); render(); if (msg) toast(msg); };
    switch (action) {
      case 'theme': state.theme = state.theme === 'dark' ? 'light' : 'dark'; persist(); applyAppearance(); icons(); break;
      case 'profile-menu': toggleMenu(); break;
      case 'close-modal': modal.close(); break;
      case 'confirm-ok': { const fn = pendingConfirm; pendingConfirm = null; modal.close(); fn?.(); break; }
      case 'new-course': newCourse(); break;
      case 'course-filter': courseFilter = id; render(); break;
      case 'fc-filter': fcFilter = id; render(); break;
      case 'rv-filter': rvFilter = id; render(); break;
      case 'cover': if (c && !locked(c)) mutate(() => { c.cover = id; }); break;
      case 'add-module': if (c && !locked(c)) mutate(() => c.modules.push({ id: uid('m'), title: `Модуль ${c.modules.length + 1}`, lessons: [] })); break;
      case 'add-lesson': if (c && !locked(c)) { const m = c.modules.find(m => m.id === id), l = { id: uid('l'), title: '', free: false, video: null }; mutate(() => m.lessons.push(l)); $(`[data-lesson-title="${l.id}"]`)?.focus(); } break;
      case 'delete-module': if (c && !isLive(c)) { const m = c.modules.find(m => m.id === id); confirmDialog('Удалить модуль?', `Модуль «${esc(m.title)}» и ${m.lessons.length} ${plural(m.lessons.length, 'урок', 'урока', 'уроков')} с видео будут удалены.`, 'Удалить', () => { m.lessons.forEach(l => { videoStore.del(l.id); dropURL(l.id); }); mutate(() => { c.modules = c.modules.filter(x => x !== m); }, 'Модуль удалён'); }, true); } break;
      case 'delete-lesson': if (c && !isLive(c)) { const f = findLesson(c, id); confirmDialog('Удалить урок?', `Урок «${esc(f.lesson.title || 'без названия')}»${f.lesson.video ? ' вместе с видео' : ''} будет удалён.`, 'Удалить', () => { videoStore.del(id); dropURL(id); mutate(() => f.module.lessons.splice(f.module.lessons.indexOf(f.lesson), 1), 'Урок удалён'); }, true); } break;
      case 'move-up': case 'move-down': if (c && !locked(c)) { const f = findLesson(c, id), j = f.index + (action === 'move-up' ? -1 : 1); if (j >= 0 && j < f.module.lessons.length) mutate(() => { const a = f.module.lessons; [a[f.index], a[j]] = [a[j], a[f.index]]; }); } break;
      case 'remove-video': if (c && !isLive(c)) { const f = findLesson(c, id); confirmDialog('Удалить видео?', `Файл «${esc(f.lesson.video.name)}» будет удалён из урока.`, 'Удалить', () => { videoStore.del(id); dropURL(id); mutate(() => { f.lesson.video = null; }, 'Видео удалено'); }, true); } break;
      case 'cancel-upload': { const up = uploads[id]; if (up) { up.cancelled = true; clearInterval(up.timer); delete uploads[id]; refreshZone(id); toast('Загрузка отменена'); } break; }
      case 'play': play(id); break;
      case 'preview': if (c) preview(c); break;
      case 'submit': if (c && checks(c).every(x => x[1])) mutate(() => { c.status = 'review'; c.submittedAt = today(); }, 'Курс отправлен на модерацию'); break;
      case 'approve': if (c) mutate(() => { c.status = 'published'; c.publishedAt = today(); }, 'Демо: модерация одобрила курс, он появился в каталоге'); break;
      case 'withdraw': if (c) mutate(() => { c.status = 'draft'; }, 'Курс снова в черновиках'); break;
      case 'hide': if (c) confirmDialog('Скрыть курс из каталога?', 'Новые ученики не смогут его найти и купить. Те, кто уже купил, сохранят доступ.', 'Скрыть', () => mutate(() => { c.status = 'hidden'; }, 'Курс скрыт из каталога')); break;
      case 'unhide': if (c) mutate(() => { c.status = 'published'; }, 'Курс снова в каталоге'); break;
      case 'delete-course': if (c && c.students === 0) confirmDialog('Удалить курс?', `«${esc(c.title || 'Новый курс')}» и все загруженные видео будут удалены без возможности восстановления.`, 'Удалить', () => { allLessons(c).forEach(l => { videoStore.del(l.id); dropURL(l.id); }); state.courses = state.courses.filter(x => x !== c); persist(); location.hash = '#courses'; toast('Курс удалён'); }, true); break;
      case 'fc-comment': { const f = state.forecasts.find(f => f.id === id); openDialog(`Комментарий к ${esc(f.ticker)}`, `<p class="modal-text">Комментарий увидят ученики. Условие, цель и срок прогноза не изменятся.</p><form id="commentForm" data-id="${f.id}"><label class="form-label">Текст<textarea name="text" rows="4" maxlength="600" required minlength="10"></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Добавить</button></div></form>`); break; }
      case 'edit-reply': editingReply = id; render(); $(`.reply-form[data-review="${id}"] textarea`)?.focus(); break;
      case 'report': openDialog('Пожаловаться на отзыв', `<p class="modal-text">Отзыв останется видимым, пока модерация не примет решение.</p><form id="reportForm" data-id="${id}">${['Реклама или спам', 'Оскорбления', 'Не относится к курсу', 'Другое'].map((t, i) => `<label class="check-line"><input type="radio" name="reason" value="${t}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}<div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Отправить жалобу</button></div></form>`); break;
      case 'request': { const field = id, cur = state.expert[field]; openDialog(field === 'name' ? 'Изменить имя' : 'Изменить стаж', `<p class="modal-text">Изменение вступит в силу после проверки модерацией. Может понадобиться документ.</p><form id="requestForm" data-field="${field}"><label class="form-label">${field === 'name' ? 'Новое имя и фамилия' : 'Новый стаж'}<input type="text" name="value" maxlength="60" required value="${esc(cur)}"></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Отправить на модерацию</button></div></form>`); break; }
      case 'reset': confirmDialog('Сбросить демо-данные?', 'Ваши курсы, загруженные видео, прогнозы, ответы на отзывы и изменения профиля будут удалены. Вернётся исходный демонстрационный набор.', 'Сбросить', () => { videoStore.clear(); urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); const theme = state.theme; state = fresh(); state.theme = theme; persist(); location.hash = '#overview'; render(); toast('Демо-данные восстановлены'); }, true); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target, c = currentCourse();
    if (t.closest('#forecastForm')) { if (t.name === 'ticker') t.value = t.value.toUpperCase().replace(/[^A-Z0-9.]/g, ''); updateFcPreview(); return; }
    if (!c || locked(c)) return;
    if (t.dataset.field) {
      const f = t.dataset.field;
      c[f] = f === 'price' ? (t.value === '' ? null : Math.max(0, Math.round(Number(t.value)))) : t.value;
      if (f === 'title') { $('#courseHead').textContent = t.value || 'Новый курс'; }
      if (f === 'description') $('#descCounter').textContent = `${t.value.length} / 1500`;
    } else if (t.dataset.module) { const m = c.modules.find(m => m.id === t.dataset.module); if (m) m.title = t.value; }
    else if (t.dataset.lessonTitle) { const f = findLesson(c, t.dataset.lessonTitle); if (f) f.lesson.title = t.value; }
    else return;
    c.updatedAt = today(); persistSoon(); refreshPanel(c);
  });

  document.addEventListener('change', e => {
    const t = e.target, c = currentCourse();
    if (t.id === 'stFilter') { stFilter = t.value; render(); return; }
    if (t.dataset.upload) { handleFile(t.dataset.upload, t.files[0]); t.value = ''; return; }
    if (t.id === 'coverInput') { coverFromFile(t.files[0]); t.value = ''; return; }
    if (t.dataset.free && c && !locked(c)) {
      const f = findLesson(c, t.dataset.free);
      if (t.checked && freeCount(c) >= MAX_FREE) { t.checked = false; toast('Бесплатных уроков может быть не больше двух.'); return; }
      f.lesson.free = t.checked; c.updatedAt = today(); persist(); render();
    }
  });

  document.addEventListener('submit', e => {
    const form = e.target; e.preventDefault();
    const fd = new FormData(form);
    if (form.id === 'forecastForm') {
      const f = readForecast(form), errs = forecastErrors(f);
      $('#fcErrors').innerHTML = errs.length ? `<ul>${errs.map(x => `<li>${x}</li>`).join('')}</ul>` : '';
      if (errs.length) { $('#fcErrors').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (forecastStats().open.length >= MAX_OPEN) { toast('Открыто 5 прогнозов из 5.'); return; }
      confirmDialog(`Опубликовать прогноз ${esc(f.ticker)}?`, `${conditionText(f)}<br><br><b>После публикации изменить или удалить прогноз будет нельзя.</b>`, 'Опубликовать', () => {
        state.forecasts.unshift({ id: uid('f'), ticker: f.ticker, name: f.name, direction: f.direction, start: f.start, target: f.target, current: f.start, publishedAt: today(), deadline: f.deadline, status: 'active', rationale: f.rationale, updates: [] });
        fcDraft = {}; fcFilter = 'all'; persist(); location.hash = '#forecasts'; toast('Прогноз опубликован и зафиксирован');
      });
      return;
    }
    if (form.id === 'commentForm') { const text = String(fd.get('text')).trim(); if (text.length < 10) { toast('Напишите хотя бы 10 символов.'); return; } state.forecasts.find(f => f.id === form.dataset.id).updates.push({ date: today(), text }); persist(); modal.close(); render(); toast('Комментарий добавлен'); return; }
    if (form.classList.contains('reply-form')) { const text = String(fd.get('reply')).trim(); if (text.length < 2) { toast('Напишите ответ.'); return; } state.reviews.find(r => r.id === form.dataset.review).reply = text; editingReply = ''; persist(); render(); toast('Ответ опубликован'); return; }
    if (form.id === 'reportForm') { const r = state.reviews.find(r => r.id === form.dataset.id); r.reported = true; r.reportReason = fd.get('reason'); persist(); modal.close(); render(); toast('Жалоба отправлена модерации'); return; }
    if (form.id === 'requestForm') { const value = String(fd.get('value')).trim(); if (!value || value === state.expert[form.dataset.field]) { modal.close(); return; } state.requests = state.requests.filter(r => r.field !== form.dataset.field); state.requests.push({ field: form.dataset.field, value, date: today(), status: 'review' }); persist(); modal.close(); render(); toast('Запрос отправлен на модерацию'); return; }
    if (form.id === 'profileForm') { const role = String(fd.get('role')).trim(); if (!role) { toast('Укажите специализацию.'); return; } Object.assign(state.expert, { role, bio: String(fd.get('bio')).trim(), achievements: String(fd.get('achievements')).split('\n').map(s => s.trim()).filter(Boolean) }); persist(); render(); toast('Профиль сохранён, ученики уже видят изменения'); }
  });

  // Перетаскивание видео в урок
  document.addEventListener('dragover', e => { e.preventDefault(); const z = e.target.closest('[data-drop]'); if (z && !locked(currentCourse() || {})) z.classList.add('dragover'); });
  document.addEventListener('dragleave', e => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('dragover'); });
  document.addEventListener('drop', e => { e.preventDefault(); const z = e.target.closest('[data-drop]'); if (!z) { if (e.dataTransfer?.files.length) toast('Перетащите видео на нужный урок.'); return; } z.classList.remove('dragover'); handleFile(z.dataset.drop, e.dataTransfer.files[0]); });

  modal.addEventListener('click', e => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); } });
  modal.addEventListener('close', () => { $$('video', modal).forEach(v => v.pause()); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
    if (e.target.closest('.tabs[role="tablist"]') && ['ArrowRight', 'ArrowLeft'].includes(e.key)) { const tabs = $$('[role="tab"]', e.target.closest('.tabs')), i = tabs.indexOf(e.target); e.preventDefault(); tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].focus(); }
  });
  window.addEventListener('beforeunload', persist);
  window.addEventListener('hashchange', render);
  render();
})();
