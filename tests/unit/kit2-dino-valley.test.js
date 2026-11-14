// Dino Valley 1.0.0 (docs/decisions.md "Dino Valley"): a prehistoric valley with five friendly dinosaurs, built from three
// uploaded FBX packs (Quaternius Animated Dinosaurs, the Kenney Nature Kit and the Quaternius Ultimate Nature Pack,
// docs/kit2-packs-plan.md) the way Wild Woods and the first animals were.
//   - it builds the same way every time: recipe.json and theme.src.json are exactly what from-def.mjs makes from
//     theme.def.json, theme.json is exactly what manifest.mjs makes, and that theme.json is the one in kit2/SHIPPED.json.
//     With the converted packs on the machine (KIT2_RAW_PACKS, see the last test) the models are rebuilt byte for byte;
//   - the dinosaurs: five of the pack's six. The T-Rex is held back by the owner (its mouth cannot be closed): no file,
//     id, name, node, mesh, material or clip of it is anywhere in the theme, the catalogue or the picker;
//   - calm clips only: each dinosaur file has exactly idle, walk, run and jump, and no clip anywhere in the theme is named
//     after an attack, a bite, a roar, a death or a hit;
//   - kid-safe: no bones, skulls, skeletons, fossils, lava, weapons; bright colours from the theme's palette;
//   - the Builder: "dinosaur", "dino", "prehistoric", "jurassic" and each dinosaur's name lead here; "t-rex" and
//     "tyrannosaurus" get the honest "not in any world yet", never a stand-in;
//   - in real Chromium, in the production game frame: every dinosaur spawns and plays its moves, refuses unkind ones, the
//     big ones are slow and keep their calm distance, the hero walks through one unharmed, a triceratops is the hero in
//     the starter, and the starter's own dinosaurs stand in the lake.
// Needs a local Chromium for the play tests; skipped when there is none. K2_SHOTS=<dir> saves screenshots there.
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
const DIR = path.join(ROOT, 'public/vendor/themes/dino-valley/1.0.0');
const SRC = path.join(ROOT, 'kit2/themes/dino-valley');
const read = f => fs.readFileSync(f, 'utf8'), json = f => JSON.parse(read(f));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const manifest = json(path.join(DIR, 'theme.json'));
const def = json(path.join(SRC, 'theme.def.json')), recipe = json(path.join(SRC, 'recipe.json'));
const PACKS = { dinosaurs: json(path.join(ROOT, 'kit2/packs/dinosaurs.json')), 'kenney-nature-kit': json(path.join(ROOT, 'kit2/packs/kenney-nature-kit.json')), 'quaternius-ultimate-nature': json(path.join(ROOT, 'kit2/packs/quaternius-ultimate-nature.json')) };
const run = (...args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dino-valley-'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const gltf = f => { const buf = fs.readFileSync(path.join(DIR, f)), len = buf.readUInt32LE(12); assert.equal(buf.toString('latin1', 16, 20), 'JSON', f); return JSON.parse(buf.toString('utf8', 20, 20 + len)); };
const DINOS = ['triceratops', 'stegosaurus', 'parasaurolophus', 'apatosaurus', 'velociraptor'];
// The animal that is held back, however it is spelled.
const REX = /t[-_. ]?rex|tyrann?osaur/i;
// Clips no creature may have (the library also refuses to play the first eight: NEVER_PLAYED).
const UNKIND = /attack|death|hit|punch|kick|shoot|gun|bite|roar|die|dead|hurt|claw|chomp|snap|growl|charge|stomp|tail.?whip/i;
// Things that must never be in a kind valley for young children, and what the pack configs leave out.
const LEFT_OUT = /dead|snow|cactus|statue|skull|\bbones?\b|skeleton|fossil|lava|volcano|\btraps?\b|\baxes?\b|\bguns?\b|weapon|sword|knife|spear|\bbow\b|arrow|\bclub\b/i;

test('the definition builds the same recipe and catalogue every time', () => {
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
  assert.equal(lock.themes['dino-valley/1.0.0'], sri(fs.readFileSync(path.join(DIR, 'theme.json'))), 'the lock holds this theme.json');
  for (const [f, v] of Object.entries(manifest.files)) assert.equal(sri(fs.readFileSync(path.join(DIR, f))), v.sha384, f);
});

test('every name in theme.json is a file that exists: 87 pieces, the five adventurers, five dinosaurs, six sounds', () => {
  assert.equal(manifest.pieces.length, 87); assert.equal(manifest.sounds.length, 6);
  assert.deepEqual(manifest.heroes, json(path.join(ROOT, 'public/vendor/themes/pirate-cove/1.0.0/theme.json')).heroes, 'the same heroes, names and files as Pirate Cove');
  assert.deepEqual(manifest.heroes, json(path.join(ROOT, 'public/vendor/themes/wild-woods/1.0.0/theme.json')).heroes, 'and as Wild Woods');
  assert.deepEqual(manifest.creatures.map(c => c.id), DINOS);
  for (const list of [manifest.heroes, manifest.creatures, manifest.pieces, manifest.sounds, [manifest.moves]]) {
    const ids = new Set();
    for (const it of list) {
      assert.ok(fs.statSync(path.join(DIR, it.file)).size > 100, it.file);
      if (it.id) { assert.ok(!ids.has(it.id), `${it.id} once`); ids.add(it.id); }
    }
  }
  for (const p of manifest.pieces) { assert.match(p.id, /^[a-z][a-z0-9-]*$/); assert.ok(p.tags.length, p.id); }
  // the heroes and their moves are the bytes every other world has
  const cq = path.join(ROOT, 'public/vendor/themes/castle-quest/1.0.0');
  for (const f of [...manifest.heroes.map(h => h.file), manifest.moves.file]) assert.ok(fs.readFileSync(path.join(DIR, f)).equals(fs.readFileSync(path.join(cq, f))), f);
  // what the brief asks of the world: ground, hill and cliff blocks, big rocks, ferns and plants, a few trees, a river
  // or pond tile set, stepping stones, a cave, a goal and a checkpoint, the shared coin
  const tagged = t => manifest.pieces.filter(p => p.tags.includes(t)).map(p => p.id);
  assert.ok(tagged('ground').includes('valley-ground') && tagged('platform').length >= 6 && tagged('goal').includes('egg') && tagged('coin').includes('coin') && tagged('checkpoint').includes('sign'));
  for (const [tag, n] of [['tree', 10], ['palm', 6], ['rock', 15], ['boulder', 5], ['plant', 12], ['fern', 3], ['cliff', 8], ['cave', 2], ['hill', 1], ['river', 7], ['pond', 1], ['step', 4], ['stones', 2], ['path', 4], ['bridge', 1], ['egg', 3], ['nest', 1]]) assert.ok(tagged(tag).length >= n, `${tag}: ${tagged(tag).length}`);
  assert.equal(recipe.models.find(m => m.to === 'props/coin.glb').from, 'theme:castle-quest/1.0.0/props/coin.glb', 'the shared coin');
  assert.equal(manifest.look.water, undefined, 'the valley stands on land (the starter\'s lake is the starter\'s)');
  assert.ok(manifest.firstLoadBytes < 3 * 1024 * 1024, `${(manifest.firstLoadBytes / 1048576).toFixed(2)} MB: well under the 5 MB limit, dinosaurs and heroes included`);
  const creatureBytes = manifest.creatures.reduce((n, c) => n + manifest.files[c.file].bytes, 0);
  assert.ok(creatureBytes < 450 * 1024, `the five dinosaurs are ${creatureBytes} bytes`);
});

test('only the three CC0 packs and what every theme reuses', () => {
  assert.deepEqual(manifest.packs.map(p => p.id).sort(), ['kaykit-adventurers', 'kaykit-dungeon', 'kenney-nature', 'kenney-platformer', 'quaternius-dinosaurs', 'quaternius-nature']);
  for (const p of manifest.packs) { assert.equal(p.licence, 'CC0-1.0', p.id); assert.match(read(path.join(DIR, p.licenceFile)), /CC0|Creative Commons Zero|publicdomain\/zero/i, p.id); }
  for (const pack of Object.values(PACKS)) assert.equal(pack.licence, 'CC0-1.0');
  assert.ok(fs.readFileSync(path.join(DIR, 'LICENSES/quaternius-dinosaurs.txt')).length > 100);
  // every model is built from one of the three packs or copied from a shipped theme: never from a pack that is not cleared
  for (const m of recipe.models) assert.match(m.from, /^(dinosaurs|kenney-nature-kit|quaternius-ultimate-nature)\/[A-Za-z0-9_]+\.glb$|^theme:castle-quest\/1\.0\.0\//, m.from);
  for (const c of recipe.copy) assert.match(c.from, /^theme:(castle-quest|busy-kitchen)\/1\.0\.0\//, c.from);
  assert.doesNotMatch(JSON.stringify([def, recipe, manifest.packs]), /amir|reodesuxz|megakit|forest-nature-pack/i);
  assert.doesNotMatch(read(path.join(DIR, 'SOURCES.md')), /amir|reodesuxz/i);
});

test('the T-Rex ships in no form: no file, id, name, node, mesh, material or clip, in the theme, the catalogue or the picker', async () => {
  // the pack config leaves it out by name, with the reason, and only that one
  assert.match(PACKS.dinosaurs.exclude.Trex, /mouth/);
  assert.equal(PACKS.dinosaurs.creatures.Trex, undefined);
  assert.deepEqual(Object.values(PACKS.dinosaurs.creatures).map(c => c.id).sort(), [...DINOS].sort());
  // the sources of the build and the built theme
  for (const m of recipe.models) assert.doesNotMatch(m.from + ' ' + m.to, REX, m.from);
  assert.deepEqual(recipe.models.filter(m => m.from.startsWith('dinosaurs/')).map(m => m.from).sort(), ['dinosaurs/Apatosaurus.glb', 'dinosaurs/Parasaurolophus.glb', 'dinosaurs/Stegosaurus.glb', 'dinosaurs/Triceratops.glb', 'dinosaurs/Velociraptor.glb']);
  assert.doesNotMatch(JSON.stringify(def), REX); assert.doesNotMatch(JSON.stringify(recipe), REX); assert.doesNotMatch(JSON.stringify(manifest), REX);
  const onDisk = walk(DIR).map(f => path.relative(DIR, f).split(path.sep).join('/'));
  for (const f of onDisk) assert.doesNotMatch(f, REX, f);
  assert.deepEqual(onDisk.filter(f => f.startsWith('creatures/')).sort(), DINOS.map(id => `creatures/${id}.glb`).sort(), 'exactly five creature files');
  // inside every built model
  for (const f of onDisk.filter(f => f.endsWith('.glb'))) {
    const g = gltf(f);
    for (const kind of ['nodes', 'meshes', 'materials', 'images', 'textures', 'animations', 'scenes', 'skins']) for (const x of g[kind] || []) if (x.name) assert.doesNotMatch(x.name, REX, `${f}: ${kind} "${x.name}"`);
    assert.doesNotMatch(JSON.stringify(g), /T_?Rex|Tyrannosaur/i, `${f}: no such word anywhere in the file's description`);
  }
  // the Builder's catalogue, its characters, the pictures and every language's names
  const K = await import('../../server/builder/kit2.js');
  for (const c of K.KIT2_CHARACTERS) assert.doesNotMatch(`${c.id} ${c.name}`, REX);
  assert.doesNotMatch(JSON.stringify(K.worldById('dino-valley')), REX);
  for (const dir of ['public/img/kit2/heroes', 'public/img/kit2/worlds']) for (const f of fs.readdirSync(path.join(ROOT, dir))) assert.doesNotMatch(f, REX, f);
  for (const f of fs.readdirSync(path.join(ROOT, 'server/i18n/locales'))) {
    const d = json(path.join(ROOT, 'server/i18n/locales', f)), names = (d.studio && d.studio.heroes && d.studio.heroes.names) || {};
    for (const [id, name] of Object.entries(names)) assert.doesNotMatch(`${id} ${name}`, /t[-_. ]?rex|tyrann?osaur|тиранно|ティラノ|暴龍|霸王龍|تيرانو|טירנו/i, `${f}: ${id}`);
  }
  // and the library is told about no such animal: asking for it is an error naming the five there are
  assert.equal(K.creatureFor('dino-valley', 't-rex'), ''); assert.equal(K.heroFor('dino-valley', 't-rex'), 'barbarian');
});

test('calm clips only: each dinosaur has exactly idle, walk, run and jump; nothing in the theme attacks, bites, roars or dies', () => {
  for (const c of manifest.creatures) {
    const clips = (gltf(c.file).animations || []).map(a => a.name);
    assert.deepEqual([...clips].sort(), ['idle', 'jump', 'run', 'walk'], `${c.id}: its clips`);
    assert.deepEqual([...c.moves].sort(), ['idle', 'jump', 'run', 'walk'], `${c.id}: its moves in the catalogue`);
    for (const m of clips) assert.doesNotMatch(m, UNKIND, `${c.id}: ${m}`);
    // the recipe keeps exactly the pack's four calm clips of that animal, and names no other
    const item = recipe.models.find(m => m.to === c.file);
    assert.deepEqual(Object.keys(item.anims).sort(), ['idle', 'jump', 'run', 'walk']);
    for (const from of Object.values(item.anims)) { assert.match(from, /^Armature\|[A-Za-z]+_(Idle|Walk|Run|Jump)$/, from); assert.doesNotMatch(from, UNKIND, from); }
    assert.deepEqual([...item.keepAnims].sort(), Object.values(item.anims).sort());
  }
  assert.doesNotMatch(JSON.stringify(recipe), /_Attack|_Death/, 'the pack\'s Attack and Death clips are named nowhere in the build');
  // every other model of the theme: the heroes' shared moves have the one shipped "bump" (Hit_A, frozen since Sky
  // Islands 1.0.0); no piece has any clip at all
  for (const f of Object.keys(manifest.files).filter(f => f.endsWith('.glb') && !f.startsWith('creatures/'))) {
    const names = (gltf(f).animations || []).map(a => a.name);
    if (f === 'heroes/moves.glb') assert.deepEqual(names.filter(n => UNKIND.test(n)), ['Hit_A']);
    else if (!f.startsWith('heroes/')) assert.deepEqual(names, [], `${f} has no clips`);
  }
});

test('the dinosaurs: friendly sizes beside a 2.4 m hero, big ones slow, feet that do not slide, one draw call each', () => {
  const by = Object.fromEntries(manifest.creatures.map(c => [c.id, c]));
  for (const c of manifest.creatures) {
    assert.equal(c.pack, 'quaternius-dinosaurs'); assert.equal(c.kind, 'land');
    assert.ok(c.size.every(n => n > 0.5 && n < 20), `${c.id} size`);
    assert.ok(c.pace.walk > 0.3 && c.pace.run > c.pace.walk, `${c.id} pace`);
    assert.ok(c.jumpAir[1] - c.jumpAir[0] > 0.15 && c.jumpAir[0] > 0.1 && c.jumpAir[1] < 0.7, `${c.id} jumpAir`);
    const g = gltf(c.file);
    assert.equal(g.meshes.length, 1); assert.equal(g.meshes[0].primitives.length, 1, `${c.id}: one draw call`);
    assert.equal(g.materials.length, 1); assert.equal(g.materials[0].extras.flat, true, `${c.id}: flat-shaded, with smooth normals for the ink`);
    assert.ok(g.extensionsRequired.includes('EXT_meshopt_compression'), `${c.id}: meshopt`);
    assert.ok(manifest.files[c.file].bytes < 100 * 1024, `${c.id} is ${manifest.files[c.file].bytes} bytes`);
  }
  // what Oomba3D 1.2.0 calls a big animal (3 tall or 4.5 long): it strolls, never above 2.5 a second, and keeps at least
  // 3 away from the hero. Every dinosaur but the velociraptor is one.
  const large = c => c.size[1] >= 3 || c.size[2] >= 4.5;
  assert.deepEqual(manifest.creatures.filter(large).map(c => c.id), ['triceratops', 'stegosaurus', 'parasaurolophus', 'apatosaurus']);
  assert.ok(by.velociraptor.size[1] < 1.8 && by.velociraptor.size[2] < 4, 'the velociraptor is the size of a big dog, lower than the hero');
  assert.ok(by.apatosaurus.size[2] >= 12 && by.apatosaurus.size[2] > by.stegosaurus.size[2] * 1.8, 'the apatosaurus is by far the longest');
  for (const id of ['triceratops', 'stegosaurus', 'parasaurolophus']) assert.ok(by[id].size[1] >= 2.6 && by[id].size[1] <= 3.4 && by[id].size[2] >= 6 && by[id].size[2] <= 7.5, `${id} is a little taller than the hero`);
  // who can be the hero: every one with a walk that reads well as a hero. The apatosaurus walks, but at 15 m it does not.
  assert.deepEqual(manifest.creatures.filter(c => c.playable).map(c => c.id), ['triceratops', 'stegosaurus', 'parasaurolophus', 'velociraptor']);
  assert.ok(by.apatosaurus.moves.includes('walk') && !by.apatosaurus.playable);
});

test('kid-safe: no bones, skulls, fossils, lava or weapons; nothing the pack configs leave out', () => {
  for (const p of manifest.pieces) { assert.doesNotMatch(p.id, LEFT_OUT, p.id); assert.doesNotMatch(p.file, LEFT_OUT, p.file); }
  const onDisk = walk(DIR).map(f => path.relative(DIR, f).split(path.sep).join('/'));
  for (const f of onDisk) assert.doesNotMatch(f, LEFT_OUT, f);
  const from = dir => recipe.models.filter(m => m.from.startsWith(dir + '/'));
  assert.equal(from('kenney-nature-kit').length, 69); assert.equal(from('quaternius-ultimate-nature').length, 17); assert.equal(from('dinosaurs').length, 5);
  for (const dir of ['kenney-nature-kit', 'quaternius-ultimate-nature', 'dinosaurs']) for (const m of from(dir)) assert.doesNotMatch(path.basename(m.from, '.glb'), LEFT_OUT, m.from);
  // the palms, the bamboo and leafy sprout, left out of Wild Woods "for a later world", and the large pot (remade as the
  // straw nest) are the only models here that a pack config leaves out; dead trees, snow, cacti and statues stay out
  const excludedBy = (pack, name) => Object.keys(pack.exclude || {}).some(k => new RegExp(`^(?:${k})$`).test(name));
  for (const dir of ['kenney-nature-kit', 'quaternius-ultimate-nature']) for (const m of from(dir)) {
    const name = path.basename(m.from, '.glb');
    if (excludedBy(PACKS[dir], name)) assert.match(name, /^(tree_palm|PalmTree_|crops_bamboo|crops_leafs|pot_large$)/, `${name} is left out by kit2/packs/${dir}.json`);
  }
  // the built GLB list is exactly the catalogue: no model rides along unlisted
  const glbs = onDisk.filter(f => f.endsWith('.glb')).sort();
  assert.deepEqual(glbs, [...manifest.heroes.map(h => h.file), manifest.moves.file, ...manifest.creatures.map(c => c.file), ...manifest.pieces.map(p => p.file)].sort());
  assert.equal(glbs.length, 5 + 1 + 5 + 87);
  for (const f of glbs.filter(f => !f.startsWith('heroes/'))) {
    const g = gltf(f);
    for (const kind of ['nodes', 'meshes', 'materials', 'images', 'textures', 'animations', 'scenes']) for (const x of g[kind] || []) if (x.name) assert.doesNotMatch(x.name, LEFT_OUT, `${f}: ${kind} "${x.name}"`);
    // nothing glows (no lava, no fire). A dinosaur's one palette material may carry the palette's own all-black glow
    // picture (oneDraw writes one when the palette has an empty block); the play test below reads the real pixels.
    for (const m of g.materials || []) if (!(f.startsWith('creatures/') && m.name === 'PaletteMaterial001')) assert.equal(m.emissiveFactor, undefined, `${f}: nothing glows`);
  }
  // words: a valley of friendly animals; nothing about weapons, fighting, hunting, fear, or dinosaurs as a danger
  const words = JSON.stringify([manifest.name, manifest.description, manifest.goodFor, manifest.units, manifest.creatures.map(c => c.name), manifest.pieces.map(p => [p.id, p.tags, p.note || ''])]);
  assert.doesNotMatch(words, /weapon|sword|\bgun|\baxe|knife|fight|battle|attack|enem(y|ies) |hunt|\btraps?\b|skull|\bbones?\b|skeleton|fossil|lava|volcano|\bdead\b|scar(y|e)|spooky|poison|\bburn|fierce|danger|predator|\bprey\b|teeth|\bbit(e|es|ing)\b|\broar/i);
  assert.match(manifest.description, /friendly dinosaurs/); assert.match(manifest.units, /never enemies, never obstacles/);
  // the cave is an empty hollow in a cliff block, and the egg is looked at, never taken or broken
  assert.match(manifest.pieces.find(p => p.id === 'cave').note, /nothing lives in it/);
  assert.match(manifest.pieces.find(p => p.id === 'egg').note, /never taken or broken/);
});

test('colours: bright and friendly, every material from the theme\'s palette', () => {
  const linear = hex => [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const packOf = id => def.packs.find(p => p.id === id);
  const bright = hex => Math.max(...[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
  let checked = 0;
  for (const row of def.pieces) {
    const [id, , kind, , , packId, steps] = row, p = manifest.pieces.find(x => x.id === id);
    if (!['kenney-nature', 'quaternius-nature'].includes(p.pack)) continue;
    // a piece's own colours (the eggs, the nest) take the place of its pack's
    const palette = Object.entries((steps && steps.colours) || packOf(p.pack).steps.colours);
    assert.ok(!packId || packId === p.pack, id); assert.ok(kind);
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
    for (const [k, hex] of palette) assert.ok(bright(hex) >= 0x4a, `${id} ${k} ${hex}`);
  }
  assert.ok(checked > 120, `${checked} materials checked`);
  // the dinosaurs: each has its own bright colours (the pack's are dark olive and brown), a pale belly, and no black
  // but for the velociraptor's eyes and toes, which are a soft brown
  const body = {};
  for (const c of def.creatures) {
    const cols = Object.values(c.colours);
    assert.ok(cols.length >= 2, c.id);
    for (const hex of cols) { assert.match(hex, /^#[0-9a-f]{6}$/); assert.ok(bright(hex) >= (c.id === 'velociraptor' ? 0x5a : 0xb0), `${c.id} ${hex} is bright`); }
    // every material of the raw model is given a colour (none keeps the pack's dark one)
    assert.equal(c.brighten, undefined);
    body[c.id] = cols.join(' ');
  }
  assert.equal(new Set(Object.values(body)).size, 5, 'five different looks');
  assert.doesNotMatch(JSON.stringify(def.creatures.map(c => c.colours)), /#(000000|1[0-9a-f]1[0-9a-f]1[0-9a-f]|c00000|ff0000)/i, 'no black, no blood red');
  // a bright daytime sky
  assert.equal(manifest.look.toneMapping, 'ACESFilmic'); assert.ok(manifest.look.hemisphere.intensity >= 1.1 && manifest.look.sun.intensity >= 2.4);
});

test('sizes: pieces suit a 2.4 m hero, stand on the ground and fit the 4 m grid', () => {
  const piece = id => manifest.pieces.find(p => p.id === id);
  for (const p of manifest.pieces.filter(p => p.tags.includes('tree'))) assert.ok(p.size[1] >= 4 && p.size[1] <= 9.5, `${p.id} is ${p.size[1]} tall`);
  for (const p of manifest.pieces.filter(p => p.tags.includes('boulder'))) assert.ok(p.size[1] >= 2.4 && Math.max(...p.size) >= 2.8, `${p.id} is a big rock (${p.size})`);
  for (const p of manifest.pieces.filter(p => p.tags.includes('tile'))) { assert.equal(p.size[0], 4, p.id); assert.equal(p.size[2], 4, p.id); assert.ok(p.size[1] <= 0.25, `${p.id} is a thin tile`); }
  for (const id of ['valley-ground', 'stone-block', 'hill', 'cliff-block', 'cave']) { assert.equal(piece(id).size[0], 4, id); assert.equal(piece(id).size[2], 4, id); }
  assert.deepEqual(piece('valley-ground').size, [4, 3, 4]);
  assert.ok(piece('egg').size[1] >= 2 && piece('egg').size[1] <= 2.6 && piece('egg').size[1] > piece('egg').size[0] * 1.2, 'the great egg is about as tall as a hero, and egg-shaped');
  assert.ok(piece('egg-blue').size[1] < 1.3 && piece('nest').size[0] > piece('egg-blue').size[0] * 3, 'the small eggs fit the nest');
  // nothing floats: a piece's base is at its y or a little under it (thin tiles in the ground, big rocks sunk into it)
  for (const p of manifest.pieces) {
    const base = /Its base is (-?[\d.]+) below its y\.$/.exec(p.note || '');
    if (base) assert.ok(+base[1] < 0 && +base[1] >= -0.7, `${p.id}: ${p.note}`);
  }
  for (const p of manifest.pieces.filter(p => p.pack !== 'kaykit-dungeon')) { assert.ok(Math.max(...p.size) >= 0.4, `${p.id} is ${p.size}`); assert.ok(manifest.files[p.file].bytes <= 72 * 1024, `${p.id} is ${manifest.files[p.file].bytes} bytes`); }
});

test('the starter layout and the tour use only this world\'s pieces and animals', async () => {
  const K = await import('../../server/builder/kit2.js');
  const ids = new Set(manifest.pieces.map(p => p.id)), lay = K.STARTERS['dino-valley'], piece = id => manifest.pieces.find(p => p.id === id);
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad, lay.goal, lay.landmark, ...lay.scenery]) assert.ok(ids.has(id), id);
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad]) assert.ok(piece(id).tags.includes('platform'), `${id} is something to stand on`);
  assert.ok(piece(lay.goal[0]).tags.includes('goal')); assert.ok(piece(lay.landmark[0]).tags.includes('cave'));
  assert.equal(lay.lake, true); assert.ok(lay.sea && lay.seaY < 0);
  for (const [id, scale] of [lay.ground, lay.side, lay.step, lay.pad]) assert.ok(piece(id).size[1] * scale > -lay.seaY + 0.5, `${id} reaches the water`);
  // the starter's own dinosaurs: big ones standing in the lake (scenery)
  for (const id of lay.wading) assert.ok(DINOS.includes(id), id);
  assert.ok(lay.wading.includes('apatosaurus') && !lay.wading.includes('velociraptor'));
  const { scanVersion } = await import('../../server/services/scanner.js');
  const { lintKit2 } = await import('../../server/services/kit2-lint.js');
  const V = await import('../../server/services/vendor.js');
  for (const hero of ['barbarian', 'rogue']) {
    const html = K.kit2Starter({ world: 'dino-valley', hero });
    const r = scanVersion(html);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues)); assert.deepEqual(r.lint, []);
    assert.deepEqual(K.kit2Of(html), { world: 'dino-valley', version: '1.0.0', hero });
    assert.ok(html.includes(V.kit2ImportMap()), 'on the newest shipped Oomba3D');
    assert.equal(V.oomba3dVersionOf(html), '1.2.0'); assert.equal(K.hasAnimals(html), true);
    assert.match(html, /wading: \["apatosaurus","parasaurolophus","triceratops"\],/);
    assert.doesNotMatch(html, /new Worker|\beval\(|new Function/, 'nothing the frame forbids');
  }
  // a dinosaur as the hero, and one asked for as the companion
  const tri = K.kit2Starter({ world: 'dino-valley', hero: 'triceratops' });
  assert.deepEqual(K.kit2Of(tri), { world: 'dino-valley', version: '1.0.0', hero: 'triceratops' }); assert.deepEqual(lintKit2(tri), []);
  assert.deepEqual(K.kit2Of(K.kit2Starter({ world: 'dino-valley', hero: 'mage', companion: 'stegosaurus' })), { world: 'dino-valley', version: '1.0.0', hero: 'mage', companion: 'stegosaurus' });
  // the apatosaurus is too big to be the hero: the starter never makes it one, and a game that does is told why
  const ap = K.kit2Starter({ world: 'dino-valley', hero: 'apatosaurus' });
  assert.ok(ap.includes("hero: 'barbarian',"));
  assert.match(lintKit2(ap.replace("hero: 'barbarian',", "hero: 'apatosaurus',"))[0].message, /the apatosaurus cannot be the hero \(it is too big\)/);
  // an animal this world does not have, or the one that is held back, is noted, never passed
  assert.deepEqual(lintKit2(tri + "<script type=\"module\">g.creature('t-rex');</script>").map(l => l.code), ['kit2_creature']);
  assert.ok(K.kit2Starter({ world: 'dino-valley', hero: 't-rex', companion: 't-rex' }).includes("hero: 'barbarian',"));
  // no animal comes along unless it is asked for; other worlds' starters are as they were: nothing stands in their water
  assert.ok(K.kit2Starter({ world: 'dino-valley' }).includes("companion: '',"));
  for (const w of ['wild-woods', 'castle-quest', 'pirate-cove']) { const h = K.kit2Starter({ world: w }); assert.ok(h.includes("companion: '',"), w); assert.doesNotMatch(h, /\n  wading:/, w); }
  const tour = read(path.join(ROOT, 'kit2/demo/theme-tour.html')).replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", "'dino-valley'").replace("'THEME_VERSION'", "'1.0.0'").replace("'THEME_TIME'", "'day'");
  assert.deepEqual(scanVersion(tour).issues.filter(i => i.level === 'fail'), []);
  assert.equal(scanVersion(K.kit2Starter({ world: 'dino-valley' }).replace("version: '1.0.0'", "version: '1.0.9'")).status, 'fail', 'a version that never shipped is still refused');
});

test('the Builder: dinosaur words lead to Dino Valley; the T-Rex gets the honest "not yet", never a stand-in', async () => {
  const K = await import('../../server/builder/kit2.js');
  const want = (text, version = null, state = {}) => K.wantsKit2(state, text, version);
  // the place: the general words, and each dinosaur's name
  for (const text of ['a dinosaur game', 'a dino maths adventure', 'count the dinosaurs', 'a prehistoric adventure', 'a jurassic jumping game', 'a game about a triceratops',
    'find the stegosaurus', 'a parasaurolophus by the river', 'an apatosaurus adventure', 'a velociraptor race', 'a raptor game', 'dinosaurs in the forest', 'Make it a 3D game in the Dino Valley world.', 'dino-valley']) {
    const p = want(text);
    assert.ok(p, `Kit 2: ${text}`); assert.equal(p.world, 'dino-valley', text); assert.equal(p.wantsCreature, false, text); assert.equal(p.missing, undefined, text);
    assert.ok(K.heroesOf('dino-valley').some(h => h.id === p.hero), `${text}: the hero is one this world has`);
  }
  // a dinosaur named alone is the hero when it can be one; "a dinosaur" is the first that can
  assert.deepEqual([want('a triceratops game').hero, want('a stegosaurus game').hero, want('a raptor game').hero, want('a parasaurolophus game').hero], ['triceratops', 'stegosaurus', 'velociraptor', 'parasaurolophus']);
  assert.equal(want('a dinosaur game').hero, 'triceratops');
  // the apatosaurus cannot be the hero (too big): it comes along, behind the Explorer
  let p = want('an apatosaurus game');
  assert.deepEqual([p.hero, p.companion, p.missing], ['barbarian', 'apatosaurus', undefined]);
  p = want('a brontosaurus game'); assert.equal(p.companion, 'apatosaurus');
  // with a hero named, or "with my", it comes along; of "a dinosaur" the smallest does (it keeps up)
  p = want('a dino game where a wizard has a pet dinosaur');
  assert.deepEqual([p.world, p.hero, p.companion], ['dino-valley', 'mage', 'velociraptor']);
  p = want('a knight exploring with a stegosaurus');
  assert.deepEqual([p.world, p.hero, p.companion], ['dino-valley', 'knight', 'stegosaurus']);
  assert.match(K.kit2Note(p), /The animal that comes along: stegosaurus \(Stegosaurus\), as CONFIG\.companion/);
  // another place named too: that place wins, and it is told kindly that the dinosaur is not there
  p = want('a dinosaur game on the moon');
  assert.deepEqual([p.world, p.wantsCreature, p.companion], ['space-base', false, undefined]); assert.ok(K.heroesOf('space-base').some(h => h.id === p.hero));
  assert.match(K.kit2Note(p), /Space Base has no Triceratops: say so kindly/);
  assert.equal(want('a castle with a triceratops').world, 'castle-quest');
  // in a game that exists, a dinosaur's name is an animal asked for, not a move to the valley: the game stays where it
  // is and is told kindly; describing the valley itself (or naming it) still moves it
  const town = { html: K.kit2Starter({ world: 'toy-town', hero: 'knight' }) };
  p = want('change the hero to a dinosaur', town);
  assert.deepEqual([p.world, p.hero, p.missing, p.changed], ['toy-town', 'knight', 'triceratops', false]);
  p = want('add a stegosaurus that follows me', town);
  assert.deepEqual([p.world, p.companion, p.missing], ['toy-town', undefined, 'stegosaurus']);
  p = want('change the hero to a t-rex', town);
  assert.deepEqual([p.world, p.hero, p.wantsCreature, p.changed], ['toy-town', 'knight', true, false]);
  assert.equal(want('make it a prehistoric valley', town).world, 'dino-valley'); assert.equal(want('Make it a 3D game in the Dino Valley world.', town).world, 'dino-valley');
  const valley = { html: K.kit2Starter({ world: 'dino-valley', hero: 'knight' }) };
  p = want('change the hero to a stegosaurus', valley);
  assert.deepEqual([p.world, p.hero, p.changed], ['dino-valley', 'stegosaurus', true]);
  p = want('add a raptor that follows me', valley);
  assert.deepEqual([p.world, p.hero, p.companion, p.changed], ['dino-valley', 'knight', 'velociraptor', true]);
  // a 2D, card, word or catching game stays on the old kit, as for every world
  for (const text of ['a dinosaur memory game', 'a 2D dinosaur game', 'catch the falling dinosaur eggs', 'a dinosaur word search', 'a quiz about fossils']) assert.equal(want(text), null, `old kit: ${text}`);
  // the T-Rex: Dino Valley is where dinosaurs are, but that one is not here. No dinosaur stands in for it as the hero
  // or comes along because of it, and the note says so.
  for (const text of ['a t-rex game', 'a T-Rex adventure', 'a trex game', 'a tyrannosaurus game', 'a Tyrannosaurus Rex maths game', 'a dinosaur game with a t-rex', 'play as a T. rex', 'dinosaurs and a tyrannosaurus']) {
    p = want(text);
    assert.ok(p, text); assert.equal(p.world, 'dino-valley', text); assert.equal(p.wantsCreature, true, text);
    assert.equal(p.hero, 'barbarian', `${text}: a person is the hero, not another dinosaur dressed up as the one asked for`);
    assert.equal(p.companion, undefined, text); assert.equal(p.missing, undefined, text);
    const note = K.kit2Note(p);
    assert.match(note, /They asked for an animal that is not in any world yet: say that kindly in one short sentence, and offer the animals there are \([^)]*Triceratops[^)]*\)\. Never use another animal as if it were the one they asked for\./, text);
    assert.doesNotMatch(note, /t-?rex|tyrannosaur/i, 'the note never names it as something that exists');
  }
  // asked for beside a dinosaur that is here: that one is used, and the T-Rex is still answered honestly
  p = want('a game with a t-rex and a triceratops friend');
  assert.deepEqual([p.world, p.companion, p.wantsCreature], ['dino-valley', 'triceratops', true]);
  // in another world it is the same honest line
  p = want('a village game with a t-rex');
  assert.deepEqual([p.world, p.wantsCreature, p.companion], ['medieval-village', true, undefined]);
  // what the model is told
  const P = K.KIT2_RULES;
  assert.match(K.KIT2_SHORT, /No T-Rex, fish or other animals yet/);
  assert.match(K.KIT2_SHORT, /dino-valley \("Dino Valley"\)/);
  assert.match(P, /## dino-valley 1\.0\.0 \("Dino Valley"\)/);
  assert.match(P, /apatosaurus \(Apatosaurus\) 1\.7x3\.4x15 moves idle\/walk\/run\/jump not playable \(too big to be the hero: a companion or scenery\)/);
  assert.match(P, /triceratops \(Triceratops\) [\dx.]+ moves idle\/walk\/run\/jump playable/);
  assert.match(P, /not listed \(a T-Rex, a cat, a fish: not yet\)/);
  assert.doesNotMatch(K.KIT2_CATALOG_TEXT, REX);
  assert.match(P, /Animals are never enemies or obstacles/); assert.match(P, /Big animals[^.]*stroll slowly and keep their calm distance by themselves/);
});

test('names and pictures: the world and the five dinosaurs in every site language, each with its picture', async () => {
  const K = await import('../../server/builder/kit2.js');
  const { CODES } = await import('../../server/i18n/index.js');
  for (const code of CODES.filter(c => c !== 'en-GB')) {
    const d = json(path.join(ROOT, 'server/i18n/locales', `${code}.json`));
    assert.ok(d.studio.worlds.names['dino-valley'], `${code}: the world`);
    for (const id of DINOS) assert.ok(d.studio.heroes.names[id], `${code}: ${id}`);
  }
  assert.equal(json(path.join(ROOT, 'server/i18n/locales/en.json')).studio.worlds.names['dino-valley'], 'Dino Valley');
  for (const f of ['worlds/dino-valley.webp', 'worlds/dino-valley-card.webp', ...DINOS.map(id => `heroes/${id}.webp`)]) assert.ok(fs.statSync(path.join(ROOT, 'public/img/kit2', f)).size > 800, f);
  // they are offered where the other animals are: the characters list, with the world that has them
  for (const id of DINOS) { const c = K.characterById(id); assert.equal(c.kind, 'creature'); assert.deepEqual(c.worlds, ['dino-valley']); }
  assert.deepEqual(K.worldLook('dino-valley'), ['🦕', 'mint']);
  assert.ok(fs.statSync(path.join(DIR, 'cover.webp')).size > 5000);
});

// ---------------------------------------------------------------- real Chromium, the production frame
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open(html, { width = 480, height = 300 } = {}) {
  const { chromium } = await import('playwright-core');
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  const { vendorFile } = await import('../../server/services/snapshot.js');
  if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height } });
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Dinosaurs' }, save: {}, canSave: false });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const outside = [], asked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) { asked.push(u.slice(HOST.length)); return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  return { p, frame, errors, asked, outside, ctx };
}

