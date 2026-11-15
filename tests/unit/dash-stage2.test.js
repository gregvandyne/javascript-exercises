// Classroom dashboards, stage 2 (services/dash.js, routes/dash.js, public/js/dash-widgets.js, public/js/dash-noise.js):
// the everyday widgets. The registry and the server-side cleaning of each widget's settings, who may call each new
// address, timers that agree on every screen (server time), the weather (cached, failures "resting", never the
// browser's location), QR codes only for allowed targets, the picker (Oomba names only, never real names), help queue
// and quick check privacy (a student sees only their own; the projector only totals), the noise meter's code (no
// network, no recording), and the safety rules (no prices, no free text between students, no AI).
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dash2-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const games = await import('../../server/services/games.js');
const D = await import('../../server/services/dash.js');
const W = await import('../../public/js/dash-widgets.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { D._setWeatherFetch(null); server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body, headers: extra = {} } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...extra };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
const POST = (body = {}) => ({ method: 'POST', body });

const boss = createUser({ username: 'Dash2Boss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `Dash2 Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const T2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Other', role: 'teacher' }).user.id);
  const SA = createUser({ username: `Dash2SA${k}`, password: 'secret123' }); S.addMember(boss, oak.id, SA.id, 'admin');
  const A = S.createClass(T, oak.id, { name: '5A' }).class, B = S.createClass(T2, oak.id, { name: '5B' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; if (c) S.addToClass(boss, c.id, u.id); return getUser(u.id); };
  const a1 = kid('Ada Apple', A), a2 = kid('Abe Acorn', A), a3 = kid('Ali Aspen', A), b1 = kid('Bea Bloom', B);
  const stranger = createUser({ username: `Dash2Str${k}`, password: 'secret123' });
  return { oak, T, T2, SA, A, B, a1, a2, a3, b1, stranger, REAL: /Ada Apple|Abe Acorn|Ali Aspen|Bea Bloom|Tia Teacher/ };
}
/** The teacher's first layout with these widgets (and the class following it). */
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
function publicGame(owner, title = 'Fraction Face-off', visibility = 'public') {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>F</title><canvas></canvas>');
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id || v, g.id);
  return games.getGame(g.id);
}
function openLesson(w, title = 'Comparing fractions') {
  const lesson = L.createLesson(w.T, w.oak.id, { title }).lesson;
  L.assign(w.T, w.A.id, lesson.id);
  return L.classLessons(w.A.id).find(x => x.lesson_id === lesson.id || x.title === title);
}

test('migration 0079 is the newest and its tables and columns exist', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.at(-1), '0079_dash_everyday');
  assert.equal(names.filter(n => n.startsWith('0079')).length, 1);
  for (const tb of ['dash_help', 'dash_checks', 'dash_answers']) assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
  const cols = q.all('PRAGMA table_info(dash_class)').map(c => c.name);
  assert.ok(cols.includes('timers') && cols.includes('picker'));
});

