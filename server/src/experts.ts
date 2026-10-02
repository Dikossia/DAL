import type { DB, Row } from './db.ts';
import { MODES } from './rules.ts';

// Фото: загруженное пользователем или из библиотеки демо-портретов.
export const avatarUrl = (row: { avatar_file?: string | null; avatar?: string | null }): string | null =>
  row.avatar_file ? `/media/avatars/${row.avatar_file}` : row.avatar ? `/assets/${row.avatar}.jpg` : null;

export const expertBrief = (db: DB, id: string) => {
  const r = db.get('SELECT u.id, u.name, u.avatar_file, p.avatar FROM users u LEFT JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?', id)!;
  return { id: r.id, name: r.name, avatarUrl: avatarUrl(r) };
};

const round2 = (n: number | null) => n == null ? null : Math.round(n * 100) / 100;

// Рейтинг учителя в каждом режиме — по отзывам учеников; общий — среднее арифметическое рейтингов режимов (как в схеме).
export function expertRatings(db: DB, id: string) {
  const courses = db.get(`SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.hidden = 0`, id)!;
  const byMode: Record<string, { value: number | null; reviews: number }> = { courses: { value: round2(courses.avg), reviews: courses.n } };
  for (const m of MODES.slice(1)) {
    const r = db.get(`SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE p.expert_id = ? AND p.mode = ? AND r.hidden = 0`, id, m)!;
    byMode[m] = { value: round2(r.avg), reviews: r.n };
  }
  const rated = Object.values(byMode).filter(x => x.value != null).map(x => x.value as number);
  return { byMode, overall: rated.length ? round2(rated.reduce((a, b) => a + b, 0) / rated.length) : null, reviews: Object.values(byMode).reduce((a, x) => a + x.reviews, 0) };
}

export function expertStudents(db: DB, id: string): number {
  return db.get(
    `SELECT COUNT(DISTINCT user_id) AS n FROM (
       SELECT e.user_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'active'
       UNION SELECT pp.user_id FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE p.expert_id = ? AND pp.status = 'active')`, id, id)!.n as number;
}

export function forecastStats(db: DB, id: string) {
  const f = db.get(`SELECT SUM(status = 'success') AS ok, SUM(status <> 'active') AS done, SUM(status = 'active') AS open FROM forecasts WHERE expert_id = ?`, id)!;
  return { open: f.open || 0, done: f.done || 0, success: f.ok || 0, successRate: f.done ? Math.round((f.ok / f.done) * 1000) / 10 : null };
}

export function expertPublic(db: DB, row: Row) {
  const ratings = expertRatings(db, row.id);
  return {
    id: row.id, name: row.name, specialization: row.specialization, bio: row.bio, experience: row.experience,
    achievements: JSON.parse(row.achievements || '[]'), socials: JSON.parse(row.socials || '{}'),
    avatarUrl: avatarUrl(row), verified: !!row.verified_at,
    students: expertStudents(db, row.id),
    rating: ratings.overall, reviews: ratings.reviews, ratings: ratings.byMode,
    forecasts: forecastStats(db, row.id)
  };
}
