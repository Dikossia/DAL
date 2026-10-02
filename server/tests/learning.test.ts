import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, VIDEO, type TestApp } from './helpers.ts';

let t: TestApp, student: string, other: string, aliya: string;
before(async () => {
  t = await startApp();
  [student, other, aliya] = await Promise.all(['student', 'aigerim', 'aliya'].map(n => t.login(`${n}@dal.local`)));
});
after(async () => { await t.close(); });

const lessonsOf = (course: string) => t.app.db.all<{ id: string; is_free: number }>(
  `SELECT l.id, l.is_free FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ? ORDER BY m.position, l.position`, course);

test('каталог, страница курса и отзывы доступны без входа', async () => {
  const list = await t.api('GET', '/catalog/courses?category=beginner&sort=price');
  assert.ok(list.body.length >= 3);
  assert.ok(list.body.every((c: any) => c.category === 'beginner' && c.status === 'published'));
  assert.deepEqual(list.body.map((c: any) => c.price), [...list.body.map((c: any) => c.price)].sort((a, b) => a - b));
  assert.equal((await t.api('GET', '/catalog/courses/d2')).status, 404, 'черновик не виден');
  const page = await t.api('GET', '/catalog/courses/c4');
  const lesson = page.body.modules[0].lessons[0];
  assert.equal(lesson.isFree, true);
  assert.ok(lesson.videoUrl, 'у бесплатного урока есть ссылка на видео');
  assert.equal(page.body.modules[0].lessons[1].videoUrl, undefined, 'у платного — нет');
  const reviews = await t.api('GET', '/catalog/courses/c4/reviews');
  assert.ok(reviews.body.length >= 2);
  const experts = await t.api('GET', '/experts');
  const al = experts.body.find((e: any) => e.id === 'aliya');
  assert.equal(al.forecasts.success, 3);
  assert.equal(al.forecasts.done, 4);
});

test('видео: бесплатный урок всем, платный — только купившим, с перемоткой', async () => {
  const [free, paid] = lessonsOf('c4');
  const anon = await fetch(`${t.base}/lessons/${free.id}/video`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(anon.status, 206);
  assert.equal(anon.headers.get('content-range'), `bytes 0-99/${VIDEO.length}`);
  assert.equal((await anon.arrayBuffer()).byteLength, 100);
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`)).status, 401);
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`, { token: student })).status, 403);
  // Купившая ученица смотрит через ?token= — так работает тег <video>.
  const ok = await fetch(`${t.base}/lessons/${paid.id}/video?token=${other}`);
  assert.equal(ok.status, 200);
  assert.equal(Number(ok.headers.get('content-length')), VIDEO.length);
  await ok.arrayBuffer();
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`, { token: aliya })).status, 200, 'автор видит свои видео');
});

test('прохождение уроков по порядку и «в процессе»', async () => {
  const lessons = lessonsOf('c1');
  const learning = await t.api('GET', '/me/learning', { token: student });
  assert.equal(learning.body.inProgress.id, 'c1');
  assert.equal(learning.body.inProgress.progress.done, 3);
  assert.equal((await t.api('POST', `/lessons/${lessons[5].id}/complete`, { token: student })).body.error.code, 'previous_lessons');
  const r = await t.api('POST', `/lessons/${lessons[3].id}/complete`, { token: student });
  assert.deepEqual(r.body, { done: 4, total: 12, percent: 33 });
  const content = await t.api('GET', '/learning/courses/c1', { token: student });
  assert.equal(content.body.modules[0].lessons.filter((l: any) => l.completed).length, 4);
  assert.equal((await t.api('GET', '/learning/courses/c4', { token: student })).status, 403);
});

test('возврат: до 20% прохождения и в течение 14 дней', async () => {
  assert.equal((await t.api('POST', '/courses/c3/enroll', { token: student })).status, 200);
  assert.equal((await t.api('POST', '/courses/c3/refund', { token: student })).status, 200);
  assert.equal((await t.api('GET', '/learning/courses/c3', { token: student })).status, 403, 'после возврата доступа нет');
  // Свежая покупка, но пройдено 3 из 14 уроков (21%) — возврат запрещён.
  assert.equal((await t.api('POST', '/courses/c5/enroll', { token: student })).status, 200);
  for (const l of lessonsOf('c5').slice(0, 3)) await t.api('POST', `/lessons/${l.id}/complete`, { token: student });
  assert.equal((await t.api('POST', '/courses/c5/refund', { token: student })).body.error.code, 'refund_progress');
  // Покупка 21 день назад — срок возврата истёк.
  assert.equal((await t.api('POST', '/courses/c1/refund', { token: student })).body.error.code, 'refund_expired');
  // Старая покупка (больше 14 дней) — тоже нет.
  assert.equal((await t.api('POST', '/courses/c2/refund', { token: await t.login('erlan@dal.local') })).body.error.code, 'refund_expired');
});

test('отзыв: только купившим и один раз; эксперт отвечает, но не удаляет', async () => {
  assert.equal((await t.api('POST', '/courses/c4/reviews', { token: student, body: { rating: 5, text: 'Отличный курс, всё понятно' } })).status, 403);
  const r = await t.api('POST', '/courses/c1/reviews', { token: student, body: { rating: 5, text: 'Понятно и по делу, спасибо' } });
  assert.equal(r.status, 200);
  assert.equal((await t.api('POST', '/courses/c1/reviews', { token: student, body: { rating: 4, text: 'Ещё один отзыв' } })).body.error.code, 'review_exists');
  const arman = await t.login('arman@dal.local');
  assert.equal((await t.api('PUT', `/studio/reviews/${r.body.id}/reply`, { token: arman, body: { text: 'Спасибо, Дарын!' } })).status, 200);
  assert.equal((await t.api('DELETE', `/studio/reviews/${r.body.id}`, { token: arman })).body.error.code, 'review_immutable');
  assert.equal((await t.api('PUT', `/studio/reviews/${r.body.id}/reply`, { token: aliya, body: { text: 'Чужой ответ' } })).status, 404, 'на чужой курс не ответить');
  assert.throws(() => t.app.db.run('DELETE FROM reviews WHERE id = ?', r.body.id), /review_immutable/);
});

test('эксперт видит учеников без контактов', async () => {
  const list = await t.api('GET', '/studio/students?course=c4', { token: aliya });
  assert.ok(list.body.length >= 5);
  for (const s of list.body) {
    assert.match(s.name, /^\S+ \S\.$/, 'фамилия сокращена');
    assert.equal(s.email, undefined);
  }
  assert.ok(!JSON.stringify(list.body).includes('@dal.local'));
});
