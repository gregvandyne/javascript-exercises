// Story Library (docs/decisions.md "Story Library"; docs/story-library-sources.md). Open-licensed picture books that
// kids read one page at a time, with 3 questions at the end, and that teachers assign to a class like a game.
//
// The books come from server/library/manifest.json (written by scripts/import-stories.js; never edited by hand). A book
// has a `source` ('storyweaver' today) so a second source can join without any change here or in the database.
//
// Progress:
//   story_reads   each reader's own progress on a book: furthest page, Read to me used, the questions (first try marks,
//                 solved). Signed-in players only (a guest has an account too); visitors read without anything saved.
//   step_progress an assigned book is a 'story' lesson with one 'story' step (lesson_steps.story_id): opening it from the
//                 class (cl + step) starts the class's row, and finishing the questions marks it done with the first-try
//                 marks and score (services/progress.js storyStep), so the gradebook and the Score count it.
// The right answers never leave the server: the reader sends a choice and hears right or wrong (and the page to look at).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { q, now, audit, uid } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as P from './progress.js';

const MANIFEST = fileURLToPath(new URL('../library/manifest.json', import.meta.url));
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
export const LEVELS = [1, 2, 3];

let data = null;
/** The manifest ({ books }), read once. Tests may swap it (_setManifest). */
export function manifest() {
  if (!data) { try { data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { data = { books: [] }; } index(); }
  return data;
}
let byId = new Map();
function index() { byId = new Map((data.books || []).map(b => [b.id, b])); }
export function _setManifest(m) { data = m; index(); }
export const books = () => manifest().books || [];
export const getBook = id => (manifest(), byId.get(String(id || '')) || null);

const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Books for the library grid: level 1-3 (or all) and words to search for in the title, credits and story. */
export function search({ level = null, q: words = '' } = {}) {
  const lv = LEVELS.includes(+level) ? +level : null;
  const terms = fold(words).split(' ').filter(Boolean).slice(0, 6);
  return books().filter(b => (!lv || b.level === lv) && (!terms.length || terms.every(t => haystack(b).includes(t))));
}
const hay = new WeakMap();
function haystack(b) {
  let h = hay.get(b);
  if (!h) { h = ` ${fold([b.title, ...b.credits.text, ...b.credits.illustration, ...b.pages.map(p => p.text)].join(' '))} `; hay.set(b, h); }
  return h;
}

/** What the reader page gets: everything but the right answers. */
export const forReader = b => ({
  id: b.id, title: b.title, level: b.level, pages: b.pages.map(p => ({ text: p.text, image: p.image })),
  questions: b.questions.map(x => ({ q: x.q, choices: x.choices })),
});

// ---------------------------------------------------------------- a reader's progress
export const readOf = (userId, bookId) => (userId ? q.get('SELECT * FROM story_reads WHERE user_id=? AND book_id=?', userId, bookId) || null : null);
/** This reader's books with progress, newest first: [{ book, read }]. */
export function myReads(userId, limit = 12) {
  if (!userId) return [];
  return q.all('SELECT * FROM story_reads WHERE user_id=? ORDER BY updated_at DESC LIMIT ?', userId, limit).map(r => ({ book: getBook(r.book_id), read: r })).filter(x => x.book);
}
/** State a book card shows: 'new' | 'reading' (page n) | 'quiz' (read to the end, questions left) | 'done'. */
export function stateOf(read, b) {
  if (!read) return { state: 'new' };
  if (read.quiz_at) return { state: 'done', right: [...(read.marks || '')].filter(c => c === '1').length, total: b.questions.length };
  if (read.page >= b.pages.length) return { state: 'quiz' };
  return { state: 'reading', page: read.page, pages: b.pages.length };
}

/** The class assignment a reader opened the book from (cl + step), checked: a student of that class, an open
 *  assignment whose step is this book. -> { clId, stepId } | null (anything else just isn't counted for a class). */
export function assignmentCtx(u, b, clId, stepId) {
  if (!u || !clId || !stepId) return null;
  const c = P.context(u, String(clId), String(stepId));
  return c.ok && c.step.kind === 'story' && c.step.story_id === b.id ? { clId: c.cl.id, stepId: c.step.id } : null;
}

function upsertRead(u, b, fields) {
  const old = readOf(u.id, b.id), t = now();
  const row = { page: 0, aloud: 0, marks: '', solved: '', finished_at: null, quiz_at: null, ...(old || {}), ...fields, pages: b.pages.length };
  if (!old) q.run(`INSERT INTO story_reads(user_id, book_id, page, pages, aloud, marks, solved, finished_at, quiz_at, started_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    u.id, b.id, row.page, row.pages, row.aloud, row.marks, row.solved, row.finished_at, row.quiz_at, t, t);
  else q.run('UPDATE story_reads SET page=?, pages=?, aloud=?, marks=?, solved=?, finished_at=?, quiz_at=?, updated_at=? WHERE user_id=? AND book_id=?',
    row.page, row.pages, row.aloud, row.marks, row.solved, row.finished_at, row.quiz_at, t, u.id, b.id);
  return readOf(u.id, b.id);
}

/** The reader turned to page n (1-based) and/or used Read to me. Keeps the furthest page. With an assignment, starts the
 *  class's row (and, for a book this reader had already finished with its questions, marks it done). -> { ok, read } */
export function progress(u, bookId, { page, aloud = false } = {}, ctx = null) {
  const b = getBook(bookId); if (!b) return fail('notFound');
  if (!u) return ok({ read: null });
  const n = Math.max(0, Math.min(b.pages.length, Math.floor(+page || 0)));
  const old = readOf(u.id, b.id);
  const r = upsertRead(u, b, { page: Math.max(n, old ? old.page : 0), aloud: aloud || (old && old.aloud) ? 1 : 0,
    finished_at: (old && old.finished_at) || (n >= b.pages.length ? now() : null) });
  if (ctx) P.storyStep(u, ctx.clId, ctx.stepId, r.quiz_at ? { bookId: b.id, done: true, marks: r.marks, aloud: !!r.aloud } : { bookId: b.id, aloud: !!r.aloud });
  return ok({ read: r });
}

/**
 * An answer to question i (0-2), choice c. Right or wrong comes back, and on a wrong one the page to look at. The first
 * try at each question is its mark; a question is solved once it is answered right. All three solved: the questions are
 * done (and, with an assignment, the class's row is done with the marks). A signed-in reader must have reached the last
 * page first. A visitor (no account) gets the same answers, with nothing saved.
 * -> { ok, right, page, solved: [bool], done, marks? }
 */
export function answer(u, bookId, i, c, ctx = null) {
  const b = getBook(bookId); if (!b) return fail('notFound');
  const qs = b.questions;
  if (!Number.isInteger(i) || i < 0 || i >= qs.length || !Number.isInteger(c) || c < 0 || c >= qs[i].choices.length) return fail('badRequest');
  const right = c === qs[i].answer;
  const reply = { right, page: right ? null : qs[i].page };
  if (!u) return ok({ ...reply, solved: null, done: false });
  const old = readOf(u.id, b.id);
  if (!old || old.page < b.pages.length) return fail('readFirst');
  const pad = s => String(s || '').padEnd(qs.length, '-').slice(0, qs.length);
  let marks = pad(old.marks), solved = pad(old.solved);
  if (marks[i] === '-') marks = marks.slice(0, i) + (right ? '1' : '0') + marks.slice(i + 1);
  if (right) solved = solved.slice(0, i) + '1' + solved.slice(i + 1);
  const done = !solved.includes('-');
  const r = upsertRead(u, b, { marks, solved, quiz_at: old.quiz_at || (done ? now() : null) });
  if (ctx && done) P.storyStep(u, ctx.clId, ctx.stepId, { bookId: b.id, done: true, marks: r.marks, aloud: !!r.aloud });
  return ok({ ...reply, solved: [...solved].map(x => x === '1'), done, marks: done ? r.marks : undefined });
}

// ---------------------------------------------------------------- teachers: assigning a book to a class
/** The class's open assignment of this book, if any. */
export const assignmentOf = (classId, bookId) => q.get(`SELECT cl.* FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id JOIN lesson_steps s ON s.lesson_id=l.id
  WHERE cl.class_id=? AND cl.removed_at IS NULL AND l.kind='story' AND s.kind='story' AND s.story_id=? LIMIT 1`, classId, bookId) || null;
/** The classes this person may assign to (the same rule as assigning a game). */
export function assignClasses(u) {
  const mine = S.classesOf(u.id, 'teacher');
  const more = S.adminSchools(u).flatMap(s => S.classesOfSchool(s.id)).filter(c => !mine.some(m => m.id === c.id));
  return [...mine, ...more].filter(c => !c.archived_at && S.canManageClass(u, c));
}
/** Assign a book to a class (optionally due on a day): a 'story' lesson with the book as its one step. The same book is
 *  never in a class twice. -> { ok, classLesson, class, book } | { ok: false, code, className? } */
export function assignStory(u, classId, bookId, { dueAt = null, opensAt = null } = {}) {
  const c = S.getClass(String(classId || ''));
  if (!c || c.archived_at || !S.canManageClass(u, c)) return fail('notFound');
  const b = getBook(bookId); if (!b) return fail('pickStory');
  if (assignmentOf(c.id, b.id)) return { ok: false, code: 'alreadyAssigned', className: c.name };
  const made = L.createLesson(u, c.school_id, { title: b.title.slice(0, 100), kind: 'story' });
  if (!made.ok) return made;
  const stepId = uid(10);
  q.run('INSERT INTO lesson_steps(id, lesson_id, position, kind, title, body, game_id, minutes, created_at, story_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    stepId, made.lesson.id, 0, 'story', b.title.slice(0, 100), '', null, 0, now(), b.id);
  const r = L.assign(u, c.id, made.lesson.id, { dueAt, opensAt });
  if (!r.ok) { L.deleteLesson(u, made.lesson.id); return r; }
  audit(u.id, 'lesson.assignStory', made.lesson.id, { book: b.id, class: c.id });
  return ok({ classLesson: r.classLesson, class: c, book: b });
}
/** The book of an assigned lesson ('story' kind), or null. */
export function storyOfLesson(lessonId) {
  const s = q.get("SELECT id, story_id FROM lesson_steps WHERE lesson_id=? AND kind='story' ORDER BY position LIMIT 1", lessonId);
  return s ? { stepId: s.id, book: getBook(s.story_id) } : null;
}

// ---------------------------------------------------------------- teachers: who read it
/**
 * One assigned book's results for its class: every student with { state: 'none' | 'reading' | 'quiz' | 'done', page,
 * pages, aloud, right, total, marks }, and the class: { started, finished, hardest: question index or null, misses: [n] }.
 * The page reached and Read to me come from the student's own story_reads (the same book, read anywhere); done and the
 * marks come from the class's row, so a teacher sees the first time the questions were finished.
 */
export function results(cl) {
  const st = storyOfLesson(cl.lesson_id); if (!st || !st.book) return null;
  const b = st.book, students = S.roster(cl.class_id).filter(p => p.role === 'student');
  const rows = new Map(q.all('SELECT * FROM step_progress WHERE class_lesson_id=? AND step_id=?', cl.id, st.stepId).map(r => [r.user_id, r]));
  const reads = students.length ? new Map(q.all(`SELECT * FROM story_reads WHERE book_id=? AND user_id IN (${students.map(() => '?').join(',')})`, b.id, ...students.map(p => p.id)).map(r => [r.user_id, r])) : new Map();
  const total = b.questions.length, misses = new Array(total).fill(0);
  const list = students.map(p => {
    const row = rows.get(p.id) || null, rd = reads.get(p.id) || null;
    const done = !!(row && row.status === 'done');
    const marks = done ? String(row.marks || '') : '';
    [...marks].forEach((m, i) => { if (m === '0') misses[i]++; });
    const state = done ? 'done' : !row && !rd ? 'none' : rd && rd.page >= b.pages.length ? 'quiz' : 'reading';
    return { ...p, state, page: rd ? rd.page : 0, pages: b.pages.length, aloud: !!((rd && rd.aloud) || (row && row.label === 'aloud')),
      right: done ? [...marks].filter(m => m === '1').length : null, total, marks, last: (row && row.updated_at) || (rd && rd.updated_at) || null };
  });
  const most = Math.max(0, ...misses);
  return { book: b, stepId: st.stepId, students: list,
    started: list.filter(p => p.state !== 'none').length, finished: list.filter(p => p.state === 'done').length,
    misses, hardest: most > 0 ? misses.indexOf(most) : null };
}
