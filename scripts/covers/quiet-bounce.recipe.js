// Quiet Bounce's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the jar of bouncy balls
// mid-rattle, the room just under the line (the glass glows, a few balls hop, faces open their eyes) while the quiet clock
// runs. The covers server makes frames with no play page, so the game is in its demo there (no microphone), which is
// what we want.
export default {
  'quiet-bounce': { viewport: { width: 1280, height: 720 }, scale: 1, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.demoStart && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
    await f.evaluate(() => { const t = window.__brbTest; t.setup({ preset: 'quiet', goal: 600, base: 30 }); document.querySelector('.ok-title-screen .ok-hot').click(); });
    await f.waitForFunction(() => window.__brbTest.state().screen === 'setup', null, { timeout: 15000 });
    await f.evaluate(() => window.__brbTest.demoStart());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 15000 });
    await f.evaluate(() => { const t = window.__brbTest; t.level(20); t.step(192000); t.level(46); });
    await f.waitForFunction(() => window.__brbTest.state().state === 'rattle', null, { timeout: 15000 });
    await f.waitForTimeout(2600);   // the rattle under way: balls jiggling, one hopping
  } },
};
