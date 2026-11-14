// Wild Woods 1.0.0 (docs/decisions.md "Wild Woods"): a nature world built from two uploaded FBX packs (the Kenney Nature
// Kit and the Quaternius Ultimate Nature Pack, docs/kit2-packs-plan.md), the same way as Pirate Cove.
//   - it builds the same way every time: recipe.json and theme.src.json are exactly what from-def.mjs makes from
//     theme.def.json, theme.json is exactly what manifest.mjs makes from theme.src.json and the built files, and that
//     theme.json is the one in kit2/SHIPPED.json. With the converted packs on the machine (KIT2_RAW_PACKS, see the last
//     test) the models themselves are rebuilt and compared byte for byte;
//   - every piece, hero and sound name in theme.json is a file that exists, and the starter and the tour use only those;
//   - only the two CC0 nature packs (and the pieces every theme reuses) are in it: nothing from a pack that is not cleared;
//   - kid-safe: nothing the pack configs leave out (bare dead trees, snow, cacti, palms, crops, statues) is in the theme,
//     checked by name, by the recipe's sources and inside every built model; no weapons, traps, skulls or bones; no
//     fighting or hunting words; the campfire has no flames;
//   - every material of the two packs has its colour from the theme's palette (the packs carry no pictures);
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
const DIR = path.join(ROOT, 'public/vendor/themes/wild-woods/1.0.0');
const SRC = path.join(ROOT, 'kit2/themes/wild-woods');
const read = f => fs.readFileSync(f, 'utf8'), json = f => JSON.parse(read(f));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const manifest = json(path.join(DIR, 'theme.json'));
const def = json(path.join(SRC, 'theme.def.json')), recipe = json(path.join(SRC, 'recipe.json'));
const PACKS = { 'kenney-nature-kit': json(path.join(ROOT, 'kit2/packs/kenney-nature-kit.json')), 'quaternius-ultimate-nature': json(path.join(ROOT, 'kit2/packs/quaternius-ultimate-nature.json')) };
const run = (...args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wild-woods-'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
// What the two packs call the models their configs leave out, and anything else that must never be in a kind wood.
const LEFT_OUT = /dead|snow|cactus|palm|statue|crops?[_-]|skull|\bbones?\b|\btraps?\b|\baxes?\b|\bguns?\b|weapon|sword|knife|spear|\bbow\b|arrow/i;
const excludedBy = (pack, name) => Object.keys(pack.exclude).some(k => new RegExp(`^(?:${k})$`).test(name));
const gltf = f => { const buf = fs.readFileSync(path.join(DIR, f)), len = buf.readUInt32LE(12); assert.equal(buf.toString('latin1', 16, 20), 'JSON', f); return JSON.parse(buf.toString('utf8', 20, 20 + len)); };

test('the definition builds the same recipe and catalogue every time', () => {
  // from-def.mjs writes beside the definition, so it runs on a copy. Sizes are measured by build-theme.mjs (they are
  // in theme.src.json already); everything else in both files must come out of the definition unchanged.
  const t = tmp();
  fs.copyFileSync(path.join(SRC, 'theme.def.json'), path.join(t, 'theme.def.json'));
  run(path.join(ROOT, 'kit2/pipeline/from-def.mjs'), path.join(t, 'theme.def.json'));
  assert.equal(read(path.join(t, 'recipe.json')), read(path.join(SRC, 'recipe.json')), 'recipe.json is what from-def.mjs makes');
  const bare = o => ({ ...o, heroes: o.heroes.map(({ size, ...h }) => h), pieces: o.pieces.map(({ size, note, ...p }) => ({ ...p, ...(note && !/^Its base is/.test(note) ? { note: note.replace(/ Its base is .*$/, '') } : {}) })) });
  assert.deepEqual(bare(json(path.join(SRC, 'theme.src.json'))), bare(json(path.join(t, 'theme.src.json'))), 'theme.src.json is what from-def.mjs makes (sizes aside)');
  for (const p of json(path.join(SRC, 'theme.src.json')).pieces) assert.ok(Array.isArray(p.size) && p.size.length === 3 && p.size[0] > 0 && p.size[2] > 0 && p.size[1] >= 0, `${p.id} has its measured size`);
  fs.rmSync(t, { recursive: true });
});

test('theme.json is the manifest of the built files, and it is the locked one', () => {
  const t = tmp(), copy = path.join(t, '1.0.0');
  fs.cpSync(DIR, copy, { recursive: true }); fs.rmSync(path.join(copy, 'theme.json'));
  run(path.join(ROOT, 'kit2/pipeline/manifest.mjs'), path.join(SRC, 'theme.src.json'), copy);
  assert.equal(read(path.join(copy, 'theme.json')), read(path.join(DIR, 'theme.json')), 'theme.json is what manifest.mjs makes');
  fs.rmSync(t, { recursive: true });
  const lock = json(path.join(ROOT, 'kit2/SHIPPED.json'));
  assert.equal(lock.themes['wild-woods/1.0.0'], sri(fs.readFileSync(path.join(DIR, 'theme.json'))), 'the lock holds this theme.json');
  for (const [f, v] of Object.entries(manifest.files)) assert.equal(sri(fs.readFileSync(path.join(DIR, f))), v.sha384, f);
});

test('every name in theme.json is a file that exists: 107 pieces, the five adventurers, six sounds', () => {
  assert.equal(manifest.pieces.length, 107); assert.equal(manifest.sounds.length, 6);
  assert.deepEqual(manifest.heroes.map(h => h.id), ['barbarian', 'knight', 'mage', 'rogue', 'rogue-hooded'], 'the five adventurers Pirate Cove carries (docs/kit2-packs-plan.md: new worlds carry five heroes)');
  assert.deepEqual(manifest.heroes, json(path.join(ROOT, 'public/vendor/themes/pirate-cove/1.0.0/theme.json')).heroes, 'the same heroes, names and files as Pirate Cove');
  assert.equal(manifest.creatures, undefined, 'no animals in this version (they come with a later Oomba3D)');
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
  // what a playable outdoor world needs
  const tagged = t => manifest.pieces.filter(p => p.tags.includes(t)).map(p => p.id);
  assert.ok(tagged('ground').includes('meadow') && tagged('platform').length >= 6 && tagged('goal').includes('tent') && tagged('coin').includes('coin') && tagged('checkpoint').includes('sign'));
  for (const [tag, n] of [['tree', 15], ['rock', 12], ['flower', 6], ['mushroom', 4], ['cliff', 8], ['river', 6], ['path', 6], ['bridge', 2], ['bush', 3], ['log', 3], ['stump', 2], ['fence', 3], ['camp', 5], ['tent', 2], ['campfire', 2], ['sign', 1]]) assert.ok(tagged(tag).length >= n, `${tag}: ${tagged(tag).length}`);
  assert.ok(manifest.pieces.length >= 60 && manifest.pieces.length <= 110, 'a curated set');
  assert.equal(manifest.look.water, undefined, 'the woods stand on land (the starter\'s lake is the starter\'s)');
  assert.ok(manifest.firstLoadBytes < 3 * 1024 * 1024, `${(manifest.firstLoadBytes / 1048576).toFixed(2)} MB: well under the 5 MB limit`);
});

test('only the two CC0 nature packs and what every theme reuses', () => {
  assert.deepEqual(manifest.packs.map(p => p.id).sort(), ['kaykit-adventurers', 'kaykit-dungeon', 'kenney-nature', 'kenney-platformer', 'quaternius-nature']);
  for (const p of manifest.packs) assert.equal(p.licence, 'CC0-1.0', p.id);
  for (const [id, dir] of [['kenney-nature', 'kenney-nature-kit'], ['quaternius-nature', 'quaternius-ultimate-nature']]) {
    assert.equal(PACKS[dir].licence, 'CC0-1.0');
    assert.match(read(path.join(DIR, manifest.packs.find(p => p.id === id).licenceFile)), /CC0|Creative Commons Zero|publicdomain\/zero/i);
  }
  // every model is built from one of the two packs or copied from a shipped theme: never from a pack that is not cleared
  for (const m of recipe.models) assert.match(m.from, /^(kenney-nature-kit|quaternius-ultimate-nature)\/[A-Za-z0-9_]+\.glb$|^theme:castle-quest\/1\.0\.0\//, m.from);
  for (const c of recipe.copy) assert.match(c.from, /^theme:(castle-quest|busy-kitchen)\/1\.0\.0\//, c.from);
  assert.doesNotMatch(JSON.stringify([def, recipe, manifest.packs]), /amir|reodesuxz|megakit|forest-nature-pack/i);
  // needs nothing newer than Oomba3D 1.1.0: no animal list, no meshopt, no flat-shading mark from the inkNormals step
  assert.doesNotMatch(JSON.stringify(recipe), /inkNormals|meshopt|oneDraw/);
});

test('the starter layout and the tour use only this world\'s pieces', async () => {
  const K = await import('../../server/builder/kit2.js');
  const ids = new Set(manifest.pieces.map(p => p.id)), lay = K.STARTERS['wild-woods'], piece = id => manifest.pieces.find(p => p.id === id);
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad, lay.goal, lay.landmark, ...lay.scenery]) assert.ok(ids.has(id), id);
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad]) assert.ok(piece(id).tags.includes('platform'), `${id} is something to stand on`);
  assert.ok(piece(lay.goal[0]).tags.includes('goal'));
  // the starter stands in a lake: what the hero walks on is deeper than the water is below its top
  assert.equal(lay.lake, true); assert.ok(lay.sea && lay.seaY < 0);
  for (const [id, scale] of [lay.ground, lay.side, lay.step, lay.pad]) assert.ok(piece(id).size[1] * scale > -lay.seaY + 0.5, `${id} reaches the water`);
  const { scanVersion } = await import('../../server/services/scanner.js');
  const V = await import('../../server/services/vendor.js');
  for (const hero of ['barbarian', 'rogue']) {
    const html = K.kit2Starter({ world: 'wild-woods', hero });
    const r = scanVersion(html);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues)); assert.deepEqual(r.lint, []);
    assert.deepEqual(K.kit2Of(html), { world: 'wild-woods', version: '1.0.0', hero });
    assert.ok(html.includes(V.kit2ImportMap()), 'on the newest shipped Oomba3D, as every new build');
    assert.doesNotMatch(html, /new Worker|\beval\(|new Function/, 'nothing the frame forbids');
  }
  const tour = read(path.join(ROOT, 'kit2/demo/theme-tour.html')).replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", "'wild-woods'").replace("'THEME_VERSION'", "'1.0.0'").replace("'THEME_TIME'", "'day'");
  assert.deepEqual(scanVersion(tour).issues.filter(i => i.level === 'fail'), []);
  // the tour's stream and bridge are pieces this world has
  assert.ok(manifest.pieces.some(p => p.tags.includes('river') && p.tags.includes('tile')) && manifest.pieces.some(p => p.tags.includes('bridge')));
  // a version that never shipped is still refused
  assert.equal(scanVersion(K.kit2Starter({ world: 'wild-woods' }).replace("version: '1.0.0'", "version: '1.0.9'")).status, 'fail');
});

