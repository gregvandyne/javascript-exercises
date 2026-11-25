// Play and Learn (docs/decisions.md "Play and Learn", "Learn and Read"): one game library, its official games still
// tagged on two shelves (seed JSON, migration, import; the rule for players' games, SHELF_SQL / shelfOf), shown on one
// Learn page ('/' and /learn; /play answers 301 there): every open game by topic, each once, and filters that show the
// grid with each game's subject and grades as plain links, the SEO page kept for search engines, no player's game or
// name signed out, staff-only Assign and Host, and assigning a game to a class.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, db } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const SC = await import('../../server/services/schools.js');
const L = await import('../../server/learn.js');
const { LIVE_GAMES } = await import('../../server/live/live-games.js');
const { COURSE_GAME_SLUGS } = await import('../../server/services/course-catalog.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const C = await import('../../server/services/courses.js');
const { deicon } = await import('../support/deicon.js');  // icons read back as the emoji they stand for
const { topicOf } = await import('../../server/routes/discover.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: deicon(await r.text()), location: r.headers.get('location') }; };
const post = async (path, u, body) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const raw = await r.text(), text = deicon(raw); let json = null; try { json = JSON.parse(raw, (k, v) => typeof v === 'string' ? deicon(v) : v); } catch { /* html */ }
  return { status: r.status, json };
};
/** The game slugs linked from one section (by its id) of a page. */
const section = (html, id) => {
  const at = html.search(new RegExp(`id="${id}(-h)?"`)); if (at < 0) return '';
  const from = html.lastIndexOf('<section', at), to = html.indexOf('</section>', at);
  return html.slice(from, to + 10);
};
const slugsIn = s => [...new Set([...s.matchAll(/class="gcard[^"]*" href="\/g\/([^"]+)"/g)].map(m => m[1]))];
const hero = s => (/<section class="hero[\s\S]*?<h2 class="hero-title">([^<]+)<\/h2>/.exec(s) || [])[1];

// ---------------------------------------------------------------- people
const boss = auth.createUser({ username: 'ShelfBoss', password: 'boss-password-1', role: 'admin' });
const school = SC.createSchool(boss, { name: 'Shelf School' }).school;
const other = SC.createSchool(boss, { name: 'Other Shelf School' }).school;
const head = SC.createSchoolAccount(boss, school.id, { rosterName: 'Mrs Shelfhead', role: 'admin' }).user;
const teacher = SC.createSchoolAccount(head, school.id, { rosterName: 'Mr Shelf', role: 'teacher' }).user;
const pupil = SC.createSchoolAccount(head, school.id, { rosterName: 'Pip Pupil' }).user;
const klass = SC.createClass(teacher, school.id, { name: 'Shelf 4B' }).class;
assert.ok(SC.addToClass(teacher, klass.id, pupil.id).ok);
const kid = auth.createUser({ username: 'ShelfKid', password: 'rainbow-77' });
const mum = auth.createUser({ username: 'ShelfMum', password: 'a-long-password-1', accountType: 'grownup' });
const guest = auth.createGuest();

// ---------------------------------------------------------------- the tags
const PLAY = ['hero-of-sunvale', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'brick-drop', 'munch-maze', 'swish-flick', 'beat-lanes', 'would-you-rather', 'gulp-city', 'remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush', 'jungle-cup', 'algebra-builder', 'box-by-box'];
const LEARN = ['typing-zoo', 'shark-plank', 'castle-clash', 'word-hunt', 'sum-racer', 'word-peek', 'loop-lab', 'code-isle', 'quest-race', 'question-battle', 'brain-board', 'atlas-quest', 'would-you-rather-live', 'atlas-quest-live',
  'packet-post', 'trick-inbox', 'inside-the-machine', 'data-detective', 'robo-route', 'escape-the-post-office', 'fraction-factory', 'tug-of-math', 'doodle-hoot', 'word-trail', 'garden-count', 'lily-hop', 'crate-stacker', 'balance-bridge', 'rocket-supply', 'shape-hunt', 'kitchen-rush', 'lantern-mix', 'sub-zero', 'machine-line', 'scale-scout', 'sky-lines', 'keep-builder', 'launch-lab', 'sudoku', 'sum-spotter', 'crossword', 'mistake-hunt'];
const seedMeta = fs.readdirSync('seed-games').filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(`seed-games/${f}`, 'utf8')));

test('every launch game is on exactly one shelf: 17 on Play, 42 on Learn, as designed; the database agrees', () => {
  assert.equal(seedMeta.length, 59);
  for (const m of seedMeta) assert.ok(m.shelf === 'play' || m.shelf === 'learn', `${m.slug}: shelf`);
  assert.deepEqual(seedMeta.filter(m => m.shelf === 'play').map(m => m.slug).sort(), [...PLAY].sort());
  assert.deepEqual(seedMeta.filter(m => m.shelf === 'learn').map(m => m.slug).sort(), [...LEARN].sort());
  for (const m of seedMeta) assert.equal(G.getGameBySlug(m.slug).shelf, m.shelf, `${m.slug}: imported`);
  // Each shelf has its own hero: Jungle Cup for Play, Code Isle for Learn.
  assert.deepEqual(seedMeta.filter(m => m.hero).map(m => `${m.slug}:${m.shelf}`).sort(), ['code-isle:learn', 'jungle-cup:play']);
});

test('every Learn game has a known subject and grades; the lists the pages use are on the right shelves', () => {
  const subjects = new Set([...L.SUBJECTS.map(s => s.key), 'any']);
  for (const slug of LEARN) {
    const i = L.SHELF_INFO[slug];
    assert.ok(i, `${slug}: SHELF_INFO`); assert.ok(subjects.has(i.subject), `${slug}: subject ${i.subject}`);
    assert.ok(Number.isInteger(i.from) && Number.isInteger(i.to) && i.from >= 0 && i.from <= i.to && i.to <= 8, `${slug}: grades`);
  }
  assert.deepEqual(Object.keys(L.SHELF_INFO).sort(), [...LEARN].sort(), 'only Learn games have learning info');
  for (const s of L.LEARN_FUN) assert.ok(LEARN.includes(s), s);
  for (const s of [...L.BRAIN_BREAKS, ...L.CLASS_TOOLS]) assert.ok(PLAY.includes(s), s);
  for (const s of L.SUBJECTS) if (s.hub) assert.ok(L.hubBySlug(s.hub), s.hub);
});

test('players\' games: Learning and Words categories -> Learn, anything else -> Play; a row\'s own shelf wins (SHELF_SQL = shelfOf)', () => {
  const cases = [[{ shelf: '', category: 'learning' }, 'learn'], [{ shelf: '', category: 'words' }, 'learn'], [{ shelf: '', category: 'arcade' }, 'play'], [{ shelf: 'play', category: 'words' }, 'play'], [{ shelf: 'play', category: 'learning' }, 'play'], [{ shelf: 'learn', category: 'arcade' }, 'learn']];
  for (const [g, want] of cases) {
    assert.equal(G.shelfOf(g), want, JSON.stringify(g));
    assert.equal(db.prepare(`SELECT ${G.SHELF_SQL} AS s FROM (SELECT ? AS shelf, ? AS category) g`).get(g.shelf, g.category).s, want);
  }
});

test('the migration backfills an older database, and a re-import writes the shelf from the JSON', async () => {
  q.run("UPDATE games SET shelf='' WHERE slug IN ('sum-racer', 'ring-rumble')");
  const mig = (await import('../../server/db.js')).MIGRATIONS;
  if (mig) {
    const step = mig.find(m => m[0] === '0062_game_shelf'); assert.ok(step);
    step[2](db);
    // an older database then runs the later shelf migrations too (a new Learn game gets its own, never an edit to 0062)
    for (const m of mig.filter(m => m[0] > '0062' && /_shelf$/.test(m[0]))) { if (m[1]) db.exec(m[1]); if (m[2]) m[2](db); }
    assert.equal(G.getGameBySlug('sum-spotter').shelf, 'learn', '0082 puts Sum Spotter on Learn');
    assert.equal(G.getGameBySlug('sum-racer').shelf, 'learn'); assert.equal(G.getGameBySlug('ring-rumble').shelf, 'play');
  }
  q.run("UPDATE games SET shelf='' WHERE slug='word-trail'");
  const { importGame } = await import('../../scripts/import-game.js');
  importGame('seed-games/word-trail.html', 'seed-games/word-trail.json', G.getGameBySlug('word-trail').owner_id);
  assert.equal(G.getGameBySlug('word-trail').shelf, 'learn');
});

// ---------------------------------------------------------------- one Learn page (Play and Learn merged)
/** The game slugs in the topic sections of a Learn page, in order. */
const topicSlugs = s => [...s.matchAll(/id="(sec-[a-z]+)-h"/g)].map(m => m[1]).flatMap(id => slugsIn(section(s, id)));
test('Learn (\'/\' and /learn) is every open game by topic, from both shelves, each once; no hero or Popular rows; /play answers 301 to /learn', async () => {
  for (const [u, path] of [[null, '/'], [kid, '/'], [null, '/learn'], [kid, '/learn'], [mum, '/learn'], [pupil, '/learn'], [boss, '/']]) {
    const s = (await get(path, u)).text;
    const who = `${path} ${u ? u.username : 'signed out'}`;
    const listed = topicSlugs(s);
    assert.equal(new Set(listed).size, listed.length, `${who}: each game once`);
    for (const x of PLAY) assert.ok(listed.includes(x), `${who}: ${x} (Play shelf)`);
    for (const x of openLearn) assert.ok(listed.includes(x), `${who}: ${x} (Learn shelf)`);
    assert.equal(hero(s), undefined, `${who}: no hero (it would show one game twice)`);
    for (const id of ['featured', 'popular', 'rated', 'new', 'two', 'from-learn', 'keep', 'playing']) assert.doesNotMatch(s, new RegExp(`id="${id}-h"`), `${who}: no #${id}`);
    assert.deepEqual(slugsIn(section(s, 'sec-live')).sort(), Object.keys(LIVE_GAMES).sort(), `${who}: the live modes under Live class games`);
    assert.deepEqual(slugsIn(section(s, 'sec-tools')).sort(), ['popcorn-hush', 'quiet-bounce', 'remis-quiet-meadow'], `${who}: the noise meters under Classroom tools`);
  }
  for (const u of [null, kid, mum, teacher]) {
    const r = await get('/play?subject=math', u);
    assert.equal(r.status, 301); assert.equal(r.location, '/learn?subject=math');
  }
  // Remi is still in search.
  assert.match((await get('/search?q=quiet', null)).text, /href="\/g\/remis-quiet-meadow"/);
});

test('a game page: the Learn tab is current and Back goes to Learn, for a game from either shelf', async () => {
  for (const slug of ['jungle-cup', 'sum-racer', 'crossword']) for (const u of [kid, null]) {
    const s = (await get(`/g/${slug}`, u)).text;
    assert.match(s, /<a class="backlink" href="\/learn"><span class="flip" aria-hidden="true">←<\/span> Learn<\/a>/, slug);
    assert.match(s, /<a class="tab" href="\/learn" aria-current="page">/, `${slug}: the Learn tab`);
    assert.doesNotMatch(s, /href="\/play"/, `${slug}: nothing links to the old /play`);
  }
});

test('players\' games (any kind) are on Learn under Games by players, signed in only; never a child\'s name signed out', async () => {
  const mk = (title, category) => {
    const g = G.createGame(kid.id, { title, description: 'A test game.', icon: '🧪', cover: 'mint', category });
    const v = G.addVersion(g.id, '<!doctype html><p>hi</p>', { createdBy: kid.id });
    q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, plays=999999 WHERE id=?", v.id, g.id);
    return G.getGame(g.id);
  };
  const quiz = mk('Shelf Quiz Builder', 'learning'), arc = mk('Shelf Arcade Builder', 'arcade'), word = mk('Shelf Word Builder', 'words');
  assert.equal(G.shelfOf(quiz), 'learn'); assert.equal(G.shelfOf(arc), 'play'); assert.equal(G.shelfOf(word), 'learn', 'the shelf rule stays (search and the subject pages use it)');
  const pal = auth.createUser({ username: 'ShelfPal', password: 'rainbow-77' });
  const learn = (await get('/learn', pal)).text;
  for (const g of [quiz, arc, word]) assert.ok(slugsIn(section(learn, 'players')).includes(g.slug), `${g.title}: by players, signed in`);
  assert.match(section(learn, 'players'), /<a class="more" href="\/search\?sort=popular" rel="nofollow">See all<\/a>/, 'the rest are one tap away in search');
  assert.ok(!topicSlugs(learn).includes(arc.slug), 'players\' games are never in the official topic sections');
  for (const out of [(await get('/learn', null)).text, (await get('/', null)).text]) {
    assert.ok(![quiz, arc, word].some(g => slugsIn(out).includes(g.slug)), 'never on the signed-out (indexed) page');
    assert.doesNotMatch(out, /ShelfKid|href="\/u\//, 'no child\'s name signed out');
  }
  assert.match((await get(`/search?q=Shelf+Quiz`, kid)).text, new RegExp(`href="/g/${quiz.slug}"`), 'still in search');
  q.run("UPDATE games SET status='deleted' WHERE id IN (?, ?, ?)", quiz.id, arc.id, word.id);
});

test('course-owned games are never listed on Learn (topics, grid, favorites), for any role: a real course game and a course_only fixture', async () => {
  const { courseOwned } = await import('../../server/services/course-catalog.js');
  const real = COURSE_GAME_SLUGS.find(x => G.getGameBySlug(x));
  assert.ok(real, 'a course game from the course data');
  assert.ok(courseOwned(G.getGameBySlug(real)));
  // The fixture: an official game flagged course_only (reached only through a course), favorited by the kid, as is the real one.
  const fx = G.getGameBySlug('crossword');
  q.run('UPDATE games SET course_only=1 WHERE id=?', fx.id);
  for (const g of [fx, G.getGameBySlug(real)]) q.run('INSERT OR IGNORE INTO likes(game_id, user_id, created_at) VALUES (?,?,?)', g.id, kid.id, Date.now());
  try {
    for (const u of [null, kid, pupil, teacher, head, mum, boss, guest]) {
      for (const p of ['/learn', '/learn?how=solo', '/learn?subject=words', '/learn?subject=code', '/learn?how=live', '/learn?grade=3', ...(u === null || u === kid || u === boss || u === guest ? ['/'] : [])]) {
        const r = await get(p, u);
        if (r.status !== 200) continue;
        const main = r.text.slice(r.text.indexOf('<main'), r.text.indexOf('</main>'));
        for (const slug of [real, 'crossword']) {
          assert.ok(!main.includes(`href="/g/${slug}"`) && !main.includes(`href="/play/${slug}"`), `${slug} listed on ${p} for ${u ? u.username || 'a guest' : 'signed out'}`);
        }
      }
    }
    assert.ok(!(await get('/learn', kid)).text.includes('id="favorites-h"') || !slugsIn(section((await get('/learn', kid)).text, 'favorites')).some(x => x === real || x === 'crossword'), 'not even as a favorite');
  } finally {
    q.run('UPDATE games SET course_only=0 WHERE id=?', fx.id);
    q.run('DELETE FROM likes WHERE user_id=?', kid.id);
  }
  assert.ok(topicSlugs((await get('/learn', kid)).text).includes('crossword'), 'back once the flag is off');
});

// ---------------------------------------------------------------- Learn
const openLearn = LEARN.filter(s => !COURSE_GAME_SLUGS.includes(s) && !G.getGameBySlug(s).course_only);
test('Learn: the filtered grid gives each game its subject and grades; courses first; the join door; the subject and age pages', async () => {
  const s = (await get('/learn', kid)).text;
  // The grid (a filter chosen): the same "Subject · Grades" line on every game with a Learn subject.
  const solo = (await get('/learn?how=solo', kid)).text;
  assert.match(solo, /href="\/g\/sum-racer"[^>]*>[\s\S]*?<div class="by gmeta">Math · Grades 1–5<\/div>/);
  assert.match(solo, /href="\/g\/atlas-quest"[^>]*>[\s\S]*?<div class="by gmeta">Maps · Grades 3–8<\/div>/);
  assert.match((await get('/learn?how=live', kid)).text, /href="\/g\/quest-race"[^>]*>[\s\S]*?<div class="by gmeta">Any subject · Grades K–8<\/div>/);
  // Courses: compact cards (the whole head opens the course, the units behind a tap); "Courses" until a kid begins one.
  assert.match(s, /<h2 id="courses-h">📚 Courses<\/h2>/); assert.match(s, /id="course-cs-quest-go"/);
  assert.match(s, /<a class="course-head" href="\/courses\/cs-quest">/);
  assert.match(s, /<details class="course-units"><summary>See the 4 games<\/summary>/);
  assert.ok(s.indexOf('id="course-cs-quest-go"') < s.indexOf('id="sec-'), 'courses before the games');
  // Topic chips jump to each section's heading; the filters are one quiet line that opens (closed by default).
  assert.match(s, /<nav class="chips scroll topic-chips" aria-label="Topics">[\s\S]*?href="#sec-math-h"/);
  assert.match(s, /<details class="learn-filterbox">\s*<summary>/, 'the filters closed until asked for');
  assert.ok(s.indexOf('topic-chips') < s.indexOf('learn-filterbox') && s.indexOf('learn-filterbox') < s.indexOf('id="sec-'), 'chips, filters, then the games');
  // A kid who is not in a class: the topics in their order (Live class games after Geography), then the join door.
  assert.ok(s.indexOf('id="sec-math-h"') < s.indexOf('id="sec-live-h"'), 'learning topics before live games (not in a class)');
  assert.ok(s.indexOf('id="sec-live-h"') < s.indexOf('id="learn-join"'), 'the join door under the games');
  assert.match(s, /id="learn-join" href="\/join"|href="\/join" id="learn-join"/);
  assert.match(s, /Got a game code from your teacher\?/);
  assert.doesNotMatch(s, /id="learn-library"|href="\/library"/, 'no Books door: Read is its own tab');
  // A course card has the same "Subject · Grades" line as the game cards (and its description without the grades).
  assert.match(s, /<p>Computer science in four games<\/p><p class="gmeta course-meta">Coding · Grades 3–8<\/p>/);
  // Subject pages in chip order, named like their chip; brain breaks and make a game (Build) apart, under "Also on Oomba".
  const subj = section(s, 'subjects'), also = s.slice(s.indexOf('id="also"'));
  assert.deepEqual([...subj.matchAll(/href="\/learn\/([a-z-]+)"/g)].map(m => m[1]), L.SUBJECTS.filter(x => x.hub).map(x => x.hub));
  assert.match(subj, /Thinking: Chess and strategy games/); assert.match(subj, /Coding: Computer science games/);
  assert.doesNotMatch(subj, /brain-break-games|make-a-game/);
  assert.match(also, /<h2 id="also-h">Also on Oomba<\/h2>/); assert.match(also, /href="\/learn\/brain-break-games"/); assert.match(also, /href="\/learn\/make-a-game"/);
  // A kid's Learn ends at the join door: no age pages, no marketing links for teachers and parents.
  const main = s.slice(s.indexOf('<main'), s.indexOf('</main>'));
  assert.doesNotMatch(main, /id="ages"|id="who"|href="\/teachers"|href="\/parents"/, 'visitor content is for the signed out (the footer keeps its links)');
  assert.ok(s.indexOf('id="learn-join"') > s.indexOf('id="also"'), 'the join door ends a kid\'s Learn');
  C.setBand(kid, C.getCourse('cs-quest'), '1b');
  assert.match((await get('/learn', kid)).text, /<h2 id="courses-h">📚 My courses<\/h2>/, 'My courses once begun');
  // A student in a class: live class games first. A grown-up: Join is in their top bar, not a kid's door on Learn.
  const st = (await get('/learn', pupil)).text;
  assert.doesNotMatch(st, /id="ages"|id="who"/, 'nor a student\'s');
  for (const u of [teacher, mum]) assert.match((await get('/learn', u)).text, /id="ages"[\s\S]*id="who"/, 'staff and grown-ups keep them');
  assert.ok(st.indexOf('id="sec-live-h"') > 0 && st.indexOf('id="sec-live-h"') < st.indexOf('id="sec-math-h"'), 'live first in a class');
  assert.ok((await get('/learn?how=solo', pupil)).text.indexOf('id="learn-games"') > 0);
  const stGrid = (await get('/learn?subject=math', pupil)).text;
  assert.ok(stGrid.indexOf('id="live-games"') > 0 && stGrid.indexOf('id="live-games"') < stGrid.indexOf('id="learn-games"'), 'live first in a class, filtered too');
  assert.doesNotMatch((await get('/learn', mum)).text, /id="learn-join"/);
  // Signed out: the indexed page keeps its heading, lead, structured data, every subject and age page; "Courses".
  const out = await get('/learn', null);
  assert.match(out.text, /<h1 id="lp-h1">Learning games by subject and age<\/h1>/);
  assert.match(out.text, /<meta name="robots" content="index/); assert.match(out.text, /<link rel="canonical" href="[^"]*\/learn">/);
  assert.match(out.text, /"@type":"CollectionPage"/);
  for (const h of L.HUBS) assert.match(out.text, new RegExp(`href="/learn/${h.slug}"`), h.slug);
  for (const a of L.AGES) assert.match(out.text, new RegExp(`href="/learn/${a.slug}"`), a.slug);
  assert.match(out.text, /id="who"[\s\S]*href="\/teachers"/);
  assert.ok(out.text.indexOf('id="learn-join"') < out.text.indexOf('id="subjects"'), 'signed out, the join door comes under the games');
  assert.match(out.text, /<h2 id="courses-h">📚 Courses<\/h2>/);
  assert.ok(slugsIn(out.text).every(x => G.getGameBySlug(x).source === 'seed'), 'only official games signed out');
});

test('Learn filters: plain links (no script needed), exactly the games that fit, noindex, a link to the subject page', async () => {
  const math = (await get('/learn?subject=math', kid)).text;
  const listed = [...slugsIn(section(math, 'live-games')), ...slugsIn(section(math, 'learn-games'))];
  // Every open game whose topic (or, for a live game, Learn subject) is Math: Play's Math section and Learn's Math games.
  const SUBJ = { math: 'math', reading: 'words', geography: 'maps', strategy: 'thinking' };
  const subjOf = x => SUBJ[topicOf(G.getGameBySlug(x))] || (L.SHELF_INFO[x] || {}).subject;
  assert.deepEqual(listed.sort(), [...openLearn, ...PLAY].filter(x => subjOf(x) === 'math').sort());
  assert.ok(listed.includes('sudoku') || !G.getGameBySlug('sudoku'), 'Sudoku is Math, as on its topic');
  assert.match(math, /<details class="learn-filterbox" open>/, 'a filter chosen: the filters stay open');
  assert.match(math, /<p class="learn-clear"><a href="\/learn">[\s\S]*?Show all games<\/a>/, 'and a way back to the topics');
  assert.doesNotMatch(math, /topic-chips|id="sec-/, 'the filtered grid, not the topics (one navigation at a time)');
  assert.match(math, /<a class="chip on" href="\/learn\?subject=math#filters" rel="nofollow" aria-current="true">/);
  assert.match(math, /<a href="\/learn\/math-games">More about Math games/);
  assert.match(math, /<meta name="robots" content="noindex/);
  assert.match(math, /id="course-number-quest-go"/); assert.doesNotMatch(math, /id="course-cs-quest-go"/, 'only the math course');
  // A grade alone narrows the topics (a game with no grades fits every grade).
  const g2 = (await get('/learn?grade=K', kid)).text;
  assert.ok(topicSlugs(g2).length > 3);
  for (const x of topicSlugs(g2)) assert.ok(!L.SHELF_INFO[x] || L.SHELF_INFO[x].from === 0, `${x} fits Kindergarten`);
  assert.ok(!topicSlugs(g2).includes('atlas-quest'), 'Atlas Quest (3–8) is not for Kindergarten');
  assert.match(g2, /<option value="K" selected>Kindergarten<\/option>/);
  const two = (await get('/learn?how=two', kid)).text;
  assert.ok(slugsIn(section(two, 'learn-games')).includes('tug-of-math')); assert.doesNotMatch(two, /id="live-games"/);
  assert.ok(slugsIn(section(two, 'learn-games')).every(x => L.TWO_PLAYER.includes(x) || G.getGameBySlug(x).players_max >= 2));
  const live = (await get('/learn?how=live', kid)).text;
  assert.deepEqual(slugsIn(live).filter(x => LEARN.includes(x)).sort(), Object.keys(LIVE_GAMES).sort());
  const none = (await get('/learn?subject=music&grade=K', kid)).text;
  assert.match(none, /No games match these filters yet\./);
  // Unknown values are ignored, never echoed.
  const bad = (await get('/learn?subject=%3Cb%3E&grade=99&how=x', kid)).text;
  assert.doesNotMatch(bad, /<b>/); assert.match(bad, /<a class="chip on" href="\/learn#filters"/);
});

test('Learn: a student starts on their roster grade and can clear it (grade=any); kids and staff start on Any grade', async () => {
  const g4 = SC.createSchoolAccount(head, school.id, { rosterName: 'Gina Four', grade: 'Grade 4' }).user;
  const s = (await get('/learn', g4)).text;
  assert.match(s, /<option value="4" selected>Grade 4<\/option>/);
  assert.ok(topicSlugs(s).length > 3);
  for (const x of topicSlugs(s)) assert.ok(!L.SHELF_INFO[x] || (L.SHELF_INFO[x].from <= 4 && L.SHELF_INFO[x].to >= 4), `${x} fits grade 4`);
  assert.match(s, /<details class="learn-filterbox">\s*<summary>[\s\S]*?<span class="lf-now">Grade 4<\/span>/, 'the closed filters say the grade picked');
  assert.match(s, /<option value="any">Any grade<\/option>/);
  assert.match(s, /<a class="chip" href="\/learn\?subject=math&amp;grade=4#filters"|href="\/learn\?subject=math&grade=4#filters"/);
  const any = (await get('/learn?grade=any', g4)).text;
  assert.match(any, /<option value="any" selected>Any grade<\/option>/);
  assert.match(any, /href="\/learn\?subject=math&amp;grade=any#filters"|href="\/learn\?subject=math&grade=any#filters"/, 'the choice stays as you filter');
  assert.deepEqual(topicSlugs(any).sort(), topicSlugs((await get('/learn', kid)).text).sort());
  for (const u of [kid, teacher]) assert.match((await get('/learn', u)).text, /<option value="" selected>Any grade<\/option>/);
});

test('staff see Assign, Host live and Try it on Learn; kids, students, grown-ups, guests and the signed out never do', async () => {
  for (const u of [teacher, head]) {
    const s = (await get('/learn', u)).text;
    assert.match(s, /The same library your students see/);
    assert.match(s, /href="\/teach\/assign\?game=sum-racer">📌 Assign<\/a>/);
    assert.match(s, /href="\/live\?mode=quest-race">📡 Host live<\/a>/);
    assert.doesNotMatch(s, /href="\/teach\/assign\?game=quest-race"/, 'a live mode is hosted, not assigned');
    assert.match(s, /<a class="lcard-try" href="\/play\/sum-racer">▶ Try it<\/a>/);
    // One main button per card (Host live for a live mode, else Assign), Try it as a small link.
    for (const acts of s.match(/<div class="lcard-acts">[\s\S]*?<\/div>/g)) assert.equal((acts.match(/class="btn /g) || []).length, 1, acts);
    assert.match(s, /id="course-cs-quest-assign" href="\/teach\/cs-quest"|href="\/teach\/cs-quest" id="course-cs-quest-assign"/);
    assert.match(s, /href="\/teachers\/cs-quest">Teacher guide<\/a>/);
    // Number Quest has no assign page yet: its guide only, never an Assign button that cannot assign.
    assert.doesNotMatch(s, /id="course-number-quest-assign"/); assert.match(s, /href="\/teachers\/number-quest">Teacher guide<\/a>/);
    assert.doesNotMatch(s, /id="learn-join"/, 'staff host; they are not given codes');
  }
  for (const u of [kid, pupil, mum, guest, null]) {
    const s = (await get('/learn', u)).text;
    assert.doesNotMatch(s, /\/teach\/assign|\/live\?mode=|lcard-acts|Teacher guide|course-[a-z-]+-assign/, u ? u.username || 'guest' : 'signed out');
  }
});

test('no prices on Learn (or \'/\', or Read), for anyone', async () => {
  const PRICE = /\$\s?\d|\d\.\d\d\b|\bUSD\b|€|£\s?\d|\/mo\b|a month\b|per (month|year)/i;
  for (const u of [null, kid, pupil, teacher, mum]) for (const p of ['/', '/learn', '/learn?subject=math', '/read']) {
    const r = await get(p, u); if (r.status !== 200) continue;
    // A standard's published statement, which staff see as the tooltip of its code, is not the site's words: the
    // grade 2 time standard (2.MD.C.7, Kitchen Rush) reads "days in a month". Everything else on the page is checked.
    const page = r.text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/(<span class="std-code"[^>]*?) title="[^"]*"/g, '$1');
    assert.doesNotMatch(page, PRICE, `${p} ${u ? u.username : 'signed out'}`);
  }
});

// ---------------------------------------------------------------- Assign a game
test('assign a game: a teacher assigns Sum Racer to their class; the student gets the lesson; nobody else can', async () => {
  const cid = klass.id;
  const page = await get('/teach/assign?game=sum-racer', teacher);
  assert.equal(page.status, 200);
  assert.match(page.text, /<h1>📌 Assign Sum Racer<\/h1>/);
  assert.match(page.text, new RegExp(`<option value="${cid}">Shelf 4B</option>`));
  for (const u of [kid, pupil, mum, null]) assert.notEqual((await get('/teach/assign?game=sum-racer', u)).status, 200, u ? u.username : 'signed out');
  const r = await post('/api/teach/assign-game', teacher, { game: 'sum-racer', classId: cid, dueAt: '2030-01-15' });
  assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.redirect, `/class/${cid}`);
  const cl = q.get("SELECT cl.*, l.title FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id WHERE cl.class_id=? AND cl.removed_at IS NULL", cid);
  assert.equal(cl.title, 'Sum Racer'); assert.ok(cl.due_at);
  const step = q.get('SELECT kind, game_id FROM lesson_steps WHERE lesson_id=?', cl.lesson_id);
  assert.equal(step.kind, 'game'); assert.equal(step.game_id, G.getGameBySlug('sum-racer').id);
  assert.match((await get(`/class/${cid}`, pupil)).text, /Sum Racer/, 'the student sees it');
  // Again: refused, no second lesson.
  const again = await post('/api/teach/assign-game', teacher, { game: 'sum-racer', classId: cid });
  assert.equal(again.status, 400); assert.match(again.json.error, /Shelf 4B/);
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id=?', cid).n, 1);
  // A live mode is hosted, not assigned; a kid, a student and a grown-up cannot assign; another school's class is not theirs.
  assert.equal((await post('/api/teach/assign-game', teacher, { game: 'quest-race', classId: cid })).status, 400);
  for (const u of [kid, pupil, mum]) assert.equal((await post('/api/teach/assign-game', u, { game: 'word-hunt', classId: cid })).status, 404, u.username);
  const otherHead = SC.createSchoolAccount(boss, other.id, { rosterName: 'Ms Other', role: 'admin' }).user;
  const ocid = SC.createClass(otherHead, other.id, { name: 'Other 1' }).class.id;
  assert.equal((await post('/api/teach/assign-game', teacher, { game: 'word-hunt', classId: ocid })).status, 404);
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id=?', ocid).n, 0);
});
