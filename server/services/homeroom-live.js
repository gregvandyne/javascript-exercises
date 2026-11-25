// Homeroom, step 3a: live class, watching desks (docs/homeroom.md "Live class"; docs/decisions.md "Homeroom, step 3a").
// While a class is live (services/homeroom.js liveOf) the teacher's board shows, per desk, what the student is on, how
// far along, and a calm status; each student's named cursor moves around their own desk; students raise a hand (a
// question, help, the bathroom through a one-at-a-time hall pass); a 📊 Today panel counts each of today's handouts; and
// the teacher can look at one student's desk in summary and lock it, hide their cursor or say "I'm coming over".
//
// Transport: Homeroom's own polling (docs/decisions.md "Homeroom, step 1b" explains why not the Manipulatives socket).
// A desk (and a handout's game page) sends a small pulse: where it is (desk or game), which handout, how long since the
// last input, a count of the game's own steps forward, and up to SAMPLES cursor samples taken at most 4 times a second.
// Never keystrokes, words, answers or the screen. Pulses, statuses and cursors live only in this process's memory for
// the live class (nothing about activity is written to the database); hands, the hall pass and the desk settings are in
// homeroom_live so a restart mid-class keeps them. End class wipes both.
//
// Status rules (statusOf; the same order as checked):
//   1. Not here ('away'): no pulse for HERE_MS (30 s; a desk pulses at least every 10 s while it is open and visible).
//   2. Done ('done'): every handout on their desk is done (at least one).
//   3. Stuck ('stuck', "Needs a look"): their current handout (the one open in the game, else the desk's Next up) is
//      unfinished and nothing moved forward on it for STUCK_MS (3 minutes) since they started on it or came back.
//      Moving forward is the card turning done, a new score, or the game itself saving or scoring (a step); time spent
//      alone is not progress, nor is drawing on the pad.
//   4. Typing ('typing'): any input (a key, a tap, a pen stroke) in the last TYPING_MS (10 s).
//   5. Working ('working'), or At desk ('here') when nothing is on their desk.
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as LIB from './library.js';
import * as AT from './homeroom-attendance.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });

export const BEAT_MS = 10e3, HERE_MS = 30e3, TYPING_MS = 10e3, STUCK_MS = 3 * 60e3;
/** Above this many students the board shows presence only (no cursors): spec, "Weak school Wi-Fi". */
export const CURSORS_MAX = 30;
/** Cursor samples kept per student (the newest), and the oldest a sample may be when sent. */
export const SAMPLES = 8, SAMPLE_SPAN = 4000;
export const HAND_KINDS = ['question', 'help', 'bathroom'];
export const PASS_DEFAULT = 5, PASS_MIN = 1, PASS_MAX = 20;
/** "I'm coming over" shows on the student's desk for this long at most. */
export const COMING_MS = 5 * 60e3;
// 'reading': the desk's reading layer is open (docs/decisions.md "Homeroom: reading from the desk"), on a Reading handout
// (on) or reading freely from the dock's Library; it says which book and page, so the board shows "Reading <book>".
const WHERE = ['desk', 'game', 'reading'];
const FLAGS = { lock: 'locked', hide: 'hidden', coming: 'coming_at' };

// ---------------------------------------------------------------- pulses (memory only)
/** classId -> Map(userId -> beat) for live classes. */
const rooms = new Map();
const beatsOf = classId => { let m = rooms.get(classId); if (!m) { m = new Map(); rooms.set(classId, m); } return m; };
/** For tests: forget every pulse. */
export const _reset = () => rooms.clear();
/** Should desks send cursors for this class (CURSORS_MAX)? */
export const cursorsOn = classId => H.studentsOf(classId).length <= CURSORS_MAX;
const frac = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : 0; };
/** Cursor samples as sent ([[dt ms from the first, x, y]...], fractions of the desk or the pad) to [[at, x, y]] in this
 *  server's time, the last one at `at`: at most SAMPLES, within SAMPLE_SPAN, in order. */
