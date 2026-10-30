// Pages for parents, written for them and for search engines: /parents (what Oomba Academy is, what makes it safe, how it
// works, plans and grown-up accounts, and every privacy and safety section that was there before), the guides
// /parents/ai-builder-safety and /parents/safety-and-screen-time, and the age pages /learn/games-for-…-year-olds
// (server/learn.js AGES).
//
// /parents is the one parent page (docs/decisions.md "One parent page"): the old grown-up accounts page /grown-ups is a
// 301 to /parents#families (routes/family.js). In order: the promise, the picture and two buttons; a short safety
// section; "How it works"; Plans (what a plan adds, a link to /plans, no amounts) and Family accounts (what a grown-up
// account does and how linking works), both only while paid-plan pages are on (familiesOn); then the games, ages and
// subjects; the privacy details folded away under their headings (long on phones); the questions; the buttons again.
//
// Every claim is something the site does today (docs/decisions.md "Parent pages"). In particular: no parental controls,
// dashboard or time limits are promised (there are none), nothing says "COPPA", and no price appears anywhere: prices
// are on /plans only. Games are official launch games anyone may open (launchGame), never a game a child made, and never
// Ring Rumble, Happy Putt or Footy Tycoon. The text is under parents.* and learn.ages.* in the locale files; English
// fallbacks are marked lang="en", and search engines are told a page is English only until its heading is translated.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page, notFound, parentsLabel } from '../views/layout.js';
import { coverArt } from '../views/components.js';
import { tHtml, availableLocales, fmt, localeInfo, DEFAULT_LOCALE } from '../i18n/index.js';
import { familiesOn, madeOn } from '../services/family.js';
import { isGrownup } from '../auth.js';
import * as seo from '../seo.js';
import { HUBS, AGES, ageBySlug, PARENT_GUIDES, guideBySlug, PARENT_GAMES, PARENTS_FAQ, TWO_PLAYER, gameKey, CONTENT_UPDATED } from '../learn.js';
import { launchGame, faqBlock, el, fb, lp, contactEmail, inClassLine } from './teachers.js';
import { section, parentSections, googlePrivacy, contact, setupLink } from './info.js';
import { familyOnSale } from './family.js';
import { howArt, howSteps, howHead, HOW_SCRIPT } from '../views/how.js';

export const router = Router();

/** Other organizations' pages the screen-time guide links to (their own advice and tools). */
export const OUTSIDE = {
  aap: 'https://www.healthychildren.org/English/fmp/Pages/MediaPlan.aspx',
  commonsense: 'https://www.commonsensemedia.org/',
  apple: 'https://www.apple.com/families/',
  google: 'https://families.google/familylink/',
  microsoft: 'https://www.microsoft.com/en-us/microsoft-365/family-safety',
};
/** The first game "Try a game now" opens: the first live one of these. */
const TRY = ['sum-racer', 'word-hunt', 'castle-clash'];
const tryGame = () => TRY.map(launchGame).find(Boolean) || null;
/** Names joined the way the sentence's language joins a list ("A, B and C": English here has no comma before "and"). */
function listOf(req, key, names) {
  const code = req.t.own(key) ? req.locale || DEFAULT_LOCALE : DEFAULT_LOCALE;
  const tag = code.startsWith('en') ? 'en-GB' : localeInfo(code).intl;
  try { return new Intl.ListFormat(tag, { type: 'conjunction' }).format(names); } catch { return names.join(', '); }
}
const parentAudience = () => ({ '@type': 'ParentAudience', childMinAge: seo.AGE.min, childMaxAge: seo.AGE.max });

