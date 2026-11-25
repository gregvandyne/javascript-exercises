// Homeroom (docs/homeroom.md; docs/decisions.md "Homeroom, step 1a"): the board a teacher runs a class from. This step is
// the foundation: the gate, the class's Homeroom tab, the board (built on the Manipulatives live room: its view, its
// teacher's area with notes, text and pen, its cleaning and saving), a desk per student placed where they really sit,
// and the teacher's groups. Handouts, plans and sign-in come later.
//
// Who gets it (gate): HOMEROOM on (off by default: off means nobody, the platform admin included, as MANIPULATIVES=0),
// then the platform admin, or school staff whose username is in HOMEROOM_USERS ('*': every teacher) and who have the
// Teacher plan (services/teacher-plan.js teacherPlan: their own plan or a grant, a trial included, or a school seat).
// Never a guest, a banned account, a grown-up's account or a student. A class's Homeroom: one of its own teachers (or the
// platform admin), the class not archived. Everyone else gets the normal 404 and sees today's class page unchanged.
//
// What is stored (homeroom_rooms, one row per class): the seating (the preset last picked and each desk's place), the
// groups and who is in which, and the teacher's area. Desks are only ever drawn for the current roster; a student who
// leaves the class loses their desk and group (onClassLeave).
//
// Step 1b (docs/decisions.md "Homeroom, step 1b"): the student desk (canUseDesk: the class's own students, the class
// having Homeroom through one of its teachers), their doodle and working-out pad (homeroom_doodles), live class
// (liveOf / setLive: only the class's teachers change it, students only read it) and what desks and the projector read
// (boardState: the live state and the teacher's area, never a name).
import { q, now, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup, getUser } from '../auth.js';
import * as S from './schools.js';
import { teacherPlan } from './teacher-plan.js';
import { cleanState, textProblem } from './manipulatives.js';
import { PRESETS, AREA, DEFAULT_GROUPS, GROUP_COLORS, GROUPS_MAX, GROUP_NAME_MAX, clampSeat, seatAll } from '../../public/js/homeroom-seats.js';

export { PRESETS, AREA };
const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);
const nameOf = r => r.roster_name || r.display_name;

// ---------------------------------------------------------------- who
export const on = () => !!config.homeroom;
/** On the Homeroom list (HOMEROOM_USERS; '*' is everyone)? */
export const onList = u => !!u && (config.homeroomUsers.includes('*') || config.homeroomUsers.includes(String(u.username || '').toLowerCase()));
/** May this account use Homeroom at all? */
export function canUse(u) {
  if (!on() || !u || u.is_guest || u.banned || isGrownup(u)) return false;
  if (S.isPlatformAdmin(u)) return true;
  if (!S.isSchoolStaff(u) || !onList(u)) return false;
  return !!teacherPlan(u.id).entitled;
}
/** May this account open this class's Homeroom? Its own teachers (and the platform admin); never an archived class. */
export function canUseClass(u, c) {
  if (!c || c.archived_at || !canUse(u)) return false;
  return S.isPlatformAdmin(u) || (S.teaches(u, c.id) && !!S.membership(c.school_id, u.id));
}

// ---------------------------------------------------------------- the room
const rowOf = classId => q.get('SELECT * FROM homeroom_rooms WHERE class_id=?', classId) || null;
/** The class's students in roster order: [{ id, name }]. */
export const studentsOf = classId => S.roster(classId).filter(p => p.role === 'student').map(p => ({ id: p.id, name: nameOf(p) }));
/** The room as the page draws it: every current student seated, the groups (defaults for a new class), who is in which
 *  (only current students, only groups that exist) and the teacher's area. */
export function roomOf(classId) {
  const r = rowOf(classId), students = studentsOf(classId), ids = students.map(s => s.id);
  const preset = r && PRESETS.includes(r.preset) ? r.preset : 'rows';
  const groups = r ? json(r.groups, []) : DEFAULT_GROUPS.map(g => ({ ...g }));
  const gids = new Set(groups.map(g => g.id)), stored = r ? json(r.members, {}) : {};
  const members = {}; for (const id of ids) if (gids.has(stored[id])) members[id] = stored[id];
  return { students, preset, seats: seatAll(ids, r ? json(r.seats, {}) : {}, preset), groups, members, area: r ? json(r.area, {}) : {}, updatedAt: r ? r.updated_at : 0 };
}
function save(u, classId, fields) {
  const t = now(), r = rowOf(classId);
  if (!r) q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?)', classId, JSON.stringify(DEFAULT_GROUPS), t, t);
  const cols = Object.keys(fields);
  q.run(`UPDATE homeroom_rooms SET ${cols.map(c => `${c}=?`).join(', ')}, updated_by=?, updated_at=? WHERE class_id=?`, ...cols.map(c => fields[c]), u.id, t, classId);
}

