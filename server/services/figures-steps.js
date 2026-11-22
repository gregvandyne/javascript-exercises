// Figures: Assign to class (docs/decisions.md "Figures: Assign to class"). A Figures worksheet goes to a class through
// the lessons flow, the way a live question set goes as homework (classlive-sets.homework): a lesson of kind 'figures'
// in the teacher's library with one lesson step of kind 'figures', assigned to the class with its open and due dates.
//
// The step keeps a snapshot of the worksheet (lesson_steps.items, of_version), so editing or deleting the worksheet
// later never changes work a class has been given. Each snapshot question:
//   { kind, data, hide, question, answer (the answer as the key shows it), unit, value, dp, work, type, choices? }
// type 'number' (a snapshot from before answer types has none: a number) or 'choice': choices are the options in the
// order every student sees them, and value is the index of the right one.
// Students type a number (any sign) in a blank under each figure, or pick one option (step_progress.answer: a JSON list
// of what they typed, a choice as its option's index, "0" for the first). Save keeps it; Hand in marks it once (step_progress.marks '1'/'0' per question, score = % right, label 'figures') and the step is
// done, scored like a quiz step in the gradebook and the Score.
//
// Who can do what:
//   a Figures tester (services/figures.js canMake) who teaches the class   assign their own worksheet
//   the class's managers                                                   see answers, turn "Show answers" on or off
//   the class's students                                                   answer and hand in (no tester list here: the
//                                                                          step exists only because a tester assigned it)
// The answers never reach a student's page before they are allowed: the server leaves out answer, value, the right
// option and worked lines (a choice question's options are sent, in their fixed order, never which one is right), and sends each figure as an SVG drawn here with the hidden parts left out and the figure's data-* attributes
// (some carry values) removed, never the figure's data (which holds the answer for many kinds, a ruler's reading say).
// A student sees the answers and worked lines only when the teacher turned on "Show answers after the due date", the
// due date is over (the school's time zone: lessons.lateFrom) and that student has handed in.
import { q, now, tx, audit } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as F from './figures.js';
import { tEn } from '../i18n/index.js';

export const FIGURES_KIND = L.FIGURES_KIND;
const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
export const ANSWER_CHARS = 40;

// ---------------------------------------------------------------- snapshot and assign
/** The worksheet's questions as a step keeps them, or a failure: notFound (not the teacher's worksheet), empty, or
 *  noAnswer (questions: the numbers of the questions without an answer). */
