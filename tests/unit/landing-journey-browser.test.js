// The landing page's "How it works" steps (#how): the line through the steps is always drawn under their icons, also
// while a step fades in on first load (owner's iPhone, 21 Nov 2026: the line covered the icons until the fade ended).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.LANDING_AT_ROOT = '1';
const { createApp } = await import('../../server/app.js');
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

test('the steps\' icons are in front of the line, while fading in and after (phone and laptop)', { skip }, async () => {
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  try {
    for (const opts of [{ ...devices['iPhone 13'] }, { viewport: { width: 1280, height: 800 } }]) {
      const ctx = await browser.newContext(opts); const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      for (const state of ['rv-wait', 'rv-in']) {
        const hits = await page.evaluate(async state => {
          document.documentElement.style.scrollBehavior = 'auto';
          const list = document.querySelector('[data-journey]'); const steps = [...list.children];
          steps.forEach(s => { s.classList.remove('rv-wait', 'rv-in'); s.classList.add(state); s.style.transition = 'none'; s.style.opacity = '1'; });
          list.style.setProperty('--fill', '1');
          const out = [];
          for (const s of steps) {
            scrollTo(0, s.getBoundingClientRect().top + scrollY - 300); await new Promise(r => requestAnimationFrame(r));
            const b = s.querySelector('.lp-jbadge').getBoundingClientRect();
            const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            out.push(!!(el && el.closest('.lp-jbadge')));
          }
          return out;
        }, state);
        assert.deepEqual(hits, hits.map(() => true), `${opts.viewport?.width || 'phone'} ${state}: every icon is on top`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); server.closeAllConnections(); server.close(); }
});
