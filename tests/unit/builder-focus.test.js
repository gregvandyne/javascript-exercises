// The classroom focus (config.arcade off, the default; docs/decisions.md "Classroom focus: the Builder without the kit"):
// the Builder's prompt and tools name no kit, Kit 2, 2D art or 3D rules and no kit template; the setup plan never picks
// a kit engine; the plain quiz, memory and word starters load and play; live is cleanly unavailable for classroom games;
// a game made on the kit before still opens and keeps its engine; with ARCADE on everything is as it was.
// The Claude provider runs against a local fake Messages API (as tests/unit/builder-claude.test.js does).
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-focus-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';

const requests = []; const script = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const b = JSON.parse(body || '{}'); requests.push({ url: req.url, body: b });
    if (!b.stream) {
      res.setHeader('content-type', 'application/json');
      const sys = JSON.stringify(b.system || '');
      const text = sys.includes('You review games') ? '{"verdict":"approve","reasons":[]}' : sys.includes('You check pictures') ? '{"verdict":"allow","reason":"x"}' : '{"verdict":"allow","category":"none"}';
      return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
    }
    const blocks = script.shift() || [{ type: 'text', text: 'Done.' }];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const out = [];
    const ev = (name, data) => out.push(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: blk.text } }); }
      else { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${requests.length}`, name: blk.name, input: {} } }); ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(blk.input) } }); }
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

const { config, parseFlag } = await import('../../server/config.js');
config.anthropicKey = 'sk-ant-test-fake';
config.arcade = false;   // the classroom focus (ARCADE off, the site's default; tests/unit/_setup.js turns it on for older tests)
config.builderFullForAll = true;
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const P = await import('../../server/builder/prompt.js');
const plan = await import('../../server/builder/plan.js');
const { FOCUS_TEMPLATE_KEYS, KIT_TEMPLATE_KEYS, BUILDER_TEMPLATE_KEYS, PLAIN_GAME_KEYS } = await import('../../server/builder/catalog.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { liveClassState, canvasLineState } = await import('../../server/routes/studio.js');
const { tEn, tFor } = await import('../../server/i18n/index.js');
const { WORLD_IDS } = await import('../../server/builder/kit2.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { frameCsp } = await import('../../server/services/frame.js');

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
/** The rule blocks the model reads only with the kit: their headers, and the kit template names. */
const KIT_HEADERS = [/^KIT RULES/m, /^KIT 2 RULES/m, /^2D ART RULES/m, /^3D RULES/m, /^LIVE RULES/m, /^KIT 3D BRIDGE/m, /KIT 2 \(short\)|^KIT 2:/m];
const KIT_NAMES = ['oomba3d', 'world3d', '"runner"', '"catch"', '"duel"', 'oomba-kit', '{{PACK_TAG', 'Oomba.game', 'Oomba.sfx'];
const noKit = (text, where) => {
  for (const re of KIT_HEADERS) assert.ok(!re.test(text), `${where}: no ${re}`);
  for (const n of KIT_NAMES) assert.ok(!text.includes(n), `${where}: never names ${n}`);
};
const enumOf = tools => tools.find(t => t.name === 'start_from_template').input_schema.properties.template.enum;
const user = name => auth.createUser({ username: name, password: 'secret1' });
const streamCalls = () => requests.filter(x => x.body.stream);

test('arcade off is the default, and the classroom prompt and tools name nothing of the kit', () => {
  assert.equal(parseFlag(undefined, 'ARCADE').on, false, 'ARCADE is off unless set');
  const { system, tools } = P.promptFor();
  assert.equal(system, P.SYSTEM_PROMPT_FOCUS); assert.equal(tools, P.TOOLS_FOCUS);
  noKit(system, 'SYSTEM_PROMPT_FOCUS');
  assert.ok(!system.includes(P.KIT_RULES) && !system.includes(P.KIT2_SHORT) && !system.includes(P.ART2D_SHORT), 'none of the kit blocks');
  assert.ok(system.includes(P.CLASSROOM_RULES_FOCUS) && /classquiz/.test(system) && /Oomba classroom style/.test(system));
  assert.deepEqual(enumOf(P.TOOLS_FOCUS), FOCUS_TEMPLATE_KEYS);
  for (const k of KIT_TEMPLATE_KEYS) assert.ok(!enumOf(P.TOOLS_FOCUS).includes(k), `no ${k} in the classroom enum`);
  const sft = P.TOOLS_FOCUS.find(t => t.name === 'start_from_template');
  assert.deepEqual(Object.keys(sft.input_schema.properties), ['template', 'notes'], 'no world, hero, sprite or friends');
  noKit(JSON.stringify(P.TOOLS_FOCUS), 'TOOLS_FOCUS');
  for (const k of ['classquiz', 'classmemory', 'classword']) assert.ok(FOCUS_TEMPLATE_KEYS.includes(k));
  // two fixed prefixes, the same bytes every time (so each caches)
  assert.equal(P.promptFor(false).system, P.promptFor(false).system); assert.equal(sha(JSON.stringify(P.promptFor(false).tools)), sha(JSON.stringify(P.TOOLS_FOCUS)));
});

test('arcade on: the arcade prompt and tools exactly as before', () => {
  const { system, tools } = P.promptFor(true);
  assert.equal(system, P.SYSTEM_PROMPT); assert.equal(tools, P.TOOLS);
  assert.ok(system.includes(P.KIT_RULES) && system.includes(P.KIT2_SHORT));
  assert.deepEqual(enumOf(P.TOOLS), BUILDER_TEMPLATE_KEYS);
  for (const k of PLAIN_GAME_KEYS) assert.ok(!BUILDER_TEMPLATE_KEYS.includes(k), `${k} is not in the arcade enum (its bytes are unchanged)`);
});

test('planEngine never picks Kit 2, a 3D world or the 2D art with the arcade side off', () => {
  const looks = [null, '2d', '3d', 'auto'], worlds = [null, { from: 'pack', id: WORLD_IDS[0] }, { from: 'custom', text: 'a castle' }];
  const chars = [[], [{ from: 'pack', id: plan.CHARACTER_IDS[0] }], [{ from: 'pack', id: plan.CHARACTER_IDS.at(-1) }]];
  const types = [null, ...plan.TYPE_IDS.map(id => ({ from: 'pack', id })), { from: 'custom', text: 'a racing game' }, { from: 'custom', text: 'a spelling game' }];
  let n = 0;
  for (const type of types) for (const look of looks) for (const world of worlds) for (const characters of chars) {
    const p = plan.normalisePlan({ type, look, world, characters, play: 'live', notes: 'x' }) || { v: 1, type: null, look: null, world: null, characters: [], learn: [], notes: '' };
    const e = plan.planEngine(p); n++;
    assert.equal(e.engine, 'classroom', JSON.stringify({ type, look, world, e }));
    assert.ok(!e.template || FOCUS_TEMPLATE_KEYS.includes(e.template), `a classroom starter: ${e.template}`);
    assert.equal(p.world, null); assert.deepEqual(p.characters, []); assert.equal(p.look, null);
    assert.equal(plan.planArt2d(p), null); assert.equal(plan.engineFor({}, p, '', null), null);
    assert.notEqual(p.play, 'live', 'never live');
    const note = plan.planNote(p);
    for (const re of KIT_HEADERS) assert.ok(!re.test(note));
    assert.ok(!/start_from_template "(runner|catch|duel|board|quiz|memory|word|oomba3d|world3d)"|Oomba Kit with|LIVE RULES|Oomba\.live\.ready/.test(note), `planNote ${type && (type.id || type.text)}: no kit starter or live pack`);
  }
  assert.ok(n > 500);
  assert.equal(plan.planEngine(plan.normalisePlan({ type: { from: 'pack', id: 'quiz' } })).template, 'classquiz');
  assert.equal(plan.planEngine(plan.normalisePlan({ type: { from: 'pack', id: 'memory' } })).template, 'classmemory');
  assert.equal(plan.planEngine(plan.normalisePlan({ type: { from: 'pack', id: 'word' } })).template, 'classword');
  assert.equal(plan.planEngine(plan.normalisePlan({ type: { from: 'custom', text: 'a spelling game' } })).template, 'classword');
  // a lesson is still a lesson (Oomba Canvas)
  assert.equal(plan.planEngine(plan.normalisePlan({ kind: 'activity', topic: { text: 'fractions' } })).engine, 'canvas');
  // the setup steps: one group, the classroom types, quiz, memory and word skip the scene steps
  for (const teacher of [true, false]) {
    const g = plan.typeGroups({ teacher });
    assert.deepEqual(g.map(x => x.id), ['class']);
    for (const id of ['quiz', 'memory', 'word']) { const t = g[0].items.find(x => x.id === id); assert.ok(t); assert.ok(PLAIN_GAME_KEYS.includes(t.template)); assert.deepEqual(t.skip, ['look', 'world', 'chars']); }
  }
  // a typed message with no plan: never Kit 2, whatever it names
  const st = {};
  assert.equal(plan.engineFor(st, null, `a 3D game in ${WORLD_IDS[0]} with a dragon`, null), null);
  assert.equal(st.kit2, undefined);
});

test('arcade on: planEngine and the setup steps as before (kit types, Kit 2, the 2D art)', () => {
  config.arcade = true;
  try {
    assert.equal(plan.planEngine(plan.normalisePlan({ type: { from: 'pack', id: 'quiz' } })).engine, '2d');
    assert.equal(plan.typeById('quiz').template, 'quiz');
    assert.equal(plan.planEngine(plan.normalisePlan({ look: '3d', world: { from: 'pack', id: WORLD_IDS[0] } })).engine, 'kit2');
    assert.deepEqual(plan.typeGroups({ teacher: true }).map(x => x.id), ['class', 'games']);
    assert.equal(plan.playDefault(plan.normalisePlan({ type: { from: 'pack', id: 'categories' } })), 'live');
  } finally { config.arcade = false; }
});

test('live: unavailable for every new classroom game, with the reason in every language; an older kit game keeps it', () => {
  for (const id of plan.TYPE_IDS) {
    const p = plan.normalisePlan({ type: { from: 'pack', id } });
    const why = plan.liveNot(p); assert.ok(why, `${id} is not live`);
    assert.ok(!plan.playOptions(p).find(o => o.id === 'live').ok);
    assert.notEqual(plan.playDefault(p), 'live');
  }
  assert.equal(plan.liveNotFor('quiz'), 'plain'); assert.equal(plan.liveNotFor('survey'), 'survey');
  for (const code of ['en', 'fr', 'he', 'ja', 'zh-Hant', 'en-GB']) assert.ok(tFor(code)('buildSetup.play.why.plain').length > 20, code);
  // the Studio's live line for a plain starter: off, with the reason; for an older kit game: "Make it live" still works
  const u = user('FocusLive'), g = games.createGame(u.id, {}), t = tFor('en');
  const plain = { id: 1, html: loadTemplate('classquiz') };
  const L = liveClassState(u, g, plain, t, {}); assert.equal(L.line, 'off'); assert.equal(L.why, tEn('buildSetup.play.why.plain'));
  config.arcade = true; const kitQuiz = { id: 2, html: loadTemplate('quiz') }; config.arcade = false;
  const K = liveClassState(u, g, kitQuiz, t, {}); assert.equal(K.line, 'off'); assert.equal(K.why, '', 'an older kit game may still be made live');
  // a lesson's line has no "Make it an arcade game"
  const lesson = { id: 3, html: loadTemplate('canvas') };
  const C = canvasLineState(lesson, t, {}); assert.equal(C.kind, 'activity'); assert.equal(C.button, ''); assert.equal(C.ask, '');
  config.arcade = true; try { assert.ok(canvasLineState(lesson, t, {}).button); } finally { config.arcade = false; }
});

test('the plain starters carry no kit tags, pass the safety scan, and share the Oomba classroom style', () => {
  for (const k of FOCUS_TEMPLATE_KEYS) {
    const h = loadTemplate(k);
    assert.ok(!/oomba-kit|<!--KIT-->|<!--PACK|\/packs\/live|\/vendor\/art2d|\/vendor\/three|importmap/i.test(h), `${k}: no kit tags`);
    assert.ok(!/Oomba\.(live|game|sfx|say)\b/.test(h), `${k}: no kit calls`);
    assert.ok(h.includes('<style id="oomba-classroom-style">') && h.includes('--leaf:#1F9D63') && h.includes('/vendor/oomba-classroom/1.0.0/fonts/bricolage-latin.woff2'), `${k}: the shared style`);
    assert.ok(!/fonts\.googleapis|https?:\/\//.test(h), `${k}: nothing from outside`);
    assert.match(h, /\n  sound: false,/, `${k}: sound off by default`);
    const r = scanVersion(h); assert.notEqual(r.status, 'fail', `${k}: ${JSON.stringify(r.issues.filter(i => i.level === 'fail'))}`);
    assert.ok(fs.existsSync(`public/vendor/oomba-classroom/1.0.0/fonts/bricolage-latin.woff2`));
  }
  // the frame lets the starters' own font in (fonts only: never a script from that folder)
  const csp = frameCsp('https://oomba.example');
  assert.ok(/font-src [^;]*https:\/\/oomba\.example\/vendor\/oomba-classroom\//.test(csp));
  assert.ok(!/script-src [^;]*oomba-classroom/.test(csp));
});

test('classroom look 2 (the Crossword look): every starter carries it, the marker becomes the current block at save time, the prompt describes it', async () => {
  const T = await import('../../server/builder/templates/index.js');
  const block = T.classroomStyle();
  assert.match(block, /Oomba classroom style 2/);
  assert.ok(!block.includes(T.CLASSROOM_MARKER), 'the block never holds its own marker');
  for (const tok of ['--paper:#E1F1E1', '--dots:#66C792', '--card:#FFFDF2', '--green:#1F9D63', '--current:#141414', ':root[data-theme="dark"]', 'prefers-color-scheme:dark', 'prefers-reduced-motion:reduce', '.nowbar{', '.wicon{', '.opt{', '.answer{', '.is-right{', '.is-wrong{', 'radial-gradient(var(--dots)'])
    assert.ok(block.includes(tok), `the block has ${tok}`);
  for (const old of ['--page:', '--leaf:', '--tint:', '--mint-soft:', '--soft:', '--lift:']) assert.ok(block.includes(old), `style 1 name ${old} still resolves`);
  assert.doesNotMatch(block, /fonts\.googleapis|https?:\/\//, 'no font service');
  for (const k of FOCUS_TEMPLATE_KEYS.filter(k => k !== 'canvas')) {
    const h = loadTemplate(k);
    assert.equal(T.classroomLook(h), 2, `${k}: style 2`);
    assert.match(h, /document\.documentElement\.dataset\.theme = B\.theme/, `${k}: follows BRB.theme`);
    assert.match(h, /class="[^"]*\b(card|widget)\b[^"]*"/, `${k}: a widget card`);
  }
  // the marker: a new game gets the current block; an older copy is dropped; without the marker a game keeps its block
  const oldGame = '<title>Old</title>\n<style id="oomba-classroom-style">\n/* ---- Oomba classroom style */ :root{--page:#F4F1E6}\n</style>\n<style>.x{}</style>';
  assert.equal(T.classroomLook(oldGame), 1);
  assert.equal(T.withClassroomStyle(oldGame), oldGame, 'no marker: the game keeps its own block');
  const moved = T.withClassroomStyle(oldGame.replace('<title>Old</title>', '<title>Old</title>\n<!--CLASSROOM_STYLE-->'));
  assert.equal(T.classroomLook(moved), 2); assert.ok(!moved.includes('#F4F1E6')); assert.equal(moved.split('id="oomba-classroom-style"').length - 1, 1);
  assert.equal(T.withClassroomStyle(moved), moved, 'saving again changes nothing');
  const u = user('FocusLook'), g = games.createGame(u.id, {});
  const { toolbox } = await import('../../server/builder/tools.js');
  const tb = toolbox({ user: u, gameId: g.id, emit() {}, state: {} });
  const r = await tb.exec('write_game', { notes: 'A new quiz', html: '<title>Fractions</title>\n<!--CLASSROOM_STYLE-->\n<style>.b{gap:8px}</style>\n<main class="app"><header class="bar"><h1>Fractions</h1></header></main>\n<script>window.__brbTest = { state: () => ({}), start() {} };</script>' });
  assert.equal(r.ok, true, r.forModel);
  const saved = games.getVersion(games.getGame(g.id).current_version_id).html;
  assert.ok(saved.includes(block), 'write_game: the marker became the block'); assert.ok(!saved.includes('<!--CLASSROOM_STYLE-->'));
  // the prompt: the look, the screens, old games, never the kit or a font service
  const sys = P.SYSTEM_PROMPT_FOCUS;
  for (const s of ['Oomba classroom style 2', 'dotted mint board', 'class="nowbar"', 'class="wicon"', 'class="answers"', 'is-right', '<!--CLASSROOM_STYLE-->', 'BRB.theme', '375 px', 'reduced motion', 'never color alone'])
    assert.ok(sys.includes(s), `the prompt says ${s}`);
  assert.match(sys, /only when someone asks\s+for a new look or a rebuild/, 'an old game moves to the new look only when asked');
  assert.doesNotMatch(sys, /\u2014|practise|maths|colour|synthesised|Chromebook|iPad/, 'US spelling, no em dashes, no device brands');
});

test('a typed build with the arcade side off: the classroom prompt every round, no kit rules, a kit template is refused, a starter works', async () => {
  const u = user('FocusMaker'), g = games.createGame(u.id, {});
  script.push(
    [{ type: 'text', text: 'Let us go! ' }, { type: 'tool_use', name: 'start_from_template', input: { template: 'runner', notes: 'x' } }],
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'classquiz', notes: 'Started a class quiz' } }],
    [{ type: 'text', text: 'Your quiz is ready.' }],
  );
  const before = streamCalls().length, events = [];
  const r = await runTurn({ user: u, gameId: g.id, text: `a 3D game in ${WORLD_IDS[0]} with a dragon, live with my class`, emit: (n, d) => events.push([n, d]) });
  assert.equal(r.ok, true, JSON.stringify(events.filter(e => e[0] === 'error')));
  const calls = streamCalls().slice(before);
  assert.ok(calls.length >= 3);
  for (const c of calls) {
    assert.equal(c.body.system[0].text, P.SYSTEM_PROMPT_FOCUS);
    assert.deepEqual(enumOf(c.body.tools), FOCUS_TEMPLATE_KEYS);
    for (const b of c.body.system.slice(1)) if (!/^CURRENT GAME/.test(b.text)) noKit(b.text, 'a per-turn block');
    assert.ok(!c.body.system.some(b => [P.KIT_RULES, P.KIT2_RULES, P.THREE_D_RULES, P.LIVE_RULES, P.ART2D_RULES].includes(b.text)));
  }
  const refused = JSON.stringify(calls[1].body.messages.at(-1));
  assert.match(refused, /Not available: the Builder makes classroom games now/);
  const v = games.getVersion(games.getGame(g.id).current_version_id);
  assert.match(v.html, /<title>Class Quiz<\/title>/); assert.ok(!/oomba-kit/.test(v.html));
});

test('a game made on the kit before still opens and keeps its engine: its rules come with its own turns', async () => {
  const u = user('FocusOldKit'), g = games.createGame(u.id, {});
  config.arcade = true; const kitQuiz = loadTemplate('quiz'); config.arcade = false;
  games.addVersion(g.id, kitQuiz, { notes: 'old', createdBy: u.id, safetyStatus: 'pass', safetyReport: {} });
  script.push([{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: "<title>", replace: '<title>' }], notes: 'same' } }], [{ type: 'text', text: 'Done.' }]);
  const before = streamCalls().length;
  await runTurn({ user: u, gameId: g.id, text: 'make the questions about space', emit: () => {} });
  const c = streamCalls()[before];
  assert.equal(c.body.system[0].text, P.SYSTEM_PROMPT_FOCUS, 'the classroom prefix');
  assert.ok(c.body.system.some(b => b.text === P.KIT_RULES), 'and the KIT RULES as a block of its own, for this game');
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /oomba-kit/, 'still on the kit');
});

test('arcade on: a typed 3D request still gets the 3D rules and the arcade prompt', async () => {
  config.arcade = true;
  try {
    const u = user('ArcadeMaker'), g = games.createGame(u.id, {});
    script.push([{ type: 'text', text: 'What kind of 3D world?' }]);
    const before = streamCalls().length;
    await runTurn({ user: u, gameId: g.id, text: 'a 3D world to explore with a castle', emit: () => {} });
    const c = streamCalls()[before];
    assert.equal(c.body.system[0].text, P.SYSTEM_PROMPT); assert.deepEqual(enumOf(c.body.tools), BUILDER_TEMPLATE_KEYS);
    assert.ok(c.body.system.some(b => b.text === P.THREE_D_RULES || b.text === P.KIT2_RULES));
  } finally { config.arcade = false; }
});

test('the mock Builder (no API key) starts a classroom starter with the arcade side off', async () => {
  const key = config.anthropicKey; config.anthropicKey = '';
  try {
    for (const [text, title] of [['a quiz about planets', 'Class Quiz'], ['a memory game with science words', 'Memory Match'], ['a spelling game', 'Word Lab'], ['a running game with a fox', 'Class Quiz']]) {
      const u = user(`Mock${title.replace(/\W/g, '')}${Math.random().toString(36).slice(2, 6)}`), g = games.createGame(u.id, {});
      const r = await runTurn({ user: u, gameId: g.id, text, emit: () => {} });
      assert.equal(r.ok, true);
      const v = games.getVersion(games.getGame(g.id).current_version_id);
      assert.ok(v, text); assert.ok(!/oomba-kit|oomba3d/.test(v.html), `${text}: no kit`); assert.match(v.html, /oomba-classroom-style/, text);
    }
  } finally { config.anthropicKey = key; }
});

// ---- the plain starters in a browser --------------------------------------------------------------------------------
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
let browser;
test.before(async () => { if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); });
test.after(async () => { if (browser) await browser.close(); });
const stub = `window.__calls = []; window.BRB = { user: { lang: 'en', dir: 'ltr' }, preview: true, sfx: { muted: false, play(n) { __calls.push(['sfx', n]); }, mute() {} },
  speak(t) { __calls.push(['speak', t]); return true; }, stopSpeaking() {}, fx: { confetti() {} }, gameOver(r) { __calls.push(['gameOver', r]); }, fullscreen() {} };`;
async function open(key, width = 1280, height = 800) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${stub}</script></head><body>${loadTemplate(key)}</body></html>`);
  await page.waitForTimeout(100);
  return { page, errors, state: () => page.evaluate(() => window.__brbTest.state()) };
}

