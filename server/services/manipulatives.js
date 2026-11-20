// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"): 18 tools on one board, saved boards with
// share codes, live class sessions and an AI lesson drafter. Hidden while it is tested (config.manipulatives).
//
// Who may use it:
//   - hosts: the platform admin, and school staff whose username is in MANIPULATIVES_USERS. Only hosts save boards
//     (each saved board gets a share code), run live sessions, push boards, export and draft with AI.
//   - students: a signed-in student of a class whose teacher (a host) is running a session for it. A join code finds
//     the session, but only that class's own students get in; for anyone else the code is the same 404 as a wrong one.
//   - everyone else: the normal 404, on the page and on every API.
// What each person sees:
//   - a saved board is its owner's: only the owner lists it or deletes it. Opening a share code copies the board into
//     the opener's own board (the saved one never changes).
//   - a student's work in a session (their board, their sticky notes) is seen by that student and the session's teacher
//     (and the platform admin) only. Students never see another student's work; there is no text between students.
//   - the teacher sees students by the name the class roster shows them (roster name, else display name), as on the
//     class page. Names stay on the teacher's dashboard and its PDF; they are never sent to the AI.
// Every board that is saved, pushed or sent in is rebuilt here (cleanState): an object, at most STATE_MAX characters,
// sticky notes and labels checked with the site's word rules (textfilter.js), counts and sizes capped.
import crypto from 'node:crypto';
import { q, uid, now, audit } from '../db.js';
import { config } from '../config.js';
import { isGrownup, getUser } from '../auth.js';
import * as S from './schools.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { hasProfanity, personalInfo } from './textfilter.js';
import { TOOLS, toolOf, pieceDefs, roomLayout, ROOM_COLORS, instructionNotes, stripHeight, stepsOf, stepStripTexts, TEACHER_STEP_H } from '../../public/js/manip-data.js';
import * as LIVE from './manip-live.js';
import { WORLD, OBJECTS, OBJ_MAX, OBJ_MAX_SQUARE, S_MIN, S_MAX, kindOf, objSize, migrate, reframe, newBoard } from '../../public/js/manip-board.js';
import { buildPractice, PRACTICE_TABLE, PRACTICE_HELP, PRACTICE_MAX, STEPS_MAX } from '../../public/js/manip-practice.js';
import { allow } from './ratelimit.js';
import { TASKS } from '../../public/js/manip-tasks.js';

export { TOOLS, TASKS };
export const STATE_MAX = 200000;
export const LIMITS = { texts: 30, textChars: 200, steps: 20, boards: 500, notes: 12, noteChars: 300, strokes: 80, points: 600, pieces: 400, titleChars: 80, briefChars: 1000 };
/** A session ends on its own this long after it starts; ended sessions (and their work) go after KEEP_DAYS. */
export const SESSION_HOURS = 12;
export const KEEP_DAYS = 30;
const HOUR = 3600e3, DAY = 86400e3;
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Test hooks: create replaces the AI client's messages.create (no network in tests). */
export const hooks = { create: null };

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------------------------------------------------------------- who may use it
export const on = () => !!config.manipulatives;
/** May this account host (save boards with share codes, run sessions, draft with AI)? */
export function canHost(u) {
  if (!on() || !u || u.is_guest || u.banned || isGrownup(u)) return false;
  if (S.isPlatformAdmin(u)) return true;
  return config.manipulativesUsers.includes(String(u.username || '').toLowerCase()) && S.isSchoolStaff(u);
}
const isStudentOf = (u, classId) => {
  const c = S.getClass(classId);
  const m = u && c && !c.archived_at ? S.classMember(c.id, u.id) : null;
  return !!(m && m.role === 'student' && S.membership(c.school_id, u.id));
};
/** May this host run a session for this class? Its own teacher, or an admin of its school (by membership). */
export function canHostClass(u, c) {
  if (!canHost(u) || !c || c.archived_at) return false;
  const m = S.membership(c.school_id, u.id);
  return !!m && (S.teaches(u, c.id) || m.role === 'admin');
}
/** Lazy upkeep: sessions past SESSION_HOURS end; ended ones older than KEEP_DAYS go (their work with them). */
export function prune(t = now()) {
  for (const r of q.all("SELECT id FROM manip_sessions WHERE status='active' AND created_at<?", t - SESSION_HOURS * HOUR)) LIVE.forget(r.id);
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE status='active' AND created_at<?", t, t - SESSION_HOURS * HOUR);
  q.run("DELETE FROM manip_sessions WHERE status='ended' AND ended_at<?", t - KEEP_DAYS * DAY);
}
/** The sessions a student can see now: active ones for their classes (whose teacher may still host), and ones they
 *  joined that ended in the last hours. */
export function studentSessions(u) {
  if (!on() || !u || u.is_guest || u.banned) return [];
  const t = now();
  const rows = q.all(`SELECT s.*, c.name class_name, (SELECT 1 FROM manip_work w WHERE w.session_id=s.id AND w.user_id=?) joined FROM manip_sessions s
    JOIN class_members m ON m.class_id=s.class_id AND m.user_id=? AND m.status='active' AND m.role='student' JOIN classrooms c ON c.id=s.class_id
    WHERE c.archived_at IS NULL AND (s.status='active' AND s.created_at>? OR s.ended_at>?) ORDER BY s.created_at DESC`, u.id, u.id, t - SESSION_HOURS * HOUR, t - SESSION_HOURS * HOUR);
  return rows.filter(s => (s.status === 'active' || s.joined) && isStudentOf(u, s.class_id) && canHost(getUser(s.host_id)));
}
/** 'host' | 'student' | null (null: the normal 404). */
export function roleOf(u) {
  if (canHost(u)) return 'host';
  return studentSessions(u).length ? 'student' : null;
}

// ---------------------------------------------------------------- boards (the JSON a tool saves)
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const clipStr = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, '').slice(0, n);
/** Every string in a value (keys too), at most a few thousand. */
function strings(v, out = [], depth = 0) {
  if (out.length > 5000 || depth > 8) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out, depth + 1);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out, depth + 1); }
  return out;
}
/** Text someone typed (a sticky note, a bar label): null when fine, else 'words' | 'personal'. The site's word list and
 *  its personal-information rules (phone numbers, emails, links, addresses, contact talk). Not the family link-code
 *  shape: a note only ever reaches its writer and their teacher, and "Build 246 with blocks" looks like one. */
