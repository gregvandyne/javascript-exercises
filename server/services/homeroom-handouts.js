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
// Step 2b (services/homeroom-lessons.js): a lesson is handed out the same way, one class assignment per group version,
// with hr_lesson (the lesson), its version's label (teachers only), how many problems and a batch (the versions of one hand-out, so
// "Remove from every desk" takes them all). Its card says "Lesson" and how many problems. A waiting In order handout
// opened from anywhere else (the To do list, a saved link) shows a calm "Finish the one before it first" (lessonWait).
//
// Step 2c (docs/decisions.md "Homeroom, step 2c"): a team desk is a target (every member gets the handout, one class
// assignment with exactly them); a finished card can get the teacher's short comment and one sticker
// (homeroom_feedback; setFeedback), shown to that student only (their desk and the lesson page) and stored for their
// parents' view later; a handout's grading can be changed afterwards from the Classroom tab's overview (setGrade).
//
// Who: only the class's own teachers through the Homeroom gate (services/homeroom.js canUseClass) hand out and remove;
// a student reads only their own desk (canUseDesk), never another desk or a group's name.
import * as OP from './homeroom-opened.js';
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as F from './game-folders.js';
import * as games from './games.js';
import * as H from './homeroom.js';
import * as SUP from './homeroom-supports.js';
import { PLAYED_ENOUGH } from './progress.js';
import { textProblem } from './manipulatives.js';
import { liveGameOf } from '../live/live-games.js';
import { gameHidden, mayOpenHidden } from './game-focus.js';
import * as HR from './homeroom-reading.js';
import * as LIB from './library.js';
import * as AT from './homeroom-attendance.js';
import * as HT from './homeroom-tools.js';
import * as M from './manipulatives.js';
import * as MT from './manip-tasks.js';
import { toolOf } from '../../public/js/manip-data.js';
import { taskOf } from '../../public/js/manip-tasks.js';
import { unitOf } from '../../public/js/homeroom-lesson-make.js';
import * as GLA from './grammar-lab-assign.js';
import * as GL from './grammar-lab.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
export const GRADES = L.GRADE_MODES;
export const INSTRUCTIONS_MAX = 300;
/** Open handouts a class may have at once (a desk shows them all; older ones can be removed). */
export const HANDOUTS_MAX = 80;
const TARGETS = ['all', 'group', 'desk', 'team'];

// ---------------------------------------------------------------- due dates (docs/decisions.md "Homeroom: week plans,
// due dates, copying plans"). A handout's due day is its class assignment's (class_lessons.due_at, as every assignment);
// a due time is Homeroom's own (homeroom_handouts.due_min: minutes after that day's local midnight, NULL: the end of the
// day), counted in the school's time zone, else the zone of the teacher who set it (due_zone), else UTC. Students only
// ever see when it is due ("Due Fri"), never late; the teacher sees "after due" calmly; a handout given while a student
// was absent ("Missed while you were out") is never after due by itself.
/** 'HH:MM' (24 hours) -> minutes after midnight; '' or null -> null; anything else -> undefined. */
export function dueMinOf(v) {
  if (v === null || v === undefined || v === '') return null;
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(v).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}
/** The zone a handout's due time is counted in. */
const dueZoneOf = (c, z) => S.zoneOf(S.getSchool(c.school_id)) || (S.isZone(z) ? z : 'UTC');
/** The instant a handout is due: the due day's local midnight plus due_min, else the end of the due day. null: no due day. */
export function dueByOf(c, dueAt, dueMin, zone = '') {
  if (!dueAt) return null;
  const { start, end } = L.dayBounds(dueAt, dueZoneOf(c, zone));
  return Number.isInteger(dueMin) && dueMin >= 0 && dueMin < 1440 ? start + dueMin * 60e3 : end;
}
/** A hand-out's due time checked (a time needs a day). -> { ok, min, zone } | fail('badDate') */
export function dueOf({ dueAt = null, dueTime = null, tz = '' } = {}) {
  const min = dueMinOf(dueTime);
  if (min === undefined || (min !== null && !dueAt)) return fail('badDate');
  return ok({ min, zone: S.isZone(tz) ? tz : '' });
}
/** The due time on handouts just made (their class assignment holds the day). */
export function setDue(ids, due) {
  if (!due || due.min === null) return;
  for (const id of ids) q.run('UPDATE homeroom_handouts SET due_min=?, due_zone=? WHERE class_lesson_id=?', due.min, due.zone || '', id);
}
/** What pages get about a row's due date: { due (the day), dueMin, dueBy (the instant) } or {}. */
const dueFields = (c, r) => (r.due_at ? { due: r.due_at, dueMin: Number.isInteger(r.due_min) ? r.due_min : null, dueBy: dueByOf(c, r.due_at, r.due_min, r.due_zone) } : { due: null });
/** Cards without In order sorted by when they are due (soonest first, then as handed out); In order cards keep their places. */
export function byDue(cards) {
  const slots = [], free = [];
  cards.forEach((x, i) => { if (!x.inOrder) { slots.push(i); free.push([x, i]); } });
  free.sort((a, b) => (a[0].dueBy ?? Infinity) - (b[0].dueBy ?? Infinity) || a[1] - b[1]);
  const out = [...cards];
  slots.forEach((at, k) => { out[at] = free[k][0]; });
  return out;
}

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
/** The class's open handouts in the order they were handed out, each with its game step (or a Reading handout's story
 *  step: services/homeroom-reading.js) and who it is for. */
