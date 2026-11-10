// A first live game in under three minutes (docs/decisions.md "A first live game in under 3 minutes").
//
//   GET  /teachers/host            "Host a live game now": signed out (or a guest) -> a three-field teacher sign-up
//                                  (name, username, password, and the "teacher, 18 or older" box); a host -> /live/quick;
//                                  a child's account -> "ask your teacher for the code" (kids never host).
//   POST /api/teachers/host-signup the sign-up: a staff account in a school of one (as /trial makes, with no checkout,
//                                  no email and no plan), signed in, on to /live/quick. The same address limits as
//                                  every other sign-up.
//   GET  /live/quick               the "Quick game" chooser: a live mode and ready questions from the question bank
//                                  (subject, level), the last pick preselected; ?class=<id> opens it for a class.
//   POST /api/live/quick           opens the room ({ mode, subject, level, classId?, last? }); last=1 is the class
//                                  card's one tap: the last pick again (or the standard one).
// The room is an ordinary live room (services/classlive-sessions.js): without a class it is an open room, where every
// player is a guest with a generated name; with a class, only that class's signed-in students join and they see "Your
// teacher started a live game" on their class page (routes/schools.js classLiveBanner). Nothing here sends anything to
// an AI. Everything answers 404 while LIVE_CLASSROOM=0.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, signedOut } from '../views/layout.js';
import * as auth from '../auth.js';
import { audit } from '../db.js';
import { tHtml } from '../i18n/index.js';
import * as S from '../services/schools.js';
import * as LS from '../services/classlive-sessions.js';
import * as A from '../services/classlive-access.js';
import * as R from '../services/classlive-results.js';
import * as ST from '../services/classlive-settings.js';
import * as funnel from '../services/funnel.js';
import { cleanText } from '../services/textfilter.js';
import { rateLimit, allow, count, ipOf, SIGNUP } from '../services/ratelimit.js';
import { pickerFor, SUBJECTS, LEVELS } from '../live/bank/index.js';

export const router = Router();
export const HOST_URL = '/teachers/host';
export const QUICK_URL = '/live/quick';
/** How many questions a quick game asks. */
export const QUICK_COUNT = 10;
const on = (req, res, next) => (LS.liveOn() ? next() : next('router'));
const HEAD = '<link rel="stylesheet" href="/css/quick-live.css">';
const el = (t, tag, key, vars = {}, attrs = '') => raw(`<${tag}${attrs}${t.own(key) ? '' : ' lang="en" dir="ltr"'}>${tHtml(t, key, vars)}</${tag}>`);
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const MODE_ICON = { battle: '⚡', 'quest-race': '🏝️' };
const MODE_KEY = { battle: 'battle', 'quest-race': 'questRace' };

/** The question bank level that fits a class's grade ("3", "Grade 5", "K"); null when the grade says nothing. */
export function levelForGrade(grade) {
  const g = String(grade ?? '').trim();
  if (/^(k|kg|kindergarten|pre-?k)$/i.test(g)) return 'a6';
  const m = /\d{1,2}/.exec(g);
  if (!m) return null;
  const n = +m[0];
  return n <= 1 ? 'a6' : n <= 3 ? 'a8' : n <= 5 ? 'a10' : n <= 12 ? 'a12' : null;
}
/** The quick pick for this host (and class): the last one used, else Question Battle, a bit of everything, the class's level. */
export function quickPick(u, c = null) {
  const last = (ST.loadPrefs(u.id) || {}).quick || null;
  const p = last || { mode: ST.QUICK_MODES[0], subject: 'mixed', level: 'a8' };
  // A class's own grade wins over the level of the last game (which may have been another class's).
  const level = (c && levelForGrade(c.grade)) || p.level;
  return { mode: p.mode, subject: p.subject, level, remembered: !!last };
}
/** "Question Battle · Science · Ages 8–9" in the page's language. */
export function pickLine(req, p) {
  const bank = pickerFor(req.locale);
  const subject = p.subject === 'mixed' ? bank.mixed : (bank.subjects.find(x => x.id === p.subject) || {}).name || bank.mixed;
  return [req.t(`live.mode.${MODE_KEY[p.mode]}`), subject, (bank.levels.find(x => x.id === p.level) || {}).name].filter(Boolean).join(' · ');
}
const classFor = (u, id) => { const c = id ? S.getClass(String(id)) : null; return c && !c.archived_at && S.teaches(u, c.id) ? c : null; };

