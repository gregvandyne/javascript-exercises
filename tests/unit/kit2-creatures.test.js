// Oomba3D 1.2.0's animals (docs/kit2-api.md, "g.creature"), and the promise that older games are not touched:
//   - every built theme file: no clip named attack, death, hit, punch, kick, shoot, gun or bite (the heroes' shared
//     moves.glb, frozen since 1.0.0, has exactly one such name, the "bump" move, and may never gain another);
//   - every creature's catalogue moves are clips in its file, and a playable one has what a hero needs;
//   - version pinning: the scanner accepts the import map of every shipped Oomba3D and no other, and a game that
//     carries the 1.1.0 map gets Oomba3D 1.1.0, byte for byte the file that shipped;
//   - in real Chromium, in the production game frame under the frame CSP (import map, WebAssembly, no eval, no
//     workers): the animals demo (kit2/demo/creatures.html) spawns every creature, they walk, hop, follow a path, trail
//     the hero and greet them, never hurt or block; a playable animal runs and jumps; reduced motion; the Builder's
//     starter with a companion; swimming and bubbles.
// Needs a local Chromium for the play tests; skipped when there is none. K2_SHOTS=<dir> saves screenshots there.
// Software rendering is slow (a few frames a second), so every step waits for what it checks, never for a fixed time.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = await import('../../server/services/vendor.js');
const K = await import('../../server/builder/kit2.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { lintKit2 } = await import('../../server/services/kit2-lint.js');
const THEMES = path.join(ROOT, 'public/vendor/themes');
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit2/SHIPPED.json'), 'utf8'));
const DEMO = fs.readFileSync(path.join(ROOT, 'kit2/demo/creatures.html'), 'utf8');
const SKY = fs.readFileSync(path.join(ROOT, 'kit2/demo/sky-islands.html'), 'utf8');
const HOST = 'http://game.invalid';
const UNSAFE = /attack|death|hit|punch|kick|shoot|gun|bite/i;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
/** The clip names inside a binary glTF (its JSON chunk). */
const clipsOf = file => { const b = fs.readFileSync(file); assert.equal(b.subarray(0, 4).toString('latin1'), 'glTF', file); return (JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')).animations || []).map(a => a.name); };
const versions = fs.readdirSync(THEMES).flatMap(t => fs.readdirSync(path.join(THEMES, t)).map(v => ({ theme: t, version: v, dir: path.join(THEMES, t, v), manifest: JSON.parse(fs.readFileSync(path.join(THEMES, t, v, 'theme.json'), 'utf8')) })));
const withCreatures = versions.filter(v => (v.manifest.creatures || []).length);
const demo = (theme, version, hero, graphics = 'low', engine = V.OOMBA3D_VERSION) => DEMO.replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap(engine)).replace("'THEME_ID'", `'${theme}'`).replace("'THEME_VERSION'", `'${version}'`).replace("'PLAY_AS'", `'${hero}'`).replace("'GRAPHICS'", `'${graphics}'`);

// ---------------------------------------------------------------- built files
test('no built theme file has a clip named attack, death, hit, punch, kick, shoot, gun or bite', () => {
  let files = 0, clips = 0;
  for (const { theme, version, dir } of versions) for (const f of walk(dir).filter(f => f.endsWith('.glb'))) {
    const rel = path.relative(dir, f).split(path.sep).join('/'), names = clipsOf(f);
    files++; clips += names.length;
    // The heroes' shared moves (KayKit, frozen since Sky Islands 1.0.0) call the "bump" move Hit_A: a hero bumping into
    // something. It is the one such name anywhere, it is in no creature file, and no other may join it.
    const bad = names.filter(n => UNSAFE.test(n));
    if (rel === 'heroes/moves.glb') assert.deepEqual(bad, ['Hit_A'], `${theme} ${version} ${rel}: only the shipped "bump" move`);
    else assert.deepEqual(bad, [], `${theme} ${version} ${rel}`);
  }
  assert.ok(files > 300 && clips > 100, `${files} files, ${clips} clips read`);
});

test('at least two worlds ship animals, and the T-Rex is not one of them', () => {
  assert.ok(withCreatures.length >= 2);
  const ids = new Set(withCreatures.flatMap(v => v.manifest.creatures.map(c => c.id)));
  for (const id of ['donkey', 'cow', 'husky', 'pig', 'sheep', 'horse', 'deer', 'stag', 'fox', 'shiba']) assert.ok(ids.has(id), id);
  assert.ok(![...ids].some(id => /rex|raptor|shark|wolf/.test(id)), 'nothing with teeth showing ships here');
});

for (const { theme, version, dir, manifest } of withCreatures) {
  test(`${theme} ${version}: every creature's moves are clips in its own file, calm ones only`, () => {
    const packs = new Set(manifest.packs.map(p => p.id)), ids = new Set();
    for (const c of manifest.creatures) {
      assert.match(c.id, /^[a-z][a-z0-9-]{1,30}$/); assert.ok(!ids.has(c.id), `${c.id} once`); ids.add(c.id);
      assert.ok(c.name && manifest.files[c.file] && packs.has(c.pack), `${c.id}: a name, a file of the theme, a listed pack`);
      assert.ok(!(manifest.heroes || []).some(h => h.id === c.id), `${c.id} is not also a hero's name`);
      const clips = clipsOf(path.join(dir, c.file));
      assert.deepEqual([...c.moves].sort(), [...clips].sort(), `${c.id}: moves are exactly the clips in the file`);
      assert.ok(c.moves.includes('idle'), `${c.id} can stand`);
      for (const m of c.moves) assert.ok(!UNSAFE.test(m), `${c.id}: ${m}`);
      assert.ok(['land', 'water', 'air'].includes(c.kind), `${c.id} kind`);
      assert.ok(Array.isArray(c.size) && c.size.length === 3 && c.size.every(n => n > 0.2 && n < 20), `${c.id} size (width, height, length)`);
      // Playable: what the hero's controls play. An animal without a walk (it hops) is never playable.
      assert.equal(typeof c.playable, 'boolean');
      if (c.playable) for (const m of ['idle', 'walk', 'run', 'jump']) assert.ok(c.moves.includes(m), `${c.id} is playable, so it has ${m}`);
      else assert.ok(!c.moves.includes('walk'), `${c.id} is not playable only because it cannot walk`);
      // What keeps feet from sliding: the clip's own speed over the ground, and the part of the jump spent in the air.
      if (c.moves.includes('walk')) assert.ok(c.pace && c.pace.walk > 0.3 && c.pace.run > c.pace.walk, `${c.id} pace`);
      if (c.moves.includes('jump')) assert.ok(Array.isArray(c.jumpAir) && c.jumpAir[0] >= 0 && c.jumpAir[1] <= 1 && c.jumpAir[1] - c.jumpAir[0] > 0.15, `${c.id} jumpAir`);
    }
    assert.ok(manifest.firstLoadBytes < 5 * 1024 * 1024, `${(manifest.firstLoadBytes / 1048576).toFixed(2)} MB`);
  });

  test(`${theme} ${version}: everything the version before it had is still here, byte for byte`, () => {
    const before = versions.filter(v => v.theme === theme && v.version.localeCompare(version, undefined, { numeric: true }) < 0).sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true })).pop();
    assert.ok(before, 'creatures joined an existing world as a new version');
    for (const [f, info] of Object.entries(before.manifest.files)) if (/\.(glb|ogg)$/.test(f)) assert.equal(manifest.files[f] && manifest.files[f].sha384, info.sha384, `${f} is unchanged from ${before.version}`);
    for (const key of ['heroes', 'pieces', 'sounds', 'moves', 'look']) assert.deepEqual(manifest[key], before.manifest[key], `${key} are the same as in ${before.version}`);
    assert.ok(LOCK.themes[`${theme}/${before.version}`] && LOCK.themes[`${theme}/${version}`], 'both versions are locked');
  });
}

