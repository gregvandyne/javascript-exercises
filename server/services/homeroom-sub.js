// Homeroom, step 3c: one-day sub links (docs/decisions.md "Homeroom: supports, aides and sub links"). From the ⋯ menu
// the class's teacher makes "Sub link for today" (or tomorrow): a link that works only on that day, from when it is
// made (or that day's local midnight) until the end of the school day (local midnight) or an end time the teacher sets,
// never more than 24 hours, with an optional PIN and the teacher's note for the sub. The sub needs no account.
//
// What the sub gets (services here, routes/homeroom-sub.js): the board's teacher's area, the desks with first names
// only, live class (start, Bring everyone to me, Pause, End class), the day plan pill (Start, +5 min, Next), hands and
// the hall pass, the projector view and the teacher's note. A desk with supports says so, with only what the sub needs
// to act on ("Reads aloud", "Extra time"). Never grades, progress, notebooks, Google Classroom, handouts, seating,
// groups, the AI or another class: every other Homeroom address answers a sub with 403.
//
// Tokens: 24 random bytes (base64url) in the link; only their SHA-256 is kept (token_hash), so the database cannot open
// a link. A PIN is kept as a salted scrypt hash; after PIN_TRIES wrong PINs the link locks (the teacher makes a new one).
// Opening the link sets an HttpOnly cookie (hr_sub: the token and the server's signature that the PIN, if any, was
// typed), sent only to this site. Revoked, ended or not yet started: refused. Every sub action goes in homeroom_sub_log;
// the teacher sees a short "While you were out" note on their Homeroom next time (notesFor), until they tap Got it.
import crypto from 'node:crypto';
import { q, uid, now, audit } from '../db.js';
import { sign } from '../auth.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as H from './homeroom.js';
import * as HO from './homeroom-handouts.js';
import * as HV from './homeroom-live.js';
import * as HP from './homeroom-plan.js';
import * as SUP from './homeroom-supports.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
export const COOKIE = 'hr_sub';
export const MAX_MS = 24 * 3600e3;
export const LINKS_MAX = 5, NOTE_MAX = 600, PIN_TRIES = 8;
const DAY = 86400e3;
export const hashOf = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const pinHash = (pin, salt = crypto.randomBytes(12).toString('base64url')) => `${salt}$${crypto.scryptSync(String(pin), salt, 32).toString('base64url')}`;
function pinOk(stored, pin) {
  const [salt, h] = String(stored || '').split('$'); if (!salt || !h) return false;
  const a = Buffer.from(crypto.scryptSync(String(pin), salt, 32).toString('base64url')), b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanNote = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, '')
  .split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_MAX);

// ---------------------------------------------------------------- the day, in the school's time zone
/** The zone the link's day is counted in: the school's, else the teacher's browser's (tz), else UTC. */
export const zoneFor = (c, tz = '') => S.zoneOf(S.getSchool(c.school_id)) || (S.isZone(tz) ? tz : 'UTC');
/** The calendar day an instant falls on in a zone, as a 00:00 UTC value (services/lessons.js dayBounds' kind of day). */
export function localDay(tz, at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(at)).filter(x => x.type !== 'literal').map(x => [x.type, +x.value]));
  return Date.UTC(p.year, p.month - 1, p.day);
}
/** When a link made at `at` for 'today' or 'tomorrow' (until: 'HH:MM' in the zone, or '' for the end of the day) works:
 *  { start, end } or a fail code. */
export function windowFor(c, { day = 'today', until = '', tz = '' } = {}, at = now()) {
  if (!['today', 'tomorrow'].includes(day)) return { code: 'badDay' };
  const zone = zoneFor(c, tz), d = localDay(zone, at) + (day === 'tomorrow' ? DAY : 0), b = L.dayBounds(d, zone);
  const start = day === 'today' ? at : b.start;
  let end = b.end;
  if (until) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(until)); if (!m) return { code: 'badTime' };
    // the wall clock time on that day: the day's start plus the hours (DST days: the offset at the start of the day)
    end = Math.min(b.end, b.start + (+m[1] * 60 + +m[2]) * 60e3);
  }
  end = Math.min(end, start + MAX_MS);
  if (end <= start + 60e3) return { code: 'endsBefore' };
  return { start, end, zone };
}

