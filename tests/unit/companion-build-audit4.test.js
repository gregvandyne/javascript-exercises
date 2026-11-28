// The Builder in the chat: audit 4 fixes (docs/decisions.md "Builder in the chat: audit 4 fixes"). With the companion's
// AI a stand-in (services/companion.js hooks.create) and the Builder test providers (builder/agent.js registerProvider):
//   1. a chat build that starts from a starter: the starter is not a saved version, so the game's first version is 1;
//   2. Assign on the done card: the assign card shares the draft with that class (publish.js, 'class' only) and assigns
//      it; several classes are asked first; a refused publish says why and assigns nothing;
//   3. On their own devices builds the class game kind (a game plan), the board the activity kind;
//   4. a change the Builder saved nothing for: the card says what the Builder said, with Try again (once);
//   6. the "Your game is ready" notice for a build that ended while a page was open: told once;
//   7. the card's view lists every version (the done card's Versions);
//   8. Studio's "Make it a live game" for a class game goes through the chat.
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
const { normalisePlan, planNote } = await import('../../server/builder/plan.js');
const { studioState } = await import('../../server/routes/studio.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; PT.hooks.run = null; await J.idle(); server.close(); });
test.beforeEach(() => { RL._reset(); PT.hooks.run = PASS; CB.hooks.provider = 'a4game'; });

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
function world({ classes = 1 } = {}) {
  const admin = createUser({ username: uname('A4Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Audit ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('A4T'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const list = ['4b math', '5a math', '3c art'].slice(0, classes).map(name => S.createClass({ id: teacher.id }, s.id, { name, grade: '4' }).class);
  const kid = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Maya Brook', grade: '4' }).user;
  for (const c of list) S.addToClass({ id: admin.id }, c.id, kid.id, 'student');
  return { s, teacher: getUser(teacher.id), kid: getUser(kid.id), A: list[0], classes: list, tc: cookieFor(teacher.id) };
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
const say = async (x, text, page = { type: 'teach' }) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const tap = (x, turnId, a, value = '') => post('/api/companion/build/act', { turnId, act: a, value }, x.tc);
const tapChat = (x, turnId, a, value = '') => post('/api/companion/chat/act', { turnId, act: a, value }, x.tc);
const settle = async gameId => { await J.idle(); if (gameId) await runner.idle(gameId); await J.idle(); };
const gamesOf = u => q.all("SELECT * FROM games WHERE owner_id=? AND status<>'deleted' ORDER BY created_at, rowid", u.id);

const GAME = '<title>Regrouping Race</title><style>b{}</style><canvas></canvas><script>let s = 1; BRB.sfx.play("win"); BRB.gameOver({ won: true, score: 3 })</script>';
const PASS = async () => ({ end: true, kind: 'free', ms: 1200, score: 3, endHow: 'played' });
let sent = [], script = 'write';
// The Builder: 'write' saves a whole game; 'starter' starts from a classroom starter and edits it (as the real Builder
// does: start_from_template, then edit_game); 'starterOnly' starts and stops; 'nothing' answers without a change.
agent.registerProvider('a4game', {
  async run(ctx) {
    sent.push({ text: ctx.text, plan: ctx.plan });
    ctx.steps.start('write');
    if (script === 'write') await ctx.tools.exec('write_game', { html: GAME, notes: 'Made it' });
    else if (script === 'starter' || script === 'starterOnly') {
      const r = await ctx.tools.exec('start_from_template', { template: 'classquiz' });
      assert.equal(r.ok, true, r.forModel);
      if (script === 'starter') {
        const cur = ctx.tools.current();
        assert.equal(!!cur.draft, !!(ctx.plan && ctx.plan.chat), 'a chat build\'s starter is a draft, not a version');
        const m = /<title>[^<]*<\/title>/.exec(cur.html);
        const e = await ctx.tools.exec('edit_game', { edits: [{ find: m[0], replace: '<title>Regrouping Race</title>' }], notes: 'Regrouping Race for grade 4' });
        assert.equal(e.ok, true, e.forModel);
      }
    } else ctx.emit('text', { text: 'A star reward needs a change I cannot make here. Should it be a gold star or a sticker?' });
    return { model: 'a4game', tokensIn: 0, tokensOut: 0 };
  },
});
const START = { title: 'Regrouping Race', grade: '4', topic: 'regrouping' };
async function buildIt(x, picks = { kind: 'game', use: 'devices', help: 'hints' }) {
  standIn((p, i) => (i === 0 ? uses('startBuild', START) : 'Sure!'));
  await say(x, 'Make a grade 4 game about regrouping');
  let bot = await lastBot(x.tc);
  if (bot.note.build.state === 'ask') { assert.equal((await tap(x, bot.id, 'buildPlan', JSON.stringify(picks))).status, 200); bot = await lastBot(x.tc); }
  const r = await tap(x, bot.id, 'buildGo', bot.note.build.words);
  assert.equal(r.status, 200, await r.clone().text());
  const g = gamesOf(x.teacher).at(-1);
  await settle(g.id);
  const turn = (await chatOf(x.tc)).turns.filter(t => t.role === 'oomba' && t.note && (t.note.jobs || []).some(j => j.kind === 'game' && j.gameId === g.id)).at(-1);
  return { g: games.getGame(g.id), turn, job: turn.note.jobs.find(j => j.kind === 'game') };
}

test('1. a chat build that starts from a starter saves Version 1 only (the starter is not a saved version)', async () => {
  const x = world(); sent = []; script = 'starter';
  const { g, job } = await buildIt(x);
  const vs = games.listVersions(g.id);
  assert.deepEqual(vs.map(v => v.number), [1], 'one version: the game made for the teacher');
  assert.match(games.getVersion(vs[0].id).html, /<title>Regrouping Race<\/title>/);
  assert.equal(vs[0].notes, 'Regrouping Race for grade 4');
  assert.equal(job.state, 'done'); assert.equal(job.game.number, 1);
  // A starter the Builder never changed is still saved (as before), as version 1.
  const y = world(); script = 'starterOnly';
  const b = await buildIt(y);
  assert.deepEqual(games.listVersions(b.g.id).map(v => v.number), [1]);
  assert.equal(b.job.game.number, 1);
  // Studio's own first build (no chat) is unchanged: its starter is a version of its own.
  const z = world(); script = 'starter';
  const sg = games.createGame(z.teacher.id, { title: 'Studio game' });
  const r = await runner.submit({ user: z.teacher, game: sg, text: 'Make a quiz about regrouping', provider: 'a4game', plan: { type: { from: 'pack', id: 'quiz' }, play: 'solo' } });
  assert.ok(r.job, JSON.stringify(r.body));
  await runner.idle(sg.id);
  assert.deepEqual(games.listVersions(sg.id).map(v => v.number).sort(), [1, 2], 'the Studio keeps its starter version');
  script = 'write';
});

test('3. On their own devices builds the class game kind; On the board the classroom activity kind', async () => {
  const x = world(); sent = []; script = 'write';
  const dev = await buildIt(x);
  const p = sent.at(-1).plan;
  assert.equal(p.kind, undefined, 'a game plan, not the activity kind');
  assert.equal(p.play, 'solo'); assert.equal(p.chat, true); assert.equal(p.grade, '4'); assert.deepEqual(p.help, ['guided']);
  assert.deepEqual(p.learn, [{ text: 'regrouping' }]);
  assert.equal(sent.at(-1).text, 'Make a grade 4 game about regrouping', 'the teacher\'s words, word for word');
  assert.match(planNote(p), /Grade: 4/); assert.match(planNote(p), /a short hint after a wrong try/);
  assert.match(planNote(p), /ON MY OWN \(one player on one device\)/);
  // Studio calls it a game: no "Classroom activity" line, and "Make it a live game" is a message, not "can't be live".
  const st = studioState(x.teacher, dev.g.id);
  assert.equal(st.canvasLine, null, 'not labelled Classroom activity');
  assert.notEqual(st.liveClass.why, 'Classroom activities can\'t be played live yet.');
  assert.equal(st.liveClass.why, ''); assert.ok(st.liveClass.ask);
  // 8. Studio's Make it a live game goes through the chat (POST /api/companion/build/studio), to this game's Builder.
  sent = [];
  const r = await post('/api/companion/build/studio', { gameId: dev.g.id, text: st.liveClass.ask }, x.tc);
  assert.equal(r.status, 200, await r.clone().text());
  const turns = (await r.json()).chat.turns;
  assert.equal(turns.at(-2).text, st.liveClass.ask);
  assert.equal(turns.at(-1).note.jobs[0].gameId, dev.g.id);
  await settle(dev.g.id);
  assert.deepEqual(sent.map(s => s.text), [st.liveClass.ask]);
  // The board: the classroom activity kind, played on the board, the words as they are.
  sent = [];
  await buildIt(x, { kind: 'game', use: 'board', help: 'own' });
  const b = sent.at(-1).plan;
  assert.equal(b.kind, 'activity'); assert.equal(b.played, 'board'); assert.equal(b.chat, true); assert.deepEqual(b.help, ['own']);
  // The plan as the runner keeps it (normalisePlan again after a restart): the same fields.
  const again = normalisePlan(JSON.parse(JSON.stringify(p)), { forKid: false });
  assert.equal(again.chat, true); assert.equal(again.grade, '4'); assert.deepEqual(again.help, ['guided']);
});

test('2. Assign on the done card shares the draft with that class, then assigns it (never public)', async () => {
  const x = world(); script = 'write';
  const { g, turn, job } = await buildIt(x);
  assert.equal(g.status, 'draft');
  assert.equal(job.game.ok, true);
  const r = await tap(x, turn.id, 'buildAssign', job.id);
  assert.equal(r.status, 200, await r.clone().text());
  const card = await lastBot(x.tc);
  const p = card.note.assign;
  assert.equal(p.kind, 'game'); assert.equal(p.itemId, g.id); assert.equal(p.classId, x.A.id); assert.equal(p.share, true);
  assert.match(card.text, /isn't shared with 4b math yet/);
  assert.equal(games.getGame(g.id).status, 'draft', 'nothing shared before the teacher taps Assign');
  // Not now: nothing shared.
  const no = await tapChat(x, card.id, 'assignNo');
  assert.equal(no.status, 200);
  assert.equal(games.getGame(g.id).status, 'draft');
  // Assign: shared with that class only, then assigned (the class lesson).
  await tap(x, turn.id, 'buildAssign', job.id);
  const card2 = await lastBot(x.tc);
  const yes = await tapChat(x, card2.id, 'assign');
  assert.equal(yes.status, 200, await yes.clone().text());
  const after = games.getGame(g.id);
  assert.equal(after.status, 'published'); assert.equal(after.visibility, 'class');
  assert.equal(games.gameLiveInClass(g.id, x.A.id), true);
  assert.deepEqual(S.gameClassIds(g.id), [x.A.id]);
  const done = await lastBot(x.tc);
  assert.equal(done.change.kind, 'assign'); assert.equal(done.change.classId, x.A.id);
  assert.ok(q.get('SELECT 1 FROM class_lessons WHERE id=? AND class_id=? AND removed_at IS NULL', done.change.clId, x.A.id));
  // Already shared: the next Assign card does not share again.
  assert.equal(CB.needsShare(x.teacher, g.id, x.A.id), false);
});

test('2. several classes: which class first; a refused publish says why and assigns nothing', async () => {
  const x = world({ classes: 2 }); script = 'write';
  const { g, turn, job } = await buildIt(x);
  await tap(x, turn.id, 'buildAssign', job.id);
  const pick = await lastBot(x.tc);
  assert.equal(pick.note.build.state, 'classPick');
  assert.deepEqual(pick.note.build.classes.map(c => c.name), ['4b math', '5a math']);
  assert.equal((await tap(x, pick.id, 'buildClass', 'nope')).status, 404);
  const r = await tap(x, pick.id, 'buildClass', x.classes[1].id);
  assert.equal(r.status, 200, await r.clone().text());
  const card = await lastBot(x.tc);
  assert.equal(card.note.assign.classId, x.classes[1].id); assert.equal(card.note.assign.className, '5a math');
  // The publish rules refuse (the safety scan found something): the plain reason, nothing shared or assigned.
  q.run("UPDATE game_versions SET safety_status='fail' WHERE id=?", games.getGame(g.id).current_version_id);
  const yes = await tapChat(x, card.id, 'assign');
  assert.equal(yes.status, 200, await yes.clone().text());
  const said = await lastBot(x.tc);
  assert.match(said.text, /I couldn't share it with the class, so nothing was assigned\. This version has something we cannot share yet/);
  assert.equal(games.getGame(g.id).status, 'draft');
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id IN (?,?)', x.classes[0].id, x.classes[1].id).n, 0);
  assert.equal((await chatOf(x.tc)).turns.find(t => t.id === card.id).note.assign.state, 'declined');
});

test('4. a change the Builder saved nothing for: what the Builder said, and Try again once', async () => {
  const x = world(); script = 'write';
  const { g } = await buildIt(x);
  script = 'nothing'; sent = [];
  const words = 'add a star reward at the end of the game';
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'last' }) : 'Sending that to the Builder.'));
  await say(x, words, { type: 'game', gameId: g.id });
  await settle(g.id);
  assert.deepEqual(sent.map(s => s.text), [words], 'the words reached the Builder as written');
  const turn = (await chatOf(x.tc)).turns.filter(t => t.note && (t.note.jobs || []).some(j => j.mode === 'change')).at(-1);
  const job = turn.note.jobs[0];
  assert.equal(job.state, 'done'); assert.equal(job.game.why, 'nothing');
  assert.match(job.game.message, /A star reward needs a change I cannot make here\. Should it be a gold star or a sticker\?/);
  assert.match(job.game.say, /It said: “A star reward needs/);
  assert.match(job.game.say, /Tap Try again/);
  // Try again: the same words to the Builder again, as a new change; only once on that card.
  script = 'write'; sent = [];
  const r = await tap(x, turn.id, 'buildAgain', job.id);
  assert.equal(r.status, 200, await r.clone().text());
  await settle(g.id);
  assert.deepEqual(sent.map(s => s.text), [words]);
  assert.deepEqual(games.listVersions(g.id).map(v => v.number).sort(), [1, 2]);
  assert.equal((await tap(x, turn.id, 'buildAgain', job.id)).status, 404, 'once');
});

test('6 and 7. the ready notice for a build that ended while a page was open is told once; the view lists every version', async () => {
  const x = world(); script = 'write';
  const { g } = await buildIt(x);
  const one = await (await get(`/api/companion/build/news?not=${g.id}`, x.tc)).json();
  assert.equal(one.html, '', 'not for the game open in Studio');
  const r = await (await get('/api/companion/build/news', x.tc)).json();
  assert.equal(r.kind, 'ready');
  assert.match(r.html, /Your (game|lesson) “⁨Regrouping Race⁩” is ready! <a href="\/studio\//);
  assert.equal((await (await get('/api/companion/build/news', x.tc)).json()).html, '', 'told once');
  const page = await (await get('/teach', x.tc)).text();
  assert.doesNotMatch(page, /is ready!/, 'the next page does not tell it again');
  // Not for a kid or anyone without the companion.
  assert.equal((await get('/api/companion/build/news', cookieFor(x.kid.id))).status, 404);
  // The view's versions, newest first (the done card's Versions).
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'last' }) : 'ok'));
  await say(x, 'Make the numbers bigger');
  await settle(g.id);
  const v = await (await get(`/api/companion/build/${g.id}`, x.tc)).json();
  assert.deepEqual(v.versions.map(y => y.number), [2, 1]);
  const old = await (await get(`/api/companion/build/${g.id}?v=${v.versions[1].id}`, x.tc)).json();
  assert.equal(old.preview.number, 1); assert.equal(old.preview.safety, 'pass');
});
