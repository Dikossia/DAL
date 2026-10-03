// Orders: the buyer sees the full price, DAL's commission and the network fee before paying.
// Card payments are simulated in the prototype. USDC payments on Solana are split in one transaction:
// the expert's share goes to the expert's built-in wallet, DAL's commission and the network fee to DAL.
import type { App } from './app.ts';
import type { Row } from './db.ts';
import { HttpError, notFound, conflict, type User } from './http.ts';
import { RULES } from './rules.ts';
import { newId, nowIso } from './util.ts';
import { getCourse, enrollCourse } from './courses.ts';
import { getProduct, purchaseProduct, kindOf, sessionsBooked } from './products.ts';
import { orderMemo } from './anchor.ts';
import { isBase58Address, b58encode } from './chain/codec.ts';
import { createAtaIdempotentIx, transferCheckedIx, memoIx, associatedTokenAddress } from './chain/programs.ts';
import { buildPartiallySignedTx } from './chain/tx.ts';
import { latestBlockhash } from './chain/rpc.ts';
import { chainRecord } from './chain/service.ts';
import { issueCertificateIfCompleted } from './certificates.ts';

export type ItemKind = 'course' | 'product';
export type Method = 'card' | 'usdc';
const USDC_DECIMALS = 6;

/** Network fee: once per paid order that uses the blockchain (course → NFT certificate; any USDC payment). */
export const networkFeeFor = (kind: ItemKind, price: number, method: Method) => price > 0 && (kind === 'course' || method === 'usdc') ? RULES.networkFee : 0;

