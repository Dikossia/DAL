// Фиксация прогнозов в Solana (devnet) без сервера и без библиотек:
// транзакция с программой Memo собирается здесь, подписывает и отправляет её кошелёк Phantom,
// а проверить запись может любой — чтением транзакции из публичного узла Solana.
window.DalSolana = (() => {
  'use strict';
  const CLUSTER = 'devnet';
  const RPC = 'https://api.devnet.solana.com';
  const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function b58encode(bytes) {
    let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
    let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b) break; s = '1' + s; }
    return s;
  }
  function b58decode(str) {
    let n = 0n; for (const c of str) { const i = A.indexOf(c); if (i < 0) throw new Error('base58'); n = n * 58n + BigInt(i); }
    const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
    for (const c of str) { if (c !== '1') break; out.unshift(0); }
    return new Uint8Array(out);
  }
  const compact = n => { const o = []; for (;;) { let b = n & 0x7f; n >>= 7; if (n) { o.push(b | 0x80); } else { o.push(b); return o; } } };

  // Транзакция (legacy): 1 подпись (кошелёк платит комиссию), инструкция Memo с текстом.
  function memoTransaction(payer, blockhash, memoText) {
    const data = new TextEncoder().encode(memoText);
    const msg = [1, 0, 1, ...compact(2), ...b58decode(payer), ...b58decode(MEMO_PROGRAM), ...b58decode(blockhash),
      ...compact(1), 1, ...compact(0), ...compact(data.length), ...data];
    return new Uint8Array([...compact(1), ...new Array(64).fill(0), ...msg]);
  }

  async function rpc(method, params = []) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'Ошибка узла Solana');
    return j.result;
  }

  const provider = () => window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null);

  async function connect() {
    const p = provider();
    if (!p) { const e = new Error('Нужен кошелёк Phantom: установите расширение phantom.app и включите сеть Devnet в настройках (Developer Settings → Testnet mode).'); e.code = 'no_wallet'; throw e; }
    const r = await p.connect();
    return (r?.publicKey || p.publicKey).toString();
  }

  async function balance(address) { return (await rpc('getBalance', [address, { commitment: 'confirmed' }])).value / 1e9; }
  async function airdrop(address) { return rpc('requestAirdrop', [address, 1e9]); }

  // Записать текст в блокчейн. Возвращает подпись транзакции.
  async function anchor(memoText) {
    const wallet = await connect();
    const { value } = await rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const tx = memoTransaction(wallet, value.blockhash, memoText);
    const r = await provider().request({ method: 'signAndSendTransaction', params: { message: b58encode(tx) } });
    const signature = r.signature || r;
    return { signature, wallet };
  }

  // Проверка: читаем транзакцию из Solana и сравниваем memo с условиями прогноза на сайте.
  async function verify(signature, expectedMemo) {
    const tx = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!tx) return { found: false };
    const memos = [];
    for (const ins of tx.transaction.message.instructions) if (ins.programId === MEMO_PROGRAM || ins.program === 'spl-memo') memos.push(typeof ins.parsed === 'string' ? ins.parsed : '');
    return { found: true, ok: memos.includes(expectedMemo), memo: memos[0] || '', slot: tx.slot, blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null, signer: tx.transaction.message.accountKeys[0]?.pubkey || '' };
  }

  const explorer = sig => `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
  return { CLUSTER, anchor, verify, connect, balance, airdrop, explorer, hasWallet: () => !!provider(), _memoTransaction: memoTransaction, _b58encode: b58encode, _b58decode: b58decode };
})();
