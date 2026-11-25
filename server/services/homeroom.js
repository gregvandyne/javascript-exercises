// Homeroom (docs/homeroom.md; docs/decisions.md "Homeroom, step 1a"): the board a teacher runs a class from. This step is
// the foundation: the gate, the class's Homeroom tab, the board (built on the Manipulatives live room: its view, its
// teacher's area with notes, text and pen, its cleaning and saving), a desk per student placed where they really sit,
// and the teacher's groups. Handouts and plans come later; quick sign-in is services/homeroom-signin.js (step 1c).
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
//
// Step 2c (docs/decisions.md "Homeroom, step 2c"): team desks (homeroom_rooms.teams): students who share one desk. The
// teacher makes one in Arrange seats from the desks they pick and splits it again; it sits where it is dragged, shows its
// members' names, and a handout dropped on it goes to every member (services/homeroom-handouts.js studentsFor). Members
// keep their own seats (hidden while they are in a team, so a split puts them back) and share one doodle pad
// (homeroom_doodles, user_id 'team:<id>'): any member draws on it.
import { q, now, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup, getUser } from '../auth.js';
import * as S from './schools.js';
import { teacherPlan } from './teacher-plan.js';
import { cleanState, textProblem, LIMITS } from './manipulatives.js';
import { cleanShapes, SHAPES_MAX, PALETTE, noteStyle, textStyle, strokeStyle } from '../../public/js/board-shapes.js';
import { cleanInk } from '../../public/js/homeroom-ink.js';
import { PRESETS, AREA, NOTE_BOX, DEFAULT_GROUPS, GROUP_COLORS, GROUPS_MAX, GROUP_NAME_MAX, TEAM_MAX, TEAMS_MAX, clampSeat, seatAll } from '../../public/js/homeroom-seats.js';

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

// ---------------------------------------------------------------- helpers: aides and subs (step 3c)
// Other adults who help in a class's Homeroom without running it (docs/decisions.md "Homeroom: supports, aides and sub
// links"): an aide (services/homeroom-aides.js) or a sub through a one-day link (services/homeroom-sub.js). Each module
// registers fn(u, c) -> 'aide' | 'sub' | null, so this module imports neither. canUseClass stays the class's own
// teachers only: everything that changes the class (seating, groups, handouts, grading, plans, the AI) keeps asking it,
// and a helper is let in only where a service asks helperRole for the few things a helper may do.
const helperHooks = [];
export const onHelper = fn => { if (!helperHooks.includes(fn)) helperHooks.push(fn); };
/** 'aide' | 'sub' | null: how this person (or a sub link's actor) helps in this class. Never for its own teachers. */
export function helperRole(u, c) {
  if (!on() || !u || !c || c.archived_at) return null;
  for (const fn of helperHooks) { const r = fn(u, c); if (r) return r; }
  return null;
}
/** May this person do what a teacher or a helper of the given roles may (a teacher always may)? */
export const canHelp = (u, c, roles = ['aide', 'sub']) => canUseClass(u, c) || roles.includes(helperRole(u, c));

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
  const seats = seatAll(ids, r ? json(r.seats, {}) : {}, preset);
  return { students, preset, seats, groups, members, teams: teamsOf(r, ids, seats), area: r ? json(r.area, {}) : {}, updatedAt: r ? r.updated_at : 0 };
}
/** The class's team desks as drawn: only current students, a student in one team at most, 2 or more members each. */
function teamsOf(r, ids, seats = {}) {
  const now = new Set(ids), used = new Set(), out = [];
  for (const t of r ? json(r.teams, []) : []) {
    if (!t || typeof t !== 'object' || !Array.isArray(t.members)) continue;
    const m = t.members.filter(id => now.has(id) && !used.has(id));
    if (m.length < 2) continue;
    m.forEach(id => used.add(id));
    const at = clampSeat(t) || seats[m[0]] || { x: 0, y: 0 };
    out.push({ id: String(t.id), members: m, x: at.x, y: at.y });
  }
  return out;
}
/** The team a student of the class is in now, or null. */
export const teamOf = (classId, userId) => roomOf(classId).teams.find(t => t.members.includes(userId)) || null;
/** The key of a team's shared pad in homeroom_doodles. */
export const teamPadKey = teamId => `team:${teamId}`;
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

