// The domain move in a real browser: cookies are per site, so 127.0.0.1 stands in for the old name
// (magic-cup.onrender.com) and localhost for the new one (oomba.ai). This spec runs its own server on E2E_PORT + 2,
// first without PUBLIC_URL (today), then restarted with PUBLIC_URL=http://localhost:<port> and the old name listed.
import { test, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uniq } from './helpers.js';
import { NO_STRIPE_ENV } from '../support/no-stripe-env.js';

const PORT = +(process.env.E2E_PORT || 4310) + 2; // + 1 is the fake Google
const OLD = `http://127.0.0.1:${PORT}`, NEW = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-move-'));
const ENV = { ...process.env, ...NO_STRIPE_ENV, PORT: String(PORT), BRB_DATA_DIR: DATA, BRB_SILENT: '1', LOG_REQUESTS: '0', BRB_SNAPSHOTS: '0', SESSION_SECRET: 'move-test-secret-0123456789abcdef0123456789', ADMIN_PASSWORD: 'admin-pass-123', NODE_ENV: 'development' };
delete ENV.GOOGLE_CLIENT_ID; delete ENV.GOOGLE_CLIENT_SECRET; delete ENV.GOOGLE_OIDC_BASE;
delete ENV.PUBLIC_URL; delete ENV.REDIRECT_HOSTS; delete ENV.RENDER_EXTERNAL_HOSTNAME; delete ENV.BRB_DB;
let proc = null;
async function start(extra = {}) {
  const out = fs.openSync(path.join(DATA, 'server.log'), 'a');
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...ENV, ...extra, BRB_SILENT: '' }, stdio: ['ignore', out, out] });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`${OLD}/health`)).ok) return; } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)); }
  throw new Error('server did not start');
}
async function stop() { if (!proc) return; const p = proc; proc = null; p.kill('SIGTERM'); await new Promise(r => p.once('exit', r)); }
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { execFileSync(process.execPath, ['scripts/seed.js'], { env: ENV, stdio: 'ignore' }); await start(); });
test.afterAll(async () => { await stop(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('switch day: signed-in people, their language and theme, and old open tabs all land on the new name', async ({ browser }) => {
  test.setTimeout(120_000);
  // Before the switch: signed in on the old name, French, dark theme, and a tab left open.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const name = uniq('Mover');
  const r = await page.request.post(`${OLD}/api/auth/signup`, { data: { username: name, password: 'blue-otter-42' }, headers: { origin: OLD } });
  expect(r.ok()).toBeTruthy();
  await ctx.addCookies([{ name: 'lang', value: 'fr', url: OLD }, { name: 'theme', value: 'dark', url: OLD }]);
  await page.goto(`${OLD}/me`);
  await expect(page.locator('body')).toContainText(name);
  const signedOut = await browser.newContext();

  // The switch: PUBLIC_URL is the new name, the old one listed; redirects start once the self-check passes.
  await stop();
  await start({ PUBLIC_URL: NEW, REDIRECT_HOSTS: `127.0.0.1:${PORT}` });
  // (A page load, like a browser's: Node's fetch says it is a background request, which is served, not redirected.)
  await expect.poll(async () => (await fetch(`${OLD}/search`, { redirect: 'manual', headers: { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' } })).status, { timeout: 20_000 }).toBe(301);

  // A new page load on the old name: same page on the new name, signed in, French, dark, and a clean address.
  const tab = await ctx.newPage();
  await tab.goto(`${OLD}/me?tab=games`);
  await expect(tab).toHaveURL(`${NEW}/me?tab=games`);
  await expect(tab.locator('body')).toContainText(name);
  await expect(tab.locator('html')).toHaveAttribute('lang', 'fr');
  expect((await ctx.cookies(NEW)).find(c => c.name === 'theme')?.value).toBe('dark');
  expect(tab.url()).not.toMatch(/handoff|[?&]t=/);

  // The tab opened before the switch: a click there moves it too (through the "we moved" page), still signed in.
  await page.click('a[href="/"]');
  await expect(page).toHaveURL(`${NEW}/`, { timeout: 10_000 });
  await page.goto(`${NEW}/me`); await expect(page.locator('body')).toContainText(name);

  // Signed out: one plain redirect to the same page.
  const p2 = await signedOut.newPage();
  await p2.goto(`${OLD}/search`);
  await expect(p2).toHaveURL(`${NEW}/search`);
  await ctx.close(); await signedOut.close();
});
