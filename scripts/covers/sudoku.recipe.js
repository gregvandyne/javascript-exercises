// Sudoku's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a Small 6x6 puzzle half solved
// in the meadow, through the game's own test handle (window.__brbTest): a few numbers placed, one box with notes, and a
// placed 3 picked so its row, column, box and the other 3s light up. Playwright frame calls only (f is the game frame
// inside the real sandbox).
export default {
  sudoku: {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.pick && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.pick('small-easy', { seed: 2026 }));
      await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 20000 });
      await f.evaluate(() => {
        const T = window.__brbTest, s = T.state(), empty = [...s.values].map((c, i) => (c === '0' ? i : -1)).filter(i => i >= 0);
        for (const i of empty.slice(0, 7)) { T.select(i); T.press(+s.solution[i]); }
        const v = [...s.values].map(Number), cands = i => { const m = T.core.candidates(v, 6, i), ds = []; for (let d = 1; d <= 6; d++) if (m & (1 << (d - 1))) ds.push(d); return ds; };
        const open = empty.slice(7).sort((a, b) => cands(b).length - cands(a).length);   // the boxes with the most notes (as jotted at the start)
        for (const i of open.slice(0, 2)) T.jot(i, cands(i));
        const three = [...T.state().values].findIndex((c, i) => c === '3' && s.puzzle[i] === '0');
        T.select(three >= 0 ? three : empty[0]);
        T.setTime(95);
        const a = document.activeElement; if (a && a.blur) a.blur();
      });
      await f.waitForTimeout(1200);
    },
  },
};