export function textProblem(s) {
  const v = String(s || '');
  if (!v.trim()) return null;
  if (hasProfanity(v)) return 'words';
  const pi = personalInfo(v);
  return pi && pi !== 'handle' ? 'personal' : null;
}
/** Every object kind of any tool (cleaning a board whose tool is not given). */
const ANY_KIND = new Set(Object.values(OBJECTS).flat().map(K => K.k));
export const OBJ_STATE_MAX = 20000;
/** The objects on a board (format 2), as they may be stored: known kinds of the tool, at most `max`, each one's own state
 *  a plain object of limited size, its scale within limits, and its place inside the space (a room square: bounds). */
function cleanObjects(list, tool, space, max) {
  const ok1 = k => (tool ? !!kindOf(tool, k) : ANY_KIND.has(k));
  return (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object' && ok1(o.k) && o.st && typeof o.st === 'object' && !Array.isArray(o.st) && JSON.stringify(o.st).length <= OBJ_STATE_MAX)
    .slice(0, max).map((o, i) => {
      const z = tool ? objSize(tool, o) : { w: 100, h: 100 };
      const s = Math.round(num(o.s, S_MIN, Math.max(S_MIN, Math.min(S_MAX, space.w / z.w, space.h / z.h)), 1) * 1000) / 1000;
      return { id: clipStr(o.id || `o${i}`, 40), k: String(o.k), x: Math.round(num(o.x, 0, Math.max(0, space.w - z.w * s))), y: Math.round(num(o.y, 0, Math.max(0, space.h - z.h * s))), s, st: o.st };
    });
}
/** Typed text inside objects: bar labels, an object's label, a student's typed answer (ans) and the teacher's answer
 *  (key). Read with the word rules like sticky notes. */
const objectTexts = objects => (objects || []).flatMap(o => [o.st.label, o.st.ans, o.st.key, ...(Array.isArray(o.st.bars) ? o.st.bars.flatMap(b => [b && b.name, ...((b && Array.isArray(b.segs)) ? b.segs.map(x => x && x.label) : [])]) : [])]).filter(x => typeof x === 'string');
/** A board without the teacher's answers (an answer box's or an equation's `key`): what a student may be sent. */
export function withoutKeys(stateText) {
  const o = typeof stateText === 'string' ? json(stateText, null) : stateText;
  if (!o || typeof o !== 'object' || !Array.isArray(o.objects)) return typeof stateText === 'string' ? stateText : JSON.stringify(o || {});
  const out = { ...o, objects: o.objects.map(x => { if (!x || !x.st || !('key' in x.st)) return x; const st = { ...x.st }; delete st.key; return { ...x, st }; }) };
  return JSON.stringify(out);
}
/** A board as it may be stored: { ok, state (JSON text) } | { ok:false, code: 'badState'|'tooBig'|'words'|'personal' }.
 *  bounds: a live room square's work space (everything is kept inside it); tool: the board's tool (its object kinds). */
export function cleanState(raw, bounds = null, tool = null) {
  const o = typeof raw === 'string' ? (raw.length > STATE_MAX ? null : json(raw, null)) : raw;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return fail('badState');
  const st = { ...o };
  const v2 = st.v === 2, space = bounds || WORLD;
  if (v2) st.objects = cleanObjects(st.objects, tool, space, bounds ? (bounds.teacher ? OBJ_MAX : OBJ_MAX_SQUARE) : OBJ_MAX);
  else delete st.objects;
  if (Array.isArray(st.pieces)) st.pieces = st.pieces.slice(0, LIMITS.pieces).filter(p => p && typeof p === 'object').map(p => (p.g === undefined ? p : { ...p, g: clipStr(p.g, 40) }));
  // In a live room a square's pieces stay inside it: their places are clamped to the square (bounds: its size); on a
  // format-2 board, inside the big board.
  if ((bounds || v2) && Array.isArray(st.pieces)) st.pieces = st.pieces.map(p => { const w = num(p.w, 4, space.w, 50), h = num(p.h, 4, space.h, 50); return { ...p, w, h, x: num(p.x, 0, space.w - w), y: num(p.y, 0, space.h - h) }; });
  const ann = st.__ann && typeof st.__ann === 'object' ? st.__ann : null;
  if (ann) {
    st.__ann = {
      // Text typed straight on the board (the T tool): plain words at a place, no card.
      texts: (Array.isArray(ann.texts) ? ann.texts : []).filter(n => n && typeof n === 'object' && String(n.text || '').trim()).slice(0, LIMITS.texts)
        .map((n, i) => ({ id: clipStr(n.id || `t${i}`, 40), text: clipStr(n.text, LIMITS.textChars), x: num(n.x, 0, 1), y: num(n.y, 0, 1), ...(n.by === 't' ? { by: 't' } : {}) })),
      notes: (Array.isArray(ann.notes) ? ann.notes : []).filter(n => n && typeof n === 'object').slice(0, LIMITS.notes)
        .map((n, i) => ({ id: clipStr(n.id || `n${i}`, 40), text: clipStr(n.text, LIMITS.noteChars), x: num(n.x, 0, 1), y: num(n.y, 0, 1), ...(n.by === 't' ? { by: 't' } : {}) })),
      strokes: (Array.isArray(ann.strokes) ? ann.strokes : []).filter(s => s && Array.isArray(s.pts)).slice(0, LIMITS.strokes)
        .map(s => ({ c: HEX.test(s.c) ? s.c : '#FF6B4A', pts: s.pts.slice(0, LIMITS.points).map(p => ({ x: num(p && p.x, 0, 1), y: num(p && p.y, 0, 1) })) })),
      // The board's size on the screen it was made on (the teacher's view draws it at that size, scaled to fit).
      ...(!v2 && ann.size && typeof ann.size === 'object' ? { size: { w: Math.round(num(ann.size.w, 100, 4000, 800)), h: Math.round(num(ann.size.h, 100, 4000, 430)) } } : {}),
    };
  }
  // A deck of steps (the teacher's exercise): at most LIMITS.steps, each a short text.
  if (Array.isArray(st.__steps)) st.__steps = st.__steps.filter(x => x && typeof x === 'object' && String(x.text || '').trim()).slice(0, LIMITS.steps)
    .map((x, i) => ({ id: clipStr(x.id || `s${i}`, 40), text: clipStr(x.text, LIMITS.noteChars).trim() }));
  else delete st.__steps;
  // Typed text: sticky notes and bar labels are read with the word rules; every other string must at least be clean.
  const typed = [...(st.__steps || []).map(x => x.text), ...(st.__ann ? [...st.__ann.notes, ...st.__ann.texts].map(n => n.text) : []),
    ...(Array.isArray(st.bars) ? st.bars.flatMap(b => [b && b.name, ...((b && Array.isArray(b.segs)) ? b.segs.map(x => x && x.label) : [])]) : []), ...objectTexts(st.objects)];
  for (const s of typed) { const p = textProblem(s); if (p) return fail(p); }
  if (strings(st).some(s => hasProfanity(s))) return fail('words');
  const text = JSON.stringify(st);
  if (text.length > STATE_MAX) return fail('tooBig');
  return ok({ state: text });
}
function newCode() {
  for (;;) {
    const c = Array.from({ length: 8 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');
    if (!q.get('SELECT 1 FROM manip_boards WHERE code=?', c) && !q.get('SELECT 1 FROM manip_sessions WHERE code=?', c)) return c;
  }
}
export const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const cleanTitle = (s, d) => { const v = clipStr(s, LIMITS.titleChars).trim(); return v && !textProblem(v) ? v : d; };

/** A host saves a board: it gets its own share code. -> { ok, board: { id, code } } | fail */
export function saveBoard(u, { tool, title, state } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const c = cleanState(state, null, tl.slug); if (!c.ok) return c;
  if (q.get('SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?', u.id).n >= LIMITS.boards) return fail('tooMany');
  const id = uid(12), code = newCode();
  q.run('INSERT INTO manip_boards(id, owner_id, code, tool, title, state, created_at) VALUES (?,?,?,?,?,?,?)', id, u.id, code, tl.slug, cleanTitle(title, tl.name), c.state, now());
  return ok({ board: { id, code } });
}
/** The owner's own boards, newest first (no states). */
export const listBoards = u => (canHost(u) ? q.all('SELECT id, code, tool, title, created_at FROM manip_boards WHERE owner_id=? ORDER BY created_at DESC, rowid DESC LIMIT 100', u.id) : []);
/** One of the owner's boards, with its state. */
export const ownBoard = (u, id) => (u ? q.get('SELECT id, code, tool, title, state, created_at FROM manip_boards WHERE id=? AND owner_id=?', String(id || ''), u.id) || null : null);
/** Only the owner deletes a board. */
export function deleteBoard(u, id) {
  const b = ownBoard(u, id); if (!b) return fail('notFound');
  q.run('DELETE FROM manip_boards WHERE id=? AND owner_id=?', b.id, u.id);
  return ok();
}
/** A share code opens a copy: the tool and the board, for the opener's own board. Anyone who may use the page. */
export function openCode(u, code) {
  if (!roleOf(u)) return fail('notFound');
  const b = q.get('SELECT code, tool, title, state FROM manip_boards WHERE code=?', normCode(code));
  // A student who opens a code gets the board without the teacher's answers.
  return b ? ok({ board: { code: b.code, tool: b.tool, title: b.title, state: canHost(u) ? b.state : withoutKeys(b.state) } }) : fail('noCode');
}

// ---------------------------------------------------------------- live sessions
/** The classes a host may run a session for. */
export function hostClasses(u) {
  if (!canHost(u)) return [];
  const mine = S.classesOf(u.id, 'teacher');
  const admin = S.schoolsOf(u.id).filter(s => s.role === 'admin').flatMap(s => S.classesOfSchool(s.id));
  const seen = new Set();
  return [...mine, ...admin].filter(c => !seen.has(c.id) && seen.add(c.id) && canHostClass(u, c)).map(c => ({ id: c.id, name: c.name, school: c.school_name, students: c.students }));
}
export const getSession = id => q.get('SELECT * FROM manip_sessions WHERE id=?', String(id || '')) || null;
export function createSession(u, { classId, tool, title, boardId = null } = {}) {
  const c = S.getClass(classId);
  if (!canHostClass(u, c)) return fail('notFound');
  // Started from one of the host's saved boards: its tool, and the board (its steps too) in the teacher's area.
  const b = boardId ? ownBoard(u, boardId) : null;
  if (boardId && !b) return fail('noBoard');
  const tl = toolOf(b ? b.tool : tool); if (!tl) return fail('badTool');
  prune();
  // One running session per class: a new one ends the one before it.
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE class_id=? AND status='active'", now(), c.id);
  const id = uid(12), code = newCode();
  // A saved board was made on the big solo board: it goes into the teacher's area, made smaller if it must be.
  const L = roomLayout(tl.slug), area = { w: L.teacher.w, h: L.teacher.h - TEACHER_STEP_H };
  // A practice board (it has answers): students don't see totals on objects until the teacher turns them on.
  const fromBoard = b ? reframe(tl.slug, migrate(tl.slug, json(b.state, {}) || {}), WORLD, area) : null;
  if (fromBoard && (fromBoard.objects || []).some(o => o && o.st && o.st.key)) fromBoard.totals = false;
  const room = fromBoard ? JSON.stringify(fromBoard) : '{}';
  q.run('INSERT INTO manip_sessions(id, code, host_id, class_id, tool, title, created_at, room, room_at) VALUES (?,?,?,?,?,?,?,?,?)', id, code, u.id, c.id, tl.slug,
    cleanTitle(title, b ? b.title : `${tl.name} session`), now(), room, b ? now() : 0);
  audit(u.id, 'manip.session', id, { class: c.id });
  return ok({ session: { id, code } });
}
/** The host's own sessions (newest first). */
export function hostSessions(u) {
  if (!canHost(u)) return [];
  prune();
  return q.all(`SELECT s.id, s.code, s.tool, s.title, s.status, s.created_at, s.class_id, c.name class_name,
    (SELECT COUNT(*) FROM manip_work w WHERE w.session_id=s.id) joined FROM manip_sessions s JOIN classrooms c ON c.id=s.class_id
    WHERE s.host_id=? ORDER BY s.created_at DESC LIMIT 30`, u.id);
}
/** The session's teacher, or the platform admin. */
export const isSessionHost = (u, s) => !!(s && canHost(u) && (s.host_id === u.id || S.isPlatformAdmin(u)));
/** A student's session, if they may be in it (its class's student; its teacher may still host). */
function studentSession(u, id) {
  const s = getSession(id);
  if (!s || !on() || !u || u.is_guest || u.banned || !isStudentOf(u, s.class_id) || !canHost(getUser(s.host_id))) return null;
  return s;
}
/** Join with a code (or by id from the class list). A code from another class gets the same answer as a wrong one. */
export function join(u, { code, id } = {}) {
  prune();
  const s = id ? getSession(id) : q.get('SELECT * FROM manip_sessions WHERE code=?', normCode(code));
  if (!s || !studentSession(u, s.id)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const t = now();
  if (!q.get('SELECT 1 FROM manip_work WHERE session_id=? AND user_id=?', s.id, u.id)) {
    // Their square in the room: the first free slot of the grid.
    const used = new Set(q.all('SELECT slot FROM manip_work WHERE session_id=?', s.id).map(r => r.slot));
    let slot = 0; while (used.has(slot)) slot++;
    q.run("INSERT INTO manip_work(session_id, user_id, state, joined_at, updated_at, slot) VALUES (?,?,'{}',?,?,?)", s.id, u.id, t, t, slot);
    LIVE.publish(s.id, { t: 'dirty' });
  }
  return ok({ session: { id: s.id, tool: s.tool } });
}
/** What a student's page reads: the session, the board their teacher pushed, their own board. Never anyone else's. */
export function studentView(u, id) {
  const s = studentSession(u, id);
  const w = s && q.get('SELECT state, updated_at FROM manip_work WHERE session_id=? AND user_id=?', s.id, u.id);
  if (!w) return null;
  return { id: s.id, code: s.code, tool: s.tool, title: s.title, status: s.status, pushed: s.pushed_state || null, pushedAt: s.pushed_at || 0, mine: w.state };
}
export function submitWork(u, id, state) { return saveArea(u, id, u ? u.id : '', state); }
/** The roster name the class page shows its teachers (roster name, else display name). */
const rosterNames = classId => new Map(S.roster(classId).map(p => [p.id, p.roster_name || p.display_name]));
/** The teacher's dashboard: the session and each joined student's board. Host (or platform admin) only. */
export function teacherView(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return null;
  prune();
  const fresh = getSession(s.id); if (!fresh) return null;
  const names = rosterNames(fresh.class_id), c = S.getClass(fresh.class_id);
  const work = q.all('SELECT user_id, state, joined_at, updated_at FROM manip_work WHERE session_id=? ORDER BY updated_at DESC', fresh.id)
    .filter(w => names.has(w.user_id)).map(w => ({ id: w.user_id, name: names.get(w.user_id), state: w.state, joinedAt: w.joined_at, updatedAt: w.updated_at }));
  return { id: fresh.id, code: fresh.code, tool: fresh.tool, title: fresh.title, status: fresh.status, createdAt: fresh.created_at, className: c ? c.name : '',
    classId: fresh.class_id, pushed: !!fresh.pushed_state, pushedAt: fresh.pushed_at || 0, students: work };
}
/** Push one of the host's own saved boards to every student in the session. */
export function push(u, id, boardId) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const b = ownBoard(u, boardId); if (!b) return fail('noBoard');
  if (b.tool !== s.tool) return fail('otherTool');
  const c = cleanState(b.state, null, b.tool); if (!c.ok) return c;
  // The board's steps become the session's deck (the teacher's area), from the first step; students get the board
  // without its steps (the deck reaches them one step at a time).
  const o = JSON.parse(c.state), steps = o.__steps; delete o.__steps;
  if (steps && steps.length) { const room = json(s.room || '{}', {}) || {}; q.run('UPDATE manip_sessions SET room=?, room_at=? WHERE id=?', JSON.stringify({ ...room, __steps: steps }), now(), s.id); LIVE.setStep(s.id, 0); }
  // Students get it without the teacher's answers (never sent to a student).
  q.run('UPDATE manip_sessions SET pushed_state=?, pushed_at=? WHERE id=?', JSON.stringify({ tool: b.tool, code: b.code, state: withoutKeys(JSON.stringify(o)) }), now(), s.id);
  LIVE.publish(s.id, { t: 'dirty' });
  return ok();
}
export function end(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status === 'active') q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE id=?", now(), s.id);
  LIVE.forget(s.id);
  return ok();
}


// ---------------------------------------------------------------- the shared room (docs/decisions.md "the shared room")
// One board per session: the teacher's area (manip_sessions.room) and one square per joined student (manip_work.state,
// at manip_work.slot in the grid). Everyone in the session sees every square; each square's pieces stay inside it.
// A student writes only their own square, the teacher writes any. Sticky-note text and bar labels a student typed reach
// only that student and the teacher: everyone else gets the note's shape with no text, removed here, never sent.
/** Who is in the room: { role: 'teacher', key: 't' } | { role: 'student', key: their id } | null (the normal 404). */
export function roomRole(u, s) {
  if (!s) return null;
  if (isSessionHost(u, s)) return { role: 'teacher', key: 't' };
  return studentSession(u, s.id) && q.get('SELECT 1 FROM manip_work WHERE session_id=? AND user_id=?', s.id, u.id) ? { role: 'student', key: u.id } : null;
}
/** A board as a classmate may see it: typed text gone (notes keep their shape and place; the teacher's notes stay). */
export function forClassmates(stateText) {
  const o = json(stateText, {}) || {};
  if (o.__ann && Array.isArray(o.__ann.notes)) o.__ann.notes = o.__ann.notes.map(n => (n.by === 't' ? n : { id: n.id, x: n.x, y: n.y, text: '', blank: true }));
  // A student's board text: nothing at all for classmates (not even its place); the teacher's stays.
  if (o.__ann && Array.isArray(o.__ann.texts)) o.__ann.texts = o.__ann.texts.filter(n => n.by === 't');
  if (Array.isArray(o.bars)) o.bars = o.bars.map(b => ({ ...b, name: '', segs: (b.segs || []).map(x => ({ ...x, label: '' })) }));
  // Objects: bar labels and typed answers blanked, the teacher's answers gone.
  if (Array.isArray(o.objects)) o.objects = o.objects.map(x => { if (!x || !x.st) return x; const st = { ...x.st }; delete st.key; if ('ans' in st) st.ans = ''; if (Array.isArray(st.bars)) st.bars = st.bars.map(b => ({ ...b, name: '', segs: (b.segs || []).map(y => ({ ...y, label: '' })) })); return { ...x, st }; });
  return JSON.stringify(o);
}
/** Everything the room page draws. Names: roster names for the teacher, display names for classmates (the class page's rule). */
export function roomFor(u, id) {
  prune();
  const s = getSession(id), who = roomRole(u, s); if (!who) return null;
  const c = S.getClass(s.class_id), roster = new Map(S.roster(s.class_id).map(p => [p.id, p]));
  const rows = q.all('SELECT user_id, state, slot, updated_at FROM manip_work WHERE session_id=? ORDER BY slot', s.id).filter(w => roster.has(w.user_id));
  const areas = rows.map(w => {
    const p = roster.get(w.user_id), mine = w.user_id === who.key;
    return { key: w.user_id, slot: w.slot, color: ROOM_COLORS[w.slot % ROOM_COLORS.length], updatedAt: w.updated_at, mine,
      name: who.role === 'teacher' ? (p.roster_name || p.display_name) : p.display_name,
      // A classmate's work while the teacher hides it: nothing of it is sent (no pieces, marks, notes or when it changed).
      ...(who.role === 'teacher' || mine ? { state: w.state } : s.show_work ? { state: forClassmates(w.state) } : { state: '{}', updatedAt: 0, hidden: true }) };
  });
  // The deck: the teacher gets every step and where each student is; a student only the steps up to their own (a
  // future step is never sent), and the teacher's area without its steps.
  const tState = json(s.room || '{}', {}) || {}, deck = deckFor(s, tState, who);
  if (who.role !== 'teacher' && tState.__steps) delete tState.__steps;
  if (who.role !== 'teacher' && Array.isArray(tState.objects)) Object.assign(tState, JSON.parse(withoutKeys(tState)));
  return { role: who.role, me: who.key, id: s.id, code: who.role === 'teacher' ? s.code : undefined, tool: s.tool, title: s.title, status: s.status,
    className: c ? c.name : '', teacher: { state: who.role === 'teacher' ? s.room || '{}' : JSON.stringify(tState), updatedAt: s.room_at || 0 }, areas, showWork: !!s.show_work, deck,
    pushed: who.role === 'student' ? s.pushed_state || null : !!s.pushed_state, pushedAt: s.pushed_at || 0,
    bring: LIVE.bringOf(s.id), cursors: LIVE.cursorsOf(s.id), hands: handsFor(s.id, who) };
}
/** Where the deck is: the teacher's step, and a student's own while they go at their own pace (clamped to the deck). */
export function stepIndex(s, steps, key) {
  const pos = LIVE.stepOf(s.id), last = Math.max(0, steps.length - 1);
  const i = pos.pace && key !== 't' && pos.mine.has(String(key)) ? pos.mine.get(String(key)) : pos.cur;
  return Math.min(Math.max(0, i), last);
}
function deckFor(s, tState, who) {
  const steps = stepsOf(tState), pos = LIVE.stepOf(s.id);
  if (!steps.length) return { total: 0, cur: 0, pace: pos.pace, list: [] };
  if (who.role === 'teacher') {
    const mine = {}; for (const w of q.all('SELECT user_id FROM manip_work WHERE session_id=?', s.id)) mine[w.user_id] = stepIndex(s, steps, w.user_id);
    return { total: steps.length, cur: stepIndex(s, steps, 't'), pace: pos.pace, list: steps, mine };
  }
  const i = stepIndex(s, steps, who.key);
  return { total: steps.length, cur: i, pace: pos.pace, list: steps.slice(0, i + 1) };
}
/** A square's work space under its strip: the deck's step lines, else the teacher's notes. */
function squareBounds(s, L, key, tState) {
  const steps = stepsOf(tState);
  const texts = steps.length ? stepStripTexts(steps, stepIndex(s, steps, key)) : instructionNotes((tState.__ann || {}).notes);
  return { w: L.sq.w, h: L.sq.h - stripHeight(texts, L.sq) };
}
/** Move the deck. The teacher: to a step ({ to }) or one along ({ dir }). A student: their own step, only while the
 *  teacher lets students go at their own pace, never past the last step. */
export const STEP_LIMIT = 60;
export function step(u, id, { dir = 0, to = null } = {}) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const steps = stepsOf(json(s.room || '{}', {}) || {}); if (!steps.length) return fail('notFound');
  const now0 = stepIndex(s, steps, who.key), last = steps.length - 1;
  const next = Math.min(last, Math.max(0, to !== null && Number.isFinite(+to) ? Math.round(+to) : now0 + Math.sign(+dir || 0)));
  if (who.role === 'teacher') { LIVE.setStep(s.id, next); return ok({ cur: next }); }
  if (!LIVE.stepOf(s.id).pace) return fail('notFound');
  if (!allow(`mstep:${s.id}:${who.key}`, STEP_LIMIT, 60e3)) return fail('slow');
  LIVE.setMine(s.id, who.key, next);
  return ok({ cur: next });
}
/** "Students go at their own pace": the teacher only. Off snaps everyone back to the teacher's step. */
export function pace(u, id, on) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || who.role !== 'teacher') return fail('notFound');
  LIVE.setPace(s.id, !!on);
  return ok();
}
/** A square's notes or texts with their authors decided here: in the teacher's area all are the teacher's; the teacher
 *  adding to a student's square makes the new ones the teacher's; a student keeps the teacher's ones as they were (they
 *  can't change, remove or imitate them) and theirs carry no author. */
