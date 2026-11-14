// Kit 2 in the Builder (docs/kit2-themes-plan.md, stage 5): the ready-made 3D worlds and characters on Oomba3D.
//   - the generated catalogue (server/builder/kit2-catalog.js) is fresh and says exactly what the shipped theme
//     manifests say: no name in the Builder that a manifest does not have;
//   - the engine choice: when a build uses Kit 2, and that everything else stays on the old kit;
//   - what the model is told: the exact import map, every world's exact shipped version, every asset name;
//   - the starter: one for every world, pinned, accepted by the scanner and the lints, which still refuse what they
//     refused before;
//   - the tools refuse an invented world or character; the mock builds and changes Kit 2 games, and still builds an
//     old-kit game when no Kit 2 thing is asked for;
//   - the Studio picker and the Build page offer every world and character with a picture, in every site language;
//   - in real Chromium, inside the production frame (frameDocument + the frame CSP + the sandbox): the starter loads
//     and plays in several worlds with several characters, and the platform's own playtest and cover picture accept it.
// The browser tests need a local Chromium; they are skipped when there is none.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_SNAPSHOTS = '1';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-kit2-builder-test-' + process.pid;
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
if (exe) process.env.BRB_CHROMIUM = exe;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const V = await import('../../server/services/vendor.js');
const K = await import('../../server/builder/kit2.js');
const CAT = await import('../../server/builder/kit2-catalog.js');
const GEN = await import('../../scripts/build-kit2-rules.js');
const P = await import('../../server/builder/prompt.js');
const T = await import('../../server/builder/templates/index.js');
const { BUILDER_TEMPLATE_KEYS, TEMPLATE_KEYS } = await import('../../server/builder/catalog.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { lintKit2, namesOf } = await import('../../server/services/kit2-lint.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const snapshot = await import('../../server/services/snapshot.js');
const autotest = await import('../../server/builder/autotest.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { usesKit } = await import('../../server/builder/layer.js');
const { k2Read, k2Edits, k2Move } = await import('../../server/builder/mock-kit2.js');
const { CODES } = await import('../../server/i18n/index.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const { createApp } = await import('../../server/app.js');

const manifest = (world, version) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes', world, version, 'theme.json'), 'utf8'));
const starter = (world, hero = '') => T.loadTemplate('oomba3d', { world, hero });
const fails = html => scanVersion(html).issues.filter(i => i.level === 'fail').map(i => i.code);

// ---------------------------------------------------------------- the catalogue
test('the catalogue is generated from the shipped manifests, and is up to date', () => {
  assert.equal(GEN.fileText(), GEN.fileText(), 'the same bytes every time');
  assert.equal(fs.readFileSync(GEN.OUT, 'utf8'), GEN.fileText(), 'server/builder/kit2-catalog.js is out of date: run node scripts/build-kit2-rules.js');
});

test('the catalogue says exactly what kit2/SHIPPED.json and the theme manifests say', () => {
  const shipped = {};
  for (const tv of Object.keys(V.KIT2_LOCK.themes)) { const [t, v] = tv.split('/'); (shipped[t] = shipped[t] || []).push(v); }
  assert.deepEqual(Object.keys(CAT.KIT2_VERSIONS).sort(), Object.keys(shipped).sort(), 'every shipped theme, and only those');
  assert.ok(CAT.KIT2_WORLDS.length >= 8);
  for (const w of CAT.KIT2_WORLDS) {
    assert.deepEqual([...CAT.KIT2_VERSIONS[w.id]].sort(), [...shipped[w.id]].sort(), `${w.id}: every shipped version`);
    const newest = CAT.KIT2_VERSIONS[w.id].at(-1);
    assert.equal(w.version, newest, `${w.id}: the Builder offers the newest shipped version`);
    for (const v of CAT.KIT2_VERSIONS[w.id]) assert.ok(v === newest || v.localeCompare(newest, undefined, { numeric: true }) < 0, `${w.id} ${v} is older than ${newest}`);
    const m = manifest(w.id, w.version);
    assert.equal(w.name, m.name); assert.equal(w.description, m.description);
    assert.deepEqual(w.heroes, m.heroes.map(h => ({ id: h.id, name: h.name })), `${w.id}: heroes`);
    assert.deepEqual(w.creatures, (m.creatures || []).map(h => ({ id: h.id, name: h.name, kind: h.kind, size: h.size, moves: h.moves, playable: h.playable })), `${w.id}: creatures, with what the Builder needs to use them well`);
    assert.deepEqual(w.pieces.map(p => p.id), m.pieces.map(p => p.id), `${w.id}: pieces`);
    assert.deepEqual(w.sounds, m.sounds.map(s => s.id), `${w.id}: sounds`);
    assert.deepEqual(w.moves, Object.keys(m.moves.clips), `${w.id}: moves`);
    // every model the catalogue names is a file that shipped with the theme
    for (const x of [...m.heroes, ...(m.creatures || []), ...m.pieces]) assert.ok(m.files[x.file] !== undefined || (Array.isArray(m.files) && m.files.includes(x.file)), `${w.id}: ${x.file} is a shipped file`);
  }
});

test('characters: every hero and creature of every world, with the worlds that have it', () => {
  const ids = new Set(CAT.KIT2_WORLDS.flatMap(w => [...w.heroes, ...w.creatures].map(h => h.id)));
  assert.deepEqual(new Set(K.CHARACTER_IDS), ids);
  for (const c of K.KIT2_CHARACTERS) for (const w of c.worlds) assert.ok(K.charactersOf(w).some(h => h.id === c.id));
  assert.ok(K.CHARACTER_IDS.includes('knight') && K.CHARACTER_IDS.includes('skelly'));
  assert.equal(K.heroFor('sky-islands', 'skelly'), 'knight', 'Sky Islands has no skeleton pals: the world\'s first hero instead');
  assert.equal(K.heroFor('castle-quest', 'skelly'), 'skelly');
  assert.equal(K.heroFor('castle-quest', 't-rex'), 'knight', 'a made-up character is never passed on');
});

test('animals and dinosaurs: none has shipped yet, and the Builder says so instead of inventing one', () => {
  const creatures = K.KIT2_CHARACTERS.filter(c => c.kind === 'creature');
  // The day a theme ships a creature this test changes sides: it must then be in the catalogue, the rules and the picker.
  if (creatures.length) {
    for (const c of creatures) assert.ok(P.KIT2_RULES.includes(c.id) && fs.existsSync(path.join(ROOT, 'public/img/kit2/heroes', `${c.id}.webp`)), c.id);
    // and an animal no world has (a dinosaur today) still gets the honest "not yet", never an invented one
    assert.match(P.KIT2_SHORT, /No dinosaurs, fish or other animals yet/);
    assert.match(P.KIT2_RULES, /Never invent a creature name[\s\S]*not listed[\s\S]*say so kindly[\s\S]*Never pretend/);
    const dino = K.wantsKit2({}, 'a dinosaur game on the moon', null);
    assert.equal(dino.wantsCreature, true);
    assert.match(K.kit2Note(dino), /an animal that is not in any world yet: say that kindly/);
    return;
  }
  assert.match(P.KIT2_SHORT, /No animals or dinosaurs yet/);
  assert.match(P.KIT2_RULES, /There are no animal or dinosaur characters yet[\s\S]*say so kindly[\s\S]*Never pretend/);
  const pick = K.wantsKit2({}, 'a dinosaur game on the moon', null);
  assert.equal(pick.wantsCreature, true);
  assert.match(K.kit2Note(pick), /animal or dinosaur: there is none yet/);
});

// ---------------------------------------------------------------- the engine choice
const want = (text, version = null, state = {}) => K.wantsKit2(state, text, version);
test('engine choice: a new game uses Kit 2 when a world is picked, named or plainly described', () => {
  for (const [text, world, hero] of [
    ['Make it a 3D game in the Castle Quest world.', 'castle-quest'],
    ['make a game in toy town', 'toy-town'],
    ['castle quest with skelly please', 'castle-quest', 'skelly'],
    ['a dinosaur game on the moon', 'space-base'],
    ['a 3D castle adventure', 'castle-quest'],
    ['a running game in a spooky forest', 'spooky-hollow'],
    ['a game where a wizard hops between islands in the sky', 'sky-islands', 'mage'],
    ['a kitchen game where a chef collects burgers', 'busy-kitchen'],
    ['a maths quiz in a medieval village', 'medieval-village'],
    ['space-base', 'space-base'],
    ['a 3D game with a skeleton', 'castle-quest', 'skelly'], ['a 3D wizard adventure', 'sky-islands', 'mage'],
  ]) {
    const p = want(text);
    assert.ok(p, `Kit 2: ${text}`); assert.equal(p.world, world, text);
    if (hero) assert.equal(p.hero, hero, text);
    assert.ok(K.charactersOf(p.world).some(h => h.id === p.hero), `${text}: the hero is one this world has`);
  }
});

test('engine choice: everything else stays on the old kit, as before', () => {
  for (const text of [
    'hi', 'a catching game about sharks', 'a wizard quiz', 'a knight memory game', 'make a 3D game with a fox', 'a quiz about space', 'a racing game with cars',
    'make a memory game about castles', 'a board game in a haunted house', 'two players on one phone in a castle', 'a 2D game on the moon',
    'Use the Space theme.', 'Use the Castle theme.', 'Utilise le thème Château (castle).', 'a spelling game in the kitchen', 'catch the falling pumpkins',
  ]) assert.equal(want(text), null, `old kit: ${text}`);
  // a character named in words is only a Kit 2 character inside a Kit 2 build
  assert.equal(want('make the hero a wizard', { html: '<title>x</title><script src="/vendor/oomba-kit/1.2.0/oomba-kit.js"></script>' }), null);
});

test('engine choice: an existing game keeps its engine unless a world or character is picked outright', () => {
  const old = { html: '<title>Old</title><div id="game"></div><script>const CONFIG = { theme: "castle" };</script>' };
  assert.equal(want('make it a castle on the moon', old), null, 'a described place never moves an old-kit game');
  assert.equal(want('make it harder', old), null);
  const moved = want('Make it a 3D game in the Space Base world.', old);
  assert.equal(moved.by, 'chip'); assert.equal(moved.world, 'space-base');
  assert.equal(want('Use the 3D hero Skelly.', old).by, 'chip', 'a 3D hero chip is a Kit 2 pick too');
  assert.deepEqual([want('make it 3d with a knight', old).by, want('make it 3d with a knight', old).hero], ['name', 'knight'], 'a 3D request that names a character');
  const k2 = { html: starter('castle-quest', 'knight') };
  const same = want('make it harder', k2);
  assert.deepEqual([same.by, same.world, same.hero], ['game', 'castle-quest', 'knight']);
  assert.equal(want('Use the Snow theme.', k2).by, 'game', 'a Kit 2 game stays a Kit 2 game');
  const hero = want('change the hero to the wizard', k2);
  assert.deepEqual([hero.by, hero.hero, hero.changed], ['game', 'mage', true]);
  const world = want('move it to Toy Town', k2);
  assert.deepEqual([world.by, world.world, world.changed], ['name', 'toy-town', true]);
  // once the game is what was picked, the pick is done (the build's later steps see "this game is in ...")
  assert.equal(want('Make it a 3D game in the Castle Quest world.', k2).by, 'game');
});

test('engine choice: the choice is remembered while the Builder still asks questions, and a classic pick drops it', () => {
  const state = {};
  assert.equal(want('a game on the moon', null, state).by, 'place');
  assert.deepEqual(state.kit2, { world: 'space-base', hero: 'knight' });
  assert.equal(want('just me', null, state).by, 'kept');
  assert.equal(want('Use the Snow theme.', null, state), null);
  assert.equal(state.kit2, undefined);
});

test('engine choice: the Studio chips are understood in every site language', () => {
  const read = code => JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8'));
  const en = read('en');
  for (const code of CODES) {
    const d = read(code), names = (d.studio && d.studio.worlds && d.studio.worlds.names) || en.studio.worlds.names, heroes = (d.studio && d.studio.heroes && d.studio.heroes.names) || en.studio.heroes.names;
    const worldUse = (d.js && d.js.studio && d.js.studio.worldUse) || en.js.studio.worldUse, heroUse = (d.js && d.js.studio && d.js.studio.heroUse) || en.js.studio.heroUse, themeUse = (d.js && d.js.studio && d.js.studio.themeUse) || en.js.studio.themeUse;
    for (const w of K.WORLD_IDS) {
      const p = K.pickKit2(worldUse.replace('{name}', names[w]));
      assert.deepEqual([p.by, p.world], ['chip', w], `${code}: the ${w} chip`);
      assert.equal(K.pickKit2(`xx ${names[w]} xx`).world, w, `${code}: ${names[w]} named in a sentence`);
    }
    for (const h of K.CHARACTER_IDS) {
      const p = K.pickKit2(heroUse.replace('{name}', heroes[h]));
      // an animal that cannot be the hero (the pig, the sheep: no walk) comes along as a companion instead
      if (K.characterById(h).kind === 'creature' && !K.characterById(h).playable) assert.deepEqual([p.by, p.hero, p.animals, p.along], ['chip', '', [h], true], `${code}: the ${h} chip`);
      else assert.deepEqual([p.by, p.hero], ['chip', h], `${code}: the ${h} chip`);
    }
    // world and hero together, as the page writes them; and the classic chip stays classic
    const both = K.wantsKit2({}, `${worldUse.replace('{name}', names['castle-quest'])}\n${heroUse.replace('{name}', heroes.skelly)}`, null);
    assert.deepEqual([both.world, both.hero], ['castle-quest', 'skelly'], code);
    const themes = (d.studio && d.studio.themes && d.studio.themes.names) || en.studio.themes.names;
    for (const id of ['castle', 'space', 'haunted', 'city']) {
      const name = themes[id] || en.studio.themes.names[id];
      assert.equal(K.wantsKit2({}, themeUse.replace('{name}', name.toLowerCase() === id ? name : `${name} (${id})`), null), null, `${code}: the classic ${id} chip stays on the old kit`);
    }
  }
});

test('every site language has its own words for the picker, the worlds and the characters', () => {
  const read = code => JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8'));
  for (const code of CODES.filter(c => c !== 'en-GB')) {   // en-GB only lists what differs from en
    const d = read(code);
    for (const k of ['label', 'worlds', 'heroes', 'classic']) assert.ok(d.studio.picker[k], `${code}: studio.picker.${k}`);
    for (const w of K.WORLD_IDS) assert.ok(d.studio.worlds.names[w], `${code}: ${w}`);
    for (const h of K.CHARACTER_IDS) assert.ok(d.studio.heroes.names[h], `${code}: ${h}`);
    for (const k of ['worldUse', 'heroUse']) assert.match(d.js.studio[k], /\{name\}/, `${code}: js.studio.${k}`);
    assert.ok(d.build.worlds, code); assert.match(d.build.startInLabel, /\{title\}/, code);
    assert.equal(new Set(Object.values(d.studio.worlds.names)).size, K.WORLD_IDS.length, `${code}: no two worlds share a name`);
    assert.equal(new Set(Object.values(d.studio.heroes.names)).size, K.CHARACTER_IDS.length, `${code}: no two characters share a name`);
    if (code !== 'en') assert.notDeepEqual(d.studio.picker, read('en').studio.picker, `${code}: translated, not copied`);
  }
});

// ---------------------------------------------------------------- what the model is told
test('the rules carry the exact import map, every world\'s exact version and every asset name', () => {
  assert.ok(P.KIT2_RULES.includes(V.kit2ImportMap()), 'the literal Kit 2 import map, integrity lines included');
  assert.ok(P.KIT2_RULES.includes(`Oomba3D ${V.OOMBA3D_VERSION}`));
  for (const w of CAT.KIT2_WORLDS) {
    assert.ok(P.KIT2_RULES.includes(`## ${w.id} ${w.version} ("${w.name}")`), w.id);
    assert.ok(V.KIT2_LOCK.themes[`${w.id}/${w.version}`], `${w.id} ${w.version} is shipped`);
    const at = P.KIT2_RULES.indexOf(`## ${w.id} ${w.version}`), part = P.KIT2_RULES.slice(at, P.KIT2_RULES.indexOf('\n\n## ', at + 5) > 0 ? P.KIT2_RULES.indexOf('\n\n## ', at + 5) : undefined);
    for (const h of [...w.heroes, ...w.creatures]) assert.ok(part.includes(`${h.id} (${h.name})`), `${w.id}: ${h.id}`);
    for (const p of w.pieces) assert.ok(new RegExp(`(^|[ :;])${p.id} [0-9.]+x`).test(part), `${w.id}: piece ${p.id}`);
    for (const s of w.sounds) assert.ok(part.includes(s), `${w.id}: sound ${s}`);
  }
  for (const s of ['start_from_template', 'Never pretend', 'ONLY the hero, creature, piece, sound and move names', 'g.askQuestion()', 'island-round', 'answerPad()', 'window.__brbTest', 'BRB.gameOver', 'No text boxes, no names, no chat', 'g.physics', 'g.controls', 'g.followCamera']) assert.ok(P.KIT2_RULES.includes(s), s);
  assert.ok(P.KIT2_RULES.includes(CAT.KIT2_API_SOURCE), 'the Oomba3D reference from docs/kit2-api.md');
  // the API reference is the page's own text
  const md = fs.readFileSync(path.join(ROOT, 'docs/kit2-api.md'), 'utf8');
  for (const name of ['g.hero(id, options)', 'g.world.island(options)', 'g.world.piece(id, options)', 'g.coins(spots, options)', 'g.askQuestion(options)', 'g.weather(kind)']) { assert.ok(md.includes(name)); assert.ok(CAT.KIT2_API_SOURCE.includes(name), name); }
});

test('the main prompt lists the worlds and characters, and the tool takes a world and a hero from fixed lists', () => {
  assert.ok(P.SYSTEM_PROMPT.includes(P.KIT2_SHORT));
  for (const w of CAT.KIT2_WORLDS) assert.ok(P.KIT2_SHORT.includes(`${w.id} ("${w.name}")`), w.id);
  for (const c of K.KIT2_CHARACTERS) assert.ok(P.KIT2_SHORT.includes(`${c.id} (${c.name})`), c.id);
  const tool = P.TOOLS.find(t => t.name === 'start_from_template');
  assert.ok(tool.input_schema.properties.template.enum.includes('oomba3d') && BUILDER_TEMPLATE_KEYS.includes('oomba3d'));
  assert.deepEqual(tool.input_schema.properties.world.enum, K.WORLD_IDS);
  assert.deepEqual(tool.input_schema.properties.hero.enum, K.CHARACTER_IDS);
  assert.ok(!TEMPLATE_KEYS.includes('oomba3d'), 'not one of the classic Start from cards');
});

test('nothing added for Kit 2 names a model or holds a key, and the Builder\'s model settings are untouched', () => {
  for (const f of ['server/builder/kit2.js', 'server/builder/kit2-catalog.js', 'server/builder/mock-kit2.js', 'server/builder/templates/oomba3d.html', 'server/services/kit2-lint.js', 'scripts/build-kit2-rules.js', 'scripts/kit2-thumbs.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/claude-[a-z0-9]|sk-ant|api[_-]?key|ANTHROPIC|builderModel/i.test(s), f);
  }
  const claude = fs.readFileSync(path.join(ROOT, 'server/builder/claude.js'), 'utf8');
  assert.match(claude, /const model = ctx\.pro \? config\.builderProModel : config\.builderModel;/);
});

// ---------------------------------------------------------------- the starter
test('a starter for every world: the literal import map, pinned versions, only names the world has', () => {
  for (const w of CAT.KIT2_WORLDS) {
    const lay = K.starterFor(w.id), ids = new Set(w.pieces.map(p => p.id));
    assert.ok(K.STARTERS[w.id], `${w.id} has its own starter layout`);
    for (const [id, scale] of [lay.ground, lay.side, lay.step, lay.pad, lay.goal, lay.landmark, ...lay.scenery]) { assert.ok(ids.has(id), `${w.id}: starter piece ${id}`); assert.ok(scale > 0 && scale <= 6); }
    for (const h of w.heroes.slice(0, 3)) {
      const html = starter(w.id, h.id);
      assert.ok(html.includes(V.kit2ImportMap()), `${w.id}: the literal Kit 2 import map`);
      assert.ok(html.includes(`world: '${w.id}',`) && html.includes(`version: '${w.version}',`) && html.includes(`hero: '${h.id}',`), `${w.id}/${h.id}: world, version and hero from the parameters`);
      assert.deepEqual(K.kit2Of(html), { world: w.id, version: w.version, hero: h.id });
      assert.ok(K.isKit2Game(html) && !usesKit(html), 'a Kit 2 game is not an Oomba Kit game');
      const r = scanVersion(html);
      assert.equal(r.status, 'pass', `${w.id}: ${JSON.stringify(r.issues)}`);
      assert.deepEqual(r.lint, [], `${w.id}: no style or Kit 2 notes`);
      assert.ok(!/WORLD_ID|WORLD_VERSION|HERO_ID|WORLD_TIME|\/\*LAYOUT\*\/|KIT2_IMPORT_MAP|WORLD_NAME/.test(html), 'no marker left in');
    }
    assert.equal(K.kit2Of(starter(w.id, 'nobody')).hero, K.charactersOf(w.id)[0].id, 'an unknown hero becomes the world\'s first');
  }
  // the template file is a whole game by itself (the Sky Islands starter, literal import map and all), kept in step
  const raw = fs.readFileSync(path.join(ROOT, 'server/builder/templates/oomba3d.html'), 'utf8');
  assert.ok(raw.includes(V.kit2ImportMap()), 'templates/oomba3d.html carries the literal Kit 2 import map (vendor.js kit2ImportMap())');
  assert.equal(raw, K.kit2Starter({ world: 'sky-islands', hero: 'knight' }), 'templates/oomba3d.html is the Sky Islands starter as served (newest version, its layout)');
  assert.equal(scanVersion(raw).status, 'pass');
  assert.throws(() => T.loadTemplate('oomba3d', { world: 'dino-valley' }), /Unknown world/);
  assert.equal(K.kit2Starter({ world: 'dino-valley' }), null);
  // the words a player reads: every site language
  const html = starter('sky-islands');
  for (const code of CODES) assert.ok(new RegExp(`\\n  (?:'${code}'|${code}): \\{ sub: `).test(html), `WORDS has ${code}`);
});

test('the scanner still refuses what it refused before, in a Kit 2 game too', () => {
  const html = starter('castle-quest', 'knight'), add = js => html.replace("import { start } from 'oomba3d';", `import { start } from 'oomba3d';\n${js}`);
  assert.deepEqual(fails(html), []);
  for (const [js, code] of [
    ["fetch('/api/x');", 'network'], ['new XMLHttpRequest();', 'network'], ["new WebSocket('wss://x.example');", 'network'], ["navigator.sendBeacon('/x');", 'network'],
    ["eval('1');", 'eval'], ["new Function('return 1')();", 'eval'], ["import('/vendor/kit2/rapier/0.21.0/rapier.mjs');", null], ['document.cookie;', 'privacy'],
    ["window.open('https://example.com');", null], ['window.top.location = "/";', null], ['navigator.mediaDevices.getUserMedia({ audio: true });', null],
  ]) {
    const f = fails(add(js));
    assert.ok(f.length, `still refused: ${js}`);
    if (code) assert.ok(f.includes(code), `${js} -> ${f}`);
  }
  assert.ok(fails(html.replace('</style>', '</style><a href="https://example.com">x</a>')).length, 'a link out');
  assert.ok(fails(html.replace('</style>', '</style><form action="/x"><input name="n"></form>')).length, 'a form');
  assert.ok(fails(html.replace('</style>', '</style><p>Type your phone number here</p>')).includes('personal_info'), 'asking for personal details');
  assert.ok(fails(html.replace('</style>', '</style><script src="https://evil.example/x.js"></script>')).length, 'a script from outside');
  // the import map must be the pinned one, byte for byte in what it says
  const lib = `oomba3d/${V.OOMBA3D_VERSION}/oomba3d.js`;
  assert.ok(html.includes(`${lib}": "sha384-`) && html.includes(`"oomba3d": "/vendor/kit2/${lib}"`), 'the starter pins the newest Oomba3D');
  assert.ok(fails(html.replace(`${lib}": "sha384-`, `${lib}": "sha384-AAAA`)).length, 'a changed integrity');
  assert.ok(fails(html.replace(`"oomba3d": "/vendor/kit2/${lib}"`, '"oomba3d": "https://cdn.example/oomba3d.js"')).length, 'Oomba3D from another host');
  assert.ok(fails(html.replace(V.kit2ImportMap(), '')).length, 'no import map');
  // a world or version that has not shipped
  const cq = K.worldById('castle-quest').version;
  assert.ok(html.includes(`version: '${cq}',`), 'the starter names the newest Castle Quest');
  assert.deepEqual(fails(html.replace(`version: '${cq}',`, "version: '9.9.9',")), ['kit2_theme']);
  assert.deepEqual(fails(html.replace("world: 'castle-quest',", "world: 'dino-valley',")), ['kit2_theme']);
  assert.deepEqual(fails(html.replace(`version: '${cq}',`, "version: '1.0.0',")), [], 'an older shipped version stays allowed: saved games keep theirs');
  assert.ok(fails(add("const art = '/vendor/themes/dino-valley/1.0.0/heroes/rex.glb';")).includes('kit2_theme'));
});

test('the frame policy for built Kit 2 games is the one official Kit 2 games get', () => {
  const csp = frameCsp('https://oomba.example');
  assert.match(csp, /script-src [^;]*'wasm-unsafe-eval'/);
  assert.ok(!/'unsafe-eval'/.test(csp), 'no eval');
  assert.ok(!/worker-src/.test(csp) && /default-src 'none'/.test(csp), 'no workers');
  assert.match(csp, /connect-src blob: https:\/\/oomba\.example\/vendor\/themes\/;/);
  assert.match(csp, /sandbox allow-scripts allow-pointer-lock allow-orientation-lock;/);
  assert.ok(!/allow-same-origin/.test(csp));
});

test('Kit 2 notes: an invented hero, piece or sound name, and askQuestion outside Sky Islands', () => {
  const html = starter('castle-quest', 'knight');
  assert.deepEqual(lintKit2(html), []);
  assert.deepEqual(lintKit2('<title>x</title><script>const hero = { hero: "t-rex" };</script>'), [], 'only Kit 2 games');
  const bad = html.replace("hero: 'knight',", "hero: 't-rex',").replace('piece: "torch"', 'piece: "volcano"').replace('g.sound(\'wrong\')', "g.sound('roar')") + '<script type="module">g.askQuestion({});</script>';
  const codes = scanVersion(bad).lint.map(l => l.code);
  assert.deepEqual(codes, ['kit2_hero', 'kit2_piece', 'kit2_sound', 'kit2_ask']);
  assert.equal(scanVersion(bad).status, 'pass', 'notes never change the safety result');
  assert.match(lintKit2(bad)[0].message, new RegExp(`castle-quest ${K.worldById('castle-quest').version.replace(/\./g, '\\.')} has no hero called "t-rex"[\\s\\S]*knight, barbarian`));
  assert.deepEqual(lintKit2(starter('sky-islands') + '<script type="module">g.askQuestion({});</script>'), [], 'Sky Islands has island-round');
  // an older shipped version is read from its own manifest
  assert.ok(namesOf('castle-quest', '1.0.0').pieces.has('chest') && !namesOf('castle-quest', '1.0.0').pieces.has('castle-building'));
  assert.equal(namesOf('castle-quest', '9.9.9'), null);
});

// ---------------------------------------------------------------- the tools
let n = 0;
const newUser = () => auth.createUser({ username: `K2_${String.fromCharCode(97 + (n++ % 26))}${n}`, password: 'secret1' });
test('start_from_template "oomba3d": a shipped world and one of its characters, or a refusal with the real names', async () => {
  const u = newUser(), g = games.createGame(u.id, {}), state = {};
  const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state, locale: 'en' });
  let r = await tb.exec('start_from_template', { template: 'oomba3d', world: 'dino-valley', hero: 'knight', notes: 'x' });
  assert.equal(r.ok, false); assert.match(r.forModel, /no 3D world called "dino-valley"[\s\S]*sky-islands, castle-quest/);
  r = await tb.exec('start_from_template', { template: 'oomba3d', world: 'space-base', hero: 't-rex', notes: 'x' });
  assert.equal(r.ok, false); assert.match(r.forModel, /space-base has no character called "t-rex"[\s\S]*knight, barbarian[\s\S]*There are no others/);
  r = await tb.exec('start_from_template', { template: 'oomba3d', world: 'sky-islands', hero: 'skelly', notes: 'x' });
  assert.equal(r.ok, false, 'a character of another world is refused too');
  assert.equal(games.listVersions(g.id).length, 0, 'nothing was saved');
  r = await tb.exec('start_from_template', { template: 'oomba3d', world: 'space-base', hero: 'mage', notes: 'A wizard on the red planet' });
  assert.equal(r.ok, true, r.forModel);
  assert.match(r.forModel, /Kit 2 starter in the 3D world space-base 1\.0\.0 with the hero mage[\s\S]*KIT 2 RULES[\s\S]*This world's pieces: ground, ground-high/);
  assert.deepEqual(state.kit2, { world: 'space-base', hero: 'mage' });
  const v = tb.current();
  assert.equal(v.safety_status, 'pass'); assert.deepEqual(K.kit2Of(v.html), { world: 'space-base', version: '1.0.0', hero: 'mage' });
  // the old starters are as they were
  r = await tb.exec('start_from_template', { template: 'catch', notes: 'x' });
  assert.equal(r.ok, true); assert.ok(usesKit(tb.current().html) && !K.isKit2Game(tb.current().html));
});

// ---------------------------------------------------------------- the mock builder
async function turn(user, gameId, text) {
  const events = [];
  const r = await runTurn({ user, gameId, text, emit: (name, data) => events.push([name, data]) });
  const of = name => events.filter(e => e[0] === name).map(e => e[1]);
  return { r, of, text: of('text').map(d => d.text).join('') };
}
const current = id => games.getVersion(games.getGame(id).current_version_id);

test('mock: "a dinosaur game on the moon" builds a Kit 2 game in Space Base, and says there is no dinosaur yet', async () => {
  const u = newUser(), g = games.createGame(u.id, { title: 'New game' });
  let t = await turn(u, g.id, 'a dinosaur game on the moon');
  assert.equal(t.of('version').length, 1, 'built straight away'); assert.equal(t.of('version')[0].status, 'pass');
  let v = current(g.id);
  assert.deepEqual(K.kit2Of(v.html), { world: 'space-base', version: '1.0.0', hero: 'knight' });
  assert.ok(v.html.includes(V.kit2ImportMap()) && !usesKit(v.html));
  assert.match(t.text, /The 3D worlds do not have that animal yet\. The animals so far: [A-Z]/, 'the honest "not yet" for a dinosaur');
  assert.equal(games.getGame(g.id).title, 'Dino Space Base');
  assert.equal(k2Read(v.html, 'outfit'), '#66C792');
  assert.equal(t.of('ask').length, 1); assert.equal(t.of('ask')[0].options.length, 3);

  t = await turn(u, g.id, 'change the hero to the wizard and make it snow');
  v = current(g.id);
  assert.equal(v.number, 2); assert.equal(k2Read(v.html, 'hero'), 'mage'); assert.equal(k2Read(v.html, 'weather'), 'snow');
  t = await turn(u, g.id, 'make it night time and call it Moon Hop');
  v = current(g.id);
  assert.equal(k2Read(v.html, 'title'), 'Moon Hop'); assert.match(v.html, /<title>Moon Hop<\/title>/); assert.equal(games.getGame(g.id).title, 'Moon Hop');
  t = await turn(u, g.id, 'make it harder');
  assert.equal(k2Read(current(g.id).html, 'steps'), 6);
  // another world: a new starter there, with what they made carried over
  t = await turn(u, g.id, 'Make it a 3D game in the Toy Town world.');
  v = current(g.id);
  assert.deepEqual(K.kit2Of(v.html), { world: 'toy-town', version: '1.1.0', hero: 'mage' });
  assert.equal(k2Read(v.html, 'title'), 'Moon Hop'); assert.equal(k2Read(v.html, 'weather'), 'snow'); assert.equal(k2Read(v.html, 'steps'), 6); assert.equal(k2Read(v.html, 'outfit'), '#66C792');
  assert.equal(scanVersion(v.html).status, 'pass'); assert.deepEqual(scanVersion(v.html).lint, []);
  t = await turn(u, g.id, 'change the hero to a dinosaur');
  assert.match(t.text, /kept your hero \(the 3D worlds do not have that animal yet\)/); assert.equal(t.of('version').length, 0, 'nothing is pretended');
  for (const ver of games.listVersions(g.id)) assert.equal(ver.safety_status, 'pass');
});

test('mock: the chips build the picked world with the picked hero', async () => {
  const u = newUser(), g = games.createGame(u.id, { title: 'New game' });
  const t = await turn(u, g.id, 'Make it a 3D game in the Spooky Hollow world.\nUse the 3D hero Captain Clank.');
  assert.equal(t.of('version').length, 1);
  assert.deepEqual(K.kit2Of(current(g.id).html), { world: 'spooky-hollow', version: '1.0.0', hero: 'captain-clank' });
  assert.equal(games.getGame(g.id).title, 'Spooky Hollow');
});

test('mock: with no Kit 2 thing asked for, the game is an old-kit game, built and changed as before', async () => {
  const u = newUser(), g = games.createGame(u.id, { title: 'Untitled' });
  let t = await turn(u, g.id, 'hi');
  assert.equal(t.of('ask').length, 1); assert.equal(games.listVersions(g.id).length, 0);
  t = await turn(u, g.id, t.of('ask')[0].options.find(k => /catch/i.test(k)));
  t = await turn(u, g.id, '🦈 Sharks');
  assert.equal(t.of('version').length, 1);
  let v = current(g.id);
  assert.ok(usesKit(v.html) && !K.isKit2Game(v.html), 'an Oomba Kit game');
  assert.equal(games.getGame(g.id).title, 'Shark Catch');
  t = await turn(u, g.id, 'make it harder');
  v = current(g.id);
  assert.equal(v.number, 2); assert.ok(usesKit(v.html) && !K.isKit2Game(v.html)); assert.match(v.html, /BRB_TUNE\.speed = 1\.25;/);
  // a 3D request that names no world is still the old 3D starter (Star Island for the mock)
  const g2 = games.createGame(u.id, { title: 'Untitled' });
  t = await turn(u, g2.id, 'a 3D island adventure with a fox');
  assert.equal(t.of('version').length, 1);
  assert.ok(!K.isKit2Game(current(g2.id).html) && V.isThreeGame(current(g2.id).html));
  // and a picked 3D world replaces an old-kit game with a new Kit 2 version (the old one stays in Versions)
  t = await turn(u, g.id, 'Make it a 3D game in the Castle Quest world.');
  assert.match(t.text, /old game stays in Versions/);
  assert.equal(current(g.id).number, 3); assert.ok(K.isKit2Game(current(g.id).html));
  assert.ok(usesKit(games.getVersion(games.listVersions(g.id).find(x => x.number === 2).id).html), 'version 2 is untouched');
});

test('mock edits are exact one-line edits; a move carries the questions and words over', () => {
  const html = starter('castle-quest', 'knight');
  assert.deepEqual(k2Edits(html, { hero: 'rogue-hooded', steps: 6 }), [{ find: "\n  hero: 'knight',\n", replace: "\n  hero: 'rogue-hooded',\n" }, { find: '\n  steps: 4,\n', replace: '\n  steps: 6,\n' }]);
  assert.equal(k2Edits(html, { nope: 1 }), null);
  const mine = html.replace("{ question: '7 × 8 = ?', answers: [54, 56, 63], correct: 56 },", "{ question: 'Capital of France?', answers: ['Paris', 'Rome', 'Oslo'], correct: 'Paris' },");
  const moved = k2Move(mine, 'busy-kitchen', 'knight');
  assert.match(moved, /Capital of France\?/); assert.deepEqual(K.kit2Of(moved), { world: 'busy-kitchen', version: '1.0.0', hero: 'knight' });
  assert.equal(scanVersion(moved).status, 'pass'); assert.deepEqual(scanVersion(moved).lint, []);
});

// ---------------------------------------------------------------- the pages
const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });
function client() {
  const jar = new Map();   // every cookie (the session, and the language a ?lang= link sets)
  const c = async (p, { method = 'GET', body } = {}) => {
    const h = {}; if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = sc.split(';')[0], at = kv.indexOf('='); jar.set(kv.slice(0, at), kv.slice(at + 1)); }
    if (res.status >= 300 && res.status < 400 && method === 'GET' && res.headers.get('location')) return c(res.headers.get('location'));
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, text, json };
  };
  return c;
}

