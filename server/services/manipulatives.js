// Virtual math manipulatives (docs/decisions.md "Virtual math manipulatives"): 18 tools on one board, saved boards with
// share codes, live class sessions and an AI lesson drafter. Hidden while it is tested (config.manipulatives).
//
// Who may use it:
//   - hosts (services/teacher-tools.js toolAccess, the same rule as Figures; docs/decisions.md "Figures and the
//     Manipulatives: Teacher plan only"): the platform admin, school staff whose username is in MANIPULATIVES_USERS,
//     and, while paid plans are on, school staff with the Teacher plan (other staff see the plan page). Only hosts save boards
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
import { getUser } from '../auth.js';
import * as S from './schools.js';
import { toolAccess } from './teacher-tools.js';
import { anthropic } from '../builder/anthropic.js';
import * as aiBudget from './ai-budget.js';
import { callAi, logAiFail, fallbackReason } from './ai-call.js';
import { log } from './log.js';
import { hasProfanity, personalInfo } from './textfilter.js';
import { STRIP, layoutOf, TOOLS, toolOf, pieceDefs, roomLayout, ROOM_COLORS, instructionNotes, stripHeight, stepsOf, stepStripTexts, TEACHER_STEP_H } from '../../public/js/manip-data.js';
import * as LIVE from './manip-live.js';
import { WORLD, OBJECTS, OBJ_MAX, OBJ_MAX_SQUARE, S_FLOOR, S_MAX, kindOf, objSize, migrate, fitInto, newBoard, ANS, textBoxFields } from '../../public/js/manip-board.js';
import { buildPractice, PRACTICE_TABLE, PRACTICE_HELP, PRACTICE_MAX, STEPS_MAX, answerMatches } from '../../public/js/manip-practice.js';
import { allow } from './ratelimit.js';
import { TASKS } from '../../public/js/manip-tasks.js';

export { TOOLS, TASKS };
export const STATE_MAX = 200000;
export const LIMITS = { texts: 30, textChars: 200, steps: 20, boards: 500, notes: 12, noteChars: 300, strokes: 80, points: 600, pieces: 400, titleChars: 80, briefChars: 1000 };
/** A session ends on its own this long after it starts; ended sessions (and their work) go after KEEP_DAYS. */
export const SESSION_HOURS = 12;
export const KEEP_DAYS = 30;
/** "Recent boards" (saved as a teacher works): the newest RECENT_MAX per teacher, each for RECENT_DAYS after it was
 *  last opened or changed. Templates stay until their owner deletes them. */
export const RECENT_MAX = 30, RECENT_DAYS = 60;
const HOUR = 3600e3, DAY = 86400e3;
const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Test hooks: create replaces the AI client's messages.create (no network in tests). */
export const hooks = { create: null };

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

// ---------------------------------------------------------------- who may use it
export const on = () => !!config.manipulatives;
/** May this account host (save boards with share codes, run sessions, draft with AI)? (services/teacher-tools.js) */
export const canHost = u => toolAccess(u, on()) === 'yes';
/** A session's host, for its students: still staff the tools know (a host whose Teacher plan lapsed keeps the session
 *  they started for their class; they cannot start a new one). */
const hostStill = u => toolAccess(u, on()) !== null;
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
/** Lazy upkeep: sessions past SESSION_HOURS since they were started (or last reopened) end; ended ones older than
 *  KEEP_DAYS go (their work with them); recent boards not opened or changed for RECENT_DAYS go. */
export function prune(t = now()) {
  for (const r of q.all("SELECT id FROM manip_sessions WHERE status='active' AND opened_at<?", t - SESSION_HOURS * HOUR)) LIVE.forget(r.id);
  q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE status='active' AND opened_at<?", t, t - SESSION_HOURS * HOUR);
  q.run("DELETE FROM manip_sessions WHERE status='ended' AND ended_at<?", t - KEEP_DAYS * DAY);
  q.run("DELETE FROM manip_boards WHERE kind='recent' AND MAX(created_at, updated_at, opened_at)<?", t - RECENT_DAYS * DAY);
}
/** The sessions a student can see now: active ones for their classes (whose teacher may still host), and ones they
 *  joined that ended in the last hours. */
export function studentSessions(u) {
  if (!on() || !u || u.is_guest || u.banned) return [];
  const t = now();
  const rows = q.all(`SELECT s.*, c.name class_name, (SELECT 1 FROM manip_work w WHERE w.session_id=s.id AND w.user_id=?) joined FROM manip_sessions s
    JOIN class_members m ON m.class_id=s.class_id AND m.user_id=? AND m.status='active' AND m.role='student' JOIN classrooms c ON c.id=s.class_id
    WHERE c.archived_at IS NULL AND (s.status='active' AND s.opened_at>? OR s.ended_at>?) ORDER BY s.created_at DESC`, u.id, u.id, t - SESSION_HOURS * HOUR, t - SESSION_HOURS * HOUR);
  return rows.filter(s => (s.status === 'active' || s.joined) && isStudentOf(u, s.class_id) && hostStill(getUser(s.host_id)));
}
/** A student who may practice Manipulatives tasks on their own (docs/decisions.md "Manipulatives: tasks you can
 *  practice and assign"): an active student of a class (not archived) that has a teacher who may use Manipulatives (the
 *  teacher's Teacher plan covers their students' practice, as it covers the live rooms they host). */