test('Class Quiz: a whole round by keys, a review of every answer, the missed ones again, pasted questions', { skip }, async () => {
  const { page, errors, state } = await open('classquiz');
  await page.evaluate(() => window.__brbTest.start());
  const total = (await state()).total;
  for (let i = 0; i < total; i++) {
    const s = await state();
    const key = i === 0 ? String(((s.answer + 1) % 4) + 1) : String(s.answer + 1);   // the first one wrong, the rest right
    await page.keyboard.press(key); await page.keyboard.press('Enter'); await page.waitForTimeout(30);
  }
  const end = await state(); assert.equal(end.screen, 'end'); assert.equal(end.score, total - 1);
  assert.equal(await page.locator('#review li').count(), total);
  assert.equal(await page.locator('#review li.no').count(), 1);
  assert.match(await page.locator('#review li.no').textContent(), /✗[\s\S]*Your answer/);
  assert.deepEqual((await page.evaluate(() => __calls.filter(c => c[0] === 'gameOver')))[0][1], { won: true, score: total - 1 });
  assert.equal((await page.evaluate(() => __calls.filter(c => c[0] === 'sfx'))).length, 0, 'no sound until Sound is pressed');
  await page.click('#missed'); assert.equal((await state()).total, 1, 'only the missed one');
  assert.deepEqual(errors, []);
  await page.close();
  // the teacher's own questions: one per line, a bad line is named
  const e = await open('classquiz');
  await e.page.click('#editBtn');
  await e.page.fill('#editText', 'Capital of France? | Paris');
  await e.page.click('#editUse'); assert.match(await e.page.locator('#editMsg').textContent(), /Line 1/);
  await e.page.fill('#editText', 'Capital of France? | Paris | Rome | Madrid\n2 + 2? | 4 | 5');
  await e.page.click('#editUse'); await e.page.click('#go');
  assert.equal((await e.state()).total, 2);
  assert.deepEqual(e.errors, []); await e.page.close();
  const t = await open('classquiz', 390, 844);
  await t.page.click('#timerBtn'); assert.equal((await t.state()).timer, 10);
  await t.page.evaluate(() => window.__brbTest.start());
  const sw = await t.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(sw <= 0, 'fits 390 px');
  assert.deepEqual(t.errors, []); await t.page.close();
});

