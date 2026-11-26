// Homeroom step 2b in a real browser (public/js/homeroom-lessons.js, public/js/homeroom.js, public/js/homeroom-desk.js):
//   - the teacher builds an Arithmetic Lab lesson at 1366 x 768: "+ Build a lesson", the game, its settings, a version
//     for each group (suggested, then changed), the live worksheet preview from the game's own printer, Save to My
//     lessons; Algebra Builder and Crossword builders on a tablet (Crossword's Ask Oomba button only with AI on); the
//     builder full screen on a phone; no sideways scroll anywhere;
//   - handing it out: tap the lesson, then Whole class; the sheet shows the versions by group and Score; the desks get it;
//   - Print worksheet from the lesson's ⋯ menu (a version, the print area);
//   - the student's desk: "Lesson: ..." and "Worksheet · 10 problems"; tapping it plays that exact set in Arithmetic Lab in
//     the desk's player layer, and Back to my desk closes it.
// HR_SHOTS=<dir> also saves screenshots there (hr2b-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const G = await import('../../server/services/game-sets.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr2b-${name}.png` }) : null);

const boss = createUser({ username: 'HlbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Lesson Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 12', teacherId: teacher.id }).class;
const NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, html = '<!doctype html><title>x</title><p>Game</p><script>1</script>') {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, html, { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
// Arithmetic Lab is the real game (its built page), so the lesson plays for real.
const LAB = made('Arithmetic Lab', 'arithmetic-lab', '🧮', fs.readFileSync(path.join(ROOT, 'seed-games/arithmetic-lab.html'), 'utf8'));
made('Algebra Builder', 'algebra-builder', '🧩'); made('Crossword', 'crossword', '📝');
// Groups: Stretch = Ava, Ben; On track = Cleo, Dev, Eli; Building = Fay, Gus; Hana none.
const room = H.roomOf(cls.id), [g1, g2, g3] = room.groups;
H.saveGroups(teacher, cls, { groups: room.groups, members: { [kids[0].id]: g1.id, [kids[1].id]: g1.id, [kids[2].id]: g2.id, [kids[3].id]: g2.id, [kids[4].id]: g2.id, [kids[5].id]: g3.id, [kids[6].id]: g3.id } });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, p, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && viewport.width < 600 });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const settle = async page => { await page.waitForTimeout(450); await page.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); const s = document.querySelector('.sheet'); if (s) s.scrollTop = 0; }); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const previewReady = page => page.waitForFunction(() => !!document.querySelector('#hrl-paper .cwp'));

