// "Who's this for?" on Start free (the navigation proposal's Week 2, docs/decisions.md "Who's this for?"): signed out,
// /signup first asks Me (a grown-up) · My child · I'm a teacher, as plain links through /signup/for/<who>, which counts
// the choice (a daily total, people only) and redirects. It is skipped for a guest keeping their progress, for ?for=kid,
// for a kid on their way to a page (?next=) and in a language that doesn't have the question yet. /login never asks.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_who', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_who';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const funnel = await import('../../server/services/funnel.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(u, path, { ua = CHROME, lang, method = 'GET', headers = {} } = {}) {
  const h = { accept: 'text/html', ...headers }; const c = [];
  if (u) c.push(cookieFor(u.id)); if (lang) c.push(`lang=${lang}`); if (c.length) h.cookie = c.join('; ');
  if (ua) h['user-agent'] = ua;
  const r = await fetch(base + path, { method, headers: h, redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location'), headers: r.headers };
}
const picks = step => (q.get('SELECT SUM(n) n FROM funnel_counts WHERE day=? AND step=?', today(), step) || {}).n || 0;
const chooser = s => (/<div class="doors whofor"[\s\S]*?<\/div>/.exec(s) || [''])[0];
const hrefs = s => [...s.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const form = s => /data-api="\/api\/auth\/signup"/.test(s);
let n = 0;
const kid = () => auth.createUser({ username: `WhoKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `WhoParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };

test('signed out, /signup asks "Who’s this for?" with three plain links, instead of the kid form', async () => {
  const r = await call(null, '/signup');
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1 class="center" id="who-h">Who’s this for\?<\/h1>/);
  const c = chooser(r.text);
  assert.deepEqual(hrefs(c), ['/signup/for/grownup', '/signup/for/kid', '/signup/for/teacher']);
  assert.match(c, /role="group" aria-labelledby="who-h"/);
  assert.match(c, /👪.*?Me \(a grown-up\)<\/span><span class="door-s">Your own account, linked to your child’s account</);
  assert.match(c, /🧒.*?My child<\/span><span class="door-s">A made-up name and a password, no email\. Kids on their own start here too\./);
  assert.match(c, /🍎.*?I’m a teacher<\/span><span class="door-s">Set up your school and your classes/);
  assert.ok(!form(r.text), 'the kid form waits one tap away');
  assert.doesNotMatch(r.text, /grownup-line/, 'the chooser replaces the "Grown-up or teacher?" line (no duplicate)');
  assert.match(r.text, /data-guest-play="\/"/, 'playing as a guest is still there');
  assert.match(r.text, /href="\/login\?next=%2F">Sign in<\/a>/);
  assert.doesNotMatch(r.text, /\$\d|€\d|£\d|Basic|Family plan/, 'no prices or plan names: kids see this page too');
  // A grown-up's ?next= (Plans, the parent page) still asks, and "Me (a grown-up)" and "My child" carry it on.
  const p = await call(null, '/signup?next=%2Fplans');
  assert.deepEqual(hrefs(chooser(p.text)), ['/signup/for/grownup?next=%2Fplans', '/signup/for/kid?next=%2Fplans', '/signup/for/teacher']);
  assert.ok(chooser((await call(null, '/signup?next=%2Fes%2Fparents')).text));
});

test('each choice is counted once (people only) and leads on: grown-up sign-up, kid form, the school form', async () => {
  const before = Object.fromEntries(['who.grownup', 'who.kid', 'who.teacher'].map(s => [s, picks(s)]));
  const g = await call(null, '/signup/for/grownup');
  assert.equal(g.status, 302); assert.equal(g.location, '/grown-ups/signup');
  assert.match(g.headers.get('x-robots-tag'), /noindex/); assert.equal(g.headers.get('cache-control'), 'no-store');
  assert.equal((await call(null, '/signup/for/kid')).location, '/signup?for=kid');
  assert.equal((await call(null, '/signup/for/kid?next=%2Fplans')).location, '/signup?for=kid&next=%2Fplans');
  assert.equal((await call(null, '/signup/for/kid?next=%2F%2Fevil.example')).location, '/signup?for=kid', 'an unsafe next is dropped');
  assert.equal((await call(null, '/signup/for/teacher')).location, '/teachers#start');
  assert.equal(picks('who.grownup'), before['who.grownup'] + 1);
  assert.equal(picks('who.kid'), before['who.kid'] + 3);
  assert.equal(picks('who.teacher'), before['who.teacher'] + 1);
  // Robots, link previews and scripts aren't counted; an unknown choice goes back to the question, uncounted.
  for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'node', 'curl/8.0', '']) {
    assert.equal((await call(null, '/signup/for/teacher', { ua })).location, '/teachers#start');
  }
  assert.equal(picks('who.teacher'), before['who.teacher'] + 1);
  // HEAD (link checkers, scanners) and prefetches lead on the same but count nothing.
  for (const opts of [{ method: 'HEAD' }, { headers: { 'sec-purpose': 'prefetch;prerender' } }, { headers: { purpose: 'prefetch' } }]) {
    assert.equal((await call(null, '/signup/for/teacher', opts)).location, '/teachers#start');
  }
  assert.equal(picks('who.teacher'), before['who.teacher'] + 1, 'HEAD and prefetch are not choices');
  assert.match((await call(null, '/robots.txt')).text, /^Disallow: \/signup\/for\/$/m, 'the counting redirects are kept from crawlers');
  assert.doesNotMatch((await call(null, '/robots.txt')).text, /^Disallow: \/signup$/m, '/signup itself stays crawlable, so its noindex is seen');
  assert.equal((await call(null, '/signup/for/robot')).location, '/signup');
  // The admin report has the tally (choices, no "of step before").
  const w = funnel.weekly().funnels.find(f => f.key === 'who');
  assert.ok(w.tally); assert.deepEqual(w.steps.map(s => s.key), ['who.grownup', 'who.kid', 'who.teacher']);
  assert.ok(w.steps.every(s => s.rate === null));
});