test('the registry: every stage 2 type has a renderer and English words; who may add and pin each', () => {
  const t = tFor('en');
  const ids = ['timer', 'stopwatch', 'schedule', 'weather', 'qr', 'picker', 'noise', 'help', 'check', 'tiles'];
  for (const id of ids) assert.ok(D.widgetType(id), id);
  for (const id of ids) assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`);
  for (const role of ['teacher', 'student']) {
    for (const x of D.registryFor(t, role).types) {
      assert.ok(!/^dash\./.test(x.name) && !/^dash\./.test(x.desc), x.id);
      for (const [k, v] of Object.entries(x.words)) assert.ok(!/^dash\./.test(v), `${x.id}.${k}`);
      for (const s of x.settings) { assert.ok(!/^dash\./.test(s.label), `${x.id}.${s.key}`); for (const o of Object.values(s.labels || {})) assert.ok(!/^dash\./.test(o)); }
    }
  }
  // Students may add only things that stay on their own screen.
  assert.deepEqual(D.WIDGETS.filter(x => D.canAdd(x, 'student')).map(x => x.id), ['clock', 'ican', 'timer', 'stopwatch', 'dice', 'random']);
  // Never pinned to student screens: the picker, the noise meter, QR, the quick check widget.
  assert.deepEqual(D.WIDGETS.filter(x => !D.canPin(x)).map(x => x.id).sort(), ['check', 'dice', 'groups', 'noise', 'picker', 'qr', 'random']);
  const tw = D.cleanWidgets(['picker', 'noise', 'qr', 'check', 'help', 'timer'].map((type, i) => ({ id: `w${i}`, type, pin: true })), 'teacher');
  assert.deepEqual(tw.filter(x => x.pin).map(x => x.type), ['help', 'timer']);
  assert.equal(D.registryFor(t, 'teacher').types.find(x => x.id === 'help').pinDef, true, 'the help queue is pinned when added');
  // A student can't add teacher-only types (picker, noise, help, check...).
  assert.deepEqual(D.cleanWidgets(ids.map((type, i) => ({ id: `s${i}`, type })), 'student').map(x => x.type), ['timer', 'stopwatch']);
});

test('settings are rebuilt on the server for every new type', () => {
  const c = (type, s) => D.cleanSettings(D.widgetType(type), s);
  // timer: whole minutes 1-180; bools
  assert.deepEqual(c('timer', { minutes: '999', chime: 'true', bar: 0, evil: 1 }), { minutes: 180, view: 'digits', chime: true, bar: false });
  assert.equal(c('timer', { minutes: -4 }).minutes, 1); assert.equal(c('timer', { minutes: 'x' }).minutes, 5); assert.equal(c('timer', {}).minutes, 5);
  // clock: a real time zone or nothing
  assert.equal(c('clock', { zone2: 'Europe/London' }).zone2, 'Europe/London');
  for (const bad of ['Mars/Olympus', '<script>', 'UTC; DROP', 42]) assert.equal(c('clock', { zone2: bad }).zone2, '', String(bad));
  // schedule: HH:MM, end after start, sorted, names clipped, at most 16
  const per = c('schedule', { periods: [{ name: 'Math‮', start: '10:00', end: '10:45' }, { name: 'Reading', start: '08:30', end: '09:15' }, { name: 'Bad', start: '9:00', end: '10:00' },
    { name: 'Backwards', start: '12:00', end: '11:00' }, { name: 'Late', start: '24:00', end: '24:30' }, 'x', null, { name: 'N'.repeat(90), start: '13:00', end: '13:30' }] }).periods;
  assert.deepEqual(per.map(p => p.start), ['08:30', '10:00', '13:00']);
  assert.equal(per[1].name, 'Math'); assert.equal(per[2].name.length, 40);
  assert.equal(c('schedule', { periods: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, start: '08:00', end: '09:00' })) }).periods.length, D.MAX_PERIODS);
  // weather: a name and real coordinates (rounded to 2 decimals), else nothing
  assert.deepEqual(c('weather', { place: { name: 'Boston, Massachusetts', lat: 42.35843, lon: -71.05977, extra: 'x' }, unit: 'k' }), { place: { name: 'Boston, Massachusetts', lat: 42.36, lon: -71.06 }, unit: 'auto' });
  for (const bad of [{ name: 'X', lat: 91, lon: 0 }, { name: 'X', lat: 0, lon: 181 }, { name: '', lat: 1, lon: 1 }, { name: 'X', lat: 'a', lon: 1 }, 'Boston']) assert.equal(c('weather', { place: bad }).place, null);
  // QR: only the four kinds; ids only; live never carries a ref
  assert.deepEqual(c('qr', { target: { kind: 'link', ref: 'abc123' } }).target, { kind: 'link', ref: 'abc123' });
  assert.deepEqual(c('qr', { target: { kind: 'live', ref: 'javascript:x' } }).target, { kind: 'live', ref: '' });
  for (const bad of [{ kind: 'url', ref: 'https://evil.example' }, { kind: 'link', ref: 'https://evil.example' }, { kind: 'game', ref: '' }, 'https://x.org']) assert.equal(c('qr', { target: bad }).target, null);
  // tiles: games and lessons, no repeats, at most 12
  assert.deepEqual(c('tiles', { tiles: [{ kind: 'game', ref: 'g1' }, { kind: 'game', ref: 'g1' }, { kind: 'lesson', ref: 'l1' }, { kind: 'url', ref: 'x' }, { kind: 'game', ref: 'bad id' }] }).tiles,
    [{ kind: 'game', ref: 'g1' }, { kind: 'lesson', ref: 'l1' }]);
  assert.equal(c('tiles', { tiles: Array.from({ length: 20 }, (_, i) => ({ kind: 'game', ref: `g${i}` })) }).tiles.length, D.MAX_TILES);
  // noise, picker: options and bools only
  assert.deepEqual(c('noise', { zone: 'rock concert' }), { zone: 'talk' });
  assert.equal(c('picker', { norepeat: 'no' }).norepeat, false);
});

test('access: every new address checks the class role (404 to others), needs sign-in, and refuses cross-site writes', async () => {
  const w = world();
  await layout(w, [{ id: 't1', type: 'timer', pin: true }, { id: 'h1', type: 'help', pin: true }]);
  const ch = D.createCheck(w.T, w.A, { kind: 'thumbs' }).check;
  const A = w.A.id;
  const teacherOnly = [
    ['POST', `/api/dash/${A}/timers/t1`, { action: 'start' }], ['GET', `/api/dash/${A}/picker`], ['POST', `/api/dash/${A}/picker`, { action: 'pick' }],
    ['POST', `/api/dash/${A}/help/queue`, { action: 'clear' }], ['POST', `/api/dash/${A}/checks`, { kind: 'thumbs' }], ['GET', `/api/dash/${A}/checks/saved`],
    ['GET', `/api/dash/${A}/checks/${ch}/names`], ['POST', `/api/dash/${A}/checks/${ch}/end`, {}], ['POST', `/api/dash/${A}/checks/${ch}/save`, {}],
    ['GET', `/api/dash/${A}/places?q=Boston`], ['GET', `/api/dash/${A}/qr?kind=live`],
  ];
  const studentOnly = [['POST', `/api/dash/${A}/help`, { kind: 'help' }], ['POST', `/api/dash/${A}/checks/${ch}/answer`, { value: 0 }]];
  const both = [['GET', `/api/dash/${A}/tiles?refs=game:x`]];
  const call = (who, [m, p, b]) => as(who)(p, m === 'POST' ? POST(b) : {});
  for (const who of [w.a1, w.T2, w.SA, w.b1, w.stranger]) for (const r of teacherOnly) assert.equal((await call(who, r)).status, 404, `${who.username} ${r[1]}`);
  for (const who of [w.T, w.T2, w.SA, w.b1, w.stranger]) for (const r of studentOnly) assert.equal((await call(who, r)).status, 404, `${who.username} ${r[1]}`);
  for (const who of [w.T2, w.SA, w.b1, w.stranger]) for (const r of both) assert.equal((await call(who, r)).status, 404, `${who.username} ${r[1]}`);
  for (const r of [...teacherOnly, ...studentOnly, ...both]) assert.equal((await call(null, r)).status, 401, r[1]);
  // A cross-site write never reaches the route.
  for (const [who, p, b] of [[w.T, `/api/dash/${A}/timers/t1`, { action: 'start' }], [w.a1, `/api/dash/${A}/help`, { kind: 'help' }], [w.a1, `/api/dash/${A}/checks/${ch}/answer`, { value: 0 }], [w.T, `/api/dash/${A}/checks`, { kind: 'fist' }]]) {
    const r = await as(who)(p, { ...POST(b), headers: { 'sec-fetch-site': 'cross-site' } });
    assert.equal(r.status, 403, p);
  }
  assert.equal(JSON.parse(D.classState(A).timers || '{}').t1, undefined, 'the cross-site start did nothing');
  assert.equal(D.helpQueue(w.A).length, 0);
  // Rate limits are on every new write (the same helper as stage 1).
  const src = fs.readFileSync('server/routes/dash.js', 'utf8');
  for (const m of src.matchAll(/router\.(get|post)\('(\/api\/dash\/:id\/(?:timers|picker|help|checks|places|qr|tiles)[^']*)', requireUser, ([^,]+),/g)) assert.match(m[3], /rateLimit\(/, m[2]);
});

test('timers: a start time and a duration on the server; every screen works out the same time left', async () => {
  const w = world(); const T = as(w.T);
  await layout(w, [{ id: 'tpin', type: 'timer', s: { minutes: 10 }, pin: true }, { id: 'tmine', type: 'timer' }, { id: 'sw', type: 'stopwatch', pin: true }]);
  let r = await T(`/api/dash/${w.A.id}/timers/tpin`, POST({ action: 'set', ms: 5 * 60e3 }));
  assert.equal(r.status, 200); assert.deepEqual([r.json.timer.dur, r.json.timer.on], [300000, false]);
  r = await T(`/api/dash/${w.A.id}/timers/tpin`, POST({ action: 'start' }));
  const st = r.json.timer;
  assert.equal(st.on, true); assert.ok(Math.abs(st.start - Date.now()) < 2000); assert.equal(typeof st.start, 'number');
  assert.deepEqual(Object.keys(st).sort(), ['base', 'dur', 'mode', 'on', 'start'], 'a start time and a duration, never a ticking value');
  // A student's screen gets the pinned timer (not the teacher's unpinned one) and the server's clock.
  await T(`/api/dash/${w.A.id}/timers/tmine`, POST({ action: 'start' }));
  const live = (await as(w.a1)(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(Object.keys(live.timers), ['tpin']);
  assert.ok(Math.abs(live.now - Date.now()) < 2000);
  // Two screens with wrong clocks (one 90 s fast, one 45 s slow) each read the server's clock from /live and agree.
  // Each screen times one /live round trip (the server answered half-way), then shows the timer a little later.
  const serverAt = live.now, later = serverAt + 2500;
  const screen = (offset, rtt) => {
    const sent = serverAt - rtt / 2 + offset, got = serverAt + rtt / 2 + offset;
    const skew = W.skewOf(serverAt, sent, got);
    return W.timerView(live.timers.tpin, later + offset + skew).left;   // this screen's own clock, corrected
  };
  const truth = D.timerView(st, later).left;
  for (const [offset, rtt] of [[90e3, 40], [-45e3, 300], [0, 10]]) assert.equal(screen(offset, rtt), truth, `a clock ${offset / 1000} s off`);
  assert.ok(truth <= 300000 && truth > 290000);
  // Pause keeps what was left; start again goes on from there; reset goes back to the full time.
  await new Promise(res => setTimeout(res, 30));
  const paused = (await T(`/api/dash/${w.A.id}/timers/tpin`, POST({ action: 'pause' }))).json.timer;
  assert.equal(paused.on, false); assert.ok(paused.base >= 30);
  const left = D.timerView(paused, Date.now() + 60e3).left;
  assert.equal(left, 300000 - paused.base, 'a paused timer does not move');
  const reset = (await T(`/api/dash/${w.A.id}/timers/tpin`, POST({ action: 'reset' }))).json.timer;
  assert.deepEqual([reset.base, reset.on, reset.dur], [0, false, 300000]);
  // A countdown that ran out says done; a stopwatch counts up.
  assert.deepEqual(D.timerView({ mode: 'down', dur: 1000, base: 0, start: 0, on: true }, 5000), { elapsed: 1000, left: 0, done: true });
  await T(`/api/dash/${w.A.id}/timers/sw`, POST({ action: 'start' }));
  const sw = JSON.parse(D.classState(w.A.id).timers).sw;
  assert.equal(sw.mode, 'up'); assert.equal(D.timerView(sw, sw.start + 65e3).elapsed, 65e3);
  assert.equal(W.mmss(65e3, true), '1:05'); assert.equal(W.mmss(299001), '5:00'); assert.equal(W.mmss(3725e3), '1:02:05');
  // Bad input and other people's widgets.
  for (const b of [{ action: 'set', ms: 10 }, { action: 'set', ms: 99 * 3600e3 }, { action: 'explode' }]) assert.equal((await T(`/api/dash/${w.A.id}/timers/tpin`, POST(b))).status, 400, JSON.stringify(b));
  assert.equal((await T(`/api/dash/${w.A.id}/timers/sw`, POST({ action: 'set', ms: 60e3 }))).status, 400, 'a stopwatch has no duration');
  assert.equal((await T(`/api/dash/${w.A.id}/timers/nope`, POST({ action: 'start' }))).status, 404);
  await as(w.T2)(`/class/${w.B.id}/dashboard`);
  assert.equal((await as(w.T2)(`/api/dash/${w.B.id}/timers/tpin`, POST({ action: 'start' }))).status, 404, 'another class\'s teacher cannot reach this timer');
});

test('schedule helpers: the period now, the next one, minutes left (in the school\'s time zone)', () => {
  const periods = [{ name: 'Reading', start: '08:30', end: '09:15' }, { name: 'Math', start: '09:15', end: '10:00' }, { name: 'Art', start: '13:00', end: '13:45' }];
  assert.deepEqual(W.periodAt(periods, 8 * 60), { cur: -1, next: 0, left: 0 });
  assert.deepEqual(W.periodAt(periods, 9 * 60 + 30), { cur: 1, next: 2, left: 30 });
  assert.deepEqual(W.periodAt(periods, 11 * 60), { cur: -1, next: 2, left: 0 });
  assert.deepEqual(W.periodAt(periods, 14 * 60), { cur: -1, next: -1, left: 0 });
  const noonUtc = new Date(Date.UTC(2026, 0, 15, 17, 30));   // 12:30 in New York (winter)
  assert.equal(W.minutesIn('America/New_York', noonUtc), 12 * 60 + 30);
  assert.equal(W.minutesIn('Asia/Tokyo', noonUtc), 2 * 60 + 30);
});

test('weather: fetched on the server, cached per place, failures and slow answers are "resting", never anyone\'s location', async () => {
  const calls = [];
  let mode = 'ok';
  const reply = body => ({ ok: true, status: 200, json: async () => body });
  D._setWeatherFetch(async url => {
    calls.push(String(url));
    if (mode === 'fail') return { ok: false, status: 502, json: async () => ({}) };
    if (mode === 'hang') return new Promise(() => {});
    if (String(url).includes('geocoding-api.open-meteo.com')) return reply({ results: [{ name: 'Springfield', admin1: 'Illinois', country: 'United States', latitude: 39.80172, longitude: -89.64371 }] });
    return reply({ current: { temperature_2m: 11.4, weather_code: 63, is_day: 1 }, daily: { temperature_2m_max: [14.2], temperature_2m_min: [6.1] } });
  }, 80);
  const place = { name: 'Springfield, Illinois', lat: 39.8, lon: -89.64 };
  assert.deepEqual(D.weatherFor(place), { loading: true }, 'the first look starts a fetch and does not wait');
  await new Promise(r => setTimeout(r, 10));
  const d = D.weatherFor(place);
  assert.equal(d.t, 11.4); assert.equal(d.hi, 14.2); assert.equal(d.lo, 6.1); assert.equal(d.group, 'rain');
  assert.equal(calls.length, 1); assert.match(calls[0], /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=39\.8&longitude=-89\.64&/);
  for (let i = 0; i < 5; i++) D.weatherFor(place);
  assert.equal(calls.length, 1, 'cached: no new fetch within WEATHER_MS');
  assert.ok(D.WEATHER_MS >= 15 * 60e3 && D.WEATHER_MS <= 30 * 60e3);
  // After the cache time, a refresh; a failed refresh keeps a recent forecast.
  mode = 'fail';
  const later = Date.now() + D.WEATHER_MS + 1000;
  D.weatherFor(place, later); await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.length, 2); assert.equal(D.weatherFor(place, later).t, 11.4, 'a short outage keeps the last forecast');
  // A place never fetched before: failure -> resting; a hang -> resting after the timeout.
  const other = { name: 'Elsewhere', lat: 10, lon: 10 };
  D.weatherFor(other); await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(D.weatherFor(other), { resting: true });
  mode = 'hang';
  const slow = { name: 'Slow town', lat: 20, lon: 20 };
  assert.deepEqual(D.weatherFor(slow), { loading: true });
  await new Promise(r => setTimeout(r, 250));
  assert.deepEqual(D.weatherFor(slow), { resting: true }, 'a slow answer is resting, not an error');
  // Words and units the widget shows.
  assert.equal(D.weatherGroup(0, true), 'clear'); assert.equal(D.weatherGroup(0, false), 'clearNight'); assert.equal(D.weatherGroup(95), 'storm'); assert.equal(D.weatherGroup(73), 'snow');
  assert.equal(W.temp(10, 'f'), '50°'); assert.equal(W.temp(10, 'c'), '10°'); assert.equal(W.unitOf({ unit: 'auto' }, 'en-US'), 'f'); assert.equal(W.unitOf({ unit: 'auto' }, 'en-GB'), 'c');
  assert.equal(tFor('en')('dash.w.weather.resting'), 'Weather is resting');
  assert.match(tFor('en')('dash.w.weather.rain'), /coat/);

  // Through the app: the teacher looks a city up on the server; the pinned widget's weather reaches students in /live.
  mode = 'ok';
  const w = world();
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const found = await as(w.T)(`/api/dash/${w.A.id}/places?q=${encodeURIComponent('Springfield')}`);
  assert.equal(found.status, 200);
  assert.deepEqual(found.json.places, [{ name: 'Springfield, Illinois, United States', lat: 39.8, lon: -89.64 }]);
  assert.match(calls.at(-1), /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?name=Springfield&count=6&language=en&format=json$/);
  for (const u of calls) assert.doesNotMatch(u, new RegExp(`${w.T.id}|${w.T.username}|${w.A.id}|Oak`), 'nothing about the class or teacher leaves');
  await layout(w, [{ id: 'wx', type: 'weather', s: { place: found.json.places[0], unit: 'c' }, pin: true }]);
  await as(w.a1)(`/api/dash/${w.A.id}/live`);
  await new Promise(r => setTimeout(r, 10));
  const live = (await as(w.a1)(`/api/dash/${w.A.id}/live`)).json;
  assert.equal(live.weather['39.80,-89.64'].t, 11.4);
  mode = 'fail';
  const resting = await as(w.T)(`/api/dash/${w.A.id}/places?q=Nowhere`);
  assert.equal(resting.status, 503); assert.match(resting.json.error, /Weather is resting/);
  // The browser never asks for anyone's location.
  for (const f of ['public/js/dash.js', 'public/js/dash-widgets.js']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /geolocation|getCurrentPosition|watchPosition/, f);
  D._setWeatherFetch(null);
});

test('QR codes: only the class\'s approved links and Oomba pages; removed or foreign targets refuse', async () => {
  const w = world(); const T = as(w.T);
  await T(`/class/${w.A.id}/dashboard`);
  const link = D.addLink(w.T, w.A, { url: 'https://library.example.org/kids/reading-corner', title: 'School library' }).link;
  const other = D.addLink(w.T2, w.B, { url: 'https://other.example.org' }).link;
  const r = await T(`/api/dash/${w.A.id}/qr?kind=link&ref=${link.id}`);
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/); assert.match(r.json.svg, /aria-label="QR code to scan"/);
  assert.equal(r.json.text, 'library.example.org/kids/reading-corner'); assert.equal(r.json.title, 'School library');
  // The code holds the class's own link address (a removed link stops working), not the raw outside address.
  const target = D.qrTarget(w.A, { kind: 'link', ref: link.id }, 'https://oomba.example');
  assert.equal(target.url, `https://oomba.example/class/${w.A.id}/dashboard/link/${link.id}`);
  assert.ok(Buffer.byteLength(target.url) <= 106, 'fits the QR maker');
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=link&ref=${other.id}`)).status, 404, 'another class\'s link');
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=url&ref=${encodeURIComponent('https://evil.example')}`)).status, 404, 'any other address');
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=live`)).status, 404, 'no live game open');
  D.removeLink(w.T, w.A, link.id);
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=link&ref=${link.id}`)).status, 404, 'a removed link');
  // Oomba pages: a game every student can open, an open lesson of the class.
  const g = publicGame(w.T);
  const gq = await T(`/api/dash/${w.A.id}/qr?kind=game&ref=${g.id}`);
  assert.equal(gq.status, 200); assert.match(gq.json.text, new RegExp(`/play/${g.slug}$`));
  const priv = publicGame(w.T, 'Secret', 'private');
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=game&ref=${priv.id}`)).status, 404, 'a game students cannot open');
  const cl = openLesson(w);
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=lesson&ref=${cl.id}`)).status, 200);
  assert.equal((await T(`/api/dash/${w.A.id}/qr?kind=lesson&ref=nope`)).status, 404);
  // The QR maker: versions up to 6 for a class link; too long throws (the route answers 404).
  const { qr } = await import('../../server/services/qr.js');
  assert.equal(qr(`https://oomba.example/class/${w.A.id}/dashboard/link/${link.id}`).version, 5);
  assert.equal(qr('x'.repeat(106)).version, 6);
  assert.throws(() => qr('x'.repeat(107)));
});