test('the dinosaurs in the game frame: they spawn, play only calm moves, the big ones are slow and keep their distance, and the hero walks through one unharmed', { skip, timeout: 420_000 }, async () => {
  const V = await import('../../server/services/vendor.js');
  const { scanVersion } = await import('../../server/services/scanner.js');
  const html = read(path.join(ROOT, 'kit2/demo/creatures.html')).replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", "'dino-valley'").replace("'THEME_VERSION'", "'1.0.0'").replace("'PLAY_AS'", "'knight'").replace("'GRAPHICS'", "'low'");
  assert.deepEqual(scanVersion(html).issues.filter(i => i.level === 'fail'), []);
  const { p, frame, errors, outside, asked, ctx } = await open(html);
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 150_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 120_000 });
  // every dinosaur is there with its four moves; an unkind move, or one it does not have, plays nothing
  const info = await frame.evaluate(() => Object.fromEntries(Object.entries(__demo.all).map(([id, c]) => [id, { moves: [...c.moves].sort(), large: c.large, playable: c.playable, y: c.position.y, no: ['attack', 'bite', 'roar', 'death', 'hit', 'Attack', 'eat'].map(m => c.play(m)) }])));
  assert.deepEqual(Object.keys(info), DINOS);
  for (const id of DINOS) {
    assert.deepEqual(info[id].moves, ['idle', 'jump', 'run', 'walk'], id);
    assert.deepEqual(info[id].no, [null, null, null, null, null, null, null], `${id} has no attack, bite, roar, death or hit to play`);
    assert.equal(info[id].large, id !== 'velociraptor', `${id}: big animals are the slow ones`);
    assert.equal(info[id].playable, id !== 'apatosaurus');
    assert.deepEqual(await frame.evaluate(id => __demo.all[id].moves.map(m => { const a = __demo.all[id].play(m); return a ? a.getClip().name : null; }), id), await frame.evaluate(id => __demo.all[id].moves, id), `${id} plays every one of its moves`);
    await frame.evaluate(id => { __demo.all[id].play('idle'); }, id);
  }
  assert.match(await frame.evaluate(async () => { try { await __demo.g.creature('t-rex'); return 'made'; } catch (e) { return e.message; } }), /no creature "t-rex" in dino-valley 1\.0\.0\. Creatures: triceratops, stegosaurus, parasaurolophus, apatosaurus, velociraptor/);
  assert.match(await frame.evaluate(async () => { try { await __demo.g.hero('apatosaurus'); return 'made'; } catch (e) { return e.message; } }), /the Apatosaurus cannot be the hero/);
  // a rendered frame of the triceratops: blue, with ink, not washed out or black
  const px = await frame.evaluate(() => {
    const g = __demo.g, c = __demo.all.stegosaurus.position, cam = g.camera.clone();
    cam.position.set(c.x + 9, 2.4, c.z + 4); cam.lookAt(c.x, 1.5, c.z); cam.updateMatrixWorld();
    g.renderer.setRenderTarget(null); g.renderer.render(g.scene, cam);
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let white = 0, ink = 0, orange = 0, n = 0;
    for (let i = 0; i < buf.length; i += 16) { const r = buf[i], gr = buf[i + 1], b = buf[i + 2]; n++; if (r > 245 && gr > 245 && b > 245) white++; if (r < 45 && gr < 45 && b < 45) ink++; if (r > 170 && r > gr + 30 && gr > b + 30) orange++; }
    return { white: white / n, ink: ink / n, orange: orange / n };
  });
  assert.ok(px.white < 0.3, `the picture is not washed out (${(px.white * 100).toFixed(1)}% white)`);
  assert.ok(px.orange > 0.01, `the stegosaurus is bright orange (${(px.orange * 100).toFixed(2)}% of the picture)`);
  assert.ok(px.ink > 0.0008 && px.ink < 0.2, `with an ink outline, not a dark picture (${(px.ink * 100).toFixed(2)}%)`);
  await until(() => Math.abs(__demo.me.position.y) < 0.01);
  if (process.env.K2_SHOTS) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(process.env.K2_SHOTS, 'dino-valley-demo.png') }); }

  // The hero walks up to the stegosaurus: one hello; then straight on THROUGH it: not stopped, not pushed, no points lost.
  const at = await frame.evaluate(() => __demo.all.stegosaurus.position.toArray());
  await frame.evaluate(c => { __demo.met.length = 0; __demo.me.position.set(c[0], 0, c[2] + 9); }, at);
  const score0 = await frame.evaluate(() => __demo.g.score());
  await frame.click('canvas');
  await p.keyboard.down('ArrowUp');
  await until(() => __demo.met.includes('stegosaurus'));
  assert.match(await frame.evaluate(() => document.querySelector('.o3-toast').textContent), /Hello, Stegosaurus!/);
  await until(c => __demo.me.position.z < c[2] - 4.5, at);
  await p.keyboard.up('ArrowUp');
  const after = await frame.evaluate(() => ({ me: __demo.me.position.toArray(), met: __demo.met.filter(m => m === 'stegosaurus').length, score: __demo.g.score(), dino: __demo.all.stegosaurus.position.toArray() }));
  assert.ok(Math.abs(after.me[0] - at[0]) < 0.01 && after.me[1] === 0, 'the hero walked straight through the stegosaurus');
  assert.equal(after.met, 1); assert.equal(after.score, score0); assert.deepEqual(after.dino, at, 'and the stegosaurus was not pushed either');

  // Calm: the biggest one, told to hurry right up to the hero, strolls (never above 2.5 a second) and stops well short.
  await frame.evaluate(() => {
    const m = __demo.me.position, a = __demo.all.apatosaurus; a.position.set(m.x + 22, 0, m.z);
    const w = window.__watch = { max: 0, last: [a.position.x, a.position.z], min: 99, raptorMax: 0, rl: null };
    window.__arrived = null; a.walkTo(m.x, m.z, { speed: 99 }).then(ok => { window.__arrived = ok; });
    __demo.g.onUpdate(dt => {
      if (dt > 0) w.max = Math.max(w.max, Math.hypot(a.position.x - w.last[0], a.position.z - w.last[1]) / dt);
      w.last = [a.position.x, a.position.z]; w.min = Math.min(w.min, Math.hypot(a.position.x - m.x, a.position.z - m.z));
      const f = __demo.friend.position; if (w.rl && dt > 0) w.raptorMax = Math.max(w.raptorMax, Math.hypot(f.x - w.rl[0], f.z - w.rl[1]) / dt); w.rl = [f.x, f.z];
    });
  });
  await until(() => __watch.min < 9.6);
  await p.waitForTimeout(2500);
  const calm = await frame.evaluate(() => ({ min: __watch.min, max: __watch.max, arrived: window.__arrived, raptorMax: __watch.raptorMax, size: __demo.all.apatosaurus.size }));
  assert.ok(calm.min >= calm.size[2] * 0.6 - 0.01, `the apatosaurus kept its calm distance (${calm.min.toFixed(2)} of ${(calm.size[2] * 0.6).toFixed(1)})`);
  assert.equal(calm.arrived, null, 'it is waiting, not arrived');
  assert.ok(calm.max > 0.5 && calm.max <= 2.5 + 1e-6, `a big dinosaur never goes faster than 2.5 (${calm.max.toFixed(2)})`);
  assert.ok(calm.raptorMax <= 7.5 + 1e-6, 'the little one that comes along never outruns the hero by much');
  // the velociraptor that comes along stops beside the hero, never on top of them
  await until(() => { const f = __demo.friend.position, m = __demo.me.position, d = Math.hypot(f.x - m.x, f.z - m.z); return d < 4.5 && d > 1.5; });

  assert.ok(DINOS.every(id => asked.some(u => u.endsWith(`/dino-valley/1.0.0/creatures/${id}.glb`))) && asked.every(u => u.startsWith('/vendor/')));
  assert.ok(!asked.some(u => REX.test(u)));
  assert.deepEqual(errors, []); assert.deepEqual(outside, [], 'nothing asked for outside /vendor');
  await ctx.close();
});

