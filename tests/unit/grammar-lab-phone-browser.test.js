// Grammar Lab, Phase 4: the phone checks for every band (tests/unit/_grammar-lab-phone.js), at 320 x 568 and 390 x 844,
// light and dark, in English. Each band: the course page, a unit and its menu, a teaching card, at least three question
// formats, a topic's welcome, a wrong answer and its hint, a level-done overlay, the mastery screen and the topic's
// proofread room, with nothing sideways, cut off, stuck under the top bar or the bottom nav, or starting a line with a
// punctuation mark. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium. GL_BANDS=k-2,3-5 runs only those bands.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './_grammar-lab-play.js';
import { PLAN, SIZES, phoneRun, assertClean } from './_grammar-lab-phone.js';

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));
const only = (process.env.GL_BANDS || '').split(',').filter(Boolean);

for (const band of Object.keys(PLAN)) {
  test(`phone checks, grades ${band}: 320 and 390 px, light and dark`, { timeout: 200_000, skip: only.length > 0 && !only.includes(band) }, async t => {
    if (env.skip) return t.skip(env.skip);
    const kinds = new Set();
    for (const size of SIZES) {
      const out = await phoneRun(env, band, size);
      assertClean(out, `${band} at ${size.width}`);
      for (const k of out.kinds) kinds.add(k);
      assert.ok(H.GL.masteredSet(out.kid).has(PLAN[band].play[1]), 'the topic played is mastered');
    }
    assert.ok(kinds.size >= 3, `at least three question formats: ${[...kinds]}`);
  });
}
