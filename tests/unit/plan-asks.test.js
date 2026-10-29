// "Ask my admin" (navigation weeks 3–4; server/services/plan-asks.js): a teacher asks their school's admins for a School
// plan, the admins see it on My classes and the Billing tab and dismiss it, and it closes by itself when the plan comes
// on. Who may ask and close, one open ask per teacher, the gates (families off, students, kids, grown-ups, another
// school), retention, and audits with ids only. Plus the /teach plan card (no prices) and the teacher's panel.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_asks', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_asks';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const SC = await import('../../server/services/schools.js');
const PA = await import('../../server/services/plan-asks.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

const DAY = 86400e3;
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; config.billingPublic = true; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(u, path, { method = 'GET', body } = {}) {
  const h = u ? { cookie: cookieFor(u.id) } : {}; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
const post = (u, path, body = {}) => call(u, path, { method: 'POST', body });
const boss = auth.createUser({ username: 'AskBoss', password: 'boss-password-1', role: 'admin' });
let n = 0;
/** A school with an admin (a billing tester, so the /teach card sells to them), two teachers and a student. */
function school({ admin = true } = {}) {
  const s = SC.createSchool(boss, { name: `Ask School ${++n}` }).school;
  const head = admin ? SC.createSchoolAccount(boss, s.id, { rosterName: `Head ${n}`, role: 'admin' }).user : null;
  if (head) q.run('UPDATE users SET billing_tester=1 WHERE id=?', head.id);
  const t1 = SC.createSchoolAccount(boss, s.id, { rosterName: `Ms Rivera ${n}`, role: 'teacher' }).user;
  const t2 = SC.createSchoolAccount(boss, s.id, { rosterName: `Mr Chen ${n}`, role: 'teacher' }).user;
  const pupil = SC.createSchoolAccount(boss, s.id, { rosterName: `Pupil ${n}` }).user;
  return { s, head: head && auth.getUser(head.id), t1, t2, pupil };
}
const grantPlan = s => q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, seats, until, created_at) VALUES (?, 'school', ?, 'school', 25, ?, ?)", uid(10), s.id, Date.now() + 30 * DAY, Date.now());
const rows = s => q.all('SELECT * FROM school_plan_asks WHERE school_id=? ORDER BY created_at', s.id);

test('a teacher asks once; asking again keeps one open ask; the audit holds ids only', async () => {
  const x = school();
  const r = await post(x.t1, `/api/schools/${x.s.id}/ask-plan`);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.toast, "We told your school's admin.");
  assert.equal((await post(x.t1, `/api/schools/${x.s.id}/ask-plan`)).status, 200);
  assert.equal(rows(x.s).length, 1, 'one open ask per teacher per school');
  assert.equal((await post(x.t2, `/api/schools/${x.s.id}/ask-plan`)).status, 200);
  assert.equal(rows(x.s).length, 2);
  // The unique index holds even past the service.
  assert.throws(() => q.run('INSERT INTO school_plan_asks(id, school_id, teacher_id, created_at) VALUES (?,?,?,?)', uid(), x.s.id, x.t1.id, Date.now()), /UNIQUE/);
  const a = q.all("SELECT * FROM audit_log WHERE action='school.plan.ask' AND target=?", x.s.id);
  assert.equal(a.length, 2, 'only new asks are audited');
  for (const row of a) assert.deepEqual(Object.keys(JSON.parse(row.details)), ['ask']);
  assert.ok(!a.some(row => /Rivera|Chen/.test(row.details)), 'no names in the audit');
  assert.deepEqual(Object.keys(rows(x.s)[0]).sort(), ['close_reason', 'closed_at', 'closed_by', 'created_at', 'id', 'school_id', 'teacher_id'], 'ids and dates only');
});

