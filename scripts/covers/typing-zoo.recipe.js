// Typing Zoo's card cover (scripts/covers.js loads every scripts/covers/<slug>.recipe.js): a home-row words lesson part
// typed, the next key lit on the finger-colored keyboard, through the game's own test handle (window.__brbTest).
export default {
  'typing-zoo': {
    viewport: { width: 432, height: 576 },
    scale: 1.25,
    touch: true,
    async prep(f) {
      await f.waitForFunction(() => window.__brbTest && window.__brbTest.type, null, { timeout: 60000 });
      await f.evaluate(() => window.__brbTest.type('l05'));
      for (let i = 0; i < 9; i++) {
        await f.evaluate(() => { const c = document.querySelector('#line .cur'); const all = [...document.querySelectorAll('#line span')]; const ch = all.map(s => s.classList.contains('sp') ? ' ' : s.textContent).join('')[all.indexOf(c)]; document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true })); });
      }
      await f.waitForTimeout(600);
    },
  },
};
