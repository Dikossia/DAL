import { setFile } from './fs.ts';
// Загрузка файла: тело запроса — Blob, его размер проверяется тем же счётчиком, что и на сервере.
export async function pipeline(req: any, counter: any, ws: any) {
  const blob: Blob = req.__blob;
  if (!blob) throw new Error('empty');
  await new Promise<void>((res, rej) => counter._t({ length: blob.size }, null, (e: any) => e ? rej(e) : res()));
  setFile(ws.__path, blob);
}
export default { pipeline };
