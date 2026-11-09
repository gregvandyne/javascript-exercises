// The weekly class summary email (docs/decisions.md "Weekly class summary email"): the teacher's schedule (day, hour,
// time zone, DST), the counts per class, skipped quiet classes and empty weeks, the email in all 13 languages with no
// student names or answers, one send per teacher per week (restarts, retries, the same Idempotency-Key), its own off
// switch (the one-click link with c=digest and the Me page), the admin's switch and row on /admin/emails, and who may
// open /teach/summary, its email preview and /api/me/digest (other teachers, students, kids, grown-ups, guests: no).
// Resend is never called: services/email.js's fetch hook answers instead.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q, uid } = await import('../../server/db.js');
const E = await import('../../server/services/email.js');
const D = await import('../../server/services/digest.js');
const { renderDigest } = await import('../../server/services/digest-email.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const { CODES } = await import('../../server/i18n/index.js');

const H = 3600e3, DAY = 24 * H;
const PW = 'a-long-password-1';
// ---- The fake Resend ----
const sent = [];
let replies = [];
function fakeResend(url, init) {
  sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  const st = replies.length ? replies.shift() : 200;
  return Promise.resolve({ status: st, json: async () => (st === 200 ? { id: `re_dg_${sent.length}` } : { name: 'internal_server_error', message: 'nope' }) });
}
E._hooks({ fetch: fakeResend, wait: () => Promise.resolve() });
const ON = { resendApiKey: 're_test_key', emailEnabled: true, emailPostalAddress: '', publicUrl: 'https://oomba.example' };
test.beforeEach(() => { Object.assign(config, ON); sent.length = 0; replies = []; q.run('DELETE FROM settings WHERE key=?', D.SWITCH_KEY); });

let server, base = '';
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(who, path, { method = 'GET', body } = {}) {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
}

// ---- A school with two teachers, students with real names, a lesson with a written answer, a live game ----
const boss = auth.createUser({ username: `DgBoss${uid(4)}`, password: PW, role: 'admin' });
const school = S.createSchool(boss, { name: 'Digest Elementary' }).school;
S.updateSchool(boss, school.id, { settings: { timeZone: 'America/Chicago' } });
const ana = S.createSchoolAccount(boss, school.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, school.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
E.rememberAddress(ana.id, 'ana@school.example'); E.rememberAddress(ben.id, 'ben@school.example');
const room = S.createClass(ana, school.id, { name: 'Room 5 Science' }).class;
const quiet = S.createClass(ana, school.id, { name: 'Quiet Art Club' }).class;
const bens = S.createClass(ben, school.id, { name: 'Ben Secret Class' }).class;
const zelda = S.createSchoolAccount(ana, school.id, { rosterName: 'Zelda Quixote' }).user; S.addToClass(ana, room.id, zelda.id);
const yuri = S.createSchoolAccount(ana, school.id, { rosterName: 'Yuri Nakamura' }).user; S.addToClass(ana, room.id, yuri.id);
const xena = S.createSchoolAccount(ana, school.id, { rosterName: 'Xena Okafor' }).user; S.addToClass(ana, room.id, xena.id);
const bob = S.createSchoolAccount(ben, school.id, { rosterName: 'Bob Pupil' }).user; S.addToClass(ben, bens.id, bob.id);
const lesson = L.createLesson(ana, school.id, { title: 'Plants and light' }).lesson;
const read = L.addStep(ana, lesson.id, { kind: 'text', title: 'Read', body: 'Leaves.' }).step;
const ask = L.addStep(ana, lesson.id, { kind: 'question', title: 'Explain', body: 'Why do plants need light?' }).step;
const dueDay = new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10);
const cl = L.assign(ana, room.id, lesson.id, { dueAt: dueDay }).classLesson;
const ANSWER = 'MY SECRET ANSWER ABOUT CHLOROPHYLL';
assert.ok(P.markDone(zelda, cl.id, read.id).ok);
assert.ok(P.answer(zelda, cl.id, ask.id, ANSWER).ok);
assert.ok(P.markDone(yuri, cl.id, read.id).ok);
q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, title, started_at, ended_at, players) VALUES (?,?,?,'class','quiz','Warm-up',?,?,3)", uid(10), ana.id, room.id, Date.now() - 2 * DAY, Date.now() - 2 * DAY + 600e3);
const NAMES = ['Zelda', 'Quixote', 'Yuri', 'Nakamura', 'Xena', 'Okafor', ANSWER, 'CHLOROPHYLL'];
/** Ana's slot this week, and an instant just after it. */
const anaSlot = () => D.slotFor(D.prefsOf(ana.id), Date.now());