test('the starter in the game frame: a triceratops is the hero, runs and jumps; dinosaurs stand in the lake beside the way', { skip, timeout: 420_000 }, async () => {
  const K = await import('../../server/builder/kit2.js');
  const { p, frame, errors, outside, ctx } = await open(K.kit2Starter({ world: 'dino-valley', hero: 'triceratops' }), { width: 640, height: 400 });
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().scene === 'title', null, { timeout: 180_000 });
  let st = await frame.evaluate(() => __brbTest.state());
  assert.deepEqual([st.world, st.heroId, st.companion], ['dino-valley', 'triceratops', null]);
  await frame.evaluate(() => __brbTest.start());
  await frame.click('canvas');
  const z0 = (await frame.evaluate(() => __brbTest.state())).hero.z;
  await p.keyboard.down('ArrowUp');
  await frame.waitForFunction(z => __brbTest.state().hero.z < z - 2, z0, { timeout: 120_000 });
  await p.keyboard.up('ArrowUp');
  const y0 = (await frame.evaluate(() => __brbTest.state())).hero.y;
  await p.keyboard.down('Space');
  await frame.waitForFunction(y => __brbTest.state().hero.y > y + 0.8, y0, { timeout: 120_000 });
  await p.keyboard.up('Space');
  if (process.env.K2_SHOTS) await p.screenshot({ path: path.join(process.env.K2_SHOTS, 'dino-valley-starter-triceratops.png') });
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await ctx.close();

  // a velociraptor that comes along joins the hero at the first rest place, and the dinosaurs in the lake are there
  const s = await open(K.kit2Starter({ world: 'dino-valley', hero: 'mage', companion: 'velociraptor' }), { width: 640, height: 400 });
  await s.frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().scene === 'title', null, { timeout: 180_000 });
  st = await s.frame.evaluate(() => __brbTest.state());
  assert.deepEqual([st.world, st.heroId, st.companion && st.companion.id], ['dino-valley', 'mage', 'velociraptor']);
  await s.frame.evaluate(() => __brbTest.start());
  const sp = await s.frame.evaluate(() => __brbTest.spots());
  await s.frame.evaluate(c => { __brbTest.put(c[0], c[1] + 0.5, c[2]); }, sp.checkpoints[1]);
  await s.frame.waitForFunction(c => { const t = __brbTest.state(); return t.hero && Math.abs(t.hero.y - c[1]) < 0.4 && Math.hypot(t.companion.x - t.hero.x, t.companion.z - t.hero.z) < 5 && Math.abs(t.companion.y - t.hero.y) < 1.2; }, sp.checkpoints[1], { timeout: 150_000 });
  for (const id of ['apatosaurus', 'parasaurolophus', 'triceratops', 'velociraptor']) assert.ok(s.asked.includes(`/vendor/themes/dino-valley/1.0.0/creatures/${id}.glb`), `${id} is in the starter`);
  assert.ok(!s.asked.some(u => u.endsWith('/creatures/stegosaurus.glb')), 'only the animals the game names are loaded');
  if (process.env.K2_SHOTS) await s.p.screenshot({ path: path.join(process.env.K2_SHOTS, 'dino-valley-starter-mage.png') });
  assert.deepEqual(s.errors, []); assert.deepEqual(s.outside, []);
  await s.ctx.close();
});