// ---------------------------------------------------------------- /teachers/host: the way in
router.get(HOST_URL, on, (req, res) => {
  const t = req.t, u = req.user;
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
  if (A.canHost(u)) return res.redirect(302, QUICK_URL);
  const show = body => page(req, res, { title: t('quickLive.host.title'), description: t('quickLive.host.lead'), head: HEAD, body: html`<div class="ql">${body}</div>`, seo: { index: false, path: HOST_URL } });
  // A child's account (or a school student): kids never host. They join with the code.
  if (!signedOut(u)) {
    return show(html`<section class="panel" role="status"><h1>📡 ${el(t, 'span', 'quickLive.kid.h')}</h1>${el(t, 'p', 'quickLive.kid.p')}
      <p class="ql-last"><a class="btn btn-primary btn-big" href="/join">${t('quickLive.join')}</a></p></section>`);
  }
  if (req.method === 'GET') funnel.bump('quick.view');
  const errs = id => raw(`<span class="err" id="${id}-err" aria-live="polite"></span>`);
  show(html`<h1>📡 ${el(t, 'span', 'quickLive.host.h')}</h1>${el(t, 'p', 'quickLive.host.lead', {}, ' class="lead"')}
  <ol class="ql-steps">${[1, 2, 3].map(n => el(t, 'li', `quickLive.host.step${n}`))}</ol>
  <section class="panel" aria-labelledby="ql-su-h"><h2 id="ql-su-h">${el(t, 'span', 'quickLive.signup.h')}</h2>
    <form data-api="/api/teachers/host-signup" id="ql-signup" novalidate>
      <input type="hidden" name="tz" data-browser-tz>
      <div class="field">${el(t, 'label', 'plans.trial.signup.name', {}, ' for="ql-name"')}<input class="input" id="ql-name" name="name" required maxlength="60" autocomplete="name" aria-describedby="ql-name-hint">
        ${el(t, 'span', 'plans.trial.signup.nameHint', {}, ' class="hint" id="ql-name-hint"')}${errs('ql-name')}</div>
      <div class="field">${el(t, 'label', 'plans.trial.signup.username', {}, ' for="ql-username"')}<input class="input" id="ql-username" name="username" required minlength="3" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" dir="ltr" aria-describedby="ql-username-hint">
        ${el(t, 'span', 'plans.trial.signup.usernameHint', {}, ' class="hint" id="ql-username-hint"')}${errs('ql-username')}</div>
      <div class="field">${el(t, 'label', 'plans.trial.signup.password', {}, ' for="ql-password"')}<input class="input" id="ql-password" name="password" type="password" required minlength="${auth.STAFF_PASSWORD_MIN}" maxlength="72" autocomplete="new-password" dir="ltr" aria-describedby="ql-password-hint">
        ${el(t, 'span', 'plans.trial.signup.passwordHint', { min: auth.STAFF_PASSWORD_MIN }, ' class="hint" id="ql-password-hint"')}${errs('ql-password')}</div>
      <div class="field"><label class="checkline"><input type="checkbox" id="ql-adult" name="adult" value="1" required> ${el(t, 'span', 'plans.trial.signup.adult')}</label>${errs('ql-adult')}</div>
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-big" type="submit">${t('quickLive.signup.submit')}</button>
      ${el(t, 'p', 'quickLive.signup.privacy', { privacy: '/privacy?for=grownups' }, ' class="small muted ql-last"')}
    </form></section>
  <p class="ql-alt">${el(t, 'span', 'quickLive.signup.have', { login: `/login?next=${encodeURIComponent(QUICK_URL)}` })}</p>
  <p class="ql-alt">${el(t, 'span', 'quickLive.signup.student')} <a href="/join">${t('quickLive.join')}</a></p>`);
});

/** The short teacher sign-up: { name, username, password, adult, tz? }. The account is an ordinary account that is the
 *  admin (and only member) of a school of its own, exactly what /trial makes, so it is staff: it can host, make classes
 *  and login cards, and it has no friends and no chat (services/schools.js noFriendsAccount). */