function rowsOf(classId) {
  return q.all(`SELECT h.class_lesson_id id, h.in_order, h.grade, h.target, h.created_at, h.hr_lesson hl, h.version, h.problems, h.batch, h.due_min, h.due_zone, cl.due_at, cl.opens_at, cl.lesson_id, s.id step_id, s.title, s.body, s.options, s.game_id, s.kind step_kind, COALESCE(s.story_id,'') story_id, s.items
      FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
      JOIN lesson_steps s ON s.lesson_id=cl.lesson_id AND s.kind IN ('game','story','manip','grammar')
      WHERE h.class_id=? ORDER BY h.created_at, h.class_lesson_id`, classId);
}
/** Class lessons assigned to the class in Classroom (Assign on the class page, Assign from the Manipulatives page, a
 *  game's Assign, Google Classroom's) that are not Homeroom handouts: they show on desks too, after the handouts
 *  (docs/decisions.md "Homeroom: QA fixes for Manipulatives in Homeroom"). The same shape as rowsOf, with cls (from
 *  Classroom; never removed from Homeroom: Classroom changes it) and page (a lesson of several steps, or of another kind
 *  of step: its card opens the lesson page; a Manipulatives practice set or a one-game lesson opens in the desk's player
 *  like a handout). */
function classRows(classId) {
  return q.all(`SELECT cl.id, 0 in_order, NULL grade, '' target, cl.assigned_at created_at, NULL hl, '' version, 0 problems, '' batch, NULL due_min, '' due_zone, cl.due_at, cl.opens_at, cl.lesson_id,
      l.title ltitle, (SELECT COUNT(*) FROM lesson_steps x WHERE x.lesson_id=cl.lesson_id) nsteps, s.id step_id, s.title, s.body, s.options, s.game_id, s.kind step_kind, COALESCE(s.story_id,'') story_id, s.items
      FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id JOIN lesson_steps s ON s.id=(SELECT y.id FROM lesson_steps y WHERE y.lesson_id=cl.lesson_id ORDER BY y.position LIMIT 1)
      WHERE cl.class_id=? AND cl.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM homeroom_handouts h WHERE h.class_lesson_id=cl.id) ORDER BY cl.assigned_at, cl.id`, classId)
    .map(r => {
      const one = r.nsteps === 1 && (r.step_kind === 'manip' || r.step_kind === 'game' || r.step_kind === 'grammar');
      return { ...r, cls: true, grade: r.step_kind === 'manip' ? 'score' : 'completion', ...(one ? (r.step_kind === 'manip' || r.step_kind === 'grammar' ? { title: r.ltitle || r.title } : {}) : { page: true, title: r.ltitle || r.title, step_kind: 'page' }) };
    });
}
/** Steps done per student on Classroom lessons of several steps: Map 'clId:userId' -> count. */
function stepsDone(rows) {
  const ids = rows.filter(r => r.page).map(r => r.id); if (!ids.length) return new Map();
  return new Map(q.all(`SELECT class_lesson_id cl, user_id u, COUNT(*) n FROM step_progress WHERE status='done' AND class_lesson_id IN (${ids.map(() => '?').join(',')}) GROUP BY class_lesson_id, user_id`, ...ids).map(r => [`${r.cl}:${r.u}`, r.n]));
}
/** A Classroom lesson of several steps on a desk: done when every step is, else how many steps are done. */
const pageProg = (r, n) => ({ done: !!r.nsteps && n >= r.nsteps, pct: r.nsteps ? Math.min(r.nsteps && n >= r.nsteps ? 100 : 95, Math.round((100 * n) / r.nsteps)) : 0 });
const PAGE_ICON = '📚';
// Grammar Lab work (services/grammar-lab-assign.js): its card opens the course (a unit, a topic or a room; never framed,
// like a lesson page), and how far along is the topics mastered of all (a room: passed or not), from the course itself.
const GRAMMAR_ICON = '🔤';
const grammarSnap = r => (r.step_kind === 'grammar' ? GLA.snapOf({ items: r.items }) : null);
const grammarHref = snap => (snap.what === 'unit' ? `/courses/grammar-lab/${snap.band}/${snap.unit}` : snap.what === 'room' ? GL.roomHref(snap.unit, snap.topic, snap.band)
  : `/courses/grammar-lab/${snap.band}/${snap.unit}/${snap.topic}`);