test('kid-safe: nothing left out of the packs is in the theme (by name, by source, and inside every built model)', () => {
  // by name: the catalogue, the files on disk and the committed sources
  for (const p of manifest.pieces) { assert.doesNotMatch(p.id, LEFT_OUT, p.id); assert.doesNotMatch(p.file, LEFT_OUT, p.file); }
  const onDisk = walk(DIR).map(f => path.relative(DIR, f).split(path.sep).join('/'));
  for (const f of onDisk) assert.doesNotMatch(f, LEFT_OUT, f);
  // by source: every model built from a pack is one its config keeps
  const from = dir => recipe.models.filter(m => m.from.startsWith(dir + '/'));
  assert.equal(from('kenney-nature-kit').length, 89); assert.equal(from('quaternius-ultimate-nature').length, 17);
  for (const [dir, pack] of Object.entries(PACKS)) for (const m of from(dir)) {
    const name = path.basename(m.from, '.glb');
    assert.ok(!excludedBy(pack, name), `${name} is left out by kit2/packs/${dir}.json`); assert.doesNotMatch(name, LEFT_OUT);
  }
  const K = PACKS['kenney-nature-kit'], Q = PACKS['quaternius-ultimate-nature'];
  assert.ok(excludedBy(Q, 'CommonTree_Dead_1') && excludedBy(Q, 'Willow_Dead_Snow_3') && excludedBy(Q, 'Rock_Snow_2') && excludedBy(Q, 'Cactus_1') && excludedBy(Q, 'PalmTree_2') && excludedBy(Q, 'Corn_1'), 'the Quaternius config still leaves them out');
  assert.ok(excludedBy(K, 'statue_head') && excludedBy(K, 'cactus_tall') && excludedBy(K, 'tree_palmBend') && excludedBy(K, 'crop_pumpkin') && excludedBy(K, 'crops_cornStageA'), 'the Kenney config still leaves them out');
  // the built GLB list is exactly the catalogue: no model rides along unlisted
  const glbs = onDisk.filter(f => f.endsWith('.glb')).sort();
  assert.deepEqual(glbs, [...manifest.heroes.map(h => h.file), manifest.moves.file, ...manifest.pieces.map(p => p.file)].sort());
  assert.equal(glbs.length, 113);
  // inside every built model: no node, mesh, material, picture or clip is named after a left-out model; nothing moves
  for (const f of glbs.filter(f => !f.startsWith('heroes/'))) {
    const g = gltf(f);
    for (const kind of ['nodes', 'meshes', 'materials', 'images', 'textures', 'animations', 'scenes']) for (const x of g[kind] || []) if (x.name) assert.doesNotMatch(x.name, LEFT_OUT, `${f}: ${kind} "${x.name}"`);
    assert.equal((g.animations || []).length, 0, `${f} has no clips`);
  }
  // the campfire is logs and a ring of stones: no flame, fire or ember in it, and nothing glows
  for (const id of manifest.pieces.filter(p => p.tags.includes('campfire')).map(p => p.file)) {
    const g = gltf(id);
    for (const m of g.materials) { assert.match(m.name, /^(wood|stone)/, `${id}: ${m.name}`); assert.equal(m.emissiveFactor, undefined); }
  }
  // words: a nature and camping world, nothing about weapons, fighting, hunting or fear
  const words = JSON.stringify([manifest.name, manifest.description, manifest.goodFor, manifest.units, manifest.pieces.map(p => [p.id, p.tags, p.note || ''])]);
  assert.doesNotMatch(words, /weapon|sword|\bgun|\baxe|knife|fight|battle|attack|enem(y|ies)|hunt|\btraps?\b|skull|\bbones?\b|\bdead\b|scar(y|e)|spooky|poison|\bburn/i);
});