test('every world and character has its pictures', () => {
  for (const w of CAT.KIT2_WORLDS) for (const f of [`worlds/${w.id}.webp`, `worlds/${w.id}-card.webp`]) assert.ok(fs.statSync(path.join(ROOT, 'public/img/kit2', f)).size > 500, f);
  for (const c of K.KIT2_CHARACTERS) assert.ok(fs.statSync(path.join(ROOT, 'public/img/kit2/heroes', `${c.id}.webp`)).size > 500, c.id);
});

test('the Build page and the Studio offer every world and character, with pictures; a world card starts a Kit 2 game', async () => {
  const c = client();
  assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'WorldPicker', password: 'secret12' } })).status, 200);
  const build = await c('/build');
  for (const w of CAT.KIT2_WORLDS) assert.match(build.text, new RegExp(`data-template="oomba3d" data-world="${w.id}"[^>]*>\\s*<span class="tplcover tplpic"><img src="/img/kit2/worlds/${w.id}-card\\.webp"`), w.id);
  assert.match(build.text, /Start in a 3D world/);
  assert.equal((await c('/api/studio/new', { method: 'POST', body: { template: 'oomba3d', world: 'dino-valley' } })).status, 400);
  assert.equal((await c('/api/studio/new', { method: 'POST', body: { template: 'oomba3d' } })).status, 400);
  const made = await c('/api/studio/new', { method: 'POST', body: { template: 'oomba3d', world: 'medieval-village' } });
  assert.equal(made.status, 200, made.text);
  const state = (await c(`/api/studio/${made.json.id}`)).json;
  assert.deepEqual(state.kit2, { world: 'medieval-village', version: K.worldById('medieval-village').version, hero: 'knight' });
  assert.equal(state.current.safety, 'pass'); assert.equal(state.game.title, 'Medieval Village');
  // the Studio of a Kit 2 game: the 3D worlds tab first, its world and hero marked, every chip with its picture
  let page = (await c(`/studio/${made.json.id}`)).text;
  assert.match(page, /id="st-tab-worlds"[^>]*aria-selected="true"/);
  assert.match(page, /id="st-row-classic"[^>]*hidden/);
  for (const w of CAT.KIT2_WORLDS) assert.match(page, new RegExp(`class="st-pick st-world[^"]*" data-world="${w.id}"[^>]*><img src="/img/kit2/worlds/${w.id}\\.webp"`), w.id);
  for (const h of K.charactersOf('medieval-village')) assert.match(page, new RegExp(`class="st-pick st-hero[^"]*" data-hero="${h.id}" data-worlds="[a-z -]*medieval-village[a-z -]*"[^>]*><img src="/img/kit2/heroes/${h.id}\\.webp"`), h.id);
  assert.match(page, /class="st-pick st-world is-current" data-world="medieval-village"/);
  assert.match(page, /class="st-pick st-hero is-current" data-hero="knight"/);
  assert.equal((page.match(/class="st-theme[ "]/g) || []).length, 15, 'the classic themes are all still there');
  // a new, empty game opens on the 3D worlds; an old-kit game opens on its classic themes
  const empty = await c('/api/studio/new', { method: 'POST', body: {} });
  page = (await c(`/studio/${empty.json.id}`)).text;
  assert.match(page, /id="st-tab-worlds"[^>]*aria-selected="true"/);
  for (const ch of K.KIT2_CHARACTERS) assert.ok(page.includes(`data-hero="${ch.id}" data-worlds="${ch.worlds.join(' ')}"`), `every character is offered for a new game: ${ch.id}`);
  assert.ok(page.includes('data-hero="skelly"') && !page.includes('data-hero="skelly" data-worlds="sky-islands'), 'the page knows Sky Islands has no skeleton pals');
  const old = await c('/api/studio/new', { method: 'POST', body: { template: 'catch' } });
  page = (await c(`/studio/${old.json.id}`)).text;
  assert.match(page, /id="st-tab-classic"[^>]*aria-selected="true"/); assert.match(page, /id="st-row-worlds"[^>]*hidden/);
  assert.equal((await c(`/api/studio/${old.json.id}`)).json.kit2, null);
  // the pictures are served
  for (const f of ['/img/kit2/worlds/castle-quest.webp', '/img/kit2/heroes/skelly.webp']) assert.equal((await fetch(BASE + f)).status, 200, f);
  // in another language the chips carry that language's names
  const fr = (await c(`/studio/${made.json.id}?lang=fr`)).text;
  assert.match(fr, /data-world="castle-quest" data-name="Quête du Château"/); assert.match(fr, /Mondes 3D/);
});

