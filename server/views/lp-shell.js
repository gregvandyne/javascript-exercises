// The teacher marketing site's own shell (docs/decisions.md "Homepage: the one classroom tool for everything" and
// "Teachers pages in the homepage's design"): the header, the footer and the page around them, shared by "/" (routes/landing.js),
// /teachers and /teachers/live (routes/teachers.js). Its look is public/css/landing.css and its script public/js/landing.js;
// it never loads the app's shell (views/layout.js), so the app's navigation can change without touching these pages.
//
// One rule for the main call to action (teacherCta), so the header's button and each hero's main button never disagree:
// while paid plans are on for everyone (services/teacher-tools.js plansOn) they read "Start free trial" and go to the
// trial; otherwise they read "Create a teacher account" and go to the teacher sign-up.
//
// The trademark line (the other products "/" may name) is in the footer of "/" only: no other page names them
// (tests/unit/compare.test.js).
import { html, raw, esc, jsonData } from './html.js';
import { appMark, wordmark, BRAND, ICONS_V } from './brand.js';
import { VERSION, signedOut, legalReader } from './layout.js';
import { BAR_COLORS } from '../theme.js';
import { localeInfo, availableLocales, clientStrings, DEFAULT_LOCALE } from '../i18n/index.js';
import * as seo from '../seo.js';
import { liveOn } from '../services/classlive-sessions.js';
import { plansOn } from '../services/teacher-tools.js';
import { familiesOn } from '../services/family.js';
import { ico } from './icon.js';
import * as focus from '../services/game-focus.js';

/** Where "Just Play" goes: the games for kids, no sign-up. */
export const JUST_PLAY_URL = '/learn';
/** "Start free trial" while paid plans are on (the Teacher plan's 14-day trial, no card): "Who's signing up?" first;
 *  "I'm a teacher" there keeps ?trial=1 through the teacher's steps, which end at /trial. */
export const TRIAL_URL = '/signup?trial=1';
/** "Create a teacher account" while paid plans are off: the teacher sign-up (routes/onboarding.js). */
export const SIGNUP_URL = '/signup/for/teacher';
/** "Host a live lesson now": the three-field teacher sign-up, then the Quick game chooser (routes/quick-live.js). */
export const HOST_NOW_URL = '/teachers/host';
/** Schools: invoices, purchase orders, more than a few teachers. */
export const SALES_EMAIL = 'Greg@oomba.ai';
// Google's preferred sources deeplink (Search Central, "Help your readers find your site through preferred sources"):
// a reader who taps it can mark oomba.ai as a source they prefer in Google Search. A plain link, no Google script.
export const PREFERRED_SOURCE_URL = 'https://www.google.com/preferences/source?q=oomba.ai';
export const ARROW = raw('<span class="lp-arrow flip" aria-hidden="true">→</span>');

/**
 * The main call to action, the same on every page of the teacher site: { href, key (its words), short (on a phone's
 * top bar), cta (the click count: routes/landing.js CTAS), trial }. Plans on: the trial (signed in, straight to /trial);
 * plans off: the teacher sign-up.
 */
export function teacherCta(req) {
  if (plansOn()) return { trial: true, href: req && !signedOut(req.user) ? '/trial' : TRIAL_URL, key: 'landing.nav.trial', short: 'landing.nav.trialShort', cta: 'trial' };
  return { trial: false, href: SIGNUP_URL, key: 'teachers.cta.start', short: 'landing.nav.signupShort', cta: 'signup' };
}
/** That call to action as a button. */
export function ctaButton(req, { big = false, cls = 'lp-btn-primary', id = '' } = {}) {
  const t = req.t, c = teacherCta(req);
  const fb = t.own(c.key) ? '' : raw(' lang="en" dir="ltr"');
  return html`<a class="lp-btn ${cls}${big ? ' lp-btn-big' : ''}" href="${c.href}" data-cta="${c.cta}"${id ? raw(` id="${id}"`) : ''}${fb}>${t(c.key)}</a>`;
}

/** lang/dir for a string still in English. */
const fbOf = t => key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
/** A path in the language address the reader came in on (/es/teachers -> /es/compare). */
export const lpPath = (req, p) => (req.pathLocale && seo.localizable(p) ? seo.localeUrl(p, req.pathLocale) : p);

/**
 * The top bar and its menu. home: true on "/" (the section links are on this page); elsewhere they go to "/"'s sections,
 * except those in `here` ({ tools: '#tools' }: the same section on this page). Signed in, Sign in and the main button
 * give way to Home (their own home page).
 */
