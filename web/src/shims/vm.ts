export function runInNewContext(src: string, ctx: any) { new Function('window', src)(ctx.window); }
export default { runInNewContext };