// The models themselves, rebuilt from the converted packs and compared byte for byte. The packs are not in this
// repository (raw packs never are: kit2/README.md), so this runs only where they are: KIT2_RAW_PACKS=<fbx-to-glb.mjs
// output> KIT2_PACKS=<the uploaded packs> KIT2_TOOLS=<folder with the pipeline and its packages installed>.
const E = process.env, canRebuild = E.KIT2_RAW_PACKS && E.KIT2_PACKS && E.KIT2_TOOLS && fs.existsSync(path.join(E.KIT2_RAW_PACKS || '', 'dinosaurs')) && fs.existsSync(path.join(E.KIT2_RAW_PACKS || '', 'kenney-nature-kit'));
test('the models rebuild to the same bytes from the converted packs', { skip: canRebuild ? false : 'needs the converted packs (KIT2_RAW_PACKS with dinosaurs, kenney-nature-kit and quaternius-ultimate-nature, KIT2_PACKS, KIT2_TOOLS)' }, () => {
  const t = tmp();
  for (const f of fs.readdirSync(path.join(ROOT, 'kit2/pipeline'))) fs.copyFileSync(path.join(ROOT, 'kit2/pipeline', f), path.join(E.KIT2_TOOLS, f));
  const r = spawnSync(process.execPath, [path.join(E.KIT2_TOOLS, 'build-theme.mjs'), path.join(SRC, 'recipe.json'), E.KIT2_RAW_PACKS, path.join(t, 'out'), path.join(t, 'sizes.json'), E.KIT2_PACKS], { cwd: E.KIT2_TOOLS, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const built = walk(path.join(t, 'out')).map(f => path.relative(path.join(t, 'out'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(built, Object.keys(manifest.files).filter(f => /\.(glb|ogg)$/.test(f)).sort());
  for (const f of built) assert.equal(sri(fs.readFileSync(path.join(t, 'out', f))), manifest.files[f].sha384, f);
  fs.rmSync(t, { recursive: true });
});
