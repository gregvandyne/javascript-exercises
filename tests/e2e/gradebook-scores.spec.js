// Real scores and real names in the gradebook, end to end (docs/decisions.md "Real scores in the gradebook"): its own
// server on a small seeded school (tests/support/gradebook-seed.js). The teacher sees Work done apart from Score, late
// and "Done late", live game results, roster names with game names beside them, opens a student's page from a score,
// and prints it (first name only unless the box is ticked). A student and another teacher get 404. Every new screen is
// checked on phones (360, 390) and desktop (1366), light and dark, and in Hebrew (RTL): no sideways scroll, nothing
// touching, tap targets of 44px. Screenshots go to SHOTS_DIR (default /dev/shm/gradebook/shots) at 390 and 1366.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ownIp } from './helpers.js';
import { findTouching } from './touching.js';

const PORT = +(process.env.E2E_PORT || 4310) + 12;
const BASE = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS_DIR || '/dev/shm/gradebook/shots';
fs.mkdirSync(SHOTS, { recursive: true });
let DATA = null, app = null, seed = null;
const env = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', LIVE_CLASSROOM: '1' });
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: BASE });
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-gb-'));
  seed = JSON.parse(execFileSync(process.execPath, ['tests/support/gradebook-seed.js'], { cwd: ROOT, env: env() }).toString().trim().split('\n').pop());
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${BASE}/health`);
});
test.afterAll(async () => { await stop(app); if (DATA) fs.rmSync(DATA, { recursive: true, force: true }); });

async function signIn(browser, username, opts = {}) {
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 }, ...opts });
  const page = await ctx.newPage(); await ownIp(page);
  await page.goto('/login');
  await page.fill('#username', username); await page.fill('#password', seed.password);
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  return page;
}
/** Layout rules on the page as it is now: no sideways scroll, no touching boxes, tap targets at least 44px tall. */
async function layoutOk(page, at) {
  const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.gbwrap')).slice(-6).map(el => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${at}: sideways scroll ${wide.join(' | ')}`).toBeLessThanOrEqual(1);
  const touching = await findTouching(page);
  expect(touching.map(x => `${x.a} ⟷ ${x.b} (${x.dir} ${x.gap}px)`), `${at}: touching`).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('main .sname>a, main a.gb-score, main .sp-tools .btn, main .sp-fullname, main .sp-table tbody th a, main .sp-std a, main .sp-live a, main #gb-live thead a, main .gbhelp>summary')]
    .filter(el => el.offsetParent && el.getBoundingClientRect().height < 43.5).map(el => `${el.className || el.tagName} "${el.textContent.trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`));
  expect(small, `${at}: tap targets`).toEqual([]);
}
const VIEWS = [
  { name: '360', width: 360, height: 760, scheme: 'light' },
  { name: '390', width: 390, height: 844, scheme: 'light' },
  { name: '390-dark', width: 390, height: 844, scheme: 'dark' },
  { name: '1366', width: 1366, height: 900, scheme: 'light' },
  { name: '1366-dark', width: 1366, height: 900, scheme: 'dark' },
];

