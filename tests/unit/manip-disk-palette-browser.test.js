// The place value disks' palette (docs/decisions.md "Manipulatives: disk palette"): every disk is a plain colored circle
// (its value is written beside it, not inside), so a long value like 1,000,000 no longer stretches it into an oval; a
// disk placed from the palette still shows its value on the board. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

const boss = createUser({ username: 'DiskBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

test('disk palette buttons are circles with the value beside them; a placed disk keeps its value', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives#place-value-disks`);
  await page.waitForSelector('.mp-pal.piece .mp-swv');
  const sw = await page.$$eval('.mp-pal.piece', bs => bs.map(b => {
    const s = b.querySelector('.mp-swv'), r = s.getBoundingClientRect();
    return { w: r.width, h: r.height, inside: s.textContent.trim(), beside: b.textContent.trim(), radius: getComputedStyle(s).borderRadius };
  }));
  assert.ok(sw.length >= 6, 'the disks are in the palette');
  for (const s of sw) {
    assert.ok(Math.abs(s.w - s.h) < 1, `a circle, not an oval (${s.w}x${s.h})`);
    assert.equal(s.radius, '50%');
    assert.equal(s.inside, '', 'nothing written inside the circle');
    assert.ok(s.beside.length > 0, 'the value is written beside it');
  }
  assert.ok(sw.some(s => s.beside === '1,000,000'));
  await page.screenshot({ path: '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/mdisk/palette.png' });
  const ten = page.locator('.mp-pal.piece', { hasText: /^10$/ });
  await ten.click();
  await page.waitForTimeout(300);
  const faces = await page.$$eval('#mp-board .mp-face', fs => fs.map(f => f.textContent.trim()));
  assert.ok(faces.includes('10'), `a placed disk shows its value (${faces.join(',')})`);
  await page.screenshot({ path: '/tmp/claude-0/-home-user-javascript-exercises/db321ed6-437e-588f-beaf-65f7e9b106cd/scratchpad/mdisk/placed.png' });
  assert.deepEqual(errors, []);
  await ctx.close();
});
