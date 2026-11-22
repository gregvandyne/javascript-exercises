// Mistake Hunt: a passage set handed in for a grade (docs/decisions.md "Mistake Hunt, Phase 2"). "Assign to class" with
// "Hand in for a grade" makes a lesson of kind 'proofread' with one lesson step of kind 'proofread' (lessons.PROOF_KIND),
// assigned with its open and due dates, the way Figures' Assign does (services/figures-steps.js, whose answer rules this
// reuses: handedIn, dueOver, reveals).
//
// The step keeps a snapshot (lesson_steps.items): the passages as the teacher saved them, each { t, x (the correct
// text), g, m: [{ a, b, w, k, y }] (the mistakes, their keys and why lines) }, and the set's "what students are told"
// (tell). Editing or deleting the set later never changes work a class was given.
//
// Students open the step in the game (/play/mistake-hunt?lesson=&step=): the frame gets only the words students see
// (the passage with its mistakes in it, no mistake marks), never the correct text, the keys or the why lines, until the
// teacher's "Show answers after the due date" holds, the due date is over and that student has handed in. Save keeps
// their fixes (step_progress.answer: a JSON list a passage of [{ a, b, s }] over those words); Hand in (final) marks
// each mistake once with proof-core's checker, the same rules as the game: step_progress.marks one character a mistake
// in reading order ('1' found, '0' missed), score = the share of mistakes found (%), label 'proofread'. Changing words
// that were right costs nothing (as in the game): the count is shown to the teacher, never taken off the score.
import { q, tx, audit } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as FS from './figures-steps.js';
import * as gameSets from './game-sets.js';
import * as games from './games.js';
import { proofCore } from './proof-core.js';
import { cleanText } from './textfilter.js';
import { tEn } from '../i18n/index.js';

export const PROOF_KIND = L.PROOF_KIND;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
export const EDIT_LIMITS = { perPassage: 200, chars: 80 };
export const SLUG = 'mistake-hunt';

/** The official Mistake Hunt game row, or null. */
export const proofGame = () => { const g = games.getGameBySlug(SLUG); return g && g.source === 'seed' ? g : null; };

// ---------------------------------------------------------------- snapshot and assign
/** A set's passages as a step keeps them: [{ t, x, g, m: [{ a, b, w, k, y? }] }] and tell. */
export function snapshotOf(items) {
  const passages = items.map(it => ({ t: it.t || '', x: it.x, g: it.g, m: it.m.map(m => ({ a: m.a, b: m.b, w: m.w, k: m.k, ...(m.y ? { y: m.y } : {}) })) }));
  const o = (items[0] && items[0].o) || {};
  return { tell: o.n === 'type' || o.n === 'none' ? o.n : 'total', passages };
}
/** The teacher's own saved set, or null. */
export function ownSet(u, setId) {
  const g = proofGame(); if (!g || !u) return null;
  const s = gameSets.get(g.id, String(setId || ''));
  return s && s.ownerId === u.id ? s : null;
}
const day = v => { if (v === null || v === undefined || v === '') return null; const s = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; const t = Date.parse(`${s}T00:00:00Z`); return Number.isFinite(t) ? t : undefined; };
/** Who may assign: school staff (Mistake Hunt and Assign are free, like Crossword). */
export const canAssign = u => !!u && !u.is_guest && !u.banned && S.isSchoolStaff(u);
/** Classes a teacher can assign a set to: the ones they teach (not archived). */
export const classesFor = u => (canAssign(u) ? S.classesOf(u.id, 'teacher').filter(c => !c.archived_at) : []);
/**
 * Assign a passage set to one of the teacher's classes for a grade: a lesson "<set title>" (kind 'proofread') with one
 * proofread step (the snapshot), assigned with its dates. showAnswers: the fixes and why lines after the due date (needs
 * one). -> { ok, lesson, classLesson, step, class } | { ok: false, code: notFound | noClass | badDate | dueBeforeOpen | needsDue }
 */
