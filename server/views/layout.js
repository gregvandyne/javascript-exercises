// Page layout. Contract for every route:
//   res.send(layout(req, { title, active, body, scripts, head, back, bodyClass, description, bare, mid, i18n }))
//   mid: true = a medium-width page (reading pages like lessons)
//   active: 'home'|'search'|'build'|'friends'|'me'|'plans'|'family'|null   back: href for the Back link on inner pages
//   scripts: ['/js/foo.js'] (ES modules)   bare: true = no nav/footer (play page)
//   i18n: extra key prefixes to embed for the browser. Every page gets 'js.app' plus 'js.<name>' for each /js/<name>.js.
//   seo: { index: true, path, langs, image, imageAlt, type, jsonld } to let search engines index the page (server/seo.js).
//        Without it a page is noindex: new pages stay out of search results until they opt in.
import { html, raw, esc, jsonData } from './html.js';
import { avatar, BRAND, wordmark, appMark } from './components.js';
import { accountKind, STAFF_PASSWORD_MIN, isGrownup, longPasswordKind } from '../auth.js';
import { config } from '../config.js';
import { ICONS_V } from './brand.js';
import { navBadges } from '../services/badges.js';
import { inAnySchool, isSchoolStaff, isPlatformAdmin } from '../services/schools.js';
import { availableLocales, localeInfo, tReq, tHtml, clientStrings, DEFAULT_LOCALE, localPath } from '../i18n/index.js';
import { THEMES, THEME_ICONS, BAR_COLORS } from '../theme.js';
import { notices, markNotified } from '../builder/turns.js';
import { familiesOn } from '../services/family.js';
import { seoHead, localeUrl, clip } from '../seo.js';

const NAV = [
  ['home', '/', '🏠'],
  ['search', '/search', '🔎'],
  ['build', '/build', '🛠️'],
  ['friends', '/friends', '👫'],
];
export const VERSION = Date.now().toString(36); // cache-buster per boot

/** Grown-up accounts, school staff and the platform admin: the readers of /terms, /refunds and the billing parts of
 *  /privacy. Kids, students, guests and the signed-out see neither a Terms link nor plan names (docs/decisions.md
 *  "Paid plans" §4.1, §9): their footer's Privacy link opens /privacy without the billing sections. */
/** The key for a "Parents" label: until a language has its own (nav.parents, home.intro.parents), the footer's
 *  already-translated "For parents" stands in, so a translated page never shows that link in English. */
export const parentsKey = (t, key = 'nav.parents') => (t.own(key) || !t.own('layout.footer.parents') ? key : 'layout.footer.parents');
export const parentsLabel = (t, key) => t(parentsKey(t, key));
/** Signed out, for menus, the home intro and the footer: no account, or a guest (one tap on Play makes a guest). */
export const signedOut = u => !u || !!u.is_guest;
/** A tab's label key. Until a language has "Grown-ups", its "Parents" stands in (the tab opens the parent page). */
const tabKey = (t, k) => (k === 'grownups' && !t.own('nav.grownups') && t.own('nav.parents') ? 'nav.parents' : `nav.${k}`);
/** Pages the signed-out "Grown-ups" tab stands for (it is current on them). */
const GROWNUP_PAGES = ['parents', 'teachers', 'grownups'];
export const legalReader = u => !!u && !u.is_guest && (isGrownup(u) || isPlatformAdmin(u) || isSchoolStaff(u));

