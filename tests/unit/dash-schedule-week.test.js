// The schedule widget's standard week, uploaded or pasted agendas and a connected calendar (public/js/agenda.js,
// services/dash-calendar.js, services/dash.js; docs/decisions.md "Schedule: a standard week, uploaded agendas, a
// connected calendar"). Agendas are read the same way in the browser and on the server; a weekday's own list replaces
// every day's; a connected calendar's address stays on the server (never in a widget's settings, the pins or a live
// answer), only the class's own teacher connects one, and today's events reach the screens that show the widget.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashsched-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const DM = await import('../../server/services/dash-media.js');
const DC = await import('../../server/services/dash-calendar.js');
const AG = await import('../../public/js/agenda.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { DC._setFeedFetch(null); server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const POST = (body = {}) => ({ method: 'POST', body });
const pageData = html => JSON.parse(/<script[^>]*id="page-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1].replace(/\\u003c/g, '<'));

const boss = createUser({ username: 'SchedBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Sched Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const A = S.createClass(T, oak.id, { name: '5A' }).class, B = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), a3 = kid('Ali Aspen', A), b1 = kid('Bea Bloom', B);
  const stranger = createUser({ username: `SchedStr${k}`, password: 'secret123' });
  return { oak, T, T2, A, B, a1, a2, a3, b1, stranger, REAL: /Ada Apple|Abe Acorn|Ali Aspen|Bea Bloom|Tia Teacher/ };
}
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}

const ICS = (extra = '') => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Room 5A\r\nBEGIN:VEVENT\r\nUID:r1\r\nSUMMARY:Reading\r\nDTSTART;TZID=America/New_York:20200106T090000\r\nDTEND;TZID=America/New_York:20200106T094500\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\n${extra}END:VCALENDAR\r\n`;
const SECRET = 'https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-0123456789abcdef/basic.ics';

test('typed and pasted agendas: one line a period, CSV, am/pm, weekday headings', () => {
  const r = AG.readText('Morning meeting 8:30-8:45\n8:45 – 10:00 Reading\n10:00 Recess\n10:20 Math\n11:30-1:00 Lunch\nArt, 1:00 PM, 1:45 PM\n3 groups today\n\nMonday:\n9:00-9:30 Assembly\nFRI\n8:30am Spelling\n9:00 Music');
  assert.deepEqual(r.all, [
    { name: 'Morning meeting', start: '08:30', end: '08:45' }, { name: 'Reading', start: '08:45', end: '10:00' },
    { name: 'Recess', start: '10:00', end: '10:20' }, { name: 'Math', start: '10:20', end: '11:30' },
    { name: 'Lunch', start: '11:30', end: '13:00' }, { name: 'Art', start: '13:00', end: '13:45' }]);
  assert.deepEqual(r.days[1], [{ name: 'Assembly', start: '09:00', end: '09:30' }]);
  assert.deepEqual(r.days[5], [{ name: 'Spelling', start: '08:30', end: '09:00' }, { name: 'Music', start: '09:00', end: '09:45' }]);
  // Weekday names in the teacher's language too.
  assert.deepEqual(AG.readText('lundi\n8:30 Lecture', ['fr']).days[1], [{ name: 'Lecture', start: '08:30', end: '09:15' }]);
  assert.deepEqual(AG.readText('nothing here\n42 cats'), { all: [], days: {} });
  // At most 16 periods, names cut to 40 characters.
  const many = AG.readText(Array.from({ length: 30 }, (_, i) => `${7 + Math.floor(i / 4)}:${String((i % 4) * 15).padStart(2, '0')} ${'x'.repeat(60)}`).join('\n'));
  assert.equal(many.all.length, 16); assert.equal(many.all[0].name.length, 40);
});

test('calendar files: time zones, repeats, skipped and moved days, all-day events left out', () => {
  const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a
SUMMARY:Reading
DTSTART;TZID=America/New_York:20261102T090000
DTEND;TZID=America/New_York:20261102T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
EXDATE;TZID=America/New_York:20261120T090000
END:VEVENT
BEGIN:VEVENT
UID:b
SUMMARY:Staff call
DTSTART:20261118T200000Z
DURATION:PT30M
END:VEVENT
BEGIN:VEVENT
UID:a
RECURRENCE-ID;TZID=America/New_York:20261123T090000
SUMMARY:Reading (moved)
DTSTART;TZID=America/New_York:20261123T100000
DTEND;TZID=America/New_York:20261123T104500
END:VEVENT
BEGIN:VEVENT
UID:c
SUMMARY:Holiday
DTSTART;VALUE=DATE:20261118
END:VEVENT
BEGIN:VEVENT
UID:d
SUMMARY:Ma
 th
DTSTART;TZID=Eastern Standard Time:20261101T110000
DTEND;TZID=Eastern Standard Time:20261101T115000
RRULE:FREQ=DAILY;COUNT=20
END:VEVENT
BEGIN:VEVENT
UID:e
SUMMARY:Cancelled
STATUS:CANCELLED
DTSTART;TZID=America/New_York:20261118T130000
DTEND;TZID=America/New_York:20261118T140000
END:VEVENT
END:VCALENDAR`;
  const ev = AG.readIcs(ics), day = d => AG.icsDay(ev, d, 'America/New_York');
  assert.deepEqual(day('2026-11-18'), [{ name: 'Reading', start: '09:00', end: '09:45' }, { name: 'Math', start: '11:00', end: '11:50' }, { name: 'Staff call', start: '15:00', end: '15:30' }]);
  assert.deepEqual(day('2026-11-20'), [{ name: 'Math', start: '11:00', end: '11:50' }], 'a skipped day (EXDATE)');
  assert.deepEqual(day('2026-11-21'), [], 'after COUNT, and not a Reading day');
  assert.deepEqual(day('2026-11-23'), [{ name: 'Reading (moved)', start: '10:00', end: '10:45' }], 'one time moved (RECURRENCE-ID)');
  // The same calendar in another zone: the school's clock.
  assert.deepEqual(AG.icsDay(ev, '2026-11-18', 'Europe/London')[0], { name: 'Reading', start: '14:00', end: '14:45' });
  // The week ahead from a file: the days with events.
  const wk = AG.icsWeek(ics, '2026-11-18', 'America/New_York');
  assert.deepEqual(Object.keys(wk.days).map(Number).sort(), [1, 3, 4, 5]);
  assert.equal(AG.weekdayOf('2026-11-18'), 3);
  // Which list the widget shows.
  const s = { periods: [{ name: 'Every', start: '08:00', end: '09:00' }], week: { 3: [{ name: 'Wed', start: '08:00', end: '09:00' }] } };
  assert.equal(AG.periodsFor(s, 3)[0].name, 'Wed'); assert.equal(AG.periodsFor(s, 2)[0].name, 'Every');
});