router.post('/api/teachers/host-signup', on, rateLimit('host-signup', 30, 3600e3), (req, res) => {
  const t = req.t, b = req.body || {}, ip = ipOf(req);
  if (!signedOut(req.user)) return res.status(409).json({ error: t('plans.trial.errors.signedIn'), redirect: HOST_URL });
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return res.status(429).json({ error: t('auth.api.tooManySignups') });
  const errors = {};
  const name = clip(b.name, 60);
  // The name is what a class sees as its teacher: the same word and contact rules as anything else a child may read.
  if (name.length < 2 || !cleanText(name, 60, t).ok) errors.name = t('plans.trial.errors.name');
  const n = auth.cleanName(b.username, t);
  if (!n.ok) errors.username = n.error;
  else if (auth.getUserByName(n.value) || auth.isRetiredName(n.value)) errors.username = t('auth.api.nameTaken');
  const pw = String(b.password ?? '');
  const pe = auth.checkStaffPassword(pw, n.ok ? n.value : '', t, t('plans.trial.errors.password', { min: auth.STAFF_PASSWORD_MIN }));
  if (pe) errors.password = pe;
  if (!(b.adult === '1' || b.adult === true || b.adult === 'on')) errors.adult = t('plans.trial.errors.adult');
  const fields = ['name', 'username', 'password', 'adult'].filter(k => errors[k]);
  if (fields.length) return res.status(400).json({ error: errors[fields[0]], field: fields[0], errors });
  let u;
  try { u = auth.createUser({ username: n.value, password: pw, displayName: name }); }
  catch (e) { if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' }); throw e; }
  const s = S.createSchool(u, { name: clip(t('quickLive.signup.schoolName', { name }), 80) });
  if (!s.ok) return res.status(400).json({ error: t('plans.trial.errors.name'), field: 'name' });
  S.addMember(u, s.school.id, u.id, 'admin', { rosterName: name });
  const tz = typeof b.tz === 'string' ? b.tz.trim().slice(0, 64) : '';
  if (S.isZone(tz)) S.updateSchool(u, s.school.id, { settings: { timeZone: tz } });
  audit(u.id, 'user.signup', u.id, { via: 'quick-live' });
  funnel.bump('quick.signup');
  auth.startSession(res, u.id, req.headers['user-agent'], { method: 'signup', teacherWay: true });
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  res.json({ ok: true, redirect: QUICK_URL });
});

// ---------------------------------------------------------------- /live/quick: the chooser
const hostOnly = (req, res, next) => {
  if (A.canHost(req.user)) return next();
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ error: req.t('errors.api.notFound') });
  // Signed out: the short sign-up; a child's account: the join page (as /live does).
  return res.redirect(302, signedOut(req.user) ? HOST_URL : '/join');
};
router.get(QUICK_URL, on, hostOnly, (req, res) => {
  const t = req.t, u = req.user;
  const c = classFor(u, req.query.class);
  if (req.query.class && !c) return notFound(req, res);
  const pick = quickPick(u, c);
  const bank = pickerFor(req.locale);
  const old = LS.hostSession(u.id);
  const openRoom = old && old.phase !== 'ended' ? old : null;
  const radio = (name, value, label, checked, extra = '') => html`<label class="ql-opt"><input type="radio" name="${name}" value="${value}"${checked ? raw(' checked') : ''}><span class="ql-opt-in">${label}${extra}</span></label>`;
  const recent = R.hostRuns(u.id, 3);
  res.set('Cache-Control', 'no-store');
  page(req, res, { title: t('quickLive.quick.title'), active: 'live', head: HEAD, ...(c ? { back: `/class/${c.id}`, backLabel: c.name } : {}),
    body: html`<div class="ql">
  <h1>⚡ ${el(t, 'span', 'quickLive.quick.h')}</h1>
  ${c ? el(t, 'p', 'quickLive.quick.forClass', { name: c.name }, ' class="lead" id="ql-for"') : el(t, 'p', 'quickLive.quick.open', {}, ' class="lead" id="ql-for"')}
  ${openRoom ? html`<p class="notice" id="ql-open-room" role="status">${el(t, 'span', 'quickLive.quick.hasOpen', { title: openRoom.title })} <a class="btn btn-sm" href="/live/host/${openRoom.id}">${t('teach.home.openLive')}</a></p>` : ''}
  <form class="panel ql-form" data-api="/api/live/quick" id="ql-quick" novalidate>
    ${c ? html`<input type="hidden" name="classId" value="${c.id}">` : ''}
    <fieldset class="ql-set"><legend>${el(t, 'span', 'quickLive.quick.mode')}</legend>
      <div class="ql-opts ql-modes">${ST.QUICK_MODES.map(m => radio('mode', m, html`<span class="ql-ico" aria-hidden="true">${MODE_ICON[m]}</span><b>${t(`live.mode.${MODE_KEY[m]}`)}</b>`, m === pick.mode, html`<span class="small muted">${t(`live.mode.${MODE_KEY[m]}Text`)}</span>`))}</div></fieldset>
    <fieldset class="ql-set"><legend>${el(t, 'span', 'quickLive.quick.level')}</legend>
      <div class="ql-opts">${bank.levels.map(l => radio('level', l.id, l.name, l.id === pick.level))}</div></fieldset>
    <fieldset class="ql-set"><legend>${el(t, 'span', 'quickLive.quick.subject')}</legend>
      <div class="ql-opts">${radio('subject', 'mixed', bank.mixed, pick.subject === 'mixed' || !bank.subjects.some(x => x.id === pick.subject))}${bank.subjects.map(x => radio('subject', x.id, x.name, x.id === pick.subject))}</div></fieldset>
    ${el(t, 'p', 'quickLive.quick.what', { count: QUICK_COUNT }, ' class="small muted"')}
    <p class="err form-err" aria-live="polite"></p>
    <button class="btn btn-primary btn-big" type="submit" id="ql-go">▶ ${t('quickLive.quick.go')}</button>
  </form>
  <p class="ql-alt"><a href="/live${c ? `?class=${c.id}` : ''}">${t('quickLive.quick.more')}</a></p>
  ${recent.length ? html`<section class="panel" aria-labelledby="ql-recent-h"><h2 id="ql-recent-h">${el(t, 'span', 'quickLive.quick.recent')}</h2>
    <ul class="plain ql-recent">${recent.map(r => html`<li><a href="/live/results/${r.id}"><bdi>${r.title}</bdi></a> <span class="small muted">${req.fmt.day(r.ended_at)} · ${t('live.results.playersCount', { count: r.players })}</span></li>`)}</ul></section>` : ''}
</div>` });
});