/** URL of the current page with ?lang=<code> or ?theme=<theme> (the server stores the choice and redirects back without it). */
function choiceHref(req, name, value) {
  const u = new URL(req.originalUrl || '/', 'http://x');
  u.searchParams.set(name, value);
  return localPath(u) + '?' + u.searchParams;
}
/** On a page at a language address (/es/teachers), the other language's address keeps the choice: /fr/teachers?lang=fr. */
function langHref(req, code) {
  if (!req.pathLocale) return choiceHref(req, 'lang', code);
  const u = new URL(req.url || '/', 'http://x');
  u.searchParams.set('lang', code);
  return localeUrl(localPath(u), code) + '?' + u.searchParams;
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
      <ul class="lang-list" aria-labelledby="lang-head">${langs.map(l => html`<li><a href="${langHref(req, l.code)}" hreflang="${l.code}" rel="nofollow" ${l.code === cur ? raw('aria-current="true"') : ''}><span class="lang-check" aria-hidden="true">${l.code === cur ? '✓' : ''}</span><span class="lang-name" lang="${l.code}" dir="${l.dir}">${l.name}</span></a></li>`)}</ul>
    </div>
  </details>`;
}

/** The theme menu (☀️ Light, 🌙 Dark, 🌓 Same as my device), built like the language picker: plain links that work with no
 *  JavaScript. app.js switches at once instead, using data-theme-choice and data-label. */
export function themePicker(req) {
  const t = tReq(req); const cur = THEMES.includes(req.theme) ? req.theme : 'system';
  const label = th => t('layout.theme.button', { theme: t(`layout.theme.${th}`) });
  return html`<details class="themepick" data-themepick>
    <summary class="theme-btn" aria-label="${label(cur)}" title="${t('layout.theme.title')}"><span class="theme-ico" aria-hidden="true">${THEME_ICONS[cur]}</span></summary>
    <div class="theme-menu">
      <p class="lang-head" id="theme-head">${t('layout.theme.title')}</p>
      <ul class="theme-list" aria-labelledby="theme-head">${THEMES.map(th => html`<li><a href="${choiceHref(req, 'theme', th)}" rel="nofollow" data-theme-choice="${th}" data-label="${label(th)}" ${th === cur ? raw('aria-current="true"') : ''}><span class="lang-check" aria-hidden="true">${th === cur ? '✓' : ''}</span><span class="theme-ico" aria-hidden="true">${THEME_ICONS[th]}</span><span>${t(`layout.theme.${th}`)}</span></a></li>`)}</ul>
    </div>
  </details>`;
}

export function layout(req, { title = '', active = null, body = '', scripts = [], head = '', back = null, backLabel = null, bodyClass = '', description = null, bare = false, mid = false, i18n = [], seo = null } = {}) {
  const t = tReq(req);
  const locale = req.locale || DEFAULT_LOCALE; const info = localeInfo(locale);
  const u = req.user;
  const badges = u ? navBadges(u) : { friends: 0 };
  const badge = k => (badges[k] ? html`<span class="badge" aria-label="${t('layout.badgeNew', { count: badges[k] })}">${badges[k] > 9 ? '9+' : badges[k]}</span>` : '');
  // Grown-up accounts (routes/family.js) get Home, Search and their family page, and no Me tab.
  const grownup = isGrownup(u);
  const meHref = grownup ? '/family' : u ? '/me' : '/login';
  // People in a school get a Classes tab (teachers land on /teach, students on /classes); the platform admin, when not
  // staff of a school, gets Schools instead.
  const staff = u && isSchoolStaff(u);
  // Plans (/plans, routes/plans.js) is in everyone's menu while paid-plan pages are on (docs/decisions.md "Paid plans" §17).
  const plans = familiesOn(req) ? [['plans', '/plans', '⭐']] : [];
  // Signed out means signed out or a guest: a parent who plays one game becomes a guest (routes/games.js) and must keep
  // every grown-up door. Friends needs an account, so it waits until a kid has one.
  const out = signedOut(u);
  const navItems = grownup ? [NAV[0], NAV[1], ...plans, ['family', '/family', '👪']]
    : out ? [NAV[0], NAV[1], NAV[2], ...plans]
    : staff ? [...NAV, ['classes', '/teach', '🏫'], ...plans]
    : isPlatformAdmin(u) ? [...NAV, ['schools', '/admin/schools', '🏫'], ...plans]
    : inAnySchool(u) ? [...NAV, ['classes', '/classes', '🏫'], ...plans] : [...NAV, ...plans];
  // Signed out: the parent and teacher pages in the top menu; on phones one "Grown-ups" tab (to /parents, which links
  // the teacher page at its top) sits before Plans.
  // On wide screens the search field stands for Search, so the signed-out top menu is Home · Build · (Plans) · Parents ·
  // Teachers, then Sign in and a "▶ Play now" button (docs/decisions.md "Home doors").
  const teachersNav = out ? [['parents', '/parents', '👪'], ['teachers', '/teachers', '🍎']] : [];
  const topItems = out ? [NAV[0], NAV[2], ...plans, ...teachersNav] : navItems;
  const playKey = t.own('nav.playNow') ? 'nav.playNow' : 'home.hero.play';
  const playNow = out ? html`<a class="btn btn-hot playnow" href="/go/play" rel="nofollow"${t.own(playKey) ? '' : raw(' lang="en"')}><span aria-hidden="true">▶</span> <span class="playnow-t">${t(playKey)}</span></a>` : '';
  const tabItems = out ? [NAV[0], NAV[1], NAV[2], ['grownups', '/parents', '👪'], ...plans] : navItems;
  // Pages in the Classes area highlight Schools for the platform admin, whose nav has Schools instead of Classes.
  const act = active === 'classes' && !navItems.some(([k]) => k === 'classes') && navItems.some(([k]) => k === 'schools') ? 'schools' : active;
  const signIn = t('layout.signIn');
  // The signed-out "Sign in" tab is current on the sign-in and sign-up pages, never on a guest's own Me page.
  const cur = k => (k === act || (k === 'grownups' && GROWNUP_PAGES.includes(act)) ? raw('aria-current="page"') : '');
  const nav = bare ? '' : html`
  <a class="skip" href="#main">${t('layout.skip')}</a>
  <header class="topbar">
    <a class="logo" href="/" aria-label="${BRAND}">${appMark()}<span class="logo-lockup" dir="ltr" aria-hidden="true">${wordmark()}<span class="logo-sub">Academy</span></span></a>
    <form class="topsearch" role="search" action="/search" method="get">
      <span class="ico" aria-hidden="true">🔎</span>
      <label class="sr-only" for="topq">${t('layout.search.label')}</label>
      <input id="topq" name="q" type="search" placeholder="${t('layout.search.placeholder')}" data-short="${t('nav.search')}" autocomplete="off" value="${active === 'search' ? (req.query.q || '') : ''}">
    </form>
    <a class="topsearch-btn" href="/search" aria-label="${t('layout.search.label')}"><span aria-hidden="true">🔎</span></a>
    <nav class="topnav" aria-label="${t('layout.mainNav')}">
      ${topItems.map(([k, href, emo]) => { const key = k === 'parents' ? parentsKey(t) : `nav.${k}`; return html`<a class="navlink" href="${href}" ${cur(k)}${t.own(key) ? '' : raw(' lang="en"')}><span class="emo" aria-hidden="true">${emo}</span>${t(key)}${badge(k)}</a>`; })}
    </nav>
    ${langPicker(req)}
    ${themePicker(req)}
    <a class="me-btn" href="${meHref}" ${cur(grownup ? 'family' : 'me')} aria-label="${u ? t('layout.meLabel', { name: u.display_name }) : signIn}">${u ? avatar(u, 38) : html`<span class="avatar" style="--s:38px;--c:var(--hover)" aria-hidden="true">🙂</span>`}<span class="name">${u ? u.display_name : signIn}</span>${badge('me')}</a>
    ${playNow}
  </header>
  <nav class="tabbar" aria-label="${t('layout.mainNav')}">
    ${tabItems.map(([k, href, emo]) => { const key = tabKey(t, k); return html`<a class="tab" href="${href}" ${cur(k)}${t.own(key) ? '' : raw(' lang="en"')}><span class="emo" aria-hidden="true">${emo}</span><span class="tab-t">${t(key)}</span>${badge(k)}</a>`; })}
    ${grownup ? '' : out ? html`<a class="tab" href="/login" ${req.path === '/me' ? '' : cur('me')}><span class="emo" aria-hidden="true">🙂</span><span class="tab-t">${signIn}</span></a>`
      : html`<a class="tab" href="${meHref}" ${cur('me')}>${u.photo_at ? html`<span class="emo">${avatar(u, 28)}</span>` : html`<span class="emo" aria-hidden="true">${u.avatar}</span>`}<span class="tab-t">${t('nav.me')}</span>${badge('me')}</a>`}
  </nav>`;
  // A footer word still in English on this language's page reads left to right.
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const foot = bare ? '' : html`<footer class="foot"><span>${t('layout.footer.tagline')}</span><a href="/safety">${t('layout.footer.safety')}</a><a href="/parents"${fb('layout.footer.parents')}>${t('layout.footer.parents')}</a>${out || staff ? html`<a href="/teachers"${fb('layout.footer.teachers')}>${t('layout.footer.teachers')}</a>` : ''}${config.contactEmail ? html`<a href="/parents#contact">${t('layout.footer.contact')}</a>` : ''}${grownup ? '' : html`<a href="/sdk/">${t('layout.footer.builders')}</a>`}${legalReader(u) ? html`<a href="/terms"${fb('layout.footer.terms')}>${t('layout.footer.terms')}</a>` : ''}<a href="/privacy"${fb('layout.footer.privacy')}>${t('layout.footer.privacy')}</a><a href="${grownup ? '/family#language' : '/me#language'}" class="foot-lang"><span aria-hidden="true">🌐</span> ${info.name}</a></footer>`;
  const backHtml = back ? html`<a class="backlink" href="${back}"><span class="flip" aria-hidden="true">←</span> ${backLabel || t('layout.back')}</a>` : '';
  // A sign-in that just ended (timed out, or ended on another device) is mentioned once, on whatever page comes next; the
  // sign-in page says it itself.
  const ended = !bare && req.sessionEnded && req.path !== '/login' ? html`<p class="notice warn pagenote" role="status">${tHtml(t, 'layout.signedOut', { href: `/login?next=${encodeURIComponent(req.originalUrl)}` })}</p>` : '';
  // A build that ended while the builder was away (the page was closed, or they signed out) is mentioned once, on the next
  // page they open. Only for builds they sent themselves; opening that game's Studio first counts as seeing it.
  const news = !bare && u && !u.is_guest ? buildNews(t, u) : '';
  // Staff (and the platform admin) who signed in with a short password are asked for a longer one on every page.
  const shortPw = !bare && u && u.password_short && longPasswordKind(u) ? html`<p class="notice warn pagenote">${tHtml(t, accountKind(u) === 'grownup' ? 'layout.shortPasswordGrownup' : 'layout.shortPassword', { min: STAFF_PASSWORD_MIN, href: grownup ? '/family#password' : '/me#password' })}</p>` : '';
  const prefixes = ['js.app', ...scripts.map(s => (s.match(/^\/js\/([\w-]+)\.js$/) || [])[1]).filter(Boolean).map(n => `js.${n}`), ...i18n];
  // An explicit Light or Dark choice is on <html> before any CSS loads, so the first paint is right (no flash, no JS).
  const theme = req.theme === 'light' || req.theme === 'dark' ? req.theme : null;
  // The browser's toolbar takes the top bar's colour: one value for a chosen theme, one per device scheme otherwise. The
  // play page's bar is Ink in both themes.
  const themeColor = bare || theme ? `<meta name="theme-color" content="${BAR_COLORS[bare ? 'dark' : theme]}">`
    : `<meta name="theme-color" content="${BAR_COLORS.light}" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="${BAR_COLORS.dark}" media="(prefers-color-scheme: dark)">`;
  const fullTitle = title ? t('layout.titleWith', { title }) : t('layout.titleHome');
  const desc = clip(description || t('layout.description'), 160);
  const strings = jsonData('i18n', { lang: locale, dir: info.dir, intl: info.intl, strings: clientStrings(locale, [...new Set(prefixes)]) });
  return `<!doctype html>
<html lang="${esc(locale)}" dir="${esc(info.dir)}"${theme ? ` data-theme="${theme}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="${theme || 'light dark'}">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${seoHead(req, seo, { title: fullTitle, description: desc })}
${themeColor}
<link rel="icon" href="/favicon.ico?v=${ICONS_V}" sizes="32x32">
<link rel="icon" href="/icons/icon.svg?v=${ICONS_V}" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${ICONS_V}">
<link rel="manifest" href="/manifest.webmanifest?v=${ICONS_V}">
<link rel="preload" href="/fonts/bricolage-grotesque-latin-opsz-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css?v=${VERSION}">
${head}
</head>
<body class="${esc(bodyClass)}" data-user="${u ? esc(u.id) : ''}" data-guest="${u && u.is_guest ? '1' : ''}">
${nav}
<main id="main"${bare ? '' : mid ? ' class="wrap mid"' : ' class="wrap"'}>${ended}${news}${shortPw}${backHtml}${body}</main>
${foot}
<div class="toasts" role="status" aria-live="polite" id="toasts"></div>
${strings}
<script type="module" src="/js/app.js?v=${VERSION}"></script>
${scripts.map(s => `<script type="module" src="${esc(s)}?v=${VERSION}"></script>`).join('\n')}
</body>
</html>`;
}
/** The one-time "✨ Your game “X” is ready!" note (builder/turns.js notices), marked as told once drawn. */
function buildNews(t, u) {
  let list = [];
  try { list = notices(u.id); } catch { return ''; }   // never break a page over a note
  if (!list.length) return '';
  markNotified(list.map(n => n.id));
  const one = list.length === 1 ? list[0] : null;
  const msg = one ? tHtml(t, `layout.build.${one.kind}`, { title: `\u2068${one.title}\u2069`, href: `/studio/${one.gameId}` }) : tHtml(t, 'layout.build.many', { href: '/build' });
  return html`<p class="notice ${one && one.kind === 'stopped' ? 'warn' : 'good'} pagenote" role="status">${msg}</p>`;
}
export const page = (req, res, opts, status = 200) => res.status(status).type('html').send(layout(req, opts));
export function notFound(req, res, msg = null) {
  const t = tReq(req);
  return page(req, res, { title: t('errors.notFound.title'), body: html`<div class="empty"><div class="emo">🧭</div><h1>${t('errors.notFound.heading')}</h1><p>${msg || t('errors.notFound.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 404);
}
