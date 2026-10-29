// Home doors (the navigation proposal's Week 2, docs/decisions.md "Home doors"): signed out and as a guest the home page
// opens with a promise and three doors: kid → down the same page to the featured game and the game rows (#play), parent
// and teacher straight to their page in the home page's language, each counted by a beacon (POST /go/<door>; a daily
// total, people only); the wide top bar is Home · Build · (Plans) · Parents · Teachers ·
// Sign in · ▶ Play now. Kids, students, teachers and grown-ups with an account see none of it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_doors', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_doors';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const S = await import('../../server/services/schools.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(u, path, { ua = CHROME, method = 'GET', headers = {} } = {}) {
  const h = { accept: 'text/html', ...headers }; if (u) h.cookie = cookieFor(u.id); if (ua) h['user-agent'] = ua;
  const r = await fetch(base + path, { method, headers: h, redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location'), headers: r.headers };
}
const clicks = step => (q.get('SELECT SUM(n) n FROM funnel_counts WHERE day=? AND step=?', today(), step) || {}).n || 0;
let n = 0;
const kid = () => auth.createUser({ username: `DoorKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `DoorParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
const boss = auth.createUser({ username: 'DoorBoss', password: 'a-long-password-1' });
q.run("UPDATE users SET role='admin' WHERE id=?", boss.id);
const school = S.createSchool(auth.getUser(boss.id), { name: 'Door Test School' }).school;
const inSchool = role => { const u = kid(); assert.ok(S.addMember(auth.getUser(boss.id), school.id, u.id, role).ok); return auth.getUser(u.id); };

const doors = s => (/<div class="doors"[\s\S]*?<\/div>/.exec(s) || [''])[0];
const topnav = s => (/<nav class="topnav"[\s\S]*?<\/nav>/.exec(s) || [''])[0];
const hrefs = s => [...s.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

test('signed out and as a guest: the promise, then three doors (kid first, the big one), then the featured game', async () => {
  for (const [who, u] of [['signed out', null], ['guest', auth.createGuest()]]) {
    const home = (await call(u, '/')).text;
    const d = doors(home);
    assert.deepEqual(hrefs(d), ['#play', '/parents', '/teachers'], who);
    assert.match(d, /class="door door-kid" href="#play" data-count="\/go\/kid">/, `${who}: down this page to the games, counted by a beacon`);
    assert.doesNotMatch(d, /nofollow|href="\/go\//, `${who}: no door goes through /go/ any more`);
    assert.match(d, /class="door door-parent" href="\/parents" data-count="\/go\/parent">/, `${who}: a real link, counted by a beacon`);
    assert.match(d, /class="door door-teacher" href="\/teachers" data-count="\/go\/teacher">/, who);
    assert.match(d, /role="group" aria-label="Who is visiting\?"/);
    assert.match(d, /class="door door-kid"[^>]*>.*?🎮.*?I’m a kid — play now<\/span><span class="door-s">No sign-up needed/, who);
    assert.match(d, /👪.*?I’m a parent<\/span><span class="door-s">Is it safe\? Set up your child, free/);
    assert.match(d, /🍎.*?I’m a teacher<\/span><span class="door-s">Free classes, lessons and progress/);
    assert.doesNotMatch(home, /home-who|>For parents<\/span><\/a><a class="btn"/, `${who}: the old parent/teacher buttons are gone (no duplicates)`);
    const at = k => home.indexOf(k);
    assert.ok(at('id="home-h1"') < at('class="doors"') && at('class="doors"') < at('class="hero '), `${who}: heading, doors, then the featured game`);
    assert.equal(home.match(/\bid="play"/g).length, 1, `${who}: one #play on the page`);
    assert.ok(at('class="doors"') < at('<div id="play" class="home-play">') && at('id="play"') < at('class="hero ') && at('id="play"') < at('class="rail'), `${who}: #play starts at the featured game, above the rows`);
    assert.doesNotMatch(d, /\$\d|€\d|£\d|plan/i, 'no prices or plan names on the doors');
  }
});

test('nobody with an account sees the doors or Play now: kids, students, teachers, grown-ups', async () => {
  for (const [who, u] of [['kid', kid()], ['student', inSchool('student')], ['teacher', inSchool('teacher')], ['grown-up', grownup()]]) {
    const home = await call(u, '/');
    assert.equal(home.status, 200, who);
    assert.doesNotMatch(home.text, /class="doors"|href="\/go\//, who);
    assert.doesNotMatch(home.text, /class="btn btn-hot playnow"/, who);
  }
});

test('the kid door reaches a game in two taps: #play → the featured game\'s Play (no sign-up), which plays; old /go/kid links land on #play', async () => {
  const home = (await call(null, '/')).text;
  const play = home.slice(home.indexOf('<div id="play" class="home-play">'));
  const heroPlay = /<a class="btn btn-big" href="(\/play\/[a-z0-9-]+)">/.exec(play)[1];
  const g = await call(null, heroPlay);
  assert.equal(g.status, 200, 'the game opens signed out (a guest is made, no sign-up)');
  assert.match(play, /class="rail/, 'the game rows are in #play too, so a kid picks');
  for (const [path, to] of [['/go/kid', '/#play'], ['/go/play', '/#play'], ['/go/kid?l=es', '/es#play'], ['/go/play?l=de', '/de#play'], ['/go/kid?l=xx', '/#play'], ['/go/kid?l=//evil.example', '/#play']]) {
    const r = await call(null, path);
    assert.equal(r.status, 302, path); assert.equal(r.location, to, path);
  }
  assert.equal((await call(auth.createGuest(), '/go/play')).location, '/#play', 'a guest too');
});

test('parent and teacher doors link the home page\'s own language pages (crawlable); old ?l= links still redirect; unknown doors are 404', async () => {
  assert.equal((await call(null, '/go/parent')).location, '/parents');
  assert.equal((await call(null, '/go/teacher')).location, '/teachers');
  assert.equal((await call(null, '/go/parent?l=es')).location, '/es/parents');
  assert.equal((await call(null, '/go/teacher?l=de')).location, '/de/teachers');
  assert.equal((await call(null, '/go/parent?l=xx')).location, '/parents', 'an unknown language is ignored');
  assert.equal((await call(null, '/go/parent?l=//evil.example')).location, '/parents', 'never an outside address');
  assert.equal((await call(null, '/go/nope')).status, 404);
  assert.equal((await call(null, '/go/__proto__')).status, 404);
  const es = (await call(null, '/es')).text;
  assert.deepEqual(hrefs(doors(es)), ['#play', '/es/parents', '/es/teachers'], 'a crawlable link to its own language\'s pages');
  assert.doesNotMatch(doors(es), /nofollow/);
  assert.match(es, /class="btn btn-hot playnow" href="\/es#play" data-count="\/go\/play"/, 'Play now: this language\'s home page, at the games');
});

test('door clicks are counted: one daily total per door, people only, never cached or indexed', async () => {
  q.run('DELETE FROM funnel_counts');
  for (const d of ['kid', 'kid', 'parent', 'teacher', 'play']) await call(null, `/go/${d}`);
  assert.deepEqual(['door.kid', 'door.parent', 'door.teacher', 'door.bar'].map(clicks), [2, 1, 1, 1]);
  // HEAD (link checkers, scanners) and prefetches redirect the same but count nothing.
  for (const [d, opts] of [['kid', { method: 'HEAD' }], ['play', { method: 'HEAD' }], ['kid', { headers: { 'sec-purpose': 'prefetch' } }], ['kid', { headers: { purpose: 'prefetch' } }]]) {
    const r = await call(null, `/go/${d}`, opts);
    assert.equal(r.status, 302); assert.equal(r.location, '/#play');
  }
  assert.deepEqual(['door.kid', 'door.bar'].map(clicks), [2, 1], 'HEAD and prefetch are not clicks');
  // The doors' and Play now's beacon: POST /go/<door> from this site counts (204, nothing else); from elsewhere, a
  // robot or without a browser it doesn't.
  const beacon = (d, headers = { 'sec-fetch-site': 'same-origin' }, ua) => call(null, `/go/${d}`, { method: 'POST', headers, ua });
  assert.equal((await beacon('parent')).status, 204);
  assert.equal((await beacon('teacher')).status, 204);
  assert.equal((await beacon('parent', { 'sec-fetch-site': 'cross-site' })).status, 403, 'another site can\'t count');
  await beacon('parent', {}); await beacon('parent', undefined, 'curl/8.0'); await beacon('parent', undefined, 'Mozilla/5.0 (compatible; Googlebot/2.1)');
  assert.equal((await beacon('kid')).status, 204, 'the kid door counts by its beacon');
  assert.equal((await beacon('play')).status, 204, 'and Play now');
  assert.equal((await beacon('kid', { 'sec-fetch-site': 'cross-site' })).status, 403, 'another site can\'t count the kid door');
  await beacon('kid', {}); await beacon('play', undefined, 'curl/8.0'); await beacon('kid', undefined, 'Mozilla/5.0 (compatible; Googlebot/2.1)');
  assert.equal((await beacon('nope')).status, 404);
  assert.equal((await beacon('__proto__')).status, 404);
  assert.deepEqual(['door.kid', 'door.parent', 'door.teacher', 'door.bar'].map(clicks), [3, 2, 2, 2]);
  await call(null, '/go/kid', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  await call(null, '/go/kid', { ua: 'facebookexternalhit/1.1' });
  await call(null, '/go/kid', { ua: '' });
  await call(null, '/go/nope');
  assert.equal(clicks('door.kid'), 3, 'robots, link previews and requests without a browser are not counted');
  const cols = q.all("SELECT name FROM pragma_table_info('funnel_counts')").map(c => c.name).sort();
  assert.deepEqual(cols, ['day', 'n', 'step'], 'nothing about who clicked');
  for (const d of ['parent', 'kid']) {
    const r = await call(null, `/go/${d}`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
  }
  assert.match((await call(null, '/robots.txt')).text, /^Disallow: \/go\/$/m);
  assert.doesNotMatch((await call(null, '/sitemap.xml')).text, /\/go\//);
  // The home page stays the one indexable address (the doors add none).
  assert.match((await call(null, '/')).text, /<link rel="canonical" href="[^"]*\/">/);
});

test('a translated home page shows its own doors; until a language has them, its own "Play", "For parents", "For teachers" stand in', async () => {
  // Translated: the German doors, small lines and group label, nothing marked English.
  const de = (await call(null, '/de')).text;
  const d = doors(de);
  assert.ok(d, 'German home has the doors');
  assert.doesNotMatch(d, /lang="en"|I’m a|No sign-up/, 'no English words or small lines');
  assert.match(d, /aria-label="Wer ist zu Besuch\?"/);
  assert.match(d, /<span class="door-h">Ich bin ein Kind – los geht’s<\/span><span class="door-s">Keine Anmeldung nötig<\/span>/);
  assert.match(d, /<span class="door-h">Ich bin Elternteil<\/span>/); assert.match(d, /<span class="door-h">Ich bin Lehrkraft<\/span>/);
  assert.deepEqual(hrefs(d), ['#play', '/de/parents', '/de/teachers'], 'parent and teacher doors stay in German');
  assert.match(de, /class="btn btn-hot playnow" href="\/de#play" data-count="\/go\/play"><span aria-hidden="true">▶<\/span> <span class="playnow-t">Jetzt spielen<\/span>/);
  // A language without the door words yet (simulated): never English doors, the words it has stand in.
  await withoutKeys('de', ['home.doors', 'nav.playNow'], async () => {
    const gap = (await call(null, '/de')).text;
    const g = doors(gap);
    assert.ok(g, 'German home still has the doors');
    assert.doesNotMatch(g, /lang="en"|I’m a|No sign-up|aria-label/, 'no English words, labels or small lines');
    assert.match(g, /🎮<\/span><span class="door-t"><span class="door-h">Spielen<\/span><\/span>/);
    assert.match(g, /Für Eltern/); assert.match(g, /Für Lehrkräfte/);
    // The top bar's Play now borrows "Play" too.
    assert.match(gap, /class="btn btn-hot playnow"[^>]*><span aria-hidden="true">▶<\/span> <span class="playnow-t">Spielen<\/span>/);
  });
  assert.doesNotMatch(doors((await call(null, '/de')).text), /Für Eltern/, 'the words are back');
});

test('the wide top bar, signed out and as a guest: Home · Build · Plans · Parents · Teachers, then Sign in and ▶ Play now', async () => {
  for (const [who, u] of [['signed out', null], ['guest', auth.createGuest()]]) {
    const page = (await call(u, '/safety')).text;
    assert.deepEqual(hrefs(topnav(page)), ['/', '/build', '/plans', '/parents', '/teachers'], who);
    assert.match(page, /class="me-btn" href="\/(login|me)"[\s\S]*?<\/a>\s*<a class="btn btn-hot playnow" href="\/#play" data-count="\/go\/play"><span aria-hidden="true">▶<\/span> <span class="playnow-t">Play now<\/span><\/a>\s*<\/header>/, `${who}: Play now ends the bar`);
    assert.match(page, /<form class="topsearch" role="search"/, `${who}: the search field stays`);
  }
  // A kid keeps their menu (Search and Friends in it) and no Play now.
  const k = (await call(kid(), '/safety')).text;
  assert.deepEqual(hrefs(topnav(k)), ['/', '/search', '/build', '/friends', '/plans']);
  // Plans off (billing not public): no Plans for anyone, the doors and Play now unchanged.
  config.stripeApiKey = '';
  const off = (await call(null, '/')).text;
  assert.deepEqual(hrefs(topnav(off)), ['/', '/build', '/parents', '/teachers']);
  assert.deepEqual(hrefs(doors(off)), ['#play', '/parents', '/teachers']);
  assert.match(off, /class="btn btn-hot playnow" href="\/#play" data-count="\/go\/play"/);
});
