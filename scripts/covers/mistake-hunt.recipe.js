// Mistake Hunt's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the sample passage (the
// Moon) with two mistakes fixed and checked, through the game's own test handle (window.__brbTest), so the card shows
// the passage, green fixes and "You found 2 of 6". Playwright frame calls only (f is the game frame inside the real sandbox).
export default {
  'mistake-hunt': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.mhSample, null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.mhSample());
      await f.waitForFunction(() => window.__brbTest.mhState().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => {
        const T = window.__brbTest;
        for (const k of T.mhKey().slice(0, 2)) T.mhFix(k.a, k.b, k.right);
        T.mhCheck();
        const a = document.activeElement; if (a && a.blur) a.blur();
        scrollTo(0, 0);
      });
      await f.waitForTimeout(1200);
    },
  },
};
