// Grammar Lab: the teaching card is a step of the lesson. The welcome (the rule and the counts) leads to the card (and
// "Skip intro" skips only the welcome), the card's "Start the questions" starts the run, and nothing is asked of the
// server before then. During the questions "Teaching card" opens the same card in a sheet over the lesson (a bottom
// sheet on a phone, a side panel on a wide screen): Escape, the close button or a tap outside closes it, the focus goes
// back, and the question, its picks, the progress and the scroll stay as they were. A run in progress opens on its
// question, never on the card; a student who read the card before gets "Skip to questions". The /card URL still works.
// Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
const GL = H.GL;

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const BAND = 'k-2', UNIT = 'adjectives-and-adverbs', TOPIC = 'identifying-adjectives';
const URL0 = `/courses/grammar-lab/${BAND}/${UNIT}/${TOPIC}`;

async function open(size = { width: 390, height: 844 }, kid = H.newKid('glflow')) {
  const ctx = await env.browser.newContext({ viewport: size, reducedMotion: 'reduce' });
  await ctx.addCookies([H.sessionCookie(kid.id, env.base)]);
  const page = await ctx.newPage();
  const errors = [], starts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/\/topic\/[^/]+\/start$/.test(r.url())) starts.push(r.url()); });
  return { ctx, page, errors, starts, kid, box: H.watch(page) };
}
const visible = (page, sel) => page.isVisible(sel);

test('welcome, then the teaching card, then the questions; "Skip intro" skips only the welcome', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  const { ctx, page, errors, starts } = await open();
  try {
    await page.goto(env.base + URL0);
    await page.waitForSelector('#gl-welcome:not([hidden])');
    assert.ok(!(await visible(page, '#gl-cardstep')) && !(await visible(page, '#gl-quiz')));
    await page.click('#gl-go');
    await page.waitForSelector('#gl-cardstep:not([hidden])');
    assert.ok(!(await visible(page, '#gl-welcome')) && !(await visible(page, '#gl-quiz')) && !(await visible(page, '#gl-meter')));
    assert.equal((await page.textContent('#gl-card-h')).trim(), GL.topic(TOPIC).title);
    assert.equal(await page.getAttribute('#gl-card-h', 'lang'), 'en', 'course text marked English');
    assert.ok(await page.locator('#gl-cardstep .gl-card-body .gl-def').isVisible(), 'the whole card, not its short form');
    assert.ok(!(await visible(page, '#gl-card-skip')), 'a first visit reads the card: no skip');
    assert.ok(!(await visible(page, '#gl-card-btn')), 'no header card button on the card itself');
    assert.equal((await page.textContent('#gl-card-go')).trim(), 'Start the questions');
    assert.deepEqual(starts, [], 'the run starts only from the card');
    assert.deepEqual(await H.layoutProblems(page, { keys: ['#gl-cardstep-h', '#gl-card-h'] }), []);
    await H.shot(page, 'flow-k-2-390-card-step');
    await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    assert.equal(starts.length, 1);
    assert.ok(await visible(page, '#gl-card-btn'), 'the card stays a tap away');
    assert.match(await page.textContent('#gl-counter'), /^Question 1 of \d+$/);
    await H.closeTip(page);

    // another topic, by "Skip intro": the card still comes first
    const k2 = H.newKid('glflow');
    await ctx.addCookies([H.sessionCookie(k2.id, env.base)]);
    await page.goto(`${env.base}/courses/grammar-lab/${BAND}/${UNIT}/${TOPIC}`);
    await page.click('#gl-skip');
    await page.waitForSelector('#gl-cardstep:not([hidden])');
    assert.equal(starts.length, 1);
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});