function grammarProg(snap, userId, p) {
  if (!snap) return { done: false, pct: 0, n: 0 };
  const pr = GLA.progressFor({ id: userId }, snap);
  const done = (!!p && p.status === 'done') || pr.mastered;
  return { done, pct: done ? 100 : pr.total ? Math.min(95, Math.round((100 * pr.done) / pr.total)) : 0, n: pr.total, got: pr.done };
}
const READ_ICON = '📖';
/** A Manipulatives practice set's part of a handout: { manip: { slug (the tool), tasks, n (questions) } } or {}. */
function manipPart(r) {
  if (r.step_kind !== 'manip') return {};
  const snap = MT.snapOf({ items: r.items });
  if (!snap) return {};
  return { manip: { slug: taskOf(snap.tasks[0]).slug, tasks: snap.tasks, n: snap.tasks.length * snap.n } };
}
const manipIcon = r => { const m = manipPart(r).manip, tl = m && toolOf(m.slug); return (tl && tl.emoji) || '🧮'; };
/** How far along a set is: the questions finished of all (100 once done). */
function manipPct(p, r) {
  if (!p) return 0; if (p.status === 'done') return 100;
  const m = manipPart(r).manip, n = m ? m.n : 0, done = [...String(p.marks || '')].filter(ch => ch === '1' || ch === '0').length;
  return n ? Math.min(95, Math.round((100 * done) / n)) : 0;
}
/** A practice set's questions for one student (Today at a glance): { answered, right (first time), n }. */
function manipQs(p, r) {
  const m = manipPart(r).manip, n = m ? m.n : 0, marks = [...String((p && p.marks) || '')];
  return { answered: marks.filter(ch => ch === '1' || ch === '0').length, right: marks.filter(ch => ch === '1').length, n };
}
/** A Reading handout's own part of a handout: the book it names ({ book: card | null }, null for their own choice). */
const readingPart = r => (r.step_kind === 'story' ? { reading: { book: HR.bookCard(r.story_id ? LIB.getBook(r.story_id) : null) } } : {});
function gameInfo(cache, id, locale) {
  if (!cache.has(id)) { const g = games.getGame(id); cache.set(id, g ? games.localizeGame(g, locale) : null); }
  return cache.get(id);
}
/** Title as students see it: an Oomba game in their language, a teacher's own game by its name, a lesson by its own. */
const titleOf = (r, g) => (r.hl || r.step_kind === 'story' ? r.title : g && g.source === 'seed' ? g.title : r.title || (g ? g.title : ''));
/** A lesson's card: how many of what ('words' for Crossword, 'cards' for Flashcards, else 'problems'). */
const lessonOf = (r, g) => (r.hl ? { lesson: true, n: r.problems || 0, unit: unitOf(g && g.slug) } : {});
/** step_progress for these handouts: Map 'clId:userId' -> row. */
function progressOf(rows) {
  if (!rows.length) return new Map();
  return new Map(q.all(`SELECT class_lesson_id cl, user_id u, status, seconds, score, plays, marks FROM step_progress WHERE class_lesson_id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.id))
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
/** A desk's cards as the student sees them (docs/decisions.md "Homeroom: QA fixes for Manipulatives in Homeroom", F1):
 *  what is not done yet first, in the order deskOrder gave it (the teacher's order, due dates), then the Manipulatives
 *  tools handed out (open practice: never done, never Next up), then what is done, so a busy desk never puts new work
 *  after a row of Done cards. Next up and Later are worked out before: moving a done card never changes them. */
export function doneLast(cards, tools = []) {
  return [...cards.filter(x => !x.done), ...tools, ...cards.filter(x => x.done)];
}

/** What the teacher's board shows: every open handout ({ id, title, icon, instructions, inOrder, grade, target, due,
 *  students: n }) and each current student's cards ({ desks: { studentId: [{ id, done, pct, score, locked, next }] } }). */
export function boardView(c, locale = 'en', { assigned = true } = {}) {
  const rows = [...rowsOf(c.id), ...(assigned ? classRows(c.id) : [])], picks = L.picksIn(c.id), ids = H.studentsOf(c.id).map(s => s.id), prog = progressOf(rows.filter(r => !r.page)), stepsN = stepsDone(rows), cache = new Map(), fb = feedbackOf(c.id);
  const rds = new Map(rows.filter(r => r.step_kind === 'story').map(r => [r.id, { stepId: r.step_id, storyId: r.story_id }])), infos = HR.infosOf(c.id, rds);
  const handouts = rows.map(r => {
    const g = r.game_id ? gameInfo(cache, r.game_id, locale) : null, who = picks.get(r.id);
    return { id: r.id, title: titleOf(r, g), icon: r.page ? PAGE_ICON : r.step_kind === 'story' ? READ_ICON : r.step_kind === 'manip' ? manipIcon(r) : r.step_kind === 'grammar' ? GRAMMAR_ICON : (g && g.icon) || '🎮',
      ...(r.step_kind === 'grammar' ? { grammar: true, n: (grammarSnap(r) || { topics: [] }).topics.length } : {}), ...readingPart(r), ...manipPart(r), instructions: r.page ? '' : r.body || '', inOrder: !!r.in_order, grade: r.grade, target: r.target || (who ? 'desk' : 'all'), ...dueFields(c, r),
      students: who ? ids.filter(id => who.has(id)).length : ids.length, at: r.created_at, ...lessonOf(r, g), ...(r.hl ? { version: r.version || '', batch: r.batch || '' } : {}), ...(r.cls ? { cls: true } : {}), ...(r.page ? { page: true, n: r.nsteps } : {}) };
  });
  const desks = {}, t = now(), dueBy = new Map(handouts.map(h => [h.id, h.dueBy])), excused = new Set(AT.missedPairs(c.id, t));
  for (const sid of ids) {
    desks[sid] = deskOrder(rows.filter(r => { const who = picks.get(r.id); return !who || who.has(sid); }).map(r => {
      const p = prog.get(`${r.id}:${sid}`);
      const f = fb.get(`${r.id}:${sid}`), rd = r.step_kind === 'story' ? infos.get(`${r.id}:${sid}`) : null;
      const done = !!p && p.status === 'done', by = dueBy.get(r.id);
      // after due (the teacher's board only, said calmly): not finished past its due time, unless it was given while they
      // were absent ("Missed while you were out" is never after due by itself)
      if (r.page) { const pp = pageProg(r, stepsN.get(`${r.id}:${sid}`) || 0); return { id: r.id, inOrder: false, done: pp.done, pct: pp.pct, score: null, ...(!pp.done && !!by && t > by && !excused.has(`${sid}:${r.id}`) ? { late: true } : {}) }; }
      if (r.step_kind === 'grammar') { const gp = grammarProg(grammarSnap(r), sid, p); return { id: r.id, inOrder: !!r.in_order, done: gp.done, pct: gp.pct, score: null, ...(!gp.done && !!by && t > by && !excused.has(`${sid}:${r.id}`) ? { late: true } : {}), ...(f ? { fb: f } : {}) }; }
      const late = !done && !!by && t > by && !excused.has(`${sid}:${r.id}`);
      return { id: r.id, inOrder: !!r.in_order, done, pct: rd ? HR.pctOfInfo(rd) : r.step_kind === 'manip' ? manipPct(p, r) : pctOf(p), score: p && p.score !== null && p.score !== undefined ? p.score : null, ...(late ? { late: true } : {}), ...(f ? { fb: f } : {}), ...(rd ? { rd } : {}),
        ...(r.step_kind === 'manip' ? { qs: { ...manipQs(p, r), ...(OP.has(c.id, sid, r.id) ? { opened: true } : {}) } } : {}) };
    }));
  }
  // today's attendance marks and the questions waiting from home (docs/decisions.md "Homeroom: K-2 mode, absent and at
  // home"): the board dims an absent desk and leaves it out of its counts
  // Manipulatives tools handed out (services/homeroom-tools.js): their own list, never in the desks' cards (a tool is open
  // practice: it never counts toward Done, Stuck or Today's counts)
  // room: the Manipulatives room running in the class now (one at a time: the hand-out sheet says so up front)
  return { handouts, desks, tools: HT.boardList(c), room: HT.roomOf(c), att: AT.marksToday(c.id), asks: AT.openAsks(c.id) };
}
/** One student's desk: their own handouts only, in order, each with what the card shows and where it opens
 *  ({ id, title, icon, instructions, href, done, pct, locked, next, due, ready }). Nothing about anyone else. */
export function deskView(c, u, locale = 'en', { assigned = true } = {}) {
  const rows = [...rowsOf(c.id), ...(assigned ? classRows(c.id) : [])].filter(r => L.isOpen(r) && L.assignedTo(r.id, u.id)), prog = progressOf(rows.filter(r => !r.page)), stepsN = stepsDone(rows), cache = new Map(), fb = feedbackOf(c.id, u.id);
  const steps = new Map(rows.length ? q.all(`SELECT s.*, g.slug game_slug, g.status game_status, g.visibility game_visibility, g.source game_source, g.owner_id game_owner,
      g.published_version_id IS NOT NULL game_live, g.hidden_reason!='' game_hidden FROM lesson_steps s LEFT JOIN games g ON g.id=s.game_id WHERE s.id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.step_id)).map(s => [s.id, s]) : []);
  const rds = new Map(rows.filter(r => r.step_kind === 'story').map(r => [r.id, { stepId: r.step_id, storyId: r.story_id }])), infos = rds.size ? HR.infosOf(c.id, rds, u.id) : new Map();
  // (a Manipulatives tool handed out comes after what is not done yet and before what is done: open practice, never
  // Next up or Later; doneLast)
  // (without In order the desk's cards come by when they are due: Next up is the one due soonest)
  return doneLast(deskOrder(byDue(rows.map(r => {
    const p = prog.get(`${r.id}:${u.id}`);
    // A Classroom lesson of several steps (classRows): its card opens the lesson page (never framed), steps done on it.
    if (r.page) {
      const pp = pageProg(r, stepsN.get(`${r.id}:${u.id}`) || 0);
      return { id: r.id, title: r.title, icon: PAGE_ICON, instructions: '', inOrder: false, ...dueFields(c, r), ready: true, page: true, cls: true, n: r.nsteps, href: `/class/${encodeURIComponent(c.id)}/lessons/${encodeURIComponent(r.id)}`, done: pp.done, pct: pp.pct };
    }
    // A Reading handout (services/homeroom-reading.js): it opens the desk's reading layer, the routine's step on the card.
    if (r.step_kind === 'story') {
      const rd = infos.get(`${r.id}:${u.id}`);
      return { id: r.id, title: titleOf(r, null), icon: READ_ICON, instructions: r.body || '', inOrder: !!r.in_order, ...dueFields(c, r), ready: true, reading: rd,
        href: `/class/${c.id}/desk#read=${encodeURIComponent(r.id)}`, done: !!p && p.status === 'done', pct: HR.pctOfInfo(rd),
        ...(p && p.status === 'done' && fb.get(`${r.id}:${u.id}`) ? { fb: fb.get(`${r.id}:${u.id}`) } : {}) };
    }
    // A Manipulatives practice set (services/manip-tasks.js): opens the Manipulatives page in the desk's player, where the
    // student answers one question at a time; the board watches it like a tool (tool: its slug)
    if (r.step_kind === 'manip') {
      const mp = manipPart(r).manip;
      return { id: r.id, title: titleOf(r, null), icon: manipIcon(r), instructions: r.body || '', inOrder: !!r.in_order, ...dueFields(c, r), ready: !!mp, manip: true, n: mp ? mp.n : 0, tool: mp ? mp.slug : '',
        href: mp ? MT.hrefOf(r.id, r.step_id) : null, done: !!p && p.status === 'done', pct: manipPct(p, r), ...(p && p.status === 'done' && fb.get(`${r.id}:${u.id}`) ? { fb: fb.get(`${r.id}:${u.id}`) } : {}) };
    }
    // Grammar Lab work (services/grammar-lab-assign.js): opens the course where the work is (never framed: page)
    if (r.step_kind === 'grammar') {
      const snap = grammarSnap(r), gp = grammarProg(snap, u.id, p);
      return { id: r.id, title: titleOf(r, null), icon: GRAMMAR_ICON, instructions: r.body || '', inOrder: !!r.in_order, ...dueFields(c, r), ready: !!snap, page: true, grammar: true, what: snap ? snap.what : '',
        n: gp.n, got: gp.got || 0, href: snap ? grammarHref(snap) : null, done: gp.done, pct: gp.pct, ...(gp.done && fb.get(`${r.id}:${u.id}`) ? { fb: fb.get(`${r.id}:${u.id}`) } : {}) };
    }
    const g = gameInfo(cache, r.game_id, locale), s = steps.get(r.step_id);
    const ready = !!s && !!s.game_slug && L.playableBy(s, c.school_id, c.id);
    return { id: r.id, title: titleOf(r, g), icon: (g && g.icon) || '🎮', instructions: r.body || '', inOrder: !!r.in_order, ...dueFields(c, r), ready, ...lessonOf(r, g),
      href: ready ? `/play/${s.game_slug}?lesson=${encodeURIComponent(r.id)}&step=${encodeURIComponent(s.id)}${s.options ? `&${s.options}` : ''}` : null,
      done: !!p && p.status === 'done', pct: pctOf(p), ...(p && p.status === 'done' && fb.get(`${r.id}:${u.id}`) ? { fb: fb.get(`${r.id}:${u.id}`) } : {}) };
  }))), HT.deskCards(c, u));
}
/** A short fingerprint of a desk (the poll sends the cards again only when it changed). */
export const deskVersion = cards => cards.map(x => `${x.id}.${x.dueBy || ''}.${x.done ? 1 : 0}.${x.pct}.${x.locked ? 1 : 0}.${x.ready ? 1 : 0}.${x.fb ? `${x.fb.at}` : ''}.${x.simpler ? 's' : ''}${x.missed ? 'm' : ''}${String(x.instructions || '').length}${x.reading ? `.${x.reading.step}.${x.reading.page}.${x.reading.book ? x.reading.book.id : ''}` : ''}`).join('|');

