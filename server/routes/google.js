// Sign in with Google: the routes (/auth/google/*, the Me-page connect, teachers' invites, the school's Google domains,
// /join and /google-setup) and the panels other pages show. Everything answers like an unknown page, and every panel
// renders '', while Google is off (oidc.js googleEnabled). See docs/decisions.md "Sign in with Google".
import { Router } from 'express';
import crypto from 'node:crypto';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { config } from '../config.js';
import * as auth from '../auth.js';
import { allow, count, ipOf, rateLimit, loginLockKey } from '../services/ratelimit.js';
import { log } from '../services/log.js';
import { tHtml } from '../i18n/index.js';
import { googleEnabled, newFlow, redirectUri, authorizationUrl, writeFlow, readFlow, clearFlow, useState, safeEqual,
  exchangeCode, verifyIdToken, errorCode, OidcError } from '../oidc.js';
import * as G from '../services/google.js';
import * as S from '../services/schools.js';
import { LOGIN, PASSWORD_CHANGE, homeFor, safeNext, wantedNext } from './auth.js';

export const router = Router();
const on = (req, res, next) => (googleEnabled() ? next() : next('router'));
const b = req => req.body || {};
const sha16 = v => crypto.createHash('sha256').update(String(v || '')).digest('hex').slice(0, 16);
const nameOf = r => r.roster_name || r.display_name;

// Message codes a page may show (?gerr=). Anything else is ignored.
export const ERROR_CODES = ['expired', 'denied', 'schoolBlocked', 'unknown', 'joinNoWay', 'schoolOnly', 'wrongDomain', 'inUse',
  'alreadyLinked', 'unverified', 'schoolOff', 'googleDown', 'browser', 'notSetUp', 'tooMany', 'paused', 'tooManyJoins'];
const REFUSED = new Set(['unknown', 'joinNoWay', 'wrongDomain', 'schoolOnly', 'inUse', 'unverified', 'schoolOff']);
// requestJoin's refusals, shown on /join after a Google sign-in (?jerr=).
const JOIN_ERRORS = ['badCode', 'otherSchoolAccount', 'staffUseTeach', 'adminNotStudent', 'ownAccountsOff'];
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

// ================================================================ the flow
router.get('/auth/google/start', on, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const intent = ['join', 'link'].includes(req.query.intent) ? req.query.intent : 'signin';
  const next = safeNext(req.query.next);
  const code = S.normCode(req.query.code);
  if (!allow(`g-start:${ipOf(req)}`, 120, 900e3)) return res.redirect(303, intent === 'join' ? '/join?gerr=tooMany' : '/login?gerr=tooMany');
  if (intent === 'join' && !CODE_RE.test(code)) return res.redirect(303, '/join?bad=1');
  let userId;
  if (intent === 'link') {
    const tk = auth.readToken(String(req.query.t || ''));
    if (!req.user || !tk || tk.p !== 'glink' || tk.u !== req.user.id || tk.sh !== sha16(req.sessionId)) return res.redirect(303, '/me?gerr=expired#google');
    userId = req.user.id;
  }
  const f = newFlow(); const redirect = redirectUri(req);
  writeFlow(res, { s: f.state, n: f.nonce, v: f.verifier, r: redirect, i: intent, nx: next, c: intent === 'join' ? code : undefined, u: userId });
  res.redirect(302, authorizationUrl({ ...f, redirect }));
});

