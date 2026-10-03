import type { App } from '../app.ts';
import { HttpError, notFound } from '../http.ts';
import { parse, str, oneOf } from '../validate.ts';
import { verifyPassword } from '../auth.ts';
import { RULES } from '../rules.ts';
import { exportSecret } from '../chain/wallets.ts';
import { backfillCertificates, certificateView } from '../certificates.ts';
import { quote, placeCardOrder, createUsdcOrder, submitUsdcPayment, orderView, type ItemKind } from '../orders.ts';
import { issuerAddress } from '../chain/service.ts';

// Built-in wallet, certificates, orders with a price breakdown, and the blockchain cost report.
export function registerBlockchain(app: App) {
  const { db, router, chain } = app;
  const S: ['student'] = ['student'];

  router.add({
    method: 'GET', path: '/me/wallet', group: 'Wallet', summary: 'Your built-in DAL wallet (created automatically the first time it is needed) and what is recorded for you on Solana.', auth: 'user',
    handler: ({ user }) => {
      const w = db.get('SELECT address, created_at, exported_at FROM wallets WHERE user_id = ?', user!.id);
      const certificates = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM certificates WHERE user_id = ?', user!.id)!.n;
      const forecasts = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM forecast_anchors a JOIN forecasts f ON f.id = a.forecast_id WHERE f.expert_id = ?', user!.id)!.n;
      return {
        wallet: w ? { address: w.address, createdAt: w.created_at, exportedAt: w.exported_at, url: chain.addressUrl(w.address) } : null,
        cluster: chain.cluster, issuer: chain.issuer, certificates, forecasts
      };
    }
  });

  router.add({
    method: 'POST', path: '/me/wallet/export', group: 'Wallet', summary: 'Show the wallet secret key after confirming the password, to move NFTs to your own wallet (e.g. Phantom). Optional: DAL keeps working without it.', auth: 'user',
    body: '{ password }',
    handler: ({ user, body }) => {
      const b = parse<{ password: string }>(body, { password: str({ max: 200, trim: false }) });
      const key = `export:${user!.id}`;
      app.loginLimiter.check(key);
      const u = db.get('SELECT password_hash FROM users WHERE id = ?', user!.id)!;
      if (!verifyPassword(b.password, u.password_hash)) { app.loginLimiter.fail(key); throw new HttpError(401, 'bad_credentials', 'Неверный пароль'); }
      app.loginLimiter.reset(key);
      const kp = chain.keypair(user!.id);
      db.run('UPDATE wallets SET exported_at = ? WHERE user_id = ?', new Date().toISOString(), user!.id);
      return { address: kp.publicKey, secretKey: exportSecret(kp) };
    }
  });

  router.add({
    method: 'GET', path: '/me/certificates', group: 'Certificates', summary: 'My course certificates. Issued automatically when every lesson of a course is completed.', auth: S,
    handler: ({ user }) => {
      backfillCertificates(app, user!.id);
      return db.all('SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC', user!.id).map(c => certificateView(db, chain.publicUrl, c));
    }
  });

  router.add({
    method: 'GET', path: '/certificates/:id', group: 'Certificates', summary: 'Public certificate check: no sign-in and no wallet needed. The page also reads the NFT and its record directly from Solana.',
    handler: ({ params }) => {
      const c = db.get('SELECT * FROM certificates WHERE id = ?', String(params.id).toUpperCase());
      if (!c) throw notFound('Сертификат не найден');
      return { ...certificateView(db, chain.publicUrl, c), issuer: issuerAddress(db), cluster: chain.cluster };
    }
  });

  router.add({
    method: 'GET', path: '/chain/status', group: 'Wallet', summary: 'DAL issuer wallet, network and queue of records waiting to be written to Solana.',
    handler: async () => ({ ...(await chain.status()), enabled: chain.enabled })
  });

  // ---------- Orders ----------
  const item = (body: unknown) => parse<{ kind: ItemKind; id: string }>(body, { kind: oneOf(['course', 'product'] as const), id: str({ max: 80 }) });

  router.add({
    method: 'POST', path: '/checkout/quote', group: 'Orders', summary: 'Price breakdown before paying: price, DAL commission, the expert\'s share, network fee and total for each payment method.', auth: S,
    body: '{ kind: "course" | "product", id }',
    handler: ({ user, body }) => { const b = item(body); return quote(app, user!, b.kind, b.id); }
  });

  router.add({
    method: 'POST', path: '/orders', group: 'Orders', summary: 'Place an order. method "card": paid immediately (simulated). method "usdc": returns a Solana transaction for the buyer\'s wallet; DAL pays the network fee.', auth: S,
    body: '{ kind, id, method: "card" | "usdc", payer?: wallet address for usdc }',
    handler: async ({ user, body }) => {
      const b = item(body);
      const m = parse<{ method: 'card' | 'usdc'; payer?: string }>(body, { method: oneOf(['card', 'usdc'] as const), payer: str({ optional: true, max: 60 }) });
      if (m.method === 'card') { const o = placeCardOrder(app, user!, b.kind, b.id); return { order: orderView(app, db.get('SELECT * FROM orders WHERE id = ?', o.id)!), result: o.result }; }
      if (!m.payer) throw new HttpError(422, 'validation', 'Подключите кошелёк для оплаты в USDC');
      return createUsdcOrder(app, user!, b.kind, b.id, m.payer);
    }
  });

  router.add({
    method: 'POST', path: '/orders/:id/submit', group: 'Orders', summary: 'After the buyer\'s wallet sent the USDC transaction: DAL checks it on Solana (amounts, split, order id) and then opens access.', auth: S,
    body: '{ signature }',
    handler: ({ user, params, body }) => submitUsdcPayment(app, user!, params.id, parse<{ signature: string }>(body, { signature: str({ max: 100 }) }).signature)
  });

  router.add({
    method: 'GET', path: '/orders/:id', group: 'Orders', summary: 'Order status.', auth: S,
    handler: ({ user, params }) => {
      const o = db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', params.id, user!.id);
      if (!o) throw notFound('Заказ не найден');
      return orderView(app, o);
    }
  });

  router.add({
    method: 'GET', path: '/me/orders', group: 'Orders', summary: 'My orders with the price breakdown.', auth: S,
    handler: ({ user }) => db.all(`SELECT o.*, COALESCE(c.title, p.title) AS title FROM orders o LEFT JOIN courses c ON o.item_kind = 'course' AND c.id = o.item_id LEFT JOIN products p ON o.item_kind = 'product' AND p.id = o.item_id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 100`, user!.id)
      .map(o => ({ ...orderView(app, o), title: o.title }))
  });

  // ---------- Cost report for the moderator ----------
  router.add({
    method: 'GET', path: '/moderation/chain', group: 'Moderation', summary: 'Blockchain economics: network fees collected vs. what DAL actually spent on Solana, by record type; queue and issuer balance.', auth: ['moderator'],
    handler: async () => {
      const collectedOrders = db.get<{ n: number; s: number }>(`SELECT COUNT(*) AS n, COALESCE(SUM(network_fee), 0) AS s FROM orders WHERE status = 'paid' AND network_fee > 0`)!;
      const collectedForecasts = db.get<{ n: number; s: number }>(`SELECT COUNT(*) AS n, COALESCE(SUM(network_fee), 0) AS s FROM forecasts WHERE network_fee > 0`)!;
      const byKind = db.all<{ kind: string; n: number; lamports: number; pending: number }>(`SELECT kind, SUM(status = 'confirmed') AS n, COALESCE(SUM(cost_lamports), 0) AS lamports, SUM(status IN ('pending', 'sent')) AS pending FROM chain_jobs GROUP BY kind`);
      const spent = byKind.reduce((n, k) => n + k.lamports, 0);
      const kzt = (lamports: number) => Math.round(lamports / 1e9 * RULES.kztPerSol * 100) / 100;
      const recent = db.all(`SELECT kind, ref_id AS refId, status, signature, attempts, last_error AS lastError, cost_lamports AS costLamports, created_at AS createdAt, confirmed_at AS confirmedAt FROM chain_jobs ORDER BY created_at DESC LIMIT 15`)
        .map(j => ({ ...j, url: j.signature && j.status === 'confirmed' ? chain.txUrl(j.signature) : null, costKzt: j.costLamports != null ? kzt(j.costLamports) : null }));
      return {
        rates: { kztPerSol: RULES.kztPerSol, networkFee: RULES.networkFee, forecastNetworkFee: RULES.forecastNetworkFee },
        collected: { orders: collectedOrders, forecasts: collectedForecasts, totalKzt: collectedOrders.s + collectedForecasts.s },
        spent: { lamports: spent, sol: spent / 1e9, kzt: kzt(spent) },
        byKind: byKind.map(k => ({ ...k, sol: k.lamports / 1e9, kzt: kzt(k.lamports), avgKzt: k.n ? kzt(k.lamports / k.n) : null })),
        status: await chain.status(), recent
      };
    }
  });
}
