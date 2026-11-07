// Doodle Hoot on its own, through the real sandboxed frame: the setup card (Guess Pip's doodles or Pass and play, the
// level, how to guess, the players) and that it is remembered; a practice game where Pip draws and the player types
// each word (a wrong guess, a close one, then right), to the results card and BRB.gameOver; the same with letter tiles
// (the easier choice); pass and play for two (cover, word cards, drawing with the mouse while the others call out,
// "Someone said it!" and who, then a turn guessed afterwards by typing, the winner, nothing submitted); right-to-left
// slots in Arabic; and the layout check (tests/e2e/frame-fit.js) on a phone (its keyboard up too), a phone on its side
// and a desktop.
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

test('Guess Pip\'s doodles by typing: the setup card, Pip draws, a wrong and a close guess, the results card and BRB.gameOver', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { f, errors } = await open(page);
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);   // no title screen: the setup card's Start is the only one
  await expect(f.locator('.dhs-card')).toBeVisible();
  await radio(f, 'mode', 'pass').click();
  await expect(f.locator('.dhs fieldset[data-k="n"]')).toBeVisible();
  await radio(f, 'mode', 'practice').click(); await radio(f, 'lvl', 1).click();
  await expect(radio(f, 'lvl', 3)).toBeHidden();   // practice: Easy or Medium doodles
  await expect(f.locator('.dhs fieldset[data-k="n"]')).toBeHidden();
  await expect(radio(f, 'guess', 'type')).toHaveAttribute('aria-checked', 'true');   // typing unless tiles are picked
  await f.locator('#dhStart').click();
  for (let k = 0; k < 8; k++) {
    const s = await until(f, x => x.screen === 'guess' && x.i === k && x.typing);
    expect(s.tray).toEqual([]);
    if (k === 0) {
      await until(f, x => x.strokes > 0);
      await expect(f.locator('.dh-type input')).toBeVisible();
      expect(await frameProblems(f)).toEqual([]); expect(await pageScrollsSideways(page)).toBe(false);
      // a wrong guess, typed and sent with Enter; then one a letter off ("So close!")
      await f.locator('.dh-type input').fill('xylophone');
      await f.locator('.dh-type input').press('Enter');
      await expect(f.locator('.dh-say')).toContainText('Not quite');
      await page.waitForTimeout(1150);
      const near = s.word.length >= 4 ? s.word.slice(0, -1) + (s.word.endsWith('z') ? 'y' : 'z') : s.word[1] + s.word[0] + s.word.slice(2);
      await f.locator('.dh-type input').fill(near);
      await f.locator('.dh-type .dh-go').click();
      await expect(f.locator('.dh-say')).toContainText(s.word[0] === s.word[1] && s.word.length < 4 ? /Not quite|So close/ : 'So close');
      await page.waitForTimeout(1150);
      // the keyboard up (the frame about 45% shorter): the box and the drawing still fit
      await page.setViewportSize({ width: 390, height: 464 });
      await f.locator('.dh-type input').focus();
      await page.waitForTimeout(300);
      expect(await frameProblems(f)).toEqual([]);
      expect((await f.locator('.dh-board').boundingBox()).height).toBeGreaterThan(100);
      await f.locator('.dh-type input').fill(s.word.toUpperCase());
      await f.locator('.dh-type input').press('Enter');
      await page.setViewportSize({ width: 390, height: 844 });
    } else await T(f, 'spell');
    await until(f, x => x.screen === 'reveal' || x.i > k || x.screen === 'end');
  }
  await until(f, x => x.screen === 'end', 30000);
  await expect(f.locator('.ok-win')).toBeVisible();
  await expect.poll(() => f.evaluate(() => window.__go.length)).toBeGreaterThan(0);
  const go = await f.evaluate(() => window.__go[0]);
  expect(go.score).toBeGreaterThan(0);
  expect((await state(f)).saved.mode).toBe('practice'); expect((await state(f)).saved.guess).toBe('type');
  expect(errors).toEqual([]);
});

test('Guess Pip\'s doodles with letter tiles (the easier choice): tiles spell the word', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { f, errors } = await open(page);
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);   // no title screen: the setup card's Start is the only one
  await radio(f, 'mode', 'practice').click(); await radio(f, 'lvl', 1).click(); await radio(f, 'guess', 'tiles').click();
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
  expect((await state(f)).saved.guess).toBe('tiles');
  expect(errors).toEqual([]);
});

test('pass and play for two: cover, word cards, drawing, said out loud, the guessers typing, the winner; nothing submitted', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 844, height: 390 });
  const { f, errors } = await open(page);
  await T(f, 'start', { mode: 'pass', lvl: 1, players: 2, guess: 'type' });
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
    // the word stays covered while the others watch; "My word" shows it for a moment
    await expect(f.locator('.dh-word')).toHaveClass(/peek/);
    if (turn === 0) {
      expect(await frameProblems(f)).toEqual([]); expect(await pageScrollsSideways(page)).toBe(false);
      // someone called it out: "Someone said it!", then who
      await f.locator('#dhSaid').click();
      await expect(f.locator('.dh-sheet h2')).toContainText('Who guessed it?');
      await expect(f.locator('.dh-sheet .dh-who-btns button')).toHaveCount(1);
      expect(await frameProblems(f)).toEqual([]);
      await T(f, 'who', 0);
      await until(f, s => s.screen === 'reveal');
      continue;
    }
    await T(f, 'done');
    await until(f, s => s.screen === 'cover2');
    await T(f, 'ready');
    await until(f, s => s.screen === 'guess' && s.typing);
    await T(f, 'spell');
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
    await T(f, 'start', { mode: 'practice', lvl: 1, guess: 'tiles' });
    const s = await until(f, x => x.screen === 'guess' && x.tray.length);
    expect(s.tray.every(t => re.test(t))).toBe(true);
    await expect(f.locator('.dh-slots')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    if (lang === 'ar') await expect(f.locator('.dh-preview')).toBeVisible();
    expect(await frameProblems(f)).toEqual([]);
    await spell(f, lang === 'ja' ? 'en' : lang);
    await until(f, x => x.screen === 'reveal' || x.i > 0);
  }
});

test('typing in Arabic and Hebrew: the guess box runs with the language, the word typed with or without its marks', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lang of ['ar', 'he']) {
    const { f, errors } = await open(page, `/play/doodle-hoot?lang=${lang}`);
    await T(f, 'start', { mode: 'practice', lvl: 1, guess: 'type' });
    const s = await until(f, x => x.screen === 'guess' && x.typing);
    await expect(f.locator('.dh-type .dh-slots')).toHaveAttribute('dir', 'rtl');
    await f.locator('.dh-type input').fill(s.word);
    await f.locator('.dh-type input').press('Enter');
    await until(f, x => x.screen === 'reveal' || x.i > 0);
    expect(await frameProblems(f)).toEqual([]);
    expect(errors).toEqual([]);
  }
});
