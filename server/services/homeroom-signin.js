// Homeroom step 1c: quick sign-in for a class on shared devices (docs/homeroom.md "Foundations"; docs/decisions.md
// "Homeroom, step 1c"). Routes: routes/homeroom-signin.js.
//
// The class sign-in code. A teacher (services/homeroom.js canUseClass) opens sign-in for SIGNIN_MS: a random code of
// CODE_LEN characters (no 0/O, 1/I/L) is shown with a QR code on their Homeroom and the projector. Starting live class
// opens it; End class closes it; the teacher can close it or keep it open longer. The code means nothing once closed.
//
// The student side (/hr, public/js/homeroom-signin.js): the code, then the class's students as big name buttons (the
// names classmates see on the class page: display names, never the roster's real names; nothing else about anyone),
// only while sign-in is open, then proof: their own password, or a picture password (three pictures in order from a
// grid of nine), or Sign in with Google (the site's own). The name buttons carry a token made from the code and the
// student (an HMAC), never an account id, so a grid read for one code is useless for any other.
//
// Picture passwords: only for accounts the class's school made (users.managed_school, the accounts a teacher already
// resets the passwords of), set by the class's teachers, stored as a bcrypt hash of the pictures like a password, shown
// once on a printable card (kept in memory for the teacher who made it, as login cards are). Grade K to 2 classes give
// school accounts picture passwords unless the teacher picks Password. Wrong pictures: PIC_SOFT tries, then a wait that
// doubles with each wrong try (PIC_WAIT_MS up to PIC_WAIT_MAX_MS), and after PIC_HARD wrong tries in a row it stays locked
// until a teacher unlocks it or makes a new one. A typed password is checked with the sign-in page's own limits (the
// same buckets: routes/auth.js LOGIN, ratelimit.js loginLockKey), so this door never buys extra guesses. Staff and
// grown-up accounts never sign in here.
//
// Shared devices: a session started here is a class-device session (sessions.class_device = the class): the desk shows
// "Not you? Switch", End class signs every one of them out, and each ends at the sign-in window plus GRACE_MS anyway
// (kept open longer: they last longer too). Normal sign-ins are never marked and never touched.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, now, audit, tx } from '../db.js';
import { getUser, accountKind, BCRYPT_COST, sign } from '../auth.js';
import * as S from './schools.js';
import * as H from './homeroom.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });

/** How long sign-in stays open, and how long a class-device session lasts past it. */
export const SIGNIN_MS = 90 * 60e3;
export const GRACE_MS = 15 * 60e3;
export const CODE_LEN = 6;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** A typed code as stored: capitals, no spaces or dashes; '' when it can't be one. */
export const normCode = c => { const v = String(c ?? '').toUpperCase().replace(/[\s-]/g, '').slice(0, 20); return new RegExp(`^[${CODE_CHARS}]{${CODE_LEN}}$`).test(v) ? v : ''; };