export function lpHeader(req, { home = false, here = {}, videos = true } = {}) {
  const t = req.t, fb = fbOf(t);
  const root = lpPath(req, '/');
  const at = id => (here[id] || (home ? `#${id}` : `${root === '/' ? '' : root}/#${id}`));
  const NAV = [[at('hub'), 'hub', true], [at('tools'), 'tools', true], [at('ask'), 'ask', true], [at('tour'), 'tour', true], ...(videos ? [[at('videos'), 'videos', true]] : []), [lpPath(req, '/compare'), 'compare', true], [here.faq || (home ? '#faq' : at('faq')), 'faq', false]];
  const navLink = (href, key) => html`<a href="${href}"${fb(`landing.nav.${key}`)}>${t(`landing.nav.${key}`)}</a>`;
  const out = signedOut(req.user);
  const c = teacherCta(req);
  const actions = out
    ? html`<a class="lp-signin" href="/login">${t('landing.nav.signIn')}</a>
    <a class="lp-btn lp-btn-primary lp-btn-sm" href="${c.href}" data-cta="${c.cta}" aria-label="${t(c.key)}"><span class="lp-long">${t(c.key)}</span><span class="lp-short" aria-hidden="true">${t(c.short)}</span></a>`
    : html`<a class="lp-btn lp-btn-ghost lp-btn-sm" href="/">${ico('🏠', { size: 18 })} ${t('nav.home')}</a>`;
  return html`<a class="lp-skip" href="#lp-main">${t('landing.nav.skip')}</a>
<header class="lp-bar" id="lp-bar">
  <a class="lp-logo" href="${root}" aria-label="${t('landing.nav.home')}">${appMark('lp-mark')}<span class="lp-word" dir="ltr" aria-hidden="true">${wordmark('lp-wordmark')}<span>Academy</span></span></a>
  <nav class="lp-nav" aria-label="${t('landing.nav.label')}">
    ${NAV.filter(([, , wide]) => wide).map(([href, key]) => navLink(href, key))}
  </nav>
  <div class="lp-actions">
    ${actions}
  </div>
  <details class="lp-menu" id="lp-menu">
    <summary class="lp-menu-btn" aria-label="${t('landing.nav.menu')}"><span class="lp-burger" aria-hidden="true"><i></i><i></i><i></i></span><span class="lp-menu-word"${fb('landing.nav.menu')}>${t('landing.nav.menu')}</span></summary>
    <nav class="lp-menu-panel" aria-label="${t('landing.nav.label')}">
      <ul>${NAV.map(([href, key]) => html`<li>${navLink(href, key)}</li>`)}</ul>
      <div class="lp-menu-foot">${out ? html`<a class="lp-btn lp-btn-ghost" href="/login">${t('landing.nav.signIn')}</a>` : html`<a class="lp-btn lp-btn-ghost" href="/">${t('nav.home')}</a>`}<a class="lp-btn lp-btn-spark" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')} ${ARROW}</a></div>
    </nav>
  </details>
</header>`;
}

/**
 * The footer: "Here to play?", the links (Plans & pricing only while that page is there: family.js familiesOn), the languages (each to this page in that language: path, langs) and the theme.
 * trademarks: the line naming the other products, only on "/" (its markup, made there).
 */
