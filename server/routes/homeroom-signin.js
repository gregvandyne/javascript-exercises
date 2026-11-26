// Homeroom step 1c: quick sign-in for a class on shared devices (services/homeroom-signin.js; docs/decisions.md
// "Homeroom, step 1c"). Behind the Homeroom flag; everyone the gates refuse gets the site's normal 404.
// The class's teachers (services/homeroom.js canUseClass):
//   GET  /api/homeroom/:id/signin                       the class sign-in: { signin: { open, code, until, url, shown, qr } }
//   POST /api/homeroom/:id/signin                       { action: open | close }
//   GET  /class/:id/homeroom/signin                     the Sign-in panel: the code and QR, each student's way to sign in,
//                                                       new picture passwords, unlock, sign-in cards
//   POST /api/homeroom/:id/signin/students/:uid         { mode: password | picture }
//   POST /api/homeroom/:id/signin/students/:uid/picture a new picture password (-> its card)
//   POST /api/homeroom/:id/signin/students/:uid/unlock  after too many wrong pictures
//   POST /api/homeroom/:id/signin/cards                 cards for the whole class (new picture passwords)
//   GET  /class/:id/homeroom/signin/cards/:k            the printable cards (once, for the teacher who made them)
// Anyone, on a shared device (public/js/homeroom-signin.js):
//   GET  /hr                                            the sign-in page (the QR code opens /hr#<code>)
//   POST /api/hr/open                                   { code } -> the class's name and its name buttons (display names)
//   POST /api/hr/signin                                 { code, k, password | pics } -> signed in, to their desk
// A student signed in here (a class-device session):
//   POST /api/desk/:id/switch                           "Not you? Switch": signed out, back to the names (the code kept)
import { Router } from 'express';
import { html, raw, jsonData, esc } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION } from '../views/layout.js';
import { wordmark } from '../views/brand.js';
import { iconHtml } from '../../public/js/icons.js';
import { rateLimit, allow, count, ipOf, loginLockKey } from '../services/ratelimit.js';
import * as auth from '../auth.js';
import * as H from '../services/homeroom.js';
import * as SI from '../services/homeroom-signin.js';
import * as S from '../services/schools.js';
import * as G from '../services/google.js';
import { qrSvg } from '../services/qr.js';
import { requestOrigin } from '../services/frame.js';
import { siteHost } from '../site.js';
import { googleEnabled } from '../oidc.js';
import { googleButton, classSignInHooks } from './google.js';
import { LOGIN } from './auth.js';
import { homeroomTabs } from './homeroom.js';

export const router = Router();
const STATUS = { notFound: 404, tooMany: 429, wait: 429, locked: 423 };
const fail = (req, res, code, x = {}) => res.status(STATUS[code] || 400).json({ error: req.t(`homeroom.signin.errors.${code}`), code, ...x });
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});
const CSS = () => raw(`<link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`);

// ---------------------------------------------------------------- the teacher's side
const gate = (req, res, next) => {
  const c = S.getClass(req.params.id);
  if (!H.canUseClass(req.user, c)) return next('router');
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  req.homeroomClass = c;
  next();
};
router.use(['/class/:id/hub/signin', '/api/homeroom/:id/signin'], gate);

/** What the teacher's sign-in box and the projector show: the code, the QR code of /hr#<code>, the short address. */
export function signinView(req, classId, { qr = true } = {}) {
  const s = SI.signinOf(classId);
  if (!s.open) return { open: false };
  const origin = requestOrigin(req).replace(/\/$/, '');
  const url = `${origin}/hr#${s.code}`;
  return { open: true, code: s.code, until: s.until, url, shown: `${siteHost(req).replace(/^www\./, '')}/hr`, ...(qr ? { qr: qrSvg(url, { title: req.t('homeroom.signin.qrLabel') }) } : {}) };
}
router.get('/api/homeroom/:id/signin', (req, res) => res.json({ signin: signinView(req, req.homeroomClass.id) }));
router.post('/api/homeroom/:id/signin', rateLimit('homeroom-signin', 120, 3600e3), (req, res) => {
  const a = String(body(req).action || ''), c = req.homeroomClass;
  if (!['open', 'close'].includes(a)) return fail(req, res, 'badAction');
  const r = a === 'open' ? SI.openSignin(req.user, c) : SI.closeSignin(req.user, c);
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, signin: signinView(req, c.id), toast: req.t(a === 'open' ? 'homeroom.signin.opened' : 'homeroom.signin.closed') });
});