/** Where a refused flow goes back to, with an allowlisted message. */
function back(flow, gerr) {
  if (flow && flow.i === 'link') return `/me?gerr=${gerr}#google`;
  if (flow && flow.i === 'join') return `/join?code=${encodeURIComponent(flow.c || '')}&gerr=${gerr}`;
  const nx = flow && wantedNext(flow.nx);
  return `/login?gerr=${gerr}${nx ? `&next=${encodeURIComponent(nx)}` : ''}`;
}
router.get('/auth/google/callback', on, async (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  clearFlow(res);
  const flow = readFlow(auth.parseCookies(req));
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!flow) return res.redirect(303, req.user && !req.user.is_guest ? homeFor(req.user) : back(null, 'expired'));
  if (!state || !safeEqual(state, flow.s) || !useState(flow.s)) { log('warn', 'google state mismatch'); return res.redirect(303, back(flow, 'expired')); }
  if (req.query.error) return res.redirect(303, back(flow, errorCode(req.query.error)));
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return res.redirect(303, back(flow, 'googleDown'));
  if (flow.i === 'link' && (!req.user || req.user.id !== flow.u)) return res.redirect(303, back(flow, 'expired'));

  // The same limits as the password sign-in, so Google can't buy extra tries from one address.
  const ip = ipOf(req); const failKey = `login-ip-fail:${ip}`;
  if (count(failKey) >= LOGIN.ipFails || !allow(`login-ip:${ip}`, LOGIN.ipTries, LOGIN.window)) return res.redirect(303, back(flow, 'tooMany'));

  let claims;
  try { claims = await verifyIdToken(await exchangeCode({ code, redirect: flow.r, verifier: flow.v }), { nonce: flow.n }); }
  catch (e) {
    const c = e instanceof OidcError ? e.code : 'googleDown';
    if (c === 'googleDown') log('warn', 'google sign-in failed', { reason: e instanceof OidcError ? e.reason : 'error' });
    if (REFUSED.has(c)) allow(failKey, LOGIN.ipFails, LOGIN.window);
    return res.redirect(303, back(flow, c));
  }
  const r = G.resolveSignIn({ claims, flow, currentUser: req.user, ip });
  if (!r.ok) { if (REFUSED.has(r.code)) allow(failKey, LOGIN.ipFails, LOGIN.window); return res.redirect(303, back(flow, r.code)); }
  if (flow.i === 'link') return res.redirect(303, r.landing);

  const user = r.user;
  if (req.user) auth.endSession(req, res);
  auth.startSession(res, user.id, req.headers['user-agent']);
  const was = auth.endedUser(req); auth.clearEnded(req, res);
  const next = flow.i === 'signin' && (was === null || was === user.id) ? wantedNext(flow.nx) : null;
  G.auditSignIn(user, r.via, claims.hd);
  res.redirect(303, next || r.landing || homeFor(user));
});

// ================================================================ Me page: connect / disconnect
// The same limits as a password change (routes/auth.js; read per request because the two files import each other).
const pwLimit = (req, res, next) => rateLimit('me-password', PASSWORD_CHANGE.tries, PASSWORD_CHANGE.window)(req, res, next);
router.post('/api/me/google/connect', on, auth.requireAccount, pwLimit, (req, res) => {
  const t = req.t, u = req.user;
  if (!G.canConnect(u).ok) return res.status(403).json({ error: t('google.errors.schoolOnly') });
  if (G.identityOf(u.id)) return res.status(400).json({ error: t('google.errors.alreadyLinked') });
  const failKey = `pw-change-fail:${u.id}`, lockKey = loginLockKey(u.username);
  if (count(failKey) >= PASSWORD_CHANGE.fails || count(lockKey) >= LOGIN.userFails) return res.status(429).json({ error: t('auth.api.tooManyTries') });
  const { current } = b(req);
  if (!current) return res.status(400).json({ error: t('me.password.needCurrent'), field: 'current' });
  if (!auth.verifyPassword(u, current)) {
    allow(failKey, PASSWORD_CHANGE.fails, PASSWORD_CHANGE.window); allow(lockKey, LOGIN.userFails, LOGIN.window);
    return res.status(400).json({ error: t('me.password.wrongCurrent'), field: 'current' });
  }
  res.json({ ok: true, redirect: `/auth/google/start?intent=link&t=${encodeURIComponent(auth.signToken({ p: 'glink', u: u.id, sh: sha16(req.sessionId) }, 300))}` });
});
router.post('/api/me/google/disconnect', on, auth.requireAccount, (req, res) => {
  const t = req.t, u = req.user;
  if (auth.accountKind(u) === 'student') return res.status(403).json({ error: t('google.me.schoolAccount') });
  if (!u.password_hash) return res.status(400).json({ error: t('google.me.needCard') });
  G.unlink(u.id, u.id, 'self');
  res.json({ ok: true, toast: t('google.me.disconnectedToast') });
});

