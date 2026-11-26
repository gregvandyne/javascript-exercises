// Homeroom: Manipulatives tools on students' desks (docs/decisions.md "Homeroom: watching desks and the full catalog").
// The owner: "Manipulatives should be the same experience in homeroom as it is in its actual game." So a tool handed out
// in Homeroom IS that tool's Manipulatives live room for the class, never a copy:
//   - handing out a tool (the left panel's Teaching tools, or a card on My desk) opens that tool's live room session for
//     the class (services/manipulatives.js createSession, the teacher as its host) or uses the one already running for
//     that tool; the handout (homeroom_rooms.tools, migration 0137) says which desks have it;
//   - the student's card opens /manipulatives#join/<session> in the desk's player (?in=hr: the same page without the
//     site's menu): they join and work in their own square exactly as in any live room (palette, board, pieces, totals,
//     How it works, raised hands, Check my answers); their board is saved as always (manip_work);
//   - the teacher's board draws each such desk's square read-only from manip_work with the tool's own drawing
//     (public/js/homeroom-watch.js), and the student's live-room cursor (services/manip-live.js) on it; the room itself
//     (PDF, Check, push a board, show work) stays a tap away (Open the room).
// One Manipulatives room runs per class (the live room's rule), so a second tool waits until the first is taken off
// every desk (the hand-out sheet says which tool runs, with Take it off every desk right there: roomOf). A session ends
// on its own after 12 hours (SESSION_HOURS): only that automatic end is undone, the teacher's board opening it again
// (reopen) for its host the next time they open Homeroom, so a tool handed out yesterday still works today. A room the
// teacher ended (End session in the room, from look's Open the room or the Manipulatives page; another room started in
// the class) takes its tool off every desk: its handout goes (tidy), so it never opens again by itself and no student
// keeps a card that opens an ended room. End class takes every tool off the desks and ends its room (docs/decisions.md
// "Homeroom: QA fixes for Manipulatives in Homeroom"). Only the class's own teachers (who may host Manipulatives) hand
// out or take off a tool; a student sees only the cards on their own desk.
import { q, now, audit } from '../db.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as M from './manipulatives.js';
import * as LIVE from './manip-live.js';
import * as MT from './manip-tasks.js';
import { toolOf, roomLayout, layoutOf, instructionNotes, stripHeight } from '../../public/js/manip-data.js';
import { DEFAULT_GROUPS } from '../../public/js/homeroom-seats.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
const json = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
/** Tool handouts a class may have at once. */
export const TOOLS_MAX = 8;
export const ID_RE = /^mt[a-z0-9]{8}$/;

const HOUR = 3600e3;
/** Did this room end by itself (its 12 hours ran out), not because someone ended it? (prune ends it at or after
 *  opened_at + SESSION_HOURS; a teacher's End session, or another room started in the class, ends it before that.) */
export const endedByItself = s => !!s && s.status !== 'active' && (s.ended_at || 0) - (s.opened_at || s.created_at || 0) >= M.SESSION_HOURS * HOUR - 60e3;
/** What is stored for the class, tidied: a handout whose room is gone or was ended by someone (not by itself) is taken
 *  off every desk (written back), so the class can hand out another tool and students lose its card. */
export function storedOf(classId) {
  const r = q.get('SELECT tools FROM homeroom_rooms WHERE class_id=?', classId);
  const all = (r ? json(r.tools, []) : []).filter(x => x && typeof x === 'object' && ID_RE.test(x.id) && toolOf(x.tool) && x.session);
  const keep = all.filter(x => { const s = M.getSession(x.session); return s && (s.status === 'active' || endedByItself(s)); });
  if (keep.length !== all.length) q.run('UPDATE homeroom_rooms SET tools=? WHERE class_id=?', JSON.stringify(keep), classId);
  return keep;
}
function write(classId, list) {
  const t = now();
  q.run('INSERT INTO homeroom_rooms(class_id, groups, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(class_id) DO NOTHING', classId, JSON.stringify(DEFAULT_GROUPS), t, t);
  q.run('UPDATE homeroom_rooms SET tools=? WHERE class_id=?', JSON.stringify(list.slice(0, TOOLS_MAX)), classId);
}
/** May this teacher hand out Manipulatives in this class? The class's teacher who may host a live room for it. */
export const canGive = (u, c) => H.canUseClass(u, c) && M.canHostClass(u, c);
/** Is this handout on this student's desk? (students [] means the whole class.) */
const forStudent = (x, sid) => !x.students.length || x.students.includes(sid);
const sessionOf = x => M.getSession(x.session);
const activeOf = classId => q.get("SELECT * FROM manip_sessions WHERE class_id=? AND status='active' ORDER BY opened_at DESC", classId) || null;

