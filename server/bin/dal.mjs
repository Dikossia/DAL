#!/usr/bin/env node
// Checks the Node.js version before loading TypeScript code: an old Node would crash with a cryptic error.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`Node.js 22.18 or newer is required (24 LTS recommended). Currently installed: ${process.version}.`);
  console.error('Download the LTS installer from https://nodejs.org and run the command again.');
  process.exit(1);
}
// Settings from server/.env, if present (PORT, DB_PATH, STORAGE_DIR, SITE_DIR, HOST).
const envFile = new URL('../.env', import.meta.url);
try { process.loadEnvFile(envFile); } catch { /* no file: use default settings */ }
await import('../src/cli.ts');
