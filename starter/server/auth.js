// Sessions, passwords, guests and the kid-safe username rules.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, q, uid, now, setting } from './db.js';

const SESSION_DAYS = 60;
const COOKIE = 'pl_session';
let SECRET = process.env.SESSION_SECRET || setting('session_secret');
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setting('session_secret', SECRET); }

const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const pack = id => `${id}.${sign(id)}`;
const unpack = tok => { if (!tok) return null; const i = tok.lastIndexOf('.'); if (i < 0) return null; const id = tok.slice(0, i); return sign(id) === tok.slice(i + 1) ? id : null; };

export function parseCookies(req) {
  const out = {}; const h = req.headers.cookie; if (!h) return out;
  h.split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function setCookie(res, name, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`);
}

// Usernames: 3-16 chars, letters/digits/underscore, must not look like a real name + number, and no profanity.
const BLOCK = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'sex', 'nazi', 'hitler', 'rape', 'nigg', 'fag', 'whore', 'slut', 'kill', 'drug', 'weed', 'penis', 'vagina', 'boob', 'ass', 'damn', 'hell', 'retard', 'suicide'];
export function cleanName(s) {
  const t = String(s || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(t)) return { ok: false, error: 'Use 3 to 16 letters, numbers or underscores.' };
  const low = t.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCK.some(b => low.includes(b))) return { ok: false, error: "That name isn't allowed. Try something else." };
  if (/\d{6,}/.test(t)) return { ok: false, error: 'No long numbers in names, please (keep phone numbers private).' };
  return { ok: true, value: t };
}
export function cleanText(s, max = 200) {
  const t = String(s || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
  const low = t.toLowerCase();
  if (BLOCK.some(b => low.includes(b))) return { ok: false, error: "That text isn't allowed on Playloom." };
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t) || /@[a-z0-9-]+\.[a-z]{2,}/i.test(t)) return { ok: false, error: 'Please keep phone numbers and emails out of Playloom.' };
  return { ok: true, value: t };
}

const ANIMALS = ['Fox', 'Panda', 'Otter', 'Koala', 'Tiger', 'Penguin', 'Dolphin', 'Falcon', 'Lynx', 'Yeti', 'Robot', 'Dragon', 'Shark', 'Wolf', 'Comet', 'Rocket'];
const AVATARS = ['🦊', '🐼', '🦦', '🐨', '🐯', '🐧', '🐬', '🦅', '🐱', '🦖', '🤖', '🐉', '🦈', '🐺', '☄️', '🚀', '🦁', '🐸', '🦄', '👾'];
const COLORS = ['#2f6bff', '#ff5c5c', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const pick = a => a[Math.floor(Math.random() * a.length)];
function friendCode() { for (;;) { const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join(''); if (!q.get('SELECT 1 FROM users WHERE friend_code=?', c)) return c; } }

export function createUser({ username, password, displayName, role = 'player', isGuest = false, avatar, color }) {
  const id = uid(10);
  const hash = password ? bcrypt.hashSync(password, 10) : null;
  q.run('INSERT INTO users(id, username, display_name, password_hash, role, is_guest, avatar, color, friend_code, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    id, username, displayName || username, hash, role, isGuest ? 1 : 0, avatar || pick(AVATARS), color || pick(COLORS), friendCode(), now(), now());
  return getUser(id);
}
export function createGuest() {
  for (let i = 0; i < 20; i++) {
    const animal = pick(ANIMALS), n = Math.floor(100 + Math.random() * 900);
    const username = `${animal}${n}`;
    if (q.get('SELECT 1 FROM users WHERE username=?', username)) continue;
    return createUser({ username, displayName: `Guest ${animal}`, isGuest: true, avatar: AVATARS[ANIMALS.indexOf(animal)] || '🙂' });
  }
  throw new Error('could not create guest');
}
export const getUser = id => q.get('SELECT * FROM users WHERE id=?', id) || null;
export const getUserByName = name => q.get('SELECT * FROM users WHERE username=? COLLATE NOCASE', name) || null;
export function verifyPassword(user, password) { return !!(user && user.password_hash && bcrypt.compareSync(String(password || ''), user.password_hash)); }
export function setPassword(userId, password) { q.run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(password, 10), userId); }

export function startSession(res, userId, ua = '') {
  const id = uid(24); const t = now();
  q.run('INSERT INTO sessions(id, user_id, created_at, expires_at, ua) VALUES (?,?,?,?,?)', id, userId, t, t + SESSION_DAYS * 86400e3, String(ua).slice(0, 200));
  setCookie(res, COOKIE, pack(id), SESSION_DAYS * 86400);
  return id;
}
export function endSession(req, res) {
  const id = unpack(parseCookies(req)[COOKIE]);
  if (id) q.run('DELETE FROM sessions WHERE id=?', id);
  setCookie(res, COOKIE, '', 0);
}
export function sessionMiddleware(req, res, next) {
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
export function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in or play as a guest first.' });
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}
export function requireAccount(req, res, next) { // a real (non-guest) account
  if (req.user && !req.user.is_guest) return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Create a free account to do this.' });
  res.redirect('/signup?next=' + encodeURIComponent(req.originalUrl));
}
export function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(404).send('Not found');
}
export function csrfCheck(req, res, next) {
  // Simple same-origin check for state-changing requests: browsers send Sec-Fetch-Site; non-browser clients send nothing.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  next();
}
export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, displayName: u.display_name, avatar: u.avatar, color: u.color, isGuest: !!u.is_guest, role: u.role };
}
