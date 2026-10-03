import { Buffer } from './buffer.ts';
// Synchronous SHA-256 (WebCrypto in the browser is async-only).
const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
export function sha256(data: Uint8Array): Buffer {
  const l = data.length, n = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(n); m.set(data); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(n - 4, l * 8); dv.setUint32(n - 8, Math.floor(l / 0x20000000));
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]), W = new Uint32Array(64);
  const r = (x: number, s: number) => (x >>> s) | (x << (32 - s));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + W[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = Buffer.from(new Uint8Array(32)), ov = new DataView(out.buffer);
  H.forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
}
// Synchronous SHA-512 (needed for Ed25519 signatures of Solana transactions).
const K512 = ['428a2f98d728ae22','7137449123ef65cd','b5c0fbcfec4d3b2f','e9b5dba58189dbbc','3956c25bf348b538','59f111f1b605d019','923f82a4af194f9b','ab1c5ed5da6d8118','d807aa98a3030242','12835b0145706fbe','243185be4ee4b28c','550c7dc3d5ffb4e2','72be5d74f27b896f','80deb1fe3b1696b1','9bdc06a725c71235','c19bf174cf692694','e49b69c19ef14ad2','efbe4786384f25e3','0fc19dc68b8cd5b5','240ca1cc77ac9c65','2de92c6f592b0275','4a7484aa6ea6e483','5cb0a9dcbd41fbd4','76f988da831153b5','983e5152ee66dfab','a831c66d2db43210','b00327c898fb213f','bf597fc7beef0ee4','c6e00bf33da88fc2','d5a79147930aa725','06ca6351e003826f','142929670a0e6e70','27b70a8546d22ffc','2e1b21385c26c926','4d2c6dfc5ac42aed','53380d139d95b3df','650a73548baf63de','766a0abb3c77b2a8','81c2c92e47edaee6','92722c851482353b','a2bfe8a14cf10364','a81a664bbc423001','c24b8b70d0f89791','c76c51a30654be30','d192e819d6ef5218','d69906245565a910','f40e35855771202a','106aa07032bbd1b8','19a4c116b8d2d0c8','1e376c085141ab53','2748774cdf8eeb99','34b0bcb5e19b48a8','391c0cb3c5c95a63','4ed8aa4ae3418acb','5b9cca4f7763e373','682e6ff3d6b2b8a3','748f82ee5defb2fc','78a5636f43172f60','84c87814a1f0ab72','8cc702081a6439ec','90befffa23631e28','a4506cebde82bde9','bef9a3f7b2c67915','c67178f2e372532b','ca273eceea26619c','d186b8c721c0c207','eada7dd6cde0eb1e','f57d4f7fee6ed178','06f067aa72176fba','0a637dc5a2c898a6','113f9804bef90dae','1b710b35131c471b','28db77f523047d84','32caab7b40c72493','3c9ebe0a15c9bebc','431d67c49c100d4c','4cc5d4becb3e42b6','597f299cfc657e2a','5fcb6fab3ad6faec','6c44198c4a475817'].map(h => BigInt('0x' + h));
const M64 = (1n << 64n) - 1n;
export function sha512(data: Uint8Array): Buffer {
  const l = data.length, n = ((l + 17 + 127) >> 7) << 7, m = new Uint8Array(n); m.set(data); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setBigUint64(n - 8, BigInt(l) * 8n);
  const H = ['6a09e667f3bcc908','bb67ae8584caa73b','3c6ef372fe94f82b','a54ff53a5f1d36f1','510e527fade682d1','9b05688c2b3e6c1f','1f83d9abfb41bd6b','5be0cd19137e2179'].map(h => BigInt('0x' + h));
  const r = (x: bigint, s: bigint) => ((x >> s) | (x << (64n - s))) & M64;
  const W = new Array<bigint>(80);
  for (let o = 0; o < n; o += 128) {
    for (let i = 0; i < 16; i++) W[i] = dv.getBigUint64(o + i * 8);
    for (let i = 16; i < 80; i++) { const a = W[i - 15], b = W[i - 2]; W[i] = (W[i - 16] + (r(a, 1n) ^ r(a, 8n) ^ (a >> 7n)) + W[i - 7] + (r(b, 19n) ^ r(b, 61n) ^ (b >> 6n))) & M64; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 80; i++) {
      const t1 = (h + (r(e, 14n) ^ r(e, 18n) ^ r(e, 41n)) + ((e & f) ^ (~e & M64 & g)) + K512[i] + W[i]) & M64;
      const t2 = ((r(a, 28n) ^ r(a, 34n) ^ r(a, 39n)) + ((a & b) ^ (a & c) ^ (b & c))) & M64;
      h = g; g = f; f = e; e = (d + t1) & M64; d = c; c = b; b = a; a = (t1 + t2) & M64;
    }
    H[0] = (H[0] + a) & M64; H[1] = (H[1] + b) & M64; H[2] = (H[2] + c) & M64; H[3] = (H[3] + d) & M64; H[4] = (H[4] + e) & M64; H[5] = (H[5] + f) & M64; H[6] = (H[6] + g) & M64; H[7] = (H[7] + h) & M64;
  }
  const out = Buffer.from(new Uint8Array(64)), ov = new DataView(out.buffer);
  H.forEach((v, i) => ov.setBigUint64(i * 8, v));
  return out;
}
const bytes = (x: any) => typeof x === 'string' ? Buffer.from(x) : x;
export function createHash(alg = 'sha256') {
  const fn = alg === 'sha512' ? sha512 : sha256;
  let acc: Uint8Array[] = [];
  const h = { update(x: any) { acc.push(bytes(x)); return h; }, digest(enc?: string) { const d = fn(Buffer.concat(acc)); return enc ? d.toString(enc) : d; } };
  return h;
}
export function randomInt(min: number, max: number) { const b = new Uint32Array(1); crypto.getRandomValues(b); return min + (b[0] % (max - min)); }
export function randomBytes(n: number) { const b = new Buffer(n); crypto.getRandomValues(b); return b; }
// In the browser demo mode passwords use a simpler hash (salted SHA-256): scrypt in the browser would take seconds.
export function scryptSync(pw: string, salt: Uint8Array, len: number) {
  let d = sha256(Buffer.concat([bytes(salt), Buffer.from(pw)]));
  const out = new Buffer(len);
  for (let o = 0; o < len; o += 32) { out.set(d.subarray(0, Math.min(32, len - o)), o); d = sha256(Buffer.concat([d, bytes(salt)])); }
  return out;
}
export function timingSafeEqual(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i]; return x === 0; }
export function randomUUID(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = randomBytes(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128; const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export default { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual, randomUUID };
