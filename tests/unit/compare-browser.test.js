// /compare in a real browser (Chromium): the "i" notes open by click, tap and keyboard, close on Escape (focus back on
// the button), on a tap outside and on Tab past them; Sources starts collapsed; a phone never scrolls the page sideways.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

seed({ quiet: true });
let server, base, browser;
test.before(async () => {
  server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
  if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); server.close(); });

const state = page => page.evaluate(() => ({
  open: [...document.querySelectorAll('.cmp-pop')].filter(p => !p.hidden).map(p => p.id),
  expanded: [...document.querySelectorAll('.cmp-i[aria-expanded="true"]')].map(b => b.getAttribute('aria-controls')),
  focus: document.activeElement && (document.activeElement.getAttribute('aria-controls') || document.activeElement.tagName),
}));

test('laptop: click opens a note, a second click or Escape closes it (focus back), one at a time, a click outside closes', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/compare`);
  assert.equal(await page.locator('#sources').evaluate(d => d.open), false, 'Sources starts collapsed');
  const btn = page.locator('button[aria-controls="pop-room-brainingcamp"]');
  await btn.click();
  let s = await state(page);
  assert.deepEqual(s.open, ['pop-room-brainingcamp']); assert.deepEqual(s.expanded, ['pop-room-brainingcamp']);
  const pop = page.locator('#pop-room-brainingcamp');
  assert.match(await pop.innerText(), /See all your students' screens/);
  assert.equal(await pop.locator('a[href="https://www.brainingcamp.com/live"]').count(), 1);
  const inView = await pop.evaluate(p => { const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
  assert.ok(inView, 'the note is on the screen, not cut off by the table');
  await page.locator('button[aria-controls="pop-games-oomba"]').click();
  s = await state(page);
  assert.deepEqual(s.open, ['pop-games-oomba'], 'opening another closes the first');
  await page.keyboard.press('Escape');
  s = await state(page);
  assert.deepEqual(s.open, []); assert.equal(s.focus, 'pop-games-oomba', 'Escape puts focus back on the button');
  await btn.click(); await btn.click();
  assert.deepEqual((await state(page)).open, [], 'a second click closes it');
  await btn.click(); await page.mouse.click(5, 5);
  assert.deepEqual((await state(page)).open, [], 'a click outside closes it');
  await page.locator('#sources > summary').click();
  assert.equal(await page.locator('#sources').evaluate(d => d.open), true);
  await page.close();
});

test('keyboard: Enter opens, Tab reaches the link inside, Tab past the note closes it', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/compare`);
  await page.locator('button[aria-controls="pop-free-kahoot"]').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual((await state(page)).open, ['pop-free-kahoot']);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.cmp-pop') && document.activeElement.getAttribute('href')), 'https://kahoot.com/schools/plans/');
  await page.keyboard.press('Tab');
  assert.deepEqual((await state(page)).open, [], 'leaving the note closes it');
  await page.close();
});

test('phone: no sideways page scroll, the need column stays in view, a tap opens a note that fits the screen', { skip }, async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(`${base}/compare`);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways page scroll');
  const box = page.locator('.cmp-scroll');
  await box.evaluate(e => { e.scrollLeft = 400; });
  const stuck = await page.evaluate(() => { const th = document.querySelector('tbody th[scope=row]'); const b = document.querySelector('.cmp-scroll').getBoundingClientRect(); return Math.abs(th.getBoundingClientRect().left - b.left) < 3; });
  assert.ok(stuck, 'the need column stays in view');
  const btn = page.locator('button[aria-controls="pop-free-brainingcamp"]');
  await btn.scrollIntoViewIfNeeded(); await btn.tap();
  const pop = page.locator('#pop-free-brainingcamp');
  assert.ok(await pop.isVisible());
  assert.ok(await pop.evaluate(p => { const r = p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'the note fits the phone screen');
  await page.touchscreen.tap(5, 300);
  assert.equal(await pop.isVisible(), false, 'a tap outside closes it');
  await ctx.close();
});
