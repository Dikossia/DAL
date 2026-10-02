import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { DB } from './db.ts';
import { hashPassword } from './auth.ts';
import { RULES } from './rules.ts';

// Демо-данные берутся из тех же файлов, что и сайты-прототипы (data.js и studio-data.js),
// поэтому эксперты, курсы, отзывы и прогнозы совпадают с тем, что видно на макетах.
export const DEMO_PASSWORD = 'dal-demo-2026';
const SEED_VIDEO = 'demo-lesson.mp4';

function loadWindowData(siteDir: string, file: string, key: string): any {
  const src = path.join(siteDir, file);
  if (!fs.existsSync(src)) throw new Error(`Не найден ${src}. Папка server должна лежать внутри папки DAL рядом с ${file}.`);
  const ctx: any = { window: {} };
  vm.runInNewContext(fs.readFileSync(src, 'utf8'), ctx);
  return ctx.window[key];
}

const ago = (days: number, hour = 12) => { const d = new Date(); d.setDate(d.getDate() - days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };

export function seed(db: DB, siteDir: string, seedDir: string): { accounts: { email: string; role: string; name: string }[] } {
  const DAL = loadWindowData(siteDir, 'data.js', 'DAL');
  const STUDIO = loadWindowData(siteDir, 'studio-data.js', 'STUDIO');
  const videoSize = fs.statSync(path.join(seedDir, SEED_VIDEO)).size;
  const hash = hashPassword(DEMO_PASSWORD);
  const accounts: { email: string; role: string; name: string }[] = [];

  const addUser = (id: string, email: string, name: string, role: string, created = ago(200)) => {
    db.run('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, email, hash, name, role, created);
    accounts.push({ email, role, name });
  };

  db.tx(() => {
    // ----- Люди -----
    addUser('moderator', 'moderator@dal.local', 'Модератор Dal', 'moderator');
    for (const e of DAL.experts) {
      const studio = e.id === STUDIO.expert.id ? STUDIO.expert : null;
      addUser(e.id, `${e.id}@dal.local`, e.name, 'expert', ago(560));
      db.run('INSERT INTO expert_profiles (user_id, specialization, bio, experience, achievements, avatar, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        e.id, e.role, studio?.bio ?? e.bio, e.experience, JSON.stringify(studio?.achievements ?? e.achievements), e.image, studio ? `${studio.verifiedAt}T09:00:00.000Z` : ago(500));
    }
    const students: [string, string][] = [
      ['student', 'Дарын Асылбек'], ['aruzhan', 'Аружан Касымова'], ['daniyar', 'Данияр Сейткали'], ['madina', 'Мадина Жумабаева'],
      ['erlan', 'Ерлан Тулеев'], ['sabina', 'Сабина Ахметова'], ['nurlan', 'Нурлан Беков'], ['aigerim', 'Айгерим Мусина'],
      ['timur-o', 'Тимур Омаров'], ['kamila', 'Камила Рахимова'], ['alibek', 'Алибек Ержанов'], ['guest4821', 'Гость 4821']
    ];
    for (const [id, name] of students) addUser(id, `${id}@dal.local`, name, 'student');

    // ----- Курсы -----
    let n = 0;
    const lessonIds: Record<string, string[]> = {};
    const addCourse = (c: any, expertId: string, modules: { title: string; lessons: { title: string; free: boolean; video: any }[] }[], publishedDaysAgo: number | null) => {
      const created = ago((publishedDaysAgo ?? 3) + 20);
      db.run(`INSERT INTO courses (id, expert_id, title, category, description, price, cover, status, submitted_at, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        c.id, expertId, c.title, c.category, c.description, c.price ?? null, c.cover || null, c.status,
        c.status === 'review' ? ago(2) : null, publishedDaysAgo !== null ? ago(publishedDaysAgo) : null, created, c.status === 'draft' ? ago(1) : created);
      lessonIds[c.id] = [];
      modules.forEach((m, mi) => {
        const mid = `${c.id}-m${mi + 1}`;
        db.run('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)', mid, c.id, m.title, mi + 1);
        m.lessons.forEach((l, li) => {
          const lid = `${c.id}-l${++n}`;
          lessonIds[c.id].push(lid);
          db.run('INSERT INTO lessons (id, module_id, title, position, is_free, created_at) VALUES (?, ?, ?, ?, ?, ?)', lid, mid, l.title, li + 1, l.free, created);
          if (l.video) db.run('INSERT INTO videos (lesson_id, file_name, original_name, mime, size, duration, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            lid, 'seed:' + SEED_VIDEO, l.video.name, 'video/mp4', videoSize, l.video.duration, created);
        });
      });
    };

    // Курсы Алии — из кабинета эксперта (с программой и статусами).
    const studioDays: Record<string, number | null> = { c4: 230, c2: 330, c7: 175, d1: null, d2: null };
    for (const c of STUDIO.courses) addCourse(c, STUDIO.expert.id, c.modules, studioDays[c.id] ?? null);

    // Остальные курсы — из каталога учеников.
    const courseMode = DAL.modes.find((m: any) => m.id === 'courses');
    const generic = ['Основные понятия и постановка задачи', 'Исходные данные и допущения', 'Проверяем гипотезу на примере', 'Обсуждение результатов и ограничений'];
    for (const p of DAL.products.filter((p: any) => p.mode === 'courses' && !STUDIO.courses.some((s: any) => s.id === p.id))) {
      const cat = courseMode.categories.find((c: any) => c.id === p.category);
      const expert = DAL.experts.find((e: any) => e.id === p.expert);
      const titles: string[] = p.modules || Array.from({ length: p.lessons }, (_, i) => generic[i % 4] + (i >= 4 ? ` · часть ${Math.floor(i / 4) + 1}` : ''));
      const modules = [];
      for (let i = 0; i < titles.length; i += 4) modules.push({
        title: titles.length > 4 ? `Модуль ${i / 4 + 1}` : 'Программа',
        lessons: titles.slice(i, i + 4).map((t, j) => ({ title: t, free: i + j === 0, video: { name: `urok-${i + j + 1}.mp4`, duration: 540 + ((i + j) * 173) % 900 } }))
      });
      addCourse({ id: p.id, title: p.title, category: p.category, price: p.price, cover: p.image, status: 'published', description: p.about || `${cat.description} ${expert.bio}` },
        p.expert, modules, 120 + (n % 90));
    }

    // ----- Покупки и прогресс (даты относительно сегодняшнего дня) -----
    const enroll = (user: string, course: string, daysAgo: number, progress: number) => {
      const price = db.get('SELECT price FROM courses WHERE id = ?', course)!.price;
      db.run('INSERT INTO enrollments (id, user_id, course_id, price_paid, commission, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        `${user}-${course}`, user, course, price, Math.round(price * RULES.commission), ago(daysAgo, 10));
      const ids = lessonIds[course], done = Math.round(ids.length * progress);
      ids.slice(0, done).forEach((lid, i) => db.run('INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, ?)', user, lid, ago(Math.max(0, daysAgo - 1 - i), 19)));
    };
    ([
      ['student', 'c1', 21, 0.25], ['aruzhan', 'c4', 20, 0.72], ['daniyar', 'c4', 7, 0.35], ['madina', 'c2', 60, 1], ['erlan', 'c4', 4, 0.12],
      ['sabina', 'c2', 9, 0.64], ['nurlan', 'c7', 150, 1], ['aigerim', 'c2', 6, 0.48], ['timur-o', 'c4', 1, 0.9], ['kamila', 'c7', 165, 0.5],
      ['alibek', 'c2', 0, 0.2], ['guest4821', 'c2', 30, 0], ['aruzhan', 'c2', 115, 1], ['daniyar', 'c2', 80, 0.6], ['madina', 'c4', 75, 0.3],
      ['kamila', 'c4', 50, 0.8], ['nurlan', 'c4', 100, 0.5], ['erlan', 'c2', 170, 1], ['timur-o', 'c2', 135, 0.7], ['sabina', 'c4', 40, 0.4],
      ['aigerim', 'c4', 35, 0.2], ['alibek', 'c7', 140, 1], ['madina', 'c1', 90, 1], ['daniyar', 'c1', 45, 0.5], ['kamila', 'c5', 70, 0.6],
      ['nurlan', 'c3', 25, 0.3], ['sabina', 'c6', 55, 0.4], ['aruzhan', 'c8', 12, 1]
    ] as [string, string, number, number][]).forEach(([u, c, d, p]) => enroll(u, c, d, p));

    // ----- Отзывы -----
    const authors: Record<string, string> = { 'Аружан К.': 'aruzhan', 'Данияр С.': 'daniyar', 'Мадина Ж.': 'madina', 'Гость 4821': 'guest4821', 'Нурлан Б.': 'nurlan' };
    STUDIO.reviews.forEach((r: any, i: number) => db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at, reply, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      r.id, r.course, authors[r.name], r.rating, r.text, ago(4 + i * 6), r.reply, r.reply ? ago(3 + i * 6) : null));
    db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'r6', 'c1', 'madina', 5, 'Понравилось, что можно последовательно разобраться в понятиях и задать вопросы. Особенно полезны примеры.', ago(30));
    db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'r7', 'c1', 'daniyar', 4, 'Стало понятнее, на какие исходные данные смотреть. Хотелось бы ещё больше задач для самостоятельного разбора.', ago(15));

    // ----- Прогнозы -----
    const addForecast = (f: any, expert: string) => {
      db.run(`INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, status, result_price, published_at, resolved_at, resolved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        f.id, expert, f.ticker, f.name, f.direction, f.start, f.target, f.deadline, f.rationale, f.status, f.status === 'active' ? null : f.current,
        `${f.publishedAt}T10:00:00.000Z`, f.status === 'active' ? null : `${f.deadline}T23:00:00.000Z`, f.status === 'active' ? null : 'moderator');
      for (const u of f.updates || []) db.run('INSERT INTO forecast_comments (id, forecast_id, text, created_at) VALUES (?, ?, ?, ?)', `${f.id}-c${u.date}`, f.id, u.text, `${u.date}T12:00:00.000Z`);
    };
    for (const f of STUDIO.forecasts) addForecast(f, STUDIO.expert.id);
    addForecast({ id: 's2', ticker: 'MSFT', name: 'Microsoft', direction: 'up', start: 430, target: 460, current: 468, publishedAt: '2026-09-01', deadline: '2026-09-30', status: 'success', rationale: 'Условие: цена закрытия 30 сентября не ниже $460.' }, 'arman');
    addForecast({ id: 's3', ticker: 'NVDA', name: 'NVIDIA', direction: 'up', start: 170, target: 190, current: 164, publishedAt: '2026-09-01', deadline: '2026-09-30', status: 'miss', rationale: 'Условие: цена закрытия 30 сентября не ниже $190. Неуспешный прогноз остаётся в истории.' }, 'timur');
    addForecast({ id: 's4', ticker: 'SPY', name: 'S&P 500 ETF', direction: 'up', start: 620, target: 650, current: 632, publishedAt: '2026-09-20', deadline: '2026-10-20', status: 'active', rationale: 'Условие: цена закрытия 20 октября не ниже $650.' }, 'arman');
  });
  return { accounts };
}