// ---------------------------------------------------------------- comments and stickers (step 2c)
/** The stickers a teacher can leave on finished work: a small set from the owner's sticker library
 *  (docs/class-board/sticker-library, served from /img/stickers/: illustrations, no words, never a photo of anyone). */
export const STICKERS = Object.freeze({
  star: 'ill/oomba-1.webp', thumbs: 'ill/oomba-3.webp', heart: 'ill/oomba-7.webp', idea: 'ill/oomba-8.webp', check: 'ill/oomba-9.webp', rocket: 'ill/oomba-4.webp',
  trophy: 'ill/praise-1.webp', medal: 'ill/praise-3.webp', crown: 'ill/praise-4.webp', fireworks: 'ill/praise-5.webp', smiley: 'ill/praise-7.webp', rainbow: 'ill/praise-9.webp',
});
export const stickerSrc = k => (STICKERS[k] ? `/img/stickers/${STICKERS[k]}` : '');
export const COMMENT_MAX = 140;
/** A comment as stored: one or two short lines of plain text, no blank lines (the instructions' rules, shorter). */
export function cleanComment(s) {
  return cleanInstructions(s).split('\n').filter(Boolean).slice(0, 2).join('\n').slice(0, COMMENT_MAX);
}
/** Comments and stickers of a class (or one student): Map 'clId:userId' -> { comment, sticker, src, at }. */
export function feedbackOf(classId, userId = null) {
  const rows = userId ? q.all('SELECT * FROM homeroom_feedback WHERE class_id=? AND user_id=?', classId, userId) : q.all('SELECT * FROM homeroom_feedback WHERE class_id=?', classId);
  return new Map(rows.map(r => [`${r.class_lesson_id}:${r.user_id}`, { comment: r.comment, sticker: STICKERS[r.sticker] ? r.sticker : '', src: stickerSrc(r.sticker), at: r.updated_at }]));
}
/** One student's comment and sticker on one class lesson (their own, for the lesson page; parents later), or null. */
export function feedbackFor(clId, userId) {
  const r = q.get('SELECT * FROM homeroom_feedback WHERE class_lesson_id=? AND user_id=?', String(clId || ''), String(userId || ''));
  return r ? { comment: r.comment, sticker: STICKERS[r.sticker] ? r.sticker : '', src: stickerSrc(r.sticker), at: r.updated_at } : null;
}
/**
 * The teacher's comment and sticker on a student's finished handout: { comment (at most COMMENT_MAX, cleaned, the
 * site's word and personal-information rules), sticker (one of STICKERS or '') }; both empty removes it. Only on a
 * handout of this class that is on that student's desk and finished. The class's teachers only. -> { ok, feedback }
 */
