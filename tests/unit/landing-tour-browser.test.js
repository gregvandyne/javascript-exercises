// The homepage's Hub tour and video player in a real browser (public/js/landing.js; docs/decisions.md "Homepage: the
// one classroom tool for everything"): one step at a time, Next, Back, the stepper, the arrow keys, Home and End, the
// focus, the progress bar and the live region; on a phone the callout under the picture and no sideways scroll; the
// video player opens with captions and closes with Escape, the focus back on its link. No browser dialogs anywhere.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.LANDING_AT_ROOT = '1';
const { createApp } = await import('../../server/app.js');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(opts) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { errors.push(`browser dialog: ${d.type()}`); d.dismiss(); });
  await page.goto(`${BASE}/`); await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  return { ctx, page, errors };
}
const state = page => page.evaluate(() => {
  const box = document.querySelector('[data-tour]');
  const shown = [...box.querySelectorAll('.lp-tstep')].filter(s => s.offsetParent !== null).map(s => +s.dataset.step);
  return { shown, current: box.querySelector('.lp-step[aria-current="step"]')?.dataset.go, done: box.querySelectorAll('.lp-step.done').length,
    now: box.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), width: box.querySelector('.lp-progress i').style.width,
    live: box.querySelector('[data-tour-live]').textContent, focus: document.activeElement?.closest('.lp-tstep')?.dataset.step ?? null,
    focusWhat: document.activeElement?.matches('[data-next]') ? 'next' : document.activeElement?.matches('[data-back]') ? 'back' : document.activeElement?.tagName };
});

test('the tour: Next and Back, the stepper, the keys, focus, progress and the live region (laptop)', { skip }, async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 } });
  await page.locator('#tour').scrollIntoViewIfNeeded();
  let s = await state(page);
  assert.deepEqual(s.shown, [0], 'one step at a time');
  assert.equal(s.current, '0'); assert.equal(s.now, '1');
  assert.ok(await page.locator('.lp-tstep.on [data-back]').isDisabled(), 'no Back on the first step');
  await page.locator('.lp-tstep.on [data-next]').click();
  await page.locator('.lp-tstep.on [data-next]').click();
  s = await state(page);
  assert.deepEqual(s.shown, [2]); assert.equal(s.current, '2'); assert.equal(s.done, 2); assert.equal(s.now, '3'); assert.equal(parseFloat(s.width), 50);
  assert.equal(s.live, 'Step 3 of 6: Every desk, live');
  assert.equal(s.focus, '2'); assert.equal(s.focusWhat, 'next', 'Next keeps the focus');
  // The callout sits over the picture on a wide screen.
  const tip = await page.locator('.lp-tstep.on .lp-tip').boundingBox(), pic = await page.locator('.lp-tstep.on .lp-tstage').boundingBox();
  assert.ok(tip.y + tip.height <= pic.y + pic.height + 1 && tip.y >= pic.y, 'the callout is on the picture');
  // The keys: ArrowRight and ArrowLeft, End and Home.
  await page.keyboard.press('ArrowRight'); assert.deepEqual((await state(page)).shown, [3]);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); s = await state(page);
  assert.deepEqual(s.shown, [1]); assert.equal(s.focusWhat, 'back', 'Back keeps the focus');
  await page.keyboard.press('End'); s = await state(page); assert.deepEqual(s.shown, [5]); assert.equal(s.focusWhat, 'H3', 'End moves the focus to the step\'s heading');
  assert.equal(await page.locator('.lp-tstep.on [data-next]').textContent(), 'Start again');
  await page.locator('.lp-tstep.on [data-next]').click(); assert.deepEqual((await state(page)).shown, [0], 'the last Next starts again');
  // The stepper: a step picked moves the focus to its heading.
  await page.locator('.lp-step[data-go="4"]').click(); s = await state(page);
  assert.deepEqual(s.shown, [4]); assert.equal(s.focusWhat, 'H3'); assert.equal(s.focus, '4');
  // A click on the picture moves on.
  await page.locator('.lp-tstep.on .lp-tstage').click(); assert.deepEqual((await state(page)).shown, [5]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the tour on a phone: the callout under the picture, only the current step in the stepper, a swipe, no sideways scroll', { skip }, async () => {
  const { ctx, page, errors } = await open({ ...devices['iPhone 13'] });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll at 390');
  await page.locator('#tour').scrollIntoViewIfNeeded();
  await page.locator('.lp-tstep.on [data-next]').tap(); await page.locator('.lp-tstep.on [data-next]').tap();
  assert.deepEqual((await state(page)).shown, [2]);
  const tip = await page.locator('.lp-tstep.on .lp-tip').boundingBox(), pic = await page.locator('.lp-tstep.on .lp-tstage').boundingBox();
  assert.ok(tip.y >= pic.y + pic.height - 1, 'the callout is under the picture');
  assert.equal(await page.locator('.lp-steps .lp-step:visible').count(), 1, 'the stepper shows the current step');
  // Buttons are big enough to tap.
  for (const b of ['[data-back]', '[data-next]']) assert.ok((await page.locator(`.lp-tstep.on ${b}`).boundingBox()).height >= 36, b);
  // A swipe to the left on the picture: the next step.
  await page.evaluate(() => {
    const el = document.querySelector('.lp-tstep.on .lp-tstage'); const r = el.getBoundingClientRect();
    const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 40 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(r.right - 20)], changedTouches: [t(r.right - 20)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(r.left + 20)] }));
  });
  assert.deepEqual((await state(page)).shown, [3]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the video player: opens with the poster and captions, muted; Escape closes it, stops it and returns the focus', { skip }, async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } });
  const link = page.locator('.lp-how').first();
  await link.scrollIntoViewIfNeeded(); await link.focus(); await page.keyboard.press('Enter');
  const dlg = page.locator('#lp-vd');
  await dlg.waitFor({ state: 'visible' });
  const v = await page.evaluate(() => { const v = document.querySelector('#lp-vd video'); return { src: v.querySelector('source')?.getAttribute('src'), track: v.querySelector('track')?.getAttribute('src'), def: v.querySelector('track')?.default, muted: v.muted, poster: v.getAttribute('poster'), title: document.querySelector('#lp-vd-h').textContent, open: document.querySelector('#lp-vd').open }; });
  assert.ok(v.open); assert.match(v.src, /^\/video\/manip\/manip-[a-z-]+\.mp4$/); assert.match(v.track, /\.en\.vtt$/); assert.equal(v.def, true);
  assert.equal(v.muted, true); assert.match(v.poster, /-poster\.jpg$/); assert.ok(v.title.length > 2);
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('lp-how')), true, 'the focus is back on the link');
  assert.equal(await page.evaluate(() => document.querySelector('#lp-vd video source')), null, 'the video is stopped and unloaded');
  // The hero's overview button and the close button.
  await page.locator('.lp-playbtn').click(); await dlg.waitFor({ state: 'visible' });
  assert.match(await page.locator('#lp-vd video source').getAttribute('src'), /^\/video\/oomba-[a-z]+\.mp4$/);
  await page.locator('#lp-vd [data-close]').click(); await dlg.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  await ctx.close();
});
