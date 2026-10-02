import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type http from 'node:http';
import { openDb, migrate, type DB } from './db.ts';
import { createRouter, createHttpServer, HttpError, type Router } from './http.ts';
import { tokenFrom, userFromToken, createLoginLimiter } from './auth.ts';
import { registerAuth } from './routes/auth.ts';
import { registerCatalog } from './routes/catalog.ts';
import { registerLearning } from './routes/learning.ts';
import { registerStudioCourses } from './routes/studio-courses.ts';
import { registerStudioForecasts } from './routes/studio-forecasts.ts';
import { registerStudioOther } from './routes/studio-other.ts';
import { registerModeration } from './routes/moderation.ts';
import { registerDocs } from './routes/docs.ts';
import { registerProducts } from './routes/products.ts';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface AppOptions {
  dbPath: string;
  storageDir: string;
  siteDir?: string;   // папка с Dal.html и Studio.html; по умолчанию — на уровень выше server/
  log?: boolean;
}

export interface App {
  db: DB;
  router: Router;
  storageDir: string;
  siteDir: string;
  seedDir: string;
  loginLimiter: ReturnType<typeof createLoginLimiter>;
}

// Понятные сообщения для ограничений, которые охраняет сама база данных.
const DB_ERRORS: [RegExp, number, string, string][] = [
  [/forecast_immutable/, 409, 'forecast_immutable', 'Опубликованный прогноз нельзя изменить или удалить.'],
  [/forecast_already_resolved/, 409, 'forecast_resolved', 'Итог прогноза уже определён.'],
  [/course_has_students/, 409, 'course_has_students', 'Курс купили ученики, его можно только скрыть из каталога.'],
  [/review_immutable/, 409, 'review_immutable', 'Отзывы не удаляются. Пожалуйтесь на отзыв, решение примет модерация.'],
  [/slot_booked/, 409, 'slot_booked', 'На это время записан ученик. Сначала отмените запись.'],
  [/UNIQUE constraint failed: forecasts\.expert_id, forecasts\.ticker/, 409, 'forecast_ticker_open', 'По этому тикеру уже есть открытый прогноз.'],
  [/UNIQUE constraint failed: users\.email/, 409, 'email_taken', 'Этот адрес почты уже зарегистрирован.'],
  [/UNIQUE constraint failed: reviews/, 409, 'review_exists', 'Вы уже оставили отзыв на этот курс.'],
  [/FOREIGN KEY constraint failed/, 409, 'conflict', 'Действие нарушает связи данных.'],
  [/CHECK constraint failed/, 422, 'validation', 'Данные не прошли проверку.']
];
export function mapError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  for (const [re, status, code, text] of DB_ERRORS) if (re.test(msg)) return new HttpError(status, code, text);
  return new HttpError(500, 'internal', 'Внутренняя ошибка сервера');
}

export function createApp(o: AppOptions): { app: App; server: http.Server; close: () => Promise<void> } {
  const db = openDb(o.dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  for (const d of ['videos', 'covers', 'avatars']) fs.mkdirSync(path.join(o.storageDir, d), { recursive: true });
  const app: App = {
    db, router: createRouter(), storageDir: o.storageDir,
    siteDir: o.siteDir ?? path.resolve(SERVER_ROOT, '..'),
    seedDir: path.join(SERVER_ROOT, 'seed-assets'),
    loginLimiter: createLoginLimiter()
  };
  registerDocs(app);
  registerAuth(app);
  registerCatalog(app);
  registerLearning(app);
  registerStudioCourses(app);
  registerStudioForecasts(app);
  registerStudioOther(app);
  registerModeration(app);
  registerProducts(app);
  const server = createHttpServer({
    router: app.router,
    authenticate: (req, url) => userFromToken(db, tokenFrom(req, url)),
    mapError,
    siteDir: app.siteDir,
    blockedDirs: [SERVER_ROOT, path.resolve(o.storageDir)],
    log: o.log
  });
  return { app, server, close: () => new Promise(res => server.close(() => { db.close(); res(); })) };
}
