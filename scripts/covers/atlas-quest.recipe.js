// Atlas Quest's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js; this file overrides the built-in
// recipe): the globe on its board card in Crossword's widget look, half the world lit up with flag pins, and a Flag match
// question in the dark bar with its answer choices, two answered right. Through the game's own test handle
// (window.__brbTest). A 480x640 window at 1.125x (the same 540x720 picture as before).
export default {
  'atlas-quest': { viewport: { width: 480, height: 640 }, scale: 1.125, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.cover && window.__brbTest.closeDialog, null, { timeout: 60000 });
    await f.waitForTimeout(800);
    for (let i = 0; i < 4; i++) { await f.evaluate(() => window.__brbTest.closeDialog()); await f.waitForTimeout(400); }   // any hello card
    await f.evaluate(() => window.__brbTest.cover());   // half the world lit, with pins
    await f.waitForTimeout(600);
    await f.evaluate(() => window.__brbTest.mode('flags'));   // the draw is the game's own, so the flag shown can differ run to run
    for (let i = 0; i < 2; i++) { await f.evaluate(() => window.__brbTest.answer(true)); await f.waitForTimeout(2600); }
    await f.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await f.waitForTimeout(2500);
    await f.evaluate(() => {   // all four answers on the card, the globe still above them
      const e = document.scrollingElement, o = document.getElementById('qOpts').getBoundingClientRect();
      e.scrollTop += Math.max(0, o.bottom + 20 - innerHeight);
    });
    await f.waitForTimeout(600);
  } },
};
