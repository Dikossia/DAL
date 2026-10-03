import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp, SERVER_ROOT, type AppOptions } from '../src/app.ts';
import { openDb, migrate } from '../src/db.ts';
import { seed, DEMO_PASSWORD } from '../src/seed.ts';

export const VIDEO = fs.readFileSync(path.join(SERVER_ROOT, 'seed-assets', 'demo-lesson.mp4'));

interface Req { token?: string; body?: unknown; headers?: Record<string, string>; raw?: Buffer }

// Starts the server on a free port with a separate database and demo data.
export async function startApp(extra: Partial<AppOptions> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dal-test-'));
  const dbPath = path.join(dir, 'test.db'), storageDir = path.join(dir, 'storage');
  const db = openDb(dbPath);
  migrate(db, path.join(SERVER_ROOT, 'migrations'));
  seed(db, path.resolve(SERVER_ROOT, '..'), path.join(SERVER_ROOT, 'seed-assets'));
  db.close();
  const { app, server, close } = createApp({ dbPath, storageDir, ...extra });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api = async (method: string, p: string, o: Req = {}) => {
    const headers: Record<string, string> = { ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...o.headers };
    const res = await fetch(base + p, { method, headers, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, body, headers: res.headers };
  };
  const login = async (email: string) => {
    const r = await api('POST', '/auth/login', { body: { email, password: DEMO_PASSWORD } });
    if (r.status !== 200) throw new Error(`login ${email}: ${JSON.stringify(r.body)}`);
    return r.body.token as string;
  };
  const uploadVideo = (token: string, lessonId: string, data: Buffer = VIDEO, type = 'video/mp4') =>
    api('PUT', `/studio/lessons/${lessonId}/video`, { token, raw: data, headers: { 'Content-Type': type, 'X-File-Name': encodeURIComponent('урок.mp4'), 'X-Duration': '10' } });

  return { app, base, api, login, uploadVideo, storageDir, close: async () => { await close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
export type TestApp = Awaited<ReturnType<typeof startApp>>;
