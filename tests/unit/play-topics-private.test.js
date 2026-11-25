// Play by topic, My favorites, and no public games (docs/decisions.md "Play by topic, My favorites" and "No public games:
// share with connections and classes"; Play is the Learn page now: "Learn and Read"). With ARCADE and PUBLIC_GAMES off
// (the site's defaults): Learn is laid out by
// topic (Math, Reading and words, Geography, Live class games, Strategy, Classroom tools) with no Popular / Top rated /
// New rows, each kept game once; a signed-in player's favorites come first; nobody can share a game with everyone (the
// server refuses 'public' and 'school' and the Studio doesn't offer them); a player's game that was public (or shared
// with the school) before is on no list for
// anyone else and opens for its maker, their connections and the people in a class with them, never a stranger or a
// signed-out visitor. PUBLIC_GAMES=1 brings back the old rule.
process.env.ARCADE = '0'; process.env.COURSES = '0'; process.env.PUBLIC_GAMES = '0';
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const G = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/family.js');
const pub = await import('../../server/services/publish.js');
const { studioState } = await import('../../server/routes/studio.js');
const { topicOf, focusSections } = await import('../../server/routes/discover.js');
const { sitemapEntries } = await import('../../server/routes/seo.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { deicon } = await import('../support/deicon.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => { resetLimits(); config.arcade = false; config.courses = false; config.publicGames = false; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const req = async (path, u, { method = 'GET', body } = {}) => {
  const headers = { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}), ...(body ? { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' } : {}) };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = deicon(await r.text()); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const cardSlugs = s => [...s.matchAll(/class="gcard[^"]*" href="\/g\/([a-z0-9-]+)"/g)].map(m => m[1]);
const section = (s, id) => { const i = s.indexOf(`id="${id}-h"`); if (i < 0) return ''; const j = s.indexOf('<section', i); return s.slice(i, j < 0 ? undefined : j); };

const TOPICS = {
  'sec-math': ['algebra-builder', 'arithmetic-lab', 'sudoku'],
  'sec-reading': ['crossword', 'mistake-hunt', 'word-hunt', 'word-peek'],
  'sec-geography': ['atlas-quest'],
  'sec-live': ['brain-board', 'question-battle', 'tug-of-math', 'doodle-hoot', 'would-you-rather-live', 'atlas-quest-live'],
  'sec-strategy': ['castle-clash'],
  'sec-tools': ['popcorn-hush', 'quiet-bounce', 'remis-quiet-meadow'],
};
const KEPT = Object.values(TOPICS).flat();

// ---------------------------------------------------------------- people
let n = 0;
const mk = (p, o = {}) => auth.createUser({ username: `${p}${++n}`, password: 'secret123', ...o });
const boss = mk('PtBoss', { role: 'admin' });
const school = S.createSchool(boss, { name: 'Topic School' }).school;
const teacher = auth.getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Topic', role: 'teacher' }).user.id);
const klass = S.createClass(teacher, school.id, { name: 'Topic 5A' }).class;
const student = (name, inClass = true) => { const u = S.createSchoolAccount(teacher, school.id, { rosterName: name }).user; if (inClass) assert.ok(S.addToClass(teacher, klass.id, u.id).ok); return auth.getUser(u.id); };
const maker = student('Mia Maker'), classmate = student('Cal Classmate'), schoolmate = student('Sam Elsewhere', false);
const friend = mk('PtFriend'), stranger = mk('PtStranger');
const friendsWith = (a, b) => { for (const [x, y] of [[a, b], [b, a]]) q.run("INSERT OR REPLACE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?,'accepted',?)", x.id, y.id, now()); };
friendsWith(maker, friend);
const kidMaker = mk('PtKid');
const parent = mk('PtParent', { accountType: 'grownup' });
q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", F.ensureFamily(parent).id, kidMaker.id, now(), now());

const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';
/** A player's game live at a level (as an older public game would be), its version played through and clean. */
function liveGame(owner, vis, title) {
  const g = G.createGame(owner.id, { title, category: 'arcade' });
  const v = G.addVersion(g.id, GOOD, { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE game_versions SET playthrough_status='pass', playthrough_report='{}', review_status='approved', review_report=? WHERE id=?", JSON.stringify({ verdict: 'allowed', by: 'admin', for: 'public' }), v.id);
  q.run("UPDATE games SET visibility=?, status='published', published_version_id=?, published_at=?, plays=999 WHERE id=?", vis, v.id, now(), g.id);
  return G.getGame(g.id);
}
const oldPublic = liveGame(maker, 'public', 'Mias Old Public Game');
const kidPublic = liveGame(kidMaker, 'public', 'Kids Old Public Game');
const oldSchool = liveGame(maker, 'school', 'Mias Old School Game');

// ---------------------------------------------------------------- A. Play by topic
test('topics come from the subject data, with the small explicit map', () => {
  for (const [sec, slugs] of Object.entries(TOPICS)) for (const s of slugs) assert.equal(`sec-${topicOf(G.getGameBySlug(s))}`, sec, s);
  const { sections } = focusSections(null);
  assert.deepEqual(sections.map(x => x.id), ['math', 'reading', 'geography', 'live', 'strategy', 'tools']);
});

test('Learn is by topic: chips jump to the sections, each kept game once, no Popular / Top rated / New', async () => {
  // Staff keep Learn's grid with Assign and Host live (tests/unit/shelves.test.js); everyone else gets the topics.
  assert.ok((await req('/learn', teacher)).text.includes('id="learn-games"'), 'staff: the grid, as before');
  for (const who of [null, student('Pia Play'), kidMaker]) {
    const r = await req('/learn', who);
    assert.equal(r.status, 200);
    for (const id of ['popular', 'rated', 'new', 'featured', 'playing', 'players']) assert.ok(!r.text.includes(`id="${id}-h"`), `no ${id} row`);
    const cards = cardSlugs(r.text).filter(s => KEPT.includes(s));
    assert.equal(new Set(cards).size, cards.length, `each game once: ${cards.join()}`);
    for (const [sec, slugs] of Object.entries(TOPICS)) {
      assert.ok(r.text.includes(`href="#${sec}-h"`), `chip to ${sec}`);
      assert.deepEqual(cardSlugs(section(r.text, sec)).sort(), [...slugs].sort(), sec);
    }
    for (const name of ['Math', 'Reading and words', 'Geography', 'Live class games', 'Strategy', 'Classroom tools']) assert.ok(r.text.includes(` ${name}</h2>`), name);
  }
  // Search has no Popular / Top rated / New to pick while the arcade is hidden.
  const s = await req('/search');
  assert.ok(!s.text.includes('data-sort="rated"') && !s.text.includes('data-sort="popular"'));
});

// ---------------------------------------------------------------- B. My favorites
test('My favorites: a student favorites games, they come first on Learn; hidden games never show; none, no section', async () => {
  const pia = student('Fay Fave');
  let r = await req('/learn', pia);
  assert.ok(!r.text.includes('id="favorites-h"'), 'no favorites yet: no section');
  // The Favorite button is on game pages for students, and it works.
  const page = await req('/g/word-hunt', pia);
  assert.ok(page.text.includes('id="likebtn"'));
  for (const s of ['word-hunt', 'castle-clash']) {
    const x = await req(`/api/games/${G.getGameBySlug(s).id}/like`, pia, { method: 'POST', body: {} });
    assert.equal(x.status, 200, s); assert.equal(x.json.liked, true);
  }
  // A favorite from before that is now hidden (ARCADE off) is left out.
  q.run('INSERT INTO likes(game_id, user_id, created_at) VALUES (?,?,?)', G.getGameBySlug('sum-racer').id, pia.id, now());
  r = await req('/learn', pia);
  const favs = cardSlugs(section(r.text, 'favorites'));
  assert.deepEqual(favs.sort(), ['castle-clash', 'word-hunt']);
  assert.ok(r.text.indexOf('id="favorites-h"') < r.text.indexOf('id="sec-math-h"'), 'near the top');
  assert.ok(r.text.includes('href="#favorites-h"'));
  assert.ok(!cardSlugs((await req('/favorites', pia)).text).includes('sum-racer'));
});

// ---------------------------------------------------------------- C. No public games
test('publishing for everyone is refused by the server and not offered in the Studio', async () => {
  const g = G.createGame(classmate.id, { title: 'Cal New Game' });
  const v = G.addVersion(g.id, GOOD, { createdBy: classmate.id, safetyStatus: 'pass' });
  q.run("UPDATE game_versions SET playthrough_status='pass', playthrough_report='{}' WHERE id=?", v.id);
  for (const who of [classmate, teacher, parent, kidMaker]) for (const lvl of ['public', 'school']) assert.ok(!S.sharingOptions(who).includes(lvl), `${who.username} ${lvl}`);
  assert.ok(S.sharingOptions(classmate).includes('class') && S.sharingOptions(classmate).includes('friends'));
  const r = await pub.publish(classmate, g.id, 'public');
  assert.equal(r.ok, false); assert.equal(r.code, 'noPublic');
  const rs = await pub.publish(classmate, g.id, 'school');
  assert.equal(rs.ok, false); assert.equal(rs.code, 'noSchool');
  assert.equal(G.getGame(g.id).visibility, 'private'); assert.equal(G.getGame(g.id).pending_version_id, null);
  const http = await req(`/api/studio/${g.id}/publish`, classmate, { method: 'POST', body: { visibility: 'public' } });
  assert.ok(http.status >= 400, String(http.status));
  const st = studioState(classmate, g.id);
  assert.ok(!st.shareOptions.includes('public') && !st.shareOptions.includes('school')); assert.equal(st.publicGames, false);
  // Classes and friends still work.
  assert.equal((await pub.publish(classmate, g.id, 'friends')).state, 'live');
});

test('an older public (or school) game: on no list for others; open to its maker, a classmate, a friend and the family; not a stranger, a schoolmate or a visitor', async () => {
  const slug = oldPublic.slug;
  const listedFor = who => G.listVisible(who, { limit: 500 }).some(g => g.id === oldPublic.id) || G.search(who, { text: 'Mias Old', limit: 50 }).some(g => g.id === oldPublic.id);
  for (const who of [null, stranger, schoolmate]) {
    assert.equal(G.canView(who, oldPublic), false, who ? who.username : 'visitor');
    assert.equal(listedFor(who), false);
    const r = await req(`/g/${slug}`, who); assert.equal(r.status, 404, `page for ${who ? who.username : 'visitor'}`);
    assert.ok(!(await req('/play', who)).text.includes(`/g/${slug}"`));
    assert.ok(!(await req('/search?q=Mias+Old', who)).text.includes(`/g/${slug}"`));
  }
  for (const who of [maker, classmate, friend, teacher, boss]) {
    assert.equal(G.canView(who, oldPublic), true, who.username);
    assert.equal((await req(`/g/${slug}`, who)).status, 200, who.username);
  }
  // A grown-up and their linked child are connected both ways.
  assert.equal(G.canView(parent, kidPublic), true);
  assert.equal(G.canView(stranger, kidPublic), false);
  // The maker's profile shows it only to connections; the sitemap never.
  assert.ok(!(await req(`/u/${maker.username}`, stranger)).text.includes(`/g/${slug}"`));
  assert.ok((await req(`/u/${maker.username}`, classmate)).text.includes(`/g/${slug}"`));
  assert.ok(!JSON.stringify(sitemapEntries()).includes(slug));
  // canView and the lists agree for everyone who is not the platform admin.
  for (const who of [maker, classmate, friend, teacher, stranger, schoolmate, parent]) {
    const listed = G.listVisible(who, { limit: 500 }).some(g => g.id === oldPublic.id);
    assert.equal(listed, G.canView(who, oldPublic), who.username);
  }
  // The share line says who it is for now; the maker's Studio offers it as "Friends and classes" and an update keeps it.
  assert.ok((await req(`/g/${slug}`, maker)).text.includes('Friends and classes'));
  const st = studioState(maker, oldPublic.id);
  assert.ok(st.shareOptions.includes('public'));
  const v2 = G.addVersion(oldPublic.id, GOOD + '<!-- v2 -->', { createdBy: maker.id, safetyStatus: 'pass' });
  q.run("UPDATE game_versions SET playthrough_status='pass', playthrough_report='{}' WHERE id=?", v2.id);
  const up = await pub.publish(maker, oldPublic.id, 'public');
  assert.equal(up.state, 'live', up.message);
  assert.equal(G.getGame(oldPublic.id).visibility, 'public'); assert.equal(G.getGame(oldPublic.id).published_version_id, v2.id);
  assert.equal(G.canView(stranger, G.getGame(oldPublic.id)), false);
  // A game shared with 'My school' before: the same rule (a schoolmate outside the maker's classes no longer opens it).
  for (const who of [null, stranger, schoolmate]) assert.equal(G.canView(who, oldSchool), false, who ? who.username : 'visitor');
  for (const who of [maker, classmate, friend, teacher, boss]) assert.equal(G.canView(who, oldSchool), true, who.username);
  for (const who of [maker, classmate, friend, teacher, stranger, schoolmate]) assert.equal(G.listVisible(who, { limit: 500 }).some(g => g.id === oldSchool.id), G.canView(who, oldSchool), who.username);
  assert.equal((await req(`/g/${oldSchool.slug}`, schoolmate)).status, 404);
  assert.ok(studioState(maker, oldSchool.id).shareOptions.includes('school'));
  // Official games stay open to everyone.
  assert.equal(G.canView(null, G.getGameBySlug('crossword')), true);
});

test('PUBLIC_GAMES on brings back the old rule and the option', async () => {
  config.publicGames = true;
  try {
    assert.equal(G.canView(null, oldPublic), true);
    assert.equal(G.canView(stranger, oldPublic), true);
    assert.ok(G.listVisible(null, { limit: 500 }).some(g => g.id === oldPublic.id));
    assert.ok(S.sharingOptions(stranger).includes('public'));
    assert.ok(S.sharingOptions(classmate).includes('school'));
    assert.equal(G.canView(schoolmate, oldSchool), true);
    assert.ok(studioState(maker, oldPublic.id).publicGames);
    assert.equal((await req(`/g/${oldPublic.slug}`)).status, 200);
    assert.ok((await req('/learn', stranger)).text.includes('id="players-h"'), 'Games by players is back');
  } finally { config.publicGames = false; }
});