export function setFeedback(u, c, clId, studentId, { comment = '', sticker = '' } = {}) {
  // (step 3c: an aide leaves comments and stickers too)
  if (!H.canHelp(u, c, ['aide'])) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const h = handoutOf(c, clId); if (!h) return fail('notFound');
  const sid = String(studentId || '');
  if (!H.studentsOf(c.id).some(s => s.id === sid) || !L.assignedTo(h.class_lesson_id, sid)) return fail('notOnDesk');
  if (typeof comment !== 'string' || comment.trim().length > COMMENT_MAX) return fail('commentLong');
  const st = String(sticker || '');
  if (st && !STICKERS[st]) return fail('badSticker');
  const done = q.get("SELECT 1 FROM step_progress WHERE class_lesson_id=? AND user_id=? AND status='done'", h.class_lesson_id, sid);
  if (!done) return fail('notFinished');
  const text = cleanComment(comment);
  const bad = textProblem(text); if (bad) return fail(bad);
  if (!text && !st) {
    q.run('DELETE FROM homeroom_feedback WHERE class_lesson_id=? AND user_id=?', h.class_lesson_id, sid);
    audit(u.id, 'homeroom.feedback', c.id, { classLesson: h.class_lesson_id, removed: true });
    return ok({ feedback: null });
  }
  const t = now();
  q.run(`INSERT INTO homeroom_feedback(class_lesson_id, class_id, user_id, comment, sticker, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(class_lesson_id, user_id) DO UPDATE SET comment=excluded.comment, sticker=excluded.sticker, created_by=excluded.created_by, updated_at=excluded.updated_at`,
  h.class_lesson_id, c.id, sid, text, st, u.id, t, t);
  audit(u.id, 'homeroom.feedback', c.id, { classLesson: h.class_lesson_id, sticker: st || null, comment: text.length });
  return ok({ feedback: feedbackFor(h.class_lesson_id, sid) });
}

