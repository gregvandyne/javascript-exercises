// Doodle Hoot in Crossword's look (docs/decisions.md "Doodle Hoot in Crossword's look"): the dotted mint board, cream
// widget cards with a group colour on the top edge and an icon chip, the dark "Now" bar for the round, who is drawing,
// the word and the clock, pill buttons, Bricolage Grotesque, light and dark from the site's theme; the drawing paper
// stays white in both themes. The rules (DoodleCore) and the words (DoodleWords) are the same blocks as before
// (tests/unit/doodle-core.test.js and doodle-words.test.js), and the game still never sends or keeps a drawing.
//   - the file: the look's tokens and font, the new words in every language, nothing that could send a picture;
//   - Chromium, in the production frame: the setup card, a practice round typed (a wrong guess), a letter-tiles round,
//     pass and play (the drawer's tools, a drawing, "Who guessed it?"), the results card and one BRB.gameOver, light
//     and dark, on a desktop and a phone. Needs a local Chromium; skipped when there is none.
// Pictures: DOODLE_SHOTS=<dir> node --test tests/unit/doodle-hoot-look.test.js
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { HTML, skip, openDoodle, closeBrowser } from './_doodle-frame.js';

test.after(closeBrowser);
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const state = f => T(f, 'state');
async function until(f, fn, timeout = 30_000) {
  const t0 = Date.now();
  for (;;) { const s = await state(f); if (fn(s)) return s; if (Date.now() - t0 > timeout) throw new Error('timed out at ' + JSON.stringify(s).slice(0, 300)); await new Promise(r => setTimeout(r, 120)); }
}
/** Computed styles of the first element matching each selector. */
const styles = (f, sels) => f.evaluate(sels => Object.fromEntries(sels.map(s => { const e = document.querySelector(s); if (!e) return [s, null]; const c = getComputedStyle(e); return [s, { bg: c.backgroundColor, img: c.backgroundImage, shadow: c.boxShadow, font: c.fontFamily, color: c.color, radius: c.borderTopLeftRadius }]; })), sels);