function authored(prev, next, field, key, who, max) {
  const before = new Map(((prev.__ann && prev.__ann[field]) || []).map(n => [n.id, n]));
  const list = (next.__ann && next.__ann[field]) || [];
  if (key === 't') return list.map(n => ({ ...n, by: 't' }));
  if (who.role === 'teacher') return list.map(n => ({ ...n, by: before.has(n.id) ? before.get(n.id).by : 't' }));
  const theirs = list.filter(n => !(before.get(n.id) && before.get(n.id).by === 't')).map(n => { const m = { ...n }; delete m.by; return m; });
  return [...[...before.values()].filter(n => n.by === 't'), ...theirs].slice(0, max);
}
/** Save one area: key 't' (the teacher's area) or a student's id. The teacher may save any; a student only their own.
 *  Note authors are kept here, not taken from the browser: a note the teacher adds is the teacher's (everyone reads it);
 *  a student can't change or remove the teacher's notes in their square. */
export function saveArea(u, id, key, state) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || (who.role === 'student' && key !== who.key)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  // A student's square: its work space starts under the teacher's "Instructions" strip (the teacher's area's notes).
  const L = roomLayout(s.tool), tState = json(s.room || '{}', {}) || {};
  const nextSteps = key === 't' ? stepsOf(typeof state === 'string' ? json(state, {}) : state) : [];
  const bounds = key === 't' ? { w: L.teacher.w, h: L.teacher.h - (nextSteps.length ? TEACHER_STEP_H : 0) } : squareBounds(s, L, key, tState);
  const row = key === 't' ? { state: s.room || '{}' } : q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, String(key));
  if (!row) return fail('notFound');
  const c = cleanState(state, key === 't' ? { ...bounds, teacher: true } : bounds, s.tool); if (!c.ok) return c;
  // A student's square never holds the teacher's answers (they could only have come from the page).
  const next = JSON.parse(key === 't' ? c.state : withoutKeys(c.state)), prev = json(row.state, {}) || {};
  // Notes and board text alike: who wrote each is kept here (see authored).
  next.__ann = { ...(next.__ann || { strokes: [] }), notes: authored(prev, next, 'notes', key, who, LIMITS.notes), texts: authored(prev, next, 'texts', key, who, LIMITS.texts) };
  const text = JSON.stringify(next);
  if (key === 't') q.run('UPDATE manip_sessions SET room=?, room_at=? WHERE id=?', text, now(), s.id);
  else q.run('UPDATE manip_work SET state=?, updated_at=? WHERE session_id=? AND user_id=?', text, now(), s.id, String(key));
  LIVE.publish(s.id, { t: 'dirty', k: key });
  return ok();
}
/** The teacher's "Hide students' work": hidden (the default) or shown to the class. Everyone reads the room again. */
export function showWork(u, id, show) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || who.role !== 'teacher') return fail('notFound');
  q.run('UPDATE manip_sessions SET show_work=? WHERE id=?', show ? 1 : 0, s.id);
  LIVE.publish(s.id, { t: 'dirty' });
  return ok({ showWork: !!show });
}
/** "Bring everyone to me": the teacher's view (a room rectangle), once, to every student. */
export function bring(u, id, view = {}) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || who.role !== 'teacher') return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const v = { x: Math.round(num(view.x, -2000, 20000)), y: Math.round(num(view.y, -2000, 20000)), w: Math.round(num(view.w, 50, 20000, 800)), h: Math.round(num(view.h, 50, 20000, 600)) };
  return ok({ seq: LIVE.setBring(s.id, v) });
}
/** Raised hands (memory only, services/manip-live.js): a student raises or lowers their own, at most HAND_LIMIT changes
 *  a minute; the teacher lowers anyone's, or all. */
