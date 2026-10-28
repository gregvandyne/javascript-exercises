// Home rails, search (games + builders), live counts.
import { Router } from 'express';
import { html, raw } from '../views/html.js';
import { page } from '../views/layout.js';
import { rail, cardGrid, emptyState, avatar, coverArt, categoryLabel } from '../views/components.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { rateLimit } from '../services/ratelimit.js';
import { requireUser, isGrownup, OFFICIAL } from '../auth.js';
import * as seo from '../seo.js';
import { HUBS } from '../learn.js';

export const router = Router();

// "Build your own game" lives in its own banner, separate from the featured-game hero.
function buildBanner(req) {
  const t = req.t; const u = req.user;
  if (isGrownup(u)) return '';   // no Builder for grown-up accounts (routes/family.js)
  const mine = u && !u.is_guest;
  return html`<section class="buildbanner" aria-labelledby="bb-h">
    <div class="bb-art" aria-hidden="true">🛠️</div>
    <div class="bb-text"><h2 id="bb-h">${t('home.build.title')}</h2><p>${t('home.build.text')}</p></div>
    <a class="btn btn-hot" href="/build">${mine ? t('home.build.openStudio') : t('home.build.start')}</a>
  </section>`;
}

// My favorites: every game this player tapped ❤️ on.
router.get('/favorites', requireUser, (req, res) => {
  const t = req.t;
  const favs = games.favorites(req.user, req.user.id, 200);
  const body = html`<div class="pagehead"><h1>❤️ ${t('favorites.title')}</h1></div>
  ${favs.length ? cardGrid(favs, {}) : emptyState({ emoji: '🤍', title: t('favorites.emptyTitle'), text: t('favorites.emptyText'), action: { href: '/', label: t('favorites.emptyAction') } })}`;
  page(req, res, { title: t('favorites.title'), active: 'me', body, back: '/me', backLabel: t('nav.me') });
});

router.get('/', (req, res) => {
  const t = req.t;
  /** Links stay in the language address the page was opened at (/es -> /es/teachers). */
  const lp = p => (req.pathLocale ? seo.localeUrl(p, req.pathLocale) : p);
  const u = req.user;
  const featured = games.listVisible(u, { featured: true, order: 'plays', limit: 24 });   // every launch game fits; the rail scrolls
  const hero = featured[0];
  const mine = u && !u.is_guest ? games.myGames(u.id, 12) : [];
  const rails = [
    u ? rail({ title: t('home.rails.favorites'), emoji: '❤️', games: games.favorites(u, u.id, 16), user: u, id: 'favorites', more: '/favorites' }) : '',
    rail({ title: t('home.rails.featured'), emoji: '⭐', games: featured, user: u, id: 'featured' }),
    buildBanner(req),
    rail({ title: t('home.rails.playing'), emoji: '🟢', games: games.playingNow(u, 12), user: u, id: 'playing', more: '/search?sort=playing' }),
    rail({ title: t('home.rails.friends'), emoji: '👫', games: games.fromFriends(u, 12), user: u, id: 'friends' }),
    rail({ title: t('home.rails.popular'), emoji: '🔥', games: games.listVisible(u, { order: 'popular', limit: 16 }), user: u, id: 'popular', more: '/search?sort=popular' }),
    rail({ title: t('home.rails.rated'), emoji: '🏆', games: games.listVisible(u, { order: 'rated', limit: 16 }), user: u, id: 'rated', more: '/search?sort=rated' }),
    rail({ title: t('home.rails.new'), emoji: '✨', games: games.listVisible(u, { order: 'new', limit: 16 }), user: u, id: 'new', more: '/search?sort=new' }),
    mine.length ? rail({ title: t('home.rails.mine'), emoji: '🛠️', games: mine, user: u, id: 'mine', more: '/build' }) : '',
    ...games.CATEGORIES.map(([k, e]) => rail({ title: categoryLabel(k, t), emoji: e, games: games.listVisible(u, { category: k, limit: 12 }), user: u, id: `cat-${k}`, more: `/search?cat=${k}` })),
  ];
  // The page's heading says what the site is. Signed out (new visitors, teachers, search engines) it is shown with a
  // short introduction; signed in, players know where they are, so it is only there for screen readers.
  // Text still in English on this language's page is marked so (screen readers, right-to-left pages).
  const fb = key => (t.own(key) ? '' : raw(' lang="en" dir="ltr"'));
  const intro = u ? html`<h1 class="sr-only"${fb('home.intro.heading')}>${t('home.intro.heading')}</h1>`
    : html`<section class="home-intro" aria-labelledby="home-h1"><h1 id="home-h1"${fb('home.intro.heading')}>${t('home.intro.heading')}</h1><p${fb('home.intro.text')}>${t('home.intro.text')}</p>
      <a class="btn" href="${lp('/teachers')}"><span aria-hidden="true">🍎</span> <span${fb('home.intro.teachers')}>${t('home.intro.teachers')}</span></a>
      <ul class="chips home-subjects" aria-label="${t('teachers.subjects.h')}">${HUBS.map(h => html`<li><a class="chip" href="${lp(`/learn/${h.slug}`)}"><span aria-hidden="true">${h.emoji}</span><span${fb(`learn.hubs.${h.key}.name`)}>${t(`learn.hubs.${h.key}.name`)}</span></a></li>`)}</ul></section>`;
  const body = html`${intro}
  ${hero ? html`<section class="hero cover-${hero.cover}" aria-label="${t('home.hero.label')}">
    <div>
      <span class="hero-kicker"><span class="emo" aria-hidden="true">⭐</span> ${t('home.hero.kicker')}</span>
      <h2 class="hero-title">${hero.title}</h2>
      <p>${hero.description.split('. ')[0] + '.'}</p>
      <div class="row">
        <a class="btn btn-big" href="/play/${hero.slug}">▶ ${t('home.hero.play')}</a>
        <a class="btn btn-ghost" href="/g/${hero.slug}">${t('home.hero.more')}</a>
      </div>
    </div>
    <a class="heroart" href="/g/${hero.slug}" aria-label="${t('home.hero.about', { title: hero.title })}">${coverArt(hero, '', { eager: true })}</a>
  </section>` : ''}
  <div class="chips scroll" role="list" aria-label="${t('home.categories')}" style="margin-bottom:18px">
    ${games.CATEGORIES.map(([k, e]) => html`<a class="chip" role="listitem" href="/search?cat=${k}" rel="nofollow"><span aria-hidden="true">${e}</span>${categoryLabel(k, t)}</a>`)}
  </div>
  ${rails.some(r => r) ? rails : emptyState({ emoji: '🎮', title: t('home.empty.title'), text: t('home.empty.text'), action: isGrownup(u) ? null : { href: '/build', label: t('home.empty.action') } })}`;
  page(req, res, { title: '', active: 'home', body, description: t.own('seo.home.description') ? t('seo.home.description') : t('layout.description'), seo: {
    index: true, path: '/', langs: seo.langsWithKey('home.intro.heading'), image: '/og/site.jpg', imageAlt: t('seo.home.imageAlt'),
    jsonld: [seo.graph([seo.organizationLd(req), seo.websiteLd(req, req.locale)])],
  } });
});

