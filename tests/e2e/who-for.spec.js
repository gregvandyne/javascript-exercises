// "Who's this for?" on Start free (docs/decisions.md "Who's this for?"): signed out, /signup asks Me (a grown-up) ·
// My child · I'm a teacher. "My child" opens the kid form (and a kid can sign up through it), "I'm a teacher" the school
// form, "Me (a grown-up)" the grown-up sign-up or, while parents' accounts are off (as on this test server), an honest
// "coming soon". It works without JavaScript; a guest keeping their progress, a kid sent from the Builder and Sign in skip
// it. Nothing touches and nothing scrolls sideways at 360px and 1280px, light and dark, and right-to-left.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ownIp, uniq } from './helpers.js';

test.describe.configure({ timeout: 180_000 });

test('the three choices lead on; "My child" signs a kid up; works without JavaScript', async ({ browser }) => {
  for (const javaScriptEnabled of [true, false]) {
    const ctx = await browser.newContext({ javaScriptEnabled });
    const page = await ctx.newPage(); await ownIp(page);
    await page.goto('/signup');
    await expect(page.getByRole('heading', { level: 1, name: 'Who’s this for?' })).toBeVisible();
    const group = page.getByRole('group', { name: 'Who’s this for?' });
    await expect(group.getByRole('link')).toHaveCount(3);
    await expect(page.locator('#username')).toHaveCount(0);
    await expect(page.locator('.grownup-line')).toHaveCount(0);
    // I'm a teacher: the Set up my school form.
    await group.getByRole('link', { name: /I’m a teacher/ }).click();
    await expect(page).toHaveURL(/\/teachers#start$/);
    await expect(page.locator('section#start')).toBeVisible();
    // Me (a grown-up): parents' accounts aren't open here, so an honest "coming soon" with the parent page.
    await page.goto('/signup');
    await page.getByRole('link', { name: /Me \(a grown-up\)/ }).click();
    await expect(page).toHaveURL(/\/signup\?for=grownup$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Grown-up accounts are coming soon');
    await expect(page.getByRole('link', { name: 'Oomba Academy for parents' })).toHaveAttribute('href', '/parents');
    await page.getByRole('link', { name: 'Who’s this for? Pick again' }).click();
    await expect(page).toHaveURL(/\/signup$/);
    // My child: the kid form, unchanged, with a way back.
    await page.getByRole('link', { name: /My child/ }).click();
    await expect(page).toHaveURL(/\/signup\?for=kid$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Make a free account');
    await expect(page.getByRole('link', { name: 'Who’s this for? Pick again' })).toHaveAttribute('href', '/signup');
    if (javaScriptEnabled) {
      const name = uniq('Who');
      await page.fill('#username', name); await page.fill('#password', 'secret123');
      await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/signup')), page.click('button[type=submit]')]);
      await page.goto('/me'); await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await ctx.close();
  }
});

test('skipped for a guest keeping their progress and a kid sent from the Builder; Sign in never asks', async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await ownIp(page);
  await page.goto('/build');
  await expect(page).toHaveURL(/\/signup\?next=%2Fbuild$/);
  await expect(page.locator('#username')).toBeVisible();
  await expect(page.locator('.whofor')).toHaveCount(0);
  await page.goto('/login');
  await expect(page.locator('.whofor')).toHaveCount(0);
  await expect(page.locator('.grownup-line')).toBeVisible();
  // A guest (one tap on Play) keeping their progress gets the upgrade form straight away.
  expect(await page.evaluate(() => fetch('/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.status))).toBe(200);
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Keep your progress');
  await expect(page.locator('.whofor')).toHaveCount(0);
  await ctx.close();
});

test('nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  const problems = [];
  for (const [width, scheme, lang] of [[360, 'light', 'en'], [360, 'dark', 'en'], [1280, 'light', 'en'], [1280, 'dark', 'en'], [360, 'light', 'he'], [360, 'dark', 'ar']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of ['/signup', '/signup?for=kid', '/signup?for=grownup']) {
      await page.goto(p);
      for (const t of await findTouching(page)) problems.push(`${p} @${width}/${scheme}/${lang}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${width}/${lang}: scrolls sideways by ${wide}px`);
    }
    if (lang === 'en' && width === 360) {
      await page.goto('/signup');
      // Every choice is a full-width button that a thumb can hit.
      for (const b of await page.locator('.whofor .door').all()) {
        const box = await b.boundingBox(); if (box.height < 60 || box.width < 280) problems.push(`choice too small: ${box.width}x${box.height}`);
      }
    }
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