test('the picker: Oomba names only (never real names), no repeats until everyone has had a turn, away students skipped', async () => {
  const w = world(); const T = as(w.T);
  await T(`/class/${w.A.id}/dashboard`);
  const view = (await T(`/api/dash/${w.A.id}/picker`)).json;
  assert.deepEqual(view.students.map(s => s.name).sort(), [w.a1, w.a2, w.a3].map(u => u.display_name).sort());
  assert.doesNotMatch(JSON.stringify(view), w.REAL, 'no roster (real) names');
  const seen = [];
  for (let i = 0; i < 3; i++) { const r = await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'pick', norepeat: true })); assert.equal(r.status, 200); assert.doesNotMatch(r.text, w.REAL); seen.push(r.json.pick.id); }
  assert.equal(new Set(seen).size, 3, 'everyone once before anyone twice');
  const fourth = (await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'pick', norepeat: true }))).json;
  assert.notEqual(fourth.pick.id, seen[2], 'a new round never starts with the last one picked');
  // Away today: never picked.
  await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'away', user: w.a1.id, on: true }));
  await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'away', user: w.a2.id, on: true }));
  for (let i = 0; i < 4; i++) assert.equal((await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'pick', norepeat: false }))).json.pick.id, w.a3.id);
  await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'away', user: w.a3.id, on: true }));
  assert.equal((await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'pick' }))).status, 400, 'nobody left');
  assert.equal((await T(`/api/dash/${w.A.id}/picker`, POST({ action: 'away', user: w.b1.id, on: true }))).status, 404, 'not in this class');
  // A new school day starts fresh.
  q.run("UPDATE dash_class SET picker=json_set(picker, '$.day', '2000-01-01') WHERE class_id=?", w.A.id);
  assert.deepEqual((await T(`/api/dash/${w.A.id}/picker`)).json.away, []);
  // The picker is never on a student's screen or in anything a student reads.
  await layout(w, [{ id: 'pk', type: 'picker', pin: true }]);
  assert.deepEqual(D.pinsOf(w.A.id), []);
  assert.doesNotMatch((await as(w.a1)(`/api/dash/${w.A.id}/live`)).text, /picker|"pick"/);
  // The widget's names come from the same list (dash-widgets.js never reads a roster name).
  assert.doesNotMatch(fs.readFileSync('public/js/dash-widgets.js', 'utf8'), /roster_name|rosterName/);
  assert.doesNotMatch(fs.readFileSync('server/services/dash.js', 'utf8').split('// ================================================================ stage 2')[1].split('// ---------------------------------------------------------------- background pictures')[0], /roster_name/);
});