test('a standard week is kept per weekday; a calendar setting keeps only an id and a name', () => {
  const type = D.widgetType('schedule');
  const out = D.cleanSettings(type, { periods: [{ name: 'A', start: '08:00', end: '09:00' }],
    week: { 1: [{ name: 'Mon', start: '08:00', end: '09:00' }, { name: 'bad', start: '10:00', end: '09:00' }], 3: [], 9: [{ name: 'x', start: '08:00', end: '09:00' }], x: 1 },
    cal: { id: 'abcdefgh1234', name: 'Room 5A', url: SECRET } });
  assert.deepEqual(out.week, { 1: [{ name: 'Mon', start: '08:00', end: '09:00' }] });
  assert.deepEqual(out.cal, { id: 'abcdefgh1234', name: 'Room 5A' });
  assert.equal(D.cleanSettings(type, { cal: { id: '../x' } }).cal, null);
  assert.deepEqual(D.cleanSettings(type, {}).week, {});
  assert.equal(DC.feedAddress('webcal://p01-calendars.icloud.com/published/2/abc', D.cleanUrl), 'https://p01-calendars.icloud.com/published/2/abc');
  for (const bad of ['http://example.org/a.ics', 'https://localhost/a.ics', 'https://10.0.0.1/a.ics', 'javascript:alert(1)', 'file:///etc/passwd']) assert.equal(DC.feedAddress(bad, D.cleanUrl), null, bad);
  assert.equal(DM.privateAddress('169.254.169.254'), true);
});