test('the Builder catalogue lists each creature with moves, size, kind and playable, and every move is in the file', () => {
  const seen = [];
  for (const w of K.KIT2_WORLDS) for (const c of w.creatures) {
    seen.push(c.id);
    assert.deepEqual(Object.keys(c).sort(), ['id', 'kind', 'moves', 'name', 'playable', 'size']);
    const m = JSON.parse(fs.readFileSync(path.join(THEMES, w.id, w.version, 'theme.json'), 'utf8')).creatures.find(x => x.id === c.id);
    const clips = clipsOf(path.join(THEMES, w.id, w.version, m.file));
    for (const move of c.moves) assert.ok(clips.includes(move), `${w.id} ${c.id}: the catalogue's move "${move}" is a clip in ${m.file}`);
    assert.ok(K.KIT2_RULES.includes(`${c.id} (${c.name}) ${c.size.join('x')} moves ${c.moves.join('/')}`), `${c.id} is in the rules with its moves`);
    assert.equal(K.heroesOf(w.id).some(h => h.id === c.id), c.playable, `${c.id}: the hero slot takes it only when it is playable`);
  }
  assert.ok(seen.length >= 10);
  assert.deepEqual([...K.CREATURE_IDS].sort(), [...new Set(seen)].sort());
  assert.match(K.KIT2_RULES, /Never invent a creature name/);
  assert.match(K.KIT2_RULES, /Animals are never enemies or obstacles/);
});

