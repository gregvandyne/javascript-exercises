// Homeroom is now the Hub, in a real browser (docs/decisions.md "Homeroom is now the Hub"): a crawl of the teacher's
// Hub page (before and while live, its menu open, the sign-in page), the student desk (live) and the projector page,
// with no visible "Homeroom" anywhere: the text, the title, and the words in aria-label, title, placeholder and alt.
// An old /class/:id/homeroom address lands on /class/:id/hub. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HubbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Hub Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
H.saveSeats(teacher, cls, { preset: 'pods', seats: {} });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport = { width: 1366, height: 768 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
/** Every word a person can see or hear on the page that says Homeroom. */
const homeroomSeen = page => page.evaluate(() => {
  const out = [];
  if (/homeroom/i.test(document.title)) out.push(`title: ${document.title}`);
  if (/homeroom/i.test(document.body.innerText)) out.push(...document.body.innerText.split('\n').filter(l => /homeroom/i.test(l)).map(l => `text: ${l}`));
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(a); if (v && /homeroom/i.test(v)) out.push(`${a}: ${v}`); }
  }
  return out;
});

test('the teacher\'s Hub, the student desk and the projector: no visible Homeroom; the tab reads Hub; links go to /hub', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  // An old address lands on the new one.
  const T = await open(teacher, `/class/${cls.id}/homeroom`);
  await T.page.waitForSelector('.hr-desk');
  assert.equal(new URL(T.page.url()).pathname, `/class/${cls.id}/hub`);
  assert.match(await T.page.title(), /^Room 9 · Hub/);
  assert.equal((await T.page.textContent('.hr-tabs [aria-current="page"]')).trim(), 'Hub');
  assert.equal(await T.page.locator('[data-hr="golive"]', { hasText: 'Everyone to the Hub' }).count(), 1, 'the button says Everyone to the Hub');
  assert.deepEqual(await homeroomSeen(T.page), [], 'the Hub before class');
  await T.page.click('[data-hr="menu"]');
  const proj = T.page.locator('#hr-menu a[href$="/hub/projector"]');
  assert.equal(await proj.count(), 1, 'the projector link points to /hub/projector');
  assert.deepEqual(await homeroomSeen(T.page), [], 'the menu');
  await T.page.keyboard.press('Escape');
  // Live class: the teacher's bar, then the desk and the projector.
  await T.page.click('[data-hr="golive"]');
  await T.page.waitForSelector('#hr-live:not([hidden])');
  assert.ok(H.liveOf(cls.id));
  assert.deepEqual(await homeroomSeen(T.page), [], 'the Hub while live');
  const D = await open(kids[0], `/class/${cls.id}/desk`);
  await D.page.waitForSelector('.hd-desk'); await D.page.waitForTimeout(500);
  assert.deepEqual(await homeroomSeen(D.page), [], 'the student desk');
  const P = await open(teacher, `/class/${cls.id}/hub/projector`, { width: 1280, height: 720 });
  await P.page.waitForTimeout(800);
  assert.deepEqual(await homeroomSeen(P.page), [], 'the projector');
  const SI = await open(teacher, `/class/${cls.id}/homeroom/signin`);
  assert.equal(new URL(SI.page.url()).pathname, `/class/${cls.id}/hub/signin`);
  assert.deepEqual(await homeroomSeen(SI.page), [], 'the sign-in page');
  for (const x of [T, D, P, SI]) { assert.deepEqual(x.errors, []); await x.ctx.close(); }
  H.setLive(teacher, cls, 'end');
});
