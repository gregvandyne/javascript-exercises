// Pirate Cove 1.0.0 (docs/decisions.md "Pirate Cove"): the first world built from an uploaded FBX pack (the Kenney
// Pirate Kit, docs/kit2-packs-plan.md).
//   - it builds the same way every time: recipe.json and theme.src.json are exactly what from-def.mjs makes from
//     theme.def.json, theme.json is exactly what manifest.mjs makes from theme.src.json and the built files, and that
//     theme.json is the one in kit2/SHIPPED.json. With the converted pack on the machine (KIT2_RAW_PACKS, see the last
//     test) the models themselves are rebuilt and compared byte for byte;
//   - every piece, hero and sound name in theme.json is a file that exists, and the starter and the tour use only those;
//   - kid-safe: nothing the pack config leaves out (cannons, cannon balls, bottles, the skull-sail ships, the ghost ship)
//     is in the theme, checked by name, by the recipe's sources and inside every built model; one plain black flag at most
//     two; no weapons, no fighting words, no prices;
//   - the scanner accepts the starter and the tour.
// The real-Chromium rounds (two heroes) are in builder-kit2.test.js; the tour in the game frame is in kit2-worlds.test.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/vendor/themes/pirate-cove/1.0.0');
const SRC = path.join(ROOT, 'kit2/themes/pirate-cove');
const read = f => fs.readFileSync(f, 'utf8'), json = f => JSON.parse(read(f));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const manifest = json(path.join(DIR, 'theme.json'));
const def = json(path.join(SRC, 'theme.def.json')), recipe = json(path.join(SRC, 'recipe.json'));
const pack = json(path.join(ROOT, 'kit2/packs/pirate-kit.json'));
const run = (...args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pirate-cove-'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
// What the Kenney Pirate Kit calls each model the kit config leaves out, and anything else that must never be in a cove.
const LEFT_OUT = /cannon|bottle|ship-pirate|ship-ghost|ghost|skull|rum\b/i;
const excludedByPack = name => Object.keys(pack.exclude).some(k => new RegExp(`^(?:${k})$`).test(name));

test('the definition builds the same recipe and catalogue every time', () => {
  // from-def.mjs writes beside the definition, so it runs on a copy. Sizes are measured by build-theme.mjs (they are
  // in theme.src.json already); everything else in both files must come out of the definition unchanged.
  const t = tmp();
  fs.copyFileSync(path.join(SRC, 'theme.def.json'), path.join(t, 'theme.def.json'));
  run(path.join(ROOT, 'kit2/pipeline/from-def.mjs'), path.join(t, 'theme.def.json'));
  assert.equal(read(path.join(t, 'recipe.json')), read(path.join(SRC, 'recipe.json')), 'recipe.json is what from-def.mjs makes');
  const bare = o => ({ ...o, heroes: o.heroes.map(({ size, ...h }) => h), pieces: o.pieces.map(({ size, note, ...p }) => ({ ...p, ...(note && !/^Its base is/.test(note) ? { note: note.replace(/ Its base is .*$/, '') } : {}) })) });
  assert.deepEqual(bare(json(path.join(SRC, 'theme.src.json'))), bare(json(path.join(t, 'theme.src.json'))), 'theme.src.json is what from-def.mjs makes (sizes aside)');
  for (const p of json(path.join(SRC, 'theme.src.json')).pieces) assert.ok(Array.isArray(p.size) && p.size.length === 3 && p.size.every(n => n > 0), `${p.id} has its measured size`);
  fs.rmSync(t, { recursive: true });
});

test('theme.json is the manifest of the built files, and it is the locked one', () => {
  const t = tmp(), copy = path.join(t, '1.0.0');
  fs.cpSync(DIR, copy, { recursive: true }); fs.rmSync(path.join(copy, 'theme.json'));
  run(path.join(ROOT, 'kit2/pipeline/manifest.mjs'), path.join(SRC, 'theme.src.json'), copy);
  assert.equal(read(path.join(copy, 'theme.json')), read(path.join(DIR, 'theme.json')), 'theme.json is what manifest.mjs makes');
  fs.rmSync(t, { recursive: true });
  const lock = json(path.join(ROOT, 'kit2/SHIPPED.json'));
  assert.equal(lock.themes['pirate-cove/1.0.0'], sri(fs.readFileSync(path.join(DIR, 'theme.json'))), 'the lock holds this theme.json');
  for (const [f, v] of Object.entries(manifest.files)) assert.equal(sri(fs.readFileSync(path.join(DIR, f))), v.sha384, f);
});

test('every name in theme.json is a file that exists: 62 pieces, the five adventurers, six sounds', () => {
  assert.equal(manifest.pieces.length, 62); assert.equal(manifest.sounds.length, 6);
  assert.deepEqual(manifest.heroes.map(h => h.id), ['barbarian', 'knight', 'mage', 'rogue', 'rogue-hooded'], 'the five adventurers (docs/kit2-packs-plan.md: new worlds carry five heroes)');
  for (const list of [manifest.heroes, manifest.pieces, manifest.sounds, [manifest.moves]]) {
    const ids = new Set();
    for (const it of list) {
      assert.ok(fs.statSync(path.join(DIR, it.file)).size > 100, it.file);
      if (it.id) { assert.ok(!ids.has(it.id), `${it.id} once`); ids.add(it.id); }
    }
  }
  for (const p of manifest.pieces) { assert.match(p.id, /^[a-z][a-z0-9-]*$/); assert.ok(p.tags.length, p.id); }
  // the heroes and their moves are the bytes every other world has (one download in a browser's cache per file name)
  const cq = path.join(ROOT, 'public/vendor/themes/castle-quest/1.0.0');
  for (const f of [...manifest.heroes.map(h => h.file), manifest.moves.file]) assert.ok(fs.readFileSync(path.join(DIR, f)).equals(fs.readFileSync(path.join(cq, f))), f);
  // what a playable world needs
  const tagged = t => manifest.pieces.filter(p => p.tags.includes(t)).map(p => p.id);
  assert.ok(tagged('ground').length >= 1 && tagged('platform').length >= 6 && tagged('goal').includes('chest') && tagged('coin').includes('coin') && tagged('checkpoint').length >= 1);
  assert.ok(tagged('afloat').length >= 5, 'ships and boats for the sea');
  assert.deepEqual(manifest.look.water, { y: -1.5, color: '#0077c8' });
  assert.ok(manifest.firstLoadBytes < 3.2 * 1024 * 1024, `${(manifest.firstLoadBytes / 1048576).toFixed(2)} MB: well under the 5 MB limit`);
});

test('the starter layout and the tour use only this world\'s pieces', async () => {
  const K = await import('../../server/builder/kit2.js');
  const ids = new Set(manifest.pieces.map(p => p.id)), lay = K.STARTERS['pirate-cove'];
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad, lay.goal, lay.landmark, ...lay.scenery, ...lay.afloat]) assert.ok(ids.has(id), id);
  for (const [id] of [lay.ground, lay.step, lay.pad]) assert.ok(manifest.pieces.find(p => p.id === id).tags.includes('platform'), `${id} is something to stand on`);
  for (const [id] of lay.afloat) assert.ok(manifest.pieces.find(p => p.id === id).tags.includes('afloat'), `${id} floats`);
  assert.equal(lay.seaY, manifest.look.water.y); assert.equal(lay.sea, manifest.look.water.color);
  // the islands and docks the hero walks on stand in the sea: thicker than the water is deep below their tops
  for (const [id, scale] of [lay.ground, lay.side, lay.step, lay.pad]) assert.ok(manifest.pieces.find(p => p.id === id).size[1] * scale > -lay.seaY + 0.5, `${id} reaches the water`);
  const { scanVersion } = await import('../../server/services/scanner.js');
  const V = await import('../../server/services/vendor.js');
  for (const hero of ['barbarian', 'mage']) {
    const html = K.kit2Starter({ world: 'pirate-cove', hero });
    const r = scanVersion(html);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues)); assert.deepEqual(r.lint, []);
    assert.deepEqual(K.kit2Of(html), { world: 'pirate-cove', version: '1.0.0', hero });
  }
  const tour = read(path.join(ROOT, 'kit2/demo/theme-tour.html')).replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", "'pirate-cove'").replace("'THEME_VERSION'", "'1.0.0'").replace("'THEME_TIME'", "'day'");
  assert.deepEqual(scanVersion(tour).issues.filter(i => i.level === 'fail'), []);
  // a version that never shipped is still refused
  assert.equal(scanVersion(K.kit2Starter({ world: 'pirate-cove' }).replace("version: '1.0.0'", "version: '1.0.9'")).status, 'fail');
});