// ---------------------------------------------------------------- the library's own promises, read from its source
test('Oomba3D 1.2.0: creatures are never solid, the library refuses unkind clips, and big animals are slow', () => {
  const lib = fs.readFileSync(path.join(ROOT, 'public', V.OOMBA3D_MODULE), 'utf8');
  assert.match(lib, /export const VERSION = '1\.2\.0';/);
  assert.match(lib, /export const NEVER_PLAYED = \/attack\|death\|hit\|punch\|kick\|shoot\|gun\|bite\/i;/);
  // every place a creature's or a piece's clips are collected filters them
  assert.equal((lib.match(/\.animations\.filter\(c => !NEVER_PLAYED\.test\(c\.name\)\)/g) || []).length, 3, 'creature, school and piece clips');
  // nothing in the creature code touches the hero's score, lives or position, or adds a creature to what the hero collides with
  const from = lib.indexOf('// ---- creatures (1.2.0)'), to = lib.indexOf('function followCamera(');
  assert.ok(from > 0 && to > from);
  const code = lib.slice(from, to);
  assert.ok(!/solids\.push|score\(|points|\.sink\(|fallY|home\b.*copy|player\.position\.(set|copy|add)/.test(code), 'the creature code never pushes a solid, changes the score or moves the hero');
  assert.match(code, /top = large \? 2\.5 : hops \? 3 : 5/, 'a big animal never goes faster than 2.5 by itself, the others 5 (the hero runs at 7)');
  assert.match(lib, /export const CREATURE_LIMITS = \{ low: \{ moving: 6, shown: 10, school: 12 \}/);
  // no network, nothing stored
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|new Worker/.test(lib));
});

// ---------------------------------------------------------------- versions: a saved game keeps its Oomba3D
const sri = f => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
test('version pinning: each shipped Oomba3D has its own import map, pointing at the unchanged file', () => {
  assert.equal(V.OOMBA3D_VERSION, '1.2.0');
  assert.deepEqual(V.OOMBA3D_VERSIONS, ['1.0.0', '1.1.0', '1.2.0']);
  for (const v of V.OOMBA3D_VERSIONS) {
    const map = V.KIT2_IMPORT_MAPS[v], file = `/vendor/kit2/oomba3d/${v}/oomba3d.js`;
    assert.equal(map.imports.oomba3d, file);
    assert.equal(map.integrity[file], LOCK.engines[`oomba3d/${v}/oomba3d.js`]);
    assert.equal(sri(path.join(ROOT, 'public', file)), LOCK.engines[`oomba3d/${v}/oomba3d.js`], `oomba3d ${v} is the file that shipped`);
    assert.equal(Object.keys(map.integrity).filter(k => k.includes('/oomba3d/')).length, 1, 'one Oomba3D per map');
    assert.ok(V.kit2ImportMap(v).includes(`"oomba3d": "${file}"`));
    assert.equal(V.oomba3dVersionOf(`<title>x</title>${V.kit2ImportMap(v)}`), v);
  }
  assert.equal(V.kit2ImportMap(), V.kit2ImportMap('1.2.0'), 'a new game gets the newest');
  assert.throws(() => V.kit2ImportMap('1.3.0'), /has not shipped/);
  // The two frozen engines, by the hashes they shipped with (written out here on purpose).
  assert.equal(LOCK.engines['oomba3d/1.0.0/oomba3d.js'], 'sha384-nkfQSRr1TLKszkcUxN/nwpQY+uSsLTeGWhUP74kZob19abJvFNnrNLpJJBzSi0if');
  assert.equal(LOCK.engines['oomba3d/1.1.0/oomba3d.js'], 'sha384-qlle91fvPUmtVUbNenduw1SFbOyT5911T8KsVxb3Dl2b7qmqChvJ3Zh8yoxe9brH');
});

test('the scanner: a game on any shipped Oomba3D passes, an unknown version or a changed map does not', () => {
  const fails = h => scanVersion(h).issues.filter(i => i.level === 'fail').map(i => i.code);
  const game = v => SKY.replace('<!-- KIT2_IMPORT_MAP -->', V.kit2ImportMap(v));
  for (const v of V.OOMBA3D_VERSIONS) assert.deepEqual(fails(game(v)), [], `a game pinned to Oomba3D ${v}`);
  // a version that never shipped (the map of 1.2.0 with its number changed)
  const unknown = game('1.2.0').split('/oomba3d/1.2.0/').join('/oomba3d/1.3.0/');
  assert.ok(fails(unknown).includes('kit2_pin') || fails(unknown).includes('three_pin'), 'Oomba3D 1.3.0 has not shipped');
  // one version's file with another version's integrity
  const mixed = game('1.2.0').replace(LOCK.engines['oomba3d/1.2.0/oomba3d.js'], LOCK.engines['oomba3d/1.1.0/oomba3d.js']);
  assert.ok(fails(mixed).length, 'the integrity must be that version\'s own');
  // two Oomba3D versions in one map
  const both = game('1.2.0').replace('"oomba3d": "/vendor/kit2/oomba3d/1.2.0/oomba3d.js"', '"oomba3d": "/vendor/kit2/oomba3d/1.2.0/oomba3d.js",\n  "oomba3d-old": "/vendor/kit2/oomba3d/1.1.0/oomba3d.js"');
  assert.ok(fails(both).length, 'exactly one of the shipped maps');
});

test('the scanner and the notes: a 1.2.0 game with a shipped creature passes; unknown worlds, versions and animals do not go unnoticed', () => {
  const fails = h => scanVersion(h).issues.filter(i => i.level === 'fail').map(i => i.code);
  for (const { theme, version, manifest } of withCreatures) {
    const playable = manifest.creatures.find(c => c.playable), any = manifest.creatures[manifest.creatures.length - 1];
    const filled = demo(theme, version, playable.id);
    assert.deepEqual(fails(filled), [], `the animals demo in ${theme} ${version}`);
    if (K.worldById(theme).version !== version) continue;   // the Builder offers the newest version only
    const html = K.kit2Starter({ world: theme, hero: playable.id, companion: any.id });
    assert.ok(html.includes(`hero: '${playable.id}',`) && html.includes(`companion: '${any.id}',`) && html.includes(V.kit2ImportMap()));
    assert.equal(scanVersion(html).status, 'pass'); assert.deepEqual(lintKit2(html), []);
    assert.deepEqual(K.kit2Of(html), { world: theme, version, hero: playable.id, companion: any.id });
    assert.equal(K.hasAnimals(html), true);
    // an animal that does not exist, as the companion or in code
    assert.deepEqual(lintKit2(html.replace(`companion: '${any.id}',`, "companion: 't-rex',")).map(l => l.code), ['kit2_creature']);
    assert.deepEqual(lintKit2(html + "<script type=\"module\">g.creature('dragon'); g.school('clownfish', 9);</script>").map(l => l.code), ['kit2_creature']);
    assert.match(lintKit2(html + "<script type=\"module\">g.creature('dragon');</script>")[0].message, /has no animal called "dragon"[\s\S]*never invent one/);
    // a version of this world that has not shipped
    assert.deepEqual(fails(html.replace(`version: '${version}',`, "version: '9.9.9',")), ['kit2_theme']);
    // the same game on the Oomba3D before animals: a note says why it cannot work (the safety result does not change)
    const old = html.replace(V.kit2ImportMap(), V.kit2ImportMap('1.1.0'));
    assert.equal(scanVersion(old).status, 'pass'); assert.deepEqual(lintKit2(old).map(l => l.code), ['kit2_engine']); assert.equal(K.hasAnimals(old), false);
  }
  // a world with no animals: a companion is an invented name there
  const sky = K.kit2Starter({ world: 'sky-islands', hero: 'knight', companion: 'cow' });
  assert.ok(sky.includes("companion: '',"), 'the starter never writes an animal the world does not have');
  assert.match(lintKit2(sky.replace("companion: '',", "companion: 'cow',"))[0].message, /This world has no animals yet/);
  // a hopper as the hero
  const pig = K.kit2Starter({ world: 'medieval-village', hero: 'pig' });
  assert.ok(pig.includes("hero: 'knight',"), 'the starter never makes a hopper the hero');
  assert.match(lintKit2(pig.replace("hero: 'knight',", "hero: 'pig',"))[0].message, /the pig cannot be the hero/);
});

test('the Builder: an animal that exists is used, one that does not gets the honest "not yet"', () => {
  const want = (text, version = null, state = {}) => K.wantsKit2(state, text, version);
  // in a world that has it: as the hero when it can be one, as a companion when a hero is named or it only hops
  assert.deepEqual(want('a 3D horse game'), { world: 'castle-quest', hero: 'horse', by: 'name', wantsCreature: false, changed: false });
  let p = want('a castle game where a knight walks with his dog');
  assert.deepEqual([p.world, p.hero, p.companion, p.wantsCreature], ['castle-quest', 'knight', 'shiba', false], '"a dog" is the shiba at the castle');
  p = want('a village game with my dog');
  assert.deepEqual([p.world, p.hero, p.companion], ['medieval-village', 'knight', 'husky'], 'and the husky in the village');
  p = want('Make it a 3D game in the Medieval Village world. Use the 3D hero Pig.');
  assert.deepEqual([p.world, p.hero, p.companion, p.by], ['medieval-village', 'knight', 'pig', 'chip'], 'a pig cannot be the hero: it comes along');
  assert.match(K.kit2Note(p), /The animal that comes along: pig \(Pig\), as CONFIG\.companion/);
  // an animal the chosen world does not have
  p = want('a village game with a pet fox');
  assert.deepEqual([p.world, p.companion, p.missing], ['medieval-village', undefined, 'fox']);
  assert.match(K.kit2Note(p), /Medieval Village has no Fox: say so kindly/);
  // one no world has: never invented
  for (const text of ['a dinosaur game on the moon', 'a castle game with a dragon', 'a village game with a t-rex and a cat']) {
    p = want(text);
    assert.equal(p.wantsCreature, true, text); assert.equal(p.companion, undefined); assert.ok(K.heroesOf(p.world).some(h => h.id === p.hero));
    assert.match(K.kit2Note(p), /not in any world yet: say that kindly/);
  }
  // an animal word alone does not make a game a 3D-world game (as a hero word alone does not)
  assert.equal(want('a quiz about horses'), null); assert.equal(want('make a 3D game with a fox'), null);
  // a saved game from before the animals (Oomba3D 1.1.0, or an older world version) is not edited into a broken one
  const old = { html: K.kit2Starter({ world: 'medieval-village', hero: 'knight' }).replace(V.kit2ImportMap(), V.kit2ImportMap('1.1.0')) };
  p = want('add a cow that follows me', old);
  assert.deepEqual([p.companion, p.upgrade], ['cow', true]);
  assert.match(K.kit2Note(p), /older Oomba3D[\s\S]*start_from_template again/);
  const now = { html: K.kit2Starter({ world: 'medieval-village', hero: 'knight' }) };
  p = want('add a cow that follows me', now);
  assert.deepEqual([p.companion, p.upgrade, p.changed], ['cow', undefined, true]);
});

// ---------------------------------------------------------------- real Chromium, the production frame
let browser;
test.after(async () => { if (browser) await browser.close(); });
/** Open one game document in the game frame (frameDocument + the frame CSP + the sandbox) -> { p, frame, errors, asked, outside, ctx }. */
async function open(html, { reducedMotion = false, width = 480, height = 300 } = {}) {
  const { chromium } = await import('playwright-core');
  if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Animals' }, save: {}, canSave: false });
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
const csp = frameCsp(HOST);
test('the frame CSP the animals run under: WebAssembly yes, eval and workers no', () => {
  const dir = n => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(n + ' ')) || '');
  assert.ok(dir('script-src').includes("'wasm-unsafe-eval'") && !/'unsafe-eval'/.test(dir('script-src')));
  assert.ok(!/worker-src[^;]*(blob:|\*|https?:)/.test(csp), 'no workers');
});

test('a game that names Oomba3D 1.1.0 gets 1.1.0 (no creature code), one that names 1.2.0 gets 1.2.0', { skip, timeout: 180_000 }, async () => {
  const probe = v => `<title>pin</title>${V.kit2ImportMap(v)}<script type="module">import * as O from 'oomba3d'; const g = await O.start({ theme: 'sky-islands', version: '1.0.1', graphics: 'low', settings: false }); window.__pin = { version: O.VERSION, api: O.API, creature: typeof g.creature, ground: typeof g.world.ground, weather: O.WEATHER }; window.__ready = true;</script>`;
  for (const v of ['1.1.0', '1.2.0']) {
    assert.equal(scanVersion(probe(v)).status, 'pass');
    const { frame, errors, asked, outside, ctx } = await open(probe(v));
    await frame.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
    const pin = await frame.evaluate(() => window.__pin);
    assert.equal(pin.version, v);
    assert.equal(pin.creature, v === '1.2.0' ? 'function' : 'undefined'); assert.equal(pin.ground, v === '1.2.0' ? 'function' : 'undefined');
    assert.equal(pin.weather.includes('bubbles'), v === '1.2.0'); assert.equal(pin.api.includes('creature'), v === '1.2.0');
    const libs = asked.filter(u => u.includes('/oomba3d/'));
    assert.deepEqual(libs, [`/vendor/kit2/oomba3d/${v}/oomba3d.js`], 'only the pinned library was fetched');
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    await ctx.close();
  }
});

test('the animals demo in Medieval Village: spawn, walk, hop, follow a path, trail the hero, greet; never hurt or block', { skip, timeout: 420_000 }, async () => {
  const mv = withCreatures.filter(v => v.theme === 'medieval-village').pop();
  const { p, frame, errors, outside, asked, ctx } = await open(demo('medieval-village', mv.version, 'knight'));
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 90_000 });
  const shots = process.env.K2_SHOTS;
  // Every creature of the theme is there, with the moves the catalogue promises, and none is solid.
  const info = await frame.evaluate(() => Object.fromEntries(Object.entries(__demo.all).map(([id, c]) => [id, { moves: [...c.moves].sort(), kind: c.kind, large: c.large, playable: c.playable, size: c.size, y: c.position.y, attack: c.play('attack'), bite: c.play('bite') }])));
  assert.deepEqual(Object.keys(info), mv.manifest.creatures.map(c => c.id));
  for (const c of mv.manifest.creatures) {
    assert.deepEqual(info[c.id].moves, [...c.moves].sort(), c.id);
    assert.equal(info[c.id].attack, null); assert.equal(info[c.id].bite, null);
    assert.equal(info[c.id].playable, c.playable);
    assert.deepEqual(await frame.evaluate(id => __demo.all[id].moves.map(m => { const a = __demo.all[id].play(m); return a ? a.getClip().name : null; }), c.id), await frame.evaluate(id => __demo.all[id].moves, c.id), `${c.id} plays every one of its moves`);
    await frame.evaluate(id => { __demo.all[id].play('idle'); }, c.id);
  }
  assert.equal(info.cow.large, true, 'the cow is a big animal'); assert.equal(info.husky.large, false);
  assert.ok(await frame.evaluate(() => { const g = __demo.g; let n = 0; g.scene.traverse(o => { if (o.isSkinnedMesh && o.material && o.material.flatShading) n++; }); return n; }) >= 5, 'flat-shaded as their makers drew them');
  // A real rendered frame of the cow (flat-shaded, palette colours, ink outline): not a blank or all-white picture.
  const px = await frame.evaluate(() => {
    const g = __demo.g, c = __demo.all.cow.position, cam = g.camera.clone();
    cam.position.set(c.x + 1, 2.2, c.z + 8); cam.lookAt(c.x, 1.3, c.z); cam.updateMatrixWorld();
    g.renderer.setRenderTarget(null); g.renderer.render(g.scene, cam);
    const gl = g.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let white = 0, ink = 0, brown = 0, n = 0;
    for (let i = 0; i < buf.length; i += 16) { const r = buf[i], gr = buf[i + 1], b = buf[i + 2]; n++; if (r > 245 && gr > 245 && b > 245) white++; if (r < 45 && gr < 45 && b < 45) ink++; if (r > 110 && r > gr + 25 && gr > b + 15) brown++; }
    return { white: white / n, ink: ink / n, brown: brown / n };
  });
  assert.ok(px.white < 0.3, `the picture is not washed out (${(px.white * 100).toFixed(1)}% white)`);
  assert.ok(px.brown > 0.01, `the cow is brown (${(px.brown * 100).toFixed(2)}% of the picture)`);
  assert.ok(px.ink > 0.0008, `with an ink outline (${(px.ink * 100).toFixed(2)}%)`);
  // The hero stands on the ground the library made.
  await until(() => Math.abs(__demo.me.position.y) < 0.01);
  if (shots) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shots, 'creatures-mv-1-row.png') }); }

  // A speed watch for everything that moves by itself (per frame: distance over the frame's own time).
  await frame.evaluate(() => {
    const w = window.__watch = { max: {}, last: {}, hop: 0, root: 0, minToHero: {}, box: new __demo.g.THREE.Box3() };
    const who = { walker: __demo.walker, stroller: __demo.stroller, friend: __demo.friend, cow: __demo.all.cow };
    __demo.g.onUpdate(dt => {
      for (const [k, c] of Object.entries(who)) {
        const l = w.last[k]; if (l && dt > 0) w.max[k] = Math.max(w.max[k] || 0, Math.hypot(c.position.x - l[0], c.position.z - l[1]) / dt);
        w.last[k] = [c.position.x, c.position.z];
        w.minToHero[k] = Math.min(w.minToHero[k] ?? 99, Math.hypot(c.position.x - __demo.me.position.x, c.position.z - __demo.me.position.z));
      }
      // how far the sheep's lowest point is off the ground (measured on the posed mesh: the hop is in its clip)
      w.box.setFromObject(__demo.stroller.object, true); w.hop = Math.max(w.hop, w.box.min.y); w.root = Math.max(w.root, Math.abs(__demo.stroller.position.y));
    });
  });
  // follow(path, { loop }): the first walker goes round its loop, turning to face where it goes.
  const w0 = await frame.evaluate(() => __demo.walker.position.toArray());
  await until(z => __demo.walker.position.z > z + 2, w0[2]);
  await until(() => __demo.walker.position.x < -16.5);
  assert.ok(await frame.evaluate(() => __demo.walker.position.y) === 0, 'feet on the ground');
  // wander(): the sheep has no walk, so it hops: it leaves the ground and comes back, and it goes somewhere.
  const s0 = await frame.evaluate(() => __demo.stroller.position.toArray());
  await until(a => Math.hypot(__demo.stroller.position.x - a[0], __demo.stroller.position.z - a[2]) > 1, s0);
  if (shots) await p.screenshot({ path: path.join(shots, 'creatures-mv-2-walk.png') });

  // followHero(): the companion trails the hero and stops a little behind, never on top of them.
  await frame.evaluate(() => { __demo.me.position.set(-6, 0, 20); });
  await until(() => { const f = __demo.friend.position, m = __demo.me.position, d = Math.hypot(f.x - m.x, f.z - m.z); return d < 4 && __demo.friend.position.z > 15; });
  await frame.click('canvas');
  await p.keyboard.down('ArrowRight'); await until(() => __demo.me.position.x > 2); await p.keyboard.up('ArrowRight');
  await until(() => Math.hypot(__demo.friend.position.x - __demo.me.position.x, __demo.friend.position.z - __demo.me.position.z) < 4);
  if (shots) await p.screenshot({ path: path.join(shots, 'creatures-mv-3-companion.png') });

  // onMeet(): walking up to the cow says hello once; walking on THROUGH it changes nothing for the hero.
  const cowAt = await frame.evaluate(() => __demo.all.cow.position.toArray());
  await frame.evaluate(c => { __demo.met.length = 0; __demo.me.position.set(c[0], 0, c[2] + 7); window.__spawned = __demo.me.position.clone(); }, cowAt);
  const score0 = await frame.evaluate(() => __demo.g.score());
  await p.keyboard.down('ArrowUp');
  await until(() => __demo.met.includes('cow'));
  assert.match(await frame.evaluate(() => document.querySelector('.o3-toast').textContent), /Hello, Cow!/);
  await until(c => __demo.me.position.z < c[2] - 3, cowAt);
  await p.keyboard.up('ArrowUp');
  const after = await frame.evaluate(() => ({ me: __demo.me.position.toArray(), met: __demo.met.filter(m => m === 'cow').length, score: __demo.g.score(), cow: __demo.all.cow.position.toArray() }));
  assert.ok(Math.abs(after.me[0] - cowAt[0]) < 0.01 && after.me[1] === 0, 'the hero walked straight through the cow: not pushed aside, not stopped, not sent back');
  assert.equal(after.met, 1, 'one hello per visit'); assert.equal(after.score, score0);
  assert.deepEqual(after.cow, cowAt, 'and the cow was not pushed either');
  if (shots) await p.screenshot({ path: path.join(shots, 'creatures-mv-4-meet.png') });

  // Calm: told to walk right up to the hero, a big animal stops short and waits; told to hurry, it still strolls.
  await frame.evaluate(() => { const m = __demo.me.position; __demo.all.cow.position.set(m.x + 9, 0, m.z); window.__arrived = null; __demo.all.cow.walkTo(m.x, m.z, { speed: 99 }).then(ok => { window.__arrived = ok; }); __watch.last.cow = [m.x + 9, m.z]; __watch.max.cow = 0; __watch.minToHero.cow = 99; });
  await until(() => __watch.minToHero.cow < 3.6);
  await p.waitForTimeout(1500);
  const calm = await frame.evaluate(() => ({ min: __watch.minToHero.cow, max: __watch.max.cow, arrived: window.__arrived, walkerMax: __watch.max.walker, strollerMax: __watch.max.stroller, friendMax: __watch.max.friend, hop: __watch.hop, root: __watch.root }));
  assert.ok(calm.min >= 2.99, `the cow kept its calm distance (${calm.min.toFixed(2)})`);
  assert.equal(calm.arrived, null, 'it is waiting, not arrived');
  assert.ok(calm.max > 0.5 && calm.max <= 2.5 + 1e-6, `a big animal never goes faster than 2.5 (${calm.max.toFixed(2)})`);
  assert.ok(calm.walkerMax <= 5 + 1e-6 && calm.friendMax <= 7.5 + 1e-6, 'nobody outruns the hero by much');
  assert.ok(calm.hop > 0.15, `the sheep hopped (${calm.hop.toFixed(2)} off the ground)`); assert.equal(calm.root, 0, 'and came down where the ground is');
  // walkTo() resolves true on arrival, false when another order replaces it; stop() and remove() work.
  assert.deepEqual(await frame.evaluate(async () => {
    const d = __demo.all.donkey, x = d.position.x, z = d.position.z;
    const first = d.walkTo(x + 30, z), second = d.walkTo({ x: x + 0.6, z });
    return [await first, await second, Math.abs(d.position.x - (x + 0.6)) < 0.15];
  }), [false, true, true]);
  assert.equal(await frame.evaluate(() => { const n = __demo.g.scene.children.length; __demo.all.pig.remove(); return n - __demo.g.scene.children.length; }), 1);

  // school(): four of one animal on ONE skeleton; on the Fast level at most 12 of a big school are shown.
  assert.deepEqual(await frame.evaluate(async () => {
    const h = __demo.herd, skeletons = new Set(); for (const o of h.objects) o.traverse(m => { if (m.isSkinnedMesh) skeletons.add(m.skeleton.bones[0]); });   // one set of bones for all four
    const big = await __demo.g.school('sheep', 30, { around: { x: -30, y: 0, z: 30 }, radius: 6 });
    await new Promise(r => { const t = setInterval(() => { if (big.objects.some(o => !o.visible)) { clearInterval(t); r(); } }, 100); });
    const out = [h.count, h.objects.length, skeletons.size, big.objects.filter(o => o.visible).length]; big.remove(); return out;
  }), [4, 4, 1, 12]);
  // No more than the level's number are drawn at once, however many a game adds.
  assert.ok(await frame.evaluate(async () => {
    const g = __demo.g, extra = []; for (let i = 0; i < 14; i++) extra.push(await g.creature('husky', { x: (i - 7) * 1.5, y: 0, z: __demo.me.position.z - 6 }));
    const t0 = performance.now();
    await new Promise(r => { const t = setInterval(() => { if (extra.some(c => !c.object.visible) || performance.now() - t0 > 20000) { clearInterval(t); r(); } }, 100); });
    const shown = extra.filter(c => c.object.visible).length; extra.forEach(c => c.remove()); return shown;
  }) <= 10, 'Fast shows at most 10 animals');

  assert.ok(asked.some(u => u.endsWith('/creatures/cow.glb')) && asked.every(u => u.startsWith('/vendor/')));
  assert.deepEqual(errors, []); assert.deepEqual(outside, [], 'nothing asked for outside /vendor');
  await ctx.close();
});

