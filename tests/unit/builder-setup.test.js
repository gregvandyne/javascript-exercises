// The step-by-step game setup before the Builder (/build/new): the plan as data (builder/plan.js), the page and its
// bypass, the groups of "Who is in it?" (driven by the catalogue, "Coming soon" for empty ones), the hand-off to the
// Builder (pack choices by id, custom ones flagged, screened like typed text), the mock Builder honouring pack and
// custom parts, the words in every language, and no prices anywhere in the flow.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-setup-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { config } = await import('../../server/config.js');
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const games = await import('../../server/services/games.js');
const { loadChat } = await import('../../server/builder/chat.js');
const runner = await import('../../server/builder/runner.js');
const turns = await import('../../server/builder/turns.js');
const plan = await import('../../server/builder/plan.js');
const kit2 = await import('../../server/builder/kit2.js');
const art2d = await import('../../server/builder/art2d.js');
const art2dSvc = await import('../../server/services/art2d.js');
const catalog = await import('../../server/builder/kit2-catalog.js');
const { SYSTEM_PROMPT } = await import('../../server/builder/prompt.js');
const { historyToMessages } = await import('../../server/builder/claude.js');
const { tEn, tFor, CODES, flatten } = await import('../../server/i18n/index.js');
const { groupOf, CREATURE_GROUPS } = await import('../../scripts/build-kit2-rules.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });
function client() {
  let cookie = '';
  return async (p, { method = 'GET', body } = {}) => {
    const h = {}; if (cookie) h.cookie = cookie;
    if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = c.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, headers: res.headers, text, json };
  };
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return c; }
const kid = await signup('SetupKid');
const pack = id => ({ from: 'pack', id }), custom = text => ({ from: 'custom', text });
/** Make a game, send a plan as its first message and wait for the build. -> { id, status, body, chat, html, game }. */
async function build(c, body) {
  const g = await c('/api/studio/new', { method: 'POST', body: {} });
  const r = await c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, ...body } });
  await runner.idle(g.json.id);
  const game = games.getGame(g.json.id), v = game.current_version_id ? games.getVersion(game.current_version_id) : null;
  return { id: g.json.id, status: r.status, body: r.json, chat: loadChat(g.json.id).messages, html: v ? v.html : '', game };
}
const said = chat => chat.filter(m => m.role === 'assistant').map(m => m.text).join(' ');

// ---------------------------------------------------------------- the plan as data
test('a plan from a page: only known ids, typed text trimmed and flagged custom, blank means the Builder decides', () => {
  const p = plan.normalisePlan({
    type: pack('quiz'), look: '3d', world: custom('  inside   a volcano\u0000 '), extra: 'ignored',
    characters: [pack('knight'), pack('knight'), pack('dragon-king'), custom('a penguin chef'), custom('a second one'), { from: 'pack' }, null],
    learn: [{ id: 'math' }, { id: 'nope' }, { text: ' times tables ' }], notes: '  make it tricky  ',
  });
  assert.deepEqual(p, {
    v: 1, type: pack('quiz'), look: '3d', world: custom('inside a volcano'),
    characters: [pack('knight'), custom('a penguin chef')], learn: [{ id: 'math' }, { text: 'times tables' }], notes: 'make it tricky',
  });
  assert.deepEqual(plan.customParts(p), ['world', 'character']);
  assert.equal(plan.normalisePlan({ world: pack('atlantis') }), null, 'a world that has not shipped is not a choice');
  assert.equal(plan.normalisePlan({ type: custom('   ') }), null, '"Something else" left blank is no choice');
  for (const bad of [null, 'x', [], {}, { look: 'vr' }]) assert.equal(plan.normalisePlan(bad), null);
  assert.equal(plan.normalisePlan({ type: custom('x'.repeat(500)) }).type.text.length, plan.LIMITS.idea);
  assert.equal(plan.normalisePlan({ notes: 'n'.repeat(900) }).notes.length, plan.LIMITS.notes);
});

