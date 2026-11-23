// /compare in a real browser (Chromium): rows start closed; a click on the need's label, or Enter / Space on it, opens
// the detail row under it and closes it again; several rows can be open at once; Sources starts collapsed. On a phone
// the page never scrolls sideways, the need column stays in view and an open row's detail stays readable inside the
// table's scroll box, wherever the table is scrolled.
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

const openRows = page => page.evaluate(() => [...document.querySelectorAll('tr.cmp-det')].filter(r => !r.hidden).map(r => r.id));
const expanded = page => page.evaluate(() => [...document.querySelectorAll('.cmp-tog[aria-expanded="true"]')].map(b => b.getAttribute('aria-controls')));

test('laptop: rows start closed; a click opens and closes a row; two open at once; the detail has the quote and link', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/compare`);
  assert.deepEqual(await openRows(page), [], 'every row starts closed');
  assert.equal(await page.locator('#sources').evaluate(d => d.open), false, 'Sources starts collapsed');
  await page.locator('#row-room .cmp-tog').click();
  await page.locator('#row-free .cmp-tog').click();
  assert.deepEqual(await openRows(page), ['det-room', 'det-free'], 'several rows open at once');
  assert.deepEqual(await expanded(page), ['det-room', 'det-free']);
  const room = page.locator('#det-room');
  assert.match(await room.innerText(), /See all your students' screens/);
  assert.equal(await room.locator('a[href="https://www.brainingcamp.com/live"]').count(), 1);
  assert.match(await room.innerText(), /Kahoot!: Not stated on their site/);
  await page.locator('#row-room .cmp-tog').click();
  assert.deepEqual(await openRows(page), ['det-free'], 'a second click closes it');
  // The whole label is the button: a click on the words (not the arrow) toggles too.
  await page.locator('#row-games .cmp-tog span').click();
  assert.ok((await openRows(page)).includes('det-games'));
  await page.close();
});

test('keyboard: Enter and Space toggle a row; Tab goes into an open row\'s links, past a closed one', { skip }, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/compare`);
  await page.locator('#row-devices .cmp-tog').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await openRows(page), ['det-devices']);
  await page.keyboard.press('Space');
  assert.deepEqual(await openRows(page), []);
  await page.keyboard.press('Space');
  assert.deepEqual(await openRows(page), ['det-devices']);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('#det-devices') && document.activeElement.getAttribute('href')), 'https://kahoot.com/home/mobile-app/', 'Tab goes into the open row\'s detail');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-controls')), 'det-privacy', 'closed, Tab goes on to the next row\'s label');
  await page.close();
});

test('phone: no sideways page scroll; the need column and an open row\'s detail stay in view when the table scrolls', { skip }, async () => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(`${base}/compare`);
  const noSideways = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.ok(await noSideways(), 'no sideways page scroll');
  await page.locator('#row-companion .cmp-tog').tap();
  await page.locator('#row-languages .cmp-tog').tap();
  assert.deepEqual(await openRows(page), ['det-companion', 'det-languages']);
  assert.ok(await noSideways(), 'still none with rows open');
  for (const left of [0, 400]) {
    await page.locator('.cmp-scroll').evaluate((e, x) => { e.scrollLeft = x; }, left);
    const fit = await page.evaluate(() => {
      const box = document.querySelector('.cmp-scroll').getBoundingClientRect();
      const inner = document.querySelector('#det-languages .cmp-det-in').getBoundingClientRect();
      const th = document.querySelector('#row-languages th').getBoundingClientRect();
      return { detail: inner.left >= box.left - 1 && inner.right <= box.right + 1, need: Math.abs(th.left - box.left) < 3 };
    });
    assert.ok(fit.detail, `the detail fits the scroll box (scrolled ${left})`);
    assert.ok(fit.need, `the need column stays in view (scrolled ${left})`);
  }
  await ctx.close();
});
