import type { App } from '../app.ts';
import { notFound, conflict } from '../http.ts';
import { parse, str, strList, oneOf } from '../validate.ts';
import { RULES } from '../rules.ts';
import { newId, nowIso, shortName, nextPayoutDate, addDays } from '../util.ts';
import { courseStats, checklist, lessonsOf, progressOf } from '../courses.ts';

const E: ['expert'] = ['expert'];
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function registerStudioOther(app: App) {
  const { db, router } = app;

  const profile = (userId: string) => {
    const r = db.get('SELECT u.name, u.email, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?', userId)!;
    return {
      name: r.name, email: r.email, specialization: r.specialization, bio: r.bio, experience: r.experience,
      achievements: JSON.parse(r.achievements || '[]'), avatarUrl: r.avatar ? `/assets/${r.avatar}.jpg` : null,
      verified: !!r.verified_at, verifiedAt: r.verified_at,
      pendingRequests: db.all(`SELECT id, field, value, created_at AS createdAt FROM profile_requests WHERE expert_id = ? AND status = 'pending' ORDER BY created_at`, userId)
    };
  };

  const monthly = (userId: string, months = 6) => {
    const now = new Date(), out: { month: string; label: string; gross: number; commission: number; net: number; sales: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const s = db.get(
        `SELECT COUNT(*) AS n, COALESCE(SUM(e.price_paid), 0) AS gross, COALESCE(SUM(e.commission), 0) AS fee
         FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE c.expert_id = ? AND e.status = 'active' AND substr(e.created_at, 1, 7) = ?`, userId, key)!;
      out.push({ month: key, label: MONTHS[d.getMonth()], gross: s.gross, commission: s.fee, net: s.gross - s.fee, sales: s.n });
    }
    return out;
  };

  router.add({
    method: 'GET', path: '/studio/overview', group: 'Студия: обзор', summary: 'Сводка кабинета и список «Требует внимания».', auth: E,
    handler: ({ user }) => {
      const id = user!.id;
      const courses = db.all('SELECT * FROM courses WHERE expert_id = ?', id);
      const live = courses.filter(c => c.status === 'published' || c.status === 'hidden');
      const stats = live.map(c => courseStats(db, c.id));
      const reviewsN = stats.reduce((a, s) => a + s.reviews, 0);
      const rating = reviewsN ? stats.reduce((a, s) => a + (s.rating ?? 0) * s.reviews, 0) / reviewsN : null;
      const f = db.get(`SELECT SUM(status = 'success') AS ok, SUM(status <> 'active') AS done FROM forecasts WHERE expert_id = ?`, id)!;
      const months = monthly(id, 2);
      const attention: { type: string; title: string; detail: string; link: string }[] = [];
      for (const c of courses.filter(c => c.status === 'draft')) {
        const left = checklist(c, lessonsOf(db, c.id)).filter(x => !x.ok).length;
        attention.push({ type: 'draft', title: c.title || 'Новый курс', detail: left ? `До модерации осталось пунктов: ${left}` : 'Готов к отправке на модерацию', link: `/studio/courses/${c.id}` });
        if (c.moderation_note) attention.push({ type: 'rejected', title: c.title || 'Новый курс', detail: `Модерация вернула курс: ${c.moderation_note}`, link: `/studio/courses/${c.id}` });
      }
      for (const c of courses.filter(c => c.status === 'review')) attention.push({ type: 'review', title: c.title, detail: `На модерации с ${c.submitted_at?.slice(0, 10)}`, link: `/studio/courses/${c.id}` });
      for (const fc of db.all(`SELECT * FROM forecasts WHERE expert_id = ? AND status = 'active' AND deadline <= ?`, id, addDays(14)))
        attention.push({ type: 'forecast', title: `Прогноз ${fc.ticker}`, detail: `Проверка ${fc.deadline}`, link: '/studio/forecasts' });
      const unanswered = db.get(`SELECT COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.reply IS NULL AND r.hidden = 0
        AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'pending')`, id)!.n as number;
      if (unanswered) attention.push({ type: 'reviews', title: `Отзывов без ответа: ${unanswered}`, detail: 'Ответы видны всем ученикам', link: '/studio/reviews' });
      const p = profile(id);
      return {
        verified: p.verified,
        students: stats.reduce((a, s) => a + s.students, 0),
        liveCourses: live.length,
        salesThisMonth: months[1], salesLastMonth: months[0],
        rating: rating ? Math.round(rating * 100) / 100 : null, reviews: reviewsN,
        forecasts: { done: f.done || 0, success: f.ok || 0, successRate: f.done ? Math.round(f.ok / f.done * 1000) / 10 : null },
        attention
      };
    }
  });

  router.add({
    method: 'GET', path: '/studio/students', group: 'Студия: ученики', summary: 'Ученики моих курсов: сокращённое имя и прогресс. Почта и телефоны не отдаются.', auth: E,
    handler: ({ user, query }) => {
      const course = query.get('course');
      const rows = db.all(
        `SELECT e.user_id, e.course_id, e.created_at, u.name, c.title FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
         WHERE c.expert_id = ? AND e.status = 'active' ORDER BY e.created_at DESC`, user!.id).filter(r => !course || r.course_id === course);
      return rows.map(r => {
        const last = db.get(`SELECT MAX(p.completed_at) AS t FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = ? AND m.course_id = ?`, r.user_id, r.course_id)!.t;
        return { name: shortName(r.name), courseId: r.course_id, courseTitle: r.title, enrolledAt: r.created_at, lastActivity: last ?? r.created_at, progress: progressOf(db, r.user_id, r.course_id) };
      });
    }
  });

  router.add({
    method: 'GET', path: '/studio/reviews', group: 'Студия: отзывы', summary: 'Отзывы о моих курсах. Параметр unanswered=1 — только без ответа.', auth: E,
    handler: ({ user, query }) => {
      const rows = db.all(
        `SELECT r.*, u.name AS author, c.title AS course_title,
           (SELECT status FROM review_reports rr WHERE rr.review_id = r.id ORDER BY created_at DESC LIMIT 1) AS report_status
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? ORDER BY r.created_at DESC`, user!.id);
      return rows
        .filter(r => query.get('unanswered') !== '1' || (!r.reply && !r.report_status && !r.hidden))
        .map(r => ({ id: r.id, author: shortName(r.author), courseId: r.course_id, courseTitle: r.course_title, rating: r.rating, text: r.text, createdAt: r.created_at, reply: r.reply, repliedAt: r.replied_at, hidden: r.hidden === 1, report: r.report_status }));
    }
  });

  const ownReview = (userId: string, id: string) => {
    const r = db.get('SELECT r.* FROM reviews r JOIN courses c ON c.id = r.course_id WHERE r.id = ? AND c.expert_id = ?', id, userId);
    if (!r) throw notFound('Отзыв не найден');
    return r;
  };

  router.add({
    method: 'PUT', path: '/studio/reviews/:id/reply', group: 'Студия: отзывы', summary: 'Публичный ответ на отзыв (можно изменить). Сам отзыв эксперт изменить или удалить не может.', auth: E,
    body: '{ text: 2–1000 символов }',
    handler: ({ user, params, body }) => {
      const r = ownReview(user!.id, params.id);
      const b = parse<{ text: string }>(body, { text: str({ min: 2, max: 1000 }) });
      db.run('UPDATE reviews SET reply = ?, replied_at = ? WHERE id = ?', b.text, nowIso(), r.id);
      return { id: r.id, reply: b.text };
    }
  });

  router.add({
    method: 'POST', path: '/studio/reviews/:id/report', group: 'Студия: отзывы', summary: 'Пожаловаться на отзыв. Он остаётся видимым, пока модерация не решит.', auth: E,
    body: '{ reason: "spam" | "abuse" | "offtopic" | "other" }',
    handler: ({ user, params, body }) => {
      const r = ownReview(user!.id, params.id);
      const b = parse<{ reason: string }>(body, { reason: oneOf(['spam', 'abuse', 'offtopic', 'other'] as const) });
      if (db.get(`SELECT 1 FROM review_reports WHERE review_id = ? AND status = 'pending'`, r.id)) throw conflict('already_reported', 'Жалоба уже на рассмотрении');
      db.run('INSERT INTO review_reports (id, review_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)', newId(), r.id, user!.id, b.reason, nowIso());
      return { id: r.id, report: 'pending' };
    }
  });

  for (const method of ['PATCH', 'DELETE'] as const) router.add({
    method, path: '/studio/reviews/:id', group: 'Студия: отзывы', summary: 'Изменить или удалить отзыв эксперт не может — всегда 409.', auth: E,
    handler: () => { throw conflict('review_immutable', 'Отзывы нельзя изменить или удалить. Пожалуйтесь на отзыв, решение примет модерация.'); }
  });

  router.add({
    method: 'GET', path: '/studio/income', group: 'Студия: доход', summary: 'Продажи по месяцам, по курсам, последние продажи и ближайшая выплата.', auth: E,
    handler: ({ user }) => {
      const id = user!.id;
      const byCourse = db.all(`SELECT * FROM courses WHERE expert_id = ? AND status IN ('published', 'hidden') ORDER BY published_at`, id)
        .map(c => ({ courseId: c.id, title: c.title, ...courseStats(db, c.id) }));
      const recent = db.all(
        `SELECT e.created_at, e.price_paid, e.commission, c.id AS course_id, c.title, u.name FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = e.user_id
         WHERE c.expert_id = ? AND e.status = 'active' ORDER BY e.created_at DESC LIMIT 20`, id)
        .map(r => ({ date: r.created_at, courseId: r.course_id, courseTitle: r.title, student: shortName(r.name), amount: r.price_paid, commission: r.commission, net: r.price_paid - r.commission }));
      const refunds = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(e.price_paid), 0) AS sum FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'refunded'`, id)!;
      return {
        commissionRate: RULES.commission,
        months: monthly(id, 6),
        byCourse, recent,
        refunds: { count: refunds.n, amount: refunds.sum },
        nextPayout: nextPayoutDate(RULES.payoutDays),
        payoutsNote: 'Выплаты подключаются после интеграции платёжной системы. Сейчас суммы расчётные.'
      };
    }
  });

  router.add({
    method: 'GET', path: '/studio/profile', group: 'Студия: профиль', summary: 'Мой публичный профиль и запросы на изменение.', auth: E,
    handler: ({ user }) => profile(user!.id)
  });

  router.add({
    method: 'PATCH', path: '/studio/profile', group: 'Студия: профиль', summary: 'Изменить специализацию, описание и достижения. Видно ученикам сразу.', auth: E,
    body: '{ specialization?, bio?, achievements?: string[] }',
    handler: ({ user, body }) => {
      const b = parse<{ specialization?: string; bio?: string; achievements?: string[] }>(body, {
        specialization: str({ min: 2, max: 80, optional: true }), bio: str({ max: 800, optional: true }), achievements: strList({ optional: true, maxItems: 8, maxLen: 120 })
      });
      db.tx(() => {
        if (b.specialization !== undefined) db.run('UPDATE expert_profiles SET specialization = ? WHERE user_id = ?', b.specialization, user!.id);
        if (b.bio !== undefined) db.run('UPDATE expert_profiles SET bio = ? WHERE user_id = ?', b.bio, user!.id);
        if (b.achievements !== undefined) db.run('UPDATE expert_profiles SET achievements = ? WHERE user_id = ?', JSON.stringify(b.achievements), user!.id);
      });
      return profile(user!.id);
    }
  });

  router.add({
    method: 'POST', path: '/studio/profile/requests', group: 'Студия: профиль', summary: 'Запросить изменение имени или стажа. Вступит в силу после модерации.', auth: E,
    body: '{ field: "name" | "experience", value }',
    handler: ({ user, body }) => {
      const b = parse<{ field: 'name' | 'experience'; value: string }>(body, { field: oneOf(['name', 'experience'] as const), value: str({ min: 2, max: 60 }) });
      db.tx(() => {
        db.run(`UPDATE profile_requests SET status = 'rejected', decided_at = ? WHERE expert_id = ? AND field = ? AND status = 'pending'`, nowIso(), user!.id, b.field);
        db.run('INSERT INTO profile_requests (id, expert_id, field, value, created_at) VALUES (?, ?, ?, ?, ?)', newId(), user!.id, b.field, b.value, nowIso());
      });
      return profile(user!.id);
    }
  });

}
