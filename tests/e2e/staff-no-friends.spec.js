// Staff never have friends or friends' chat (docs/decisions.md "Staff have no friends; school chat is off by default";
// the teacher audit's bug 0: a trial teacher typed a child's friend code and the child saw "Friend requests 1").
// In a real browser: a teacher with their own sign-up (the kind of account /trial makes: an ordinary account that is its
// school's admin), a teacher with a school account, and the platform admin each try to reach a child and cannot; the
// child never sees a request; staff pages have no Friends or Chat doors and no friend code, on a 360 px phone, light and
// dark, and right to left; the Oomba team inbox still works; and a new school's chat is off until its admin turns it on.
// (/trial itself needs billing, which is off in these runs: tests/unit/teacher-plan.test.js signs a teacher up there
// against the fake Stripe and checks the same refusal.)
import { test, expect } from '@playwright/test';
import { uniq, login, signup, adminPage, schoolWithAdmin } from './helpers.js';
import { findTouching } from './touching.js';

test.describe.configure({ timeout: 180_000 });
const DEMO = 'demo-pass-123';
const STAFF_TITLE = "Staff accounts don't have friends";

/** A new signed-in page for the same person at another size, theme or language. */
async function sameUser(browser, page, { width = 360, height = 780, scheme = 'light', lang = 'en' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, storageState: await page.context().storageState() });
  await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
  return ctx.newPage();
}
const post = (page, path, data = {}) => page.request.post(path, { data });