// ---------------------------------------------------------------- changing how a handout is graded (step 2c)
/** A handout's grading afterwards (the Classroom tab's overview): Score, Completion or Not graded, for every version of
 *  a lesson handed out together (batch). The class's teachers only. -> { ok, grade, ids } */
export function setGrade(u, c, clId, grade) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!GRADES.includes(grade)) return fail('badGrade');
  const h = handoutOf(c, clId); if (!h) return fail('notFound');
  const ids = h.batch ? q.all(`SELECT h.class_lesson_id id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
    WHERE h.class_id=? AND h.batch=?`, c.id, h.batch).map(x => x.id) : [h.class_lesson_id];
  for (const id of ids) q.run('UPDATE homeroom_handouts SET grade=? WHERE class_lesson_id=?', grade, id);
  audit(u.id, 'homeroom.grade', c.id, { classLesson: h.class_lesson_id, grade, ...(ids.length > 1 ? { versions: ids.length } : {}) });
  return ok({ grade, ids });
}

// ---------------------------------------------------------------- handing out
/** Who a drop goes to: { kind: 'all' } (the whole class), { kind: 'group', id } (the group's students now), { kind:
 *  'desk', id } (one student). -> { ok, students: [] (whole class) | [ids], target } */
export function studentsFor(c, to) {
  const kind = to && TARGETS.includes(to.kind) ? to.kind : null;
  if (!kind) return fail('badTarget');
  const room = H.roomOf(c.id), ids = room.students.map(s => s.id);
  // Whole class works with no students yet ([]: whoever joins later gets it, as Classroom's Assign does).
  if (kind === 'all') return ok({ students: [], target: 'all', all: ids });
  const id = String(to.id || '');
  if (kind === 'desk') return ids.includes(id) ? ok({ students: [id], target: 'desk', all: [id] }) : fail('notInClass');
  if (kind === 'team') { const t = room.teams.find(x => x.id === id); return t ? ok({ students: [...t.members], target: 'team', all: [...t.members] }) : fail('noTeam'); }
  if (!room.groups.some(g => g.id === id)) return fail('badTarget');
  const list = ids.filter(s => room.members[s] === id);
  return list.length ? ok({ students: list, target: 'group', all: list }) : fail('emptyGroup');
}
/** Open handouts of the class (games and lessons' versions). */
export const openCount = classId => q.get('SELECT COUNT(*) n FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_id=?', classId).n;
/** Students of the class who already have this game open in the class as free play (a handout, or one made in
 *  Classroom; a Homeroom lesson of the game is its own thing: services/homeroom-lessons.js checks those), among ids. */