test('colours: every material of the two packs has its colour from the theme\'s palette', () => {
  const linear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const packOf = id => def.packs.find(p => p.id === id);
  let checked = 0;
  for (const p of manifest.pieces.filter(p => ['kenney-nature', 'quaternius-nature'].includes(p.pack))) {
    const palette = Object.entries(packOf(p.pack).steps.colours);
    for (const m of gltf(p.file).materials) {
      if (m.name === '_defaultMat') continue;   // the kit's unused white
      const hit = palette.find(([k]) => new RegExp(k).test(m.name));
      assert.ok(hit, `${p.file}: material "${m.name}" has a colour in the palette`);
      const want = linear(hit[1]), got = (m.pbrMetallicRoughness.baseColorFactor || [1, 1, 1, 1]);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(want[i] - got[i]) < 0.002, `${p.file}: ${m.name} is ${hit[1]}`);
      assert.equal(m.pbrMetallicRoughness.baseColorTexture, undefined, `${p.file}: plain colour, no picture`);
      assert.equal(m.pbrMetallicRoughness.metallicFactor, 0, `${p.file}: ${m.name} is matte`);
      checked++;
    }
  }
  assert.ok(checked > 150);
  // nothing is too dark to read in a game for young children: every palette colour is brighter than a deep shadow
  for (const id of ['kenney-nature', 'quaternius-nature']) for (const [k, hex] of Object.entries(packOf(id).steps.colours)) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) >= 0x4a, `${id} ${k} ${hex}`);
  }
});

