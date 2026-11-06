// Tug of Math's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a game against the computer
// on a phone, mid-pull. The player is two pulls ahead, so the flag has left the middle, and is typing the next answer;
// the computer is thinking. Grade 3 (times tables and adding), a fixed seed so the card never changes by chance.
export default {
  'tug-of-math': { viewport: { width: 420, height: 560 }, scale: 1.7, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.answerOf && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
    await f.evaluate(() => { const t = window.__brbTest; t.skipAnimations(); t.start({ mode: 'cpu', grade: 3, diff: 'normal', len: 90, seed: 21 }); });
    await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 15000 });
    await f.evaluate(() => {
      const t = window.__brbTest;
      for (let i = 0; i < 3; i++) { t.solve(0); t.unlock(); }
      t.setTime(64);
      const a = t.answerOf(0); t.press(0, String(a).slice(0, 1));   // typing the next answer
    });
    await f.waitForTimeout(900);
  } },
};
