// Minimal Solana JSON-RPC client over fetch (Node.js 18+ and browsers).
import { toBase64 } from './codec.ts';

export interface Rpc {
  url: string;
  call<T = any>(method: string, params?: unknown[]): Promise<T>;
}

export function createRpc(url: string, timeoutMs = 15000): Rpc {
  let id = 0;
  return {
    url,
    async call(method, params = []) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: ctrl.signal });
        if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
        const j: any = await res.json();
        if (j.error) throw Object.assign(new Error(j.error.message || 'RPC error'), { rpc: j.error });
        return j.result;
      } finally { clearTimeout(t); }
    }
  };
}

export const latestBlockhash = (rpc: Rpc) => rpc.call<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]).then(r => r.value);
export const sendTx = (rpc: Rpc, wire: Uint8Array) => rpc.call<string>('sendTransaction', [toBase64(wire), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
export const balance = (rpc: Rpc, address: string) => rpc.call<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }]).then(r => r.value);
export const blockHeight = (rpc: Rpc) => rpc.call<number>('getBlockHeight', [{ commitment: 'confirmed' }]);
export async function signatureStatus(rpc: Rpc, signature: string) {
  const r = await rpc.call<{ value: any[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  return r.value[0] as null | { err: unknown; confirmationStatus?: string };
}
export const getTx = (rpc: Rpc, signature: string) => rpc.call<any>('getTransaction', [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
export const accountInfo = (rpc: Rpc, address: string) => rpc.call<{ value: any }>('getAccountInfo', [address, { encoding: 'base64', commitment: 'confirmed' }]).then(r => r.value);
export const requestAirdrop = (rpc: Rpc, address: string, lamports: number) => rpc.call<string>('requestAirdrop', [address, lamports]);
