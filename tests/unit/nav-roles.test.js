// Navigation (docs/decisions.md "Navigation shells", "Play and Learn" and "A quieter top bar"): a first tab built for each
// role, Play and Learn shared by all. Every role's phone tab bar and desktop top bar, in order, with paid-plan pages on and
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
  out: { tabs: ['/', '/learn', '/build', '/parents', '/login'], top: ['/', '/learn', '/build', '/parents', '/teachers'] },
  grownup: { tabs: ['/family', '/play', '/learn', '/build', '/family/account'], top: ['/family', '/play', '/learn', '/build'] },
  schoolAdmin: { tabs: ['/teach', '/build', '/live', '/me'], top: ['/teach', '/build', '/live'] },
  teacher: { tabs: ['/teach', '/build', '/live', '/me'], top: ['/teach', '/build', '/live'] },
  admin: { tabs: ['/', '/learn', '/build', '/admin/schools', '/me'], top: ['/', '/learn', '/build', '/admin/schools'] },
  student: { tabs: ['/classes', '/play', '/learn', '/build', '/me'], top: ['/classes', '/play', '/learn', '/build', '/friends'] },
  kid: { tabs: ['/', '/learn', '/build', '/friends', '/me'], top: ['/', '/learn', '/build', '/friends'] },
};
const KEYS = {
  out: ['play', 'learn', 'build', 'grownups', 'signin'],
  grownup: ['family', 'play', 'learn', 'build', 'account'],
  schoolAdmin: ['classroom', 'build', 'live', 'me'],
  teacher: ['classroom', 'build', 'live', 'me'],
  admin: ['play', 'learn', 'build', 'schools', 'me'],
  student: ['class', 'play', 'learn', 'build', 'me'],
  kid: ['play', 'learn', 'build', 'friends', 'me'],
};
/** Where '/' takes each role (null: it shows Play). */
const LANDS = { out: null, grownup: '/family', schoolAdmin: '/school', teacher: '/teach', admin: null, student: '/classes', kid: null };
const PEOPLE = [['out', null], ['out', guest], ['grownup', mum], ['schoolAdmin', head], ['teacher', teacher], ['admin', boss], ['student', pupil], ['student', ownKid], ['kid', kid]];
/** The page each role's menus are read on: Play, which is '/' for some and /play for the rest. */
const playOf = role => (LANDS[role] ? '/play' : '/');
const KID_TAB = "<nav class=\"tabbar\" aria-label=\"Main\">\n    <a class=\"tab\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🎮</span><span class=\"tab-t\">Play</span></a><a class=\"tab\" href=\"/learn\" ><span class=\"emo\" aria-hidden=\"true\">📚</span><span class=\"tab-t\">Learn</span></a><a class=\"tab\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span><span class=\"tab-t\">Build</span></a><a class=\"tab\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span><span class=\"tab-t\">Friends</span></a>\n    <a class=\"tab\" href=\"/me\" ><span class=\"emo\" aria-hidden=\"true\">🦊</span><span class=\"tab-t\">Me</span></a>\n  </nav>";
const KID_TOP = "<nav class=\"topnav\" aria-label=\"Main\">\n      <a class=\"navlink\" href=\"/\" aria-current=\"page\"><span class=\"emo\" aria-hidden=\"true\">🎮</span>Play</a><a class=\"navlink\" href=\"/learn\" ><span class=\"emo\" aria-hidden=\"true\">📚</span>Learn</a><a class=\"navlink\" href=\"/build\" ><span class=\"emo\" aria-hidden=\"true\">🛠️</span>Build</a><a class=\"navlink\" href=\"/friends\" ><span class=\"emo\" aria-hidden=\"true\">👫</span>Friends</a>\n    </nav>";
const off = list => list.filter(h => h !== '/plans');

