// The homepage's Hub tour and video player in a real browser (public/js/landing.js; docs/decisions.md "Homepage: the
// one classroom tool for everything"): one step at a time, Next, Back, the stepper, the arrow keys, Home and End, the
// focus, the progress bar and the live region; each step's picture zoomed to its control with a ring inside the window,
// the camera panning between steps (and not under reduced motion), the picture not a button; on a phone the callout
// under the picture, no stepper, a swipe and no sideways scroll; every icon on "/" keeps its shape; the video player
// opens with captions and closes with Escape, the focus back on its link. No browser dialogs anywhere.
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

/** The current step's window, its ring and the camera's scale, as on the screen. */
const view = page => page.evaluate(() => {
  const st = document.querySelector('.lp-tstep.on'); const r = o => { const b = o.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const m = new DOMMatrix(getComputedStyle(st.querySelector('.lp-tcam')).transform);
  return { stage: r(st.querySelector('.lp-tstage')), ring: r(st.querySelector('.lp-ring')), tip: r(st.querySelector('.lp-tip')), scale: m.a, tx: m.e, ty: m.f };
});
const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
/** The ring's smallest distance to the window's edge (left, top, right, bottom). */
const margin = (a, b) => Math.min(a.x - b.x, a.y - b.y, b.x + b.w - (a.x + a.w), b.y + b.h - (a.y + a.h));

test('the tour: Next and Back, the stepper, the keys, focus, progress and the live region (laptop)', { skip }, async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.locator('#tour').scrollIntoViewIfNeeded();
  let s = await state(page);
  assert.deepEqual(s.shown, [0], 'one step at a time');
  assert.equal(s.current, '0'); assert.equal(s.now, '1');
  assert.ok(await page.locator('.lp-tstep.on [data-back]').isDisabled(), 'no Back on the first step');
  assert.equal(await page.locator('.lp-hot').count(), 0, 'no numbered dots on the pictures');
  await page.locator('.lp-tstep.on [data-next]').click();
  await page.locator('.lp-tstep.on [data-next]').click();
  s = await state(page);
  assert.deepEqual(s.shown, [2]); assert.equal(s.current, '2'); assert.equal(s.done, 2); assert.equal(s.now, '3'); assert.equal(parseFloat(s.width), 50);
  assert.equal(s.live, 'Step 3 of 6: Watch every desk');
  assert.equal(s.focus, '2'); assert.equal(s.focusWhat, 'next', 'Next keeps the focus');
  // The picture is zoomed in, its ring in the window, and the callout beside it on a wide screen.
  let v = await view(page);
  assert.ok(v.scale > 1.2, `zoomed in (${v.scale})`); assert.ok(inside(v.ring, v.stage), 'the ring is in the window');
  assert.ok(v.tip.x >= v.stage.x + v.stage.w, 'the callout is beside the picture');
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
  assert.equal(s.live, 'Step 5 of 6: Ask Oomba');
  // The picture is not a button: a click on it changes nothing.
  await page.locator('.lp-tstep.on .lp-tstage').click(); assert.deepEqual((await state(page)).shown, [4], 'a click on the picture does nothing');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the tour\'s camera pans and zooms from one step\'s region to the next, and jumps under reduced motion', { skip }, async () => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion });
    await page.locator('#tour').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);   // the first step settles (a late layout change moves its camera too)
    const first = await view(page);
    await page.locator('.lp-tstep.on [data-next]').tap();
    const mid = await view(page);
    await page.waitForTimeout(1000);
    const end = await view(page);
    if (reducedMotion === 'reduce') assert.ok(Math.abs(mid.tx - end.tx) < 1 && Math.abs(mid.ty - end.ty) < 1, 'no motion: straight to the region');
    else {
      assert.ok(Math.abs(mid.tx - end.tx) > 5 || Math.abs(mid.ty - end.ty) > 5 || Math.abs(mid.scale - end.scale) > .05, 'the camera is still on its way');
      const between = k => (mid[k] - first[k]) * (mid[k] - end[k]) <= 1e-6 * Math.max(1, Math.abs(first[k] - end[k]));
      assert.ok(['tx', 'ty', 'scale'].every(between), `it moves from the last step's region to this one's: ${JSON.stringify({ first, mid, end })}`);
    }
    assert.ok(inside(end.ring, end.stage), 'it ends with the ring in the window');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

