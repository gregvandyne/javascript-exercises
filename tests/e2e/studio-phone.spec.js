// The Studio on a 390 px phone: "🧮 Edit lesson" opens the Activity panel inline under it (an accordion, not a sheet)
// and closes it again, with unsaved changes still held back; the row under it ("🎮 Make it an arcade game" and the live
// button) on one line, the live button plain "📡 Make it a live game" when not live and Spark yellow "📡 Live game" when
// live; and Full screen without the Fullscreen API (iPhone Safari): the preview covers the window, ✕ and Esc leave it.
import { test, expect } from '@playwright/test';
import { teacherSignup, templateGame } from './helpers.js';
// Icons are Oomba icons or Fluent pictures (public/js/icons.js): a button reads "<svg> Edit lesson", so its words and its picture are
// checked apart.
const icon = (loc, name) => expect(loc.locator(`:is(img.fx[src*="/${name}"], svg.fx[data-fx^="${name}"])`)).toHaveCount(1);

// Spark (the Publish button's yellow) and the site's white card (Cream, #FFFDF2, in the light theme)
const YELLOW = 'rgb(255, 210, 63)', WHITE = 'rgb(255, 253, 242)';
const box = (page, sel) => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; });

test.describe('the Studio on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Edit lesson opens the Activity panel inline; the two buttons share one row; Full screen falls back without the API', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    // iPhone Safari: no Fullscreen API on anything but a video
    await page.addInitScript(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true }); });
    await teacherSignup(page);
    await templateGame(page, { template: 'canvas' });
    const edit = page.locator('[data-act="edit-activity"]');
    await expect(edit).toHaveText('Edit lesson'); await icon(edit, 'abacus');
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await expect(edit).toHaveAttribute('aria-controls', 'st-acc');
    // full width of its container
    const acts = await page.locator('#st-acts').evaluate(el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
    expect(Math.abs((await box(page, '[data-act="edit-activity"]')).width - acts)).toBeLessThan(1.5);
    await expect(page.locator('#st-activity .ap-row').first()).toBeHidden();

    // the row: two equal buttons, one line, the live one plain
    const arcade = page.locator('#st-btnrow [data-act="canvas-switch"]'), live = page.locator('#st-livebtn');
    await expect(arcade).toHaveText('Make it an arcade game'); await icon(arcade, 'video-game');
    await expect(live).toHaveText('Make it a live game'); await icon(live, 'satellite-antenna');
    await expect(live).toHaveAttribute('data-act', 'make-live');
    expect(await live.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(WHITE);
    const [a0, l0] = [await box(page, '#st-btnrow [data-act="canvas-switch"]'), await box(page, '#st-livebtn')];
    expect(a0.top).toBe(l0.top);
    expect(Math.abs(a0.width - l0.width)).toBeLessThan(1.5);
    await expect(page.locator('#st-acts')).not.toContainText('Not a live game');
    await expect(page.locator('#st-actcap')).toContainText('Classroom activity · results go to Progress');

    // open: the panel is right under the button, in the page (not a sheet), and the row moves down
    await edit.click();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#st-acc')).toBeVisible();
    await expect(page.locator('#st-acc > #st-activity .ap-row').first()).toBeVisible();
    expect(await page.locator('#st-activity').evaluate(el => getComputedStyle(el).position)).not.toBe('fixed');
    const [e1, p1, a1] = [await box(page, '[data-act="edit-activity"]'), await box(page, '#st-activity'), await box(page, '#st-btnrow')];
    expect(p1.top).toBeGreaterThanOrEqual(e1.bottom); expect(p1.top - e1.bottom).toBeLessThan(16);
    expect(p1.height).toBeGreaterThan(300);
    expect(a1.top).toBeGreaterThanOrEqual(p1.bottom);
    expect(p1.left).toBeGreaterThanOrEqual(0); expect(p1.right).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // a change in the accordion: Save and Undo there, and the Builder held back while it is unsaved (open or closed)
    const second = await page.locator('.ap-row[data-i="1"] .ap-t b').textContent();
    await page.focus('.ap-row[data-i="1"] .ap-grip'); await page.keyboard.press('ArrowUp');
    await expect(page.locator('.ap-row[data-i="0"] .ap-t b')).toHaveText(second);
    await expect(page.locator('#st-acc [data-ap="save"]')).toBeEnabled();
    await edit.click();
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#st-acc')).toBeHidden();
    expect((await box(page, '#st-btnrow')).top).toBeLessThan(a1.top);
    await page.fill('#st-input', 'Make it blue'); await page.click('#st-send');
    await expect(page.locator('.toast.bad')).toContainText('Save or undo');
    await edit.click();
    await expect(page.locator('.ap-sum')).toContainText('Problem 2 moved up');
    await page.locator('#st-acc [data-ap="undo"]').click();
    await expect(page.locator('.ap-row[data-i="1"] .ap-t b')).toHaveText(second);
    await edit.click();
    await expect(page.locator('#st-acc')).toBeHidden();

    // Full screen with no Fullscreen API: the preview covers the window, the page is locked, ✕ and Esc leave it
    await page.click('#st-full');
    const stage = page.locator('#st-stage');
    await expect(stage).toHaveClass(/\bcss-full\b/);
    expect(await box(page, '#st-stage')).toEqual({ top: 0, bottom: 844, left: 0, right: 390, width: 390, height: 844 });
    const exit = page.locator('#st-stage .fs-exit');
    await expect(exit).toHaveText('✕ Exit full screen'); await expect(exit).toBeFocused();
    expect(await page.evaluate(() => { const r = document.querySelector('.fs-exit').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el && !!el.closest('.fs-exit'); })).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    await exit.click();
    await expect(stage).not.toHaveClass(/\bcss-full\b/); await expect(exit).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
    await page.click('#st-full'); await expect(stage).toHaveClass(/\bcss-full\b/);
    await page.keyboard.press('Escape'); await expect(stage).not.toHaveClass(/\bcss-full\b/);
    // a refused request falls back too
    await page.evaluate(() => { Element.prototype.requestFullscreen = function () { return Promise.reject(new Error('no')); }; });
    await page.click('#st-full'); await expect(stage).toHaveClass(/\bcss-full\b/);
    await page.locator('#st-stage .fs-exit').click(); await expect(stage).not.toHaveClass(/\bcss-full\b/);

    // 320 px: still one row, and no word broken inside a button
    await page.setViewportSize({ width: 320, height: 700 });
    const [a2, l2] = [await box(page, '#st-btnrow [data-act="canvas-switch"]'), await box(page, '#st-livebtn')];
    expect(a2.top).toBe(l2.top); expect(l2.right).toBeLessThanOrEqual(320);
    for (const sel of ['#st-btnrow [data-act="canvas-switch"]', '#st-livebtn']) expect(await page.locator(sel).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the live button: Spark yellow "📡 Live game" once the game is live', async ({ page }) => {
    test.setTimeout(180_000);
    await teacherSignup(page);
    await templateGame(page);
    const live = page.locator('#st-livebtn');
    await expect(live).toHaveText('Make it a live game'); await icon(live, 'satellite-antenna');
    expect(await live.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(WHITE);
    await live.click();   // the fixed Builder message (the mock Builder makes it live-ready)
    await expect(live).toHaveText('Live game', { timeout: 90_000 }); await icon(live, 'satellite-antenna');
    await expect(live).toHaveAttribute('data-act', 'live-publish');
    await page.mouse.move(5, 5);   // (not the hover shade)
    await expect.poll(() => live.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(YELLOW);
    await expect(page.locator('#st-live-cap')).toContainText('Publish it to host it live');
    expect((await box(page, '#st-livebtn')).right).toBeLessThanOrEqual(390);
  });
});
