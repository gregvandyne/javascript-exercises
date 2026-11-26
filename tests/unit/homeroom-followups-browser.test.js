// Homeroom step 5b in a real browser (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups";
// public/js/homeroom-tour.js, public/js/homeroom-intro.js, public/js/homeroom-live.js, the follow-up card in
// public/js/companion.js):
//   - the first-run guide at 1366 x 768, 820 and 390: six steps pointing at the real things, Next and Skip, the board
//     still usable under it, kept on the server, Show me around in the ⋯ menu opens it again; the empty class's own step;
//   - the student's intro card on a first desk (and the K-2 one with pictures and Read to me), once;
//   - Needs a look: the count chip in the top bar, the list in Today with reasons, suggested actions, Seen; never on the
//     projector;
//   - Finish class: Oomba's follow-up card in the chat (names put in by the page), a suggestion confirmed adds a part to
//     the next school day's plan.
// HR_SHOTS=<dir> also saves screenshots there (hrfu-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HP = await import('../../server/services/homeroom-plan.js');
const HW = await import('../../server/services/homeroom-week.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const IN = await import('../../server/services/homeroom-intro.js');
const FU = await import('../../server/services/homeroom-follow.js');
const CO = await import('../../server/services/companion.js');
const RL = await import('../../server/services/ratelimit.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrfu-${name}.png`, ...opts }) : null);

const boss = createUser({ username: 'HfuBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Follow Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], homeroomOnboarding: true });
const A = S.createClass(boss, oak.id, { name: 'Room 4 Owls', grade: '4', teacherId: teacher.id }).class;
const E = S.createClass(boss, oak.id, { name: 'Room 4 Robins', grade: '4', teacherId: teacher.id }).class;
const K = S.createClass(boss, oak.id, { name: 'Room 1 Bees', grade: '1', teacherId: teacher.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben, cleo, dev, eli, fay] = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Shah', 'Eli Moss', 'Fay Gold'].map(n => kidIn(A, n));
const kim = kidIn(K, 'Kim Lee');
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-fb', '🍕'), sudoku = made('Sudoku', 'sudoku-fb', '🔢'), ladder = made('Word Ladder', 'word-ladder-fb', '🪜');
const [stretch, onTrack, building] = H.roomOf(A.id).groups;
assert.ok(H.saveGroups(teacher, A, { groups: H.roomOf(A.id).groups, members: { [ava.id]: stretch.id, [ben.id]: stretch.id, [cleo.id]: building.id, [dev.id]: building.id, [eli.id]: onTrack.id, [fay.id]: onTrack.id } }).ok);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { config.homeroomOnboarding = false; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => RL._reset());

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && viewport.width < 600 });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const settle = async page => { await page.waitForTimeout(400); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const LAPTOP = { width: 1366, height: 768 }, TABLET = { width: 820, height: 1180 }, PHONE = { width: 390, height: 844 };
/** The card and the ring: inside the screen; the card never covers what the ring is around. */
const tourFits = page => page.evaluate(() => {
  const c = document.querySelector('.hr-tourcard').getBoundingClientRect(), ring = document.querySelector('.hr-tourring');
  const inside = c.left >= 0 && c.top >= 0 && c.right <= innerWidth + 1 && c.bottom <= innerHeight + 1;
  if (!ring || ring.style.display === 'none') return inside;
  const r = ring.getBoundingClientRect(), big = r.height > innerHeight * 0.5 || r.width > innerWidth * 0.8;
  const overlap = !(c.right <= r.left || c.left >= r.right || c.bottom <= r.top || c.top >= r.bottom);
  return inside && (big || !overlap);
});

test('the first-run guide at 1366, 820 and 390: six steps, Next and Skip, the board still works, kept on the server, Show me around', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  IN.setSeen(teacher, 'tour', false);
  const { ctx, page, errors } = await open(teacher, `/class/${A.id}/homeroom`, LAPTOP);
  await page.waitForSelector('.hr-tourcard', { timeout: 8000 });
  const want = ['Arrange seats like your room', "Your teacher's area", 'Hand out a lesson', 'My desk', "Ask Oomba for today's plan", 'Everyone to Homeroom'];
  for (const [i, title] of want.entries()) {
    await page.waitForFunction(x => (document.querySelector('.hr-tourh')?.textContent || '').includes(x), title);
    assert.match(await page.locator('.hr-tourstep').innerText(), new RegExp(`${i + 1} of 6`));
    assert.ok(await tourFits(page), `step ${i + 1} fits beside what it points at`);
    if (i === 0) {
      // never blocks the board: its own buttons still work under the guide
      const z0 = await page.evaluate(() => document.getElementById('hr-world').style.transform);
      await page.click('[data-hr="zin"]');
      assert.notEqual(await page.evaluate(() => document.getElementById('hr-world').style.transform), z0, 'the board zooms with the guide open');
      assert.equal(await page.locator('.hr-tour .sheet-bg, .hr-tourbg').count(), 0, 'no layer over the board');
    }
    if (i === 2) assert.match(await page.locator('.hr-tourp').innerText(), /drag it there; a finger works too/);
    if (i === 5) assert.match(await page.locator('.hr-tourp').innerText(), /\/hr[\s\S]*sign-in code/);
    await settle(page); await shot(page, `tour-1366-${i + 1}`);
    await page.click(`.hr-tourcard [data-tour="next"]`);
  }
  await page.waitForSelector('.hr-tourcard', { state: 'detached' });
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  assert.equal(IN.seen(teacher, 'tour'), true, 'kept on the server');
  await page.reload(); await page.waitForSelector('#hr-world .hr-desk'); await page.waitForTimeout(1300);
  assert.equal(await page.locator('.hr-tourcard').count(), 0, 'not again');
  // Show me around (the ⋯ menu): again, and Skip closes it
  await page.click('[data-hr="menu"]');
  await page.click('[data-hr="tour"]');
  await page.waitForSelector('.hr-tourcard');
  await page.click('.hr-tourcard [data-tour="next"]');
  await page.click('.hr-tourcard [data-tour="skip"]');
  await page.waitForSelector('.hr-tourcard', { state: 'detached' });
  // Escape skips too
  await page.click('[data-hr="menu"]'); await page.click('[data-hr="tour"]'); await page.waitForSelector('.hr-tourcard');
  await page.keyboard.press('Escape'); await page.waitForSelector('.hr-tourcard', { state: 'detached' });
  assert.deepEqual(errors, []);
  await ctx.close();

  // a tablet and a phone (touch): the same steps, nothing sideways, Skip
  for (const [vp, tag] of [[TABLET, '820'], [PHONE, '390']]) {
    IN.setSeen(teacher, 'tour', false);
    const T = await open(teacher, `/class/${A.id}/homeroom`, vp, true);
    await T.page.waitForSelector('.hr-tourcard', { timeout: 8000 });
    for (let i = 0; i < 6; i++) {
      assert.ok(await tourFits(T.page), `${tag}: step ${i + 1} fits`);
      assert.ok(await noSideways(T.page));
      if (i === 0 || i === 2 || i === 4) { await settle(T.page); await shot(T.page, `tour-${tag}-${i + 1}`); }
      if (i < 5) await T.page.tap(`.hr-tourcard [data-tour="next"]`);
    }
    await T.page.tap('.hr-tourcard [data-tour="next"]');   // Done
    await T.page.waitForSelector('.hr-tourcard', { state: 'detached' });
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
  // the empty class: its own first step, the join code and Google Classroom
  IN.setSeen(teacher, 'tour', false);
  const em = await open(teacher, `/class/${E.id}/homeroom`, LAPTOP);
  await em.page.waitForSelector('.hr-tourcard', { timeout: 8000 });
  const first = await em.page.locator('.hr-tourcard').innerText();
  assert.match(first, /No students yet[\s\S]*join code[\s\S]*Google Classroom/);
  assert.match(first, new RegExp(S.getClass(E.id).join_code));
  assert.ok(await tourFits(em.page));
  await settle(em.page); await shot(em.page, 'tour-1366-empty');
  await em.page.click('.hr-tourcard [data-tour="skip"]');
  await em.ctx.close();
  IN.setSeen(teacher, 'tour', true);
});

test('the student\'s intro card on a first desk (and the K-2 one with pictures and Read to me), once', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [kid, vp, tag] of [[ava, TABLET, '820'], [ben, LAPTOP, '1366'], [cleo, PHONE, '390']]) {
    const D = await open(kid, `/class/${A.id}/desk`, vp, vp !== LAPTOP);
    await D.page.waitForSelector('.hd-intro', { timeout: 8000 });
    const txt = await D.page.locator('.hd-intro').innerText();
    assert.match(txt, /Welcome to your desk![\s\S]*My desk:[\s\S]*Raise hand:[\s\S]*Notebook:[\s\S]*The buttons at the bottom:[\s\S]*Your teacher can see your screen in Homeroom\./);
    assert.doesNotMatch(txt, /lesson/i, 'students keep their own words');
    assert.ok(await noSideways(D.page));
    await settle(D.page); await shot(D.page, `intro-${tag}`);
    if (tag === '820') {
      await D.page.click('[data-intro="ok"]');
      await D.page.waitForSelector('.hd-intro', { state: 'detached' });
      await D.page.waitForTimeout(300);
      assert.equal(IN.seen(kid, 'desk'), true);
      await D.page.reload(); await D.page.waitForSelector('.hd-dock'); await D.page.waitForTimeout(600);
      assert.equal(await D.page.locator('.hd-intro').count(), 0, 'once');
    } else { await D.page.keyboard.press('Escape'); await D.page.waitForSelector('.hd-intro', { state: 'detached' }); }
    assert.deepEqual(D.errors, []);
    await D.ctx.close();
  }
  // K-2: big pictures, few words, Read to me on each line, a big OK
  for (const [vp, tag] of [[TABLET, '820'], [PHONE, '390'], [LAPTOP, '1366']]) {
    IN.setSeen(kim, 'desk', false);
    const D = await open(kim, `/class/${K.id}/desk`, vp, vp !== LAPTOP);
    await D.page.waitForSelector('.hd-intro-bg.k2 .hd-intro', { timeout: 8000 });
    const txt = await D.page.locator('.hd-intro').innerText();
    assert.match(txt, /Hi! This is your desk\.[\s\S]*Tap the hand if you need help\.[\s\S]*Your teacher can see your screen\./);
    const canRead = await D.page.evaluate(() => !!window.speechSynthesis);
    if (canRead) assert.ok(await D.page.locator('.hd-intro [data-hrread]').count() >= 4, 'Read to me on each line');
    const ic = await D.page.locator('.hd-introic').first().boundingBox();
    assert.ok(ic.width >= (vp === PHONE ? 52 : 70), 'big pictures');
    assert.ok(await noSideways(D.page));
    await settle(D.page); await shot(D.page, `intro-k2-${tag}`);
    await D.page.click('[data-intro="ok"]');
    await D.page.waitForSelector('.hd-intro', { state: 'detached' });
    await D.ctx.close();
  }
});

test('Needs a look: the chip in the top bar, the list in Today with reasons and actions, Seen; never on the projector', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  IN.setSeen(teacher, 'tour', true);
  const yesterday = new Date(now() - 86400e3).toISOString().slice(0, 10);
  for (const g of [pizza, sudoku, ladder]) assert.ok(HO.handOut(teacher, A, { gameId: g.id, to: { kind: 'desk', id: dev.id }, dueAt: yesterday }).ok);
  assert.ok(AT.ask(eli, A, { kind: 'question', text: 'Which page do I read?' }, now() - 2 * 3600e3).ok);
  for (const [vp, tag] of [[LAPTOP, '1366'], [TABLET, '820'], [PHONE, '390']]) {
    const T = await open(teacher, `/class/${A.id}/homeroom`, vp, vp !== LAPTOP);
    await T.page.waitForSelector('.hr-needchip');
    assert.match(await T.page.locator('.hr-needchip').getAttribute('aria-label'), /Needs a look: 2 students/);
    const color = await T.page.locator('.hr-needchip').evaluate(el => getComputedStyle(el).backgroundColor);
    assert.ok(!/rgb\((2[0-9]{2}), ([0-9]{1,2}), ([0-9]{1,2})\)/.test(color), 'calm, never red');
    await settle(T.page); await shot(T.page, `chip-${tag}`, { clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 140) } });
    await T.page.click('.hr-needchip');
    await T.page.waitForSelector('#hr-needs .hr-need');
    const list = await T.page.locator('#hr-needs').innerText();
    assert.match(list, /Dev Shah[\s\S]*3 handouts after due[\s\S]*check-in[\s\S]*Eli Moss[\s\S]*A question from home has waited 2 hours[\s\S]*Hands/);
    assert.ok(await noSideways(T.page));
    await settle(T.page); await shot(T.page, `needs-${tag}`);
    if (tag === '1366') {
      // a suggested action: their handouts
      await T.page.locator('#hr-needs [data-hrneedgo^="' + dev.id + ':desk"]').last().click();
      await T.page.waitForSelector('.sheet');
      assert.match(await T.page.locator('#sheet-title').innerText(), /Dev/);
      await T.page.locator('.sheet .close').click();
      if (!(await T.page.locator('#hr-needs').count())) await T.page.click('.hr-needchip');
      // Seen: off the list; the chip counts one
      await T.page.locator(`#hr-needs [data-hrneed="seen:${dev.id}:overdue:n3"]`).click();
      await T.page.waitForFunction(() => !/Dev Shah/.test(document.getElementById('hr-needs')?.textContent || ''));
      await T.page.waitForFunction(() => /1 student/.test(document.querySelector('.hr-needchip')?.getAttribute('aria-label') || ''));
      assert.match(await T.page.locator('#hr-needs').innerText(), /1 seen or snoozed/);
      // the projector: no chip, no list, no names
      const proj = await T.ctx.newPage();
      await proj.goto(`${BASE}/class/${A.id}/homeroom/projector`); await proj.waitForTimeout(600);
      assert.doesNotMatch(await proj.locator('body').innerText(), /Needs a look|Dev|Eli|after due/);
      await proj.close();
      // back on the list for the other sizes
      q.run('DELETE FROM homeroom_look WHERE class_id=?', A.id);
    }
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
});

