// Word Hunt's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides the built-in
// recipe): the Space puzzle at Medium in Crossword's widget look, four words found, through the game's own test handle
// (window.__brbTest). A 480x640 window at 1.125x (the same 540x720 picture as before) so the whole grid fits on the card.
export default {
  'word-hunt': { viewport: { width: 480, height: 640 }, scale: 1.125, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.start && window.__brbTest.whState, null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.start({ theme: 'Space', difficulty: 'medium', seed: 3 }));
    await f.evaluate(() => { const t = window.__brbTest; t.skipAnimations(); const s = t.state(); s.words.slice(0, 4).forEach(w => t.select(w.start, w.end)); });
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await f.waitForTimeout(1500);
  } },
};