function alreadyHave(c, gameId, ids) {
  const open = q.all(`SELECT cl.id FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='game' JOIN lesson_steps s ON s.lesson_id=l.id AND s.kind='game'
    LEFT JOIN homeroom_handouts h ON h.class_lesson_id=cl.id
    WHERE cl.class_id=? AND cl.removed_at IS NULL AND s.game_id=? AND h.hr_lesson IS NULL`, c.id, gameId);
  if (!open.length) return [];
  const picks = L.picksIn(c.id);
  return ids.filter(id => open.some(r => !picks.has(r.id) || picks.get(r.id).has(id)));
}
/**
 * Hand out a game: { gameId, to, instructions, order: 'in' | 'any', grade: 'score' | 'completion' | 'none', dueAt, dueTime
 * ('HH:MM', optional; needs dueAt), tz (the teacher's browser's zone, for a school without one) }.
 * The class's teachers only (the Homeroom gate). -> { ok, classLesson, handout } | { ok: false, code, count? }
 */
export function handOut(u, c, { gameId, to, instructions = '', order = 'in', grade = 'completion', dueAt = null, dueTime = null, tz = '' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const due = dueOf({ dueAt, dueTime, tz }); if (!due.ok) return due;
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!GRADES.includes(grade)) return fail('badGrade');
  if (typeof instructions !== 'string' || instructions.trim().length > INSTRUCTIONS_MAX) return fail('tooLong');
  const text = cleanInstructions(instructions);
  const bad = textProblem(text); if (bad) return fail(bad);
  const g = games.getGame(String(gameId || ''));
  if (!handable(u, g)) return fail('pickGame');
  const who = studentsFor(c, to); if (!who.ok) return who;
  if (openCount(c.id) >= HANDOUTS_MAX) return fail('tooManyHandouts');
  const have = alreadyHave(c, g.id, who.all);
  if (have.length) return fail('alreadyOnDesk', { count: have.length });
  const r = F.assignGame(u, c.id, g.id, { dueAt: dueAt || null, students: who.students, body: text, again: true });
  if (!r.ok) return r;
  q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
    r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now());
  setDue([r.classLesson.id], due);
  audit(u.id, 'homeroom.handout', c.id, { classLesson: r.classLesson.id, game: g.slug || g.id, target: who.target, students: who.all.length, order, grade });
  return ok({ classLesson: r.classLesson, game: g, students: who.all.length });
}
/**
 * Hand out Manipulatives practice (docs/decisions.md "Manipulatives: tasks you can practice and assign"): { tasks (task
 * ids), count (questions of each), to, instructions, order, grade (Score by default), dueAt, dueTime, tz }. A class
 * assignment like any handout (services/manip-tasks.js makeAssignment: a 'manip' lesson for exactly these students) and
 * a homeroom_handouts row (problems: how many questions). Only a teacher who may use Manipulatives.
 * -> { ok, classLesson, title, n, students } | { ok: false, code }
 */
export function handOutTask(u, c, { tasks, count = 5, to, instructions = '', order = 'in', grade = 'score', dueAt = null, dueTime = null, tz = '' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!M.canHostClass(u, c)) return fail('noTools');
  const due = dueOf({ dueAt, dueTime, tz }); if (!due.ok) return due;
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!GRADES.includes(grade)) return fail('badGrade');
  if (typeof instructions !== 'string' || instructions.trim().length > INSTRUCTIONS_MAX) return fail('tooLong');
  const text = cleanInstructions(instructions);
  const bad = textProblem(text); if (bad) return fail(bad);
  const pick = MT.cleanPick({ tasks, count }); if (!pick.ok) return pick;
  const who = studentsFor(c, to); if (!who.ok) return who;
  if (openCount(c.id) >= HANDOUTS_MAX) return fail('tooManyHandouts');
  const r = MT.makeAssignment(u, c, { tasks: pick.tasks, count: pick.n, students: who.students, dueAt: dueAt || null, body: text });
  if (!r.ok) return r;
  q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at, problems) VALUES (?,?,?,?,?,?,?,?)',
    r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now(), r.n);
  setDue([r.classLesson.id], due);
  audit(u.id, 'homeroom.handout', c.id, { classLesson: r.classLesson.id, tasks: pick.tasks, n: r.n, target: who.target, students: who.all.length, order, grade });
  return ok({ classLesson: r.classLesson, title: r.title, n: r.n, students: who.all.length });
}
/**
 * Hand out Grammar Lab work (a unit; services/grammar-lab-assign.js): { key ('<band>/<unit>'), to, instructions, order,
 * grade, dueAt, dueTime, tz }. A class assignment like any handout (a 'grammar' lesson for exactly these students) and a
 * homeroom_handouts row (problems: how many topics). Only a teacher Grammar Lab lets in.
 * -> { ok, classLesson, title, n, students } | { ok: false, code }
 */