export function cleanSamples(list, at) {
  if (!Array.isArray(list)) return [];
  const pts = list.slice(-SAMPLES).filter(p => Array.isArray(p) && p.length >= 3 && Number.isFinite(Number(p[0])))
    .map(p => [Math.min(SAMPLE_SPAN, Math.max(0, Math.round(Number(p[0])))), frac(p[1]), frac(p[2])]);
  if (!pts.length) return [];
  const last = Math.max(...pts.map(p => p[0]));
  return pts.sort((a, b) => a[0] - b[0]).map(([dt, x, y]) => [at - (last - dt), x, y]);
}
const handoutIn = (classId, id) => !!id && !!q.get('SELECT 1 FROM homeroom_handouts h JOIN class_lessons cl ON cl.id=h.class_lesson_id AND cl.removed_at IS NULL WHERE h.class_lesson_id=? AND h.class_id=?', String(id), classId);

/**
 * A desk's (or a handout's game page's) pulse: { where: desk | game, on: class lesson id or '', idle: seconds since
 * the last input, step: how many times the game moved forward on this page, cur: cursor samples on the desk, pad:
 * samples on the (team) pad }. Only while the class is live (else nothing is kept). -> { ok, live, me, mates? }
 */
export function pulse(u, c, body = {}, at = now()) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  const live = H.liveOf(c.id);
  if (!live) return ok({ live: null, me: null });
  const m = beatsOf(c.id), old = m.get(u.id) || null, b = old ? { ...old } : {};
  const where = WHERE.includes(body.where) ? body.where : 'desk';
  const on = body.on && handoutIn(c.id, body.on) ? String(body.on) : '';
  const idle = Math.min(3600, Math.max(0, Number(body.idle) || 0));
  const step = Math.max(0, Math.min(1e6, Math.floor(Number(body.step) || 0)));
  // Back after being away (or the first pulse of this live class): a fresh start, so nobody is "stuck" from before.
  const fresh = !old || at - old.at > HERE_MS || old.since < live.since;
  if (fresh) Object.assign(b, { since: at, onSince: at, progAt: at, cardKey: null });
  if (!fresh && (b.on !== on || b.where !== where)) { b.onSince = at; b.progAt = at; }
  // the game's own steps forward (it saved or scored) on this page
  if (!fresh && where === 'game' && b.where === 'game' && b.on === on && step > (b.step || 0)) b.progAt = at;
  Object.assign(b, { at, where, on, step, inputAt: at - idle * 1000 });
  const bk = where === 'reading' && body.book ? LIB.getBook(String(body.book)) : null;
  b.book = bk ? { id: bk.id, page: Math.max(0, Math.min(bk.pages.length, Math.floor(Number(body.page) || 0))) } : null;
  // turning a page counts as moving forward (never time alone)
  if (!fresh && bk && b.book && old && old.book && old.book.id === bk.id && b.book.page > old.book.page) b.progAt = at;
  const row = rowOf(c.id, u.id);
  // (a student marked At home or Absent today shares no cursor: the board shows a chip instead)
  if (cursorsOn(c.id) && !(row && row.hidden) && live && !live.paused && !AT.statusOf(c.id, u.id, at)) {
    const cur = where === 'desk' ? cleanSamples(body.cur, at) : [], pad = where === 'desk' ? cleanSamples(body.pad, at) : [];
    if (cur.length) b.cur = cur; if (pad.length) b.pad = pad;
    if (cur.length || pad.length) b.curAt = at;
  } else { b.cur = []; b.pad = []; }
  m.set(u.id, b);
  return ok({ live, me: mineOf(c, u.id, at), mates: matesOf(c, u.id, at) });
}

/** The status of one student from their pulse and their desk's cards (HO.boardView's desks[id]), at a time. Pure, so
 *  the rules are tested on their own. -> { st: away | done | stuck | typing | working | here, on: class lesson id | '' } */
