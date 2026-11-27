// The teacher marketing site at "/" for visitors who are not signed in (docs/decisions.md "Teacher landing page" and
// "Homepage: the one classroom tool for everything").
//
// A self-contained page: its own header, footer, CSS (public/css/landing.css) and script (public/js/landing.js). It does
// not use the app shell (views/layout.js), so the app's navigation can change without touching it, and it shares only
// the SEO helpers (server/seo.js) and the brand marks.
//
// THE ONE SHARED HOOK (search for "LANDING HOOK"): this router is mounted in app.js just before the home route
// (routes/discover.js GET /). GET / with no session at all (a first visit, a search engine, a link preview) is answered
// here; anyone with a session (kids, students, teachers, grown-ups, and a guest who already played) falls through to the
// home page they have today, unchanged. renderLanding(req, res) is exported for whoever merges a new home route.
//
// The page, in order: the hero (every tool in one collage), the "one subscription instead of five" strip, the ten things
// in one place, the Hub, Ask Oomba, the tools, three products side by side, the click-through Hub tour, the videos,
// safety, the questions and the last call. Every word is in landing.* (all 13 locales).
//
// Light by default (the cream-and-mint look): an explicit Dark choice on the site (req.theme) gets the dark theme, and
// with no choice the device's prefers-color-scheme decides (the CSS has both; the dark screenshots follow the same rule).
//
// Other products: the owner's second exception to "never name other products" (docs/decisions.md "Homepage: the one
// classroom tool for everything"; the first is /compare). This page may name exactly the five in NAMED below, as plain
// text, never a logo, and a sixth, NoRedInk (routes/compare.js GRAMMAR_RIVAL), only while Grammar Lab is open to every
// visitor (compare.js grammarCompareOn, the same one condition /compare uses): then it gets a side-by-side card for
// Grammar Lab and joins the trademark line, but not the "instead of five" strip (Grammar Lab does not replace it). The
// side-by-side cards quote only what /compare already quotes from each product's own website (routes/compare.js CELLS
// and GRAMMAR_CELLS, with its address and the day it was read), and the footer carries the trademark line.
// tests/unit/compare.test.js keeps every other page and file free of the names.
//
// Prices: kids are never sold to, and amounts appear only on /plans (tests/unit/billing*.test.js). The page links to
// /plans and /compare and names no amount, ours or anyone's; LANDING_SHOW_PRICE (off) is the one switch that would add
// the amount to the structured data.
//
// The Teacher plan: the Hub (services/homeroom.js canUse), the Manipulatives, Figures and Oomba (services/teacher-tools.js
// toolAccess) are Teacher plan tools, so their sections always carry "Available with the Teacher plan" (a link to /plans),
// whether or not paid plans are on for everyone yet (the owner's call).
import fs from 'node:fs';
import { Router } from 'express';
import { html, raw, esc } from '../views/html.js';
import { appMark, wordmark, BRAND, ICONS_V } from '../views/brand.js';
import { VERSION } from '../views/layout.js';
import { BAR_COLORS } from '../theme.js';
import { tHtml, localeInfo, availableLocales, DEFAULT_LOCALE } from '../i18n/index.js';
import * as seo from '../seo.js';
import { liveOn } from '../services/classlive-sessions.js';
import * as funnel from '../services/funnel.js';
import { countable } from '../services/traffic.js';
import { themedPicture } from '../views/shot.js';
import { loopShots } from '../views/teacher-loop.js';
import { enabled as classroomOn } from '../services/gclassroom.js';
import { rateLimit } from '../services/ratelimit.js';
import { LAYOUT_TEMPLATES, WIDGETS } from '../services/dash.js';
import { ico, toolIco } from '../views/icon.js';
import { leadIcon } from '../../public/js/icons.js';
import * as focus from '../services/game-focus.js';
import { readyVideos } from '../views/see-it.js';
import { books } from '../services/library.js';
import { COMPETITORS, CELLS, COMPARE_CHECKED, GRAMMAR_RIVAL, GRAMMAR_CELLS, GRAMMAR_CHECKED, grammarCompareOn, grammarFacts } from './compare.js';
import { TOOLS as MANIP_TOOLS, TUTORIALS, tutorialOf } from '../../public/js/manip-data.js';
import { TASKS } from '../../public/js/manip-tasks.js';
import { KINDS as FIGURE_KINDS } from '../../public/js/figures-catalog.js';

/** Where "Just Play" goes: the games for kids, no sign-up. */
export const JUST_PLAY_URL = '/learn';
/** Every "Start free" (the Teacher plan's 14-day trial, no card): "Who's signing up?" first (the landing is for
 *  signed-out visitors only); "I'm a teacher" there keeps ?trial=1 through the teacher's steps, which end at /trial. */
export const TRIAL_URL = '/signup?trial=1';
/** "Host a live lesson now": the three-field teacher sign-up, then the Quick game chooser (routes/quick-live.js). */
export const HOST_NOW_URL = '/teachers/host';
/** Schools: invoices, purchase orders, more than a few teachers. */
export const SALES_EMAIL = 'Greg@oomba.ai';
// Google's preferred sources deeplink (Search Central, "Help your readers find your site through preferred sources"):
// a reader who taps it can mark oomba.ai as a source they prefer in Google Search. A plain link, no Google script.
export const PREFERRED_SOURCE_URL = 'https://www.google.com/preferences/source?q=oomba.ai';
/** Show the Teacher plan's price in the landing's structured data. Off: prices live on /plans only. */
export const LANDING_SHOW_PRICE = false;
export const TEACHER_PRICE = { amount: '119', currency: 'USD', label: '$119' };
/** Is the landing at "/"? On unless LANDING_AT_ROOT=0 (the unit tests written for the old signed-out home turn it off). */
export const landingAtRoot = () => process.env.LANDING_AT_ROOT !== '0';
/** Who gets the landing at "/": nobody signed in and no guest session. */
export const wantsLanding = req => landingAtRoot() && !req.user;

/** The five products this page may name (the owner's decision; plain text, no logos). Product names are never
 *  translated. The three with sourced facts on /compare get a side-by-side card; Blooket and Typing.com are only named. */
export const NAMED = ['Kahoot!', 'Classroomscreen', 'Blooket', 'Brainingcamp', 'Typing.com'];
/** Every product this page names now: the five, and NoRedInk while Grammar Lab is open to every visitor (the
 *  trademark line). The strip always shows NAMED only. */
