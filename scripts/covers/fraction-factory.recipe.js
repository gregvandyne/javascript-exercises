// Fraction Factory's card cover (loaded by scripts/covers.js): Tally's bakery mid-order, through the game's own cover()
// hook (First Cuts, level 3, a fixed seed): a cake cut into fourths with three of the four slices tapped onto the tray,
// Tally's speech panel above it. Before this recipe the game had no cover at all, so every card, share picture and
// Number Quest page that shows it fell back to the 🧁 emoji. Same entry shape as the data-detective recipe; Playwright
// frame calls only (f is the game frame inside the real sandbox).
export default {
  'fraction-factory': {
    viewport: { width: 432, height: 576 },   // a little roomier than a 360 px card, so the whole cake fits under Tally's panel
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && typeof window.__brbTest.cover === 'function' && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.cover());
      await f.waitForFunction(() => { const s = window.__brbTest.state(); return s.denom === 4; }, null, { timeout: 20000 });
      await f.evaluate(() => { try { window.__brbTest.closeCards(); } catch { /* no card up */ } });
      await f.waitForTimeout(900);
    },
  },
};