test('"My child" opens the kid form, unchanged, with a way back instead of the grown-up line', async () => {
  const r = await call(null, '/signup?for=kid');
  assert.ok(form(r.text)); assert.equal(chooser(r.text), '');
  assert.match(r.text, /Pick a fun name/);
  assert.match(r.text, /<p class="center small whoback"><a href="\/signup">Who’s this for\? Pick again<\/a><\/p>/);
  assert.doesNotMatch(r.text, /grownup-line/);
  assert.match((await call(null, '/signup?for=kid&next=%2Fplans')).text, /class="center small whoback"><a href="\/signup\?next=%2Fplans">/);
});

test('skipped: a guest keeping their progress, a kid on their way to a page; /login never asks', async () => {
  const guest = auth.createGuest();
  const up = await call(guest, '/signup');
  assert.ok(form(up.text)); assert.equal(chooser(up.text), ''); assert.match(up.text, /Keep your progress/);
  assert.doesNotMatch(up.text, /grownup-line|whoback/);
  assert.ok(form((await call(guest, '/signup?for=grownup')).text), 'a guest is a kid already playing: no grown-up page');
  for (const next of ['/build', '/join?code=ABC123', '/play/sum-racer', '/friends', '/me', '/studio/x']) {
    const r = await call(null, `/signup?next=${encodeURIComponent(next)}`);
    assert.ok(form(r.text), next); assert.equal(chooser(r.text), '', next);
    assert.match(r.text, /grownup-line/, `${next}: a grown-up who got here still has the "Grown-up or teacher?" line`);
  }
  // The Builder's sign-in wall goes straight to the kid form.
  const b = await call(null, '/build'); assert.equal(b.location, '/signup?next=%2Fbuild');
  const li = await call(null, '/login');
  assert.equal(chooser(li.text), ''); assert.match(li.text, /grownup-line/); assert.match(li.text, /data-api="\/api\/auth\/login"/);
  // Signed in: no question, home as before.
  assert.equal((await call(kid(), '/signup')).location, '/');
  assert.equal((await call(grownup(), '/signup')).location, '/family');
});

test('before parents’ accounts open: "Me (a grown-up)" says so honestly and links the parent page and the kid form', async () => {
  config.stripeApiKey = '';
  const g = await call(null, '/signup/for/grownup');
  assert.equal(g.location, '/signup?for=grownup');
  const r = await call(null, g.location);
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1 class="center">Grown-up accounts are coming soon<\/h1>/);
  assert.deepEqual(hrefs((/<div class="soon-btns">[\s\S]*?<\/div>/.exec(r.text) || [''])[0]), ['/parents', '/signup?for=kid']);
  assert.match(r.text, /href="\/signup">Who’s this for\? Pick again/);
  assert.ok(!form(r.text)); assert.doesNotMatch(r.text, /grown-ups\/signup/);
  // While they are open, the same address goes to the grown-up sign-up.
  config.stripeApiKey = 'rk_test_fake';
  assert.equal((await call(null, '/signup?for=grownup')).location, '/grown-ups/signup');
});

