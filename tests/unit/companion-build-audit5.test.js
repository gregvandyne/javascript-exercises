// The Builder in the chat and Studio: audit 5 fixes (docs/decisions.md "Builder in the chat and Studio: audit 5 fixes").
// Run the way the live site runs: the arcade side off (ARCADE=0), and the REAL Builder (builder/claude.js, the
// Anthropic provider) against a fake Messages API, with the automatic playtest's fix rounds (autotest.js hooks.raw),
// instead of a stand-in that saves once. The chat's own AI is a stand-in (services/companion.js hooks.create).
//   1. a first chat build is "Version 1 of 1" although the Builder saved its edit and then a fix round (it was 2 of 2,
//      or 3 of 3), and each change adds exactly one version;
//   2. the "is ready" notice says game to a teacher (it said lesson), in every locale;
//   3. a teacher's /build draft card has Play and Assign; Assign shares it with that class only, then assigns it;
//   4. Studio offers "Make it a live game" only where live play can work (never an offer that only refuses);
//   5. Studio says game for these games (the Canvas line, the Activity panel's button), in every locale.
process.env.ARCADE = '0';
await import('./_setup.js');
const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const http = await import('node:http');

// ---- a fake Messages API: each streamed call takes the next script entry (a list of blocks) -------------------------
const script = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const b = JSON.parse(body || '{}');
    if (!b.stream) {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text: JSON.stringify({ verdict: 'allow', category: 'none' }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
    }
    const blocks = script.shift() || [{ type: 'text', text: 'Done.' }];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const out = [];
    const ev = (name, data) => out.push(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: blk.text } }); }
      else { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${Math.random().toString(36).slice(2, 8)}`, name: blk.name, input: {} } }); ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(blk.input) } }); }
      ev('content_block_stop', { index: i });
    });
    ev('message_delta', { delta: { stop_reason: blocks.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } });
    ev('message_stop', {});
    res.end(out.join(''));
  });
});
await new Promise(r => fake.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;

const { config } = await import('../../server/config.js');
config.anthropicKey = 'sk-ant-test-fake';
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
const runner = await import('../../server/builder/runner.js');
const autotest = await import('../../server/builder/autotest.js');
const PT = await import('../../server/services/playthrough.js');
const { templateHtml } = await import('../../server/builder/catalog.js');
const { studioState, canvasLineState } = await import('../../server/routes/studio.js');
const { tFor, teacherT } = await import('../../server/i18n/index.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; PT.hooks.run = null; autotest.hooks.raw = null; await J.idle(); server.close(); fake.close(); });
test.beforeEach(() => { RL._reset(); PT.hooks.run = PASS; CB.hooks.provider = null; script.length = 0; });

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
function world({ classes = 1 } = {}) {
  const admin = createUser({ username: uname('A5Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Audit five ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('A5T'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const list = ['4b math', '5a math'].slice(0, classes).map(name => S.createClass({ id: teacher.id }, s.id, { name, grade: '4' }).class);
  const kid = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Maya Brook', grade: '4' }).user;
  for (const c of list) S.addToClass({ id: admin.id }, c.id, kid.id, 'student');
  return { s, teacher: getUser(teacher.id), kid: getUser(kid.id), A: list[0], classes: list, tc: cookieFor(teacher.id) };
}
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu5_${++tuN}`, name, input }] });
function standIn(fn) {
  let answerStart = 0, calls = 0;
  CO.hooks.create = async params => {
    const last = params.messages.at(-1);
    if (!(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result'))) answerStart = calls;
    const r = await fn(params, calls++ - answerStart);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
}
const say = async (x, text, page = { type: 'teach' }) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const tap = (x, turnId, a, value = '') => post('/api/companion/build/act', { turnId, act: a, value }, x.tc);
const settle = async gameId => { await J.idle(); if (gameId) await runner.idle(gameId); await J.idle(); };
const gamesOf = u => q.all("SELECT * FROM games WHERE owner_id=? AND status<>'deleted' ORDER BY created_at, rowid", u.id);
const PASS = async () => ({ end: true, kind: 'free', ms: 1200, score: 3, endHow: 'played' });

// ---- the automatic playtest's browser facts (autotest.js hooks.raw), as builder-autotest.test.js has them -----------
const shot = (at, moved, same = 0.2) => ({ at, t: 0, moved, same });
const good = (over = {}) => ({
  mode: 'autoplay', started: 'hook', startedAt: 1500, inputs: 40, playMs: 18000, errors: [], kitWarnings: [],
  s0: { hook: true, state: { scene: 'title', score: 0 }, nums: '0' },
  s1: { hook: true, state: { scene: 'play', score: 0 }, nums: '0' },
  readings: [{ hook: true, state: { scene: 'play', score: 10 }, nums: '10' }],
  s2: { hook: true, state: { scene: 'play', score: 30 }, nums: '30' },
  events: [{ type: 'brb:ready', t: 300 }], fps: 55,
  layout: [{ key: 'phone-landscape', label: 'Phone landscape', width: 844, height: 390, problems: [] }, { key: 'tablet-portrait', label: 'Tablet portrait', width: 820, height: 1180, problems: [] }],
  shots: [shot('title', null), shot('start', 0.4), shot('idle', 0.03), shot('play', 0.2), shot('play', 0.15)],
  ...over,
});
/** The playtest finds a real problem first (a fix round follows), then passes. */
function playtests(results) { let runs = 0; autotest.hooks.raw = async () => results[Math.min(runs++, results.length - 1)]; return () => runs; }
const BAD = good({ errors: ['TypeError: boom'] });
const tool = (name, input) => ({ type: 'tool_use', name, input });
const edit = (find, replace, notes) => tool('edit_game', { edits: [{ find, replace }], notes });

const START = { title: 'Farm Carry Stars', grade: '4', topic: 'regrouping' };
async function buildIt(x) {
  standIn((p, i) => (i === 0 ? uses('startBuild', START) : 'Sure!'));
  await say(x, 'Make a grade 4 game about regrouping for their own devices with hints');
  let bot = await lastBot(x.tc);
  if (bot.note.build.state === 'ask') { assert.equal((await tap(x, bot.id, 'buildPlan', JSON.stringify({ kind: 'game', use: 'devices', help: 'hints' }))).status, 200); bot = await lastBot(x.tc); }
  const r = await tap(x, bot.id, 'buildGo', bot.note.build.words);
  assert.equal(r.status, 200, await r.clone().text());
  const g = gamesOf(x.teacher).at(-1);
  await settle(g.id);
  const turn = (await chatOf(x.tc)).turns.filter(t => t.role === 'oomba' && t.note && (t.note.jobs || []).some(j => j.kind === 'game' && j.gameId === g.id)).at(-1);
  return { g: games.getGame(g.id), turn, job: turn.note.jobs.find(j => j.kind === 'game') };
}
/** The real Builder's first build: the starter, its first edit, then (the playtest found a problem) a fix round. */
async function realFirstBuild(x) {
  const { html } = await templateHtml('classquiz');
  const title = /<title>[^<]*<\/title>/.exec(html)[0];
  script.push(
    [tool('start_from_template', { template: 'classquiz' })],
    [edit(title, '<title>Farm Carry Stars</title>', 'Farm Carry Stars for grade 4')],
    [{ type: 'text', text: 'Your game is ready!' }],
    [edit('<title>Farm Carry Stars</title>', '<title>Farm Carry Stars!</title>', 'Fixed the error the playtest found')],
    [{ type: 'text', text: 'I fixed the error.' }],
  );
  const runs = playtests([BAD, good()]);
  const out = await buildIt(x);
  assert.ok(runs() >= 2, 'the playtest ran after the build and after the fix round');
  return out;
}

test('1. the real Builder: a first chat build is Version 1 of 1 (its fix round does not add one), each change adds one', async () => {
  const x = world();
  const { g, job } = await realFirstBuild(x);
  const vs = games.listVersions(g.id);
  assert.deepEqual(vs.map(v => v.number), [1], 'one version for one build (it was 1 and 2: the edit, then the fix round)');
  const v1 = games.getVersion(vs[0].id);
  assert.match(v1.html, /<title>Farm Carry Stars!<\/title>/, 'the version is the fixed game');
  assert.equal(v1.notes, 'Fixed the error the playtest found');
  assert.equal(job.state, 'done'); assert.equal(job.game.number, 1); assert.equal(job.game.ok, true);
  assert.equal(PT.resultOf(v1).status, 'pass', 'played again after the fix (the earlier page\'s playthrough was dropped)');
  const view = await (await get(`/api/companion/build/${g.id}`, x.tc)).json();
  assert.deepEqual(view.versions.map(v => v.number), [1], 'the card says Version 1 of 1');
  // The Builder's row counts one version for the build.
  assert.equal(q.get('SELECT versions FROM builder_turns WHERE game_id=? ORDER BY created_at DESC LIMIT 1', g.id).versions, 1);
  // A change by message (changeGame): the Builder edits, the playtest finds a problem, it fixes it: one more version.
  script.push(
    [edit('<title>Farm Carry Stars!</title>', '<title>Farm Carry Stars</title><style>body{font-size:20px}</style>', 'Bigger numbers')],
    [{ type: 'text', text: 'Bigger now.' }],
    [edit('body{font-size:20px}', 'body{font-size:22px}', 'Bigger numbers, fixed')],
    [{ type: 'text', text: 'Fixed.' }],
  );
  playtests([BAD, good()]);
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'last' }) : 'Sending that to the Builder.'));
  await say(x, 'Make the numbers bigger');
  await settle(g.id);
  assert.deepEqual(games.listVersions(g.id).map(v => v.number), [2, 1], 'the change added exactly one version');
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /font-size:22px/);
  const chg = (await chatOf(x.tc)).turns.filter(t => t.note && (t.note.jobs || []).some(j => j.mode === 'change')).at(-1).note.jobs[0];
  assert.equal(chg.game.number, 2);
  // Studio's own builds (no chat) keep a version per save, as before.
  const kidGame = games.createGame(x.teacher.id, { title: 'Studio game' });
  script.push([tool('write_game', { html: '<title>A</title><canvas></canvas><script>let s = 1; BRB.gameOver({ won: true, score: 3 })</script>', notes: 'First' })], [{ type: 'text', text: 'Ready' }],
    [edit('let s = 1', 'let s = 2', 'Fix')], [{ type: 'text', text: 'Fixed' }]);
  playtests([BAD, good()]);
  const r = await runner.submit({ user: x.teacher, game: kidGame, text: 'a counting game' });
  assert.ok(r.job, JSON.stringify(r.body));
  await runner.idle(kidGame.id);
  assert.deepEqual(games.listVersions(kidGame.id).map(v => v.number).sort(), [1, 2], 'Studio keeps every save');
});

