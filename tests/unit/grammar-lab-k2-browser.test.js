// Grammar Lab in a real browser, Phase 2 (band K-2): a student plays three K-2 lessons to mastery at a 390 px phone and
// at a 1366 px laptop, one wrong answer in each: Capitalizing People's Names and Dates (click-to-fix: tap the word that
// needs a capital), Commas with Single Words in a Series (tap the gaps where commas go) and "Your" vs. "You're" (a pill
// choice that fills the blank). Nothing is chosen when a question opens and Submit stays off until the student acts;
// the wrong answer brings the calm notice and the hint; the mastery screen offers the next topic (worked out now) and,
// for a topic with one, its Mistake Hunt room, which the student plays and hands in (checked on the server) and which
// then shows on the unit. No page errors and no sideways scroll. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const GL = await import('../../server/services/grammar-lab.js');
const { proofCore } = await import('../../server/services/proof-core.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.GL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ROOT = path.resolve(import.meta.dirname, '../..');

// The official Mistake Hunt game, from its seed page (the rooms open in it).
if (!q.get("SELECT 1 FROM games WHERE slug='mistake-hunt'")) {
  const official = auth.getUserByName('OombaAcademy') || auth.createUser({ username: 'OombaAcademy', password: 'secret123' });
  const g = games.createGame(official.id, { title: 'Mistake Hunt', source: 'seed', slug: 'mistake-hunt' });
  const v = games.addVersion(g.id, fs.readFileSync(path.join(ROOT, 'seed-games/mistake-hunt.html'), 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
}

let browser = null, server = null, base = '', skip = !pw ? 'needs Playwright' : false;
test.before(async () => {
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); server.keepAliveTimeout = 0;
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); config.grammarLab = false; config.grammarLabUsers = []; });

let n = 0;
const newKid = () => auth.createUser({ username: `glk2${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const sessionCookie = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
async function shot(page, tag, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png`, fullPage: false }); }
async function noSideScroll(page, where) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 4).map(e => `${e.tagName}.${e.className}`).join(' ')]);
  assert.ok(w[0] <= w[1] + 1, `${where}: no sideways scroll (${w[0]} > ${w[1]}: ${w[2]})`);
}
/** The double-tap tip opens on a first visit, just after the quiz: close it. */
async function closeTip(page) {
  try { await page.waitForSelector('#gl-tip[open]', { timeout: 1500 }); } catch { return; }
  await page.click('#gl-tip-ok'); await page.waitForSelector('#gl-tip', { state: 'hidden' });
}
const waitFlashGone = page => page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 5000 });
const shown = page => page.evaluate(() => document.querySelector('#gl-sentence').textContent.replace(/\s+/g, ' ').trim());
/** The item on screen (the test reads the course data; the page never has the answer). */
async function itemOn(page, topic) {
  const text = await shown(page);
  const t = GL.topic(topic);
  const it = t.items.find(x => (t.format === 'choice' ? x.text.replace('___', '').replace(/\s+/g, ' ').trim() === text : x.text === text));
  assert.ok(it, `the item on screen: "${text}"`);
  return it;
}
/** Answer the question on screen: right (the item's answer) or wrong. */
async function answer(page, topic, { wrong = false } = {}) {
  const t = GL.topic(topic), it = await itemOn(page, topic);
  assert.ok(await page.isDisabled('#gl-submit'), 'Submit is off until the student acts');
  if (t.format === 'choice') {
    assert.equal(await page.locator('#gl-options .gl-opt[aria-checked="true"]').count(), 0, 'nothing is chosen when a question opens');
    const k = wrong ? it.options.findIndex((_, i) => !it.answer.includes(i)) : it.answer[0];
    await page.click(`#gl-options .gl-opt[data-k="${k}"]`);
    assert.equal(await page.textContent('#gl-blank'), it.options[k], 'the choice fills the blank');
  } else if (t.format === 'gaps') {
    const gaps = wrong ? [0] : [...it.answer, ...it.optional];
    for (const g of gaps) await page.click(`#gl-sentence .gl-gap[data-g="${g}"]`);
  } else {
    const words = wrong ? [it.answer[0] === 0 ? 1 : 0] : it.answer;
    for (const i of words) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
  }
  assert.ok(await page.isEnabled('#gl-submit'));
  await page.click('#gl-submit');
  return it;
}
/** Clear what the student marked (after a wrong answer), so the right answer can go in. */
async function clear(page, topic) {
  const t = GL.topic(topic);
  if (t.format === 'choice') return;   // picking another option replaces the pick
  for (const b of await page.locator('#gl-sentence [aria-pressed="true"]').all()) await b.click();
}