test('the teacher builds an Arithmetic Lab lesson with a version for each group at 1366 x 768', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/hub`, { width: 1366, height: 768 });
  await page.waitForSelector('.hr-desk');
  // (no empty line taking room: the Build a lesson plan card at the bottom of Find lessons, with what it does)
  assert.match(await page.locator('#hr-lessons').innerText(), /Build a lesson plan[\s\S]*set it up once/i);
  await page.click('#hr-panel [data-hr="build"]');
  await page.waitForSelector('[data-lbgame="arithmetic-lab"]');
  assert.equal(await page.locator('.hr-lbgame.later').count(), 8, 'the rest of the spec\'s order, coming later');
  await settle(page); await shot(page, 'builder-pick-laptop');
  await page.click('[data-lbgame="arithmetic-lab"]');
  await previewReady(page);
  await page.fill('#hrl-title', 'Long division practice');
  await page.fill('#hrl-ins', 'Show every step. Check your answer by multiplying.');
  assert.equal(await page.locator('[data-lb="ai"]').count(), 0, 'no AI filler for Arithmetic Lab');
  // the defaults of the mockup: Divide, Standard, 3 ÷ 1 digits, 10, Guided
  for (const [k, v] of [['op', 'divide'], ['method', 'standard'], ['size', '3/1'], ['count', '10'], ['level', 'guided']]) assert.equal(await page.locator(`[data-lbseg="${k}"][data-v="${v}"]`).getAttribute('aria-checked'), 'true', k);
  await page.waitForFunction(() => /Long division practice/.test(document.querySelector('#hrl-paper')?.textContent || ''));
  assert.equal(await page.locator('#hrl-paper .bbp-item').count(), 10);
  await settle(page); await shot(page, 'builder-arithmetic-laptop');
  // A version for each group: Stretch harder, Building easier; change Building's help to Watch.
  await page.click('[data-lbseg="on"][data-v="1"]');
  await page.waitForSelector('.hr-vchip');
  assert.equal(await page.locator('.hr-vchip').count(), 4, 'three groups and No group');
  assert.equal(await page.locator('[data-lbseg="size"][data-v="4/1"]').getAttribute('aria-checked'), 'true', 'Stretch: one size up');
  assert.equal(await page.locator('[data-lbseg="level"][data-v="onMyOwn"]').getAttribute('aria-checked'), 'true', 'Stretch: less help');
  await page.click('.hr-vchip:has-text("Building")');
  assert.equal(await page.locator('[data-lbseg="size"][data-v="2/1"]').getAttribute('aria-checked'), 'true', 'Building: one size down');
  await page.click('[data-lbseg="level"][data-v="watch"]');
  await page.waitForFunction(() => /Building/.test(document.querySelector('#hrl-prevh').textContent));
  await previewReady(page);
  await settle(page); await shot(page, 'builder-versions-laptop');
  assert.ok(await noSideways(page));
  await page.click('[data-lb="save"]');
  await page.waitForSelector('.hr-lbsheet', { state: 'detached' });
  const l = HL.listMine(teacher)[0];
  assert.equal(l.title, 'Long division practice'); assert.equal(l.versions.length, 3);
  const bv = HL.getMine(teacher, l.id).versions.find(v => v.key === 'k:building');
  assert.equal(G.get(LAB.id, bv.set).items[0].l, 'watch');
  await page.waitForSelector(`[data-hritem="L:${l.id}"]`);
  assert.match(await page.locator(`[data-hritem="L:${l.id}"]`).innerText(), /10 problems · 3 versions/);
  await settle(page); await shot(page, 'my-lessons-laptop');
  // Hand it out: tap the lesson, then Whole class; the sheet shows each group's version and Score.
  await page.click(`[data-hritem="L:${l.id}"]`);
  await page.waitForSelector('#hr-givebar:not([hidden])');
  await page.click('#hr-groupchips [data-hrto="all"]');
  await page.waitForSelector('.hr-lvers');
  assert.match(await page.locator('#sheet-title').innerText(), /Long division practice for Whole class/);
  assert.equal(await page.locator('.hr-lvers li').count(), 4);
  assert.match(await page.locator('.hr-lvers').innerText(), /Building\s+Divide · 2 ÷ 1 digits · 10 problems · Watch/);
  assert.equal(await page.locator('[data-lbseg="grade"][data-v="score"]').getAttribute('aria-checked'), 'true', 'lessons: Score by default');
  await settle(page); await shot(page, 'handout-sheet-laptop');
  await page.click('.hr-giveok');
  await page.waitForSelector(`.hr-desk[data-sid="${kids[0].id}"] .hr-card`);
  const b = HO.boardView(cls);
  assert.equal(b.handouts.length, 4, 'a class assignment per version');
  await settle(page); await shot(page, 'desks-laptop');
  // a desk's sheet names the version for the teacher
  await page.locator(`.hr-desk[data-sid="${kids[5].id}"] .hr-card`).first().click();
  await page.waitForSelector('.hr-dsheet');
  assert.match(await page.locator('.hr-dsheet').innerText(), /Lesson plan · Version: Building/);
  await settle(page); await shot(page, 'desk-sheet-laptop');
  await page.keyboard.press('Escape');
  // Print worksheet: the lesson's ⋯ menu, Building's version, the print area filled.
  await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-area').innerHTML.length; }; });
  await page.click(`[data-hrlmore="${l.id}"]`);
  await page.click('[data-lm="print"]');
  await page.click('[data-lbseg="v"][data-v="k:building"]');
  await settle(page); await shot(page, 'print-choose-laptop');
  await page.click('.hr-lprint button[type="submit"]');
  await page.waitForFunction(() => window.__printed > 0);
  assert.match(await page.locator('#print-area h1').innerText(), /Long division practice/);
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 816, height: 1056 });
  await shot(page, 'printed-worksheet');
  await page.emulateMedia({ media: 'screen' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Algebra Builder and Crossword builders on a tablet; the builder full screen on a phone', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  config.anthropicKey = 'sk-test-not-used';   // the Ask Oomba button shows (nothing is called in this test)
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/hub`, { width: 1180, height: 820 }, true);
  await page.waitForSelector('.hr-desk');
  await page.tap('#hr-panel [data-hr="build"]');
  await page.tap('[data-lbgame="algebra-builder"]');
  await previewReady(page);
  await page.fill('#hrl-title', 'Solving equations');
  await page.tap('[data-lbseg="level"][data-v="medium"]');
  await page.waitForFunction(() => document.querySelectorAll('#hrl-paper .abp-list li').length === 5);
  assert.equal(await page.locator('[data-lb="ai"]').count(), 0, 'no AI filler for Algebra Builder');
  await settle(page); await shot(page, 'builder-algebra-tablet');
  assert.ok(await noSideways(page));
  await page.tap('[data-lb="cancel"]');
  await page.tap('#hr-panel [data-hr="build"]');
  await page.tap('[data-lbgame="crossword"]');
  await page.fill('#hrl-title', 'Habitats');
  const words = [['habitat', 'Where an animal lives'], ['predator', 'An animal that hunts'], ['prey', 'An animal that is hunted'], ['forest', 'Lots of trees growing together']];
  for (let i = 0; i < words.length; i++) {
    if (i >= 3) await page.tap('[data-lb="addword"]');
    await page.fill(`[data-lbw="${i}"]`, words[i][0]); await page.fill(`[data-lbc="${i}"]`, words[i][1]);
  }
  await page.waitForFunction(() => !!document.querySelector('#hrl-paper .cwp-grid'));
  assert.equal(await page.locator('[data-lb="ai"]').count(), 1, 'Crossword: Ask Oomba to fill it in');
  await settle(page); await shot(page, 'builder-crossword-tablet');
  await page.tap('[data-lb="save"]');
  await page.waitForSelector('.hr-lbsheet', { state: 'detached' });
  assert.ok(HL.listMine(teacher).some(x => x.title === 'Habitats'));
  assert.deepEqual(errors, []);
  await ctx.close();
  config.anthropicKey = '';
  // The phone: the builder is the whole screen, one column, no sideways scroll.
  const P = await open(teacher, `/class/${cls.id}/hub`, { width: 390, height: 844 }, true);
  await P.page.waitForSelector('.hr-desk');
  // lesson plans are in Find lessons (the phone's sheet): its Lesson plans chip, tap one, the yellow bar offers Whole
  // class and the groups
  await P.page.evaluate(() => { const b = document.querySelector('[data-hr="catalog"]'), p = document.getElementById('hr-panel'); p.scrollLeft = b.offsetLeft - 20; });
  await P.page.tap('[data-hr="catalog"]');
  await P.page.tap('.hr-csheet [data-csubj="plans"]');
  await P.page.locator('.hr-csheet [data-hritem^="L:"]').first().tap();
  await P.page.waitForSelector('#hr-givebar:not([hidden])');
  assert.ok(await noSideways(P.page));
  await settle(P.page); await shot(P.page, 'lesson-picked-phone');
  await P.page.tap('[data-hr="unpick"]');
  await P.page.tap('[data-hr="catalog"]');
  await P.page.tap('.hr-csheet [data-csubj="plans"]');
  await P.page.tap('.hr-csheet [data-hr="build"]');
  await P.page.tap('[data-lbgame="arithmetic-lab"]');
  await P.page.waitForFunction(() => !!document.querySelector('#hrl-paper .cwp'));
  const sheetBox = await P.page.locator('.hr-lbsheet').boundingBox();
  assert.ok(sheetBox.width >= 389 && sheetBox.x <= 1, 'full width');
  assert.ok(await noSideways(P.page));
  await settle(P.page); await shot(P.page, 'builder-phone');
  await P.page.tap('[data-lbseg="on"][data-v="1"]');
  await settle(P.page); await shot(P.page, 'builder-versions-phone');
  assert.ok(await noSideways(P.page));
  await P.ctx.close();
});

