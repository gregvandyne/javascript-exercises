// Sessions, passwords, guests and the kid-safe username rules. Reused from the starter, renamed and tightened.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, uid, now, setting, tx } from './db.js';
import { config } from './config.js';
import { cleanName, cleanText } from './services/textfilter.js';
import { tEn, tReq } from './i18n/index.js';
import { isOwnOrigin } from './site.js';
export { cleanName, cleanText };

export const BCRYPT_COST = 11;
// Compared against when a username doesn't exist, so a wrong name takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);
export const COOKIE = 'brb_session';
// SESSION_SECRET, else one kept in the settings table (made on first boot). REQUIRE_SESSION_SECRET=1 forbids the fallback.
if (!config.sessionSecret && config.requireSessionSecret) throw new Error('SESSION_SECRET is not set and REQUIRE_SESSION_SECRET=1: refusing to start. See scripts/export-session-secret.js to carry over the current one.');
let SECRET = config.sessionSecret || setting('session_secret');
/** Where the secret came from: 'env', 'database' or 'new' (just made and stored). */
export const secretSource = config.sessionSecret ? 'env' : SECRET ? 'database' : 'new';
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setting('session_secret', SECRET); }
export const secret = () => SECRET;

export const sign = v => crypto.createHmac('sha256', SECRET).update(String(v)).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const pack = id => `${id}.${sign(id)}`;
const unpack = tok => { if (!tok) return null; const i = tok.lastIndexOf('.'); if (i < 0) return null; const id = tok.slice(0, i); return safeEq(sign(id), tok.slice(i + 1)) ? id : null; };
/** Short-lived signed tokens (frame URLs). */
export function signToken(payload, ttlSec = 30 * 60) { const body = Buffer.from(JSON.stringify({ ...payload, exp: now() + ttlSec * 1000 })).toString('base64url'); return `${body}.${sign(body)}`; }
export function readToken(tok) {
  if (!tok || typeof tok !== 'string') return null; const i = tok.lastIndexOf('.'); if (i < 0) return null;
  const body = tok.slice(0, i); if (!safeEq(sign(body), tok.slice(i + 1))) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > now() ? p : null; } catch { return null; }
}

