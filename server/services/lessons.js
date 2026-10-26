// Lesson plans: each teacher has a library per school (folders inside folders, lessons in the order they choose),
// lessons are lists of steps (play a game, build a game, read, answer a question), and lessons are assigned to classes, grouped in units.
//
// Who can do what:
//   the lesson's owner (while staff of its school) and that school's admins   edit, move, delete, share
//   staff of the school                                                       see lessons shared with the school, copy them
//   a class's teachers / school admins                                        assign lessons to the class, units, order, dates
//   students of the class                                                     see assigned lessons once they are open
// Assigned lessons are live links: editing the lesson changes it for every class. A lesson is in a class at most once;
// removing it from the class keeps the students' work (class_lessons.removed_at), and assigning it again brings it back.
import { q, uid, now, tx, audit } from '../db.js';
import * as S from './schools.js';
import * as games from './games.js';

export const STEP_KINDS = ['game', 'build', 'text', 'question'];
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
const clip = (s, n) => String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim().slice(0, n);
const clipText = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const nextPos = (table, where, ...params) => (q.get(`SELECT COALESCE(MAX(position), -1) + 1 p FROM ${table} WHERE ${where}`, ...params).p);
const isStaffOf = (u, schoolId) => { const r = S.roleIn(u, schoolId); return r === 'admin' || r === 'teacher'; };

// ---------------------------------------------------------------- lookups
export const getFolder = id => (id ? q.get('SELECT * FROM lesson_folders WHERE id=?', id) : null) || null;
export const getLesson = id => (id ? q.get('SELECT * FROM lessons WHERE id=?', id) : null) || null;
export const getStep = id => (id ? q.get('SELECT * FROM lesson_steps WHERE id=?', id) : null) || null;
export const getUnit = id => (id ? q.get('SELECT * FROM class_units WHERE id=?', id) : null) || null;
/** Rows read from class_lessons for display or progress carry tz: the school's time zone (IANA name) or null when it
 *  isn't set, so isOpen() and dueState() count days where the school is. One join per query, never a lookup per row. */
const SCHOOL_OF = 'JOIN classrooms c ON c.id=cl.class_id LEFT JOIN schools sch ON sch.id=c.school_id';
function withZones(rows) {
  const seen = new Map();
  for (const r of rows) {
    const k = r.school_settings || '';
    let tz = seen.get(k); if (tz === undefined) { tz = S.zoneOf({ settings: k }); seen.set(k, tz); }
    r.tz = tz; delete r.school_settings;
  }
  return rows;
}
/** An assignment that is still in its class (removed ones are invisible everywhere except to assign(), which revives them). */
export const getClassLesson = id => (id ? withZones(q.all(`SELECT cl.*, sch.settings school_settings FROM class_lessons cl ${SCHOOL_OF} WHERE cl.id=? AND cl.removed_at IS NULL`, id))[0] : null) || null;
export const steps = lessonId => q.all(`SELECT s.*, g.slug game_slug, g.title game_title, g.icon game_icon, g.status game_status, g.visibility game_visibility,
    g.owner_id game_owner, g.published_version_id game_live, g.hidden_reason game_hidden, g.source game_source
  FROM lesson_steps s LEFT JOIN games g ON g.id=s.game_id WHERE s.lesson_id=? ORDER BY s.position, s.created_at`, lessonId);

// ---------------------------------------------------------------- permissions
export function canEditLesson(u, l) {
  if (!u || !l) return false;
  if (S.canManageSchool(u, l.school_id)) return true;
  return l.owner_id === u.id && isStaffOf(u, l.school_id);
}
export const canSeeShared = (u, l) => !!(u && l && l.shared && !l.archived_at && isStaffOf(u, l.school_id));
const ownsFolder = (u, f) => !!(u && f && f.owner_id === u.id && isStaffOf(u, f.school_id));

