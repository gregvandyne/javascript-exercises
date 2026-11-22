// Figures answer types in a real browser (public/js/figures-sheet.js, views/figures-step.js, public/js/lesson-read.js):
// in the worksheet builder a question switches to Multiple choice, options are typed, added, removed and one marked
// right (saved on the server, the preview's key says its letter), the print page letters the options; on the student's
// lesson step the options are radio buttons the arrow keys move between, the ± button flips a number's sign, and Hand in
// marks both; after the due date the right option is marked. No sideways scroll on a phone. FIG_SHOTS=<dir> saves
// pictures (deviceScaleFactor 2). Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const F = await import('../../server/services/figures.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigChoiceB', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Choice Browser Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: 'Grade 9 Science' }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Kim Kid' }).user.id);
S.addToClass(boss, A.id, kid.id);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
const LAPTOP = () => ({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
async function open(who, path, opts = LAPTOP()) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const saved = page => page.waitForResponse(r => /\/items\/[^/]+$/.test(r.url()) && r.request().method() === 'POST' && r.status() === 200);

test('the builder: Multiple choice, options typed, added, removed and marked right; print letters them', { skip }, async () => {
  const id = F.createWorksheet(boss, { title: 'Cells and markets', grade: '9', items: [{ kind: 'pedigree', gen: 'pedigree', seed: 7932 }, { kind: 'triangle', data: { AB: 3, BC: 4, B: 90 }, question: 'What kind of triangle is this?' }] }).id;
  const t = await open(boss, `/figures/worksheets/${id}`);
  await t.page.waitForSelector('.fg-item:nth-child(2)');
  // The generator's question is multiple choice already, its right option from the figure.
  const first = t.page.locator('.fg-item').nth(0);
  assert.equal(await first.locator('[data-atype][value="choice"]').isChecked(), true);
  assert.deepEqual(await first.locator('[data-otext]').evaluateAll(xs => xs.map(x => x.value)), ['autosomal dominant', 'autosomal recessive', 'X-linked recessive']);
  assert.equal(await first.locator('[data-oright][value="1"]').isChecked(), true);
  assert.match(await first.textContent(), /worked out from the figure/);
  // The triangle: switch to Multiple choice, two blank options to fill in.
  const tri = () => t.page.locator('.fg-item').nth(1);
  await Promise.all([saved(t.page), tri().locator('[data-atype][value="choice"]').check()]);
  await t.page.waitForSelector('.fg-item:nth-child(2) [data-otext]');
  assert.equal(await tri().locator('[data-otext]').count(), 2);
  assert.equal(await tri().getByRole('group', { name: /Options/ }).count(), 1, 'a fieldset with its legend');
  await tri().locator('[data-otext]').nth(0).fill('acute');
  await Promise.all([saved(t.page), tri().locator('[data-otext]').nth(0).press('Tab')]);
  await tri().locator('[data-otext]').nth(1).fill('right');
  await Promise.all([saved(t.page), tri().locator('[data-otext]').nth(1).press('Tab')]);
  await tri().locator('[data-act="oadd"]').click();
  assert.equal(await t.page.evaluate(() => document.activeElement.matches('[data-otext]')), true, 'Add option puts the keyboard in the new box');
  await t.page.keyboard.type('obtuse');
  await Promise.all([saved(t.page), t.page.keyboard.press('Tab')]);
  await tri().locator('[data-act="oadd"]').click();
  await t.page.keyboard.type('scalene');
  await Promise.all([saved(t.page), t.page.keyboard.press('Tab')]);
  await Promise.all([saved(t.page), tri().locator('[data-oright][value="1"]').check()]);
  await t.page.waitForFunction(() => /B\) right/.test(document.querySelectorAll('.fg-item')[1].textContent));
  await Promise.all([saved(t.page), tri().locator('[data-act="odel"][data-k="3"]').click()]);
  let it = F.itemsOf(id)[1];
  assert.deepEqual([it.answerType, it.choices, it.correct, it.answer], ['choice', ['acute', 'right', 'obtuse'], 1, 'B) right']);
  // The preview's key marks it; the print page letters the options.
  await t.page.click('[data-tab="key"]');
  await t.page.waitForSelector('#fg-paper .fgp-right');
  assert.match(await t.page.textContent('#fg-paper .fgp-q:nth-child(2) .fgp-kans'), /B\) right/);
  await t.page.click('[data-tab="sheet"]');
  await tri().scrollIntoViewIfNeeded();
  await shot(t.page, 'builder-multiple-choice');
  if (SHOTS) await tri().screenshot({ path: `${SHOTS}/builder-multiple-choice-question.png` });
  // Back to Number: the options are kept for later.
  await Promise.all([saved(t.page), tri().locator('[data-atype][value="number"]').check()]);
  assert.equal(await tri().locator('[data-otext]').count(), 0);
  it = F.itemsOf(id)[1]; assert.deepEqual([it.answerType, it.choices], ['number', ['acute', 'right', 'obtuse']]);
  await Promise.all([saved(t.page), tri().locator('[data-atype][value="choice"]').check()]);
  assert.equal(F.itemsOf(id)[1].answer, 'B) right');
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
  const p = await open(boss, `/figures/worksheets/${id}/print?key=1`);
  await p.page.waitForSelector('.fgp-key .fgp-right');
  assert.equal(await p.page.locator('.fgp-page:not(.fgp-key) .fgp-choices').count(), 2);
  assert.equal(await p.page.locator('.fgp-page:not(.fgp-key) .fgp-right').count(), 0);
  assert.equal(await p.page.locator('.fgp-key .fgp-right').count(), 2);
  await shot(p.page, 'print-with-key', true);
  assert.deepEqual(p.errors, []);
  await p.ctx.close();
});