export function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* bad cookie */ } } });
  return out;
}
function setCookie(res, name, value, maxAgeSec) {
  const secure = config.env === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

const ANIMALS = ['Fox', 'Panda', 'Otter', 'Koala', 'Tiger', 'Penguin', 'Dolphin', 'Falcon', 'Lynx', 'Yeti', 'Robot', 'Dragon', 'Shark', 'Wolf', 'Comet', 'Rocket'];
export const AVATARS = ['🦊', '🐼', '🦦', '🐨', '🐯', '🐧', '🐬', '🦅', '🐱', '🦖', '🤖', '🐉', '🦈', '🐺', '☄️', '🚀', '🦁', '🐸', '🦄', '👾', '🐙', '🦋', '🐢', '🦉'];
/** A grown-up account's picture: a plain person on a neutral colour, never a kid's animal emoji. */
export const GROWNUP_AVATAR = '👤', GROWNUP_COLOR = '#64748b';
export const COLORS = ['#2f6bff', '#ff5c5c', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const pick = a => a[Math.floor(Math.random() * a.length)];
function friendCode() { for (;;) { const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[crypto.randomInt(31)]).join(''); if (!q.get('SELECT 1 FROM users WHERE friend_code=?', c)) return c; } }

/** accountType: 'kid' (every player, guest and school account) or 'grownup' (a parent's account: docs/decisions.md
 *  "Paid plans"). Grown-ups get no friend code: nobody can add them as a friend. */
export function createUser({ username, password, displayName, role = 'player', isGuest = false, avatar, color, accountType = 'kid' }) {
  const id = uid(10);
  const hash = password ? bcrypt.hashSync(password, BCRYPT_COST) : null;
  const grownup = accountType === 'grownup' && !isGuest;
  q.run('INSERT INTO users(id, username, display_name, password_hash, role, is_guest, avatar, color, friend_code, created_at, last_seen, account_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, username, displayName || username, hash, grownup ? 'player' : role, isGuest ? 1 : 0, avatar || (grownup ? GROWNUP_AVATAR : pick(AVATARS)), color || (grownup ? GROWNUP_COLOR : pick(COLORS)), grownup ? null : friendCode(), now(), now(), grownup ? 'grownup' : 'kid');
  return getUser(id);
}
/** A grown-up account (users.account_type): it can play games and look after a family, nothing else (server/routes/family.js). */
export const isGrownup = u => !!u && !u.is_guest && u.account_type === 'grownup';
export function createGuest() {
  for (let i = 0; i < 40; i++) {
    const animal = pick(ANIMALS), n = Math.floor(100 + Math.random() * 900);
    const username = `${animal}${n}`;
    if (q.get('SELECT 1 FROM users WHERE username=?', username)) continue;
    return createUser({ username, displayName: `Guest ${animal}`, isGuest: true, avatar: AVATARS[ANIMALS.indexOf(animal)] || '🙂' });
  }
  throw new Error('could not create guest');
}
/** Guest -> account upgrade: same user row, so saves, scores, likes and ratings all carry over. */
export function upgradeGuest(userId, { username, password }) {
  tx(() => {
    q.run('UPDATE users SET username=?, display_name=?, password_hash=?, is_guest=0 WHERE id=? AND is_guest=1', username, username, bcrypt.hashSync(password, BCRYPT_COST), userId);
  });
  return getUser(userId);
}
export const getUser = id => (id ? q.get('SELECT * FROM users WHERE id=?', id) : null) || null;
export const getUserByName = name => q.get('SELECT * FROM users WHERE username=? COLLATE NOCASE', String(name || '')) || null;
/** The official account (its games are the launch games), and the names it had before: /u/<old name> redirects to it,
 *  and nobody can sign up with one. */
export const OFFICIAL = 'OombaAcademy';
export const OFFICIAL_OLD_NAMES = ['MagicCups', 'MagicCup', 'BRBGaming'];
export const isRetiredName = name => OFFICIAL_OLD_NAMES.some(o => o.toLowerCase() === String(name || '').toLowerCase());
export function verifyPassword(user, password) {
  const ok = bcrypt.compareSync(String(password || '').slice(0, 72), (user && user.password_hash) || DUMMY_HASH);
  return !!(user && user.password_hash && ok);
}
/** signOutEverywhere: a changed password ends every session (off for the seed script's idempotent admin reset). */
export function setPassword(userId, password, { signOutEverywhere = false } = {}) {
  q.run('UPDATE users SET password_hash=?, password_short=0 WHERE id=?', bcrypt.hashSync(password, BCRYPT_COST), userId);
  if (signOutEverywhere) endSessions(userId);
}
/** At sign-in (the only time the password itself is known): staff and the platform admin whose password is shorter than
 *  STAFF_PASSWORD_MIN are asked to choose a longer one until they do (users.password_short, shown by views/layout.js). */
export function notePasswordLength(u, password) {
  const short = longPasswordKind(u) && String(password || '').length < STAFF_PASSWORD_MIN ? 1 : 0;
  if (short !== (u.password_short || 0)) q.run('UPDATE users SET password_short=? WHERE id=?', short, u.id);
}
// The most common passwords: easy to guess, so not allowed.
const COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '654321', '123123', '121212', '112233', 'password', 'password1', 'passw0rd', 'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'abcdef', 'abcd1234', 'letmein', 'welcome', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'soccer', 'princess', 'sunshine', 'superman', 'batman', 'pokemon', 'minecraft', 'fortnite', 'roblox', 'secret', 'master', 'shadow', 'starwars', 'trustno1', 'hello1', 'hello123', 'computer', 'freedom', 'whatever', 'asdfgh', 'zxcvbn', 'aaaaaa', 'gaming', 'brbgaming', 'magiccup', 'magiccups', 'magic123', 'oomba123', 'oombaacademy', 'academy']);
/** -> null when fine, otherwise a kid-friendly message (in the language of t). */
export function checkPassword(p, username = '', t = tEn) {
  p = String(p || '');
  if (p.length < 6) return t('auth.password.short');
  if (p.length > 72) return t('auth.password.long');
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p)) return t('auth.password.easy');
  if (username && low.includes(String(username).toLowerCase())) return t('auth.password.name');
  return null;
}

