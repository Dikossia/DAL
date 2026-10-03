// node:sqlite on top of sql.js (SQLite compiled to WebAssembly).
export const state: { SQL: any; initial: Uint8Array | null; current: any } = { SQL: null, initial: null, current: null };
export class DatabaseSync {
  db: any; gen = 0;
  constructor() { this.db = new state.SQL.Database(state.initial || undefined); state.current = this; }
  exec(sql: string) { this.db.exec(sql); }
  // sql.js closes the database and frees prepared statements on export(): track a generation and re-prepare.
  export(): Uint8Array { const b = this.db.export(); this.gen++; this.db.exec('PRAGMA foreign_keys = ON;'); return b; }
  prepare(sql: string) {
    const self = this; let st: any = null, gen = -1;
    const get = () => { if (gen !== self.gen || !st) { st = self.db.prepare(sql); gen = self.gen; } return st; };
    const use = <T>(params: any[], fn: (s: any) => T): T => { const s = get(); try { s.bind(params); return fn(s); } finally { s.reset(); } };
    return {
      get: (...p: any[]) => use(p, s => s.step() ? s.getAsObject() : undefined),
      all: (...p: any[]) => use(p, s => { const rows = []; while (s.step()) rows.push(s.getAsObject()); return rows; }),
      run: (...p: any[]) => use(p, s => { s.step(); return { changes: self.db.getRowsModified(), lastInsertRowid: 0 }; })
    };
  }
  close() { this.db.close(); }
}
export default { DatabaseSync };