// ---------------------------------------------------------------- schedule
test('schedule: Monday 7:00 in the school\'s time zone by default; the teacher can pick day, hour and zone; bad values are refused', () => {
  const p = D.prefsOf(ana.id);
  assert.deepEqual([p.on, p.day, p.hour, p.zone, p.zoneFrom], [true, 1, 7, 'America/Chicago', 'school']);
  const lone = auth.createUser({ username: `Lone${uid(4)}`, password: PW });
  assert.equal(D.prefsOf(lone.id).zone, D.FALLBACK_TZ);
  assert.equal(D.savePrefs(ana.id, { day: 7 }).code, 'badDay');
  assert.equal(D.savePrefs(ana.id, { hour: '24' }).code, 'badHour');
  assert.equal(D.savePrefs(ana.id, { tz: 'Mars/Olympus' }).code, 'badZone');
  assert.ok(D.savePrefs(ana.id, { day: '5', hour: '16', tz: 'Europe/London' }).ok);
  assert.deepEqual([D.prefsOf(ana.id).day, D.prefsOf(ana.id).hour, D.prefsOf(ana.id).zone, D.prefsOf(ana.id).zoneFrom], [5, 16, 'Europe/London', 'mine']);
  assert.ok(D.savePrefs(ana.id, { day: 1, hour: 7, tz: '' }).ok);
  assert.equal(D.prefsOf(ana.id).zone, 'America/Chicago');
});

test('schedule: the week\'s slot is the latest send time at or before now, in the zone, across daylight saving', () => {
  const p = { day: 1, hour: 7, zone: 'America/New_York' };
  // Monday 9 Nov 2026, 7:00 EST = 12:00 UTC.
  const mon = Date.UTC(2026, 10, 9, 12);
  assert.deepEqual([D.slotFor(p, mon).week, D.slotFor(p, mon).at], ['2026-11-09', mon]);
  assert.equal(D.slotFor(p, mon - 60e3).week, '2026-11-02', 'a minute before: still last week');
  assert.equal(D.slotFor(p, Date.UTC(2026, 10, 14, 3)).week, '2026-11-09', 'Friday night');
  assert.equal(D.slotFor(p, mon).next, Date.UTC(2026, 10, 16, 12));
  // Across the change to summer time (8 Mar 2026): Monday 9 Mar 7:00 EDT = 11:00 UTC.
  assert.equal(D.slotFor(p, Date.UTC(2026, 2, 10)).at, Date.UTC(2026, 2, 9, 11));
  // Sunday 8 Mar itself, 7:00 (the clocks moved at 2:00): 11:00 UTC.
  assert.equal(D.slotFor({ day: 0, hour: 7, zone: 'America/New_York' }, Date.UTC(2026, 2, 8, 12)).at, Date.UTC(2026, 2, 8, 11));
  // Asia/Tokyo Sunday 21:00 = 12:00 UTC.
  assert.equal(D.slotFor({ day: 0, hour: 21, zone: 'Asia/Tokyo' }, Date.UTC(2026, 10, 8, 13)).at, Date.UTC(2026, 10, 8, 12));
});