export function canPractice(u) {
  if (!on() || !u || u.is_guest || u.banned) return false;
  const rows = q.all(`SELECT DISTINCT t.user_id FROM class_members m JOIN classrooms c ON c.id=m.class_id AND c.archived_at IS NULL
    JOIN class_members t ON t.class_id=m.class_id AND t.role='teacher' AND t.status='active'
    WHERE m.user_id=? AND m.role='student' AND m.status='active'`, u.id);
  return rows.some(r => toolAccess(getUser(r.user_id), on()) === 'yes');
}
/** 'host' | 'student' | 'plan' (school staff without the Teacher plan: the plan page) | null (null: the normal 404). */
export function roleOf(u) {
  const a = toolAccess(u, on());
  if (a === 'yes') return 'host';
  if (studentSessions(u).length || canPractice(u)) return 'student';
  return a === 'plan' ? 'plan' : null;
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
 *  a plain object of limited size, its scale within limits, its place inside the space (a room square: bounds), and
 *  `locked` (a frame, mat, clock or board that can't be dragged) with `lockBy: 't'` when the teacher locked it in a
 *  student's square (saveArea decides that, never the page). */
function cleanObjects(list, tool, space, max) {
  const ok1 = k => (tool ? !!kindOf(tool, k) : ANY_KIND.has(k));
  return (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object' && ok1(o.k) && o.st && typeof o.st === 'object' && !Array.isArray(o.st) && JSON.stringify(o.st).length <= OBJ_STATE_MAX)
    .slice(0, max).map((o, i) => {
      const z = tool ? objSize(tool, o) : { w: 100, h: 100 };
      const s = Math.round(num(o.s, S_FLOOR, Math.max(S_FLOOR, Math.min(S_MAX, space.w / z.w, space.h / z.h)), 1) * 1000) / 1000;
      return { id: clipStr(o.id || `o${i}`, 40), k: String(o.k), x: Math.round(num(o.x, 0, Math.max(0, space.w - z.w * s))), y: Math.round(num(o.y, 0, Math.max(0, space.h - z.h * s))), s, st: cleanObjState(o.k, o.st),
        ...(o.locked === true ? { locked: true, ...(o.lockBy === 't' ? { lockBy: 't' } : {}) } : {}) };
    });
}
/** The fields this page added to an object's own state, kept within their limits: an answer box's typed answer (at most
 *  ANS.max characters) and its size (st.w, st.h: whole pixels within ANS, or absent); a coordinate grid's switches
 *  (arrows, table: true or false), its points (at most 60, whole numbers on the grid, a color, the line `ln` they are on)
 *  and the lines closed into shapes (shut). */
const XY_MAXPTS = 60;
function cleanObjState(k, st0) {
  const st = { ...st0 };
  if (k === 'answer') {
    if ('ans' in st) st.ans = clipStr(st.ans, ANS.max).replace(/[\r\n]+/g, ' ');
    for (const [f, lo, hi] of [['w', ANS.wMin, ANS.wMax], ['h', ANS.hMin, ANS.hMax]]) { if (f in st) { if (Number.isFinite(Number(st[f]))) st[f] = Math.round(num(st[f], lo, hi)); else delete st[f]; } }
  }
  if (k === 'xy-coordinate-board') {
    for (const f of ['arrows', 'table', 'connect', 'labels', 'four']) if (f in st) st[f] = !!st[f];
    if ('pts' in st) st.pts = (Array.isArray(st.pts) ? st.pts : []).filter(p => p && typeof p === 'object').slice(0, XY_MAXPTS)
      .map(p => { const ln = Math.round(num(p.ln, 0, XY_MAXPTS)); return { x: Math.round(num(p.x, -10, 12)), y: Math.round(num(p.y, -10, 12)), color: HEX.test(p.color) ? p.color : '#E53935', ...(ln ? { ln } : {}) }; });
    // The lines closed into shapes: "<color>#<line>" each (manip-board.js xyKey).
    if ('shut' in st) st.shut = [...new Set((Array.isArray(st.shut) ? st.shut : []).filter(k => typeof k === 'string' && /^#[0-9a-f]{6}#\d{1,2}$/i.test(k)))].slice(0, XY_MAXPTS);
    if ('color' in st && !HEX.test(st.color)) st.color = '#E53935';
  }
  return st;
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
  if (Array.isArray(st.pieces)) st.pieces = st.pieces.slice(0, LIMITS.pieces).filter(p => p && typeof p === 'object').map(p => {
    const q = p.g === undefined ? { ...p } : { ...p, g: clipStr(p.g, 40) };
    // A lock is true or absent; who locked it ('t': the teacher, in a student's square) only with a lock.
    if (q.locked !== true) { delete q.locked; delete q.lockBy; } else if (q.lockBy !== 't') delete q.lockBy;
    return q;
  });
  // In a live room a square's pieces stay inside it: their places are clamped to the square (bounds: its size); on a
  // format-2 board, inside the big board.
  if ((bounds || v2) && Array.isArray(st.pieces)) st.pieces = st.pieces.map(p => { const w = num(p.w, 4, space.w, 50), h = num(p.h, 4, space.h, 50); return { ...p, w, h, x: num(p.x, 0, space.w - w), y: num(p.y, 0, space.h - h) }; });
  // A block made smaller in a place-value chart's column keeps its own size (nw, nh: public/js/manip-pv.js): numbers
  // inside the space, or not kept at all.
  if (Array.isArray(st.pieces)) st.pieces = st.pieces.map(p => {
    if (p.nw === undefined && p.nh === undefined) return p;
    const q = { ...p }; delete q.nw; delete q.nh;
    if (Number.isFinite(+p.nw) && Number.isFinite(+p.nh)) { q.nw = num(p.nw, 4, space.w, 50); q.nh = num(p.nh, 4, space.h, 50); }
    return q;
  });
  const ann = st.__ann && typeof st.__ann === 'object' ? st.__ann : null;
  if (ann) {
    st.__ann = {
      // Text typed straight on the board (the T tool): plain words at a place, no card.
      texts: (Array.isArray(ann.texts) ? ann.texts : []).filter(n => n && typeof n === 'object' && String(n.text || '').trim()).slice(0, LIMITS.texts)
        .map((n, i) => ({ id: clipStr(n.id || `t${i}`, 40), text: clipStr(n.text, LIMITS.textChars), x: num(n.x, 0, 1), y: num(n.y, 0, 1), ...textBoxFields(n), ...(n.by === 't' ? { by: 't' } : {}), ...(Number.isInteger(n.cell) && n.cell >= -1 && n.cell < 100 ? { cell: n.cell } : {}) })),
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

/** A host saves a template (Save as template): it gets its own share code. Opening it (or starting a room with it)
 *  always gives a fresh copy; the template itself never changes. -> { ok, board: { id, code } } | fail */
export function saveBoard(u, { tool, title, state } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const c = cleanState(state, null, tl.slug); if (!c.ok) return c;
  if (q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND kind='template'", u.id).n >= LIMITS.boards) return fail('tooMany');
  const id = uid(12), code = newCode(), t = now();
  q.run("INSERT INTO manip_boards(id, owner_id, code, tool, title, state, created_at, kind, updated_at, opened_at) VALUES (?,?,?,?,?,?,?,'template',?,?)", id, u.id, code, tl.slug, cleanTitle(title, tl.name), c.state, t, t, t);
  return ok({ board: { id, code, title: cleanTitle(title, tl.name) } });
}
const BOARD_COLS = 'id, code, tool, title, kind, created_at, updated_at, opened_at';
/** The owner's templates, newest first (no states): the newest 100 for the home, or all of them ({ all: true }, the
 *  All boards page; at most LIMITS.boards can exist). */
export const listBoards = (u, { all = false } = {}) => (canHost(u) ? q.all(`SELECT ${BOARD_COLS} FROM manip_boards WHERE owner_id=? AND kind='template' ORDER BY created_at DESC, rowid DESC LIMIT ${all ? LIMITS.boards : 100}`, u.id) : []);
/** How many templates the owner has (the home's "See all boards" count). */
export const countBoards = u => (canHost(u) ? q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND kind='template'", u.id).n : 0);
/** The owner's recent boards, most recently used first (no states). opened_at 0: an AI draft not opened yet ("New"). */
export const listRecent = u => (canHost(u) ? q.all(`SELECT ${BOARD_COLS} FROM manip_boards WHERE owner_id=? AND kind='recent' ORDER BY MAX(created_at, updated_at, opened_at) DESC, rowid DESC LIMIT ${RECENT_MAX}`, u.id) : []);
/** One of the owner's boards, with its state. */
export const ownBoard = (u, id) => (u ? q.get(`SELECT ${BOARD_COLS}, state FROM manip_boards WHERE id=? AND owner_id=?`, String(id || ''), u.id) || null : null);
/** The owner opens one of their boards: a recent board is theirs to go on with (and counts as used); a template comes
 *  as a fresh copy (fresh: true; the page saves the copy as a new recent board once it changes). */
export function openBoard(u, id) {
  const b = ownBoard(u, id); if (!b || !canHost(u)) return fail('notFound');
  if (b.kind === 'recent') q.run('UPDATE manip_boards SET opened_at=? WHERE id=?', now(), b.id);
  return ok({ board: { id: b.id, code: b.code, tool: b.tool, title: b.title, kind: b.kind, state: b.state, fresh: b.kind !== 'recent' } });
}
/** Only the owner deletes a board. */
export function deleteBoard(u, id) {
  const b = ownBoard(u, id); if (!b) return fail('notFound');
  q.run('DELETE FROM manip_boards WHERE id=? AND owner_id=?', b.id, u.id);
  q.run('DELETE FROM manip_chats WHERE owner_id=? AND board_key=?', u.id, b.id);   // its Oomba chat (services/manip-chat.js)
  return ok();
}
/** Only the owner renames a board (the same word rules as any title). */
export function renameBoard(u, id, title) {
  const b = ownBoard(u, id); if (!b || !canHost(u)) return fail('notFound');
  const v = clipStr(title, LIMITS.titleChars).replace(/\s+/g, ' ').trim();
  if (!v) return fail('noTitle');
  const p = textProblem(v); if (p) return fail(p);
  q.run('UPDATE manip_boards SET title=? WHERE id=?', v, b.id);
  return ok({ board: { id: b.id, title: v } });
}
/** A copy of one of the owner's boards, of the same kind (a template's copy gets its own share code). */
export function duplicateBoard(u, id) {
  const b = ownBoard(u, id); if (!b || !canHost(u)) return fail('notFound');
  if (b.kind === 'template' && q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND kind='template'", u.id).n >= LIMITS.boards) return fail('tooMany');
  const nid = uid(12), code = newCode(), t = now(), title = `${b.title} (copy)`.slice(0, LIMITS.titleChars);
  q.run('INSERT INTO manip_boards(id, owner_id, code, tool, title, state, created_at, kind, updated_at, opened_at) VALUES (?,?,?,?,?,?,?,?,?,?)', nid, u.id, code, b.tool, title, b.state, t, b.kind, t, t);
  if (b.kind === 'recent') trimRecent(u.id);
  return ok({ board: { id: nid, code, title, kind: b.kind } });
}
/** Keep the newest RECENT_MAX recent boards of an owner. */
function trimRecent(ownerId) {
  q.run(`DELETE FROM manip_boards WHERE owner_id=? AND kind='recent' AND id NOT IN (SELECT id FROM manip_boards WHERE owner_id=? AND kind='recent'
    ORDER BY MAX(created_at, updated_at, opened_at) DESC, rowid DESC LIMIT ${RECENT_MAX})`, ownerId, ownerId);
}
/** A new recent board (cleaned state text): opened 0 for an AI draft nobody opened yet. -> { id, code } */
export function addRecent(u, slug, title, stateText, { opened = now() } = {}) {
  const id = uid(12), code = newCode(), t = now();
  q.run("INSERT INTO manip_boards(id, owner_id, code, tool, title, state, created_at, kind, updated_at, opened_at) VALUES (?,?,?,?,?,?,?,'recent',?,?)", id, u.id, code, slug, cleanTitle(title, toolOf(slug).name), stateText, t, t, opened);
  trimRecent(u.id);
  return { id, code };
}
/**
 * Autosave: the board a host is working on, saved a moment after each change (no button). With id: that recent board
 * of theirs (a template is never written here: it only ever gives copies); without: a new recent board.
 * -> { ok, board: { id, at } } | fail
 */
export function autosave(u, { id = null, tool, title, state } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const c = cleanState(state, null, tl.slug); if (!c.ok) return c;
  const t = now();
  if (id) {
    const b = q.get("SELECT id, tool FROM manip_boards WHERE id=? AND owner_id=? AND kind='recent'", String(id), u.id);
    if (!b) return fail('notFound');
    if (b.tool !== tl.slug) return fail('otherTool');
    q.run('UPDATE manip_boards SET state=?, updated_at=? WHERE id=?', c.state, t, b.id);
    return ok({ board: { id: b.id, at: t } });
  }
  prune(t);
  const b = addRecent(u, tl.slug, title, c.state);
  return ok({ board: { id: b.id, at: t } });
}
/** A share code opens a copy of a template: the tool and the board, for the opener's own board. Anyone who may use
 *  the page. (A recent board's code opens nothing: only templates are shared.) */
export function openCode(u, code) {
  if (!roleOf(u)) return fail('notFound');
  const b = q.get("SELECT code, tool, title, state FROM manip_boards WHERE code=? AND kind='template'", normCode(code));
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
  // The board is fitted into the teacher's area at one scale; if that would be too small to read, the area grows
  // taller (the session's `layout.th`) and the board is laid out again in fewer columns where it is a practice set.
  const fromBoard = b ? fitTeacherArea(tl.slug, migrate(tl.slug, json(b.state, {}) || {})) : null;
  if (fromBoard && (fromBoard.objects || []).some(o => o && o.st && o.st.key)) fromBoard.totals = false;
  const room = fromBoard ? JSON.stringify(fromBoard) : '{}';
  const t = now();
  q.run('INSERT INTO manip_sessions(id, code, host_id, class_id, tool, title, created_at, room, room_at, opened_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, code, u.id, c.id, tl.slug,
    cleanTitle(title, b ? b.title : `${tl.name} session`), t, room, b ? t : 0, t);
  audit(u.id, 'manip.session', id, { class: c.id });
  return ok({ session: { id, code } });
}
/** The host's own sessions (newest first). */
export function hostSessions(u) {
  if (!canHost(u)) return [];
  prune();
  return q.all(`SELECT s.id, s.code, s.tool, s.title, s.status, s.created_at, s.opened_at, s.ended_at, s.class_id, c.name class_name,
    (SELECT COUNT(*) FROM manip_work w WHERE w.session_id=s.id) joined FROM manip_sessions s JOIN classrooms c ON c.id=s.class_id
    WHERE s.host_id=? ORDER BY s.created_at DESC LIMIT 30`, u.id);
}
/** The session's teacher, or the platform admin. */
export const isSessionHost = (u, s) => !!(s && canHost(u) && (s.host_id === u.id || S.isPlatformAdmin(u)));
/** A student's session, if they may be in it (its class's student; its teacher may still host). */
function studentSession(u, id) {
  const s = getSession(id);
  if (!s || !on() || !u || u.is_guest || u.banned || !isStudentOf(u, s.class_id) || !hostStill(getUser(s.host_id))) return null;
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
/** A board fitted into a session's teacher's area (growing the area when it must). -> the board, with its `layout`. */
function fitTeacherArea(tool, board, lay = {}) {
  const L = roomLayout(tool, lay), steps = (board.__steps || []).length ? TEACHER_STEP_H : 0;
  const first = fitInto(tool, board, WORLD, { w: L.teacher.w, h: L.teacher.h - steps }, { grow: true });
  const th = Math.max(L.teacher.h, first.h + steps), out = fitInto(tool, board, WORLD, { w: L.teacher.w, h: th - steps }).board;
  out.layout = { ...lay, th };
  return out;
}
/** How tall every square must be for a pushed board to be readable (its strip on top). */
export const STRIP_RESERVE = STRIP.head + STRIP.pad + 3 * STRIP.line;
function squareHeightFor(tool, board, lay = {}) {
  const L = roomLayout(tool, lay), f = fitInto(tool, board, WORLD, { w: L.sq.w, h: L.sq.h }, { grow: true });
  return Math.max(L.sq.h, f.h + STRIP_RESERVE);
}
/** The host's own area as a board to push ("Push my board"): the teacher's area as it is now, in the big board's
 *  space (as a saved board is), without what belongs to the room (its steps, sizes, switches, the deck's place) or the
 *  teacher's sticky notes (every square already shows those as its Instructions). -> board | null (nothing on it) */
function areaBoard(s) {
  const room = json(s.room || '{}', {}) || {}, L = roomLayout(s.tool, layoutOf(room));
  const o = { ...room }; for (const k of ['__steps', 'layout', 'checks', 'totals', DECK_AT]) delete o[k];
  const steps = stepsOf(room).length, from = { w: L.teacher.w, h: L.teacher.h - (steps ? TEACHER_STEP_H : 0) };
  // Notes, texts and pen marks are fractions of the area: made fractions of the big board.
  const ann = o.__ann && typeof o.__ann === 'object' ? o.__ann : {}, f = p => ({ ...p, x: num(p.x, 0, 1) * from.w / WORLD.w, y: num(p.y, 0, 1) * from.h / WORLD.h });
  o.__ann = { notes: [], texts: (Array.isArray(ann.texts) ? ann.texts : []).filter(x => x && String(x.text || '').trim()).map(f),
    strokes: (Array.isArray(ann.strokes) ? ann.strokes : []).filter(x => x && Array.isArray(x.pts)).map(x => ({ ...x, pts: x.pts.map(f) })) };
  const empty = !(Array.isArray(o.objects) && o.objects.length) && !(Array.isArray(o.pieces) && o.pieces.length) && !o.__ann.texts.length && !o.__ann.strokes.length;
  return empty ? null : { tool: s.tool, code: null, state: JSON.stringify(o) };
}
/** Push to every student: one of the host's own saved boards (boardId), or ({ own: true }) the host's own area as it is
 *  right now, with nothing saved first. */
export function push(u, id, boardId, { own = false } = {}) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  const b = own ? areaBoard(s) : ownBoard(u, boardId); if (!b) return fail(own ? 'emptyArea' : 'noBoard');
  if (b.tool !== s.tool) return fail('otherTool');
  const c = cleanState(b.state, null, b.tool); if (!c.ok) return c;
  // The board's steps become the session's deck (the teacher's area), from the first step; students get the board
  // without its steps (the deck reaches them one step at a time).
  const o = JSON.parse(c.state), steps = o.__steps; delete o.__steps;
  // Every square grows as tall as the board needs to stay readable (the session's `layout.sh`); students then fit it
  // into their square at one scale (public/js/manip-room.js).
  const room = json(s.room || '{}', {}) || {}, lay = layoutOf(room), sh = squareHeightFor(s.tool, migrate(s.tool, o), lay);
  const next = { ...room, layout: { ...lay, sh: Math.max(lay.sh || 0, sh) }, ...(steps && steps.length ? { __steps: steps } : {}) };
  q.run('UPDATE manip_sessions SET room=?, room_at=? WHERE id=?', JSON.stringify(next), now(), s.id);
  if (steps && steps.length) { posOf(s); LIVE.setStep(s.id, 0); keepStep(s.id); }
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
/** Reopen room (My boards, or the ended room's menu): an ended room runs again with the same join code, the teacher's
 *  area and every student's square as they were (a student who joins again gets their own square back). Its 12 hours
 *  start again; as with a new room, one running room per class (any other ends). Until KEEP_DAYS after it ended. */
export function reopen(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s) || !canHostClass(u, S.getClass(s.class_id))) return fail('notFound');
  if (s.status !== 'active') {
    const t = now();
    for (const r of q.all("SELECT id FROM manip_sessions WHERE class_id=? AND status='active' AND id!=?", s.class_id, s.id)) LIVE.forget(r.id);
    q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE class_id=? AND status='active' AND id!=?", t, s.class_id, s.id);
    q.run("UPDATE manip_sessions SET status='active', ended_at=NULL, opened_at=? WHERE id=?", t, s.id);
    audit(u.id, 'manip.reopen', s.id, { class: s.class_id });
    LIVE.publish(s.id, { t: 'dirty' });
  }
  return ok({ session: { id: s.id, code: s.code } });
}
/** The teacher renames a room (the word rules of any title). */
export function renameSession(u, id, title) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  const v = clipStr(title, LIMITS.titleChars).replace(/\s+/g, ' ').trim();
  if (!v) return fail('noTitle');
  const p = textProblem(v); if (p) return fail(p);
  q.run('UPDATE manip_sessions SET title=? WHERE id=?', v, s.id);
  LIVE.publish(s.id, { t: 'dirty' });
  return ok({ session: { id: s.id, title: v } });
}
/** The teacher deletes an ended room, and its students' work with it (a running room is ended first). */
export function deleteSession(u, id) {
  const s = getSession(id);
  if (!isSessionHost(u, s)) return fail('notFound');
  if (s.status === 'active') return fail('notEnded');
  q.run('DELETE FROM manip_sessions WHERE id=?', s.id);
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
  delete tState[DECK_AT];
  if (who.role !== 'teacher' && tState.__steps) delete tState.__steps;
  if (who.role !== 'teacher' && Array.isArray(tState.objects)) Object.assign(tState, JSON.parse(withoutKeys(tState)));
  return { role: who.role, me: who.key, id: s.id, code: who.role === 'teacher' ? s.code : undefined, tool: s.tool, title: s.title, status: s.status,
    className: c ? c.name : '', teacher: { state: JSON.stringify(tState), updatedAt: s.room_at || 0 }, areas, showWork: !!s.show_work, deck,
    pushed: who.role === 'student' ? s.pushed_state || null : !!s.pushed_state, pushedAt: s.pushed_at || 0,
    bring: LIVE.bringOf(s.id), cursors: LIVE.cursorsOf(s.id), hands: handsFor(s.id, who), ...(who.role === 'teacher' ? { checks: LIVE.checksOf(s.id) } : {}) };
}
/** The deck's position kept with the session: the teacher's area (manip_sessions.room) under DECK_AT, the server's own
 *  key (a page never sets it, and none is sent one). Written each time the step, the pace switch or a student's own step
 *  changes, so an ended room that is reopened (or a room after the server restarted) is back on the same step. */
export const DECK_AT = '__deckAt';
function savedStep(s) {
  const at = (json(s.room || '{}', {}) || {})[DECK_AT];
  if (!at || typeof at !== 'object') return { cur: 0, pace: false, mine: new Map() };
  const mine = new Map(Object.entries(at.mine && typeof at.mine === 'object' ? at.mine : {}).filter(([, i]) => Number.isInteger(i) && i >= 0));
  return { cur: Number.isInteger(at.cur) && at.cur >= 0 ? at.cur : 0, pace: !!at.pace, mine };
}
/** Where the deck is now: the running room's (memory), loaded from the session first if it has none yet. */
function posOf(s) {
  if (LIVE.stepKnown(s.id)) return LIVE.stepOf(s.id);
  const saved = savedStep(s);
  return s.status === 'active' ? LIVE.loadStep(s.id, saved) : saved;
}
/** Keep the running room's position with the session (see DECK_AT). The room's change time stays: nothing to redraw. */
function keepStep(sid) {
  const s = getSession(sid); if (!s) return;
  const pos = LIVE.stepOf(sid), room = json(s.room || '{}', {}) || {};
  room[DECK_AT] = { cur: pos.cur, pace: !!pos.pace, mine: Object.fromEntries(pos.mine) };
  q.run('UPDATE manip_sessions SET room=? WHERE id=?', JSON.stringify(room), sid);
}
/** Where the deck is: the teacher's step, and a student's own while they go at their own pace (clamped to the deck). */
export function stepIndex(s, steps, key) {
  const pos = posOf(s), last = Math.max(0, steps.length - 1);
  const i = pos.pace && key !== 't' && pos.mine.has(String(key)) ? pos.mine.get(String(key)) : pos.cur;
  return Math.min(Math.max(0, i), last);
}
function deckFor(s, tState, who) {
  const steps = stepsOf(tState), pos = posOf(s);
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
  if (who.role === 'teacher') { LIVE.setStep(s.id, next); keepStep(s.id); return ok({ cur: next }); }
  if (!posOf(s).pace) return fail('notFound');
  if (!allow(`mstep:${s.id}:${who.key}`, STEP_LIMIT, 60e3)) return fail('slow');
  LIVE.setMine(s.id, who.key, next); keepStep(s.id);
  return ok({ cur: next });
}
/** "Students go at their own pace": the teacher only. Off snaps everyone back to the teacher's step. */
export function pace(u, id, on) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || who.role !== 'teacher') return fail('notFound');
  posOf(s); LIVE.setPace(s.id, !!on); keepStep(s.id);
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
/** Locks in a student's square (docs/decisions.md "Virtual math manipulatives: hold to edit"). What the teacher locks
 *  there is the teacher's (`lockBy: 't'`): the student can't unlock, move, change or remove it, as with the teacher's
 *  notes. A student's own locks carry no author and the student may undo them; the teacher may unlock anything. In the
 *  teacher's area only the teacher writes, so no author is kept. Pieces come back whole as they were; an object keeps
 *  its place, size and lock but its own state stays the student's (counters still go into a locked ten-frame, a locked
 *  clock can still be set). */
function lockedBy(prev, next, key, who) {
  for (const f of ['pieces', 'objects']) {
    if (!Array.isArray(next[f])) continue;
    const before = new Map((Array.isArray(prev[f]) ? prev[f] : []).filter(x => x && x.id != null).map(x => [String(x.id), x]));
    if (key === 't') { for (const x of next[f]) if (x) delete x.lockBy; continue; }
    if (who.role === 'teacher') {
      for (const x of next[f]) {
        if (!x || !x.locked) { if (x) delete x.lockBy; continue; }
        const b = before.get(String(x.id));
        if (b && b.locked) { if (b.lockBy === 't') x.lockBy = 't'; else delete x.lockBy; } else x.lockBy = 't';
      }
      continue;
    }
    const theirs = [...before.values()].filter(x => x.locked && x.lockBy === 't');
    const held = new Map(theirs.map(x => [String(x.id), x]));
    next[f] = next[f].map(x => {
      if (!x) return x;
      const b = held.get(String(x.id));
      if (!b) { const m = { ...x }; delete m.lockBy; return m; }
      held.delete(String(x.id));
      return f === 'pieces' ? b : { ...x, x: b.x, y: b.y, s: b.s, locked: true, lockBy: 't' };
    });
    next[f].push(...held.values());   // removed by the student: put back
  }
  return next;
}
/** Save one area: key 't' (the teacher's area) or a student's id. The teacher may save any; a student only their own.
 *  Note authors are kept here, not taken from the browser: a note the teacher adds is the teacher's (everyone reads it);
 *  a student can't change or remove the teacher's notes in their square. */
export function saveArea(u, id, key, state) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || (who.role === 'student' && key !== who.key)) return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  // A student's square: its work space starts under the teacher's "Instructions" strip (the teacher's area's notes).
  const L = roomLayout(s.tool, layoutOf(json(s.room || '{}', {}) || {})), tState = json(s.room || '{}', {}) || {};
  const nextSteps = key === 't' ? stepsOf(typeof state === 'string' ? json(state, {}) : state) : [];
  const bounds = key === 't' ? { w: L.teacher.w, h: L.teacher.h - (nextSteps.length ? TEACHER_STEP_H : 0) } : squareBounds(s, L, key, tState);
  const row = key === 't' ? { state: s.room || '{}' } : q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, String(key));
  if (!row) return fail('notFound');
  const c = cleanState(state, key === 't' ? { ...bounds, teacher: true } : bounds, s.tool); if (!c.ok) return c;
  // A student's square never holds the teacher's answers (they could only have come from the page).
  const next = JSON.parse(key === 't' ? c.state : withoutKeys(c.state)), prev = json(row.state, {}) || {};
  // Notes and board text alike: who wrote each is kept here (see authored).
  next.__ann = { ...(next.__ann || { strokes: [] }), notes: authored(prev, next, 'notes', key, who, LIMITS.notes), texts: authored(prev, next, 'texts', key, who, LIMITS.texts) };
  lockedBy(prev, next, key, who);
  // The room's grown sizes are the server's to set (a session from a board, a push): never from a page.
  if (key === 't') { if (prev.layout) next.layout = prev.layout; else delete next.layout; } else delete next.layout;
  // The deck's position too (DECK_AT): kept as it was, never taken from a page.
  if (key === 't' && prev[DECK_AT]) next[DECK_AT] = prev[DECK_AT]; else delete next[DECK_AT];
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
/**
 * "Check my answers" (docs/decisions.md "Check my answers"). Only while the teacher allows it (the teacher's area's
 * `checks`). The page sends only the student's typed answers ({ object id: text }); the right answers come from the
 * teacher's board that was pushed (looked up by its code, the session host's own board) and never leave the server:
 * the reply is right / not yet per box and a count. At most CHECK_LIMIT checks a minute, so it isn't a guessing machine.
 * The result is memory only; the teacher sees each student's last one. -> { ok, results, right, total } | fail
 */
export const CHECK_LIMIT = 5;
function answerKeys(s) {
  const p = json(s.pushed_state || 'null', null); if (!p || !p.code) return null;
  const b = q.get('SELECT state FROM manip_boards WHERE code=? AND owner_id=?', normCode(p.code), s.host_id); if (!b) return null;
  const o = json(b.state, {}) || {}, keys = new Map();
  for (const x of Array.isArray(o.objects) ? o.objects : []) if (x && x.st && typeof x.st.key === 'string' && x.st.key) keys.set(String(x.id), { key: x.st.key, simplest: !!x.st.simplest, over: x.k === 'frac-eq' && x.st.op === '=' ? +x.st.b || 0 : 0 });
  return keys.size ? keys : null;
}
export function checkAnswers(u, id, answers = {}) {
  const s = getSession(id), who = roomRole(u, s);
  if (!who || who.role !== 'student') return fail('notFound');
  if (s.status !== 'active') return fail('ended');
  if ((json(s.room || '{}', {}) || {}).checks !== true) return fail('notFound');
  const keys = answerKeys(s); if (!keys) return fail('noAnswers');
  if (!allow(`mcheck:${s.id}:${who.key}`, CHECK_LIMIT, 60e3)) return fail('checkSlow');
  const given = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  const results = {}; let right = 0;
  for (const [oid, k] of keys) {
    const a = typeof given[oid] === 'string' ? clipStr(given[oid], ANS.max) : '';
    const okay = answerMatches(k.key, a, k);
    results[oid] = okay; if (okay) right++;
  }
  LIVE.setCheck(s.id, who.key, { right, total: keys.size });
  return ok({ results, right, total: keys.size });
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
  // The session's steps first, as the class saw them on the board (the teacher's export: every step).
  const steps = stepsOf(json(getSession(id).room || '{}', {}) || {});
  if (steps.length) blocks.unshift({ heading: 'Steps', lines: steps.map((x, i) => `${i + 1}. ${x.text}`) });
  const pdf = makePdf(`${v.title} - ${tl ? tl.name : v.tool} - ${v.className} - started ${stamp(v.createdAt, tz)}`, blocks);
  audit(u.id, 'manip.export', v.id, { students: v.students.length });
  return ok({ pdf, filename: `manipulatives-${v.code.toLowerCase()}.pdf` });
}

// ---------------------------------------------------------------- the AI lesson drafter (hosts only)
// The model says WHAT (a title, a few steps, the items and each one's settings); the code checks every setting and
// decides WHERE (public/js/manip-practice.js). No coordinates, no sticky notes, no pen marks: a drafted board is a tidy
// grid the teacher can trust, and the instructions are the steps of the deck.
const PT = { type: 'object', additionalProperties: false, required: ['x', 'y'], properties: { x: { type: 'integer' }, y: { type: 'integer' } } };
// The shape a draft has (the prompt describes it; kept as the reference for sanitizeDraft and the tests).
export const DRAFT_SCHEMA = {
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
const PT_HINT = ', points and pegs as {"x": 1, "y": 2}, pieces as {"kind": "...", "count": 3}';
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
    `Answer with one JSON object and nothing else, shaped like {"title": "...", "steps": ["..."], "items": [{"box": "answer", ...the settings above...}]}. Use only the settings listed for this tool; numbers as numbers, lists as arrays${PT_HINT}.`,
    `<lesson>\n${brief}${task ? `\nBased on this library task: ${task}` : ''}\n</lesson>`,
  ].join('\n');
}
/** Without the AI (no key, the AI budget is resting, or the AI failed or didn't answer in time): the tool's usual
 *  board, the brief as its one step. */
const templateDraft = (tl, { brief, task }) => ({ title: (task ? task.split(':')[0] : '') || `${tl.name} lesson`, steps: [clipStr(brief, 140)], items: [] });
/**
 * The checks before anything is stored or sent (services/manip-drafts.js runs them when a draft is asked for, and
 * again before the AI is called): a host, a real tool, a brief of a few words that passes the word rules and names
 * none of the host's students; a grade K-8 or none; a task only from this tool's own library.
 * -> { ok, tool, brief, grade, task } (the request as it may be stored and sent) | { ok:false, code: 'notFound'|'badTool'|'brief'|'words'|'personal'|'names' }
 */
export function draftRequest(u, { tool, brief, grade = '', task = '' } = {}) {
  if (!canHost(u)) return fail('notFound');
  const tl = toolOf(tool); if (!tl) return fail('badTool');
  const b = clipStr(brief, LIMITS.briefChars).replace(/\s+/g, ' ').trim();
  if (b.length < 3) return fail('brief');
  const p = textProblem(b); if (p) return fail(p);
  if (namesIn(u, b)) return fail('names');
  const g = /^(K|[1-8])$/.test(String(grade)) ? String(grade) : '';
  // Only a task from this tool's own library is passed on (by its title and prompt).
  const tk = (TASKS[tl.slug] || []).find(x => `${x.title}: ${x.prompt}` === String(task)) || null;
  return ok({ tool: tl.slug, brief: b, grade: g, task: tk ? `${tk.title}: ${tk.prompt}` : '' });
}
/** The AI call for a checked request (draftRequest's), or the tool's usual board without it. It never fails because of
 *  the AI: with no key or the AI budget resting (reason 'resting'), or when the call fails, times out or sends back
 *  something that is not a draft (reason 'timeout' | 'busy' | 'error', one warn line: services/ai-call.js), the draft
 *  is the template (ai: false) and the page says why. at: { draft } (the job's id, for the warn line).
 *  -> { ok, draft, ai, reason? } */
/** The first JSON object in the model's text (it may wrap it in a code fence or a sentence). -> object | throws */
export function jsonIn(text) {
  const t = String(text || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try { return JSON.parse(t); } catch { /* look for the object inside */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new SyntaxError('no JSON object');
  return JSON.parse(t.slice(a, b + 1));
}
export async function runDraft(u, r, at = {}) {
  const tl = toolOf(r.tool);
  const template = reason => ok({ draft: sanitizeDraft(templateDraft(tl, { brief: r.brief, task: r.task }), tl.slug), ai: false, reason });
  const client = hooks.create ? { messages: { create: hooks.create } } : anthropic('free');
  if (!client) return template('resting');
  let raw;
  const t0 = Date.now();
  try {
    // A full board (PRACTICE_MAX items with their settings, STEPS_MAX steps, a title) is well under 2000 tokens of JSON.
    const res = await callAi(client, {
      model: config.builderModel, max_tokens: 3000,
      // No strict json_schema here: with this many optional item settings the constrained grammar made the call hang
      // past the budget in production (22 Nov 2026, two drafts timed out with no answer). The model writes plain JSON
      // to the shape in the prompt; sanitizeDraft checks every field anyway.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: prompt(tl, { grade: r.grade, brief: r.brief, task: r.task }) }],
    });
    if (res && res.usage) aiBudget.recordUsage(res.model || config.builderModel, res.usage);
    const block = ((res && res.content) || []).find(c => c.type === 'text');
    raw = jsonIn(block ? block.text : '');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SyntaxError('not a draft');
    log('info', 'manipulatives draft ai answered', { draft: at.draft || null, tool: tl.slug, ms: Date.now() - t0 });
  } catch (e) {
    return template(fallbackReason(logAiFail('manipulatives draft ai failed', { draft: at.draft || null, tool: tl.slug }, e, t0)));
  }
  audit(u.id, 'manip.draft', tl.slug, {});
  return ok({ draft: sanitizeDraft(raw, tl.slug), ai: true });
}
/** Both at once (the drafter's job runs them as two steps). -> { ok, draft, ai } | fail */
export async function draftLesson(u, args = {}) {
  const r = draftRequest(u, args); if (!r.ok) return r;
  return runDraft(u, r);
}

// ---------------------------------------------------------------- cleanup (accounts and classes)
/** An account is deleted (services/account-delete.js): their boards, their work, the sessions they ran. */
export function forgetUser(userId) {
  q.run('DELETE FROM manip_boards WHERE owner_id=?', userId);
  q.run('DELETE FROM manip_drafts WHERE owner_id=?', userId);
  q.run('DELETE FROM manip_chats WHERE owner_id=?', userId);
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
