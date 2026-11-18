// Classroom dashboards: type the number between − and +, and a widget's settings from the board (docs/decisions.md
// "Classroom dashboards: type the number between − and +; settings from the board"). The parsing and the limits are pure
// (public/js/dash-num.js, the slope's text in public/js/dash-math.js); the field, the gear and the settings sheet are
// checked in the real page in Chromium (skipped where none is installed): typed values keep the widget's rules (clamped,
// the numerator never more than the denominator, Escape, a bad entry), go into the layout as a tapped one does, and only
// the class's teacher has a gear (never a student's screen, a pinned widget or edit mode).
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashinputs-`);

const N = await import('../../public/js/dash-num.js');
const M = await import('../../public/js/dash-math.js');

test('typed numbers: whole numbers, a minus (ASCII or −), decimals only when allowed; nothing else', () => {
  assert.equal(N.numParse('12'), 12);
  assert.equal(N.numParse(' 7 '), 7);
  assert.equal(N.numParse('-3'), -3);
  assert.equal(N.numParse('−3'), -3);
  for (const bad of ['', ' ', '-', 'abc', '1.5', '1,5', '12a', '1e3', '0x10', '++1', '5-']) assert.equal(N.numParse(bad), null, bad);
  assert.equal(N.numParse('1.25', { dec: 2 }), 1.25);
  assert.equal(N.numParse('1,25', { dec: 2 }), 1.25);
  assert.equal(N.numParse('.5', { dec: 2 }), 0.5);
  assert.equal(N.numParse('1.255', { dec: 2 }), null);
  assert.equal(N.numText(-4), '−4');
  assert.equal(N.numText(12), '12');
});

test('typed numbers: inside the limits is used while typing; outside is held to the nearest limit; not a number reverts', () => {
  assert.deepEqual(N.numDecide('8', 0, 50), { kind: 'ok', n: 8 });
  assert.deepEqual(N.numDecide('150', 1, 100), { kind: 'out', n: 150, clamped: 100 });
  assert.deepEqual(N.numDecide('0', 1, 100), { kind: 'out', n: 0, clamped: 1 });
  assert.deepEqual(N.numDecide('-20', -10, 10), { kind: 'out', n: -20, clamped: -10 });
  assert.deepEqual(N.numDecide('', 0, 10), { kind: 'bad' });
  assert.deepEqual(N.numDecide('x', 0, 10), { kind: 'bad' });
  // A tool's own parse (the slope: its place in the list).
  assert.deepEqual(N.numDecide('1/2', 0, M.SLOPES.length - 1, M.slopeOfText), { kind: 'ok', n: M.SLOPES.findIndex(s => s.n === 1 && s.d === 2) });
});

test('a typed slope is one of the slopes − and + step through (by value), else nothing', () => {
  const at = (n, d) => M.SLOPES.findIndex(s => s.n === n && s.d === d);
  assert.equal(M.slopeOfText('2'), at(2, 1));
  assert.equal(M.slopeOfText('−1/2'), at(-1, 2));
  assert.equal(M.slopeOfText('-3/2'), at(-3, 2));
  assert.equal(M.slopeOfText('2/4'), at(1, 2));
  assert.equal(M.slopeOfText('0.5'), at(1, 2));
  assert.equal(M.slopeOfText('0'), at(0, 1));
  for (const bad of ['7', '2/5', '1/0', 'x', '', '1/']) assert.equal(M.slopeOfText(bad), null, bad);
});

test('one shared field: every stepper with a number between − and + types through dash-num.js', () => {
  const src = f => fs.readFileSync(f, 'utf8');
  const tools = src('public/js/dash-tools.js'), tools4 = src('public/js/dash-tools4.js'), bars = src('public/js/dash-bars.js'), rods = src('public/js/dash-rods.js'), widgets = src('public/js/dash-widgets.js');
  assert.match(tools, /import \{ numField \} from '\.\/dash-num\.js'/);
  // Every T.stepper call passes the typed field's options (its 7th argument).
  for (const [f, s] of [['dash-tools.js', tools], ['dash-tools4.js', tools4]]) {
    const calls = s.split('T.stepper(').slice(1);
    assert.ok(calls.length >= 3, f);
    for (const c of calls) assert.match(c.slice(0, 900), /\{ (\.\.\.amount, )?value: \(\) =>/, `${f}: ${c.slice(0, 60)}`);
  }
  assert.match(bars, /T\.num\(\{ label, key, get, set/);
  // Number rods: the longer rod's length is a dropdown of 11 to 20 now ("Longer rod [20 ▾]", docs/decisions.md "one calm
  // row of buttons"), not a stepper: nothing of it is typed.
  assert.match(rods, /const longSel = selectOf\(Array\.from\(\{ length: R\.ROD_LONG\[1\] - R\.ROD_LONG\[0\] \+ 1 \}/);
  assert.match(rods, /longSel\.setAttribute\('aria-label', W\.longer\)/);
  assert.doesNotMatch(rods, /T\.num\(|T\.stepper\(/);
  assert.match(widgets, /numField\(\{ label: `\$\{nm\}: \$\{pointsWord\}`/);
  // The field is text with a numeric keyboard, a spinbutton, never a browser's own spinners.
  const num = src('public/js/dash-num.js');
  assert.match(num, /inp\.type = 'text'/); assert.match(num, /'numeric'/); assert.match(num, /setAttribute\('role', 'spinbutton'\)/);
  for (const bad of [/fetch\s*\(/, /localStorage|sessionStorage/, /innerHTML/]) assert.doesNotMatch(num, bad);
});

// ---------------------------------------------------------------- in the browser
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
// A browser is there when one starts (the pinned one, else Playwright's own, its headless shell included).
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

let env = null;
async function setup() {
  if (env) return env;
  const { config } = await import('../../server/config.js');
  config.anthropicKey = '';
  const { q } = await import('../../server/db.js');
  const { createUser, startSession, getUser } = await import('../../server/auth.js');
  const S = await import('../../server/services/schools.js');
  const D = await import('../../server/services/dash.js');
  const { createApp } = await import('../../server/app.js');
  const { tFor } = await import('../../server/i18n/index.js');
  const boss = createUser({ username: 'InBoss', password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Inputs School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
  const C = S.createClass(T, school.id, { name: 'Class 4B' }).class;
  const kid = getUser(S.createSchoolAccount(T, school.id, { rosterName: 'Kid' }).user.id); S.addToClass(boss, C.id, kid.id);
  q.run('UPDATE users SET display_name=? WHERE id=?', 'QuietPanda88', kid.id);
  D.ensureLayouts(T, C, tFor('en'));
  const first = D.layoutsOf(C.id, T.id)[0];
  const widgets = [
    { id: 'wfrac', type: 'fractions', x: 0, y: 0, w: 6, h: 8, s: { state: { tab: 'fdp', fdp: { n: 8, d: 50 } } } },
    { id: 'wclock', type: 'clock', x: 6, y: 0, w: 3, h: 2, s: { face: 'digital' }, pin: true },
    { id: 'wscore', type: 'score', x: 6, y: 2, w: 6, h: 3, s: { teams: 'Red\nBlue', scores: [3, 5] } },
    { id: 'wcoord', type: 'coord', x: 6, y: 5, w: 6, h: 6, s: { state: { mi: 15, b: 1 } } },
  ];
  D.updateLayout(T, C, first.id, { name: 'Test', widgets });
  D.useLayout(T, C, first.id);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const open = async (who, size = [1440, 900]) => {
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, reducedMotion: 'reduce' });
    const [cn, cv] = cookieFor(who.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('.dash-w');
    return { page, ctx, errors };
  };
  const layout = () => D.getLayout(first.id).widgets;
  const wOf = id => layout().find(w => w.id === id);
  env = { D, T, C, kid, first, server, browser, open, layout, wOf, done: async () => { await browser.close(); server.close(); } };
  return env;
}
test.after(async () => { if (env) await env.done(); });

const frac = '[data-id="wfrac"]';
const field = (page, name) => page.locator(`${frac} input.dash-num[aria-label="${name}"]`);
const fdpText = page => page.locator(`${frac} .dt-read .dt-sub`).first().textContent();
/** Wait for the layout to be saved (the page saves 700 ms after a change). */
const saved = async (E, id, test2) => { for (let i = 0; i < 40; i++) { if (test2(E.wOf(id))) return E.wOf(id); await new Promise(r => setTimeout(r, 100)); } return E.wOf(id); };

test('Fractions, fraction decimal percent: the numerator and denominator are typed, kept to the − and + rules, and saved', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  const { page, ctx, errors } = await open2(E);
  const num = field(page, 'Numerator'), den = field(page, 'Denominator');
  assert.equal(await num.inputValue(), '8'); assert.equal(await den.inputValue(), '50');
  assert.equal(await num.getAttribute('inputmode'), 'numeric');
  // The denominator typed as 12: on the way it is 1, which would pull the numerator to 1; the numerator comes back to 8.
  await den.click(); await page.keyboard.type('12');
  assert.equal(await den.inputValue(), '12');
  assert.equal(await num.inputValue(), '8');
  assert.match(await fdpText(page), /^8\/12 = /);
  // While typing, the value is used: 7 is smaller than 8, so the numerator comes down with it (as − does).
  await page.keyboard.press('Control+A'); await page.keyboard.type('7');
  assert.equal(await num.inputValue(), '7');
  // Escape: back to 50 and 8, as before typing.
  await page.keyboard.press('Escape');
  assert.equal(await den.inputValue(), '50'); assert.equal(await num.inputValue(), '8');
  // Out of the limits: 150 is held to 100 on Enter.
  await page.keyboard.press('Control+A'); await page.keyboard.type('150'); await page.keyboard.press('Enter');
  assert.equal(await den.inputValue(), '100');
  // Not a number: the last good value comes back on leaving the field.
  await page.keyboard.press('Control+A'); await page.keyboard.type('ab');
  assert.equal(await den.getAttribute('aria-invalid'), 'true');
  await num.click();
  assert.equal(await den.inputValue(), '100'); assert.equal(await den.getAttribute('aria-invalid'), null);
  // The numerator is never more than the denominator: 120 over 100 is 100.
  await page.keyboard.press('Control+A'); await page.keyboard.type('120'); await page.keyboard.press('Enter');
  assert.equal(await num.inputValue(), '100');
  // Empty: Enter puts the last good value back.
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
  assert.equal(await num.inputValue(), '100');
  // ArrowUp and ArrowDown step by one, within the limits.
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  assert.equal(await num.inputValue(), '98');
  await page.keyboard.press('ArrowUp');
  assert.equal(await num.inputValue(), '99');
  // The − and + buttons are still there and still work.
  await page.click(`${frac} .dt-step:has(input[aria-label="Numerator"]) .dt-pm >> nth=0`);
  assert.equal(await num.inputValue(), '98');
  assert.match(await fdpText(page), /^98\/100 = 0\.98 = 98%/);
  // Saved in the layout through the same path as the buttons (ctx.keep).
  const w = await saved(E, 'wfrac', x => x.s.state.fdp && x.s.state.fdp.n === 98 && x.s.state.fdp.d === 100);
  assert.deepEqual({ n: w.s.state.fdp.n, d: w.s.state.fdp.d }, { n: 98, d: 100 });
  assert.deepEqual(errors, []);
  await ctx.close();
});
async function open2(E) { return E.open(E.T); }

test('the scoreboard and the coordinate plane: typed points and a typed slope, saved; a widget drawn again keeps the typing', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  const { page, ctx, errors } = await E.open(E.T);
  const red = page.locator('[data-id="wscore"] input.dash-num').first();
  assert.equal(await red.getAttribute('aria-label'), 'Red: Points');
  await red.click(); await page.keyboard.type('42');
  // The scoreboard draws itself again on each change: the field is a new one, still focused, with what was typed.
  const now = page.locator('[data-id="wscore"] input.dash-num').first();
  assert.equal(await now.inputValue(), '42');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.numkey), 'score:wscore:0');
  await page.keyboard.type('0'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-id="wscore"] input.dash-num').first().inputValue(), '420');
  const w = await saved(E, 'wscore', x => x.s.scores[0] === 420);
  assert.equal(w.s.scores[0], 420);
  // A negative score: the ordinary keyboard (a number pad has no minus).
  assert.equal(await now.getAttribute('inputmode'), 'text');
  // The slope typed as a fraction from the list; one not on the list goes back.
  const slope = page.locator('[data-id="wcoord"] input.dash-num[aria-label="Slope"]');
  await slope.click(); await page.keyboard.press('Control+A');
  await page.keyboard.type('-1/2'); await page.keyboard.press('Enter');
  assert.equal(await slope.inputValue(), '−1/2');
  // "2/5" passes through 2 (a slope) on the way; it is not one, so the slope from before typing comes back.
  await page.keyboard.press('Control+A'); await page.keyboard.type('2/5');
  assert.equal(await slope.getAttribute('aria-invalid'), 'true');
  await page.keyboard.press('Tab');
  assert.equal(await slope.inputValue(), '−1/2');
  const c = await saved(E, 'wcoord', x => x.s.state.mi === M.SLOPES.findIndex(s => s.n === -1 && s.d === 2));
  assert.equal(M.SLOPES[c.s.state.mi].n, -1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('settings from the board: the teacher\'s gear opens that widget\'s settings, saves, undoes, and closes to the board', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  const { page, ctx, errors } = await E.open(E.T);
  // A gear on widgets with settings (the clock, the scoreboard), none on a tool (its settings are its own Options).
  assert.equal(await page.locator('[data-id="wclock"] .dash-wh .dash-wgear').count(), 1);
  assert.equal(await page.locator('[data-id="wscore"] .dash-wgear').count(), 1);
  assert.equal(await page.locator('[data-id="wfrac"] .dash-wgear').count(), 0);
  const gear = page.locator('[data-id="wclock"] .dash-wgear');
  assert.equal(await gear.getAttribute('aria-label'), 'Clock settings');
  // Keyboard: focus it and press Enter.
  await gear.focus(); await page.keyboard.press('Enter');
  const sheet = page.locator('.sheet.dash-setsheet');
  await sheet.waitFor();
  assert.equal(await sheet.locator('#sheet-title').textContent(), 'Clock settings');
  // The same form as edit mode, for this widget only, without moving or removing.
  assert.equal(await sheet.locator('#dset-wclock-face').count(), 1);
  assert.equal(await sheet.locator('#dset-wclock-pin').isChecked(), true);
  assert.equal(await sheet.locator('.dash-sideacts').count(), 0);
  assert.equal(await page.locator('#dash').evaluate(x => x.classList.contains('is-editing')), false);
  const undoB = sheet.locator('[data-bundo]');
  assert.equal(await undoB.isDisabled(), true);
  await sheet.locator('#dset-wclock-face').selectOption('analog');
  await page.locator('[data-id="wclock"] .dw-analog, [data-id="wclock"] svg').first().waitFor();
  let w = await saved(E, 'wclock', x => x.s.face === 'analog');
  assert.equal(w.s.face, 'analog');
  // Undo takes it back (and saves that too).
  assert.equal(await undoB.isDisabled(), false);
  await undoB.click();
  assert.equal(await sheet.locator('#dset-wclock-face').inputValue(), 'digital');
  w = await saved(E, 'wclock', x => x.s.face === 'digital');
  assert.equal(w.s.face, 'digital');
  assert.equal(await undoB.isDisabled(), true);
  // Pin off from the board: the layout (and so what students get) follows.
  await sheet.locator('#dset-wclock-pin').uncheck();
  w = await saved(E, 'wclock', x => !x.pin);
  assert.equal(!!w.pin, false);
  // Closing: the board, not edit mode, the focus on the gear.
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.sheet').count(), 0);
  assert.equal(await page.locator('#dash-lib').isHidden(), true);
  assert.equal(await page.locator('#dash-top').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('dash-wgear') && document.activeElement.closest('.dash-w').dataset.id), 'wclock');
  // Edit mode: no gears (its own panel is there).
  await page.click('#dash-edit');
  assert.equal(await page.locator('.dash-wgear').count(), 0);
  await page.click('#dash-done');
  assert.ok(await page.locator('.dash-wgear').count() >= 2);
  assert.deepEqual(errors, []);
  await ctx.close();
  // Put the pin back for the student test.
  E.D.updateLayout(E.T, E.C, E.first.id, { widgets: E.layout().map(x => (x.id === 'wclock' ? { ...x, pin: true } : x)) });
});

test('settings from the board: never on a student\'s screen (pinned or their own widgets, laptop and phone); the teacher\'s phone has it', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  E.D.saveStudent(E.kid, E.C, { widgets: [{ id: 'myclock', type: 'clock', x: 0, y: 6, w: 3, h: 2, s: {} }], pins: {} });
  for (const size of [[1366, 768], [390, 844]]) {
    const { page, ctx, errors } = await E.open(E.kid, size);
    assert.ok(await page.locator('.dash-w.is-pinned').count() >= 1, 'the pinned clock is there');
    assert.equal(await page.locator('.dash-w').count() >= 2, true);
    assert.equal(await page.locator('.dash-wgear').count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // The teacher's phone has it (always shown, faint, on a touch screen).
  const { page, ctx } = await E.open(E.T, [390, 844]);
  assert.ok(await page.locator('.dash-wgear').count() >= 2);
  await ctx.close();
});
