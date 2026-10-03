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

// Кнопка кошелька в шапке: подключение Phantom, адрес, баланс в Devnet, тестовые SOL, ссылка на Explorer.
(() => {
  'use strict';
  const S = window.DalSolana;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = a => a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
  let address = '', btn, pop;
  const provider = () => window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null);

  function paint() {
    btn.innerHTML = address ? `<span class="wallet-dot"></span>${short(address)}` : 'Подключить кошелёк';
    btn.title = address ? 'Кошелёк Phantom подключён (Solana Devnet)' : 'Подключить кошелёк Phantom (Solana Devnet)';
  }
  async function renderPop() {
    if (!address) {
      pop.innerHTML = provider()
        ? `<strong>Кошелёк Solana</strong><p>Подключите Phantom, чтобы эксперты могли фиксировать прогнозы в блокчейне Solana (сеть Devnet).</p><button type="button" class="wallet-main" data-w="connect">Подключить Phantom</button>`
        : `<strong>Кошелёк Solana</strong><p>Установите расширение Phantom и включите сеть Devnet: Настройки → Developer Settings → Testnet mode.</p><a class="wallet-main" href="https://phantom.app/download" target="_blank" rel="noopener">Установить Phantom</a>`;
      return;
    }
    pop.innerHTML = `<strong>Кошелёк подключён</strong><p class="wallet-addr">${esc(address)}</p><div class="wallet-row"><span>Сеть</span><b>Solana Devnet</b></div><div class="wallet-row"><span>Баланс</span><b id="walletBal">…</b></div><button type="button" class="wallet-main" data-w="airdrop">Получить 1 тестовый SOL</button><a class="wallet-link" href="https://explorer.solana.com/address/${esc(address)}?cluster=devnet" target="_blank" rel="noopener">Открыть в Solana Explorer</a><button type="button" class="wallet-link" data-w="disconnect">Отключить</button>`;
    try { const b = await S.balance(address); const el = pop.querySelector('#walletBal'); if (el) el.textContent = `${b.toFixed(3)} SOL`; }
    catch (_) { const el = pop.querySelector('#walletBal'); if (el) el.textContent = '—'; }
  }
  function toggle(open = pop.hidden) { pop.hidden = !open; if (open) renderPop(); }

  document.addEventListener('DOMContentLoaded', () => {
    const host = document.querySelector('.header-actions'); if (!host) return;
    const wrap = document.createElement('div'); wrap.className = 'wallet-wrap';
    btn = document.createElement('button'); btn.type = 'button'; btn.className = 'wallet-btn';
    pop = document.createElement('div'); pop.className = 'wallet-pop'; pop.hidden = true;
    wrap.append(btn, pop); host.prepend(wrap);
    paint();
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    pop.addEventListener('click', async e => {
      e.stopPropagation();
      const a = e.target.closest('[data-w]')?.dataset.w; if (!a) return;
      try {
        if (a === 'connect') { address = await S.connect(); paint(); renderPop(); }
        if (a === 'disconnect') { await provider()?.disconnect?.(); address = ''; paint(); renderPop(); }
        if (a === 'airdrop') { e.target.disabled = true; e.target.textContent = 'Запрос отправлен…'; await S.airdrop(address); setTimeout(renderPop, 4000); }
      } catch (err) { pop.insertAdjacentHTML('beforeend', `<p class="wallet-err">${esc(err.message || 'Ошибка')}</p>`); }
    });
    document.addEventListener('click', () => { if (!pop.hidden) pop.hidden = true; });
    // Если сайт уже разрешён в Phantom, подключаемся без окна.
    setTimeout(() => provider()?.connect?.({ onlyIfTrusted: true }).then(r => { address = (r?.publicKey || provider().publicKey)?.toString() || ''; paint(); }).catch(() => {}), 600);
    const st = document.createElement('style');
    st.textContent = '.wallet-wrap{position:relative}.wallet-btn{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:16px;border:1px solid #c9b8ff;background:linear-gradient(135deg,#9945ff1a,#14f1951a);color:var(--text,#222);font:700 11px Manrope,Arial,sans-serif;cursor:pointer;white-space:nowrap}.wallet-btn:hover{border-color:#9945ff}.wallet-dot{width:7px;height:7px;border-radius:50%;background:#14c784}.wallet-pop{position:absolute;right:0;top:40px;width:290px;background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 16px 50px #1b332b26;padding:16px;z-index:60;font:12px/1.6 Manrope,Arial,sans-serif;color:var(--text,#222)}.wallet-pop strong{font-size:13px}.wallet-pop p{margin:6px 0 12px;color:var(--muted,#777)}.wallet-addr{word-break:break-all;font:11px/1.5 ui-monospace,Consolas,monospace;color:var(--text,#222)!important;background:var(--subtle,#f3f3f3);padding:8px;border-radius:6px}.wallet-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line,#eee)}.wallet-main{display:block;width:100%;margin-top:12px;padding:10px;border:0;border-radius:6px;background:#6c47d9;color:#fff;font:700 12px Manrope,Arial,sans-serif;text-align:center;cursor:pointer;text-decoration:none}.wallet-link{display:block;width:100%;margin-top:8px;background:none;border:0;padding:4px;color:#6c47d9;font:700 11px Manrope,Arial,sans-serif;text-align:center;cursor:pointer;text-decoration:none}.wallet-err{color:#ab5442!important}@media(max-width:760px){.wallet-btn{padding:0 9px;font-size:10px}.wallet-pop{position:fixed;left:12px;right:12px;width:auto;top:70px}}';
    document.head.append(st);
  });
})();