test('help queue: fixed buttons only; the teacher sees the order; a student sees only their own place', async () => {
  const w = world(); const T = as(w.T), A1 = as(w.a1), A2 = as(w.a2), A3 = as(w.a3);
  await layout(w, [{ id: 'hq', type: 'help', pin: true }]);
  assert.equal(D.pinsOf(w.A.id)[0].type, 'help');
  assert.equal((await A1(`/api/dash/${w.A.id}/help`, POST({ kind: 'help' }))).json.mine.place, 1);
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await A2(`/api/dash/${w.A.id}/help`, POST({ kind: 'help' }))).json.mine.place, 2);
  assert.deepEqual((await A3(`/api/dash/${w.A.id}/help`, POST({ kind: 'done' }))).json.mine, { kind: 'done' });
  // No free text: only the fixed kinds.
  for (const kind of ['I am stuck on 4b', 'chat', '']) assert.equal((await A1(`/api/dash/${w.A.id}/help`, POST({ kind, text: 'hello' }))).status, 400);
  const t = (await T(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(t.help.queue.map(x => [x.name, x.kind]), [[w.a1.display_name, 'help'], [w.a2.display_name, 'help'], [w.a3.display_name, 'done']]);
  assert.doesNotMatch(JSON.stringify(t.help), w.REAL, 'Oomba names, never real names');
  // A student's live answer: their own place, nobody else's name or id.
  const l2 = await A2(`/api/dash/${w.A.id}/live`);
  assert.deepEqual(l2.json.help, { mine: { kind: 'help', place: 2 } });
  for (const u of [w.a1, w.a3]) { assert.ok(!l2.text.includes(u.display_name), 'no other names'); assert.ok(!l2.text.includes(u.id), 'no other ids'); }
  assert.ok(!(await A2(`/class/${w.A.id}/dashboard`)).text.includes(w.a1.display_name), 'not in the page either');
  // Asking again keeps your place; Next takes the first; Cancel leaves.
  await A1(`/api/dash/${w.A.id}/help`, POST({ kind: 'help' }));
  const next = (await T(`/api/dash/${w.A.id}/help/queue`, POST({ action: 'next' }))).json;
  assert.equal(next.served.id, w.a1.id);
  assert.equal((await A2(`/api/dash/${w.A.id}/live`)).json.help.mine.place, 1);
  await A2(`/api/dash/${w.A.id}/help`, POST({ kind: 'cancel' }));
  assert.equal((await A2(`/api/dash/${w.A.id}/live`)).json.help.mine, null);
  await T(`/api/dash/${w.A.id}/help/queue`, POST({ action: 'remove', user: w.a3.id }));
  assert.deepEqual(D.helpQueue(w.A), []);
  // Yesterday's queue is not today's.
  await A1(`/api/dash/${w.A.id}/help`, POST({ kind: 'help' }));
  q.run("UPDATE dash_help SET day='2000-01-01' WHERE class_id=?", w.A.id);
  assert.deepEqual((await T(`/api/dash/${w.A.id}/live`)).json.help.queue, []);
  // On the projector the teacher's widget hides names (CSS: .dash-projector .dw-private).
  assert.match(fs.readFileSync('public/css/dash.css', 'utf8'), /\.dash-projector \.dw-private\{display:none!important\}/);
  assert.match(fs.readFileSync('public/js/dash-widgets.js', 'utf8'), /'dw-queue dw-private'/);
});