export function assignSet(u, setId, classId, { opensAt = null, dueAt = null, showAnswers = false } = {}) {
  if (!canAssign(u)) return fail('notFound');
  const s = ownSet(u, setId); if (!s || !Array.isArray(s.items) || !s.items.length) return fail('notFound');
  const c = S.getClass(String(classId || ''));
  if (!c || c.archived_at || !S.teaches(u, c.id) || !S.isStaff(u)) return fail('noClass');
  const o = day(opensAt), d = day(dueAt);
  if (o === undefined || d === undefined) return fail('badDate');
  if (o !== null && d !== null && d < o) return fail('dueBeforeOpen');
  if (showAnswers && d === null) return fail('needsDue');
  const snap = snapshotOf(s.items);
  const title = (s.title || s.items[0].t || tEn('proof.assign.untitled')).slice(0, 100);
  const grade = Number.isInteger(s.items[0].g) ? (s.items[0].g === 0 ? 'K' : String(s.items[0].g)) : '';
  try { return tx(() => {
    const made = L.createLesson(u, c.school_id, { title, kind: PROOF_KIND, subject: '', grade });
    if (!made.ok) throw Object.assign(new Error('lesson'), { r: made });
    const step = L.addProofStep(u, made.lesson.id, { title, setId: s.id, items: snap, showAnswers });
    if (!step.ok) throw Object.assign(new Error('step'), { r: step });
    const a = L.assign(u, c.id, made.lesson.id, { opensAt: o === null ? null : new Date(o).toISOString().slice(0, 10), dueAt: d === null ? null : new Date(d).toISOString().slice(0, 10) });
    if (!a.ok) throw Object.assign(new Error('assign'), { r: a });
    audit(u.id, 'proof.assign', c.id, { set: s.id, lesson: made.lesson.id, passages: snap.passages.length, show: !!showAnswers });
    return ok({ lesson: L.getLesson(made.lesson.id), classLesson: a.classLesson, step: step.step, class: c });
  }); } catch (e) { if (e && e.r) return e.r; throw e; }
}

// ---------------------------------------------------------------- reading a step
/** The step's snapshot: { tell, passages } (empty passages when unreadable). */
export function snapOf(step) {
  let x = null; try { x = JSON.parse((step && step.items) || 'null'); } catch { x = null; }
  if (!x || typeof x !== 'object' || !Array.isArray(x.passages)) return { tell: 'total', passages: [] };
  return { tell: x.tell === 'type' || x.tell === 'none' ? x.tell : 'total', passages: x.passages.filter(p => p && typeof p.x === 'string' && Array.isArray(p.m)) };
}
/** Every mistake in marking order: [{ p (passage), j (index in its m), k, cc, g }]. */
export function mistakesOf(snap) {
  const P = proofCore(), out = [];
  snap.passages.forEach((p, i) => p.m.forEach((m, j) => out.push({ p: i, j, k: m.k, cc: P.BY[m.k] ? P.BY[m.k].cc : '', g: P.BY[m.k] ? P.BY[m.k].g : '' })));
  return out;
}
/** The Common Core codes of each mistake, in marking order (the class Standards tab: services/standards-ccss.js). */
export const codesOf = step => mistakesOf(snapOf(step)).map(x => x.cc);
/** A student's fixes, one list a passage ([] where none). */
export function editsOf(row, n) {
  let a = []; try { a = JSON.parse((row && row.answer) || '[]'); } catch { a = []; }
  if (!Array.isArray(a)) a = [];
  return Array.from({ length: n }, (_, i) => (Array.isArray(a[i]) ? a[i] : []));
}
export const handedIn = FS.handedIn;
export const dueOver = FS.dueOver;
export const reveals = FS.reveals;

/**
 * Fixes as a student sends them: a list a passage of [{ a, b, s }] over the words students see. Each fix inside the
 * passage, at most 6 words wide, s at most 80 characters through the site's text filter (a student can't use a passage
 * to post words to a class), no overlaps. -> { ok, edits } | { ok: false, code: 'badRequest' | 'words' }
 */
export function cleanEdits(step, raw) {
  const P = proofCore(), snap = snapOf(step);
  if (!Array.isArray(raw) || raw.length > snap.passages.length) return fail('badRequest');
  const out = [];
  for (let i = 0; i < snap.passages.length; i++) {
    const list = raw[i] === undefined || raw[i] === null ? [] : raw[i];
    if (!Array.isArray(list) || list.length > EDIT_LIMITS.perPassage) return fail('badRequest');
    const n = P.wrongTokens(snap.passages[i].x, snap.passages[i].m).length, mine = [];
    for (const e of list) {
      if (!e || typeof e !== 'object' || !Number.isInteger(e.a) || !Number.isInteger(e.b) || typeof e.s !== 'string') return fail('badRequest');
      if (e.a < 0 || e.b > n || e.b <= e.a || e.b - e.a > 6 || e.s.length > EDIT_LIMITS.chars) return fail('badRequest');
      const s = e.s.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
      if (s && !cleanText(s, EDIT_LIMITS.chars).ok) return fail('words');
      if (mine.some(o => e.a < o.b && o.a < e.b)) return fail('badRequest');
      mine.push({ a: e.a, b: e.b, s });
    }
    out.push(mine.sort((p, q2) => p.a - q2.a));
  }
  return ok({ edits: out });
}
/** Mark every passage once: { marks ('1'/'0' a mistake, in reading order), found, total, score (%), changed (correct
 *  words changed), per: [{ found: [j], missed: [j], changed: n }] }. */
