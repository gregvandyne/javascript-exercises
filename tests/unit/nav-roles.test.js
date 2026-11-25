// Navigation (docs/decisions.md "Navigation shells", "Play and Learn", "A quieter top bar" and "Learn and Read"): a first
// tab built for each role, Learn (every game) and Read (the Story Library) shared by all. Every role's phone tab bar and desktop top bar, in order, with paid-plan pages on and
// off; no Plans, School or theme menu in either bar (they are in the account menu behind the avatar: Plans for adults
// only, School for school admins; signed out, Plans and the theme are in the footer); where '/' takes each role; the kid's bar byte for byte; the stand-in labels until a language has the new words (never
// English on a translated page); the page -> current tab mapping; staff's friend badges on Me; search in every top bar.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_roles', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_roles';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const SC = await import('../../server/services/schools.js');
const { shellFor, currentTab } = await import('../../server/views/layout.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');
const { deicon } = await import('../support/deicon.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function get(u, path, { lang } = {}) {
  const cookie = [u ? cookieFor(u.id) : '', lang ? `lang=${lang}` : ''].filter(Boolean).join('; ');
  const r = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const raw = await r.text();
  // Icons are pictures now (docs/decisions.md "Icons: Fluent Emoji 3D"); read each one as the emoji it stands for.
  return { status: r.status, text: deicon(raw), raw, location: r.headers.get('location') };
}
const tabbar = s => (/<nav class="tabbar"[\s\S]*?<\/nav>/.exec(s) || [''])[0];
const topnav = s => (/<nav class="topnav"[\s\S]*?<\/nav>/.exec(s) || [''])[0];
const topbar = s => (/<header class="topbar">[\s\S]*?<\/header>/.exec(s) || [''])[0];
const hrefs = (s, cls) => [...s.matchAll(new RegExp(`class="${cls}" href="([^"]+)"`, 'g'))].map(m => m[1]);

