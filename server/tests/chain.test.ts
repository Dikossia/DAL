import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startApp, type TestApp } from './helpers.ts';
import { b58decode, b58encode, shortvec } from '../src/chain/codec.ts';
import { publicKeyFromSeed, sign, isOnCurve } from '../src/chain/ed25519.ts';
import { keypairFromSeed, findProgramAddress } from '../src/chain/tx.ts';
import { PROGRAMS, associatedTokenAddress } from '../src/chain/programs.ts';
import { keypairFromSecret } from '../src/chain/wallets.ts';
import type { Rpc } from '../src/chain/rpc.ts';

// ---------- A fake Solana node: checks every signature and keeps the transactions it accepted ----------
function readShortvec(b: Uint8Array, o: number) { let n = 0, s = 0, i = o; for (;;) { const x = b[i++]; n |= (x & 0x7f) << s; if (!(x & 0x80)) break; s += 7; } return [n, i] as const; }
function parseTx(wire: Uint8Array) {
  let [n, o] = readShortvec(wire, 0);
  const sigs = []; for (let i = 0; i < n; i++) { sigs.push(wire.slice(o, o + 64)); o += 64; }
  const message = wire.slice(o), header = [...message.slice(0, 3)];
  let p = 3, k: number; [k, p] = readShortvec(message, p);
  const keys: string[] = []; for (let i = 0; i < k; i++) { keys.push(b58encode(message.slice(p, p + 32))); p += 32; }
  p += 32; // blockhash
  let ni: number; [ni, p] = readShortvec(message, p);
  const ixs = [];
  for (let i = 0; i < ni; i++) {
    const prog = message[p++]; let na: number; [na, p] = readShortvec(message, p);
    const accs = [...message.slice(p, p + na)].map(x => keys[x]); p += na;
    let dl: number; [dl, p] = readShortvec(message, p);
    ixs.push({ programId: keys[prog], accounts: accs, data: message.slice(p, p + dl) }); p += dl;
  }
  return { sigs, message, header, keys, ixs };
}
const verifySig = (msg: Uint8Array, sig: Uint8Array, pub: string) =>
  crypto.verify(null, msg, crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(b58decode(pub))]), format: 'der', type: 'spki' }), sig);

function fakeRpc() {
  const txs = new Map<string, any>(); let down = false; const extra = new Map<string, any>();
  const rpc: Rpc & { txs: typeof txs; setDown(v: boolean): void; extra: typeof extra } = {
    url: 'fake', txs, extra, setDown: v => { down = v; },
    async call(method: string, params: any[] = []): Promise<any> {
      if (down) throw new Error('fetch failed');
      if (method === 'getLatestBlockhash') return { value: { blockhash: b58encode(new Uint8Array(32).fill(7)), lastValidBlockHeight: 100 } };
      if (method === 'sendTransaction') {
        const t = parseTx(Uint8Array.from(Buffer.from(params[0], 'base64')));
        const signers = t.keys.slice(0, t.header[0]);
        t.sigs.forEach((s, i) => assert.ok(verifySig(t.message, s, signers[i]), `signature ${i} valid`));
        const sig = b58encode(t.sigs[0]); txs.set(sig, t); return sig;
      }
      if (method === 'getSignatureStatuses') return { value: params[0].map((s: string) => txs.has(s) ? { err: null, confirmationStatus: 'confirmed' } : null) };
      if (method === 'getTransaction') {
        if (extra.has(params[0])) return extra.get(params[0]);
        const t = txs.get(params[0]); if (!t) return null;
        return {
          slot: 1, blockTime: 1, meta: { err: null, preBalances: t.keys.map((_: string, i: number) => i === 0 ? 2_000_000_000 : 0), postBalances: t.keys.map((_: string, i: number) => i === 0 ? 2_000_000_000 - 5000 * t.sigs.length - (t.ixs.some((x: any) => x.programId === PROGRAMS.core) ? 3_800_000 : 0) : 0), preTokenBalances: [], postTokenBalances: [] },
          transaction: { message: { accountKeys: t.keys.map((pubkey: string) => ({ pubkey })), instructions: t.ixs.map((x: any) => x.programId === PROGRAMS.memo ? { program: 'spl-memo', programId: x.programId, parsed: new TextDecoder().decode(x.data) } : { programId: x.programId }) } }
        };
      }
      if (method === 'getBalance') return { value: 2e9 };
      if (method === 'requestAirdrop') return 'airdrop';
      throw new Error(`unexpected ${method}`);
    }
  };
  return rpc;
}

