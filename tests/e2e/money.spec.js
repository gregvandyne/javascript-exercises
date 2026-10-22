// Money: a Sponsored card seen for 1 s on a game page -> impression beacon -> admin roll-up -> the builder's /creator dashboard.
import { test, expect } from '@playwright/test';
import { signup, uniq, templateGame, publishFromStudio, adminPage, adminApprove } from './helpers.js';

const isImpression = r => r.url().endsWith('/api/ads/impression') && r.request().method() === 'POST';

test('a game-page ad impression reaches the ledger and the builder dashboard; no ads while playing', async ({ page, browser }) => {
  await signup(page, uniq('Bld'));
  const g = await templateGame(page, { title: uniq('Money Game '), template: 'memory' });
  await publishFromStudio(page, 'public');
  const admin = await adminPage(browser);
  await adminApprove(admin, g.id);

  // The owner's own views don't count.
  const own = page.waitForResponse(isImpression);
  await page.goto(`/g/${g.slug}`);
  expect(await (await own).json()).toEqual({ counted: false, reason: 'owner' });

  // A different signed-in player looks at the game page: the card stays visible > 1 s and the beacon is counted.
  const vctx = await browser.newContext(); const viewer = await vctx.newPage();
  await signup(viewer, uniq('View'));
  const beacon = viewer.waitForResponse(isImpression);
  const t0 = Date.now();
  await viewer.goto(`/g/${g.slug}`);
  const card = viewer.locator(`a.adcard[data-placement="game"][data-game="${g.id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sponsored');
  const res = await beacon;
  expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  expect(await res.json()).toEqual({ counted: true });
  await expect(card).toBeVisible();

  // The play page has no ad markup at all.
  await viewer.goto(`/play/${g.slug}`);
  const html = await viewer.content();
  expect(html).not.toContain('adcard');
  expect(html).not.toContain('Sponsored');
  expect(html).not.toContain('/js/ads.js');
  await expect(viewer.locator('.adcard')).toHaveCount(0);

  // Admin money page shows the raw impression, then the roll-up puts it in the ledger.
  await admin.goto('/admin/money');
  await Promise.all([admin.waitForResponse(r => r.url().endsWith('/api/admin/money/rollup') && r.ok()), admin.click('#rollup-form [type=submit]')]);
  await expect(admin.locator('#rollup-last')).toContainText('Last run');

  // The builder sees it: API and dashboard.
  const sum = await (await page.request.get('/api/creator/summary')).json();
  const mine = sum.games.find(x => x.id === g.id);
  expect(mine.impressions).toBe(1);
  expect(mine.lifetimeMillicents).toBeGreaterThan(0);
  await page.goto('/creator');
  const block = page.locator('.mgame', { hasText: g.title });
  await expect(block.locator('.mstat', { hasText: 'ad views' }).locator('b')).toHaveText('1');
  await expect(block.locator('.mgame-earned b')).toHaveText('under 1¢');
  await vctx.close(); await admin.context().close();
});