export const HAND_LIMIT = 8;
/** Raised hands as a viewer may know them: the teacher every hand (in order); a student only their own. */
export const handsFor = (sid, who) => (who.role === 'teacher' ? LIVE.handsOf(sid) : LIVE.handsOf(sid).filter(h => h.k === who.key));
export function handFor(sid, key, up) {
  if (!allow(`mhand:${sid}:${key}`, HAND_LIMIT, 60e3)) return fail('slow');
  LIVE.setHand(sid, key, up);
  return ok();
}
export function hand(u, id, { up = true, key = null } = {}) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  if (who.role === 'student') return key && key !== who.key ? fail('notFound') : handFor(s.id, who.key, !!up);
  if (up) return fail('notFound');   // a teacher has no hand of their own to raise
  if (key === 'all') LIVE.clearHands(s.id); else LIVE.setHand(s.id, String(key || ''), false);
  return ok();
}
/** A cursor through plain requests (when a socket can't connect). Memory only. */
export function moveCursor(u, id, { x, y, touch } = {}) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who) return fail('notFound');
  if (s.status === 'active') LIVE.setCursor(s.id, who.key, { x, y, touch });
  return ok();
}

// ---------------------------------------------------------------- summaries and the PDF export
/** A board in a few plain lines (the teacher's dashboard and the PDF). */
export function summarize(stateText) {
  const o = json(stateText, null);
  if (!o || typeof o !== 'object') return ['The board could not be read.'];
  const lines = [];
  if (Array.isArray(o.objects) && o.objects.length) {
    const name = x => { const K = Object.values(OBJECTS).flat().find(k => k.k === x.k); return K ? K.name : 'Object'; };
    const hm = c => `${((Math.round(+c.h || 0) + 11) % 12) + 1}:${String(Math.round(+c.m || 0)).padStart(2, '0')}`;
    const what = x => {
      const st = x.st || {};
      if (x.k === 'clock') return `${st.label ? `${st.label} ` : ''}${hm(st)}${st.start ? ` (tracking from ${hm(st.start)})` : ''}`;
      if (x.k === 'answer') return st.ans ? `"${clipStr(st.ans, 60)}"` : '(empty)';
      if (x.k === 'frac-eq') return `${clipStr(st.text || '', 60)}${st.ans ? ` = "${clipStr(st.ans, 30)}"` : ''}`;
      const rest = Object.entries(st).filter(([k]) => k !== 'key').slice(0, 4).map(([k, v]) => `${k} ${String(JSON.stringify(v)).slice(0, 40)}`).join(', ');
      return rest;
    };
    for (const x of o.objects.slice(0, 16)) lines.push(`${name(x)}: ${what(x)}`);
    if (o.objects.length > 16) lines.push(`...and ${o.objects.length - 16} more objects.`);
  }
  if (Array.isArray(o.pieces)) {
    if (!o.pieces.length) lines.push('No pieces on the board yet.');
    else {
      const counts = new Map(); let total = 0;
      for (const p of o.pieces) { const l = String((p && p.label) || 'piece'); counts.set(l, (counts.get(l) || 0) + 1); total += typeof (p && p.value) === 'number' ? p.value : 0; }
      lines.push(`${o.pieces.length} pieces: ${[...counts].map(([l, n]) => `${n} x ${l}`).join(', ')}.`, `Combined value: ${Math.round(total * 1000) / 1000}.`);
    }
  } else if (!Array.isArray(o.objects)) {
    const rest = Object.entries(o).filter(([k]) => !k.startsWith('__')).slice(0, 8).map(([k, v]) => `${k}: ${String(JSON.stringify(v)).slice(0, 110)}`);
    lines.push(...(rest.length ? rest : ['Nothing on the board yet.']));
  }
  const ann = o.__ann || {};
  const notes = (Array.isArray(ann.notes) ? ann.notes : []).map(n => String(n.text || '').trim()).filter(Boolean);
  for (const n of notes) lines.push(`Note: ${n}`);
  for (const n of (Array.isArray(ann.texts) ? ann.texts : []).map(x => String(x.text || '').trim()).filter(Boolean)) lines.push(`Text: ${n}`);
  if (Array.isArray(ann.strokes) && ann.strokes.length) lines.push(`Pen marks: ${ann.strokes.length}.`);
  return lines;
}
// The PDF is plain text in Helvetica (WinAnsi): every character must be one byte, so others are mapped or folded.
const WINANSI = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const PDF_MAP = { '−': '-', '\u2014': '-', '✓': 'OK', '★': '*', '→': '->', '↔': '<->', '≤': '<=', '≥': '>=' };
export function pdfSafe(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 0xa1 && code <= 0xff)) { out += ch; continue; }
    if (WINANSI[ch] !== undefined) { out += String.fromCharCode(WINANSI[ch]); continue; }
    if (PDF_MAP[ch] !== undefined) { out += PDF_MAP[ch]; continue; }
    if (ch === '\n' || ch === '\t') { out += ' '; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126 ? base : '?';
  }
  return out;
}
const pdfEsc = s => pdfSafe(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
/** A text-only PDF: a title, then blocks of a heading and lines. -> Buffer */
export function makePdf(title, blocks) {
  const wrap = (s, n) => { const out = []; let cur = String(s); while (cur.length > n) { let cut = cur.lastIndexOf(' ', n); if (cut < 20) cut = n; out.push(cur.slice(0, cut)); cur = cur.slice(cut).trim(); } if (cur) out.push(cur); return out; };
  const all = [...wrap(title, 80), ''];
  for (const b of blocks) { all.push(...wrap(b.heading, 88)); for (const l of b.lines) all.push(...wrap(`  ${l}`, 92)); all.push(''); }
  const pages = []; for (let i = 0; i < all.length; i += 46) pages.push(all.slice(i, i + 46));
  const objects = []; const fontId = 3 + pages.length * 2;
  pages.forEach((lines, pi) => {
    const contentId = 3 + pi * 2;
    const stream = ['BT', '/F1 11 Tf', '50 790 Td', '15 TL', ...lines.map((l, i) => `${i ? 'T* ' : ''}(${pdfEsc(l)}) Tj`), 'ET'].join('\n');
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[contentId + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  });
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (let id = 1; id <= fontId; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id] || '<< >>'}\nendobj\n`; }
  const xref = pdf.length;
  pdf += `xref\n0 ${fontId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= fontId; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${fontId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const stamp = (ms, tz) => { try { return new Date(ms).toLocaleString('en-US', { timeZone: tz || 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + (tz ? '' : ' UTC'); } catch { return new Date(ms).toISOString(); } };
/** The teacher's export of a session. Host (or platform admin) only. -> { ok, pdf, filename } | fail */
export function exportPdf(u, id) {
  const v = teacherView(u, id); if (!v) return fail('notFound');
  const c = S.getClass(v.classId), tz = c ? S.zoneOf(S.getSchool(c.school_id)) : null, tl = toolOf(v.tool);
  const blocks = v.students.length ? v.students.map(w => ({ heading: `${w.name}  (last saved ${stamp(w.updatedAt, tz)})`, lines: summarize(w.state) }))
    : [{ heading: 'No student work yet', lines: ['No student has joined or sent work in this session yet.'] }];
  const pdf = makePdf(`${v.title} - ${tl ? tl.name : v.tool} - ${v.className} - started ${stamp(v.createdAt, tz)}`, blocks);
  audit(u.id, 'manip.export', v.id, { students: v.students.length });
  return ok({ pdf, filename: `manipulatives-${v.code.toLowerCase()}.pdf` });
}

// ---------------------------------------------------------------- the AI lesson drafter (hosts only)
// The model says WHAT (a title, a few steps, the items and each one's settings); the code checks every setting and
// decides WHERE (public/js/manip-practice.js). No coordinates, no sticky notes, no pen marks: a drafted board is a tidy
// grid the teacher can trust, and the instructions are the steps of the deck.
const PT = { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'integer' }, y: { type: 'integer' } } };
const DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'steps', 'items'],
  properties: {
    title: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['box'], properties: {
      box: { type: 'string', enum: ['answer', 'build', 'none'] }, label: { type: 'string' },
      time: { type: 'string' }, value: { type: 'number' }, negative: { type: 'integer' }, min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
      fractions: { type: 'array', items: { type: 'string' } }, op: { type: 'string' }, a: { type: 'string' }, b: { type: 'string' },
      numbers: { type: 'array', items: { type: 'integer' } }, rows: { type: 'integer' }, cols: { type: 'integer' },
      parts: { type: 'array', items: { type: 'integer' } }, unknown: { type: 'integer' },
      points: { type: 'array', items: PT }, pegs: { type: 'array', items: PT },
      pieces: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'count'], properties: { kind: { type: 'string' }, count: { type: 'integer' } } } },
    } } },
  },
};
export const PEN_COLORS = ['#FF6B4A', '#141414', '#1F9D63', '#1E88E5'];
/** What the model sent, made safe and built (public/js/manip-practice.js buildPractice): items checked against the
 *  tool, repeats made distinct, at most PRACTICE_MAX, laid out by the fixed recipe; steps and labels that fail the word
 *  rules are dropped. -> { title, steps, board, n, asked, capped, dropped } */
