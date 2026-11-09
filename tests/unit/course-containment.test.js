// Course-only games stay inside their course (Greg's rule, 2026-11-05): games built solely as a course's game
// modules — Cyber Defenders' Trick Inbox and Escape the Post Office — carry course_only=1 (migration 0047, seed
// JSON "course_only") and are owned (unshared) in services/course-catalog.js, so they appear on no public
// catalogue surface (home rails incl. Featured/New, category rails, search, similar, playing now, the sitemap),
// their /g page redirects to the course, and a bare /play redirects to the course map — while the course steps
// that launch them still play, and a win still completes the step. Games a course merely borrows (Would You
// Rather, Sum Racer, Castle Clash) keep their catalogue place; Packet Post's pre-existing containment as CS
// Quest's own game is unchanged.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, now, migrate } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const C = await import('../../server/services/courses.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u, extra = {}) => { const r = await fetch(base + path, { headers: { ...H, ...extra, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, u, body) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, location: r.headers.get('location') };
};
let n = 0;
const newKid = () => auth.createUser({ username: `contain${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const course = C.getCourse('cyber-defenders');
const right = id => C.item(id).answer;
const allRight = step => Object.fromEntries(step.check.map(id => [id, right(id)]));
const doneByHand = (kid, step) => q.run('INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,3,?,?)', kid.id, 'cyber-defenders', step.key, step.band, now(), now(), now(), now());
const doneBefore = (kid, band, uptoKey) => { for (const s of C.steps(course, band)) { if (s.key === uptoKey) break; doneByHand(kid, s); } };

const FLAGGED = ['trick-inbox', 'escape-the-post-office'];
const OPEN = ['would-you-rather', 'sum-racer', 'castle-clash', 'brain-board'];

test('the flag: the two Cyber Defenders games are course_only, borrowed and open games are not', () => {
  for (const slug of FLAGGED) assert.equal(G.getGameBySlug(slug).course_only, 1, slug);
  for (const slug of [...OPEN, 'packet-post']) assert.equal(G.getGameBySlug(slug).course_only, 0, slug);
  assert.equal(C.courseOfSlug('trick-inbox').slug, 'cyber-defenders');
  assert.equal(C.courseOfSlug('escape-the-post-office').slug, 'cyber-defenders');
  assert.equal(C.courseOfSlug('would-you-rather'), null, 'a borrowed game has no owner course');
  // The migration backfills an existing database: clear the flags, drop the migration row, re-run migrate().
  q.run('UPDATE games SET course_only=0');
  q.run("DELETE FROM migrations WHERE name='0047_course_only_games'");
  migrate();
  for (const slug of FLAGGED) assert.equal(G.getGameBySlug(slug).course_only, 1, `${slug} backfilled`);
});

test('catalogue queries: flagged games are out of rails, featured, category and search; open games remain', () => {
  const all = G.listVisible(null, { limit: 500 }).map(g => g.slug);
  for (const slug of FLAGGED) assert.ok(!all.includes(slug), `${slug} not in the open list`);
  for (const slug of OPEN) assert.ok(all.includes(slug), `${slug} still listed`);
  const featured = G.listVisible(null, { featured: true, order: 'plays', limit: 24 }).map(g => g.slug);
  assert.ok(!featured.includes('trick-inbox'), 'Trick Inbox is not in Featured despite its seed flag');
  const learning = G.listVisible(null, { category: 'learning', limit: 100 }).map(g => g.slug);
  for (const slug of FLAGGED) assert.ok(!learning.includes(slug), `${slug} not in the Learning rail`);
  assert.equal(G.search(null, { text: 'Trick Inbox' }).length, 0);
  assert.equal(G.search(null, { text: 'Escape the Post Office' }).length, 0);
  assert.ok(G.search(null, { text: 'Would You Rather' }).some(g => g.slug === 'would-you-rather'));
  const wyr = G.getGameBySlug('would-you-rather');
  assert.ok(!G.similar(null, wyr, 6).some(g => FLAGGED.includes(g.slug)), 'similar games never suggest a course-only game');
});

test('Play and Learn: no catalogue cards for the flagged games, and the course card (on Learn) shows a real topic label', async () => {
  const home = await get('/'), learn = await get('/learn');
  assert.equal(home.status, 200); assert.equal(learn.status, 200);
  for (const page of [home, learn]) for (const slug of FLAGGED) {
    assert.ok(!page.text.includes(`href="/g/${slug}"`), `no /g link for ${slug}`);
    assert.ok(!page.text.includes(`href="/play/${slug}"`), `no bare /play link for ${slug}`);
  }
  assert.ok(!home.text.includes('id="courses-h"'), 'the courses live on Learn, not on Play');
  assert.ok(learn.text.includes('href="/courses/cyber-defenders#trick-inbox"'), 'the course card still lists Trick Inbox inside the course');
  assert.ok(learn.text.includes('Online safety'), 'the Cyber Defenders games render their topic label');
  assert.ok(!learn.text.includes('courses.topics.cybersecurity'), 'never the raw i18n key');
  const search = await get('/search?q=Trick');
  assert.equal(search.status, 200);
  assert.ok(!search.text.includes('href="/g/trick-inbox"'), 'search results carry no Trick Inbox card');
  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 200);
  for (const slug of FLAGGED) assert.ok(!sitemap.text.includes(`/g/${slug}`), `the sitemap leaves out ${slug}`);
  assert.ok(sitemap.text.includes('/courses/cyber-defenders'), 'the course page stands for them in the sitemap');
  assert.ok(sitemap.text.includes('/g/would-you-rather'), 'open games stay in the sitemap');
});

test('direct visits: /g redirects into the course and a bare /play goes to the course map', async () => {
  const kid = newKid();
  for (const slug of FLAGGED) {
    assert.equal((await get(`/g/${slug}`)).location, `/courses/cyber-defenders#${slug}`, slug);
    assert.equal((await get(`/play/${slug}`, kid)).location, '/courses/cyber-defenders', slug);
  }
  assert.equal((await get('/g/would-you-rather')).status, 200, 'a borrowed game keeps its own page');
});

