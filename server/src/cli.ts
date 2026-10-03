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
  siteDir: path.resolve(SERVER_ROOT, process.env.SITE_DIR || '..'),
  chain: {
    enabled: process.env.DAL_CHAIN !== 'off',
    cluster: (process.env.DAL_SOLANA_CLUSTER === 'mainnet-beta' ? 'mainnet-beta' : 'devnet') as 'devnet' | 'mainnet-beta',
    rpcUrl: process.env.DAL_SOLANA_RPC || undefined,
    serviceSecret: process.env.DAL_SOLANA_SECRET || undefined,
    walletKey: process.env.DAL_WALLET_KEY || undefined,
    publicUrl: process.env.DAL_PUBLIC_URL || undefined,
    usdcMint: process.env.DAL_USDC_MINT || undefined
  },
  exposeRecoveryCodes: process.env.DAL_SHOW_RECOVERY_CODES !== 'off'
};

function reset() {
  for (const f of [config.dbPath, config.dbPath + '-wal', config.dbPath + '-shm']) fs.rmSync(f, { force: true });
  fs.rmSync(config.storageDir, { recursive: true, force: true });
  const db = openDb(config.dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  const { accounts } = seed(db, config.siteDir, path.join(SERVER_ROOT, 'seed-assets'));
  db.close();
  console.log('Database created and filled with demo data.');
  console.log(`\nDemo accounts (password for all: ${DEMO_PASSWORD}):`);
  const pick = accounts.filter(a => a.role !== 'student' || a.email === 'student@dal.local');
  for (const a of pick) console.log(`  ${a.role.padEnd(9)} ${a.email.padEnd(22)} ${a.name}`);
  console.log(`  …and ${accounts.length - pick.length} more students (aruzhan@dal.local, madina@dal.local and others).`);
}

function start() {
  if (!fs.existsSync(config.dbPath)) { console.log('First run: creating the database.\n'); reset(); console.log(''); }
  const { server, app } = createApp({ dbPath: config.dbPath, storageDir: config.storageDir, siteDir: config.siteDir, log: true, chain: config.chain, exposeRecoveryCodes: config.exposeRecoveryCodes });
  // Background worker: writes queued records to Solana. DAL keeps working if the network is unavailable.
  if (app.chain.enabled) setInterval(() => { app.chain.tick().catch(e => console.error('Solana worker:', e?.message || e)); }, 5000).unref();
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') console.error(`Port ${config.port} is in use. Stop the other running server or set PORT, e.g.: set PORT=4001`);
    else console.error(e);
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    const base = `http://localhost:${config.port}`;
    console.log(`Dal API running: ${base}`);
    console.log(`  API docs:          ${base}/docs`);
    console.log(`  Student site:      ${base}/`);
    console.log(`  Dal Studio:        ${base}/studio.html`);
    console.log(`  Solana:            ${app.chain.enabled ? `${app.chain.cluster}, issuer ${app.chain.issuer}` : 'off (records stay queued)'}`);
    console.log('Stop: Ctrl+C\n');
  });
  const stop = () => { console.log('\nStopping server…'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}

function createModerator(args: string[]) {
  const [email, password, ...nameParts] = args;
  if (!email || !password || password.length < 8) { console.error('Usage: npm run moderator -- <email> <password, 8+ chars> <Name>'); process.exit(1); }
  const db = openDb(config.dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  db.run('INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId(), email.toLowerCase(), hashPassword(password), nameParts.join(' ') || 'Модератор', 'moderator', nowIso());
  db.close();
  console.log(`Moderator ${email} created.`);
}

const [cmd = 'start', ...rest] = process.argv.slice(2);
try {
  if (cmd === 'start') start();
  else if (cmd === 'reset') reset();
  else if (cmd === 'moderator') createModerator(rest);
  else { console.error(`Unknown command: ${cmd}. Available: start, reset, moderator`); process.exit(1); }
} catch (e: any) {
  console.error('Error:', e?.message || e);
  process.exit(1);
}
