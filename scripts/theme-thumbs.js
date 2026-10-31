// The small pictures on the Studio's theme chips: public/img/themes/<theme>.webp (96x64, shown at 48x32), one per kit
// theme (kit/packs/dress.js THEMES), taken from the theme's own preview (/kit?scene=themes&th=<theme>) a moment into
// play. Run against a running server with an admin account (the /kit preview is admin-only):
//   BASE=http://localhost:4471 ADMIN_USERNAME=admin ADMIN_PASSWORD=... node scripts/theme-thumbs.js
// Needs the Playwright Chromium (BRB_CHROMIUM, or the one Playwright installed). Chromium itself encodes the WebP.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { THEMES } from '../kit/packs/dress.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/img/themes');
const BASE = process.env.BASE || 'http://localhost:4310';
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 400 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.fill('#username', process.env.ADMIN_USERNAME || 'admin'); await page.fill('#password', process.env.ADMIN_PASSWORD || '');
await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
fs.mkdirSync(OUT, { recursive: true });
for (const name of Object.keys(THEMES)) {
  await page.goto(`${BASE}/kit?scene=themes&th=${name}&backend=paper`);
  const el = page.locator('#kitframe'); await el.waitFor();
  let f = null; for (let i = 0; i < 100 && !f; i++) { f = page.frames().find(x => x.url().includes('/kit/frame/themes')); if (!f) await page.waitForTimeout(100); }
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.start, null, { timeout: 20000 });
  await f.evaluate(() => window.__brbTest.start());
  await f.waitForFunction(() => window.__brbTest.frameStats().p50 > 0, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const png = await el.screenshot();
  // crop the middle 3:2 (the HUD band at the top left out), scale to 96x64, encode as WebP
  const b64 = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode();
    const w = img.width, h = img.height, ch = Math.min(h * 0.8, w / 1.5), cw = ch * 1.5, sy = h * 0.14;
    const c = document.createElement('canvas'); c.width = 96; c.height = 64;
    c.getContext('2d').drawImage(img, (w - cw) / 2, Math.min(sy, h - ch), cw, ch, 0, 0, 96, 64);
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.8));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (const b of buf) s += String.fromCharCode(b); return btoa(s);
  }, 'data:image/png;base64,' + png.toString('base64'));
  const out = path.join(OUT, `${name}.webp`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(path.relative(ROOT, out), fs.statSync(out).size, 'bytes');
}
await browser.close();
