import path from 'node:path';
import fs from 'node:fs';
import type { App } from '../app.ts';
import { HttpError, notFound, forbidden, conflict, receiveFile, sendFile, type User } from '../http.ts';
import { parse, str, num, oneOf } from '../validate.ts';
import { RULES, PRODUCT_TYPES, PRODUCT_RULES, COVER_LIBRARY, IMAGE_TYPES } from '../rules.ts';
import { newId, nowIso, shortName } from '../util.ts';
import { assertVerifiedExpert } from '../courses.ts';
import {
  getProduct, ownProduct, assertProductEditable, activePurchase, sessionsBooked, subscriptionLive, hasAccess, purchaseState,
  productCard, productChecklist, futureFreeSlots, kindOf, isLiveProduct, isUrl
} from '../products.ts';

const E: ['expert'] = ['expert'];
const S: ['student'] = ['student'];
const TYPES = Object.keys(PRODUCT_TYPES);

export function registerProducts(app: App) {
  const { db, router } = app;

  const reviewsOf = (productId: string) => db.all(
    `SELECT r.id, u.name AS author, r.rating, r.text, r.created_at AS createdAt, r.reply, r.replied_at AS repliedAt
     FROM product_reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = ? AND r.hidden = 0 ORDER BY r.created_at DESC`, productId)
    .map(r => ({ ...r, author: r.author.split(' ')[0] }));

  // Material: only the first excerpt is visible before purchase.
  const contentFor = (p: any, full: boolean) => {
    if (kindOf(p) !== 'material') return {};
    const text = String(p.content || '');
    if (full) return { content: text, contentLocked: false };
    const cut = text.slice(0, PRODUCT_RULES.previewChars);
    return { content: cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)) + '…', contentLocked: true };
  };

  // ---------- Catalog ----------
  router.add({
    method: 'GET', path: '/catalog/products', group: 'Catalog', summary: 'Products for the "Work with an expert", "Community" and "Ideas & analysis" modes. Params: mode, type, q, sort = popular | price | price-desc | new, free=1.',
    handler: ({ query }) => {
      const mode = query.get('mode'), type = query.get('type'), q = (query.get('q') || '').trim().toLocaleLowerCase('ru'), sort = query.get('sort') || 'popular';
      let rows = db.all(`SELECT p.*, u.name AS expert_name FROM products p JOIN users u ON u.id = p.expert_id WHERE p.status = 'published'`);
      if (mode) rows = rows.filter(r => r.mode === mode);
      if (type) rows = rows.filter(r => r.type === type);
      if (query.get('free') === '1') rows = rows.filter(r => r.price === 0);
      if (q) rows = rows.filter(r => (r.title + ' ' + r.expert_name).toLocaleLowerCase('ru').includes(q));
      const cards = rows.map(r => productCard(db, r));
      const by: Record<string, (a: any, b: any) => number> = {
        popular: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.buyers - a.buyers,
        price: (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
        new: (a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))
      };
      return cards.sort(by[sort] || by.popular);
    }
  });

  router.add({
    method: 'GET', path: '/catalog/products/:id', group: 'Catalog', summary: 'Product page: description, upcoming free slots, material excerpt, reviews.',
    handler: ({ params, user }) => {
      const p = getProduct(db, params.id);
      if (p.status !== 'published') throw notFound('Продукт не найден');
      const full = hasAccess(db, user, p);
      return {
        ...productCard(db, p), scheduleNote: p.schedule_note, ...contentFor(p, full),
        freeSlots: kindOf(p) === 'sessions' ? futureFreeSlots(db, p.id, 30) : [],
        members: kindOf(p) === 'subscription' ? db.get(`SELECT COUNT(*) AS n FROM product_purchases WHERE product_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)`, p.id, nowIso())!.n : undefined,
        reviewsList: reviewsOf(p.id)
      };
    }
  });

  // ---------- Student ----------
  router.add({
    method: 'POST', path: '/products/:id/buy', group: 'Student: products',
    summary: 'Buy a product (payment not wired up yet). For subscriptions, buying again extends the period. The price is fixed at purchase time.', auth: S,
    handler: ({ user, params }) => {
      const p = getProduct(db, params.id);
      if (p.status !== 'published') throw notFound('Продукт не найден');
      const kind = kindOf(p), now = new Date(), commission = Math.round(p.price * RULES.commission);
      return db.tx(() => {
        const pu = db.get('SELECT * FROM product_purchases WHERE user_id = ? AND product_id = ?', user!.id, p.id);
        if (kind === 'subscription') {
          const base = pu && pu.status === 'active' && pu.expires_at > now.toISOString() ? new Date(pu.expires_at) : now;
          const expires = new Date(base.getTime() + p.period_days * 864e5).toISOString();
          if (pu?.status === 'active') {
            // The payment is recorded as a separate row so income from the first purchase is not lost.
            // While the subscription is active the period is extended; after it ends, a new period starts today.
            const live = pu.expires_at > now.toISOString();
            db.run('UPDATE product_purchases SET expires_at = ? WHERE id = ?', expires, pu.id);
            db.run('INSERT INTO product_renewals (id, purchase_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?)', newId(), pu.id, p.price, commission, now.toISOString());
            return { productId: p.id, renewed: live, expiresAt: expires };
          }
          if (pu) db.run(`UPDATE product_purchases SET status = 'active', price_paid = ?, commission = ?, expires_at = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, p.price, commission, expires, now.toISOString(), pu.id);
          else db.run('INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), user!.id, p.id, p.price, commission, expires, now.toISOString());
          return { productId: p.id, renewed: false, expiresAt: expires };
        }
        if (pu?.status === 'active') {
          if (kind === 'sessions' && sessionsBooked(db, pu.id) >= pu.sessions_total) {
            // Session package used up: buying a new package adds sessions.
            const add = p.type === 'consultation' ? 1 : p.sessions;
            db.run('UPDATE product_purchases SET sessions_total = sessions_total + ? WHERE id = ?', add, pu.id);
            db.run('INSERT INTO product_renewals (id, purchase_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?)', newId(), pu.id, p.price, commission, now.toISOString());
            return { productId: p.id, renewed: true };
          }
          throw conflict('already_bought', kind === 'sessions' ? 'У вас уже есть неиспользованные встречи по этому продукту' : 'Этот материал уже у вас');
        }
        const sessions = kind === 'sessions' ? (p.type === 'consultation' ? 1 : p.sessions) : null;
        if (pu) db.run(`UPDATE product_purchases SET status = 'active', price_paid = ?, commission = ?, sessions_total = ?, created_at = ?, refunded_at = NULL WHERE id = ?`, p.price, commission, sessions, now.toISOString(), pu.id);
        else db.run('INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, sessions_total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', newId(), user!.id, p.id, p.price, commission, sessions, now.toISOString());
        return { productId: p.id, renewed: false };
      });
    }
  });

  router.add({
    method: 'POST', path: '/products/:id/refund', group: 'Student: products',
    summary: `Refund a session package: within ${PRODUCT_RULES.sessionRefundDays} days if no session has been booked. Subscriptions and materials are non-refundable.`, auth: S,
    handler: ({ user, params }) => {
      const p = getProduct(db, params.id), pu = activePurchase(db, user!.id, p.id);
      if (!pu) throw notFound('Активная покупка не найдена');
      if (kindOf(p) !== 'sessions') throw conflict('not_refundable', 'Подписки и материалы не возвращаются: доступ открывается сразу.');
      if ((Date.now() - new Date(pu.created_at).getTime()) / 864e5 > PRODUCT_RULES.sessionRefundDays) throw conflict('refund_expired', `Возврат возможен в течение ${PRODUCT_RULES.sessionRefundDays} дней после покупки`);
      if (sessionsBooked(db, pu.id)) throw conflict('refund_used', 'Возврат невозможен: встреча уже назначена. Отмените запись, если до встречи больше суток.');
      db.run(`UPDATE product_purchases SET status = 'refunded', refunded_at = ? WHERE id = ?`, nowIso(), pu.id);
      return { productId: p.id, refunded: pu.price_paid };
    }
  });

  const myBookings = (userId: string, productId: string) => db.all(
    `SELECT id, starts_at FROM product_slots WHERE product_id = ? AND booked_by = ? ORDER BY starts_at`, productId, userId)
    .map(s => ({ id: s.id, startsAt: s.starts_at, canCancel: new Date(s.starts_at).getTime() - Date.now() >= PRODUCT_RULES.cancelHours * 3600e3 }));

  router.add({
    method: 'GET', path: '/me/products', group: 'Student: products', summary: 'My products by mode: sessions and bookings, subscriptions and periods, materials.', auth: S,
    handler: ({ user }) => db.all(`SELECT p.*, pp.id AS purchase_id FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE pp.user_id = ? AND pp.status = 'active' ORDER BY pp.created_at DESC`, user!.id)
      .map(p => {
        const pu = db.get('SELECT * FROM product_purchases WHERE id = ?', p.purchase_id);
        const upcoming = kindOf(p) === 'sessions' ? myBookings(user!.id, p.id).filter(b => b.startsAt > nowIso()) : [];
        return { ...productCard(db, p), purchase: purchaseState(db, pu, p), upcoming };
      })
  });

  router.add({
    method: 'GET', path: '/learning/products/:id', group: 'Student: products', summary: 'Purchased product: meeting link, my bookings and free slots, full material text.', auth: 'user',
    handler: ({ user, params }) => {
      const p = getProduct(db, params.id);
      const pu = user!.role === 'student' ? activePurchase(db, user!.id, p.id) : undefined;
      if (!hasAccess(db, user, p) && !pu) throw forbidden('Сначала получите доступ к продукту');
      const live = kindOf(p) !== 'subscription' || subscriptionLive(pu) || user!.role !== 'student';
      return {
        ...productCard(db, p), scheduleNote: p.schedule_note, ...contentFor(p, true),
        meetingUrl: live ? p.meeting_url : null,
        purchase: purchaseState(db, pu, p),
        bookings: kindOf(p) === 'sessions' && pu ? myBookings(user!.id, p.id) : [],
        freeSlots: kindOf(p) === 'sessions' ? futureFreeSlots(db, p.id, 60) : []
      };
    }
  });

  router.add({
    method: 'POST', path: '/products/:id/book', group: 'Student: products', summary: 'Book a free slot from the expert\'s schedule. Uses one session from the package.', auth: S,
    body: '{ slotId }',
    handler: ({ user, params, body }) => {
      const p = getProduct(db, params.id);
      if (kindOf(p) !== 'sessions') throw conflict('not_sessions', 'У этого продукта нет записи на встречи');
      const b = parse<{ slotId: string }>(body, { slotId: str({ max: 64 }) });
      return db.tx(() => {
        const pu = activePurchase(db, user!.id, p.id);
        if (!pu) throw forbidden('Сначала купите встречу');
        if (sessionsBooked(db, pu.id) >= pu.sessions_total) throw conflict('no_sessions_left', 'Все встречи пакета уже назначены. Купите ещё одну, чтобы записаться.');
        const slot = db.get('SELECT * FROM product_slots WHERE id = ? AND product_id = ?', b.slotId, p.id);
        if (!slot) throw notFound('Время не найдено');
        if (slot.starts_at <= new Date(Date.now() + 3600e3).toISOString()) throw conflict('slot_past', 'На это время уже нельзя записаться');
        const r = db.run('UPDATE product_slots SET booked_by = ?, purchase_id = ?, booked_at = ? WHERE id = ? AND booked_by IS NULL', user!.id, pu.id, nowIso(), slot.id);
        if (!Number(r.changes)) throw conflict('slot_taken', 'Это время уже заняли. Выберите другое.');
        return { slotId: slot.id, startsAt: slot.starts_at, meetingUrl: p.meeting_url };
      });
    }
  });

  router.add({
    method: 'POST', path: '/bookings/:slotId/cancel', group: 'Student: products', summary: `Cancel a booking. Students: at least ${PRODUCT_RULES.cancelHours} hours before the session; experts: any time. The session returns to the package.`, auth: ['student', 'expert'],
    handler: ({ user, params }) => {
      const slot = db.get('SELECT s.*, p.expert_id FROM product_slots s JOIN products p ON p.id = s.product_id WHERE s.id = ?', params.slotId);
      if (!slot || (slot.booked_by !== user!.id && slot.expert_id !== user!.id)) throw notFound('Запись не найдена');
      if (!slot.booked_by) throw conflict('not_booked', 'На это время никто не записан');
      if (user!.role === 'student' && new Date(slot.starts_at).getTime() - Date.now() < PRODUCT_RULES.cancelHours * 3600e3)
        throw conflict('too_late', `Отменить запись можно не позже чем за ${PRODUCT_RULES.cancelHours} часа до встречи`);
      db.run('UPDATE product_slots SET booked_by = NULL, purchase_id = NULL, booked_at = NULL WHERE id = ?', slot.id);
      return { slotId: slot.id, cancelled: true };
    }
  });

  // ---------- Club and chat messages ----------
  const canChat = (user: User, p: any) => {
    if (kindOf(p) !== 'subscription') throw conflict('no_chat', 'У этого продукта нет чата');
    if (user.role === 'moderator' || p.expert_id === user.id) return;
    if (!subscriptionLive(activePurchase(db, user.id, p.id))) throw forbidden('Чат доступен участникам с действующей подпиской');
  };
  router.add({
    method: 'GET', path: '/products/:id/messages', group: 'Student: products', summary: 'Club or chat messages (last 200). Param after: only messages newer than the given time.', auth: 'user',
    handler: ({ user, params, query }) => {
      const p = getProduct(db, params.id); canChat(user!, p);
      const after = query.get('after') || '';
      return db.all(`SELECT * FROM (SELECT m.id, m.text, m.created_at, m.user_id, u.name, u.role FROM product_messages m JOIN users u ON u.id = m.user_id
        WHERE m.product_id = ? AND m.created_at > ? ORDER BY m.created_at DESC LIMIT 200) ORDER BY created_at`, p.id, after)
        .map(m => ({ id: m.id, text: m.text, createdAt: m.created_at, mine: m.user_id === user!.id, author: m.user_id === p.expert_id ? m.name : shortName(m.name), isExpert: m.user_id === p.expert_id }));
    }
  });
  router.add({
    method: 'POST', path: '/products/:id/messages', group: 'Student: products', summary: 'Post to a club or chat.', auth: 'user', body: '{ text }',
    handler: ({ user, params, body }) => {
      const p = getProduct(db, params.id); canChat(user!, p);
      const b = parse<{ text: string }>(body, { text: str({ min: 1, max: PRODUCT_RULES.messageMax }) });
      const id = newId(), at = nowIso();
      db.run('INSERT INTO product_messages (id, product_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', id, p.id, user!.id, b.text, at);
      return { id, text: b.text, createdAt: at, mine: true };
    }
  });

  router.add({
    method: 'POST', path: '/products/:id/reviews', group: 'Student: products', summary: 'Review a purchased product (one per product).', auth: S,
    body: '{ rating: 1–5, text: 10–1500 chars }',
    handler: ({ user, params, body }) => {
      const p = getProduct(db, params.id);
      if (!activePurchase(db, user!.id, p.id)) throw forbidden('Отзыв может оставить только купивший ученик');
      const b = parse<{ rating: number; text: string }>(body, { rating: num({ int: true, min: 1, max: 5 }), text: str({ min: 10, max: 1500 }) });
      const id = newId();
      try { db.run('INSERT INTO product_reviews (id, product_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, p.id, user!.id, b.rating, b.text, nowIso()); }
      catch (e: any) { if (/UNIQUE/.test(e.message)) throw conflict('review_exists', 'Вы уже оставили отзыв об этом продукте'); throw e; }
      return { id, rating: b.rating, text: b.text };
    }
  });

  // ---------- Studio ----------
  const detail = (id: string) => {
    const p = db.get('SELECT * FROM products WHERE id = ?', id)!;
    const purchases = db.get('SELECT COUNT(*) AS n FROM product_purchases WHERE product_id = ?', id)!.n as number;
    const slots = kindOf(p) === 'sessions' ? db.all(`SELECT s.id, s.starts_at, s.booked_at, u.name FROM product_slots s LEFT JOIN users u ON u.id = s.booked_by WHERE s.product_id = ? AND s.starts_at > ? ORDER BY s.starts_at`, id, new Date(Date.now() - 864e5).toISOString())
      .map(s => ({ id: s.id, startsAt: s.starts_at, bookedBy: s.name ? shortName(s.name) : null, bookedAt: s.booked_at })) : [];
    return {
      ...productCard(db, p), meetingUrl: p.meeting_url, scheduleNote: p.schedule_note, content: p.content ?? '',
      moderationNote: p.moderation_note, submittedAt: p.submitted_at, slots,
      checklist: productChecklist(db, p),
      rules: { canEdit: p.status !== 'review', canDelete: p.status !== 'review' && purchases === 0, canChangePackage: !isLiveProduct(p) }
    };
  };

  router.add({
    method: 'GET', path: '/studio/products', group: 'Studio: products', summary: 'My products across all modes. Params: mode, status.', auth: E,
    handler: ({ user, query }) => db.all('SELECT * FROM products WHERE expert_id = ? ORDER BY updated_at DESC', user!.id)
      .filter(p => (!query.get('mode') || p.mode === query.get('mode')) && (!query.get('status') || p.status === query.get('status')))
      .map(p => ({ ...productCard(db, p), checklistLeft: productChecklist(db, p).filter(x => !x.ok).length }))
  });

  router.add({
    method: 'POST', path: '/studio/products', group: 'Studio: products', summary: 'Create a product draft of the given type.', auth: E,
    body: `{ type: ${TYPES.join(' | ')}, title? }`,
    handler: ctx => {
      const b = parse<{ type: string; title?: string }>(ctx.body, { type: oneOf(TYPES), title: str({ max: 90, optional: true }) });
      const info = PRODUCT_TYPES[b.type], id = newId(), now = nowIso();
      const sessions = { consultation: 1, personal: 4, mentorship: 12 }[b.type as 'consultation'] ?? null;
      db.run(`INSERT INTO products (id, expert_id, mode, type, title, duration_min, sessions, period_days, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, ctx.user!.id, info.mode, b.type, b.title ?? '', info.kind === 'sessions' ? 60 : null, sessions, info.kind === 'subscription' ? 30 : null, now, now);
      ctx.status = 201;
      return detail(id);
    }
  });

  router.add({
    method: 'GET', path: '/studio/products/:id', group: 'Studio: products', summary: 'Product for the editor: fields, schedule with bookings, moderation checklist.', auth: E,
    handler: ({ user, params }) => { ownProduct(db, user!, params.id); return detail(params.id); }
  });

  router.add({
    method: 'PATCH', path: '/studio/products/:id', group: 'Studio: products', summary: 'Update a product. Locked while in moderation. A new price and package size apply to new purchases.', auth: E,
    body: '{ title?, description?, price?, cover?, durationMin?, sessions?, periodDays?, meetingUrl?, scheduleNote?, content? }',
    handler: ({ user, params, body }) => {
      const p = ownProduct(db, user!, params.id);
      assertProductEditable(p);
      const b = parse<Record<string, any>>(body, {
        title: str({ max: 90, optional: true }), description: str({ max: 1500, optional: true }),
        price: num({ int: true, min: 0, max: 10_000_000, optional: true, nullable: true }), cover: oneOf(COVER_LIBRARY, { optional: true, nullable: true }),
        durationMin: num({ int: true, min: 15, max: 240, optional: true }), sessions: num({ int: true, min: 1, max: 52, optional: true }),
        periodDays: num({ int: true, min: 7, max: 365, optional: true }), meetingUrl: str({ max: 300, optional: true, nullable: true }),
        scheduleNote: str({ max: 300, optional: true, nullable: true }), content: str({ max: 20000, optional: true, trim: false })
      });
      const kind = kindOf(p);
      if (b.meetingUrl && !isUrl(b.meetingUrl)) throw new HttpError(422, 'validation', 'Проверьте поля', { meetingUrl: 'Нужна ссылка, начинающаяся с https://' });
      if (b.sessions !== undefined && (kind !== 'sessions' || p.type === 'consultation')) delete b.sessions;
      if (b.durationMin !== undefined && kind !== 'sessions') delete b.durationMin;
      if (b.periodDays !== undefined && kind !== 'subscription') delete b.periodDays;
      if (b.content !== undefined && kind !== 'material') delete b.content;
      const cols: Record<string, string> = { title: 'title', description: 'description', price: 'price', cover: 'cover', durationMin: 'duration_min', sessions: 'sessions', periodDays: 'period_days', meetingUrl: 'meeting_url', scheduleNote: 'schedule_note', content: 'content' };
      db.tx(() => {
        for (const [k, col] of Object.entries(cols)) if (k in b) db.run(`UPDATE products SET ${col} = ? WHERE id = ?`, b[k] === '' && k === 'meetingUrl' ? null : b[k], p.id);
        if ('cover' in b && p.cover?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', p.cover.slice(7)), { force: true });
        db.run('UPDATE products SET updated_at = ? WHERE id = ?', nowIso(), p.id);
      });
      return detail(p.id);
    }
  });

  router.add({
    method: 'PUT', path: '/studio/products/:id/cover', group: 'Studio: products', summary: 'Custom product cover: the request body is a JPG, PNG or WEBP image up to 5 MB.', auth: E, raw: true, body: 'binary image file',
    handler: async ({ user, params, req }) => {
      const p = ownProduct(db, user!, params.id);
      assertProductEditable(p);
      const ext = IMAGE_TYPES[String(req.headers['content-type'] || '').split(';')[0]];
      if (!ext) throw new HttpError(415, 'unsupported_type', 'Нужна картинка JPG, PNG или WEBP');
      const file = `${p.id}-${Date.now()}${ext}`;
      await receiveFile(req, path.join(app.storageDir, 'covers', file), RULES.maxCoverBytes);
      if (p.cover?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', p.cover.slice(7)), { force: true });
      db.run('UPDATE products SET cover = ?, updated_at = ? WHERE id = ?', 'upload:' + file, nowIso(), p.id);
      return detail(p.id);
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/products/:id', group: 'Studio: products', summary: 'Delete a product. Not allowed if it has been purchased or is in moderation.', auth: E,
    handler: ({ user, params }) => {
      const p = ownProduct(db, user!, params.id);
      assertProductEditable(p);
      if (db.get('SELECT 1 FROM product_purchases WHERE product_id = ?', p.id)) throw conflict('course_has_students', 'Продукт уже покупали, его можно только скрыть из каталога.');
      db.run('DELETE FROM products WHERE id = ?', p.id);
      if (p.cover?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', p.cover.slice(7)), { force: true });
    }
  });

  const transition = (name: string, summary: string, fn: (p: any, user: User) => void) => router.add({
    method: 'POST', path: `/studio/products/:id/${name}`, group: 'Studio: products', summary, auth: E,
    handler: ({ user, params }) => { const p = ownProduct(db, user!, params.id); db.tx(() => fn(p, user!)); return detail(p.id); }
  });
  transition('submit', 'Submit the draft for moderation: requires a verified profile and a completed checklist.', (p, user) => {
    if (p.status !== 'draft') throw conflict('bad_status', 'На модерацию отправляется только черновик');
    assertVerifiedExpert(db, user, 'Отправлять продукты на модерацию');
    const left = productChecklist(db, p).filter(x => !x.ok);
    if (left.length) throw new HttpError(422, 'checklist', 'Продукт ещё не готов к модерации', left.map(x => x.label));
    db.run(`UPDATE products SET status = 'review', submitted_at = ?, moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), p.id);
  });
  transition('withdraw', 'Withdraw the product from moderation.', p => {
    if (p.status !== 'review') throw conflict('bad_status', 'Продукт не на модерации');
    db.run(`UPDATE products SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), p.id);
  });
  transition('hide', 'Hide from the catalog. Buyers keep access.', p => {
    if (p.status !== 'published') throw conflict('bad_status', 'Скрыть можно только продукт из каталога');
    db.run(`UPDATE products SET status = 'hidden', updated_at = ? WHERE id = ?`, nowIso(), p.id);
  });
  transition('unhide', 'Return a hidden product to the catalog.', p => {
    if (p.status !== 'hidden') throw conflict('bad_status', 'Продукт не скрыт');
    db.run(`UPDATE products SET status = 'published', updated_at = ? WHERE id = ?`, nowIso(), p.id);
  });

  router.add({
    method: 'POST', path: '/studio/products/:id/slots', group: 'Studio: products', summary: `Add a slot to the session schedule (from one hour up to ${PRODUCT_RULES.slotMaxDays} days ahead). Works for published products and products in moderation.`, auth: E,
    body: '{ startsAt: ISO 8601 date-time }',
    handler: ({ user, params, body }) => {
      const p = ownProduct(db, user!, params.id);
      if (kindOf(p) !== 'sessions') throw conflict('not_sessions', 'Расписание есть только у встреч');
      const b = parse<{ startsAt: string }>(body, { startsAt: str({ max: 40 }) });
      const t = new Date(b.startsAt);
      if (isNaN(t.getTime())) throw new HttpError(422, 'validation', 'Проверьте поля', { startsAt: 'Нужны дата и время' });
      if (t.getTime() < Date.now() + 3600e3 || t.getTime() > Date.now() + PRODUCT_RULES.slotMaxDays * 864e5)
        throw new HttpError(422, 'validation', 'Проверьте поля', { startsAt: `Время — от часа до ${PRODUCT_RULES.slotMaxDays} дней вперёд` });
      try { db.run('INSERT INTO product_slots (id, product_id, starts_at) VALUES (?, ?, ?)', newId(), p.id, t.toISOString()); }
      catch (e: any) { if (/UNIQUE/.test(e.message)) throw conflict('slot_exists', 'Это время уже есть в расписании'); throw e; }
      return detail(p.id);
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/slots/:id', group: 'Studio: products', summary: 'Remove a free slot from the schedule. Cancel a booked slot first; the student gets the session back.', auth: E,
    handler: ({ user, params }) => {
      const s = db.get('SELECT s.*, p.expert_id FROM product_slots s JOIN products p ON p.id = s.product_id WHERE s.id = ?', params.id);
      if (!s || s.expert_id !== user!.id) throw notFound('Время не найдено');
      if (s.booked_by) throw conflict('slot_booked', 'На это время записан ученик. Сначала отмените запись.');
      db.run('DELETE FROM product_slots WHERE id = ?', s.id);
      return detail(s.product_id);
    }
  });

  router.add({
    method: 'GET', path: '/studio/bookings', group: 'Studio: products', summary: 'Upcoming sessions with all student bookings.', auth: E,
    handler: ({ user }) => db.all(
      `SELECT s.id, s.starts_at, p.id AS product_id, p.title, p.duration_min, p.meeting_url, u.name FROM product_slots s JOIN products p ON p.id = s.product_id JOIN users u ON u.id = s.booked_by
       WHERE p.expert_id = ? AND s.starts_at > ? ORDER BY s.starts_at LIMIT 50`, user!.id, new Date(Date.now() - 2 * 3600e3).toISOString())
      .map(s => ({ slotId: s.id, startsAt: s.starts_at, productId: s.product_id, title: s.title, durationMin: s.duration_min, meetingUrl: s.meeting_url, student: shortName(s.name) }))
  });

  // ---------- Product moderation ----------
  const inReview = (id: string) => { const p = getProduct(db, id); if (p.status !== 'review') throw conflict('bad_status', 'Продукт не на модерации'); return p; };
  router.add({
    method: 'GET', path: '/moderation/products/:id', group: 'Moderation', summary: 'Full product for review: text, schedule, links, checklist.', auth: ['moderator'],
    handler: ({ params }) => { getProduct(db, params.id); return detail(params.id); }
  });
  router.add({
    method: 'POST', path: '/moderation/products/:id/approve', group: 'Moderation', summary: 'Approve a product: it appears in the catalog.', auth: ['moderator'],
    handler: ({ params }) => {
      const p = inReview(params.id);
      db.run(`UPDATE products SET status = 'published', published_at = COALESCE(published_at, ?), moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), p.id);
      return productCard(db, getProduct(db, p.id));
    }
  });
  router.add({
    method: 'POST', path: '/moderation/products/:id/reject', group: 'Moderation', summary: 'Return a product to the expert with a comment.', auth: ['moderator'], body: '{ note }',
    handler: ({ params, body }) => {
      const p = inReview(params.id);
      const b = parse<{ note: string }>(body, { note: str({ min: 5, max: 1000 }) });
      db.run(`UPDATE products SET status = 'draft', moderation_note = ?, submitted_at = NULL, updated_at = ? WHERE id = ?`, b.note, nowIso(), p.id);
      return productCard(db, getProduct(db, p.id));
    }
  });

  // ---------- Favorites and profile photo ----------
  router.add({
    method: 'GET', path: '/me/favorites', group: 'Account', summary: 'Favorites: course and product ids.', auth: 'user',
    handler: ({ user }) => db.all<{ item_id: string }>('SELECT item_id FROM favorites WHERE user_id = ? ORDER BY created_at', user!.id).map(r => r.item_id)
  });
  router.add({
    method: 'PUT', path: '/me/favorites/:id', group: 'Account', summary: 'Add a course or product to favorites.', auth: 'user',
    handler: ({ user, params }) => {
      if (!db.get('SELECT 1 FROM courses WHERE id = ? UNION SELECT 1 FROM products WHERE id = ?', params.id, params.id)) throw notFound('Курс или продукт не найден');
      db.run('INSERT OR IGNORE INTO favorites (user_id, item_id, created_at) VALUES (?, ?, ?)', user!.id, params.id, nowIso());
    }
  });
  router.add({
    method: 'DELETE', path: '/me/favorites/:id', group: 'Account', summary: 'Remove from favorites.', auth: 'user',
    handler: ({ user, params }) => { db.run('DELETE FROM favorites WHERE user_id = ? AND item_id = ?', user!.id, params.id); }
  });

  router.add({
    method: 'PUT', path: '/me/avatar', group: 'Account', summary: 'Upload own photo: the request body is a JPG, PNG or WEBP image up to 5 MB.', auth: 'user', raw: true, body: 'binary image file',
    handler: async ({ user, req }) => {
      const ext = IMAGE_TYPES[String(req.headers['content-type'] || '').split(';')[0]];
      if (!ext) throw new HttpError(415, 'unsupported_type', 'Нужна картинка JPG, PNG или WEBP');
      const file = `${user!.id}-${Date.now()}${ext}`;
      await receiveFile(req, path.join(app.storageDir, 'avatars', file), RULES.maxCoverBytes);
      const old = db.get('SELECT avatar_file FROM users WHERE id = ?', user!.id)?.avatar_file;
      db.run('UPDATE users SET avatar_file = ? WHERE id = ?', file, user!.id);
      if (old) fs.rmSync(path.join(app.storageDir, 'avatars', old), { force: true });
      return { avatarUrl: `/media/avatars/${file}` };
    }
  });
  router.add({
    method: 'DELETE', path: '/me/avatar', group: 'Account', summary: 'Remove own photo.', auth: 'user',
    handler: ({ user }) => {
      const old = db.get('SELECT avatar_file FROM users WHERE id = ?', user!.id)?.avatar_file;
      db.run('UPDATE users SET avatar_file = NULL WHERE id = ?', user!.id);
      if (old) fs.rmSync(path.join(app.storageDir, 'avatars', old), { force: true });
    }
  });
  router.add({
    method: 'GET', path: '/media/avatars/:file', group: 'System', summary: 'Profile photos.',
    handler: ctx => {
      if (!/^[\w-]+\.(jpg|png|webp)$/.test(ctx.params.file)) throw notFound();
      sendFile(ctx.req, ctx.res, path.join(app.storageDir, 'avatars', ctx.params.file));
      ctx.handled = true;
    }
  });

}