test('a teacher cannot send a friend request to a child, by the page or the API; the child sees nothing', async ({ browser }) => {
  // A child with their own account, and their friend code.
  const kid = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const child = await signup(kid, uniq('Kid'));
  await kid.goto('/friends');
  const code = (await kid.locator('#mycode').textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  // A teacher who signed up on their own, then became their school's admin (what /trial makes).
  const teacher = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  const t = await signup(teacher, uniq('Tch'), 'a-long-password-12');
  // Before they are staff, this is an ordinary account with a code of its own.
  await teacher.goto('/friends');
  const oldCode = (await teacher.locator('#mycode').textContent()).trim();
  expect(oldCode).toMatch(/^[A-Z0-9]{6}$/);
  const admin = await adminPage(browser);
  const school = await schoolWithAdmin(admin, t.username);

  // Now staff: the Friends page has no code, no "add a friend" box and no lists; it says why and offers the team inbox.
  await teacher.goto('/friends');
  await expect(teacher.locator('main')).toContainText(STAFF_TITLE);
  await expect(teacher.locator('#mycode, #copycode, #addform, #code, [data-act]')).toHaveCount(0);
  const inboxLink = teacher.locator('main a.btn', { hasText: 'Oomba team' });
  await expect(inboxLink).toBeVisible();
  expect((await inboxLink.boundingBox()).height).toBeGreaterThanOrEqual(44);
  // Me: no Friends tile, no Chat tile, no chat switch; one tile for messages from Oomba.
  await teacher.goto('/me');
  await expect(teacher.locator('a[href="/friends"]')).toHaveCount(0);
  await expect(teacher.locator('#chat-toggle')).toHaveCount(0);
  await expect(teacher.locator('main a[href="/chat"]')).toContainText('Oomba team');
  await expect(teacher.locator('main')).not.toContainText(oldCode);
  // No Friends door anywhere in the header or tab bar, on any staff page.
  for (const p of ['/teach', '/school', '/play', '/learn']) {
    await teacher.goto(p);
    await expect(teacher.locator('a[href="/friends"], a[href^="/chat/"]:not([href$="/OombaAcademy"])'), p).toHaveCount(0);
  }

  // The API the Friends page would call: refused, whoever's code it is.
  const ask = await post(teacher, '/api/friends/add', { code });
  expect(ask.status()).toBe(403);
  expect((await ask.json()).code).toBe('staff');
  expect((await teacher.request.get('/api/friends')).status()).toBe(403);
  for (const act of ['accept', 'decline', 'cancel', 'remove']) expect((await post(teacher, `/api/friends/someone/${act}`)).status(), act).toBe(403);
  // Chat: no thread page with the child, nothing sent, the inbox lists only the team.
  await teacher.goto(`/chat/${child.username}`);
  await expect(teacher).toHaveURL(/\/chat$/);
  await expect(teacher.locator('h1')).toHaveText('Oomba team');
  await expect(teacher.locator(`[data-thread="${child.username}"]`)).toHaveCount(0);
  const send = await post(teacher, `/api/chat/${child.username}`, { kind: 'quick', body: 'hi' });
  expect(send.status()).toBe(400);
  expect((await send.json()).code).toBe('staff');

  // The child: no request, no badge, and the teacher's old code finds nobody (the same words as a wrong code).
  await kid.goto('/friends');
  await expect(kid.locator('#inc-h')).toHaveCount(0);
  await expect(kid.locator('main')).not.toContainText(t.username);
  await kid.fill('#code', oldCode);
  await kid.click('#addform button[type=submit]');
  await expect(kid.locator('#code-err')).toHaveText("We couldn't find that code. Check each letter and try again.");
  await kid.fill('#code', 'ZZZZZ9');
  await kid.click('#addform button[type=submit]');
  await expect(kid.locator('#code-err')).toHaveText("We couldn't find that code. Check each letter and try again.");
  await kid.goto('/friends');
  await expect(kid.locator('#out-h')).toHaveCount(0);
  const kidSend = await post(kid, `/api/chat/${t.username}`, { kind: 'quick', body: 'hi' });
  expect(kidSend.status()).toBe(400);

  // The staff pages on a phone, light and dark, and right to left: nothing touches, nothing scrolls sideways.
  const problems = [];
  for (const [width, height, scheme, lang] of [[360, 780, 'light', 'en'], [360, 780, 'dark', 'en'], [360, 780, 'light', 'he'], [1280, 860, 'dark', 'ar']]) {
    const page = await sameUser(browser, teacher, { width, height, scheme, lang });
    for (const p of ['/friends', '/chat', '/me']) {
      await page.goto(p); await page.evaluate(() => document.fonts.ready);
      if (p !== '/me') for (const x of await findTouching(page)) problems.push(`${p} @${width}/${scheme}/${lang}: ${x.a} ⟷ ${x.b} (${x.dir} ${x.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${width}/${lang}: scrolls sideways by ${wide}px`);
      await expect(page.locator('a[href="/friends"]'), `${p} ${lang}`).toHaveCount(0);
    }
    if (lang !== 'en') { await page.goto('/friends'); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.locator('main')).not.toContainText(STAFF_TITLE); }
    await page.context().close();
  }
  expect([...new Set(problems)]).toEqual([]);

  // The school this teacher runs: chat is off until they turn it on, and the Settings tab says so.
  await teacher.setViewportSize({ width: 360, height: 780 });
  await teacher.goto(`/school/${school.slug}?tab=settings`);
  const chat = teacher.locator('#set-chat');
  await expect(chat).toHaveValue('off');
  await expect(teacher.locator('#set-chat-hint')).toContainText("The default. School accounts can't chat with anyone.");
  await expect(teacher.locator('#chat-notice')).toHaveCount(0);
  expect(await teacher.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await chat.selectOption('classmates');
  await expect(teacher.locator('#set-chat-hint')).toContainText('teachers and staff are never in the chat');
  await chat.selectOption('off');
  await expect(teacher.locator('#set-chat-hint')).toContainText('The default.');
  await kid.context().close(); await teacher.context().close(); await admin.context().close();
});

test('the seeded demo teacher and the platform admin cannot reach the demo student; a student keeps Friends', async ({ browser }) => {
  const student = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(student, 'DemoStudent', DEMO);
  await student.goto('/friends');
  const code = (await student.locator('#mycode').textContent()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const teacher = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await login(teacher, 'DemoTeacher', DEMO);
  const admin = await adminPage(browser);
  for (const [who, page] of [['DemoTeacher', teacher], ['admin', admin]]) {
    const ask = await post(page, '/api/friends/add', { code });
    expect(ask.status(), who).toBe(403);
    expect((await ask.json()).code, who).toBe('staff');
    await page.goto('/friends');
    await expect(page.locator('main'), who).toContainText(STAFF_TITLE);
    await expect(page.locator('#mycode, #addform'), who).toHaveCount(0);
    await page.goto(`/chat/DemoStudent`);
    await expect(page, who).toHaveURL(/\/chat$/);
    await page.goto('/me');
    await expect(page.locator('a[href="/friends"]'), who).toHaveCount(0);
    await expect(page.locator('main a[href="/chat"]'), who).toContainText('Oomba team');
    // The Oomba team thread still opens for staff.
    await page.goto('/chat/OombaAcademy');
    await expect(page.locator('.threadhead'), who).toContainText('Oomba team');
    // A student's profile shows no way to become friends.
    await page.goto('/u/DemoStudent');
    await expect(page.locator('main a[href="/friends"]'), who).toHaveCount(0);
  }
  await student.goto('/friends');
  await expect(student.locator('#inc-h')).toHaveCount(0);
  await expect(student.locator('#mycode')).toHaveText(code);
  const send = await post(student, '/api/chat/DemoTeacher', { kind: 'quick', body: 'hi' });
  expect(send.status()).toBe(400);
  expect((await send.json()).code).toBe('missing');   // to a child, a staff account reads as not there
  await student.context().close(); await teacher.context().close(); await admin.context().close();
});

test('an account invited as staff loses its friends the moment it accepts; two children stay friends throughout', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage(), b = await (await browser.newContext()).newPage(), c = await (await browser.newContext()).newPage();
  const ua = await signup(a, uniq('Kid')), ub = await signup(b, uniq('Kid')), uc = await signup(c, uniq('Soon'), 'a-long-password-12');
  const codeOf = async p => { await p.goto('/friends'); return (await p.locator('#mycode').textContent()).trim(); };
  const codeA = await codeOf(a), codeC = await codeOf(c);
  // b and c both ask a; a accepts both.
  for (const p of [b, c]) expect((await post(p, '/api/friends/add', { code: codeA })).ok()).toBe(true);
  await a.goto('/friends');
  await expect(a.locator('#inc-h')).toContainText('2');
  for (const left of [1, 0]) { await a.goto('/friends'); await a.locator('[data-act="accept"]').first().click(); await expect(a.locator('[data-act="accept"]')).toHaveCount(left); }
  await a.goto('/friends');
  await expect(a.locator('.friendcard')).toHaveCount(2);
  await expect(a.locator('main')).toContainText(uc.username);

  // The platform admin makes a school with its own admin, who invites c as a teacher; c accepts on My classes.
  const admin = await adminPage(browser);
  const head = await (await browser.newContext()).newPage();
  const uh = await signup(head, uniq('Head'), 'a-long-password-12');
  const school = await schoolWithAdmin(admin, uh.username);
  const inv = await post(head, `/api/schools/${school.id}/staff`, { account: 'existing', username: uc.username, rosterName: 'Mx Soon', role: 'teacher' });
  expect(inv.ok(), await inv.text()).toBe(true);
  await a.goto('/friends');
  await expect(a.locator('.friendcard')).toHaveCount(2);   // an invite alone changes nothing
  await c.goto('/classes');
  await c.locator(`form[data-api="/api/staff-invites/${school.id}/accept"] button`).click();
  await expect.poll(async () => (await c.request.get('/api/friends')).status()).toBe(403);

  await a.goto('/friends');
  await expect(a.locator('.friendcard')).toHaveCount(1);
  await expect(a.locator('main')).not.toContainText(uc.username);
  await expect(a.locator('main')).toContainText(ub.username);
  // c's old code now finds nobody.
  const again = await post(b, '/api/friends/add', { code: codeC });
  expect(again.status()).toBe(400);
  expect((await again.json()).error).toBe("We couldn't find that code. Check each letter and try again.");
  await c.goto('/friends');
  await expect(c.locator('main')).toContainText(STAFF_TITLE);
  for (const p of [a, b, c, head, admin]) await p.context().close();
});
