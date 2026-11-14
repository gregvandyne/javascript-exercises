// Kit 2 themes (public/vendor/themes/<theme>/<version>/): every file is listed in theme.json with its size and hash, every
// pack is CC0 with its licence file on hand, every hero, piece and sound comes from a listed pack, the source log is there,
// and a theme's first load stays under 5 MB (docs/kit2-themes-plan.md, "Rules that do not bend").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const THEMES = path.join(ROOT, 'public/vendor/themes');
const FIRST_LOAD_LIMIT = 5 * 1024 * 1024;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const versions = fs.existsSync(THEMES)
  ? fs.readdirSync(THEMES).flatMap(t => fs.readdirSync(path.join(THEMES, t)).map(v => ({ theme: t, version: v, dir: path.join(THEMES, t, v) })))
  : [];

test('at least the Sky Islands theme is built', () => {
  assert.ok(versions.some(v => v.theme === 'sky-islands' && v.version === '1.0.0'));
});

for (const { theme, version, dir } of versions) {
  const name = `${theme} ${version}`;
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8'));

  test(`${name}: theme.json names its folder`, () => {
    assert.equal(manifest.id, theme);
    assert.equal(manifest.version, version);
    assert.match(version, /^\d+\.\d+\.\d+$/);
    assert.ok(['three', 'phaser'].includes(manifest.engine), 'engine is three or phaser');
    assert.ok(manifest.name && manifest.description, 'name and one-line description for the picker');
    assert.ok(manifest.files[manifest.cover], 'cover picture is one of its files');
  });

  test(`${name}: every file is listed with its size and hash, and nothing else is listed`, () => {
    const onDisk = walk(dir).map(f => path.relative(dir, f).split(path.sep).join('/')).filter(f => f !== 'theme.json').sort();
    assert.deepEqual(Object.keys(manifest.files).sort(), onDisk);
    for (const f of onDisk) {
      const buf = fs.readFileSync(path.join(dir, f));
      assert.equal(manifest.files[f].bytes, buf.length, `${f} size`);
      assert.equal(manifest.files[f].sha384, 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64'), `${f} hash`);
    }
  });

  test(`${name}: every pack is CC0 with its licence file and source`, () => {
    assert.ok(manifest.packs.length > 0);
    for (const p of manifest.packs) {
      assert.equal(p.licence, 'CC0-1.0', `${p.id} licence`);
      assert.ok(manifest.files[p.licenceFile], `${p.id} licence file ${p.licenceFile}`);
      assert.match(fs.readFileSync(path.join(dir, p.licenceFile), 'utf8'), /CC0|Creative Commons Zero|publicdomain\/zero/i, `${p.id} licence text`);
      assert.match(p.url, /^https:\/\//, `${p.id} source`);
      assert.match(p.downloaded, /^\d{4}-\d{2}-\d{2}$/, `${p.id} download date`);
    }
    assert.ok(manifest.files['SOURCES.md'], 'SOURCES.md source log');
  });

  test(`${name}: every hero, creature, piece and sound is one of its files, from a listed pack`, () => {
    const packs = new Set(manifest.packs.map(p => p.id));
    const items = [...(manifest.heroes || []), ...(manifest.creatures || []), ...(manifest.pieces || []), ...(manifest.sounds || []), ...(manifest.moves ? [manifest.moves] : [])];
    assert.ok(items.length > 0);
    const ids = new Set();
    for (const it of items) {
      assert.ok(manifest.files[it.file], `${it.file} is a file of the theme`);
      assert.ok(packs.has(it.pack), `${it.file} comes from a listed pack`);
      if (it.id) { assert.ok(!ids.has(`${it.file}:${it.id}`)); ids.add(`${it.file}:${it.id}`); }
    }
    // Every model and sound the theme ships is in the catalogue (nothing unlisted, nothing unchecked).
    const catalogued = new Set(items.map(i => i.file));
    for (const f of Object.keys(manifest.files)) if (/\.(glb|gltf|ogg|mp3|wav|png)$/.test(f)) assert.ok(catalogued.has(f), `${f} is in the catalogue`);
  });

  test(`${name}: first load is under 5 MB`, () => {
    const loaded = Object.entries(manifest.files).filter(([f]) => /\.(glb|gltf|ogg|mp3|wav|png)$/.test(f)).reduce((s, [, v]) => s + v.bytes, 0);
    assert.equal(manifest.firstLoadBytes, loaded);
    assert.ok(loaded < FIRST_LOAD_LIMIT, `${(loaded / 1048576).toFixed(2)} MB`);
  });

  test(`${name}: models are binary glTF`, () => {
    for (const f of Object.keys(manifest.files).filter(f => f.endsWith('.glb'))) {
      assert.equal(fs.readFileSync(path.join(dir, f)).subarray(0, 4).toString('latin1'), 'glTF', f);
    }
  });

}
