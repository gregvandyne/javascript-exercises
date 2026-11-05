// Trick Inbox's cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the first Prize Letters
// message in Explorer with its first clue found, on the hunt screen the game stages through __brbTest.cover().
export default {
  'trick-inbox': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.cover());
    await f.waitForFunction(() => window.__brbTest.state().screen === 'round' && document.querySelectorAll('.ti-clue.ti-found').length >= 1, null, { timeout: 15000 });
    await f.waitForTimeout(600);
  } },
};