for (const colorScheme of ['dark', 'light']) {
  test(`the tour on a phone (390x844, ${colorScheme}): zoomed to each control, the callout under the picture, a swipe, no sideways scroll`, { skip }, async () => {
    const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme, reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll at 390');
    await page.locator('#tour').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.lp-steps .lp-step:visible').count(), 0, 'no stepper on a phone: the callout says Step 1 of 6');
    // Every step: zoomed well in, its ring whole inside the window, the callout under the picture with one line.
    for (let i = 0; i < 6; i++) {
      const v = await view(page);
      assert.ok(v.scale >= 2.3, `step ${i + 1} is zoomed in (${v.scale.toFixed(2)})`);
      assert.ok(inside(v.ring, v.stage), `step ${i + 1}: the ring is in the window`);
      assert.ok(v.tip.y >= v.stage.y + v.stage.h - 1, 'the callout is under the picture');
      assert.equal(await page.locator('.lp-tstep.on .lp-tip p').count(), 1, 'one line');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `no sideways scroll on step ${i + 1}`);
      await page.locator('.lp-tstep.on [data-next]').tap();
    }
    assert.deepEqual((await state(page)).shown, [0]);
    await page.locator('.lp-tstep.on [data-next]').tap(); await page.locator('.lp-tstep.on [data-next]').tap();
    assert.deepEqual((await state(page)).shown, [2]);
    // Buttons are big enough to tap; the picture is not one.
    for (const b of ['[data-back]', '[data-next]']) assert.ok((await page.locator(`.lp-tstep.on ${b}`).boundingBox()).height >= 36, b);
    await page.locator('.lp-tstep.on .lp-tstage').tap(); assert.deepEqual((await state(page)).shown, [2], 'a tap on the picture does nothing');
    // A swipe to the left on the picture: the next step; to the right: back.
    const swipe = dir => page.evaluate(dir => {
      const el = document.querySelector('.lp-tstep.on .lp-tstage'); const r = el.getBoundingClientRect();
      const t = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 40 });
      const [a, b] = dir === 'left' ? [r.right - 20, r.left + 20] : [r.left + 20, r.right - 20];
      el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(a)], changedTouches: [t(a)] }));
      el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(b)] }));
    }, dir);
    await swipe('left'); assert.deepEqual((await state(page)).shown, [3]);
    await swipe('right'); assert.deepEqual((await state(page)).shown, [2]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`every step's ring is whole in its window, at least 8px from each edge (${viewport.width}x${viewport.height})`, { skip }, async () => {
    const { ctx, page, errors } = await open({ viewport, reducedMotion: 'reduce', ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
    await page.locator('#tour').scrollIntoViewIfNeeded();
    for (let i = 0; i < 6; i++) {
      const v = await view(page);
      const m = margin(v.ring, v.stage);
      assert.ok(m >= 8, `step ${i + 1}: the ring is ${m.toFixed(1)}px from the window's edge (${JSON.stringify({ ring: v.ring, stage: v.stage })})`);
      assert.ok(v.ring.w > 20 && v.ring.h > 20, `step ${i + 1}: the ring is big enough to see`);
      await page.locator('.lp-tstep.on [data-next]').click();
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('every icon on "/" keeps its shape (rendered width/height within 3% of the picture\'s own), phone and laptop, light and dark', { skip }, async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const colorScheme of ['light', 'dark']) {
    const { ctx, page, errors } = await open({ viewport, colorScheme });
    await page.evaluate(() => { for (const i of document.querySelectorAll('img[loading="lazy"]')) i.loading = 'eager'; });
    await page.waitForFunction(() => [...document.querySelectorAll('img.fx')].every(i => i.complete), null, { timeout: 15000 });
    const icons = await page.evaluate(() => [...document.querySelectorAll('img.fx')].filter(i => i.getBoundingClientRect().width > 0).map(i => {
      const r = i.getBoundingClientRect();
      return { src: i.getAttribute('src'), where: i.closest('section,header,footer')?.id || '', ratio: r.width / r.height, natural: i.naturalWidth / i.naturalHeight };
    }));
    assert.ok(icons.length > 30, `the page's icons (${icons.length})`);
    const bad = icons.filter(x => !(x.natural > 0) || Math.abs(x.ratio / x.natural - 1) > 0.03);
    assert.deepEqual(bad, [], `${viewport.width} ${colorScheme}: squeezed icons`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the how-it-works videos: six show, Show all opens the rest and Show fewer folds them again (phone)', { skip }, async () => {
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 } });
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.lp-how')].filter(a => a.checkVisibility() && a.getClientRects().length).length);
  const sum = page.locator('.lp-howmore > summary');
  await sum.scrollIntoViewIfNeeded();
  assert.equal(await shown(), 6);
  assert.equal((await sum.innerText()).trim(), 'Show all 18 videos');
  await sum.click();
  assert.equal(await shown(), 18);
  assert.equal((await sum.innerText()).trim(), 'Show fewer');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
  await sum.click();
  assert.equal(await shown(), 6);
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
  // The hero's play button (the Hub in 60 seconds) and the close button.
  await page.locator('.lp-playbtn').click(); await dlg.waitFor({ state: 'visible' });
  assert.equal(await page.locator('#lp-vd video source').getAttribute('src'), '/video/oomba-hub-promo.mp4');
  await page.locator('#lp-vd [data-close]').click(); await dlg.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  await ctx.close();
});