// ================================================================ school: Google domains, staff invites
const notFound = (req, res) => res.status(404).json({ error: req.t('school.errors.notFound') });
const schoolApi = (req, res) => { const s = S.getSchool(req.params.id); if (!s || !S.canManageSchool(req.user, s.id)) { notFound(req, res); return null; } return s; };
router.post('/api/schools/:id/google', on, auth.requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const t = req.t; const p = S.parseDomains(b(req).domains);
  if (!p.ok) return res.status(400).json({ field: 'domains', error: t(`google.settings.${p.code}`, { value: p.value || '', max: S.MAX_DOMAINS }) });
  // One school per Google domain: otherwise another school could invite (and so claim) this school's students first.
  const taken = G.domainTakenBy(s.id, p.domains);
  if (taken) return res.status(400).json({ field: 'domains', error: t('google.settings.domainTaken', { value: taken }) });
  const lost = G.lostWithDomains(s.id, p.domains);
  const r = S.updateSchool(req.user, s.id, { settings: { googleDomains: p.domains } });
  if (!r.ok) return res.status(400).json({ error: t(`school.errors.${r.code}`) });
  res.json({ ok: true, toast: lost ? t('google.settings.lostAccounts', { count: lost }) : t('school.settings.saved') });
});
router.post('/api/schools/:id/google-invites', on, auth.requireUser, rateLimit('google-invite', 30, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  const t = req.t; const { email, rosterName, role = 'teacher' } = b(req);
  const r = G.createStaffInvite(req.user, s.id, { email, rosterName, role });
  if (!r.ok) {
    if (r.code === 'rosterName') return res.status(400).json({ field: 'rosterName', error: t('school.errors.staffName') });
    if (r.code === 'notEmail') return res.status(400).json({ field: 'email', error: t('google.invites.notEmail', { line: String(email || '').slice(0, 60) }) });
    if (r.code === 'notSchool') return res.status(400).json({ field: 'email', error: t('google.invites.notSchool', { email: ltr(r.email), domains: domainList(req, G.schoolDomains(s)) }) });
    return res.status(400).json({ error: t(r.code === 'badRole' ? 'school.errors.badRole' : `google.invites.${r.code}`) });
  }
  res.json({ ok: true, toast: t('google.staff.saved', { name: r.name, role: t(`school.roles.${r.role}`) }) });
});
router.post('/api/schools/:id/members/:uid/google', on, auth.requireUser, rateLimit('google-invite', 30, 3600e3), (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  attachReply(req, res, G.attachInvite(req.user, s.id, null, req.params.uid, b(req).email), s);
});
router.post('/api/schools/:id/members/:uid/google/remove', on, auth.requireUser, (req, res) => {
  const s = schoolApi(req, res); if (!s) return;
  removeGoogle(req, res, s, req.params.uid, null);
});

// ================================================================ class: invites, attach, the class-code option
const loadClass = (req, res) => { const c = S.getClass(req.params.id); if (!c || !S.canManageClass(req.user, c)) { notFound(req, res); return null; } return c; };
router.post('/api/classes/:id/google-invites', on, auth.requireUser, rateLimit('google-invite', 30, 3600e3), (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const t = req.t; const s = S.getSchool(c.school_id);
  const r = G.createClassInvites(req.user, c, b(req).emails);
  if (!r.ok) {
    const domains = domainList(req, G.schoolDomains(s));
    if (r.code === 'badLines') {
      const lines = [...r.bad.map(line => t('google.invites.notEmail', { line })), ...r.notSchool.map(email => t('google.invites.notSchool', { email: ltr(email), domains }))].slice(0, 10).join(' · ');
      return res.status(400).json({ field: 'emails', error: t('google.invites.badLines', { lines }) });
    }
    return res.status(400).json({ field: 'emails', error: t(`google.invites.${r.code}`, { name: r.name || '' }) });
  }
  const k = r.counts;
  const parts = [k.invited && t('google.invites.resultInvited', { count: k.invited }), k.attach && t('google.invites.resultConnected', { count: k.attach }),
    k.renewed && t('google.invites.resultRenewed', { count: k.renewed }), k.already && t('google.invites.resultAlready', { count: k.already })].filter(Boolean);
  res.json({ ok: true, toast: parts.join(' · ') });
});
router.post('/api/classes/:id/students/:uid/google', on, auth.requireUser, rateLimit('google-invite', 30, 3600e3), (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const m = S.classMember(c.id, req.params.uid);
  if (!m || m.role !== 'student') return notFound(req, res);
  attachReply(req, res, G.attachInvite(req.user, c.school_id, c.id, m.user_id, b(req).email), S.getSchool(c.school_id));
});
router.post('/api/classes/:id/students/:uid/google/remove', on, auth.requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const m = S.classMember(c.id, req.params.uid);
  if (!m || m.role !== 'student' || !S.canManageStudent(req.user, c.school_id, m.user_id)) return notFound(req, res);
  removeGoogle(req, res, S.getSchool(c.school_id), m.user_id, c.id);
});
router.post('/api/classes/:id/google-join', on, auth.requireUser, (req, res) => {
  const c = loadClass(req, res); if (!c) return;
  const v = b(req).on; const yes = v === true || v === '1' || v === 'on' || v === 'true';
  if (yes && !G.schoolDomains(S.getSchool(c.school_id)).length) return res.status(400).json({ error: req.t('google.invites.noDomains') });
  G.setGoogleJoin(req.user, c, yes);
  res.json({ ok: true, toast: req.t(yes ? 'google.classJoin.onToast' : 'google.classJoin.offToast') });
});
// Renew / remove an invite: class invites need the class, staff and People-tab invites the school.
function loadInvite(req, res) {
  const inv = G.getInvite(req.params.iid); const c = inv && inv.class_id ? S.getClass(inv.class_id) : null;
  const okay = inv && (c ? S.canManageClass(req.user, c) : S.canManageSchool(req.user, inv.school_id));
  if (!okay || inv.status !== 'open') { notFound(req, res); return null; }
  return inv;
}
router.post('/api/google-invites/:iid/renew', on, auth.requireUser, (req, res) => { const inv = loadInvite(req, res); if (!inv) return; G.renewInvite(req.user, inv); res.json({ ok: true, toast: req.t('google.invites.renewed') }); });
router.post('/api/google-invites/:iid/revoke', on, auth.requireUser, (req, res) => { const inv = loadInvite(req, res); if (!inv) return; G.revokeInvite(req.user, inv); res.json({ ok: true, toast: req.t('google.invites.revoked') }); });

