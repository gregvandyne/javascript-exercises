// The Teacher plan's pages (rules in server/services/teacher-plan.js; docs/decisions.md "Teacher plan").
//
//   GET  /trial               the entry point the marketing site links to (also /trial?seats=N for a school):
//                               signed out (or a guest)        -> the sign-up's teacher steps (/signup/teacher?trial=1:
//                                                                 account, school, classes, Classroom), then back here
//                               a teacher with no plan          -> "Start my free trial" (work email) -> Stripe Checkout
//                                                                 with the trial and no card; a teacher whose trial is
//                                                                 used gets "Get the Teacher plan" (card) instead
//                               a school admin with ?seats=N    -> the school's free trial of N teacher seats
//                               a teacher with a plan / trial   -> My classes (/teach?plan=on#teacher-plan)
//                               a kid or a grown-up account     -> a friendly page: it's for teachers; plans for
//                                                                 families are on /plans
//   GET  /trial/thanks        Checkout's success page: confirms the session itself (like the Spark Pack return page),
//                             so the trial starts even when the webhook is slow, then My classes with a welcome.
//   POST /api/trial/signup    the sign-up form; POST /api/trial/start  the trial (or paid) Checkout;
//   GET  /api/trial/status    the return page's poll; POST /api/trial/card  Manage billing (add a card) for a teacher.
//   POST /api/billing/school/:id/seat-give, /seat-take   a school admin gives or takes back a teacher seat.
// Everything is off (a 404, or /teachers for /trial) while paid-plan pages are off for the request (familiesOn).
// While the Stripe key is a test key only billing testers may start a trial (D14): a trial is real AI money.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, signedOut } from '../views/layout.js';
import * as auth from '../auth.js';
import { audit, q } from '../db.js';
import { config } from '../config.js';
import { tHtml } from '../i18n/index.js';
import * as F from '../services/family.js';
import * as C from '../services/checkout.js';
import * as B from '../services/billing.js';
import * as SC from '../services/schools.js';
import * as SB from '../services/school-billing.js';
import * as TP from '../services/teacher-plan.js';
import { rateLimit, allow, count, ipOf, SIGNUP } from '../services/ratelimit.js';
import { stepUp, passwordField, stripeTrouble } from './family.js';
import { addressOf } from '../services/email.js';

export const router = Router();
const on = req => F.familiesOn(req);
const nope = (req, res) => res.status(404).json({ error: req.t('errors.api.notFound') });
/** A string as an element, marked English until this language has it. */
const el = (t, tag, key, vars = {}, attrs = '') => raw(`<${tag}${attrs}${t.own(key) ? '' : ' lang="en" dir="ltr"'}>${tHtml(t, key, vars)}</${tag}>`);
const err = html`<p class="err form-err" aria-live="polite"></p>`;
const CSS = html`<style>.trial{max-width:640px;margin:0 auto}.trial .plan-list{margin:var(--s3) 0}.trial .lead{margin-bottom:var(--s3)}
.trial form .field{margin-bottom:var(--s3)}.teacherplan .planchip{margin-inline-end:.4em}
/* The big buttons ("Create my account and start the trial") wrap inside the screen on a phone, never past its edge. */
.trial form .btn-big{width:100%;max-width:100%;white-space:normal;text-align:center;line-height:1.2;padding:12px 20px;font-size:1.2rem}
.trial form .btn-big+.small{margin-top:16px}
.trial .panel{min-width:0}.trial .input{max-width:100%}</style>`;
/** The admin schools of a user (to start a school's seat trial from /trial?seats=N). */
const adminSchools = u => (u ? SC.adminSchools(u) : []);
const seatsQuery = v => { const n = SB.seatsFrom(v); return n != null && n >= 1 && n <= TP.MAX_TEACHER_SEATS ? n : null; };
const trialVars = (f, price) => ({ days: config.teacherTrialDays, daily: f.int(config.teacherDailyMessages), price: price ? f.money(price.unitAmount) : '' });
const items = list => html`<ul class="plan-list">${list.map(s => html`<li><span class="tick" aria-hidden="true">✓</span><span>${s}</span></li>`)}</ul>`;