/** Arrange seats: the preset picked and every desk's place. Places for anyone not in the class are dropped; a student
 *  left out keeps their place. -> { ok, seats, preset } */
export function saveSeats(u, c, { preset, seats } = {}) {
  if (!canUseClass(u, c)) return fail('notFound');
  if (preset !== undefined && !PRESETS.includes(preset)) return fail('badPreset');
  if (!seats || typeof seats !== 'object' || Array.isArray(seats)) return fail('badSeats');
  const ids = new Set(studentsOf(c.id).map(s => s.id)), cur = roomOf(c.id), next = { ...cur.seats };
  for (const [id, p] of Object.entries(seats).slice(0, 500)) {
    if (!ids.has(id)) continue;
    const at = clampSeat(p); if (!at) return fail('badSeats');
    next[id] = at;
  }
  const pre = preset || cur.preset;
  save(u, c.id, { seats: JSON.stringify(next), preset: pre });
  audit(u.id, 'homeroom.seats', c.id, { preset: pre });
  return ok({ seats: next, preset: pre });
}

/** The teacher's groups ([{ id, key?, name, color }], 1 to GROUPS_MAX; a default group keeps its key while its name is
 *  empty) and who is in which ({ studentId: groupId }, current students only; no group is fine). -> { ok, groups, members } */
export function saveGroups(u, c, { groups, members } = {}) {
  if (!canUseClass(u, c)) return fail('notFound');
  if (!Array.isArray(groups) || !groups.length || groups.length > GROUPS_MAX) return fail('badGroups');
  const out = [], seen = new Set();
  for (const g of groups) {
    if (!g || typeof g !== 'object') return fail('badGroups');
    const id = clip(g.id, 20).replace(/[^\w-]/g, '');
    if (!id || seen.has(id)) return fail('badGroups');
    const name = clip(g.name, GROUP_NAME_MAX).replace(/\s+/g, ' ').trim();
    const key = DEFAULT_GROUPS.some(d => d.key === g.key) && !name ? g.key : null;
    if (!name && !key) return fail('groupName');
    if (name && textProblem(name)) return fail('words');
    if (!GROUP_COLORS.includes(g.color)) return fail('badGroups');
    seen.add(id); out.push({ id, ...(key ? { key } : {}), name, color: g.color });
  }
  const ids = new Set(studentsOf(c.id).map(s => s.id)), m = {};
  if (members && typeof members === 'object' && !Array.isArray(members)) for (const [sid, gid] of Object.entries(members)) if (ids.has(sid) && seen.has(gid)) m[sid] = gid;
  save(u, c.id, { groups: JSON.stringify(out), members: JSON.stringify(m) });
  audit(u.id, 'homeroom.groups', c.id, { groups: out.length });
  return ok({ groups: out, members: m });
}

/** Shapes in the teacher's area (rectangles, circles and lines in its fractions of the area; a pen color). */
export const SHAPES_MAX = 40;
const SHAPE_KINDS = ['rect', 'circle', 'line'], HEX = /^#[0-9a-fA-F]{6}$/;
const frac = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000 : 0; };
function cleanShapes(list) {
  return (Array.isArray(list) ? list : []).filter(s => s && typeof s === 'object' && SHAPE_KINDS.includes(s.k)).slice(0, SHAPES_MAX)
    .map((s, i) => ({ id: clip(s.id || `s${i}`, 40), k: s.k, x: frac(s.x), y: frac(s.y), x2: frac(s.x2), y2: frac(s.y2), c: HEX.test(s.c) ? s.c : '#141414' }));
}
/** The teacher's area: sticky notes, text, pen marks (cleaned as the live room's teacher's area is: services/manipulatives.js
 *  cleanState, the site's word rules included) and shapes. -> { ok, area } */