// ---------------------------------------------------------------- folders
export const foldersOf = (ownerId, schoolId) => q.all('SELECT * FROM lesson_folders WHERE owner_id=? AND school_id=? ORDER BY position, name COLLATE NOCASE', ownerId, schoolId);
/** Folders as a flat list in tree order with depth, for menus. */
export function folderTree(ownerId, schoolId) {
  const all = foldersOf(ownerId, schoolId), out = [];
  const walk = (parent, depth) => all.filter(f => (f.parent_id || null) === parent).forEach(f => { out.push({ ...f, depth }); walk(f.id, depth + 1); });
  walk(null, 0);
  return out;
}
export function createFolder(u, schoolId, { name, parentId = null }) {
  if (!isStaffOf(u, schoolId)) return fail('notFound');
  const n = clip(name, 60); if (!n) return fail('folderName');
  if (parentId) { const p = getFolder(parentId); if (!ownsFolder(u, p) || p.school_id !== schoolId) return fail('notFound'); }
  const id = uid(10);
  q.run('INSERT INTO lesson_folders(id, school_id, owner_id, parent_id, name, position, created_at) VALUES (?,?,?,?,?,?,?)', id, schoolId, u.id, parentId || null, n,
    nextPos('lesson_folders', 'owner_id=? AND school_id=? AND parent_id IS ?', u.id, schoolId, parentId || null), now());
  return ok({ folder: getFolder(id) });
}
export function renameFolder(u, folderId, name) {
  const f = getFolder(folderId); if (!ownsFolder(u, f)) return fail('notFound');
  const n = clip(name, 60); if (!n) return fail('folderName');
  q.run('UPDATE lesson_folders SET name=? WHERE id=?', n, f.id);
  return ok();
}
/** Delete a folder: what was inside moves up to its parent (nothing is lost). */
export function deleteFolder(u, folderId) {
  const f = getFolder(folderId); if (!ownsFolder(u, f)) return fail('notFound');
  tx(() => {
    q.run('UPDATE lesson_folders SET parent_id=? WHERE parent_id=?', f.parent_id || null, f.id);
    q.run('UPDATE lessons SET folder_id=? WHERE folder_id=?', f.parent_id || null, f.id);
    q.run('DELETE FROM lesson_folders WHERE id=?', f.id);
  });
  return ok();
}
/** Move a folder into another one (or to the top). Never into itself or its own subfolders. */
export function moveFolder(u, folderId, parentId) {
  const f = getFolder(folderId); if (!ownsFolder(u, f)) return fail('notFound');
  if (parentId) {
    const p = getFolder(parentId); if (!ownsFolder(u, p) || p.school_id !== f.school_id) return fail('notFound');
    for (let x = p; x; x = getFolder(x.parent_id)) if (x.id === f.id) return fail('folderLoop');
  }
  q.run('UPDATE lesson_folders SET parent_id=?, position=? WHERE id=?', parentId || null, nextPos('lesson_folders', 'owner_id=? AND school_id=? AND parent_id IS ?', f.owner_id, f.school_id, parentId || null), f.id);
  return ok();
}

// ---------------------------------------------------------------- lessons
const LESSON_COLS = `l.*, (SELECT COUNT(*) FROM lesson_steps s WHERE s.lesson_id=l.id) steps,
  (SELECT COUNT(*) FROM class_lessons cl JOIN classrooms c ON c.id=cl.class_id WHERE cl.lesson_id=l.id AND cl.removed_at IS NULL) assigned`;
export const lessonsIn = (ownerId, schoolId, folderId = null) => q.all(`SELECT ${LESSON_COLS} FROM lessons l WHERE l.owner_id=? AND l.school_id=? AND l.folder_id IS ? AND l.archived_at IS NULL
  ORDER BY l.position, l.created_at`, ownerId, schoolId, folderId || null);
export const allLessonsOf = (ownerId, schoolId) => q.all(`SELECT ${LESSON_COLS} FROM lessons l WHERE l.owner_id=? AND l.school_id=? AND l.archived_at IS NULL ORDER BY l.title COLLATE NOCASE`, ownerId, schoolId);
/** Lessons that were in a class and were removed (not in it now): any teacher of the class can bring them back. */
export const removedFrom = classId => q.all(`SELECT DISTINCT l.id, l.title FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id
  WHERE cl.class_id=? AND cl.removed_at IS NOT NULL AND l.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM class_lessons x WHERE x.class_id=cl.class_id AND x.lesson_id=cl.lesson_id AND x.removed_at IS NULL)
  ORDER BY l.title COLLATE NOCASE`, classId);
