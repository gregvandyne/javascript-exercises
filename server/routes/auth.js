// Accounts: guest play, sign up (or upgrade a guest), sign in/out, and the Me hub.
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page, landingFor, VERSION } from '../views/layout.js';
import { avatar, notYou, makeGameBtn } from '../views/components.js';
import * as auth from '../auth.js';
import { q, audit } from '../db.js';
import * as photos from '../services/photos.js';
import { CharacterError, saveCharacter, clearCharacter } from '../services/character.js';
import { characterPanel } from '../views/character.js';
import { isSchoolStaff, isPlatformAdmin, schoolToSetUp, soloSchoolAdmin, invitesFor, staffName, noFriendsAccount, setOwnStaffName, teacherToBe, adminSchools } from '../services/schools.js';
import { cleanRealName, REAL_NAME_MAX, cleanName } from '../services/textfilter.js';
import { navBadges } from '../services/badges.js';
import { rateLimit, allow, count, ipOf, loginLockKey, GUESTS_PER_IP_HOUR, SIGNUP } from '../services/ratelimit.js';
import { availableLocales, normalizeCode, tHtml, setLangCookie, saveUserLang } from '../i18n/index.js';
import { THEMES, THEME_ICONS, normalizeTheme, setThemeCookie, saveUserTheme } from '../theme.js';
import { buildStatus } from '../builder/turns.js';
import { publicHost } from '../site.js';
import { loginGoogle, googleNotice, loginJoinLink, meGooglePanel, noPasswordText } from './google.js';
import { meFamilyPanel, nextFor } from './family.js';
import { digestPanel } from './digest.js';
import * as funnel from '../services/funnel.js';
import * as courses from '../services/courses.js';
import { countable } from '../services/traffic.js';
import { contactEmail } from './teachers.js';
import { sendingOn as resetByEmailOn } from '../services/email.js';

export const router = Router();
export const safeNext = n => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(n) ? n : '/');
/** A ?next= that asks for a real page (not missing, unsafe or just '/'), else null so people land on their own home. */
export const wantedNext = n => { const s = safeNext(n); return s === '/' ? null : s; };
/** Where someone lands after signing in: teachers and school admins on My classes, school-account students on their
 *  classes, the platform admin on the admin area; everyone else on the game site. */
export function homeFor(u) {
  if (!u || u.is_guest) return '/';
  if (auth.isGrownup(u)) return '/family';
  // Everyone else lands on their first tab (layout.js landingFor, the same rule as '/'): a school still to set up first.
  // Not a solo teacher (the only staff member of their own school, e.g. from /trial): they land on the Classroom home
  // at every sign-in, with "Make your first class" there; the School tab keeps the setup checklist.
  if (isSchoolStaff(u)) { const slug = soloSchoolAdmin(u) ? null : schoolToSetUp(u); return slug ? `/school/${slug}` : landingFor(u); }
  if (isPlatformAdmin(u)) return '/admin';
  if (u.managed_school) return '/classes';
  // Signed up on the teacher's step and has no school yet: back to the school step (routes/onboarding.js).
  if (teacherToBe(u)) return '/signup/teacher/school';
  return landingFor(u) || '/';
}

// ---------------------------------------------------------------------------------------------------- sign-up
// The sign-up is one flow (routes/onboarding.js; docs/decisions.md "One sign-up"): /signup asks who is signing up (a
// kid, a parent or a teacher), each choice goes through /signup/for/<who>, which counts it and redirects to that path's
// first step. Sign in (/login) never asks: kids sign in every day.
/** Choice -> funnel step (services/funnel.js "who"). 'parent' is the same choice as 'grownup'. */
const WHO = new Map([['grownup', 'who.grownup'], ['parent', 'who.grownup'], ['kid', 'who.kid'], ['teacher', 'who.teacher']]);
/** Where a choice leads. A ?next= comes along to the kid's and the parent's steps (a parent who started on /plans goes
 *  back there; routes/family.js checks it with nextFor). */