function loadItem(app: App, user: User, kind: ItemKind, id: string): { item: Row; title: string; expertId: string } {
  const { db } = app;
  if (kind === 'course') {
    const c = getCourse(db, id);
    if (c.status !== 'published') throw notFound('Курс не найден');
    if (db.get(`SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, user.id, c.id)) throw conflict('already_enrolled', 'У вас уже есть доступ к этому курсу');
    return { item: c, title: c.title, expertId: c.expert_id };
  }
  const p = getProduct(db, id);
  if (p.status !== 'published') throw notFound('Продукт не найден');
  const pu = db.get(`SELECT * FROM product_purchases WHERE user_id = ? AND product_id = ? AND status = 'active'`, user.id, p.id);
  const k = kindOf(p);
  if (pu && k === 'material') throw conflict('already_bought', 'Этот материал уже у вас');
  if (pu && k === 'sessions' && sessionsBooked(db, pu.id) < pu.sessions_total) throw conflict('already_bought', 'У вас уже есть неиспользованные встречи по этому продукту');
  return { item: p, title: p.title, expertId: p.expert_id };
}

function breakdown(kind: ItemKind, price: number, method: Method) {
  const commission = Math.round(price * RULES.commission), networkFee = networkFeeFor(kind, price, method), total = price + networkFee;
  const micro = (kzt: number) => Math.round(kzt / RULES.kztPerUsdc * 1e6);
  const usdcTotal = micro(total), usdcExpert = micro(price - commission);
  return { price, commission, expertGets: price - commission, networkFee, total, usdc: method === 'usdc' ? { total: usdcTotal, expert: usdcExpert, dal: usdcTotal - usdcExpert, rate: RULES.kztPerUsdc } : null };
}

/** What the buyer sees before paying, for each payment method. */
export function quote(app: App, user: User, kind: ItemKind, id: string) {
  const { item, title } = loadItem(app, user, kind, id);
  const card = breakdown(kind, item.price, 'card'), usdc = breakdown(kind, item.price, 'usdc');
  return {
    item: { kind, id: item.id, title, price: item.price },
    methods: {
      card: { ...card, usdc: undefined },
      usdc: { ...usdc, usdc: usdc.usdc && { total: usdc.usdc.total / 1e6, toExpert: usdc.usdc.expert / 1e6, toDal: usdc.usdc.dal / 1e6, rate: usdc.usdc.rate }, available: item.price > 0 }
    },
    networkFeeNote: 'Сетевой сбор взимается один раз за заказ, который использует блокчейн. Фактические расходы сети оплачивает DAL.'
  };
}

function fulfill(app: App, o: Row) {
  const { db } = app;
  const u = { networkFee: o.network_fee, orderId: o.id };
  if (o.item_kind === 'course') {
    const r = enrollCourse(db, o.user_id, getCourse(db, o.item_id), u);
    issueCertificateIfCompleted(app, o.user_id, o.item_id); // e.g. a re-purchase of an already completed course
    return r;
  }
  return purchaseProduct(db, o.user_id, getProduct(db, o.item_id), u);
}

export function placeCardOrder(app: App, user: User, kind: ItemKind, id: string) {
  const { db } = app;
  const { item } = loadItem(app, user, kind, id);
  const b = breakdown(kind, item.price, 'card');
  return db.tx(() => {
    const oid = newId();
    db.run(`INSERT INTO orders (id, user_id, item_kind, item_id, price, commission, network_fee, total, method, status, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'card', 'paid', ?, ?)`,
      oid, user.id, kind, item.id, b.price, b.commission, b.networkFee, b.total, nowIso(), nowIso());
    const result = fulfill(app, db.get('SELECT * FROM orders WHERE id = ?', oid)!);
    return { id: oid, price: b.price, commission: b.commission, networkFee: b.networkFee, total: b.total, status: 'paid', result };
  });
}

/** Builds the USDC payment: DAL pays the network fee as fee payer, the buyer's wallet signs the transfer. */
export async function createUsdcOrder(app: App, user: User, kind: ItemKind, id: string, payer: string) {
  const { db, chain } = app;
  if (!isBase58Address(payer)) throw new HttpError(422, 'validation', 'Некорректный адрес кошелька');
  const { item, expertId } = loadItem(app, user, kind, id);
  if (!item.price) throw conflict('free_item', 'Бесплатный доступ оформляется без оплаты');
  const b = breakdown(kind, item.price, 'usdc');
  const expertWallet = chain.wallet(expertId).address;
  const mint = chain.usdcMint, oid = newId();
  const o = { id: oid, item_kind: kind, item_id: item.id, total: b.total, usdc_expert: b.usdc!.expert, usdc_dal: b.usdc!.dal };
  const { blockhash } = await latestBlockhash(chain.rpc).catch(() => { throw new HttpError(503, 'chain_unavailable', 'Сеть Solana сейчас недоступна. Оплатите картой или попробуйте позже.'); });
  const { wire, signers } = buildPartiallySignedTx(chain.service, [
    createAtaIdempotentIx(chain.issuer, expertWallet, mint),
    createAtaIdempotentIx(chain.issuer, chain.issuer, mint),
    transferCheckedIx(payer, expertWallet, mint, b.usdc!.expert, USDC_DECIMALS),
    transferCheckedIx(payer, chain.issuer, mint, b.usdc!.dal, USDC_DECIMALS),
    memoIx(orderMemo(o), [payer])
  ], blockhash);
  db.run(`INSERT INTO orders (id, user_id, item_kind, item_id, price, commission, network_fee, total, method, status, usdc_total, usdc_expert, usdc_dal, payer_wallet, expert_wallet, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'usdc', 'pending', ?, ?, ?, ?, ?, ?)`,
    oid, user.id, kind, item.id, b.price, b.commission, b.networkFee, b.total, b.usdc!.total, b.usdc!.expert, b.usdc!.dal, payer, expertWallet, nowIso());
  return {
    order: orderView(app, db.get('SELECT * FROM orders WHERE id = ?', oid)!),
    transaction: b58encode(wire), payerIndex: signers.indexOf(payer), mint,
    payerTokenAccount: associatedTokenAddress(payer, mint)
  };
}

export function submitUsdcPayment(app: App, user: User, orderId: string, signature: string) {
  const { db, chain } = app;
  const o = db.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', orderId, user.id);
  if (!o) throw notFound('Заказ не найден');
  if (o.method !== 'usdc' || o.status !== 'pending') throw conflict('bad_status', 'Заказ уже обработан');
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(signature)) throw new HttpError(422, 'validation', 'Некорректная подпись транзакции');
  db.tx(() => {
    db.run('UPDATE orders SET signature = ? WHERE id = ?', signature, o.id);
    chain.enqueue('payment', o.id, orderMemo(o), { signature });
  });
  return orderView(app, db.get('SELECT * FROM orders WHERE id = ?', o.id)!);
}

export function orderView(app: App, o: Row) {
  return {
    id: o.id, itemKind: o.item_kind, itemId: o.item_id, price: o.price, commission: o.commission, networkFee: o.network_fee, total: o.total,
    method: o.method, status: o.status, error: o.error, createdAt: o.created_at, paidAt: o.paid_at,
    usdc: o.method === 'usdc' ? { total: o.usdc_total / 1e6, toExpert: o.usdc_expert / 1e6, toDal: o.usdc_dal / 1e6 } : null,
    chain: o.method === 'usdc' ? chainRecord(app.db, 'payment', o.id) : null
  };
}

/** Checks a USDC payment on Solana: success, the order memo, and the exact split to the expert and to DAL. */
export function registerPaymentJobs(app: App) {
  const { db, chain } = app;
  const tokenDelta = (tx: any, owner: string) => {
    const pick = (list: any[]) => (list || []).filter(b => b.mint === chain.usdcMint && b.owner === owner).reduce((n, b) => n + Number(b.uiTokenAmount.amount), 0);
    return pick(tx.meta.postTokenBalances) - pick(tx.meta.preTokenBalances);
  };
  chain.handlers.payment = {
    verify(job, tx) {
      const o = db.get('SELECT * FROM orders WHERE id = ?', job.ref_id);
      if (!o) return { error: 'Order not found' };
      if (tx.meta?.err) return { error: 'The payment transaction failed on Solana' };
      const memos = (tx.transaction.message.instructions || []).filter((i: any) => i.program === 'spl-memo').map((i: any) => i.parsed);
      if (!memos.some((m: string) => m.includes(`id=${o.id}`))) return { error: 'The transaction is not for this order' };
      if (tokenDelta(tx, o.expert_wallet) !== o.usdc_expert || tokenDelta(tx, chain.issuer) !== o.usdc_dal) return { error: 'The amounts do not match the order' };
      return 'ok';
    },
    confirmed(job) {
      const o = db.get('SELECT * FROM orders WHERE id = ?', job.ref_id)!;
      if (o.status !== 'pending') return;
      db.run(`UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?`, nowIso(), o.id);
      try { fulfill(app, o); }
      catch (e) { db.run(`UPDATE orders SET error = ? WHERE id = ?`, String((e as any)?.message || e), o.id); }
    },
    failed(job, error) { db.run(`UPDATE orders SET status = 'failed', error = ? WHERE id = ? AND status = 'pending'`, error, job.ref_id); }
  };
}
