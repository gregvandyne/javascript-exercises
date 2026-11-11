// Admin alerts by email (services/admin-alerts.js; docs/decisions.md "Admin alerts by email"): each event source queues
// the right kind; one batch email per run with grouped counts; nothing private in the email (a real name and a message
// body used here never appear); the master and per-kind switches and ADMIN_ALERTS=0; restart safety (a claimed batch is
// never sent twice); retries; the test button; and that only admin accounts ever get them. Resend is never called:
// services/email.js's fetch hook answers instead.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const E = await import('../../server/services/email.js');
const A = await import('../../server/services/admin-alerts.js');
const games = await import('../../server/services/games.js');
const pub = await import('../../server/services/publish.js');
const team = await import('../../server/services/team.js');
const SR = await import('../../server/services/school-requests.js');
const S = await import('../../server/services/schools.js');
const chat = await import('../../server/services/chat.js');
const liveR = await import('../../server/services/classlive-results.js');
const SB = await import('../../server/services/school-billing.js');

const PW = 'a-long-password-1';
const GOOD = '<title>G</title><canvas></canvas><script>BRB.sfx.play("win")</script>';
let n = 0;
const fresh = () => (++n).toString(26).split('').map(c => String.fromCharCode(97 + parseInt(c, 26))).join('');
const REAL_NAME = 'Penelope Quartermaine';
const SECRET_TEXT = 'my secret message body zebra42';
const google = (u, email) => q.run('INSERT INTO google_identities(sub, user_id, email, created_at) VALUES (?,?,?,?)', `sub-${fresh()}`, u.id, email, Date.now());

const admin = auth.createUser({ username: `AlertBoss${fresh()}`, password: PW, role: 'admin', displayName: REAL_NAME });
google(admin, 'boss@oomba.example');
// A teacher with a known address: never a recipient.
const outsider = auth.createUser({ username: `NotAdmin${fresh()}`, password: PW, displayName: REAL_NAME });
S.addMember(admin, S.createSchool(admin, { name: `Outsider School ${fresh()}` }).school.id, outsider.id, 'teacher');
google(outsider, 'teacher@school.example');

// ---- The fake Resend ----
const sent = [];
let replies = [];
function fakeResend(url, init) {
  const body = JSON.parse(init.body);
  sent.push({ url, headers: init.headers, body });
  const st = replies.length ? replies.shift() : 200;
  return Promise.resolve({ status: st, json: async () => (st === 200 ? { id: `re_msg_${sent.length}` } : { name: 'internal_server_error', message: 'nope' }) });
}
E._hooks({ fetch: fakeResend, wait: () => Promise.resolve() });
const ON = { resendApiKey: 're_test_key', emailEnabled: true, emailPostalAddress: '', publicUrl: 'https://oomba.example', adminAlerts: true, adminAlertsTo: [] };
const reset = () => {
  Object.assign(config, ON); sent.length = 0; replies = [];
  q.run("DELETE FROM settings WHERE key LIKE 'emails.admin_alerts%'");
  q.run('DELETE FROM admin_alerts'); q.run('DELETE FROM admin_alert_batches');
};
test.beforeEach(reset);
const pending = kind => q.all("SELECT * FROM admin_alerts WHERE status='pending'" + (kind ? ' AND kind=?' : ''), ...(kind ? [kind] : []));

let server, base = '';
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body } = {}) {
  const h = { ...(cookie ? { cookie } : {}), origin: base };
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}
// The admin's own session is started once here (their first sign-in queues a 'signup' alert, cleared by reset()).
const adminCookie = cookieFor(admin.id);

