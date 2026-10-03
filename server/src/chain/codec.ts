// Byte helpers used to build Solana transactions without external libraries.

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function b58encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return '1'.repeat(zeros) + digits.reverse().map(d => ALPHABET[d]).join('');
}

export function b58decode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < s.length; i++) {
    const v = INDEX.get(s[i]);
    if (v === undefined) throw new Error('Invalid base58 character');
    let carry = v;
    for (let j = 0; j < bytes.length; j++) { carry += bytes[j] * 58; bytes[j] = carry & 0xff; carry >>= 8; }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

export const isBase58Address = (s: unknown): s is string => {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try { return b58decode(s).length === 32; } catch { return false; }
};

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const utf8 = (s: string) => new TextEncoder().encode(s);

export function u8(n: number) { return Uint8Array.of(n & 0xff); }
export function u16(n: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
export function u32(n: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }
export function u64(n: bigint | number) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; }
/** Borsh string: u32 length + UTF-8 bytes. */
export function borshString(s: string) { const b = utf8(s); return concat(u32(b.length), b); }

/** Solana "compact-u16" length prefix. */
export function shortvec(n: number): Uint8Array {
  const out: number[] = [];
  for (;;) {
    let elem = n & 0x7f;
    n >>= 7;
    if (n === 0) { out.push(elem); break; }
    elem |= 0x80; out.push(elem);
  }
  return Uint8Array.from(out);
}

export const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
};
export const fromBase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const toHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const fromHex = (h: string) => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