/** The breadcrumb as a nav (the same markup as the subject pages). */
const crumbsNav = (req, crumbs) => html`<nav class="crumbs small" aria-label="${req.t('learn.crumbs')}"><ol>${crumbs.map(([name, p], i) => html`<li>${i < crumbs.length - 1 ? html`<a href="${lp(req, p)}">${name}</a>` : html`<span aria-current="page">${name}</span>`}</li>`)}</ol></nav>`;
/** The set-up button (info.js setupLink), then "Try a game now". */
function ctaRow(req, { game = tryGame() } = {}) {
  const t = req.t; const g = game; const setup = setupLink(req);
  return html`<div class="row lp-cta">
    <a class="btn btn-primary btn-big" href="${setup.href}"${fb(t, setup.key)}>${setup.label}</a>
    ${g ? html`<a class="btn btn-big" href="/play/${g.slug}" rel="nofollow">▶ ${t('parents.cta.try')}</a>` : ''}
  </div>`;
}
/** The end of a parent page, after the details and questions: a one-line lead and the same buttons. */
const ctaEnd = req => html`<section class="lp-sec lp-end" aria-label="${setupLink(req).label}">${el(req.t, 'p', 'parents.cta.lead', {}, ' class="lead"')}${ctaRow(req)}</section>`;
/** Cards linking to pages: [{ href, emoji, nameKey, shortKey }]. */
const linkCards = (t, cards) => html`<ul class="lp-hubs">${cards.map(c => html`<li><a class="lp-hub panel" href="${c.href}"><span class="lp-hub-e" aria-hidden="true">${c.emoji}</span><span>${el(t, 'span', c.name, {}, ' class="lp-hub-t"')}${el(t, 'span', c.short, {}, ' class="lp-hub-d"')}</span></a></li>`)}</ul>`;
const ageCards = req => linkCards(req.t, AGES.map(a => ({ href: lp(req, `/learn/${a.slug}`), emoji: a.emoji, name: `learn.ages.${a.key}.name`, short: `learn.ages.${a.key}.short` })));
const guideCards = (req, except) => linkCards(req.t, PARENT_GUIDES.filter(g => g !== except).map(g => ({ href: lp(req, `/parents/${g.slug}`), emoji: g.emoji, name: `parents.${g.key}.name`, short: `parents.${g.key}.short` })));
const itemList = (req, list, name) => ({ '@type': 'ItemList', ...(name ? { name } : {}), itemListElement: list.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: seo.abs(req, `/g/${g.slug}`), name: g.title })) });
/** A guide's "Updated" date in the reader's language. */
const updated = req => html`<p class="muted small lp-updated"${fb(req.t, 'parents.updated')}>${tHtml(req.t, 'parents.updated', { date: html`<time datetime="${CONTENT_UPDATED}">${fmt(req.locale || DEFAULT_LOCALE).day(Date.parse(`${CONTENT_UPDATED}T00:00:00Z`), { year: 'numeric', month: 'long', day: 'numeric' })}</time>` })}</p>`;

// ---------------------------------------------------------------------------------------------------- /parents
/** A new string, shown only once the page's language has it (English pages always do); else `alt`, an older string
 *  that says less, or nothing. So a translated page never gets a new English paragraph. */
const ownOr = (t, tag, key, alt, vars) => (t.own(key) ? el(t, tag, key, vars) : alt ? el(t, tag, alt, vars) : '');
/** Plans (only while paid-plan pages are on): what a plan adds, who it is for, the legal pages, and /plans for the
 *  prices. No amounts here: prices are on /plans only. `sale`: can this visitor buy one now? */
function plansSection(req, sale) {
  const t = req.t;
  return html`<section class="panel" id="plans">
    ${el(t, 'h2', 'info.parents.plans.h', {}, ' id="plans-h"')}
    ${el(t, 'p', 'info.parents.plans.p1')}
    ${ownOr(t, 'p', 'parents.plans.adds', 'parents.families.p2')}
    ${sale ? '' : el(t, 'p', 'family.landing.price.soon', {}, ' class="notice"')}
    ${el(t, 'p', 'family.landing.price.us', {}, ' class="muted"')}
    ${el(t, 'p', 'info.parents.plans.p2', {}, ' class="small"')}
    <p class="row lp-sec-cta"><a class="btn btn-primary" href="/plans"${fb(t, 'info.parents.families.plans')}>${t('info.parents.families.plans')}</a></p>
  </section>`;
}
/** Family accounts (only while paid-plan pages are on; what /grown-ups said): what a grown-up account does, how linking
 *  works, the sign-up and sign-in (or, for a grown-up, their family page), and the questions grown-ups ask, folded. */
