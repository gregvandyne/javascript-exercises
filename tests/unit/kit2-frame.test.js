// Kit 2 in the real game frame (frameDocument + the frame CSP + the sandbox attribute, in Chromium): a game using the
// pinned Kit 2 import map can load the Three.js add-ons, theme models and theme sounds from our own /vendor paths, and
// NOTHING else: not another /vendor folder by fetch, not another host, not an image elsewhere, and no WebAssembly.
// docs/kit2-themes-plan.md, stage 2. Needs a local Chromium; skipped when there is none.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { kit2ImportMap, phaserTag } = await import('../../server/services/vendor.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const HOST = 'http://game.invalid';
const T = '/vendor/themes/sky-islands/1.0.1/';

const GAME3D = `<title>K2</title>${kit2ImportMap()}<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const R = window.__R = { done: false };
const ok = p => p.then(() => true, () => false);
const L = new GLTFLoader();
const F = url => new Promise((res, rej) => new THREE.FileLoader().setResponseType('arraybuffer').load(url, res, undefined, rej));
const img = url => new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = url; });
(async () => {
  try {
    const hero = await L.loadAsync('${T}heroes/knight.glb');
    const moves = await L.loadAsync('${T}heroes/moves.glb');
    const h = SkeletonUtils.clone(hero.scene);
    const mixer = new THREE.AnimationMixer(h);
    mixer.clipAction(THREE.AnimationClip.findByName(moves.animations, 'Cheer')).play(); mixer.update(0.5);
    R.meshes = 0; h.traverse(o => { if (o.isMesh) R.meshes++; });
    R.clips = moves.animations.length;
    R.sound = (await F('${T}sounds/coin.ogg')).byteLength;
    R.cover = await img('${T}cover.webp');
  } catch (e) { R.loadError = String(e && e.message || e); }
  // WebAssembly stays blocked (no 'wasm-unsafe-eval'): the smallest valid module must fail to compile.
  R.wasm = await ok(WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])));
  // Everything below must be refused by the frame CSP before it reaches the network.
  R.otherVendor = await ok(F('/vendor/three/0.185.1/LICENSE'));
  R.otherPath = await ok(F('/api/me'));
  R.otherHost = await ok(F('http://evil.invalid/x.glb'));
  R.otherImg = await img('http://evil.invalid/x.png');
  R.otherSiteImg = await img('/img/themes/space.webp');
  R.done = true;
})();
</script>`;

const GAME2D = `<title>P</title>${phaserTag()}<div id="g"></div><script>
window.__R = { done: false };
new Phaser.Game({ type: Phaser.CANVAS, width: 64, height: 64, parent: 'g', audio: { noAudio: true }, banner: false,
  scene: { preload() { this.load.image('cover', '${T}cover.webp'); }, create() { window.__R.version = Phaser.VERSION; window.__R.cover = this.textures.exists('cover'); window.__R.done = true; } } });
</script>`;

let browser;
test.after(async () => { if (browser) await browser.close(); });
async function run(gameHtml) {
  const { chromium } = await import('playwright-core');
  if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const doc = frameDocument(gameHtml, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'K' }, save: {}, canSave: false });
  const page = `<!doctype html><meta charset=utf-8><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame" style="width:300px;height:200px"></iframe>`;
  const seen = [];
  await ctx.route('**/*', route => {
    const u = route.request().url(); seen.push(u);
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', webp: 'image/webp' };
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' }, body: fs.readFileSync(f) });
    // Anything the CSP lets through but that is not a Kit 2 file would land here: answer it, so the test sees it succeed.
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'reached' });
  });
  const p = await ctx.newPage();
  await p.goto(HOST + '/', { waitUntil: 'load' });
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__R && window.__R.done, null, { timeout: 45_000 });
  const R = await frame.evaluate(() => window.__R);
  await ctx.close();
  return { R, seen };
}

test('a Kit 2 3D game loads add-ons, theme models and sounds, and nothing else', { skip, timeout: 90_000 }, async () => {
  const { R, seen } = await run(GAME3D);
  assert.equal(R.loadError, undefined);
  assert.ok(R.meshes >= 6, `hero meshes ${R.meshes}`);
  assert.equal(R.clips, 15);
  assert.ok(R.sound > 1000);
  assert.equal(R.cover, true, 'theme pictures load');
  assert.equal(R.wasm, false, 'WebAssembly is still refused');
  assert.equal(R.otherVendor, false, 'fetch outside /vendor/themes/ is refused');
  assert.equal(R.otherPath, false, 'the site API is out of reach');
  assert.equal(R.otherHost, false, 'other hosts are out of reach');
  assert.equal(R.otherImg, false);
  assert.equal(R.otherSiteImg, false, 'site pictures outside /vendor/themes/ are out of reach');
  const outside = seen.filter(u => !u.startsWith(HOST + '/vendor/kit2/') && !u.startsWith(HOST + '/vendor/themes/') && !u.startsWith(HOST + '/vendor/three/') && u !== HOST + '/' && u !== HOST + '/frame');
  assert.deepEqual(outside, [], 'no refused request reached the network');
});

test('a Kit 2 2D game runs Phaser and loads theme pictures', { skip, timeout: 60_000 }, async () => {
  const { R } = await run(GAME2D);
  assert.equal(R.version, '3.90.0');
  assert.equal(R.cover, true);
});
