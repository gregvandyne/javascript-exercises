// Courses on the home page (server/services/courses.js, server/views/courses.js): CS Quest is one wide card in a
// "Courses" row with its four games nested in course order; it has its own page; a game counts as started once played.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const C = await import('../../server/services/courses.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0', ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const ORDER = ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine'];

test('the home page lists CS Quest in a Courses row with its four games in course order', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="courses-h"/);
  const card = r.text.slice(r.text.indexOf('class="course-card"'), r.text.indexOf('</article>', r.text.indexOf('class="course-card"')));
  const at = ORDER.map(s => card.indexOf(`href="/g/${s}"`));
  assert.ok(at.every(i => i > 0), 'all four games are inside the course card');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in course order');
  assert.match(card, /href="\/play\/robo-route"/, 'Start goes to the first game');
  assert.match(card, /href="\/courses\/cs-quest"/);
  assert.ok(r.text.indexOf('id="courses-h"') > r.text.indexOf('id="featured'), 'after the featured row');
});

test('the course page shows the games in order, the way in for teachers, and progress once played', async () => {
  const anon = await get('/courses/cs-quest');
  assert.equal(anon.status, 200);
  const at = ORDER.map(s => anon.text.indexOf(`href="/g/${s}"`));
  assert.ok(at.every(i => i > 0)); assert.deepEqual([...at].sort((a, b) => a - b), at);
  assert.match(anon.text, /href="\/teachers\/cs-quest"/);
  assert.equal((await get('/courses')).location, '/courses/cs-quest');
  assert.equal((await get('/courses/nope')).status, 404);

  const kid = q.get("SELECT * FROM users WHERE is_guest=0 AND account_type!='grownup' LIMIT 1") || q.get('SELECT * FROM users LIMIT 1');
  const rr = G.getGameBySlug('robo-route');
  G.recordPlay(rr.id, kid.id);
  const games = C.courseGames(kid, C.getCourse('cs-quest'));
  assert.deepEqual(games.map(g => g.slug), ORDER);
  assert.ok(C.startedIds(kid, games).has(rr.id));
  const home = await get('/', kid);
  const card = home.text.slice(home.text.indexOf('class="course-card"'));
  assert.match(card, /href="\/play\/data-detective"/, 'Keep going points at the first game not started');
  assert.match(card, /1 of 4 games started/);
});
