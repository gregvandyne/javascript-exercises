// Lily Hop's card cover (loaded by scripts/covers.js): the pond in the middle of a hop, through the game's own
// buttons and its test handle (window.__brbTest): the Wizard helper on the number line of Hop to 20, round 2
// answered and the helper hopping from pad to pad towards ten. Playwright frame calls only (f is the game
// frame inside the real sandbox).
export default {
  'lily-hop': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__ready === true && window.__brbTest && window.__brbTest.state().screen === 'hero', null, { timeout: 90000 });
      await f.click('#hero-mage');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'menu', null, { timeout: 20000 });
      await f.click('#ch-twenty');
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => window.__brbTest.fast());
      for (let round = 1; round < 2; round++) {
        const n = await f.evaluate(() => window.__brbTest.state().answer);
        await f.click('#lh-n' + n);
        await f.waitForFunction(r => window.__brbTest.state().round === r + 1, round, { timeout: 20000 });
      }
      await f.evaluate(() => window.__brbTest.fast(false));
      await f.waitForTimeout(600);
      await f.click('#lh-n' + await f.evaluate(() => window.__brbTest.state().answer));
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForTimeout(520);
    },
  },
};
