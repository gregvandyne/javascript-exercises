// How players find Oomba Live (server/live/live-games.js, routes/games.js, routes/discover.js, views/layout.js): a live
// mode's card has a "Live" badge and opens its game page (never straight into play), the page leads with "Join" (a code
// from the board) and hosting, solo practice second; "Join a game" is in the top bar for players on every page and on the
// signed-in home page; the page's Join box sends the code to /join, which goes straight on.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const { MODES } = await import('../../server/services/classlive-access.js');
const { LIVE_GAMES, liveGameOf } = await import('../../server/live/live-games.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const S = await import('../../server/services/schools.js');

seed({ quiet: true });
const kid = auth.createUser({ username: 'LiveEntryKid', password: 'a-long-password-1', displayName: 'Kid' });
const boss = auth.createUser({ username: 'LiveEntryBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Entry Oak' }).school;
const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user;

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => resetLimits());
function cookieOf(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; }
const get = (path, u) => fetch(base + path, { headers: u ? { cookie: cookieOf(u) } : {}, redirect: 'manual' });

test('every built-in live mode is a live game, with its mode and a solo game that exists', () => {
  assert.deepEqual(Object.keys(LIVE_GAMES).sort(), Object.values(MODES).sort());
  for (const [slug, e] of Object.entries(LIVE_GAMES)) {
    assert.equal(MODES[e.mode], slug, `${slug}: mode ${e.mode}`);
    assert.ok(e.solo, slug);
  }
  assert.equal(liveGameOf({ slug: 'quest-race', source: 'seed' }).mode, 'quest-race');
  assert.equal(liveGameOf({ slug: 'quest-race', source: 'studio' }), null, 'only the official game, not a game a child named the same');
  assert.equal(liveGameOf({ slug: 'atlas-quest', source: 'seed' }), null);
});

test('a live mode\'s card says Live and opens its game page; the page leads with joining, hosting and solo practice', async () => {
  // The live modes are on the Learn shelf ("Live class games"), never in Play's rails.
  const home = await (await get('/learn')).text();
  assert.match(home, /class="gcard gcard-live" href="\/g\/(quest-race|question-battle|brain-board|would-you-rather-live|atlas-quest-live)"/);
  assert.match(home, /class="live-badge"/);
  assert.doesNotMatch(await (await get('/')).text(), /class="gcard gcard-live" href="\/g\/(quest-race|question-battle|brain-board|would-you-rather-live|atlas-quest-live)"/);
  for (const [slug, e] of Object.entries(LIVE_GAMES)) {
    const page = await (await get(`/g/${slug}`)).text();
    assert.match(page, /class="livepanel"/, slug);
    assert.match(page, /<form class="livepanel-join" method="get" action="\/join"/, slug);
    assert.match(page, /id="lpjc" name="code" inputmode="numeric"/, slug);
    assert.match(page, new RegExp(`href="/play/${e.solo}" id="playbtn"`), `${slug}: solo practice`);
    assert.doesNotMatch(page, /class="btn btn-primary btn-big playbig"/, `${slug}: no big Play into solo`);
    // Signed out: the teachers' page; a kid: no host button.
    assert.match(page, /href="\/teachers\/live" id="hostlive"/, slug);
    const kidPage = await (await get(`/g/${slug}`, kid)).text();
    assert.doesNotMatch(kidPage, /id="hostlive"/, `${slug}: kids do not host`);
  }
  // Another official game keeps its Play button.
  const other = await (await get('/g/would-you-rather')).text();
  assert.doesNotMatch(other, /class="livepanel"/);
  assert.match(other, /id="playbtn"/);
});

test('a teacher gets "Host a live game" with the mode picked', async () => {
  const page = await (await get('/g/would-you-rather-live', teacher)).text();
  assert.match(page, /href="\/live\?mode=wyr" id="hostlive"/);
});

test('"Join a game" is in the top bar for players, on the signed-in home page, and not for school staff', async () => {
  const kidHome = await (await get('/', kid)).text();
  assert.match(kidHome, /class="btn joinnow" href="\/join"/);
  assert.match(kidHome, /class="home-join-in"[\s\S]*id="home-join"/);
  const kidGame = await (await get('/g/sum-racer', kid)).text();
  assert.match(kidGame, /class="btn joinnow" href="\/join"/, 'on every page');
  const out = await (await get('/')).text();
  assert.match(out, /class="btn joinnow joinnow-out" href="\/join"/);
  for (const p of ['/play', '/learn']) {
    const r = await get(p, teacher); assert.equal(r.status, 200, p);
    const tHome = await r.text();
    assert.doesNotMatch(tHome, /class="btn joinnow/, p);
    assert.doesNotMatch(tHome, /class="home-join-in"|id="learn-join"/, p);
  }
  assert.match(await (await get('/learn', kid)).text(), /id="learn-join"/, 'a kid gets the join door on Learn too');
});

test('the game page\'s Join box: /join?code=…&go=1 goes on to the join page, which joins at once', async () => {
  const r = await get('/join?go=1&code=123+4567');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/join#go=1234567');
  const plain = await get('/join?code=1234567');
  assert.equal(plain.headers.get('location'), '/join#1234567', 'a QR or typed code still waits for Next');
  const join = await (await get('/join')).text();
  assert.match(join, /id="jc" name="code" class="lv-code-input" inputmode="(numeric|text)" autocomplete="off"/);
});
