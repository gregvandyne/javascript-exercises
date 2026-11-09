// Trial emails (docs/decisions.md "Trial emails"): the Resend client (services/email.js) with its gates (no key,
// EMAIL_ENABLED off, no postal address, kid accounts, no address, unsubscribed), retries and idempotency keys; the
// signed one-click unsubscribe (routes/email.js); the templates (services/email-templates.js); the trial sequence's
// scheduler (services/nudges.js): due times, skip rules, conversion, the end without a card, restarts and late
// catch-up; and /admin/emails. Resend is never called: services/email.js's fetch hook answers instead.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const E = await import('../../server/services/email.js');
const N = await import('../../server/services/nudges.js');
const T = await import('../../server/services/email-templates.js');
const S = await import('../../server/services/schools.js');

const H = 3600e3, DAY = 24 * H;
const PW = 'a-long-password-1';
let n = 0;
const fresh = () => (++n).toString(26).split('').map(c => String.fromCharCode(97 + parseInt(c, 26))).join('');
const admin = auth.createUser({ username: `MailBoss${fresh()}`, password: PW, role: 'admin', displayName: 'Greg Boss' });
const school = S.createSchool(admin, { name: `Mail School ${fresh()}` }).school;
/** A teacher of the school, with a checkout address unless email is false. */
function teacher({ email = true, name = 'Sam Lee' } = {}) {
  const u = auth.createUser({ username: `Teach${fresh()}`, password: PW, displayName: name });
  S.addMember(admin, school.id, u.id, 'teacher');
  if (email) assert.equal(E.rememberAddress(u.id, `t${fresh()}@school.example`), true);
  return auth.getUser(u.id);
}
const kid = () => auth.createUser({ username: `Kiddo${fresh()}`, password: 'rainbow-77' });

// ---- The fake Resend ----
const sent = [];
let replies = [];   // statuses to answer next (default 200)
function fakeResend(url, init) {
  const body = JSON.parse(init.body);
  sent.push({ url, headers: init.headers, body });
  const st = replies.length ? replies.shift() : 200;
  return Promise.resolve({ status: st, json: async () => (st === 200 ? { id: `re_msg_${sent.length}` } : { name: st === 422 ? 'validation_error' : 'internal_server_error', message: 'nope' }) });
}
E._hooks({ fetch: fakeResend, wait: () => Promise.resolve() });
N._opts.kick = false;
const ON = { resendApiKey: 're_test_key', emailEnabled: true, emailPostalAddress: '123 Main St, Springfield, IL 62701', publicUrl: 'https://oomba.example' };
test.beforeEach(() => { Object.assign(config, ON); sent.length = 0; replies = []; q.run("DELETE FROM settings WHERE key=?", N.SWITCH_KEY); });
const templatesTo = id => q.all("SELECT template FROM email_log WHERE user_id=? AND status='sent' ORDER BY created_at, rowid", id).map(r => r.template);
const row = (id, step) => q.get('SELECT * FROM trial_nudges WHERE user_id=? AND step=?', id, step);

let server, base = '';
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers, ...(cookie ? { cookie } : {}) };
  if (body !== undefined && typeof body !== 'string') h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, type: r.headers.get('content-type') || '' };
}

