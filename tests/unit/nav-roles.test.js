// Navigation (docs/decisions.md "Navigation shells" and "Play and Learn"): a first tab built for each role, Play and Learn
// shared by all. Every role's phone tab bar and desktop top bar, in order, with paid-plan pages on and off; Plans in every
// signed-in list while they are on (kids' and students' too); where '/' takes each role; the kid's bar byte for byte; the stand-in labels until a language has the new words (never
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

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function get(u, path, { lang } = {}) {
  const cookie = [u ? cookieFor(u.id) : '', lang ? `lang=${lang}` : ''].filter(Boolean).join('; ');
  const r = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
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

// Play is '/' for those who land on it (signed out, kids, the platform admin) and /play for everyone whose first tab is
// another one; Search is the top bar's field for everyone, never a tab; Live (hosting) only while Oomba Live is on (it is).
const ON = {
  out: { tabs: ['/', '/learn', '/build', '/parents', '/plans', '/login'], top: ['/', '/learn', '/build', '/plans', '/parents', '/teachers'] },
  grownup: { tabs: ['/family', '/play', '/learn', '/build', '/plans', '/family/account'], top: ['/family', '/play', '/learn', '/build', '/plans'] },
  schoolAdmin: { tabs: ['/school', '/teach', '/learn', '/play', '/plans', '/me'], top: ['/school', '/teach', '/learn', '/play', '/live', '/plans'] },
  teacher: { tabs: ['/teach', '/learn', '/play', '/live', '/plans', '/me'], top: ['/teach', '/learn', '/play', '/live', '/plans'] },
  admin: { tabs: ['/', '/learn', '/build', '/friends', '/admin/schools', '/plans', '/me'], top: ['/', '/learn', '/build', '/friends', '/admin/schools', '/plans'] },
  student: { tabs: ['/classes', '/play', '/learn', '/build', '/plans', '/me'], top: ['/classes', '/play', '/learn', '/build', '/friends', '/plans'] },
  kid: { tabs: ['/', '/learn', '/build', '/friends', '/plans', '/me'], top: ['/', '/learn', '/build', '/friends', '/plans'] },
};
const KEYS = {
  out: ['play', 'learn', 'build', 'grownups', 'plans', 'signin'],
  grownup: ['family', 'play', 'learn', 'build', 'plans', 'account'],
  schoolAdmin: ['school', 'classroom', 'learn', 'play', 'plans', 'me'],
  teacher: ['classroom', 'learn', 'play', 'live', 'plans', 'me'],
  admin: ['play', 'learn', 'build', 'friends', 'schools', 'plans', 'me'],
  student: ['class', 'play', 'learn', 'build', 'plans', 'me'],
  kid: ['play', 'learn', 'build', 'friends', 'plans', 'me'],
};
/** Where '/' takes each role (null: it shows Play). */
const LANDS = { out: null, grownup: '/family', schoolAdmin: '/school', teacher: '/teach', admin: null, student: '/classes', kid: null };
const PEOPLE = [['out', null], ['out', guest], ['grownup', mum], ['schoolAdmin', head], ['teacher', teacher], ['admin', boss], ['student', pupil], ['student', ownKid], ['kid', kid]];
/** The page each role's menus are read on: Play, which is '/' for some and /play for the rest. */
const playOf = role => (LANDS[role] ? '/play' : '/');
const KID_TAB = "<nav class=\"tabbar\" aria-label=\"Main\">\n    <a class=\"tab\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🎮</span><span class=\"tab-t\">Play</span></a><a class=\"tab\" href=\"/learn\" ><span class=\"emo\" aria-hidden=\"true\">📚</span><span class=\"tab-t\">Learn</span></a><a class=\"tab\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span><span class=\"tab-t\">Build</span></a><a class=\"tab\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span><span class=\"tab-t\">Friends</span></a><a class=\"tab\" href=\"/plans\" ><span class=\"emo\" aria-hidden=\"true\">⭐</span><span class=\"tab-t\">Plans</span></a>\n    <a class=\"tab\" href=\"/me\" ><span class=\"emo\" aria-hidden=\"true\">🦊</span><span class=\"tab-t\">Me</span></a>\n  </nav>";
const KID_TOP = "<nav class=\"topnav\" aria-label=\"Main\">\n      <a class=\"navlink\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🎮</span>Play</a><a class=\"navlink\" href=\"/learn\" ><span class=\"emo\" aria-hidden=\"true\">📚</span>Learn</a><a class=\"navlink\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span>Build</a><a class=\"navlink\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span>Friends</a><a class=\"navlink\" href=\"/plans\" ><span class=\"emo\" aria-hidden=\"true\">⭐</span>Plans</a>\n    </nav>";
const off = list => list.filter(h => h !== '/plans');

test('shellFor: every role\'s tab keys, in order, with paid-plan pages on and off; Plans in every list while on', () => {
  const req = {};
  for (const [role, u] of PEOPLE) {
    const s = shellFor(u, req);
    assert.equal(s.role, role, u ? u.username : 'signed out');
    assert.deepEqual(s.tabs.map(([k]) => k), KEYS[role], role);
    assert.ok(s.tabs.some(([k]) => k === 'plans') && s.top.some(([k]) => k === 'plans'), `${role}: Plans while plans are on`);
  }
  config.stripeApiKey = '';
  for (const [role, u] of PEOPLE) {
    const s = shellFor(u, req);
    assert.deepEqual(s.tabs.map(([k]) => k), KEYS[role].filter(k => k !== 'plans'), `${role}, plans off`);
    assert.ok(!s.top.some(([k]) => k === 'plans'), `${role}: no Plans while plans are off`);
  }
  // With billing off: five tabs for everyone (the design's "first tab per role" bars), seven for the platform admin's six.
  assert.equal(shellFor(mum, req).tabs.length, 5); assert.equal(shellFor(head, req).tabs.length, 5); assert.equal(shellFor(teacher, req).tabs.length, 5);
  assert.equal(shellFor(pupil, req).tabs.length, 5); assert.equal(shellFor(kid, req).tabs.length, 5); assert.equal(shellFor(null, req).tabs.length, 5);
  assert.equal(shellFor(boss, req).tabs.length, 6);
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

test('the kid\'s tab bar and top bar, byte for byte (Play · Learn · Build · Friends · Plans · Me)', async () => {
  // A new kid's first sign-in brings the team's automatic welcome (services/team.js, docs/decisions.md "Automatic
  // welcome"): their one unread message, so a badge on Friends. Read, the bars are exactly these.
  const official = auth.getUserByName(auth.OFFICIAL);
  await get(kid, '/');
  const unread = q.all('SELECT from_id FROM chat_messages WHERE to_id=? AND read_at IS NULL', kid.id);
  assert.deepEqual(unread.map(m => m.from_id), [official.id], 'the team\'s welcome is the kid\'s only unread message');
  assert.match(tabbar((await get(kid, '/')).text), /<span class="tab-t">Friends<\/span><span class="badge" aria-label="1 new">1<\/span>/);
  q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND read_at IS NULL', Date.now(), kid.id);
  const page = (await get(kid, '/')).text;
  assert.equal(tabbar(page), KID_TAB);
  assert.equal(topnav(page), KID_TOP);
});

test('\'/\' per role: Play for the signed out, guests, kids and the platform admin; everyone else to their first tab, never cached; /play is Play for all', async () => {
  for (const [role, u] of PEOPLE) {
    const r = await get(u, '/');
    if (LANDS[role]) {
      assert.equal(r.status, 302, role); assert.equal(r.location, LANDS[role], role);
      const raw = await fetch(base + '/', { headers: { cookie: cookieFor(u.id) }, redirect: 'manual' });
      assert.match(raw.headers.get('cache-control') || '', /no-store/, `${role}: a redirect is never cached`);
      assert.match(raw.headers.get('cache-control') || '', /private/, role);
    } else {
      assert.equal(r.status, 200, role);
      assert.match(r.text, /<div id="play" class="home-play">/, role);
    }
    const p = await get(u, '/play');
    assert.equal(p.status, 200, `${role}: /play`);
    assert.match(p.text, /<div id="play" class="home-play">/, `${role}: /play is Play`);
    assert.match(p.text, /<meta name="robots" content="noindex/, `${role}: /play is never indexed`);
  }
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

test('the avatar button: Account for a grown-up, Me for staff, students and kids, Sign in signed out', async () => {
  const btn = s => (/<a class="me-btn" href="([^"]+)"/.exec(s) || [])[1];
  assert.equal(btn((await get(mum, '/play')).text), '/family/account');
  for (const u of [head, teacher, boss, pupil, kid]) assert.equal(btn((await get(u, '/play')).text), '/me', u.username);
  assert.equal(btn((await get(null, '/')).text), '/login');
});

test('labels: the new words in English and in a translated language, and their translated stand-ins (never English) until a language has them', async () => {
  const label = (s, href) => (new RegExp(`class="tab" href="${href}"[^>]*>(?:<span class="emo"[^>]*>[^<]*</span>)<span class="tab-t">([^<]*)</span>`).exec(tabbar(s)) || [])[1];
  const en = (await get(mum, '/play')).text;
  assert.equal(label(en, '/play'), 'Play'); assert.equal(label(en, '/learn'), 'Learn'); assert.equal(label(en, '/family/account'), 'Account'); assert.equal(label(en, '/family'), 'Family');
  const enHead = (await get(head, '/play')).text;
  assert.equal(label(enHead, '/school'), 'School'); assert.equal(label(enHead, '/teach'), 'Classroom');
  assert.equal(label((await get(pupil, '/play')).text, '/classes'), 'Class');
  assert.equal(label((await get(teacher, '/play')).text, '/live'), 'Live');
  // German has the new words: German labels, nothing marked English.
  const { dictionary } = await import('../../server/i18n/index.js');
  const dict = dictionary('de');
  const de = (await get(mum, '/play', { lang: 'de' })).text;
  assert.equal(label(de, '/play'), dict['nav.play']); assert.equal(label(de, '/learn'), dict['nav.learn']); assert.equal(label(de, '/family/account'), dict['nav.account']); assert.equal(label(de, '/family'), dict['nav.family']);
  for (const k of ['nav.play', 'nav.learn', 'nav.class', 'nav.classroom', 'nav.account']) assert.ok(dict[k] && dict[k] !== dictionary('en')[k] || k === 'nav.live', k);
  assert.doesNotMatch(tabbar(de) + topnav(de), /lang="en"/);
  const deHead = (await get(head, '/play', { lang: 'de' })).text;
  assert.equal(label(deHead, '/school'), dict['nav.school']); assert.equal(label(deHead, '/teach'), dict['nav.classroom']);
  assert.match(topnav(deHead), new RegExp(`href="/school" aria-current="page"|href="/school" ><span class="emo" aria-hidden="true">🏛️</span>${dict['nav.school']}</a>`));
  assert.doesNotMatch(tabbar(deHead) + topnav(deHead), /lang="en"/);
  // The new words taken out of German (simulated): Games (else Home), Classes, Me and Schools stand in, never English.
  await withoutKeys('de', ['nav.play', 'nav.account', 'nav.school', 'nav.classroom', 'nav.class'], async () => {
    const gap = (await get(mum, '/play', { lang: 'de' })).text;
    assert.equal(label(gap, '/play'), dict['nav.games']); assert.equal(label(gap, '/family/account'), dict['nav.me']);
    assert.doesNotMatch(tabbar(gap) + topnav(gap), /lang="en"/);
    const gapHead = (await get(head, '/play', { lang: 'de' })).text;
    assert.equal(label(gapHead, '/school'), dict['nav.schools']); assert.equal(label(gapHead, '/teach'), dict['nav.classes']);
    assert.match(topnav(gapHead), new RegExp(`href="/school" ><span class="emo" aria-hidden="true">🏛️</span>${dict['nav.schools']}</a>`));
    assert.doesNotMatch(tabbar(gapHead) + topnav(gapHead), /lang="en"/);
    assert.equal(label((await get(pupil, '/play', { lang: 'de' })).text, '/classes'), dict['nav.classes']);
    await withoutKeys('de', ['nav.games'], async () => {
      assert.equal(label((await get(mum, '/play', { lang: 'de' })).text, '/play'), dict['nav.home'], 'then Home stands in for Play');
    });
  });
});

test('the current tab: Play on the game pages and search, Learn on /learn, Classroom, Class, Live, Family, Account and School', async () => {
  const cur = s => [...tabbar(s).matchAll(/class="tab" href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
  const curTop = s => [...topnav(s).matchAll(/class="navlink" href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
  const s0 = shellFor(mum, {});
  for (const a of ['home', 'play', 'search']) assert.equal(currentTab(s0, a), 'play', a);
  assert.equal(currentTab(s0, 'family'), 'family'); assert.equal(currentTab(s0, 'learn'), 'learn');
  assert.equal(currentTab(shellFor(kid, {}), 'home'), 'play');
  assert.equal(currentTab(shellFor(teacher, {}), 'classes'), 'classroom'); assert.equal(currentTab(shellFor(teacher, {}), 'live'), 'live');
  assert.equal(currentTab(shellFor(pupil, {}), 'classes'), 'class');
  assert.equal(currentTab(shellFor(boss, {}), 'classes'), 'schools', 'the Classes area is Schools for the platform admin');
  assert.deepEqual(cur((await get(kid, '/')).text), ['/']);
  assert.deepEqual(cur((await get(kid, '/search')).text), ['/'], 'a search is browsing the library: Play');
  assert.deepEqual(cur((await get(kid, '/learn')).text), ['/learn']);
  assert.deepEqual(cur((await get(kid, '/learn/math-games')).text), ['/learn']);
  assert.deepEqual(cur((await get(mum, '/play')).text), ['/play']);
  assert.deepEqual(cur((await get(mum, '/search')).text), ['/play']);
  assert.deepEqual(cur((await get(mum, '/learn')).text), ['/learn']);
  assert.deepEqual(cur((await get(mum, '/family')).text), ['/family']);
  const acct = (await get(mum, '/family/account')).text;
  assert.deepEqual(cur(acct), ['/family/account']);
  assert.match(acct, /<a class="me-btn" href="\/family\/account" aria-current="page"/);
  assert.deepEqual(cur((await get(teacher, '/play')).text), ['/play']);
  assert.deepEqual(cur((await get(teacher, '/teach')).text), ['/teach']);
  assert.deepEqual(cur((await get(teacher, '/live')).text), ['/live']);
  assert.deepEqual(cur((await get(teacher, '/learn')).text), ['/learn']);
  assert.deepEqual(cur((await get(head, `/school/${oak.slug}`)).text), ['/school'], 'a school admin on their school: School');
  assert.deepEqual(cur((await get(head, '/teach')).text), ['/teach']);
  assert.deepEqual(curTop((await get(head, '/live')).text), ['/live'], 'a school admin hosting: Live in the top bar');
  assert.deepEqual(cur((await get(ownKid, '/classes')).text), ['/classes']);
  assert.deepEqual(cur((await get(pupil, '/play')).text), ['/play']);
});

test('staff and students have no Friends tab: friend requests and unread chat count on Me; a kid keeps them on Friends', async () => {
  const pal = auth.createUser({ username: 'RolesPal', password: 'rainbow-77' });
  for (const u of [teacher, kid, ownKid]) q.run("INSERT OR IGNORE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?, 'pending', ?)", pal.id, u.id, Date.now());
  // The team's welcomes (services/team.js) are read, so the badges count the friend request alone.
  for (const u of [teacher, kid, ownKid]) q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND read_at IS NULL', Date.now(), u.id);
  const t = tabbar((await get(teacher, '/play')).text);
  assert.doesNotMatch(t, /href="\/friends"/);
  assert.match(t, /href="\/me" [^>]*>[\s\S]*?<span class="badge" aria-label="[^"]*">1<\/span><\/a>/, 'the teacher\'s Me tab has the badge');
  const st = (await get(ownKid, '/play')).text;
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
  assert.deepEqual([...tabbar(two.text).matchAll(/href="([^"]+)" aria-current="page"/g)].map(m => m[1]), ['/school']);
  SC.removeMember(boss, elm.id, both.id); SC.removeMember(boss, oak.id, both.id);
  for (const u of [teacher, pupil, kid, boss]) assert.equal((await get(u, '/school')).status, 404, u.username);
  assert.equal((await get(mum, '/school')).status, 404);
  assert.match((await get(null, '/school')).location || '', /^\/login/);
});

test('"Make a game" for staff: on My classes and on Me (they have no Build tab); not on a kid\'s Me', async () => {
  const mk = /<a class="btn" href="\/build">🛠️ Make a game<\/a>/;
  assert.match((await get(teacher, '/teach')).text, mk);
  assert.match((await get(teacher, '/me')).text, mk);
  assert.match((await get(head, '/me')).text, mk);
  assert.doesNotMatch((await get(kid, '/me')).text, mk);
  assert.doesNotMatch((await get(pupil, '/me')).text, mk);
});

test('footer and notices: a grown-up\'s language and password links go to their Account page', async () => {
  const foot = s => (/<footer class="foot">[\s\S]*?<\/footer>/.exec(s) || [''])[0];
  assert.match(foot((await get(mum, '/play')).text), /href="\/family\/account#language"/);
  assert.match(foot((await get(kid, '/')).text), /href="\/me#language"/);
  q.run('UPDATE users SET password_short=1 WHERE id=?', mum.id);
  assert.match((await get(mum, '/play')).text, /href="\/family\/account#password"/);
  q.run('UPDATE users SET password_short=0 WHERE id=?', mum.id);
});