const LESSONS = [
  { unit: 'capital-letters', topic: 'capitalizing-names-and-dates', title: "Capitalizing People's Names and Dates", next: 'Rules of Capitalizing Titles', key: 'cap' },
  { unit: 'commas', topic: 'commas-in-a-series', title: 'Commas with Single Words in a Series', next: 'Commas with Prepositional Phrases', key: 'commas' },
  { unit: 'sound-alike-words', topic: 'your-and-youre', title: '"Your" vs. "You\'re"', next: 'Identifying Adjectives', key: 'your' },
];

async function playLesson(page, tag, L) {
  const unitUrl = `/courses/grammar-lab/k-2/${L.unit}`, topicUrl = `${unitUrl}/${L.topic}`;
  const T = `${tag}-${L.key}`;
  await page.goto(base + '/courses/grammar-lab');
  if (L.key === 'cap') { await shot(page, tag, '00-course'); await noSideScroll(page, 'course'); }
  await page.click(`#gl-unit-${L.unit}`);
  await page.waitForURL(base + unitUrl);
  await shot(page, T, '01-unit');
  await noSideScroll(page, 'unit');
  // The teaching card (read aloud is K-2's; silent here, the voices are off).
  await page.goto(base + topicUrl + '/card');
  await shot(page, T, '02-card');
  await noSideScroll(page, 'card');
  await page.goto(base + topicUrl);
  await page.waitForSelector('#gl-welcome:not([hidden])');
  await page.click('#gl-skip');
  await page.waitForSelector('#gl-quiz:not([hidden])');
  await closeTip(page);
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 12');
  await shot(page, T, '03-question');
  await noSideScroll(page, 'question');
  // One wrong answer: the calm notice, one more question, the hint (which never gives the answer).
  const it = await answer(page, L.topic, { wrong: true });
  await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 13');
  await page.click('#gl-hint-btn');
  await page.waitForSelector('#gl-hint:not([hidden])');
  assert.equal(await page.textContent('#gl-hint-text'), it.hint);
  await shot(page, T, '04-wrong-hint');
  await noSideScroll(page, 'hint');
  // Fix it.
  await clear(page, L.topic);
  if (GL.topic(L.topic).format === 'choice') { await page.click(`#gl-options .gl-opt[data-k="${it.answer[0]}"]`); await page.click('#gl-submit'); }
  else {
    if (GL.topic(L.topic).format === 'gaps') for (const g of [...it.answer, ...it.optional]) await page.click(`#gl-sentence .gl-gap[data-g="${g}"]`);
    else for (const i of it.answer) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`);
    if (L.key !== 'your') await shot(page, T, '05-fixing');
    await page.click('#gl-submit');
  }
  await page.waitForSelector('#gl-correct:not([hidden])');
  if (L.key === 'cap') assert.match(await shown(page), new RegExp(`\\b${it.fixed[0]}\\b`), 'the tapped word takes its capital');
  await shot(page, T, '06-correct');
  await waitFlashGone(page);
  let levels = 0;
  for (let i = 0; i < 20; i++) {
    if (await page.isVisible('#gl-done')) break;
    if (await page.isVisible('#gl-level')) { levels++; await page.click('#gl-level-next'); continue; }
    await answer(page, L.topic);
    await page.waitForSelector('#gl-correct:not([hidden])');
    await waitFlashGone(page);
  }
  assert.equal(levels, 2);
  await page.waitForSelector('#gl-done:not([hidden])');
  assert.equal(await page.textContent('#gl-done-n'), 'You answered 13 questions.');
  // The next topic, worked out now (never a mastered one), and the room.
  assert.equal(await page.getAttribute('#gl-done-next', 'aria-label'), `Next: ${L.next}`);
  assert.ok(await page.isVisible('#gl-done-room'));
  await page.waitForTimeout(2600);
  await shot(page, T, '07-mastered');
  await noSideScroll(page, 'mastery');
  await page.click('#gl-done-back');
  await page.waitForURL(base + unitUrl);
  assert.equal(await page.getAttribute(`#gl-topic-${L.topic}`, 'class'), 'gl-tile gl-mastered');
  await shot(page, T, '08-unit-after');
  await page.goto(base + topicUrl + '/review');
  assert.equal(await page.locator('.gl-review li').count(), 13);
  await shot(page, T, '09-review');
}

/** The topic's Mistake Hunt room, from the mastery screen's link: fix every mistake (the first one by hand), hand in,
 *  the server's check, back to the unit with the room's mark. */
async function playRoom(page, tag, L) {
  const T = `${tag}-${L.key}`;
  await page.goto(`${base}/courses/grammar-lab/k-2/${L.unit}`);
  await page.click(`#gl-topic-${L.topic} summary`);
  await shot(page, T, '10-menu');
  await Promise.all([page.waitForURL(/\/play\/mistake-hunt\?glroom=/), page.click(`#gl-topic-${L.topic} a.gl-mi[href*="glroom"]`)]);
  await page.waitForSelector('#gameframe');
  const f = await (await page.$('#gameframe')).contentFrame();
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhState);
  await f.waitForSelector('#mh-handin');
  await page.waitForTimeout(500);
  await shot(page, T, '11-room');
  const P = proofCore(), r = GL.room(L.topic), p = r.passages[0];
  const k = P.key(p.x, p.m);
  assert.equal(await f.evaluate(() => JSON.stringify(window.__brbTest.mhGraded()).includes('"key"')), false, 'no key in the frame');
  await f.click(`#mh-ptext [data-a="${k[0].a}"]`);
  // a K-2 room is tap-only: the sound-alike word's big choice buttons, no typing
  await f.waitForSelector('#mh-sheet .pick');
  await f.locator('#mh-sheet .pick').filter({ hasText: new RegExp(`^${k[0].right}$`) }).click();
  await f.waitForFunction(() => /Saved/.test(document.getElementById('mh-saved').textContent));
  for (const x of k.slice(1)) await f.evaluate(([a, b, s]) => window.__brbTest.mhFix(a, b, s), [x.a, x.b, x.right]);
  await f.click('#mh-handin');
  await f.waitForSelector('#mh-handin-yes');
  await f.click('#mh-handin-yes');
  await f.waitForSelector('#mh-gscore');
  assert.match(await f.textContent('#mh-gscore'), new RegExp(`You found ${k.length} of ${k.length} mistakes`));
  assert.match(await f.textContent('#mh'), /You found enough mistakes to pass this room!/);
  assert.equal((await f.textContent('#mh-gback')).trim(), 'Back to Grammar Lab');
  await shot(page, T, '12-room-handed-in');
  await noSideScroll(page, 'room');
  // The server's check counted it (not the game's end screen); the unit shows the room's mark.
  await page.goto(`${base}/courses/grammar-lab/k-2/${L.unit}`);
  assert.match(await page.textContent(`#gl-topic-${L.topic}`), /Proofread room done/);
  await shot(page, T, '13-unit-room-done');
}

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
  const tag = `${size.width}`;
  test(`a student plays three K-2 lessons to mastery at ${size.width} px, one wrong answer in each, and a Mistake Hunt room`, { timeout: 240_000 }, async t => {
    if (skip) return t.skip(skip);
    const ctx = await browser.newContext({ viewport: size, colorScheme: 'light', reducedMotion: 'no-preference' });
    const kid = newKid();
    await ctx.addCookies([sessionCookie(kid.id)]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try {
      for (const L of LESSONS) await playLesson(page, tag, L);
      await playRoom(page, tag, LESSONS[2]);
    } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
    for (const L of LESSONS) assert.ok(GL.masteredSet(kid).has(L.topic));
    assert.ok(GL.roomPassedSet(kid).has('your-and-youre'));
  });
}

