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

test('catalog, course page and reviews are available without login', async () => {
  const list = await t.api('GET', '/catalog/courses?category=beginner&sort=price');
  assert.ok(list.body.length >= 3);
  assert.ok(list.body.every((c: any) => c.category === 'beginner' && c.status === 'published'));
  assert.deepEqual(list.body.map((c: any) => c.price), [...list.body.map((c: any) => c.price)].sort((a, b) => a - b));
  assert.equal((await t.api('GET', '/catalog/courses/d2')).status, 404, 'draft is not visible');
  const page = await t.api('GET', '/catalog/courses/c4');
  const lesson = page.body.modules[0].lessons[0];
  assert.equal(lesson.isFree, true);
  assert.ok(lesson.videoUrl, 'free lesson has a video URL');
  assert.equal(page.body.modules[0].lessons[1].videoUrl, undefined, 'paid lesson does not');
  const reviews = await t.api('GET', '/catalog/courses/c4/reviews');
  assert.ok(reviews.body.length >= 2);
  const experts = await t.api('GET', '/experts');
  const al = experts.body.find((e: any) => e.id === 'aliya');
  assert.equal(al.forecasts.success, 3);
  assert.equal(al.forecasts.done, 4);
});

test('video: free lesson for everyone, paid only for buyers, with range requests', async () => {
  const [free, paid] = lessonsOf('c4');
  const anon = await fetch(`${t.base}/lessons/${free.id}/video`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(anon.status, 206);
  assert.equal(anon.headers.get('content-range'), `bytes 0-99/${VIDEO.length}`);
  assert.equal((await anon.arrayBuffer()).byteLength, 100);
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`)).status, 401);
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`, { token: student })).status, 403);
  // A buyer watches via ?token= — this is how the <video> tag works.
  const ok = await fetch(`${t.base}/lessons/${paid.id}/video?token=${other}`);
  assert.equal(ok.status, 200);
  assert.equal(Number(ok.headers.get('content-length')), VIDEO.length);
  await ok.arrayBuffer();
  assert.equal((await t.api('GET', `/lessons/${paid.id}/video`, { token: aliya })).status, 200, 'author can view own videos');
});