let t: TestApp, rpc: ReturnType<typeof fakeRpc>, student: string, aliya: string, moderator: string;
before(async () => {
  rpc = fakeRpc();
  t = await startApp({ chain: { enabled: true, rpc, autoAirdrop: false } });
  [student, aliya, moderator] = await Promise.all(['student', 'aliya', 'moderator'].map(n => t.login(`${n}@dal.local`)));
});
after(async () => { await t.close(); });
const tick = async (n = 1) => { for (let i = 0; i < n; i++) await t.app.chain.tick(); };
const dueNow = () => t.app.db.run(`UPDATE chain_jobs SET next_try_at = ? WHERE status = 'pending'`, new Date(0).toISOString());

test('crypto primitives match Node.js and the Solana formats', () => {
  for (let i = 0; i < 3; i++) {
    const seed = crypto.randomBytes(32), msg = crypto.randomBytes(80);
    const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
    assert.deepEqual(Buffer.from(sign(msg, seed)), crypto.sign(null, msg, priv));
    assert.ok(isOnCurve(publicKeyFromSeed(seed)));
  }
  const bytes = crypto.randomBytes(32); bytes[0] = 0;
  assert.deepEqual(Buffer.from(b58decode(b58encode(bytes))), bytes);
  assert.deepEqual([...shortvec(0)], [0]); assert.deepEqual([...shortvec(127)], [0x7f]); assert.deepEqual([...shortvec(128)], [0x80, 1]); assert.deepEqual([...shortvec(16384)], [0x80, 0x80, 1]);
  const pda = findProgramAddress([new Uint8Array([1, 2, 3])], PROGRAMS.ata);
  assert.equal(isOnCurve(b58decode(pda)), false, 'a PDA is off the curve');
  assert.equal(associatedTokenAddress(keypairFromSeed(new Uint8Array(32).fill(1)).publicKey, PROGRAMS.token).length >= 32, true);
});

test('forecast: published instantly, recorded on Solana in the background, co-signed by the expert wallet; result recorded after it', async () => {
  rpc.setDown(true);
  const deadline = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const r = await t.api('POST', '/studio/forecasts', { token: aliya, body: { ticker: 'NVDA', name: 'NVIDIA', direction: 'up', startPrice: 100, targetPrice: 120, deadline, rationale: 'x'.repeat(130), acknowledged: true } });
  assert.equal(r.status, 201, 'publishing does not wait for Solana');
  assert.equal(r.body.chain.status, 'queued');
  assert.match(r.body.memo, /^DAL forecast v2 \| .* rule=close\(NVDA, .*\) >= 120 USD .* expert=\w+/);
  assert.equal(r.body.networkFee, 5);
  await tick();
  const job = t.app.chain.job('forecast', r.body.id)!;
  assert.equal(job.status, 'pending'); assert.match(job.last_error!, /fetch failed/);
  rpc.setDown(false); dueNow();
  await tick(); await tick();
  const f = (await t.api('GET', '/studio/forecasts', { token: aliya })).body.forecasts.find((x: any) => x.id === r.body.id);
  assert.equal(f.chain.status, 'recorded');
  assert.equal(f.anchor.signature, f.chain.signature);
  const sent = rpc.txs.get(f.chain.signature);
  const expertWallet = (await t.api('GET', '/me/wallet', { token: aliya })).body.wallet.address;
  assert.deepEqual(sent.keys.slice(0, 2), [t.app.chain.issuer, expertWallet], 'DAL pays the fee, the expert co-signs');
  assert.equal(new TextDecoder().decode(sent.ixs[0].data), f.memo);
  // The outcome follows the rule fixed at publication and is recorded after the terms, referencing them.
  const past = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  t.app.db.run(`INSERT INTO forecasts (id, expert_id, ticker, name, direction, start_price, target_price, deadline, rationale, published_at, rule) VALUES ('fx', 'aliya', 'AMD', 'AMD', 'down', 150, 140, ?, 'r', ?, 'close(AMD, ' || ? || ') <= 140 USD')`, past, new Date(Date.now() - 20 * 864e5).toISOString(), past);
  t.app.chain.enqueue('forecast', 'fx', 'DAL forecast v2 | id=fx');
  const res = await t.api('POST', '/moderation/forecasts/fx/resolve', { token: moderator, body: { closePrice: 138 } });
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.result.status, 'queued');
  await tick(); // terms are recorded first; the result waits for them
  assert.equal(t.app.chain.job('forecast_result', 'fx')!.status, 'pending');
  await tick(); dueNow(); await tick(); await tick();
  const fx = (await t.api('GET', '/forecasts')).body.find((x: any) => x.id === 'fx');
  assert.equal(fx.result.status, 'recorded');
  assert.match(fx.result.memo, new RegExp(`^DAL forecast result v1 \\| id=fx \\| close=138 \\| outcome=MET \\| rule=close\\(AMD, ${past}\\) <= 140 USD .* forecast_tx=${fx.chain.signature}$`));
  assert.throws(() => t.app.db.run(`UPDATE chain_jobs SET memo = 'x' WHERE kind = 'forecast' AND ref_id = ?`, r.body.id), /anchor_immutable/);
});

