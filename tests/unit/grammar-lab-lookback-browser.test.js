// Grammar Lab on a phone: a question about a faulty sentence (a 3-5 fragment, a 6-8 misplaced modifier). Answered right,
// the green confirmation shows the sentence fixed under a check, in the after style; mastered, "look back" shows the
// faulty sentence struck through after a cross and the fix after a check, never the faulty sentence on its own.
// Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));

for (const [band, unit, topic] of [['3-5', 'fixing-sentences', 'recognizing-fragments'], ['6-8', 'modifiers', 'misplaced-meaning']]) {
  test(`${topic} at 390 px: the confirmation and "look back" show the sentence fixed`, { timeout: 200_000 }, async t => {
    if (env.skip) return t.skip(env.skip);
    const ctx = await env.browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', reducedMotion: 'reduce' });
    const kid = H.newKid('gllb');
    const p = H.GL.pathwaysOf(band).find(x => x.id === unit);
    for (const id of p.topics.slice(0, p.topics.indexOf(topic))) H.master(kid, id, band);
    await ctx.addCookies([H.sessionCookie(kid.id, env.base)]);
    const page = await ctx.newPage();
    const box = H.watch(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let shown = 0;
    try {
      await page.goto(`${env.base}/courses/grammar-lab/${band}/${unit}/${topic}`);
      await page.click('#gl-skip'); await page.click('#gl-card-go');
      await page.waitForSelector('#gl-quiz:not([hidden])');
      await H.closeTip(page);
      for (let i = 0; i < 40 && !(await page.isVisible('#gl-done')); i++) {
        const it = await H.answer(page, box, topic);
        await page.waitForSelector('#gl-correct:not([hidden])');
        if (it.after) {
          assert.ok(await page.isVisible('#gl-correct-after'), `${it.id}: the fix is shown`);
          assert.equal((await page.textContent('#gl-correct-after-t')).trim(), it.after);
          assert.equal(await page.locator('#gl-correct-after .gl-ba-after .gl-ba-sign').textContent(), '✓');
          const r = await page.locator('#gl-correct-after').boundingBox();
          assert.ok(r.x >= 0 && r.x + r.width <= 390, `${it.id}: the fix fits the phone`);
          if (!shown++) await H.shot(page, `lookback-after-${topic}-confirm`);
        } else assert.ok(await page.isHidden('#gl-correct-after'), `${it.id}: no fix for a right sentence`);
        await page.click('#gl-correct').catch(() => {});
        await page.waitForSelector('#gl-correct', { state: 'hidden' });
        if (await page.isVisible('#gl-level')) await page.click('#gl-level-next');
      }
      assert.ok(shown, 'a question with a fix was asked');
      await page.waitForSelector('#gl-done:not([hidden])');
      await page.goto(`${env.base}/courses/grammar-lab/${band}/${unit}/${topic}/review`);
      const fixes = page.locator('.gl-review-fix');
      assert.ok(await fixes.count() > 0, 'look back shows fixes');
      for (const f of await fixes.all()) {
        assert.equal(await f.locator('.gl-ba-before .gl-ba-sign').textContent(), '✗');
        assert.match(await f.locator('.gl-ba-before .gl-ba-text').evaluate(e => getComputedStyle(e).textDecorationLine), /line-through/);
        assert.equal(await f.locator('.gl-ba-after .gl-ba-sign').textContent(), '✓');
      }
      await H.shot(page, `lookback-after-${topic}-review`);
    } finally { await ctx.close(); }
    assert.deepEqual(errors, []);
  });
}
