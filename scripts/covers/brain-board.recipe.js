// Brain Board's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides the built-in
// recipe): the solo practice board in Crossword's widget look (the same board a class sees), three tiles already won with
// the right answers, so the points show. A 432x576 window at 1.25x (the same 540x720 picture as before).
const wait = ms => new Promise(r => setTimeout(r, ms));
const st = f => f.evaluate(() => window.__brbTest.state()).catch(() => ({}));
async function until(f, ok, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (ok(await st(f) || {})) return; await wait(200); } }
export default {
  'brain-board': { viewport: { width: 432, height: 576 }, scale: 1.25, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.pick, null, { timeout: 30000 });
    await until(f, s => s.board);
    for (const [c, r] of [[0, 0], [2, 1], [1, 0]]) {
      await f.evaluate(([c, r]) => window.__brbTest.pick(c, r), [c, r]);
      await until(f, s => s.question && !s.question.answered); await wait(900);
      await f.evaluate(() => { const q = window.__brbTest.state().question; window.__brbTest.answer(q && q.correct != null ? q.correct : 0); });
      await wait(3800);
    }
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await wait(1200);
  } },
};