/** What /trial shows to whom: 'out' | 'teacher' | 'other' (a kid, a grown-up, a school student, the platform admin who
 *  isn't staff). */
export function trialViewer(u) {
  if (signedOut(u)) return 'out';
  if (TP.isTeacher(u)) return 'teacher';
  return 'other';
}

// ---------------------------------------------------------------- /trial
router.get('/trial', async (req, res) => {
  if (!on(req)) return res.redirect(302, '/teachers#start');
  const t = req.t, f = req.fmt, u = req.user;
  res.set('Cache-Control', 'no-store');
  const who = trialViewer(u);
  const seats = seatsQuery(req.query.seats);
  // Signed out: the one sign-up (routes/onboarding.js), which comes back here once the teacher's steps are done.
  if (who === 'out') return res.redirect(302, `/signup/teacher?trial=1${seats ? `&seats=${seats}` : ''}`);
  const price = await TP.teacherPrice();
  const v = trialVars(f, price);
  const features = items([el(t, 'span', 'plans.trial.li1'), el(t, 'span', 'plans.trial.li2', v), el(t, 'span', 'plans.trial.li3'), el(t, 'span', 'plans.trial.li4')]);
  const head = html`<h1>🍎 ${el(t, 'span', 'plans.trial.heading', v)}</h1>${el(t, 'p', 'plans.trial.lead', v, ' class="lead"')}
    ${price ? el(t, 'p', 'plans.trial.price', v) : el(t, 'p', 'plans.noPrice', {}, ' class="muted"')}`;
  const show = (body, status = 200) => page(req, res, { title: t('plans.trial.title'), active: 'plans', description: t('plans.trial.lead', v), body: html`<div class="trial">${body}</div>`, head: CSS, seo: { index: false, path: '/trial' } }, status);

  if (who === 'other') {
    return show(html`<section class="panel" role="status"><h1>🍎 ${el(t, 'span', 'plans.trial.forTeachers.h')}</h1>${el(t, 'p', 'plans.trial.forTeachers.p')}
      <p style="margin-bottom:0"><a class="btn btn-primary" href="/plans">${t('plans.trial.forTeachers.link')}</a></p></section>`);
  }

  // A teacher (or school admin).
  const cancelled = req.query.cancelled ? el(t, 'p', 'plans.trial.cancelled', {}, ' class="notice" role="status"') : '';
  const notOpen = !C.mayBill(u) ? el(t, 'p', 'plans.trial.notOpen', {}, ' class="notice warn" role="status"') : '';
  // ?seats=N from a school admin: the school's own trial of N teacher seats.
  const school = seats ? adminSchools(u).find(s => SC.canManageSchool(u, s.id)) : null;
  if (school) {
    const plan = B.ownerPlan('school', school.id);
    if (plan.entitled) return res.redirect(302, `/school/${encodeURIComponent(school.slug)}?tab=billing`);
    const used = TP.trialUsed({ schoolId: school.id });
    return show(html`${head}${cancelled}${notOpen}<section class="panel">${features}</section>
      <section class="panel" aria-labelledby="st-h"><h2 id="st-h">${el(t, 'span', 'plans.trial.school.h')}</h2>
      ${used ? el(t, 'p', 'plans.trial.used.school') : el(t, 'p', 'plans.trial.school.p', { ...v, school: school.name, seats: t('plans.trial.teachersN', { count: seats }) })}
      ${used ? html`<p style="margin-bottom:0"><a class="btn btn-primary" href="/school/${encodeURIComponent(school.slug)}?tab=billing">${t('plans.trial.school.billing')}</a></p>`
        : html`<form data-api="/api/trial/start" novalidate><input type="hidden" name="seats" value="${seats}"><input type="hidden" name="school" value="${school.id}">${err}
          <button class="btn btn-primary btn-big" type="submit"${!C.mayBill(u) || !price ? raw(' disabled') : ''}>${t('plans.trial.school.start')}</button></form>`}</section>`);
  }
  const plan = TP.teacherPlan(u.id);
  if (plan.entitled) return res.redirect(302, '/teach?plan=on#teacher-plan');
  if (C.unsettledPlanOf('teacher', u.id)) return res.redirect(302, '/teach#teacher-plan');
  const used = TP.trialUsed({ userId: u.id });
  // The address we already know for this account (Google's, or the school step's), filled in to save typing.
  const known = (addressOf(u.id) || {}).email || '';
  const email = html`<div class="field"><label for="tr-email">${t('plans.trial.email')}</label>
      <input class="input" id="tr-email" name="email" type="email" dir="ltr" required maxlength="254" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="tr-email-hint" value="${known}">
      ${el(t, 'span', 'plans.trial.emailHint', {}, ' class="hint" id="tr-email-hint"')}<span class="err" id="tr-email-err" aria-live="polite"></span></div>`;
  const off = !C.mayBill(u) || !price ? raw(' disabled') : '';
  const form = used
    ? html`<section class="panel" aria-labelledby="tu-h"><h2 id="tu-h">${el(t, 'span', 'plans.trial.used.h')}</h2>${el(t, 'p', 'plans.trial.used.p', v)}
        <form data-api="/api/trial/start" novalidate><input type="hidden" name="trial" value="0">${email}${passwordField(req, 'tr-pw')}${err}
        <button class="btn btn-primary btn-big" type="submit"${off}>${t('plans.trial.subscribe')}</button></form></section>`
    : html`<section class="panel" aria-labelledby="ts-h"><h2 id="ts-h">${el(t, 'span', 'plans.trial.start.h', v)}</h2>
        <form data-api="/api/trial/start" novalidate><input type="hidden" name="trial" value="1">${email}${err}
        <button class="btn btn-primary btn-big" type="submit"${off}>${t('plans.trial.start.button')}</button>
        ${el(t, 'p', 'plans.trial.start.note', v, ' class="small muted" style="margin-bottom:0"')}</form></section>`;
  show(html`${head}${cancelled}${notOpen}<section class="panel">${features}</section>${form}<p class="small">${tHtml(t, 'plans.fine.legal')}</p>`);
});

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/** The old /trial sign-up form's API (the page now leads into the one sign-up, routes/onboarding.js; this still answers a
 *  page left open from before): { name, school, email, username, password, adult, seats? }. Makes a kid-type account (teachers'
 *  accounts are ordinary accounts that are school staff), their own school with them as its school admin (a funnel
 *  "school set up"), signs them in, and goes on to /trial (which starts the Checkout from their email). */