// ---------------------------------------------------------------- templates
test('templates: every email renders with its approved subject and preview, no placeholder left, a text part, real links with UTM tags, the footer', () => {
  const want = {
    welcome: ["You're in! Your first game takes 2 minutes", 'Paste a lesson, get a game your class will beg to play.'],
    class: ['Your class is one code away', 'Students join in seconds, with no email addresses needed.'],
    ideas: ['3 ways teachers are using Oomba this week', 'Warm-ups, review days and student-built games.'],
    ending: ['Your trial ends in 3 days', 'Keep your classes, games and progress for one simple yearly price.'],
    ended: ['Your trial has ended, but your classes are saved', 'Pick up right where you left off, anytime.'],
    thanks: ["You're all set!", null],
  };
  const end = Date.UTC(2026, 10, 23, 20);   // Monday 23 November 2026, 3pm in New York
  for (const step of T.TRIAL_STEPS) {
    const m = T.renderTrial(step, { firstName: 'Sam', trialEnd: end, base: 'https://oomba.example', unsubscribeUrl: 'https://oomba.example/email/unsubscribe?t=abc.def', postalAddress: '123 Main St' });
    assert.equal(m.subject, want[step][0]);
    if (want[step][1]) assert.equal(m.preview, want[step][1]);
    for (const part of [m.html, m.text, m.subject]) assert.doesNotMatch(part, /\{\w+\}/, `${step}: a placeholder is left`);
    assert.match(m.text, /^Hi Sam,\n/);
    assert.ok(m.text.length > 200, `${step}: text part`);
    assert.match(m.html, /<html lang="en"/); assert.match(m.html, /role="presentation"/); assert.match(m.html, /color-scheme/);
    assert.ok(m.html.includes(m.preview), 'the preview text is the hidden preheader');
    // Footer, both parts.
    for (const part of [m.html.replace(/&#39;/g, "'"), m.text]) {
      assert.match(part, /You're getting this because you started a free trial on Oomba Academy/);
      assert.ok(part.includes('https://oomba.example/email/unsubscribe?t=abc.def')); assert.match(part, /123 Main St/);
    }
    // Links: absolute, on the site, with UTM tags naming this email.
    const links = [...m.html.matchAll(/href="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&')).filter(h => !h.startsWith('mailto:') && !h.includes('/email/unsubscribe'));
    assert.ok(links.length >= 1, `${step}: a CTA`);
    for (const h of links) {
      const u = new URL(h);
      assert.equal(u.origin, 'https://oomba.example');
      assert.equal(u.searchParams.get('utm_medium'), 'email'); assert.equal(u.searchParams.get('utm_campaign'), 'teacher_trial'); assert.equal(u.searchParams.get('utm_content'), step);
      assert.ok(m.text.includes(h), `${step}: the text part has the same link`);
    }
  }
  const w = T.renderTrial('welcome', { firstName: 'Sam' });
  assert.match(w.text, /Greg\nFounder, Oomba Academy/); assert.match(w.text, /15-minute call/); assert.match(w.html, /mailto:Greg@oomba\.ai/);
  assert.match(T.renderTrial('class', {}).text, /^Hi there,\n/, 'no first name: a plain greeting');
  assert.match(T.renderTrial('class', {}).text, /It's often the moment the room lights up\./);
  assert.doesNotMatch(T.renderTrial('class', {}).text, /most teachers tell us/);
  assert.match(T.renderTrial('ideas', {}).text, /CS Quest comes with full 45-minute lesson plans, and the other two with teacher notes/);
  assert.match(T.renderTrial('ideas', {}).text, /Reply and we'll find 15 minutes/);
  assert.match(T.renderTrial('ended', {}).text, /15-minute call/);
  assert.match(T.renderTrial('ending', { trialEnd: end }).text, /Your free trial ends on Monday, November 23\./);
  assert.match(T.renderTrial('ending', {}).text, /\nGreg\n/); assert.doesNotMatch(T.renderTrial('ending', {}).text, /Founder/);
  assert.equal(T.copyFor('fr').locale, 'en', 'no French copy yet: English');
  assert.equal(T.firstNameOf({ display_name: 'Ms. Owl' }), 'Ms. Owl', 'a title keeps the whole name');
  assert.equal(T.firstNameOf({ display_name: 'Mr' }), '');
  assert.equal(T.firstNameOf({ display_name: 'cool_kid99' }), '', 'not a name: no greeting by name');
  assert.equal(T.firstNameOf({ display_name: 'TeachX' }, 'Ms Rivera'), 'Ms Rivera', 'a teacher\'s school roster name first');
  assert.equal(T.firstNameOf({ display_name: 'María José' }), 'María');
});

// ---------------------------------------------------------------- sending
test('send: off without a key or with EMAIL_ENABLED=0; a nudge needs the postal address; never Resend while off', async () => {
  const t = teacher();
  const m = { userId: t.id, template: 'trial_welcome', category: 'nudge', subject: 's', html: '<p>h</p>', text: 't' };
  config.resendApiKey = '';
  assert.equal((await E.send(m)).status, 'off');
  Object.assign(config, ON, { emailEnabled: false });
  assert.equal((await E.send(m)).status, 'off');
  Object.assign(config, ON, { emailPostalAddress: '' });
  assert.deepEqual(await E.send(m), { status: 'off', reason: 'no_postal_address' });
  assert.equal(E.emailStatus().nudges, false); assert.match(E.emailStatus().problems.join(' '), /EMAIL_POSTAL_ADDRESS/);
  // A transactional email doesn't need it.
  assert.equal((await E.send({ ...m, category: 'transactional' })).status, 'sent');
  assert.equal(sent.length, 1);
  Object.assign(config, ON);
  assert.equal((await E.send(m)).status, 'sent');
  assert.equal(sent.length, 2);
});

test('send: the Resend call (bearer key, idempotency key, reply-to, one-click unsubscribe headers); one log row, no body', async () => {
  const t = teacher();
  const r = await E.send({ userId: t.id, template: 'trial_welcome', category: 'nudge', subject: 'Hello', html: '<p>Secret body</p>', text: 'Secret body', idemKey: 'trial-x-welcome' });
  assert.equal(r.status, 'sent');
  const s = sent.at(-1);
  assert.equal(s.url, 'https://api.resend.com/emails');
  assert.equal(s.headers.Authorization, 'Bearer re_test_key'); assert.equal(s.headers['Idempotency-Key'], 'trial-x-welcome');
  assert.equal(s.body.from, 'Greg at Oomba Academy <greg@oomba.ai>'); assert.equal(s.body.reply_to, 'Greg@oomba.ai');
  assert.deepEqual(s.body.to, [E.addressOf(t.id).email]);
  assert.equal(s.body.headers['List-Unsubscribe'], `<${E.unsubscribeUrl(t.id)}>`);
  assert.equal(s.body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(E.unsubscribeUrl(t.id), /^https:\/\/oomba\.example\/email\/unsubscribe\?t=/);
  const log = q.get('SELECT * FROM email_log WHERE user_id=? ORDER BY created_at DESC, rowid DESC', t.id);
  assert.equal(log.status, 'sent'); assert.equal(log.template, 'trial_welcome'); assert.equal(log.provider_id, `re_msg_${sent.length}`); assert.equal(log.to_email, E.addressOf(t.id).email);
  assert.doesNotMatch(JSON.stringify(log), /Secret body/);
});

test('send: never to a kid, a guest or a banned account; skipped without an address; a Google address wins over the checkout one', async () => {
  const k = kid();
  assert.equal(E.rememberAddress(k.id, 'kid@example.com'), false, 'a kid\'s address is never kept');
  q.run("INSERT INTO email_prefs(user_id, email, email_source, updated_at) VALUES (?,?,?,?)", k.id, 'kid@example.com', 'checkout', Date.now());   // even if one got in
  const m = { template: 'trial_welcome', category: 'nudge', subject: 's', html: 'h', text: 't' };
  assert.deepEqual(await E.send({ ...m, userId: k.id }), { status: 'skipped', reason: 'not_adult' });
  assert.deepEqual(await E.send({ ...m, userId: k.id, category: 'transactional' }), { status: 'skipped', reason: 'not_adult' });
  const g = auth.createGuest();
  assert.equal((await E.send({ ...m, userId: g.id })).reason, 'not_adult');
  const b = teacher(); q.run('UPDATE users SET banned=1 WHERE id=?', b.id);
  assert.equal((await E.send({ ...m, userId: b.id })).reason, 'not_adult');
  assert.equal(sent.length, 0);
  const none = teacher({ email: false });
  assert.deepEqual(await E.send({ ...m, userId: none.id }), { status: 'skipped', reason: 'no_address' });
  assert.equal(q.get("SELECT error FROM email_log WHERE user_id=? ORDER BY rowid DESC", none.id).error, 'no_address');
  const t = teacher();
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', `sub-${fresh()}`, t.id, 'verified@school.example', 'school.example', Date.now());
  assert.deepEqual(E.addressOf(t.id), { email: 'verified@school.example', source: 'google' });
  // A grown-up account counts as a grown-up.
  const gu = auth.createUser({ username: `Mum${fresh()}`, password: PW, accountType: 'grownup' });
  assert.equal(E.adultRecipient(gu), true); assert.equal(E.adultRecipient(k), false);
});

test('send: retried with backoff on 5xx and 429 (same idempotency key), not on a 4xx; failures are logged', async () => {
  const t = teacher();
  const m = { userId: t.id, template: 'trial_ideas', category: 'nudge', subject: 's', html: 'h', text: 't', idemKey: `k-${fresh()}` };
  replies = [500, 429];
  assert.equal((await E.send(m)).status, 'sent');
  assert.equal(sent.length, 3); assert.equal(new Set(sent.map(s => s.headers['Idempotency-Key'])).size, 1);
  assert.equal(q.get("SELECT attempts FROM email_log WHERE user_id=? AND status='sent'", t.id).attempts, 3);
  sent.length = 0; replies = [500, 500, 500];
  const f = await E.send({ ...m, idemKey: `k-${fresh()}` });
  assert.equal(f.status, 'failed'); assert.equal(sent.length, 3);
  sent.length = 0; replies = [422];
  assert.equal((await E.send({ ...m, idemKey: `k-${fresh()}` })).status, 'failed'); assert.equal(sent.length, 1, 'a 4xx is not retried');
  assert.match(q.get("SELECT error FROM email_log WHERE user_id=? AND status='failed' ORDER BY rowid DESC", t.id).error, /HTTP 422 validation_error/);
});

// ---------------------------------------------------------------- unsubscribe
test('unsubscribe: a signed link; GET only asks; POST (the button or the mail app\'s one-click) turns nudges off; receipts still go; subscribe again', async () => {
  const t = teacher();
  const tok = E.unsubToken(t.id);
  assert.equal(E.readUnsubToken(tok), t.id);
  assert.equal(E.readUnsubToken(`${t.id}.${'x'.repeat(32)}`), null, 'a forged signature');
  assert.equal(E.readUnsubToken(tok.replace(t.id, kid().id)), null, 'another account with this signature');
  assert.equal((await call(null, '/email/unsubscribe?t=nope.nope')).status, 400);
  const page = await call(null, `/email/unsubscribe?t=${encodeURIComponent(tok)}`);
  assert.equal(page.status, 200); assert.match(page.text, /Unsubscribe from Oomba Academy emails\?/);
  assert.equal(E.nudgesOff(t.id), false, 'a GET (a mail scanner) changes nothing');
  // RFC 8058 one-click: a POST from the mail provider's servers, form body, no cookie, no Origin.
  const one = await call(null, `/email/unsubscribe?t=${encodeURIComponent(tok)}`, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(one.status, 200); assert.match(one.text, /You're unsubscribed/);
  assert.equal(E.nudgesOff(t.id), true);
  assert.equal((await call(null, '/email/unsubscribe?t=bad', { method: 'POST', body: '' })).status, 400);
  // Nudges stop; a transactional email still goes.
  const m = { userId: t.id, template: 'trial_class', subject: 's', html: 'h', text: 't' };
  assert.deepEqual(await E.send({ ...m, category: 'nudge' }), { status: 'skipped', reason: 'unsubscribed' });
  assert.equal((await E.send({ ...m, category: 'transactional' })).status, 'sent');
  // The sequence skips them too.
  N.onTrialStarted({ userId: t.id, trialStart: Date.now(), trialEnd: Date.now() + 14 * DAY });
  await N.runDue(Date.now() + 60e3);
  assert.equal(row(t.id, 'welcome').status, 'skipped'); assert.equal(row(t.id, 'welcome').reason, 'unsubscribed');
  // Subscribe again (the page's button).
  const again = await call(null, `/email/unsubscribe?t=${encodeURIComponent(tok)}&again=1`, { method: 'POST', body: '' });
  assert.match(again.text, /You(&#39;|')re subscribed again/); assert.equal(E.nudgesOff(t.id), false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='email.unsubscribe' AND target=?", t.id));
});

// ---------------------------------------------------------------- the sequence
test('sequence: welcome at once, class on day 2, ideas on day 5, ending 3 days before the end; each once, even when the job runs again', async () => {
  const t = teacher();
  const start = Date.now(), end = start + 14 * DAY;
  assert.deepEqual(N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: end }), { ok: true });
  assert.deepEqual(N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: end }), { ok: true, reason: 'already' }, 'a redelivered webhook');
  assert.equal(row(t.id, 'class').due_at, start + 2 * DAY); assert.equal(row(t.id, 'ideas').due_at, start + 5 * DAY);
  assert.equal(row(t.id, 'ending').due_at, end - 3 * DAY + 2 * H); assert.equal(row(t.id, 'ended'), undefined);
  await N.runDue(start + 1000); await N.runDue(start + 2000);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome']);
  assert.equal(sent.at(-1).headers['Idempotency-Key'], `trial-${t.id}-welcome`);
  assert.match(sent.at(-1).body.text, /^Hi Sam,/); assert.match(sent.at(-1).body.html, /123 Main St, Springfield/);
  await N.runDue(start + DAY);
  assert.equal(templatesTo(t.id).length, 1);
  await N.runDue(start + 2 * DAY + 60e3); await N.runDue(start + 2 * DAY + 120e3);
  await N.runDue(start + 5 * DAY + 60e3);
  await N.runDue(end - 3 * DAY + 3 * H);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome', 'trial_class', 'trial_ideas', 'trial_ending']);
  assert.match(sent.at(-1).body.text, /Your free trial ends on /);
  // The trial runs out without converting: nothing more until the billing side says it ended.
  await N.runDue(end + H);
  assert.equal(templatesTo(t.id).length, 4);
});

test('sequence: day 2 is skipped for a teacher who already has a class', async () => {
  const t = teacher();
  S.createClass(t, school.id, { name: 'Room 4' });
  assert.equal(N.hasClass(t.id), true);
  const start = Date.now();
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: start + 14 * DAY });
  await N.runDue(start + 1000);
  await N.runDue(start + 2 * DAY + 60e3);
  assert.equal(row(t.id, 'class').status, 'skipped'); assert.equal(row(t.id, 'class').reason, 'has_class');
  assert.deepEqual(templatesTo(t.id), ['trial_welcome']);
});

test('conversion stops the sequence and sends the thank-you once', async () => {
  const t = teacher();
  const start = Date.now();
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: start + 14 * DAY });
  await N.runDue(start + 1000);
  assert.deepEqual(N.onTrialConverted(t.id), { ok: true });
  assert.deepEqual(N.onTrialConverted(t.id), { ok: true, reason: 'already' });
  assert.equal(N.onTrialEnded(t.id).reason, 'converted', 'a converted trial never gets "your trial has ended"');
  for (const st of ['class', 'ideas', 'ending']) assert.equal(row(t.id, st).status, 'canceled');
  await N.runDue(Date.now() + 1000);
  await N.runDue(start + 13 * DAY);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome', 'trial_thanks']);
  assert.equal(sent.at(-1).body.subject, "You're all set!");
  assert.equal(q.get("SELECT category FROM email_log WHERE user_id=? AND template='trial_thanks'", t.id).category, 'transactional');
});

test('a trial that ends without a card gets #5; the rest is canceled', async () => {
  const t = teacher();
  const start = Date.now() - 14 * DAY;
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: Date.now() });
  q.run("UPDATE trial_nudges SET status='sent' WHERE user_id=?", t.id);   // as if the first four went
  assert.deepEqual(N.onTrialEnded(t.id), { ok: true });
  assert.equal(N.onTrialEnded(t.id).reason, 'ended');
  await N.runDue(Date.now() + 1000); await N.runDue(Date.now() + 2000);
  assert.deepEqual(templatesTo(t.id), ['trial_ended']);
  assert.match(sent.at(-1).body.text, /Nothing was charged\. Your classes and games are saved/);
  assert.equal(N.onTrialConverted(t.id).ok, true, 'paying later still says thank you');
});

test('restarts: a row claimed by a run that died is sent again with the same key (Resend drops the copy); after a day it is not risked', async () => {
  const t = teacher();
  const start = Date.now();
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: start + 14 * DAY });
  // The server stopped mid-send: claimed, never marked.
  q.run("UPDATE trial_nudges SET status='sending', claimed_at=?, attempts=1 WHERE user_id=? AND step='welcome'", start, t.id);
  await N.runDue(start + 5 * 60e3);
  assert.equal(templatesTo(t.id).length, 0, 'not while it may still be in flight');
  await N.runDue(start + 11 * 60e3);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome']); assert.equal(sent.at(-1).headers['Idempotency-Key'], `trial-${t.id}-welcome`);
  // Claimed more than a day ago: marked failed, never sent (Resend no longer remembers the key).
  q.run("UPDATE trial_nudges SET status='sending', claimed_at=?, due_at=? WHERE user_id=? AND step='class'", start + 2 * DAY, start + 2 * DAY, t.id);
  sent.length = 0;
  await N.runDue(start + 3 * DAY + H);
  assert.equal(row(t.id, 'class').status, 'failed'); assert.equal(row(t.id, 'class').reason, 'unconfirmed'); assert.equal(sent.length, 0);
});

