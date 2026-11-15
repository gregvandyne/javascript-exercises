// Sky Lines' card cover (loaded by scripts/covers.js): the sky islands at sunset mid-job, through the game's own
// buttons and its test handle (window.__brbTest): How Steep, round 4 (the wire through islands A and B, up 4 for 6
// across), just answered: the wire in green with its stair, steepness 2/3 on the board and on the chip, and the
// fourth flag on its way to the far island.
// Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask the game for its state
// (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'sky-lines': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-slope');
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
      await f.click('#sl-n' + s.answer);
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, st => st.phase === 'right' && st.moving <= 1);
      await new Promise(r => setTimeout(r, 400));
    },
  },
};
