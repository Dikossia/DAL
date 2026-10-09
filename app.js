(() => {
  'use strict';
  // Student-facing site, connected to the Dal server.
  // Everything comes from the API: courses, consultations, clubs and chats, ideas and reviews, experts, forecasts, favorites.
  // Only view settings are stored in the browser (plus favorites while signed out).
  const api = window.DalAPI;
  const { modes } = window.DAL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU');
  const money = n => n === 0 ? 'Бесплатно' : n == null ? 'Цена не указана' : nf.format(n) + ' ₸';
  const usd = n => '$' + nf.format(n);
  const rate = n => Number(n).toFixed(1).replace('.', ',');
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDate = iso => iso ? dateFmt.format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)).replace(/\s?г\.$/, '') : '';
  const whenFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fmtWhen = iso => iso ? whenFmt.format(new Date(iso)) : '';
  const dayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const hourFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtTime = s => { if (!s) return ''; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
  const clock = s => { if (!Number.isFinite(s)) return ''; s = Math.round(s); const m = Math.floor(s / 60), x = s % 60; return `${m}:${String(x).padStart(2, '0')}`; };
  const findMode = id => modes.find(m => m.id === id) || modes[0];
  const brights = { courses: '#8dccab', experts: '#c0acee', community: '#e5ac95', ideas: '#98bfee' };
  modes.forEach(m => { m.bright = brights[m.id]; });
  const HOME = { id: 'home', name: 'Главная', icon: 'house', accent: '#2f5d62', bright: '#9cc9cc' };
  const drumItems = [HOME, ...modes];
  const findDrum = id => drumItems.find(m => m.id === id) || HOME;
  const ROLE = { student: 'ученик', expert: 'эксперт', moderator: 'модератор' };
  const SOCIALS = { telegram: ['send', 'Telegram'], instagram: ['camera', 'Instagram'], youtube: ['circle-play', 'YouTube'], linkedin: ['briefcase-business', 'LinkedIn'], website: ['globe', 'Сайт'] };

  // ---------- View settings: this browser only ----------
  const PREFS = 'dal-live-prefs';
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? { ...d, ...v } : d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* хранилище недоступно */ } };
  let prefs = read(PREFS, { mode: 'home', theme: 'system', accent: 'auto', motion: true, saved: [] });
  if (!Array.isArray(prefs.saved)) prefs.saved = [];
  try { localStorage.removeItem('dal-live-demo'); } catch (_) { /* прежняя демо-часть больше не нужна */ }
  const savePrefs = () => write(PREFS, prefs);

  // ---------- Server data ----------
  let me = null, catalog = [], products = [], experts = [], forecasts = [];
  let learning = { courses: [], inProgress: null }, mine = [], favs = new Set(), shownReviews = [], solWallet = '', certs = [], lastQuote = null;
  let offline = false;
  async function loadBase() {
    try {
      [catalog, products, experts, forecasts] = await Promise.all([api.get('/catalog/courses'), api.get('/catalog/products'), api.get('/experts'), api.get('/forecasts')]);
      me = await api.me();
      await Promise.all([refreshLearning(), refreshFavorites()]);
      offline = false;
    } catch (e) { if (e.code === 'offline') offline = true; else throw e; }
  }
  async function refreshLearning() {
    const student = me?.role === 'student';
    [learning, mine, certs] = student ? await Promise.all([api.get('/me/learning'), api.get('/me/products'), api.get('/me/certificates').catch(() => [])]) : [{ courses: [], inProgress: null }, [], []];
  }
  // Guest favorites live in the browser; after sign-in they are moved to the server.
  async function refreshFavorites() {
    if (!me) { favs = new Set(prefs.saved); return; }
    favs = new Set(await api.get('/me/favorites'));
    const guest = prefs.saved.filter(id => !favs.has(id));
    if (guest.length) {
      await Promise.all(guest.map(id => api.put(`/me/favorites/${id}`).then(() => favs.add(id), () => { /* материал больше не существует */ })));
    }
    if (prefs.saved.length) { prefs.saved = []; savePrefs(); }
  }
  const refreshCatalog = async () => { [catalog, products] = await Promise.all([api.get('/catalog/courses'), api.get('/catalog/products')]); };
  const ownsCourse = id => learning.courses.some(c => c.id === id);
  const myProduct = id => mine.find(p => p.id === id);

  // Cards: courses and products are normalized to a single shape.
  const fromCourse = c => ({
    id: c.id, kind: 'course', mode: 'courses', category: c.category, title: c.title, tag: c.freeLessons ? 'Есть бесплатный урок' : c.categoryName,
    expert: { id: c.expert.id, name: c.expert.name, avatar: c.expert.avatarUrl }, price: c.price, rating: c.rating, reviews: c.reviews,
    cover: c.coverUrl, meta: c.duration ? fmtTime(c.duration) : '', lessons: c.lessons, students: c.students, description: c.description
  });
  const fromProduct = p => ({
    id: p.id, kind: 'product', mode: p.mode, category: p.type, title: p.title, tag: p.typeName, productKind: p.productKind,
    expert: { id: p.expert.id, name: p.expert.name, avatar: p.expert.avatarUrl }, price: p.price, rating: p.rating, reviews: p.reviews,
    cover: p.coverUrl, meta: p.meta, nextSlot: p.nextSlot, buyers: p.buyers, description: p.description
  });
  const offers = () => [...catalog.map(fromCourse), ...products.map(fromProduct)];
  const findOffer = id => offers().find(o => o.id === id)
    || (learning.courses.find(c => c.id === id) && fromCourse(learning.courses.find(c => c.id === id)))
    || (myProduct(id) && fromProduct(myProduct(id)));
  const byRating = (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0);

  // ---------- UI state ----------
  let mode = findDrum(prefs.mode), preview = drumItems.indexOf(mode), toastTimer, lastFocus, chatTimer = 0;
  let libraryMode = 'courses', expertMode = '', rankMode = 'all';
  let catalogSearch = '', catalogSort = 'popular', freeOnly = false, signalFilter = 'all';
  let routeKey = '', lastNav = '', seq = 0;
  const main = $('#main'), modal = $('#modal');
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const initials = name => String(name || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  // A single star filled by the rating fraction: 4.5 of 5 means the star is 90% filled.
  const STAR = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
  const star = value => `<span class="star-meter" style="--fill:${Math.max(0, Math.min(100, value / 5 * 100))}%" aria-hidden="true"><svg viewBox="0 0 24 24" class="star-empty">${STAR}</svg><span class="star-fill"><svg viewBox="0 0 24 24">${STAR}</svg></span></span>`;
  const rating = (value, count) => value == null ? `<span class="rating muted-rating">Нет оценок</span>` : `<span class="rating" title="${rate(value)} из 5">${star(value)}${rate(value)}${count !== undefined ? `<small>(${count})</small>` : ''}</span>`;
  const avatar = (src, name, cls = '') => src ? `<img src="${esc(src)}" alt="" class="${cls}" loading="lazy">` : `<span class="user-avatar ${cls}">${esc(initials(name))}</span>`;
  const userPic = u => u?.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="">` : esc(initials(u?.name));
  const cover = (src, alt = '', cls = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy">` : `<span class="cover-placeholder ${cls}">${icon('image')}</span>`;
  const expertLink = e => `<a class="expert-inline" href="#expert/${e.id}">${avatar(e.avatar ?? e.avatarUrl, e.name)}<span>${esc(e.name)}</span></a>`;
  const breadcrumb = (items = []) => `<nav class="breadcrumb" aria-label="Навигационная цепочка"><a href="#home">Главная</a>${items.map(([n, h]) => `${icon('chevron-right')}${h ? `<a href="${h}">${esc(n)}</a>` : `<span>${esc(n)}</span>`}`).join('')}</nav>`;
  const footer = () => `<footer class="page-footer"><span><span class="footer-logo">Dal.</span> &nbsp; Учимся принимать решения.</span><span>Данные — из базы на вашем компьютере. Не инвестиционная рекомендация.</span></footer>`;
  const empty = (title, text, name = 'search', action = `<a class="btn secondary" href="#home">К обзору ${icon('arrow-right')}</a>`) => `<div class="empty">${icon(name)}<h2>${title}</h2><p>${text}</p>${action}</div>`;
  const loginPrompt = (text = 'Войдите, чтобы видеть свои курсы и прогресс.') => empty('Нужно войти', text, 'log-in', `<a class="btn" href="${api.loginUrl()}">${icon('log-in')}Войти или зарегистрироваться</a>`);
  const isSaved = id => favs.has(id);
  const saveButton = id => `<button class="btn secondary wide" style="margin-top:10px" data-action="save" data-id="${id}" aria-pressed="${isSaved(id)}">${icon('bookmark')}${isSaved(id) ? 'В избранном' : 'В избранное'}</button>`;

  function applyAppearance() {
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.motion = prefs.motion ? 'on' : 'off';
    const colors = { green: ['#21755a', '#8dccab'], violet: ['#6552a0', '#c0acee'], coral: ['#af5b43', '#e5ac95'], blue: ['#326db6', '#98bfee'] };
    const light = prefs.accent === 'auto' ? mode.accent : (colors[prefs.accent] || colors.green)[0];
    const bright = prefs.accent === 'auto' ? mode.bright : (colors[prefs.accent] || colors.green)[1];
    root.style.setProperty('--accent', dark ? bright : light);
    root.style.setProperty('--soft', dark ? `color-mix(in srgb, ${bright} 12%, #1d2420)` : `color-mix(in srgb, ${light} 8%, white)`);
    const t = $('.theme-toggle'); t.innerHTML = icon(dark ? 'sun' : 'moon'); t.title = dark ? 'Светлая тема' : 'Тёмная тема'; t.setAttribute('aria-label', t.title);
    const av = $('.user-trigger .user-avatar');
    av.innerHTML = me ? userPic(me) : icon('user-round');
    $('.user-trigger').setAttribute('aria-label', me ? `Меню: ${me.name}` : 'Войти или зарегистрироваться');
  }
  function updateChrome() { preview = drumItems.indexOf(mode); showPreview(preview, false); applyAppearance(); icons(); }
  function showPreview(index, animate = true) {
    const old = preview, total = drumItems.length;
    preview = (index + total) % total;
    const m = drumItems[preview], label = $('#drumLabel');
    $('#drum').style.setProperty('--preview', document.documentElement.dataset.theme === 'dark' ? m.bright : m.accent);
    label.innerHTML = `${icon(m.icon)}<span>${m.name}</span>`;
    $('.ghost-top').textContent = drumItems[(preview + total - 1) % total].name;
    $('.ghost-bottom').textContent = drumItems[(preview + 1) % total].name;
    $('#drumSelect').setAttribute('aria-label', `Открыть раздел «${m.name}»`); $('#drumSelect').title = m.name;
    label.classList.remove('roll-next', 'roll-prev');
    if (animate && old !== preview) { void label.offsetWidth; label.classList.add(index < old ? 'roll-prev' : 'roll-next'); }
    if (!$('#modeDots').children.length) $('#modeDots').innerHTML = drumItems.map(v => `<button class="mode-dot" data-action="mode" data-id="${v.id}" aria-label="${v.name}" title="${v.name}"></button>`).join('');
    $$('.mode-dot').forEach((b, i) => { b.classList.toggle('active', drumItems[i].id === mode.id); b.classList.toggle('preview', i === preview); b.setAttribute('aria-current', drumItems[i].id === mode.id ? 'page' : 'false'); });
    icons();
  }
  let waveFrame = 0;
  function wave() {
    if (!prefs.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('#colorWave'), ctx = canvas.getContext('2d'); if (!ctx) return;
    cancelAnimationFrame(waveFrame);
    const w = innerWidth, h = innerHeight, ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = w * ratio; canvas.height = h * ratio; ctx.scale(ratio, ratio); canvas.style.display = 'block';
    const start = performance.now();
    const draw = time => {
      const t = Math.min((time - start) / 660, 1);
      ctx.clearRect(0, 0, w, h);
      for (let n = 0; n < 3; n++) {
        const y = -h * .6 + (h * 2.2) * (1 - Math.pow(1 - t, 2)) - n * h * .1;
        const g = ctx.createLinearGradient(0, 0, w, h * .3);
        g.addColorStop(0, '#8cdab9'); g.addColorStop(.35, '#b8a7e3'); g.addColorStop(.7, '#f1c99e'); g.addColorStop(1, '#9cccdc');
        ctx.fillStyle = g; ctx.globalAlpha = Math.sin(Math.PI * t) * .20 * (1 - n * .17);
        ctx.beginPath(); ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * .28, y - h * .26, w * .65, y + h * .28, w, y - h * .12);
        ctx.lineTo(w, y + h * .6); ctx.bezierCurveTo(w * .65, y + h * .85, w * .25, y + h * .32, 0, y + h * .65); ctx.closePath(); ctx.fill();
      }
      if (t < 1) waveFrame = requestAnimationFrame(draw); else { ctx.clearRect(0, 0, w, h); canvas.style.display = 'none'; }
    };
    waveFrame = requestAnimationFrame(draw);
  }
  function selectMode(id) {
    const changed = mode.id !== id;
    mode = findDrum(id); prefs.mode = mode.id; savePrefs();
    if (changed) wave();
    const target = mode === HOME ? '#home' : `#mode/${mode.id}`;
    if (location.hash === target) render(); else location.hash = target;
  }

  function productCard(o, compact = false) {
    const saved = isSaved(o.id);
    const metaIcon = o.productKind === 'material' ? 'book-open-text' : o.productKind === 'subscription' ? 'calendar-range' : 'clock-3';
    const meta = [
      o.meta ? `<span>${icon(metaIcon)}${esc(o.meta)}</span>` : '',
      o.mode === 'courses' ? `<span>${icon('play')}${o.lessons} ${plural(o.lessons, 'урок', 'урока', 'уроков')}</span>` : '',
      o.nextSlot ? `<span>${icon('calendar-check')}с ${esc(shortFmt.format(new Date(o.nextSlot)))}</span>` : ''
    ].join('');
    return `<article class="product-card ${compact ? 'compact' : ''}"><div class="product-cover"><a href="#product/${o.id}" tabindex="-1" aria-hidden="true">${cover(o.cover)}</a><button class="icon-button save-button ${saved ? 'saved' : ''}" data-action="save" data-id="${o.id}" aria-label="${saved ? 'Убрать из избранного' : 'В избранное'}" title="${saved ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${saved}">${icon('bookmark')}</button></div><div class="product-body"><div class="product-kicker">${esc(o.tag)}</div><a class="product-title" href="#product/${o.id}">${esc(o.title)}</a>${expertLink(o.expert)}<div class="product-meta">${meta}</div><div class="product-bottom"><strong>${money(o.price)}</strong>${rating(o.rating, o.reviews)}</div></div></article>`;
  }
  const signalLabels = { active: 'Открыт', success: 'Условие выполнено', miss: 'Не выполнено' };
  const signalCard = f => `<article class="signal-card"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker)}</span><div><strong>${esc(f.name)}</strong><p>${esc(f.ticker)} · USD · ${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div><span class="status ${f.status}">${signalLabels[f.status]}</span></div><p class="fc-condition-public">Цена закрытия на ${fmtDate(f.deadline)} ${f.direction === 'up' ? 'не ниже' : 'не выше'} ${usd(f.targetPrice)}</p><div class="signal-values"><div><label>При публикации</label><strong>${usd(f.startPrice)}</strong></div><div><label>Цель</label><strong>${usd(f.targetPrice)}</strong></div><div><label>${f.status === 'active' ? 'Проверка' : 'Итог'}</label><strong>${f.status === 'active' ? fmtDate(f.deadline).replace(/\s\d{4}$/, '') : usd(f.resultPrice)}</strong></div></div>${f.anchor ? `<button class="chain-badge" data-action="verify-anchor" data-id="${f.id}" title="Проверить запись в блокчейне">${icon('link-2')}Зафиксирован в Solana · проверить</button>` : f.chain ? `<span class="chain-chip pending">${icon('loader')}Записывается в Solana</span>` : ''}${f.result?.url ? `<a class="chain-chip ok" href="${esc(f.result.url)}" target="_blank" rel="noopener">${icon('flag')}Итог записан в Solana</a>` : ''}<div class="signal-bottom">${expertLink(f.expert)}<button class="text-link" data-action="signal" data-id="${f.id}">Обоснование ${icon('arrow-right')}</button></div></article>`;
  const expertsStrip = () => `<div class="experts-strip">${[...experts].sort(byRating).map(e => `<a class="expert-mini" href="#expert/${e.id}">${avatar(e.avatarUrl, e.name)}<div><strong>${esc(e.name)}</strong><p>${esc(e.specialization)}</p></div>${rating(e.rating)}</a>`).join('')}</div>`;
  // Horizontal shelf: section heading plus horizontally scrolling cards.
  const shelf = (title, label, href, count, items) => `<section class="shelf"><div class="shelf-head"><div><span class="shelf-label">${esc(label)}</span><h2>${esc(title)}</h2></div><div class="shelf-tools">${href ? `<a class="text-link" href="${href}">Все${count != null ? ` · ${count}` : ''} ${icon('arrow-right')}</a>` : ''}${items.length > 2 ? `<button class="icon-button" data-action="shelf" data-id="-1" aria-label="Листать назад" title="Назад">${icon('chevron-left')}</button><button class="icon-button" data-action="shelf" data-id="1" aria-label="Листать вперёд" title="Вперёд">${icon('chevron-right')}</button>` : ''}</div></div>${items.length ? `<div class="shelf-row">${items.join('')}</div>` : '<p class="shelf-empty">Здесь скоро появятся предложения экспертов.</p>'}</section>`;

  // ---------- Pages ----------
  function overview() {
    const best = list => [...list].sort(byRating)[0];
    const picks = [best(catalog.map(fromCourse)), ...['experts', 'community'].map(m => best(products.filter(p => p.mode === m).map(fromProduct)))].filter(Boolean);
    return `<div class="page-topline"><span class="eyebrow">ЗНАНИЯ. ЛЮДИ. КАПИТАЛ.</span><span class="tiny-meta">Выберите, с чего начать</span></div><div class="intro"><h1>Учимся принимать финансовые решения.</h1><p>Курсы, личная работа с экспертом, сообщество и разборы рынка. Выберите направление, и внутри откроются все его разделы.</p></div><div class="directions">${modes.map(m => {
      const count = m.id === 'courses' ? catalog.length : products.filter(p => p.mode === m.id).length + (m.id === 'ideas' ? forecasts.length : 0);
      return `<a class="direction-card" href="#mode/${m.id}" data-action="mode" data-id="${m.id}" style="--card-accent:${m.accent};--card-bright:${m.bright}"><div class="direction-top"><span class="direction-icon">${icon(m.icon)}</span><span class="direction-count">${count} ${plural(count, 'материал', 'материала', 'материалов')}</span></div><div class="direction-body"><span class="direction-eyebrow">${m.eyebrow}</span><h2>${m.name}</h2><p>${m.description}</p><ul class="direction-list">${m.categories.map(c => `<li>${c.name}</li>`).join('')}</ul></div><div class="direction-bottom"><span>Открыть раздел</span>${icon('arrow-right')}</div></a>`;
    }).join('')}</div><div class="section-head"><h2>Начните с интересного</h2></div><div class="featured-grid">${picks.map(o => productCard(o, true)).join('')}</div><div class="section-head"><h2>Знания с человеческим лицом</h2><a class="text-link" href="#rankings">Все эксперты ${icon('arrow-right')}</a></div>${expertsStrip()}`;
  }

  function modeHome() {
    const rows = mode.categories.map(c => {
      if (c.id === 'signals') return shelf(c.name, c.label, `#category/${mode.id}/${c.id}`, forecasts.length, forecasts.slice(0, 8).map(signalCard));
      const list = offers().filter(o => o.mode === mode.id && o.category === c.id).sort(byRating);
      return shelf(c.name, c.label, `#category/${mode.id}/${c.id}`, list.length, list.slice(0, 12).map(o => productCard(o)));
    }).join('');
    const top = experts.filter(e => e.ratings?.[mode.id]?.value != null).sort((a, b) => b.ratings[mode.id].value - a.ratings[mode.id].value).slice(0, 3);
    return `<div class="page-topline"><span class="eyebrow">${mode.eyebrow}</span><span class="tiny-meta">${mode.id === 'courses' ? 'Ваш следующий шаг' : 'Листайте разделы вбок'}</span></div><div class="intro"><h1>${mode.title}</h1><p>${mode.description}</p></div>${rows}<div class="section-head"><h2>Лучшие в направлении «${mode.name}»</h2><a class="text-link" href="#rankings" data-action="rank-link" data-id="${mode.id}">Рейтинг ${icon('arrow-right')}</a></div>${top.length ? `<div class="experts-strip">${top.map(e => `<a class="expert-mini" href="#expert/${e.id}">${avatar(e.avatarUrl, e.name)}<div><strong>${esc(e.name)}</strong><p>${esc(e.specialization)}</p></div>${rating(e.ratings[mode.id].value, e.ratings[mode.id].reviews)}</a>`).join('')}</div>` : expertsStrip()}`;
  }

  function categoryView(categoryId) {
    const c = mode.categories.find(c => c.id === categoryId);
    if (!c) return empty('Раздел не найден', 'Вернитесь к обзору и выберите направление.');
    if (c.id === 'signals') return signalsView();
    return `${breadcrumb([[mode.name, `#mode/${mode.id}`], [c.name]])}<div class="heading-row"><h1>${c.name}</h1><span class="badge">${icon(mode.icon)}${mode.name}</span></div><p class="subtitle">${c.description}</p><div class="toolbar"><label class="input-wrap">${icon('search')}<input id="catalogSearch" type="search" placeholder="Поиск по названию или эксперту" aria-label="Поиск в каталоге" value="${esc(catalogSearch)}"></label><select id="catalogSort" aria-label="Сортировка"><option value="popular">По рейтингу</option><option value="price">Сначала дешевле</option><option value="price-desc">Сначала дороже</option></select><label><input type="checkbox" id="freeOnly" ${freeOnly ? 'checked' : ''}> Бесплатные</label></div><div id="catalogResults">${catalogResults(c.id)}</div>`;
  }
  function catalogResults(cat) {
    const term = catalogSearch.toLocaleLowerCase('ru');
    const list = offers().filter(o => o.mode === mode.id && o.category === cat && (!freeOnly || o.price === 0) && (o.title + ' ' + o.expert.name).toLocaleLowerCase('ru').includes(term))
      .sort((a, b) => catalogSort === 'price' ? a.price - b.price : catalogSort === 'price-desc' ? b.price - a.price : byRating(a, b));
    return `<p class="result-count">Найдено: ${list.length}</p>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Ничего не нашлось', 'Попробуйте другой запрос или измените фильтры.')}`;
  }
  const refreshResults = () => { const cat = location.hash.split('/')[2]; $('#catalogResults').innerHTML = catalogResults(cat); icons(); };

  async function productView(id) {
    const o = findOffer(id);
    if (!o) return empty('Материал не найден', 'Возможно, он снят с публикации. Выберите другой в каталоге.');
    return o.kind === 'course' ? courseView(id) : offerView(id);
  }

  // A course review is anchored in Solana: the author signs the record with their wallet, and anyone can verify it.
  const reviewChain = r => r.anchor ? `<button class="chain-badge" data-action="verify-review" data-id="${r.id}" title="Проверить запись в блокчейне">${icon('link-2')}Зафиксирован в Solana · проверить</button>`
    : r.mine && r.memo ? `<button class="btn secondary small-btn" data-action="anchor-review" data-id="${r.id}">${icon('link-2')}Зафиксировать в Solana</button>` : '';
  const reviewsBlock = (list, value, count, canReview, id, kind, note = '') => { shownReviews = list; return `<section class="detail-section"><div class="section-head" style="margin-top:0"><h2>Отзывы учеников</h2>${rating(value, count)}</div>${list.length ? list.map(r => `<article class="review-item"><div class="review-top"><span class="user-avatar">${esc(r.author[0])}</span><strong>${esc(r.author)}</strong>${r.mine ? '<span class="badge">Ваш отзыв</span>' : ''}${rating(r.rating)}</div><p>${esc(r.text)}</p>${reviewChain(r)}${r.reply ? `<div class="review-reply"><span class="tiny-meta">Ответ эксперта</span><p>${esc(r.reply)}</p></div>` : ''}</article>`).join('') : '<p class="subtitle">Отзывов пока нет.</p>'}${canReview ? `<button class="btn secondary" data-action="review" data-id="${id}" data-kind="${kind}">${icon('message-square')}Оставить отзыв</button>` : note}</section>`; };
  const myReviewIn = list => me && list.some(r => r.mine || (r.mine === undefined && r.author === me.name.split(' ')[0]));

  async function courseView(id) {
    const own = ownsCourse(id);
    let c, reviews = [];
    try { [c, reviews] = await Promise.all([api.get(`/catalog/courses/${id}`), api.get(`/catalog/courses/${id}/reviews`)]); }
    catch (e) { if (e.status === 404 && own) c = await api.get(`/learning/courses/${id}`); else throw e; }
    const progress = own ? (c.progress || learning.courses.find(x => x.id === id)?.progress) : null;
    const completed = !!progress && progress.total > 0 && progress.done >= progress.total;
    const reviewNote = own && !myReviewIn(reviews) && !completed && progress ? `<p class="notice">${icon('lock')} Отзыв можно оставить после прохождения курса: пройдено ${progress.done} из ${progress.total} уроков. Вопросы по урокам задавайте под видео.</p>` : '';
    const m = findMode('courses'), cat = m.categories.find(x => x.id === c.category);
    const lessons = c.modules.flatMap(x => x.lessons);
    let panel;
    if (own) panel = `<a class="btn wide" href="#lesson/${id}">${icon('play')}Продолжить обучение</a><button class="text-link refund-link" data-action="refund" data-id="${id}">${icon('undo-2')}Вернуть курс</button>`;
    else if (!me) panel = `<a class="btn wide" href="${api.loginUrl(`/#product/${id}`)}">${icon('log-in')}Войти и получить доступ</a>`;
    else if (me.role !== 'student') panel = `<p class="notice">Получать доступ к курсам может ученик. Вы вошли как ${ROLE[me.role]}.</p>`;
    else panel = `<button class="btn wide" data-action="buy" data-id="${id}">${c.price ? 'Получить доступ' : 'Начать бесплатно'}${icon('arrow-right')}</button>`;
    return `${breadcrumb([[m.name, '#mode/courses'], [cat?.name || 'Курс', `#category/courses/${c.category}`], [c.title]])}<div class="detail-grid"><div class="detail-content"><span class="badge">${esc(c.categoryName)}</span><h1>${esc(c.title)}</h1>${expertLink(c.expert)}${cover(c.coverUrl, c.title, 'detail-cover')}
      <section class="detail-section"><h2>О программе</h2><p>${esc(c.description)}</p></section>
      <section class="detail-section program"><h2>Программа обучения</h2>${c.modules.map(mod => `<h3 class="module-heading">${esc(mod.title)}</h3><ol class="program-list">${mod.lessons.map(l => `<li><span class="program-title">${esc(l.title)}</span><span class="program-meta">${l.duration ? clock(l.duration) : ''}${l.isFree ? `<span class="badge">Бесплатно</span>` : ''}${l.isFree && l.videoUrl && !own ? `<button class="text-link" data-action="preview" data-src="${esc(l.videoUrl)}" data-title="${esc(l.title)}">${icon('play')}Смотреть</button>` : ''}</span></li>`).join('')}</ol>`).join('')}</section>
      ${reviewsBlock(reviews, c.rating, c.reviews, own && completed && !myReviewIn(reviews), id, 'course', reviewNote)}
    </div><aside class="purchase-panel"><span class="tiny-meta">Курсы</span><div class="purchase-price">${money(c.price)}</div><p class="purchase-caption">${own ? 'Курс уже у вас' : 'За полный доступ'}</p>${panel}${saveButton(id)}<ul class="purchase-features"><li>${icon('play')}${lessons.length} ${plural(lessons.length, 'урок', 'урока', 'уроков')}${c.duration ? ` · ${fmtTime(c.duration)}` : ''}</li><li>${icon('users-round')}${c.students} ${plural(c.students, 'ученик', 'ученика', 'учеников')}</li><li>${icon('undo-2')}Возврат 14 дней, если пройдено меньше 20%</li></ul><p class="fine-print">Оплата пока не подключена: доступ открывается без списания денег. Доходность инвестиций не гарантируется.</p></aside></div>`;
  }

  // Material text: paragraphs separated by blank lines, "## " marks a subheading.
  const richText = text => String(text || '').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    if (lines[0].startsWith('## ')) return `<h2>${esc(lines[0].slice(3))}</h2>${lines.length > 1 ? `<p>${esc(lines.slice(1).join(' '))}</p>` : ''}`;
    return `<p>${esc(block).replace(/\n/g, '<br>')}</p>`;
  }).join('');

  // Page for a consultation, club, chat, idea or review. The purchase block depends on the product type.
  async function offerView(id) {
    const own = myProduct(id);
    let d = null;
    try { d = await api.get(`/catalog/products/${id}`); }
    catch (e) { if (!(e.status === 404 && own)) throw e; }
    if (own || (me && me.role !== 'student')) {
      try { const full = await api.get(`/learning/products/${id}`); d = { reviewsList: [], ...d, ...full }; }
      catch (e) { if (!d) throw e; }
    }
    const m = findMode(d.mode), cat = m.categories.find(x => x.id === d.type), pu = d.purchase;
    const kind = d.productKind, title = esc(d.title);
    const facts = [];
    let section = '', panel = '', caption = d.meta;
    if (kind === 'sessions') {
      facts.push([icon('clock-3'), `${d.durationMin} мин на встречу`], [icon('repeat'), d.sessions > 1 ? `Пакет: ${d.sessions} ${plural(d.sessions, 'встреча', 'встречи', 'встреч')}` : 'Одна встреча'], [icon('video'), 'Видеозвонок: ссылка откроется после записи'], [icon('calendar-x'), 'Отмена записи — не позже чем за 24 часа'], [icon('undo-2'), 'Возврат 14 дней, пока не назначена ни одна встреча']);
      const slots = d.freeSlots || [];
      section = `<section class="detail-section"><h2>Свободное время эксперта</h2>${slots.length ? `<div class="slot-preview">${slots.slice(0, 8).map(s => `<span>${icon('calendar')}${esc(fmtWhen(s.startsAt))}</span>`).join('')}${slots.length > 8 ? `<span class="muted">и ещё ${slots.length - 8}</span>` : ''}</div><p class="fine-print">Время указано по часовому поясу вашего компьютера. Запись — после покупки.</p>` : '<p class="subtitle">Эксперт пока не открыл свободное время. Добавьте предложение в избранное и загляните позже.</p>'}</section>`;
      if (pu) {
        const upcoming = (d.bookings || []).filter(b => new Date(b.startsAt) > new Date(Date.now() - 3 * 3600e3));
        caption = `Осталось встреч: ${pu.sessionsLeft} из ${pu.sessionsTotal}`;
        panel = `${upcoming.length ? `<div class="booking-list">${upcoming.map(b => `<div class="booking-item"><div>${icon('calendar-check')}<strong>${esc(fmtWhen(b.startsAt))}</strong></div>${b.canCancel ? `<button class="text-link" data-action="cancel-booking" data-id="${b.id}" data-when="${esc(fmtWhen(b.startsAt))}">Отменить</button>` : '<small>Отмена закрыта</small>'}</div>`).join('')}</div>${d.meetingUrl ? `<a class="btn secondary wide" href="${esc(d.meetingUrl)}" target="_blank" rel="noopener">${icon('video')}Ссылка на видеозвонок</a>` : ''}` : ''}${pu.sessionsLeft ? `<button class="btn wide" data-action="book" data-id="${id}">${icon('calendar-plus')}Выбрать время</button>` : `<button class="btn wide" data-action="buy-product" data-id="${id}">${icon('plus')}Купить ещё ${d.type === 'consultation' ? 'встречу' : 'пакет'}</button>`}${!pu.sessionsBooked ? `<button class="text-link refund-link" data-action="refund-product" data-id="${id}">${icon('undo-2')}Вернуть оплату</button>` : ''}`;
      }
    } else if (kind === 'subscription') {
      facts.push([icon('calendar-range'), `Подписка на ${d.periodDays} ${plural(d.periodDays, 'день', 'дня', 'дней')}, продление повторной оплатой`], [icon('users-round'), `${d.members ?? d.buyers} ${plural(d.members ?? d.buyers, 'участник', 'участника', 'участников')} сейчас`], [icon('messages-square'), 'Чат с экспертом и участниками'], [icon('ban'), 'Подписка не возвращается: доступ открывается сразу']);
      section = `<section class="detail-section"><h2>Как устроено</h2>${d.scheduleNote ? `<p>${icon('calendar-clock')} ${esc(d.scheduleNote)}</p>` : ''}<p>${d.type === 'clubs' ? 'Регулярные встречи в видеозвонке и общий чат участников. Ссылку на встречи видят только участники с действующей подпиской.' : 'Общий чат с экспертом: вопросы, разборы и обсуждения. Писать и читать могут участники с действующей подпиской.'}</p></section>`;
      if (pu) {
        caption = pu.active ? `Подписка до ${fmtDate(pu.expiresAt)}` : `Подписка закончилась ${fmtDate(pu.expiresAt)}`;
        panel = pu.active
          ? `<button class="btn wide" data-action="chat" data-id="${id}">${icon('messages-square')}Открыть чат</button>${d.meetingUrl ? `<a class="btn secondary wide" style="margin-top:10px" href="${esc(d.meetingUrl)}" target="_blank" rel="noopener">${icon('video')}Ссылка на встречи клуба</a>` : ''}<button class="text-link refund-link" data-action="buy-product" data-id="${id}">${icon('calendar-plus')}Продлить на ${d.periodDays} дней</button>`
          : `<button class="btn wide" data-action="buy-product" data-id="${id}">${icon('rotate-ccw')}Возобновить подписку</button>`;
      }
    } else {
      facts.push([icon('book-open-text'), d.meta], [icon('infinity'), 'Доступ без срока'], [icon('ban'), d.price ? 'Материал не возвращается: открывается сразу' : 'Бесплатно для всех']);
      section = `<section class="detail-section"><h2>${d.type === 'reviews' ? 'Обзор' : 'Идея'}</h2><article class="readable material ${d.contentLocked ? 'locked' : ''}">${richText(d.content)}</article>${d.contentLocked ? `<div class="material-lock">${icon('lock-keyhole')}<p>Дальше — после покупки. Полный текст останется у вас навсегда.</p></div>` : ''}</section>`;
      if (pu) caption = 'Материал у вас';
      else if (!d.contentLocked) caption = 'Открыт для всех';
    }
    if (!panel) {
      if (kind === 'material' && !d.contentLocked) panel = '';
      else if (!me) panel = `<a class="btn wide" href="${api.loginUrl(`/#product/${id}`)}">${icon('log-in')}Войти и получить доступ</a>`;
      else if (me.role !== 'student') panel = `<p class="notice">Покупать может ученик. Вы вошли как ${ROLE[me.role]}${d.expert.id === me.id ? ' — это ваш продукт' : ''}.</p>`;
      else panel = `<button class="btn wide" data-action="buy-product" data-id="${id}">${kind === 'sessions' ? (d.sessions > 1 ? 'Купить пакет' : 'Записаться на встречу') : kind === 'subscription' ? 'Вступить' : 'Открыть материал'}${icon('arrow-right')}</button>`;
    }
    const canReview = !!pu && me?.role === 'student' && !myReviewIn(d.reviewsList || []);
    return `${breadcrumb([[m.name, `#mode/${m.id}`], [cat?.name || d.typeName, `#category/${m.id}/${d.type}`], [d.title]])}<div class="detail-grid"><div class="detail-content"><span class="badge">${esc(d.typeName)}</span><h1>${title}</h1>${expertLink(d.expert)}${cover(d.coverUrl, d.title, 'detail-cover')}
      <section class="detail-section"><h2>О предложении</h2><p>${esc(d.description)}</p></section>${section}
      ${reviewsBlock(d.reviewsList || [], d.rating, d.reviews, canReview, id, 'product')}
    </div><aside class="purchase-panel"><span class="tiny-meta">${esc(m.name)}</span><div class="purchase-price">${money(d.price)}</div><p class="purchase-caption">${esc(caption)}</p>${panel}${saveButton(id)}<ul class="purchase-features">${facts.map(([i, t]) => `<li>${i}${esc(t)}</li>`).join('')}</ul><p class="fine-print">Оплата пока не подключена: доступ открывается без списания денег. Это не инвестиционная рекомендация.</p></aside></div>`;
  }

  async function expertView(id) {
    const e = await api.get(`/experts/${id}`);
    const active = expertMode || (mode === HOME ? 'courses' : mode.id);
    const list = active === 'courses' ? e.courses.map(fromCourse) : e.products.filter(p => p.mode === active).map(fromProduct);
    const fc = e.forecasts;
    const socials = Object.entries(e.socials || {}).filter(([k, v]) => v && SOCIALS[k]);
    const count = m => m === 'courses' ? e.courses.length : e.products.filter(p => p.mode === m).length;
    return `${breadcrumb([['Эксперты', '#rankings'], [e.name]])}<div class="profile-hero">${avatar(e.avatarUrl, e.name)}<div><span class="badge">${icon('badge-check')}Эксперт Dal</span><h1 style="margin-top:10px">${esc(e.name)}</h1><p>${esc(e.specialization)}</p><div class="profile-stats"><span>${rating(e.rating)} ${e.reviews} ${plural(e.reviews, 'отзыв', 'отзыва', 'отзывов')}</span><span>${icon('users-round')}${e.students} ${plural(e.students, 'ученик', 'ученика', 'учеников')}</span>${e.experience ? `<span>${icon('briefcase-business')}${esc(e.experience)}</span>` : ''}<span>${icon('radio')}${fc.done ? `${String(fc.successRate).replace('.', ',')}% прогнозов (${fc.success} из ${fc.done})` : 'Прогнозов пока нет'}</span></div>${socials.length ? `<div class="socials">${socials.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener nofollow">${icon(SOCIALS[k][0])}${SOCIALS[k][1]}</a>`).join('')}</div>` : ''}</div></div><p class="profile-about">${esc(e.bio)}</p><div class="tags">${e.achievements.map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="mode-ratings" aria-label="Рейтинг по направлениям">${modes.map(m => { const r = e.ratings[m.id]; return `<div><span>${m.name}</span>${rating(r.value, r.reviews)}</div>`; }).join('')}<p class="fine-print">Общий рейтинг — среднее по направлениям, где у эксперта есть оценки.</p></div>
      <div class="tabs" role="tablist" aria-label="Направления">${modes.map(m => `<button role="tab" aria-selected="${active === m.id}" class="tab ${active === m.id ? 'active' : ''}" data-action="expert-tab" data-id="${m.id}">${m.name} <span class="tab-count">${count(m.id)}</span></button>`).join('')}</div>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Здесь пока нет предложений', 'Посмотрите другие направления эксперта.')}`;
  }

  function learningView() {
    if (!me) return `<h1>Моё обучение</h1>${loginPrompt()}`;
    if (me.role !== 'student') return `<h1>Моё обучение</h1>${empty('Обучение — для учеников', `Вы вошли как ${ROLE[me.role]}. Свои курсы и продукты вы ведёте в Dal Studio.`, 'clapperboard', `<a class="btn" href="${api.homeFor(me.role)}">${icon('arrow-right')}Открыть Dal Studio</a>`)}`;
    const count = m => m === 'courses' ? learning.courses.length : mine.filter(p => p.mode === m).length;
    const tabs = `<div class="tabs" role="tablist" aria-label="Направление">${modes.map(m => `<button role="tab" aria-selected="${libraryMode === m.id}" class="tab ${libraryMode === m.id ? 'active' : ''}" data-action="library-tab" data-id="${m.id}">${m.name} <span class="tab-count">${count(m.id)}</span></button>`).join('')}</div>`;
    let rows = '';
    if (libraryMode === 'courses') rows = learning.courses.map(c => `<article class="learning-row">${cover(c.coverUrl, c.title)}<div class="learning-info"><span class="product-kicker">${esc(c.expert.name)}</span><h2><a href="#product/${c.id}">${esc(c.title)}</a></h2><div class="progress"><span style="width:${c.progress.percent}%"></span></div><p>${c.progress.done} из ${c.progress.total} ${plural(c.progress.total, 'урока', 'уроков', 'уроков')} · ${c.progress.percent}%</p></div><a class="btn" href="#lesson/${c.id}">${c.progress.done ? 'Продолжить' : 'Начать'}${icon('arrow-right')}</a></article>`).join('');
    else rows = mine.filter(p => p.mode === libraryMode).map(p => {
      const pu = p.purchase;
      let status, action = `<a class="btn" href="#product/${p.id}">Открыть${icon('arrow-right')}</a>`;
      if (p.productKind === 'sessions') {
        status = p.upcoming.length ? `Ближайшая встреча: ${fmtWhen(p.upcoming[0].startsAt)}` : pu.sessionsLeft ? 'Выберите время встречи' : 'Все встречи пакета прошли';
        status += ` · осталось ${pu.sessionsLeft} из ${pu.sessionsTotal}`;
        if (pu.sessionsLeft && !p.upcoming.length) action = `<button class="btn" data-action="book" data-id="${p.id}">${icon('calendar-plus')}Выбрать время</button>`;
      } else if (p.productKind === 'subscription') {
        status = pu.active ? `Подписка до ${fmtDate(pu.expiresAt)}` : `Подписка закончилась ${fmtDate(pu.expiresAt)}`;
        if (pu.active) action = `<button class="btn" data-action="chat" data-id="${p.id}">${icon('messages-square')}Чат</button>`;
      } else status = `${p.meta} · доступ без срока`;
      return `<article class="learning-row">${cover(p.coverUrl, p.title)}<div class="learning-info"><span class="product-kicker">${esc(p.typeName)} · ${esc(p.expert.name)}</span><h2><a href="#product/${p.id}">${esc(p.title)}</a></h2><p>${esc(status)}</p></div>${action}</article>`;
    }).join('');
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span><span class="tiny-meta">${esc(me.name.split(' ')[0])}, рады вас видеть</span></div><h1>Моё обучение</h1><p class="subtitle">Всё, к чему вы уже сделали первый шаг.</p>${libraryMode === 'courses' ? certsBlock() : ''}${tabs}${rows || empty('Здесь начнётся новая история', 'Выберите программу или предложение, которое вам интересно.', 'book-open', `<a class="btn secondary" href="#mode/${libraryMode}">Смотреть предложения ${icon('arrow-right')}</a>`)}`;
  }

  async function lessonView(courseId, lessonId) {
    if (!me) return loginPrompt('Войдите, чтобы смотреть уроки.');
    let c;
    try { c = await api.get(`/learning/courses/${courseId}`); }
    catch (e) { if (e.status === 403) return empty('Курс ещё не открыт', 'Сначала получите доступ на странице курса.', 'lock-keyhole', `<a class="btn" href="#product/${courseId}">К курсу${icon('arrow-right')}</a>`); throw e; }
    const all = c.modules.flatMap(m => m.lessons.map(l => ({ ...l, module: m.title })));
    if (!all.length) return empty('В курсе пока нет уроков', 'Автор ещё готовит программу.', 'clapperboard');
    const firstOpen = all.findIndex(l => !l.completed);
    let index = all.findIndex(l => l.id === lessonId);
    if (index < 0) index = firstOpen < 0 ? all.length - 1 : firstOpen;
    const l = all[index], blocked = all.slice(0, index).some(x => !x.completed);
    const comments = await api.get(`/lessons/${l.id}/comments`).catch(() => null);
    const action = me.role !== 'student' ? '' : l.completed
      ? `<button class="btn secondary" disabled>${icon('circle-check')}Урок пройден</button>${index < all.length - 1 ? `<a class="btn" href="#lesson/${courseId}/${all[index + 1].id}">Следующий урок${icon('arrow-right')}</a>` : ''}`
      : blocked ? `<button class="btn" disabled>${icon('lock')}Сначала завершите предыдущие</button>` : `<button class="btn" data-action="complete-lesson" data-id="${l.id}" data-course="${courseId}">${icon('check')}Завершить урок</button>`;
    return `${breadcrumb([['Моё обучение', '#learning'], [c.title, `#product/${courseId}`]])}<div class="lesson-layout"><article class="lesson-article"><span class="eyebrow">УРОК ${index + 1} ИЗ ${all.length} · ${esc(l.module)}</span><h1>${esc(l.title)}</h1>${l.videoUrl ? `<video class="lesson-video" controls controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture disableremoteplayback playsinline preload="metadata" src="${esc(api.mediaUrl(l.videoUrl))}"></video>` : `<div class="lesson-novideo">${icon('film')}<p>Видео к этому уроку ещё не загружено.</p></div>`}<div class="lesson-actions">${action}<span class="fine-print">${c.progress.done} из ${c.progress.total} завершено · ${c.progress.percent}%</span></div>${me.role === 'student' && c.progress.total && c.progress.done >= c.progress.total ? `<p class="notice">${icon('star')} Курс пройден. <a class="text-link" href="#product/${courseId}">Оставьте отзыв</a>: он будет единственным и неизменяемым, его можно зафиксировать в Solana.</p>` : ''}${comments ? commentsBlock(comments, l.id) : ''}</article><aside class="lesson-list"><h2>Программа курса</h2>${c.modules.map(m => `<p class="lesson-module">${esc(m.title)}</p>${m.lessons.map(x => { const i = all.findIndex(y => y.id === x.id); return `<a class="lesson-item ${i === index ? 'active' : ''}" href="#lesson/${courseId}/${x.id}">${icon(x.completed ? 'circle-check' : i === index ? 'circle-play' : 'circle')}<span>${i + 1}. ${esc(x.title)}</span></a>`; }).join('')}`).join('')}</aside></div>`;
  }

  const commentItem = x => `<article class="comment-item ${x.role === 'expert' ? 'expert' : ''}" id="cm-${x.id}"><div class="review-top"><span class="user-avatar">${esc(x.author[0])}</span><strong>${esc(x.author)}</strong>${x.role === 'expert' ? '<span class="badge">Эксперт</span>' : x.role === 'moderator' ? '<span class="badge">Модератор</span>' : ''}<span class="tiny-meta">${fmtDate(x.createdAt)}</span>${x.canDelete ? `<button class="icon-button comment-del" data-action="delete-comment" data-id="${x.id}" title="Удалить" aria-label="Удалить">${icon('trash-2')}</button>` : ''}</div><p>${esc(x.text)}</p></article>`;
  const commentsBlock = (list, lessonId) => `<section class="lesson-comments"><h2>Вопросы и обсуждение <span class="tiny-meta">${list.length}</span></h2><div id="commentList">${list.length ? list.map(commentItem).join('') : '<p class="subtitle" id="noComments">Пока нет вопросов. Спросите первым: эксперт отвечает здесь же.</p>'}</div><form id="commentForm" class="comment-form" data-lesson="${lessonId}"><textarea name="text" rows="2" maxlength="1000" required placeholder="Задайте вопрос по уроку или поделитесь мыслью"></textarea><button class="btn" type="submit">${icon('send')}Отправить</button></form><p class="fine-print">Обсуждение видят ученики курса и эксперт. Отзыв о курсе — отдельно, после прохождения всех уроков.</p></section>`;

  const certStatus = c => c.nft
    ? `<span class="chain-chip ok">${icon('shield-check')}NFT в вашем кошельке DAL</span>`
    : `<span class="chain-chip">${icon('loader')}${c.chain?.retrying ? 'Сеть Solana недоступна — повторим автоматически' : 'NFT создаётся в Solana'}</span>`;
  const certsBlock = () => certs.length ? `<section class="cert-strip"><div class="section-head" style="margin-top:0"><h2>Мои сертификаты</h2><span class="tiny-meta">Выдаются автоматически после прохождения всех уроков</span></div><div class="cert-list">${certs.map(c => `<article class="cert-mini"><span class="cert-icon">${icon('award')}</span><div><strong>${esc(c.courseTitle)}</strong><p>${fmtDate(c.completedAt)} · ${esc(c.id)}</p>${certStatus(c)}</div><button class="btn secondary" data-action="certificate" data-id="${c.id}">Открыть</button></article>`).join('')}</div></section>` : '';
  async function openCertificate(id, fresh = false) {
    if (!certs.some(c => c.id === id)) certs = await api.get('/me/certificates');
    const c = certs.find(x => x.id === id); if (!c) return;
    const status = c.nft
      ? `<div class="verify ok">${icon('shield-check')}<span><strong>Сертификат записан в Solana как NFT</strong><small>Он в вашем кошельке DAL. Любой может проверить его по ссылке — без регистрации и без кошелька. <a class="text-link" href="${esc(c.nft.url)}" target="_blank" rel="noopener">Solana Explorer</a></small></span></div>`
      : `<div class="notice">${icon('clock')} Сертификат уже действует: его можно скачать и отправить. Запись в Solana создаётся в фоне — обычно за минуту, делать ничего не нужно.</div>`;
    openDialog(fresh ? 'Поздравляем! Курс пройден' : 'Сертификат', `${window.DalCert.card(c)}${status}<div class="modal-actions cert-actions"><button class="btn" data-action="cert-pdf" data-id="${c.id}">${icon('download')}Скачать PDF</button><button class="btn secondary" data-action="cert-copy" data-id="${c.id}">${icon('link')}Ссылка для проверки</button><a class="btn secondary" href="${esc(c.verifyUrl)}" target="_blank" rel="noopener">${icon('external-link')}Открыть проверку</a></div>`, 'wide');
  }

  const RANK_TABS = [['all', 'Общий'], ...modes.map(m => [m.id, m.name]), ['signals', 'Прогнозы']];
  function rankingsView() {
    const signals = rankMode === 'signals', all = rankMode === 'all';
    const value = e => signals ? e.forecasts.successRate : all ? e.rating : e.ratings[rankMode].value;
    const list = [...experts].sort((a, b) => (value(b) ?? -1) - (value(a) ?? -1) || b.students - a.students);
    const third = e => signals ? e.forecasts.done : all ? e.students : e.ratings[rankMode].reviews;
    const fourth = e => signals ? (e.forecasts.done ? `${String(e.forecasts.successRate).replace('.', ',')}% (${e.forecasts.success}/${e.forecasts.done})` : '—') : rating(value(e));
    const context = signals ? 'Доля прогнозов, у которых выполнено заранее заданное условие. Этот показатель не равен доходности портфеля и сам по себе не доказывает мастерство инвестора.'
      : all ? 'Общий рейтинг — среднее арифметическое оценок эксперта по направлениям, где у него есть отзывы.' : `Средняя оценка по отзывам учеников в направлении «${findMode(rankMode).name}».`;
    return `<div class="page-topline"><span class="eyebrow">ЛЮДИ И РЕПУТАЦИЯ</span></div><h1>Рейтинг экспертов</h1><p class="subtitle">Опыт учеников в каждом направлении и результаты прогнозов, каждый на своём месте.</p><div class="tabs" role="tablist" aria-label="Рейтинг">${RANK_TABS.map(([id, t]) => `<button role="tab" aria-selected="${rankMode === id}" class="tab ${rankMode === id ? 'active' : ''}" data-action="rank-tab" data-id="${id}">${t}</button>`).join('')}</div><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>Место</th><th>Эксперт</th><th>${signals ? 'Завершённые прогнозы' : all ? 'Учеников' : 'Отзывов'}</th><th>${signals ? 'Выполнено условий' : 'Оценка из 5'}</th><th></th></tr></thead><tbody>${list.map((e, i) => `<tr><td>${value(e) == null ? '—' : String(i + 1).padStart(2, '0')}</td><td>${expertLink(e)}</td><td>${third(e)}</td><td>${fourth(e)}</td><td><a class="icon-button" href="#expert/${e.id}" aria-label="Профиль: ${esc(e.name)}">${icon('arrow-up-right')}</a></td></tr>`).join('')}</tbody></table></div><p class="rank-context">${context} Статистика прогнозов отделена от отзывов об обучении.</p>`;
  }

  function signalsView() {
    const list = forecasts.filter(f => signalFilter === 'all' || f.status === signalFilter);
    return `${breadcrumb([['Идеи и аналитика', '#mode/ideas'], ['Сигналы']])}<div class="heading-row"><h1>История прогнозов</h1></div><p class="subtitle">Гипотеза, срок и результат. В том числе когда прогноз не сбылся.</p><div class="tabs">${[['all', 'Все прогнозы'], ['active', 'Открытые'], ['success', 'Выполненные'], ['miss', 'Не выполненные']].map(([id, n]) => `<button class="tab ${signalFilter === id ? 'active' : ''}" data-action="signal-filter" data-id="${id}">${n}</button>`).join('')}</div>${list.length ? `<div class="signal-grid">${list.map(signalCard).join('')}</div>` : empty('Прогнозов нет', 'В этом фильтре пока пусто.')}<p class="rank-context">Прогноз фиксируется в момент публикации: изменить или удалить его нельзя. Итог определяется по цене закрытия на дату проверки.</p>`;
  }

  function settingsView() {
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Настройки</h1><div class="settings-list">
      <div class="setting-row"><div><h2>Оформление</h2><p>Светлая, тёмная или системная тема</p></div><div class="segmented" role="group" aria-label="Оформление">${[['light', 'sun', 'Светлая'], ['dark', 'moon', 'Тёмная'], ['system', 'monitor', 'Системная']].map(([id, i, t]) => `<button data-action="set-theme" data-id="${id}" class="${prefs.theme === id ? 'active' : ''}" title="${t}" aria-label="${t}" aria-pressed="${prefs.theme === id}">${icon(i)}</button>`).join('')}</div></div>
      <div class="setting-row"><div><h2>Акцентный цвет</h2><p>Автоматически по разделу или любимый оттенок</p></div><div class="swatches">${[['auto', '', 'По разделу'], ['green', '#21755a', 'Зелёный'], ['violet', '#6552a0', 'Фиолетовый'], ['coral', '#af5b43', 'Коралловый'], ['blue', '#326db6', 'Синий']].map(([id, color, name]) => `<button class="swatch ${id === 'auto' ? 'auto' : ''} ${prefs.accent === id ? 'active' : ''}" style="${color ? 'background:' + color : ''}" data-action="accent" data-id="${id}" title="${name}" aria-label="${name}" aria-pressed="${prefs.accent === id}">${prefs.accent === id ? icon('check') : ''}</button>`).join('')}</div></div>
      <div class="setting-row"><div><h2>Анимация переходов</h2><p>Учитывает системную настройку уменьшения движения</p></div><label class="switch"><input type="checkbox" id="motionToggle" aria-label="Анимация переходов" ${prefs.motion ? 'checked' : ''}><span></span></label></div>
      <div class="setting-row"><div><h2>Аккаунт</h2><p>${me ? `${esc(me.name)} · ${esc(me.email)} · ${ROLE[me.role]}` : 'Вы не вошли'}</p></div>${me ? `<button class="btn secondary" data-action="logout">${icon('log-out')}Выйти</button>` : `<a class="btn" href="${api.loginUrl()}">${icon('log-in')}Войти</a>`}</div>
    </div>`;
  }

  async function profileView() {
    if (!me) return `<h1>Личный профиль</h1>${loginPrompt('Войдите, чтобы изменить профиль.')}`;
    const editable = me.role !== 'expert';
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Личный профиль</h1><form class="profile-form" id="profileForm"><div class="avatar-edit"><span class="user-avatar profile-avatar">${userPic(me)}</span><div><label class="btn secondary" tabindex="0">${icon('camera')}${me.avatarUrl ? 'Сменить фото' : 'Загрузить фото'}<input type="file" id="avatarInput" accept="image/jpeg,image/png,image/webp" hidden></label>${me.avatarUrl ? `<button type="button" class="text-link" data-action="avatar-remove">${icon('trash-2')}Убрать фото</button>` : ''}<p class="fine-print">JPG, PNG или WEBP до 5 МБ. Фото видят эксперты и участники клубов.</p></div></div><label class="form-label">Имя и фамилия<input type="text" name="name" maxlength="60" required value="${esc(me.name)}" ${editable ? '' : 'readonly'}></label>${editable ? '' : `<p class="fine-print">Имя эксперта меняется через модерацию: <a class="text-link" href="/studio.html#profile">Публичный профиль в Dal Studio</a>.</p>`}<label class="form-label">Электронная почта<input type="email" value="${esc(me.email)}" readonly></label><p class="fine-print">Роль: ${ROLE[me.role]}. С нами с ${fmtDate(me.createdAt)}.</p>${editable ? `<button class="btn" type="submit">${icon('check')}Сохранить изменения</button>` : ''}</form>${await walletSection()}${me.role === 'student' ? await ordersSection() : ''}`;
  }

  // The built-in wallet: no crypto knowledge needed; it is linked to the account and survives a password reset.
  async function walletSection() {
    const d = await api.get('/me/wallet').catch(() => null);
    if (!d) return '';
    const w = d.wallet;
    const body = w
      ? `<div class="wallet-row"><code class="wallet-address">${esc(w.address)}</code><button class="icon-button" data-action="copy-text" data-text="${esc(w.address)}" title="Скопировать адрес" aria-label="Скопировать адрес">${icon('copy')}</button><a class="text-link" href="${esc(w.url)}" target="_blank" rel="noopener">${icon('external-link')}Solana Explorer</a></div><p class="fine-print">Создан ${fmtDate(w.createdAt)}. Сертификатов: ${d.certificates}${me.role === 'expert' ? ` · прогнозов, записанных в Solana: ${d.forecasts}` : ''}.</p>`
      : `<p class="fine-print">Кошелёк создастся автоматически, когда понадобится: например, при получении первого сертификата${me.role === 'expert' ? ' или публикации прогноза' : ''}.</p>`;
    return `<section class="wallet-section"><h2>${icon('wallet')}Кошелёк DAL</h2><p class="subtitle">Встроенный кошелёк привязан к вашему аккаунту. Покупать криптовалюту, ставить расширения и платить комиссии сети не нужно — это делает DAL.</p>${body}<div class="wallet-help"><div><strong>${icon('life-buoy')}Если забудете пароль</strong><p>Восстановите доступ по коду на почту — кошелёк, сертификаты и записи в блокчейне останутся с аккаунтом.</p></div><div><strong>${icon('key-round')}Свой криптокошелёк</strong><p>Необязательно. Подключите Phantom, если хотите платить в USDC. Можно и забрать ключ кошелька DAL в Phantom.</p><div class="own-wallet" id="ownWalletMount"></div>${w ? `<button class="text-link" data-action="wallet-export">${icon('key-round')}Экспортировать ключ</button>` : ''}</div></div></section>`;
  }
  async function ordersSection() {
    const list = await api.get('/me/orders').catch(() => []);
    if (!list.length) return '';
    const st = { paid: 'Оплачен', pending: 'Проверяется', failed: 'Не прошёл' };
    return `<section class="wallet-section"><h2>${icon('receipt')}Мои заказы</h2><div class="rank-table-wrap"><table class="rank-table orders-table"><thead><tr><th>Дата</th><th>Что</th><th>Цена</th><th>Сетевой сбор</th><th>Итого</th><th>Оплата</th><th>Статус</th></tr></thead><tbody>${list.map(o => `<tr><td>${fmtDate(o.createdAt)}</td><td>${esc(o.title || '')}</td><td>${money(o.price)}</td><td>${o.networkFee ? money(o.networkFee) : '—'}</td><td><strong>${money(o.total)}</strong></td><td>${o.method === 'usdc' ? `USDC${o.chain?.url ? ` · <a class="text-link" href="${esc(o.chain.url)}" target="_blank" rel="noopener">Solana</a>` : ''}` : 'Карта'}</td><td>${st[o.status]}</td></tr>`).join('')}</tbody></table></div><p class="fine-print">Комиссия DAL уже включена в цену. Сетевой сбор берётся один раз за заказ, использующий блокчейн.</p></section>`;
  }

  function savedView() {
    const list = offers().filter(o => favs.has(o.id));
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Избранное</h1><p class="subtitle" style="margin-bottom:28px">То, к чему хочется вернуться. ${me ? 'Сохраняется в вашем аккаунте.' : 'Пока вы не вошли, хранится в этом браузере.'}</p>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Пока здесь пусто', 'Отмечайте понравившиеся материалы закладкой.', 'bookmark')}`;
  }

  function errorView(e) {
    if (e.code === 'offline') return `<div class="offline">${icon('plug-zap')}<h2>Сервер не отвечает</h2><p>Сайт работает вместе с сервером на вашем компьютере. Откройте PowerShell в папке <code>DAL\\server</code>, выполните <code>npm start</code> и откройте <code>http://localhost:4000</code>.</p><button class="btn" data-action="reload">${icon('refresh-cw')}Попробовать снова</button></div>`;
    if (e.status === 404) return empty('Не найдено', esc(e.message));
    return empty('Что-то пошло не так', esc(e.message), 'triangle-alert');
  }

  async function view(page, id, cat) {
    if (offline) return errorView({ code: 'offline' });
    switch (page) {
      case 'home': case '': return overview();
      case 'mode': return modeHome();
      case 'category': return categoryView(cat);
      case 'product': return productView(id);
      case 'expert': return expertView(id);
      case 'learning': if (me?.role === 'student') certs = await api.get('/me/certificates').catch(() => certs); return learningView();
      case 'lesson': return lessonView(id, cat);
      case 'rankings': return rankingsView();
      case 'settings': return settingsView();
      case 'profile': return profileView();
      case 'saved': return savedView();
      default: return empty('Страница не найдена', 'Вернитесь к обзору Dal.');
    }
  }

  async function render() {
    const my = ++seq;
    const hash = (location.hash || '#home').slice(1), [page, id, cat] = hash.split('/');
    const newRoute = hash !== routeKey;
    if (newRoute) { catalogSearch = ''; catalogSort = 'popular'; freeOnly = false; expertMode = ''; signalFilter = 'all'; }
    routeKey = hash;
    if (['home', ''].includes(page)) mode = HOME;
    if (['mode', 'category'].includes(page)) mode = findMode(id);
    if (page === 'product') { const o = findOffer(id); if (o) mode = findMode(o.mode); }
    if (page === 'lesson') mode = findMode('courses');
    prefs.mode = mode.id; savePrefs();
    updateChrome();
    const slow = setTimeout(() => { if (my === seq) main.innerHTML = `<div class="page"><div class="loading">Загружаем…</div></div>`; }, 200);
    let html;
    try { html = await view(page, id, cat); }
    catch (e) { html = errorView(e); }
    clearTimeout(slow);
    if (my !== seq) return;
    main.innerHTML = `<div class="page">${html}${footer()}</div>`;
    window.DalWallet?.mount($('#ownWalletMount', main));
    icons();
    if ($('#catalogSort')) $('#catalogSort').value = catalogSort;
    document.title = `Dal · ${$('h1', main)?.textContent || mode.name}`;
    closeProfile();
    if (newRoute) { window.scrollTo({ top: 0, behavior: 'instant' }); if (lastNav) main.focus({ preventScroll: true }); }
    lastNav = hash;
    // Records are written to Solana in the background: refresh the page a few times while something is pending.
    clearTimeout(chainPoll);
    const pending = (page === 'learning' && certs.some(c => !c.nft)) || $('.chain-chip.pending', main);
    if (pending && pollCount < 20) { pollCount++; chainPoll = setTimeout(() => { if ((location.hash || '#home').slice(1) === hash && !modal.open) render(); }, 6000); }
    else if (newRoute) pollCount = 0;
  }
  let chainPoll = 0, pollCount = 0;

  // ---------- Dialogs and actions ----------
  function toast(m) { clearTimeout(toastTimer); $('#toast').textContent = m; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }
  function openDialog(title, body, cls = '') {
    if (modal.open) modal.close();
    lastFocus = document.activeElement; modal.className = cls;
    modal.innerHTML = `<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-button" data-action="close-modal" title="Закрыть" aria-label="Закрыть">${icon('x')}</button></div>${body}`;
    icons(); modal.showModal();
  }
  const confirmDialog = (title, text, action, id, label, extra = '') => openDialog(title, `<p class="modal-text">${text}</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="${action}" data-id="${id}" ${extra}>${label}</button></div>`);
  function openSearch() {
    openDialog('Что хотите изучить?', `<label class="input-wrap" style="display:block">${icon('search')}<input id="globalSearch" type="search" aria-label="Поиск по Dal" placeholder="Курс, консультация, клуб или имя эксперта" autofocus></label><div class="search-results" id="searchResults">${searchResults('')}</div>`);
    $('#globalSearch').focus();
  }
  function searchResults(term) {
    const q = term.toLocaleLowerCase('ru');
    const r = offers().filter(o => (o.title + ' ' + o.expert.name + ' ' + o.tag).toLocaleLowerCase('ru').includes(q)).slice(0, 7);
    return r.length ? r.map(o => `<a class="search-result" href="#product/${o.id}">${cover(o.cover)}<div><strong>${esc(o.title)}</strong><small>${esc(o.tag)} · ${esc(o.expert.name)} · ${money(o.price)}</small></div>${icon('arrow-up-right')}</a>`).join('') : '<p class="modal-text">Ничего не найдено. Попробуйте другое слово.</p>';
  }
  // Checkout: the full cost is visible before paying — price, DAL commission, the network fee and the total.
  const NETWORK_FEE_INFO = 'Сетевой сбор — фиксированные 5 ₸ один раз за оплаченный заказ, который использует блокчейн: у курса это NFT-сертификат, при оплате в USDC — сама оплата. Фактическую комиссию сети Solana платит DAL.';
  function breakdownHtml(method) {
    const q = lastQuote.methods[method], line = (k, v, cls = '') => `<div class="order-line ${cls}"><span>${k}</span><strong>${v}</strong></div>`;
    return line('Цена', money(q.price))
      + line(`Комиссия DAL (${Math.round(q.commission / q.price * 100)}%) — уже в цене`, money(q.commission), 'sub')
      + line('Эксперт получит', money(q.expertGets), 'sub')
      + line(`Сетевой сбор <button type="button" class="info-dot" data-action="fee-info" aria-label="Что такое сетевой сбор" title="Что такое сетевой сбор">${icon('info')}</button>`, q.networkFee ? money(q.networkFee) : 'Нет')
      + line('Итого к оплате', money(q.total), 'total')
      + (method === 'usdc' && q.usdc ? `<p class="fine-print usdc-split">≈ ${q.usdc.total.toFixed(2)} USDC (курс ${q.usdc.rate} ₸): ${q.usdc.toExpert.toFixed(2)} USDC эксперту и ${q.usdc.toDal.toFixed(2)} USDC DAL — одной транзакцией Solana. Сетевые расходы оплачивает DAL.</p>` : '');
  }
  async function checkoutHtml(kind, id, price) {
    if (!price) { lastQuote = null; return `<div class="order-line total"><span>Итого</span><strong>${money(0)}</strong></div>`; }
    lastQuote = await api.post('/checkout/quote', { kind, id });
    return `<div id="checkoutBox">${breakdownHtml('card')}</div><fieldset class="pay-methods"><legend>Способ оплаты</legend><label class="pay-method"><input type="radio" name="payMethod" value="card" checked><span><strong>Банковская карта</strong><small>Visa, Mastercard, Kaspi · в прототипе без списания денег</small></span></label><label class="pay-method"><input type="radio" name="payMethod" value="usdc"><span><strong>USDC в сети Solana</strong><small>Для тех, у кого есть криптокошелёк Phantom · Devnet, бета</small></span></label></fieldset>`;
  }
  const payMethod = () => $('input[name=payMethod]:checked')?.value || 'card';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function payUsdc(kind, id) {
    if (!window.DalSolana?.hasWallet()) throw new Error('Для оплаты в USDC нужен кошелёк Phantom (сеть Devnet). Или выберите оплату картой.');
    const payer = await window.DalSolana.connect();
    const r = await api.post('/orders', { kind, id, method: 'usdc', payer });
    const sig = await window.DalSolana.signAndSendPartial(r.transaction, r.payerIndex);
    await api.post(`/orders/${r.order.id}/submit`, { signature: sig });
    toast('Платёж отправлен. Проверяем его в сети Solana…');
    for (let i = 0; i < 40; i++) {
      await sleep(3000);
      const o = await api.get(`/orders/${r.order.id}`);
      if (o.status === 'paid') return o;
      if (o.status === 'failed') throw new Error(o.error || 'Платёж не прошёл проверку');
    }
    throw new Error('Платёж ещё проверяется. Доступ откроется автоматически — загляните в «Моё обучение» через минуту.');
  }

  async function buyCourse(id) {
    if (!me) { location.href = api.loginUrl(`/#product/${id}`); return; }
    const o = findOffer(id); if (!o) return;
    const pay = await checkoutHtml('course', id, o.price);
    openDialog(o.price ? 'Получить доступ' : 'Начать бесплатно', `<p class="modal-text">${esc(o.title)}</p><div class="order-line"><span>Эксперт</span><strong>${esc(o.expert.name)}</strong></div><div class="order-line"><span>Уроков</span><strong>${o.lessons}</strong></div>${pay}<div class="notice">${icon('award')} После прохождения всех уроков вы автоматически получите сертификат с проверкой в блокчейне. Ничего настраивать не нужно.</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-buy" data-id="${id}">${icon('check')}${o.price ? 'Оплатить' : 'Открыть доступ'}</button></div>`);
  }
  async function buyProduct(id) {
    if (!me) { location.href = api.loginUrl(`/#product/${id}`); return; }
    const o = findOffer(id); if (!o) return;
    const pu = myProduct(id)?.purchase;
    const p = products.find(x => x.id === id) || myProduct(id);
    let what = '', terms = '';
    if (o.productKind === 'sessions') {
      what = p.type === 'consultation' ? 'Одна встреча' : `${p.sessions} ${plural(p.sessions, 'встреча', 'встречи', 'встреч')} по ${p.durationMin} мин`;
      terms = 'После оплаты выберите время из расписания эксперта. Возврат — в течение 14 дней, пока не назначена ни одна встреча.';
    } else if (o.productKind === 'subscription') {
      const live = pu?.active;
      what = `${p.periodDays} ${plural(p.periodDays, 'день', 'дня', 'дней')}${live ? ` · продление до ${fmtDate(new Date(new Date(pu.expiresAt).getTime() + p.periodDays * 864e5).toISOString())}` : ''}`;
      terms = 'Подписка открывает чат и встречи сразу, поэтому не возвращается. Продлить можно в любой момент — срок прибавится.';
    } else {
      what = o.meta;
      terms = 'Полный текст откроется сразу и останется у вас. Материалы не возвращаются.';
    }
    const pay = await checkoutHtml('product', id, o.price);
    openDialog(pu?.active ? 'Продлить подписку' : 'Получить доступ', `<p class="modal-text">${esc(o.title)}</p><div class="order-line"><span>Эксперт</span><strong>${esc(o.expert.name)}</strong></div><div class="order-line"><span>${esc(o.tag)}</span><strong>${esc(what)}</strong></div>${pay}<div class="notice">${terms}</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-product" data-id="${id}">${icon('check')}${o.price ? 'Оплатить' : 'Получить'}</button></div>`);
  }

  async function openBooking(id) {
    const d = await api.get(`/learning/products/${id}`);
    if (!d.purchase?.sessionsLeft) { buyProduct(id); return; }
    if (!d.freeSlots.length) { openDialog('Свободного времени нет', `<p class="modal-text">Эксперт пока не открыл новое время для встреч. Загляните позже — встреча в пакете за вами сохранится.</p><div class="modal-actions"><button class="btn" data-action="close-modal">Понятно</button></div>`); return; }
    const days = new Map();
    for (const s of d.freeSlots) { const k = new Date(s.startsAt).toDateString(); if (!days.has(k)) days.set(k, []); days.get(k).push(s); }
    openDialog('Выберите время', `<p class="modal-text">${esc(d.title)} · ${d.durationMin} мин · осталось ${d.purchase.sessionsLeft} ${plural(d.purchase.sessionsLeft, 'встреча', 'встречи', 'встреч')}</p><form id="bookingForm" data-product="${id}"><div class="slot-days">${[...days.values()].map(list => `<fieldset class="slot-day"><legend>${esc(dayFmt.format(new Date(list[0].startsAt)))}</legend><div class="slot-list">${list.map(s => `<label class="slot"><input type="radio" name="slot" value="${s.id}" data-when="${esc(fmtWhen(s.startsAt))}" required><span>${hourFmt.format(new Date(s.startsAt))}</span></label>`).join('')}</div></fieldset>`).join('')}</div><p class="fine-print">Время — по часовому поясу вашего компьютера. Отменить запись можно не позже чем за 24 часа: встреча вернётся в пакет.</p><button type="submit" class="btn wide" style="margin-top:16px">${icon('calendar-check')}Записаться</button></form>`, 'wide');
  }

  // Club chat: messages are polled every 5 seconds while the window is open.
  let chatLast = '';
  const chatMsg = m => `<div class="chat-message ${m.mine ? 'self' : ''} ${m.isExpert ? 'expert' : ''}" data-id="${m.id}"><strong>${esc(m.mine ? 'Вы' : m.author)}${m.isExpert && !m.mine ? ' · эксперт' : ''}</strong>${esc(m.text)}<small>${esc(shortFmt.format(new Date(m.createdAt)))}</small></div>`;
  function appendChat(list) {
    const box = $('#chatMessages'); if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    for (const m of list) {
      if (box.querySelector(`[data-id="${m.id}"]`)) continue;
      $('#chatEmpty')?.remove();
      box.insertAdjacentHTML('beforeend', chatMsg(m));
      if (m.createdAt > chatLast) chatLast = m.createdAt;
    }
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  async function openChat(id) {
    const o = findOffer(id);
    const msgs = await api.get(`/products/${id}/messages`);
    chatLast = msgs.at(-1)?.createdAt || '';
    openDialog(esc(o?.title || 'Чат'), `<p class="fine-print">Участники видят ваше имя и первую букву фамилии. Не публикуйте личные данные и не обещайте доходность.</p><div class="chat-messages" id="chatMessages" aria-live="polite">${msgs.length ? msgs.map(chatMsg).join('') : '<p class="fine-print" id="chatEmpty">Сообщений пока нет. Начните разговор.</p>'}</div><form class="chat-form" id="chatForm" data-product="${id}"><input type="text" name="message" required maxlength="1000" aria-label="Сообщение" placeholder="Ваше сообщение" autocomplete="off"><button class="btn" type="submit" title="Отправить" aria-label="Отправить">${icon('send')}</button></form>`, 'wide');
    $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    $('#chatForm input').focus();
    clearInterval(chatTimer);
    chatTimer = setInterval(async () => {
      if (!modal.open || !$('#chatForm')) { clearInterval(chatTimer); return; }
      try { appendChat(await api.get(`/products/${id}/messages?after=${encodeURIComponent(chatLast)}`)); }
      catch (e) { if (e.status === 403) { clearInterval(chatTimer); toast(e.message); } }
    }, 5000);
  }

  // On-chain forecast check: read the Solana transaction and compare the recorded terms with those on the site.
  const memoBlock = m => `<pre class="memo">${esc(m)}</pre>`;
  async function verifyAnchor(f, review = false) {
    const t = review
      ? { title: 'Отзыв: проверка в Solana', ok: 'Отзыв не менялся с момента записи в блокчейн', bad: 'Отзыв на сайте не совпадает с записью в блокчейне', who: 'кошелёк автора', site: 'Запись отзыва на сайте', fine: 'Блокчейн подтверждает, что оценка и текст отзыва не менялись после публикации. Отзыв на Dal можно оставить только один раз и только после прохождения всего курса.' }
      : { title: `${esc(f.ticker)}: проверка в Solana`, ok: 'Условия не менялись с момента записи в блокчейн', bad: 'Условия на сайте не совпадают с записью в блокчейне', who: 'кошелёк эксперта', site: 'Условия на сайте', fine: 'Блокчейн подтверждает, что условия зафиксированы до срока проверки и не переписаны. Он не гарантирует, что прогноз верный.' };
    openDialog(t.title, `<p class="modal-text" id="verifyWait">Читаем транзакцию из публичного узла Solana…</p>`, 'wide');
    let r;
    try { r = await window.DalSolana.verify(f.anchor.signature, f.memo); } catch (e) { r = { error: e.message }; }
    const body = r.error ? `<div class="notice"><span>Узел Solana не ответил:</span> ${esc(r.error)}. <span>Проверьте по ссылке ниже.</span></div>`
      : !r.found ? '<div class="notice">Транзакция пока не найдена в сети. Если её отправили только что, подождите минуту.</div>'
      : r.ok ? `<div class="verify ok">${icon('shield-check')}<span><strong>${t.ok}</strong><small><span>Записано</span> <span>${esc(fmtDate(r.blockTime))}</span> · <span>блок</span> ${nf.format(r.slot)} · <span>${t.who}</span> ${esc(r.signer.slice(0, 4))}…${esc(r.signer.slice(-4))}</small></span></div>`
      : `<div class="verify bad">${icon('shield-alert')}<span><strong>${t.bad}</strong><small>В блокчейне записано:</small></span></div>${memoBlock(r.memo)}`;
    $('#verifyWait')?.remove();
    modal.insertAdjacentHTML('beforeend', `${body}<h3 class="modal-sub">${t.site}</h3>${memoBlock(f.memo)}<a class="text-link" href="${esc(f.anchor.explorerUrl)}" target="_blank" rel="noopener">${icon('external-link')}Открыть транзакцию в Solana Explorer</a><p class="fine-print">${t.fine}</p>`);
    icons();
  }
  function anchorReviewDialog(r, note = '') {
    openDialog('Зафиксировать отзыв в Solana', `<p class="modal-text">Оценка, курс и отпечаток (SHA-256) текста отзыва будут записаны в публичный блокчейн Solana (сеть Devnet) транзакцией из вашего кошелька Phantom. Любой сможет сверить отзыв на сайте с записью в блокчейне: изменить его задним числом станет невозможно.</p>${memoBlock(r.memo)}${note}<p class="fine-print">Нужен кошелёк Phantom с включённой сетью Devnet (Настройки → Developer Settings → Testnet mode). Комиссия — доли тестового SOL. Сам текст в блокчейн не попадает, только его отпечаток.</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="anchor-review-go" data-id="${r.id}">${icon('wallet')}Подключить Phantom и записать</button></div>`, 'wide');
  }
  function closeProfile() { $('#profileMenu').hidden = true; $('.user-trigger').setAttribute('aria-expanded', 'false'); }
  function toggleProfile() {
    const p = $('#profileMenu');
    if (!p.hidden) { closeProfile(); return; }
    const page = (location.hash || '#home').slice(1).split('/')[0];
    const link = (href, ic, text, extra = '') => `<a href="#${href}" class="${page === href || (href === 'learning' && page === 'lesson') ? 'active' : ''}">${icon(ic)}<span>${text}</span>${extra}</a>`;
    if (!me) {
      p.innerHTML = `<div class="popover-person"><span class="user-avatar">${icon('user-round')}</span><div><strong>Вы не вошли</strong><p>Войдите, чтобы учиться и сохранять прогресс</p></div></div><a href="${api.loginUrl()}">${icon('log-in')}<span>Войти</span></a><a href="/login.html?mode=register">${icon('user-plus')}<span>Регистрация</span></a><div class="popover-separator"></div>${link('saved', 'bookmark', 'Избранное', `<span class="nav-count">${favs.size}</span>`)}${link('rankings', 'chart-no-axes-column-increasing', 'Рейтинг экспертов')}${link('settings', 'settings-2', 'Настройки')}`;
    } else {
      let progress = '';
      const c = learning.inProgress;
      if (c) progress = `<a class="popover-progress" href="#lesson/${c.id}"><span class="continue-label"><span class="live-dot"></span>${c.progress.done === c.progress.total ? 'Пройдено' : 'В процессе'}</span><strong>${esc(c.title)}</strong><span class="progress"><span style="width:${c.progress.percent}%"></span></span><span class="side-progress-meta"><span>${c.progress.done} из ${c.progress.total} уроков</span><span>${c.progress.percent}%</span></span></a>`;
      const next = mine.flatMap(x => x.upcoming.map(b => ({ ...b, product: x }))).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
      if (next) progress += `<a class="popover-progress" href="#product/${next.product.id}"><span class="continue-label">${icon('calendar-check')}Ближайшая встреча</span><strong>${esc(next.product.title)}</strong><span class="side-progress-meta"><span>${esc(fmtWhen(next.startsAt))}</span></span></a>`;
      const studio = me.role !== 'student' ? `<a href="${api.homeFor(me.role)}" class="popover-studio">${icon(me.role === 'moderator' ? 'shield-check' : 'clapperboard')}<span>${me.role === 'moderator' ? 'Модерация' : 'Dal Studio'}</span>${icon('arrow-up-right')}</a>` : '';
      p.innerHTML = `<div class="popover-person"><span class="user-avatar">${userPic(me)}</span><div><strong>${esc(me.name)}</strong><p>${me.role === 'student' ? 'Личный кабинет ученика' : ROLE[me.role][0].toUpperCase() + ROLE[me.role].slice(1)}</p></div></div>${studio}${progress}<div class="popover-label">ВАШЕ ПРОСТРАНСТВО</div>${me.role === 'student' ? link('learning', 'book-open', 'Моё обучение', `<span class="nav-count">${learning.courses.length + mine.length}</span>`) : ''}${link('saved', 'bookmark', 'Избранное', `<span class="nav-count">${favs.size}</span>`)}${link('rankings', 'chart-no-axes-column-increasing', 'Рейтинг экспертов')}<div class="popover-separator"></div>${link('profile', 'circle-user-round', 'Мой профиль')}${link('settings', 'settings-2', 'Настройки')}<button data-action="logout">${icon('log-out')}<span>Выйти</span></button>`;
    }
    p.hidden = false; $('.user-trigger').setAttribute('aria-expanded', 'true'); icons(); $('a, button', p)?.focus();
  }
  async function saveOffer(id) {
    const had = favs.has(id);
    if (me) await (had ? api.del(`/me/favorites/${id}`) : api.put(`/me/favorites/${id}`));
    had ? favs.delete(id) : favs.add(id);
    if (!me) { prefs.saved = [...favs]; savePrefs(); }
    if (location.hash === '#saved') render();
    else {
      $$(`[data-action="save"][data-id="${id}"]`).forEach(b => { b.classList.toggle('saved', !had); b.setAttribute('aria-pressed', String(!had)); b.setAttribute('aria-label', had ? 'В избранное' : 'Убрать из избранного'); b.title = had ? 'В избранное' : 'Убрать из избранного'; if (!b.classList.contains('icon-button')) b.innerHTML = icon('bookmark') + (had ? 'В избранное' : 'В избранном'); });
      icons();
    }
    toast(had ? 'Убрано из избранного' : 'Добавлено в избранное');
  }
  const guard = async (fn, button) => {
    if (button) button.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); } finally { if (button?.isConnected) button.disabled = false; }
  };
  const afterChange = async () => { await Promise.all([refreshLearning(), refreshCatalog()]); };

  document.addEventListener('click', event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); main.focus(); return; }
    const button = event.target.closest('[data-action]');
    if (!event.target.closest('#profileMenu,.user-trigger')) closeProfile();
    if (event.target.closest('a[href^="#"]') && modal.open) modal.close();
    if (!button || button.disabled) return;
    const { action, id } = button.dataset;
    switch (action) {
      case 'mode': selectMode(id); break;
      case 'drum-prev': showPreview(drumItems.indexOf(mode) - 1); selectMode(drumItems[preview].id); break;
      case 'drum-next': showPreview(drumItems.indexOf(mode) + 1); selectMode(drumItems[preview].id); break;
      case 'drum-select': selectMode(drumItems[preview].id); break;
      case 'search': openSearch(); break;
      case 'profile-menu': toggleProfile(); break;
      case 'theme': prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; savePrefs(); updateChrome(); if (location.hash === '#settings') render(); break;
      case 'set-theme': prefs.theme = id; savePrefs(); render(); break;
      case 'accent': prefs.accent = id; savePrefs(); render(); break;
      case 'save': guard(() => saveOffer(id), button); break;
      case 'shelf': { const row = button.closest('.shelf').querySelector('.shelf-row'); row?.scrollBy({ left: Number(id) * row.clientWidth * .9, behavior: prefs.motion ? 'smooth' : 'auto' }); break; }
      case 'buy': guard(() => buyCourse(id), button); break;
      case 'buy-product': guard(() => buyProduct(id), button); break;
      case 'fee-info': toast(NETWORK_FEE_INFO); break;
      case 'book': guard(() => openBooking(id), button); break;
      case 'chat': guard(() => openChat(id), button); break;
      case 'close-modal': modal.close(); break;
      case 'reload': guard(async () => { await loadBase(); render(); }, button); break;
      case 'confirm-buy': guard(async () => {
        if (payMethod() === 'usdc') await payUsdc('course', id); else await api.post(`/courses/${id}/enroll`);
        await afterChange();
        modal.close(); toast('Доступ открыт. Курс в «Моём обучении».'); location.hash = `#lesson/${id}`;
      }, button); break;
      case 'confirm-product': guard(async () => {
        const r = payMethod() === 'usdc' ? await payUsdc('product', id) : await api.post(`/products/${id}/buy`);
        await afterChange();
        modal.close();
        const p = myProduct(id);
        if (p?.productKind === 'sessions') { await render(); toast('Оплачено. Выберите время встречи.'); await openBooking(id); return; }
        await render();
        toast(p?.productKind === 'subscription' ? (r.expiresAt ? (r.renewed ? `Подписка продлена до ${fmtDate(r.expiresAt)}` : `Вы в клубе до ${fmtDate(r.expiresAt)}`) : 'Оплачено. Подписка активна.') : 'Материал открыт');
      }, button); break;
      case 'refund': confirmDialog('Вернуть курс?', 'Возврат возможен в течение 14 дней после покупки, если пройдено меньше 20% курса. После возврата доступ к урокам закроется.', 'confirm-refund', id, 'Вернуть'); break;
      case 'confirm-refund': guard(async () => {
        const r = await api.post(`/courses/${id}/refund`);
        await afterChange();
        modal.close(); render(); toast(`Курс возвращён: ${money(r.refunded)}`);
      }, button); break;
      case 'refund-product': confirmDialog('Вернуть оплату?', 'Возврат возможен в течение 14 дней после покупки, пока не назначена ни одна встреча.', 'confirm-refund-product', id, 'Вернуть'); break;
      case 'confirm-refund-product': guard(async () => {
        const r = await api.post(`/products/${id}/refund`);
        await afterChange();
        modal.close(); render(); toast(`Оплата возвращена: ${money(r.refunded)}`);
      }, button); break;
      case 'cancel-booking': confirmDialog('Отменить запись?', `Встреча ${esc(button.dataset.when)} будет отменена, а встреча вернётся в ваш пакет. Время станет свободным для других.`, 'confirm-cancel', id, 'Отменить запись'); break;
      case 'confirm-cancel': guard(async () => {
        await api.post(`/bookings/${id}/cancel`);
        await refreshLearning(); modal.close(); render(); toast('Запись отменена');
      }, button); break;
      case 'preview': openDialog(esc(button.dataset.title), `<video class="lesson-video" controls controlslist="nodownload noplaybackrate noremoteplayback" disablepictureinpicture disableremoteplayback autoplay playsinline src="${esc(button.dataset.src)}"></video><p class="fine-print">Бесплатный урок: его можно посмотреть до покупки.</p>`, 'wide'); break;
      case 'complete-lesson': guard(async () => {
        const course = button.dataset.course;
        const r = await api.post(`/lessons/${id}/complete`);
        await refreshLearning();
        await render();
        if (r.certificateId) openCertificate(r.certificateId, true); else toast('Урок завершён');
      }, button); break;
      case 'library-tab': libraryMode = id; render(); break;
      case 'certificate': guard(() => openCertificate(id), button); break;
      case 'cert-pdf': guard(() => window.DalCert.pdf(certs.find(c => c.id === id)), button); break;
      case 'cert-copy': { const c = certs.find(x => x.id === id); navigator.clipboard?.writeText(c.verifyUrl).then(() => toast('Ссылка для проверки скопирована'), () => toast(c.verifyUrl)); break; }
      case 'wallet-export': openDialog('Экспорт ключа кошелька', `<p class="modal-text">Ключ нужен, только если вы хотите перенести сертификаты в свой криптокошелёк (например, Phantom). Для работы с DAL он не нужен.</p><div class="notice">${icon('triangle-alert')} Никому не показывайте ключ: с ним можно распоряжаться кошельком. Сотрудники DAL никогда его не попросят.</div><form id="exportForm"><label class="form-label">Пароль от аккаунта<input type="password" name="password" required autocomplete="current-password"></label><button class="btn wide" type="submit" style="margin-top:16px">${icon('key-round')}Показать ключ</button></form>`); break;
      case 'copy-text': navigator.clipboard?.writeText(button.dataset.text).then(() => toast('Скопировано'), () => {}); break;
      case 'expert-tab': expertMode = id; render(); break;
      case 'rank-tab': rankMode = id; render(); break;
      case 'rank-link': rankMode = id; break;
      case 'signal-filter': signalFilter = id; render(); break;
      case 'verify-anchor': verifyAnchor(forecasts.find(x => x.id === id)); break;
      case 'verify-review': verifyAnchor(shownReviews.find(x => x.id === id), true); break;
      case 'anchor-review': anchorReviewDialog(shownReviews.find(x => x.id === id)); break;
      case 'sol-airdrop': guard(async () => { await window.DalSolana.airdrop(solWallet); toast('Запрошен 1 тестовый SOL. Через несколько секунд нажмите «Записать» ещё раз.'); }, button); break;
      case 'anchor-review-go': guard(async () => {
        const r = shownReviews.find(x => x.id === id);
        try {
          solWallet = await window.DalSolana.connect();
          const bal = await window.DalSolana.balance(solWallet).catch(() => null);
          if (bal !== null && bal < 0.00001) { anchorReviewDialog(r, `<div class="notice">${icon('info')} <span>На кошельке</span> ${esc(solWallet.slice(0, 4))}…${esc(solWallet.slice(-4))} <span>нет тестовых SOL для комиссии.</span> <button class="text-link" data-action="sol-airdrop">Получить 1 SOL</button> или возьмите на <a class="text-link" href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>.</div>`); icons(); return; }
          const { signature, wallet } = await window.DalSolana.anchor(r.memo);
          await api.post(`/reviews/${id}/anchor`, { signature, wallet, cluster: window.DalSolana.CLUSTER });
          modal.close(); await render(); toast('Отзыв зафиксирован в Solana');
        } catch (e) { if (e.status) throw e; toast(e.message || 'Не удалось записать в Solana'); }
      }, button); break;
      case 'delete-comment': guard(async () => {
        await api.del(`/lessons/comments/${id}`);
        $(`#cm-${id}`)?.remove(); toast('Комментарий удалён');
      }, button); break;
      case 'signal': {
        const f = forecasts.find(x => x.id === id);
        openDialog(`${esc(f.ticker)}: обоснование`, `<p class="modal-text">${esc(f.rationale)}</p><div class="order-line"><span>Автор</span><strong>${esc(f.expert.name)}</strong></div><div class="order-line"><span>Опубликован</span><strong>${fmtDate(f.publishedAt)}</strong></div><div class="order-line"><span>Проверка условия</span><strong>${fmtDate(f.deadline)}</strong></div>${f.rule ? `<div class="order-line"><span>Правило проверки</span><strong><code>${esc(f.rule)}</code></strong></div><div class="order-line"><span>Источник цены</span><strong>${esc(f.priceSource)}</strong></div>` : ''}${f.comments.length ? `<h3 class="modal-sub">Комментарии автора</h3>${f.comments.map(c => `<p class="modal-text"><small>${fmtDate(c.createdAt)}</small><br>${esc(c.text)}</p>`).join('')}` : ''}<p class="notice">Это не торговая рекомендация. Условие и срок зафиксированы при публикации.</p>`);
        break;
      }
      case 'review': openDialog('Ваш отзыв', `<form id="reviewForm" data-id="${id}" data-kind="${button.dataset.kind}"><label class="form-label">Оценка<select name="rating"><option value="5">5 · Отлично</option><option value="4">4 · Хорошо</option><option value="3">3 · Нормально</option><option value="2">2 · Ниже ожиданий</option><option value="1">1 · Не понравилось</option></select></label><label class="form-label" style="margin-top:15px">Что было полезно?<textarea name="text" required minlength="10" maxlength="1500" rows="5"></textarea></label><p class="fine-print" style="margin-top:15px">Отзыв увидят все. Изменить или удалить его будет нельзя.</p><button class="btn wide" style="margin-top:20px" type="submit">Опубликовать отзыв</button></form>`); break;
      case 'avatar-remove': guard(async () => { await api.del('/me/avatar'); me = await api.me(true); render(); toast('Фото убрано'); }, button); break;
      case 'logout': guard(async () => { await api.logout(); me = null; learning = { courses: [], inProgress: null }; mine = []; favs = new Set(prefs.saved); closeProfile(); toast('Вы вышли из аккаунта'); render(); }, button); break;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('label.btn[tabindex]')) { e.preventDefault(); e.target.querySelector('input[type=file]')?.click(); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'catalogSearch') { catalogSearch = e.target.value; refreshResults(); }
    if (e.target.id === 'globalSearch') { $('#searchResults').innerHTML = searchResults(e.target.value); icons(); }
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'payMethod' && lastQuote) { $('#checkoutBox').innerHTML = breakdownHtml(e.target.value); icons(); }
    if (e.target.id === 'catalogSort') { catalogSort = e.target.value; refreshResults(); }
    if (e.target.id === 'freeOnly') { freeOnly = e.target.checked; refreshResults(); }
    if (e.target.id === 'motionToggle') { prefs.motion = e.target.checked; savePrefs(); applyAppearance(); icons(); }
    if (e.target.id === 'avatarInput') {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('Фото больше 5 МБ'); return; }
      guard(async () => { await api.upload('/me/avatar', file, { type: file.type }).promise; me = await api.me(true); render(); toast('Фото обновлено'); });
    }
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (!['profileForm', 'chatForm', 'bookingForm', 'reviewForm', 'commentForm', 'exportForm'].includes(form.id)) return;
    e.preventDefault();
    const data = new FormData(form), btn = $('button[type=submit]', form);
    if (form.id === 'profileForm') guard(async () => {
      const name = String(data.get('name')).trim();
      if (name.length < 2) { toast('Укажите имя'); return; }
      me = await api.patch('/me', { name }); await api.me(true); render(); toast('Профиль сохранён');
    }, btn);
    if (form.id === 'reviewForm') guard(async () => {
      const text = String(data.get('text')).trim();
      if (text.length < 10) { toast('Напишите хотя бы 10 символов'); return; }
      const base = form.dataset.kind === 'course' ? 'courses' : 'products';
      await api.post(`/${base}/${form.dataset.id}/reviews`, { rating: Number(data.get('rating')), text });
      await refreshCatalog(); modal.close(); render(); toast(form.dataset.kind === 'course' ? 'Отзыв опубликован. Его можно зафиксировать в Solana.' : 'Отзыв опубликован');
    }, btn);
    if (form.id === 'exportForm') guard(async () => {
      const r = await api.post('/me/wallet/export', { password: String(data.get('password')) });
      openDialog('Ключ кошелька', `<p class="modal-text">Адрес: <code>${esc(r.address)}</code></p><label class="form-label">Секретный ключ (импорт в Phantom: Add wallet → Import private key)<textarea readonly rows="3" class="secret-key">${esc(r.secretKey)}</textarea></label><div class="modal-actions"><button class="btn secondary" data-action="copy-text" data-text="${esc(r.secretKey)}">${icon('copy')}Скопировать</button><button class="btn" data-action="close-modal">Готово</button></div>`);
    }, btn);
    if (form.id === 'commentForm') guard(async () => {
      const input = form.elements.text, text = input.value.trim();
      if (text.length < 2) { toast('Напишите вопрос или комментарий'); return; }
      const x = await api.post(`/lessons/${form.dataset.lesson}/comments`, { text });
      $('#noComments')?.remove(); $('#commentList').insertAdjacentHTML('beforeend', commentItem(x)); icons(); input.value = '';
    }, btn);
    if (form.id === 'chatForm') guard(async () => {
      const input = form.elements.message, text = input.value.trim(); if (!text) return;
      const m = await api.post(`/products/${form.dataset.product}/messages`, { text });
      input.value = ''; appendChat([m]); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; input.focus();
    }, btn);
    if (form.id === 'bookingForm') guard(async () => {
      const choice = form.querySelector('input[name=slot]:checked');
      const r = await api.post(`/products/${form.dataset.product}/book`, { slotId: choice.value });
      await refreshLearning(); modal.close(); render(); toast(`Вы записаны: ${fmtWhen(r.startsAt)}`);
    }, btn);
  });
  modal.addEventListener('click', e => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); } });
  modal.addEventListener('close', () => { clearInterval(chatTimer); $$('video', modal).forEach(v => v.pause()); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeProfile();
    if (e.target.closest('.tabs[role="tablist"]') && ['ArrowRight', 'ArrowLeft'].includes(e.key)) {
      const tabs = $$('[role="tab"]', e.target.closest('.tabs')), i = tabs.indexOf(e.target);
      e.preventDefault(); tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].focus();
    }
  });
  const drum = $('#drum'); let pointerX = null, lastMove = 0, touchX = null, suppressClick = false;
  drum.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pointerX = e.clientX; });
  drum.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || pointerX === null) return;
    const d = e.clientX - pointerX;
    if (Math.abs(d) > 42 && performance.now() - lastMove > 180) { showPreview(preview + (d > 0 ? 1 : -1)); pointerX = e.clientX; lastMove = performance.now(); }
  });
  drum.addEventListener('pointerleave', () => { pointerX = null; showPreview(drumItems.indexOf(mode), true); });
  drum.addEventListener('wheel', e => { e.preventDefault(); if (performance.now() - lastMove < 250) return; showPreview(preview + (e.deltaY + e.deltaX > 0 ? 1 : -1)); lastMove = performance.now(); }, { passive: false });
  drum.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); showPreview(preview + (e.key === 'ArrowRight' ? 1 : -1)); } if (e.key === 'Escape') showPreview(drumItems.indexOf(mode)); });
  drum.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  drum.addEventListener('touchend', e => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 35) { suppressClick = true; showPreview(preview + (dx < 0 ? 1 : -1)); selectMode(drumItems[preview].id); setTimeout(() => suppressClick = false, 350); } touchX = null; }, { passive: true });
  drum.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, { capture: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs.theme === 'system') updateChrome(); });
  window.addEventListener('hashchange', render);
  // No "Save video as…" on right click.
  document.addEventListener('contextmenu', e => { if (e.target.closest?.('video')) e.preventDefault(); });

  (async () => {
    updateChrome();
    main.innerHTML = `<div class="page"><div class="loading">Загружаем…</div></div>`;
    try { await loadBase(); } catch (e) { main.innerHTML = `<div class="page">${errorView(e)}</div>`; icons(); return; }
    render();
  })();
})();