test('who may ask: only staff who are not the admin; everyone else gets a 404 (admin, student, kid, grown-up, another school, signed out)', async () => {
  const x = school(), y = school();
  const kid = auth.createUser({ username: 'AskKid', password: 'rainbow-77' });
  const mum = auth.createUser({ username: 'AskMum', password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(mum);
  for (const u of [x.head, x.pupil, kid, mum, y.t1, boss, auth.createGuest()]) assert.equal((await post(u, `/api/schools/${x.s.id}/ask-plan`)).status, 404, u.username);
  assert.equal((await post(null, `/api/schools/${x.s.id}/ask-plan`)).status, 404);
  assert.equal((await post(x.t1, '/api/schools/nope/ask-plan')).status, 404);
  assert.equal(rows(x.s).length, 0);
  // Not by GET, and not from another site (csrfCheck).
  assert.equal((await call(x.t1, `/api/schools/${x.s.id}/ask-plan`)).status, 404);
  const cross = await fetch(`${base}/api/schools/${x.s.id}/ask-plan`, { method: 'POST', headers: { cookie: cookieFor(x.t1.id), 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(cross.status, 403);
  assert.equal(rows(x.s).length, 0);
});

test('the gates: families off -> 404; the plan already on -> 409; no admin -> 409; an archived school -> 404', async () => {
  const x = school();
  config.stripeApiKey = '';
  assert.equal((await post(x.t1, `/api/schools/${x.s.id}/ask-plan`)).status, 404);
  config.stripeApiKey = 'rk_test_fake'; config.billingPublic = false;
  assert.equal((await post(x.t1, `/api/schools/${x.s.id}/ask-plan`)).status, 404, 'before BILLING_PUBLIC');
  config.billingPublic = true;
  const lone = school({ admin: false });
  const r = await post(lone.t1, `/api/schools/${lone.s.id}/ask-plan`);
  assert.equal(r.status, 409); assert.match(r.json.error, /no admin/);
  const p = school(); grantPlan(p.s);
  const r2 = await post(p.t1, `/api/schools/${p.s.id}/ask-plan`);
  assert.equal(r2.status, 409); assert.equal(r2.json.error, 'Your school already has a School plan.');
  const old = school(); q.run('UPDATE schools SET archived_at=? WHERE id=?', Date.now(), old.s.id);
  assert.equal((await post(old.t1, `/api/schools/${old.s.id}/ask-plan`)).status, 404);
});

test('asks close by themselves when the plan comes on (checked when read); admins dismiss; teachers and others cannot', async () => {
  const x = school(), y = school();
  await post(x.t1, `/api/schools/${x.s.id}/ask-plan`); await post(x.t2, `/api/schools/${x.s.id}/ask-plan`);
  const [a1, a2] = rows(x.s);
  for (const u of [x.t1, x.t2, x.pupil, y.head]) assert.equal((await post(u, `/api/schools/${x.s.id}/ask-plan/${a1.id}/close`)).status, 404, u.username);
  assert.equal((await post(y.head, `/api/schools/${y.s.id}/ask-plan/${a1.id}/close`)).status, 404, 'an ask of another school');
  const d = await post(x.head, `/api/schools/${x.s.id}/ask-plan/${a1.id}/close`);
  assert.equal(d.status, 200, d.text);
  let r = q.get('SELECT * FROM school_plan_asks WHERE id=?', a1.id);
  assert.equal(r.close_reason, 'dismissed'); assert.equal(r.closed_by, x.head.id); assert.ok(r.closed_at);
  assert.equal((await post(x.head, `/api/schools/${x.s.id}/ask-plan/${a1.id}/close`)).status, 404, 'already closed');
  // A dismissed teacher may ask again later.
  assert.equal((await post(x.t1, `/api/schools/${x.s.id}/ask-plan`)).status, 200);
  grantPlan(x.s);
  assert.equal(PA.openAsks(x.s.id).length, 0);
  r = q.get('SELECT * FROM school_plan_asks WHERE id=?', a2.id);
  assert.equal(r.close_reason, 'plan');
  assert.equal(q.get('SELECT COUNT(*) n FROM school_plan_asks WHERE school_id=? AND closed_at IS NULL', x.s.id).n, 0);
});

test('retention: closed asks go 90 days after they closed; open ones stay', async () => {
  const x = school();
  await post(x.t1, `/api/schools/${x.s.id}/ask-plan`); await post(x.t2, `/api/schools/${x.s.id}/ask-plan`);
  const [a1, a2] = rows(x.s);
  const t = Date.now();
  q.run("UPDATE school_plan_asks SET closed_at=?, close_reason='dismissed' WHERE id=?", t - 91 * DAY, a1.id);
  q.run('UPDATE school_plan_asks SET created_at=? WHERE id=?', t - 400 * DAY, a2.id);
  assert.equal(PA.retention(t), 1);
  assert.deepEqual(rows(x.s).map(r => r.id), [a2.id]);
  q.run("UPDATE school_plan_asks SET closed_at=?, close_reason='plan' WHERE id=?", t - 89 * DAY, a2.id);
  assert.equal(PA.retention(t), 0, 'not yet 90 days');
  assert.equal(PA.KEEP_CLOSED, 90 * DAY);
});

test('My classes: the teacher\'s "Ask my admin" panel; the admin\'s plan card (no prices) with who asked and Dismiss; the Billing tab lists them too', async () => {
  const x = school();
  let t = await call(x.t1, '/teach');
  assert.match(t.text, new RegExp(`data-api="/api/schools/${x.s.id}/ask-plan"`));
  assert.match(t.text, /Ask my admin/);
  await post(x.t1, `/api/schools/${x.s.id}/ask-plan`);
  t = await call(x.t1, '/teach');
  assert.match(t.text, /You asked on /); assert.doesNotMatch(t.text, /data-api="\/api\/schools\/[^"]+\/ask-plan"/);
  const h = await call(x.head, '/teach');
  assert.match(h.text, /School plan · Ask School/);
  assert.match(h.text, /No school plan · students on free Builder messages/);
  assert.match(h.text, new RegExp(`href="/school/${x.s.slug}\\?tab=billing">Set up School plan`));
  assert.match(h.text, /1 teacher asked for a School plan/);
  assert.match(h.text, /<bdi>Ms Rivera \d+<\/bdi>/);
  assert.match(h.text, /ask-plan\/[^/"]+\/close/);
  assert.doesNotMatch(h.text, /data-api="\/api\/schools\/[^"]+\/ask-plan"/, 'the admin has nobody to ask');
  assert.doesNotMatch(h.text.replace(/<script[\s\S]*?<\/script>/g, ''), /\$\s?\d|€\s?\d|£\s?\d|\/ ?year|per student/i, 'no prices on /teach');
  const bill = await call(x.head, `/school/${x.s.slug}?tab=billing`);
  assert.match(bill.text, /id="plan-asks"[\s\S]*1 teacher asked for a School plan/);
  // Not a billing tester (a test key): no card at all; families off: no card and no panel.
  q.run('UPDATE users SET billing_tester=0 WHERE id=?', x.head.id);
  assert.doesNotMatch((await call(x.head, '/teach')).text, /School plan · /);
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', x.head.id);
  config.stripeApiKey = '';
  assert.doesNotMatch((await call(x.head, '/teach')).text, /School plan · /);
  assert.doesNotMatch((await call(x.t2, '/teach')).text, /Ask my admin/);
  config.stripeApiKey = 'rk_test_fake';
  // The plan on: "School plan on · Billing" for the admin, and the teacher just reads that the school has one.
  grantPlan(x.s);
  const on = await call(x.head, '/teach');
  assert.match(on.text, /School plan on<\/span> <a href="\/school\/[^"]+\?tab=billing">Billing/);
  assert.doesNotMatch(on.text, /teacher asked/);
  assert.match((await call(x.t2, '/teach')).text, /Your school has a School plan\./);
  // No admin at the school: no panel.
  const lone = school({ admin: false });
  assert.doesNotMatch((await call(lone.t1, '/teach')).text, /Ask my admin/);
});

test('the asks list is in the page\'s language wherever it is drawn (also the Billing tab), and marked as English until a language has its words', async () => {
  const x = school();
  await post(x.t1, `/api/schools/${x.s.id}/ask-plan`);
  q.run("UPDATE users SET lang='he' WHERE id=?", x.head.id);
  const lists = async () => {
    const out = [];
    for (const path of [`/school/${x.s.slug}?tab=billing`, '/teach']) {
      const r = await call(auth.getUser(x.head.id), path);
      assert.equal(r.status, 200, path);
      assert.match(r.text, /<html lang="he" dir="rtl"/, path);
      const list = r.text.match(/<div class="planasks"[\s\S]*?<\/div>/);
      assert.ok(list, path);
      out.push([path, list[0]]);
    }
    return out;
  };
  // Hebrew has the words: Hebrew text, nothing marked as English.
  for (const [path, list] of await lists()) {
    assert.match(list, /<b>מורה אחד ביקש תוכנית בית ספר<\/b>/, path);
    assert.match(list, /<button class="btn btn-sm" type="submit">הסרה<\/button>/, path);
    assert.doesNotMatch(list, /lang="en"|teacher asked|Dismiss/, path);
  }
  // The words taken out of Hebrew (simulated): each is English, marked so on its own element.
  await withoutKeys('he', ['school.asks.asked', 'school.asks.dismiss'], async () => {
    for (const [path, list] of await lists()) {
      assert.match(list, /<b lang="en" dir="ltr">1 teacher asked for a School plan<\/b>/, `${path}: the count stays at the start on a right-to-left page`);
      assert.match(list, /<button class="btn btn-sm" type="submit" lang="en" dir="ltr">Dismiss<\/button>/, path);
    }
  });
});
