// The Studio with the mock Builder: chips -> game -> edit -> version history restore -> Friends -> Public review ->
// admin approval -> Home; then "Update live game": strangers keep the old version until the update is approved.
import { test, expect } from '@playwright/test';
import { signup, uniq, adminPage, adminApprove, studioState, publishFromStudio } from './helpers.js';

const idle = page => expect(page.locator('#st-send')).toBeEnabled({ timeout: 20000 });
/** The Builder's tune-up values inside the game frame (null while the frame is loading). */
const tune = async page => {
  const f = page.frames().find(x => x.url().includes('/frame/'));
  try { return f ? await f.evaluate(() => (typeof window.BRB === 'object' && window.BRB_TUNE ? { speed: window.BRB_TUNE.speed, level2: window.BRB_TUNE.level2 } : null)) : null; }
  catch { return null; }
};
const speedIn = page => expect.poll(async () => { const t = await tune(page); return t && t.speed; });
const level2In = page => expect.poll(async () => { const t = await tune(page); return t && t.level2; });
async function say(page, text) {
  await page.fill('#st-input', text); await page.press('#st-input', 'Enter');
  await expect(page.locator('.st-busy')).toHaveCount(0, { timeout: 20000 }); await idle(page);
}

test('build with the mock Builder, edit, restore, publish, review, update', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await signup(page, uniq('Bld'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  const id = page.url().split('/studio/')[1];

  // The Builder asks with chips; tap chips until a game is built.
  await expect(page.locator('#st-log .qchips:not(.used) .chip').first()).toBeVisible();
  for (let i = 0; i < 5 && !(await page.locator('#st-log .ev.version').count()); i++) {
    const chip = page.locator('#st-log .qchips:not(.used) .chip').first();
    await chip.click();
    await expect(page.locator('.st-busy')).toHaveCount(0, { timeout: 20000 }); await idle(page);
  }
  await expect(page.locator('#st-log .ev.version')).toContainText('Version 1 is ready');

  // The preview runs in the player sandbox (no allow-same-origin) and has the SDK.
  const frameEl = page.locator('#st-frame');
  expect(await frameEl.getAttribute('sandbox')).not.toContain('allow-same-origin');
  let st = await studioState(page, id);
  await speedIn(page).toBe(1);
  const title = st.game.title;

  // Edit -> version 2, really faster.
  await say(page, 'Make it harder');
  await expect(page.locator('#st-log .ev.version').last()).toContainText('Version 2 is ready');
  st = await studioState(page, id);
  const v2 = st.versions.find(v => v.number === 2);
  await speedIn(page).toBe(1.25);

  // History: bring back version 1 -> a new version 3; versions 1 and 2 stay as they were.
  await page.click('#st-history');
  const vlist = page.locator('.sheet .vlist');
  await expect(vlist.locator('.vrow')).toHaveCount(2);
  await vlist.locator('.vrow', { has: page.locator('.vn', { hasText: /^v1$/ }) }).locator('[data-restore]').click();
  await expect(page.locator('#toasts')).toContainText('Brought back as version 3');
  st = await studioState(page, id);
  expect(st.versions.map(v => v.number)).toEqual([3, 2, 1]);
  expect(st.versions.find(v => v.number === 3).notes).toBe('Restored version 1');
  expect(st.versions.find(v => v.number === 2).notes).toBe(v2.notes);
  await speedIn(page).toBe(1);

  // Publish for Friends: live at once.
  await publishFromStudio(page, 'friends');
  await expect(page.locator('#st-live')).toContainText('Live: version 3');
  await expect(page.locator('#st-live')).toContainText('Friends');

  // Public: waits for a person to review it.
  await publishFromStudio(page, 'public');
  await expect(page.locator('#st-live')).toContainText('Waiting for a quick safety check');
  st = await studioState(page, id);
  expect(st.pending.number).toBe(3);
  const slug = st.game.slug;

  // A stranger can't see it yet.
  const anonCtx = await browser.newContext(); const anon = await anonCtx.newPage();
  expect((await anon.goto(`/g/${slug}`)).status()).toBe(404);

  // Admin approves from the review queue -> it is on Home for an anonymous visitor.
  const admin = await adminPage(browser);
  await adminApprove(admin, id);
  await anon.goto('/');
  await expect(anon.locator(`#new a[href="/g/${slug}"]`).first()).toBeVisible();
  await anon.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(anon.locator(`#results a[href="/g/${slug}"]`).first()).toBeVisible();

  // Update flow: another edit, then "Update live game". Public -> reviewed; players keep version 3 meanwhile.
  await page.reload();
  await say(page, 'Add a second level');
  await expect(page.locator('#st-log .ev.version').last()).toContainText('Version 4 is ready');
  await expect(page.locator('#st-publish')).toHaveText(/Update live game/);
  await page.locator('#st-live [data-act="update"]').click();
  await page.locator('.sheet #upd-go').click();
  await expect(page.locator('#st-live')).toContainText('Version 4 is waiting for a quick safety check');
  await expect(page.locator('#st-live')).toContainText('Players keep playing version 3');
  st = await studioState(page, id);
  expect(st.live.number).toBe(3); expect(st.pending.number).toBe(4);

  // A stranger plays: still version 3 (no level 2).
  const strangerCtx = await browser.newContext(); const stranger = await strangerCtx.newPage();
  await stranger.goto(`/play/${slug}`);
  await level2In(stranger).toBe(false);

  // Admin approves the update -> the stranger now gets version 4.
  await adminApprove(admin, id);
  await stranger.reload();
  await level2In(stranger).toBe(true);
  st = await studioState(page, id);
  expect(st.live.number).toBe(4); expect(st.pending).toBeNull();

  await anonCtx.close(); await strangerCtx.close(); await admin.context().close();
});

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('a picture attached in the Studio shows in the chat and is private to the builder', async ({ page, browser }) => {
  await signup(page, uniq('Pic'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  await page.setInputFiles('#st-file', { name: 'drawing.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#st-attach .att:not(.loading) [data-rm]')).toBeVisible();
  await say(page, 'A catch game about my drawing');
  const img = page.locator('#st-log .msg.me .att img');
  await expect(img).toHaveCount(1);
  await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth)).toBe(1);
  const src = await img.getAttribute('src');
  expect(src).toMatch(/^\/api\/studio\/[^/]+\/uploads\/[^/]+$/);
  expect((await page.request.get(src)).status()).toBe(200);

  const otherCtx = await browser.newContext(); const other = await otherCtx.newPage();
  await signup(other, uniq('Other'));
  expect((await other.request.get(src)).status()).toBe(404);
  await otherCtx.close();
});

test('a dropped connection mid-build still shows what the Builder made; a message that never arrived says so', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page, uniq('Drp'));
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  // The phone loses the stream after the server has the message: the server finishes the turn and saves it,
  // and the page (seeing a network error) waits for the Builder and redraws the chat from the saved state.
  await page.route('**/api/studio/*/chat', async route => { await route.fetch(); await route.abort('connectionreset'); });
  for (let i = 0; i < 5 && !(await page.locator('#st-log .ev.version').count()); i++) {
    await page.locator('#st-log .qchips:not(.used) .chip').first().click();
    await expect(page.locator('.st-busy')).toHaveCount(0, { timeout: 30000 }); await idle(page);
  }
  await expect(page.locator('#st-log .ev.version')).toContainText('Version 1 is ready');
  await expect(page.locator('#st-log .err')).toHaveCount(0);
  // The message never reaches the server: nothing new is saved, so the page says the connection dropped.
  await page.unroute('**/api/studio/*/chat');
  await page.route('**/api/studio/*/chat', route => route.abort('connectionreset'));
  await page.fill('#st-input', 'Make it harder'); await page.press('#st-input', 'Enter');
  await expect(page.locator('#st-log .err').last()).toBeVisible({ timeout: 30000 }); await idle(page);
});