function attachReply(req, res, r, s) {
  const t = req.t;
  if (r.ok) return res.json({ ok: true, toast: t('google.attach.saved') });
  if (r.code === 'notEmail') return res.status(400).json({ field: 'email', error: t('google.invites.notEmail', { line: String(b(req).email || '').slice(0, 60) }) });
  if (r.code === 'notSchool') return res.status(400).json({ field: 'email', error: t('google.invites.notSchool', { email: ltr(r.email), domains: domainList(req, G.schoolDomains(s)) }) });
  if (r.code === 'noDomains') return res.status(400).json({ error: t('google.invites.noDomains') });
  return res.status(400).json({ error: t('google.attach.notSchoolAccount') });
}
/** Take Google off a school account. One with no password gets a login card at once, so it is never left without a way in. */
function removeGoogle(req, res, s, userId, classId) {
  const u = auth.getUser(userId); const m = u && S.membership(s.id, u.id);
  if (!u || !m || u.managed_school !== s.id) return notFound(req, res);
  if (m.role !== 'student' && !S.canManageSchool(req.user, s.id)) return notFound(req, res);
  if (!G.unlink(req.user.id, u.id, S.canManageSchool(req.user, s.id) ? 'admin' : 'teacher')) return res.status(400).json({ error: req.t('google.attach.notConnected') });
  if (!u.password_hash) {
    const r = S.resetSchoolPassword(req.user, s.id, u.id);
    if (r.ok) return res.json({ ok: true, redirect: `/cards/${cardsHook.keep(req.user, [{ name: m.roster_name || u.display_name, username: r.username, password: r.password, role: m.role !== 'student' ? m.role : null }], { schoolId: s.id, classId })}` });
  }
  res.json({ ok: true, toast: req.t('google.attach.removed') });
}
// routes/schools.js owns the login-card store and the cards page; it hands its keepCards over here at start-up.
export const cardsHook = { keep: () => '' };

