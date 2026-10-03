// Instructions for the Solana programs DAL uses: Memo, System, SPL Token, Associated Token Account, Metaplex Core.
import { b58decode, borshString, concat, u8, u64, u32, utf8 } from './codec.ts';
import { findProgramAddress, type Instruction } from './tx.ts';

export const PROGRAMS = {
  system: '11111111111111111111111111111111',
  memo: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  token: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ata: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  core: 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'
} as const;

/** Memo with one or more signers: the signers are recorded in the transaction as co-authors of the text. */
export function memoIx(text: string, signers: string[] = []): Instruction {
  return { programId: PROGRAMS.memo, keys: signers.map(pubkey => ({ pubkey, isSigner: true, isWritable: false })), data: utf8(text) };
}

export function transferIx(from: string, to: string, lamports: bigint | number): Instruction {
  return {
    programId: PROGRAMS.system,
    keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }],
    data: concat(u32(2), u64(lamports))
  };
}

export const associatedTokenAddress = (owner: string, mint: string) =>
  findProgramAddress([b58decode(owner), b58decode(PROGRAMS.token), b58decode(mint)], PROGRAMS.ata);

/** Creates the owner's token account for the mint if it does not exist yet (payer covers the deposit). */
export function createAtaIdempotentIx(payer: string, owner: string, mint: string): Instruction {
  return {
    programId: PROGRAMS.ata,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: PROGRAMS.system, isSigner: false, isWritable: false },
      { pubkey: PROGRAMS.token, isSigner: false, isWritable: false }
    ],
    data: u8(1)
  };
}

/** SPL Token TransferChecked between the owners' associated token accounts. */
export function transferCheckedIx(owner: string, toOwner: string, mint: string, amount: bigint | number, decimals: number): Instruction {
  return {
    programId: PROGRAMS.token,
    keys: [
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: associatedTokenAddress(toOwner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    data: concat(u8(12), u64(amount), u8(decimals))
  };
}

/**
 * Metaplex Core CreateV1: a one-account NFT. `asset` is a fresh keypair that signs; the payer covers
 * the storage deposit; the owner receives the NFT; the update authority is DAL (the issuer).
 */
export function coreCreateIx(o: { asset: string; payer: string; owner: string; updateAuthority: string; name: string; uri: string }): Instruction {
  const none = { pubkey: PROGRAMS.core, isSigner: false, isWritable: false };
  return {
    programId: PROGRAMS.core,
    keys: [
      { pubkey: o.asset, isSigner: true, isWritable: true },
      none, // collection
      none, // authority (defaults to the payer)
      { pubkey: o.payer, isSigner: true, isWritable: true },
      { pubkey: o.owner, isSigner: false, isWritable: false },
      { pubkey: o.updateAuthority, isSigner: false, isWritable: false },
      { pubkey: PROGRAMS.system, isSigner: false, isWritable: false },
      none // log wrapper
    ],
    // discriminator 0, DataState::AccountState, name, uri, plugins: Some([])
    data: concat(u8(0), u8(0), borshString(o.name), borshString(o.uri), u8(1), u32(0))
  };
}
