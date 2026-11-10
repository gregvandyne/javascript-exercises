// Teacher quick wins (docs/decisions.md "Teacher quick wins", 10 Nov 2026), in a real browser:
//   a. "Turn a lesson into a game" (/teach/lessons/<id>#new-game) lands on the open, visible, focused form (it was
//      display:none until a dropdown changed), also from the Add form's own link, on a phone and a desktop;
//   e. a class live game: a signed-out student who typed the code and was sent to sign in comes back with the code
//      filled in, one press from "Join as me" (the code never rides in an address);
//   p. the host's Start with nobody in the room asks first;
//   r. "Make your first class" opens the New class form with the cursor in it;
//   i. /forgot (email off on the test server: the contact route) fits a phone, light and dark, and in Hebrew.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { login, ownIp, adminPage, uniq } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
test.describe.configure({ mode: 'serial', timeout: 180_000 });

const noSideScroll = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${page.url()} scrolls sideways`).toBeLessThanOrEqual(0);
async function signedIn(browser, who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage(); await login(page, who.username, who.password); return page;
}

test('a. "Turn a lesson into a game" lands on the open, visible, focused form', async ({ browser }) => {
  for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 860 }]) {
    const t = await signedIn(browser, TEACHER, { viewport });
    // A lesson of the teacher's own, with nothing in it: the Add form starts on "Read or do", where the form was hidden.
    const made = await t.request.post('/api/lessons', { data: { title: `Quick win ${uniq('L')}`, schoolId: await schoolOf(t) }, headers: { Origin: new URL(t.url()).origin } });
    expect(made.status(), await made.text()).toBe(200);
    const id = ((await made.json()).redirect || '').match(/\/teach\/lessons\/([^/?#]+)/)[1];
    await t.goto(`/teach/lessons/${id}#new-game`);
    const form = t.locator('#new-game');
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('open', '');
    await expect(t.locator('#ng-i')).toBeVisible();
    await expect(t.locator('#ng-i')).toBeFocused();
    await expect(t.locator('#ng-i')).toBeInViewport();
    expect(await t.locator('#ns-k').inputValue(), 'the step type was not changed to show it').toBe('text');
    await noSideScroll(t);
    const box = await t.locator('#new-game button[type=submit]').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Without the link the form still waits for "Play a game" (nothing else changed).
    await t.goto(`/teach/lessons/${id}`);
    await expect(t.locator('#new-game')).toBeHidden();
    await t.selectOption('#ns-k', 'game');
    await expect(t.locator('#new-game')).toBeVisible();
    // The Add form's own "Make a new game" link opens it and puts the cursor in the idea box.
    await t.locator('a.f-glink').click();
    await expect(t.locator('#new-game')).toHaveAttribute('open', '');
    await expect(t.locator('#ng-i')).toBeFocused();
    // The Classroom home's first step links here when the teacher has a lesson of their own.
    await t.goto('/teach/loop');
    const link = t.locator('a[href*="#new-game"]').first();
    if (await link.count()) { await link.click(); await expect(t.locator('#ng-i')).toBeFocused(); await expect(t.locator('#new-game')).toBeVisible(); }
    await t.context().close();
  }
});
/** The demo teacher's school id (from the lesson library's New lesson form). */
async function schoolOf(t) {
  await t.goto('/teach/lessons');
  const v = await t.locator('input[name="schoolId"], select[name="schoolId"] option').first().getAttribute('value');
  expect(v).toBeTruthy();
  return v;
}