// ================================================================ /join (class code, then how you sign in)
router.get('/join/:code', on, (req, res) => res.redirect(302, `/join?code=${encodeURIComponent(S.normCode(req.params.code))}`));
router.get('/join', on, (req, res) => {
  const t = req.t; const code = S.normCode(req.query.code); const u = req.user;
  const valid = CODE_RE.test(code);
  const jerr = JOIN_ERRORS.includes(req.query.jerr) ? html`<p class="notice warn" role="alert">${t(`school.errors.${req.query.jerr}`)}</p>` : '';
  const bad = req.query.bad === '1' || (req.query.code !== undefined && !valid) ? html`<p class="notice warn" role="alert">${t('google.join.badCode')}</p>` : '';
  const step1 = html`<form class="stack" method="get" action="/join" novalidate>
      <div class="field"><label for="jc">${t('google.join.codeLabel')}</label>
        <input class="input jc-input" id="jc" name="code" dir="ltr" value="${valid ? '' : String(req.query.code || '').slice(0, 12)}" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" required></div>
      <button class="btn btn-primary btn-block btn-big" type="submit">${t('google.join.next')}</button></form>`;
  const signedIn = u && !u.is_guest;
  const step2 = html`<p class="center jc-chosen">${t('google.join.codeIs', { code })} · <a href="/join">${t('google.join.change')}</a></p>
    ${signedIn ? html`<form data-api="/api/classes/join" novalidate><input type="hidden" name="code" value="${code}"><p class="err form-err" aria-live="polite"></p>
        <button class="btn btn-primary btn-block btn-big" type="submit">${t('google.join.joinButton')}</button></form>`
      : html`<h2 class="center jc-how">${t('google.join.how')}</h2>
        <div class="gsign">${googleButton(req, `/auth/google/start?intent=join&code=${code}`)}<p class="center small muted gsign-hint">${t('google.join.googleHint')}</p></div>
        <div class="divider">${t('auth.page.or')}</div>
        <a class="btn btn-block btn-wrap" href="/login?next=${encodeURIComponent(`/join?code=${code}`)}">${t('google.join.card')}</a>
        <p class="center small">${tHtml(t, 'google.join.signup', { link: html`<a href="/signup?next=${encodeURIComponent(`/join?code=${code}`)}">${t('google.join.signupLink')}</a>` })}</p>`}`;
  const body = html`<div class="authbox"><div class="panel">
      <div class="center" style="font-size:3rem" aria-hidden="true">🏫</div>
      <h1 class="center">${t('google.join.heading')}</h1>
      ${valid ? '' : html`<p class="center muted">${t('google.join.intro')}</p>`}
      ${googleNotice(req)}${jerr}${bad}
      ${valid ? step2 : step1}
    </div></div>`;
  page(req, res, { title: t('google.join.title'), active: 'me', body, back: '/' });
});

// ================================================================ /google-setup (for teachers and IT admins)
const trustSteps = req => [1, 2, 3, 4, 5, 6].map(i => html`<li>${i === 3 ? tHtml(req.t, 'google.setup.step3', { id: clientIdBox(req) }) : req.t(`google.setup.step${i}`)}</li>`);
router.get('/google-setup', on, (req, res) => {
  const t = req.t;
  const body = html`<div class="wrap narrow" style="padding:0"><h1>🔐 ${t('google.setup.heading')}</h1>
    <section class="panel"><h2>${t('google.setup.what.h')}</h2><p>${t('google.setup.what.p1')}</p></section>
    <section class="panel"><h2>${t('google.setup.turnOn.h')}</h2><p>${t('google.setup.turnOn.p1')}</p></section>
    <section class="panel" id="trust"><h2>${t('google.setup.trust.h')}</h2><p>${t('google.setup.trust.p1')}</p><ol class="gsteps">${trustSteps(req)}</ol></section>
    <section class="panel"><h2>${t('google.setup.invite.h')}</h2><p>${t('google.setup.invite.p1')}</p><p>${t('google.setup.invite.p2')}</p></section>
    <section class="panel"><h2>${t('google.setup.privacy.h')}</h2><p>${t('google.setup.privacy.p1')}</p></section></div>`;
  page(req, res, { title: t('google.setup.title'), back: '/', body });
});
const clientIdBox = req => html`<code dir="ltr" class="gclient">${config.googleClientId}</code> <button class="btn btn-sm" type="button" data-copy="${config.googleClientId}">📋 ${req.t('google.setup.copy')}</button>`;

// ================================================================ pieces for other pages
const G_LOGO = raw(`<svg class="gbtn-g" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`);
export const googleButton = (req, href) => html`<a class="gbtn" href="${href}">${G_LOGO}<span>${req.t('google.button.signIn')}</span></a>`;
/** "@dwes.org or @students.dwes.org" in the reader's language. */
// Addresses and domains are wrapped in Unicode left-to-right isolates, so in Hebrew and Arabic "@dwes.org" keeps its @ in front.
const ltr = s => `\u2066${s}\u2069`;
function domainList(req, domains) {
  const at = domains.map(d => ltr(`@${d}`));
  try { return new Intl.ListFormat(req.fmt.intl, { type: 'disjunction' }).format(at); } catch { return at.join(', '); }
}