export function saveArea(u, c, state) {
  if (!canUseClass(u, c)) return fail('notFound');
  if (!state || typeof state !== 'object' || Array.isArray(state)) return fail('badState');
  const ann = state.__ann && typeof state.__ann === 'object' ? state.__ann : {};
  const r = cleanState({ v: 2, objects: [], __ann: { notes: ann.notes, texts: ann.texts, strokes: ann.strokes } }, { w: AREA.w, h: AREA.h, teacher: true });
  if (!r.ok) return r;
  const area = { ...JSON.parse(r.state), shapes: cleanShapes(state.shapes) };
  save(u, c.id, { area: JSON.stringify(area) });
  return ok({ area });
}

/** The classes this teacher can switch to from Homeroom (their own, not archived), by name. */
export const switchable = u => S.classesOf(u.id, 'teacher').filter(c => !c.archived_at).map(c => ({ id: c.id, name: c.name }));

// ---------------------------------------------------------------- the student desk and live class (step 1b)
// A class has Homeroom for its students when the flag is on, the class isn't archived, and at least one of its own
// teachers may use Homeroom (canUse: the list and the Teacher plan, or the platform admin). Students never see why not:
// anyone else gets the site's 404. A desk is only for the class's own active students.
const teacherIds = classId => q.all("SELECT user_id FROM class_members WHERE class_id=? AND role='teacher' AND status='active'", classId).map(r => r.user_id);
/** Does this class have Homeroom (for its students)? */
export function classHasHomeroom(c) {
  if (!on() || !c || c.archived_at) return false;
  return teacherIds(c.id).some(id => canUse(getUser(id)));
}
const isStudentOf = (u, c) => !!u && !u.is_guest && !u.banned && !!c && (S.classMember(c.id, u.id) || {}).role === 'student';
/** May this account open their desk in this class? Its own students, the class having Homeroom. */
export const canUseDesk = (u, c) => isStudentOf(u, c) && classHasHomeroom(c);

/** A class left live ends by itself after this long (a teacher who forgot End class). */
export const LIVE_MAX_MS = 6 * 3600e3;
const LIVE_ACTIONS = ['start', 'bring', 'back', 'pause', 'resume', 'end'];
/** The class's live state: null (not live) or { since, bring, paused }. */
export function liveOf(classId) {
  const r = rowOf(classId);
  if (!r || !r.live_at || now() - r.live_at > LIVE_MAX_MS) return null;
  return { since: r.live_at, bring: !!r.live_bring, paused: !!r.live_paused };
}
/** Live class, by the class's teachers only: start (Everyone to Homeroom), bring / back (Bring everyone to me, and
 *  back to desks), pause / resume (Pause screens), end (End class). -> { ok, live } */
export function setLive(u, c, action) {
  if (!canUseClass(u, c)) return fail('notFound');
  if (!LIVE_ACTIONS.includes(action)) return fail('badAction');
  const cur = liveOf(c.id);
  if (action === 'start') {
    if (!cur) save(u, c.id, { live_at: now(), live_bring: 0, live_paused: 0 });
  } else if (action === 'end') {
    if (rowOf(c.id)) save(u, c.id, { live_at: null, live_bring: 0, live_paused: 0 });
  } else {
    if (!cur) return fail('notLive');
    const f = { bring: { live_bring: 1 }, back: { live_bring: 0 }, pause: { live_paused: 1 }, resume: { live_paused: 0 } }[action];
    save(u, c.id, f);
  }
  audit(u.id, 'homeroom.live', c.id, { action });
  return ok({ live: liveOf(c.id) });
}
/** What a desk or the projector reads every few seconds: the live state and, when it changed since version v (the
 *  room's updated_at the page last saw), the teacher's area. Never a name, a seat or anyone's work. */