/**
 * Hand out a Manipulatives tool: { tool (a Manipulatives tool's slug), to (as a game's handout), instructions }.
 * -> { ok, item, session } | { ok: false, code } ('oneTool': another tool's room runs in the class; 'alreadyOnDesk').
 */
export function handOutTool(u, c, { tool, to, instructions = '' } = {}) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  if (!M.canHostClass(u, c)) return fail('noTools');
  const tl = toolOf(String(tool || '')); if (!tl) return fail('badTool');
  if (typeof instructions !== 'string' || instructions.trim().length > HO.INSTRUCTIONS_MAX) return fail('tooLong');
  const text = HO.cleanInstructions(instructions);
  const bad = M.textProblem(text); if (bad) return fail(bad);
  const who = HO.studentsFor(c, to); if (!who.ok) return who;
  const list = storedOf(c.id);
  if (list.length >= TOOLS_MAX) return fail('tooManyHandouts');
  // One room per class: the tool's own room when it runs, never one that would end another tool's room.
  // (a room of another tool that no handout uses blocks nothing: a new room for this tool ends it)
  const running = activeOf(c.id), used = running && list.some(x => x.session === running.id);
  if (running && running.tool !== tl.slug && used) return fail('oneTool', { tool: (toolOf(running.tool) || {}).name || '' });
  const act = running && running.tool === tl.slug ? running : null;
  const same = list.filter(x => x.tool === tl.slug);
  if (same.some(x => !x.students.length || !who.students.length || who.all.some(id => x.students.includes(id)))) return fail('alreadyOnDesk', { count: 1 });
  let session = act;
  if (!session) {
    // a room of this tool that a handout already used, and ended (12 hours): open it again, squares and all
    const old = same.map(sessionOf).find(s => s && M.isSessionHost(u, s));
    if (old) { const r = M.reopen(u, old.id); if (!r.ok) return r; session = M.getSession(old.id); }
    else {
      const r = M.createSession(u, { classId: c.id, tool: tl.slug, title: `${tl.name} · Homeroom` });
      if (!r.ok) return r;
      session = M.getSession(r.session.id);
    }
  }
  const item = { id: `mt${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`, tool: tl.slug, session: session.id, target: who.target, students: who.students, instructions: text, by: u.id, at: now() };
  write(c.id, [...list, item]);
  audit(u.id, 'homeroom.tool', c.id, { tool: tl.slug, session: session.id, target: who.target, students: who.all.length });
  return ok({ item, session: { id: session.id } });
}
/** Take a tool off one desk (studentId) or off every desk. The room itself is left as it is (its boards are kept, as
 *  for any live room); with no tool handout left on it, it ends. -> { ok, removed } */
