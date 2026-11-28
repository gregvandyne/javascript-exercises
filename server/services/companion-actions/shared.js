// Shared helpers for Oomba's action cards (docs/decisions.md "Oomba does it: one confirm card for any teacher action";
// the registry is ./index.js). Every area file (./classes.js, ./assignments.js, ...) imports only from here, never from
// index.js, so the registry can import the areas without an import cycle.
//
// - Plain-words refusals for the AI: no(msg) -> { error: '<msg> Nothing was changed.' }.
// - whichClass(u, ctx, ref, { fit }): the class from classRef (id or name), the page's class or the teacher's only class
//   (the Assign pages' list: game-folders.js assignClasses); several and none named: an ask card. -> { c } | { ask } | { error }
// - Students: only "[student N]" placeholders (idsOfToken, studentIn, someStudents); a name is never accepted.
// - assignmentIn(ctx, c, ref): one of the class's assignments by id or title words. -> { cl } | { error }
// - ownIn(ctx, all, ref, what, here): one of the teacher's own worksheets, boards or lessons (ownLessons) the same way.
// - Dates: dayParam (the AI's 'YYYY-MM-DD' | 'none'), isoDay (a stored day), fmtDay (the card, in the teacher's language).
// - clean(ctx, s): words with the teacher's students' names taken out (builder/lesson.js scrub), for anything the AI reads.
import { q, uid } from '../../db.js';
import * as S from '../schools.js';
import * as L from '../lessons.js';
import * as GF from '../game-folders.js';
import { scrub } from '../../builder/lesson.js';
import { tFor } from '../../i18n/index.js';

