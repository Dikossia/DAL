(() => {
  'use strict';
  const { modes, experts, products, signals } = window.DAL;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => n === 0 ? 'Бесплатно' : new Intl.NumberFormat('ru-RU').format(n) + ' ₸';
  const num = n => Number(n).toFixed(2).replace('.', ',');
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const findProduct = id => products.find(p => p.id === id);
  const findExpert = id => experts.find(e => e.id === id);
  const findMode = id => modes.find(m => m.id === id) || modes[0];
  const brights = {courses:'#8dccab',experts:'#c0acee',community:'#e5ac95',ideas:'#98bfee'};
  modes.forEach(m => { m.bright = brights[m.id]; });
  const HOME = { id:'home', name:'Главная', icon:'house', accent:'#2f5d62', bright:'#9cc9cc' };
  const drumItems = [HOME, ...modes];
  const findDrum = id => drumItems.find(m => m.id === id) || HOME;
  const imageSource = id => window.DAL_IMAGES?.[id] || `assets/${id}.jpg`;
  const photo = (id, alt = '', cls = '') => `<img src="${imageSource(id)}" alt="${esc(alt)}" class="${cls}" loading="lazy">`;
  const defaults = () => ({ mode:'home', theme:'light', accent:'auto', motion:true, saved:[], owned:['c1'], progress:{c1:3}, name:'Дарын Асылбек', email:'', bio:'', chats:[], reviews:[] });
  let state = defaults();
  try { const saved = JSON.parse(localStorage.getItem('dal-demo-v1')); if (saved && typeof saved === 'object') state = {...state, ...saved}; } catch (_) {}
  for (const key of ['saved','owned']) if (!Array.isArray(state[key])) state[key] = defaults()[key];
  if (!Array.isArray(state.chats)) state.chats = [];
  if (!Array.isArray(state.reviews)) state.reviews = [];
  if (!state.progress || typeof state.progress !== 'object') state.progress = {c1:3};
  state.saved = state.saved.filter(id => findProduct(id));
  state.owned = state.owned.filter(id => findProduct(id));
  state.mode = findDrum(state.mode).id;
  const persist = () => { try { localStorage.setItem('dal-demo-v1', JSON.stringify(state)); } catch (_) {} };
  let mode = findDrum(state.mode), preview = drumItems.indexOf(mode), toastTimer, lastFocus;
  let libraryMode = 'courses', expertMode = '', rankMode = 'all', currentLesson = null;
  let catalogSearch = '', catalogSort = 'popular', freeOnly = false, signalFilter = 'all';
  let routeKey = '', lastNav = '';
  const main = $('#main'), modal = $('#modal');
  const icons = () => window.lucide?.createIcons({attrs:{'aria-hidden':'true'}});
  const initials = () => String(state.name || 'Ученик').split(' ').filter(Boolean).slice(0,2).map(n => n[0]).join('').toUpperCase();
  const rating = (value, count) => `<span class="rating">${icon('star')}${num(value)}${count !== undefined ? `<small>(${count})</small>` : ''}</span>`;
  const expertLink = id => { const e = findExpert(id); return `<a class="expert-inline" href="#expert/${e.id}">${photo(e.image,e.name)}<span>${e.name}</span></a>`; };
  const modesTabs = (active, action, overall = false) => `<div class="tabs" role="tablist" aria-label="Раздел">${overall ? `<button role="tab" aria-selected="${active === 'all'}" class="tab ${active === 'all'?'active':''}" data-action="${action}" data-id="all">Общий рейтинг</button>` : ''}${modes.map(m => `<button role="tab" aria-selected="${active === m.id}" class="tab ${active === m.id?'active':''}" data-action="${action}" data-id="${m.id}">${m.name}</button>`).join('')}${action === 'rank-tab' ? `<button role="tab" aria-selected="${active === 'signals'}" class="tab ${active === 'signals'?'active':''}" data-action="${action}" data-id="signals">Результаты прогнозов</button>` : ''}</div>`;
  const breadcrumb = (items = []) => `<nav class="breadcrumb" aria-label="Навигационная цепочка"><a href="#home">Главная</a>${items.map(([name,href]) => `${icon('chevron-right')}${href ? `<a href="${href}">${esc(name)}</a>` : `<span>${esc(name)}</span>`}`).join('')}</nav>`;
  const footer = () => `<footer class="page-footer"><span><span class="footer-logo">Dal.</span> &nbsp; Учимся принимать решения.</span><span>Демонстрационные профили, цены и данные. Не инвестиционная рекомендация.</span></footer>`;
  const empty = (title, text, name = 'search') => `<div class="empty">${icon(name)}<h2>${title}</h2><p>${text}</p><a class="btn secondary" href="#home">К обзору ${icon('arrow-right')}</a></div>`;
  const getProgress = p => Math.max(0, Math.min(p.lessons, Number(state.progress[p.id]) || 0));
  const modulesFor = p => p.modules || Array.from({length:p.lessons}, (_,i) => ['Основные понятия и постановка задачи','Исходные данные и допущения','Проверяем гипотезу на примере','Обсуждение результатов и ограничений'][i % 4] + (i >= 4 ? ` · часть ${Math.floor(i/4)+1}` : ''));
  function applyAppearance() {
    const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.motion = state.motion ? 'on' : 'off';
    const colors = {green:['#21755a','#8dccab'],violet:['#6552a0','#c0acee'],coral:['#af5b43','#e5ac95'],blue:['#326db6','#98bfee']};
    const light = state.accent === 'auto' ? mode.accent : (colors[state.accent] || colors.green)[0];
    const bright = state.accent === 'auto' ? mode.bright : (colors[state.accent] || colors.green)[1];
    document.documentElement.style.setProperty('--accent',dark ? bright : light);
    document.documentElement.style.setProperty('--soft',dark ? `color-mix(in srgb, ${bright} 12%, #1d2420)` : `color-mix(in srgb, ${light} 8%, white)`);
    $('.theme-toggle').innerHTML = icon(dark ? 'sun':'moon');
    $('.theme-toggle').title = dark ? 'Светлая тема':'Тёмная тема';
    $('.theme-toggle').setAttribute('aria-label',$('.theme-toggle').title);
    $('.user-avatar').textContent = initials();
  }
  function updateChrome() {
    preview = drumItems.indexOf(mode);
    showPreview(preview, false);
    applyAppearance();
    icons();
  }
  function showPreview(index, animate = true) {
    const old = preview;
    const total = drumItems.length;
    preview = (index + total) % total;
    const m = drumItems[preview], label = $('#drumLabel');
    $('#drum').style.setProperty('--preview',document.documentElement.dataset.theme === 'dark' ? m.bright : m.accent);
    label.innerHTML = `${icon(m.icon)}<span>${m.name}</span>`;
    $('.ghost-top').textContent = drumItems[(preview+total-1)%total].name;
    $('.ghost-bottom').textContent = drumItems[(preview+1)%total].name;
    $('#drumSelect').setAttribute('aria-label',`Открыть раздел «${m.name}»`);
    $('#drumSelect').title = m.name;
    label.classList.remove('roll-next','roll-prev');
    if (animate && old !== preview) { void label.offsetWidth; label.classList.add(index < old ? 'roll-prev':'roll-next'); }
    if (!$('#modeDots').children.length) $('#modeDots').innerHTML = drumItems.map(v => `<button class="mode-dot" data-action="mode" data-id="${v.id}" aria-label="${v.name}" title="${v.name}"></button>`).join('');
    $$('.mode-dot').forEach((button,i) => {
      button.classList.toggle('active',drumItems[i].id === mode.id);
      button.classList.toggle('preview',i === preview);
      button.setAttribute('aria-current',drumItems[i].id === mode.id ? 'page':'false');
    });
    icons();
  }
  let waveFrame = 0;
  function wave() {
    if (!state.motion || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('#colorWave'), ctx = canvas.getContext('2d');
    if (!ctx) return;
    cancelAnimationFrame(waveFrame);
    const width = innerWidth, height = innerHeight, ratio = Math.min(devicePixelRatio || 1,2);
    canvas.width = width*ratio; canvas.height = height*ratio; ctx.scale(ratio,ratio); canvas.style.display = 'block';
    const start = performance.now();
    const draw = time => {
      const t = Math.min((time-start)/660,1);
      ctx.clearRect(0,0,width,height);
      for (let n=0;n<3;n++) {
        const y = -height*.6 + (height*2.2)*(1-Math.pow(1-t,2)) - n*height*.1;
        const gradient = ctx.createLinearGradient(0,0,width,height*.3);
        gradient.addColorStop(0,'#8cdab9');gradient.addColorStop(.35,'#b8a7e3');gradient.addColorStop(.7,'#f1c99e');gradient.addColorStop(1,'#9cccdc');
        ctx.fillStyle = gradient;ctx.globalAlpha = Math.sin(Math.PI*t)*.20*(1-n*.17);
        ctx.beginPath();ctx.moveTo(0,y);
        ctx.bezierCurveTo(width*.28,y-height*.26,width*.65,y+height*.28,width,y-height*.12);
        ctx.lineTo(width,y+height*.6);ctx.bezierCurveTo(width*.65,y+height*.85,width*.25,y+height*.32,0,y+height*.65);ctx.closePath();ctx.fill();
      }
      if (t < 1) waveFrame = requestAnimationFrame(draw); else {ctx.clearRect(0,0,width,height);canvas.style.display='none';}
    };
    waveFrame = requestAnimationFrame(draw);
  }
  function selectMode(id) {
    const changed = mode.id !== id;
    mode = findDrum(id);state.mode = mode.id;persist();
    if (changed) wave();
    const target = mode === HOME ? '#home' : `#mode/${mode.id}`;
    if (location.hash === target) render(); else location.hash = target;
  }
  function productCard(p, compact = false) {
    const saved = state.saved.includes(p.id);
    return `<article class="product-card ${compact?'compact':''}"><div class="product-cover"><a href="#product/${p.id}" tabindex="-1" aria-hidden="true">${photo(p.image)}</a><button class="icon-button save-button ${saved?'saved':''}" data-action="save" data-id="${p.id}" aria-label="${saved?'Убрать из избранного':'В избранное'}" title="${saved?'Убрать из избранного':'В избранное'}" aria-pressed="${saved}">${icon('bookmark')}</button></div><div class="product-body"><div class="product-kicker">${p.tag}</div><a class="product-title" href="#product/${p.id}">${p.title}</a>${expertLink(p.expert)}<div class="product-meta"><span>${icon('clock-3')}${p.duration}</span>${p.mode === 'courses'?`<span>${icon('play')}${p.lessons} ${p.lessons===1?'встреча':'уроков'}</span>`:''}</div><div class="product-bottom"><strong>${money(p.price)}</strong>${rating(p.rating,p.reviews)}</div></div></article>`;
  }
  function overview() {
    const picks = ['c1','e2','g1'].map(findProduct);
    const avg = e => e.ratings.reduce((a,b)=>a+b,0)/e.ratings.length;
    return `<div class="page-topline"><span class="eyebrow">ЗНАНИЯ. ЛЮДИ. КАПИТАЛ.</span><span class="tiny-meta">Выберите, с чего начать</span></div><div class="intro"><h1>Учимся принимать финансовые решения.</h1><p>Курсы, личная работа с экспертом, сообщество и разборы рынка. Выберите направление, и внутри откроются все его разделы.</p></div><div class="directions">${modes.map(m => {
      const count = products.filter(p => p.mode===m.id).length + (m.id==='ideas' ? signals.length : 0);
      return `<a class="direction-card" href="#mode/${m.id}" data-action="mode" data-id="${m.id}" style="--card-accent:${m.accent};--card-bright:${m.bright}"><div class="direction-top"><span class="direction-icon">${icon(m.icon)}</span><span class="direction-count">${count} ${plural(count,'материал','материала','материалов')}</span></div><div class="direction-body"><span class="direction-eyebrow">${m.eyebrow}</span><h2>${m.name}</h2><p>${m.description}</p><ul class="direction-list">${m.categories.map(c=>`<li>${c.name}</li>`).join('')}</ul></div><div class="direction-bottom"><span>Открыть раздел</span>${icon('arrow-right')}</div></a>`;
    }).join('')}</div><div class="section-head"><h2>Начните с интересного</h2></div><div class="featured-grid">${picks.map(p=>productCard(p,true)).join('')}</div><div class="section-head"><h2>Знания с человеческим лицом</h2><a class="text-link" href="#rankings">Все эксперты ${icon('arrow-right')}</a></div><div class="experts-strip">${experts.map(e=>`<a class="expert-mini" href="#expert/${e.id}">${photo(e.image,e.name)}<div><strong>${e.name}</strong><p>${e.role}</p></div>${rating(avg(e))}</a>`).join('')}</div>`;
  }
  function modeHome() {
    const picks = products.filter(p => p.mode === mode.id).slice(0,3);
    return `<div class="page-topline"><span class="eyebrow">${mode.eyebrow}</span><span class="tiny-meta">Ваш следующий шаг</span></div><div class="intro"><h1>${mode.title}</h1><p>${mode.description}</p></div><div class="categories ${mode.categories.length===2?'two':''}">${mode.categories.map(c => {
      const count = c.id==='signals' ? signals.length : products.filter(p => p.mode===mode.id&&p.category===c.id).length;
      return `<a class="category-card" href="#category/${mode.id}/${c.id}"><div class="category-image">${photo(c.image,c.name)}<span class="category-tag">${c.label}</span></div><div class="category-body"><h2>${c.name}</h2><p>${c.description}</p><div class="category-bottom"><span>${c.id === 'signals' ? `${count} прогноза` : `${count} ${mode.id==='courses'?'программы':'предложения'}`}</span>${icon('arrow-up-right')}</div></div></a>`;
    }).join('')}</div><div class="section-head"><h2>${mode.id==='courses'?'Начните с интересного':mode.id==='experts'?'Знакомство с экспертами':mode.id==='community'?'Ближе к единомышленникам':'Стоит прочитать'}</h2><a class="text-link" href="#category/${mode.id}/${mode.categories[0].id}">Смотреть все ${icon('arrow-right')}</a></div><div class="featured-grid">${picks.map(p=>productCard(p,true)).join('')}</div><div class="section-head"><h2>Знания с человеческим лицом</h2><a class="text-link" href="#rankings">Все эксперты ${icon('arrow-right')}</a></div><div class="experts-strip">${experts.map(e=>`<a class="expert-mini" href="#expert/${e.id}">${photo(e.image,e.name)}<div><strong>${e.name}</strong><p>${e.role}</p></div>${rating(e.ratings[modes.indexOf(mode)])}</a>`).join('')}</div>`;
  }
  function categoryView(categoryId) {
    const c = mode.categories.find(c=>c.id===categoryId);
    if (!c) return empty('Раздел не найден','Вернитесь к обзору и выберите направление.');
    if (c.id==='signals') return signalsView();
    return `${breadcrumb([[mode.name,`#mode/${mode.id}`],[c.name]])}<div class="heading-row"><h1>${c.name}</h1><span class="badge">${icon(mode.icon)}${mode.name}</span></div><p class="subtitle">${c.description}</p><div class="toolbar"><label class="input-wrap">${icon('search')}<input id="catalogSearch" type="search" placeholder="Поиск по названию или эксперту" aria-label="Поиск в каталоге" value="${esc(catalogSearch)}"></label><select id="catalogSort" aria-label="Сортировка"><option value="popular">По рейтингу</option><option value="price">Сначала дешевле</option><option value="price-desc">Сначала дороже</option></select><label><input type="checkbox" id="freeOnly" ${freeOnly?'checked':''}> Бесплатные</label></div><div id="catalogResults">${catalogResults(c.id)}</div>`;
  }
  function catalogResults(cat) {
    let list = products.filter(p=>p.mode===mode.id&&p.category===cat&&(!freeOnly||p.price===0));
    const term = catalogSearch.toLocaleLowerCase('ru');
    list = list.filter(p=>(p.title+' '+findExpert(p.expert).name).toLocaleLowerCase('ru').includes(term));
    list.sort((a,b)=>catalogSort==='price'?a.price-b.price:catalogSort==='price-desc'?b.price-a.price:b.rating-a.rating);
    return `<p class="result-count">Найдено: ${list.length}</p>${list.length?`<div class="product-grid">${list.map(p=>productCard(p)).join('')}</div>`:empty('Ничего не нашлось','Попробуйте другой запрос или измените фильтры.')}`;
  }
  function refreshCatalog() {
    const cat = location.hash.split('/')[2];
    $('#catalogResults').innerHTML = catalogResults(cat);icons();
  }
  function productView(id) {
    const p = findProduct(id);
    if (!p) return empty('Материал не найден','Выберите другой материал в каталоге.');
    const m=findMode(p.mode), c=m.categories.find(c=>c.id===p.category), own=state.owned.includes(id);
    const modules=modulesFor(p), course=p.mode==='courses';
    return `${breadcrumb([[m.name,`#mode/${m.id}`],[c.name,`#category/${m.id}/${c.id}`],[p.title]])}<div class="detail-grid"><div class="detail-content"><span class="badge">${p.tag}</span><h1>${p.title}</h1>${expertLink(p.expert)}<img class="detail-cover" src="${imageSource(p.image)}" alt="${esc(p.title)}"><section class="detail-section"><h2>${course?'О программе':'О предложении'}</h2><p>${p.about || c.description+' '+findExpert(p.expert).bio}</p><ul><li>Понятные объяснения и разборы практических ситуаций.</li><li>Внимание к риску, исходным данным и ограничениям выводов.</li><li>Материалы для самостоятельной работы.</li></ul></section><section class="detail-section"><h2>${course?'Программа обучения':p.mode==='experts'?'Как проходит работа':'Что внутри'}</h2>${modules.slice(0,course?modules.length:4).map((v,i)=>`<details class="accordion"><summary><span>${String(i+1).padStart(2,'0')}</span>${v}${icon('chevron-down')}</summary><p>Разбор основных понятий, пример и вопросы для самопроверки. Цель занятия: сформулировать вывод своими словами и обозначить границы его применимости.</p></details>`).join('')}</section><section class="detail-section"><div class="section-head" style="margin-top:0"><h2>Отзывы учеников</h2>${rating(p.rating,p.reviews)}</div>${reviewHTML(p)}${own?`<button class="btn secondary" data-action="review" data-id="${p.id}">${icon('message-square')}Оставить отзыв</button>`:''}</section></div><aside class="purchase-panel"><span class="tiny-meta">${m.name}</span><div class="purchase-price">${money(p.price)}</div><p class="purchase-caption">${['community','experts'].includes(p.mode)?p.duration:'За полный доступ'}</p>${own?`<button class="btn wide" data-action="open-owned" data-id="${p.id}">${course?'Продолжить обучение':'Открыть'}${icon('arrow-right')}</button>`:`<button class="btn wide" data-action="buy" data-id="${p.id}">${p.price?'Получить доступ':'Начать бесплатно'}${icon('arrow-right')}</button>`}<button class="btn secondary wide" style="margin-top:10px" data-action="save" data-id="${p.id}" aria-pressed="${state.saved.includes(p.id)}">${icon('bookmark')}${state.saved.includes(p.id)?'В избранном':'В избранное'}</button><ul class="purchase-features"><li>${icon('clock-3')}${p.duration}</li><li>${icon('book-open')}${course?p.lessons+' уроков':'Материалы и практический разбор'}</li><li>${icon('messages-square')}Обратная связь от эксперта</li></ul><p class="fine-print">Учебное предложение. Доходность инвестиций не гарантируется.</p></aside></div>`;
  }
  function reviewHTML(p) {
    const rows = [...state.reviews.filter(r=>r.product===p.id),{name:'Аружан',text:'Понравилось, что можно последовательно разобраться в понятиях и задать вопросы. Особенно полезны примеры.',rating:5},{name:'Данияр',text:'Стало понятнее, на какие исходные данные смотреть. Хотелось бы ещё больше задач для самостоятельного разбора.',rating:4.8}];
    return rows.map(r=>`<article class="review-item"><div class="review-top"><span class="user-avatar">${esc(r.name[0])}</span><strong>${esc(r.name)}</strong>${rating(r.rating)}</div><p>${esc(r.text)}</p></article>`).join('');
  }
  function expertView(id) {
    const e=findExpert(id);if(!e) return empty('Эксперт не найден','Вернитесь к рейтингу.');
    const active=expertMode||(mode===HOME?'courses':mode.id), avg=e.ratings.reduce((a,b)=>a+b,0)/4;
    const list=products.filter(p=>p.expert===id&&p.mode===active);
    return `${breadcrumb([['Эксперты','#rankings'],[e.name]])}<div class="profile-hero">${photo(e.image,e.name)}<div><span class="badge">Эксперт Dal</span><h1 style="margin-top:10px">${e.name}</h1><p>${e.role}</p><div class="profile-stats"><span>${rating(avg)} общий рейтинг</span><span>${icon('users-round')}${e.students} учеников</span><span>${icon('briefcase-business')}${e.experience}</span></div></div></div><p class="profile-about">${e.bio}</p><div class="tags">${e.achievements.map(t=>`<span>${t}</span>`).join('')}</div>${modesTabs(active,'expert-tab')}<div class="heading-row" style="margin-bottom:22px"><h2>${findMode(active).name}</h2>${rating(e.ratings[modes.findIndex(m=>m.id===active)])}</div>${list.length?`<div class="product-grid">${list.map(p=>productCard(p)).join('')}</div>`:empty('Здесь пока нет предложений','Посмотрите другие направления эксперта.')}<p class="fine-print" style="margin-top:24px">Демонстрационный профиль. Биография, достижения и оценки приведены для макета.</p>`;
  }
  function learningView() {
    const list=products.filter(p=>state.owned.includes(p.id)&&p.mode===libraryMode);
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span><span class="tiny-meta">${esc(state.name.split(' ')[0])}, рады вас видеть</span></div><h1>Моё обучение</h1><p class="subtitle">Всё, к чему вы уже сделали первый шаг.</p>${modesTabs(libraryMode,'library-tab')}${list.length?list.map(p=>{const done=getProgress(p),percent=Math.round(done/p.lessons*100);return `<article class="learning-row">${photo(p.image,p.title)}<div class="learning-info"><span class="product-kicker">${findExpert(p.expert).name}</span><h2><a href="#product/${p.id}">${p.title}</a></h2>${p.mode==='courses'?`<div class="progress"><span style="width:${percent}%"></span></div><p>${done} из ${p.lessons} уроков · ${percent}%</p>`:`<p>${p.duration} · Доступ открыт</p>`}</div><button class="btn" data-action="open-owned" data-id="${p.id}">${p.mode==='courses'?'Продолжить':'Открыть'}${icon('arrow-right')}</button></article>`;}).join(''):empty('Здесь начнётся новая история','Выберите программу или предложение, которое вам интересно.','book-open')}`;
  }
  function lessonView(id) {
    const p=findProduct(id);
    if(!p||!state.owned.includes(id)) return empty('Материал ещё не открыт','Сначала получите доступ на странице программы.','lock-keyhole');
    const modules=modulesFor(p), done=getProgress(p);
    let index=currentLesson===null?Math.min(done,modules.length-1):Math.max(0,Math.min(currentLesson,modules.length-1));
    currentLesson=index;
    const content=lessonContent(index);
    return `${breadcrumb([['Моё обучение','#learning'],[p.title,`#product/${p.id}`]])}<div class="lesson-layout"><article class="lesson-article"><span class="eyebrow">УРОК ${index+1} ИЗ ${modules.length}</span><h1>${modules[index]}</h1><p class="fine-print">Демонстрационный учебный материал</p>${content}<div class="lesson-actions"><button class="btn" data-action="complete-lesson" data-id="${p.id}">${icon(index<done?'circle-check':'check')}${index<done?'Урок пройден':index===done?'Завершить урок':'Сначала завершите предыдущие'}${index>=done?'':icon('arrow-right')}</button><span class="fine-print">${done} из ${modules.length} завершено</span></div></article><aside class="lesson-list"><h2>Программа курса</h2>${modules.map((v,i)=>`<button class="lesson-item ${i===index?'active':''}" data-action="lesson" data-index="${i}">${icon(i<done?'circle-check':i===index?'circle-play':'circle')}<span>${i+1}. ${v}</span></button>`).join('')}</aside></div>`;
  }
  function lessonContent(i) {
    if(i===3) return `<p>Доходность описывает изменение стоимости вложения. Риск напоминает: будущий результат заранее неизвестен. Одной ожидаемой доходности недостаточно, чтобы сравнить два решения.</p><h2>Одинаковый результат, разный путь</h2><p>Представьте два учебных портфеля. Каждый вырос со 100 000 до 110 000 тенге за год. Но первый за это время снижался до 98 000, а второй до 60 000. Итоговая доходность одинакова, а колебания и переживания владельцев различаются.</p><div class="lesson-illustration"><strong>Доходность = (конечная стоимость − начальная стоимость) / начальная стоимость × 100%</strong><p>(110 000 − 100 000) / 100 000 × 100% = 10% за год, без учёта расходов и выплат.</p></div><h2>Что спросить себя</h2><p>Когда понадобятся деньги? Какое снижение вы готовы пережить без вынужденной продажи? Есть ли резерв? Ответы на эти вопросы важны до выбора инструмента.</p><h2>Самопроверка</h2><p>Может ли портфель с положительным годовым результатом быть рискованным? Объясните на примере двух портфелей выше.</p>`;
    return `<p>Начнём с вопроса, который можно проверить. Какое решение мы хотим принять, какие данные для него нужны и чего пока не знаем?</p><h2>От цели к решению</h2><p>Допустим, вы собираете 300 000 тенге на обучение через 12 месяцев. Без учёта доходности и расходов вам нужно откладывать по 25 000 тенге в месяц. Это расчёт плана накоплений, а не обещание инвестиционного результата.</p><div class="lesson-illustration"><strong>300 000 ₸ ÷ 12 месяцев = 25 000 ₸ в месяц</strong><p>Сначала определяем цель и срок. Затем проверяем, посилен ли ежемесячный взнос. И только потом обсуждаем подходящие инструменты и их риски.</p></div><h2>Проверяем ограничения</h2><p>Уточните расходы, доступность денег и возможные изменения дохода. Не подменяйте известные условия предположением о гарантированной прибыли.</p><h2>Вопрос для самопроверки</h2><p>Какие два изменения заставили бы вас пересмотреть этот план? Запишите ответ своими словами.</p>`;
  }
  function rankingsView() {
    const score=e=>rankMode==='signals'?e.success/e.forecasts*100:rankMode==='all'?e.ratings.reduce((a,b)=>a+b,0)/4:e.ratings[modes.findIndex(m=>m.id===rankMode)];
    const list=[...experts].sort((a,b)=>score(b)-score(a));
    return `<div class="page-topline"><span class="eyebrow">ЛЮДИ И РЕПУТАЦИЯ</span><span class="badge">Демо</span></div><h1>Рейтинг экспертов</h1><p class="subtitle">Опыт учеников и результаты прогнозов, каждый на своём месте.</p>${modesTabs(rankMode,'rank-tab',true)}<div class="rank-table-wrap"><table class="rank-table"><thead><tr><th>Место</th><th>Эксперт</th><th>${rankMode==='signals'?'Завершённые прогнозы':'Учеников'}</th><th>${rankMode==='signals'?'Выполнено условий':'Оценка из 5'}</th><th></th></tr></thead><tbody>${list.map((e,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td>${expertLink(e.id)}</td><td>${rankMode==='signals'?e.forecasts:e.students}</td><td>${rankMode==='signals'?`${score(e).toFixed(1)}% (${e.success}/${e.forecasts})`:rating(score(e))}</td><td><a class="icon-button" href="#expert/${e.id}" aria-label="Профиль: ${e.name}">${icon('arrow-up-right')}</a></td></tr>`).join('')}</tbody></table></div><p class="rank-context">${rankMode==='all'?'Общая оценка здесь равна среднему арифметическому четырёх оценок по направлениям.':rankMode==='signals'?'Доля прогнозов, у которых выполнено заранее заданное условие. Этот показатель не равен доходности портфеля и сам по себе не доказывает мастерство инвестора.':'Оценки относятся только к выбранному направлению.'} Все числа демонстрационные. Статистика прогнозов отделена от отзывов об обучении.</p>`;
  }
  function signalsView() {
    const labels={active:'Открыт',success:'Условие выполнено',miss:'Не выполнено'};
    const list=signals.filter(s=>signalFilter==='all'||s.status===signalFilter);
    return `${breadcrumb([['Идеи и аналитика','#mode/ideas'],['Сигналы']])}<div class="heading-row"><h1>История прогнозов</h1><span class="badge">Учебные данные</span></div><p class="subtitle">Гипотеза, срок и результат. В том числе когда прогноз не сбылся.</p><div class="tabs">${[['all','Все прогнозы'],['active','Открытые'],['success','Выполненные'],['miss','Не выполненные']].map(([id,name])=>`<button class="tab ${signalFilter===id?'active':''}" data-action="signal-filter" data-id="${id}">${name}</button>`).join('')}</div><div class="signal-grid">${list.map(s=>`<article class="signal-card"><div class="signal-heading"><div class="ticker"><span class="ticker-symbol">${s.ticker}</span><div><strong>${s.name}</strong><p>${s.ticker} · USD</p></div></div><span class="status ${s.status}">${labels[s.status]}</span></div><div class="signal-chart" aria-hidden="true">${Array.from({length:28},(_,i)=>`<span style="height:${Math.max(10,25+i*(s.status==='miss'?-.25:1.25)+Math.sin(i*2.1)*13)}px"></span>`).join('')}</div><div class="signal-values"><div><label>На старте</label><strong>$${s.start}</strong></div><div><label>Цель</label><strong>$${s.target}</strong></div><div><label>${s.status==='active'?'В сценарии':'Результат'}</label><strong>$${s.current}</strong></div></div><p class="fine-print" style="margin-bottom:15px">Срок: ${s.deadline}</p><div class="signal-bottom">${expertLink(s.expert)}<button class="text-link" data-action="signal" data-id="${s.id}">Условия ${icon('arrow-right')}</button></div></article>`).join('')}</div><p class="rank-context">Это макет журнала прогнозов: цены, графики и результаты вымышлены. Реальная запись в Solana и независимая проверка котировок не подключены.</p>`;
  }
  function settingsView() {
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Настройки</h1><div class="settings-list"><div class="setting-row"><div><h2>Оформление</h2><p>Светлая, тёмная или системная тема</p></div><div class="segmented" role="group" aria-label="Оформление">${[['light','sun','Светлая'],['dark','moon','Тёмная'],['system','monitor','Системная']].map(([id,i,t])=>`<button data-action="set-theme" data-id="${id}" class="${state.theme===id?'active':''}" title="${t}" aria-label="${t}" aria-pressed="${state.theme===id}">${icon(i)}</button>`).join('')}</div></div><div class="setting-row"><div><h2>Акцентный цвет</h2><p>Автоматически по разделу или любимый оттенок</p></div><div class="swatches">${[['auto','','По разделу'],['green','#21755a','Зелёный'],['violet','#6552a0','Фиолетовый'],['coral','#af5b43','Коралловый'],['blue','#326db6','Синий']].map(([id,color,name])=>`<button class="swatch ${id==='auto'?'auto':''} ${state.accent===id?'active':''}" style="${color?'background:'+color:''}" data-action="accent" data-id="${id}" title="${name}" aria-label="${name}" aria-pressed="${state.accent===id}">${state.accent===id?icon('check'):''}</button>`).join('')}</div></div><div class="setting-row"><div><h2>Анимация переходов</h2><p>Учитывает системную настройку уменьшения движения</p></div><label class="switch"><input type="checkbox" id="motionToggle" aria-label="Анимация переходов" ${state.motion?'checked':''}><span></span></label></div><div class="setting-row"><div><h2>Личные данные</h2><p>Имя и информация о себе</p></div><a class="icon-button" href="#profile" title="Редактировать профиль" aria-label="Редактировать профиль">${icon('arrow-right')}</a></div><div class="setting-row"><div><h2>Демонстрационные данные</h2><p>Сбросить локальные покупки, избранное и прогресс</p></div><button class="btn secondary" data-action="reset">Сбросить</button></div></div>`;
  }
  function profileView() {
    return `<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Личный профиль</h1><form class="profile-form" id="profileForm"><span class="user-avatar" style="width:64px;height:64px;font-size:20px">${esc(initials())}</span><label class="form-label">Имя и фамилия<input type="text" name="name" maxlength="60" required value="${esc(state.name)}"></label><label class="form-label">Электронная почта<input type="email" name="email" maxlength="120" value="${esc(state.email)}" placeholder="name@example.com"></label><label class="form-label">О себе<textarea name="bio" maxlength="500" placeholder="Что вам интересно изучать?">${esc(state.bio)}</textarea></label><p class="fine-print">В этом прототипе данные сохраняются только в текущем браузере. Не указывайте конфиденциальную информацию.</p><button class="btn" type="submit">${icon('check')}Сохранить изменения</button></form>`;
  }
  function render() {
    const hash=(location.hash||'#home').slice(1), [page,id,cat]=hash.split('/');
    const newRoute = hash!==routeKey;
    if (newRoute) {catalogSearch='';catalogSort='popular';freeOnly=false;expertMode='';currentLesson=null;signalFilter='all';}
    routeKey=hash;
    if(['home',''].includes(page)) mode=HOME;
    if(['mode','category'].includes(page)) mode=findMode(id);
    if(page==='product'&&findProduct(id)) mode=findMode(findProduct(id).mode);
    state.mode=mode.id;persist();
    let html;
    switch(page){
      case 'home': case '':html=overview();break;
      case 'mode':html=modeHome();break;
      case 'category':html=categoryView(cat);break;
      case 'product':html=productView(id);break;
      case 'expert':html=expertView(id);break;
      case 'learning':html=learningView();break;
      case 'lesson':html=lessonView(id);break;
      case 'rankings':html=rankingsView();break;
      case 'settings':html=settingsView();break;
      case 'profile':html=profileView();break;
      case 'saved':html=`<div class="page-topline"><span class="eyebrow">ВАШЕ ПРОСТРАНСТВО</span></div><h1>Избранное</h1><p class="subtitle" style="margin-bottom:28px">То, к чему хочется вернуться.</p>${state.saved.length?`<div class="product-grid">${products.filter(p=>state.saved.includes(p.id)).map(p=>productCard(p)).join('')}</div>`:empty('Пока здесь пусто','Отмечайте понравившиеся материалы закладкой.','bookmark')}`;break;
      default:html=empty('Страница не найдена','Вернитесь к обзору Dal.');
    }
    main.innerHTML=`<div class="page">${html}${footer()}</div>`;
    updateChrome();
    if($('#catalogSort')) $('#catalogSort').value=catalogSort;
    document.title=`Dal · ${$('h1',main)?.textContent || mode.name}`;
    closeProfile();
    if(newRoute){window.scrollTo({top:0,behavior:'instant'});if(lastNav) main.focus({preventScroll:true});}
    lastNav=hash;
  }
  function toast(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3000);}
  function openDialog(title,body,extraClass='') {
    if(modal.open) modal.close();
    lastFocus=document.activeElement;
    modal.className=extraClass;
    modal.innerHTML=`<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-button" data-action="close-modal" title="Закрыть" aria-label="Закрыть">${icon('x')}</button></div>${body}`;
    icons();modal.showModal();
  }
  function openSearch() {
    openDialog('Что хотите изучить?',`<label class="input-wrap" style="display:block">${icon('search')}<input id="globalSearch" type="search" aria-label="Поиск по Dal" placeholder="Курс, тема или имя эксперта" autofocus></label><div class="search-results" id="searchResults">${searchResults('')}</div>`);
    $('#globalSearch').focus();
  }
  function searchResults(term) {
    const q=term.toLocaleLowerCase('ru');
    const results=products.filter(p=>(p.title+' '+findExpert(p.expert).name).toLocaleLowerCase('ru').includes(q)).slice(0,7);
    return results.length?results.map(p=>`<a class="search-result" href="#product/${p.id}">${photo(p.image)}<div><strong>${p.title}</strong><small>${findExpert(p.expert).name} · ${money(p.price)}</small></div>${icon('arrow-up-right')}</a>`).join(''):'<p class="modal-text">Ничего не найдено. Попробуйте другое слово.</p>';
  }
  function buy(id) {
    const p=findProduct(id);if(!p)return;
    openDialog(p.price?'Получить доступ':'Присоединиться бесплатно',`<p class="modal-text">${p.title}</p><div class="order-line"><span>Эксперт</span><strong>${findExpert(p.expert).name}</strong></div><div class="order-line"><span>Доступ</span><strong>${p.duration}</strong></div><div class="order-line"><span>Итого</span><strong>${money(p.price)}</strong></div><div class="notice">Демонстрационная покупка. Деньги не списываются, кошелёк не подключается. Доступ появится в разделе «Моё обучение».</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-buy" data-id="${id}">${icon('check')}Открыть демодоступ</button></div>`);
  }
  function openOwned(id) {
    const p=findProduct(id);if(!p)return;
    if(!state.owned.includes(id)){buy(id);return;}
    if(p.mode==='courses') {currentLesson=null;location.hash=`#lesson/${id}`;}
    else if(p.mode==='community') openChat(id);
    else if(p.mode==='experts') openDialog('Ваше занятие',`<p class="modal-text">${p.title} · ${findExpert(p.expert).name}</p><p class="notice">Демонстрационная запись. Встреча не будет отправлена эксперту.</p><form id="bookingForm"><label class="form-label">Удобное время (Asia/Almaty)<select name="slot"><option>5 октября, 18:00</option><option>6 октября, 12:00</option><option>7 октября, 19:00</option></select></label><button type="submit" class="btn wide" style="margin-top:20px">Выбрать время</button></form>`);
    else openDialog(p.title,`<article class="readable"><span class="badge">Учебный материал</span><h2>Сначала вопрос, затем данные</h2><p>Хороший анализ начинается с проверяемого вопроса. Например: за счёт чего компания зарабатывает и что может помешать ей делать это в будущем?</p><h2>Три направления проверки</h2><p>Изучите динамику выручки, денежный поток и долговую нагрузку. Для каждого числа запишите период, единицы и первичный источник.</p><h2>Граница вывода</h2><p>Даже качественный бизнес может быть дорогой инвестицией. Один показатель не заменяет оценку стоимости, риска и альтернатив.</p></article>`);
  }
  function openChat(id) {
    const p=findProduct(id);
    const messages=state.chats.filter(m=>m.product===id);
    openDialog(p.title,`<p class="fine-print">Локальный демочат. Сообщения не отправляются другим людям.</p><div class="chat-messages" id="chatMessages"><div class="chat-message"><strong>${findExpert(p.expert).name}</strong>Добро пожаловать! Какой вопрос об инвестициях вы сейчас изучаете?</div>${messages.map(m=>`<div class="chat-message self"><strong>${esc(state.name)}</strong>${esc(m.text)}</div>`).join('')}</div><form class="chat-form" id="chatForm" data-product="${id}"><input type="text" name="message" required maxlength="1000" aria-label="Сообщение" placeholder="Ваше сообщение"><button class="btn" type="submit" title="Отправить" aria-label="Отправить">${icon('send')}</button></form>`);
    $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
  }
  function closeProfile() {$('#profileMenu').hidden=true;$('.user-trigger').setAttribute('aria-expanded','false');}
  const inProgress = () => {
    const owned = products.filter(p => p.mode==='courses' && state.owned.includes(p.id));
    return owned.find(p => getProgress(p) < p.lessons) || owned[0];
  };
  function toggleProfile() {
    const p=$('#profileMenu');
    if(!p.hidden){closeProfile();return;}
    const page=(location.hash||'#home').slice(1).split('/')[0];
    const link=(href,ic,text,extra='')=>`<a href="#${href}" class="${page===href||(href==='learning'&&page==='lesson')?'active':''}">${icon(ic)}<span>${text}</span>${extra}</a>`;
    const c=inProgress();
    let progressBlock='';
    if(c){
      const done=getProgress(c),percent=Math.round(done/c.lessons*100);
      progressBlock=`<a class="popover-progress" href="#lesson/${c.id}"><span class="continue-label"><span class="live-dot"></span>${done===c.lessons?'Пройдено':'В процессе'}</span><strong>${esc(c.title)}</strong><span class="progress"><span style="width:${percent}%"></span></span><span class="side-progress-meta"><span>${done} из ${c.lessons} уроков</span><span>${percent}%</span></span></a>`;
    }
    p.innerHTML=`<div class="popover-person"><span class="user-avatar">${esc(initials())}</span><div><strong>${esc(state.name)}</strong><p>Личный кабинет ученика</p></div></div>${progressBlock}<div class="popover-label">ВАШЕ ПРОСТРАНСТВО</div>${link('learning','book-open','Моё обучение',`<span class="nav-count">${state.owned.length}</span>`)}${link('saved','bookmark','Избранное',`<span class="nav-count">${state.saved.length}</span>`)}${link('rankings','chart-no-axes-column-increasing','Рейтинг экспертов')}<div class="popover-separator"></div>${link('profile','circle-user-round','Мой профиль')}${link('settings','settings-2','Настройки')}`;
    p.hidden=false;$('.user-trigger').setAttribute('aria-expanded','true');icons();$('a',p).focus();
  }
  function saveProduct(id) {
    if(!findProduct(id))return;
    const had=state.saved.includes(id);state.saved=had?state.saved.filter(v=>v!==id):[...state.saved,id];persist();
    if(location.hash==='#saved') render();
    else {
      $$(`[data-action="save"][data-id="${id}"]`).forEach(b=>{b.classList.toggle('saved',!had);b.setAttribute('aria-pressed',String(!had));b.setAttribute('aria-label',had?'В избранное':'Убрать из избранного');b.title=had?'В избранное':'Убрать из избранного';if(!b.classList.contains('icon-button')) b.innerHTML=icon('bookmark')+(had?'В избранное':'В избранном');});
      icons();
    }
    toast(had?'Убрано из избранного':'Добавлено в избранное');
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('.skip-link')){event.preventDefault();main.focus();return;}
    const button=event.target.closest('[data-action]');
    if(!event.target.closest('#profileMenu,.user-trigger'))closeProfile();
    const link=event.target.closest('a[href^="#"]');
    if(link&&modal.open)modal.close();
    if(!button)return;
    const {action,id}=button.dataset;
    switch(action){
      case 'mode':selectMode(id);break;
      case 'drum-prev':showPreview(drumItems.indexOf(mode)-1);selectMode(drumItems[preview].id);break;
      case 'drum-next':showPreview(drumItems.indexOf(mode)+1);selectMode(drumItems[preview].id);break;
      case 'drum-select':selectMode(drumItems[preview].id);break;
      case 'search':openSearch();break;
      case 'profile-menu':toggleProfile();break;
      case 'theme':state.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';persist();updateChrome();if(location.hash==='#settings')render();break;
      case 'set-theme':state.theme=id;persist();render();break;
      case 'accent':state.accent=id;persist();render();break;
      case 'save':saveProduct(id);break;
      case 'buy':buy(id);break;
      case 'close-modal':modal.close();break;
      case 'confirm-buy':if(!state.owned.includes(id))state.owned.push(id);state.progress[id]=0;persist();modal.close();render();toast('Демодоступ открыт. Материал в «Моём обучении».');break;
      case 'open-owned':openOwned(id);break;
      case 'library-tab':libraryMode=id;render();break;
      case 'expert-tab':expertMode=id;render();break;
      case 'rank-tab':rankMode=id;render();break;
      case 'signal-filter':signalFilter=id;render();break;
      case 'lesson':currentLesson=Number(button.dataset.index);render();break;
      case 'complete-lesson':{
        const p=findProduct(id),done=getProgress(p);
        if(currentLesson>done){toast('Сначала завершите предыдущие уроки.');break;}
        if(currentLesson===done){state.progress[id]=Math.min(done+1,p.lessons);persist();}
        if(currentLesson<p.lessons-1)currentLesson++;render();toast(getProgress(p)===p.lessons?'Поздравляем! Программа завершена.':'Прогресс сохранён');break;
      }
      case 'signal':{const s=signals.find(s=>s.id===id);openDialog(`${s.ticker}: условия прогноза`,`<p class="modal-text">${s.note}</p><div class="order-line"><span>Автор</span><strong>${findExpert(s.expert).name}</strong></div><div class="order-line"><span>Опубликован</span><strong>${s.date}</strong></div><div class="order-line"><span>Проверка условия</span><strong>${s.deadline}</strong></div><p class="notice">Это демонстрационные данные, а не торговый сигнал. Запись в блокчейне не выполнялась.</p>`);break;}
      case 'review':{
        openDialog('Ваш отзыв',`<form id="reviewForm" data-product="${id}"><label class="form-label">Оценка<select name="rating"><option value="5">5 · Отлично</option><option value="4">4 · Хорошо</option><option value="3">3 · Нормально</option><option value="2">2 · Ниже ожиданий</option><option value="1">1 · Не понравилось</option></select></label><label class="form-label" style="margin-top:15px">Что было полезно?<textarea name="text" required minlength="10" maxlength="1500" rows="5"></textarea></label><p class="fine-print" style="margin-top:15px">Отзыв сохранится только в вашем браузере. В общую демонстрационную оценку не включается.</p><button class="btn wide" style="margin-top:20px" type="submit">Сохранить отзыв</button></form>`);break;
      }
      case 'reset':openDialog('Сбросить данные?',`<p class="modal-text">Локальные покупки, отзывы, избранное, сообщения и прогресс будут удалены. Вернётся исходный демонстрационный набор.</p><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Отмена</button><button class="btn" data-action="confirm-reset">Сбросить</button></div>`);break;
      case 'confirm-reset':state=defaults();mode=findDrum(state.mode);persist();modal.close();render();toast('Демонстрационные данные восстановлены');break;
    }
  });
  document.addEventListener('input',event=>{
    if(event.target.id==='catalogSearch'){catalogSearch=event.target.value;refreshCatalog();}
    if(event.target.id==='globalSearch'){$('#searchResults').innerHTML=searchResults(event.target.value);icons();}
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='catalogSort'){catalogSort=event.target.value;refreshCatalog();}
    if(event.target.id==='freeOnly'){freeOnly=event.target.checked;refreshCatalog();}
    if(event.target.id==='motionToggle'){state.motion=event.target.checked;persist();applyAppearance();icons();}
  });
  document.addEventListener('submit',event=>{
    const form=event.target;
    if(!['profileForm','chatForm','bookingForm','reviewForm'].includes(form.id))return;
    event.preventDefault();const data=new FormData(form);
    if(form.id==='profileForm'){
      const name=String(data.get('name')).trim();if(!name){toast('Укажите имя');return;}
      state.name=name;state.email=String(data.get('email')).trim();state.bio=String(data.get('bio')).trim();persist();render();toast('Профиль сохранён');
    }
    if(form.id==='chatForm'){
      const message=String(data.get('message')).trim();if(!message)return;
      state.chats.push({product:form.dataset.product,text:message});state.chats=state.chats.slice(-100);persist();
      const item=document.createElement('div');item.className='chat-message self';item.innerHTML=`<strong>${esc(state.name)}</strong>${esc(message)}`;$('#chatMessages').append(item);form.reset();$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
    }
    if(form.id==='bookingForm'){modal.close();toast(`Выбрано: ${data.get('slot')}. Демозапись.`);}
    if(form.id==='reviewForm'){
      const text=String(data.get('text')).trim();if(text.length<10){toast('Напишите хотя бы 10 символов');return;}
      state.reviews.push({product:form.dataset.product,name:state.name,text,rating:Number(data.get('rating'))});persist();modal.close();render();toast('Отзыв сохранён в демоверсии');
    }
  });
  modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
  modal.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeProfile();
    if(event.target.closest('.tabs[role="tablist"]')&&['ArrowRight','ArrowLeft'].includes(event.key)){
      const tabs=$$('[role="tab"]',event.target.closest('.tabs')),index=tabs.indexOf(event.target);
      event.preventDefault();const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();
    }
  });
  const drum=$('#drum');let pointerX=null,lastMove=0,touchX=null,suppressClick=false;
  drum.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')pointerX=e.clientX;});
  drum.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||pointerX===null)return;
    const delta=e.clientX-pointerX;
    if(Math.abs(delta)>42&&performance.now()-lastMove>180){showPreview(preview+(delta>0?1:-1));pointerX=e.clientX;lastMove=performance.now();}
  });
  drum.addEventListener('pointerleave',()=>{pointerX=null;showPreview(drumItems.indexOf(mode),true);});
  drum.addEventListener('wheel',e=>{e.preventDefault();if(performance.now()-lastMove<250)return;showPreview(preview+(e.deltaY+e.deltaX>0?1:-1));lastMove=performance.now();},{passive:false});
  drum.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();showPreview(preview+(e.key==='ArrowRight'?1:-1));}if(e.key==='Escape')showPreview(drumItems.indexOf(mode));});
  drum.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;},{passive:true});
  drum.addEventListener('touchend',e=>{if(touchX===null)return;const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>35){suppressClick=true;showPreview(preview+(dx<0?1:-1));selectMode(drumItems[preview].id);setTimeout(()=>suppressClick=false,350);}touchX=null;},{passive:true});
  drum.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation();}},{capture:true});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(state.theme==='system')updateChrome();});
  window.addEventListener('hashchange',render);
  render();
})();
