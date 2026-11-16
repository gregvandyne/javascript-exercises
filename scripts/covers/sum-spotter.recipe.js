// Sum Spotter's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a Sums to 20 pond in the
// meadow through the game's own test handle (window.__brbTest), with Pip's first hint showing one of the two numbers
// in the sum under the pond. Playwright frame calls only (f is the game frame inside the real sandbox).
export default {
  'sum-spotter': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.pick && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.pick('level', 'add20', { seed: 2026 }));
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => { window.__brbTest.hint(); const a = document.activeElement; if (a && a.blur) a.blur(); });
      await f.waitForTimeout(1200);
    },
  },
};
