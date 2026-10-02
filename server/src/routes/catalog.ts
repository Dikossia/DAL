import path from 'node:path';
import type { App } from '../app.ts';
import { notFound, sendFile } from '../http.ts';
import { CATEGORIES } from '../rules.ts';
import { courseCard, structure, getCourse } from '../courses.ts';

// Публичная часть: то, что видно без входа.
export function registerCatalog(app: App) {
  const { db, router } = app;

  const expertStats = (id: string) => {
    const f = db.get(`SELECT SUM(status = 'success') AS ok, SUM(status <> 'active') AS done, SUM(status = 'active') AS open FROM forecasts WHERE expert_id = ?`, id)!;
    const s = db.get(`SELECT COUNT(DISTINCT e.user_id) AS n FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'active'`, id)!;
    const r = db.get(`SELECT AVG(r.rating) AS avg, COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.hidden = 0`, id)!;
    return {
      students: s.n,
      rating: r.avg ? Math.round(r.avg * 100) / 100 : null,
      reviews: r.n,
      forecasts: { open: f.open || 0, done: f.done || 0, success: f.ok || 0, successRate: f.done ? Math.round((f.ok / f.done) * 1000) / 10 : null }
    };
  };
  const expertPublic = (row: any) => ({
    id: row.id, name: row.name, specialization: row.specialization, bio: row.bio, experience: row.experience,
    achievements: JSON.parse(row.achievements || '[]'), avatarUrl: row.avatar ? `/assets/${row.avatar}.jpg` : null,
    verified: !!row.verified_at, ...expertStats(row.id)
  });
  const forecastPublic = (f: any) => ({
    id: f.id, ticker: f.ticker, name: f.name, direction: f.direction, startPrice: f.start_price, targetPrice: f.target_price,
    deadline: f.deadline, rationale: f.rationale, status: f.status, resultPrice: f.result_price, publishedAt: f.published_at, resolvedAt: f.resolved_at,
    expert: { id: f.expert_id, name: f.expert_name },
    comments: db.all('SELECT text, created_at AS createdAt FROM forecast_comments WHERE forecast_id = ? ORDER BY created_at', f.id)
  });

  router.add({
    method: 'GET', path: '/health', group: 'Служебное', summary: 'Проверка, что сервер работает.',
    handler: () => ({ ok: true, time: new Date().toISOString() })
  });

  router.add({
    method: 'GET', path: '/catalog/courses', group: 'Каталог', summary: 'Курсы в каталоге. Параметры: category, q (поиск по названию и эксперту), sort = popular | price | price-desc | new, free=1.',
    handler: ({ query }) => {
      const cat = query.get('category'), q = (query.get('q') || '').trim().toLocaleLowerCase('ru'), sort = query.get('sort') || 'popular';
      let rows = db.all(`SELECT c.*, u.name AS expert_name FROM courses c JOIN users u ON u.id = c.expert_id WHERE c.status = 'published'`);
      if (cat && (CATEGORIES as readonly string[]).includes(cat)) rows = rows.filter(r => r.category === cat);
      if (query.get('free') === '1') rows = rows.filter(r => r.price === 0);
      if (q) rows = rows.filter(r => (r.title + ' ' + r.expert_name).toLocaleLowerCase('ru').includes(q));
      const cards = rows.map(r => courseCard(db, r));
      const by: Record<string, (a: any, b: any) => number> = {
        popular: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.students - a.students,
        price: (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
        new: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))
      };
      return cards.sort(by[sort] || by.popular);
    }
  });

  router.add({
    method: 'GET', path: '/catalog/courses/:id', group: 'Каталог', summary: 'Страница курса: описание, программа, бесплатные уроки.',
    handler: ({ params }) => {
      const c = getCourse(db, params.id);
      if (c.status !== 'published') throw notFound('Курс не найден');
      return { ...courseCard(db, c), modules: structure(db, c.id, 'public') };
    }
  });

  router.add({
    method: 'GET', path: '/catalog/courses/:id/reviews', group: 'Каталог', summary: 'Отзывы о курсе с ответами эксперта.',
    handler: ({ params }) => {
      const c = getCourse(db, params.id);
      if (c.status !== 'published') throw notFound('Курс не найден');
      return db.all(
        `SELECT r.id, u.name AS author, r.rating, r.text, r.created_at AS createdAt, r.reply, r.replied_at AS repliedAt
         FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.course_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`, c.id)
        .map(r => ({ ...r, author: r.author.split(' ')[0] }));
    }
  });

  router.add({
    method: 'GET', path: '/experts', group: 'Каталог', summary: 'Эксперты с рейтингом и статистикой прогнозов.',
    handler: () => db.all(`SELECT u.id, u.name, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE u.role = 'expert' AND p.verified_at IS NOT NULL ORDER BY u.name`).map(expertPublic)
  });

  router.add({
    method: 'GET', path: '/experts/:id', group: 'Каталог', summary: 'Профиль эксперта и его курсы в каталоге.',
    handler: ({ params }) => {
      const row = db.get(`SELECT u.id, u.name, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role = 'expert'`, params.id);
      if (!row) throw notFound('Эксперт не найден');
      const courses = db.all(`SELECT * FROM courses WHERE expert_id = ? AND status = 'published' ORDER BY published_at DESC`, row.id).map(c => courseCard(db, c));
      return { ...expertPublic(row), courses };
    }
  });

  router.add({
    method: 'GET', path: '/forecasts', group: 'Каталог', summary: 'Журнал прогнозов. Параметры: expert, status = active | success | miss | done.',
    handler: ({ query }) => {
      const expert = query.get('expert'), status = query.get('status');
      let rows = db.all(`SELECT f.*, u.name AS expert_name FROM forecasts f JOIN users u ON u.id = f.expert_id ORDER BY f.published_at DESC`);
      if (expert) rows = rows.filter(r => r.expert_id === expert);
      if (status === 'done') rows = rows.filter(r => r.status !== 'active');
      else if (status) rows = rows.filter(r => r.status === status);
      return rows.map(forecastPublic);
    }
  });

  router.add({
    method: 'GET', path: '/media/covers/:file', group: 'Служебное', summary: 'Загруженные обложки курсов.',
    handler: ctx => {
      if (!/^[\w-]+\.(jpg|png|webp)$/.test(ctx.params.file)) throw notFound();
      sendFile(ctx.req, ctx.res, path.join(app.storageDir, 'covers', ctx.params.file));
      ctx.handled = true;
    }
  });
}