const picRow = (req, pics, size = 40) => raw(pics.map((k, i) => `<span class="hs-cardpic"><span class="hs-cardn">${i + 1}</span>${iconHtml(SI.PICTURES.find(p => p.key === k).emoji, { size, label: req.t(`homeroom.signin.pics.${k}`) })}<span class="hs-cardpicname">${esc(req.t(`homeroom.signin.pics.${k}`))}</span></span>`).join(''));

router.get('/class/:id/hub/signin', (req, res) => {
  const t = req.t, c = req.homeroomClass;
  const rows = SI.teacherRows(c), v = signinView(req, c.id), early = SI.earlyGrade(c.grade);
  const base = `/api/homeroom/${c.id}/signin/students`;
  const status = r => (r.mode !== 'picture' ? (r.hasPassword ? t('homeroom.signin.panel.usesPassword') : t('homeroom.signin.panel.usesGoogle'))
    : r.locked ? t('homeroom.signin.panel.locked') : r.wait ? t('homeroom.signin.panel.waiting') : r.picture ? t('homeroom.signin.panel.hasPicture') : t('homeroom.signin.panel.noPicture'));
  const modeBtn = (r, m) => html`<button class="hs-seg" type="submit" name="mode" value="${m}" aria-pressed="${r.mode === m}"${r.mode === m ? raw(' disabled') : ''}>${t(`homeroom.signin.panel.mode.${m}`)}</button>`;
  page(req, res, {
    title: t('homeroom.signin.panel.title', { class: c.name }), active: 'classes', bodyClass: 'hs-teach', head: CSS(), scripts: ['/js/homeroom-signin-panel.js'],
    body: html`${jsonData('page-data', { classId: c.id, signin: v })}
    <div class="hs-panel">
      <div class="hs-panelhead">${homeroomTabs(req, c, 'homeroom')}<a class="btn hr-chunk" href="/class/${c.id}/hub"><span class="flip" aria-hidden="true">←</span> ${t('homeroom.signin.panel.back')}</a></div>
      <h1>${ico('🔑', { size: 32 })} ${t('homeroom.signin.panel.heading')}</h1>
      <p class="muted">${t('homeroom.signin.panel.lead')}</p>
      <section class="hs-box" id="hs-box" aria-labelledby="hs-boxh"><h2 id="hs-boxh">${t('homeroom.signin.title')}</h2><div id="hs-code"></div></section>
      <section class="hs-box" aria-labelledby="hs-stuh">
        <div class="hs-stuhead"><h2 id="hs-stuh">${t('homeroom.signin.panel.students')}</h2>
          ${rows.length ? html`<form data-api="/api/homeroom/${c.id}/signin/cards" data-confirm="${t('homeroom.signin.panel.cardsConfirm')}"><button class="btn hr-chunk hr-spark" type="submit">${ico('🖨️', { size: 18 })} ${t('homeroom.signin.panel.cards')}</button></form>` : ''}</div>
        ${early ? html`<p class="notice small" id="hs-early">${t('homeroom.signin.panel.early')}</p>` : ''}
        ${rows.length ? html`<ul class="plain hs-rows">${rows.map(r => html`<li class="hs-row" data-sid="${r.id}">
          <div class="hs-who"><b dir="auto">${r.name}</b>${r.shows !== r.name ? html`<span class="small muted">${t('homeroom.signin.panel.shows', { name: r.shows })}</span>` : ''}</div>
          ${r.picAllowed ? html`<form class="hs-segs" data-api="${base}/${r.id}" aria-label="${t('homeroom.signin.panel.modeFor', { name: r.name })}">${modeBtn(r, 'password')}${modeBtn(r, 'picture')}</form>`
            : html`<span class="small muted hs-own">${t('homeroom.signin.panel.ownAccount')}</span>`}
          <span class="hs-status small${r.locked || r.wait ? ' bad' : ''}">${status(r)}</span>
          <span class="hs-acts">
            ${r.mode === 'picture' ? html`<form data-api="${base}/${r.id}/picture" data-confirm="${t('homeroom.signin.panel.newConfirm', { name: r.name })}"><button class="btn btn-sm" type="submit">${ico('🔄', { size: 16 })} ${t(r.picture ? 'homeroom.signin.panel.newPicture' : 'homeroom.signin.panel.makePicture')}</button></form>` : ''}
            ${r.locked || r.wait ? html`<form data-api="${base}/${r.id}/unlock" data-reload><button class="btn btn-sm" type="submit">${ico('🔓', { size: 16 })} ${t('homeroom.signin.panel.unlock')}</button></form>` : ''}
          </span></li>`)}</ul>` : html`<p class="muted">${t('homeroom.signin.panel.none')}</p>`}
      </section>
    </div>`,
  });
});
const studentOf = req => String(req.params.uid || '');
const cardOf = (req, c, r) => `/class/${c.id}/hub/signin/cards/${SI.keepCards(req.user, c, [r])}`;
router.post('/api/homeroom/:id/signin/students/:uid', rateLimit('homeroom-signin-mode', 300, 3600e3), (req, res) => {
  const c = req.homeroomClass, r = SI.setMode(req.user, c, studentOf(req), String(body(req).mode || ''));
  if (!r.ok) return fail(req, res, r.code);
  const row = SI.teacherRows(c).find(x => x.id === req.params.uid);
  if (r.pics) return res.json({ ok: true, redirect: cardOf(req, c, { name: row.name, shows: row.shows, pics: r.pics }) });
  res.json({ ok: true, redirect: `/class/${c.id}/hub/signin`, toast: req.t('homeroom.signin.panel.saved') });
});
router.post('/api/homeroom/:id/signin/students/:uid/picture', rateLimit('homeroom-signin-pic', 300, 3600e3), (req, res) => {
  const c = req.homeroomClass, r = SI.newPicture(req.user, c, studentOf(req));
  if (!r.ok) return fail(req, res, r.code);
  const row = SI.teacherRows(c).find(x => x.id === req.params.uid);
  res.json({ ok: true, redirect: cardOf(req, c, { name: row.name, shows: row.shows, pics: r.pics }) });
});
router.post('/api/homeroom/:id/signin/students/:uid/unlock', rateLimit('homeroom-signin-pic', 300, 3600e3), (req, res) => {
  const r = SI.unlock(req.user, req.homeroomClass, studentOf(req));
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, toast: req.t('homeroom.signin.panel.unlocked') });
});
router.post('/api/homeroom/:id/signin/cards', rateLimit('homeroom-signin-cards', 20, 3600e3), (req, res) => {
  const c = req.homeroomClass, r = SI.classCards(req.user, c);
  if (!r.ok) return fail(req, res, r.code);
  res.json({ ok: true, redirect: `/class/${c.id}/hub/signin/cards/${SI.keepCards(req.user, c, r.cards)}` });
});
router.get('/class/:id/hub/signin/cards/:k', (req, res, next) => {
  const t = req.t, c = req.homeroomClass, cards = SI.cardsFor(req.user, c, req.params.k);
  if (!cards) return next('router');
  const site = `${siteHost(req).replace(/^www\./, '')}/hr`;
  page(req, res, {
    title: t('homeroom.signin.cards.title'), active: 'classes', bodyClass: 'hs-teach', head: CSS(), scripts: ['/js/print.js'],
    body: html`<div class="hs-panel">
      <div class="pagehead noprint hs-cardsbar"><div><h1>${ico('🪪', { size: 32 })} ${t('homeroom.signin.cards.title')}</h1><p class="muted">${t('homeroom.signin.cards.count', { count: cards.length })}</p></div>
        <div class="row"><button class="btn btn-primary hr-chunk" type="button" data-print>${ico('🖨️', { size: 18 })} ${t('homeroom.signin.cards.print')}</button><a class="btn hr-chunk" href="/class/${c.id}/hub/signin">${t('homeroom.signin.cards.back')}</a></div></div>
      <p class="notice warn noprint">${t('homeroom.signin.cards.once')}</p>
      <div class="hs-cards">${cards.map(x => html`<div class="hs-card">
        <div class="hs-cardtop"><span dir="auto">${c.name}</span><span dir="ltr">${site}</span></div>
        <div class="hs-cardname" dir="auto">${x.name}</div>
        ${x.shows !== x.name ? html`<div class="small hs-cardshows">${t('homeroom.signin.cards.tap', { name: x.shows })}</div>` : ''}
        ${x.pics ? html`<p class="small hs-cardcap">${t('homeroom.signin.cards.pictures')}</p><div class="hs-cardpics">${picRow(req, x.pics)}</div>`
          : html`<p class="hs-carduses">${ico(x.google ? '🔗' : '🔑', { size: 22 })} ${t(x.google ? 'homeroom.signin.cards.usesGoogle' : 'homeroom.signin.cards.usesPassword')}</p>`}
      </div>`)}</div></div>`,
  });
});

