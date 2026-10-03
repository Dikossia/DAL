(() => {
  'use strict';
  // Dal Studio, connected to the server: expert dashboard and moderator section.
  const api = window.DalAPI;
  const RIGHTS = window.STUDIO.rights;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU');
  const money = n => n == null ? 'Цена не указана' : n === 0 ? 'Бесплатно' : nf.format(n) + ' ₸';
  const tenge = n => nf.format(Math.round(n || 0)) + ' ₸';
  const usd = n => '$' + nf.format(n);
  const FORECAST_FEE = 5; // ₸ per forecast, matches RULES.forecastNetworkFee on the server
  const num = n => Number(n).toFixed(2).replace('.', ',');
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDate = iso => iso ? dateFmt.format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)).replace(/\s?г\.$/, '') : '';
  const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
  const daysUntil = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(isoDate(new Date()) + 'T12:00:00')) / 864e5);
  const clock = s => { if (!Number.isFinite(s)) return 'длительность неизвестна'; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const totalTime = s => { const m = Math.round((s || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
  const bytes = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' ГБ' : Math.max(1, Math.round(n / 1e6)) + ' МБ';
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(2).replace('.', ',') + ' млн' : Math.round(n / 1e3) + ' тыс';
  const initials = name => String(name || '').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v';
  const CATEGORIES = [['beginner', 'Для новичков'], ['advanced', 'Для продвинутых'], ['workshops', 'Вебинары и практикумы']];
  const COVERS = ['foundations', 'analytics', 'workshop'];
  const MAX_FREE = 2;
  // Products for the "Work with an expert", "Community" and "Ideas & analytics" modes.
  const MODE_NAMES = { experts: 'Работа с экспертом', community: 'Сообщество', ideas: 'Идеи и аналитика' };
  const PTYPES = {
    consultation: { mode: 'experts', kind: 'sessions', name: 'Разовая консультация', icon: 'messages-square', text: 'Одна встреча по видеосвязи. Ученик выбирает время из вашего расписания.' },
    personal: { mode: 'experts', kind: 'sessions', name: 'Индивидуальные занятия', icon: 'user-round-check', text: 'Пакет встреч в удобном ученику темпе.' },
    mentorship: { mode: 'experts', kind: 'sessions', name: 'Длительное сопровождение', icon: 'route', text: 'Большой пакет встреч на несколько месяцев.' },
    clubs: { mode: 'community', kind: 'subscription', name: 'Закрытый клуб', icon: 'users-round', text: 'Регулярные встречи и чат участников. Подписка на 30 дней.' },
    chats: { mode: 'community', kind: 'subscription', name: 'Чат с экспертом', icon: 'message-circle', text: 'Общий чат с вами и участниками. Подписка на 30 дней.' },
    investment: { mode: 'ideas', kind: 'material', name: 'Инвестиционная идея', icon: 'lightbulb', text: 'Текст с гипотезой и рисками. Бесплатно или за плату.' },
    reviews: { mode: 'ideas', kind: 'material', name: 'Обзор рынка или компании', icon: 'file-chart-column', text: 'Подробный разбор. До покупки ученик видит начало.' }
  };
  const SOCIAL_FIELDS = [['telegram', 'Telegram', '@nickname или t.me/…'], ['instagram', 'Instagram', '@nickname'], ['youtube', 'YouTube', '@channel или ссылка'], ['linkedin', 'LinkedIn', 'linkedin.com/in/…'], ['website', 'Сайт', 'example.kz']];
  const whenFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fmtWhen = iso => iso ? whenFmt.format(new Date(iso)) : '';
  const dayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const hourFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const richText = text => String(text || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines[0].startsWith('## ')) return `<h3>${esc(lines[0].slice(3))}</h3>${lines.length > 1 ? `<p>${esc(lines.slice(1).join(' '))}</p>` : ''}`;
    return `<p>${esc(block).replace(/\n/g, '<br>')}</p>`;
  }).join('');

  // ---------- State ----------
  const PREFS = 'dal-studio-prefs';
  let prefs = { theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch (_) { /* по умолчанию */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (_) { /* недоступно */ } };
  let me = null, profile = null, current = null, prod = null, unanswered = 0, productFilter = 'all', chatTimer = 0, chatLast = '';
  let courseFilter = 'all', fcFilter = 'all', rvFilter = 'all', stFilter = 'all', editingReply = '', fcDraft = {};
  const uploads = {};
  const main = $('#main'), modal = $('#modal');
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const chip = (label, cls, ic) => `<span class="chip ${cls}">${ic ? icon(ic) : ''}${label}</span>`;
  const COURSE_STATUS = { draft: ['Черновик', 'draft', 'pencil'], review: ['На модерации', 'review', 'hourglass'], published: ['В каталоге', 'live', 'circle-check'], hidden: ['Скрыт из каталога', 'hidden', 'eye-off'] };
  const courseChip = c => chip(...COURSE_STATUS[c.status]);
  const FC_STATUS = { active: ['Открыт', 'active', 'clock-3'], success: ['Условие выполнено', 'live', 'circle-check'], miss: ['Не выполнено', 'miss', 'x'] };
  const LEVELS = { yes: ['Можно', 'live', 'check'], review: ['После модерации', 'review', 'hourglass'], no: ['Нельзя', 'miss', 'ban'], rule: ['Правило платформы', 'hidden', 'info'] };
  const STAR = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
  const rating = v => v == null ? '<span class="rating">—</span>' : `<span class="rating" title="${num(v)} из 5"><span class="star-meter" style="--fill:${Math.max(0, Math.min(100, v / 5 * 100))}%" aria-hidden="true"><svg viewBox="0 0 24 24" class="star-empty">${STAR}</svg><span class="star-fill"><svg viewBox="0 0 24 24">${STAR}</svg></span></span>${Number(v).toFixed(1).replace('.', ',')}</span>`;
  const breadcrumb = items => `<nav class="breadcrumb" aria-label="Навигационная цепочка">${items.map(([n, h], i) => `${i ? icon('chevron-right') : ''}${h ? `<a href="${h}">${esc(n)}</a>` : `<span>${esc(n)}</span>`}`).join('')}</nav>`;
  const coverHTML = (url, cls = '') => url ? `<img src="${esc(url)}" alt="" class="${cls}" loading="lazy">` : `<span class="cover-empty ${cls}">${icon('image')}</span>`;
  const footer = () => `<footer class="page-footer"><span><span class="footer-logo">Dal.</span> &nbsp; Studio · ${me?.role === 'moderator' ? 'модерация' : 'кабинет эксперта'}</span><span>Данные хранятся на сервере на вашем компьютере.</span></footer>`;
  const empty = (title, text, name = 'search', action = '') => `<div class="empty">${icon(name)}<h2>${title}</h2><p>${text}</p>${action}</div>`;
  const linkFor = apiPath => apiPath.startsWith('/studio/courses/') ? '#course/' + apiPath.split('/').pop() : apiPath.startsWith('/studio/products/') ? '#product/' + apiPath.split('/').pop() : '#' + apiPath.split('/').pop();
  const productChip = p => chip(...COURSE_STATUS[p.status]);
  const allLessons = c => c.modules.flatMap(m => m.lessons);

  // ---------- Appearance ----------
  function applyAppearance() {
    const dark = prefs.theme === 'dark', root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--accent', dark ? '#9cc9cc' : '#2f5d62');
    root.style.setProperty('--soft', dark ? 'color-mix(in srgb, #9cc9cc 12%, #1d2420)' : 'color-mix(in srgb, #2f5d62 8%, white)');
    const t = $('.theme-toggle'); t.innerHTML = icon(dark ? 'sun' : 'moon'); t.title = dark ? 'Светлая тема' : 'Тёмная тема'; t.setAttribute('aria-label', t.title);
    $('#studioAvatar').innerHTML = profile?.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : esc(initials(me?.name));
  }
  function navItems() {
    if (me?.role === 'moderator') return [['moderation', 'shield-check', 'Модерация'], ['rights', 'scale', 'Права экспертов']];
    return [['overview', 'layout-dashboard', 'Обзор'], ['courses', 'clapperboard', 'Курсы'], ['products', 'calendar-clock', 'Встречи, клубы, идеи'], ['forecasts', 'radio', 'Прогнозы'], ['students', 'users-round', 'Ученики'], ['reviews', 'message-square', 'Отзывы'], ['income', 'wallet', 'Доход'], ['rights', 'shield-check', 'Права']];
  }
  function renderNav(page) {
    const cur = { course: 'courses', product: 'products', 'forecast-new': 'forecasts', 'review-course': 'moderation', 'review-product': 'moderation' }[page] || page;
    $('#studioNav').innerHTML = navItems().map(([id, ic, t]) => `<a href="#${id}" class="${cur === id ? 'active' : ''}" ${cur === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t}</span>${id === 'reviews' && unanswered ? `<span class="nav-count">${unanswered}</span>` : ''}</a>`).join('');
  }

  // ---------- Overview ----------
  async function overview() {
    const [o, courses] = await Promise.all([api.get('/studio/overview'), api.get('/studio/courses')]);
    const rv = o.attention.find(a => a.type === 'reviews');
    unanswered = rv ? Number(rv.title.match(/\d+/)?.[0] || 0) : 0;
    const hour = new Date().getHours(), hello = hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    const m = o.salesThisMonth, prev = o.salesLastMonth.gross, growth = prev ? Math.round((m.gross - prev) / prev * 100) : null;
    const sales = `${m.sales} ${plural(m.sales, 'продажа', 'продажи', 'продаж')}`;
    const ICON = { draft: 'pencil', rejected: 'undo-2', review: 'hourglass', forecast: 'clock-3', reviews: 'message-square' };
    return `<div class="page-topline"><span class="eyebrow">КАБИНЕТ ЭКСПЕРТА</span>${o.verified ? chip('Профиль подтверждён', 'live', 'badge-check') : chip('Ждёт подтверждения', 'review', 'hourglass')}</div>
      <div class="heading-row"><h1>${hello}, ${esc(me.name.split(' ')[0])}</h1><div class="head-actions"><button class="btn" data-action="new-course">${icon('plus')}Новый курс</button><button class="btn secondary" data-action="new-product">${icon('calendar-plus')}Встреча, клуб или идея</button><a class="btn secondary" href="#forecast-new">${icon('radio')}Новый прогноз</a></div></div>
      ${o.verified ? '' : `<div class="notice lock-note">${icon('info')}Курсы и продукты можно готовить уже сейчас. Отправлять их на модерацию и публиковать прогнозы можно после того, как модератор подтвердит вашу личность.</div>`}
      <div class="kpis">
        <div class="kpi"><small>Учеников</small><strong>${nf.format(o.students)}</strong><span>в ${o.liveCourses} ${plural(o.liveCourses, 'курсе или продукте', 'курсах и продуктах', 'курсах и продуктах')}</span></div>
        <div class="kpi"><small>Продажи · ${m.label.toLowerCase()}</small><strong>${tenge(m.gross)}</strong><span class="${growth == null ? '' : growth >= 0 ? 'up' : 'down'}">${growth == null ? sales : `${sales} · ${growth >= 0 ? '+' : ''}${growth}% к прошлому месяцу`}</span></div>
        <div class="kpi"><small>Общий рейтинг</small><strong>${o.rating ? Number(o.rating).toFixed(1).replace('.', ',') : '—'}</strong><span>${o.reviews} ${plural(o.reviews, 'отзыв', 'отзыва', 'отзывов')} · среднее по направлениям</span></div>
        <div class="kpi"><small>Прогнозы</small><strong>${o.forecasts.successRate == null ? '—' : String(o.forecasts.successRate).replace('.', ',') + '%'}</strong><span>${o.forecasts.success} из ${o.forecasts.done} выполнено</span></div>
      </div>
      <div class="mode-ratings">${[['courses', 'Курсы'], ...Object.entries(MODE_NAMES)].map(([k, n]) => `<div><span>${n}</span>${o.ratings[k].value == null ? '<span class="rating muted-rating">Нет оценок</span>' : `${rating(o.ratings[k].value)}<small class="tiny-meta">${o.ratings[k].reviews} ${plural(o.ratings[k].reviews, 'отзыв', 'отзыва', 'отзывов')}</small>`}</div>`).join('')}</div>
      ${o.bookings.length ? `<section><div class="section-head"><h2>Ближайшие встречи</h2><span class="tiny-meta">на 14 дней</span></div><div class="attention">${o.bookings.slice(0, 6).map(b => `<a class="attention-row" href="#product/${b.productId}"><span class="attention-icon">${icon('calendar-check')}</span><span><strong>${esc(fmtWhen(b.startsAt))} · ${esc(b.student)}</strong><small>${esc(b.title)} · ${b.durationMin} мин</small></span>${icon('chevron-right')}</a>`).join('')}</div></section>` : ''}
      <div class="overview-grid"><section><div class="section-head"><h2>Требует внимания</h2></div>${o.attention.length ? `<div class="attention">${o.attention.map(a => `<a class="attention-row" href="${linkFor(a.link)}"><span class="attention-icon">${icon(ICON[a.type] || 'info')}</span><span><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></span>${icon('chevron-right')}</a>`).join('')}</div>` : '<p class="subtitle">Всё в порядке.</p>'}</section>
      <section><div class="section-head"><h2>Недавние курсы</h2><a class="text-link" href="#courses">Все курсы ${icon('arrow-right')}</a></div>${courses.length ? `<div class="mini-courses">${courses.slice(0, 3).map(c => `<a class="mini-course" href="#course/${c.id}">${coverHTML(c.coverUrl)}<span><strong>${esc(c.title || 'Новый курс')}</strong>${courseChip(c)}</span></a>`).join('')}</div>` : '<p class="subtitle">Курсов пока нет. Создайте первый.</p>'}</section></div>`;
  }

  // ---------- Courses ----------
  async function coursesView() {
    const all = await api.get('/studio/courses');
    const list = all.filter(c => courseFilter === 'all' || c.status === courseFilter);
    const filters = [['all', 'Все'], ['draft', 'Черновики'], ['review', 'На модерации'], ['published', 'В каталоге'], ['hidden', 'Скрытые']];
    return `<div class="heading-row"><h1>Курсы</h1><button class="btn" data-action="new-course">${icon('plus')}Новый курс</button></div><p class="subtitle">Создавайте курсы, загружайте видео в уроки и отправляйте на модерацию.</p>
      <div class="tabs" role="tablist" aria-label="Статус курса">${filters.map(([id, t]) => `<button role="tab" aria-selected="${courseFilter === id}" class="tab ${courseFilter === id ? 'active' : ''}" data-action="course-filter" data-id="${id}">${t} <span class="tab-count">${id === 'all' ? all.length : all.filter(c => c.status === id).length}</span></button>`).join('')}</div>
      ${list.length ? `<div class="course-list">${list.map(c => `<article class="course-row"><a class="course-cover" href="#course/${c.id}" tabindex="-1" aria-hidden="true">${coverHTML(c.coverUrl)}</a><div class="course-info"><div class="course-meta">${courseChip(c)}<span>${esc(c.categoryName)}</span>${c.status === 'draft' && c.checklistLeft ? `<span>До модерации: ${c.checklistLeft} ${plural(c.checklistLeft, 'пункт', 'пункта', 'пунктов')}</span>` : ''}</div><h2><a href="#course/${c.id}">${esc(c.title || 'Новый курс')}</a></h2><p>${c.lessons} ${plural(c.lessons, 'урок', 'урока', 'уроков')} · ${totalTime(c.duration)} · обновлён ${fmtDate(c.updatedAt)}</p></div><dl class="course-stats"><div><dt>Учеников</dt><dd>${nf.format(c.students)}</dd></div><div><dt>Выручка</dt><dd>${tenge(c.revenue)}</dd></div><div><dt>Цена</dt><dd>${money(c.price)}</dd></div></dl><a class="btn secondary" href="#course/${c.id}">${c.status === 'draft' ? 'Продолжить' : 'Открыть'}${icon('arrow-right')}</a></article>`).join('')}</div>` : empty('Здесь пока пусто', courseFilter === 'all' ? 'Создайте первый курс: название, уроки и видео.' : 'В этом статусе нет курсов.', 'clapperboard', courseFilter === 'all' ? `<button class="btn" data-action="new-course">${icon('plus')}Новый курс</button>` : '')}`;
  }

  function zoneHTML(l) {
    const up = uploads[l.id], c = current;
    if (up) return `<div class="upload-box"><div class="upload-row">${icon('file-video')}<span class="upload-text"><strong>${esc(up.name)}</strong><small>${bytes(up.size)} · загрузка <span data-pct>${up.pct}</span>%</small></span><button type="button" class="text-link" data-action="cancel-upload" data-id="${l.id}">Отменить</button></div><div class="progress"><span style="width:${up.pct}%"></span></div></div>`;
    if (l.video) {
      const v = l.video;
      return `<div class="video-ready" data-drop="${l.id}"><span class="video-thumb"><video data-thumb="${l.id}" muted playsinline preload="metadata" aria-hidden="true"></video>${icon('play')}</span><span class="video-text"><strong>${esc(v.name)}</strong><small>${clock(v.duration)} · ${bytes(v.size)}${v.updatedAfterPublish ? ' · <b>Обновлено</b>' : ''}</small></span><span class="video-actions"><button type="button" class="btn ghost small" data-action="play" data-id="${l.id}">${icon('play')}Смотреть</button><label class="btn secondary small file-btn">${icon('refresh-cw')}Заменить<input type="file" class="sr-only" accept="${ACCEPT}" data-upload="${l.id}"></label>${c.rules.canDeleteVideo ? `<button type="button" class="icon-button" data-action="remove-video" data-id="${l.id}" title="Удалить видео" aria-label="Удалить видео">${icon('trash-2')}</button>` : ''}</span></div>`;
    }
    return `<label class="dropzone" data-drop="${l.id}">${icon('upload')}<span><strong>Перетащите видео сюда или выберите файл</strong><small>MP4, MOV или WEBM, до 4 ГБ</small></span><input type="file" class="sr-only" accept="${ACCEPT}" data-upload="${l.id}"></label>`;
  }

  function moduleHTML(m, mi, offset) {
    const c = current, freeLeft = c.rules.freeLessonsLeft;
    return `<div class="module"><div class="module-head"><span class="module-index">Модуль ${mi + 1}</span><input type="text" class="module-title" data-module="${m.id}" value="${esc(m.title)}" maxlength="80" aria-label="Название модуля ${mi + 1}" placeholder="Название модуля">${c.rules.canDeleteLessons && c.modules.length > 1 ? `<button type="button" class="icon-button" data-action="delete-module" data-id="${m.id}" title="Удалить модуль" aria-label="Удалить модуль ${mi + 1}">${icon('trash-2')}</button>` : ''}</div>
      <ol class="lessons">${m.lessons.map((l, li) => { const n = offset + li + 1; return `<li class="lesson"><div class="lesson-top"><span class="lesson-num">${n}</span><input type="text" class="lesson-title" data-lesson-title="${l.id}" value="${esc(l.title)}" maxlength="100" placeholder="Название урока" aria-label="Название урока ${n}"><label class="free-toggle" title="${!l.isFree && freeLeft <= 0 ? 'Бесплатных уроков может быть не больше двух' : 'Урок можно смотреть до покупки'}"><input type="checkbox" data-free="${l.id}" ${l.isFree ? 'checked' : ''} ${!l.isFree && freeLeft <= 0 ? 'disabled' : ''}>Бесплатный</label><span class="lesson-tools"><button type="button" class="icon-button" data-action="move" data-dir="up" data-id="${l.id}" ${li === 0 ? 'disabled' : ''} title="Выше" aria-label="Переместить урок ${n} выше">${icon('arrow-up')}</button><button type="button" class="icon-button" data-action="move" data-dir="down" data-id="${l.id}" ${li === m.lessons.length - 1 ? 'disabled' : ''} title="Ниже" aria-label="Переместить урок ${n} ниже">${icon('arrow-down')}</button>${c.rules.canDeleteLessons ? `<button type="button" class="icon-button" data-action="delete-lesson" data-id="${l.id}" title="Удалить урок" aria-label="Удалить урок ${n}">${icon('trash-2')}</button>` : ''}</span></div><div class="video-zone" id="zone-${l.id}">${zoneHTML(l)}</div></li>`; }).join('')}</ol>
      <button type="button" class="text-link add-lesson" data-action="add-lesson" data-id="${m.id}">${icon('plus')}Добавить урок</button></div>`;
  }

  function panelHTML() {
    const c = current, ready = c.checklist.every(x => x.ok);
    const checklist = `<ul class="checklist">${c.checklist.map(x => `<li class="${x.ok ? 'ok' : ''}">${icon(x.ok ? 'circle-check' : 'circle')}${esc(x.label)}</li>`).join('')}</ul>`;
    const stats = `<dl class="panel-stats"><div><dt>Учеников</dt><dd>${nf.format(c.students)}</dd></div><div><dt>Выручка</dt><dd>${tenge(c.revenue)}</dd></div><div><dt>Оценка</dt><dd>${c.reviews ? rating(c.rating) : '—'}</dd></div></dl>`;
    let body = '';
    if (c.status === 'draft') body = `${c.moderationNote ? `<div class="notice rejected-note">${icon('undo-2')}<span><b>Модерация вернула курс:</b> ${esc(c.moderationNote)}</span></div>` : ''}${checklist}<button class="btn wide" data-action="submit" ${ready && profile?.verified ? '' : 'disabled'}>${icon('send')}Отправить на модерацию</button>${!profile?.verified ? '<p class="fine-print">Отправка станет доступна после подтверждения вашей личности модератором.</p>' : ready ? '' : '<p class="fine-print">Выполните все пункты, чтобы отправить курс.</p>'}`;
    if (c.status === 'review') body = `${checklist}<div class="notice">${icon('hourglass')} На модерации с ${fmtDate(c.submittedAt)}. Проверка обычно занимает до 2 рабочих дней.</div><button class="btn secondary wide" data-action="withdraw">Отозвать с модерации</button>`;
    if (c.status === 'published') body = `${stats}<a class="btn ghost wide" href="/#product/${c.id}" target="_blank" rel="noopener">${icon('external-link')}Открыть в каталоге</a><button class="btn secondary wide" data-action="hide">${icon('eye-off')}Скрыть из каталога</button>`;
    if (c.status === 'hidden') body = `${stats}<div class="notice">Новые ученики курс не видят. Купившие сохраняют доступ.</div><button class="btn wide" data-action="unhide">${icon('eye')}Вернуть в каталог</button>`;
    const del = c.students > 0 ? `<p class="locked-line">${icon('lock')}Удалить нельзя: ${nf.format(c.students)} ${plural(c.students, 'ученик оплатил', 'ученика оплатили', 'учеников оплатили')} доступ.</p>` : c.rules.canDelete ? `<button class="text-link danger" data-action="delete-course">${icon('trash-2')}Удалить курс</button>` : '';
    return `<div class="panel-card"><span class="tiny-meta">Статус</span><div class="panel-status">${courseChip(c)}</div><p class="save-state" id="saveState" aria-live="polite">Изменения сохраняются автоматически</p>${body}<button class="btn ghost wide" data-action="preview">${icon('eye')}Как увидит ученик</button>${del}</div>
      <div class="panel-card subtle"><h3>Что проверяет модерация</h3><ul class="plain-list"><li>Видео открывается и слышен звук</li><li>Нет обещаний доходности и персональных торговых советов</li><li>Описание соответствует содержанию</li></ul><a class="text-link" href="#rights">Все права эксперта ${icon('arrow-right')}</a></div>`;
  }

  function editorHTML() {
    const c = current, lock = !c.rules.canEdit, live = c.status === 'published' || c.status === 'hidden', ls = allLessons(c);
    let offset = 0;
    const modules = c.modules.map((m, mi) => { const h = moduleHTML(m, mi, offset); offset += m.lessons.length; return h; }).join('');
    const custom = c.coverUrl && c.coverUrl.startsWith('/media/');
    return `${breadcrumb([['Курсы', '#courses'], [c.title || 'Новый курс']])}
      <div class="heading-row"><h1 id="courseHead">${esc(c.title || 'Новый курс')}</h1>${courseChip(c)}</div><p class="subtitle" id="courseCategory">${esc(c.categoryName)}</p>
      ${lock ? `<div class="notice lock-note">${icon('lock')}Курс на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.</div>` : ''}
      ${live ? `<div class="notice">${icon('info')}Курс уже продаётся. Можно править тексты, менять цену, заменять видео и добавлять уроки. Удалять уроки нельзя: ученики уже проходят курс.</div>` : ''}
      <div class="editor"><div class="editor-main"><fieldset class="editor-fieldset" ${lock ? 'disabled' : ''}>
        <section class="editor-section"><h2>Основное</h2>
          <label class="form-label">Название курса<input type="text" id="f-title" data-field="title" maxlength="90" value="${esc(c.title)}" placeholder="Например: Читаем отчётность и оцениваем бизнес"></label>
          <div class="field-row"><label class="form-label">Направление<select id="f-category" data-field="category">${CATEGORIES.map(([id, n]) => `<option value="${id}" ${c.category === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label class="form-label">Цена, ₸<input type="number" id="f-price" data-field="price" min="0" step="100" inputmode="numeric" value="${c.price ?? ''}" placeholder="19 900"><span class="field-hint">${live ? 'Новая цена действует только для новых покупок.' : '0 — курс будет бесплатным.'}</span></label></div>
          <label class="form-label">Описание<textarea id="f-description" data-field="description" rows="5" maxlength="1500" placeholder="Чему научится ученик и для кого этот курс">${esc(c.description)}</textarea><span class="field-hint" id="descCounter">${c.description.length} / 1500</span></label>
          <div class="form-label">Обложка<div class="cover-picker">${COVERS.map(k => `<button type="button" class="cover-option ${c.coverUrl === `/assets/${k}.jpg` ? 'active' : ''}" data-action="cover" data-id="${k}" aria-pressed="${c.coverUrl === `/assets/${k}.jpg`}" aria-label="Обложка из библиотеки"><img src="assets/${k}.jpg" alt=""></button>`).join('')}${custom ? `<span class="cover-option active"><img src="${esc(c.coverUrl)}" alt="Своя обложка"></span>` : ''}<label class="cover-option cover-upload">${icon('image')}<span>Загрузить</span><input type="file" id="coverInput" class="sr-only" accept="image/jpeg,image/png,image/webp"></label></div></div>
        </section>
        <section class="editor-section"><div class="section-title-row"><h2>Программа</h2><span class="tiny-meta" id="programMeta"></span></div>
          ${modules}
          <button type="button" class="btn secondary" data-action="add-module">${icon('plus')}Добавить модуль</button>
        </section>
      </fieldset></div><aside class="editor-panel" id="coursePanel">${panelHTML()}</aside></div>`;
  }

  async function courseEditor(id) {
    try { current = await api.get(`/studio/courses/${id}`); }
    catch (e) { if (e.status === 404) return empty('Курс не найден', 'Возможно, его удалили.', 'clapperboard', `<a class="btn secondary" href="#courses">К курсам</a>`); throw e; }
    return editorHTML();
  }
  function programMeta() {
    const m = $('#programMeta'); if (!m || !current) return;
    const ls = allLessons(current);
    m.textContent = `${ls.length} ${plural(ls.length, 'урок', 'урока', 'уроков')} · ${totalTime(current.duration)} · бесплатных ${MAX_FREE - current.rules.freeLessonsLeft} из ${MAX_FREE}`;
  }
  const rerenderEditor = () => { const y = scrollY; $('.page', main).innerHTML = editorHTML() + footer(); icons(); hydrateThumbs(main); programMeta(); scrollTo(0, y); };
  function refreshPanel() { const p = $('#coursePanel'); if (p) { p.innerHTML = panelHTML(); icons(); } programMeta(); }
  function refreshZone(lid) {
    const z = $(`#zone-${lid}`), l = current && allLessons(current).find(x => x.id === lid);
    if (z && l) { z.innerHTML = zoneHTML(l); icons(); hydrateThumbs(z); }
  }
  function hydrateThumbs(root) {
    $$('video[data-thumb]', root).forEach(v => { if (v.src) return; v.onerror = () => { v.parentElement?.classList.add('demo'); v.remove(); }; v.src = api.mediaUrl(`/lessons/${v.dataset.thumb}/video`) + '#t=1'; });
  }
  const saveTimers = {};
  function saveSoon(key, fn) {
    clearTimeout(saveTimers[key]);
    const s = $('#saveState'); if (s) s.textContent = 'Сохраняем…';
    saveTimers[key] = setTimeout(async () => {
      try { const res = await fn(); if (res?.modules) current = res; refreshPanel(); const st = $('#saveState'); if (st) st.textContent = 'Сохранено'; }
      catch (e) { toast(e.message); const st = $('#saveState'); if (st) st.textContent = 'Не сохранено: ' + e.message; }
    }, 600);
  }

  const readDuration = file => new Promise(res => {
    const v = document.createElement('video'), u = URL.createObjectURL(file); let done = false;
    const finish = d => { if (done) return; done = true; URL.revokeObjectURL(u); res(d); };
    v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => finish(null); setTimeout(() => finish(null), 8000); v.src = u;
  });
  async function handleFile(lid, file) {
    if (!current || !file || !current.rules.canEdit || uploads[lid]) return;
    const okType = /^video\/(mp4|quicktime|webm|x-m4v)$/.test(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
    if (!okType) { toast('Нужен видеофайл MP4, MOV или WEBM.'); return; }
    if (file.size > 4 * 1024 ** 3) { toast('Файл больше 4 ГБ. Сожмите видео или разделите урок на части.'); return; }
    const ext = file.name.split('.').pop().toLowerCase();
    const type = /^video\/(mp4|quicktime|webm|x-m4v)$/.test(file.type) ? file.type : ({ mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v' }[ext] || 'video/mp4');
    const up = uploads[lid] = { name: file.name, size: file.size, pct: 0 };
    refreshZone(lid);
    const dur = await readDuration(file);
    const task = api.upload(`/studio/lessons/${lid}/video`, file, {
      type, headers: { 'X-File-Name': encodeURIComponent(file.name), ...(dur ? { 'X-Duration': String(dur) } : {}) },
      onProgress: p => { up.pct = Math.round(p * 100); const z = $(`#zone-${lid}`); if (z) { const b = $('.progress span', z); if (b) b.style.width = up.pct + '%'; const t = $('[data-pct]', z); if (t) t.textContent = up.pct; } }
    });
    up.abort = task.abort;
    const courseId = current.id;
    try {
      await task.promise;
      delete uploads[lid];
      if (current?.id === courseId) { current = await api.get(`/studio/courses/${courseId}`); refreshZone(lid); refreshPanel(); }
      toast(`Видео «${file.name}» загружено`);
    } catch (e) {
      delete uploads[lid];
      if (current?.id === courseId) refreshZone(lid);
      toast(e.code === 'aborted' ? 'Загрузка отменена' : e.message);
    }
  }
  function coverFromFile(file) {
    if (!current || !file) return;
    if (!/^image\//.test(file.type)) { toast('Нужна картинка JPG, PNG или WEBP.'); return; }
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const w = Math.min(1280, img.width), h = Math.round(img.height * w / img.width), cv = document.createElement('canvas');
      cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(u);
      cv.toBlob(async blob => {
        try { current = await api.upload(`/studio/courses/${current.id}/cover`, blob, { type: 'image/jpeg' }).promise; rerenderEditor(); toast('Обложка обновлена'); }
        catch (e) { toast(e.message); }
      }, 'image/jpeg', .85);
    };
    img.onerror = () => { URL.revokeObjectURL(u); toast('Не удалось открыть картинку.'); };
    img.src = u;
  }
  function preview() {
    const c = current, ls = allLessons(c), free = ls.filter(l => l.isFree);
    openDialog('Как увидит ученик', `<article class="preview-card"><div class="preview-cover">${coverHTML(c.coverUrl)}</div><div class="preview-body"><span class="product-kicker">${esc(c.categoryName)}</span><h3>${esc(c.title || 'Новый курс')}</h3><span class="expert-inline">${profile?.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : ''}<span>${esc(me.name)}</span></span><p>${esc(c.description) || 'Описание пока не заполнено.'}</p><div class="product-meta"><span>${icon('play')}${ls.length} ${plural(ls.length, 'урок', 'урока', 'уроков')}</span><span>${icon('clock-3')}${totalTime(c.duration)}</span></div><div class="product-bottom"><strong>${money(c.price)}</strong></div></div></article>${free.length ? `<h4 class="preview-sub">Можно посмотреть до покупки</h4><ul class="plain-list">${free.map(l => `<li>${esc(l.title || 'Урок без названия')}</li>`).join('')}</ul>` : ''}`, 'wide');
  }
  function playLesson(lid, title) {
    openDialog(esc(title || 'Урок'), `<video class="player" controls playsinline src="${esc(api.mediaUrl(`/lessons/${lid}/video`))}"></video><p class="fine-print" id="playerNote"></p>`, 'wide');
    $('#modal video').addEventListener('error', () => { $('#playerNote').textContent = 'Браузер не может воспроизвести этот файл. Попробуйте MP4 с кодеком H.264.'; }, { once: true });
  }

  // ---------- Sessions, clubs, ideas ----------
  async function productsView() {
    const all = await api.get('/studio/products');
    const list = all.filter(p => productFilter === 'all' || p.mode === productFilter);
    const filters = [['all', 'Все'], ...Object.entries(MODE_NAMES)];
    return `<div class="heading-row"><h1>Встречи, клубы, идеи</h1><button class="btn" data-action="new-product">${icon('plus')}Создать</button></div><p class="subtitle">Консультации и сопровождение по расписанию, клубы и чаты по подписке, инвестиционные идеи и обзоры. Каждый продукт проходит модерацию.</p>
      <div class="tabs" role="tablist" aria-label="Направление">${filters.map(([id, t]) => `<button role="tab" aria-selected="${productFilter === id}" class="tab ${productFilter === id ? 'active' : ''}" data-action="product-filter" data-id="${id}">${t} <span class="tab-count">${id === 'all' ? all.length : all.filter(p => p.mode === id).length}</span></button>`).join('')}</div>
      ${list.length ? `<div class="course-list">${list.map(p => `<article class="course-row"><a class="course-cover" href="#product/${p.id}" tabindex="-1" aria-hidden="true">${coverHTML(p.coverUrl)}</a><div class="course-info"><div class="course-meta">${productChip(p)}<span>${esc(p.typeName)}</span>${p.status === 'draft' && p.checklistLeft ? `<span>До модерации: ${p.checklistLeft} ${plural(p.checklistLeft, 'пункт', 'пункта', 'пунктов')}</span>` : ''}</div><h2><a href="#product/${p.id}">${esc(p.title || 'Новый продукт')}</a></h2><p>${esc(p.meta)}${p.nextSlot ? ` · ближайшее свободное время ${esc(shortFmt.format(new Date(p.nextSlot)))}` : ''} · обновлён ${fmtDate(p.updatedAt)}</p></div><dl class="course-stats"><div><dt>${p.productKind === 'subscription' ? 'Участников' : 'Покупок'}</dt><dd>${nf.format(p.buyers)}</dd></div><div><dt>Выручка</dt><dd>${tenge(p.revenue)}</dd></div><div><dt>Цена</dt><dd>${money(p.price)}</dd></div></dl><a class="btn secondary" href="#product/${p.id}">${p.status === 'draft' ? 'Продолжить' : 'Открыть'}${icon('arrow-right')}</a></article>`).join('')}</div>` : empty('Здесь пока пусто', 'Создайте консультацию, клуб или инвестиционную идею.', 'calendar-clock', `<button class="btn" data-action="new-product">${icon('plus')}Создать</button>`)}`;
  }
  function newProductDialog(mode) {
    const groups = Object.entries(MODE_NAMES).filter(([m]) => !mode || m === mode);
    openDialog('Что создаём?', `${groups.map(([m, n]) => `<h3 class="type-group">${n}</h3><div class="type-grid">${Object.entries(PTYPES).filter(([, t]) => t.mode === m).map(([id, t]) => `<button class="type-option" data-action="create-product" data-id="${id}"><span class="attention-icon">${icon(t.icon)}</span><span><strong>${t.name}</strong><small>${t.text}</small></span></button>`).join('')}</div>`).join('')}<p class="fine-print">Курсы с видеоуроками создаются в разделе «Курсы».</p>`, 'wide');
  }

  const slotDays = slots => { const days = new Map(); for (const s of slots) { const k = new Date(s.startsAt).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(s); } return [...days.values()]; };
  function scheduleHTML() {
    const p = prod, future = p.slots.filter(s => new Date(s.startsAt) > new Date(Date.now() - 3 * 3600e3));
    const booked = future.filter(s => s.bookedBy).length;
    const tomorrow = addDays(1);
    return `<section class="editor-section" id="schedule"><div class="section-title-row"><h2>Расписание</h2><span class="tiny-meta">${future.length - booked} ${plural(future.length - booked, 'свободное окно', 'свободных окна', 'свободных окон')} · ${booked} ${plural(booked, 'запись', 'записи', 'записей')}</span></div>
      <p class="field-hint">Добавьте время, когда вы готовы провести встречу. Ученик выберет окно после покупки. Время — по часовому поясу вашего компьютера.</p>
      <form id="slotForm" class="slot-form"><label class="form-label">Дата<input type="date" name="date" min="${tomorrow}" max="${addDays(180)}" value="${tomorrow}" required></label><label class="form-label">Время<input type="time" name="time" value="12:00" step="900" required></label><label class="form-label">Повторить<select name="repeat"><option value="1">Только этот день</option><option value="4">Каждую неделю, 4 раза</option><option value="8">Каждую неделю, 8 раз</option><option value="12">Каждую неделю, 12 раз</option></select></label><button class="btn secondary" type="submit">${icon('plus')}Добавить</button></form>
      ${future.length ? `<div class="slot-manager">${slotDays(future).map(list => `<div class="slot-day-row"><span class="slot-day-name">${esc(dayFmt.format(new Date(list[0].startsAt)))}</span><div class="slot-chips">${list.map(s => s.bookedBy
        ? `<span class="slot-chip booked">${icon('user-round')}<b>${hourFmt.format(new Date(s.startsAt))}</b>${esc(s.bookedBy)}<button type="button" class="text-link" data-action="cancel-booking" data-id="${s.id}" data-when="${esc(fmtWhen(s.startsAt))}" data-who="${esc(s.bookedBy)}">Отменить</button></span>`
        : `<span class="slot-chip"><b>${hourFmt.format(new Date(s.startsAt))}</b><button type="button" class="icon-button" data-action="delete-slot" data-id="${s.id}" title="Убрать окно" aria-label="Убрать окно ${esc(fmtWhen(s.startsAt))}">${icon('x')}</button></span>`).join('')}</div></div>`).join('')}</div>` : '<p class="subtitle">Свободного времени пока нет.</p>'}</section>`;
  }
  function productPanelHTML() {
    const p = prod, ready = p.checklist.every(x => x.ok);
    const checklist = `<ul class="checklist">${p.checklist.map(x => `<li class="${x.ok ? 'ok' : ''}">${icon(x.ok ? 'circle-check' : 'circle')}${esc(x.label)}</li>`).join('')}</ul>`;
    const stats = `<dl class="panel-stats"><div><dt>${p.productKind === 'subscription' ? 'Участников' : 'Покупок'}</dt><dd>${nf.format(p.buyers)}</dd></div><div><dt>Выручка</dt><dd>${tenge(p.revenue)}</dd></div><div><dt>Оценка</dt><dd>${p.reviews ? rating(p.rating) : '—'}</dd></div></dl>`;
    let body = '';
    if (p.status === 'draft') body = `${p.moderationNote ? `<div class="notice rejected-note">${icon('undo-2')}<span><b>Модерация вернула продукт:</b> ${esc(p.moderationNote)}</span></div>` : ''}${checklist}<button class="btn wide" data-action="product-submit" ${ready && profile?.verified ? '' : 'disabled'}>${icon('send')}Отправить на модерацию</button>${!profile?.verified ? '<p class="fine-print">Отправка станет доступна после подтверждения вашей личности модератором.</p>' : ready ? '' : '<p class="fine-print">Выполните все пункты, чтобы отправить продукт.</p>'}`;
    if (p.status === 'review') body = `${checklist}<div class="notice">${icon('hourglass')} На модерации с ${fmtDate(p.submittedAt)}. Расписание можно пополнять и сейчас.</div><button class="btn secondary wide" data-action="product-withdraw">Отозвать с модерации</button>`;
    if (p.status === 'published') body = `${stats}<a class="btn ghost wide" href="/#product/${p.id}" target="_blank" rel="noopener">${icon('external-link')}Открыть в каталоге</a><button class="btn secondary wide" data-action="product-hide">${icon('eye-off')}Скрыть из каталога</button>`;
    if (p.status === 'hidden') body = `${stats}<div class="notice">Новые ученики продукт не видят. Купившие сохраняют доступ.</div><button class="btn wide" data-action="product-unhide">${icon('eye')}Вернуть в каталог</button>`;
    const chat = p.productKind === 'subscription' && p.status !== 'draft' ? `<button class="btn ghost wide" data-action="expert-chat" data-id="${p.id}">${icon('messages-square')}Чат участников</button>` : '';
    const del = p.rules.canDelete ? `<button class="text-link danger" data-action="delete-product">${icon('trash-2')}Удалить продукт</button>` : p.buyers ? `<p class="locked-line">${icon('lock')}Удалить нельзя: продукт уже покупали. Можно скрыть.</p>` : '';
    return `<div class="panel-card"><span class="tiny-meta">Статус</span><div class="panel-status">${productChip(p)}</div><p class="save-state" id="saveState" aria-live="polite">Изменения сохраняются автоматически</p>${body}${chat}${del}</div>
      <div class="panel-card subtle"><h3>Правила</h3><ul class="plain-list">${p.productKind === 'sessions' ? '<li>Ученик отменяет запись не позже чем за 24 часа, вы — в любое время</li><li>Занятое окно нельзя удалить, только отменить запись</li><li>Возврат — 14 дней, пока не назначена ни одна встреча</li>' : p.productKind === 'subscription' ? '<li>Подписка на выбранный срок, продление повторной оплатой</li><li>Чат видят только участники с действующей подпиской</li><li>Подписка не возвращается</li>' : '<li>До покупки ученик видит начало текста</li><li>Бесплатный материал открыт всем</li><li>Без обещаний доходности и персональных советов</li>'}</ul><a class="text-link" href="#rights">Все права эксперта ${icon('arrow-right')}</a></div>`;
  }
  function productEditorHTML() {
    const p = prod, t = PTYPES[p.type], lock = !p.rules.canEdit, live = p.status === 'published' || p.status === 'hidden';
    const custom = p.coverUrl && p.coverUrl.startsWith('/media/');
    let specific = '';
    if (t.kind === 'sessions') specific = `<section class="editor-section"><h2>Встречи</h2><div class="field-row three"><label class="form-label">Длительность встречи<select data-pfield="durationMin">${[30, 45, 60, 90, 120].map(m => `<option value="${m}" ${p.durationMin === m ? 'selected' : ''}>${m} мин</option>`).join('')}</select></label>${p.type === 'consultation' ? '<div class="form-label">Встреч в покупке<div class="locked-field"><span>Одна</span></div></div>' : `<label class="form-label">Встреч в пакете<input type="number" data-pfield="sessions" min="1" max="52" value="${p.sessions ?? ''}" ${p.rules.canChangePackage ? '' : 'disabled'}><span class="field-hint">${p.rules.canChangePackage ? 'Сколько встреч получает ученик' : 'После публикации размер пакета не меняется'}</span></label>`}<label class="form-label">Ссылка на видеозвонок<input type="url" data-pfield="meetingUrl" maxlength="300" value="${esc(p.meetingUrl || '')}" placeholder="https://meet.google.com/…"><span class="field-hint">Ученик увидит ссылку только после записи</span></label></div></section>`;
    if (t.kind === 'subscription') specific = `<section class="editor-section"><h2>${p.type === 'clubs' ? 'Клуб' : 'Чат'}</h2><div class="field-row"><label class="form-label">Срок подписки, дней<input type="number" data-pfield="periodDays" min="7" max="365" value="${p.periodDays ?? 30}"><span class="field-hint">Продление прибавляет такой же срок</span></label>${p.type === 'clubs' ? `<label class="form-label">Ссылка на встречи клуба<input type="url" data-pfield="meetingUrl" maxlength="300" value="${esc(p.meetingUrl || '')}" placeholder="https://zoom.us/j/…"><span class="field-hint">Видят только участники с действующей подпиской</span></label>` : ''}</div><label class="form-label">${p.type === 'clubs' ? 'Расписание встреч' : 'Когда вы отвечаете в чате'}<input type="text" data-pfield="scheduleNote" maxlength="300" value="${esc(p.scheduleNote || '')}" placeholder="${p.type === 'clubs' ? 'Каждый четверг в 19:00 по Астане' : 'По будням с 10:00 до 18:00'}"></label></section>`;
    if (t.kind === 'material') specific = `<section class="editor-section"><h2>Текст</h2><label class="form-label">${p.type === 'reviews' ? 'Обзор' : 'Идея'} целиком<textarea data-pfield="content" rows="16" maxlength="20000" placeholder="Гипотеза, на чём она основана, главные риски. Подзаголовок — строка, которая начинается с ## ">${esc(p.content)}</textarea><span class="field-hint" id="contentCounter">${p.content.length} символов · минимум 300 · до покупки видно первые 400 · подзаголовок начинается с «## »</span></label></section>`;
    return `${breadcrumb([['Встречи, клубы, идеи', '#products'], [p.title || 'Новый продукт']])}
      <div class="heading-row"><h1 id="productHead">${esc(p.title || 'Новый продукт')}</h1>${productChip(p)}</div><p class="subtitle">${esc(p.modeName)} · ${esc(p.typeName)}</p>
      ${lock ? `<div class="notice lock-note">${icon('lock')}Продукт на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.</div>` : ''}
      ${live ? `<div class="notice">${icon('info')}Продукт уже продаётся. Новая цена действует только для новых покупок.</div>` : ''}
      <div class="editor"><div class="editor-main"><fieldset class="editor-fieldset" ${lock ? 'disabled' : ''}>
        <section class="editor-section"><h2>Основное</h2>
          <label class="form-label">Название<input type="text" id="p-title" data-pfield="title" maxlength="90" value="${esc(p.title)}" placeholder="${t.kind === 'sessions' ? 'Например: Разбор вашего портфеля' : t.kind === 'subscription' ? 'Например: Клуб долгосрочных инвесторов' : 'Например: Почему я смотрю на денежный поток'}"></label>
          <label class="form-label">Цена, ₸<input type="number" id="p-price" data-pfield="price" min="0" step="100" inputmode="numeric" value="${p.price ?? ''}" placeholder="15 000"><span class="field-hint">${t.kind === 'subscription' ? 'За срок подписки. ' : t.kind === 'sessions' && p.type !== 'consultation' ? 'За весь пакет. ' : ''}0 — бесплатно.</span></label>
          <label class="form-label">Описание<textarea id="p-description" data-pfield="description" rows="5" maxlength="1500" placeholder="Кому подойдёт и что ученик получит">${esc(p.description)}</textarea><span class="field-hint" id="pDescCounter">${p.description.length} / 1500 · минимум 80</span></label>
          <div class="form-label">Обложка<div class="cover-picker">${COVERS.map(k => `<button type="button" class="cover-option ${p.coverUrl === `/assets/${k}.jpg` ? 'active' : ''}" data-action="product-cover" data-id="${k}" aria-pressed="${p.coverUrl === `/assets/${k}.jpg`}" aria-label="Обложка из библиотеки"><img src="assets/${k}.jpg" alt=""></button>`).join('')}${custom ? `<span class="cover-option active"><img src="${esc(p.coverUrl)}" alt="Своя обложка"></span>` : ''}<label class="cover-option cover-upload">${icon('image')}<span>Загрузить</span><input type="file" id="productCoverInput" class="sr-only" accept="image/jpeg,image/png,image/webp"></label></div></div>
        </section>${specific}
      </fieldset>${t.kind === 'sessions' ? scheduleHTML() : ''}</div><aside class="editor-panel" id="productPanel">${productPanelHTML()}</aside></div>`;
  }
  async function productEditor(id) {
    try { prod = await api.get(`/studio/products/${id}`); }
    catch (e) { if (e.status === 404) return empty('Продукт не найден', 'Возможно, его удалили.', 'calendar-clock', `<a class="btn secondary" href="#products">К списку</a>`); throw e; }
    return productEditorHTML();
  }
  const rerenderProduct = () => { const y = scrollY; $('.page', main).innerHTML = productEditorHTML() + footer(); icons(); scrollTo(0, y); };
  function refreshProductPanel() { const p = $('#productPanel'); if (p) { p.innerHTML = productPanelHTML(); icons(); } }
  const productAction = (path, msg, button) => guard(async () => { prod = await api.post(`/studio/products/${prod.id}/${path}`); rerenderProduct(); toast(msg); }, button);
  function productCoverFromFile(file) {
    if (!prod || !file) return;
    if (!/^image\//.test(file.type)) { toast('Нужна картинка JPG, PNG или WEBP.'); return; }
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const w = Math.min(1280, img.width), h = Math.round(img.height * w / img.width), cv = document.createElement('canvas');
      cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(u);
      cv.toBlob(async blob => {
        try { prod = await api.upload(`/studio/products/${prod.id}/cover`, blob, { type: 'image/jpeg' }).promise; rerenderProduct(); toast('Обложка обновлена'); }
        catch (e) { toast(e.message); }
      }, 'image/jpeg', .85);
    };
    img.onerror = () => { URL.revokeObjectURL(u); toast('Не удалось открыть картинку.'); };
    img.src = u;
  }

  // Club chat for experts and moderators: new messages are polled every 5 seconds.
  const chatMsg = m => `<div class="chat-message ${m.mine ? 'self' : ''} ${m.isExpert ? 'expert' : ''}" data-id="${m.id}"><strong>${esc(m.mine ? 'Вы' : m.author)}</strong>${esc(m.text)}<small>${esc(shortFmt.format(new Date(m.createdAt)))}</small></div>`;
  function appendChat(list) {
    const box = $('#chatMessages'); if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    for (const m of list) { if (box.querySelector(`[data-id="${m.id}"]`)) continue; $('#chatEmpty')?.remove(); box.insertAdjacentHTML('beforeend', chatMsg(m)); if (m.createdAt > chatLast) chatLast = m.createdAt; }
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  async function openChat(id, title) {
    const msgs = await api.get(`/products/${id}/messages`);
    chatLast = msgs.at(-1)?.createdAt || '';
    openDialog(esc(title || 'Чат'), `<p class="fine-print">Участники видят ваше полное имя. Не давайте персональных торговых рекомендаций и не обещайте доходность.</p><div class="chat-messages" id="chatMessages" aria-live="polite">${msgs.length ? msgs.map(chatMsg).join('') : '<p class="fine-print" id="chatEmpty">Сообщений пока нет.</p>'}</div><form class="chat-form" id="chatForm" data-product="${id}"><input type="text" name="message" required maxlength="1000" aria-label="Сообщение" placeholder="Сообщение участникам" autocomplete="off"><button class="btn" type="submit" title="Отправить" aria-label="Отправить">${icon('send')}</button></form>`, 'wide');
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    clearInterval(chatTimer);
    chatTimer = setInterval(async () => {
      if (!modal.open || !$('#chatForm')) { clearInterval(chatTimer); return; }
      try { appendChat(await api.get(`/products/${id}/messages?after=${encodeURIComponent(chatLast)}`)); } catch (_) { /* повторим через 5 секунд */ }
    }, 5000);
  }

  // ---------- Forecasts ----------
  const conditionText = f => {
    const change = (f.targetPrice - f.startPrice) / f.startPrice * 100;
    return `Цена закрытия ${esc(f.ticker)} на ${fmtDate(f.deadline)} ${f.direction === 'up' ? 'не ниже' : 'не выше'} ${usd(f.targetPrice)} (${change > 0 ? '+' : ''}${change.toFixed(1).replace('.', ',')}% от цены публикации).`;
  };
  async function forecastsView() {
    const { stats, forecasts } = await api.get('/studio/forecasts');
    fcList = forecasts;
    const full = stats.open >= stats.openLimit;
    const list = forecasts.filter(f => fcFilter === 'all' || (fcFilter === 'active' ? f.status === 'active' : f.status !== 'active'));
    return `<div class="heading-row"><h1>Прогнозы</h1>${full ? `<button class="btn" disabled>${icon('lock')}Открыто ${stats.open} из ${stats.openLimit}</button>` : `<a class="btn" href="#forecast-new">${icon('plus')}Новый прогноз</a>`}</div>
      <p class="subtitle">Прогноз фиксируется в момент публикации и остаётся в истории, даже если не сбылся. DAL сам записывает условия и итог в блокчейн Solana — кошелёк и криптовалюта не нужны.</p>
      <div class="kpis three"><div class="kpi"><small>Открыто</small><strong>${stats.open} из ${stats.openLimit}</strong><span>лимит одновременно открытых</span></div><div class="kpi"><small>Завершено</small><strong>${stats.done}</strong><span>итог по цене закрытия</span></div><div class="kpi"><small>Условие выполнено</small><strong>${stats.successRate == null ? '—' : String(stats.successRate).replace('.', ',') + '%'}</strong><span>${stats.success} из ${stats.done} · видно ученикам</span></div></div>
      <div class="tabs" role="tablist" aria-label="Фильтр прогнозов">${[['all', 'Все'], ['active', 'Открытые'], ['done', 'Завершённые']].map(([id, t]) => `<button role="tab" aria-selected="${fcFilter === id}" class="tab ${fcFilter === id ? 'active' : ''}" data-action="fc-filter" data-id="${id}">${t}</button>`).join('')}</div>
      ${list.length ? `<div class="fc-grid">${list.map(f => { const active = f.status === 'active', d = daysUntil(f.deadline); return `<article class="fc"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker)}</span><div><strong>${esc(f.name)}</strong><p>${esc(f.ticker)} · USD · ${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div>${chip(...FC_STATUS[f.status])}</div>
        <p class="fc-condition">${conditionText(f)}${active ? ` <b>${d > 0 ? `Через ${d} ${plural(d, 'день', 'дня', 'дней')}` : 'Срок наступил, ждём итога'}</b>` : ''}</p>
        <div class="signal-values"><div><label>При публикации</label><strong>${usd(f.startPrice)}</strong></div><div><label>Цель</label><strong>${usd(f.targetPrice)}</strong></div><div><label>${active ? 'Проверка' : 'Итог'}</label><strong>${active ? fmtDate(f.deadline).replace(/\s\d{4}$/, '') : usd(f.resultPrice)}</strong></div></div>
        <p class="fc-rationale">${esc(f.rationale)}</p>
        ${f.comments.length ? `<ul class="fc-updates">${f.comments.map(u => `<li><small>${fmtDate(u.createdAt)}</small>${esc(u.text)}</li>`).join('')}</ul>` : ''}
        <div class="chain-line">${f.anchor ? `<span class="chip live">${icon('link-2')}Зафиксирован в Solana</span><button class="text-link" data-action="verify-anchor" data-id="${f.id}">Проверить в блокчейне</button>` : f.chain ? `<span class="chip review">${icon('loader')}${f.chain.retrying ? 'Сеть Solana недоступна — DAL повторит запись автоматически' : 'DAL записывает условия в Solana'}</span>` : `<span class="chip review">${icon('link-2')}Опубликован до записи в блокчейн</span><button class="text-link" data-action="anchor" data-id="${f.id}">Зафиксировать через Phantom</button>`}${f.result?.url ? `<a class="text-link" href="${esc(f.result.url)}" target="_blank" rel="noopener">${icon('flag')}Итог записан в Solana</a>` : f.result ? `<span class="chip review">${icon('loader')}Итог записывается в Solana</span>` : ''}</div>
        ${f.rule ? `<p class="fc-rule">${icon('scale')}Правило проверки: <code>${esc(f.rule)}</code></p>` : ''}
        <div class="fc-foot"><span class="locked-line">${icon('lock')}Опубликован ${fmtDate(f.publishedAt)}</span>${active ? `<button class="text-link" data-action="fc-comment" data-id="${f.id}" data-ticker="${esc(f.ticker)}">${icon('message-square')}Комментарий</button>` : ''}</div></article>`; }).join('')}</div>` : empty('Прогнозов пока нет', 'Опубликуйте первый: тикер, цель, срок и обоснование.', 'radio')}`;
  }
  function forecastNew() {
    if (!profile?.verified) return `${breadcrumb([['Прогнозы', '#forecasts'], ['Новый прогноз']])}${empty('Сначала подтверждение', 'Публиковать прогнозы можно после того, как модератор подтвердит вашу личность.', 'lock')}`;
    const d = fcDraft, v = k => esc(d[k] ?? '');
    const err = k => `<span class="field-error" id="err-${k}" hidden></span>`;
    return `${breadcrumb([['Прогнозы', '#forecasts'], ['Новый прогноз']])}<h1>Новый прогноз</h1><p class="subtitle">После публикации условие, цель и срок изменить нельзя.</p>
      <div class="editor"><form id="forecastForm" class="editor-main" novalidate>
        <section class="editor-section"><h2>Инструмент</h2><div class="field-row"><label class="form-label">Тикер<input type="text" id="fc-ticker" name="ticker" maxlength="6" autocomplete="off" placeholder="KSPI" value="${v('ticker')}">${err('ticker')}</label><label class="form-label">Компания или фонд<input type="text" id="fc-name" name="name" maxlength="60" placeholder="Kaspi.kz" value="${v('name')}">${err('name')}</label></div></section>
        <section class="editor-section"><h2>Условие</h2>
          <div class="choice-row" role="radiogroup" aria-label="Направление">${[['up', 'trending-up', 'Рост', 'Цена закрытия не ниже цели'], ['down', 'trending-down', 'Снижение', 'Цена закрытия не выше цели']].map(([id, ic, t, s]) => `<label class="choice"><input type="radio" name="direction" value="${id}" ${(d.direction || 'up') === id ? 'checked' : ''}><span>${icon(ic)}<strong>${t}</strong><small>${s}</small></span></label>`).join('')}</div>
          <div class="field-row three"><label class="form-label">Цена сейчас, $<input type="number" id="fc-start" name="startPrice" min="0.01" step="0.01" value="${v('startPrice')}" placeholder="96"><span class="field-hint">Источник котировок пока не подключён: укажите вручную</span>${err('startPrice')}</label><label class="form-label">Цель, $<input type="number" id="fc-target" name="targetPrice" min="0.01" step="0.01" value="${v('targetPrice')}" placeholder="108">${err('targetPrice')}</label><label class="form-label">Дата проверки<input type="date" id="fc-deadline" name="deadline" min="${addDays(1)}" max="${addDays(365)}" value="${v('deadline')}"><span class="field-hint">От завтра до года</span>${err('deadline')}</label></div>
        </section>
        <section class="editor-section"><h2>Обоснование</h2><label class="form-label">Почему вы так считаете и что может помешать<textarea id="fc-rationale" name="rationale" rows="6" maxlength="2000" placeholder="Гипотеза, на чём она основана и главные риски">${v('rationale')}</textarea><span class="field-hint" id="fcCounter"></span>${err('rationale')}</label></section>
        <label class="check-line"><input type="checkbox" id="fc-ack" name="acknowledged" ${d.acknowledged ? 'checked' : ''}><span>Понимаю, что после публикации прогноз нельзя изменить или удалить, а итог определится по цене закрытия.</span></label>${err('acknowledged')}
        <div id="fcErrors" class="form-errors" role="alert"></div>
        <div class="fee-box">${icon('link-2')}<div><strong>Запись в блокчейн — автоматически</strong><p>После публикации DAL запишет условия и правило проверки в Solana, а после даты проверки — итог. Изменить или удалить их не сможет никто, включая DAL.</p><p class="fee-line">Сетевой сбор: <b>${FORECAST_FEE} ₸</b> за прогноз — удерживается из дохода. Фактическую комиссию сети платит DAL.</p></div></div>
        <div class="form-actions"><button class="btn" type="submit">${icon('send')}Опубликовать прогноз</button><a class="btn secondary" href="#forecasts">Отмена</a></div>
      </form><aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Так прогноз увидят ученики</span><div id="fcPreview"></div></div><div class="panel-card subtle"><h3>Правила прогнозов</h3><ul class="plain-list"><li>Не больше 5 открытых прогнозов одновременно</li><li>По одному тикеру только один открытый прогноз</li><li>Изменить или удалить после публикации нельзя</li><li>Комментарии можно добавлять, они не меняют условие</li><li>Итог определяется автоматически по правилу, заданному при публикации</li></ul><a class="text-link" href="#rights">Все права эксперта ${icon('arrow-right')}</a></div></aside></div>`;
  }
  const readForecast = form => { const fd = new FormData(form); return { ticker: String(fd.get('ticker') || '').trim().toUpperCase(), name: String(fd.get('name') || '').trim(), direction: fd.get('direction') || 'up', startPrice: parseFloat(fd.get('startPrice')), targetPrice: parseFloat(fd.get('targetPrice')), deadline: String(fd.get('deadline') || ''), rationale: String(fd.get('rationale') || '').trim(), acknowledged: fd.get('acknowledged') === 'on' }; };
  function updateFcPreview() {
    const form = $('#forecastForm'); if (!form) return;
    const f = readForecast(form); fcDraft = { ...f, startPrice: form.elements.startPrice.value, targetPrice: form.elements.targetPrice.value };
    const n = f.rationale.length; $('#fcCounter').textContent = n >= 120 ? `${n} / 2000` : `${n} / минимум 120`;
    const ok = f.startPrice > 0 && f.targetPrice > 0 && f.deadline;
    $('#fcPreview').innerHTML = `<div class="fc fc-preview"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker || '—')}</span><div><strong>${esc(f.name || 'Компания')}</strong><p>${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div>${chip(...FC_STATUS.active)}</div><p class="fc-condition">${ok ? conditionText({ ...f, ticker: f.ticker || '—' }) : 'Заполните цену, цель и дату, чтобы увидеть условие.'}</p><div class="fc-foot"><span class="locked-line">${icon('user-round')}${esc(me.name)}</span></div></div>`;
    icons();
  }

  // ---------- Students, reviews, income, profile ----------
  async function studentsView() {
    const [list, courses, products, o] = await Promise.all([api.get(`/studio/students${stFilter !== 'all' ? `?item=${encodeURIComponent(stFilter)}` : ''}`), api.get('/studio/courses'), api.get('/studio/products'), api.get('/studio/overview')]);
    const isLive = c => c.status === 'published' || c.status === 'hidden';
    const liveCourses = courses.filter(isLive), liveProducts = products.filter(isLive);
    return `<h1>Ученики</h1><p class="subtitle">${nf.format(o.students)} ${plural(o.students, 'ученик', 'ученика', 'учеников')} в ${liveCourses.length + liveProducts.length} ${plural(liveCourses.length + liveProducts.length, 'курсе или продукте', 'курсах и продуктах', 'курсах и продуктах')}.</p>
      <div class="notice lock-note">${icon('lock')}Почта и телефоны учеников скрыты. Связь только через платформу: встречи по расписанию и чаты клубов.</div>
      <div class="toolbar"><label class="form-label inline">Показать<select id="stFilter"><option value="all">Всех учеников</option>${liveCourses.length ? `<optgroup label="Курсы">${liveCourses.map(c => `<option value="${c.id}" ${stFilter === c.id ? 'selected' : ''}>${esc(c.title)}</option>`).join('')}</optgroup>` : ''}${liveProducts.length ? `<optgroup label="Встречи, клубы, идеи">${liveProducts.map(p => `<option value="${p.id}" ${stFilter === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</optgroup>` : ''}</select></label></div>
      ${list.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Ученик</th><th>Курс или продукт</th><th>Прогресс</th><th>Последняя активность</th></tr></thead><tbody>${list.map(s => `<tr><td><span class="person"><span class="user-avatar">${esc(s.name[0])}</span>${esc(s.name)}</span></td><td><a class="text-link plain" href="#${s.kind === 'course' ? 'course' : 'product'}/${s.itemId}">${esc(s.itemTitle)}</a></td><td><span class="progress-cell"><span class="progress"><span style="width:${s.progress.percent}%"></span></span>${esc(s.status)}</span></td><td>${fmtDate(s.lastActivity)}</td></tr>`).join('')}</tbody></table></div>` : empty('Учеников пока нет', 'Они появятся, когда кто-то получит доступ к вашему курсу или продукту.', 'users-round')}`;
  }
  async function reviewsView() {
    const all = await api.get('/studio/reviews');
    const open = all.filter(r => !r.reply && !r.report && !r.hidden);
    unanswered = open.length;
    const list = rvFilter === 'open' ? open : all;
    const avg = all.length ? all.reduce((a, r) => a + r.rating, 0) / all.length : null;
    const REPORT = { pending: 'Жалоба отправлена модерации. Пока идёт проверка, отзыв виден ученикам.', kept: 'Модерация оставила отзыв.', removed: 'Модерация скрыла отзыв по жалобе.' };
    return `<div class="heading-row"><h1>Отзывы</h1>${rating(avg)}</div><p class="subtitle">Отзывы нельзя удалить или изменить. Если отзыв нарушает правила, пожалуйтесь, и решение примет модерация.</p>
      <div class="tabs" role="tablist" aria-label="Фильтр отзывов">${[['all', `Все ${all.length}`], ['open', `Без ответа ${open.length}`]].map(([id, t]) => `<button role="tab" aria-selected="${rvFilter === id}" class="tab ${rvFilter === id ? 'active' : ''}" data-action="rv-filter" data-id="${id}">${t}</button>`).join('')}</div>
      ${list.length ? `<div class="review-list">${list.map(r => `<article class="review-card"><div class="review-top"><span class="user-avatar">${esc(r.author[0])}</span><span class="review-who"><strong>${esc(r.author)}</strong><small>${esc(r.courseTitle)} · ${fmtDate(r.createdAt)}</small></span>${rating(r.rating)}</div><p>${esc(r.text)}</p>
        ${r.report ? `<p class="flag-note">${icon('flag')}${REPORT[r.report]}</p>` : ''}
        ${r.reply && editingReply !== r.id ? `<div class="reply"><span class="tiny-meta">Ваш ответ</span><p>${esc(r.reply)}</p><button class="text-link" data-action="edit-reply" data-id="${r.id}">${icon('pencil')}Изменить ответ</button></div>` : r.hidden ? '' : `<form class="reply-form" data-review="${r.id}"><textarea name="reply" rows="2" maxlength="1000" placeholder="Публичный ответ ученику" aria-label="Ответ на отзыв: ${esc(r.author)}">${esc(r.reply || '')}</textarea><button class="btn small" type="submit">${icon('send')}Ответить</button></form>`}
        ${r.report ? '' : `<div class="review-actions"><button class="text-link muted" data-action="report" data-id="${r.id}">${icon('flag')}Пожаловаться</button></div>`}</article>`).join('')}</div>` : empty(rvFilter === 'open' ? 'На все отзывы есть ответ' : 'Отзывов пока нет', 'Новые отзывы появятся здесь.', 'message-square')}`;
  }
  async function incomeView() {
    const s = await api.get('/studio/income');
    const last = s.months.at(-1), max = Math.max(1, ...s.months.map(m => m.gross));
    return `<h1>Доход</h1><p class="subtitle">Продажи, комиссия платформы и выплаты. ${esc(s.payoutsNote)}</p>
      <div class="kpis"><div class="kpi"><small>Продажи · ${last.label.toLowerCase()}</small><strong>${tenge(last.gross)}</strong><span>${last.sales} ${plural(last.sales, 'продажа', 'продажи', 'продаж')}, до комиссии</span></div><div class="kpi"><small>Комиссия Dal · ${s.commissionRate * 100}%</small><strong>−${tenge(last.commission)}</strong><span>с каждой продажи</span></div><div class="kpi"><small>Ваш доход</small><strong>${tenge(last.net)}</strong><span>за ${last.label.toLowerCase()}${last.networkFees ? `, с учётом сетевых сборов −${tenge(last.networkFees)}` : ''}</span></div><div class="kpi"><small>Следующая выплата</small><strong>${fmtDate(s.nextPayout).replace(/\s\d{4}$/, '')}</strong><span>${s.refunds.count ? `возвратов: ${s.refunds.count} на ${tenge(s.refunds.amount)}` : 'возвратов не было'}</span></div></div>
      <section class="chart-card"><div class="section-head"><h2>Продажи по месяцам</h2><span class="tiny-meta">до комиссии, ₸</span></div><div class="bars" role="img" aria-label="Продажи за 6 месяцев: ${s.months.map(m => `${m.label} ${compact(m.gross)}`).join(', ')}">${s.months.map((m, i) => `<div class="bar ${i === s.months.length - 1 ? 'current' : ''}"><span class="bar-value">${m.gross ? compact(m.gross) : '0'}</span><span class="bar-fill" style="height:${Math.round(m.gross / max * 100)}%"></span><span class="bar-label">${m.label}</span></div>`).join('')}</div></section>
      <div class="section-head"><h2>По курсам и продуктам</h2></div>${s.byItem.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Курс или продукт</th><th class="num">Учеников</th><th class="num">Продажи за всё время</th><th class="num">Ваш доход</th></tr></thead><tbody>${s.byItem.map(c => `<tr><td><a class="text-link plain" href="#${c.kind === 'course' ? 'course' : 'product'}/${c.itemId}">${esc(c.title)}</a></td><td class="num">${nf.format(c.students)}</td><td class="num">${tenge(c.revenue)}</td><td class="num">${tenge(c.income)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="subtitle">Продаж пока нет.</p>'}
      <div class="section-head"><h2>Последние продажи</h2></div>${s.recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Дата</th><th>Что купили</th><th>Ученик</th><th class="num">Сумма</th><th class="num">Комиссия</th><th class="num">Вам</th></tr></thead><tbody>${s.recent.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.courseTitle)}</td><td>${esc(r.student)}</td><td class="num">${tenge(r.amount)}</td><td class="num">−${tenge(r.commission)}</td><td class="num">${tenge(r.net)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="subtitle">Продаж пока нет.</p>'}
      ${s.networkFees?.forecasts ? `<p class="rank-context">${icon('link-2')} Сетевые сборы за прогнозы: ${s.networkFees.forecasts} × ${tenge(s.networkFees.perForecast)} = ${tenge(s.networkFees.amount)}. Сбор покрывает запись условий и итога в блокчейн Solana.</p>` : ''}
      <p class="rank-context">Возврат курса — в течение 14 дней, если пройдено меньше 20%. Возврат встреч — в течение 14 дней, пока ни одна не назначена. Подписки и материалы не возвращаются. Сумма возврата списывается с вашего баланса.</p>`;
  }
  async function profileView() {
    profile = await api.get('/studio/profile');
    const label = { name: 'Имя', experience: 'Стаж' };
    return `<h1>Публичный профиль</h1><p class="subtitle">Эти данные ученики видят на вашей странице и в рейтинге экспертов.</p>
      <div class="editor"><form id="profileForm" class="editor-main">
        <div class="verify-line">${icon(profile.verified ? 'badge-check' : 'hourglass')}<span><strong>${profile.verified ? 'Личность и счёт подтверждены' : 'Ждёт подтверждения модератором'}</strong><small>${profile.verified ? `${fmtDate(profile.verifiedAt)} · можно продавать курсы и публиковать прогнозы` : 'До подтверждения курсы можно готовить, но не отправлять на модерацию'}</small></span></div>
        <section class="editor-section"><h2>Данные, которые проверяет модерация</h2>
          <div class="field-row"><div class="form-label">Имя и фамилия<div class="locked-field"><span>${esc(profile.name)}</span><button type="button" class="text-link" data-action="request" data-id="name">Запросить изменение</button></div></div><div class="form-label">Стаж<div class="locked-field"><span>${esc(profile.experience || 'Не указан')}</span><button type="button" class="text-link" data-action="request" data-id="experience">${profile.experience ? 'Запросить изменение' : 'Указать'}</button></div></div></div>
          ${profile.pendingRequests.length ? `<ul class="plain-list pending">${profile.pendingRequests.map(r => `<li>${icon('hourglass')}${label[r.field]}: «${esc(r.value)}» на модерации с ${fmtDate(r.createdAt)}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="editor-section"><h2>Данные, которые можно менять сразу</h2>
          <label class="form-label">Специализация<input type="text" name="specialization" id="p-role" maxlength="80" value="${esc(profile.specialization)}" required></label>
          <label class="form-label">О себе<textarea name="bio" id="p-bio" rows="5" maxlength="800">${esc(profile.bio)}</textarea></label>
          <label class="form-label">Достижения, каждое с новой строки<textarea name="achievements" id="p-ach" rows="4" maxlength="900">${esc(profile.achievements.join('\n'))}</textarea></label>
          <div class="form-label">Фото<div class="avatar-edit"><span class="user-avatar profile-avatar">${profile.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : esc(initials(profile.name))}</span><div><label class="btn secondary small file-btn">${icon('camera')}${profile.hasOwnAvatar ? 'Сменить фото' : 'Загрузить фото'}<input type="file" id="avatarInput" class="sr-only" accept="image/jpeg,image/png,image/webp"></label>${profile.hasOwnAvatar ? `<button type="button" class="text-link" data-action="avatar-remove">${icon('trash-2')}Убрать</button>` : ''}<p class="fine-print">JPG, PNG или WEBP до 5 МБ. Лучше портрет на светлом фоне.</p></div></div></div>
        </section>
        <section class="editor-section"><h2>Соцсети</h2><p class="field-hint">Ссылки появятся на вашей странице. Для Telegram, Instagram и YouTube достаточно @ника.</p>
          <div class="field-row">${SOCIAL_FIELDS.map(([k, n, ph]) => `<label class="form-label">${n}<input type="text" name="social-${k}" maxlength="200" value="${esc(profile.socials[k] || '')}" placeholder="${ph}"><span class="field-error" id="err-${k}" hidden></span></label>`).join('')}</div>
          <button class="btn" type="submit">${icon('check')}Сохранить</button>
        </section>
      </form><aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Так вас видят ученики</span><div class="profile-card">${profile.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : `<span class="user-avatar big-avatar">${esc(initials(profile.name))}</span>`}<strong>${esc(profile.name)}</strong><p>${esc(profile.specialization || 'Специализация не указана')}</p><p class="profile-card-bio">${esc(profile.bio)}</p></div><a class="text-link" href="/#expert/${me.id}" target="_blank" rel="noopener">${icon('external-link')}Открыть мою страницу</a></div></aside></div>`;
  }
  function rightsView() {
    return `<div class="page-topline"><span class="eyebrow">ПРАВИЛА DAL STUDIO</span><span class="chip review">${icon('pencil')}Черновик для обсуждения</span></div><h1>Права эксперта</h1><p class="subtitle rights-intro">Что эксперт делает сам, что проходит модерацию и что запрещено. Сервер соблюдает эти правила: недоступные действия заблокированы и объяснены.</p>
      <div class="legend">${Object.values(LEVELS).map(l => chip(...l)).join('')}</div>
      ${RIGHTS.map(g => `<section class="rights-group"><h2>${icon(g.icon)}${g.group}</h2><div class="rights-table">${g.items.map(([a, l, n]) => `<div class="right-row"><span class="right-action">${a}</span>${chip(...LEVELS[l])}<span class="right-note">${n}</span></div>`).join('')}</div></section>`).join('')}
      <p class="rank-context">Это предложение для обсуждения с командой и юристом. Лимиты, комиссия и сроки выплат указаны для демонстрации.</p>`;
  }

  // ---------- Moderation ----------
  const REASONS = { spam: 'Реклама или спам', abuse: 'Оскорбления', offtopic: 'Не относится к курсу', other: 'Другое' };
  // Blockchain economics: what the 5 ₸ network fees brought in vs. what DAL actually spent on Solana.
  function chainSection(ch) {
    const KIND = { forecast: 'Условия прогнозов', forecast_result: 'Итоги прогнозов', certificate: 'NFT-сертификаты', payment: 'Оплаты в USDC' };
    const balance = ch.collected.totalKzt - ch.spent.kzt;
    const sol = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 6 });
    return `<section class="mod-section"><div class="section-head"><h2>${icon('link-2')}Блокчейн: сборы и расходы</h2><span class="tiny-meta">Solana ${esc(ch.status.cluster)} · 1 SOL ≈ ${nf.format(ch.rates.kztPerSol)} ₸</span></div>
      <div class="kpis"><div class="kpi"><small>Собрано сетевых сборов</small><strong>${tenge(ch.collected.totalKzt)}</strong><span>${ch.collected.orders.n} ${plural(ch.collected.orders.n, 'заказ', 'заказа', 'заказов')} + ${ch.collected.forecasts.n} ${plural(ch.collected.forecasts.n, 'прогноз', 'прогноза', 'прогнозов')}</span></div><div class="kpi"><small>Потрачено в сети</small><strong>${tenge(ch.spent.kzt)}</strong><span>${sol(ch.spent.sol)} SOL: комиссии и депозиты хранения</span></div><div class="kpi"><small>Разница</small><strong class="${balance < 0 ? 'neg' : 'pos'}">${balance < 0 ? '−' : '+'}${tenge(Math.abs(balance))}</strong><span>${balance < 0 ? 'расходы больше сборов' : 'сборы покрывают расходы'}</span></div><div class="kpi"><small>Кошелёк DAL</small><strong>${ch.status.balanceSol == null ? '—' : sol(ch.status.balanceSol) + ' SOL'}</strong><span>в очереди: ${ch.status.queued}</span></div></div>
      ${ch.byKind.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Тип записи</th><th class="num">Записано</th><th class="num">В очереди</th><th class="num">Потрачено, SOL</th><th class="num">В среднем за запись</th></tr></thead><tbody>${ch.byKind.map(k => `<tr><td>${KIND[k.kind] || esc(k.kind)}</td><td class="num">${k.n}</td><td class="num">${k.pending}</td><td class="num">${sol(k.sol)}</td><td class="num">${k.avgKzt == null ? '—' : tenge(k.avgKzt)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${ch.status.lastError ? `<p class="fine-print">${icon('triangle-alert')} <span>Последняя ошибка сети:</span> <code>${esc(ch.status.lastError)}</code>. <span>Записи повторяются автоматически, работа DAL не останавливается.</span></p>` : ''}
      <p class="fine-print">Сетевой сбор — ${ch.rates.networkFee} ₸ за оплаченный заказ с блокчейном и ${ch.rates.forecastNetworkFee} ₸ за прогноз. Запись условий или итога стоит доли тенге. NFT-сертификат дороже: сеть берёт депозит за хранение аккаунта, поэтому он покрывается из комиссии DAL.</p></section>`;
  }
  async function moderationView() {
    const [q, ch] = await Promise.all([api.get('/moderation/queue'), api.get('/moderation/chain').catch(() => null)]);
    const section = (title, ic, n, body) => `<section class="mod-section"><div class="section-head"><h2>${icon(ic)}${title}</h2>${n ? `<span class="chip review">${n}</span>` : ''}</div>${n ? body : '<p class="subtitle">Нет заявок.</p>'}</section>`;
    const total = q.courses.length + q.products.length + q.reports.length + q.profileRequests.length + q.unverifiedExperts.length + q.forecastsToResolve.length;
    return `<div class="page-topline"><span class="eyebrow">МОДЕРАЦИЯ</span><span class="tiny-meta">${total ? `Ждут решения: ${total}` : 'Очередь пуста'}</span></div><h1>Очередь модерации</h1><p class="subtitle">Курсы, консультации, клубы и идеи, жалобы, изменения профилей, подтверждение экспертов и итоги прогнозов.</p>
      ${section('Встречи, клубы и идеи на проверке', 'calendar-clock', q.products.length, `<div class="course-list">${q.products.map(p => `<article class="course-row"><a class="course-cover" href="#review-product/${p.id}" tabindex="-1" aria-hidden="true">${coverHTML(p.coverUrl)}</a><div class="course-info"><div class="course-meta">${productChip(p)}<span>${esc(p.typeName)}</span></div><h2><a href="#review-product/${p.id}">${esc(p.title)}</a></h2><p>${esc(p.expert.name)} · ${esc(p.meta)} · ${money(p.price)} · отправлен ${fmtDate(p.submittedAt)}</p></div><div class="mod-actions"><a class="btn secondary small" href="#review-product/${p.id}">${icon('eye')}Проверить</a><button class="btn small" data-action="approve" data-kind="product" data-id="${p.id}">${icon('check')}Одобрить</button><button class="btn secondary small" data-action="reject" data-kind="product" data-id="${p.id}">${icon('undo-2')}Вернуть эксперту</button></div></article>`).join('')}</div>`)}
      ${section('Курсы на проверке', 'clapperboard', q.courses.length, `<div class="course-list">${q.courses.map(c => `<article class="course-row"><a class="course-cover" href="#review-course/${c.id}" tabindex="-1" aria-hidden="true">${coverHTML(c.coverUrl)}</a><div class="course-info"><div class="course-meta">${courseChip(c)}<span>${esc(c.categoryName)}</span></div><h2><a href="#review-course/${c.id}">${esc(c.title)}</a></h2><p>${esc(c.expert.name)} · ${c.lessons} ${plural(c.lessons, 'урок', 'урока', 'уроков')} · ${money(c.price)} · отправлен ${fmtDate(c.submittedAt)}</p></div><div class="mod-actions"><a class="btn secondary small" href="#review-course/${c.id}">${icon('eye')}Проверить</a><button class="btn small" data-action="approve" data-id="${c.id}">${icon('check')}Одобрить</button><button class="btn secondary small" data-action="reject" data-id="${c.id}">${icon('undo-2')}Вернуть эксперту</button></div></article>`).join('')}</div>`)}
      ${section('Жалобы на отзывы', 'flag', q.reports.length, `<div class="review-list">${q.reports.map(r => `<article class="review-card"><div class="review-top"><span class="review-who"><strong>${esc(r.courseTitle)}</strong><small>Жалоба: ${REASONS[r.reason] || esc(r.reason)} · от ${esc(r.reportedBy)} · ${fmtDate(r.createdAt)}</small></span>${rating(r.rating)}</div><p>${esc(r.text)}</p><div class="mod-actions"><button class="btn secondary small" data-action="report-keep" data-id="${r.id}">Оставить отзыв</button><button class="btn small danger" data-action="report-remove" data-id="${r.id}">${icon('eye-off')}Скрыть отзыв</button></div></article>`).join('')}</div>`)}
      ${section('Изменения профиля', 'user-round', q.profileRequests.length, `<div class="table-wrap"><table class="data-table"><thead><tr><th>Эксперт</th><th>Поле</th><th>Было</th><th>Станет</th><th></th></tr></thead><tbody>${q.profileRequests.map(r => `<tr><td>${esc(r.currentName)}</td><td>${r.field === 'name' ? 'Имя' : 'Стаж'}</td><td>${esc(r.field === 'name' ? r.currentName : r.currentExperience || '—')}</td><td><b>${esc(r.value)}</b></td><td><span class="mod-actions"><button class="btn small" data-action="request-approve" data-id="${r.id}">Одобрить</button><button class="btn secondary small" data-action="request-reject" data-id="${r.id}">Отклонить</button></span></td></tr>`).join('')}</tbody></table></div>`)}
      ${section('Эксперты без подтверждения', 'badge-check', q.unverifiedExperts.length, `<div class="table-wrap"><table class="data-table"><thead><tr><th>Эксперт</th><th>Почта</th><th>Зарегистрирован</th><th></th></tr></thead><tbody>${q.unverifiedExperts.map(e => `<tr><td>${esc(e.name)}</td><td>${esc(e.email)}</td><td>${fmtDate(e.createdAt)}</td><td><button class="btn small" data-action="verify" data-id="${e.id}">${icon('badge-check')}Подтвердить</button></td></tr>`).join('')}</tbody></table></div><p class="fine-print">Перед подтверждением проверьте документ, удостоверяющий личность, и счёт для выплат.</p>`)}
      ${section('Прогнозы: срок наступил', 'radio', q.forecastsToResolve.length, `<div class="fc-grid">${q.forecastsToResolve.map(f => `<article class="fc"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker)}</span><div><strong>${esc(f.name)}</strong><p>${esc(f.expert.name)}</p></div></div>${chip(...FC_STATUS.active)}</div><p class="fc-condition">${conditionText(f)}</p>${f.rule ? `<p class="fc-rule">${icon('scale')}<code>${esc(f.rule)}</code></p>` : ''}<form class="resolve-form" data-id="${f.id}"><label class="form-label">Цена закрытия на ${fmtDate(f.deadline)}, $<input type="number" name="closePrice" min="0.01" step="0.01" required></label><button class="btn small" type="submit">Записать итог</button></form></article>`).join('')}</div><p class="fine-print">Пока источник котировок не подключён, цену закрытия вносит модератор. Итог определяется автоматически по правилу, заданному при публикации, и записывается в Solana.</p>`)}
      ${ch ? chainSection(ch) : ''}`;
  }
  async function reviewCourseView(id) {
    const [c, queue] = await Promise.all([api.get(`/learning/courses/${id}`), api.get('/moderation/queue')]);
    const inQueue = queue.courses.find(x => x.id === id);
    let n = 0;
    return `${breadcrumb([['Модерация', '#moderation'], [c.title]])}<div class="heading-row"><h1>${esc(c.title)}</h1>${courseChip(c)}</div><p class="subtitle">${esc(c.expert.name)} · ${esc(c.categoryName)} · ${money(c.price)}</p>
      <div class="editor"><div class="editor-main"><section class="editor-section"><h2>Описание</h2><p class="mod-text">${esc(c.description)}</p>${coverHTML(c.coverUrl, 'mod-cover')}</section>
      <section class="editor-section"><h2>Уроки и видео</h2>${c.modules.map(m => `<div class="module"><div class="module-head"><span class="module-index">${esc(m.title)}</span></div><ol class="lessons">${m.lessons.map(l => `<li class="lesson"><div class="lesson-top"><span class="lesson-num">${++n}</span><span class="lesson-name">${esc(l.title)}</span>${l.isFree ? chip('Бесплатный', 'live') : ''}${l.videoUrl ? `<button class="btn ghost small" data-action="play" data-id="${l.id}" data-title="${esc(l.title)}">${icon('play')}Смотреть ${l.duration ? clock(l.duration) : ''}</button>` : chip('Нет видео', 'miss')}</div></li>`).join('')}</ol></div>`).join('')}</section></div>
      <aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Решение</span>${inQueue ? `<ul class="checklist">${inQueue.checklist.map(x => `<li class="${x.ok ? 'ok' : ''}">${icon(x.ok ? 'circle-check' : 'circle')}${esc(x.label)}</li>`).join('')}</ul><button class="btn wide" data-action="approve" data-id="${id}">${icon('check')}Одобрить и опубликовать</button><button class="btn secondary wide" data-action="reject" data-id="${id}">${icon('undo-2')}Вернуть с комментарием</button>` : '<p class="subtitle">Курс не на модерации.</p>'}</div><div class="panel-card subtle"><h3>Что проверить</h3><ul class="plain-list"><li>Видео открывается и слышен звук</li><li>Нет обещаний доходности и персональных торговых советов</li><li>Описание соответствует содержанию</li></ul></div></aside></div>`;
  }

  async function reviewProductView(id) {
    const p = await api.get(`/moderation/products/${id}`);
    const t = PTYPES[p.type], inReview = p.status === 'review';
    const facts = [['Тип', p.typeName], ['Цена', money(p.price) + (t.kind === 'subscription' ? ` за ${p.periodDays} дней` : '')]];
    if (t.kind === 'sessions') facts.push(['Встреча', `${p.durationMin} мин${p.type !== 'consultation' ? ` · пакет ${p.sessions}` : ''}`], ['Свободных окон', String(p.slots.filter(s => !s.bookedBy).length)]);
    if (p.meetingUrl) facts.push(['Ссылка на звонок', `<a class="text-link plain" href="${esc(p.meetingUrl)}" target="_blank" rel="noopener nofollow">${esc(p.meetingUrl)}</a>`]);
    if (p.scheduleNote) facts.push(['Расписание', esc(p.scheduleNote)]);
    return `${breadcrumb([['Модерация', '#moderation'], [p.title]])}<div class="heading-row"><h1>${esc(p.title)}</h1>${productChip(p)}</div><p class="subtitle">${esc(p.expert.name)} · ${esc(p.modeName)}</p>
      <div class="editor"><div class="editor-main"><section class="editor-section"><h2>Описание</h2><p class="mod-text">${esc(p.description)}</p>${coverHTML(p.coverUrl, 'mod-cover')}</section>
      <section class="editor-section"><h2>Условия</h2><dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v.startsWith('<a') ? v : esc(v)}</dd></div>`).join('')}</dl></section>
      ${t.kind === 'material' ? `<section class="editor-section"><h2>Текст целиком</h2><article class="readable mod-text">${richText(p.content)}</article></section>` : ''}</div>
      <aside class="editor-panel"><div class="panel-card"><span class="tiny-meta">Решение</span>${inReview ? `<ul class="checklist">${p.checklist.map(x => `<li class="${x.ok ? 'ok' : ''}">${icon(x.ok ? 'circle-check' : 'circle')}${esc(x.label)}</li>`).join('')}</ul><button class="btn wide" data-action="approve" data-kind="product" data-id="${id}">${icon('check')}Одобрить и опубликовать</button><button class="btn secondary wide" data-action="reject" data-kind="product" data-id="${id}">${icon('undo-2')}Вернуть с комментарием</button>` : '<p class="subtitle">Продукт не на модерации.</p>'}</div><div class="panel-card subtle"><h3>Что проверить</h3><ul class="plain-list"><li>Нет обещаний доходности и персональных торговых советов</li><li>Описание соответствует формату и цене</li>${t.kind === 'material' ? '<li>Текст осмысленный, источники указаны</li>' : '<li>Ссылка ведёт на сервис видеосвязи</li>'}</ul></div></aside></div>`;
  }

  // ---------- Render ----------
  let routeKey = '', lastNav = '', seq = 0;
  // ---------- Solana: anchoring and verifying forecasts ----------
  let fcList = [], solWallet = '';
  const memoBlock = m => `<pre class="memo">${esc(m)}</pre>`;
  function anchorDialog(f, note = '') {
    openDialog(`Зафиксировать ${esc(f.ticker)} в Solana`, `<p class="modal-text">Условия прогноза будут записаны в публичный блокчейн Solana (сеть Devnet) транзакцией из вашего кошелька Phantom. После этого любой ученик сможет сверить условия на сайте с записью в блокчейне: переписать прогноз задним числом станет невозможно.</p>${memoBlock(f.memo)}${note}<p class="fine-print">Нужен кошелёк Phantom с включённой сетью Devnet (Настройки → Developer Settings → Testnet mode). Комиссия — доли тестового SOL.</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="anchor-go" data-id="${f.id}">${icon('wallet')}Подключить Phantom и записать</button></div>`, 'wide');
  }
  async function verifyDialog(f) {
    openDialog(`Проверка ${esc(f.ticker)} в Solana`, `<p class="modal-text">Читаем транзакцию из публичного узла Solana…</p>`, 'wide');
    let r;
    try { r = await window.DalSolana.verify(f.anchor.signature, f.memo); } catch (e) { r = { error: e.message }; }
    const body = r.error ? `<div class="notice">${icon('triangle-alert')} Узел Solana не ответил: ${esc(r.error)}. Проверьте вручную по ссылке.</div>`
      : !r.found ? `<div class="notice">${icon('hourglass')} Транзакция пока не найдена в сети. Если её отправили только что, подождите минуту.</div>`
      : r.ok ? `<div class="verify ok">${icon('shield-check')}<span><strong>Условия совпадают с записью в блокчейне</strong><small>Записано ${esc(fmtDate(r.blockTime))} · блок ${nf.format(r.slot)} · кошелёк ${esc(r.signer.slice(0, 4))}…${esc(r.signer.slice(-4))}</small></span></div>`
      : `<div class="verify bad">${icon('shield-alert')}<span><strong>Условия на сайте не совпадают с записью в блокчейне</strong><small>В блокчейне записано:</small></span></div>${memoBlock(r.memo)}`;
    modal.querySelector('.modal-text')?.remove();
    modal.insertAdjacentHTML('beforeend', `${body}<h4 class="preview-sub">Условия на сайте</h4>${memoBlock(f.memo)}<a class="text-link" href="${esc(f.anchor.explorerUrl)}" target="_blank" rel="noopener">${icon('external-link')}Открыть транзакцию в Solana Explorer</a>`);
    icons();
  }

  const studentBlock = () => empty('Dal Studio — для экспертов', 'Вы вошли как ученик. Свои курсы и прогресс смотрите на сайте Dal.', 'clapperboard', `<a class="btn" href="/">${icon('arrow-right')}На сайт Dal</a> <button class="btn secondary" data-action="logout">${icon('log-out')}Выйти</button>`);
  async function view(page, id) {
    if (me.role === 'student') return studentBlock();
    if (me.role === 'moderator') {
      if (page === 'rights') return rightsView();
      if (page === 'review-course') return reviewCourseView(id);
      if (page === 'review-product') return reviewProductView(id);
      return moderationView();
    }
    switch (page) {
      case '': case 'overview': return overview();
      case 'courses': return coursesView();
      case 'course': return courseEditor(id);
      case 'products': return productsView();
      case 'product': return productEditor(id);
      case 'forecasts': return forecastsView();
      case 'forecast-new': return forecastNew();
      case 'students': return studentsView();
      case 'reviews': return reviewsView();
      case 'income': return incomeView();
      case 'profile': return profileView();
      case 'rights': return rightsView();
      default: return empty('Страница не найдена', 'Вернитесь к обзору кабинета.', 'search', `<a class="btn secondary" href="#overview">К обзору</a>`);
    }
  }
  function errorView(e) {
    if (e.code === 'offline') return `<div class="offline">${icon('plug-zap')}<h2>Сервер не отвечает</h2><p>Dal Studio работает вместе с сервером на вашем компьютере. Откройте PowerShell в папке <code>DAL\\server</code>, выполните <code>npm start</code> и откройте <code>http://localhost:4000/studio.html</code>.</p><button class="btn" data-action="reload">${icon('refresh-cw')}Попробовать снова</button></div>`;
    if (e.status === 401) { location.href = api.loginUrl('/studio.html' + location.hash); return ''; }
    return empty('Что-то пошло не так', esc(e.message), 'triangle-alert');
  }
  async function render() {
    const my = ++seq;
    const hash = (location.hash || '#').slice(1), [page, id] = hash.split('/');
    const newRoute = hash !== routeKey; routeKey = hash;
    if (newRoute) editingReply = '';
    renderNav(page); applyAppearance(); icons(); closeMenu();
    const slow = setTimeout(() => { if (my === seq) main.innerHTML = `<div class="page"><div class="loading">Загружаем…</div></div>`; }, 200);
    let html;
    try { html = await view(page, id); } catch (e) { html = errorView(e); }
    clearTimeout(slow);
    if (my !== seq) return;
    main.innerHTML = `<div class="page ${newRoute ? '' : 'still'}">${html}${footer()}</div>`;
    renderNav(page); applyAppearance(); icons(); hydrateThumbs(main); programMeta();
    if (page === 'forecast-new') updateFcPreview();
    document.title = `Dal Studio · ${$('h1', main)?.textContent || ''}`;
    if (newRoute) { window.scrollTo({ top: 0, behavior: 'instant' }); if (lastNav) main.focus({ preventScroll: true }); }
    lastNav = hash;
    // Solana records are written in the background: refresh a few times while one is pending on this page.
    clearTimeout(chainPoll);
    if (newRoute) pollCount = 0;
    const pending = (page === 'forecasts' && fcList.some(f => (f.chain && !f.anchor) || (f.result && !f.result.url)));
    if (pending && pollCount < 20) { pollCount++; chainPoll = setTimeout(() => { if ((location.hash || '#').slice(1) === hash && !$('dialog[open]')) render(); }, 6000); }
  }
  let chainPoll = 0, pollCount = 0;

  // ---------- Dialogs, menus ----------
  let toastTimer, lastFocus, pendingConfirm = null;
  function toast(m) { clearTimeout(toastTimer); const t = $('#toast'); t.textContent = m; t.classList.add('visible'); toastTimer = setTimeout(() => t.classList.remove('visible'), 3400); }
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
    const role = me.role === 'moderator' ? 'Модератор' : profile?.verified ? 'Эксперт · профиль подтверждён' : 'Эксперт · ждёт подтверждения';
    p.innerHTML = `<div class="popover-person"><span class="user-avatar">${profile?.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="">` : esc(initials(me.name))}</span><div><strong>${esc(me.name)}</strong><p>${role}</p></div></div>${me.role === 'expert' ? `<a href="#profile">${icon('user-round')}<span>Публичный профиль</span></a>` : ''}<a href="#rights">${icon('shield-check')}<span>Права экспертов</span></a><a href="/">${icon('external-link')}<span>Сайт Dal для учеников</span></a><div class="popover-separator"></div><button data-action="logout">${icon('log-out')}<span>Выйти</span></button>`;
    p.hidden = false; $('.user-trigger').setAttribute('aria-expanded', 'true'); icons(); $('a, button', p).focus();
  }
  const guard = async (fn, button) => {
    if (button) button.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); } finally { if (button?.isConnected) button.disabled = false; }
  };
  const courseAction = (path, msg, button) => guard(async () => { current = await api.post(`/studio/courses/${current.id}/${path}`); rerenderEditor(); toast(msg); }, button);

  // ---------- Events ----------
  document.addEventListener('click', e => {
    if (e.target.closest('.skip-link')) { e.preventDefault(); main.focus(); return; }
    if (!e.target.closest('#profileMenu,.user-trigger')) closeMenu();
    if (e.target.closest('a[href^="#"]') && modal.open) modal.close();
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    const { action, id } = b.dataset;
    switch (action) {
      case 'theme': prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; savePrefs(); applyAppearance(); icons(); break;
      case 'profile-menu': toggleMenu(); break;
      case 'close-modal': modal.close(); break;
      case 'confirm-ok': { const fn = pendingConfirm; pendingConfirm = null; modal.close(); fn?.(); break; }
      case 'reload': location.reload(); break;
      case 'logout': guard(async () => { await api.logout(); location.href = '/login.html'; }, b); break;
      case 'new-course': guard(async () => { const c = await api.post('/studio/courses', {}); current = (await api.post(`/studio/modules/${c.modules[0].id}/lessons`, {})).course; location.hash = `#course/${c.id}`; }, b); break;
      case 'course-filter': courseFilter = id; render(); break;
      case 'product-filter': productFilter = id; render(); break;
      case 'new-product': newProductDialog(); break;
      case 'create-product': guard(async () => { const p = await api.post('/studio/products', { type: id }); modal.close(); location.hash = `#product/${p.id}`; }, b); break;
      case 'product-cover': guard(async () => { prod = await api.patch(`/studio/products/${prod.id}`, { cover: id }); rerenderProduct(); }, b); break;
      case 'product-submit': guard(async () => {
        try { prod = await api.post(`/studio/products/${prod.id}/submit`); rerenderProduct(); toast('Продукт отправлен на модерацию'); }
        catch (err) { if (Array.isArray(err.details)) toast('Не готово: ' + err.details.join('; ')); else throw err; }
      }, b); break;
      case 'product-withdraw': productAction('withdraw', 'Продукт снова в черновиках', b); break;
      case 'product-unhide': productAction('unhide', 'Продукт снова в каталоге', b); break;
      case 'product-hide': confirmDialog('Скрыть из каталога?', 'Новые ученики не смогут найти и купить продукт. Купившие сохранят доступ, записи на встречи останутся.', 'Скрыть', () => productAction('hide', 'Продукт скрыт из каталога')); break;
      case 'delete-product': confirmDialog('Удалить продукт?', `«${esc(prod.title || 'Новый продукт')}» и его расписание будут удалены без возможности восстановления.`, 'Удалить', () => guard(async () => { await api.del(`/studio/products/${prod.id}`); prod = null; location.hash = '#products'; toast('Продукт удалён'); }), true); break;
      case 'delete-slot': guard(async () => { prod = await api.del(`/studio/slots/${id}`); rerenderProduct(); toast('Окно убрано из расписания'); }, b); break;
      case 'cancel-booking': confirmDialog('Отменить встречу?', `Встреча ${esc(b.dataset.when)} с учеником ${esc(b.dataset.who)} будет отменена. Встреча вернётся ученику в пакет, а окно станет свободным. Предупредите ученика в чате или на встрече заранее.`, 'Отменить встречу', () => guard(async () => { await api.post(`/bookings/${id}/cancel`); prod = await api.get(`/studio/products/${prod.id}`); rerenderProduct(); toast('Встреча отменена'); }), true); break;
      case 'expert-chat': guard(() => openChat(id, prod?.title), b); break;
      case 'avatar-remove': guard(async () => { await api.del('/me/avatar'); render(); toast('Фото убрано'); }, b); break;
      case 'fc-filter': fcFilter = id; render(); break;
      case 'anchor': anchorDialog(fcList.find(f => f.id === id)); break;
      case 'verify-anchor': verifyDialog(fcList.find(f => f.id === id)); break;
      case 'airdrop': guard(async () => { await window.DalSolana.airdrop(solWallet); toast('Запрошен 1 тестовый SOL. Через несколько секунд нажмите «Записать» ещё раз.'); }, b); break;
      case 'anchor-go': guard(async () => {
        const f = fcList.find(x => x.id === id);
        try {
          solWallet = await window.DalSolana.connect();
          const bal = await window.DalSolana.balance(solWallet).catch(() => null);
          if (bal !== null && bal < 0.00001) { anchorDialog(f, `<div class="notice">${icon('info')} На кошельке ${esc(solWallet.slice(0, 4))}…${esc(solWallet.slice(-4))} нет тестовых SOL для комиссии. <button class="text-link" data-action="airdrop">Получить 1 SOL</button> или возьмите на <a class="text-link" href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>.</div>`); return; }
          const { signature, wallet } = await window.DalSolana.anchor(f.memo);
          await api.post(`/studio/forecasts/${id}/anchor`, { signature, wallet, cluster: window.DalSolana.CLUSTER });
          modal.close(); await render(); toast('Прогноз зафиксирован в Solana');
        } catch (e) { if (e.code === 'no_wallet') anchorDialog(f, `<div class="notice">${icon('wallet')} ${esc(e.message)}</div>`); else throw e; }
      }, b); break;
      case 'rv-filter': rvFilter = id; render(); break;
      case 'cover': guard(async () => { current = await api.patch(`/studio/courses/${current.id}`, { cover: id }); rerenderEditor(); }, b); break;
      case 'add-module': guard(async () => { current = await api.post(`/studio/courses/${current.id}/modules`, {}); rerenderEditor(); }, b); break;
      case 'add-lesson': guard(async () => { const r = await api.post(`/studio/modules/${id}/lessons`, {}); current = r.course; rerenderEditor(); $(`[data-lesson-title="${r.lessonId}"]`)?.focus(); }, b); break;
      case 'move': guard(async () => { current = await api.post(`/studio/lessons/${id}/move`, { direction: b.dataset.dir }); rerenderEditor(); }, b); break;
      case 'delete-module': { const m = current.modules.find(x => x.id === id); confirmDialog('Удалить модуль?', `Модуль «${esc(m.title)}» и ${m.lessons.length} ${plural(m.lessons.length, 'урок', 'урока', 'уроков')} с видео будут удалены.`, 'Удалить', () => guard(async () => { current = await api.del(`/studio/modules/${id}`); rerenderEditor(); toast('Модуль удалён'); }), true); break; }
      case 'delete-lesson': { const l = allLessons(current).find(x => x.id === id); confirmDialog('Удалить урок?', `Урок «${esc(l.title || 'без названия')}»${l.video ? ' вместе с видео' : ''} будет удалён.`, 'Удалить', () => guard(async () => { current = await api.del(`/studio/lessons/${id}`); rerenderEditor(); toast('Урок удалён'); }), true); break; }
      case 'remove-video': { const l = allLessons(current).find(x => x.id === id); confirmDialog('Удалить видео?', `Файл «${esc(l.video.name)}» будет удалён из урока.`, 'Удалить', () => guard(async () => { current = await api.del(`/studio/lessons/${id}/video`); refreshZone(id); refreshPanel(); toast('Видео удалено'); }), true); break; }
      case 'cancel-upload': uploads[id]?.abort?.(); break;
      case 'play': { const l = current && allLessons(current).find(x => x.id === id); playLesson(id, l?.title || b.dataset.title); break; }
      case 'preview': preview(); break;
      case 'submit': courseAction('submit', 'Курс отправлен на модерацию', b); break;
      case 'withdraw': courseAction('withdraw', 'Курс снова в черновиках', b); break;
      case 'unhide': courseAction('unhide', 'Курс снова в каталоге', b); break;
      case 'hide': confirmDialog('Скрыть курс из каталога?', 'Новые ученики не смогут его найти и купить. Те, кто уже купил, сохранят доступ.', 'Скрыть', () => courseAction('hide', 'Курс скрыт из каталога')); break;
      case 'delete-course': confirmDialog('Удалить курс?', `«${esc(current.title || 'Новый курс')}» и все загруженные видео будут удалены без возможности восстановления.`, 'Удалить', () => guard(async () => { await api.del(`/studio/courses/${current.id}`); current = null; location.hash = '#courses'; toast('Курс удалён'); }), true); break;
      case 'fc-comment': openDialog(`Комментарий к ${esc(b.dataset.ticker)}`, `<p class="modal-text">Комментарий увидят ученики. Условие, цель и срок прогноза не изменятся.</p><form id="commentForm" data-id="${id}"><label class="form-label">Текст<textarea name="text" rows="4" maxlength="600" required minlength="10"></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Добавить</button></div></form>`); break;
      case 'edit-reply': editingReply = id; render(); break;
      case 'report': openDialog('Пожаловаться на отзыв', `<p class="modal-text">Отзыв останется видимым, пока модерация не примет решение.</p><form id="reportForm" data-id="${id}">${Object.entries(REASONS).map(([k, t], i) => `<label class="check-line"><input type="radio" name="reason" value="${k}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}<div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Отправить жалобу</button></div></form>`); break;
      case 'request': { const field = id; openDialog(field === 'name' ? 'Изменить имя' : 'Изменить стаж', `<p class="modal-text">Изменение вступит в силу после проверки модератором.</p><form id="requestForm" data-field="${field}"><label class="form-label">${field === 'name' ? 'Новое имя и фамилия' : 'Стаж, например «6 лет практики»'}<input type="text" name="value" maxlength="60" required value="${esc(field === 'name' ? profile.name : profile.experience)}"></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Отправить на модерацию</button></div></form>`); break; }
      // Moderation
      case 'approve': guard(async () => { const product = b.dataset.kind === 'product'; await api.post(`/moderation/${product ? 'products' : 'courses'}/${id}/approve`); toast(product ? 'Продукт одобрен и опубликован' : 'Курс одобрен и опубликован'); if (location.hash === '#moderation') render(); else location.hash = '#moderation'; }, b); break;
      case 'reject': openDialog(b.dataset.kind === 'product' ? 'Вернуть продукт эксперту' : 'Вернуть курс эксперту', `<form id="rejectForm" data-id="${id}" data-kind="${b.dataset.kind || 'course'}"><label class="form-label">Что нужно исправить<textarea name="note" rows="4" maxlength="1000" required minlength="5" placeholder="Например: во втором уроке нет звука"></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" type="submit">Вернуть эксперту</button></div></form>`); break;
      case 'report-keep': case 'report-remove': guard(async () => { await api.post(`/moderation/reports/${id}/resolve`, { action: action === 'report-keep' ? 'keep' : 'remove' }); toast(action === 'report-keep' ? 'Отзыв оставлен' : 'Отзыв скрыт'); render(); }, b); break;
      case 'request-approve': case 'request-reject': guard(async () => { await api.post(`/moderation/profile-requests/${id}/${action === 'request-approve' ? 'approve' : 'reject'}`); toast(action === 'request-approve' ? 'Изменение одобрено' : 'Изменение отклонено'); render(); }, b); break;
      case 'verify': guard(async () => { await api.post(`/moderation/experts/${id}/verify`); toast('Эксперт подтверждён'); render(); }, b); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.closest('#forecastForm')) { if (t.name === 'ticker') t.value = t.value.toUpperCase().replace(/[^A-Z0-9.]/g, ''); updateFcPreview(); return; }
    if (t.dataset.pfield && prod?.rules.canEdit && t.tagName !== 'SELECT') {
      const f = t.dataset.pfield;
      if (f === 'title') $('#productHead').textContent = t.value || 'Новый продукт';
      if (f === 'description') $('#pDescCounter').textContent = `${t.value.length} / 1500 · минимум 80`;
      if (f === 'content') $('#contentCounter').textContent = `${t.value.length} символов · минимум 300 · до покупки видно первые 400 · подзаголовок начинается с «## »`;
      const numeric = ['price', 'sessions', 'periodDays'].includes(f);
      const value = numeric ? (t.value === '' ? (f === 'price' ? null : undefined) : Math.max(0, Math.round(Number(t.value)))) : t.value;
      if (value === undefined) return;
      if (f === 'meetingUrl' && t.value && !/^https?:\/\/\S+\.\S+$/i.test(t.value.trim())) { const s = $('#saveState'); if (s) s.textContent = 'Ссылка должна начинаться с https://'; return; }
      saveSoon('product-' + f, async () => { prod = await api.patch(`/studio/products/${prod.id}`, { [f]: value }); refreshProductPanel(); });
      return;
    }
    if (!current || !current.rules.canEdit) return;
    if (t.dataset.field && t.dataset.field !== 'category') {
      const f = t.dataset.field;
      if (f === 'title') $('#courseHead').textContent = t.value || 'Новый курс';
      if (f === 'description') $('#descCounter').textContent = `${t.value.length} / 1500`;
      const value = f === 'price' ? (t.value === '' ? null : Math.max(0, Math.round(Number(t.value)))) : t.value;
      saveSoon('course-' + f, () => api.patch(`/studio/courses/${current.id}`, { [f]: value }));
    } else if (t.dataset.module) saveSoon('module-' + t.dataset.module, () => api.patch(`/studio/modules/${t.dataset.module}`, { title: t.value }));
    else if (t.dataset.lessonTitle) saveSoon('lesson-' + t.dataset.lessonTitle, () => api.patch(`/studio/lessons/${t.dataset.lessonTitle}`, { title: t.value }));
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'stFilter') { stFilter = t.value; render(); return; }
    if (t.dataset.upload) { handleFile(t.dataset.upload, t.files[0]); t.value = ''; return; }
    if (t.id === 'coverInput') { coverFromFile(t.files[0]); t.value = ''; return; }
    if (t.id === 'productCoverInput') { productCoverFromFile(t.files[0]); t.value = ''; return; }
    if (t.tagName === 'SELECT' && t.dataset.pfield && prod) { guard(async () => { prod = await api.patch(`/studio/products/${prod.id}`, { [t.dataset.pfield]: Number(t.value) }); refreshProductPanel(); }); return; }
    if (t.id === 'avatarInput') {
      const file = t.files[0]; t.value = ''; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('Фото больше 5 МБ'); return; }
      guard(async () => { await api.upload('/me/avatar', file, { type: file.type }).promise; render(); toast('Фото обновлено: ученики уже видят его'); });
      return;
    }
    if (t.dataset.field === 'category' && current) guard(async () => { current = await api.patch(`/studio/courses/${current.id}`, { category: t.value }); refreshPanel(); $('#courseCategory').textContent = current.categoryName; });
    if (t.dataset.free && current) guard(async () => { try { current = await api.patch(`/studio/lessons/${t.dataset.free}`, { isFree: t.checked }); } finally { rerenderEditor(); } });
  });

  const fieldErrors = (form, details) => {
    $$('.field-error', form).forEach(x => { x.hidden = true; x.textContent = ''; });
    for (const [k, m] of Object.entries(details || {})) { const box = $(`#err-${k}`); if (box) { box.textContent = m; box.hidden = false; } }
  };
  document.addEventListener('submit', e => {
    const form = e.target; e.preventDefault();
    const fd = new FormData(form), btn = $('button[type=submit]', form);
    if (form.id === 'forecastForm') {
      const f = readForecast(form);
      $('#fcErrors').textContent = '';
      if (!f.acknowledged) { fieldErrors(form, { acknowledged: 'Подтвердите, что понимаете правила публикации' }); return; }
      fieldErrors(form, {});
      confirmDialog(`Опубликовать прогноз ${esc(f.ticker || '')}?`, `${f.startPrice > 0 && f.targetPrice > 0 && f.deadline ? conditionText(f) + '<br><br>' : ''}<b>После публикации изменить или удалить прогноз будет нельзя.</b>`, 'Опубликовать', async () => {
        try { await api.post('/studio/forecasts', f); fcDraft = {}; fcFilter = 'all'; location.hash = '#forecasts'; toast('Прогноз опубликован. DAL записывает его в Solana.'); }
        catch (err) { if (err.details && !Array.isArray(err.details)) fieldErrors(form, err.details); $('#fcErrors').textContent = err.message; toast(err.message); }
      });
      return;
    }
    if (form.id === 'commentForm') return guard(async () => { await api.post(`/studio/forecasts/${form.dataset.id}/comments`, { text: String(fd.get('text')).trim() }); modal.close(); render(); toast('Комментарий добавлен'); }, btn);
    if (form.classList.contains('reply-form')) return guard(async () => { await api.put(`/studio/reviews/${form.dataset.review}/reply`, { text: String(fd.get('reply')).trim() }); editingReply = ''; render(); toast('Ответ опубликован'); }, btn);
    if (form.id === 'reportForm') return guard(async () => { await api.post(`/studio/reviews/${form.dataset.id}/report`, { reason: fd.get('reason') }); modal.close(); render(); toast('Жалоба отправлена модерации'); }, btn);
    if (form.id === 'requestForm') return guard(async () => { profile = await api.post('/studio/profile/requests', { field: form.dataset.field, value: String(fd.get('value')).trim() }); modal.close(); render(); toast('Запрос отправлен на модерацию'); }, btn);
    if (form.id === 'profileForm') return guard(async () => {
      const socials = Object.fromEntries(SOCIAL_FIELDS.map(([k]) => [k, String(fd.get('social-' + k) || '').trim()]));
      fieldErrors(form, {});
      try { profile = await api.patch('/studio/profile', { specialization: String(fd.get('specialization')).trim(), bio: String(fd.get('bio')).trim(), achievements: String(fd.get('achievements')).split('\n').map(s => s.trim()).filter(Boolean), socials }); }
      catch (err) { if (err.details && !Array.isArray(err.details)) fieldErrors(form, err.details); throw err; }
      render(); toast('Профиль сохранён, ученики уже видят изменения');
    }, btn);
    if (form.id === 'slotForm') return guard(async () => {
      const [y, mo, d] = String(fd.get('date')).split('-').map(Number), [h, mi] = String(fd.get('time')).split(':').map(Number);
      const repeat = Number(fd.get('repeat')) || 1;
      let added = 0, lastErr = null;
      for (let i = 0; i < repeat; i++) {
        const at = new Date(y, mo - 1, d + i * 7, h, mi);
        try { prod = await api.post(`/studio/products/${prod.id}/slots`, { startsAt: at.toISOString() }); added++; } catch (err) { lastErr = err; }
      }
      rerenderProduct();
      if (added) toast(`Добавлено окон: ${added}${lastErr ? `. Пропущено: ${repeat - added} (${lastErr.details?.startsAt || lastErr.message})` : ''}`);
      else throw lastErr;
    }, btn);
    if (form.id === 'chatForm') return guard(async () => {
      const input = form.elements.message, text = input.value.trim(); if (!text) return;
      const m = await api.post(`/products/${form.dataset.product}/messages`, { text });
      input.value = ''; appendChat([m]); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; input.focus();
    }, btn);
    if (form.id === 'rejectForm') return guard(async () => { const product = form.dataset.kind === 'product'; await api.post(`/moderation/${product ? 'products' : 'courses'}/${form.dataset.id}/reject`, { note: String(fd.get('note')).trim() }); modal.close(); toast(product ? 'Продукт возвращён эксперту' : 'Курс возвращён эксперту'); if (location.hash === '#moderation') render(); else location.hash = '#moderation'; }, btn);
    if (form.classList.contains('resolve-form')) return guard(async () => { const r = await api.post(`/moderation/forecasts/${form.dataset.id}/resolve`, { closePrice: parseFloat(fd.get('closePrice')) }); toast(r.status === 'success' ? 'Итог: условие выполнено' : 'Итог: условие не выполнено'); render(); }, btn);
  });

  document.addEventListener('dragover', e => { e.preventDefault(); const z = e.target.closest('[data-drop]'); if (z && current?.rules.canEdit) z.classList.add('dragover'); });
  document.addEventListener('dragleave', e => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('dragover'); });
  document.addEventListener('drop', e => { e.preventDefault(); const z = e.target.closest('[data-drop]'); if (!z) { if (e.dataTransfer?.files.length) toast('Перетащите видео на нужный урок.'); return; } z.classList.remove('dragover'); handleFile(z.dataset.drop, e.dataTransfer.files[0]); });
  window.addEventListener('beforeunload', e => { if (Object.keys(uploads).length) { e.preventDefault(); e.returnValue = ''; } });
  modal.addEventListener('click', e => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); } });
  modal.addEventListener('close', () => { clearInterval(chatTimer); $$('video', modal).forEach(v => v.pause()); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
    if (e.target.closest('.tabs[role="tablist"]') && ['ArrowRight', 'ArrowLeft'].includes(e.key)) { const tabs = $$('[role="tab"]', e.target.closest('.tabs')), i = tabs.indexOf(e.target); e.preventDefault(); tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].focus(); }
  });
  window.addEventListener('hashchange', render);

  // ---------- Startup: requires an expert or moderator sign-in ----------
  (async () => {
    applyAppearance();
    main.innerHTML = `<div class="page"><div class="loading">Загружаем…</div></div>`;
    try {
      me = await api.me();
      if (!me) { location.href = api.loginUrl('/studio.html' + location.hash); return; }
      if (me.role === 'expert') profile = await api.get('/studio/profile');
      if (!location.hash) history.replaceState(null, '', me.role === 'moderator' ? '#moderation' : '#overview');
    } catch (e) { main.innerHTML = `<div class="page">${errorView(e)}</div>`; icons(); return; }
    render();
  })();
})();
