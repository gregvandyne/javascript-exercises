// Balance Bridge's card cover (loaded by scripts/covers.js): the see-saw bridge mid-round, through the game's own
// buttons and its test handle (window.__brbTest): the Wizard helper in Same on Both Sides, round 4 (7 + ? = 10), the
// right number picked, its blocks landed, the bridge level and the helper walking across it. Playwright frame calls
// only (f is the game frame inside the real sandbox).
export default {
  'balance-bridge': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__ready === true && window.__brbTest && window.__brbTest.state().screen === 'hero', null, { timeout: 90000 });
      await f.click('#hero-mage');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'menu', null, { timeout: 20000 });
      await f.click('#ch-equal');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => window.__brbTest.fast());
      // rounds 1 to 3 the quick way, then round 4 at the game's own speed
      for (let r = 1; r <= 3; r++) {
        await f.waitForFunction(n => window.__brbTest.state().round === n && window.__brbTest.state().phase === 'play', r, { timeout: 20000 });
        await f.evaluate(() => window.__brbTest.act('answer', window.__brbTest.state().answer));
      }
      await f.waitForFunction(() => window.__brbTest.state().round === 4 && window.__brbTest.state().phase === 'play', null, { timeout: 20000 });
      await f.evaluate(() => window.__brbTest.fast(false));
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.click('#bb-n' + s.answer);
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForFunction(n => window.__brbTest.state().crossed > n || window.__brbTest.state().round > 4, s.crossed, { timeout: 120000 });
      await f.waitForTimeout(1100);
    },
  },
};
