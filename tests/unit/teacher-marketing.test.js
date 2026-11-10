// The teacher marketing pages ("/" and /teachers) and /parents: the Google Classroom section (only when Classroom is on
// here, every line matching services/gclassroom.js), one free-and-paid line with no price amount (amounts live on /plans
// only, even with billing on and Stripe prices set), the brand tagline, the link to /research, and the teacher quotes
// section that stays hidden until real quotes exist (docs/decisions.md "Teacher marketing: Classroom, free and paid").
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_marketing';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
process.env.LANDING_AT_ROOT = '1';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_CLASSROOM = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const GC = await import('../../server/services/gclassroom.js');
const T = await import('../../server/routes/teachers.js');
const { makeT } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { process.env.LANDING_AT_ROOT = '1'; config.googleClassroom = true; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function get(path, u = null) {
  const h = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' }; if (u) h.cookie = cookieFor(u.id);
  const r = await fetch(base + path, { headers: h, redirect: 'manual' });
  return { status: r.status, text: await r.text() };
}
const section = (s, id) => (new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`).exec(s) || [''])[0];
const AMOUNT = /\$\s?\d|€\s?\d|£\s?\d|\d+\s*(?:USD|dollars)|\b119\b/i;

test('Google Classroom: a section on "/" and on /teachers with the same words, only while Classroom is on here', async () => {
  assert.equal(GC.enabled(), true);
  for (const path of ['/', '/teachers']) {
    const s = (await get(path)).text;
    const gc = section(s, 'classroom');
    assert.ok(gc, `${path}: the Classroom section`);
    assert.match(gc, /Works with your Google Classroom/);
    assert.match(gc, /can only see your classes and their students\. It posts nothing until you allow posting\./, 'read-only connect first');
    assert.match(gc, /refreshes itself every 6 hours/, 'the roster refresh (GC.ROSTER_EVERY)');
    assert.match(gc, /as a Classroom assignment, with its link and due date, or share it as a material/);
    assert.match(gc, /Completion grades flow back to Classroom: each student(?:’|&#39;)s grade out of 100 is the share of the lesson(?:’|&#39;)s steps they finished, not how many answers were right/, 'completion grades, said plainly');
    assert.match(gc, /doesn(?:’|&#39;)t ask Classroom for student emails, and never sends Google a student(?:’|&#39;)s name, answers or games/);
    assert.match(gc, /once you allow posting, a separate step/);
    assert.match(gc, /href="\/privacy#google"/);
    assert.doesNotMatch(gc, /verified|approved by Google|Google-approved/i, 'never implies Google verified the app');
  }
  assert.equal(GC.ROSTER_EVERY, 6 * 3600e3, 'the "every 6 hours" in the copy');
  assert.equal(GC.scoreOf({ done: 3, total: 4 }), 75, 'a completion grade: steps done of steps, out of 100');
  config.googleClassroom = false;
  for (const path of ['/', '/teachers']) assert.equal(section((await get(path)).text, 'classroom'), '', `${path}: no section while Classroom is off`);
});

test('free and paid: one line on "/" and /teachers saying what is always free and what the Teacher plan adds; no amount on either', async () => {
  const want = /Always free: every game, your classes, lessons, progress and the gradebook, and free daily Builder messages for you and your students\. The Teacher plan adds 300 AI game builds a day shared by your classes\. <a href="\/plans">See prices on Plans<\/a>\./;
  for (const path of ['/', '/teachers']) {
    const s = (await get(path)).text;
    assert.match(s, want, `${path}: the free-and-paid line`);
    assert.doesNotMatch(s, AMOUNT, `${path}: no price amount (prices live on /plans only)`);
  }
  const s = (await get('/')).text;
  const pricing = section(s, 'pricing');
  assert.match(pricing, /<h3 id="plan-free">Free<\/h3>\s*<p class="lp-price">Always free<\/p>/, 'a Free card');
  assert.match(pricing, /Everything in Free, plus:/);
  const teacherCard = /<article[^>]*aria-labelledby="plan-teacher"[\s\S]*?<\/article>/.exec(pricing)[0];
  assert.doesNotMatch(teacherCard, /Classes, lessons, progress and the gradebook|30\+ ready-made games and live class games|Every language, every device/, 'free things are not sold as Teacher plan features');
  assert.match(s, /only the plan(?:’|&#39;)s extra AI builds stop: the games, your classes, lessons and progress stay free, and nothing is deleted/, 'the trial FAQ says what stays free');
  assert.doesNotMatch(s, /Try everything free for 14 days/, 'no hint that everything is paid after the trial');
  // /plans is where the amounts are (the fake Stripe has the Teacher price).
  assert.match((await get('/plans')).text, /\$\s?119|119/);
});

test('/teachers with paid plans off: the free line without the plan or a link to /plans', async () => {
  const was = config.billingPublic; config.billingPublic = false;
  try {
    const s = (await get('/teachers')).text;
    assert.match(s, /<p class="lp-freeline">Always free: every game, your classes, lessons, progress and the gradebook, and free daily Builder messages for you and your students\.<\/p>/);
    assert.doesNotMatch(s, /The Teacher plan adds/);
  } finally { config.billingPublic = was; }
});

test('tagline: "Screen time you can feel good about" on "/" (footer) and /parents (under the heading), in every language', async () => {
  assert.match((await get('/')).text, /<div class="lp-foot-brand">[\s\S]*?<p class="lp-tagline">Screen time you can feel good about<\/p>/);
  const p = (await get('/parents')).text;
  assert.match(p, /<h1 id="lp-h1">[^<]*<\/h1>\s*<p class="lp-tagline">Screen time you can feel good about<\/p>/);
  assert.match((await get('/es/parents')).text, /<p class="lp-tagline">Tiempo de pantalla con el que te puedes sentir bien<\/p>/);
  assert.match((await get('/he')).text, /<p class="lp-tagline">זמן מסך שאפשר להרגיש איתו טוב<\/p>/);
});

test('research: "/" and /teachers link to /research', async () => {
  for (const path of ['/', '/teachers']) assert.match((await get(path)).text, /href="\/research"/, path);
});

test('teacher quotes: no quotes ship, so /teachers has no quotes section; only a platform admin sees the owner placeholders', async () => {
  assert.deepEqual([...T.TEACHER_QUOTES], [], 'no quote is written in the code');
  const out = (await get('/teachers?quotes=preview')).text;
  assert.doesNotMatch(out, /id="teachers-say"|What teachers say|\[Owner:/, 'nothing for visitors, even with ?quotes=preview');
  const admin = auth.createUser({ username: 'MarketBoss', password: 'a-long-password-1' });
  q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const a = auth.getUser(admin.id);
  assert.doesNotMatch((await get('/teachers', a)).text, /id="teachers-say"/, 'an admin without ?quotes=preview: hidden too');
  const pv = (await get('/teachers?quotes=preview', a)).text;
  assert.match(pv, /id="teachers-say"/);
  assert.match(pv, /\[Owner: add a real teacher quote here, with the teacher(?:'|&#39;)s written permission\]/);
  // With real quotes (given here only to test the markup), the section shows them, escaped, in their own language.
  const html = String(T.quotesSection({ t: makeT('en'), query: {}, user: null }, [{ quote: 'Words <b>said</b>', name: 'A Teacher', role: 'Role', school: 'School', lang: 'es' }]));
  assert.match(html, /<figure class="panel lp-quote" lang="es"><blockquote><p>Words &lt;b&gt;said&lt;\/b&gt;<\/p><\/blockquote>/);
  assert.match(html, /<b>A Teacher<\/b>, Role, School/);
});