export function removeTool(u, c, id, studentId = null) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  const list = storedOf(c.id), it = list.find(x => x.id === String(id || ''));
  if (!it) return fail('notFound');
  let rest = list.filter(x => x !== it), removed = 'all';
  if (studentId) {
    const sid = String(studentId), all = H.studentsOf(c.id).map(s => s.id), on = it.students.length ? it.students : all;
    if (!on.includes(sid)) return fail('notOnDesk');
    const left = on.filter(x => x !== sid && all.includes(x));
    if (left.length) { rest = list.map(x => (x === it ? { ...x, students: left, target: 'desk' } : x)); removed = 'desk'; }
  }
  write(c.id, rest);
  if (removed === 'all' && !rest.some(x => x.session === it.session)) { const s = sessionOf(it); if (s && s.status === 'active' && M.isSessionHost(u, s)) M.end(u, s.id); }
  audit(u.id, 'homeroom.toolRemove', c.id, { tool: it.tool, ...(studentId ? { student: String(studentId) } : {}) });
  return ok({ removed });
}
/** The teacher opened Homeroom: a tool handout's room that ended by itself (12 hours) opens again for its host, unless
 *  another room runs in the class now. Never a room someone ended (storedOf has taken those off the desks). */
export function keepOpen(u, c) {
  if (!canGive(u, c)) return;
  if (activeOf(c.id)) return;
  for (const x of storedOf(c.id)) {
    const s = sessionOf(x);
    if (!s || !endedByItself(s) || !M.isSessionHost(u, s)) continue;
    if (M.reopen(u, s.id).ok) break;
  }
}
/** End class (services/homeroom.js setLive 'end'): every tool comes off every desk and its room ends (its boards are
 *  kept, as for any ended room). -> how many tool handouts came off */
export function takeAllOff(by, c) {
  const list = storedOf(c.id); if (!list.length) return 0;
  write(c.id, []);
  const t = now();
  for (const id of new Set(list.map(x => x.session))) {
    const s = M.getSession(id);
    if (s && s.status === 'active') { q.run("UPDATE manip_sessions SET status='ended', ended_at=? WHERE id=? AND status='active'", t, s.id); LIVE.forget(s.id); }
  }
  audit(by ? by.id : null, 'homeroom.toolsOff', c.id, { tools: list.map(x => x.tool), why: 'endClass' });
  return list.length;
}
H.onLive(({ by, c, action }) => { if (action === 'end') takeAllOff(by, c); });
/** The Manipulatives room running in the class now (one at a time): { session, tool, title, icon, handout (the tool
 *  handout on desks that uses it, or '') } or null. The hand-out sheet shows it before a second tool is picked. */
export function roomOf(c) {
  const act = activeOf(c.id); if (!act) return null;
  const tl = toolOf(act.tool), x = storedOf(c.id).find(y => y.session === act.id);
  // a room no tool handout uses (started or reopened on the Manipulatives page) never blocks Homeroom: the next tool
  // handed out starts its own room, which ends that one (QA round 2, N1: never an unreachable room in the way)
  if (!x) return null;
  return { session: act.id, tool: act.tool, title: tl ? tl.name : '', icon: tl ? tl.emoji : '🧮', handout: x ? x.id : '' };
}

// ---------------------------------------------------------------- what the board and the desk read
/** The board's view of the class's tool handouts: [{ id, tool, title, icon, instructions, target, students (count),
 *  ids (null: everyone), session, open, at }]. */
export function boardList(c) {
  const n = H.studentsOf(c.id).length;
  return storedOf(c.id).map(x => {
    const tl = toolOf(x.tool), s = sessionOf(x);
    return { id: x.id, tool: x.tool, title: tl.name, icon: tl.emoji, instructions: x.instructions || '', target: x.target, students: x.students.length || n, ids: x.students.length ? x.students : null,
      session: x.session, open: !!(s && s.status === 'active'), at: x.at };
  });
}
/** One student's tool cards (their own desk only): what services/homeroom-handouts.js deskView adds after the handouts. */
export function deskCards(c, u) {
  return storedOf(c.id).filter(x => forStudent(x, u.id)).map(x => {
    const tl = toolOf(x.tool), s = sessionOf(x), ready = !!(s && s.status === 'active');
    return { id: x.id, tool: x.tool, title: tl.name, icon: tl.emoji, instructions: x.instructions || '', inOrder: false, due: null, ready, practice: true,
      href: ready ? `/manipulatives#join/${encodeURIComponent(s.id)}` : null, done: false, pct: 0 };
  });
}
/** Is this a tool handout on this student's desk? (a pulse's `on`) */
export const onDesk = (c, sid, id) => storedOf(c.id).some(x => x.id === String(id || '') && forStudent(x, sid));

