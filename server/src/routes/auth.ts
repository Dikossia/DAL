import type { App } from '../app.ts';
import { HttpError } from '../http.ts';
import { parse, str, oneOf } from '../validate.ts';
import { hashPassword, verifyPassword, createSession, dropSession, tokenFrom } from '../auth.ts';
import { newId, nowIso } from '../util.ts';
import { avatarUrl } from '../experts.ts';

export function registerAuth(app: App) {
  const { db, router } = app;
  const me = (id: string) => {
    const u = db.get('SELECT id, email, name, role, created_at, avatar_file FROM users WHERE id = ?', id)!;
    const p = u.role === 'expert' ? db.get('SELECT verified_at, avatar FROM expert_profiles WHERE user_id = ?', id) : null;
    return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at, avatarUrl: avatarUrl({ avatar_file: u.avatar_file, avatar: p?.avatar }), ...(p ? { verified: !!p.verified_at } : {}) };
  };

  router.add({
    method: 'POST', path: '/auth/register', group: 'Account', summary: 'Register a student or expert. Returns a token immediately.',
    body: '{ email, password (8+ chars), name, role: "student" | "expert" }',
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
    method: 'POST', path: '/auth/login', group: 'Account', summary: 'Sign in with email and password. Returns a token for the Authorization: Bearer <token> header.',
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
    method: 'POST', path: '/auth/logout', group: 'Account', summary: 'Sign out: the token stops working.', auth: 'user',
    handler: ({ req }) => { const t = tokenFrom(req, new URL('http://x')); if (t) dropSession(db, t); }
  });

  router.add({
    method: 'GET', path: '/me', group: 'Account', summary: 'Current user.', auth: 'user',
    handler: ({ user }) => me(user!.id)
  });

  router.add({
    method: 'PATCH', path: '/me', group: 'Account', summary: 'Change own name (student or moderator). Experts change their name via a moderation request.', auth: ['student', 'moderator'],
    body: '{ name }',
    handler: ({ user, body }) => {
      const b = parse<{ name: string }>(body, { name: str({ min: 2, max: 60 }) });
      db.run('UPDATE users SET name = ? WHERE id = ?', b.name, user!.id);
      return me(user!.id);
    }
  });
}
