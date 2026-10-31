// Oomba Kit 1.1.0 themes in a real browser: every theme's demo (/kit?scene=themes&th=...) runs through the real frame
// wrapper with no errors or kit warnings, shows its own world and props, and the themes look different from each other
// (the average colour of the play picture, sky and ground included, differs pair by pair). Kit 1.0.0 is still served.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { login, ADMIN } from './helpers.js';
import { KIT_VERSIONS } from '../../server/services/kit.js';
import { THEMES } from '../../kit/packs/dress.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('kit 1.0.0 (saved games) and 1.1.0 are both served, each byte for byte its pinned hash', async ({ request }) => {
  for (const [v, h] of Object.entries(KIT_VERSIONS)) {
    const r = await request.get(`/vendor/oomba-kit/${v}/oomba-kit.js`); expect(r.status()).toBe(200);
    expect('sha384-' + crypto.createHash('sha384').update(await r.body()).digest('base64')).toBe(h);
  }
});

test('every theme runs in the frame with no errors, its own world and props, and looks unlike the others', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } }); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  const avg = {};
  for (const name of Object.keys(THEMES)) {
    const errors = [];
    const onErr = e => errors.push(String(e.message || e)), onLog = m => { if (m.type() === 'error' || /\[oomba\]/.test(m.text())) errors.push(m.text()); };
    page.on('pageerror', onErr); page.on('console', onLog);
    await page.goto(`/kit?scene=themes&th=${name}&backend=paper`);
    await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/themes')), { timeout: 15000 }).toBe(true);
    const f = page.frames().find(x => x.url().includes('/kit/frame/themes'));
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.start, null, { timeout: 20000 });
    await f.evaluate(() => window.__brbTest.start());
    await f.waitForFunction(() => window.__brbTest.frameStats().p50 > 0, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const st = await f.evaluate(() => window.__brbTest.state());
    expect(st.look.name, name).toBe(name);
    expect(st.look.biome).toBe(THEMES[name].biome);
    expect(st.look.props.length, `${name} props`).toBeGreaterThanOrEqual(4);
    const buf = await page.locator('#kitframe').screenshot();
    avg[name] = await page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 48; c.height = 27; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 48, 27);
      const d = g.getImageData(0, 0, 48, 27).data; const s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      return s.map(x => x / (d.length / 4));
    }, buf.toString('base64'));
    page.off('pageerror', onErr); page.off('console', onLog);
    expect(errors, name).toEqual([]);
  }
  // the twelve kids ask for: no two alike (average colour at least 12 apart in RGB)
  const twelve = ['meadow', 'beach', 'jungle', 'snow', 'desert', 'reef', 'space', 'candy', 'haunted', 'castle', 'cyber', 'stadium'];
  for (let i = 0; i < twelve.length; i++) for (let j = i + 1; j < twelve.length; j++) {
    const a = avg[twelve[i]], b = avg[twelve[j]], dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(dist, `${twelve[i]} vs ${twelve[j]}`).toBeGreaterThan(12);
  }
  await ctx.close();
});
