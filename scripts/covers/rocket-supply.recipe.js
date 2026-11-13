// Rocket Supply's card cover (loaded by scripts/covers.js): the launch pad mid-round, through the game's own buttons
// and its test handle (window.__brbTest): the Wizard helper in Load the Rocket, round 4 (a load of three different
// digits to read: pallets, racks and canisters on the pad, three number buttons), with the rocket and the base
// behind. Playwright frame calls only (f is the game frame inside the real sandbox).
export default {
  'rocket-supply': {
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
      // rounds 1 to 3 the quick way (the handle loads the number, or picks it), then round 4 at the game's own speed
      for (let r = 1; r <= 3; r++) {
        await f.waitForFunction(n => window.__brbTest.state().round === n && window.__brbTest.state().phase === 'play', r, { timeout: 20000 });
        await f.evaluate(() => {
          const T = window.__brbTest, s = T.state();
          if (s.kind !== 'build') return T.act('answer', s.answer);
          for (let i = 0; i < Math.floor(s.target / 10); i++) T.act('load', 't');
          for (let i = 0; i < s.target % 10; i++) T.act('load', 'o');
          T.act('go');
        });
        if (r === 3) await f.evaluate(() => window.__brbTest.fast(false));
      }
      await f.waitForFunction(() => window.__brbTest.state().round === 4 && window.__brbTest.state().phase === 'play' && window.__brbTest.state().moving === 0, null, { timeout: 120000 });
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForTimeout(1100);
    },
  },
};