export function snapshot(u, worksheetId) {
  const w = F.ownWorksheet(u, worksheetId); if (!w) return fail('notFound');
  const items = F.itemsOf(w.id);
  if (!items.length) return fail('empty');
  const out = [], missing = [];
  items.forEach((it, i) => {
    const a = F.answerOf(it, w.of_version);
    if (!a) { missing.push(i + 1); return; }
    const choice = a.type === 'choice';
    out.push({ kind: it.kind, data: it.data, hide: it.hide, question: it.question, answer: choice ? F.choiceText(a.choices, a.value) : it.answer, unit: a.unit || '', value: a.value, dp: Math.max(0, Math.min(6, a.dp | 0)), work: Array.isArray(it.work) ? it.work.slice(0, 8) : [],
      type: choice ? 'choice' : 'number', ...(choice ? { choices: a.choices } : {}),
      // Where it came from, for "Edit questions" on a lesson's Figure step (F.fromSnapshot); never sent to a student.
      gen: it.gen || null, seed: it.seed || null, answerKey: it.answerKey || null });
  });
  if (missing.length) return fail('noAnswer', { questions: missing });
  return ok({ worksheet: w, items: out });
}
const day = v => { if (v === null || v === undefined || v === '') return null; const s = String(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined; const t = Date.parse(`${s}T00:00:00Z`); return Number.isFinite(t) ? t : undefined; };
/** Classes a teacher can assign a worksheet to: the ones they teach (not archived), as staff of a school. */
export const classesFor = u => (F.canMake(u) && S.isStaff(u) ? S.classesOf(u.id, 'teacher').filter(c => !c.archived_at) : []);
/**
 * Assign a worksheet to one of the teacher's classes: a lesson "<worksheet title>" (kind 'figures') with one figures
 * step (the snapshot), assigned with its dates. showAnswers: answers and worked lines after the due date (needs one).
 * -> { ok, lesson, classLesson, step } | { ok: false, code }
 */
export function assignWorksheet(u, worksheetId, classId, { opensAt = null, dueAt = null, showAnswers = false } = {}) {
  if (!F.canMake(u)) return fail('notFound');
  const snap = snapshot(u, worksheetId); if (!snap.ok) return snap;
  const c = S.getClass(String(classId || ''));
  if (!c || c.archived_at || !S.teaches(u, c.id) || !S.isStaff(u)) return fail('noClass');
  const o = day(opensAt), d = day(dueAt);
  if (o === undefined || d === undefined) return fail('badDate');
  if (o !== null && d !== null && d < o) return fail('dueBeforeOpen');
  if (showAnswers && d === null) return fail('needsDue');
  const w = snap.worksheet;
  try { return tx(() => {
    const made = L.createLesson(u, c.school_id, { title: w.title || tEn('figures.sheet.untitled'), kind: 'figures', subject: '', grade: w.grade || '' });
    if (!made.ok) throw Object.assign(new Error('lesson'), { r: made });
    const step = L.addFiguresStep(u, made.lesson.id, { title: w.title, setId: w.id, items: snap.items, ofVersion: w.of_version, showAnswers });
    if (!step.ok) throw Object.assign(new Error('step'), { r: step });
    const a = L.assign(u, c.id, made.lesson.id, { opensAt: o === null ? null : new Date(o).toISOString().slice(0, 10), dueAt: d === null ? null : new Date(d).toISOString().slice(0, 10) });
    if (!a.ok) throw Object.assign(new Error('assign'), { r: a });
    audit(u.id, 'figures.assign', c.id, { worksheet: w.id, lesson: made.lesson.id, items: snap.items.length, show: !!showAnswers });
    return ok({ lesson: made.lesson, classLesson: a.classLesson, step: step.step });
  }); } catch (e) { if (e && e.r) return e.r; throw e; }
}

// ---------------------------------------------------------------- a lesson's Figure step (the lesson editor)
// "Figure questions" is a step kind the lesson editor offers to Figures testers (the same gate as /figures: F.canMake,
// the one place to open it to everyone). Its questions are edited in the Figures builder as a question set of purpose
// 'lesson' (question_sets.lesson_id names the lesson); "Save to lesson" snapshots them into the step exactly as Assign
// does, so the student page, marking, the gradebook and print are the same. A step whose students have started cannot
// have its questions changed (their marks would no longer match): the teacher makes a copy of the lesson instead.
const ownLessonSet = (u, setId, lessonId) => { const w = F.ownWorksheet(u, setId); return w && w.purpose === 'lesson' && w.lesson_id === lessonId ? w : null; };
/** A new lesson set for a Figure step being added (from the step form). -> { ok, id } */
export function newLessonSet(u, lessonId, { title = '' } = {}) {
  const l = L.getLesson(lessonId);
  if (!F.canMake(u) || !L.canEditLesson(u, l)) return fail('notFound');
  return F.createWorksheet(u, { title: title || l.title, grade: l.grade, purpose: 'lesson', lessonId: l.id });
}
/** "Edit questions" on a Figure step: the set its questions are edited in, the step's own lesson set if it still
 *  matches, else a new one made from the step's snapshot (a worksheet's Assign step, a copied lesson). -> { ok, id } */
export function editStepSet(u, stepId) {
  const s = L.getStep(stepId), l = s && L.getLesson(s.lesson_id);
  if (!F.canMake(u) || !s || s.kind !== FIGURES_KIND || !L.canEditLesson(u, l)) return fail('notFound');
  const own = s.set_id ? ownLessonSet(u, s.set_id, l.id) : null;
  if (own) return ok({ id: own.id });
  const items = itemsOf(s).map(it => F.fromSnapshot(it, s.of_version));
  const r = F.createWorksheet(u, { title: s.title || l.title, grade: l.grade, purpose: 'lesson', lessonId: l.id, items: [] });
  if (!r.ok) return r;
  for (const raw of items) { const c = F.addItem(u, r.id, raw); if (!c.ok) F.addItem(u, r.id, F.starterItem(raw.kind) || raw); }
  q.run('UPDATE lesson_steps SET set_id=? WHERE id=?', r.id, s.id);
  return ok({ id: r.id });
}
/** "Save to lesson": the lesson set's questions as they are now become its Figure step (a new step the first time,
 *  else that step's snapshot is replaced). Every question needs an answer, and a step students have started is kept.
 *  -> { ok, lesson, step } | { ok: false, code: notFound | empty | noAnswer (questions) | started } */
export function saveToLesson(u, setId) {
  const w = F.ownWorksheet(u, setId); if (!w || w.purpose !== 'lesson') return fail('notFound');
  const l = L.getLesson(w.lesson_id); if (!L.canEditLesson(u, l)) return fail('notFound');
  const snap = snapshot(u, w.id); if (!snap.ok) return snap;
  const step = q.get('SELECT * FROM lesson_steps WHERE lesson_id=? AND set_id=? AND kind=?', l.id, w.id, FIGURES_KIND);
  if (step) {
    if (L.stepWork(step.id)) return fail('started');
    q.run('UPDATE lesson_steps SET items=?, of_version=?, title=? WHERE id=?', JSON.stringify(snap.items), w.of_version, step.title || w.title, step.id);
    q.run('UPDATE lessons SET updated_at=? WHERE id=?', now(), l.id);
    audit(u.id, 'figures.lessonStep.save', l.id, { step: step.id, items: snap.items.length });
    return ok({ lesson: l, step: L.getStep(step.id) });
  }
  const r = L.addFiguresStep(u, l.id, { title: w.title, setId: w.id, items: snap.items, ofVersion: w.of_version });
  if (!r.ok) return r;
  audit(u.id, 'figures.lessonStep.add', l.id, { step: r.step.id, items: snap.items.length });
  return ok({ lesson: l, step: r.step });
}
/** A Figure step of a lesson drafted with AI (services/lesson-ai.js: its questions already checked and repaired): its
 *  lesson set and the step, saved at once like "Save to lesson" (the teacher edits the whole draft before using it).
 *  -> { ok, step } | fail */
export function draftedStep(u, lessonId, s) {
  const items = Array.isArray(s && s.figures) ? s.figures : [];
  if (!items.length || !F.canMake(u)) return fail('empty');
  const r = F.createWorksheet(u, { title: String(s.title || '').slice(0, 80), purpose: 'lesson', lessonId, items });
  if (!r.ok) return r;
  const saved = saveToLesson(u, r.id);
  if (!saved.ok) return saved;
  q.run('UPDATE lesson_steps SET body=?, minutes=? WHERE id=?', String(s.body || '').slice(0, 4000), Math.max(0, Math.min(240, Math.round(+s.minutes || 0))), saved.step.id);
  return ok({ step: L.getStep(saved.step.id) });
}
/** Where a set's builder goes back to: its lesson (a lesson set whose lesson the teacher can still edit), else null. */
export function lessonOfSet(u, w) {
  if (!w || w.purpose !== 'lesson' || !w.lesson_id) return null;
  const l = L.getLesson(w.lesson_id); if (!L.canEditLesson(u, l)) return null;
  const step = q.get('SELECT id FROM lesson_steps WHERE lesson_id=? AND set_id=? AND kind=?', l.id, w.id, FIGURES_KIND);
  return { id: l.id, title: l.title, stepId: step ? step.id : null, started: step ? L.stepWork(step.id) > 0 : false };
}
/** A Figure step's questions as print takes them (services/figures.js printHtml). */
export const printItems = step => itemsOf(step).map(it => ({ kind: it.kind, data: it.data, hide: it.hide === undefined ? false : it.hide, question: String(it.question || ''), answer: String(it.answer || ''),
  work: Array.isArray(it.work) ? it.work.map(String) : [], answerType: isChoice(it) ? 'choice' : 'number', choices: isChoice(it) ? it.choices.map(String) : [], correct: isChoice(it) ? it.value : null }));
/** The printable student sheet (and the answer key) of a Figure step: for the lesson's editors. -> html | null */
export function stepPrintHtml(u, stepId, { t = tEn, lang = 'en', dir = 'ltr', key = false } = {}) {
  const s = L.getStep(stepId), l = s && L.getLesson(s.lesson_id);
  if (!s || s.kind !== FIGURES_KIND || !L.canEditLesson(u, l)) return null;
  return F.printHtml({ title: s.title || l.title, of_version: s.of_version }, printItems(s), { t, lang, dir, key });
}

// ---------------------------------------------------------------- reading a step
/** The step's questions ([] when unreadable). */
export const itemsOf = step => {
  let x = []; try { x = JSON.parse((step && step.items) || '[]'); } catch { x = []; }
  // A snapshot saved before currency went first keeps "125 $"; it shows as "$125".
  return Array.isArray(x) ? x.map(it => (it && typeof it.answer === 'string' ? { ...it, answer: F.shownAnswer(it.answer) } : it)) : [];
};
/** What the student typed, one string per question. */
export const answersOf = (row, n) => { let a = []; try { a = JSON.parse((row && row.answer) || '[]'); } catch { a = []; } if (!Array.isArray(a)) a = []; return Array.from({ length: n }, (_, i) => (typeof a[i] === 'string' ? a[i] : '')); };
/** Has the student handed in? */
export const handedIn = row => !!(row && row.status === 'done' && /^[01]+$/.test(row.marks || ''));
/** Is the due date over for this class lesson (the school's time zone)? */
export const dueOver = (cl, t = now()) => { const from = L.lateFrom(cl); return from !== null && t >= from; };
/** May this student see the answers and worked lines? Only all three: the teacher allows it, the due date is over, and
 *  the student handed in. */
export const reveals = (step, cl, row, t = now()) => !!(step && step.show_answers) && dueOver(cl, t) && handedIn(row);

const svgCache = new Map();
/** A figure as an SVG for a lesson page: drawn here with the step's pinned Oomba Figures, the parts the teacher hid left
 *  out (full: everything), and every data-* attribute but data-of removed (some carry the figure's values). */
export function figureSvg(step, i, { lang = 'en', full = false } = {}) {
  const it = itemsOf(step)[i]; if (!it) return '';
  const key = `${step.id}|${i}|${lang}|${full ? 1 : 0}|${step.of_version}`;
  if (svgCache.has(key)) return svgCache.get(key);
  let svg = '';
  try { svg = F.kitFor(step.of_version).svg(it.kind, it.data, { lang, hide: full ? false : it.hide, title: tEn('figures.print.figure', { n: i + 1 }), width: 360 }); } catch { svg = ''; }
  svg = String(svg || '').replace(/\sdata-(?!of=)[a-z0-9-]+="[^"]*"/gi, '');
  if (svgCache.size > 2000) svgCache.clear();
  svgCache.set(key, svg);
  return svg;
}

// ---------------------------------------------------------------- marking
const DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
/** The numbers a typed answer can mean: "5", "5 cm", "x = 5", "-2.5", "2,5" (a decimal comma), "1,250" (thousands or a
 *  decimal comma: both readings), "3/4", "12 cm²", Arabic and Persian digits, full-width digits. [] when it is not one number. */
export function readNumber(text) {
  let s = String(text || '').replace(/[²³]/g, '').normalize('NFKC').replace(/[٠-٩۰-۹]/g, ch => String(DIGITS[ch])).replace(/٫/g, '.').replace(/٬/g, '')
    .replace(/[−–‐]/g, '-').replace(/[\s   ]+/g, '');
  s = s.replace(/^[a-zA-Z]{1,3}=/, '').replace(/^([-+]?)[$€£¥₹]/, '$1');
  const m = /^([-+]?)(\d[\d.,]*|[.,]\d+)(?:\/(\d+(?:\.\d+)?))?(.*)$/.exec(s);
  if (!m) return [];
  const [, sign, num, den, rest] = m;
  if (/\d/.test(rest) || rest.length > 12) return [];
  const neg = sign === '-' ? -1 : 1;
  const reads = new Set();
  const plain = x => (/^\d*\.?\d+$|^\d+\.$/.test(x) ? +x : NaN);
  if (!num.includes(',')) reads.add(plain(num));
  else if (!num.includes('.')) {
    if (/^\d{1,3}(,\d{3})+$/.test(num)) reads.add(+num.replace(/,/g, ''));
    if ((num.match(/,/g) || []).length === 1) reads.add(plain(num.replace(',', '.')));
  } else {
    // both: the last one is the decimal point ("1,250.5" or "1.250,5")
    if (num.lastIndexOf('.') > num.lastIndexOf(',') && /^\d{1,3}(,\d{3})+\.\d+$/.test(num)) reads.add(+num.replace(/,/g, ''));
    if (num.lastIndexOf(',') > num.lastIndexOf('.') && /^\d{1,3}(\.\d{3})+,\d+$/.test(num)) reads.add(+num.replace(/\./g, '').replace(',', '.'));
  }
  const out = [];
  for (const r of reads) {
    if (!Number.isFinite(r)) continue;
    if (den !== undefined) { const d = +den; if (!(d > 0)) continue; out.push((neg * r) / d); } else out.push(neg * r);
  }
  return out;
}
/** Is a snapshot question a choice question? (An older snapshot has no type: a number question.) */
export const isChoice = it => !!(it && it.type === 'choice' && Array.isArray(it.choices) && it.choices.length >= 2);
/** The option a student picked ("0" for the first), or null. */
export const pickedOf = (text, it) => { const s = String(text ?? '').trim(); return /^\d$/.test(s) && +s < it.choices.length ? +s : null; };
/** Is this answer right? A choice: the right option picked. A number (of any sign): within half a unit in the answer's
 *  last decimal place (dp 1: within 0.05), so a rounded answer counts and a wrong one never does. */
export function isRight(text, it) {
  if (!it || typeof it.value !== 'number') return false;
  if (isChoice(it)) return pickedOf(text, it) === it.value;
  const tol = 0.5 * 10 ** -Math.max(0, Math.min(6, it.dp | 0)) + 1e-9 * Math.max(1, Math.abs(it.value));
  return readNumber(text).some(x => Math.abs(x - it.value) <= tol);
}
/** Marks for a list of answers: '1' right, '0' not, one per question. */
export const markAll = (items, answers) => items.map((it, i) => (isRight(answers[i], it) ? '1' : '0')).join('');

// ---------------------------------------------------------------- for pages
/**
 * One figures step as a page shows it to someone: the questions, each with its figure (SVG), question and unit; the
 * student's answers and marks once handed in; and only when allowed (teacher: always; a student: reveals) the answer,
 * the right option of a choice question and worked lines. A choice question's options are always there (in the order
 * the teacher wrote them), never which one is right before that.
 * -> { items: [{ n, question, unit, svg, typed, type, choices?, right?, answer?, work?, correct? }], handedIn, revealed, score }
 */
export function viewFor(step, cl, row, { lang = 'en', teacher = false, t = now() } = {}) {
  const items = itemsOf(step), typed = answersOf(row, items.length), done = handedIn(row);
  const revealed = teacher || reveals(step, cl, row, t);
  const marks = done ? String(row.marks) : '';
  return {
    handedIn: done, revealed, score: done ? row.score : null, right: done ? [...marks].filter(m => m === '1').length : 0, total: items.length,
    items: items.map((it, i) => ({
      n: i + 1, question: String(it.question || ''), unit: String(it.unit || ''), svg: figureSvg(step, i, { lang, full: revealed && !teacher ? true : false }), typed: typed[i],
      type: isChoice(it) ? 'choice' : 'number', ...(isChoice(it) ? { choices: it.choices.map(String) } : {}),
      ...(done ? { right: marks[i] === '1' } : {}),
      ...(revealed ? { answer: String(it.answer || ''), work: Array.isArray(it.work) ? it.work.map(String) : [], ...(isChoice(it) ? { correct: it.value } : {}) } : {}),
    })),
  };
}

// ---------------------------------------------------------------- teachers
const managedCl = (u, clId) => { const cl = L.getClassLesson(clId); const c = cl && S.getClass(cl.class_id); return c && S.canManageClass(u, c) ? cl : null; };
/** "Show answers after the due date" on or off for one assigned worksheet (the class's managers). */
export function setShowAnswers(u, clId, stepId, on) {
  const cl = managedCl(u, clId); const s = cl && L.getStep(stepId);
  if (!s || s.lesson_id !== cl.lesson_id || s.kind !== FIGURES_KIND) return fail('notFound');
  if (on && !cl.due_at) return fail('needsDue');
  q.run('UPDATE lesson_steps SET show_answers=? WHERE id=?', on ? 1 : 0, s.id);
  audit(u.id, 'figures.showAnswers', cl.class_id, { step: s.id, on: !!on });
  return ok({ on: !!on });
}
/** Per question: how many of the class's students who handed in got it right (counts only: never a ranking). */
export function questionTotals(step, rows) {
  const n = itemsOf(step).length, out = Array.from({ length: n }, () => ({ right: 0, handedIn: 0 }));
  for (const r of rows) if (handedIn(r)) for (let i = 0; i < n; i++) { out[i].handedIn++; if (r.marks[i] === '1') out[i].right++; }
  return out;
}
