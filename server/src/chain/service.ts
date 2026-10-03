// DAL's blockchain layer. Business actions are saved in the database first and a record is queued;
// a background worker writes it to Solana with retries. If Solana is slow or down, nothing in DAL waits.
import type { DB } from '../db.ts';
import { newId, nowIso } from '../util.ts';
import { b58decode } from './codec.ts';
import { buildSignedTx, keypairFromSeed, type Instruction, type Keypair } from './tx.ts';
import { createRpc, latestBlockhash, sendTx, signatureStatus, getTx, balance, requestAirdrop, type Rpc } from './rpc.ts';
import { platformKey, ensureWallet, walletKeypair, type WalletInfo } from './wallets.ts';

// Devnet-only demo issuer, so the public demo works without a server. It holds test SOL with no value.
// In production set DAL_SOLANA_SECRET (and keep it in a secrets manager); this key is never used on mainnet.
export const DEMO_SERVICE_SECRET = 'x49rcQoinPBWwyhQPmEVzo9iKtGx4serQWzZffBqNoXkHEeN7rSrxTUFXZ9MDpQVNJCnyGePMxJLWVCYXAAg2Ae';
export const DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export interface ChainOptions {
  enabled?: boolean;            // false: records stay queued (tests, offline development)
  cluster?: 'devnet' | 'mainnet-beta';
  rpcUrl?: string;
  rpc?: Rpc;                    // injected in tests
  serviceSecret?: string;       // base58 64-byte secret key of DAL's issuer / fee payer wallet
  walletKey?: string;           // platform key that encrypts built-in wallets
  publicUrl?: string;           // site address used in verification links
  usdcMint?: string;
  autoAirdrop?: boolean;        // devnet: top up the issuer wallet with test SOL when it runs low
}

export type JobKind = 'forecast' | 'forecast_result' | 'certificate' | 'payment';
export interface Job { id: string; kind: JobKind; ref_id: string; status: string; memo: string | null; signature: string | null; extra: string | null; attempts: number; last_error: string | null; sent_at: string | null; created_at: string; confirmed_at: string | null; cost_lamports: number | null }
export interface Built { instructions: Instruction[]; signers?: Keypair[]; memo?: string; extra?: Record<string, unknown> }
export interface JobHandler {
  /** Builds the transaction. Returns null to wait (e.g. for an earlier record). */
  build?(job: Job): Built | null;
  /** For records sent by someone else (a buyer's wallet): checks the transaction. */
  verify?(job: Job, tx: any): 'ok' | 'wait' | { error: string };
  /** Runs inside a database transaction when the record is confirmed on Solana. */
  confirmed?(job: Job, tx: any): void;
  /** Runs when a verified record turns out to be invalid (e.g. a payment with wrong amounts). */
  failed?(job: Job, error: string): void;
}

export interface Chain {
  enabled: boolean;
  cluster: 'devnet' | 'mainnet-beta';
  publicUrl: string;
  usdcMint: string;
  issuer: string;
  rpc: Rpc;
  service: Keypair;
  handlers: Partial<Record<JobKind, JobHandler>>;
  wallet(userId: string): WalletInfo;
  keypair(userId: string): Keypair;
  enqueue(kind: JobKind, refId: string, memo?: string | null, extra?: Record<string, unknown>): Job;
  job(kind: JobKind, refId: string): Job | undefined;
  view(job: Job | undefined): ChainRecord | null;
  txUrl(sig: string): string;
  addressUrl(address: string): string;
  tick(): Promise<boolean>;
  status(): Promise<{ cluster: string; issuer: string; balanceSol: number | null; queued: number; lastError: string | null }>;
}

export interface ChainRecord { status: 'queued' | 'recording' | 'recorded'; signature: string | null; url: string | null; recordedAt: string | null; memo: string | null; retrying: boolean }

const suffixOf = (cluster: string) => cluster === 'devnet' ? '?cluster=devnet' : '';
export const explorerTx = (sig: string, cluster = 'devnet') => `https://explorer.solana.com/tx/${sig}${suffixOf(cluster)}`;
export const explorerAddress = (a: string, cluster = 'devnet') => `https://explorer.solana.com/address/${a}${suffixOf(cluster)}`;

