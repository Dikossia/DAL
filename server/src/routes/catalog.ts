import { forecastMemo, forecastAnchor, forecastChainFields, forecastRule, forecastResultMemo } from '../anchor.ts';
import path from 'node:path';
import type { App } from '../app.ts';
import { notFound, sendFile } from '../http.ts';
import { CATEGORIES } from '../rules.ts';
import { courseCard, structure, getCourse } from '../courses.ts';
import { expertPublic, expertBrief } from '../experts.ts';
import { productCard } from '../products.ts';
import { reviewMemo, reviewAnchor } from '../anchor.ts';

// Public part: what is visible without signing in.
export function registerCatalog(app: App) {
  const { db, router } = app;

  const expertRow = `SELECT u.id, u.name, u.avatar_file, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id`;
  const forecastPublic = (f: any) => ({
    id: f.id, ticker: f.ticker, name: f.name, direction: f.direction, startPrice: f.start_price, targetPrice: f.target_price,
    deadline: f.deadline, rationale: f.rationale, status: f.status, resultPrice: f.result_price, publishedAt: f.published_at, resolvedAt: f.resolved_at,
    expert: expertBrief(db, f.expert_id),
    comments: db.all('SELECT text, created_at AS createdAt FROM forecast_comments WHERE forecast_id = ? ORDER BY created_at', f.id),
    ...forecastChainFields(db, f)
  });

  router.add({
    method: 'GET', path: '/health', group: 'System', summary: 'Check that the server is running.',
    handler: () => ({ ok: true, time: new Date().toISOString() })
  });

  router.add({
    method: 'GET', path: '/catalog/courses', group: 'Catalog', summary: 'Catalog courses. Params: category, q (search by title and expert), sort = popular | price | price-desc | new, free=1.',
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
    method: 'GET', path: '/catalog/courses/:id', group: 'Catalog', summary: 'Course page: description, curriculum, free lessons.',
    handler: ({ params }) => {
      const c = getCourse(db, params.id);
      if (c.status !== 'published') throw notFound('Курс не найден');
      return { ...courseCard(db, c), modules: structure(db, c.id, 'public') };
    }
  });

  router.add({
    method: 'GET', path: '/catalog/courses/:id/reviews', group: 'Catalog', summary: 'Course reviews with expert replies, the Solana record (memo) and a transaction link if the review is anchored.',
    handler: ({ user, params }) => {
      const c = getCourse(db, params.id);
      if (c.status !== 'published') throw notFound('Курс не найден');
      return db.all(
        `SELECT r.*, u.name AS author FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.course_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`, c.id)
        .map(r => ({
          id: r.id, author: r.author.split(' ')[0], rating: r.rating, text: r.text, createdAt: r.created_at, reply: r.reply, repliedAt: r.replied_at,
          mine: !!user && r.user_id === user.id, memo: reviewMemo(r), anchor: reviewAnchor(db, r.id)
        }));
    }
  });

  router.add({
    method: 'GET', path: '/experts', group: 'Catalog', summary: 'Experts with ratings and forecast stats.',
    handler: () => db.all(`${expertRow} WHERE u.role = 'expert' AND p.verified_at IS NOT NULL ORDER BY u.name`).map(r => expertPublic(db, r))
  });

  router.add({
    method: 'GET', path: '/experts/:id', group: 'Catalog', summary: 'Teacher page: profile, social links, rating per mode, catalog courses and products, forecasts.',
    handler: ({ params }) => {
      const row = db.get(`${expertRow} WHERE u.id = ? AND u.role = 'expert'`, params.id);
      if (!row) throw notFound('Эксперт не найден');
      const courses = db.all(`SELECT * FROM courses WHERE expert_id = ? AND status = 'published' ORDER BY published_at DESC`, row.id).map(c => courseCard(db, c));
      const products = db.all(`SELECT * FROM products WHERE expert_id = ? AND status = 'published' ORDER BY published_at DESC`, row.id).map(p => productCard(db, p));
      return { ...expertPublic(db, row), courses, products };
    }
  });

  router.add({
    method: 'GET', path: '/forecasts', group: 'Catalog', summary: 'Forecast log. Params: expert, status = active | success | miss | done.',
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
    method: 'GET', path: '/media/covers/:file', group: 'System', summary: 'Uploaded course covers.',
    handler: ctx => {
      if (!/^[\w-]+\.(jpg|png|webp)$/.test(ctx.params.file)) throw notFound();
      sendFile(ctx.req, ctx.res, path.join(app.storageDir, 'covers', ctx.params.file));
      ctx.handled = true;
    }
  });
}
