// Word Trail's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the felt trail through the
// meadow with three lessons done, Bramble beside the glowing stone and its "Start" tag. The covers server serves
// /vendor/data from disk, so the felt sprites are there.
export default {
  'word-trail': { viewport: { width: 390, height: 520 }, scale: 1.6, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.setSave && window.__brbTest.state().art, null, { timeout: 60000 });
    await f.evaluate(() => {
      const t = window.__brbTest;
      t.setSave({ xp: 64, streak: 3, last: new Date().toISOString().slice(0, 10), played: 3, done: { u0l0: 3, u0l1: 3, u0l2: 2 } });
      t.start();
    });
    await f.waitForTimeout(1200);
  } },
};