function familiesSection(req) {
  const t = req.t; const u = req.user;
  const qa = k => html`<details class="lp-q"><summary${fb(t, `family.landing.faq.${k}.q`)}>${t(`family.landing.faq.${k}.q`)}</summary>${k === 'reset'
    ? html`<p${fb(t, 'family.landing.faq.reset.a')}>${t('family.landing.faq.reset.a')} <span data-utc-midnight hidden>${tHtml(t, 'family.landing.faq.reset.local', { time: html`<time data-time></time>` })}</span></p>`
    : el(t, 'p', `family.landing.faq.${k}.a`)}</details>`;
  const actions = isGrownup(u) ? html`<a class="btn btn-primary" href="/family"${fb(t, 'family.landing.toFamily')}>${t('family.landing.toFamily')}</a>`
    : html`<a class="btn btn-primary" href="/grown-ups/signup"${fb(t, 'family.landing.signup')}>${t('family.landing.signup')}</a><a class="btn" href="/grown-ups/login"${fb(t, 'family.landing.login')}>${t('family.landing.login')}</a>`;
  return html`<section class="panel" id="families" aria-labelledby="families-h">
    ${el(t, 'h2', 'info.parents.families.h', {}, ' id="families-h"')}
    ${el(t, 'p', 'info.parents.families.p1')}
    ${el(t, 'h3', 'family.landing.how.h')}
    <ol class="lp-steps">${['p1', 'p2', 'p3'].map(k => el(t, 'li', `family.landing.how.${k}`))}</ol>
    <p class="row lp-sec-cta">${actions}</p>
    <div class="lp-qs">${el(t, 'h3', 'family.landing.faq.h')}${['cancel', 'store', 'see', 'reset', 'consent'].map(qa)}</div>
  </section>`;
}

