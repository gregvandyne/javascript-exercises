// Builder: audit 5 fixes (docs/decisions.md "Builder: audit 5 fixes"). The owner's live audit after Oomba Canvas 1.6.0
// shipped found three things the stand-in Builder had hidden; each test below fails on the live behaviour:
//   1. a plain "regrouping addition, grade 4" game from the chat (On their own devices) was a multiple-choice quiz the
//      Builder wrote itself, not the canvas column tool with 1.6's steps, hints, stars and sound: the chat's devices plan
//      was a game plan with no type, which the Builder builds from the closest classroom starter (the class quiz). Now a
//      game plan for column arithmetic (chat or Studio, board or devices) is the canvas activity, labelled a class game;
//   2. "Save version" on a 1.5.0 activity said "Saved as version 4." and kept playing 1.5.0 (the route copied the page
//      byte for byte; the Activity panel, the only place that moved the kit, could not be saved with no change). Now
//      saving again (Save version, the panel with no edit, the Builder's own save) moves it to the newest kit;
//   3. builds took 3 to 6 minutes while the chat's card always said "Usually 1-2 minutes": the card now shows the
//      build's own estimate (and the first guess for a teacher's build is 2 to 6 minutes), a chat activity build starts
//      with the canvas starter already loaded (one model round fewer), and every build logs where its time went.
// The kit is always "the newest version in CANVAS_VERSIONS" (canvaskit.js latestCanvas), never a written number, so
// 1.6.1 becomes the default the day its line is added.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BRB_MOCK_DELAY_MS = '0';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const games = await import('../../server/services/games.js');
const CO = await import('../../server/services/companion.js');
const CB = await import('../../server/services/companion-build.js');
const C = await import('../../server/services/oomba-chat.js');
const J = await import('../../server/services/oomba-jobs.js');
const agent = await import('../../server/builder/agent.js');
const runner = await import('../../server/builder/runner.js');
const PT = await import('../../server/services/playthrough.js');
const P = await import('../../server/builder/plan.js');
const K = await import('../../server/services/canvaskit.js');
const AD = await import('../../server/builder/activity-data.js');
const eta = await import('../../server/builder/eta.js');
const { wantsCanvas, sourceBlock } = await import('../../server/builder/prompt.js');
const { templateHtml } = await import('../../server/builder/catalog.js');
const { toolbox } = await import('../../server/builder/tools.js');
const { studioState } = await import('../../server/routes/studio.js');
const { tEn, tFor } = await import('../../server/i18n/index.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; PT.hooks.run = null; await J.idle(); server.close(); });
test.beforeEach(() => { RL._reset(); PT.hooks.run = PASS; CB.hooks.provider = 'a5'; });

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
function world() {
  const admin = createUser({ username: uname('A5Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Audit5 ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('A5T'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  S.createClass({ id: teacher.id }, s.id, { name: '4b math', grade: '4' });
  return { teacher: getUser(teacher.id), tc: cookieFor(teacher.id) };
}
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${++tuN}`, name, input }] });
function standIn(script) {
  let answerStart = 0, calls = 0;
  CO.hooks.create = async params => {
    const last = params.messages.at(-1);
    if (!(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result'))) answerStart = calls;
    const r = await script(params, calls++ - answerStart);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
}
const say = async (x, text) => { const r = await post('/api/companion/chat', { text, page: { type: 'teach' } }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const tap = (x, turnId, a, value = '') => post('/api/companion/build/act', { turnId, act: a, value }, x.tc);
const settle = async gameId => { await J.idle(); if (gameId) await runner.idle(gameId); await J.idle(); };
const gamesOf = u => q.all("SELECT * FROM games WHERE owner_id=? AND status<>'deleted' ORDER BY created_at, rowid", u.id);
const PASS = async () => ({ end: true, kind: 'canvas', ms: 1200, score: 6, endHow: 'played' });

// The Builder stand-in: what the real model does with the plan it is given. On the canvas (CANVAS RULES and a canvas
// draft) it edits the activity's data; on anything else it does what the live Builder did for "Farm Carry Stars": a
// multiple-choice quiz of its own (start_from_template "classquiz").
let sent = [], seen = [];
const QUIZ_TITLE = '<title>Farm Carry Stars</title>';
agent.registerProvider('a5', {
  async run(ctx) {
    const cur = ctx.tools.current();
    sent.push({ text: ctx.text, plan: ctx.plan });
    seen.push({ draft: !!(cur && cur.draft), seeded: !!(cur && cur.seeded), kit: cur ? K.canvasVersion(cur.html) : null, source: cur ? sourceBlock(cur, ctx.tools.game()) : '' });
    ctx.steps.start('write');
    if (cur && K.canvasVersion(cur.html)) {
      const d = K.activityData(cur.html).data;
      const html = K.withActivityData(cur.html, { ...d, task: { ...d.task, title: 'Farm Carry Stars', say: 'Add the farm\'s eggs. Carry when a column makes ten or more.', theme: { icon: '🐔', cheers: ['Egg-cellent!'], end: 'The farm is ready!' } }, gen: { tool: 'digits.add', digits: 2, regroup: 'some' } })
        .replace(/<title>[^<]*<\/title>/, QUIZ_TITLE);
      const m = /<script type="application\/json" id="oc-activity">[\s\S]*?<\/script>/.exec(cur.html)[0];
      const m2 = /<script type="application\/json" id="oc-activity">[\s\S]*?<\/script>/.exec(html)[0];
      const e = await ctx.tools.exec('edit_game', { edits: [{ find: m, replace: m2 }], notes: 'Farm Carry Stars' });
      assert.equal(e.ok, true, e.forModel);
    } else {
      const r = await ctx.tools.exec('start_from_template', { template: 'classquiz' });
      assert.equal(r.ok, true, r.forModel);
      const c2 = ctx.tools.current(), t = /<title>[^<]*<\/title>/.exec(c2.html)[0];
      const e = await ctx.tools.exec('edit_game', { edits: [{ find: t, replace: QUIZ_TITLE }], notes: 'Farm Carry Stars quiz' });
      assert.equal(e.ok, true, e.forModel);
    }
    return { model: 'a5', tokensIn: 0, tokensOut: 0 };
  },
});
async function buildIt(x, { start, words, picks }) {
  standIn((p, i) => (i === 0 ? uses('startBuild', start) : 'Sure!'));
  await say(x, words);
  let bot = await lastBot(x.tc);
  if (bot.note.build.state === 'ask') { assert.equal((await tap(x, bot.id, 'buildPlan', JSON.stringify(picks))).status, 200); bot = await lastBot(x.tc); }
  const r = await tap(x, bot.id, 'buildGo', bot.note.build.words);
  assert.equal(r.status, 200, await r.clone().text());
  const g = gamesOf(x.teacher).at(-1);
  await settle(g.id);
  return games.getGame(g.id);
}

// ---------------------------------------------------------------- the kit: always the newest version
test('kit selection: the newest Oomba Canvas version is found by number, and every default uses it', async () => {
  assert.equal(K.CANVAS_LATEST, K.latestCanvas(), 'CANVAS_LATEST is derived, never written');
  assert.equal(K.latestCanvas({ '1.5.0': 'a', '1.6.0': 'b', '1.6.1': 'c', '1.4.1': 'd' }), '1.6.1', 'a 1.6.1 line makes it the default');
  assert.equal(K.latestCanvas({ '1.9.0': 'a', '1.10.0': 'b' }), '1.10.0', 'by number, not by text');
  assert.equal(AD.PANEL_KIT, K.CANVAS_LATEST);
  assert.ok(K.canvasTag().includes(`/vendor/oomba-canvas/${K.CANVAS_LATEST}/`));
  const { html } = await templateHtml('canvas');
  assert.equal(K.canvasVersion(html), K.CANVAS_LATEST, 'the canvas starter loads the newest kit');
  assert.ok(Object.keys(K.CANVAS_VERSIONS).every(v => K.verCmp(v, K.CANVAS_LATEST) <= 0));
});

// ---------------------------------------------------------------- 1. column arithmetic is a canvas game
test('1. column arithmetic: the topic words that mean it, and the ones that do not', () => {
  for (const topic of ['regrouping addition', 'regrouping', 'addition with carrying', 'subtraction with borrowing', '2-digit addition', 'adding 3-digit numbers', 'column subtraction'])
    assert.ok(P.columnTopic({ topic, grade: '4' }), topic);
  for (const topic of ['adding fractions', 'decimal addition', 'times tables', 'the water cycle', 'spelling', 'money', ''])
    assert.equal(P.columnTopic({ topic, grade: '4' }), null, topic);
  // the whole message needs how it is done in columns: "add a timer" is never arithmetic
  assert.ok(P.columnTopic({ words: 'Make a grade 4 game about regrouping addition, Farm Carry Stars' }));
  assert.ok(P.columnTopic({ words: 'multiply two-digit numbers in columns' }));
  for (const words of ['add a timer to the quiz', 'make a spelling game and add sounds', 'a game about borrowing library books', 'regroup students into teams'])
    assert.equal(P.columnTopic({ words }), null, words);
  // the generator keeps the skill asked for
  assert.equal(P.columnTopic({ topic: 'regrouping addition', grade: '4' }).gen.regroup, 'some');
  assert.equal(P.columnTopic({ topic: 'subtraction with borrowing', grade: '3' }).gen.tool, 'digits.sub');
});

test('1. the chat\'s On their own devices plan for regrouping addition is the canvas activity, labelled a class game', () => {
  // exactly what services/companion-build.js builderPlan sends for "Farm Carry Stars" (devices, hints, grade 4)
  const card = { pick: { kind: 'game', use: 'devices', help: 'hints' }, topic: 'regrouping addition', grade: '4' };
  const raw = CB.builderPlan(card, 'Farm Carry Stars: regrouping addition for grade 4');
  const plan = P.normalisePlan(raw);
  assert.equal(plan.kind, 'activity', 'live: a game plan with no type, which the Builder built as a class quiz');
  assert.equal(plan.game, true); assert.equal(plan.chat, true); assert.equal(plan.grade, '4');
  assert.deepEqual(plan.help, ['guided']); assert.equal(plan.played, 'both'); assert.deepEqual(plan.topic, { text: 'regrouping addition' });
  assert.equal(P.planEngine(plan).engine, 'canvas');
  const note = P.planNote(plan);
  assert.match(note, /CLASS GAME for column arithmetic/); assert.match(note, /never as a quiz of your own/);
  assert.match(note, /digits\.add/, 'the ready column generator is suggested');
  assert.match(note, /do not call start_from_template/, 'a chat build starts with the canvas starter loaded');
  assert.match(note, /stars and sound are built in: never say you cannot/);
  assert.match(P.planBrief(plan), /CLASS GAME/, 'later turns know it too ("add a star reward")');
  assert.match(P.planSentence(plan, tEn), /^Here is my game plan\./);
  // the plan as the runner keeps it (read again after a restart): the same
  assert.deepEqual(P.normalisePlan(JSON.parse(JSON.stringify(plan))), plan);
  // the board was already the activity; a topic that is not column arithmetic stays the class game kind (#713)
  assert.equal(P.normalisePlan(CB.builderPlan({ ...card, pick: { ...card.pick, use: 'board' } }, 'x')).kind, 'activity');
  assert.equal(P.normalisePlan(CB.builderPlan({ ...card, topic: 'the water cycle' }, 'A water cycle game')).kind, undefined);
});

test('1. Studio\'s Classroom game for column arithmetic is the canvas game too; a kind the teacher picked is kept', () => {
  const studio = P.normalisePlan({ type: null, look: null, world: null, characters: [], learn: [{ text: 'subtraction with borrowing' }], play: 'solo' });
  assert.equal(studio.kind, 'activity'); assert.equal(studio.game, true); assert.equal(studio.chat, undefined);
  const typed = P.normalisePlan({ type: { from: 'custom', text: 'a farm game' }, learn: [{ id: 'math' }], notes: 'two-digit addition with regrouping' });
  assert.equal(typed.kind, 'activity'); assert.match(typed.topic.text, /regrouping/);
  for (const type of [{ from: 'pack', id: 'quiz' }, { from: 'pack', id: 'bingo' }, { from: 'pack', id: 'flashcards' }, { from: 'custom', text: 'jeopardy' }])
    assert.notEqual(P.normalisePlan({ type, learn: [{ text: 'regrouping addition' }] }).kind, 'activity', JSON.stringify(type));
  assert.equal(P.normalisePlan({ type: null, learn: [{ text: 'spelling' }], play: 'solo' }).kind, undefined);
  // a typed first message with no plan (a new, empty game), with the arcade side off as on the site: the canvas rules
  // and the class game note
  const was = config.arcade; config.arcade = false;
  try {
    const st = {};
    assert.equal(wantsCanvas(st, 'Make a regrouping addition game for grade 4', null), true);
    assert.equal(st.classGame, true);
    assert.equal(wantsCanvas({}, 'Make a quiz about the water cycle', null), false);
    assert.equal(wantsCanvas({}, 'Make a regrouping addition game', null, { plan: { type: { from: 'pack', id: 'quiz' } } }), false, 'a plan decides');
    assert.equal(wantsCanvas({}, 'add regrouping problems', { html: '<p>a quiz</p>' }), false, 'never for a game that exists');
  } finally { config.arcade = was; }
});

test('1. end to end from the chat: "Farm Carry Stars" on devices is built on the newest canvas, called a class game', async () => {
  const x = world(); sent = []; seen = [];
  const g = await buildIt(x, { start: { title: 'Farm Carry Stars', grade: '4', topic: 'regrouping addition' }, words: 'Make Farm Carry Stars, a grade 4 game about regrouping addition', picks: { kind: 'game', use: 'devices', help: 'hints' } });
  assert.equal(sent.at(-1).plan.kind, 'activity');
  assert.equal(seen.at(-1).seeded, true, 'the canvas starter was already there (no start_from_template round)');
  assert.equal(seen.at(-1).kit, K.CANVAS_LATEST);
  assert.match(seen.at(-1).source, /do NOT call start_from_template/);
  const vs = games.listVersions(g.id);
  assert.deepEqual(vs.map(v => v.number), [1], 'the first save is version 1');
  const html = games.getVersion(vs[0].id).html;
  assert.equal(K.canvasVersion(html), K.CANVAS_LATEST, 'live: a plain A-D quiz with no Oomba Canvas at all');
  assert.doesNotMatch(html, /QUESTIONS\s*=/, 'not the class quiz');
  const d = K.activityData(html).data;
  assert.equal(d.gen.tool, 'digits.add'); assert.equal(d.gen.regroup, 'some');
  assert.ok(K.selfTestHtml(html).ok);
  // Studio: "Class game", and the live line says what any classroom game says
  const st = studioState(x.teacher, g.id, tEn);
  assert.equal(st.canvasLine.kind, 'game');
  assert.equal(st.canvasLine.label, tEn('studio.canvasLine.game'));
  assert.notEqual(st.canvasLine.label, tEn('studio.canvasLine.activity'));
  assert.equal(st.liveClass.why, tEn('buildSetup.play.why.plain'));
  assert.ok(st.activity, 'the Activity panel is there for it');
  // a game for devices about something else is still a plain class game (#713)
  sent = [];
  const other = await buildIt(x, { start: { title: 'Water Cycle', grade: '4', topic: 'the water cycle' }, words: 'Make a grade 4 game about the water cycle', picks: { kind: 'game', use: 'devices', help: 'hints' } });
  assert.equal(sent.at(-1).plan.kind, undefined);
  assert.equal(K.canvasVersion(games.getVersion(other.current_version_id).html), null);
});

// ---------------------------------------------------------------- 2. saving again moves an older activity to the newest kit
const DATA = {
  config: { lang: 'en', support: 'guided', supports: ['guided', 'own'], count: 6, fresh: true, board: false },
  task: { title: 'Farm Sums: Carry the Ten', say: 'Add the numbers.' },
  problems: [{ tool: 'digits.add', a: 46, b: 29 }, { tool: 'digits.add', a: 58, b: 37 }],
  gen: { tool: 'digits.add', digits: 3 }, steps: {}, hints: {},
};
const page = (v, data = DATA) => `<title>Farm Sums: Carry the Ten</title>\n${K.canvasTag(v)}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data, null, 2)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
const OLD = '1.5.0';
function oldActivity(u) {
  const g = games.createGame(u.id, { title: 'Farm Sums: Carry the Ten', icon: '🐔', cover: 'mint' });
  for (let i = 0; i < 3; i++) games.addVersion(g.id, page(OLD), { notes: `Builder ${i + 1}`, createdBy: u.id, safetyStatus: 'pass' });
  return games.getGame(g.id);
}

test('2. upgradeCanvas: only the pinned tag moves to the newest kit; nothing to do on the newest or on a plain game', () => {
  const html = page(OLD), up = AD.upgradeCanvas(html);
  assert.equal(K.canvasVersion(up), K.CANVAS_LATEST);
  assert.equal(up.replace(K.canvasTag(), ''), html.replace(K.canvasTag(OLD), ''), 'the rest of the page is byte for byte the same');
  assert.deepEqual(K.activityData(up).data, DATA);
  assert.equal(AD.upgradeCanvas(up), null);
  assert.equal(AD.upgradeCanvas('<title>Quiz</title><p>hi</p>'), null);
  for (const v of Object.keys(K.CANVAS_VERSIONS).filter(v => v !== K.CANVAS_LATEST)) assert.equal(K.canvasVersion(AD.upgradeCanvas(page(v))), K.CANVAS_LATEST, v);
});

test('2. Save version on a 1.5.0 activity saves a version that loads the newest kit (it said "Saved as version 4." and kept 1.5.0)', async () => {
  const x = world();
  const g = oldActivity(x.teacher);
  assert.equal(studioState(x.teacher, g.id, tEn).activity.kit, OLD);
  const r = await post(`/api/studio/${g.id}/save`, { note: 'again' }, x.tc);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  assert.equal(j.message, 'Saved as version 4.');
  const v = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v.number, 4);
  assert.equal(K.canvasVersion(v.html), K.CANVAS_LATEST, 'the saved version\'s page loads the newest kit');
  assert.ok(v.html.includes(K.canvasTag()), 'with exactly the pinned tag');
  assert.deepEqual(K.activityData(v.html).data, DATA, 'its data is unchanged');
  assert.equal(v.safety_status, 'pass', 'scanned again, and it passes');
  assert.equal(j.state.activity.kit, K.CANVAS_LATEST, 'the panel now says it is on the newest kit');
  // a plain game's Save version is still a byte-for-byte copy
  const plain = games.createGame(x.teacher.id, { title: 'Plain' });
  const pv = games.addVersion(plain.id, '<title>Plain</title><p>Hello</p>', { notes: 'x', createdBy: x.teacher.id, safetyStatus: 'pass' });
  assert.equal((await post(`/api/studio/${plain.id}/save`, {}, x.tc)).status, 200);
  assert.equal(games.getVersion(games.getGame(plain.id).current_version_id).html, pv.html);
});

test('2. the Activity panel saves an older activity with no other change, onto the newest kit', async () => {
  const x = world();
  const g = oldActivity(x.teacher);
  const base0 = g.current_version_id;
  const r = await post(`/api/studio/${g.id}/activity`, { base: base0, data: { config: DATA.config, problems: DATA.problems, gen: DATA.gen }, changes: [{ k: 'kit' }] }, x.tc);
  assert.equal(r.status, 200, await r.clone().text());
  const j = await r.json();
  const v = games.getVersion(j.version.id);
  assert.equal(K.canvasVersion(v.html), K.CANVAS_LATEST);
  assert.equal(v.notes, `Activity panel: ${tEn('studio.activity.change.kit')}`);
  assert.ok(AD.CHANGE_KEYS.includes('kit'));
});

test('2. the Builder\'s own save of an older activity moves it to the newest kit', async () => {
  const x = world();
  const g = oldActivity(x.teacher);
  const tb = toolbox({ user: x.teacher, gameId: g.id, emit: () => {}, state: {}, locale: 'en' });
  const cur = tb.current();
  const r = await tb.exec('edit_game', { edits: [{ find: '"say": "Add the numbers."', replace: '"say": "Add the farm\'s eggs."' }], notes: 'Kinder words' });
  assert.equal(r.ok, true, r.forModel);
  assert.equal(K.canvasVersion(cur.html), OLD);
  assert.equal(K.canvasVersion(r.version.html), K.CANVAS_LATEST);
});

// ---------------------------------------------------------------- 3. build time: honest estimate, a round fewer, a log line
test('3. the first guess for a teacher\'s new build is not "1-2 minutes" (live builds took 199 s and 353 s)', () => {
  const b = eta.band(eta.defaults('ai:pro:new:2d'), 15 * 60e3);
  assert.ok(b.lo >= 2 && b.hi >= 5, JSON.stringify(b));
  assert.ok(b.hiMs >= 353e3, 'the slower live build is inside the range');
  // the chat card's words come from the build's own estimate; with none, they name no number
  assert.equal(CB.etaOf({ show: 'range', lo: 2, hi: 6, src: 'default' }).guess, true);
  assert.deepEqual(CB.etaOf({ show: 'range', lo: 1, hi: 3, src: 'data' }), { show: 'range', lo: 1, hi: 3, guess: false });
  assert.equal(CB.etaOf({ show: 'none' }), null);
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const t = tFor(code);
    assert.doesNotMatch(t('js.companion-build.usually'), /1\s*[-–]\s*2/, code);
    for (const k of ['usually', 'etaRange', 'etaGuess', 'etaUnder', 'studio.canvasLine.game']) assert.doesNotMatch(t(k.includes('.') ? k : `js.companion-build.${k}`), /—/, `${code} ${k}: no em dash`);
    assert.match(t('js.companion-build.etaRange', { time: 'T' }), /T/, code);
  }
});

test('3. the chat card reads the running build\'s estimate, and every build logs where its time went', async () => {
  const x = world();
  let resolve; const gate = new Promise(r => { resolve = r; });
  agent.registerProvider('a5slow', { async run(ctx) { await gate; return { model: 'a5slow', tokensIn: 0, tokensOut: 0 }; } });
  CB.hooks.provider = 'a5slow';
  const lines = [], write = process.stdout.write.bind(process.stdout);
  process.env.BRB_SILENT = '0';
  process.stdout.write = (s, ...a) => { if (String(s).includes('"builder build ended"')) { lines.push(JSON.parse(String(s))); return true; } if (String(s).startsWith('{"t":')) return true; return write(s, ...a); };
  try {
    standIn((p, i) => (i === 0 ? uses('startBuild', { title: 'Farm Carry Stars', grade: '4', topic: 'regrouping addition' }) : 'Sure!'));
    await say(x, 'Make Farm Carry Stars, a grade 4 game about regrouping addition');
    let bot = await lastBot(x.tc);
    if (bot.note.build.state === 'ask') { await tap(x, bot.id, 'buildPlan', JSON.stringify({ kind: 'game', use: 'devices', help: 'hints' })); bot = await lastBot(x.tc); }
    assert.equal((await tap(x, bot.id, 'buildGo', bot.note.build.words)).status, 200);
    const g = gamesOf(x.teacher).at(-1);
    for (let i = 0; i < 100 && !runner.jobFor(g.id); i++) await new Promise(r => setTimeout(r, 20));
    for (let i = 0; i < 100 && !(runner.jobFor(g.id) && runner.jobFor(g.id).est); i++) await new Promise(r => setTimeout(r, 20));
    const view = await (await get(`/api/companion/build/${g.id}`, x.tc)).json();
    const job = runner.jobFor(g.id);
    assert.ok(job && job.est, 'the build has its estimate');
    assert.ok('eta' in view, 'the card is sent the estimate');
    assert.deepEqual(view.eta, CB.etaOf(job.est.start), 'the card shows the build\'s own estimate');
    // what the card shows for an AI build's first guess (this stand-in is the building blocks: too quick for a line)
    assert.deepEqual(CB.etaOf(eta.estimate(eta.predict({ provider: 'claude', pro: true }), { capMs: 15 * 60e3 }).start), { show: 'range', lo: 2, hi: 6, guess: true });
  } finally { resolve(); await settle(gamesOf(x.teacher).at(-1)?.id); process.stdout.write = write; process.env.BRB_SILENT = '1'; CB.hooks.provider = 'a5'; }
  const line = lines.at(-1);
  assert.ok(line, 'a "builder build ended" line');
  for (const k of ['ms', 'rounds', 'modelMs', 'tests', 'testMs', 'plays', 'playMs', 'fixes', 'otherMs']) assert.equal(typeof line[k], 'number', k);
  assert.equal(line.canvas, true);
  assert.ok(!JSON.stringify(line).includes('Farm'), 'numbers only: no words from the build');
});
