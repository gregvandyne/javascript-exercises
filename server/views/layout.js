// Page layout. Contract for every route:
//   res.send(layout(req, { title, active, body, scripts, head, back, bodyClass, description, bare, mid, i18n }))
//   mid: true = a medium-width page (reading pages like lessons)
//   active: 'home'|'search'|'build'|'friends'|'me'|null   back: href for the Back link on inner pages
//   scripts: ['/js/foo.js'] (ES modules)   bare: true = no nav/footer (play page)
//   i18n: extra key prefixes to embed for the browser. Every page gets 'js.app' plus 'js.<name>' for each /js/<name>.js.
import { html, raw, esc, jsonData } from './html.js';
import { avatar } from './components.js';
import { navBadges } from '../services/badges.js';
import { inAnySchool, isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import { availableLocales, localeInfo, tReq, clientStrings, DEFAULT_LOCALE } from '../i18n/index.js';

const NAV = [
  ['home', '/', '🏠'],
  ['search', '/search', '🔎'],
  ['build', '/build', '🛠️'],
  ['friends', '/friends', '👫'],
];
export const VERSION = Date.now().toString(36); // cache-buster per boot

/** URL of the current page with ?lang=<code> (the server stores the choice and redirects back without it). */
function langHref(req, code) {
  const u = new URL(req.originalUrl || '/', 'http://x');
  u.searchParams.set('lang', code);
  return u.pathname + '?' + u.searchParams;
}
/** The 🌐 language picker: a <details> menu of plain links, so it works with no JavaScript (app.js adds keys and outside-click). */
export function langPicker(req) {
  const t = tReq(req); const cur = req.locale || DEFAULT_LOCALE; const info = localeInfo(cur);
  const langs = availableLocales();
  if (langs.length < 2) return '';   // nothing to choose yet
  return html`<details class="langpick" data-langpick>
    <summary class="lang-btn" aria-label="${t('layout.lang.button', { language: info.name })}" title="${t('layout.lang.title')}"><span class="globe" aria-hidden="true">🌐</span><span class="lang-code" aria-hidden="true">${cur.split('-')[0].toUpperCase()}</span></summary>
    <div class="lang-menu">
      <p class="lang-head" id="lang-head">${t('layout.lang.title')}</p>
      <ul class="lang-list" aria-labelledby="lang-head">${langs.map(l => html`<li><a href="${langHref(req, l.code)}" hreflang="${l.code}" ${l.code === cur ? raw('aria-current="true"') : ''}><span class="lang-check" aria-hidden="true">${l.code === cur ? '✓' : ''}</span><span class="lang-name" lang="${l.code}" dir="${l.dir}">${l.name}</span></a></li>`)}</ul>
    </div>
  </details>`;
}

export function layout(req, { title = '', active = null, body = '', scripts = [], head = '', back = null, backLabel = null, bodyClass = '', description = null, bare = false, mid = false, i18n = [] } = {}) {
  const t = tReq(req);
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const u = req.user;
  const badges = u ? navBadges(u) : { friends: 0 };
  const badge = k => (badges[k] ? html`<span class="badge" aria-label="${t('layout.badgeNew', { count: badges[k] })}">${badges[k] > 9 ? '9+' : badges[k]}</span>` : '');
  const meHref = u ? '/me' : '/login';
  // People in a school get a Classes tab (teachers land on /teach, students on /classes); the platform admin, when not
  // staff of a school, gets Schools instead.
  const staff = u && isSchoolStaff(u);
  const navItems = u && staff ? [...NAV, ['classes', '/teach', '🏫']]
    : u && isPlatformAdmin(u) ? [...NAV, ['schools', '/admin/schools', '🏫']]
    : u && inAnySchool(u) ? [...NAV, ['classes', '/classes', '🏫']] : NAV;
  // Pages in the Classes area highlight Schools for the platform admin, whose nav has Schools instead of Classes.
  const act = active === 'classes' && !navItems.some(([k]) => k === 'classes') && navItems.some(([k]) => k === 'schools') ? 'schools' : active;
  const signIn = t('layout.signIn');
  const cur = k => (k === act ? raw('aria-current="page"') : '');
  const nav = bare ? '' : html`
  <a class="skip" href="#main">${t('layout.skip')}</a>
  <header class="topbar">
    <a class="logo" href="/" aria-label="${t('layout.logoLabel')}"><span class="logo-mark" aria-hidden="true">🏆</span><span class="logo-text" dir="ltr">Magic <span>Cups</span></span></a>
    <form class="topsearch" role="search" action="/search" method="get">
      <span class="ico" aria-hidden="true">🔎</span>
      <label class="sr-only" for="topq">${t('layout.search.label')}</label>
      <input id="topq" name="q" type="search" placeholder="${t('layout.search.placeholder')}" autocomplete="off" value="${active === 'search' ? (req.query.q || '') : ''}">
    </form>
    <nav class="topnav" aria-label="${t('layout.mainNav')}">
      ${navItems.map(([k, href, emo]) => html`<a class="navlink" href="${href}" ${cur(k)}><span class="emo" aria-hidden="true">${emo}</span>${t(`nav.${k}`)}${badge(k)}</a>`)}
    </nav>
    ${langPicker(req)}
    <a class="me-btn" href="${meHref}" ${cur('me')} aria-label="${u ? t('layout.meLabel', { name: u.display_name }) : signIn}">${u ? avatar(u, 38) : html`<span class="avatar" style="--s:38px;--c:#94a3b8" aria-hidden="true">🙂</span>`}<span class="name">${u ? u.display_name : signIn}</span></a>
  </header>
  <nav class="tabbar" aria-label="${t('layout.mainNav')}">
    ${navItems.map(([k, href, emo]) => html`<a class="tab" href="${href}" ${cur(k)}><span class="emo" aria-hidden="true">${emo}</span>${t(`nav.${k}`)}${badge(k)}</a>`)}
    <a class="tab" href="${meHref}" ${cur('me')}>${u && u.photo_at ? html`<span class="emo">${avatar(u, 28)}</span>` : html`<span class="emo" aria-hidden="true">${u ? u.avatar : '🙂'}</span>`}${u ? t('nav.me') : signIn}</a>
  </nav>`;
  const foot = bare ? '' : html`<footer class="foot"><span>${t('layout.footer.tagline')}</span><a href="/safety">${t('layout.footer.safety')}</a><a href="/parents">${t('layout.footer.parents')}</a><a href="/sdk">${t('layout.footer.builders')}</a><a href="/me#language" class="foot-lang"><span aria-hidden="true">🌐</span> ${info.name}</a></footer>`;
  const backHtml = back ? html`<a class="backlink" href="${back}"><span class="flip" aria-hidden="true">←</span> ${backLabel || t('layout.back')}</a>` : '';
  const prefixes = ['js.app', ...scripts.map(s => (s.match(/^\/js\/([\w-]+)\.js$/) || [])[1]).filter(Boolean).map(n => `js.${n}`), ...i18n];
  const strings = jsonData('i18n', { lang: locale, dir: info.dir, intl: info.intl, strings: clientStrings(locale, [...new Set(prefixes)]) });
  return `<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title ? t('layout.titleWith', { title }) : t('layout.titleHome'))}</title>
<meta name="description" content="${esc(description || t('layout.description'))}">
<meta name="theme-color" content="#2f6bff">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/nunito-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css?v=${VERSION}">
${head}
</head>
<body class="${esc(bodyClass)}" data-user="${u ? esc(u.id) : ''}" data-guest="${u && u.is_guest ? '1' : ''}">
${nav}
<main id="main"${bare ? '' : mid ? ' class="wrap mid"' : ' class="wrap"'}>${backHtml}${body}</main>
${foot}
<div class="toasts" role="status" aria-live="polite" id="toasts"></div>
${strings}
<script type="module" src="/js/app.js?v=${VERSION}"></script>
${scripts.map(s => `<script type="module" src="${esc(s)}?v=${VERSION}"></script>`).join('\n')}
</body>
</html>`;
}
export const page = (req, res, opts, status = 200) => res.status(status).type('html').send(layout(req, opts));
export function notFound(req, res, msg = null) {
  const t = tReq(req);
  return page(req, res, { title: t('errors.notFound.title'), body: html`<div class="empty"><div class="emo">🧭</div><h1>${t('errors.notFound.heading')}</h1><p>${msg || t('errors.notFound.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 404);
}
