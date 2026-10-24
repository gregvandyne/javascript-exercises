// Screenshot every page at 390px and 1280px in light and dark. Usage:
//   BASE=http://localhost:3000 ADMIN_PASSWORD=... node scripts/screenshots.js [outDir]
// Signs up a throwaway builder so signed-in pages render. Output: screenshots/<page>-<width>-<scheme>.png
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = path.resolve(process.argv[2] || 'screenshots');
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});

async function session(login) {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  if (login === 'admin') {
    await p.goto(BASE + '/login'); await p.fill('#username', process.env.ADMIN_USERNAME || 'admin'); await p.fill('#password', process.env.ADMIN_PASSWORD || '');
    await Promise.all([p.waitForURL(u => !u.pathname.startsWith('/login')), p.click('button[type=submit]')]);
  } else if (login) {
    await p.goto(BASE + '/signup'); await p.fill('#username', 'Shot' + Math.random().toString(36).slice(2, 7)); await p.fill('#password', 'secret123');
    await Promise.all([p.waitForURL(u => !u.pathname.startsWith('/signup')), p.click('button[type=submit]')]);
  }
  const state = await ctx.storageState(); await ctx.close(); return state;
}
const anon = await session(null), user = await session(true);
let admin = null; try { if (process.env.ADMIN_PASSWORD) admin = await session('admin'); } catch { /* no admin */ }

const pages = [
  ['home', '/', anon], ['search', '/search?q=s', anon], ['game', '/g/footy-tycoon', anon], ['play', '/play/shark-plank', anon],
  ['login', '/login', anon], ['signup', '/signup', anon], ['safety', '/safety', anon], ['parents', '/parents', anon],
  ['me', '/me', user], ['build', '/build', user], ['friends', '/friends', user], ['chat', '/chat', user],
  ['profile', '/u/MagicCups', user], ['notfound', '/nope', anon],
  ...(admin ? [['admin', '/admin', admin], ['admin-stats', '/admin/stats', admin]] : []),
];
for (const [name, url, state] of pages) {
  for (const width of [390, 1280]) for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ storageState: state, viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(name === 'play' ? 1500 : 200);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      await p.screenshot({ path: path.join(OUT, `${name}-${width}-${scheme}.png`), fullPage: name !== 'play' });
      if (overflow) console.log(`⚠ horizontal overflow: ${name} @${width} ${scheme}`);
    } catch (e) { console.log(`✗ ${name} @${width} ${scheme}: ${e.message.split('\n')[0]}`); }
    await ctx.close();
  }
}
await browser.close();
console.log(`Saved to ${OUT}`);