// ---------------------------------------------------------------- the student side
const on = (req, res, next) => (H.on() ? next() : next('router'));
const PER_IP = { codeFails: 100, tries: 1500, window: 900e3 };
const PER_CODE = { uses: 3000, picFails: 150, window: 900e3 };
const tooMany = (req, res) => fail(req, res, 'tooMany');
/** The class for a typed code, counting wrong codes per address (only wrong ones: a whole school types the right one
 *  from one address). -> the class, or null after answering. */
function codeClass(req, res) {
  const ip = ipOf(req);
  if (count(`hr-code-fail:${ip}`) >= PER_IP.codeFails || !allow(`hr-ip:${ip}`, PER_IP.tries, PER_IP.window)) { tooMany(req, res); return null; }
  const code = SI.normCode(body(req).code), c = code ? SI.classForCode(code) : null;
  if (!c) { allow(`hr-code-fail:${ip}`, PER_IP.codeFails, PER_IP.window); fail(req, res, 'badCode', { field: 'code' }); return null; }
  if (!allow(`hr-code:${code}`, PER_CODE.uses, PER_CODE.window)) { tooMany(req, res); return null; }
  return { c, code };
}

router.get('/hr', on, (req, res) => {
  const t = req.t, u = req.user && !req.user.is_guest ? req.user : null;
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  const pics = SI.PICTURES.map(p => ({ key: p.key, html: iconHtml(p.emoji, { size: 64 }), name: t(`homeroom.signin.pics.${p.key}`) }));
  page(req, res, {
    title: t('homeroom.signin.pageTitle'), bare: true, bodyClass: 'hs-page', head: CSS(), scripts: ['/js/homeroom-signin.js'],
    body: html`${jsonData('page-data', { pics, picLen: SI.PIC_LEN, codeLen: SI.CODE_LEN, google: googleEnabled() })}
    <div class="hs" id="hs">
      <header class="hs-top"><span class="hs-brand" aria-hidden="true">${wordmark()}</span><span class="hs-grow"></span>
        ${u ? html`<span class="small muted hs-signedas">${t('homeroom.signin.signedInAs', { name: u.display_name })}</span>` : ''}</header>
      ${req.query.ended === '1' ? html`<p class="notice good hs-ended" role="status">${ico('👋', { size: 20 })} ${t('homeroom.signin.ended')}</p>` : ''}
      <div class="hs-main" id="hs-main">
        <form class="hs-step hs-codeform" id="hs-codeform" novalidate>
          <h1 class="hs-h">${t('homeroom.signin.codeHeading')}</h1>
          <p class="hs-lead">${t('homeroom.signin.codeLead')}</p>
          <label class="sr-only" for="hs-codein">${t('homeroom.signin.codeLabel')}</label>
          <input class="input hs-codein" id="hs-codein" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" dir="ltr" inputmode="text" required>
          <p class="err hs-err" id="hs-codeerr" aria-live="polite"></p>
          <button class="btn btn-primary hs-big" type="submit">${t('homeroom.signin.go')}</button>
        </form>
      </div>
      <template id="hs-google">${googleEnabled() ? googleButton(req, '/auth/google/start') : ''}</template>
      <noscript><p class="notice warn">${t('homeroom.noscript')}</p></noscript>
    </div>`,
  });
});

