import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, type TestApp } from './helpers.ts';

let t: TestApp, aliya: string, arman: string, mod: string, student: string;
before(async () => {
  t = await startApp();
  [aliya, arman, mod, student] = await Promise.all(['aliya', 'arman', 'moderator', 'student'].map(n => t.login(`${n}@dal.local`)));
});
after(async () => { await t.close(); });

test('full course lifecycle: draft → video → moderation → catalog → purchase', async () => {
  const created = await t.api('POST', '/studio/courses', { token: aliya, body: { title: 'Денежный поток на практике', category: 'advanced' } });
  assert.equal(created.status, 201);
  const id = created.body.id, moduleId = created.body.modules[0].id;
  assert.equal(created.body.status, 'draft');

  let r = await t.api('PATCH', `/studio/courses/${id}`, { token: aliya, body: { description: 'Учимся читать отчёт о движении денежных средств и отличать устойчивый поток от разового, на трёх реальных примерах.', price: 25900, cover: 'analytics' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.coverUrl, '/assets/analytics.jpg');

  const lessons: string[] = [];
  for (const title of ['Откуда берутся деньги', 'Операционный поток', 'Капитальные затраты']) {
    r = await t.api('POST', `/studio/modules/${moduleId}/lessons`, { token: aliya, body: { title } });
    lessons.push(r.body.lessonId);
  }

  // Cannot submit without videos: the response lists what is missing.
  r = await t.api('POST', `/studio/courses/${id}/submit`, { token: aliya });
  assert.equal(r.status, 422);
  assert.deepEqual(r.body.error.details, ['Видео загружено во все уроки']);

  // Video: wrong type is rejected, correct one is uploaded.
  assert.equal((await t.uploadVideo(aliya, lessons[0], Buffer.from('text'), 'text/plain')).status, 415);
  for (const l of lessons) {
    r = await t.uploadVideo(aliya, l);
    assert.equal(r.status, 200);
    assert.equal(r.body.name, 'урок.mp4');
    assert.equal(r.body.duration, 10);
  }
  const files = fs.readdirSync(path.join(t.storageDir, 'videos', id));
  assert.equal(files.length, 3, 'files are stored in the course folder');

  r = await t.api('POST', `/studio/courses/${id}/submit`, { token: aliya });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'review');

  // Course is frozen while in review.
  assert.equal((await t.api('PATCH', `/studio/courses/${id}`, { token: aliya, body: { price: 1 } })).body.error.code, 'course_in_review');
  assert.equal((await t.uploadVideo(aliya, lessons[0])).status, 409);
  assert.equal((await t.api('DELETE', `/studio/courses/${id}`, { token: aliya })).status, 409);

  // Moderator sees the course in the queue and approves it.
  const queue = await t.api('GET', '/moderation/queue', { token: mod });
  assert.ok(queue.body.courses.some((c: any) => c.id === id));
  r = await t.api('POST', `/moderation/courses/${id}/approve`, { token: mod });
  assert.equal(r.body.status, 'published');

  const catalog = await t.api('GET', '/catalog/courses?q=денежный');
  assert.equal(catalog.body.length, 1);
  assert.equal(catalog.body[0].price, 25900);

  // Purchase locks the price: a price change affects only new purchases.
  assert.equal((await t.api('POST', `/courses/${id}/enroll`, { token: student })).status, 200);
  assert.equal((await t.api('POST', `/courses/${id}/enroll`, { token: student })).status, 409);
  await t.api('PATCH', `/studio/courses/${id}`, { token: aliya, body: { price: 39900 } });
  const income = await t.api('GET', '/studio/income', { token: aliya });
  const sale = income.body.recent.find((s: any) => s.courseId === id);
  assert.equal(sale.amount, 25900);
  assert.equal(sale.commission, 5180);

  // Published course: lessons and videos cannot be deleted; videos can be replaced, lessons added.
  assert.equal((await t.api('DELETE', `/studio/lessons/${lessons[0]}`, { token: aliya })).body.error.code, 'course_live');
  assert.equal((await t.api('DELETE', `/studio/lessons/${lessons[0]}/video`, { token: aliya })).status, 409);
  r = await t.uploadVideo(aliya, lessons[0]);
  assert.equal(r.body.updatedAfterPublish, true);
  assert.equal(fs.readdirSync(path.join(t.storageDir, 'videos', id)).length, 3, 'old file is removed on replacement');
  assert.equal((await t.api('POST', `/studio/modules/${moduleId}/lessons`, { token: aliya, body: { title: 'Бонус' } })).status, 200);

  // A purchased course cannot be deleted, neither via the API nor directly in the DB.
  assert.equal((await t.api('DELETE', `/studio/courses/${id}`, { token: aliya })).body.error.code, 'course_has_students');
  assert.throws(() => t.app.db.run('DELETE FROM courses WHERE id = ?', id), /course_has_students/);

  // Hiding: removed from the catalog, buyers keep access.
  assert.equal((await t.api('POST', `/studio/courses/${id}/hide`, { token: aliya })).body.status, 'hidden');
  assert.equal((await t.api('GET', `/catalog/courses/${id}`)).status, 404);
  assert.equal((await t.api('GET', `/learning/courses/${id}`, { token: student })).status, 200);
});

test('at most two free lessons', async () => {
  const c = await t.api('POST', '/studio/courses', { token: aliya, body: {} });
  const mid = c.body.modules[0].id;
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) ids.push((await t.api('POST', `/studio/modules/${mid}/lessons`, { token: aliya, body: { title: `Урок ${i}` } })).body.lessonId);
  assert.equal((await t.api('PATCH', `/studio/lessons/${ids[0]}`, { token: aliya, body: { isFree: true } })).status, 200);
  assert.equal((await t.api('PATCH', `/studio/lessons/${ids[1]}`, { token: aliya, body: { isFree: true } })).status, 200);
  const third = await t.api('PATCH', `/studio/lessons/${ids[2]}`, { token: aliya, body: { isFree: true } });
  assert.equal(third.body.error.code, 'free_limit');
});