/** The error notice for ?gerr= (allowlisted codes only). */
export function googleNotice(req) {
  const c = String(req.query.gerr || '');
  if (!googleEnabled() || !ERROR_CODES.includes(c)) return '';
  const text = c === 'tooMany' ? req.t('auth.api.tooManyTries') : c === 'paused' ? req.t('auth.api.paused') : req.t(`google.errors.${c}`);
  const help = ['schoolBlocked', 'denied'].includes(c) ? html` <a href="/google-setup#trust">${req.t('google.errors.setupLink')}</a>` : '';
  return html`<p class="notice warn" role="alert">${text}${help}</p>`;
}

/** The sign-in page's Google part: the button, its hint and the "or" line. '' while Google is off. */
export function loginGoogle(req, next) {
  if (!googleEnabled()) return '';
  const href = `/auth/google/start${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`;
  return html`<div class="gsign">${googleButton(req, href)}<p class="center small muted gsign-hint">${req.t('google.button.hint')}</p></div>
    <div class="divider">${req.t('auth.page.or')}</div><p class="center small muted gsign-or">${req.t('google.login.orName')}</p>`;
}
export const loginJoinLink = req => (googleEnabled() ? html`<p class="center small">${tHtml(req.t, 'google.login.joinLink', { link: html`<a href="/join">${req.t('google.login.joinLinkText')}</a>` })}</p>` : '');

/** The Me page's Google panel (#google). */
export function meGooglePanel(req) {
  const t = req.t, u = req.user;
  if (!googleEnabled() || !u || u.is_guest) return '';
  const ident = G.identityOf(u.id); const kind = auth.accountKind(u);
  const head = html`<h2 id="g-h"><span aria-hidden="true">🔐</span> ${t('google.me.heading')}</h2>`;
  const flash = req.query.google === 'connected' ? html`<p class="notice good" role="status">${t('google.me.connectedToast')}</p>` : '';
  const notice = googleNotice(req);
  if (kind === 'student') return ident ? html`<section class="panel" id="google" aria-labelledby="g-h">${head}${flash}<p>${t('google.me.connected', { email: ltr(ident.email) })}</p><p class="small muted">${t('google.me.schoolAccount')}</p></section>` : '';
  if (ident) {
    return html`<section class="panel" id="google" aria-labelledby="g-h">${head}${flash}${notice}
      <p><b>${t('google.me.connected', { email: ltr(ident.email) })}</b></p>
      ${u.password_hash ? html`<p class="small muted">${t('google.me.connectedHint')}</p>
        <form data-api="/api/me/google/disconnect" data-reload data-confirm="${t('google.me.disconnectConfirm')}"><button class="btn" type="submit">${t('google.me.disconnect')}</button></form>`
      : html`<p class="small muted">${t('google.me.needCard')}</p>`}</section>`;
  }
  if (!G.canConnect(u).ok) return notice ? html`<section class="panel" id="google" aria-labelledby="g-h">${head}${notice}</section>` : '';
  return html`<section class="panel" id="google" aria-labelledby="g-h">${head}${notice}
    <p class="muted">${kind === 'staff' ? t('google.me.textStaff') : t('google.me.textStudent')}</p>
    <form class="pwform" data-api="/api/me/google/connect" novalidate>
      <div class="field"><label for="g-current">${t('google.me.password')}</label>
        <input class="input" id="g-current" name="current" type="password" dir="ltr" autocomplete="current-password" required><span class="err" id="g-current-err" aria-live="polite"></span></div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary" type="submit">${t('google.me.connect')}</button></form></section>`;
}
/** The password panel's text for an account that only signs in with Google ('' otherwise). */
export function noPasswordText(req) {
  if (!googleEnabled() || req.user.password_hash || !G.identityOf(req.user.id)) return '';
  return auth.accountKind(req.user) === 'student' ? req.t('google.me.noPasswordStudent') : req.t('google.me.noPasswordStaff');
}