export const namedNow = () => (grammarCompareOn() ? [...NAMED, GRAMMAR_RIVAL.name] : NAMED);
/** The side-by-side cards: /compare's quotes only (routes/compare.js CELLS), by row. */
export const VERSUS = [
  { id: 'kahoot', rows: ['games', 'devices'], adds: 'liveGames' },
  { id: 'classroomscreen', rows: ['dashboard', 'routines'], adds: 'classScreen' },
  { id: 'brainingcamp', rows: ['manip', 'room', 'grades'], adds: 'mathTools' },
];
/** The Grammar Lab card, while Grammar Lab is open to every visitor: /compare's grammar quotes only (GRAMMAR_CELLS). */
export const VERSUS_GRAMMAR = { id: 'noredink', rows: ['practice', 'essays', 'grades'], adds: 'grammar', us: 'grammarUs' };
/** The cards on the page now. */
export const versusNow = () => (grammarCompareOn() ? [...VERSUS, VERSUS_GRAMMAR] : VERSUS);
/** The video behind the hero's play button ("Watch the 1-minute video"): the Hub in 60 seconds (scripts/hub-promo.mjs),
 *  with its English captions as the player's track. It also leads the video strip (the two-minute overview follows). */
export const HERO_VIDEO = 'hub-promo';

/** Clicks counted by the page's beacon (POST /landing/count/<cta>): funnel steps, a daily total each, nothing else. */
const CTAS = new Map([['host', 'landing.host'], ['trial', 'landing.trial'], ['play', 'landing.play'], ['pricing', 'landing.pricing'], ['how', 'landing.how']]);

export const router = Router();

// LANDING HOOK, part 1: GET /play is the Play page for everyone (routes/discover.js), so "Just Play" lands there.
// LANDING HOOK, part 2: "/" with no session is the teacher landing; everyone else gets the home page as before.
router.get('/', (req, res, next) => (wantsLanding(req) ? renderLanding(req, res) : next()));

router.post('/landing/count/:cta', rateLimit('landing', 30, 60e3, undefined, { byIp: true }), (req, res) => {
  const step = CTAS.get(req.params.cta);
  if (!step) return res.status(404).end();
  if (req.headers['sec-fetch-site'] === 'same-origin' && countable(req)) funnel.bump(step);
  res.set('Cache-Control', 'no-store').status(204).end();
});

// ---------------------------------------------------------------------------------------------------- pictures
// The screenshots (scripts/landing-shots.mjs): public/img/landing/<name>-<w>.webp at 1x and 2x, sized by shots.json.
const SHOT_DIR = new URL('../../public/img/landing/', import.meta.url);
const SHOTS = (() => { try { return JSON.parse(fs.readFileSync(new URL('shots.json', SHOT_DIR), 'utf8')); } catch { return {}; } })();
const shotSrcset = name => SHOTS[name].w.map(w => `/img/landing/${name}-${w}.webp ${w}w`).join(', ');
/** One screenshot as an <img> (or a themed <picture> with dark: the dark capture's name). '' when it is not there. */
function pic(name, { alt = '', sizes = '100vw', eager = false, priority = false, cls = '', dark = null, scheme = 'auto' } = {}) {
  const s = SHOTS[name]; if (!s) return '';
  const img = { cls, src: `/img/landing/${name}-${s.w[0]}.webp`, srcset: shotSrcset(name), sizes, width: s.w[0], height: s.h, alt, lazy: !eager, priority, type: 'image/webp',
    dark: dark && SHOTS[dark] ? { srcset: shotSrcset(dark) } : null };
  return raw(themedPicture({ scheme, img }));
}

// ---------------------------------------------------------------------------------------------------- numbers
// Every number on the page comes from the code it describes.
const TASK_COUNT = Object.values(TASKS).reduce((n, list) => n + list.length, 0);
const bookCount = () => { const n = books().length; return n >= 100 ? `${Math.floor(n / 50) * 50}+` : String(n); };