// How long a sign-in lasts, by account type (see docs/decisions.md). idle: signed out after this long without activity
// (0 = no idle limit); max: signed out this long after signing in, whatever happens.
//   student   school accounts of students (shared classroom devices)              1 hour idle, 10 hours at most
//   staff     teachers and admins of any school, and the platform admin            12 hours idle, 7 days at most
//   grownup   grown-up (parent) accounts: like staff, they can change a plan       12 hours idle, 7 days at most
//   standard  own accounts and guests                                              60 days
export const SESSION_RULES = {
  student: { idle: 3600e3, max: 10 * 3600e3 },
  staff: { idle: 12 * 3600e3, max: 7 * 86400e3 },
  grownup: { idle: 12 * 3600e3, max: 7 * 86400e3 },
  standard: { idle: 0, max: 60 * 86400e3 },
};
/** Activity is written to a session at most this often, so most requests don't write to the database. */
export const ACTIVITY_EVERY = 60e3;
// Calls a game page makes on its own (a game can save, score or keep playing with nobody at the keyboard). They keep a
// sign-in awake only when the play page marks them X-Brb-Active: the player pressed or tapped something lately.
const PASSIVE = /^\/api\/(games\/[^/]+\/(play|heartbeat|leave|save|score)|progress\/[^/]+\/[^/]+\/game)$/;
/** Whether a request counts as activity for the idle limits, decided here rather than left to the page: opening a page
 *  and requests that change something. Background reads (fetch, polling), anything marked X-Brb-Background and the
 *  passive game calls above don't, so a page or game left open still times out. */
export function isActivity(req) {
  const h = req.headers;
  if (h['x-brb-background'] === '1') return false;
  // Browsers say what a GET is for: only a page opened in the tab counts (not a fetch, an image or the game frame).
  // Without those headers (old browsers) a non-API page counts.
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (h['sec-fetch-dest']) return h['sec-fetch-dest'] === 'document';
    if (h['sec-fetch-mode']) return h['sec-fetch-mode'] === 'navigate';
    return !req.path.startsWith('/api/');
  }
  return !PASSIVE.test(req.path) || h['x-brb-active'] === '1';
}
/** 'student' | 'staff' | 'grownup' | 'standard' (the rows of SESSION_RULES). Staff is the same test as
 *  services/schools.js isStaff, written out here because that module imports this one. */
export function accountKind(u) {
  if (!u || u.is_guest) return 'standard';
  if (u.account_type === 'grownup') return 'grownup';
  if (u.role === 'admin' || q.get("SELECT 1 FROM school_members WHERE user_id=? AND status='active' AND role!='student'", u.id)) return 'staff';
  return u.managed_school ? 'student' : 'standard';
}
/** School students' passwords are looked after by their teacher, and guests have none. */
export const canChangePassword = u => !!u && !u.is_guest && accountKind(u) !== 'student';
/** Staff and the platform admin can see children's data, and grown-ups look after a family, so their new passwords are
 *  longer. */
export const STAFF_PASSWORD_MIN = 12;
/** Accounts whose passwords must be at least STAFF_PASSWORD_MIN characters. */
export const longPasswordKind = u => ['staff', 'grownup'].includes(accountKind(u));