test('the engine a plan means: world + 3D is always a ready-made 3D world; 2D stays 2D; custom parts stay outside the packs', () => {
  const e = o => plan.planEngine(plan.normalisePlan(o));
  const cq = e({ look: '3d', world: pack('castle-quest'), characters: [pack('knight'), pack('fox'), pack('horse'), pack('mage'), pack('cow')] });
  assert.deepEqual({ engine: cq.engine, world: cq.world, hero: cq.hero, companion: cq.companion, more: cq.more, friends: cq.friends, missing: cq.missing },
    { engine: 'kit2', world: 'castle-quest', hero: 'knight', companion: 'fox', more: ['horse'], friends: ['mage'], missing: ['cow'] });
  // every game type in 3D with a pack world is a Kit 2 game in that world
  for (const t of plan.TYPE_IDS) for (const w of kit2.WORLD_IDS) { const x = e({ type: pack(t), look: '3d', world: pack(w) }); assert.equal(`${x.engine} ${x.world}`, `kit2 ${w}`); assert.ok(kit2.heroesOf(w).some(h => h.id === x.hero)); }
  // an animal that can be the hero plays when no hero is picked; one that cannot (a pig) comes along instead
  assert.equal(e({ look: '3d', world: pack('castle-quest'), characters: [pack('horse')] }).hero, 'horse');
  const pig = e({ look: '3d', world: pack('medieval-village'), characters: [pack('pig')] });
  assert.equal(pig.companion, 'pig'); assert.notEqual(pig.hero, 'pig');
  // no world picked: the world that has their characters
  assert.equal(e({ look: '3d', characters: [pack('cow')] }).world, 'medieval-village');
  assert.equal(e({ look: '3d' }).world, kit2.DEFAULT_WORLD);
  // 2D: a running or catching game draws the world's 2D art and every sprite picked: the first is the player, the
  // others are friends in the game; other kinds keep the classic look
  assert.deepEqual(e({ type: pack('runner'), look: '2d', world: pack('castle-quest'), characters: [pack('triceratops'), pack('knight'), pack('zebra')] }),
    { engine: '2d', template: 'runner', art: { world: 'castle-quest', sprite: 'triceratops', friends: ['knight', 'zebra'] }, extra: [], plain: false });
  const everyone = e({ type: pack('catch'), look: '2d', characters: plan.SETUP_CHARACTERS.filter(c => c.in2d).map(c => pack(c.id)) });
  assert.equal(plan.LIMITS.characters >= plan.SETUP_CHARACTERS.length + 1, true, 'as many as they like: everyone can be picked');
  assert.equal(everyone.art.friends.length, plan.SETUP_CHARACTERS.filter(c => c.in2d).length - 1);
  assert.deepEqual(e({ look: '2d', world: pack('wild-woods') }).art, { world: 'wild-woods', sprite: '', friends: [] }, 'no kind picked: a running game');
  assert.equal(e({ type: pack('adventure'), look: '2d', characters: [pack('fox')] }).template, 'runner');
  assert.deepEqual(e({ type: pack('catch'), look: 'auto', world: pack('toy-town'), characters: [pack('zebra')] }).art, { world: 'toy-town', sprite: 'zebra', friends: [] });
  const quiz = e({ type: pack('quiz'), look: '2d', world: pack('castle-quest'), characters: [pack('knight')] });
  assert.deepEqual([quiz.engine, quiz.art, quiz.plain], ['2d', null, true], 'a quiz does not draw worlds yet');
  assert.equal(e({ type: custom('a maze'), look: '2d', world: pack('castle-quest') }).plain, true);
  // an animal that is only a 2D sprite: 2D on "You pick for me", and missing (said honestly) when 3D was picked
  assert.equal(e({ look: 'auto', characters: [pack('zebra')] }).art.sprite, 'zebra');
  assert.deepEqual(e({ look: '3d', world: pack('castle-quest'), characters: [pack('zebra')] }).missing, ['zebra']);
  // the dinosaurs live in a 3D world since Dino Valley 1.0.0: one picked alone is the hero there (the apatosaurus, too
  // big to be the hero, comes along); in another world it is missing, said honestly
  const dv = e({ look: 'auto', characters: [pack('stegosaurus')] });
  assert.deepEqual([dv.engine, dv.world, dv.hero, dv.missing], ['kit2', 'dino-valley', 'stegosaurus', []]);
  const ap = e({ look: '3d', world: pack('dino-valley'), characters: [pack('apatosaurus')] });
  assert.deepEqual([ap.world, ap.hero, ap.companion, ap.missing], ['dino-valley', 'barbarian', 'apatosaurus', []]);
  assert.deepEqual(e({ look: '3d', world: pack('castle-quest'), characters: [pack('stegosaurus')] }).missing, ['stegosaurus']);
  // 2D, and kinds only made in 2D
  assert.equal(e({ look: '2d', world: pack('castle-quest'), characters: [pack('knight')] }).engine, '2d');
  assert.equal(e({ type: pack('memory'), look: 'auto', world: pack('castle-quest') }).engine, '2d');
  assert.equal(e({ type: pack('adventure'), look: 'auto', world: pack('castle-quest') }).engine, 'kit2');
  assert.equal(e({ type: pack('quiz') }).engine, '2d');
  // their own world
  assert.equal(e({ look: '3d', world: custom('a candy planet') }).engine, 'world3d');
  assert.equal(e({ look: 'auto', world: custom('a candy planet') }).engine, 'scratch');
  const own = e({ look: '3d', world: custom('a candy planet'), characters: [pack('knight')] });
  assert.equal(own.engine, 'kit2'); assert.equal(own.customWorld, true); assert.equal(own.hero, 'knight');
  assert.equal(e({ notes: 'surprise me' }).engine, 'open');
});

