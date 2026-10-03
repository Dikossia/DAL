// Public certificate check. The source of truth is Solana: the record (memo) signed by DAL's issuer wallet
// and the NFT (Metaplex Core) whose update authority is that wallet. DAL's own database is only a convenience.
(() => {
  'use strict';
  const DEMO_ISSUER = '8ydQvWo23hYuajXpmpP5vjJMNr8RqUsTzY2YChXVoEMG';
  const $ = s => document.querySelector(s);
  const icon = n => `<i data-lucide="${n}" aria-hidden="true"></i>`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = () => window.lucide?.createIcons({ attrs: { 'aria-hidden': 'true' } });
  const q = new URLSearchParams(location.search);
  const id = (q.get('c') || '').toUpperCase();
  const S = window.DalSolana;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  const sha256 = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtDate = s => s ? dateFmt.format(new Date(s.length === 10 ? s + 'T12:00:00' : s)).replace(/\s?г\.$/, '') : '';

  const check = (ok, title, text) => `<li class="vcheck ${ok === true ? 'ok' : ok === false ? 'bad' : 'wait'}">${icon(ok === true ? 'circle-check' : ok === false ? 'circle-x' : 'clock')}<span><strong>${title}</strong>${text ? `<small>${text}</small>` : ''}</span></li>`;

  async function run() {
    if (!id) { $('#verifyBody').innerHTML = `<div class="verify bad">${icon('circle-x')}<span><strong>В ссылке нет номера сертификата</strong></span></div>`; icons(); return; }
    let local = null, status = null;
    try { local = await withTimeout(window.DalAPI.get(`/certificates/${encodeURIComponent(id)}`), 15000); } catch (_) { /* not in this DAL instance */ }
    try { status = local ? null : await withTimeout(window.DalAPI.get('/chain/status'), 8000); } catch (_) { /* ignore */ }
    const issuer = local?.issuer || status?.issuer || DEMO_ISSUER;
    const txSig = q.get('tx') || local?.chain?.signature || null;
    const nftAddr = q.get('nft') || local?.nft?.address || null;
    let rec = null, asset = null, netError = null;
    try { [rec, asset] = await Promise.all([txSig ? S.readRecord(txSig) : null, nftAddr ? S.readCoreAsset(nftAddr) : null]); }
    catch (e) { netError = e.message; }

    const f = rec?.fields || {};
    const recOk = !!rec && rec.ok && rec.memo.startsWith('DAL certificate v1') && f.id === id;
    const byDal = !!rec && rec.feePayer === issuer;
    const nftOk = !!asset && asset.isCore && asset.updateAuthority === issuer && (!f.nft || f.nft === nftAddr);
    const genuine = recOk && byDal && nftOk;
    const onChain = !!(txSig || nftAddr);

    const d = {
      course: f.title || local?.courseTitle, student: local?.studentName || f.student, completed: f.completed || local?.completedAt,
      lessons: f.lessons || local?.lessons, expert: local?.expertName || f.expert, holder: f.holder_sha256 || local?.holderSha256
    };
    const head = genuine
      ? `<div class="verify ok big">${icon('shield-check')}<span><strong>Сертификат подлинный</strong><small>Выдан DAL и записан в блокчейн Solana ${rec.blockTime ? fmtDate(rec.blockTime) : ''}. Изменить или подделать запись нельзя.</small></span></div>`
      : local && !onChain ? `<div class="verify wait big">${icon('clock')}<span><strong>Сертификат выдан DAL, запись в Solana создаётся</strong><small>Обычно это занимает минуту. Обновите страницу позже.</small></span></div>`
      : netError ? `<div class="notice">${icon('wifi-off')} Узел Solana не ответил: ${esc(netError)}. Попробуйте обновить страницу.</div>`
      : `<div class="verify bad big">${icon('shield-alert')}<span><strong>Сертификат не подтверждён</strong><small>Запись не найдена в Solana или выдана не кошельком DAL.</small></span></div>`;

    const cardData = d.course ? { id, studentName: d.student || '—', courseTitle: d.course, expertName: d.expert || '—', lessons: d.lessons || '—', completedAt: d.completed || new Date().toISOString(), nft: nftAddr && asset ? { address: nftAddr } : null, verifyUrl: location.href } : null;
    $('#verifyBody').innerHTML = `${head}${cardData ? window.DalCert.card(cardData) : ''}
      <h2 class="vh">Что проверено</h2><ul class="vchecks">
        ${check(onChain ? recOk : null, 'Запись о сертификате есть в Solana', txSig ? `<a class="text-link" href="${esc(S.explorer(txSig))}" target="_blank" rel="noopener">${icon('external-link')}Транзакция в Solana Explorer</a>` : 'Пока нет ссылки на транзакцию')}
        ${check(rec ? byDal : null, 'Запись подписана кошельком DAL', `Издатель: <code>${esc(issuer)}</code>`)}
        ${check(nftAddr ? nftOk : null, 'NFT существует и выпущен DAL', nftAddr ? `<a class="text-link" href="${esc(S.explorerAddress(nftAddr))}" target="_blank" rel="noopener">${icon('external-link')}NFT в Solana Explorer</a>` : 'NFT ещё создаётся')}
        ${asset ? check(true, 'Владелец NFT', `Кошелёк выпускника: <code>${esc(asset.owner)}</code>`) : ''}
      </ul>
      ${d.holder ? `<form id="nameCheck" class="name-check"><h2 class="vh">Проверить имя выпускника</h2><p class="fine-print">В блокчейне хранится не имя, а его отпечаток (SHA-256): так личные данные не попадают в публичную сеть. Введите имя и фамилию из сертификата, чтобы сверить.</p><div class="name-row"><input type="text" name="name" required placeholder="Имя Фамилия" aria-label="Имя и фамилия"><button class="btn" type="submit">${icon('search-check')}Сверить</button></div><p id="nameResult" class="fine-print" role="status"></p></form>` : ''}
      <p class="fine-print">Сертификат ${esc(id)}. Сеть: Solana ${esc(S.CLUSTER)}. Проверка выполняется в вашем браузере через публичный узел Solana.</p>`;
    icons();
    $('#nameCheck')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = String(new FormData(e.target).get('name')).trim().toLowerCase();
      const ok = (await sha256(`${id}|${name}`)) === d.holder;
      const r = $('#nameResult'); r.className = `fine-print ${ok ? 'name-ok' : 'name-bad'}`;
      r.textContent = ok ? 'Совпадает: сертификат выдан этому человеку.' : 'Не совпадает. Проверьте написание имени и фамилии.';
    });
  }
  document.addEventListener('DOMContentLoaded', () => run().catch(e => { $('#verifyBody').innerHTML = `<div class="notice">${esc(e.message)}</div>`; }));
})();
