// Points from the Oomba chat (docs/decisions.md "Points from the Oomba chat"; services/companion.js givePoint,
// pointPlan, awardPoints, undoPoints, dress; the scrubber's placeholders, builder/lesson.js scrub token). The teacher
// says "give Maya a point for teamwork" or "give the whole class a point for teamwork": the AI (a stand-in here) sees
// "[student 1]", never a name or an id, and the server maps the placeholder back to the student. One clear student and
// a known reason: given at once (the dashboard's own pointsAction: the history, Undo, the Google Classroom switch);
// anything unclear: a choice card, nothing given until a tap. Only a teacher who teaches and runs that class.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeClassroom } = await import('../support/fake-classroom.js');
const fake = await startFakeGoogle();
const room = await startFakeClassroom();
const KEY = 'c'.repeat(64); // a fake test key
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
process.env.GOOGLE_CLASSROOM = '1';
process.env.GOOGLE_TOKEN_KEY = KEY;
process.env.CLASSROOM_API_BASE = room.url;
const { config, parseTokenKey } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const GC = await import('../../server/services/gclassroom.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; server.close(); await fake.close(); await room.close(); });
const ON = { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true, googleTokenKey: parseTokenKey(KEY).key, classroomApiBase: room.url, googleClassroomScopes: 'read' };
test.beforeEach(() => { RL._reset(); Object.assign(config, ON); GC._forget(); });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const loc = r => r.headers.get('location');
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

/** A school; its teacher (Oomba: a tester) with class A (Maya Brook, Leo Stone, Ana Ruiz, Ana Bell) and class B (Omar
 *  Hale); another teacher's class C (Zed Quill). */
function world() {
  const admin = createUser({ username: uname('CPAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Chat Points ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const staff = name => { const u = createUser({ username: uname('CPT'), password: 'teach-pass-12345' }); S.addMember({ id: admin.id }, s.id, u.id, 'teacher', { rosterName: name }); return getUser(u.id); };
  const teacher = staff('Mr Teach'), other = staff('Ms Other');
  config.manipulativesUsers = [...(config.manipulativesUsers || []), teacher.username.toLowerCase(), other.username.toLowerCase()];
  const A = S.createClass({ id: teacher.id }, s.id, { name: 'Room 12 Owls', grade: '3' }).class;
  const B = S.createClass({ id: teacher.id }, s.id, { name: 'Room 14 Foxes', grade: '4' }).class;
  const Cc = S.createClass({ id: other.id }, s.id, { name: 'Room 9', grade: '2' }).class;
  S.updateSchool({ id: admin.id }, s.id, { settings: { googleDomains: ['dwes.test'] } });
  const kid = (name, c) => { const u = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name, grade: '3' }).user; S.addToClass({ id: admin.id }, c.id, u.id, 'student'); return getUser(u.id); };
  const maya = kid('Maya Brook', A), leo = kid('Leo Stone', A), anaR = kid('Ana Ruiz', A), anaB = kid('Ana Bell', A), omar = kid('Omar Hale', B), zed = kid('Zed Quill', Cc);
  return { s, admin, teacher, other, A: S.getClass(A.id), B: S.getClass(B.id), C: S.getClass(Cc.id), maya, leo, anaR, anaB, omar, zed, tc: cookieFor(teacher.id), oc: cookieFor(other.id) };
}
const NAMES = /Maya|Brook|Leo\b|Stone|Ana\b|Ruiz|Bell|Omar|Hale/;

/** The stand-in AI: script(params, i) -> a response, or a plain text answer. */
function standIn(script) {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = await script(params, calls.length - 1);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 8)}`, name, input }] });
/** One givePoint call, then a short answer. */
const givesPoint = (input, reply = 'Done! The card shows it, with Undo.') => standIn((p, i) => (i === 0 ? toolUse('givePoint', input) : reply));
const say = async (x, text, page, cookie = x.tc) => { const r = await post('/api/companion/chat', { text, page }, cookie); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); await CO.settledPosts(); return r.json(); };
const chatOf = async (cookie) => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(x => x.role === 'oomba').at(-1);
const act = (cookie, turnId, a, pick) => post('/api/companion/chat/act', { turnId, act: a, ...(pick ? { pick } : {}) }, cookie);
const mine = (c, u) => D.pointsMine(c, u.id);
const resultOf = (calls, i = 1) => JSON.parse(calls[i].messages.at(-1).content[0].content);

test('"give Maya a point for teamwork": the AI sees "[student 1]", never the name or an id; the placeholder maps back to Maya; given at once with a card', async () => {
  const x = world();
  const calls = givesPoint({ target: '[student 1]', reason: 'teamwork' });
  const j = await say(x, 'Give Maya a point for teamwork', { type: 'dashboard', classId: x.A.id });
  // What is kept and shown: the placeholder, not the name; which student it is stays on the server.
  const me = j.chat.turns.at(-1);
  assert.equal(me.text, `Give ${x.maya.display_name} a point for teamwork`, 'the teacher\'s page: the name back');
  assert.equal(me.meta._who, undefined, 'the page never gets the map');
  const row = q.get("SELECT turns FROM oomba_chats WHERE owner_id=? AND surface='companion'", x.teacher.id);
  assert.deepEqual(JSON.parse(row.turns).find(t => t.role === 'me').meta._who, { 1: [x.maya.id] }, 'kept on the server: ids only');
  assert.doesNotMatch(row.turns, NAMES, 'no name kept in the chat');
  // What the AI got: the placeholder, no name, no student id, no class name.
  const sent = JSON.stringify(calls);
  assert.doesNotMatch(sent, NAMES);
  for (const v of [x.maya.id, x.leo.id, x.maya.display_name, x.maya.username, 'Room 12 Owls']) assert.ok(!sent.includes(v), `never sent: ${v}`);
  assert.equal(calls[0].messages.at(-1).content, 'Give [student 1] a point for teamwork');
  assert.ok(calls[0].tools.some(t => t.name === 'givePoint'), 'a general tool');
  assert.deepEqual(resultOf(calls), { landed: [{ to: 'one student', reason: 'teamwork' }], notLanded: [], note: resultOf(calls).note });
  // Given: Maya's teamwork point, remembered like the dashboard's.
  assert.deepEqual(mine(x.A, x.maya).r, { teamwork: 1 });
  assert.equal(mine(x.A, x.leo).mine, 0);
  assert.equal(q.get('SELECT by_id FROM dash_point_awards WHERE class_id=? AND user_id=?', x.A.id, x.maya.id).by_id, x.teacher.id);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.point' AND target=?", x.A.id), 'audited');
  // The card: the name filled in by the server for the teacher's page, outside the AI's words, which have no name.
  const bot = await lastBot(x.tc);
  assert.equal(bot.text, 'Done! The card shows it, with Undo.');
  assert.equal(bot.change.kind, 'point'); assert.equal(bot.change.canUndo, true);
  assert.deepEqual(bot.change.items.map(i => [i.name, i.word, i.user]), [[x.maya.display_name, 'Teamwork', x.maya.id]]);
  assert.equal(bot.change.items[0].className, 'Room 12 Owls');
  // On the teacher's page the names come back (the current names on the class list), in their own words and in
  // Oomba's; what is kept and what the AI got stay the placeholder.
  const shownMe = (await chatOf(x.tc)).turns.find(t => t.role === 'me');
  assert.equal(shownMe.text, `Give ${x.maya.display_name} a point for teamwork`);
  assert.equal(shownMe.meta._who, undefined);
  const c1 = givesPoint({ target: '[student 1]', reason: 'focus' }, 'Done: [student 1] got a point for focus.');
  await say(x, 'Maya again, for focus', { type: 'class', classId: x.A.id });
  assert.equal(c1[0].messages.at(-1).content.split('\n').at(-1), '[student 1] again, for focus', 'the AI still gets only the placeholder');
  assert.doesNotMatch(JSON.stringify(c1), NAMES);
  for (const v of [x.maya.id, x.maya.display_name]) assert.ok(!JSON.stringify(c1).includes(v));
  const shown = (await chatOf(x.tc)).turns;
  assert.equal(shown.filter(t => t.role === 'me').at(-1).text, `${x.maya.display_name} again, for focus`);
  assert.equal(shown.at(-1).text, `Done: ${x.maya.display_name} got a point for focus.`, 'a placeholder in Oomba\'s words is dressed too');
  const kept = q.get("SELECT turns FROM oomba_chats WHERE owner_id=? AND surface='companion'", x.teacher.id).turns;
  assert.ok(!kept.includes(x.maya.display_name), 'stored with placeholders only');
  assert.match(kept, /Done: \[student 1\] got a point for focus\./);
  // Another teacher's page never gets this teacher's names (their own chat; dress only knows their own students).
  assert.equal(CO.namesIn('Give [student 1] a point', { 1: [x.maya.id] }, new Map()), 'Give [student 1] a point');
  await post('/api/companion/chat/undo', { turnId: shown.at(-1).id }, x.tc); await CO.settledPosts();
  // The next message: the same student keeps the same number; a new one gets the next.
  const c2 = givesPoint({ target: '[student 2]', reason: 'kindness' });
  await say(x, 'and maya again, then Leo Stone for kindness', { type: 'class', classId: x.A.id });
  assert.equal(c2[0].messages.at(-1).content.split('\n').at(-1), 'and [student 1] again, then [student 2] for kindness');
  assert.deepEqual(mine(x.A, x.leo).r, { kind: 1 });
  // Undo: the same as the dashboard's.
  const r = await post('/api/companion/chat/undo', { turnId: (await lastBot(x.tc)).id }, x.tc);
  assert.equal(r.status, 200); await CO.settledPosts();
  assert.equal(mine(x.A, x.leo).mine, 0); assert.deepEqual(mine(x.A, x.maya).r, { teamwork: 1 });
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='companion.point.undo' AND target=?", x.A.id));
});

test('the whole class: one point for the class (never one each), close words read as a reason, from any page with the page\'s class', async () => {
  const x = world();
  const calls = givesPoint({ target: 'class', reason: 'working together' });
  await say(x, 'give the whole class a point for working together', { type: 'dashboard', classId: x.A.id });
  assert.deepEqual(D.classPoints(x.A), { n: 1, r: { teamwork: 1 } });
  assert.equal(D.pointsAll(x.A).total, 0, 'no student got one');
  assert.equal(resultOf(calls).landed[0].to, 'the whole class');
  const bot = await lastBot(x.tc);
  assert.deepEqual(bot.change.items.map(i => [i.user, i.word]), [[null, 'Teamwork']]);
  // The student sees it in My points.
  assert.match(await (await get(`/class/${x.A.id}`, cookieFor(x.maya.id))).text(), /class="mp-tn"><b>1<\/b>/);
  // Undo takes back the class's point.
  assert.equal((await post('/api/companion/chat/undo', { turnId: bot.id }, x.tc)).status, 200);
  assert.deepEqual(D.classPoints(x.A), { n: 0, r: {} });
  for (const [w, k] of [['Kindness', 'kind'], ['hard work', 'effort'], ['team work', 'teamwork'], ['focused', 'focus'], ['good ideas', 'creative'], ['punctuality', '']]) assert.equal(CO.reasonOf(w), k, w);
});

test('a first name two students share: a choice card, nothing given until the teacher taps; the tap gives it, with Undo', async () => {
  const x = world();
  const calls = givesPoint({ target: '[student 1]', reason: 'kindness' }, 'Pick on the card.');
  await say(x, 'Give Ana a point for kindness', { type: 'class', classId: x.A.id });
  assert.doesNotMatch(JSON.stringify(calls), NAMES);
  assert.equal(resultOf(calls).waitingForTeacher, true); assert.equal(resultOf(calls).choose, 'student');
  assert.equal(mine(x.A, x.anaR).mine + mine(x.A, x.anaB).mine, 0, 'nothing given');
  let bot = await lastBot(x.tc);
  assert.equal(bot.change, undefined);
  assert.equal(bot.note.pick.need, 'student'); assert.equal(bot.note.pick.word, 'Kindness');
  assert.deepEqual(bot.note.pick.options.map(o => o.v).sort(), [x.anaR.id, x.anaB.id].sort(), 'only the two who match');
  assert.deepEqual(bot.note.pick.options.map(o => o.label).sort(), [x.anaR.display_name, x.anaB.display_name].sort());
  // A value not on the card is refused.
  assert.equal((await act(x.tc, bot.id, 'pick', x.leo.id)).status, 404);
  // Another teacher can't use this card.
  assert.equal((await act(x.oc, bot.id, 'pick', x.anaB.id)).status, 404);
  const r = await act(x.tc, bot.id, 'pick', x.anaB.id);
  assert.equal(r.status, 200); await CO.settledPosts();
  assert.deepEqual(mine(x.A, x.anaB).r, { kind: 1 }); assert.equal(mine(x.A, x.anaR).mine, 0);
  const chat = (await r.json()).chat;
  assert.equal(chat.turns.find(t => t.id === bot.id).note.pick.state, 'done');
  const given = chat.turns.at(-1);
  assert.deepEqual(given.change.items.map(i => i.name), [x.anaB.display_name]);
  // Tapping again gives nothing more.
  assert.equal((await act(x.tc, bot.id, 'pick', x.anaB.id)).status, 404);
  assert.equal(mine(x.A, x.anaB).mine, 1);
  // Undo.
  assert.equal((await post('/api/companion/chat/undo', { turnId: given.id }, x.tc)).status, 200);
  assert.equal(mine(x.A, x.anaB).mine, 0);
  // An unknown reason: the reasons card, then the tap gives it.
  givesPoint({ target: 'class', reason: 'punctuality' });
  await say(x, 'whole class point for punctuality', { type: 'class', classId: x.A.id });
  bot = await lastBot(x.tc);
  assert.equal(bot.note.pick.need, 'reason'); assert.equal(bot.note.pick.options.length, D.POINT_REASONS.length);
  assert.deepEqual(D.classPoints(x.A).n, 0);
  assert.equal((await act(x.tc, bot.id, 'pick', 'nonsense')).status, 404);
  assert.equal((await act(x.tc, bot.id, 'pick', 'focus')).status, 200);
  assert.deepEqual(D.classPoints(x.A), { n: 1, r: { focus: 1 } });
});

test('a name not in the class, or not the teacher\'s student: said calmly, nothing given', async () => {
  const x = world();
  // Omar is the teacher's student, in class B: on class A's dashboard he is not in this class.
  let calls = givesPoint({ target: '[student 1]', reason: 'focus' }, 'That student is not in this class, so I gave nothing.');
  await say(x, 'Give Omar a point for focus', { type: 'dashboard', classId: x.A.id });
  assert.match(resultOf(calls).error, /not in this class\. Nothing was given/);
  assert.equal(mine(x.B, x.omar).mine, 0);
  assert.equal((await lastBot(x.tc)).change, undefined);
  // Zed is another teacher's student: his name isn't the teacher's to know, so it isn't a placeholder: refused.
  calls = givesPoint({ target: 'Zed', reason: 'focus' });
  await say(x, 'Give Zed a point for focus', { type: 'class', classId: x.A.id });
  assert.match(resultOf(calls).error, /not a student placeholder/);
  assert.equal(mine(x.C, x.zed).mine, 0);
  // A placeholder number nobody wrote.
  calls = givesPoint({ target: '[student 9]', reason: 'focus' });
  await say(x, 'give a point for focus', { type: 'class', classId: x.A.id });
  assert.ok(resultOf(calls).error);
  assert.equal(D.pointsAll(x.A).total + D.classPoints(x.A).n, 0);
});

test('which class: the page\'s, else the student\'s only class of this teacher, else a class card; never a class the teacher can\'t run', async () => {
  const x = world();
  // From a page with no class: Omar is only in class B.
  givesPoint({ target: '[student 1]', reason: 'focus' });
  await say(x, 'Give Omar Hale a point for focus', { type: 'teach' });
  assert.deepEqual(mine(x.B, x.omar).r, { focus: 1 });
  // The whole class, two classes: a class card (the classes' names on the teacher's card only).
  const calls = givesPoint({ target: 'class', reason: 'listening' });
  await say(x, 'Give my class a point for listening', { type: 'teach' });
  assert.equal(resultOf(calls).choose, 'class');
  assert.doesNotMatch(JSON.stringify(calls), /Room 12|Room 14/, 'the AI never gets the class names here');
  const bot = await lastBot(x.tc);
  assert.deepEqual(bot.note.pick.options.map(o => o.label).sort(), ['Room 12 Owls', 'Room 14 Foxes']);
  assert.equal((await act(x.tc, bot.id, 'pick', x.C.id)).status, 404, 'not one of the card\'s classes');
  assert.equal((await act(x.tc, bot.id, 'pick', x.B.id)).status, 200);
  assert.deepEqual(D.classPoints(x.B), { n: 1, r: { listening: 1 } }); assert.equal(D.classPoints(x.A).n, 0);
  // Another teacher's class by id: refused.
  const c2 = givesPoint({ target: 'class', reason: 'focus', classRef: x.C.id });
  await say(x, 'Give the class a point', { type: 'teach' });
  assert.match(resultOf(c2).error, /Not a class this teacher can give points in/);
  assert.equal(D.classPoints(x.C).n, 0);
  // A teacher who no longer runs the class (taken off the school's staff) can't give points there.
  assert.equal(CO.mayPoint(x.teacher, x.A), true);
  q.run("UPDATE school_members SET role='student' WHERE school_id=? AND user_id=?", x.s.id, x.teacher.id);
  assert.equal(CO.mayPoint(getUser(x.teacher.id), x.A), false);
  assert.ok(CO.pointPlan(getUser(x.teacher.id), { page: { type: 'class', classId: x.A.id }, meta: {}, who: {} }, { target: 'class', reason: 'focus' }).error);
  q.run("UPDATE school_members SET role='teacher' WHERE school_id=? AND user_id=?", x.s.id, x.teacher.id);
  // The dashboard's hourly limit is shared: past it, nothing is given.
  for (let i = 0; i < CO.POINTS_PER_HOUR; i++) RL.allow(`dash-points:${x.teacher.id}`, CO.POINTS_PER_HOUR, 3600e3);
  const c3 = givesPoint({ target: 'class', reason: 'focus' });
  await say(x, 'Give the class a point for focus', { type: 'class', classId: x.A.id });
  assert.match(resultOf(c3).error, /Too many points/);
  assert.equal(D.classPoints(x.A).n, 0);
});

// ---------------------------------------------------------------- Google Classroom
async function connect(cookie, classId) {
  const r = await post('/api/google-classroom/connect', { back: classId, write: '1' }, cookie);
  assert.equal(r.status, 200);
  const start = await get((await r.json()).redirect, cookie);
  const flow = cookieOf(start, 'brb_gflow'); const to = new URL(loc(start));
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', `t${crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 10)}@dwes.test`);
  const cb = new URL(loc(await fetch(to, { redirect: 'manual' })));
  return get(cb.pathname + cb.search, `${cookie}; ${flow}`);
}
const announcements = () => room.calls.filter(z => z.method === 'POST' && /\/announcements$/.test(z.path));

test('Google Classroom: posted only when the class\'s switch is on (no names), and Undo takes the post back', async () => {
  const x = world();
  const sub = String(720000000000000000000n + BigInt(++n));
  const id = room.addCourse({ name: `Course ${n}`, students: [{ userId: sub, fullName: 'Maya Brook' }] });
  await connect(x.tc, x.A.id);
  assert.equal((await post(`/api/classes/${x.A.id}/google-classroom/link`, { courseId: id }, x.tc)).status, 200);
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', sub, x.maya.id, `${sub}@dwes.test`, 'dwes.test', Date.now());
  assert.equal((await post(`/api/classes/${x.A.id}/google-classroom/roster`, {}, x.tc)).status, 200);
  const n0 = announcements().length;
  // Off (the default): the point is given, nothing is posted.
  givesPoint({ target: 'class', reason: 'teamwork' });
  await say(x, 'give the whole class a point for teamwork', { type: 'dashboard', classId: x.A.id });
  assert.equal(D.classPoints(x.A).n, 1);
  assert.equal(announcements().length, n0);
  assert.equal((await lastBot(x.tc)).change.items[0].gc, false);
  // On: the same words as the dashboard's, no names.
  D.setPointsGc(x.teacher, x.A, true);
  givesPoint({ target: '[student 1]', reason: 'teamwork' });
  await say(x, 'give Maya a point for teamwork', { type: 'dashboard', classId: x.A.id });
  assert.equal(announcements().length, n0 + 1);
  const a = announcements().at(-1);
  assert.deepEqual(a.body, { text: 'You earned a point for teamwork! 🌟', state: 'PUBLISHED', assigneeMode: 'INDIVIDUAL_STUDENTS', individualStudentsOptions: { studentIds: [sub] } });
  const bot = await lastBot(x.tc);
  assert.equal(bot.change.items[0].gc, true);
  const posted = q.get("SELECT gc_id FROM dash_point_awards WHERE class_id=? AND user_id=? AND gc='posted'", x.A.id, x.maya.id).gc_id;
  assert.ok(room.announcements.has(posted));
  // Undo: the point and its post.
  assert.equal((await post('/api/companion/chat/undo', { turnId: bot.id }, x.tc)).status, 200);
  await CO.settledPosts();
  assert.ok(!room.announcements.has(posted), 'gone from Classroom');
  assert.equal(mine(x.A, x.maya).mine, 0);
});
