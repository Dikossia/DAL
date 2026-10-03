import type { App } from '../app.ts';
import { HttpError, notFound, conflict } from '../http.ts';
import { parse, str, strList, oneOf } from '../validate.ts';
import { RULES, SOCIALS } from '../rules.ts';
import { newId, nowIso, shortName, nextPayoutDate, addDays } from '../util.ts';
import { courseStats, checklist, lessonsOf, progressOf } from '../courses.ts';
import { avatarUrl, expertRatings, expertStudents, forecastStats } from '../experts.ts';
import { productChecklist, productStats, kindOf, purchaseState } from '../products.ts';

const E: ['expert'] = ['expert'];
const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

// All of an expert's sales: courses, products and subscription renewals.
const SALES = `
  SELECT * FROM (
    SELECT e.created_at, e.price_paid, e.commission, c.id AS item_id, c.title, 'course' AS kind, u.name AS user_name, c.expert_id
      FROM enrollments e JOIN courses c ON c.id = e.course_id JOIN users u ON u.id = e.user_id WHERE e.status = 'active'
    UNION ALL
    SELECT pp.created_at, pp.price_paid, pp.commission, p.id, p.title, 'product', u.name, p.expert_id
      FROM product_purchases pp JOIN products p ON p.id = pp.product_id JOIN users u ON u.id = pp.user_id WHERE pp.status = 'active'
    UNION ALL
    SELECT r.created_at, r.price_paid, r.commission, p.id, p.title, 'renewal', u.name, p.expert_id
      FROM product_renewals r JOIN product_purchases pp ON pp.id = r.purchase_id JOIN products p ON p.id = pp.product_id JOIN users u ON u.id = pp.user_id WHERE pp.status = 'active'
  ) WHERE expert_id = ?`;

// Social links: accept a URL or @handle and normalize to a URL.
const SOCIAL_HOSTS: Record<string, RegExp> = { telegram: /^(t\.me|telegram\.me)$/, instagram: /(^|\.)instagram\.com$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/, linkedin: /(^|\.)linkedin\.com$/, website: /./ };
const HANDLE_BASE: Record<string, string> = { telegram: 'https://t.me/', instagram: 'https://instagram.com/', youtube: 'https://youtube.com/@' };
function normalizeSocial(key: string, raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  const handle = /^@?([A-Za-z0-9_.]{2,40})$/.exec(v);
  if (handle && HANDLE_BASE[key]) return HANDLE_BASE[key] + handle[1];
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); } catch { throw new HttpError(422, 'validation', 'Проверьте поля', { [key]: 'Нужна ссылка или @ник' }); }
  if (!SOCIAL_HOSTS[key].test(url.hostname.replace(/^www\./, ''))) throw new HttpError(422, 'validation', 'Проверьте поля', { [key]: 'Ссылка ведёт не на ту соцсеть' });
  url.protocol = 'https:';
  return url.toString();
}

