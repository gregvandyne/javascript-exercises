// Builds keep working when the builder leaves: a real server of its own (port 5914, or E2E_BG_PORT; slow building
// blocks so a build lasts about 27 s), which the tests stop and start again for real. Leave and come back, reload, two
// tabs, sign out and sign in again (the one-time "ready" note), a deploy in the middle of a build (it carries on by
// itself), a build interrupted twice (stopped, the turn given back, "Carry on building"), and messages sent while it
// builds (follow-ups: read and applied, refused, capped, from a second tab).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ADMIN } from './helpers.js';

const PORT = +(process.env.E2E_BG_PORT || 5914);
const BG = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOX = 'Make a catch game about a fox. Just build it.';
let DATA = null, proc = null, exited = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  DEMO_TEACHER_PASSWORD: 'demo-pass-123', ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0',
  BRB_MOCK_DELAY_MS: '900', BRB_MOCK_INBOX_WAIT_MS: '2000', SHUTDOWN_GRACE_SECONDS: '2',
});
async function startServer() {
  proc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  exited = new Promise(r => proc.once('exit', code => r(code)));
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`${BG}/health`)).ok) return; } catch { /* not up yet */ }
    if (proc.exitCode !== null || Date.now() - t0 > 60_000) throw new Error('the background server did not start');
    await new Promise(r => setTimeout(r, 150));
  }
}
/** A deploy: SIGTERM, and wait until the process has exited (running builds are handed off first). */
async function stopServer() { if (proc && proc.exitCode === null) { proc.kill('SIGTERM'); expect(await exited).toBe(0); } }