// ---------------------------------------------------------------- event sources
test('each event source queues the right kind', async () => {
  // A game sent for public review.
  const kid = auth.createUser({ username: `Builder${fresh()}`, password: 'rainbow-77', displayName: REAL_NAME });
  const g = games.createGame(kid.id, { title: 'Space Cats Rescue' });
  games.addVersion(g.id, GOOD);
  assert.equal((await pub.publish(kid, g.id, 'public')).state, 'in_review');
  assert.deepEqual(pending('review').map(r => [r.ref, r.summary]), [[g.id, 'new']]);
  // A new account: its first sign-in (a guest's never).
  const newbie = auth.createUser({ username: `Newbie${fresh()}`, password: 'rainbow-77', displayName: REAL_NAME });
  cookieFor(newbie.id); cookieFor(newbie.id);
  cookieFor(auth.createGuest().id);
  assert.deepEqual(pending('signup').map(r => r.ref), [newbie.id], 'once, on the first sign-in, and never for a guest');
  // A message to the Oomba team (a grown-up replies).
  const grown = auth.createUser({ username: `Parent${fresh()}`, password: PW, accountType: 'grownup', displayName: REAL_NAME });
  assert.equal(team.sendDirect(admin, grown, 'Hello from the team').ok, true);
  assert.equal(team.reply(grown, { body: SECRET_TEXT }).ok, true);
  assert.deepEqual(pending('message').map(r => [r.ref, r.summary]), [[grown.id, '']], 'who wrote, never the text');
  // A school request.
  assert.equal(SR.createRequest({ school: 'Quartermaine Academy', role: 'teacher', email: 'pq@school.example', students: 20, country: 'US', name: REAL_NAME }).ok, true);
  assert.deepEqual(pending('school_request').map(r => r.summary), ['teacher']);
  // Safety reports: a chat message, a live game, a game.
  const a = auth.createUser({ username: `KidA${fresh()}`, password: 'rainbow-77' }), b = auth.createUser({ username: `KidB${fresh()}`, password: 'rainbow-77' });
  q.run("INSERT INTO chat_messages(id, from_id, to_id, body, kind, created_at) VALUES (?,?,?,?,'text',?)", `m-${fresh()}`, a.id, b.id, SECRET_TEXT, Date.now());
  const mid = q.get('SELECT id FROM chat_messages WHERE from_id=?', a.id).id;
  assert.equal(chat.report(b, mid, 'mean').ok, true);
  liveR.report({ owner: admin.id, gameId: null, versionId: null, setId: null, items: null }, 'scary');
  const pg = games.createGame(kid.id, { title: 'Reported Game' }); games.addVersion(pg.id, GOOD);
  await pub.publish(kid, pg.id, 'friends');
  const friend = auth.createUser({ username: `Pal${fresh()}`, password: 'rainbow-77' });
  q.run("UPDATE games SET visibility='public', status='published' WHERE id=?", pg.id);
  const r = await call(cookieFor(friend.id), `/api/games/${pg.id}/report`, { method: 'POST', body: { reason: 'broken', details: SECRET_TEXT } });
  assert.equal(r.status, 200, r.text);
  const reports = pending('report');
  assert.deepEqual(reports.map(x => x.summary).sort(), ['A chat message was reported (mean)', 'A game was reported (broken)', 'A live game was reported (scary)']);
  assert.ok(reports.every(x => !x.summary.includes('zebra')), 'never the details or the message');
  assert.deepEqual(reports.map(x => x.url).sort(), ['/admin?tab=chat', '/admin?tab=live', '/admin?tab=reports']);
  // Billing: a school asks to pay by invoice.
  const school = S.createSchool(admin, { name: `Alert School ${fresh()}` }).school;
  const inv = SB.requestInvoice(admin, school, { seats: 30, contactName: REAL_NAME, contactEmail: 'pq@school.example', line1: '1 Main St', city: 'Springfield', postalCode: '62701', country: 'US' });
  assert.equal(inv.ok, true, JSON.stringify(inv));
  assert.match(pending('billing')[0].summary, /^A school asked to pay by invoice \(30 seats\)$/);
  for (const row of q.all('SELECT summary FROM admin_alerts')) assert.ok(!row.summary.includes(REAL_NAME) && !row.summary.includes('@'), 'no names or addresses stored');
});

test('an alert never breaks the action: a failing insert is swallowed', () => {
  const orig = q.run;
  q.run = (sql, ...p) => { if (/INSERT INTO admin_alerts/.test(sql)) throw new Error('disk full'); return orig(sql, ...p); };
  try { assert.equal(A.alert('review', { ref: 'x' }), false); } finally { q.run = orig; }
  assert.equal(SR.createRequest({ school: 'Fine School', role: 'leader', email: 'a@b.example', students: 5, country: 'US' }).ok, true);
});