// ---------------------------------------------------------------- counts
test('counts per class: due this week, % done, answers to review, not started, live games; quiet classes are left out', () => {
  const sum = D.summaryFor(auth.getUser(ana.id), Date.now(), { names: true });
  assert.deepEqual(sum.classes.map(c => c.name).sort(), ['Quiet Art Club', 'Room 5 Science']);
  assert.ok(!sum.classes.some(c => c.name === 'Ben Secret Class'), "another teacher's class is never in it");
  const c = sum.active.find(x => x.id === room.id);
  assert.equal(c.due, 1); assert.equal(c.toRead, 1); assert.equal(c.notStarted, 1); assert.equal(c.live, 1); assert.equal(c.students, 3);
  assert.equal(c.pct, Math.round(100 * 3 / 6), '3 of 6 steps done');
  assert.deepEqual(c.notStartedNames, ['Xena Okafor'], 'the site page has names');
  assert.deepEqual(sum.quiet.map(x => x.name), ['Quiet Art Club']);
  const bare = D.summaryFor(auth.getUser(ana.id)).active[0];
  assert.equal(bare.notStartedNames, undefined, 'the email summary has no names at all');
});

// ---------------------------------------------------------------- the email
test('the email: counts and links only, never a student\'s name or answer; every language renders, he/ar right to left', () => {
  const u = auth.getUser(ana.id);
  const sum = D.summaryFor(u, Date.now());
  for (const lang of CODES) {
    const m = renderDigest({ ...u, lang }, sum, anaSlot(), { base: 'https://oomba.example' });
    for (const part of [m.html, m.text, m.subject]) {
      assert.doesNotMatch(part, /\{\w+\}|\{count, plural/, `${lang}: a placeholder is left`);
      for (const n of NAMES) assert.ok(!part.includes(n), `${lang}: "${n}" is in the email`);
      assert.ok(!part.includes('digest.email'), `${lang}: a missing key`);
    }
    assert.ok(m.html.includes('Room 5 Science') && m.text.includes('Room 5 Science'));
    assert.ok(!m.html.includes('Quiet Art Club'), 'a quiet class is only counted');
    assert.match(m.html, new RegExp(`<html lang="${lang}" dir="${['he', 'ar'].includes(lang) ? 'rtl' : 'ltr'}"`));
    assert.ok(m.html.includes('/email/unsubscribe?t=') && m.html.includes('&amp;c=digest'), `${lang}: the stop link`);
    const links = [...m.html.matchAll(/href="([^"]+)"/g)].map(x => x[1].replace(/&amp;/g, '&')).filter(h => !h.includes('/email/unsubscribe'));
    for (const h of links) { const x = new URL(h); assert.equal(x.origin, 'https://oomba.example'); assert.equal(x.searchParams.get('utm_campaign'), 'class_digest'); }
  }
  const en = renderDigest({ ...u, lang: 'en' }, sum, anaSlot());
  assert.match(en.text, /1 lesson due this week/); assert.match(en.text, /1 answer waiting for review/);
  assert.match(en.text, /1 student hasn't started yet/); assert.match(en.text, /1 live game in the last 7 days/); assert.match(en.text, /50% of the work/);
  assert.match(en.text, /1 class had nothing new/);
  assert.match(en.text, /^Hi Ana,/m);
});

// ---------------------------------------------------------------- sending
const rows = id => q.all('SELECT * FROM digest_sends WHERE user_id=? ORDER BY week', id);
test('sending: one email per teacher per week; a second run, a restart or a second process never sends it again', async () => {
  q.run('DELETE FROM digest_sends');
  const at = anaSlot().at + 5 * 60e3;
  const r1 = await D.runDue(at);
  const toAna = sent.filter(s => s.body.to[0] === 'ana@school.example');
  assert.equal(toAna.length, 1, JSON.stringify(r1));
  const m = toAna[0];
  assert.equal(m.headers['Idempotency-Key'], `digest-${ana.id}-${anaSlot().week}`);
  assert.match(m.body.headers['List-Unsubscribe'], /c=digest/);
  for (const n of NAMES) assert.ok(!m.body.html.includes(n) && !m.body.text.includes(n), `"${n}" was sent`);
  assert.equal(rows(ana.id)[0].status, 'sent'); assert.equal(rows(ana.id)[0].classes, 1);
  assert.ok(!JSON.stringify(rows(ana.id)).includes('Zelda'), 'the row keeps counts only');
  // Again, an hour later, and two runs at once: nothing more.
  await D.runDue(at + H);
  await Promise.all([D.runDue(at + 2 * H), D.runDue(at + 2 * H)]);
  assert.equal(sent.filter(s => s.body.to[0] === 'ana@school.example').length, 1);
  // A restart in the middle of a send: the row is claimed but not marked. After 10 minutes it goes again with the same key.
  q.run("UPDATE digest_sends SET status='sending', claimed_at=? WHERE user_id=?", at, ana.id);
  sent.length = 0;
  await D.runDue(at + 3 * 60e3);
  assert.equal(sent.length, 0, 'not while the first try may still be running');
  await D.runDue(at + 15 * 60e3);
  assert.equal(sent.length, 1); assert.equal(sent[0].headers['Idempotency-Key'], `digest-${ana.id}-${anaSlot().week}`);
  // Next week is a new row.
  sent.length = 0;
  await D.runDue(anaSlot().next + 60e3);
  assert.equal(rows(ana.id).length, 2);
});

test('sending: too late after downtime, the teacher\'s off switch, no address, the admin\'s switch, sending off: no email', async () => {
  q.run('DELETE FROM digest_sends');
  const s = anaSlot();
  await D.runDue(s.at + D.LATE_MS + 60e3);
  assert.equal(rows(ana.id).length, 0, 'more than 12 hours late: skipped quietly');
  D.setSwitch(boss, false);
  await D.runDue(s.at + 60e3);
  assert.equal(rows(ana.id).length, 0); assert.equal(sent.length, 0);
  D.setSwitch(boss, true);
  config.resendApiKey = '';
  await D.runDue(s.at + 60e3);
  assert.equal(rows(ana.id).length, 0, 'sending off: nothing claimed');
  config.resendApiKey = ON.resendApiKey;
  E.setDigestOff(ana.id, true);
  await D.runDue(s.at + 60e3);
  assert.equal(rows(ana.id).length, 0); assert.equal(sent.length, 0);
  E.setDigestOff(ana.id, false);
  // Unsubscribing from the trial emails doesn't stop the weekly summary: its own switch.
  E.setNudgesOff(ana.id, true);
  await D.runDue(s.at + 60e3);
  assert.equal(rows(ana.id)[0].status, 'sent');
  E.setNudgesOff(ana.id, false);
  // A teacher with no address: a skipped row, no email.
  const cy = S.createSchoolAccount(boss, school.id, { rosterName: 'Cy Teacher', role: 'teacher' }).user;
  const cc = S.createClass(cy, school.id, { name: 'Cy Class' }).class; S.addToClass(cy, cc.id, bob.id);
  q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, title, started_at, ended_at, players) VALUES (?,?,?,'class','quiz','Q',?,?,1)", uid(10), cy.id, cc.id, Date.now() - DAY, Date.now() - DAY);
  const cs = D.slotFor(D.prefsOf(cy.id), Date.now());
  await D.runDue(cs.at + 60e3);
  assert.deepEqual([rows(cy.id)[0].status, rows(cy.id)[0].reason], ['skipped', 'no_address']);
});

test('sending: a week with nothing in any class sends nothing; a failure is tried again, then given up', async () => {
  q.run('DELETE FROM digest_sends');
  const s = D.slotFor(D.prefsOf(ben.id), Date.now());
  await D.runDue(s.at + 60e3);
  assert.deepEqual([rows(ben.id)[0].status, rows(ben.id)[0].reason], ['skipped', 'empty']);
  assert.equal(sent.filter(x => x.body.to[0] === 'ben@school.example').length, 0);
  // Ana: Resend fails 3 times (one send), the row waits for the next run and goes then.
  q.run('DELETE FROM digest_sends WHERE user_id=?', ana.id); sent.length = 0;
  replies = [500, 500, 500];
  const a = anaSlot();
  await D.runDue(a.at + 60e3);
  assert.equal(rows(ana.id)[0].status, 'pending');
  await D.runDue(a.at + 20 * 60e3);
  assert.equal(rows(ana.id)[0].status, 'sent');
  assert.equal(new Set(sent.filter(x => x.body.to[0] === 'ana@school.example').map(x => x.headers['Idempotency-Key'])).size, 1, 'one key for every try');
  // After five tries the row gives up (failed), and no later run sends it.
  q.run("UPDATE digest_sends SET status='pending', attempts=4 WHERE user_id=?", ana.id);
  replies = [500, 500, 500];
  await D.runDue(a.at + 40 * 60e3);
  assert.deepEqual([rows(ana.id)[0].status, rows(ana.id)[0].reason], ['failed', 'gave_up']);
  sent.length = 0;
  await D.runDue(a.at + 60 * 60e3);
  assert.equal(sent.length, 0);
});

test('only teachers get it: students, kids and grown-ups never do, even with an address', async () => {
  const kid = auth.createUser({ username: `DgKid${uid(4)}`, password: 'rainbow-77' });
  assert.equal(E.rememberAddress(kid.id, 'kid@example.com'), false);
  assert.equal(E.rememberAddress(zelda.id, 'z@example.com'), false);
  q.run('DELETE FROM digest_sends');
  await D.runDue(anaSlot().at + 60e3);
  const tos = sent.map(s => s.body.to[0]);
  assert.ok(!tos.includes('kid@example.com') && !tos.includes('z@example.com'));
  assert.ok(q.all('SELECT user_id FROM digest_sends').every(r => [ana.id, ben.id].includes(r.user_id) || S.isStaff(auth.getUser(r.user_id))));
});

// ---------------------------------------------------------------- one-click off
test('the email\'s "Stop these summaries" link turns off the weekly summary only (GET asks, POST does it), and can turn it back on', async () => {
  E.setDigestOff(ana.id, false); E.setNudgesOff(ana.id, false);
  const url = new URL(E.unsubscribeUrl(ana.id, 'digest'));
  assert.equal(url.searchParams.get('c'), 'digest');
  const path = url.pathname + url.search;
  const g = await call(null, path);
  assert.equal(g.status, 200); assert.match(g.text, /Stop the weekly class summary\?/);
  assert.equal(E.digestOff(ana.id), false, 'a GET changes nothing');
  const p = await call(null, path, { method: 'POST' });
  assert.equal(p.status, 200); assert.match(p.text, /The weekly summary is off/);
  assert.equal(E.digestOff(ana.id), true); assert.equal(E.nudgesOff(ana.id), false, 'the trial emails are untouched');
  assert.equal(D.prefsOf(ana.id).on, false);
  const back = await call(null, `${path}&again=1`, { method: 'POST' });
  assert.match(back.text, /back on/); assert.equal(E.digestOff(ana.id), false);
  const bad = await call(null, '/email/unsubscribe?t=nope.nope&c=digest');
  assert.equal(bad.status, 400);
});

// ---------------------------------------------------------------- pages and who may open them
test('/teach/summary: the teacher sees their classes with names; other teachers, students, kids, grown-ups and guests do not', async () => {
  const r = await call(ana, '/teach/summary');
  assert.equal(r.status, 200);
  for (const s of ['Room 5 Science', 'Xena Okafor', 'Quiet Art Club', 'Plants and light']) assert.ok(r.text.includes(s), s);
  assert.ok(!r.text.includes('Ben Secret Class'));
  assert.ok(!r.text.includes(ANSWER), 'not even the site page shows answers');
  const b = await call(ben, '/teach/summary');
  assert.equal(b.status, 200);
  assert.ok(!b.text.includes('Room 5 Science') && !b.text.includes('Xena'), "another teacher's classes and students are not there");
  const kid = auth.createUser({ username: `DgKid2${uid(4)}`, password: 'rainbow-77' });
  const grown = auth.createUser({ username: `DgGrown${uid(4)}`, password: PW, accountType: 'grownup' });
  for (const [who, label] of [[zelda, 'student'], [kid, 'kid'], [grown, 'grown-up']]) {
    for (const path of ['/teach/summary', '/teach/summary/email', '/teach/summary/email?format=text']) {
      const x = await call(who, path);
      assert.equal(x.status, 404, `${label} ${path}`);
      assert.ok(!x.text.includes('Xena') && !x.text.includes('Room 5'), `${label} ${path}`);
    }
    const api = await call(who, '/api/me/digest', { method: 'POST', body: { on: '0' } });
    assert.equal(api.status, 404, `${label} api`);
  }
  const guest = await call(null, '/teach/summary');
  assert.equal(guest.status, 302); assert.match(guest.headers.get('location'), /^\/login/);
  assert.equal((await call(null, '/api/me/digest', { method: 'POST', body: { on: '0' } })).status, 401);
});

test('/teach/summary/email: the email as it would go, in the teacher\'s language, with no names', async () => {
  const r = await call(ana, '/teach/summary/email');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /html/);
  assert.ok(r.text.includes('Room 5 Science'));
  for (const n of NAMES) assert.ok(!r.text.includes(n), n);
  const he = await fetch(`${base}/teach/summary/email?lang=he`, { headers: { cookie: cookieFor(ana.id) } });
  assert.match(await he.text(), /dir="rtl"/);
  const t = await call(ana, '/teach/summary/email?format=text');
  assert.match(t.headers.get('content-type'), /text\/plain/); assert.match(t.text, /^Subject: /);
  q.run("UPDATE users SET lang='' WHERE id=?", ana.id);   // ?lang=he was saved to the account
});