// The cookie outlives its session by a day, so a device that comes back to an ended sign-in (even the next morning) is
// told so, and the next person to sign in there isn't sent to the last one's page.
const COOKIE_GRACE = 86400;
export function startSession(res, userId, ua = '') {
  const id = uid(32); const t = now(); const { max } = SESSION_RULES[accountKind(getUser(userId))];
  q.run('INSERT INTO sessions(id, user_id, created_at, expires_at, ua, last_active) VALUES (?,?,?,?,?,?)', id, userId, t, t + max, String(ua).slice(0, 200), t);
  setCookie(res, COOKIE, pack(id), Math.floor(max / 1000) + COOKIE_GRACE);
  return id;
}
// Set when a sign-in ends on its own (timed out, or ended from another device): who was signed in on this device ('-'
// when that session was already swept). Signing in as someone else then ignores the old page's ?next= (routes/auth.js).
const ENDED = 'brb_ended';
/** -> the id of who was signed in here when a sign-in ended, '' if unknown, null if no sign-in ended here. */
export function endedUser(req) {
  const v = req.sessionEnded ? req.endedUser : unpack(parseCookies(req)[ENDED]);
  return v === null || v === undefined ? null : v === '-' ? '' : v;
}
export function clearEnded(req, res) { if (req.sessionEnded || parseCookies(req)[ENDED]) setCookie(res, ENDED, '', 0); }
// Told when sessions end here (sign out, sign out everywhere, a password change), so open live streams can close at once
// (builder/live.js). Sessions deleted elsewhere (a ban, a school removal, an account merge) are noticed by the stream's
// own 15-second check instead.
const endedListeners = [];
/** fn({ sessionId }) after one session ended, or fn({ userId, except }) after all of a user's sessions (but except). */
export function onSessionsEnded(fn) { endedListeners.push(fn); }
function sessionsEnded(what) { for (const fn of endedListeners) { try { fn(what); } catch { /* a listener never stops a sign-out */ } } }
export function endSession(req, res) {
  const id = unpack(parseCookies(req)[COOKIE]);
  if (id) q.run('DELETE FROM sessions WHERE id=?', id);
  setCookie(res, COOKIE, '', 0);
  if (id) sessionsEnded({ sessionId: id });
}
/** End someone's sessions on every device, or all but one (except: a session id). -> how many ended. They are marked
 *  ended rather than deleted, so a device that comes back to one still knows whose it was (see ENDED). */
export function endSessions(userId, { except = null } = {}) {
  const t = now();
  const n = (except ? q.run('UPDATE sessions SET expires_at=? WHERE user_id=? AND expires_at>? AND id!=?', t, userId, t, except)
    : q.run('UPDATE sessions SET expires_at=? WHERE user_id=? AND expires_at>?', t, userId, t)).changes;
  sessionsEnded({ userId, except });
  return n;
}
/** A session row and its user when the sign-in still counts: not ended, not past its idle limit or its maximum length,
 *  and the user is not banned. -> { s, u } or { s } (s: the row, if any). */
function liveSession(id, t) {
  const s = q.get('SELECT * FROM sessions WHERE id=?', id);
  const u = s && s.expires_at > t ? getUser(s.user_id) : null;
  const rule = u && SESSION_RULES[accountKind(u)];
  return u && !u.banned && !(rule.idle && t - (s.last_active || s.created_at) > rule.idle) && t - s.created_at <= rule.max ? { s, u } : { s };
}
/** The user signed in with a session id, by the same rules as every request (sessionMiddleware), or null. Read-only:
 *  it never ends a session or counts as activity (builder/live.js re-checks open streams with it). */
