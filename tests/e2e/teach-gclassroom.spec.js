// Google Classroom sync in a real browser. This spec runs its own server on E2E_PORT + 3 with GOOGLE_CLASSROOM=1, the
// fake Google from playwright.config.js (E2E_PORT + 1) for the consent screen and tokens, and the fake Classroom API
// (tests/support/fake-classroom.js) in this process. DemoTeacher connects Classroom, links Demo Class to a course,
// imports its students (one signs in with Google and joins), posts a lesson, sends grades, then relinks to another
// Classroom class and posts there; DemoStudent can't open the page. Connect asks only for the read scopes: the page is
// checked read-only first, then "Allow Oomba Academy to post to Classroom" adds the write ones; a lesson is shared as a
// material, automatic grades are turned on, and an announcement is posted. Then the page on a 360 and
// 390 phone and at 1280, light and dark, and in Hebrew: nothing sideways, nothing touching, tap targets 44px.
// Screenshots go to GC_SHOTS (default /dev/shm/teach-gclassroom).
import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findTouching } from './touching.js';
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';
import { startFakeClassroom } from '../support/fake-classroom.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 3; // + 1 is the fake Google
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.GC_SHOTS || '/dev/shm/teach-gclassroom';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-gc-'));
let room, proc = null;
const env = () => {
  const e = { ...process.env, ...NO_STRIPE_ENV, PORT: String(PORT), BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0', NODE_ENV: 'development',
    SESSION_SECRET: 'gc-test-secret-0123456789abcdef0123456789', ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'admin-pass-123', DEMO_TEACHER_PASSWORD: 'demo-pass-123', ANTHROPIC_API_KEY: '',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fake-test-secret', GOOGLE_OIDC_BASE: `http://127.0.0.1:${E2E + 1}`,
    // Fake test values (not secrets): Classroom on, a test-only token key, the fake Classroom API.
    // The two-step flow (read first, then "Allow") is walked here; the one-consent default (full) is in the unit tests.
    GOOGLE_CLASSROOM: '1', GOOGLE_CLASSROOM_SCOPES: 'read', GOOGLE_TOKEN_KEY: 'b'.repeat(64), CLASSROOM_API_BASE: room.url, LANDING_AT_ROOT: '0' };
  for (const k of ['PUBLIC_URL', 'REDIRECT_HOSTS', 'RENDER_EXTERNAL_HOSTNAME', 'BRB_DB']) delete e[k];
  return e;
};

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  fs.mkdirSync(SHOTS, { recursive: true });
  room = await startFakeClassroom();
  room.addCourse({ id: '700000000001', name: 'Class 4B (Classroom)', section: 'Room 12', students: [
    { userId: '510000000000000000001', fullName: 'Rosa Diaz' }, { userId: '510000000000000000002', fullName: 'Tom Okafor' }, { userId: '510000000000000000003', fullName: 'Yuki Sato' }] });
  room.addCourse({ id: '700000000002', name: 'Science club', section: '' });
  execFileSync(process.execPath, ['scripts/seed.js'], { env: env(), stdio: 'ignore' });
  const out = fs.openSync(path.join(DATA, 'server.log'), 'a');
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...env(), BRB_SILENT: '' }, stdio: ['ignore', out, out] });
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)); }
  throw new Error('server did not start');
});
test.afterAll(async () => {
  if (proc) { const p = proc; proc = null; p.kill('SIGTERM'); await new Promise(r => p.once('exit', r)); }
  if (room) await room.close();
  fs.rmSync(DATA, { recursive: true, force: true });
});

