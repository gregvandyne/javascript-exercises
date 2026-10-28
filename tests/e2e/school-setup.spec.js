// "Set up my school" (the navigation proposal, week 1): a teacher fills in the short form on /teachers (a field to fix
// is marked and says why), sees the thank-you, and the platform admin finds it in /admin's "School requests" queue and
// sets the school up with "Create school". The form and its thank-you at 360 px and 1280 px, light and dark, and right
// to left (he): nothing touches, no sideways scroll.
import { test, expect } from '@playwright/test';
import { ownIp, login, signup, uniq, ADMIN } from './helpers.js';
import { findTouching } from './touching.js';

test.describe.configure({ timeout: 180_000 });

test('a teacher sends "Set up my school"; the admin creates the school from the queue', async ({ browser }) => {
  const school = `Maple ${uniq('S')} Elementary`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage(); await ownIp(page);
  await page.goto('/teachers');
  await page.locator('.lp-hero a', { hasText: 'Get a free school account' }).click();
  const form = page.locator('form.sr-form');
  await expect(form).toBeVisible();
  await expect(page.locator('#start')).toContainText('within 1 school day');
  await expect(page.locator('#start a[href^="mailto:"][href*="subject="]')).toHaveCount(0);
  await page.fill('#sr-school', school);
  await page.selectOption('#sr-role', 'teacher');
  await page.fill('#sr-email', 'not-an-email');
  await page.fill('#sr-students', '320');
  await page.fill('#sr-country', 'United States');
  await form.locator('button[type=submit]').click();
  await expect(page.locator('#sr-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#sr-email-err')).toHaveText('Type an email address like name@school.org.');
  await page.fill('#sr-email', 'ms.rivera@maple.example.org');
  await Promise.all([page.waitForURL(/\/teachers\?sent=1#start$/), form.locator('button[type=submit]').click()]);
  await expect(page.locator('#setup-thanks')).toContainText("Thank you! We've got your request.");
  await expect(page.locator('form.sr-form')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(school);
  await ctx.close();

  const boss = await (await browser.newContext()).newPage();
  await login(boss, ADMIN.username, ADMIN.password);
  await boss.goto('/admin');
  await expect(boss.locator('.tabs a[href="/admin?tab=schoolreq"] .badge')).toBeVisible();
  await boss.goto('/admin?tab=schoolreq');
  const card = boss.locator('article', { hasText: school });
  await expect(card).toContainText('ms.rivera@maple.example.org');
  await Promise.all([boss.waitForURL(/\/admin\/schools\?request=/), card.locator('a', { hasText: 'Create school' }).click()]);
  await expect(boss.locator('#sn')).toHaveValue(school);
  await Promise.all([boss.waitForURL(/\/school\/[^/]+\?tab=people&new=1/), boss.locator('form[data-api="/api/admin/schools"] button[type=submit]').click()]);
  await boss.goto('/admin?tab=schoolreq');
  await expect(boss.locator('article', { hasText: school })).toHaveCount(0);
  await expect(boss.locator('table', { hasText: school })).toContainText('✅');
  await boss.context().close();
});

test('a kid\'s account sees no form; the form and the thank-you fit (360 / 1280, light / dark, he)', async ({ browser }) => {
  const kid = await (await browser.newContext()).newPage();
  await signup(kid, uniq('Kid'));
  await kid.goto('/teachers#start');
  await expect(kid.locator('form.sr-form')).toHaveCount(0);
  await expect(kid.locator('#start')).toContainText('Show this page to your teacher!');
  await kid.context().close();

  const problems = [];
  for (const [width, height, scheme, lang] of [[360, 780, 'light', 'en'], [360, 780, 'dark', 'en'], [1280, 860, 'light', 'en'], [1280, 860, 'dark', 'en'], [360, 780, 'light', 'he'], [1280, 860, 'dark', 'he']]) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of ['/teachers', '/teachers?sent=1']) {
      await page.goto(p); await page.evaluate(() => document.fonts.ready);
      await page.locator('#start').scrollIntoViewIfNeeded();
      for (const t of await findTouching(page)) problems.push(`${p} @${width}/${scheme}/${lang}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${width}/${lang}: scrolls sideways by ${wide}px`);
      // The robot field never shows.
      if (p === '/teachers') { const b = await page.locator('.sr-hp').boundingBox(); if (b && (b.width > 1 || b.height > 1)) problems.push(`${p} @${width}/${lang}: the hidden field shows`); }
    }
    await ctx.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});
