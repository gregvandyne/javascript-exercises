// Navigation weeks 3–4 (docs/decisions.md "Navigation shells"): a tab bar for each role. Every role's phone tab bar and
// desktop top bar, in order, with paid-plan pages on and off; Plans in every signed-in list while they are on (kids' and
// students' too); the kid's bar byte for byte as before; the stand-in labels until a language has the new words (never
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

const ON = {
  out: { tabs: ['/', '/search', '/build', '/parents', '/plans', '/login'], top: ['/', '/build', '/plans', '/parents', '/teachers'] },
  grownup: { tabs: ['/family', '/build', '/', '/plans', '/family/account'], top: ['/family', '/build', '/', '/plans'] },
  schoolAdmin: { tabs: ['/teach', '/', '/school', '/plans', '/me'], top: ['/teach', '/', '/school', '/plans'] },
  teacher: { tabs: ['/teach', '/', '/plans', '/me'], top: ['/teach', '/', '/plans'] },
  admin: { tabs: ['/', '/search', '/build', '/friends', '/admin/schools', '/plans', '/me'], top: ['/', '/search', '/build', '/friends', '/admin/schools', '/plans'] },
  student: { tabs: ['/', '/classes', '/build', '/friends', '/plans', '/me'], top: ['/', '/classes', '/build', '/friends', '/plans'] },
  kid: { tabs: ['/', '/search', '/build', '/friends', '/plans', '/me'], top: ['/', '/search', '/build', '/friends', '/plans'] },
};
const KEYS = {
  out: ['home', 'search', 'build', 'grownups', 'plans', 'signin'],
  grownup: ['family', 'build', 'games', 'plans', 'account'],
  schoolAdmin: ['classes', 'games', 'school', 'plans', 'me'],
  teacher: ['classes', 'games', 'plans', 'me'],
  admin: ['home', 'search', 'build', 'friends', 'schools', 'plans', 'me'],
  student: ['home', 'classes', 'build', 'friends', 'plans', 'me'],
  kid: ['home', 'search', 'build', 'friends', 'plans', 'me'],
};
const PEOPLE = [['out', null], ['out', guest], ['grownup', mum], ['schoolAdmin', head], ['teacher', teacher], ['admin', boss], ['student', pupil], ['student', ownKid], ['kid', kid]];
const KID_TAB = "<nav class=\"tabbar\" aria-label=\"Main\">\n    <a class=\"tab\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🏠</span><span class=\"tab-t\">Home</span></a><a class=\"tab\" href=\"/search\" ><span class=\"emo\" aria-hidden=\"true\">🔎</span><span class=\"tab-t\">Search</span></a><a class=\"tab\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span><span class=\"tab-t\">Build</span></a><a class=\"tab\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span><span class=\"tab-t\">Friends</span></a><a class=\"tab\" href=\"/plans\" ><span class=\"emo\" aria-hidden=\"true\">⭐</span><span class=\"tab-t\">Plans</span></a>\n    <a class=\"tab\" href=\"/me\" ><span class=\"emo\" aria-hidden=\"true\">🦊</span><span class=\"tab-t\">Me</span></a>\n  </nav>";
const KID_TOP = "<nav class=\"topnav\" aria-label=\"Main\">\n      <a class=\"navlink\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🏠</span>Home</a><a class=\"navlink\" href=\"/search\" ><span class=\"emo\" aria-hidden=\"true\">🔎</span>Search</a><a class=\"navlink\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span>Build</a><a class=\"navlink\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span>Friends</a><a class=\"navlink\" href=\"/plans\" ><span class=\"emo\" aria-hidden=\"true\">⭐</span>Plans</a>\n    </nav>";
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
  // With billing off: a grown-up has 4 tabs (Family · Build · Games · Account), an admin teacher 4, a plain teacher 3.
  assert.equal(shellFor(mum, req).tabs.length, 4); assert.equal(shellFor(head, req).tabs.length, 4); assert.equal(shellFor(teacher, req).tabs.length, 3);
});

