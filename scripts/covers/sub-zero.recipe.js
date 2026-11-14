// Sub Zero's card cover (loaded by scripts/covers.js): the lab at night mid-job, through the game's own buttons and
// its test handle (window.__brbTest): Change the Reading, round 3 (the chamber reads −2°, the cold pack worth −5° is
// taken out), just answered: the arrow up from −2° to 3° on the thermometer, −2 − (−5) = 3 on the lab screen, and the
// third sample on its way to the deep freezer.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'sub-zero': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-change');
      await until(f, s => s.screen === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      // rounds 1 and 2 the quick way, then round 3 at the game's own speed
      for (let r = 1; r <= 2; r++) {
        await until(f, s => s.round === r && s.phase === 'play');
        await f.evaluate(() => window.__brbTest.act('solve'));
      }
      await until(f, s => s.round === 3 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast(false));
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.evaluate(v => window.__brbTest.act('set', v), s.answer);
      await f.click('#sz-go');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 400));
    },
  },
};
