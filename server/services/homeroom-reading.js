// Homeroom: reading from the desk (docs/homeroom.md "The student desk", "Handouts and lessons"; docs/decisions.md
// "Homeroom: reading from the desk"). The owner: "reading... go on [the Library]... read it, quiz, 3 notes... teacher
// should be able to see it."
//
// A Reading handout is a class assignment like every handout (services/homeroom-handouts.js), never a second system:
//   - a 'story' lesson with one 'story' step (the Story Library's kind: services/library.js assignStory), the step's
//     story_id the book, or '' for "Read a book" (the student picks one); the teacher's instructions are the step's
//     body; class_lessons and class_lesson_students for exactly the students it went to (one desk, a group, a team, or
//     Whole class); homeroom_handouts for its order and how it is graded (Completion by default, Score from the quiz,
//     or Not graded);
//   - when the routine is finished the step's step_progress row is done with the quiz's first-try marks
//     (services/progress.js storyStep), so the gradebook, the Score (services/scores.js counts a story step's marks),
//     the Classroom tab's overview, the To do list and Google Classroom (by the grade chosen) all see it unchanged.
// What only the routine needs is homeroom_reading (0134), one row per handout and student:
//   Read   the book in the desk's reading layer (the library's own reader in a frame, Read to me and all); the furthest
//          page; finished at the last page (read_at);
//   Quiz   the book's own questions, else a short quiz the AI wrote from the book (services/reading-quiz.js); the first
//          try at each question is its mark, a wrong answer says which page to look at, done once all are right;
//   Notes  three short prompts (Something that happened, A new word, What I think) saved as one page in the student's
//          notebook, in the class's tab, titled with the book's name (services/notebook.js handoutPage, the same call as
//          a handout's Notes button), so their teacher reads them where they read the notebook already.
// The steps go in order: no quiz before the book is read, no notes before the quiz is done.
//
// Who: the class's own teachers hand it out (the Homeroom gate); a student reads and writes only their own routine, for a
// handout on their own desk that is not waiting (In order). Nothing here reaches the AI: the quiz is made from the book
// alone, before and apart from any student.
import { q, now, audit, uid } from '../db.js';
import { esc } from '../views/html.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as P from './progress.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as LIB from './library.js';
import * as NB from './notebook.js';
import * as RQ from './reading-quiz.js';
import { textProblem } from './manipulatives.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
/** The routine's steps, in order. */
export const STEPS = ['read', 'quiz', 'notes'];
/** The three notes: their keys (the prompts are words in the student's language: homeroom.reading.notes.<key>). */
export const NOTES = ['happened', 'word', 'think'];
export const NOTE_MAX = 300;

/** A class's grade ('K', '3', 'Grade 4'...) as a Story Library grade band ('k', '1', '2', '3', '4-5'), or null. */
export function libraryGrade(grade) {
  const g = String(grade || '').toLowerCase();
  if (/\b(k|kg|kinder\w*|pre-?k|tk)\b/.test(g)) return 'k';
  const n = Number((g.match(/\d+/) || [])[0]);
  if (n === 1 || n === 2 || n === 3) return String(n);
  if (n === 4 || n === 5) return '4-5';
  return null;
}
/** A book as a card shows it: { id, title, grade, cover, pages }. */
export const bookCard = b => (b ? { id: b.id, title: b.title, grade: b.grade, cover: b.cover && b.cover.src, pages: b.pages.length } : null);

// ---------------------------------------------------------------- which handouts are Reading
/** The class's open Reading handouts: Map clId -> { stepId, storyId } (storyId '' for the student's own choice). */
export function readingOf(classId) {
  return new Map(q.all(`SELECT h.class_lesson_id id, s.id step_id, COALESCE(s.story_id,'') story_id FROM homeroom_handouts h
      JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL JOIN lessons l ON l.id=cl.lesson_id AND l.kind='story'
      JOIN lesson_steps s ON s.lesson_id=l.id AND s.kind='story' WHERE h.class_id=?`, classId).map(r => [r.id, { stepId: r.step_id, storyId: r.story_id }]));
}
/** Is this class lesson a Homeroom Reading handout? */
export const isReading = clId => !!q.get(`SELECT 1 FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id JOIN lessons l ON l.id=cl.lesson_id AND l.kind='story'
  WHERE h.class_lesson_id=?`, String(clId || ''));