test('the Me page: teachers get the weekly summary panel and can change it; /api/me/digest saves it', async () => {
  const me = await call(ana, '/me');
  assert.equal(me.status, 200); assert.match(me.text, /id="digest"/); assert.match(me.text, /digest\.css/);
  const kid = await call(zelda, '/me');
  assert.doesNotMatch(kid.text, /id="digest"/);
  const off = await call(ana, '/api/me/digest', { method: 'POST', body: { on: '0', day: '3', hour: '15', tz: 'Europe/Paris' } });
  assert.equal(off.status, 200, off.text);
  assert.deepEqual([off.json.prefs.on, off.json.prefs.day, off.json.prefs.hour, off.json.prefs.zone], [false, 3, 15, 'Europe/Paris']);
  const on = await call(ana, '/api/me/digest', { method: 'POST', body: { on: ['0', '1'], day: '1', hour: '7', tz: '' } });
  assert.equal(on.json.prefs.on, true); assert.equal(on.json.prefs.zone, 'America/Chicago');
  const bad = await call(ana, '/api/me/digest', { method: 'POST', body: { day: '9' } });
  assert.equal(bad.status, 400); assert.equal(bad.json.error, 'Pick a day.');
  const page = await call(ana, '/teach/summary');
  assert.match(page.text, /goes out every Monday at 7:00/);
  const home = await call(ana, '/teach');
  assert.match(home.text, /href="\/teach\/summary"/);
});

