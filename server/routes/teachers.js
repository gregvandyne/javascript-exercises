// /teachers (what Oomba Academy does in a classroom) and the subject pages /learn/<hub> (server/learn.js). Public pages
// written for teachers and for search engines. Every claim here is something the site does today; a feature that is
// off on this server (Sign in with Google, paid plans) is left out of the text, not described.
//
// Games are listed only when they are an official launch game anyone may open now (canView for a signed-out visitor):
// never a game a child made. The text is under teachers.* and learn.* in the locale files. Until a language has it, a
// paragraph shows the English, marked lang="en" dir="ltr", and search engines are told the page is English only.
import { liveOn } from '../services/classlive-sessions.js';
import { canHost, GROWNUP_OPEN_MAX, capacityFor } from '../services/classlive-access.js';
import { LIMITS as SET_LIMITS } from '../services/classlive-sets.js';
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page, notFound, parentsLabel, signedOut, VERSION } from '../views/layout.js';
import { coverArt, gameCard, rail } from '../views/components.js';
import { courseRow } from '../views/courses.js';
import * as courses from '../services/courses.js';
import { log } from '../services/log.js';
import { liveGameOf } from '../live/live-games.js';
import { tHtml, availableLocales } from '../i18n/index.js';
import { config } from '../config.js';
import { googleEnabled } from '../oidc.js';
import { familiesOn } from '../services/family.js';
import { isGrownup, noteTeacherWay, cleanName, getUserByName, isRetiredName, checkStaffPassword, startSession, STAFF_PASSWORD_MIN } from '../auth.js';
import { audit } from '../db.js';
import { rememberAddress, addressOf } from '../services/email.js';
import { isSchoolStaff, isPlatformAdmin, schoolsOf, classesOf, canManageSchool, createTeacherWithSchool, getSchool, staffName } from '../services/schools.js';
import * as SR from '../services/school-requests.js';
import { allow, count, ipOf, SIGNUP } from '../services/ratelimit.js';
import { siteHost } from '../site.js';
import * as games from '../services/games.js';
import * as seo from '../seo.js';
import { howArt, howSteps, howHead, HOW_SCRIPT } from '../views/how.js';
import * as OT from '../standards/official-tags.js';
import { normId as stdNorm } from '../standards/ccss.js';
import { codeChips, attribution as stdNotice } from '../views/standards.js';
import { HUBS, hubBySlug, LEARNING, TEACHER_GAMES, HUB_FAQ, TEACHER_FAQ, HOME_TIPS, AGES, gradeBand, SUBJECTS, SHELF_INFO, shelfGrades, TWO_PLAYER } from '../learn.js';
import { teacherLoop } from '../views/teacher-loop.js';
import { loopLinks } from '../services/teach-loop.js';
import { LOOP_CSS } from './teach-loop.js';
import { enabled as classroomOn } from '../services/gclassroom.js';

export const router = Router();
export const contactEmail = () => config.contactEmail || 'greg@oomba.ai';
const OG_DIR = new URL('../../public/og/', import.meta.url);
/** Is there a share picture for this launch game (scripts/og-images.js)? */
export const fsOg = slug => fs.existsSync(new URL(`${slug}.jpg`, OG_DIR));
// The one-minute demo video on /teachers/live (public/video, made by recording the real app: docs/decisions.md).
const VIDEO_DIR = new URL('../../public/video/', import.meta.url);
const hasDemo = fs.existsSync(new URL('oomba-demo.mp4', VIDEO_DIR)) && fs.existsSync(new URL('oomba-demo-poster.jpg', VIDEO_DIR));
/** The demo video: no sound, its captions burned in and also as a track, with a written description of what it shows. */
function demoVideo(req) {
  if (!hasDemo) return '';
  const t = req.t;
  return html`<section class="lp-sec lp-demo" id="demo" aria-labelledby="demo-h">
    ${el(t, 'h2', 'teachersLive.demo.h', {}, ' id="demo-h"')}
    <video class="lp-video" controls muted playsinline preload="none" width="1280" height="720" poster="/video/oomba-demo-poster.jpg" aria-describedby="demo-note">
      <source src="/video/oomba-demo.mp4" type="video/mp4">
      <track kind="captions" src="/video/oomba-demo.en.vtt" srclang="en" label="English">
    </video>
    ${el(t, 'p', 'teachersLive.demo.note', {}, ' class="small" id="demo-note"')}
  </section>`;
}

/** lang/dir for an element whose text is still the English (see routes/info.js). */
export const fb = (t, key) => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
/** One string as an element, marked when it is the English fallback. */
export const el = (t, tag, key, vars, attrs = '') => raw(`<${tag}${attrs}${fb(t, key)}>${tHtml(t, key, vars)}</${tag}>`);
/** A page's links stay in the language address the reader came in on (/es/learn/… -> /es/g/…). */
export const lp = (req, path) => (req.pathLocale && seo.localizable(path) ? seo.localeUrl(path, req.pathLocale) : path);

/** An official launch game a signed-out visitor may open, in the page's language; null otherwise. */
export function launchGame(slug) {
  const g = games.getGameBySlug(slug);
  if (!g || g.source !== 'seed' || !games.canView(null, g)) return null;
  return games.localizeGame(g);
}
/** FAQ pairs [question key, answer key] -> markup, plus the plain text for FAQPage structured data. */
export function faqBlock(req, pairs, headingKey, vars = {}) {
  const t = req.t;
  return {
    markup: html`<section class="panel faq lp-faq" id="faq" aria-labelledby="faq-h">${el(t, 'h2', headingKey, {}, ' id="faq-h"')}
      ${pairs.map(([qk, ak]) => html`${el(t, 'h3', qk)}${el(t, 'p', ak, vars)}`)}</section>`,
    ld: seo.faqLd(pairs.map(([qk, ak]) => [t(qk), seo.plainText(t(ak, vars))])),
  };
}

// ---------------------------------------------------------------------------------------------------- "Set up my school"
/** Who may send the "Set up my school" form: an adult or someone signed out (a guest included). Never a kid's own or
 *  school account: the site doesn't ask a child for an email (docs/decisions.md "Doors for grown-ups"). */
export const maySetUpSchool = u => signedOut(u) || isGrownup(u) || isSchoolStaff(u) || isPlatformAdmin(u);
/** Stored requests per address per hour, and from everyone per day; tries (any post, a robot's or one with a mistake)
 *  per address per hour. Only a stored request spends the first two, like sign-up (routes/auth.js SIGNUP), so a
 *  teacher fixing typos isn't locked out and junk posts can't use up the day's requests for every school. */
export const SETUP_LIMITS = { perIpHour: 5, perDay: 200, triesPerIpHour: 100 };
/** The teacher page a form came from (/teachers or /<lang>/teachers), for the no-JavaScript reply. */
const setupBack = v => (/^\/(?:[a-z]{2,3}(?:-[A-Za-z]{2,4})?\/)?teachers$/.test(String(v || '')) ? String(v) : '/teachers');

