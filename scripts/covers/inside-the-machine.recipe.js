// Cover recipe for Inside the Machine (loaded by scripts/covers.js, the same entry shape as RECIPES['gulp-city']):
// a 360x480 portrait of the Fix-It desk, Explorer ticket 3 (no sound in the headphones) with two checks already
// done and Gizmo cheering and pointing on the bench. Only Playwright frame calls: f is the game frame.
export default {
  'inside-the-machine': {
    viewport: { width: 360, height: 480 }, touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.cover());
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play' && document.querySelectorAll('.im-tile.dim, .im-tile.good').length >= 2);
      await f.waitForTimeout(900);
    },
  },
};
