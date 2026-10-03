import path from 'node:path';
import fs from 'node:fs';
import type { App } from '../app.ts';
import { HttpError, notFound, conflict, receiveFile, type User } from '../http.ts';
import { parse, str, num, bool, oneOf } from '../validate.ts';
import { RULES, CATEGORIES, COVER_LIBRARY, VIDEO_TYPES, IMAGE_TYPES } from '../rules.ts';
import { newId, nowIso } from '../util.ts';
import {
  ownCourse, ownLesson, assertEditable, isLive, lessonsOf, structure, checklist, courseCard, courseStats,
  removeVideoFile, assertVerifiedExpert, touch
} from '../courses.ts';

const E: ['expert'] = ['expert'];

export function registerStudioCourses(app: App) {
  const { db, router } = app;

  const detail = (id: string) => {
    const c = db.get('SELECT * FROM courses WHERE id = ?', id)!;
    const lessons = lessonsOf(db, id);
    const stats = courseStats(db, id);
    return {
      ...courseCard(db, c),
      moderationNote: c.moderation_note,
      submittedAt: c.submitted_at,
      modules: structure(db, id, 'owner'),
      checklist: checklist(c, lessons),
      rules: {
        canEdit: c.status !== 'review',
        canDeleteLessons: c.status === 'draft',
        canDeleteVideo: c.status === 'draft',
        canDelete: c.status !== 'review' && stats.students === 0 && !db.get('SELECT 1 FROM enrollments WHERE course_id = ?', id),
        freeLessonsLeft: RULES.maxFreeLessons - lessons.filter(l => l.is_free === 1).length
      }
    };
  };
  const ownModule = (user: User, moduleId: string) => {
    const m = db.get('SELECT * FROM modules WHERE id = ?', moduleId);
    if (!m) throw notFound('Модуль не найден');
    return { module: m, course: ownCourse(db, user, m.course_id) };
  };
  const deleteLessonFiles = (lessonIds: string[]) => {
    for (const id of lessonIds) removeVideoFile(app, db.get('SELECT file_name FROM videos WHERE lesson_id = ?', id)?.file_name);
  };
  const assertDraft = (c: any, what: string) => {
    assertEditable(c);
    if (isLive(c)) throw conflict('course_live', `${what} нельзя: курс уже продаётся и ученики его проходят.`);
  };

  // ----- Courses -----
  router.add({
    method: 'GET', path: '/studio/courses', group: 'Studio: courses', summary: 'My courses in all statuses.', auth: E,
    handler: ({ user, query }) => {
      const status = query.get('status');
      return db.all('SELECT * FROM courses WHERE expert_id = ? ORDER BY updated_at DESC', user!.id)
        .filter(c => !status || c.status === status)
        .map(c => { const list = checklist(c, lessonsOf(db, c.id)); return { ...courseCard(db, c), checklistLeft: list.filter(x => !x.ok).length }; });
    }
  });

  router.add({
    method: 'POST', path: '/studio/courses', group: 'Studio: courses', summary: 'Create a course draft (with a first module).', auth: E,
    body: '{ title?, category? }',
    handler: ctx => {
      const { user, body } = ctx;
      const b = parse<{ title?: string; category?: string }>(body, { title: str({ max: 90, optional: true }), category: oneOf(CATEGORIES, { optional: true }) });
      const id = newId(), now = nowIso();
      db.tx(() => {
        db.run('INSERT INTO courses (id, expert_id, title, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', id, user!.id, b.title ?? '', b.category ?? 'beginner', now, now);
        db.run('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, 1)', newId(), id, 'Модуль 1');
      });
      ctx.status = 201;
      return detail(id);
    }
  });

  router.add({
    method: 'GET', path: '/studio/courses/:id', group: 'Studio: courses', summary: 'Course for the editor: curriculum, videos, moderation checklist, currently allowed actions.', auth: E,
    handler: ({ user, params }) => { ownCourse(db, user!, params.id); return detail(params.id); }
  });

  router.add({
    method: 'PATCH', path: '/studio/courses/:id', group: 'Studio: courses', summary: 'Change the title, category, description, price or library cover. Locked while the course is in moderation. A new price applies to new purchases.', auth: E,
    body: '{ title?, category?, description?, price? (tenge, null = not set), cover? ("foundations" | "analytics" | "workshop" | null) }',
    handler: ({ user, params, body }) => {
      const c = ownCourse(db, user!, params.id);
      assertEditable(c);
      const b = parse<Record<string, any>>(body, {
        title: str({ max: 90, optional: true }), category: oneOf(CATEGORIES, { optional: true }),
        description: str({ max: 1500, optional: true }), price: num({ int: true, min: 0, max: 10_000_000, optional: true, nullable: true }),
        cover: oneOf(COVER_LIBRARY, { optional: true, nullable: true })
      });
      const cols: Record<string, string> = { title: 'title', category: 'category', description: 'description', price: 'price', cover: 'cover' };
      db.tx(() => {
        for (const [k, col] of Object.entries(cols)) if (k in b) db.run(`UPDATE courses SET ${col} = ? WHERE id = ?`, b[k], c.id);
        if ('cover' in b && c.cover?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', c.cover.slice(7)), { force: true });
        touch(db, c.id);
      });
      return detail(c.id);
    }
  });

  router.add({
    method: 'PUT', path: '/studio/courses/:id/cover', group: 'Studio: courses', summary: 'Upload a custom cover. The request body is the file itself (JPG, PNG or WEBP up to 5 MB) with the image Content-Type.', auth: E, raw: true,
    body: 'binary image file',
    handler: async ({ user, params, req }) => {
      const c = ownCourse(db, user!, params.id);
      assertEditable(c);
      const type = String(req.headers['content-type'] || '').split(';')[0];
      const ext = IMAGE_TYPES[type];
      if (!ext) throw new HttpError(415, 'unsupported_type', 'Нужна картинка JPG, PNG или WEBP');
      const file = `${c.id}-${Date.now()}${ext}`;
      await receiveFile(req, path.join(app.storageDir, 'covers', file), RULES.maxCoverBytes);
      const old = db.get('SELECT cover FROM courses WHERE id = ?', c.id)?.cover;
      db.run('UPDATE courses SET cover = ?, updated_at = ? WHERE id = ?', 'upload:' + file, nowIso(), c.id);
      if (old?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', old.slice(7)), { force: true });
      return detail(c.id);
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/courses/:id', group: 'Studio: courses', summary: 'Delete a course together with its videos. Not allowed if the course has been purchased or is in moderation.', auth: E,
    handler: ({ user, params }) => {
      const c = ownCourse(db, user!, params.id);
      assertEditable(c);
      if (db.get('SELECT 1 FROM enrollments WHERE course_id = ?', c.id)) throw conflict('course_has_students', 'Курс купили ученики, его можно только скрыть из каталога.');
      const files = db.all<{ file_name: string }>(`SELECT v.file_name FROM videos v JOIN lessons l ON l.id = v.lesson_id JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?`, c.id);
      db.run('DELETE FROM courses WHERE id = ?', c.id);
      files.forEach(f => removeVideoFile(app, f.file_name));
      if (c.cover?.startsWith('upload:')) fs.rmSync(path.join(app.storageDir, 'covers', c.cover.slice(7)), { force: true });
    }
  });

  // ----- Lifecycle -----
  const transition = (p: string, summary: string, fn: (c: any, user: User) => void) => router.add({
    method: 'POST', path: `/studio/courses/:id/${p}`, group: 'Studio: courses', summary, auth: E,
    handler: ({ user, params }) => { const c = ownCourse(db, user!, params.id); db.tx(() => fn(c, user!)); return detail(c.id); }
  });
  transition('submit', 'Submit the draft for moderation. Requires a verified profile and a completed checklist.', (c, user) => {
    if (c.status !== 'draft') throw conflict('bad_status', 'На модерацию отправляется только черновик');
    assertVerifiedExpert(db, user, 'Отправлять курсы на модерацию');
    const left = checklist(c, lessonsOf(db, c.id)).filter(x => !x.ok);
    if (left.length) throw new HttpError(422, 'checklist', 'Курс ещё не готов к модерации', left.map(x => x.label));
    db.run(`UPDATE courses SET status = 'review', submitted_at = ?, moderation_note = NULL, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), c.id);
  });
  transition('withdraw', 'Withdraw the course from moderation back to drafts.', c => {
    if (c.status !== 'review') throw conflict('bad_status', 'Курс не на модерации');
    db.run(`UPDATE courses SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?`, nowIso(), c.id);
  });
  transition('hide', 'Hide the course from the catalog. Buyers keep access.', c => {
    if (c.status !== 'published') throw conflict('bad_status', 'Скрыть можно только курс из каталога');
    db.run(`UPDATE courses SET status = 'hidden', updated_at = ? WHERE id = ?`, nowIso(), c.id);
  });
  transition('unhide', 'Return a hidden course to the catalog.', c => {
    if (c.status !== 'hidden') throw conflict('bad_status', 'Курс не скрыт');
    db.run(`UPDATE courses SET status = 'published', updated_at = ? WHERE id = ?`, nowIso(), c.id);
  });

  // ----- Modules -----
  router.add({
    method: 'POST', path: '/studio/courses/:id/modules', group: 'Studio: curriculum', summary: 'Add a module. Also allowed for published courses.', auth: E,
    body: '{ title? }',
    handler: ({ user, params, body }) => {
      const c = ownCourse(db, user!, params.id);
      assertEditable(c);
      const b = parse<{ title?: string }>(body, { title: str({ max: 80, optional: true }) });
      const pos = (db.get('SELECT MAX(position) AS p FROM modules WHERE course_id = ?', c.id)?.p ?? 0) + 1;
      db.run('INSERT INTO modules (id, course_id, title, position) VALUES (?, ?, ?, ?)', newId(), c.id, b.title ?? `Модуль ${pos}`, pos);
      touch(db, c.id);
      return detail(c.id);
    }
  });

  router.add({
    method: 'PATCH', path: '/studio/modules/:id', group: 'Studio: curriculum', summary: 'Rename a module.', auth: E,
    body: '{ title }',
    handler: ({ user, params, body }) => {
      const { course } = ownModule(user!, params.id);
      assertEditable(course);
      const b = parse<{ title: string }>(body, { title: str({ max: 80 }) });
      db.run('UPDATE modules SET title = ? WHERE id = ?', b.title, params.id);
      touch(db, course.id);
      return detail(course.id);
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/modules/:id', group: 'Studio: curriculum', summary: 'Delete a module with its lessons and videos. Drafts only; the last module cannot be deleted.', auth: E,
    handler: ({ user, params }) => {
      const { course } = ownModule(user!, params.id);
      assertDraft(course, 'Удалять модули');
      if ((db.get('SELECT COUNT(*) AS n FROM modules WHERE course_id = ?', course.id)!.n as number) <= 1) throw conflict('last_module', 'В курсе должен остаться хотя бы один модуль');
      const ids = db.all<{ id: string }>('SELECT id FROM lessons WHERE module_id = ?', params.id).map(r => r.id);
      deleteLessonFiles(ids);
      db.run('DELETE FROM modules WHERE id = ?', params.id);
      touch(db, course.id);
      return detail(course.id);
    }
  });

  // ----- Lessons -----
  router.add({
    method: 'POST', path: '/studio/modules/:id/lessons', group: 'Studio: curriculum', summary: 'Add a lesson to a module.', auth: E,
    body: '{ title? }',
    handler: ({ user, params, body }) => {
      const { course } = ownModule(user!, params.id);
      assertEditable(course);
      const b = parse<{ title?: string }>(body, { title: str({ max: 100, optional: true }) });
      const pos = (db.get('SELECT MAX(position) AS p FROM lessons WHERE module_id = ?', params.id)?.p ?? 0) + 1;
      const id = newId();
      db.run('INSERT INTO lessons (id, module_id, title, position, created_at) VALUES (?, ?, ?, ?, ?)', id, params.id, b.title ?? '', pos, nowIso());
      touch(db, course.id);
      return { lessonId: id, course: detail(course.id) };
    }
  });

  router.add({
    method: 'PATCH', path: '/studio/lessons/:id', group: 'Studio: curriculum', summary: `Rename a lesson or make it free (at most ${RULES.maxFreeLessons} per course).`, auth: E,
    body: '{ title?, isFree? }',
    handler: ({ user, params, body }) => {
      const { lesson, course } = ownLesson(db, user!, params.id);
      assertEditable(course);
      const b = parse<{ title?: string; isFree?: boolean }>(body, { title: str({ max: 100, optional: true }), isFree: bool({ optional: true }) });
      db.tx(() => {
        if (b.title !== undefined) db.run('UPDATE lessons SET title = ? WHERE id = ?', b.title, lesson.id);
        if (b.isFree === true && lesson.is_free === 0) {
          const free = lessonsOf(db, course.id).filter(l => l.is_free === 1).length;
          if (free >= RULES.maxFreeLessons) throw conflict('free_limit', `Бесплатных уроков может быть не больше ${RULES.maxFreeLessons}`);
        }
        if (b.isFree !== undefined) db.run('UPDATE lessons SET is_free = ? WHERE id = ?', b.isFree, lesson.id);
        touch(db, course.id);
      });
      return detail(course.id);
    }
  });

  router.add({
    method: 'POST', path: '/studio/lessons/:id/move', group: 'Studio: curriculum', summary: 'Move a lesson up or down within its module.', auth: E,
    body: '{ direction: "up" | "down" }',
    handler: ({ user, params, body }) => {
      const { lesson, course } = ownLesson(db, user!, params.id);
      assertEditable(course);
      const b = parse<{ direction: 'up' | 'down' }>(body, { direction: oneOf(['up', 'down'] as const) });
      const list = db.all('SELECT id, position FROM lessons WHERE module_id = ? ORDER BY position', lesson.module_id);
      const i = list.findIndex(l => l.id === lesson.id), j = i + (b.direction === 'up' ? -1 : 1);
      if (j < 0 || j >= list.length) throw conflict('cannot_move', 'Урок уже на краю модуля');
      db.tx(() => {
        db.run('UPDATE lessons SET position = ? WHERE id = ?', list[j].position, list[i].id);
        db.run('UPDATE lessons SET position = ? WHERE id = ?', list[i].position, list[j].id);
        touch(db, course.id);
      });
      return detail(course.id);
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/lessons/:id', group: 'Studio: curriculum', summary: 'Delete a lesson with its video. Drafts only: lessons are never removed from a published course.', auth: E,
    handler: ({ user, params }) => {
      const { lesson, course } = ownLesson(db, user!, params.id);
      assertDraft(course, 'Удалять уроки');
      deleteLessonFiles([lesson.id]);
      db.run('DELETE FROM lessons WHERE id = ?', lesson.id);
      touch(db, course.id);
      return detail(course.id);
    }
  });

  // ----- Video -----
  router.add({
    method: 'PUT', path: '/studio/lessons/:id/video', group: 'Studio: video',
    summary: 'Upload or replace a lesson video. The request body is the file itself (MP4, MOV or WEBM up to 4 GB). Headers: video Content-Type, X-File-Name (file name encoded with encodeURIComponent), X-Duration (seconds, if known).',
    auth: E, raw: true, body: 'binary video file',
    handler: async ({ user, params, req }) => {
      const { lesson, course } = ownLesson(db, user!, params.id);
      assertEditable(course);
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      const ext = VIDEO_TYPES[type];
      if (!ext) throw new HttpError(415, 'unsupported_type', 'Нужен видеофайл MP4, MOV или WEBM');
      let original = 'video' + ext;
      try { if (req.headers['x-file-name']) original = decodeURIComponent(String(req.headers['x-file-name'])).slice(0, 200); } catch { /* keep the default name */ }
      const dur = Number(req.headers['x-duration']);
      const file = `${course.id}/${lesson.id}-${Date.now()}${ext}`;  // always stored with "/" in the DB, regardless of OS
      const size = await receiveFile(req, path.join(app.storageDir, 'videos', file), RULES.maxVideoBytes);
      // While the file was uploading, the course may have been submitted for moderation or the lesson deleted.
      const fresh = db.get('SELECT c.status FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.id = ?', lesson.id);
      if (!fresh || fresh.status === 'review') {
        removeVideoFile(app, file);
        throw fresh ? conflict('course_in_review', 'Курс отправлен на модерацию во время загрузки') : notFound('Урок удалён во время загрузки');
      }
      const old = db.get('SELECT file_name FROM videos WHERE lesson_id = ?', lesson.id);
      db.run(
        `INSERT INTO videos (lesson_id, file_name, original_name, mime, size, duration, uploaded_at, updated_after_publish) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (lesson_id) DO UPDATE SET file_name = excluded.file_name, original_name = excluded.original_name, mime = excluded.mime,
           size = excluded.size, duration = excluded.duration, uploaded_at = excluded.uploaded_at, updated_after_publish = excluded.updated_after_publish`,
        lesson.id, file, original, type, size, Number.isFinite(dur) && dur > 0 ? dur : null, nowIso(), isLive(course));
      if (old) removeVideoFile(app, old.file_name);
      touch(db, course.id);
      return { lessonId: lesson.id, name: original, size, mime: type, duration: Number.isFinite(dur) && dur > 0 ? dur : null, updatedAfterPublish: isLive(course) };
    }
  });

  router.add({
    method: 'DELETE', path: '/studio/lessons/:id/video', group: 'Studio: video', summary: 'Delete a lesson video. Drafts only: in a published course a video can only be replaced.', auth: E,
    handler: ({ user, params }) => {
      const { lesson, course } = ownLesson(db, user!, params.id);
      assertEditable(course);
      if (isLive(course)) throw conflict('course_live', 'В опубликованном курсе видео можно только заменить');
      const v = db.get('SELECT file_name FROM videos WHERE lesson_id = ?', lesson.id);
      if (!v) throw notFound('В уроке нет видео');
      db.run('DELETE FROM videos WHERE lesson_id = ?', lesson.id);
      removeVideoFile(app, v.file_name);
      touch(db, course.id);
      return detail(course.id);
    }
  });
}