/** The form (or its thank-you) inside the "Set up your school" panel. */
function setupBlock(req, { sent = false, failed = false } = {}) {
  const t = req.t;
  if (sent) {
    return html`<div class="notice good sr-thanks" role="status" id="setup-thanks">
      ${raw(`<h3${fb(t, 'teachers.setup.thanks.h')}><span aria-hidden="true">✅</span> ${tHtml(t, 'teachers.setup.thanks.h')}</h3>`)}
      ${el(t, 'p', 'teachers.setup.thanks.p1')}${el(t, 'p', 'teachers.setup.thanks.p2')}
      ${el(t, 'h4', 'teachers.setup.thanks.todayH', {}, ' class="sr-today-h"')}
      <ul class="lp-list sr-today">
        ${liveOn() ? html`<li>${tHtml(t, 'teachers.setup.thanks.todayLive', { href: lp(req, '/teachers/live') })}</li>` : ''}
        <li>${tHtml(t, 'teachers.setup.thanks.todayPlay', { href: lp(req, '/teachers#play') })}</li>
        <li>${tHtml(t, 'teachers.setup.thanks.todayHow', { href: lp(req, '/teachers#how-it-works') })}</li>
      </ul></div>`;
  }
  if (!maySetUpSchool(req.user)) return el(t, 'p', 'teachers.setup.kid', {}, ' class="notice"');
  const back = lp(req, '/teachers');
  const lab = (id, key) => el(t, 'label', key, {}, ` for="${id}"`);
  const errs = id => raw(`<span class="err" id="${id}-err" aria-live="polite"></span>`);
  const u = req.user;
  // Account first (docs/decisions.md "Account first: set up your school"): signed out, the form makes the teacher's
  // account and their school at once; a teacher who already runs a school tells us about it. A grown-up (parent)
  // account, or the platform admin, still sends a plain request (family accounts never join a school).
  const signup = signedOut(u);
  const mine = !signup && isSchoolStaff(u) ? schoolsOf(u.id).filter(x => x.role !== 'student' && canManageSchool(u, x.id)) : [];
  const staffForm = mine.length > 0;
  const knownEmail = staffForm ? ((addressOf(u.id) || {}).email || '') : '';
  return html`${el(t, 'p', signup ? 'teachers.setup.leadSignup' : staffForm ? 'teachers.setup.leadStaff' : 'teachers.setup.lead')}
    <form class="sr-form" data-api="/api/teachers/school-request" data-next="${signup ? '/teach?welcome=school' : `${back}?sent=1#start`}" method="post" action="/api/teachers/school-request" novalidate>
      <input type="hidden" name="back" value="${back}">
      ${signup ? html`<input type="hidden" name="tz" data-browser-tz><input type="hidden" name="signup" value="1">` : ''}
      <div class="sr-grid">
        ${staffForm ? html`<div class="field">${lab('sr-school-id', 'teachers.setup.yourSchool')}
          <select class="input" id="sr-school-id" name="schoolId">${mine.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>${errs('sr-school-id')}</div>`
        : html`<div class="field">${lab('sr-name', signup ? 'plans.trial.signup.name' : 'teachers.setup.name')}
          <input class="input" id="sr-name" name="name" maxlength="${SR.LIMITS.name}" autocomplete="name"${signup ? raw(' required') : ''}>${errs('sr-name')}</div>
        <div class="field">${lab('sr-school', 'teachers.setup.school')}
          <input class="input" id="sr-school" name="school" required minlength="2" maxlength="${SR.LIMITS.school}" autocomplete="organization">${errs('sr-school')}</div>`}
        <div class="field">${lab('sr-role', 'teachers.setup.role')}
          <select class="input" id="sr-role" name="role" required><option value="">${t('teachers.setup.rolePick')}</option>${SR.ROLES.map(r => html`<option value="${r}">${t(`teachers.setup.roles.${r}`)}</option>`)}</select>${errs('sr-role')}</div>
        <div class="field">${lab('sr-email', 'teachers.setup.email')}
          <input class="input" id="sr-email" name="email" type="email" dir="ltr" required maxlength="${SR.LIMITS.email}" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="sr-email-hint" value="${knownEmail}">
          ${el(t, 'span', signup || staffForm ? 'teachers.setup.emailHintSignup' : 'teachers.setup.emailHint', {}, ' class="hint" id="sr-email-hint"')}${errs('sr-email')}</div>
        <div class="field">${lab('sr-students', 'teachers.setup.students')}
          <input class="input" id="sr-students" name="students" type="number" inputmode="numeric" required min="1" max="${SR.LIMITS.studentsMax}" step="1">${errs('sr-students')}</div>
        <div class="field">${lab('sr-country', 'teachers.setup.country')}
          <input class="input" id="sr-country" name="country" required minlength="2" maxlength="${SR.LIMITS.country}" autocomplete="country-name">${errs('sr-country')}</div>
      </div>
      ${signup ? html`<fieldset class="sr-account"><legend>${t('teachers.setup.accountH')}</legend>
        <p class="small muted">${tHtml(t, 'teachers.setup.accountLead', { login: `/login?next=${encodeURIComponent(back + '#start')}` })}</p>
        <div class="sr-grid">
        <div class="field">${lab('sr-username', 'plans.trial.signup.username')}
          <input class="input" id="sr-username" name="username" required minlength="3" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false" dir="ltr" aria-describedby="sr-username-hint">
          ${el(t, 'span', 'plans.trial.signup.usernameHint', {}, ' class="hint" id="sr-username-hint"')}${errs('sr-username')}</div>
        <div class="field">${lab('sr-password', 'plans.trial.signup.password')}
          <input class="input" id="sr-password" name="password" type="password" required minlength="${STAFF_PASSWORD_MIN}" maxlength="72" autocomplete="new-password" dir="ltr" aria-describedby="sr-password-hint">
          ${el(t, 'span', 'plans.trial.signup.passwordHint', { min: STAFF_PASSWORD_MIN }, ' class="hint" id="sr-password-hint"')}${errs('sr-password')}</div>
        </div>
        <div class="field"><label class="checkline"><input type="checkbox" id="sr-adult" name="adult" value="1" required> ${el(t, 'span', 'plans.trial.signup.adult')}</label>${errs('sr-adult')}</div>
      </fieldset>` : ''}
      <div class="sr-hp" aria-hidden="true"><label for="sr-website">Website</label><input id="sr-website" name="website" tabindex="-1" autocomplete="off"></div>
      ${failed ? el(t, 'p', 'teachers.setup.errors.again', {}, ' class="err"') : ''}
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-big" type="submit">${t(signup ? 'teachers.setup.submitSignup' : staffForm ? 'teachers.setup.submitStaff' : 'teachers.setup.submit')}</button>
      ${el(t, 'p', signup || staffForm ? 'teachers.setup.privacySignup' : 'teachers.setup.privacy', { privacy: '/privacy?for=grownups#schoolSetup' }, ' class="small muted"')}
    </form>`;
}

// No JavaScript: the form posts as a plain form (urlencoded) and gets a page back, not JSON.
router.post('/api/teachers/school-request', express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 20 }), (req, res) => {
  const t = req.t; const body = req.body || {};
  const plain = !req.is('application/json');
  const back = setupBack(body.back);
  const fail = (status, error, field = null) => (plain ? res.redirect(303, `${back}?failed=1#start`) : res.status(status).json(field ? { error, field } : { error }));
  if (!maySetUpSchool(req.user)) return plain ? res.redirect(303, `${back}#start`) : res.status(404).json({ error: t('errors.api.notFound') });
  const ip = ipOf(req);
  if (!allow(`school-request-try:${ip}`, SETUP_LIMITS.triesPerIpHour, 3600e3)) return fail(429, t('teachers.setup.errors.slow'));
  const ok = () => (plain ? res.redirect(303, `${back}?sent=1#start`) : res.json({ ok: true }));
  if (String(body.website || '').trim()) return ok();   // a robot filled the hidden field: thanked, not stored
  if (count(`school-request:${ip}`) >= SETUP_LIMITS.perIpHour) return fail(429, t('teachers.setup.errors.slow'));
  if (count('school-request:all') >= SETUP_LIMITS.perDay) return fail(429, t('teachers.setup.errors.busyToday'));
  // Account first, signed out: their account and their school now, the request linked to both.
  if (signedOut(req.user) && body.signup === '1') return schoolSignup(req, res, { body, plain, back, ip, fail });
  // A teacher who runs a school tells us about it: the request is linked to that school.
  if (body.schoolId !== undefined && req.user && isSchoolStaff(req.user)) {
    const sc = getSchool(String(body.schoolId));
    if (!sc || !canManageSchool(req.user, sc.id)) return fail(400, t('teachers.setup.errors.school'), 'schoolId');
    const r = SR.createRequest({ ...body, school: sc.name, name: staffName(req.user) || req.user.display_name }, { by: req.user, locale: req.locale, schoolId: sc.id });
    if (!r.ok) {
      if (!r.field) return fail(503, t('teachers.setup.errors.full'));
      if (plain) return fail(400);
      const errors = Object.fromEntries(r.fields.map(f => [f, t(`teachers.setup.errors.${f}`)]));
      return res.status(400).json({ error: errors[r.field], field: r.field, errors });
    }
    rememberAddress(req.user.id, body.email, 'school-request');
    allow(`school-request:${ip}`, SETUP_LIMITS.perIpHour, 3600e3);
    allow('school-request:all', SETUP_LIMITS.perDay, 86400e3);
    return ok();
  }
  // Only an adult account's id is kept with the request: a guest may be a child (see services/school-requests.js).
  const r = SR.createRequest(body, { by: signedOut(req.user) ? null : req.user, locale: req.locale });
  if (!r.ok) {
    if (!r.field) return fail(503, t('teachers.setup.errors.full'));
    if (plain) return fail(400);
    const errors = Object.fromEntries(r.fields.map(f => [f, t(`teachers.setup.errors.${f}`)]));
    return res.status(400).json({ error: errors[r.field], field: r.field, errors });
  }
  // Sent signed out (or as a guest): whoever signs up on this browser next is probably this teacher (services/team.js).
  if (signedOut(req.user)) noteTeacherWay(res);
  allow(`school-request:${ip}`, SETUP_LIMITS.perIpHour, 3600e3);
  allow('school-request:all', SETUP_LIMITS.perDay, 86400e3);
  ok();
});

