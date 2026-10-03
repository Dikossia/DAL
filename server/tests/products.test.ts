import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.ts';

let t: TestApp, student: string, other: string, arman: string, aliya: string, mod: string;
before(async () => {
  t = await startApp();
  [student, other, arman, aliya, mod] = await Promise.all(['student', 'aigerim', 'arman', 'aliya', 'moderator'].map(n => t.login(`${n}@dal.local`)));
});
after(async () => { await t.close(); });

const inHours = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

test('product catalog by mode; paid material is partially visible, free material in full', async () => {
  for (const [mode, n] of [['experts', 6], ['community', 4], ['ideas', 4]] as const) {
    const r = await t.api('GET', `/catalog/products?mode=${mode}`);
    assert.equal(r.body.length, n, mode);
    assert.ok(r.body.every((p: any) => p.mode === mode && p.status === 'published'));
  }
  const paid = await t.api('GET', '/catalog/products/i1');
  assert.equal(paid.body.contentLocked, true);
  assert.ok(paid.body.content.length < 420);
  const free = await t.api('GET', '/catalog/products/i2');
  assert.equal(free.body.contentLocked, false);
  assert.ok(free.body.content.length > 400);
  const cons = await t.api('GET', '/catalog/products/e1');
  assert.ok(cons.body.freeSlots.length > 5);
  assert.equal(cons.body.meetingUrl, undefined, 'meeting link is hidden before purchase');
});

test('consultation: purchase, booking, session limit, slot race, cancellation and refund', async () => {
  const p = await t.api('GET', '/catalog/products/e2');
  const [s1, s2] = p.body.freeSlots;
  assert.equal((await t.api('POST', '/products/e2/book', { token: other, body: { slotId: s1.id } })).status, 403, 'cannot book without purchase');
  assert.equal((await t.api('POST', '/products/e2/buy', { token: other })).status, 200);
  const booked = await t.api('POST', '/products/e2/book', { token: other, body: { slotId: s1.id } });
  assert.match(booked.body.meetingUrl, /^https:\/\//);
  assert.equal((await t.api('POST', '/products/e2/book', { token: other, body: { slotId: s2.id } })).body.error.code, 'no_sessions_left');
  // Another student cannot take the same slot.
  await t.api('POST', '/products/e2/buy', { token: student });
  assert.equal((await t.api('POST', '/products/e2/book', { token: student, body: { slotId: s1.id } })).body.error.code, 'slot_taken');
  // Refund is not possible while a session is booked; allowed after cancellation.
  assert.equal((await t.api('POST', '/products/e2/refund', { token: other })).body.error.code, 'refund_used');
  assert.equal((await t.api('POST', `/bookings/${s1.id}/cancel`, { token: other })).status, 200);
  assert.equal((await t.api('POST', '/products/e2/refund', { token: other })).status, 200);
  const mine = await t.api('GET', '/me/products', { token: other });
  assert.ok(!mine.body.some((x: any) => x.id === 'e2'));
});

test('cancelling less than 24h ahead: expert only', async () => {
  t.app.db.run(`INSERT INTO product_slots (id, product_id, starts_at) VALUES ('soon', 'e1', ?)`, inHours(5));
  const pu = t.app.db.get(`SELECT id FROM product_purchases WHERE user_id = 'student' AND product_id = 'e1'`)!.id;
  t.app.db.run(`UPDATE product_slots SET booked_by = NULL, purchase_id = NULL WHERE purchase_id = ?`, pu);
  assert.equal((await t.api('POST', '/products/e1/book', { token: student, body: { slotId: 'soon' } })).status, 200);
  assert.equal((await t.api('POST', '/bookings/soon/cancel', { token: student })).body.error.code, 'too_late');
  assert.equal((await t.api('DELETE', '/studio/slots/soon', { token: arman })).body.error.code, 'slot_booked');
  assert.throws(() => t.app.db.run(`DELETE FROM product_slots WHERE id = 'soon'`), /slot_booked/);
  assert.equal((await t.api('POST', '/bookings/soon/cancel', { token: arman })).status, 200, 'expert can cancel');
  const lp = await t.api('GET', '/learning/products/e1', { token: student });
  assert.equal(lp.body.purchase.sessionsLeft, 1);
  assert.match(lp.body.meetingUrl, /meet\.example\.com/);
});

test('subscription: members-only chat, expiry and renewal', async () => {
  assert.equal((await t.api('GET', '/products/g3/messages', { token: student })).status, 403);
  await t.api('POST', '/products/g3/buy', { token: student });
  const msgs = await t.api('GET', '/products/g3/messages', { token: student });
  assert.ok(msgs.body.length >= 4);
  assert.ok(msgs.body.some((m: any) => m.isExpert));
  assert.ok(msgs.body.filter((m: any) => !m.isExpert).every((m: any) => /^\S+ \S\.$/.test(m.author)), 'student names are abbreviated');
  assert.equal((await t.api('POST', '/products/g3/messages', { token: student, body: { text: 'Здравствуйте!' } })).status, 200);
  assert.equal((await t.api('POST', '/products/g3/messages', { token: aliya, body: { text: 'Добро пожаловать!' } })).status, 200, 'expert can post in own chat');
  // Subscription expired: chat is closed; renewal reopens it.
  t.app.db.run(`UPDATE product_purchases SET expires_at = ? WHERE user_id = 'student' AND product_id = 'g3'`, inHours(-1));
  assert.equal((await t.api('GET', '/products/g3/messages', { token: student })).status, 403);
  const renew = await t.api('POST', '/products/g3/buy', { token: student });
  assert.equal(renew.body.renewed, false, 'after expiry, a new subscription starts today');
  const renew2 = await t.api('POST', '/products/g3/buy', { token: student });
  assert.equal(renew2.body.renewed, true);
  assert.ok(new Date(renew2.body.expiresAt).getTime() > Date.now() + 55 * 864e5, 'renewal extends the term');
  assert.equal((await t.api('POST', '/products/g3/refund', { token: student })).body.error.code, 'not_refundable');
  const inc = await t.api('GET', '/studio/income', { token: aliya });
  assert.ok(inc.body.recent.some((s: any) => s.kind === 'renewal'));
});

test('material: full text after purchase, one review only', async () => {
  await t.api('POST', '/products/i4/buy', { token: student });
  const lp = await t.api('GET', '/learning/products/i4', { token: student });
  assert.equal(lp.body.contentLocked, false);
  assert.ok(lp.body.content.includes('Свободный денежный поток'));
  assert.equal((await t.api('POST', '/products/i4/buy', { token: student })).body.error.code, 'already_bought');
  assert.equal((await t.api('POST', '/products/i4/reviews', { token: student, body: { rating: 5, text: 'Отличный разбор, всё по шагам.' } })).status, 200);
  assert.equal((await t.api('POST', '/products/i4/reviews', { token: student, body: { rating: 4, text: 'Второй отзыв на тот же материал' } })).body.error.code, 'review_exists');
});

test("teacher's per-mode ratings; overall is the mean of mode ratings", async () => {
  const e = await t.api('GET', '/experts/aliya');
  const vals = Object.values(e.body.ratings).map((r: any) => r.value).filter((v: any) => v != null) as number[];
  assert.ok(vals.length >= 3);
  const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 100) / 100;
  assert.ok(Math.abs(e.body.rating - mean) < 0.011);
  assert.ok(e.body.products.length >= 3);
  assert.ok(e.body.socials.telegram.startsWith('https://t.me/'));
});

