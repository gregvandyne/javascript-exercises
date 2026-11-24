// Algebra Builder's card cover (loaded by scripts/covers.js): a student practising on their own, with the balance and
// its algebra tiles on screen (never the "Who's playing?" or gallery setup screens). Playwright frame calls only.
export default {
  'algebra-builder': {
    viewport: { width: 600, height: 800 },
    scale: 0.9,
    async prep(f) {
      await f.waitForSelector('text=Who’s playing?', { timeout: 30000 });
      await f.click('text=I’m a student');
      await f.click('button.start', { timeout: 15000 });   // Start practicing, at the default topic and level
      await f.evaluate(() => document.fonts.ready);
      await f.waitForTimeout(2500);
    },
  },
};