export function whoTarget(req, who) {
  const next = wantedNext(req.query.next);
  const q = next ? `?next=${encodeURIComponent(next)}` : '';
  if (who === 'grownup' || who === 'parent') return `/signup/parent${q}`;
  if (who === 'teacher') return '/signup/teacher';
  return `/signup/kid${q}`;
}
/** The sign-in page: Sign in with Google (when it is on here), or a username and password; "Forgot your password?"
 *  folds its help away; a link to the sign-up. */
function loginPage(req, res) {
  const t = req.t;
  const next = safeNext(req.query.next);
  const u = req.user;
  // A child's sign-in on a shared device (e.g. after a grown-up's Switch) on its way to a family page: sign the child
  // out first, then the grown-up signs in with their own password (no shortcut back).
  if (u && !u.is_guest && !auth.isGrownup(u) && /^\/(family|grown-ups)(\/|\?|$)/.test(wantedNext(req.query.next) || '')) {
    const so = html`<div class="authbox"><div class="panel"><h1 class="center">${t('auth.page.headingLogin')}</h1>
      <div class="notice warn"><p style="margin-top:0">${tHtml(t, 'family.signup.signedIn', { name: html`<b><bdi>${u.display_name}</bdi></b>` })}</p>
      <form data-api="/api/auth/logout"><input type="hidden" name="next" value="${req.originalUrl}"><button class="btn" type="submit">${t('me.signOut.button')}</button></form></div></div></div>`;
    return page(req, res, { title: t('auth.page.titleLogin'), active: 'me', body: so });
  }
  if (u && !u.is_guest) return res.redirect(nextFor(u, wantedNext(req.query.next)) || homeFor(u));
  const body = html`<div class="authbox"><div class="panel">
      <div class="center" style="font-size:3rem" aria-hidden="true">👋</div>
      <h1 class="center">${t('auth.page.headingLogin')}</h1>
      ${req.query.signedout === '1' || req.sessionEnded ? html`<p class="notice warn" role="status">${t('auth.page.signedOut')}</p>` : ''}
      ${req.query.reset === '1' ? html`<p class="notice good" role="status" id="reset-done">${t('auth.reset.done')}</p>` : ''}
      ${req.query.welcome === '1' ? html`<p class="notice good" role="status" id="welcome-done">${t('auth.reset.welcomeDone')}</p>` : ''}
      ${req.query.moved === '1' && publicHost() ? html`<p class="notice" role="status">${t('auth.page.moved', { site: publicHost() })}</p>` : ''}
      ${googleNotice(req)}
      ${loginGoogle(req, next)}
      <form data-api="/api/auth/login" novalidate>
        ${wantedNext(req.query.next) ? html`<input type="hidden" name="next" value="${next}">` : ''}
        <div class="field"><label for="username">${t('auth.page.nameLabelLogin')}</label>
          <input class="input" id="username" name="username" dir="ltr" autocomplete="username" required minlength="3" maxlength="16" autocapitalize="off" spellcheck="false"${req.query.welcome === '1' && /^[A-Za-z0-9_]{3,16}$/.test(String(req.query.u || '')) ? html` value="${String(req.query.u)}"` : ''}>
          <span class="err" id="username-err" aria-live="polite"></span></div>
        <div class="field"><label for="password">${t('auth.page.passwordLabel')}</label>
          <span class="pw-row"><input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="current-password" required minlength="6">
          <button class="btn pw-toggle" type="button" data-pw-toggle="password" aria-controls="password" aria-pressed="false" data-show="${t('auth.page.showPassword')}" data-hide="${t('auth.page.hidePassword')}">👁️ <span>${t('auth.page.showPassword')}</span></button></span>
          <span class="hint">${t('auth.page.cardHint')}</span>
          <span class="err" id="password-err" aria-live="polite"></span></div>
        <p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${t('auth.page.submitLogin')}</button>
      </form>
      <details class="forgot small" id="forgot"${req.query.forgot === '1' ? raw(' open') : ''}><summary class="forgot-h">${t('auth.page.forgotHeading')}</summary>
        <p><span aria-hidden="true">🏫</span> ${t('auth.page.forgotSchool')} ${t('auth.page.forgotSchoolAdmin', { email: contactEmail() })}</p>
        ${resetByEmailOn() ? html`<p id="forgot-staff"><span aria-hidden="true">🍎</span> ${tHtml(t, 'auth.reset.linkLine', { href: '/forgot' })}</p>` : ''}
        <p><span aria-hidden="true">🙂</span> ${t('auth.page.forgotOwn')}</p></details>
      <p class="center small" style="margin-top:16px">${t('auth.page.newHere')} <a href="/signup${wantedNext(req.query.next) ? `?next=${encodeURIComponent(next)}` : ''}">${t('auth.page.signupLink')}</a></p>
      ${loginJoinLink(req)}
    </div></div>`;
  page(req, res, { title: t('auth.page.titleLogin'), active: 'me', body });
}
router.get('/login', loginPage);
// A "Who's this for?" choice: counted (people's browsers only: no robots, link previews or scripts; one daily total per
// choice, nothing about who chose; a GET only, never HEAD or a prefetch), then on to where it leads. /signup/for/ is
// disallowed in robots.txt (/signup itself stays crawlable, so its noindex is seen) and this answers noindex.
router.get('/signup/for/:who', (req, res) => {
  const step = WHO.get(req.params.who);
  if (!step) return res.redirect(302, '/signup');
  if (!req.user && req.method === 'GET' && countable(req)) funnel.bump(step);
  // "I'm a teacher": whoever signs up on this browser next is probably a teacher (services/team.js welcomes).
  if (req.params.who === 'teacher' && (!req.user || req.user.is_guest)) auth.noteTeacherWay(res);
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  res.redirect(302, whoTarget(req, req.params.who));
});

