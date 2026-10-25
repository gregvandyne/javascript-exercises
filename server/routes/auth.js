// Accounts: guest play, sign up (or upgrade a guest), sign in/out, and the Me hub.
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { avatar } from '../views/components.js';
import * as auth from '../auth.js';
import { q, audit } from '../db.js';
import * as photos from '../services/photos.js';
import { isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { availableLocales, normalizeCode, tHtml, setLangCookie, saveUserLang } from '../i18n/index.js';

export const router = Router();
const safeNext = n => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(n) ? n : '/');
/** A ?next= that asks for a real page (not missing, unsafe or just '/'), else null so people land on their own home. */
const wantedNext = n => { const s = safeNext(n); return s === '/' ? null : s; };
/** Where someone lands after signing in: teachers and school admins on My classes, school-account students on their
 *  classes, the platform admin on the admin area; everyone else on the game site. */
export function homeFor(u) {
  if (!u || u.is_guest) return '/';
  if (isSchoolStaff(u)) return '/teach';
  if (isPlatformAdmin(u)) return '/admin';
  if (u.managed_school) return '/classes';
  return '/';
}

function authPage(req, res, mode) {
  const t = req.t;
  const next = safeNext(req.query.next);
  const u = req.user;
  const isSignup = mode === 'signup';
  const upgrading = isSignup && u && u.is_guest;
  if (u && !u.is_guest) return res.redirect(wantedNext(req.query.next) || homeFor(u));
  const body = html`<div class="authbox">
    <div class="panel">
      <div class="center" style="font-size:3rem" aria-hidden="true">${isSignup ? '🎉' : '👋'}</div>
      <h1 class="center">${isSignup ? (upgrading ? t('auth.page.headingUpgrade') : t('auth.page.headingSignup')) : t('auth.page.headingLogin')}</h1>
      <p class="center muted">${isSignup ? t('auth.page.introSignup') : t('auth.page.introLogin')}</p>
      ${upgrading ? html`<p class="notice good">${tHtml(t, 'auth.page.upgradeNotice', { name: u.display_name })}</p>` : ''}
      <form data-api="/api/auth/${isSignup ? 'signup' : 'login'}" ${isSignup ? raw(`data-next="${next.replace(/"/g, '&quot;')}"`) : ''} novalidate>
        ${!isSignup && wantedNext(req.query.next) ? html`<input type="hidden" name="next" value="${next}">` : ''}
        <div class="field"><label for="username">${isSignup ? t('auth.page.nameLabelSignup') : t('auth.page.nameLabelLogin')}</label>
          <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false" placeholder="${isSignup ? t('auth.page.namePlaceholder') : ''}">
          ${isSignup ? html`<span class="hint">${t('auth.page.nameHint')}</span>` : ''}
          <span class="err" id="username-err" aria-live="polite"></span></div>
        <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
          <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="${isSignup ? 'new-password' : 'current-password'}" required minlength="6">
          ${isSignup ? html`<span class="hint">${t('auth.page.passwordHint')}</span>` : ''}
          <span class="err" id="password-err" aria-live="polite"></span></div>
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${isSignup ? t('auth.page.submitSignup') : t('auth.page.submitLogin')}</button>
      </form>
      ${!u ? html`<div class="divider">${t('auth.page.or')}</div><button class="btn btn-block" type="button" data-guest-play="${next}">${t('auth.page.playAsGuest')}</button>` : ''}
      <p class="center small" style="margin-top:16px">${isSignup ? html`${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(next)}">${t('auth.page.signInLink')}</a>` : html`${t('auth.page.newHere')} <a href="/signup?next=${encodeURIComponent(next)}">${t('auth.page.signupLink')}</a>`}</p>
    </div></div>`;
  page(req, res, { title: isSignup ? t('auth.page.titleSignup') : t('auth.page.titleLogin'), active: 'me', body });
}
router.get('/login', (req, res) => authPage(req, res, 'login'));
router.get('/signup', (req, res) => authPage(req, res, 'signup'));

router.post('/api/auth/guest', rateLimit('guest', 30, 3600e3), (req, res) => {
  if (req.user) return res.json({ ok: true, user: auth.publicUser(req.user) });
  if (!allow(`guestip:${req.ip}`, 60, 3600e3)) return res.status(429).json({ error: req.t('auth.api.tooManyGuests') });
  const u = auth.createGuest(); auth.startSession(res, u.id, req.headers['user-agent']);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale);
  res.json({ ok: true, user: auth.publicUser(u) });
});
router.post('/api/auth/signup', rateLimit('signup', 10, 3600e3), (req, res) => {
  const t = req.t;
  const { username, password } = req.body || {};
  const n = auth.cleanName(username, t); if (!n.ok) return res.status(400).json({ error: n.error, field: 'username' });
  const pe = auth.checkPassword(password, n.value, t); if (pe) return res.status(400).json({ error: pe, field: 'password' });
  const taken = auth.getUserByName(n.value);
  if (taken && !(req.user && taken.id === req.user.id)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' });
  let u;
  if (req.user && req.user.is_guest) {
    u = auth.upgradeGuest(req.user.id, { username: n.value, password }); audit(u.id, 'user.upgrade', u.id);
    auth.endSession(req, res); auth.startSession(res, u.id, req.headers['user-agent']); // fresh session id after the upgrade
  }
  else {
    try { u = auth.createUser({ username: n.value, password }); }
    catch (e) { if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' }); throw e; }
    auth.startSession(res, u.id, req.headers['user-agent']); audit(u.id, 'user.signup', u.id);
  }
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale); // a language picked before signing up comes along
  res.json({ ok: true, user: auth.publicUser(u) });
});
router.post('/api/auth/login', rateLimit('login', 20, 900e3, 'auth.api.tooManyTries'), (req, res) => {
  const { username, password } = req.body || {};
  // Per-account backstop: caps guesses at one username to 10 / 15 min no matter how many source IPs an attacker uses.
  const uname = String(username || '').toLowerCase().slice(0, 64);
  if (uname && !allow(`login-user:${uname}`, 10, 900e3)) return res.status(429).json({ error: req.t('auth.api.tooManyTries') });
  const u = auth.getUserByName(username);
  if (!u || !auth.verifyPassword(u, password)) return res.status(400).json({ error: req.t('auth.api.wrongLogin'), field: 'password' });
  if (u.banned) return res.status(403).json({ error: req.t('auth.api.paused') });
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, u.id, req.headers['user-agent']);
  res.json({ ok: true, user: auth.publicUser(u), redirect: wantedNext((req.body || {}).next) || homeFor(u) });
});
router.post('/api/auth/logout', (req, res) => { auth.endSession(req, res); res.json({ ok: true, redirect: '/' }); });
router.get('/api/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));
// ---- Profile photo. Raw body: a JPEG the browser already shrank to a 512px square.
router.post('/api/me/photo', auth.requireUser, rateLimit('me-photo', 10, 3600e3), express.raw({ type: () => true, limit: '1mb' }), async (req, res) => {
  const t = req.t;
  try {
    const at = await photos.savePhoto(req.user, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    res.json({ ok: true, photo: photos.photoUrl({ id: req.user.id, photo_at: at }) });
  } catch (e) {
    if (e instanceof photos.PhotoError) return res.status(e.status).json({ error: t(`me.photo.errors.${e.code}`) });
    res.status(503).json({ error: t('me.photo.errors.resting') });
  }
});
router.delete('/api/me/photo', auth.requireUser, (req, res) => { photos.removePhoto(req.user.id); res.json({ ok: true }); });
// The picture behind /avatars/<id>: the photo for the player, their friends and admins; the emoji for everyone else.
router.get('/avatars/:id', (req, res) => {
  const u = auth.getUser(String(req.params.id));
  res.set({ 'Cache-Control': 'private, max-age=600', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' });
  if (!u) return res.status(404).end();
  const file = photos.fileFor(u.id);
  if (photos.canSeePhoto(req.user, u) && fs.existsSync(file)) return res.type('jpg').sendFile(file);
  res.type('image/svg+xml').send(photos.emojiSvg(u));
});

router.post('/api/me', auth.requireUser, rateLimit('me', 30, 60e3), (req, res) => {
  const t = req.t;
  const { avatar: av, color, displayName, chatEnabled, lang } = req.body || {};
  if (av !== undefined) { if (!auth.AVATARS.includes(av)) return res.status(400).json({ error: t('auth.api.pickAvatar') }); q.run('UPDATE users SET avatar=? WHERE id=?', av, req.user.id); }
  if (color !== undefined) { if (!auth.COLORS.includes(color)) return res.status(400).json({ error: t('auth.api.pickColor') }); q.run('UPDATE users SET color=? WHERE id=?', color, req.user.id); }
  if (lang !== undefined) { const code = normalizeCode(lang); if (!code) return res.status(400).json({ error: t('auth.api.pickLanguage') }); saveUserLang(req.user, code); setLangCookie(res, code); }
  if (displayName !== undefined && !req.user.is_guest) {
    const n = auth.cleanName(String(displayName).replace(/\s+/g, '_'), t); if (!n.ok) return res.status(400).json({ error: n.error, field: 'displayName' });
    q.run('UPDATE users SET display_name=? WHERE id=?', String(displayName).trim().slice(0, 16), req.user.id);
  }
  if (chatEnabled !== undefined) q.run('UPDATE users SET chat_enabled=? WHERE id=?', chatEnabled ? 1 : 0, req.user.id);
  res.json({ ok: true, user: auth.publicUser(auth.getUser(req.user.id)) });
});

/** The language choice on the Me page: a plain GET form (?lang=), so it works without JavaScript. */
export function languagePanel(req) {
  const t = req.t;
  if (availableLocales().length < 2) return '';
  return html`<section class="panel" id="language" aria-labelledby="lang-h"><h2 id="lang-h"><span aria-hidden="true">🌐</span> ${t('me.language.heading')}</h2>
    <p class="muted">${t('me.language.text')}</p>
    <form class="row" action="${req.path}" method="get" id="langform">
      <label class="sr-only" for="lang-select">${t('me.language.label')}</label>
      <select class="input langselect" id="lang-select" name="lang">${availableLocales().map(l => html`<option value="${l.code}" lang="${l.code}" ${l.code === req.locale ? raw('selected') : ''}>${l.code === req.locale ? '✓ ' : ''}${l.name}</option>`)}</select>
      <button class="btn btn-primary" type="submit">${t('me.language.save')}</button>
    </form>
  </section>`;
}

router.get('/me', (req, res) => {
  const t = req.t;
  const u = req.user;
  if (!u) return res.redirect('/login?next=/me');
  const tiles = [
    !u.is_guest && ['👤', t('me.tiles.profile'), `/u/${u.username}`],
    ['❤️', t('me.tiles.favorites'), '/favorites'],
    !u.is_guest && (isPlatformAdmin(u) && !isSchoolStaff(u) ? ['🏫', t('nav.schools'), '/admin/schools'] : ['🏫', t('me.tiles.classes'), isSchoolStaff(u) ? '/teach' : '/classes']),
    ['🛠️', t('me.tiles.games'), '/build'],
    ['👫', t('me.tiles.friends'), '/friends'],
    ['💬', t('me.tiles.chat'), '/chat'],
    u.role === 'admin' && ['🛡️', t('me.tiles.admin'), '/admin'],
  ].filter(Boolean);
  const body = html`
  <div class="pagehead">${avatar(u, 72)}<div style="flex:1;min-width:0"><h1 style="margin:0">${u.display_name}</h1><div class="muted"><bdi>@${u.username}</bdi>${u.is_guest ? ` · ${t('me.guestTag')}` : ''}</div></div></div>
  ${u.is_guest ? html`<div class="notice warn" style="margin-bottom:16px">${tHtml(t, 'me.guestNotice', { href: '/signup?next=/me' })}</div>` : ''}
  <nav class="metiles" aria-label="${t('me.title')}">
    ${tiles.map(([e, l, h]) => html`<a class="panel metile" href="${h}"><span class="metile-e" aria-hidden="true">${e}</span><span>${l}</span></a>`)}
  </nav>
  <section class="panel" aria-labelledby="av-h"><h2 id="av-h">${t('me.look.heading')}</h2>
    <div class="photo-row">
      ${avatar(u, 84)}
      <div class="photo-ctl">
        <h3>${t('me.photo.heading')}</h3>
        <p class="muted small">${u.is_guest ? t('me.photo.guest') : t('me.photo.text')}</p>
        ${u.is_guest ? '' : html`<div class="row">
          <button class="btn btn-primary" type="button" id="photo-pick">📷 ${u.photo_at ? t('me.photo.change') : t('me.photo.upload')}</button>
          ${u.photo_at ? html`<button class="btn" type="button" id="photo-remove">${t('me.photo.remove')}</button>` : ''}
          <input type="file" id="photo-file" accept="image/*" hidden>
        </div>`}
      </div>
    </div>
    <h3 style="margin-top:16px">${t('me.look.avatarHeading')}</h3>
    <div class="chips" role="group" aria-label="${t('me.look.avatarGroup')}">${auth.AVATARS.map(a => html`<button class="chip" type="button" data-avatar="${a}" aria-pressed="${a === u.avatar}" aria-label="${t('me.look.avatarLabel', { emoji: a })}" style="font-size:1.4rem;padding:0 12px">${a}</button>`)}</div>
    <h3 style="margin-top:16px">${t('me.look.colorHeading')}</h3>
    <div class="chips" role="group" aria-label="${t('me.look.colorGroup')}">${auth.COLORS.map(c => html`<button class="chip" type="button" data-color="${c}" aria-pressed="${c === u.color}" aria-label="${t('me.look.colorLabel', { color: c })}"><span class="avatar" style="--s:26px;--c:${c}"></span></button>`)}</div>
  </section>
  ${languagePanel(req)}
  ${!u.is_guest ? html`<section class="panel"><h2>${t('me.chat.heading')}</h2>
    <p class="muted">${t('me.chat.text')}</p>
    <label class="row" style="font-weight:800"><input type="checkbox" id="chat-toggle" ${u.chat_enabled ? raw('checked') : ''} style="width:24px;height:24px"> ${t('me.chat.toggle')}</label>
  </section>` : ''}
  <section class="panel"><h2>${t('me.signOut.heading')}</h2><p class="muted">${u.is_guest ? t('me.signOut.guest') : t('me.signOut.account')}</p>
    <form data-api="/api/auth/logout" data-next="/"><button class="btn btn-danger" type="submit">${t('me.signOut.button')}</button></form></section>`;
  page(req, res, { title: t('me.title'), active: 'me', body, scripts: ['/js/me.js'] });
});
