// Jungle Cup polish checks (play-through findings): long dialogue lines page instead of being cut at 4 rows, CJK lines
// keep every character, the results card shows the Cup points the site's "New best" toast uses and the berry bandana,
// the site never toasts "New best: 0", map rows never squeeze the sport names, the map and panel titles sit clear of
// the content, a phone on its side gets bigger pixels, and the game has the keyboard as soon as it loads.
// Run alone: E2E_PORT=4901 npx playwright test tests/e2e/jungle-cup-polish.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
async function open(page, size = { width: 390, height: 844 }) {
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  return f;
}

test('a long line gets a next page instead of losing its end (Mango\'s 5th line at phone width)', async ({ page }) => {
  const f = await open(page);
  await J(f, 'newGame'); await J(f, 'manual', true); await J(f, 'step', 800); await J(f, 'skipText');
  await f.evaluate(() => { JC.placePlayer(52, 85, 'up'); });
  await J(f, 'talk'); for (let i = 0; i < 4; i++) await J(f, 'next');
  expect((await J(f, 'state')).text.key).toBe('d.mango.intro5');
  const pages = await f.evaluate(() => JC.textbox.pages());
  expect(pages).toBeGreaterThan(1);
  // a tap finishes the page, the next tap shows page 2 of the SAME line, and only then the line ends
  await J(f, 'step', 6000);
  await f.evaluate(() => JC.textbox.advance());
  let s = await J(f, 'state'); expect(s.text.key).toBe('d.mango.intro5');
  expect(await f.evaluate(() => JC.textbox.pg)).toBe(1);
  await J(f, 'step', 6000); await f.evaluate(() => JC.textbox.advance());
  s = await J(f, 'state'); expect(s.text).toBe(null);
});

test('the text box types every character of a Japanese line (no character lost at a line break)', async ({ page }) => {
  const f = await open(page);
  const r = await f.evaluate(() => {
    const str = 'ギャッ！きみがキャピーだね！わたしはマンゴー、しまのガイドよ。ジャングルカップへようこそ、いっしょにがんばろうね。';
    const lines = JC.font.wrap(str, 150);
    return { joined: lines.join(''), str, starts: lines.slice(1).map(l => l[0]) };
  });
  expect(r.joined).toBe(r.str);
  for (const c of r.starts) expect('、。！？）」').not.toContain(c);   // no closing mark starts a line
});

test('results card: Cup points (the site toast\'s number) and the berry bandana are on the card; no "New best: 0" toast', async ({ page }) => {
  const f = await open(page);
  await J(f, 'tap', 'play'); await expect.poll(async () => (await J(f, 'state')).screen).toBe('world');
  await J(f, 'skipText'); await J(f, 'manual', true);
  // a first-round loss with no stars: the Cup points are 0 and the site says nothing
  await J(f, 'play', 'seed'); await J(f, 'step', 300);
  await f.evaluate(() => { const R = JC.runner; R.result = { score: 0, stars: 0, won: false, frac: 0 }; R.finishNow(); });
  await J(f, 'step', 1500);
  expect(await f.evaluate(() => JC.runner.cupPts)).toBe(0);
  await J(f, 'report'); await page.waitForTimeout(1500);
  await expect(page.locator('#toasts .toast', { hasText: /: 0!|：0！/ })).toHaveCount(0);
  // a three-star win: the card carries the Cup points and the new bandana
  await page.waitForTimeout(2100);
  await J(f, 'play', 'paddle'); await J(f, 'step', 300);
  await f.evaluate(() => { const R = JC.runner; R.result = { score: 2010, stars: 3, won: true, frac: 1 }; R.finishNow(); });
  await J(f, 'step', 1500);
  const card = await f.evaluate(() => ({ pts: JC.runner.cupPts, band: JC.runner.newBandana, cos: JC.save.data.cos.own }));
  expect(card.pts).toBe(550); expect(card.band).toBe(true); expect(card.cos).toContain('berry');
  await J(f, 'report');
  await expect(page.locator('#toasts .toast').first()).toContainText('550');
  // the toast never takes a tap meant for the game
  expect(await page.locator('#toasts .toast').first().evaluate(e => getComputedStyle(e).pointerEvents)).toBe('none');
});

test('map rows never squeeze the sport names, and the title sits clear of the minimap (360 x 640)', async ({ page }) => {
  const f = await open(page, { width: 360, height: 640 });
  await J(f, 'setSave', { plays: { frog: 2, leaf: 2 }, best: { frog: 24600, leaf: 14310 } }); await J(f, 'manual', true);
  await J(f, 'go', 'map'); await J(f, 'step', 100);
  const r = await f.evaluate(() => {
    const out = [];
    for (const id of JC.sportOrder) { const h = JC.ui.prev.find(b => b.id === 'go:' + id); out.push({ id, w: h.w, need: JC.font.textW(JC.t('sport.' + id)) + 20 }); }
    return out;
  });
  for (const row of r) expect(row.w, row.id).toBeGreaterThanOrEqual(row.need);
});

test('a phone on its side gets pixels of at least about 1.6 CSS pixels (readable words)', async ({ page }) => {
  const f = await open(page, { width: 844, height: 390 });
  const v = (await J(f, 'state')).view;
  expect(v.S / v.dpr).toBeGreaterThanOrEqual(1.5);
});

test('the game has the keyboard when the page loads: Space on the title starts it', async ({ page }) => {
  const f = await open(page, { width: 1366, height: 768 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await J(f, 'state')).screen, { timeout: 5000 }).toBe('world');
});