export function markAll(step, edits) {
  const P = proofCore(), snap = snapOf(step);
  let marks = '', found = 0, total = 0, changed = 0;
  const per = snap.passages.map((p, i) => {
    const r = P.check(p.x, p.m, edits[i] || []);
    p.m.forEach((_, j) => { const f = r.found.includes(j); marks += f ? '1' : '0'; found += f ? 1 : 0; total++; });
    changed += r.changed.length;
    return { found: r.found, missed: r.missed, changed: r.changed.length };
  });
  return { marks, found, total, score: total ? Math.round((100 * found) / total) : 0, changed, per };
}

// ---------------------------------------------------------------- for the game and pages
/**
 * One proofread step as a student (or the teacher's preview) sees it. Before answers are allowed the passages carry
 * only the words students see ([s, sp] pairs: no mistake marks, no correct text, no keys, no why lines).
 * -> { title, tell, passages: [{ t, w: [[s, sp]], n, groups? }], edits, handedIn, revealed, found, total, score,
 *      results?: [{ found, total, good: [word index], oops: [word index] }] (after handing in),
 *      key?: [{ x, m: [{ a, b, w, k, y }], found: [j] }] (only once revealed) }
 */
export function viewFor(step, cl, row, { teacher = false, t } = {}) {
  const P = proofCore(), snap = snapOf(step), done = handedIn(row);
  const revealed = teacher || reveals(step, cl, row, t);
  const edits = editsOf(row, snap.passages.length);
  const view = {
    title: step.title || '', tell: snap.tell, handedIn: done, revealed, edits,
    passages: snap.passages.map(p => {
      const w = P.wrongTokens(p.x, p.m).map(x => [x.s, x.sp]);
      return { t: p.t || '', w, n: p.m.length, ...(snap.tell === 'type' ? { groups: P.byGroup(p.m) } : {}) };
    }),
    total: snap.passages.reduce((n, p) => n + p.m.length, 0), found: 0, score: done ? row.score : null,
  };
  if (done) {
    const r = markAll(step, edits);
    view.found = r.found;
    view.results = snap.passages.map((p, i) => {
      const W = P.wrongTokens(p.x, p.m), E = edits[i], start = j => { const e = E.find(x => j >= x.a && j < x.b); return e ? e.a : j; };
      const good = [...new Set(r.per[i].found.flatMap(mi => W.map((x, j) => (x.m === mi ? start(j) : -1)).filter(j => j >= 0)))];
      const oops = [...new Set(P.check(p.x, p.m, E).changed.map(c => start(c.a)))];
      return { found: r.per[i].found.length, total: p.m.length, good, oops };
    });
  }
  if (revealed) {
    const r = done ? markAll(step, edits) : null;
    view.key = snap.passages.map((p, i) => ({ x: p.x, m: p.m.map(m => ({ a: m.a, b: m.b, w: m.w, k: m.k, ...(m.y ? { y: m.y } : {}) })), found: r ? r.per[i].found : [] }));
  }
  return view;
}

// ---------------------------------------------------------------- teachers
/** Per kind of mistake, across the students who handed in: [{ k, cc, found, missed }] (counts only, never a ranking),
 *  in the order the kinds first appear. Also { handed, foundPct } for the whole class. */
export function typeTotals(step, rows) {
  const ms = mistakesOf(snapOf(step)), by = new Map();
  let handed = 0, found = 0, all = 0;
  for (const r of rows) {
    if (!handedIn(r)) continue;
    handed++;
    ms.forEach((m, i) => {
      if (!by.has(m.k)) by.set(m.k, { k: m.k, cc: m.cc, found: 0, missed: 0 });
      const f = r.marks[i] === '1'; by.get(m.k)[f ? 'found' : 'missed']++; found += f ? 1 : 0; all++;
    });
  }
  return { kinds: [...by.values()], handed, foundPct: all ? Math.round((100 * found) / all) : null };
}
/** A student's handed-in result for the teacher: { found, total, changed, score } or null. */
export function resultOf(step, row) {
  if (!handedIn(row)) return null;
  const snap = snapOf(step), r = markAll(step, editsOf(row, snap.passages.length));
  return { found: r.found, total: r.total, changed: r.changed, score: row.score };
}
