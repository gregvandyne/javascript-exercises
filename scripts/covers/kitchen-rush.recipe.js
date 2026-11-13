// Kitchen Rush's card cover (loaded by scripts/covers.js): the busy kitchen mid-job, through the game's own buttons and
// its test handle (window.__brbTest): the Wizard helper in Measure It, round 4 (How many inches long is the carrot?),
// just answered: the carrot on the ruler with its ends marked, and the fourth dish on its way to the party table.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'kitchen-rush': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'hero');
      await f.click('#hero-mage');
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-measure');
      await until(f, s => s.screen === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      // rounds 1 to 3 the quick way, then round 4 at the game's own speed
      for (let r = 1; r <= 3; r++) {
        await until(f, s => s.round === r && s.phase === 'play');
        await f.evaluate(() => window.__brbTest.act('answer', window.__brbTest.state().answer));
      }
      await until(f, s => s.round === 4 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast(false));
      const s = await f.evaluate(() => window.__brbTest.state());
      await f.click('#kr-n' + s.answer);
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 400));
    },
  },
};
