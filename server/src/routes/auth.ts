import type { App } from '../app.ts';
import { HttpError } from '../http.ts';
import { parse, str, oneOf } from '../validate.ts';
import { hashPassword, verifyPassword, createSession, dropSession, tokenFrom } from '../auth.ts';
import { newId, nowIso } from '../util.ts';

export function registerAuth(app: App) {
  const { db, router } = app;
  const me = (id: string) => {
    const u = db.get('SELECT id, email, name, role, created_at FROM users WHERE id = ?', id)!;
    const p = u.role === 'expert' ? db.get('SELECT verified_at FROM expert_profiles WHERE user_id = ?', id) : null;
    return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at, ...(p ? { verified: !!p.verified_at } : {}) };
  };

  router.add({
    method: 'POST', path: '/auth/register', group: 'Вход', summary: 'Регистрация ученика или эксперта. Сразу возвращает токен.',
    body: '{ email, password (от 8 символов), name, role: "student" | "expert" }',
    handler: ({ body }) => {
      const b = parse<{ email: string; password: string; name: string; role: 'student' | 'expert' }>(body, {
        email: str({ max: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Некорректный адрес почты' }),
        password: str({ min: 8, max: 200, trim: false }),
        name: str({ min: 2, max: 60 }),
        role: oneOf(['student', 'expert'] as const)
      });
      const id = newId();
      db.tx(() => {
        db.run('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, b.email.toLowerCase(), hashPassword(b.password), b.name, b.role, nowIso());
        if (b.role === 'expert') db.run('INSERT INTO expert_profiles (user_id) VALUES (?)', id);
      });
      return { ...createSession(db, id), user: me(id) };
    }
  });

  router.add({
    method: 'POST', path: '/auth/login', group: 'Вход', summary: 'Вход по почте и паролю. Возвращает токен для заголовка Authorization: Bearer <токен>.',
    body: '{ email, password }',
    handler: ({ body }) => {
      const b = parse<{ email: string; password: string }>(body, { email: str({ max: 120 }), password: str({ max: 200, trim: false }) });
      const key = b.email.toLowerCase();
      app.loginLimiter.check(key);
      const u = db.get('SELECT id, password_hash FROM users WHERE email = ?', key);
      if (!u || !verifyPassword(b.password, u.password_hash)) {
        app.loginLimiter.fail(key);
        throw new HttpError(401, 'bad_credentials', 'Неверная почта или пароль');
      }
      app.loginLimiter.reset(key);
      return { ...createSession(db, u.id), user: me(u.id) };
    }
  });

  router.add({
    method: 'POST', path: '/auth/logout', group: 'Вход', summary: 'Выход: токен перестаёт действовать.', auth: 'user',
    handler: ({ req }) => { const t = tokenFrom(req, new URL('http://x')); if (t) dropSession(db, t); }
  });

  router.add({
    method: 'GET', path: '/me', group: 'Вход', summary: 'Текущий пользователь.', auth: 'user',
    handler: ({ user }) => me(user!.id)
  });

  router.add({
    method: 'PATCH', path: '/me', group: 'Вход', summary: 'Изменить своё имя (ученик или модератор). Эксперт меняет имя через запрос на модерацию.', auth: ['student', 'moderator'],
    body: '{ name }',
    handler: ({ user, body }) => {
      const b = parse<{ name: string }>(body, { name: str({ min: 2, max: 60 }) });
      db.run('UPDATE users SET name = ? WHERE id = ?', b.name, user!.id);
      return me(user!.id);
    }
  });
}