// ---------------------------------------------------------------- the teacher's side
const rowOf = id => q.get('SELECT * FROM homeroom_sub_links WHERE id=?', String(id || '')) || null;
export function stateOf(r, at = now()) {
  if (!r) return 'gone';
  if (r.revoked_at) return 'revoked';
  if (r.pin_hash && r.pin_fails >= PIN_TRIES) return 'locked';
  if (at < r.starts_at) return 'later';
  if (at >= r.ends_at) return 'ended';
  return 'active';
}
const viewOf = (r, at = now()) => ({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, pin: !!r.pin_hash, note: r.note, state: stateOf(r, at), used: !!r.used_at, at: r.created_at });
/** The class's sub links of the last two weeks, newest first (for its teachers). */
export const linksOf = (c, at = now()) => q.all('SELECT * FROM homeroom_sub_links WHERE class_id=? AND ends_at>? ORDER BY created_at DESC LIMIT 20', c.id, at - 14 * DAY).map(r => viewOf(r, at));
const teacherOnly = (u, c) => (H.canUseClass(u, c) ? null : fail(H.helperRole(u, c) ? 'forbidden' : 'notFound'));
/**
 * Make a sub link: { day: today | tomorrow, until: 'HH:MM' | '', pin: '' | 4 to 8 digits, note, tz (the browser's zone,
 * used when the school has none) }. The class's teachers only. -> { ok, token (shown once), link }
 */