test('certificate: issued on completion, NFT minted to the student wallet, public check without sign-in', async () => {
  const list = await t.api('GET', '/me/certificates', { token: student });
  const c = list.body.find((x: any) => x.courseId === 'c8');
  assert.ok(c, 'demo student has completed c8');
  assert.match(c.id, /^DAL-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(c.chain.status, 'queued');
  await tick(); await tick();
  const pub = await t.api('GET', `/certificates/${c.id}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.chain.status, 'recorded');
  assert.ok(pub.body.nft.address);
  assert.match(pub.body.verifyUrl, new RegExp(`verify\\.html\\?c=${c.id}&nft=${pub.body.nft.address}&tx=`));
  const sent = rpc.txs.get(pub.body.chain.signature);
  const core = sent.ixs.find((x: any) => x.programId === PROGRAMS.core);
  assert.deepEqual(core.accounts, [pub.body.nft.address, PROGRAMS.core, PROGRAMS.core, t.app.chain.issuer, c.owner, t.app.chain.issuer, PROGRAMS.system, PROGRAMS.core]);
  assert.equal(core.data[0], 0); assert.equal(core.data[1], 0);
  const memo = new TextDecoder().decode(sent.ixs.find((x: any) => x.programId === PROGRAMS.memo).data);
  assert.match(memo, new RegExp(`^DAL certificate v1 \\| id=${c.id} \\| course=c8 .* student=Дарын А\\. \\| holder_sha256=[0-9a-f]{64} .* nft=${pub.body.nft.address}$`));
  assert.ok(!memo.includes('Асылбек'), 'the full name is not put on the public ledger');
  assert.throws(() => t.app.db.run('DELETE FROM certificates WHERE id = ?', c.id), /certificate_immutable/);
  const report = await t.api('GET', '/moderation/chain', { token: moderator });
  const k = report.body.byKind.find((x: any) => x.kind === 'certificate');
  assert.equal(k.lamports, 3_810_000, 'actual cost is tracked: fee for 2 signatures + storage deposit');
});

test('orders: the buyer sees price, commission and the 5 ₸ network fee; it is charged once per blockchain order', async () => {
  const q = await t.api('POST', '/checkout/quote', { token: student, body: { kind: 'course', id: 'c3' } });
  assert.deepEqual([q.body.methods.card.price, q.body.methods.card.commission, q.body.methods.card.networkFee, q.body.methods.card.total], [19900, 3980, 5, 19905]);
  const qp = await t.api('POST', '/checkout/quote', { token: student, body: { kind: 'product', id: 'e2' } });
  assert.equal(qp.body.methods.card.networkFee, 0, 'a card order without blockchain has no network fee');
  assert.equal(qp.body.methods.usdc.networkFee, 5);
  const o = await t.api('POST', '/orders', { token: student, body: { kind: 'course', id: 'c3', method: 'card' } });
  assert.equal(o.body.order.status, 'paid'); assert.equal(o.body.order.total, 19905);
  const ref = await t.api('POST', '/courses/c3/refund', { token: student });
  assert.equal(ref.body.refunded, 19905, 'the network fee is refunded with the course');
});

test('USDC payment: one transaction splits the amount; DAL pays the network fee; access opens after the check', async () => {
  const payerSeed = crypto.randomBytes(32), payer = keypairFromSeed(payerSeed);
  const r = await t.api('POST', '/orders', { token: student, body: { kind: 'course', id: 'c5', method: 'usdc', payer: payer.publicKey } });
  assert.equal(r.status, 200);
  const wire = b58decode(r.body.transaction), tx = parseTx(wire);
  assert.equal(tx.keys[0], t.app.chain.issuer, 'DAL is the fee payer');
  assert.equal(tx.keys[r.body.payerIndex], payer.publicKey);
  assert.ok(verifySig(tx.message, tx.sigs[0], t.app.chain.issuer), 'DAL already signed');
  const transfers = tx.ixs.filter((x: any) => x.programId === PROGRAMS.token);
  const amount = (x: any) => Number(new DataView(x.data.buffer, x.data.byteOffset).getBigUint64(1, true));
  assert.equal(amount(transfers[0]) + amount(transfers[1]), Math.round(34905 / 448 * 1e6), 'price + network fee');
  // The buyer's wallet signs and sends; the fake node records the resulting token balances.
  const sig = b58encode(sign(tx.message, payerSeed));
  const order = r.body.order, mint = t.app.chain.usdcMint;
  const bal = (owner: string, amt: number) => ({ mint, owner, uiTokenAmount: { amount: String(amt) } });
  rpc.extra.set(sig, { slot: 2, meta: { err: null, preBalances: [0], postBalances: [0], preTokenBalances: [], postTokenBalances: [bal(t.app.db.get('SELECT expert_wallet FROM orders WHERE id = ?', order.id)!.expert_wallet, Math.round(order.usdc.toExpert * 1e6)), bal(t.app.chain.issuer, Math.round(order.usdc.toDal * 1e6))] }, transaction: { message: { accountKeys: [{ pubkey: t.app.chain.issuer }], instructions: [{ program: 'spl-memo', parsed: `DAL order v1 | id=${order.id} | x` }] } } });
  const s = await t.api('POST', `/orders/${order.id}/submit`, { token: student, body: { signature: sig } });
  assert.equal(s.body.status, 'pending');
  await tick();
  const done = await t.api('GET', `/orders/${order.id}`, { token: student });
  assert.equal(done.body.status, 'paid');
  assert.equal((await t.api('GET', '/learning/courses/c5', { token: student })).status, 200, 'access opened');
});

test('recovery: new password by one-time code; the wallet stays with the account; key export needs the password', async () => {
  const before = (await t.api('GET', '/me/wallet', { token: student })).body.wallet.address;
  assert.equal((await t.api('POST', '/me/wallet/export', { token: student, body: { password: 'wrong-password' } })).status, 401);
  const ex = await t.api('POST', '/me/wallet/export', { token: student, body: { password: 'dal-demo-2026' } });
  assert.equal(keypairFromSecret(ex.body.secretKey).publicKey, before);
  const rec = await t.api('POST', '/auth/recover', { body: { email: 'student@dal.local' } });
  assert.match(rec.body.demoCode, /^\d{6}$/);
  assert.equal((await t.api('POST', '/auth/recover', { body: { email: 'nobody@dal.local' } })).body.sent, true, 'same answer for unknown emails');
  assert.equal((await t.api('POST', '/auth/recover/confirm', { body: { email: 'student@dal.local', code: '000000', password: 'new-password-1' } })).status, 400);
  const ok = await t.api('POST', '/auth/recover/confirm', { body: { email: 'student@dal.local', code: rec.body.demoCode, password: 'new-password-1' } });
  assert.equal(ok.status, 200);
  assert.equal((await t.api('GET', '/me', { token: student })).status, 401, 'old sessions are signed out');
  assert.equal((await t.api('GET', '/me/wallet', { token: ok.body.token })).body.wallet.address, before, 'same wallet');
  assert.equal((await t.api('POST', '/auth/recover/confirm', { body: { email: 'student@dal.local', code: rec.body.demoCode, password: 'again-password' } })).status, 400, 'a code works once');
});
