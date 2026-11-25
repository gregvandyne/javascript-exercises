// Homeroom handouts, step 2a (docs/homeroom.md "Handouts and lessons"; docs/decisions.md "Homeroom, step 2a"): the
// teacher drops a game from the board's left panel on one desk, a group or Whole class, with optional instructions, an
// order on the desk (In order / Any order), how it is graded (Score / Completion / Not graded) and an optional due day.
//
// A handout IS a class assignment, built with what Classroom already uses, never beside it:
//   - services/game-folders.js assignGame: a hidden lesson of kind 'game' with the game as its one step (the
//     instructions are that step's body, so the lesson page shows them too), assigned to the class (class_lessons, with
//     its due day) and, for a desk or a group, to exactly those students (class_lesson_students, services/lessons.js);
//     Whole class is the whole class ([]: students who join later get it too);
//   - students' play time, scores and done state are step_progress rows written by the play page as for any lesson, so
//     the Progress gradebook, the student's To do list on /classes and the lesson page all show it unchanged;
//   - homeroom_handouts (0125) adds only what Homeroom has on top: the order on the desk and how it is graded
//     (services/lessons.js gradeModes: the gradebook shows Not graded as practice and Completion as done / not done).
// Removing a handout from one desk takes that student off its list (the last one off removes it); from every desk it
// is removed like any assignment (class_lessons.removed_at; students' work is kept and comes back if it is assigned
// again). A student never gets the same game twice at once: a handout is refused while any of its students already has
// that game open in the class (alreadyOnDesk).
//
// Who: only the class's own teachers through the Homeroom gate (services/homeroom.js canUseClass) hand out and remove;
// a student reads only their own desk (canUseDesk), never another desk or a group's name.
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as F from './game-folders.js';
import * as games from './games.js';
import * as H from './homeroom.js';
import { PLAYED_ENOUGH } from './progress.js';
import { textProblem } from './manipulatives.js';
import { liveGameOf } from '../live/live-games.js';
import { gameHidden, mayOpenHidden } from './game-focus.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
export const GRADES = L.GRADE_MODES;
export const INSTRUCTIONS_MAX = 300;
/** Open handouts a class may have at once (a desk shows them all; older ones can be removed). */
export const HANDOUTS_MAX = 80;
const TARGETS = ['all', 'group', 'desk'];

/** The teacher's instructions as stored: plain text, at most INSTRUCTIONS_MAX characters and 4 lines, no control or
 *  direction characters, spaces tidied (the same rules as a lesson step's text, shorter). */
export function cleanInstructions(s) {
  return String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ').split('\n').map(x => x.trim()).filter((x, i, a) => x || (i && a[i - 1])).slice(0, 4).join('\n').trim().slice(0, INSTRUCTIONS_MAX);
}
/** Can this game go on a desk as free play? Any game the teacher can see that is not hosted live only (Quest Race...). */
export function handable(u, g) {
  if (!g || g.status === 'deleted' || !games.canView(u, g)) return false;
  if (gameHidden(g) && !mayOpenHidden(u, g)) return false;
  const lg = g.source === 'seed' ? liveGameOf(g) : null;
  return !(lg && !lg.play);
}