test('the gradebook: Work done apart from Score, late, live games, both names; a score opens the student\'s page', async ({ browser }) => {
  const t = await signIn(browser, seed.teacher);
  const [priya, ava, noah, mia, leo, zoe] = seed.students;
  await t.goto(`/class/${seed.classId}/progress`);
  const head = t.locator('#gb-lessons thead th');
  await expect(head.nth(-2)).toHaveText('Work done'); await expect(head.nth(-1)).toHaveText('Score');
  await expect(t.locator('#gb-lessons thead')).not.toContainText('Overall');
  const row = id => t.locator(`#gb-lessons tbody tr:has(a[href$="/student/${id}"])`);
  // Ava answered every quiz question wrong and did every step: 100% of the first lesson done, a low score
  await expect(row(ava.id).locator('td').first()).toContainText('✅');
  await expect(row(ava.id).locator('.gb-score .gb-num')).toHaveText('35%');   // quiz 0/5, rubric 5/12, live 4/10, the second quiz 2/4: 11 of 31 points
  await expect(row(priya.id).locator('.gb-score .gb-num')).toHaveText('90%');
  await expect(row(zoe.id).locator('.gb-scorecell')).toContainText('–');
  await expect(row(zoe.id).locator('a.gb-score')).toHaveCount(0);
  // late: Noah finished after the due date, Mia has work missing
  await expect(row(noah.id).locator('.gb-latedone')).toHaveText('⏰ Done late');
  await expect(row(mia.id).locator('td.gb-late')).toHaveCount(1);
  // both names: the roster name (a link to the student's page) and the name used in games under it
  await expect(row(ava.id).locator('.sname b')).toHaveText('Ava Lopez');
  await expect(row(ava.id).locator('.sname .gname bdi')).toHaveText(ava.username);
  // "How to read it" explains the formula
  const help = t.locator('.gbhelp');
  if (!(await help.evaluate(d => d.open))) await help.locator('summary').click();
  await expect(help).toContainText('Points earned out of points possible'); await expect(help).toContainText('does not look at right answers');
  // live games: a column per game, right/asked per student, ✓ for a vote, – when absent
  const live = t.locator('#gb-live');
  await expect(live.locator('thead th')).toHaveCount(4);
  const lrow = id => live.locator(`tbody tr:has(a[href$="/student/${id}"])`);
  await expect(lrow(priya.id).locator('td').nth(1)).toHaveText('7/8');
  await expect(lrow(priya.id).locator('td').nth(0)).toContainText('✓');
  await expect(lrow(ava.id).locator('td').nth(1)).toContainText('–');
  await expect(lrow(leo.id).locator('td').nth(2)).toHaveText('5/10');
  // tap a score: the student's page, at what makes it up
  await Promise.all([t.waitForURL(new RegExp(`/class/${seed.classId}/student/${priya.id}#score$`)), row(priya.id).locator('a.gb-score').click()]);
  await expect(t.locator('.sp-name')).toHaveText('Priya Natarajan-Whitfield');
  const items = t.locator('#score .sp-items');
  await expect(items).toContainText('Exit ticket'); await expect(items).toContainText('4/5');
  await expect(items).toContainText('Rubric'); await expect(items).toContainText('11/12');
  await expect(items).toContainText('Live game'); await expect(items).toContainText('9/10');
  await expect(items.locator('tfoot')).toContainText('90%'); await expect(items.locator('tfoot')).toContainText('28/31');
  await expect(t.locator('#student-report')).toContainText('Lovely explanation, Priya.');
  await expect(t.locator('#student-report')).not.toContainText('Ava Lopez');
  await expect(t.locator('main')).not.toContainText(/\$\d/);
  // the lesson's page: scores, the late step and both names
  await t.goto(`/class/${seed.classId}/progress/${seed.clId}`);
  await expect(t.locator(`#s-${noah.id} .gb-latedone`)).toBeVisible();
  await expect(t.locator(`#s-${noah.id} .st-late`)).toHaveCount(2);
  await expect(t.locator(`#s-${priya.id} .gb-score .gb-num`)).toHaveText('89%');
  await expect(t.locator(`#a-${seed.askId}-${ava.id} .sname .gname bdi`)).toHaveText(ava.username);
  // the CSV: old columns in place, the new ones at the end
  const csv = (await (await t.request.get(`/class/${seed.classId}/progress.csv`)).text()).replace(/^﻿/, '').split('\r\n');
  const cols = csv[0].split(',');
  expect(cols.slice(0, 2)).toEqual(['Name', 'Oomba Academy name']);
  expect(cols.indexOf('Work done')).toBeGreaterThan(2);
  expect(cols.slice(cols.indexOf('Score'), cols.indexOf('Score') + 3)).toEqual(['Score', 'Score (points)', 'Late lessons']);
  expect(cols.filter(c => c.startsWith('Live: ')).length).toBe(3);
  const avaLine = csv.find(l => l.startsWith('Ava Lopez,')).split(',');
  expect(avaLine[1]).toBe(ava.username); expect(avaLine[cols.indexOf('Score')]).toBe('35%');
  expect(csv.find(l => l.startsWith('Noah Kim,')).split(',')[cols.indexOf('Adding fractions (late)')]).toBe('done late');
  expect(csv.find(l => l.startsWith('Mia Patel,')).split(',')[cols.indexOf('Adding fractions (late)')]).toBe('late');
  await t.context().close();
});

