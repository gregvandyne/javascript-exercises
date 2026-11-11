// "Who's signing up?" (docs/decisions.md "Who's this for?" and "One sign-up"): signed out, /signup first asks I'm a kid
// · I'm a parent · I'm a teacher, as plain links through /signup/for/<who>, which counts the choice (a daily total,
// people only) and redirects to that path's first step. It is skipped for a guest keeping their progress and for a kid on
// their way to a page (?next=). /login never asks. The steps after it: tests/unit/onboarding.test.js.
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
const chooser = s => (/<div class="doors whofor ob-doors"[\s\S]*?<\/div>\s*<p class="center small ob-foot">/.exec(s) || [''])[0];
const hrefs = s => [...s.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const form = s => /data-api="\/api\/auth\/signup"/.test(s);
let n = 0;
const kid = () => auth.createUser({ username: `WhoKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `WhoParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };

test('signed out, /signup asks "Who’s signing up?" with three plain links (kid, parent, teacher), instead of a form', async () => {
  const r = await call(null, '/signup');
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1 class="center ob-h" id="ob-h">Who’s signing up\?<\/h1>/);
  const c = chooser(r.text);
  assert.deepEqual(hrefs(c), ['/signup/for/kid', '/signup/for/grownup', '/signup/for/teacher']);
  assert.match(c, /role="group" aria-labelledby="ob-h"/);
  assert.match(c, /🧒.*?I’m a kid<\/span><span class="door-s">A fun name and a password\. No email\.</);
  assert.match(c, /👪.*?I’m a parent<\/span><span class="door-s">Make your account, then add your kids\.</);
  assert.match(c, /🍎.*?I’m a teacher<\/span><span class="door-s">Set up your school and your classes\.</);
  assert.ok(!form(r.text), 'the kid form waits one tap away');
  assert.doesNotMatch(r.text, /grownup-line/);
  assert.match(r.text, /data-guest-play="\/"/, 'playing as a guest is still there');
  assert.match(r.text, /href="\/login">Sign in<\/a>/);
  assert.doesNotMatch(r.text, /\$\d|€\d|£\d|Basic|Family plan/, 'no prices or plan names: kids see this page too');
  // A grown-up's ?next= (Plans, the parent page) still asks, and the kid's and the parent's doors carry it on.
  const p = await call(null, '/signup?next=%2Fplans');
  assert.deepEqual(hrefs(chooser(p.text)), ['/signup/for/kid?next=%2Fplans', '/signup/for/grownup?next=%2Fplans', '/signup/for/teacher']);
  assert.ok(chooser((await call(null, '/signup?next=%2Fes%2Fparents')).text));
});

test('each choice is counted once (people only) and leads to that path’s first step', async () => {
  const before = Object.fromEntries(['who.grownup', 'who.kid', 'who.teacher'].map(s => [s, picks(s)]));
  const g = await call(null, '/signup/for/grownup');
  assert.equal(g.status, 302); assert.equal(g.location, '/signup/parent');
  assert.match(g.headers.get('x-robots-tag'), /noindex/); assert.equal(g.headers.get('cache-control'), 'no-store');
  assert.equal((await call(null, '/signup/for/parent')).location, '/signup/parent', '"parent" is the same choice');
  assert.equal((await call(null, '/signup/for/kid')).location, '/signup/kid');
  assert.equal((await call(null, '/signup/for/kid?next=%2Fplans')).location, '/signup/kid?next=%2Fplans');
  assert.equal((await call(null, '/signup/for/kid?next=%2F%2Fevil.example')).location, '/signup/kid', 'an unsafe next is dropped');
  assert.equal((await call(null, '/signup/for/teacher')).location, '/signup/teacher');
  assert.equal(picks('who.grownup'), before['who.grownup'] + 2);
  assert.equal(picks('who.kid'), before['who.kid'] + 3);
  assert.equal(picks('who.teacher'), before['who.teacher'] + 1);
  // Robots, link previews and scripts aren't counted; an unknown choice goes back to the question, uncounted.
  for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'node', 'curl/8.0', '']) {
    assert.equal((await call(null, '/signup/for/teacher', { ua })).location, '/signup/teacher');
  }
  assert.equal(picks('who.teacher'), before['who.teacher'] + 1);
  // HEAD (link checkers, scanners) and prefetches lead on the same but count nothing.
  for (const opts of [{ method: 'HEAD' }, { headers: { 'sec-purpose': 'prefetch;prerender' } }, { headers: { purpose: 'prefetch' } }]) {
    assert.equal((await call(null, '/signup/for/teacher', opts)).location, '/signup/teacher');
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

test('"I’m a kid" opens the kid form (a fun name and a password, nothing else), step 1 of 2, with a way back', async () => {
  const r = await call(null, '/signup/kid');
  assert.ok(form(r.text));
  assert.match(r.text, /Pick a fun name/);
  assert.match(r.text, /data-next="\/signup\/kid\/code"/, 'then the optional class code');
  assert.match(r.text, /<span class="ob-count">Step 1 of 2<\/span>/);
  assert.match(r.text, /<a class="ob-back" href="\/signup">/);
  assert.doesNotMatch(r.text, /name="email"|type="email"|gbtn|auth\/google/, 'no email and no Google for kids');
  assert.match((await call(null, '/signup/kid?next=%2Fplans')).text, /<a class="ob-back" href="\/signup\?next=%2Fplans">/);
  // The old addresses.
  assert.equal((await call(null, '/signup?for=kid')).location, '/signup/kid');
  assert.equal((await call(null, '/signup?for=kid&next=%2Fbuild')).location, '/signup/kid?next=%2Fbuild');
  assert.equal((await call(null, '/signup?for=teacher')).location, '/signup/teacher');
});

test('skipped: a guest keeping their progress and a kid on their way to a page go straight to the kid’s step; /login never asks', async () => {
  const guest = auth.createGuest();
  assert.equal((await call(guest, '/signup')).location, '/signup/kid');
  const up = await call(guest, '/signup/kid');
  assert.ok(form(up.text)); assert.match(up.text, /Keep your progress/); assert.doesNotMatch(up.text, /ob-back/);
  for (const next of ['/build', '/join?code=ABC123', '/play/sum-racer', '/friends', '/me', '/studio/x']) {
    assert.equal((await call(null, `/signup?next=${encodeURIComponent(next)}`)).location, `/signup/kid?next=${encodeURIComponent(next)}`, next);
  }
  // Joining a class with its code skips the code step: the class page is next.
  assert.match((await call(null, `/signup/kid?next=${encodeURIComponent('/join?code=ABC123')}`)).text, /data-next="\/join\?code=ABC123"/);
  // The Builder's sign-in wall goes straight to the kid form.
  const b = await call(null, '/build'); assert.equal(b.location, '/signup?next=%2Fbuild');
  const li = await call(null, '/login');
  assert.equal(chooser(li.text), ''); assert.match(li.text, /data-api="\/api\/auth\/login"/);
  // Signed in: no question, home as before.
  assert.equal((await call(kid(), '/signup')).location, '/');
  assert.equal((await call(grownup(), '/signup')).location, '/family');
});

test('before parents’ accounts open: "I’m a parent" says so honestly and links the parent page and the kid’s step', async () => {
  config.stripeApiKey = '';
  const g = await call(null, '/signup/for/grownup');
  assert.equal(g.location, '/signup/parent');
  const r = await call(null, g.location);
  assert.equal(r.status, 200);
  assert.match(r.text, /<h1 class="center ob-h" id="ob-h">Grown-up accounts are coming soon<\/h1>/);
  assert.deepEqual(hrefs((/<div class="soon-btns">[\s\S]*?<\/div>/.exec(r.text) || [''])[0]), ['/parents', '/signup/kid']);
  assert.match(r.text, /<a class="ob-back" href="\/signup">/);
  assert.ok(!form(r.text)); assert.doesNotMatch(r.text, /api\/grown-ups\/signup/);
  assert.equal((await call(null, '/signup?for=grownup')).location, '/signup/parent');
  // While they are open, the same address is the parent's sign-up.
  config.stripeApiKey = 'rk_test_fake';
  assert.match((await call(null, '/signup/parent')).text, /data-api="\/api\/grown-ups\/signup"/);
});

test('a grown-up who started on a grown-up page (?next=/plans) goes back there after "I’m a parent" and signing up', async () => {
  const g = await call(null, '/signup/for/grownup?next=%2Fplans');
  assert.equal(g.location, '/signup/parent?next=%2Fplans');
  assert.equal((await call(null, '/signup/for/grownup?next=%2F%2Fevil.example')).location, '/signup/parent', 'an unsafe next is dropped');
  const page = (await call(null, g.location)).text;
  assert.match(page, /<input type="hidden" name="next" value="\/plans">/);
  assert.match(page, /href="\/login\?next=%2Fplans"/, 'Sign in instead keeps it too');
  // A page a grown-up account can't open (a kid page) is not kept; the Builder is one they can.
  assert.doesNotMatch((await call(null, '/signup/parent?next=%2Fchat')).text, /name="next"/);
  assert.match((await call(null, '/signup/parent?next=%2Fbuild')).text, /<input type="hidden" name="next" value="\/build">/);
  // A plan picked on /plans wins over next=.
  assert.doesNotMatch((await call(null, '/signup/parent?plan=family&next=%2Fplans')).text, /name="next"/);
  const post = async body => {
    const r = await fetch(`${base}/api/grown-ups/signup`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': CHROME }, body: JSON.stringify(body) });
    return r.json();
  };
  const base1 = { password: 'a-long-password-1', confirm: 'a-long-password-1', adult: true };
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/plans' })).redirect, '/plans');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/build' })).redirect, '/build', 'grown-ups can build');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/friends' })).redirect, '/family/add?from=signup', 'not a grown-up page: "Add your kids"');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '//evil.example' })).redirect, '/family/add?from=signup');
  assert.equal((await post({ ...base1, username: `WhoNext${++n}`, next: '/plans', plan: 'family', interval: 'year' })).redirect, '/family?plan=family&interval=year');
});

