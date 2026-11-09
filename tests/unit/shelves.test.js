// Play and Learn (docs/decisions.md "Play and Learn"): one game library on two shelves. Every official game's shelf
// (seed JSON, migration, import), the rule for players' games (SHELF_SQL / shelfOf), the Play page ('/' and /play: no
// Learn game in its rails, no class tool in its hero or featured row, a "From Learn" shelf), and the Learn tab (/learn:
// every open Learn game with its subject and grades, filters that work as plain links, the SEO page kept for search
// engines, no player's game or name signed out, staff-only Assign and Host, and assigning a game to a class).
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

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (path, u, body) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
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
const PLAY = ['hero-of-sunvale', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'brick-drop', 'munch-maze', 'swish-flick', 'beat-lanes', 'would-you-rather', 'gulp-city', 'remis-quiet-meadow', 'jungle-cup'];
const LEARN = ['shark-plank', 'castle-clash', 'word-hunt', 'sum-racer', 'word-peek', 'loop-lab', 'code-isle', 'quest-race', 'question-battle', 'brain-board', 'atlas-quest', 'would-you-rather-live', 'atlas-quest-live',
  'packet-post', 'trick-inbox', 'inside-the-machine', 'data-detective', 'robo-route', 'escape-the-post-office', 'fraction-factory', 'tug-of-math', 'doodle-hoot', 'word-trail'];
const seedMeta = fs.readdirSync('seed-games').filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(`seed-games/${f}`, 'utf8')));

test('every launch game is on exactly one shelf: 13 on Play, 23 on Learn, as designed; the database agrees', () => {
  assert.equal(seedMeta.length, 36);
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
    const step = mig.find(m => m[0] === '0060_game_shelf'); assert.ok(step);
    step[2](db);
    assert.equal(G.getGameBySlug('sum-racer').shelf, 'learn'); assert.equal(G.getGameBySlug('ring-rumble').shelf, 'play');
  }
  q.run("UPDATE games SET shelf='' WHERE slug='word-trail'");
  const { importGame } = await import('../../scripts/import-game.js');
  importGame('seed-games/word-trail.html', 'seed-games/word-trail.json', G.getGameBySlug('word-trail').owner_id);
  assert.equal(G.getGameBySlug('word-trail').shelf, 'learn');
});

// ---------------------------------------------------------------- Play
test('Play (\'/\' and /play): only Play games in its rails, Jungle Cup the hero, no class tool in hero or featured, From Learn shelf', async () => {
  for (const [u, path] of [[null, '/'], [kid, '/'], [null, '/play'], [teacher, '/play'], [mum, '/play'], [pupil, '/play']]) {
    const s = (await get(path, u)).text;
    assert.equal(hero(s), 'Jungle Cup', `${path} ${u ? u.username : 'signed out'}`);
    for (const id of ['featured', 'popular', 'rated', 'new', 'two', ...['arcade', 'sports', 'puzzle', 'board', 'adventure', 'music', 'silly'].map(k => `cat-${k}`)]) {
      for (const slug of slugsIn(section(s, id))) assert.ok(!LEARN.includes(slug), `${path}: ${slug} (Learn) in #${id}`);
    }
    assert.ok(slugsIn(section(s, 'featured')).length > 3, 'a featured row');
    assert.ok(!slugsIn(section(s, 'featured')).includes('remis-quiet-meadow'), 'the noise meter is not featured fun');
    assert.doesNotMatch(s, /id="courses-h"/, 'no course row on Play');
    assert.doesNotMatch(s, /id="cat-learning"|id="cat-words"/, 'no learning rails on Play');
    assert.deepEqual(slugsIn(section(s, 'from-learn')), L.LEARN_FUN, 'From Learn: fun ones');
    assert.match(section(s, 'from-learn'), /<a class="more" href="\/learn">See all<\/a>/);
    // The hero is not repeated in the rails right under it.
    for (const id of ['featured', 'popular', 'rated', 'new']) assert.ok(!slugsIn(section(s, id)).includes('jungle-cup'), `no hero in #${id}`);
    const two = slugsIn(section(s, 'two'));
    assert.ok(two.length && two.every(x => G.getGameBySlug(x).players_max >= 2), 'two-player row');
    assert.match(s, /<a class="chip" role="listitem" href="#two">/, 'the 2 players chip jumps to the row');
  }
  // Remi is still in search.
  assert.match((await get('/search?q=quiet', null)).text, /href="\/g\/remis-quiet-meadow"/);
});

