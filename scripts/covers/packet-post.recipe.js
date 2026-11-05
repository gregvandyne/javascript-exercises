// Packet Post's cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a clean, early game
// state that reads at card size. The old recipe staged the final Break It Up level (5 of 5) through the game's
// cover() hook — six packets crossing the full town map, a pile of tiny icons nobody can read on a phone
// course card (Greg, 2026-11-05). Level 1 is a simple line — Pim's Post → Mill Office → Grandma's House —
// with one packet on the road, so the delivery idea lands instantly.
export default {
  'packet-post': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
    await f.evaluate(() => {
      window.__brbTest.skipAnimations();
      window.__brbTest.start({ chapter: 'packets', band: '1b', level: 1, seed: 7, lesson: false });
    });
    await f.waitForTimeout(400);
    await f.evaluate(() => window.__brbTest.closeCards());
    await f.waitForTimeout(300);
    await f.evaluate(() => window.__brbTest.closeCards());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'level' && document.querySelectorAll('.pp-pk').length >= 1, null, { timeout: 15000 });
    // Send the first packet one hop so it sits on the board, mid-journey.
    await f.evaluate(async () => {
      const a = window.__brbTest.advice();
      if (a) await window.__brbTest.act(a);
    });
    await f.waitForFunction(() => !window.__brbTest.state().busy, null, { timeout: 10000 });
    await f.waitForTimeout(600);
  } },
};
