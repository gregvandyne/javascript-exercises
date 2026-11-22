// Figures: Assign to class in a real browser (public/js/figures-sheet.js, routes/progress.js, views/figures-step.js): the
// tester opens a worksheet, "Assign to class" opens the form (class, open and due dates, Show answers after the due
// date), assigning shows the links; the student's lesson page draws each figure with a blank and its unit, Save keeps
// what they typed, Hand in asks first and marks it; after the due date, with the switch on, the answers and worked
// lines show. No sideways scroll on a phone. FIG_SHOTS=<dir> saves pictures. Skipped when no Chromium is installed.
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
const FS = await import('../../server/services/figures-steps.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigAssignB', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Assign Browser Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: 'Grade 7 Math' }).class;
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
const LAPTOP = () => ({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
async function open(who, path, opts = LAPTOP()) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

test('assign from the builder, answer and hand in as a student, answers after the due date', { skip }, async () => {
  const id = F.createWorksheet(boss, { title: 'Readings and triangles', grade: '7', items: [['reading.caliper', 7], ['protractor', 7], ['triangle', 7]].map(([gen, seed]) => ({ kind: F.genOf(gen).kind, gen, seed })) }).id;
  // The builder: Assign to class opens the form.
  const t = await open(boss, `/figures/worksheets/${id}`);
  await t.page.waitForSelector('.fg-item:nth-child(3)');
  assert.equal(await t.page.isDisabled('#fg-assign-open'), false);
  await t.page.click('#fg-assign-open');
  await t.page.waitForSelector('#fg-assign-form:not([hidden])');
  assert.equal(await t.page.getAttribute('#fg-assign-open', 'aria-expanded'), 'true');
  await t.page.fill('#fg-as-due', isoDay(Date.now() + 7 * 24 * 3600e3));
  await t.page.check('#fg-as-show');
  await t.page.locator('.fg-preview').scrollIntoViewIfNeeded();
  await shot(t.page, 'assign-dialog');
  if (SHOTS) await t.page.locator('.fg-assign').screenshot({ path: `${SHOTS}/assign-dialog-close.png` });
  await Promise.all([t.page.waitForResponse(r => /\/assign$/.test(r.url()) && r.status() === 200), t.page.click('#fg-as-go')]);
  await t.page.waitForSelector('#fg-assign-done .notice');
  assert.match(await t.page.textContent('#fg-assign-done'), /Assigned to Grade 7 Math/);
  const link = await t.page.getAttribute('#fg-assign-done a', 'href');
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
  const cl = L.getClassLesson(link.split('/').pop()), step = L.steps(cl.lesson_id)[0], items = FS.itemsOf(step);

  // The student: three figures, blanks with units, no sideways scroll on a phone.
  const phone = await open(kid, link, { ...devices['iPhone 13'], deviceScaleFactor: 1 });
  await phone.page.waitForSelector('.fs-q:nth-child(3) svg');
  assert.ok(await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
  await shot(phone.page, 'student-before-due-phone', true);
  await phone.ctx.close();
  const s = await open(kid, link);
  await s.page.waitForSelector('.fs-q svg');
  assert.equal(await s.page.locator('.fs-q svg.of-fig').count(), 3);
  for (const it of items) assert.ok(!(await s.page.content()).includes(it.answer), 'no answers before the due date');
  await s.page.fill('[name="a0"]', String(items[0].value));
  await s.page.fill('[name="a1"]', `${items[1].value}°`);
  await Promise.all([s.page.waitForResponse(r => /\/figures$/.test(r.url()) && r.request().method() === 'POST'), s.page.click('button[name="hand"][value="0"]')]);
  await s.page.waitForLoadState('load');
  await s.page.waitForSelector('[name="a0"]');
  assert.equal(await s.page.inputValue('[name="a0"]'), String(items[0].value), 'saved');
  await shot(s.page, 'student-before-due', true);
  await s.page.fill('[name="a2"]', '1');
  await s.page.click('button[name="hand"][value="1"]');
  await s.page.waitForSelector('dialog.ob-dialog[open]');
  await Promise.all([s.page.waitForNavigation(), s.page.click('dialog.ob-dialog [data-ob="ok"]')]);
  await s.page.waitForSelector('.fs-score');
  assert.match(await s.page.textContent('.fs-score'), /You got 2 of 3 right \(67%\)/);
  assert.equal(await s.page.locator('.fs-mark.ok').count(), 2);
  // After the due date, with Show answers on: answers and worked lines.
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.parse(`${isoDay(Date.now() - 3 * 24 * 3600e3)}T00:00:00Z`), cl.id);
  await s.page.reload();
  await s.page.waitForSelector('.fs-key');
  assert.equal(await s.page.locator('.fs-key').count(), 3);
  assert.match(await s.page.textContent('.fs-q:nth-child(3) .fs-key'), new RegExp(items[2].answer));
  assert.ok(await s.page.locator('.fs-q:nth-child(3) .fs-work li').count() > 0);
  await shot(s.page, 'student-after-due-answers', true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