test('kid-safe: nothing left out of the pack is in the theme (by name, by source, and inside every built model)', () => {
  // by name: the catalogue, the files on disk and the committed sources
  for (const p of manifest.pieces) { assert.doesNotMatch(p.id, LEFT_OUT, p.id); assert.doesNotMatch(p.file, LEFT_OUT, p.file); }
  const onDisk = walk(DIR).map(f => path.relative(DIR, f).split(path.sep).join('/'));
  for (const f of onDisk) assert.doesNotMatch(f, LEFT_OUT, f);
  // by source: every model built from the pirate kit is one the pack config keeps
  const fromKit = recipe.models.filter(m => m.from.startsWith('pirate-kit/'));
  assert.equal(fromKit.length, 61, '59 of the kit\'s models, two of them (the sand and grass patches) used twice');
  for (const m of fromKit) { const name = path.basename(m.from, '.glb'); assert.ok(!excludedByPack(name), `${name} is left out by kit2/packs/pirate-kit.json`); assert.doesNotMatch(name, LEFT_OUT); }
  assert.ok(excludedByPack('cannon') && excludedByPack('cannon-mobile') && excludedByPack('cannon-ball') && excludedByPack('bottle') && excludedByPack('bottle-large') && excludedByPack('crate-bottles') && excludedByPack('ship-pirate-large') && excludedByPack('ship-ghost'), 'the pack config still leaves them all out');
  // the built GLB list is exactly the catalogue: no model rides along unlisted
  const glbs = onDisk.filter(f => f.endsWith('.glb')).sort();
  assert.deepEqual(glbs, [...manifest.heroes.map(h => h.file), manifest.moves.file, ...manifest.pieces.map(p => p.file)].sort());
  assert.equal(glbs.length, 68);
  // inside every built model: no node, mesh, material, picture or clip is named after a left-out model, and no model
  // has a clip that is not listed here
  const clips = {};
  for (const f of glbs.filter(f => !f.startsWith('heroes/'))) {
    const buf = fs.readFileSync(path.join(DIR, f)), len = buf.readUInt32LE(12);
    assert.equal(buf.toString('latin1', 16, 20), 'JSON', f);
    const g = JSON.parse(buf.toString('utf8', 20, 20 + len));
    for (const kind of ['nodes', 'meshes', 'materials', 'images', 'textures', 'animations', 'scenes']) for (const x of g[kind] || []) if (x.name) assert.doesNotMatch(x.name, LEFT_OUT, `${f}: ${kind} "${x.name}"`);
    if ((g.animations || []).length) clips[f] = g.animations.map(a => a.name).sort();
  }
  assert.deepEqual(clips, { 'props/chest.glb': ['close', 'open'] }, 'only the chest moves (its lid: for a later Oomba3D)');
  // flags: cream ones, and one plain black flag at the very most two
  const black = fromKit.filter(m => /flag-pirate/.test(m.from));
  assert.ok(black.length <= 2 && black.length < fromKit.filter(m => /\/flag(-high)?(-pennant)?\.glb$/.test(m.from)).length, 'more cream flags than black ones');
  // words: a treasure-map and sailing world, nothing about weapons, fighting, enemies or money
  const words = JSON.stringify([manifest.name, manifest.description, manifest.goodFor, manifest.units, manifest.pieces.map(p => [p.id, p.tags, p.note || ''])]);
  assert.doesNotMatch(words, /weapon|sword|gun|fight|battle|attack|enem(y|ies)|\bbuy|\bsell|\bprice|\bshop|\bmoney|loot|plunder|steal|rum\b/i);
});

