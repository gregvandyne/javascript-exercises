// Lantern Mix's card cover (loaded by scripts/covers.js): the night hollow mid-chapter, through the game's own buttons
// and its test handle (window.__brbTest): Skelly the lamplighter in Match the Glow, round 3, just lit with the round's own
// right mix (read from the game's state, so a change to the rounds does not break the cover): both gauges and the
// matching bars on the board, and the third lantern glowing on the rack. Playwright frame calls only (f is the game frame inside the real sandbox). The waits ask
// the game for its state (a frame-by-frame wait can starve while the 3D view draws on a machine with no graphics card).
const until = async (f, ok, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (ok(await f.evaluate(() => (window.__ready === true && window.__brbTest ? window.__brbTest.state() : null)) || {})) return; } catch { /* still loading */ } await new Promise(r => setTimeout(r, 200)); } throw new Error('the game did not get there: ' + String(ok)); };
export default {
  'lantern-mix': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await until(f, s => s.screen === 'hero');
      await f.click('#hero-skelly');
      await until(f, s => s.screen === 'menu');
      await f.click('#ch-mix');
      await until(f, s => s.screen === 'play');
      await f.evaluate(() => window.__brbTest.fast());
      // rounds 1 and 2 the quick way, then round 3 at the game's own speed
      for (let r = 1; r <= 2; r++) {
        await until(f, s => s.round === r && s.phase === 'play');
        await f.evaluate(() => window.__brbTest.act('solve'));
      }
      await until(f, s => s.round === 3 && s.phase === 'play');
      await f.evaluate(() => window.__brbTest.fast(false));
      await f.evaluate(() => window.__brbTest.act('set', window.__brbTest.state().want));
      await f.click('#light');
      await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await until(f, s => s.phase === 'right' && s.moving <= 1);
      await new Promise(r => setTimeout(r, 400));
    },
  },
};