// ---------------------------------------------------------------- the platform's playtest report
test('the automatic playtest does not call a Kit 2 game slow for the test machine\'s software graphics', () => {
  const st = (scene, z, score) => ({ state: { scene, score, hero: { x: 0, y: 0, z } }, nums: String(score), raf: 100 });
  const raw = { started: 'hook', startedAt: 1500, fps: 6, inputs: 17, playMs: 18000, errors: [], events: [], layout: [], kitWarnings: [],
    s0: st('title', 1, 0), s1: st('play', 1, 0), readings: [st('play', -2, 1), st('play', -5, 2)], s2: st('play', -6, 2),
    shots: [{ at: 'title', same: 0.3 }, { at: 'start', moved: 0.4, same: 0.3 }, { at: 'idle', moved: 0.02 }, { at: 'play', moved: 0.3, same: 0.3 }, { at: 'play', moved: 0.3, same: 0.3 }] };
  const k2 = autotest.buildReport(raw, { html: starter('castle-quest'), version: 1 });
  assert.deepEqual(k2.problems, [], 'a correct Kit 2 game is accepted');
  assert.equal(k2.facts.input, 'yes');
  assert.ok(autotest.buildReport({ ...raw, fps: 2 }, { html: starter('castle-quest'), version: 1 }).issues.some(i => i.key === 'slow'), 'a game that barely moves is still slow');
  assert.ok(autotest.buildReport(raw, { html: '<title>x</title><canvas></canvas><script>let score = 0;</script>', version: 1 }).issues.some(i => i.key === 'slow'), 'other games keep the old threshold');
  const broken = autotest.buildReport({ ...raw, errors: ['Oomba3D: no hero "t-rex" in castle-quest'] }, { html: starter('castle-quest'), version: 1 });
  assert.ok(broken.issues.some(i => i.key === 'errors' && !i.soft), 'an invented name is a real problem to fix');
});