router.post('/api/trial/signup', rateLimit('trial-signup', 30, 3600e3), async (req, res) => {
  if (!on(req)) return nope(req, res);
  const t = req.t, b = req.body || {}, ip = ipOf(req);
  if (!signedOut(req.user)) return res.status(409).json({ error: t('plans.trial.errors.signedIn'), redirect: '/trial' });
  if (!allow(`signup-try:${ip}`, SIGNUP.triesPerHour, 3600e3)) return res.status(429).json({ error: t('errors.api.slowDown') });
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return res.status(429).json({ error: t('auth.api.tooManySignups') });
  const errors = {};
  const name = clip(b.name, 60), school = clip(b.school, 80), email = TP.cleanEmail(b.email);
  if (name.length < 2) errors.name = t('plans.trial.errors.name');
  if (school.length < 2) errors.school = t('plans.trial.errors.school');
  if (!email) errors.email = t('plans.trial.errors.email');
  const n = auth.cleanName(b.username, t);
  if (!n.ok) errors.username = n.error;
  else if (auth.getUserByName(n.value) || auth.isRetiredName(n.value)) errors.username = t('auth.api.nameTaken');
  const pw = String(b.password ?? '');
  const pe = auth.checkStaffPassword(pw, n.ok ? n.value : '', t, t('plans.trial.errors.password', { min: auth.STAFF_PASSWORD_MIN }));
  if (pe) errors.password = pe;
  if (!(b.adult === '1' || b.adult === true || b.adult === 'on')) errors.adult = t('plans.trial.errors.adult');
  const fields = ['name', 'school', 'email', 'username', 'password', 'adult'].filter(k => errors[k]);
  if (fields.length) return res.status(400).json({ error: errors[fields[0]], field: fields[0], errors });
  let u;
  // The school's time zone from the teacher's browser (public/js/app.js fills it in), when it is a zone this server
  // knows: lessons open and due days end at midnight there from day one, not at midnight UTC. Anything else is ignored
  // (the school's Settings still offer it).
  const tz = typeof b.tz === 'string' ? b.tz.trim().slice(0, 64) : '';
  try { u = SC.createTeacherWithSchool({ name, school, username: n.value, password: pw, tz }).user; }
  catch (e) {
    if (/UNIQUE/.test(e.message)) return res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' });
    if (e.code === 'school') return res.status(400).json({ error: t('plans.trial.errors.school'), field: 'school' });
    throw e;
  }
  audit(u.id, 'user.signup', u.id, { via: 'trial' });
  auth.startSession(res, u.id, req.headers['user-agent'], { method: 'signup', teacherWay: true });
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  // A school's seat trial (?seats=N) goes back to /trial to confirm it. A teacher's own trial starts at once from the
  // email they typed: it goes to Stripe (the Customer), and here only as an HMAC until Stripe reports the trial started
  // (then services/nudges.js keeps it for the trial emails and a password reset: email.rememberAddress).
  const seats = seatsQuery(b.seats);
  if (!seats && C.mayBill(u)) {
    try {
      const r = await TP.startTeacherCheckout({ user: auth.getUser(u.id), email, base: C.baseUrl(req), trial: true });
      if (r.ok) return res.json({ ok: true, redirect: r.url });
    } catch { /* Stripe unreachable: /trial offers the button again */ }
  }
  res.json({ ok: true, redirect: `/trial${seats ? `?seats=${seats}` : ''}` });
});

