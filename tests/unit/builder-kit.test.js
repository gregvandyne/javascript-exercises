// The Builder on the Oomba Kit: the KIT_RULES block (generated from docs/kit-api.md, byte-stable, in the cached prompt),
// its example games (they run), the kit tune layer (Oomba.__tune: character looks, title, biome and speed as spec edits),
// the mock Builder making and changing kit games (and "upgrade it" for an older game, only when asked), and the style
// notes going back to the model.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = process.env.BRB_DATA_DIR || (await import('node:os')).tmpdir() + '/brb-builder-kit-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeWin } from '../support/kit-fake.js';
import { createKit, VERSION } from '../../kit/src/index.js';
import * as animals from '../../kit/packs/art-animals.js';
import * as school from '../../kit/packs/art-school.js';
import * as biomes from '../../kit/packs/art-biomes.js';
import * as dress from '../../kit/packs/dress.js';
import * as biomes2 from '../../kit/packs/art-biomes-2.js';
import * as props from '../../kit/packs/art-props.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const { toolbox, styleTips } = await import('../../server/builder/tools.js');
const { SYSTEM_PROMPT, KIT_RULES, TOOLS } = await import('../../server/builder/prompt.js');
const { buildRules, fileText, OUT } = await import('../../scripts/build-kit-rules.js');
const { kitTag, kitPackTag, kitPacks } = await import('../../server/services/kit.js');
const { withLayer, layerScript, readTune, tuneEdits, hasKitLayer, LAYER_ID } = await import('../../server/builder/layer.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { fallbackHtml } = await import('../../server/builder/catalog.js');
const { scanVersion } = await import('../../server/services/scanner.js');

/** A fake window a little closer to a browser for whole games (the HUD's clock looks up its parts; append takes text). */
function gameWin(o) {
  const win = fakeWin(o), doc = win.document, make = doc.createElement;
  doc.createElement = tag => { const e = make(tag); e.querySelector = () => make('span'); e.append = (...cs) => cs.forEach(c => e.appendChild(typeof c === 'string' ? make('#text') : c)); return e; };
  return win;
}
const withPacks = O => { O.__pk({ name: 'art-animals', version: VERSION }, animals.define); O.__pk({ name: 'art-school', version: VERSION }, school.define); O.__pk({ name: 'art-biomes', version: VERSION }, biomes.define); O.__pk({ name: 'dress', version: VERSION }, dress.define); O.__pk({ name: 'art-biomes-2', version: VERSION }, biomes2.define); O.__pk({ name: 'art-props', version: VERSION }, props.define); return O; };

// ---- KIT_RULES -------------------------------------------------------------------------------------------------------
test('KIT_RULES: generated from docs/kit-api.md and the kit, up to date, and the same bytes every build', async () => {
  const a = await buildRules(), b = await buildRules();
  assert.equal(a, b, 'deterministic');
  assert.equal(fs.readFileSync(OUT, 'utf8'), fileText(a), 'server/builder/kit-rules.js is out of date: run node scripts/build-kit-rules.js');
  assert.ok(a.length > 8000 && a.length < 32000, `${a.length} characters`);   // about 8k tokens: one cached block
});

test('KIT_RULES ends the cached system prompt, with the pinned kit and pack tags and every art name', () => {
  assert.ok(SYSTEM_PROMPT.endsWith(KIT_RULES));
  assert.ok(KIT_RULES.includes(kitTag()), 'the exact kit tag');
  for (const p of kitPacks()) assert.ok(KIT_RULES.includes(kitPackTag(p)), `the exact ${p} tag`);
  assert.doesNotMatch(KIT_RULES, /\{\{(KIT_TAG|PACK_TAG)/, 'no placeholders left');
  assert.doesNotMatch(SYSTEM_PROMPT, /\$\{/);
  const O = withPacks(createKit(fakeWin({ search: '' })));
  const names = [...O.art.species, ...O.art.biomes, ...Object.values(O.art.props).flat(), ...O.art.wear, ...O.icons, ...O.level.controls];
  for (const n of new Set(names)) assert.ok(KIT_RULES.includes(n), `KIT_RULES names ${n}`);
  for (const s of ['Oomba.game', 'Oomba.level.grid', 'w.spawn', 'w.ask', 'collectible', 'quizGate', 'one key per line', 'WORDS', 'game clock', 'upgrade', 'var(--ok-card)', 'motion', 'Art direction'])
    assert.ok(SYSTEM_PROMPT.includes(s), s);
  // The tool may start from any template now (they are small kit games).
  const start = TOOLS.find(t => t.name === 'start_from_template');
  assert.deepEqual(start.input_schema.properties.template.enum, ['quiz', 'runner', 'catch', 'memory', 'word', 'duel', 'board', 'island']);
});

test('the three example games in the rules run in the kit with only the packs they load: straight into play, no warnings', async () => {
  const md = fs.readFileSync(path.join(ROOT, 'docs/kit-api.md'), 'utf8');
  const section = md.match(/<!-- builder:examples -->\n([\s\S]*?)\n<!-- \/builder -->/)[1];
  const examples = [...section.matchAll(/```js\n([\s\S]*?)\n```/g)].map(m => m[1]);
  assert.equal(examples.length, 3);
  for (const src of examples) {
    const win = gameWin({ search: '?okDebug=1&okBackend=paper', brb: { version: 3, gameOver() {} } });
    // only the packs the example itself loads ({{PACK_TAG:name}}), so pack art used without its tag shows as a warning
    const O = createKit(win), PK = { 'art-animals': animals, 'art-school': school, 'art-biomes': biomes, 'art-biomes-2': biomes2, 'art-props': props, dress };
    // dress always (the rules' document loads it in every 2D game: themes live in it)
    for (const [n, mod] of Object.entries(PK)) if (n === 'dress' || src.includes(`PACK_TAG:${n}`)) O.__pk({ name: n, version: VERSION }, mod.define);
    new Function('Oomba', 'window', 'document', src.replace('Oomba.game({', 'Oomba.game({ autorun: false,'))(O, win, win.document);
    const T = win.__brbTest;
    T.start(); T.step(120); await new Promise(r => setImmediate(r)); T.step(120);
    assert.equal(T.state().game, true);
    assert.ok(['play', 'talk'].includes(T.state().scene), T.state().scene);
    assert.deepEqual(win.__warns, [], src.slice(0, 60));
  }
});

// ---- the kit tune layer ------------------------------------------------------------------------------------------------
const KIT_GAME = `<title>Fruit Catch</title>\n<div id="game"></div>\n${kitTag()}\n<script>\nOomba.game({ title: 'Fruit Catch' });\n</script>`;
/** The layer's script run in a fake window, then the kit "loads" (sets window.Oomba), as in a real page. */
function layered(tune) {
  const html = withLayer(KIT_GAME, tune);
  const code = html.match(new RegExp(`<script id="${LAYER_ID}"(?: data-kit="1")?>\\n([\\s\\S]*?)\\n</script>`))[1];
  const win = gameWin({ search: '?okDebug=1&okBackend=paper', brb: { version: 3, gameOver() {} } });
  new Function('window', code)(win);
  win.Oomba = withPacks(createKit(win));
  return { win, O: win.Oomba, kit: win.Oomba.debug.kit, html };
}

test('kit layer: a 2D kit game gets it (3D and older games keep the original layer, byte for byte)', () => {
  assert.ok(hasKitLayer(withLayer(KIT_GAME, {})));
  assert.ok(!hasKitLayer(withLayer(fallbackHtml(), {})), 'an older game');
  assert.ok(!hasKitLayer(withLayer(loadTemplate('island'), {})), 'the 3D island reads BRB_TUNE.hero itself');
  assert.match(withLayer(fallbackHtml(), { tint: '#ff5fb0' }), /BRB_TUNE\.tint = "#ff5fb0";/);
  const h = withLayer(KIT_GAME, { look: { fox: { colors: { base: 'sky' } } } });
  assert.deepEqual(readTune(h).look, { fox: { colors: { base: 'sky' } } });
  assert.deepEqual(tuneEdits(h, { look: { fox: { wear: ['crown'] } } }), [{ find: 'BRB_TUNE.look = {"fox":{"colors":{"base":"sky"}}};', replace: 'BRB_TUNE.look = {"fox":{"wear":["crown"]}};' }]);
  assert.equal(tuneEdits(h, { tint: '#000000' }), null, 'no colour wash line on a kit game');
  assert.ok(h.indexOf(`<script id="${LAYER_ID}"`) < h.indexOf(kitTag()), 'before the kit tag, so it sees the kit arrive');
  assert.equal(scanVersion(h).status, 'pass');
  assert.equal(layerScript({}, { kit: true }).includes('setTimeout'), false, 'the kit layer runs on the kit clock');
});

test('Oomba.__tune: "make the fox blue with a hat" and the hero, title, biome and speed are spec edits', () => {
  const { O, kit, win } = layered({ speed: 1.25, name: ['Fruit Catch', 'Fox Party'], biome: 'snow', look: { fox: { colors: { base: 'sky' }, wear: ['wizard-hat'] }, hero: { colors: { base: 'grape' }, wear: ['crown'] } } });
  assert.equal(typeof O.__tune, 'function'); assert.ok(!Object.keys(O).includes('__tune'), 'not part of the public API');
  const g = O.game({ api: 1, title: 'Fruit Catch', hero: { species: 'bunny' }, autorun: false, level: O.level.grid(['  P   N  ', '#########'], { N: { kind: 'npc', species: 'fox', tag: 'friend' } }) });
  assert.equal(kit.game.spec.title, 'Fox Party'); assert.equal(kit.game.spec.biome, 'snow');
  const hero = kit.game.spec.hero; assert.equal(hero.species, 'bunny'); assert.equal(hero.colors.base, 'grape'); assert.deepEqual(hero.wear, ['crown']);
  g.start();
  const fox = g.world.find('friend');
  assert.equal(fox.spec.colors.base, 'sky'); assert.deepEqual(fox.spec.wear, ['wizard-hat']);
  assert.equal(g.world.hero.spec.colors.base, 'grape');
  assert.equal(O.time.scale, 1.25, 'the game clock, on top of the player\'s speed setting');
  O.settings.speed = 0.5; assert.equal(O.time.scale, 0.625, 'the assist setting still slows it');
  O.settings.speed = 1;
  O.__tune({ speed: 1.5, look: { hero: { colors: { base: 'mint' } } } });
  assert.equal(O.time.scale, 1.5); assert.equal(g.world.hero.spec.colors.base, 'mint', 'changed in place, in a running game');
  assert.deepEqual(win.__warns, []);
});

test('Oomba.__tune level 2: after 40 s of play the game clock speeds up with the kit toast', () => {
  const { O } = layered({ level2: true });
  const g = O.game({ api: 1, title: 'T', autorun: false, level: O.level.grid(['  P  ', '#####']) });
  g.start(); const T = O.debug.kit.win.__brbTest;
  T.step(60 * 39); assert.equal(O.time.scale, 1);
  T.step(60 * 2); assert.equal(O.time.scale, 1.35);
});

// ---- the mock Builder with kit games -------------------------------------------------------------------------------
let n = 0;
const newUser = () => auth.createUser({ username: `Kit_${String.fromCharCode(97 + (n++ % 26))}${'xyz'[n % 3]}${n}`.slice(0, 16), password: 'secret1' });
async function turn(user, gameId, text) {
  const events = [];
  await runTurn({ user, gameId, text, emit: (name, data) => events.push([name, data]) });
  const of = name => events.filter(e => e[0] === name).map(e => e[1]);
  return { of, text: of('text').map(d => d.text).join('') };
}
const current = id => games.getVersion(games.getGame(id).current_version_id);

test('mock: a kit game from a template, then "make the fox blue with a hat", a snowy world and a new name as spec edits', async () => {
  const u = newUser(); const g = games.createGame(u.id, { title: 'Untitled' });
  await turn(u, g.id, 'a two player duel game, just build it');
  const v1 = current(g.id);
  assert.ok(v1.html.includes(kitTag()), 'built on the kit'); assert.ok(hasKitLayer(v1.html)); assert.equal(v1.safety_status, 'pass');
  await turn(u, g.id, 'make the fox blue with a hat');
  const v2 = current(g.id); assert.equal(v2.number, 2);
  assert.deepEqual(readTune(v2.html).look.fox, { colors: { base: 'sky' }, outfit: { color: 'sky' }, wear: ['wizard-hat'] });
  assert.equal(v2.html.replace(/^BRB_TUNE\.look = .*$/m, ''), v1.html.replace(/^BRB_TUNE\.look = .*$/m, ''), 'one line changed');
  await turn(u, g.id, 'make the world snowy');
  assert.equal(readTune(current(g.id).html).biome, 'snow');
  await turn(u, g.id, 'call it Snow Snatch');
  assert.deepEqual(readTune(current(g.id).html).name, ['Snack Snatch!', 'Snow Snatch']); assert.equal(games.getGame(g.id).title, 'Snow Snatch');
  assert.equal(scanVersion(current(g.id).html).status, 'pass');
});

test('mock: "upgrade it" rebuilds an older game on the kit only when asked, keeping its title; a kit game is left alone', async () => {
  const u = newUser(); const g = games.createGame(u.id, { title: 'Old Catch' });
  const old = withLayer(fallbackHtml(), { speed: 1.25 });
  games.addVersion(g.id, old, { notes: 'An old game', createdBy: u.id, safetyStatus: 'pass', safetyReport: scanVersion(old) });
  await turn(u, g.id, 'make it harder');
  const v2 = current(g.id);
  assert.ok(!v2.html.includes('/vendor/oomba-kit/'), 'an ordinary edit never moves an old game to the kit');
  assert.match(v2.html, /BRB_TUNE\.speed = 1\.56;/);
  await turn(u, g.id, 'upgrade it to the new look please');
  const v3 = current(g.id);
  assert.equal(v3.number, 3); assert.equal(v3.notes, 'Upgraded to the new Oomba look');
  assert.ok(v3.html.includes(kitTag())); assert.equal(v3.safety_status, 'pass');
  assert.equal(readTune(v3.html).speed, 1.56, 'its tune-ups come along');
  assert.match(v3.html, /<title>Old Catch<\/title>/); assert.equal(readTune(v3.html).name[1], 'Old Catch');
  assert.equal(games.getVersion(games.listVersions(g.id).find(v => v.number === 2).id).html, v2.html, 'the old game stays in Versions');
  const t = await turn(u, g.id, 'upgrade it');
  assert.equal(current(g.id).number, 3, 'already on the kit: nothing to do'); assert.match(t.text, /already has the newest/);
});

test('mock: game ideas that only mention upgrades ("add an upgrade shop", "upgrade the hero\'s sword") never rebuild an older game', async () => {
  const u = newUser(); const g = games.createGame(u.id, { title: 'Old Catch' });
  const old = withLayer(fallbackHtml(), { speed: 1.25 });
  games.addVersion(g.id, old, { notes: 'An old game', createdBy: u.id, safetyStatus: 'pass', safetyReport: scanVersion(old) });
  for (const t of ['add an upgrade shop', "upgrade the hero's sword", 'give the player upgrades', 'can you upgrade the jump']) {
    await turn(u, g.id, t);
    assert.ok(!current(g.id).html.includes('/vendor/oomba-kit/'), `"${t}" kept the old game`);
  }
  await turn(u, g.id, 'please upgrade my game'); assert.ok(current(g.id).html.includes(kitTag()), 'an unambiguous ask still upgrades');
});

test('mock: fixing an older game\'s failed scan rebuilds it on its kit template with its title and speed (hero and colour mapped, never dropped)', async () => {
  const u = newUser(); const g = games.createGame(u.id, { title: 'Old Catch' });
  const bad = withLayer(fallbackHtml().replace('</body>', '<p>retard</p></body>'), { speed: 1.25 });
  games.addVersion(g.id, bad, { notes: 'bad', createdBy: u.id, safetyStatus: 'fail', safetyReport: scanVersion(bad) });
  await turn(u, g.id, 'fix it');
  const v = current(g.id);
  assert.equal(v.notes, 'Fixed the safety check'); assert.equal(v.safety_status, 'pass');
  assert.ok(v.html.includes(kitTag())); assert.equal(readTune(v.html).speed, 1.25); assert.equal(readTune(v.html).name[1], 'Old Catch');
});

test('the style check goes back to the model after a version; start_from_template makes any kit template', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const tb = toolbox({ user: u, gameId: g.id, emit() {}, state: {} });
  const messy = `<title>T</title><div id="game"></div>\n${kitTag()}\n<script>\nOomba.game({}); ctx.font = 'bold 20px Arial'; setTimeout(go, 9);\n</script>`;
  const r = tb.exec('write_game', { html: messy, notes: 'x' });
  assert.equal(r.ok, true); assert.match(r.forModel, /style check/i); assert.match(r.forModel, /\(font\)/); assert.match(r.forModel, /\(timing\)/);
  assert.equal(styleTips(scanVersion(loadTemplate('quiz'))).length, 0);
  const s = await tb.exec('start_from_template', { template: 'quiz', notes: 'A quiz' });
  assert.equal(s.ok, true); assert.match(s.forModel, /CONFIG block/); assert.match(s.forModel, /WORDS/);
  assert.ok(current(g.id).html.includes(kitTag()));
});

test('creative freedom: the rules say the builder\'s choices win, and the style check never undoes what they asked for', () => {
  // the rule is in the cached prompt (KIT_RULES), next to "play as me"
  assert.match(KIT_RULES, /builder's own choices always win/);
  assert.match(KIT_RULES, /made-up creatures/); assert.match(KIT_RULES, /plain look/);
  assert.match(KIT_RULES, /hero: 'me'/); assert.match(KIT_RULES, /Oomba\.avatar\(\)/);
  assert.match(KIT_RULES, /Unless\s+the builder asks, never draw your own characters/);
  // look notes reach the model as suggestions; a look the builder asked for never reaches it at all
  const u = newUser(); const g = games.createGame(u.id, {});
  const messy = `<title>T</title><div id="game"></div>\n${kitTag()}\n<script>\nOomba.game({ theme: 'lava jelly' }); ctx.fillStyle = '#ff00ff'; ctx.font = 'bold 20px Arial'; setTimeout(go, 9);\n</script>`;
  const plain = toolbox({ user: u, gameId: g.id, emit() {}, state: {} }).exec('write_game', { html: messy, notes: 'x' });
  assert.match(plain.forModel, /Look suggestion, skip it if the builder asked for this look \(raw_hex\)/);
  assert.match(plain.forModel, /\(theme_name\)/); assert.match(plain.forModel, /choices always win/);
  const asked = toolbox({ user: u, gameId: g.id, emit() {}, state: {}, requests: ['a lava jelly world', 'make it hot pink and use a funky font'] }).exec('write_game', { html: messy + ' ', notes: 'y' });
  assert.doesNotMatch(asked.forModel, /\((raw_hex|font|theme_name)\)/, asked.forModel);
  assert.match(asked.forModel, /Style \(timing\)/, 'correctness notes still go');
  assert.deepEqual(styleTips(scanVersion(messy), 'pink, a font and a lava jelly world').map(x => x.match(/\((\w+)\)/)[1]), ['timing', 'dress_missing'], 'a bare world was not asked for: that suggestion stays');
});

test('the playtest probe turns a stuck round, nothing collected, a covered hero and an empty cover frame into problems the model reads', async () => {
  const { probeProblems } = await import('../../server/builder/tools.js');
  const st = o => ({ game: true, scene: 'play', score: 0, got: 0, total: 3, cell: 48, controls: 'platformer:kid-easy', ...o });
  const stuck = probeProblems({ probe: { s0: st(), s1: st(), scenes: ['play'], moved: 0, covered: null } });
  assert.match(stuck.join(' '), /nothing happened/);
  assert.match(probeProblems({ probe: { s0: st(), s1: st({ score: 30 }), scenes: ['play'], moved: 400 } }).join(' '), /nothing was picked up \(0 of 3\)/);
  assert.match(probeProblems({ probe: { s0: st(), s1: st({ got: 3, score: 30 }), scenes: ['play'], moved: 400, covered: 'div#card' } }).join(' '), /hidden under the game's own div#card/);
  assert.match(probeProblems({ probe: null }, { state: JSON.stringify(st({ inView: 0 })) }).join(' '), /shows almost nothing/);
  assert.deepEqual(probeProblems({ probe: { s0: st({ total: 0, controls: 'none' }), s1: st({ total: 0, controls: 'none' }), scenes: ['play'], moved: 0 } }, { state: JSON.stringify(st({ controls: 'none', inView: 0 })) }), [], 'a card game played with its own buttons is not "stuck"');
  assert.deepEqual(probeProblems({ probe: { s0: st(), s1: st({ scene: 'win', got: 3 }), scenes: ['play', 'goal', 'win'], moved: 900 } }), []);
});
