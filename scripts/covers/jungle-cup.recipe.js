// Jungle Cup's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the title screen, with the
// leafy JUNGLE CUP logo over Cappy's raft on the sunset river and the Great Kapok behind.
export default {
  'jungle-cup': { viewport: { width: 360, height: 480 }, scale: 2, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
    await f.waitForTimeout(1200);
  } },
};