/** "Set up your school", signed out: checks every field at once (school details and the account), makes the
 *  teacher's account and their school (they are its school admin), keeps the email for the account (password resets,
 *  the welcome), stores the request linked to both, signs them in and sends them to their Classroom. */
function schoolSignup(req, res, { body, plain, back, ip, fail }) {
  const t = req.t;
  if (count(`signup:${ip}`) >= SIGNUP.perHour) return fail(429, t('auth.api.tooManySignups'));
  const v = SR.validate(body);
  const errors = {};
  if (!v.ok) for (const f of v.fields) errors[f] = t(`teachers.setup.errors.${f}`);
  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (name.length < 2) errors.name = t('plans.trial.errors.name');
  const n = cleanName(body.username, t);
  if (!n.ok) errors.username = n.error;
  else if (getUserByName(n.value) || isRetiredName(n.value)) errors.username = t('auth.api.nameTaken');
  const pw = String(body.password ?? '');
  const pe = checkStaffPassword(pw, n.ok ? n.value : '', t, t('plans.trial.errors.password', { min: STAFF_PASSWORD_MIN }));
  if (pe) errors.password = pe;
  if (!(body.adult === '1' || body.adult === true || body.adult === 'on')) errors.adult = t('plans.trial.errors.adult');
  const order = ['name', 'school', 'role', 'email', 'students', 'country', 'username', 'password', 'adult'].filter(k => errors[k]);
  if (order.length) return plain ? res.redirect(303, `${back}?failed=1#start`) : res.status(400).json({ error: errors[order[0]], field: order[0], errors });
  if (SR.openCount() >= SR.MAX_OPEN) return fail(503, t('teachers.setup.errors.full'));
  let made;
  try { made = createTeacherWithSchool({ name, school: v.value.school, username: n.value, password: pw, tz: typeof body.tz === 'string' ? body.tz.trim().slice(0, 64) : '' }); }
  catch (e) {
    if (/UNIQUE/.test(e.message)) return plain ? res.redirect(303, `${back}?failed=1#start`) : res.status(400).json({ error: t('auth.api.nameTaken'), field: 'username' });
    if (e.code === 'school') return fail(400, t('teachers.setup.errors.school'), 'school');
    throw e;
  }
  const { user, school } = made;
  rememberAddress(user.id, v.value.email, 'school-request');
  SR.createRequest({ ...body, name }, { by: user, locale: req.locale, schoolId: school.id });
  audit(user.id, 'user.signup', user.id, { via: 'school-setup' });
  startSession(res, user.id, req.headers['user-agent'], { method: 'signup', teacherWay: true });
  allow(`signup:${ip}`, SIGNUP.perHour, 3600e3);
  allow(`school-request:${ip}`, SETUP_LIMITS.perIpHour, 3600e3);
  allow('school-request:all', SETUP_LIMITS.perDay, 86400e3);
  return plain ? res.redirect(303, '/teach?welcome=school') : res.json({ ok: true, redirect: '/teach?welcome=school' });
}

// ---------------------------------------------------------------------------------------------------- teacher quotes
/**
 * Real teacher quotes for /teachers, supplied by the owner. EMPTY BY DEFAULT, and while it is empty the section is not
 * rendered at all (no heading, no placeholder, nothing for search engines). Only add a quote a real teacher said and
 * agreed to have published, never one written for them:
 *   { quote: 'Their words', name: 'Their name as they want it shown', role: 'Grade 4 teacher', school: 'Their school', lang: 'en' }
 * lang is the language the quote was given in (it is shown as said, not translated). A platform admin can see where the
 * section goes, with owner placeholders, at /teachers?quotes=preview; nobody else ever sees the placeholders.
 */
export const TEACHER_QUOTES = Object.freeze([]);
/** The owner's placeholders for the preview (never public, never translated). */
export const QUOTE_PLACEHOLDER = { quote: '[Owner: add a real teacher quote here, with the teacher\'s written permission]', name: '[Owner: teacher name]', role: '[Owner: role, e.g. Grade 4 teacher]', school: '[Owner: school]', lang: 'en' };
/** The quotes section: '' with no quotes, unless a platform admin asked for the preview. */
export function quotesSection(req, quotes = TEACHER_QUOTES) {
  const t = req.t;
  const preview = !quotes.length && req.query && req.query.quotes === 'preview' && isPlatformAdmin(req.user);
  const list = quotes.length ? quotes : preview ? [QUOTE_PLACEHOLDER, QUOTE_PLACEHOLDER, QUOTE_PLACEHOLDER] : [];
  if (!list.length) return '';
  return html`<section class="lp-sec lp-quotes${preview ? ' lp-quotes-preview' : ''}" id="teachers-say" aria-labelledby="quotes-h">
    ${el(t, 'h2', 'teachers.quotes.h', {}, ' id="quotes-h"')}
    ${preview ? html`<p class="notice" lang="en" dir="ltr">Owner preview: only platform admins see this. The section stays hidden until TEACHER_QUOTES in server/routes/teachers.js has real quotes.</p>` : ''}
    <ul class="lp-quote-list">${list.map(x => html`<li><figure class="panel lp-quote" lang="${x.lang || 'en'}"><blockquote><p>${x.quote}</p></blockquote>
      <figcaption><b>${x.name}</b>${x.role ? html`, ${x.role}` : ''}${x.school ? html`, ${x.school}` : ''}</figcaption></figure></li>`)}</ul>
  </section>`;
}

/** Google Classroom for teachers (only when it is on here): the words are teachers.classroom.*, the same as "/". */
function classroomSection(req) {
  if (!classroomOn()) return '';
  const t = req.t;
  return html`<section class="panel lp-gc" id="classroom" aria-labelledby="classroom-h">
    ${el(t, 'h2', 'teachers.classroom.h', {}, ' id="classroom-h"')}${el(t, 'p', 'teachers.classroom.lead')}
    <ul class="lp-list">${['li1', 'li2', 'li3', 'li4', 'li5'].map(k => el(t, 'li', `teachers.classroom.${k}`))}</ul>
    <p class="small muted">${el(t, 'span', 'teachers.classroom.note')} <a href="/privacy#google">${t('teachers.classroom.privacy')}</a></p>
  </section>`;
}

