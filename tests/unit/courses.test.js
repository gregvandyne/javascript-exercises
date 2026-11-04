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
  const at = ORDER.map(s => card.indexOf(`href="/play/${s}?course=cs-quest"`));
  assert.ok(at.every(i => i > 0), 'all four games are inside the course card');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in course order');
  assert.match(card, /href="\/play\/robo-route\?course=cs-quest"/, 'Start goes to the first game');
  assert.match(card, /href="\/courses\/cs-quest"/);
  assert.ok(r.text.indexOf('id="courses-h"') > r.text.indexOf('id="featured'), 'after the featured row');
});

test('the course page shows the games in order, the way in for teachers, and progress once played', async () => {
  const anon = await get('/courses/cs-quest');
  assert.equal(anon.status, 200);
  const at = ORDER.map(s => anon.text.indexOf(`href="/play/${s}?course=cs-quest"`));
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
  assert.match(card, /href="\/play\/data-detective\?course=cs-quest"/, 'Keep going points at the first game not started');
  assert.match(card, /1 of 4 games started/);
});

test('course games are played only inside the course: out of the open lists, no page of their own', async () => {
  const anyone = q.get("SELECT * FROM users WHERE is_guest=0 LIMIT 1");
  for (const list of [G.listVisible(null, { limit: 200 }), G.listVisible(null, { featured: true, limit: 200 }), G.search(null, { text: 'Robo' }), G.search(anyone, { text: 'Packet' })])
    for (const s of ORDER) assert.ok(!list.some(g => g.slug === s), `${s} is not in an open list`);
  const home = await get('/');
  const outside = home.text.slice(0, home.text.indexOf('class="course-card"')) + home.text.slice(home.text.indexOf('</article>', home.text.indexOf('class="course-card"')));
  for (const s of ORDER) assert.ok(!outside.includes(`/g/${s}"`), `${s} only appears in the course card`);
  assert.equal((await get('/g/robo-route')).location, '/courses/cs-quest#robo-route');
  assert.equal((await get('/play/packet-post')).location, '/courses/cs-quest');
  const inside = await get('/play/packet-post?course=cs-quest');
  assert.equal(inside.status, 200);
  assert.match(inside.text, /href="\/courses\/cs-quest"/);
  assert.match(inside.text, /CS Quest · game 3 of 4/);
  assert.equal((await get('/play/robo-route?chapter=loops&band=1b')).status, 200, 'a teacher lesson link still opens the game');
});
