// No stars, play counts or favorite counts on any game card or game page (the owner, 27 Nov 2026; docs/decisions.md
// "No stars, plays or favorite counts"): the data stays (sorting by popularity, the admin pages) but no page shows it.
// A game with ratings, plays and favorites: Learn (the catalog), search, My favorites, a profile, the game page and the
// play page show none of the numbers, and no aggregateRating in the game page's structured data. Favoriting still
// toggles (its heart's state and its "Add to favorites" / "Remove from favorites" label, never a count) and lands in
// My favorites.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession } = await import('../../server/auth.js');
const { q, now } = await import('../../server/db.js');
const games = await import('../../server/services/games.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (p, cookie = '') => { const r = await fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} }); return { status: r.status, text: await r.text() }; };
const post = async (p, body, cookie) => { const r = await fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: base, cookie }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };

const SLUG = 'word-hunt';
/** The page without its scripts, styles and the player's own rating buttons (★ there is a button to rate, not a rating). */
const shown = h => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<div class="rate"[\s\S]*?<\/div>/g, '');
function noCounts(h, where) {
  const s = shown(h);
  assert.doesNotMatch(s, /class="stars|id="likecount"|class="meta"><span class="stars/, `${where}: no stars or favorite count markup`);
  assert.doesNotMatch(s, /\d(?:[.,]\d)?\s*★|★\s*<span class="num">/, `${where}: no star rating`);
  assert.doesNotMatch(s.replace(/<[^>]+>/g, ' '), /\b\d[\d,.]*\s*(?:K\s*)?(?:plays?|favou?rites?|ratings?)\b/i, `${where}: no plays, favorites or ratings count`);
  assert.doesNotMatch(s, /No ratings yet/, `${where}: no "No ratings yet"`);
}

test('no stars, plays or favorite counts on cards, the game page or the play page; favoriting still toggles', async () => {
  const g = games.getGameBySlug(SLUG);
  assert.ok(g, 'the seeded game');
  // ratings, plays and favorites from other players
  for (let i = 0; i < 6; i++) {
    const u = createUser({ username: `nocnt${i}x${Date.now() % 1000}`, password: 'correct-horse-12' });
    q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', `p-nocnt-${i}-${Date.now()}`, g.id, u.id, now());
    const c = cookieFor(u.id);
    assert.equal((await post(`/api/games/${g.id}/rate`, { stars: 5 }, c)).status, 200);
    assert.equal((await post(`/api/games/${g.id}/like`, {}, c)).status, 200);
  }
  q.run('UPDATE games SET plays=plays+1234 WHERE id=?', g.id);
  const kid = createUser({ username: `nocntK${Date.now() % 1000}`, password: 'correct-horse-12' });
  const kc = cookieFor(kid.id);
  // favoriting: toggles, its label says so with no count, and it lands in My favorites
  let r = await post(`/api/games/${g.id}/like`, {}, kc);
  assert.equal(r.json.liked, true);
  let page = (await get(`/g/${SLUG}`, kc)).text;
  assert.match(page, /id="likebtn" aria-pressed="true" aria-label="Remove from favorites"/);
  assert.match((await get('/favorites', kc)).text, new RegExp(`class="gcard[^"]*" href="/g/${SLUG}"`));
  const play = (await get(`/play/${SLUG}`, kc)).text;
  assert.match(play, /id="p-like" aria-pressed="true" aria-label="Remove from favorites"/);
  // none of the numbers, anywhere a card or the game shows
  for (const [p, c] of [['/learn', ''], ['/learn', kc], ['/search?q=word', ''], ['/search?q=word', kc], ['/favorites', kc], [`/g/${SLUG}`, ''], [`/g/${SLUG}`, kc], [`/play/${SLUG}`, kc], ['/u/OombaAcademy', kc]]) {
    const res = await get(p, c);
    assert.equal(res.status, 200, p);
    noCounts(res.text, `${p} ${c ? 'signed in' : 'signed out'}`);
  }
  const api = await (await fetch(`${base}/api/search?q=word`)).json();
  noCounts(api.html, '/api/search');
  // no rating in the structured data either
  assert.doesNotMatch((await get(`/g/${SLUG}`)).text, /aggregateRating|ratingValue/);
  // and off again
  r = await post(`/api/games/${g.id}/like`, {}, kc);
  assert.equal(r.json.liked, false);
  page = (await get(`/g/${SLUG}`, kc)).text;
  assert.match(page, /id="likebtn" aria-pressed="false" aria-label="Add to favorites"/);
  assert.doesNotMatch((await get('/favorites', kc)).text, new RegExp(`href="/g/${SLUG}"`));
});