router.post('/api/auth/guest', (req, res) => {
  if (req.user) return res.json({ ok: true, user: auth.publicUser(req.user) });
  if (!allow(`guestip:${ipOf(req)}`, GUESTS_PER_IP_HOUR, 3600e3)) return res.status(429).json({ error: req.t('auth.api.tooManyGuests') });
  const u = auth.createGuest(); auth.startSession(res, u.id, req.headers['user-agent']);
  if (req.localeSource === 'cookie') saveUserLang(u, req.locale);
  if (req.themeSource === 'cookie') saveUserTheme(u, req.theme);
  res.json({ ok: true, user: auth.publicUser(u) });
});
// Sign-up limits (services/ratelimit.js SIGNUP): per address, only accounts actually made count toward the hourly cap.
export { SIGNUP };
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
  // Came by "I'm a teacher" or sent "Set up my school" on this browser: the kids' welcome waits (services/team.js).
  const teacherWay = auth.cameTeacherWay(req);
  if (req.user && req.user.is_guest) {
    u = auth.upgradeGuest(req.user.id, { username: n.value, password }); audit(u.id, 'user.upgrade', u.id);
    auth.endSession(req, res); auth.startSession(res, u.id, req.headers['user-agent'], { method: 'signup', teacherWay }); // fresh session id after the upgrade
  }
  else {
    try { u = auth.createUser({ username: n.value, password }); }
    catch (e) { if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' }); throw e; }
    auth.startSession(res, u.id, req.headers['user-agent'], { method: 'signup', teacherWay }); audit(u.id, 'user.signup', u.id);
  }
  auth.clearTeacherWay(req, res);
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  funnel.bump('kid.signup');   // the guardrail: a daily total of new kid accounts (a guest keeping their progress too)
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
  // A login card's password typed with spaces for its little lines ("compass crab willow 16"): a school account's card
  // passwords are words joined by dashes, so spaces count as dashes there (one try, not two).
  // (the second check runs, against the dummy hash, for any name: the time taken never says which accounts exist)
  const card = typeof password === 'string' && /\s/.test(password.trim()) ? password.trim().replace(/\s+/g, '-') : null;
  const asTyped = auth.verifyPassword(u, password);
  if (!asTyped && !(card && auth.verifyPassword(u && u.managed_school ? u : null, card) && u && u.managed_school)) {
    allow(failKey, LOGIN.ipFails, LOGIN.window); if (lockKey) allow(lockKey, LOGIN.userFails, LOGIN.window);
    return res.status(400).json({ error: req.t('auth.api.wrongLogin'), field: 'password' });
  }
  if (u.banned) return res.status(403).json({ error: req.t('auth.api.paused') });
  // A guest who signs in to an existing account hands their pending course wins over (Greg's guest
  // addendum): the win they earned is not stranded on the guest row they are leaving.
  const prevGuestId = req.user && req.user.is_guest && req.user.id !== u.id ? req.user.id : null;
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, u.id, req.headers['user-agent']);
  if (prevGuestId) courses.transferPendingWins(prevGuestId, u.id);
  auth.notePasswordLength(u, asTyped ? password : card);
  // After a sign-in ended on this device, its page (?next=) is only reopened for the same person: on a shared classroom
  // device the next child goes to their own home, not to the last child's lesson.
  const was = auth.endedUser(req); auth.clearEnded(req, res);
  // A grown-up only goes back to a grown-up page, and a child never to one (server/routes/family.js).
  const next = was === null || was === u.id ? nextFor(u, wantedNext((req.body || {}).next)) : null;
  res.json({ ok: true, user: auth.publicUser(u), redirect: next || homeFor(u) });
});
// next: where to go afterwards ("Not you? Sign out" goes to the sign-in page).
router.post('/api/auth/logout', (req, res) => { auth.endSession(req, res); res.json({ ok: true, redirect: wantedNext((req.body || {}).next) || '/' }); });
// Sign out everywhere ends every session, this one too: one clear promise for a lost device or a shared password
// (changing the password is the way to end the others and stay signed in here).
router.post('/api/auth/logout-everywhere', auth.requireAnyAccount, (req, res) => {
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
router.post('/api/me/password', auth.requireAnyAccount, rateLimit('me-password', PASSWORD_CHANGE.tries, PASSWORD_CHANGE.window), (req, res) => {
  const t = req.t, u = req.user;
  if (!auth.canChangePassword(u)) return res.status(403).json({ error: t('me.password.school') });
  const { current, password, confirm } = req.body || {};
  const bad = (field, error, status = 400) => res.status(status).json({ error, field });
  const failKey = `pw-change-fail:${u.id}`, lockKey = loginLockKey(u.username);
  if (count(failKey) >= PASSWORD_CHANGE.fails || count(lockKey) >= LOGIN.userFails) return res.status(429).json({ error: t('auth.api.tooManyTries') });
  if (!current) return bad('current', t('me.password.needCurrent'));
  const long = auth.longPasswordKind(u), n = String(password || '').length;
  const rule = auth.checkPassword(password, u.username, t) || (long && n < auth.STAFF_PASSWORD_MIN ? t('me.password.staffShort', { n, min: auth.STAFF_PASSWORD_MIN }) : null);
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
// ---- My Oomba character (the shared avatar): a parts spec from the kit's lists, never a picture. Guests keep the default.
router.post('/api/me/character', auth.requireUser, rateLimit('me-character', 60, 3600e3), (req, res) => {
  const t = req.t;
  if (req.user.is_guest) return res.status(403).json({ error: t('me.character.guestOnly') });
  try { const spec = saveCharacter(req.user.id, (req.body || {}).character); res.json({ ok: true, character: spec, toast: t('me.character.saved') }); }
  catch (e) { if (e instanceof CharacterError) return res.status(400).json({ error: t('me.character.invalid'), field: e.field }); throw e; }
});
router.delete('/api/me/character', auth.requireUser, (req, res) => { if (!req.user.is_guest) clearCharacter(req.user.id); res.json({ ok: true }); });
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

// "Your name" (the Me page): a grown-up's own name, as colleagues, students or their family see it. Teachers, school
// staff, the platform admin and grown-up (parent) accounts only: a kid's or a student's account never sets a real name
// (their username is what others see; a student's name at school is the teacher's to set). Staff: it is also their
// name at every school where they are staff. The username (what they sign in with) never changes.
export const mayEditOwnName = u => !!u && !u.is_guest && !u.banned && (u.role === 'admin' || ['staff', 'grownup'].includes(auth.accountKind(u)));
export const ownName = u => (isSchoolStaff(u) && staffName(u)) || u.display_name || u.username;
export function namePanel(req) {
  const t = req.t, u = req.user;
  if (!mayEditOwnName(u)) return '';
  const staff = isSchoolStaff(u);
  return html`<section class="panel" id="your-name" aria-labelledby="yn-h"><h2 id="yn-h"><span aria-hidden="true">🪪</span> ${t('me.name.heading')}</h2>
    <p class="muted">${staff ? t('me.name.textStaff') : t('me.name.textGrownup')}</p>
    <form class="row" data-api="/api/me/name" data-reload data-toast="${t('me.name.saved')}" novalidate>
      <label class="sr-only" for="yn-name">${t('me.name.label')}</label>
      <input class="input grow" id="yn-name" name="name" maxlength="${REAL_NAME_MAX}" autocomplete="name" required value="${ownName(u)}" aria-describedby="yn-note">
      <button class="btn btn-primary" type="submit">${t('me.name.save')}</button>
      <span class="err" id="yn-name-err" aria-live="polite"></span>
    </form>
    <h3 id="yu-h" style="margin:22px 0 4px">${t('me.username.heading')}</h3>
    <p class="small muted" id="yu-note">${t('me.username.note', { days: auth.USERNAME_EVERY_DAYS, hold: auth.USERNAME_HOLD_DAYS })}</p>
    <form class="row" data-api="/api/me/username" data-reload data-toast="${t('me.username.saved')}" novalidate>
      <label class="sr-only" for="yu-name">${t('me.username.heading')}</label>
      <input class="input grow" id="yu-name" name="username" maxlength="16" dir="ltr" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${u.username}" aria-describedby="yu-note">
      <button class="btn" type="submit">${t('me.username.save')}</button>
      <span class="err" id="yu-name-err" aria-live="polite"></span>
    </form></section>`;
}
router.post('/api/me/username', auth.requireAnyAccount, rateLimit('me-username', 10, 3600e3), (req, res) => {
  const t = req.t, u = req.user;
  if (!mayEditOwnName(u)) return res.status(404).json({ error: t('errors.api.notFound') });
  const r = auth.changeUsername(u, (req.body || {}).username, { cleanName, t });
  if (!r.ok) {
    const error = r.error || t(`me.username.${r.code}`, { days: auth.USERNAME_EVERY_DAYS });
    return res.status(400).json({ error, field: 'username', code: r.code });
  }
  res.json({ ok: true, username: r.username });
});
router.post('/api/me/name', auth.requireAnyAccount, rateLimit('me-name', 20, 3600e3), (req, res) => {
  const t = req.t, u = req.user;
  if (!mayEditOwnName(u)) return res.status(404).json({ error: t('errors.api.notFound') });
  const n = cleanRealName((req.body || {}).name, t);
  if (!n.ok) return res.status(400).json({ error: n.error, field: 'name' });
  q.run('UPDATE users SET display_name=? WHERE id=?', n.value, u.id);
  const schools = isSchoolStaff(u) ? setOwnStaffName(u.id, n.value) : 0;
  audit(u.id, 'user.own_name', u.id, { schools });
  res.json({ ok: true });
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

/** Change password (own accounts, school staff, the platform admin, grown-ups), or who looks after it (school students).
 *  Guests: nothing. */
export function passwordPanel(req) {
  const t = req.t, u = req.user;
  if (u.is_guest) return '';
  const head = html`<h2 id="pw-h"><span aria-hidden="true">🔑</span> ${t('me.password.heading')}</h2>`;
  const gOnly = noPasswordText(req);
  if (gOnly) return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}<p class="muted">${gOnly}</p></section>`;
  if (!auth.canChangePassword(u)) return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}<p class="muted">${t('me.password.school')}</p></section>`;
  const kind = auth.accountKind(u), min = auth.longPasswordKind(u) ? auth.STAFF_PASSWORD_MIN : 6;
  return html`<section class="panel" id="password" aria-labelledby="pw-h">${head}
    <p class="muted">${t('me.password.text')}</p>
    <form class="pwform" data-api="/api/me/password" data-reset novalidate>
      <div class="field"><label for="pw-current">${t('me.password.current')}</label>
        <input class="input" id="pw-current" name="current" type="password" dir="ltr" autocomplete="current-password" required><span class="err" id="pw-current-err" aria-live="polite"></span></div>
      <div class="field"><label for="pw-new">${t('me.password.new')}</label>
        <input class="input" id="pw-new" name="password" type="password" dir="ltr" autocomplete="new-password" required minlength="${min}" maxlength="72" aria-describedby="pw-new-hint">
        <span class="hint" id="pw-new-hint">${kind === 'staff' ? t('me.password.hintStaff', { min }) : kind === 'grownup' ? t('me.password.hintGrownup', { min }) : t('me.password.hint', { min })}</span><span class="err" id="pw-new-err" aria-live="polite"></span></div>
      <div class="field"><label for="pw-confirm">${t('me.password.confirm')}</label>
        <input class="input" id="pw-confirm" name="confirm" type="password" dir="ltr" autocomplete="new-password" required maxlength="72"><span class="err" id="pw-confirm-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">${t('me.password.button')}</button>
    </form>
  </section>`;
}
/** Sign out (here), and for accounts Sign out everywhere. */
export function signOutPanel(req) {
  const t = req.t, u = req.user;
  return html`<section class="panel" id="signout" aria-labelledby="so-h"><h2 id="so-h">${t('me.signOut.heading')}</h2><p class="muted">${u.is_guest ? t('me.signOut.guest') : t('me.signOut.account')}</p>
    <form data-api="/api/auth/logout" data-next="/"><button class="btn btn-danger" type="submit">${t('me.signOut.button')}</button></form>
    ${u.is_guest ? '' : html`<div class="so-every"><p class="muted small">${t('me.signOut.everywhereText')}</p>
    <form data-api="/api/auth/logout-everywhere" data-confirm="${t('me.signOut.everywhereConfirm')}"><button class="btn" type="submit">${t('me.signOut.everywhereButton')}</button></form></div>`}
  </section>`;
}

/** The account section's plan for school staff: their Teacher plan (status, today's messages, billing) and, at a school
 *  they teach in but don't run, "Ask my admin" for one; and who asked a school's admin for a plan (My school's line).
 *  routes/teacher-plan.js sets both (importing the billing pages from
 *  here would load them before services/billing.js is ready); '' until then and while paid-plan pages are off. */
let planPanels = () => '', openAsksOf = () => [];
export const setMePlanPanels = (panels, asks) => { planPanels = panels; openAsksOf = asks; };
// /me/settings: the account's settings, moved off the Me page (docs/decisions.md "Settings page"): the Teacher plan and
// billing (staff, while paid-plan pages are on), Language, Appearance, Password and Sign out, in that order, with a small
// section nav (sticky chips on a phone, a side list on a laptop). Every form and API is the one the Me page had.
// Grown-ups keep their own settings page (/family/account). Old links to /me#language, #appearance, #password,
// #signout and #teacher-plan are sent here by public/js/app.js.
export const SETTINGS_PATH = '/me/settings';
router.get(SETTINGS_PATH, auth.requireUser, (req, res) => {
  const t = req.t, u = req.user;
  if (auth.isGrownup(u)) return res.redirect(302, '/family/account');
  const staff = !u.is_guest && isSchoolStaff(u);
  const plan = staff ? String(planPanels(req) || '') : '';
  const sections = [
    plan && ['billing', '🍎', t('me.settings.billing'), raw(plan)],
    ['language-sec', '🌐', t('me.language.heading'), languagePanel(req)],
    ['appearance-sec', '🎨', t('me.theme.heading'), appearancePanel(req)],
    !u.is_guest && ['password-sec', '🔑', t('me.password.heading'), passwordPanel(req)],
    ['signout-sec', '👋', t('me.signOut.heading'), signOutPanel(req)],
  ].filter(x => x && String(x[3] || ''));
  const body = html`<div class="pagehead"><h1>⚙️ ${t('me.settings.title')}</h1></div>
  <div class="setpage">
    <nav class="setnav" aria-label="${t('me.settings.sections')}"><ul class="plain">${sections.map(([id, e, label]) => html`<li><a class="setlink" href="#${id}"><span aria-hidden="true">${e}</span> ${label}</a></li>`)}</ul></nav>
    <div class="setmain">${sections.map(([id, , , panel]) => html`<div class="setsec" id="${id}">${panel}</div>`)}</div>
  </div>`;
  res.set('Cache-Control', 'private, no-store');
  page(req, res, { title: t('me.settings.title'), active: 'me', body, back: '/me', backLabel: t('nav.me') });
});

router.get('/me', auth.requireUser, (req, res) => {
  const t = req.t;
  const u = req.user;
  // My games: how many are building now, and how many finished with a new version the builder hasn't opened yet.
  const news = u.is_guest ? new Map() : buildStatus(u.id);
  const nb = [...news.values()].filter(x => x === 'building').length, nr = [...news.values()].filter(x => x === 'ready').length;
  const gamesSub = [nb && t('me.tiles.building', { count: nb }), nr && t('me.tiles.ready', { count: nr })].filter(Boolean).join(' · ');
  const nb_ = u.is_guest ? {} : navBadges(u), invites = u.is_guest ? 0 : invitesFor(u.id).length;
  const noFriends = !u.is_guest && noFriendsAccount(u);
  const runs = u.is_guest ? [] : adminSchools(u);
  const asks = runs.reduce((n, x) => n + openAsksOf(x.id).length, 0);
  const myschool = runs.length ? ['🏫', t('me.tiles.school'), '/school', asks ? t('me.tiles.asks', { count: asks }) : runs.length === 1 ? runs[0].name : ''] : null;
  const tiles = [
    !u.is_guest && ['👤', t('me.tiles.profile'), `/u/${u.username}`],
    ['❤️', t('me.tiles.favorites'), '/favorites'],
    !u.is_guest && (isPlatformAdmin(u) && !isSchoolStaff(u) ? ['🏫', t('nav.schools'), '/admin/schools'] : [isSchoolStaff(u) ? '🍎' : '🏫', t('me.tiles.classes'), isSchoolStaff(u) ? '/teach' : '/classes', invites ? t('me.tiles.invites', { count: invites }) : '']),
    // My school: where a school's admins manage it (/school: its overview, or a pick of their schools). Teachers who
    // don't run a school have no school pages.
    myschool,
    ['🛠️', t('me.tiles.games'), '/build', gamesSub],
    // Staff (teachers, school admins, the platform admin) have no friends and no friends' chat: their one inbox is the
    // Oomba team's messages.
    !noFriends && ['👫', t('me.tiles.friends'), '/friends', nb_.requests ? t('me.tiles.requests', { count: nb_.requests }) : ''],
    // the Me badge's source, said where it comes from: new messages on the Chat tile
    noFriends ? ['📬', t('team.name'), '/chat', nb_.unread ? t('me.tiles.unread', { count: nb_.unread }) : '']
      : ['💬', t('me.tiles.chat'), '/chat', nb_.unread ? t('me.tiles.unread', { count: nb_.unread }) : ''],
    u.role === 'admin' && ['🛡️', t('me.tiles.admin'), '/admin'],
    // Settings (/me/settings): plan and billing, language, appearance, password and sign out.
    ['⚙️', t('me.tiles.settings'), '/me/settings'],
  ].filter(Boolean);
  // A kid's "For grown-ups" card (the link code) comes first: the Builder's daily-limit card sends kids here to show a
  // grown-up the code. Empty for everyone else (guests, school accounts, staff) and while family pages are off.
  const family = meFamilyPanel(req);
  // School staff: their real name as their school knows it, and no kids' character maker (a grown-up's Me page).
  const staff = !u.is_guest && isSchoolStaff(u);
  const body = html`
  <div class="pagehead mehead">${avatar(u, 72)}<div style="flex:1;min-width:0"><h1 style="margin:0">${(staff && staffName(u)) || u.display_name}</h1><div class="muted"><bdi>@${u.username}</bdi>${u.is_guest ? ` · ${t('me.guestTag')}` : ''}</div>${u.is_guest ? '' : notYou(req, { withName: false, plain: auth.accountKind(u) !== 'student' })}</div>${staff ? makeGameBtn(t) : ''}</div>
  ${u.is_guest ? html`<div class="notice warn" style="margin-bottom:16px">${tHtml(t, 'me.guestNotice', { href: '/signup?next=/me' })}</div>` : ''}
  ${family}
  <nav class="metiles" aria-label="${t('me.title')}">
    ${tiles.map(([e, l, h, sub]) => html`<a class="panel metile" href="${h}"><span class="metile-e" aria-hidden="true">${e}</span><span>${l}</span>${sub ? html`<span class="metile-sub">${sub}</span>` : ''}</a>`)}
  </nav>
  <section class="panel lookpanel" aria-labelledby="av-h"><h2 id="av-h">${t('me.look.heading')}</h2>
    <div class="lookme">${avatar(u, 96)}
      <button class="btn" type="button" id="look-edit" aria-haspopup="dialog">✏️ ${t('me.look.edit')}</button></div>
    ${u.is_guest ? '' : html`<input type="file" id="photo-file" accept="image/*" hidden>`}
    <template id="look-sheet">
      <section class="looksec"><h3>📷 ${t('me.photo.heading')}</h3>
        <p class="muted small">${u.is_guest ? t('me.photo.guest') : t('me.photo.text')}</p>
        ${u.is_guest ? '' : html`<div class="row">
          <button class="btn btn-primary" type="button" data-photo-pick>📷 ${u.photo_at ? t('me.photo.change') : t('me.photo.upload')}</button>
          ${u.photo_at ? html`<button class="btn" type="button" data-photo-remove>${t('me.photo.remove')}</button>` : ''}
        </div>`}</section>
      <section class="looksec"><h3>${t('me.look.avatarHeading')}</h3>
        <div class="lookmenu" role="group" aria-label="${t('me.look.avatarGroup')}">${auth.AVATARS.map(a => html`<button class="chip lookemoji" type="button" data-avatar="${a}" aria-pressed="${a === u.avatar}" aria-label="${t('me.look.avatarLabel', { emoji: a })}">${a}</button>`)}</div></section>
      <section class="looksec"><h3>${t('me.look.colorHeading')}</h3>
        <div class="lookmenu" role="group" aria-label="${t('me.look.colorGroup')}">${auth.COLORS.map(c => html`<button class="chip" type="button" data-color="${c}" aria-pressed="${c === u.color}" aria-label="${t('me.look.colorLabel', { color: c })}"><span class="avatar" style="--s:26px;--c:${c}"></span></button>`)}</div></section>
    </template>
  </section>
  ${staff ? '' : characterPanel(req)}
  ${!u.is_guest && !noFriends ? html`<section class="panel"><h2>${t('me.chat.heading')}</h2>
    <p class="muted">${t('me.chat.text')}</p>
    <label class="row" style="font-weight:700"><input type="checkbox" id="chat-toggle" ${u.chat_enabled ? raw('checked') : ''} style="width:24px;height:24px"> ${t('me.chat.toggle')}</label>
  </section>` : ''}
  ${staff ? digestPanel(req) : ''}
  <div class="mesettings">${namePanel(req)}${meGooglePanel(req)}</div>`;
  page(req, res, { title: t('me.title'), active: 'me', body, scripts: ['/js/me.js', '/js/character.js'], ...(staff ? { head: raw(`<link rel="stylesheet" href="/css/digest.css?v=${VERSION}">`) } : {}) });
});