export const NOTHING = 'Nothing was changed.';
export const no = msg => ({ error: `${msg} ${NOTHING}` });
export const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
export const clean = (ctx, s, n = 80) => scrub(String(s || ''), (ctx && ctx.names) || []).text.replace(/\s+/g, ' ').trim().slice(0, n);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isoDay = ms => (ms === null || ms === undefined ? null : new Date(ms).toISOString().slice(0, 10));
/** A day for the card in the teacher's language ("Fri, Dec 4"). */
export const fmtDay = (iso, t) => { const v = new Date(`${iso}T12:00:00Z`); try { return v.toLocaleDateString(t.intl || t.locale || 'en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch { return iso; } };
/** A day from the AI: 'YYYY-MM-DD', 'none' (no day) or left out. -> iso | null | undefined | false (unreadable) */
export const dayParam = v => (v === undefined || v === null || v === '' ? undefined : /^(none|clear|no)$/i.test(String(v)) ? null : DAY_RE.test(String(v)) ? String(v) : false);

// JSON-schema pieces for an action's params.
export const P = (description, extra = {}) => ({ type: 'string', description, ...extra });
export const CLASS_REF = P('The class: its id or its name as the teacher wrote it. Leave out to use the page\'s class or ask.');
export const STUDENT = P('The student placeholder exactly as in the teacher\'s message, like "[student 1]".');
export const ASSIGNMENT = P('The assignment: words of its title as the teacher wrote them (findLesson lists the class\'s assignments).');

/** The students a placeholder stands for: this message's numbers first, then the conversation's. -> ids | null */
export function idsOfToken(ctx, target) {
  const m = /^\s*\[?\s*student\s+(\d{1,3})\s*\]?\s*$/i.exec(String(target || ''));
  if (!m) return null;
  const mine = (ctx.meta && ctx.meta._who) || {};
  return mine[m[1]] || (ctx.who || {})[m[1]] || null;
}

/** The classes the teacher manages (their own, and every class of a school they run), not archived. */
export const classesOf = u => GF.assignClasses(u);
/** Which class. fit: only classes this action can use. -> { c } | { ask } | { error } */
export function whichClass(u, ctx, ref, { fit = null } = {}) {
  const mine = classesOf(u).filter(c => !fit || fit(c));
  if (!mine.length) return no(fit ? 'None of the teacher\'s classes fits.' : 'The teacher has no class of their own here.');
  const r = String(ref || '').trim();
  let c = null;
  if (r) c = mine.find(x => x.id === r) || mine.find(x => fold(x.name) === fold(r)) || null;
  if (!c && r) { const near = mine.filter(x => fold(x.name).includes(fold(r))); if (near.length === 1) c = near[0]; }
  if (!c && !r && ctx.page && ctx.page.classId) c = mine.find(x => x.id === ctx.page.classId) || null;
  if (!c && !r && mine.length === 1) c = mine[0];
  if (c) return { c };
  if (r && !mine.some(x => fold(x.name).includes(fold(r)))) return no('That is not one of the teacher\'s classes.');
  return { ask: { id: uid(10), question: tFor(ctx.lang)('js.companion.act.whichClass'), options: mine.slice(0, 5).map(x => ({ label: clean(ctx, x.name, 60) })), state: 'open' } };
}
/** The class, only when this teacher may manage it (the class routes' loadClass rule), else null. */
export const managed = (u, id) => { const c = S.getClass(id); return c && S.canManageClass(u, c) ? c : null; };
export const className = id => (S.getClass(id) || {}).name || '';
/** One student of the class a placeholder stands for. -> { id } | { error } */
export function studentIn(ctx, c, tok) {
  const ids = idsOfToken(ctx, tok);
  if (!ids) return no('That is not a student placeholder from the teacher\'s message (like [student 1]). If they wrote a name, it is not one of their students.');
  const hit = S.roster(c.id).filter(p => p.role === 'student' && ids.includes(p.id));
  if (hit.length !== 1) return no('That student is not in this class (or the name fits more than one): ask the teacher which student.');
  return { id: hit[0].id };
}
/** Some students of a class from placeholders. -> { ids } | { error } */
export function someStudents(ctx, c, list) {
  const out = [];
  for (const tok of Array.isArray(list) ? list.slice(0, 30) : []) { const s = studentIn(ctx, c, tok); if (s.error) return s; if (!out.includes(s.id)) out.push(s.id); }
  return { ids: out };
}
/** A student's name as the school knows it (for the teacher's own page only, never the AI). */
export const studentName = (classId, userId) => { const c = S.getClass(classId), m = c && S.membership(c.school_id, userId); const u = q.get('SELECT display_name FROM users WHERE id=?', userId); return (m && m.roster_name) || (u && u.display_name) || ''; };
/** One of the class's assignments by its id or words of its title. -> { cl } | { error } */
export function assignmentIn(ctx, c, ref) {
  const all = L.classLessons(c.id);
  if (!all.length) return no('The class has nothing assigned.');
  const list = xs => xs.slice(0, 12).map(x => `"${clean(ctx, x.title, 60)}"`).join(', ');
  const r = String(ref || '').trim();
  if (!r) return no(`Say which assignment. The class has: ${list(all)}.`);
  let hit = all.filter(x => x.id === r);
  if (!hit.length) hit = all.filter(x => fold(x.title) === fold(r));
  if (!hit.length) hit = all.filter(x => fold(x.title).includes(fold(r)));
  if (hit.length === 1) return { cl: hit[0] };
  if (!hit.length) return no(`No assignment of this class has that name. The class has: ${list(all)}.`);
  return no(`More than one assignment fits: ${list(hit)}. Ask the teacher which one.`);
}
/** The class lesson as saved now (still in its class), or null. */
export const clNow = id => q.get('SELECT * FROM class_lessons WHERE id=? AND removed_at IS NULL', String(id || '')) || null;
// Links for a change card.
export const classLink = (classId, t, view = '') => ({ href: `/class/${encodeURIComponent(classId)}${view}`, label: t('js.companion.act.openClass') });
/** The class's assigned list (?view=assigned holds every assignment), named for what was assigned (chat audit 3: the
 *  card said "See the class's games" for a lesson plan): game, lesson, sheet, book, or 'all' for anything else. */
const ASSIGNED_LABEL = { game: 'open', lesson: 'openLesson', sheet: 'openSheet', book: 'openBook', all: 'openAll' };
export const assignedLabel = what => `js.companion.asg.${ASSIGNED_LABEL[what] || 'openAll'}`;
export const assignedLink = (classId, t, what = 'all') => ({ href: `/class/${encodeURIComponent(classId)}?view=assigned`, label: t(assignedLabel(what)) });

// ---------------------------------------------------------------- the teacher's own things (worksheets, boards, lessons)
/** One of the teacher's own things ({ id, title }) by its id or words of its title; with no words, `here` (the page's
 *  own) when it is one of them. what: 'worksheet' | 'board' | 'lesson' (the AI's words). -> { it } | { error } */
export function ownIn(ctx, all, ref, what, here = '') {
  const list = xs => xs.slice(0, 12).map(x => `"${clean(ctx, x.title, 60)}"`).join(', ');
  const r = String(ref || '').trim();
  if (!r && here) { const h = all.find(x => x.id === here); if (h) return { it: h }; }
  if (!all.length) return no(`The teacher has no ${what}s of their own.`);
  if (!r) return no(`Say which ${what}. The teacher's ${what}s: ${list(all)}.`);
  let hit = all.filter(x => x.id === r);
  if (!hit.length) hit = all.filter(x => fold(x.title) === fold(r));
  if (!hit.length) hit = all.filter(x => fold(x.title).includes(fold(r)));
  if (hit.length === 1) return { it: hit[0] };
  if (!hit.length) return no(`None of the teacher's ${what}s has that name. Their ${what}s: ${list(all)}.`);
  return no(`More than one ${what} fits: ${list(hit)}. Ask the teacher which one.`);
}
/** The teacher's own lessons (they may edit) at every school they are staff of, or at one school; not archived. */
export const ownLessons = (u, schoolId = '') => S.schoolsOf(u.id).filter(s => s.role !== 'student' && (!schoolId || s.id === schoolId))
  .flatMap(s => L.allLessonsOf(u.id, s.id)).filter(l => L.canEditLesson(u, l));
