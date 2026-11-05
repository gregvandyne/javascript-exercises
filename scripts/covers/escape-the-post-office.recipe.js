// Escape the Post Office's cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): the game
// had no cover file, so its course card fell back to padlock emoji art instead of a real game photo
// (Greg's rule, 2026-11-05: course-card thumbnails are real in-game screenshots). The game's own cover()
// hook stages the sorting-room door with the first two locks already open; the kit's title screen and
// how-to card sit on top of that state, so dismiss both (Play, then Go!) to photograph the door itself.
export default {
  'escape-the-post-office': { viewport: { width: 360, height: 480 }, touch: true, async prep(f) {
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 60000 });
    await f.evaluate(() => window.__brbTest.cover());
    await f.waitForFunction(() => {
      const s = window.__brbTest.state();
      return s.open && s.open.length === 2;
    }, null, { timeout: 15000 });
    await f.waitForTimeout(500);
    for (const label of [/play/i, /go/i]) {
      await f.evaluate(re => {
        const btns = [...document.querySelectorAll('button, .ok-big, .ok-hot')];
        const b = btns.find(el => new RegExp(re, 'i').test(el.textContent || '') && el.offsetParent !== null);
        if (b) b.click();
      }, label.source);
      await f.waitForTimeout(800);
    }
    await f.waitForTimeout(400);
  } },
};
