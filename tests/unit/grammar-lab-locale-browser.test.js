// Grammar Lab, Phase 4: the user interface is translated, the lessons stay English. Every band at a 390 px phone, in
// German (long words) and in Arabic (right to left), through the same screens as the phone checks
// (tests/unit/_grammar-lab-phone.js): nothing sideways, cut off, under the bars or starting a line with punctuation, and
// every unit and topic name (course text) inside lang="en". In Arabic the page runs right to left and the course text
// inside it left to right. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
import { PLAN, phoneRun, assertClean, COURSE_TEXT } from './_grammar-lab-phone.js';

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const PHONE = { width: 390, height: 844 };

for (const lang of ['de', 'ar']) {
  test(`every band in ${lang} at 390 px: translated around English lessons`, { timeout: 240_000 }, async t => {
    if (env.skip) return t.skip(env.skip);
    for (const band of Object.keys(PLAN)) {
      const out = await phoneRun(env, band, PHONE, { lang, themes: ['light'], room: band === 'k-2' });
      assertClean(out, `${band} in ${lang}`);
    }
  });
}

test('Arabic mirrors the layout; the English course text inside it reads left to right', { timeout: 60_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  const ctx = await env.browser.newContext({ viewport: PHONE });
  const kid = H.newKid();
  await ctx.addCookies([H.sessionCookie(kid.id, env.base), { name: 'lang', value: 'ar', url: env.base }]);
  const page = await ctx.newPage();
  try {
    await page.goto(`${env.base}/courses/grammar-lab/k-2/commas`);
    assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
    assert.equal(await page.getAttribute('html', 'lang'), 'ar');
    // the ring sits at the start (the right) of the unit's header, the title after it
    const [ring, h1] = await Promise.all(['.gl-unithead .gl-ring', '.gl-unithead h1'].map(s => page.$eval(s, e => e.getBoundingClientRect())));
    assert.ok(ring.left > h1.left, 'the ring is on the right');
    assert.equal(await page.$eval('.gl-unithead h1', e => `${e.lang} ${getComputedStyle(e).direction}`), 'en ltr');
    // a topic tile: its number on the right, its English name left to right
    const [num, name] = await Promise.all(['#gl-topic-commas-in-a-series .gl-tile-n', '#gl-topic-commas-in-a-series .gl-tile-name'].map(s => page.$eval(s, e => e.getBoundingClientRect())));
    assert.ok(num.left > name.left, 'the number is on the right');
    await page.goto(`${env.base}/courses/grammar-lab/k-2/commas/commas-in-a-series`);
    await page.waitForSelector('#gl-welcome:not([hidden])');
    // the back arrow points right in a right-to-left page, and sits on the right
    assert.match(await page.$eval('.gl-qback .flip', e => getComputedStyle(e).transform), /matrix\(-1/);
    const [back, title] = await Promise.all(['.gl-qback', '.gl-qtitle'].map(s => page.$eval(s, e => e.getBoundingClientRect())));
    assert.ok(back.left > title.left, 'back is on the right');
    // the welcome line is Arabic around the English topic name
    assert.equal(await page.$eval('#gl-welcome-h [lang="en"]', e => e.textContent), 'Commas with Single Words in a Series');
    assert.ok(COURSE_TEXT.includes('Commas with Single Words in a Series'));
    await H.shot(page, 'k-2-390-light-ar-rtl-welcome');
  } finally { await ctx.close(); }
});