// ---------------------------------------------------------------------------------------------------- /teachers
router.get('/teachers', (req, res) => {
  const t = req.t;
  const google = googleEnabled();
  const email = contactEmail();
  const mail = html`<a href="mailto:${email}" dir="ltr">${email}</a>`;
  const langCount = availableLocales().length;
  const list = TEACHER_GAMES.map(launchGame).filter(Boolean);
  const card = g => html`<li><a class="lp-game" href="${lp(req, `/g/${g.slug}`)}">${coverArt(g)}<span class="lp-game-text"><span class="lp-game-t">${g.title}</span>${el(t, 'span', `learn.games.${LEARNING[g.slug].key}`, {}, ' class="lp-game-d"')}</span></a></li>`;
  const badges = [['✅', 'teachers.badges.free'], ['🚫', 'teachers.badges.ads'], ['💻', 'teachers.badges.browser'], ...(google ? [['🔑', 'teachers.badges.google']] : []), ['🎒', 'teachers.badges.ages']];
  const classItems = ['li1', 'li2', ...(google ? ['li3'] : []), 'li4', 'li5'];
  // With Sign in with Google on, a student's school Google email is kept: answers that say otherwise have a Google version.
  // With paid-plan pages on, the first question says what is free and what the Teacher plan adds (no prices: those are
  // on /plans); off, the plain "yes, it's free" stays.
  const paidFaq = familiesOn(req);
  const faqPairs = Array.from({ length: TEACHER_FAQ }, (_, i) => [`teachers.faq.q${i + 1}${i === 0 && paidFaq ? 'paid' : ''}`, `teachers.faq.a${i + 1}${(i === 3 || i === 5) && google ? 'google' : ''}${i === 0 && paidFaq ? 'paid' : ''}`]);
  const faq = faqBlock(req, faqPairs, 'teachers.faq.h', { href: '/privacy', count: langCount, host: siteHost(req) });
  const plans = familiesOn(req);
  // ?sent=1: the thank-you after the form (nothing it said is shown back); ?failed=1: a form sent without JavaScript
  // that needs fixing (the JavaScript form shows each field's own message instead).
  const sent = req.query.sent === '1', failed = req.query.failed === '1';
  const startPanel = html`<section class="panel lp-start" id="start" aria-labelledby="start-h">
    ${el(t, 'h2', 'teachers.start.h', {}, ' id="start-h"')}
    ${el(t, 'p', 'teachers.start.p1')}
    ${setupBlock(req, { sent, failed })}
    ${plans ? el(t, 'p', 'teachers.start.plans', { days: config.teacherTrialDays, daily: req.fmt.int(config.teacherDailyMessages) }) : ''}
    <div class="row">
      ${plans ? html`<a class="btn btn-primary" href="/trial">${t('plans.teacher.start')}</a> <a class="btn" href="/plans/schools">${t('teachers.start.plansLink')}</a>` : ''}
      ${list[0] ? html`<a class="btn" href="/play/${list[0].slug}" rel="nofollow">▶ ${t('teachers.cta.try')}</a>` : ''}
    </div>
    ${el(t, 'p', 'teachers.setup.questions', { email: mail }, ' class="small muted"')}
  </section>`;
  const body = html`<div class="lp">
  ${sent ? startPanel : ''}
  <section class="lp-hero lp-hero-how" aria-labelledby="lp-h1">
    ${el(t, 'p', 'teachers.kicker', {}, ' class="lp-kicker"')}
    ${el(t, 'h1', 'teachers.h1', {}, ' id="lp-h1"')}
    ${el(t, 'p', 'teachers.lead', {}, ' class="lead"')}
    <p class="small lp-leader">🏫 ${tHtml(t, 'teachers.leaderLine', { href: '#start' })}</p>
    <ul class="lp-badges">${badges.map(([e, k]) => html`<li><span aria-hidden="true">${e}</span> ${el(t, 'span', k)}</li>`)}</ul>
    ${el(t, 'p', plans ? 'teachers.free.line' : 'teachers.free.lineOff', { daily: req.fmt.int(config.teacherDailyMessages), plans: '/plans' }, ' class="lp-freeline"')}
    <div class="row lp-cta">
      <a class="btn btn-primary btn-big" href="#start">${t('teachers.cta.start')}</a>
      ${liveOn() && !(req.user && !req.user.is_guest && !canHost(req.user)) ? html`<a class="btn btn-hot btn-big" href="${canHost(req.user) ? '/live/quick' : '/teachers/host'}" id="host-now">📡 ${el(t, 'span', 'quickLive.cta')}</a>` : ''}
      ${list[0] ? html`<a class="btn btn-big" href="/play/${list[0].slug}" rel="nofollow">▶ ${t('teachers.cta.try')}</a>` : ''}
    </div>
    ${howArt(req, 'teachers')}
  </section>
  ${howSteps(req, 'teachers')}

  <section class="lp-sec" id="play" aria-labelledby="play-h">
    ${el(t, 'h2', 'teachers.play.h', {}, ' id="play-h"')}${el(t, 'p', 'teachers.play.p')}
    <ul class="lp-games">${list.map(card)}</ul>
    <p class="lp-research">📚 <a href="/research">${t('teachers.research.link')}</a></p>
  </section>

  <section class="lp-sec" id="brain-breaks" aria-labelledby="bb-h">
    ${el(t, 'h2', 'move.teachersH', {}, ' id="bb-h"')}${el(t, 'p', 'move.teachersP')}
    <p><a class="btn btn-primary" href="${lp(req, '/move')}">${t('move.title')}</a></p>
  </section>

  <section class="lp-sec" id="subjects" aria-labelledby="subj-h">
    ${el(t, 'h2', 'teachers.subjects.h', {}, ' id="subj-h"')}
    <ul class="lp-hubs">${HUBS.map(h => html`<li><a class="lp-hub panel" href="${lp(req, `/learn/${h.slug}`)}"><span class="lp-hub-e" aria-hidden="true">${h.emoji}</span><span>${el(t, 'span', `learn.hubs.${h.key}.name`, {}, ' class="lp-hub-t"')}${el(t, 'span', `learn.hubs.${h.key}.short`, {}, ' class="lp-hub-d"')}</span></a></li>`)}</ul>
  </section>

  ${teacherLoop(t, { variant: 'page', cls: 'lp-sec', links: isSchoolStaff(req.user) ? loopLinks(req.user) : null, live: liveOn() })}
  ${classroomSection(req)}

  <div class="lp-cols">
    <section class="panel" id="build" aria-labelledby="build-h">
      ${el(t, 'h2', 'teachers.build.h', {}, ' id="build-h"')}${el(t, 'p', 'teachers.build.p1')}${el(t, 'p', 'teachers.build.p2')}
      <p><a href="${lp(req, '/learn/make-a-game')}">${t('teachers.build.link')}</a></p>
    </section>
    <section class="panel" id="class" aria-labelledby="class-h">
      ${el(t, 'h2', 'teachers.class.h', {}, ' id="class-h"')}
      <ul class="lp-list">${classItems.map(k => el(t, 'li', `teachers.class.${k}`))}</ul>
    </section>
    <section class="panel" id="safe" aria-labelledby="safe-h">
      ${el(t, 'h2', 'teachers.safe.h', {}, ' id="safe-h"')}
      <ul class="lp-list">${['li1', google ? 'li2google' : 'li2', 'li3', 'li4'].map(k => el(t, 'li', `teachers.safe.${k}`))}</ul>
      <p>${tHtml(t, 'teachers.safe.links', { safety: lp(req, '/safety'), privacy: '/privacy' })}</p>
    </section>
    ${liveOn() ? html`<section class="panel" id="live" aria-labelledby="live-h">
      ${el(t, 'h2', 'teachers.live.h', {}, ' id="live-h"')}${el(t, 'p', 'teachers.live.p1')}
      <ul class="lp-list">${['li1', 'li2', 'li3'].map(k => el(t, 'li', `teachers.live.${k}`))}</ul>
      <p><a class="btn" href="${lp(req, '/teachers/live')}">${t('teachers.live.more')}</a></p>
    </section>` : ''}
    <section class="panel" id="uses" aria-labelledby="uses-h">
      ${el(t, 'h2', 'teachers.uses.h', {}, ' id="uses-h"')}${el(t, 'p', 'teachers.uses.p')}
      <ul class="lp-tags">${['li1', 'li2', 'li3', 'li4', 'li5', 'li6', 'li7'].map(k => el(t, 'li', `teachers.uses.${k}`))}</ul>
      ${el(t, 'h2', 'teachers.languages.h', {}, ' class="lp-sub"')}${el(t, 'p', 'teachers.languages.p', { count: langCount })}
    </section>
  </div>

  ${quotesSection(req)}
  ${sent ? '' : startPanel}
  ${faq.markup}
  </div>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers']];
  const items = list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, `/g/${g.slug}`), name: g.title }));
  page(req, res, {
    title: t('teachers.title'), description: t('teachers.description'), body, bodyClass: 'lp-page',
    head: html`${howHead()}${LOOP_CSS}`, scripts: [HOW_SCRIPT],
    seo: {
      index: true, path: '/teachers', langs: seo.langsWithKey('teachers.h1'), image: '/og/teachers.jpg', imageAlt: t('seo.teachers.imageAlt'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, '/teachers'), url: seo.abs(req, '/teachers'), name: t('teachers.title'), description: t('teachers.description'), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' } },
        { '@type': 'ItemList', name: t('teachers.play.h'), itemListElement: items },
        faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- /teachers/live
// Oomba Live for teachers: what a live class game is, real screens of one, the tools and the safety rules, and a way in
// (hosting needs a teacher or grown-up account: canHost). 404 while live games are off.
router.get('/teachers/live', (req, res, next) => {
  if (!liveOn()) return next();
  const t = req.t, u = req.user;
  const langCount = availableLocales().length;
  const host = canHost(u), kid = !!u && !u.is_guest && !host;
  // The way in: hosts go straight to /live; signed-out teachers sign in (or sign up as a grown-up while those pages are on,
  // else set up their school on /teachers); a child's account is told to ask for the code.
  // (Signed out: the three-field teacher sign-up and the Quick game chooser, routes/quick-live.js. It used to be the
  // parents' sign-up, which made a parent account for a teacher.)
  const hostHref = host ? '/live' : '/teachers/host';
  const badges = [['✅', 'free'], ['🚫', 'ads'], ['🙅', 'noAccounts'], ['💻', 'browser'], ['🌍', 'languages']];
  const vars = { max: config.liveMaxPlayers, open: GROWNUP_OPEN_MAX, items: SET_LIMITS.items };
  const faq = faqBlock(req, [1, 2, 3, 4, 5].map(n => [`teachersLive.faq.q${n}`, `teachersLive.faq.a${n}`]), 'teachersLive.faq.h', vars);
  // Each mode says how many players it is made for (classlive-access.js CAPACITY, docs/live-capacity.md).
  const MODE_ID = { race: 'quest-race', battle: 'battle', board: 'board', wyr: 'wyr', atlas: 'atlas', tug: 'tug', doodle: 'doodle' };
  const mode = (emoji, k) => { const c = capacityFor({ mode: MODE_ID[k] }); return html`<section class="panel lp-mode"><h3><span aria-hidden="true">${emoji}</span> ${el(t, 'span', `teachersLive.modes.${k}.h`)}</h3>${el(t, 'p', `teachersLive.modes.${k}.p`)}<p class="small lp-mode-players">👥 ${t('live.landing.best', { min: c.best[0], max: c.best[1] })}</p></section>`; };
  const startBtns = kid ? html`<a class="btn btn-primary btn-big" href="/join">${t('teachersLive.cta.join')}</a>`
    : html`<a class="btn btn-primary btn-big" href="${hostHref}">${t('teachersLive.cta.host')}</a>`;
  const body = html`<div class="lp">
  <section class="lp-hero lp-hero-how" aria-labelledby="lp-h1">
    ${el(t, 'p', 'teachersLive.kicker', {}, ' class="lp-kicker"')}
    ${el(t, 'h1', 'teachersLive.h1', {}, ' id="lp-h1"')}
    ${el(t, 'p', 'teachersLive.lead', {}, ' class="lead"')}
    <ul class="lp-badges">${badges.map(([e, k]) => html`<li><span aria-hidden="true">${e}</span> ${el(t, 'span', `teachersLive.badges.${k}`, { count: langCount })}</li>`)}</ul>
    <div class="row lp-cta">
      ${kid ? '' : html`<a class="btn btn-primary btn-big" href="${hostHref}">▶ ${t('teachersLive.cta.host')}</a>`}
      <a class="btn btn-big" href="#how-it-works">${t('teachersLive.cta.how')}</a>
    </div>
    <p class="small"><a href="/join">${t('teachersLive.cta.join')}</a></p>
    ${howArt(req, 'teachersLive')}
  </section>
  ${demoVideo(req)}
  ${howSteps(req, 'teachersLive')}

  <section class="lp-sec" id="modes" aria-labelledby="modes-h">
    ${el(t, 'h2', 'teachersLive.modes.h', {}, ' id="modes-h"')}
    <div class="lp-modes">${mode('🏝️', 'race')}${mode('⚡', 'battle')}${mode('🌟', 'board')}${mode('🤔', 'wyr')}${mode('🌍', 'atlas')}${mode('🪢', 'tug')}${mode('🦉', 'doodle')}</div>
  </section>

  <section class="panel" id="own" aria-labelledby="own-h">
    ${el(t, 'h2', 'teachersLive.own.h', {}, ' id="own-h"')}${el(t, 'p', 'teachersLive.own.p')}
    <ul class="lp-list">${[1, 2, 3, 4, 5].map(n => el(t, 'li', `teachersLive.own.li${n}`))}</ul>
  </section>

  <div class="lp-cols">
    <section class="panel" id="tools" aria-labelledby="tools-h">
      ${el(t, 'h2', 'teachersLive.tools.h', {}, ' id="tools-h"')}
      <ul class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `teachersLive.tools.li${n}`))}</ul>
    </section>
    <section class="panel" id="safe" aria-labelledby="safe-h">
      ${el(t, 'h2', 'teachersLive.safe.h', {}, ' id="safe-h"')}
      <ul class="lp-list">${[1, 2, 3, 4].map(n => el(t, 'li', `teachersLive.safe.li${n}`))}</ul>
      ${el(t, 'p', 'teachersLive.safe.link', { safety: lp(req, '/safety') })}
    </section>
  </div>

  <section class="panel" id="more" aria-labelledby="more-h">
    ${el(t, 'h2', 'teachersLive.more.h', {}, ' id="more-h"')}${el(t, 'p', 'teachersLive.more.p')}
    <p><a href="${lp(req, '/teachers')}">${t('teachersLive.more.link')}</a></p>
  </section>

  <section class="panel lp-start" id="start" aria-labelledby="start-h">
    ${el(t, 'h2', 'teachersLive.start.h', {}, ' id="start-h"')}
    ${el(t, 'p', kid ? 'teachersLive.start.kid' : host ? 'teachersLive.start.signedIn' : 'quickLive.ctaNote')}
    <div class="row">${startBtns}</div>
  </section>
  ${faq.markup}
  </div>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('teachersLive.kicker'), '/teachers/live']];
  page(req, res, {
    title: t('teachersLive.title'), description: t('teachersLive.description'), body, bodyClass: 'lp-page',
    head: howHead(), scripts: [HOW_SCRIPT],
    seo: {
      index: true, path: '/teachers/live', langs: seo.langsWithKey('teachersLive.h1'), image: fsOg('teachers-live') ? '/og/teachers-live.jpg' : '/og/teachers.jpg', imageAlt: t('teachersLive.title'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, '/teachers/live'), url: seo.abs(req, '/teachers/live'), name: t('teachersLive.title'), description: t('teachersLive.description'), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' } },
        faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- /learn/<hub>
/** Sum Racer's tracks (the math page). */
const tracks = t => html`<section class="panel" id="tracks" aria-labelledby="tracks-h">${el(t, 'h2', 'learn.hubs.math.tracks.h', {}, ' id="tracks-h"')}
  <ol class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `learn.hubs.math.tracks.li${n}`))}</ol>${el(t, 'p', 'learn.hubs.math.tracks.p')}</section>`;
/** How making a game works (the make-a-game page). */
const builder = (req, t) => html`<section class="panel" id="how" aria-labelledby="how-h">${el(t, 'h2', 'learn.hubs.makeAGame.how.h', {}, ' id="how-h"')}
    <ol class="lp-steps">${[1, 2, 3, 4].map(n => el(t, 'li', `learn.hubs.makeAGame.how.li${n}`))}</ol>
    <p><a class="btn btn-primary" href="/build">🛠️ ${t('learn.hubs.makeAGame.cta')}</a></p></section>
  <section class="panel" id="skills" aria-labelledby="skills-h">${el(t, 'h2', 'learn.hubs.makeAGame.skills.h', {}, ' id="skills-h"')}${el(t, 'p', 'learn.hubs.makeAGame.skills.p')}</section>
  ${t.own('learn.hubs.makeAGame.parents.h') ? html`<section class="panel" id="parents" aria-labelledby="parents-h">${el(t, 'h2', 'learn.hubs.makeAGame.parents.h', {}, ' id="parents-h"')}${el(t, 'p', 'learn.hubs.makeAGame.parents.p1')}${el(t, 'p', 'learn.hubs.makeAGame.parents.p2')}</section>` : ''}
  ${t.own('learn.hubs.makeAGame.ideas.h') ? html`<section class="panel" id="ideas" aria-labelledby="ideas-h">${el(t, 'h2', 'learn.hubs.makeAGame.ideas.h', {}, ' id="ideas-h"')}
    <ul class="lp-tags">${[1, 2, 3, 4, 5].map(n => el(t, 'li', `learn.hubs.makeAGame.ideas.li${n}`))}</ul>${el(t, 'p', 'learn.hubs.makeAGame.ideas.p')}</section>` : ''}
  ${t.own('learn.hubs.makeAGame.scratch.h') ? html`<section class="panel" id="scratch" aria-labelledby="scratch-h">${el(t, 'h2', 'learn.hubs.makeAGame.scratch.h', {}, ' id="scratch-h"')}${el(t, 'p', 'learn.hubs.makeAGame.scratch.p')}</section>` : ''}
  <section class="panel" id="safe" aria-labelledby="safe-h">${el(t, 'h2', 'learn.hubs.makeAGame.safe.h', {}, ' id="safe-h"')}${el(t, 'p', 'learn.hubs.makeAGame.safe.p')}
    <p>${t.own('learn.hubs.makeAGame.safeLink') ? html`<a href="${lp(req, '/parents/ai-builder-safety')}">${t('learn.hubs.makeAGame.safeLink')}</a> · ` : ''}<a href="${lp(req, '/safety')}">${t('learn.safetyLink')}</a></p></section>`;

/** The computer-science page: the four games are chapters of CS Quest, the teacher program (hub.extra === 'cs'). */
const csTeaser = (req, t) => html`<section class="panel" id="cs-quest" aria-labelledby="csq-h">${el(t, 'h2', 'learn.hubs.cs.program.h', {}, ' id="csq-h"')}${el(t, 'p', 'learn.hubs.cs.program.p')}
    <ul class="lp-list">${[1, 2, 3, 4].map(n => el(t, 'li', `learn.hubs.cs.program.li${n}`))}</ul>
    <p><a class="btn btn-primary" href="${lp(req, '/teachers/cs-quest')}">💻 ${t('learn.hubs.cs.program.link')}</a></p></section>`;

/** "Using this in class? See Oomba Academy for teachers." on the subject, age and game pages, for signed-out visitors
 *  and guests (a teacher who found a game from a search); empty for anyone with an account, and in a language that
 *  hasn't got the sentence yet (a translated page stays in one language). */
export const inClassLine = req => (signedOut(req.user) && req.t.own('learn.inClass') ? el(req.t, 'p', 'learn.inClass', { href: lp(req, '/teachers') }, ' class="lp-aside small in-class"') : '');

// ---------------------------------------------------------------------------------------------------- /learn
// The Learn tab (docs/decisions.md "Play and Learn"): the library's learning shelf, the same page for everyone. Filters
// (subject, grade, how you play) are plain links and a GET form, so they work without scripts; a filtered view is noindex
// and /learn stays the page search engines see (its heading, lead, subject and age pages and structured data, signed out).
// School staff see Assign (to their classes), Host live (live modes) and Try it on the same cards; nobody else does.
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
const HOWS = ['solo', 'two', 'live'];
/** Each course's subject and grades, for the filters and the card's "Subject · Grades" line: the same grades as the
 *  course's own subtitle (courses.<key>.sub; Cyber Defenders has two bands, 3-5 and 6-8). */
const COURSE_INFO = { 'cs-quest': { subject: 'code', from: 3, to: 8 }, 'cyber-defenders': { subject: 'code', from: 3, to: 8 }, 'number-quest': { subject: 'math', from: 3, to: 5 } };
/** The filters asked for in the address, each one only when it is a known value. */
export function learnFilters(query = {}, defaultGrade = '') {
  const subject = SUBJECTS.some(x => x.key === query.subject) ? query.subject : '';
  // A student's roster grade is picked until they choose another (or "Any grade": grade=any).
  const asked = query.grade === undefined ? defaultGrade : String(query.grade);
  const grade = GRADES.includes(asked) ? asked : '';
  const how = HOWS.includes(query.how) ? query.how : '';
  return { subject, grade, how };
}
const gradeNum = g => (g === 'K' ? 0 : +g);
/** A student's grade from their school roster ("4", "Grade 4", "k"), as a Learn filter value, or ''. */
export function rosterGrade(u) {
  if (!u || u.is_guest) return '';
  for (const s of schoolsOf(u.id)) {
    if (s.role !== 'student') continue;
    const m = /^\s*(?:grade\s*)?(k|\d{1,2})\b/i.exec(String(s.grade || ''));
    const g = m ? m[1].toUpperCase().replace(/^0+(?=\d)/, '') : '';
    if (GRADES.includes(g)) return g;
  }
  return '';
}
/** Does a game or course with this info pass the subject and grade filters? */
const fits = (info, f) => !!info && (!f.subject || info.subject === f.subject) && (!f.grade || (info.from <= gradeNum(f.grade) && gradeNum(f.grade) <= info.to));
const isTwo = g => TWO_PLAYER.includes(g.slug) || (g.players_max >= 2 && g.players_max <= 8);
const liveOnly = g => { const l = liveGameOf(g); return !!l && !l.play; };

router.get('/learn', (req, res) => {
  const t = req.t, u = req.user;
  const out = signedOut(u);
  const staff = !out && isSchoolStaff(u);
  const defGrade = out || staff ? '' : rosterGrade(u);
  const f = learnFilters(req.query, defGrade);
  const filtered = !!(f.subject || f.grade || f.how);
  // With a roster grade, "Any grade" has to say so in the address (grade=any), or the default would come back.
  const gradeQ = g => g || (defGrade ? 'any' : '');
  const live = liveOn();
  const subjName = k => t(`learn.tab.subjects.${k}`);
  const meta = g => { const i = SHELF_INFO[g.slug]; const gr = shelfGrades(g.slug); return i ? t('learn.tab.meta', { subject: subjName(i.subject), grades: t('learn.grades', gr) }) : null; };
  const href = over => { const p = { ...f, ...over }; p.grade = gradeQ(p.grade); const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return lp(req, '/learn') + (qs ? `?${qs}` : '') + '#filters'; };
  const card = (href, emoji, name, short) => html`<li><a class="lp-hub panel" href="${lp(req, href)}"><span class="lp-hub-e" aria-hidden="true">${emoji}</span><span>${el(t, 'span', name, {}, ' class="lp-hub-t"')}${el(t, 'span', short, {}, ' class="lp-hub-d"')}</span></a></li>`;
  const crumbs = [[t('nav.home'), '/'], [t('learn.index.crumb'), '/learn']];
  // Learn is a tab: signed in, it needs no breadcrumb ("Home" is another tab, or another first page, for them).
  const seenCrumbs = out ? crumbs : [];

  // The official Learn-shelf games anyone may open (course-owned games are reached through their course).
  const all = games.listVisible(u, { shelf: 'learn', official: true, order: 'plays', limit: 60 }).filter(g => SHELF_INFO[g.slug]);
  // Staff only: the Common Core codes each official game practises (server/standards/official-tags.js), and ?std= to
  // keep the games that practise a code or a code's start ("3.OA", "RF.K"). Never shown to kids or visitors.
  const std = staff ? stdNorm(String(req.query.std || '').slice(0, 24)).replace(/\.$/, '') : '';
  const codesOf = slug => ['ccss-math', 'ccss-ela'].map(fw => [fw, OT.gameCodes(slug, fw)]).filter(([, c]) => c.length);
  const hasStd = slug => codesOf(slug).some(([, c]) => c.some(x => x === std || x.startsWith(`${std}.`) || x.startsWith(std)));
  const pass = all.filter(g => fits(SHELF_INFO[g.slug], f) && (!std || hasStd(g.slug)));
  // Live class games: the Oomba Live modes (while Live is on), in their own section; the rest in the grid.
  const liveList = live && f.how !== 'solo' && f.how !== 'two' ? pass.filter(g => liveGameOf(g)) : [];
  const grid = f.how === 'live' ? [] : pass.filter(g => !liveList.includes(g) && !(live && liveOnly(g))).filter(g => f.how !== 'two' || isTwo(g));
  // One main action per card for staff (Host live for a live mode, else Assign), and Try it as a smaller link.
  const acts = g => {
    if (!staff) return '';
    const l = liveGameOf(g);
    const main = l && live ? html`<a class="btn btn-sm btn-hot" href="/live?mode=${l.mode}">📡 ${t('learn.tab.host')}</a>`
      : l && !l.play ? '' : html`<a class="btn btn-sm btn-primary" href="/teach/assign?game=${g.slug}">📌 ${t('learn.tab.assign')}</a>`;
    return html`${codesOf(g.slug).map(([fw, c]) => codeChips(t, fw, c))}<div class="lcard-acts">${main}<a class="lcard-try" href="/play/${l ? l.solo : g.slug}">▶ ${t('learn.tab.try')}</a></div>`;
  };
  const cards = list => html`<ul class="cardgrid lcards">${list.map(g => html`<li class="lcard">${gameCard(g, { meta: meta(g) })}${acts(g)}</li>`)}</ul>`;
  // Courses (not in the "two players" or "live" views): progress for players, Assign for staff.
  let courseMarkup = '';
  // A ?std= filter applies to games only: the course cards (whose codes are by step, not by course) are left out then.
  if (f.how !== 'two' && f.how !== 'live' && !std) {
    try {
      // Each course card carries the same "Subject · Grades" line as the game cards.
      const courseMeta = c => { const i = COURSE_INFO[c.slug]; return i ? t('learn.tab.meta', { subject: subjName(i.subject), grades: t('learn.grades', { from: String(i.from), to: String(i.to) }) }) : null; };
      const items = courses.COURSES.filter(c => fits(COURSE_INFO[c.slug], f)).map(c => ({ course: c, games: courses.courseGames(u, c), ov: courses.overview(u, c), meta: courseMeta(c) }));
      // "My courses" once a player has begun one (picked a band); "Courses" until then.
      const mine = !out && !staff && !isGrownup(u) && items.some(it => it.ov && it.ov.band);
      courseMarkup = items.length ? courseRow(items, { staff, title: mine ? t('learn.tab.myCourses') : null }) : '';
    } catch (e) { log('error', 'learn courses', { error: e.message }); }
  }
  // Games other players made for learning: signed in only (an indexed page never carries a child's name or words).
  const players = out || (filtered && !(f.grade === defGrade && !f.subject && !f.how)) ? [] : games.listVisible(u, { shelf: 'learn', limit: 12, order: 'popular' }).filter(g => g.source !== 'seed');
  const subj = SUBJECTS.find(x => x.key === f.subject);
  const chip = (on, link, label, emoji = '') => html`<a class="chip${on ? ' on' : ''}" href="${link}" rel="nofollow"${on ? raw(' aria-current="true"') : ''}>${emoji ? html`<span aria-hidden="true">${emoji}</span>` : ''}${label}</a>`;
  // Kids' "Got a game code from your teacher?" (grown-ups and staff have Join in the top bar), under the games.
  const joinDoor = live && !staff && !isGrownup(u) ? html`<div class="home-join learn-join"><a class="door door-join" href="/join" id="learn-join"><span class="door-e" aria-hidden="true">🎟️</span><span class="door-t"><span class="door-h">${t('learn.tab.joinH')}</span><span class="door-s">${t('live.entry.join')}</span></span><span class="door-go flip" aria-hidden="true">›</span></a></div>` : '';
  // Live class games: first for staff (they host them) and for students in a class; under the learning games for
  // everyone else (a kid at home plays the learning games; live modes need a class).
  const liveFirst = staff || (!out && classesOf(u.id, 'student').length > 0);
  // The subject pages are the subject chips' "More about…" pages; brain breaks (Play) and making a game (Build) are not
  // Learn subjects, so they sit apart under "Also on Oomba". The age pages and the teacher/parent links are for visitors,
  // staff and grown-ups (the signed-out page search engines see); a kid's Learn ends at the join door.
  const subjectHub = h => SUBJECTS.some(x => x.hub === h.slug);
  // A subject page whose name doesn't say its chip's name says both ("Thinking: Chess and strategy games").
  const NAMED = ['thinking', 'code'];
  const hubCard = h => { const sx = SUBJECTS.find(x => x.hub === h.slug);
    if (!sx || !NAMED.includes(sx.key)) return card(`/learn/${h.slug}`, h.emoji, `learn.hubs.${h.key}.name`, `learn.hubs.${h.key}.short`);
    return html`<li><a class="lp-hub panel" href="${lp(req, `/learn/${h.slug}`)}"><span class="lp-hub-e" aria-hidden="true">${h.emoji}</span><span><span class="lp-hub-t">${t('learn.tab.hubNamed', { subject: subjName(sx.key), hub: t(`learn.hubs.${h.key}.name`) })}</span>${el(t, 'span', `learn.hubs.${h.key}.short`, {}, ' class="lp-hub-d"')}</span></a></li>`; };
  const forVisitors = out || staff || isGrownup(u);
  const kidEnd = !out && !staff && !isGrownup(u);
  const liveSec = liveList.length ? html`<section class="lp-sec" id="live-games" aria-labelledby="live-games-h"><h2 id="live-games-h">📡 ${t('learn.tab.live')}</h2>
      <p class="small muted">${staff ? t('learn.tab.liveStaff') : t('learn.tab.liveText')}</p>${cards(liveList)}</section>` : '';
  const body = html`<div class="lp learn-tab">
    ${seenCrumbs.length ? html`<nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${seenCrumbs.map(([name, p], i) => html`<li>${i < seenCrumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>` : ''}
    ${out ? html`<section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'h1', 'learn.index.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'learn.index.lead', {}, ' class="lead"')}
    </section>` : html`<div class="pagehead learn-head"><h1 id="lp-h1"><span aria-hidden="true">📚</span> ${t('learn.tab.h1')}</h1><p class="muted">${staff ? t('learn.tab.leadStaff') : t('learn.tab.lead')}</p></div>`}
    <form class="learn-filters" id="filters" method="get" action="${lp(req, '/learn')}" aria-label="${t('learn.tab.filters')}">
      <div class="chips scroll" role="group" aria-label="${t('learn.tab.subject')}">
        ${chip(!f.subject, href({ subject: '' }), t('learn.tab.subjects.all'))}
        ${SUBJECTS.map(x => chip(f.subject === x.key, href({ subject: x.key }), subjName(x.key), x.emoji))}
      </div>
      <div class="learn-filter-row">
        <label class="learn-grade"><span>${t('learn.tab.grade')}</span>
          <select class="input" name="grade" data-autosubmit>${[[defGrade ? 'any' : '', t('learn.tab.gradeAny')], ...GRADES.map(g => [g, g === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: g })])].map(([v, l]) => html`<option value="${v}"${(f.grade || (defGrade ? 'any' : '')) === v ? raw(' selected') : ''}>${l}</option>`)}</select></label>
        ${staff ? html`<span class="learn-std-row"><label class="learn-std"><span>${t('standards.learn.label')}</span><input class="input" name="std" value="${std}" maxlength="24" placeholder="${t('standards.learn.hint')}" dir="ltr" autocomplete="off"></label>
          <button class="btn learn-std-go" type="submit">${t('learn.tab.filter')}</button></span>` : ''}
        ${f.subject ? html`<input type="hidden" name="subject" value="${f.subject}">` : ''}${f.how ? html`<input type="hidden" name="how" value="${f.how}">` : ''}
        <button class="btn" type="submit" data-nojs>${t('learn.tab.filter')}</button>
      </div>
      <div class="chips learn-how" role="group" aria-label="${t('learn.tab.how')}">
        <span class="small muted learn-how-l" aria-hidden="true">${t('learn.tab.how')}</span>
        ${chip(!f.how, href({ how: '' }), t('learn.tab.howAll'))}
        ${HOWS.filter(h => h !== 'live' || live).map(h => chip(f.how === h, href({ how: h }), t(`learn.tab.hows.${h}`), { solo: '🙂', two: '👥', live: '📡' }[h]))}
      </div>
    </form>
    ${subj && subj.hub ? html`<p class="learn-more"><a href="${lp(req, `/learn/${subj.hub}`)}">${t('learn.tab.moreAbout', { subject: subjName(subj.key) })} <span class="flip" aria-hidden="true">→</span></a></p>` : ''}
    ${courseMarkup}
    ${liveFirst ? liveSec : ''}
    <section class="lp-sec" id="learn-games" aria-labelledby="learn-games-h"><h2 id="learn-games-h">🎓 ${t('learn.tab.games')}</h2>
      ${grid.length ? cards(grid) : liveList.length ? '' : html`<p class="notice">${t('learn.tab.none')} <a href="${lp(req, '/learn')}#filters">${t('learn.tab.clear')}</a></p>`}
      ${staff && [...grid, ...liveList].some(g => codesOf(g.slug).length) ? stdNotice(t) : ''}</section>
    ${liveFirst ? '' : liveSec}
    ${kidEnd ? '' : joinDoor}
    ${players.length ? rail({ title: t('learn.tab.players'), emoji: '🛠️', games: players, id: 'learn-players', more: '/search?cat=learning' }) : ''}
    <section class="lp-sec" id="subjects" aria-labelledby="subj-h">${el(t, 'h2', 'learn.index.subjects', {}, ' id="subj-h"')}
      <ul class="lp-hubs">${SUBJECTS.map(x => HUBS.find(h => h.slug === x.hub)).filter(Boolean).map(hubCard)}</ul></section>
    <section class="lp-sec" id="also" aria-labelledby="also-h"><h2 id="also-h">${t('learn.tab.also')}</h2>
      <ul class="lp-hubs">${HUBS.filter(h => !subjectHub(h)).map(hubCard)}</ul></section>
    ${forVisitors ? html`<section class="lp-sec" id="ages" aria-labelledby="ages-h">${el(t, 'h2', 'learn.index.ages', {}, ' id="ages-h"')}
      <ul class="lp-hubs">${AGES.map(a => card(`/learn/${a.slug}`, a.emoji, `learn.ages.${a.key}.name`, `learn.ages.${a.key}.short`))}</ul></section>
    <section class="lp-sec" id="who" aria-labelledby="who-h">${el(t, 'h2', 'learn.index.who', {}, ' id="who-h"')}
      <ul class="chips lp-more"><li><a class="chip" href="${lp(req, '/teachers')}"><span aria-hidden="true">🍎</span>${t('learn.teachersLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/parents')}"><span aria-hidden="true">👪</span>${parentsLabel(t, 'learn.parentsLink')}</a></li></ul></section>` : ''}
    ${kidEnd ? joinDoor : ''}
  </div>`;
  const items = [...HUBS.map(h => [`/learn/${h.slug}`, t(`learn.hubs.${h.key}.name`)]), ...AGES.map(a => [`/learn/${a.slug}`, t(`learn.ages.${a.key}.name`)])]
    .map(([p, name], i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, p), name }));
  if (!out) res.set('Cache-Control', 'private, no-store');
  page(req, res, {
    title: t('learn.index.title'), description: t('learn.index.description'), body, bodyClass: 'lp-page learn-page', active: 'learn', scripts: ['/js/learn.js'],
    ...(staff ? { head: raw(`<link rel="stylesheet" href="/css/standards.css?v=${VERSION}">`) } : {}),
    // A filtered view (or anything with a query) is not a page of its own for search engines: /learn is.
    seo: filtered || Object.keys(req.query).length ? null : {
      index: true, path: '/learn', langs: seo.langsWithKey('learn.index.h1'), image: '/og/teachers.jpg', imageAlt: t('learn.index.h1'),
      jsonld: [seo.graph([
        { '@type': 'CollectionPage', '@id': seo.abs(req, '/learn'), url: seo.abs(req, '/learn'), name: t('learn.index.title'), description: t('learn.index.description'), isPartOf: { '@id': seo.abs(req, '/#website') }, mainEntity: { '@type': 'ItemList', itemListElement: items } },
        seo.breadcrumbLd(req, crumbs),
      ])],
    },
  });
});

router.get('/learn/:hub', (req, res) => {
  const hub = hubBySlug(req.params.hub);
  if (!hub || req.params.hub !== hub.slug) return notFound(req, res);
  const t = req.t; const k = `learn.hubs.${hub.key}`;
  const list = hub.games.map(launchGame).filter(Boolean);
  const path = `/learn/${hub.slug}`;
  const band = gradeBand(list.map(g => g.slug));
  const gameItem = g => html`<article class="panel lp-hubgame" aria-labelledby="g-${g.slug}">
      <a class="lp-hubgame-art" href="${lp(req, `/g/${g.slug}`)}" tabindex="-1" aria-hidden="true">${coverArt(g)}</a>
      <div class="lp-hubgame-text">
        <h2 id="g-${g.slug}"><a href="${lp(req, `/g/${g.slug}`)}">${g.title}</a></h2>
        ${t.own(`learn.games.${LEARNING[g.slug].key}`) ? html`<p class="lp-practise"><b>${t('learn.practise')}</b> ${t(`learn.games.${LEARNING[g.slug].key}`)}</p>` : html`<p class="ugc">${g.description}</p>`}
        <div class="row"><a class="btn btn-primary" href="/play/${g.slug}" rel="nofollow">▶ ${t('learn.play')}</a><a class="btn" href="${lp(req, `/g/${g.slug}`)}">${t('learn.about')}</a></div>
      </div></article>`;
  // The make-a-game page's "How much does it cost?" names the optional plans (never a price) only while they are public.
  const paidKey = n => (familiesOn(req) && t.has(`${k}.faq.a${n}paid`) ? `${k}.faq.a${n}paid` : `${k}.faq.a${n}`);
  // Questions, the "At home" paragraph and the make-a-game page's extra sections show in a language only once it has
  // them (t.own), so a translated page stays in one language, also in its FAQPage data; English shows them all.
  const pairs = Array.from({ length: HUB_FAQ[hub.key] }, (_, i) => [`${k}.faq.q${i + 1}`, paidKey(i + 1)]).filter(([qk, ak]) => t.own(qk) && t.own(ak));
  const faq = faqBlock(req, pairs, 'learn.faqHeading', { plans: '/plans', ai: lp(req, '/parents/ai-builder-safety') });
  const others = HUBS.filter(h => h !== hub);
  // Subject pages sit under the Learn tab (Home › Learn › Math games); signed in, Home is another tab, so it is left out.
  const crumbs = [[t('nav.home'), '/'], [t('learn.index.crumb'), '/learn'], [t(`${k}.name`), path]];
  const seenCrumbs = signedOut(req.user) ? crumbs : crumbs.slice(1);
  const body = html`<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${seenCrumbs.map(([name, p], i) => html`<li>${i < seenCrumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${raw(`<h1 id="lp-h1"${fb(t, `${k}.h1`)}><span aria-hidden="true">${hub.emoji}</span> ${tHtml(t, `${k}.h1`)}</h1>`)}
      ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
      ${band ? html`<p class="lp-grades"><span aria-hidden="true">🎒</span> ${el(t, 'span', 'learn.grades', band)}</p>` : ''}
    </section>
    ${hub.extra === 'builder' ? builder(req, t) : html`<section class="lp-sec" aria-label="${t('learn.gamesHeading')}">${list.length ? list.map(gameItem) : html`<p class="notice">${t('learn.noGames')}</p>`}</section>`}
    ${hub.extra === 'tracks' ? tracks(t) : ''}
    ${hub.extra === 'cs' ? csTeaser(req, t) : ''}
    <section class="panel" id="classroom" aria-labelledby="cls-h">${el(t, 'h2', 'learn.tipsHeading', {}, ' id="cls-h"')}${el(t, 'p', `${k}.tips`)}</section>
    ${HOME_TIPS.includes(hub.key) && t.own(`${k}.home`) ? html`<section class="panel" id="home" aria-labelledby="home-h">${el(t, 'h2', 'learn.homeHeading', {}, ' id="home-h"')}${el(t, 'p', `${k}.home`)}</section>` : ''}
    ${faq.markup}
    ${inClassLine(req)}
    <section class="lp-sec" aria-labelledby="more-h">${el(t, 'h2', 'learn.moreHeading', {}, ' id="more-h"')}
      <ul class="chips lp-more">${others.map(h => html`<li><a class="chip" href="${lp(req, `/learn/${h.slug}`)}"><span aria-hidden="true">${h.emoji}</span>${t(`learn.hubs.${h.key}.name`)}</a></li>`)}
        <li><a class="chip" href="${lp(req, '/teachers')}"><span aria-hidden="true">🍎</span>${t('learn.teachersLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/parents')}"><span aria-hidden="true">👪</span>${parentsLabel(t, 'learn.parentsLink')}</a></li></ul>
      ${t.own('learn.byAgeHeading') ? html`${el(t, 'h2', 'learn.byAgeHeading', {}, ' class="lp-sub"')}
      <ul class="chips lp-more">${AGES.map(a => html`<li><a class="chip" href="${lp(req, `/learn/${a.slug}`)}"><span aria-hidden="true">${a.emoji}</span>${t(`learn.ages.${a.key}.name`)}</a></li>`)}</ul>` : ''}
    </section>
  </div>`;
  const items = list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, `/g/${g.slug}`), name: g.title }));
  page(req, res, {
    title: t(`${k}.title`), description: t(`${k}.description`), body, bodyClass: 'lp-page', active: 'learn',
    seo: {
      index: true, path, langs: seo.langsWithKey(`${k}.h1`), image: list[0] && fsOg(list[0].slug) ? `/og/${list[0].slug}.jpg` : '/og/teachers.jpg', imageAlt: t(`${k}.h1`),
      jsonld: [seo.graph([
        { '@type': 'CollectionPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${k}.title`), description: t(`${k}.description`), isPartOf: { '@id': seo.abs(req, '/#website') }, audience: [{ '@type': 'EducationalAudience', educationalRole: 'teacher' }, { '@type': 'ParentAudience', childMinAge: seo.AGE.min, childMaxAge: seo.AGE.max }], ...(items.length ? { mainEntity: { '@type': 'ItemList', itemListElement: items } } : {}) },
        faq.ld, seo.breadcrumbLd(req, crumbs),
      ])],
    },
  });
});