function inviteLine(req, inv) {
  const t = req.t; const st = G.inviteState(inv);
  const label = st === 'waiting' ? t('google.invites.waiting', { date: req.fmt.date(inv.expires_at, { month: 'short', day: 'numeric' }) })
    : st === 'joined' ? t('google.invites.joined', { username: inv.used_username || '' }) : t('google.invites.expired');
  return html`<li class="ginv ginv-${st}"><span class="ginv-who"><bdi class="ginv-email" dir="ltr">${inv.email}</bdi>${inv.roster_name || (inv.target_username && st !== 'joined') ? html`<span class="small muted">${inv.roster_name}${inv.roster_name && inv.target_username && st !== 'joined' ? ' · ' : ''}${inv.target_username && st !== 'joined' ? t('google.invites.connectsTo', { username: inv.target_username }) : ''}</span>` : ''}</span>
    <span class="chip-s">${label}</span>
    ${st === 'joined' ? '' : html`<span class="acts">${st === 'expired' ? html`<form class="inline" data-api="/api/google-invites/${inv.id}/renew" data-reload><button class="btn btn-sm" type="submit">${t('google.invites.renew')}</button></form>` : ''}
      <form class="inline" data-api="/api/google-invites/${inv.id}/revoke" data-reload data-confirm="${t('google.invites.revokeConfirm', { email: inv.email })}"><button class="btn btn-sm" type="submit">${t('google.invites.revoke')}</button></form></span>`}</li>`;
}
function inviteList(req, list) {
  if (!list.length) return '';
  const items = list.map(inv => inviteLine(req, inv));
  const head = req.t('google.invites.listHeading', { count: list.length });
  return list.length > 5 ? html`<details class="ginvites"><summary>${head}</summary><ul class="plain">${items}</ul></details>`
    : html`<div class="ginvites"><h3>${head}</h3><ul class="plain">${items}</ul></div>`;
}

