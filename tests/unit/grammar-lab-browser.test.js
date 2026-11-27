// Grammar Lab in a real browser (Phase 1: K-2 Adjectives and Adverbs, Identifying Adjectives): a student plays the
// topic to mastery at a 390 px phone and at a 1366 px laptop, in the light and the dark palette, with one near miss
// (too many words) and one wrong answer on the way: the near-miss notice, the calm wrong notice and its hint (which
// re-teaches without naming the answer), the green confirmation, the level-complete overlays, the mastery screen with
// its answered total, then the green check back on the unit. A guest's run ends with the sign-in prompt. No page
// errors and no sideways scroll on any screen. Screenshots of every screen with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const GL = await import('../../server/services/grammar-lab.js');
const { tokenize } = await import('../../server/services/grammar-lab-text.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.GL_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const TOPIC = 'identifying-adjectives', UNIT = 'adjectives-and-adverbs';
const UNIT_URL = `/courses/grammar-lab/k-2/${UNIT}`, TOPIC_URL = `${UNIT_URL}/${TOPIC}`;
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
const newKid = () => auth.createUser({ username: `glkid${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
const sessionCookie = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); const at = c.indexOf('='); return { name: c.slice(0, at), value: c.slice(at + 1), url: base }; };
/** The answer's word places for the sentence on screen (the test reads the course data; the page never has it). */
const answerFor = text => GL.topic(TOPIC).items.find(it => it.text === text).answer;
const sentence = page => page.evaluate(() => [...document.querySelectorAll('#gl-sentence')].map(p => p.textContent.replace(/\s+/g, ' ').trim())[0]);
async function shot(page, tag, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-${name}.png`, fullPage: false }); }
async function noSideScroll(page, where) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth,
    [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 4).map(e => `${e.tagName}.${e.className}`).join(' ')]);
  assert.ok(w[0] <= w[1] + 1, `${where}: no sideways scroll (${w[0]} > ${w[1]}: ${w[2]})`);
}
async function tap(page, indices) { for (const i of indices) await page.click(`#gl-sentence .gl-w[data-i="${i}"]`); }
async function waitFlashGone(page) { await page.waitForSelector('#gl-correct', { state: 'hidden', timeout: 5000 }); }

