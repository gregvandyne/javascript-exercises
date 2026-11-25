// Arithmetic Lab's card cover (loaded by scripts/covers.js): a student practising on their own, a long division on the
// graph paper (never the "Who's playing?" or activity-list setup screens). Playwright frame calls only.
export default {
  'arithmetic-lab': {
    viewport: { width: 600, height: 800 },
    scale: 0.9,
    async prep(f) {
      await f.waitForSelector('text=Who’s playing?', { timeout: 30000 });
      await f.click('text=I’m a student');
      await f.click('text=Start practicing', { timeout: 15000 });   // the default kind, level and help
      await f.click('button:has-text("Start")', { timeout: 15000 });   // the steps card, then the first problem
      await f.evaluate(() => document.fonts.ready);
      await f.waitForTimeout(2500);
    },
  },
};
