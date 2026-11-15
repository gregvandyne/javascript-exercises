// Scale Scout's card cover (loaded by scripts/covers.js): the survey camp in the morning mid-job, through the game's own
// buttons and its test handle (window.__brbTest): Map and Ground, round 1 (1 cm to 250 m, the mill 6 cm from the gate),
// just answered: the walk drawn from the gate to the mill with 1500 m on it, 6 × 250 = 1500 m under the ruler, and the
// first flag on the survey line.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 120000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'scale-scout': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-scale');
      await until(f, s => s.screen === 'play' && s.round === 1 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.evaluate(v => window.__brbTest.act('set', v), s.answer);
      await f.evaluate(() => window.__brbTest.fast(false));
      await f.click('#ss-go');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 1200));
    },
  },
};