test('Finish class: Oomba\'s follow-up card in the chat, names from the page; a suggestion confirmed adds to the next school day\'s plan', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  IN.setSeen(teacher, 'tour', true);
  const plan = HP.cleanPlan(teacher, A, { name: 'Fractions day', parts: [{ kind: 'slides', minutes: 5, title: 'Fractions' },
    { kind: 'work', minutes: 15, title: 'Pizza time', groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Building', gameId: ladder.id }, { group: 'On track', gameId: sudoku.id }] }] }).plan;
  q.run("UPDATE homeroom_rooms SET day_plan='' WHERE class_id=?", A.id);
  assert.ok(HP.usePlan(teacher, A, plan).ok); assert.ok(HP.runAction(teacher, A, 'start').ok); assert.ok(HP.runAction(teacher, A, 'next').ok);
  // Ava finished hers (two minutes of play), the rest did not
  const ids = HP.todayOf(A).parts[1].handouts, card0 = HO.boardView(A).desks[ava.id].find(k => ids.includes(k.id));
  const st0 = q.get('SELECT s.id FROM class_lessons cl JOIN lesson_steps s ON s.lesson_id=cl.lesson_id WHERE cl.id=?', card0.id).id;
  P.gameTime(ava, card0.id, st0, 60); P.gameTime(ava, card0.id, st0, 60);
  const T = await open(teacher, `/class/${A.id}/homeroom`, LAPTOP);
  await T.page.waitForSelector('#hr-plan [data-hrplan="menu"]');
  await T.page.click('#hr-plan [data-hrplan="menu"]');
  await T.page.click('.hr-planmenu [data-hrplan="finish"]');
  await T.page.waitForSelector('.hr-sum-follow');
  assert.match(await T.page.locator('.hr-sum-follow').innerText(), /Oomba has a short follow-up/);
  await settle(T.page); await shot(T.page, 'summary-1366');
  await T.page.click('.hr-sum-follow [data-hrplan="follow"]');
  await T.page.waitForSelector('#oc .oc-follow .oc-fsug');
  const card = T.page.locator('#oc .oc-follow').last();
  const txt = await card.innerText();
  assert.match(txt, /After class: a short follow-up[\s\S]*What went well[\s\S]*1 of \d handouts finished[\s\S]*1 student finished everything[\s\S]*parts done[\s\S]*Might need a look on \w+[\s\S]*Dev Shah[\s\S]*Ideas[\s\S]*Hand out a review lesson on \w+ to the \w+[\s\S]*group[\s\S]*Move unfinished work[\s\S]*Send a note to the class/);
  await card.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await settle(T.page); await shot(T.page, 'follow-1366');
  // a tap asks first; Cancel changes nothing
  const next = FU.nextSchoolDay(A);
  const before = HW.datedOf(A, next);
  await card.locator('.oc-fsug[data-act="followDo"][data-v="review"]').click();
  await T.page.waitForSelector('dialog[open]');
  assert.match(await T.page.locator('dialog[open]').innerText(), /Nothing goes on desks until you start that plan/);
  await T.page.locator('dialog[open] button', { hasText: 'Cancel' }).click();
  await T.page.waitForTimeout(300);
  assert.deepEqual(HW.datedOf(A, next), before, 'not confirmed: nothing added');
  await card.locator('.oc-fsug[data-act="followDo"][data-v="review"]').click();
  await T.page.locator('dialog[open] button', { hasText: 'Add to the plan' }).click();
  await T.page.waitForFunction(() => /Added/.test(document.querySelector('#oc .oc-follow:last-of-type .oc-fdone')?.textContent || document.querySelector('#oc .oc-fdone')?.textContent || ''));
  const day = HW.datedOf(A, next);
  assert.ok(day && day.parts.some(p => p.title === 'Review' && p.only), 'the review is in the next school day\'s plan');
  // the note: the teacher's own words, then on the teacher's area
  await card.locator('.oc-fsug[data-act="followNote"]').click();
  await T.page.waitForSelector('dialog[open] input, dialog[open] textarea');
  await T.page.locator('dialog[open] input, dialog[open] textarea').first().fill('Great job with fractions today!');
  await T.page.locator('dialog[open] button', { hasText: 'Send' }).click();
  await T.page.waitForFunction(() => document.querySelectorAll('#oc .oc-fdone').length >= 2);
  assert.ok(H.roomOf(A.id).area.__ann.notes.some(n => n.text === 'Great job with fractions today!'));
  await settle(T.page); await shot(T.page, 'follow-1366-done');
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
  // the same card at 820 and 390 (the chat keeps it)
  for (const [vp, tag] of [[TABLET, '820'], [PHONE, '390']]) {
    const P2 = await open(teacher, `/class/${A.id}/homeroom`, vp, true);
    await P2.page.waitForSelector('#hr-plan');
    await P2.page.evaluate(async () => { const B = await import('/js/oomba-bus.js'); B.whenChat(c => c.setMode('open')); });
    await P2.page.waitForSelector('#oc .oc-follow');
    await P2.page.locator('#oc .oc-follow').last().evaluate(el => el.scrollIntoView({ block: 'start' }));
    assert.match(await P2.page.locator('#oc .oc-follow').last().innerText(), /Dev Shah/);
    assert.ok(await noSideways(P2.page));
    await settle(P2.page); await shot(P2.page, `follow-${tag}`);
    await P2.ctx.close();
  }
});
