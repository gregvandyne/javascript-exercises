// Remi's Quiet Meadow's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): Remi asleep in the
// meadow at sunset with the quiet clock running and the gauge calm. The covers server makes frames with no play page,
// so the game is in its demo there (no microphone), which is what we want.
export default {
  'remis-quiet-meadow': { viewport: { width: 1280, height: 720 }, scale: 1, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.demoStart && document.querySelector('.ok-title-screen .ok-hot'), null, { timeout: 60000 });
    await f.evaluate(() => { const t = window.__brbTest; t.setup({ preset: 'quiet', goal: 600, base: 30 }); document.querySelector('.ok-title-screen .ok-hot').click(); });
    await f.waitForFunction(() => window.__brbTest.state().screen === 'setup', null, { timeout: 15000 });
    await f.evaluate(() => window.__brbTest.demoStart());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'play', null, { timeout: 15000 });
    await f.evaluate(() => { const t = window.__brbTest; t.level(22); t.step(192000); t.level(28); });
    await f.waitForTimeout(2600);   // two Zzz in the air
  } },
};
