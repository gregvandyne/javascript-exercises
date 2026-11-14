// Under the Sea 1.0.0 (docs/decisions.md "Under the Sea"): a coral reef world with 23 sea animals, built from the
// uploaded sea packs (docs/kit2-packs-plan.md). It is the first world whose packs are mostly NOT CC0, the first with no
// walking heroes (the player is a sea animal), and the first whose starter is swum, not walked.
//   - it builds the same way every time: recipe.json and theme.src.json are what from-def.mjs makes from theme.def.json,
//     theme.json is what manifest.mjs makes, and it is the locked one. With the converted packs on the machine
//     (KIT2_RAW_PACKS, see the last test) the models are rebuilt and compared byte for byte;
//   - licences: every restricted pack is marked as never to be redistributed, carries its own licence text and a credit;
//     ALSTRA INFINITE, whose licence requires credit, is credited in SOURCES.md, theme.json and docs/media-credits.md;
//     no raw pack file is in the repository, and nothing offers a model as a download;
//   - kid-safe: nothing the pack configs leave out is in the theme (every animal with teeth showing, fishing rods, hooks,
//     lures, bait), by name, by source and inside every built model; no attack, bite, hit, death, hooked or flop clip;
//   - the animals: water animals have idle and swim and can be the hero; the crab strolls and cannot; every animal
//     stands on its y, faces +z and is a size a child can see;
//   - the starter: swum with the swim controls, bubbles, shoals and friendly animals; the scanner accepts it;
//   - in real Chromium, inside the production frame: a whole round as the dolphin (swim, coin, wrong and right answers,
//     the treasure), and the shoals and friends are there and never in the way.
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
const DIR = path.join(ROOT, 'public/vendor/themes/under-the-sea/1.0.0');
const SRC = path.join(ROOT, 'kit2/themes/under-the-sea');
const read = f => fs.readFileSync(f, 'utf8'), json = f => JSON.parse(read(f));
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const manifest = json(path.join(DIR, 'theme.json'));
const def = json(path.join(SRC, 'theme.def.json')), recipe = json(path.join(SRC, 'recipe.json'));
const PACK_DIRS = ['underwater-pack', 'muteassets-sea-life-sample', 'pipothai-fish-sampler', 'sageglint-fish-sampler', 'alstra-fish-polypack', 'ocean-animals', 'cute-fish'];
const PACKS = Object.fromEntries(PACK_DIRS.map(d => [d, json(path.join(ROOT, 'kit2/packs', `${d}.json`))]));
const run = (...args) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'under-the-sea-'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const excludedBy = (pack, name) => Object.keys(pack.exclude || {}).some(k => new RegExp(`^(?:${k})$`).test(name));
const gltf = f => { const buf = fs.readFileSync(path.join(DIR, f)), len = buf.readUInt32LE(12); assert.equal(buf.toString('latin1', 16, 20), 'JSON', f); return JSON.parse(buf.toString('utf8', 20, 20 + len)); };
// Names that must never be in a kind sea: what the configs leave out, fishing gear, and anything about hurting.
const LEFT_OUT = /barr?acuda|deep[ _-]?sea|hammerhead|reef[ _-]?shark|SharkV|urchin|lobster|rock[ _-]?fish|angler|piranha|fishing|\brods?\b|\bhooks?\b|hooked|\blures?\b|\bbait\b|\bworm|\bnets?\b|harpoon|spear|teeth|tooth|skull|\bbones?\b|weapon/i;
const UNSAFE_CLIP = /attack|bite|death|dead|die|hit|punch|kick|shoot|gun|ram|threat|pinch|grab|hook|flop|out_?of_?water/i;
const RESTRICTED = ['reodesuxz-underwater', 'sea-life-sample', 'stylized-fish-sampler', 'free-fish-sampler', 'alstra-fish', 'ocean-animals'];
const SWIMMERS = ['dolphin', 'turtle', 'clownfish', 'blue-tang', 'barb', 'goldfish', 'little-clownfish', 'reef-fish', 'bass', 'sardine', 'snapper', 'swordfish', 'squid', 'butterfly-fish', 'yellow-tang', 'mandarin-fish', 'koi', 'lionfish', 'pufferfish', 'seahorse', 'jellyfish', 'little-shark'];