// ---------------------------------------------------------------- one person per role
const boss = auth.createUser({ username: 'RolesBoss', password: 'boss-password-1', role: 'admin' });
const oak = SC.createSchool(boss, { name: 'Roles Oak School' }).school;
const elm = SC.createSchool(boss, { name: 'Roles Elm School' }).school;
const head = SC.createSchoolAccount(boss, oak.id, { rosterName: 'Mrs Head', role: 'admin' }).user;
const teacher = SC.createSchoolAccount(head, oak.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
const pupil = SC.createSchoolAccount(head, oak.id, { rosterName: 'Pupil One' }).user;          // a school account
const ownKid = auth.createUser({ username: 'RolesOwnKid', password: 'rainbow-77' });            // own account, in a school
SC.addMember(head, oak.id, ownKid.id, 'student');
const kid = auth.createUser({ username: 'SnapKid', password: 'rainbow-77', avatar: '🦊', color: '#2f6bff' });
const mum = auth.createUser({ username: 'RolesMum', password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(mum);
const guest = auth.createGuest();

// Learn is always /learn ('/' shows the same page to those who land on it: signed out, kids, the platform admin); Read is
// /read (grown-ups too: they read, nothing is stored for them); Search is the top bar's field for everyone, never a tab; Live (hosting) only while Oomba Live is on (it is).
const ON = {
  out: { tabs: ['/learn', '/read', '/build', '/parents', '/login'], top: ['/learn', '/read', '/build', '/parents', '/teachers'] },
  grownup: { tabs: ['/family', '/learn', '/read', '/build', '/family/account'], top: ['/family', '/learn', '/read', '/build'] },
  schoolAdmin: { tabs: ['/teach', '/build', '/figures', '/live', '/me'], top: ['/teach', '/build', '/figures', '/live'] },
  teacher: { tabs: ['/teach', '/build', '/figures', '/live', '/me'], top: ['/teach', '/build', '/figures', '/live'] },
  admin: { tabs: ['/learn', '/read', '/build', '/admin/schools', '/me'], top: ['/learn', '/read', '/build', '/admin/schools'] },
  student: { tabs: ['/classes', '/learn', '/read', '/build', '/me'], top: ['/classes', '/learn', '/read', '/build', '/friends'] },
  kid: { tabs: ['/learn', '/read', '/build', '/friends', '/me'], top: ['/learn', '/read', '/build', '/friends'] },
};
const KEYS = {
  out: ['learn', 'read', 'build', 'grownups', 'signin'],
  grownup: ['family', 'learn', 'read', 'build', 'account'],
  schoolAdmin: ['classroom', 'build', 'tools', 'live', 'me'],
  teacher: ['classroom', 'build', 'tools', 'live', 'me'],
  admin: ['learn', 'read', 'build', 'schools', 'me'],
  student: ['class', 'learn', 'read', 'build', 'me'],
  kid: ['learn', 'read', 'build', 'friends', 'me'],
};
/** Where '/' takes each role (null: it shows Learn). */
const LANDS = { out: null, grownup: '/family', schoolAdmin: '/school', teacher: '/teach', admin: null, student: '/classes', kid: null };
const PEOPLE = [['out', null], ['out', guest], ['grownup', mum], ['schoolAdmin', head], ['teacher', teacher], ['admin', boss], ['student', pupil], ['student', ownKid], ['kid', kid]];
/** The page each role's menus are read on: Learn, which is also '/' for some. */
const playOf = role => (LANDS[role] ? '/learn' : '/');
const KID_TAB = "<nav class=\"tabbar\" aria-label=\"Main\">\n    <a class=\"tab\" href=\"/learn\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">💡</span><span class=\"tab-t\">Learn</span></a><a class=\"tab\" href=\"/read\" ><span class=\"emo\" aria-hidden=\"true\">📚</span><span class=\"tab-t\">Read</span></a><a class=\"tab\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span><span class=\"tab-t\">Build</span></a><a class=\"tab\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span><span class=\"tab-t\">Friends</span></a>\n    <a class=\"tab\" href=\"/me\" ><span class=\"emo\" aria-hidden=\"true\">🦊</span><span class=\"tab-t\">Me</span></a>\n  </nav>";
const KID_TOP = "<nav class=\"topnav\" aria-label=\"Main\">\n      <a class=\"navlink\" href=\"/learn\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">💡</span>Learn</a><a class=\"navlink\" href=\"/read\" ><span class=\"emo\" aria-hidden=\"true\">📚</span>Read</a><a class=\"navlink\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span>Build</a><a class=\"navlink\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span>Friends</a>\n    </nav>";
// Paid plans off: no Plans, and no Teaching tools for staff off the tester list (services/teacher-tools.js).
const off = list => list.filter(h => h !== '/plans' && h !== '/figures');

test('shellFor: every role\'s tab keys, in order, the same with paid-plan pages on and off; never Plans or School', () => {
  const req = {};
  for (const on of [true, false]) {
    if (!on) config.stripeApiKey = '';
    for (const [role, u] of PEOPLE) {
      const s = shellFor(u, req);
      assert.equal(s.role, role, u ? u.username : 'signed out');
      assert.deepEqual(s.tabs.map(([k]) => k), on ? KEYS[role] : KEYS[role].filter(k => k !== 'tools'), `${role}, plans ${on ? 'on' : 'off'}`);
      for (const k of ['plans', 'school']) assert.ok(!s.tabs.some(([x]) => x === k) && !s.top.some(([x]) => x === k), `${role}: no ${k} in either bar`);
    }
  }
  // Plans off (as now): Classroom · Build · Live · Me for teachers and school admins (Teaching tools needs plans on,
  // or the tester list); five for everyone else. With plans on, staff have five too (above).
  assert.equal(shellFor(mum, req).tabs.length, 5); assert.equal(shellFor(head, req).tabs.length, 4); assert.equal(shellFor(teacher, req).tabs.length, 4);
  assert.equal(shellFor(pupil, req).tabs.length, 5); assert.equal(shellFor(kid, req).tabs.length, 5); assert.equal(shellFor(null, req).tabs.length, 5);
  assert.equal(shellFor(boss, req).tabs.length, 5);
  // Search is never a tab: it is the top bar's field (and round button) for everyone.
  for (const [role, u] of PEOPLE) assert.ok(!shellFor(u, req).tabs.some(([k]) => k === 'search') && !shellFor(u, req).top.some(([k]) => k === 'search'), role);
});

test('every role\'s phone tab bar and desktop top bar on the page, plans on and off; search in every top bar', async () => {
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, playOf(role))).text;
    assert.deepEqual(hrefs(tabbar(page), 'tab'), ON[role].tabs, `${role} ${u ? u.username : ''}: tab bar`);
    assert.deepEqual(hrefs(topnav(page), 'navlink'), ON[role].top, `${role}: top bar`);
    // Search: the field (360px and wider) and the round button (below 360px) are both in every top bar.
    assert.match(topbar(page), /<form class="topsearch" role="search" action="\/search"/, `${role}: search field`);
    assert.match(topbar(page), /<a class="topsearch-btn" href="\/search"/, `${role}: search button`);
  }
  config.stripeApiKey = '';
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, playOf(role))).text;
    assert.deepEqual(hrefs(tabbar(page), 'tab'), off(ON[role].tabs), `${role}, plans off: tab bar`);
    assert.deepEqual(hrefs(topnav(page), 'navlink'), off(ON[role].top), `${role}, plans off: top bar`);
  }
});