/**
 * Team desks (Arrange seats): { action: 'make', members: [studentId...], x?, y? } puts 2 to TEAM_MAX of the class's
 * students who are in no team yet at one desk (where the first one sat unless x, y are given); { action: 'split', id }
 * ends a team (its shared pad goes; every member is back at their own desk); { action: 'move', id, x, y } moves it.
 * The class's teachers only. -> { ok, teams, team? }
 */
export function saveTeams(u, c, { action, id = '', members = [], x, y } = {}) {
  if (!canUseClass(u, c)) return fail('notFound');
  const room = roomOf(c.id), teams = room.teams.map(t => ({ ...t }));
  if (action === 'make') {
    const ids = new Set(room.students.map(s => s.id));
    const list = [...new Set(Array.isArray(members) ? members.map(String) : [])];
    if (list.length < 2) return fail('teamTooSmall');
    if (list.length > TEAM_MAX) return fail('teamTooBig');
    if (list.some(sid => !ids.has(sid))) return fail('notInClass');
    if (list.some(sid => teams.some(t => t.members.includes(sid)))) return fail('alreadyInTeam');
    if (teams.length >= TEAMS_MAX) return fail('tooManyTeams');
    const at = (x !== undefined && y !== undefined ? clampSeat({ x, y }) : null) || room.seats[list[0]];
    const team = { id: `t${Math.random().toString(36).slice(2, 10)}`, members: list, x: at.x, y: at.y };
    teams.push(team);
    save(u, c.id, { teams: JSON.stringify(teams) });
    audit(u.id, 'homeroom.team', c.id, { action, members: list.length });
    return ok({ teams, team });
  }
  const t = teams.find(z => z.id === String(id || ''));
  if (!t) return fail('noTeam');
  if (action === 'move') {
    const at = clampSeat({ x, y }); if (!at) return fail('badSeats');
    Object.assign(t, at);
    save(u, c.id, { teams: JSON.stringify(teams) });
    return ok({ teams, team: t });
  }
  if (action === 'split') {
    const rest = teams.filter(z => z !== t);
    save(u, c.id, { teams: JSON.stringify(rest) });
    q.run('DELETE FROM homeroom_doodles WHERE class_id=? AND user_id=?', c.id, teamPadKey(t.id));
    audit(u.id, 'homeroom.team', c.id, { action, members: t.members.length });
    return ok({ teams: rest });
  }
  return fail('badAction');
}

/** Shapes in the teacher's area (public/js/board-shapes.js: every kind the Shapes picker offers, in fractions of the
 *  area, with their style from strict lists: palette colors, weights, dashes, arrowheads, rotation, layer order). */
export { SHAPES_MAX };
const frac = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000 : 0; };
const firstById = list => { const m = new Map(); for (const n of Array.isArray(list) ? list : []) if (n && typeof n === 'object' && !m.has(String(n.id))) m.set(String(n.id), n); return m; };
/** The teacher's area: sticky notes, text, pen marks (cleaned as the live room's teacher's area is: services/manipulatives.js
 *  cleanState, the site's word rules included) and shapes, then Homeroom's own fields on them (board-shapes.js: a note's
 *  size and color, a text box's color, weight, alignment and rotation, a pen line's id, weight, dash and layer, a lock),
 *  and the board's own pen lines outside the area (`ink`, public/js/homeroom-ink.js cleanInk).
 *  -> { ok, area } */
