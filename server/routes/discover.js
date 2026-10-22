// Home rails, search (games + builders), live counts.
import { Router } from 'express';
import { html, raw, jsonData } from '../views/html.js';
import { page } from '../views/layout.js';
import { rail, cardGrid, emptyState, avatar, coverArt } from '../views/components.js';
import * as games from '../services/games.js';
import * as presence from '../services/presence.js';
import { rateLimit } from '../services/ratelimit.js';

export const router = Router();

// "Build your own game" lives in its own banner, separate from the featured-game hero.
function buildBanner(u) {
  const mine = u && !u.is_guest;
  return html`<section class="buildbanner" aria-labelledby="bb-h">
    <div class="bb-art" aria-hidden="true">🛠️</div>
    <div class="bb-text"><h2 id="bb-h">Make your own game</h2><p>Tell our Builder your idea. Add a drawing or photo for ideas. It makes the game for you!</p></div>
    <a class="btn btn-coral" href="/build">${mine ? 'Open my Studio' : 'Start building'}</a>
  </section>`;
}

router.get('/', (req, res) => {
  const u = req.user;
  const featured = games.listVisible(u, { featured: true, order: 'plays', limit: 12 });
  const hero = featured[0];
  const mine = u && !u.is_guest ? games.myGames(u.id, 12) : [];
  const rails = [
    rail({ title: 'Featured', emoji: '⭐', games: featured, user: u, id: 'featured' }),
    buildBanner(u),
    rail({ title: 'Playing now', emoji: '🟢', games: games.playingNow(u, 12), user: u, id: 'playing', more: '/search?sort=playing' }),
    rail({ title: 'From your friends', emoji: '👫', games: games.fromFriends(u, 12), user: u, id: 'friends' }),
    rail({ title: 'Popular', emoji: '🔥', games: games.listVisible(u, { order: 'popular', limit: 16 }), user: u, id: 'popular', more: '/search?sort=popular' }),
    rail({ title: 'Top rated', emoji: '🏆', games: games.listVisible(u, { order: 'rated', limit: 16 }), user: u, id: 'rated', more: '/search?sort=rated' }),
    rail({ title: 'New', emoji: '✨', games: games.listVisible(u, { order: 'new', limit: 16 }), user: u, id: 'new', more: '/search?sort=new' }),
    mine.length ? rail({ title: 'My games', emoji: '🛠️', games: mine, user: u, ads: false, id: 'mine', more: '/build' }) : '',
    ...games.CATEGORIES.map(([k, e, label]) => rail({ title: label, emoji: e, games: games.listVisible(u, { category: k, limit: 12 }), user: u, id: `cat-${k}`, more: `/search?cat=${k}` })),
  ];
  const body = html`
  ${hero ? html`<section class="hero cover-${hero.cover}" aria-label="Featured game">
    <div>
      <span class="hero-kicker">⭐ Featured game</span>
      <h1>${hero.title}</h1>
      <p>${hero.description.split('. ')[0] + '.'}</p>
      <div class="row">
        <a class="btn btn-big" href="/play/${hero.slug}">▶ Play</a>
        <a class="btn btn-ghost" href="/g/${hero.slug}">More info</a>
      </div>
    </div>
    <a class="heroart" href="/g/${hero.slug}" aria-label="About ${hero.title}">${coverArt(hero, '')}</a>
  </section>` : ''}
  <div class="chips scroll" role="list" aria-label="Categories" style="margin-bottom:18px">
    ${games.CATEGORIES.map(([k, e, l]) => html`<a class="chip" role="listitem" href="/search?cat=${k}"><span aria-hidden="true">${e}</span>${l}</a>`)}
  </div>
  ${rails.some(r => r) ? rails : emptyState({ emoji: '🎮', title: 'No games yet', text: 'Be the first to build one!', action: { href: '/build', label: 'Build a game' } })}`;
  page(req, res, { title: '', active: 'home', body, scripts: ['/js/ads.js'] });
});

