// Data Detective's card cover (loaded by scripts/covers.js): Pet Parade (Sort & Group, case 3) grouped by Pet, the bars
// up, Dot pleased, and the claim card open over the view. Same entry shape as RECIPES['gulp-city']; Playwright frame
// calls only (f is the game frame inside the real sandbox).
export default {
  'data-detective': {
    viewport: { width: 360, height: 480 },
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && typeof window.__brbTest.cover === 'function' && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.skipAnimations());
      await f.evaluate(() => window.__brbTest.cover());
      await f.waitForFunction(() => { const s = window.__brbTest.state(); return s.screen === 'play' && s.claimsOpen; }, null, { timeout: 20000 });
      await f.waitForTimeout(900);
    },
  },
};
