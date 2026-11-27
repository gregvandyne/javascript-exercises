// Grammar Lab, Phase 4: the final playthrough, every band (tests/unit/_grammar-lab-playthrough.js). A
// signed-in student plays one whole unit of each band end to end on a 390 px phone, with a deliberate wrong answer in
// every topic, and the test checks mastery, the rings, the next topic, the locks, "Also counts in", the room badge and
// the course page's counts. Screenshots with GL_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import * as H from './_grammar-lab-play.js';
import { UNITS, playUnit } from './_grammar-lab-playthrough.js';

const env = {};
test.before(() => H.startAll(env));
test.after(() => H.stopAll(env));

for (const band of Object.keys(UNITS)) {
  test(`a whole ${band} unit (${UNITS[band]}) end to end, one wrong answer in every topic`, { timeout: 240_000 }, async t => {
    if (env.skip) return t.skip(env.skip);
    const { notes } = await playUnit(env, band);
    for (const x of notes) t.diagnostic(x);
  });
}
