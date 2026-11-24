// Would You Rather Live's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides
// the built-in recipe): played alone in Crossword's widget look, a dilemma just voted on with the split showing. A 432x576
// window at 1.25x (the same 540x720 picture as before) so the vote counts under the cards are not cut off.
const wait = ms => new Promise(r => setTimeout(r, ms));
const st = f => f.evaluate(() => window.__brbTest.state()).catch(() => ({}));
async function until(f, ok, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (ok(await st(f) || {})) return; await wait(200); } }
export default {
  'would-you-rather-live': { viewport: { width: 432, height: 576 }, scale: 1.25, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 15000 });
    await wait(600);
    await until(f, s => s.question); await wait(900);
    await f.evaluate(() => window.__brbTest.answer(0)); await wait(1800);
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await wait(300);
  } },
};
