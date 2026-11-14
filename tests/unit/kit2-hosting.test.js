// Kit 2 engines and hosting (docs/kit2-themes-plan.md, stage 2): kit2/SHIPPED.json pins every file under
// public/vendor/kit2/ and every theme version, the frame CSP opens exactly /vendor/kit2/ (scripts) and /vendor/themes/
// (fetch, images, sound) on our own origin (WebAssembly yes; still no eval or workers), and the scanner accepts only the
// pinned Kit 2 import map and Phaser tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = await import('../../server/services/vendor.js');
const { frameCsp, FRAME_CSP } = await import('../../server/services/frame.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const sri = f => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/SHIPPED.json'), 'utf8'));

test('every file under public/vendor/kit2 is in the lock with the same bytes, and every locked file exists', () => {
  const dir = path.join(ROOT, 'public/vendor/kit2');
  const onDisk = walk(dir).map(f => path.relative(dir, f).split(path.sep).join('/')).sort();
  assert.deepEqual(onDisk, Object.keys(lock.engines).sort());
  for (const rel of onDisk) assert.equal(sri(path.join(dir, rel)), lock.engines[rel], `${rel} changed after it shipped: ship a new version instead`);
});

test('every theme version is in the lock, and its theme.json never changes', () => {
  const dir = path.join(ROOT, 'public/vendor/themes');
  const versions = fs.readdirSync(dir).flatMap(t => fs.readdirSync(path.join(dir, t)).map(v => `${t}/${v}`)).sort();
  assert.deepEqual(versions, Object.keys(lock.themes).sort());
  for (const tv of versions) assert.equal(sri(path.join(dir, tv, 'theme.json')), lock.themes[tv], `${tv} changed after it shipped`);
});

test('every engine keeps its licence beside it', () => {
  for (const eng of ['three-addons/0.185.1', 'phaser/3.90.0', 'oomba3d/1.0.0', 'oomba3d/1.1.0', 'rapier/0.21.0']) assert.ok(Object.keys(lock.engines).some(f => f.startsWith(eng + '/') && /^LICENSE/.test(f.slice(eng.length + 1))), eng);
});

test('the Kit 2 import map pins Three.js, every add-on, Rapier and Oomba3D', () => {
  const m = V.KIT2_IMPORT_MAP;
  assert.deepEqual(m.imports, { three: V.THREE_MODULE, 'three/addons/': V.KIT2_ADDONS_DIR, '@dimforge/rapier3d-compat': V.RAPIER_MODULE, oomba3d: V.OOMBA3D_MODULE });
  assert.equal(m.integrity[V.OOMBA3D_MODULE], lock.engines[`oomba3d/${V.OOMBA3D_VERSION}/oomba3d.js`]);
  assert.equal(m.integrity[V.RAPIER_MODULE], lock.engines['rapier/0.21.0/rapier.mjs']);
  for (const f of Object.keys(lock.engines).filter(f => f.startsWith('three-addons/') && f.endsWith('.js'))) assert.equal(m.integrity['/vendor/kit2/' + f], lock.engines[f], f);
  assert.equal(m.integrity[V.THREE_MODULE], V.THREE_SRI[V.THREE_MODULE]);
});

test('frame CSP: Kit 2 scripts, and theme art only from /vendor/themes/ on our own origin', () => {
  const csp = frameCsp('https://oomba.ai');
  const dir = n => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '').split(/\s+/).slice(1);
  assert.ok(dir('script-src').includes('https://oomba.ai/vendor/kit2/'));
  assert.ok(dir('script-src').includes("'wasm-unsafe-eval'"), 'WebAssembly (Rapier, the meshopt decoder)');
  assert.ok(!dir('script-src').includes("'unsafe-eval'"), 'never eval or new Function');
  assert.ok(!/worker-src/.test(csp), 'no workers');
  assert.deepEqual(dir('connect-src'), ['blob:', 'https://oomba.ai/vendor/themes/']);
  assert.deepEqual(dir('img-src'), ['data:', 'blob:', 'https://oomba.ai/vendor/themes/', 'https://oomba.ai/vendor/art2d/']);   // the 2D art packs' pictures (art2d.js)
  assert.deepEqual(dir('media-src'), ['data:', 'blob:', 'https://oomba.ai/vendor/themes/']);
  // With no origin known, nothing is reachable.
  assert.match(FRAME_CSP, /connect-src 'none'/);
});

