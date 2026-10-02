import type { App } from '../app.ts';
import { HttpError, notFound, forbidden, conflict, sendFile } from '../http.ts';
import { parse, str, num } from '../validate.ts';
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
    method: 'POST', path: '/courses/:id/reviews', group: 'Ученик', summary: 'Оставить отзыв о купленном курсе (один на курс).', auth: ['student'],
    body: '{ rating: 1–5, text: 10–1500 символов }',
    handler: ({ user, params, body }) => {
      const c = getCourse(db, params.id);
      if (!hasActiveEnrollment(db, user!.id, c.id)) throw forbidden('Отзыв может оставить только ученик, купивший курс');
      const b = parse<{ rating: number; text: string }>(body, { rating: num({ int: true, min: 1, max: 5 }), text: str({ min: 10, max: 1500 }) });
      const id = newId();
      db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, c.id, user!.id, b.rating, b.text, nowIso());
      return { id, rating: b.rating, text: b.text };
    }
  });
}