// ---------------------------------------------------------------- one batch, grouped, private
test('one email per run, grouped with counts, linking to the admin pages; nothing private in it; a burst is still one email', async () => {
  const kid = auth.createUser({ username: `Maker${fresh()}`, password: 'rainbow-77', displayName: REAL_NAME });
  for (const t of ['Fraction Race', 'Very <b>Long</b> Title '.repeat(10)]) { const g = games.createGame(kid.id, { title: t }); games.addVersion(g.id, GOOD); await pub.publish(kid, g.id, 'public'); }
  // A burst of sign-ups: 3 students, 1 teacher, 1 grown-up... and 40 kids.
  const school = S.createSchool(admin, { name: `Burst School ${fresh()}` }).school;
  for (let i = 0; i < 3; i++) { const st = auth.createUser({ username: `Stu${fresh()}`, password: 'rainbow-77', displayName: REAL_NAME }); q.run('UPDATE users SET managed_school=? WHERE id=?', school.id, st.id); A.alert('signup', { ref: st.id }); }
  const tch = auth.createUser({ username: `Tch${fresh()}`, password: PW, displayName: REAL_NAME }); S.addMember(admin, school.id, tch.id, 'teacher'); A.alert('signup', { ref: tch.id });
  const gu = auth.createUser({ username: `Gu${fresh()}`, password: PW, accountType: 'grownup', displayName: REAL_NAME }); A.alert('signup', { ref: gu.id });
  for (let i = 0; i < 40; i++) A.alert('signup', { ref: auth.createUser({ username: `Burst${fresh()}`, password: 'rainbow-77', displayName: REAL_NAME }).id });
  assert.equal(team.sendDirect(admin, gu, 'Hi').ok, true);
  team.reply(gu, { body: SECRET_TEXT }); team.reply(gu, { body: `${SECRET_TEXT} again` });
  SR.createRequest({ school: 'Quartermaine Prep', role: 'it', email: 'it@school.example', students: 9, country: 'US', name: REAL_NAME });

  const r = await A.runDue();
  assert.equal(r.status, 'sent');
  assert.equal(sent.length, 1, 'one email');
  const { body, headers } = sent[0];
  assert.deepEqual(body.to, ['boss@oomba.example']);
  assert.equal(body.headers, undefined, 'internal mail: no List-Unsubscribe');
  assert.match(headers['Idempotency-Key'], /^admin-alerts-/);
  assert.match(body.subject, /^Oomba admin: 2 games waiting for review, 45 new accounts and 2 more$/);
  const text = body.text;
  assert.match(text, /2 games waiting for review\nhttps:\/\/oomba\.example\/admin\?tab=queue\n {2}- "Fraction Race" by @Maker/);
  assert.match(text, /45 new accounts: 3 students, 40 kids, 1 teacher, 1 grown-up\nhttps:\/\/oomba\.example\/admin\?tab=newusers&range=7d/);
  assert.match(text, /and 35 more/, 'at most 10 lines per kind');
  assert.match(text, new RegExp(`2 new messages to the Oomba team\\n.*\\n {2}- From @${gu.username} \\(grown-up\\) \\(2\\): https://oomba\\.example/admin/messages/${gu.username}`));
  assert.match(text, /1 school request\n.*\n {2}- A request from school IT staff/);
  // Titles: clipped to 60 characters and escaped in the HTML.
  assert.ok(text.includes(`"${'Very <b>Long</b> Title '.repeat(10).replace(/\s+/g, ' ').trim().slice(0, 60)}"`));
  assert.ok(!body.html.includes('<b>Long</b>') && body.html.includes('&lt;b&gt;Long&lt;/b&gt;'));
  for (const part of [body.html, body.text, body.subject]) {
    assert.ok(!part.includes(REAL_NAME), 'no real names');
    assert.ok(!part.includes('zebra42'), 'no message text');
    assert.ok(!part.includes('it@school.example') && !part.includes('Quartermaine'), 'no request details');
    assert.doesNotMatch(part, /\u2014/, 'no em dashes');
  }
  assert.equal(pending().length, 0);
  assert.equal(q.get("SELECT COUNT(*) n FROM admin_alerts WHERE status='sent'").n, 2 + 45 + 2 + 1);
  const b = q.get('SELECT * FROM admin_alert_batches');
  assert.equal(b.status, 'sent'); assert.equal(b.message, null, 'the rendered email is not kept once sent');
  // Nothing new: the next run sends nothing.
  assert.equal((await A.runDue()).status, 'idle'); assert.equal(sent.length, 1);
});