export function recordView(job: Job | undefined, cluster = 'devnet'): ChainRecord | null {
  if (!job) return null;
  const recorded = job.status === 'confirmed';
  return {
    status: recorded ? 'recorded' : job.status === 'sent' ? 'recording' : 'queued',
    signature: recorded ? job.signature : null,
    url: recorded && job.signature ? explorerTx(job.signature, cluster) : null,
    recordedAt: job.confirmed_at, memo: job.memo,
    retrying: !recorded && job.attempts > 0 && !!job.last_error
  };
}

/** Status of a queued Solana record, readable with only the database (no chain connection needed). */
export function chainRecord(db: DB, kind: JobKind, refId: string): ChainRecord | null {
  const cluster = db.get<{ value: string }>(`SELECT value FROM chain_config WHERE key = 'cluster'`)?.value || 'devnet';
  return recordView(db.get<Job>('SELECT * FROM chain_jobs WHERE kind = ? AND ref_id = ?', kind, refId), cluster);
}
export const issuerAddress = (db: DB) => db.get<{ value: string }>(`SELECT value FROM chain_config WHERE key = 'issuer'`)?.value ?? null;

const backoffSec = (attempts: number) => Math.min(3600, 15 * 2 ** Math.min(attempts, 8));
const later = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();

export function createChain(db: DB, o: ChainOptions = {}): Chain {
  const cluster = o.cluster ?? 'devnet';
  const secret = b58decode(o.serviceSecret || DEMO_SERVICE_SECRET);
  if (cluster === 'mainnet-beta' && !o.serviceSecret) throw new Error('DAL_SOLANA_SECRET is required on mainnet');
  const service = keypairFromSeed(secret.slice(0, 32));
  const rpc = o.rpc ?? createRpc(o.rpcUrl || (cluster === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com'));
  let key: Uint8Array | null = null;
  const walletKey = () => (key ??= platformKey(db, o.walletKey));
  let busy = false, lastAirdrop = 0, cachedBalance: number | null = null;
  db.run(`INSERT INTO chain_config (key, value) VALUES ('cluster', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, cluster);
  db.run(`INSERT INTO chain_config (key, value) VALUES ('issuer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, service.publicKey);

  const chain: Chain = {
    enabled: o.enabled !== false,
    cluster,
    publicUrl: (o.publicUrl || 'https://dal-kappa.vercel.app').replace(/\/$/, ''),
    usdcMint: o.usdcMint || DEVNET_USDC,
    issuer: service.publicKey,
    rpc, service, handlers: {},
    wallet: userId => ensureWallet(db, walletKey(), userId),
    keypair: userId => walletKeypair(db, walletKey(), userId),
    enqueue(kind, refId, memo = null, extra) {
      db.run(`INSERT OR IGNORE INTO chain_jobs (id, kind, ref_id, memo, extra, next_try_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        newId(), kind, refId, memo, extra ? JSON.stringify(extra) : null, nowIso(), nowIso());
      return chain.job(kind, refId)!;
    },
    job: (kind, refId) => db.get<Job>('SELECT * FROM chain_jobs WHERE kind = ? AND ref_id = ?', kind, refId),
    view: job => recordView(job, cluster),
    txUrl: sig => explorerTx(sig, cluster),
    addressUrl: a => explorerAddress(a, cluster),
    async status() {
      try { cachedBalance = (await balance(rpc, service.publicKey)) / 1e9; } catch { /* keep the cached value */ }
      const q = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM chain_jobs WHERE status IN ('pending', 'sent')`)!.n;
      const e = db.get<{ last_error: string }>(`SELECT last_error FROM chain_jobs WHERE status = 'pending' AND last_error IS NOT NULL ORDER BY next_try_at DESC LIMIT 1`);
      return { cluster, issuer: service.publicKey, balanceSol: cachedBalance, queued: q, lastError: e?.last_error ?? null };
    },
    async tick() {
      if (!chain.enabled || busy) return false;
      busy = true;
      let changed = false;
      try {
        changed = (await checkSent()) || changed;
        changed = (await sendDue()) || changed;
      } finally { busy = false; }
      return changed;
    }
  };

  const update = (id: string, fields: Record<string, unknown>) => {
    const keys = Object.keys(fields);
    db.run(`UPDATE chain_jobs SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => fields[k] as any), id);
  };
  const fail = (job: Job, err: unknown) => {
    const msg = String((err as any)?.message || err).slice(0, 300);
    update(job.id, { status: 'pending', attempts: job.attempts + 1, last_error: msg, next_try_at: later(backoffSec(job.attempts + 1)) });
    if (/insufficient|prior credit|0x1$|lamports/i.test(msg)) void topUp();
  };
  async function topUp() {
    if (cluster !== 'devnet' || o.autoAirdrop === false || Date.now() - lastAirdrop < 10 * 60e3) return;
    lastAirdrop = Date.now();
    try { await requestAirdrop(rpc, service.publicKey, 1e9); } catch { /* the faucet is rate limited; the queue retries later */ }
  }
  /** What DAL actually paid for this transaction: fee + any storage deposit, from the issuer's balance change. */
  const costOf = (tx: any) => {
    const keys = tx?.transaction?.message?.accountKeys || [];
    const i = keys.findIndex((k: any) => (k.pubkey ?? k) === service.publicKey);
    if (i < 0 || !tx.meta) return null;
    return Math.max(0, tx.meta.preBalances[i] - tx.meta.postBalances[i]);
  };

  async function checkSent() {
    let changed = false;
    for (const job of db.all<Job>(`SELECT * FROM chain_jobs WHERE status = 'sent' ORDER BY sent_at LIMIT 20`)) {
      try {
        const st = await signatureStatus(rpc, job.signature!);
        if (st && st.err) { fail(job, `Transaction failed: ${JSON.stringify(st.err)}`); changed = true; continue; }
        if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
          const tx = await getTx(rpc, job.signature!);
          if (!tx) continue;
          db.tx(() => {
            update(job.id, { status: 'confirmed', confirmed_at: nowIso(), cost_lamports: costOf(tx), last_error: null });
            chain.handlers[job.kind]?.confirmed?.({ ...job, status: 'confirmed' }, tx);
          });
          changed = true;
        } else if (!st && Date.now() - new Date(job.sent_at!).getTime() > 120e3) {
          // Not seen by the network and the blockhash has expired: send again.
          update(job.id, { status: 'pending', next_try_at: nowIso(), last_error: 'Not confirmed in time, sending again' });
          changed = true;
        }
      } catch (e) { update(job.id, { last_error: String((e as any)?.message || e).slice(0, 300) }); }
    }
    return changed;
  }

  async function sendDue() {
    let changed = false;
    const due = db.all<Job>(`SELECT * FROM chain_jobs WHERE status = 'pending' AND next_try_at <= ? ORDER BY created_at LIMIT 5`, nowIso());
    for (const job of due) {
      const h = chain.handlers[job.kind];
      if (!h) continue;
      try {
        if (h.verify) {
          const sig = JSON.parse(job.extra || '{}').signature;
          const tx = sig ? await getTx(rpc, sig) : null;
          let r = tx ? h.verify(job, tx) : 'wait';
          if (r === 'wait' && job.attempts >= 40) r = { error: 'The payment transaction was not found on Solana' };
          if (r === 'wait') { update(job.id, { attempts: job.attempts + 1, next_try_at: later(Math.min(60, 5 * (job.attempts + 1))) }); }
          else if (r === 'ok') {
            db.tx(() => {
              update(job.id, { status: 'confirmed', signature: sig, confirmed_at: nowIso(), cost_lamports: costOf(tx), last_error: null });
              h.confirmed?.({ ...job, signature: sig, status: 'confirmed' }, tx);
            });
          } else { const err = r.error; db.tx(() => { update(job.id, { status: 'failed', last_error: err }); h.failed?.(job, err); }); }
          changed = true;
          continue;
        }
        const built = db.tx(() => h.build!(job));
        if (!built) { update(job.id, { next_try_at: later(30) }); continue; }
        if (built.memo !== undefined || built.extra) update(job.id, { ...(built.memo !== undefined ? { memo: built.memo } : {}), ...(built.extra ? { extra: JSON.stringify(built.extra) } : {}) });
        const { blockhash } = await latestBlockhash(rpc);
        const { wire, signature } = buildSignedTx(service, built.instructions, blockhash, built.signers || []);
        await sendTx(rpc, wire);
        update(job.id, { status: 'sent', signature, sent_at: nowIso(), attempts: job.attempts + 1, last_error: null });
        changed = true;
      } catch (e) { fail(job, e); changed = true; }
    }
    return changed;
  }

  return chain;
}