const rowOf = (clId, userId) => q.get('SELECT * FROM homeroom_reading WHERE class_lesson_id=? AND user_id=?', clId, userId) || null;
function setRow(cl, userId, fields) {
  const t = now();
  q.run('INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, created_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_lesson_id, user_id) DO NOTHING', cl.id, cl.class_id, userId, t, t);
  const cols = Object.keys(fields);
  if (cols.length) q.run(`UPDATE homeroom_reading SET ${cols.map(k => `${k}=?`).join(', ')}, updated_at=? WHERE class_lesson_id=? AND user_id=?`, ...cols.map(k => fields[k]), t, cl.id, userId);
  return rowOf(cl.id, userId);
}
/** Where a student is in the routine: 'choose' (a free choice with no book yet) | 'read' | 'quiz' | 'notes' | 'done'. */
export function stepOf(row, book) {
  if (!book) return 'choose';
  if (!row || !row.read_at) return 'read';
  if (!row.quiz_at) return 'quiz';
  if (!row.notes_at) return 'notes';
  return 'done';
}
const marksRight = m => [...String(m || '')].filter(x => x === '1').length;
/** What a desk card (the teacher's board, the student's desk) says about one student's routine. */
function infoOf(rd, row) {
  const book = LIB.getBook(rd.storyId || (row && row.book_id) || '');
  const step = stepOf(row, book), quizDone = !!(row && row.quiz_at);
  return { any: !rd.storyId, book: bookCard(book), step, page: row && book ? Math.min(row.page, book.pages.length) : 0, pages: book ? book.pages.length : 0,
    ...(quizDone ? { right: marksRight(row.marks), total: String(row.marks || '').length } : {}), ...(row && row.notes_at && row.page_id ? { notes: row.page_id } : {}) };
}
/** How far along, for the card's bar: reading up to 60, the quiz to 80, the notes to 95, 100 when done. */
export function pctOfInfo(x) {
  if (x.step === 'done') return 100;
  if (x.step === 'notes') return 85;
  if (x.step === 'quiz') return 65;
  if (x.step === 'read' && x.pages) return Math.max(x.page ? 5 : 0, Math.min(60, Math.round((60 * x.page) / x.pages)));
  return 0;
}
/** Every student's routine on the class's Reading handouts: Map 'clId:userId' -> info (for HO.boardView / deskView). */
export function infosOf(classId, rds = readingOf(classId), userId = null) {
  const out = new Map(); if (!rds.size) return out;
  const rows = new Map(q.all(`SELECT * FROM homeroom_reading WHERE class_id=?${userId ? ' AND user_id=?' : ''}`, classId, ...(userId ? [userId] : [])).map(r => [`${r.class_lesson_id}:${r.user_id}`, r]));
  const ids = userId ? [userId] : H.studentsOf(classId).map(s => s.id);
  for (const [clId, rd] of rds) for (const id of ids) out.set(`${clId}:${id}`, infoOf(rd, rows.get(`${clId}:${id}`) || null));
  return out;
}

// ---------------------------------------------------------------- handing out
/**
 * Hand out Reading: { bookId ('' or none: "Read a book", their own choice), to, instructions, order, grade ('completion'
 * by default; 'score' is the quiz's % right; 'none'), dueAt, title (the free choice's name in the teacher's words) }.
 * The class's teachers only. A student never has the same book (or two free choices) open twice.
 * -> { ok, classLesson, book, students } | { ok: false, code, count? }
 */