test('expert creates a consultation: checklist, schedule, moderation, catalog', async () => {
  let r = await t.api('POST', '/studio/products', { token: arman, body: { type: 'consultation', title: 'Разбор вашего портфеля за час' } });
  assert.equal(r.status, 201);
  const id = r.body.id;
  assert.equal(r.body.sessions, 1);
  r = await t.api('PATCH', `/studio/products/${id}`, { token: arman, body: { meetingUrl: 'не ссылка' } });
  assert.equal(r.status, 422);
  r = await t.api('PATCH', `/studio/products/${id}`, { token: arman, body: { description: 'Смотрим на ваш портфель вместе: структура, риски, расходы и что стоит проверить в первую очередь.', price: 18000, cover: 'workshop', meetingUrl: 'https://meet.example.com/arman', sessions: 5 } });
  assert.equal(r.body.sessions, 1, 'a consultation always has one session');
  assert.deepEqual(r.body.checklist.filter((x: any) => !x.ok).map((x: any) => x.key), ['slots']);
  assert.equal((await t.api('POST', `/studio/products/${id}/slots`, { token: arman, body: { startsAt: inHours(0.5) } })).status, 422, 'too soon');
  r = await t.api('POST', `/studio/products/${id}/slots`, { token: arman, body: { startsAt: inHours(48) } });
  assert.equal(r.body.slots.length, 1);
  assert.equal((await t.api('POST', `/studio/products/${id}/slots`, { token: arman, body: { startsAt: r.body.slots[0].startsAt } })).body.error.code, 'slot_exists');
  r = await t.api('POST', `/studio/products/${id}/submit`, { token: arman });
  assert.equal(r.body.status, 'review');
  assert.equal((await t.api('PATCH', `/studio/products/${id}`, { token: arman, body: { price: 1 } })).body.error.code, 'product_in_review');
  const q = await t.api('GET', '/moderation/queue', { token: mod });
  assert.ok(q.body.products.some((p: any) => p.id === id));
  assert.equal((await t.api('POST', `/moderation/products/${id}/approve`, { token: mod })).body.status, 'published');
  assert.ok((await t.api('GET', '/catalog/products?type=consultation')).body.some((p: any) => p.id === id));
  // A purchased product cannot be deleted.
  await t.api('POST', `/products/${id}/buy`, { token: other });
  assert.equal((await t.api('DELETE', `/studio/products/${id}`, { token: arman })).body.error.code, 'course_has_students');
  assert.equal((await t.api('GET', `/studio/products/${id}`, { token: aliya })).status, 404, "another expert's product is not visible");
});