export function statusOf(beat, cards = [], at = now()) {
  const open = cards.filter(x => !x.done);
  const cur = beat && beat.on && open.find(x => x.id === beat.on) || open.find(x => x.next) || open.find(x => !x.locked) || null;
  const on = cur ? cur.id : '';
  if (!beat || at - beat.at > HERE_MS) return { st: 'away', on: beat && beat.on && cards.some(x => x.id === beat.on) ? beat.on : on };
  if (cards.length && !open.length) return { st: 'done', on: '' };
  if (cur && at - Math.max(beat.progAt || 0, beat.onSince || 0, beat.since || 0) >= STUCK_MS) return { st: 'stuck', on };
  if (at - (beat.inputAt || 0) <= TYPING_MS) return { st: 'typing', on };
  return { st: cards.length ? 'working' : 'here', on };
}
/** A card's state that counts as moving forward when it changes (done, a new score; never the time spent). */
const cardKey = c => (c ? `${c.id}:${c.done ? 1 : 0}:${c.score ?? ''}` : '');

// ---------------------------------------------------------------- hands, the hall pass, desk settings (homeroom_live)
const rowOf = (classId, userId) => q.get('SELECT * FROM homeroom_live WHERE class_id=? AND user_id=?', classId, userId) || null;
function setRow(classId, userId, fields) {
  const t = now();
  q.run('INSERT INTO homeroom_live(class_id, user_id, updated_at) VALUES (?,?,?) ON CONFLICT(class_id, user_id) DO NOTHING', classId, userId, t);
  const cols = Object.keys(fields);
  q.run(`UPDATE homeroom_live SET ${cols.map(k => `${k}=?`).join(', ')}, updated_at=? WHERE class_id=? AND user_id=?`, ...cols.map(k => fields[k]), t, classId, userId);
}
/** How long the hall pass lasts in this class, in minutes. */
export const passMinutes = classId => { const r = q.get('SELECT pass_minutes m FROM homeroom_rooms WHERE class_id=?', classId); return r && r.m >= PASS_MIN && r.m <= PASS_MAX ? r.m : PASS_DEFAULT; };
const isStudent = (classId, id) => H.studentsOf(classId).some(s => s.id === id);
/** The class's rows, current students only. */
function rowsOf(classId) {
  const ids = new Set(H.studentsOf(classId).map(s => s.id));
  return q.all('SELECT * FROM homeroom_live WHERE class_id=? ORDER BY rowid', classId).filter(r => ids.has(r.user_id));
}
const lineOf = classId => rowsOf(classId).filter(r => r.pass === 'line').sort((a, b) => (a.pass_at || 0) - (b.pass_at || 0));
/** Whoever is next in line gets the pass when nobody has it (one student out at a time). */
function moveLine(classId) {
  if (rowsOf(classId).some(r => r.pass === 'out')) return;
  const next = lineOf(classId)[0];
  if (next) setRow(classId, next.user_id, { pass: 'out', out_at: now() });
}
/** What a student sees of their own live desk: their hand, their place with the hall pass, and their desk's settings.
 *  Never anyone else's. */
export function mineOf(c, userId, at = now()) {
  const r = rowOf(c.id, userId) || {}, line = r.pass === 'line' ? lineOf(c.id) : [];
  return { hand: r.hand || '', pass: r.pass || '', ...(AT.statusOf(c.id, userId, at) ? { home: true } : {}), ...(r.pass === 'line' ? { place: line.findIndex(x => x.user_id === userId) + 1 } : {}),
    ...(r.pass === 'out' ? { outAt: r.out_at } : {}), minutes: passMinutes(c.id), locked: !!r.locked, hidden: !!r.hidden,
    coming: !!r.coming_at && at - r.coming_at < COMING_MS, cursors: cursorsOn(c.id), now: at };
}
/** A desk's own live view without a pulse (the desk's state poll): { me, mates }. */
export const deskLiveOf = (c, u, at = now()) => ({ me: mineOf(c, u.id, at), mates: matesOf(c, u.id, at) });
/** A team desk's members' cursors on the shared pad (step 3a: the only cursors a student sees): [{ name, pts }]. */
function matesOf(c, userId, at = now()) {
  const team = H.teamOf(c.id, userId); if (!team || !cursorsOn(c.id)) return [];
  const m = rooms.get(c.id), names = new Map(S.roster(c.id).map(p => [p.id, p.display_name])), out = [];
  for (const id of team.members) {
    if (id === userId) continue;
    const b = m && m.get(id), r = rowOf(c.id, id);
    if (!b || !b.pad || !b.pad.length || r && r.hidden || at - (b.curAt || 0) > SAMPLE_SPAN + 6000) continue;
    out.push({ id, name: names.get(id) || '', pts: b.pad.map(([t, x, y]) => [at - t, x, y]) });
  }
  return out;
}

