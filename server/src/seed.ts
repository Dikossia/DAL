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
      ['nurlan', 'c3', 25, 0.3], ['sabina', 'c6', 55, 0.4], ['aruzhan', 'c8', 12, 1], ['student', 'c8', 10, 1]
    ] as [string, string, number, number][]).forEach(([u, c, d, p]) => enroll(u, c, d, p));

    // ----- Отзывы -----
    const authors: Record<string, string> = { 'Аружан К.': 'aruzhan', 'Данияр С.': 'daniyar', 'Мадина Ж.': 'madina', 'Гость 4821': 'guest4821', 'Нурлан Б.': 'nurlan' };
    STUDIO.reviews.forEach((r: any, i: number) => db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at, reply, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      r.id, r.course, authors[r.name], r.rating, r.text, ago(4 + i * 6), r.reply, r.reply ? ago(3 + i * 6) : null));
    db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'r6', 'c1', 'madina', 5, 'Понравилось, что можно последовательно разобраться в понятиях и задать вопросы. Особенно полезны примеры.', ago(30));
    db.run('INSERT INTO reviews (id, course_id, user_id, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'r7', 'c1', 'daniyar', 4, 'Стало понятнее, на какие исходные данные смотреть. Хотелось бы ещё больше задач для самостоятельного разбора.', ago(15));

    // ----- Вопросы под уроками -----
    const comment = (lesson: string, user: string, text: string, daysAgo: number, hour: number) =>
      db.run('INSERT INTO lesson_comments (id, lesson_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', `lc-${lesson}-${user}-${daysAgo}-${hour}`, lesson, user, text, ago(daysAgo, hour));
    const [c1a, c1b] = lessonIds.c1;
    comment(c1a, 'madina', 'Какой горизонт считать долгосрочным, если цель — покупка квартиры через 5 лет?', 40, 11);
    comment(c1a, 'arman', 'Пять лет — средний горизонт. Для такой цели больше подходят облигации и депозиты, акции — небольшой частью. Подробнее в уроке 6.', 40, 15);
    comment(c1a, 'student', 'Спасибо, пример с подушкой безопасности очень помог.', 18, 20);
    comment(c1b, 'daniyar', 'Резерв лучше держать в тенге или в валюте?', 30, 12);
    comment(c1b, 'arman', 'Основную часть — в валюте ваших расходов, то есть в тенге. Подробный разбор будет в следующем модуле.', 29, 10);
    comment(lessonIds.c8[0], 'aruzhan', 'Можно ли получить таблицу из разбора?', 11, 18);
    comment(lessonIds.c8[0], 'timur', 'Да, ссылка на таблицу в описании урока.', 11, 20);

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

    // ----- Продукты: работа с экспертом, сообщество, идеи (из каталога макета) -----
    seedProducts(db, DAL);
  });
  return { accounts };
}

const IDEAS: Record<string, string> = {
  i1: `Устойчивый бизнес видно не по одной удачной цифре, а по тому, как компания проходит плохие годы.

## Три признака устойчивости
Первый — повторяемая выручка: подписки, контракты, привычка клиентов. Второй — денежный поток, который стабильно покрывает капитальные затраты. Третий — умеренный долг: проценты по нему не съедают прибыль даже в слабый год.

## Как проверить самому
Откройте отчётность за пять–семь лет. Найдите самый слабый год и посмотрите, что стало с выручкой, маржой и долгом. Если компания осталась прибыльной и не нарастила долг, это хороший знак.

## Где граница вывода
Устойчивый бизнес может стоить слишком дорого. Качество компании и привлекательность цены — два разных вопроса, их нужно проверять отдельно.`,
  i2: `Диверсификация — это не «купить побольше разных бумаг», а распределить риск так, чтобы одна ошибка не разрушила весь портфель.

## Что на самом деле снижает риск
Важно, насколько по-разному активы ведут себя в одной ситуации. Десять банковских акций дают меньше разнообразия, чем три бумаги из разных отраслей и одна облигация.

## Частые ошибки
Покупать фонд и отдельно те же акции, которые в нём уже есть. Держать всё в одной валюте при расходах в другой. Считать диверсификацией количество позиций, а не их связь между собой.

## Простой вопрос для проверки
Что случится с портфелем, если упадёт один сектор на 30%? Если ответ «почти весь портфель упадёт вместе с ним», диверсификации нет.`,
  i3: `Сезон отчётности — время, когда рынок сверяет ожидания с фактами. Цена часто реагирует не на сами цифры, а на разницу между ними и прогнозом аналитиков.

## На что смотреть
Выручку и маржу в сравнении с прошлым годом, прогноз менеджмента на следующий период и комментарии о спросе. Разовые статьи лучше выносить за скобки.

## Почему цена может упасть на хорошем отчёте
Если ожидания были выше, даже рост прибыли разочарует рынок. Поэтому полезно заранее записать, какие цифры вы считаете хорошими, и сравнивать с ними, а не с реакцией цены.

## Что делать с этим знанием
Не принимать решений в первые часы после публикации. Сначала прочитать отчёт целиком и проверить, изменилась ли ваша исходная гипотеза.`,
  i4: `Выручка показывает, сколько компания продала, но не сколько денег у неё осталось. Путь от выручки к денежному потоку — главный навык в разборе любой компании.

## Шаг 1. От выручки к операционной прибыли
Вычитаем себестоимость и операционные расходы. Смотрим, как меняется маржа: растёт ли она вместе с выручкой или съедается расходами.

## Шаг 2. От прибыли к операционному потоку
Добавляем неденежные расходы, учитываем изменение запасов и дебиторской задолженности. Если прибыль растёт, а поток нет, деньги «застревают» в оборотном капитале.

## Шаг 3. Свободный денежный поток
Вычитаем капитальные затраты. Именно из свободного потока компания платит дивиденды, гасит долг и выкупает акции. Его стабильность важнее одного удачного года прибыли.`
};