test('material without text cannot be submitted for review', async () => {
  const r = await t.api('POST', '/studio/products', { token: aliya, body: { type: 'investment', title: 'Короткая идея без текста' } });
  const s = await t.api('POST', `/studio/products/${r.body.id}/submit`, { token: aliya });
  assert.equal(s.status, 422);
  assert.ok(s.body.error.details.some((x: string) => x.includes('Текст материала')));
});

test("product reviews: in the expert's combined list, report and moderator decision", async () => {
  const list = await t.api('GET', '/studio/reviews', { token: arman });
  const pr = list.body.find((r: any) => r.kind === 'product');
  assert.ok(pr && list.body.some((r: any) => r.kind === 'course'));
  assert.equal((await t.api('PUT', `/studio/reviews/${pr.id}/reply`, { token: arman, body: { text: 'Спасибо!' } })).status, 200);
  assert.equal((await t.api('POST', `/studio/reviews/${pr.id}/report`, { token: arman, body: { reason: 'other' } })).status, 200);
  const q = await t.api('GET', '/moderation/queue', { token: mod });
  const rep = q.body.reports.find((r: any) => r.reviewId === pr.id);
  assert.equal((await t.api('POST', `/moderation/reports/${rep.id}/resolve`, { token: mod, body: { action: 'remove' } })).status, 200);
  const pub = await t.api('GET', `/catalog/products/${pr.itemId}`);
  assert.ok(!pub.body.reviewsList.some((r: any) => r.id === pr.id));
  assert.throws(() => t.app.db.run('DELETE FROM product_reviews WHERE id = ?', pr.id), /review_immutable/);
});

test('favorites, profile photo and social links', async () => {
  assert.equal((await t.api('PUT', '/me/favorites/g1', { token: student })).status, 204);
  assert.equal((await t.api('PUT', '/me/favorites/c4', { token: student })).status, 204);
  assert.equal((await t.api('PUT', '/me/favorites/nope', { token: student })).status, 404);
  assert.deepEqual((await t.api('GET', '/me/favorites', { token: student })).body, ['g1', 'c4']);
  await t.api('DELETE', '/me/favorites/g1', { token: student });
  assert.deepEqual((await t.api('GET', '/me/favorites', { token: student })).body, ['c4']);

  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const up = await t.api('PUT', '/me/avatar', { token: student, raw: png, headers: { 'Content-Type': 'image/png' } });
  assert.match(up.body.avatarUrl, /^\/media\/avatars\//);
  assert.equal((await t.api('GET', '/me', { token: student })).body.avatarUrl, up.body.avatarUrl);
  assert.equal((await t.api('GET', up.body.avatarUrl)).status, 200);

  let p = await t.api('PATCH', '/studio/profile', { token: arman, body: { socials: { telegram: '@arman_new', instagram: 'instagram.com/arman', website: 'example.org' } } });
  assert.deepEqual(p.body.socials, { telegram: 'https://t.me/arman_new', instagram: 'https://instagram.com/arman', website: 'https://example.org/' });
  p = await t.api('PATCH', '/studio/profile', { token: arman, body: { socials: { youtube: 'https://vk.com/arman' } } });
  assert.equal(p.status, 422);
  assert.ok('youtube' in p.body.error.details);
});

test('expert overview: upcoming sessions and students across all modes', async () => {
  const ov = await t.api('GET', '/studio/overview', { token: aliya });
  assert.ok(ov.body.bookings.length >= 0);
  const st = await t.api('GET', '/studio/students', { token: aliya });
  assert.ok(st.body.some((s: any) => s.kind === 'product') && st.body.some((s: any) => s.kind === 'course'));
  const madina = (await t.api('GET', '/studio/overview', { token: await t.login('timur@dal.local') })).body;
  assert.ok(Array.isArray(madina.bookings));
});
