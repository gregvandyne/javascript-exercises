// Schools end to end: the platform admin makes a school and a teacher; the teacher makes a class, adds students and
// prints login cards; a student with their own account joins with the code and the teacher approves.
import { test, expect } from '@playwright/test';
import { uniq, login, signup, adminPage } from './helpers.js';

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
  await tctx.close(); await sctx.close();
});