/** Lessons colleagues shared with the school (not the viewer's own). */
export const sharedLessons = (u, schoolId) => q.all(`SELECT ${LESSON_COLS}, COALESCE(NULLIF(m.roster_name,''), u.display_name) owner_name FROM lessons l JOIN users u ON u.id=l.owner_id
  LEFT JOIN school_members m ON m.school_id=l.school_id AND m.user_id=l.owner_id WHERE l.school_id=? AND l.shared=1 AND l.archived_at IS NULL AND l.owner_id!=? ORDER BY l.updated_at DESC LIMIT 200`, schoolId, u.id);
export function createLesson(u, schoolId, { title, folderId = null, summary = '', subject = '', grade = '', objectives = '' }) {
  if (!isStaffOf(u, schoolId)) return fail('notFound');
  const ttl = clip(title, 100); if (!ttl) return fail('lessonTitle');
  if (folderId) { const f = getFolder(folderId); if (!ownsFolder(u, f) || f.school_id !== schoolId) return fail('notFound'); }
  const id = uid(10), t = now();
  q.run(`INSERT INTO lessons(id, school_id, owner_id, folder_id, title, summary, subject, grade, objectives, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, schoolId, u.id, folderId || null, ttl, clipText(summary, 600), clip(subject, 40), clip(grade, 12), clipText(objectives, 1000),
    nextPos('lessons', 'owner_id=? AND school_id=? AND folder_id IS ?', u.id, schoolId, folderId || null), t, t);
  audit(u.id, 'lesson.create', id, { school: schoolId });
  return ok({ lesson: getLesson(id) });
}
export function updateLesson(u, lessonId, fields = {}) {
  const l = getLesson(lessonId); if (!canEditLesson(u, l)) return fail('notFound');
  const v = {
    title: fields.title !== undefined ? clip(fields.title, 100) : l.title,
    summary: fields.summary !== undefined ? clipText(fields.summary, 600) : l.summary,
    subject: fields.subject !== undefined ? clip(fields.subject, 40) : l.subject,
    grade: fields.grade !== undefined ? clip(fields.grade, 12) : l.grade,
    objectives: fields.objectives !== undefined ? clipText(fields.objectives, 1000) : l.objectives,
    shared: fields.shared !== undefined ? (fields.shared ? 1 : 0) : l.shared,
  };
  if (!v.title) return fail('lessonTitle');
  q.run('UPDATE lessons SET title=?, summary=?, subject=?, grade=?, objectives=?, shared=?, updated_at=? WHERE id=?', v.title, v.summary, v.subject, v.grade, v.objectives, v.shared, now(), l.id);
  return ok({ lesson: getLesson(l.id) });
}
const touch = lessonId => q.run('UPDATE lessons SET updated_at=? WHERE id=?', now(), lessonId);
/** Delete a lesson, its steps, and its assignments to classes. */
export function deleteLesson(u, lessonId) {
  const l = getLesson(lessonId); if (!canEditLesson(u, l)) return fail('notFound');
  tx(() => {
    q.run('DELETE FROM step_progress WHERE class_lesson_id IN (SELECT id FROM class_lessons WHERE lesson_id=?)', l.id);
    q.run('DELETE FROM class_lessons WHERE lesson_id=?', l.id); q.run('DELETE FROM lesson_steps WHERE lesson_id=?', l.id); q.run('DELETE FROM lessons WHERE id=?', l.id);
  });
  audit(u.id, 'lesson.delete', l.id, { title: l.title });
  return ok();
}
export function moveLesson(u, lessonId, folderId) {
  const l = getLesson(lessonId); if (!canEditLesson(u, l) || l.owner_id !== u.id) return fail('notFound');
  if (folderId) { const f = getFolder(folderId); if (!ownsFolder(u, f) || f.school_id !== l.school_id) return fail('notFound'); }
  q.run('UPDATE lessons SET folder_id=?, position=? WHERE id=?', folderId || null, nextPos('lessons', 'owner_id=? AND school_id=? AND folder_id IS ?', l.owner_id, l.school_id, folderId || null), l.id);
  return ok();
}
/** Swap an item with its neighbour (dir -1 = up, 1 = down) among rows that share the same scope. */
function shift(table, id, dir, scopeSql, scopeParams) {
  const rows = q.all(`SELECT id, position FROM ${table} WHERE ${scopeSql} ORDER BY position, rowid`, ...scopeParams);
  const i = rows.findIndex(r => r.id === id), j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= rows.length) return false;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  tx(() => rows.forEach((r, k) => q.run(`UPDATE ${table} SET position=? WHERE id=?`, k, r.id)));
  return true;
}
export function reorderLesson(u, lessonId, dir) {
  const l = getLesson(lessonId); if (!canEditLesson(u, l)) return fail('notFound');
  shift('lessons', l.id, dir, 'owner_id=? AND school_id=? AND folder_id IS ? AND archived_at IS NULL', [l.owner_id, l.school_id, l.folder_id || null]);
  return ok();
}
export function reorderFolder(u, folderId, dir) {
  const f = getFolder(folderId); if (!ownsFolder(u, f)) return fail('notFound');
  shift('lesson_folders', f.id, dir, 'owner_id=? AND school_id=? AND parent_id IS ?', [f.owner_id, f.school_id, f.parent_id || null]);
  return ok();
}
/** Copy a lesson (own, or shared by a colleague) into the user's library. */
export function copyLesson(u, lessonId, { folderId } = {}) {
  const l = getLesson(lessonId);
  if (!l || !(canEditLesson(u, l) || canSeeShared(u, l))) return fail('notFound');
  // A copy of your own lesson lands next to it (same folder); a colleague's lesson goes to the top of your library.
  if (folderId === undefined) folderId = l.owner_id === u.id ? l.folder_id || null : null;
  const r = createLesson(u, l.school_id, { title: l.owner_id === u.id ? `${l.title} (2)` : l.title, folderId, summary: l.summary, subject: l.subject, grade: l.grade, objectives: l.objectives });
  if (!r.ok) return r;
  tx(() => {
    q.run('UPDATE lessons SET copied_from=? WHERE id=?', l.id, r.lesson.id);
    for (const s of steps(l.id)) q.run('INSERT INTO lesson_steps(id, lesson_id, position, kind, title, body, game_id, minutes, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(10), r.lesson.id, s.position, s.kind, s.title, s.body, s.game_id, s.minutes, now());
  });
  audit(u.id, 'lesson.copy', r.lesson.id, { from: l.id });
  return ok({ lesson: getLesson(r.lesson.id) });
}

// ---------------------------------------------------------------- steps
function cleanStep(u, input, old = {}) {
  const kind = input.kind !== undefined ? input.kind : old.kind;
  if (!STEP_KINDS.includes(kind)) return fail('stepKind');
  const v = {
    kind,
    title: input.title !== undefined ? clip(input.title, 100) : old.title || '',
    body: input.body !== undefined ? clipText(input.body, 4000) : old.body || '',
    minutes: input.minutes !== undefined ? Math.max(0, Math.min(240, Math.round(+input.minutes || 0))) : old.minutes || 0,
    game_id: input.gameId !== undefined ? (input.gameId || null) : old.game_id || null,
  };
  if (kind !== 'game') v.game_id = null;
  if (kind === 'game') {
    if (!v.game_id) return fail('pickGame');
    const g = games.getGame(v.game_id);
    if (!g || g.status === 'deleted' || !(games.canView(u, g) || g.owner_id === u.id)) return fail('pickGame');
  }
  if (kind === 'build' && !v.body) return fail('buildPrompt');
  if (kind === 'text' && !v.body && !v.title) return fail('stepText');
  if (kind === 'question' && !v.body) return fail('questionText');
  return ok({ v });
}
export function addStep(u, lessonId, input) {
  const l = getLesson(lessonId); if (!canEditLesson(u, l)) return fail('notFound');
  if (q.get('SELECT COUNT(*) n FROM lesson_steps WHERE lesson_id=?', l.id).n >= 40) return fail('tooManySteps');
  const c = cleanStep(u, input || {}); if (!c.ok) return c;
  const id = uid(10);
  q.run('INSERT INTO lesson_steps(id, lesson_id, position, kind, title, body, game_id, minutes, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, l.id, nextPos('lesson_steps', 'lesson_id=?', l.id), c.v.kind, c.v.title, c.v.body, c.v.game_id, c.v.minutes, now());
  touch(l.id);
  return ok({ step: getStep(id) });
}
export function updateStep(u, stepId, input) {
  const s = getStep(stepId); const l = s && getLesson(s.lesson_id); if (!canEditLesson(u, l)) return fail('notFound');
  const c = cleanStep(u, input || {}, s); if (!c.ok) return c;
  q.run('UPDATE lesson_steps SET kind=?, title=?, body=?, game_id=?, minutes=? WHERE id=?', c.v.kind, c.v.title, c.v.body, c.v.game_id, c.v.minutes, s.id);
  touch(l.id);
  return ok();
}
export function deleteStep(u, stepId) {
  const s = getStep(stepId); const l = s && getLesson(s.lesson_id); if (!canEditLesson(u, l)) return fail('notFound');
  tx(() => { q.run('DELETE FROM step_progress WHERE step_id=?', s.id); q.run('DELETE FROM lesson_steps WHERE id=?', s.id); }); touch(l.id);
  return ok();
}
export function reorderStep(u, stepId, dir) {
  const s = getStep(stepId); const l = s && getLesson(s.lesson_id); if (!canEditLesson(u, l)) return fail('notFound');
  shift('lesson_steps', s.id, dir, 'lesson_id=?', [l.id]); touch(l.id);
  return ok();
}

// ---------------------------------------------------------------- games for steps
/** Can the class's students open this game? Live, not hidden, and public, shared with this school, or (classId)
 *  shared with this class ('class' games are never playable without knowing the class). */
export function playableBy(step, schoolId, classId = null) {
  if (!step.game_id) return true;
  if (step.game_status !== 'published' || !step.game_live || step.game_hidden) return false;
  if (step.game_visibility === 'public') return true;
  if (step.game_visibility === 'school') return !!S.membership(schoolId, step.game_owner);
  if (step.game_visibility === 'class') return !!classId && games.gameLiveInClass(step.game_id, classId);
  return false;
}
/** Games a teacher can put in a lesson: their own, ones shared in the school, ones shared with a class they teach
 *  (classes), and the site's public games. Only school + site go to the AI lesson-draft catalog. */
export function gamesForPicker(u, schoolId) {
  const sel = 'SELECT g.id, g.title, g.icon, g.slug, g.status, g.visibility, g.source FROM games g';
  const mine = q.all(`${sel} WHERE g.owner_id=? AND g.status!='deleted' AND g.current_version_id IS NOT NULL ORDER BY g.updated_at DESC LIMIT 100`, u.id);
  const school = q.all(`${sel} WHERE g.status='published' AND g.hidden_reason='' AND g.visibility IN ('school','public') AND g.owner_id!=?
    AND g.owner_id IN (SELECT user_id FROM school_members WHERE school_id=? AND status='active') ORDER BY g.published_at DESC LIMIT 100`, u.id, schoolId);
  const classes = games.classGamesForTeacher(u.id, schoolId).map(({ published_at, ...g }) => g);
  const seen = new Set([...mine, ...school, ...classes].map(g => g.id));
  const site = q.all(`${sel} WHERE g.status='published' AND g.visibility='public' AND g.hidden_reason='' ORDER BY g.featured DESC, g.plays DESC LIMIT 150`).filter(g => !seen.has(g.id));
  return { mine, school, classes, site };
}

// ---------------------------------------------------------------- class lessons
export const unitsOf = classId => q.all('SELECT * FROM class_units WHERE class_id=? ORDER BY position, created_at', classId);
export const classLessons = classId => withZones(q.all(`SELECT cl.*, l.title, l.summary, l.subject, l.grade, l.owner_id, l.school_id, sch.settings school_settings,
    (SELECT COUNT(*) FROM lesson_steps s WHERE s.lesson_id=l.id) steps, (SELECT COALESCE(SUM(minutes),0) FROM lesson_steps s WHERE s.lesson_id=l.id) minutes
  FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id ${SCHOOL_OF} WHERE cl.class_id=? AND cl.removed_at IS NULL ORDER BY cl.position, cl.assigned_at`, classId));

// ---------------------------------------------------------------- days in the school's time zone
// opens_at / due_at are stored as the calendar day at 00:00 UTC and mean "this date". With a school time zone, the date
// starts at that zone's local midnight; without one, days are counted in UTC with a 36-hour grace (see dueState).
const DAY = 24 * 3600e3;
const dtfs = new Map();
const dtf = tz => { let f = dtfs.get(tz); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); dtfs.set(tz, f); } return f; };
/** The zone's wall clock at instant t, as numbers { year, month, day, hour, minute, second }. */
function wall(tz, t) { const p = {}; for (const x of dtf(tz).formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = +x.value; return p; }
/** The zone's UTC offset (ms) at instant t: its wall clock read as UTC, minus t. */
const offsetAt = (tz, t) => { const p = wall(tz, t); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(t / 1000) * 1000; };
/** The calendar day (as a 00:00 UTC value) that instant t falls on in the zone. */
const localDay = (tz, t) => { const p = wall(tz, t); return Date.UTC(p.year, p.month - 1, p.day); };
/** The instant a stored day starts in a zone (its local midnight). DST: the offset at the first guess is read and the
 *  guess adjusted once; on the rare day a zone moves its clocks at midnight itself, the earliest instant that is on
 *  the date wins (so a date that starts at 01:00 still starts when it begins). */
function dayStart(day, tz) {
  const a = day - offsetAt(tz, day), b = day - offsetAt(tz, a);
  if (a === b) return a;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return localDay(tz, lo) === day ? lo : hi;
}
const boundsCache = new Map();
/** For a stored day and an IANA zone: { start, end } = when that date starts there and when the next one does (ms). */
export function dayBounds(day, tz) {
  day = Math.floor(day / DAY) * DAY;
  const key = `${tz}|${day}`;
  let r = boundsCache.get(key);
  if (!r) { if (boundsCache.size > 20000) boundsCache.clear(); r = { start: dayStart(day, tz), end: dayStart(day + DAY, tz) }; boundsCache.set(key, r); }
  return r;
}
/** The row's school zone (rows from classLessons / getClassLesson / assignedClasses carry tz), only if Node knows it. */
const zoneFor = cl => (cl && typeof cl.tz === 'string' && S.isZone(cl.tz) ? cl.tz : null);
/** Open from local midnight of opens_at where the school is; from 00:00 UTC without a zone. No opens_at: always open. */
export function isOpen(cl, t = now()) {
  if (!cl.opens_at) return true;
  const tz = zoneFor(cl);
  return (tz ? dayBounds(cl.opens_at, tz).start : cl.opens_at) <= t;
}
/** With a school time zone: 'today' during the due day there, 'late' from the next local midnight, 'upcoming' before.
 *  Without one: 'today' during the due day (UTC); 'due' after it; 'late' only once the due day is over everywhere
 *  (+36h), so nobody is late on the due day in any time zone. null when there is no due date. */
export const LATE_AFTER = 36 * 3600e3;
export function dueState(cl, t = now()) {
  if (!cl || !cl.due_at) return null;
  const tz = zoneFor(cl);
  if (tz) { const { start, end } = dayBounds(cl.due_at, tz); return t >= end ? 'late' : t >= start ? 'today' : 'upcoming'; }
  if (t >= cl.due_at + LATE_AFTER) return 'late';
  if (t >= cl.due_at + DAY) return 'due';
  if (t >= cl.due_at) return 'today';
  return 'upcoming';
}
/** Units in order, each with its lessons; lessons without a unit come first (unit null). openOnly: what students see. */
export function classPlan(classId, { openOnly = false } = {}) {
  const ls = classLessons(classId).filter(cl => !openOnly || isOpen(cl));
  const groups = [{ unit: null, lessons: ls.filter(cl => !cl.unit_id) }];
  for (const u of unitsOf(classId)) groups.push({ unit: u, lessons: ls.filter(cl => cl.unit_id === u.id) });
  return openOnly ? groups.filter(g => g.lessons.length) : groups;
}
const managed = (u, classId) => { const c = S.getClass(classId); return c && S.canManageClass(u, c) ? c : null; };
/** 'YYYY-MM-DD' (or any date Date.parse reads) -> that calendar day at 00:00 UTC; '' -> null; unreadable -> undefined. */
const dateOrNull = v => { if (v === null || v === '' || v === undefined) return null; const t = Date.parse(String(v).length === 10 ? `${v}T00:00:00Z` : v); return Number.isFinite(t) ? Math.floor(t / DAY) * DAY : undefined; };
export function createUnit(u, classId, name) {
  const c = managed(u, classId); if (!c) return fail('notFound');
  const n = clip(name, 60); if (!n) return fail('unitName');
  const id = uid(10);
  q.run('INSERT INTO class_units(id, class_id, name, position, created_at) VALUES (?,?,?,?,?)', id, c.id, n, nextPos('class_units', 'class_id=?', c.id), now());
  return ok({ unit: getUnit(id) });
}
export function renameUnit(u, unitId, name) {
  const un = getUnit(unitId); if (!un || !managed(u, un.class_id)) return fail('notFound');
  const n = clip(name, 60); if (!n) return fail('unitName');
  q.run('UPDATE class_units SET name=? WHERE id=?', n, un.id);
  return ok();
}
/** Delete a unit: its lessons stay in the class, without a unit. */
export function deleteUnit(u, unitId) {
  const un = getUnit(unitId); if (!un || !managed(u, un.class_id)) return fail('notFound');
  // Its lessons go after the lessons already outside a unit, in their order (so positions never tie).
  tx(() => {
    let p = nextPos('class_lessons', 'class_id=? AND unit_id IS NULL AND removed_at IS NULL', un.class_id);
    for (const r of q.all('SELECT id FROM class_lessons WHERE unit_id=? AND removed_at IS NULL ORDER BY position, assigned_at', un.id)) q.run('UPDATE class_lessons SET unit_id=NULL, position=? WHERE id=?', p++, r.id);
    q.run('UPDATE class_lessons SET unit_id=NULL WHERE unit_id=?', un.id);
    q.run('DELETE FROM class_units WHERE id=?', un.id);
  });
  return ok();
}
export function reorderUnit(u, unitId, dir) {
  const un = getUnit(unitId); if (!un || !managed(u, un.class_id)) return fail('notFound');
  shift('class_units', un.id, dir, 'class_id=?', [un.class_id]);
  return ok();
}
/** Assign a lesson to a class. The teacher must be able to edit the lesson or see it shared in the class's school. */
export function assign(u, classId, lessonId, { unitId = null, opensAt = null, dueAt = null } = {}) {
  const c = managed(u, classId); if (!c) return fail('notFound');
  const l = getLesson(lessonId);
  // Assigned before and removed: bring it back with its students' work (any teacher of the class may undo a removal).
  const old = l && q.get('SELECT id FROM class_lessons WHERE class_id=? AND lesson_id=? AND removed_at IS NOT NULL ORDER BY removed_at DESC LIMIT 1', c.id, l.id);
  // Otherwise only lessons you can edit (yours, or any in the school for its admins): a colleague's lesson is copied first.
  if (!l || l.school_id !== c.school_id || !(old || canEditLesson(u, l))) return fail('notFound');
  if (unitId) { const un = getUnit(unitId); if (!un || un.class_id !== c.id) return fail('notFound'); }
  const o = dateOrNull(opensAt), d = dateOrNull(dueAt);
  if (o === undefined || d === undefined) return fail('badDate');
  if (q.get('SELECT 1 FROM class_lessons WHERE class_id=? AND lesson_id=? AND removed_at IS NULL', c.id, l.id)) return { ok: false, code: 'alreadyAssigned', className: c.name };
  const pos = nextPos('class_lessons', 'class_id=? AND unit_id IS ? AND removed_at IS NULL', c.id, unitId || null);
  const id = old ? old.id : uid(10);
  if (old) q.run('UPDATE class_lessons SET removed_at=NULL, unit_id=?, position=?, opens_at=?, due_at=?, assigned_by=?, assigned_at=? WHERE id=?', unitId || null, pos, o, d, u.id, now(), id);
  else q.run('INSERT INTO class_lessons(id, class_id, lesson_id, unit_id, position, opens_at, due_at, assigned_by, assigned_at) VALUES (?,?,?,?,?,?,?,?,?)', id, c.id, l.id, unitId || null, pos, o, d, u.id, now());
  audit(u.id, 'lesson.assign', c.id, { lesson: l.id, restored: !!old });
  // restored: the row came back; workBack: and students had work in it.
  const workBack = !!old && !!q.get('SELECT 1 FROM step_progress WHERE class_lesson_id=? LIMIT 1', id);
  return ok({ classLesson: getClassLesson(id), restored: !!old, workBack });
}
export function updateAssignment(u, clId, { unitId, opensAt, dueAt } = {}) {
  const cl = getClassLesson(clId); if (!cl || !managed(u, cl.class_id)) return fail('notFound');
  const v = { unit_id: cl.unit_id, opens_at: cl.opens_at, due_at: cl.due_at, position: cl.position };
  if (unitId !== undefined) {
    if (unitId) { const un = getUnit(unitId); if (!un || un.class_id !== cl.class_id) return fail('notFound'); }
    if ((unitId || null) !== cl.unit_id) { v.unit_id = unitId || null; v.position = nextPos('class_lessons', 'class_id=? AND unit_id IS ? AND removed_at IS NULL', cl.class_id, v.unit_id); }
  }
  if (opensAt !== undefined) { const o = dateOrNull(opensAt); if (o === undefined) return fail('badDate'); v.opens_at = o; }
  if (dueAt !== undefined) { const d = dateOrNull(dueAt); if (d === undefined) return fail('badDate'); v.due_at = d; }
  q.run('UPDATE class_lessons SET unit_id=?, position=?, opens_at=?, due_at=? WHERE id=?', v.unit_id, v.position, v.opens_at, v.due_at, cl.id);
  return ok();
}
export function unassign(u, clId) {
  const cl = getClassLesson(clId); if (!cl || !managed(u, cl.class_id)) return fail('notFound');
  // Students' work is kept: the assignment is only marked removed, and assigning the lesson again brings it back.
  q.run('UPDATE class_lessons SET removed_at=? WHERE id=?', now(), cl.id);
  audit(u.id, 'lesson.unassign', cl.class_id, { lesson: cl.lesson_id });
  return ok();
}
export function reorderAssignment(u, clId, dir) {
  const cl = getClassLesson(clId); if (!cl || !managed(u, cl.class_id)) return fail('notFound');
  shift('class_lessons', cl.id, dir, 'class_id=? AND unit_id IS ? AND removed_at IS NULL', [cl.class_id, cl.unit_id || null]);
  return ok();
}
/** A lesson as a class sees it: for the class's managers, or its students once open. */
export function canViewClassLesson(u, cl) {
  if (!u || !cl) return false;
  const c = S.getClass(cl.class_id); if (!c) return false;
  if (S.canManageClass(u, c)) return true;
  return S.canViewClass(u, c) && isOpen(cl);
}
/** Classes (managed by u) that a lesson is assigned to. */
export const assignedClasses = lessonId => withZones(q.all(`SELECT cl.id, cl.class_id, cl.opens_at, cl.due_at, c.name, c.archived_at, sch.settings school_settings FROM class_lessons cl ${SCHOOL_OF} WHERE cl.lesson_id=? AND cl.removed_at IS NULL ORDER BY c.name`, lessonId));
/** How much student work a delete would lose: students with any progress on a step / in a lesson (all its classes). */
export const stepWork = stepId => q.get('SELECT COUNT(DISTINCT user_id) n FROM step_progress WHERE step_id=?', stepId).n;
export const lessonWork = lessonId => q.get('SELECT COUNT(DISTINCT p.user_id) n FROM step_progress p JOIN class_lessons cl ON cl.id=p.class_lesson_id WHERE cl.lesson_id=?', lessonId).n;
/** Classes a lesson is in now (any teacher's), for the delete warning. */
export const lessonClassCount = lessonId => q.get('SELECT COUNT(*) n FROM class_lessons cl JOIN classrooms c ON c.id=cl.class_id WHERE cl.lesson_id=? AND cl.removed_at IS NULL', lessonId).n;
/** Students who have started any of these class lessons (for the editor's "live" notice). */
export const startedIn = clIds => (clIds.length ? q.get(`SELECT COUNT(DISTINCT user_id) n FROM step_progress WHERE class_lesson_id IN (${clIds.map(() => '?').join(',')})`, ...clIds).n : 0);
/** How many lessons colleagues share in a school (the viewer's own are not counted). */
export const sharedCount = (u, schoolId) => q.get('SELECT COUNT(*) n FROM lessons WHERE school_id=? AND shared=1 AND archived_at IS NULL AND owner_id!=?', schoolId, u.id).n;
