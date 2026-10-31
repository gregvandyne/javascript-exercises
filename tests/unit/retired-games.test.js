// Quest Race and Question Battle are not published for now (scripts/seed.js RETIRED_GAMES): the seed still imports them,
// but they are hidden from every list and their pages, never featured, and the live picker does not offer them.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../server/app.js');
const { seed, RETIRED_GAMES } = await import('../../scripts/seed.js');
const games = await import('../../server/services/games.js');

seed({ quiet: true });
seed({ quiet: true });   // every boot re-imports and re-retires
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

test('retired games are hidden, private and not featured; other launch games stay public', () => {
  for (const slug of RETIRED_GAMES) {
    const g = games.getGameBySlug(slug);
    assert.ok(g, slug);
    assert.equal(g.hidden_reason, 'retired'); assert.equal(g.visibility, 'private'); assert.equal(g.featured, 0);
    assert.equal(games.canView(null, g), false);
  }
  const hero = games.getGameBySlug('hero-of-sunvale');
  assert.equal(hero.hidden_reason, ''); assert.equal(hero.visibility, 'public');
  const listed = games.listVisible(null, { limit: 200 }).map(g => g.slug);
  for (const slug of RETIRED_GAMES) assert.ok(!listed.includes(slug), `${slug} listed`);
});

test('the retired games\' pages are not found for visitors', async () => {
  for (const slug of RETIRED_GAMES) {
    const r = await fetch(`${base}/g/${slug}`, { headers: { accept: 'text/html' }, redirect: 'manual' });
    assert.equal(r.status, 404, slug);
  }
});
