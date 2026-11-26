// Homeroom in a real browser (public/js/homeroom.js, public/css/homeroom.css), on a Chromebook (1366 x 768), a tablet
// and a phone: the board draws the teacher's area, the teacher's desk and a desk per student with their name; Fit shows
// every desk; nothing scrolls sideways; Arrange seats (a preset, then a desk dragged) and a sticky note in the teacher's
// area are saved for the class; the Oomba chat button is there. Skipped with no Chromium.
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

const boss = createUser({ username: 'HrbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lia', 'Max', 'Nia'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return u; });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/class/${cls.id}/hub`); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(300);
  return { ctx, page, errors };
}
/** Every desk's box inside the board's box (what Fit promises), and the page as wide as the screen. */
const fits = page => page.evaluate(() => {
  const b = document.getElementById('hr-board').getBoundingClientRect();
  const out = [...document.querySelectorAll('.hr-desk, .hr-area')].filter(el => { const r = el.getBoundingClientRect(); return r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1; }).length;
  return { out, scroll: document.documentElement.scrollWidth - innerWidth, desks: document.querySelectorAll('.hr-desk').length };
});

test('Chromebook, tablet and phone: every desk on the board, Fit shows them all, nothing scrolls sideways', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [vp, touch] of [[{ width: 1366, height: 768 }, false], [{ width: 820, height: 1180 }, true], [{ width: 390, height: 844 }, true]]) {
    const { ctx, page, errors } = await open(vp, touch);
    const f = await fits(page);
    assert.equal(f.desks, kids.length, `${vp.width}: a desk per student`);
    assert.equal(f.out, 0, `${vp.width}: Fit shows every desk and the teacher's area`);
    assert.ok(f.scroll <= 0, `${vp.width}: no sideways scroll`);
    for (const n of NAMES) assert.ok(await page.locator('.hr-desk .hr-name', { hasText: n }).count(), `${n}'s name above a desk`);
    assert.equal(await page.locator('.hr-area .rm-label', { hasText: 'Teacher\'s area · everyone can see this' }).count(), 1);
    assert.equal(await page.locator('.hr-tdesk').count(), 1);
    await page.waitForSelector('.oc-bubble', { timeout: 5000 });   // the Oomba chat button, as on every teacher page
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Arrange seats: a preset and a dragged desk are saved; a sticky note in the teacher\'s area too', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open({ width: 1366, height: 768 });
  await page.click('[data-hr="seats"]');
  await page.click('[data-hrpreset="pods"]'); await page.waitForTimeout(500);
  assert.equal(H.roomOf(cls.id).preset, 'pods');
  const before = H.roomOf(cls.id).seats[kids[0].id];
  const desk = page.locator(`.hr-desk[data-sid="${kids[0].id}"]`), b = await desk.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 80, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(700);
  const after = H.roomOf(cls.id).seats[kids[0].id];
  assert.ok(after.x > before.x && after.y > before.y, 'the desk moved where it was dropped');
  await page.click('[data-hr="seatsdone"]');
  // A sticky note: the tool, a tap in the teacher's area, words typed straight into it, Done.
  await page.click('[data-hrmode="note"]');
  const area = await page.locator('.hr-area').boundingBox();
  await page.mouse.click(area.x + area.width * 0.3, area.y + area.height * 0.4);
  await page.keyboard.type('Fractions warm-up');
  await page.click('#hr-seltools [data-hrsel="done"]'); await page.waitForTimeout(800);
  assert.deepEqual(H.roomOf(cls.id).area.__ann.notes.map(n => n.text), ['Fractions warm-up']);
  // Reloaded: the same seats and the note.
  await page.reload(); await page.waitForSelector('.hr-desk');
  assert.equal(await page.locator('.hr-area .mp-sticky', { hasText: 'Fractions warm-up' }).count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});
