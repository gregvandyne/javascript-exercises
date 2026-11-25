// The focus on teaching tools (docs/decisions.md "Focus: teaching tools first"; services/game-focus.js): with ARCADE and
// COURSES off (the site's default) the hidden official games are on no list (Play, Learn, search, the sitemap, Oomba's
// game search, the landing page) and their pages say "not available right now"; a class that has one assigned still plays
// it. The courses answer the normal 404, except for a class with a course lesson. The Builder's start screen offers two
// kinds. Turning the flags on brings everything back.
process.env.ARCADE = '0'; process.env.COURSES = '0'; process.env.LANDING_AT_ROOT = '1';
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const SC = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const FOCUS = await import('../../server/services/game-focus.js');
const { searchGames } = await import('../../server/services/companion.js');
const { sitemapEntries } = await import('../../server/routes/seo.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { deicon } = await import('../support/deicon.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { resetLimits(); config.arcade = false; config.courses = false; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: deicon(await r.text()), location: r.headers.get('location') }; };
const gameLinks = s => new Set([...s.matchAll(/href="\/(?:g|play)\/([a-z0-9-]+)/g)].map(m => m[1]));
const hiddenIn = s => [...gameLinks(s)].filter(x => FOCUS.HIDDEN_GAMES.includes(x));

const KEPT = ['brain-board', 'question-battle', 'tug-of-math', 'doodle-hoot', 'would-you-rather-live', 'atlas-quest-live', 'popcorn-hush', 'quiet-bounce', 'remis-quiet-meadow',
  'crossword', 'mistake-hunt', 'word-hunt', 'sudoku', 'word-peek', 'algebra-builder', 'arithmetic-lab', 'atlas-quest', 'castle-clash'];

// ---------------------------------------------------------------- people
const boss = auth.createUser({ username: 'FocusBoss', password: 'boss-password-1', role: 'admin' });
const school = SC.createSchool(boss, { name: 'Focus School' }).school;
const head = SC.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Focushead', role: 'admin' }).user;
const teacher = auth.getUser(SC.createSchoolAccount(head, school.id, { rosterName: 'Mr Focus', role: 'teacher' }).user.id);
const pupil = SC.createSchoolAccount(head, school.id, { rosterName: 'Pip Focus' }).user;
const other = SC.createSchoolAccount(head, school.id, { rosterName: 'Olly Other' }).user;
const klass = SC.createClass(teacher, school.id, { name: 'Focus 4B' }).class;
assert.ok(SC.addToClass(teacher, klass.id, pupil.id).ok);
const kid = auth.createUser({ username: 'FocusKid', password: 'rainbow-77' });

test('the list: every hidden slug is a seed game, none of the kept ones is hidden, and the flag decides', () => {
  const seeds = q.all("SELECT slug FROM games WHERE source='seed'").map(r => r.slug);
  for (const s of FOCUS.HIDDEN_GAMES) assert.ok(seeds.includes(s), `${s} is a seed game`);
  for (const s of KEPT) assert.ok(!FOCUS.HIDDEN_GAMES.includes(s), `${s} is kept`);
  assert.equal(FOCUS.slugHidden('sum-racer'), true);
  assert.equal(FOCUS.slugHidden('crossword'), false);
  config.arcade = true; assert.equal(FOCUS.slugHidden('sum-racer'), false); assert.equal(FOCUS.hiddenSql(), '');
  // Nothing changed in the database: the rows are all still there and published.
  for (const s of FOCUS.HIDDEN_GAMES) assert.equal(G.getGameBySlug(s).status, 'published', s);
});

test('Learn (by topic and filtered) and search list no hidden game and keep the others', async () => {
  for (const who of [null, kid, pupil, teacher]) {
    // Play and Learn are one page (docs/decisions.md "Learn and Read"): its topics view and its filtered grid.
    const play = await get('/learn?how=solo', who), learn = await get('/learn', who);
    assert.equal(play.status, 200); assert.equal(learn.status, 200);
    assert.deepEqual(hiddenIn(play.text), [], `Play for ${who ? who.username : 'a visitor'}`);
    assert.deepEqual(hiddenIn(learn.text), [], `Learn for ${who ? who.username : 'a visitor'}`);
  }
  const seen = new Set([...gameLinks((await get('/learn?how=solo')).text), ...gameLinks((await get('/learn')).text)]);
  for (const s of ['crossword', 'word-hunt', 'castle-clash', 'algebra-builder', 'arithmetic-lab', 'tug-of-math', 'atlas-quest']) assert.ok(seen.has(s), `${s} is listed`);
  // The subject chips and pages with nothing left (Music, Computer science) are gone; the others stay.
  const learn = (await get('/learn')).text;
  assert.ok(!learn.includes('/learn/music-games') && !learn.includes('/learn/computer-science'));
  assert.ok(learn.includes('/learn/word-games'));
  assert.ok(!learn.includes('id="courses"') && !learn.includes('/teachers/cs-quest'), 'no course row');
  // not even for the platform admin (the owner, 24 Nov 2026: "The learn page should no longer have the courses on there")
  const adminLearn = (await get('/learn', boss)).text.replace(/<script[\s\S]*?<\/script>/g, '');
  { const m = adminLearn.match(/.{120}(CS Quest|Number Quest|Cyber Defenders).{120}/s); assert.ok(!m, 'no courses on Learn for the admin: ' + (m ? m[0] : '')); }
  assert.ok(!/courses that teach/i.test(adminLearn), 'the lead line no longer mentions courses');
  assert.equal((await get('/learn/music-games')).status, 404);
  assert.equal((await get('/learn/word-games')).status, 200);
  assert.deepEqual(hiddenIn((await get('/learn/math-games')).text), []);
  // Search: nothing hidden, by its own name either.
  const racer = await get('/search?q=sum+racer');
  assert.deepEqual(hiddenIn(racer.text), []);
  assert.ok(gameLinks((await get('/search?q=crossword')).text).has('crossword'));
  for (const s of FOCUS.HIDDEN_GAMES) assert.ok(!G.search(null, { text: s.replace(/-/g, ' '), limit: 60 }).some(g => g.slug === s), `search ${s}`);
});

test('the sitemap and Oomba’s game search leave hidden games and courses out', () => {
  const paths = sitemapEntries().map(e => e.path);
  for (const s of FOCUS.HIDDEN_GAMES) assert.ok(!paths.includes(`/g/${s}`), s);
  assert.ok(paths.includes('/g/crossword') && paths.includes('/g/brain-board'));
  assert.ok(!paths.some(p => p.startsWith('/courses/') || /^\/teachers\/(cs-quest|number-quest|cyber-defenders)$/.test(p)));
  assert.ok(!paths.includes('/learn/music-games') && paths.includes('/learn/word-games'));
  const found = [...searchGames({ topic: 'addition' }), ...searchGames({ topic: 'coding' }), ...searchGames({ topic: 'fractions' }), ...searchGames({ topic: 'spelling' })];
  assert.ok(!found.some(x => FOCUS.HIDDEN_GAMES.includes(x.id)), found.map(x => x.id).join());
  assert.ok(searchGames({ topic: 'vocabulary' }).some(x => x.id === 'crossword'));
});

test('a hidden game’s page and play page say it is not available, with the way to Learn; the admin still opens it', async () => {
  for (const p of ['/g/sum-racer', '/play/sum-racer', '/g/jungle-cup', '/play/would-you-rather']) {
    const r = await get(p);
    assert.equal(r.status, 404, p);
    assert.ok(r.text.includes('id="game-unavailable"') && r.text.includes('href="/learn">Go to Learn'), p);
    assert.ok(r.text.includes('available right now'), p);
  }
  assert.equal((await get('/g/sum-racer', boss)).status, 200);
  assert.equal((await get('/play/sum-racer', boss)).status, 200);
  assert.equal((await get('/g/crossword')).status, 200);
  assert.equal((await get('/play/crossword')).status, 200);
  // Would You Rather Live stays, without its (hidden) solo game's button.
  const wyr = await get('/g/would-you-rather-live');
  assert.equal(wyr.status, 200); assert.ok(!wyr.text.includes('href="/play/would-you-rather"'));
});

test('a game built with the Builder is never hidden, whatever it is called', async () => {
  const g = G.createGame(kid.id, { title: 'Sum Racer Remix', category: 'arcade' });
  const v = G.addVersion(g.id, '<!doctype html><title>x</title><p>hi</p>', { safetyStatus: 'passed' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
  const row = G.getGame(g.id);
  assert.equal(FOCUS.gameHidden(row), false);
  assert.equal((await get(`/g/${row.slug}`)).status, 200);
  assert.equal((await get(`/play/${row.slug}`)).status, 200);
});

test('a class with a hidden game assigned keeps playing it; anyone else does not', async () => {
  const racer = G.getGameBySlug('sum-racer');
  // Not assignable anew while hidden.
  assert.equal((await get('/teach/assign?game=sum-racer', teacher)).status, 404);
  assert.equal((await get('/teach/assign?game=crossword', teacher)).status, 200);
  // A class that had it assigned before the change (the assignment is made directly, as it was then).
  const r = F.assignGame(teacher, klass.id, racer.id, {});
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(FOCUS.mayOpenHidden(auth.getUser(pupil.id), racer), true);
  assert.equal(FOCUS.mayOpenHidden(auth.getUser(other.id), racer), false);
  assert.equal((await get('/play/sum-racer', pupil)).status, 200);
  assert.equal((await get('/g/sum-racer', pupil)).status, 200);
  assert.equal((await get('/play/sum-racer', teacher)).status, 200);
  assert.equal((await get('/teach/assign?game=sum-racer', teacher)).status, 200, 'the teacher may assign it again');
  const no = await get('/play/sum-racer', other);
  assert.equal(no.status, 404); assert.ok(no.text.includes('id="game-unavailable"'));
  // Still off every list for the class too.
  assert.deepEqual(hiddenIn((await get('/learn', pupil)).text), []);
  // Taken off the class: gone for them as well.
  q.run('UPDATE class_lessons SET removed_at=? WHERE id=?', Date.now(), r.classLesson.id);
  assert.equal((await get('/play/sum-racer', pupil)).status, 404);
});

test('courses answer the normal 404 for new visitors; a class with a course lesson keeps them', async () => {
  const paths = ['/courses', '/courses/cs-quest', '/courses/number-quest', '/teachers/cs-quest', '/teachers/number-quest', '/teachers/cyber-defenders', '/number-quest/sorting-game'];
  for (const p of paths) for (const who of [null, kid, pupil]) assert.equal((await get(p, who)).status, 404, `${p} for ${who ? who.username : 'a visitor'}`);
  for (const p of ['/teach/cs-quest', '/teach/cyber-defenders']) assert.equal((await get(p, teacher)).status, 404, p);
  const api = await fetch(`${base}/api/cs-quest/catalog`, { headers: { cookie: cookieFor(teacher.id) } });
  assert.equal(api.status, 404);
  // A course game's page has no course to send a visitor to.
  assert.equal((await get('/g/trick-inbox')).status, 404);
  // A class with a course lesson assigned (lessons.kind='course', as CS Quest's lessons are).
  const crossword = G.getGameBySlug('crossword');
  const r = F.assignGame(teacher, klass.id, crossword.id, {});
  q.run("UPDATE lessons SET kind='course' WHERE id=?", r.classLesson.lesson_id);
  assert.equal(FOCUS.hasCourseLesson(auth.getUser(pupil.id)), true);
  assert.notEqual((await get('/courses/cs-quest', pupil)).status, 404);
  assert.notEqual((await get('/teachers/cs-quest', teacher)).status, 404);
  assert.notEqual((await get('/teach/cs-quest', teacher)).status, 404);
  assert.equal((await get('/courses/cs-quest', kid)).status, 404, 'still hidden for everyone else');
  // Its lesson page and the gradebook still open.
  assert.equal((await get(`/class/${klass.id}/lessons/${r.classLesson.id}`, pupil)).status, 200);
  assert.equal((await get(`/class/${klass.id}/progress`, teacher)).status, 200);
  q.run('UPDATE class_lessons SET removed_at=? WHERE id=?', Date.now(), r.classLesson.id);
});

test('the Builder’s start offers Classroom lesson and Classroom game only; an Arcade link falls back', async () => {
  for (const who of [teacher, pupil, kid]) {
    const r = await get('/build/new', who);
    assert.equal(r.status, 200);
    const kinds = [...r.text.matchAll(/class="su-kind" data-kind="([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(kinds, ['activity', 'classgame'], who.username);
    assert.ok(!/"kind":"arcade"/.test(r.text), 'never starts on arcade');
  }
  const arc = await get('/build/new?kind=arcade', kid);
  assert.match(arc.text, /data-kind="classgame" aria-pressed="true"/);
  assert.match(arc.text, /"canvas":\{"kind":"classgame"/);
});

test('the landing page leads with the teaching tools: no course links, kept games in the fan', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes('/teachers/cs-quest') && !r.text.includes('/teachers/number-quest') && !r.text.includes('/teachers/cyber-defenders'));
  assert.ok(r.text.includes('/img/landing/crossword-240.webp'));
  assert.ok(!r.text.includes('/img/landing/robo-route-240.webp') && !r.text.includes('Fraction Factory'));
  assert.ok(r.text.includes('virtual math manipulatives'));
  assert.ok(!r.text.includes('<b>30+</b>'));
  // The tools come before the Builder.
  if (r.text.includes('id="tools"')) assert.ok(r.text.indexOf('id="tools"') < r.text.indexOf('id="builder"'));
});

test('with ARCADE and COURSES on, everything is back', async () => {
  config.arcade = true; config.courses = true;
  try {
    assert.equal((await get('/g/sum-racer')).status, 200);
    assert.equal((await get('/courses/cs-quest')).status, 200);
    assert.equal((await get('/teachers/cs-quest')).status, 200);
    const paths = sitemapEntries().map(e => e.path);
    assert.ok(paths.includes('/g/sum-racer') && paths.includes('/courses/cs-quest') && paths.includes('/learn/music-games'));
    assert.ok(gameLinks((await get('/learn')).text).has('sum-racer'));
    assert.ok(searchGames({ topic: 'addition' }).some(x => x.id === 'sum-racer'));
    const b = await get('/build/new', kid);
    assert.deepEqual([...b.text.matchAll(/class="su-kind" data-kind="([a-z]+)"/g)].map(m => m[1]), ['activity', 'classgame', 'arcade']);
    const land = await get('/');
    assert.ok(land.text.includes('/teachers/cs-quest') && land.text.includes('<b>30+</b>'));
  } finally { config.arcade = false; config.courses = false; }
});

test('Learn shows each kept game once, in sections by topic, with the live and puzzle games on it', async () => {
  for (const who of [null, kid]) {
    const r = await get('/learn', who);
    const cards = [...r.text.matchAll(/class="gcard[^"]*" href="\/g\/([a-z0-9-]+)"/g)].map(m => m[1]);
    const official = cards.filter(s => KEPT.includes(s));
    assert.equal(new Set(official).size, official.length, `no repeats: ${official.join()}`);
    for (const s of ['crossword', 'brain-board', 'question-battle', 'doodle-hoot', 'would-you-rather-live', 'atlas-quest-live', 'tug-of-math', 'mistake-hunt', 'word-hunt', 'sudoku', 'word-peek', 'castle-clash', 'algebra-builder', 'arithmetic-lab', 'popcorn-hush'])
      assert.ok(official.includes(s), `${s} is on Learn`);
    for (const id of ['sec-math', 'sec-reading', 'sec-geography', 'sec-live', 'sec-strategy', 'sec-tools']) assert.ok(r.text.includes(`id="${id}-h"`), id);
    assert.ok(!r.text.includes('id="popular-h"') && !r.text.includes('id="rated-h"'));
  }
});