router.get('/parents', async (req, res) => {
  const t = req.t;
  const paid = familiesOn(req);
  // "Not on sale yet" unless this visitor can buy a plan now (familyOnSale: the same rule as /plans and the /family checklist).
  const sale = paid && await familyOnSale(req.user);
  const count = availableLocales().length;
  const list = PARENT_GAMES.map(launchGame).filter(Boolean);
  const card = g => html`<li><a class="lp-game" href="${lp(req, `/g/${g.slug}`)}">${coverArt(g)}<span class="lp-game-text"><span class="lp-game-t">${g.title}</span>${el(t, 'span', `learn.games.${gameKey(g.slug)}`, {}, ' class="lp-game-d"')}</span></a></li>`;
  const badges = [['✅', 'parents.badges.free'], ['🚫', 'parents.badges.ads'], ['🛍️', 'parents.badges.buy'], ['💬', 'parents.badges.strangers'], ['💻', 'parents.badges.browser'], ['🌐', 'parents.badges.languages']];
  const vars = { count, plans: '/plans', ai: lp(req, '/parents/ai-builder-safety'), screen: lp(req, '/parents/safety-and-screen-time') };
  const faqPairs = Array.from({ length: PARENTS_FAQ }, (_, i) => [`parents.faq.q${i + 1}`, `parents.faq.a${i + 1}${paid && (i === 0 || i === 6) ? 'paid' : ''}`]);
  const faq = faqBlock(req, faqPairs, 'parents.faq.h', vars);
  const body = html`<div class="lp">
  <section class="lp-hero lp-hero-how" aria-labelledby="lp-h1">
    ${el(t, 'p', 'parents.kicker', {}, ' class="lp-kicker"')}
    ${el(t, 'h1', 'parents.h1', {}, ' id="lp-h1"')}
    ${el(t, 'p', 'parents.lead', {}, ' class="lead"')}
    ${ctaRow(req)}
    ${el(t, 'p', 'parents.teachers', { href: lp(req, '/teachers') }, ' class="lp-aside small"')}
    <ul class="lp-badges">${badges.map(([e, k]) => html`<li><span aria-hidden="true">${e}</span> ${el(t, 'span', k, { count })}</li>`)}</ul>
    ${howArt(req, 'parents')}
  </section>

  <section class="panel" id="safe" aria-labelledby="safe-h">
    ${el(t, 'h2', 'parents.safe.h', {}, ' id="safe-h"')}
    <ul class="lp-list">${['li1', 'li2', 'li3', 'li4', 'li5'].map(k => el(t, 'li', `parents.safe.${k}`))}</ul>
    ${el(t, 'p', 'parents.safe.links', { safety: lp(req, '/safety'), guide: lp(req, '/parents/safety-and-screen-time') })}
  </section>
  ${howSteps(req, 'parents')}
  ${paid ? plansSection(req, sale) : ''}
  ${paid ? familiesSection(req) : ''}

  <section class="lp-sec" id="play" aria-labelledby="play-h">
    ${el(t, 'h2', 'parents.play.h', {}, ' id="play-h"')}${el(t, 'p', 'parents.play.p')}
    <ul class="lp-games">${list.map(card)}</ul>
  </section>

  <section class="lp-sec" id="ages" aria-labelledby="ages-h">
    ${el(t, 'h2', 'parents.ages.h', {}, ' id="ages-h"')}${el(t, 'p', 'parents.ages.p')}
    ${ageCards(req)}
  </section>

  <section class="lp-sec" id="subjects" aria-labelledby="subj-h">
    ${el(t, 'h2', 'parents.subjects.h', {}, ' id="subj-h"')}
    ${linkCards(t, HUBS.map(h => ({ href: lp(req, `/learn/${h.slug}`), emoji: h.emoji, name: `learn.hubs.${h.key}.name`, short: `learn.hubs.${h.key}.short` })))}
  </section>

  <div class="lp-cols">
    <section class="panel" id="make" aria-labelledby="make-h">
      ${el(t, 'h2', 'parents.make.h', {}, ' id="make-h"')}${el(t, 'p', 'parents.make.p1')}${el(t, 'p', 'parents.make.p2')}
      <p class="row"><a class="btn" href="${lp(req, '/learn/make-a-game')}">🛠️ ${t('parents.make.link')}</a><a class="btn" href="${lp(req, '/parents/ai-builder-safety')}">🤖 ${t('parents.make.safe')}</a></p>
    </section>
    <section class="panel" id="home" aria-labelledby="home-h">
      ${el(t, 'h2', 'parents.home.h', {}, ' id="home-h"')}${el(t, 'p', 'parents.home.p')}
      <ul class="lp-tags">${['li1', 'li2', 'li3', 'li4', 'li5', 'li6', 'li7'].map(k => el(t, 'li', `parents.home.${k}`))}</ul>
    </section>
  </div>

  <section class="lp-sec" id="guides" aria-labelledby="guides-h">
    ${el(t, 'h2', 'parents.guides.h', {}, ' id="guides-h"')}
    ${guideCards(req)}
  </section>

  <section class="panel" id="private" aria-labelledby="private-h">
    ${el(t, 'h2', 'parents.private.h', {}, ' id="private-h"')}${el(t, 'p', 'parents.private.p1')}${el(t, 'p', 'parents.private.p2')}
    ${paid ? el(t, 'p', 'parents.private.paid') : ''}${el(t, 'p', 'parents.private.p3', { href: lp(req, '/parents/safety-and-screen-time') })}
  </section>

  <section class="lp-sec lp-detail" id="details" aria-labelledby="details-h">
    ${el(t, 'h2', 'parents.detail.h', {}, ' id="details-h"')}${el(t, 'p', 'parents.detail.p', { href: '/privacy' })}
    ${parentSections(req).map(s => section(req, `info.parents.${s}`, { id: s, level: 3, fold: true }))}
    ${madeOn(req) ? section(req, 'info.parents.made', { id: 'made', level: 3, fold: true }) : ''}
    ${googlePrivacy(req, 3, { fold: true })}${contact(req, 3)}
  </section>
  ${faq.markup}
  ${ctaEnd(req)}
  </div>`;
  const crumbs = [[t('nav.home'), '/'], [parentsLabel(t), '/parents']];
  page(req, res, {
    title: t('parents.title'), description: t('parents.description'), body, bodyClass: 'lp-page', active: 'parents',
    head: howHead(), scripts: [HOW_SCRIPT, ...(paid ? ['/js/family.js'] : [])],
    seo: {
      index: true, path: '/parents', langs: seo.langsWithKey('parents.h1'), image: '/og/parents.jpg', imageAlt: t('parents.h1'),
      jsonld: [seo.graph([
        { '@type': 'WebPage', '@id': seo.abs(req, '/parents'), url: seo.abs(req, '/parents'), name: t('parents.title'), description: t('parents.description'), isPartOf: { '@id': seo.abs(req, '/#website') }, publisher: { '@id': seo.orgId(req) }, audience: parentAudience() },
        itemList(req, list, t('parents.play.h')),
        faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req), seo.websiteLd(req, req.locale),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- guides
function aiGuide(req) {
  const t = req.t; const email = contactEmail();
  return html`<div class="lp-cols">
    <section class="panel" id="what" aria-labelledby="what-h">${el(t, 'h2', 'parents.ai.what.h', {}, ' id="what-h"')}${el(t, 'p', 'parents.ai.what.p1')}${el(t, 'p', 'parents.ai.what.p2')}</section>
    <section class="panel" id="sees" aria-labelledby="sees-h">${el(t, 'h2', 'parents.ai.sees.h', {}, ' id="sees-h"')}
      <ul class="lp-list">${[1, 2, 3, 4, 5, 6].map(n => el(t, 'li', `parents.ai.sees.li${n}`))}</ul></section>
    <section class="panel" id="rules" aria-labelledby="rules-h">${el(t, 'h2', 'parents.ai.rules.h', {}, ' id="rules-h"')}${el(t, 'p', 'parents.ai.rules.p')}
      <ul class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `parents.ai.rules.li${n}`))}</ul>${el(t, 'p', 'parents.ai.rules.p2')}</section>
    <section class="panel" id="public" aria-labelledby="public-h">${el(t, 'h2', 'parents.ai.public.h', {}, ' id="public-h"')}${el(t, 'p', 'parents.ai.public.p')}
      <p><a href="${lp(req, '/safety')}">${t('learn.safetyLink')}</a></p></section>
  </div>
  <section class="panel" id="limits" aria-labelledby="limits-h">${el(t, 'h2', 'parents.ai.limits.h', {}, ' id="limits-h"')}${el(t, 'p', 'parents.ai.limits.p1')}
    ${el(t, 'p', 'parents.ai.limits.p2', { email: html`<a href="mailto:${email}" dir="ltr">${email}</a>` })}</section>
  <section class="panel" id="check" aria-labelledby="check-h">${el(t, 'h2', 'parents.ai.check.h', {}, ' id="check-h"')}
    <ol class="lp-steps">${[1, 2, 3, 4, 5].map(n => el(t, 'li', `parents.ai.check.li${n}`))}</ol></section>`;
}
function screenGuide(req) {
  const t = req.t;
  return html`<section class="panel" id="experts" aria-labelledby="experts-h">${el(t, 'h2', 'parents.screen.experts.h', {}, ' id="experts-h"')}
    ${el(t, 'p', 'parents.screen.experts.p1', { aap: OUTSIDE.aap, commonsense: OUTSIDE.commonsense })}${el(t, 'p', 'parents.screen.experts.p2')}</section>
  <div class="lp-cols">
    <section class="panel" id="checklist" aria-labelledby="checklist-h">${el(t, 'h2', 'parents.screen.check.h', {}, ' id="checklist-h"')}
      <ul class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `parents.screen.check.li${n}`))}</ul></section>
    <section class="panel" id="oomba" aria-labelledby="oomba-h">${el(t, 'h2', 'parents.screen.us.h', {}, ' id="oomba-h"')}
      <ul class="lp-list">${[1, 2, 3, 4, 5, 6, 7].map(n => el(t, 'li', `parents.screen.us.li${n}`))}</ul>${el(t, 'p', 'parents.screen.us.p')}</section>
    <section class="panel" id="tools" aria-labelledby="tools-h">${el(t, 'h2', 'parents.screen.tools.h', {}, ' id="tools-h"')}${el(t, 'p', 'parents.screen.tools.p')}
      <ul class="lp-list">${[['li1', OUTSIDE.apple], ['li2', OUTSIDE.google], ['li3', OUTSIDE.microsoft]].map(([k, href]) => el(t, 'li', `parents.screen.tools.${k}`, { href }))}</ul></section>
    <section class="panel" id="rules" aria-labelledby="rules-h">${el(t, 'h2', 'parents.screen.rules.h', {}, ' id="rules-h"')}
      <ul class="lp-list">${[1, 2, 3, 4, 5].map(n => el(t, 'li', `parents.screen.rules.li${n}`))}</ul></section>
  </div>`;
}
const GUIDE_BODY = { ai: aiGuide, screen: screenGuide };

router.get('/parents/:guide', (req, res) => {
  const guide = guideBySlug(req.params.guide);
  if (!guide || req.params.guide !== guide.slug) return notFound(req, res);
  const t = req.t; const k = `parents.${guide.key}`; const path = `/parents/${guide.slug}`;
  const faq = faqBlock(req, Array.from({ length: guide.faq }, (_, i) => [`${k}.faq.q${i + 1}`, `${k}.faq.a${i + 1}`]), 'parents.faq.h');
  const crumbs = [[t('nav.home'), '/'], [parentsLabel(t), '/parents'], [t(`${k}.name`), path]];
  const body = html`<div class="lp">
    ${crumbsNav(req, crumbs)}
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${raw(`<h1 id="lp-h1"${fb(t, `${k}.h1`)}><span aria-hidden="true">${guide.emoji}</span> ${tHtml(t, `${k}.h1`)}</h1>`)}
      ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
      ${updated(req)}
    </section>
    ${GUIDE_BODY[guide.key](req)}
    ${faq.markup}
    ${ctaEnd(req)}
    <section class="lp-sec" aria-labelledby="more-h">${el(t, 'h2', 'parents.guides.h', {}, ' id="more-h"')}
      ${guideCards(req, guide)}
      <ul class="chips lp-more"><li><a class="chip" href="${lp(req, '/parents')}"><span aria-hidden="true">👪</span>${t('learn.parentsLink')}</a></li>
        <li><a class="chip" href="${lp(req, '/learn/make-a-game')}"><span aria-hidden="true">🛠️</span>${t('learn.hubs.makeAGame.name')}</a></li>
        <li><a class="chip" href="${lp(req, '/safety')}"><span aria-hidden="true">🛡️</span>${t('learn.safetyLink')}</a></li></ul>
    </section>
  </div>`;
  page(req, res, {
    title: t(`${k}.title`), description: t(`${k}.description`), body, bodyClass: 'lp-page', active: 'parents',
    seo: {
      index: true, path, langs: seo.langsWithKey(`${k}.h1`), image: `/og/parents-${guide.slug}.jpg`, imageAlt: t(`${k}.h1`), type: 'article',
      jsonld: [seo.graph([
        { '@type': 'Article', '@id': seo.abs(req, path), url: seo.abs(req, path), mainEntityOfPage: seo.abs(req, path), headline: seo.plainText(t(`${k}.h1`)), description: t(`${k}.description`), datePublished: guide.published, dateModified: CONTENT_UPDATED, inLanguage: req.pathLocale || DEFAULT_LOCALE, author: { '@id': seo.orgId(req) }, publisher: { '@id': seo.orgId(req) }, image: seo.abs(req, `/og/parents-${guide.slug}.jpg`), audience: parentAudience(), isPartOf: { '@id': seo.abs(req, '/#website') } },
        faq.ld, seo.breadcrumbLd(req, crumbs), seo.organizationLd(req),
      ])],
    },
  });
});

// ---------------------------------------------------------------------------------------------------- age pages
// /learn/games-for-8-and-9-year-olds and the others. Any other /learn/<slug> is a subject page (routes/teachers.js).
router.get('/learn/:slug', (req, res, next) => {
  const age = ageBySlug(req.params.slug);
  if (!age || req.params.slug !== age.slug) return next();
  const t = req.t; const k = `learn.ages.${age.key}`; const path = `/learn/${age.slug}`;
  const list = age.games.map(launchGame).filter(Boolean);
  const range = { from: String(age.min), to: String(age.max) };
  // "Playing together" names only the two-player games this page lists.
  const together = list.filter(g => TWO_PLAYER.includes(g.slug));
  const gameItem = g => {
    const key = gameKey(g.slug);
    return html`<article class="panel lp-hubgame" aria-labelledby="g-${g.slug}">
      <a class="lp-hubgame-art" href="${lp(req, `/g/${g.slug}`)}" tabindex="-1" aria-hidden="true">${coverArt(g)}</a>
      <div class="lp-hubgame-text">
        <h2 id="g-${g.slug}"><a href="${lp(req, `/g/${g.slug}`)}">${g.title}</a></h2>
        ${raw(`<p class="lp-fit"${fb(t, `${k}.fit.${key}`)}><b>${tHtml(t, 'learn.ages.fit')}</b> ${tHtml(t, `${k}.fit.${key}`)}</p>`)}
        <div class="row"><a class="btn btn-primary" href="/play/${g.slug}" rel="nofollow">▶ ${t('learn.play')}</a><a class="btn" href="${lp(req, `/g/${g.slug}`)}">${t('learn.about')}</a></div>
      </div></article>`;
  };
  const make = html`<section class="panel lp-make" id="make" aria-labelledby="make-h">${el(t, 'h2', 'learn.ages.make.h', {}, ' id="make-h"')}${el(t, 'p', `${k}.make.p`)}
    <div class="row"><a class="btn btn-primary" href="/build">🛠️ ${t('learn.hubs.makeAGame.cta')}</a><a class="btn" href="${lp(req, '/learn/make-a-game')}">${t('learn.ages.make.link')}</a></div></section>`;
  // Subject pages that have some of this age's games, with those games' names.
  const skills = HUBS.filter(h => h.slug !== 'brain-break-games').map(h => [h, list.filter(g => h.games.includes(g.slug))]).filter(([h, gs]) => gs.length || (h.slug === 'make-a-game' && age.make));
  const faq = faqBlock(req, [['learn.ages.faq.q1', 'learn.ages.faq.a1'], ...Array.from({ length: age.faq - 1 }, (_, i) => [`${k}.faq.q${i + 2}`, `${k}.faq.a${i + 2}`])], 'parents.faq.h', { ai: lp(req, '/parents/ai-builder-safety') });
  const crumbs = [[t('nav.home'), '/'], [parentsLabel(t), '/parents'], [t(`${k}.name`), path]];
  const body = html`<div class="lp">
    ${crumbsNav(req, crumbs)}
    <section class="lp-hero lp-hero-sm" aria-labelledby="lp-h1">
      ${raw(`<h1 id="lp-h1"${fb(t, `${k}.h1`)}><span aria-hidden="true">${age.emoji}</span> ${tHtml(t, `${k}.h1`)}</h1>`)}
      ${el(t, 'p', `${k}.lead`, {}, ' class="lead"')}
      ${age.key === 'a10' ? el(t, 'p', `${k}.abcya`, {}, ' class="lp-aside"') : ''}
      <p class="lp-grades"><span aria-hidden="true">🎒</span> ${el(t, 'span', 'learn.ages.line', range)}</p>
      ${ctaRow(req, { game: list[0] || tryGame() })}
    </section>
    ${age.make === 'first' ? make : ''}
    <section class="lp-sec" aria-label="${t('learn.gamesHeading')}">${list.length ? list.map(gameItem) : html`<p class="notice">${t('learn.noGames')}</p>`}</section>
    ${age.make === 'after' ? make : ''}
    <div class="lp-cols">
      <section class="panel" id="skills" aria-labelledby="skills-h">${el(t, 'h2', 'learn.ages.skills.h', {}, ' id="skills-h"')}
        <ul class="lp-list">${skills.map(([h, gs]) => html`<li><a href="${lp(req, `/learn/${h.slug}`)}"><span aria-hidden="true">${h.emoji}</span> ${t(`learn.hubs.${h.key}.name`)}</a>${gs.length ? html`: ${gs.map(g => g.title).join(', ')}` : ''}</li>`)}</ul></section>
      ${together.length ? html`<section class="panel" id="together" aria-labelledby="together-h">${el(t, 'h2', 'learn.ages.together.h', {}, ' id="together-h"')}${el(t, 'p', 'learn.ages.together.p', { count: together.length, games: listOf(req, 'learn.ages.together.p', together.map(g => g.title)) })}</section>` : ''}
      <section class="panel" id="safe" aria-labelledby="safe-h">${el(t, 'h2', 'learn.ages.safe.h', {}, ' id="safe-h"')}${el(t, 'p', 'learn.ages.safe.p', { href: lp(req, '/parents') })}</section>
    </div>
    ${faq.markup}
    ${inClassLine(req)}
    <section class="lp-sec" aria-labelledby="more-h">${el(t, 'h2', 'learn.ages.moreHeading', {}, ' id="more-h"')}
      <ul class="chips lp-more">${AGES.filter(a => a !== age).map(a => html`<li><a class="chip" href="${lp(req, `/learn/${a.slug}`)}"><span aria-hidden="true">${a.emoji}</span>${t(`learn.ages.${a.key}.name`)}</a></li>`)}
        <li><a class="chip" href="${lp(req, '/parents')}"><span aria-hidden="true">👪</span>${t('learn.parentsLink')}</a></li></ul>
    </section>
  </div>`;
  const image = `/og/ages-${age.min}-${age.max}.jpg`;
  page(req, res, {
    title: t(`${k}.title`), description: t(`${k}.description`), body, bodyClass: 'lp-page',
    seo: {
      index: true, path, langs: seo.langsWithKey(`${k}.h1`), image, imageAlt: seo.plainText(t(`${k}.h1`)),
      jsonld: [seo.graph([
        { '@type': 'CollectionPage', '@id': seo.abs(req, path), url: seo.abs(req, path), name: t(`${k}.title`), description: t(`${k}.description`), isPartOf: { '@id': seo.abs(req, '/#website') },
          audience: [{ '@type': 'PeopleAudience', suggestedMinAge: age.min, suggestedMaxAge: age.max }, { '@type': 'ParentAudience', childMinAge: age.min, childMaxAge: age.max }],
          typicalAgeRange: `${age.min}-${age.max}`, ...(list.length ? { mainEntity: itemList(req, list) } : {}) },
        faq.ld, seo.breadcrumbLd(req, crumbs),
      ])],
    },
  });
});
