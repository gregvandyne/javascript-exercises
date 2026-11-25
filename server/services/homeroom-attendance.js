// Homeroom: K-2 mode, absent and at home (docs/homeroom.md "The student desk", build order step 4; docs/decisions.md
// "Homeroom: K-2 mode, absent and at home"). Migration 0135_homeroom_k2_attendance.
//
// K-2 mode: a calmer, bigger desk for kindergarten to grade 2 (big picture buttons, one thing at a time, Read to me on,
// raise hand as pictures, a notebook that draws or types, reading notes a six year old can do). On by itself when the
// class's grade is K, 1 or 2 (services/homeroom-signin.js earlyGrade, the same reading of the grade box as picture
// passwords); the class's teachers turn it on or off for the class (homeroom_rooms.k2_mode: '' by grade, 'on', 'off') and
// for one student (homeroom_k2: 'on' or 'off' over the class's).
//
// Attendance: a class's teacher (or a sub, since taking attendance is a sub's job; an aide only sees it) marks a student
// Absent or At home for today, one school day in the school's time zone (else the marker's browser's, else UTC). Marks
// are per class and day and nothing more: no attendance report. Absent desks are dimmed on the board, left out of Needs a
// look, Today's counts and Finish class's counts (shown on their own: "2 absent"). A handout given on a day a student was
// absent stays on their desk under "Missed while you were out" and is never late by itself in Progress (progress.js
// onExcused). At home (marked, or a desk opened outside live class): the same desk and handouts, an "At home" chip on the
// board instead of a cursor, no hands or hall pass, and a question to the teacher as a note in Hands (homeroom_asks).
import { q, uid, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import { earlyGrade } from './homeroom-signin.js';
import { textProblem } from './manipulatives.js';
import { onExcused } from './progress.js';
import { DEFAULT_GROUPS } from '../../public/js/homeroom-seats.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const DAY = 86400e3;
export const CLASS_MODES = Object.freeze(['', 'on', 'off']);
export const STATUSES = Object.freeze(['absent', 'home']);
export const ASK_KINDS = Object.freeze(['question', 'help']);
export const ASK_MAX = 200, ASKS_OPEN_MAX = 3;
/** How far back an absence still puts a handout under "Missed while you were out". */
export const MISSED_DAYS = 60;

// ---------------------------------------------------------------- K-2 mode
const roomRow = classId => q.get('SELECT k2_mode FROM homeroom_rooms WHERE class_id=?', classId) || null;
const ensureRoom = classId => { const t = now(); q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', classId, JSON.stringify(DEFAULT_GROUPS), t, t); };
/** The class's K-2 setting: { mode: '' | 'on' | 'off', auto: the grade says K-2, on }. */
export function classK2(c) {
  const r = c ? roomRow(c.id) : null, mode = r && CLASS_MODES.includes(r.k2_mode) ? r.k2_mode : '', auto = earlyGrade(c && c.grade);
  return { mode, auto, on: mode === 'on' || (mode === '' && auto) };
}
/** Each student's own K-2 setting over the class's: { studentId: 'on' | 'off' } (current students only). */
export function studentModes(classId) {
  const ids = new Set(H.studentsOf(classId).map(s => s.id)), out = {};
  for (const r of q.all('SELECT user_id, mode FROM homeroom_k2 WHERE class_id=?', classId)) if (ids.has(r.user_id) && ['on', 'off'].includes(r.mode)) out[r.user_id] = r.mode;
  return out;
}
/** Is this student's desk in K-2 mode in this class? */
export function k2For(c, userId) {
  if (!c) return false;
  const r = q.get('SELECT mode FROM homeroom_k2 WHERE class_id=? AND user_id=?', c.id, String(userId || ''));
  if (r && ['on', 'off'].includes(r.mode)) return r.mode === 'on';
  return classK2(c).on;
}
/** Is the student in K-2 mode in any class of theirs with Homeroom (their notebook draws or types then)? */
export function k2Anywhere(u) {
  if (!u) return false;
  const cls = q.all(`SELECT c.* FROM class_members m JOIN classrooms c ON c.id=m.class_id WHERE m.user_id=? AND m.role='student' AND m.status='active' AND c.archived_at IS NULL`, u.id);
  return cls.some(c => H.classHasHomeroom(c) && k2For(c, u.id));
}
/** The class's teachers turn K-2 mode on or off for the class, or back to by grade (''). -> { ok, k2 } */
export function setClassK2(u, c, mode) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  if (!CLASS_MODES.includes(mode)) return fail('badAction');
  ensureRoom(c.id);
  q.run('UPDATE homeroom_rooms SET k2_mode=? WHERE class_id=?', mode, c.id);
  audit(u.id, 'homeroom.k2', c.id, { mode: mode || 'grade' });
  return ok({ k2: classK2(c) });
}
/** One student's K-2 desk: 'on', 'off', or '' (as the class). The class's teachers only. -> { ok, k2Students } */
export function setStudentK2(u, c, studentId, mode) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const sid = String(studentId || '');
  if (!H.studentsOf(c.id).some(s => s.id === sid)) return fail('notInClass');
  if (!CLASS_MODES.includes(mode)) return fail('badAction');
  if (mode) q.run('INSERT INTO homeroom_k2(class_id, user_id, mode, set_by, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id, user_id) DO UPDATE SET mode=excluded.mode, set_by=excluded.set_by, updated_at=excluded.updated_at', c.id, sid, mode, u.id, now());
  else q.run('DELETE FROM homeroom_k2 WHERE class_id=? AND user_id=?', c.id, sid);
  audit(u.id, 'homeroom.k2', c.id, { student: sid, mode: mode || 'class' });
  return ok({ k2Students: studentModes(c.id) });
}

