import { createHash } from 'node:crypto';
import type { DB } from './db.ts';

// Запись прогноза для блокчейна: условия, которые нельзя менять, и хеш обоснования.
// Любой может сравнить эту строку с memo транзакции в Solana и убедиться, что условия не переписаны.
export function forecastMemo(f: any): string {
  const h = createHash('sha256').update(String(f.rationale)).digest('hex');
  return `DAL forecast v1 | id=${f.id} | ${f.ticker} ${f.direction === 'up' ? 'UP' : 'DOWN'} | start=${f.start_price} | target=${f.target_price} | deadline=${f.deadline} | published=${f.published_at} | rationale_sha256=${h}`;
}

export function forecastAnchor(db: DB, id: string) {
  const a = db.get('SELECT * FROM forecast_anchors WHERE forecast_id = ?', id);
  return a ? { cluster: a.cluster, signature: a.signature, wallet: a.wallet, createdAt: a.created_at, explorerUrl: `https://explorer.solana.com/tx/${a.signature}${a.cluster === 'devnet' ? '?cluster=devnet' : ''}` } : null;
}