test('the student step: radio options with the keyboard, the ± button, hand in, the right option after the due date', { skip }, async () => {
  const id = F.createWorksheet(boss, { title: 'Choices and cold', grade: '9', items: [
    { kind: 'pedigree', gen: 'pedigree', seed: 7932 }, { kind: 'reading', gen: 'reading.thermometer', seed: 297 }, { kind: 'moneyMarket', gen: 'moneyMarket', seed: 7919 * 2 + 13 }] }).id;
  const r = await fetch(`${BASE}/api/figures/worksheets/${id}/assign`, { method: 'POST', headers: { cookie: cookieOf(boss.id), 'content-type': 'application/json' }, body: JSON.stringify({ classId: A.id, dueAt: isoDay(Date.now() + 7 * 24 * 3600e3), showAnswers: true }) }).then(x => x.json());
  const cl = L.getClassLesson(r.classLessonId);
  const phone = await open(kid, r.view, { ...devices['iPhone 13'], deviceScaleFactor: SHOTS ? 2 : 1 });
  await phone.page.waitForSelector('.fs-choices');
  assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
  await shot(phone.page, 'student-step-choices-phone', true);
  await phone.ctx.close();
  const s = await open(kid, r.view);
  await s.page.waitForSelector('.fs-choices');
  const q1 = s.page.getByRole('group', { name: 'Which inheritance pattern does this family show?' });
  assert.equal(await q1.getByRole('radio').count(), 3, 'the legend names the group');
  // Keyboard: focus the first option, the arrow keys move and pick.
  await q1.getByRole('radio').first().focus();
  await s.page.keyboard.press('Space');
  await s.page.keyboard.press('ArrowDown');
  assert.equal(await q1.getByRole('radio', { name: /autosomal recessive/ }).isChecked(), true);
  // The ± button flips the sign of what is typed, and gives the keyboard back to the blank.
  await s.page.fill('[name="a1"]', '9');
  await s.page.click('[data-fs-sign]');
  assert.equal(await s.page.inputValue('[name="a1"]'), '-9');
  assert.equal(await s.page.evaluate(() => document.activeElement.name), 'a1');
  await s.page.click('[data-fs-sign]'); assert.equal(await s.page.inputValue('[name="a1"]'), '9');
  await s.page.click('[data-fs-sign]');
  const q3 = s.page.getByRole('group', { name: /nominal interest rate/ });
  await q3.getByRole('radio', { name: /rises/ }).check();
  await s.page.locator('.fs-q').nth(0).scrollIntoViewIfNeeded();
  await shot(s.page, 'student-step-choices', true);
  await s.page.click('button[name="hand"][value="1"]');
  await s.page.waitForSelector('dialog.ob-dialog[open]');
  await Promise.all([s.page.waitForNavigation(), s.page.click('dialog.ob-dialog [data-ob="ok"]')]);
  await s.page.waitForSelector('.fs-score');
  const want = F.generate('moneyMarket', 7919 * 2 + 13).correct === 0 ? 3 : 2;
  assert.match(await s.page.textContent('.fs-score'), new RegExp(`You got ${want} of 3 right`));
  assert.equal(await s.page.locator('.fs-right').count(), 0, 'not before the due date');
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.parse(`${isoDay(Date.now() - 3 * 24 * 3600e3)}T00:00:00Z`), cl.id);
  await s.page.reload();
  await s.page.waitForSelector('.fs-right');
  assert.equal(await s.page.locator('.fs-right').count(), 2);
  assert.match(await s.page.textContent('.fs-q:nth-child(1) .fs-right'), /autosomal recessive/);
  await shot(s.page, 'student-step-answers', true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