test('every role\'s phone tab bar and desktop top bar on the page, plans on and off; search in every top bar', async () => {
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, '/')).text;
    assert.deepEqual(hrefs(tabbar(page), 'tab'), ON[role].tabs, `${role} ${u ? u.username : ''}: tab bar`);
    assert.deepEqual(hrefs(topnav(page), 'navlink'), ON[role].top, `${role}: top bar`);
    // Search: the field (360px and wider) and the round button (below 360px) are both in every top bar.
    assert.match(topbar(page), /<form class="topsearch" role="search" action="\/search"/, `${role}: search field`);
    assert.match(topbar(page), /<a class="topsearch-btn" href="\/search"/, `${role}: search button`);
  }
  config.stripeApiKey = '';
  for (const [role, u] of PEOPLE) {
    const page = (await get(u, '/')).text;
    assert.deepEqual(hrefs(tabbar(page), 'tab'), off(ON[role].tabs), `${role}, plans off: tab bar`);
    assert.deepEqual(hrefs(topnav(page), 'navlink'), off(ON[role].top), `${role}, plans off: top bar`);
  }
});

test('the kid\'s tab bar and top bar are byte for byte as before (Home · Search · Build · Friends · Plans · Me)', async () => {
  const page = (await get(kid, '/')).text;
  assert.equal(tabbar(page), KID_TAB);
  assert.equal(topnav(page), KID_TOP);
});

test('the avatar button: Account for a grown-up, Me for staff, students and kids, Sign in signed out', async () => {
  const btn = s => (/<a class="me-btn" href="([^"]+)"/.exec(s) || [])[1];
  assert.equal(btn((await get(mum, '/')).text), '/family/account');
  for (const u of [head, teacher, boss, pupil, kid]) assert.equal(btn((await get(u, '/')).text), '/me', u.username);
  assert.equal(btn((await get(null, '/')).text), '/login');
});

test('labels: the new words in English and in a translated language, and their translated stand-ins (never English) until a language has them', async () => {
  const label = (s, href) => (new RegExp(`class="tab" href="${href}"[^>]*>(?:<span class="emo"[^>]*>[^<]*</span>)<span class="tab-t">([^<]*)</span>`).exec(tabbar(s)) || [])[1];
  const en = (await get(mum, '/')).text;
  assert.equal(label(en, '/'), 'Games'); assert.equal(label(en, '/family/account'), 'Account'); assert.equal(label(en, '/family'), 'Family');
  assert.equal(label((await get(head, '/')).text, '/school'), 'School');
  // German has the new words: German labels, nothing marked English.
  const { dictionary } = await import('../../server/i18n/index.js');
  const dict = dictionary('de');
  const de = (await get(mum, '/', { lang: 'de' })).text;
  assert.equal(label(de, '/'), dict['nav.games']); assert.equal(label(de, '/family/account'), dict['nav.account']); assert.equal(label(de, '/family'), dict['nav.family']);
  assert.notEqual(dict['nav.games'], 'Games'); assert.notEqual(dict['nav.account'], 'Account');
  assert.doesNotMatch(tabbar(de) + topnav(de), /lang="en"/);
  const deHead = (await get(head, '/', { lang: 'de' })).text;
  assert.equal(label(deHead, '/school'), dict['nav.school']);
  assert.match(topnav(deHead), new RegExp(`href="/school" ><span class="emo" aria-hidden="true">🏛️</span>${dict['nav.school']}</a>`));
  assert.doesNotMatch(tabbar(deHead) + topnav(deHead), /lang="en"/);
  // The new words taken out of German (simulated): its Home, Me and Schools stand in, and nothing is marked English.
  await withoutKeys('de', ['nav.games', 'nav.account', 'nav.school'], async () => {
    const gap = (await get(mum, '/', { lang: 'de' })).text;
    assert.equal(label(gap, '/'), dict['nav.home']); assert.equal(label(gap, '/family/account'), dict['nav.me']);
    assert.doesNotMatch(tabbar(gap) + topnav(gap), /lang="en"/);
    const gapHead = (await get(head, '/', { lang: 'de' })).text;
    assert.equal(label(gapHead, '/school'), dict['nav.schools']);
    assert.match(topnav(gapHead), new RegExp(`href="/school" ><span class="emo" aria-hidden="true">🏛️</span>${dict['nav.schools']}</a>`));
    assert.doesNotMatch(tabbar(gapHead) + topnav(gapHead), /lang="en"/);
  });
});