test('the definition builds the same recipe and catalogue every time', () => {
  const t = tmp();
  fs.copyFileSync(path.join(SRC, 'theme.def.json'), path.join(t, 'theme.def.json'));
  run(path.join(ROOT, 'kit2/pipeline/from-def.mjs'), path.join(t, 'theme.def.json'));
  assert.equal(read(path.join(t, 'recipe.json')), read(path.join(SRC, 'recipe.json')), 'recipe.json is what from-def.mjs makes');
  const bare = o => ({ ...o, pieces: o.pieces.map(({ size, note, ...p }) => ({ ...p, ...(note && !/^Its base is/.test(note) ? { note: note.replace(/ Its base is .*$/, '') } : {}) })) });
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
  assert.equal(lock.themes['under-the-sea/1.0.0'], sri(fs.readFileSync(path.join(DIR, 'theme.json'))), 'the lock holds this theme.json');
  for (const [f, v] of Object.entries(manifest.files)) assert.equal(sri(fs.readFileSync(path.join(DIR, f))), v.sha384, f);
});

test('every name in theme.json is a file that exists: 23 animals, 24 pieces, six sounds, no walking heroes', () => {
  assert.equal(manifest.creatures.length, 23); assert.equal(manifest.pieces.length, 24); assert.equal(manifest.sounds.length, 6);
  assert.deepEqual(manifest.heroes, [], 'no walking heroes: the player is a sea animal');
  assert.equal(manifest.moves, undefined, 'so no shared hero moves either');
  assert.ok(!fs.existsSync(path.join(DIR, 'heroes')));
  for (const list of [manifest.creatures, manifest.pieces, manifest.sounds]) {
    const ids = new Set();
    for (const it of list) { assert.ok(fs.statSync(path.join(DIR, it.file)).size > 100, it.file); assert.ok(!ids.has(it.id), `${it.id} once`); ids.add(it.id); assert.match(it.id, /^[a-z][a-z0-9-]*$/); }
  }
  const glbs = walk(DIR).map(f => path.relative(DIR, f).split(path.sep).join('/')).filter(f => f.endsWith('.glb')).sort();
  assert.deepEqual(glbs, [...manifest.creatures.map(c => c.file), ...manifest.pieces.map(p => p.file)].sort(), 'no model rides along unlisted');
  const tagged = t => manifest.pieces.filter(p => p.tags.includes(t)).map(p => p.id);
  assert.ok(tagged('goal').includes('chest') && tagged('coin').includes('coin') && tagged('platform').length >= 2);
  for (const [tag, n] of [['coral', 5], ['plant', 4], ['rock', 2], ['shell', 2], ['ship', 3], ['wreck', 1], ['arch', 1]]) assert.ok(tagged(tag).length >= n, `${tag}: ${tagged(tag).length}`);
  // the look of a sea: blue fog close by, a sandy floor, bubbles; no sea surface below (the world IS under the water)
  assert.equal(manifest.look.weather, 'bubbles'); assert.match(manifest.look.ground, /^#[0-9a-f]{6}$/); assert.equal(manifest.look.water, undefined);
  assert.ok(manifest.look.fog.far <= 120 && manifest.look.fog.near < manifest.look.fog.far);
  assert.ok(manifest.firstLoadBytes < 2.5 * 1024 * 1024, `${(manifest.firstLoadBytes / 1048576).toFixed(2)} MB: well under the 5 MB limit`);
  assert.equal(fs.readFileSync(path.join(DIR, 'cover.webp')).toString('latin1', 8, 12), 'WEBP');
});

test('licences: restricted packs are marked, credited and never offered as files; ALSTRA INFINITE is credited everywhere', () => {
  assert.deepEqual(manifest.packs.map(p => p.id).sort(), [...RESTRICTED, 'kaykit-dungeon', 'kenney-pirate', 'kenney-platformer', 'quaternius-cute-fish'].sort());
  const sources = read(path.join(DIR, 'SOURCES.md')), credits = read(path.join(ROOT, 'docs/media-credits.md'));
  for (const p of manifest.packs) {
    assert.ok(fs.statSync(path.join(DIR, p.licenceFile)).size > 100, p.licenceFile);
    if (!RESTRICTED.includes(p.id)) { assert.equal(p.licence, 'CC0-1.0', p.id); continue; }
    assert.match(p.licence, /^LicenseRef-/, `${p.id} is not CC0 and says so`);
    assert.equal(p.redistribute, false, p.id);
    assert.ok(p.credit && sources.includes(p.author) && credits.includes(p.author), `${p.author} is credited in SOURCES.md and docs/media-credits.md`);
  }
  // the three that forbid machine-learning training say so
  for (const id of ['reodesuxz-underwater', 'stylized-fish-sampler', 'free-fish-sampler']) { assert.equal(manifest.packs.find(p => p.id === id).aiTraining, false, id); assert.match(read(path.join(DIR, manifest.packs.find(p => p.id === id).licenceFile)), /train/i); }
  // the one that requires credit
  const alstra = manifest.packs.find(p => p.id === 'alstra-fish');
  assert.equal(alstra.creditRequired, true); assert.match(alstra.credit, /ALSTRA INFINITE/); assert.match(alstra.credit, /required/);
  assert.match(sources, /ALSTRA INFINITE \(required\)/); assert.match(credits, /Fish - PolyPack Asset[^\n]*ALSTRA INFINITE[^\n]*required/i);
  assert.equal(PACKS['alstra-fish-polypack'].creditRequired, true);
  // every pack config records the licence, that the files are never passed on, and what to do if the repository opens
  for (const d of PACK_DIRS.filter(d => d !== 'cute-fish')) {
    assert.equal(PACKS[d].redistribute, false, d); assert.doesNotMatch(PACKS[d].licence, /^CC0-1\.0$/, d);
    assert.ok(PACKS[d].notes.some(n => /ever becomes public/.test(n) && /removed first/.test(n)), `${d}: says the raw files go if the repository becomes public`);
  }
  // no raw pack file is in this branch (sources stay on branch asset-packs), and nothing links to a model as a download
  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (tracked.status === 0) assert.deepEqual(tracked.stdout.split('\n').filter(f => /\.(fbx|blend|obj)$/i.test(f)), [], 'no raw model files are tracked');
  for (const f of ['server/builder/templates/oomba3d.html', 'kit2/demo/theme-tour.html', 'public/js/studio.js']) assert.doesNotMatch(read(path.join(ROOT, f)), /download[^\n]{0,80}\.glb|\.glb[^\n]{0,80}download/i, f);
});

test('kid-safe: nothing with teeth, no fishing gear, no unkind clip (by name, by source, inside every built model)', () => {
  for (const it of [...manifest.creatures, ...manifest.pieces]) { assert.doesNotMatch(it.id, LEFT_OUT, it.id); assert.doesNotMatch(it.file, LEFT_OUT, it.file); }
  for (const f of walk(DIR).map(f => path.relative(DIR, f))) if (!f.startsWith('LICENSES') && f !== 'SOURCES.md' && f !== 'theme.json') assert.doesNotMatch(f, LEFT_OUT, f);
  // by source: every model built from a pack is one its config keeps
  for (const m of recipe.models) {
    if (m.from.startsWith('theme:')) { assert.match(m.from, /^theme:(castle-quest\/1\.0\.0\/props\/coin|pirate-cove\/1\.0\.0\/world\/sand-patch)\.glb$/); continue; }   // the coin every world has, and the sand patch
    const [dir, file] = m.from.split('/'), name = path.basename(file, '.glb');
    assert.ok(PACKS[dir], `${m.from} comes from one of the seven sea packs`);
    assert.ok(!excludedBy(PACKS[dir], name), `${name} is left out by kit2/packs/${dir}.json`);
  }
  for (const c of recipe.copy) assert.match(c.from, /^theme:(castle-quest|busy-kitchen|pirate-cove)\/1\.0\.0\//, c.from);
  assert.doesNotMatch(JSON.stringify(recipe), /"fish\//, 'nothing from the Quaternius fish pack that has no licence file');
  // the configs still leave out every animal with teeth showing, and the fishing gear
  const out = (d, n) => assert.ok(excludedBy(PACKS[d], n), `${d}: ${n} is left out`);
  out('sageglint-fish-sampler', 'Fish_ReefShark'); out('alstra-fish-polypack', 'SharkV1');
  for (const n of ['baracuda', 'shark', 'hammerhead shark', 'red deep sea fish', 'black deep sea fish', 'green deep sea fish', 'purple deep sea fish', 'black fat deep sea fish', 'brown fat deep sea fish', 'purple fat deep sea fish', 'lobster', 'sea urchin', 'rock fish']) out('ocean-animals', n);
  for (const n of ['Anglerfish', 'Piranha', 'ParrotFish', 'FishingRod_Lvl1', 'FishingRod_Lvl5', 'Lure_1', 'Lure_6', 'Worm']) out('cute-fish', n);
  // inside every built model: no node, mesh, material or picture named after something left out; clips are calm ones
  let clips = 0;
  for (const f of Object.keys(manifest.files).filter(f => f.endsWith('.glb'))) {
    const g = gltf(f);
    for (const kind of ['nodes', 'meshes', 'materials', 'animations']) for (const x of g[kind] || []) if (x.name) assert.doesNotMatch(x.name, /teeth|tooth|hook|lure|bait|rod\b|Outline/i, `${f}: ${kind} "${x.name}"`);
    for (const a of g.animations || []) { assert.doesNotMatch(a.name, UNSAFE_CLIP, `${f}: clip ${a.name}`); clips++; }
    if (!f.startsWith('creatures/')) assert.equal((g.animations || []).length, 0, `${f} is a still piece`);
  }
  assert.ok(clips >= 46, `${clips} clips read`);
  // the one shark: the underwater pack's toy-like model, which has no mouth modelled at all
  assert.deepEqual(manifest.creatures.filter(c => /shark/.test(c.id)).map(c => [c.id, c.pack]), [['little-shark', 'reodesuxz-underwater']]);
  const words = JSON.stringify([manifest.name, manifest.description, manifest.goodFor, manifest.units, manifest.creatures.map(c => [c.id, c.name, c.moves]), manifest.pieces.map(p => [p.id, p.tags, p.note || ''])]);
  assert.doesNotMatch(words, /weapon|sword\b|\bgun|fight|battle|attack|enem(y|ies)|hunt|catch|\btraps?\b|skull|\bbones?\b|\bdead\b|scar(y|e)|poison|bite|teeth|fishing|\bhooks?\b|\bnets?\b/i);
});

test('the animals: swimmers have idle and swim and can be the hero; the crab strolls; all stand on their y and are easy to see', () => {
  assert.deepEqual(manifest.creatures.map(c => c.id), [...SWIMMERS, 'crab']);
  const fromPack = id => manifest.creatures.filter(c => c.pack === id).map(c => c.id);
  assert.deepEqual(fromPack('sea-life-sample'), ['dolphin', 'crab']); assert.deepEqual(fromPack('stylized-fish-sampler'), ['clownfish', 'blue-tang', 'barb']);
  assert.deepEqual(fromPack('free-fish-sampler'), ['goldfish', 'little-clownfish']); assert.deepEqual(fromPack('alstra-fish'), ['reef-fish', 'bass', 'sardine', 'snapper']);
  assert.deepEqual(fromPack('ocean-animals'), ['turtle', 'swordfish', 'squid']); assert.deepEqual(fromPack('reodesuxz-underwater'), ['pufferfish', 'seahorse', 'jellyfish', 'little-shark']);
  assert.deepEqual(fromPack('quaternius-cute-fish'), ['butterfly-fish', 'yellow-tang', 'mandarin-fish', 'koi', 'lionfish']);
  for (const c of manifest.creatures) {
    const g = gltf(c.file), clips = g.animations.map(a => a.name);
    assert.deepEqual([...c.moves].sort(), [...clips].sort(), `${c.id}: moves are exactly its clips`);
    assert.ok(g.skins && g.skins.length >= 1 && g.skins[0].joints.length >= 3 && g.skins.every(k => JSON.stringify(k.joints) === JSON.stringify(g.skins[0].joints)), `${c.id} has one skeleton, shared by all its parts`);
    if (c.id === 'crab') { assert.deepEqual([c.kind, c.playable, c.moves], ['land', false, ['idle', 'stroll']]); continue; }
    assert.equal(c.kind, 'water', c.id); assert.equal(c.playable, true, c.id);
    assert.ok(c.moves.includes('idle') && c.moves.includes('swim') && !c.moves.includes('walk') && !c.moves.includes('jump'), `${c.id}: ${c.moves}`);
    // a size a child can see beside a 2.4 m hero's world, and nothing enormous
    assert.ok(c.size[2] >= 1 && c.size[2] <= 4.6 && c.size[0] >= 0.3 && c.size[1] >= 0.4, `${c.id} is ${c.size}`);
    assert.ok(manifest.files[c.file].bytes <= 180 * 1024, `${c.id} is ${manifest.files[c.file].bytes} bytes`);
    // it stands on its y: the lowest corner of its mesh is at 0 (within a few centimetres), and it is centred
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const m of g.meshes) for (const p of m.primitives) { const a = g.accessors[p.attributes.POSITION]; if (a.normalized || a.componentType !== 5126) continue; a.min.forEach((v, i) => { lo[i] = Math.min(lo[i], v); }); a.max.forEach((v, i) => { hi[i] = Math.max(hi[i], v); }); }
    if (def.creatures.find(d => d.id === c.id).swimRig && lo[1] !== Infinity) { assert.ok(Math.abs(lo[1]) < 0.05, `${c.id}: lowest point ${lo[1]}`); assert.ok(Math.abs(lo[0] + hi[0]) < 0.1 && Math.abs(lo[2] + hi[2]) < 0.1, `${c.id} is centred`); }
  }
  // the dolphin's leap is a trick, not the hero's jump (a swimmer does not jump)
  assert.deepEqual(manifest.creatures[0].moves.slice().sort(), ['chatter', 'idle', 'leap', 'spin', 'swim']);
  // the fish that arrived still have exactly the two clips the pipeline makes, each one beat long and looping
  for (const d of def.creatures.filter(d => d.swimRig)) {
    const g = gltf(`creatures/${d.id}.glb`);
    assert.deepEqual(g.animations.map(a => a.name).sort(), ['idle', 'swim'], d.id);
    for (const a of g.animations) for (const ch of a.channels) assert.equal(ch.target.path, 'rotation', `${d.id}: a spine only turns`);
  }
});

test('the starter is swum: swim controls, bubbles, shoals and friends from this world, and the scanner accepts it', async () => {
  const K = await import('../../server/builder/kit2.js');
  const { scanVersion } = await import('../../server/services/scanner.js');
  const V = await import('../../server/services/vendor.js');
  const ids = new Set(manifest.pieces.map(p => p.id)), zoo = new Set(manifest.creatures.map(c => c.id)), lay = K.STARTERS['under-the-sea'];
  for (const [id] of [lay.ground, lay.side, lay.step, lay.pad, lay.goal, lay.landmark, ...lay.scenery]) assert.ok(ids.has(id), id);
  assert.equal(lay.swim, true); assert.equal(lay.weather, 'bubbles'); assert.equal(lay.sea, '');
  for (const [id, n] of lay.shoals) { assert.ok(zoo.has(id), id); assert.ok(n >= 3 && n <= 12, `${id}: ${n}`); }
  for (const id of lay.friends) assert.ok(zoo.has(id), id);
  assert.ok(lay.friends.length + lay.shoals.length <= 8, 'at most 8 animals and shoals beside the way');
  assert.ok(manifest.pieces.find(p => p.id === lay.goal[0]).tags.includes('goal'));
  // who plays: the dolphin unless another swimmer is asked for; a walking hero or the crab is not in this world's hero slot
  assert.deepEqual(K.heroesOf('under-the-sea').map(h => h.id), SWIMMERS);
  assert.equal(K.heroFor('under-the-sea', ''), 'dolphin'); assert.equal(K.heroFor('under-the-sea', 'turtle'), 'turtle');
  assert.equal(K.heroFor('under-the-sea', 'knight'), 'dolphin'); assert.equal(K.heroFor('under-the-sea', 'crab'), 'dolphin');
  for (const hero of ['dolphin', 'turtle', 'clownfish']) {
    const html = K.kit2Starter({ world: 'under-the-sea', hero, companion: 'crab' });
    const r = scanVersion(html);
    assert.equal(r.status, 'pass', JSON.stringify(r.issues)); assert.deepEqual(r.lint, []);
    assert.deepEqual(K.kit2Of(html), { world: 'under-the-sea', version: '1.0.0', hero, companion: 'crab' });
    assert.ok(html.includes(V.kit2ImportMap()));
    assert.match(html, /\n  swim: true,\n/); assert.match(html, /\n  weather: 'bubbles',\n/); assert.match(html, /shoals: \[\["sardine",9\]/);
    assert.doesNotMatch(html, /new Worker|\beval\(|new Function/);
  }
  // every other world's starter is as it was: no swim line, its own weather
  for (const w of K.KIT2_WORLDS.filter(w => w.id !== 'under-the-sea')) { const html = K.kit2Starter({ world: w.id }); assert.doesNotMatch(html, /\n  swim: true,\n/, w.id); assert.match(html, /\n  weather: 'clear',\n/, w.id); }
  // the words are about swimming, in every language the starter speaks
  const tpl = read(path.join(ROOT, 'server/builder/templates/oomba3d.html'));
  assert.equal((tpl.match(/swimSub: '/g) || []).length, 13); assert.equal((tpl.match(/swimAsk: '/g) || []).length, 13);
  const tour = read(path.join(ROOT, 'kit2/demo/theme-tour.html')).replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap()).replace("'THEME_ID'", "'under-the-sea'").replace("'THEME_VERSION'", "'1.0.0'").replace("'THEME_TIME'", "'day'");
  assert.deepEqual(scanVersion(tour).issues.filter(i => i.level === 'fail'), []);
  assert.equal(scanVersion(K.kit2Starter({ world: 'under-the-sea' }).replace("version: '1.0.0'", "version: '1.0.9'")).status, 'fail', 'a version that never shipped is refused');
});

test('the Builder: sea places and sea animals choose this world; an animal is never an enemy; the rules say how to swim', async () => {
  const K = await import('../../server/builder/kit2.js');
  const want = text => K.wantsKit2({}, text, null);
  for (const [text, hero] of [['a maths game under the sea', 'dolphin'], ['an underwater adventure', 'dolphin'], ['count the shells on the coral reef', 'dolphin'], ['a fish game on the coral reef', 'clownfish'], ['a sea turtle game in the ocean', 'turtle'],
    ['swim through the ocean as a dolphin', 'dolphin'], ['Make it a 3D game in the Under the Sea world.', 'dolphin'], ['a 3D seahorse game', 'seahorse'], ['a 3D clownfish game', 'clownfish'], ['a shipwreck under the sea', 'dolphin']]) {
    const p = want(text);
    assert.ok(p, text); assert.deepEqual([p.world, p.hero], ['under-the-sea', hero], text); assert.ok(!p.missing, text);
  }
  // a walking hero asked for under the sea is said honestly to be missing, and a sea animal plays
  const wiz = want('a wizard game under the sea');
  assert.deepEqual([wiz.world, wiz.hero, wiz.missing], ['under-the-sea', 'dolphin', 'mage']);
  assert.match(K.kit2Note(wiz), /Under the Sea has no Wizard: say so kindly/);
  // a crab cannot be the hero: it comes along
  const crab = want('a 3D game under the sea with a crab');
  assert.deepEqual([crab.world, crab.hero, crab.companion], ['under-the-sea', 'dolphin', 'crab']);
  // other worlds keep their words: pirates stay in the cove, a sea horse is not a horse, and 2D stays 2D
  assert.equal(want('a pirate treasure game').world, 'pirate-cove'); assert.equal(want('a 3D horse game').hero, 'horse');
  for (const text of ['a 2D game under the sea', 'an ocean memory game', 'catch the falling fish', 'a word search about dolphins']) assert.equal(want(text), null, text);
  assert.match(K.KIT2_RULES, /This world is under water and has no walking heroes/); assert.match(K.KIT2_RULES, /swim: true/);
  assert.match(K.KIT2_RULES, /crab \(Crab\) [\dx.]+ moves idle\/stroll not playable \(it only strolls along the sea floor\)/);
  assert.match(K.KIT2_RULES, /no game is about hurting, hunting, catching or selling one/);
  assert.deepEqual(K.worldLook('under-the-sea'), ['🐬', 'ocean']);
});

test('2D: the sea world and every sea animal are in the 2D packs, and sea animals can be the friends of a 2D game (Oomba2D 1.1.0)', async () => {
  const vm = await import('node:vm');
  const S = await import('../../server/services/art2d.js'), A = await import('../../server/builder/art2d.js');
  assert.equal(S.ART2D_PACKS['under-the-sea'], '1.0.0'); assert.equal(S.ART2D_PACKS.animals, '1.1.0');
  const sea = A.ART2D_ANIMALS.filter(c => c.group === 'sea');
  assert.deepEqual(sea.map(c => c.id).sort(), manifest.creatures.map(c => c.id).sort()); assert.ok(sea.every(c => c.pack === 'animals'));
  for (const c of sea) assert.ok(fs.existsSync(path.join(ROOT, 'public/img/art2d/animals', `${c.id}.webp`)) && fs.existsSync(path.join(ROOT, 'public/img/kit2/heroes', `${c.id}.webp`)), `${c.id}: picker pictures`);
  assert.equal(A.art2dTags({ world: 'under-the-sea', hero: 'dolphin', friends: ['turtle', 'crab'] }), [S.oomba2dTag(), S.art2dPackTag('under-the-sea'), S.art2dPackTag('animals')].join('\n'));
  // the helper itself, with the real manifests: the dolphin plays, three sea friends are in the game, pictures only
  const loads = [], defined = {};
  class Image { set src(v) { loads.push(v); setTimeout(() => this.onload && this.onload(), 0); } }
  const ctx2d = { drawImage() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  const document = { currentScript: null, createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {}, setAttribute() {} }), querySelectorAll: () => [], documentElement: {} };
  const window = { Oomba: { art: { define: (n, d) => { defined[n] = d; } }, settings: { reduced: false } } };
  const sandbox = { window, document, Image, setTimeout, Promise, console };
  vm.createContext(sandbox); vm.runInContext(read(path.join(ROOT, 'public/vendor/art2d/oomba2d', S.OOMBA2D_VERSION, 'oomba2d.js')), sandbox);
  for (const id of ['under-the-sea', 'animals']) { document.currentScript = { src: `http://x.invalid/vendor/art2d/${id}/${S.ART2D_PACKS[id]}/pack.js` }; window.Oomba2D.pack(JSON.parse(JSON.stringify(S.art2dManifest(id)))); }
  const art = await window.Oomba2D.use({ world: 'under-the-sea', hero: 'dolphin', friends: ['turtle', 'clownfish', 'crab', 'dolphin', 'no-such-fish'] });
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual([...art.friends], ['turtle', 'clownfish', 'crab'], 'the player is not its own friend; a made-up fish is left out');
  for (const id of ['dolphin', 'turtle', 'clownfish', 'crab']) assert.ok(loads.some(u => u.endsWith(`/vendor/art2d/animals/1.1.0/${id}.webp`)), `${id}'s sheet is loaded from the pack's folder`);
  assert.ok(loads.some(u => u.endsWith('/vendor/art2d/under-the-sea/1.0.0/mid.webp')));
  assert.ok(Object.keys(defined).some(n => n.startsWith('a2d:friend:')), 'the friends are kit sprites');
});

// ---------------------------------------------------------------- real Chromium, inside the production frame
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
let browser;
test.after(async () => { if (browser) await browser.close(); });

test('a whole round as the dolphin in the production frame: swim, a coin, a wrong and the right answers, the treasure', { skip, timeout: 420_000 }, async () => {
  const K = await import('../../server/builder/kit2.js');
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  const { vendorFile } = await import('../../server/services/snapshot.js');
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const HOST = 'http://game.invalid', ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const doc = frameDocument(K.kit2Starter({ world: 'under-the-sea', hero: 'dolphin' }), { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false });
  const outer = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe><script>window.__msgs=[];addEventListener('message',e=>{if(e.data&&e.data.type)__msgs.push(e.data.type)});</script>`;
  const outside = [], asked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: outer });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) { asked.push(new URL(u).pathname); return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    outside.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(HOST + '/');
  const frame = page.frames().find(f => f.url() === HOST + '/frame');
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 90_000 });
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().scene === 'title', null, { timeout: 150_000 });
  const state = () => frame.evaluate(() => window.__brbTest.state());
  let s = await state();
  assert.deepEqual([s.scene, s.world, s.heroId, s.score, s.answered, s.questions], ['title', 'under-the-sea', 'dolphin', 0, 0, 2]);
  assert.equal(await frame.evaluate(() => document.querySelector('#t-title').textContent), 'Under the Sea');
  assert.match(await frame.evaluate(() => document.querySelector('#t-sub').textContent), /^Swim along/);
  // the art comes from this world's pinned folder and the pinned engines, and from nowhere else: the hero is an animal file
  assert.ok(asked.includes('/vendor/themes/under-the-sea/1.0.0/creatures/dolphin.glb'), 'the dolphin\'s model');
  for (const id of ['sardine', 'yellow-tang', 'barb', 'turtle', 'jellyfish', 'seahorse', 'pufferfish', 'crab']) assert.ok(asked.includes(`/vendor/themes/under-the-sea/1.0.0/creatures/${id}.glb`), `${id} is in the sea`);
  for (const u of asked) assert.ok(u.startsWith('/vendor/themes/under-the-sea/1.0.0/') || u.startsWith('/vendor/kit2/') || u.startsWith('/vendor/three/'), u);
  assert.ok(!asked.some(u => u.includes('/heroes/')), 'no walking hero is loaded');
  await frame.click('#play');
  await until(() => window.__brbTest.state().scene === 'play');
  assert.match(await frame.evaluate(() => document.querySelector('#ask').textContent), /Swim to the answer: 7 × 8 = \?/);
  // bubbles rise, and the swim buttons are the pad's (no Jump in the sea)
  assert.ok(await frame.evaluate(() => document.querySelectorAll('.o3-swim button').length === 2), 'up and down swim buttons');
  // the keyboard swims: forward with the arrow, up with Space, and it never falls
  await page.focus('iframe');
  const z0 = (await state()).hero.z, y0 = (await state()).hero.y;
  await page.keyboard.down('ArrowUp'); await until(z => window.__brbTest.state().hero.z < z - 0.5, z0); await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space'); await until(y => window.__brbTest.state().hero.y > y + 0.6, y0); await page.keyboard.up('Space');
  s = await state(); assert.ok(s.hero.y >= 0.4 && s.hero.y <= 9, `the hero stays between the sand and the ceiling (${s.hero.y})`);
  // a coin, the goal too early, a wrong answer, the right answers, then the treasure
  const spots = await frame.evaluate(() => window.__brbTest.spots());
  await frame.evaluate(c => window.__brbTest.put(c[0], c[1] - 0.5, c[2]), spots.coins[2]);
  await until(() => window.__brbTest.state().coins >= 1);
  const goal = spots.goal.map((v, i) => (i === 1 ? v + 2 : v));
  await frame.evaluate(g => window.__brbTest.put(...g), goal);
  await until(() => /Answer the question first/.test(document.querySelector('.o3-toast').textContent));
  assert.equal((await state()).scene, 'play', 'the treasure waits for the answers');
  const wrong = spots.pads[0].find(p => !p.right), right0 = spots.pads[0].find(p => p.right), right1 = spots.pads[1].find(p => p.right);
  await frame.evaluate(p => window.__brbTest.put(...p.at), wrong);
  await until(a => new RegExp(`Not ${a}!`).test(document.querySelector('.o3-toast').textContent), wrong.answer);
  assert.equal((await state()).answered, 0, 'a wrong answer costs nothing and can be tried again');
  const before = (await state()).score;
  await frame.evaluate(p => window.__brbTest.put(...p.at), right0);
  await until(() => window.__brbTest.state().answered === 1);
  assert.equal((await state()).score, before + 5);
  await frame.evaluate(p => window.__brbTest.put(...p.at), right1);
  await until(() => window.__brbTest.state().answered === 2);
  // the animals beside the way never took a point or stopped the hero: swim straight through where a friend drifts
  const scoreNow = (await state()).score;
  await frame.evaluate(g => window.__brbTest.put(...g), goal);
  await until(() => window.__brbTest.state().scene === 'win');
  assert.equal((await state()).score, scoreNow);
  await until(() => !document.querySelector('#end').hidden);
  assert.match(await frame.evaluate(() => document.querySelector('#e-score').textContent), /Score: \d+/);
  assert.ok((await page.evaluate(() => window.__msgs)).includes('brb:gameover'), 'the round\'s end reaches the page (BRB.gameOver)');
  await frame.click('#again');
  await until(() => window.__brbTest.state().scene === 'play');
  s = await state();
  assert.deepEqual([s.score, s.coins, s.answered], [0, 0, 0]);
  if (process.env.K2_SHOTS) await page.screenshot({ path: path.join(process.env.K2_SHOTS, 'builder-under-the-sea-dolphin.png') });
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, [], 'nothing asked for outside /vendor');
  await ctx.close();
});

// The models themselves, rebuilt from the converted packs and compared byte for byte. The packs are not in this
// repository (raw packs never are: kit2/README.md), so this runs only where they are: KIT2_RAW_PACKS=<fbx-to-glb.mjs
// output> KIT2_PACKS=<the uploaded packs> KIT2_TOOLS=<folder with the pipeline and its packages installed>.
const E = process.env, canRebuild = E.KIT2_RAW_PACKS && E.KIT2_PACKS && E.KIT2_TOOLS && fs.existsSync(path.join(E.KIT2_RAW_PACKS || '', 'underwater-pack'));
test('the models rebuild to the same bytes from the converted packs', { skip: canRebuild ? false : 'needs the converted packs (KIT2_RAW_PACKS with the seven sea packs, KIT2_PACKS, KIT2_TOOLS)' }, () => {
  const t = tmp();
  for (const f of fs.readdirSync(path.join(ROOT, 'kit2/pipeline'))) fs.copyFileSync(path.join(ROOT, 'kit2/pipeline', f), path.join(E.KIT2_TOOLS, f));
  const r = spawnSync(process.execPath, [path.join(E.KIT2_TOOLS, 'build-theme.mjs'), path.join(SRC, 'recipe.json'), E.KIT2_RAW_PACKS, path.join(t, 'out'), path.join(t, 'sizes.json'), E.KIT2_PACKS], { cwd: E.KIT2_TOOLS, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, r.stderr);
  const built = walk(path.join(t, 'out')).map(f => path.relative(path.join(t, 'out'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(built, Object.keys(manifest.files).filter(f => /\.(glb|ogg)$/.test(f)).sort());
  for (const f of built) assert.equal(sri(fs.readFileSync(path.join(t, 'out', f))), manifest.files[f].sha384, f);
  fs.rmSync(t, { recursive: true });
});
