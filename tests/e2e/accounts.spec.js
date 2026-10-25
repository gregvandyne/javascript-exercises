// Accounts end to end: changing a password on a phone (other devices are signed out), a school student is sent to
// their teacher instead, "Not you? Sign out" on a shared classroom device, and the sign-in help.
import { test, expect } from '@playwright/test';
import { signup, login, ownIp, uniq } from './helpers.js';

const PHONE = { viewport: { width: 390, height: 844 } };
const DEMO = 'demo-pass-123';

test('change password on a phone: stay signed in here, other devices are signed out', async ({ browser }) => {
  const phone = await (await browser.newContext(PHONE)).newPage();
  const { username, password } = await signup(phone);
  const laptop = await (await browser.newContext()).newPage();
  await login(laptop, username, password);

  await phone.goto('/me#password');
  const form = phone.locator('form[data-api="/api/me/password"]');
  await expect(form).toBeVisible();
  // a wrong current password is shown on its field
  await form.locator('#pw-current').fill('not-my-password');
  await form.locator('#pw-new').fill('green-panda-77'); await form.locator('#pw-confirm').fill('green-panda-77');
  await form.locator('button[type=submit]').click();
  await expect(phone.locator('#pw-current-err')).toHaveText("That isn't your current password.");
  // mismatched new passwords
  await form.locator('#pw-current').fill(password);
  await form.locator('#pw-confirm').fill('green-panda-78');
  await form.locator('button[type=submit]').click();
  await expect(phone.locator('#pw-confirm-err')).toHaveText("The two new passwords don't match.");
  // right
  await form.locator('#pw-confirm').fill('green-panda-77');
  await form.locator('button[type=submit]').click();
  await expect(phone.locator('.toast')).toContainText('Password changed');
  await expect(form.locator('#pw-current')).toHaveValue('', { timeout: 2000 });
  // no sideways scrolling on the phone
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // still signed in here; the laptop is signed out and goes to sign-in when it opens a page
  expect((await (await phone.request.get('/api/me')).json()).user.username).toBe(username);
  await laptop.goto('/me');
  await expect(laptop).toHaveURL(/\/login\?next=%2Fme&signedout=1$/);
  await expect(laptop.locator('.notice')).toContainText('You were signed out');
  // the new password works, the old one doesn't
  await laptop.fill('#username', username); await laptop.fill('#password', password);
  await laptop.click('button[type=submit]');
  await expect(laptop.locator('#password-err')).toContainText("don't match");
  await laptop.fill('#password', 'green-panda-77');
  await Promise.all([laptop.waitForURL(/\/me$/), laptop.click('button[type=submit]')]);

  // Sign out everywhere: this device too
  laptop.once('dialog', d => d.accept());
  await Promise.all([laptop.waitForURL(/\/login$/), laptop.click('form[data-api="/api/auth/logout-everywhere"] button')]);
  await expect(laptop.locator('.toast')).toContainText('signed out on every device');
  await phone.reload();
  await expect(phone).toHaveURL(/\/login\?next=/);
});

test('a school student sees that their teacher looks after the password', async ({ browser }) => {
  const kid = await (await browser.newContext(PHONE)).newPage();
  await login(kid, 'DemoStudent', DEMO);
  await kid.goto('/me');
  await expect(kid.locator('#password')).toContainText('Your teacher looks after your password — ask them if you forget it.');
  await expect(kid.locator('form[data-api="/api/me/password"]')).toHaveCount(0);
});

test('"Not you? Sign out" on a shared classroom device signs out in one tap', async ({ browser }) => {
  const kid = await (await browser.newContext(PHONE)).newPage();
  await login(kid, 'DemoStudent', DEMO);
  await kid.goto('/classes');
  const line = kid.locator('.pagehead .notyou');
  await expect(line).toContainText('Signed in as DemoStudent.');
  // it is on the class page too
  await kid.click('a.classcard');
  await expect(kid.locator('.pagehead .notyou')).toBeVisible();
  await Promise.all([kid.waitForURL(/\/login$/), kid.locator('.pagehead .notyou button').click()]);
  expect((await (await kid.request.get('/api/me')).json()).user).toBeNull();
});