router.post('/api/live/quick', on, hostOnly, rateLimit('lv-new', 30, 3600e3), (req, res) => {
  const t = req.t, u = req.user, b = req.body || {};
  const c = classFor(u, b.classId);
  if (b.classId && !c) return res.status(404).json({ error: t('errors.api.notFound') });
  const base = quickPick(u, c);
  // last=1 (a class card's one tap): the remembered pick as it is. Otherwise the form's fields, each checked.
  const pick = b.last ? base : {
    mode: ST.QUICK_MODES.includes(b.mode) ? b.mode : base.mode,
    subject: b.subject === 'mixed' || SUBJECTS.includes(String(b.subject)) ? String(b.subject) : base.subject,
    level: LEVELS.includes(String(b.level)) ? String(b.level) : base.level,
  };
  const r = LS.createSession(u, { mode: pick.mode, audience: c ? 'class' : 'open', classId: c ? c.id : null, starter: `bank:${pick.subject}:${pick.level}:${QUICK_COUNT}`, lang: req.locale });
  if (!r.ok) {
    // A room is open already: back to it (a room with players in it is never ended by a tap somewhere else).
    if (r.code === 'hasOpen') { const old = LS.get(r.sid); return res.json({ ok: true, sid: r.sid, redirect: `/live/host/${r.sid}`, toast: t('quickLive.quick.hasOpen', { title: old ? old.title : '' }), already: true }); }
    const status = { off: 404, notHost: 404, notFound: 404, busy: 503 }[r.code] || 400;
    return res.status(status).json({ error: t(`live.api.${r.code}`), code: r.code });
  }
  try { ST.saveQuickPref(u.id, pick); } catch { /* not important */ }
  funnel.bump('quick.room');
  res.json({ ok: true, sid: r.session.id, redirect: `/live/host/${r.session.id}` });
});
