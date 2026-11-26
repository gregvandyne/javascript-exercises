// Homeroom: students draw on the room (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board").
// The class's teachers decide (homeroom_rooms.student_draw, in the board's ⋯ menu; off by default: then nothing changes,
// students change only their own or their team's desk). When it is on, a student in See the room draws with a pen, and
// erases their own lines, anywhere on the room's board outside other students' desks, the teacher's area and My desk.
//   - Stored per student per class (homeroom_marks: their lines in board pixels, a pen color each), saved whole like the
//     desk's pad; the class's version (homeroom_rooms.marks_v) moves on every change without touching the room's
//     updated_at, so desks and the projector don't fetch the teacher's area again.
//   - Seen by everyone in See the room (without names) and by the class's teachers and aides on the board, with whose
//     they are (the ⋯ menu's Students' drawings: each student's count, Remove; Clear students' drawings). Never on the
//     projector, never on a desk's window on the teacher's area.
//   - Locked while the teacher pauses screens or locks that student's desk. Limits: MARKS (lines, points, the class's
//     total) and saves a minute; a new line on another student's desk, the teacher's area or My desk is refused.
// Deleted with the class (school-delete.js BY_CLASS), the student's account (account-delete.js), a student leaving the
// class (onClassLeave) and an account merge.
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HV from './homeroom-live.js';
import { BOARD, DESK, TEAM_DESK, NAME_H, DEFAULT_GROUPS, frameOf, tdeskOf } from '../../public/js/homeroom-seats.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, n);

/** A student's lines at most, points a line, points in all; the class's lines in all; saves a minute. */
export const MARKS = { strokes: 40, points: 300, total: 4000, classStrokes: 900, perMin: 30 };
/** The pens a student draws with (the desk pad's). */
export const MARK_COLORS = H.DOODLE_COLORS;

// ---------------------------------------------------------------- the class's switch
/** Do this class's teachers let students draw on the room? Off unless they turned it on. */
export function drawOn(c) {
  if (!c) return false;
  const r = q.get('SELECT student_draw FROM homeroom_rooms WHERE class_id=?', c.id);
  return !!(r && r.student_draw === 1);
}
export const marksVersion = classId => (q.get('SELECT marks_v FROM homeroom_rooms WHERE class_id=?', classId) || {}).marks_v || 0;
const bump = classId => q.run('UPDATE homeroom_rooms SET marks_v=marks_v+1 WHERE class_id=?', classId);
/** The class's teachers (the Homeroom gate; never an aide or a sub) turn it on or off. Turning it off keeps what was
 *  drawn (Clear students' drawings takes it away). -> { ok, on } */
export function setDraw(u, c, on) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  if (typeof on !== 'boolean') return fail('badState');
  const t = now();
  q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', c.id, JSON.stringify(DEFAULT_GROUPS), t, t);
  q.run('UPDATE homeroom_rooms SET student_draw=?, marks_v=marks_v+1 WHERE class_id=?', on ? 1 : 0, c.id);
  audit(u.id, 'homeroom.studentDraw', c.id, { on });
  return ok({ on });
}

// ---------------------------------------------------------------- reading
const rowsOf = classId => q.all('SELECT user_id, strokes FROM homeroom_marks WHERE class_id=? ORDER BY updated_at', classId);
const studentIds = classId => new Set(H.studentsOf(classId).map(s => s.id));
/** Every student's lines in the class (current students only). -> [{ userId, strokes }] */
function marksOf(classId) {
  const ids = studentIds(classId);
  return rowsOf(classId).filter(r => ids.has(r.user_id)).map(r => ({ userId: r.user_id, strokes: json(r.strokes, []) })).filter(m => m.strokes.length);
}
/** What a student's See the room draws: their own lines (to erase) and everyone else's, without names. */
export function forStudent(c, u, v = null) {
  const ver = marksVersion(c.id), on = drawOn(c), out = { on, v: ver, locked: lockedFor(c, u) };
  if (String(v ?? '') === String(ver)) return out;
  const all = marksOf(c.id);
  return { ...out, mine: (all.find(m => m.userId === u.id) || { strokes: [] }).strokes, others: all.filter(m => m.userId !== u.id).flatMap(m => m.strokes) };
}
/** What the board draws (the class's teachers and aides): each student's lines with their name. */
export function forBoard(c, v = null) {
  const ver = marksVersion(c.id), on = drawOn(c);
  if (String(v ?? '') === String(ver)) return { on, v: ver };
  const names = new Map(H.studentsOf(c.id).map(s => [s.id, s.name]));
  return { on, v: ver, marks: marksOf(c.id).map(m => ({ id: m.userId, name: names.get(m.userId) || '', strokes: m.strokes })) };
}
/** Paused screens, or this student's desk locked, while class is live: no drawing. */
function lockedFor(c, u) {
  const live = H.liveOf(c.id);
  if (!live) return false;
  if (live.paused) return true;
  try { return !!(HV.mineOf(c, u.id) || {}).locked; } catch { return false; }
}

// ---------------------------------------------------------------- where a student may draw
/** The places a student may not draw on (board pixels): the teacher's area, My desk, every other student's desk and
 *  team desk with the name above it. Their own desk (or team's) is theirs. */