/** Sign out everywhere from another device (a sign-in ended elsewhere, like a timeout for the device that was left open). */
async function signOutElsewhere(browser, username, password) {
  const other = await (await browser.newContext()).newPage();
  await login(other, username, password);
  await other.goto('/me');
  other.once('dialog', d => d.accept());
  await Promise.all([other.waitForURL(/\/login$/), other.click('form[data-api="/api/auth/logout-everywhere"] button')]);
  await other.context().close();
}

test('a shared classroom device: after a sign-in ends, the next child lands on their own home', async ({ browser }) => {
  const b = await (await browser.newContext()).newPage();
  const next = await signup(b); await b.context().close();
  const kid = await (await browser.newContext(PHONE)).newPage();
  await login(kid, 'DemoStudent', DEMO);
  await kid.goto('/classes'); await kid.click('a.classcard');
  const classPage = new URL(kid.url()).pathname;
  await signOutElsewhere(browser, 'DemoStudent', DEMO);
  // the next child taps something on the page left open
  await kid.reload();
  await expect(kid).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(classPage)}&signedout=1$`));
  await expect(kid.locator('.notice')).toHaveText('You were signed out. Sign in again to carry on.');
  await kid.fill('#username', next.username); await kid.fill('#password', next.password);
  await Promise.all([kid.waitForURL(u => !u.pathname.startsWith('/login')), kid.click('form[data-api="/api/auth/login"] button[type=submit]')]);
  expect(new URL(kid.url()).pathname).toBe('/');   // their own home, not the last child's class page
  expect((await (await kid.request.get('/api/me')).json()).user.username).toBe(next.username);
});

test('the Studio after the sign-in ended: the message goes back in the box, and every action says signed out', async ({ browser }) => {
  const page = await (await browser.newContext(PHONE)).newPage();
  const { username, password } = await signup(page, uniq('Kid'), 'secret-pass-9');
  await page.goto('/build');
  await Promise.all([page.waitForURL(/\/studio\//), page.click('.tplcard[data-template="catch"]')]);
  await expect(page.locator('#st-frame')).toHaveAttribute('src', /\/frame\//);
  const studio = new URL(page.url()).pathname;
  await signOutElsewhere(browser, username, password);
  await page.fill('#st-input', 'add a shark'); await page.click('#st-send');
  const err = page.locator('.msg.err').last();
  await expect(err).toContainText('You were signed out. Please sign in again.');
  await expect(page.locator('#st-input')).toHaveValue('add a shark');
  // a second try hears no hint from the server any more, and still says signed out (never "make a free account")
  await page.click('#st-send');
  await expect(page.locator('.msg.err').last()).toContainText('You were signed out.');
  expect((await page.locator('.msg.err').allTextContents()).join(' ')).not.toContain('Make a free account');
  // other Studio actions go to the sign-in page, keeping the message
  await page.fill('#st-title', 'New name'); await page.press('#st-title', 'Enter');
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(studio)}&signedout=1$`));
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => u.pathname === studio), page.click('form[data-api="/api/auth/login"] button[type=submit]')]);
  await expect(page.locator('#st-input')).toHaveValue('add a shark');
});

test('sign-in help and the grown-ups page say what is true', async ({ page }) => {
  await ownIp(page);
  await page.goto('/login');
  await expect(page.locator('#forgot')).toContainText('Ask your teacher for a new login card.');
  await expect(page.locator('#forgot')).toContainText('We never ask for an email');
  await expect(page.locator('#forgot')).not.toContainText('Me page');   // the Me page form needs the password they forgot
  await page.goto('/parents');
  await expect(page.locator('main')).toContainText('Anthropic');
  await expect(page.locator('main')).toContainText('real name as the school typed it');
  await expect(page.locator('main')).not.toContainText('no real name');
});
