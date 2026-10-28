// /teachers (what Oomba Academy does in a classroom) and the subject pages /learn/<hub> (server/learn.js). Public pages
// written for teachers and for search engines. Every claim here is something the site does today; a feature that is
// off on this server (Sign in with Google, paid plans) is left out of the text, not described.
//
// Games are listed only when they are an official launch game anyone may open now (canView for a signed-out visitor):
// never a game a child made. The text is under teachers.* and learn.* in the locale files. Until a language has it, a
// paragraph shows the English, marked lang="en" dir="ltr", and search engines are told the page is English only.
import { Router } from 'express';
import fs from 'node:fs';
import { html, raw } from '../views/html.js';
import { page, notFound, parentsLabel } from '../views/layout.js';
import { coverArt } from '../views/components.js';
import { tHtml, availableLocales } from '../i18n/index.js';
import { config } from '../config.js';
import { googleEnabled } from '../oidc.js';
import { familiesOn } from '../services/family.js';
import { isGrownup } from '../auth.js';
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
    ${el(t, 'p', 'teachers.start.p1')}${el(t, 'p', 'teachers.start.p2', { email: mail })}
    ${plans ? el(t, 'p', 'teachers.start.plans') : ''}
    <div class="row">
      <a class="btn btn-primary" href="mailto:${email}?subject=${encodeURIComponent(t('teachers.start.subject'))}">✉️ ${t('teachers.start.email')}</a>
      ${plans ? html`<a class="btn" href="/plans/schools">${t('teachers.start.plansLink')}</a>` : ''}
      ${list[0] ? html`<a class="btn" href="/play/${list[0].slug}" rel="nofollow">▶ ${t('teachers.cta.try')}</a>` : ''}
    </div>
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
