import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.ts';

let t: TestApp;
before(async () => { t = await startApp(); });
after(async () => { await t.close(); });

test('регистрация ученика и эксперта, вход, /me, выход', async () => {
  const s = await t.api('POST', '/auth/register', { body: { email: 'New@Student.kz', password: 'secret-123', name: 'Новый Ученик', role: 'student' } });
  assert.equal(s.status, 200);
  assert.equal(s.body.user.email, 'new@student.kz');
  const me = await t.api('GET', '/me', { token: s.body.token });
  assert.equal(me.body.role, 'student');

  const e = await t.api('POST', '/auth/register', { body: { email: 'expert@new.kz', password: 'secret-123', name: 'Новый Эксперт', role: 'expert' } });
  assert.equal(e.body.user.verified, false, 'новый эксперт не подтверждён');

  const login = await t.api('POST', '/auth/login', { body: { email: 'new@student.kz', password: 'secret-123' } });
  assert.equal(login.status, 200);
  assert.equal((await t.api('POST', '/auth/logout', { token: login.body.token })).status, 204);
  assert.equal((await t.api('GET', '/me', { token: login.body.token })).status, 401, 'после выхода токен не работает');
});

test('нельзя зарегистрироваться модератором, повторная почта и плохие поля', async () => {
  const mod = await t.api('POST', '/auth/register', { body: { email: 'x@x.kz', password: 'secret-123', name: 'Хакер', role: 'moderator' } });
  assert.equal(mod.status, 422);
  const dup = await t.api('POST', '/auth/register', { body: { email: 'ALIYA@dal.local', password: 'secret-123', name: 'Двойник', role: 'student' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'email_taken');
  const bad = await t.api('POST', '/auth/register', { body: { email: 'нет', password: '123', name: 'A', role: 'student' } });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.body.error.details).sort(), ['email', 'name', 'password']);
});

test('неверный пароль и ограничение попыток', async () => {
  for (let i = 0; i < 10; i++) assert.equal((await t.api('POST', '/auth/login', { body: { email: 'timur@dal.local', password: 'wrong-pass' } })).status, 401);
  const blocked = await t.api('POST', '/auth/login', { body: { email: 'timur@dal.local', password: 'dal-demo-2026' } });
  assert.equal(blocked.status, 429, 'после 10 ошибок даже верный пароль временно не принимается');
});

test('роли: ученик не попадает в студию и модерацию, без входа — 401', async () => {
  const student = await t.login('student@dal.local');
  assert.equal((await t.api('GET', '/studio/courses', { token: student })).status, 403);
  assert.equal((await t.api('GET', '/moderation/queue', { token: student })).status, 403);
  assert.equal((await t.api('GET', '/studio/courses')).status, 401);
  const expert = await t.login('aliya@dal.local');
  assert.equal((await t.api('GET', '/moderation/queue', { token: expert })).status, 403);
  assert.equal((await t.api('POST', '/courses/c1/enroll', { token: expert })).status, 403, 'эксперт не покупает курсы');
});

test('эксперт не может сменить имя напрямую', async () => {
  const expert = await t.login('arman@dal.local');
  assert.equal((await t.api('PATCH', '/me', { token: expert, body: { name: 'Другое Имя' } })).status, 403);
  const student = await t.login('student@dal.local');
  const r = await t.api('PATCH', '/me', { token: student, body: { name: 'Дарын А.' } });
  assert.equal(r.body.name, 'Дарын А.');
});

test('служебное: документация, неизвестный адрес, неверный метод, плохой JSON', async () => {
  assert.equal((await t.api('GET', '/docs')).status, 200);
  assert.ok((await t.api('GET', '/docs.json')).body.routes.length > 40);
  assert.equal((await t.api('GET', '/nope')).status, 404);
  assert.equal((await t.api('DELETE', '/health')).status, 405);
  const bad = await t.api('POST', '/auth/login', { raw: Buffer.from('{oops'), headers: { 'Content-Type': 'application/json' } });
  assert.equal(bad.status, 400);
  assert.equal((await t.api('GET', '/server/src/app.ts')).status, 404, 'исходники сервера не раздаются');
});
