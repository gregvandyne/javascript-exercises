// Flashcards' card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a starter library set (the
// solar system) in Flip, on a card with its emoji, through the game's own test handle (window.__brbTest). Playwright
// frame calls only (f is the game frame inside the real sandbox).
export default {
  flashcards: {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.fcLib, null, { timeout: 60000 });
      await f.evaluate(() => { window.__brbTest.fcLib('solar-system'); window.__brbTest.fcFlip(6); });
      await f.waitForFunction(() => window.__brbTest.fcState().screen === 'flip', null, { timeout: 20000 });
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); scrollTo(0, 0); });
      await f.waitForTimeout(1200);
    },
  },
};
