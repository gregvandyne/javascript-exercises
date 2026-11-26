// Homeroom: the parents' view (docs/homeroom.md "The student desk": parents see handout notes, not personal tabs;
// docs/decisions.md "Homeroom: the parents' view"). Step 4d.
//
// Who: a grown-up account (services/family.js) whose family has the child LINKED (family_children status 'linked', not
// unlinked) through the existing linking: the child's code on /me, typed on /family/link, and the child's Yes (or an
// account the family made, PARENT_MADE_CHILDREN). Linking is for own kid accounts only (F.isChildAccount: never a school
// account the school made), so a student whose account the school made has no parents' view until linking covers them.
// Families must be on (F.familiesOn, as every family page) and HOMEROOM on. Nobody else: a student, a teacher, an aide,
// a sub, another family, the platform admin all get the site's 404.
//
// What: for each class of the child that has Homeroom (H.classHasHomeroom: one of its teachers passes the gate) and whose
// teachers left the parents' view on (homeroom_rooms.parents_view, on by default; parentsOn / setParents), read only:
//   - the child's own handouts (services/homeroom-handouts.js deskView: only what is on their desk): title, the
//     teacher's instructions, given and due dates, done or not yet, the grade as the teacher chose to show it (Score:
//     the % right, services/scores.js, the gradebook's figure; Completion: done or not; Not graded: practice), and the
//     teacher's comment and sticker on finished work;
//   - "Missed while away" on a handout given on a day the child was marked absent and not done yet (nothing else about
//     attendance: no days, no marks, no history);
//   - the books read with the reading routine: title and cover, the step, the quiz's first-try result;
//   - the child's notebook pages in that class's tab only (kind 'class': handout notes, reading notes, Class notes; K-2
//     drawings included), never an own tab.
// Never: other students (no names, no counts, no class figures), ranks or comparisons, live status, hands, the hall pass,
// supports (the simpler wording the teacher wrote is left out: deskView gives the teacher's own words), the teacher's
// version labels, today's attendance marks, the private notebook. Each read is audited (ids only, never what it says).
// No AI reads any of it. Nothing is stored here but the class's switch.
import { q, now, audit } from '../db.js';
import { isGrownup, getUser } from '../auth.js';
import * as F from './family.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as AT from './homeroom-attendance.js';
import * as SC from './scores.js';
import { DEFAULT_GROUPS } from '../../public/js/homeroom-seats.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });

// ---------------------------------------------------------------- the class's switch
/** Do this class's teachers let linked grown-ups see it? On unless they turned it off. */
export function parentsOn(c) {
  if (!c) return false;
  const r = q.get('SELECT parents_view FROM homeroom_rooms WHERE class_id=?', c.id);
  return !r || r.parents_view !== 0;
}
/** The class's teachers (the Homeroom gate; never an aide or a sub) turn the parents' view on or off. -> { ok, parents } */
export function setParents(u, c, on) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (typeof on !== 'boolean') return fail('badState');
  const t = now();
  q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', c.id, JSON.stringify(DEFAULT_GROUPS), t, t);
  q.run('UPDATE homeroom_rooms SET parents_view=?, updated_at=? WHERE class_id=?', on ? 1 : 0, t, c.id);
  audit(u.id, 'homeroom.parents', c.id, { on });
  return ok({ parents: on });
}

// ---------------------------------------------------------------- who
/** The grown-up's linked child named by the /family page's token (F.requestToken), or null: their own family's, linked
 *  (a pending request never), the child's account a kid account that is not banned. */
export function childOf(grownup, token) {
  if (!isGrownup(grownup) || grownup.banned) return null;
  const fam = F.familyOfOwner(grownup.id); if (!fam) return null;
  const want = String(token || '');
  const row = q.all("SELECT * FROM family_children WHERE family_id=? AND status='linked' AND unlinked_at IS NULL", fam.id).find(r => F.requestToken(fam.id, r.child_id) === want);
  const child = row && getUser(row.child_id);
  return child && !child.banned && !child.is_guest && !isGrownup(child) ? child : null;
}
/** The child's classes a grown-up may see: they are a student there now, the class has Homeroom and the parents' view
 *  is on. In the order they joined. */
export function classesFor(childId) {
  return q.all(`SELECT c.* FROM class_members m JOIN classrooms c ON c.id=m.class_id
      WHERE m.user_id=? AND m.role='student' AND m.status='active' AND c.archived_at IS NULL ORDER BY m.joined_at, c.created_at, c.name, c.id`, String(childId || ''))
    .filter(c => H.classHasHomeroom(c) && parentsOn(c));
}
/** Does this linked child have anything for the /family page to link to (Homeroom on, a class to see)? */
export const anyFor = childId => H.on() && classesFor(childId).length > 0;
/** Does a grown-up see this student's class tabs now? A live link, families on (billing) and a class of theirs shown. The
 *  notebook says so at its top (services/notebook.js mine). */
