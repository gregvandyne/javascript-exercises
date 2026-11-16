// Classroom dashboards: the timer and the stopwatch are one widget (docs/decisions.md "Timer and stopwatch combined").
// One library entry (type id timer) with a mode setting: 'timer' counts down, 'stopwatch' counts up. Switching mode
// drops the run the widget had (nothing carries over). Layouts, pins and student screens saved with the old
// 'stopwatch' type are read as a timer in stopwatch mode with the same id, so a running stopwatch keeps running, pins
// and student places still match and the timer address for the old id still works.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashtimer-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const W = await import('../../public/js/dash-widgets.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) };
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
const POST = (body = {}) => ({ method: 'POST', body });

const boss = createUser({ username: 'DashTimerBoss', password: 'secret123', role: 'admin' });
let worlds = 0;
function world() {
  const k = ++worlds;
  const oak = S.createSchool(boss, { name: `DashTimer Oak ${k}` }).school;
  const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tia Teacher', role: 'teacher' }).user.id);
  const A = S.createClass(T, oak.id, { name: '5A' }).class;
  const kid = name => { const u = S.createSchoolAccount(T, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { oak, T, A, a1: kid('Ada Apple'), a2: kid('Abe Acorn') };
}
/** The teacher's first layout with these widgets (and the class following it). */
async function layout(w, widgets) {
  await as(w.T)(`/class/${w.A.id}/dashboard`);
  const l = D.layoutsOf(w.A.id, w.T.id)[0];
  const r = await as(w.T)(`/api/dash/${w.A.id}/layouts/${l.id}`, POST({ widgets }));
  assert.equal(r.status, 200, r.text);
  return r.json.layout;
}
const timers = w => JSON.parse(D.classState(w.A.id).timers);

test('one widget in the library: the timer, with a Timer | Stopwatch mode; no separate stopwatch', () => {
  assert.equal(D.widgetType('stopwatch'), null, 'no stopwatch type of its own');
  const type = D.widgetType('timer');
  assert.deepEqual(type.settings.map(s => s.key), ['mode', 'minutes', 'view', 'chime', 'bar']);
  assert.deepEqual(type.settings[0], { key: 'mode', type: 'select', options: ['timer', 'stopwatch'], def: 'timer' });
  for (const k of ['mode', 'toTimer', 'toStopwatch']) assert.ok(type.words.includes(k), k);
  for (const role of ['teacher', 'student']) {
    const types = D.registryFor(tFor('en'), role).types;
    assert.ok(!types.some(x => x.id === 'stopwatch'), role);
    assert.equal(types.filter(x => x.group === 'time' && /stopwatch/i.test(x.name)).length, 1, `${role}: one entry names the stopwatch`);
  }
  assert.equal(typeof W.RENDER.timer, 'function');
  assert.equal(W.RENDER.stopwatch, undefined, 'no renderer of its own either');
  // Every language names the widget and both modes (en-GB has only the words spelled differently).
  for (const loc of ['en', 'de', 'ar', 'fr', 'es', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const t = tFor(loc), x = D.registryFor(t, 'teacher').types.find(y => y.id === 'timer');
    const f = x.settings.find(s => s.key === 'mode');
    for (const v of [x.name, x.desc, f.label, f.labels.timer, f.labels.stopwatch, x.words.mode, x.words.toTimer, x.words.toStopwatch]) assert.ok(v && !/^dash\./.test(v), `${loc}: ${v}`);
    if (loc !== 'en') assert.notEqual(x.words.toStopwatch, D.registryFor(tFor('en'), 'teacher').types.find(y => y.id === 'timer').words.toStopwatch, `${loc} is translated`);
  }
  assert.equal(D.registryFor(tFor('it'), 'teacher').types.find(y => y.id === 'timer').name, 'Timer e cronometro');
  // Settings: the mode is one of the two, else a timer.
  const c = s => D.cleanSettings(D.widgetType('timer'), s);
  assert.equal(c({}).mode, 'timer'); assert.equal(c({ mode: 'stopwatch' }).mode, 'stopwatch'); assert.equal(c({ mode: '<b>' }).mode, 'timer');
  // Big enough for either mode's controls (the fit check proves nothing is cut off: scripts/dash-fit-check.js).
  assert.ok(type.min[0] >= 3 && type.min[1] >= 3);
});

test('old stopwatch widgets become a timer in stopwatch mode (same id): sent, stored, pinned and on student screens', async () => {
  // Sent by a browser that still has the old library.
  const sent = D.cleanWidgets([{ id: 'sw1', type: 'stopwatch', x: 2, y: 1, w: 3, h: 3, pin: true, s: { minutes: 'x' } }], 'teacher');
  assert.deepEqual(sent, [{ id: 'sw1', type: 'timer', x: 2, y: 1, w: Math.max(3, D.widgetType('timer').min[0]), h: Math.max(3, D.widgetType('timer').min[1]), s: { mode: 'stopwatch', minutes: 5, view: 'digits', chime: false, bar: true }, pin: true }]);
  assert.deepEqual(D.migrateWidget({ id: 'c1', type: 'clock', s: {} }), { id: 'c1', type: 'clock', s: {} }, 'other widgets are left alone');

  // Stored before the change: a teacher's layout with a pinned running stopwatch, the class's pins, a student's own
  // stopwatch and where that student moved the pinned one.
  const w = world(); const T = as(w.T), K = as(w.a1);
  const l = await layout(w, [{ id: 'clock1', type: 'clock' }]);
  const old = { id: 'swOld', type: 'stopwatch', x: 4, y: 0, w: 3, h: 3, s: {}, pin: true };
  const started = Date.now() - 90e3;
  q.run('UPDATE dash_layouts SET widgets=? WHERE id=?', JSON.stringify([{ id: 'clock1', type: 'clock', x: 4, y: 3, w: 3, h: 2, s: D.cleanSettings(D.widgetType('clock'), {}) }, old]), l.id);
  q.run('UPDATE dash_class SET pins=?, timers=? WHERE class_id=?', JSON.stringify([{ id: 'swOld', type: 'stopwatch', x: 4, y: 0, w: 3, h: 3, s: {} }]),
    JSON.stringify({ swOld: { mode: 'up', dur: 0, base: 4000, start: started, on: true } }), w.A.id);
  q.run('INSERT INTO dash_students(class_id, user_id, widgets, pins, bg, updated_at) VALUES (?,?,?,?,?,?)', w.A.id, w.a1.id,
    JSON.stringify([{ id: 'mySw', type: 'stopwatch', x: 0, y: 4, w: 3, h: 3, s: {} }]), JSON.stringify({ swOld: { x: 6, y: 2, w: 3, h: 3 } }), JSON.stringify({ kind: 'color', id: 'sky' }), Date.now());

  // Read back: a timer in stopwatch mode everywhere, pinned as it was.
  const readAll = D.layoutsOf(w.A.id, w.T.id)[0].widgets, read = readAll.find(x => x.id === 'swOld');
  assert.equal(read.type, 'timer'); assert.equal(read.s.mode, 'stopwatch'); assert.equal(read.pin, true);
  const [mw, mh] = D.widgetType('timer').min;
  assert.deepEqual([read.x, read.y, read.w, read.h], [4, 0, Math.max(3, mw), Math.max(3, mh)], 'its box grows to the timer\'s smallest size');
  assert.equal(readAll.find(x => x.id === 'clock1').y, read.y + read.h, 'and the widget under it moves down, never under it');
  assert.deepEqual(D.pinsOf(w.A.id).map(x => [x.id, x.type, x.s.mode]), [['swOld', 'timer', 'stopwatch']]);
  const me = D.studentState(w.A.id, w.a1.id);
  assert.deepEqual(me.widgets.map(x => [x.id, x.type, x.s.mode]), [['mySw', 'timer', 'stopwatch']]);
  assert.deepEqual(me.pins.swOld, { x: 6, y: 2, w: Math.max(3, mw), h: Math.max(3, mh) }, 'the student\'s place for the pinned one still matches its id (at least the new smallest size)');

  // The running stopwatch carries over: still counting up from the same start, on the teacher's and the student's /live.
  const tl = (await T(`/api/dash/${w.A.id}/live`)).json, sl = (await K(`/api/dash/${w.A.id}/live`)).json;
  for (const live of [tl, sl]) {
    assert.deepEqual(live.timers.swOld, { mode: 'up', dur: 0, base: 4000, start: started, on: true });
    assert.ok(W.timerView(live.timers.swOld, live.now).elapsed >= 94e3);
  }
  // The old id still answers the timer address: pause keeps the time it had counted.
  const paused = (await T(`/api/dash/${w.A.id}/timers/swOld`, POST({ action: 'pause' }))).json.timer;
  assert.equal(paused.mode, 'up'); assert.equal(paused.on, false); assert.ok(paused.base >= 94e3, String(paused.base));
  assert.equal((await T(`/api/dash/${w.A.id}/timers/swOld`, POST({ action: 'set', ms: 60e3 }))).status, 400, 'stopwatch mode has no duration');

  // The dashboard page itself gets the migrated widgets (teacher: layouts; student: pins and their own screen).
  const tPage = (await T(`/class/${w.A.id}/dashboard`)).text, sPage = (await K(`/class/${w.A.id}/dashboard`)).text;
  for (const page of [tPage, sPage]) assert.doesNotMatch(page, /"type":"stopwatch"/);

  // Saving the layout as the browser now has it stores the new type and republishes the pins (students redraw), and
  // keeps the stopwatch's state (its mode did not change).
  const before = D.classState(w.A.id).pins_at;
  await layout(w, D.layoutsOf(w.A.id, w.T.id)[0].widgets);
  assert.doesNotMatch(q.get('SELECT widgets FROM dash_layouts WHERE id=?', l.id).widgets, /"type":"stopwatch"/);
  assert.match(q.get('SELECT widgets FROM dash_layouts WHERE id=?', l.id).widgets, /"mode":"stopwatch"/);
  assert.doesNotMatch(D.classState(w.A.id).pins, /"type":"stopwatch"/);
  assert.ok(D.classState(w.A.id).pins_at > before);
  assert.ok(timers(w).swOld.base >= 94e3, 'the run is kept');
  // The student's own screen saves as a timer too, and their place for the pinned one stays.
  const saved = (await K(`/api/dash/${w.A.id}/me`, POST({ widgets: me.widgets, pins: me.pins }))).json.state;
  assert.deepEqual(saved.widgets.map(x => [x.type, x.s.mode]), [['timer', 'stopwatch']]);
  assert.ok(saved.pins.swOld);
});

test('switching mode starts again from nothing; both modes\' server actions', async () => {
  const w = world(); const T = as(w.T), K = as(w.a1);
  const widgets = [{ id: 'tm', type: 'timer', s: { minutes: 10 }, pin: true }];
  await layout(w, widgets);
  // Timer mode: set, start (counts down), pause, reset.
  assert.equal((await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'set', ms: 120e3 }))).json.timer.dur, 120e3);
  let st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'start' }))).json.timer;
  assert.deepEqual([st.mode, st.on, st.dur], ['down', true, 120e3]);
  assert.ok(D.timerView(st, st.start + 30e3).left === 90e3);
  // Switched to a stopwatch while running: the countdown is dropped, not turned into a count up.
  await layout(w, [{ ...widgets[0], s: { minutes: 10, mode: 'stopwatch' } }]);
  assert.equal(timers(w).tm, undefined, 'the old run is gone');
  assert.equal((await K(`/api/dash/${w.A.id}/live`)).json.timers.tm, undefined, 'pinned screens show a fresh stopwatch');
  assert.equal(D.pinsOf(w.A.id)[0].s.mode, 'stopwatch', 'pinned screens get the new mode');
  // Stopwatch mode: start, pause, start again, reset; no duration.
  st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'start' }))).json.timer;
  assert.deepEqual([st.mode, st.on, st.base, st.dur], ['up', true, 0, 0]);
  assert.deepEqual(D.timerView(st, st.start + 65e3), { elapsed: 65e3, left: null, done: false });
  await new Promise(r => setTimeout(r, 20));
  st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'pause' }))).json.timer;
  assert.equal(st.on, false); assert.ok(st.base >= 20);
  const base1 = st.base;
  st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'start' }))).json.timer;
  assert.equal(st.base, base1, 'goes on from where it was paused');
  assert.equal((await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'set', ms: 60e3 }))).status, 400);
  // Back to the timer while the stopwatch runs: a fresh countdown of the widget's minutes.
  await layout(w, [{ ...widgets[0], s: { minutes: 10, mode: 'timer' } }]);
  assert.equal(timers(w).tm, undefined);
  st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'start' }))).json.timer;
  assert.deepEqual([st.mode, st.base, st.dur], ['down', 0, 600e3]);
  // A run left from the other mode (however it got there) is never carried over by the timer address.
  q.run('UPDATE dash_class SET timers=? WHERE class_id=?', JSON.stringify({ tm: { mode: 'up', dur: 0, base: 50e3, start: 0, on: false } }), w.A.id);
  st = (await T(`/api/dash/${w.A.id}/timers/tm`, POST({ action: 'start' }))).json.timer;
  assert.deepEqual([st.mode, st.base, st.dur], ['down', 0, 600e3]);
  // Saving with the same mode keeps the run.
  await layout(w, [{ ...widgets[0], x: 2, s: { minutes: 10, mode: 'timer' } }]);
  assert.equal(timers(w).tm.on, true);
});