/** A student raises their hand: question, help or bathroom (the hall pass). Live class only; one hand at a time (a new
 *  kind replaces the old one). -> { ok, me } */
export function raiseHand(u, c, kind) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  if (!H.liveOf(c.id)) return fail('notLive');
  if (!HAND_KINDS.includes(kind)) return fail('badKind');
  // at home (or marked absent): no hands or hall pass; a question goes to the teacher as a note (AT.ask)
  if (AT.statusOf(c.id, u.id)) return fail('atHome');
  const r = rowOf(c.id, u.id);
  if (kind === 'bathroom' && r && (r.pass === 'line' || r.pass === 'out')) return fail('passAlready');
  if (!r || r.hand !== kind) setRow(c.id, u.id, { hand: kind, hand_at: now() });
  return ok({ me: mineOf(c, u.id) });
}
/** A student puts their hand down (and leaves the hall pass line), or says they're back with the pass. -> { ok, me } */
export function lowerHand(u, c, { back = false } = {}) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  const r = rowOf(c.id, u.id);
  if (r) {
    if (back && r.pass === 'out') { setRow(c.id, u.id, { pass: '', out_at: null, pass_at: null }); moveLine(c.id); }
    else if (!back) setRow(c.id, u.id, { hand: '', hand_at: null, ...(r.pass === 'line' ? { pass: '', pass_at: null } : {}) });
  }
  return ok({ me: mineOf(c, u.id) });
}

/**
 * The teacher's answers (the class's teachers only):
 *   answer { studentId }            a question or help: Answered (the hand goes down);
 *   pass { studentId }              a bathroom hand: the hall pass now, or next in line when someone has it;
 *   notNow { studentId }            a bathroom hand put down without the pass;
 *   back { studentId }              they're back: the pass goes to whoever is next in line; out of the line otherwise;
 *   minutes { minutes }             how long the pass lasts (PASS_MIN to PASS_MAX).
 * -> { ok, ...teacherView }
 */
export function teacherHands(u, c, { action, studentId = '', minutes } = {}) {
  // (step 3c: an aide and a sub answer hands and the hall pass too; the pass's length is the teacher's or an aide's)
  if (!H.canHelp(u, c)) return fail('notFound');
  if (action === 'minutes') {
    if (!H.canHelp(u, c, ['aide'])) return fail('forbidden');
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n < PASS_MIN || n > PASS_MAX) return fail('badMinutes');
    q.run('UPDATE homeroom_rooms SET pass_minutes=? WHERE class_id=?', n, c.id);
    return ok(handsView(c));
  }
  if (!H.liveOf(c.id)) return fail('notLive');
  const sid = String(studentId || '');
  if (!isStudent(c.id, sid)) return fail('notInClass');
  const r = rowOf(c.id, sid);
  if (action === 'answer' || action === 'notNow') {
    if (!r || !r.hand) return fail('noHand');
    setRow(c.id, sid, { hand: '', hand_at: null });
  } else if (action === 'pass') {
    if (!r || r.hand !== 'bathroom') return fail('noHand');
    const someoneOut = rowsOf(c.id).some(x => x.pass === 'out' && x.user_id !== sid);
    setRow(c.id, sid, { hand: '', hand_at: null, ...(someoneOut ? { pass: 'line', pass_at: now() } : { pass: 'out', out_at: now(), pass_at: now() }) });
  } else if (action === 'back') {
    if (!r || !r.pass) return fail('noPass');
    setRow(c.id, sid, { pass: '', out_at: null, pass_at: null });
    moveLine(c.id);
  } else return fail('badAction');
  return ok(handsView(c));
}
/** The class's teachers set one student's desk: lock (they see "Your teacher locked your desk for a moment"), hide
 *  (their cursor isn't shared), coming ("Your teacher is coming over"). -> { ok, flags } */
