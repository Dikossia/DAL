import type { App } from '../app.ts';
import { HttpError } from '../http.ts';
import { parse, str, oneOf } from '../validate.ts';
import { hashPassword, verifyPassword, createSession, dropSession, tokenFrom } from '../auth.ts';
import { newId, nowIso } from '../util.ts';
import { RULES } from '../rules.ts';
import { randomInt, createHash } from 'node:crypto';
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

  // ---------- Account recovery ----------
  // The built-in wallet is tied to the account, not to the password: after a reset the wallet,
  // certificates and records stay the same. In production the code is emailed; in the demo it is shown on screen.
  const codeHash = (code: string) => createHash('sha256').update(`dal-reset|${code}`).digest('hex');
  router.add({
    method: 'POST', path: '/auth/recover', group: 'Account', summary: 'Start account recovery: a one-time code is sent to the email (the demo returns it in the response because email is not connected).',
    body: '{ email }',
    handler: ({ body }) => {
      const b = parse<{ email: string }>(body, { email: str({ max: 120 }) });
      const key = `recover:${b.email.toLowerCase()}`;
      app.loginLimiter.check(key); app.loginLimiter.fail(key); // at most a few codes per window
      const u = db.get('SELECT id FROM users WHERE email = ?', b.email.toLowerCase());
      const out: Record<string, unknown> = { sent: true, expiresInMinutes: RULES.resetCodeMinutes };
      if (u) {
        const code = String(randomInt(0, 1e6)).padStart(6, '0'), now = new Date();
        db.run('INSERT INTO password_resets (id, user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', newId(), u.id, codeHash(code), now.toISOString(), new Date(now.getTime() + RULES.resetCodeMinutes * 60e3).toISOString());
        if (app.exposeRecoveryCodes) out.demoCode = code;
      }
      return out; // same answer whether or not the email exists
    }
  });

  router.add({
    method: 'POST', path: '/auth/recover/confirm', group: 'Account', summary: 'Finish recovery with the code and a new password. Signs out every other device; the wallet and certificates are kept.',
    body: '{ email, code, password (8+ chars) }',
    handler: ({ body }) => {
      const b = parse<{ email: string; code: string; password: string }>(body, { email: str({ max: 120 }), code: str({ pattern: /^\d{6}$/, patternMsg: 'Код — 6 цифр' }), password: str({ min: 8, max: 200, trim: false }) });
      const u = db.get('SELECT id FROM users WHERE email = ?', b.email.toLowerCase());
      const r = u && db.get(`SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1`, u.id, nowIso());
      if (!u || !r || r.attempts >= RULES.resetAttempts) throw new HttpError(400, 'bad_code', 'Код неверный или устарел. Запросите новый.');
      if (r.code_hash !== codeHash(b.code)) {
        db.run('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', r.id);
        throw new HttpError(400, 'bad_code', 'Код неверный или устарел. Запросите новый.');
      }
      db.tx(() => {
        db.run('UPDATE password_resets SET used_at = ? WHERE id = ?', nowIso(), r.id);
        db.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(b.password), u.id);
        db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
      });
      app.loginLimiter.reset(b.email.toLowerCase());
      return { ...createSession(db, u.id), user: me(u.id) };
    }
  });
}