test('ready-made layouts still make timers (timer mode, their own minutes and look)', () => {
  const t = tFor('en');
  for (const tpl of D.LAYOUT_TEMPLATES) {
    for (const x of D.templateWidgets(tpl.id, t).filter(y => y.type === 'timer')) {
      assert.equal(x.s.mode, 'timer', tpl.id);
      const box = D.widgetType('timer').min; assert.ok(x.w >= box[0] && x.h >= box[1], tpl.id);
    }
  }
  assert.deepEqual(D.templateWidgets('quiet', t).find(y => y.type === 'timer').s, { mode: 'timer', minutes: 20, view: 'ring', chime: false, bar: true });
});

test('the ring and the digits: one size for every time to 99:59, sized from the ring, never from the time shown', () => {
  // docs/decisions.md "Classroom dashboards: timer, one digit size, inside the ring".
  const css = fs.readFileSync('public/css/dash.css', 'utf8'), js = fs.readFileSync('public/js/dash-widgets.js', 'utf8');
  const rule = sel => { const m = css.match(new RegExp(`(?:^|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm')); return m ? m[1] : ''; };
  // The ring's area is a size container and the ring is the largest circle in it; the time is sized from that alone.
  assert.match(rule('.dw-ring'), /container-type:size/);
  assert.match(rule('.dw-ring svg'), /width:min\(100cqw,100cqh\)/);
  const k = Number(rule('.dw-ring .dw-digits').match(/min\(100cqw,100cqh\) \* ([\d.]+)/)[1]);
  const kLong = Number(rule('.dw-ring .dw-digits.is-long').match(/min\(100cqw,100cqh\) \* ([\d.]+)/)[1]);
  // The widest time ("88:88", 2.62em x 1.18em with its line box; "8:88:88" 3.44em) fits the inner circle (r 41 of 100,
  // ring r 45, stroke 8) with room to spare.
  assert.match(js, /r: 45, class: 'dw-ringbg'/); assert.match(css, /\.dw-ringbg\{[^}]*stroke-width:8/);
  const inner = 2 * (45 - 4) / 100;
  assert.ok(Math.hypot(2.62, 1.18) * k <= inner * 0.92, `88:88 fits (${k})`);
  assert.ok(Math.hypot(3.44, 1.18) * kLong <= inner * 0.92, `8:88:88 fits (${kLong})`);
  // Tabular figures, so the digits never jiggle while counting; hours step down once, by the run, not by the text.
  assert.match(css, /\.dw-digits\{[^}]*font-variant-numeric:tabular-nums/);
  assert.match(js, /digits\.classList\.toggle\('is-long', down \? st\.dur >= 3600e3 : ms >= 3600e3\)/);
  assert.doesNotMatch(js, /digits\.style\.fontSize/);
  assert.equal(W.mmss(599e3), '9:59'); assert.equal(W.mmss(3599e3), '59:59'); assert.equal(W.mmss(3900e3), '1:05:00');
});