// ---------------------------------------------------------------- switches
test('the master switch, each kind, and ADMIN_ALERTS=0', async () => {
  A.setSwitch(admin, false);
  assert.equal(A.alert('review', { ref: 'g1' }), false, 'off: nothing is queued');
  A.setSwitch(admin, true);
  A.setKind(admin, 'signup', false);
  assert.equal(A.alert('signup', { ref: admin.id }), false);
  assert.equal(A.alert('review', { ref: 'g1' }), true);
  // A kind switched off after its row was queued: not sent.
  A.setKind(admin, 'signup', true); A.alert('signup', { ref: admin.id }); A.setKind(admin, 'signup', false);
  await A.runDue();
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.text, /1 game waiting for review/); assert.doesNotMatch(sent[0].body.text, /new account/);
  assert.equal(q.get("SELECT status FROM admin_alerts WHERE kind='signup'").status, 'skipped');
  // ADMIN_ALERTS=0: nothing queued, nothing sent, no test.
  A.setKind(admin, 'signup', true); A.alert('review', { ref: 'g2' });
  config.adminAlerts = false;
  assert.equal(A.alert('review', { ref: 'g3' }), false);
  assert.equal((await A.runDue()).status, 'idle');
  assert.equal((await A.sendTest(admin)).code, 'killed');
  assert.equal(sent.length, 1);
  // Sending off (no key): nothing queued.
  config.adminAlerts = true; config.resendApiKey = '';
  assert.equal(A.alert('review', { ref: 'g4' }), false);
});

// ---------------------------------------------------------------- restart safety and retries
test('restart-safe: a batch claimed by a stopped server is re-sent with the same keys and email, never a second batch', async () => {
  A.alert('review', { ref: 'r1' });
  // Simulate a stop mid-send: the claim and render happen, the send never answers.
  let hang;
  E._hooks({ fetch: () => new Promise(r => { hang = r; }) });
  const t0 = Date.now();
  const p = A.runDue(t0);
  await new Promise(r => setTimeout(r, 20));
  const b = q.get('SELECT * FROM admin_alert_batches');
  assert.equal(b.status, 'sending'); assert.ok(b.message);
  E._hooks({ fetch: fakeResend });
  // Another process (or the restarted one) right away: the claimed batch is left alone, and the claimed rows too.
  A.alert('review', { ref: 'r2' });
  assert.equal((await A.runDue(t0 + 60e3)).status, 'idle'); assert.equal(sent.length, 0);
  // After RECLAIM_AFTER: the same batch again, the same Idempotency-Key and the same email.
  const r = await A.runDue(t0 + 6 * 60e3);
  assert.equal(r.batch, b.id); assert.equal(sent.length, 1);
  assert.equal(sent[0].headers['Idempotency-Key'], `admin-alerts-${b.id}-${sent[0].headers['Idempotency-Key'].split('-').pop()}`);
  assert.equal(sent[0].body.subject, JSON.parse(b.message).subject);
  assert.equal(q.get('SELECT status FROM admin_alert_batches WHERE id=?', b.id).status, 'sent');
  hang({ status: 200, json: async () => ({ id: 'late' }) }); await p;
  // The row that came in meanwhile goes in the next run, as its own batch.
  assert.equal((await A.runDue(t0 + 16 * 60e3)).status, 'sent'); assert.equal(sent.length, 2);
  assert.match(sent[1].body.text, /1 game waiting for review/);
});

test('a failed batch is retried on the next runs with the same key, then marked failed', async () => {
  A.alert('message', { ref: admin.id });
  replies = [500, 500, 500];   // the first run's three tries all fail
  assert.equal((await A.runDue()).status, 'retry');
  const b = q.get('SELECT * FROM admin_alert_batches');
  assert.equal(b.status, 'retry');
  replies = [500, 500, 500];
  assert.equal((await A.runDue()).status, 'retry');
  replies = [500, 500, 500];
  assert.equal((await A.runDue()).status, 'failed');
  assert.equal(q.get('SELECT status FROM admin_alert_batches').status, 'failed');
  assert.equal(q.get('SELECT status FROM admin_alerts').status, 'failed');
  assert.equal(new Set(sent.map(s => s.headers['Idempotency-Key'])).size, 1, 'one key for the batch');
  // A success on a retry marks it sent.
  sent.length = 0; A.alert('message', { ref: admin.id }); replies = [500, 500, 500];
  await A.runDue();
  assert.equal((await A.runDue()).status, 'sent');
});