// ---------------------------------------------------------------- reading
/** The class's open handouts in the order they were handed out, each with its game step and who it is for. */
function rowsOf(classId) {
  return q.all(`SELECT h.class_lesson_id id, h.in_order, h.grade, h.target, h.created_at, cl.due_at, cl.opens_at, cl.lesson_id, s.id step_id, s.title, s.body, s.options, s.game_id
      FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
      JOIN lesson_steps s ON s.lesson_id=cl.lesson_id AND s.kind='game'
      WHERE h.class_id=? ORDER BY h.created_at, h.class_lesson_id`, classId);
}
function gameInfo(cache, id, locale) {
  if (!cache.has(id)) { const g = games.getGame(id); cache.set(id, g ? games.localizeGame(g, locale) : null); }
  return cache.get(id);
}
/** Title as students see it: an Oomba game in their language, a teacher's own game by its name. */
const titleOf = (r, g) => (g && g.source === 'seed' ? g.title : r.title || (g ? g.title : ''));
/** step_progress for these handouts: Map 'clId:userId' -> row. */
function progressOf(rows) {
  if (!rows.length) return new Map();
  return new Map(q.all(`SELECT class_lesson_id cl, user_id u, status, seconds, score, plays FROM step_progress WHERE class_lesson_id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.id))
    .map(p => [`${p.cl}:${p.u}`, p]));
}
/** How far along: 100 when done, else play time toward the 2 minutes that count a game as done (never 100). */
const pctOf = p => (!p ? 0 : p.status === 'done' ? 100 : Math.max(p.plays || p.seconds ? 8 : 0, Math.min(90, Math.round((100 * (p.seconds || 0)) / PLAYED_ENOUGH))));
/** One desk's cards in order: done, how far, the first unfinished is Next up, and an In order card after an unfinished
 *  one waits (locked). */
function deskOrder(cards) {
  let open = false, next = false;
  for (const c of cards) {
    c.locked = !c.done && c.inOrder && open;
    if (!c.done && !c.locked && !next && !open) { c.next = true; next = true; }
    if (!c.done) open = true;
  }
  return cards;
}

/** What the teacher's board shows: every open handout ({ id, title, icon, instructions, inOrder, grade, target, due,
 *  students: n }) and each current student's cards ({ desks: { studentId: [{ id, done, pct, score, locked, next }] } }). */
export function boardView(c, locale = 'en') {
  const rows = rowsOf(c.id), picks = L.picksIn(c.id), ids = H.studentsOf(c.id).map(s => s.id), prog = progressOf(rows), cache = new Map();
  const handouts = rows.map(r => {
    const g = gameInfo(cache, r.game_id, locale), who = picks.get(r.id);
    return { id: r.id, title: titleOf(r, g), icon: (g && g.icon) || '🎮', instructions: r.body || '', inOrder: !!r.in_order, grade: r.grade, target: r.target, due: r.due_at || null,
      students: who ? ids.filter(id => who.has(id)).length : ids.length };
  });
  const desks = {};
  for (const sid of ids) {
    desks[sid] = deskOrder(rows.filter(r => { const who = picks.get(r.id); return !who || who.has(sid); }).map(r => {
      const p = prog.get(`${r.id}:${sid}`);
      return { id: r.id, inOrder: !!r.in_order, done: !!p && p.status === 'done', pct: pctOf(p), score: p && p.score !== null && p.score !== undefined ? p.score : null };
    }));
  }
  return { handouts, desks };
}
/** One student's desk: their own handouts only, in order, each with what the card shows and where it opens
 *  ({ id, title, icon, instructions, href, done, pct, locked, next, due, ready }). Nothing about anyone else. */
export function deskView(c, u, locale = 'en') {
  const rows = rowsOf(c.id).filter(r => L.isOpen(r) && L.assignedTo(r.id, u.id)), prog = progressOf(rows), cache = new Map();
  const steps = new Map(rows.length ? q.all(`SELECT s.*, g.slug game_slug, g.status game_status, g.visibility game_visibility, g.source game_source, g.owner_id game_owner,
      g.published_version_id IS NOT NULL game_live, g.hidden_reason!='' game_hidden FROM lesson_steps s LEFT JOIN games g ON g.id=s.game_id WHERE s.id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.step_id)).map(s => [s.id, s]) : []);
  return deskOrder(rows.map(r => {
    const g = gameInfo(cache, r.game_id, locale), s = steps.get(r.step_id), p = prog.get(`${r.id}:${u.id}`);
    const ready = !!s && !!s.game_slug && L.playableBy(s, c.school_id, c.id);
    return { id: r.id, title: titleOf(r, g), icon: (g && g.icon) || '🎮', instructions: r.body || '', inOrder: !!r.in_order, due: r.due_at || null, ready,
      href: ready ? `/play/${s.game_slug}?lesson=${encodeURIComponent(r.id)}&step=${encodeURIComponent(s.id)}${s.options ? `&${s.options}` : ''}` : null,
      done: !!p && p.status === 'done', pct: pctOf(p) };
  }));
}
/** A short fingerprint of a desk (the poll sends the cards again only when it changed). */
export const deskVersion = cards => cards.map(x => `${x.id}.${x.done ? 1 : 0}.${x.pct}.${x.locked ? 1 : 0}.${x.ready ? 1 : 0}`).join('|');

// ---------------------------------------------------------------- handing out
/** Who a drop goes to: { kind: 'all' } (the whole class), { kind: 'group', id } (the group's students now), { kind:
 *  'desk', id } (one student). -> { ok, students: [] (whole class) | [ids], target } */
function studentsFor(c, to) {
  const kind = to && TARGETS.includes(to.kind) ? to.kind : null;
  if (!kind) return fail('badTarget');
  const room = H.roomOf(c.id), ids = room.students.map(s => s.id);
  if (kind === 'all') return ids.length ? ok({ students: [], target: 'all', all: ids }) : fail('noStudents');
  const id = String(to.id || '');
  if (kind === 'desk') return ids.includes(id) ? ok({ students: [id], target: 'desk', all: [id] }) : fail('notInClass');
  if (!room.groups.some(g => g.id === id)) return fail('badTarget');
  const list = ids.filter(s => room.members[s] === id);
  return list.length ? ok({ students: list, target: 'group', all: list }) : fail('emptyGroup');
}
/** Students of the class who already have this game open in the class (any assignment of it: a handout, or one made in
 *  Classroom), among ids. */
