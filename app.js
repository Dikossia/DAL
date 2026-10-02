(() => {
  'use strict';
  // Сайт для учеников, подключённый к серверу Dal.
  // Курсы, покупки, прогресс, видео, отзывы, эксперты и прогнозы берутся из API.
  // «Работа с экспертом», «Сообщество» и материалы идей пока демо (их бэкенд — следующий этап).
  const api = window.DalAPI;
  const { modes, experts: demoExperts, products: demoProducts } = window.DAL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU');
  const money = n => n === 0 ? 'Бесплатно' : n == null ? 'Цена не указана' : nf.format(n) + ' ₸';
  const usd = n => '$' + nf.format(n);
  const num = n => Number(n).toFixed(2).replace('.', ',');
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDate = iso => iso ? dateFmt.format(new Date(iso.length === 10 ? iso + 'T12:00:00' : iso)).replace(/\s?г\.$/, '') : '';
  const fmtTime = s => { if (!s) return ''; const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; };
  const clock = s => { if (!Number.isFinite(s)) return ''; s = Math.round(s); const m = Math.floor(s / 60), x = s % 60; return `${m}:${String(x).padStart(2, '0')}`; };
  const findMode = id => modes.find(m => m.id === id) || modes[0];
  const brights = { courses: '#8dccab', experts: '#c0acee', community: '#e5ac95', ideas: '#98bfee' };
  modes.forEach(m => { m.bright = brights[m.id]; });
  const HOME = { id: 'home', name: 'Главная', icon: 'house', accent: '#2f5d62', bright: '#9cc9cc' };
  const drumItems = [HOME, ...modes];
  const findDrum = id => drumItems.find(m => m.id === id) || HOME;
  const ROLE = { student: 'ученик', expert: 'эксперт', moderator: 'модератор' };

  // ---------- Настройки вида и демо-часть: только в этом браузере ----------
  const PREFS = 'dal-live-prefs', LOCAL = 'dal-live-demo';
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? { ...d, ...v } : d; } catch (_) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* хранилище недоступно */ } };
  let prefs = read(PREFS, { mode: 'home', theme: 'system', accent: 'auto', motion: true, saved: [] });
  let local = read(LOCAL, { owned: [], chats: [] });
  if (!Array.isArray(prefs.saved)) prefs.saved = [];
  if (!Array.isArray(local.owned)) local.owned = [];
  if (!Array.isArray(local.chats)) local.chats = [];
  const savePrefs = () => write(PREFS, prefs), saveLocal = () => write(LOCAL, local);

  // ---------- Данные с сервера ----------
  let me = null, catalog = [], experts = [], forecasts = [], learning = { courses: [], inProgress: null };
  let offline = false;
  async function loadBase() {
    try {
      [catalog, experts, forecasts] = await Promise.all([api.get('/catalog/courses'), api.get('/experts'), api.get('/forecasts')]);
      me = await api.me();
      await refreshLearning();
      offline = false;
    } catch (e) { if (e.code === 'offline') offline = true; else throw e; }
  }
  async function refreshLearning() {
    learning = me?.role === 'student' ? await api.get('/me/learning') : { courses: [], inProgress: null };
  }
  const refreshCatalog = async () => { catalog = await api.get('/catalog/courses'); };
  const ownsCourse = id => learning.courses.some(c => c.id === id);

  // Карточки: курс из API и демо-предложение приводятся к одному виду.
  const avatarOf = id => experts.find(e => e.id === id)?.avatarUrl || (demoExperts.find(e => e.id === id) ? `assets/${demoExperts.find(e => e.id === id).image}.jpg` : null);
  const fromCourse = c => ({
    id: c.id, kind: 'course', mode: 'courses', category: c.category, title: c.title, tag: c.freeLessons ? 'Есть бесплатный урок' : c.categoryName,
    expert: { id: c.expert.id, name: c.expert.name, avatar: c.expert.avatarUrl }, price: c.price, rating: c.rating, reviews: c.reviews,
    cover: c.coverUrl, meta: c.duration ? fmtTime(c.duration) : '', lessons: c.lessons, students: c.students, description: c.description
  });
  const fromDemo = p => {
    const e = demoExperts.find(x => x.id === p.expert);
    return { id: p.id, kind: 'demo', mode: p.mode, category: p.category, title: p.title, tag: p.tag, expert: { id: e.id, name: e.name, avatar: avatarOf(e.id) },
      price: p.price, rating: p.rating, reviews: p.reviews, cover: `assets/${p.image}.jpg`, meta: p.duration, lessons: p.lessons, raw: p };
  };
  const demoOffers = () => demoProducts.filter(p => p.mode !== 'courses').map(fromDemo);
  const offers = () => [...catalog.map(fromCourse), ...demoOffers()];
  const findOffer = id => offers().find(o => o.id === id) || (learning.courses.find(c => c.id === id) && fromCourse(learning.courses.find(c => c.id === id)));

  // ---------- Состояние интерфейса ----------
  let mode = findDrum(prefs.mode), preview = drumItems.indexOf(mode), toastTimer, lastFocus;
  let libraryMode = 'courses', expertMode = '', rankMode = 'all';
  let catalogSearch = '', catalogSort = 'popular', freeOnly = false, signalFilter = 'all';
  let routeKey = '', lastNav = '', seq = 0;
  const main = $('#main'), modal = $('#modal');
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const initials = name => String(name || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
  const rating = (value, count) => value == null ? `<span class="rating muted-rating">Нет оценок</span>` : `<span class="rating">${icon('star')}${num(value)}${count !== undefined ? `<small>(${count})</small>` : ''}</span>`;
  const avatar = (src, name, cls = '') => src ? `<img src="${esc(src)}" alt="" class="${cls}" loading="lazy">` : `<span class="user-avatar ${cls}">${esc(initials(name))}</span>`;
  const cover = (src, alt = '', cls = '') => src ? `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy">` : `<span class="cover-placeholder ${cls}">${icon('image')}</span>`;
  const expertLink = e => `<a class="expert-inline" href="#expert/${e.id}">${avatar(e.avatar, e.name)}<span>${esc(e.name)}</span></a>`;
  const breadcrumb = (items = []) => `<nav class="breadcrumb" aria-label="Навигационная цепочка"><a href="#home">Главная</a>${items.map(([n, h]) => `${icon('chevron-right')}${h ? `<a href="${h}">${esc(n)}</a>` : `<span>${esc(n)}</span>`}`).join('')}</nav>`;
  const footer = () => `<footer class="page-footer"><span><span class="footer-logo">Dal.</span> &nbsp; Учимся принимать решения.</span><span>Курсы и прогнозы — из базы на вашем компьютере. Не инвестиционная рекомендация.</span></footer>`;
  const empty = (title, text, name = 'search', action = `<a class="btn secondary" href="#home">К обзору ${icon('arrow-right')}</a>`) => `<div class="empty">${icon(name)}<h2>${title}</h2><p>${text}</p>${action}</div>`;
  const demoBadge = `<span class="badge demo-badge">${icon('flask-conical')}Демо</span>`;
  const loginPrompt = (text = 'Войдите, чтобы видеть свои курсы и прогресс.') => empty('Нужно войти', text, 'log-in', `<a class="btn" href="${api.loginUrl()}">${icon('log-in')}Войти или зарегистрироваться</a>`);

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
    av.innerHTML = me ? esc(initials(me.name)) : icon('user-round');
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
    const saved = prefs.saved.includes(o.id);
    return `<article class="product-card ${compact ? 'compact' : ''}"><div class="product-cover"><a href="#product/${o.id}" tabindex="-1" aria-hidden="true">${cover(o.cover)}</a><button class="icon-button save-button ${saved ? 'saved' : ''}" data-action="save" data-id="${o.id}" aria-label="${saved ? 'Убрать из избранного' : 'В избранное'}" title="${saved ? 'Убрать из избранного' : 'В избранное'}" aria-pressed="${saved}">${icon('bookmark')}</button></div><div class="product-body"><div class="product-kicker">${esc(o.tag)}${o.kind === 'demo' ? ' · демо' : ''}</div><a class="product-title" href="#product/${o.id}">${esc(o.title)}</a>${expertLink(o.expert)}<div class="product-meta">${o.meta ? `<span>${icon('clock-3')}${esc(o.meta)}</span>` : ''}${o.mode === 'courses' ? `<span>${icon('play')}${o.lessons} ${plural(o.lessons, 'урок', 'урока', 'уроков')}</span>` : ''}</div><div class="product-bottom"><strong>${money(o.price)}</strong>${rating(o.rating, o.reviews)}</div></div></article>`;
  }
  const expertsStrip = () => `<div class="experts-strip">${experts.map(e => `<a class="expert-mini" href="#expert/${e.id}">${avatar(e.avatarUrl, e.name)}<div><strong>${esc(e.name)}</strong><p>${esc(e.specialization)}</p></div>${rating(e.rating)}</a>`).join('')}</div>`;

  // ---------- Страницы ----------
  function overview() {
    const top = [...catalog].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];
    const picks = [top && fromCourse(top), ...['e2', 'g1'].map(id => demoOffers().find(o => o.id === id))].filter(Boolean);
    return `<div class="page-topline"><span class="eyebrow">ЗНАНИЯ. ЛЮДИ. КАПИТАЛ.</span><span class="tiny-meta">Выберите, с чего начать</span></div><div class="intro"><h1>Учимся принимать финансовые решения.</h1><p>Курсы, личная работа с экспертом, сообщество и разборы рынка. Выберите направление, и внутри откроются все его разделы.</p></div><div class="directions">${modes.map(m => {
      const count = m.id === 'courses' ? catalog.length : demoOffers().filter(o => o.mode === m.id).length + (m.id === 'ideas' ? forecasts.length : 0);
      return `<a class="direction-card" href="#mode/${m.id}" data-action="mode" data-id="${m.id}" style="--card-accent:${m.accent};--card-bright:${m.bright}"><div class="direction-top"><span class="direction-icon">${icon(m.icon)}</span><span class="direction-count">${count} ${plural(count, 'материал', 'материала', 'материалов')}</span></div><div class="direction-body"><span class="direction-eyebrow">${m.eyebrow}</span><h2>${m.name}</h2><p>${m.description}</p><ul class="direction-list">${m.categories.map(c => `<li>${c.name}</li>`).join('')}</ul></div><div class="direction-bottom"><span>Открыть раздел</span>${icon('arrow-right')}</div></a>`;
    }).join('')}</div><div class="section-head"><h2>Начните с интересного</h2></div><div class="featured-grid">${picks.map(o => productCard(o, true)).join('')}</div><div class="section-head"><h2>Знания с человеческим лицом</h2><a class="text-link" href="#rankings">Все эксперты ${icon('arrow-right')}</a></div>${expertsStrip()}`;
  }

  function modeHome() {
    const list = mode.id === 'courses' ? [...catalog].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 3).map(fromCourse) : demoOffers().filter(o => o.mode === mode.id).slice(0, 3);
    return `<div class="page-topline"><span class="eyebrow">${mode.eyebrow}</span>${mode.id === 'courses' ? '<span class="tiny-meta">Ваш следующий шаг</span>' : demoBadge}</div><div class="intro"><h1>${mode.title}</h1><p>${mode.description}</p></div><div class="categories ${mode.categories.length === 2 ? 'two' : ''}">${mode.categories.map(c => {
      const count = c.id === 'signals' ? forecasts.length : mode.id === 'courses' ? catalog.filter(x => x.category === c.id).length : demoOffers().filter(o => o.mode === mode.id && o.category === c.id).length;
      const label = c.id === 'signals' ? `${count} ${plural(count, 'прогноз', 'прогноза', 'прогнозов')}` : `${count} ${mode.id === 'courses' ? plural(count, 'программа', 'программы', 'программ') : plural(count, 'предложение', 'предложения', 'предложений')}`;
      return `<a class="category-card" href="#category/${mode.id}/${c.id}"><div class="category-image">${cover(`assets/${c.image}.jpg`, c.name)}<span class="category-tag">${c.label}</span></div><div class="category-body"><h2>${c.name}</h2><p>${c.description}</p><div class="category-bottom"><span>${label}</span>${icon('arrow-up-right')}</div></div></a>`;
    }).join('')}</div><div class="section-head"><h2>${mode.id === 'courses' ? 'Начните с интересного' : mode.id === 'experts' ? 'Знакомство с экспертами' : mode.id === 'community' ? 'Ближе к единомышленникам' : 'Стоит прочитать'}</h2><a class="text-link" href="#category/${mode.id}/${mode.categories[0].id}">Смотреть все ${icon('arrow-right')}</a></div><div class="featured-grid">${list.map(o => productCard(o, true)).join('')}</div><div class="section-head"><h2>Знания с человеческим лицом</h2><a class="text-link" href="#rankings">Все эксперты ${icon('arrow-right')}</a></div>${expertsStrip()}`;
  }

  function categoryView(categoryId) {
    const c = mode.categories.find(c => c.id === categoryId);
    if (!c) return empty('Раздел не найден', 'Вернитесь к обзору и выберите направление.');
    if (c.id === 'signals') return signalsView();
    return `${breadcrumb([[mode.name, `#mode/${mode.id}`], [c.name]])}<div class="heading-row"><h1>${c.name}</h1>${mode.id === 'courses' ? `<span class="badge">${icon(mode.icon)}${mode.name}</span>` : demoBadge}</div><p class="subtitle">${c.description}</p><div class="toolbar"><label class="input-wrap">${icon('search')}<input id="catalogSearch" type="search" placeholder="Поиск по названию или эксперту" aria-label="Поиск в каталоге" value="${esc(catalogSearch)}"></label><select id="catalogSort" aria-label="Сортировка"><option value="popular">По рейтингу</option><option value="price">Сначала дешевле</option><option value="price-desc">Сначала дороже</option></select><label><input type="checkbox" id="freeOnly" ${freeOnly ? 'checked' : ''}> Бесплатные</label></div><div id="catalogResults">${catalogResults(c.id)}</div>`;
  }
  function catalogResults(cat) {
    const term = catalogSearch.toLocaleLowerCase('ru');
    const list = offers().filter(o => o.mode === mode.id && o.category === cat && (!freeOnly || o.price === 0) && (o.title + ' ' + o.expert.name).toLocaleLowerCase('ru').includes(term))
      .sort((a, b) => catalogSort === 'price' ? a.price - b.price : catalogSort === 'price-desc' ? b.price - a.price : (b.rating ?? 0) - (a.rating ?? 0));
    return `<p class="result-count">Найдено: ${list.length}</p>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Ничего не нашлось', 'Попробуйте другой запрос или измените фильтры.')}`;
  }
  const refreshResults = () => { const cat = location.hash.split('/')[2]; $('#catalogResults').innerHTML = catalogResults(cat); icons(); };

  async function productView(id) {
    const o = findOffer(id);
    if (!o) return empty('Материал не найден', 'Возможно, курс снят с публикации. Выберите другой в каталоге.');
    return o.kind === 'course' ? courseView(id) : demoProductView(o);
  }

  async function courseView(id) {
    const own = ownsCourse(id);
    let c, reviews = [];
    try { [c, reviews] = await Promise.all([api.get(`/catalog/courses/${id}`), api.get(`/catalog/courses/${id}/reviews`)]); }
    catch (e) { if (e.status === 404 && own) c = await api.get(`/learning/courses/${id}`); else throw e; }
    const m = findMode('courses'), cat = m.categories.find(x => x.id === c.category);
    const lessons = c.modules.flatMap(x => x.lessons);
    let panel;
    if (own) panel = `<a class="btn wide" href="#lesson/${id}">${icon('play')}Продолжить обучение</a><button class="text-link refund-link" data-action="refund" data-id="${id}">${icon('undo-2')}Вернуть курс</button>`;
    else if (!me) panel = `<a class="btn wide" href="${api.loginUrl(`/#product/${id}`)}">${icon('log-in')}Войти и получить доступ</a>`;
    else if (me.role !== 'student') panel = `<p class="notice">Получать доступ к курсам может ученик. Вы вошли как ${ROLE[me.role]}.</p>`;
    else panel = `<button class="btn wide" data-action="buy" data-id="${id}">${c.price ? 'Получить доступ' : 'Начать бесплатно'}${icon('arrow-right')}</button>`;
    const myReview = me && reviews.find(r => r.author === me.name.split(' ')[0]);
    return `${breadcrumb([[m.name, '#mode/courses'], [cat?.name || 'Курс', `#category/courses/${c.category}`], [c.title]])}<div class="detail-grid"><div class="detail-content"><span class="badge">${esc(c.categoryName)}</span><h1>${esc(c.title)}</h1>${expertLink({ id: c.expert.id, name: c.expert.name, avatar: c.expert.avatarUrl })}${cover(c.coverUrl, c.title, 'detail-cover')}
      <section class="detail-section"><h2>О программе</h2><p>${esc(c.description)}</p></section>
      <section class="detail-section program"><h2>Программа обучения</h2>${c.modules.map(mod => `<h3 class="module-heading">${esc(mod.title)}</h3><ol class="program-list">${mod.lessons.map(l => `<li><span class="program-title">${esc(l.title)}</span><span class="program-meta">${l.duration ? clock(l.duration) : ''}${l.isFree ? `<span class="badge">Бесплатно</span>` : ''}${l.isFree && l.videoUrl && !own ? `<button class="text-link" data-action="preview" data-src="${esc(l.videoUrl)}" data-title="${esc(l.title)}">${icon('play')}Смотреть</button>` : ''}</span></li>`).join('')}</ol>`).join('')}</section>
      <section class="detail-section"><div class="section-head" style="margin-top:0"><h2>Отзывы учеников</h2>${rating(c.rating, c.reviews)}</div>${reviews.length ? reviews.map(r => `<article class="review-item"><div class="review-top"><span class="user-avatar">${esc(r.author[0])}</span><strong>${esc(r.author)}</strong>${rating(r.rating)}</div><p>${esc(r.text)}</p>${r.reply ? `<div class="review-reply"><span class="tiny-meta">Ответ эксперта</span><p>${esc(r.reply)}</p></div>` : ''}</article>`).join('') : '<p class="subtitle">Отзывов пока нет.</p>'}${own && !myReview ? `<button class="btn secondary" data-action="review" data-id="${id}">${icon('message-square')}Оставить отзыв</button>` : ''}</section>
    </div><aside class="purchase-panel"><span class="tiny-meta">Курсы</span><div class="purchase-price">${money(c.price)}</div><p class="purchase-caption">${own ? 'Курс уже у вас' : 'За полный доступ'}</p>${panel}<button class="btn secondary wide" style="margin-top:10px" data-action="save" data-id="${id}" aria-pressed="${prefs.saved.includes(id)}">${icon('bookmark')}${prefs.saved.includes(id) ? 'В избранном' : 'В избранное'}</button><ul class="purchase-features"><li>${icon('play')}${lessons.length} ${plural(lessons.length, 'урок', 'урока', 'уроков')}${c.duration ? ` · ${fmtTime(c.duration)}` : ''}</li><li>${icon('users-round')}${c.students} ${plural(c.students, 'ученик', 'ученика', 'учеников')}</li><li>${icon('undo-2')}Возврат 14 дней, если пройдено меньше 20%</li></ul><p class="fine-print">Оплата пока не подключена: доступ открывается без списания денег. Доходность инвестиций не гарантируется.</p></aside></div>`;
  }

  function demoProductView(o) {
    const p = o.raw, m = findMode(p.mode), c = m.categories.find(x => x.id === p.category), own = local.owned.includes(p.id);
    const e = demoExperts.find(x => x.id === p.expert);
    const items = ['Знакомство и постановка цели', 'Разбор ваших вопросов', 'Практика на примере', 'Итоги и следующие шаги'];
    return `${breadcrumb([[m.name, `#mode/${m.id}`], [c.name, `#category/${m.id}/${c.id}`], [p.title]])}<div class="detail-grid"><div class="detail-content"><span class="badge">${esc(p.tag)}</span> ${demoBadge}<h1>${esc(p.title)}</h1>${expertLink(o.expert)}${cover(o.cover, p.title, 'detail-cover')}<section class="detail-section"><h2>О предложении</h2><p>${esc(c.description)} ${esc(e.bio)}</p></section><section class="detail-section"><h2>${p.mode === 'experts' ? 'Как проходит работа' : 'Что внутри'}</h2>${items.map((v, i) => `<details class="accordion"><summary><span>${String(i + 1).padStart(2, '0')}</span>${v}${icon('chevron-down')}</summary><p>Разбор основных понятий, пример и вопросы для самопроверки.</p></details>`).join('')}</section></div><aside class="purchase-panel"><span class="tiny-meta">${m.name}</span><div class="purchase-price">${money(p.price)}</div><p class="purchase-caption">${esc(p.duration)}</p>${own ? `<button class="btn wide" data-action="open-demo" data-id="${p.id}">Открыть${icon('arrow-right')}</button>` : `<button class="btn wide" data-action="buy-demo" data-id="${p.id}">${p.price ? 'Получить доступ' : 'Начать бесплатно'}${icon('arrow-right')}</button>`}<button class="btn secondary wide" style="margin-top:10px" data-action="save" data-id="${p.id}" aria-pressed="${prefs.saved.includes(p.id)}">${icon('bookmark')}${prefs.saved.includes(p.id) ? 'В избранном' : 'В избранное'}</button><p class="fine-print">Это направление пока работает в демо-режиме: данные хранятся только в этом браузере и не отправляются эксперту.</p></aside></div>`;
  }

  async function expertView(id) {
    const e = await api.get(`/experts/${id}`);
    const active = expertMode || (mode === HOME ? 'courses' : mode.id);
    const list = active === 'courses' ? e.courses.map(fromCourse) : demoOffers().filter(o => o.mode === active && o.expert.id === id);
    const fc = e.forecasts;
    return `${breadcrumb([['Эксперты', '#rankings'], [e.name]])}<div class="profile-hero">${avatar(e.avatarUrl, e.name)}<div><span class="badge">${icon('badge-check')}Эксперт Dal</span><h1 style="margin-top:10px">${esc(e.name)}</h1><p>${esc(e.specialization)}</p><div class="profile-stats"><span>${rating(e.rating)} ${e.reviews} ${plural(e.reviews, 'отзыв', 'отзыва', 'отзывов')}</span><span>${icon('users-round')}${e.students} ${plural(e.students, 'ученик', 'ученика', 'учеников')}</span>${e.experience ? `<span>${icon('briefcase-business')}${esc(e.experience)}</span>` : ''}<span>${icon('radio')}${fc.done ? `${String(fc.successRate).replace('.', ',')}% прогнозов (${fc.success} из ${fc.done})` : 'Прогнозов пока нет'}</span></div></div></div><p class="profile-about">${esc(e.bio)}</p><div class="tags">${e.achievements.map(t => `<span>${esc(t)}</span>`).join('')}</div><div class="tabs" role="tablist" aria-label="Направления">${modes.map(m => `<button role="tab" aria-selected="${active === m.id}" class="tab ${active === m.id ? 'active' : ''}" data-action="expert-tab" data-id="${m.id}">${m.name}</button>`).join('')}</div>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Здесь пока нет предложений', 'Посмотрите другие направления эксперта.')}`;
  }

  function learningView() {
    if (!me) return `<h1>Моё обучение</h1>${loginPrompt()}`;
    if (me.role !== 'student') return `<h1>Моё обучение</h1>${empty('Обучение — для учеников', `Вы вошли как ${ROLE[me.role]}. Свои курсы вы ведёте в Dal Studio.`, 'clapperboard', `<a class="btn" href="${api.homeFor(me.role)}">${icon('arrow-right')}Открыть Dal Studio</a>`)}`;
    const tabs = `<div class="tabs" role="tablist" aria-label="Направление">${modes.map(m => `<button role="tab" aria-selected="${libraryMode === m.id}" class="tab ${libraryMode === m.id ? 'active' : ''}" data-action="library-tab" data-id="${m.id}">${m.name}</button>`).join('')}</div>`;
    let rows = '';
    if (libraryMode === 'courses') rows = learning.courses.map(c => `<article class="learning-row">${cover(c.coverUrl, c.title)}<div class="learning-info"><span class="product-kicker">${esc(c.expert.name)}</span><h2><a href="#product/${c.id}">${esc(c.title)}</a></h2><div class="progress"><span style="width:${c.progress.percent}%"></span></div><p>${c.progress.done} из ${c.progress.total} ${plural(c.progress.total, 'урока', 'уроков', 'уроков')} · ${c.progress.percent}%</p></div><a class="btn" href="#lesson/${c.id}">${c.progress.done ? 'Продолжить' : 'Начать'}${icon('arrow-right')}</a></article>`).join('');
    else rows = demoOffers().filter(o => o.mode === libraryMode && local.owned.includes(o.id)).map(o => `<article class="learning-row">${cover(o.cover, o.title)}<div class="learning-info"><span class="product-kicker">${esc(o.expert.name)} · демо</span><h2><a href="#product/${o.id}">${esc(o.title)}</a></h2><p>${esc(o.meta)} · Доступ открыт</p></div><button class="btn" data-action="open-demo" data-id="${o.id}">Открыть${icon('arrow-right')}</button></article>`).join('');
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span><span class="tiny-meta">${esc(me.name.split(' ')[0])}, рады вас видеть</span></div><h1>Моё обучение</h1><p class="subtitle">Всё, к чему вы уже сделали первый шаг.</p>${tabs}${rows || empty('Здесь начнётся новая история', 'Выберите программу или предложение, которое вам интересно.', 'book-open')}`;
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
    const action = me.role !== 'student' ? '' : l.completed
      ? `<button class="btn secondary" disabled>${icon('circle-check')}Урок пройден</button>${index < all.length - 1 ? `<a class="btn" href="#lesson/${courseId}/${all[index + 1].id}">Следующий урок${icon('arrow-right')}</a>` : ''}`
      : blocked ? `<button class="btn" disabled>${icon('lock')}Сначала завершите предыдущие</button>` : `<button class="btn" data-action="complete-lesson" data-id="${l.id}" data-course="${courseId}">${icon('check')}Завершить урок</button>`;
    return `${breadcrumb([['Моё обучение', '#learning'], [c.title, `#product/${courseId}`]])}<div class="lesson-layout"><article class="lesson-article"><span class="eyebrow">УРОК ${index + 1} ИЗ ${all.length} · ${esc(l.module)}</span><h1>${esc(l.title)}</h1>${l.videoUrl ? `<video class="lesson-video" controls playsinline preload="metadata" src="${esc(api.mediaUrl(l.videoUrl))}"></video>` : `<div class="lesson-novideo">${icon('film')}<p>Видео к этому уроку ещё не загружено.</p></div>`}<div class="lesson-actions">${action}<span class="fine-print">${c.progress.done} из ${c.progress.total} завершено · ${c.progress.percent}%</span></div></article><aside class="lesson-list"><h2>Программа курса</h2>${c.modules.map(m => `<p class="lesson-module">${esc(m.title)}</p>${m.lessons.map(x => { const i = all.findIndex(y => y.id === x.id); return `<a class="lesson-item ${i === index ? 'active' : ''}" href="#lesson/${courseId}/${x.id}">${icon(x.completed ? 'circle-check' : i === index ? 'circle-play' : 'circle')}<span>${i + 1}. ${esc(x.title)}</span></a>`; }).join('')}`).join('')}</aside></div>`;
  }

  function rankingsView() {
    const score = e => rankMode === 'signals' ? (e.forecasts.successRate ?? -1) : (e.rating ?? 0);
    const list = [...experts].sort((a, b) => score(b) - score(a));
    return `<div class="page-topline"><span class="eyebrow">ЛЮДИ И РЕПУТАЦИЯ</span></div><h1>Рейтинг экспертов</h1><p class="subtitle">Опыт учеников и результаты прогнозов, каждый на своём месте.</p><div class="tabs" role="tablist" aria-label="Рейтинг">${[['all', 'Оценки учеников'], ['signals', 'Результаты прогнозов']].map(([id, t]) => `<button role="tab" aria-selected="${rankMode === id}" class="tab ${rankMode === id ? 'active' : ''}" data-action="rank-tab" data-id="${id}">${t}</button>`).join('')}</div><div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>Место</th><th>Эксперт</th><th>${rankMode === 'signals' ? 'Завершённые прогнозы' : 'Учеников'}</th><th>${rankMode === 'signals' ? 'Выполнено условий' : 'Оценка из 5'}</th><th></th></tr></thead><tbody>${list.map((e, i) => `<tr><td>${String(i + 1).padStart(2, '0')}</td><td>${expertLink({ id: e.id, name: e.name, avatar: e.avatarUrl })}</td><td>${rankMode === 'signals' ? e.forecasts.done : e.students}</td><td>${rankMode === 'signals' ? (e.forecasts.done ? `${String(e.forecasts.successRate).replace('.', ',')}% (${e.forecasts.success}/${e.forecasts.done})` : '—') : rating(e.rating)}</td><td><a class="icon-button" href="#expert/${e.id}" aria-label="Профиль: ${esc(e.name)}">${icon('arrow-up-right')}</a></td></tr>`).join('')}</tbody></table></div><p class="rank-context">${rankMode === 'signals' ? 'Доля прогнозов, у которых выполнено заранее заданное условие. Этот показатель не равен доходности портфеля и сам по себе не доказывает мастерство инвестора.' : 'Средняя оценка по отзывам учеников на курсы эксперта.'} Статистика прогнозов отделена от отзывов об обучении.</p>`;
  }

  function signalsView() {
    const labels = { active: 'Открыт', success: 'Условие выполнено', miss: 'Не выполнено' };
    const list = forecasts.filter(f => signalFilter === 'all' || f.status === signalFilter);
    return `${breadcrumb([['Идеи и аналитика', '#mode/ideas'], ['Сигналы']])}<div class="heading-row"><h1>История прогнозов</h1></div><p class="subtitle">Гипотеза, срок и результат. В том числе когда прогноз не сбылся.</p><div class="tabs">${[['all', 'Все прогнозы'], ['active', 'Открытые'], ['success', 'Выполненные'], ['miss', 'Не выполненные']].map(([id, n]) => `<button class="tab ${signalFilter === id ? 'active' : ''}" data-action="signal-filter" data-id="${id}">${n}</button>`).join('')}</div>${list.length ? `<div class="signal-grid">${list.map(f => `<article class="signal-card"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${esc(f.ticker)}</span><div><strong>${esc(f.name)}</strong><p>${esc(f.ticker)} · USD · ${f.direction === 'up' ? 'рост' : 'снижение'}</p></div></div><span class="status ${f.status}">${labels[f.status]}</span></div><p class="fc-condition-public">Цена закрытия на ${fmtDate(f.deadline)} ${f.direction === 'up' ? 'не ниже' : 'не выше'} ${usd(f.targetPrice)}</p><div class="signal-values"><div><label>При публикации</label><strong>${usd(f.startPrice)}</strong></div><div><label>Цель</label><strong>${usd(f.targetPrice)}</strong></div><div><label>${f.status === 'active' ? 'Проверка' : 'Итог'}</label><strong>${f.status === 'active' ? fmtDate(f.deadline).replace(/\s\d{4}$/, '') : usd(f.resultPrice)}</strong></div></div><div class="signal-bottom">${expertLink({ id: f.expert.id, name: f.expert.name, avatar: avatarOf(f.expert.id) })}<button class="text-link" data-action="signal" data-id="${f.id}">Обоснование ${icon('arrow-right')}</button></div></article>`).join('')}</div>` : empty('Прогнозов нет', 'В этом фильтре пока пусто.')}<p class="rank-context">Прогноз фиксируется в момент публикации: изменить или удалить его нельзя. Итог определяется по цене закрытия на дату проверки.</p>`;
  }

  function settingsView() {
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Настройки</h1><div class="settings-list">
      <div class="setting-row"><div><h2>Оформление</h2><p>Светлая, тёмная или системная тема</p></div><div class="segmented" role="group" aria-label="Оформление">${[['light', 'sun', 'Светлая'], ['dark', 'moon', 'Тёмная'], ['system', 'monitor', 'Системная']].map(([id, i, t]) => `<button data-action="set-theme" data-id="${id}" class="${prefs.theme === id ? 'active' : ''}" title="${t}" aria-label="${t}" aria-pressed="${prefs.theme === id}">${icon(i)}</button>`).join('')}</div></div>
      <div class="setting-row"><div><h2>Акцентный цвет</h2><p>Автоматически по разделу или любимый оттенок</p></div><div class="swatches">${[['auto', '', 'По разделу'], ['green', '#21755a', 'Зелёный'], ['violet', '#6552a0', 'Фиолетовый'], ['coral', '#af5b43', 'Коралловый'], ['blue', '#326db6', 'Синий']].map(([id, color, name]) => `<button class="swatch ${id === 'auto' ? 'auto' : ''} ${prefs.accent === id ? 'active' : ''}" style="${color ? 'background:' + color : ''}" data-action="accent" data-id="${id}" title="${name}" aria-label="${name}" aria-pressed="${prefs.accent === id}">${prefs.accent === id ? icon('check') : ''}</button>`).join('')}</div></div>
      <div class="setting-row"><div><h2>Анимация переходов</h2><p>Учитывает системную настройку уменьшения движения</p></div><label class="switch"><input type="checkbox" id="motionToggle" aria-label="Анимация переходов" ${prefs.motion ? 'checked' : ''}><span></span></label></div>
      <div class="setting-row"><div><h2>Аккаунт</h2><p>${me ? `${esc(me.name)} · ${esc(me.email)} · ${ROLE[me.role]}` : 'Вы не вошли'}</p></div>${me ? `<button class="btn secondary" data-action="logout">${icon('log-out')}Выйти</button>` : `<a class="btn" href="${api.loginUrl()}">${icon('log-in')}Войти</a>`}</div>
      <div class="setting-row"><div><h2>Демо-направления</h2><p>Сбросить доступы и сообщения в «Работе с экспертом», «Сообществе» и идеях. Курсы и прогресс на сервере не затрагиваются.</p></div><button class="btn secondary" data-action="reset">Сбросить</button></div>
    </div>`;
  }

  function profileView() {
    if (!me) return `<h1>Личный профиль</h1>${loginPrompt('Войдите, чтобы изменить профиль.')}`;
    const editable = me.role !== 'expert';
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Личный профиль</h1><form class="profile-form" id="profileForm"><span class="user-avatar" style="width:64px;height:64px;font-size:20px">${esc(initials(me.name))}</span><label class="form-label">Имя и фамилия<input type="text" name="name" maxlength="60" required value="${esc(me.name)}" ${editable ? '' : 'readonly'}></label>${editable ? '' : `<p class="fine-print">Имя эксперта меняется через модерацию: <a class="text-link" href="/studio.html#profile">Публичный профиль в Dal Studio</a>.</p>`}<label class="form-label">Электронная почта<input type="email" value="${esc(me.email)}" readonly></label><p class="fine-print">Роль: ${ROLE[me.role]}. С нами с ${fmtDate(me.createdAt)}.</p>${editable ? `<button class="btn" type="submit">${icon('check')}Сохранить изменения</button>` : ''}</form>`;
  }

  function savedView() {
    const list = offers().filter(o => prefs.saved.includes(o.id));
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Избранное</h1><p class="subtitle" style="margin-bottom:28px">То, к чему хочется вернуться. Хранится в этом браузере.</p>${list.length ? `<div class="product-grid">${list.map(o => productCard(o)).join('')}</div>` : empty('Пока здесь пусто', 'Отмечайте понравившиеся материалы закладкой.', 'bookmark')}`;
  }

  function errorView(e) {
    if (e.code === 'offline') return `<div class="offline">${icon('plug-zap')}<h2>Сервер не отвечает</h2><p>Сайт работает вместе с сервером на вашем компьютере. Откройте PowerShell в папке <code>DAL\\server</code>, выполните <code>npm start</code> и откройте <code>http://localhost:4000</code>.</p><button class="btn" data-action="reload">${icon('refresh-cw')}Попробовать снова</button></div>`;
    if (e.status === 404) return empty('Не найдено', e.message);
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
      case 'learning': return learningView();
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
    icons();
    if ($('#catalogSort')) $('#catalogSort').value = catalogSort;
    document.title = `Dal · ${$('h1', main)?.textContent || mode.name}`;
    closeProfile();
    if (newRoute) { window.scrollTo({ top: 0, behavior: 'instant' }); if (lastNav) main.focus({ preventScroll: true }); }
    lastNav = hash;
  }

  // ---------- Диалоги и действия ----------
  function toast(m) { clearTimeout(toastTimer); $('#toast').textContent = m; $('#toast').classList.add('visible'); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200); }
  function openDialog(title, body, cls = '') {
    if (modal.open) modal.close();
    lastFocus = document.activeElement; modal.className = cls;
    modal.innerHTML = `<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-button" data-action="close-modal" title="Закрыть" aria-label="Закрыть">${icon('x')}</button></div>${body}`;
    icons(); modal.showModal();
  }
  function openSearch() {
    openDialog('Что хотите изучить?', `<label class="input-wrap" style="display:block">${icon('search')}<input id="globalSearch" type="search" aria-label="Поиск по Dal" placeholder="Курс, тема или имя эксперта" autofocus></label><div class="search-results" id="searchResults">${searchResults('')}</div>`);
    $('#globalSearch').focus();
  }
  function searchResults(term) {
    const q = term.toLocaleLowerCase('ru');
    const r = offers().filter(o => (o.title + ' ' + o.expert.name).toLocaleLowerCase('ru').includes(q)).slice(0, 7);
    return r.length ? r.map(o => `<a class="search-result" href="#product/${o.id}">${cover(o.cover)}<div><strong>${esc(o.title)}</strong><small>${esc(o.expert.name)} · ${money(o.price)}${o.kind === 'demo' ? ' · демо' : ''}</small></div>${icon('arrow-up-right')}</a>`).join('') : '<p class="modal-text">Ничего не найдено. Попробуйте другое слово.</p>';
  }
  function buyCourse(id) {
    if (!me) { location.href = api.loginUrl(`/#product/${id}`); return; }
    const o = findOffer(id); if (!o) return;
    openDialog(o.price ? 'Получить доступ' : 'Начать бесплатно', `<p class="modal-text">${esc(o.title)}</p><div class="order-line"><span>Эксперт</span><strong>${esc(o.expert.name)}</strong></div><div class="order-line"><span>Уроков</span><strong>${o.lessons}</strong></div><div class="order-line"><span>Итого</span><strong>${money(o.price)}</strong></div><div class="notice">Оплата пока не подключена: доступ откроется без списания денег. Цена фиксируется в момент покупки.</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-buy" data-id="${id}">${icon('check')}Открыть доступ</button></div>`);
  }
  function buyDemo(id) {
    const o = findOffer(id); if (!o) return;
    openDialog('Получить доступ', `<p class="modal-text">${esc(o.title)}</p><div class="order-line"><span>Эксперт</span><strong>${esc(o.expert.name)}</strong></div><div class="order-line"><span>Итого</span><strong>${money(o.price)}</strong></div><div class="notice">Это направление пока работает в демо-режиме: доступ сохранится только в этом браузере.</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-demo" data-id="${id}">${icon('check')}Открыть демодоступ</button></div>`);
  }
  function openDemo(id) {
    const o = findOffer(id); if (!o) return;
    const p = o.raw, who = me?.name || 'Вы';
    if (p.mode === 'community') {
      const msgs = local.chats.filter(m => m.product === id);
      openDialog(esc(p.title), `<p class="fine-print">Демочат: сообщения хранятся только в этом браузере.</p><div class="chat-messages" id="chatMessages"><div class="chat-message"><strong>${esc(o.expert.name)}</strong>Добро пожаловать! Какой вопрос об инвестициях вы сейчас изучаете?</div>${msgs.map(m => `<div class="chat-message self"><strong>${esc(who)}</strong>${esc(m.text)}</div>`).join('')}</div><form class="chat-form" id="chatForm" data-product="${id}"><input type="text" name="message" required maxlength="1000" aria-label="Сообщение" placeholder="Ваше сообщение"><button class="btn" type="submit" title="Отправить" aria-label="Отправить">${icon('send')}</button></form>`);
      $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    } else if (p.mode === 'experts') openDialog('Ваше занятие', `<p class="modal-text">${esc(p.title)} · ${esc(o.expert.name)}</p><p class="notice">Демозапись: встреча не будет отправлена эксперту.</p><form id="bookingForm"><label class="form-label">Удобное время (Asia/Almaty)<select name="slot"><option>5 октября, 18:00</option><option>6 октября, 12:00</option><option>7 октября, 19:00</option></select></label><button type="submit" class="btn wide" style="margin-top:20px">Выбрать время</button></form>`);
    else openDialog(esc(p.title), `<article class="readable"><span class="badge">Учебный материал · демо</span><h2>Сначала вопрос, затем данные</h2><p>Хороший анализ начинается с проверяемого вопроса. Например: за счёт чего компания зарабатывает и что может помешать ей делать это в будущем?</p><h2>Три направления проверки</h2><p>Изучите динамику выручки, денежный поток и долговую нагрузку. Для каждого числа запишите период, единицы и первичный источник.</p></article>`);
  }
  function closeProfile() { $('#profileMenu').hidden = true; $('.user-trigger').setAttribute('aria-expanded', 'false'); }
  function toggleProfile() {
    const p = $('#profileMenu');
    if (!p.hidden) { closeProfile(); return; }
    const page = (location.hash || '#home').slice(1).split('/')[0];
    const link = (href, ic, text, extra = '') => `<a href="#${href}" class="${page === href || (href === 'learning' && page === 'lesson') ? 'active' : ''}">${icon(ic)}<span>${text}</span>${extra}</a>`;
    if (!me) {
      p.innerHTML = `<div class="popover-person"><span class="user-avatar">${icon('user-round')}</span><div><strong>Вы не вошли</strong><p>Войдите, чтобы учиться и сохранять прогресс</p></div></div><a href="${api.loginUrl()}">${icon('log-in')}<span>Войти</span></a><a href="/login.html?mode=register">${icon('user-plus')}<span>Регистрация</span></a><div class="popover-separator"></div>${link('saved', 'bookmark', 'Избранное', `<span class="nav-count">${prefs.saved.length}</span>`)}${link('rankings', 'chart-no-axes-column-increasing', 'Рейтинг экспертов')}${link('settings', 'settings-2', 'Настройки')}`;
    } else {
      let progress = '';
      const c = learning.inProgress;
      if (c) progress = `<a class="popover-progress" href="#lesson/${c.id}"><span class="continue-label"><span class="live-dot"></span>${c.progress.done === c.progress.total ? 'Пройдено' : 'В процессе'}</span><strong>${esc(c.title)}</strong><span class="progress"><span style="width:${c.progress.percent}%"></span></span><span class="side-progress-meta"><span>${c.progress.done} из ${c.progress.total} уроков</span><span>${c.progress.percent}%</span></span></a>`;
      const studio = me.role !== 'student' ? `<a href="${api.homeFor(me.role)}" class="popover-studio">${icon(me.role === 'moderator' ? 'shield-check' : 'clapperboard')}<span>${me.role === 'moderator' ? 'Модерация' : 'Dal Studio'}</span>${icon('arrow-up-right')}</a>` : '';
      p.innerHTML = `<div class="popover-person"><span class="user-avatar">${esc(initials(me.name))}</span><div><strong>${esc(me.name)}</strong><p>${me.role === 'student' ? 'Личный кабинет ученика' : ROLE[me.role][0].toUpperCase() + ROLE[me.role].slice(1)}</p></div></div>${studio}${progress}<div class="popover-label">ВАШЕ ПРОСТРАНСТВО</div>${me.role === 'student' ? link('learning', 'book-open', 'Моё обучение', `<span class="nav-count">${learning.courses.length + local.owned.length}</span>`) : ''}${link('saved', 'bookmark', 'Избранное', `<span class="nav-count">${prefs.saved.length}</span>`)}${link('rankings', 'chart-no-axes-column-increasing', 'Рейтинг экспертов')}<div class="popover-separator"></div>${link('profile', 'circle-user-round', 'Мой профиль')}${link('settings', 'settings-2', 'Настройки')}<button data-action="logout">${icon('log-out')}<span>Выйти</span></button>`;
    }
    p.hidden = false; $('.user-trigger').setAttribute('aria-expanded', 'true'); icons(); $('a, button', p)?.focus();
  }
  function saveOffer(id) {
    const had = prefs.saved.includes(id);
    prefs.saved = had ? prefs.saved.filter(v => v !== id) : [...prefs.saved, id]; savePrefs();
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
      case 'save': saveOffer(id); break;
      case 'buy': buyCourse(id); break;
      case 'buy-demo': buyDemo(id); break;
      case 'open-demo': openDemo(id); break;
      case 'close-modal': modal.close(); break;
      case 'reload': guard(async () => { await loadBase(); render(); }, button); break;
      case 'confirm-buy': guard(async () => {
        await api.post(`/courses/${id}/enroll`);
        await Promise.all([refreshLearning(), refreshCatalog()]);
        modal.close(); toast('Доступ открыт. Курс в «Моём обучении».'); location.hash = `#lesson/${id}`;
      }, button); break;
      case 'confirm-demo': if (!local.owned.includes(id)) local.owned.push(id); saveLocal(); modal.close(); render(); toast('Демодоступ открыт'); break;
      case 'refund': openDialog('Вернуть курс?', `<p class="modal-text">Возврат возможен в течение 14 дней после покупки, если пройдено меньше 20% курса. После возврата доступ к урокам закроется.</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-refund" data-id="${id}">Вернуть</button></div>`); break;
      case 'confirm-refund': guard(async () => {
        const r = await api.post(`/courses/${id}/refund`);
        await Promise.all([refreshLearning(), refreshCatalog()]);
        modal.close(); render(); toast(`Курс возвращён: ${money(r.refunded)}`);
      }, button); break;
      case 'preview': openDialog(esc(button.dataset.title), `<video class="lesson-video" controls autoplay playsinline src="${esc(button.dataset.src)}"></video><p class="fine-print">Бесплатный урок: его можно посмотреть до покупки.</p>`, 'wide'); break;
      case 'complete-lesson': guard(async () => {
        const course = button.dataset.course;
        await api.post(`/lessons/${id}/complete`);
        await refreshLearning();
        const c = learning.courses.find(x => x.id === course);
        toast(c && c.progress.done === c.progress.total ? 'Поздравляем! Курс пройден.' : 'Урок завершён');
        render();
      }, button); break;
      case 'library-tab': libraryMode = id; render(); break;
      case 'expert-tab': expertMode = id; render(); break;
      case 'rank-tab': rankMode = id; render(); break;
      case 'signal-filter': signalFilter = id; render(); break;
      case 'signal': {
        const f = forecasts.find(x => x.id === id);
        openDialog(`${esc(f.ticker)}: обоснование`, `<p class="modal-text">${esc(f.rationale)}</p><div class="order-line"><span>Автор</span><strong>${esc(f.expert.name)}</strong></div><div class="order-line"><span>Опубликован</span><strong>${fmtDate(f.publishedAt)}</strong></div><div class="order-line"><span>Проверка условия</span><strong>${fmtDate(f.deadline)}</strong></div>${f.comments.length ? `<h3 class="modal-sub">Комментарии автора</h3>${f.comments.map(c => `<p class="modal-text"><small>${fmtDate(c.createdAt)}</small><br>${esc(c.text)}</p>`).join('')}` : ''}<p class="notice">Это не торговая рекомендация. Условие и срок зафиксированы при публикации.</p>`);
        break;
      }
      case 'review': openDialog('Ваш отзыв', `<form id="reviewForm" data-course="${id}"><label class="form-label">Оценка<select name="rating"><option value="5">5 · Отлично</option><option value="4">4 · Хорошо</option><option value="3">3 · Нормально</option><option value="2">2 · Ниже ожиданий</option><option value="1">1 · Не понравилось</option></select></label><label class="form-label" style="margin-top:15px">Что было полезно?<textarea name="text" required minlength="10" maxlength="1500" rows="5"></textarea></label><p class="fine-print" style="margin-top:15px">Отзыв увидят все. Изменить или удалить его будет нельзя.</p><button class="btn wide" style="margin-top:20px" type="submit">Опубликовать отзыв</button></form>`); break;
      case 'logout': guard(async () => { await api.logout(); me = null; learning = { courses: [], inProgress: null }; closeProfile(); toast('Вы вышли из аккаунта'); render(); }, button); break;
      case 'reset': openDialog('Сбросить демо-направления?', `<p class="modal-text">Демодоступы и сообщения в «Работе с экспертом», «Сообществе» и идеях будут удалены. Курсы и прогресс на сервере не затрагиваются.</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-reset">Сбросить</button></div>`); break;
      case 'confirm-reset': local = { owned: [], chats: [] }; saveLocal(); modal.close(); render(); toast('Демо-данные сброшены'); break;
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'catalogSearch') { catalogSearch = e.target.value; refreshResults(); }
    if (e.target.id === 'globalSearch') { $('#searchResults').innerHTML = searchResults(e.target.value); icons(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'catalogSort') { catalogSort = e.target.value; refreshResults(); }
    if (e.target.id === 'freeOnly') { freeOnly = e.target.checked; refreshResults(); }
    if (e.target.id === 'motionToggle') { prefs.motion = e.target.checked; savePrefs(); applyAppearance(); icons(); }
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (!['profileForm', 'chatForm', 'bookingForm', 'reviewForm'].includes(form.id)) return;
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
      await api.post(`/courses/${form.dataset.course}/reviews`, { rating: Number(data.get('rating')), text });
      await refreshCatalog(); modal.close(); render(); toast('Отзыв опубликован');
    }, btn);
    if (form.id === 'chatForm') {
      const text = String(data.get('message')).trim(); if (!text) return;
      local.chats.push({ product: form.dataset.product, text }); local.chats = local.chats.slice(-100); saveLocal();
      const item = document.createElement('div'); item.className = 'chat-message self'; item.innerHTML = `<strong>${esc(me?.name || 'Вы')}</strong>${esc(text)}`;
      $('#chatMessages').append(item); form.reset(); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    }
    if (form.id === 'bookingForm') { modal.close(); toast(`Выбрано: ${data.get('slot')}. Демозапись.`); }
  });
  modal.addEventListener('click', e => { if (e.target === modal) { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close(); } });
  modal.addEventListener('close', () => { $$('video', modal).forEach(v => v.pause()); if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true }); });
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

  (async () => {
    updateChrome();
    main.innerHTML = `<div class="page"><div class="loading">Загружаем…</div></div>`;
    try { await loadBase(); } catch (e) { main.innerHTML = `<div class="page">${errorView(e)}</div>`; icons(); return; }
    render();
  })();
})();
