// The teacher landing page (server/routes/landing.js) in a real browser, at phone, tablet and desktop sizes, dark and
// light: Largest Contentful Paint (and what it was), layout shift while loading and scrolling, sideways scrolling,
// console errors, the parallax moving (and not moving with reduced motion), and the page bytes.
//
//   BASE=http://localhost:3000 node scripts/landing-audit.js        (the server must answer "/" with the landing:
//                                                                    LANDING_AT_ROOT unset or 1, nobody signed in)
// Options (env): SIZES="390x844,820x1180,1180x820,1280x800,1440x900,1920x1080"  THEMES="dark,light"  CPU=4 (slowdown)
// Exit code 1 when LCP > 2.5 s, CLS > 0.1, the page scrolls sideways or a script fails.
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const SIZES = (process.env.SIZES || '390x844,820x1180,1180x820,1280x800,1440x900,1920x1080').split(',').map(s => s.split('x').map(Number));
const THEMES = (process.env.THEMES || 'dark,light').split(',');
const CPU = +(process.env.CPU || 4);
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
let bad = 0;
const rows = [];
for (const theme of THEMES) for (const [width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 900 ? 2 : 1, hasTouch: width < 900 });
  if (theme === 'light') await ctx.addCookies([{ name: 'theme', value: 'light', url: BASE + '/' }]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  let bytes = 0;
  page.on('response', async r => { try { bytes += (await r.body()).length; } catch { /* redirects */ } });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.addInitScript(() => {
    window.__lcp = null; window.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = { t: e.startTime, el: e.element ? e.element.tagName + (e.element.id ? '#' + e.element.id : e.element.className ? '.' + String(e.element.className).split(' ')[0] : '') : '?' }; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const lcp = await page.evaluate(() => window.__lcp);
  // Scroll down the page the way a person does; the parallax layers must move, the layout must not.
  const before = await page.evaluate(() => getComputedStyle(document.querySelector('.lp-s3')).transform);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(height * 0.8)) { await page.mouse.wheel(0, Math.round(height * 0.8)); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('.lp-s3')).transform);
  const r = await page.evaluate(() => ({ cls: window.__cls, sw: document.documentElement.scrollWidth, w: innerWidth }));
  const row = { theme, size: `${width}x${height}`, lcpMs: lcp ? Math.round(lcp.t) : null, lcpEl: lcp && lcp.el, cls: +r.cls.toFixed(4), sideways: r.sw > r.w, parallax: before !== after, kb: Math.round(bytes / 1024), errors };
  const fail = !lcp || lcp.t > 2500 || r.cls > 0.1 || row.sideways || errors.length || !row.parallax;
  if (fail) bad++;
  rows.push(row);
  console.log(`${fail ? '✗' : '✓'} ${theme.padEnd(5)} ${row.size.padEnd(10)} LCP ${String(row.lcpMs).padStart(5)} ms (${row.lcpEl})  CLS ${row.cls}  sideways ${row.sideways}  parallax ${row.parallax}  ${row.kb} KB${errors.length ? '  ERRORS ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
// Reduced motion: nothing moves.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.mouse.wheel(0, 1600); await page.waitForTimeout(400);
  const still = await page.evaluate(() => getComputedStyle(document.querySelector('.lp-s3')).transform === 'none' && document.querySelector('.lp-demo').dataset.stage === 'done');
  console.log(`${still ? '✓' : '✗'} reduced motion: parallax and the hero loop stay still`);
  if (!still) bad++;
  await ctx.close();
}
await browser.close();
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2));
console.log(bad ? `${bad} problem(s)` : 'All good.');
process.exit(bad ? 1 : 0);
