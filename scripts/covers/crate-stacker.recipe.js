// Crate Stacker's card cover (loaded by scripts/covers.js): the loading yard mid-round, through the game's own
// buttons and its test handle (window.__brbTest): the Wizard helper on the cab roof in Load the Truck, round 2, three
// towers and four loose crates on the truck and one more crate on its way down. Playwright frame calls only (f is
// the game frame inside the real sandbox).
export default {
  'crate-stacker': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__ready === true && window.__brbTest && window.__brbTest.state().screen === 'hero', null, { timeout: 90000 });
      await f.click('#hero-mage');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'menu', null, { timeout: 20000 });
      await f.click('#ch-build');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => window.__brbTest.fast());
      // round 1 the quick way, then round 2 by hand
      const one = await f.evaluate(() => window.__brbTest.state());
      for (let i = 0; i < one.tens; i++) await f.click('#cs-ten');
      for (let i = 0; i < one.ones; i++) await f.click('#cs-one');
      await f.click('#cs-go');
      await f.waitForFunction(() => window.__brbTest.state().round === 2, null, { timeout: 20000 });
      for (let i = 0; i < 3; i++) await f.click('#cs-ten');
      for (let i = 0; i < 4; i++) await f.click('#cs-one');
      await f.evaluate(() => window.__brbTest.fast(false));
      await f.waitForTimeout(700);
      await f.click('#cs-one');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForTimeout(230);
    },
  },
};
