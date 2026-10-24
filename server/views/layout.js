// Page layout. Contract for every route:
//   res.send(layout(req, { title, active, body, scripts, head, back, bodyClass, description, bare }))
//   active: 'home'|'search'|'build'|'friends'|'me'|null   back: href for the Back link on inner pages
//   scripts: ['/js/foo.js'] (ES modules)   bare: true = no nav/footer (play page)
import { html, raw, esc } from './html.js';
import { avatar } from './components.js';
import { navBadges } from '../services/badges.js';

const NAV = [
  ['home', '/', '🏠', 'Home'],
  ['search', '/search', '🔎', 'Search'],
  ['build', '/build', '🛠️', 'Build'],
  ['friends', '/friends', '👫', 'Friends'],
];
const VERSION = Date.now().toString(36); // cache-buster per boot

export function layout(req, { title = '', active = null, body = '', scripts = [], head = '', back = null, backLabel = 'Back', bodyClass = '', description = 'Play free games and build your own with Magic Cup.', bare = false } = {}) {
  const u = req.user;
  const badges = u ? navBadges(u) : { friends: 0 };
  const cur = k => (k === active ? raw('aria-current="page"') : '');
  const badge = k => (badges[k] ? html`<span class="badge" aria-label="${badges[k]} new">${badges[k] > 9 ? '9+' : badges[k]}</span>` : '');
  const meHref = u ? '/me' : '/login';
  const nav = bare ? '' : html`
  <a class="skip" href="#main">Skip to the games</a>
  <header class="topbar">
    <a class="logo" href="/" aria-label="Magic Cup home"><span class="logo-mark" aria-hidden="true">🏆</span><span class="logo-text">Magic <span>Cup</span></span></a>
    <form class="topsearch" role="search" action="/search" method="get">
      <span class="ico" aria-hidden="true">🔎</span>
      <label class="sr-only" for="topq">Search games and builders</label>
      <input id="topq" name="q" type="search" placeholder="Search games or builders" autocomplete="off" value="${active === 'search' ? (req.query.q || '') : ''}">
    </form>
    <nav class="topnav" aria-label="Main">
      ${NAV.map(([k, href, emo, label]) => html`<a class="navlink" href="${href}" ${cur(k)}><span class="emo" aria-hidden="true">${emo}</span>${label}${badge(k)}</a>`)}
    </nav>
    <a class="me-btn" href="${meHref}" ${cur('me')} aria-label="${u ? 'Me: ' + u.display_name : 'Sign in'}">${u ? avatar(u, 38) : html`<span class="avatar" style="--s:38px;--c:#94a3b8" aria-hidden="true">🙂</span>`}<span class="name">${u ? u.display_name : 'Sign in'}</span></a>
  </header>
  <nav class="tabbar" aria-label="Main">
    ${NAV.map(([k, href, emo, label]) => html`<a class="tab" href="${href}" ${cur(k)}><span class="emo" aria-hidden="true">${emo}</span>${label}${badge(k)}</a>`)}
    <a class="tab" href="${meHref}" ${cur('me')}><span class="emo" aria-hidden="true">${u ? u.avatar : '🙂'}</span>${u ? 'Me' : 'Sign in'}</a>
  </nav>`;
  const foot = bare ? '' : html`<footer class="foot"><span>© Magic Cup · Free to play, free to build</span><a href="/safety">Safety</a><a href="/parents">For grown-ups</a><a href="/sdk">For builders</a></footer>`;
  const backHtml = back ? html`<a class="backlink" href="${back}"><span aria-hidden="true">←</span> ${backLabel}</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title ? `${title} · Magic Cup` : 'Magic Cup · Play and build games')}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#2f6bff">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/nunito-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/app.css?v=${VERSION}">
${head}
</head>
<body class="${esc(bodyClass)}" data-user="${u ? esc(u.id) : ''}" data-guest="${u && u.is_guest ? '1' : ''}">
${nav}
<main id="main"${bare ? '' : ' class="wrap"'}>${backHtml}${body}</main>
${foot}
<div class="toasts" role="status" aria-live="polite" id="toasts"></div>
<script type="module" src="/js/app.js?v=${VERSION}"></script>
${scripts.map(s => `<script type="module" src="${esc(s)}?v=${VERSION}"></script>`).join('\n')}
</body>
</html>`;
}
export const page = (req, res, opts, status = 200) => res.status(status).type('html').send(layout(req, opts));
export function notFound(req, res, msg = "We couldn't find that page.") {
  return page(req, res, { title: 'Not found', body: html`<div class="empty"><div class="emo">🧭</div><h1>Oops! Lost the map.</h1><p>${msg}</p><a class="btn btn-primary" href="/">Go home</a></div>` }, 404);
}