test('My games: rename and delete right from the Build page (phone size)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await signup(page, uniq('Del'));
  for (let i = 0; i < 2; i++) { await page.goto('/build'); await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]); }
  await page.goto('/build');
  const cards = page.locator('.mygame');
  await expect(cards).toHaveCount(2);
  // rename the first one
  await cards.first().locator('[data-rename]').click();
  await page.fill('#mg-name', 'Rocket Race');
  await page.click('.sheet button[type=submit]');
  await expect(cards.first().locator('h3')).toHaveText('Rocket Race');
  await page.reload(); await expect(page.locator('.mygame h3', { hasText: 'Rocket Race' })).toHaveCount(1);
  // delete it: "Keep it" does nothing, Delete removes it
  const rocket = page.locator('.mygame', { hasText: 'Rocket Race' });
  await rocket.locator('[data-delete]').click();
  await expect(page.locator('.sheet')).toContainText('Rocket Race');
  await page.click('.sheet [data-keep]'); await expect(cards).toHaveCount(2);
  await rocket.locator('[data-delete]').click();
  await page.click('.sheet [data-yes]');
  await expect(cards).toHaveCount(1);
  await page.reload(); await expect(cards).toHaveCount(1); await expect(page.locator('.mygame', { hasText: 'Rocket Race' })).toHaveCount(0);
  // buttons stay big enough to tap
  for (const b of await page.locator('.mg-actions .btn').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});