test('a translated /signup asks in its own language; the coming-soon page and every step are translated too', async () => {
  const r = await call(null, '/signup', { lang: 'de' });
  assert.equal(form(r.text), false, 'the question first');
  const c = chooser(r.text);
  assert.match(r.text, /<h1 class="center ob-h" id="ob-h">Wer meldet sich an\?<\/h1>/);
  assert.match(c, /Ich bin ein Kind/); assert.match(c, /Ich bin ein Elternteil/); assert.match(c, /Ich bin Lehrkraft/);
  const box = h => h.slice(h.indexOf('<div class="authbox ob">'));   // the page itself (the language picker names English in English)
  assert.doesNotMatch(r.text, /Who’s signing up/); assert.doesNotMatch(box(r.text), /lang="en"/, 'nothing marked English on the German page');
  for (const p of ['/signup/kid', '/signup/teacher', '/signup/parent']) assert.doesNotMatch(box((await call(null, p, { lang: 'de' })).text), /lang="en"|Step \d|Back</, p);
  config.stripeApiKey = '';
  const s = await call(null, '/signup/parent', { lang: 'de' });
  assert.match(s.text, /<h1 class="center ob-h" id="ob-h">Erwachsenenkonten gibt es bald<\/h1>/);
  assert.doesNotMatch(box(s.text), /lang="en"|coming soon/);
});
