import { createHash } from 'node:crypto';
import type { DB } from './db.ts';
import { chainRecord } from './chain/service.ts';

// Forecast record for the blockchain: the immutable terms plus a hash of the rationale.
// Anyone can compare this string with the Solana transaction memo to verify the terms were not rewritten.
export function forecastMemo(f: any): string {
  const h = createHash('sha256').update(String(f.rationale)).digest('hex');
  return `DAL forecast v1 | id=${f.id} | ${f.ticker} ${f.direction === 'up' ? 'UP' : 'DOWN'} | start=${f.start_price} | target=${f.target_price} | deadline=${f.deadline} | published=${f.published_at} | rationale_sha256=${h}`;
}

export function forecastAnchor(db: DB, id: string) {
  const a = db.get('SELECT * FROM forecast_anchors WHERE forecast_id = ?', id);
  return a ? { cluster: a.cluster, signature: a.signature, wallet: a.wallet, createdAt: a.created_at, explorerUrl: `https://explorer.solana.com/tx/${a.signature}${a.cluster === 'devnet' ? '?cluster=devnet' : ''}` } : null;
}

// Course review record for the blockchain: author (anonymized id), course, rating and text hash.
export function reviewMemo(r: any): string {
  const h = createHash('sha256').update(String(r.text)).digest('hex');
  return `DAL review v1 | id=${r.id} | course=${r.course_id} | rating=${r.rating} | completed=true | created=${r.created_at} | text_sha256=${h}`;
}

export function reviewAnchor(db: DB, id: string) {
  const a = db.get('SELECT * FROM review_anchors WHERE review_id = ?', id);
  return a ? { cluster: a.cluster, signature: a.signature, wallet: a.wallet, createdAt: a.created_at, explorerUrl: `https://explorer.solana.com/tx/${a.signature}${a.cluster === 'devnet' ? '?cluster=devnet' : ''}` } : null;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const clean = (s: unknown) => String(s ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
/** First name + initial of the last name: enough to recognise a certificate, without putting a full name on a public ledger. */
export const shortPersonName = (name: string) => { const [a, b] = String(name).trim().split(/\s+/); return b ? `${a} ${b[0]}.` : a; };

/** Resolution rule fixed at publication: which price, which date, which comparison. */
export const forecastRule = (f: any) => `close(${f.ticker}, ${f.deadline}) ${f.direction === 'up' ? '>=' : '<='} ${f.target_price} USD`;
export const PRICE_SOURCE = 'Цена закрытия биржи на дату проверки, вносит и проверяет модерация DAL';

/** v2: recorded automatically by DAL and co-signed by the expert's built-in wallet. */
export function forecastMemoV2(f: any, expertWallet: string): string {
  return `DAL forecast v2 | id=${f.id} | ${f.ticker} ${f.direction === 'up' ? 'UP' : 'DOWN'} | start=${f.start_price} | target=${f.target_price} | deadline=${f.deadline} | rule=${f.rule || forecastRule(f)} | published=${f.published_at} | expert=${expertWallet} | rationale_sha256=${sha(String(f.rationale))}`;
}

export function forecastResultMemo(f: any, forecastTx: string | null): string {
  return `DAL forecast result v1 | id=${f.id} | close=${f.result_price} | outcome=${f.status === 'success' ? 'MET' : 'NOT MET'} | rule=${f.rule || forecastRule(f)} | resolved=${f.resolved_at} | forecast_tx=${forecastTx || 'none'}`;
}

/** A hash of the full name lets anyone check "is this certificate Dina Abenova's?" without publishing the name. */
export const holderHash = (c: any) => sha(`${c.id}|${String(c.student_name).trim().toLowerCase()}`);

export function certificateMemo(c: any, asset: string): string {
  return `DAL certificate v1 | id=${c.id} | course=${c.course_id} | title=${clean(c.course_title).slice(0, 80)} | student=${clean(shortPersonName(c.student_name))} | holder_sha256=${holderHash(c)} | lessons=${c.lessons} | completed=${String(c.completed_at).slice(0, 10)} | expert=${clean(shortPersonName(c.expert_name))} | nft=${asset}`;
}

export function orderMemo(o: any): string {
  return `DAL order v1 | id=${o.id} | item=${o.item_kind}:${o.item_id} | total_kzt=${o.total} | to_expert_usdc=${(o.usdc_expert / 1e6).toFixed(6)} | to_dal_usdc=${(o.usdc_dal / 1e6).toFixed(6)}`;
}

/** Everything the site shows about a forecast's blockchain records. */
export function forecastChainFields(db: DB, f: any) {
  const rec = chainRecord(db, 'forecast', f.id);
  return {
    memo: rec?.memo ?? forecastMemo(f), anchor: forecastAnchor(db, f.id), chain: rec,
    result: chainRecord(db, 'forecast_result', f.id), rule: f.rule || forecastRule(f), priceSource: PRICE_SOURCE, networkFee: f.network_fee ?? 0
  };
}