export function sanitizeDraft(d, slug) {
  const clean = x => { const v = clipStr(x, LIMITS.noteChars).replace(/\s+/g, ' ').trim(); return v && !textProblem(v) ? v : ''; };
  const r = buildPractice(slug, d && typeof d === 'object' ? d : {}, { clean });
  if (!r.n) r.board = { ...newBoard(slug), __ann: r.board.__ann };   // nothing to build: the tool's usual start, with the title
  return { ...r, title: r.title === 'Practice' && d && d.title ? 'AI lesson draft' : r.title };
}
/** Does the brief carry the name of one of the host's students? (Names never go to the AI.) */
export function namesIn(u, brief) {
  const words = new Set(String(brief || '').toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(w => w.length >= 3));
  const text = ` ${String(brief || '').toLowerCase().replace(/\s+/g, ' ')} `;
  for (const c of hostClasses(u)) {
    for (const p of S.roster(c.id).filter(x => x.role === 'student')) {
      for (const n of [p.roster_name, p.display_name, p.username]) {
        const v = String(n || '').toLowerCase().trim(); if (v.length < 3) continue;
        if (words.has(v) || text.includes(` ${v} `) || v.split(/\s+/).some(part => part.length >= 3 && words.has(part))) return true;
      }
    }
  }
  return false;
}
function prompt(tl, { grade, brief, task }) {
  return [
    'You are preparing a practice board for a teacher, on a virtual math manipulatives tool. You decide WHAT goes on it; the app decides where.',
    `Tool: ${tl.name} (grades ${grade || tl.grades}).`,
    'Write in US English, plain and friendly for children. No names of people, no links, no brands or product names.',
    `On this tool one item is: ${PRACTICE_TABLE[tl.slug]}.`,
    `Settings for an item on this tool: ${PRACTICE_HELP[tl.slug]}`,
    `items: make exactly as many items as the teacher asks for (at most ${PRACTICE_MAX}; if they ask for more, make ${PRACTICE_MAX}). If they give no number, make 4. Every item must be different. Leave out settings the tool does not use.`,
    'box: "answer" when students write an answer under the item, "build" when they build or set it themselves, "none" for something to look at or talk about.',
    'label: optional, at most 4 words (for example "Start" or "Problem 2"). Usually leave it out.',
    `steps: 1 to ${STEPS_MAX} short steps for the students, in order, one idea each, under 100 characters, for example "Write the time under each clock."`,
    'title: a short title for the board (under 60 characters).',
    `<lesson>\n${brief}${task ? `\nBased on this library task: ${task}` : ''}\n</lesson>`,
  ].join('\n');
}
/** Without the AI (no key, or the AI budget is resting): the tool's usual board, the brief as its one step. */
const templateDraft = (tl, { brief, task }) => ({ title: (task ? task.split(':')[0] : '') || `${tl.name} lesson`, steps: [clipStr(brief, 140)], items: [] });
/** -> { ok, draft, ai } | { ok:false, code: 'notFound'|'badTool'|'brief'|'words'|'personal'|'names'|'aiFailed' } */
export async function draftLesson(u, { tool, brief, grade = '', task = '' } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const b = clipStr(brief, LIMITS.briefChars).replace(/\s+/g, ' ').trim();
  if (b.length < 3) return fail('brief');
  const p = textProblem(b); if (p) return fail(p);
  if (namesIn(u, b)) return fail('names');
  const g = /^(K|[1-8])$/.test(String(grade)) ? String(grade) : '';
  // Only a task from this tool's own library is passed on (by its title and prompt).
  const tk = (TASKS[tl.slug] || []).find(x => `${x.title}: ${x.prompt}` === String(task)) || null;
  const taskText = tk ? `${tk.title}: ${tk.prompt}` : '';
  const client = hooks.create ? { messages: { create: hooks.create } } : anthropic('free');
  if (!client) return ok({ draft: sanitizeDraft(templateDraft(tl, { brief: b, task: taskText }), tl.slug), ai: false });
  let raw;
  try {
    const res = await client.messages.create({
      model: config.builderModel, max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
      messages: [{ role: 'user', content: prompt(tl, { grade: g, brief: b, task: taskText }) }],
    }, { timeout: 60000, maxRetries: 1 });
    if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
    const block = ((res && res.content) || []).find(c => c.type === 'text');
    raw = JSON.parse(block ? block.text : '');
  } catch { return fail('aiFailed'); }
  audit(u.id, 'manip.draft', tl.slug, {});
  return ok({ draft: sanitizeDraft(raw, tl.slug), ai: true });
}

// ---------------------------------------------------------------- cleanup (accounts and classes)
/** An account is deleted (services/account-delete.js): their boards, their work, the sessions they ran. */
export function forgetUser(userId) {
  q.run('DELETE FROM manip_boards WHERE owner_id=?', userId);
  q.run('DELETE FROM manip_work WHERE user_id=?', userId);
  q.run('DELETE FROM manip_sessions WHERE host_id=?', userId);
}
/** A student left a class: their work in its sessions goes. A class was deleted: its sessions go. */
export function classLeft({ classId, userId = null } = {}) {
  if (!classId) return;
  if (userId) q.run('DELETE FROM manip_work WHERE user_id=? AND session_id IN (SELECT id FROM manip_sessions WHERE class_id=?)', userId, classId);
  else q.run('DELETE FROM manip_sessions WHERE class_id=?', classId);
}
/** A school account merged into a student's own: the work moves with them (theirs wins where both joined). */
export function accountMerged({ from, into }) {
  q.run('UPDATE OR IGNORE manip_work SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM manip_work WHERE user_id=?', from);
}
S.onClassLeave(classLeft);
S.onAccountMerge(accountMerged);