export function handOutReading(u, c, { bookId = '', to, instructions = '', order = 'in', grade = 'completion', dueAt = null, title = 'Read a book' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!HO.GRADES.includes(grade)) return fail('badGrade');
  if (typeof instructions !== 'string' || instructions.trim().length > HO.INSTRUCTIONS_MAX) return fail('tooLong');
  const text = HO.cleanInstructions(instructions);
  const bad = textProblem(text); if (bad) return fail(bad);
  const book = bookId ? LIB.getBook(String(bookId)) : null;
  if (bookId && !book) return fail('pickBook');
  const who = HO.studentsFor(c, to); if (!who.ok) return who;
  if (HO.openCount(c.id) >= HO.HANDOUTS_MAX) return fail('tooManyHandouts');
  const story = book ? book.id : '', picks = L.picksIn(c.id);
  const same = [...readingOf(c.id)].filter(([, rd]) => rd.storyId === story).map(([id]) => id);
  const have = who.all.filter(sid => same.some(id => !picks.has(id) || picks.get(id).has(sid)));
  if (have.length) return fail('alreadyOnDesk', { count: have.length });
  const name = String(book ? book.title : title || 'Read a book').slice(0, 100);
  const made = L.createLesson(u, c.school_id, { title: name, kind: 'story' });
  if (!made.ok) return made;
  const stepId = uid(10);
  q.run('INSERT INTO lesson_steps(id, lesson_id, position, kind, title, body, game_id, minutes, created_at, story_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
    stepId, made.lesson.id, 0, 'story', name, text, null, 0, now(), story);
  const r = L.assign(u, c.id, made.lesson.id, { dueAt: dueAt || null, students: who.students });
  if (!r.ok) { L.deleteLesson(u, made.lesson.id); return r; }
  q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now());
  audit(u.id, 'homeroom.reading', c.id, { classLesson: r.classLesson.id, book: story || null, target: who.target, students: who.all.length, order, grade });
  return ok({ classLesson: r.classLesson, book, title: name, students: who.all.length });
}

// ---------------------------------------------------------------- the student's routine
/** The routine a student may work on: their own desk's card, open and not waiting; with its step and book. */
function routineOf(u, c, clId) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  const rd = readingOf(c.id).get(String(clId || ''));
  if (!rd) return fail('notFound');
  const card = HO.deskView(c, u).find(x => x.id === String(clId));
  if (!card) return fail('notFound');
  if (card.locked) return fail('later');
  const pc = P.context(u, String(clId), rd.stepId); if (!pc.ok) return pc;
  const row = rowOf(pc.cl.id, u.id), book = LIB.getBook(rd.storyId || (row && row.book_id) || '');
  return ok({ cl: pc.cl, step: pc.step, rd, row, book, card });
}
/** The quiz's items for this student: the kind they started on (a student keeps theirs), else what the book has now. */
const itemsFor = (row, book) => (row && row.quiz_src ? RQ.itemsOf(book, row.quiz_src) : null);
/**
 * What the reading layer shows: { id, title, instructions, any, book, step, page, pages, aloud, quiz: { n, marks,
 * solved } | null, notes: page id | null, grade }. Only this student's own.
 */
