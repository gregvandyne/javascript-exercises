// Crossword's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the sample puzzle (space
// words) about half solved, through the game's own test handle (window.__brbTest): a few answers typed
// and the next word picked, so its clue sits in the bar. Playwright frame calls only (f is the game frame inside the
// real sandbox).
export default {
  crossword: {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.cwSample, null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.cwSample());
      await f.waitForFunction(() => window.__brbTest.cwState().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => {
        const T = window.__brbTest, s = T.cwState();
        for (const e of s.answers.slice(0, 4)) { T.cwSelect(e.r, e.c, e.dir); T.cwType(e.letters); }
        const n = s.answers[4]; if (n) T.cwSelect(n.r, n.c, n.dir);
        const a = document.activeElement; if (a && a.blur) a.blur();
      });
      await f.waitForTimeout(1200);
    },
  },
};
