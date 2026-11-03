// Robo Route's cover: loops level 4 at Explorer, half-built (an open repeat with move and pick inside), Bolt partway along
// the row of gems with a sparkle burst, the chapter stars on the HUD. Same entry shape as scripts/covers.js RECIPES; only
// Playwright frame calls (f is the game frame).
export default {
  'robo-route': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.cover());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'play' && window.__brbTest.state().blocks === 3, null, { timeout: 10000 });
    await f.waitForTimeout(1200);
  } },
};
