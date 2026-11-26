// Homeroom: week plans, due dates and copying plans in a real browser (docs/decisions.md "Homeroom: week plans, due
// dates, copying plans"; public/js/companion.js the week card and the copy preview, public/js/homeroom-plan.js the pill's
// week strip, public/js/homeroom-due.js the hand-out sheet's Due row, the desk's card and the Classroom overview):
//   - at 1366 x 768: the teacher asks the Oomba chat for this week's plan (a stand-in AI); the week card shows Monday to
//     Friday; Use this week saves it; the pill has today's plan (a school day) with Start, and its menu the week strip
//     (open a day, swap); Copy to another class shows the preview first ("no Stretch group in Room 5C: goes to
//     everyone"), then a card for that class; a game handed out with a due date and time from the Due row; the student's
//     desk card says when it is due; the Classroom overview's column too;
//   - at 820 and 390: the week card, the week strip, the Due row, the desk card and the copy preview fit, nothing sideways.
// HR_SHOTS=<dir> also saves screenshots there (hrwk-*.png). Skipped with no Chromium.
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
const HW = await import('../../server/services/homeroom-week.js');
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
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrwk-${name}.png`, ...opts }) : null);

const boss = createUser({ username: 'HwbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Week Browser Oak' }).school;
S.updateSchool(boss, oak.id, { settings: { timeZone: 'America/Los_Angeles' } });
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const A = S.createClass(boss, oak.id, { name: 'Room 5A', grade: '5', teacherId: teacher.id }).class;
const B = S.createClass(boss, oak.id, { name: 'Room 5C', grade: '5', teacherId: teacher.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava', 'Ben', 'Cleo', 'Dev', 'Ezra', 'Fay'].map(n => kidIn(A, n));
kidIn(B, 'Gus');
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-wb', '🍕');
const sudoku = made('Sudoku', 'sudoku-wb', '🔢');
const ladder = made('Word Ladder', 'word-ladder-wb', '🪜');
made('Arithmetic Lab', 'arithmetic-lab', '🧮');
const warmup = HL.saveLesson(teacher, { slug: 'arithmetic-lab', title: 'Fractions warm-up', base: M.defaults('arithmetic-lab', 3), versions: [] }).lesson;
{ const g = H.roomOf(A.id).groups; assert.ok(H.saveGroups(teacher, A, { groups: g, members: Object.fromEntries(kids.map((k, i) => [k.id, g[i % 3].id])) }).ok); }
assert.ok(H.saveGroups(teacher, B, { groups: [{ id: 'g1', key: '', name: 'On track', color: '#1F9D63' }, { id: 'g2', key: '', name: 'Rockets', color: '#3F8FCF' }], members: {} }).ok);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

const day = (name, game, exit = 'One thing I learned', extra = {}) => ({ day: name, ...extra, parts: [
  { kind: 'slides', minutes: 6, title: 'Fractions warm up' },
  { kind: 'work', minutes: 20, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'On track', lessonId: warmup.id }, { group: 'Building', gameId: game.id }] },
  { kind: 'break', minutes: 3, title: 'Simon says' }, { kind: 'exit', minutes: 5, title: exit }] });
const WEEK = { name: 'Fractions week', topic: 'fractions', days: [day('Monday', sudoku, 'One thing I learned', { name: 'Halves' }), day('Tuesday', ladder, 'One thing I learned', { name: 'Thirds' }), day('Wednesday', sudoku, 'One thing I learned', { name: 'Quarters', half: true }), day('Thursday', ladder, 'One thing I learned', { name: 'Compare' }), day('Friday', sudoku, 'Quiz', { name: 'Fractions quiz' })] };
function standIn() {
  CO.hooks.create = async params => {
    const last = params.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base = { model: params.model, usage: { input_tokens: 1, output_tokens: 1 } };
    if (after) return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is your fractions week: a short plan each day. Ask for changes, or tap Use this week.' }] };
    return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${Date.now()}`, name: 'draftWeekPlan', input: WEEK }] };
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
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, timezoneId: 'America/Los_Angeles' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const settle = async page => { await page.waitForTimeout(450); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/** Open the Oomba chat from the plan pill (Plan today, or the menu's "in the Oomba chat"). */
async function openChat(page) {
  if (await page.locator('#hr-plan > [data-hrplan="ask"]').count()) await page.click('#hr-plan > [data-hrplan="ask"]');
  else { await page.click('#hr-plan [data-hrplan="menu"]'); await page.click('.hr-planmenu [data-hrplan="ask"]'); }
  await page.locator('#oc').waitFor();
}
const wk = HW.weekOf(A);
const schoolDay = wk.days.includes(wk.today);

test('1366 x 768: the week card, Use this week, the pill\'s week strip, the copy preview, a due date from the hand-out sheet on the desk and the overview', { timeout: 220000 }, async t => {
  if (skip) return t.skip(skip);
  standIn();
  const { ctx, page, errors } = await open(teacher, `/class/${A.id}/homeroom`, { width: 1366, height: 768 });
  await page.waitForSelector('#hr-plan [data-hrplan]');
  await openChat(page);
  const n = await page.locator('.oc-week').count();
  await page.fill('#oc-in', 'This week\'s plan on fractions');
  await page.click('#oc-send');
  await page.waitForFunction(k => document.querySelectorAll('.oc-week').length > k, n, { timeout: 20000 });
  const card = page.locator('.oc-week').last();
  const words = await card.innerText();
  assert.match(words, /Fractions week[\s\S]*Room 5A/);
  for (const d of wk.days) assert.ok(words.includes(new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })), `the card has ${d}`);
  assert.match(words, /Half day/); assert.match(words, /Use this week/);
  // a day opens to its parts and what each group gets
  await card.locator('.oc-wday details').first().evaluate(el => { el.open = true; });
  assert.match(await card.locator('.oc-wday').first().innerText(), /Stretch:[\s\S]*Fraction Pizza[\s\S]*On track:[\s\S]*Fractions warm-up/);
  await settle(page);
  await card.locator('.oc-planh').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await shot(page, '1366-weekcard');
  // Use this week: the dated plans are saved; on a school day the pill has today's
  await card.locator('button', { hasText: 'Use this week' }).click();
  await page.waitForFunction(() => /Saved for this class/.test([...document.querySelectorAll('.oc-week')].at(-1).innerText));
  const saved = q.all('SELECT day FROM homeroom_week_days WHERE class_id=? ORDER BY day', A.id).map(r => r.day);
  assert.deepEqual(saved, wk.days.filter(d => d >= wk.today));
  assert.equal(HO.boardView(A).handouts.length, 0, 'nothing on desks until Start');
  if (schoolDay) {
    await page.waitForSelector('#hr-plan [data-hrplan="start"]');
    assert.match(await page.locator('#hr-plan [data-hrplan="menu"]').getAttribute('aria-label'), /^Today's plan: /);
  }

  // the copy preview: what goes where in 5C, the group it doesn't have
  await card.locator('.oc-pmore summary', { hasText: 'Copy to another class' }).click();
  await card.locator('button[data-act="planWeekCopy"]', { hasText: 'Room 5C' }).click();
  await page.waitForSelector('.oc-copyprev');
  const pv = await page.locator('.oc-copyprev').innerText();
  assert.match(pv, /No Stretch group in Room 5C: goes to everyone/);
  assert.match(pv, /On track:[\s\S]*Fractions warm-up/);
  await settle(page);
  await shot(page, '1366-copypreview');
  const before = await page.locator('.oc-week').count();
  await page.click('.oc-copyprev [data-cp="yes"]');
  await page.waitForFunction(k => document.querySelectorAll('.oc-week').length > k, before);
  assert.match(await page.locator('.oc-week').last().innerText(), /Room 5C/);
  assert.equal(HO.boardView(B).handouts.length, 0, 'nothing handed out in 5C by a copy');

  // the pill's week strip (in its menu): Mon..Fri, a day opens, swap with another
  await page.locator('#oc [data-c="min"], #oc [data-c="close"]').first().click().catch(() => {});
  await page.click('#hr-plan [data-hrplan="menu"]');
  await page.waitForSelector('.hr-planmenu .hr-wk-chip');
  assert.equal(await page.locator('.hr-wk-chip').count(), 5);
  const future = wk.days.filter(d => d > wk.today);
  const openDay = future[0] || wk.days[4];
  await page.click(`.hr-wk-chip[data-day="${openDay}"]`);
  await page.waitForSelector('.hr-wk-open');
  assert.match(await page.locator('.hr-wk-open').innerText(), /Fractions warm up|Slides/);
  await settle(page);
  await shot(page, '1366-weekstrip');
  if (future.length >= 2) {
    const names = () => q.all('SELECT day, plan FROM homeroom_week_days WHERE class_id=? ORDER BY day', A.id).map(r => JSON.parse(r.plan).name);
    const was = names();
    await page.click('.hr-wk-open [data-hrplan="wkswap"]');
    await page.click(`.hr-wk-chip[data-day="${future[1]}"]`);
    await page.waitForFunction(() => !document.querySelector('.hr-wk-chip.target'));
    await page.waitForTimeout(300);
    assert.notDeepEqual(names(), was, 'two days changed places');
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.hr-plan-row, [data-hr="planrow"]').count(), 0, 'no plan row on the board');

  // a due date from the hand-out sheet: Pick a date, a time
  await page.click(`[data-hritem="${ladder.id}"]`);
  await page.click('#hr-givebar [data-hrto="all"]');
  await page.waitForSelector('.hr-giveform');
  assert.equal(await page.locator('[data-due=""]').getAttribute('aria-checked'), 'true', 'no due date by default');
  await page.click('[data-due="pick"]');
  const dueDay = wk.days[4] >= wk.today ? wk.days[4] : HW.weekOf(A, Date.now(), 1).days[4];
  await page.fill('#hrg-due', dueDay);
  await page.fill('#hrg-duetime', '15:00');
  await page.locator('#hrg-due').dispatchEvent('input');
  assert.match(await page.locator('[data-duehint]').innerText(), /Due .*3:00\s?PM/);
  await settle(page);
  await shot(page, '1366-duechip');
  await page.click('.hr-giveok');
  await page.waitForSelector('.hr-giveform', { state: 'detached' });
  const ho = HO.boardView(A).handouts.find(h => h.title === 'Word Ladder');
  assert.equal(ho.dueMin, 900); assert.equal(ho.due, Date.parse(`${dueDay}T00:00:00Z`));
  // the Friday chip
  await page.click(`[data-hritem="${pizza.id}"]`);
  await page.click('#hr-givebar [data-hrto="all"]');
  await page.waitForSelector('.hr-giveform');
  await page.click('[data-due="friday"]');
  await page.click('[data-seg="order"][data-v="any"]');
  await page.click('.hr-giveok');
  await page.waitForSelector('.hr-giveform', { state: 'detached' });
  assert.ok(HO.boardView(A).handouts.find(h => h.title === 'Fraction Pizza').due, 'Friday');
  assert.deepEqual(errors, []);
  await ctx.close();

  // the student's desk: when it is due, never late
  const kid = await open(kids[0], `/class/${A.id}/desk`, { width: 1366, height: 768 });
  await kid.page.waitForSelector('.hd-card');
  const desk = await kid.page.locator('#hd-cards').innerText();
  assert.match(desk, /Due [^\n]*3:00\s?PM/);
  assert.doesNotMatch(desk, /late|after due/i);
  await settle(kid.page);
  await shot(kid.page, '1366-desk');
  assert.deepEqual(kid.errors, []);
  await kid.ctx.close();

  // the Classroom overview: the column says when it is due
  const ov = await open(teacher, `/class/${A.id}/progress`, { width: 1366, height: 768 });
  await ov.page.waitForSelector('#hr-overview');
  assert.match(await ov.page.locator('.hv-due').first().innerText(), /Due /);
  await settle(ov.page);
  await ov.page.locator('#hr-overview').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await shot(ov.page, '1366-overview');
  await ov.ctx.close();
});

for (const [w, h, touch] of [[820, 1180, true], [390, 844, true]]) {
  test(`${w} wide: the week card, the week strip, the Due row, the desk card and the copy preview fit`, { timeout: 200000 }, async t => {
    if (skip) return t.skip(skip);
    standIn();
    const { ctx, page, errors } = await open(teacher, `/class/${A.id}/homeroom`, { width: w, height: h }, touch);
    await page.waitForSelector('#hr-plan [data-hrplan]');
    await page.waitForTimeout(400);
    // the week strip
    await page.click('#hr-plan [data-hrplan="menu"]');
    await page.waitForSelector('.hr-planmenu .hr-wk-chip');
    await page.click(`.hr-wk-chip[data-day="${wk.days[4]}"]`);
    await page.waitForSelector('.hr-wk-open');
    const menuBox = await page.locator('.hr-planmenu').boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= w + 1, 'the menu fits');
    assert.ok(await noSideways(page));
    await settle(page);
    await shot(page, `${w}-weekstrip`);
    await page.keyboard.press('Escape');
    // the week card in the chat
    await openChat(page);
    await page.waitForSelector('.oc-week');
    const card = page.locator('.oc-week').first();
    await card.locator('.oc-wday details').first().evaluate(el => { el.open = true; });
    await card.locator('.oc-planh').evaluate(el => el.scrollIntoView({ block: 'start' }));
    const cb = await card.boundingBox();
    assert.ok(cb.x >= 0 && cb.x + cb.width <= w + 1, 'the card fits');
    await settle(page);
    await shot(page, `${w}-weekcard`);
    // the copy preview, then Cancel
    await card.locator('.oc-pmore summary', { hasText: 'Copy to another class' }).click();
    await card.locator('button[data-act="planWeekCopy"]', { hasText: 'Room 5C' }).click();
    await page.waitForSelector('.oc-copyprev');
    assert.ok(await noSideways(page));
    await settle(page);
    await shot(page, `${w}-copypreview`);
    await page.click('.oc-copyprev [data-cp="no"]');
    await page.waitForSelector('.oc-copyprev', { state: 'detached' });
    await page.locator('#oc [data-c="min"], #oc [data-c="close"]').first().click().catch(() => {});
    // the Due row in the hand-out sheet (opened, then Cancel)
    // (a phone's strip opens the catalog in a sheet: Find lessons)
    const item = page.locator(`[data-hritem="${sudoku.id}"]`).first();
    if (!(await item.isVisible())) { await page.click('[data-hr="catalog"]'); await page.click(`.hr-csheet [data-hritem="${sudoku.id}"]`); } else await item.click();
    {
      await page.click('#hr-givebar [data-hrto="all"]');
      await page.waitForSelector('.hr-giveform');
      await page.click('[data-due="pick"]');
      await page.fill('#hrg-duetime', '09:30');
      await page.locator('.hr-duebox').evaluate(el => el.scrollIntoView({ block: 'center' }));
      assert.ok(await noSideways(page));
      await settle(page);
      await shot(page, `${w}-duechip`);
      await page.click('[data-give="cancel"]');
    }
    assert.deepEqual(errors, []);
    await ctx.close();
    // the desk card with its due date
    const kid = await open(kids[0], `/class/${A.id}/desk`, { width: w, height: h }, touch);
    await kid.page.waitForSelector('.hd-card');
    assert.match(await kid.page.locator('#hd-cards').innerText(), /Due /);
    assert.ok(await noSideways(kid.page));
    await kid.page.locator('.hd-card').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
    await settle(kid.page);
    await shot(kid.page, `${w}-desk`);
    await kid.ctx.close();
  });
}