test('draft: reordering, deleting lessons, modules and the course along with files', async () => {
  const c = await t.api('POST', '/studio/courses', { token: aliya, body: { title: 'Временный курс' } });
  const id = c.body.id, mid = c.body.modules[0].id;
  const a = (await t.api('POST', `/studio/modules/${mid}/lessons`, { token: aliya, body: { title: 'А' } })).body.lessonId;
  const b = (await t.api('POST', `/studio/modules/${mid}/lessons`, { token: aliya, body: { title: 'Б' } })).body.lessonId;
  let r = await t.api('POST', `/studio/lessons/${b}/move`, { token: aliya, body: { direction: 'up' } });
  assert.deepEqual(r.body.modules[0].lessons.map((l: any) => l.title), ['Б', 'А']);
  assert.equal((await t.api('POST', `/studio/lessons/${b}/move`, { token: aliya, body: { direction: 'up' } })).status, 409);
  await t.uploadVideo(aliya, a);
  assert.equal((await t.api('DELETE', `/studio/lessons/${a}/video`, { token: aliya })).status, 200, 'video can be deleted in a draft');
  assert.equal((await t.api('DELETE', `/studio/modules/${mid}`, { token: aliya })).body.error.code, 'last_module');
  await t.uploadVideo(aliya, b);
  assert.equal((await t.api('DELETE', `/studio/courses/${id}`, { token: aliya })).status, 204);
  assert.equal(fs.existsSync(path.join(t.storageDir, 'videos', id)) ? fs.readdirSync(path.join(t.storageDir, 'videos', id)).length : 0, 0, 'files are deleted');
});

test("other experts' courses are neither visible nor editable", async () => {
  assert.equal((await t.api('GET', '/studio/courses/c4', { token: arman })).status, 404);
  assert.equal((await t.api('PATCH', '/studio/courses/c4', { token: arman, body: { price: 1 } })).status, 404);
  const lesson = t.app.db.get(`SELECT l.id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = 'c4' LIMIT 1`)!.id;
  assert.equal((await t.uploadVideo(arman, lesson)).status, 404);
  const mine = await t.api('GET', '/studio/courses', { token: arman });
  assert.ok(mine.body.every((c: any) => c.expert.id === 'arman'));
});

test('unverified expert can prepare a course but not submit it for review', async () => {
  const reg = await t.api('POST', '/auth/register', { body: { email: 'fresh@expert.kz', password: 'secret-123', name: 'Свежий Эксперт', role: 'expert' } });
  const tok = reg.body.token;
  const c = await t.api('POST', '/studio/courses', { token: tok, body: { title: 'Мой первый курс' } });
  assert.equal(c.status, 201);
  const r = await t.api('POST', `/studio/courses/${c.body.id}/submit`, { token: tok });
  assert.equal(r.status, 403);
  assert.match(r.body.error.message, /подтверждения личности/);
});

test('moderator rejects a course with a note', async () => {
  const r = await t.api('POST', '/moderation/courses/d1/reject', { token: mod, body: { note: 'Во втором уроке нет звука' } });
  assert.equal(r.body.status, 'draft');
  const ov = await t.api('GET', '/studio/overview', { token: aliya });
  assert.ok(ov.body.attention.some((a: any) => a.type === 'rejected' && a.detail.includes('нет звука')));
});

test('custom cover: image up to 5 MB', async () => {
  const c = await t.api('POST', '/studio/courses', { token: aliya, body: {} });
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  let r = await t.api('PUT', `/studio/courses/${c.body.id}/cover`, { token: aliya, raw: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(r.status, 200);
  assert.match(r.body.coverUrl, /^\/media\/covers\/.+\.png$/);
  assert.equal((await t.api('GET', r.body.coverUrl)).status, 200);
  r = await t.api('PUT', `/studio/courses/${c.body.id}/cover`, { token: aliya, raw: Buffer.alloc(6 * 1024 * 1024), headers: { 'Content-Type': 'image/png' } });
  assert.equal(r.status, 413);
});
