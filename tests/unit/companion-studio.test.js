// The Builder in the chat, phase 3: Oomba in Studio (docs/decisions.md "Builder in the chat (phase 3): Oomba in Studio").
// With the companion's AI a stand-in (services/companion.js hooks.create) and the Builder a test provider:
//   - the 'game' page: only the teacher's own game, its version read on the server; another teacher's game is refused;
//   - a change message on Studio goes to THAT game's Builder, verbatim, without a tap (even a game not made in the chat);
//   - Studio's own buttons send their fixed words through the chat (POST /api/companion/build/studio);
//   - a teacher's Studio has the docked chat instead of the Builder column; a kid's Studio is as it always was.
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

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; CB.hooks.provider = null; PT.hooks.run = null; await J.idle(); server.close(); });
test.beforeEach(() => { RL._reset(); PT.hooks.run = PASS; });

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
function world() {
  const admin = createUser({ username: uname('CSAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Studio ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('CST'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];   // Teacher plan tools (the companion)
  const A = S.createClass({ id: teacher.id }, s.id, { name: '4b math', grade: '4' }).class;
  const kid = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Maya Brook', grade: '4' }).user;
  S.addToClass({ id: admin.id }, A.id, kid.id, 'student');
  return { s, teacher: getUser(teacher.id), kid: getUser(kid.id), A, tc: cookieFor(teacher.id), kc: cookieFor(kid.id) };
}
let aiCalls = [];
function standIn(script) {
  let answerStart = 0;
  CO.hooks.create = async params => {
    aiCalls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1);
    if (!(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result'))) answerStart = aiCalls.length - 1;
    const r = await script(params, aiCalls.length - 1 - answerStart);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
}
let tuN = 0;
const uses = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${++tuN}`, name, input }] });
const sayOn = async (x, text, page) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const settle = async gameId => { await J.idle(); await runner.idle(gameId); await J.idle(); };

const GAME = '<title>Regrouping Race</title><style>b{}</style><canvas></canvas><script>let s = 1; BRB.sfx.play("win"); BRB.gameOver({ won: true, score: 3 })</script>';
const PASS = async () => ({ end: true, kind: 'free', ms: 1200, score: 3, endHow: 'played' });
let sent = [];
agent.registerProvider('csgate', {
  async run(ctx) {
    sent.push({ text: ctx.text, game: ctx.game && ctx.game.id });
    ctx.steps.start('write');
    await ctx.tools.exec('write_game', { html: GAME, notes: 'Made the numbers bigger' });
    ctx.emit('text', { text: 'Done.' });
    return { model: 'csgate', tokensIn: 0, tokensOut: 0 };
  },
});
CB.hooks.provider = 'csgate';
/** A game the teacher made in Studio (not in the chat), with its first version. */
function studioGame(u, title = 'Fraction Pizza') {
  const g = games.createGame(u.id, { title });
  games.addVersion(g.id, GAME, { notes: 'First version', createdBy: u.id, safetyStatus: 'pass' });
  return games.getGame(g.id);
}
const jobsOf = u => q.all('SELECT * FROM oomba_jobs WHERE owner_id=? ORDER BY created_at, rowid', u.id);

test('the game page: only the teacher\'s own game, its version read on the server', () => {
  const x = world(), y = world();
  const g = studioGame(x.teacher), other = studioGame(y.teacher, 'Not yours');
  assert.deepEqual(CO.pageOf(x.teacher, { type: 'game', gameId: g.id, version: 99 }), { type: 'game', gameId: g.id, version: 1 }, 'the page\'s own version number is never taken');
  assert.deepEqual(CO.pageOf(x.teacher, { type: 'game', gameId: other.id }), { type: 'build' }, 'another teacher\'s game is refused');
  assert.deepEqual(CO.pageOf(x.teacher, { type: 'game', gameId: 'nope' }), { type: 'build' });
  assert.deepEqual(CO.pageOf(x.teacher, { type: 'game', gameId: '<script>' }), { type: 'build' });
  q.run("UPDATE games SET status='deleted' WHERE id=?", g.id);
  assert.equal(CO.pageOf(x.teacher, { type: 'game', gameId: g.id }).type, 'build', 'a deleted game is refused');
  // Building in the chat turned off for this teacher: no game page (and no docked chat in Studio).
  const h = studioGame(x.teacher, 'Off');
  q.run('UPDATE users SET builder_enabled=0 WHERE id=?', x.teacher.id);
  assert.equal(CO.pageOf(getUser(x.teacher.id), { type: 'game', gameId: h.id }).type, 'build');
  assert.equal(CB.docksIn(getUser(x.teacher.id), games.getGame(h.id)), false);
  q.run('UPDATE users SET builder_enabled=1 WHERE id=?', x.teacher.id);
});

test('a change message on Studio goes to that game\'s Builder, verbatim and without a tap', async () => {
  const x = world(); sent = []; aiCalls = [];
  const g = studioGame(x.teacher);
  const words = 'Make the pizza slices bigger and add a second level with sixths.';
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'last' }) : 'Sending that to the Builder now.'));
  await sayOn(x, words, { type: 'game', gameId: g.id, version: 1 });
  // The AI was told which game is open in Studio, with its version.
  assert.match(aiCalls[0].system, /open in Studio/);
  assert.match(aiCalls[0].system, new RegExp(`id ${g.id}, version 1`));
  const bot = await lastBot(x.tc);
  const job = bot.note.jobs.find(j => j.kind === 'game');
  assert.equal(job.gameId, g.id, 'this game (not made in the chat) is the one changed');
  assert.equal(job.mode, 'change'); assert.equal(job.base, 1);
  await settle(g.id);
  assert.equal(sent.length, 1); assert.equal(sent[0].text, words, 'the teacher\'s words, as written');
  const done = (await chatOf(x.tc)).turns.find(t => t.id === bot.id).note.jobs[0];
  assert.equal(done.state, 'done'); assert.equal(done.game.number, 2);
  assert.equal(games.getGame(g.id).current_version_id, done.game.versionId, 'version 2 is the game\'s newest');
  // The same message on another teacher's game page: the page is refused, so nothing goes to any Builder.
  // (a teacher with no game of their own in the chat, so changeGame has nothing to fall back on)
  const y = world(), z = world(); sent = [];
  const theirs = studioGame(y.teacher, 'Theirs');
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'Theirs' }) : 'ok'));
  await sayOn(z, 'Make it red', { type: 'game', gameId: theirs.id });
  await settle(theirs.id);
  assert.equal(sent.length, 0);
  assert.equal(jobsOf(z.teacher).length, 0);
  assert.equal(games.listVersions(theirs.id).length, 1);
  // And x, whose own game is in the chat: the refused page never sends to the other teacher's game.
  standIn((p, i) => (i === 0 ? uses('changeGame', { game: 'Theirs' }) : 'ok'));
  await sayOn(x, 'Make it red', { type: 'game', gameId: theirs.id });
  await settle(theirs.id); await settle(g.id);
  assert.equal(jobsOf(x.teacher).filter(j => JSON.parse(j.input).gameId === theirs.id).length, 0);
  assert.equal(games.listVersions(theirs.id).length, 1);
});

test('Studio\'s own buttons send their words through the chat to this game\'s Builder', async () => {
  const x = world(); sent = [];
  const g = studioGame(x.teacher);
  const r = await post('/api/companion/build/studio', { gameId: g.id, text: 'Make it a live game.' }, x.tc);
  assert.equal(r.status, 200, await r.clone().text());
  const turns = (await r.json()).chat.turns;
  assert.equal(turns.at(-2).role, 'me'); assert.equal(turns.at(-2).text, 'Make it a live game.');
  const job = turns.at(-1).note.jobs[0];
  assert.equal(job.kind, 'game'); assert.equal(job.gameId, g.id); assert.ok(!('input' in job));
  await settle(g.id);
  assert.deepEqual(sent.map(s => s.text), ['Make it a live game.']);
  // Not for another teacher's game, a kid or a game that is not there.
  const y = world();
  assert.equal((await post('/api/companion/build/studio', { gameId: g.id, text: 'x' }, y.tc)).status, 404);
  assert.equal((await post('/api/companion/build/studio', { gameId: g.id, text: 'x' }, x.kc)).status, 404);
  assert.equal((await post('/api/companion/build/studio', { gameId: 'nope', text: 'x' }, x.tc)).status, 404);
  assert.equal(sent.length, 1);
});

const dataOc = h => { const m = /data-oc="([^"]*)"/.exec(h); return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null; };
test('a teacher\'s Studio has the docked chat instead of the Builder column; a kid\'s Studio is unchanged', async () => {
  const x = world();
  const g = studioGame(x.teacher);
  const h = await (await get(`/studio/${g.id}`, x.tc)).text();
  assert.deepEqual(dataOc(h), { type: 'game', gameId: g.id, name: dataOc(h).name });
  assert.match(h, /<section class="st-dock" id="st-dock"/);
  assert.match(h, /<section class="st-chat" aria-label="[^"]*" hidden>/, 'the Builder column is hidden');
  assert.match(h, /class="studio-page studio-docked"/);
  assert.match(h, /\/js\/companion\.js/);
  assert.match(h, /"dock":true/);
  // Publish, Save, Versions, Settings, Share and the safety line stay.
  for (const id of ['st-publish', 'st-save', 'st-history', 'st-settings', 'st-share', 'st-safety', 'st-frame']) assert.match(h, new RegExp(`id="${id}"`), id);
  // Another studio page (the games list) and someone else's game: no bubble.
  assert.equal(dataOc(await (await get('/build', x.tc)).text())?.type, 'build', '/build is not a studio page');
  // A kid: no Oomba, the Builder column as it always was.
  const r = await post('/api/studio/new', {}, x.kc);
  const url = (await r.json()).url;
  const k = await (await get(url, x.kc)).text();
  assert.equal(dataOc(k), null, 'no Oomba for a kid');
  assert.doesNotMatch(k, /st-dock|studio-docked|"dock":true|\/js\/companion\.js/);
  assert.match(k, /<section class="st-chat" aria-label="[^"]*">/, 'the Builder column, shown');
  assert.match(k, /id="st-input"/); assert.match(k, /class="studio-page"/);
  // Building in the chat off (COMPANION_BUILD=0): the old Studio too.
  const was = config.companionBuild; config.companionBuild = false;
  try {
    const off = await (await get(`/studio/${g.id}`, x.tc)).text();
    assert.equal(dataOc(off), null); assert.doesNotMatch(off, /st-dock/);
  } finally { config.companionBuild = was; }
});
