// Accounts: guest play, sign up (or upgrade a guest), sign in/out, and the Me hub.
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { avatar, notYou } from '../views/components.js';
import * as auth from '../auth.js';
import { q, audit } from '../db.js';
import * as photos from '../services/photos.js';
import { isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import { rateLimit, allow, count, ipOf, loginLockKey, GUESTS_PER_IP_HOUR } from '../services/ratelimit.js';
import { availableLocales, normalizeCode, tHtml, setLangCookie, saveUserLang } from '../i18n/index.js';
import { THEMES, THEME_ICONS, normalizeTheme, setThemeCookie, saveUserTheme } from '../theme.js';
import { publicHost } from '../site.js';
import { loginGoogle, googleNotice, loginJoinLink, meGooglePanel, noPasswordText } from './google.js';

export const router = Router();
export const safeNext = n => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(n) ? n : '/');
/** A ?next= that asks for a real page (not missing, unsafe or just '/'), else null so people land on their own home. */
export const wantedNext = n => { const s = safeNext(n); return s === '/' ? null : s; };
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
      ${!isSignup && (req.query.signedout === '1' || req.sessionEnded) ? html`<p class="notice warn" role="status">${t('auth.page.signedOut')}</p>` : ''}
      ${!isSignup && req.query.moved === '1' && publicHost() ? html`<p class="notice" role="status">${t('auth.page.moved', { site: publicHost() })}</p>` : ''}
      ${isSignup ? '' : googleNotice(req)}
      ${isSignup ? '' : loginGoogle(req, next)}
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
      ${isSignup ? '' : html`<div class="forgot small" id="forgot"><h2 class="forgot-h">${t('auth.page.forgotHeading')}</h2>
        <p><span aria-hidden="true">🏫</span> ${t('auth.page.forgotSchool')}</p>
        <p><span aria-hidden="true">🙂</span> ${t('auth.page.forgotOwn')}</p></div>`}
      ${!u ? html`<div class="divider">${t('auth.page.or')}</div><button class="btn btn-block" type="button" data-guest-play="${next}">${t('auth.page.playAsGuest')}</button>` : ''}
      <p class="center small" style="margin-top:16px">${isSignup ? html`${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(next)}">${t('auth.page.signInLink')}</a>` : html`${t('auth.page.newHere')} <a href="/signup?next=${encodeURIComponent(next)}">${t('auth.page.signupLink')}</a>`}</p>
      ${isSignup ? '' : loginJoinLink(req)}
    </div></div>`;
  page(req, res, { title: isSignup ? t('auth.page.titleSignup') : t('auth.page.titleLogin'), active: 'me', body });
}
router.get('/login', (req, res) => authPage(req, res, 'login'));
router.get('/signup', (req, res) => authPage(req, res, 'signup'));

router.post('/api/auth/guest', (req, res) => {
  if (req.user) return res.json({ ok: true, user: auth.publicUser(req.user) });
  if (!allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return res.status(429).json({ error: req.t('auth.api.tooManyGuests') });
  const u = auth.createGuest(); auth.startSession(res, u.id, req.headers['user-agent']);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale);
  if (req.themeSource === 'cookie') saveUserTheme(u, req.theme);
  res.json({ ok: true, user: auth.publicUser(u) });
});
// Sign-up limits, per address (never per session: a guest cookie is free). Only accounts actually made count toward the
// 30 an hour, so a class fixing typos and taken names isn't locked out; 2000 tries an hour stops a flood.
export const SIGNUP = { perHour: 30, triesPerHour: 2000 };
router.post('/api/auth/signup', (req, res) => {
  const t = req.t;
  const ip = ipOf(req);
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return res.status(429).json({ error: t('auth.api.tooManySignups') });
  const { username, password } = req.body || {};
  const n = auth.cleanName(username, t); if (!n.ok) return res.status(400).json({ error: n.error, field: 'username' });
  const pe = auth.checkPassword(password, n.value, t); if (pe) return res.status(400).json({ error: pe, field: 'password' });
  const taken = auth.getUserByName(n.value);
  if ((taken && !(req.user && taken.id === req.user.id)) || auth.isRetiredName(n.value)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' });
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
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale); // a language picked before signing up comes along
  if (req.themeSource === 'cookie') saveUserTheme(u, req.theme);   // and so does a theme
  res.json({ ok: true, user: auth.publicUser(u) });
});
// Sign-in limits. A whole school can sign in at once from one address, so successful sign-ins don't count as failures.
// Everything is keyed on the address or the username, never the session, so fresh guest cookies can't buy more
// guesses. Generated school passwords have ~31 bits (schools.js newPassword), so a loose per-address cap is still safe.
//   per username: 10 failed guesses per 15 min, from any address (a teacher's password reset clears it)
//   per address:  1000 failed sign-ins per 15 min, and 3000 tries in all (each costs a bcrypt check; a school of
//                 1000 children signing in three times fits)
export const LOGIN = { ipFails: 1000, ipTries: 3000, userFails: 10, window: 900e3 };
router.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  const username = String((req.body || {}).username || '').trim();
  const ip = ipOf(req); const lockKey = username ? loginLockKey(username) : '';
  const failKey = `login-ip-fail:${ip}`;
  const tooMany = () => res.status(429).json({ error: req.t('auth.api.tooManyTries') });
  if (count(failKey) >= LOGIN.ipFails || (lockKey && count(lockKey) >= LOGIN.userFails)) return tooMany();
  if (!allow(`login-ip:${ip}`, LOGIN.ipTries, LOGIN.window)) return tooMany();
  const u = username ? auth.getUserByName(username) : null;
  // Always run the password check (against a dummy hash for an unknown name), so the response time doesn't reveal
  // which names exist. It is synchronous, so the check-then-count above can't race with other tries.
  if (!auth.verifyPassword(u, password)) {
    allow(failKey, LOGIN.ipFails, LOGIN.window); if (lockKey) allow(lockKey, LOGIN.userFails, LOGIN.window);
    return res.status(400).json({ error: req.t('auth.api.wrongLogin'), field: 'password' });
  }
  if (u.banned) return res.status(403).json({ error: req.t('auth.api.paused') });
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, u.id, req.headers['user-agent']);
  auth.notePasswordLength(u, password);
  // After a sign-in ended on this device, its page (?next=) is only reopened for the same person: on a shared classroom
  // device the next child goes to their own home, not to the last child's lesson.
  const was = auth.endedUser(req); auth.clearEnded(req, res);
  const next = was === null || was === u.id ? wantedNext((req.body || {}).next) : null;
  res.json({ ok: true, user: auth.publicUser(u), redirect: next || homeFor(u) });
});
// next: where to go afterwards ("Not you? Sign out" goes to the sign-in page).
router.post('/api/auth/logout', (req, res) => { auth.endSession(req, res); res.json({ ok: true, redirect: wantedNext((req.body || {}).next) || '/' }); });
// Sign out everywhere ends every session, this one too: one clear promise for a lost device or a shared password
// (changing the password is the way to end the others and stay signed in here).
router.post('/api/auth/logout-everywhere', auth.requireAccount, (req, res) => {
  const n = auth.endSessions(req.user.id); auth.endSession(req, res);
  audit(req.user.id, 'user.signout_everywhere', req.user.id, { sessions: n });
  res.json({ ok: true, redirect: '/login', toast: req.t('me.signOut.everywhereDone') });
});
// Change password: own accounts, school staff and the platform admin (school students ask their teacher). Rules are checked
// before the current password, and only wrong current passwords count toward the limits (each check costs a bcrypt hash):
// 5 per 15 minutes here, and they also count toward the account's sign-in lock (LOGIN.userFails), so someone at a device
// left signed in gets no more guesses than at the sign-in page. A flood guard caps every try. On success every session
// ends, this one too, and this device gets a fresh one: it stays signed in, and a copied cookie is no use any more.
export const PASSWORD_CHANGE = { fails: 5, tries: 20, window: 900e3 };
router.post('/api/me/password', auth.requireAccount, rateLimit('me-password', PASSWORD_CHANGE.tries, PASSWORD_CHANGE.window), (req, res) => {
  const t = req.t, u = req.user;
  if (!auth.canChangePassword(u)) return res.status(403).json({ error: t('me.password.school') });
  const { current, password, confirm } = req.body || {};
  const bad = (field, error, status = 400) => res.status(status).json({ error, field });
  const failKey = `pw-change-fail:${u.id}`, lockKey = loginLockKey(u.username);
  if (count(failKey) >= PASSWORD_CHANGE.fails || count(lockKey) >= LOGIN.userFails) return res.status(429).json({ error: t('auth.api.tooManyTries') });
  if (!current) return bad('current', t('me.password.needCurrent'));
  const staff = auth.accountKind(u) === 'staff', n = String(password || '').length;
  const rule = auth.checkPassword(password, u.username, t) || (staff && n < auth.STAFF_PASSWORD_MIN ? t('me.password.staffShort', { n, min: auth.STAFF_PASSWORD_MIN }) : null);
  if (rule) return bad('password', rule);
  if (String(confirm || '') !== String(password)) return bad('confirm', t('me.password.mismatch'));
  if (!auth.verifyPassword(u, current)) {
    allow(failKey, PASSWORD_CHANGE.fails, PASSWORD_CHANGE.window); allow(lockKey, LOGIN.userFails, LOGIN.window);
    return bad('current', t('me.password.wrongCurrent'));
  }
  if (String(current) === String(password)) return bad('password', t('me.password.same'));
  auth.setPassword(u.id, String(password));
  const ended = auth.endSessions(u.id);
  auth.startSession(res, u.id, req.headers['user-agent']);
  audit(u.id, 'user.password_change', u.id, { otherSessionsEnded: Math.max(0, ended - 1) });
  res.json({ ok: true, toast: t('me.password.changed') });
});
router.get('/api/me', (req, res) => res.json({ user: auth.publicUser(req.user) }));
// The theme menu and the Me page switch at once with this; signed out it only sets the cookie.
router.post('/api/me/theme', rateLimit('theme', 30, 60e3), (req, res) => {
  const theme = normalizeTheme((req.body || {}).theme);
  if (!theme) return res.status(400).json({ error: req.t('me.theme.invalid') });
  setThemeCookie(res, theme); saveUserTheme(req.user, theme);
  res.json({ ok: true, theme });
});
// ---- Profile photo. Raw body: a JPEG the browser already shrank to a 512px square.
router.post('/api/me/photo', auth.requireUser, rateLimit('me-photo', 10, 3600e3), express.raw({ type: () => true, limit: '1mb', inflate: false }), async (req, res) => {
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

/** The theme choice on the Me page: radio buttons in a plain GET form (?theme=), so it works without JavaScript;
 *  app.js applies a pick at once and hides the Save button. */
export function appearancePanel(req) {
  const t = req.t; const cur = THEMES.includes(req.theme) ? req.theme : 'system';
  return html`<section class="panel" id="appearance" aria-labelledby="theme-h"><h2 id="theme-h"><span aria-hidden="true">🎨</span> ${t('me.theme.heading')}</h2>
    <p class="muted">${t('me.theme.text')}</p>
    <form action="${req.path}#appearance" method="get" id="themeform">
      <fieldset class="themechoices"><legend class="sr-only">${t('layout.theme.title')}</legend>
        ${THEMES.map(th => html`<label class="themechoice"><input type="radio" name="theme" value="${th}" ${th === cur ? raw('checked') : ''}><span class="theme-ico" aria-hidden="true">${THEME_ICONS[th]}</span><span>${t(`layout.theme.${th}`)}</span></label>`)}
      </fieldset>
      <button class="btn btn-primary" type="submit">${t('me.theme.save')}</button>
    </form>
  </section>`;
}

/** Change password (own accounts, school staff, the platform admin), or who looks after it (school students). Guests: nothing. */
function passwordPanel(req) {
  const t = req.t, u = req.user;
  if (u.is_guest) return '';
  const head = html`<h2 id="pw-h"><span aria-hidden="true">🔑</span> ${t('me.password.heading')}</h2>`;
  const gOnly = noPasswordText(req);
  if (gOnly) return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}<p class="muted">${gOnly}</p></section>`;
  if (!auth.canChangePassword(u)) return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}<p class="muted">${t('me.password.school')}</p></section>`;
  const staff = auth.accountKind(u) === 'staff', min = staff ? auth.STAFF_PASSWORD_MIN : 6;
  return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}
    <p class="muted">${t('me.password.text')}</p>
    <form class="pwform" data-api="/api/me/password" data-reset novalidate>
      <div class="field"><label for="pw-current">${t('me.password.current')}</label>
        <input class="input" id="pw-current" name="current" type="password" dir="ltr" autocomplete="current-password" required><span class="err" id="pw-current-err" aria-live="polite"></span></div>
      <div class="field"><label for="pw-new">${t('me.password.new')}</label>
        <input class="input" id="pw-new" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="${min}" maxlength="72" aria-describedby="pw-new-hint">
        <span class="hint" id="pw-new-hint">${staff ? t('me.password.hintStaff', { min }) : t('me.password.hint', { min })}</span><span class="err" id="pw-new-err" aria-live="polite"></span></div>
      <div class="field"><label for="pw-confirm">${t('me.password.confirm')}</label>
        <input class="input" id="pw-confirm" name="confirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="pw-confirm-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">${t('me.password.button')}</button>
    </form>
  </section>`;
}
/** Sign out (here), and for accounts Sign out everywhere. */
function signOutPanel(req) {
  const t = req.t, u = req.user;
  return html`<section class="panel" id="signout" aria-labelledby="so-h"><h2 id="so-h">${t('me.signOut.heading')}</h2><p class="muted">${u.is_guest ? t('me.signOut.guest') : t('me.signOut.account')}</p>
    <form data-api="/api/auth/logout" data-next="/"><button class="btn btn-danger" type="submit">${t('me.signOut.button')}</button></form>
    ${u.is_guest ? '' : html`<div class="so-every"><p class="muted small">${t('me.signOut.everywhereText')}</p>
    <form data-api="/api/auth/logout-everywhere" data-confirm="${t('me.signOut.everywhereConfirm')}"><button class="btn" type="submit">${t('me.signOut.everywhereButton')}</button></form></div>`}
  </section>`;
}

