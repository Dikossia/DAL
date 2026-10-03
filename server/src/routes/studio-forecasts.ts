import type { App } from '../app.ts';
import { HttpError, notFound, conflict } from '../http.ts';
import { parse, str, num, oneOf, date, bool } from '../validate.ts';
import { RULES } from '../rules.ts';
import { newId, nowIso, addDays } from '../util.ts';
import { assertVerifiedExpert } from '../courses.ts';
import { forecastMemo, forecastAnchor } from '../anchor.ts';

const E: ['expert'] = ['expert'];

export const forecastView = (db: App['db'], f: any) => ({
  id: f.id, ticker: f.ticker, name: f.name, direction: f.direction, startPrice: f.start_price, targetPrice: f.target_price,
  changePercent: Math.round((f.target_price - f.start_price) / f.start_price * 1000) / 10,
  deadline: f.deadline, rationale: f.rationale, status: f.status, resultPrice: f.result_price,
  publishedAt: f.published_at, resolvedAt: f.resolved_at,
  condition: `Цена закрытия ${f.ticker} на ${f.deadline} ${f.direction === 'up' ? 'не ниже' : 'не выше'} $${f.target_price}`,
  comments: db.all('SELECT id, text, created_at AS createdAt FROM forecast_comments WHERE forecast_id = ? ORDER BY created_at', f.id),
  memo: forecastMemo(f), anchor: forecastAnchor(db, f.id)
});

