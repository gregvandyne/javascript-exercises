// Grammar Lab: every topic's teaching card on a phone (320 x 568 and 390 x 844), every band. A card's worked examples
// mark words (colored highlights, small labels like "comma" under a mark, capital and comma markers): none of those, nor
// any word, may overlap another, stick out sideways or be cut off (tests/unit/_grammar-lab-play.js cardOverlaps). One
// browser and one page for all of them; dark mode on a sample (the same layout, other colors). Screenshots with
// GL_SHOTS=<dir>. GL_CARDS=<topic,...> checks only those. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
const GL = H.GL;

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const only = (process.env.GL_CARDS || '').split(',').filter(Boolean);

/** Every topic once in each band it is taught in (a band changes the card's type size): [band, unit, topic]. */
const CARDS = (() => {
  const seen = new Set(), out = [];
  for (const b of GL.bands()) for (const p of GL.pathwaysOf(b.id)) for (const id of p.topics) {
    if (seen.has(`${b.id}/${id}`) || (only.length && !only.includes(id))) continue;
    seen.add(`${b.id}/${id}`); out.push([b.id, p.id, id]);
  }
  return out;
})();
const SIZES = [{ width: 320, height: 568 }, { width: 390, height: 844 }];

test(`every teaching card (${CARDS.length}) on a phone: no marked word or label overlaps, nothing sideways or cut off`, { timeout: 270_000 }, async t => {
  if (env.skip) return t.skip(env.skip);
  assert.ok(only.length || CARDS.length > 150, `every topic: ${CARDS.length}`);
  const ctx = await env.browser.newContext({ viewport: SIZES[0], colorScheme: 'light', reducedMotion: 'reduce' });
  const kid = H.newKid('glcard');
  await ctx.addCookies([H.sessionCookie(kid.id, env.base)]);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const bad = [];
  try {
    for (const size of SIZES) {
      await page.setViewportSize(size);
      for (const [i, [band, unit, topic]] of CARDS.entries()) {
        // dark on a sample: every seventh card
        const themes = i % 7 === 0 ? ['light', 'dark'] : ['light'];
        await page.goto(`${env.base}/courses/grammar-lab/${band}/${unit}/${topic}/card`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => document.fonts.ready);
        for (const th of themes) {
          await page.emulateMedia({ colorScheme: th });
          const pr = await H.cardOverlaps(page);
          if (pr.length) bad.push([`${band}/${topic} ${size.width} ${th}`, pr]);
          if (H.SHOTS && (pr.length || only.length)) await page.screenshot({ path: `${H.SHOTS}/card-${band}-${topic}-${size.width}-${th}.png`, fullPage: true });
        }
        await page.emulateMedia({ colorScheme: 'light' });
      }
    }
  } finally { await ctx.close(); }
  const cards = new Set(bad.map(([s]) => s.split(' ')[0]));
  t.diagnostic(`${cards.size} cards with problems`);
  assert.deepEqual(errors, [], 'no page errors');
  assert.equal(bad.length, 0, `${cards.size} cards with problems:\n${bad.map(([s, pr]) => `${s}:\n    ${pr.slice(0, 6).join('\n    ')}${pr.length > 6 ? `\n    (and ${pr.length - 6} more)` : ''}`).join('\n')}`);
});