router.get('/me', auth.requireUser, (req, res) => {
  const t = req.t;
  const u = req.user;
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
  <div class="pagehead">${avatar(u, 72)}<div style="flex:1;min-width:0"><h1 style="margin:0">${u.display_name}</h1><div class="muted"><bdi>@${u.username}</bdi>${u.is_guest ? ` · ${t('me.guestTag')}` : ''}</div>${u.is_guest ? '' : notYou(req, { withName: false, plain: auth.accountKind(u) !== 'student' })}</div></div>
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
    <div class="lookpicks">
      <details class="lookdrop" data-lookpick><summary class="btn"><span>${t('me.look.avatarHeading')}</span><span class="lookcur" aria-hidden="true">${u.avatar}</span><span class="lookcaret" aria-hidden="true">▾</span></summary>
        <div class="lookmenu" role="group" aria-label="${t('me.look.avatarGroup')}">${auth.AVATARS.map(a => html`<button class="chip lookemoji" type="button" data-avatar="${a}" aria-pressed="${a === u.avatar}" aria-label="${t('me.look.avatarLabel', { emoji: a })}">${a}</button>`)}</div></details>
      <details class="lookdrop" data-lookpick><summary class="btn"><span>${t('me.look.colorHeading')}</span><span class="avatar lookcur" style="--s:22px;--c:${u.color}" aria-hidden="true"></span><span class="lookcaret" aria-hidden="true">▾</span></summary>
        <div class="lookmenu" role="group" aria-label="${t('me.look.colorGroup')}">${auth.COLORS.map(c => html`<button class="chip" type="button" data-color="${c}" aria-pressed="${c === u.color}" aria-label="${t('me.look.colorLabel', { color: c })}"><span class="avatar" style="--s:26px;--c:${c}"></span></button>`)}</div></details>
    </div>
  </section>
  <div class="mesettings">${languagePanel(req)}${appearancePanel(req)}</div>
  ${!u.is_guest ? html`<section class="panel"><h2>${t('me.chat.heading')}</h2>
    <p class="muted">${t('me.chat.text')}</p>
    <label class="row" style="font-weight:700"><input type="checkbox" id="chat-toggle" ${u.chat_enabled ? raw('checked') : ''} style="width:24px;height:24px"> ${t('me.chat.toggle')}</label>
  </section>` : ''}
  <div class="mesettings">${passwordPanel(req)}${meGooglePanel(req)}${signOutPanel(req)}</div>`;
  page(req, res, { title: t('me.title'), active: 'me', body, scripts: ['/js/me.js'] });
});
