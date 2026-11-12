// Oomba3D (public/vendor/kit2/oomba3d/<version>/oomba3d.js, docs/kit2-api.md): the docs and the code list the same API,
// and the Sky Islands demo built on it (kit2/demo/sky-islands.html) plays in the real game frame (frameDocument + the
// frame CSP + the sandbox, in Chromium): pick a hero, walk, collect a coin, land on the right answer, cheer at the flag.
// Needs a local Chromium for the play test; skipped when there is none. K2_SHOTS=<dir> saves screenshots there.
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
const LIB = fs.readFileSync(path.join(ROOT, 'public', V.OOMBA3D_MODULE), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, 'docs/kit2-api.md'), 'utf8');
const API = JSON.parse(/export const API = (\[[^\]]*\]);/.exec(LIB)[1].replace(/'/g, '"'));
const DEMO = fs.readFileSync(path.join(ROOT, 'kit2/demo/sky-islands.html'), 'utf8').replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap());
const HOST = 'http://game.invalid';

test('docs/kit2-api.md documents exactly the API the library exports, and names its version', () => {
  const documented = new Set([...DOC.matchAll(/^### `g\.([a-zA-Z.]+)\(/gm)].map(m => m[1]));
  assert.deepEqual([...documented].sort(), [...API].sort(), 'every API name has a "### `g.name(`" section, and nothing else does');
  assert.match(DOC, new RegExp(`Oomba3D ${V.OOMBA3D_VERSION.replace(/\./g, '\\.')}`));
  // Every API name is really on the returned game object.
  const ret = /return \{\n\s+THREE,[\s\S]*?\n\s+hero, world: \{ ([^}]+) \}, ([^\n]+),\n\s+\};/.exec(LIB);
  assert.ok(ret, 'the game object literal');
  const names = ['hero', ...ret[1].split(',').map(s => 'world.' + s.trim()), ...ret[2].split(',').map(s => s.trim())];
  assert.deepEqual(names.sort(), [...API].sort());
});

test('the demo is a short game the scanner passes', () => {
  const code = /<script type="module">([\s\S]*?)<\/script>/.exec(DEMO)[1];
  assert.ok(code.split('\n').length < 150, 'under 150 lines (the plan\'s bar for the library)');
  const fails = scanVersion(DEMO).issues.filter(i => i.level === 'fail');
  assert.deepEqual(fails, []);
});

let browser;
test.after(async () => { if (browser) await browser.close(); });

test('the Sky Islands demo plays in the game frame: walk, coin, right answer, cheer at the flag', { skip, timeout: 120_000 }, async () => {
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const doc = frameDocument(DEMO, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Sky Islands' }, save: {}, canSave: false });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const consoleErrors = []; p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
  const shots = process.env.K2_SHOTS;
  await p.waitForTimeout(800);
  if (shots) await p.screenshot({ path: path.join(shots, 'o3-1-title.png') });
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('.pick button')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger']);

  await frame.click('text=Wizard');
  await frame.waitForFunction(() => !!window.__game, null, { timeout: 20_000 });
  await frame.waitForFunction(() => document.querySelectorAll('canvas').length && window.__game.g.scene.children.filter(o => o.isSprite).length === 3, null, { timeout: 20_000 });
  await p.waitForTimeout(600);
  const z0 = await frame.evaluate(() => __game.me.position.z);
  // Each step waits for what it checks (not a fixed time), so a busy machine only makes it slower.
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 20_000 });
  await p.keyboard.down('ArrowUp'); await until(z => __game.me.position.z < z - 1, z0); await p.keyboard.up('ArrowUp');

  // Drop onto the first stepping island under its coin: the coin is collected.
  await frame.evaluate(() => { __game.me.position.set(0, 4, -11); });
  await until(() => __game.g.score() === 1);
  if (shots) await p.screenshot({ path: path.join(shots, 'o3-2-run.png') });

  // A wrong answer sinks its island; the right one gives +5.
  await frame.evaluate(() => { __game.me.position.set(-8, 7, -38); });
  await until(() => document.querySelector('.o3-toast').textContent.startsWith('Not 54'));
  assert.equal(await frame.evaluate(() => __game.answered()), false);
  await frame.evaluate(() => { __game.me.position.set(0, 7, -38); });
  await until(() => __game.answered());
  assert.equal(await frame.evaluate(() => __game.g.score()), 6);
  if (shots) await p.screenshot({ path: path.join(shots, 'o3-3-answer.png') });

  await frame.evaluate(() => { __game.me.position.set(0, 8, -51); });
  await until(() => !!__game.goal.cheered);
  assert.match(await frame.evaluate(() => document.querySelector('.o3-toast').textContent), /You did it!/);
  if (shots) await p.screenshot({ path: path.join(shots, 'o3-4-goal.png') });

  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, [], 'no console errors (a texture the CSP blocks shows up here)');
  assert.deepEqual(outside, [], 'the game asked for nothing outside /vendor');
  await ctx.close();
});
