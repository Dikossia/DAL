import type { App } from '../app.ts';
import { notFound, conflict } from '../http.ts';
import { parse, str, num, oneOf } from '../validate.ts';
import { nowIso, localDate } from '../util.ts';
import { courseCard, checklist, lessonsOf } from '../courses.ts';
import { forecastView } from './studio-forecasts.ts';
import { productCard, productChecklist } from '../products.ts';

const M: ['moderator'] = ['moderator'];

// Moderation: courses, review reports, profile changes, expert verification, forecast outcomes.
export function registerModeration(app: App) {
  const { db, router } = app;

  router.add({
    method: 'GET', path: '/moderation/queue', group: 'Moderation', summary: 'Everything awaiting a moderator decision.', auth: M,
    handler: () => ({
      courses: db.all(`SELECT * FROM courses WHERE status = 'review' ORDER BY submitted_at`).map(c => ({ ...courseCard(db, c), submittedAt: c.submitted_at, checklist: checklist(c, lessonsOf(db, c.id)) })),
      products: db.all(`SELECT * FROM products WHERE status = 'review' ORDER BY submitted_at`).map(p => ({ ...productCard(db, p), submittedAt: p.submitted_at, checklist: productChecklist(db, p) })),
      reports: [
        ...db.all(
          `SELECT rr.id, rr.reason, rr.created_at AS createdAt, r.id AS reviewId, r.text, r.rating, c.title AS courseTitle, u.name AS reportedBy
           FROM review_reports rr JOIN reviews r ON r.id = rr.review_id JOIN courses c ON c.id = r.course_id JOIN users u ON u.id = rr.reporter_id
           WHERE rr.status = 'pending'`),
        ...db.all(
          `SELECT rr.id, rr.reason, rr.created_at AS createdAt, r.id AS reviewId, r.text, r.rating, p.title AS courseTitle, u.name AS reportedBy
           FROM product_review_reports rr JOIN product_reviews r ON r.id = rr.review_id JOIN products p ON p.id = r.product_id JOIN users u ON u.id = rr.reporter_id
           WHERE rr.status = 'pending'`)
      ].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      profileRequests: db.all(
        `SELECT pr.id, pr.field, pr.value, pr.created_at AS createdAt, u.id AS expertId, u.name AS currentName, p.experience AS currentExperience
         FROM profile_requests pr JOIN users u ON u.id = pr.expert_id JOIN expert_profiles p ON p.user_id = u.id WHERE pr.status = 'pending' ORDER BY pr.created_at`),
      unverifiedExperts: db.all(`SELECT u.id, u.name, u.email, u.created_at AS createdAt FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE p.verified_at IS NULL ORDER BY u.created_at`),
      forecastsToResolve: db.all(`SELECT f.*, u.name AS expert_name FROM forecasts f JOIN users u ON u.id = f.expert_id WHERE f.status = 'active' AND f.deadline <= ? ORDER BY f.deadline`, localDate())
        .map(f => ({ ...forecastView(db, f), expert: { id: f.expert_id, name: f.expert_name } }))
    })
  });

  const reviewCourse = (id: string) => {
    const c = db.get('SELECT * FROM courses WHERE id = ?', id);
    if (!c) throw notFound('Курс не найден');
    if (c.status !== 'review') throw conflict('bad_status', 'Курс не на модерации');
    return c;
  };
  router.add({
    method: 'POST', path: '/moderation/courses/:id/approve', group: 'Moderation', summary: 'Approve a course: it appears in the catalog.', auth: M,
    handler: ({ params }) => {
      const c = reviewCourse(params.id);
      db.run(`UPDATE courses SET status = 'published', published_at = COALESCE(published_at, ?), moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), c.id);
      return courseCard(db, db.get('SELECT * FROM courses WHERE id = ?', c.id)!);
    }
  });
  router.add({
    method: 'POST', path: '/moderation/courses/:id/reject', group: 'Moderation', summary: 'Return a course to the expert with a comment.', auth: M,
    body: '{ note: what to fix }',
    handler: ({ params, body }) => {
      const c = reviewCourse(params.id);
      const b = parse<{ note: string }>(body, { note: str({ min: 5, max: 1000 }) });
      db.run(`UPDATE courses SET status = 'draft', moderation_note = ?, submitted_at = NULL, updated_at = ? WHERE id = ?`, b.note, nowIso(), c.id);
      return courseCard(db, db.get('SELECT * FROM courses WHERE id = ?', c.id)!);
    }
  });

  router.add({
    method: 'POST', path: '/moderation/reports/:id/resolve', group: 'Moderation', summary: 'Resolve a review report: keep the review or hide it.', auth: M,
    body: '{ action: "keep" | "remove" }',
    handler: ({ user, params, body }) => {
      let rr = db.get(`SELECT * FROM review_reports WHERE id = ?`, params.id), reports = 'review_reports', reviews = 'reviews';
      if (!rr) { rr = db.get(`SELECT * FROM product_review_reports WHERE id = ?`, params.id); reports = 'product_review_reports'; reviews = 'product_reviews'; }
      if (!rr) throw notFound('Жалоба не найдена');
      if (rr.status !== 'pending') throw conflict('already_decided', 'По жалобе уже есть решение');
      const b = parse<{ action: 'keep' | 'remove' }>(body, { action: oneOf(['keep', 'remove'] as const) });
      db.tx(() => {
        db.run(`UPDATE ${reports} SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?`, b.action === 'keep' ? 'kept' : 'removed', nowIso(), user!.id, rr.id);
        if (b.action === 'remove') db.run(`UPDATE ${reviews} SET hidden = 1 WHERE id = ?`, rr.review_id);
      });
      return { id: rr.id, status: b.action === 'keep' ? 'kept' : 'removed' };
    }
  });

  router.add({
    method: 'POST', path: '/moderation/profile-requests/:id/:decision', group: 'Moderation', summary: 'Approve or reject a change to an expert\'s name or years of experience.', auth: M,
    handler: ({ user, params }) => {
      if (!['approve', 'reject'].includes(params.decision)) throw notFound();
      const pr = db.get('SELECT * FROM profile_requests WHERE id = ?', params.id);
      if (!pr) throw notFound('Запрос не найден');
      if (pr.status !== 'pending') throw conflict('already_decided', 'По запросу уже есть решение');
      db.tx(() => {
        const approved = params.decision === 'approve';
        db.run('UPDATE profile_requests SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?', approved ? 'approved' : 'rejected', nowIso(), user!.id, pr.id);
        if (approved && pr.field === 'name') db.run('UPDATE users SET name = ? WHERE id = ?', pr.value, pr.expert_id);
        if (approved && pr.field === 'experience') db.run('UPDATE expert_profiles SET experience = ? WHERE user_id = ?', pr.value, pr.expert_id);
      });
      return { id: pr.id, status: params.decision === 'approve' ? 'approved' : 'rejected' };
    }
  });

  router.add({
    method: 'POST', path: '/moderation/experts/:id/verify', group: 'Moderation', summary: 'Verify an expert\'s identity and payout account: after that they can sell courses and publish forecasts.', auth: M,
    handler: ({ params }) => {
      const p = db.get('SELECT * FROM expert_profiles WHERE user_id = ?', params.id);
      if (!p) throw notFound('Эксперт не найден');
      if (p.verified_at) throw conflict('already_verified', 'Эксперт уже подтверждён');
      db.run('UPDATE expert_profiles SET verified_at = ? WHERE user_id = ?', nowIso(), params.id);
      return { id: params.id, verified: true };
    }
  });

  router.add({
    method: 'POST', path: '/moderation/forecasts/:id/resolve', group: 'Moderation',
    summary: 'Record the closing price on the deadline date; the outcome is determined automatically. Until a quote feed is connected, the moderator enters the price.', auth: M,
    body: '{ closePrice }',
    handler: ({ user, params, body }) => {
      const f = db.get('SELECT * FROM forecasts WHERE id = ?', params.id);
      if (!f) throw notFound('Прогноз не найден');
      if (f.status !== 'active') throw conflict('forecast_resolved', 'Итог прогноза уже определён');
      if (f.deadline > localDate()) throw conflict('too_early', `Итог можно записать не раньше даты проверки (${f.deadline})`);
      const b = parse<{ closePrice: number }>(body, { closePrice: num({ gt: 0, max: 1e7 }) });
      const success = f.direction === 'up' ? b.closePrice >= f.target_price : b.closePrice <= f.target_price;
      db.run('UPDATE forecasts SET status = ?, result_price = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', success ? 'success' : 'miss', b.closePrice, nowIso(), user!.id, f.id);
      return forecastView(db, db.get('SELECT * FROM forecasts WHERE id = ?', f.id));
    }
  });
}