export function handOutGrammar(u, c, { key, to, instructions = '', order = 'in', grade = 'completion', dueAt = null, dueTime = null, tz = '' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!GLA.canAssignTo(u, c)) return fail('noGrammar');
  const due = dueOf({ dueAt, dueTime, tz }); if (!due.ok) return due;
  if (!['in', 'any'].includes(order)) return fail('badOrder');
  if (!GRADES.includes(grade)) return fail('badGrade');
  if (typeof instructions !== 'string' || instructions.trim().length > INSTRUCTIONS_MAX) return fail('tooLong');
  const text = cleanInstructions(instructions);
  const bad = textProblem(text); if (bad) return fail(bad);
  const m = /^(k-2|3-5|6-8|9-12)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(String(key || ''));
  if (!m) return fail('pickGame');
  const who = studentsFor(c, to); if (!who.ok) return who;
  if (openCount(c.id) >= HANDOUTS_MAX) return fail('tooManyHandouts');
  const r = GLA.assign(u, { classId: c.id, what: 'unit', unit: m[2], band: m[1], students: who.students, dueAt: dueAt || null, body: text });
  if (!r.ok) return r.code === 'noClass' ? fail('notFound') : r;
  q.run('INSERT INTO homeroom_handouts(class_lesson_id, class_id, in_order, grade, target, created_by, created_at, problems) VALUES (?,?,?,?,?,?,?,?)',
    r.classLesson.id, c.id, order === 'in' ? 1 : 0, grade, who.target, u.id, now(), r.n);
  setDue([r.classLesson.id], due);
  audit(u.id, 'homeroom.handout', c.id, { classLesson: r.classLesson.id, grammar: key, n: r.n, target: who.target, students: who.all.length, order, grade });
  return ok({ classLesson: r.classLesson, title: r.title, n: r.n, students: who.all.length });
}
export const handoutOf = (c, clId) => q.get(`SELECT h.*, cl.lesson_id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
  WHERE h.class_lesson_id=? AND h.class_id=?`, String(clId || ''), c.id) || null;
/** Take a handout off one desk (studentId) or off every desk (studentId empty). The class's teachers only. Work done
 *  on it is kept (as when any assignment is removed). -> { ok, removed: 'desk' | 'all' } */
export function removeHandout(u, c, clId, studentId = null) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const h = handoutOf(c, clId); if (!h) return fail('notFound');
  if (!studentId) {
    // a lesson's versions handed out together go together
    const all = h.batch ? q.all(`SELECT h.class_lesson_id id FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL
      WHERE h.class_id=? AND h.batch=?`, c.id, h.batch).map(x => x.id) : [h.class_lesson_id];
    for (const id of all) { const r = L.unassign(u, id); if (!r.ok) return r; }
    audit(u.id, 'homeroom.handoutRemove', c.id, { classLesson: h.class_lesson_id, ...(all.length > 1 ? { versions: all.length } : {}) });
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
  // step 3a: the game page pulses too (public/js/homeroom-pulse.js: which handout, how long since the last input, the
  // game's own steps forward), so the teacher's board knows what the student is on; and it shows a desk lock or Pause.
  // Step 3c: the student's own supports (services/homeroom-supports.js): the simpler wording as the note, and for the
  // page (bigger text, read aloud on the note: public/js/homeroom-support.js) and the game's frame (BRB.support).
  const sup = SUP.supportOf(c.id, u.id), simple = sup.simple ? SUP.simpleOf(cl.id) : '';
  const on = SUP.anySup(sup);
  return { backHref: `/class/${c.id}/desk`, backLabel: t('homeroom.desk.backToDesk'), note: simple || (step && step.body ? step.body : ''),
    script: '/js/homeroom-pulse.js', data: { hrPulse: { classId: c.id, on: cl.id }, ...(on ? { hrSupport: sup } : {}) }, ...(on ? { support: sup, i18n: ['js.homeroom-support'] } : {}) };
});

// ---------------------------------------------------------------- an In order handout that waits
// The desk shows a waiting In order card as 🔒 Later and never opens it. Anywhere else it can be opened from (the To do
// list on /classes, the lesson page, a saved play link) asks here: for the class's own student with a desk, a handout
// that waits on their desk opens a calm "Finish the one before it first" with the way back to the desk instead.
L.onLessonWait((u, cl, t) => {
  if (!u || !cl || !q.get('SELECT 1 FROM homeroom_handouts WHERE class_lesson_id=? AND in_order=1', cl.id)) return null;
  const c = S.getClass(cl.class_id);
  if (!H.canUseDesk(u, c)) return null;
  const card = deskView(c, u).find(x => x.id === cl.id);
  return card && card.locked ? { title: t('homeroom.desk.waitTitle'), text: t('homeroom.desk.waitText'), backHref: `/class/${c.id}/desk`, backLabel: t('homeroom.desk.backToDesk') } : null;
});

// ---------------------------------------------------------------- the teacher's note on the lesson page (step 2c)
// A student opening their own finished handout's lesson page sees the comment and sticker their teacher left. Only
// their own (never a classmate's).
L.onLessonNote((u, cl) => {
  if (!u || !cl || !q.get('SELECT 1 FROM homeroom_handouts WHERE class_lesson_id=?', cl.id)) return null;
  const f = feedbackFor(cl.id, u.id);
  return f && (f.comment || f.src) ? f : null;
});