test('the file: the look\'s tokens and font, the words in every language, and nothing that could send a drawing', () => {
  assert.match(HTML, /fonts\.googleapis\.com\/css2\?family=Bricolage\+Grotesque/);
  for (const tok of ['--board:#E1F1E1', '--dots:#66C792', '--card:#FFFDF2', '--current:#141414', '--g-tools:#FFD23F', '--paper:#FFFFFF']) assert.ok(HTML.includes(tok), tok);
  assert.match(HTML, /:root\.dh-dark\{[^}]*--board:#141414/);
  // the paper is white in both themes: the dark tokens never change it
  assert.ok(!/:root\.dh-dark\{[^}]*--paper:/.test(HTML));
  // the new words: in every language that has its own table
  const a = HTML.indexOf('var I18N = {'), b = HTML.indexOf('// ==== I18N END ====');
  const box = {}; vm.runInNewContext(HTML.slice(a, b).replace('var I18N', 'this.I18N'), box);
  for (const [lang, tx] of Object.entries(box.I18N)) {
    if (lang === 'en-GB') continue;
    for (const k of ['pens', 'yourGuess', 'scores', 'guesses', 'spell']) assert.ok(typeof tx[k] === 'string' && tx[k].trim(), `${lang}: ${k}`);
  }
  // drawings are never stored or sent anywhere but the live room's own messages
  const game = HTML.slice(HTML.indexOf('// ==== I18N END ===='));
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /toDataURL/, /toBlob/, /getImageData/, /localStorage/, /indexedDB/]) assert.ok(!re.test(game), String(re));
  // no browser dialogs, no em dashes in the look's comments or styles
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(game));
  assert.ok(!HTML.slice(0, HTML.indexOf('</style>')).includes('\u2014'));
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: the setup card on the board, a typed practice round, the paper stays white, the results card`, { skip, timeout: 180_000 }, async () => {
    const g = await openDoodle({ theme, width: 1280, height: 800 });
    try {
      const f = g.frame;
      await f.waitForSelector('.dhs-card');
      assert.equal(await f.evaluate(() => document.documentElement.classList.contains('dh-dark')), theme === 'dark', 'the theme from the site');
      let st = await styles(f, ['.dhs', '.dhs-card', '.dhs-card .dh-wicon', '#dhStart', '.dhs .opt[aria-checked="true"]']);
      assert.match(st['.dhs'].img, /radial-gradient/, 'the dotted board behind the setup card');
      assert.equal(st['.dhs-card'].bg, theme === 'dark' ? 'rgb(30, 30, 27)' : 'rgb(255, 253, 242)', 'a cream (or dark) widget card');
      assert.match(st['.dhs-card'].shadow, /inset/, 'its group colour on the top edge');
      assert.ok(st['.dhs-card .dh-wicon'], 'the icon chip (Pip)');
      assert.match(st['.dhs-card'].font, /Bricolage Grotesque/);
      assert.equal(st['#dhStart'].radius, '999px', 'the pill button');
      assert.equal(await f.locator('#dhStart[data-start]').count(), 1);
      await g.shot(`look-home-${theme}`);
      // a practice round, typed
      await T(f, 'skipAnimations');
      await f.locator('.dhs fieldset[data-k="mode"] [data-v="practice"]').click();
      await f.locator('.dhs fieldset[data-k="guess"] [data-v="type"]').click();
      await f.locator('#dhStart').click();
      const s = await until(f, x => x.screen === 'guess' && x.typing && x.strokes > 0);
      st = await styles(f, ['.dh', '.dh-top', '.dh-board', '.dh-type', '.dh-type .dh-wicon', '.dh-go']);
      assert.match(st['.dh'].img, /radial-gradient/);
      assert.equal(st['.dh-top'].bg, theme === 'dark' ? 'rgb(102, 199, 146)' : 'rgb(20, 20, 20)', 'the Now bar');
      assert.equal(st['.dh-board'].bg, 'rgb(255, 255, 255)', 'paper white in both themes');
      assert.match(st['.dh-type'].shadow, /inset/); assert.ok(st['.dh-type .dh-wicon']);
      assert.equal(st['.dh-go'].radius, '999px');
      const box = await f.locator('.dh-board canvas').boundingBox();
      assert.ok(Math.abs(box.width / box.height - 4 / 3) < 0.02, 'the 4:3 board');
      await f.locator('.dh-type input').fill('xylophone');
      await f.locator('.dh-type input').press('Enter');
      await f.waitForFunction(() => /Not quite/.test(document.querySelector('.dh-say').textContent));
      await g.shot(`look-guessing-${theme}`);
      // to the end: the results card, in the widget look, and one BRB.gameOver
      for (let k = s.i; k < 8; k++) {
        await until(f, x => x.screen === 'guess' && x.i === k);
        await new Promise(r => setTimeout(r, 1150));
        await T(f, 'spell');
        await until(f, x => x.screen !== 'guess' || x.i > k);
      }
      await until(f, x => x.screen === 'end');
      await f.waitForSelector('.ok-win .ok-card .dh-wicon', { timeout: 20_000 });
      st = await styles(f, ['.ok-win .ok-card']);
      assert.match(st['.ok-win .ok-card'].shadow, /inset/);
      await new Promise(r => setTimeout(r, 3500));
      await g.shot(`look-results-${theme}`);
      const over = await g.p.evaluate(() => window.__msgs.filter(m => m.type === 'brb:gameover'));
      assert.equal(over.length, 1); assert.ok(over[0].score > 0 || over[0].result);
      assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
    } finally { await g.ctx.close(); }
  });
}

test('a phone: letter tiles in the tray widget, then pass and play with the drawer\'s tools, a drawing and "Who guessed it?"', { skip, timeout: 180_000 }, async () => {
  const g = await openDoodle({ theme: 'light', width: 390, height: 844 });
  try {
    const f = g.frame;
    await T(f, 'skipAnimations');
    await T(f, 'start', { mode: 'practice', lvl: 1, guess: 'tiles' });
    let s = await until(f, x => x.screen === 'guess' && x.tray.length > 0);
    assert.equal(await f.locator('.dh-guess .dh-wicon').count(), 1, 'the tray is a widget with its chip');
    const wrong = s.tray.findIndex(x => x !== s.word[0].toUpperCase());
    await f.locator(`.dh-tray .dh-tile[data-i="${wrong}"]`).click();
    s = await state(f); assert.equal(s.slots.filter(x => x != null).length, 1);
    await g.shot('look-tiles-phone');
    assert.ok(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
    // pass and play
    await f.evaluate(() => { const b = document.querySelector('.ok-win'); if (b) b.remove(); });
    await T(f, 'start', { mode: 'pass', lvl: 1, players: 3, guess: 'type' });
    await until(f, x => x.screen === 'cover');
    assert.equal(await f.locator('.dh-screen .dh-pane.dh-widget').count(), 1, 'the cover is a widget card on the board');
    await T(f, 'ready'); await until(f, x => x.screen === 'pick');
    assert.equal(await f.locator('.dh-card .emo').count(), 3);
    await T(f, 'pick', 0); await until(f, x => x.screen === 'draw');
    assert.equal(await f.locator('.dh-tools .dh-wicon').count(), 1, 'the tools are a widget');
    assert.ok(await f.evaluate(() => document.querySelector('.dh-top').contains(document.querySelector('.dh-word'))), 'the word is a line of the dark bar');
    assert.ok(await T(f, 'draw', [200, 200, 400, 300, 600, 200]));
    await f.locator('.dh-tools [aria-label="Undo"]').click();
    s = await state(f); assert.equal(s.strokes, 0, 'undo still works');
    assert.ok(await T(f, 'draw', [200, 200, 400, 300, 600, 200]));
    await g.shot('look-drawing-phone');
    assert.ok(await T(f, 'said'));
    await f.waitForSelector('.dh-sheet .dh-widget h2');
    await g.shot('look-who-phone');
    assert.ok(await T(f, 'who', 0));
    s = await until(f, x => x.scores && x.scores.some(n => n > 0));
    assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  } finally { await g.ctx.close(); }
});
