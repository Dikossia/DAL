import { HttpError } from './http.ts';

// Small dependency-free validator. Errors are collected per field and returned in a single 422 response.
type Check = (value: unknown, name: string) => { ok: true; value: unknown } | { ok: false; error: string };
interface Opt { optional?: boolean; nullable?: boolean }

const wrap = (o: Opt, fn: Check): Check & Opt => Object.assign((v: unknown, n: string) => fn(v, n), o);

export const str = (o: Opt & { min?: number; max?: number; pattern?: RegExp; patternMsg?: string; trim?: boolean } = {}) => wrap(o, v => {
  if (typeof v !== 'string') return { ok: false, error: 'Ожидается строка' };
  const s = o.trim === false ? v : v.trim();
  if (o.min !== undefined && s.length < o.min) return { ok: false, error: `Не короче ${o.min} символов` };
  if (o.max !== undefined && s.length > o.max) return { ok: false, error: `Не длиннее ${o.max} символов` };
  if (o.pattern && !o.pattern.test(s)) return { ok: false, error: o.patternMsg || 'Неверный формат' };
  return { ok: true, value: s };
});

export const num = (o: Opt & { min?: number; max?: number; int?: boolean; gt?: number } = {}) => wrap(o, v => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, error: 'Ожидается число' };
  if (o.int && !Number.isInteger(n)) return { ok: false, error: 'Ожидается целое число' };
  if (o.min !== undefined && n < o.min) return { ok: false, error: `Не меньше ${o.min}` };
  if (o.gt !== undefined && n <= o.gt) return { ok: false, error: `Больше ${o.gt}` };
  if (o.max !== undefined && n > o.max) return { ok: false, error: `Не больше ${o.max}` };
  return { ok: true, value: n };
});

export const bool = (o: Opt = {}) => wrap(o, v => typeof v === 'boolean' ? { ok: true, value: v } : { ok: false, error: 'Ожидается true или false' });

export const oneOf = <T extends string>(values: readonly T[], o: Opt = {}) => wrap(o, v =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: `Допустимо: ${values.join(', ')}` });

export const date = (o: Opt = {}) => wrap(o, v =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? { ok: true, value: v } : { ok: false, error: 'Ожидается дата в формате ГГГГ-ММ-ДД' });

export const strList = (o: Opt & { maxItems?: number; maxLen?: number } = {}) => wrap(o, v => {
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return { ok: false, error: 'Ожидается список строк' };
  const list = v.map((x: string) => x.trim()).filter(Boolean);
  if (o.maxItems && list.length > o.maxItems) return { ok: false, error: `Не больше ${o.maxItems} пунктов` };
  if (o.maxLen && list.some(x => x.length > o.maxLen!)) return { ok: false, error: `Каждый пункт не длиннее ${o.maxLen} символов` };
  return { ok: true, value: list };
});

export function parse<T = Record<string, any>>(body: unknown, schema: Record<string, Check & Opt>): T {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'bad_body', 'Ожидается JSON-объект');
  const src = body as Record<string, unknown>, out: Record<string, unknown> = {}, errors: Record<string, string> = {};
  for (const [key, check] of Object.entries(schema)) {
    const v = src[key];
    if (v === undefined) { if (!check.optional) errors[key] = 'Обязательное поле'; continue; }
    if (v === null) { if (check.nullable) out[key] = null; else errors[key] = 'Поле не может быть пустым'; continue; }
    const r = check(v, key);
    if (r.ok) out[key] = r.value; else errors[key] = r.error;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'validation', 'Проверьте поля', errors);
  return out as T;
}