test('connecting a calendar: the class teacher only, the address never leaves the server, today reaches the screens', async () => {
  const w = world();
  const asked = [];
  DC._setFeedFetch(async url => { asked.push(url); if (url.includes('page')) return '<html>a web page</html>'; if (url.includes('down')) throw new Error('down'); return ICS(); });
  const conn = (who, url, c = w.A) => as(who)(`/api/dash/${c.id}/feeds`, POST({ url }));
  for (const who of [w.a1, w.T2, w.stranger]) assert.notEqual((await conn(who, SECRET)).status, 200);
  let r = await conn(w.T, 'not a link'); assert.equal(r.status, 400); assert.match(r.json.error, /calendar address/);
  r = await conn(w.T, 'https://example.org/page'); assert.equal(r.status, 400); assert.match(r.json.error, /iCal/);
  r = await conn(w.T, 'https://example.org/down.ics'); assert.equal(r.status, 400); assert.match(r.json.error, /couldn.t reach/);
  r = await conn(w.T, SECRET.replace('https:', 'webcal:'));
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.feed, { id: r.json.feed.id, name: 'Room 5A' });
  assert.equal(asked.at(-1), SECRET, 'webcal:// fetched as https://');
  assert.ok(!r.text.includes('private-0123456789abcdef'));
  const feed = r.json.feed;
  // On a pinned schedule: students get today's events, never the address.
  await layout(w, [{ id: 'sc', type: 'schedule', s: { view: 'list', periods: [{ name: 'Typed', start: '08:00', end: '08:30' }], cal: feed }, pin: true }]);
  const tl = (await as(w.T)(`/api/dash/${w.A.id}/live`)).json, sl = (await as(w.a1)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(tl.agenda.sc.periods.map(p => p.name), ['Reading']);
  assert.deepEqual(sl.agenda, tl.agenda);
  for (const p of [`/api/dash/${w.A.id}/live`, `/api/dash/${w.A.id}/pins`, `/class/${w.A.id}/dashboard`]) {
    for (const who of [w.T, w.a1]) assert.ok(!(await as(who)(p)).text.includes('private-0123456789abcdef'), `${p} leaks the address`);
  }
  // Another class's widget pointing at this calendar reads nothing.
  const other = D.liveState(w.B, w.T2, 'teacher');
  assert.deepEqual(other.agenda, {});
  assert.deepEqual(DC.feedDay(w.B, feed, '2026-11-18', 'UTC', D.cleanUrl), { resting: true });
  // Disconnect: another teacher can't; the class teacher can, and then the widget falls back to its typed schedule.
  assert.equal((await as(w.T2)(`/api/dash/${w.A.id}/feeds/${feed.id}/delete`, POST())).status, 404);
  assert.equal((await as(w.T)(`/api/dash/${w.A.id}/feeds/${feed.id}/delete`, POST())).status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_feeds WHERE id=?', feed.id).n, 0);
  assert.deepEqual((await as(w.T)(`/api/dash/${w.A.id}/live`)).json.agenda.sc, { resting: true });
  // A teacher's account going takes their calendars with it.
  const again = (await conn(w.T, SECRET)).json.feed;
  D.forgetUser(w.T.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_feeds WHERE id=?', again.id).n, 0);
});

test('every new schedule string is in every locale, with no prices or "Pro"', () => {
  const words = D.widgetType('schedule').words;
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|pricing|\bPro\b|price|buy now/i;
  for (const code of ['en', 'de', 'es', 'fr', 'it', 'nl', 'pt', 'ru', 'ja', 'zh-Hant', 'he', 'ar']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash;
    for (const k of words) assert.ok(l.w.schedule[k], `${code} dash.w.schedule.${k}`);
    for (const k of ['week', 'cal']) assert.ok(l.w.schedule.s[k], `${code} s.${k}`);
    for (const k of ['feedAddress', 'feedTooMany', 'feedNotCalendar', 'feedUnreachable']) assert.ok(l.errors[k], `${code} errors.${k}`);
    assert.doesNotMatch(JSON.stringify(l.w.schedule), money, code);
  }
});