test('Memory Match: flip cards with keys and taps, pairs stay, teams take turns, the end lists every pair', { skip }, async () => {
  const { page, errors, state } = await open('classmemory');
  await page.click('#who button:nth-child(2)');   // 2 teams
  await page.click('#go');
  let s = await state(); assert.equal(s.cards, 16); assert.equal(s.teams, 2);
  // a miss passes the turn
  const firstOther = s.pairOf.findIndex((p, i) => i > 0 && p !== s.pairOf[0]);
  await page.locator('.mc').nth(0).click(); await page.locator('.mc').nth(firstOther).click();
  await page.waitForTimeout(1300); s = await state(); assert.equal(s.turn, 2); assert.equal(s.found, 0);
  // then every pair by its index
  const seen = new Set();
  for (let i = 0; i < s.pairOf.length; i++) {
    if (seen.has(i)) continue; const j = s.pairOf.findIndex((p, k) => k !== i && p === s.pairOf[i]); seen.add(i); seen.add(j);
    await page.locator('.mc').nth(i).click(); await page.locator('.mc').nth(j).click(); await page.waitForTimeout(20);
  }
  await page.waitForTimeout(900);
  s = await state(); assert.equal(s.screen, 'end'); assert.equal(s.found, 8); assert.equal(s.scores.reduce((a, b) => a + b, 0), 8);
  assert.equal(await page.locator('#pairs li').count(), 8);
  // keyboard: arrows move, Enter flips
  await page.click('#again'); await page.waitForTimeout(50);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  assert.equal((await state()).open.length, 1);
  assert.deepEqual(errors, []);
  await page.close();
  const m = await open('classmemory', 390, 844); await m.page.evaluate(() => window.__brbTest.start());
  const fit = await m.page.evaluate(() => ({ sw: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [...document.querySelectorAll('.mc')].filter(b => b.getBoundingClientRect().height < 44).length }));
  assert.ok(fit.sw <= 0); assert.equal(fit.small, 0, 'cards are at least 44 px tall at 390 px');
  await m.page.close();
});