test('a print shows the first name only unless the teacher ticks the box; the name used in games is never printed', async ({ browser }) => {
  const t = await signIn(browser, seed.teacher);
  const priya = seed.students[0];
  await t.goto(`/class/${seed.classId}/student/${priya.id}`);
  await expect(t.locator('.sp-name .sp-rest')).toBeVisible();
  await t.emulateMedia({ media: 'print' });
  await expect(t.locator('.sp-name .sp-first')).toBeVisible();
  await expect(t.locator('.sp-name .sp-rest')).toBeHidden();
  await expect(t.locator('.sp-tools')).toBeHidden(); await expect(t.locator('.classtabs')).toBeHidden(); await expect(t.locator('.topbar')).toBeHidden();
  await expect(t.locator('.sp-sub .noprint')).toContainText(priya.username);   // the name used in games: on screen only
  await expect(t.locator('.sp-sub .noprint')).toBeHidden();
  await t.screenshot({ path: path.join(SHOTS, 'student-print-first-name.png'), fullPage: true });
  await t.emulateMedia({ media: 'screen' });
  await t.check('#sp-full');
  await t.emulateMedia({ media: 'print' });
  await expect(t.locator('.sp-name .sp-rest')).toBeVisible();
  await t.emulateMedia({ media: 'screen' });
  await t.context().close();
});

test('students and other teachers never get a student\'s page; a student sees no classmate\'s roster name', async ({ browser }) => {
  const [priya, ava] = seed.students;
  const s = await signIn(browser, seed.student);
  for (const p of [`/class/${seed.classId}/student/${priya.id}`, `/class/${seed.classId}/student/${ava.id}`, `/class/${seed.classId}/progress`]) {
    const r = await s.request.get(p);
    expect(r.status(), p).toBe(404); expect(await r.text()).not.toMatch(/Ava Lopez|Natarajan/);
  }
  await s.goto(`/class/${seed.classId}`);
  await expect(s.locator('main')).not.toContainText('Ava Lopez'); await expect(s.locator('main')).not.toContainText('Noah Kim');
  await s.context().close();
  const o = await signIn(browser, seed.other);
  expect((await o.request.get(`/class/${seed.classId}/student/${priya.id}`)).status()).toBe(404);
  await o.context().close();
  const anon = await (await browser.newContext({ baseURL: BASE })).newPage();
  await anon.goto(`/class/${seed.classId}/student/${priya.id}`);
  await expect(anon).toHaveURL(/\/login/);
  await expect(anon.locator('body')).not.toContainText('Natarajan');
  await anon.context().close();
});

test('the new screens on phones and desktop, light and dark, and in Hebrew: nothing overflows, nothing touches, 44px targets', async ({ browser }) => {
  const t = await signIn(browser, seed.teacher);
  const state = await t.context().storageState();
  await t.context().close();
  const [priya, , noah] = seed.students;
  const pages = [['gradebook', `/class/${seed.classId}/progress`], ['lesson', `/class/${seed.classId}/progress/${seed.clId}`], ['student', `/class/${seed.classId}/student/${priya.id}`], ['student-late', `/class/${seed.classId}/student/${noah.id}`]];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    const p = await ctx.newPage();
    for (const [name, url] of pages) {
      await p.goto(url);
      await expect(p.locator('main')).toBeVisible();
      await layoutOk(p, `${name} ${v.name}`);
      if (v.name !== '360') await p.screenshot({ path: path.join(SHOTS, `${name}-${v.name}.png`), fullPage: true });
      if (name === 'gradebook') { await p.locator('#live-games').scrollIntoViewIfNeeded(); await layoutOk(p, `${name} live ${v.name}`); if (v.name !== '360') await p.locator('#live-games').screenshot({ path: path.join(SHOTS, `gradebook-live-${v.name}.png`) }); }
    }
    await ctx.close();
  }
  // Hebrew (right to left), phone and desktop
  for (const v of [VIEWS[1], VIEWS[3]]) {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: v.width, height: v.height }, storageState: state });
    const p = await ctx.newPage();
    for (const [name, url] of pages.slice(0, 3)) {
      await p.goto(`${url}?lang=he`);
      await expect(p.locator('html')).toHaveAttribute('dir', 'rtl');
      await layoutOk(p, `${name} he ${v.name}`);
      await p.screenshot({ path: path.join(SHOTS, `${name}-he-${v.name}.png`), fullPage: true });
    }
    await expect(p.locator('.sp-stat-l').first()).toHaveText('עבודה שבוצעה');
    await ctx.close();
  }
});
