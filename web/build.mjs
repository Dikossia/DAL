// Builds the browser version of the server: node web/build.mjs (requires esbuild).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const esbuild = await import(process.env.ESBUILD || 'esbuild').then(m => m.default || m);
const shim = n => path.join(here, 'src/shims', n);
const map = { 'node:fs': 'fs.ts', 'node:path': 'path.ts', 'node:url': 'url.ts', 'node:vm': 'vm.ts', 'node:http': 'http.ts', 'node:stream': 'stream.ts', 'node:stream/promises': 'stream-promises.ts', 'node:crypto': 'crypto.ts', 'node:sqlite': 'sqlite.ts' };
await esbuild.build({
  entryPoints: [path.join(here, 'src/entry.ts')],
  bundle: true, format: 'iife', globalName: 'DalEngine', platform: 'browser', target: 'es2020',
  outfile: path.join(here, 'engine.js'), loader: { '.sql': 'text' }, charset: 'utf8', legalComments: 'none',
  define: { 'import.meta.url': '"file:///server/src/app.ts"', 'process.platform': '"browser"' },
  inject: [shim('buffer.ts')],
  banner: { js: '// Built from server/src by node web/build.mjs. Do not edit by hand.' },
  plugins: [{ name: 'node-shims', setup(b) { b.onResolve({ filter: /^node:/ }, a => map[a.path] ? { path: shim(map[a.path]) } : { errors: [{ text: 'No shim for ' + a.path }] }); } }]
});
console.log('web/engine.js built');