async function signIn(page, username, password = 'demo-pass-123') {
  await page.goto(`${BASE}/login`);
  await page.fill('#username', username); await page.fill('#password', password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
}
const waitToast = page => page.waitForLoadState('load');
/** Phone and desktop checks for the current page. */
async function checkLayout(page, where) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(wide, `${where}: sideways scroll`).toBeLessThanOrEqual(0);
  const touching = await findTouching(page);
  expect(touching.map(t => `${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`), `${where}: touching`).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('.gc-page button, .gc-page a.btn, .gc-page select, .gc-page label.gc-mode, .gc-page label.gc-check, .gc-page summary, .gc-page input.input')]
    .filter(el => el.offsetParent).map(el => ({ t: el.textContent.trim().slice(0, 30), h: el.getBoundingClientRect().height })).filter(x => x.h < 44));
  expect(small, `${where}: tap targets under 44px`).toEqual([]);
}

let classUrl = '';
test('DemoTeacher connects Classroom, links the class, imports students, posts a lesson and sends grades', async ({ browser }) => {
  // The school admin adds the school's Google domain, so new students from Classroom can sign in.
  const adm = await (await browser.newContext()).newPage();
  await signIn(adm, 'admin', 'admin-pass-123');
  await adm.goto(`${BASE}/school/magic-cups-demo-school?tab=settings`);
  await adm.fill('#gd', 'dwes.test');
  await Promise.all([adm.waitForLoadState('load'), adm.click('#google button[type=submit]')]);
  await expect(adm.locator('#gd')).toHaveValue('dwes.test');
  await adm.context().close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await signIn(page, 'DemoTeacher');
  await page.goto(`${BASE}/teach?all=1`);
  await page.locator('a[href^="/class/"]', { hasText: 'Demo Class' }).first().click();
  await page.waitForURL(/\/class\/[^/?]+$/);
  classUrl = new URL(page.url()).pathname;
  // The Lessons tab's button opens the class's Google Classroom page.
  await Promise.all([page.waitForURL(/google-classroom$/), page.click(`a[href="${classUrl}/google-classroom"]`)]);
  await expect(page.locator('#gc-connect')).toContainText('Connect the Google account you teach with');
  await page.screenshot({ path: `${SHOTS}/1-not-connected-390.png`, fullPage: true });

  // Connect: the fake Google consent screen, then back here.
  await page.click('#gc-connect button[type=submit]');
  await expect(page.locator('h1')).toHaveText('Fake Google: choose an account');
  await page.fill('input[name=email]', 'demo.teacher@dwes.test');
  await Promise.all([page.waitForURL(/gc=connected/), page.click('button:has-text("Continue")')]);
  await expect(page.locator('#gc-connect')).toContainText('Google Classroom is connected.');
  await expect(page.locator('#gc-connect')).toContainText('demo.teacher@dwes.test');

  // Link the class to a course.
  await page.selectOption('#gc-course-pick', '700000000001');
  await Promise.all([page.waitForLoadState('load'), page.click('#gc-course button[type=submit]')]);
  await expect(page.locator('#gc-course')).toContainText('Linked to Class 4B (Classroom)');

  // Connected read-only (the two read scopes): no write controls, a note with "Allow Oomba Academy to post to Classroom".
  await expect(page.locator('#gc-lessons')).toContainText('allow Oomba Academy to post to Classroom');
  await expect(page.locator('#gc-lessons button:has-text("Post to Google Classroom")')).toHaveCount(0);
  await expect(page.locator('#gc-announce')).toContainText('To post announcements');
  await checkLayout(page, 'read-only 390');
  await page.screenshot({ path: `${SHOTS}/1b-read-only-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkLayout(page, 'read-only 1280');
  await page.screenshot({ path: `${SHOTS}/1b-read-only-1280.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  // Allow posting: Google's screen again (incremental authorization), then every write feature shows.
  await page.click('#gc-connect .gc-allow button[type=submit]');
  await expect(page.locator('h1')).toHaveText('Fake Google: choose an account');
  await page.fill('input[name=email]', 'demo.teacher@dwes.test');
  await Promise.all([page.waitForURL(/gc=allowed/), page.click('button:has-text("Continue")')]);
  await expect(page.locator('#gc-connect')).toContainText('Oomba Academy may now post to your Classroom');
  await expect(page.locator('#gc-auto')).toContainText('Send grades automatically');

  // Import its students: all three are new to Oomba, so they wait to sign in (no accounts yet).
  await Promise.all([page.waitForLoadState('load'), page.click('#gc-roster button[type=submit]')]);
  await expect(page.locator('#gc-roster')).toContainText("3 will join when they first sign in with Google on your school's domain");
  await expect(page.locator('#gc-waiting')).toContainText("3 students from Classroom haven't signed in yet");
  // Rosa signs in with Google on the school's domain: her school account is made and she lands in the class.
  const rosa = await (await browser.newContext()).newPage();
  await rosa.goto(`${BASE}/auth/google/start`);
  await expect(rosa.locator('h1')).toHaveText('Fake Google: choose an account');
  await rosa.fill('input[name=email]', 'rosa@dwes.test'); await rosa.fill('input[name=sub]', '510000000000000000001');
  await Promise.all([rosa.waitForURL(new RegExp(`${classUrl}$`)), rosa.click('button:has-text("Continue")')]);
  await rosa.context().close();
  // Her real name is only on the staff roster.
  await page.goto(`${BASE}${classUrl}?tab=students`);
  await expect(page.locator('#roster')).toContainText('Rosa Diaz');
  await page.goto(`${BASE}${classUrl}/google-classroom`);
  await expect(page.locator('#gc-waiting')).toContainText("2 students from Classroom haven't signed in yet");

  // Post the first lesson, then send draft grades.
  await page.goto(`${BASE}${classUrl}/google-classroom`);
  const first = page.locator('.gc-lesson').first();
  await Promise.all([page.waitForLoadState('load'), first.locator('button:has-text("Post to Google Classroom")').click()]);
  await expect(page.locator('.gc-lesson').first()).toContainText('Posted');
  expect(room.calls.some(c => c.method === 'POST' && /courseWork$/.test(c.path))).toBe(true);
  await Promise.all([page.waitForLoadState('load'), page.locator('.gc-lesson').first().locator('.gc-gradeform button[type=submit]').click()]);
  await expect(page.locator('.gc-lesson').first()).toContainText('Draft completion grades sent');
  await expect(page.locator('#gc-log')).toContainText('Sent grades');
  await expect(page.locator('#gc-log')).not.toContainText('Rosa');
  // Share it as a material too, turn automatic grades on, and post to the class stream.
  await Promise.all([page.waitForLoadState('load'), page.locator('.gc-lesson').first().locator('button:has-text("Share as material")').click()]);
  await expect(page.locator('.gc-lesson').first()).toContainText('Shared as material');
  await page.check('#gc-auto input[name=autoGrades]');
  await Promise.all([page.waitForLoadState('load'), page.click('#gc-auto button[type=submit]')]);
  await expect(page.locator('#gc-auto input[name=autoGrades]')).toBeChecked();
  await page.locator('#gc-announce summary', { hasText: 'Your own message' }).click();
  await page.fill('#gc-note-free', 'Rosa did great!');
  await page.locator('#gc-announce form:has(#gc-note-free) button[type=submit]').click();
  await expect(page.locator('#gc-note-free-err')).toContainText("“Rosa” in your message matches a student's name");
  await page.fill('#gc-note-free', 'Bring headphones tomorrow, please.');
  await page.locator('#gc-announce form:has(#gc-note-free) button[type=submit]').click();
  await expect(page.locator('#gc-log')).toContainText('Posted to the class stream');
  expect(room.calls.some(c => c.method === 'POST' && /announcements$/.test(c.path) && c.body.text === 'Bring headphones tomorrow, please.')).toBe(true);
  // Rosa leaves the Classroom class: the next import lists her for the teacher, and she stays in the class until removed.
  await page.click('#gc-roster button[type=submit]');
  await expect(page.locator('#gc-roster-at')).toContainText('1 already here');
  room.courses.get('700000000001').students = room.courses.get('700000000001').students.filter(s => s.userId !== '510000000000000000001');
  await page.click('#gc-roster button[type=submit]');
  await expect(page.locator('#gc-leavers')).toContainText('Rosa Diaz');
  await checkLayout(page, 'leavers 390');
  await page.screenshot({ path: `${SHOTS}/2b-full-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkLayout(page, 'leavers 1280');
  await page.screenshot({ path: `${SHOTS}/2b-full-1280.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  page.once('dialog', d => d.accept());
  await page.locator('#gc-leavers button', { hasText: 'Remove from class' }).click();
  await expect(page.locator('#gc-leavers')).toHaveCount(0);

  // Unlink and link another Classroom class: the lesson isn't "Posted" there, and can be posted to it.
  page.once('dialog', d => d.accept());
  await Promise.all([page.waitForLoadState('load'), page.click('#gc-course button[type=submit]')]);
  await page.selectOption('#gc-course-pick', '700000000002');
  await Promise.all([page.waitForLoadState('load'), page.click('#gc-course button[type=submit]')]);
  await expect(page.locator('#gc-course')).toContainText('Linked to Science club');
  await expect(page.locator('.gc-lesson').first()).not.toContainText('Posted');
  await expect(page.locator('.gc-lesson').first().locator('a[href*="classroom.google.com"]')).toHaveCount(0);
  await Promise.all([page.waitForLoadState('load'), page.locator('.gc-lesson').first().locator('button:has-text("Post to Google Classroom")').click()]);
  await expect(page.locator('.gc-lesson').first().locator('a[href*="classroom.google.com/c/700000000002/"]')).toHaveCount(1);
  await ctx.storageState({ path: path.join(DATA, 'teacher.json') });
  await ctx.close();

  // DemoStudent: no such page, no APIs.
  const kid = await (await browser.newContext()).newPage();
  await signIn(kid, 'DemoStudent');
  const r = await kid.goto(`${BASE}${classUrl}/google-classroom`);
  expect(r.status()).toBe(404);
  const api = await kid.request.post(`${BASE}/api/classes/${classUrl.split('/')[2]}/google-classroom/roster`, { data: {}, headers: { origin: BASE } });
  expect(api.status()).toBe(404);
  await kid.context().close();
});

for (const v of [{ w: 360, scheme: 'light' }, { w: 360, scheme: 'dark' }, { w: 390, scheme: 'light' }, { w: 390, scheme: 'dark', lang: 'he' }, { w: 1280, scheme: 'light' }, { w: 1280, scheme: 'dark' }]) {
  test(`the page at ${v.w}px, ${v.scheme}${v.lang ? `, ${v.lang}` : ''}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: v.w, height: 900 }, colorScheme: v.scheme, storageState: path.join(DATA, 'teacher.json') });
    if (v.lang) await ctx.addCookies([{ name: 'lang', value: v.lang, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${classUrl}/google-classroom`);
    if (v.lang === 'he') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('#gc-lessons')).toBeVisible();
    // The class stream's templates open, so their forms are checked too.
    for (const d of await page.locator('#gc-announce details').all()) await d.evaluate(el => { el.open = true; });
    await checkLayout(page, `${v.w}/${v.scheme}${v.lang || ''}`);
    await page.screenshot({ path: `${SHOTS}/2-connected-${v.w}-${v.scheme}${v.lang ? `-${v.lang}` : ''}.png`, fullPage: true });
    if (v.w === 390 && !v.lang) {
      // The Lessons tab with its button and the assign form's "Also post" box.
      await page.goto(`${BASE}${classUrl}`);
      const drop = page.locator('details.assigndrop');
      if (await drop.count()) { if (!(await drop.evaluate(d => d.open))) await drop.locator('summary').click(); await expect(page.locator('input[name=gcPost]')).not.toBeChecked(); }
      await page.screenshot({ path: `${SHOTS}/3-lessons-tab-${v.w}-${v.scheme}.png`, fullPage: true });
    }
    await ctx.close();
  });
}