test('a playable animal: the horse is the hero in Castle Quest, runs with the arrow keys and jumps', { skip, timeout: 300_000 }, async () => {
  const cq = withCreatures.filter(v => v.theme === 'castle-quest').pop();
  const { p, frame, errors, outside, ctx } = await open(demo('castle-quest', cq.version, 'horse'));
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 90_000 });
  const shots = process.env.K2_SHOTS;
  assert.deepEqual(await frame.evaluate(() => [__demo.me.id, __demo.me.creature, [...__demo.me.moves].sort().join(',')]), ['horse', true, 'eat,idle,jump,run,walk']);
  assert.deepEqual(await frame.evaluate(() => Object.keys(__demo.all)), cq.manifest.creatures.map(c => c.id));
  await until(() => Math.abs(__demo.me.position.y) < 0.01);
  // moves a hero is asked for: its own where it has them, the nearest otherwise, idle (and null) for the rest
  assert.deepEqual(await frame.evaluate(() => ['idle', 'walk', 'run', 'jump', 'jumpAir', 'cheer', 'sit', 'cast'].map(m => { const a = __demo.me.play(m); return a ? a.getClip().name : null; })), ['idle', 'walk', 'run', 'jump', 'jump', 'jump', null, null]);
  await frame.click('canvas');
  const z0 = await frame.evaluate(() => __demo.me.position.z);
  await p.keyboard.down('ArrowUp');
  await until(z => __demo.me.position.z < z - 3, z0);
  assert.equal(await frame.evaluate(() => { let name = ''; __demo.me.object.traverse(() => {}); return Math.abs(__demo.me.object.rotation.y - Math.PI) < 0.01 || Math.abs(__demo.me.object.rotation.y + Math.PI) < 0.01; }), true, 'it faces the way it runs');
  if (shots) await p.screenshot({ path: path.join(shots, 'creatures-cq-1-horse-run.png') });
  // jump: up, and down again onto the ground
  await frame.evaluate(() => { window.__top = 0; __demo.g.onUpdate(() => { window.__top = Math.max(window.__top, __demo.me.position.y); }); });
  await p.keyboard.down('Space'); await until(() => window.__top > 1.2); await p.keyboard.up('Space');
  if (shots) await p.screenshot({ path: path.join(shots, 'creatures-cq-2-horse-jump.png') });
  await p.keyboard.up('ArrowUp');
  await until(() => __demo.me.position.y === 0);
  assert.ok(await frame.evaluate(() => window.__top) < 2.6, 'a hero-sized jump');
  // the companion (the last walker) came along; coins and a celebration work for an animal hero like any other
  await until(() => Math.hypot(__demo.friend.position.x - __demo.me.position.x, __demo.friend.position.z - __demo.me.position.z) < 6);
  await frame.evaluate(() => { __demo.g.celebrate(__demo.me, 'Well done!'); });
  assert.match(await frame.evaluate(() => document.querySelector('.o3-toast').textContent), /Well done!/);
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await ctx.close();
});