// ---------------------------------------------------------------- the school day
/** The zone a class's day is counted in: the school's, else the marker's browser's (tz), else UTC. */
export const zoneFor = (c, tz = '') => S.zoneOf(S.getSchool(c.school_id)) || (S.isZone(tz) ? tz : 'UTC');
/** The calendar day an instant falls on in a zone, as a 00:00 UTC value (services/lessons.js dayBounds' kind of day). */
export function localDay(tz, at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(at)).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day);
}
const zoneOk = z => (S.isZone(z) ? z : 'UTC');
/** The rows of today (each in the zone it was marked in). */
function rowsToday(classId, at = now(), userId = null) {
  const rows = userId ? q.all('SELECT * FROM homeroom_attendance WHERE class_id=? AND user_id=? AND day>=?', classId, userId, at - 2 * DAY)
    : q.all('SELECT * FROM homeroom_attendance WHERE class_id=? AND day>=?', classId, at - 2 * DAY);
  return rows.filter(r => localDay(zoneOk(r.zone), at) === r.day);
}

// ---------------------------------------------------------------- attendance
/** Today's marks: { studentId: 'absent' | 'home' } (current students only; no mark: here). */
export function marksToday(classId, at = now()) {
  const ids = new Set(H.studentsOf(classId).map(s => s.id)), out = {};
  for (const r of rowsToday(classId, at)) if (ids.has(r.user_id) && STATUSES.includes(r.status)) out[r.user_id] = r.status;
  return out;
}
/** One student's mark today ('absent' | 'home' | ''). */
export const statusOf = (classId, userId, at = now()) => (rowsToday(classId, at, String(userId || '')).find(r => STATUSES.includes(r.status)) || {}).status || '';
/** Who may mark: the class's teachers and a sub ('teacher' | 'sub'); an aide sees marks but never changes them. */
function markerOf(u, c) {
  if (H.canUseClass(u, c)) return 'teacher';
  const role = H.helperRole(u, c);
  return role === 'sub' ? 'sub' : role ? 'forbidden' : null;
}
/**
 * Mark a student for today: status 'absent' | 'home', or '' (here: the mark goes). tz: the marker's browser's zone, used
 * when the school has none. A teacher or a sub (the route logs a sub's marks in the sub log). -> { ok, att }
 */
export function mark(u, c, studentId, status, { tz = '' } = {}, at = now()) {
  const who = markerOf(u, c);
  if (!who) return fail('notFound');
  if (who === 'forbidden') return fail('forbidden');
  const sid = String(studentId || '');
  if (!H.studentsOf(c.id).some(s => s.id === sid)) return fail('notInClass');
  if (status !== '' && !STATUSES.includes(status)) return fail('badAction');
  for (const r of rowsToday(c.id, at, sid)) q.run('DELETE FROM homeroom_attendance WHERE class_id=? AND user_id=? AND day=?', c.id, sid, r.day);
  if (status) {
    const zone = zoneFor(c, tz);
    q.run('INSERT INTO homeroom_attendance(class_id, user_id, day, zone, status, by_kind, set_by, at) VALUES (?,?,?,?,?,?,?,?)', c.id, sid, localDay(zone, at), zone, status, who, String(u.id || ''), at);
    // away from the room: no hand up and no place in the hall pass line (at home there is no bathroom pass)
    q.run("UPDATE homeroom_live SET hand='', hand_at=NULL, pass=CASE WHEN pass='line' THEN '' ELSE pass END WHERE class_id=? AND user_id=?", c.id, sid);
  }
  if (who === 'teacher') audit(u.id, 'homeroom.attendance', c.id, { student: sid, status: status || 'here' });
  return ok({ att: marksToday(c.id, at), status, by: who });
}

// ---------------------------------------------------------------- missed while you were out
const handoutsAt = classId => q.all('SELECT h.class_lesson_id id, h.created_at at FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_id=?', classId);
const absences = (classId, userId = null, at = now()) => (userId
  ? q.all("SELECT user_id, day, zone FROM homeroom_attendance WHERE class_id=? AND user_id=? AND status='absent' AND day>=?", classId, userId, at - MISSED_DAYS * DAY)
  : q.all("SELECT user_id, day, zone FROM homeroom_attendance WHERE class_id=? AND status='absent' AND day>=?", classId, at - MISSED_DAYS * DAY));
