import fs from 'node:fs';
import path from 'node:path';
import { createApp, SERVER_ROOT } from './app.ts';
import { openDb, migrate } from './db.ts';
import { seed, DEMO_PASSWORD } from './seed.ts';
import { hashPassword } from './auth.ts';
import { newId, nowIso } from './util.ts';

const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  dbPath: path.resolve(SERVER_ROOT, process.env.DB_PATH || 'data/dal.db'),
  storageDir: path.resolve(SERVER_ROOT, process.env.STORAGE_DIR || 'storage'),
  siteDir: path.resolve(SERVER_ROOT, process.env.SITE_DIR || '..')
};

function reset() {
  for (const f of [config.dbPath, config.dbPath + '-wal', config.dbPath + '-shm']) fs.rmSync(f, { force: true });
  fs.rmSync(config.storageDir, { recursive: true, force: true });
  const db = openDb(config.dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  const { accounts } = seed(db, config.siteDir, path.join(SERVER_ROOT, 'seed-assets'));
  db.close();
  console.log('База создана и заполнена демо-данными.');
  console.log(`\nДемо-аккаунты (пароль у всех: ${DEMO_PASSWORD}):`);
  const pick = accounts.filter(a => a.role !== 'student' || a.email === 'student@dal.local');
  for (const a of pick) console.log(`  ${a.role.padEnd(9)} ${a.email.padEnd(22)} ${a.name}`);
  console.log(`  …и ещё ${accounts.length - pick.length} учеников (aruzhan@dal.local, madina@dal.local и другие).`);
}

function start() {
  if (!fs.existsSync(config.dbPath)) { console.log('Первый запуск: создаю базу.\n'); reset(); console.log(''); }
  const { server } = createApp({ dbPath: config.dbPath, storageDir: config.storageDir, siteDir: config.siteDir, log: true });
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') console.error(`Порт ${config.port} занят. Закройте другой запущенный сервер или задайте PORT, например: set PORT=4001`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    const base = `http://localhost:${config.port}`;
    console.log(`Dal API работает: ${base}`);
    console.log(`  Документация API: ${base}/docs`);
    console.log(`  Сайт для учеников: ${base}/`);
    console.log(`  Dal Studio:        ${base}/studio.html`);
    console.log('Остановить: Ctrl+C\n');
  });
  const stop = () => { console.log('\nОстанавливаю сервер…'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

function createModerator(args: string[]) {
  const [email, password, ...nameParts] = args;
  if (!email || !password || password.length < 8) { console.error('Использование: npm run moderator -- <почта> <пароль от 8 символов> <Имя>'); process.exit(1); }
  const db = openDb(config.dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  db.run('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), email.toLowerCase(), hashPassword(password), nameParts.join(' ') || 'Модератор', 'moderator', nowIso());
  db.close();
  console.log(`Модератор ${email} создан.`);
}

const [cmd = 'start', ...rest] = process.argv.slice(2);
try {
  if (cmd === 'start') start();
  else if (cmd === 'reset') reset();
  else if (cmd === 'moderator') createModerator(rest);
  else { console.error(`Неизвестная команда: ${cmd}. Доступно: start, reset, moderator`); process.exit(1); }
} catch (e: any) {
  console.error('Ошибка:', e?.message || e);
  process.exit(1);
}