test('a grown-up who started on a grown-up page (?next=/plans) goes back there after "Me (a grown-up)" and signing up', async () => {
  const g = await call(null, '/signup/for/grownup?next=%2Fplans');
  assert.equal(g.location, '/grown-ups/signup?next=%2Fplans');
  assert.equal((await call(null, '/signup/for/grownup?next=%2F%2Fevil.example')).location, '/grown-ups/signup', 'an unsafe next is dropped');
  const page = (await call(null, g.location)).text;
  assert.match(page, /<input type="hidden" name="next" value="\/plans">/);
  assert.match(page, /href="\/grown-ups\/login\?next=%2Fplans"/, 'Sign in instead keeps it too');
  // A page a grown-up account can't open (a kid page) is not kept.
  assert.doesNotMatch((await call(null, '/grown-ups/signup?next=%2Fbuild')).text, /name="next"/);
  // A plan picked on /plans wins over next=.
  assert.doesNotMatch((await call(null, '/grown-ups/signup?plan=family&next=%2Fplans')).text, /name="next"/);
  const post = async body => {
    const r = await fetch(`${base}/api/grown-ups/signup`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME }, body: JSON.stringify(body) });
    return r.json();
  };
  const base1 = { password: 'a-long-password-1', confirm: 'a-long-password-1', adult: true };
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/plans' })).redirect, '/plans');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/build' })).redirect, '/family', 'not a grown-up page');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '//evil.example' })).redirect, '/family');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/plans', plan: 'family', interval: 'year' })).redirect, '/family?plan=family&interval=year');
});

test('a translated /signup asks in its own language; the coming-soon page and the way back are translated too', async () => {
  const r = await call(null, '/signup', { lang: 'de' });
  assert.equal(form(r.text), false, 'the question first');
  const c = chooser(r.text);
  assert.match(r.text, /<h1 class="center" id="who-h">Für wen ist das Konto\?<\/h1>/);
  assert.match(c, /Für mich \(Erwachsene\/r\)/); assert.match(c, /Für mein Kind/); assert.match(c, /Ich bin Lehrkraft/);
  const box = h => h.slice(h.indexOf('<div class="authbox">'));   // the page itself (the language picker names English in English)
  assert.doesNotMatch(r.text, /Who’s this for/); assert.doesNotMatch(box(r.text), /lang="en"/, 'nothing marked English on the German page');
  config.stripeApiKey = '';
  const s = await call(null, '/signup?for=grownup', { lang: 'de' });
  assert.match(s.text, /<h1 class="center">Erwachsenenkonten gibt es bald<\/h1>/);
  assert.doesNotMatch(box(s.text), /lang="en"|coming soon/);
  const k = await call(null, '/signup?for=kid', { lang: 'de' });
  assert.ok(form(k.text));
  assert.match(k.text, /class="center small whoback"><a href="\/signup">Für wen ist das Konto\? Neu auswählen<\/a>/);
  assert.doesNotMatch(k.text, /Pick again/);
});

test('a language without the question yet keeps today’s page; the coming-soon text is marked English', async () => {
  const who = ['auth.page.whoHeading', 'auth.page.whoGrownup', 'auth.page.whoGrownupSub', 'auth.page.whoKid', 'auth.page.whoKidSub', 'auth.page.whoTeacher', 'auth.page.whoTeacherSub', 'auth.page.whoBack'];
  const soon = ['auth.page.soonHeading', 'auth.page.soonText', 'auth.page.soonParents', 'auth.page.soonKid'];
  await withoutKeys('de', [...who, ...soon], async () => {
    const r = await call(null, '/signup', { lang: 'de' });
    assert.ok(form(r.text)); assert.equal(chooser(r.text), '');
    assert.doesNotMatch(r.text, /Who’s this for/);
    config.stripeApiKey = '';
    const s = await call(null, '/signup?for=grownup', { lang: 'de' });
    assert.match(s.text, /<h1 class="center" lang="en" dir="ltr">Grown-up accounts are coming soon/);
    const k = await call(null, '/signup?for=kid', { lang: 'de' });
    assert.doesNotMatch(k.text, /Pick again/, 'no English back link on a German page');
  });
});
