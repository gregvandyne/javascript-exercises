// /teachers (what Oomba Academy does in a classroom) and the subject pages /learn/<hub> (server/learn.js). Public pages
// written for teachers and for search engines. Every claim here is something the site does today; a feature that is
// off on this server (Sign in with Google, paid plans) is left out of the text, not described.
//
// Games are listed only when they are an official launch game anyone may open now (canView for a signed-out visitor):
// never a game a child made. The text is under teachers.* and learn.* in the locale files. Until a language has it, a
// paragraph shows the English, marked lang="en" dir="ltr", and search engines are told the page is English only.
import { liveOn } from '../services/classlive-sessions.js';
import { canHost, GROWNUP_OPEN_MAX, capacityFor, MODES as A_MODES } from '../services/classlive-access.js';
import { LIMITS as SET_LIMITS } from '../services/classlive-sets.js';
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { ico } from '../views/icon.js';
import { iconLine } from '../../public/js/icons.js';
import { folded } from './info.js';
import { page, notFound, parentsLabel, signedOut, VERSION, landingFor } from '../views/layout.js';
import { focusSections, topicOf, buildBanner, classStrip, homeDoors } from './discover.js';
import { courseOwned } from '../services/course-catalog.js';
/** A Play topic's Learn subject (the filters' subjects), for the games with no Learn subject of their own. */
const TOPIC_SUBJECT = { math: 'math', reading: 'words', geography: 'maps', strategy: 'thinking' };
import { coverArt, gameCard, rail } from '../views/components.js';
import { courseRow } from '../views/courses.js';
import { learnCard as glLearnCard } from '../views/grammar-lab.js';
import * as GLL from '../services/grammar-lab-listing.js';
import * as GLAB from '../services/grammar-lab.js';
import { reachOf as glReachOf, unitInReach as glUnitInReach } from '../services/grammar-lab-access.js';
import * as focus from '../services/game-focus.js';
import * as courses from '../services/courses.js';
import { log } from '../services/log.js';
import { liveGameOf } from '../live/live-games.js';
import { tHtml, availableLocales, keepLang } from '../i18n/index.js';
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
import { howFiles, howTour } from '../views/how.js';
import { lpPage, lpHeader, lpFooter, ctaButton, ARROW } from '../views/lp-shell.js';
import * as OT from '../standards/official-tags.js';
import { normId as stdNorm } from '../standards/ccss.js';
import { codeChips, attribution as stdNotice } from '../views/standards.js';
import { HUBS, hubBySlug, LEARNING, TEACHER_GAMES, HUB_FAQ, TEACHER_FAQ, HOME_TIPS, AGES, gradeBand, SUBJECTS, SHELF_INFO, shelfGrades, TWO_PLAYER } from '../learn.js';
import { teacherLoop } from '../views/teacher-loop.js';
import { shotScheme, themedPicture } from '../views/shot.js';
import { books } from '../services/library.js';
import * as H from '../services/homeroom.js';
import { KINDS as FIGURE_KINDS } from '../../public/js/figures-catalog.js';
import { grammarCompareOn, grammarFacts } from './compare.js';
import { loopLinks } from '../services/teach-loop.js';
import { seeIt, readyVideos, videoLink, videoReady, videoDialog } from '../views/see-it.js';
import { toolAccess, plansOn } from '../services/teacher-tools.js';
import { enabled as classroomOn } from '../services/gclassroom.js';

export const router = Router();
export const contactEmail = () => config.contactEmail || 'greg@oomba.ai';
const OG_DIR = new URL('../../public/og/', import.meta.url);
const HOW_DIR = new URL('../../public/img/how/', import.meta.url);
/** Is there a share picture for this launch game (scripts/og-images.js)? */
export const fsOg = slug => fs.existsSync(new URL(`${slug}.jpg`, OG_DIR));
// The one-minute demo video on /teachers/live (public/video, made by recording the real app: docs/decisions.md).
const VIDEO_DIR = new URL('../../public/video/', import.meta.url);
const demoFiles = fs.existsSync(new URL('oomba-demo.mp4', VIDEO_DIR)) && fs.existsSync(new URL('oomba-demo-poster.jpg', VIDEO_DIR));
// The /teachers/live demo was recorded with a Quest Race in it: shown only while the arcade games are on the site.
const hasDemo = () => demoFiles && !focus.arcadeHidden();
/** The questions on /teachers/live, in order (teachersLive.faq.q<n>, a<n>). The first, "Is Oomba Live free?", answers
 *  honestly (the owner, 27 Nov 2026): hosting, the question sets, the results and the ready-made courses cost nothing;
 *  the Teacher plan adds the paid tools (plans.teacher.li5, teacher-tools.js toolAccess, homeroom.js canUse). No amount:
 *  prices are on /plans only, and the answer links there only while paid plans are on for everyone. */
const LIVE_FAQ = [1, 2, 3, 4, 5];
/** The free courses by name (the courses' own names), for that answer; none while COURSES is off. */
const courseNames = req => { const t = req.t; const names = ['cs', 'nq', 'cd'].map(k => t(`landing.courses.${k}.name`));
  if (/^en/.test(req.locale || 'en')) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  try { return new Intl.ListFormat(t.intl || req.locale || 'en', { type: 'conjunction' }).format(names); } catch { return names.join(', '); } };

/** lang/dir for an element whose text is still the English (see routes/info.js). */
export const fb = (t, key) => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
/** One string as an element, marked when it is the English fallback. */
export const el = (t, tag, key, vars, attrs = '') => raw(`<${tag}${attrs}${fb(t, key)}>${tHtml(t, key, vars)}</${tag}>`);
/** The pill above a page's heading ("🍎 For teachers"): its leading emoji drawn as the site's icon (public/js/icons.js). */
export const kickerEl = (t, key) => raw(`<p class="lp-kicker"${fb(t, key)}>${iconLine(t(key), 18)}</p>`);
/** A page's links stay in the language address the reader came in on (/es/learn/… -> /es/g/…). */
export const lp = (req, path) => (req.pathLocale && seo.localizable(path) ? seo.localeUrl(path, req.pathLocale) : path);

