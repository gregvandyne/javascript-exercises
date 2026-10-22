// Ad provider (contextual house ads) + the impression API + placement rules (Money node).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const ads = await import('../../server/services/ads.js');
const { createApp } = await import('../../server/app.js');

const CATS = games.CATEGORY_KEYS;
const house = ads.houseProvider();
const account = { id: 'u1', is_guest: 0 }, guest = { id: 'u2', is_guest: 1 };

test('pickAd is contextual: page category ads are preferred', () => {
  const a = ads.pickAd({ placement: 'grid', category: 'words', user: account, rand: () => 0 });
  assert.ok(house.get(a.id).categories.includes('words'), a.id);
  const g = ads.pickAd({ placement: 'grid', category: 'words', user: account, rand: () => 0.99 });
  assert.equal(house.get(g.id).categories.length, 0, 'sometimes a general ad for variety');
  const none = ads.pickAd({ placement: 'game', category: null, user: account, rand: () => 0 });
  assert.equal(house.get(none.id).categories.length, 0, 'no category: general ads');
});

test('pickAd never returns null while house ads exist, and returns the contract shape', () => {
  for (const placement of ['grid', 'game']) for (const category of [...CATS, null, 'nonsense']) for (const user of [null, guest, account]) for (let i = 0; i < 20; i++) {
    const a = ads.pickAd({ placement, category, user });
    assert.ok(a, `${placement}/${category}`);
    assert.deepEqual(Object.keys(a).sort(), ['href', 'icon', 'id', 'text', 'title']);
    assert.ok(a.href.startsWith('/') && !a.href.startsWith('//'), 'internal links only');
    if (!user || user.is_guest) assert.equal(house.get(a.id).needsAccount, false, 'no account-only ads for guests');
  }
});

test('every house ad is internal and kid-appropriate in shape', () => {
  const all = house.list({});
  assert.ok(all.length >= 6);
  for (const a of all) {
    assert.ok(a.href.startsWith('/') && !a.href.startsWith('//'));
    assert.ok(a.title.length <= 30 && a.text.length <= 60, a.id);
    for (const c of a.categories) assert.ok(CATS.includes(c), `${a.id}: ${c}`);
  }
  for (const c of CATS) assert.ok(all.some(a => a.categories.includes(c)), `contextual ad for ${c}`);
});

test('an empty partner provider falls back to house ads', () => {
  ads.setProvider({ name: 'empty', list: () => [], get: () => null });
  try { assert.ok(ads.pickAd({ placement: 'game', category: 'sports' })); assert.ok(ads.getAd('house-build')); }
  finally { ads.setProvider('house'); }
});

// ---------- HTTP ----------
const app = createApp();
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());
const owner = auth.createUser({ username: 'AdOwner', password: 'secret1' });
const g = games.createGame(owner.id, { title: 'Ad Test Game', category: 'sports' });
const v = games.addVersion(g.id, '<title>x</title><p>hi</p>');
q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
const post = (body, cookie, type = 'application/json') => fetch(base + '/api/ads/impression', { method: 'POST', headers: { 'Content-Type': type, ...(cookie ? { cookie } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('impression API rejects bad shapes with 400', async () => {
  for (const b of ['', 'not json', '[]', '{}', { ad: 'house-build', placement: 'popup', game: g.id }, { ad: 'house-build', placement: 'game' }, { ad: 'house-build', placement: 'grid', games: 'x'.repeat(50) }, { ad: '../x', placement: 'game', game: g.id }]) {
    const r = await post(b);
    assert.equal(r.status, 400, JSON.stringify(b));
  }
});

test('impression API: no session is not counted; a guest session is, once per hour', async () => {
  let r = await (await post({ ad: 'house-build', placement: 'game', game: g.id })).json();
  assert.deepEqual(r, { counted: false, reason: 'no-session' });
  const gr = await fetch(base + '/api/auth/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const cookie = gr.headers.get('set-cookie').split(';')[0];
  r = await (await post({ ad: 'house-build', placement: 'game', game: g.id }, cookie)).json();
  assert.deepEqual(r, { counted: true });
  r = await (await post(JSON.stringify({ ad: 'house-build', placement: 'game', game: g.id }), cookie, 'text/plain')).json();
  assert.deepEqual(r, { counted: false, reason: 'duplicate' });
  assert.equal(q.get('SELECT COUNT(*) n FROM ad_impressions WHERE game_id=?', g.id).n, 1);
});

test('two placements only: game page has one ad card, play page has none', async () => {
  const gp = await (await fetch(`${base}/g/${g.slug}`)).text();
  assert.equal((gp.match(/class="gcard adcard"/g) || []).length, 1);
  assert.match(gp, /data-placement="game"/); assert.match(gp, new RegExp(`data-game="${g.id}"`)); assert.match(gp, /\/js\/ads\.js/);
  const pp = await (await fetch(`${base}/play/${g.slug}`)).text();
  assert.doesNotMatch(pp, /adcard|data-ad=|Sponsored|\/js\/ads\.js/i);
});

test('creator and admin money pages are protected', async () => {
  const r = await fetch(base + '/creator', { redirect: 'manual' });
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^\/signup/);
  assert.equal((await fetch(base + '/admin/money')).status, 404);
  assert.equal((await fetch(base + '/api/admin/money/rollup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
});
