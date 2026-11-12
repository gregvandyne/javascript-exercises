// Garden Count's card cover (loaded by scripts/covers.js): the counting garden mid-round, through the game's own
// buttons and its test handle (window.__brbTest): the Wizard helper, the third counting round, five apples already in
// the basket and the big counter on 5. Playwright frame calls only (f is the game frame inside the real sandbox).
export default {
  'garden-count': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__ready === true && window.__brbTest && window.__brbTest.state().screen === 'hero', null, { timeout: 90000 });
      await f.click('#hero-mage');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'menu', null, { timeout: 20000 });
      await f.click('#ch-count');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => window.__brbTest.fast());
      for (let round = 1; round < 3; round++) {
        const n = await f.evaluate(() => window.__brbTest.state().target);
        for (let i = 0; i < n; i++) await f.click('#gc-pick');
        await f.click('#gc-done');
        await f.waitForFunction(r => window.__brbTest.state().round === r + 1, round, { timeout: 20000 });
      }
      await f.evaluate(() => window.__brbTest.fast(false));
      for (let i = 0; i < 5; i++) { await f.click('#gc-pick'); await f.waitForTimeout(350); }
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForTimeout(1200);
    },
  },
};
