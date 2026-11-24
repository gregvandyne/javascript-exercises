// Question Battle's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides the
// built-in recipe): solo practice in Crossword's widget look (the same screens a class sees on the board). The first
// question answered right, so the boss has taken a hit, and the next question up with its four answer tiles.
// A 432x576 window at 1.25x (the same 540x720 picture as before).
const wait = ms => new Promise(r => setTimeout(r, ms));
const st = f => f.evaluate(() => window.__brbTest.state()).catch(() => ({}));
async function until(f, ok, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (ok(await st(f) || {})) return; await wait(200); } }
export default {
  'question-battle': { viewport: { width: 432, height: 576 }, scale: 1.25, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.answer, null, { timeout: 30000 });
    await wait(900);
    const go = await f.$('.ok-title-screen .ok-hot'); if (go) { await go.click(); await wait(1500); }
    await until(f, s => s.question && !s.question.answered);
    await f.evaluate(() => {   // the right answer to "a × b = ?"
      const q = window.__brbTest.state().question, m = /(\d+)\s*×\s*(\d+)/.exec(q.q), i = m ? q.choices.indexOf(String(m[1] * m[2])) : 0;
      window.__brbTest.answer(i >= 0 ? i : 0);
    });
    await wait(4500);
    await until(f, s => s.question && !s.question.answered); await wait(1400);
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await wait(300);
  } },
};
