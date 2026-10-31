// Oomba Live part 4, end to end: co-hosts (docs/decisions.md "Oomba Live, part 4"; protocol: docs/live-protocol.md
// "Part 4"). The demo teacher (Tia's role) hosts Question Battle for the Demo Class on the projector and on her phone's
// Teacher view; a second teacher of the demo school, not on the class (Tom), is invited from the projector's gated
// Co-hosts dialog, sees the invite on /live, accepts on his phone, and gets the controls without student details; he
// pauses, the student's phone pauses, Tia's Teacher view says who did it; adult names never show on the student's
// phone or the projector; Tia removes him. Then the handoff: Tia leaves, Tom becomes host and ends the game.
// The test server runs with LIVE_HANDOFF_SECS=3 (playwright.config.js). COHOST_SHOTS=<dir> (or LIVE_SHOTS) saves the screenshots.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { login, signup, uniq, ADMIN } from './helpers.js';

const SHOTS = process.env.COHOST_SHOTS || process.env.LIVE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' }, STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const DEMO_SLUG = 'magic-cups-demo-school';
const ITEMS = [
  { q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 30 },
  { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 30 },
];
const PHONE = { width: 360, height: 780 };

async function signedIn(browser, who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage(); await login(page, who.username, who.password); return page;
}
/** A second teacher of the demo school (not on the Demo Class): a new own account the platform admin adds as staff. */
async function secondTeacher(browser, rosterName = 'Tom Teacher') {
  const ctx = await browser.newContext({ viewport: PHONE }); const page = await ctx.newPage();
  const who = await signup(page, uniq('Tom'), 'tom-pass-12345');
  const a = await (await browser.newContext()).newPage(); await login(a, ADMIN.username, ADMIN.password);
  const html = await (await a.request.get(`/school/${DEMO_SLUG}?tab=people`)).text();
  const id = html.match(/\/api\/schools\/([A-Za-z0-9]+)\/staff/)[1];
  const add = await a.request.post(`/api/schools/${id}/staff`, { data: { account: 'existing', username: who.username, rosterName, role: 'teacher' } });
  expect(add.ok(), await add.text()).toBe(true);
  await a.context().close();
  return { page, ...who, rosterName };
}
/** Tia's class room for the Demo Class (Question Battle). -> code */
async function classRoom(host) {
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  const origin = new URL(host.url()).origin;
  const r = await host.request.post('/api/live/sessions', { data: { pick: 'mode:battle', items: ITEMS, audience: 'class', classId, replace: true }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await host.goto((await r.json()).redirect);
  return { code: (await host.locator('#lv-code').textContent()).replace(/\s/g, ''), sid: host.url().split('/live/host/')[1] };
}
async function student(browser, code) {
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  await login(page, STUDENT.username, STUDENT.password);
  await page.goto(`/join#${code}`);
  await expect(page.locator('#jc')).toHaveValue(code);
  await page.click('#lv-join button[type=submit]');
  await page.locator('#lv-as-me').click();
  await page.waitForURL(/\/live\/play\//);
  return page;
}
/** Invite from the projector's Co-hosts dialog (past its gate). */
async function inviteFromProjector(host, name) {
  await host.locator('#lv-controls [data-lv-act="cohosts"]').click();
  await expect(host.locator('#lv-cohosts-gate')).toBeVisible();
  await expect(host.locator('#lv-cohosts-body')).toBeHidden();
  await host.click('#lv-cohosts-show');
  await expect(host.locator('#lv-cohosts-who option', { hasText: name })).toHaveCount(1);
  await host.selectOption('#lv-cohosts-who', { label: (await host.locator('#lv-cohosts-who option', { hasText: name }).textContent()) });
  // the picked person's access level shows under the picker (never cut off with the name)
  await expect(host.locator('#lv-cohosts-tier')).not.toHaveText('');
  await host.click('#lv-cohosts-pick [type=submit]');
  await expect(host.locator('#lv-cohosts-list')).toContainText(name);
}
async function accept(page, sid) {
  await page.goto('/live');
  await expect(page.locator(`[data-lv-cohost-invite="${sid}"]`)).toBeVisible();
  await page.locator(`[data-lv-cohost-invite="${sid}"] a`).click();
  await page.waitForURL(new RegExp(`/live/cohost/${sid}`));
}

test.describe.configure({ mode: 'serial' });

test('invite -> accept -> the co-host pauses -> the host sees who did it -> the host removes the co-host; adult names never reach the student or the projector', async ({ browser }) => {
  test.setTimeout(240_000);
  const tom = await secondTeacher(browser);
  const host = await signedIn(browser, TEACHER);
  const { code, sid } = await classRoom(host);
  const tiaDash = await signedIn(browser, TEACHER, { viewport: PHONE });
  await tiaDash.goto(`/live/host/${sid}/dash`);
  const mia = await student(browser, code);
  await expect(host.locator('#lv-roster li')).toHaveCount(1);
  // the gated dialog, then the invite
  await inviteFromProjector(host, 'Tom Teacher');
  await expect(host.locator('#lv-cohosts-list')).toContainText('Controls only');
  await shot(host, 'cohost-lobby-panel');
  await host.locator('#lv-cohosts form[method="dialog"] button').click();
  await expect(host.locator('#lv-cohosts')).toBeHidden();
  // Tom's phone: the invite on /live, the invite page, Accept
  await accept(tom.page, sid);
  await expect(tom.page.locator('.lv-cohost-invite-text')).toContainText('Demo Teacher');
  await shot(tom.page, 'cohost-invite');
  await Promise.all([tom.page.waitForURL(new RegExp(`/live/host/${sid}/dash`)), tom.page.click('#lv-cohost-accept [type=submit]')]);
  await expect(tom.page.locator('#lv-dash-role')).toContainText('Co-host');
  await expect(tom.page.locator('#lv-dash-role')).toContainText('Demo Teacher');
  await expect(tom.page.locator('#lv-dash-help-toggle')).toHaveCount(0);
  await expect(tom.page.locator('#lv-dash-limited')).toBeVisible();
  const ok = tom.page.locator('#lv-dash-notice-ok'); if (await ok.isVisible()) await ok.click();
  await expect(tiaDash.locator('#lv-dash-activity')).toContainText('Tom Teacher is co-hosting');
  await shot(tom.page, 'cohost-controls');
  // Tia starts; Tom pauses; Mia's phone pauses; Tia's Teacher view says who
  await host.locator('#lv-controls [data-lv-act="start"]').click();
  await expect(tom.page.locator('.lv-dash-acts [data-lv-act="pause"]')).toBeVisible({ timeout: 40_000 });
  await tom.page.locator('.lv-dash-acts [data-lv-act="pause"]').click();
  await expect(mia.locator('#lv-phase')).toContainText('Paused');
  await expect(tiaDash.locator('#lv-dash-activity')).toHaveText('Tom Teacher paused the game');
  await shot(tiaDash, 'cohost-activity');
  // never on the student's phone, never on the projector (its dialog closed)
  expect(await mia.locator('body').innerText()).not.toContain('Tom Teacher');
  expect(await host.locator('body').innerText()).not.toContain('Tom Teacher');
  // Tom's phone, 360 px: the activity line and the chip; then Arabic, dark (it takes over his Teacher view)
  await expect(tom.page.locator('#lv-dash-activity')).toContainText('paused the game');
  expect(await tom.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await shot(tom.page, 'cohost-phone-360');
  const ar = await (await browser.newContext({ viewport: PHONE, locale: 'ar', colorScheme: 'dark' })).newPage();
  await login(ar, tom.username, tom.password);
  await ar.goto(`/live/host/${sid}/dash`);
  await expect(ar.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(ar.locator('#lv-dash-role')).toContainText('مضيف مشارك');
  await expect(ar.locator('#lv-dash-activity')).toContainText('Tom Teacher');
  expect(await ar.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await shot(ar, 'cohost-ar-dark-360');
  // Tia removes Tom from her Teacher view (asks first); his page says so; her line says who
  tiaDash.on('dialog', d => d.accept());
  // the chip opens the Co-hosts tab (on a phone the tab sits past the edge of the row)
  await tiaDash.locator('#lv-dash-role').click();
  await expect(tiaDash.locator('#lv-tab-cohosts')).toBeVisible();
  await expect(tiaDash.locator('[data-lv-tab="cohosts"]')).toHaveAttribute('aria-selected', 'true');
  await tiaDash.locator('#lv-dch-list [data-cohost-act="remove"]').click();
  await expect(ar.locator('#lv-cohost-off')).toBeVisible();
  // the removed co-host's page: the notice only (no chip, no "student details" note)
  await expect(ar.locator('#lv-dash-role')).toBeHidden();
  await expect(ar.locator('#lv-dash-limited')).toBeHidden();
  await shot(ar, 'cohost-removed-ar');
  await expect(tiaDash.locator('#lv-dash-activity')).toContainText('removed Tom Teacher as a co-host');
  await expect(tiaDash.locator('#lv-dch-list')).not.toContainText('Tom Teacher');
  // the history keeps naming him after he's gone, also after a reload
  await expect(tiaDash.locator('#lv-dch-recent')).toContainText('Tom Teacher paused the game');
  await shot(tiaDash, 'cohost-after-remove');
  await tiaDash.reload();
  await tiaDash.locator('#lv-dash-role').click();
  await expect(tiaDash.locator('#lv-dch-recent')).toContainText('Tom Teacher paused the game');
  await expect(tiaDash.locator('#lv-dch-recent')).toContainText('Demo Teacher removed Tom Teacher as a co-host');
  // the game goes on: Tia resumes
  await tiaDash.locator('.lv-dash-acts [data-lv-act="resume"]').click();
  await expect(mia.locator('#lv-phase')).not.toContainText('Paused');
  for (const p of [host, tiaDash, mia, tom.page, ar]) await p.context().close();
});

test('handoff: the host leaves, the co-host becomes host after the grace, ends the game, and sees the results without student details', async ({ browser }) => {
  test.setTimeout(180_000);
  const tom = await secondTeacher(browser, 'Tom Two');
  const host = await signedIn(browser, TEACHER);
  const { code, sid } = await classRoom(host);
  const mia = await student(browser, code);
  await inviteFromProjector(host, 'Tom Two');
  await host.locator('#lv-cohosts form[method="dialog"] button').click();
  await accept(tom.page, sid);
  await Promise.all([tom.page.waitForURL(new RegExp(`/live/host/${sid}/dash`)), tom.page.click('#lv-cohost-accept [type=submit]')]);
  await expect(tom.page.locator('#lv-dash-role')).toContainText('Co-host');
  await host.locator('#lv-controls [data-lv-act="start"]').click();
  await expect(tom.page.locator('.lv-dash-acts [data-lv-act="pause"]')).toBeVisible({ timeout: 40_000 });
  // Tia closes her projector: away, then (LIVE_HANDOFF_SECS) Tom is host
  await host.context().close();
  await expect(tom.page.locator('#lv-dash-role')).toHaveText('Host', { timeout: 30_000 });
  await expect(tom.page.locator('[data-lv-tab="cohosts"]')).toBeVisible();
  tom.page.on('dialog', d => d.accept());
  await tom.page.locator('.lv-dash-acts [data-lv-act="end"]').click();
  await tom.page.waitForURL(new RegExp(`/live/results/${sid}`), { timeout: 20_000 });
  await expect(tom.page.locator('#lv-limited-note')).toBeVisible();
  await expect(tom.page.locator('#lv-details')).toHaveCount(0);
  await expect(mia.locator('#lv-end')).toBeVisible({ timeout: 20_000 });
  for (const p of [mia, tom.page]) await p.context().close();
});
