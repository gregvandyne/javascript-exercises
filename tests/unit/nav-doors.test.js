// Doors for grown-ups (the navigation proposal's Week 1): a guest counts as signed out in the menus, the home intro and
// the footer; signed out, the phone tab bar has a Grown-ups tab and no Friends; /parents, /safety, /login and /signup
// lead parents to their own sign-up; /build explains itself to a grown-up; /learn is a hub; game and subject pages
// point teachers to /teachers and kids to the Builder; grown-ups may sign up with their real name and get no kid emoji.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_nav', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_nav';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const TF = await import('../../server/services/textfilter.js');
const { avatar } = await import('../../server/views/components.js');
const { HUBS, AGES } = await import('../../server/learn.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body } = {}) {
  const h = cookie ? { cookie } : {}; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
const as = u => (path, opts) => call(u ? cookieFor(u.id) : null, path, opts);
let n = 0;
const kid = () => auth.createUser({ username: `NavKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `NavParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
const tabbar = s => (/<nav class="tabbar"[\s\S]*?<\/nav>/.exec(s) || [''])[0];
const topnav = s => (/<nav class="topnav"[\s\S]*?<\/nav>/.exec(s) || [''])[0];
const footer = s => (/<footer class="foot">[\s\S]*?<\/footer>/.exec(s) || [''])[0];

test('signed out and guests get the same doors: Grown-ups tab, no Friends, Parents and Teachers on top, the home intro, the footer Teachers link', async () => {
  for (const [who, u] of [['signed out', null], ['guest', auth.createGuest()]]) {
    const home = await as(u)('/');
    assert.equal(home.status, 200);
    const tabs = tabbar(home.text);
    const order = [...tabs.matchAll(/class="tab" href="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(order, ['/', '/search', '/build', '/parents', '/plans', '/login'], `${who}: Home · Search · Build · Grown-ups · Plans · Sign in`);
    assert.match(tabs, /👪<\/span><span class="tab-t">Grown-ups<\/span>/, who);
    assert.doesNotMatch(tabs + topnav(home.text), /href="\/friends"/, `${who}: no Friends before an account`);
    assert.match(topnav(home.text), /href="\/parents"/, who); assert.match(topnav(home.text), /href="\/teachers"/, who);
    assert.match(home.text, /class="home-intro"/, `${who}: the home intro with its parent and teacher buttons`);
    assert.match(footer(home.text), /href="\/teachers"/, `${who}: footer Teachers`);
    assert.match(footer(home.text), /href="\/parents"/, `${who}: footer Parents`);
    // The Grown-ups tab is current on the parent and teacher pages.
    assert.match(tabbar((await as(u)('/parents')).text), /href="\/parents" aria-current="page"/, who);
    // Sign in is current on the sign-in page, never on a guest's own Me page.
    assert.match(tabbar((await as(u)('/login')).text), /href="\/login" aria-current="page"/, who);
    if (u) {
      const me = await as(u)('/me');
      assert.equal(me.status, 200);
      assert.doesNotMatch(tabbar(me.text), /aria-current/, `${who}: no tab says Sign in is this page`);
    }
  }
});

test('a kid with an account keeps their tab bar (Friends, Me) and no grown-up doors; plans off hides Plans for everyone', async () => {
  const k = kid();
  const home = await as(k)('/');
  const order = [...tabbar(home.text).matchAll(/class="tab" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(order, ['/', '/search', '/build', '/friends', '/plans', '/me']);
  assert.doesNotMatch(topnav(home.text), /href="\/(parents|teachers)"/);
  assert.doesNotMatch(home.text, /class="home-intro"/);
  assert.doesNotMatch(footer(home.text), /href="\/teachers"/);
  config.stripeApiKey = '';
  const off = await call(null, '/');
  assert.deepEqual([...tabbar(off.text).matchAll(/class="tab" href="([^"]+)"/g)].map(m => m[1]), ['/', '/search', '/build', '/parents', '/login']);
});

test('/parents: "Set up your child — free" (grown-up sign-up) and "Try a game" at the top; before plans are public, the child sign-up', async () => {
  const on = await call(null, '/parents');
  const hero = /<section class="lp-hero"[\s\S]*?<\/section>/.exec(on.text)[0];
  assert.match(hero, /<a class="btn btn-primary btn-big" href="\/grown-ups\/signup">Set up your child — free<\/a>/);
  assert.match(hero, /href="\/play\/[a-z0-9-]+" rel="nofollow">▶ /);
  assert.match(hero, /href="\/teachers"/, 'the teacher link sits right under the buttons');
  assert.ok(hero.indexOf('lp-cta') < hero.indexOf('lp-badges'), 'buttons before the badges, so they show on a phone');
  assert.match(on.text, /id="families"[\s\S]*?href="\/plans"/, 'the Plans card links to /plans');
  assert.doesNotMatch(on.text, /\$\d|€\d|£\d/, 'no amounts');
  const g = grownup();
  assert.match((await as(g)('/parents')).text, /<a class="btn btn-primary btn-big" href="\/family">/, 'a signed-in grown-up goes to their family');
  config.stripeApiKey = '';
  const off = await call(null, '/parents');
  assert.match(off.text, /<a class="btn btn-primary btn-big" href="\/signup">Let your child start free<\/a>/);
  assert.doesNotMatch(off.text, /href="\/grown-ups/);
});

test('/safety ends with "Set up your child": the set-up signed out, the parent page for a kid or a guest', async () => {
  const r = await call(null, '/safety');
  assert.match(r.text, /href="\/grown-ups\/signup"[^>]*>Set up your child<\/a><\/p><\/div>/);
  for (const u of [kid(), auth.createGuest()]) {
    const k = await as(u)('/safety');
    assert.match(k.text, /href="\/parents"[^>]*>Set up your child<\/a>/); assert.doesNotMatch(k.text, /href="\/(grown-ups|family)/);
  }
  assert.match((await as(grownup())('/safety')).text, /href="\/family"[^>]*>/);
  config.stripeApiKey = '';
  assert.match((await call(null, '/safety')).text, /href="\/signup"[^>]*>Set up your child<\/a>/);
});

test('/login and /signup: "Grown-up or teacher?" leads to the grown-up sign-in or sign-up and to /teachers', async () => {
  const li = await call(null, '/login');
  assert.match(li.text, /Grown-up or teacher\? <a href="\/grown-ups\/login">Parents sign in here<\/a> · <a href="\/teachers">Teachers start here<\/a>/);
  const su = await call(null, '/signup');
  assert.match(su.text, /<a href="\/grown-ups\/signup">Parents start here<\/a>/);
  // A guest keeping their progress isn't sent elsewhere.
  assert.doesNotMatch((await as(auth.createGuest())('/signup')).text, /grownup-line/);
  config.stripeApiKey = '';
  const soon = (await call(null, '/login')).text;
  assert.match(soon, /<a href="\/parents">Oomba Academy for parents<\/a>/, 'before plans are public: the parent page, not a sign-in promise');
  assert.doesNotMatch(soon, /Parents sign in here/);
});

test('/build for a grown-up explains; for anyone else it is unchanged', async () => {
  const g = grownup();
  const r = await as(g)('/build');
  assert.equal(r.status, 200);
  assert.match(r.text, /The Builder is for kids&#39; accounts/);
  assert.match(r.text, /href="\/learn\/make-a-game"/); assert.match(r.text, /href="\/family"/);
  assert.match(r.text, /noindex/);
  assert.equal((await as(g)('/api/studio/new', { method: 'POST', body: {} })).status, 404);
  assert.match((await call(null, '/build')).location, /^\/signup\?next=%2Fbuild/);
  assert.equal((await as(kid())('/build')).status, 200);
});

test('/learn is an indexable hub of every subject and age page, in the sitemap', async () => {
  const r = await call(null, '/learn');
  assert.equal(r.status, 200);
  for (const h of HUBS) assert.match(r.text, new RegExp(`href="/learn/${h.slug}"`), h.slug);
  for (const a of AGES) assert.match(r.text, new RegExp(`href="/learn/${a.slug}"`), a.slug);
  assert.match(r.text, /<title>Learning games by subject and age · Oomba Academy<\/title>/);
  assert.match(r.text, /<link rel="canonical" href="[^"]*\/learn">/);
  assert.doesNotMatch(r.text, /<meta name="robots" content="noindex/);
  assert.equal((r.text.match(/<h1/g) || []).length, 1);
  assert.match((await call(null, '/sitemap.xml')).text, /<loc>[^<]*\/learn<\/loc>/);
  assert.equal((await as(grownup())('/learn')).status, 200, 'grown-ups may open it');
  // A language address points its canonical at English until the page is translated.
  assert.equal((await call(null, '/es/learn')).status, 200);
});

test('"Using this in class?" on subject, age and game pages for signed-out visitors and guests only; "Make a game like this" for kids', async () => {
  const pages = [`/learn/${HUBS[0].slug}`, `/learn/${AGES[0].slug}`, '/g/sum-racer'];
  for (const u of [null, auth.createGuest()]) {
    for (const p of pages) assert.match((await as(u)(p)).text, /Using this in class\? <a href="\/teachers">/, `${u ? 'guest' : 'signed out'} ${p}`);
  }
  const k = kid(); const g = grownup();
  for (const p of pages) {
    assert.doesNotMatch((await as(k)(p)).text, /Using this in class\?/, `kid ${p}`);
    assert.doesNotMatch((await as(g)(p)).text, /Using this in class\?/, `grown-up ${p}`);
  }
  assert.match((await as(k)('/g/sum-racer')).text, /<a class="iconbtn" href="\/build" id="makelike">/);
  assert.match((await call(null, '/g/sum-racer')).text, /id="makelike"/);
  assert.doesNotMatch((await as(g)('/g/sum-racer')).text, /id="makelike"/, 'no Builder link for a grown-up');
});

test('grown-ups sign up with a real name, "Your sign-in name", and get a plain person picture; kid name rules are unchanged', async () => {
  const page = await call(null, '/grown-ups/signup');
  assert.match(page.text, /<label for="username">Your sign-in name<\/label>/);
  assert.equal(TF.cleanName('SarahJones').ok, false, 'a kid still may not use a real-looking name');
  assert.equal(TF.cleanName('SarahJones', undefined, { realNames: true }).ok, true);
  assert.equal(TF.cleanName('Sarah Jones', undefined, { realNames: true }).ok, false, 'still one word');
  const r = await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: 'SarahJones', password: 'a-long-password-1', confirm: 'a-long-password-1', adult: '1' } });
  assert.equal(r.status, 200, r.text);
  const u = auth.getUserByName('SarahJones');
  assert.equal(u.account_type, 'grownup'); assert.equal(u.avatar, auth.GROWNUP_AVATAR);
  const kidTry = await call(null, '/api/auth/signup', { method: 'POST', body: { username: 'EmmaSmith', password: 'rainbow-77' } });
  assert.equal(kidTry.status, 400);
  // An older grown-up account with a random animal shows the plain picture too.
  const old = grownup(); assert.notEqual(old.avatar, undefined);
  assert.match(String(avatar({ ...old, avatar: '🦊' }, 38)), /👤/);
  assert.match(String(avatar(kid(), 38)), /class="avatar"/);
  assert.doesNotMatch(String(avatar({ ...kid(), avatar: '🦊' }, 38)), /👤/);
});
