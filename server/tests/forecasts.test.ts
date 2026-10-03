import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.ts';
import { addDays } from '../src/util.ts';

let t: TestApp, timur: string, mod: string;
const RATIONALE = 'Гипотеза основана на росте выручки трёх кварталов подряд и снижении долговой нагрузки. Главный риск: замедление спроса и рост ставок в ближайшие месяцы.';
const valid = (o: Record<string, unknown> = {}) => ({ ticker: 'KO', name: 'Coca-Cola', direction: 'up', startPrice: 64, targetPrice: 70, deadline: addDays(40), rationale: RATIONALE, acknowledged: true, ...o });

before(async () => { t = await startApp(); [timur, mod] = await Promise.all(['timur', 'moderator'].map(n => t.login(`${n}@dal.local`))); });
after(async () => { await t.close(); });

test('forecast field validation', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ targetPrice: 60 }, 'targetPrice'],
    [{ direction: 'down', targetPrice: 70 }, 'targetPrice'],
    [{ deadline: addDays(0) }, 'deadline'],
    [{ deadline: addDays(400) }, 'deadline'],
    [{ rationale: 'Коротко' }, 'rationale'],
    [{ acknowledged: false }, 'acknowledged'],
    [{ ticker: 'TOO-LONG' }, 'ticker']
  ];
  for (const [patch, field] of cases) {
    const r = await t.api('POST', '/studio/forecasts', { token: timur, body: valid(patch) });
    assert.equal(r.status, 422, JSON.stringify(patch));
    assert.ok(field in r.body.error.details, `error on field ${field}`);
  }
});

test('publishing: one open forecast per ticker, limit of five', async () => {
  const first = await t.api('POST', '/studio/forecasts', { token: timur, body: valid({ ticker: 'ko' }) });
  assert.equal(first.status, 201);
  assert.equal(first.body.ticker, 'KO');
  const dup = await t.api('POST', '/studio/forecasts', { token: timur, body: valid({ direction: 'down', targetPrice: 58 }) });
  assert.equal(dup.body.error.code, 'forecast_ticker_open', 'cannot bet on both up and down');
  for (const tk of ['AA', 'BB', 'CC', 'DD']) assert.equal((await t.api('POST', '/studio/forecasts', { token: timur, body: valid({ ticker: tk }) })).status, 201);
  const sixth = await t.api('POST', '/studio/forecasts', { token: timur, body: valid({ ticker: 'EE' }) });
  assert.equal(sixth.body.error.code, 'forecast_limit');
  const mine = await t.api('GET', '/studio/forecasts', { token: timur });
  assert.equal(mine.body.stats.open, 5);
});

test('published forecast cannot be changed or deleted, neither via the API nor in the DB', async () => {
  const f = (await t.api('GET', '/studio/forecasts', { token: timur })).body.forecasts[0];
  assert.equal((await t.api('PATCH', `/studio/forecasts/${f.id}`, { token: timur, body: { targetPrice: 1 } })).status, 409);
  assert.equal((await t.api('DELETE', `/studio/forecasts/${f.id}`, { token: timur })).status, 409);
  assert.throws(() => t.app.db.run('UPDATE forecasts SET target_price = 1 WHERE id = ?', f.id), /forecast_immutable/);
  assert.throws(() => t.app.db.run('DELETE FROM forecasts WHERE id = ?', f.id), /forecast_immutable/);
  const c = await t.api('POST', `/studio/forecasts/${f.id}/comments`, { token: timur, body: { text: 'Первый отчёт вышел, условие не меняется.' } });
  assert.equal(c.body.comments.length, 1);
  assert.equal(c.body.targetPrice, f.targetPrice);
});

test('resolution: only after the deadline, by price, and only once', async () => {
  const open = (await t.api('GET', '/studio/forecasts', { token: timur })).body.forecasts.find((f: any) => f.ticker === 'KO');
  assert.equal((await t.api('POST', `/moderation/forecasts/${open.id}/resolve`, { token: mod, body: { closePrice: 80 } })).body.error.code, 'too_early');
  // Forecasts past their deadline (in demo data, Aliya's AAPL resolves on 2026-10-15).
  t.app.db.run(`INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at) VALUES ('old-up', 'timur', 'OLD1', 'Old', 'up', 10, 12, ?, 'тест', ?)`, addDays(-1), new Date().toISOString());
  t.app.db.run(`INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at) VALUES ('old-down', 'timur', 'OLD2', 'Old', 'down', 10, 8, ?, 'тест', ?)`, addDays(-1), new Date().toISOString());
  const q = await t.api('GET', '/moderation/queue', { token: mod });
  assert.ok(q.body.forecastsToResolve.some((f: any) => f.id === 'old-up'));
  assert.equal((await t.api('POST', '/moderation/forecasts/old-up/resolve', { token: mod, body: { closePrice: 12 } })).body.status, 'success', 'exactly at target counts as success');
  assert.equal((await t.api('POST', '/moderation/forecasts/old-down/resolve', { token: mod, body: { closePrice: 8.5 } })).body.status, 'miss');
  assert.equal((await t.api('POST', '/moderation/forecasts/old-up/resolve', { token: mod, body: { closePrice: 1 } })).body.error.code, 'forecast_resolved');
  assert.throws(() => t.app.db.run(`UPDATE forecasts SET status = 'success' WHERE id = 'old-down'`), /forecast_already_resolved/);
  assert.equal((await t.api('POST', '/studio/forecasts/old-up/comments', { token: timur, body: { text: 'Поздний комментарий к итогу' } })).status, 409);
});

test('unverified expert cannot publish forecasts; forecast log is public', async () => {
  const reg = await t.api('POST', '/auth/register', { body: { email: 'new@fc.kz', password: 'secret-123', name: 'Новичок', role: 'expert' } });
  assert.equal((await t.api('POST', '/studio/forecasts', { token: reg.body.token, body: valid() })).status, 403);
  const id = reg.body.user.id;
  assert.equal((await t.api('POST', `/moderation/experts/${id}/verify`, { token: mod })).status, 200);
  assert.equal((await t.api('POST', '/studio/forecasts', { token: reg.body.token, body: valid() })).status, 201);
  const pub = await t.api('GET', '/forecasts?status=done');
  assert.ok(pub.body.length >= 6);
  assert.ok(pub.body.every((f: any) => f.status !== 'active'));
});