const onDay = (r, t) => localDay(zoneOk(r.zone), t) === r.day;
/** The handouts given on a day this student was marked absent: Set of class lesson ids. */
export function missedIds(classId, userId, at = now()) {
  const abs = absences(classId, String(userId || ''), at);
  if (!abs.length) return new Set();
  return new Set(handoutsAt(classId).filter(h => abs.some(r => onDay(r, h.at))).map(h => h.id));
}
/** A student's own cards with the ones missed while absent (and not done yet) marked missed. */
export function markMissed(c, u, cards) {
  if (!cards.length) return cards;
  const ids = missedIds(c.id, u.id);
  return ids.size ? cards.map(x => (ids.has(x.id) && !x.done ? { ...x, missed: true } : x)) : cards;
}
/** Every (student, handout) pair given while that student was absent: 'userId:classLessonId' (Progress: never late). */
export function missedPairs(classId, at = now()) {
  const abs = absences(classId, null, at), out = [];
  if (!abs.length) return out;
  for (const h of handoutsAt(classId)) for (const r of abs) if (onDay(r, h.at)) out.push(`${r.user_id}:${h.id}`);
  return out;
}
onExcused(classId => missedPairs(classId));

// ---------------------------------------------------------------- at home
/** Is this student away from the room for their desk now? 'home' (marked At home today), 'absent' (marked Absent and on
 *  their desk anyway, from home), 'outside' (no live class: from home, or before class), or '' (in class). */
export function homeOf(c, userId, at = now()) {
  const st = statusOf(c.id, userId, at);
  if (st) return st;
  return H.liveOf(c.id) ? '' : 'outside';
}

// ---------------------------------------------------------------- questions from home
const cleanAsk = s => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
const askView = r => ({ id: r.id, kind: r.kind, text: r.text, at: r.at, ...(r.answered_at ? { answeredAt: r.answered_at } : {}) });
/** A student's own questions of the last day (open ones, and answered ones so the desk can say the teacher saw it). */
export const myAsks = (c, userId, at = now()) => q.all('SELECT * FROM homeroom_asks WHERE class_id=? AND user_id=? AND at>? ORDER BY at', c.id, String(userId || ''), at - DAY).map(askView);
/**
 * A student at home asks their teacher: { kind: question | help, text: a few words (optional) }. It waits in the
 * teacher's Hands, marked at home. Only from home (marked At home, or outside live class); at most ASKS_OPEN_MAX waiting.
 * -> { ok, asks }
 */
export function ask(u, c, { kind = 'question', text = '' } = {}, at = now()) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  if (!homeOf(c, u.id, at)) return fail('notHome');
  if (!ASK_KINDS.includes(kind)) return fail('badKind');
  if (typeof text !== 'string' || text.length > ASK_MAX * 2) return fail('tooLong');
  const words = cleanAsk(text);
  if (words.length > ASK_MAX) return fail('tooLong');
  const bad = words && textProblem(words); if (bad) return fail(bad);
  if (q.get('SELECT COUNT(*) n FROM homeroom_asks WHERE class_id=? AND user_id=? AND answered_at IS NULL', c.id, u.id).n >= ASKS_OPEN_MAX) return fail('tooManyAsks');
  q.run('INSERT INTO homeroom_asks(id, class_id, user_id, kind, text, at) VALUES (?,?,?,?,?,?)', uid(12), c.id, u.id, kind, words, at);
  return ok({ asks: myAsks(c, u.id, at) });
}
/** The questions waiting in Hands (oldest first): [{ id, sid, kind, text, at }] (current students only). */
export function openAsks(classId) {
  const ids = new Set(H.studentsOf(classId).map(s => s.id));
  return q.all('SELECT * FROM homeroom_asks WHERE class_id=? AND answered_at IS NULL ORDER BY at LIMIT 100', classId).filter(r => ids.has(r.user_id)).map(r => ({ ...askView(r), sid: r.user_id }));
}
/** The teacher (an aide or a sub too, as they answer hands) answered a question from home. -> { ok, asks } */
export function answerAsk(u, c, id, at = now()) {
  if (!H.canHelp(u, c)) return fail('notFound');
  const r = q.get('SELECT * FROM homeroom_asks WHERE id=? AND class_id=?', String(id || ''), c.id);
  if (!r) return fail('notFound');
  if (!r.answered_at) q.run('UPDATE homeroom_asks SET answered_at=?, answered_by=? WHERE id=?', at, String(u.id || ''), r.id);
  return ok({ asks: openAsks(c.id) });
}

// ---------------------------------------------------------------- leaving, merging
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  for (const t of ['homeroom_k2', 'homeroom_attendance', 'homeroom_asks']) {
    if (userId) q.run(`DELETE FROM ${t} WHERE class_id=? AND user_id=?`, classId, userId);
    else q.run(`DELETE FROM ${t} WHERE class_id=?`, classId);
  }
});
S.onAccountMerge(({ from } = {}) => {
  if (!from) return;
  for (const t of ['homeroom_k2', 'homeroom_attendance', 'homeroom_asks']) q.run(`DELETE FROM ${t} WHERE user_id=?`, from);
});