/** Starts a Checkout: a teacher's own plan ({ email, trial: '1'|'0' }) or a school's seat trial ({ school, seats }). */
router.post('/api/trial/start', rateLimit('trial-start', 20, 600e3), async (req, res, next) => {
  if (!on(req) || !TP.isTeacher(req.user)) return nope(req, res);
  if (!C.mayBill(req.user)) return res.status(403).json({ error: req.t('plans.trial.notOpen') });
  // A paid start (no trial) is a card payment: the password typed again, like every other plan.
  const b = req.body || {};
  if (!b.school && b.trial === '0') return stepUp(req, res, next);
  next();
}, async (req, res) => {
  const t = req.t, b = req.body || {}, u = req.user;
  const fail = r => res.status(r.field ? 400 : 409).json({ error: t(`plans.trial.errors.${r.code}`, { max: TP.MAX_TEACHER_SEATS }), ...(r.field ? { field: r.field } : {}) });
  try {
    if (b.school) {
      const s = SC.getSchool(String(b.school));
      if (!s || s.archived_at || !SC.canManageSchool(u, s.id)) return nope(req, res);
      const r = await SB.startSchoolCheckout({ school: s, user: u, seats: SB.seatsFrom(b.seats), base: C.baseUrl(req), trial: true });
      return r.ok ? res.json({ ok: true, redirect: r.url }) : fail(r);
    }
    const r = await TP.startTeacherCheckout({ user: u, email: b.email, base: C.baseUrl(req), trial: b.trial !== '0' });
    return r.ok ? res.json({ ok: true, redirect: r.url }) : fail(r);
  } catch (e) { stripeTrouble(req, res, e); }
});

/** The return page's poll: { state: 'active' | 'processing' | 'not_yours' }. */
router.get('/api/trial/status', rateLimit('trial-status', 60, 60e3), async (req, res) => {
  if (!on(req) || !TP.isTeacher(req.user)) return nope(req, res);
  const id = typeof req.query.checkout === 'string' ? req.query.checkout : '';
  res.set('Cache-Control', 'no-store').json({ state: await C.checkoutReturnFor('teacher', req.user.id, id) });
});

