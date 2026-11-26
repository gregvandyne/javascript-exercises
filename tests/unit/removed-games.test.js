// Tug of Math and Question Battle taken off the site (owner, 25 Nov 2026; docs/decisions.md "Tug of Math and Question
// Battle taken off"; services/game-focus.js REMOVED_GAMES): on no list (Learn, the class's Find Oomba games, the sitemap,
// the age and subject pages), their pages say "not available right now", their Oomba Live modes are not offered and a
// room in them cannot be opened, Quick game offers Brain Board in their place and the landing page's demo game is Brain
// Board. Nothing is deleted: the platform admin and a class that has one assigned still open it. Whatever ARCADE says.
process.env.ARCADE = '0'; process.env.COURSES = '0'; process.env.REMOVED_GAMES = 'tug-of-math,question-battle'; process.env.LANDING_AT_ROOT = '1';
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const SC = await import('../../server/services/schools.js');
const FOCUS = await import('../../server/services/game-focus.js');
const { HUBS, AGES } = await import('../../server/learn.js');
const { sitemapEntries } = await import('../../server/routes/seo.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { resetLimits(); config.arcade = false; config.removedGames = null; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const post = async (path, u, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: cookieFor(u.id) }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };
const NAMES = /tug-of-math|question-battle|Tug of Math|Question Battle/;
// The page's words, without its screenshots: the marketing pictures of Oomba Live were taken in a Question Battle room
// (scripts/how-shots.js) and their alt text says what they show.
const words = s => s.replace(/<img\b[^>]*>/g, '').replace(/<source\b[^>]*>/g, '');

const boss = auth.createUser({ username: 'RemovedBoss', password: 'boss-password-1', role: 'admin' });
const school = SC.createSchool(boss, { name: 'Removed School' }).school;
const teacher = auth.getUser(SC.createSchoolAccount(boss, school.id, { rosterName: 'Ms Rope', role: 'teacher' }).user.id);
const cls = SC.createClass(boss, school.id, { name: '4B Math', teacherId: teacher.id }).class;

test('the list: both games, by default, whatever ARCADE says; REMOVED_GAMES replaces it and none brings them back', () => {
  config.removedGames = null;
  assert.deepEqual([...FOCUS.removedGames()], ['tug-of-math', 'question-battle']);
  for (const arcade of [false, true]) {
    config.arcade = arcade;
    for (const slug of FOCUS.REMOVED_GAMES) {
      assert.ok(FOCUS.slugHidden(slug) && FOCUS.slugRemoved(slug), `${slug} hidden with ARCADE=${arcade}`);
      assert.ok(G.getGameBySlug(slug), `${slug} is still in the database`);
    }
    assert.ok(!FOCUS.slugHidden('brain-board'));
    assert.match(FOCUS.hiddenSql('g'), /'tug-of-math','question-battle'/);
  }
  config.arcade = true; config.removedGames = [];
  assert.equal(FOCUS.hiddenSql('g'), '');
  assert.ok(!FOCUS.slugHidden('tug-of-math') && !FOCUS.slugHidden('question-battle'));
});

test('no list shows them: Learn, the class\'s Find Oomba games, the subject and age pages, the sitemap; their pages are closed', async () => {
  for (const p of ['/learn', ...FOCUS.openHubs(HUBS).map(h => `/learn/${h.slug}`), ...AGES.map(h => `/learn/${h.slug}`)]) {
    const r = await get(p);
    if (r.status === 200) assert.doesNotMatch(r.text, NAMES, p);
  }
  const oomba = await get(`/class/${cls.id}?view=oomba`, teacher);
  assert.equal(oomba.status, 200);
  assert.doesNotMatch(oomba.text, /href="\/(?:g|play)\/(?:tug-of-math|question-battle)/);
  const paths = sitemapEntries().map(e => e.path).join(' ');
  assert.doesNotMatch(paths, /tug-of-math|question-battle/);
  for (const slug of FOCUS.REMOVED_GAMES) {
    assert.notEqual((await get(`/g/${slug}`, teacher)).status, 200, `/g/${slug} for a teacher`);
    assert.equal((await get(`/g/${slug}`, boss)).status, 200, `/g/${slug} for the platform admin`);
  }
});

test('Oomba Live: neither mode is offered or can be opened; Quick game is Brain Board; the live page lists neither', async () => {
  const live = await get('/live', teacher);
  assert.equal(live.status, 200);
  assert.doesNotMatch(live.text, /value="mode:battle"|value="mode:tug"|data-own-mode="tug"/);
  for (const pick of ['mode:battle', 'mode:tug']) {
    const r = await post('/api/live/sessions', teacher, { pick, set: 'bank', classId: cls.id, audience: 'class' });
    assert.equal(r.status, 404, pick);
  }
  const quick = await get('/live/quick', teacher);
  assert.match(quick.text, /value="board"/);
  assert.doesNotMatch(quick.text, /value="battle"/);
  const r = await post('/api/live/quick', teacher, { subject: 'math', level: 'a8' });
  assert.equal(r.status, 200);
  assert.ok(r.json.sid);
  const tl = await get('/teachers/live');
  assert.doesNotMatch(words(tl.text), NAMES);
  const home = await get('/');
  assert.doesNotMatch(words(home.text), NAMES);
  assert.match(home.text, /Brain Board/);
});