export function saveArea(u, c, state) {
  if (!canUseClass(u, c)) return fail('notFound');
  if (!state || typeof state !== 'object' || Array.isArray(state)) return fail('badState');
  const ann = state.__ann && typeof state.__ann === 'object' ? state.__ann : {};
  // the pen lines cleanState will keep, in its order (it keeps those with a list of points, up to its limit)
  const strokesIn = (Array.isArray(ann.strokes) ? ann.strokes : []).filter(s => s && Array.isArray(s.pts)).slice(0, LIMITS.strokes);
  const r = cleanState({ v: 2, objects: [], __ann: { notes: ann.notes, texts: ann.texts, strokes: strokesIn } }, { w: AREA.w, h: AREA.h, teacher: true });
  if (!r.ok) return r;
  // Pen lines drawn elsewhere on the board (public/js/homeroom-ink.js), in board pixels; an older board has none.
  const ink = cleanInk(state.ink);
  const area = { ...JSON.parse(r.state), shapes: cleanShapes(state.shapes), ...(ink.length ? { ink } : {}) };
  const out = area.__ann || {};
  // A sticky note's size (resized in both directions on the board), within NOTE_BOX; the live room's notes have none.
  const notes = firstById(ann.notes), texts = firstById(ann.texts);
  for (const n of out.notes || []) {
    const o = notes.get(String(n.id)), w = o ? Number(o.w) : NaN, h = o ? Number(o.h) : NaN;
    if (Number.isFinite(w) && Number.isFinite(h)) { n.w = Math.round(Math.min(NOTE_BOX.wMax, Math.max(NOTE_BOX.wMin, w))); n.h = Math.round(Math.min(NOTE_BOX.hMax, Math.max(NOTE_BOX.hMin, h))); }
    if (o) Object.assign(n, noteStyle(o));
  }
  for (const x of out.texts || []) { const o = texts.get(String(x.id)); if (o) Object.assign(x, textStyle(o)); }
  (out.strokes || []).forEach((s, i) => {
    const o = strokesIn[i] || {};
    if (!PALETTE.includes(s.c)) s.c = '#141414';
    Object.assign(s, o.id ? { id: clip(o.id, 40) } : {}, strokeStyle(o));
  });
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
/** What a sub may do to live class (an aide changes none of it: docs/decisions.md "Homeroom: supports, aides and sub
 *  links"). */
export const SUB_LIVE = ['start', 'bring', 'back', 'pause', 'resume', 'end'];
// Told after a teacher starts or ends live class (services/homeroom-signin.js: starting opens the class sign-in, End
// class closes it and signs out the class's shared devices): fn({ by, c, action }).
const liveHooks = [];
export const onLive = fn => { if (!liveHooks.includes(fn)) liveHooks.push(fn); };
/** The class's live state: null (not live) or { since, bring, paused }. */
export function liveOf(classId) {
  const r = rowOf(classId);
  if (!r || !r.live_at || now() - r.live_at > LIVE_MAX_MS) return null;
  return { since: r.live_at, bring: !!r.live_bring, paused: !!r.live_paused };
}
/** Live class, by the class's teachers only: start (Everyone to Homeroom), bring / back (Bring everyone to me, and
 *  back to desks), pause / resume (Pause screens), end (End class). -> { ok, live } */
export function setLive(u, c, action) {
  if (!canUseClass(u, c)) {
    if (helperRole(u, c) !== 'sub') return fail(helperRole(u, c) ? 'forbidden' : 'notFound');
    if (!SUB_LIVE.includes(action)) return fail('forbidden');
  }
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
  if (action === 'start' || action === 'end') for (const fn of liveHooks) fn({ by: u, c, action, wasLive: !!cur });
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
  // A team desk (step 2c) is drawn once, with its members' names, where the teacher put it.
  const inTeam = new Map(room.teams.flatMap(t => t.members.map(m => [m, t])));
  const mine = inTeam.get(u.id) || null;
  const desks = room.students.filter(s => !inTeam.has(s.id)).map(s => ({ id: s.id, name: names.get(s.id) || '', ...room.seats[s.id], ...(s.id === u.id ? { me: true } : {}) }));
  const teams = room.teams.map(t => ({ id: t.id, names: t.members.map(m => names.get(m) || ''), x: t.x, y: t.y, ...(t === mine ? { me: true } : {}) }));
  return { desks, teams, color: g ? g.color : null, team: mine ? { id: mine.id, names: mine.members.filter(m => m !== u.id).map(m => names.get(m) || '') } : null };
}

/** The doodle and working-out pad: pen strokes in fractions of a DOODLE.w x DOODLE.h page, a pen color each. */
export const DOODLE = { w: 900, h: 600, strokes: 150, points: 400, total: 15000, bytes: 400000 };
export const DOODLE_COLORS = ['#141414', '#1E88E5', '#1F9D63', '#FF6B4A', '#8C6BD1'];
const padRow = (classId, key) => q.get('SELECT strokes, updated_at FROM homeroom_doodles WHERE class_id=? AND user_id=?', classId, key) || null;
/** Whose pad a student draws on: their team's (step 2c: shared by every member) or their own. */
export const padKeyFor = (classId, userId) => { const t = teamOf(classId, userId); return t ? teamPadKey(t.id) : userId; };
export const doodleOf = (classId, userId) => json((padRow(classId, padKeyFor(classId, userId)) || {}).strokes, []);
/** The pad's version (when it was last saved; 0: never): a team's desks ask for it to see each other's drawing. */
export const padVersion = (classId, userId) => (padRow(classId, padKeyFor(classId, userId)) || {}).updated_at || 0;
/** Save a student's pad (theirs, or their team's: any member writes it; in a class with Homeroom): at most DOODLE.strokes
 *  strokes and DOODLE.total points, each point inside the page, a known pen color; a stroke of one point is dropped.
 *  base: the pad version the page last saw; on a team pad another member may have saved since, and then nothing is
 *  saved and the current pad comes back (padChanged) so the page adds its new strokes to it and saves again.
 *  -> { ok, strokes, pv } */
export function saveDoodle(u, c, strokes, { base = null } = {}) {
  if (!canUseDesk(u, c)) return fail('notFound');
  const key = padKeyFor(c.id, u.id), team = key !== u.id;
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
  const cur = padRow(c.id, key);
  if (team && base !== null && cur && String(base) !== String(cur.updated_at)) return { ok: false, code: 'padChanged', strokes: json(cur.strokes, []), pv: cur.updated_at };
  // A version that always moves on (two saves in one millisecond still differ).
  const t = Math.max(now(), cur ? cur.updated_at + 1 : 0);
  q.run(`INSERT INTO homeroom_doodles(class_id, user_id, strokes, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(class_id, user_id) DO UPDATE SET strokes=excluded.strokes, updated_at=excluded.updated_at`, c.id, key, text, t);
  return ok({ strokes: out, pv: t });
}

// A student leaves a class (or the class goes): their desk, group and pad go with them.
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (!userId) { q.run('DELETE FROM homeroom_doodles WHERE class_id=?', classId); q.run('DELETE FROM homeroom_feedback WHERE class_id=?', classId); return; }
  q.run('DELETE FROM homeroom_doodles WHERE class_id=? AND user_id=?', classId, userId);
  q.run('DELETE FROM homeroom_feedback WHERE class_id=? AND user_id=?', classId, userId);
  const r = rowOf(classId); if (!r) return;
  const seats = json(r.seats, {}), members = json(r.members, {}), teams = json(r.teams, []);
  // Their team loses them; a team left with one member is split (its shared pad goes).
  const inTeam = teams.some(t => t && Array.isArray(t.members) && t.members.includes(userId));
  if (!(userId in seats) && !(userId in members) && !inTeam) return;
  delete seats[userId]; delete members[userId];
  const left = [];
  for (const t of teams) {
    if (!t || !Array.isArray(t.members)) continue;
    const m = t.members.filter(id => id !== userId);
    if (m.length >= 2) left.push({ ...t, members: m }); else q.run('DELETE FROM homeroom_doodles WHERE class_id=? AND user_id=?', classId, teamPadKey(t.id));
  }
  q.run('UPDATE homeroom_rooms SET seats=?, members=?, teams=? WHERE class_id=?', JSON.stringify(seats), JSON.stringify(members), JSON.stringify(left), classId);
});

// A school account merged into the student's own account: their pad moves with the class membership.
S.onAccountMerge(({ from, into } = {}) => {
  if (!from || !into) return;
  q.run('UPDATE OR IGNORE homeroom_doodles SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM homeroom_doodles WHERE user_id=?', from);
  q.run('UPDATE OR IGNORE homeroom_feedback SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM homeroom_feedback WHERE user_id=?', from);
  // their place on team desks
  for (const r of q.all("SELECT class_id, teams FROM homeroom_rooms WHERE teams LIKE ?", `%${from}%`)) {
    const teams = json(r.teams, []).map(t => (t && Array.isArray(t.members) ? { ...t, members: [...new Set(t.members.map(m => (m === from ? into : m)))] } : t));
    q.run('UPDATE homeroom_rooms SET teams=? WHERE class_id=?', JSON.stringify(teams), r.class_id);
  }
});