test('lessons are completed in order; "in progress" course', async () => {
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

test('refund: under 20% progress and within 14 days', async () => {
  assert.equal((await t.api('POST', '/courses/c3/enroll', { token: student })).status, 200);
  assert.equal((await t.api('POST', '/courses/c3/refund', { token: student })).status, 200);
  assert.equal((await t.api('GET', '/learning/courses/c3', { token: student })).status, 403, 'no access after refund');
  // Recent purchase, but 3 of 14 lessons done (21%): refund denied.
  assert.equal((await t.api('POST', '/courses/c5/enroll', { token: student })).status, 200);
  for (const l of lessonsOf('c5').slice(0, 3)) await t.api('POST', `/lessons/${l.id}/complete`, { token: student });
  assert.equal((await t.api('POST', '/courses/c5/refund', { token: student })).body.error.code, 'refund_progress');
  // Purchased 21 days ago: refund window expired.
  assert.equal((await t.api('POST', '/courses/c1/refund', { token: student })).body.error.code, 'refund_expired');
  // Old purchase (over 14 days): also denied.
  assert.equal((await t.api('POST', '/courses/c2/refund', { token: await t.login('erlan@dal.local') })).body.error.code, 'refund_expired');
});

test('review: buyers only, after finishing the course, once; expert can reply but not delete', async () => {
  assert.equal((await t.api('POST', '/courses/c4/reviews', { token: student, body: { rating: 5, text: 'Отличный курс, всё понятно' } })).status, 403);
  const early = await t.api('POST', '/courses/c1/reviews', { token: student, body: { rating: 5, text: 'Понятно и по делу, спасибо' } });
  assert.equal(early.body.error.code, 'course_not_completed', 'course not fully completed');
  for (const l of lessonsOf('c1')) await t.api('POST', `/lessons/${l.id}/complete`, { token: student });
  const r = await t.api('POST', '/courses/c1/reviews', { token: student, body: { rating: 5, text: 'Понятно и по делу, спасибо' } });
  assert.equal(r.status, 200);
  assert.throws(() => t.app.db.run('UPDATE reviews SET rating = 1 WHERE id = ?', r.body.id), /review_immutable/, 'review cannot be modified');
  assert.equal((await t.api('POST', '/courses/c1/reviews', { token: student, body: { rating: 4, text: 'Ещё один отзыв' } })).body.error.code, 'review_exists');
  const arman = await t.login('arman@dal.local');
  assert.equal((await t.api('PUT', `/studio/reviews/${r.body.id}/reply`, { token: arman, body: { text: 'Спасибо, Дарын!' } })).status, 200);
  assert.equal((await t.api('DELETE', `/studio/reviews/${r.body.id}`, { token: arman })).body.error.code, 'review_immutable');
  assert.equal((await t.api('PUT', `/studio/reviews/${r.body.id}/reply`, { token: aliya, body: { text: 'Чужой ответ' } })).status, 404, "cannot reply on another expert's course");
  assert.throws(() => t.app.db.run('DELETE FROM reviews WHERE id = ?', r.body.id), /review_immutable/);
});

test('expert sees students without contact details', async () => {
  const list = await t.api('GET', '/studio/students?course=c4', { token: aliya });
  assert.ok(list.body.length >= 5);
  for (const s of list.body) {
    assert.match(s.name, /^\S+ \S\.$/, 'last name is abbreviated');
    assert.equal(s.email, undefined);
  }
  assert.ok(!JSON.stringify(list.body).includes('@dal.local'));
});

test('lesson questions: course students and the expert only, not outsiders', async () => {
  const [first] = lessonsOf('c1');
  const list = await t.api('GET', `/lessons/${first.id}/comments`, { token: student });
  assert.equal(list.status, 200);
  assert.ok(list.body.some((c: any) => c.role === 'expert'), 'demo data includes an expert reply');
  const q = await t.api('POST', `/lessons/${first.id}/comments`, { token: student, body: { text: 'Где посмотреть комиссию брокера?' } });
  assert.equal(q.status, 200);
  assert.equal(q.body.mine, true);
  const arman = await t.login('arman@dal.local');
  const a = await t.api('POST', `/lessons/${first.id}/comments`, { token: arman, body: { text: 'В тарифах брокера, разберём в уроке 9.' } });
  assert.equal(a.body.role, 'expert');
  assert.equal((await t.api('GET', `/lessons/${first.id}/comments`, { token: aliya })).status, 403, 'another expert');
  assert.equal((await t.api('GET', `/lessons/${first.id}/comments`)).status, 401);
  assert.equal((await t.api('DELETE', `/lessons/comments/${q.body.id}`, { token: other })).status, 403);
  assert.equal((await t.api('DELETE', `/lessons/comments/${q.body.id}`, { token: student })).status, 200);
  assert.ok(!(await t.api('GET', `/lessons/${first.id}/comments`, { token: student })).body.some((c: any) => c.id === q.body.id));
});

test('review is anchored on Solana once and only by its author', async () => {
  const list = await t.api('GET', '/catalog/courses/c8/reviews', { token: student });
  assert.ok(!list.body.some((r: any) => r.mine), 'demo student has no review on c8 yet');
  const r = await t.api('POST', '/courses/c8/reviews', { token: student, body: { rating: 5, text: 'Живой разбор, всё на примерах' } });
  assert.equal(r.status, 200, 'c8 is fully completed');
  const mine = (await t.api('GET', '/catalog/courses/c8/reviews', { token: student })).body.find((x: any) => x.mine);
  assert.match(mine.memo, new RegExp(`^DAL review v1 \\| id=${r.body.id} \\| course=c8 \\| rating=5 \\| completed=true`));
  assert.equal(mine.anchor, null);
  const sig = '5'.repeat(88), wallet = '7'.repeat(44);
  assert.equal((await t.api('POST', `/reviews/${r.body.id}/anchor`, { token: other, body: { signature: sig, wallet, cluster: 'devnet' } })).status, 404, "someone else's review");
  const ok = await t.api('POST', `/reviews/${r.body.id}/anchor`, { token: student, body: { signature: sig, wallet, cluster: 'devnet' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.anchor.signature, sig);
  assert.equal((await t.api('POST', `/reviews/${r.body.id}/anchor`, { token: student, body: { signature: '6'.repeat(88), wallet, cluster: 'devnet' } })).body.error.code, 'already_anchored');
  const pub = (await t.api('GET', '/catalog/courses/c8/reviews')).body.find((x: any) => x.id === r.body.id);
  assert.equal(pub.anchor.signature, sig, 'anchor is visible to everyone');
  assert.equal(pub.mine, false);
  assert.throws(() => t.app.db.run('DELETE FROM review_anchors WHERE review_id = ?', r.body.id), /anchor_immutable/);
});
