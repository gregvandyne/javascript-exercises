// Homeroom, step 3c: the pages a helper opens from a link (docs/decisions.md "Homeroom: supports, aides and sub links").
// Aides (services/homeroom-aides.js):
//   GET  /hr/aide/:token             the invite: who it is from and Join (signed in to a staff account), else Sign in
//   POST /api/hr/aide/:token         take the invite -> { redirect } to the class's Homeroom
// Subs (services/homeroom-sub.js; no account):
//   GET  /sub/:token                 the link: its PIN first when it has one, else straight on (sets the hr_sub cookie)
//   POST /api/sub/open               { token, pin } -> the cookie, { redirect: '/sub' }
//   GET  /sub                        the sub's page (public/js/homeroom-sub.js)
//   GET  /api/sub/state?v=           the sub's board (services/homeroom-sub.js subView)
//   POST /api/sub/live               { action: start | bring | back | pause | resume | end }
//   POST /api/sub/plan               { action: start | more | next }
//   POST /api/sub/hands              { action: answer | pass | notNow | back, studentId }
//   POST /api/sub/attendance         { studentId, status: absent | home | '' (here), tz } for today (step 4c)
//   POST /api/sub/asks               { id }: a question from home answered
//   POST /api/sub/leave              forget the link on this device
// A sub's other Homeroom addresses (the projector view, its poll) are let through by routes/homeroom.js's gate.
// Tokens are never logged or kept: only their hash is stored, the address bar loses the token after the first open
// (a redirect), and every response here is no-store and no-referrer.
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { ico } from '../views/icon.js';
import { page, VERSION } from '../views/layout.js';
import { wordmark } from '../views/brand.js';
import { config } from '../config.js';
import { rateLimit, allow } from '../services/ratelimit.js';
import { parseCookies } from '../auth.js';
import * as H from '../services/homeroom.js';
import * as HA from '../services/homeroom-aides.js';
import * as SB from '../services/homeroom-sub.js';
import * as S from '../services/schools.js';

export const router = Router();
const STATUS = { notFound: 404, forbidden: 403, locked: 423, gone: 410 };
const body = req => (req.body && typeof req.body === 'object' ? req.body : {});
const quiet = res => res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
const on = (req, res, next) => (H.on() ? next() : next('router'));
const CSS = () => raw(`<link rel="stylesheet" href="/css/manipulatives.css?v=${VERSION}"><link rel="stylesheet" href="/css/homeroom.css?v=${VERSION}">`);
const fmtDay = (req, at, tz) => { try { return new Intl.DateTimeFormat(req.locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: tz }).format(new Date(at)); } catch { return new Date(at).toDateString(); } };
const fmtTime = (req, at, tz) => { try { return new Intl.DateTimeFormat(req.locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(at)); } catch { return ''; } };

// ---------------------------------------------------------------- aides: the invite link
const calm = (req, res, { icon, title, text, extra = '' }, status = 200) => page(req, res, { title, bare: true, bodyClass: 'hs-page', head: CSS(),
  body: html`<div class="hs hr-helppage"><header class="hs-top"><span class="hs-brand" aria-hidden="true">${wordmark()}</span></header>
    <div class="hr-helpcard"><div class="hr-helpico">${ico(icon, { size: 56 })}</div><h1 class="hs-h">${title}</h1><p class="hs-lead">${text}</p>${extra}</div></div>` }, status);
router.get('/hr/aide/:token', on, rateLimit('hr-aide-open', 60, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  quiet(res);
  const t = req.t, x = HA.inviteOf(req.params.token);
  if (!x) return calm(req, res, { icon: '🔗', title: t('homeroom.helpers.inviteGoneTitle'), text: t('homeroom.helpers.inviteGoneText') }, 410);
  const u = req.user && !req.user.is_guest ? req.user : null;
  const signIn = html`<a class="btn btn-primary hs-big" href="/login?next=${encodeURIComponent(`/hr/aide/${req.params.token}`)}">${t('homeroom.helpers.inviteSignIn')}</a>`;
  const join = html`<button class="btn btn-primary hs-big" type="button" id="hr-aidejoin" data-token="${req.params.token}">${ico('🤝', { size: 20 })} ${t('homeroom.helpers.inviteJoin')}</button><p class="err" id="hr-aideerr" aria-live="polite"></p>
    <script type="module">const b=document.getElementById('hr-aidejoin');b.addEventListener('click',async()=>{b.disabled=true;try{const r=await fetch('/api/hr/aide/'+encodeURIComponent(b.dataset.token),{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'same-origin'});const j=await r.json();if(r.ok&&j.redirect){location.href=j.redirect;return;}document.getElementById('hr-aideerr').textContent=j.error||'';}catch{}b.disabled=false;});</script>`;
  const who = u ? (HA.adultStaff(u) ? join : html`<p class="notice warn">${t('homeroom.helpers.inviteNotStaff')}</p>`) : signIn;
  calm(req, res, { icon: '🤝', title: t('homeroom.helpers.inviteTitle', { class: x.c.name }), text: t('homeroom.helpers.inviteText'), extra: html`<div class="hr-helpacts">${who}</div>` });
});
router.post('/api/hr/aide/:token', on, rateLimit('hr-aide-join', 30, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  quiet(res);
  if (!req.user || req.user.is_guest) return res.status(401).json({ error: req.t('homeroom.errors.notAdult'), code: 'notAdult' });
  const r = HA.accept(req.user, req.params.token);
  if (!r.ok) return res.status(r.code === 'inviteGone' ? 410 : 403).json({ error: req.t(`homeroom.errors.${r.code}`), code: r.code });
  res.json({ ok: true, redirect: `/class/${r.c.id}/hub` });
});