test('e. a class live game keeps the typed code through sign-in; p. Start with nobody in the room asks first', async ({ browser }) => {
  const host = await signedIn(browser, TEACHER);
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  const origin = new URL(host.url()).origin;
  const r = await host.request.post('/api/live/sessions', { data: { audience: 'class', classId, replace: true, pick: 'mode:battle', items: [{ q: 'What is 2 + 2?', choices: ['4', '5'], answer: 0, secs: 20 }] }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await host.goto((await r.json()).redirect);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');

  // p. Nobody has joined: Start asks, and "Cancel" starts nothing.
  await expect(host.locator('#lv-controls [data-lv-act="start"]')).toBeVisible();
  let asked = '';
  host.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await host.locator('#lv-controls [data-lv-act="start"]').click();
  await expect.poll(() => asked).toBe('Nobody has joined yet. Start anyway?');
  await expect(host.locator('body')).toHaveAttribute('data-phase', /^(lobby)?$/);
  await expect(host.locator('#lv-controls [data-lv-act="start"]')).toBeVisible();

  // e. A signed-out student on a phone types the code, is told to sign in, signs in, and is back with the code.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const s = await ctx.newPage(); await ownIp(s);
  await s.goto('/join');
  await s.fill('#jc', code);
  await s.click('#lv-join button[type=submit]');
  await expect(s.locator('#lv-err')).toContainText('Sign in first');
  const signIn = s.locator('#lv-err a');
  await expect(signIn).toHaveAttribute('href', '/login?next=%2Fjoin');     // the code is not in the address
  await signIn.click();
  await s.waitForURL(/\/login\?next=%2Fjoin/);
  expect(s.url()).not.toContain(code);
  await s.fill('#username', STUDENT.username); await s.fill('#password', STUDENT.password);
  await Promise.all([s.waitForURL(u => u.pathname === '/join'), s.click('button[type=submit]')]);
  await expect(s.locator('#jc')).toHaveValue(code);
  await expect(s.locator('#lv-who-step')).toBeVisible();                    // straight on to "Join as me"
  await expect(s.locator('#lv-as-me')).toBeVisible();
  expect(s.url()).not.toContain(code);
  await noSideScroll(s);
  await Promise.all([s.waitForURL(/\/live\/play\//), s.locator('#lv-as-me').click()]);
  await expect(host.locator('#lv-roster')).toContainText('DemoStudent');
  // The kept code is used once: a later visit to /join starts empty.
  await s.goto('/join');
  await expect(s.locator('#jc')).toHaveValue('');
  // With someone in the room, Start does not ask.
  let again = false; const onAsk = d => { again = true; d.accept(); };
  host.on('dialog', onAsk);
  await host.locator('#lv-controls [data-lv-act="start"]').click();
  await expect(host.locator('#lv-controls [data-lv-act="start"]')).toBeHidden();
  expect(again).toBe(false);
  host.off('dialog', onAsk);
  host.on('dialog', d => d.accept());
  await host.locator('#lv-controls [data-lv-act="end"]').click();
  await ctx.close(); await host.context().close();
});

test('r. "Make your first class" opens the New class form with the cursor in the name box (a school admin with no class yet)', async ({ browser }) => {
  const admin = await adminPage(browser);
  await admin.goto('/admin/schools');
  await admin.fill('#sn', `Quick School ${uniq('Q')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.selectOption('#st-r', 'admin');
  await admin.fill('#st-n', 'Ms Solo');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const username = (await admin.locator('.logincard dd b').nth(0).textContent()).trim();
  const password = (await admin.locator('.logincard dd b').nth(1).textContent()).trim();
  await admin.context().close();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const t = await ctx.newPage();
  // j. a head the platform admin appointed signs in to "Set up your school", also while they are the school's only
  // staff member (Classroom first is only for a teacher who made their own school at /trial: unit test j). The
  // Classroom home is one tap away.
  await ownIp(t); await t.goto('/login');
  await t.fill('#username', username); await t.fill('#password', password);
  await Promise.all([t.waitForURL(u => !u.pathname.startsWith('/login')), t.click('button[type=submit]')]);
  expect(new URL(t.url()).pathname).toMatch(/^\/school\/quick-school-/);
  expect(await t.locator('.tabbar .tab').evaluateAll(l => l.map(a => a.getAttribute('href')).slice(0, 2))).toEqual(['/school', '/teach']);
  await Promise.all([t.waitForURL(u => u.pathname === '/teach'), t.locator('.tabbar .tab[href="/teach"]').click()]);
  await expect(t.locator('#new-class')).not.toHaveAttribute('open', '');
  const make = t.locator('a[href="/teach?new=class"]').first();
  await expect(make).toBeVisible();
  await make.click();
  await expect(t.locator('#new-class')).toHaveAttribute('open', '');
  await expect(t.locator('#nc-n')).toBeVisible();
  await expect(t.locator('#nc-n')).toBeFocused();
  await expect(t.locator('#nc-n')).toBeInViewport();
  await noSideScroll(t);
  // The setup checklist is still one tap away, on the School tab.
  await t.goto('/school');
  await expect(t).toHaveURL(/\/school\/[^/]+$/);
  await ctx.close();
});

test('i. /forgot fits a phone (360 and 390, light and dark, Hebrew): the contact route while email is off; kids keep "ask your teacher"', async ({ browser }) => {
  for (const [width, scheme, lang] of [[360, 'light', ''], [360, 'dark', ''], [390, 'light', ''], [390, 'dark', 'he'], [1280, 'light', '']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme });
    const p = await ctx.newPage(); await ownIp(p);
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: new URL((await p.goto('/login')).url()).origin }]);
    const r = await p.goto('/forgot');
    expect(r.status()).toBe(200);
    if (lang) await expect(p.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(p.locator('.pwreset h1')).toBeVisible();
    await expect(p.locator('form[data-api="/api/auth/forgot"]')).toHaveCount(0);   // email is off on the test server
    await expect(p.locator('.pwreset a[href^="mailto:"]')).toBeVisible();
    await noSideScroll(p);
    expect(await findTouching(p), `${width} ${scheme} ${lang}`).toEqual([]);
    const back = await p.locator('.pwreset a[href="/login"]').boundingBox();
    expect(back.height, 'a 44 px tap target').toBeGreaterThanOrEqual(44);
    // A link nobody signed is refused, on a page that offers a new one.
    const bad = await p.goto('/reset?t=not-a-real-link');
    expect(bad.status()).toBe(400);
    await expect(p.locator('#reset-bad')).toBeVisible();
    expect((await p.locator('.pwreset a[href="/forgot"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    await noSideScroll(p);
    expect(await findTouching(p), `reset ${width} ${scheme} ${lang}`).toEqual([]);
    // The sign-in page does not promise an email while none can be sent.
    await p.goto('/login');
    await expect(p.locator('#forgot-staff')).toHaveCount(0);
    await expect(p.locator('#forgot')).toBeVisible();
    await ctx.close();
  }
});