/** An official launch game a signed-out visitor may open, in the page's language; null otherwise. */
export function launchGame(slug) {
  const g = games.getGameBySlug(slug);
  if (!g || g.source !== 'seed' || !games.canView(null, g) || focus.gameHidden(g)) return null;
  return games.localizeGame(g);
}
/** FAQ pairs [question key, answer key] -> markup, plus the plain text for FAQPage structured data. */
export function faqBlock(req, pairs, headingKey, vars = {}, { fold = false, lp: lpLook = false, unlink = [] } = {}) {
  const t = req.t;
  const ld = seo.faqLd(pairs.map(([qk, ak]) => [t(qk), seo.plainText(t(ak, vars))]));
  // lp: the teacher site's look (/teachers, /teachers/live; public/css/landing.css): the homepage's questions, each a card
  // that opens, the first one open. unlink: answers whose links are left out (a link to a page that is not there).
  if (lpLook) {
    const answer = ak => (unlink.includes(ak) ? raw(String(el(t, 'p', ak, vars)).replace(/<\/?a\b[^>]*>/g, '')) : el(t, 'p', ak, vars));
    return {
      markup: html`<section class="lp-sec lp-alt" id="faq" aria-labelledby="faq-h"><div class="lp-wrap lp-narrow">
    <header class="lp-head lp-c">${el(t, 'p', 'landing.nav.faq', {}, ' class="lp-eyebrow"')}${el(t, 'h2', headingKey, {}, ' id="faq-h"')}</header>
    <div class="lp-faq">${pairs.map(([qk, ak], i) => html`<details class="lp-card"${i === 0 ? raw(' open') : ''}><summary>${el(t, 'h3', qk)}<span class="lp-plus" aria-hidden="true"></span></summary>${answer(ak)}</details>`)}</div>
  </div></section>`,
      ld,
    };
  }
  // fold: each answer folds away under its question (the /parents page, kept short; the answers are still on the page and
  // in the FAQ structured data).
  return {
    markup: html`<section class="panel faq lp-faq" id="faq" aria-labelledby="faq-h">${el(t, 'h2', headingKey, {}, ' id="faq-h"')}
      ${pairs.map(([qk, ak]) => (fold ? folded(el(t, 'h3', qk), el(t, 'p', ak, vars)) : html`${el(t, 'h3', qk)}${el(t, 'p', ak, vars)}`))}</section>`,
    ld,
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
  // Signed out: the one sign-up (routes/onboarding.js; docs/decisions.md "One sign-up"): the teacher's account, then
  // create or join their school, then their classes. A teacher who already runs a school tells us about it here. A
  // grown-up (parent) account, or the platform admin, still sends a plain request (family accounts never join a school).
  if (signedOut(u)) {
    return html`${failed ? el(t, 'p', 'teachers.setup.errors.again', {}, ' class="err"') : ''}${el(t, 'p', 'teachers.setup.signupLead')}
      <p class="row"><a class="btn btn-primary btn-big" href="/signup/for/teacher" id="setup-signup" rel="nofollow">${t('teachers.setup.signupCta')}</a></p>
      <p class="small">${t('auth.page.haveAccount')} <a href="/login?next=${encodeURIComponent(`${back}#start`)}">${t('auth.page.signInLink')}</a></p>`;
  }
  const mine = isSchoolStaff(u) ? schoolsOf(u.id).filter(x => x.role !== 'student' && canManageSchool(u, x.id)) : [];
  const staffForm = mine.length > 0;
  const knownEmail = staffForm ? ((addressOf(u.id) || {}).email || '') : '';
  return html`${el(t, 'p', staffForm ? 'teachers.setup.leadStaff' : 'teachers.setup.lead')}
    <form class="sr-form" data-api="/api/teachers/school-request" data-next="${back}?sent=1#start" method="post" action="/api/teachers/school-request" novalidate>
      <input type="hidden" name="back" value="${back}">
      <div class="sr-grid">
        ${staffForm ? html`<div class="field">${lab('sr-school-id', 'teachers.setup.yourSchool')}
          <select class="input" id="sr-school-id" name="schoolId">${mine.map(x => html`<option value="${x.id}">${x.name}</option>`)}</select>${errs('sr-school-id')}</div>`
        : html`<div class="field">${lab('sr-name', 'teachers.setup.name')}
          <input class="input" id="sr-name" name="name" maxlength="${SR.LIMITS.name}" autocomplete="name">${errs('sr-name')}</div>
        <div class="field">${lab('sr-school', 'teachers.setup.school')}
          <input class="input" id="sr-school" name="school" required minlength="2" maxlength="${SR.LIMITS.school}" autocomplete="organization">${errs('sr-school')}</div>`}
        <div class="field">${lab('sr-role', 'teachers.setup.role')}
          <select class="input" id="sr-role" name="role" required><option value="">${t('teachers.setup.rolePick')}</option>${SR.ROLES.map(r => html`<option value="${r}">${t(`teachers.setup.roles.${r}`)}</option>`)}</select>${errs('sr-role')}</div>
        <div class="field">${lab('sr-email', 'teachers.setup.email')}
          <input class="input" id="sr-email" name="email" type="email" dir="ltr" required maxlength="${SR.LIMITS.email}" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="sr-email-hint" value="${knownEmail}">
          ${el(t, 'span', staffForm ? 'teachers.setup.emailHintSignup' : 'teachers.setup.emailHint', {}, ' class="hint" id="sr-email-hint"')}${errs('sr-email')}</div>
        <div class="field">${lab('sr-students', 'teachers.setup.students')}
          <input class="input" id="sr-students" name="students" type="number" inputmode="numeric" required min="1" max="${SR.LIMITS.studentsMax}" step="1">${errs('sr-students')}</div>
        <div class="field">${lab('sr-country', 'teachers.setup.country')}
          <input class="input" id="sr-country" name="country" required minlength="2" maxlength="${SR.LIMITS.country}" autocomplete="country-name">${errs('sr-country')}</div>
      </div>
      <div class="sr-hp" aria-hidden="true"><label for="sr-website">Website</label><input id="sr-website" name="website" tabindex="-1" autocomplete="off"></div>
      ${failed ? el(t, 'p', 'teachers.setup.errors.again', {}, ' class="err"') : ''}
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-big" type="submit">${t(staffForm ? 'teachers.setup.submitStaff' : 'teachers.setup.submit')}</button>
      ${el(t, 'p', staffForm ? 'teachers.setup.privacySignup' : 'teachers.setup.privacy', { privacy: '/privacy?for=grownups#schoolSetup' }, ' class="small muted"')}
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
  return html`<section class="lp-sec lp-quotes${preview ? ' lp-quotes-preview' : ''}" id="teachers-say" aria-labelledby="quotes-h"><div class="lp-wrap">
    <header class="lp-head">${el(t, 'h2', 'teachers.quotes.h', {}, ' id="quotes-h"')}</header>
    ${preview ? html`<p class="lp-plan" lang="en" dir="ltr">Owner preview: only platform admins see this. The section stays hidden until TEACHER_QUOTES in server/routes/teachers.js has real quotes.</p>` : ''}
    <ul class="lp-quote-list">${list.map(x => html`<li><figure class="lp-card lp-quote" lang="${x.lang || 'en'}"><blockquote><p>${x.quote}</p></blockquote>
      <figcaption><b>${x.name}</b>${x.role ? html`, ${x.role}` : ''}${x.school ? html`, ${x.school}` : ''}</figcaption></figure></li>`)}</ul>
  </div></section>`;
}

/** A tick list in the teacher site's look: each line a key (vars for all). */
const ticks = (t, keys, vars = {}, cls = 'lp-list') => html`<ul class="${cls}">${keys.map(k => html`<li><span class="lp-tick" aria-hidden="true">✓</span>${el(t, 'span', k, vars)}</li>`)}</ul>`;

/** Google Classroom for teachers (only when it is on here): the words are teachers.classroom.*, the same as "/". */
function classroomSection(req) {
  if (!classroomOn()) return '';
  const t = req.t;
  return html`<section class="lp-sec" id="classroom" aria-labelledby="classroom-h"><div class="lp-wrap">
    <header class="lp-head">${el(t, 'p', 'teachers.classroom.kicker', {}, ' class="lp-eyebrow"')}${el(t, 'h2', 'teachers.classroom.h', {}, ' id="classroom-h"')}${el(t, 'p', 'teachers.classroom.lead', {}, ' class="lp-sub"')}</header>
    <div class="lp-card lp-gc">
      ${ticks(t, ['li1', 'li2', 'li3', 'li4', 'li5'].map(k => `teachers.classroom.${k}`))}
      <p class="lp-small">${el(t, 'span', 'teachers.classroom.note')} <a href="/privacy#google">${t('teachers.classroom.privacy')}</a></p>
    </div>
  </div></section>`;
}

/** Every teaching tool, right under the /teachers hero (docs/decisions.md "Teachers and Parents pages: lead with the
 *  new tools, no 'always free'", and the owner's "show everything we now offer teachers" of 27 Nov 2026): a real
 *  screenshot of each (scripts/tools-shots.js, scripts/how-shots.js --only dash, and the homepage's tool shots from
 *  scripts/landing-shots.mjs), a line, and a link, as the homepage's tool cards (public/css/landing.css .lp-tool). The
 *  first PREVIEW cards show; the rest fold open under "Show all", like the homepage's manipulative videos. The words are
 *  the homepage's own where it says the same thing (landing.tools.*, landing.hub.*), so the two pages never disagree.
 *  Links: someone who can open a tool goes to it (with paid plans on, school staff without the Teacher plan get the plan
 *  page at the same address: routes/figures.js planReply); anyone else plays the tool's one-minute video in the page's
 *  player (views/see-it.js videoLink; without script, the video file), or goes to the game's own page for the games anyone
 *  may try. Who may use a tool is still teacher-tools.js toolAccess and homeroom.js canUse.
 *  plan: a Teacher plan tool (the Hub, the Manipulatives and their rooms, Figures), "Available with the Teacher plan"
 *  under its card, as on the homepage, whether or not paid plans are on for everyone yet; the line links to /plans only
 *  while that page is there. No amount here: prices are on /plans only.
 *  Grammar Lab only while it is open to every visitor (compare.js grammarCompareOn, the gate /compare and "/" use). */
const how = name => ({ name, src: `/img/how/${name}-d-1024.webp`, srcset: `/img/how/${name}-d-1024.webp 1024w, /img/how/${name}-d-2048.webp 2048w`, w: 1024, h: 640,
  dark: fs.existsSync(new URL(`${name}-dark-d-1024.webp`, HOW_DIR)) ? `/img/how/${name}-dark-d-1024.webp 1024w, /img/how/${name}-dark-d-2048.webp 2048w` : null,
  ok: () => howFiles(name).slice(2).every(f => fs.existsSync(new URL(f, HOW_DIR))) });
const LANDING_DIR = new URL('../../public/img/landing/', import.meta.url);
const shot = (name, darkName) => ({ name, src: `/img/landing/${name}-640.webp`, srcset: `/img/landing/${name}-640.webp 640w, /img/landing/${name}-1280.webp 1280w`, w: 640, h: 400,
  dark: darkName && fs.existsSync(new URL(`${darkName}-1200.webp`, LANDING_DIR)) ? `/img/landing/${darkName}-1200.webp 1200w, /img/landing/${darkName}-2400.webp 2400w` : null,
  ok: () => fs.existsSync(new URL(`${name}-640.webp`, LANDING_DIR)) && fs.existsSync(new URL(`${name}-1280.webp`, LANDING_DIR)) });
// The hub's picture is 1200 x 750 (1.6, like the others): its own srcset.
const hubShot = () => ({ ...shot('hub-light', 'hub-dark'), src: '/img/landing/hub-light-1200.webp', srcset: '/img/landing/hub-light-1200.webp 1200w, /img/landing/hub-light-2400.webp 2400w', w: 1200, h: 750,
  ok: () => fs.existsSync(new URL('hub-light-1200.webp', LANDING_DIR)) });
const bookCount = () => { const n = books().length; return n >= 100 ? `${Math.floor(n / 50) * 50}+` : String(n); };
/** "A, B and C" in the page's language (the bands of Grammar Lab), English without the serial comma, as on "/". */
const listOf = (req, items) => { if (/^en/.test(req.locale || 'en')) return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items.join(''); try { return new Intl.ListFormat(req.t.intl || req.locale || 'en', { type: 'conjunction' }).format(items); } catch { return items.join(', '); } };
/** How many cards show before "Show all". */
export const TOOLS_PREVIEW = 6;
/** id, icon, picture, and the words: k (own keys under teachers.tools.<id>) or h/p/alt keys of the homepage's.
 *  video: the tool's one-minute video (views/see-it.js VIDEOS) its card plays. */
export const TOOL_CARDS = [
  { id: 'hub', icon: '🏫', pic: hubShot(), h: 'landing.hub.kicker', p: 'landing.hub.lead', alt: 'landing.hub.shotAlt', plan: true, video: 'hub-promo',
    staff: '/classes', open: 'teachers.tools.dash.open', can: u => H.canUse(u) },
  { id: 'board', icon: '🧮', pic: how('tools-board'), plan: true, video: 'manipulatives', staff: '/manipulatives', can: u => !!toolAccess(u, config.manipulatives) },
  { id: 'room', icon: '📡', pic: how('tools-live'), plan: true, video: 'room', staff: '/manipulatives', can: u => !!toolAccess(u, config.manipulatives) },
  { id: 'dash', icon: '🖥️', pic: how('dash-teacher'), video: 'dashboard', staff: '/teach', can: u => isSchoolStaff(u) },
  { id: 'figures', icon: '📐', pic: shot('tool-figures'), h: 'landing.tools.figures.h', p: 'landing.tools.figures.p', alt: 'landing.tools.figures.alt', plan: true, video: 'figures',
    vars: () => ({ count: FIGURE_KINDS.length }) },
  { id: 'live', icon: '🎮', pic: shot('tool-brain-board'), h: 'landing.tools.live.h', p: 'landing.tools.live.p', alt: 'landing.tools.live.alt', show: () => liveOn(),
    href: req => lp(req, '/teachers/live'), linkKey: 'teachers.live.more' },
  { id: 'read', icon: '📚', pic: shot('tool-library'), h: 'landing.tools.read.h', p: 'landing.tools.read.p', alt: 'landing.tools.read.alt', vars: () => ({ count: bookCount() }), href: () => '/read' },
  { id: 'typing', icon: '💻', pic: shot('tool-typing-zoo'), h: 'landing.tools.typing.h', p: 'landing.tools.typing.p', alt: 'landing.tools.typing.alt', game: 'typing-zoo' },
  { id: 'flash', icon: '🗂️', pic: shot('tool-flashcards'), game: 'flashcards' },
  { id: 'atlas', icon: '🗺️', pic: shot('tool-atlas-quest'), h: 'landing.tools.atlas.h', alt: 'landing.tools.atlas.alt', game: 'atlas-quest' },
  { id: 'hunt', icon: '🔍', pic: shot('tool-mistake-hunt'), h: 'landing.tools.grammar.h', p: 'landing.tools.grammar.p', alt: 'landing.tools.grammar.alt', game: 'mistake-hunt' },
  { id: 'grammar', icon: '✏️', pic: shot('tool-grammar-lab'), show: () => grammarCompareOn(), vars: req => { const f = grammarFacts(); return { topics: f.topics, bands: listOf(req, f.bands) }; }, href: () => '/courses/grammar-lab' },
];
/** The cards shown here now: switched on, with their picture, and (games) open to every visitor. */
const toolCardsNow = () => TOOL_CARDS.filter(c => (!c.show || c.show()) && c.pic.ok() && (!c.game || launchGame(c.game)));
/** The coloured top edge of each card, in turn (the homepage's). */
const EDGES = ['var(--mint)', 'var(--spark)', '#3F8FCF', '#7A3FC4', '#E06A00', '#1E8E4E', '#C2185B'];
/** A tool's picture in the page's theme. */
const toolPic = (req, c, sizes, { alt = '', lazy = true } = {}) => raw(themedPicture({ scheme: shotScheme(req),
  img: { src: c.pic.src, srcset: c.pic.srcset, sizes, width: c.pic.w, height: c.pic.h, alt, lazy, type: 'image/webp', dark: c.pic.dark ? { srcset: c.pic.dark } : null } }));
function toolsShowcase(req) {
  const t = req.t;
  const cards = toolCardsNow();
  if (!cards.length) return '';
  const planLine = familiesOn(req) ? String(tHtml(t, 'landing.plan.on', { plans: '/plans' })) : String(tHtml(t, 'landing.plan.on', { plans: '/plans' })).replace(/<\/?a\b[^>]*>/g, '');
  const card = (c, i) => {
    const k = `teachers.tools.${c.id}`, hk = c.h || `${k}.h`, pk = c.p || `${k}.p`, ak = c.alt || `${k}.alt`, vars = c.vars ? c.vars(req) : {};
    const staff = !!req.user && !!c.can && c.can(req.user);
    const href = staff ? c.staff : c.game ? keepLang(req, `/g/${c.game}`) : c.href ? c.href(req) : '';
    const label = staff ? t(c.open || `${k}.open`) : c.game || (c.href && !c.linkKey) ? t('teachers.tools.try') : c.linkKey ? t(c.linkKey) : t('teachers.tools.watch');
    const link = href ? html`<a class="lp-more" href="${href}">${label} ${ARROW}</a>`
      : c.video && videoReady(c.video) ? videoLink(t, c.video, html`${t('teachers.tools.watch')} ${ARROW}`, 'lp-more') : '';
    return html`<article class="lp-card lp-tool lp-s2" id="tool-${c.id}" style="--edge:${EDGES[i % EDGES.length]}">
      <div class="lp-pic">${toolPic(req, c, '(min-width: 1100px) 370px, (min-width: 1000px) 30vw, (min-width: 620px) 46vw, 92vw', { alt: t(ak) })}</div>
      <div class="lp-tx">${raw(`<h3${fb(t, hk)}>`)}${ico(c.icon, { size: 28, lazy: true })} ${t(hk, vars)}${raw('</h3>')}${el(t, 'p', pk, vars)}
      ${c.plan ? html`<p class="lp-plan"${fb(t, 'landing.plan.on')}>${raw(planLine)}</p>` : ''}${link}</div>
    </article>`;
  };
  const first = cards.slice(0, TOOLS_PREVIEW), rest = cards.slice(TOOLS_PREVIEW);
  return html`<section class="lp-sec" id="tools" aria-labelledby="tools-h"><div class="lp-wrap">
    <header class="lp-head">${el(t, 'p', 'landing.nav.tools', {}, ' class="lp-eyebrow"')}${el(t, 'h2', 'landing.tools.h', {}, ' id="tools-h"')}${el(t, 'p', 'teachers.tools.lead', {}, ' class="lp-sub"')}</header>
    <div class="lp-tools">${first.map(card)}</div>
    ${rest.length ? html`<details class="lp-howmore lp-toolsmore"><summary class="lp-btn lp-btn-ghost"><span class="lp-howmore-o"${fb(t, 'teachers.tools.more')}>${t('teachers.tools.more', { count: cards.length })}</span><span class="lp-howmore-c"${fb(t, 'teachers.tools.less')}>${t('teachers.tools.less')}</span></summary>
    <div class="lp-tools">${rest.map((c, i) => card(c, i + TOOLS_PREVIEW))}</div></details>` : ''}
    ${el(t, 'p', 'teachers.tools.plan', {}, ' class="lp-small lp-center tt-note"')}
  </div></section>`;
}

/** The /teachers hero's picture: the tools' real screens in one collage (the homepage's), a student's screen on a phone
 *  in front, and the Hub's one-minute video (the homepage's hero video) on it. Decoration: the tiles' names are its label. */
function toolsCollage(req) {
  const t = req.t;
  const by = Object.fromEntries(toolCardsNow().map(c => [c.id, c]));
  const TILES = [['board', 'lp-t-main', '(min-width: 1100px) 660px, 92vw'], ['hub', 'lp-t-a', '(min-width: 1100px) 360px, 46vw'], ['room', 'lp-t-b', '(min-width: 1100px) 360px, 46vw'], ['dash', 'lp-t-c', '(min-width: 1100px) 360px, 46vw'], ['figures', 'lp-t-d', '(min-width: 1100px) 360px, 46vw']];
  if (!TILES.every(([id]) => by[id])) return '';
  const name = c => t(c.h || `teachers.tools.${c.id}.h`, c.vars ? c.vars(req) : {});
  const phone = 'tools-student';
  const phoneOk = fs.existsSync(new URL(`${phone}-p-390.webp`, HOW_DIR)) && fs.existsSync(new URL(`${phone}-p-780.webp`, HOW_DIR));
  return html`<div class="lp-collage">
      <div class="lp-collage-in" role="img" aria-label="${TILES.map(([id]) => name(by[id])).join(', ')}">
        ${TILES.map(([id, cls, sizes]) => html`<figure class="lp-tile ${cls}"><div class="lp-shot">${toolPic(req, by[id], sizes, { lazy: false })}</div><figcaption${fb(t, by[id].h || `teachers.tools.${id}.h`)}>${name(by[id])}</figcaption></figure>`)}
        ${phoneOk ? html`<div class="lp-t-chat lp-t-phone lp-shot"><img src="/img/how/${phone}-p-390.webp" srcset="/img/how/${phone}-p-390.webp 390w, /img/how/${phone}-p-780.webp 780w" sizes="150px" width="390" height="844" alt="" decoding="async"></div>` : ''}
      </div>
      ${videoReady('hub-promo') ? videoLink(t, 'hub-promo', html`<i aria-hidden="true"></i><span${fb(t, 'landing.hero.watch')}>${t('landing.hero.watch')}<small${fb(t, 'landing.hero.watchSub')}>${t('landing.hero.watchSub')}</small></span>`, 'lp-playbtn') : ''}
    </div>`;
}

/** The teacher site's frame for /teachers and /teachers/live (views/lp-shell.js): its header (the sections of "/", and
 *  this page's own tools, videos and questions), its footer without the other products' names, and the page. */
function teacherSite(req, res, { path, langKey, title, description, seo: seoOpts, main, here = {}, app = false }) {
  const t = req.t;
  const full = t('layout.titleWith', { title });
  const desc = seo.clip(description, 160);
  lpPage(req, res, {
    title: full, description: desc, seo: seoOpts, app, main,
    header: lpHeader(req, { here, videos: readyVideos().length > 0 }),
    footer: lpFooter(req, { path, langs: seo.langsWithKey(langKey) }),
  });
}

// ---------------------------------------------------------------------------------------------------- /teachers
// In the homepage's design (docs/decisions.md "Teachers pages in the homepage's design"; public/css/landing.css), in
// order: the hero (what Oomba does for teachers, the main button and Host a live lesson, the tools' screens in one
// collage with the Hub's video); every tool; how it works (the homepage's click-through tour); the teaching loop; the
// tool videos; Google Classroom (while it is on); "And much more", the folded cards; teacher quotes (none yet); the
// questions; the start block (set up your school). No "always free": prices and what each plan includes are on /plans
// only. The main button is the teacher site's one call to action (views/lp-shell.js teacherCta), the same as the top bar's.
router.get('/teachers', (req, res) => {
  const t = req.t;
  const google = googleEnabled();
  const email = contactEmail();
  const mail = html`<a href="mailto:${email}" dir="ltr">${email}</a>`;
  const langCount = availableLocales().length;
  const list = TEACHER_GAMES.map(launchGame).filter(Boolean);
  const badges = ['teachers.badges.ads', 'teachers.badges.browser', ...(google ? ['teachers.badges.google'] : []), 'teachers.badges.ages'];
  const classItems = ['li1', 'li2', ...(google ? ['li3'] : []), 'li4', 'li5'];
  // With Sign in with Google on, a student's school Google email is kept: answers that say otherwise have a Google version.
  // With paid-plan pages on, the first question says what the Teacher plan adds (no prices: those are on /plans).
  const paidFaq = familiesOn(req);
  const faqPairs = Array.from({ length: TEACHER_FAQ }, (_, i) => [`teachers.faq.q${i + 1}${i === 0 && paidFaq ? 'paid' : ''}`, `teachers.faq.a${i + 1}${(i === 3 || i === 5) && google ? 'google' : ''}${i === 0 && paidFaq ? 'paid' : ''}`]);
  const faq = faqBlock(req, faqPairs, 'teachers.faq.h', { href: '/privacy', count: langCount, host: siteHost(req) }, { lp: true });
  const plans = familiesOn(req);
  const tryBtn = (cls = 'lp-btn lp-btn-onink lp-btn-big') => (list[0] ? html`<a class="${cls}" href="${keepLang(req, `/play/${list[0].slug}`)}" rel="nofollow">${ico('▶️', { size: 18 })} ${t('teachers.cta.try')}</a>` : '');
  // Host a live lesson now: the second button, for anyone who may host or might (signed out, a guest), never a child.
  const hostBtn = liveOn() && !(req.user && !req.user.is_guest && !canHost(req.user))
    ? html`<a class="lp-btn lp-btn-ghost lp-btn-big" href="${canHost(req.user) ? '/live/quick' : '/teachers/host'}" id="host-now" data-cta="host">${ico('📡', { size: 24 })} ${el(t, 'span', 'quickLive.cta')}</a>` : '';
  // ?sent=1: the thank-you after the form (nothing it said is shown back); ?failed=1: a form sent without JavaScript
  // that needs fixing (the JavaScript form shows each field's own message instead).
  const sent = req.query.sent === '1', failed = req.query.failed === '1';
  // The start block: the homepage's last call (dark), with the school set-up (setupBlock, unchanged) in it; a form or a
  // thank-you sits on its own light card there (public/css/landing.css .lp-setup).
  const startPanel = html`<section class="lp-final lp-start" id="start" aria-labelledby="start-h">
    ${el(t, 'h2', 'teachers.start.h', {}, ' id="start-h"')}
    ${el(t, 'p', 'teachers.start.p1')}
    <div class="lp-setup">${setupBlock(req, { sent, failed })}</div>
    ${plans ? el(t, 'p', 'teachers.start.plans', { days: config.teacherTrialDays, daily: req.fmt.int(config.teacherDailyMessages) }, ' class="lp-fine"') : ''}
    <div class="lp-ctas">
      ${plans ? html`<a class="lp-btn lp-btn-spark lp-btn-big" href="/trial">${t('plans.teacher.start')}</a><a class="lp-btn lp-btn-onink lp-btn-big" href="/plans/schools">${t('teachers.start.plansLink')}</a>` : ''}
      ${tryBtn()}
    </div>
    ${el(t, 'p', 'teachers.setup.questions', { email: mail }, ' class="lp-fine"')}
  </section>`;
  const hero = html`<section class="lp-hero lp-dots" aria-labelledby="lp-h1"><div class="lp-wrap">
    <div class="lp-hero-copy">
      ${kickerEl(t, 'teachers.kicker')}
      ${el(t, 'h1', 'teachers.h1', {}, ' id="lp-h1" class="lp-h1"')}
      ${el(t, 'p', 'teachers.lead', {}, ' class="lp-lead"')}
      <div class="lp-ctas">${ctaButton(req, { big: true, id: 'main-cta' })}${hostBtn}</div>
      <ul class="lp-trust">${badges.map(k => el(t, 'li', k))}</ul>
      <p class="lp-small lp-leader">${tHtml(t, 'teachers.leaderLine', { href: '#start' })}</p>
    </div>
    ${toolsCollage(req)}
  </div></section>`;
  // "And much more": the five folded cards (the homepage's questions' look), each its own section.
  const fold = (id, body) => html`<section class="lp-card lp-foldcard" id="${id}" aria-labelledby="${id}-h"><details><summary>${el(t, 'h3', `teachers.${id}.h`, {}, ` id="${id}-h"`)}<span class="lp-plus" aria-hidden="true"></span></summary><div class="lp-fold-in">${body}</div></details></section>`;
  const more = html`<section class="lp-sec" id="more" aria-labelledby="more-h"><div class="lp-wrap">
    <header class="lp-head lp-c lp-head-sm">${el(t, 'h2', 'landing.one.kicker', {}, ' id="more-h" class="lp-eyebrow"')}</header>
    <div class="lp-faq lp-folds">
      ${fold('build', html`${el(t, 'p', 'teachers.build.p1')}${el(t, 'p', 'teachers.build.p2')}<p><a class="lp-more" href="${lp(req, '/learn/make-a-game')}">${t('teachers.build.link')} ${ARROW}</a></p>`)}
      ${fold('class', ticks(t, classItems.map(k => `teachers.class.${k}`)))}
      ${fold('safe', html`${ticks(t, ['li1', google ? 'li2google' : 'li2', 'li3', 'li4'].map(k => `teachers.safe.${k}`))}<p class="lp-small">${tHtml(t, 'teachers.safe.links', { safety: lp(req, '/safety'), privacy: '/privacy' })}</p>`)}
      ${liveOn() ? fold('live', html`${el(t, 'p', 'teachers.live.p1')}${ticks(t, ['li1', 'li2', 'li3'].map(k => `teachers.live.${k}`))}<p><a class="lp-btn lp-btn-primary lp-btn-sm" href="${lp(req, '/teachers/live')}">${t('teachers.live.more')}</a></p>`) : ''}
      ${fold('uses', html`${el(t, 'p', 'teachers.uses.p')}<ul class="lp-tags">${['li1', 'li2', 'li3', 'li4', 'li5', 'li6', 'li7'].map(k => el(t, 'li', `teachers.uses.${k}`))}</ul>
      ${el(t, 'h4', 'teachers.languages.h')}${el(t, 'p', 'teachers.languages.p', { count: langCount })}
      <p><a href="/research">${t('teachers.research.link')}</a> · <a href="${lp(req, '/compare')}">${t('compare.link')}</a></p>`)}
    </div>
  </div></section>`;
  const main = html`${sent ? startPanel : ''}${hero}
  ${toolsShowcase(req)}
  ${howTour(req, 'teachers', { kicker: 'teachers.how.kicker' })}
  ${teacherLoop(t, { variant: 'landing', links: isSchoolStaff(req.user) ? loopLinks(req.user) : null, live: liveOn(), scheme: shotScheme(req) })}
  ${seeIt(req, { variant: 'landing', note: false, promo: true })}
  ${classroomSection(req)}
  ${more}
  ${quotesSection(req)}
  ${faq.markup}
  ${sent ? '' : startPanel}`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers']];
  teacherSite(req, res, {
    path: '/teachers', langKey: 'teachers.h1', title: t('teachers.title'), description: t('teachers.description'), main,
    here: { tools: '#tools', videos: '#see-it', faq: '#faq' },
    // The set-up form for signed-in grown-ups and staff posts as JSON with each field's own message (public/js/app.js).
    app: !signedOut(req.user) && !sent,
    seo: {
      index: true, path: '/teachers', langs: seo.langsWithKey('teachers.h1'), image: '/og/teachers.jpg', imageAlt: t('seo.teachers.imageAlt'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, '/teachers'), url: seo.abs(req, '/teachers'), name: t('teachers.title'), description: t('teachers.description'), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: { '@type': 'EducationalAudience', educationalRole: 'teacher' } },
        faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- /teachers/live
// Oomba Live for teachers, in the homepage's design: live games on every device (the board's code with a phone joining
// and a phone answering, the one-minute video under them), the modes as cards, how it works (the click-through tour),
// your own questions, the tools and the safety rules, the rest of Oomba, the questions and a way in (hosting needs a
// teacher or grown-up account: canHost). 404 while live games are off.
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
  const BADGES = ['ads', 'noAccounts', 'browser', 'languages'];
  const courseOn = !focus.coursesHidden();
  const vars = { max: config.liveMaxPlayers, open: GROWNUP_OPEN_MAX, items: SET_LIMITS.items, plans: '/plans', courses: courseOn ? courseNames(req) : '' };
  const a1 = courseOn ? 'teachersLive.faq.a1' : 'teachersLive.faq.a1NoCourses';
  const faq = faqBlock(req, LIVE_FAQ.map(n => [`teachersLive.faq.q${n}`, n === 1 ? a1 : `teachersLive.faq.a${n}`]), 'teachersLive.faq.h', vars, { lp: true, unlink: plansOn() ? [] : [a1] });
  // Each mode says how many players it is made for (classlive-access.js CAPACITY, docs/live-capacity.md).
  const MODE_ID = { race: 'quest-race', battle: 'battle', board: 'board', wyr: 'wyr', atlas: 'atlas', tug: 'tug', doodle: 'doodle' };
  const modes = [['🏝️', 'race'], ['⚡', 'battle'], ['🌟', 'board'], ['🤔', 'wyr'], ['🌍', 'atlas'], ['🪢', 'tug'], ['🦉', 'doodle']].filter(([, k]) => !focus.slugHidden(A_MODES[MODE_ID[k]]));
  // Three cards a row; a last row of two takes half the width each.
  const span = i => (modes.length % 3 === 2 && i >= modes.length - 2 ? 'lp-s3' : 'lp-s2');
  const mode = ([emoji, k], i) => { const c = capacityFor({ mode: MODE_ID[k] });
    return html`<article class="lp-card lp-tool lp-noshot lp-mode ${span(i)}" style="--edge:${EDGES[i % EDGES.length]}"><div class="lp-tx">
      <span class="lp-ico" aria-hidden="true">${ico(emoji, { size: 44, lazy: true })}</span>${el(t, 'h3', `teachersLive.modes.${k}.h`)}${el(t, 'p', `teachersLive.modes.${k}.p`)}
      <p class="lp-meta"><span class="lp-chip lp-mode-players">${ico('👥', { size: 16 })} ${t('live.landing.best', { min: c.best[0], max: c.best[1] })}</span></p></div></article>`; };
  const mainBtn = kid ? html`<a class="lp-btn lp-btn-primary lp-btn-big" href="/join">${t('teachersLive.cta.join')}</a>`
    : html`<a class="lp-btn lp-btn-primary lp-btn-big" href="${hostHref}" data-cta="host">${t('teachersLive.cta.host')} ${ARROW}</a>`;
  // The picture: the board with its code, a phone joining with that code and a phone answering (scripts/how-shots.js
  // --only live), and under it the one-minute video (its description, for anyone who can't watch it, as the caption).
  const phone = (slug, cls) => (fs.existsSync(new URL(`${slug}-p-390.webp`, HOW_DIR)) ? html`<div class="lp-phone ${cls}">${raw(themedPicture({ scheme: shotScheme(req),
    img: { src: `/img/how/${slug}-p-390.webp`, srcset: `/img/how/${slug}-p-390.webp 390w, /img/how/${slug}-p-780.webp 780w`, sizes: '(min-width: 700px) 150px, 132px', width: 390, height: 844, alt: '', type: 'image/webp',
      dark: fs.existsSync(new URL(`${slug}-dark-p-390.webp`, HOW_DIR)) ? { srcset: `/img/how/${slug}-dark-p-390.webp 390w, /img/how/${slug}-dark-p-780.webp 780w` } : null } }))}</div>` : '');
  const board = how('live-lobby');
  const devices = board.ok() ? html`<figure class="lp-devices" id="demo"${hasDemo() ? raw(' aria-describedby="demo-note"') : ''}>
      <div class="lp-devices-in" aria-hidden="true">
        <div class="lp-shot">${toolPic(req, { pic: board }, '(min-width: 1040px) 700px, (min-width: 700px) 66vw, 92vw', { lazy: false })}</div>
        ${phone('live-join', 'lp-phone-a')}${phone('live-play', 'lp-phone-b')}
      </div>
      ${hasDemo() ? html`<figcaption>${videoLink(t, 'demo', html`<i aria-hidden="true"></i><span${fb(t, 'teachersLive.demo.h')}>${t('teachersLive.demo.h')}</span>`, 'lp-playbtn', t('teachersLive.demo.h'))}
      ${el(t, 'p', 'teachersLive.demo.note', {}, ' class="lp-small" id="demo-note"')}</figcaption>${videoDialog(t)}` : ''}
    </figure>` : '';
  const hero = html`<section class="lp-hero lp-dots" aria-labelledby="lp-h1"><div class="lp-wrap">
    <div class="lp-hero-copy">
      ${kickerEl(t, 'teachersLive.kicker')}
      ${el(t, 'h1', 'teachersLive.h1', {}, ' id="lp-h1" class="lp-h1"')}
      ${el(t, 'p', 'teachersLive.lead', {}, ' class="lp-lead"')}
      <div class="lp-ctas">${mainBtn}<a class="lp-btn lp-btn-ghost lp-btn-big" href="#how-it-works">${t('teachersLive.cta.how')}</a></div>
      <ul class="lp-trust">${BADGES.map(k => el(t, 'li', `teachersLive.badges.${k}`, { count: langCount }))}</ul>
      ${kid ? '' : html`<p class="lp-small lp-leader"><a href="/join">${t('teachersLive.cta.join')}</a></p>`}
    </div>
    ${devices}
  </div></section>`;
  const main = html`${hero}
  <section class="lp-sec" id="modes" aria-labelledby="modes-h"><div class="lp-wrap">
    <header class="lp-head">${el(t, 'p', 'teachersLive.modes.kicker', {}, ' class="lp-eyebrow"')}${el(t, 'h2', 'teachersLive.modes.h', {}, ' id="modes-h"')}</header>
    <div class="lp-tools lp-modes">${modes.map(mode)}</div>
  </div></section>
  ${howTour(req, 'teachersLive', { kicker: 'teachers.how.kicker', after: kid ? '' : html`<p class="lp-center lp-after">${mainBtn}</p>` })}
  <section class="lp-sec" id="own" aria-labelledby="own-h"><div class="lp-wrap">
    <header class="lp-head">${el(t, 'h2', 'teachersLive.own.h', {}, ' id="own-h"')}${el(t, 'p', 'teachersLive.own.p', {}, ' class="lp-sub"')}</header>
    <div class="lp-card lp-gc">${ticks(t, [1, 2, 3, 4, 5].map(n => `teachersLive.own.li${n}`), {}, 'lp-list lp-list-2')}</div>
  </div></section>
  <section class="lp-sec lp-alt lp-sec-pair" aria-label="${t('teachersLive.tools.h')}, ${t('teachersLive.safe.h')}"><div class="lp-wrap">
    <div class="lp-pair">
      <section class="lp-card" id="tools" aria-labelledby="tools-h">${el(t, 'h2', 'teachersLive.tools.h', {}, ' id="tools-h"')}${ticks(t, [1, 2, 3, 4, 5, 6, 7].map(n => `teachersLive.tools.li${n}`))}</section>
      <section class="lp-card" id="safe" aria-labelledby="safe-h">${el(t, 'h2', 'teachersLive.safe.h', {}, ' id="safe-h"')}${ticks(t, [1, 2, 3, 4].map(n => `teachersLive.safe.li${n}`))}
        ${el(t, 'p', 'teachersLive.safe.link', { safety: lp(req, '/safety') }, ' class="lp-small"')}</section>
    </div>
    <section class="lp-band" id="more" aria-labelledby="more-h">
      <div>${el(t, 'h2', 'teachersLive.more.h', {}, ' id="more-h"')}${el(t, 'p', 'teachersLive.more.p')}</div>
      <a class="lp-band-link" href="${lp(req, '/teachers')}">${t('teachersLive.more.link')} ${ARROW}</a>
    </section>
  </div></section>
  ${faq.markup}
  <section class="lp-final lp-start" id="start" aria-labelledby="start-h">
    ${el(t, 'h2', 'teachersLive.start.h', {}, ' id="start-h"')}
    ${el(t, 'p', kid ? 'teachersLive.start.kid' : host ? 'teachersLive.start.signedIn' : 'quickLive.ctaNote')}
    <div class="lp-ctas">${mainBtn}${kid ? '' : html`<a class="lp-btn lp-btn-onink lp-btn-big" href="/join">${t('teachersLive.cta.join')}</a>`}</div>
  </section>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t('teachersLive.kicker'), '/teachers/live']];
  teacherSite(req, res, {
    path: '/teachers/live', langKey: 'teachersLive.h1', title: t('teachersLive.title'), description: t('teachersLive.description'), main,
    here: { faq: '#faq' },
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
    <p><a class="btn btn-primary" href="/build">${ico('🛠️', { size: 18 })} ${t('learn.hubs.makeAGame.cta')}</a></p></section>
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
    <p><a class="btn btn-primary" href="${lp(req, '/teachers/cs-quest')}">${ico('💻', { size: 18 })} ${t('learn.hubs.cs.program.link')}</a></p></section>`;

/** "Using this in class? See Oomba Academy for teachers." on the subject, age and game pages, for signed-out visitors
 *  and guests (a teacher who found a game from a search); empty for anyone with an account, and in a language that
 *  hasn't got the sentence yet (a translated page stays in one language). */
export const inClassLine = req => (signedOut(req.user) && req.t.own('learn.inClass') ? el(req.t, 'p', 'learn.inClass', { href: lp(req, '/teachers') }, ' class="lp-aside small in-class"') : '');

// ---------------------------------------------------------------------------------------------------- /learn
// The Learn tab (docs/decisions.md "Play and Learn", "Learn and Read"): every game, the same page for everyone. Play and
// Learn are one page now. By default the games are by topic (Play's topic chips and sections, each official game in one,
// My favorites first); a subject or "how you play" filter shows the filtered grid (Learn's), and a grade narrows either
// view. Filters (subject, grade, how you play) are plain links and a GET form in a <details> (open while one is chosen),
// so they work without scripts; a filtered view is noindex and /learn stays the page search engines see (its heading,
// lead, subject and age pages and structured data, signed out). School staff always see the grid, with Assign (to their
// classes), Host live (live modes), Try it and ?std= on the cards, as before; nobody else does. '/' is this page for
// those who land on it (landingFor null), with the signed-out home's heading, doors and structured data there.
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8'];
const HOWS = ['solo', 'two', 'live'];
/** Each course's subject and grades, for the filters and the card's "Subject · Grades" line: the same grades as the
 *  course's own subtitle (courses.<key>.sub; Cyber Defenders has two bands, 3-5 and 6-8). */
const COURSE_INFO = { 'cs-quest': { subject: 'code', from: 3, to: 8 }, 'cyber-defenders': { subject: 'code', from: 3, to: 8 }, 'number-quest': { subject: 'math', from: 0, to: 8 } };
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

export function learnPage(req, res, { landing = false } = {}) {
  const t = req.t, u = req.user;
  const out = signedOut(u);
  const staff = !out && isSchoolStaff(u);
  const defGrade = out || staff ? '' : rosterGrade(u);
  const f = learnFilters(req.query, defGrade);
  const filtered = !!(f.subject || f.grade || f.how);
  // Links stay in the language address the page was opened at (/es -> /es/teachers).
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  // With a roster grade, "Any grade" has to say so in the address (grade=any), or the default would come back.
  const gradeQ = g => g || (defGrade ? 'any' : '');
  const live = liveOn();
  const subjName = k => t(`learn.tab.subjects.${k}`);
  // A card's "Subject · Grades" line: the subject the filters use (subjectOf: Sudoku is Math), the Learn grades.
  const meta = g => { const i = SHELF_INFO[g.slug]; const gr = shelfGrades(g.slug); return i ? t('learn.tab.meta', { subject: subjName(subjectOf(g)), grades: t('learn.grades', gr) }) : null; };
  const href = over => { const p = { ...f, ...over }; p.grade = gradeQ(p.grade); const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return lp(req, '/learn') + (qs ? `?${qs}` : '') + '#filters'; };
  const card = (href, emoji, name, short) => html`<li><a class="lp-hub panel" href="${lp(req, href)}"><span class="lp-hub-e" aria-hidden="true">${ico(emoji, { size: 32 })}</span><span>${el(t, 'span', name, {}, ' class="lp-hub-t"')}${el(t, 'span', short, {}, ' class="lp-hub-d"')}</span></a></li>`;
  const crumbs = [[t('nav.home'), '/'], [t('learn.index.crumb'), '/learn']];
  // Learn is a tab: signed in, it needs no breadcrumb ("Home" is another tab, or another first page, for them).
  const seenCrumbs = out ? crumbs : [];

  // Staff only: the Common Core codes each official game practises (server/standards/official-tags.js), and ?std= to
  // keep the games that practise a code or a code's start ("3.OA", "RF.K"). Never shown to kids or visitors.
  const std = staff ? stdNorm(String(req.query.std || '').slice(0, 24)).replace(/\.$/, '') : '';
  // Every official game anyone may open, from both shelves (Play and Learn are one page). A game's subject is its topic's
  // (the same section it has on the topics view: Sudoku is Math), else its Learn subject (a live game, Coding); a game
  // without grades fits every grade.
  const subjectOf = g => TOPIC_SUBJECT[topicOf(g)] || (SHELF_INFO[g.slug] || {}).subject || '';
  // Course-owned games are reached through their course (its card), never listed as games of their own.
  const all = games.listVisible(u, { official: true, order: 'plays', limit: 100 }).filter(g => !courseOwned(g) && (subjectOf(g) || !(f.subject || std)));
  const infoOf = g => ({ from: 0, to: 8, ...SHELF_INFO[g.slug], subject: subjectOf(g) });
  // The grid (Learn's filtered view) for staff, and for anyone who picked a subject or a way to play; else the topics.
  const gridView = staff || !!(f.subject || f.how);
  // A filter chosen in the address (not only a student's roster grade): the filters stay open, with a way back.
  const asked = !!(f.subject || f.how || std || req.query.grade !== undefined);
  const codesOf = slug => ['ccss-math', 'ccss-ela'].map(fw => [fw, OT.gameCodes(slug, fw)]).filter(([, c]) => c.length);
  const hasStd = slug => codesOf(slug).some(([, c]) => c.some(x => x === std || x.startsWith(`${std}.`) || x.startsWith(std)));
  const pass = all.filter(g => fits(infoOf(g), f) && (!std || hasStd(g.slug)));
  // Live class games: the Oomba Live modes (while Live is on), in their own section; the rest in the grid.
  const liveList = live && f.how !== 'solo' && f.how !== 'two' ? pass.filter(g => liveGameOf(g)) : [];
  const grid = f.how === 'live' ? [] : pass.filter(g => !liveList.includes(g) && !(live && liveOnly(g))).filter(g => f.how !== 'two' || isTwo(g));
  // One main action per card for staff (Host live for a live mode, else Assign), and Try it as a smaller link (not on
  // live class games: the owner took it off them, 25 Nov 2026; Host live is their one way in).
  const acts = g => {
    if (!staff) return '';
    const l = liveGameOf(g);
    const main = l && live ? html`<a class="btn btn-sm btn-hot" href="/live?mode=${l.mode}">${ico('📡', { size: 18 })} ${t('learn.tab.host')}</a>`
      : l && !l.play ? '' : html`<a class="btn btn-sm btn-primary" href="/teach/assign?game=${g.slug}">${ico('📌', { size: 18 })} ${t('learn.tab.assign')}</a>`;
    return html`${codesOf(g.slug).map(([fw, c]) => codeChips(t, fw, c, { fold: 3 }))}<div class="lcard-acts">${main}${l ? '' : html`<a class="lcard-try" href="${keepLang(req, `/play/${l ? l.solo : g.slug}`)}">▶ ${t('learn.tab.try')}</a>`}<a class="lcard-try" href="/build/save?id=${g.id}">${ico('📁', { size: 18 })} ${t('folders.save')}</a></div>`;
  };
  const cards = list => html`<ul class="cardgrid lcards">${list.map(g => html`<li class="lcard">${gameCard(g, { meta: meta(g) })}${acts(g)}</li>`)}</ul>`;
  // Courses (not in the "two players" or "live" views): progress for players, Assign for staff.
  let courseMarkup = '';
  // A ?std= filter applies to games only: the course cards (whose codes are by step, not by course) are left out then.
  if (f.how !== 'two' && f.how !== 'live' && !std && !focus.coursesHidden()) {   // courses hidden: never listed here, not even for the admin (the owner, 24 Nov 2026); assigned course lessons still open from the class
    try {
      // Each course card carries the same "Subject · Grades" line as the game cards.
      const courseMeta = c => { const i = COURSE_INFO[c.slug]; return i ? t('learn.tab.meta', { subject: subjName(i.subject), grades: t('learn.grades', { from: i.from === 0 ? 'K' : String(i.from), to: String(i.to) }) }) : null; };
      const items = courses.COURSES.filter(c => fits(COURSE_INFO[c.slug], f)).map(c => ({ course: c, games: courses.courseGames(u, c), ov: courses.overview(u, c), meta: courseMeta(c) }));
      // "My courses" once a player has begun one (picked a band); "Courses" until then.
      const mine = !out && !staff && !isGrownup(u) && items.some(it => it.ov && it.ov.band);
      courseMarkup = items.length ? courseRow(items, { staff, title: mine ? t('learn.tab.myCourses') : null }) : '';
    } catch (e) { log('error', 'learn courses', { error: e.message }); }
  }
  // Grammar Lab (behind GRAMMAR_LAB: services/grammar-lab-access.js, grammar-lab-listing.js): its own card for whoever
  // it lets in (a student with assigned work too), whatever COURSES says, under the same subject and grade filters as
  // the courses (Words, grades K-12). A visitor without a session sees it only while it is open to everyone
  // (GRAMMAR_LAB_USERS=*), so an indexed page never lists it while it is for testers.
  if (f.how !== 'two' && f.how !== 'live' && !std && GLL.listedFor(u) && !isGrownup(u) && fits(GLL.INFO, f)) {
    try {
      const reach = glReachOf(u);
      const units = reach.all ? [] : GLAB.bands().flatMap(b => GLAB.pathwaysOf(b.id)).filter(p => glUnitInReach(reach, p.id));
      const prog = units.map(p => GLAB.unitProgress(u, p, reach));
      const done = staff ? 0 : reach.all ? GLAB.masteredSet(u).size : prog.reduce((n, x) => n + x.done, 0);
      courseMarkup = html`${courseMarkup}${glLearnCard({ t, staff, done, total: reach.all ? 0 : prog.reduce((n, x) => n + x.total, 0), begun: done > 0,
        meta: GLL.metaLine(t) })}`;
    } catch (e) { log('error', 'learn grammar lab', { error: e.message }); }
  }
  // Games other players made (any kind: Play and Learn are one page), on the topics view: signed in only (an indexed page
  // never carries a child's name or words), and only while PUBLIC_GAMES is on (services/games.js openToAll).
  const players = !config.publicGames || out || gridView ? [] : games.listVisible(u, { limit: 16, order: 'popular' }).filter(g => g.source !== 'seed' && !courseOwned(g));
  const subj = SUBJECTS.find(x => x.key === f.subject);
  // While the arcade is hidden (services/game-focus.js), the subject chips and pages with no game left are left out.
  const subjects = focus.openSubjects(SUBJECTS, SHELF_INFO), hubs = focus.openHubs(HUBS);
  const chip = (on, link, label, emoji = '') => html`<a class="chip${on ? ' on' : ''}" href="${link}" rel="nofollow"${on ? raw(' aria-current="true"') : ''}>${emoji ? html`<span aria-hidden="true">${emoji}</span>` : ''}${label}</a>`;
  // Kids' "Got a game code from your teacher?" (grown-ups and staff have Join in the top bar), under the games.
  const joinDoor = live && !staff && !isGrownup(u) ? html`<div class="home-join learn-join"><a class="door door-join" href="/join" id="learn-join"><span class="door-e" aria-hidden="true">${ico('🎟️', { size: 40 })}</span><span class="door-t"><span class="door-h">${t('learn.tab.joinH')}</span><span class="door-s">${t('live.entry.join')}</span></span><span class="door-go flip" aria-hidden="true">›</span></a></div>` : '';
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
    return html`<li><a class="lp-hub panel" href="${lp(req, `/learn/${h.slug}`)}"><span class="lp-hub-e" aria-hidden="true">${ico(h.emoji, { size: 32 })}</span><span><span class="lp-hub-t">${t('learn.tab.hubNamed', { subject: subjName(sx.key), hub: t(`learn.hubs.${h.key}.name`) })}</span>${el(t, 'span', `learn.hubs.${h.key}.short`, {}, ' class="lp-hub-d"')}</span></a></li>`; };
  const forVisitors = out || staff || isGrownup(u);
  const kidEnd = !out && !staff && !isGrownup(u);
  const liveSec = liveList.length ? html`<section class="lp-sec" id="live-games" aria-labelledby="live-games-h"><h2 id="live-games-h">${ico('📡', { size: 28 })} ${t('learn.tab.live')}</h2>
      <p class="small muted">${staff ? t('learn.tab.liveStaff') : t('learn.tab.liveText')}</p>${cards(liveList)}</section>` : '';
  // The games by topic (routes/discover.js focusSections), each narrowed to the grade chosen (a game without grades fits
  // every grade). Live class games come first for a student in a class (their teacher starts them).
  const gradeFits = g => !f.grade || !SHELF_INFO[g.slug] || fits({ ...SHELF_INFO[g.slug], subject: '' }, { grade: f.grade });
  const topicSecs = gridView ? [] : focusSections(u).sections.map(sec => ({ ...sec, games: sec.games.filter(gradeFits) })).filter(sec => sec.games.length);
  if (liveFirst) topicSecs.sort((a, b) => (b.id === 'live') - (a.id === 'live'));
  // My favorites: the games this player tapped Favorite on (students too), that they may still open. No section until there is one.
  const favs = gridView || out ? [] : games.favorites(u, u.id, 16).filter(g => !courseOwned(g));
  const mine = gridView || out ? [] : games.myGames(u.id, 12);
  // The home page's own heading, doors and join door: '/' signed out (where the teacher landing page is not at '/').
  const homeIntro = landing && out;
  const howName = h => t(`learn.tab.hows.${h}`);
  const gradeName = g => (g === 'K' ? t('learn.tab.gradeK') : t('learn.tab.gradeN', { n: g }));
  const now = [f.subject && subjName(f.subject), f.grade && gradeName(f.grade), f.how && howName(f.how)].filter(Boolean);
  const filterForm = html`<form class="learn-filters" id="filters" method="get" action="${lp(req, '/learn')}" aria-label="${t('learn.tab.filters')}">
      <div class="chips scroll" role="group" aria-label="${t('learn.tab.subject')}">
        ${chip(!f.subject, href({ subject: '' }), t('learn.tab.subjects.all'))}
        ${subjects.map(x => chip(f.subject === x.key, href({ subject: x.key }), subjName(x.key), x.emoji))}
      </div>
      <div class="learn-filter-row">
        <label class="learn-grade"><span>${t('learn.tab.grade')}</span>
          <select class="input" name="grade" data-autosubmit>${[[defGrade ? 'any' : '', t('learn.tab.gradeAny')], ...GRADES.map(g => [g, gradeName(g)])].map(([v, l]) => html`<option value="${v}"${(f.grade || (defGrade ? 'any' : '')) === v ? raw(' selected') : ''}>${l}</option>`)}</select></label>
        ${staff ? html`<span class="learn-std-row"><label class="learn-std"><span>${t('standards.learn.label')}</span><input class="input" name="std" value="${std}" maxlength="24" placeholder="${t('standards.learn.hint')}" dir="ltr" autocomplete="off"></label>
          <button class="btn learn-std-go" type="submit">${t('learn.tab.filter')}</button></span>` : ''}
        ${f.subject ? html`<input type="hidden" name="subject" value="${f.subject}">` : ''}${f.how ? html`<input type="hidden" name="how" value="${f.how}">` : ''}
        <button class="btn" type="submit" data-nojs>${t('learn.tab.filter')}</button>
      </div>
      <div class="chips learn-how" role="group" aria-label="${t('learn.tab.how')}">
        <span class="small muted learn-how-l" aria-hidden="true">${t('learn.tab.how')}</span>
        ${chip(!f.how, href({ how: '' }), t('learn.tab.howAll'))}
        ${HOWS.filter(h => h !== 'live' || live).map(h => chip(f.how === h, href({ how: h }), howName(h), { solo: '🙂', two: '👥', live: '📡' }[h]))}
      </div>
    </form>`;
  // Staff: the filters as before, always open. Everyone else: one quiet "Filter the games" line under the topic chips
  // that opens them (open while a filter is chosen, with Show all games to go back to the topics).
  const filters = staff ? filterForm : html`<details class="learn-filterbox"${asked ? raw(' open') : ''}>
      <summary><span class="lf-ico" aria-hidden="true">${ico('🔎', { size: 18 })}</span><span class="lf-t">${t('learn.tab.filters')}</span>${now.length ? html`<span class="lf-now">${now.join(' · ')}</span>` : ''}</summary>
      ${filterForm}
      ${asked ? html`<p class="learn-clear"><a href="${lp(req, '/learn')}${defGrade ? '?grade=any' : ''}">${ico('✕', { size: 16 })} ${t('learn.tab.clear')}</a></p>` : ''}
    </details>`;
  const topicChips = !gridView && (topicSecs.length > 1 || favs.length) ? html`<nav class="chips scroll topic-chips" aria-label="${t('home.topics.label')}">
      ${favs.length ? html`<a class="chip" href="#favorites-h">${ico('❤️', { size: 18 })}${t('home.rails.favorites')}</a>` : ''}
      ${topicSecs.map(sec => html`<a class="chip" href="#sec-${sec.id}-h">${ico(sec.emoji, { size: 18 })}${t(sec.key)}</a>`)}
    </nav>` : '';
  const heading = homeIntro ? html`<section class="home-intro" aria-labelledby="home-h1"><h1 id="home-h1"${fb('home.intro.heading')}>${t('home.intro.heading')}</h1><p${fb('home.intro.text')}>${t('home.intro.text')}</p>
      ${homeDoors(req)}
      ${live ? html`<div class="home-join"><a class="door door-join" href="/join" id="home-join"><span class="door-e">${ico('🎟️', { size: 40 })}</span><span class="door-t"><span class="door-h"${fb('live.entry.join')}>${t('live.entry.join')}</span><span class="door-s"${fb('live.entry.joinShort')}>${t('live.entry.joinShort')}</span></span><span class="door-go flip" aria-hidden="true">›</span></a></div>` : ''}
      <ul class="chips home-subjects" aria-label="${t('teachers.subjects.h')}">${hubs.map(h => html`<li><a class="chip" href="${lp(req, `/learn/${h.slug}`)}"><span aria-hidden="true">${h.emoji}</span><span${fb(`learn.hubs.${h.key}.name`)}>${t(`learn.hubs.${h.key}.name`)}</span></a></li>`)}</ul></section>`
    : out ? html`<section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'h1', 'learn.index.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'learn.index.lead', {}, ' class="lead"')}
    </section>` : html`<div class="pagehead learn-head"><h1 id="lp-h1">${ico('💡', { size: 36 })} ${t('learn.tab.h1')}</h1><p class="muted">${staff ? t('learn.tab.leadStaff') : t(focus.coursesHidden() ? 'learn.tab.leadGames' : 'learn.tab.lead')}</p></div>${classStrip(req)}`;
  const gridMarkup = html`${subj && subj.hub ? html`<p class="learn-more"><a href="${lp(req, `/learn/${subj.hub}`)}">${t('learn.tab.moreAbout', { subject: subjName(subj.key) })} <span class="flip" aria-hidden="true">→</span></a></p>` : ''}
    ${courseMarkup}
    ${liveFirst ? liveSec : ''}
    ${grid.length || !liveList.length ? html`<section class="lp-sec" id="learn-games" aria-labelledby="learn-games-h"><h2 id="learn-games-h">${ico('🎓', { size: 28 })} ${t('learn.tab.games')}</h2>
      ${grid.length ? cards(grid) : html`<p class="notice">${t('learn.tab.none')} <a href="${lp(req, '/learn')}${defGrade ? '?grade=any' : ''}#filters">${t('learn.tab.clear')}</a></p>`}
      ${staff && [...grid, ...liveList].some(g => codesOf(g.slug).length) ? stdNotice(t) : ''}</section>` : ''}
    ${liveFirst ? '' : liveSec}`;
  const topicMarkup = html`${favs.length ? rail({ title: t('home.rails.favorites'), emoji: '❤️', games: favs, user: u, id: 'favorites', more: '/favorites' }) : ''}
    ${courseMarkup}
    ${topicSecs.map(sec => rail({ title: t(sec.key), emoji: sec.emoji, games: sec.games, user: u, id: `sec-${sec.id}` }))}
    ${!topicSecs.length ? html`<p class="notice">${t('learn.tab.none')} <a href="${lp(req, '/learn')}${defGrade ? '?grade=any' : ''}">${t('learn.tab.clear')}</a></p>` : ''}
    ${buildBanner(req)}
    ${mine.length ? rail({ title: t('home.rails.mine'), emoji: '🛠️', games: mine, user: u, id: 'mine', more: '/build' }) : ''}
    ${players.length ? rail({ title: t('home.focus.players'), emoji: '✨', games: players, user: u, id: 'players', more: '/search?sort=popular' }) : ''}`;
  const body = html`<div class="lp learn-tab">
    ${seenCrumbs.length && !homeIntro ? html`<nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${seenCrumbs.map(([name, p], i) => html`<li>${i < seenCrumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>` : ''}
    ${heading}
    <div id="play" class="learn-games-wrap">
    ${topicChips}
    ${filters}
    ${gridView ? gridMarkup : topicMarkup}
    </div>
    ${kidEnd || homeIntro ? '' : joinDoor}
    ${homeIntro ? '' : html`<section class="lp-sec" id="subjects" aria-labelledby="subj-h">${el(t, 'h2', 'learn.index.subjects', {}, ' id="subj-h"')}
      <ul class="lp-hubs">${SUBJECTS.map(x => hubs.find(h => h.slug === x.hub)).filter(Boolean).map(hubCard)}</ul></section>
    <section class="lp-sec" id="also" aria-labelledby="also-h"><h2 id="also-h">${t('learn.tab.also')}</h2>
      <ul class="lp-hubs">${hubs.filter(h => !subjectHub(h)).map(hubCard)}</ul></section>`}
    ${forVisitors && !homeIntro ? html`<section class="lp-sec" id="ages" aria-labelledby="ages-h">${el(t, 'h2', 'learn.index.ages', {}, ' id="ages-h"')}
      <ul class="lp-hubs">${AGES.map(a => card(`/learn/${a.slug}`, a.emoji, `learn.ages.${a.key}.name`, `learn.ages.${a.key}.short`))}</ul></section>
    <section class="lp-sec" id="who" aria-labelledby="who-h">${el(t, 'h2', 'learn.index.who', {}, ' id="who-h"')}
      <ul class="chips lp-more"><li><a class="chip" href="${lp(req, '/teachers')}">${ico('🍎', { size: 18 })}${t('learn.teachersLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/parents')}">${ico('👪', { size: 18 })}${parentsLabel(t, 'learn.parentsLink')}</a></li></ul></section>` : ''}
    ${kidEnd ? joinDoor : ''}
  </div>`;
  const items = [...hubs.map(h => [`/learn/${h.slug}`, t(`learn.hubs.${h.key}.name`)]), ...AGES.map(a => [`/learn/${a.slug}`, t(`learn.ages.${a.key}.name`)])]
    .map(([p, name], i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, p), name }));
  if (!out) res.set('Cache-Control', 'private, no-store');
  // '/' (landing): the home page's title, description and structured data, as the Play page had.
  if (landing) {
    return page(req, res, { title: '', active: 'learn', body, bodyClass: 'lp-page learn-page', scripts: ['/js/learn.js'], description: t.own('seo.home.description') ? t('seo.home.description') : t('layout.description'),
      ...(staff ? { head: raw(`<link rel="stylesheet" href="/css/standards.css?v=${VERSION}">`) } : {}),
      seo: Object.keys(req.query).length && filtered ? null : {
        index: true, path: '/', langs: seo.langsWithKey('home.intro.heading'), image: '/og/site.jpg', imageAlt: t('seo.home.imageAlt'),
        jsonld: [seo.graph([seo.organizationLd(req), seo.websiteLd(req, req.locale)])],
      } });
  }
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
}
router.get('/learn', (req, res) => learnPage(req, res));
// '/' is the Learn page for everyone who lands on it (signed out, guests, kids, the platform admin; the teacher landing
// page answers '/' first for visitors with no session: routes/landing.js); everyone else goes to their own first tab
// (layout.js landingFor: Class, Classroom, School, Family). Never cached, so a signed-in redirect is never served to
// anyone else. The query string goes along (?utm_source=…, a ?code= from a poster).
router.get('/', (req, res) => {
  const to = landingFor(req.user);
  if (to) { const qs = req.originalUrl.indexOf('?'); res.set('Cache-Control', 'private, no-store'); return res.redirect(302, to + (qs >= 0 ? req.originalUrl.slice(qs) : '')); }
  learnPage(req, res, { landing: true });
});

router.get('/learn/:hub', (req, res) => {
  const hub = hubBySlug(req.params.hub);
  if (!hub || req.params.hub !== hub.slug || !focus.openHubs(HUBS).includes(hub)) return notFound(req, res);
  const t = req.t; const k = `learn.hubs.${hub.key}`;
  const list = hub.games.map(launchGame).filter(Boolean);
  const path = `/learn/${hub.slug}`;
  const band = gradeBand(list.map(g => g.slug));
  const gameItem = g => html`<article class="panel lp-hubgame" aria-labelledby="g-${g.slug}">
      <a class="lp-hubgame-art" href="${lp(req, `/g/${g.slug}`)}" tabindex="-1" aria-hidden="true">${coverArt(g)}</a>
      <div class="lp-hubgame-text">
        <h2 id="g-${g.slug}"><a href="${lp(req, `/g/${g.slug}`)}">${g.title}</a></h2>
        ${t.own(`learn.games.${LEARNING[g.slug].key}`) ? html`<p class="lp-practise"><b>${t('learn.practise')}</b> ${t(`learn.games.${LEARNING[g.slug].key}`)}</p>` : html`<p class="ugc">${g.description}</p>`}
        <div class="row"><a class="btn btn-primary" href="${keepLang(req, `/play/${g.slug}`)}" rel="nofollow">▶ ${t('learn.play')}</a><a class="btn" href="${lp(req, `/g/${g.slug}`)}">${t('learn.about')}</a></div>
      </div></article>`;
  // The make-a-game page's "How much does it cost?" names the optional plans (never a price) only while they are public.
  const paidKey = n => (familiesOn(req) && t.has(`${k}.faq.a${n}paid`) ? `${k}.faq.a${n}paid` : `${k}.faq.a${n}`);
  // Questions, the "At home" paragraph and the make-a-game page's extra sections show in a language only once it has
  // them (t.own), so a translated page stays in one language, also in its FAQPage data; English shows them all.
  const pairs = Array.from({ length: HUB_FAQ[hub.key] }, (_, i) => [`${k}.faq.q${i + 1}`, paidKey(i + 1)]).filter(([qk, ak]) => t.own(qk) && t.own(ak));
  const faq = faqBlock(req, pairs, 'learn.faqHeading', { plans: '/plans', ai: lp(req, '/parents/ai-builder-safety') });
  const others = focus.openHubs(HUBS).filter(h => h !== hub);
  // Subject pages sit under the Learn tab (Home › Learn › Math games); signed in, Home is another tab, so it is left out.
  const crumbs = [[t('nav.home'), '/'], [t('learn.index.crumb'), '/learn'], [t(`${k}.name`), path]];
  const seenCrumbs = signedOut(req.user) ? crumbs : crumbs.slice(1);
  const body = html`<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${seenCrumbs.map(([name, p], i) => html`<li>${i < seenCrumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${raw(`<h1 id="lp-h1"${fb(t, `${k}.h1`)}><span aria-hidden="true">${hub.emoji}</span> ${tHtml(t, `${k}.h1`)}</h1>`)}
      ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
      ${band ? html`<p class="lp-grades">${ico('🎒', { size: 18 })} ${el(t, 'span', 'learn.grades', band)}</p>` : ''}
    </section>
    ${hub.extra === 'builder' ? builder(req, t) : html`<section class="lp-sec" aria-label="${t('learn.gamesHeading')}">${list.length ? list.map(gameItem) : html`<p class="notice">${t('learn.noGames')}</p>`}</section>`}
    ${hub.extra === 'tracks' && !focus.slugHidden('sum-racer') ? tracks(t) : ''}
    ${hub.extra === 'cs' && !focus.coursesHidden() ? csTeaser(req, t) : ''}
    ${hub.key === 'words' && GLL.listedFor(req.user) && !isGrownup(req.user) ? glLearnCard({ t, staff: !signedOut(req.user) && isSchoolStaff(req.user), meta: GLL.metaLine(t) }) : ''}
    <section class="panel" id="classroom" aria-labelledby="cls-h">${el(t, 'h2', 'learn.tipsHeading', {}, ' id="cls-h"')}${el(t, 'p', `${k}.tips`)}</section>
    ${HOME_TIPS.includes(hub.key) && t.own(`${k}.home`) ? html`<section class="panel" id="home" aria-labelledby="home-h">${el(t, 'h2', 'learn.homeHeading', {}, ' id="home-h"')}${el(t, 'p', `${k}.home`)}</section>` : ''}
    ${faq.markup}
    ${inClassLine(req)}
    <section class="lp-sec" aria-labelledby="more-h">${el(t, 'h2', 'learn.moreHeading', {}, ' id="more-h"')}
      <ul class="chips lp-more">${others.map(h => html`<li><a class="chip" href="${lp(req, `/learn/${h.slug}`)}"><span aria-hidden="true">${h.emoji}</span>${t(`learn.hubs.${h.key}.name`)}</a></li>`)}
        <li><a class="chip" href="${lp(req, '/teachers')}">${ico('🍎', { size: 18 })}${t('learn.teachersLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/parents')}">${ico('👪', { size: 18 })}${parentsLabel(t, 'learn.parentsLink')}</a></li></ul>
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