test('sizes: pieces suit a 2.4 m hero, stand on the ground and fit the 4 m grid', () => {
  const piece = id => manifest.pieces.find(p => p.id === id);
  for (const p of manifest.pieces.filter(p => p.tags.includes('tree'))) assert.ok(p.size[1] >= 3.5 && p.size[1] <= 9, `${p.id} is ${p.size[1]} tall`);
  for (const p of manifest.pieces.filter(p => p.tags.includes('flower') || p.tags.includes('mushroom'))) assert.ok(p.size[1] >= 0.3 && p.size[1] <= 1.3, `${p.id} is ${p.size[1]} tall`);
  for (const p of manifest.pieces.filter(p => p.tags.includes('tent'))) assert.ok(p.size[1] >= 2.4 && p.size[1] <= 3.2, `${p.id}: a hero fits the tent`);
  for (const p of manifest.pieces.filter(p => p.tags.includes('tile'))) { assert.equal(p.size[0], 4, p.id); assert.equal(p.size[2], 4, p.id); assert.ok(p.size[1] <= 0.25, `${p.id} is a thin tile`); }
  for (const id of ['meadow', 'stone-block', 'hill', 'cliff-block']) { assert.equal(piece(id).size[0], 4, id); assert.equal(piece(id).size[2], 4, id); }
  assert.deepEqual(piece('meadow').size, [4, 3, 4]);
  // nothing floats: a piece's base is at its y (thin tiles and lily pads sit a little into the ground or the water)
  for (const p of manifest.pieces) {
    const base = /Its base is (-?[\d.]+) below its y\.$/.exec(p.note || '');
    if (base) assert.ok(+base[1] < 0 && +base[1] >= -0.35, `${p.id}: ${p.note}`);
  }
  // no model is so small it is lost or so heavy it slows a Chromebook
  for (const p of manifest.pieces.filter(p => p.pack !== 'kaykit-dungeon')) { assert.ok(Math.max(...p.size) >= 0.4, `${p.id} is ${p.size}`); assert.ok(manifest.files[p.file].bytes <= 70 * 1024, `${p.id} is ${manifest.files[p.file].bytes} bytes`); }
});