/** The nine pictures (public/js/icons.js has a 3D picture for each), the order they show in the grid. */
export const PICTURES = [
  { key: 'bear', emoji: '🐻' }, { key: 'lion', emoji: '🦁' }, { key: 'frog', emoji: '🐸' },
  { key: 'owl', emoji: '🦉' }, { key: 'rocket', emoji: '🚀' }, { key: 'apple', emoji: '🍎' },
  { key: 'star', emoji: '⭐' }, { key: 'rainbow', emoji: '🌈' }, { key: 'cupcake', emoji: '🧁' },
];
export const PIC_LEN = 3;
const PIC_KEYS = PICTURES.map(p => p.key);
export const PIC_SOFT = 5, PIC_HARD = 10, PIC_WAIT_MS = 60e3, PIC_WAIT_MAX_MS = 15 * 60e3;
// Compared against when a name has no picture password, so the time taken never says which do.
const DUMMY = bcrypt.hashSync('bear.lion.frog.none', BCRYPT_COST);
const picText = pics => pics.join('.');
/** Three picture keys, or null. */
export function cleanPics(pics) {
  if (!Array.isArray(pics) || pics.length !== PIC_LEN) return null;
  const out = pics.map(p => String(p || ''));
  return out.every(p => PIC_KEYS.includes(p)) ? out : null;
}
/** A new picture password: three different pictures (easier to remember, and the card reads clearly). */
export function newPics() {
  const left = [...PIC_KEYS], out = [];
  while (out.length < PIC_LEN) out.push(left.splice(crypto.randomInt(left.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------- the class's grade
/** Is a class's grade (free text, any language) kindergarten, grade 1 or grade 2, or a range of them (K-2)? The
 *  grade box holds a grade, so its numbers are grades: every number 2 or under (K counts as 0). */
export function earlyGrade(grade) {
  const g = String(grade || '').toLowerCase().normalize('NFKC').trim();
  if (!g) return false;
  if (/^(t?k|pre-?k|pk|kg|kinder\p{L}*|maternelle|reception|preschool|cp|ce1|幼稚園|幼兒園|幼儿园|детский сад|גן|روضة)$/u.test(g)) return true;
  const nums = g.replace(/(?<!\p{L})(t?k|kg)(?!\p{L})/gu, ' 0 ').match(/\d+/g);
  return !!nums && nums.every(n => Number(n) <= 2);
}
const earlyClass = c => earlyGrade(c && c.grade);

// ---------------------------------------------------------------- the code
const roomRow = classId => q.get('SELECT * FROM homeroom_rooms WHERE class_id=?', classId) || null;
/** The class's sign-in: { open, code, until } (code and until only while open). */
export function signinOf(classId) {
  const r = roomRow(classId);
  return r && r.signin_code && r.signin_until > now() ? { open: true, code: r.signin_code, until: r.signin_until } : { open: false };
}
function freshCode() {
  for (let i = 0; i < 50; i++) {
    const c = Array.from({ length: CODE_LEN }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    if (!q.get('SELECT 1 FROM homeroom_rooms WHERE signin_code=?', c)) return c;
  }
  throw new Error('could not make a sign-in code');
}
function ensureRoom(u, classId) {
  if (roomRow(classId)) return;
  // The room row is made as the board makes it (services/homeroom.js), with the default groups.
  H.saveSeats(u, S.getClass(classId), { seats: {} });
}
/** Open sign-in (a new code), or keep it open SIGNIN_MS from now (the same code). Class-device sessions already
 *  started last as long. Teachers of the class only. -> { ok, signin } */
export function openSignin(u, c) {
  // (a sub who starts class opens it too, as the teacher's Everyone to Homeroom does: docs/decisions.md "Homeroom:
  // supports, aides and sub links"; the route itself stays the teacher's)
  if (!H.canUseClass(u, c) && H.helperRole(u, c) !== 'sub') return fail('notFound');
  ensureRoom(u, c.id);
  const cur = signinOf(c.id), t = now(), until = t + SIGNIN_MS;
  const code = cur.open ? cur.code : freshCode();
  q.run('UPDATE homeroom_rooms SET signin_code=?, signin_until=? WHERE class_id=?', code, until, c.id);
  if (cur.open) q.run('UPDATE sessions SET expires_at=? WHERE class_device=? AND expires_at>? AND expires_at<?', until + GRACE_MS, c.id, t, until + GRACE_MS);
  audit(u.id, 'homeroom.signin_open', c.id, { again: cur.open });
  return ok({ signin: signinOf(c.id) });
}
/** Close sign-in: the code stops working at once. Students already signed in stay until End class or their window
 *  ends. -> { ok, signin } */
export function closeSignin(u, c) {
  if (!H.canUseClass(u, c)) return fail('notFound');
  q.run('UPDATE homeroom_rooms SET signin_code=NULL, signin_until=NULL WHERE class_id=?', c.id);
  audit(u.id, 'homeroom.signin_close', c.id);
  return ok({ signin: signinOf(c.id) });
}
/** End class: sign-in closes and every class-device session of the class ends. -> how many ended */
export function endDevices(classId) {
  q.run('UPDATE homeroom_rooms SET signin_code=NULL, signin_until=NULL WHERE class_id=?', classId);
  const t = now();
  return q.run('UPDATE sessions SET expires_at=? WHERE class_device=? AND expires_at>?', t, classId, t).changes;
}
H.onLive(({ by, c, action, wasLive }) => {
  if (action === 'start' && !wasLive && !signinOf(c.id).open) openSignin(by, c);
  if (action === 'end') endDevices(c.id);
});

/** The class a code opens right now (sign-in open, the class having Homeroom), or null. */
export function classForCode(code) {
  const c = normCode(code); if (!c) return null;
  const r = q.get('SELECT class_id FROM homeroom_rooms WHERE signin_code=? AND signin_until>?', c, now());
  const cls = r && S.getClass(r.class_id);
  return cls && H.classHasHomeroom(cls) ? cls : null;
}

// ---------------------------------------------------------------- students and how they sign in
const settingRow = (classId, userId) => q.get('SELECT * FROM homeroom_signins WHERE class_id=? AND user_id=?', classId, userId) || null;
const MODES = ['password', 'picture'];
/** May this student have a picture password in this class? Only an account the class's school made. */
const picAllowed = (c, p) => !!p && p.managed_school === c.school_id;
/** Who may sign in through the class sign-in: active students of the class with a kid's account (never staff, a
 *  grown-up or the platform admin), not banned. */
function signinStudents(c) {
  return S.roster(c.id).filter(p => p.role === 'student').map(p => { const u = getUser(p.id); return u && { ...u, roster_name: p.roster_name || '' }; })
    .filter(u => u && !u.banned && !u.is_guest && ['student', 'standard'].includes(accountKind(u)));
}
/** A student's sign-in in this class: { mode: 'password'|'picture', picture: has one, locked, wait: ms to wait } */
export function howOf(c, u, row = settingRow(c.id, u.id)) {
  const allowed = picAllowed(c, u);
  const mode = !allowed ? 'password' : row && MODES.includes(row.mode) ? row.mode : earlyClass(c) ? 'picture' : 'password';
  const t = now();
  return { mode, picAllowed: allowed, picture: !!(row && row.pic_hash), locked: !!(row && row.fails >= PIC_HARD), wait: row && row.locked_until > t ? row.locked_until - t : 0 };
}
/** The name button's token for a student under a code (an HMAC: no account id ever leaves). */
const keyOf = (c, code, userId) => sign(`hr1c:${c.id}:${code}:${userId}`).slice(0, 16);
/** The name grid for an open code: [{ k, name, how: 'picture'|'password'|'google'|'ask' }], by name. google: true when
 *  the student has no password and a Google sign-in (googleOf decides). Display names only. */
export function nameGrid(c, code, { googleOf = () => false } = {}) {
  return signinStudents(c).map(u => {
    const h = howOf(c, u);
    const how = h.mode === 'picture' ? (h.picture ? 'picture' : 'ask') : u.password_hash ? 'password' : googleOf(u.id) ? 'google' : 'ask';
    return { k: keyOf(c, code, u.id), name: u.display_name, how };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
/** The student a name button's token names under this code, or null. */
export const studentForKey = (c, code, k) => signinStudents(c).find(u => typeof k === 'string' && k.length === 16 && crypto.timingSafeEqual(Buffer.from(keyOf(c, code, u.id)), Buffer.from(k.padEnd(16).slice(0, 16)))) || null;

/** Check a picture password, counting wrong tries per student (the wait and the lock). Always runs one bcrypt check,
 *  so the time never says whether the student has one. -> { ok } | { ok: false, code: 'wrongPictures'|'wait'|'locked', wait } */
export function checkPictures(c, u, pics) {
  const row = settingRow(c.id, u.id), h = howOf(c, u, row), clean = cleanPics(pics);
  if (h.locked) { bcrypt.compareSync('x', DUMMY); return fail('locked'); }
  if (h.wait) { bcrypt.compareSync('x', DUMMY); return fail('wait', { wait: h.wait }); }
  const good = bcrypt.compareSync(clean ? picText(clean) : 'x', (row && row.pic_hash) || DUMMY) && !!clean && h.mode === 'picture' && !!(row && row.pic_hash);
  if (good) { if (row.fails || row.locked_until) q.run('UPDATE homeroom_signins SET fails=0, locked_until=NULL WHERE class_id=? AND user_id=?', c.id, u.id); return ok(); }
  if (!row || !row.pic_hash) return fail('wrongPictures');
  const fails = row.fails + 1;
  const wait = fails >= PIC_SOFT && fails < PIC_HARD ? Math.min(PIC_WAIT_MAX_MS, PIC_WAIT_MS * 2 ** (fails - PIC_SOFT)) : 0;
  q.run('UPDATE homeroom_signins SET fails=?, locked_until=? WHERE class_id=? AND user_id=?', fails, wait ? now() + wait : null, c.id, u.id);
  if (fails >= PIC_HARD) return fail('locked');
  return wait ? fail('wait', { wait }) : fail('wrongPictures');
}

/** Mark a session just started by the class sign-in as a class-device session: it ends at the sign-in window plus
 *  GRACE_MS (or sooner by the account's own rules) and with End class. */
export function markDevice(sessionId, c) {
  const s = signinOf(c.id); if (!s.open || !sessionId) return false;
  q.run('UPDATE sessions SET class_device=?, expires_at=MIN(expires_at, ?) WHERE id=?', c.id, s.until + GRACE_MS, sessionId);
  return true;
}
/** The class of a class-device session, or null (every normal sign-in). */
export const deviceClass = sessionId => (sessionId ? (q.get('SELECT class_device FROM sessions WHERE id=?', sessionId) || {}).class_device || null : null);
/** Google's sign-in from a class's sign-in page: the session is a class-device one only for an active student of that
 *  class while its sign-in is open. */
export function markGoogleDevice(sessionId, user, classId) {
  const c = S.getClass(classId); if (!c || !user || !H.classHasHomeroom(c)) return false;
  if (!signinStudents(c).some(u => u.id === user.id)) return false;
  return markDevice(sessionId, c);
}

// ---------------------------------------------------------------- the teacher's side
/** The sign-in panel's rows, for the class's teachers: every student with the roster name, the name their classmates
 *  see, and how they sign in. */
export function teacherRows(c) {
  return signinStudents(c).map(u => ({ id: u.id, name: u.roster_name || u.display_name, shows: u.display_name, ...howOf(c, u), hasPassword: !!u.password_hash }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}
const studentIn = (c, userId) => signinStudents(c).find(u => u.id === userId) || null;
function upsert(c, userId, by, fields) {
  const t = now();
  q.run('INSERT OR IGNORE INTO homeroom_signins(class_id, user_id, updated_at) VALUES (?,?,?)', c.id, userId, t);
  const cols = Object.keys(fields);
  q.run(`UPDATE homeroom_signins SET ${cols.map(k => `${k}=?`).join(', ')}, updated_by=?, updated_at=? WHERE class_id=? AND user_id=?`, ...cols.map(k => fields[k]), by.id, t, c.id, userId);
}
/** A class-device session of this student in this class ends (a new picture password: the old one's sign-ins go). */
const endStudentDevices = (classId, userId) => { const t = now(); q.run('UPDATE sessions SET expires_at=? WHERE user_id=? AND class_device=? AND expires_at>?', t, userId, classId, t); };
/** Password or Picture password for a student. Picture only for school accounts. Picking Picture for a student with
 *  none yet makes one (-> pics, for their card). -> { ok, mode, pics? } */
export function setMode(by, c, userId, mode) {
  if (!H.canUseClass(by, c)) return fail('notFound');
  const u = studentIn(c, userId); if (!u) return fail('notFound');
  if (!MODES.includes(mode)) return fail('badMode');
  if (mode === 'picture' && !picAllowed(c, u)) return fail('ownAccount');
  const had = settingRow(c.id, u.id);
  upsert(c, u.id, by, { mode });
  audit(by.id, 'homeroom.signin_mode', c.id, { user: u.id, mode });
  if (mode === 'picture' && !(had && had.pic_hash)) { const r = newPicture(by, c, u.id); return ok({ mode, pics: r.pics }); }
  return ok({ mode });
}
/** A new picture password (the old one stops working; its class-device sign-ins end; the wrong tries are forgotten).
 *  -> { ok, pics } (shown once, on the card) */
export function newPicture(by, c, userId) {
  if (!H.canUseClass(by, c)) return fail('notFound');
  const u = studentIn(c, userId); if (!u) return fail('notFound');
  if (!picAllowed(c, u)) return fail('ownAccount');
  const pics = newPics();
  upsert(c, u.id, by, { pic_hash: bcrypt.hashSync(picText(pics), BCRYPT_COST), pic_at: now(), fails: 0, locked_until: null });
  endStudentDevices(c.id, u.id);
  audit(by.id, 'homeroom.picture_reset', c.id, { user: u.id });
  return ok({ pics });
}
/** Unlock a student locked out by wrong pictures (the same picture password keeps working). */
export function unlock(by, c, userId) {
  if (!H.canUseClass(by, c)) return fail('notFound');
  const u = studentIn(c, userId); if (!u) return fail('notFound');
  if (settingRow(c.id, u.id)) upsert(c, u.id, by, { fails: 0, locked_until: null });
  audit(by.id, 'homeroom.signin_unlock', c.id, { user: u.id });
  return ok();
}
/** Sign-in cards for the whole class: a new picture password for every student who signs in with pictures, and
 *  "Uses your password" for the rest. -> { ok, cards: [{ name, shows, pics? }] } */
export function classCards(by, c) {
  if (!H.canUseClass(by, c)) return fail('notFound');
  return tx(() => ok({ cards: teacherRows(c).map(r => (r.mode === 'picture' ? { name: r.name, shows: r.shows, pics: newPicture(by, c, r.id).pics } : { name: r.name, shows: r.shows, google: !r.hasPassword })) }));
}

// One-time sign-in cards (picture passwords are shown once, then forgotten): in memory for a day, for the teacher who
// made them only, as login cards are (routes/schools.js keepCards).
const CARDS = new Map();
const CARDS_KEEP_MS = 24 * 3600e3;
export function keepCards(by, c, cards) {
  const k = crypto.randomBytes(12).toString('base64url'), t = Date.now();
  for (const [key, v] of CARDS) if (v.exp < t) CARDS.delete(key);
  CARDS.set(k, { by: by.id, classId: c.id, cards, exp: t + CARDS_KEEP_MS });
  return k;
}
export function cardsFor(u, c, k) {
  const v = CARDS.get(String(k || ''));
  return v && u && v.by === u.id && v.classId === c.id && v.exp > Date.now() ? v.cards : null;
}

// ---------------------------------------------------------------- leaving, deleting, merging
S.onClassLeave(({ classId, userId = null } = {}) => {
  if (!classId) return;
  const t = now();
  if (!userId) { q.run('DELETE FROM homeroom_signins WHERE class_id=?', classId); q.run('UPDATE sessions SET expires_at=? WHERE class_device=? AND expires_at>?', t, classId, t); return; }
  q.run('DELETE FROM homeroom_signins WHERE class_id=? AND user_id=?', classId, userId);
  endStudentDevices(classId, userId);
});
S.onAccountMerge(({ from, into } = {}) => {
  if (!from || !into) return;
  q.run('UPDATE OR IGNORE homeroom_signins SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM homeroom_signins WHERE user_id=?', from);
});
