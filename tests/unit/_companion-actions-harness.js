// The shared harness for Oomba's action cards (services/companion-actions/; tests/unit/companion-actions-<area>.test.js).
// Import it FIRST in an area's test file (it imports ./_setup.js), then:
//   const H = await import('./_companion-actions-harness.js'); H.boot();   // the app on a port, the stand-in AI
//   const x = H.world();      // { s, admin, teacher, tc (cookie), A, B (the teacher's classes), O (another teacher's), maya, leo (in A) }
//   const { calls, r, bot, card } = await H.ask(x, 'changeDue', { assignment: 'Word Hunt', due: '2026-12-04' }, page?, words?)
//        // the stand-in AI calls doAction once; r: its tool result; bot: Oomba's turn; card: bot.note.action (dressed)
//   const done = await H.doIt(x, bot, value?)   // Do it (asserts 200, a change of kind 'action' and verify ok) -> the change turn
//   await H.undo(x, done.id) ; await H.act(x, bot.id, 'actionNo')
//   await H.refused(x, action, params, /why/, page?)   // asserts a refusal that ends "Nothing was changed." and no card
//   H.storedTurns(x)          // the chat's stored turns (JSON text): assert nothing private is kept
//   H.sentToAi(calls)         // everything sent to the stand-in AI (JSON text): assert no name, password or code
// "[student 1]" in the words is the first student named in them (Maya Brook, Leo Stone are in A).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');

let server, base;
/** Seeds the catalog, starts the app, resets rate limits before each test. Call once at the top of a test file. */
export function boot() {
  seed({ quiet: true });
  test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
  test.after(async () => { CO.hooks.create = null; server.close(); });
  test.beforeEach(() => RL._reset());
}
export const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
export const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
export const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
export const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

export function world() {
  const admin = createUser({ username: uname('AcAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Chat Actions ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('AcT'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  // Oomba is for the Teacher plan's testers in tests (services/teacher-tools.js toolAccess).
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const A = S.createClass({ id: teacher.id }, s.id, { name: 'Room 12 Owls', grade: '3' }).class;
  const B = S.createClass({ id: teacher.id }, s.id, { name: 'Room 14 Foxes', grade: '4' }).class;
  const other = createUser({ username: uname('AcO'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, other.id, 'teacher', { rosterName: 'Ms Other' });
  const O = S.createClass({ id: other.id }, s.id, { name: 'Room 20 Bears', grade: '5' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name, grade: '3' }).user; S.addToClass({ id: admin.id }, c.id, u.id, 'student'); return getUser(u.id); };
  const maya = kid('Maya Brook', A), leo = kid('Leo Stone', A);
  return { s, admin, teacher: getUser(teacher.id), other: getUser(other.id), A: S.getClass(A.id), B: S.getClass(B.id), O: S.getClass(O.id), maya, leo, tc: cookieFor(teacher.id) };
}
/** The stand-in AI: script(params, i) -> a reply's text or a response. -> the list of what it was sent */
export function standIn(script) {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = await script(params, calls.length - 1);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
export const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 8)}`, name, input }] });
export const say = async (x, text, page) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
export const chatOf = async x => (await (await get('/api/companion/chat', x.tc)).json()).chat;
export const lastBot = async x => (await chatOf(x)).turns.filter(t => t.role === 'oomba').at(-1);
export const act = (x, turnId, a, value) => post('/api/companion/chat/act', { turnId, act: a, ...(value !== undefined ? { value } : {}) }, x.tc);
export const undo = async (x, turnId) => { const r = await post('/api/companion/chat/undo', { turnId }, x.tc); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
/** The tool result the AI got for its first call. */
export const resultOf = (calls, i = 1) => JSON.parse(calls[i].messages.at(-1).content[0].content);
export const storedTurns = x => (q.get("SELECT turns FROM oomba_chats WHERE owner_id=? AND surface='companion' AND ctx_key='main'", x.teacher.id) || {}).turns || '';
export const sentToAi = calls => JSON.stringify(calls);

export async function ask(x, action, params, page = { type: 'dashboard', classId: x.A.id }, words = 'Please do it') {
  const calls = standIn((p, i) => (i === 0 ? toolUse('doAction', { action, params }) : 'Tap Do it on the card.'));
  await say(x, words, page);
  const r = resultOf(calls);
  const bot = await lastBot(x);
  return { calls, r, bot, card: bot.note && bot.note.action };
}
export async function doIt(x, bot, value) {
  const res = await act(x, bot.id, 'actionDo', value);
  assert.equal(res.status, 200, await res.clone().text());
  const done = await lastBot(x);
  assert.equal(done.change && done.change.kind, 'action', JSON.stringify(done));
  assert.deepEqual(done.verify, { ok: true, landed: 1, notLanded: [] });
  return done;
}
export async function refused(x, action, params, re, page) {
  const { r, card } = await ask(x, action, params, page);
  assert.ok(r.error, `${action} should be refused: ${JSON.stringify(r)}`);
  assert.match(r.error, /Nothing was changed\.$/);
  if (re) assert.match(r.error, re);
  assert.equal(card, undefined, 'no card for a refusal');
  return r;
}