export function setFlag(u, c, studentId, flag, on) {
  // (step 3c: an aide may say "I'm coming over"; locking a desk and hiding a cursor stay the teacher's)
  if (!H.canUseClass(u, c)) { if (!H.canHelp(u, c, ['aide'])) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound'); if (flag !== 'coming') return fail('forbidden'); }
  if (!H.liveOf(c.id)) return fail('notLive');
  if (!FLAGS[flag]) return fail('badAction');
  const sid = String(studentId || '');
  if (!isStudent(c.id, sid)) return fail('notInClass');
  setRow(c.id, sid, { [FLAGS[flag]]: flag === 'coming' ? (on ? now() : null) : on ? 1 : 0 });
  if (flag === 'hide' && on) { const b = rooms.get(c.id)?.get(sid); if (b) { b.cur = []; b.pad = []; } }
  if (flag !== 'coming') audit(u.id, 'homeroom.desk', c.id, { student: sid, flag, on: !!on });
  return ok({ flags: flagsOf(rowOf(c.id, sid)) });
}
const flagsOf = r => ({ locked: !!(r && r.locked), hidden: !!(r && r.hidden), coming: !!(r && r.coming_at && now() - r.coming_at < COMING_MS) });

/** The Hands panel: hands up in the order raised (the roster's names: this is the teacher's screen), and the hall pass
 *  (who has it since when, who waits in line, how long it lasts). */
export function handsView(c) {
  const names = new Map(H.studentsOf(c.id).map(s => [s.id, s.name])), rows = rowsOf(c.id);
  const hands = rows.filter(r => r.hand).sort((a, b) => (a.hand_at || 0) - (b.hand_at || 0)).map(r => ({ id: r.user_id, name: names.get(r.user_id) || '', kind: r.hand, at: r.hand_at }));
  const out = rows.find(r => r.pass === 'out');
  const asks = AT.openAsks(c.id).map(x => ({ ...x, name: names.get(x.sid) || '' }));
  return { hands, asks, pass: { minutes: passMinutes(c.id), out: out ? { id: out.user_id, name: names.get(out.user_id) || '', at: out.out_at } : null,
    line: lineOf(c.id).map(r => ({ id: r.user_id, name: names.get(r.user_id) || '', at: r.pass_at })) } };
}

/**
 * What the teacher's board asks for every 2 seconds while live: each desk's status, current handout, last pulse, hand,
 * pass, settings and cursor samples (ages in ms, so the page plays them back), the Hands panel, and whether cursors are
 * shown at all. The class's teachers only (the route's gate). Never sent to a desk or the projector.
 */
export function liveView(c, board = HO.boardView(c), at = now()) {
  const live = H.liveOf(c.id);
  if (!live) return { live: null, desks: {}, ...handsView(c), cursors: false, now: at };
  const m = beatsOf(c.id), rows = new Map(rowsOf(c.id).map(r => [r.user_id, r])), cursors = cursorsOn(c.id), desks = {}, att = board.att || AT.marksToday(c.id, at);
  for (const s of H.studentsOf(c.id)) {
    const b = m.get(s.id), cards = board.desks[s.id] || [];
    // Absent today: a dimmed desk, never Stuck, Not here or counted (docs/decisions.md "Homeroom: K-2 mode, absent and at
    // home"); At home: their status as always, an At home chip and no cursor.
    if (att[s.id] === 'absent') { desks[s.id] = { st: 'absent', on: '', where: '', at: b ? b.at : 0, hand: '', pass: '', absent: true, ...flagsOf(rows.get(s.id)) }; continue; }
    // a card that moved forward (done, a new score) counts as progress for Stuck
    if (b) { const k = cardKey(cards.find(x => x.id === b.on) || cards.find(x => x.next)); if (b.cardKey !== k) { if (b.cardKey !== null && b.cardKey !== undefined) b.progAt = at; b.cardKey = k; } }
    const { st, on } = statusOf(b, cards, at), r = rows.get(s.id) || {};
    const bk = b && st !== 'away' && b.where === 'reading' && b.book ? LIB.getBook(b.book.id) : null;
    const home = att[s.id] === 'home';
    desks[s.id] = { st, on, where: b && st !== 'away' ? b.where : '', at: b ? b.at : 0, hand: home ? '' : r.hand || '', pass: home ? '' : r.pass || '', ...flagsOf(r), ...(home ? { home: true } : {}),
      ...(bk ? { book: { id: bk.id, title: bk.title, cover: bk.cover.src, page: b.book.page, pages: bk.pages.length } } : {}),
      ...(cursors && b && !home && !r.hidden && st !== 'away' && b.cur && b.cur.length && at - (b.curAt || 0) < SAMPLE_SPAN + 6000 ? { cur: b.cur.map(([t, x, y]) => [at - t, x, y]) } : {}) };
  }
  return { live, desks, ...handsView(c), cursors, now: at };
}

/** Look at one student's desk (the teacher's panel): what the server already knows, and their pad as a read-only
 *  drawing. Never their screen or their keys. */
export function lookAt(u, c, studentId, locale = 'en') {
  if (!H.canHelp(u, c, ['aide'])) return fail(H.helperRole(u, c) ? 'forbidden' : 'notFound');
  const sid = String(studentId || ''), s = H.studentsOf(c.id).find(x => x.id === sid);
  if (!s) return fail('notInClass');
  const board = HO.boardView(c, locale), view = liveView(c, board), d = view.desks[sid] || { st: 'away', on: '' };
  const cards = board.desks[sid] || [], card = cards.find(x => x.id === d.on) || null, h = card ? board.handouts.find(x => x.id === card.id) : null;
  const b = rooms.get(c.id)?.get(sid);
  return ok({ id: sid, name: s.name, st: d.st, where: d.where || '', at: d.at || 0, inputAt: b && b.inputAt > 0 ? Math.round(b.inputAt) : 0, flags: { locked: !!d.locked, hidden: !!d.hidden, coming: !!d.coming },
    hand: d.hand || '', pass: d.pass || '', on: card ? { id: card.id, title: h ? h.title : '', icon: h ? h.icon : '🎮', pct: card.pct, done: card.done, locked: !!card.locked } : null,
    done: cards.filter(x => x.done).length, total: cards.length, team: !!H.teamOf(c.id, sid), strokes: H.doodleOf(c.id, sid) });
}

// ---------------------------------------------------------------- cleaning up
/** End class (or a new live class): every hand, pass, lock and pulse of the class goes. */
export function clearClass(classId) {
  q.run('DELETE FROM homeroom_live WHERE class_id=?', classId);
  rooms.delete(classId);
}
H.onLive(({ c, action, wasLive }) => { if (action === 'end' || (action === 'start' && !wasLive)) clearClass(c.id); });
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  if (!userId) { clearClass(classId); return; }
  q.run('DELETE FROM homeroom_live WHERE class_id=? AND user_id=?', classId, userId);
  rooms.get(classId)?.delete(userId);
  moveLine(classId);
});
S.onAccountMerge(({ from } = {}) => { if (from) q.run('DELETE FROM homeroom_live WHERE user_id=?', from); });