/** Checkout's success page. The session must name this teacher (or one of the schools they run). */
router.get('/trial/thanks', async (req, res) => {
  if (!on(req)) return res.redirect(302, '/teachers#start');
  const t = req.t, u = req.user;
  const id = typeof req.query.checkout === 'string' ? req.query.checkout.slice(0, 200) : '';
  if (signedOut(u)) return res.redirect(302, `/login?next=${encodeURIComponent(`/trial/thanks?checkout=${id}`)}`);
  if (!TP.isTeacher(u)) return res.redirect(302, '/trial');
  res.set('Cache-Control', 'no-store');
  const state = await C.checkoutReturnFor('teacher', u.id, id);
  if (state === 'active') return res.redirect(302, '/teach?plan=welcome#teacher-plan');
  if (state === 'not_yours') {
    // A school's seat trial started from /trial?seats=N.
    for (const s of adminSchools(u)) {
      if (await C.checkoutReturnFor('school', s.id, id) === 'active') return res.redirect(302, `/school/${encodeURIComponent(s.slug)}?tab=billing&checkout=${encodeURIComponent(id)}`);
    }
  }
  const body = html`<div class="trial"><section class="panel" aria-labelledby="th-h"><h1 id="th-h">🍎 ${el(t, 'span', 'plans.trial.title')}</h1>
    <div class="notice" role="status" data-checkout-wait="${id}" data-status-url="/api/trial/status" data-back="/teach?plan=welcome#teacher-plan">
      ${el(t, 'p', 'plans.trial.thanks.wait', {}, ' style="margin:0"')}
      <div data-slow hidden>${el(t, 'p', 'plans.trial.thanks.slow', {}, ' class="small" style="margin:.5em 0 0"')}
        <p class="small" style="margin:.5em 0 0"><a href="/teach#teacher-plan">${t('plans.trial.thanks.back')}</a></p></div></div></section></div>`;
  page(req, res, { title: t('plans.trial.title'), active: 'plans', body, head: CSS, scripts: ['/js/family.js'], seo: { index: false, path: '/trial/thanks' } });
});

/** Manage billing for a teacher's own plan (add a card during the trial, cancel, receipts): Stripe's Customer Portal. */
router.post('/api/trial/card', rateLimit('billing-portal', 20, 600e3), (req, res, next) => {
  if (!on(req) || !TP.isTeacher(req.user)) return nope(req, res);
  if (!C.mayBill(req.user)) return res.status(403).json({ error: req.t('plans.trial.notOpen') });
  next();
}, stepUp, async (req, res) => {
  try {
    const r = await C.startPortalFor({ kind: 'teacher', id: req.user.id, user: req.user, returnUrl: `${C.baseUrl(req)}/teach#teacher-plan` });
    if (!r.ok) return res.status(409).json({ error: req.t('plans.trial.errors.noCustomer') });
    res.json({ ok: true, redirect: r.url });
  } catch (e) { stripeTrouble(req, res, e); }
});

// ---------------------------------------------------------------- school seats (the Billing tab's list)
const seatGate = (req, res, next) => {
  const s = SC.getSchool(req.params.id);
  if (!s || s.archived_at || !req.user || req.user.is_guest || !on(req) || !SC.canManageSchool(req.user, s.id) || auth.isGrownup(req.user)) return nope(req, res);
  req.school = s; next();
};
for (const [verb, fn] of [['give', TP.assignSeat], ['take', TP.unassignSeat]]) {
  router.post(`/api/billing/school/:id/seat-${verb}`, seatGate, rateLimit('billing-seat', 120, 3600e3), (req, res) => {
    const r = fn(req.user, req.school.id, String((req.body || {}).user || ''));
    if (!r.ok) return res.status(409).json({ error: req.t(`school.billing.tp.errors.${r.code}`) });
    res.json({ ok: true, toast: req.t(`school.billing.tp.seat.${r.did === 'already' ? 'given' : r.did}`) });
  });
}