/** "A, B and C" in the page's language. */
const joinNames = (req, names) => {
  if (/^en/.test(req.locale || DEFAULT_LOCALE)) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  try { return new Intl.ListFormat(req.t.intl || req.locale || 'en', { type: 'conjunction' }).format(names); } catch { return names.join(', '); }
};
const longDate = (req, ymd) => { try { return new Intl.DateTimeFormat(req.t.intl || req.locale || 'en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`)); } catch { return ymd; } };
const ARROW = raw('<span class="lp-arrow flip" aria-hidden="true">→</span>');

/** The videos: the Hub's overview and the four tool videos (views/see-it.js), and the eighteen "How it works" videos of
 *  the manipulatives. */
// How many manipulative videos the homepage shows before "Show all" (one row of six on a wide screen).
const HOW_PREVIEW = 6;
// In TUTORIALS order (the best-known tools first), so the preview leads with number lines and base ten blocks.
const manipVideos = () => [...TUTORIALS].map(slug => MANIP_TOOLS.find(x => x.slug === slug)).filter(Boolean).map(x => ({ slug: x.slug, name: x.name, ...tutorialOf(x.slug) }));

export function renderLanding(req, res) {
  const t = req.t;
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const T = (tag, key, attrs = '', vars) => raw(`<${tag}${attrs}${fb(key)}>${esc(t(key, vars))}</${tag}>`);
  const TH = (tag, key, attrs = '', vars) => raw(`<${tag}${attrs}${fb(key)}>${tHtml(t, key, vars)}</${tag}>`);
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const live = liveOn();
  const count = availableLocales().length;
  const lp = p => (req.pathLocale && seo.localizable(p) ? seo.localeUrl(p, req.pathLocale) : p);
  const theme = req.theme === 'light' || req.theme === 'dark' ? req.theme : 'auto';   // light unless Dark is picked or the device prefers it
  const title = t('landing.meta.title');
  const description = seo.clip(t('landing.meta.description'), 160);
  const langs = seo.langsWithKey('landing.hero.h1');
  const faq = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => [t(`landing.faq.q${i}`), t(i === 1 && focus.coursesHidden() ? 'landing.focus.faqA1' : `landing.faq.a${i}${i === 2 ? 'free' : ''}`, { count })]);
  const courseLinks = !focus.coursesHidden();
  const trial = (label, { big = false, cls = 'lp-btn-primary' } = {}) => html`<a class="lp-btn ${cls}${big ? ' lp-btn-big' : ''}" href="${TRIAL_URL}" data-cta="trial">${label}</a>`;
  /** The Teacher plan line on the Hub, Ask Oomba, the Manipulatives and Figures. */
  const planTag = () => TH('p', 'landing.plan.on', ' class="lp-plan"', { plans: '/plans' });
  const videos = readyVideos();
  const heroVideo = videos.find(v => v.id === HERO_VIDEO) || videos[0];
  const vidTitle = id => t(`teachers.videos.${id}.title`);
  /** A link that plays a video in the page's player (public/js/landing.js), or opens the file itself without script. */
  const vlink = ({ src, poster, vtt, title: name }, inner, cls) => html`<a class="${cls}" href="${src}" data-video="${src}" data-poster="${poster}" data-vtt="${vtt}" data-title="${name}" aria-label="${t('landing.videos.play', { title: name })}">${inner}</a>`;
  const toolVideo = id => ({ src: `/video/oomba-${id}.mp4`, poster: `/video/oomba-${id}-poster.jpg`, vtt: `/video/oomba-${id}.en.vtt`, title: vidTitle(id) });

  if (req.method === 'GET' && countable(req)) funnel.bump('landing.view');

  // ---- the top bar and the menu
  const NAV = [['#hub', 'hub', true], ['#tools', 'tools', true], ['#ask', 'ask', true], ['#tour', 'tour', true], ...(videos.length ? [['#videos', 'videos', true]] : []), [lp('/compare'), 'compare', true], ['#faq', 'faq', false]];
  const navLink = (href, key) => html`<a href="${href}"${fb(`landing.nav.${key}`)}>${t(`landing.nav.${key}`)}</a>`;
  const header = html`<a class="lp-skip" href="#lp-main">${t('landing.nav.skip')}</a>
<header class="lp-bar" id="lp-bar">
  <a class="lp-logo" href="${lp('/')}" aria-label="${t('landing.nav.home')}">${appMark('lp-mark')}<span class="lp-word" dir="ltr" aria-hidden="true">${wordmark('lp-wordmark')}<span>Academy</span></span></a>
  <nav class="lp-nav" aria-label="${t('landing.nav.label')}">
    ${NAV.filter(([, , wide]) => wide).map(([href, key]) => navLink(href, key))}
  </nav>
  <div class="lp-actions">
    <a class="lp-signin" href="/login">${t('landing.nav.signIn')}</a>
    <a class="lp-btn lp-btn-primary lp-btn-sm" href="${TRIAL_URL}" data-cta="trial" aria-label="${t('landing.nav.trial')}"><span class="lp-long">${t('landing.nav.trial')}</span><span class="lp-short" aria-hidden="true">${t('landing.nav.trialShort')}</span></a>
  </div>
  <details class="lp-menu" id="lp-menu">
    <summary class="lp-menu-btn" aria-label="${t('landing.nav.menu')}"><span class="lp-burger" aria-hidden="true"><i></i><i></i><i></i></span><span class="lp-menu-word"${fb('landing.nav.menu')}>${t('landing.nav.menu')}</span></summary>
    <nav class="lp-menu-panel" aria-label="${t('landing.nav.label')}">
      <ul>${NAV.map(([href, key]) => html`<li>${navLink(href, key)}</li>`)}</ul>
      <div class="lp-menu-foot"><a class="lp-btn lp-btn-ghost" href="/login">${t('landing.nav.signIn')}</a><a class="lp-btn lp-btn-spark" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a></div>
    </nav>
  </details>
</header>`;

  // ---- 1. the hero: every tool in one collage (real screens), the overview video, the numbers
  const tile = (name, key, cls, sizes) => html`<figure class="lp-tile ${cls}"><div class="lp-shot">${pic(name, { sizes, eager: true })}</div><figcaption${fb(key)}>${t(key)}</figcaption></figure>`;
  const hero = html`<section class="lp-hero lp-dots" aria-labelledby="lp-h1">
  <div class="lp-wrap">
    <div class="lp-hero-copy">
      ${T('p', 'landing.hero.kicker', ' class="lp-kicker"')}
      <h1 id="lp-h1" class="lp-h1"${fb('landing.hero.h1')}>${t('landing.hero.h1')}</h1>
      ${T('p', 'landing.hero.lead', ' class="lp-lead"')}
      <div class="lp-ctas">
        ${trial(t('landing.hero.cta'), { big: true })}
        <a class="lp-btn lp-btn-ghost lp-btn-big" href="#tour" data-cta="how"${fb('landing.hero.tour')}>${t('landing.hero.tour')}</a>
      </div>
      <ul class="lp-trust"><li>${t('landing.hero.trustCard')}</li><li>${t('landing.hero.trustCancel')}</li><li>${t('landing.hero.trustStudents')}</li></ul>
    </div>
    <div class="lp-collage">
      <div class="lp-collage-in" role="img" aria-label="${t('landing.hero.collageAlt')}">
        ${tile('tool-dash', 'landing.tools.dash.h', 'lp-t-main', '(min-width: 1100px) 660px, 92vw')}
        ${tile('tool-manip', 'landing.one.manip.h', 'lp-t-a', '(min-width: 1100px) 360px, 46vw')}
        ${tile('tool-figures', 'landing.tools.figures.h', 'lp-t-b', '(min-width: 1100px) 360px, 46vw')}
        ${tile('tool-library', 'landing.tools.read.h', 'lp-t-c', '(min-width: 1100px) 360px, 46vw')}
        ${tile('tool-brain-board', 'landing.tools.live.h', 'lp-t-d', '(min-width: 1100px) 360px, 46vw')}
        <div class="lp-t-chat lp-shot">${pic('chat-plan', { sizes: '220px', eager: true })}</div>
      </div>
      ${heroVideo ? vlink(toolVideo(heroVideo.id), html`<i aria-hidden="true"></i><span${fb('landing.hero.watch')}>${t('landing.hero.watch')}<small${fb('landing.hero.watchSub')}>${t('landing.hero.watchSub')}</small></span>`, 'lp-playbtn') : ''}
    </div>
    <ul class="lp-facts">
      <li><b>${MANIP_TOOLS.length}</b><span${fb('landing.facts.manip')}>${t('landing.facts.manip')}</span></li>
      <li><b>${TASK_COUNT}</b><span${fb('landing.facts.tasks')}>${t('landing.facts.tasks')}</span></li>
      <li><b>${FIGURE_KINDS.length}</b><span${fb('landing.facts.figures')}>${t('landing.facts.figures')}</span></li>
      <li><b>${bookCount()}</b><span${fb('landing.facts.books')}>${t('landing.facts.books')}</span></li>
      <li><b>${WIDGETS.length}</b><span${fb('landing.facts.widgets')}>${t('landing.facts.widgets')}</span></li>
      <li><b>${count}</b><span${fb('landing.facts.languages')}>${t('landing.facts.languages')}</span></li>
    </ul>
  </div>
</section>`;

  // ---- 2. one subscription instead of five (the named products, plain text)
  const names = html`<section class="lp-names" aria-labelledby="names-h"><div class="lp-wrap lp-names-in">
    <h2 id="names-h"${fb('landing.names.lead')}>${t('landing.names.lead')}</h2>
    <ul>${NAMED.map(n => html`<li lang="en" dir="ltr">${n}</li>`)}</ul>
    ${TH('p', 'landing.names.line', ' class="lp-names-line"', { compare: lp('/compare') })}
  </div></section>`;

  // ---- 3. in one place: ten things teachers buy one by one
  const ONE = [['live', '📡'], ['dash', '🖥️'], ['points', '🏆'], ['manip', '🧮'], ['figures', '📐'], ['typing', '🔠'], ['read', '📚'], ['geo', '🗺️'], ['build', '🛠️'], ['grammar', '📝']];
  const oneVars = { count: WIDGETS.length, tools: MANIP_TOOLS.length, tasks: TASK_COUNT };
  const one = html`<section class="lp-sec" id="one" aria-labelledby="one-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.one.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.one.h', ' id="one-h"')}${T('p', 'landing.one.lead', ' class="lp-sub"')}</header>
    <ul class="lp-ten">${ONE.map(([k, e]) => html`<li>${ico(e, { size: 44, lazy: true })}${T('h3', `landing.one.${k}.h`)}${T('p', `landing.one.${k}.p`, '', oneVars)}</li>`)}</ul>
    <div class="lp-band">
      <p><span${fb('landing.one.foot')}>${t('landing.one.foot')}</span>${TH('small', 'landing.one.footSub', '', { plans: '/plans' })}</p>
      <a class="lp-band-link" href="${lp('/compare')}"${fb('landing.one.compare')}>${t('landing.one.compare')} ${ARROW}</a>
    </div>
  </div></section>`;

  // ---- 4. the Hub
  const FEATS = [['f1', '📖'], ['f2', '📡'], ['f3', '💬'], ['f4', '⏱️'], ['f5', '🏆']];
  const MINIS = [['m1', '📝'], ['m2', '📚'], ['m3', '🧑‍🏫'], ['m4', '❤️']];
  const hub = html`<section class="lp-sec lp-dots lp-alt" id="hub" aria-labelledby="hub-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.hub.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.hub.h', ' id="hub-h"')}${T('p', 'landing.hub.lead', ' class="lp-sub"')}${planTag()}</header>
    <div class="lp-hub">
      <figure class="lp-hub-fig">
        <div class="lp-nowbar" aria-hidden="true"><span class="lp-pill">${t('landing.hub.nowPill')}</span><b>${t('landing.hub.nowTitle')}</b><small>${t('landing.hub.nowNext')}</small><span class="lp-clock" dir="ltr">7:47</span></div>
        <div class="lp-shot">${pic('hub-light', { alt: t('landing.hub.shotAlt'), sizes: '(min-width: 1100px) 640px, 92vw', dark: 'hub-dark', scheme: theme })}</div>
      </figure>
      <ul class="lp-feats">${FEATS.map(([k, e], i) => html`<li class="lp-feat${i === 0 ? ' on' : ''}">${ico(e, { size: 44, lazy: true })}<div>${T('h3', `landing.hub.${k}.h`)}${T('p', `landing.hub.${k}.p`)}</div></li>`)}</ul>
    </div>
    <ul class="lp-minis">${MINIS.map(([k, e]) => html`<li>${ico(e, { size: 28, lazy: true })}${T('h3', `landing.hub.${k}.h`)}${T('p', `landing.hub.${k}.p`)}</li>`)}</ul>
  </div></section>`;

  // ---- 5. Ask Oomba (each prompt is what the chat's tools do: services/companion*.js)
  const PROMPTS = [['p1', '⏱️'], ['p2', '🏁'], ['p3', '🏆'], ['p4', '📐'], ['p5', '🧮'], ['p6', '📖'], ['p7', '🖥️'], ['p8', '🔍']];
  const ask = html`<section class="lp-sec lp-ai" id="ask" aria-labelledby="ask-h"><div class="lp-wrap">
    <header class="lp-head"><p class="lp-eyebrow"><span class="lp-chip lp-chip-ai">${ico('✨', { size: 18 })} AI</span> <span${fb('landing.ask.kicker')}>${t('landing.ask.kicker')}</span></p>${T('h2', 'landing.ask.h', ' id="ask-h"')}${T('p', 'landing.ask.lead', ' class="lp-sub"')}${planTag()}</header>
    <div class="lp-ask">
      <div>
        <p class="lp-aicard lp-sayit" aria-hidden="true"><span>${t('landing.ask.box')}</span><span class="lp-btn lp-btn-ink lp-btn-sm">${ico('✨', { size: 18 })} ${t('landing.ask.send')}</span></p>
        <ul class="lp-prompts">${PROMPTS.map(([k, e]) => html`<li class="lp-aicard">${ico(e, { size: 32, lazy: true })}${T('p', `landing.ask.${k}.say`, ' class="lp-say"')}${T('p', `landing.ask.${k}.then`, ' class="lp-then"')}</li>`)}</ul>
        <ul class="lp-rules">${['r1', 'r2', 'r3'].map(k => T('li', `landing.ask.${k}`))}</ul>
      </div>
      <figure class="lp-chatpair">
        <div class="lp-shot lp-shot-ai">${pic('chat-plan', { alt: t('landing.ask.planAlt'), sizes: '(min-width: 1100px) 280px, 45vw' })}</div>
        <div class="lp-shot lp-shot-ai">${pic('chat-point', { alt: t('landing.ask.pointAlt'), sizes: '(min-width: 1100px) 280px, 45vw' })}</div>
        ${T('figcaption', 'landing.ask.note', ' class="lp-small"')}
      </figure>
    </div>
  </div></section>`;

  // ---- 6. the tools
  const toolCard = ({ key, shot, emoji, span, edge, meta = '', extra = '', gated = false, vars = {} }) => html`<article class="lp-card lp-tool ${span}" style="--edge:${edge}">
      <div class="lp-pic">${pic(shot, { alt: t(`landing.tools.${key}.alt`), sizes: span === 'lp-s3' ? '(min-width: 1100px) 560px, 92vw' : '(min-width: 1100px) 370px, 92vw' })}</div>
      ${extra}
      <div class="lp-tx"><h3${fb(`landing.tools.${key}.h`)}>${ico(emoji, { size: 28, lazy: true })} ${t(`landing.tools.${key}.h`, vars)}</h3>${T('p', `landing.tools.${key}.p`, '', vars)}${meta}${gated ? planTag() : ''}</div>
    </article>`;
  const chips = keys => html`<p class="lp-meta">${keys.map(([k, v]) => T('span', k, ' class="lp-chip"', v))}</p>`;
  const tutorials = manipVideos();
  const manipRow = html`<div class="lp-manips" aria-hidden="true">${MANIP_TOOLS.map(x => toolIco(x.slug, { size: 40, lazy: true }))}</div>`;
  const liveLinks = live ? html`<p class="lp-livelinks"><a class="lp-btn lp-btn-spark lp-btn-sm" href="${HOST_NOW_URL}" data-cta="host" id="lp-host-now"${fb('quickLive.cta')}>${ico('📡', { size: 18 })} ${t('quickLive.cta')}</a> <a class="lp-btn lp-btn-ghost lp-btn-sm" href="/join" id="lp-join"${fb('quickLive.haveCode')}>${t('quickLive.haveCode')}</a></p>` : '';
  const tools = html`<section class="lp-sec" id="tools" aria-labelledby="tools-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.nav.tools', ' class="lp-eyebrow"')}${T('h2', 'landing.tools.h', ' id="tools-h"')}${T('p', 'landing.tools.lead', ' class="lp-sub"')}</header>
    <div class="lp-tools">
      ${toolCard({ key: 'manip', shot: 'tool-manip', emoji: '🧮', span: 'lp-s3', edge: 'var(--mint)', extra: manipRow, gated: true, vars: { count: MANIP_TOOLS.length, tasks: TASK_COUNT },
        meta: chips([['landing.tools.manip.c1', {}], ['landing.tools.manip.c2', { count: TASK_COUNT }], ...(tutorials.length ? [['landing.tools.manip.c3', { count: tutorials.length }]] : [])]) })}
      ${toolCard({ key: 'figures', shot: 'tool-figures', emoji: '📐', span: 'lp-s3', edge: 'var(--spark)', gated: true, vars: { count: FIGURE_KINDS.length },
        meta: chips([['landing.tools.figures.c1', {}], ['landing.tools.figures.c2', {}]]) })}
      ${toolCard({ key: 'games', shot: 'tool-crossword', emoji: '🎮', span: 'lp-s2', edge: '#3F8FCF' })}
      ${toolCard({ key: 'grammar', shot: 'tool-mistake-hunt', emoji: '📝', span: 'lp-s2', edge: '#C2185B' })}
      ${toolCard({ key: 'read', shot: 'tool-library', emoji: '📚', span: 'lp-s2', edge: 'var(--mint)', vars: { count: bookCount() } })}
      ${toolCard({ key: 'live', shot: 'tool-brain-board', emoji: '📡', span: 'lp-s2', edge: 'var(--spark)', meta: liveLinks })}
      ${toolCard({ key: 'build', shot: 'tool-build', emoji: '🛠️', span: 'lp-s2', edge: '#7A3FC4' })}
      ${toolCard({ key: 'dash', shot: 'tool-dash', emoji: '🖥️', span: 'lp-s2', edge: '#3F8FCF', vars: { count: WIDGETS.length, layouts: LAYOUT_TEMPLATES.length } })}
      ${toolCard({ key: 'typing', shot: 'tool-typing-zoo', emoji: '🔠', span: 'lp-s3', edge: '#E06A00' })}
      ${toolCard({ key: 'atlas', shot: 'tool-atlas-quest', emoji: '🗺️', span: 'lp-s3', edge: '#1E8E4E' })}
    </div>
  </div></section>`;

  // ---- Google Classroom: only while it is on here (every line is teachers.classroom.*, the same words as /teachers), with
  // the gradebook and feedback screens under it.
  const classroom = classroomOn() ? html`<section class="lp-sec" id="classroom" aria-labelledby="classroom-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'teachers.classroom.kicker', ' class="lp-eyebrow"')}${T('h2', 'teachers.classroom.h', ' id="classroom-h"')}${T('p', 'teachers.classroom.lead', ' class="lp-sub"')}</header>
    <div class="lp-card lp-gc">
      <ul class="lp-list">${['li1', 'li2', 'li3', 'li4', 'li5'].map(k => html`<li><span class="lp-tick" aria-hidden="true">✓</span>${T('span', `teachers.classroom.${k}`)}</li>`)}</ul>
      <p class="lp-small"><span${fb('teachers.classroom.note')}>${t('teachers.classroom.note')}</span> <a href="/privacy#google">${t('teachers.classroom.privacy')}</a></p>
    </div>
    ${loopShots(t, ['gradebook', 'feedback'], theme)}
  </div></section>` : '';

  // ---- 7. side by side: what each product says it does (its own words, as /compare quotes them) and what Oomba adds
  const checked = longDate(req, COMPARE_CHECKED);
  const cards = versusNow();
  const glVars = cards.includes(VERSUS_GRAMMAR) ? grammarFacts() : {};
  const versus = html`<section class="lp-sec lp-alt" id="side-by-side" aria-labelledby="vs-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.vs.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.vs.h', ' id="vs-h"')}${T('p', 'landing.vs.lead', ' class="lp-sub"')}</header>
    <div class="lp-vs${cards.length === 4 ? ' lp-vs-4' : ''}">${cards.map(v => {
      const grammar = v === VERSUS_GRAMMAR;
      const comp = grammar ? GRAMMAR_RIVAL : COMPETITORS.find(c => c.id === v.id);
      const cells = grammar ? GRAMMAR_CELLS : CELLS;
      const quotes = v.rows.map(r => cells[r] && cells[r][v.id]).filter(c => c && c.s !== 'notStated' && c.src);
      const sites = [...new Set(quotes.map(c => new URL(c.src.url).hostname.replace(/^www\./, '')))];
      return html`<article class="lp-card lp-vs-card">
        <h3 lang="en" dir="ltr">${comp.name}</h3>
        <div class="lp-col">${T('b', 'landing.vs.does', '', { name: comp.name })}<ul>${quotes.map(c => html`<li><q lang="en" dir="ltr">${c.src.quote}</q> <a href="${c.src.url}" rel="noopener nofollow" class="lp-src-link" lang="en" dir="ltr">${new URL(c.src.url).hostname.replace(/^www\./, '')}</a></li>`)}</ul></div>
        <div class="lp-col lp-us">${T('b', `landing.vs.${v.us || 'adds'}`)}${T('p', `landing.vs.${v.adds}`, '', { count: WIDGETS.length, tools: MANIP_TOOLS.length, tasks: TASK_COUNT, ...glVars })}</div>
        <p class="lp-src"${fb('landing.vs.source')}>${t('landing.vs.source', { site: sites.join(', '), date: grammar ? longDate(req, GRAMMAR_CHECKED) : checked })}</p>
      </article>`;
    })}</div>
    <p class="lp-center"><a class="lp-more" href="${lp('/compare')}"${fb('landing.vs.more')}>${t('landing.vs.more')} ${ARROW}</a></p>
  </div></section>`;

  // ---- 8. the click-through tour of the Hub: six steps on real screens. Without script it is the list of all six;
  // public/js/landing.js shows one at a time with Back, Next, the arrow keys, swipe and the progress bar.
  // Each step zooms its screenshot into the part that matters (the camera: cx, cy, the centre in % of the picture, and w,
  // the share of its width in view on a phone; a wider screen sees 1.6 times as much) and rings the one control the
  // step is about (ring: x, y, w, h in % of the picture). The ring is a highlight, not a button: nothing on the picture
  // is tappable, so nothing looks it. Between steps the camera pans and zooms from one region to the next (none under
  // prefers-reduced-motion). Every number here was read off the screenshots (scripts/landing-shots.mjs).
  const STEPS = [
    { shot: 'tour-seats', cam: [47, 36, 40], ring: [34.4, 16.9, 26.3, 5.2] },
    { shot: 'tour-handout', cam: [20, 70, 42], ring: [10.2, 77.4, 9.1, 14.2] },
    { shot: 'tour-watch', cam: [45, 66, 42], ring: [30.8, 53.6, 26.8, 23.2] },
    { shot: 'tour-hands', cam: [86, 32, 30], ring: [76, 24.8, 22.5, 13.8] },
    { shot: 'tour-oomba', cam: [84, 52, 34], ring: [75.6, 57.2, 10, 5.4] },
    { shot: 'tour-finish', cam: [50, 50, 34], ring: [54.4, 54.6, 9.4, 5.6] },
  ].filter(s => SHOTS[s.shot]);
  const n = STEPS.length;
  const camStyle = ([cx, cy, w]) => `--cx:${cx};--cy:${cy};--w:${w}`;
  const tour = n ? html`<section class="lp-sec" id="tour" aria-labelledby="tour-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.tour.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.tour.h', ' id="tour-h"')}${T('p', 'landing.tour.lead', ' class="lp-sub"')}${planTag()}</header>
    <div class="lp-card lp-tour" data-tour aria-label="${t('landing.tour.label')}" role="region">
      <ol class="lp-steps">${STEPS.map((s, i) => html`<li><button type="button" class="lp-step" data-go="${i}"${i === 0 ? raw(' aria-current="step"') : ''}><i aria-hidden="true">${i + 1}</i><span${fb(`landing.tour.s${i + 1}.t`)}>${t(`landing.tour.s${i + 1}.t`)}</span></button></li>`)}</ol>
      <p class="sr-only" aria-live="polite" data-tour-live></p>
      <ol class="lp-tsteps">${STEPS.map((s, i) => html`<li class="lp-tstep" data-step="${i}">
        <div class="lp-tstage">
          <div class="lp-tcam" data-cam="${s.cam.join(',')}" style="${camStyle(s.cam)}">
            <div class="lp-shot">${pic(s.shot, { alt: t(`landing.tour.s${i + 1}.alt`), sizes: '(max-width: 900px) 300vw, 1800px' })}</div>
            <span class="lp-ring" style="left:${s.ring[0]}%;top:${s.ring[1]}%;width:${s.ring[2]}%;height:${s.ring[3]}%" aria-hidden="true"></span>
          </div>
        </div>
        <div class="lp-tip">
          <h3 tabindex="-1"${fb(`landing.tour.s${i + 1}.t`)}>${t(`landing.tour.s${i + 1}.t`)}</h3>${T('p', `landing.tour.s${i + 1}.p`)}
          <div class="lp-tipnav"><span${fb('landing.tour.stepOf')}>${t('landing.tour.stepOf', { n: i + 1, total: n })}</span><span class="lp-tipbtns" hidden><button type="button" class="lp-btn lp-btn-ghost lp-btn-xs" data-back${fb('landing.tour.back')}>${t('landing.tour.back')}</button><button type="button" class="lp-btn lp-btn-primary lp-btn-xs" data-next${fb('landing.tour.next')}>${i === n - 1 ? t('landing.tour.again') : t('landing.tour.next')}</button></span></div>
        </div>
      </li>`)}</ol>
      <div class="lp-tour-foot">${T('span', 'landing.tour.note', ' class="lp-small"')}<span class="lp-progress" role="progressbar" aria-label="${t('landing.tour.label')}" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="1"><i style="width:${(100 / n).toFixed(2)}%"></i></span>${trial(t('landing.hero.cta'), { cls: 'lp-btn-primary lp-btn-sm' })}</div>
    </div>
  </div></section>` : '';

  // ---- 9. the videos: the tool videos (posters, captions; played in the page's player) and the 18 "How it works"
  // The how-it-works row shows a preview; the rest of the manipulative videos fold open under "Show all".
  const howLi = v => html`<li>${vlink({ src: v.mp4, poster: v.poster, vtt: v.vtt, title: v.name }, html`<img src="${v.poster}" width="640" height="360" alt="" loading="lazy" decoding="async"><span class="lp-pb lp-pb-sm" aria-hidden="true"></span><span class="lp-howname" lang="en" dir="ltr">${v.name}</span>`, 'lp-how')}</li>`;
  const vcard = (v, big) => vlink(toolVideo(v.id), html`<img src="/video/oomba-${v.id}-poster.jpg" width="1280" height="720" alt="" loading="lazy" decoding="async"><span class="lp-pb" aria-hidden="true"></span><span class="lp-vcap"><b${fb(`teachers.videos.${v.id}.title`)}>${vidTitle(v.id)}</b><span${fb(`teachers.videos.${v.id}.p`)}>${t(`teachers.videos.${v.id}.p`)}</span></span>`, `lp-vid${big ? ' lp-vid-big' : ''}`);
  const ordered = heroVideo ? [heroVideo, ...videos.filter(v => v !== heroVideo)] : videos;
  const videosSec = videos.length ? html`<section class="lp-sec lp-dots lp-alt" id="videos" aria-labelledby="videos-h"><div class="lp-wrap">
    <header class="lp-head">${T('p', 'landing.videos.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.videos.h', ' id="videos-h"')}${T('p', 'landing.videos.lead', ' class="lp-sub"')}</header>
    <div class="lp-vids">${ordered.map((v, i) => vcard(v, i === 0))}</div>
    ${tutorials.length ? html`${T('h3', 'landing.videos.howH', ' class="lp-howh"')}
    <ul class="lp-howrow">${tutorials.slice(0, HOW_PREVIEW).map(howLi)}</ul>${tutorials.length > HOW_PREVIEW ? html`
    <details class="lp-howmore"><summary class="lp-btn lp-btn-ghost lp-btn-sm"><span class="lp-howmore-o"${fb('landing.videos.more')}>${t('landing.videos.more', { count: tutorials.length })}</span><span class="lp-howmore-c"${fb('landing.videos.less')}>${t('landing.videos.less')}</span></summary>
    <ul class="lp-howrow">${tutorials.slice(HOW_PREVIEW).map(howLi)}</ul></details>` : ''}` : ''}
  </div>
  <dialog class="lp-vd" id="lp-vd" aria-labelledby="lp-vd-h">
    <div class="lp-vd-in"><div class="lp-vd-top"><h2 id="lp-vd-h" class="lp-vd-h" lang="en" dir="ltr"></h2><button type="button" class="lp-vd-x" data-close aria-label="${t('landing.videos.close')}"><span aria-hidden="true">×</span></button></div>
    <video class="lp-vd-v" controls playsinline muted preload="none" width="1280" height="720"></video></div>
  </dialog></section>` : '';

  // ---- 10. safety
  const SAFE = [['c1', '🛡️'], ['c2', '🔒'], ['c3', '🧑‍🏫'], ['c4', '✨'], ['c5', '⚖️'], ['c6', '📡']];
  const safety = html`<section class="lp-sec" id="safety" aria-labelledby="safety-h"><div class="lp-wrap">
    <header class="lp-head lp-c">${T('p', 'landing.safety.kicker', ' class="lp-eyebrow"')}${T('h2', 'landing.safety.h', ' id="safety-h"')}</header>
    <ul class="lp-safe">${SAFE.map(([k, e]) => html`<li class="lp-card">${ico(e, { size: 44, lazy: true })}<div>${T('h3', `landing.safety.${k}.h`)}${T('p', `landing.safety.${k}.p`)}</div></li>`)}</ul>
    <p class="lp-small lp-center">${tHtml(t, 'landing.safety.links', { safety: lp('/safety'), privacy: '/privacy' })}</p>
  </div></section>`;

  // ---- 11. questions, with a door each to /parents and /teachers
  const kicker = s => { const l = leadIcon(s); return l ? html`${ico(l[0], { size: 18 })} ${l[1]}` : s; };
  const door = (path, k, badges) => html`<a class="lp-card lp-door" href="${lp(path)}"${fb(`${k}.h1`)}>
      <span class="lp-eyebrow">${kicker(t(`${k}.kicker`))}</span><h3>${t(`${k}.h1`)}</h3><p>${t(`${k}.description`)}</p>
      <ul class="lp-door-badges">${badges.map(b => html`<li><span aria-hidden="true">✓</span> ${t(`${k}.badges.${b}`)}</li>`)}</ul>
      <span class="lp-door-go" aria-hidden="true">${ARROW}</span></a>`;
  const faqSec = html`<section class="lp-sec lp-alt" id="faq" aria-labelledby="faq-h"><div class="lp-wrap lp-narrow">
    <header class="lp-head lp-c"><h2 id="faq-h">${t('landing.faq.h')}</h2></header>
    <div class="lp-faq">${faq.map(([q, a], i) => html`<details class="lp-card"${i === 0 ? raw(' open') : ''}><summary><h3>${q}</h3><span class="lp-plus" aria-hidden="true"></span></summary><p>${a}</p></details>`)}</div>
    <div class="lp-doors">${door('/parents', 'parents', ['ads', 'buy', 'strangers'])}${door('/teachers', 'teachers', ['ads', 'browser', 'google'])}</div>
  </div></section>`;

  // ---- 12. the last call
  const final = html`<section class="lp-final" aria-labelledby="final-h">
    ${T('h2', 'landing.final.h', ' id="final-h"')}${T('p', 'landing.final.p')}
    <div class="lp-ctas">${trial(t('landing.hero.cta'), { big: true })}<a class="lp-btn lp-btn-onink lp-btn-big" href="#tour" data-cta="how"${fb('landing.hero.tour')}>${t('landing.hero.tour')}</a></div>
  </section>`;

  const playBand = html`<section class="lp-play" id="play" aria-labelledby="play-h"><div class="lp-wrap lp-play-in"><h2 id="play-h">${ico('🎮', { size: 28 })} ${t('landing.play.h')}</h2><p>${t(focus.arcadeHidden() ? 'landing.focus.play' : 'landing.play.p')}</p><a class="lp-btn lp-btn-spark" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.play.cta')} ${ARROW}</a></div></section>`;
  const others = availableLocales().filter(l => langs.includes(l.code));
  const footer = html`<footer class="lp-foot">
  ${playBand}
  <div class="lp-wrap lp-foot-in">
    <div class="lp-foot-brand"><a class="lp-logo" href="${lp('/')}" aria-label="${t('landing.nav.home')}">${appMark('lp-mark')}<span class="lp-word" dir="ltr" aria-hidden="true">${wordmark('lp-wordmark')}<span>Academy</span></span></a><p class="lp-tagline">${t('brand.tagline')}</p>
      <a class="lp-btn lp-btn-ghost lp-btn-sm" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a>
      <a class="lp-pref" href="${PREFERRED_SOURCE_URL}" rel="noopener" data-cta="preferred-source">${ico('⭐', { size: 18 })}${t('landing.footer.preferredSource')}</a></div>
    <nav aria-labelledby="ft-t"><h2 id="ft-t">${t('landing.footer.teachers')}</h2><ul>
      <li><a href="${lp('/teachers')}">${t('landing.footer.guide')}</a></li>
      ${courseLinks ? html`<li><a href="${lp('/teachers/cs-quest')}">${t('landing.courses.cs.name')}</a></li>
      <li><a href="/teachers/number-quest">${t('landing.courses.nq.name')}</a></li>
      <li><a href="/teachers/cyber-defenders">${t('landing.courses.cd.name')}</a></li>` : ''}
      ${live ? html`<li><a href="${lp('/teachers/live')}">${t('landing.nav.live')}</a></li>` : ''}
      <li><a href="/plans" data-cta="pricing">${t('landing.footer.plans')}</a></li>
      <li><a href="${lp('/compare')}"${fb('landing.nav.compare')}>${t('landing.nav.compare')}</a></li>
      <li><a href="${lp('/research')}">${t('research.footer')}</a></li>
    </ul></nav>
    <nav aria-labelledby="fe-t"><h2 id="fe-t">${t('landing.footer.product')}</h2><ul>
      <li><a href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')}</a></li>
      ${live ? html`<li><a href="/join"${fb('quickLive.join')}>${t('quickLive.join')}</a></li>` : ''}
      <li><a href="${lp('/learn')}">${t('landing.footer.learn')}</a></li>
      <li><a href="${lp('/parents')}">${t('landing.footer.parents')}</a></li>
      <li><a href="${lp('/safety')}">${t('landing.footer.safety')}</a></li>
      <li><a href="/login">${t('landing.nav.signIn')}</a></li>
    </ul></nav>
    <nav aria-labelledby="fa-t"><h2 id="fa-t">${t('landing.footer.about')}</h2><ul>
      <li><a href="/privacy">${t('landing.footer.privacy')}</a></li>
      <li><a href="${lp('/compliance')}">${t('compliance.footer')}</a></li>
      <li><a href="/terms">${t('landing.footer.terms')}</a></li>
      <li><a href="/refunds">${t('landing.footer.refunds')}</a></li>
      <li><a href="mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t('landing.pricing.schools.subject'))}">${t('landing.footer.contact')}</a></li>
    </ul></nav>
  </div>
  <div class="lp-wrap lp-foot-base">
    <nav class="lp-langs" aria-labelledby="fl-t"><h2 id="fl-t" class="sr-only">${t('landing.footer.languages')}</h2>${ico('🌐', { size: 18 })}${others.map(l => html`<a href="${seo.localeUrl('/', l.code)}" hreflang="${l.code}" lang="${l.code}"${l.code === locale ? raw(' aria-current="page"') : ''}>${l.name}</a>`)}</nav>
    <p class="lp-theme"><span>${t('landing.footer.theme')}:</span> <a href="?theme=light" rel="nofollow"${theme === 'light' ? raw(' aria-current="true"') : ''}>${ico('☀️', { size: 18 })} ${t('landing.footer.light')}</a> <a href="?theme=dark" rel="nofollow"${theme === 'dark' ? raw(' aria-current="true"') : ''}>${ico('🌙', { size: 18 })} ${t('landing.footer.dark')}</a></p>
    <p class="lp-copy">© ${new Date().getFullYear()} ${BRAND}</p>
  </div>
  <div class="lp-wrap">${TH('p', 'landing.footer.trademarks', ' class="lp-tm"', { names: joinNames(req, namedNow()) })}</div>
</footer>`;

  const jsonld = seo.graph([
    seo.organizationLd(req),
    seo.websiteLd(req, locale),
    { '@type': 'WebPage', '@id': seo.abs(req, lp('/')) + '#webpage', url: seo.abs(req, lp('/')), name: title, description, inLanguage: info.code,
      isPartOf: { '@id': seo.abs(req, '/#website') }, about: { '@id': seo.abs(req, '/#app') }, primaryImageOfPage: seo.abs(req, '/og/landing.jpg') },
    softwareLd(req, t, { description, langs }),
    seo.faqLd(faq.map(([q, a]) => [q, seo.plainText(a)])),
  ]);

  const body = html`${header}<main id="lp-main">${hero}${names}${one}${hub}${ask}${tools}${classroom}${versus}${tour}${videosSec}${safety}${faqSec}${final}</main>${footer}`;
  const head = seo.seoHead(req, { index: true, path: '/', langs, image: '/og/landing.jpg', imageAlt: t('landing.meta.imageAlt'), jsonld: [jsonld] }, { title, description });
  // The first picture on the screen, fetched before the CSS is read (the collage's big screen).
  const lead = SHOTS['tool-dash'] ? `<link rel="preload" as="image" type="image/webp" href="/img/landing/tool-dash-${SHOTS['tool-dash'].w[0]}.webp" imagesrcset="${esc(shotSrcset('tool-dash'))}" imagesizes="(min-width: 1100px) 660px, 92vw" fetchpriority="high">` : '';
  const themeMeta = theme === 'auto'
    ? `<meta name="color-scheme" content="light dark">\n<meta name="theme-color" content="${BAR_COLORS.light}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BAR_COLORS.dark}" media="(prefers-color-scheme: dark)">`
    : `<meta name="color-scheme" content="${theme}">\n<meta name="theme-color" content="${theme === 'light' ? BAR_COLORS.light : BAR_COLORS.dark}">`;
  res.status(200).type('html').set('Vary', 'Cookie, Accept-Language').send(`<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}"${theme === 'auto' ? '' : ` data-theme="${theme}"`} class="lp-html">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${themeMeta}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${head}
<link rel="icon" href="/favicon.ico?v=${ICONS_V}" sizes="32x32">
<link rel="icon" href="/icons/icon.svg?v=${ICONS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${ICONS_V}">
<link rel="manifest" href="/manifest.webmanifest?v=${ICONS_V}">
<link rel="preload" href="/fonts/bricolage-grotesque-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
${lead}
<link rel="stylesheet" href="/css/landing.css?v=${VERSION}">
</head>
<body class="lp">
${body}
<script type="module" src="/js/landing.js?v=${VERSION}"></script>
</body>
</html>`);
}

/** The product as structured data. Following the game pages (docs/decisions.md "Search engines"), no
 *  applicationCategory/operatingSystem without ratings, and no price unless LANDING_SHOW_PRICE. */
function softwareLd(req, t, { description, langs }) {
  const app = {
    '@type': 'SoftwareApplication', '@id': seo.abs(req, '/#app'), name: BRAND, url: seo.abs(req, '/'), description,
    publisher: { '@id': seo.orgId(req) }, image: seo.abs(req, '/og/landing.jpg'),
    screenshot: ['tool-dash', 'hub-light', 'tool-manip', 'tool-figures'].filter(n => SHOTS[n]).map(n => seo.abs(req, `/img/landing/${n}-${SHOTS[n].w[1]}.webp`)),
    inLanguage: langs, isAccessibleForFree: false,
    audience: [{ '@type': 'EducationalAudience', educationalRole: 'teacher' }, ...seo.audienceLd()],
    featureList: ['live', 'dash', 'points', 'manip', 'figures', 'typing', 'read', 'geo', 'build', 'grammar'].map(k => t(`landing.one.${k}.h`)).concat([t('landing.hub.h'), t('landing.ask.kicker')]),
  };
  if (LANDING_SHOW_PRICE) {
    app.offers = { '@type': 'Offer', name: t('landing.pricing.teacher.name'), price: TEACHER_PRICE.amount, priceCurrency: TEACHER_PRICE.currency, url: seo.abs(req, TRIAL_URL),
      priceSpecification: { '@type': 'UnitPriceSpecification', price: TEACHER_PRICE.amount, priceCurrency: TEACHER_PRICE.currency, billingDuration: 'P1Y', unitText: 'teacher' },
      description: t('landing.pricing.teacher.trial') };
  }
  return app;
}
