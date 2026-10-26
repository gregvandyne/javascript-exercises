// Sign in with Google end to end, against the fake Google from playwright.config.js. A school admin adds the school's
// Google domain; a teacher pastes school emails; Ana signs in with Google on the sign-in page and lands in her class;
// with "join with Google" on, Bo types the class code on /join and joins with his school Google account; a personal
// Google account is turned away kindly. Last, /join and the sign-in page on a 360px phone, dark and right to left.
import { test, expect } from '@playwright/test';
import { uniq, login, adminPage } from './helpers.js';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function cards(page) {
  await expect(page.locator('.logincard').first()).toBeVisible();
  const c = page.locator('.logincard').first();
  return { username: (await c.locator('dd b').nth(0).textContent()).trim(), password: (await c.locator('dd b').nth(1).textContent()).trim() };
}
/** On the fake Google page: choose an account and continue. */
async function chooseGoogle(page, email, button = 'Continue') {
  await expect(page.locator('h1')).toHaveText('Fake Google: choose an account');
  await page.fill('input[name=email]', email);
  await page.click(`button:has-text("${button}")`);
}

let admin, teacher, cls, code, school;

test.beforeAll(async ({ browser }) => {
  admin = await adminPage(browser);
  await admin.goto('/admin/schools');
  await admin.fill('#sn', `School ${uniq('S')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  school = new URL(admin.url()).pathname;
  await admin.selectOption('#st-r', 'teacher');
  await admin.fill('#st-n', 'Maria Rivera');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const tCard = await cards(admin);
  teacher = await (await browser.newContext()).newPage();
  await login(teacher, tCard.username, tCard.password);
  await teacher.goto('/teach');
  const drop = teacher.locator('details.libdrop');
  if (!(await drop.evaluate(d => d.open))) await drop.locator('summary').click();
  await teacher.fill('#nc-n', '4B');
  await Promise.all([teacher.waitForURL(/\/class\/[^/?]+\?tab=students/), teacher.click('form[data-api="/api/classes"] button[type=submit]')]);
  cls = new URL(teacher.url()).pathname;
  code = (await teacher.locator('.jc-code').textContent()).trim();
});
test.afterAll(async () => { for (const p of [admin, teacher]) if (p) await p.context().close(); });

test('the school admin adds the Google domain; the teacher invites by school email; Ana signs in with Google', async ({ browser }) => {
  // Before a domain: the teacher is told who can turn it on.
  await expect(teacher.locator('#google-invites')).toContainText('school admin');
  await admin.goto(`${school}?tab=settings`);
  await admin.fill('#gd', 'gmail.com');
  await admin.click('#google button[type=submit]');
  await expect(admin.locator('#gd-err')).toContainText('personal email service');
  await admin.fill('#gd', 'dwes.test');
  await Promise.all([admin.waitForLoadState('load'), admin.click('#google button[type=submit]')]);
  await expect(admin.locator('#gd')).toHaveValue('dwes.test');
  await expect(admin.locator('#google .gclient')).toHaveText('test-client.apps.googleusercontent.com');

  await teacher.goto(`${cls}?tab=students`);
  await teacher.fill('#gi-e', 'ana.silva@dwes.test, Ana Silva\nbo@gmail.com');
  await teacher.click('#google-invites button[type=submit]');
  await expect(teacher.locator('#gi-e-err')).toContainText('bo@gmail.com');
  await teacher.fill('#gi-e', 'ana.silva@dwes.test, Ana Silva');
  await Promise.all([teacher.waitForLoadState('load'), teacher.click('#google-invites button[type=submit]')]);
  await expect(teacher.locator('.ginvites')).toContainText('ana.silva@dwes.test');
  await expect(teacher.locator('.ginvites')).toContainText('Waiting');

  const ana = await (await browser.newContext()).newPage();
  await ana.goto('/login');
  await ana.click('.gbtn');
  await chooseGoogle(ana, 'ana.silva@dwes.test');
  await expect(ana).toHaveURL(new RegExp(`${cls}$`));
  await expect(ana.locator('main')).toContainText('4B');
  await ana.context().close();

  await teacher.reload();
  await expect(teacher.locator('table.roster')).toContainText('Ana Silva');
  await expect(teacher.locator('table.roster')).toContainText(/Google: \u2066?ana\.silva@dwes\.test/);
  await expect(teacher.locator('.ginvites')).toContainText('Joined as @');
});

test('with "join with Google" on, Bo joins from /join with the class code', async ({ browser }) => {
  await teacher.goto(`${cls}?tab=students`);
  await Promise.all([teacher.waitForLoadState('load'), teacher.click('.gjoin button[type=submit]')]);
  await expect(teacher.locator('.gjoin')).toContainText('can join with this code');

  const bo = await (await browser.newContext()).newPage();
  await bo.goto('/login');
  await bo.click('a[href="/join"]');
  await bo.fill('#jc', code.toLowerCase());
  await bo.click('button:has-text("Next")');
  await expect(bo.locator('.jc-chosen')).toContainText(code);
  await bo.click('.gbtn');
  await chooseGoogle(bo, 'bo.lee@dwes.test');
  await expect(bo).toHaveURL(new RegExp(`${cls}$`));
  await bo.context().close();
});

test('a personal Google account is turned away kindly, and Cancel just comes back', async ({ browser }) => {
  const p = await (await browser.newContext()).newPage();
  await p.goto('/login');
  await p.click('.gbtn');
  await chooseGoogle(p, 'someone@gmail.com');
  await expect(p).toHaveURL(/\/login\?gerr=unknown/);
  await expect(p.locator('[role=alert]')).toContainText("We don't know this Google account yet");
  await p.click('.gbtn');
  await chooseGoogle(p, 'someone@gmail.com', 'Cancel');
  await expect(p.locator('[role=alert]')).toContainText("Google didn't sign you in");
  await expect(p.locator('[role=alert] a[href="/google-setup#trust"]')).toBeVisible();
  await p.context().close();
});

for (const [label, opts] of [['light', {}], ['dark, right to left', { colorScheme: 'dark', lang: 'he' }]]) {
  test(`sign-in page and /join fit a 360px phone (${label})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, colorScheme: opts.colorScheme || 'light' });
    if (opts.lang) await ctx.addCookies([{ name: 'lang', value: opts.lang, url: test.info().project.use.baseURL }]);
    const p = await ctx.newPage();
    for (const url of ['/login', '/join', `/join?code=${code}`]) {
      await p.goto(url);
      await expect(p.locator('.gbtn, #jc').first()).toBeVisible();
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), url).toBe(true);
    }
    await ctx.close();
  });
}
