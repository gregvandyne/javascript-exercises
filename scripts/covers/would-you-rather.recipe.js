// Would You Rather's cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file
// overrides the built-in recipe): Cyber Defenders plays this game with the 'online' question bank
// (Unit 3, "Choices and staying safe"), so the cover must show an online-safety question; the built-in
// recipe used the 'powers' bank ("Be super fast"), which made the course card look off-topic (Greg,
// 2026-11-05). The bank shuffles, so restart until the cover question comes up (online-3: "A nickname
// online that nobody knows" vs "Your real first name online"), discarding each miss with a pick so it
// counts as seen. Then pick the safe answer, keeping the old cover's glow-and-tick grammar.
export default {
  // 432x576 at 1.25x: the same 540x720 picture, with room for the tick beside the answer.
  'would-you-rather': { viewport: { width: 432, height: 576 }, scale: 1.25, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
    for (let i = 0; i < 12; i++) {
      await f.evaluate(() => window.__brbTest.start('alone', { count: 10, topics: ['online'] }));
      await f.waitForTimeout(400);
      const cur = await f.evaluate(() => window.__brbTest.state().cur);
      if (cur === 'online-3') break;
      await f.evaluate(() => window.__brbTest.pick('a'));
      await f.waitForTimeout(400);
    }
    await f.waitForTimeout(300);
    await f.evaluate(() => window.__brbTest.pick('a'));
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await f.waitForTimeout(600);
  } },
};
