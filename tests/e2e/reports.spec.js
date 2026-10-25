// Reports: three different players report a public game (built by a test builder, approved by the admin) and it hides itself.
import { test, expect } from '@playwright/test';
import { signup, uniq, ownIp, templateGame, publishFromStudio, adminPage, adminApprove } from './helpers.js';

async function report(browser, slug, { guest = false } = {}) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  if (guest) { await ownIp(page); await page.goto(`/play/${slug}`); } // one tap: becomes a guest
  else await signup(page, uniq('Rep'));
  await page.goto(`/g/${slug}`);
  await page.click('#reportbtn');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/report') && r.ok()), page.click('.sheet [data-reason="scary"]')]);
  await expect(page.locator('#toasts')).toContainText('A grown-up on our team will take a look');
  await ctx.close();
}

test('three reports from different players hide a public game', async ({ page, browser }) => {
  await signup(page, uniq('Bld'));
  const title = uniq('Reported Game ');
  const g = await templateGame(page, { title, template: 'runner' });
  await publishFromStudio(page, 'public');
  const admin = await adminPage(browser);
  await adminApprove(admin, g.id);

  const visitorCtx = await browser.newContext(); const visitor = await visitorCtx.newPage();
  expect((await visitor.goto(`/g/${g.slug}`)).status()).toBe(200);
  await visitor.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(visitor.locator(`#results a[href="/g/${g.slug}"]`).first()).toBeVisible();

  await report(browser, g.slug);                       // real reporter 1
  await report(browser, g.slug, { guest: true });      // a guest report does NOT count toward auto-hide
  await report(browser, g.slug);                       // real reporter 2
  expect((await visitor.goto(`/g/${g.slug}`)).status()).toBe(200); // two real reporters (+ a guest) is not enough
  await report(browser, g.slug);                       // real reporter 3 -> now hidden

  // Gone for a stranger: page, play page and search.
  expect((await visitor.goto(`/g/${g.slug}`)).status()).toBe(404);
  expect((await visitor.goto(`/play/${g.slug}`)).status()).toBe(404);
  await visitor.goto(`/search?q=${encodeURIComponent(title)}`);
  await expect(visitor.locator(`#results a[href="/g/${g.slug}"]`)).toHaveCount(0);

  // The builder is told in the Studio, and the admin sees it in Reports.
  await page.goto(`/studio/${g.id}`);
  await expect(page.locator('#st-live')).toContainText('hidden for now');
  await admin.goto('/admin?tab=reports');
  await expect(admin.locator('.reportcard', { hasText: title })).toContainText('4 open reports');
  await visitorCtx.close(); await admin.context().close();
});