export function sessionUser(id) { return id ? liveSession(id, now()).u || null : null; }
let lastSweep = 0;
export function sessionMiddleware(req, res, next) {
  const t = now();
  // Ended sessions are kept a day (as long as their cookie), then swept.
  if (t - lastSweep > 3600e3) { lastSweep = t; q.run('DELETE FROM sessions WHERE expires_at<?', t - COOKIE_GRACE * 1000); }
  req.user = null; req.sessionId = null; req.sessionEnded = false;
  const id = unpack(parseCookies(req)[COOKIE]);
  if (id) {
    const { s, u } = liveSession(id, t);
    if (u) {
      req.user = u; req.sessionId = id;
      if (t - s.last_active > ACTIVITY_EVERY && isActivity(req)) q.run('UPDATE sessions SET last_active=? WHERE id=?', t, id);
      if (t - u.last_seen > 60e3) q.run('UPDATE users SET last_seen=? WHERE id=?', t, u.id);
    } else {
      // Timed out, or ended from another device: signed out from here on, and pages can say so (once: the cookie goes).
      if (s) q.run('DELETE FROM sessions WHERE id=?', id);
      setCookie(res, COOKIE, '', 0);
      req.sessionEnded = true; req.endedUser = s ? s.user_id : '-';
      setCookie(res, ENDED, pack(req.endedUser), 86400);
    }
  }
  next();
}
const isApi = req => req.originalUrl.startsWith('/api/');
/** The sign-in page, coming back here afterwards; signedout=1 when a session just ended, so it can say so. */
const signInAgain = req => `/login?next=${encodeURIComponent(req.originalUrl)}${req.sessionEnded ? '&signedout=1' : ''}`;
/** The 401 reply: "you were signed out" (signedOut: true, so pages can keep what was typed) when a session just ended. */
const signedOutReply = (req, key) => (req.sessionEnded ? { error: tReq(req)('errors.api.signedOut'), signedOut: true } : { error: tReq(req)(key) });
export function requireUser(req, res, next) {
  if (req.user) return next();
  if (isApi(req)) return res.status(401).json(signedOutReply(req, 'errors.api.signInFirst'));
  res.redirect(signInAgain(req));
}
/** A real (non-guest) kid account: the Builder, Studio, friends and chat. Grown-ups get a 404, like a page that isn't
 *  there (server/routes/family.js also turns them away from everything they don't need, before any route). */
export function requireAccount(req, res, next) {
  if (isGrownup(req.user)) return isApi(req) ? res.status(404).json({ error: tReq(req)('errors.api.notFound') }) : res.status(404).send('Not found');
  if (req.user && !req.user.is_guest) return next();
  if (isApi(req)) return req.user ? res.status(403).json({ error: tReq(req)('errors.api.needAccount') }) : res.status(401).json(signedOutReply(req, 'errors.api.needAccount'));
  res.redirect(req.sessionEnded ? signInAgain(req) : '/signup?next=' + encodeURIComponent(req.originalUrl));
}
/** Any real account, grown-ups too (signing out everywhere, changing the password). */
export function requireAnyAccount(req, res, next) {
  if (req.user && !req.user.is_guest) return next();
  if (isApi(req)) return req.user ? res.status(403).json({ error: tReq(req)('errors.api.needAccount') }) : res.status(401).json(signedOutReply(req, 'errors.api.needAccount'));
  res.redirect(req.sessionEnded ? signInAgain(req) : '/login?next=' + encodeURIComponent(req.originalUrl));
}
export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (isApi(req)) return res.status(404).json({ error: tReq(req)('errors.api.notFound') });
  res.status(404).send('Not found');
}
export function csrfCheck(req, res, next) {
  // Same-origin check for state-changing requests: browsers send Sec-Fetch-Site (and Origin); non-browser clients send neither.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const site = req.headers['sec-fetch-site'];
    const blocked = () => res.status(403).json({ error: tReq(req)('errors.api.crossSite') });
    if (site && site !== 'same-origin' && site !== 'none') return blocked();
    const origin = req.headers.origin;
    if (!site && origin && origin !== 'null') {
      if (!isOwnOrigin(req, origin)) return blocked();
    }
  }
  next();
}
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, color: u.color, isGuest: !!u.is_guest, role: u.role, lang: u.lang || '' };
}
/** The domain move (routes/handoff.js): the same session, now also on this host, for as long as it has left. */
export function attachSession(res, sessionId, expiresAt) {
  setCookie(res, COOKIE, pack(sessionId), Math.max(0, Math.floor((expiresAt - now()) / 1000)) + COOKIE_GRACE);
}
