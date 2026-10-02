// Клиент API Dal: общий для сайта учеников, Dal Studio и страницы входа.
// Сайты открываются с того же адреса, что и сервер (http://localhost:4000), поэтому пути относительные.
window.DalAPI = (() => {
  'use strict';
  const KEY = 'dal-token';
  let token = null;
  try { token = localStorage.getItem(KEY); } catch (_) { /* хранилище недоступно — вход будет до закрытия вкладки */ }

  class ApiError extends Error {
    constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
  }
  const OFFLINE = 'Сервер не отвечает. Запустите его: npm start в папке server.';

  function setToken(t) {
    token = t || null;
    try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch (_) { /* ничего */ }
  }

  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
    } catch (_) { throw new ApiError(0, 'offline', OFFLINE); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token) setToken(null);
      throw new ApiError(res.status, data?.error?.code || 'error', data?.error?.message || 'Ошибка сервера', data?.error?.details);
    }
    return data;
  }

  // Загрузка файла телом запроса с настоящим прогрессом. Возвращает { promise, abort }.
  function upload(path, file, { type, headers = {}, onProgress } = {}) {
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.open('PUT', path);
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', type || file.type || 'application/octet-stream');
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => {
        let d = null; try { d = JSON.parse(xhr.responseText); } catch (_) { /* не JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else reject(new ApiError(xhr.status, d?.error?.code || 'error', d?.error?.message || 'Не удалось загрузить файл', d?.error?.details));
      };
      xhr.onerror = () => reject(new ApiError(0, 'offline', 'Связь с сервером прервалась во время загрузки'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Загрузка отменена'));
      xhr.send(file);
    });
    return { promise, abort: () => xhr.abort() };
  }

  let meCache = null;
  async function me(force = false) {
    if (!token) return null;
    if (meCache && !force) return meCache;
    try { meCache = await request('GET', '/me'); }
    catch (e) { if (e.status === 401) { meCache = null; return null; } throw e; }
    return meCache;
  }

  return {
    ApiError,
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b ?? {}),
    put: (p, b) => request('PUT', p, b ?? {}),
    patch: (p, b) => request('PATCH', p, b ?? {}),
    del: p => request('DELETE', p),
    upload,
    me,
    hasToken: () => !!token,
    setToken: t => { meCache = null; setToken(t); },
    async logout() { try { await request('POST', '/auth/logout'); } catch (_) { /* токен уже недействителен */ } meCache = null; setToken(null); },
    // Тег <video> не умеет передавать заголовок, поэтому токен добавляется в адрес.
    mediaUrl: p => p && token ? `${p}${p.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : p,
    loginUrl: (next = location.pathname + location.hash) => `/login.html?next=${encodeURIComponent(next)}`,
    homeFor: role => role === 'student' ? '/' : role === 'moderator' ? '/studio.html#moderation' : '/studio.html'
  };
})();