test('inside the course: the Trick Inbox step (6.3) and the Escape finale (6.4) still play and complete on a win', async () => {
  const kid = newKid(); C.setBand(kid, course, '1b');
  doneBefore(kid, '1b', '1b-6.3');
  const s63 = C.getStep(course, '1b-6.3');
  assert.equal(s63.game.slug, 'trick-inbox');
  const r63 = await post('/api/courses/cyber-defenders/1b-6.3/check', kid, { answers: allRight(s63) });
  assert.equal(r63.json.passed, true);
  assert.ok(r63.json.play.startsWith('/play/trick-inbox?course=cyber-defenders&cstep=1b-6.3'), r63.json.play);
  const play63 = await get(r63.json.play, kid);
  assert.equal(play63.status, 200, 'the step launches Trick Inbox');
  assert.ok(C.stateOf(kid, course, '1b-6.3').played && !C.stateOf(kid, course, '1b-6.3').complete, 'opening only starts the step');
  const won63 = await post('/api/courses/cyber-defenders/1b-6.3/complete', kid, {});
  assert.equal(won63.status, 200);
  assert.ok(C.stateOf(kid, course, '1b-6.3').complete, 'the win completes the Trick Inbox step');

  doneBefore(kid, '1b', '1b-6.4');
  const s64 = C.getStep(course, '1b-6.4');
  assert.equal(s64.game.slug, 'escape-the-post-office');
  const r64 = await post('/api/courses/cyber-defenders/1b-6.4/check', kid, { answers: allRight(s64) });
  assert.equal(r64.json.passed, true);
  assert.ok(r64.json.play.startsWith('/play/escape-the-post-office?course=cyber-defenders&cstep=1b-6.4'), r64.json.play);
  const play64 = await get(r64.json.play, kid);
  assert.equal(play64.status, 200, 'the step launches Escape the Post Office');
  const won64 = await post('/api/courses/cyber-defenders/1b-6.4/complete', kid, {});
  assert.equal(won64.status, 200);
  assert.ok(C.stateOf(kid, course, '1b-6.4').complete, 'the win completes the finale step');
});