// ---------------------------------------------------------------- subs: the one-day link
const cookie = (res, value, untilMs) => res.append('Set-Cookie', `${SB.COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((untilMs - Date.now()) / 1000))}${config.env === 'production' ? '; Secure' : ''}`);
const subOf = req => SB.subFromCookie(parseCookies(req)[SB.COOKIE]);
/** The calm page for a link that does not work now: not yet (its day), ended, revoked, locked. */
function notNow(req, res, r) {
  const t = req.t, st = SB.stateOf(r), c = S.getClass(r.class_id), tz = c ? SB.zoneFor(c) : 'UTC';
  if (st === 'later') return calm(req, res, { icon: '📅', title: t('homeroom.sub.laterTitle'), text: t('homeroom.sub.laterText', { day: fmtDay(req, r.starts_at, tz) }) });
  const key = st === 'locked' ? 'locked' : st === 'revoked' ? 'revoked' : 'ended';
  return calm(req, res, { icon: st === 'locked' ? '🔒' : '🔗', title: t(`homeroom.sub.${key}Title`), text: t(`homeroom.sub.${key}Text`) }, 410);
}
router.get('/sub/:token', on, rateLimit('hr-sub-open', 60, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  quiet(res);
  const t = req.t, r = SB.linkOfToken(req.params.token);
  if (!r) return calm(req, res, { icon: '🔗', title: t('homeroom.sub.goneTitle'), text: t('homeroom.sub.goneText') }, 404);
  if (SB.stateOf(r) !== 'active') return notNow(req, res, r);
  if (!r.pin_hash) {
    cookie(res, SB.cookieValue(req.params.token, r), r.ends_at);
    SB.log(r, 'open');
    return res.redirect(303, '/sub');
  }
  page(req, res, { title: t('homeroom.sub.pinTitle'), bare: true, bodyClass: 'hs-page', head: CSS(), scripts: ['/js/homeroom-sub.js'],
    body: html`${jsonData('page-data', { pin: true })}<div class="hs hr-helppage"><header class="hs-top"><span class="hs-brand" aria-hidden="true">${wordmark()}</span></header>
      <form class="hr-helpcard hr-subpin" id="hr-subpin" data-token="${req.params.token}" novalidate>
        <div class="hr-helpico">${ico('🔑', { size: 56 })}</div><h1 class="hs-h">${t('homeroom.sub.pinTitle')}</h1><p class="hs-lead">${t('homeroom.sub.pinLead')}</p>
        <label class="sr-only" for="hr-subpinin">${t('homeroom.sub.pinLabel')}</label>
        <input class="input hs-codein" id="hr-subpinin" inputmode="numeric" autocomplete="off" maxlength="8" dir="ltr" required>
        <p class="err" id="hr-subpinerr" aria-live="polite"></p><button class="btn btn-primary hs-big" type="submit">${t('homeroom.sub.pinGo')}</button></form></div>` });
});
router.post('/api/sub/open', on, rateLimit('hr-sub-pin', 30, 900e3, 'errors.api.slowDown', { byIp: true }), (req, res) => {
  quiet(res);
  const x = body(req), token = String(x.token || ''), r = SB.linkOfToken(token);
  if (!r || SB.stateOf(r) !== 'active') return res.status(410).json({ error: req.t('homeroom.sub.endedText'), code: 'gone' });
  // (per link too: a PIN guessed from many places still locks the link)
  if (!allow(`hr-sub-pin-link:${r.id}`, 20, 900e3)) return res.status(429).json({ error: req.t('errors.api.slowDown') });
  const p = SB.tryPin(r, x.pin);
  if (!p.ok) return res.status(STATUS[p.code] || 400).json({ error: req.t(`homeroom.sub.errors.${p.code}`), code: p.code });
  cookie(res, SB.cookieValue(token, r), r.ends_at);
  SB.log(r, 'open');
  res.json({ ok: true, redirect: '/sub' });
});

