// Ed25519 (RFC 8032) in plain TypeScript with BigInt: key derivation, signing and the
// "is this point on the curve" check needed for program-derived addresses (PDAs).
// Synchronous and identical on the server and in the browser demo mode.
import { createHash } from 'node:crypto';

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (a: bigint, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
function pow(b: bigint, e: bigint, m = P) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
const inv = (a: bigint) => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

type Pt = [bigint, bigint, bigint, bigint]; // extended coordinates X, Y, Z, T
const BX = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
const BY = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
const BASE: Pt = [BX, BY, 1n, mod(BX * BY)];
const ZERO: Pt = [0n, 1n, 1n, 0n];

function add(p: Pt, q: Pt): Pt {
  const [X1, Y1, Z1, T1] = p, [X2, Y2, Z2, T2] = q;
  const A = mod((Y1 - X1) * (Y2 - X2)), B = mod((Y1 + X1) * (Y2 + X2));
  const C = mod(2n * D * T1 * T2), Dd = mod(2n * Z1 * Z2);
  const E = B - A, F = Dd - C, G = Dd + C, H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}
function mul(p: Pt, n: bigint): Pt {
  let r = ZERO, q = p;
  while (n > 0n) { if (n & 1n) r = add(r, q); q = add(q, q); n >>= 1n; }
  return r;
}
function encode(p: Pt): Uint8Array {
  const zi = inv(p[2]), x = mod(p[0] * zi), y = mod(p[1] * zi);
  const out = leBytes(y, 32);
  if (x & 1n) out[31] |= 0x80;
  return out;
}
function leBytes(n: bigint, len: number) { const b = new Uint8Array(len); for (let i = 0; i < len; i++) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; }
function leInt(b: Uint8Array) { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; }
const sha512 = (...parts: Uint8Array[]) => { const h = createHash('sha512'); for (const p of parts) h.update(p); return new Uint8Array(h.digest()); };

function expand(seed: Uint8Array) {
  if (seed.length !== 32) throw new Error('Ed25519 seed must be 32 bytes');
  const h = sha512(seed);
  const a = h.slice(0, 32); a[0] &= 248; a[31] &= 127; a[31] |= 64;
  return { scalar: leInt(a), prefix: h.slice(32) };
}

/** Public key (32 bytes) from a 32-byte secret seed. */
export function publicKeyFromSeed(seed: Uint8Array): Uint8Array {
  return encode(mul(BASE, expand(seed).scalar));
}

/** Detached 64-byte signature. */
export function sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  const { scalar, prefix } = expand(seed);
  const pub = encode(mul(BASE, scalar));
  const r = mod(leInt(sha512(prefix, message)), L);
  const R = encode(mul(BASE, r));
  const k = mod(leInt(sha512(R, pub, message)), L);
  const s = mod(r + k * scalar, L);
  const sig = new Uint8Array(64); sig.set(R); sig.set(leBytes(s, 32), 32);
  return sig;
}

/** True when 32 bytes decode to a valid curve point (PDAs must be off the curve). */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  const b = bytes.slice(); const sign = (b[31] & 0x80) !== 0; b[31] &= 0x7f;
  const y = leInt(b);
  if (y >= P) return false;
  const y2 = mod(y * y), u = mod(y2 - 1n), v = mod(D * y2 + 1n);
  const v3 = mod(v * v * v), v7 = mod(v3 * v3 * v);
  let x = mod(u * v3 * pow(u * v7, (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === u) { /* root found */ } else if (vx2 === mod(-u)) x = mod(x * SQRT_M1); else return false;
  if (x === 0n && sign) return false;
  return true;
}