test('Play: Keep playing lists what this player opened last (Play shelf), nothing for the signed out', async () => {
  const gid = slug => G.getGameBySlug(slug).id;
  q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', 'p1', gid('brick-drop'), kid.id, Date.now() - 5000);
  q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', 'p2', gid('swish-flick'), kid.id, Date.now() - 1000);
  q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', 'p3', gid('sum-racer'), kid.id, Date.now());
  const s = (await get('/', kid)).text;
  assert.deepEqual(slugsIn(section(s, 'keep')), ['swish-flick', 'brick-drop']);
  assert.doesNotMatch((await get('/', null)).text, /id="keep"/);
});

test('a player\'s Learning game leaves Play for Learn (signed in only); other players\' games stay on Play', async () => {
  const mk = (title, category) => {
    const g = G.createGame(kid.id, { title, description: 'A test game.', icon: '🧪', cover: 'mint', category });
    const v = G.addVersion(g.id, '<!doctype html><p>hi</p>', { createdBy: kid.id });
    q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, plays=999999 WHERE id=?", v.id, g.id);
    return G.getGame(g.id);
  };
  const quiz = mk('Shelf Quiz Builder', 'learning'), arc = mk('Shelf Arcade Builder', 'arcade'), word = mk('Shelf Word Builder', 'words');
  const pal = auth.createUser({ username: 'ShelfPal', password: 'rainbow-77' });
  const play = (await get('/', pal)).text;
  assert.ok(slugsIn(section(play, 'popular')).includes(arc.slug)); assert.ok(!slugsIn(play).includes(quiz.slug));
  assert.ok(!slugsIn(play).includes(word.slug), 'a Words game is on Learn (Play has no Words chip or row)');
  const learn = (await get('/learn', pal)).text;
  assert.ok(slugsIn(section(learn, 'learn-players')).includes(quiz.slug), 'by players, signed in');
  assert.ok(slugsIn(section(learn, 'learn-players')).includes(word.slug), 'a player\'s Words game too');
  assert.match(learn, /<a class="more" href="\/search\?cat=learning" rel="nofollow">See all<\/a>/, 'the rest are one tap away in search');
  const out = (await get('/learn', null)).text;
  assert.ok(!slugsIn(out).includes(quiz.slug), 'never on the signed-out (indexed) page');
  assert.doesNotMatch(out, /ShelfKid|href="\/u\//, 'no child\'s name signed out');
  assert.match((await get(`/search?q=Shelf+Quiz`, kid)).text, new RegExp(`href="/g/${quiz.slug}"`), 'still in search');
  q.run("UPDATE games SET status='deleted' WHERE id IN (?, ?, ?)", quiz.id, arc.id, word.id);
});

// ---------------------------------------------------------------- Learn
const openLearn = LEARN.filter(s => !COURSE_GAME_SLUGS.includes(s) && !G.getGameBySlug(s).course_only);
test('Learn lists every open Learn game (course games through their course) with its subject and grades; courses; the join door', async () => {
  const s = (await get('/learn', kid)).text;
  const listed = [...slugsIn(section(s, 'live-games')), ...slugsIn(section(s, 'learn-games'))];
  assert.deepEqual([...listed].sort(), [...openLearn].sort());
  assert.deepEqual(slugsIn(section(s, 'live-games')).sort(), Object.keys(LIVE_GAMES).sort(), 'the live modes in their own section');
  assert.match(s, /href="\/g\/sum-racer"[^>]*>[\s\S]*?<div class="by gmeta">Math · Grades 1–5<\/div>/);
  assert.match(s, /href="\/g\/atlas-quest"[^>]*>[\s\S]*?<div class="by gmeta">Maps · Grades 3–8<\/div>/);
  assert.match(s, /href="\/g\/quest-race"[^>]*>[\s\S]*?<div class="by gmeta">Any subject · Grades K–8<\/div>/);
  // Courses: compact cards (the whole head opens the course, the units behind a tap); "Courses" until a kid begins one.
  assert.match(s, /<h2 id="courses-h">📚 Courses<\/h2>/); assert.match(s, /id="course-cs-quest-go"/);
  assert.match(s, /<a class="course-head" href="\/courses\/cs-quest">/);
  assert.match(s, /<details class="course-units"><summary>See the 4 units<\/summary>/);
  assert.ok(s.indexOf('id="course-cs-quest-go"') < s.indexOf('id="learn-games"'), 'courses before the games');
  // A kid who is not in a class: the learning games first, then the live class games, then the join door.
  assert.ok(s.indexOf('id="learn-games"') < s.indexOf('id="live-games"'), 'learning games before live games (not in a class)');
  assert.ok(s.indexOf('id="live-games"') < s.indexOf('id="learn-join"'), 'the join door under the games');
  assert.match(s, /id="learn-join" href="\/join"|href="\/join" id="learn-join"/);
  assert.match(s, /Got a game code from your teacher\?/);
  // A course card has the same "Subject · Grades" line as the game cards (and its description without the grades).
  assert.match(s, /<p>Computer science in four games<\/p><p class="gmeta course-meta">Coding · Grades 3–8<\/p>/);
  // Subject pages in chip order, named like their chip; brain breaks (Play) and make a game (Build) apart, under "Also on Oomba".
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
  assert.ok(st.indexOf('id="live-games"') > 0 && st.indexOf('id="live-games"') < st.indexOf('id="learn-games"'), 'live first in a class');
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
  assert.deepEqual(listed.sort(), openLearn.filter(s => L.SHELF_INFO[s].subject === 'math').sort());
  assert.match(math, /<a class="chip on" href="\/learn\?subject=math#filters" rel="nofollow" aria-current="true">/);
  assert.match(math, /<a href="\/learn\/math-games">More about Math games/);
  assert.match(math, /<meta name="robots" content="noindex/);
  assert.match(math, /id="course-number-quest-go"/); assert.doesNotMatch(math, /id="course-cs-quest-go"/, 'only the math course');
  const g2 = (await get('/learn?grade=K', kid)).text;
  for (const x of slugsIn(section(g2, 'learn-games'))) assert.equal(L.SHELF_INFO[x].from, 0, `${x} fits Kindergarten`);
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
  for (const x of slugsIn(section(s, 'learn-games'))) assert.ok(L.SHELF_INFO[x].from <= 4 && L.SHELF_INFO[x].to >= 4, `${x} fits grade 4`);
  assert.match(s, /<option value="any">Any grade<\/option>/);
  assert.match(s, /<a class="chip" href="\/learn\?subject=math&amp;grade=4#filters"|href="\/learn\?subject=math&grade=4#filters"/);
  const any = (await get('/learn?grade=any', g4)).text;
  assert.match(any, /<option value="any" selected>Any grade<\/option>/);
  assert.match(any, /href="\/learn\?subject=math&amp;grade=any#filters"|href="\/learn\?subject=math&grade=any#filters"/, 'the choice stays as you filter');
  assert.deepEqual(slugsIn(section(any, 'learn-games')).sort(), slugsIn(section((await get('/learn', kid)).text, 'learn-games')).sort());
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

test('no prices on Play or Learn, for anyone', async () => {
  const PRICE = /\$\s?\d|\d\.\d\d\b|\bUSD\b|€|£\s?\d|\/mo\b|a month\b|per (month|year)/i;
  for (const u of [null, kid, pupil, teacher, mum]) for (const p of ['/', '/play', '/learn']) {
    const r = await get(p, u); if (r.status !== 200) continue;
    assert.doesNotMatch(r.text.replace(/<script[\s\S]*?<\/script>/g, ''), PRICE, `${p} ${u ? u.username : 'signed out'}`);
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