// ---------------------------------------------------------------- real Chromium, inside the production frame
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); await snapshot.closeBrowser(); });
async function openGame(html, { width = 960, height = 600, touch = false, lang = 'en' } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  // The production frame: the same document, CSP header and sandbox attribute a player's browser gets.
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang }, game: { id: 'g', title: 'T' }, save: {}, canSave: false });
  const outer = `<!doctype html><meta charset=utf-8><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe><script>window.__msgs=[];addEventListener('message',e=>{if(e.data&&e.data.type)__msgs.push(e.data.type)});</script>`;
  const outside = [], asked = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: outer });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && snapshot.vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) { asked.push(new URL(u).pathname); return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    outside.push(u); return route.abort();
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(HOST + '/');
  const frame = page.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().scene === 'title', null, { timeout: 100_000 });
  return { ctx, page, frame, errors, outside, asked, state: () => frame.evaluate(() => window.__brbTest.state()) };
}

// At least two worlds and three characters (the brief asks for an animal and a dinosaur among them: none has shipped,
// see the test above; an adventurer, a wizard and two skeleton pals are played instead). Each plays a whole round.
const PLAYS = [['sky-islands', 'knight'], ['castle-quest', 'skelly'], ['space-base', 'mage'], ['busy-kitchen', 'captain-clank']];
for (const [world, hero] of PLAYS) {
  test(`${world} with ${hero}: the starter loads and plays a whole round in the production frame`, { skip, timeout: 420_000 }, async () => {
    const w = K.worldById(world);
    const G = await openGame(starter(world, hero));
    const { page, frame } = G;
    const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 60_000 });
    let s = await G.state();
    assert.deepEqual([s.scene, s.world, s.heroId, s.score, s.answered, s.questions], ['title', world, hero, 0, 0, 2]);
    assert.equal(await frame.evaluate(() => document.querySelector('#t-title').textContent), w.name);
    assert.ok(await frame.evaluate(() => { const b = document.querySelector('#play').getBoundingClientRect(); return b.width >= 48 && b.height >= 48 && b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }), 'a big Play button on screen');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('canvas').length), 1);
    // the art comes from this world's pinned folder and the pinned engines, and from nowhere else
    assert.ok(G.asked.includes(`/vendor/themes/${world}/${w.version}/theme.json`));
    assert.ok(G.asked.includes(`/vendor/themes/${world}/${w.version}/heroes/${hero}.glb`), 'the picked character\'s model');
    assert.ok(G.asked.includes(V.OOMBA3D_MODULE));
    for (const u of G.asked) assert.ok(u.startsWith(`/vendor/themes/${world}/${w.version}/`) || u.startsWith('/vendor/kit2/') || u.startsWith('/vendor/three/'), u);
    // Play: the button starts the round; the keyboard walks the hero forward
    await frame.click('#play');
    await until(() => window.__brbTest.state().scene === 'play');
    assert.match(await frame.evaluate(() => document.querySelector('#ask').textContent), /Jump to the answer: 7 × 8 = \?/);
    await page.focus('iframe');
    const z0 = (await G.state()).hero.z;
    await page.keyboard.down('ArrowUp'); await until(z => window.__brbTest.state().hero.z < z - 0.5, z0); await page.keyboard.up('ArrowUp');
    // a coin, a wrong answer, the right answers, then the goal
    const spots = await frame.evaluate(() => window.__brbTest.spots());
    await frame.evaluate(c => window.__brbTest.put(c[0], c[1] - 1, c[2]), spots.coins[2]);
    await until(() => window.__brbTest.state().coins >= 1);
    await frame.evaluate(g => window.__brbTest.put(...g), spots.goal.map((v, i) => (i === 1 ? v + 2 : v)));
    await until(() => /Answer the question first/.test(document.querySelector('.o3-toast').textContent));
    assert.equal((await G.state()).scene, 'play', 'the goal waits for the answers');
    const wrong = spots.pads[0].find(p => !p.right), right0 = spots.pads[0].find(p => p.right), right1 = spots.pads[1].find(p => p.right);
    await frame.evaluate(p => window.__brbTest.put(...p.at), wrong);
    await until(a => new RegExp(`Not ${a}!`).test(document.querySelector('.o3-toast').textContent), wrong.answer);
    assert.equal((await G.state()).answered, 0);
    const before = (await G.state()).score;
    await frame.evaluate(p => window.__brbTest.put(...p.at), right0);
    await until(() => window.__brbTest.state().answered === 1);
    assert.equal((await G.state()).score, before + 5);
    assert.match(await frame.evaluate(() => document.querySelector('#ask').textContent), /9 \+ 6 = \?/);
    await frame.evaluate(p => window.__brbTest.put(...p.at), right1);
    await until(() => window.__brbTest.state().answered === 2);
    await frame.evaluate(g => window.__brbTest.put(...g), spots.goal.map((v, i) => (i === 1 ? v + 2 : v)));
    await until(() => window.__brbTest.state().scene === 'win');
    await until(() => !document.querySelector('#end').hidden);
    assert.match(await frame.evaluate(() => document.querySelector('#e-score').textContent), /Score: \d+/);
    assert.ok((await page.evaluate(() => window.__msgs)).includes('brb:gameover'), 'the round\'s end reaches the page (BRB.gameOver)');
    // Play again starts a clean round
    await frame.click('#again');
    await until(() => window.__brbTest.state().scene === 'play');
    s = await G.state();
    assert.deepEqual([s.score, s.coins, s.answered], [0, 0, 0]);
    if (process.env.K2_SHOTS) await page.screenshot({ path: path.join(process.env.K2_SHOTS, `builder-${world}-${hero}.png`) });
    assert.deepEqual(G.errors, []);
    assert.deepEqual(G.outside, [], 'nothing asked for outside /vendor');
    await G.ctx.close();
  });
}

