// A 2D game from the setup steps (/build/new) keeps the characters that were picked, whatever the model does.
// The bug: 2D, "Select all" on the Sea section (23 sea animals), and the built game showed the kit's own characters.
// The plan reached the server and named every animal (plan.js), but nothing held the model to it: it could write its
// own game, start from a template that does not draw the 2D art, or edit CONFIG.hero2d / friends2d away. Now the plan's
// 2D art is applied by the server (tools.js): start_from_template starts with exactly the plan's world and characters,
// and no version of that build is saved without them.
// Run against the real Claude provider with a local fake Messages API (as builder-claude.test.js does): the "model"
// here is a script that ignores the plan in each way it could.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-plan-art2d-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = []; const script = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const b = JSON.parse(body || '{}'); requests.push({ url: req.url, body: b });
    if (!b.stream) {   // the screening and review calls: everything here is allowed
      const sys = JSON.stringify(b.system || '');
      const text = sys.includes('You review games') ? '{"verdict":"approve","reasons":[]}' : sys.includes('You check pictures') ? '{"verdict":"allow","reason":"a drawing"}' : JSON.stringify({ verdict: 'allow', category: 'none' });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
    }
    const blocks = script.shift() || [{ type: 'text', text: 'Done.' }];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const out = [], ev = (name, data) => out.push(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: blk.text } }); }
      else { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${requests.length}`, name: blk.name, input: {} } }); const j = JSON.stringify(blk.input); for (let k = 0; k < j.length; k += 500) ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: j.slice(k, k + 500) } }); }
      ev('content_block_stop', { index: i });
    });
    ev('message_delta', { delta: { stop_reason: blocks.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } });
    ev('message_stop', {});
    res.end(out.join(''));
  });
});
await new Promise(r => fake.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());

const { config } = await import('../../server/config.js');
config.arcade = true;   // the arcade Builder (the kit, Kit 2, the 2D art); the classroom focus (ARCADE off): builder-focus.test.js
config.builderFullForAll = false; config.anthropicKey = 'sk-ant-test-fake';
config.snapshotsOff = true;   // no automatic playtest here: the rounds are the script's
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const runner = await import('../../server/builder/runner.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { tEn } = await import('../../server/i18n/index.js');
const P = await import('../../server/builder/plan.js');
const A = await import('../../server/builder/art2d.js');
const S = await import('../../server/services/art2d.js');
const T = await import('../../server/builder/templates/index.js');
const { toolbox } = await import('../../server/builder/tools.js');

// "Select all" on the Sea section of "Who is in it?" with 2D picked: every sea animal, in the order of the section.
const SEA = P.characterGroups().find(g => g.id === 'sea').items.map(c => c.id);
const seaPlan = (extra = {}) => ({ look: '2d', characters: SEA.map(id => ({ from: 'pack', id })), ...extra });
const cur = id => games.getVersion(games.getGame(id).current_version_id);
const PACK = () => `<script src="/vendor/art2d/animals/${S.ART2D_PACKS.animals}/pack.js"`;
let n = 0;
/** A plan's first build on the real Claude provider with this script; -> { game, results (each tool result), calls }. */
async function build(plan, steps) {
  const u = auth.createUser({ username: `SeaKid${'BCDFGHJKLMNP'[n++]}`, password: 'secret1' }), g = games.createGame(u.id, {});
  const from = requests.length; script.length = 0; script.push(...steps);
  const r = await runner.submit({ user: u, game: games.getGame(g.id), text: '', plan, t: tEn, provider: 'claude' });
  assert.ok(r.job, JSON.stringify(r.body || r));
  await runner.idle(r.job);
  const calls = requests.slice(from).filter(x => x.body.stream).map(x => x.body);
  // what each tool call got back, in order (the next round's last user message)
  const results = calls.slice(1).flatMap(c => c.messages.at(-1).content.filter(x => x.type === 'tool_result').map(x => (typeof x.content === 'string' ? x.content : JSON.stringify(x.content))));
  return { game: games.getGame(g.id), id: g.id, results, calls };
}
const cast = html => A.art2dCast(html);

test('the sea section has 23 animals, every one a sprite of the animals pack the 2D build loads', () => {
  assert.equal(SEA.length, 23);
  for (const id of SEA) { const c = A.art2dCharacter(id); assert.ok(c, id); assert.equal(c.pack, 'animals'); assert.ok(S.art2dManifest('animals').sprites[id], `${id} is in animals ${S.ART2D_PACKS.animals}`); }
  assert.equal(S.ART2D_PACKS.animals, '1.1.0', 'the sea animals are only in animals 1.1.0');
  assert.ok(!S.art2dManifest('animals', '1.0.0').sprites.dolphin, 'animals 1.0.0 is the land animals only');
  const plan = P.normalisePlan(seaPlan());
  assert.equal(plan.characters.length, 23, 'Select all on the Sea section is within the plan\'s limits');
  assert.deepEqual(P.planArt2d(plan), { template: 'runner', world: '', hero: 'dolphin', friends: SEA.slice(1) });
  for (const type of [null, 'runner', 'catch', 'adventure']) assert.ok(P.planArt2d(P.normalisePlan(seaPlan(type ? { type: { from: 'pack', id: type } } : {}))), `game type ${type}: the 2D art`);
  assert.equal(P.planArt2d(P.normalisePlan(seaPlan({ type: { from: 'pack', id: 'quiz' } }))), null, 'a quiz does not draw them (the plan says so)');
  assert.equal(P.planArt2d(P.normalisePlan({ ...seaPlan(), look: '3d' })), null, '3D is Kit 2');
});

test('the plan as the model gets it: start the runner with the dolphin and 22 friends, and the server keeps them', () => {
  const plan = P.normalisePlan(seaPlan()), note = P.planNote(plan), a2 = P.art2dFor({}, plan, null);
  assert.match(note, /Game type: not chosen: a running game \("runner"\) or a catching game \("catch"\)/);
  assert.match(note, /start_from_template "runner" with sprite "dolphin" and friends \["turtle",.*"crab"\]/);
  assert.match(note, /never write it from scratch with write_game, and never use the kit's own characters/);
  const a2note = A.art2dNote(a2);
  assert.match(a2note, /MUST be a running or catching game/);
  assert.ok(a2note.includes(`friends ${JSON.stringify(SEA.slice(1))}`), 'the friends are in the instruction itself');
});

test('all 23 sea animals through the real start_from_template: CONFIG.hero2d, CONFIG.friends2d and the animals 1.1.0 tag', async () => {
  const { game, id, results } = await build(seaPlan(), [
    [{ type: 'text', text: 'A dolphin dash!' }, { type: 'tool_use', name: 'start_from_template', input: { template: 'runner', sprite: 'dolphin', friends: SEA.slice(1), notes: 'A sea run' } }],
  ]);
  assert.match(results[0], /^Saved as version 1/);
  const html = cur(id).html, c = cast(html);
  assert.equal(c.hero, 'dolphin'); assert.deepEqual(c.friends, SEA.slice(1));
  assert.ok(html.includes("\n  hero2d: 'dolphin',\n") && html.includes(`\n  friends2d: [${SEA.slice(1).map(x => `'${x}'`).join(', ')}],\n`));
  assert.ok(html.includes(S.oomba2dTag()) && html.includes(S.art2dPackTag('animals')) && html.includes(PACK()));
  assert.ok(!/\/vendor\/art2d\/animals\/1\.0\.0\//.test(html), 'never the land-only pack');
  assert.deepEqual(A.art2dMissing(html, P.planArt2d(P.normalisePlan(seaPlan()))), []);
  assert.equal(cur(id).safety_status, 'pass');
  assert.equal(loadChat(id).messages[0].plan.characters.length, 23);
  assert.ok(game.current_version_id);
});

test('the model leaves the friends out, or picks another sea animal to play: every picked animal is still in', async () => {
  const { id, results } = await build(seaPlan(), [
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'catch', sprite: 'clownfish', friends: [], notes: 'Catch' } }],
  ]);
  assert.match(results[0], /^Saved as version 1/);
  const c = cast(cur(id).html);
  assert.equal(c.hero, 'clownfish', 'one of the picked animals may be the player');
  assert.deepEqual([c.hero, ...c.friends].sort(), [...SEA].sort(), 'and all the others are friends');
  // a sprite that was not picked is not the player: the plan's first pick is
  const r2 = await build(seaPlan(), [[{ type: 'tool_use', name: 'start_from_template', input: { template: 'runner', sprite: 'fox', notes: 'Run' } }]]);
  const c2 = cast(cur(r2.id).html);
  assert.equal(c2.hero, 'dolphin'); assert.equal(c2.friends.length, 22); assert.ok(!c2.friends.includes('fox'));
});

test('the model ignores the plan: its own game, a template without the art, or an edit that drops them is not saved', async () => {
  const kitOnly = T.loadTemplate('runner', {});   // the runner with the kit's own characters (no 2D art)
  const { id, results } = await build(seaPlan(), [
    [{ type: 'text', text: 'An underwater game!' }, { type: 'tool_use', name: 'write_game', input: { html: kitOnly, notes: 'My own sea game' } }],
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'memory', notes: 'Sea memory' } }],
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'runner', notes: 'A sea run' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: "  hero2d: 'dolphin',", replace: "  hero2d: ''," }, { find: /  friends2d: \[[^\]]*\],/.exec(T.loadTemplate('runner', { hero: 'dolphin', friends: SEA.slice(1) }))[0], replace: '  friends2d: [],' }], notes: 'The kit hero' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: "title: 'Zippy Dash'", replace: "title: 'Reef Dash'" }], notes: 'A name' } }],
  ]);
  assert.match(results[0], /^Not saved: the builder picked these characters for their 2D game \(dolphin, turtle, .*crab\).*does not draw with the 2D art at all.*Call start_from_template with template "runner" or "catch", sprite "dolphin" and friends \["turtle"/);
  assert.match(results[1], /^Not started: .*only "runner" and "catch" draw them/);
  assert.match(results[2], /^Saved as version 1.*with the sprite dolphin as the hero and 22 friends/, 'start_from_template with nothing named: the plan fills it in');
  assert.match(results[3], /^Not saved: .*these picked characters are not in CONFIG.hero2d or CONFIG.friends2d: dolphin, turtle,.*Keep the CONFIG lines world, hero2d and friends2d/);
  assert.match(results[4], /^Saved as version 2/, 'other edits are fine');
  const v = cur(id), c = cast(v.html);
  assert.equal(v.number, 2);
  assert.match(v.html, /title: 'Reef Dash'/);
  assert.equal(c.hero, 'dolphin'); assert.deepEqual(c.friends, SEA.slice(1));
  assert.equal(games.listVersions(id).length, 2, 'nothing without the animals was ever saved');
});

test('the model writes the whole game itself but keeps the art: saved (the check is what is drawn, not how it was made)', async () => {
  const html = T.loadTemplate('runner', { hero: 'dolphin', friends: SEA.slice(1) }).replace("title: 'Zippy Dash'", "title: 'Ocean Run'");
  const { id, results } = await build(seaPlan(), [[{ type: 'tool_use', name: 'write_game', input: { html, notes: 'Ocean Run' } }]]);
  assert.match(results[0], /^Saved as version 1/);
  assert.equal(cast(cur(id).html).friends.length, 22);
  // missing the animals pack tag: refused, named
  const { results: r2 } = await build(seaPlan(), [[{ type: 'tool_use', name: 'write_game', input: { html: html.replace(/<script src="\/vendor\/art2d\/animals\/[^\n]*\n/, ''), notes: 'x' } }]]);
  assert.match(r2[0], /^Not saved: .*the pack tag of animals is missing/);
});

test('a world picked with the animals is kept too; a build with no plan, and a 3D plan, are not held to any 2D art', async () => {
  const plan = seaPlan({ world: { from: 'pack', id: 'pirate-cove' }, type: { from: 'pack', id: 'runner' } });
  const { id, results } = await build(plan, [[{ type: 'tool_use', name: 'start_from_template', input: { template: 'runner', world: 'castle-quest', notes: 'x' } }]]);
  assert.match(results[0], /^Saved as version 1/);
  assert.equal(cast(cur(id).html).world, 'pirate-cove', 'the world they picked, not another');
  // no plan: the tools are as they always were (a typed message may write any game)
  const u = auth.createUser({ username: 'SeaKidNoPlan', password: 'secret1' }), g = games.createGame(u.id, {});
  const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state: {} });
  assert.match(tb.exec('write_game', { html: T.loadTemplate('runner', {}), notes: 'x' }).forModel, /^Saved as version 1/);
  // a 3D plan with the same animals: Kit 2, nothing 2D to keep
  const g3 = games.createGame(u.id, {}), tb3 = toolbox({ user: u, gameId: g3.id, emit: () => {}, state: {}, plan: P.normalisePlan({ ...seaPlan(), look: '3d' }) });
  assert.match(tb3.exec('write_game', { html: T.loadTemplate('runner', {}), notes: 'x' }).forModel, /^Saved as version 1/);
});

test('the model refuses every time: the server starts the game itself with all 23 animals, and says so in one line', async () => {
  const kitOnly = T.loadTemplate('runner', {});
  const { id, results } = await build(seaPlan(), [
    [{ type: 'text', text: 'I will make my own sea game. ' }, { type: 'tool_use', name: 'write_game', input: { html: kitOnly, notes: 'Mine' } }],
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'quiz', notes: 'A quiz' } }],
    [{ type: 'tool_use', name: 'write_game', input: { html: kitOnly, notes: 'Mine again' } }],
    [{ type: 'text', text: 'Sorry, I could not build it.' }],
  ]);
  assert.equal(results.length, 3); assert.ok(results.every(r => /^Not (saved|started)/.test(r)), 'every attempt of the model was refused');
  assert.equal(games.listVersions(id).length, 1, 'one version: the server\'s own');
  const v = cur(id), c = cast(v.html);
  assert.equal(c.hero, 'dolphin'); assert.deepEqual(c.friends, SEA.slice(1));
  assert.ok(v.html.includes(S.art2dPackTag('animals')) && v.html.includes(S.oomba2dTag()));
  assert.equal(v.safety_status, 'pass'); assert.equal(v.notes, 'Started with the characters you picked');
  const reply = loadChat(id).messages.at(-1);
  assert.equal(reply.role, 'assistant');
  assert.match(reply.text, /(^|\n\n)I started your game with the characters you picked\.$/, 'one short line, last');
  assert.match(loadChat(id).messages.filter(m => m.role === 'assistant').map(m => m.text).join(' '), /Sorry, I could not build it\./);
  assert.ok(loadChat(id).messages.some(m => m.role === 'assistant' && (m.events || []).some(e => e[0] === 'version' && e[1].number === 1)), 'the version shows in the chat like any other');
  // a catching game in the plan: the fallback is the catching game
  const r2 = await build(seaPlan({ type: { from: 'pack', id: 'catch' } }), [[{ type: 'text', text: 'No.' }]]);
  const v2 = cur(r2.id); assert.match(v2.html, /<title>[^<]*<\/title>/); assert.equal(cast(v2.html).friends.length, 22);
  assert.ok(T.loadTemplate('catch', {}).split('\n')[0] === v2.html.split('\n')[0], 'the catch template');
  // no plan, or a 3D plan: nothing is made for them
  const r3 = await build({ ...seaPlan(), look: '3d' }, [[{ type: 'text', text: 'No.' }]]);
  assert.equal(games.getGame(r3.id).current_version_id, null);
});

test('art2dMissing and art2dCast read the CONFIG lines and a game\'s own Oomba2D.use call', () => {
  const want = { world: '', hero: 'dolphin', friends: ['crab', 'squid'] };
  const tpl = T.loadTemplate('runner', want);
  assert.deepEqual(A.art2dMissing(tpl, want), []);
  assert.deepEqual(A.art2dCast(tpl), { world: '', hero: 'dolphin', friends: ['crab', 'squid'] });
  const own = `${S.oomba2dTag()}\n${S.art2dPackTag('animals')}\n<script>Oomba2D.use({ hero: 'squid', friends: ['dolphin', 'crab'] }).then(go);</script>`;
  assert.deepEqual(A.art2dMissing(own, want), [], 'any of them may be the player');
  assert.deepEqual(A.art2dMissing(own.replace("'crab'", "'koi'"), want), ['these picked characters are not in CONFIG.hero2d or CONFIG.friends2d: crab']);
  assert.deepEqual(A.art2dMissing('<script>Oomba.game({})</script>', want), ['the game does not draw with the 2D art at all (no Oomba2D tag, no CONFIG.hero2d / CONFIG.friends2d)']);
  assert.deepEqual(A.art2dMissing('<p>anything</p>', {}), [], 'nothing wanted, nothing missing');
});
