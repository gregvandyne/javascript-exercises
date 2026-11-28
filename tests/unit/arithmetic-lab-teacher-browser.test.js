// Arithmetic Lab for a teacher, on the real site in Chromium (docs/decisions.md "Arithmetic Lab: the owner's playthrough,
// 28 Nov 2026"): the play page shows "Loading Arithmetic Lab…" at once, dark, until the game is there; the game page's
// Assign goes straight into the game to make an activity, whose Save and assign opens the Assign page for it; the
// teacher's own name for it is the lesson's title on the Assign page, the class page and the progress page, with
// "Long division, 16 problems, Guided" under it; a class with no students shows a faded sample row; the game page's
// About text is whole. The editor's labeled way back stays in the game. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const { importGame } = await import('../../scripts/import-game.js');
const games = await import('../../server/services/games.js');
const gameSets = await import('../../server/services/game-sets.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const BL = await import('../../tools/box-by-box/src/lib/logic.ts');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.ARITH_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const boss = createUser({ username: 'AlpBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Testy University' }).school;
const teacher = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
const cls = S.createClass(boss, school.id, { name: '4b math', teacherId: teacher.id }).class;
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
// the real game, imported as the seed does (and imported again, as an update does: its About text stays whole)
importGame(path.join(ROOT, 'seed-games/arithmetic-lab.html'), path.join(ROOT, 'seed-games/arithmetic-lab.json'), official.id);
const LAB = importGame(path.join(ROOT, 'seed-games/arithmetic-lab.html'), path.join(ROOT, 'seed-games/arithmetic-lab.json'), official.id);
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/arithmetic-lab.json'), 'utf8'));
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(viewport = { width: 1280, height: 800 }, o = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}), ...o });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { ctx, page, errors };
}

test('the game page’s About text is whole, in every language (the seed import no longer cuts it at 600 characters)', () => {
  const g = games.getGame(LAB.id);
  assert.equal(g.description, META.description, 'the English, every word');
  assert.match(g.description, /and decimal numbers for all four\.$/);
  for (const [loc, x] of Object.entries(META.l10n)) assert.equal(games.localizeGame(g, loc).description, x.description, loc);
});