test('engineFor: the plan decides the engine, not the words; without a plan the words decide as before', () => {
  const p3 = plan.normalisePlan({ look: '3d', world: pack('toy-town'), characters: [pack('mage')] });
  const st = {};
  assert.deepEqual(plan.engineFor(st, p3, 'whatever the words say, even 2D cards', null), { world: 'toy-town', hero: 'mage', by: 'plan', changed: false, wantsCreature: false });
  assert.deepEqual(st.kit2, { world: 'toy-town', hero: 'mage' });
  // 2D with a world's name in the sentence stays off Kit 2 (the words alone would have picked the 3D world)
  const p2 = plan.normalisePlan({ look: '2d', world: pack('castle-quest') }), text = plan.planSentence(p2);
  assert.ok(kit2.wantsKit2({}, text, null), 'the words alone mean the 3D world');
  const st2 = { kit2: { world: 'castle-quest', hero: 'knight' } };
  assert.equal(plan.engineFor(st2, p2, text, null), null); assert.equal(st2.kit2, undefined);
  // the 2D art for a plan's build, as data for the 2D ART RULES and the template tool
  const st4 = {}, p4 = plan.normalisePlan({ type: pack('catch'), look: '2d', world: pack('pirate-cove'), characters: [pack('velociraptor'), pack('pug'), pack('mage')] });
  assert.equal(plan.engineFor(st4, p4, plan.planSentence(p4), null), null);
  assert.deepEqual(plan.art2dFor(st4, p4, null), { world: 'pirate-cove', hero: 'velociraptor', friends: ['pug', 'mage'], by: 'plan', missing: false, force2d: false, soft: false, changed: false });
  assert.deepEqual(st4.art2d, { world: 'pirate-cove', hero: 'velociraptor', friends: ['pug', 'mage'] });
  assert.match(art2d.art2dNote(plan.art2dFor({}, p4, null)), /Friends who are in the game too \(start_from_template friends, CONFIG\.friends2d\): pug, mage\./);
  assert.match(art2d.art2dNote(plan.art2dFor({}, p4, null)), /the 2D world pirate-cove \("Pirate Cove"\) and the sprite animal velociraptor/);
  assert.equal(plan.art2dFor({}, plan.normalisePlan({ type: pack('quiz'), look: '2d', world: pack('pirate-cove') }), null), null);
  assert.equal(plan.art2dFor({}, p3, null), null, 'a 3D plan has no 2D art');
  // their own 3D world: never a ready-made one, and the 3D rules are on
  const st3 = {}; assert.equal(plan.engineFor(st3, plan.normalisePlan({ look: '3d', world: custom('a castle made of cheese') }), 'a castle', null), null); assert.equal(st3.wants3d, true);
  assert.equal(plan.engineFor({}, null, 'Make it a 3D game in the Castle Quest world.', null).world, 'castle-quest');
});