test('1. a published version is never replaced: a change after it is one new version', async () => {
  const x = world();
  const { g } = await realFirstBuild(x);
  const v1 = games.getGame(g.id).current_version_id;
  q.run("UPDATE games SET status='published', visibility='class', published_version_id=? WHERE id=?", v1, g.id);
  script.push([edit('<title>Farm Carry Stars!</title>', '<title>Farm Carry Stars</title>', 'Calmer title')], [{ type: 'text', text: 'Done.' }],
    [edit('<title>Farm Carry Stars</title>', '<title>Farm Carry Stars 2</title>', 'Fix')], [{ type: 'text', text: 'Fixed.' }]);
  playtests([BAD, good()]);
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'last' }) : 'ok'));
  await say(x, 'Change the title');
  await settle(g.id);
  const vs = games.listVersions(g.id);
  assert.deepEqual(vs.map(v => v.number), [2, 1], 'the published version 1 is kept as it was; the change is one new version');
  assert.match(games.getVersion(v1).html, /<title>Farm Carry Stars!<\/title>/);
});

const GAME_WORD = { en: /\bgames?\b/i, ar: /لعب|ألعاب/i, de: /Spiel/i, es: /juego/i, fr: /jeu/i, he: /משחק/i, it: /gioc/i, ja: /ゲーム/i, nl: /game/i, pt: /jogo/i, ru: /игр/i, 'zh-Hant': /遊戲/i };
const LESSON_WORD = { en: /lesson/i, ar: /درس/, de: /Lektion/, es: /lecci/, fr: /leçon/, he: /שיעור/, it: /lezion/, ja: /レッスン/, nl: /\bles\b/, pt: /aula/, ru: /урок/, 'zh-Hant': /課程/ };

