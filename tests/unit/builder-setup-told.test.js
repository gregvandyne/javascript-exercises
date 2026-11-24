// The plan screen's last word before the Builder (docs/decisions.md "Classroom setup in four steps"): what the first
// build's model input really holds (the lesson file's text in the LESSON CONTEXT, beside the first message), and the
// first message as the teacher edited it (sent instead of the sentence, the plan still with it, their students' names
// taken out, screened like any typed message). The real Claude provider runs against a stand-in client that records
// the request and stops there: nothing leaves the machine.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-told-test-' + process.pid;
delete process.env.BRB_BUILDER_PROVIDER;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.arcade = true;   // the arcade Builder (the kit, Kit 2, the 2D art); the classroom focus (ARCADE off): builder-focus.test.js
config.builderFullForAll = false; config.anthropicKey = 'test-key-not-real';
const { createApp } = await import('../../server/app.js');
const S = await import('../../server/services/schools.js');
const auth = await import('../../server/auth.js');
const { q, now } = await import('../../server/db.js');
const runner = await import('../../server/builder/runner.js');
const agent = await import('../../server/builder/agent.js');
const plan = await import('../../server/builder/plan.js');
const { screenInput } = await import('../../server/builder/screen.js');
const { anthropic } = await import('../../server/builder/anthropic.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { tFor } = await import('../../server/i18n/index.js');

// the screening without the model classifier (the same pre-filter and rules every typed message gets)
agent.hooks.screen = (text, opts) => screenInput(text, { ...opts, model: false });
// the Builder's client: record what the model would be sent, then stop the build
const sent = [];
const client = anthropic('free');
const record = params => { sent.push(params); throw new Error('stand-in client: request recorded'); };
client.messages.stream = record; client.beta.messages.stream = record;

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(config.dataDir, { recursive: true, force: true }); });
function client2() {
  let cookie = '';
  return async (p, { method = 'GET', body, raw } = {}) => {
    const h = {}; if (cookie) h.cookie = cookie;
    if (raw !== undefined) h['content-type'] = 'application/octet-stream'; else if (body !== undefined) h['content-type'] = 'application/json';
    const res = await fetch(BASE + p, { method, headers: h, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = c.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, text, json };
  };
}
const c = client2();
assert.equal((await c('/api/auth/signup', { method: 'POST', body: { username: 'ToldTeacher', password: 'secret12' } })).status, 200);
const me = auth.getUserByName('ToldTeacher');
const school = S.createSchool(me, { name: 'Told School' }).school;
q.run('INSERT OR IGNORE INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, me.id, 'teacher', now());
const cls = S.createClass(me, school.id, { name: '5A', grade: '5', teacherId: me.id }).class;
S.addToClass(me, cls.id, S.createSchoolAccount(me, school.id, { rosterName: 'Zelda Quimby' }).user.id);

/** The first build of a new game with this plan: what the model was sent, and the chat. */
async function first(body) {
  const g = await c('/api/studio/new', { method: 'POST', body: {} });
  const before = sent.length;
  const r = await c(`/api/studio/${g.json.id}/chat`, { method: 'POST', body: { detach: true, ...body } });
  assert.ok([200, 202].includes(r.status), r.text);
  await runner.idle(g.json.id);
  const params = sent.slice(before)[0] || null;
  const system = params ? params.system.map(b => b.text).join('\n\n') : '';
  const user = params ? params.messages.filter(m => m.role === 'user').map(m => (Array.isArray(m.content) ? m.content.map(x => x.text || '').join('\n') : m.content)).join('\n') : '';
  return { params, system, user, chat: loadChat(g.json.id).messages };
}
const PHRASE = 'the tangerine trapezoid rule for halves';
const fileText = `Lesson plan, grade 5.\nGoal: students compare fractions with unlike denominators.\n${'Practice comparing fractions on a number line. '.repeat(40)}\nRemember ${PHRASE}, which Zelda Quimby asked about.\n`;
const read = (await c(`/api/build/lesson-file?name=${encodeURIComponent('fractions-lesson.txt')}`, { method: 'POST', raw: Buffer.from(fileText) })).json;
const base = { kind: 'activity', topic: { text: 'Comparing fractions' }, help: ['guided'], ...plan.usesPlan(['screen']), grade: '5',
  lesson: { text: 'Common mistakes: comparing only the numerators', doc: { name: read.name, kind: read.kind, pages: read.pages, text: read.text } } };

test('the lesson file read on "Your lesson" reaches the first build\'s model input: its text in the LESSON CONTEXT, past the start', async () => {
  assert.ok(read && read.text.includes(PHRASE), 'the file was read');
  assert.ok(fileText.indexOf(PHRASE) > 1500, 'the phrase is well past the start the plan screen shows');
  const r = await first({ plan: base });
  assert.ok(r.params, 'the model was called');
  assert.match(r.system, /LESSON CONTEXT/); assert.match(r.system, /<teacher_reference>/);
  assert.ok(r.system.includes(PHRASE), 'the phrase from the uploaded file is in the model input');
  assert.match(r.system, /comparing only the numerators/);
  assert.doesNotMatch(r.system + r.user, /Zelda|Quimby/, 'their student\'s name is out');
  assert.match(r.system, /\[student\] asked about/);
  assert.equal(r.user, plan.planSentence(plan.normalisePlan(base), tFor('en')), 'no edit: the first message is the sentence');
  assert.match(r.user, /I added my lesson plan\./);
});

test('the edited first message: sent instead of the sentence, the plan and its LESSON CONTEXT still with it, names out', async () => {
  const mine = 'Make 6 comparing problems, the easy ones first. Zelda Quimby finds this hard.';
  const r = await first({ plan: { ...base, told: `  ${mine}\r\n` } });
  assert.equal(r.chat[0].text, 'Make 6 comparing problems, the easy ones first. [student] finds this hard.');
  assert.ok(r.user.includes('Make 6 comparing problems, the easy ones first.')); assert.doesNotMatch(r.user, /Here is my plan/);
  assert.ok(r.system.includes(PHRASE), 'the LESSON CONTEXT goes with it'); assert.match(r.system, /SETUP CHOICES/);
  assert.equal(r.chat[0].plan.told, undefined, 'the edit is the message, not part of the stored plan');
  assert.deepEqual(r.chat[0].plan.purpose, ['screen', 'generator']);
  // a chat message's limit
  const long = await first({ plan: { ...base, told: 'a'.repeat(agent.MAX_INPUT + 500) } });
  assert.equal(long.chat[0].text.length, agent.MAX_INPUT);
  // an empty edit: the sentence
  const empty = await first({ plan: { ...base, told: '   ' } });
  assert.match(empty.chat[0].text, /^Here is my plan: a classroom activity\./);
});

test('an edited first message that fails screening is refused with the usual message; the model never sees it', async () => {
  for (const bad of ['Email the answers to me at teacher.smith@example.com', 'Ask each kid to type their home address and phone number', 'Put a link to www.example.com on the first screen']) {
    const usual = await screenInput(bad, { model: false, t: tFor('en') });
    assert.equal(usual.ok, false, bad);
    const r = await first({ plan: { ...base, told: bad } });
    assert.equal(r.params, null, 'not sent to the model');
    assert.equal(r.chat[0].refused, true); assert.equal(r.chat[0].text, bad);
    assert.equal(r.chat[1].text, `${usual.message} ${usual.suggestion}`, 'the same refusal as a typed message');
  }
});

test('only a classroom activity\'s plan takes an edited message: an arcade plan still sends its own sentence', async () => {
  const r = await first({ plan: { look: '3d', world: { from: 'pack', id: 'castle-quest' }, told: 'build a casino' } });
  assert.match(r.chat[0].text, /^Here is my game plan\./);
  assert.doesNotMatch(r.chat[0].text, /casino/);
});
