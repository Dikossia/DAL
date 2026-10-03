import type { DB, Row } from './db.ts';
import type { User } from './http.ts';
import { notFound, conflict } from './http.ts';
import { PRODUCT_TYPES, PRODUCT_RULES, MODE_NAMES } from './rules.ts';
import { coverUrl } from './courses.ts';
import { expertBrief } from './experts.ts';

export const kindOf = (p: Row) => PRODUCT_TYPES[p.type].kind;
export const isLiveProduct = (p: Row) => p.status === 'published' || p.status === 'hidden';
const nowIso = () => new Date().toISOString();

export function getProduct(db: DB, id: string): Row {
  const p = db.get('SELECT * FROM products WHERE id = ?', id);
  if (!p) throw notFound('Продукт не найден');
  return p;
}
export function ownProduct(db: DB, user: User, id: string): Row {
  const p = getProduct(db, id);
  if (p.expert_id !== user.id) throw notFound('Продукт не найден');
  return p;
}
export function assertProductEditable(p: Row) {
  if (p.status === 'review') throw conflict('product_in_review', 'Продукт на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.');
}

export function activePurchase(db: DB, userId: string, productId: string): Row | undefined {
  return db.get(`SELECT * FROM product_purchases WHERE user_id = ? AND product_id = ? AND status = 'active'`, userId, productId);
}
export const sessionsBooked = (db: DB, purchaseId: string): number =>
  db.get('SELECT COUNT(*) AS n FROM product_slots WHERE purchase_id = ?', purchaseId)!.n as number;
export const subscriptionLive = (pu: Row | undefined) => !!pu && (!pu.expires_at || pu.expires_at > nowIso());

// Content access: author, moderator, buyer (subscriptions only until expiry); free material is open to everyone.
export function hasAccess(db: DB, user: User | null, p: Row): boolean {
  if (user?.role === 'moderator' || (user && p.expert_id === user.id)) return true;
  if (kindOf(p) === 'material' && p.price === 0 && p.status === 'published') return true;
  if (!user) return false;
  const pu = activePurchase(db, user.id, p.id);
  if (!pu) return false;  // buyers keep access even if the product is hidden from the catalog
  return kindOf(p) === 'subscription' ? subscriptionLive(pu) : !!pu;
}

export function purchaseState(db: DB, pu: Row | undefined, p: Row) {
  if (!pu) return null;
  const kind = kindOf(p);
  const used = kind === 'sessions' ? sessionsBooked(db, pu.id) : 0;
  return {
    purchasedAt: pu.created_at, pricePaid: pu.price_paid,
    ...(kind === 'sessions' ? { sessionsTotal: pu.sessions_total, sessionsBooked: used, sessionsLeft: Math.max(0, pu.sessions_total - used) } : {}),
    ...(kind === 'subscription' ? { expiresAt: pu.expires_at, active: subscriptionLive(pu) } : {})
  };
}

export function metaText(p: Row): string {
  const k = kindOf(p);
  if (k === 'sessions') return [p.duration_min ? `${p.duration_min} мин` : '', p.sessions > 1 ? `${p.sessions} ${plural(p.sessions, 'встреча', 'встречи', 'встреч')}` : ''].filter(Boolean).join(' · ') || 'Встреча';
  if (k === 'subscription') return p.period_days ? `Подписка на ${p.period_days} ${plural(p.period_days, 'день', 'дня', 'дней')}` : 'Подписка';
  const words = String(p.content || '').split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 180))} мин чтения`;
}
function plural(n: number, one: string, few: string, many: string) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; }

export function productStats(db: DB, id: string) {
  const s = db.get(`SELECT COUNT(*) AS buyers, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS fee FROM product_purchases WHERE product_id = ? AND status = 'active'`, id)!;
  const rn = db.get(`SELECT COALESCE(SUM(r.price_paid), 0) AS gross, COALESCE(SUM(r.commission), 0) AS fee FROM product_renewals r JOIN product_purchases pp ON pp.id = r.purchase_id WHERE pp.product_id = ?`, id)!;
  const r = db.get(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM product_reviews WHERE product_id = ? AND hidden = 0`, id)!;
  const gross = s.gross + rn.gross, fee = s.fee + rn.fee;
  return { buyers: s.buyers, revenue: gross, income: gross - fee, rating: r.avg ? Math.round(r.avg * 100) / 100 : null, reviews: r.n };
}

export const futureFreeSlots = (db: DB, productId: string, limit = 50) =>
  db.all<{ id: string; starts_at: string }>(`SELECT id, starts_at FROM product_slots WHERE product_id = ? AND booked_by IS NULL AND starts_at > ? ORDER BY starts_at LIMIT ?`, productId, new Date(Date.now() + 3600e3).toISOString(), limit)
    .map(s => ({ id: s.id, startsAt: s.starts_at }));

export function productCard(db: DB, p: Row) {
  const info = PRODUCT_TYPES[p.type];
  const slots = info.kind === 'sessions' ? futureFreeSlots(db, p.id, 1) : [];
  return {
    id: p.id, kind: 'product', mode: p.mode, modeName: MODE_NAMES[p.mode], type: p.type, typeName: info.name, productKind: info.kind,
    title: p.title, description: p.description, price: p.price, coverUrl: coverUrl(p.cover), status: p.status,
    expert: expertBrief(db, p.expert_id),
    durationMin: p.duration_min, sessions: p.sessions, periodDays: p.period_days, meta: metaText(p),
    nextSlot: slots[0]?.startsAt ?? null,
    ...productStats(db, p.id),
    publishedAt: p.published_at, updatedAt: p.updated_at
  };
}

const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
export function productChecklist(db: DB, p: Row) {
  const kind = kindOf(p);
  const list = [
    { key: 'title', label: 'Название не короче 10 символов', ok: p.title.trim().length >= 10 },
    { key: 'description', label: 'Описание не короче 80 символов', ok: p.description.trim().length >= 80 },
    { key: 'cover', label: 'Выбрана обложка', ok: !!p.cover },
    { key: 'price', label: 'Указана цена', ok: p.price !== null }
  ];
  if (kind === 'sessions') list.push(
    { key: 'duration', label: 'Указана длительность встречи', ok: !!p.duration_min },
    { key: 'meeting', label: 'Указана ссылка на видеозвонок', ok: URL_RE.test(p.meeting_url || '') },
    { key: 'slots', label: 'Есть хотя бы одно свободное время в расписании', ok: futureFreeSlots(db, p.id, 1).length > 0 });
  if (kind === 'subscription') list.push(
    { key: 'period', label: 'Указан срок подписки', ok: !!p.period_days },
    ...(p.type === 'clubs' ? [
      { key: 'schedule', label: 'Описано расписание встреч клуба', ok: (p.schedule_note || '').trim().length >= 10 },
      { key: 'meeting', label: 'Указана ссылка на встречи клуба', ok: URL_RE.test(p.meeting_url || '') }] : []));
  if (kind === 'material') list.push({ key: 'content', label: `Текст материала не короче ${PRODUCT_RULES.minContent} символов`, ok: (p.content || '').trim().length >= PRODUCT_RULES.minContent });
  return list;
}
export const isUrl = (s: string) => URL_RE.test(s);
