// Kit 2 themes (public/vendor/themes/<theme>/<version>/): every file is listed in theme.json with its size and hash, every
// pack is CC0 (or one of the few named restricted licences) with its licence file on hand, every hero, piece and sound comes from a listed pack, the source log is there,
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

// Licences that are not CC0 but may ship inside a built theme (docs/kit2-packs-plan.md "Licences", docs/decisions.md
// "Under the Sea"): use in games and modification allowed, redistribution of the files as assets forbidden. Each is
// named here with words only its own licence text has; anything else that is not CC0 fails.
const RESTRICTED = {
  'LicenseRef-reodesuxz': [/Copyright \(c\) 2026 reodesuxz/, /redistributing the asset files/i],
  'LicenseRef-muteassets-sea-life': [/Low Poly Sea Life/, /sell, give away or share the assets themselves/],
  'LicenseRef-aletheiamask-standard-asset': [/STANDARD ASSET LICENSE/, /aletheiamask/, /resell, redistribute, sublicense or share the source files/],
  'LicenseRef-free-fish-sampler-1.1': [/Free Fish Sampler - LICENSE/, /Version 1\.1/, /Resell, redistribute, sublicense or share the raw files/],
  'LicenseRef-alstra-free-asset': [/ALSTRA INFINITE/, /with credit/, /Reselling or redistribution is not allowed/],
  'LicenseRef-theunseenvulga-ocean-animals': [/THEUNSEENVULGA/, /do not resell the unmodified\s+assets as-is/],
};

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

  test(`${name}: every pack is CC0 or one of the named restricted licences, with its licence file and source`, () => {
    assert.ok(manifest.packs.length > 0);
    const sources = manifest.files['SOURCES.md'] ? fs.readFileSync(path.join(dir, 'SOURCES.md'), 'utf8') : '';
    for (const p of manifest.packs) {
      assert.ok(manifest.files[p.licenceFile], `${p.id} licence file ${p.licenceFile}`);
      const text = fs.readFileSync(path.join(dir, p.licenceFile), 'utf8');
      assert.match(p.downloaded, /^\d{4}-\d{2}-\d{2}$/, `${p.id} download date`);
      if (p.licence === 'CC0-1.0') {
        assert.match(text, /CC0|Creative Commons Zero|publicdomain\/zero/i, `${p.id} licence text`);
        assert.match(p.url, /^https:\/\//, `${p.id} source`);
        continue;
      }
      // Not CC0: only these licences, each by name, each with ITS OWN licence text in the theme. Such a pack says it may
      // not be passed on as files (redistribute: false), carries a credit, and says where it came from (a page, or the
      // upload it arrived in). One that requires credit is credited in SOURCES.md too.
      const mark = RESTRICTED[p.licence];
      assert.ok(mark, `${p.id}: ${p.licence} is not CC0 and not one of the named restricted licences`);
      for (const re of mark) assert.match(text, re, `${p.id} licence text is the ${p.licence} text`);
      assert.equal(p.redistribute, false, `${p.id}: marked as never to be redistributed as files`);
      assert.ok(typeof p.credit === 'string' && p.credit.includes(p.author), `${p.id} credit names ${p.author}`);
      assert.ok(/^https:\/\//.test(p.url || '') || /branch asset-packs, folder [a-z0-9-]+\//.test(p.source || ''), `${p.id} source`);
      assert.match(p.commit, /^[0-9a-f]{40}$/, `${p.id}: the commit of the upload`);
      assert.ok(sources.includes(p.author), `${p.id}: ${p.author} is named in SOURCES.md`);
      assert.match(sources, /NOT CC0/, 'SOURCES.md says the world is not all CC0');
      if (/with credit/i.test(text)) { assert.equal(p.creditRequired, true, `${p.id}: credit is required`); assert.match(sources, new RegExp(`${p.author} \\(required\\)`), `${p.id}: the required credit is in SOURCES.md`); }
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
