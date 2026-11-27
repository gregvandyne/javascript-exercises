// Homeroom: the day plan in a real browser (docs/decisions.md "Homeroom: the day plan"; public/js/homeroom-plan.js, the
// plan card in public/js/companion.js):
//   - at 1366 x 768: Plan today opens the Oomba chat; the teacher asks; the card (a stand-in AI) shows the parts with
//     minutes and what each group gets; "make work time 25 minutes" redrafts it; Use this plan puts the handouts on
//     desks; Start plan; the pill shows Now with a countdown and Next, +5 min and Next; after a reload (the server holds
//     the timer) a part past its time is yellow Time's up and stays on that part; Next moves on; the projector shows
//     Now / Next; End class offers Finish class, whose summary shows parts and counts; handouts stay on desks;
//   - on a tablet (820 wide): the card, the pill, Time's up and the summary fit, nothing sideways.
// HR_SHOTS=<dir> also saves screenshots there (hrpl-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const HP = await import('../../server/services/homeroom-plan.js');
const CO = await import('../../server/services/companion.js');
const RL = await import('../../server/services/ratelimit.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrpl-${name}.png`, ...opts }) : null);

const boss = createUser({ username: 'HplBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Plan Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const A = S.createClass(boss, oak.id, { name: 'Room 4 Owls', grade: '4', teacherId: teacher.id }).class;
const T = S.createClass(boss, oak.id, { name: 'Room 5 Foxes', grade: '4', teacherId: teacher.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava', 'Ben', 'Cleo', 'Dev', 'Ezra', 'Fay'].map(n => kidIn(A, n));
const tkids = ['Gus', 'Hana', 'Ivy'].map(n => kidIn(T, n));
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-pl', '🍕');
const sudoku = made('Sudoku', 'sudoku-pl', '🔢');
const ladder = made('Word Ladder', 'word-ladder-pl', '🪜');
made('Arithmetic Lab', 'arithmetic-lab', '🧮');
const warmup = HL.saveLesson(teacher, { slug: 'arithmetic-lab', title: 'Fractions warm-up', base: M.defaults('arithmetic-lab', 3), versions: [] }).lesson;
for (const c of [A, T]) {
  const g = H.roomOf(c.id).groups, ids = c === A ? kids : tkids;
  assert.ok(H.saveGroups(teacher, c, { groups: g, members: Object.fromEntries(ids.map((k, i) => [k.id, g[i % 3].id])) }).ok);
}
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

// The stand-in AI: a plan for the class (the minutes of work time from the teacher's words), then a short answer.
const draft = work => ({ name: 'Fractions day', topic: 'fractions', parts: [
  { kind: 'slides', minutes: 8, title: 'What is a fraction?' },
  { kind: 'work', minutes: work, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'On track', lessonId: warmup.id }, { group: 'Building', gameId: sudoku.id }], instructions: 'Two rounds, then compare with a partner.' },
  { kind: 'break', minutes: 3, title: 'Simon says' },
  { kind: 'exit', minutes: 5, pick: { gameId: ladder.id }, title: 'One thing I learned' }] });
function standIn() {
  CO.hooks.create = async params => {
    const last = params.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base = { model: params.model, usage: { input_tokens: 1, output_tokens: 1 } };
    if (after) return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is a fractions day: slides, work time by group, a brain break and an exit check. Ask for changes, or tap Use this plan.' }] };
    const words = typeof last.content === 'string' ? last.content : '';
    const m = /(\d+) minutes/.exec(words);
    return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${Date.now()}`, name: 'draftDayPlan', input: draft(m ? Number(m[1]) : 20) }] };
  };
}

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { CO.hooks.create = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => RL._reset());

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const settle = async page => { await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/** The running part started this many minutes ago (as if class had gone on): written where the server keeps it. */
function partStartedAgo(c, min) {
  const r = q.get('SELECT day_plan FROM homeroom_rooms WHERE class_id=?', c.id), p = JSON.parse(r.day_plan);
  const shift = min * 60e3 - (Date.now() - p.run.partAt);
  p.run.partAt -= shift; p.run.startedAt -= shift; p.usedAt -= shift;
  q.run('UPDATE homeroom_rooms SET day_plan=? WHERE class_id=?', JSON.stringify(p), c.id);
}
/** The pill and its buttons sit inside the shared bar, whole. */
async function pillFits(page) {
  return page.evaluate(() => {
    const bar = document.getElementById('cv-bar').getBoundingClientRect();
    return [...document.querySelectorAll('#hr-plan > *')].every(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= bar.left - 1 && r.right <= bar.right + 1 && r.top >= bar.top - 1 && r.bottom <= bar.bottom + 1; });
  });
}
/** A message in the chat, and the new plan card it brings. */
async function askForPlan(page, words) {
  const n = await page.locator('.oc-plan').count();
  await page.fill('#oc-in', words);
  await page.click('#oc-send');
  await page.waitForFunction(k => document.querySelectorAll('.oc-plan').length > k, n, { timeout: 20000 });
}

test('1366 x 768: plan in the chat, Use this plan, Start, the pill counts down, Time\'s up after a reload, Next, End class offers Finish class', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  standIn();
  const { ctx, page, errors } = await open(teacher, `/class/${A.id}/hub`, { width: 1366, height: 768 });
  await page.waitForSelector('[data-hrplan="ask"]');
  await page.waitForTimeout(500);
  assert.match(await page.locator('#hr-plan').innerText(), /Plan/);
  assert.doesNotMatch(await page.locator('#cv-bar').getAttribute('class'), /cv-icons/, 'the bar keeps its words at 1366 (Arrange seats is in the ⋯ menu too)');
  assert.ok(await pillFits(page));
  await page.click('[data-hrplan="ask"]');
  await page.locator('#oc').waitFor();
  assert.match(await page.locator('#oc-sees').textContent(), /Room 4 Owls/);
  await askForPlan(page, 'Plan today on fractions');
  let card = page.locator('.oc-plan').last();
  assert.match(await card.innerText(), /Fractions day[\s\S]*36 min[\s\S]*Slides[\s\S]*Work time[\s\S]*Stretch:[\s\S]*Fraction Pizza[\s\S]*On track:[\s\S]*Fractions warm-up[\s\S]*Brain break[\s\S]*Exit check/);
  // a change asked for in the chat: a new card with it
  await askForPlan(page, 'make work time 25 minutes');
  card = page.locator('.oc-plan').last();
  assert.match(await card.innerText(), /41 min/);
  await settle(page);
  await card.locator('.oc-planh').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await shot(page, '1366-card');
  // Save plan: the card itself says it was saved, at once (no reload): the chat redraws on savedAs (25 Nov 2026)
  await card.locator('[data-act="planSave"]').click();
  await page.locator('dialog.ob-dialog input').fill('Fractions day');
  await page.locator('dialog.ob-dialog .btn-primary').click();
  await card.locator('.oc-state', { hasText: /Saved as/ }).waitFor({ timeout: 8000 });
  assert.equal(await card.locator('[data-act="planSave"]').count(), 0, 'Save plan is gone once the plan is saved');
  // Use this plan: on desks; the pill shows Today with Start plan
  await card.locator('button', { hasText: 'Use this plan' }).click();
  await page.waitForSelector('#hr-plan [data-hrplan="start"]');
  assert.match(await page.locator('#hr-plan').innerText(), /Fractions day/);
  assert.match(await page.locator('#hr-plan [data-hrplan="menu"]').getAttribute('aria-label'), /Today's plan: Fractions day, 41 minutes/);
  assert.ok(HO.boardView(A).handouts.length >= 4, 'the handouts are on desks');
  await page.locator('#oc [data-c="min"], #oc [data-c="close"]').first().click().catch(() => {});
  await page.click('#hr-plan [data-hrplan="start"]');
  await page.waitForSelector('#hr-plan .hr-pp-run');
  const text1 = await page.locator('#hr-plan').innerText();
  assert.match(text1, /Now[\s\S]*What is a fraction\?[\s\S]*\d:\d\d[\s\S]*Next:[\s\S]*Work time/);
  assert.ok(await page.locator('#hr-plan [data-hrplan="more"]').isVisible() && await page.locator('#hr-plan [data-hrplan="next"]').isVisible(), '+5 min and Next while it runs');
  const c1 = await page.locator('#hr-plan [data-hrclock]').textContent();
  await page.waitForTimeout(2300);
  assert.notEqual(await page.locator('#hr-plan [data-hrclock]').textContent(), c1, 'it counts down');
  assert.ok(await pillFits(page));
  await settle(page);
  await shot(page, '1366-pill');
  // a reload: the same part, from the server; past its time: Time's up in yellow, on the same part
  partStartedAgo(A, 12);
  await page.reload();
  await page.waitForSelector('#hr-plan .hr-pp-run.up');
  const up = await page.locator('#hr-plan').innerText();
  assert.match(up, /Time's up[\s\S]*What is a fraction\?/);
  assert.match(await page.locator('#hr-plan .hr-planpill').getAttribute('title'), /About 4 min behind/);
  const bg = await page.locator('#hr-plan .hr-pp-run').evaluate(el => getComputedStyle(el).backgroundColor);
  assert.equal(bg, 'rgb(255, 210, 63)', 'Spark yellow, never red');
  await page.waitForTimeout(1500);
  assert.match(await page.locator('#hr-plan').innerText(), /What is a fraction\?/, 'never moves on by itself');
  await settle(page);
  await shot(page, '1366-timesup');
  // the menu: parts, calm behind line
  await page.click('#hr-plan [data-hrplan="menu"]');
  await page.waitForSelector('.hr-planmenu');
  assert.match(await page.locator('.hr-planmenu').innerText(), /About 4 minutes behind[\s\S]*What is a fraction\?[\s\S]*Work time[\s\S]*Simon says/);
  await shot(page, '1366-menu');
  await page.keyboard.press('Escape');
  // the projector: Now / Next, nothing else
  const proj = await ctx.newPage();
  await proj.goto(`${BASE}/class/${A.id}/hub/projector`);
  await proj.waitForSelector('#hr-projplan:not([hidden])');
  assert.match(await proj.locator('#hr-projplan').innerText(), /Time's up[\s\S]*What is a fraction\?[\s\S]*Next:[\s\S]*Work time/);
  assert.doesNotMatch(await proj.locator('body').innerText(), /Ava|Stretch|Fraction Pizza/);
  await proj.close();
  // Next: work time with its clock; +5 min
  await page.click('#hr-plan [data-hrplan="next"]');
  await page.waitForFunction(() => /Work time/.test(document.querySelector('#hr-plan .hr-pp-l1')?.textContent || ''));
  assert.equal(await page.locator('#hr-plan .hr-pp-run.up').count(), 0);
  const before = await page.locator('#hr-plan [data-hrclock]').textContent();
  await page.click('#hr-plan [data-hrplan="more"]');
  await page.waitForFunction(b => { const m = /^(\d+):/.exec(document.querySelector('#hr-plan [data-hrclock]')?.textContent || ''); return m && Number(m[1]) >= Number(b.split(':')[0]) + 4; }, before);
  // a desk sees Now (no clock)
  const kid = await open(kids[0], `/class/${A.id}/desk`, { width: 1180, height: 820 });
  await kid.page.waitForSelector('#hd-now:not([hidden])');
  assert.match(await kid.page.locator('#hd-now').innerText(), /Now[\s\S]*Work time/);
  await kid.ctx.close();
  // End class (live) offers Finish class; the summary
  await page.click('[data-hr="golive"]');
  await page.waitForSelector('#hr-live:not([hidden])');
  await settle(page);
  await page.click('[data-hr="menu"]');
  await page.click('[data-hr="end"]');
  await page.waitForSelector('dialog.ob-dialog');
  assert.match(await page.locator('dialog.ob-dialog').innerText(), /A plan is still running[\s\S]*homework/);
  await page.click('dialog.ob-dialog [data-ob="ok"]');
  await page.waitForSelector('.hr-sum');
  const sum = await page.locator('.sheet').innerText();
  assert.match(sum, /Class summary[\s\S]*1 of 4[\s\S]*What is a fraction\?[\s\S]*12 of 8 min[\s\S]*Work time[\s\S]*0 of 6 finished[\s\S]*stay on desks as homework/);
  assert.doesNotMatch(sum, /Ava|Ben|Cleo/);
  await settle(page);
  await shot(page, '1366-summary');
  await page.waitForSelector('#hr-live[hidden]', { state: 'attached' });
  assert.equal(H.liveOf(A.id), null, 'class ended');
  assert.ok(HO.boardView(A).handouts.length >= 4, 'unfinished handouts stay on desks');
  assert.match(await page.locator('#hr-plan').innerText(), /Class finished/);
  assert.ok(await noSideways(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a tablet, 820 wide: the card, the pill, Time\'s up and the summary fit, nothing sideways', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  standIn();
  const { ctx, page, errors } = await open(teacher, `/class/${T.id}/hub`, { width: 820, height: 1180 }, true);
  await page.waitForSelector('[data-hrplan="ask"]');
  await page.tap('[data-hrplan="ask"]');
  await page.locator('#oc').waitFor();
  await askForPlan(page, 'Plan today on fractions');
  const card = page.locator('.oc-plan').last();
  await settle(page);
  await card.locator('.oc-planh').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await shot(page, '820-card');
  const box = await card.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 820, 'the card inside the screen');
  assert.ok(await noSideways(page));
  await card.locator('button', { hasText: 'Use and start' }).tap();
  await page.waitForSelector('#hr-plan .hr-pp-run');
  await page.locator('#oc [data-c="min"], #oc [data-c="close"]').first().tap().catch(() => {});
  assert.ok(await pillFits(page), 'the pill and its buttons inside the bar');
  await settle(page);
  await shot(page, '820-pill');
  partStartedAgo(T, 9);
  await page.reload();
  await page.waitForSelector('#hr-plan .hr-pp-run.up');
  assert.ok(await pillFits(page));
  assert.ok(await noSideways(page));
  await settle(page);
  await shot(page, '820-timesup');
  await page.tap('#hr-plan [data-hrplan="menu"]');
  await page.waitForSelector('.hr-planmenu');
  const mb = await page.locator('.hr-planmenu').boundingBox();
  assert.ok(mb.x >= 0 && mb.x + mb.width <= 820 && mb.y >= 0 && mb.y + mb.height <= 1180, 'the menu inside the screen');
  await page.locator('.hr-planmenu [data-hrplan="finish"]').tap();
  await page.waitForSelector('.hr-sum');
  const sb = await page.locator('.sheet').boundingBox();
  assert.ok(sb.x >= 0 && sb.x + sb.width <= 820);
  await settle(page);
  await shot(page, '820-summary');
  assert.ok(await noSideways(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a phone, 390 wide, a live class: the pill is its clock, its menu has the rest; every button whole, nothing sideways', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  q.run("UPDATE homeroom_rooms SET day_plan='' WHERE class_id=?", T.id);
  assert.ok(HP.usePlan(teacher, T, HP.cleanPlan(teacher, T, draft(20)).plan).ok);
  assert.ok(HP.runAction(teacher, T, 'start').ok);
  H.setLive(teacher, T, 'start');
  try {
    const { ctx, page, errors } = await open(teacher, `/class/${T.id}/hub`, { width: 390, height: 844 }, true);
    await page.waitForSelector('#hr-plan .hr-pp-run');
    await page.waitForSelector('#hr-livebtns .hr-pausebtn');
    await page.waitForTimeout(300);
    const clipped = await page.evaluate(() => {
      const bar = document.getElementById('cv-bar'), out = [];
      for (const el of bar.querySelectorAll('button, a, select')) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        let l = 0, rt = innerWidth;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') { const b = p.getBoundingClientRect(); l = Math.max(l, b.left); rt = Math.min(rt, b.right); }
        if (r.left < l - 1 || r.right > rt + 1) out.push((el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30));
      }
      for (const a of bar.querySelectorAll('.cv-acts')) if (a.getClientRects().length && a.scrollWidth > a.clientWidth + 1) out.push('scrolls');
      return out;
    });
    assert.deepEqual(clipped, []);
    assert.match(await page.locator('#hr-plan [data-hrclock]').innerText(), /^\d+:\d\d$/);
    await page.tap('#hr-plan [data-hrplan="menu"]');
    await page.waitForSelector('.hr-planmenu [data-hrplan="next"]');
    const mb = await page.locator('.hr-planmenu').boundingBox();
    assert.ok(mb.x >= 0 && mb.x + mb.width <= 390, 'the menu inside the screen');
    assert.match(await page.locator('.hr-planmenu').innerText(), /What is a fraction\?[\s\S]*\+5 min[\s\S]*Next: Work time[\s\S]*Finish class/);
    await page.tap('.hr-planmenu [data-hrplan="next"]');
    await page.waitForFunction(() => /Work time/.test(document.querySelector('.hr-planmenu')?.textContent || '') && document.querySelector('.hr-pm-part.now .hr-pm-name')?.textContent === 'Work time');
    assert.ok(await noSideways(page));
    await shot(page, '390-menu');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { H.setLive(teacher, T, 'end'); }
});
