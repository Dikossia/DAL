import fs from 'node:fs';
import path from 'node:path';
import type { DB, Row } from './db.ts';
import type { App } from './app.ts';
import { HttpError, notFound, conflict, forbidden, type User } from './http.ts';
import { RULES, CATEGORY_NAMES, COVER_LIBRARY } from './rules.ts';

export const isLive = (c: Row) => c.status === 'published' || c.status === 'hidden';

export function coverUrl(cover: string | null): string | null {
  if (!cover) return null;
  if (cover.startsWith('upload:')) return `/media/covers/${cover.slice(7)}`;
  return COVER_LIBRARY.includes(cover) ? `/assets/${cover}.jpg` : null;
}

export function videoFile(app: App, fileName: string): string {
  return fileName.startsWith('seed:') ? path.join(app.seedDir, fileName.slice(5)) : path.join(app.storageDir, 'videos', fileName);
}
export function removeVideoFile(app: App, fileName: string | undefined | null) {
  if (fileName && !fileName.startsWith('seed:')) fs.rmSync(videoFile(app, fileName), { force: true });
}

export function getCourse(db: DB, id: string): Row {
  const c = db.get('SELECT * FROM courses WHERE id = ?', id);
  if (!c) throw notFound('Курс не найден');
  return c;
}

// Курс эксперта: чужие курсы выглядят как несуществующие.
export function ownCourse(db: DB, user: User, id: string): Row {
  const c = getCourse(db, id);
  if (c.expert_id !== user.id) throw notFound('Курс не найден');
  return c;
}

export function assertEditable(c: Row) {
  if (c.status === 'review') throw conflict('course_in_review', 'Курс на модерации, редактирование закрыто. Отзовите его с модерации, чтобы внести изменения.');
}

export function lessonContext(db: DB, lessonId: string): { lesson: Row; module: Row; course: Row } {
  const row = db.get(
    `SELECT l.id AS l_id, m.id AS m_id, c.id AS c_id FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ?`, lessonId);
  if (!row) throw notFound('Урок не найден');
  return {
    lesson: db.get('SELECT * FROM lessons WHERE id = ?', row.l_id)!,
    module: db.get('SELECT * FROM modules WHERE id = ?', row.m_id)!,
    course: db.get('SELECT * FROM courses WHERE id = ?', row.c_id)!
  };
}

export function ownLesson(db: DB, user: User, lessonId: string) {
  const ctx = lessonContext(db, lessonId);
  if (ctx.course.expert_id !== user.id) throw notFound('Урок не найден');
  return ctx;
}

export function hasActiveEnrollment(db: DB, userId: string, courseId: string): boolean {
  return !!db.get(`SELECT 1 FROM enrollments WHERE user_id = ? AND course_id = ? AND status = 'active'`, userId, courseId);
}

// Кто может смотреть видео урока.
export function canWatch(db: DB, user: User | null, course: Row, lesson: Row): boolean {
  if (user?.role === 'moderator') return true;
  if (user && course.expert_id === user.id) return true;
  if (user && hasActiveEnrollment(db, user.id, course.id) && isLive(course)) return true;
  return course.status === 'published' && lesson.is_free === 1;
}

export function lessonsOf(db: DB, courseId: string): Row[] {
  return db.all(
    `SELECT l.*, m.id AS module_id, v.lesson_id AS has_video, v.duration, v.original_name, v.size, v.mime, v.uploaded_at, v.updated_after_publish
     FROM modules m JOIN lessons l ON l.module_id = m.id LEFT JOIN videos v ON v.lesson_id = l.id
     WHERE m.course_id = ? ORDER BY m.position, l.position`, courseId);
}

