// Oomba Live question sets (docs/decisions.md "Oomba Live"): written by teachers and grown-ups, never by players. Each
// item is a question, 2-4 choices, the right one, and a time (10, 20, 30 or 60 seconds). Text is checked like any text
// adults publish to children: no rude words, no personal information (emails, phone numbers, addresses, links).
// Ownership follows the lesson library: the owner edits; staff of the same school may use a set the owner shared.
import { q, uid, now, tx } from '../db.js';
import { cleanText } from './textfilter.js';
import * as S from './schools.js';
import * as L from './lessons.js';

export const LIMITS = { items: 50, q: 200, choice: 80, title: 80, bytes: 40 * 1024 };
export const SECS = [10, 20, 30, 60];

const fail = code => ({ ok: false, code });
export const getSet = id => (id ? q.get('SELECT * FROM live_sets WHERE id=?', String(id)) : null) || null;
export const itemsOf = set => { try { const a = JSON.parse(set.items); return Array.isArray(a) ? a : []; } catch { return []; } };
/** A ready item: a question, 2-4 choices, the answer among them. Drafts copied from a lesson have no choices yet. */
export const complete = it => !!(it && it.q && Array.isArray(it.choices) && it.choices.length >= 2 && it.choices.length <= 4 && it.choices.every(Boolean) && Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.choices.length && SECS.includes(it.secs));

/** The schools where this person is staff (a set belongs to the first one, so school staff can share it). */
const staffSchool = u => (u ? q.get("SELECT school_id FROM school_members WHERE user_id=? AND status='active' AND role!='student' ORDER BY joined_at LIMIT 1", u.id) : null);

const text = (v, max) => {
  const c = cleanText(v, max);
  return c.ok ? { ok: true, value: c.value } : c;
};
/**
 * items (from the editor or a quick set) -> { ok: true, items } | { ok: false, code, at? }. drafts: true lets items
 * without choices through (a set copied from a lesson, finished in the editor; it can't be hosted until complete).
 */
export function cleanItems(items, { drafts = false } = {}) {
  if (!Array.isArray(items) || !items.length || items.length > LIMITS.items) return fail('items');
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const qq = text(it.q, LIMITS.q);
    if (!qq.ok || !qq.value) return { ...fail('question'), at: i };
    const raw = Array.isArray(it.choices) ? it.choices : [];
    const choices = [];
    for (const c of raw.slice(0, 4)) { const v = text(c, LIMITS.choice); if (!v.ok) return { ...fail('choice'), at: i }; choices.push(v.value); }
    const secs = SECS.includes(+it.secs) ? +it.secs : 20;
    const answer = Number.isInteger(+it.answer) ? +it.answer : 0;
    const item = { q: qq.value, choices, answer, secs };
    if (!complete(item) && !(drafts && choices.every(Boolean))) return { ...fail('choices'), at: i };
    if (new Set(choices.map(c => c.toLowerCase())).size !== choices.length) return { ...fail('sameChoice'), at: i };
    out.push(item);
  }
  if (JSON.stringify(out).length > LIMITS.bytes) return fail('tooBig');
  return { ok: true, items: out };
}

/** May this person host with this set? Their own, or one a colleague shared in a school they are staff of. */
export function canUse(u, set) {
  if (!u || !set || set.archived_at) return false;
  if (set.owner_id === u.id) return true;
  return !!(set.shared && set.school_id && S.roleIn(u, set.school_id) && S.roleIn(u, set.school_id) !== 'student');
}
export const canEdit = (u, set) => !!(u && set && !set.archived_at && set.owner_id === u.id);

/** -> { ok, set } | { ok:false, code } */
export function createSet(u, { title, subject = '', grade = '', lang = 'en', items, shared = false, lessonId = null } = {}) {
  const tt = text(title, LIMITS.title); if (!tt.ok || !tt.value) return fail('title');
  const c = cleanItems(items, { drafts: !!lessonId }); if (!c.ok) return c;
  const school = staffSchool(u);
  const id = uid(12), t = now();
  q.run('INSERT INTO live_sets(id, owner_id, school_id, title, subject, grade, lang, items, lesson_id, shared, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, u.id, school ? school.school_id : null, tt.value, String(subject).slice(0, 40), String(grade).slice(0, 20), String(lang).slice(0, 12), JSON.stringify(c.items), lessonId, shared && school ? 1 : 0, t, t);
  return { ok: true, set: getSet(id) };
}
export function updateSet(u, id, { title, subject, grade, items, shared } = {}) {
  const set = getSet(id); if (!canEdit(u, set)) return fail('notFound');
  const tt = title !== undefined ? text(title, LIMITS.title) : { ok: true, value: set.title };
  if (!tt.ok || !tt.value) return fail('title');
  let list = itemsOf(set);
  if (items !== undefined) { const c = cleanItems(items, { drafts: true }); if (!c.ok) return c; list = c.items; }
  q.run('UPDATE live_sets SET title=?, subject=?, grade=?, items=?, shared=?, updated_at=? WHERE id=?', tt.value,
    subject !== undefined ? String(subject).slice(0, 40) : set.subject, grade !== undefined ? String(grade).slice(0, 20) : set.grade,
    JSON.stringify(list), shared !== undefined ? (shared && set.school_id ? 1 : 0) : set.shared, now(), set.id);
  return { ok: true, set: getSet(set.id) };
}
export function archiveSet(u, id) {
  const set = getSet(id); if (!canEdit(u, set)) return fail('notFound');
  q.run('UPDATE live_sets SET archived_at=? WHERE id=?', now(), set.id);
  return { ok: true };
}
/** The sets this person may host with: their own, then ones shared in their schools (staff only). */
export function listFor(u) {
  if (!u) return { mine: [], school: [] };
  const mine = q.all('SELECT * FROM live_sets WHERE owner_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200', u.id);
  const school = S.isSchoolStaff(u) ? q.all(`SELECT l.* FROM live_sets l JOIN school_members m ON m.school_id=l.school_id AND m.user_id=? AND m.status='active' AND m.role!='student'
    WHERE l.shared=1 AND l.archived_at IS NULL AND l.owner_id!=? ORDER BY l.updated_at DESC LIMIT 200`, u.id, u.id) : [];
  const shape = r => { const its = itemsOf(r); return { id: r.id, title: r.title, subject: r.subject, grade: r.grade, count: its.length, ready: its.length > 0 && its.every(complete), shared: !!r.shared, mine: r.owner_id === u.id }; };
  return { mine: mine.map(shape), school: school.map(shape) };
}
/** A draft set from a lesson's question steps (up to 50): the questions only; the teacher adds the choices. */
export function fromLesson(u, lessonId) {
  const l = L.getLesson(lessonId);
  if (!l || !(L.canEditLesson(u, l) || L.canSeeShared(u, l))) return fail('notFound');
  const qs = L.steps(l.id).filter(s => s.kind === 'question' && s.body).slice(0, LIMITS.items);
  if (!qs.length) return fail('noQuestions');
  const items = qs.map(s => ({ q: String(s.body).slice(0, LIMITS.q), choices: [], answer: 0, secs: 20 }));
  return tx(() => createSet(u, { title: l.title, items, lessonId: l.id }));
}