function offLimits(c, u) {
  const room = H.roomOf(c.id), fr = frameOf(room.area), td = tdeskOf(fr), out = [fr, td];
  const mine = room.teams.find(t => t.members.includes(u.id));
  const inTeam = new Set(room.teams.flatMap(t => t.members));
  for (const s of room.students) {
    if (s.id === u.id || inTeam.has(s.id)) continue;
    const p = room.seats[s.id]; if (p) out.push({ x: p.x, y: p.y - NAME_H, w: DESK.w, h: DESK.h + NAME_H });
  }
  for (const t of room.teams) if (t !== mine) out.push({ x: t.x, y: t.y - NAME_H, w: TEAM_DESK.w, h: TEAM_DESK.h + NAME_H });
  return out;
}
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const px = (v, max) => { const n = v === null || v === '' || typeof v === 'boolean' ? NaN : Number(v); return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(0, n)) * 10) / 10 : null; };
/** A student's lines as they may be kept: board pixels inside the board, a pen color, at least two points. */
export function cleanMarks(list) {
  if (!Array.isArray(list)) return fail('badState');
  if (list.length > MARKS.strokes) return fail('padFull');
  const out = []; let total = 0;
  for (const s of list) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.pts)) continue;
    if (s.pts.length > MARKS.points) return fail('padFull');
    const pts = [];
    for (const p of s.pts) { const x = px(p && p.x, BOARD.maxW), y = px(p && p.y, BOARD.maxH); if (x !== null && y !== null) pts.push({ x, y }); }
    if (new Set(pts.map(p => `${p.x},${p.y}`)).size < 2) continue;
    total += pts.length;
    if (total > MARKS.total) return fail('padFull');
    out.push({ id: clip(s.id, 40) || `m${out.length}`, c: MARK_COLORS.includes(s.c) ? s.c : MARK_COLORS[0], pts });
  }
  return ok({ strokes: out });
}

// a student's saves in the last minute (rate: MARKS.perMin)
const recent = new Map();
export const _resetRate = () => recent.clear();
function tooFast(key, at) {
  const list = (recent.get(key) || []).filter(t => at - t < 60e3);
  if (list.length >= MARKS.perMin) { recent.set(key, list); return true; }
  list.push(at); recent.set(key, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some(t => at - t < 60e3)) recent.delete(k);
  return false;
}

// ---------------------------------------------------------------- writing
/**
 * A student saves their lines on the room (all of them: drawn, or erased with their own eraser). Refused when the class's
 * teachers have not turned it on (forbidden), while screens are paused or their desk is locked (deskLocked), too often
 * (tooFast), too much (padFull, roomFull), or when a line they had not saved before touches another student's desk, the
 * teacher's area or My desk (notHere). -> { ok, v, mine }
 */
export function saveMine(u, c, list, at = now()) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  if (!drawOn(c)) return fail('drawOff');
  if (lockedFor(c, u)) return fail('deskLocked');
  if (tooFast(`${c.id}:${u.id}`, at)) return fail('tooFast');
  const r = cleanMarks(list); if (!r.ok) return r;
  const had = new Map(json((q.get('SELECT strokes FROM homeroom_marks WHERE class_id=? AND user_id=?', c.id, u.id) || {}).strokes, []).map(s => [s.id, JSON.stringify(s.pts)]));
  const fresh = r.strokes.filter(s => had.get(s.id) !== JSON.stringify(s.pts));
  // (a line erased in two keeps its points; a piece of a line they had is theirs to keep where it was)
  const oldPts = new Set([...had.values()].flatMap(v => json(v, []).map(p => `${p.x},${p.y}`)));
  const no = offLimits(c, u);
  for (const s of fresh) for (const p of s.pts) if (!oldPts.has(`${p.x},${p.y}`) && no.some(rc => inside(p, rc))) return fail('notHere');
  const others = q.all('SELECT strokes FROM homeroom_marks WHERE class_id=? AND user_id<>?', c.id, u.id).reduce((n, x) => n + json(x.strokes, []).length, 0);
  if (others + r.strokes.length > MARKS.classStrokes && r.strokes.length > had.size) return fail('roomFull');
  if (r.strokes.length) q.run('INSERT INTO homeroom_marks(class_id, user_id, strokes, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id, user_id) DO UPDATE SET strokes=excluded.strokes, updated_at=excluded.updated_at', c.id, u.id, JSON.stringify(r.strokes), at);
  else q.run('DELETE FROM homeroom_marks WHERE class_id=? AND user_id=?', c.id, u.id);
  bump(c.id);
  return ok({ v: marksVersion(c.id), mine: r.strokes });
}
/** The class's teachers remove one student's lines (studentId) or everyone's (Clear students' drawings). -> { ok } */
export function removeMarks(u, c, studentId = null) {
  if (!H.canUseClass(u, c)) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  if (studentId) q.run('DELETE FROM homeroom_marks WHERE class_id=? AND user_id=?', c.id, String(studentId));
  else q.run('DELETE FROM homeroom_marks WHERE class_id=?', c.id);
  bump(c.id);
  audit(u.id, 'homeroom.marks.remove', c.id, { student: studentId ? String(studentId) : 'all' });
  return ok();
}

// ---------------------------------------------------------------- leaving, merging
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (userId) q.run('DELETE FROM homeroom_marks WHERE class_id=? AND user_id=?', classId, userId);
  else q.run('DELETE FROM homeroom_marks WHERE class_id=?', classId);
});
S.onAccountMerge(({ from } = {}) => { if (from) q.run('DELETE FROM homeroom_marks WHERE user_id=?', from); });