export function view(u, c, clId) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  const { row, book, card } = x, step = stepOf(row, book), items = itemsFor(row, book);
  const h = HO.handoutOf(c, x.cl.id);
  return ok({ id: x.cl.id, title: card.title, instructions: card.instructions || '', any: !x.rd.storyId, book: bookCard(book), step,
    page: row && book ? Math.min(row.page, book.pages.length) : 0, pages: book ? book.pages.length : 0, aloud: !!(row && row.aloud),
    quiz: items ? { n: items.length, marks: row.marks || '', solved: row.solved || '' } : null, notes: (row && row.page_id) || null, grade: h ? h.grade : 'completion' });
}
/** A free choice: the student picks their book (or another one, before they have started its quiz). */
export function choose(u, c, clId, bookId) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  if (x.rd.storyId) return fail('bookSet');
  const b = LIB.getBook(String(bookId || '')); if (!b) return fail('pickBook');
  if (x.row && x.row.quiz_src) return fail('quizStarted');
  setRow(x.cl, u.id, { book_id: b.id, page: 0, pages: b.pages.length, read_at: null, aloud: 0 });
  P.storyStep(u, x.cl.id, x.step.id, { bookId: b.id });
  audit(u.id, 'homeroom.readingBook', c.id, { classLesson: x.cl.id, book: b.id });
  return view(u, c, clId);
}
/** The reader turned to page n (1-based) and/or used Read to me: the furthest page is kept; the last page finishes Read. */
export function progress(u, c, clId, { page, aloud = false } = {}) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  if (!x.book) return fail('pickBook');
  const n = Math.max(0, Math.min(x.book.pages.length, Math.floor(Number(page) || 0)));
  const old = x.row || {};
  const furthest = Math.max(n, old.page || 0);
  const fields = { book_id: x.book.id, page: furthest, pages: x.book.pages.length, aloud: aloud || old.aloud ? 1 : 0 };
  if (!old.read_at && furthest >= x.book.pages.length) fields.read_at = now();
  setRow(x.cl, u.id, fields);
  P.storyStep(u, x.cl.id, x.step.id, { bookId: x.book.id, aloud: !!fields.aloud });
  return view(u, c, clId);
}
/** The quiz's questions (never the answers): the book's own, the AI's cached one, or written now (once per book). Only
 *  after the book was read. -> { ok, items: [{ q, choices, page }], marks, solved, source } */
export async function quiz(u, c, clId, opts = {}) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  if (!x.book) return fail('pickBook');
  if (!x.row || !x.row.read_at) return fail('readFirst');
  let items = itemsFor(x.row, x.book), src = x.row.quiz_src;
  if (!items || !items.length) {
    const made = await RQ.ensureQuiz(x.book, opts);
    items = made.items; src = made.source;
    if (!items.length) return fail('noQuiz');
    setRow(x.cl, u.id, { quiz_src: src, marks: '', solved: '' });
  }
  const r = rowOf(x.cl.id, u.id);
  return ok({ items: items.map(it => ({ q: it.q, choices: it.choices, page: it.page || null })), marks: r.marks || '', solved: r.solved || '', source: src, done: !!r.quiz_at });
}
/** An answer to question i, choice k: right or wrong (and the page to look at). The first try is the mark; done when
 *  every question is answered right. -> { ok, right, page, solved: [bool], done, right?, total? } */
export function answer(u, c, clId, i, k) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  if (!x.book || !x.row || !x.row.read_at) return fail('readFirst');
  const items = itemsFor(x.row, x.book); if (!items) return fail('noQuiz');
  if (!Number.isInteger(i) || i < 0 || i >= items.length || !Number.isInteger(k) || k < 0 || k >= items[i].choices.length) return fail('badRequest');
  const right = k === items[i].answer;
  const pad = s => String(s || '').padEnd(items.length, '-').slice(0, items.length);
  let marks = pad(x.row.marks), solved = pad(x.row.solved);
  if (marks[i] === '-') marks = marks.slice(0, i) + (right ? '1' : '0') + marks.slice(i + 1);
  if (right) solved = solved.slice(0, i) + '1' + solved.slice(i + 1);
  const done = !solved.includes('-');
  const r = setRow(x.cl, u.id, { marks, solved, ...(done && !x.row.quiz_at ? { quiz_at: now() } : {}) });
  return ok({ right, page: right ? null : items[i].page || null, solved: [...solved].map(s => s === '1'), done,
    ...(done ? { score: { right: marksRight(r.marks), total: items.length } } : {}) });
}
/** The 3 notes as they are stored on the notebook page: each prompt in bold, then the student's words. */
export function notesHtml(notes, labels) {
  return NOTES.map(k => `<p><b>${esc(labels[k])}</b></p>${String(notes[k]).split('\n').map(line => `<p>${esc(line) || '<br>'}</p>`).join('')}`).join('');
}
/**
 * The 3 notes: { happened, word, think }, each at most NOTE_MAX characters and none empty, saved as one page in the
 * student's notebook in this class's tab, titled with the book's name (any notes already on that page stay, after a
 * line). That finishes the routine: the class's row is done with the quiz's marks. labels: the prompts in the student's
 * language. -> { ok, page, tab, ...view }
 */
