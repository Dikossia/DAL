(() => {
  'use strict';
  const api = window.DalAPI;
  const $ = (s, r = document) => r.querySelector(s);
  const icon = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const params = new URLSearchParams(location.search);
  const ROLE = { student: 'ученик', expert: 'эксперт', moderator: 'модератор' };
  const DEMO = [['student@dal.local', 'Ученик', 'Дарын Асылбек'], ['aliya@dal.local', 'Эксперт', 'Алия Нурланова'], ['moderator@dal.local', 'Модератор', 'Модератор Dal']];
  let tab = params.get('mode') === 'register' ? 'register' : 'login', busy = false;

  // Theme: from the site settings, otherwise follow the system.
  let theme = 'system';
  try { theme = JSON.parse(localStorage.getItem('dal-live-prefs') || '{}').theme || 'system'; } catch (_) { /* по умолчанию */ }
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.setProperty('--accent', dark ? '#9cc9cc' : '#2f5d62');
  document.documentElement.style.setProperty('--soft', dark ? 'color-mix(in srgb, #9cc9cc 12%, #1d2420)' : 'color-mix(in srgb, #2f5d62 8%, white)');

  // Where to go after sign-in: only pages on this same site.
  const next = role => {
    const n = params.get('next');
    return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : api.homeFor(role);
  };

  const field = (name, label, type, extra = '') => `<label class="form-label">${label}<input type="${type}" name="${name}" id="f-${name}" ${extra}><span class="field-error" id="err-${name}" hidden></span></label>`;

  function tabs() {
    return `<div class="auth-tabs" role="tablist" aria-label="Вход или регистрация">${[['login', 'Вход'], ['register', 'Регистрация']].map(([id, t]) => `<button role="tab" type="button" aria-selected="${tab === id}" class="${tab === id ? 'active' : ''}" data-tab="${id}">${t}</button>`).join('')}</div>`;
  }

  function loginForm() {
    return `${tabs()}<h2 id="authTitle">С возвращением</h2>
      <form id="authForm" novalidate>
        ${field('email', 'Электронная почта', 'email', 'autocomplete="email" required maxlength="120" placeholder="name@example.com"')}
        <label class="form-label">Пароль<span class="password-wrap"><input type="password" name="password" id="f-password" autocomplete="current-password" required maxlength="200"><button type="button" class="icon-button" data-toggle-password title="Показать пароль" aria-label="Показать пароль">${icon('eye')}</button></span><span class="field-error" id="err-password" hidden></span></label>
        <div class="form-error" id="formError" role="alert" hidden></div>
        <button class="btn wide" type="submit">${icon('log-in')}Войти</button>
      </form>
      <details class="demo-accounts"><summary>${icon('key-round')}Демо-аккаунты</summary><p>Пароль у всех: <code>dal-demo-2026</code></p>${DEMO.map(([e, r, n]) => `<button type="button" class="demo-account" data-fill="${e}"><span><strong>${r}</strong>${n}</span><code>${e}</code></button>`).join('')}</details>`;
  }

  function registerForm() {
    return `${tabs()}<h2 id="authTitle">Создать аккаунт</h2>
      <form id="authForm" novalidate>
        <fieldset class="role-choice"><legend>Кто вы на Dal</legend>
          <label class="role-option"><input type="radio" name="role" value="student" checked><span>${icon('book-open')}<strong>Я учусь</strong><small>Курсы, прогресс и отзывы</small></span></label>
          <label class="role-option"><input type="radio" name="role" value="expert"><span>${icon('clapperboard')}<strong>Я эксперт</strong><small>Свои курсы с видео и прогнозы</small></span></label>
        </fieldset>
        <p class="notice role-note" id="expertNote" hidden>${icon('info')}Курс можно подготовить сразу. Продавать курсы и публиковать прогнозы можно после того, как модератор подтвердит вашу личность.</p>
        ${field('name', 'Имя и фамилия', 'text', 'autocomplete="name" required minlength="2" maxlength="60"')}
        ${field('email', 'Электронная почта', 'email', 'autocomplete="email" required maxlength="120" placeholder="name@example.com"')}
        <label class="form-label">Пароль<span class="password-wrap"><input type="password" name="password" id="f-password" autocomplete="new-password" required minlength="8" maxlength="200"><button type="button" class="icon-button" data-toggle-password title="Показать пароль" aria-label="Показать пароль">${icon('eye')}</button></span><span class="field-hint">Не короче 8 символов</span><span class="field-error" id="err-password" hidden></span></label>
        <div class="form-error" id="formError" role="alert" hidden></div>
        <button class="btn wide" type="submit">${icon('user-plus')}Создать аккаунт</button>
      </form>`;
  }

  function signedIn(user) {
    return `<h2 id="authTitle">Вы уже вошли</h2>
      <div class="signed-in"><span class="user-avatar">${esc(user.name.split(' ').map(s => s[0]).slice(0, 2).join(''))}</span><span><strong>${esc(user.name)}</strong><small>${esc(user.email)} · ${ROLE[user.role]}</small></span></div>
      <a class="btn wide" href="${esc(next(user.role))}">${icon('arrow-right')}Продолжить</a>
      <button class="btn secondary wide" type="button" data-logout>${icon('log-out')}Выйти и войти под другим аккаунтом</button>`;
  }

  function render(html) { $('#authBody').innerHTML = html; icons(); }
  function show() { render(tab === 'login' ? loginForm() : registerForm()); $('#authForm input:not([type=radio])')?.focus(); }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach(e => { e.hidden = true; e.textContent = ''; });
    document.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    const fe = $('#formError'); fe.hidden = true; fe.textContent = '';
  }
  function showError(err) {
    if (err.details && typeof err.details === 'object' && !Array.isArray(err.details)) {
      for (const [k, msg] of Object.entries(err.details)) {
        const box = $(`#err-${k}`), input = $(`#f-${k}`);
        if (box) { box.textContent = msg; box.hidden = false; }
        input?.setAttribute('aria-invalid', 'true');
      }
      $('[aria-invalid="true"]')?.focus();
      return;
    }
    const fe = $('#formError'); fe.textContent = err.message; fe.hidden = false;
  }

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; show(); return; }
    const fill = e.target.closest('[data-fill]');
    if (fill) { $('#f-email').value = fill.dataset.fill; $('#f-password').value = 'dal-demo-2026'; $('#authForm button[type=submit]').focus(); return; }
    const eye = e.target.closest('[data-toggle-password]');
    if (eye) {
      const input = $('#f-password'), shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      eye.innerHTML = icon(shown ? 'eye' : 'eye-off'); eye.title = shown ? 'Показать пароль' : 'Скрыть пароль'; eye.setAttribute('aria-label', eye.title); icons();
      return;
    }
    if (e.target.closest('[data-logout]')) { await api.logout(); tab = 'login'; show(); }
  });

  document.addEventListener('change', e => {
    if (e.target.name === 'role') $('#expertNote').hidden = e.target.value !== 'expert';
  });

  document.addEventListener('submit', async e => {
    if (e.target.id !== 'authForm') return;
    e.preventDefault();
    if (busy) return;
    clearErrors();
    const fd = new FormData(e.target), btn = $('#authForm button[type=submit]');
    const body = tab === 'login'
      ? { email: String(fd.get('email') || '').trim(), password: String(fd.get('password') || '') }
      : { name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim(), password: String(fd.get('password') || ''), role: fd.get('role') };
    busy = true; btn.disabled = true;
    try {
      const res = await api.post(tab === 'login' ? '/auth/login' : '/auth/register', body);
      api.setToken(res.token);
      location.href = next(res.user.role);
    } catch (err) {
      showError(err);
      btn.disabled = false; busy = false;
    }
  });

  (async () => {
    try {
      const user = await api.me();
      if (user) render(signedIn(user)); else show();
    } catch (err) { show(); $('#formError').textContent = err.message; $('#formError').hidden = false; }
  })();
})();