// The models themselves, rebuilt from the converted packs and compared byte for byte. The packs are not in this
// repository (raw packs never are: kit2/README.md), so this runs only where they are: KIT2_RAW_PACKS=<fbx-to-glb.mjs
// output> KIT2_PACKS=<the uploaded packs> KIT2_TOOLS=<folder with the pipeline and its packages installed>.
const E = process.env, canRebuild = E.KIT2_RAW_PACKS && E.KIT2_PACKS && E.KIT2_TOOLS && fs.existsSync(path.join(E.KIT2_RAW_PACKS || '', 'kenney-nature-kit'));
test('the models rebuild to the same bytes from the converted packs', { skip: canRebuild ? false : 'needs the converted packs (KIT2_RAW_PACKS with kenney-nature-kit and quaternius-ultimate-nature, KIT2_PACKS, KIT2_TOOLS)' }, () => {
  const t = tmp();
  for (const f of fs.readdirSync(path.join(ROOT, 'kit2/pipeline'))) fs.copyFileSync(path.join(ROOT, 'kit2/pipeline', f), path.join(E.KIT2_TOOLS, f));
  const r = spawnSync(process.execPath, [path.join(E.KIT2_TOOLS, 'build-theme.mjs'), path.join(SRC, 'recipe.json'), E.KIT2_RAW_PACKS, path.join(t, 'out'), path.join(t, 'sizes.json'), E.KIT2_PACKS], { cwd: E.KIT2_TOOLS, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const built = walk(path.join(t, 'out')).map(f => path.relative(path.join(t, 'out'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(built, Object.keys(manifest.files).filter(f => /\.(glb|ogg)$/.test(f)).sort());
  for (const f of built) assert.equal(sri(fs.readFileSync(path.join(t, 'out', f))), manifest.files[f].sha384, f);
  fs.rmSync(t, { recursive: true });
});