// ---------------------------------------------------------------- subs: the page and its calls
const subGate = (req, res, next) => {
  quiet(res);
  const x = subOf(req);
  if (!x) return req.originalUrl.startsWith('/api/') ? res.status(403).json({ error: req.t('homeroom.sub.endedText'), code: 'subEnded' }) : calm(req, res, { icon: '🔗', title: req.t('homeroom.sub.endedTitle'), text: req.t('homeroom.sub.endedText') }, 403);
  req.hrSub = x;
  next();
};
router.use(['/sub', '/api/sub'], on);
router.get('/sub', subGate, (req, res) => {
  const t = req.t, x = req.hrSub, tz = SB.zoneFor(x.c);
  page(req, res, {
    title: t('homeroom.sub.pageTitle', { class: x.c.name }), bare: true, bodyClass: 'hr-page hr-subpage', scripts: ['/js/homeroom-sub.js'], i18n: ['js.homeroom-area', 'js.homeroom-plan', 'js.homeroom-look'], head: CSS(),
    body: html`${jsonData('page-data', { classId: x.c.id, className: x.c.name, note: x.link.note, until: fmtTime(req, x.link.ends_at, tz), endOfDay: SB.localDay(tz, x.link.ends_at) !== SB.localDay(tz, x.link.ends_at - 1), state: SB.subView(x) })}
    <div class="hr-sub" id="hr-sub">
      <header class="hr-subtop">
        <span class="hr-subcls" dir="auto">${x.c.name}</span><span class="hr-aidechip hr-subchip">${ico('🧑‍🏫', { size: 18 })} ${t('homeroom.sub.chip')}</span>
        <span class="hr-livedot" id="hr-live" hidden>${t('homeroom.live')}</span>
        <span class="hr-subplan" id="hr-subplan"></span>
        <span class="hr-grow"></span>
        <span class="hr-livebtns" id="hr-sublive"></span>
        <a class="btn hr-chunk" href="/class/${x.c.id}/hub/projector" target="_blank" rel="noopener" aria-label="${t('homeroom.sub.projector')}" title="${t('homeroom.sub.projector')}">${ico('📽️', { size: 18 })}<span class="hr-subt"> ${t('homeroom.sub.projector')}</span></a>
        <button class="btn hr-chunk" type="button" data-sub="leave" aria-label="${t('homeroom.sub.leave')}" title="${t('homeroom.sub.leave')}">${ico('👋', { size: 18 })}<span class="hr-subt"> ${t('homeroom.sub.leave')}</span></button>
      </header>
      <div class="hr-submain" id="hr-submain"><p class="muted hr-loading">${t('homeroom.loading')}</p></div>
      <noscript><p class="notice warn">${t('homeroom.noscript')}</p></noscript>
    </div>`,
  });
});
router.get('/api/sub/state', subGate, rateLimit('hr-sub-state', 3000, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => res.json(SB.subView(req.hrSub, { v: req.query.v ?? null })));
const subSend = (req, res, r) => (r.ok ? res.json({ ok: true, state: SB.subView(req.hrSub) }) : res.status(STATUS[r.code] || 400).json({ error: req.t(`homeroom.errors.${r.code}`), code: r.code }));
router.post('/api/sub/live', subGate, rateLimit('hr-sub-act', 600, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => subSend(req, res, SB.subLive(req.hrSub, String(body(req).action || ''))));
router.post('/api/sub/plan', subGate, rateLimit('hr-sub-act', 600, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => subSend(req, res, SB.subPlan(req.hrSub, String(body(req).action || ''))));
router.post('/api/sub/hands', subGate, rateLimit('hr-sub-act', 600, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => subSend(req, res, SB.subHands(req.hrSub, { action: String(body(req).action || ''), studentId: String(body(req).studentId || '') })));
// step 4c: the sub takes attendance (Absent, At home, here) and answers questions from home, logged
router.post('/api/sub/attendance', subGate, rateLimit('hr-sub-act', 600, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => subSend(req, res, SB.subAttend(req.hrSub, { studentId: String(body(req).studentId || ''), status: String(body(req).status ?? ''), tz: String(body(req).tz || '') })));
router.post('/api/sub/asks', subGate, rateLimit('hr-sub-act', 600, 3600e3, 'errors.api.slowDown', { byIp: true }), (req, res) => subSend(req, res, SB.subAsk(req.hrSub, { id: String(body(req).id || '') })));
router.post('/api/sub/leave', (req, res) => { quiet(res); cookie(res, '', 0); res.json({ ok: true, redirect: '/' }); });