export function structure(db: DB, courseId: string, mode: 'owner' | 'student' | 'public', completed?: Set<string>) {
  const modules = db.all('SELECT * FROM modules WHERE course_id = ? ORDER BY position', courseId);
  const lessons = lessonsOf(db, courseId);
  return modules.map(m => ({
    id: m.id,
    title: m.title,
    lessons: lessons.filter(l => l.module_id === m.id).map(l => ({
      id: l.id,
      title: l.title,
      isFree: l.is_free === 1,
      duration: l.duration ?? null,
      hasVideo: !!l.has_video,
      ...(mode === 'owner' && l.has_video ? { video: { name: l.original_name, size: l.size, mime: l.mime, duration: l.duration ?? null, uploadedAt: l.uploaded_at, updatedAfterPublish: l.updated_after_publish === 1 } } : {}),
      ...(mode === 'student' ? { completed: completed?.has(l.id) ?? false, videoUrl: l.has_video ? `/lessons/${l.id}/video` : null } : {}),
      ...(mode === 'public' && l.is_free === 1 && l.has_video ? { videoUrl: `/lessons/${l.id}/video` } : {})
    }))
  }));
}

export function checklist(c: Row, lessons: Row[]) {
  return [
    { key: 'title', label: 'Название не короче 10 символов', ok: c.title.trim().length >= 10 },
    { key: 'description', label: 'Описание не короче 80 символов', ok: c.description.trim().length >= 80 },
    { key: 'cover', label: 'Выбрана обложка', ok: !!c.cover },
    { key: 'price', label: 'Указана цена', ok: c.price !== null },
    { key: 'lessons', label: 'Не меньше 3 уроков', ok: lessons.length >= 3 },
    { key: 'lessonTitles', label: 'У всех уроков есть названия', ok: lessons.length > 0 && lessons.every(l => l.title.trim().length >= 3) },
    { key: 'videos', label: 'Видео загружено во все уроки', ok: lessons.length > 0 && lessons.every(l => !!l.has_video) }
  ];
}

export function courseStats(db: DB, courseId: string) {
  const s = db.get(
    `SELECT COUNT(*) AS students, COALESCE(SUM(price_paid), 0) AS gross, COALESCE(SUM(commission), 0) AS commission
     FROM enrollments WHERE course_id = ? AND status = 'active'`, courseId)!;
  const r = db.get(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE course_id = ? AND hidden = 0`, courseId)!;
  return { students: s.students, revenue: s.gross, income: s.gross - s.commission, rating: r.avg ? Math.round(r.avg * 100) / 100 : null, reviews: r.n };
}

// Карточка курса для каталога и списков.
export function courseCard(db: DB, c: Row) {
  const lessons = lessonsOf(db, c.id);
  const expert = db.get('SELECT u.id, u.name, p.avatar FROM users u LEFT JOIN expert_profiles p ON p.user_id = u.id WHERE u.id = ?', c.expert_id)!;
  const stats = courseStats(db, c.id);
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    categoryName: CATEGORY_NAMES[c.category],
    description: c.description,
    price: c.price,
    coverUrl: coverUrl(c.cover),
    status: c.status,
    expert: { id: expert.id, name: expert.name, avatarUrl: expert.avatar ? `/assets/${expert.avatar}.jpg` : null },
    lessons: lessons.length,
    duration: Math.round(lessons.reduce((a, l) => a + (l.duration || 0), 0)),
    freeLessons: lessons.filter(l => l.is_free === 1).length,
    ...stats,
    publishedAt: c.published_at,
    updatedAt: c.updated_at
  };
}

export function progressOf(db: DB, userId: string, courseId: string) {
  const total = lessonsOf(db, courseId).length;
  const done = db.get(
    `SELECT COUNT(*) AS n FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id JOIN modules m ON m.id = l.module_id
     WHERE p.user_id = ? AND m.course_id = ?`, userId, courseId)!.n as number;
  return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
}

export function assertVerifiedExpert(db: DB, user: User, action: string) {
  const p = db.get('SELECT verified_at FROM expert_profiles WHERE user_id = ?', user.id);
  if (!p?.verified_at) throw forbidden(`${action} можно после подтверждения личности и счёта для выплат.`);
}

export const touch = (db: DB, courseId: string) => db.run('UPDATE courses SET updated_at = ? WHERE id = ?', new Date().toISOString(), courseId);

export const requireFound = <T>(v: T | undefined, msg: string): T => { if (v === undefined || v === null) throw notFound(msg); return v; };
export { HttpError, RULES };
