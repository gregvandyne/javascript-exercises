// Algebra Tiles' card cover (loaded by scripts/covers.js): the game's own gallery of activities (its title, then the
// Solve balance and the Multiply rectangle), as a teacher first sees it. Playwright frame calls only.
export default {
  'algebra-tiles': {
    viewport: { width: 360, height: 480 },
    scale: 1.5,
    async prep(f) {
      await f.waitForSelector('text=Choose an activity', { timeout: 30000 });
      await f.evaluate(() => document.fonts.ready);
      await f.waitForTimeout(800);
    },
  },
};
