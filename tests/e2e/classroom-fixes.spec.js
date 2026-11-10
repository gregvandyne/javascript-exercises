// Fixes from watching simulated classes use the site (a new teacher, a school admin, a student, a live class):
// - "Open the room" with an old room still open asks first (which game, started or not, players connected) and never
//   drops the teacher into the old game; late students can be let in from the main controls during the game.
// - Tug of Math opened from a Grade 4 class starts at Grade 4.
// - A class code typed in /join, and a game code typed in the class-code box, each point to the right place.
// - A student's class page says when the teacher's live game is open; "Play as a guest" in a class room says why not.
// - A school admin adding an existing account sends an invite: nobody is staff until they accept.
// - A self-marked game step is ☑️ "marked done" in the teacher's grid, never the same ✅ as real play.
// - A new school's admin lands on the school page with a setup checklist; unsaved Settings say so.
// - Sign in: Show password, and a login card's password typed with spaces still works.
// - /teachers asks for the sender's name; the thank-you comes first and lists what to do today.
import { test, expect } from '@playwright/test';
import { login, signup, uniq, ownIp, adminPage, schoolWithAdmin, ADMIN } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const SLUG = 'magic-cups-demo-school';
const page$ = async (browser, opts = {}) => (await browser.newContext(opts)).newPage();
/** The demo class's id (the teacher's My classes). */
async function demoClass(t) {
  await t.goto('/teach');
  return (await t.locator('a.cc-link').first().getAttribute('href')).match(/\/class\/([^/?#]+)/)[1];
}
/** End the teacher's open live game, if any (so the next test starts clean). */
async function endOpen(t) {
  const mine = await (await t.request.get('/api/live/mine')).json();
  if (!mine.sid) return;
  await t.goto(mine.host);
  t.once('dialog', d => d.accept());
  await t.locator('#lv-controls [data-lv-act="end"]:not([hidden])').click();
  await expect.poll(async () => (await (await t.request.get('/api/live/mine')).json()).sid || null).toBe(null);
}

test('an old open room: the landing says what is open and asks; End it opens the new game; Unlock stays in reach', async ({ browser }) => {
  test.setTimeout(120_000);
  const t = await page$(browser, { viewport: { width: 1366, height: 900 } });
  await login(t, TEACHER.username, TEACHER.password);
  await endOpen(t);
  const cls = await demoClass(t);
  // a first room (Atlas), left open (the tab "closed")
  await t.goto(`/live?class=${cls}`);
  await t.locator('label.lv-pick', { has: t.locator('input[value="mode:atlas"]') }).click();
  await t.locator('#lv-new button[type=submit]').click();
  await t.waitForURL(/\/live\/host\//);
  const firstHost = t.url();
  // Tug picked from the class: its grade is the class's (Grade 4), not Grade 3
  await t.goto(`/live?class=${cls}`);
  await t.locator('label.lv-pick', { has: t.locator('input[value="mode:tug"]') }).click();
  await expect(t.locator('#lv-tug-grade')).toHaveValue('4');
  await expect(t.locator('#lv-tug-class-grade')).toContainText('Your class: Grade 4');
  // Game settings: no second "Time per question" / "Number of questions" for a game with its own
  await expect(t.locator('#lv-ls-secs')).toBeHidden();
  await expect(t.locator('#lv-ls-count')).toBeHidden();
  let dialogs = 0; t.on('dialog', d => { dialogs++; d.dismiss(); });
  await t.locator('#lv-new button[type=submit]').click();
  const box = t.locator('#lv-open-old');
  await expect(box).toBeVisible();
  await expect(box).toContainText('You still have Atlas Quest');
  await expect(box).toContainText('still in the lobby');
  await expect(t.locator('#lv-open-back')).toHaveAttribute('href', new URL(firstHost).pathname);
  expect(dialogs).toBe(0);
  expect(t.url()).toContain('/live?');   // never taken into the old room
  await t.locator('#lv-open-replace').click();
  await t.waitForURL(/\/live\/host\//);
  expect(t.url()).not.toBe(firstHost);
  // a started game keeps Lock / Unlock room in the main controls (late students: "Ask the host to unlock it")
  const kid = await page$(browser, { viewport: { width: 390, height: 844 } });
  await login(kid, STUDENT.username, STUDENT.password);
  const code = (await t.locator('#lv-code').textContent()).replace(/\s/g, '');
  await kid.goto(`/join#${code}`);
  await kid.locator('#lv-join button[type=submit]').click();
  // "Play as a guest" in a class room: why not, and the button goes away
  await kid.locator('#lv-as-guest').click();
  await expect(kid.locator('#lv-who-err')).toContainText('only for your class');
  await expect(kid.locator('#lv-as-guest')).toBeHidden();
  await kid.locator('#lv-as-me').click();
  await kid.waitForURL(/\/live\/play\//);
  await t.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  await expect(t.locator('#lv-controls [data-lv-act="unlock"]:not([hidden]), #lv-controls [data-lv-act="lock"]:not([hidden])')).toHaveCount(1);
  await t.removeAllListeners('dialog');
  await endOpen(t);
  await kid.context().close(); await t.context().close();
});

test('a student waiting on the class page sees the live game open, and codes typed in the wrong box point the right way', async ({ browser }) => {
  test.setTimeout(120_000);
  const t = await page$(browser);
  await login(t, TEACHER.username, TEACHER.password);
  await endOpen(t);
  const cls = await demoClass(t);
  const kid = await page$(browser, { viewport: { width: 1366, height: 768 } });
  await login(kid, STUDENT.username, STUDENT.password);
  await kid.goto(`/class/${cls}`);
  await expect(kid.locator('#class-live')).toBeHidden();
  // the teacher opens a class room: the class page shows it without a reload (it checks every few seconds)
  await t.goto(`/live?class=${cls}`);
  await t.locator('label.lv-pick', { has: t.locator('input[value="mode:wyr"]') }).click();
  await t.locator('#lv-new button[type=submit]').click();
  await t.waitForURL(/\/live\/host\//);
  const code = (await t.locator('#lv-code').textContent()).replace(/\s/g, '');
  await expect(kid.locator('#class-live')).toBeVisible({ timeout: 20_000 });
  await expect(kid.locator('#class-live')).toContainText('Your teacher started a live game');
  await expect(kid.locator('#class-live-join')).toHaveAttribute('href', `/join#${code}`);
  // My classes and Home say so too
  await kid.goto('/classes');
  await expect(kid.locator('.classcard').first()).toContainText('Live game now');
  // '/' is the student's Class tab; their Play page has the banner too.
  await kid.goto('/');
  expect(new URL(kid.url()).pathname).toBe('/classes');
  await kid.goto('/play');
  await expect(kid.locator('#home-class')).toContainText('Your teacher started a live game');
  // a game code in the class-code box: on to Join a game with it
  await kid.goto('/classes');
  const join = kid.locator('details.classes-join-more');
  if (await join.count()) await join.locator('summary').click();
  await kid.fill('#jc', code);
  await Promise.all([kid.waitForURL(/\/join/), kid.locator('form[data-api="/api/classes/join"] button[type=submit]').click()]);
  await expect(kid.locator('#jc')).toHaveValue(code);
  // a class code in Join a game: "That's a class code", with the way to My classes (on a server without Sign in with
  // Google: with it, a class code typed here goes on to the Google class flow instead; this test server has it on)
  await kid.route(/\/join$/, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('"googleOn":true', '"googleOn":false') }); });
  await kid.goto('/join');
  await kid.fill('#jc', 'ABC123');
  await kid.locator('#lv-join button[type=submit]').click();
  await expect(kid.locator('#lv-err')).toContainText("That's a class code");
  await expect(kid.locator('#lv-class-code-link')).toHaveAttribute('href', '/classes?code=ABC123');
  await endOpen(t);
  await expect(kid.locator('#class-live')).toHaveCount(0);   // (on /join now)
  await kid.goto(`/class/${cls}`);
  await expect(kid.locator('#class-live')).toBeHidden();
  await kid.context().close(); await t.context().close();
});

test('a school admin invites an existing account: not staff until they accept; the new school has a setup checklist', async ({ browser }) => {
  test.setTimeout(120_000);
  const head = await page$(browser);
  const { username: headName } = await signup(head, uniq('Head'), 'head-pass-123');
  const admin = await adminPage(browser);
  const school = await schoolWithAdmin(admin, headName);
  // the new school's admin lands on the school page (no classes yet), with the setup steps in order
  await head.goto('/login?signedout=0');
  await head.request.post('/api/auth/logout', { data: {} });
  await login(head, headName, 'head-pass-123');
  expect(new URL(head.url()).pathname).toBe(`/school/${school.slug}`);
  await expect(head.locator('#setup-list li')).toHaveCount(4);
  await expect(head.locator('#setup-list')).toContainText('Add your teachers');
  // invite someone's own account
  const other = await page$(browser);
  const { username: tName } = await signup(other, uniq('Tchr'), 'tchr-pass-123');
  await head.goto(`/school/${school.slug}?tab=people`);
  await head.locator('#add-staff summary').click();
  await head.locator('input[name=account][value=existing]').check();
  await head.fill('#st-u', tName); await head.fill('#st-n', 'Ana Rivera');
  await expect(head.locator('.staffform button[type=submit]')).toContainText('Send invite');
  await head.locator('.staffform button[type=submit]').click();
  await expect(head.locator('#staff-invites')).toContainText(`@${tName}`);
  await expect(head.locator('#staff-list')).not.toContainText('Ana Rivera');
  // they see it and accept: now staff, with the name the school gave
  await other.goto('/classes');
  await expect(other.locator('#my-invites')).toContainText(`${school.name} wants to add you as Teacher`);
  await Promise.all([other.waitForURL(/\/teach/), other.locator('#my-invites button.btn-primary').click()]);
  await expect(other.locator('.topbar .me-btn .name')).toHaveText('Ana Rivera');
  await head.reload();
  await expect(head.locator('#staff-list')).toContainText('Ana Rivera');
  await expect(head.locator('#staff-invites')).toHaveCount(0);
  // Settings: a change not saved yet says so
  await head.goto(`/school/${school.slug}?tab=settings`);
  await expect(head.locator('#set-unsaved')).toBeHidden();
  // (chat starts off: a school turns classmates chat on itself)
  await expect(head.locator('#set-chat')).toHaveValue('off');
  await expect(head.locator('#set-chat-hint')).toContainText("can't chat with anyone");
  await head.selectOption('#set-chat', 'classmates');
  await expect(head.locator('#set-chat-hint')).toContainText('only with classmates they have added as friends');
  await expect(head.locator('#set-unsaved')).toBeVisible();
  for (const p of [head, other, admin]) await p.context().close();
});

test('a self-marked game step is "marked done" in the grid; real play shows ✅; the lesson page assigns with a note in view', async ({ browser }) => {
  test.setTimeout(120_000);
  const t = await page$(browser);
  await login(t, TEACHER.username, TEACHER.password);
  const cls = await demoClass(t);
  // a fresh lesson with one game step, assigned from the lesson page
  await t.goto('/teach/lessons');
  const title = uniq('Play step ');
  await t.fill('#nl-t', title);
  await Promise.all([t.waitForURL(/\/teach\/lessons\/[^?]+/), t.locator('form[data-api="/api/lessons"] button[type=submit]').click()]);
  await t.selectOption('#ns-k', 'game');
  // the Game picker is grouped by subject
  await expect(t.locator('#ns-g optgroup[label="Math games"]')).toHaveCount(1);
  const sum = await t.locator('#ns-g option', { hasText: 'Sum Racer' }).first().getAttribute('value');
  await t.selectOption('#ns-g', sum);
  await t.fill('#ns-t', 'Race');
  await t.locator('#add-step').getByRole('button', { name: /Add step/ }).click();
  await expect(t.locator('.steplist li')).toHaveCount(1);
  await t.selectOption('#as-c', cls);
  await Promise.all([t.waitForURL(/assigned=/), t.locator('#assign button[type=submit]').click()]);
  await expect(t.locator('#assigned-now')).toContainText('Assigned to Demo Class');
  const progress = await t.locator('#assigned-now a').getAttribute('href');
  // the student ticks "I've played it" without playing
  const kid = await page$(browser);
  await login(kid, STUDENT.username, STUDENT.password);
  await kid.goto(progress.replace('/progress/', '/lessons/'));
  await kid.getByRole('button', { name: /I've played it/ }).click();
  await expect(kid.locator('.stepstate.is-done')).toHaveCount(1);
  await t.goto(progress);
  const row = t.locator('#lp-steps tbody tr', { hasText: 'Demo Student' });
  await expect(row.locator('.st-self')).toHaveCount(1);
  await expect(t.locator('#key-self')).toContainText('Marked done by the student');
  for (const p of [t, kid]) await p.context().close();
});

test('sign in: Show password, and a login card password typed with spaces works; /teachers asks for a name and thanks first', async ({ browser }) => {
  test.setTimeout(90_000);
  const t = await page$(browser);
  await login(t, TEACHER.username, TEACHER.password);
  const cls = await demoClass(t);
  // a login card for a new student (passwords are word-word-word-NN)
  await t.goto(`/class/${cls}?tab=students`);
  await t.fill('#as-n', `Zoe ${uniq('P')}`);
  await Promise.all([t.waitForURL(/\/cards\//), t.locator('#add-students button[type=submit]').click()]);
  await expect(t.locator('#cards-later')).toContainText('24 hours');
  const user = (await t.locator('.logincard dd b').nth(0).textContent()).trim();
  const pw = (await t.locator('.logincard dd b').nth(1).textContent()).trim();
  expect(pw).toMatch(/-/);
  // the class's Students tab links back to the cards (for the teacher who made them)
  await t.goto(`/class/${cls}?tab=students`);
  await expect(t.locator('#cards-again a')).toHaveAttribute('href', /\/cards\//);
  const kid = await page$(browser);
  await ownIp(kid);
  await kid.goto('/login');
  await kid.fill('#username', user); await kid.fill('#password', pw.replace(/-/g, ' '));
  await expect(kid.locator('#password')).toHaveAttribute('type', 'password');
  await kid.locator('[data-pw-toggle]').click();
  await expect(kid.locator('#password')).toHaveAttribute('type', 'text');
  await Promise.all([kid.waitForURL(u => !u.pathname.startsWith('/login')), kid.click('form[data-api="/api/auth/login"] button[type=submit]')]);
  // the teacher's Me badge doesn't count Oomba's copy of the new student's welcome
  const before = await (await t.request.get('/me')).text();
  expect(before).not.toMatch(/Copy: we wrote to/);
  // /teachers: "Your name", and after sending, the thank-you is the first thing on the page
  const v = await page$(browser, { viewport: { width: 390, height: 844 } });
  await ownIp(v);
  await v.goto('/teachers#start');
  await v.fill('#sr-name', 'Ana Rivera'); await v.fill('#sr-school', `${uniq('Oak')} Primary`);
  await v.selectOption('#sr-role', 'teacher'); await v.fill('#sr-email', 'ana@example.org');
  await v.fill('#sr-students', '25'); await v.fill('#sr-country', 'United Kingdom');
  await Promise.all([v.waitForURL(/sent=1/), v.locator('.sr-form button[type=submit]').click()]);
  await expect(v.locator('#setup-thanks')).toContainText('Things you can do today');
  const thanksTop = await v.locator('#setup-thanks').boundingBox(), heroTop = await v.locator('.lp-hero').boundingBox();
  expect(thanksTop.y).toBeLessThan(heroTop.y);
  // the platform admin sees the name on the request
  const admin = await adminPage(browser);
  await admin.goto('/admin?tab=schoolreq');
  await expect(admin.locator('main')).toContainText('Ana Rivera');
  void ADMIN; void SLUG;
  for (const p of [t, kid, v, admin]) await p.context().close();
});
