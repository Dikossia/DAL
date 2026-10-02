import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.ts';

let t: TestApp, aliya: string, mod: string;
before(async () => { t = await startApp(); [aliya, mod] = await Promise.all(['aliya', 'moderator'].map(n => t.login(`${n}@dal.local`))); });
after(async () => { await t.close(); });

test('жалоба на отзыв: отзыв виден до решения, после «remove» скрыт', async () => {
  assert.equal((await t.api('POST', '/studio/reviews/r4/report', { token: aliya, body: { reason: 'spam' } })).status, 200);
  assert.equal((await t.api('POST', '/studio/reviews/r4/report', { token: aliya, body: { reason: 'spam' } })).body.error.code, 'already_reported');
  let pub = await t.api('GET', '/catalog/courses/c2/reviews');
  assert.ok(pub.body.some((r: any) => r.id === 'r4'), 'пока идёт проверка, отзыв виден');
  const q = await t.api('GET', '/moderation/queue', { token: mod });
  const report = q.body.reports.find((r: any) => r.reviewId === 'r4');
  assert.equal((await t.api('POST', `/moderation/reports/${report.id}/resolve`, { token: mod, body: { action: 'remove' } })).body.status, 'removed');
  pub = await t.api('GET', '/catalog/courses/c2/reviews');
  assert.ok(!pub.body.some((r: any) => r.id === 'r4'));
  assert.equal((await t.api('POST', `/moderation/reports/${report.id}/resolve`, { token: mod, body: { action: 'keep' } })).status, 409);
});

test('имя эксперта меняется только после одобрения модератором', async () => {
  let p = await t.api('POST', '/studio/profile/requests', { token: aliya, body: { field: 'name', value: 'Алия Нурланова-Ким' } });
  assert.equal(p.body.pendingRequests.length, 1);
  assert.equal((await t.api('GET', '/me', { token: aliya })).body.name, 'Алия Нурланова');
  const q = await t.api('GET', '/moderation/queue', { token: mod });
  const req = q.body.profileRequests[0];
  assert.equal((await t.api('POST', `/moderation/profile-requests/${req.id}/approve`, { token: mod })).status, 200);
  assert.equal((await t.api('GET', '/me', { token: aliya })).body.name, 'Алия Нурланова-Ким');
  p = await t.api('PATCH', '/studio/profile', { token: aliya, body: { specialization: 'Оценка компаний', achievements: ['Автор практикума', ' '] } });
  assert.equal(p.body.specialization, 'Оценка компаний');
  assert.deepEqual(p.body.achievements, ['Автор практикума']);
});

test('обзор и доход эксперта считаются из реальных покупок', async () => {
  const ov = await t.api('GET', '/studio/overview', { token: aliya });
  assert.equal(ov.body.verified, true);
  assert.ok(ov.body.students >= 15);
  assert.ok(ov.body.attention.some((a: any) => a.type === 'draft'));
  assert.ok(ov.body.attention.some((a: any) => a.type === 'review'));
  const inc = await t.api('GET', '/studio/income', { token: aliya });
  assert.equal(inc.body.months.length, 6);
  for (const m of inc.body.months) assert.equal(m.net, m.gross - m.commission);
  assert.ok(inc.body.recent.every((s: any) => s.commission === Math.round(s.amount * 0.2)));
  assert.match(inc.body.nextPayout, /^\d{4}-\d{2}-(05|20)$/);
});

test('модерация доступна только модератору', async () => {
  for (const p of ['/moderation/courses/d1/approve', '/moderation/experts/arman/verify']) assert.equal((await t.api('POST', p, { token: aliya })).status, 403);
  assert.equal((await t.api('POST', '/moderation/experts/arman/verify', { token: mod })).body.error.code, 'already_verified');
});