test('late catch-up: after downtime an email still goes within its allowance, never later (24 hours for the date-sensitive ones)', async () => {
  const t = teacher();
  const start = Date.now();
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: start + 14 * DAY });
  // Down for 30 hours: the welcome (allowed 48h) still goes.
  await N.runDue(start + 30 * H);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome']);
  // Down over day 2 until 25 hours after it: "try a live game tomorrow" is skipped.
  await N.runDue(start + 2 * DAY + 25 * H);
  assert.equal(row(t.id, 'class').status, 'skipped'); assert.equal(row(t.id, 'class').reason, 'too_late');
  // "Ends in 3 days" more than 24 hours late: skipped.
  await N.runDue(start + 5 * DAY + H);
  await N.runDue(start + 11 * DAY + 2 * H + 25 * H);
  assert.equal(row(t.id, 'ending').reason, 'too_late');
  assert.deepEqual(templatesTo(t.id), ['trial_welcome', 'trial_ideas']);
  // "Your trial has ended" more than a day after the end: skipped.
  N.onTrialEnded(t.id);
  await N.runDue(Date.now() + 25 * H);
  assert.equal(row(t.id, 'ended').reason, 'too_late');
});

test('nothing goes while the admin switch is off, EMAIL_ENABLED is 0 or the postal address is empty; due rows wait', async () => {
  const t = teacher();
  const start = Date.now();
  N.onTrialStarted({ userId: t.id, trialStart: start, trialEnd: start + 14 * DAY });
  N.setSwitch(admin, false);
  await N.runDue(start + 1000);
  config.emailEnabled = false; N.setSwitch(admin, true);
  await N.runDue(start + 2000);
  Object.assign(config, ON, { emailPostalAddress: '' });
  assert.equal((await N.runDue(start + 3000)).waiting, 1);
  assert.equal(sent.length, 0); assert.equal(row(t.id, 'welcome').status, 'pending');
  Object.assign(config, ON);
  await N.runDue(start + 4000);
  assert.deepEqual(templatesTo(t.id), ['trial_welcome']);
});