test('the current tab: game pages are Games where there is no Home tab; Family, Account, Classes and School', async () => {
  const cur = s => [...tabbar(s).matchAll(/class="tab" href="([^"]+)" aria-current="page"/g)].map(m => m[1]);
  const s0 = shellFor(mum, {});
  assert.equal(currentTab(s0, 'home'), 'games'); assert.equal(currentTab(s0, 'search'), 'games'); assert.equal(currentTab(s0, 'family'), 'family');
  assert.equal(currentTab(shellFor(kid, {}), 'home'), 'home');
  assert.equal(currentTab(shellFor(boss, {}), 'classes'), 'schools', 'the Classes area is Schools for the platform admin');
  assert.deepEqual(cur((await get(mum, '/')).text), ['/']);
  assert.deepEqual(cur((await get(mum, '/search')).text), ['/']);
  assert.deepEqual(cur((await get(mum, '/family')).text), ['/family']);
  const acct = (await get(mum, '/family/account')).text;
  assert.deepEqual(cur(acct), ['/family/account']);
  assert.match(acct, /<a class="me-btn" href="\/family\/account" aria-current="page"/);
  assert.deepEqual(cur((await get(teacher, '/')).text), ['/']);
  assert.deepEqual(cur((await get(teacher, '/teach')).text), ['/teach']);
  assert.deepEqual(cur((await get(head, `/school/${oak.slug}`)).text), ['/school'], 'a school admin on their school: School');
  assert.deepEqual(cur((await get(head, '/teach')).text), ['/teach']);
  assert.deepEqual(cur((await get(ownKid, '/classes')).text), ['/classes']);
});

test('staff have no Friends tab: friend requests and unread chat count on Me; a kid keeps them on Friends', async () => {
  const pal = auth.createUser({ username: 'RolesPal', password: 'rainbow-77' });
  for (const u of [teacher, kid]) q.run("INSERT OR IGNORE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?, 'pending', ?)", pal.id, u.id, Date.now());
  const t = tabbar((await get(teacher, '/')).text);
  assert.doesNotMatch(t, /href="\/friends"/);
  assert.match(t, /href="\/me" [^>]*>[\s\S]*?<span class="badge" aria-label="[^"]*">1<\/span><\/a>/, 'the teacher\'s Me tab has the badge');
  const k = tabbar((await get(kid, '/')).text);
  assert.match(k, /href="\/friends" ><span class="emo" aria-hidden="true">👫<\/span><span class="tab-t">Friends<\/span><span class="badge"/);
  assert.doesNotMatch(k, /href="\/me" [^>]*>[\s\S]*?class="badge"/);
  q.run('DELETE FROM friends WHERE user_id=?', pal.id);
});

test('/school: one school -> its People tab; several -> a chooser; anyone else -> 404', async () => {
  assert.equal((await get(head, '/school')).location, `/school/${oak.slug}?tab=people`);
  const both = auth.createUser({ username: 'RolesTwoSchools', password: 'a-long-password-1' });
  assert.ok(SC.addMember(boss, oak.id, both.id, 'admin').ok); assert.ok(SC.addMember(boss, elm.id, both.id, 'admin').ok);
  const two = await get(both, '/school');
  assert.equal(two.status, 200);
  assert.match(two.text, new RegExp(`href="/school/${oak.slug}\\?tab=people"`)); assert.match(two.text, new RegExp(`href="/school/${elm.slug}\\?tab=people"`));
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
  assert.match(foot((await get(mum, '/')).text), /href="\/family\/account#language"/);
  assert.match(foot((await get(kid, '/')).text), /href="\/me#language"/);
  q.run('UPDATE users SET password_short=1 WHERE id=?', mum.id);
  assert.match((await get(mum, '/')).text, /href="\/family\/account#password"/);
  q.run('UPDATE users SET password_short=0 WHERE id=?', mum.id);
});