export function grownupSees(u) {
  if (!u || !H.on() || !F.familiesOn()) return false;
  return !!F.linkOf(u.id) && classesFor(u.id).length > 0;
}

// ---------------------------------------------------------------- what they see
const drawingOf = s => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
/** The child's pages in this class's tab (kind 'class'), Class notes first, then a page per handout in the order they
 *  were started. Empty pages are left out. Never an own tab. */
function notesOf(childId, classId) {
  const tab = q.get("SELECT id FROM notebook_tabs WHERE user_id=? AND class_id=? AND kind='class'", childId, classId);
  if (!tab) return [];
  return q.all('SELECT id, title, body, drawing, class_lesson_id, updated_at FROM notebook_pages WHERE user_id=? AND tab_id=? ORDER BY (class_lesson_id IS NOT NULL), created_at', childId, tab.id)
    .map(p => ({ id: p.id, title: p.title || '', handout: p.class_lesson_id || null, body: p.body || '', drawing: drawingOf(p.drawing), at: p.updated_at }))
    .filter(p => p.body || p.drawing.length);
}
/** When each of the class's handouts was given: Map clId -> time. */
const givenAt = classId => new Map(q.all('SELECT class_lesson_id id, created_at at FROM homeroom_handouts WHERE class_id=?', classId).map(r => [r.id, r.at]));

/**
 * One class as the grown-up sees it. -> { id, name, handouts: [{ id, title, icon, instructions, given, due, done,
 * grade: 'score'|'completion'|'none', pct (Score with something scored), missed, fb: { comment, src } | null, reading:
 * { book, step, right, total } | null }], reading: [{ id, book, step, right, total }], notes: [{ id, title, body,
 * drawing, at }] }. Handouts newest first (missed ones are marked; the page puts them first).
 */
export function classView(child, c) {
  const at = givenAt(c.id), modes = new Map(q.all('SELECT class_lesson_id id, grade FROM homeroom_handouts WHERE class_id=?', c.id).map(r => [r.id, r.grade]));
  // (a Manipulatives tool on the desk is open practice in a live room: not class work for the parents' view)
  const cards = AT.markMissed(c, child, HO.deskView(c, child).filter(x => !x.tool));
  const items = SC.classItems(c.id, { userId: child.id });
  const handouts = cards.map(x => {
    const grade = modes.get(x.id) || 'completion', score = grade === 'score' ? SC.total(items.get(`${child.id}:${x.id}`)) : null;
    const r = x.reading || null;
    return {
      id: x.id, title: x.title, icon: x.icon, instructions: x.instructions || '', given: at.get(x.id) || null, due: x.due || null, dueMin: x.dueMin ?? null, done: !!x.done, grade,
      ...(score ? { pct: score.pct } : {}), missed: !!x.missed,
      fb: x.fb ? { comment: x.fb.comment || '', src: x.fb.src || '', sticker: x.fb.sticker || '' } : null,
      reading: r ? { book: r.book, step: r.step, ...(r.total ? { right: r.right, total: r.total } : {}) } : null,
    };
  }).sort((a, b) => (b.given || 0) - (a.given || 0));
  const reading = handouts.filter(h => h.reading && h.reading.book).map(h => ({ id: h.id, book: h.reading.book, step: h.reading.step, ...(h.reading.total ? { right: h.reading.right, total: h.reading.total } : {}) }));
  return { id: c.id, name: c.name, handouts, reading, notes: notesOf(child.id, c.id) };
}

/**
 * The parents' view for a grown-up and a child token, and optionally one class (else the first). Audited.
 * -> { ok, child: { name }, classes: [{ id, name }], cls: classView | null } | { ok:false, code:'notFound' }
 */
export function viewFor(grownup, token, classId = '') {
  if (!H.on()) return fail('notFound');
  const child = childOf(grownup, token); if (!child) return fail('notFound');
  const list = classesFor(child.id);
  const c = classId ? list.find(x => x.id === String(classId)) : list[0];
  if (classId && !c) return fail('notFound');
  if (c) audit(grownup.id, 'homeroom.parents.read', child.id, { class: c.id });
  return ok({ child: { id: child.id, name: child.display_name || child.username }, classes: list.map(x => ({ id: x.id, name: x.name })), cls: c ? classView(child, c) : null });
}