function searchResults(req) {
  const t = req.t;
  const u = req.user;
  const text = String(req.query.q || '').slice(0, 60);
  const cat = games.CATEGORY_KEYS.includes(req.query.cat) ? req.query.cat : null;
  const sort = ['relevance', 'popular', 'rated', 'new', 'playing'].includes(req.query.sort) ? req.query.sort : (text ? 'relevance' : 'popular');
  const list = games.search(u, { text, category: cat, order: sort, limit: 60 });
  // Children's names never reach a signed-out page (search engines included): signed out, only the official account.
  const builders = text ? games.searchBuilders(u, text).filter(b => u || b.username === OFFICIAL) : [];
  const markup = html`
    ${builders.length ? html`<section aria-labelledby="bh" style="margin-bottom:20px"><h2 id="bh" class="small muted" style="text-transform:uppercase;letter-spacing:.05em">${t('search.builders')}</h2>
      <div class="cardgrid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${builders.map(b => { const inner = html`${avatar(b, 48)}<span style="flex:1;min-width:0"><span class="nm">${b.display_name}</span><br><span class="sub"><bdi>@${b.username}</bdi> · ${t('search.gameCount', { count: b.games })}</span></span>`; return isGrownup(u) ? html`<div class="person panel" style="padding:12px">${inner}</div>` : html`<a class="person panel" style="padding:12px" href="/u/${b.username}">${inner}</a>`; })}</div></section>` : ''}
    ${list.length ? html`<h2 class="sr-only">${t('search.games')}</h2>${cardGrid(list, { user: u, category: cat })}` :
      html`${emptyState({ emoji: '🔭', title: text ? t('search.noMatch', { text }) : t('search.noneYet'), text: t('search.tryCategory') })}
      <div class="chips" style="justify-content:center">${games.CATEGORIES.map(([k, e]) => html`<a class="chip" href="/search?cat=${k}">${e} ${categoryLabel(k, t)}</a>`)}</div>`}`;
  return { text, cat, sort, list, builders, markup };
}
router.get('/search', (req, res) => {
  const t = req.t;
  const r = searchResults(req);
  const sortBtns = ['relevance', 'popular', 'rated', 'new', 'playing'].filter(k => k !== 'relevance' || r.text);
  const body = html`
  <h1>${t('search.title')}</h1>
  <form id="searchform" role="search" action="/search" method="get" style="margin-bottom:14px">
    <label class="sr-only" for="q">${t('search.label')}</label>
    <input class="input searchbig" id="q" name="q" type="search" value="${r.text}" placeholder="${t('search.placeholder')}" autocomplete="off">
    <input type="hidden" name="cat" value="${r.cat || ''}"><input type="hidden" name="sort" value="${r.sort}">
  </form>
  <div class="chips scroll" role="group" aria-label="${t('search.category')}" style="margin-bottom:10px">
    <button class="chip" type="button" data-cat="" aria-pressed="${!r.cat}">${t('search.all')}</button>
    ${games.CATEGORIES.map(([k, e]) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${r.cat === k}"><span aria-hidden="true">${e}</span>${categoryLabel(k, t)}</button>`)}
  </div>
  <div class="row" style="margin-bottom:18px"><span class="small muted" style="font-weight:700">${t('search.sortLabel')}</span>
    <div class="seg" role="group" aria-label="${t('search.sort')}">${sortBtns.map(k => html`<button type="button" data-sort="${k}" aria-pressed="${r.sort === k}">${t(`search.sorts.${k}`)}</button>`)}</div></div>
  <div id="results" aria-live="polite">${r.markup}</div>`;
  page(req, res, { title: r.text ? t('search.titleQuery', { text: r.text }) : t('search.title'), active: 'search', body, scripts: ['/js/search.js'] });
});
router.get('/api/search', rateLimit('search', 120, 60e3), (req, res) => {
  const r = searchResults(req);
  res.json({ html: String(r.markup), count: r.list.length, builders: r.builders.length });
});
router.get('/api/live', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 100);
  res.set('Cache-Control', 'no-store').json({ counts: presence.counts(ids), online: presence.totalOnline() });
});