test('Word Lab: unscramble by typing, two wrong checks show the word, fill the gap by number, spell it hears the word', { skip }, async () => {
  const { page, errors, state } = await open('classword');
  await page.evaluate(() => window.__brbTest.start());
  let s = await state(); assert.equal(s.mode, 'unscramble');
  for (const ch of s.target) await page.keyboard.press(ch);
  s = await state(); assert.equal(s.done, true); assert.equal(s.score, 1);
  await page.keyboard.press('Enter'); s = await state(); assert.equal(s.word, 2);
  // wrong twice: the word is shown and it counts as missed
  const wrong = [...s.target].reverse().join('');
  for (let k = 0; k < 2; k++) { if (wrong === s.target) break; for (const ch of wrong) await page.keyboard.press(ch); if (!(await state()).done) await page.click('#clear'); }
  s = await state(); assert.equal(s.done, true); assert.equal(s.score, 1); assert.match(await page.locator('#feedback').textContent(), /The word is/);
  // fill the gap
  await page.evaluate(() => { window.__brbTest.mode('gap'); window.__brbTest.start(); });
  s = await state(); assert.equal(s.mode, 'gap');
  const opts = await page.locator('#choices button').allTextContents(); const right = opts.findIndex(o => o === s.target);
  await page.keyboard.press(String(right + 1)); s = await state(); assert.equal(s.score, 1);
  // spell it: Hear the word speaks the word itself (the Sound button is not needed: it was asked for)
  await page.evaluate(() => { window.__brbTest.mode('spell'); window.__brbTest.start(); });
  s = await state(); assert.ok(s.tiles > s.target.length, 'extra letters mixed in');
  await page.click('#hear');
  assert.ok((await page.evaluate(() => __calls.filter(c => c[0] === 'speak').map(c => c[1]))).includes(s.target));
  assert.deepEqual(errors, []);
  await page.close();
});
