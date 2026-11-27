// Oomba's action cards for the things a teacher made: Figures worksheets, Manipulatives boards and lessons in their
// library (registry: ./index.js; helpers: ./shared.js). Their strings are with the assignments' cards
// (js.companion.act.assignments.*: area 'assignments'). Each calls the same service as the page's own route:
// routes/figures.js (rename, delete a worksheet), routes/manipulatives.js (rename, duplicate, delete a board) and
// routes/lessons.js (copy, delete a lesson). A delete can't be undone from the chat (none of them has a restore).
import * as F from '../figures.js';
import * as M from '../manipulatives.js';
import * as L from '../lessons.js';
import { no, clean, ownIn, ownLessons, P } from './shared.js';

const AREA = 'assignments';
const WORKSHEET = P('Words of the worksheet\'s title, or its id (findMyPages kind figures-sheet). Leave out on the worksheet\'s own page.');
const BOARD = P('Words of the board\'s title, or its id (findMyPages kind manip). Leave out on the board\'s own page.');
const LESSON = P('Words of the lesson\'s title as the teacher wrote them.');
const TITLE = P('The new title (never a student\'s name).');
const sheetHere = ctx => (ctx.page && ctx.page.type === 'figures-sheet' ? ctx.page.sheetId : '');
const boardHere = ctx => (ctx.page && ctx.page.type === 'manip' ? ctx.page.boardId : '');
/** One of the teacher's worksheets or tests. -> { it } | { error } */
function sheetIn(u, ctx, ref) {
  if (!F.canMake(u)) return no('Figures is not available for this account.');
  return ownIn(ctx, F.listWorksheets(u), ref, 'worksheet', sheetHere(ctx));
}
/** One of the teacher's boards (saved templates and recent boards). -> { it } | { error } */
function boardIn(u, ctx, ref) {
  if (!M.canHost(u)) return no('Manipulatives is not available for this account.');
  return ownIn(ctx, [...M.listBoards(u, { all: true }), ...M.listRecent(u)], ref, 'board', boardHere(ctx));
}
/** A new title from the AI, checked with the page's own word rules (problem: the service's textProblem). -> { title } | { error } */
function titleIn(ctx, raw, old, problem, n = 80) {
  const v = clean(ctx, raw, n);
  if (!v) return no('Say the new title.');
  if (/\[student/i.test(v)) return no('A title cannot be a student.');
  if (problem(v)) return no('That title cannot be used.');
  if (v === old) return no('It already has that title.');
  return { title: v };
}
const sheetLink = (id, t) => ({ href: `/figures/worksheets/${encodeURIComponent(id)}`, label: t('js.companion.act.assignments.made.openSheet'), primary: true });
const boardLink = (id, t) => ({ href: `/manipulatives#board/${encodeURIComponent(id)}`, label: t('js.companion.act.assignments.made.openBoard'), primary: true });
const lessonLink = (id, t) => ({ href: `/teach/lessons/${encodeURIComponent(id)}`, label: t('js.companion.act.assignments.made.openLesson'), primary: true });

export default [
  // POST /api/figures/worksheets/:id: F.updateWorksheet { title }. Undo: the old title, while it still has Oomba's.
  {
    id: 'renameWorksheet', area: AREA, risk: 'normal', undoable: true,
    label: 'Rename one of the teacher\'s Figures worksheets or tests.',
    params: { worksheet: WORKSHEET, title: TITLE },
    plan(u, ctx, p) {
      const w = sheetIn(u, ctx, p.worksheet); if (!w.it) return w;
      const n = titleIn(ctx, p.title, w.it.title, F.textProblem); if (n.error) return n;
      return { data: { sheetId: w.it.id, old: w.it.title, title: n.title }, ai: `Rename the worksheet "${clean(ctx, w.it.title)}" to "${n.title}".` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.renameSheet', { old: d.old, title: d.title }), lines: [] }),
    run(u, d) {
      const r = F.updateWorksheet(u, d.sheetId, { title: d.title }); if (!r.ok) return r;
      const back = F.ownWorksheet(u, d.sheetId);
      return { ok: true, landed: !!back && back.title === d.title, done: { sheetId: d.sheetId, title: back ? back.title : d.title }, undo: { sheetId: d.sheetId, old: d.old, title: d.title } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.renamedSheet', { title: d.title })], links: [sheetLink(d.sheetId, t)] }),
    undo(u, d) {
      const w = F.ownWorksheet(u, d.sheetId); if (!w || w.title !== d.title) return { ok: true, skipped: 1 };
      const r = F.updateWorksheet(u, w.id, { title: d.old });
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/figures/worksheets/:id/delete: F.deleteWorksheet (gone for good; lessons already assigned keep their
  // own copy of the questions).
  {
    id: 'deleteWorksheet', area: AREA, risk: 'delete', warn: 'deleteSheet', undoable: false,
    label: 'Delete one of the teacher\'s Figures worksheets or tests for good (lessons already assigned keep their questions).',
    params: { worksheet: WORKSHEET },
    plan(u, ctx, p) {
      const w = sheetIn(u, ctx, p.worksheet); if (!w.it) return w;
      return { data: { sheetId: w.it.id, title: w.it.title }, ai: `Delete the worksheet "${clean(ctx, w.it.title)}" for good.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.deleteSheet', { title: d.title }), lines: [] }),
    run(u, d) {
      const r = F.deleteWorksheet(u, d.sheetId); if (!r.ok) return r;
      return { ok: true, landed: !F.ownWorksheet(u, d.sheetId), done: { title: d.title } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.deletedSheet', { title: d.title })], links: [{ href: '/figures', label: t('js.companion.act.assignments.made.allSheets') }] }),
  },

  // POST /api/manipulatives/boards/:id/rename: M.renameBoard. Undo: the old title, while it still has Oomba's.
  {
    id: 'renameBoard', area: AREA, risk: 'normal', undoable: true,
    label: 'Rename one of the teacher\'s Manipulatives boards.',
    params: { board: BOARD, title: TITLE },
    plan(u, ctx, p) {
      const b = boardIn(u, ctx, p.board); if (!b.it) return b;
      const n = titleIn(ctx, p.title, b.it.title, M.textProblem, M.LIMITS.titleChars); if (n.error) return n;
      return { data: { boardId: b.it.id, old: b.it.title, title: n.title }, ai: `Rename the board "${clean(ctx, b.it.title)}" to "${n.title}".` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.renameBoard', { old: d.old, title: d.title }), lines: [] }),
    run(u, d) {
      const r = M.renameBoard(u, d.boardId, d.title); if (!r.ok) return r;
      const back = M.ownBoard(u, d.boardId);
      return { ok: true, landed: !!back && back.title === d.title, done: { boardId: d.boardId, title: back ? back.title : d.title }, undo: { boardId: d.boardId, old: d.old, title: d.title } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.renamedBoard', { title: d.title })], links: [boardLink(d.boardId, t)] }),
    undo(u, d) {
      const b = M.ownBoard(u, d.boardId); if (!b || b.title !== d.title) return { ok: true, skipped: 1 };
      const r = M.renameBoard(u, b.id, d.old);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/manipulatives/boards/:id/duplicate: M.duplicateBoard ("<title> (copy)"). Undo: the copy goes, while it
  // is as it was made.
  {
    id: 'duplicateBoard', area: AREA, risk: 'normal', undoable: true,
    label: 'Make a copy of one of the teacher\'s Manipulatives boards ("<title> (copy)").',
    params: { board: BOARD },
    plan(u, ctx, p) {
      const b = boardIn(u, ctx, p.board); if (!b.it) return b;
      return { data: { boardId: b.it.id, title: b.it.title }, ai: `Make a copy of the board "${clean(ctx, b.it.title)}".` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.copyBoard', { title: d.title }), lines: [] }),
    run(u, d) {
      const r = M.duplicateBoard(u, d.boardId); if (!r.ok) return r;
      const back = M.ownBoard(u, r.board.id), from = M.ownBoard(u, d.boardId);
      return { ok: true, landed: !!back && !!from && back.state === from.state && back.tool === from.tool, done: { boardId: r.board.id, title: r.board.title }, undo: { boardId: r.board.id, at: back ? back.updated_at : 0 } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.copiedBoard', { title: d.title })], links: [boardLink(d.boardId, t)] }),
    undo(u, d) {
      const b = M.ownBoard(u, d.boardId); if (!b || b.updated_at !== d.at) return { ok: true, skipped: 1 };
      const r = M.deleteBoard(u, b.id);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/manipulatives/boards/:id/delete: M.deleteBoard (gone for good, with its Oomba chat).
  {
    id: 'deleteBoard', area: AREA, risk: 'delete', warn: 'deleteBoard', undoable: false,
    label: 'Delete one of the teacher\'s Manipulatives boards for good.',
    params: { board: BOARD },
    plan(u, ctx, p) {
      const b = boardIn(u, ctx, p.board); if (!b.it) return b;
      return { data: { boardId: b.it.id, title: b.it.title }, ai: `Delete the board "${clean(ctx, b.it.title)}" for good.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.deleteBoard', { title: d.title }), lines: [] }),
    run(u, d) {
      const r = M.deleteBoard(u, d.boardId); if (!r.ok) return r;
      return { ok: true, landed: !M.ownBoard(u, d.boardId), done: { title: d.title } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.deletedBoard', { title: d.title })], links: [{ href: '/manipulatives/boards', label: t('js.companion.act.assignments.made.allBoards') }] }),
  },

  // POST /api/lessons/:id/copy: L.copyLesson (next to the original, "<title> (2)"). Undo: the copy goes, while it is
  // as it was made and in no class.
  {
    id: 'duplicateLesson', area: AREA, risk: 'normal', undoable: true,
    label: 'Make a copy of one of the teacher\'s own lessons (in their lesson library, next to it).',
    params: { lesson: LESSON },
    plan(u, ctx, p) {
      const l = ownIn(ctx, ownLessons(u), p.lesson, 'lesson'); if (!l.it) return l;
      return { data: { lessonId: l.it.id, title: l.it.title }, ai: `Make a copy of the lesson "${clean(ctx, l.it.title)}".` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.made.copyLesson', { title: d.title }), lines: [] }),
    run(u, d) {
      const r = L.copyLesson(u, d.lessonId); if (!r.ok) return r;
      const back = L.getLesson(r.lesson.id);
      return { ok: true, landed: !!back && back.copied_from === d.lessonId && L.steps(back.id).length === L.steps(d.lessonId).length, done: { lessonId: back.id, title: back.title }, undo: { lessonId: back.id, at: back.updated_at } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.copiedLesson', { title: d.title })], links: [lessonLink(d.lessonId, t)] }),
    undo(u, d) {
      const l = L.getLesson(d.lessonId);
      if (!l || l.updated_at !== d.at || L.lessonClassCount(l.id) || L.lessonWork(l.id)) return { ok: true, skipped: 1 };
      const r = L.deleteLesson(u, l.id);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/lessons/:id/delete: L.deleteLesson (gone for good, with its assignments to classes and the students'
  // work in them). The card says how many classes have it and how many students have work in it.
  {
    id: 'deleteLesson', area: AREA, risk: 'delete', warn: 'deleteLesson', undoable: false,
    label: 'Delete one of the teacher\'s own lessons for good, with its assignments to classes and the students\' work in them.',
    params: { lesson: LESSON },
    plan(u, ctx, p) {
      const l = ownIn(ctx, ownLessons(u), p.lesson, 'lesson'); if (!l.it) return l;
      const classes = L.lessonClassCount(l.it.id), work = L.lessonWork(l.it.id);
      return { data: { lessonId: l.it.id, title: l.it.title, schoolId: l.it.school_id }, ai: `Delete the lesson "${clean(ctx, l.it.title)}" for good (assigned to ${classes} classes; ${work} students have work in it).` };
    },
    view(u, d, t) {
      const classes = L.lessonClassCount(d.lessonId), work = L.lessonWork(d.lessonId);
      return { title: t('js.companion.act.assignments.made.deleteLesson', { title: d.title }), lines: [classes ? t('js.companion.act.assignments.made.inClasses', { count: classes }) : '', work ? t('js.companion.act.assignments.made.withWork', { count: work }) : ''].filter(Boolean) };
    },
    run(u, d) {
      const r = L.deleteLesson(u, d.lessonId); if (!r.ok) return r;
      return { ok: true, landed: !L.getLesson(d.lessonId), done: { title: d.title, schoolId: d.schoolId } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.made.deletedLesson', { title: d.title })], links: [{ href: `/teach/lessons?school=${encodeURIComponent(d.schoolId || '')}`, label: t('js.companion.act.assignments.made.allLessons') }] }),
  },
];