function alreadyHave(c, gameId, ids) {
  const open = q.all(`SELECT cl.id FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='game' JOIN lesson_steps s ON s.lesson_id=l.id AND s.kind='game'
    WHERE cl.class_id=? AND cl.removed_at IS NULL AND s.game_id=?`, c.id, gameId);
  if (!open.length) return [];
  const picks = L.picksIn(c.id);
  return ids.filter(id => open.some(r => !picks.has(r.id) || picks.get(r.id).has(id)));
}
/**
 * Hand out a game: { gameId, to, instructions, order: 'in' | 'any', grade: 'score' | 'completion' | 'none', dueAt }.
 * The class's teachers only (the Homeroom gate). -> { ok, classLesson, handout } | { ok: false, code, count? }
 */
export function handOut(u, c, { gameId, to, instructions = '', order = 'in', grade = 'completion', dueAt = null } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!GRADES.includes(grade)) return fail('badGrade');
  if (typeof instructions !== 'string' || instructions.trim().length > INSTRUCTIONS_MAX) return fail('tooLong');
  const text = cleanInstructions(instructions);
  const bad = textProblem(text); if (bad) return fail(bad);
  const g = games.getGame(String(gameId || ''));
  if (!handable(u, g)) return fail('pickGame');
  const who = studentsFor(c, to); if (!who.ok) return who;
  if (q.get('SELECT COUNT(*) n FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_id=?', c.id).n >= HANDOUTS_MAX) return fail('tooManyHandouts');
  const have = alreadyHave(c, g.id, who.all);
  if (have.length) return fail('alreadyOnDesk', { count: have.length });
  const r = F.assignGame(u, c.id, g.id, { dueAt: dueAt || null, students: who.students, body: text, again: true });
  if (!r.ok) return r;
  q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now());
  audit(u.id, 'homeroom.handout', c.id, { classLesson: r.classLesson.id, game: g.slug || g.id, target: who.target, students: who.all.length, order, grade });
  return ok({ classLesson: r.classLesson, game: g, students: who.all.length });
}
const handoutOf = (c, clId) => q.get(`SELECT h.*, cl.lesson_id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
  WHERE h.class_lesson_id=? AND h.class_id=?`, String(clId || ''), c.id) || null;
/** Take a handout off one desk (studentId) or off every desk (studentId empty). The class's teachers only. Work done
 *  on it is kept (as when any assignment is removed). -> { ok, removed: 'desk' | 'all' } */
export function removeHandout(u, c, clId, studentId = null) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const h = handoutOf(c, clId); if (!h) return fail('notFound');
  if (!studentId) {
    const r = L.unassign(u, h.class_lesson_id); if (!r.ok) return r;
    audit(u.id, 'homeroom.handoutRemove', c.id, { classLesson: h.class_lesson_id });
    return ok({ removed: 'all' });
  }
  const current = H.studentsOf(c.id).map(s => s.id), sid = String(studentId);
  const list = L.studentsOfLesson(h.class_lesson_id), on = list.length ? list : current;
  if (!on.includes(sid)) return fail('notOnDesk');
  const rest = on.filter(id => id !== sid && current.includes(id));
  const r = rest.length ? L.setStudents(u, h.class_lesson_id, rest) : L.unassign(u, h.class_lesson_id);
  if (!r.ok) return r;
  audit(u.id, 'homeroom.handoutRemove', c.id, { classLesson: h.class_lesson_id, student: sid });
  return ok({ removed: rest.length ? 'desk' : 'all' });
}

// ---------------------------------------------------------------- the game's frame
// A handout opened on the play page: Back goes to the student's desk ("Back to my desk"), and the teacher's
// instructions show again at the top of the game. Only for the class's own students with a desk; anyone else (a
// teacher trying it, the class without Homeroom now) gets the lesson's usual frame.
L.onPlayFrame((u, cl, step, t) => {
  if (!u || !cl || !q.get('SELECT 1 FROM homeroom_handouts WHERE class_lesson_id=?', cl.id)) return null;
  const c = S.getClass(cl.class_id);
  if (!H.canUseDesk(u, c)) return null;
  return { backHref: `/class/${c.id}/desk`, backLabel: t('homeroom.desk.backToDesk'), note: step && step.body ? step.body : '' };
});