test('what the model reads: pack choices by id (used as given), custom ones marked and built from scratch', () => {
  const p = plan.normalisePlan({ type: custom('a maze'), look: '3d', world: pack('castle-quest'), characters: [pack('knight'), pack('fox'), custom('a penguin chef')], learn: [{ id: 'math' }], notes: 'add a secret door' });
  const note = plan.planNote(p);
  assert.match(note, /^SETUP CHOICES/);
  assert.match(note, /Game type: CUSTOM "a maze"\. It is outside the packs/);
  assert.match(note, /World: PACK "castle-quest" \("Castle Quest"\)/);
  assert.match(note, /Character: PACK knight \(Knight\), a hero/); assert.match(note, /Character: PACK fox \(Fox\), an animal/);
  assert.match(note, /Character: CUSTOM "a penguin chef"\. Outside the packs: build it from scratch/);
  assert.match(note, /A PACK choice is used exactly as given, by its id/);
  assert.match(note, /A CUSTOM choice is OUTSIDE the builder packs.*Build only that part from scratch/);
  assert.match(note, /start_from_template "oomba3d" with world "castle-quest", hero "knight" and companion "fox"/);
  assert.match(note, /Do not ask the setup questions again/);
  assert.match(note, /Their note: "add a secret door"/);
  // no custom part: nothing is said about scratch work to do
  assert.doesNotMatch(plan.planNote(plan.normalisePlan({ type: pack('quiz'), look: '2d', world: pack('toy-town') })), /Tell the builder in one short, kind sentence which part/);
  // 2D keeps today's 2D build and carries the world along for later
  const flat = plan.planNote(plan.normalisePlan({ type: pack('quiz'), look: '2d', world: pack('toy-town'), characters: [pack('knight')] }));
  assert.match(flat, /Build it in 2D on the Oomba Kit, exactly as a 2D game is built today \(start_from_template "quiz"\)/);
  assert.match(flat, /keep the id "toy-town" in the game's tags/); assert.match(flat, /Only running and catching games draw the ready-made worlds and sprite characters in 2D so far/);
  const art = plan.planNote(plan.normalisePlan({ type: pack('runner'), look: '2d', world: pack('toy-town'), characters: [pack('triceratops'), pack('knight')] }));
  assert.match(art, /start_from_template "runner" with world "toy-town" and sprite "triceratops" and friends \["knight"\] \(the 2D ART RULES\)/);
  assert.match(art, /They picked 2 characters for a 2D game: triceratops \(Triceratops\) \(the first one picked\) is the player, and the others are friends who are IN the game too/);
  assert.match(art, /Keep every one of them in friends2d; they are never obstacles or enemies/); assert.doesNotMatch(art, /ONE sprite character/);
  assert.match(art2d.ART2D_RULES, /CONFIG\.friends2d is a list of more sprite heroes and animals/);
  assert.match(art, /Character: PACK triceratops \(Triceratops\), an animal of the 3D worlds dino-valley, and a 2D sprite\./); assert.match(art, /Character: PACK knight \(Knight\), a hero of the 3D worlds [a-z, -]+, and a 2D sprite\./);
  assert.match(plan.planNote(plan.normalisePlan({ look: '3d', world: custom('a candy planet') })), /start_from_template "world3d".*never start from "oomba3d"/);
  // the fixed rules know the block, and later turns keep one line of it
  assert.match(SYSTEM_PROMPT, /SETUP CHOICES block/); assert.match(SYSTEM_PROMPT, /CUSTOM choice \(their own words\) is outside the builder packs/);
  assert.match(kit2.KIT2_RULES, /the one exception: a character a SETUP CHOICES block marks CUSTOM/);
  const hist = historyToMessages([{ role: 'user', text: plan.planSentence(p), plan: p }, { role: 'assistant', text: 'Done!' }]);
  assert.match(hist[0].content, /\[Setup choices: type custom "a maze"; look 3D; world pack castle-quest; character pack knight; character pack fox; character custom "a penguin chef"\./);
  assert.equal(kit2.kit2Note({ world: 'castle-quest', hero: 'knight', by: 'plan' }).startsWith('KIT 2 CHOICE: In the setup steps the builder picked the 3D world castle-quest'), true);
});

// ---------------------------------------------------------------- who is in it: groups from the catalogue
test('"Who is in it?" is grouped from the catalogue; empty groups are "Coming soon" and light up by themselves', () => {
  assert.deepEqual(plan.CHARACTER_GROUPS, ['heroes', 'farm', 'wild', 'dinosaurs', 'sea']);
  const groups = plan.characterGroups(), by = Object.fromEntries(groups.map(g => [g.id, g]));
  // both catalogues: the 3D worlds' animals and the 2D sprites
  const in3d = g => g.items.filter(c => c.in3d).map(c => c.id).sort();
  assert.deepEqual(in3d(by.farm), ['cow', 'donkey', 'horse', 'husky', 'pig', 'sheep', 'shiba']);
  assert.deepEqual(in3d(by.wild), ['deer', 'fox', 'stag']);
  assert.deepEqual(by.farm.items.filter(c => !c.in3d).map(c => c.id).sort(), ['alpaca', 'bull', 'cow-spotted', 'horse-white', 'llama', 'pony', 'pug']);
  assert.deepEqual(by.wild.items.filter(c => !c.in3d).map(c => c.id).sort(), ['wolf', 'zebra']);
  assert.deepEqual(by.dinosaurs.items.map(c => c.id).sort(), ['apatosaurus', 'parasaurolophus', 'stegosaurus', 'triceratops', 'velociraptor']);
  // the five dinosaurs are 2D sprites and, since Dino Valley 1.0.0, animals of a 3D world too
  assert.ok(by.dinosaurs.items.every(c => c.in2d && c.in3d && c.worlds.length === 1 && c.worlds[0] === 'dino-valley'));
  assert.ok(!groups.flatMap(g => g.items).some(c => /rex|tyranno/i.test(c.id + c.name)), 'the T-Rex is in neither catalogue');
  assert.ok(by.heroes.items.length >= 9 && by.heroes.items.every(c => c.kind === 'hero' && c.in3d && c.in2d));
  assert.equal(groups.flatMap(g => g.items).length, new Set([...kit2.CHARACTER_IDS, ...art2d.ART2D_CHARACTER_IDS]).size, 'everyone of both catalogues, once');
  for (const c of art2d.ART2D_ANIMALS) assert.ok(groups.some(g => g.items.some(x => x.id === c.id && x.in2d)), `${c.id} is offered`);
  // "Coming soon" only where neither catalogue has anything; "Coming soon in 3D" where there are only 2D sprites (no
  // group today: the dinosaurs were, until Dino Valley shipped; the made-up lists below show both states)
  assert.deepEqual(groups.map(g => [g.id, g.soon, g.only2d]), [['heroes', false, false], ['farm', false, false], ['wild', false, false], ['dinosaurs', false, false], ['sea', false, false]]);
  const before = plan.characterGroups(plan.setupCharacters(kit2.KIT2_CHARACTERS.filter(c => c.group !== 'dinosaurs'), art2d.ART2D_CHARACTERS));
  assert.equal(before.find(g => g.id === 'dinosaurs').only2d, true, 'with no 3D dinosaur the group says "Coming soon in 3D"');
  // the sea lit up by itself with Under the Sea 1.0.0 (3D) and animals 1.1.0 (2D): every sea animal is in both
  assert.equal(by.sea.items.length, 23); assert.ok(by.sea.items.every(c => c.in3d && c.in2d && c.worlds.join() === 'under-the-sea'), 'the sea animals, in 3D and as sprites');
  assert.ok(by.sea.items.some(c => c.id === 'crab'), 'the crab walks, and is still a sea animal (kit2/creature-groups.json)');
  // every catalogue creature has a group the step lists (the generator writes it: kit2/creature-groups.json)
  for (const id of kit2.CREATURE_IDS) assert.ok(CREATURE_GROUPS.includes(catalog.KIT2_CREATURE_GROUP[id]) && kit2.characterById(id).group === catalog.KIT2_CREATURE_GROUP[id], `${id} has a group`);
  assert.deepEqual(Object.keys(catalog.KIT2_CREATURE_GROUP).sort(), [...kit2.CREATURE_IDS].sort());
  assert.equal(groupOf({ id: 'never-listed-shark', kind: 'water' }), 'sea');
  assert.equal(groupOf({ id: 'never-listed-lion', kind: 'land' }), 'wild');
  assert.equal(groupOf({ id: 'cow', kind: 'land', group: 'dinosaurs' }), 'dinosaurs', 'a manifest\'s own group wins');
  // a theme ships a dinosaur: the group is no longer "Coming soon", with nothing else to change
  // a theme ships a 3D dinosaur, a 2D pack ships a fish: the groups light up with nothing else to change
  const later = plan.characterGroups(plan.setupCharacters([...kit2.KIT2_CHARACTERS, { id: 'trex', name: 'T. rex', kind: 'creature', group: 'dinosaurs', worlds: ['wild-woods'] }], [...art2d.ART2D_CHARACTERS, { id: 'clownfish', name: 'Clownfish', kind: 'animal', group: 'sea' }]));
  assert.deepEqual([later.find(g => g.id === 'dinosaurs').only2d, later.find(g => g.id === 'sea').soon, later.find(g => g.id === 'sea').only2d], [false, false, false]);
  // and a group nothing has shipped for is still "Coming soon": the sea was, until its world shipped
  const noSea = plan.characterGroups(plan.setupCharacters(kit2.KIT2_CHARACTERS.filter(c => c.group !== 'sea'), art2d.ART2D_CHARACTERS.filter(c => c.group !== 'sea')));
  assert.deepEqual([noSea.find(g => g.id === 'sea').soon, noSea.find(g => g.id === 'sea').items.length], [true, 0]);
});

// ---------------------------------------------------------------- the page
test('/build/new: the start, six steps, every live world with a Preview, groups, and no way to it without an account', async () => {
  const anon = client(); const a = await anon('/build/new');
  assert.equal(a.status, 302);
  const b = await kid('/build');
  assert.match(b.text, /<a class="btn btn-primary btn-big" href="\/build\/new" id="newgame">/, '"New game" opens the setup steps');
  const r = await kid('/build/new'); assert.equal(r.status, 200);
  const h = r.text;
  assert.match(h, /id="su-guide"[^>]*><span class="su-way-t">Help me choose</, 'help me choose');
  assert.match(h, /id="su-direct"[^>]*><span class="su-way-t">I know what I want</, 'the bypass');
  assert.match(h, /id="su-skipall" hidden>Skip to the Builder</);
  assert.deepEqual([...h.matchAll(/data-screen="([\w-]+)"/g)].map(m => m[1]), ['start', 'type', 'look', 'world', 'chars', 'learn', 'extras', 'plan']);
  for (const q of ['What kind of game?', '2D or 3D?', 'Where does it happen?', 'Who is in it?', 'What should it teach?', 'Anything to add?', 'Here is your game plan']) assert.ok(h.includes(q), q);
  assert.equal((h.match(/data-go="back"/g) || []).length, 7); assert.equal((h.match(/data-go="skip"/g) || []).length, 6); assert.equal((h.match(/data-go="next"/g) || []).length, 6);
  assert.match(h, /Step 1 of 6/); assert.match(h, /Step 6 of 6/);
  // twelve live worlds (Wild Woods, Dino Valley and Under the Sea too), each with its real cover and a Preview button; every preview picture exists, large
  assert.equal(kit2.KIT2_WORLDS.length, 12);
  for (const w of kit2.KIT2_WORLDS) {
    assert.ok(h.includes(`src="/vendor/themes/${w.id}/${w.version}/cover.webp"`), `${w.id} cover`);
    assert.ok(h.includes(`data-preview="${w.id}"`), `${w.id} preview button`);
    const f = fs.readFileSync(path.join(ROOT, 'public/img/kit2/worlds', `${w.id}-preview.webp`));
    assert.equal(f.toString('latin1', 8, 12), 'WEBP'); assert.ok(f.length > 15000, `${w.id} preview is a real picture`);
  }
  assert.ok(h.includes('data-preview="wild-woods"') && h.includes('aria-label="Preview Wild Woods"'));
  // "Something else" on every choice step except 2D or 3D, with the honest note where it leaves the packs
  for (const k of ['type', 'world', 'chars', 'learn']) assert.ok(h.includes(`data-step="${k}" data-id="else"`) && h.includes(`id="su-idea-${k}"`), k);
  assert.ok(!h.includes('data-step="look" data-id="else"'));
  assert.equal((h.match(/This is not in our packs, so the Builder will make it from scratch\. It may look simpler\./g) || []).length, 3);
  assert.ok(!h.includes('id="su-note-learn"'));
  // heroes and animals with their pictures, in groups; empty groups listed, marked and without a single card
  for (const c of kit2.KIT2_CHARACTERS) assert.ok(h.includes(`data-step="chars" data-id="${c.id}"`) && h.includes(`src="/img/kit2/heroes/${c.id}.webp"`), c.id);
  for (const c of plan.SETUP_CHARACTERS.filter(x => !x.in3d)) {   // only a 2D sprite so far: the 2D picker's own picture
    assert.ok(h.includes(`data-step="chars" data-id="${c.id}"`) && h.includes(`src="/img/art2d/animals/${c.id}.webp"`), c.id);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/img/art2d/animals', `${c.id}.webp`)), `${c.id} picture`);
  }
  assert.equal((h.match(/data-step="chars" data-id="(?!else)/g) || []).length, plan.SETUP_CHARACTERS.length);
  const group = id => (new RegExp(`<section class="su-group[^"]*" data-group="${id}"[\\s\\S]*?</section>`).exec(h) || [''])[0];
  for (const [id, name] of [['heroes', 'Heroes'], ['farm', 'Farm animals'], ['wild', 'Zoo and wild animals'], ['dinosaurs', 'Dinosaurs'], ['sea', 'Fish and sea animals']]) assert.ok(group(id).includes(name), name);
  // the sea animals shipped with Under the Sea 1.0.0: the group is live, with its animals to pick
  assert.doesNotMatch(group('sea'), /Coming soon/); assert.ok(group('sea').includes('data-id="dolphin"') && group('sea').includes('data-id="crab"') && group('sea').includes('su-pick'), 'sea animals can be picked');
  assert.doesNotMatch(group('dinosaurs'), /Coming soon/); assert.ok(group('dinosaurs').includes('data-id="triceratops"') && group('dinosaurs').includes('data-id="velociraptor"'));
  assert.ok(h.includes('data-preview="dino-valley"') && h.includes('aria-label="Preview Dino Valley"'));
  assert.doesNotMatch(h, /t-?rex|tyrannosaur/i);
  assert.ok(group('farm').includes('data-id="cow"') && group('farm').includes('data-id="llama"') && !/Coming soon/.test(group('farm')) && group('wild').includes('data-id="fox"') && group('wild').includes('data-id="zebra"'));
  assert.equal((h.match(/Only running and catching games can use our worlds and characters in 2D so far/g) || []).length, 3, 'the honest 2D note: world, characters and plan');
  // "Select all" on every multi-select section: each group that has members, and what it teaches (one list, one button)
  const alls = [...h.matchAll(/<button type="button" class="btn btn-sm su-all" data-all="([^"]+)" data-name="([^"]+)" aria-pressed="false" hidden>Select all<\/button>/g)].map(m => m[1]);
  assert.deepEqual(alls, [...plan.characterGroups().filter(g => !g.soon).map(g => `chars:${g.id}`), 'learn']);
  for (const g of plan.characterGroups()) assert.equal(group(g.id).includes('su-all'), !g.soon, `${g.id}: a button only where there is something to pick`);
  assert.ok(!/data-all="(type|look|world)"/.test(h), 'never on a pick-one step');
  // a file: worksheets and notes only (the Studio's own upload does the rest); no picture types here
  const accept = (/id="su-file"[^>]*accept="([^"]+)"/.exec(h) || [])[1] || '';
  assert.ok(accept.includes('application/pdf') && !/image|png|jpe?g/.test(accept));
  // real controls: buttons with a pressed state, labelled text boxes
  assert.ok(!/<div[^>]*onclick/.test(h)); assert.match(h, /<label for="su-idea-world">Tell us your idea<\/label>/); assert.match(h, /<label for="su-notes">/);
  // nothing here talks to the voice service
  assert.ok(!h.includes('/js/tts.js')); assert.ok(!/tts/.test(fs.readFileSync(path.join(ROOT, 'public/js/buildsetup.js'), 'utf8')));
});

test('the bypass and an old game are as before: an empty game with nothing sent, and the Studio for a game in progress', async () => {
  const g = await kid('/api/studio/new', { method: 'POST', body: {} });
  assert.equal(g.status, 200); assert.match(g.json.url, /^\/studio\//);
  assert.deepEqual(loadChat(g.json.id).messages, []); assert.equal(turns.lastEnded(g.json.id), null);
  const s = await kid(g.json.url); assert.equal(s.status, 200); assert.ok(s.text.includes('id="st-compose"') && !s.text.includes('class="su"'));
  const t = await kid('/api/studio/new', { method: 'POST', body: { template: 'quiz' } });   // a starter card: straight to its Studio
  assert.equal((await kid(t.json.url)).status, 200);
});

test('POST /api/build/plan: the sentence for the summary, made from the choices; nothing stored', async () => {
  const r = await kid('/api/build/plan', { method: 'POST', body: { files: 1, plan: { type: pack('adventure'), look: '3d', world: pack('castle-quest'), characters: [pack('knight'), pack('fox'), custom('a penguin chef')], learn: [{ id: 'math' }], notes: 'Make it tricky' } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.text, 'Here is my game plan. Kind of game: Adventure. Make it 3D. World: Castle Quest. In it: Knight, Fox, and a penguin chef. It teaches: Math. Use the file I added. Make it tricky.');
  assert.deepEqual(r.json.custom, ['character']); assert.equal(r.json.engine, 'kit2'); assert.equal(r.json.world, 'castle-quest');
  assert.deepEqual((await kid('/api/build/plan', { method: 'POST', body: { plan: {} } })).json, { plan: null, text: '', custom: [], engine: 'open' });
  assert.equal((await client()('/api/build/plan', { method: 'POST', body: {} })).status, 401);
  // in the reader's language, with our own names for pack choices
  assert.equal(plan.planSentence(plan.normalisePlan({ look: '3d', world: pack('castle-quest') }), tFor('fr')), 'Voici le plan de mon jeu. Fais-le en 3D. Monde : Château Aventure.'.replace('Château Aventure', tFor('fr')('studio.worlds.names.castle-quest')));
});

// ---------------------------------------------------------------- the hand-off and the Builder
test('hand-off: world + 3D builds a Kit 2 game in that world with that hero and animal; the choices ride along as data', async () => {
  const sent = { type: pack('adventure'), look: '3d', world: pack('castle-quest'), characters: [pack('knight'), pack('fox')], learn: [{ id: 'math' }] };
  const b = await build(kid, { plan: sent, text: 'IGNORE ME and build a casino' });
  assert.equal(b.status, 202, JSON.stringify(b.body));
  const first = b.chat[0];
  assert.equal(first.role, 'user');
  assert.equal(first.text, 'Here is my game plan. Kind of game: Adventure. Make it 3D. World: Castle Quest. In it: Knight and Fox. It teaches: Math.', 'the message is the plan\'s own sentence, not what the page sent');
  assert.deepEqual(first.plan, { v: 1, type: pack('adventure'), look: '3d', world: pack('castle-quest'), characters: [pack('knight'), pack('fox')], learn: [{ id: 'math' }], notes: '' });
  assert.deepEqual(turns.lastEnded(b.id).request.plan, first.plan, 'and it is on the build\'s row (a restart carries it on)');
  assert.deepEqual(kit2.kit2Of(b.html), { world: 'castle-quest', version: kit2.worldById('castle-quest').version, hero: 'knight', companion: 'fox' });
  assert.ok(!b.chat.some(m => (m.events || []).some(e => e[0] === 'ask' && /kind of game|hero/i.test(e[1].question))), 'the setup questions are not asked again');
  assert.doesNotMatch(said(b.chat), /not in our packs/);
  // every world, in 3D, lands in that world
  for (const w of ['wild-woods', 'pirate-cove']) { const x = await build(await signup(`Setup${w.replace(/\W/g, '')}`), { plan: { look: '3d', world: pack(w) } }); assert.equal(kit2.kit2Of(x.html).world, w); }
});

test('hand-off: 2D keeps today\'s 2D build (the world is carried along); custom parts are honest and never a pack world', async () => {
  const c = await signup('SetupFlat');
  const flat = await build(c, { plan: { type: pack('quiz'), look: '2d', world: pack('castle-quest'), characters: [pack('knight')], learn: [{ id: 'math' }] } });
  assert.equal(flat.status, 202); assert.equal(kit2.isKit2Game(flat.html), false, '2D is not a Kit 2 game, whatever the world');
  assert.ok(/oomba-kit/.test(flat.html) && flat.game.tags.split(',').includes('quiz'), 'the quiz starter on the Oomba Kit');
  assert.equal(flat.chat[0].plan.world.id, 'castle-quest', 'the chosen world is passed along');
  assert.match(said(flat.chat), /Only running and catching games draw our worlds and characters in 2D so far/);
  // a 2D running game: the world's 2D art and the sprite animal (a dinosaur), by the Builder's own 2D templates
  const run = await build(await signup('SetupRun'), { plan: { type: pack('runner'), look: '2d', world: pack('castle-quest'), characters: [pack('triceratops'), pack('knight')] } });
  assert.equal(kit2.isKit2Game(run.html), false); assert.equal(art2d.isArt2dGame(run.html), true);
  assert.deepEqual([art2d.art2dOf(run.html).world, art2d.art2dOf(run.html).hero], ['castle-quest', 'triceratops']);
  assert.match(said(run.chat), /It is set in Castle Quest, and the triceratops is your hero/); assert.match(said(run.chat), /The knight is in the game too, along the way/);
  assert.match(run.html, /\n  friends2d: \['knight'\],\n/); assert.ok(run.html.includes(art2dSvc.art2dPackTag('heroes')) && run.html.includes(art2dSvc.art2dPackTag('animals')) && run.html.includes(art2dSvc.oomba2dTag('1.1.0')));
  // many: every pick is in the game (the first is the player), and a version that names them passes the safety scan
  const many = await build(await signup('SetupMany'), { plan: { type: pack('catch'), look: '2d', world: pack('pirate-cove'), characters: ['pug', 'zebra', 'knight', 'cow', 'stegosaurus', 'pig', 'fox'].map(pack) } });
  assert.match(many.html, /\n  hero2d: 'pug',\n  friends2d: \['zebra', 'knight', 'cow', 'stegosaurus', 'pig', 'fox'\],\n/);
  assert.match(said(many.chat), /6 friends are in the game too, watching from the sides \(a few at a time, taking turns\)/);
  assert.equal(games.getVersion(many.game.current_version_id).safety_status, 'pass');
  const cat = await build(await signup('SetupCatch'), { plan: { type: pack('catch'), look: '2d', world: pack('wild-woods'), characters: [pack('zebra')] } });
  assert.deepEqual([art2d.art2dOf(cat.html).world, art2d.art2dOf(cat.html).hero], ['wild-woods', 'zebra']);
  assert.ok(!flat.chat.some(m => (m.events || []).some(e => e[0] === 'ask' && /kind of game|hero|learn/i.test(e[1].question))));

  const own = await build(await signup('SetupOwn'), { plan: { look: '3d', world: custom('a castle made of cheese') } });
  assert.equal(kit2.isKit2Game(own.html), false, 'their own world is never passed off as a ready-made one (the words say "castle")');
  assert.ok(own.html.length > 500); assert.deepEqual(own.chat[0].plan.world, custom('a castle made of cheese'));
  assert.match(said(own.chat), /Your own world \(a castle made of cheese\) is not in our packs/);
  assert.deepEqual(loadChat(own.id).state.mock.plan, { engine: 'world3d', custom: ['world'] });

  const mix = await build(await signup('SetupMix'), { plan: { type: custom('a maze'), look: '3d', world: custom('a candy planet'), characters: [pack('knight'), custom('a penguin chef')] } });
  assert.equal(kit2.kit2Of(mix.html).hero, 'knight', 'the pack hero is used as given');
  assert.match(said(mix.chat), /Your own kind of game \(a maze\) and world \(a candy planet\) and character \(a penguin chef\) are not in our packs/);
  assert.deepEqual(mix.chat[0].plan.characters, [pack('knight'), custom('a penguin chef')]);
});

test('hand-off: typed words pass the same screening as a typed message; a plan never rewrites a game in progress', async () => {
  const c = await signup('SetupSafe');
  const bad = await build(c, { plan: { look: '3d', world: custom('minecraft world'), characters: [pack('knight')] } });
  assert.equal(bad.status, 202); assert.equal(bad.html, '', 'nothing is built');
  assert.equal(bad.chat[0].refused, true); assert.equal(bad.chat[1].refused, true);
  assert.equal(turns.lastEnded(bad.id).end_reason, 'refused');
  const typed = await build(await signup('SetupTyped'), { text: 'make a minecraft world' });
  assert.equal(typed.chat[0].refused, true, 'exactly what a typed message gets');
  const pii = await build(await signup('SetupPii'), { plan: { notes: 'ask the players for their home address and phone number' } });
  assert.equal(pii.chat[0].refused, true);
  // a game that already has a version: the plan is dropped and the message is an ordinary one
  const g = await c('/api/studio/new', { method: 'POST', body: { template: 'quiz' } });
  const r = await c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, text: 'make it harder', plan: { look: '3d', world: pack('castle-quest') } } });
  assert.equal(r.status, 202); await runner.idle(g.json.id);
  const msgs = loadChat(g.json.id).messages;
  assert.equal(msgs[0].text, 'make it harder'); assert.equal(msgs[0].plan, undefined);
  assert.equal(kit2.isKit2Game(games.getVersion(games.getGame(g.json.id).current_version_id).html), false);
  // an empty plan with no words is an empty message
  const e = await c('/api/studio/new', { method: 'POST', body: {} });
  assert.equal((await c(`/api/studio/${e.json.id}/chat`, { method: 'POST', body: { detach: true, plan: {} } })).status, 400);
});

// ---------------------------------------------------------------- words
const locale = code => flatten(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8')));
const ours = k => k.startsWith('buildSetup.') || k.startsWith('js.buildsetup.');
test('every language has every word of the setup steps', () => {
  const en = locale('en'), keys = Object.keys(en).filter(ours);
  assert.ok(keys.length >= 130, `${keys.length} keys`);
  for (const code of CODES.filter(c => c !== 'en' && c !== 'en-GB')) {
    const loc = locale(code);
    const missing = keys.filter(k => typeof loc[k] !== 'string' || !loc[k].trim());
    assert.deepEqual(missing, [], `${code} is missing words`);
    const same = keys.filter(k => loc[k] === en[k]);
    assert.ok(same.length <= 6, `${code}: ${same.length} strings are still English (${same.slice(0, 8).join(', ')})`);
    for (const k of ['buildSetup.say.look3d', 'buildSetup.steps.look.title', 'buildSetup.looks.3d.title']) assert.ok(loc[k].includes('3D'), `${code} ${k} keeps "3D"`);
    assert.ok(loc['buildSetup.say.look2d'].includes('2D'));
    assert.equal(tFor(code)('buildSetup.progress', { n: 2, total: 6 }).includes('6'), true);
  }
  assert.equal(locale('en-GB')['buildSetup.learn.math.title'], 'Maths');
  // every world, game type and group the page can show has its words (a new world needs a line before it ships)
  for (const w of kit2.WORLD_IDS) assert.ok(en[`buildSetup.worlds.${w}`], `a line about ${w}`);
  for (const t of plan.TYPE_IDS) assert.ok(en[`buildSetup.types.${t}.title`] && en[`buildSetup.types.${t}.text`], t);
  for (const g of plan.CHARACTER_GROUPS) assert.ok(en[`buildSetup.groups.${g}`], g);
  for (const l of plan.LEARN) assert.ok(en[`buildSetup.learn.${l}.title`], l);
  assert.equal(tEn('buildSetup.else.packNote'), 'This is not in our packs, so the Builder will make it from scratch. It may look simpler.');
});

test('no prices, plan names or emoji anywhere in the setup steps, in any language', async () => {
  const MONEY = /[$€£¥₪₽]|\b(price|prices|pricing|paid|pay|buy|cost|costs|free trial|upgrade|subscribe|subscription|premium|spark pack|family plan|teacher plan|pro quality|per month|a month)\b|\/plans/i;
  const EMOJI = /\p{Extended_Pictographic}/u;
  for (const code of CODES) {
    for (const [k, v] of Object.entries(locale(code)).filter(([k]) => ours(k))) { assert.doesNotMatch(v, MONEY, `${code} ${k}`); assert.doesNotMatch(v, EMOJI, `${code} ${k}`); }
  }
  const h = (await kid('/build/new')).text, flow = h.slice(h.indexOf('<div class="su"'), h.indexOf('id="page-data"'));
  assert.ok(flow.length > 5000);
  assert.doesNotMatch(flow.replace(/<[^>]+>/g, ' '), MONEY); assert.doesNotMatch(flow, EMOJI); assert.ok(!flow.includes('/plans'));
  for (const f of ['public/js/buildsetup.js', 'public/css/build-setup.css']) assert.ok(!/\/plans|upsell|spark/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/--spark[\w-]*/g, '')), f);
});
