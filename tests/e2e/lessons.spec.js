// Lessons end to end: a teacher builds a lesson (reading, a game, a build activity), assigns it to a class, adds a unit;
// a student with a school account opens it, sees Play, and "Start building" opens the Studio with the idea ready.
import { test, expect } from '@playwright/test';
import { uniq, login, adminPage } from './helpers.js';

async function card(page) { return { user: (await page.locator('.logincard dd b').nth(0).textContent()).trim(), pass: (await page.locator('.logincard dd b').nth(1).textContent()).trim() }; }

test('teacher builds and assigns a lesson; a student works through it', async ({ browser }) => {
  test.setTimeout(150_000);
  const admin = await adminPage(browser);
  await admin.goto('/admin/schools'); await admin.fill('#sn', `Lessons ${uniq('S')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.click('a[href$="?tab=people"]'); await admin.fill('#st-n', 'Teacher Tia'); await admin.selectOption('#st-r', 'teacher');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const tcard = await card(admin);

  const tctx = await browser.newContext(); const t = await tctx.newPage();
  await login(t, tcard.user, tcard.pass);
  await t.goto('/teach'); await t.fill('#nc-n', 'Space Class');
  await Promise.all([t.waitForURL(/\/class\//), t.click('form[data-api="/api/classes"] button[type=submit]')]);
  const classUrl = t.url().replace(/\?.*$/, ''); // a new class opens on its Students tab; the Lessons tab is the class's own page
  await t.fill('#as-n', 'Sam Student');
  await Promise.all([t.waitForURL(/\/cards\//), t.click('form[data-api$="/students"] button[type=submit]')]);
  const scard = await card(t);

  // the lesson
  await t.goto('/teach/lessons');
  await t.fill('#nl-t', 'The planets');
  await Promise.all([t.waitForURL(/\/teach\/lessons\/[^?]+$/), t.click('form[data-api="/api/lessons"] button[type=submit]')]);
  const addStep = async (kind, fill) => {
    await t.selectOption('#ns-k', kind); await fill();
    await t.click('form[data-api$="/steps"] button[type=submit]');
  };
  await addStep('text', async () => { await t.fill('#ns-t', 'Warm-up'); await t.fill('#ns-b', 'Name all the planets you know.'); });
  await expect(t.locator('.stepcard')).toHaveCount(1);
  await addStep('game', async () => { await t.selectOption('#ns-g', { index: 1 }); });
  await expect(t.locator('.stepcard')).toHaveCount(2);
  await addStep('build', async () => { await t.fill('#ns-b', 'a quiz about the planets'); });
  await expect(t.locator('.stepcard')).toHaveCount(3);
  // assigning keeps you on the editor: the class gets its own line (and can't be picked twice)
  await t.click('form[data-api$="/assign"] button[type=submit]');
  await expect(t.locator('#assign .assignedlist')).toContainText('Space Class');
  await expect(t.locator('#toasts .toast')).toContainText('Assigned to Space Class');   // the message survives the reload
  await t.goto(classUrl);
  await expect(t.locator('#lessons')).toContainText('The planets');
  // a unit (New unit is a drop-down, like New folder in the library)
  await t.click('#lessons summary:has-text("New unit")');
  await t.fill('#nu', 'Space'); await t.click('form[data-api$="/units"] button[type=submit]');
  await expect(t.locator('.unit-head')).toContainText('Space');

  // the student
  const sctx = await browser.newContext(); const s = await sctx.newPage();
  await login(s, scard.user, scard.pass);
  await s.goto('/classes'); await s.click('.classcard');
  await s.click('a.cl-main');
  await expect(s.locator('h1')).toHaveText('The planets');
  await expect(s.locator('.stepcard')).toHaveCount(3);
  await expect(s.locator('.stepcard').nth(0)).toContainText('Name all the planets you know.');
  await expect(s.locator('a[href^="/play/"]')).toHaveCount(1);
  await Promise.all([s.waitForURL(/\/studio\//), s.click('button:has-text("Start building")')]);
  await expect(s.locator('#st-input')).toHaveValue('a quiz about the planets');
  expect(s.url()).not.toContain('ask=');
  await tctx.close(); await sctx.close();
});