test('on a phone: the title fits, the touch pad shows, and the words follow the player\'s language', { skip, timeout: 180_000 }, async () => {
  const G = await openGame(starter('toy-town', 'rogue'), { width: 390, height: 844, touch: true, lang: 'fr' });
  const { frame } = G;
  assert.equal(await frame.evaluate(() => document.querySelector('#play').textContent), '▶ Jouer');
  assert.ok(await frame.evaluate(() => { const c = document.querySelector('#title .card').getBoundingClientRect(); return c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; }), 'the title card is inside the screen');
  await frame.tap('#play');
  await frame.waitForFunction(() => window.__brbTest.state().scene === 'play', null, { timeout: 30_000 });
  assert.match(await frame.evaluate(() => document.querySelector('#ask').textContent), /Saute sur la réponse/);
  assert.ok(await frame.evaluate(() => { const p = document.querySelector('.o3-pad'); const j = document.querySelector('.o3-jump').getBoundingClientRect(); return !!p && getComputedStyle(p).display !== 'none' && j.width >= 48 && j.bottom <= innerHeight; }), 'the on-screen pad with a big Jump button');
  const z0 = (await G.state()).hero.z;
  await frame.dispatchEvent('.o3-dpad [data-k="ArrowUp"]', 'pointerdown');
  await frame.waitForFunction(z => window.__brbTest.state().hero.z < z - 0.5, z0, { timeout: 30_000 });
  await frame.dispatchEvent('.o3-dpad [data-k="ArrowUp"]', 'pointerup');
  assert.deepEqual(G.errors, []); assert.deepEqual(G.outside, []);
  await G.ctx.close();
});

