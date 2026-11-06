// Doodle Hoot's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): "Guess Pip's doodles" on a
// phone, Pip's drawing done and the word half spelled with the letter tiles, the clock running.
export default {
  'doodle-hoot': { viewport: { width: 420, height: 560 }, scale: 1.7, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.spell && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.start({ mode: 'practice', lvl: 1 }));
    await f.waitForFunction(() => { const s = window.__brbTest.state(); return s.screen === 'guess' && s.tray.length && s.strokes >= 3; }, null, { timeout: 20000 });
    await f.waitForTimeout(4500);   // Pip finishes the doodle
    await f.evaluate(() => {
      const s = window.__brbTest.state(), g = [...s.word.replace(/\s+/g, '')];
      const used = new Set();
      for (const ch of g.slice(0, Math.ceil(g.length / 2))) { const i = s.tray.findIndex((t, k) => t === ch && !used.has(k)); used.add(i); window.__brbTest.tap(i); }
    });
    await f.waitForTimeout(600);
  } },
};