// ---------------------------------------------------------------- My classes' Teacher plan card
/** The Teacher plan on a teacher's My classes (/teach): the plan and its trial, today's shared messages, the trial
 *  notice with "Add a card", Manage billing; a welcome after Checkout; for a teacher without one, "Try it free".
 *  Only while paid-plan pages are on for this request. */
export function teacherPlanCard(req) {
  const t = req.t, f = req.fmt, u = req.user;
  if (!on(req) || !TP.isTeacher(u)) return '';
  const plan = TP.teacherPlan(u.id);
  const v = { days: config.teacherTrialDays, daily: f.int(config.teacherDailyMessages) };
  const parts = [];
  if (plan.entitled) {
    if (req.query.plan === 'welcome') parts.push(el(t, 'p', 'plans.trial.welcome', v, ' class="notice good" role="status"'));
    else if (req.query.plan === 'on') parts.push(el(t, 'p', 'plans.trial.already', {}, ' class="notice" role="status"'));
    const sub = plan.subscription;
    let state;
    if (plan.via === 'grant') state = el(t, 'span', 'plans.trial.card.grant', { date: f.date(plan.grant.until) });
    else if (plan.trialing) state = el(t, 'span', 'plans.trial.card.trial', { date: f.date(plan.trialEnd) });
    else if (sub && sub.cancel_at_period_end) state = el(t, 'span', 'plans.trial.card.ends', { date: f.date(sub.current_period_end) });
    else if (sub) state = el(t, 'span', 'plans.trial.card.renews', { date: f.date(sub.current_period_end) });
    parts.push(html`<p><span class="planchip paid">${t('plans.teacher.name')}</span> ${plan.via === 'seat' ? el(t, 'span', 'plans.trial.card.seat', { school: plan.school.name }) : state || ''}</p>`);
    const pool = TP.poolOf(u.id);
    parts.push(el(t, 'p', 'plans.trial.card.pool', { left: f.int(pool.left), size: f.int(pool.size) }, ' class="small"'));
    const notice = plan.via === 'own' ? TP.trialNotice(plan) : null;
    if (notice) parts.push(el(t, 'p', 'plans.trial.card.ending', { count: notice.days }, ' class="notice warn" role="status"'));
    if (plan.via === 'own' && B.customerOf('teacher', u.id) && C.mayBill(u)) {
      parts.push(html`<form data-api="/api/trial/card" class="planform">${passwordField(req, 'tp-pw')}${err}
        <button class="btn ${notice || plan.trialing ? 'btn-primary' : ''}" type="submit">${t(plan.trialing ? 'plans.trial.card.addCard' : 'plans.trial.card.manage')}</button></form>`);
    }
  } else {
    const unsettled = C.unsettledPlanOf('teacher', u.id);
    if (unsettled && unsettled.payment_pending) parts.push(el(t, 'p', 'plans.trial.card.pending'));
    else if (unsettled) {
      parts.push(el(t, 'p', 'plans.trial.card.fix', {}, ' class="notice warn"'));
      if (C.mayBill(u)) parts.push(html`<form data-api="/api/trial/card" class="planform">${passwordField(req, 'tp-pw')}${err}<button class="btn btn-primary" type="submit">${t('plans.trial.card.manage')}</button></form>`);
    } else {
      const used = TP.trialUsed({ userId: u.id });
      parts.push(el(t, 'p', used ? 'plans.trial.card.getText' : 'plans.trial.card.tryText', v));
      parts.push(html`<p style="margin-bottom:0"><a class="btn btn-primary" href="/trial">${t(used ? 'plans.trial.subscribe' : 'plans.trial.card.try', v)}</a></p>`);
    }
  }
  return html`<section class="panel teacherplan" id="teacher-plan" aria-labelledby="tpl-h"><h2 id="tpl-h">🍎 ${el(t, 'span', 'plans.trial.card.heading')}</h2>${parts}</section>`;
}