// The models themselves, rebuilt from the converted pack and compared byte for byte. The pack is not in this
// repository (raw packs never are: kit2/README.md), so this runs only where it is: KIT2_RAW_PACKS=<fbx-to-glb.mjs output>
// KIT2_PACKS=<the uploaded packs, for the colour map> KIT2_TOOLS=<folder with the pipeline and its packages installed>.
const E = process.env, canRebuild = E.KIT2_RAW_PACKS && E.KIT2_PACKS && E.KIT2_TOOLS;
test('the models rebuild to the same bytes from the converted pack', { skip: canRebuild ? false : 'needs the converted pack (KIT2_RAW_PACKS, KIT2_PACKS, KIT2_TOOLS)' }, () => {
  const t = tmp();
  for (const f of fs.readdirSync(path.join(ROOT, 'kit2/pipeline'))) fs.copyFileSync(path.join(ROOT, 'kit2/pipeline', f), path.join(E.KIT2_TOOLS, f));
  const r = spawnSync(process.execPath, [path.join(E.KIT2_TOOLS, 'build-theme.mjs'), path.join(SRC, 'recipe.json'), E.KIT2_RAW_PACKS, path.join(t, 'out'), path.join(t, 'sizes.json'), E.KIT2_PACKS], { cwd: E.KIT2_TOOLS, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const built = walk(path.join(t, 'out')).map(f => path.relative(path.join(t, 'out'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(built, Object.keys(manifest.files).filter(f => /\.(glb|ogg)$/.test(f)).sort());
  for (const f of built) assert.equal(sri(fs.readFileSync(path.join(t, 'out', f))), manifest.files[f].sha384, f);
  fs.rmSync(t, { recursive: true });
});