// ---------------------------------------------------------------- recipients
test('only admin accounts get them: their own address and ADMIN_ALERTS_TO; never a non-admin', async () => {
  const admin2 = auth.createUser({ username: `Boss2${fresh()}`, password: PW, role: 'admin' });
  google(admin2, 'boss2@oomba.example');
  config.adminAlertsTo = ['owner@oomba.example', 'BOSS@oomba.example'];
  assert.deepEqual(A.recipients().map(r => r.email).sort(), ['boss2@oomba.example', 'boss@oomba.example', 'owner@oomba.example']);
  assert.ok(A.recipients().every(r => auth.getUser(r.userId).role === 'admin'));
  A.alert('review', { ref: 'x' });
  await A.runDue();
  assert.deepEqual(sent.map(s => s.body.to[0]).sort(), ['boss2@oomba.example', 'boss@oomba.example', 'owner@oomba.example']);
  assert.ok(!sent.some(s => s.body.to.includes('teacher@school.example')));
  // services/email.js refuses category 'admin' to anyone not an admin, even with an explicit address.
  const r = await E.send({ userId: outsider.id, to: 'teacher@school.example', template: 'admin_alerts', category: 'admin', subject: 's', html: 'h', text: 't' });
  assert.deepEqual(r, { status: 'skipped', reason: 'not_admin' });
  // An admin who loses the role is no longer a recipient.
  q.run("UPDATE users SET role='player' WHERE id=?", admin2.id);
  assert.ok(!A.recipients().some(x => x.email === 'boss2@oomba.example'));
  // No admin address at all: rows wait, nothing is sent, the page says so.
  q.run('DELETE FROM google_identities WHERE user_id=?', admin.id); config.adminAlertsTo = [];
  sent.length = 0; A.alert('review', { ref: 'y' });
  assert.equal((await A.runDue()).status, 'no_recipient'); assert.equal(sent.length, 0); assert.equal(pending('review').length, 1);
  const page = await call(adminCookie, '/admin/emails');
  assert.match(page.text, /id="alerts-no-address"/);
  google(admin, 'boss@oomba.example');
  // Rows nobody could be told about for 2 days are dropped, not sent late.
  q.run("UPDATE admin_alerts SET created_at=? WHERE status='pending'", Date.now() - 3 * 864e5);
  assert.equal((await A.runDue()).status, 'idle'); assert.equal(q.get("SELECT status FROM admin_alerts WHERE ref='y'").status, 'expired');
});

// ---------------------------------------------------------------- the admin page
test('/admin/emails: the section, switches, the test alert, the preview, and the log; non-admins get 404', async () => {
  let page = await call(adminCookie, '/admin/emails');
  assert.equal(page.status, 200);
  assert.match(page.text, /id="e-alerts"/);
  for (const k of A.KIND_ORDER) assert.ok(page.text.includes(`name="kind" value="${k}"`));
  assert.match(page.text, /b•••@oomba\.example/);
  // Per kind and master switch through the API.
  let r = await call(adminCookie, '/api/admin/emails/admin-alerts/kind', { method: 'POST', body: { kind: 'signup', on: '0' } });
  assert.equal(r.status, 200); assert.equal(A.kindOn('signup'), false);
  assert.equal((await call(adminCookie, '/api/admin/emails/admin-alerts/kind', { method: 'POST', body: { kind: 'nope', on: '0' } })).status, 404);
  r = await call(adminCookie, '/api/admin/emails/admin-alerts', { method: 'POST', body: { on: '0' } });
  assert.equal(r.json.on, false); assert.equal(A.switchOn(), false);
  // The test alert goes even while switched off, with "[Test]" and made-up examples.
  r = await call(adminCookie, '/api/admin/emails/admin-alerts/test', { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(sent.map(x => x.body.to[0]), ['boss@oomba.example']); assert.match(sent[0].body.subject, /^\[Test\] Oomba admin: /);
  assert.match(sent[0].body.text, /This is a test with made-up examples/);
  assert.equal(q.get('SELECT test, status FROM admin_alert_batches').status, 'sent');
  assert.equal((await A.runDue()).status, 'idle', 'the job never re-sends a test');
  page = await call(adminCookie, '/admin/emails');
  assert.match(page.text, /id="alerts-log"[\s\S]*Test alert/);
  const prev = await call(adminCookie, '/admin/emails/preview-alerts?format=text');
  assert.match(prev.text, /^Subject: \[Test\] Oomba admin: 2 games waiting for review/);
  // Not an admin: 404 everywhere.
  const other = cookieFor(outsider.id);
  assert.equal((await call(other, '/api/admin/emails/admin-alerts/test', { method: 'POST', body: {} })).status, 404);
  assert.equal((await call(other, '/api/admin/emails/admin-alerts', { method: 'POST', body: { on: '1' } })).status, 404);
  assert.equal(sent.length, 1);
});