test('an animal that only hops cannot be the hero, a made-up animal does not exist, and older worlds have none', { skip, timeout: 240_000 }, async () => {
  const game = `<title>no</title>${V.kit2ImportMap()}<script type="module">import { start } from 'oomba3d';
const g = await start({ theme: 'medieval-village', version: '1.1.0', graphics: 'low', settings: false });
const say = async fn => { try { await fn(); return 'ok'; } catch (e) { return e.message; } };
const old = await start({ theme: 'medieval-village', version: '1.0.0', graphics: 'low', settings: false });
window.__no = { pig: await say(() => g.hero('pig')), rex: await say(() => g.creature('t-rex')), school: await say(() => g.school('shark', 5)), hero: await say(() => g.hero('dragon')), before: await say(() => old.creature('cow')) };
window.__ready = true;</script>`;
  assert.equal(scanVersion(game).status, 'pass');
  const { frame, ctx } = await open(game);
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const no = await frame.evaluate(() => window.__no);
  assert.match(no.pig, /the Pig cannot be the hero \(it has no walk\)\. Playable animals: donkey, cow, husky/);
  assert.match(no.rex, /no creature "t-rex" in medieval-village 1\.1\.0\. Creatures: donkey, cow, husky, pig, sheep/);
  assert.match(no.school, /no creature "shark"/);
  assert.match(no.hero, /no hero "dragon"/);
  assert.match(no.before, /no creature "cow" in medieval-village 1\.0\.0\. Creatures: none in this world/);
  await ctx.close();
});

