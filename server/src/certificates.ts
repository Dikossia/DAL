// Course certificates: issued automatically when every lesson is completed. The certificate exists in DAL
// immediately (view, PDF, verification link); the NFT is minted to the student's built-in wallet in the background.
import { randomBytes } from 'node:crypto';
import type { App } from './app.ts';
import type { DB, Row } from './db.ts';
import { progressOf } from './courses.ts';
import { certificateMemo, holderHash, shortPersonName } from './anchor.ts';
import { chainRecord, explorerAddress } from './chain/service.ts';
import { coreCreateIx, memoIx } from './chain/programs.ts';
import { keypairFromSeed } from './chain/tx.ts';
import { fromHex, toHex } from './chain/codec.ts';

const newCode = () => { const h = toHex(new Uint8Array(randomBytes(4))).toUpperCase(); return `DAL-${h.slice(0, 4)}-${h.slice(4)}`; };

export function issueCertificateIfCompleted(app: App, userId: string, courseId: string): Row | null {
  const { db } = app;
  const p = progressOf(db, userId, courseId);
  if (!p.total || p.done < p.total) return null;
  const existing = db.get('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', userId, courseId);
  if (existing) return existing;
  const row = db.get(`SELECT c.title, c.id, u.name AS expert_name FROM courses c JOIN users u ON u.id = c.expert_id WHERE c.id = ?`, courseId)!;
  const student = db.get('SELECT name FROM users WHERE id = ?', userId)!;
  const completed = db.get<{ at: string }>(`SELECT MAX(p.completed_at) AS at FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id WHERE p.user_id = ? AND m.course_id = ?`, userId, courseId)!.at;
  return db.tx(() => {
    const wallet = app.chain.wallet(userId);
    const id = newCode();
    db.run(`INSERT INTO certificates (id, user_id, course_id, student_name, course_title, expert_name, lessons, completed_at, issued_at, owner_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, userId, courseId, student.name, row.title, row.expert_name, p.total, completed || new Date().toISOString(), new Date().toISOString(), wallet.address);
    app.chain.enqueue('certificate', id);
    return db.get('SELECT * FROM certificates WHERE id = ?', id)!;
  });
}

/** Issues certificates for courses completed before this feature existed (e.g. demo data). */
export function backfillCertificates(app: App, userId: string) {
  const done = app.db.all<{ course_id: string }>(`SELECT course_id FROM enrollments WHERE user_id = ? AND status = 'active' AND course_id NOT IN (SELECT course_id FROM certificates WHERE user_id = ?)`, userId, userId);
  for (const d of done) issueCertificateIfCompleted(app, userId, d.course_id);
}

export function certificateView(db: DB, publicUrl: string, c: Row) {
  const chain = chainRecord(db, 'certificate', c.id);
  const cluster = db.get<{ value: string }>(`SELECT value FROM chain_config WHERE key = 'cluster'`)?.value || 'devnet';
  const q = new URLSearchParams({ c: c.id });
  if (c.asset_address) q.set('nft', c.asset_address);
  if (chain?.signature) q.set('tx', chain.signature);
  return {
    id: c.id, studentName: c.student_name, studentShort: shortPersonName(c.student_name), courseId: c.course_id, courseTitle: c.course_title,
    expertName: c.expert_name, lessons: c.lessons, completedAt: c.completed_at, issuedAt: c.issued_at,
    owner: c.owner_address, holderSha256: holderHash(c),
    nft: c.asset_address ? { address: c.asset_address, url: explorerAddress(c.asset_address, cluster) } : null,
    chain, verifyUrl: `${publicUrl}/verify.html?${q}`
  };
}

export function registerCertificateJobs(app: App) {
  const { db, chain } = app;
  chain.handlers.certificate = {
    build(job) {
      const c = db.get('SELECT * FROM certificates WHERE id = ?', job.ref_id);
      if (!c) throw new Error('Certificate not found');
      // The NFT address is fixed on the first attempt, so a retry never creates a second NFT.
      const extra = JSON.parse(job.extra || '{}');
      const seed = extra.assetSeed ? fromHex(extra.assetSeed) : new Uint8Array(randomBytes(32));
      const asset = keypairFromSeed(seed);
      const memo = certificateMemo(c, asset.publicKey);
      return {
        instructions: [
          coreCreateIx({ asset: asset.publicKey, payer: chain.issuer, owner: c.owner_address, updateAuthority: chain.issuer, name: `DAL Certificate ${c.id.slice(4)}`, uri: `${chain.publicUrl}/cert-metadata.json?c=${c.id}` }),
          memoIx(memo)
        ],
        signers: [asset], memo, extra: { assetSeed: toHex(seed), asset: asset.publicKey }
      };
    },
    confirmed(job) {
      const asset = JSON.parse(job.extra || '{}').asset;
      if (asset) db.run('UPDATE certificates SET asset_address = ? WHERE id = ? AND asset_address IS NULL', asset, job.ref_id);
    }
  };
}
