import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

type Param = string | number | null | boolean | undefined;
const norm = (p: Param[]): (string | number | null)[] => p.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export type Row = Record<string, any>;

export interface DB {
  all<T = Row>(sql: string, ...params: Param[]): T[];
  get<T = Row>(sql: string, ...params: Param[]): T | undefined;
  run(sql: string, ...params: Param[]): { changes: number | bigint };
  exec(sql: string): void;
  tx<T>(fn: () => T): T;
  close(): void;
}

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const cache = new Map<string, StatementSync>();
  const stmt = (sql: string): StatementSync => {
    let s = cache.get(sql);
    if (!s) { s = db.prepare(sql); cache.set(sql, s); }
    return s;
  };
  let depth = 0;
  return {
    all: (sql, ...p) => stmt(sql).all(...norm(p)) as any[],
    get: (sql, ...p) => stmt(sql).get(...norm(p)) as any,
    run: (sql, ...p) => stmt(sql).run(...norm(p)),
    exec: sql => db.exec(sql),
    // Transactions are synchronous: node:sqlite is synchronous, so there must be no await inside tx.
    tx(fn) {
      if (depth > 0) return fn();
      depth++;
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { depth--; }
    },
    close: () => db.close()
  };
}

export function migrate(db: DB, dir: string): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.all<{ name: string }>('SELECT name FROM schema_migrations').map(r => r.name));
  const applied: string[] = [];
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    db.tx(() => { db.exec(sql); db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', name, new Date().toISOString()); });
    applied.push(name);
  }
  return applied;
}
