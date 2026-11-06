// Doodle Hoot on its own, through the real sandboxed frame: the setup card (Guess Pip's doodles or Pass and play, the
// level, the players) and that it is remembered; a practice game where Pip draws and the player spells each word by
// tapping tiles, to the results card and BRB.gameOver; pass and play for two (cover, word cards, drawing with the mouse,
// the guessers' cover, spelling, who got it, the winner, nothing submitted); right-to-left slots in Arabic and kana
// tiles in Japanese; and the layout check (tests/e2e/frame-fit.js) on a phone, a phone on its side and a desktop.
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const state = f => T(f, 'state');

async function open(page, url = '/play/doodle-hoot') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ownIp(page);
  await page.goto(url);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.spell, null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
  return { f, errors };
}
const radio = (f, k, v) => f.locator(`.dhs fieldset[data-k="${k}"] [role=radio][data-v="${v}"]`);
async function until(f, fn, timeout = 20000) { let s; await expect.poll(async () => { s = await state(f); return !!fn(s); }, { timeout }).toBe(true); return s; }
/** Tap the tiles that spell the word (in slot order, around any hint letters). */
async function spell(f, lang = 'en') {
  const s = await state(f);
  const g = [...new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(s.word.replace(/\s+/g, ''))].map(x => x.segment);
  const used = new Set(s.slots.filter(x => x != null));
  for (const [j, ch] of g.entries()) {
    if (s.slots[j] != null) continue;
    const i = s.tray.findIndex((t, k) => t === ch && !used.has(k));
    used.add(i);
    await f.locator(`.dh-tray .dh-tile[data-i="${i}"]`).click();
  }
}

test('Guess Pip\'s doodles: the setup card, Pip draws, tiles spell the word, the results card and BRB.gameOver', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { f, errors } = await open(page);
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('.dhs-card')).toBeVisible();
  await radio(f, 'mode', 'pass').click();
  await expect(f.locator('.dhs fieldset[data-k="n"]')).toBeVisible();
  await radio(f, 'mode', 'practice').click(); await radio(f, 'lvl', 1).click();
  await expect(radio(f, 'lvl', 3)).toBeHidden();   // practice: Easy or Medium doodles
  await expect(f.locator('.dhs fieldset[data-k="n"]')).toBeHidden();
  await f.locator('#dhStart').click();
  for (let k = 0; k < 8; k++) {
    const s = await until(f, x => x.screen === 'guess' && x.i === k && x.tray.length > 0);
    expect(s.tray.length).toBeGreaterThan(s.word.length - 1);
    if (k === 0) {
      await until(f, x => x.strokes > 0);
      expect(await frameProblems(f)).toEqual([]); expect(await pageScrollsSideways(page)).toBe(false);
      // a wrong order first: the slots empty again
      const free = s.tray.map((x, i) => i);
      const wrong = free.find(i => s.tray[i] !== s.word[0]);
      for (const i of [wrong, ...free.filter(i => i !== wrong)].slice(0, s.slots.length)) await f.locator(`.dh-tray .dh-tile[data-i="${i}"]`).click();
      await expect(f.locator('.dh-say')).toContainText('Not quite');
    }
    await spell(f);
    await until(f, x => x.screen === 'reveal' || x.i > k || x.screen === 'end');
  }
  await until(f, x => x.screen === 'end', 30000);
  await expect(f.locator('.ok-win')).toBeVisible();
  await expect.poll(() => f.evaluate(() => window.__go.length)).toBeGreaterThan(0);
  const go = await f.evaluate(() => window.__go[0]);
  expect(go.score).toBeGreaterThan(0);
  expect((await state(f)).saved.mode).toBe('practice');
  expect(errors).toEqual([]);
});

test('pass and play for two: cover, word cards, drawing, the guessers, who got it, the winner; nothing submitted', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 844, height: 390 });
  const { f, errors } = await open(page);
  await T(f, 'start', { mode: 'pass', lvl: 1, players: 2 });
  for (let turn = 0; turn < 2; turn++) {
    await until(f, s => s.screen === 'cover' && s.turn === turn);
    await expect(f.locator('.dh-screen h2')).toContainText(`Player ${turn + 1}`);
    await T(f, 'ready');
    await until(f, s => s.screen === 'pick' && s.choices);
    await f.locator('.dh-card[data-i="0"]').click();
    await until(f, s => s.screen === 'draw');
    const box = await f.locator('.dh-board canvas').boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40); await page.mouse.down();
    await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: 10 }); await page.mouse.up();
    await until(f, s => s.strokes === 1);
    if (turn === 0) { expect(await frameProblems(f)).toEqual([]); expect(await pageScrollsSideways(page)).toBe(false); }
    await T(f, 'done');
    await until(f, s => s.screen === 'cover2');
    await T(f, 'ready');
    await until(f, s => s.screen === 'guess' && s.tray.length);
    await spell(f);
    await until(f, s => s.screen === 'who');
    await T(f, 'who', 0);
  }
  const s = await until(f, x => x.screen === 'end', 20000);
  expect(s.scores.every(n => n > 0)).toBe(true);
  await expect(f.locator('.ok-win')).toBeVisible();
  expect(await f.evaluate(() => window.__go.every(o => o.submit === false || o.score == null) || window.__go.length === 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('Arabic slots run right to left; a Japanese page spells English words for now; a desktop fits', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  // (Japanese and Traditional Chinese words wait for a native speaker's review: those pages play with English words)
  for (const [lang, re] of [['ar', /^[ء-ي]$/], ['ja', /^[a-z]$/]]) {
    const { f } = await open(page, `/play/doodle-hoot?lang=${lang}`);
    await T(f, 'start', { mode: 'practice', lvl: 1 });
    const s = await until(f, x => x.screen === 'guess' && x.tray.length);
    expect(s.tray.every(t => re.test(t))).toBe(true);
    await expect(f.locator('.dh-slots')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    if (lang === 'ar') await expect(f.locator('.dh-preview')).toBeVisible();
    expect(await frameProblems(f)).toEqual([]);
    await spell(f, lang === 'ja' ? 'en' : lang);
    await until(f, x => x.screen === 'reveal' || x.i > 0);
  }
});
