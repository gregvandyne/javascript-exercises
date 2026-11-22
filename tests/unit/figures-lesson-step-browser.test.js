// Figures Phase 3 end to end in Chromium (docs/decisions.md "Figures: the lesson Figure step and Build a test"): a
// tester adds a "Figure questions" step in the lesson editor, builds it by hand in the Figures builder (subject tabs,
// a kind, the question), saves it to the lesson; builds a test with "Power with AI" on (a mocked AI that picks
// generators), re-deals, swaps and deletes questions, turns the AI off (the same builder by hand), and assigns it with
// open and due dates; the student answers and hands in; the printed worksheet is black on white. FIG_SHOTS=<dir> saves
// pictures (device scale 2). Skipped when no Chromium is installed.
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
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigP3B', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Phase Three Browser Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: 'Grade 8 Science' }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Robin Kid' }).user.id);
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
async function open(who, path, opts = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 }) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 24 * 3600e3;

test('a Figure step built by hand in the lesson editor, saved to the lesson, printed', { skip }, async () => {
  const l = L.createLesson(boss, oak.id, { title: 'Areas and forces', kind: 'lesson', grade: '8' }).lesson;
  const t = await open(boss, `/teach/lessons/${l.id}`);
  await t.page.selectOption('#ns-k', 'figures');
  await t.page.fill('#ns-t', 'Area check');
  assert.ok(await t.page.isVisible('[data-for-kind="figures"].hint'));
  await t.page.locator('#add-step').scrollIntoViewIfNeeded();
  await shot(t.page, 'lesson-editor-add-figure-step');
  await Promise.all([t.page.waitForURL(/\/figures\/worksheets\//), t.page.click('#add-step button[type="submit"]')]);
  // The builder, by hand: the Math tab, a rectangle, its question.
  await t.page.waitForSelector('#fg-save-lesson');
  if (await t.page.isChecked('#fg-ai')) await t.page.click('#fg-ai');
  await t.page.click('[data-pick="math"]');
  await t.page.selectOption('#fg-addkind', 'rectangle');
  await Promise.all([t.page.waitForResponse(r => /\/items$/.test(r.url())), t.page.click('[data-act="add"]')]);
  await t.page.waitForSelector('.fg-item');
  await t.page.click('[data-pick="physics"]');
  assert.ok(await t.page.locator('#fg-addkind option[value="freeBody"]').count(), 'the Physics tab lists physics kinds');
  assert.equal(await t.page.locator('#fg-addkind option[value="rectangle"]').count(), 0);
  await t.page.selectOption('#fg-addkind', 'freeBody');
  await Promise.all([t.page.waitForResponse(r => /\/items$/.test(r.url())), t.page.click('[data-act="add"]')]);
  await t.page.waitForSelector('.fg-item:nth-child(2)');
  const qbox = t.page.locator('.fg-item:nth-child(1) [data-q]');
  await qbox.fill('What is the area of this rectangle?');
  await Promise.all([t.page.waitForResponse(r => /\/items\/[^/]+$/.test(r.url())), qbox.blur()]);
  await shot(t.page, 'lesson-figure-step-builder');
  await Promise.all([t.page.waitForURL(/\/teach\/lessons\/.*figures=saved/), t.page.click('#fg-save-lesson')]);
  await t.page.waitForSelector('.fstep-acts');
  assert.match(await t.page.textContent('.steplist'), /2 figure questions/);
  await t.page.locator('.steplist').scrollIntoViewIfNeeded();
  await shot(t.page, 'lesson-editor-figure-step');
  const step = L.steps(l.id)[0];
  assert.equal(step.kind, 'figures');
  assert.equal(FS.itemsOf(step)[0].question, 'What is the area of this rectangle?');
  // Print: black on white, with the answer key on request.
  await t.page.goto(`${BASE}/teach/lesson-steps/${step.id}/print?key=1`);
  await t.page.waitForSelector('.fgp-key svg');
  const fills = await t.page.$$eval('.fgp svg [fill]', els => [...new Set(els.map(e => e.getAttribute('fill').toLowerCase()))]);
  for (const f of fills) assert.ok(['none', '#000', '#000000', '#fff', '#ffffff', 'black', 'white', 'currentcolor', 'transparent'].includes(f) || /^#([0-9a-f])\1\1$|^#([0-9a-f]{2})\2\2$/.test(f), `a print color: ${f}`);
  await shot(t.page, 'lesson-figure-step-print', true);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test('Build a test with AI on and off, edit it, assign with dates, the student does it', { skip }, async () => {
  F.hooks.create = async () => ({ model: 'mock', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Forces on a ramp', items: [
    { gen: 'freeBody', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
    { gen: 'inclinedPlane', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
    { gen: 'pulley', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
    { gen: 'vectors', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
  ] }) }] });
  try {
    F.setAiPref(boss, true);
    const t = await open(boss, '/figures');
    await Promise.all([t.page.waitForURL(/\/figures\/tests\/new/), t.page.click('a[href="/figures/tests/new"]')]);
    await t.page.waitForSelector('#fg-topic');
    assert.ok(await t.page.isChecked('#fg-ai'));
    await t.page.fill('#fg-topic', 'Forces on ramps and pulleys');
    await t.page.selectOption('#fg-grade', '9');
    await t.page.selectOption('#fg-subject', 'physics');
    await t.page.selectOption('#fg-count', '4');
    await Promise.all([t.page.waitForResponse(r => /\/draft-test$/.test(r.url()) && r.status() === 200), t.page.click('[data-act="draftTest"]')]);
    await t.page.waitForSelector('.fg-item:nth-child(4)');
    assert.match(await t.page.textContent('#fg-note'), /Check every question before you assign it/);
    assert.equal(await t.page.inputValue('#fg-title'), 'Forces on a ramp');
    await shot(t.page, 'build-test-ai-on');
    const id = /\/figures\/worksheets\/([^/?#]+)/.exec(t.page.url())[1];
    assert.equal(F.ownWorksheet(boss, id).purpose, 'test');
    // Re-deal the first, swap the second for a pulley (its More menu), delete the fourth.
    const seed0 = F.itemsOf(id)[0].seed;
    await Promise.all([t.page.waitForResponse(r => /\/regen$/.test(r.url())), t.page.click('.fg-item:nth-child(1) [data-act="regen"]')]);
    assert.notEqual(F.itemsOf(id)[0].seed, seed0);
    await t.page.click('.fg-item:nth-child(2) .fg-mm-btn');
    await t.page.click('.fg-item:nth-child(2) [data-mi="swap"]');
    await t.page.selectOption('.sheet [data-swapkind]', 'rectangle');
    await shot(t.page, 'build-test-swap-menu');
    await Promise.all([t.page.waitForResponse(r => /\/swap$/.test(r.url())), t.page.click('.sheet .fg-swapform button[type="submit"]')]);
    await t.page.waitForFunction(() => /Rectangle/.test(document.querySelector('.fg-item:nth-child(2) .fg-ikind').textContent));
    assert.equal(F.itemsOf(id)[1].kind, 'rectangle');
    await t.page.click('.fg-item:nth-child(4) .fg-mm-btn');
    await t.page.click('.fg-item:nth-child(4) [data-mi="del"]');
    await t.page.waitForSelector('dialog.ob-dialog[open]');
    await Promise.all([t.page.waitForResponse(r => /\/delete$/.test(r.url())), t.page.click('dialog.ob-dialog [data-ob="ok"]')]);
    await t.page.waitForFunction(() => document.querySelectorAll('.fg-item').length === 3);
    // AI off: the same builder by hand (remembered for next time).
    await Promise.all([t.page.waitForResponse(r => /\/prefs$/.test(r.url())), t.page.click('#fg-ai')]);
    assert.ok(await t.page.isHidden('#fg-aibox'));
    assert.ok(await t.page.isVisible('#fg-hand'));
    assert.equal(F.aiPref(boss), false);
    await t.page.click('[data-pick="math"]');
    await t.page.selectOption('#fg-addkind', 'triangle');
    await Promise.all([t.page.waitForResponse(r => /\/items$/.test(r.url())), t.page.click('[data-act="add"]')]);
    await t.page.waitForSelector('.fg-item:nth-child(4)');
    await t.page.evaluate(() => window.scrollTo(0, 0));
    await shot(t.page, 'build-test-ai-off');
    // Nothing is assigned until Assign: then a class, open and due dates.
    assert.equal(q.get('SELECT COUNT(*) n FROM lesson_steps WHERE set_id=?', id).n, 0);
    await t.page.click('#fg-assign-open');
    await t.page.fill('#fg-as-opens', isoDay(Date.now() - DAY));
    await t.page.fill('#fg-as-due', isoDay(Date.now() + 7 * DAY));
    await Promise.all([t.page.waitForResponse(r => /\/assign$/.test(r.url()) && r.status() === 200), t.page.click('#fg-as-go')]);
    await t.page.waitForSelector('#fg-assign-done .notice');
    const link = await t.page.getAttribute('#fg-assign-done a', 'href');
    assert.deepEqual(t.errors, []);
    await t.ctx.close();
    const cl = L.getClassLesson(link.split('/').pop()), step = L.steps(cl.lesson_id)[0], items = FS.itemsOf(step);
    assert.ok(cl.opens_at && cl.due_at); assert.equal(items.length, 4);

    // The student: four figures and blanks; answers, hands in, is marked.
    const s = await open(kid, link);
    await s.page.waitForSelector('.fs-q:nth-child(4) svg');
    for (const it of items) assert.ok(!(await s.page.content()).includes(`>${it.answer}<`), 'no answers before the due date');
    for (const [i, it] of items.entries()) await s.page.fill(`[name="a${i}"]`, i === 3 ? '0' : String(it.value));
    await shot(s.page, 'student-test', true);
    await s.page.click('button[name="hand"][value="1"]');
    await s.page.waitForSelector('dialog.ob-dialog[open]');
    await Promise.all([s.page.waitForNavigation(), s.page.click('dialog.ob-dialog [data-ob="ok"]')]);
    await s.page.waitForSelector('.fs-score');
    assert.match(await s.page.textContent('.fs-score'), /You got 3 of 4 right \(75%\)/);
    await shot(s.page, 'student-test-handed-in', true);
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  } finally { F.hooks.create = null; }
});