test('/admin/emails: the weekly summary row, its switch, preview and test; admin only', async () => {
  const r = await call(boss, '/admin/emails');
  assert.equal(r.status, 200); assert.match(r.text, /id="e-digest-row"/);
  const pv = await call(boss, '/admin/emails/preview-digest');
  assert.equal(pv.status, 200); assert.match(pv.text, /Room 12 Science/);
  const tx = await call(boss, '/admin/emails/preview-digest?format=text');
  assert.match(tx.text, /^Subject: /);
  const off = await call(boss, '/api/admin/emails/digest', { method: 'POST', body: { on: '0' } });
  assert.equal(off.json.on, false); assert.equal(D.switchOn(), false);
  await call(boss, '/api/admin/emails/digest', { method: 'POST', body: { on: '1' } });
  assert.equal(D.switchOn(), true);
  for (const who of [ana, zelda]) {
    assert.equal((await call(who, '/admin/emails/preview-digest')).status, 404);
    assert.equal((await call(who, '/api/admin/emails/digest', { method: 'POST', body: { on: '0' } })).status, 404);
  }
  assert.equal(D.switchOn(), true);
});

// ---------------------------------------------------------------- review fixes
test('schedule: empty and null day or hour are refused (400) and the saved value stays', async () => {
  assert.ok(D.savePrefs(ana.id, { day: 2, hour: 9 }).ok);
  for (const v of ['', null, ' ', true, '1.0', [], '-1', '07x']) {
    assert.equal(D.savePrefs(ana.id, { day: v }).code, 'badDay', JSON.stringify(v));
    assert.equal(D.savePrefs(ana.id, { hour: v }).code, 'badHour', JSON.stringify(v));
  }
  assert.deepEqual([D.prefsOf(ana.id).day, D.prefsOf(ana.id).hour], [2, 9]);
  for (const body of [{ hour: '' }, { day: null }, { hour: null }, { day: '' }]) {
    const r = await call(ana, '/api/me/digest', { method: 'POST', body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.deepEqual([D.prefsOf(ana.id).day, D.prefsOf(ana.id).hour], [2, 9]);
  assert.ok(D.savePrefs(ana.id, { day: '1', hour: 7 }).ok);
});

test('sending: moving the day after this week\'s summary went out sends no second one that week', async () => {
  q.run('DELETE FROM digest_sends'); sent.length = 0;
  const mon = anaSlot();
  await D.runDue(mon.at + 60e3);
  assert.equal(sent.filter(s => s.body.to[0] === 'ana@school.example').length, 1);
  D.savePrefs(ana.id, { day: 3 });   // Wednesday, two days later
  const wed = D.slotFor(D.prefsOf(ana.id), mon.at + 2 * DAY + 8 * H);
  assert.notEqual(wed.week, mon.week);
  await D.runDue(wed.at + 60e3);
  assert.equal(sent.filter(s => s.body.to[0] === 'ana@school.example').length, 1, 'no second summary this week');
  await D.runDue(wed.next + 60e3);
  assert.equal(sent.filter(s => s.body.to[0] === 'ana@school.example').length, 2, 'the next one goes on the new day');
  D.savePrefs(ana.id, { day: 1 });
});

test('sending: a retry sends the email rendered on the first try, byte for byte, even if the counts changed', async () => {
  q.run('DELETE FROM digest_sends'); sent.length = 0;
  replies = [500, 500, 500];
  const a = anaSlot();
  await D.runDue(a.at + 60e3);
  assert.equal(rows(ana.id)[0].status, 'pending');
  assert.ok(rows(ana.id)[0].message, 'kept while it waits');
  const liveId = uid(10);
  q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, title, started_at, ended_at, players) VALUES (?,?,?,'class','quiz','Second',?,?,2)", liveId, ana.id, room.id, a.at, a.at + 60e3);
  await D.runDue(a.at + 20 * 60e3);
  assert.equal(rows(ana.id)[0].status, 'sent');
  assert.equal(rows(ana.id)[0].message, null, 'cleared once sent');
  const mine = sent.filter(x => x.body.to[0] === 'ana@school.example');
  assert.equal(mine.length, 4);
  assert.equal(new Set(mine.map(x => JSON.stringify([x.headers['Idempotency-Key'], x.body.subject, x.body.html, x.body.text]))).size, 1, 'the same key and the same body');
  q.run('DELETE FROM live_runs WHERE id=?', liveId);
});

test('sending: a row still waiting more than 12 hours after its slot is closed as failed (late)', async () => {
  q.run('DELETE FROM digest_sends'); sent.length = 0;
  const a = anaSlot();
  q.run("INSERT INTO digest_sends(user_id, week, slot_at, status, reason, attempts, claimed_at, message, created_at) VALUES (?,?,?,'pending','retry',1,?,'{}',?)", ana.id, a.week, a.at, a.at, a.at);
  D.setSwitch(boss, false);   // even with sending switched off
  const r = await D.runDue(a.at + D.LATE_MS + 60e3);
  assert.deepEqual([rows(ana.id)[0].status, rows(ana.id)[0].reason, rows(ana.id)[0].message], ['failed', 'late', null]);
  assert.equal(r.failed, 1);
  assert.equal(D.sendCounts(0).status.pending || 0, 0);
  D.setSwitch(boss, true);
  assert.equal(sent.length, 0);
});

test('language: with no language on the account, the preview and the real email both use the one the teacher reads the site in', async () => {
  q.run("UPDATE users SET lang='' WHERE id=?", ana.id);
  q.run("UPDATE email_prefs SET digest_lang='' WHERE user_id=?", ana.id);
  const de = await fetch(`${base}/teach/summary`, { headers: { cookie: cookieFor(ana.id), 'accept-language': 'de-DE,de;q=0.9' } });
  assert.equal(de.status, 200);
  const pv = await fetch(`${base}/teach/summary/email?format=text`, { headers: { cookie: cookieFor(ana.id), 'accept-language': 'de-DE,de;q=0.9' } });
  const subject = (await pv.text()).split('\n')[0].replace(/^Subject: /, '');
  assert.equal(D.mailLocale(auth.getUser(ana.id)), 'de');
  const deSubject = renderDigest({ ...auth.getUser(ana.id) }, D.summaryFor(auth.getUser(ana.id)), anaSlot(), { locale: 'de' }).subject;
  assert.equal(subject, deSubject);
  q.run('DELETE FROM digest_sends'); sent.length = 0;
  await D.runDue(anaSlot().at + 60e3);
  const m = sent.find(s => s.body.to[0] === 'ana@school.example');
  assert.equal(m.body.subject, subject, 'the email is in the same language as the preview');
  // A cross-site link's ?lang= is not remembered.
  await fetch(`${base}/teach/summary?lang=ja`, { headers: { cookie: cookieFor(ana.id), 'sec-fetch-site': 'cross-site' }, redirect: 'manual' });
  assert.equal(D.mailLocale(auth.getUser(ana.id)), 'de');
  q.run("UPDATE users SET lang='' WHERE id=?", ana.id);
  q.run("UPDATE email_prefs SET digest_lang='' WHERE user_id=?", ana.id);
});

test('a class counts as active only from its current students\' work (not a teacher preview or a student who left)', () => {
  const art = L.createLesson(ana, school.id, { title: 'Colour wheel' }).lesson;
  const st = L.addStep(ana, art.id, { kind: 'text', title: 'Look', body: 'Colours.' }).step;
  const acl = L.assign(ana, quiet.id, art.id, {}).classLesson;
  const t0 = Date.now();
  for (const who of [ana.id, bob.id]) q.run("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, started_at, updated_at) VALUES (?,?,?,'done',?,?)", acl.id, st.id, who, t0, t0);
  const c = D.classSummary({ id: quiet.id, name: quiet.name }, t0 + 60e3, 'America/Chicago');
  assert.equal(c.recent, 0); assert.equal(c.active, false);
  q.run('DELETE FROM step_progress WHERE class_lesson_id=?', acl.id);
  L.unassign(ana, acl.id);
});

test('no address: the notice mentions Google only where Google sign-in is set up', async () => {
  const dee = S.createSchoolAccount(boss, school.id, { rosterName: 'Dee Teacher', role: 'teacher' }).user;
  S.createClass(dee, school.id, { name: 'Dee Class' });
  const saved = [config.googleClientId, config.googleClientSecret];
  try {
    config.googleClientId = ''; config.googleClientSecret = '';
    for (const path of ['/me', '/teach/summary']) {
      const r = await call(dee, path);
      assert.ok(!/Connect Google/.test(r.text), path);
      assert.match(r.text, /We don&#39;t have an email address for you yet, so no summary email goes out\.|We don't have an email address for you yet, so no summary email goes out\./, path);
    }
    config.googleClientId = '1234-abc.apps.googleusercontent.com'; config.googleClientSecret = 'x';
    for (const path of ['/me', '/teach/summary']) assert.match((await call(dee, path)).text, /Connect Google/, path);
  } finally { [config.googleClientId, config.googleClientSecret] = saved; }
});