test('an invented character stops with Oomba3D\'s own error (what the Kit 2 note warns about)', { skip, timeout: 180_000 }, async () => {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const html = starter('castle-quest', 'knight').replace("hero: 'knight',", "hero: 't-rex',");
  assert.deepEqual(scanVersion(html).lint.map(l => l.code), ['kit2_hero']);
  const G = await openGame(html).catch(e => e);
  assert.ok(G instanceof Error, 'the game never reaches its title screen');
});

test('the platform\'s own playtest and cover picture accept the starter', { skip, timeout: 240_000 }, async () => {
  assert.ok(snapshot.enabled());
  const html = starter('castle-quest', 'rattles');
  // the cover picture: started through the test hook, no errors, a real picture
  const shot = await snapshot.runGame(html, { size: 'cover', orientation: 'landscape', lang: 'en', dir: 'ltr', title: 'T', titleMs: 1500, playMs: 2500 });
  assert.deepEqual(shot.errors, []);
  assert.match(shot.started, /__brbTest\.start\(\)/);
  assert.ok(shot.after.testHook && /"scene":"(play|loading)"/.test(shot.after.state), shot.after.state);
  assert.ok((shot.play || shot.title).length > 4000, 'a picture, not a blank frame');
  // the automatic playtest (about 18 s of keys, taps and swipes): nothing it calls a real problem
  const raw = await snapshot.autoplayGame(html, { orientation: 'landscape', lang: 'en', dir: 'ltr', title: 'T' });
  const rep = autotest.buildReport(raw, { html, version: 1 });
  assert.equal(raw.started, 'hook', 'started through window.__brbTest.start()');
  assert.deepEqual(rep.issues.filter(i => !i.soft && i.key !== 'slow').map(i => i.text), [], rep.forModel);
  assert.equal(rep.facts.errors, 0); assert.equal(rep.facts.blank, false); assert.equal(rep.facts.started, true);
  for (const v of raw.layout) assert.deepEqual(v.problems, [], v.label);
});
