const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export class Buffer extends Uint8Array {
  static from(x: any, enc?: string): Buffer {
    if (typeof x === 'string') {
      if (enc === 'base64' || enc === 'base64url') { const s = atob(x.replace(/-/g, '+').replace(/_/g, '/')); const b = new Buffer(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
      const u = new TextEncoder().encode(x); const b = new Buffer(u.length); b.set(u); return b;
    }
    const b = new Buffer(x.length); b.set(x); return b;
  }
  static byteLength(s: string) { return new TextEncoder().encode(s).length; }
  static concat(list: Uint8Array[]) { const n = list.reduce((a, l) => a + l.length, 0), b = new Buffer(n); let o = 0; for (const l of list) { b.set(l, o); o += l.length; } return b; }
  static isBuffer(x: any) { return x instanceof Buffer; }
  toString(enc?: string): string {
    if (enc === 'hex') return [...this].map(v => v.toString(16).padStart(2, '0')).join('');
    if (enc === 'base64' || enc === 'base64url') {
      let s = '';
      for (let i = 0; i < this.length; i += 3) {
        const n = (this[i] << 16) | ((this[i + 1] ?? 0) << 8) | (this[i + 2] ?? 0);
        s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < this.length ? B64[n >> 6 & 63] : '=') + (i + 2 < this.length ? B64[n & 63] : '=');
      }
      return enc === 'base64url' ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
    }
    return new TextDecoder().decode(this);
  }
}