test('the play page says "Loading Arithmetic Lab…" at once, dark, and takes it away once the game is there', { skip, timeout: 120e3 }, async () => {
  for (const scheme of ['light', 'dark']) {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { colorScheme: scheme });
    // the game's page held back a moment, as on a slow school network
    let release; const held = new Promise(r => (release = r));
    await page.route('**/frame/**', async route => { await held; await route.continue(); });
    await page.goto(`${BASE}/play/arithmetic-lab`, { waitUntil: 'domcontentloaded' });
    const load = page.locator('#stage-load');
    assert.ok(await load.isVisible(), 'shown before the game');
    assert.equal(await load.getAttribute('role'), 'status');
    assert.equal((await load.innerText()).trim(), 'Loading Arithmetic Lab…');
    const bg = await load.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(bg, 'rgb(20, 20, 20)', `the play page's ink, not a white frame (${scheme})`);
    const fr = await page.locator('#gameframe').boundingBox(), lb = await load.boundingBox();
    assert.ok(lb.width >= fr.width - 1 && lb.height >= fr.height - 1, 'over the whole frame');
    if (scheme === 'dark') await shot(page, 'loading');
    release();
    await load.waitFor({ state: 'detached', timeout: 60e3 });
    await page.frameLocator('#gameframe').getByRole('button', { name: /I’m a teacher/ }).waitFor();
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Assign goes straight into making an activity; its own name is the lesson’s title on every page, the label under it', { skip, timeout: 180e3 }, async () => {
  const { ctx, page, errors } = await open();
  await page.goto(`${BASE}/g/arithmetic-lab`);
  await page.locator(`a[href="/teach/assign?id=${LAB.id}"]`).first().click();
  await page.waitForURL(/\/play\/arithmetic-lab\?mode=assign$/);
  const f = page.frameLocator('#gameframe');
  await f.getByText('Choose an activity to assign, or make a new one.').waitFor();
  await shot(page, 'assign-straight');
  await f.getByRole('menuitem').first().click();
  // (kept once it changes: opening the editor and leaving makes no blank card, audit 4)
  await f.getByRole('textbox', { name: /title/i }).fill('4b math - Long division test 27 Nov');
  // the editor's way back is labeled, and stays in the game
  await f.locator('.back-list').click();
  await f.getByRole('heading', { name: 'Your activities' }).waitFor();
  assert.match(page.url(), /\/play\/arithmetic-lab\?mode=assign$/, 'still in the game');
  await f.locator('.card .open').first().click();
  await f.getByRole('textbox', { name: /title/i }).waitFor();
  await f.getByRole('button', { name: 'Save and assign' }).click();
  await page.waitForURL(/\/teach\/assign\?game=arithmetic-lab&opts=chapter%3Ds-/, { timeout: 30e3 });
  const lead = await page.locator('.assign-game .lead').innerText();
  assert.equal(lead, 'Students open: 4b math - Long division test 27 Nov');
  assert.equal(await page.locator('.assign-game .assign-sub').innerText(), 'Long division, 16 problems, Guided');
  await shot(page, 'teacher-title-assign');
  await page.locator('#ag-go').click();
  await page.waitForURL(/\/class\/[^/?]+(\?|$)/);
  const row = page.locator('.cl-row').first();
  assert.match(await row.locator('b').innerText(), /4b math - Long division test 27 Nov/);
  assert.equal(await row.locator('.cl-sub').innerText(), 'Long division, 16 problems, Guided');
  await shot(page, 'teacher-title-class');
  await row.locator('.cl-main').click();
  await page.waitForURL(/\/progress\//);
  assert.equal(await page.locator('.lphead h2').innerText(), '4b math - Long division test 27 Nov');
  assert.equal(await page.locator('.lphead .lp-sub').innerText(), 'Long division, 16 problems, Guided');
  // no students yet: a faded sample row shows what each student's row will have
  const sample = page.locator('tr.gb-sample');
  assert.equal(await sample.count(), 1);
  assert.equal(await sample.locator('th').innerText(), 'Sample student');
  assert.match(await sample.innerText(), /2 step fixes/);
  assert.match(await page.locator('.gb-sample-note').innerText(), /each student’s row looks like this once they start/);
  await shot(page, 'teacher-title-progress');
  assert.deepEqual(errors, []);
  await ctx.close();
  // a phone: the class page's row and the progress page fit, title and label
  const p = await open({ width: 390, height: 844 });
  await p.page.goto(`${BASE}/class/${cls.id}?view=assigned`);
  assert.match(await p.page.locator('.lib-row .lib-sub').first().innerText(), /Long division, 16 problems, Guided/);
  assert.ok(await p.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.ctx.close();
});

test('a student who answers every problem and leaves before See the score is done, with the score (audit 4, Job 4)', { skip, timeout: 180e3 }, async () => {
  // a 2 problem Guided set, assigned as a lesson step
  const item = { k: 'divide', p: [[84, 4], [96, 3]], l: 'guided' };
  const set = gameSets.save(LAB.id, teacher.id, [item], null, 'arithmetic-lab', { title: 'Two problems' }).id;
  const lesson = L.createLesson(teacher, school.id, { title: 'Two problems' }).lesson;
  const step = L.addStep(teacher, lesson.id, { kind: 'game', gameId: LAB.id, options: `chapter=${set}&lock=1`, body: 'Play it' }).step;
  const cl = L.assign(teacher, cls.id, lesson.id, {}).classLesson;
  const kid = S.createSchoolAccount(teacher, school.id, { rosterName: 'Kim Pupil' }).user; S.addToClass(teacher, cls.id, kid.id);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const [name, value] = cookieOf(kid.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/play/arithmetic-lab?chapter=${set}&lock=1&lesson=${cl.id}&step=${step.id}`);
  const f = page.frameLocator('#gameframe');
  await f.getByRole('button', { name: 'Start', exact: true }).click();
  const act = BL.parseItem(item);
  const frame = await (await page.locator('#gameframe').elementHandle()).contentFrame();
  for (const p of item.p) {
    const right = BL.correctValues(BL.sheetFor(act, p));
    for (let n = 0; n < 60 && !(await f.locator('.feedback').count()); n++) {
      if (await f.locator('button.bring').count()) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); continue; }
      const box = await frame.evaluate(() => document.activeElement?.dataset?.box ?? '');
      if (box) await page.keyboard.type(right[box]);
      else await f.getByRole('button', { name: 'Check', exact: true }).click();
      await page.waitForTimeout(150);
    }
    // started (with the score so far) from the first problem on
    if (p === item.p[0]) {
      for (let i = 0; i < 40 && !(P.get(cl.id, step.id, kid.id) || {}).label; i++) await page.waitForTimeout(100);
      const r = P.get(cl.id, step.id, kid.id);
      assert.deepEqual([r.status, r.score, r.label], ['started', 1, 'part:1/2']);
      await f.locator('.feedback .btn-primary').click();
    }
  }
  // the last problem is checked; the student leaves without See the score
  for (let i = 0; i < 40 && (P.get(cl.id, step.id, kid.id) || {}).status !== 'done'; i++) await page.waitForTimeout(100);
  await page.goto(`${BASE}/`);
  const r = P.get(cl.id, step.id, kid.id);
  assert.deepEqual([r.status, r.score, r.label], ['done', 2, ''], 'done, with the score');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the teacher sees it done with its score on the lesson's progress page, never "not started"
  const t = await open();
  await t.page.goto(`${BASE}/class/${cls.id}/progress/${cl.id}`);
  const row = t.page.locator('tr', { hasText: 'Kim Pupil' }).first();
  assert.match(await row.innerHTML(), /st-done/);
  assert.match(await row.locator('.st-score').innerText(), /^2/);
  await t.ctx.close();
});