function searchResults(req) {
  const u = req.user;
  const text = String(req.query.q || '').slice(0, 60);
  const cat = games.CATEGORY_KEYS.includes(req.query.cat) ? req.query.cat : null;
  const sort = ['relevance', 'popular', 'rated', 'new', 'playing'].includes(req.query.sort) ? req.query.sort : (text ? 'relevance' : 'popular');
  const list = games.search(u, { text, category: cat, order: sort, limit: 60 });
  const builders = text ? games.searchBuilders(u, text) : [];
  const markup = html`
    ${builders.length ? html`<section aria-labelledby="bh" style="margin-bottom:20px"><h2 id="bh" class="small muted" style="text-transform:uppercase;letter-spacing:.05em">Builders</h2>
      <div class="cardgrid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${builders.map(b => html`<a class="person panel" style="padding:12px" href="/u/${b.username}">${avatar(b, 48)}<span style="flex:1;min-width:0"><span class="nm">${b.display_name}</span><br><span class="sub">@${b.username} · ${b.games} game${b.games === 1 ? '' : 's'}</span></span></a>`)}</div></section>` : ''}
    ${list.length ? html`<h2 class="sr-only">Games</h2>${cardGrid(list, { user: u, category: cat })}` :
      html`${emptyState({ emoji: '🔭', title: text ? `No games match “${text}”` : 'No games here yet', text: 'Try a category instead:' })}
      <div class="chips" style="justify-content:center">${games.CATEGORIES.map(([k, e, l]) => html`<a class="chip" href="/search?cat=${k}">${e} ${l}</a>`)}</div>`}`;
  return { text, cat, sort, list, builders, markup };
}
router.get('/search', (req, res) => {
  const r = searchResults(req);
  const sortBtns = [['relevance', 'Best match'], ['popular', 'Popular'], ['rated', 'Top rated'], ['new', 'New'], ['playing', 'Playing now']].filter(([k]) => k !== 'relevance' || r.text);
  const body = html`
  <h1>Search</h1>
  <form id="searchform" role="search" action="/search" method="get" style="margin-bottom:14px">
    <label class="sr-only" for="q">Search games or builders</label>
    <input class="input" id="q" name="q" type="search" value="${r.text}" placeholder="Try “shark”, “soccer” or a builder’s name" autocomplete="off" style="font-size:1.15rem;min-height:56px;border-radius:999px;padding-left:20px">
    <input type="hidden" name="cat" value="${r.cat || ''}"><input type="hidden" name="sort" value="${r.sort}">
  </form>
  <div class="chips scroll" role="group" aria-label="Category" style="margin-bottom:10px">
    <button class="chip" type="button" data-cat="" aria-pressed="${!r.cat}">All</button>
    ${games.CATEGORIES.map(([k, e, l]) => html`<button class="chip" type="button" data-cat="${k}" aria-pressed="${r.cat === k}"><span aria-hidden="true">${e}</span>${l}</button>`)}
  </div>
  <div class="row" style="margin-bottom:18px"><span class="small muted" style="font-weight:800">Sort:</span>
    <div class="seg" role="group" aria-label="Sort">${sortBtns.map(([k, l]) => html`<button type="button" data-sort="${k}" aria-pressed="${r.sort === k}">${l}</button>`)}</div></div>
  <div id="results" aria-live="polite">${r.markup}</div>`;
  page(req, res, { title: r.text ? `“${r.text}”` : 'Search', active: 'search', body, scripts: ['/js/search.js', '/js/ads.js'] });
});
router.get('/api/search', rateLimit('search', 120, 60e3), (req, res) => {
  const r = searchResults(req);
  res.json({ html: String(r.markup), count: r.list.length, builders: r.builders.length });
});
router.get('/api/live', (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 100);
  res.set('Cache-Control', 'no-store').json({ counts: presence.counts(ids), online: presence.totalOnline() });
});
