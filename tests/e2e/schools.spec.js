// Schools end to end: the platform admin makes a school and a teacher; the teacher makes a class, adds students and
// prints login cards; a student with their own account joins with the code and the teacher approves.
import { test, expect } from '@playwright/test';
import { uniq, login, signup, adminPage, schoolWithAdmin } from './helpers.js';

test('school -> teacher -> class -> login cards -> own-account student joins with the code', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await adminPage(browser);
  const schoolName = `School ${uniq('S')}`;
  await admin.goto('/admin/schools');
  await admin.fill('#sn', schoolName);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await expect(admin.locator('h1')).toContainText(schoolName);
  // a teacher with a school account: the login card shows their username and password once
  // a new school opens on People: the first staff member defaults to School admin, so pick Teacher here
  await expect(admin.locator('.notice')).toContainText('appoint the school admin');
  await expect(admin.locator('#st-r')).toHaveValue('admin');
  await admin.selectOption('#st-r', 'teacher');
  await admin.fill('#st-n', 'Maria Rivera');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const tUser = (await admin.locator('.logincard dd b').nth(0).textContent()).trim();
  const tPass = (await admin.locator('.logincard dd b').nth(1).textContent()).trim();
  expect(tPass).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/);

  const tctx = await browser.newContext(); const teacher = await tctx.newPage();
  await login(teacher, tUser, tPass);
  await teacher.goto('/teach');
  await teacher.fill('#nc-n', '4B Math'); await teacher.fill('#nc-g', '4');
  await Promise.all([teacher.waitForURL(/\/class\//), teacher.click('form[data-api="/api/classes"] button[type=submit]')]);
  const classUrl = teacher.url();
  const code = (await teacher.locator('.jc-code').textContent()).trim();
  await teacher.fill('#as-n', 'Ana Silva\nBen Okafor');
  await Promise.all([teacher.waitForURL(/\/cards\//), teacher.click('form[data-api$="/students"] button[type=submit]')]);
  await expect(teacher.locator('.logincard')).toHaveCount(2);
  await expect(teacher.locator('.logincard').first()).toContainText('Ana Silva');
  await expect(teacher.locator('.logincard').first()).toContainText(schoolName);
  // the same name again is caught instead of making a second account
  await teacher.click('a:has-text("Back to 4B Math")');
  await teacher.fill('#as-n', 'Ana Silva');
  await teacher.click('form[data-api$="/students"]:has(#as-n) button[type=submit]');
  await expect(teacher.locator('#as-n-err')).toContainText('Ana Silva (@');

  // a student who already plays on Oomba Academy joins with the code
  const sctx = await browser.newContext(); const kid = await sctx.newPage();
  await signup(kid, uniq('Kid'));
  await kid.goto('/classes');
  await kid.fill('#jc', code.toLowerCase());
  await Promise.all([kid.waitForURL(/\/classes\?sent=1/), kid.click('form[data-api="/api/classes/join"] button[type=submit]')]);
  await expect(kid.locator('body')).toContainText('4B Math');

  await teacher.goto(classUrl);
  await expect(teacher.locator('.reqcard')).toHaveCount(1);
  await teacher.locator('.reqcard input[name=rosterName]').fill('Cara Lee');
  await teacher.locator('.reqcard form[data-api$="/approve"] button[type=submit]').click();
  await expect(teacher.locator('.reqcard')).toHaveCount(0);
  await expect(teacher.locator('main')).toContainText('Cara Lee');

  await kid.goto('/classes');
  await kid.click('.classcard');
  await expect(kid.locator('h1')).toHaveText('4B Math');
  await expect(kid.locator('main')).toContainText('Maria Rivera');      // their teacher's name
  await expect(kid.locator('main')).not.toContainText('Ana Silva');     // never classmates' real names
  await expect(kid.locator('.tabbar a[href="/classes"]')).toHaveCount(1);
  // The teacher's menu (navigation weeks 3–4): Classes · Games · Me; no School tab for a plain teacher, no Friends or
  // Build tab, and "Make a game" on My classes instead.
  await teacher.setViewportSize({ width: 360, height: 760 });
  await teacher.goto('/teach');
  expect(await teacher.locator('.tabbar .tab').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/teach', '/', '/me']);
  await expect(teacher.locator('.tabbar .tab[href="/teach"]')).toHaveAttribute('aria-current', 'page');
  await expect(teacher.locator('main a[href="/build"]')).toContainText('Make a game');
  expect((await teacher.goto('/school')).status()).toBe(404);
  await tctx.close(); await sctx.close();
});

test('a school admin\'s School tab opens their school (People); the School tab is current there; Make a game on Me', async ({ browser }) => {
  const admin = await adminPage(browser);
  const hctx = await browser.newContext({ viewport: { width: 360, height: 760 } }); const head = await hctx.newPage();
  const { username } = await signup(head, uniq('Head'), 'head-pass-123');
  const school = await schoolWithAdmin(admin, username);
  await head.goto('/');
  expect(await head.locator('.tabbar .tab').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/teach', '/', '/school', '/me']);
  // No Home tab: the game home is the Games tab, current on the home page.
  await expect(head.locator('.tabbar .tab[href="/"]')).toHaveAttribute('aria-current', 'page');
  await expect(head.locator('.tabbar .tab[href="/"] .tab-t')).toHaveText('Games');
  await Promise.all([head.waitForURL(new RegExp(`/school/${school.slug}\\?tab=people$`)), head.locator('.tabbar .tab[href="/school"]').click()]);
  await expect(head.locator('h1')).toContainText(school.name);
  await expect(head.locator('.tabbar .tab[href="/school"]')).toHaveAttribute('aria-current', 'page');
  await head.goto('/me');
  await expect(head.locator('.pagehead a[href="/build"]')).toContainText('Make a game');
  await Promise.all([head.waitForURL(/\/build$/), head.locator('.pagehead a[href="/build"]').click()]);
  // Desktop: Classes · Games · School, and the avatar button is Me.
  await head.setViewportSize({ width: 1280, height: 800 });
  await head.goto('/teach');
  expect(await head.locator('.topnav .navlink').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/teach', '/', '/school']);
  await expect(head.locator('.topbar .me-btn')).toHaveAttribute('href', '/me');
  await hctx.close(); await admin.context().close();
});
