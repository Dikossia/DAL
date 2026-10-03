import { setFile } from './fs.ts';
// File upload: the request body is a Blob; its size is checked by the same counter as on the server.
export async function pipeline(req: any, counter: any, ws: any) {
  const blob: Blob = req.__blob;
  if (!blob) throw new Error('empty');
  await new Promise<void>((res, rej) => counter._t({ length: blob.size }, null, (e: any) => e ? rej(e) : res()));
  setFile(ws.__path, blob);
}
export default { pipeline };