/** Students tab: invite by school Google email. */
export function classInvitesPanel(req, c, s) {
  if (!googleEnabled()) return '';
  const t = req.t; const domains = G.schoolDomains(s);
  if (!domains.length) {
    const link = S.canManageSchool(req.user, s.id) ? html`<a href="/school/${s.slug}?tab=settings#google">${t('google.invites.settingsLink')}</a>` : null;
    return html`<section class="panel" id="google-invites"><h2>🔐 ${t('google.invites.heading')}</h2>
      <p class="small muted">${link ? tHtml(t, 'google.invites.noDomainsAdmin', { link }) : t('google.invites.noDomainsTeacher')}</p></section>`;
  }
  return html`<section class="panel" id="google-invites"><h2>🔐 ${t('google.invites.heading')}</h2>
    <p class="small muted">${t('google.invites.text')}</p>
    <form class="formgrid" data-api="/api/classes/${c.id}/google-invites" data-reload novalidate>
      <div class="field wide"><label for="gi-e">${t('google.invites.label')}</label>
        <textarea class="input" id="gi-e" name="emails" rows="4" dir="ltr" required placeholder="${t('google.invites.placeholder', { domain: domains[0] })}"></textarea>
        <span class="err" id="gi-e-err" aria-live="polite"></span><span class="hint">${t('google.invites.hint', { domains: domainList(req, domains) })}</span></div>
      <div class="formacts"><button class="btn btn-primary" type="submit">${t('google.invites.submit')}</button></div></form>
    <p class="small muted">${t('google.invites.howTo')} <a href="/google-setup">${t('google.invites.setupLink')}</a></p>
    ${inviteList(req, G.invitesOfClass(c.id))}</section>`;
}
/** The join-code panel's Google option (off by default, only once the school has Google domains). */
export function classGoogleJoin(req, c, s) {
  if (!googleEnabled()) return '';
  const t = req.t; const domains = G.schoolDomains(s); if (!domains.length) return '';
  const host = (config.publicUrl || '').replace(/^https?:\/\//, '') || req.get('host');
  return html`<form class="gjoin" data-api="/api/classes/${c.id}/google-join" data-reload>
      <input type="hidden" name="on" value="${c.google_join ? '0' : '1'}">
      <p class="small">${c.google_join ? t('google.classJoin.isOn', { domains: domainList(req, domains) }) : t('google.classJoin.isOff', { domains: domainList(req, domains) })}</p>
      <button class="btn btn-sm" type="submit">${c.google_join ? t('google.classJoin.turnOff') : t('google.classJoin.turnOn')}</button>
      <p class="small muted">${tHtml(t, 'google.classJoin.address', { url: html`<bdi dir="ltr">${host}/join</bdi>` })}</p></form>`;
}
/** For a roster: { ids: Map userId -> identity, waiting: Map userId -> email }, or null while Google is off. */
export function googleRosterInfo(ids) {
  if (!googleEnabled()) return null;
  return { ids: G.identitiesOf(ids), waiting: G.pendingAttach(ids) };
}
/** The small line under a name: "Google: ana@dwes.org" or "Google: waiting (ana@dwes.org)". */
export function googleRosterLine(req, info, p) {
  if (!info) return '';
  const ident = info.ids.get(p.id); const w = info.waiting.get(p.id);
  if (ident) return html`<span class="gline small muted">${req.t('google.roster.connected', { email: ltr(ident.email) })}</span>`;
  if (w) return html`<span class="gline small muted">${req.t('google.roster.waiting', { email: ltr(w) })}</span>`;
  return '';
}
/** Row-menu items for a school account: connect a school Google account, or remove Google sign-in. */
export function googleRowMenu(req, info, p, { connectApi, removeApi, s }) {
  if (!info || p.managed_school !== s.id || !G.schoolDomains(s).length) return '';
  const t = req.t; const ident = info.ids.get(p.id); const id = `ga-${p.id}`;
  if (ident) return html`<form data-api="${removeApi}" data-reload data-confirm="${t('google.attach.removeConfirm', { name: nameOf(p) })}"><button class="btn btn-sm" type="submit">${t('google.attach.remove')}</button></form>`;
  return html`<span class="lbl" aria-hidden="true">${t('google.attach.heading')}</span><form class="row" data-api="${connectApi}" data-reload novalidate><label class="sr-only" for="${id}">${t('google.attach.label', { name: nameOf(p) })}</label><input class="input input-sm grow" id="${id}" name="email" type="email" dir="ltr" placeholder="${t('google.attach.placeholder')}" required><button class="btn btn-sm" type="submit">${t('google.attach.connect')}</button><span class="err" id="${id}-err" aria-live="polite"></span></form>`;
}
/** School Settings tab: the Google domains and the trust-app helper. */
export function schoolGoogleSettings(req, s) {
  if (!googleEnabled()) return '';
  const t = req.t; const domains = G.schoolDomains(s);
  return html`<section class="panel" id="google"><h2>🔐 ${t('google.settings.heading')}</h2>
    <p class="small muted">${t('google.settings.text')}</p>
    <form class="stack" data-api="/api/schools/${s.id}/google" data-reload novalidate>
      <div class="field"><label for="gd">${t('google.settings.label')}</label>
        <input class="input" id="gd" name="domains" dir="ltr" value="${domains.join(', ')}" placeholder="${t('google.settings.placeholder')}" autocomplete="off" spellcheck="false">
        <span class="err" id="gd-err" aria-live="polite"></span><span class="hint">${t('google.settings.hint')}</span></div>
      <div><button class="btn btn-primary" type="submit">${t('school.save')}</button></div></form>
    <h3>${t('google.settings.trustHeading')}</h3><p class="small">${t('google.setup.trust.p1')}</p>
    <ol class="gsteps small">${trustSteps(req)}</ol>
    <p class="small"><a href="/google-setup">${t('google.settings.forward')}</a></p></section>`;
}
/** People tab: invite a teacher or school admin by school Google email. */
export function staffGoogleInvites(req, s) {
  if (!googleEnabled()) return '';
  const t = req.t; const domains = G.schoolDomains(s); if (!domains.length) return '';
  return html`<section class="panel" id="google-staff"><h3>🔐 ${t('google.staff.heading')}</h3>
    <p class="small muted">${t('google.staff.text')}</p>
    <form class="formgrid" data-api="/api/schools/${s.id}/google-invites" data-reload novalidate>
      <div class="field"><label for="gs-e">${t('google.staff.email')}</label><input class="input" id="gs-e" name="email" type="email" dir="ltr" required placeholder="${t('google.invites.placeholderOne', { domain: domains[0] })}"><span class="err" id="gs-e-err" aria-live="polite"></span></div>
      <div class="field"><label for="gs-n">${t('school.people.realName')}</label><input class="input" id="gs-n" name="rosterName" maxlength="60" required><span class="err" id="gs-n-err" aria-live="polite"></span></div>
      <div class="field"><label for="gs-r">${t('school.people.role')}</label><select class="input" id="gs-r" name="role"><option value="teacher">${t('school.roles.teacher')}</option><option value="admin">${t('school.roles.admin')}</option></select></div>
      <p class="err form-err" aria-live="polite"></p>
      <div class="formacts"><button class="btn btn-primary" type="submit">${t('google.staff.submit')}</button></div></form>
    ${inviteList(req, G.staffInvitesOf(s.id))}</section>`;
}