test('quick checks: a push to students, taps only, totals for the teacher, nobody else\'s answers for students, names on the teacher\'s tap only', async () => {
  const w = world(); const T = as(w.T), A1 = as(w.a1), A2 = as(w.a2);
  await T(`/class/${w.A.id}/dashboard`);
  assert.equal((await T(`/api/dash/${w.A.id}/checks`, POST({ kind: 'essay' }))).status, 400);
  assert.equal((await T(`/api/dash/${w.A.id}/checks`, POST({ kind: 'choice', options: ['only one', '  '] }))).status, 400, 'a choice check needs two choices');
  const r = await T(`/api/dash/${w.A.id}/checks`, POST({ kind: 'choice', question: 'Which is bigger?', options: ['1/2', '1/3', '‮evil', 'x'.repeat(90), 'e', 'f', 'g', 'h'] }));
  assert.equal(r.status, 200); const id = r.json.check;
  // It arrives like a push: in the banner and the tray, opening the card on the dashboard.
  const l1 = (await A1(`/api/dash/${w.A.id}/live`)).json;
  assert.deepEqual(l1.pushes.map(p => [p.kind, p.href, p.title]), [['check', `#check-${id}`, 'Which is bigger?']]);
  assert.deepEqual(l1.checks.map(c => [c.id, c.kind, c.options.length, c.mine]), [[id, 'choice', 6, null]]);
  assert.equal(l1.checks[0].options[2], 'evil'); assert.equal(l1.checks[0].options[3].length, 60);
  // Taps only: a value the check has; no text.
  for (const value of [6, -1, 1.5, 'B', 'my answer is B']) assert.equal((await A1(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value }))).status, 400, String(value));
  assert.equal((await A1(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value: 0 }))).status, 200);
  assert.equal((await A2(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value: 1 }))).status, 200);
  assert.equal((await as(w.a3)(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value: 1 }))).status, 200);
  assert.equal((await A2(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value: 0 }))).status, 200, 'a student can change their answer');
  // A student sees only their own answer: no totals, no names, no other answers.
  const s1 = await A1(`/api/dash/${w.A.id}/live`);
  assert.equal(s1.json.checks[0].mine, 0);
  assert.equal(s1.json.checks[0].tally, undefined); assert.equal(s1.json.checks[0].n, undefined);
  for (const u of [w.a2, w.a3]) { assert.ok(!s1.text.includes(u.display_name)); assert.ok(!s1.text.includes(u.id)); }
  // The teacher's live answer (what the projector draws): totals only, no names, no ids of students.
  const tl = await T(`/api/dash/${w.A.id}/live`);
  assert.deepEqual(tl.json.checks[0].tally, [2, 1, 0, 0, 0, 0]); assert.equal(tl.json.checks[0].n, 3); assert.equal(tl.json.size, 3);
  const checkJson = JSON.stringify(tl.json.checks);
  for (const u of [w.a1, w.a2, w.a3]) { assert.ok(!checkJson.includes(u.display_name)); assert.ok(!checkJson.includes(u.id)); }
  // Names: the teacher asks on purpose, and gets Oomba names.
  const names = (await T(`/api/dash/${w.A.id}/checks/${id}/names`)).json;
  assert.deepEqual(names.groups[0].sort(), [w.a1.display_name, w.a2.display_name].sort());
  assert.deepEqual(names.groups[1], [w.a3.display_name]); assert.deepEqual(names.missing, []);
  assert.doesNotMatch(JSON.stringify(names), w.REAL);
  assert.equal((await A1(`/api/dash/${w.A.id}/checks/${id}/names`)).status, 404);
  // The widget's projector view: the names button is teacher-only and hidden in projector mode; the grid shows totals.
  const wsrc = fs.readFileSync('public/js/dash-widgets.js', 'utf8');
  assert.match(wsrc, /names = btn\([^)]*'btn btn-sm dw-private'\)/);
  assert.match(wsrc, /if \(!cur \|\| ctx\.private\(\)\) return;/);
  // A new check ends the last; an ended check takes no answers and leaves the tray.
  const id2 = (await T(`/api/dash/${w.A.id}/checks`, POST({ kind: 'thumbs' }))).json.check;
  assert.equal((await A1(`/api/dash/${w.A.id}/checks/${id}/answer`, POST({ value: 1 }))).status, 400);
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.pushes.map(p => p.kind), ['check']);
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.checks.map(c => c.id), [id2]);
  await T(`/api/dash/${w.A.id}/checks/${id2}/end`, POST());
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.checks, []);
  assert.deepEqual((await A1(`/api/dash/${w.A.id}/live`)).json.pushes, []);
  // A teacher can't push a check through the ordinary push address (only through a check).
  assert.equal((await T(`/api/dash/${w.A.id}/pushes`, POST({ kind: 'check', ref: id2 }))).status, 400);
  // Kept for the day only, unless saved.
  await T(`/api/dash/${w.A.id}/checks/${id}/save`, POST({ saved: true }));
  q.run("UPDATE dash_checks SET day='2000-01-01' WHERE class_id=?", w.A.id);
  await T(`/api/dash/${w.A.id}/checks`, POST({ kind: 'scale' }));
  const left = q.all('SELECT id FROM dash_checks WHERE class_id=?', w.A.id).map(x => x.id);
  assert.ok(left.includes(id) && !left.includes(id2), 'the unsaved check of an earlier day is gone, the saved one stays');
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_answers WHERE check_id=?', id2).n, 0);
  const saved = (await T(`/api/dash/${w.A.id}/checks/saved`)).json.checks;
  assert.deepEqual(saved.map(c => [c.id, c.tally.slice(0, 2)]), [[id, [2, 1]]]);
});