export function boardState(classId, v = null) {
  const r = rowOf(classId), ver = r ? r.updated_at : 0;
  return { live: liveOf(classId), v: ver, ...(String(v) === String(ver) ? {} : { area: r ? json(r.area, {}) : {} }) };
}
/** The live classes this student is in that have Homeroom: [{ id, name, since }] (the "Your class is in Homeroom" prompt). */
export function liveDesksFor(u) {
  if (!on() || !u || u.is_guest) return [];
  const rows = q.all(`SELECT c.* FROM class_members m JOIN classrooms c ON c.id=m.class_id JOIN homeroom_rooms h ON h.class_id=c.id
    WHERE m.user_id=? AND m.role='student' AND m.status='active' AND h.live_at IS NOT NULL AND h.live_at>?`, u.id, now() - LIVE_MAX_MS);
  return rows.filter(c => canUseDesk(u, c)).map(c => ({ id: c.id, name: c.name, since: (liveOf(c.id) || {}).since || 0 }));
}
/** Might this student ever get the prompt (one cheap query: a class of theirs has a Homeroom room)? Pages load the
 *  prompt's script only then. */
export const mayGetPrompt = u => on() && !!u && !u.is_guest && !!q.get(`SELECT 1 FROM class_members m JOIN homeroom_rooms h ON h.class_id=m.class_id
  WHERE m.user_id=? AND m.role='student' AND m.status='active' LIMIT 1`, u.id);

/** See the room, for a student: every desk where the teacher seated it, with the name classmates see on the class page
 *  (display names; the roster's real names stay the teacher's) and no work. Group colors only on their own desk. */
export function roomForStudent(c, u) {
  const room = roomOf(c.id), names = new Map(S.roster(c.id).filter(p => p.role === 'student').map(p => [p.id, p.display_name]));
  const g = room.groups.find(x => x.id === room.members[u.id]);
  return { desks: room.students.map(s => ({ id: s.id, name: names.get(s.id) || '', ...room.seats[s.id], ...(s.id === u.id ? { me: true } : {}) })), color: g ? g.color : null };
}

/** The doodle and working-out pad: pen strokes in fractions of a DOODLE.w x DOODLE.h page, a pen color each. */
export const DOODLE = { w: 900, h: 600, strokes: 150, points: 400, total: 15000, bytes: 400000 };
export const DOODLE_COLORS = ['#141414', '#1E88E5', '#1F9D63', '#FF6B4A', '#8C6BD1'];
export const doodleOf = (classId, userId) => json((q.get('SELECT strokes FROM homeroom_doodles WHERE class_id=? AND user_id=?', classId, userId) || {}).strokes, []);
/** Save a student's pad (theirs only, in a class with Homeroom): at most DOODLE.strokes strokes and DOODLE.total points,
 *  each point inside the page, a known pen color; a stroke of one point is dropped. -> { ok, strokes } */
export function saveDoodle(u, c, strokes) {
  if (!canUseDesk(u, c)) return fail('notFound');
  if (!Array.isArray(strokes)) return fail('badState');
  if (strokes.length > DOODLE.strokes) return fail('padFull');
  const out = []; let total = 0;
  for (const s of strokes) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.pts)) return fail('badState');
    const pts = s.pts.slice(0, DOODLE.points).map(p => ({ x: frac(p && p.x), y: frac(p && p.y) }));
    if (pts.length < 2) continue;
    total += pts.length; if (total > DOODLE.total) return fail('padFull');
    out.push({ c: DOODLE_COLORS.includes(s.c) ? s.c : DOODLE_COLORS[0], pts });
  }
  const text = JSON.stringify(out); if (text.length > DOODLE.bytes) return fail('padFull');
  q.run(`INSERT INTO homeroom_doodles(class_id, user_id, strokes, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET strokes=excluded.strokes, updated_at=excluded.updated_at`, c.id, u.id, text, now());
  return ok({ strokes: out });
}

// A student leaves a class (or the class goes): their desk, group and pad go with them.
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (!userId) { q.run('DELETE FROM homeroom_doodles WHERE class_id=?', classId); return; }
  q.run('DELETE FROM homeroom_doodles WHERE class_id=? AND user_id=?', classId, userId);
  const r = rowOf(classId); if (!r) return;
  const seats = json(r.seats, {}), members = json(r.members, {});
  if (!(userId in seats) && !(userId in members)) return;
  delete seats[userId]; delete members[userId];
  q.run('UPDATE homeroom_rooms SET seats=?, members=? WHERE class_id=?', JSON.stringify(seats), JSON.stringify(members), classId);
});

// A school account merged into the student's own account: their pad moves with the class membership.
S.onAccountMerge(({ from, into } = {}) => {
  if (!from || !into) return;
  q.run('UPDATE OR IGNORE homeroom_doodles SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM homeroom_doodles WHERE user_id=?', from);
});