test('shellFor: every role\'s tab keys, in order, the same with paid-plan pages on and off; never Plans or School', () => {
  const req = {};
  for (const on of [true, false]) {
    if (!on) config.stripeApiKey = '';
    for (const [role, u] of PEOPLE) {
      const s = shellFor(u, req);
      assert.equal(s.role, role, u ? u.username : 'signed out');
      assert.deepEqual(s.tabs.map(([k]) => k), KEYS[role], `${role}, plans ${on ? 'on' : 'off'}`);
      for (const k of ['plans', 'school']) assert.ok(!s.tabs.some(([x]) => x === k) && !s.top.some(([x]) => x === k), `${role}: no ${k} in either bar`);
    }
  }
  // Five tabs for everyone but staff: Classroom · Build · Live · Me for teachers and school admins.
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

test('the kid\'s tab bar and top bar, byte for byte (Play · Learn · Build · Friends · Me)', async () => {
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

test('the avatar: signed in it opens the account menu (Me, or Account for a grown-up, first); signed out it is Sign in', async () => {
  const menu = s => (/<details class="acctpick" data-acctpick>[\s\S]*?<\/details>/.exec(topbar(s)) || [''])[0];
  const first = s => (/<div class="acct-menu">[\s\S]*?<a href="([^"]+)"/.exec(menu(s)) || [])[1];
  const btn = s => (/<a class="me-btn" href="([^"]+)"/.exec(topbar(s)) || [])[1];
  const m = menu((await get(mum, '/play')).text);
  assert.match(m, /<summary class="me-btn" aria-label="Me: RolesMum">/);
  assert.ok(!m.includes('href="/me"'), 'a grown-up has no Me page');
  assert.match(m, /<a href="\/family\/account" ><span class="theme-ico" aria-hidden="true">⚙️<\/span><span>All settings<\/span><\/a>/);
  for (const u of [head, teacher, boss, pupil, kid]) {
    const page = (await get(u, '/play')).text;
    assert.equal(first(page), '/me', u.username);
    assert.match(menu(page), /href="\/me\/settings"/, `${u.username}: All settings`);
    assert.equal(btn(page), undefined, `${u.username}: the avatar is not a plain link any more`);
  }
  assert.equal(btn((await get(null, '/')).text), '/login');
  assert.equal(menu((await get(null, '/')).text), '', 'signed out: no account menu');
  assert.equal(btn((await get(guest, '/play')).text), '/login', 'a guest: Sign in, no account menu');
});

test('labels: the new words in English and in a translated language, and their translated stand-ins (never English) until a language has them', async () => {
  const label = (s, href) => (new RegExp(`class="tab" href="${href}"[^>]*>(?:<span class="emo"[^>]*>[^<]*</span>)<span class="tab-t">([^<]*)</span>`).exec(tabbar(s)) || [])[1];
  const en = (await get(mum, '/play')).text;
  assert.equal(label(en, '/play'), 'Play'); assert.equal(label(en, '/learn'), 'Learn'); assert.equal(label(en, '/family/account'), 'Account'); assert.equal(label(en, '/family'), 'Family');
  const enHead = (await get(head, '/play')).text;
  assert.equal(label(enHead, '/school'), undefined, 'School is in the account menu'); assert.equal(label(enHead, '/teach'), 'Classroom');
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
  assert.equal(label(deHead, '/teach'), dict['nav.classroom']);
  assert.doesNotMatch(tabbar(deHead) + topnav(deHead), /lang="en"/);
  // The new words taken out of German (simulated): Games (else Home), Classes, Me and Schools stand in, never English.
  await withoutKeys('de', ['nav.play', 'nav.account', 'nav.school', 'nav.classroom', 'nav.class'], async () => {
    const gap = (await get(mum, '/play', { lang: 'de' })).text;
    assert.equal(label(gap, '/play'), dict['nav.games']); assert.equal(label(gap, '/family/account'), dict['nav.me']);
    assert.doesNotMatch(tabbar(gap) + topnav(gap), /lang="en"/);
    const gapHead = (await get(head, '/play', { lang: 'de' })).text;
    assert.equal(label(gapHead, '/teach'), dict['nav.classes']);
    assert.doesNotMatch(tabbar(gapHead) + topnav(gapHead), /lang="en"/);
    assert.equal(label((await get(pupil, '/play', { lang: 'de' })).text, '/classes'), dict['nav.classes']);
    await withoutKeys('de', ['nav.games'], async () => {
      assert.equal(label((await get(mum, '/play', { lang: 'de' })).text, '/play'), dict['nav.home'], 'then Home stands in for Play');
    });
  });
});

test('the current tab: Play on the game pages and search, Learn on /learn, Classroom, Class, Live, Family, Account, and Me on School', async () => {
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
  assert.match(acct, /<summary class="me-btn is-current"/);
  assert.match(acct, /<a href="\/family\/account" aria-current="page">/, 'Account in the menu is the page you are on');
  // Teachers' bar is Classroom · Build · Live: Play and Learn still open, with no tab marked
  assert.deepEqual(cur((await get(teacher, '/play')).text), []);
  assert.deepEqual(cur((await get(teacher, '/teach')).text), ['/teach']);
  assert.deepEqual(cur((await get(teacher, '/live')).text), ['/live']);
  assert.deepEqual(cur((await get(teacher, '/build')).text), ['/build']);
  assert.ok(!/class="navlink" href="\/(?:learn|play)"/.test(topnav((await get(teacher, '/teach')).text)), 'no Learn or Play in a teacher\'s top bar');
  const sch = (await get(head, `/school/${oak.slug}`)).text;
  assert.deepEqual(cur(sch), ['/me'], 'a school admin on their school: Me (School is in its menu)');
  assert.match(sch, /<a href="\/school" aria-current="page"><span class="theme-ico" aria-hidden="true">🏛️<\/span><span>My school<\/span><\/a>/);
  assert.deepEqual(cur((await get(head, '/teach')).text), ['/teach']);
  assert.deepEqual(curTop((await get(head, '/live')).text), ['/live'], 'a school admin hosting: Live in the top bar');
  assert.deepEqual(cur((await get(ownKid, '/classes')).text), ['/classes']);
  assert.deepEqual(cur((await get(pupil, '/play')).text), ['/play']);
});

test('staff have no Friends tab and no friend requests (only unread Oomba team messages count on Me); students count theirs on Me; a kid keeps them on Friends', async () => {
  const pal = auth.createUser({ username: 'RolesPal', password: 'rainbow-77' });
  for (const u of [teacher, kid, ownKid]) q.run("INSERT OR IGNORE INTO friends(user_id, friend_id, status, created_at) VALUES (?,?, 'pending', ?)", pal.id, u.id, Date.now());
  // The team's welcomes (services/team.js) are read, so the badges count the friend request alone.
  for (const u of [teacher, kid, ownKid]) q.run('UPDATE chat_messages SET read_at=? WHERE to_id=? AND read_at IS NULL', Date.now(), u.id);
  const t = tabbar((await get(teacher, '/play')).text);
  assert.doesNotMatch(t, /href="\/friends"/);
  assert.doesNotMatch(t, /href="\/me" [^>]*>[\s\S]*?class="badge"/, 'a friend request row for a staff account (it should not exist) lights no badge');
  assert.doesNotMatch(tabbar((await get(boss, '/play')).text) + topnav((await get(boss, '/play')).text), /href="\/friends"/, 'the platform admin has no Friends tab either');
  const team = await import('../../server/services/team.js');
  q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, status, created_at) VALUES ('rolesteam1',?,?,'A note','team','ok',?)", team.teamUser().id, teacher.id, Date.now());
  assert.match(tabbar((await get(teacher, '/play')).text), /href="\/me" [^>]*>[\s\S]*?<span class="badge" aria-label="[^"]*">1<\/span><\/a>/, 'an unread message from the Oomba team is the teacher\'s Me badge');
  q.run("DELETE FROM chat_messages WHERE id='rolesteam1'");
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
  assert.deepEqual([...tabbar(two.text).matchAll(/href="([^"]+)" aria-current="page"/g)].map(m => m[1]), ['/me']);
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
  assert.match(foot((await get(kid, '/')).text), /href="\/me\/settings#language"/);
  q.run('UPDATE users SET password_short=1 WHERE id=?', mum.id);
  assert.match((await get(mum, '/play')).text, /href="\/family\/account#password"/);
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
  // Adults (a grown-up, a school admin, a teacher, the platform admin): Settings with Theme, Plans and All settings.
  for (const u of [mum, head, teacher, boss]) {
    const m = menu((await get(u, '/play')).text);
    assert.match(m, /<p class="lang-head" id="acct-set-head">Settings<\/p>/, u.username);
    assert.match(m, /<p class="acct-sub" id="acct-theme-head">Theme<\/p>/, u.username);
    for (const th of ['light', 'dark', 'system']) assert.match(m, new RegExp(`href="/play\\?theme=${th}" rel="nofollow" data-theme-choice="${th}"`), `${u.username}: ${th}, a plain link`);
    assert.match(m, /<a href="\/plans" ><span class="theme-ico" aria-hidden="true">⭐<\/span><span>Plans<\/span><\/a>/, `${u.username}: Plans`);
    assert.doesNotMatch(m, /\$|€|£|\/month|\/year/, `${u.username}: no prices in the menu`);
  }
  // Kids and students: the theme, never Plans.
  for (const u of [pupil, ownKid, kid]) {
    const m = menu((await get(u, '/play')).text);
    assert.match(m, /data-theme-choice="dark"/, u.username);
    assert.doesNotMatch(m, /href="\/plans"/, `${u.username}: kids are never sold to`);
    assert.doesNotMatch(foot((await get(u, '/play')).text), /href="\/plans"/, `${u.username}: no Plans in the footer either`);
  }
  // School: in the menu of a school admin only.
  assert.match(menu((await get(head, '/play')).text), /<a href="\/school" ><span class="theme-ico" aria-hidden="true">🏛️<\/span><span>My school<\/span><\/a>/);
  for (const u of [teacher, pupil, kid, mum]) assert.doesNotMatch(menu((await get(u, '/play')).text), /href="\/school"/, u.username);
  // Signed out (and a guest): no account menu; Plans and the theme are in the footer.
  for (const u of [null, guest]) {
    const f = foot((await get(u, '/play')).text);
    assert.match(f, /<a href="\/plans">Plans<\/a>/, 'signed out: Plans in the footer');
    assert.match(f, /<div class="foot-theme"><span id="foot-theme-head">Theme:<\/span><ul class="foot-themes" aria-labelledby="foot-theme-head">/);
    assert.match(f, /data-theme-choice="system"[\s\S]*data-theme-choice="light"[\s\S]*data-theme-choice="dark"/);
  }
  assert.doesNotMatch(foot((await get(mum, '/play')).text), /foot-theme|href="\/plans"/, 'signed in: the theme and Plans are in the account menu');
  // The chosen theme is ticked in the menu.
  const dark = await fetch(base + '/play', { headers: { cookie: `${cookieFor(teacher.id)}; theme=dark` } });
  assert.match(menu(await dark.text()), /data-theme-choice="dark" data-label="Theme: Dark" aria-current="true"><span class="lang-check" aria-hidden="true">✓<\/span>/);
  // Paid-plan pages off: no Plans anywhere, the theme stays.
  config.stripeApiKey = '';
  for (const u of [mum, head, teacher, boss]) {
    const m = menu((await get(u, '/play')).text);
    assert.doesNotMatch(m, /href="\/plans"/, `${u.username}, plans off`); assert.match(m, /data-theme-choice="system"/);
  }
  assert.doesNotMatch(foot((await get(null, '/play')).text), /href="\/plans"/, 'signed out, plans off: no Plans in the footer');
  assert.match(foot((await get(null, '/play')).text), /data-theme-choice="dark"/);
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