test('2. the ready notice says game to a teacher (it said lesson), in every locale', async () => {
  const x = world();
  await realFirstBuild(x);
  const r = await (await get('/api/companion/build/news', x.tc)).json();
  assert.equal(r.kind, 'ready');
  assert.match(r.html, /^Your game “⁨Farm Carry Stars⁩” is ready! <a href="\/studio\//);
  for (const lang of Object.keys(GAME_WORD)) {
    const tt = teacherT(tFor(lang));
    const ready = tt('layout.build.ready', { title: 'X', href: '/studio/x' }), many = tt('layout.build.many', { href: '/build' });
    assert.match(ready, GAME_WORD[lang], `${lang}: ${ready}`); assert.doesNotMatch(ready, LESSON_WORD[lang], `${lang}: ${ready}`);
    assert.match(many.replace(/<a [^>]*>.*<\/a>/, ''), GAME_WORD[lang], `${lang}: ${many}`);
    assert.doesNotMatch(ready + many, /—/, 'no em dashes');
  }
});

test('3. /build: a teacher\'s draft card has Play and Assign; Assign shares it with that class only, then assigns it', async () => {
  const x = world();
  const { g } = await realFirstBuild(x);
  assert.equal(g.status, 'draft');
  const html = await (await get('/build?view=all', x.tc)).text();
  const card = new RegExp(`<li class="mygame shelf-game" data-id="${g.id}"[\\s\\S]*?</li>`).exec(html);
  assert.ok(card, 'the card is on /build');
  assert.match(card[0], new RegExp(`href="/g/${g.slug}">[\\s\\S]*?Play`), 'Play opens its own page');
  assert.match(card[0], new RegExp(`href="/teach/assign\\?id=${g.id}"`), 'Assign');
  assert.match(card[0], /Edit/);
  // The owner plays the draft on its own page.
  assert.equal((await get(`/g/${g.slug}`, x.tc)).status, 200);
  // The Assign page says it shares it with the class picked first, and offers the class.
  const page = await (await get(`/teach/assign?id=${g.id}`, x.tc)).text();
  assert.match(page, /It isn&#39;t shared with a class yet\. Assign shares it only with the class you pick \(never with everyone\), then assigns it\./);
  assert.match(page, new RegExp(`<option value="${x.A.id}"`));
  assert.doesNotMatch(page, /Publish this game first/);
  const res = await post('/api/teach/assign-game', { gameId: g.id, classId: x.A.id }, x.tc);
  assert.equal(res.status, 200, await res.clone().text());
  const after = games.getGame(g.id);
  assert.equal(after.status, 'published'); assert.equal(after.visibility, 'class', 'shared with the class, never public');
  assert.deepEqual(S.gameClassIds(g.id), [x.A.id]);
  assert.ok(q.get("SELECT 1 FROM class_lessons cl JOIN lesson_steps s ON s.lesson_id=cl.lesson_id WHERE cl.class_id=? AND s.game_id=? AND cl.removed_at IS NULL", x.A.id, g.id));
  // A refused publish (the safety scan found something) says why and assigns nothing.
  const y = world();
  const b = await realFirstBuild(y);
  q.run("UPDATE game_versions SET safety_status='fail' WHERE id=?", b.g.current_version_id);
  const no = await post('/api/teach/assign-game', { gameId: b.g.id, classId: y.A.id }, y.tc);
  assert.equal(no.status, 400);
  assert.match((await no.json()).error, /nothing was assigned/);
  assert.equal(games.getGame(b.g.id).status, 'draft');
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id=?', y.A.id).n, 0);
  // A kid's draft on their /build: no Assign (kids never assign), Edit as before.
  const kg = games.createGame(x.kid.id, { title: 'Kid game' });
  games.addVersion(kg.id, '<title>Kid</title><p>hi</p>', { createdBy: x.kid.id, safetyStatus: 'pass' });
  q.run('UPDATE users SET builder_enabled=1 WHERE id=?', x.kid.id);
  const kh = await (await get('/build?view=all', cookieFor(x.kid.id))).text();
  const kc = new RegExp(`<li class="mygame shelf-game" data-id="${kg.id}"[\\s\\S]*?</li>`).exec(kh);
  if (kc) assert.doesNotMatch(kc[0], /teach\/assign/);
});

test('4. Studio offers "Make it a live game" only where live play can work', async () => {
  const x = world();
  const { g } = await realFirstBuild(x);
  config.liveClassroom = true;
  const st = studioState(x.teacher, g.id);
  // The arcade side off (as on the live site): a plain classroom game cannot be live, so no offer at all.
  assert.equal(st.liveClass.line, 'off'); assert.equal(st.liveClass.offer, false);
  // Where it can be (the arcade side on), the offer stays.
  config.arcade = true;
  try { const on = studioState(x.teacher, g.id); assert.equal(on.liveClass.offer, true); assert.equal(on.liveClass.why, ''); } finally { config.arcade = false; }
});

test('5. Studio says game for these games, in every locale', async () => {
  const { html } = await templateHtml('canvas');
  const cur = { html };
  const board = { html: html.replace(/"config"\s*:\s*\{/, '"config": { "board": true,') };
  const off = canvasLineState(cur, tFor('en'));
  assert.equal(off.label, 'Game · results go to Progress'); assert.equal(off.game, true); assert.equal(off.button, '');
  if (/"board"\s*:\s*true/.test(board.html)) assert.equal(canvasLineState(board, tFor('en')).label, 'Game · on the board');
  config.arcade = true;
  try {
    assert.equal(canvasLineState(cur, tFor('en')).label, 'Classroom activity · results go to Progress', 'arcade on, not from the chat: as before');
    assert.equal(canvasLineState(cur, tFor('en'), {}, { game: true }).label, 'Game · results go to Progress', 'a game made in the chat');
  } finally { config.arcade = false; }
  for (const lang of Object.keys(GAME_WORD)) {
    const t = tFor(lang);
    for (const k of ['studio.canvasLine.game', 'studio.canvasLine.gameBoard', 'js.studio.activityEditGame']) {
      assert.ok(t.own(k), `${lang}: ${k} is translated`);
      assert.match(t(k), GAME_WORD[lang], `${lang}: ${k} = ${t(k)}`); assert.doesNotMatch(t(k), /—/);
    }
    assert.ok(t.own('teach.assign.shareFirst'), `${lang}: teach.assign.shareFirst`);
  }
});