test('Oomba tiles: only games every student can open and the class\'s open lessons; no prices or plan words', async () => {
  const w = world();
  const g = publicGame(w.T, 'Number Line Hop');
  const priv = publicGame(w.T, 'Teacher draft', 'private');
  const cl = openLesson(w, 'Fractions on a line');
  await layout(w, [{ id: 'tl', type: 'tiles', s: { tiles: [{ kind: 'game', ref: g.id }, { kind: 'game', ref: priv.id }, { kind: 'lesson', ref: cl.id }, { kind: 'lesson', ref: 'nope' }] }, pin: true }]);
  const pin = D.pinsOf(w.A.id)[0];
  const refs = pin.s.tiles.map(x => `${x.kind}:${x.ref}`).join(',');
  const r = await as(w.a1)(`/api/dash/${w.A.id}/tiles?refs=${encodeURIComponent(refs)}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.tiles.map(x => [x.kind, x.title, x.href]), [['game', 'Number Line Hop', `/play/${g.slug}`], ['lesson', 'Fractions on a line', `/class/${w.A.id}/lessons/${cl.id}`]]);
  assert.doesNotMatch(r.text, /\$\s?\d|€\s?\d|£\s?\d|price|plan|upgrade|\bpro\b|trial/i);
});

test('safety: student screens and the projector carry no prices, plans or real names; no free text; no AI anywhere; the mic code has no network or recording', async () => {
  const outside = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (u, ...rest) => { const s = String(u && u.url || u); if (!s.startsWith(base)) outside.push(s); return realFetch(u, ...rest); };
  try { await safetyChecks(); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(outside, [], 'nothing left the server: no AI, no upload, nothing about students');
});
async function safetyChecks() {
  const w = world();
  await layout(w, [{ id: 'tp', type: 'timer', pin: true }, { id: 'hq', type: 'help', pin: true }, { id: 'sc', type: 'schedule', s: { periods: [{ name: 'Reading', start: '08:30', end: '09:15' }] }, pin: true },
    { id: 'ck', type: 'check' }, { id: 'pk', type: 'picker' }, { id: 'nz', type: 'noise' }, { id: 'qq', type: 'qr' }]);
  await as(w.a1)(`/api/dash/${w.A.id}/help`, POST({ kind: 'help' }));
  D.createCheck(w.T, w.A, { kind: 'fist', question: 'How sure are you?' });
  const money = /\$\s?\d|€\s?\d|£\s?\d|\/plans|upgrade|free trial|Teacher plan|School plan|pricing|\bPro\b/i;
  for (const who of [w.a1, w.a2]) {
    const page = (await as(who)(`/class/${w.A.id}/dashboard`)).text, live = (await as(who)(`/api/dash/${w.A.id}/live`)).text;
    assert.doesNotMatch(page, money); assert.doesNotMatch(live, money);
    assert.doesNotMatch(page, w.REAL); assert.doesNotMatch(live, w.REAL);
  }
  const tPage = (await as(w.T)(`/class/${w.A.id}/dashboard`)).text, tLive = (await as(w.T)(`/api/dash/${w.A.id}/live`)).text;
  assert.doesNotMatch(tPage.replace(/<script[\s\S]*?<\/script>/g, ''), money, 'the projector screen');
  assert.doesNotMatch(tLive, w.REAL, 'the projector\'s live data has Oomba names only');
  // English words of every stage 2 widget: nothing sells.
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8'));
  assert.doesNotMatch(JSON.stringify(en.dash.w), money);
  // No free text from students: their only writes are fixed kinds and numbers.
  const routes = fs.readFileSync('server/routes/dash.js', 'utf8');
  assert.match(routes, /D\.helpAsk\(req\.user, x\.c, String\(body\(req\)\.kind \|\| ''\)\)/);
  assert.match(routes, /D\.answerCheck\(req\.user, x\.c, req\.params\.cid, body\(req\)\.value\)/);
  // No AI in any of this.
  for (const f of ['server/services/dash.js', 'server/routes/dash.js', 'public/js/dash.js', 'public/js/dash-widgets.js', 'public/js/dash-noise.js', 'server/services/qr.js'])
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /anthropic|screenPhoto|ai-budget|lesson-ai|set-ai|rubric-ai|\bclaude\b|openai/i, f);
  // The mic: Web Audio levels only. No network of any kind, no recorder, no storage, no app helpers that could send.
  const mic = fs.readFileSync('public/js/dash-noise.js', 'utf8');
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\bMediaRecorder\b/, /localStorage|sessionStorage|indexedDB/, /from '\/js\/app\.js'|\bapi\(/, /\bimport\b(?! \{)/, /postMessage/, /createObjectURL|\bBlob\b/])
    assert.doesNotMatch(mic, bad, String(bad));
  assert.doesNotMatch(mic.replace(/^\s*\/\/.*$/gm, ''), /\bimport\b/, 'it imports nothing');
  assert.match(mic, /getByteTimeDomainData/); assert.match(mic, /getTracks\(\)\) tr\.stop\(\)/, 'the off button stops the mic');
  assert.doesNotMatch(fs.readFileSync('public/js/dash-widgets.js', 'utf8'), /\bMediaRecorder\b|getUserMedia/, 'only the noise module touches the mic');
  // The noise level maths works on samples alone.
  const { levelOf } = await import('../../public/js/dash-noise.js');
  assert.equal(levelOf(new Uint8Array(512).fill(128)), 0);
  assert.ok(levelOf(Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 200 : 56))) > 80);
}

test('account deletion forgets a student\'s place in help queues, their check answers and picker marks', async () => {
  const w = world();
  await layout(w, [{ id: 'hq', type: 'help', pin: true }]);
  D.helpAsk(w.a1, w.A, 'help');
  const id = D.createCheck(w.T, w.A, { kind: 'thumbs' }).check;
  D.answerCheck(w.a1, w.A, id, 0);
  D.pickerAction(w.T, w.A, { action: 'away', user: w.a1.id, on: true });
  D.forgetUser(w.a1.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_help WHERE user_id=?', w.a1.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_answers WHERE user_id=?', w.a1.id).n, 0);
  assert.ok(!D.classState(w.A.id).picker.includes(w.a1.id));
});

test('every stage 2 string is translated into every locale', async () => {
  const { checkAll } = await import('../../server/i18n/check.js');
  const r = checkAll();
  const keys = Object.keys(r.en).filter(k => /^dash\.w\.(timer|stopwatch|schedule|weather|qr|picker|noise|help|check|tiles|countdown|calendar|symbols|light|dice|random|groups|score|stickers)\.|^dash\.w\.clock\.s\.zone2$|^dash\.errors\.(timer|nobody|check\w+|resting|qrGone)$|^js\.dash\.(check\.|kind\.check|act\.answer|side\.(zoneNone|placeNote|qrNote))/.test(k));
  assert.ok(keys.length > 240, String(keys.length));
  for (const l of r.locales) {
    if (l.code === 'en-GB') continue;
    const missing = l.missing.filter(k => keys.includes(k));
    assert.deepEqual(missing, [], l.code);
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra], [], l.code);
  }
});

test('more everyday widgets: registry, settings rebuilt on the server, and the maths behind them', () => {
  const ids = ['countdown', 'calendar', 'symbols', 'light', 'dice', 'random', 'groups', 'score', 'stickers'];
  for (const id of ids) { assert.ok(D.widgetType(id), id); assert.equal(typeof W.RENDER[id], 'function', `renderer for ${id}`); }
  const c = (type, s) => D.cleanSettings(D.widgetType(type), s);
  // Visual timer and spinner wheel are modes of the timer and the picker.
  assert.equal(c('timer', { view: 'ring' }).view, 'ring'); assert.equal(c('timer', { view: 'lava lamp' }).view, 'digits');
  assert.deepEqual(c('picker', { mode: 'wheel', source: 'items', items: 'Volcanoes\nRivers\u0000', norepeat: false }), { mode: 'wheel', source: 'items', items: 'Volcanoes\nRivers', norepeat: false });
  // Countdown: a real day and a time.
  assert.deepEqual(c('countdown', { label: 'Field trip', date: '2026-12-04', time: '09:30' }), { label: 'Field trip', date: '2026-12-04', time: '09:30' });
  for (const bad of ['2026-02-30', '26-12-04', '2026-13-01', '1999-12-31', 'tomorrow', '']) assert.equal(c('countdown', { date: bad }).date, '', bad);
  assert.equal(c('countdown', { time: '25:00' }).time, '08:00');
  // Calendar: real days with a label, one per day, sorted, at most 40.
  assert.deepEqual(c('calendar', { marks: [{ date: '2026-11-20', label: 'Book fair' }, { date: '2026-11-03', label: 'Picture day‮' }, { date: '2026-11-20', label: 'Dup' }, { date: 'x', label: 'Bad' }, { date: '2026-11-21', label: '' }] }).marks,
    [{ date: '2026-11-03', label: 'Picture day' }, { date: '2026-11-20', label: 'Dup' }]);
  assert.equal(c('calendar', { marks: Array.from({ length: 60 }, (_, i) => ({ date: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}`, label: 'x' })) }).marks.length, D.MAX_MARKS);
  // Work symbols and the traffic light: fixed options; the light's words are short teacher text.
  assert.equal(c('symbols', { mode: 'dance' }).mode, 'whisper'); assert.equal(c('symbols', { mode: 'hand' }).mode, 'hand');
  const lt = c('light', { color: 'blue', red: 'Stop and look'.repeat(9) });
  assert.equal(lt.color, 'green'); assert.equal(lt.red.length, 40);
  // Dice, random number and groups: clamped numbers.
  assert.equal(c('dice', { count: 40 }).count, 6); assert.equal(c('dice', { count: 0 }).count, 1);
  assert.deepEqual(c('random', { min: -1e9, max: '12' }), { min: -9999, max: 12 });
  assert.deepEqual(c('groups', { by: 'count', n: 99 }), { by: 'count', n: 12 });
  // Scoreboard: whole points, one per team (8 at most); team names are teacher text.
  assert.deepEqual(c('score', { teams: 'Red\nBlue', scores: [3, '4.6', 'x', 1e9, -1e9, 0, 0, 0, 9, 9] }), { teams: 'Red\nBlue', scores: [3, 5, 0, 9999, -9999, 0, 0, 0] });
  // Stickers: only the fixed set (no uploads), inside the widget, at most 30.
  assert.deepEqual(c('stickers', { stamps: [{ e: 0, x: 10, y: 20 }, { e: 99, x: 1, y: 1 }, { e: 1, x: 120, y: 5 }, { e: 'https://evil.example/x.png', x: 1, y: 1 }, { e: 2.5, x: 1, y: 1 }] }).stamps, [{ e: 0, x: 10, y: 20 }]);
  assert.equal(c('stickers', { stamps: Array.from({ length: 50 }, () => ({ e: 1, x: 5, y: 5 })) }).stamps.length, D.MAX_STAMPS);
  assert.equal(W.STAMPS.length, D.STAMP_COUNT);
  const widgets = fs.readFileSync('public/js/dash-widgets.js', 'utf8');
  const stickerCode = widgets.slice(widgets.indexOf('function stickers('), widgets.indexOf('/** id -> renderer.'));
  assert.doesNotMatch(stickerCode, /type="?file|input|upload|FileReader|fetch|innerHTML/i, 'stickers: no uploads, no network, no markup');
  // Countdown sums (the school's time zone) and calendar day.
  assert.equal(W.zonedEpoch('2026-12-04', '09:30', 'America/New_York'), Date.UTC(2026, 11, 4, 14, 30));
  assert.equal(W.zonedEpoch('2026-07-04', '09:30', 'America/New_York'), Date.UTC(2026, 6, 4, 13, 30), 'summer time');
  assert.equal(W.zonedEpoch('2026-12-04', '09:30', 'Asia/Tokyo'), Date.UTC(2026, 11, 4, 0, 30));
  assert.deepEqual(W.countdownParts(3 * 86400e3 + 5 * 3600e3 + 61e3), { days: 3, hours: 5, mins: 2 });
  assert.equal(W.todayIn('Asia/Tokyo', new Date(Date.UTC(2026, 10, 15, 20))), '2026-11-16');
  // Groups: everyone exactly once, sizes differ by at most one; by size and by count.
  const kids = Array.from({ length: 23 }, (_, i) => `Kid${i}`);
  for (const [by, n, k] of [['size', 4, 6], ['count', 5, 5], ['size', 30, 1], ['count', 40, 23]]) {
    const g = W.makeGroups(kids, by, n);
    assert.equal(g.length, k, `${by} ${n}`);
    assert.deepEqual(g.flat().sort(), [...kids].sort());
    const sizes = g.map(x => x.length); assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
  assert.deepEqual(W.makeGroups([], 'size', 4), []);
  // Groups and the wheel take names only from the picker's list (Oomba names), never anything else.
  assert.match(widgets.slice(widgets.indexOf('function groups('), widgets.indexOf('function score(')), /ctx\.get\('\/picker'\)/);
  assert.doesNotMatch(widgets, /roster|realName|real_name/i);
});

