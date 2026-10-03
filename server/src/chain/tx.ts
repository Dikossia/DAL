// Legacy Solana transactions: compile instructions into a message, sign, serialize.
import { createHash } from 'node:crypto';
import { b58decode, b58encode, concat, shortvec, u8, utf8 } from './codec.ts';
import { publicKeyFromSeed, sign, isOnCurve } from './ed25519.ts';

export interface AccountMeta { pubkey: string; isSigner: boolean; isWritable: boolean }
export interface Instruction { programId: string; keys: AccountMeta[]; data: Uint8Array }
export interface Keypair { publicKey: string; seed: Uint8Array }

export const keypairFromSeed = (seed: Uint8Array): Keypair => ({ publicKey: b58encode(publicKeyFromSeed(seed)), seed });

/** Builds the message: fee payer first, then writable signers, read-only signers, writable and read-only others. */
export function compileMessage(feePayer: string, instructions: Instruction[], recentBlockhash: string) {
  const metas = new Map<string, { s: boolean; w: boolean }>();
  const touch = (k: string, s: boolean, w: boolean) => { const m = metas.get(k); if (m) { m.s ||= s; m.w ||= w; } else metas.set(k, { s, w }); };
  touch(feePayer, true, true);
  for (const ix of instructions) { for (const k of ix.keys) touch(k.pubkey, k.isSigner, k.isWritable); touch(ix.programId, false, false); }
  const rank = (k: string) => { const m = metas.get(k)!; return k === feePayer ? -1 : m.s ? (m.w ? 0 : 1) : (m.w ? 2 : 3); };
  const keys = [...metas.keys()].map((k, i) => ({ k, i })).sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i).map(x => x.k);
  const signers = keys.filter(k => metas.get(k)!.s);
  const header = [signers.length, signers.filter(k => !metas.get(k)!.w).length, keys.filter(k => !metas.get(k)!.s && !metas.get(k)!.w).length];
  const index = new Map(keys.map((k, i) => [k, i]));
  const ixBytes = instructions.map(ix => concat(
    u8(index.get(ix.programId)!),
    shortvec(ix.keys.length), Uint8Array.from(ix.keys.map(k => index.get(k.pubkey)!)),
    shortvec(ix.data.length), ix.data
  ));
  const message = concat(Uint8Array.from(header), shortvec(keys.length), ...keys.map(b58decode), b58decode(recentBlockhash), shortvec(instructions.length), ...ixBytes);
  return { message, signers };
}

/** Signs with every required signer; returns the wire transaction and its id (the fee payer's signature). */
export function buildSignedTx(feePayer: Keypair, instructions: Instruction[], recentBlockhash: string, others: Keypair[] = []) {
  const { message, signers } = compileMessage(feePayer.publicKey, instructions, recentBlockhash);
  const all = new Map([feePayer, ...others].map(k => [k.publicKey, k]));
  const sigs = signers.map(pk => {
    const kp = all.get(pk);
    if (!kp) throw new Error(`Missing signer ${pk}`);
    return sign(message, kp.seed);
  });
  return { wire: concat(shortvec(sigs.length), ...sigs, message), signature: b58encode(sigs[0]), message };
}

/** A transaction where some signatures are left empty (to be added by a wallet such as Phantom). */
export function buildPartiallySignedTx(feePayer: Keypair, instructions: Instruction[], recentBlockhash: string, others: Keypair[] = []) {
  const { message, signers } = compileMessage(feePayer.publicKey, instructions, recentBlockhash);
  const all = new Map([feePayer, ...others].map(k => [k.publicKey, k]));
  const sigs = signers.map(pk => { const kp = all.get(pk); return kp ? sign(message, kp.seed) : new Uint8Array(64); });
  return { wire: concat(shortvec(sigs.length), ...sigs, message), message, signers };
}

/** Program-derived address (same algorithm as PublicKey.findProgramAddressSync). */
export function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  for (let bump = 255; bump >= 0; bump--) {
    const h = createHash('sha256');
    for (const s of seeds) h.update(s);
    h.update(Uint8Array.of(bump)); h.update(b58decode(programId)); h.update(utf8('ProgramDerivedAddress'));
    const out = new Uint8Array(h.digest());
    if (!isOnCurve(out)) return b58encode(out);
  }
  throw new Error('No viable bump seed');
}
