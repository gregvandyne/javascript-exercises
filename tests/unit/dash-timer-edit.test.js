// Classroom dashboards: timer settings that stick, and tapping the time to change it (docs/decisions.md "Timer: settings
// that stick, tap the time"). Starting minutes changed in the settings takes effect on a timer that has run already
// (it used to keep the run's old length), a field still being typed in is kept however the settings sheet closes
// (✕, Escape, a tap outside, Done; a mouse or touch), and on the teacher's board the digits are a button that turns
// into a field: Enter or leaving it sets the time, Escape keeps the old one, a bad time says what to type.
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashtimeredit-`);

const W = await import('../../public/js/dash-widgets.js');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

test('a typed time: whole minutes or m:ss, from 1 second to 180 minutes; anything else is not a time', () => {
  assert.equal(W.typedTime('8'), 8 * 60e3);
  assert.equal(W.typedTime(' 8:30 '), 510e3);
  assert.equal(W.typedTime('8.30'), 510e3);
  assert.equal(W.typedTime('0:45'), 45e3);
  assert.equal(W.typedTime('180'), 180 * 60e3);
  assert.equal(W.typedTime('180:00'), 180 * 60e3);
  for (const bad of ['', ' ', '0', '0:00', '181', '180:01', '8:7', '8:60', 'abc', '8m', '-5', '1:2:3', '8.5', null, undefined]) assert.equal(W.typedTime(bad), null, String(bad));
});

test('retime (page and server alike): back to full at the new length; a running timer keeps running, a finished one stops', () => {
  const t = 1e6;
  const idle = { mode: 'down', dur: 300e3, base: 120e3, start: 0, on: false, m: 5 };
  for (const R of [W.retime, D.retime]) {
    assert.deepEqual(R(idle, 480e3, t, 8), { mode: 'down', dur: 480e3, base: 0, start: 0, on: false, m: 8 });
    const going = { mode: 'down', dur: 300e3, base: 0, start: t - 60e3, on: true, m: 5 };
    assert.deepEqual(R(going, 480e3, t, 8), { mode: 'down', dur: 480e3, base: 0, start: t, on: true, m: 8 });
    const over = { mode: 'down', dur: 60e3, base: 0, start: t - 90e3, on: true, m: 1 };
    assert.deepEqual(R(over, 480e3, t, 8), { mode: 'down', dur: 480e3, base: 0, start: 0, on: false, m: 8 });
  }
});

// ---------------------------------------------------------------- a class
const boss = createUser({ username: 'TimerEditBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Timer Edit School' }).school;
const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
const C = S.createClass(T, school.id, { name: 'Class 2C' }).class;
D.ensureLayouts(T, C, tFor('en'));
const first = D.layoutsOf(C.id, T.id)[0];
const WIDGETS = [
  { id: 'tring', type: 'timer', x: 0, y: 0, w: 4, h: 5, s: { mode: 'timer', minutes: 8, view: 'ring', chime: false, bar: true } },
  { id: 'tdig', type: 'timer', x: 4, y: 0, w: 4, h: 4, s: { mode: 'timer', minutes: 5, view: 'digits', bar: true } },
  { id: 'tsw', type: 'timer', x: 8, y: 0, w: 4, h: 4, s: { mode: 'stopwatch', minutes: 5 } },
];
const reset = () => { D.updateLayout(T, C, first.id, { name: 'Test', widgets: structuredClone(WIDGETS) }); q.run('UPDATE dash_class SET timers=? WHERE class_id=?', '{}', C.id); };
reset(); D.useLayout(T, C, first.id);
const runs = () => JSON.parse(D.classState(C.id).timers || '{}');
const wOf = id => D.getLayout(first.id).widgets.find(w => w.id === id);
const withMinutes = (id, m) => D.getLayout(first.id).widgets.map(w => (w.id === id ? { ...w, s: { ...w.s, minutes: m } } : w));

test('server: new Starting minutes take over a run that has been used (stopped or running); untouched timers keep theirs', () => {
  reset();
  const t0 = Date.now();
  D.timerAction(T, C, 'tring', { action: 'start' }, t0);
  D.timerAction(T, C, 'tring', { action: 'reset' }, t0 + 5e3);
  D.timerAction(T, C, 'tdig', { action: 'start' }, t0);
  assert.equal(runs().tring.dur, 8 * 60e3);
  assert.equal(runs().tring.m, 8, 'the run says which Starting minutes it follows');
  // Stopped: the new time, waiting.
  D.updateLayout(T, C, first.id, { widgets: withMinutes('tring', 12) });
  assert.deepEqual({ dur: runs().tring.dur, on: runs().tring.on, base: runs().tring.base, m: runs().tring.m }, { dur: 12 * 60e3, on: false, base: 0, m: 12 });
  assert.equal(runs().tdig.on, true, 'the other timer was not touched');
  assert.equal(runs().tdig.dur, 5 * 60e3);
  // Running: the new time, still running.
  D.updateLayout(T, C, first.id, { widgets: withMinutes('tdig', 3) });
  assert.equal(runs().tdig.dur, 3 * 60e3);
  assert.equal(runs().tdig.on, true);
  // An old run saved before "m" was kept: still retimed when the minutes change (the layout says what changed).
  const all = runs(); delete all.tring.m; all.tring.dur = 60e3; q.run('UPDATE dash_class SET timers=? WHERE class_id=?', JSON.stringify(all), C.id);
  D.updateLayout(T, C, first.id, { widgets: withMinutes('tring', 9) });
  assert.equal(runs().tring.dur, 9 * 60e3);
  // The same minutes saved again: nothing changes (a preset run stays).
  D.timerAction(T, C, 'tring', { action: 'set', ms: 90e3 });
  D.updateLayout(T, C, first.id, { widgets: D.getLayout(first.id).widgets });
  assert.equal(runs().tring.dur, 90e3);
});

test('server: set with run keeps a running timer running from the new time; without, it stops at it; limits as before', () => {
  reset();
  const t0 = Date.now();
  D.timerAction(T, C, 'tring', { action: 'start' }, t0);
  let r = D.timerAction(T, C, 'tring', { action: 'set', ms: 510e3, run: true }, t0 + 10e3);
  assert.deepEqual({ dur: r.timer.dur, on: r.timer.on, start: r.timer.start, base: r.timer.base }, { dur: 510e3, on: true, start: t0 + 10e3, base: 0 });
  r = D.timerAction(T, C, 'tring', { action: 'set', ms: 300e3 }, t0 + 20e3);
  assert.deepEqual({ dur: r.timer.dur, on: r.timer.on }, { dur: 300e3, on: false });
  assert.equal(D.timerAction(T, C, 'tring', { action: 'set', ms: 180 * 60e3 + 1000 }).error, 'timer');
  assert.equal(D.timerAction(T, C, 'tring', { action: 'set', ms: 500 }).error, 'timer');
  // Run on a stopped timer: it stays stopped.
  r = D.timerAction(T, C, 'tring', { action: 'set', ms: 60e3, run: true });
  assert.equal(r.timer.on, false);
});

test('every language has the new words (Done, Saved, the tap hint, the field, the bad-time message, the time set)', () => {
  const en = tFor('en');
  for (const loc of ['en', 'de', 'ar', 'fr', 'es', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const t = tFor(loc), x = D.registryFor(t, 'teacher').types.find(y => y.id === 'timer');
    for (const k of ['editHint', 'editLabel', 'editBad', 'editSet']) {
      assert.ok(x.words[k] && !/^dash\./.test(x.words[k]), `${loc} ${k}`);
      if (loc !== 'en') assert.notEqual(x.words[k], D.registryFor(en, 'teacher').types.find(y => y.id === 'timer').words[k], `${loc} ${k} translated`);
    }
    assert.match(x.words.editSet, /\{time\}/, loc);
    for (const k of ['js.dash.side.done', 'js.dash.side.saved']) {
      assert.ok(t(k) && t(k) !== k, `${loc} ${k}`);
      if (loc !== 'en') assert.notEqual(t(k), en(k), `${loc} ${k} translated`);
    }
  }
});

// ---------------------------------------------------------------- in the browser
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

let env = null;
async function setup() {
  if (env) return env;
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  // desk: a laptop with a mouse; ipad: a tablet with touch (1024 x 768).
  const open = async (kind = 'desk') => {
    const ctx = await browser.newContext({ ...(kind === 'ipad' ? { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 800 } }), reducedMotion: 'reduce' });
    const [cn, cv] = cookieFor(T.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('[data-id="tring"] .dw-digits');
    return { page, ctx, errors };
  };
  env = { browser, open, done: async () => { await browser.close(); server.close(); } };
  return env;
}
test.after(async () => { if (env) await env.done(); });
const until = async (f, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (f()) return true; await new Promise(r => setTimeout(r, 100)); } return f(); };
const press = (page, kind, loc) => (kind === 'ipad' ? loc.tap() : loc.click());
const digitsOf = (page, id) => page.locator(`[data-id="${id}"] .dw-digits`).first().textContent();
/** The digits once they show this (a time set on the server shows when its answer comes). */
const shows = async (page, id, want) => { for (let i = 0; i < 40; i++) { if (await digitsOf(page, id) === want) return want; await page.waitForTimeout(100); } return digitsOf(page, id); };

test('settings sheet: new Starting minutes on a timer that has run are kept and shown, however the sheet closes (mouse and touch)', { skip, timeout: 240e3 }, async () => {
  const E = await setup();
  let n = 10;
  for (const kind of ['desk', 'ipad']) {
    for (const how of ['x', 'escape', 'backdrop', 'done', 'x-no-blur']) {
      reset();
      const { page, ctx, errors } = await E.open(kind);
      const w = page.locator('[data-id="tring"]');
      // The timer has run (Start, Reset): this is what the old page lost.
      await press(page, kind, w.locator('.dw-go')); await page.waitForTimeout(300); await press(page, kind, w.locator('.dw-reset'));
      await until(() => runs().tring && !runs().tring.on);
      await press(page, kind, w.locator('.dash-wgear'));
      const inp = page.locator('#dset-tring-minutes'); await inp.waitFor();
      const want = ++n;
      await press(page, kind, inp); await inp.fill(String(want));
      if (how === 'x') await press(page, kind, page.locator('.sheet .close'));
      else if (how === 'escape') await page.keyboard.press('Escape');
      else if (how === 'backdrop') { if (kind === 'ipad') await page.touchscreen.tap(1015, 10); else await page.mouse.click(1270, 10); }
      else if (how === 'done') await press(page, kind, page.locator('.sheet [data-bdone]'));
      // As Safari does on a tap: the button takes no focus, the field keeps it (and fires no change by itself).
      else await page.evaluate(() => { document.querySelector('.sheet .close').click(); });
      assert.equal(await page.locator('.sheet').count(), 0, `${kind} ${how}: closed`);
      assert.ok(await until(() => wOf('tring').s.minutes === want), `${kind} ${how}: saved ${wOf('tring').s.minutes}`);
      assert.equal(await digitsOf(page, 'tring'), `${want}:00`, `${kind} ${how}: shown at once`);
      await page.locator('.toast', { hasText: 'Saved' }).first().waitFor({ timeout: 3000 });
      assert.ok(await until(() => runs().tring.dur === want * 60e3), `${kind} ${how}: the run took the new time`);
      await page.reload(); await page.waitForSelector('[data-id="tring"] .dw-digits');
      assert.equal(await digitsOf(page, 'tring'), `${want}:00`, `${kind} ${how}: kept after a reload`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test('settings sheet: Done sits next to Undo, says "Saved" once the server has the change, and closes to the gear', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  reset();
  const { page, ctx, errors } = await E.open('ipad');
  await page.locator('[data-id="tdig"] .dash-wgear').tap();
  const sheet = page.locator('.sheet.dash-setsheet');
  const done = sheet.locator('[data-bdone]');
  assert.equal(await done.textContent(), 'Done');
  assert.equal(await sheet.locator('.dash-boardacts [data-bundo] ~ [data-bdone]').count(), 1);
  const status = sheet.locator('.dash-saved');
  assert.equal(await status.getAttribute('role'), 'status');
  assert.equal(await status.textContent(), '');
  // Typed, not left: kept as it is typed (no change event needed), and "Saved" shows.
  await sheet.locator('#dset-tdig-minutes').tap(); await sheet.locator('#dset-tdig-minutes').fill('7');
  await status.filter({ hasText: 'Saved' }).waitFor({ timeout: 4000 });
  assert.equal(wOf('tdig').s.minutes, 7);
  assert.equal(await digitsOf(page, 'tdig'), '7:00');
  // Out of range while typing waits; leaving the field brings it into range.
  await sheet.locator('#dset-tdig-minutes').fill('999');
  await page.waitForTimeout(900);
  assert.equal(wOf('tdig').s.minutes, 7);
  await done.tap();
  assert.ok(await until(() => wOf('tdig').s.minutes === 180));
  await page.locator('.toast', { hasText: 'Saved' }).first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('dash-wgear') && document.activeElement.closest('.dash-w').dataset.id), 'tdig');
  // Nothing changed: no "Saved" toast.
  await page.waitForTimeout(3000);
  await page.locator('[data-id="tdig"] .dash-wgear').tap(); await sheet.waitFor();
  await done.tap();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.toast', { hasText: 'Saved' }).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tap the time: the digits become a field; Enter sets it, Escape keeps the old one, a bad time says what to type', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  reset();
  const { page, ctx, errors } = await E.open('ipad');
  const w = page.locator('[data-id="tring"]');
  const dig = w.locator('button.dw-digbtn');
  assert.equal(await dig.count(), 1, 'the ring timer\'s digits are a button');
  assert.equal(await page.locator('[data-id="tdig"] button.dw-digbtn').count(), 1, 'the digits look too');
  assert.equal(await page.locator('[data-id="tsw"] button.dw-digbtn').count(), 0, 'never the stopwatch');
  assert.equal(await page.locator('[data-id="tsw"] .dw-digits[role="timer"]').count(), 1);
  assert.equal(await dig.getAttribute('data-tip'), 'Tap to change the time');
  assert.equal(await dig.getAttribute('aria-label'), '8:00 left');
  const hint = await dig.getAttribute('aria-describedby');
  assert.equal(await page.locator(`#${hint}`).textContent(), 'Tap to change the time');
  // Escape: the old time, the focus back on the digits.
  await dig.tap();
  const f = w.locator('input.dw-digin');
  await f.waitFor();
  assert.equal(await f.getAttribute('aria-label'), 'New time: minutes, or minutes:seconds');
  assert.equal(await f.inputValue(), '8:00');
  await f.fill('3'); await page.keyboard.press('Escape');
  assert.equal(await f.count(), 0);
  assert.equal(await digitsOf(page, 'tring'), '8:00');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('dw-digbtn')), true);
  assert.equal(await page.locator('.sheet').count(), 0);
  // A bad time: a message, the field stays, nothing saved.
  await page.keyboard.press('Enter');
  await f.waitFor();
  await f.fill('abc'); await page.keyboard.press('Enter');
  const msg = w.locator('.dw-digmsg');
  assert.equal(await msg.isVisible(), true);
  assert.equal(await msg.getAttribute('role'), 'alert');
  assert.match(await msg.textContent(), /8:30/);
  assert.equal(await f.getAttribute('aria-invalid'), 'true');
  assert.equal(await f.count(), 1);
  await f.fill('200'); await page.keyboard.press('Enter');
  assert.equal(await f.count(), 1, '200 minutes is over the limit');
  // m:ss: the run is set to it (the Starting minutes stay).
  await f.fill('8:30'); await page.keyboard.press('Enter');
  assert.equal(await f.count(), 0);
  assert.equal(await shows(page, 'tring', '8:30'), '8:30');
  assert.ok(await until(() => runs().tring && runs().tring.dur === 510e3));
  assert.equal(wOf('tring').s.minutes, 8);
  // Whole minutes: the Starting minutes change (saved with the layout).
  await dig.tap(); await f.fill('12'); await page.keyboard.press('Enter');
  assert.equal(await digitsOf(page, 'tring'), '12:00');
  assert.ok(await until(() => wOf('tring').s.minutes === 12 && runs().tring.dur === 12 * 60e3));
  // Leaving the field with a good time sets it; with a bad one keeps the old time.
  await dig.tap(); await f.fill('4:15'); await w.locator('.dash-wh').tap();
  assert.equal(await shows(page, 'tring', '4:15'), '4:15');
  await dig.tap(); await f.fill('xx'); await w.locator('.dash-wh').tap();
  assert.equal(await f.count(), 0);
  assert.equal(await digitsOf(page, 'tring'), '4:15');
  // Running: set and keep running from the new time.
  await w.locator('.dw-go').tap();
  assert.ok(await until(() => runs().tring.on));
  await dig.tap(); await f.fill('6'); await page.keyboard.press('Enter');
  assert.ok(await until(() => wOf('tring').s.minutes === 6 && runs().tring.dur === 6 * 60e3));
  assert.equal(runs().tring.on, true, 'still running');
  assert.match(await digitsOf(page, 'tring'), /^[56]:\d\d$/);
  // After a reload: the time set.
  await page.reload(); await page.waitForSelector('[data-id="tring"] .dw-digits');
  assert.match(await digitsOf(page, 'tring'), /^[56]:\d\d$/);
  // The projector: the digits do nothing.
  await w.locator('.dw-reset').tap();
  await page.evaluate(() => document.body.classList.add('dash-projector'));
  await page.locator('[data-id="tring"] button.dw-digbtn').tap();
  assert.equal(await page.locator('[data-id="tring"] input.dw-digin').count(), 0);
  await page.evaluate(() => document.body.classList.remove('dash-projector'));
  // Edit mode: the digits are not a button.
  await page.click('#dash-edit');
  assert.equal(await page.locator('[data-id="tring"] button.dw-digbtn').count(), 0);
  await page.click('#dash-done');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tap the time with a mouse and the keyboard on the digits look; students never get the button', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  reset();
  const { page, ctx, errors } = await E.open('desk');
  const dig = page.locator('[data-id="tdig"] button.dw-digbtn');
  await dig.focus(); await page.keyboard.press('Enter');
  const f = page.locator('[data-id="tdig"] input.dw-digin');
  await f.waitFor();
  await page.keyboard.press('Control+a'); await page.keyboard.type('2:05'); await page.keyboard.press('Enter');
  assert.equal(await shows(page, 'tdig', '2:05'), '2:05');
  assert.ok(await until(() => runs().tdig && runs().tdig.dur === 125e3));
  assert.deepEqual(errors, []);
  await ctx.close();
  // The page's own rule: only the teacher's countdown, never a copy, edit mode, a pinned widget (students) or the stopwatch.
  const src = fs.readFileSync('public/js/dash-widgets.js', 'utf8');
  assert.match(src, /const editable = down && ctx\.teacher && !ctx\.copy && !ctx\.editing && !ctx\.pinned;/);
});