const KIT2_GAME = `<title>t</title>${V.kit2ImportMap()}<canvas></canvas><script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
new GLTFLoader().load('/vendor/themes/sky-islands/1.0.1/heroes/knight.glb', g => {});
</script>`;
const codes = html => scanVersion(html).issues.filter(i => i.level === 'fail').map(i => i.code);

test('scanner: the pinned Kit 2 import map, add-ons and a shipped theme pass', () => {
  assert.deepEqual(codes(KIT2_GAME), []);
});

test('scanner: Phaser only with the exact tag', () => {
  const ok = `<title>p</title>${V.phaserTag()}<script>new Phaser.Game({});</script>`;
  assert.deepEqual(codes(ok), []);
  assert.ok(codes(ok.replace(V.PHASER_SRI, 'sha384-AAAA')).includes('kit2_pin'));
  assert.ok(codes(`<title>p</title><script src="/vendor/kit2/phaser/3.90.0/phaser.min.js"></script>`).includes('kit2_pin'));
  assert.ok(codes(`<title>p</title><script src="/vendor/kit2/three-addons/0.185.1/loaders/GLTFLoader.js"></script>`).includes('kit2_pin'));
});

test('scanner: a changed Kit 2 map, add-ons without it, and unknown themes fail', () => {
  const changed = KIT2_GAME.replace(V.KIT2_ADDONS_DIR + '"', V.KIT2_ADDONS_DIR + '../"');
  assert.notEqual(changed, KIT2_GAME);
  assert.ok(codes(changed).some(c => c === 'three_pin' || c === 'kit2_pin'));
  const noSri = KIT2_GAME.replace(/,\s*"\/vendor\/kit2\/three-addons\/0\.185\.1\/loaders\/GLTFLoader\.js":\s*"[^"]+"/, '');
  assert.notEqual(noSri, KIT2_GAME);
  assert.ok(codes(noSri).length > 0, 'an add-on without its integrity line fails');
  const plainMap = `<title>t</title>${V.threeImportMap()}<script type="module">import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';</script>`;
  assert.ok(codes(plainMap).includes('three_pin'));
  assert.ok(codes(KIT2_GAME.replace('sky-islands/1.0.1', 'sky-islands/9.9.9')).includes('kit2_theme'));
  assert.ok(codes(KIT2_GAME.replace('sky-islands/1.0.1/heroes', 'sky-islands/../../three')).includes('kit2_theme'));
});

test('screenshots answer Kit 2 files from disk, and nothing outside those folders', () => {
  const H = 'http://game.invalid';
  assert.ok(vendorFile(`${H}/vendor/kit2/three-addons/0.185.1/loaders/GLTFLoader.js`));
  assert.ok(vendorFile(`${H}/vendor/kit2/phaser/3.90.0/phaser.min.js`));
  assert.ok(vendorFile(`${H}/vendor/themes/sky-islands/1.0.1/heroes/knight.glb`));
  assert.equal(vendorFile(`${H}/vendor/themes/sky-islands/1.0.0/nope.glb`), null);
  assert.equal(vendorFile(`${H}/vendor/themes/sky-islands/../../../server/config.js`), null);
  assert.equal(vendorFile(`${H}/vendor/themes/sky-islands/1.0.0/..%2f..%2fx`), null);
  assert.equal(vendorFile(`${H}/vendor/kit2/x`), null);
});

test('the production image carries the Kit 2 lock (vendor.js reads it at start)', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8'), /^COPY kit2\/SHIPPED\.json \.\/kit2\/SHIPPED\.json$/m);
  assert.ok(V.PHASER_SRI && Object.keys(V.KIT2_IMPORT_MAP.integrity).length > 2, 'the lock was read');
});