test('the sequence never starts for a kid account, and skips a teacher with no address', async () => {
  const k = kid();
  assert.deepEqual(N.onTrialStarted({ userId: k.id, trialEnd: Date.now() + 14 * DAY }), { ok: false, reason: 'not_adult' });
  assert.equal(q.get('SELECT COUNT(*) n FROM trial_nudges WHERE user_id=?', k.id).n, 0);
  const t = teacher({ email: false });
  N.onTrialStarted({ userId: t.id, trialEnd: Date.now() + 14 * DAY, email: 'given@school.example' });
  assert.equal(E.addressOf(t.id).email, 'given@school.example', 'the checkout address is kept for the trial emails');
  const t2 = teacher({ email: false });
  N.onTrialStarted({ userId: t2.id, trialEnd: Date.now() + 14 * DAY });
  await N.runDue(Date.now() + 1000);
  assert.equal(row(t2.id, 'welcome').status, 'skipped'); assert.equal(row(t2.id, 'welcome').reason, 'no_address');
  // Stripe's seconds work too.
  const t3 = teacher();
  N.onTrialStarted({ userId: t3.id, trialStart: Math.floor(Date.now() / 1000), trialEnd: Math.floor(Date.now() / 1000) + 14 * 86400 });
  assert.ok(row(t3.id, 'ending').due_at > Date.now() + 10 * DAY);
});

