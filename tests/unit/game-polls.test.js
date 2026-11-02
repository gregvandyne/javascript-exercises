// Game polls (services/polls.js, POST /api/games/:id/poll): Would You Rather's "62% chose this". Counts only, one vote
// per player, item and seat; only official games on the list; checked input; the play page offers it only there.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const polls = await import('../../server/services/polls.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { seed } = await import('../../scripts/seed.js');
const { createApp } = await import('../../server/app.js');

let server, base, wyr, other;
function cookieFor(id) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; }
before(async () => {
  seed({ quiet: true });
  wyr = games.getGameBySlug('would-you-rather'); other = games.getGameBySlug('castle-clash');
  server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
const post = (u, g, body) => fetch(`${base}/api/games/${g.id}/poll`, { method: 'POST', headers: { cookie: cookieFor(u.id), 'Content-Type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify(body) });

test('one vote per player, item and seat; totals come back', () => {
  const a = auth.createUser({ username: 'PollKid1', password: 'secret123' }), b = auth.createUser({ username: 'PollKid2', password: 'secret123' });
  assert.deepEqual(polls.vote(wyr.id, a.id, 'animals-1', 0), { a: 1, b: 0, total: 1 });
  assert.deepEqual(polls.vote(wyr.id, a.id, 'animals-1', 1), { a: 1, b: 0, total: 1 }, 'a second vote changes nothing');
  assert.deepEqual(polls.vote(wyr.id, a.id, 'animals-1', 1, 1), { a: 1, b: 1, total: 2 }, 'another seat on the same device counts');
  assert.deepEqual(polls.vote(wyr.id, b.id, 'animals-1', 1), { a: 1, b: 2, total: 3 });
});

test('HTTP: checked input, only official games on the list, and the play page says when polls are on', async () => {
  const u = auth.createUser({ username: 'PollKid3', password: 'secret123' });
  let r = await post(u, wyr, { item: 'food-2', choice: 1, seat: 0 });
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.b, 1); assert.equal(j.min, polls.MIN_SHOWN);
  for (const bad of [{ item: 'Food 2', choice: 1 }, { item: 'food-2', choice: 2 }, { item: 'food-2', choice: 0, seat: 9 }, { item: 'x'.repeat(41), choice: 0 }])
    assert.equal((await post(u, wyr, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await post(u, other, { item: 'a', choice: 0 })).status, 404, 'not a poll game');
  const page = async slug => (await fetch(`${base}/play/${slug}`, { headers: { cookie: cookieFor(u.id) } })).text();
  assert.match(await page('would-you-rather'), /"polls":true/);
  assert.match(await page('castle-clash'), /"polls":false/);
  assert.equal(grownupMay('POST', `/api/games/${wyr.id}/poll`), true);
});