/** The square a student works in (room pixels) and its work space under the Instructions strip, as the live room draws it. */
function squareOf(s, slot) {
  const room = json(s.room || '{}', {}) || {}, L = roomLayout(s.tool, layoutOf(room)), r = L.slot(slot);
  const notes = instructionNotes(((room.__ann || {}).notes) || []), top = stripHeight(notes, L.sq);
  return { rect: r, top, space: { w: r.w, h: r.h - top } };
}
/**
 * Each of these students' Manipulatives board in the class's tool rooms (the teacher's board, for the desks it shows):
 * Map sid -> { tool, session, state (the saved JSON), v (when it changed), space, cur: [x, y] fractions of the work space
 * or null, on (the handout it belongs to), title, prob? }. Only students with a tool handout on their desk who joined its
 * room, or with a practice set open in the desk's player.
 * beatOf(sid) -> { where, on } | null (services/homeroom-live.js beatOf): when given, a board is sent only while the
 * desk's own pulse says that very handout is open in the player (where 'tool', the same on), so a board and the problem
 * it shows always go together with what the desk has open: never yesterday's set, another tool's board, or a board
 * after the player closed (docs/decisions.md "Homeroom: QA fixes for Manipulatives in Homeroom").
 */
export function boardsOf(c, sids, beatOf = null) {
  const out = new Map(), list = storedOf(c.id);
  const openOn = (sid, on) => { if (!beatOf) return true; const b = beatOf(sid); return !!b && b.where === 'tool' && b.on === on; };
  // a Manipulatives practice set open in the desk's player (services/manip-tasks.js putLive): its board and the problem,
  // pushed together (one entry: the board of question i with question i's words); a finished set shows none
  for (const [sid, e] of MT.liveOf(c.id, sids)) {
    if (!openOn(sid, e.on) || MT.setDone(e.on, sid)) continue;
    out.set(sid, { tool: e.slug, session: '', state: e.state, v: e.v, space: e.space, cur: null, on: e.on, title: e.title || '', prob: { i: e.i, n: e.n, prompt: e.prompt, box: e.box, key: e.key || '' } });
  }
  if (!list.length || !sids.length) return out;
  for (const x of list) {
    const s = sessionOf(x); if (!s) continue;
    const want = sids.filter(id => forStudent(x, id) && !out.has(id) && openOn(id, x.id)); if (!want.length) continue;
    const rows = q.all(`SELECT user_id, state, slot, updated_at FROM manip_work WHERE session_id=? AND user_id IN (${want.map(() => '?').join(',')})`, s.id, ...want);
    const curs = s.status === 'active' ? LIVE.cursorsOf(s.id) : [];
    for (const w of rows) {
      const sq = squareOf(s, w.slot), cc = curs.find(k => k.k === w.user_id);
      const cur = cc ? [(cc.x - sq.rect.x) / sq.rect.w, (cc.y - sq.rect.y - sq.top) / Math.max(1, sq.space.h)] : null;
      out.set(w.user_id, { tool: s.tool, session: s.id, state: w.state, v: w.updated_at, space: sq.space, on: x.id, title: (toolOf(x.tool) || {}).name || '',
        cur: cur && cur.every(v => v >= 0 && v <= 1) ? cur.map(v => Math.round(v * 1000) / 1000) : null });
    }
  }
  return out;
}
/** A student's board version only (the board's 2 s poll: is there something new to draw?). Map sid -> v. */
export function versionsOf(c) {
  const out = new Map();
  for (const [sid, e] of MT.liveOf(c.id, H.studentsOf(c.id).map(s => s.id))) out.set(sid, e.v);
  for (const x of storedOf(c.id)) for (const w of q.all('SELECT user_id, updated_at FROM manip_work WHERE session_id=?', x.session)) if (forStudent(x, w.user_id) && !out.has(w.user_id)) out.set(w.user_id, w.updated_at);
  return out;
}