export function lpFooter(req, { path = '/', langs = null, trademarks = '' } = {}) {
  const t = req.t, fb = fbOf(t);
  const locale = req.locale || DEFAULT_LOCALE;
  const live = liveOn();
  const lp = p => lpPath(req, p);
  const theme = lpTheme(req);
  const courseLinks = !focus.coursesHidden();
  const others = availableLocales().filter(l => !langs || langs.includes(l.code));
  // The grown-ups' pages (research, compliance, terms, refunds, plans) for the signed-out and grown-ups who teach or
  // buy, as in the app's footer (views/layout.js legalReader); a child signed in gets the rest.
  const adult = signedOut(req.user) || legalReader(req.user);
  const playBand = html`<section class="lp-play" id="play" aria-labelledby="play-h"><div class="lp-wrap lp-play-in"><h2 id="play-h">${ico('🎮', { size: 28 })} ${t('landing.play.h')}</h2><p>${t(focus.arcadeHidden() ? 'landing.focus.play' : 'landing.play.p')}</p><a class="lp-btn lp-btn-spark" href="${JUST_PLAY_URL}" data-cta="play">${t('landing.play.cta')} ${ARROW}</a></div></section>`;
  return html`<footer class="lp-foot">
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
      ${adult && familiesOn(req) ? html`<li><a href="/plans" data-cta="pricing">${t('landing.footer.plans')}</a></li>` : ''}
      <li><a href="${lp('/compare')}"${fb('landing.nav.compare')}>${t('landing.nav.compare')}</a></li>
      ${adult ? html`<li><a href="${lp('/research')}">${t('research.footer')}</a></li>` : ''}
    </ul></nav>
    <nav aria-labelledby="fe-t"><h2 id="fe-t">${t('landing.footer.product')}</h2><ul>
      <li><a href="${JUST_PLAY_URL}" data-cta="play">${t('landing.nav.justPlay')}</a></li>
      ${live ? html`<li><a href="/join"${fb('quickLive.join')}>${t('quickLive.join')}</a></li>` : ''}
      <li><a href="${lp('/learn')}">${t('landing.footer.learn')}</a></li>
      <li><a href="${lp('/parents')}">${t('landing.footer.parents')}</a></li>
      <li><a href="${lp('/safety')}">${t('landing.footer.safety')}</a></li>
      ${signedOut(req.user) ? html`<li><a href="/login">${t('landing.nav.signIn')}</a></li>` : ''}
    </ul></nav>
    <nav aria-labelledby="fa-t"><h2 id="fa-t">${t('landing.footer.about')}</h2><ul>
      <li><a href="/privacy">${t('landing.footer.privacy')}</a></li>
      ${adult ? html`<li><a href="${lp('/compliance')}">${t('compliance.footer')}</a></li>
      <li><a href="/terms">${t('landing.footer.terms')}</a></li>
      <li><a href="/refunds">${t('landing.footer.refunds')}</a></li>` : ''}
      <li><a href="mailto:${SALES_EMAIL}?subject=${encodeURIComponent(t('landing.pricing.schools.subject'))}">${t('landing.footer.contact')}</a></li>
    </ul></nav>
  </div>
  <div class="lp-wrap lp-foot-base">
    <nav class="lp-langs" aria-labelledby="fl-t"><h2 id="fl-t" class="sr-only">${t('landing.footer.languages')}</h2>${ico('🌐', { size: 18 })}${others.map(l => html`<a href="${seo.localeUrl(path, l.code)}" hreflang="${l.code}" lang="${l.code}"${l.code === locale ? raw(' aria-current="page"') : ''}>${l.name}</a>`)}</nav>
    <p class="lp-theme"><span>${t('landing.footer.theme')}:</span> <a href="?theme=light" rel="nofollow"${theme === 'light' ? raw(' aria-current="true"') : ''}>${ico('☀️', { size: 18 })} ${t('landing.footer.light')}</a> <a href="?theme=dark" rel="nofollow"${theme === 'dark' ? raw(' aria-current="true"') : ''}>${ico('🌙', { size: 18 })} ${t('landing.footer.dark')}</a></p>
    <p class="lp-copy">© ${new Date().getFullYear()} ${BRAND}</p>
  </div>
  ${trademarks ? html`<div class="lp-wrap">${trademarks}</div>` : ''}
</footer>`;
}

/** Light unless Dark is picked on the site or (no choice) the device prefers it. */
export const lpTheme = req => (req.theme === 'light' || req.theme === 'dark' ? req.theme : 'auto');

/**
 * The whole page: the <head> (title, description, search tags from seo.seoHead, icons, the font, landing.css), the body
 * (header, main, footer) and landing.js. head: extra tags (a preload); strings: the client strings a page script needs
 * (with app: true, /js/app.js for a form that posts as JSON, and its toasts).
 */
export function lpPage(req, res, { title, description, seo: seoOpts, header, main, footer, head = '', app = false, status = 200 }) {
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const theme = lpTheme(req);
  const themeMeta = theme === 'auto'
    ? `<meta name="color-scheme" content="light dark">\n<meta name="theme-color" content="${BAR_COLORS.light}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BAR_COLORS.dark}" media="(prefers-color-scheme: dark)">`
    : `<meta name="color-scheme" content="${theme}">\n<meta name="theme-color" content="${theme === 'light' ? BAR_COLORS.light : BAR_COLORS.dark}">`;
  const appScripts = app ? `${jsonData('i18n', { lang: locale, dir: info.dir, intl: info.intl, strings: clientStrings(locale, ['js.app'], { teacher: !!req.teacherWords }) })}
<div class="toasts" role="status" aria-live="polite" id="toasts"></div>
<script type="module" src="/js/app.js?v=${VERSION}"></script>` : '';
  res.status(status).type('html').set('Vary', 'Cookie, Accept-Language').send(`<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}"${theme === 'auto' ? '' : ` data-theme="${theme}"`} class="lp-html">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${themeMeta}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${seo.seoHead(req, seoOpts, { title, description })}
<link rel="icon" href="/favicon.ico?v=${ICONS_V}" sizes="32x32">
<link rel="icon" href="/icons/icon.svg?v=${ICONS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${ICONS_V}">
<link rel="manifest" href="/manifest.webmanifest?v=${ICONS_V}">
<link rel="preload" href="/fonts/bricolage-grotesque-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
${head}
<link rel="stylesheet" href="/css/landing.css?v=${VERSION}">
</head>
<body class="lp">
${header}<main id="lp-main">${main}</main>${footer}
${appScripts}
<script type="module" src="/js/landing.js?v=${VERSION}"></script>
</body>
</html>`);
}

