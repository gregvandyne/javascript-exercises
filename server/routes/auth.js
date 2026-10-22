// Accounts: guest play, sign up (or upgrade a guest), sign in/out, and the Me hub.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { avatar } from '../views/components.js';
import * as auth from '../auth.js';
import { q, audit } from '../db.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { cleanText } from '../services/textfilter.js';

export const router = Router();
const safeNext = n => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(n) ? n : '/');

function authPage(req, res, mode) {
  const next = safeNext(req.query.next);
  const u = req.user;
  const isSignup = mode === 'signup';
  const upgrading = isSignup && u && u.is_guest;
  if (u && !u.is_guest) return res.redirect(next);
  const body = html`<div class="authbox">
    <div class="panel">
      <div class="center" style="font-size:3rem" aria-hidden="true">${isSignup ? '🎉' : '👋'}</div>
      <h1 class="center">${isSignup ? (upgrading ? 'Keep your progress' : 'Make a free account') : 'Welcome back!'}</h1>
      <p class="center muted">${isSignup ? 'Just a fun name and a password. No email needed.' : 'Sign in with your BRB name and password.'}</p>
      ${upgrading ? html`<p class="notice good">You are playing as <b>${u.display_name}</b>. Everything you saved comes with you.</p>` : ''}
      <form data-api="/api/auth/${isSignup ? 'signup' : 'login'}" data-next="${next}" novalidate>
        <div class="field"><label for="username">${isSignup ? 'Pick a fun name' : 'Your BRB name'}</label>
          <input class="input" id="username" name="username" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false" placeholder="${isSignup ? 'like RocketPanda' : ''}">
          ${isSignup ? html`<span class="hint">3 to 16 letters or numbers. Don't use your real name.</span>` : ''}
          <span class="err" id="username-err" aria-live="polite"></span></div>
        <div class="field"><label for="password">Password</label>
          <input class="input" id="password" name="password" type="password" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="6">
          ${isSignup ? html`<span class="hint">At least 6 characters. Ask a grown-up to help you remember it.</span>` : ''}
          <span class="err" id="password-err" aria-live="polite"></span></div>
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${isSignup ? 'Make my account' : 'Sign in'}</button>
      </form>
      ${!u ? html`<div class="divider">or</div><button class="btn btn-block" type="button" data-guest-play="${next}">🎮 Play as a guest</button>` : ''}
      <p class="center small" style="margin-top:16px">${isSignup ? html`Have an account? <a href="/login?next=${encodeURIComponent(next)}">Sign in</a>` : html`New here? <a href="/signup?next=${encodeURIComponent(next)}">Make a free account</a>`}</p>
    </div></div>`;
  page(req, res, { title: isSignup ? 'Make an account' : 'Sign in', active: 'me', body });
}
router.get('/login', (req, res) => authPage(req, res, 'login'));
router.get('/signup', (req, res) => authPage(req, res, 'signup'));

router.post('/api/auth/guest', rateLimit('guest', 30, 3600e3), (req, res) => {
  if (req.user) return res.json({ ok: true, user: auth.publicUser(req.user) });
  if (!allow(`guestip:${req.ip}`, 60, 3600e3)) return res.status(429).json({ error: 'Too many guests from here. Try again later.' });
  const u = auth.createGuest(); auth.startSession(res, u.id, req.headers['user-agent']);
  res.json({ ok: true, user: auth.publicUser(u) });
});
router.post('/api/auth/signup', rateLimit('signup', 10, 3600e3), (req, res) => {
  const { username, password } = req.body || {};
  const n = auth.cleanName(username); if (!n.ok) return res.status(400).json({ error: n.error, field: 'username' });
  const pe = auth.checkPassword(password); if (pe) return res.status(400).json({ error: pe, field: 'password' });
  const taken = auth.getUserByName(n.value);
  if (taken && !(req.user && taken.id === req.user.id)) return res.status(400).json({ error: 'That name is taken. Try adding a number or another word.', field: 'username' });
  let u;
  if (req.user && req.user.is_guest) { u = auth.upgradeGuest(req.user.id, { username: n.value, password }); audit(u.id, 'user.upgrade', u.id); }
  else { u = auth.createUser({ username: n.value, password }); auth.startSession(res, u.id, req.headers['user-agent']); audit(u.id, 'user.signup', u.id); }
  res.json({ ok: true, user: auth.publicUser(u) });
});
router.post('/api/auth/login', rateLimit('login', 20, 900e3, 'Too many tries. Wait a few minutes and try again.'), (req, res) => {
  const { username, password } = req.body || {};
  const u = auth.getUserByName(username);
  if (!u || !auth.verifyPassword(u, password)) return res.status(400).json({ error: "That name and password don't match.", field: 'password' });
  if (u.banned) return res.status(403).json({ error: 'This account is paused. A grown-up can contact us.' });
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, u.id, req.headers['user-agent']);
  res.json({ ok: true, user: auth.publicUser(u) });
});
router.post('/api/auth/logout', (req, res) => { auth.endSession(req, res); res.json({ ok: true, redirect: '/' }); });
router.get('/api/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));
router.post('/api/me', auth.requireUser, rateLimit('me', 30, 60e3), (req, res) => {
  const { avatar: av, color, displayName, chatEnabled } = req.body || {};
  if (av !== undefined) { if (!auth.AVATARS.includes(av)) return res.status(400).json({ error: 'Pick one of the avatars.' }); q.run('UPDATE users SET avatar=? WHERE id=?', av, req.user.id); }
  if (color !== undefined) { if (!auth.COLORS.includes(color)) return res.status(400).json({ error: 'Pick one of the colours.' }); q.run('UPDATE users SET color=? WHERE id=?', color, req.user.id); }
  if (displayName !== undefined && !req.user.is_guest) {
    const n = auth.cleanName(String(displayName).replace(/\s+/g, '_')); if (!n.ok) return res.status(400).json({ error: n.error, field: 'displayName' });
    q.run('UPDATE users SET display_name=? WHERE id=?', String(displayName).trim().slice(0, 16), req.user.id);
  }
  if (chatEnabled !== undefined) q.run('UPDATE users SET chat_enabled=? WHERE id=?', chatEnabled ? 1 : 0, req.user.id);
  res.json({ ok: true, user: auth.publicUser(auth.getUser(req.user.id)) });
});

router.get('/me', (req, res) => {
  const u = req.user;
  if (!u) return res.redirect('/login?next=/me');
  const tiles = [
    !u.is_guest && ['👤', 'My profile', `/u/${u.username}`],
    ['🛠️', 'My games', '/build'],
    ['👫', 'Friends', '/friends'],
    ['💬', 'Chat', '/chat'],
    !u.is_guest && ['💰', 'Creator money', '/creator'],
    u.role === 'admin' && ['🛡️', 'Admin', '/admin'],
  ].filter(Boolean);
  const body = html`
  <div class="pagehead">${avatar(u, 72)}<div style="flex:1;min-width:0"><h1 style="margin:0">${u.display_name}</h1><div class="muted">@${u.username}${u.is_guest ? ' · guest' : ''}</div></div></div>
  ${u.is_guest ? html`<div class="notice warn" style="margin-bottom:16px">You are a guest. <a href="/signup?next=/me"><b>Make a free account</b></a> to keep your games and progress on any device, build games and chat with friends.</div>` : ''}
  <div class="cardgrid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:24px">
    ${tiles.map(([e, l, h]) => html`<a class="panel center" href="${h}" style="color:var(--ink);font-weight:900"><div style="font-size:2.2rem" aria-hidden="true">${e}</div>${l}</a>`)}
  </div>
  <section class="panel" aria-labelledby="av-h"><h2 id="av-h">Pick your look</h2>
    <div class="chips" role="group" aria-label="Avatar">${auth.AVATARS.map(a => html`<button class="chip" type="button" data-avatar="${a}" aria-pressed="${a === u.avatar}" aria-label="Avatar ${a}" style="font-size:1.4rem;padding:0 12px">${a}</button>`)}</div>
    <h3 style="margin-top:16px">Colour</h3>
    <div class="chips" role="group" aria-label="Colour">${auth.COLORS.map(c => html`<button class="chip" type="button" data-color="${c}" aria-pressed="${c === u.color}" aria-label="Colour ${c}"><span class="avatar" style="--s:26px;--c:${c}"></span></button>`)}</div>
  </section>
  ${!u.is_guest ? html`<section class="panel"><h2>Chat</h2>
    <p class="muted">Chat lets you send messages to friends you added with a friend code. Grown-ups: you can turn it off here.</p>
    <label class="row" style="font-weight:800"><input type="checkbox" id="chat-toggle" ${u.chat_enabled ? raw('checked') : ''} style="width:24px;height:24px"> Chat with my friends is on</label>
  </section>` : ''}
  <section class="panel"><h2>Sign out</h2><p class="muted">${u.is_guest ? 'Guests lose their progress when they sign out.' : 'See you soon!'}</p>
    <form data-api="/api/auth/logout" data-next="/"><button class="btn btn-danger" type="submit">Sign out</button></form></section>`;
  page(req, res, { title: 'Me', active: 'me', body, scripts: ['/js/me.js'] });
});
