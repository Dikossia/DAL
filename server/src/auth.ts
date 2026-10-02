import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import type http from 'node:http';
import type { DB } from './db.ts';
import type { User } from './http.ts';
import { HttpError } from './http.ts';
import { RULES } from './rules.ts';

const N = 16384, R = 8, P = 1, LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// В базе хранится только хеш токена: утечка базы не даёт войти от чужого имени.
export function createSession(db: DB, userId: string): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const now = new Date(), expires = new Date(now.getTime() + RULES.sessionDays * 864e5);
  db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires.toISOString() };
}

export function dropSession(db: DB, token: string) {
  db.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export function tokenFrom(req: http.IncomingMessage, url: URL): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7).trim();
  // Тег <video> не умеет передавать заголовки, поэтому для просмотра видео токен можно передать в адресе.
  if ((req.method === 'GET' || req.method === 'HEAD') && url.searchParams.get('token')) return url.searchParams.get('token');
  return null;
}

export function userFromToken(db: DB, token: string | null): User | null {
  if (!token) return null;
  const row = db.get<User>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`, sha256(token), new Date().toISOString());
  return row ?? null;
}

// Ограничение подбора пароля: не больше N неудачных попыток за окно.
export function createLoginLimiter() {
  const fails = new Map<string, { count: number; until: number }>();
  return {
    check(key: string) {
      const f = fails.get(key);
      if (f && f.until > Date.now() && f.count >= RULES.loginAttempts)
        throw new HttpError(429, 'too_many_attempts', `Слишком много попыток входа. Попробуйте через ${RULES.loginWindowMin} минут.`);
    },
    fail(key: string) {
      const f = fails.get(key);
      if (!f || f.until < Date.now()) fails.set(key, { count: 1, until: Date.now() + RULES.loginWindowMin * 60e3 });
      else f.count++;
    },
    reset(key: string) { fails.delete(key); }
  };
}