test('the kid\'s tab bar and top bar, byte for byte (Learn · Read · Build · Friends · Me)', async () => {
  // A new kid's first sign-in brings the team's automatic welcome (services/team.js, docs/decisions.md "Automatic
  // welcome"): their one unread message, so a badge on Friends. Read, the bars are exactly these.
  const official = auth.getUserByName(auth.OFFICIAL);
  await get(kid, '/');
  const unread = q.all('SELECT from_id FROM chat_messages WHERE to_id=? AND read_at IS NULL', kid.id);
  assert.deepEqual(unread.map(m => m.from_id), [official.id], 'the team\'s welcome is the kid\'s only unread message');
  assert.match(tabbar((await get(kid, '/')).text), /<span class="tab-t">Friends<\/span><span class="badge" aria-label="1 new">1<\/span>/);
  q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND read_at IS NULL', Date.now(), kid.id);
  const got = await get(kid, '/'), page = got.text;
  assert.equal(tabbar(page), KID_TAB);
  assert.equal(topnav(page), KID_TOP);
  // As drawn: the Oomba icons (30 px in the tab bar, 28 in the top bar: controls, below 40), the kid's own avatar still an emoji.
  assert.match(tabbar(got.raw), /<span class="emo" aria-hidden="true"><svg class="fx fx-oo" data-fx="light-bulb" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false"><use href="\/icons\/oomba\/idea\.svg\?v=[0-9a-f]+#i"\/><\/svg>/);
  assert.match(topnav(got.raw), /<svg class="fx fx-oo" data-fx="books"[^>]* width="28" height="28"[^>]*><use href="\/icons\/oomba\/lessons\.svg/);
  assert.match(tabbar(got.raw), /href="\/me" ><span class="emo" aria-hidden="true">🦊<\/span>/);
});

test('\'/\' per role: Learn for the signed out, guests, kids and the platform admin; everyone else to their first tab, never cached; /play answers 301 to /learn for all', async () => {
  for (const [role, u] of PEOPLE) {
    const r = await get(u, '/');
    if (LANDS[role]) {
      assert.equal(r.status, 302, role); assert.equal(r.location, LANDS[role], role);
      const raw = await fetch(base + '/', { headers: { cookie: cookieFor(u.id) }, redirect: 'manual' });
      assert.match(raw.headers.get('cache-control') || '', /no-store/, `${role}: a redirect is never cached`);
      assert.match(raw.headers.get('cache-control') || '', /private/, role);
    } else {
      assert.equal(r.status, 200, role);
      assert.match(r.text, /<div id="play" class="learn-games-wrap">/, `${role}: '/' is the Learn page (not a redirect)`);
      assert.deepEqual([...tabbar(r.text).matchAll(/class="tab" href="([^"]+)" aria-current="page"/g)].map(m => m[1]), ['/learn'], `${role}: the Learn tab is current on '/'`);
    }
    // /play (Play and Learn are one page now): a permanent redirect to /learn, query string kept, for everyone.
    const p = await get(u, '/play?utm_source=poster&x=1');
    assert.equal(p.status, 301, `${role}: /play`); assert.equal(p.location, '/learn?utm_source=poster&x=1', role);
    if (role !== 'grownup') assert.equal((await get(u, '/learn')).status, 200, `${role}: /learn`);
  }
  // A language address keeps its language: /es/play -> /es/learn (and the query string).
  const es = await get(null, '/es/play?grade=3');
  assert.equal(es.status, 301); assert.equal(es.location, '/es/learn?grade=3');
  assert.equal((await get(kid, '/fr/play')).location, '/fr/learn');
  assert.equal((await get(null, '/es/learn')).status, 200);
  // A game is still played at /play/<slug> (another route): never redirected to Learn.
  assert.notEqual((await get(kid, '/play/no-such-game')).location, '/learn');
  // A language address behaves the same: signed in, it goes to the first tab.
  assert.equal((await get(teacher, '/es')).location, '/teach');
  assert.equal((await get(null, '/es')).status, 200);
  // Sign-in (auth.js homeFor) and '/' agree.
  const { homeFor } = await import('../../server/routes/auth.js');
  const { landingFor } = await import('../../server/views/layout.js');
  // (A school admin whose school is still to set up signs in to its setup page first: that is under /school too.)
  for (const [role, u] of PEOPLE) if (u && !u.is_guest && role !== 'admin') assert.ok(homeFor(u) === (landingFor(u) || '/') || (role === 'schoolAdmin' && homeFor(u).startsWith('/school/')), role);
  assert.equal(homeFor(boss), '/admin', 'the platform admin still signs in to /admin');
});

test('the avatar: signed in it opens the account menu (Me, or Account for a grown-up, first); signed out it is Sign in', async () => {
  const menu = s => (/<details class="acctpick" data-acctpick>[\s\S]*?<\/details>/.exec(topbar(s)) || [''])[0];
  const first = s => (/<div class="acct-menu[^"]*">[\s\S]*?<a [^>]*?href="([^"]+)"/.exec(menu(s)) || [])[1];
  const btn = s => (/<a class="me-btn" href="([^"]+)"/.exec(topbar(s)) || [])[1];
  const m = menu((await get(mum, '/learn')).text);
  assert.match(m, /<summary class="me-btn" aria-label="Me: RolesMum">/);
  assert.ok(!m.includes('href="/me"'), 'a grown-up has no Me page');
  assert.match(m, /<a href="\/family\/account" ><span class="theme-ico" aria-hidden="true">⚙️<\/span><span>All settings<\/span><\/a>/);
  for (const u of [head, teacher, boss, pupil, kid]) {
    const page = (await get(u, '/learn')).text;
    assert.equal(first(page), '/me', u.username);
    assert.match(menu(page), /href="\/me\/settings"/, `${u.username}: All settings`);
    assert.equal(btn(page), undefined, `${u.username}: the avatar is not a plain link any more`);
  }
  assert.equal(btn((await get(null, '/')).text), '/login');
  assert.equal(menu((await get(null, '/')).text), '', 'signed out: no account menu');
  assert.equal(btn((await get(guest, '/learn')).text), '/login', 'a guest: Sign in, no account menu');
});

test('labels: the new words in English and in a translated language, and their translated stand-ins (never English) until a language has them', async () => {
  const label = (s, href) => (new RegExp(`class="tab" href="${href}"[^>]*>(?:<span class="emo"[^>]*>[^<]*</span>)<span class="tab-t">([^<]*)</span>`).exec(tabbar(s)) || [])[1];
  const en = (await get(mum, '/learn')).text;
  assert.equal(label(en, '/learn'), 'Learn'); assert.equal(label(en, '/read'), 'Read', 'a grown-up has Read too');
  assert.equal(label((await get(kid, '/learn')).text, '/read'), 'Read'); assert.equal(label(en, '/family/account'), 'Account'); assert.equal(label(en, '/family'), 'Family');
  const enHead = (await get(head, '/learn')).text;
  assert.equal(label(enHead, '/school'), undefined, 'School is in the account menu'); assert.equal(label(enHead, '/teach'), 'Classroom');
  assert.equal(label((await get(pupil, '/learn')).text, '/classes'), 'Class');
  assert.equal(label((await get(teacher, '/learn')).text, '/live'), 'Live');
  // German has the new words: German labels, nothing marked English.
  const { dictionary } = await import('../../server/i18n/index.js');
  const dict = dictionary('de');
  const de = (await get(mum, '/learn', { lang: 'de' })).text;
  assert.equal(label(de, '/learn'), dict['nav.learn']); assert.equal(label((await get(kid, '/learn', { lang: 'de' })).text, '/read'), dict['nav.read']); assert.equal(label(de, '/family/account'), dict['nav.account']); assert.equal(label(de, '/family'), dict['nav.family']);
  for (const k of ['nav.read', 'nav.learn', 'nav.class', 'nav.classroom', 'nav.account']) assert.ok(dict[k] && dict[k] !== dictionary('en')[k] || k === 'nav.live', k);
  assert.doesNotMatch(tabbar(de) + topnav(de), /lang="en"/);
  const deHead = (await get(head, '/learn', { lang: 'de' })).text;
  assert.equal(label(deHead, '/teach'), dict['nav.classroom']);
  assert.doesNotMatch(tabbar(deHead) + topnav(deHead), /lang="en"/);
  // The new words taken out of German (simulated): Games (else Home), Classes, Me and Schools stand in, never English.
  await withoutKeys('de', ['nav.account', 'nav.school', 'nav.classroom', 'nav.class'], async () => {
    const gap = (await get(mum, '/learn', { lang: 'de' })).text;
    assert.equal(label(gap, '/family/account'), dict['nav.me']);
    assert.doesNotMatch(tabbar(gap) + topnav(gap), /lang="en"/);
    const gapHead = (await get(head, '/learn', { lang: 'de' })).text;
    assert.equal(label(gapHead, '/teach'), dict['nav.classes']);
    assert.doesNotMatch(tabbar(gapHead) + topnav(gapHead), /lang="en"/);
    assert.equal(label((await get(pupil, '/learn', { lang: 'de' })).text, '/classes'), dict['nav.classes']);
  });
  // Every language has its own word for Read (nav.read, a new tab).
  for (const code of ['es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'he', 'ar']) assert.ok(dictionary(code)['nav.read'] && dictionary(code)['nav.read'] !== 'Read', code);
});

test('the current tab: Learn on the game pages, search and /learn, Read on the library, Classroom, Class, Live, Family, Account, and Me on School', async () => {
  const cur = s => [...tabbar(s).matchAll(/class="tab" href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
  const curTop = s => [...topnav(s).matchAll(/class="navlink" href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
  const s0 = shellFor(mum, {});
  for (const a of ['home', 'play', 'search', 'learn']) assert.equal(currentTab(s0, a), 'learn', a);
  assert.equal(currentTab(s0, 'family'), 'family');
  for (const a of ['home', 'play', 'search']) assert.equal(currentTab(shellFor(kid, {}), a), 'learn', `a kid: ${a}`);
  assert.equal(currentTab(shellFor(kid, {}), 'read'), 'read');
  assert.equal(currentTab(shellFor(teacher, {}), 'classes'), 'classroom'); assert.equal(currentTab(shellFor(teacher, {}), 'live'), 'live');
  assert.equal(currentTab(shellFor(pupil, {}), 'classes'), 'class');
  assert.equal(currentTab(shellFor(boss, {}), 'classes'), 'schools', 'the Classes area is Schools for the platform admin');
  assert.deepEqual(cur((await get(kid, '/')).text), ['/learn']);
  assert.deepEqual(cur((await get(kid, '/search')).text), ['/learn'], 'a search is browsing the games: Learn');
  // Read: the Story Library's shelf and its books (/library/<id> stays the book's address).
  const LIB = await import('../../server/services/library.js');
  const book = LIB.books()[0];
  for (const u of [kid, pupil, boss, mum, null]) {
    assert.deepEqual(cur((await get(u, '/read')).text), ['/read'], `${u ? u.username : 'signed out'}: Read on /read`);
    assert.deepEqual(curTop((await get(u, '/read')).text), ['/read']);
  }
  assert.deepEqual(cur((await get(kid, `/library/${book.id}`)).text), ['/read'], 'a book: Read');
  assert.deepEqual(cur((await get(teacher, '/read')).text), [], 'staff: no Read tab, nothing marked');
  assert.deepEqual(cur((await get(kid, '/learn')).text), ['/learn']);
  assert.deepEqual(cur((await get(kid, '/learn/math-games')).text), ['/learn']);
  assert.deepEqual(cur((await get(mum, '/search')).text), ['/learn']);
  assert.deepEqual(cur((await get(mum, '/learn')).text), ['/learn']);
  assert.deepEqual(cur((await get(mum, '/family')).text), ['/family']);
  const acct = (await get(mum, '/family/account')).text;
  assert.deepEqual(cur(acct), ['/family/account']);
  assert.match(acct, /<summary class="me-btn is-current"/);
  assert.match(acct, /<a href="\/family\/account" aria-current="page">/, 'Account in the menu is the page you are on');
  // Teachers' bar is Classroom · Build · Live: Learn and Read still open, with no tab marked
  assert.deepEqual(cur((await get(teacher, '/learn')).text), []);
  assert.deepEqual(cur((await get(teacher, '/teach')).text), ['/teach']);
  assert.deepEqual(cur((await get(teacher, '/live')).text), ['/live']);
  assert.deepEqual(cur((await get(teacher, '/build')).text), ['/build']);
  assert.ok(!/class="navlink" href="\/(?:learn|play|read)"/.test(topnav((await get(teacher, '/teach')).text)), 'no Learn or Read in a teacher\'s top bar');
  assert.deepEqual(shellFor(teacher, {}).tabs.map(([k]) => k).filter(k => ['learn', 'read', 'play'].includes(k)), [], 'staff bars unchanged: neither');
  const sch = (await get(head, `/school/${oak.slug}`)).text;
  assert.deepEqual(cur(sch), ['/me'], 'a school admin on their school: Me (School is in its menu)');
  assert.match(sch, /<a href="\/school" aria-current="page"><span class="theme-ico" aria-hidden="true">🏛️<\/span><span>My school<\/span><\/a>/);
  assert.deepEqual(cur((await get(head, '/teach')).text), ['/teach']);
  assert.deepEqual(curTop((await get(head, '/live')).text), ['/live'], 'a school admin hosting: Live in the top bar');
  assert.deepEqual(cur((await get(ownKid, '/classes')).text), ['/classes']);
  assert.deepEqual(cur((await get(pupil, '/learn')).text), ['/learn']);
});

test('staff have no Friends tab and no friend requests (only unread Oomba team messages count on Me); students count theirs on Me; a kid keeps them on Friends', async () => {
  const pal = auth.createUser({ username: 'RolesPal', password: 'rainbow-77' });
  for (const u of [teacher, kid, ownKid]) q.run("INSERT OR IGNORE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?, 'pending', ?)", pal.id, u.id, Date.now());
  // The team's welcomes (services/team.js) are read, so the badges count the friend request alone.
  for (const u of [teacher, kid, ownKid]) q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND read_at IS NULL', Date.now(), u.id);
  const t = tabbar((await get(teacher, '/learn')).text);
  assert.doesNotMatch(t, /href="\/friends"/);
  assert.doesNotMatch(t, /href="\/me" [^>]*>[\s\S]*?class="badge"/, 'a friend request row for a staff account (it should not exist) lights no badge');
  assert.doesNotMatch(tabbar((await get(boss, '/learn')).text) + topnav((await get(boss, '/learn')).text), /href="\/friends"/, 'the platform admin has no Friends tab either');
  const team = await import('../../server/services/team.js');
  q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES ('rolesteam1',?,?,'A note','team','ok',?)", team.teamUser().id, teacher.id, Date.now());
  assert.match(tabbar((await get(teacher, '/learn')).text), /href="\/me" [^>]*>[\s\S]*?<span class="badge" aria-label="[^"]*">1<\/span><\/a>/, 'an unread message from the Oomba team is the teacher\'s Me badge');
  q.run("DELETE FROM chat_messages WHERE id='rolesteam1'");
  const st = (await get(ownKid, '/learn')).text;
  assert.doesNotMatch(tabbar(st), /href="\/friends"/, 'a student has no Friends tab');
  assert.match(tabbar(st), /href="\/me" [^>]*>[\s\S]*?<span class="badge" aria-label="[^"]*">1<\/span><\/a>/, 'the student\'s Me tab has the badge');
  assert.match(topnav(st), /href="\/friends" ><span class="emo" aria-hidden="true">👫<\/span>Friends<span class="badge"/, 'and Friends stays one click away in their top bar');
  const k = tabbar((await get(kid, '/')).text);
  assert.match(k, /href="\/friends" ><span class="emo" aria-hidden="true">👫<\/span><span class="tab-t">Friends<\/span><span class="badge"/);
  assert.doesNotMatch(k, /href="\/me" [^>]*>[\s\S]*?class="badge"/);
  q.run('DELETE FROM friends WHERE user_id=?', pal.id);
});

test('/school: one school -> its overview (setup checklist and classes); several -> a chooser; anyone else -> 404', async () => {
  assert.equal((await get(head, '/school')).location, `/school/${oak.slug}`);
  const both = auth.createUser({ username: 'RolesTwoSchools', password: 'a-long-password-1' });
  assert.ok(SC.addMember(boss, oak.id, both.id, 'admin').ok); assert.ok(SC.addMember(boss, elm.id, both.id, 'admin').ok);
  const two = await get(both, '/school');
  assert.equal(two.status, 200);
  assert.match(two.text, new RegExp(`href="/school/${oak.slug}"`)); assert.match(two.text, new RegExp(`href="/school/${elm.slug}"`));
  assert.deepEqual([...tabbar(two.text).matchAll(/href="([^"]+)" aria-current="page"/g)].map(m => m[1]), ['/me']);
  SC.removeMember(boss, elm.id, both.id); SC.removeMember(boss, oak.id, both.id);
  for (const u of [teacher, pupil, kid, boss]) assert.equal((await get(u, '/school')).status, 404, u.username);
  assert.equal((await get(mum, '/school')).status, 404);
  assert.match((await get(null, '/school')).location || '', /^\/login/);
});

test('"Make a game" for staff on Me; My classes has Lesson Folder instead ("A simpler teacher home"); not on a kid\'s Me', async () => {
  const mk = /<a class="btn" href="\/build">🛠️ Make a game<\/a>/;
  const home = (await get(teacher, '/teach')).text;
  assert.doesNotMatch(home, mk);
  assert.match(home, /<a class="btn btn-primary" href="\/build" id="teach-folder">[\s\S]*?Lesson Folder<\/a>/);
  assert.match((await get(teacher, '/me')).text, mk);
  assert.match((await get(head, '/me')).text, mk);
  assert.doesNotMatch((await get(kid, '/me')).text, mk);
  assert.doesNotMatch((await get(pupil, '/me')).text, mk);
});

test('footer and notices: a grown-up\'s language and password links go to their Account page', async () => {
  const foot = s => (/<footer class="foot">[\s\S]*?<\/footer>/.exec(s) || [''])[0];
  assert.match(foot((await get(mum, '/learn')).text), /href="\/family\/account#language"/);
  assert.match(foot((await get(kid, '/')).text), /href="\/me\/settings#language"/);
  q.run('UPDATE users SET password_short=1 WHERE id=?', mum.id);
  assert.match((await get(mum, '/learn')).text, /href="\/family\/account#password"/);
  q.run('UPDATE users SET password_short=0 WHERE id=?', mum.id);
});

// docs/decisions.md "A quieter top bar": the owner's "too busy" header. The theme menu, School and Plans left the bars;
// the avatar opens the account menu, whose Settings part has the theme and (adults only) Plans.
test('a quieter top bar: no theme menu, School or Plans in any role\'s bars; the account menu has Settings with the theme, and Plans for adults only', async () => {
  const menu = s => (/<details class="acctpick" data-acctpick>[\s\S]*?<\/details>/.exec(topbar(s)) || [''])[0];
  const foot = s => (/<footer class="foot">[\s\S]*?<\/footer>/.exec(s) || [''])[0];
  const bars = s => topbar(s).replace(menu(s), '') + tabbar(s);
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, playOf(role))).text;
    assert.doesNotMatch(bars(page), /data-themepick|data-theme-choice|class="theme-btn"/, `${role}: no theme menu in the bar`);
    assert.doesNotMatch(bars(page), /href="\/plans"/, `${role}: no Plans in the bars`);
    assert.doesNotMatch(bars(page), /href="\/school"/, `${role}: no School in the bars`);
    assert.match(topbar(page), /<details class="langpick" data-langpick>/, `${role}: the language picker stays`);
  }
  // School staff (a school admin, a teacher): the card that opens Me, Learn and Read tiles, Plans, Settings, Sign out,
  // and the theme as one Auto / Light / Dark switch at the bottom (docs/decisions.md "Teachers' account menu").
  for (const u of [head, teacher]) {
    const m = menu((await get(u, '/learn')).text);
    assert.match(m, /<div class="acct-menu acct-staff">\s*<a class="acct-card" href="\/me"/, `${u.username}: the card first`);
    assert.match(m, /<span class="acct-card-t"><b dir="auto">[^<]+<\/b><small dir="auto">Roles (?:Oak|Elm) School</, `${u.username}: name and school`);
    assert.match(m, /<div class="acct-tiles">\s*<a href="\/learn"[\s\S]*?<a href="\/read"/, `${u.username}: Learn and Read tiles`);
    assert.match(m, /<a href="\/plans" ><span class="theme-ico" aria-hidden="true">⭐<\/span><span>Plans<\/span><\/a>/, `${u.username}: Plans`);
    assert.match(m, /<a href="\/me\/settings" ><span class="theme-ico" aria-hidden="true">⚙️<\/span><span>Settings<\/span><\/a>/, `${u.username}: Settings`);
    assert.match(m, /<form data-api="\/api\/auth\/logout" data-next="\/"><button type="submit" class="acct-out">[\s\S]*?Sign out/, `${u.username}: Sign out`);
    assert.match(m, /<ul class="acct-themeseg" aria-label="Theme">/, `${u.username}: the theme switch`);
    for (const th of ['light', 'dark', 'system']) assert.match(m, new RegExp(`href="/learn\\?theme=${th}" rel="nofollow" data-theme-choice="${th}"`), `${u.username}: ${th}, a plain link`);
    assert.ok(m.indexOf('acct-themeseg') > m.indexOf('acct-out'), `${u.username}: the theme at the bottom`);
    assert.doesNotMatch(m, /\$|€|£|\/month|\/year/, `${u.username}: no prices in the menu`);
  }
  assert.match(menu((await get(head, '/learn')).text), /<a href="\/school" ><span class="theme-ico" aria-hidden="true">🏛️<\/span><span>My school<\/span><\/a>/, 'a school admin: My school');
  assert.doesNotMatch(menu((await get(teacher, '/learn')).text), /href="\/school"/, 'a teacher: no My school');
  // Other adults (a grown-up, the platform admin): Settings with Theme, Plans and All settings.
  for (const u of [mum, boss]) {
    const m = menu((await get(u, '/learn')).text);
    assert.match(m, /<p class="lang-head" id="acct-set-head">Settings<\/p>/, u.username);
    assert.match(m, /<p class="acct-sub" id="acct-theme-head">Theme<\/p>/, u.username);
    for (const th of ['light', 'dark', 'system']) assert.match(m, new RegExp(`href="/learn\\?theme=${th}" rel="nofollow" data-theme-choice="${th}"`), `${u.username}: ${th}, a plain link`);
    assert.match(m, /<a href="\/plans" ><span class="theme-ico" aria-hidden="true">⭐<\/span><span>Plans<\/span><\/a>/, `${u.username}: Plans`);
    assert.doesNotMatch(m, /\$|€|£|\/month|\/year/, `${u.username}: no prices in the menu`);
  }
  // Kids and students: the theme, never Plans.
  for (const u of [pupil, ownKid, kid]) {
    const m = menu((await get(u, '/learn')).text);
    assert.match(m, /data-theme-choice="dark"/, u.username);
    assert.doesNotMatch(m, /href="\/plans"/, `${u.username}: kids are never sold to`);
    assert.doesNotMatch(foot((await get(u, '/learn')).text), /href="\/plans"/, `${u.username}: no Plans in the footer either`);
  }
  // School: in the menu of a school admin only.
  assert.match(menu((await get(head, '/learn')).text), /<a href="\/school" ><span class="theme-ico" aria-hidden="true">🏛️<\/span><span>My school<\/span><\/a>/);
  for (const u of [teacher, pupil, kid, mum]) assert.doesNotMatch(menu((await get(u, '/learn')).text), /href="\/school"/, u.username);
  // Signed out (and a guest): no account menu; Plans and the theme are in the footer.
  for (const u of [null, guest]) {
    const f = foot((await get(u, '/learn')).text);
    assert.match(f, /<a href="\/plans">Plans<\/a>/, 'signed out: Plans in the footer');
    assert.match(f, /<div class="foot-theme"><span id="foot-theme-head">Theme:<\/span><ul class="foot-themes" aria-labelledby="foot-theme-head">/);
    assert.match(f, /data-theme-choice="system"[\s\S]*data-theme-choice="light"[\s\S]*data-theme-choice="dark"/);
  }
  assert.doesNotMatch(foot((await get(mum, '/learn')).text), /foot-theme|href="\/plans"/, 'signed in: the theme and Plans are in the account menu');
  // The chosen theme is ticked in the menu.
  const dark = await fetch(base + '/learn', { headers: { cookie: `${cookieFor(teacher.id)}; theme=dark` } });
  assert.match(menu(await dark.text()), /data-theme-choice="dark" data-label="Theme: Dark" title="Dark" aria-current="true">/, 'a teacher: Dark is on in the switch');
  const darkMum = await fetch(base + '/learn', { headers: { cookie: `${cookieFor(mum.id)}; theme=dark` } });
  assert.match(menu(deicon(await darkMum.text())), /data-theme-choice="dark" data-label="Theme: Dark" aria-current="true"><span class="lang-check" aria-hidden="true">✓<\/span>/, 'a grown-up: Dark is ticked');
  // Paid-plan pages off: no Plans anywhere, the theme stays.
  config.stripeApiKey = '';
  for (const u of [mum, head, teacher, boss]) {
    const m = menu((await get(u, '/learn')).text);
    assert.doesNotMatch(m, /href="\/plans"/, `${u.username}, plans off`); assert.match(m, /data-theme-choice="system"/);
  }
  assert.doesNotMatch(foot((await get(null, '/learn')).text), /href="\/plans"/, 'signed out, plans off: no Plans in the footer');
  assert.match(foot((await get(null, '/learn')).text), /data-theme-choice="dark"/);
});

test('the settings pages: Appearance for everyone, Plans for adults (staff on /me/settings, a grown-up on /family/account)', async () => {
  const plans = /<section class="panel" id="plans" aria-labelledby="plans-h"><h2 id="plans-h"><span aria-hidden="true">⭐<\/span> Plans<\/h2>[\s\S]*?<a class="btn" href="\/plans">See plans<\/a>/;
  for (const u of [head, teacher, boss]) {
    const s = (await get(u, '/me/settings')).text;
    assert.match(s, /id="themeform"/, u.username); assert.match(s, plans, u.username);
    assert.match(s, /<a class="setlink" href="#plans-sec">/, `${u.username}: Plans in the section nav`);
  }
  for (const u of [pupil, ownKid, kid]) {
    const s = (await get(u, '/me/settings')).text;
    assert.match(s, /id="themeform"/, u.username); assert.doesNotMatch(s, /id="plans"|href="\/plans"/, `${u.username}: no Plans`);
  }
  const acct = (await get(mum, '/family/account')).text;
  assert.match(acct, /<form action="\/family\/account#appearance" method="get" id="themeform">/, 'a grown-up can pick the theme on their settings page');
  assert.match(acct, plans);
  config.stripeApiKey = '';
  assert.doesNotMatch((await get(mum, '/family/account')).text, /id="plans"/, 'plans off: no Plans section');
  assert.doesNotMatch((await get(teacher, '/me/settings')).text, /id="plans"/);
});

test('Teaching tools (docs/decisions.md "Figures opens to all teachers"): staff only, current on /figures, FIGURES=0 hides it, in the account menu when the phone bar is full', async () => {
  const toolsLink = /class="navlink" href="\/figures"/;
  const menu = s => (/<details class="acctpick" data-acctpick>[\s\S]*?<\/details>/.exec(s) || [''])[0];
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, playOf(role))).text, staff = role === 'teacher' || role === 'schoolAdmin';
    assert.equal(toolsLink.test(topnav(page)), staff, `${role}: Teaching tools in the top bar`);
    assert.equal(/class="tab" href="\/figures"/.test(tabbar(page)), staff, `${role}: Teaching tools in the tab bar`);
  }
  const t = (await get(teacher, '/figures')).text;
  assert.match(topnav(t), /<a class="navlink" href="\/figures" aria-current="page"><span class="emo" aria-hidden="true">[\s\S]*?<\/span>Teaching tools<\/a>/);
  assert.match(tabbar(t), /<a class="tab" href="\/figures" aria-current="page">[\s\S]*?<span class="tab-t">Tools<\/span><\/a>/);
  assert.doesNotMatch(menu(t), /href="\/figures"/, 'room in the tab bar: not in the account menu');
  // Translated: the label is the language's own.
  assert.match(topnav((await get(teacher, '/figures', { lang: 'es' })).text), /Herramientas docentes<\/a>/);
  // The Story Builder on as well: six would not fit the phone bar, so Teaching tools moves to the account menu (phones).
  config.storyBuilder = true;
  try {
    const s = shellFor(teacher, {});
    assert.deepEqual(s.tabs.map(([k]) => k), ['classroom', 'build', 'stories', 'live', 'me']); assert.ok(s.top.some(([k]) => k === 'tools')); assert.equal(s.toolsInMenu, true);
    const p = (await get(teacher, '/teach')).text;
    assert.match(menu(p), /<li class="acct-phone"><a href="\/figures" [^>]*>[\s\S]*?<span>Teaching tools<\/span><\/a><\/li>/);
    assert.doesNotMatch(tabbar(p), /href="\/figures"/);
  } finally { config.storyBuilder = false; }
  // FIGURES=0: nowhere.
  config.figures = false;
  try {
    for (const u of [teacher, head]) {
      const p = (await get(u, '/teach')).text;
      assert.doesNotMatch(`${topnav(p)}${tabbar(p)}${menu(p)}`, /href="\/figures"/, u.username);
      assert.deepEqual(shellFor(u, {}).tabs.map(([k]) => k), ['classroom', 'build', 'live', 'me']);
    }
  } finally { config.figures = true; }
});

test('the Story Builder on: Stories after Build in the top bar; where a sixth tab would not fit the phone, Stories is in the account menu on phones', async () => {
  const menu = s => (/<details class="acctpick" data-acctpick>[\s\S]*?<\/details>/.exec(s) || [''])[0];
  config.storyBuilder = true;
  try {
    const want = { kid: ['learn', 'read', 'build', 'friends', 'me'], student: ['class', 'learn', 'read', 'build', 'me'], admin: ['learn', 'read', 'build', 'schools', 'me'], grownup: ['family', 'learn', 'read', 'build', 'account'] };
    for (const [role, u] of [['kid', kid], ['student', pupil], ['admin', boss], ['grownup', mum]]) {
      const s = shellFor(u, {});
      assert.deepEqual(s.tabs.map(([k]) => k), want[role], `${role}: five tabs at most`);
      const top = s.top.map(([k]) => k);
      assert.equal(top[top.indexOf('build') + 1], 'stories', `${role}: Stories after Build in the top bar`);
      assert.equal(s.storiesInMenu, true, role);
    }
    const p = (await get(kid, '/learn')).text;
    assert.doesNotMatch(tabbar(p), /href="\/stories"/);
    assert.match(topnav(p), /class="navlink" href="\/stories"/);
    assert.match(menu(p), /<ul class="acct-list acct-phone"><li><a href="\/stories" [^>]*>[\s\S]*?<span>Stories<\/span><\/a><\/li><\/ul>/, 'on phones, in the account menu');
    assert.match(menu((await get(mum, '/learn')).text), /<ul class="acct-list acct-phone"><li><a href="\/stories" /, 'a grown-up\'s too (Family · Learn · Read · Build · Account is five)');
  } finally { config.storyBuilder = false; }
  assert.doesNotMatch(menu((await get(kid, '/learn')).text), /href="\/stories"/, 'Story Builder off: nowhere');
});
