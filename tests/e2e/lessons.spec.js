// Games end to end (games, not lessons): a teacher saves an Oomba game to a new folder, assigns it to their class from the
// folder with a due date; the class page has Games first; a student sees it under Assigned games and opens it to play.
import { test, expect } from '@playwright/test';
import { uniq, login, adminPage } from './helpers.js';

async function card(page) { return { user: (await page.locator('.logincard dd b').nth(0).textContent()).trim(), pass: (await page.locator('.logincard dd b').nth(1).textContent()).trim() }; }

test('a teacher saves a game to a folder and assigns it; a student sees it and opens it', async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = await adminPage(browser);
  await admin.goto('/admin/schools'); await admin.fill('#sn', `Lessons ${uniq('S')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.click('a[href$="?tab=people"]'); await admin.fill('#st-n', 'Teacher Tia'); await admin.selectOption('#st-r', 'teacher');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const tcard = await card(admin);

  const tctx = await browser.newContext(); const t = await tctx.newPage();
  await login(t, tcard.user, tcard.pass);
  await t.goto('/teach?all=1'); await t.fill('#nc-n', 'Space Class');
  await Promise.all([t.waitForURL(/\/class\//), t.click('form[data-api="/api/classes"] button[type=submit]')]);
  const classUrl = t.url().replace(/\?.*$/, ''); // a new class opens on its Students tab; the Lessons tab is the class's own page
  await t.fill('#as-n', 'Sam Student');
  await Promise.all([t.waitForURL(/\/cards\//), t.click('form[data-api$="/students"] button[type=submit]')]);
  const scard = await card(t);

  // Games, not lessons: an Oomba game saved to a new folder from its page, assigned from the folder with a due date
  await t.goto('/g/sum-racer');
  await t.click('a.qact[href^="/build/save?id="]');
  await t.fill('#gs-name', 'Space week');
  await t.click('form.gfo-newsave button[type=submit]');
  await expect(t.locator('.gfo-pick')).toContainText('In this folder');
  await t.goto('/build');
  await t.click('.shelf-item:has-text("Space week")');
  await expect(t.locator('#shelf-h')).toContainText('Space week');
  await t.click('.shelf-game a:has-text("Assign")');
  await t.fill('#ag-d', '2031-01-15');
  await Promise.all([t.waitForURL(/\/class\//), t.click('#ag-go')]);
  await expect(t.locator('#lessons')).toContainText('Sum Racer');
  await expect(t.locator('#lessons')).toContainText('Due');
  // the class page: Games first, New game and Assign from my games, no lesson tools
  await expect(t.locator('nav.classtabs a').first()).toContainText('Games');
  await expect(t.locator('#cl-newgame')).toBeVisible();
  await expect(t.locator('body')).not.toContainText('Draft with AI');

  // the student: the game on their class page, opening its page with Play
  const sctx = await browser.newContext(); const s = await sctx.newPage();
  await login(s, scard.user, scard.pass);
  await s.goto('/classes'); await s.click('.classcard');
  await expect(s.locator('body')).toContainText('Assigned games');
  await s.click('a.cl-main:has-text("Sum Racer")');
  await expect(s.locator('h1')).toHaveText('Sum Racer');
  await expect(s.locator('a[href^="/play/"]')).toHaveCount(1);
  await tctx.close(); await sctx.close();
});