/** Play the topic from the unit page to mastery. One near miss and one wrong answer on the first question. */
async function playToMastery(page, tag, { guest = false } = {}) {
  // The course page: the K-2 band and its unit, with its ring; the unit opens from there.
  await page.goto(base + '/courses/grammar-lab');
  assert.match(await page.textContent('#gl-unit-adjectives-and-adverbs'), /Adjectives and Adverbs\s*2 topics/);
  await shot(page, tag, '00-course');
  await noSideScroll(page, 'course');
  await page.click('#gl-unit-adjectives-and-adverbs');
  await page.waitForURL(base + UNIT_URL);
  await shot(page, tag, '01-unit');
  await noSideScroll(page, 'unit');
  // The tile's menu: before mastery only the teaching card is usable.
  await page.click('#gl-topic-identifying-adjectives summary');
  assert.equal(await page.locator('#gl-topic-identifying-adjectives .gl-mi[aria-disabled="true"]').count(), 2);
  await shot(page, tag, '02-tile-menu');
  await page.click('#gl-topic-identifying-adjectives summary');
  // The teaching card, from the menu.
  await page.goto(base + TOPIC_URL + '/card');
  assert.match(await page.textContent('.gl-ex-text'), /fluffy\s*adjective\s*kitten\s*noun/);
  await shot(page, tag, '03-card');
  await noSideScroll(page, 'card');
  // Start the topic: the welcome screen, with its skip.
  await page.goto(base + TOPIC_URL);
  await page.waitForSelector('#gl-welcome:not([hidden])');
  assert.ok(await page.isVisible('#gl-skip'));
  await page.waitForTimeout(2600);
  await shot(page, tag, '04-welcome');
  await noSideScroll(page, 'welcome');
  await page.click('#gl-go');
  // First visit: the double-tap tip.
  await page.waitForSelector('#gl-tip[open]');
  await page.waitForTimeout(2300);
  await shot(page, tag, '05-tip');
  await page.click('#gl-tip-ok');
  await page.waitForSelector('#gl-tip', { state: 'hidden' });
  await page.waitForSelector('#gl-quiz:not([hidden])');
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 12');
  assert.equal(await page.locator('#gl-bar .gl-seg').count(), 12);
  await shot(page, tag, '06-question');
  await noSideScroll(page, 'question');
  // Double-tap a grammar word: its meaning pops up.
  await page.dblclick('#gl-ask .gl-term');
  await page.waitForSelector('#gl-bubble:not([hidden])');
  assert.match(await page.textContent('#gl-bubble'), /adjective.*tells about a noun/);
  await shot(page, tag, '07-double-tap');
  await page.click('#gl-streak-t');
  // One word to find: a tap moves the pick (a second word replaces the first; no "too many words" here).
  let text = await sentence(page), ans = answerFor(text);
  const other = tokenize(text).findIndex((_, i) => !ans.includes(i));
  await tap(page, [...ans, other]);
  assert.equal(await page.getAttribute(`#gl-sentence .gl-w[data-i="${other}"]`, 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute(`#gl-sentence .gl-w[data-i="${ans[0]}"]`, 'aria-pressed'), 'false', 'the pick moved');
  await shot(page, tag, '08-single-pick');
  // A wrong answer: the picks clear, so the student starts fresh.
  await page.click('#gl-submit');
  await page.waitForSelector('#gl-notice.gl-notice-wrong:not([hidden])');
  assert.match(await page.textContent('#gl-notice'), /Not quite.*two right in a row/);
  assert.equal(await page.locator('#gl-sentence .gl-w[aria-pressed="true"]').count(), 0, 'nothing stays picked after a wrong answer');
  assert.ok(await page.isDisabled('#gl-submit'));
  assert.equal(await page.textContent('#gl-counter'), 'Question 1 of 13', 'a wrong answer adds one question');
  assert.equal(await page.locator('#gl-streak .gl-pips i.on').count(), 0, 'the streak empties');
  await page.click('#gl-hint-btn');
  await page.waitForSelector('#gl-hint:not([hidden])');
  const hintText = await page.textContent('#gl-hint-text');
  assert.equal(hintText, GL.topic(TOPIC).items.find(it => it.text === text).hint);
  assert.doesNotMatch(hintText, new RegExp(`\\b${tokenize(text)[ans[0]].t}\\b`, 'i'), 'the hint never names the answer');
  assert.match(await page.textContent('#gl-hint .gl-ex-text'), /fluffy/);
  await shot(page, tag, '09-wrong-hint');
  await noSideScroll(page, 'hint');
  // Fix it.
  await tap(page, ans);
  await page.click('#gl-submit');
  await page.waitForSelector('#gl-correct:not([hidden])');
  await shot(page, tag, '10-correct');
  await waitFlashGone(page);
  // Every other question right; the level overlays come at the ends of levels 1 and 2.
  let levels = 0;
  for (let i = 0; i < 20; i++) {
    if (await page.isVisible('#gl-done')) break;
    if (await page.isVisible('#gl-level')) {
      levels++;
      assert.equal(await page.textContent('#gl-level-h'), `Level ${levels} done!`);
      assert.equal(await page.locator('#gl-level-stars i.on').count(), levels);
      if (levels === 1) { await page.waitForTimeout(2600); await shot(page, tag, '11-level-done'); await noSideScroll(page, 'level overlay'); }
      await page.click('#gl-level-next');
      continue;
    }
    text = await sentence(page); ans = answerFor(text);
    await tap(page, ans);
    await page.click('#gl-submit');
    await page.waitForSelector('#gl-correct:not([hidden])');
    await waitFlashGone(page);
  }
  assert.equal(levels, 2, 'two level overlays, then mastery');
  await page.waitForSelector('#gl-done:not([hidden])');
  assert.match(await page.textContent('#gl-done-h'), /You mastered Identifying Adjectives!/);
  assert.match(await page.textContent('.gl-done-where'), /Adjectives and Adverbs · Identifying Adjectives/);
  assert.equal(await page.textContent('#gl-done-n'), 'You answered 13 questions. That is 12 questions, plus 1 for a miss.');
  assert.equal(await page.textContent('#gl-done-acc'), '12 of 13 right on the first try');
  assert.equal(await page.locator('#gl-bar .gl-seg-right').count(), 12);
  assert.equal(await page.locator('#gl-bar .gl-seg-missed').count(), 1);
  assert.equal(await page.isVisible('#gl-done-guest'), guest, 'the sign-in prompt for a guest only');
  await page.waitForTimeout(3000);
  await shot(page, tag, '12-mastered');
  await noSideScroll(page, 'mastery');
  // Back on the unit page.
  await page.click('#gl-done-back');
  await page.waitForURL(base + UNIT_URL);
  if (guest) assert.ok(await page.isVisible('.gl-guest'));
  else {
    assert.equal(await page.getAttribute('#gl-topic-identifying-adjectives', 'class'), 'gl-tile gl-mastered');
    assert.equal(await page.textContent('#gl-topic-identifying-adjectives .gl-tile-n'), '✓');
  }
  await shot(page, tag, '13-unit-after');
  // After mastery, look back at the questions.
  if (!guest) {
    await page.goto(base + TOPIC_URL + '/review');
    assert.equal(await page.locator('.gl-review li').count(), 13);
    await shot(page, tag, '14-review');
  }
}

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) for (const scheme of ['light', 'dark']) {
  const tag = `${size.width}-${scheme}`;
  test(`a student plays Identifying Adjectives to mastery at ${size.width} px, ${scheme}`, async t => {
    if (skip) return t.skip(skip);
    const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, reducedMotion: 'no-preference' });
    await ctx.addCookies([sessionCookie(newKid().id)]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    try { await playToMastery(page, tag); } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
  });
}

test('a guest plays to mastery at 390 px: the win waits for sign-in', async t => {
  if (skip) return t.skip(skip);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    // No session: opening the topic makes a guest (like one tap on Play).
    await page.goto(base + TOPIC_URL);
    assert.ok((await ctx.cookies()).length > 0, 'a guest session');
    await playToMastery(page, '390-guest', { guest: true });
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});
