// Box by Box's card cover (loaded by scripts/covers.js): the teacher's path: the empty activity list with its New
// activity buttons, at a card's shape. Playwright frame calls only.
export default {
  'box-by-box': {
    viewport: { width: 360, height: 480 },
    scale: 1.5,
    async prep(f) {
      await f.waitForSelector('text=Who’s playing?', { timeout: 30000 });
      await f.click('text=I’m a teacher');
      await f.waitForSelector('text=Your activities', { timeout: 30000 });
      await f.evaluate(() => document.fonts.ready);
      await f.waitForTimeout(800);
    },
  },
};