export function registerStudioOther(app: App) {
  const { db, router } = app;

  const profile = (userId: string) => {
    const r = db.get('SELECT u.name, u.email, u.avatar_file, p.* FROM users u JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?', userId)!;
    return {
      name: r.name, email: r.email, specialization: r.specialization, bio: r.bio, experience: r.experience,
      achievements: JSON.parse(r.achievements || '[]'), socials: JSON.parse(r.socials || '{}'), avatarUrl: avatarUrl(r), hasOwnAvatar: !!r.avatar_file,
      verified: !!r.verified_at, verifiedAt: r.verified_at,
      pendingRequests: db.all(`SELECT id, field, value, created_at AS createdAt FROM profile_requests WHERE expert_id = ? AND status = 'pending' ORDER BY created_at`, userId)
    };
  };

  const monthly = (userId: string, months = 6) => {
    const now = new Date(), out: { month: string; label: string; gross: number; commission: number; networkFees: number; net: number; sales: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const s = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS fee FROM (${SALES}) WHERE substr(created_at, 1, 7) = ?`, userId, key)!;
      // Network fees for forecasts recorded on Solana are deducted from the expert's income.
      const nf = db.get<{ s: number }>(`SELECT COALESCE(SUM(network_fee), 0) AS s FROM forecasts WHERE expert_id = ? AND substr(published_at, 1, 7) = ?`, userId, key)!.s;
      out.push({ month: key, label: MONTHS[d.getMonth()], gross: s.gross, commission: s.fee, networkFees: nf, net: s.gross - s.fee - nf, sales: s.n });
    }
    return out;
  };

  router.add({
    method: 'GET', path: '/studio/overview', group: 'Studio: overview', summary: 'Dashboard summary: students, sales, rating, upcoming sessions and the "Needs attention" list.', auth: E,
    handler: ({ user }) => {
      const id = user!.id;
      const courses = db.all('SELECT * FROM courses WHERE expert_id = ?', id);
      const products = db.all('SELECT * FROM products WHERE expert_id = ?', id);
      const live = [...courses, ...products].filter(c => c.status === 'published' || c.status === 'hidden');
      const ratings = expertRatings(db, id);
      const months = monthly(id, 2);
      const attention: { type: string; title: string; detail: string; link: string }[] = [];
      const items = [
        ...courses.map(c => ({ row: c, left: checklist(c, lessonsOf(db, c.id)).filter(x => !x.ok).length, link: `/studio/courses/${c.id}`, empty: 'Новый курс' })),
        ...products.map(p => ({ row: p, left: productChecklist(db, p).filter(x => !x.ok).length, link: `/studio/products/${p.id}`, empty: 'Новый продукт' }))
      ];
      for (const it of items.filter(x => x.row.status === 'draft')) {
        attention.push({ type: 'draft', title: it.row.title || it.empty, detail: it.left ? `До модерации осталось пунктов: ${it.left}` : 'Готов к отправке на модерацию', link: it.link });
        if (it.row.moderation_note) attention.push({ type: 'rejected', title: it.row.title || it.empty, detail: `Модерация вернула: ${it.row.moderation_note}`, link: it.link });
      }
      for (const it of items.filter(x => x.row.status === 'review')) attention.push({ type: 'review', title: it.row.title, detail: `На модерации с ${it.row.submitted_at?.slice(0, 10)}`, link: it.link });
      for (const fc of db.all(`SELECT * FROM forecasts WHERE expert_id = ? AND status = 'active' AND deadline <= ?`, id, addDays(14)))
        attention.push({ type: 'forecast', title: `Прогноз ${fc.ticker}`, detail: `Проверка ${fc.deadline}`, link: '/studio/forecasts' });
      const unanswered = (db.get(`SELECT COUNT(*) AS n FROM reviews r JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ? AND r.reply IS NULL AND r.hidden = 0
          AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.review_id = r.id AND rr.status = 'pending')`, id)!.n as number)
        + (db.get(`SELECT COUNT(*) AS n FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE p.expert_id = ? AND r.reply IS NULL AND r.hidden = 0
          AND NOT EXISTS (SELECT 1 FROM product_review_reports rr WHERE rr.review_id = r.id AND rr.status = 'pending')`, id)!.n as number);
      if (unanswered) attention.push({ type: 'reviews', title: `Отзывов без ответа: ${unanswered}`, detail: 'Ответы видны всем ученикам', link: '/studio/reviews' });
      const bookings = db.all(
        `SELECT s.id, s.starts_at, p.id AS product_id, p.title, p.duration_min, p.meeting_url, u.name FROM product_slots s JOIN products p ON p.id = s.product_id JOIN users u ON u.id = s.booked_by
         WHERE p.expert_id = ? AND s.starts_at > ? AND s.starts_at < ? ORDER BY s.starts_at`, id, new Date(Date.now() - 2 * 3600e3).toISOString(), new Date(Date.now() + 14 * 864e5).toISOString())
        .map(s => ({ slotId: s.id, startsAt: s.starts_at, productId: s.product_id, title: s.title, durationMin: s.duration_min, meetingUrl: s.meeting_url, student: shortName(s.name) }));
      return {
        verified: !!db.get('SELECT verified_at FROM expert_profiles WHERE user_id = ?', id)?.verified_at,
        students: expertStudents(db, id),
        liveCourses: live.length,
        salesThisMonth: months[1], salesLastMonth: months[0],
        rating: ratings.overall, ratings: ratings.byMode, reviews: ratings.reviews,
        forecasts: forecastStats(db, id),
        bookings, attention
      };
    }
  });

  router.add({
    method: 'GET', path: '/studio/students', group: 'Studio: students', summary: 'Course students and product buyers: shortened name and progress. Emails and phone numbers are not returned. Param item: a course or product.', auth: E,
    handler: ({ user, query }) => {
      const item = query.get('item') || query.get('course');
      const courses = db.all(
        `SELECT e.user_id, e.course_id, e.created_at, u.name, c.title FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
         WHERE c.expert_id = ? AND e.status = 'active'`, user!.id).map(r => {
        const last = db.get(`SELECT MAX(p.completed_at) AS t FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = ? AND m.course_id = ?`, r.user_id, r.course_id)!.t;
        const pr = progressOf(db, r.user_id, r.course_id);
        return { name: shortName(r.name), kind: 'course', itemId: r.course_id, itemTitle: r.title, courseId: r.course_id, courseTitle: r.title, enrolledAt: r.created_at, lastActivity: last ?? r.created_at, progress: pr, status: `${pr.done} из ${pr.total} уроков` };
      });
      const products = db.all(
        `SELECT pp.*, u.name, p.title, p.type, p.mode FROM product_purchases pp JOIN users u ON u.id = pp.user_id JOIN products p ON p.id = pp.product_id
         WHERE p.expert_id = ? AND pp.status = 'active'`, user!.id).map(r => {
        const st = purchaseState(db, r, r)!;
        const k = kindOf(r);
        const status = k === 'sessions' ? `Назначено встреч: ${st.sessionsBooked} из ${st.sessionsTotal}` : k === 'subscription' ? (st.active ? `Подписка до ${String(st.expiresAt).slice(0, 10)}` : 'Подписка закончилась') : 'Материал открыт';
        const percent = k === 'sessions' ? Math.round((st.sessionsBooked! / Math.max(1, st.sessionsTotal!)) * 100) : k === 'subscription' ? (st.active ? 100 : 0) : 100;
        return { name: shortName(r.name), kind: 'product', itemId: r.product_id, itemTitle: r.title, enrolledAt: r.created_at, lastActivity: r.created_at, progress: { percent }, status };
      });
      return [...courses, ...products].filter(r => !item || r.itemId === item).sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
    }
  });

  // Course and product reviews in a single list.
  router.add({
    method: 'GET', path: '/studio/reviews', group: 'Studio: reviews', summary: 'Reviews of my courses and products. Param unanswered=1: only unanswered ones.', auth: E,
    handler: ({ user, query }) => {
      const course = db.all(
        `SELECT r.*, u.name AS author, c.title AS item_title, c.id AS item_id, 'course' AS kind,
           (SELECT status FROM review_reports rr WHERE rr.review_id = r.id ORDER BY created_at DESC LIMIT 1) AS report_status
         FROM reviews r JOIN users u ON u.id = r.user_id JOIN courses c ON c.id = r.course_id WHERE c.expert_id = ?`, user!.id);
      const product = db.all(
        `SELECT r.*, u.name AS author, p.title AS item_title, p.id AS item_id, 'product' AS kind,
           (SELECT status FROM product_review_reports rr WHERE rr.review_id = r.id ORDER BY created_at DESC LIMIT 1) AS report_status
         FROM product_reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id WHERE p.expert_id = ?`, user!.id);
      return [...course, ...product]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .filter(r => query.get('unanswered') !== '1' || (!r.reply && !r.report_status && !r.hidden))
        .map(r => ({ id: r.id, kind: r.kind, author: shortName(r.author), itemId: r.item_id, courseTitle: r.item_title, itemTitle: r.item_title, rating: r.rating, text: r.text, createdAt: r.created_at, reply: r.reply, repliedAt: r.replied_at, hidden: r.hidden === 1, report: r.report_status }));
    }
  });

  const ownReview = (userId: string, id: string): { row: any; table: 'reviews' | 'product_reviews'; reports: 'review_reports' | 'product_review_reports' } => {
    const c = db.get('SELECT r.* FROM reviews r JOIN courses c ON c.id = r.course_id WHERE r.id = ? AND c.expert_id = ?', id, userId);
    if (c) return { row: c, table: 'reviews', reports: 'review_reports' };
    const p = db.get('SELECT r.* FROM product_reviews r JOIN products p ON p.id = r.product_id WHERE r.id = ? AND p.expert_id = ?', id, userId);
    if (p) return { row: p, table: 'product_reviews', reports: 'product_review_reports' };
    throw notFound('Отзыв не найден');
  };

  router.add({
    method: 'PUT', path: '/studio/reviews/:id/reply', group: 'Studio: reviews', summary: 'Public reply to a review (editable). The expert cannot change or delete the review itself.', auth: E,
    body: '{ text: 2–1000 chars }',
    handler: ({ user, params, body }) => {
      const r = ownReview(user!.id, params.id);
      const b = parse<{ text: string }>(body, { text: str({ min: 2, max: 1000 }) });
      db.run(`UPDATE ${r.table} SET reply = ?, replied_at = ? WHERE id = ?`, b.text, nowIso(), r.row.id);
      return { id: r.row.id, reply: b.text };
    }
  });

  router.add({
    method: 'POST', path: '/studio/reviews/:id/report', group: 'Studio: reviews', summary: 'Report a review. It stays visible until moderation decides.', auth: E,
    body: '{ reason: "spam" | "abuse" | "offtopic" | "other" }',
    handler: ({ user, params, body }) => {
      const r = ownReview(user!.id, params.id);
      const b = parse<{ reason: string }>(body, { reason: oneOf(['spam', 'abuse', 'offtopic', 'other'] as const) });
      if (db.get(`SELECT 1 FROM ${r.reports} WHERE review_id = ? AND status = 'pending'`, r.row.id)) throw conflict('already_reported', 'Жалоба уже на рассмотрении');
      db.run(`INSERT INTO ${r.reports} (id, review_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`, newId(), r.row.id, user!.id, b.reason, nowIso());
      return { id: r.row.id, report: 'pending' };
    }
  });

  for (const method of ['PATCH', 'DELETE'] as const) router.add({
    method, path: '/studio/reviews/:id', group: 'Studio: reviews', summary: 'Experts cannot change or delete a review: always 409.', auth: E,
    handler: () => { throw conflict('review_immutable', 'Отзывы нельзя изменить или удалить. Пожалуйтесь на отзыв, решение примет модерация.'); }
  });

  router.add({
    method: 'GET', path: '/studio/income', group: 'Studio: income', summary: 'Course and product sales by month and per item, recent sales and the next payout.', auth: E,
    handler: ({ user }) => {
      const id = user!.id;
      const byItem = [
        ...db.all(`SELECT * FROM courses WHERE expert_id = ? AND status IN ('published', 'hidden') ORDER BY published_at`, id).map(c => ({ itemId: c.id, kind: 'course', title: c.title, ...courseStats(db, c.id) })),
        ...db.all(`SELECT * FROM products WHERE expert_id = ? AND status IN ('published', 'hidden') ORDER BY published_at`, id).map(p => { const s = productStats(db, p.id); return { itemId: p.id, kind: 'product', title: p.title, students: s.buyers, ...s }; })
      ];
      const recent = db.all(`${SALES} ORDER BY created_at DESC LIMIT 20`, id)
        .map(r => ({ date: r.created_at, kind: r.kind, itemId: r.item_id, courseId: r.item_id, courseTitle: r.title + (r.kind === 'renewal' ? ' · продление' : ''), student: shortName(r.user_name), amount: r.price_paid, commission: r.commission, net: r.price_paid - r.commission }));
      const refunds = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(price_paid), 0) AS sum FROM (
          SELECT e.price_paid FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.expert_id = ? AND e.status = 'refunded'
          UNION ALL SELECT pp.price_paid FROM product_purchases pp JOIN products p ON p.id = pp.product_id WHERE p.expert_id = ? AND pp.status = 'refunded')`, id, id)!;
      return {
        commissionRate: RULES.commission,
        months: monthly(id, 6),
        byCourse: byItem, byItem, recent,
        refunds: { count: refunds.n, amount: refunds.sum },
        networkFees: { perForecast: RULES.forecastNetworkFee, ...db.get(`SELECT COUNT(*) AS forecasts, COALESCE(SUM(network_fee), 0) AS amount FROM forecasts WHERE expert_id = ? AND network_fee > 0`, id) },
        nextPayout: nextPayoutDate(RULES.payoutDays),
        payoutsNote: 'Выплаты подключаются после интеграции платёжной системы. Сейчас суммы расчётные.'
      };
    }
  });

  router.add({
    method: 'GET', path: '/studio/profile', group: 'Studio: profile', summary: 'My public profile, social links and change requests.', auth: E,
    handler: ({ user }) => profile(user!.id)
  });

  router.add({
    method: 'PATCH', path: '/studio/profile', group: 'Studio: profile', summary: 'Change specialization, bio, achievements and social links. Visible to students immediately.', auth: E,
    body: `{ specialization?, bio?, achievements?: string[], socials?: { ${SOCIALS.join(', ')} }: URL or @handle }`,
    handler: ({ user, body }) => {
      const b = parse<{ specialization?: string; bio?: string; achievements?: string[]; socials?: Record<string, unknown> }>(body, {
        specialization: str({ min: 2, max: 80, optional: true }), bio: str({ max: 800, optional: true }), achievements: strList({ optional: true, maxItems: 8, maxLen: 120 }),
        socials: Object.assign((v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? { ok: true as const, value: v } : { ok: false as const, error: 'Ожидается объект' }), { optional: true })
      });
      let socials: Record<string, string> | undefined;
      if (b.socials) {
        socials = {};
        for (const key of SOCIALS) {
          const raw = (b.socials as Record<string, unknown>)[key];
          if (typeof raw === 'string' && raw.trim()) socials[key] = normalizeSocial(key, raw);
        }
      }
      db.tx(() => {
        if (b.specialization !== undefined) db.run('UPDATE expert_profiles SET specialization = ? WHERE user_id = ?', b.specialization, user!.id);
        if (b.bio !== undefined) db.run('UPDATE expert_profiles SET bio = ? WHERE user_id = ?', b.bio, user!.id);
        if (b.achievements !== undefined) db.run('UPDATE expert_profiles SET achievements = ? WHERE user_id = ?', JSON.stringify(b.achievements), user!.id);
        if (socials) db.run('UPDATE expert_profiles SET socials = ? WHERE user_id = ?', JSON.stringify(socials), user!.id);
      });
      return profile(user!.id);
    }
  });

  router.add({
    method: 'POST', path: '/studio/profile/requests', group: 'Studio: profile', summary: 'Request a change of name or years of experience. Takes effect after moderation.', auth: E,
    body: '{ field: "name" | "experience", value }',
    handler: ({ user, body }) => {
      const b = parse<{ field: 'name' | 'experience'; value: string }>(body, { field: oneOf(['name', 'experience'] as const), value: str({ min: 2, max: 60 }) });
      db.tx(() => {
        db.run(`UPDATE profile_requests SET status = 'rejected', decided_at = ? WHERE expert_id = ? AND field = ? AND status = 'pending'`, nowIso(), user!.id, b.field);
        db.run('INSERT INTO profile_requests (id, expert_id, field, value, created_at) VALUES (?, ?, ?, ?, ?)', newId(), user!.id, b.field, b.value, nowIso());
      });
      return profile(user!.id);
    }
  });
}