test('a piece with its own clips: the Pirate Cove chest opens and closes on Oomba3D 1.2.0, and stays a plain piece on 1.1.0', { skip, timeout: 240_000 }, async () => {
  const pc = versions.filter(v => v.theme === 'pirate-cove').pop();
  assert.deepEqual(clipsOf(path.join(pc.dir, 'props/chest.glb')).sort(), ['close', 'open']);
  const game = v => `<title>chest</title>${V.kit2ImportMap(v)}<script type="module">import { start } from 'oomba3d';
const g = await start({ theme: 'pirate-cove', version: '${pc.version}', graphics: 'low', settings: false });
const chest = await g.world.piece('chest', { x: 0, y: 0, z: -4 }), palm = await g.world.piece('palm', { x: 3, y: 0, z: -4 });
const pose = () => { const out = []; chest.object.traverse(o => out.push(...o.quaternion.toArray(), ...o.position.toArray())); return out.map(n => +n.toFixed(4)).join(','); };
window.__chest = { g, chest, palm, pose, shut: pose() }; window.__ready = true;</script>`;
  for (const v of ['1.1.0', '1.2.0']) {
    assert.equal(scanVersion(game(v)).status, 'pass');
    const { frame, errors, ctx } = await open(game(v));
    await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
    if (v === '1.1.0') assert.deepEqual(await frame.evaluate(() => [typeof __chest.chest.play, __chest.chest.moves]), ['undefined', undefined]);
    else {
      assert.deepEqual(await frame.evaluate(() => [[...__chest.chest.moves].sort(), __chest.palm.moves, __chest.palm.play('open'), __chest.chest.play('explode')]), [['close', 'open'], [], null, null]);
      assert.equal(await frame.evaluate(() => __chest.chest.play('open').getClip().name), 'open');
      await frame.waitForFunction(() => __chest.pose() !== __chest.shut, null, { timeout: 60_000 });   // the lid moved
      await frame.waitForFunction(() => { const p = __chest.pose(); const same = p === window.__last; window.__last = p; return same; }, null, { timeout: 90_000, polling: 700 });   // and came to rest, open
      const open1 = await frame.evaluate(() => __chest.pose());
      assert.notEqual(open1, await frame.evaluate(() => __chest.shut), 'it stays open');
      await frame.evaluate(() => { __chest.chest.play('close'); });
      await frame.waitForFunction(o => __chest.pose() !== o, open1, { timeout: 60_000 });
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('reduced motion: nobody strolls about by themselves, a hopper glides, a school stands still', { skip, timeout: 240_000 }, async () => {
  const mv = withCreatures.filter(v => v.theme === 'medieval-village').pop();
  const { p, frame, errors, ctx } = await open(demo('medieval-village', mv.version, 'knight'), { reducedMotion: true });
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  assert.equal(await frame.evaluate(() => __demo.g.reducedMotion), true);
  const before = await frame.evaluate(() => ({ stroller: __demo.stroller.position.toArray(), herd: __demo.herd.objects.map(o => o.position.toArray()) }));
  // an order from the game is still carried out (the sheep goes where it is sent), without hopping
  await frame.evaluate(() => { window.__hop = 0; const s = __demo.all.sheep; __demo.g.onUpdate(() => { window.__hop = Math.max(window.__hop, s.position.y); }); window.__sent = false; __demo.all.pig.walkTo(__demo.all.pig.position.x, __demo.all.pig.position.z + 1.5).then(ok => { window.__sent = ok; }); window.__pigTop = 0; __demo.g.onUpdate(() => { window.__pigTop = Math.max(window.__pigTop, __demo.all.pig.position.y); }); });
  await frame.waitForFunction(() => window.__sent === true, null, { timeout: 90_000 });
  const after = await frame.evaluate(() => ({ stroller: __demo.stroller.position.toArray(), herd: __demo.herd.objects.map(o => o.position.toArray()), pigTop: window.__pigTop, weather: __demo.g.weather('bubbles'), points: __demo.g.scene.children.filter(o => o.isPoints && o.geometry.attributes.color).length }));
  assert.deepEqual(after.stroller, before.stroller, 'wander() waits');
  assert.deepEqual(after.herd, before.herd, 'the school stands');
  assert.equal(after.pigTop, 0, 'the pig glided: no hop');
  assert.deepEqual([after.weather, after.points], ['bubbles', 0], 'no bubbles drawn');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the Builder starter with an animal hero and a companion plays; swimming and bubbles work', { skip, timeout: 300_000 }, async () => {
  const html = K.kit2Starter({ world: 'medieval-village', hero: 'cow', companion: 'pig' });
  const { p, frame, errors, outside, ctx } = await open(html, { width: 640, height: 400 });
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().scene === 'title', null, { timeout: 150_000 });
  let st = await frame.evaluate(() => __brbTest.state());
  assert.deepEqual([st.world, st.heroId, st.companion && st.companion.id], ['medieval-village', 'cow', 'pig']);
  await frame.evaluate(() => __brbTest.start());
  const sp = await frame.evaluate(() => __brbTest.spots());
  // the hero is put at the first question's rest place: the pig joins it there (over the gaps, without a chase)
  await frame.evaluate(c => { __brbTest.put(c[0], c[1] + 0.5, c[2]); }, sp.checkpoints[1]);
  await frame.waitForFunction(c => { const s = __brbTest.state(); return s.hero && Math.abs(s.hero.y - c[1]) < 0.4 && Math.hypot(s.companion.x - s.hero.x, s.companion.z - s.hero.z) < 5 && Math.abs(s.companion.y - s.hero.y) < 1.2; }, sp.checkpoints[1], { timeout: 120_000 });
  if (process.env.K2_SHOTS) await p.screenshot({ path: path.join(process.env.K2_SHOTS, 'creatures-starter-cow-pig.png') });
  assert.deepEqual(errors, []); assert.deepEqual(outside, []);
  await ctx.close();

  const sea = `<title>sea</title>${V.kit2ImportMap()}<script type="module">import { start } from 'oomba3d';
const g = await start({ theme: 'sky-islands', version: '1.0.1', graphics: 'low', weather: 'bubbles', settings: false });
const floor = g.world.ground({ y: 0, size: 60, color: '#e8d9a0', hills: 2 });
const me = await g.hero('knight', { x: 0, y: 3, z: 0 });
g.controls(me, { swim: true, ceiling: 9 }); g.followCamera(me);
window.__sea = { g, me, floor }; window.__ready = true;</script>`;
  assert.equal(scanVersion(sea).status, 'pass');
  const s = await open(sea);
  await s.frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  assert.deepEqual(await s.frame.evaluate(() => [__sea.g.scene.children.some(o => o.isPoints && o.geometry.attributes.color), document.querySelectorAll('.o3-swim button').length, __sea.floor.top(), __sea.floor.heightAt(0, 0), __sea.floor.heightAt(28, 0) !== 0, __sea.g.weather('bubbles')]), [true, 2, 0, 0, true, 'bubbles']);
  await s.frame.click('canvas');
  await s.p.keyboard.down('Space');
  await s.frame.waitForFunction(() => __sea.me.position.y > 5, null, { timeout: 90_000 });
  await s.frame.waitForFunction(() => __sea.me.position.y === 9, null, { timeout: 90_000 });
  await s.p.keyboard.up('Space'); await s.p.keyboard.down('KeyQ');
  await s.frame.waitForFunction(() => __sea.me.position.y === 0, null, { timeout: 120_000 });   // down to the sea floor, and no further
  await s.p.keyboard.up('KeyQ');
  assert.deepEqual(s.errors, []); assert.deepEqual(s.outside, []);
  await s.ctx.close();
});