export function registerStudioForecasts(app: App) {
  const { db, router } = app;

  router.add({
    method: 'POST', path: '/studio/forecasts/:id/anchor', group: 'Studio: forecasts',
    summary: 'Save a link to the Solana transaction anchoring the forecast terms (memo). Done once.', auth: E,
    body: '{ signature, wallet, cluster: "devnet" }',
    handler: ({ user, params, body }) => {
      const f = db.get('SELECT * FROM forecasts WHERE id = ? AND expert_id = ?', params.id, user!.id);
      if (!f) throw notFound('Прогноз не найден');
      if (db.get('SELECT 1 FROM forecast_anchors WHERE forecast_id = ?', f.id)) throw conflict('already_anchored', 'Прогноз уже зафиксирован в Solana');
      const b = parse<{ signature: string; wallet: string; cluster: 'devnet' | 'mainnet-beta' }>(body, {
        signature: str({ min: 60, max: 100, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: 'Некорректная подпись транзакции' }),
        wallet: str({ min: 30, max: 50, pattern: /^[1-9A-HJ-NP-Za-km-z]+$/, patternMsg: 'Некорректный адрес кошелька' }),
        cluster: oneOf(['devnet', 'mainnet-beta'] as const)
      });
      db.run('INSERT INTO forecast_anchors (forecast_id, cluster, signature, wallet, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)', f.id, b.cluster, b.signature, b.wallet, forecastMemo(f), nowIso());
      return forecastView(db, f);
    }
  });

  router.add({
    method: 'GET', path: '/studio/forecasts', group: 'Studio: forecasts', summary: 'My forecasts and stats.', auth: E,
    handler: ({ user }) => {
      const rows = db.all('SELECT * FROM forecasts WHERE expert_id = ? ORDER BY published_at DESC', user!.id);
      const done = rows.filter(r => r.status !== 'active'), ok = done.filter(r => r.status === 'success').length;
      return {
        stats: { open: rows.length - done.length, openLimit: RULES.maxOpenForecasts, done: done.length, success: ok, successRate: done.length ? Math.round(ok / done.length * 1000) / 10 : null },
        forecasts: rows.map(f => forecastView(db, f))
      };
    }
  });

  router.add({
    method: 'POST', path: '/studio/forecasts', group: 'Studio: forecasts',
    summary: `Publish a forecast. Once published it cannot be changed or deleted. Limits: ${RULES.maxOpenForecasts} open, one open per ticker.`,
    auth: E, body: '{ ticker, name, direction: "up" | "down", startPrice, targetPrice, deadline: "YYYY-MM-DD" (tomorrow to one year), rationale (120+ chars), acknowledged: true }',
    handler: ctx => {
      const user = ctx.user!;
      assertVerifiedExpert(db, user, 'Публиковать прогнозы');
      const b = parse<{ ticker: string; name: string; direction: 'up' | 'down'; startPrice: number; targetPrice: number; deadline: string; rationale: string; acknowledged: boolean }>(ctx.body, {
        ticker: str({ pattern: /^[A-Za-z0-9.]{1,6}$/, patternMsg: 'От 1 до 6 латинских букв или цифр' }),
        name: str({ min: 2, max: 60 }),
        direction: oneOf(['up', 'down'] as const),
        startPrice: num({ gt: 0, max: 1e7 }),
        targetPrice: num({ gt: 0, max: 1e7 }),
        deadline: date(),
        rationale: str({ min: RULES.rationaleMin, max: 2000 }),
        acknowledged: bool()
      });
      const errors: Record<string, string> = {};
      if (!b.acknowledged) errors.acknowledged = 'Подтвердите, что понимаете: прогноз нельзя изменить или удалить';
      if (b.direction === 'up' && b.targetPrice <= b.startPrice) errors.targetPrice = 'Для роста цель должна быть выше текущей цены';
      if (b.direction === 'down' && b.targetPrice >= b.startPrice) errors.targetPrice = 'Для снижения цель должна быть ниже текущей цены';
      if (b.deadline < addDays(1) || b.deadline > addDays(RULES.forecastMaxDays)) errors.deadline = `Дата проверки: от завтра до ${RULES.forecastMaxDays} дней вперёд`;
      if (Object.keys(errors).length) throw new HttpError(422, 'validation', 'Проверьте поля', errors);
      const ticker = b.ticker.toUpperCase(), id = newId();
      db.tx(() => {
        const open = db.get(`SELECT COUNT(*) AS n FROM forecasts WHERE expert_id = ? AND status = 'active'`, user.id)!.n as number;
        if (open >= RULES.maxOpenForecasts) throw conflict('forecast_limit', `Открыто ${open} прогнозов из ${RULES.maxOpenForecasts}. Новый можно опубликовать, когда завершится один из открытых.`);
        if (db.get(`SELECT 1 FROM forecasts WHERE expert_id = ? AND ticker = ? AND status = 'active'`, user.id, ticker)) throw conflict('forecast_ticker_open', `По ${ticker} уже есть открытый прогноз. Дождитесь его итога.`);
        db.run(`INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id, user.id, ticker, b.name, b.direction, b.startPrice, b.targetPrice, b.deadline, b.rationale, nowIso());
      });
      ctx.status = 201;
      return forecastView(db, db.get('SELECT * FROM forecasts WHERE id = ?', id));
    }
  });

  router.add({
    method: 'POST', path: '/studio/forecasts/:id/comments', group: 'Studio: forecasts', summary: 'Add a comment to your own open forecast. The forecast terms do not change.', auth: E,
    body: '{ text: 10–600 chars }',
    handler: ({ user, params, body }) => {
      const f = db.get('SELECT * FROM forecasts WHERE id = ?', params.id);
      if (!f || f.expert_id !== user!.id) throw notFound('Прогноз не найден');
      if (f.status !== 'active') throw conflict('forecast_resolved', 'Комментировать можно только открытый прогноз');
      const b = parse<{ text: string }>(body, { text: str({ min: 10, max: 600 }) });
      db.run('INSERT INTO forecast_comments (id, forecast_id, text, created_at) VALUES (?, ?, ?, ?)', newId(), f.id, b.text, nowIso());
      return forecastView(db, f);
    }
  });

  // Explicitly forbidden actions: respond with a clear error instead of "no such address".
  for (const method of ['PATCH', 'DELETE'] as const) router.add({
    method, path: '/studio/forecasts/:id', group: 'Studio: forecasts', summary: method === 'PATCH' ? 'Forecasts cannot be changed: always 409.' : 'Forecasts cannot be deleted: always 409.', auth: E,
    handler: () => { throw conflict('forecast_immutable', 'Опубликованный прогноз нельзя изменить или удалить. Можно добавить комментарий.'); }
  });
}