test('symbols, traffic light, scoreboard and stickers the teacher taps reach student screens when pinned; dice and groups never do', async () => {
  const w = world(); const T = as(w.T);
  await layout(w, [{ id: 'sy', type: 'symbols', s: { mode: 'silent' }, pin: true }, { id: 'tl', type: 'light', s: { color: 'red', red: 'Eyes on me' }, pin: true },
    { id: 'sb', type: 'score', s: { teams: 'Comets\nRockets', scores: [2, 5] }, pin: true }, { id: 'st', type: 'stickers', s: { stamps: [{ e: 3, x: 50, y: 50 }] }, pin: true },
    { id: 'dc', type: 'dice', pin: true }, { id: 'gr', type: 'groups', pin: true }, { id: 'rn', type: 'random', pin: true }]);
  const pins = (await as(w.a1)(`/api/dash/${w.A.id}/pins`)).json.pins;
  assert.deepEqual(pins.map(p => p.type), ['symbols', 'light', 'score', 'stickers']);
  assert.equal(pins.find(p => p.type === 'light').s.red, 'Eyes on me');
  assert.deepEqual(pins.find(p => p.type === 'score').s.scores, [2, 5]);
  // A student can add dice and a random number to their own screen, but not a scoreboard or a light.
  await as(w.a1)(`/api/dash/${w.A.id}/me`, POST({ widgets: [{ id: 'd1', type: 'dice' }, { id: 'r1', type: 'random' }, { id: 's1', type: 'score' }, { id: 'l1', type: 'light' }, { id: 'g1', type: 'groups' }] }));
  assert.deepEqual(D.studentState(w.A.id, w.a1.id).widgets.map(x => x.type), ['dice', 'random']);
});
