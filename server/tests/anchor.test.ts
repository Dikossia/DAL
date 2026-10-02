import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, type TestApp } from './helpers.ts';

let t: TestApp, aliya: string, arman: string;
before(async () => { t = await startApp(); [aliya, arman] = await Promise.all(['aliya', 'arman'].map(n => t.login(`${n}@dal.local`))); });
after(async () => { await t.close(); });

const SIG = '4'.repeat(40) + 'abcdefghijkmnopqrstuvwxyz', WAL = 'BZeSX952nUiCc2vrhn57fnfb5xPD8ynWpwsFXJf7cawt';

test('фиксация прогноза в Solana: один раз, только автор, ссылка видна всем', async () => {
  const mine = (await t.api('GET', '/studio/forecasts', { token: aliya })).body.forecasts[0];
  assert.match(mine.memo, new RegExp(`^DAL forecast v1 \\| id=${mine.id} \\| ${mine.ticker} `));
  assert.equal(mine.anchor, null);
  assert.equal((await t.api('POST', `/studio/forecasts/${mine.id}/anchor`, { token: arman, body: { signature: SIG, wallet: WAL, cluster: 'devnet' } })).status, 404);
  assert.equal((await t.api('POST', `/studio/forecasts/${mine.id}/anchor`, { token: aliya, body: { signature: 'bad!', wallet: WAL, cluster: 'devnet' } })).status, 422);
  const r = await t.api('POST', `/studio/forecasts/${mine.id}/anchor`, { token: aliya, body: { signature: SIG, wallet: WAL, cluster: 'devnet' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.anchor.explorerUrl, `https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
  assert.equal((await t.api('POST', `/studio/forecasts/${mine.id}/anchor`, { token: aliya, body: { signature: SIG.replace('4', '5'), wallet: WAL, cluster: 'devnet' } })).body.error.code, 'already_anchored');
  const pub = (await t.api('GET', '/forecasts')).body.find((f: any) => f.id === mine.id);
  assert.equal(pub.anchor.signature, SIG);
  assert.equal(pub.memo, mine.memo);
  assert.throws(() => t.app.db.run('DELETE FROM forecast_anchors'), /anchor_immutable/);
});
