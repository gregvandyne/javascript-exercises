// Packet Post's cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): Netville's map on level 5 of
// Break It Up with six numbered packets in flight on three roads and two pieces already placed in the frame.
// Only Playwright frame calls: the game stages the moment itself through __brbTest.cover().
export default {
  'packet-post': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.cover());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'level' && document.querySelectorAll('.pp-pk').length >= 6, null, { timeout: 15000 });
    await f.waitForTimeout(600);
  } },
};