for (const [label, size] of [['a phone: a bottom sheet', { width: 390, height: 844 }], ['a wide screen: a side panel', { width: 1280, height: 800 }]]) {
  test(`the card during the questions, on ${label}, keeps the question, its picks and the progress`, { timeout: 60_000 }, async t => {
    if (env.skip) return t.skip(env.skip);
    const { ctx, page, errors, box } = await open(size);
    try {
      await page.goto(env.base + URL0);
      await page.click('#gl-go'); await page.click('#gl-card-go');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await H.closeTip(page);
      // one right answer, then a word picked on the next question (not submitted)
      await H.answer(page, box, TOPIC);
      await H.passFlash(page);
      await H.syncBox(page, box);
      const before = { counter: await page.textContent('#gl-counter'), ask: await page.textContent('#gl-ask'), sentence: await page.textContent('#gl-sentence'), url: page.url() };
      await page.click('#gl-sentence .gl-w[data-i="0"]');

      await page.click('#gl-card-btn');
      await page.waitForSelector('#gl-cardsheet[open]');
      const y = await page.evaluate(() => window.scrollY);
      assert.equal(page.url(), before.url, 'no navigation');
      assert.equal(await page.locator('#gl-cardsheet #gl-card .gl-def').count(), 1, 'the card, in the sheet');
      const r = await page.evaluate(() => { const b = document.getElementById('gl-cardsheet').getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: innerWidth, h: innerHeight }; });
      if (size.width < 800) { assert.ok(Math.abs(r.bottom - r.h) < 2 && r.left < 1 && r.right > r.w - 2 && r.top > 40, `a bottom sheet: ${JSON.stringify(r)}`); }
      else { assert.ok(Math.abs(r.right - r.w) < 2 && r.top < 90 && Math.abs(r.bottom - r.h) < 2 && r.left > r.w / 2, `a side panel: ${JSON.stringify(r)}`); }
      assert.deepEqual(await H.layoutProblems(page, { keys: ['#gl-sheet-x', '#gl-card-h'], bottom: false }), []);
      await H.shot(page, `flow-${BAND}-${size.width}-card-sheet`);
      // Escape closes it, and the focus comes back to the button
      await page.keyboard.press('Escape');
      await page.waitForSelector('#gl-cardsheet', { state: 'hidden' });
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'gl-card-btn');
      // the close button and a tap outside close it too
      await page.click('#gl-card-btn'); await page.waitForSelector('#gl-cardsheet[open]');
      await page.click('#gl-sheet-x'); await page.waitForSelector('#gl-cardsheet', { state: 'hidden' });
      await page.click('#gl-card-btn'); await page.waitForSelector('#gl-cardsheet[open]');
      await page.mouse.click(5, 5); await page.waitForSelector('#gl-cardsheet', { state: 'hidden' });
      // all as it was
      assert.equal(await page.textContent('#gl-counter'), before.counter);
      assert.equal(await page.textContent('#gl-ask'), before.ask);
      assert.equal(await page.textContent('#gl-sentence'), before.sentence);
      assert.equal(await page.getAttribute('#gl-sentence .gl-w[data-i="0"]', 'aria-pressed'), 'true', 'the pick kept');
      assert.ok(await page.isEnabled('#gl-submit'));
      assert.equal(await page.evaluate(() => window.scrollY), y, 'the scroll kept');
      // the page still has no answer: the card is the topic's teaching, the question's answer never came
      const d = await page.evaluate(() => document.getElementById('page-data').textContent);
      assert.doesNotMatch(d, /"answer"/);
    } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
  });
}

test('a resumed run opens on its question, not the card; a returning student may skip the card', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  const { ctx, page, errors, starts, box, kid } = await open();
  try {
    await page.goto(env.base + URL0);
    await page.click('#gl-go'); await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    await H.closeTip(page);
    await H.answer(page, box, TOPIC); await H.passFlash(page);
    const counter = await page.textContent('#gl-counter');
    await page.reload();
    await page.waitForSelector('#gl-quiz:not([hidden])');
    assert.ok(!(await visible(page, '#gl-cardstep')) && !(await visible(page, '#gl-welcome')), 'straight to the question');
    assert.equal(await page.textContent('#gl-counter'), counter);
    assert.ok(await visible(page, '#gl-card-btn'));
    // a returning student (the card read before; here, playing the topic again): "Skip to questions" on the card
    H.master(kid, TOPIC, BAND);
    await page.goto(`${env.base}${URL0}?again=1`);
    await page.click('#gl-skip');
    await page.waitForSelector('#gl-cardstep:not([hidden])');
    assert.ok(await visible(page, '#gl-card-skip'));
    assert.deepEqual(await H.layoutProblems(page, { keys: ['#gl-card-skip', '#gl-card-h'] }), []);
    const n = starts.length;
    await page.click('#gl-card-skip');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    assert.equal(starts.length, n + 1);
    assert.match(await page.textContent('#gl-counter'), /^Question 1 of /, 'a fresh run');
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});

test('the /card URL still opens the card on its own, and the header link leads there without the script', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  const { ctx, page, errors } = await open();
  try {
    const res = await page.goto(`${env.base}${URL0}/card`);
    assert.equal(res.status(), 200);
    assert.equal((await page.textContent('h1#gl-card-h')).trim(), GL.topic(TOPIC).title);
    assert.ok(await page.locator('.gl-card-body .gl-def').isVisible());
    assert.equal(await page.getAttribute('.gl-card-go a', 'href'), URL0);
    assert.deepEqual(await H.cardOverlaps(page), []);
    await page.goto(env.base + URL0);
    assert.equal(await page.getAttribute('#gl-card-btn', 'href'), `${URL0}/card`);
    // a new tab (a modified click) still follows the link
    await page.click('#gl-go'); await page.click('#gl-card-go');
    await page.waitForSelector('#gl-quiz:not([hidden])');
    await H.closeTip(page);
    const [tab] = await Promise.all([ctx.waitForEvent('page'), page.click('#gl-card-btn', { modifiers: ['Control'] })]);
    await tab.waitForURL(/\/card$/);
    assert.match(tab.url(), /\/card$/);
    assert.ok(!(await page.isVisible('#gl-cardsheet')));
  } finally { await ctx.close(); }
  assert.deepEqual(errors, []);
});
