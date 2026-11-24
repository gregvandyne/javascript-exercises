// Word Peek's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides the built-in
// recipe): a practice game in Crossword's widget look, three coloured rows with CR being typed in the fourth, through the
// game's own test handle (window.__brbTest). A 432x576 window at 1.25x (the same 540x720 picture) so the keyboard fits.
export default {
  'word-peek': { viewport: { width: 432, height: 576 }, scale: 1.25, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.guess, null, { timeout: 60000 });
    await f.evaluate(() => {
      const t = window.__brbTest;
      t.skipAnimations(true); t.start({ mode: 'practice', answer: 'crane' });
      t.guess('stare'); t.guess('plant'); t.guess('cream');
      t.skipAnimations(false); t.type('cr');
      const a = document.activeElement; if (a && a.blur) a.blur();
    });
    await f.waitForTimeout(1600);
  } },
};
