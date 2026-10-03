import type { App } from '../app.ts';
import { HttpError, notFound, forbidden, conflict, sendFile } from '../http.ts';
import { parse, str, num, oneOf } from '../validate.ts';
import { reviewMemo, reviewAnchor } from '../anchor.ts';
import { placeCardOrder } from '../orders.ts';
import { issueCertificateIfCompleted } from '../certificates.ts';
import { RULES } from '../rules.ts';
import { newId, nowIso, daysBetween } from '../util.ts';
import { getCourse, courseCard, structure, lessonContext, canWatch, hasActiveEnrollment, progressOf, videoFile, isLive } from '../courses.ts';

// Student: purchase (no payment yet), learning, progress, reviews, refunds.
export function registerLearning(app: App) {
  const { db, router } = app;

  router.add({
    method: 'POST', path: '/courses/:id/enroll', group: 'Student', summary: 'Get access to a course by card (payment is simulated: the price is recorded, no money is charged). Same as POST /orders with method "card".', auth: ['student'],
    handler: ({ user, params }) => {
      const o = placeCardOrder(app, user!, 'course', params.id);
      return { courseId: params.id, pricePaid: o.price, networkFee: o.networkFee, total: o.total, orderId: o.id, status: 'active' };
    }
  });

  router.add({
    method: 'POST', path: '/courses/:id/refund', group: 'Student', summary: `Refund a course: within ${RULES.refundDays} days and only if less than ${RULES.refundMaxProgress * 100}% is completed.`, auth: ['student'],
    handler: ({ user, params }) => {
      const e = db.get(`SELECT * FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, user!.id, params.id);
      if (!e) throw notFound('Активная покупка не найдена');
      if (daysBetween(e.created_at) > RULES.refundDays) throw conflict('refund_expired', `Возврат возможен в течение ${RULES.refundDays} дней после покупки`);
      const p = progressOf(db, user!.id, params.id);
      if (p.total && p.done / p.total >= RULES.refundMaxProgress) throw conflict('refund_progress', `Возврат невозможен: пройдено ${p.percent}% курса`);
      db.run(`UPDATE enrollments SET status = 'refunded', refunded_at = ? WHERE id = ?`, nowIso(), e.id);
      return { courseId: params.id, refunded: e.price_paid + (e.network_fee || 0) };
    }
  });

  router.add({
    method: 'GET', path: '/me/learning', group: 'Student', summary: 'My courses with progress and the "in progress" course.', auth: ['student'],
    handler: ({ user }) => {
      const rows = db.all(`SELECT c.*, e.created_at AS enrolled_at FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND e.status = 'active' ORDER BY e.created_at DESC`, user!.id);
      const list = rows.map(c => ({ ...courseCard(db, c), enrolledAt: c.enrolled_at, progress: progressOf(db, user!.id, c.id) }));
      return { courses: list, inProgress: list.find(c => c.progress.done < c.progress.total) ?? list[0] ?? null };
    }
  });

  router.add({
    method: 'GET', path: '/learning/courses/:id', group: 'Student', summary: 'Contents of a purchased course: lessons, completion marks, video links.', auth: 'user',
    handler: ({ user, params }) => {
      const c = getCourse(db, params.id);
      const allowed = user!.role === 'moderator' || c.expert_id === user!.id || (hasActiveEnrollment(db, user!.id, c.id) && isLive(c));
      if (!allowed) throw forbidden('Сначала получите доступ к курсу');
      const done = new Set(db.all<{ lesson_id: string }>('SELECT lesson_id FROM lesson_progress WHERE user_id = ?', user!.id).map(r => r.lesson_id));
      return { ...courseCard(db, c), modules: structure(db, c.id, 'student', done), progress: progressOf(db, user!.id, c.id) };
    }
  });

  router.add({
    method: 'POST', path: '/lessons/:id/complete', group: 'Student', summary: 'Mark a lesson as completed. Lessons are completed in order.', auth: ['student'],
    handler: ({ user, params }) => {
      const { course } = lessonContext(db, params.id);
      if (!hasActiveEnrollment(db, user!.id, course.id) || !isLive(course)) throw forbidden('Сначала получите доступ к курсу');
      const order = db.all<{ id: string }>(`SELECT l.id FROM modules m JOIN lessons l ON l.module_id = m.id WHERE m.course_id = ? ORDER BY m.position, l.position`, course.id).map(r => r.id);
      const done = new Set(db.all<{ lesson_id: string }>('SELECT lesson_id FROM lesson_progress WHERE user_id = ?', user!.id).map(r => r.lesson_id));
      const idx = order.indexOf(params.id);
      if (order.slice(0, idx).some(id => !done.has(id))) throw conflict('previous_lessons', 'Сначала завершите предыдущие уроки');
      db.run('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', user!.id, params.id, nowIso());
      // Last lesson: the certificate is issued right away; its NFT is minted in the background.
      const cert = issueCertificateIfCompleted(app, user!.id, course.id);
      return { ...progressOf(db, user!.id, course.id), ...(cert ? { certificateId: cert.id } : {}) };
    }
  });

  router.add({
    method: 'GET', path: '/lessons/:id/video', group: 'Student', summary: 'Lesson video with seeking (Range). For the <video> tag the token may be passed as ?token=. Free lessons of published courses are open to everyone.',
    handler: ctx => {
      const { lesson, course } = lessonContext(db, ctx.params.id);
      const v = db.get('SELECT * FROM videos WHERE lesson_id = ?', lesson.id);
      if (!v) throw notFound('В уроке пока нет видео');
      if (!canWatch(db, ctx.user, course, lesson)) throw ctx.user ? forbidden('Видео доступно после покупки курса') : new HttpError(401, 'unauthorized', 'Нужно войти в аккаунт');
      sendFile(ctx.req, ctx.res, videoFile(app, v.file_name), v.mime);
      ctx.handled = true;
    }
  });

  router.add({
    method: 'POST', path: '/courses/:id/reviews', group: 'Student', summary: 'Leave a course review: only after completing all lessons, one per course, cannot be edited.', auth: ['student'],
    body: '{ rating: 1–5, text: 10–1500 chars }',
    handler: ({ user, params, body }) => {
      const c = getCourse(db, params.id);
      if (!hasActiveEnrollment(db, user!.id, c.id)) throw forbidden('Отзыв может оставить только ученик, купивший курс');
      const p = progressOf(db, user!.id, c.id);
      if (!p.total || p.done < p.total) throw new HttpError(403, 'course_not_completed', `Отзыв можно оставить после прохождения всего курса: пройдено ${p.done} из ${p.total} уроков`);
      const b = parse<{ rating: number; text: string }>(body, { rating: num({ int: true, min: 1, max: 5 }), text: str({ min: 10, max: 1500 }) });
      const id = newId();
      db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, c.id, user!.id, b.rating, b.text, nowIso());
      return { id, rating: b.rating, text: b.text };
    }
  });

  router.add({
    method: 'POST', path: '/reviews/:id/anchor', group: 'Student',
    summary: 'Save a link to the Solana transaction anchoring the review (memo: rating, course, text hash). Author only, once.', auth: ['student'],
    body: '{ signature, wallet, cluster: "devnet" }',
    handler: ({ user, params, body }) => {
      const r = db.get('SELECT * FROM reviews WHERE id = ? AND user_id = ?', params.id, user!.id);
      if (!r) throw notFound('Отзыв не найден');
      if (db.get('SELECT 1 FROM review_anchors WHERE review_id = ?', r.id)) throw conflict('already_anchored', 'Отзыв уже зафиксирован в Solana');
      const b = parse<{ signature: string; wallet: string; cluster: 'devnet' | 'mainnet-beta' }>(body, {
        signature: str({ min: 60, max: 100, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: 'Некорректная подпись транзакции' }),
        wallet: str({ min: 30, max: 50, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: 'Некорректный адрес кошелька' }),
        cluster: oneOf(['devnet', 'mainnet-beta'] as const)
      });
      db.run('INSERT INTO review_anchors (review_id, cluster, signature, wallet, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)', r.id, b.cluster, b.signature, b.wallet, reviewMemo(r), nowIso());
      return { id: r.id, memo: reviewMemo(r), anchor: reviewAnchor(db, r.id) };
    }
  });

  // ---------- Lesson questions and comments ----------
  // Participants: students with access to the course, the course expert and the moderator.
  const commentsAccess = (user: any, lessonId: string) => {
    const ctx = lessonContext(db, lessonId);
    const ok = user.role === 'moderator' || ctx.course.expert_id === user.id || (hasActiveEnrollment(db, user.id, ctx.course.id) && isLive(ctx.course));
    if (!ok) throw forbidden('Обсуждение урока доступно ученикам курса');
    return ctx;
  };
  const commentView = (r: any, user: any, course: any) => ({
    id: r.id, author: r.user_id === course.expert_id ? r.author : r.author.split(' ')[0],
    role: r.user_id === course.expert_id ? 'expert' : r.role, text: r.text, createdAt: r.created_at,
    mine: r.user_id === user.id, canDelete: r.user_id === user.id || course.expert_id === user.id || user.role === 'moderator'
  });

  router.add({
    method: 'GET', path: '/lessons/:id/comments', group: 'Student', summary: 'Lesson questions and comments (course students, expert, moderator).', auth: 'user',
    handler: ({ user, params }) => {
      const { course } = commentsAccess(user, params.id);
      return db.all(`SELECT c.*, u.name AS author, u.role FROM lesson_comments c JOIN users u ON u.id = c.user_id
                     WHERE c.lesson_id = ? AND c.hidden = 0 ORDER BY c.created_at`, params.id).map(r => commentView(r, user, course));
    }
  });

  router.add({
    method: 'POST', path: '/lessons/:id/comments', group: 'Student', summary: 'Ask a question or leave a comment on a lesson. The course expert replies here too.', auth: 'user',
    body: '{ text: 2–1000 chars }',
    handler: ({ user, params, body }) => {
      const { course } = commentsAccess(user, params.id);
      const b = parse<{ text: string }>(body, { text: str({ min: 2, max: 1000 }) });
      const id = newId(), at = nowIso();
      db.run('INSERT INTO lesson_comments (id, lesson_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', id, params.id, user!.id, b.text, at);
      return commentView({ id, user_id: user!.id, author: user!.name, role: user!.role, text: b.text, created_at: at }, user, course);
    }
  });

  router.add({
    method: 'DELETE', path: '/lessons/comments/:id', group: 'Student', summary: 'Hide a comment: author, course expert or moderator.', auth: 'user',
    handler: ({ user, params }) => {
      const c = db.get('SELECT * FROM lesson_comments WHERE id = ? AND hidden = 0', params.id);
      if (!c) throw notFound('Комментарий не найден');
      const { course } = lessonContext(db, c.lesson_id);
      if (!(c.user_id === user!.id || course.expert_id === user!.id || user!.role === 'moderator')) throw forbidden();
      db.run('UPDATE lesson_comments SET hidden = 1 WHERE id = ?', c.id);
      return { id: c.id, hidden: true };
    }
  });
}