export function createLink(u, c, x = {}, at = now()) {
  const no = teacherOnly(u, c); if (no) return no;
  const w = windowFor(c, x, at); if (w.code) return fail(w.code);
  const pin = String(x.pin ?? '').trim();
  if (pin && !/^\d{4,8}$/.test(pin)) return fail('badPin');
  if (typeof x.note === 'string' && x.note.trim().length > NOTE_MAX) return fail('tooLong');
  const open = q.all('SELECT * FROM homeroom_sub_links WHERE class_id=? AND revoked_at IS NULL AND ends_at>?', c.id, at);
  if (open.length >= LINKS_MAX) return fail('tooManyLinks');
  const token = crypto.randomBytes(24).toString('base64url'), id = uid(12);
  q.run('INSERT INTO homeroom_sub_links(id, class_id, token_hash, pin_hash, note, starts_at, ends_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, c.id, hashOf(token), pin ? pinHash(pin) : '', cleanNote(x.note), w.start, w.end, u.id, at);
  audit(u.id, 'homeroom.sub_link', c.id, { link: id, start: w.start, end: w.end, pin: !!pin });
  return ok({ token, link: viewOf(rowOf(id), at) });
}
/** Revoke a link now (the sub's page stops at its next request). The class's teachers only. */
export function revoke(u, c, id, at = now()) {
  const no = teacherOnly(u, c); if (no) return no;
  const r = rowOf(id); if (!r || r.class_id !== c.id) return fail('notFound');
  if (!r.revoked_at) q.run('UPDATE homeroom_sub_links SET revoked_at=? WHERE id=?', at, r.id);
  audit(u.id, 'homeroom.sub_revoke', c.id, { link: r.id });
  return ok({ link: viewOf(rowOf(id), at) });
}

// ---------------------------------------------------------------- the sub's side
/** The link a token opens (any state), or null. */
export const linkOfToken = token => (token && String(token).length <= 100 ? q.get('SELECT * FROM homeroom_sub_links WHERE token_hash=?', hashOf(token)) || null : null);
const proof = r => sign(`hrsub:${r.id}:${r.pin_hash ? 'pin' : 'open'}`);
/** The cookie's value once the link may be used (its PIN typed when it has one). */
export const cookieValue = (token, r) => `${token}.${proof(r)}`;
/** Check a PIN. -> { ok } | { ok: false, code: badPin | locked } */
export function tryPin(r, pin) {
  if (!r.pin_hash) return ok();
  if (r.pin_fails >= PIN_TRIES) return fail('locked');
  if (pinOk(r.pin_hash, String(pin || '').trim())) { if (r.pin_fails) q.run('UPDATE homeroom_sub_links SET pin_fails=0 WHERE id=?', r.id); return ok(); }
  q.run('UPDATE homeroom_sub_links SET pin_fails=pin_fails+1 WHERE id=?', r.id);
  return fail(r.pin_fails + 1 >= PIN_TRIES ? 'locked' : 'badPin');
}
/** The class a link is for, when it has Homeroom (through its teacher) and isn't archived. */
const classOf = r => { const c = r && S.getClass(r.class_id); return c && !c.archived_at && H.classHasHomeroom(c) ? c : null; };
/** The sub a cookie value stands for now: { link, c, actor } or null. actor is what services see (no account:
 *  helperRole says 'sub' for this one class only). */
export function subFromCookie(value, at = now()) {
  const m = /^([A-Za-z0-9_-]{20,80})\.([A-Za-z0-9_-]{20,100})$/.exec(String(value || ''));
  if (!m) return null;
  const r = linkOfToken(m[1]);
  if (!r || stateOf(r, at) !== 'active') return null;
  const want = Buffer.from(proof(r)), got = Buffer.from(m[2]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const c = classOf(r); if (!c) return null;
  return { link: r, c, actor: Object.freeze({ id: `sub:${r.id}`, hrSub: r.id, classId: c.id }) };
}
H.onHelper((u, c) => {
  if (!u || !u.hrSub || u.classId !== c.id) return null;
  return stateOf(rowOf(u.hrSub)) === 'active' ? 'sub' : null;
});
/** Write one sub action in the link's log (and the link's first use). */
export function log(link, action, { student = null, detail = '' } = {}, at = now()) {
  q.run('INSERT INTO homeroom_sub_log(link_id, class_id, at, action, student, detail) VALUES (?,?,?,?,?,?)', link.id, link.class_id, at, String(action).slice(0, 40), student, String(detail || '').slice(0, 40));
  if (!link.used_at) q.run('UPDATE homeroom_sub_links SET used_at=? WHERE id=? AND used_at IS NULL', at, link.id);
}

/** First names only, as the sub sees students: each name's first word; two students with the same first word get their
 *  last name's first letter too ("Ava S."). Map id -> name. */
export function firstNames(classId) {
  const list = H.studentsOf(classId).map(s => { const w = String(s.name || '').trim().split(/\s+/); return { id: s.id, first: w[0] || '', last: w.length > 1 ? w[w.length - 1] : '' }; });
  const n = new Map(); for (const x of list) n.set(x.first.toLowerCase(), (n.get(x.first.toLowerCase()) || 0) + 1);
  return new Map(list.map(x => [x.id, n.get(x.first.toLowerCase()) > 1 && x.last ? `${x.first} ${x.last[0]}.` : x.first]));
}

// ---------------------------------------------------------------- what the sub's page reads and does
/** The sub's board, every few seconds: live class, the desks where the teacher seated them (first names, live status,
 *  hand and pass, and which supports to act on), team desks, hands and the hall pass (first names), the plan pill's plan
 *  (part names and the timer; no handouts or summary), the teacher's area when it changed since v. Never a grade, a
 *  score, a handout's progress, a full name or anything of another class. */
export function subView(x, { v = null } = {}, at = now()) {
  const { c, link } = x, names = firstNames(c.id), room = H.roomOf(c.id), sup = SUP.supportsOf(c.id);
  const lv = HV.liveView(c, HO.boardView(c), at), nm = id => names.get(id) || '';
  const inTeam = new Set(room.teams.flatMap(t => t.members));
  const desk = id => { const d = lv.desks[id] || {}; return { id, name: nm(id), st: lv.live ? d.st || 'away' : '', hand: d.hand || '', pass: d.pass || '', sup: SUP.subLabels(sup[id]) }; };
  const tv = HP.teacherView(c, at);
  return {
    live: lv.live, now: at, endsAt: link.ends_at,
    desks: room.students.filter(s => !inTeam.has(s.id)).map(s => ({ ...desk(s.id), ...room.seats[s.id] })),
    teams: room.teams.map(t => ({ id: t.id, x: t.x, y: t.y, members: t.members.map(desk) })),
    hands: lv.hands.map(h => ({ id: h.id, name: nm(h.id), kind: h.kind, at: h.at })),
    pass: { minutes: lv.pass.minutes, out: lv.pass.out ? { id: lv.pass.out.id, name: nm(lv.pass.out.id), at: lv.pass.out.at } : null, line: lv.pass.line.map(y => ({ id: y.id, name: nm(y.id) })) },
    plan: tv && tv.state !== 'finished' ? { id: tv.id, name: tv.name, state: tv.state, now: tv.now, parts: tv.parts.map(p => ({ id: p.id, kind: p.kind, title: p.title, minutes: p.minutes })), run: tv.run, behindMin: tv.behindMin } : null,
    ...H.boardState(c.id, v),
  };
}
/** A sub's live class action (start, bring, back, pause, resume, end), logged. */
export function subLive(x, action) {
  const r = H.setLive(x.actor, x.c, action);
  if (r.ok) log(x.link, `live:${action}`);
  return r;
}
/** A sub's plan action (start, more, next), logged. */
export function subPlan(x, action) {
  const r = HP.runAction(x.actor, x.c, action);
  if (r.ok) log(x.link, `plan:${action}`);
  return r;
}
/** A sub answers a hand or the hall pass ({ action: answer | pass | notNow | back, studentId }), logged. The pass's
 *  length stays the teacher's. */
export function subHands(x, { action, studentId } = {}) {
  if (!['answer', 'pass', 'notNow', 'back'].includes(action)) return fail('forbidden');
  const r = HV.teacherHands(x.actor, x.c, { action, studentId });
  if (r.ok) log(x.link, `hand:${action}`, { student: String(studentId || '') });
  return r;
}

// ---------------------------------------------------------------- "While you were out"
/** What subs did in this class that its teacher has not seen yet: one note per link with new actions:
 *  [{ id, startsAt, endsAt, state, first, last, counts: { action: n }, times: { open, start, end } }]. */
export function notesFor(c, at = now()) {
  const out = [];
  for (const r of q.all('SELECT * FROM homeroom_sub_links WHERE class_id=? AND used_at IS NOT NULL ORDER BY starts_at DESC LIMIT 10', c.id)) {
    const rows = q.all('SELECT at, action FROM homeroom_sub_log WHERE link_id=? AND at>? ORDER BY at', r.id, r.seen_at || 0);
    if (!rows.length) continue;
    const counts = {}, times = {};
    for (const x of rows) { counts[x.action] = (counts[x.action] || 0) + 1; if (['open', 'live:start'].includes(x.action) && !times[x.action]) times[x.action] = x.at; if (x.action === 'live:end') times[x.action] = x.at; }
    out.push({ id: r.id, startsAt: r.starts_at, endsAt: r.ends_at, state: stateOf(r, at), first: rows[0].at, last: rows[rows.length - 1].at, counts, times });
  }
  return out;
}
/** The teacher read a note: Got it. The class's teachers only. */
export function markSeen(u, c, id, at = now()) {
  const no = teacherOnly(u, c); if (no) return no;
  const r = rowOf(id); if (!r || r.class_id !== c.id) return fail('notFound');
  q.run('UPDATE homeroom_sub_links SET seen_at=? WHERE id=?', at, r.id);
  return ok();
}