function seedProducts(db: DB, DAL: any) {
  const now = new Date();
  const at = (days: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const sched: Record<string, string> = {
    g1: 'Встречи по средам в 19:00 (Алматы): каждую неделю разбираем одну компанию.',
    g2: 'Раз в неделю, по воскресеньям в 18:00 (Алматы): обсуждаем главу книги.'
  };
  const modeOf: Record<string, string> = {};
  for (const m of DAL.modes) modeOf[m.id] = m;
  for (const p of DAL.products.filter((x: any) => x.mode !== 'courses')) {
    const mode = modeOf[p.mode] as any, cat = mode.categories.find((c: any) => c.id === p.category);
    const expert = DAL.experts.find((e: any) => e.id === p.expert);
    const sessions = p.category === 'consultation' ? 1 : p.category === 'personal' ? 4 : p.category === 'mentorship' ? 12 : null;
    const kind = sessions ? 'sessions' : p.mode === 'community' ? 'subscription' : 'material';
    const created = at(-150, 10);
    db.run(`INSERT INTO products (id, expert_id, mode, type, title, description, price, cover, status, duration_min, sessions, period_days, meeting_url, schedule_note, content, published_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p.id, p.expert, p.mode, p.category, p.title, `${cat.description} ${expert.bio}`, p.price, p.image,
      kind === 'sessions' ? 60 : null, sessions, kind === 'subscription' ? 30 : null,
      kind === 'sessions' || p.category === 'clubs' ? `https://meet.example.com/dal-${p.id}` : null, sched[p.id] ?? null, IDEAS[p.id] ?? null,
      at(-120, 10), created, created);
    if (kind === 'sessions') for (let d = 2; d <= 20; d += 3) for (const h of [12, 18]) db.run('INSERT INTO product_slots (id, product_id, starts_at) VALUES (?, ?, ?)', `${p.id}-s${d}-${h}`, p.id, at(d, h));
  }

  const buy = (user: string, product: string, daysAgo: number, opts: { expiresIn?: number } = {}) => {
    const p = db.get('SELECT * FROM products WHERE id = ?', product)!;
    const id = `${user}-${product}`;
    db.run('INSERT INTO product_purchases (id, user_id, product_id, price_paid, commission, sessions_total, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, user, product, p.price, Math.round(p.price * RULES.commission), p.sessions, p.period_days ? at(opts.expiresIn ?? 30 - daysAgo, 23) : null, at(-daysAgo, 11));
    return id;
  };
  const book = (purchase: string, product: string, user: string, days: number, hour: number) =>
    db.run('INSERT INTO product_slots (id, product_id, starts_at, booked_by, purchase_id, booked_at) VALUES (?, ?, ?, ?, ?, ?)', `${product}-b-${user}-${days}`, product, at(days, hour), user, purchase, at(Math.min(days, 0) - 1, 9));
  const review = (product: string, user: string, rating: number, text: string, daysAgo: number, reply: string | null = null) =>
    db.run('INSERT INTO product_reviews (id, product_id, user_id, rating, text, created_at, reply, replied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      `pr-${product}-${user}`, product, user, rating, text, at(-daysAgo, 15), reply, reply ? at(-daysAgo + 1, 10) : null);

  // Работа с экспертом
  const s1 = buy('student', 'e1', 6); book(s1, 'e1', 'student', 3, 15);
  const a1 = buy('aruzhan', 'e1', 40); book(a1, 'e1', 'aruzhan', -30, 18);
  review('e1', 'aruzhan', 5, 'За час разобрали мои цели и составили понятный план. Арман объясняет без давления.', 28, 'Аружан, рад, что план получился понятным!');
  const d2 = buy('daniyar', 'e2', 25); book(d2, 'e2', 'daniyar', -20, 19);
  review('e2', 'daniyar', 5, 'Алия задала вопросы, о которых я не думал. Стало ясно, где мой подход слабый.', 18);
  const m3 = buy('madina', 'e3', 30); book(m3, 'e3', 'madina', -21, 18); book(m3, 'e3', 'madina', -14, 18); book(m3, 'e3', 'madina', 5, 15);
  review('e3', 'madina', 5, 'Четыре занятия — и я читаю отчётность сама. Домашние задания очень помогли.', 10);
  const k5 = buy('kamila', 'e5', 50); book(k5, 'e5', 'kamila', -40, 12); book(k5, 'e5', 'kamila', -26, 12);
  review('e5', 'kamila', 4, 'Регулярные встречи дисциплинируют. Хотелось бы чуть больше материалов между встречами.', 20);
  buy('nurlan', 'e6', 12);

  // Сообщество
  buy('aruzhan', 'g1', 20); buy('erlan', 'g1', 10); buy('timur-o', 'g1', 45, { expiresIn: -15 });
  review('g1', 'aruzhan', 5, 'Разборы компаний в кругу единомышленников — лучшая часть недели.', 8);
  buy('sabina', 'g2', 15); review('g2', 'sabina', 4, 'Хорошие обсуждения, но иногда не успеваю прочитать главу.', 5);
  buy('daniyar', 'g3', 18); buy('madina', 'g3', 9);
  review('g3', 'daniyar', 5, 'Алия отвечает по делу и с источниками. Чат без шума.', 7);
  buy('student', 'g4', 4); buy('alibek', 'g4', 3);
  const msg = (product: string, user: string, text: string, hoursAgo: number) =>
    db.run('INSERT INTO product_messages (id, product_id, user_id, text, created_at) VALUES (?, ?, ?, ?, ?)', `m-${product}-${user}-${hoursAgo}`, product, user, text, new Date(now.getTime() - hoursAgo * 3600e3).toISOString());
  msg('g3', 'aliya', 'Добро пожаловать! Пишите вопросы о рынке, отвечаю каждый день до 21:00.', 200);
  msg('g3', 'daniyar', 'Как вы смотрите на компании, у которых выручка растёт, а свободный денежный поток падает?', 50);
  msg('g3', 'aliya', 'Первым делом смотрю на оборотный капитал и капитальные затраты. Если рост «съедает» деньги временно, это нормально. Если так годами — тревожный знак.', 48);
  msg('g3', 'madina', 'Спасибо, это как раз мой случай с одной компанией из портфеля.', 30);
  msg('g1', 'timur', 'На этой неделе разбираем Kaspi.kz: прочитайте раздел о платёжном сегменте до среды.', 70);
  msg('g1', 'aruzhan', 'Прочитала. Вопрос: как они считают выручку маркетплейса — валовым или чистым методом?', 20);
  msg('g4', 'arman', 'Здесь можно задавать любые вопросы о первых шагах. Глупых вопросов нет.', 300);
  msg('g4', 'student', 'С какой суммы имеет смысл начинать?', 26);
  msg('g4', 'arman', 'С той, которую вы готовы не трогать несколько лет после того, как отложили резерв на 3–6 месяцев расходов.', 25);

  // Идеи и аналитика
  buy('daniyar', 'i1', 14); review('i1', 'daniyar', 5, 'Понятный чек-лист, применил к двум компаниям из портфеля.', 9);
  buy('student', 'i2', 8); buy('aigerim', 'i2', 6); review('i2', 'aigerim', 4, 'Коротко и по делу. Пример с секторами особенно полезен.', 4);
  buy('erlan', 'i3', 11);
  buy('daniyar', 'i4', 16); buy('kamila', 'i4', 13); review('i4', 'kamila', 5, 'Наконец-то разобралась, почему прибыль и денежный поток — не одно и то же.', 10, 'Камила, спасибо! Рада, что пример помог.');

  // Соцсети демо-экспертов
  const socials: Record<string, object> = {
    arman: { telegram: 'https://t.me/arman_invest_demo', youtube: 'https://youtube.com/@arman_invest_demo' },
    aliya: { telegram: 'https://t.me/aliya_analysis_demo', linkedin: 'https://linkedin.com/in/aliya-demo', website: 'https://example.com/aliya' },
    timur: { telegram: 'https://t.me/timur_risk_demo', instagram: 'https://instagram.com/timur_risk_demo' }
  };
  for (const [id, s] of Object.entries(socials)) db.run('UPDATE expert_profiles SET socials = ? WHERE user_id = ?', JSON.stringify(s), id);
}
