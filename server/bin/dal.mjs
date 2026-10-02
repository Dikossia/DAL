#!/usr/bin/env node
// Проверяет версию Node.js до загрузки TypeScript-кода: старый Node упал бы с непонятной ошибкой.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`Нужен Node.js 22.18 или новее (рекомендуется 24 LTS). Сейчас установлен ${process.version}.`);
  console.error('Скачайте установщик LTS с https://nodejs.org и запустите команду снова.');
  process.exit(1);
}
// Настройки из server/.env, если файл есть (PORT, DB_PATH, STORAGE_DIR, SITE_DIR, HOST).
const envFile = new URL('../.env', import.meta.url);
try { process.loadEnvFile(envFile); } catch { /* файла нет — работаем с настройками по умолчанию */ }
await import('../src/cli.ts');
