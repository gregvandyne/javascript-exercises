// Three Classroom Dashboard fixes found while filming the promo, in a real browser (docs/decisions.md "Classroom
// dashboards: Eyes up on top, class lists on a layout switch, sent tools' names"):
// 1. Eyes up covers a student's open tool sheet (and a tool filling the screen, and a question box) on a phone, nothing
//    under it can be pressed, and the sheet is there as it was once the teacher ends it.
// 2. Switching layouts never shows "No students" in the scoreboard or class jobs while the class's list is on its way.
// 3. A sent tool reaches students with the title of the teacher's widget ("Shape board", not its mode, "Geoboard").
// DASH_FILM_SHOTS=<dir> also saves screenshots there (DASH_FILM_TAG names them, "after" by default).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashfilm-`);

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

let pw = null;
try { pw = await import('playwright'); } catch { try { pw = await import('@playwright/test'); } catch { pw = null; } }
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium'].find(p => p && fs.existsSync(p));
const launch = async () => { try { return await pw.chromium.launch(); } catch (e) { if (exe) return pw.chromium.launch({ executablePath: exe }); throw e; } };
let haveBrowser = false;
if (pw) { try { const b = await launch(); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';
const SHOTS = process.env.DASH_FILM_SHOTS || '', TAG = process.env.DASH_FILM_TAG || 'after';
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${TAG}-${name}.png`) }); };

const en = tFor('en');
const boss = createUser({ username: 'FilmBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Film School' }).school;
const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user.id);
const C = S.createClass(T, school.id, { name: 'Room 12 Rockets' }).class;
const kids = Array.from({ length: 20 }, (_, i) => { const u = S.createSchoolAccount(T, school.id, { rosterName: `Kid ${i + 1}` }).user; S.addToClass(T, C.id, u.id); return getUser(u.id); });
D.ensureLayouts(T, C, en);
const size = id => D.WIDGETS.find(w => w.id === id).size;
const W = (id, type, x, y, s = {}) => ({ id, type, x, y, w: size(type)[0], h: size(type)[1], s });
const tools = D.createLayout(T, C, { name: 'Math tools', widgets: [W('gb1', 'geoboard', 0, 0), W('gb2', 'geoboard', 0, 8, { state: { tab: 'angle' } }), W('fr1', 'fractions', 8, 0, { state: { tab: 'fdp' } }), W('pa1', 'pattern', 6, 8, { state: { tab: 'solids' } })] }).layout;
const every = D.createLayout(T, C, { name: 'Everyday', widgets: [W('sc1', 'score', 0, 0, { mode: 'students' }), W('jb1', 'jobs', 5, 0)] }).layout;
assert.ok(tools && every);
const useTools = () => D.useLayout(T, C, tools.id);

let env = null;
async function setup() {
  if (env) return env;
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const browser = await launch();
  const open = async (user, kind) => {
    const ctx = await browser.newContext({ ...(kind === 'phone' ? pw.devices['iPhone 13'] : { viewport: { width: 1366, height: 800 } }), reducedMotion: 'reduce' });
    const [cn, cv] = cookieFor(user.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('#dash');
    return { page, ctx, errors };
  };
  env = { browser, open, done: async () => { await browser.close(); server.close(); } };
  return env;
}
test.after(async () => { if (env) await env.done(); });
const until = async (f, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await new Promise(r => setTimeout(r, 100)); } return f(); };
const sendTool = ref => { const r = D.push(T, C, { kind: 'tool', ref }); assert.ok(r && !r.error, JSON.stringify(r)); return r; };

test('a sent tool reaches students with the title of the teacher\'s widget, whichever mode it is in', { skip, timeout: 120e3 }, async () => {
  useTools();
  const E = await setup();
  const teacher = await E.open(T, 'desk');
  await teacher.page.waitForSelector('.dash-w[data-id="gb1"]');
  const titleOf = id => teacher.page.locator(`.dash-w[data-id="${id}"] .dash-wt`).textContent();
  const want = { gb1: await titleOf('gb1'), gb2: await titleOf('gb2'), fr1: await titleOf('fr1'), pa1: await titleOf('pa1') };
  assert.deepEqual(want, { gb1: 'Shape board', gb2: 'Shape board', fr1: 'Fractions', pa1: 'Geometry' });
  for (const id of ['pa1', 'fr1', 'gb2', 'gb1']) sendTool(id);   // gb1 last: the banner
  const kid = await E.open(kids[0], 'phone');
  const { page } = kid;
  await until(async () => (await page.locator('#dash-banner b').count()) > 0);
  const banner = (await page.locator('#dash-banner b').textContent()).trim();
  await page.locator('#dash-tray-btn').tap();
  const tray = (await page.locator('#dash-traylist .dash-trayrow b').allTextContents()).map(x => x.trim());
  await shot(page, 'title-tray');
  await page.locator('#dash-tray-close').tap();
  await page.locator('#dash-banner a.btn-hot').tap();
  await page.waitForSelector('.sheet .dash-wcopy');
  const sheetTitle = (await page.locator('#sheet-title').textContent()).trim();
  await shot(page, 'title-sheet');
  assert.equal(banner, want.gb1, 'the banner');
  assert.deepEqual(tray, [want.gb1, want.gb2, want.fr1, want.pa1], 'the tray, newest first');
  assert.equal(sheetTitle, want.gb1, 'the student\'s copy');
  for (const t of [banner, ...tray, sheetTitle]) assert.doesNotMatch(t, /Geoboard|Angle maker|Fraction, decimal|3D shapes/);
  assert.deepEqual(kid.errors, []);
  await kid.ctx.close(); await teacher.ctx.close();
});

test('Eyes up covers a student\'s open tool sheet on a phone, blocks it, and leaves it as it was', { skip, timeout: 120e3 }, async () => {
  useTools(); D.setEyes(T, C, false);
  const E = await setup();
  sendTool('gb1');
  const kid = await E.open(kids[1], 'phone');
  const { page } = kid;
  await until(async () => (await page.locator('#dash-banner a.btn-hot').count()) > 0);
  await page.locator('#dash-banner a.btn-hot').tap();
  await page.waitForSelector('.sheet .dash-wcopy .gb-svg');
  // Something to find again afterwards: the sheet scrolled a little and a mark on the copy.
  await page.evaluate(() => { const s = document.querySelector('.sheet'); s.dataset.mark = 'kept'; s.scrollTop = 30; window.__clicks = 0; document.querySelector('.sheet-bg').addEventListener('click', () => { window.__clicks++; }, true); });
  const before = await page.evaluate(() => ({ html: document.querySelector('.sheet .dash-wcopy').innerHTML.length, top: document.querySelector('.sheet').scrollTop }));
  D.setEyes(T, C, true);
  await until(() => page.evaluate(() => document.querySelector('#dash-eyes').open), 9000);
  await page.waitForTimeout(300);
  await shot(page, 'eyes-sheet');
  const vp = page.viewportSize();
  // What is on top at the middle and the four corners: the Eyes up card, everywhere.
  const tops = await page.evaluate(([w, h]) => [[w / 2, h / 2], [4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4], [w / 2, h - 60]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#dash-eyes')); }), [vp.width, vp.height]);
  // Taps on the sheet's ✕ and on the tool, and Escape: none reach the sheet.
  const close = await page.locator('.sheet-bg .close').boundingBox();
  await page.touchscreen.tap(close.x + close.width / 2, close.y + close.height / 2);
  const svg = await page.locator('.sheet .dash-wcopy .gb-svg').boundingBox();
  await page.touchscreen.tap(svg.x + svg.width / 2, svg.y + svg.height / 2);
  await page.mouse.click(svg.x + 20, svg.y + 20);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const during = await page.evaluate(() => ({ sheet: !!document.querySelector('.sheet[data-mark="kept"]'), eyes: document.querySelector('#dash-eyes').open, clicks: window.__clicks, modal: document.querySelector('#dash-eyes').matches(':modal') }));
  assert.deepEqual(tops, [true, true, true, true, true, true], 'the card is on top everywhere');
  assert.deepEqual(during, { sheet: true, eyes: true, clicks: 0, modal: true }, 'nothing under the card can be pressed, Escape does nothing');
  // The teacher ends it: the sheet is there as it was, and works.
  D.setEyes(T, C, false);
  await until(() => page.evaluate(() => !document.querySelector('#dash-eyes').open), 9000);
  await page.waitForTimeout(200);
  await shot(page, 'eyes-after');
  const after = await page.evaluate(() => ({ html: document.querySelector('.sheet .dash-wcopy').innerHTML.length, top: document.querySelector('.sheet').scrollTop, mark: document.querySelector('.sheet').dataset.mark }));
  assert.deepEqual(after, { ...before, mark: 'kept' });
  await page.locator('.sheet-bg .close').tap();
  assert.equal(await page.locator('.sheet-bg').count(), 0, 'the sheet closes once Eyes up is over');
  assert.deepEqual(kid.errors, []);
  await kid.ctx.close();
});

test('Eyes up also covers a tool filling the screen and a question box opened over the sheet', { skip, timeout: 120e3 }, async () => {
  useTools(); D.setEyes(T, C, false);
  const E = await setup();
  const kid = await E.open(kids[2], 'phone');
  const { page } = kid;
  await until(async () => (await page.locator('#dash-banner a.btn-hot').count()) > 0);
  await page.locator('#dash-banner a.btn-hot').tap();
  await page.waitForSelector('.sheet .dash-wcopy .gb-svg');
  // The copy fills the screen (the Fullscreen API where the browser lets it, else the widget filling the window), and a
  // question box (app.js ask(), a <dialog> in the top layer) is open over it.
  await page.evaluate(async () => {
    const c = document.querySelector('.sheet .dash-wcopy');
    try { await c.requestFullscreen(); } catch { /* no gesture here */ }
    if (document.fullscreenElement !== c) { c.classList.add('gb-max'); document.documentElement.classList.add('gb-maxed'); }
    const d = document.createElement('dialog'); d.id = 'other'; d.innerHTML = '<p>Question</p><button>OK</button>'; document.body.appendChild(d); d.showModal();
  });
  D.setEyes(T, C, true);
  await until(() => page.evaluate(() => document.querySelector('#dash-eyes').open), 9000);
  await page.waitForTimeout(300);
  await shot(page, 'eyes-full');
  const vp = page.viewportSize();
  const tops = await page.evaluate(([w, h]) => [[w / 2, h / 2], [4, 4], [w - 4, h - 4]].map(([x, y]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#dash-eyes')); }), [vp.width, vp.height]);
  assert.deepEqual(tops, [true, true, true]);
  const kept = await page.evaluate(() => ({ other: document.querySelector('#other').open, full: !!document.fullscreenElement || document.querySelector('.dash-wcopy').classList.contains('gb-max') }));
  assert.deepEqual(kept, { other: true, full: true }, 'what was open under it stays open');
  D.setEyes(T, C, false);
  await until(() => page.evaluate(() => !document.querySelector('#dash-eyes').open), 9000);
  assert.equal(await page.evaluate(() => document.querySelector('#other').open), true);
  assert.deepEqual(kid.errors, []);
  await kid.ctx.close();
});

test('switching layouts never shows "No students" in the scoreboard or class jobs while the names are on their way', { skip, timeout: 120e3 }, async () => {
  useTools();
  const E = await setup();
  const teacher = await E.open(T, 'desk');
  const { page } = teacher;
  await page.waitForSelector('.dash-w[data-id="gb1"]');
  // Everything the board ever says while it switches, from the first frame.
  await page.evaluate(() => {
    window.__empty = [];
    const words = [/No students in this class yet/, /No students yet/];
    const look = () => { const g = document.querySelector('#dash'); const txt = g ? g.innerText : ''; for (const w of words) if (w.test(txt)) window.__empty.push(String(w)); };
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  // A slow school network: every live check takes 1.2 s from here on, so what the widgets say meanwhile shows.
  await page.route('**/live', async r => { await new Promise(ok => setTimeout(ok, 1200)); await r.continue().catch(() => {}); });
  const t0 = Date.now();
  await page.locator('#dash-layouts .chip', { hasText: 'Everyday' }).click();
  await page.waitForSelector('.dash-w[data-id="jb1"]');
  await page.waitForTimeout(300);
  await shot(page, 'switch');
  const waiting = await page.evaluate(() => ({ score: document.querySelector('.dash-w[data-id="sc1"]').innerText, jobs: document.querySelector('.dash-w[data-id="jb1"]').innerText }));
  const names = () => page.evaluate(() => ({ score: document.querySelectorAll('.dash-w[data-id="sc1"] .dw5-prow').length, jobs: document.querySelectorAll('.dash-w[data-id="jb1"] .dw5-jobwho.dw5-iso').length }));
  await until(async () => { const n = await names(); return n.score === 20 && n.jobs > 0; }, 8000);
  const took = Date.now() - t0;
  await shot(page, 'switch-done');
  const empty = await page.evaluate(() => window.__empty);
  assert.deepEqual(empty, [], 'never the empty state');
  // Meanwhile: a neutral line, no total of 0 and no job left "Open".
  assert.match(waiting.score, /Getting the class list…/); assert.doesNotMatch(waiting.score, /Class total/);
  assert.match(waiting.jobs, /Getting the class list…/); assert.doesNotMatch(waiting.jobs, /\bOpen\b/);
  const n = await names();
  assert.equal(n.score, 20); assert.ok(n.jobs > 0);
  assert.ok(took < 3000, `the names came at once (${took} ms), not with the next check`);
  assert.deepEqual(teacher.errors, []);
  await teacher.ctx.close();
});