export function saveNotes(u, c, clId, notes = {}, labels = {}) {
  const x = routineOf(u, c, clId); if (!x.ok) return x;
  if (!x.book || !x.row || !x.row.quiz_at) return fail('quizFirst');
  if (x.row.notes_at) return fail('notesSaved');
  const clean = {};
  for (const k of NOTES) {
    const v = notes && typeof notes[k] === 'string' ? notes[k].replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim() : '';
    if (!v) return fail('noteEmpty', { note: k });
    if (v.length > NOTE_MAX) return fail('noteLong', { note: k });
    clean[k] = v;
  }
  if (!NB.canUse(u)) return fail('noNotebook');
  const pg = NB.handoutPage(u, c, x.cl.id, [{ id: x.cl.id, title: x.book.title }]);
  if (!pg.ok) return pg;
  // a free choice's page may have been made earlier under the handout's name ("Read a book"): it is the book's now
  q.run('UPDATE notebook_pages SET title=? WHERE id=? AND user_id=?', x.book.title.slice(0, NB.LIMITS.title), pg.page, u.id);
  const old = (q.get('SELECT body FROM notebook_pages WHERE id=?', pg.page) || {}).body || '';
  const saved = NB.savePage(u, pg.page, `${old ? `${old}<p><br></p>` : ''}${notesHtml(clean, labels)}`);
  if (!saved.ok) return saved;
  setRow(x.cl, u.id, { notes_at: now(), page_id: pg.page });
  const r = rowOf(x.cl.id, u.id);
  P.storyStep(u, x.cl.id, x.step.id, { bookId: x.book.id, done: true, marks: r.marks, aloud: !!r.aloud });
  audit(u.id, 'homeroom.readingNotes', c.id, { classLesson: x.cl.id });
  const v = view(u, c, clId);
  return ok({ ...v, page: pg.page, tab: pg.tab });
}

// ---------------------------------------------------------------- the teacher: the handout's results page
/** Every student's routine on one Reading handout, alphabetical (never ranked): [{ id, name, ...info, assigned }]. */
export function resultsOf(c, clId) {
  const rd = readingOf(c.id).get(String(clId || '')); if (!rd) return null;
  const infos = infosOf(c.id, new Map([[String(clId), rd]])), coll = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  return H.studentsOf(c.id).filter(s => L.assignedTo(String(clId), s.id)).sort((a, b) => coll.compare(a.name, b.name))
    .map(s => ({ id: s.id, name: s.name, ...infos.get(`${clId}:${s.id}`) }));
}

// ---------------------------------------------------------------- opening a Reading handout from anywhere else
// The To do list and the lesson page: a student of the class with a desk goes to their desk, where the routine opens.
L.onStoryOpen((u, cl) => {
  if (!u || !cl || !isReading(cl.id)) return null;
  const c = S.getClass(cl.class_id);
  if (H.canUseDesk(u, c)) return `/class/${c.id}/desk#read=${encodeURIComponent(cl.id)}`;
  return S.canManageClass(u, c) ? `/class/${c.id}/progress/${encodeURIComponent(cl.id)}` : null;
});

// ---------------------------------------------------------------- leaving, deleting, merging
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (!userId) q.run('DELETE FROM homeroom_reading WHERE class_id=?', classId);
  else q.run('DELETE FROM homeroom_reading WHERE class_id=? AND user_id=?', classId, userId);
});
S.onAccountMerge(({ from, into } = {}) => {
  if (!from || !into) return;
  q.run('UPDATE OR IGNORE homeroom_reading SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM homeroom_reading WHERE user_id=?', from);
});