// ---------------------------------------------------------------- admin
test('/admin/emails: admin only; previews, the text part, the switch, a test send to the admin\'s own address, the log and the CAN-SPAM warning', async () => {
  const t = teacher(); const k = kid();
  const gu = auth.createUser({ username: `Mum${fresh()}`, password: PW, accountType: 'grownup' });
  for (const u of [t, k, gu, auth.createGuest()]) {
    const c = cookieFor(u.id);
    assert.equal((await call(c, '/admin/emails')).status, 404);
    assert.equal((await call(c, '/admin/emails/preview/welcome')).status, 404);
    assert.equal((await call(c, '/api/admin/emails/test', { method: 'POST', body: { step: 'welcome' } })).status, 404);
    assert.equal((await call(c, '/api/admin/emails/nudges', { method: 'POST', body: { on: '0' } })).status, 404);
  }
  assert.equal((await call(null, '/admin/emails')).status, 404);
  assert.equal(sent.length, 0); assert.equal(N.switchOn(), true);
  const a = cookieFor(admin.id);
  config.contactEmail = 'greg@oomba.example';
  let p = await call(a, '/admin/emails');
  assert.equal(p.status, 200); assert.match(p.text, /Trial email sequence/); assert.doesNotMatch(p.text, /re_test_key/);
  assert.doesNotMatch(p.text, /id="email-warning"/);
  for (const st of T.TRIAL_STEPS) {
    const v = await call(a, `/admin/emails/preview/${st}`);
    assert.equal(v.status, 200); assert.match(v.type, /html/); assert.match(v.text, /Hi Alex,/);
    const tx = await call(a, `/admin/emails/preview/${st}?format=text`);
    assert.match(tx.type, /text\/plain/); assert.match(tx.text, /^Subject: /);
  }
  assert.equal((await call(a, '/admin/emails/preview/nope')).status, 404);
  const r = await call(a, '/api/admin/emails/test', { method: 'POST', body: { step: 'ending' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(sent.at(-1).body.to, ['greg@oomba.example']); assert.match(sent.at(-1).body.subject, /^\[Test\] Your trial ends in 3 days/);
  assert.equal((await call(a, '/api/admin/emails/nudges', { method: 'POST', body: { on: '0' } })).status, 200);
  assert.equal(N.switchOn(), false);
  config.emailPostalAddress = '';
  p = await call(a, '/admin/emails');
  assert.match(p.text, /id="email-warning"/); assert.match(p.text, /EMAIL_POSTAL_ADDRESS is not set/); assert.match(p.text, /switched off/);
  assert.match(p.text, /trial_ending/, 'the log lists the test send');
  // /admin/billing shows the same warning.
  assert.match((await call(a, '/admin/billing')).text, /id="email-warning"/);
  config.resendApiKey = '';
  assert.equal((await call(a, '/api/admin/emails/test', { method: 'POST', body: { step: 'welcome' } })).status, 409);
});
