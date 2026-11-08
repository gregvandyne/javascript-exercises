// CS Quest end to end (docs/cs-quest.md "Teacher pages"): a teacher adds the Core 10 path from the program page, opens
// a plan page, prints it, and assigns unit 1 with a cadence; a student of the class opens the first lesson and sees its
// steps. Then every teacher page at 390 px wide: nothing scrolls sideways (tables scroll inside their own box).
import { test, expect } from '@playwright/test';
import { uniq, login, adminPage } from './helpers.js';

async function card(page) { return { user: (await page.locator('.logincard dd b').nth(0).textContent()).trim(), pass: (await page.locator('.logincard dd b').nth(1).textContent()).trim() }; }
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('teacher adds Core 10, opens a plan page, prints, assigns a unit; the student sees the steps; the pages fit 390 px', async ({ browser }) => {
  test.setTimeout(180_000);
  const admin = await adminPage(browser);
  await admin.goto('/admin/schools'); await admin.fill('#sn', `CS Quest ${uniq('S')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.click('a[href$="?tab=people"]'); await admin.fill('#st-n', 'Teacher Tess'); await admin.selectOption('#st-r', 'teacher');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const tcard = await card(admin);

  const tctx = await browser.newContext(); const t = await tctx.newPage();
  await login(t, tcard.user, tcard.pass);
  await t.goto('/teach'); await t.fill('#nc-n', 'Robot Class');
  await Promise.all([t.waitForURL(/\/class\//), t.click('form[data-api="/api/classes"] button[type=submit]')]);
  await t.fill('#as-n', 'Sam Student');
  await Promise.all([t.waitForURL(/\/cards\//), t.click('form[data-api$="/students"] button[type=submit]')]);
  const scard = await card(t);

  // the program page: Core 10 (no Builder) first, one click adds its lessons
  await t.goto('/teach'); await t.click('a[href="/teach/cs-quest"]');
  await expect(t.locator('h1')).toContainText('CS Quest');
  // The Add buttons are data-api forms that app.js (a module script) sends as JSON: wait for the page's scripts, or a
  // click that lands first submits the plain form and only reloads the page.
  await t.waitForLoadState('load');
  await expect(t.locator('.csq-before')).toContainText('Before you start');
  await expect(t.locator('.csq-paths article').first()).toContainText('Core 10 (no Builder)');
  await t.locator('form[data-api="/api/lessons/from-template/path/core10-no-builder"] button').click();
  await expect(t.locator('#l-csq-1b-1\\.2')).toContainText('In your library');
  await expect(t.locator('#l-csq-1b-1\\.1')).toContainText('Not in your library');

  // the plan page, its print view
  await t.click('#l-csq-1b-1\\.2 a:has-text("Open plan")');
  await expect(t.locator('h1')).toBeVisible();
  await expect(t.locator('.csq-meta')).toContainText('CS Quest · CSTA 1B/2');
  for (const b of ['Show questions on the projector', 'Print', 'Printables', 'Assign to class', 'Assign unit...', 'Reset to the CS Quest version']) await expect(t.getByText(b, { exact: false }).first()).toBeVisible();
  await expect(t.locator('.csq-cut').first()).toContainText('Short period (40 min)');
  const planUrl = t.url();
  const print = await tctx.newPage(); await print.goto(`${planUrl}?print=1`);
  await expect(print.locator('.printdoc')).toBeVisible();
  await expect(print.locator('header.topbar, nav.topnav, .site-header')).toHaveCount(0);
  await print.emulateMedia({ media: 'print' }); await expect(print.locator('.printbar')).toBeHidden(); await print.close();

  // assign unit 1 with a cadence: the first lesson opens today. Daily, so that holds on any day of the week ("weekdays"
  // skips weekends: started on a Saturday or Sunday, the first lesson opens on Monday; cadenceDates in the unit tests).
  await t.click('#assign-unit summary');
  await t.selectOption('#au-w', 'unit:1'); await t.selectOption('#au-cad', 'daily');
  await t.click('#assign-unit button[type=submit]');
  await expect(t.locator('#toasts .toast')).toContainText('Robot Class');

  // the student sees the first lesson and its five steps
  const sctx = await browser.newContext(); const s = await sctx.newPage();
  await login(s, scard.user, scard.pass);
  await s.goto('/classes'); await s.click('.classcard');
  await s.locator('a.cl-main').first().click();
  await expect(s.locator('.stepcard')).toHaveCount(5);
  await expect(s.locator('body')).not.toContainText('CS Quest');
  await expect(s.locator('body')).not.toContainText('1B-AP');

  // 390 px: nothing scrolls sideways
  await t.setViewportSize({ width: 390, height: 844 });
  for (const p of ['/teach/cs-quest', '/teach/cs-quest/coverage', '/teach/cs-quest/csq-1b-1.2', '/teach/cs-quest/csq-2-3.1', '/teach/cs-quest/csq-1b-1.2?print=1', '/teach/cs-quest/csq-1b-1.2?projector=warmup', '/teach/cs-quest/csq-1b-1.2?sheet=planning-sheet', '/teachers/cs-quest', '/learn/computer-science']) {
    await t.goto(p);
    // on failure, name the innermost elements whose hiding stops the sideways scroll
    const culprit = await t.evaluate(() => { const W = () => document.documentElement.scrollWidth - document.documentElement.clientWidth; const out = []; if (W() <= 1) return out; for (const e of document.querySelectorAll('body *')) { const d = e.style.display; e.style.display = 'none'; if (W() <= 1) out.push(`${e.tagName}.${e.className}`); e.style.display = d; } return out.slice(-3); });
    expect(await sideways(t), `${p} scrolls sideways at 390 px: ${culprit.join(' | ')}`).toBeLessThanOrEqual(1);
  }
  await tctx.close(); await sctx.close();
});
