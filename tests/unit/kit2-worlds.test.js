// Every Kit 2 world plays in the real game frame (frameDocument + the frame CSP + the sandbox, in Chromium): the theme
// tour (kit2/demo/theme-tour.html) loads the theme's ground, all its heroes and a spread of its pieces through Oomba3D,
// with no console errors and nothing asked for outside /vendor. K2_SHOTS=<dir> saves a picture of each (the covers).
// Needs a local Chromium; skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = await import('../../server/services/vendor.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const TOUR = fs.readFileSync(path.join(ROOT, 'kit2/demo/theme-tour.html'), 'utf8');
const HOST = 'http://game.invalid';
// The newest version of every theme (older versions stay, unchanged, for games saved on them).
const newest = Object.keys(V.KIT2_LOCK.themes).reduce((m, tv) => { const [t, v] = tv.split('/'); const n = v.split('.').map(Number); if (!m[t] || n.some((x, i) => x > m[t].n[i] && n.slice(0, i).every((y, j) => y === m[t].n[j]))) m[t] = { v, n }; return m; }, {});
const WORLDS = Object.entries(newest).map(([id, { v }]) => ({ id, version: v }));
const tour = ({ id, version }) => TOUR.replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", `'${id}'`).replace("'THEME_VERSION'", `'${version}'`).replace("'THEME_TIME'", "'day'");

test('there are at least five worlds, and every tour passes the scanner', () => {
  assert.ok(WORLDS.length >= 5, WORLDS.map(w => w.id).join(', '));
  for (const w of WORLDS) assert.deepEqual(scanVersion(tour(w)).issues.filter(i => i.level === 'fail'), [], w.id);
});

let browser;
test.after(async () => { if (browser) await browser.close(); });

for (const w of WORLDS) {
  test(`${w.id} ${w.version}: the tour plays in the game frame`, { skip, timeout: 120_000 }, async () => {
    const { chromium } = await import('playwright-core');
    browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const doc = frameDocument(tour(w), { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: w.id }, save: {}, canSave: false });
    const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
    const outside = [];
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
      if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
      const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
      const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
      if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
      outside.push(u); return route.abort();
    });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    await p.goto(HOST + '/');
    const frame = p.frames().find(f => f.url() === HOST + '/frame');
    await frame.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
    const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes', w.id, w.version, 'theme.json'), 'utf8'));
    assert.equal(await frame.evaluate(() => __tour.heroes), theme.heroes.length);
    await p.waitForTimeout(1200);
    if (process.env.K2_SHOTS) await p.screenshot({ path: path.join(process.env.K2_SHOTS, `tour-${w.id}.png`) });
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    await ctx.close();
  });
}
