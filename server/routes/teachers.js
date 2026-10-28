// /teachers (what Oomba Academy does in a classroom) and the subject pages /learn/<hub> (server/learn.js). Public pages
// written for teachers and for search engines. Every claim here is something the site does today; a feature that is
// off on this server (Sign in with Google, paid plans) is left out of the text, not described.
//
// Games are listed only when they are an official launch game anyone may open now (canView for a signed-out visitor):
// never a game a child made. The text is under teachers.* and learn.* in the locale files. Until a language has it, a
// paragraph shows the English, marked lang="en" dir="ltr", and search engines are told the page is English only.
import express, { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page, notFound, parentsLabel, signedOut } from '../views/layout.js';
import { coverArt } from '../views/components.js';
import { tHtml, availableLocales } from '../i18n/index.js';
import { config } from '../config.js';
import { googleEnabled } from '../oidc.js';
import { familiesOn } from '../services/family.js';
import { isGrownup } from '../auth.js';
import { isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import * as SR from '../services/school-requests.js';
import { allow, count, ipOf } from '../services/ratelimit.js';
import { siteHost } from '../site.js';
import * as games from '../services/games.js';
import * as seo from '../seo.js';
import { HUBS, hubBySlug, LEARNING, TEACHER_GAMES, HUB_FAQ, TEACHER_FAQ, HOME_TIPS, AGES, gradeBand } from '../learn.js';

export const router = Router();
export const contactEmail = () => config.contactEmail || 'greg@oomba.ai';
const OG_DIR = new URL('../../public/og/', import.meta.url);
/** Is there a share picture for this launch game (scripts/og-images.js)? */
export const fsOg = slug => fs.existsSync(new URL(`${slug}.jpg`, OG_DIR));

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
      ${el(t, 'p', 'teachers.setup.thanks.p1')}${el(t, 'p', 'teachers.setup.thanks.p2', {}, ' style="margin-bottom:0"')}</div>`;
  }
  if (!maySetUpSchool(req.user)) return el(t, 'p', 'teachers.setup.kid', {}, ' class="notice"');
  const back = lp(req, '/teachers');
  const lab = (id, key) => el(t, 'label', key, {}, ` for="${id}"`);
  const errs = id => raw(`<span class="err" id="${id}-err" aria-live="polite"></span>`);
  return html`${el(t, 'p', 'teachers.setup.lead')}
    <form class="sr-form" data-api="/api/teachers/school-request" data-next="${back}?sent=1#start" method="post" action="/api/teachers/school-request" novalidate>
      <input type="hidden" name="back" value="${back}">
      <div class="sr-grid">
        <div class="field">${lab('sr-school', 'teachers.setup.school')}
          <input class="input" id="sr-school" name="school" required minlength="2" maxlength="${SR.LIMITS.school}" autocomplete="organization">${errs('sr-school')}</div>
        <div class="field">${lab('sr-role', 'teachers.setup.role')}
          <select class="input" id="sr-role" name="role" required><option value="">${t('teachers.setup.rolePick')}</option>${SR.ROLES.map(r => html`<option value="${r}">${t(`teachers.setup.roles.${r}`)}</option>`)}</select>${errs('sr-role')}</div>
        <div class="field">${lab('sr-email', 'teachers.setup.email')}
          <input class="input" id="sr-email" name="email" type="email" dir="ltr" required maxlength="${SR.LIMITS.email}" autocomplete="email" autocapitalize="off" spellcheck="false" aria-describedby="sr-email-hint">
          ${el(t, 'span', 'teachers.setup.emailHint', {}, ' class="hint" id="sr-email-hint"')}${errs('sr-email')}</div>
        <div class="field">${lab('sr-students', 'teachers.setup.students')}
          <input class="input" id="sr-students" name="students" type="number" inputmode="numeric" required min="1" max="${SR.LIMITS.studentsMax}" step="1">${errs('sr-students')}</div>
        <div class="field">${lab('sr-country', 'teachers.setup.country')}
          <input class="input" id="sr-country" name="country" required minlength="2" maxlength="${SR.LIMITS.country}" autocomplete="country-name">${errs('sr-country')}</div>
      </div>
      <div class="sr-hp" aria-hidden="true"><label for="sr-website">Website</label><input id="sr-website" name="website" tabindex="-1" autocomplete="off"></div>
      ${failed ? el(t, 'p', 'teachers.setup.errors.again', {}, ' class="err"') : ''}
      <p class="err form-err" aria-live="polite"></p>
      <button class="btn btn-primary btn-big" type="submit">${t('teachers.setup.submit')}</button>
      ${el(t, 'p', 'teachers.setup.privacy', { privacy: '/privacy?for=grownups#schoolSetup' }, ' class="small muted"')}
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
  // Only an adult account's id is kept with the request: a guest may be a child (see services/school-requests.js).
  const r = SR.createRequest(body, { by: signedOut(req.user) ? null : req.user, locale: req.locale });
  if (!r.ok) {
    if (!r.field) return fail(503, t('teachers.setup.errors.full'));
    if (plain) return fail(400);
    const errors = Object.fromEntries(r.fields.map(f => [f, t(`teachers.setup.errors.${f}`)]));
    return res.status(400).json({ error: errors[r.field], field: r.field, errors });
  }
  allow(`school-request:${ip}`, SETUP_LIMITS.perIpHour, 3600e3);
  allow('school-request:all', SETUP_LIMITS.perDay, 86400e3);
  ok();
});

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
  const faqPairs = Array.from({ length: TEACHER_FAQ }, (_, i) => [`teachers.faq.q${i + 1}`, `teachers.faq.a${i + 1}${(i === 3 || i === 5) && google ? 'google' : ''}`]);
  const faq = faqBlock(req, faqPairs, 'teachers.faq.h', { href: '/privacy', count: langCount, host: siteHost(req) });
  const plans = familiesOn(req);
  // ?sent=1: the thank-you after the form (nothing it said is shown back); ?failed=1: a form sent without JavaScript
  // that needs fixing (the JavaScript form shows each field's own message instead).
  const sent = req.query.sent === '1', failed = req.query.failed === '1';
  const body = html`<div class="lp">
  <section class="lp-hero" aria-labelledby="lp-h1">
    ${el(t, 'p', 'teachers.kicker', {}, ' class="lp-kicker"')}
    ${el(t, 'h1', 'teachers.h1', {}, ' id="lp-h1"')}
    ${el(t, 'p', 'teachers.lead', {}, ' class="lead"')}
    <ul class="lp-badges">${badges.map(([e, k]) => html`<li><span aria-hidden="true">${e}</span> ${el(t, 'span', k)}</li>`)}</ul>
    <div class="row lp-cta">
      <a class="btn btn-primary btn-big" href="#start">${t('teachers.cta.start')}</a>
      ${list[0] ? html`<a class="btn btn-big" href="/play/${list[0].slug}" rel="nofollow">▶ ${t('teachers.cta.try')}</a>` : ''}
    </div>
  </section>

  <section class="lp-sec" id="play" aria-labelledby="play-h">
    ${el(t, 'h2', 'teachers.play.h', {}, ' id="play-h"')}${el(t, 'p', 'teachers.play.p')}
    <ul class="lp-games">${list.map(card)}</ul>
  </section>

  <section class="lp-sec" id="subjects" aria-labelledby="subj-h">
    ${el(t, 'h2', 'teachers.subjects.h', {}, ' id="subj-h"')}
    <ul class="lp-hubs">${HUBS.map(h => html`<li><a class="lp-hub panel" href="${lp(req, `/learn/${h.slug}`)}"><span class="lp-hub-e" aria-hidden="true">${h.emoji}</span><span>${el(t, 'span', `learn.hubs.${h.key}.name`, {}, ' class="lp-hub-t"')}${el(t, 'span', `learn.hubs.${h.key}.short`, {}, ' class="lp-hub-d"')}</span></a></li>`)}</ul>
  </section>

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
    <section class="panel" id="uses" aria-labelledby="uses-h">
      ${el(t, 'h2', 'teachers.uses.h', {}, ' id="uses-h"')}${el(t, 'p', 'teachers.uses.p')}
      <ul class="lp-tags">${['li1', 'li2', 'li3', 'li4', 'li5', 'li6', 'li7'].map(k => el(t, 'li', `teachers.uses.${k}`))}</ul>
      ${el(t, 'h2', 'teachers.languages.h', {}, ' class="lp-sub"')}${el(t, 'p', 'teachers.languages.p', { count: langCount })}
    </section>
  </div>

  <section class="panel lp-start" id="start" aria-labelledby="start-h">
    ${el(t, 'h2', 'teachers.start.h', {}, ' id="start-h"')}
    ${el(t, 'p', 'teachers.start.p1')}
    ${setupBlock(req, { sent, failed })}
    ${plans ? el(t, 'p', 'teachers.start.plans') : ''}
    <div class="row">
      ${plans ? html`<a class="btn" href="/plans/schools">${t('teachers.start.plansLink')}</a>` : ''}
      ${list[0] ? html`<a class="btn" href="/play/${list[0].slug}" rel="nofollow">▶ ${t('teachers.cta.try')}</a>` : ''}
    </div>
    ${el(t, 'p', 'teachers.setup.questions', { email: mail }, ' class="small muted"')}
  </section>
  ${faq.markup}
  </div>`;
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers']];
  const items = list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, `/g/${g.slug}`), name: g.title }));
  page(req, res, {
    title: t('teachers.title'), description: t('teachers.description'), body, bodyClass: 'lp-page',
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

// ---------------------------------------------------------------------------------------------------- /learn/<hub>
/** Sum Racer's tracks (the math page). */
const tracks = t => html`<section class="panel" id="tracks" aria-labelledby="tracks-h">${el(t, 'h2', 'learn.hubs.math.tracks.h', {}, ' id="tracks-h"')}
  <ol class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `learn.hubs.math.tracks.li${n}`))}</ol>${el(t, 'p', 'learn.hubs.math.tracks.p')}</section>`;
/** How making a game works (the make-a-game page). */
const builder = (req, t) => html`<section class="panel" id="how" aria-labelledby="how-h">${el(t, 'h2', 'learn.hubs.makeAGame.how.h', {}, ' id="how-h"')}
    <ol class="lp-steps">${[1, 2, 3, 4].map(n => el(t, 'li', `learn.hubs.makeAGame.how.li${n}`))}</ol>
    ${isGrownup(req.user) ? '' : html`<p><a class="btn btn-primary" href="/build">🛠️ ${t('learn.hubs.makeAGame.cta')}</a></p>`}</section>
  <section class="panel" id="skills" aria-labelledby="skills-h">${el(t, 'h2', 'learn.hubs.makeAGame.skills.h', {}, ' id="skills-h"')}${el(t, 'p', 'learn.hubs.makeAGame.skills.p')}</section>
  ${t.own('learn.hubs.makeAGame.parents.h') ? html`<section class="panel" id="parents" aria-labelledby="parents-h">${el(t, 'h2', 'learn.hubs.makeAGame.parents.h', {}, ' id="parents-h"')}${el(t, 'p', 'learn.hubs.makeAGame.parents.p1')}${el(t, 'p', 'learn.hubs.makeAGame.parents.p2')}</section>` : ''}
  ${t.own('learn.hubs.makeAGame.ideas.h') ? html`<section class="panel" id="ideas" aria-labelledby="ideas-h">${el(t, 'h2', 'learn.hubs.makeAGame.ideas.h', {}, ' id="ideas-h"')}
    <ul class="lp-tags">${[1, 2, 3, 4, 5].map(n => el(t, 'li', `learn.hubs.makeAGame.ideas.li${n}`))}</ul>${el(t, 'p', 'learn.hubs.makeAGame.ideas.p')}</section>` : ''}
  ${t.own('learn.hubs.makeAGame.scratch.h') ? html`<section class="panel" id="scratch" aria-labelledby="scratch-h">${el(t, 'h2', 'learn.hubs.makeAGame.scratch.h', {}, ' id="scratch-h"')}${el(t, 'p', 'learn.hubs.makeAGame.scratch.p')}</section>` : ''}
  <section class="panel" id="safe" aria-labelledby="safe-h">${el(t, 'h2', 'learn.hubs.makeAGame.safe.h', {}, ' id="safe-h"')}${el(t, 'p', 'learn.hubs.makeAGame.safe.p')}
    <p>${t.own('learn.hubs.makeAGame.safeLink') ? html`<a href="${lp(req, '/parents/ai-builder-safety')}">${t('learn.hubs.makeAGame.safeLink')}</a> · ` : ''}<a href="${lp(req, '/safety')}">${t('learn.safetyLink')}</a></p></section>`;

/** "Using this in class? See Oomba Academy for teachers." on the subject, age and game pages, for signed-out visitors
 *  and guests (a teacher who found a game from a search); empty for anyone with an account, and in a language that
 *  hasn't got the sentence yet (a translated page stays in one language). */
export const inClassLine = req => (signedOut(req.user) && req.t.own('learn.inClass') ? el(req.t, 'p', 'learn.inClass', { href: lp(req, '/teachers') }, ' class="lp-aside small in-class"') : '');

// ---------------------------------------------------------------------------------------------------- /learn
/** The /learn hub: every subject page and age page, with a line for teachers and one for parents. */
router.get('/learn', (req, res) => {
  const t = req.t;
  const card = (href, emoji, name, short) => html`<li><a class="lp-hub panel" href="${lp(req, href)}"><span class="lp-hub-e" aria-hidden="true">${emoji}</span><span>${el(t, 'span', name, {}, ' class="lp-hub-t"')}${el(t, 'span', short, {}, ' class="lp-hub-d"')}</span></a></li>`;
  const crumbs = [[t('nav.home'), '/'], [t('learn.index.crumb'), '/learn']];
  const body = html`<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${el(t, 'h1', 'learn.index.h1', {}, ' id="lp-h1"')}
      ${el(t, 'p', 'learn.index.lead', {}, ' class="lead"')}
    </section>
    <section class="lp-sec" id="subjects" aria-labelledby="subj-h">${el(t, 'h2', 'learn.index.subjects', {}, ' id="subj-h"')}
      <ul class="lp-hubs">${HUBS.map(h => card(`/learn/${h.slug}`, h.emoji, `learn.hubs.${h.key}.name`, `learn.hubs.${h.key}.short`))}</ul></section>
    <section class="lp-sec" id="ages" aria-labelledby="ages-h">${el(t, 'h2', 'learn.index.ages', {}, ' id="ages-h"')}
      <ul class="lp-hubs">${AGES.map(a => card(`/learn/${a.slug}`, a.emoji, `learn.ages.${a.key}.name`, `learn.ages.${a.key}.short`))}</ul></section>
    <section class="lp-sec" aria-labelledby="who-h">${el(t, 'h2', 'learn.index.who', {}, ' id="who-h"')}
      <ul class="chips lp-more"><li><a class="chip" href="${lp(req, '/teachers')}"><span aria-hidden="true">🍎</span>${t('learn.teachersLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/parents')}"><span aria-hidden="true">👪</span>${parentsLabel(t, 'learn.parentsLink')}</a></li></ul></section>
  </div>`;
  const items = [...HUBS.map(h => [`/learn/${h.slug}`, t(`learn.hubs.${h.key}.name`)]), ...AGES.map(a => [`/learn/${a.slug}`, t(`learn.ages.${a.key}.name`)])]
    .map(([p, name], i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, p), name }));
  page(req, res, {
    title: t('learn.index.title'), description: t('learn.index.description'), body, bodyClass: 'lp-page',
    seo: {
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
  const crumbs = [[t('nav.home'), '/'], [t('nav.teachers'), '/teachers'], [t(`${k}.name`), path]];
  const body = html`<div class="lp">
    <nav class="crumbs small" aria-label="${t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${raw(`<h1 id="lp-h1"${fb(t, `${k}.h1`)}><span aria-hidden="true">${hub.emoji}</span> ${tHtml(t, `${k}.h1`)}</h1>`)}
      ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
      ${band ? html`<p class="lp-grades"><span aria-hidden="true">🎒</span> ${el(t, 'span', 'learn.grades', band)}</p>` : ''}
    </section>
    ${hub.extra === 'builder' ? builder(req, t) : html`<section class="lp-sec" aria-label="${t('learn.gamesHeading')}">${list.length ? list.map(gameItem) : html`<p class="notice">${t('learn.noGames')}</p>`}</section>`}
    ${hub.extra === 'tracks' ? tracks(t) : ''}
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
    title: t(`${k}.title`), description: t(`${k}.description`), body, bodyClass: 'lp-page',
    seo: {
      index: true, path, langs: seo.langsWithKey(`${k}.h1`), image: list[0] && fsOg(list[0].slug) ? `/og/${list[0].slug}.jpg` : '/og/teachers.jpg', imageAlt: t(`${k}.h1`),
      jsonld: [seo.graph([
        { '@type': 'CollectionPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${k}.title`), description: t(`${k}.description`), isPartOf: { '@id': seo.abs(req, '/#website') }, audience: [{ '@type': 'EducationalAudience', educationalRole: 'teacher' }, { '@type': 'ParentAudience', childMinAge: seo.AGE.min, childMaxAge: seo.AGE.max }], ...(items.length ? { mainEntity: { '@type': 'ItemList', itemListElement: items } } : {}) },
        faq.ld, seo.breadcrumbLd(req, crumbs),
      ])],
    },
  });
});
