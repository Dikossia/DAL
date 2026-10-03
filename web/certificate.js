// Course certificate: on-screen card, PDF download (drawn on a canvas, works for any alphabet) and the verification link.
window.DalCert = (() => {
  'use strict';
  const en = () => (window.DalLang?.lang || 'en') === 'en';
  const tr = s => (en() && window.DalLang?.t ? window.DalLang.t(s) : s);
  const L = () => en()
    ? { title: 'Certificate of completion', has: 'has completed the course', lessons: 'Lessons', completed: 'Completed', expert: 'Expert', id: 'Certificate ID', verify: 'Verify', chain: 'Recorded on Solana as an NFT', pending: 'The Solana record is being created', months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] }
    : { title: 'Сертификат о прохождении', has: 'успешно прошёл(а) курс', lessons: 'Уроков', completed: 'Завершён', expert: 'Эксперт', id: 'Номер сертификата', verify: 'Проверка', chain: 'Записан в Solana как NFT', pending: 'Запись в Solana создаётся', months: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'] };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = iso => { const d = new Date(iso), l = L(); return en() ? `${l.months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} ${l.months[d.getMonth()]} ${d.getFullYear()}`; };
  const short = a => a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';

  /** HTML preview of the certificate. */
  function card(c) {
    const l = L();
    return `<div class="cert-card"><div class="cert-top"><span class="cert-brand">Dal<i></i></span><span class="cert-id">${esc(l.id)}: ${esc(c.id)}</span></div>
      <p class="cert-kicker">${esc(l.title)}</p><h3 class="cert-name">${esc(tr(c.studentName))}</h3><p class="cert-has">${esc(l.has)}</p><p class="cert-course">«${esc(tr(c.courseTitle))}»</p>
      <dl class="cert-meta"><div><dt>${esc(l.lessons)}</dt><dd>${c.lessons}</dd></div><div><dt>${esc(l.completed)}</dt><dd>${esc(date(c.completedAt))}</dd></div><div><dt>${esc(l.expert)}</dt><dd>${esc(tr(c.expertName))}</dd></div></dl>
      <p class="cert-chain">${c.nft ? `◆ ${esc(l.chain)} · ${esc(short(c.nft.address))}` : `◇ ${esc(l.pending)}`}</p></div>`;
  }

  function wrap(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    return lines;
  }

  async function draw(c) {
    const W = 1754, H = 1240, l = L();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await Promise.all(['700 40px Manrope', '400 40px Manrope'].map(f => document.fonts.load(f))); } catch (_) { /* system font fallback */ }
    const F = (w, s) => `${w} ${s}px Manrope, "Segoe UI", Arial, sans-serif`;
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1f6f54'; g.lineWidth = 6; g.strokeRect(50, 50, W - 100, H - 100);
    g.strokeStyle = '#c9d8cf'; g.lineWidth = 2; g.strokeRect(74, 74, W - 148, H - 148);
    g.fillStyle = '#17231d'; g.font = F(700, 64); g.fillText('Dal', 130, 190);
    g.fillStyle = '#25825f'; g.beginPath(); g.arc(250, 182, 9, 0, Math.PI * 2); g.fill();
    g.textAlign = 'right'; g.fillStyle = '#5d6b63'; g.font = F(400, 26); g.fillText(`${l.id}: ${c.id}`, W - 130, 180);
    g.textAlign = 'center';
    g.fillStyle = '#1f6f54'; g.font = F(700, 30); g.fillText(l.title.toUpperCase(), W / 2, 330);
    g.fillStyle = '#17231d'; g.font = F(700, 88); g.fillText(tr(c.studentName), W / 2, 470);
    g.fillStyle = '#5d6b63'; g.font = F(400, 32); g.fillText(l.has, W / 2, 545);
    g.fillStyle = '#17231d'; g.font = F(700, 52);
    wrap(g, `«${tr(c.courseTitle)}»`, W - 400).slice(0, 2).forEach((s, i) => g.fillText(s, W / 2, 640 + i * 66));
    const cols = [[l.lessons, String(c.lessons)], [l.completed, date(c.completedAt)], [l.expert, tr(c.expertName)]];
    cols.forEach(([k, v], i) => {
      const x = W / 2 + (i - 1) * 440;
      g.fillStyle = '#5d6b63'; g.font = F(400, 24); g.fillText(k.toUpperCase(), x, 840);
      g.fillStyle = '#17231d'; g.font = F(700, 34); g.fillText(v, x, 890);
    });
    g.strokeStyle = '#d8e2dc'; g.lineWidth = 2; g.beginPath(); g.moveTo(200, 960); g.lineTo(W - 200, 960); g.stroke();
    g.fillStyle = '#5b3fb0'; g.font = F(700, 24);
    g.fillText(c.nft ? `◆ ${l.chain} · ${c.nft.address}` : `◇ ${l.pending}`, W / 2, 1020);
    g.fillStyle = '#1f6f54'; g.font = F(400, 24); g.fillText(`${l.verify}: ${c.verifyUrl}`, W / 2, 1070);
    return cv;
  }

  // A one-page PDF with the drawn certificate as a JPEG and a clickable verification link.
  async function pdf(c) {
    const cv = await draw(c);
    const jpeg = new Uint8Array(await (await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const enc = new TextEncoder(), parts = [], offsets = [];
    let size = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); size += b.length; };
    const obj = (n, body, stream) => { offsets[n] = size; push(`${n} 0 obj\n${body}\n`); if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); } push('endobj\n'); };
    const PW = 842, PH = 595, uri = c.verifyUrl.replace(/[()\\]/g, m => '\\' + m);
    const content = enc.encode(`q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`);
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>`);
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
    obj(5, `<< /Length ${content.length} >>`, content);
    obj(6, `<< /Type /Annot /Subtype /Link /Rect [100 50 742 75] /Border [0 0 0] /A << /S /URI /URI (${uri}) >> >>`);
    const xref = size;
    push(`xref\n0 7\n0000000000 65535 f \n${[1, 2, 3, 4, 5, 6].map(n => String(offsets[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const blob = new Blob(parts, { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `DAL-certificate-${c.id}.pdf`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  return { card, pdf, draw };
})();
