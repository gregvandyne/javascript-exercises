// Data Detective's card cover (loaded by scripts/covers.js): Pet Parade (Sort & Group, case 3) grouped by Pet, three
// bars with their printed counts, the Group chip pressed, Dot pleased with "Pin your claim!" under the chart. The claim
// card stays closed: on a card-sized frame it would hide the data. Same entry shape as RECIPES['gulp-city']; Playwright
// frame calls only (f is the game frame inside the real sandbox).
export default {
  'data-detective': {
    viewport: { width: 360, height: 480 },
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && typeof window.__brbTest.cover === 'function' && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.skipAnimations());
      await f.evaluate(() => window.__brbTest.cover());
      await f.waitForFunction(() => { const s = window.__brbTest.state(); return s.screen === 'play' && s.view === 'group' && document.querySelectorAll('.barcol').length === 3; }, null, { timeout: 20000 });
      await f.waitForTimeout(900);
    },
  },
};
