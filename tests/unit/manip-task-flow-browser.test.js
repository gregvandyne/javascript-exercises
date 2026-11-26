// Manipulatives tasks, played through in a real browser (docs/manip-practice-tasks.md; docs/decisions.md "Manipulatives:
// tasks you can practice and assign"). For each converted tool (MANIP_FLOW_TOOLS=rekenreks,base-ten-blocks; default: every
// tool with a helper in tests/unit/_manip-flow/<slug>.js), as a student:
//   - on /manipulatives, EVERY task: open the tool's task list, tap the task, build the answer through the real UI (the
//     tool's helper) and fill the box or pick the choice, Check: Correct; Try another: new numbers; get one wrong: Not
//     yet with a hint; Back to tasks;
//   - in Homeroom: the teacher hands out a set of 5 questions (one of each of five tasks) to a desk; the student opens it
//     in the desk's player (the real page, ?in=hr), gets the first one wrong (a hint), then answers all five; the
//     teacher's board shows the board and the problem live in look, and the score (4 of 5 right first time) on the card.
// Screenshots (deviceScaleFactor 1) at 1366, 820 and 390 with MANIP_FLOW_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { createApp } = await import('../../server/app.js');
const { startSession, getUser, createUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const { TASKS, isPractice, idOf, variation } = await import('../../public/js/manip-tasks.js');
const { sigOf } = await import('../../public/js/manip-task-kit.js');
const { answer, fit, wait } = await import('./_manip-flow/common.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

const HELPERS = path.join(import.meta.dirname, '_manip-flow');
const SLUGS = (process.env.MANIP_FLOW_TOOLS || '').split(',').map(s => s.trim()).filter(Boolean);
const tools = (SLUGS.length ? SLUGS : Object.keys(TASKS).filter(s => fs.existsSync(path.join(HELPERS, `${s}.js`)))).filter(s => (TASKS[s] || []).some(isPractice));
const SHOTS = process.env.MANIP_FLOW_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'MtfBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Task Flow Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Reyes', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 4', teacherId: teacher.id }).class;
const kids = ['Ivy', 'Jon', 'Kai'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, p, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + p);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1366, height: 768 }, TABLET = { width: 820, height: 1180 }, PHONE = { width: 390, height: 844 };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** The question on the card now: its variation (the same shared generator the page uses). */
async function current(scope) {
  const el = scope.locator('#mp-prob');
  await el.locator('.mp-prompt').waitFor();
  const id = await el.getAttribute('data-task'), seed = Number(await el.getAttribute('data-seed'));
  return variation(id, seed);
}
/** Build and answer the question on the card, Check, and wait for Oomba's answer. */
async function solve(ui, helper, v, { wrong = false } = {}) {
  await fit(ui);
  if (!wrong) await helper.build(ui, v);
  await answer(ui, v, { wrong });
  await ui.scope.locator('[data-pp="check"]').click();
  await ui.scope.locator('.mp-probok, .mp-probno').first().waitFor({ timeout: 10000 });
  const said = await ui.scope.locator('.mp-probsay').textContent();
  if (!wrong && !(await ui.scope.locator('.mp-probok').count())) {
    const kinds = await ui.scope.locator('#mp-content .mp-piece').evaluateAll(l => l.map(e => e.dataset.kind).join(','));
    throw new Error(`${v.id} seed ${v.seed}: not right: ${said} | ${v.prompt} | pieces: ${kinds}`);
  }
  assert.ok(await ui.scope.locator(wrong ? '.mp-probno' : '.mp-probok').count(), `${v.id}: ${said}`);
}
const results = [];

for (const slug of tools) {
  const helper = await import(path.join(HELPERS, `${slug}.js`));
  const list = TASKS[slug].filter(isPractice);

  test(`${slug}: every task on /manipulatives as a student: Correct, Try another, a hint, Back to tasks`, { timeout: 280000 }, async t => {
    if (skip) return t.skip(skip);
    const s = await open(kids[0], `/manipulatives#practice/${slug}`, LAPTOP);
    const ui = { scope: s.page, page: s.page };
    await s.page.waitForSelector('.mp-tlist');
    if (SHOTS) await shot(s.page, `${slug}-list-1366`);
    for (const [i, task] of list.entries()) {
      const id = idOf(slug, task);
      await s.page.click(`.mp-tlrow:has(.mp-tltitle:text-is("${task.title}")) a:has-text("Practice")`);
      let v = await current(s.page);
      assert.equal(v.id, id);
      const first = sigOf(v);
      if (SHOTS && i === 0) await shot(s.page, `${slug}-problem-1366`);
      // build it and Check: Correct, with the explanation
      await solve(ui, helper, v);
      assert.match(await s.page.textContent('.mp-probsay'), /Correct!/);
      assert.ok((await s.page.textContent('.mp-probexplain')).length > 8);
      if (SHOTS && i === 0) await shot(s.page, `${slug}-correct-1366`);
      // Try another: new numbers
      await s.page.click('[data-pp="another"]');
      await s.page.waitForFunction(seed => document.querySelector('#mp-prob').dataset.seed !== seed, String(v.seed));
      v = await current(s.page);
      assert.notEqual(sigOf(v), first, `${id}: Try another gives new numbers`);
      if (SHOTS && i === 0) await shot(s.page, `${slug}-another-1366`);
      // one wrong: Not yet, and the first hint
      await solve(ui, helper, v, { wrong: true });
      assert.ok(await s.page.locator('.mp-probhints li').count() >= 1, `${id}: a hint after a wrong check`);
      if (SHOTS && i === 0) await shot(s.page, `${slug}-notyet-1366`);
      // and right after all: Correct
      await s.page.locator('[data-pp="check"]').waitFor();
      await helper.build(ui, v); await answer(ui, v);
      await s.page.click('[data-pp="check"]');
      await s.page.locator('.mp-probok').waitFor({ timeout: 10000 });
      // Back to tasks
      await s.page.click('.mp-probside [data-pp="back"]');
      await s.page.waitForSelector('.mp-tlist');
      results.push(`${id}: solo ok`);
    }
    // the counts were kept by the server, per task
    const st = await s.page.evaluate(async () => (await fetch('/api/manipulatives/state')).json());
    for (const task of list) assert.ok(st.practice[idOf(slug, task)].solved >= 2, `${task.key} solved twice`);
    if (SHOTS) {
      for (const [w, vp] of [['820', TABLET], ['390', PHONE]]) {
        await s.page.setViewportSize(vp);
        await s.page.goto(`${BASE}/manipulatives#practice/${slug}`); await s.page.waitForSelector('.mp-tlist');
        assert.ok(await noSideways(s.page) <= 0, `no sideways scroll at ${w}`);
        await shot(s.page, `${slug}-list-${w}`);
        await s.page.click('.mp-tlrow a:has-text("Practice")');
        const v = await current(s.page);
        assert.ok(await noSideways(s.page) <= 0);
        await shot(s.page, `${slug}-problem-${w}`);
        await solve(ui, helper, v, { wrong: true });
        await shot(s.page, `${slug}-notyet-${w}`);
        await helper.build(ui, v); await answer(ui, v); await s.page.click('[data-pp="check"]'); await s.page.locator('.mp-probok').waitFor();
        await shot(s.page, `${slug}-correct-${w}`);
        await s.page.click('[data-pp="another"]'); await wait(ui, 300);
        await shot(s.page, `${slug}-another-${w}`);
      }
    }
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  });

  test(`${slug}: an assigned set of 5 in Homeroom's desk player; the teacher sees the board, the problem and the score`, { timeout: 280000 }, async t => {
    if (skip) return t.skip(skip);
    const kid = kids[1], picks = list.slice(0, 5).map(x => idOf(slug, x));
    H.setLive(teacher, cls, 'start');
    const r = HO.handOutTask(teacher, cls, { tasks: picks, count: 1, to: { kind: 'desk', id: kid.id }, grade: 'score' });
    assert.ok(r.ok, r.code);
    assert.equal(r.n, 5);
    const T = await open(teacher, `/class/${cls.id}/hub`, LAPTOP);
    await T.page.waitForSelector('.hr-desk[data-sid]');
    const D = await open(kid, `/class/${cls.id}/desk`, TABLET, true);
    await D.page.click(`.hd-card:has-text("${r.title}")`);
    await D.page.waitForSelector('.hr-playframe');
    const f = D.page.frameLocator('.hr-playframe'), ui = { scope: f, page: D.page };
    await f.locator('#mp-prob .mp-probof').waitFor({ timeout: 20000 });
    assert.match(await f.locator('.mp-probof').textContent(), /Question 1 of 5/);
    // question 1: wrong first (a hint), then right: it counts as not right first time
    let v = await current(f);
    await solve(ui, helper, v, { wrong: true });
    assert.ok(await f.locator('.mp-probhints li').count() >= 1);
    if (SHOTS) await shot(D.page, `${slug}-hr-desk-notyet-820`);
    await helper.build(ui, v); await answer(ui, v); await f.locator('[data-pp="check"]').click(); await f.locator('.mp-probok').waitFor();
    // the teacher's board: the student's board and the problem, live in look
    await T.page.click(`.hr-desk[data-sid="${kid.id}"]`, { position: { x: 40, y: 30 } });
    await T.page.waitForSelector('.hr-lkscreen[data-kind="tool"] .hr-sprob', { timeout: 30000 });
    assert.match(await T.page.textContent('.hr-lkscreen .hr-sprob'), /Question 1 of 5/);
    await T.page.waitForTimeout(600);
    if (SHOTS) await shot(T.page, `${slug}-hr-look-1366`);
    await T.page.keyboard.press('Escape');
    await f.locator('[data-pp="next"]').click();
    // questions 2 to 5: right first time
    for (let i = 2; i <= 5; i++) {
      await f.locator('.mp-probof', { hasText: `Question ${i} of 5` }).waitFor();
      v = await current(f);
      await solve(ui, helper, v);
      await f.locator('[data-pp="next"]').click();
      results.push(`${v.id}: Homeroom ok`);
    }
    await f.locator('.mp-probdone').waitFor();
    assert.match(await f.locator('.mp-probdone').textContent(), /4 of 5 right the first time/);
    if (SHOTS) await shot(D.page, `${slug}-hr-desk-done-820`);
    // the score went the handouts' way: the board's card, the gradebook's marks
    const b = HO.boardView(cls).desks[kid.id].find(x => x.id === r.classLesson.id);
    assert.equal(b.done, true); assert.equal(b.score, 80);
    // the desk: Back to my desk closes the player; the card is done
    await f.locator('[data-pp="desk"]').click();
    await D.page.waitForSelector('.hr-playframe', { state: 'detached' });
    await D.page.waitForSelector(`.hd-card.done:has-text("${r.title}")`, { timeout: 15000 });
    // the teacher sees the score on the desk's card sheet
    await T.page.waitForTimeout(2500);
    await T.page.click(`.hr-desk[data-sid="${kid.id}"] [data-hrho="${r.classLesson.id}"]`).catch(async () => { await T.page.click(`[data-hrho="${r.classLesson.id}"]`); });
    await T.page.waitForSelector('.sheet', { timeout: 10000 });
    assert.match(await T.page.textContent('.sheet'), /80/);
    await T.page.waitForTimeout(700);
    if (SHOTS) await shot(T.page, `${slug}-hr-teacher-score-1366`);
    for (const x of [T, D]) assert.deepEqual(x.errors, []);
    H.setLive(teacher, cls, 'end');
    HO.removeHandout(teacher, cls, r.classLesson.id);
    for (const x of [T, D]) await x.ctx.close();
  });
}
test('teachers: the task list with notes, Preview and Assign (the dialog), and a task handed out from Homeroom\'s catalog', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const slug = tools[0], first = TASKS[slug].find(isPractice);
  const T = await open(teacher, `/manipulatives#practice/${slug}`, LAPTOP);
  await T.page.waitForSelector('.mp-tlist');
  // notes, codes, grades; Preview and Assign on every practice task
  assert.equal(await T.page.locator('.mp-tlrow a:has-text("Preview")').count(), TASKS[slug].filter(isPractice).length);
  assert.match(await T.page.textContent('.mp-tlrow'), new RegExp(first.ccss.replace(/\./g, '\\.')));
  assert.match(await T.page.textContent('.mp-tlrow'), /Teacher note:/);
  // Preview: the task as students see it
  await T.page.click('.mp-tlrow a:has-text("Preview")');
  await T.page.waitForSelector('#mp-prob .mp-prompt');
  assert.equal(await T.page.locator('[data-tool="draft"], [data-tool="steps"]').count(), 0, 'no AI drafting or steps in a preview');
  await T.page.click('.mp-probside [data-pp="back"]'); await T.page.waitForSelector('.mp-tlist');
  // Assign two ticked tasks to the class: 3 questions each
  const ticks = T.page.locator('[data-pick]');
  await ticks.nth(0).check(); await ticks.nth(1).check();
  await T.page.click('#mp-tlassign');
  await T.page.waitForSelector('.mp-assign');
  await T.page.fill('.mp-assign [name="count"]', '3');
  assert.match(await T.page.textContent('#mp-asum'), /6 questions for each student/);
  for (const [w, vp] of [['1366', LAPTOP], ['820', TABLET], ['390', PHONE]]) { await T.page.setViewportSize(vp); await wait({ page: T.page }, 300); assert.ok(await noSideways(T.page) <= 0); await shot(T.page, `assign-dialog-${w}`); }
  await T.page.setViewportSize(LAPTOP);
  await T.page.click('.mp-assign [type="submit"]');
  await T.page.waitForSelector('.toast, [role="status"]:has-text("assigned")', { timeout: 10000 }).catch(() => {});
  const { q } = await import('../../server/db.js');
  const row = q.get("SELECT cl.id, s.items FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='manip' JOIN lesson_steps s ON s.lesson_id=l.id WHERE cl.class_id=? AND cl.removed_at IS NULL ORDER BY cl.assigned_at DESC LIMIT 1", cls.id);
  assert.ok(row, 'a class lesson was made');
  assert.equal(JSON.parse(row.items).n, 3); assert.equal(JSON.parse(row.items).tasks.length, 2);
  // the student's lesson page has Start; it opens the set on the Manipulatives page
  const K = await open(kids[2], `/class/${cls.id}/lessons/${row.id}`, LAPTOP);
  await K.page.click('a:has-text("Start")');
  await K.page.waitForSelector('#mp-prob .mp-probof');
  assert.match(await K.page.textContent('.mp-probof'), /Question 1 of 6/);
  await K.ctx.close();
  // Homeroom: the catalog lists each tool's tasks as lessons; one handed out with 5 questions from the give sheet
  const B = await open(teacher, `/class/${cls.id}/hub`, LAPTOP);
  await B.page.waitForSelector('[data-catalog]');
  const item = B.page.locator(`[data-hritem="T:task:${idOf(slug, first)}"]`);
  assert.equal(await item.count(), 1);
  // Find lessons lists a tool's practice under the tool (See all); bring this one into view
  await B.page.evaluate(i => { const el = document.querySelector(`[data-hritem="${i}"]`); for (let n = el; n; n = n.parentElement) { if (n.hidden) n.hidden = false; if (n.tagName === 'DETAILS') n.open = true; } el.scrollIntoView({ block: 'center' }); }, `T:task:${idOf(slug, first)}`);
  await item.click();
  await B.page.click('[data-hrto="all"]');
  await B.page.waitForSelector('#hr-tcount');
  assert.equal(await B.page.inputValue('#hr-tcount'), '5');
  assert.equal(await B.page.getAttribute('[data-seg="grade"][data-v="score"]', 'aria-checked'), 'true', 'Score by default');
  await B.page.waitForTimeout(700);
  await shot(B.page, 'homeroom-give-task-1366');
  await B.page.click('.hr-giveok');
  await B.page.waitForFunction(() => !document.querySelector('.hr-giveform'));
  const h = HO.boardView(cls).handouts.find(x => x.manip);
  assert.ok(h && h.manip.n === 5 && h.grade === 'score');
  for (const x of [T, B]) assert.deepEqual(x.errors, []);
  HO.removeHandout(teacher, cls, h.id);
  for (const x of [T, B]) await x.ctx.close();
});
test.after(() => { if (results.length) console.log(`run-through: ${results.length} flows\n${results.join('\n')}`); });
