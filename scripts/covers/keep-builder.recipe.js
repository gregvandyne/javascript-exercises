// Keep Builder's card cover (loaded by scripts/covers.js): the castle courtyard at sunset mid-job, through the game's own
// buttons and its test handle (window.__brbTest): Ladders and Spans, round 1 (a wall 4 m high, the ladder's foot 3 m out),
// just answered: the 5 m ladder drawn in green against the wall, 3² + 4² = 25 and √25 = 5 on the board, and the first
// stone on its way to the keep.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'keep-builder': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-span');
      await until(f, s => s.screen === 'play' && s.round === 1 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.evaluate(v => window.__brbTest.act('set', v), s.answer);
      await f.evaluate(() => window.__brbTest.fast(false));
      await f.click('#kb-go');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 1200));
    },
  },
};