test('the student\'s desk shows the lesson card; it plays that exact set in Arithmetic Lab', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const fay = kids[5];   // Building: the 2 ÷ 1 version
  const l = HL.listMine(teacher).find(x => x.title === 'Long division practice'), set = HL.getMine(teacher, l.id).versions.find(v => v.key === 'k:building').set;
  for (const [name, vp, touch] of [['tablet', { width: 1180, height: 820 }, true], ['laptop', { width: 1366, height: 768 }, false], ['phone', { width: 390, height: 844 }, true]]) {
    const { ctx, page, errors } = await open(fay, `/class/${cls.id}/desk`, vp, touch);
    await page.waitForSelector('.hd-card');
    const card = page.locator('.hd-card').first();
    assert.equal(await card.locator('.hd-ct').innerText(), 'Lesson: Long division practice');
    assert.match(await card.locator('.hd-csub').innerText(), /Worksheet · 10 problems/);
    assert.match(await card.getAttribute('href'), new RegExp(`chapter=${set}&lock=1`));
    assert.doesNotMatch(await page.locator('body').innerText(), /Building|Stretch/);
    assert.ok(await noSideways(page), name);
    await settle(page); await shot(page, `student-card-${name}`);
    if (name === 'tablet') {
      await card.tap();
      // It plays in the desk's player layer (public/js/homeroom-player.js), the play page framed with ?in=hr.
      await page.waitForSelector('.hr-player iframe');
      assert.match(await page.locator('.hr-playback').innerText(), /Back to my desk/);
      const src = await page.locator('.hr-playframe').getAttribute('src');
      assert.match(src, new RegExp(`chapter=${set}&lock=1`), 'the layer plays the version\'s own set');
      assert.match(src, /[?&]in=hr(&|$)/);
      const play = page.frameLocator('.hr-player iframe');
      await play.locator('.playnote').waitFor();
      assert.match(await play.locator('.playnote-t').innerText(), /Show every step/);
      // the game frame gets the version's set (BRB.questionSet): the exact problems of the lesson
      const frame = play.frameLocator('#stage iframe');
      await frame.locator('body').waitFor();
      await page.waitForTimeout(1500);
      await shot(page, 'lesson-start-tablet');
      await frame.getByRole('button', { name: 'Start' }).click();
      await page.waitForTimeout(1500);
      // the first problem on screen is one of the version's own (2 ÷ 1 digits)
      const said = /does (\d+) go into (\d+)/.exec(await frame.locator('body').innerText());
      assert.ok(said, 'Watch says the first step');
      assert.ok(G.get(LAB.id, set).items[0].p.some(([a, b]) => String(b) === said[1] && String(a).startsWith(said[2])), said[0]);
      await shot(page, 'lesson-playing-tablet');
      await page.locator('.hr-playback').tap();
      await page.waitForSelector('.hr-player', { state: 'detached' });
      assert.match(page.url(), new RegExp(`/class/${cls.id}/desk$`), 'Back to my desk');
    }
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});
