// Sessions, passwords, guests and the kid-safe username rules. Reused from the starter, renamed and tightened.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, uid, now, setting, tx } from './db.js';
import { config } from './config.js';
import { cleanName, cleanText } from './services/textfilter.js';
export { cleanName, cleanText };

const SESSION_DAYS = 60;
export const BCRYPT_COST = 11;
// Compared against when a username doesn't exist, so a wrong name takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);
export const COOKIE = 'brb_session';
let SECRET = config.sessionSecret || setting('session_secret');
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setting('session_secret', SECRET); }
export const secret = () => SECRET;

export const sign = v => crypto.createHmac('sha256', SECRET).update(String(v)).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const pack = id => `${id}.${sign(id)}`;
const unpack = tok => { if (!tok) return null; const i = tok.lastIndexOf('.'); if (i < 0) return null; const id = tok.slice(0, i); return safeEq(sign(id), tok.slice(i + 1)) ? id : null; };
/** Short-lived signed tokens (frame URLs). */
export function signToken(payload, ttlSec = 6 * 3600) { const body = Buffer.from(JSON.stringify({ ...payload, exp: now() + ttlSec * 1000 })).toString('base64url'); return `${body}.${sign(body)}`; }
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
export const COLORS = ['#2f6bff', '#ff5c5c', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const pick = a => a[Math.floor(Math.random() * a.length)];
function friendCode() { for (;;) { const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[crypto.randomInt(31)]).join(''); if (!q.get('SELECT 1 FROM users WHERE friend_code=?', c)) return c; } }

export function createUser({ username, password, displayName, role = 'player', isGuest = false, avatar, color }) {
  const id = uid(10);
  const hash = password ? bcrypt.hashSync(password, BCRYPT_COST) : null;
  q.run('INSERT INTO users(id, username, display_name, password_hash, role, is_guest, avatar, color, friend_code, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, username, displayName || username, hash, role, isGuest ? 1 : 0, avatar || pick(AVATARS), color || pick(COLORS), friendCode(), now(), now());
  return getUser(id);
}
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
export function verifyPassword(user, password) {
  const ok = bcrypt.compareSync(String(password || '').slice(0, 72), (user && user.password_hash) || DUMMY_HASH);
  return !!(user && user.password_hash && ok);
}
/** signOutEverywhere: a changed password ends every other session (off for the seed script's idempotent admin reset). */
export function setPassword(userId, password, { signOutEverywhere = false } = {}) {
  q.run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(password, BCRYPT_COST), userId);
  if (signOutEverywhere) q.run('DELETE FROM sessions WHERE user_id=?', userId);
}
// The most common passwords: easy to guess, so not allowed.
const COMMON = new Set(['123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '654321', '123123', '121212', '112233', 'password', 'password1', 'passw0rd', 'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'abcdef', 'abcd1234', 'letmein', 'welcome', 'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'soccer', 'princess', 'sunshine', 'superman', 'batman', 'pokemon', 'minecraft', 'fortnite', 'roblox', 'secret', 'master', 'shadow', 'starwars', 'trustno1', 'hello1', 'hello123', 'computer', 'freedom', 'whatever', 'asdfgh', 'zxcvbn', 'aaaaaa', 'gaming', 'brbgaming', 'magiccup', 'magiccups', 'magic123']);
export function checkPassword(p, username = '') {
  p = String(p || '');
  if (p.length < 6) return 'Use at least 6 characters for your password.';
  if (p.length > 72) return 'That password is too long.';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p)) return 'That password is too easy to guess. Try mixing words and numbers.';
  if (username && low.includes(String(username).toLowerCase())) return "Don't put your name in your password.";
  return null;
}

export function startSession(res, userId, ua = '') {
  const id = uid(32); const t = now();
  q.run('INSERT INTO sessions(id, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)', id, userId, t, t + SESSION_DAYS * 86400e3, String(ua).slice(0, 200));
  setCookie(res, COOKIE, pack(id), SESSION_DAYS * 86400);
  return id;
}
export function endSession(req, res) {
  const id = unpack(parseCookies(req)[COOKIE]);
  if (id) q.run('DELETE FROM sessions WHERE id=?', id);
  setCookie(res, COOKIE, '', 0);
}
let lastSweep = 0;
export function sessionMiddleware(req, res, next) {
  if (now() - lastSweep > 3600e3) { lastSweep = now(); q.run('DELETE FROM sessions WHERE expires_at<?', now()); }
  req.user = null; req.sessionId = null;
  const id = unpack(parseCookies(req)[COOKIE]);
  if (id) {
    const s = q.get('SELECT * FROM sessions WHERE id=? AND expires_at>?', id, now());
    if (s) {
      const u = getUser(s.user_id);
      if (u && !u.banned) { req.user = u; req.sessionId = id; if (now() - u.last_seen > 60e3) q.run('UPDATE users SET last_seen=? WHERE id=?', now(), u.id); }
    }
  }
  next();
}
const isApi = req => req.originalUrl.startsWith('/api/');
export function requireUser(req, res, next) {
  if (req.user) return next();
  if (isApi(req)) return res.status(401).json({ error: 'Please sign in or play as a guest first.' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
export function requireAccount(req, res, next) { // a real (non-guest) account
  if (req.user && !req.user.is_guest) return next();
  if (isApi(req)) return res.status(req.user ? 403 : 401).json({ error: 'Make a free account to do this.' });
  res.redirect('/signup?next=' + encodeURIComponent(req.originalUrl));
}
export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (isApi(req)) return res.status(404).json({ error: 'Not found' });
  res.status(404).send('Not found');
}
export function csrfCheck(req, res, next) {
  // Same-origin check for state-changing requests: browsers send Sec-Fetch-Site (and Origin); non-browser clients send neither.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Cross-site request blocked.' });
    const origin = req.headers.origin;
    if (!site && origin && origin !== 'null') {
      try { if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-site request blocked.' }); } catch { return res.status(403).json({ error: 'Cross-site request blocked.' }); }
    }
  }
  next();
}
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, color: u.color, isGuest: !!u.is_guest, role: u.role };
}