router.post('/api/hr/open', on, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const r = codeClass(req, res); if (!r) return;
  res.json({ ok: true, className: r.c.name, students: SI.nameGrid(r.c, r.code, { googleOf: id => !!G.identityOf(id) }) });
});

router.post('/api/hr/signin', on, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const r = codeClass(req, res); if (!r) return;
  const { c, code } = r, b = body(req), ip = ipOf(req);
  // The sign-in page's own limits, the same buckets, so this door never buys more guesses than /login.
  const failKey = `login-ip-fail:${ip}`;
  if (count(failKey) >= LOGIN.ipFails || !allow(`login-ip:${ip}`, LOGIN.ipTries, LOGIN.window)) return tooMany(req, res);
  const u = SI.studentForKey(c, code, b.k);
  if (!u) return fail(req, res, 'notFound');
  const how = SI.howOf(c, u);
  if (how.mode === 'picture') {
    if (count(`hr-pic-fail:${code}`) >= PER_CODE.picFails) return tooMany(req, res);
    const chk = SI.checkPictures(c, u, b.pics);
    if (!chk.ok) {
      if (chk.code === 'wrongPictures') { allow(`hr-pic-fail:${code}`, PER_CODE.picFails, PER_CODE.window); allow(failKey, LOGIN.ipFails, LOGIN.window); }
      return fail(req, res, chk.code, chk.wait ? { wait: Math.ceil(chk.wait / 1000) } : {});
    }
  } else {
    const lockKey = loginLockKey(u.username);
    if (count(lockKey) >= LOGIN.userFails) return tooMany(req, res);
    if (!auth.verifyPassword(u, b.password)) {
      allow(failKey, LOGIN.ipFails, LOGIN.window); allow(lockKey, LOGIN.userFails, LOGIN.window);
      return fail(req, res, 'wrongPassword', { field: 'password' });
    }
  }
  if (u.banned) return fail(req, res, 'notFound');
  if (req.user) auth.endSession(req, res);
  const sid = auth.startSession(res, u.id, req.headers['user-agent']);
  SI.markDevice(sid, c);
  auth.clearEnded(req, res);
  res.json({ ok: true, redirect: `/class/${c.id}/desk` });
});

// Google from the class's sign-in page (routes/google.js): the code says which class; a student of it gets a
// class-device session and their desk.
classSignInHooks.classFor = code => SI.classForCode(code);
classSignInHooks.mark = (sid, user, classId) => (SI.markGoogleDevice(sid, user, classId) ? `/class/${classId}/desk` : null);

// ---------------------------------------------------------------- Not you? Switch
router.post('/api/desk/:id/switch', (req, res, next) => {
  const c = S.getClass(req.params.id);
  if (!H.canUseDesk(req.user, c) || SI.deviceClass(req.sessionId) !== c.id) return next('router');
  const s = SI.signinOf(c.id);
  auth.endSession(req, res);
  res.json({ ok: true, redirect: s.open ? `/hr#${s.code}` : '/hr' });
});