test('the other K-2 formats on a phone, dark: the title choice in italics and the whole-sentence comma choice', { timeout: 120_000 }, async t => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const kid = newKid();
  for (const id of ['capitalizing-names-and-dates', 'commas-in-a-series', 'identifying-action-verbs']) q.run("INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', ?, 'k-2', 1, 1, 0, NULL, 1)", kid.id, id);
  await ctx.addCookies([sessionCookie(kid.id)]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    for (const [unit, topic, key] of [['capital-letters', 'capitalizing-titles', 'titles'], ['commas', 'commas-after-starting-phrases', 'intro'], ['verbs-and-time', 'using-simple-tenses', 'tense']]) {
      await page.goto(`${base}/courses/grammar-lab/k-2/${unit}/${topic}/card`);
      await shot(page, `390-dark-${key}`, '02-card');
      await noSideScroll(page, `${key} card`);
      await page.goto(`${base}/courses/grammar-lab/k-2/${unit}/${topic}`);
      await page.click('#gl-skip');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await closeTip(page);
      assert.ok(await page.isDisabled('#gl-submit'));
      if (key === 'titles') assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#gl-options .gl-opt')).fontStyle), 'italic');
      if (key === 'intro') assert.ok(await page.isHidden('#gl-sentence'), 'the options are the sentences');
      await shot(page, `390-dark-${key}`, '03-question');
      await page.click('#gl-options .gl-opt >> nth=0');
      await shot(page, `390-dark-${key}`, '04-picked');
      await noSideScroll(page, key);
    }
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});
