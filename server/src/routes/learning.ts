import type { App } from '../app.ts';
import { HttpError, notFound, forbidden, conflict, sendFile } from '../http.ts';
import { parse, str, num, oneOf } from '../validate.ts';
import { reviewMemo, reviewAnchor } from '../anchor.ts';
import { RULES } from '../rules.ts';
import { newId, nowIso, daysBetween } from '../util.ts';
import { getCourse, courseCard, structure, lessonContext, canWatch, hasActiveEnrollment, progressOf, videoFile, isLive } from '../courses.ts';

// Ученик: покупка (пока без оплаты), обучение, прогресс, отзывы, возврат.
export function registerLearning(app: App) {
  const { db, router } = app;

  router.add({
    method: 'POST', path: '/courses/:id/enroll', group: 'Ученик', summary: 'Получить доступ к курсу. Оплата пока не подключена: цена фиксируется, деньги не списываются.', auth: ['student'],
    handler: ({ user, params }) => {
      const c = getCourse(db, params.id);
      if (c.status !== 'published') throw notFound('Курс не найден');
      return db.tx(() => {
        const e = db.get('SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?', user!.id, c.id);
        if (e?.status === 'active') throw conflict('already_enrolled', 'У вас уже есть доступ к этому курсу');
        const commission = Math.round(c.price * RULES.commission);
        if (e) db.run(`UPDATE enrollments SET status = 'active', price_paid = ?, commission = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, c.price, commission, nowIso(), e.id);
        else db.run('INSERT INTO enrollments (id, user_id, course_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), user!.id, c.id, c.price, commission, nowIso());
        return { courseId: c.id, pricePaid: c.price, status: 'active' };
      });
    }
  });

  router.add({
    method: 'POST', path: '/courses/:id/refund', group: 'Ученик', summary: `Вернуть курс: в течение ${RULES.refundDays} дней и если пройдено меньше ${RULES.refundMaxProgress * 100}%.`, auth: ['student'],
    handler: ({ user, params }) => {
      const e = db.get(`SELECT * FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, user!.id, params.id);
      if (!e) throw notFound('Активная покупка не найдена');
      if (daysBetween(e.created_at) > RULES.refundDays) throw conflict('refund_expired', `Возврат возможен в течение ${RULES.refundDays} дней после покупки`);
      const p = progressOf(db, user!.id, params.id);
      if (p.total && p.done / p.total >= RULES.refundMaxProgress) throw conflict('refund_progress', `Возврат невозможен: пройдено ${p.percent}% курса`);
      db.run(`UPDATE enrollments SET status = 'refunded', refunded_at = ? WHERE id = ?`, nowIso(), e.id);
      return { courseId: params.id, refunded: e.price_paid };
    }
  });

  router.add({
    method: 'GET', path: '/me/learning', group: 'Ученик', summary: 'Мои курсы с прогрессом и курс «в процессе».', auth: ['student'],
    handler: ({ user }) => {
      const rows = db.all(`SELECT c.*, e.created_at AS enrolled_at FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? AND e.status = 'active' ORDER BY e.created_at DESC`, user!.id);
      const list = rows.map(c => ({ ...courseCard(db, c), enrolledAt: c.enrolled_at, progress: progressOf(db, user!.id, c.id) }));
      return { courses: list, inProgress: list.find(c => c.progress.done < c.progress.total) ?? list[0] ?? null };
    }
  });

  router.add({
    method: 'GET', path: '/learning/courses/:id', group: 'Ученик', summary: 'Содержимое купленного курса: уроки, отметки о прохождении, ссылки на видео.', auth: 'user',
    handler: ({ user, params }) => {
      const c = getCourse(db, params.id);
      const allowed = user!.role === 'moderator' || c.expert_id === user!.id || (hasActiveEnrollment(db, user!.id, c.id) && isLive(c));
      if (!allowed) throw forbidden('Сначала получите доступ к курсу');
      const done = new Set(db.all<{ lesson_id: string }>('SELECT lesson_id FROM lesson_progress WHERE user_id = ?', user!.id).map(r => r.lesson_id));
      return { ...courseCard(db, c), modules: structure(db, c.id, 'student', done), progress: progressOf(db, user!.id, c.id) };
    }
  });

  router.add({
    method: 'POST', path: '/lessons/:id/complete', group: 'Ученик', summary: 'Отметить урок пройденным. Уроки проходятся по порядку.', auth: ['student'],
    handler: ({ user, params }) => {
      const { course } = lessonContext(db, params.id);
      if (!hasActiveEnrollment(db, user!.id, course.id) || !isLive(course)) throw forbidden('Сначала получите доступ к курсу');
      const order = db.all<{ id: string }>(`SELECT l.id FROM modules m JOIN lessons l ON l.module_id = m.id WHERE m.course_id = ? ORDER BY m.position, l.position`, course.id).map(r => r.id);
      const done = new Set(db.all<{ lesson_id: string }>('SELECT lesson_id FROM lesson_progress WHERE user_id = ?', user!.id).map(r => r.lesson_id));
      const idx = order.indexOf(params.id);
      if (order.slice(0, idx).some(id => !done.has(id))) throw conflict('previous_lessons', 'Сначала завершите предыдущие уроки');
      db.run('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', user!.id, params.id, nowIso());
      return progressOf(db, user!.id, course.id);
    }
  });

  router.add({
    method: 'GET', path: '/lessons/:id/video', group: 'Ученик', summary: 'Видео урока с перемоткой (Range). Для тега <video> токен можно передать как ?token=. Бесплатные уроки опубликованных курсов доступны всем.',
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
    method: 'POST', path: '/courses/:id/reviews', group: 'Ученик', summary: 'Оставить отзыв о курсе: только после прохождения всех уроков, один на курс, изменить нельзя.', auth: ['student'],
    body: '{ rating: 1–5, text: 10–1500 символов }',
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
    method: 'POST', path: '/reviews/:id/anchor', group: 'Ученик',
    summary: 'Сохранить ссылку на транзакцию Solana, в которой зафиксирован отзыв (memo: оценка, курс, хеш текста). Только автор, один раз.', auth: ['student'],
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

  // ---------- Вопросы и комментарии под уроком ----------
  // Участники обсуждения: ученики с доступом к курсу, эксперт курса и модератор.
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
    method: 'GET', path: '/lessons/:id/comments', group: 'Ученик', summary: 'Вопросы и комментарии под уроком (ученики курса, эксперт, модератор).', auth: 'user',
    handler: ({ user, params }) => {
      const { course } = commentsAccess(user, params.id);
      return db.all(`SELECT c.*, u.name AS author, u.role FROM lesson_comments c JOIN users u ON u.id = c.user_id
                     WHERE c.lesson_id = ? AND c.hidden = 0 ORDER BY c.created_at`, params.id).map(r => commentView(r, user, course));
    }
  });

  router.add({
    method: 'POST', path: '/lessons/:id/comments', group: 'Ученик', summary: 'Задать вопрос или оставить комментарий под уроком. Эксперт курса отвечает здесь же.', auth: 'user',
    body: '{ text: 2–1000 символов }',
    handler: ({ user, params, body }) => {
      const { course } = commentsAccess(user, params.id);
      const b = parse<{ text: string }>(body, { text: str({ min: 2, max: 1000 }) });
      const id = newId(), at = nowIso();
      db.run('INSERT INTO lesson_comments (id, lesson_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', id, params.id, user!.id, b.text, at);
      return commentView({ id, user_id: user!.id, author: user!.name, role: user!.role, text: b.text, created_at: at }, user, course);
    }
  });

  router.add({
    method: 'DELETE', path: '/lessons/comments/:id', group: 'Ученик', summary: 'Скрыть комментарий: автор, эксперт курса или модератор.', auth: 'user',
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
