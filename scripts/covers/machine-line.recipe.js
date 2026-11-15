// Machine Line's card cover (loaded by scripts/covers.js): the factory street at sunset mid-job, through the game's own
// buttons and its test handle (window.__brbTest): Run It Back, round 4 (the line is times 3, then plus 5, and the output
// is 23), just answered: 6, 18 and 23 riding the line with the way back under it, 3x + 5 = 23 and x = 6 on the board,
// and the fourth crate on its way to the dock.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'machine-line': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-undo');
      await until(f, s => s.screen === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      // rounds 1 to 3 the quick way, then round 4 at the game's own speed
      for (let r = 1; r <= 3; r++) {
        await until(f, s => s.round === r && s.phase === 'play');
        await f.evaluate(() => window.__brbTest.act('solve'));
      }
      await until(f, s => s.round === 4 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast(false));
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.evaluate(v => window.__brbTest.act('set', v), s.answer);
      await f.click('#ml-go');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 400));
    },
  },
};
