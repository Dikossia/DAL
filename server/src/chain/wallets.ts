// Built-in wallets: one per account, created the first time it is needed.
// Secrets are encrypted with the platform key (in production: a KMS/HSM key, never in the database).
import { createHash, randomBytes } from 'node:crypto';
import type { DB } from '../db.ts';
import { b58decode, b58encode, concat, fromHex, toHex, utf8 } from './codec.ts';
import { keypairFromSeed, type Keypair } from './tx.ts';

const sha256 = (...p: Uint8Array[]) => { const h = createHash('sha256'); for (const x of p) h.update(x); return new Uint8Array(h.digest()); };

/** Seed encryption: SHA-256 keystream + authentication tag (v1). */
export function sealSeed(key: Uint8Array, seed: Uint8Array): string {
  const nonce = new Uint8Array(randomBytes(16));
  const ks = sha256(key, utf8('dal-wallet-stream'), nonce);
  const ct = seed.map((b, i) => b ^ ks[i]);
  const tag = sha256(key, utf8('dal-wallet-tag'), nonce, ct).slice(0, 16);
  return `v1:${toHex(nonce)}:${toHex(ct)}:${toHex(tag)}`;
}
export function openSeed(key: Uint8Array, sealed: string): Uint8Array {
  const [v, n, c, t] = sealed.split(':');
  if (v !== 'v1') throw new Error('Unknown wallet format');
  const nonce = fromHex(n), ct = fromHex(c);
  const tag = sha256(key, utf8('dal-wallet-tag'), nonce, ct).slice(0, 16);
  if (toHex(tag) !== t) throw new Error('Wallet key check failed');
  const ks = sha256(key, utf8('dal-wallet-stream'), nonce);
  return ct.map((b, i) => b ^ ks[i]);
}

export function platformKey(db: DB, fromEnv?: string): Uint8Array {
  if (fromEnv) return sha256(utf8(fromEnv));
  let row = db.get<{ value: string }>(`SELECT value FROM chain_config WHERE key = 'wallet_key'`);
  if (!row) {
    db.run(`INSERT OR IGNORE INTO chain_config (key, value) VALUES ('wallet_key', ?)`, toHex(new Uint8Array(randomBytes(32))));
    row = db.get<{ value: string }>(`SELECT value FROM chain_config WHERE key = 'wallet_key'`)!;
  }
  return fromHex(row.value);
}

export interface WalletInfo { address: string; createdAt: string; exportedAt: string | null }

/** Returns the user's wallet, creating it on first use. */
export function ensureWallet(db: DB, key: Uint8Array, userId: string): WalletInfo {
  const w = db.get('SELECT * FROM wallets WHERE user_id = ?', userId);
  if (w) return { address: w.address, createdAt: w.created_at, exportedAt: w.exported_at };
  const seed = new Uint8Array(randomBytes(32)), kp = keypairFromSeed(seed), at = new Date().toISOString();
  db.run('INSERT OR IGNORE INTO wallets (user_id, address, secret_enc, created_at) VALUES (?, ?, ?, ?)', userId, kp.publicKey, sealSeed(key, seed), at);
  return ensureWallet(db, key, userId);
}

export function walletKeypair(db: DB, key: Uint8Array, userId: string): Keypair {
  ensureWallet(db, key, userId);
  const w = db.get('SELECT * FROM wallets WHERE user_id = ?', userId)!;
  const kp = keypairFromSeed(openSeed(key, w.secret_enc));
  if (kp.publicKey !== w.address) throw new Error('Wallet key mismatch');
  return kp;
}

/** Secret key in the format wallets such as Phantom import (base58 of the 64-byte secret key). */
export const exportSecret = (kp: Keypair) => b58encode(concat(kp.seed, b58decode(kp.publicKey)));

/** Parses a 64-byte base58 secret key (seed + public key). */
export function keypairFromSecret(secret: string): Keypair {
  const b = b58decode(secret.trim());
  if (b.length !== 64) throw new Error('Secret key must be 64 bytes');
  const kp = keypairFromSeed(b.slice(0, 32));
  if (kp.publicKey !== b58encode(b.slice(32))) throw new Error('Secret key does not match its public key');
  return kp;
}