test.use({ baseURL: BG });
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-bg-'));
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await startServer();
});
test.afterAll(async () => {
  if (proc && proc.exitCode === null) { proc.kill('SIGTERM'); await Promise.race([exited, new Promise(r => setTimeout(r, 10_000))]); if (proc.exitCode === null) proc.kill('SIGKILL'); }
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

const live = page => page.locator('.stp[data-state="live"]');
const cur = page => live(page).locator('li.stp-cur');
const turnsLeft = async page => +((await page.locator('#st-turns').textContent()).match(/\d+/) || [NaN])[0];
const settled = async (page, timeout = 40_000) => { await expect(page.locator('.st-busy')).toHaveCount(0, { timeout }); await expect(page.locator('#st-send')).toBeEnabled({ timeout }); };
async function newGame(page, lang = '') {
  const who = await signup(page, uniq('Bg'));
  await page.goto(`/build${lang ? `?lang=${lang}` : ''}`);
  await Promise.all([page.waitForURL(/\/studio\//), page.click('#newgame')]);
  return { id: page.url().split('/studio/')[1], ...who };
}
/** Send FOX and wait until the build is past screening (the building blocks are working). */
async function startBuild(page) {
  await page.fill('#st-input', FOX); await page.press('#st-input', 'Enter');
  await expect(cur(page)).toHaveAttribute('data-step', 'blocks', { timeout: 10_000 });
}
const reconnectNow = page => page.evaluate(() => dispatchEvent(new Event('online')));
const noOverflow = async page => {
  const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
  expect(m.doc).toBeLessThanOrEqual(m.win);
};

test('BG-1 leave and come back: the leave line shows; Me and My games say Building…; back in the Studio the build is replayed and finishes', async ({ page }) => {
  test.setTimeout(90_000);
  const { id } = await newGame(page);
  await startBuild(page);
  const leave = live(page).locator('.stp-leave');
  await expect(leave).toBeVisible({ timeout: 12_000 });
  await expect(leave).toHaveText('🌙 You can close this page or your computer, or sign out. The Oomba Builder keeps working on our server, and your game will be here when you come back.');
  const rows = await live(page).locator('li.stp-row').count();
  await page.goto('/me');
  await expect(page.locator('.metile-sub')).toHaveText('1 game building');
  await page.goto('/build');
  await expect(page.locator(`.mygame[data-id="${id}"] .mg-status`)).toContainText('🛠️ Building…');
  await page.goto(`/studio/${id}`);
  // The running build at once: its message, no greeting or idea chips; then the replay fills the card.
  await expect(page.locator('#st-log .msg.me')).toHaveText(FOX);
  await expect(page.locator('#st-log')).not.toContainText('I’m the Builder');
  await expect(page.locator('#st-log .qchips:not(.used)')).toHaveCount(0);
  await expect.poll(() => live(page).locator('li.stp-row').count()).toBeGreaterThanOrEqual(rows);
  // The running step keeps its real time (not "0 sec"), when the building blocks are still on their long step.
  if (await cur(page).getAttribute('data-step') === 'blocks') await expect(cur(page).locator('.stp-sec')).toHaveText(/[1-9]/);
  await expect(live(page).locator('.stp-leave')).toBeVisible();
  await settled(page);
  await expect(page.locator('.stp-sum').last()).toContainText('How the building blocks did this');
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
});

test('BG-2 reload mid-build: the same build comes back, and the preview loads once', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    window.__loads = 0; const f = document.getElementById('st-frame'); if (f) f.addEventListener('load', () => { window.__loads++; });
  }));
  await newGame(page);
  await startBuild(page);
  await page.waitForTimeout(1500);
  const rows = await live(page).locator('li.stp-row').count();
  await page.reload();
  await expect(page.locator('#st-log .msg.me')).toHaveText(FOX);
  await expect(page.locator('#st-log')).not.toContainText('I’m the Builder');
  await expect.poll(() => live(page).locator('li.stp-row').count()).toBeGreaterThanOrEqual(rows);
  await expect(cur(page)).toHaveAttribute('data-step', 'blocks');
  await expect(cur(page).locator('.stp-sec')).toHaveText(/[1-9]/);   // the replayed step keeps its real time
  await settled(page);
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
  await expect(page.locator('#st-frame')).toHaveAttribute('src', /\/frame\//);
  expect(await page.evaluate(() => window.__loads)).toBe(1);
});

test('BG-3 two tabs: a tab opened before the build follows it live and ends with the same turns left', async ({ page }) => {
  test.setTimeout(90_000);
  const { id } = await newGame(page);
  const b = await page.context().newPage();
  await b.goto(`/studio/${id}`);
  await expect(b.locator('#st-log')).toContainText('I’m the Builder');
  await page.waitForTimeout(500);   // b's stream is open
  await startBuild(page);
  await expect(b.locator('#st-log .msg.me')).toHaveText(FOX);
  await expect(live(b)).toBeVisible();
  await expect(b.locator('#st-log .ev.version')).toHaveCount(1, { timeout: 30_000 });
  await expect(b.locator('#st-frame')).toHaveAttribute('src', /\/frame\//);
  await settled(page); await settled(b);
  expect(await turnsLeft(b)).toBe(await turnsLeft(page));
  await b.close();
});

test('BG-4 sign out mid-build, sign in later: the game is ready, said once on the next page, and My games says Ready until it is opened', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const { id, username, password } = await newGame(page);
  await startBuild(page);
  await page.goto('/me');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/me')), page.locator('#signout button[type=submit]').first().click()]);
  // Signed out: the build goes on. Wait until it is done (asked as the admin, who may look at any game).
  const adminCtx = await browser.newContext(); const admin = await adminCtx.newPage();
  await login(admin, ADMIN.username, ADMIN.password);
  await expect.poll(async () => (await (await admin.request.get(`/api/studio/${id}`)).json()).busy, { timeout: 40_000, intervals: [500] }).toBe(false);
  await adminCtx.close();
  await login(page, username, password);
  const note = page.locator('.notice.good.pagenote');
  await expect(note).toHaveCount(1);
  await expect(note).toContainText('is ready!');
  await expect(note.locator('a')).toHaveText('Open it');
  await page.reload();
  await expect(page.locator('.notice.good.pagenote')).toHaveCount(0);
  await page.goto('/build');
  await expect(page.locator(`.mygame[data-id="${id}"] .mg-status`)).toContainText('✨ Ready');
  await page.goto(`/studio/${id}`);
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
  await expect(page.locator('.stp-sum').last()).toContainText('How the building blocks did this');
  await page.goto('/build');
  await expect(page.locator(`.mygame[data-id="${id}"] .mg-status`)).not.toContainText('Ready');
});

test('BG-5 a deploy mid-build: the restart row, then the build carries on by itself and finishes; one turn used', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await newGame(page);
  const before = await turnsLeft(page);
  await startBuild(page);
  await page.waitForTimeout(800);
  await stopServer();
  await expect(cur(page)).toHaveAttribute('data-step', 'restart');
  await expect(cur(page)).toContainText('Our server is restarting. Your build is saved and should carry on by itself');
  await expect(page.locator('.st-busy')).toContainText('Our server is restarting. Your build is saved and should carry on by itself');
  await expect(page.locator('#st-log .err')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('bg5-restart-light.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('bg5-restart-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await startServer();
  await reconnectNow(page);
  await expect(live(page).locator('li[data-step="resume"]')).toContainText('Carried on after the server restarted', { timeout: 20_000 });
  await settled(page, 60_000);
  await expect(page.locator('#st-log .msg.me')).toHaveCount(1);
  await expect(page.locator('#st-log .msg.me')).toHaveText(FOX);
  await expect(page.locator('.stp-sum', { hasText: 'stopped by a server restart' })).toHaveCount(1);
  await expect(page.locator('#st-log .msg.note')).toHaveText('🔄 The server restarted, so the Builder carried on from where it was.');
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
  expect(await turnsLeft(page)).toBe(before - 1);
});

test('BG-6 interrupted twice: stopped, the turn given back, and "Carry on building" builds it', async ({ page }) => {
  test.setTimeout(180_000);
  await newGame(page);
  const before = await turnsLeft(page);
  await startBuild(page);
  await page.waitForTimeout(800);
  await stopServer(); await startServer();     // carried on at boot (attempt 2)
  await page.waitForTimeout(1200);              // about a second into the carried-on build
  await stopServer(); await startServer();     // a second interruption: it stops
  await reconnectNow(page);
  await expect(page.locator('#st-log .msg.note.stopped')).toHaveText('The Builder stopped when our server restarted. Anything it made is saved.', { timeout: 30_000 });
  await expect(page.locator('#st-log .msg.note', { hasText: 'This one didn’t use up a turn.' })).toHaveCount(1);
  const cont = page.locator('#st-log [data-act="continue"]');
  await expect(cont).toHaveText('▶️ Carry on building');
  expect((await cont.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await settled(page);
  expect(await turnsLeft(page)).toBe(before);
  await cont.click();
  await expect(page.locator('#st-log .msg.me').last()).toHaveText('Please carry on with my last message.');
  await settled(page, 60_000);
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
  await expect(page.locator('#st-log [data-act="continue"]')).toHaveCount(0);
  expect(await turnsLeft(page)).toBe(before - 1);
});

test('BG-12 (part) right to left at 360 px: the live card with the leave line reads right to left and nothing spills sideways', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await newGame(page, 'ar');
  await startBuild(page);
  await expect(live(page).locator('.stp-leave')).toBeVisible({ timeout: 12_000 });
  await noOverflow(page);
  expect(await live(page).evaluate(e => getComputedStyle(e).direction)).toBe('rtl');
  const leave = await live(page).locator('.stp-leave').boundingBox(), card = await live(page).boundingBox();
  expect(leave.x).toBeGreaterThanOrEqual(card.x); expect(leave.x + leave.width).toBeLessThanOrEqual(card.x + card.width + 1);
  await settled(page);
  await noOverflow(page);
});

// ---- Follow-ups: Send stays on while the Builder works. This server's building blocks wait up to 2 s after each pass
// for a new message (BRB_MOCK_INBOX_WAIT_MS), so a message sent after a version is read in the same build.
const fuBubble = page => page.locator('#st-log .msg.fu');
async function sendNow(page, text) { await page.fill('#st-input', text); await page.press('#st-input', 'Enter'); }

test('BG-7 a follow-up changes the build: sent after version 1, read, applied as version 2, and in order after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await newGame(page);
  const before = await turnsLeft(page);
  await startBuild(page);
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1, { timeout: 40_000 });
  await expect(page.locator('#st-send')).toBeEnabled();
  await sendNow(page, 'make it harder');
  await expect(fuBubble(page).locator('.fu-st')).toContainText('Waiting for the Builder to read it');
  await expect(live(page).locator('.stp-inbox')).toBeVisible();
  await expect(live(page).locator('.stp-inbox')).toContainText('Got your message. The Builder will read it after this step.');
  await expect(fuBubble(page).locator('.fu-st')).toContainText('The Builder read this', { timeout: 20_000 });
  await expect(page.locator('#st-log .ev.version')).toHaveCount(2, { timeout: 30_000 });
  await settled(page, 60_000);
  await expect(page.locator('.stp-sum').last()).toContainText('read 1 new message');
  expect(await turnsLeft(page)).toBe(before - 1);
  await page.reload();
  const order = await page.locator('#st-log').evaluate(log => [...log.children].map(e => (
    e.matches('.msg.fu') ? 'fu' : e.matches('.msg.me') ? 'me' : e.matches('.ev.version') ? `v${(e.textContent.match(/\d+/) || [])[0]}`
      : e.matches('.msg.bot') && /Here's my plan/.test(e.textContent) ? 'plan' : e.matches('.msg.bot') && /Got your new message!/.test(e.textContent) ? 'got' : null)).filter(Boolean));
  expect(order).toEqual(['me', 'plan', 'v1', 'fu', 'got', 'v2']);
  await expect(fuBubble(page).locator('.fu-st')).toContainText('The Builder read this');
  await expect(page.locator('.st-busy')).toHaveCount(0);
});

test('BG-8 a refused follow-up: the kind reply without idea chips, no error, the build finishes, one turn', async ({ page }) => {
  test.setTimeout(90_000);
  await newGame(page);
  const before = await turnsLeft(page);
  await startBuild(page);
  await sendNow(page, 'put pikachu in it');
  await expect(page.locator('#st-log .msg.fu.refused')).toHaveText('put pikachu in it');
  const reply = page.locator('#st-log .msg.bot.refused');
  await expect(reply).toHaveCount(1);
  await expect(page.locator('#st-log .msg.bot.refused + .qchips')).toHaveCount(0);
  await expect(page.locator('#st-log .err')).toHaveCount(0);
  await settled(page, 60_000);
  await expect(page.locator('#st-log .ev.version')).toHaveCount(1);
  await expect(page.locator('#st-log .msg.bot.refused')).toHaveCount(1);
  expect(await turnsLeft(page)).toBe(before - 1);
});

test('BG-9 at most 3 extra messages: the 4th says so, goes back in the box, and the box says to wait', async ({ page }) => {
  test.setTimeout(120_000);
  await newGame(page);
  await startBuild(page);
  for (const text of ['make it harder', 'make it faster', 'add a second level', 'make it purple']) await sendNow(page, text);
  await expect(page.locator('.toast').last()).toContainText('You’ve sent 3 extra messages during this build');
  await expect(page.locator('#st-input')).toHaveValue('make it purple');
  await expect(page.locator('#st-input')).toHaveAttribute('data-long', 'You can add more when this build is done');
  await expect(page.locator('#st-input')).toHaveAttribute('placeholder', /^(You can add more when this build is done|More when it’s done)$/);
  await expect(page.locator('#st-send')).toBeDisabled();
  await expect(fuBubble(page)).toHaveCount(3);
  await settled(page, 90_000);
});

test('BG-10 a second tab sends during the build: it becomes a follow-up there, is read, and both tabs show it', async ({ page }) => {
  test.setTimeout(120_000);
  const { id } = await newGame(page);
  const b = await page.context().newPage();
  await b.goto(`/studio/${id}`);
  await page.waitForTimeout(500);   // b's stream is open
  await startBuild(page);
  await expect(b.locator('#st-log .msg.me')).toHaveText(FOX);
  await sendNow(b, 'make it harder');
  await expect(fuBubble(b).locator('.fu-st')).toContainText('Waiting for the Builder to read it');
  await expect(fuBubble(page).locator('.fu-text')).toHaveText('make it harder');
  await expect(fuBubble(b).locator('.fu-st')).toContainText('The Builder read this', { timeout: 40_000 });
  await settled(page, 60_000); await settled(b, 60_000);
  for (const p of [page, b]) { await expect(fuBubble(p)).toHaveCount(1); await expect(fuBubble(p).locator('.fu-st')).toContainText('The Builder read this'); }
  await b.close();
});

test('BG-11 📎 is off while the Builder works and back on afterwards', async ({ page }) => {
  test.setTimeout(90_000);
  await newGame(page);
  await expect(page.locator('#st-clip')).toBeEnabled();
  await startBuild(page);
  await expect(page.locator('#st-clip')).toBeDisabled();
  await expect(page.locator('#st-clip')).toHaveAttribute('title', 'Add pictures after this build');
  await settled(page, 60_000);
  await expect(page.locator('#st-clip')).toBeEnabled();
});
