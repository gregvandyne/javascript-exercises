// Homeroom step 5b (docs/decisions.md "Homeroom: onboarding, Needs a look, Oomba follow-ups"; services/homeroom-look.js,
// services/homeroom-follow.js, services/homeroom-intro.js):
//   - Needs a look: each rule on its own (stuck with extra time stretching it, a hand up a long time, a question from home
//     waiting, several tries without getting there, a reading quiz under 60 %, work piling up after due), absent students
//     never on the list, Missed while away never counted as after due, alphabetical; Seen and Snooze today;
//   - who sees it: the class's teachers (and they mark it), an aide (reads only), a sub (live reasons only, first names),
//     refused to a student, a parent and another teacher; never on the projector;
//   - onboarding: the guide and the student's intro shown once, kept on the server, again on request;
//   - Oomba follow-ups: Finish class adds a card in the chat by rules (no AI call, no name in its words); nothing changes
//     until the teacher confirms a suggestion, which adds a part to the next school day's plan or a note to the area;
//   - the AI never gets a student's name, username or id (Needs a look's summary, the follow-up, the chat after it);
//   - deleting: the rows go with the account and the class.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const HV = await import('../../server/services/homeroom-live.js');
const HP = await import('../../server/services/homeroom-plan.js');
const HW = await import('../../server/services/homeroom-week.js');
const HA = await import('../../server/services/homeroom-aides.js');
const SB = await import('../../server/services/homeroom-sub.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const HR = await import('../../server/services/homeroom-reading.js');
const SUP = await import('../../server/services/homeroom-supports.js');
const NL = await import('../../server/services/homeroom-look.js');
const FU = await import('../../server/services/homeroom-follow.js');
const IN = await import('../../server/services/homeroom-intro.js');
const P = await import('../../server/services/progress.js');
const LIB = await import('../../server/services/library.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const games = await import('../../server/services/games.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; config.homeroomOnboarding = false; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, setCookie: r.headers.get('set-cookie') || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : (o.cookie || '') });

const boss = createUser({ username: 'FuBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Follow Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), aide = staff('Mr Aide'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const A = S.createClass(boss, oak.id, { name: 'Room 6A', grade: '4', teacherId: rivera.id }).class;
const E = S.createClass(boss, oak.id, { name: 'Room 6E', grade: '4', teacherId: rivera.id }).class;   // no students yet
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben, cleo, dev, eli, fay] = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Shah', 'Eli Moss', 'Fay Gold'].map(n => kidIn(A, n));
// a second class for the follow-ups (its own handouts and groups)
const F = S.createClass(boss, oak.id, { name: 'Room 6F', grade: '4', teacherId: rivera.id }).class;
const [gia, hal, ian, jo] = ['Gia Lopez', 'Hal Berg', 'Ian Cole', 'Jo Kent'].map(n => kidIn(F, n));
const KIDS = [ava, ben, cleo, dev, eli, fay, gia, hal, ian, jo];
const NAMES = /Ava|Stone|Ben\b|Hill|Cleo|Park|Dev\b|Shah|Eli\b|Moss|Fay\b|Gold|Gia\b|Lopez|Hal\b|Berg|Ian\b|Cole|Jo\b|Kent/;
const SECRETS = () => KIDS.flatMap(k => [k.id, k.username]);
assert.ok(HA.addStaff(rivera, A, aide.id).ok);
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon='🍕' WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-fu'), sudoku = made('Sudoku Garden', 'sudoku-garden-fu'), ladder = made('Word Ladder', 'word-ladder-fu'), bees = made('Counting Bees', 'counting-bees-fu');
made('Arithmetic Lab', 'arithmetic-lab');
const [stretch, onTrack, building] = H.roomOf(A.id).groups;
assert.ok(H.saveGroups(rivera, A, { groups: H.roomOf(A.id).groups, members: { [ava.id]: stretch.id, [ben.id]: stretch.id, [cleo.id]: building.id, [dev.id]: building.id, [eli.id]: onTrack.id } }).ok);
const [fStretch, fOnTrack, fBuilding] = H.roomOf(F.id).groups;
assert.ok(H.saveGroups(rivera, F, { groups: H.roomOf(F.id).groups, members: { [gia.id]: fStretch.id, [hal.id]: fStretch.id, [ian.id]: fBuilding.id } }).ok);
const API = id => `/api/homeroom/${id}`;
const listOf = (c = A) => NL.shown(c, NL.compute(c)).items;
const reasonsOf = (who, c = A) => (listOf(c).find(x => x.id === who.id) || { reasons: [] }).reasons.map(r => r.rule);
const stepOf = clId => q.get('SELECT s.id FROM class_lessons cl JOIN lesson_steps s ON s.lesson_id=cl.lesson_id WHERE cl.id=?', clId).id;
const DAY = 86400e3;

test('Needs a look, each rule: stuck (extra time stretches it), a hand up, a question from home, tries, a reading quiz, after due', async () => {
  // a question from home waiting over an hour (asked while class isn't live: the desk is "at home")
  assert.ok(AT.ask(eli, A, { kind: 'question', text: 'Which page?' }, now() - 2 * 3600e3).ok);
  assert.ok(AT.ask(fay, A, { kind: 'help' }, now() - 10 * 60e3).ok, 'ten minutes: not yet');
  assert.deepEqual(reasonsOf(eli), ['ask']); assert.deepEqual(reasonsOf(fay), []);
  // several tries on a lesson plan graded by Score, the best under half right
  const lesson = HL.saveLesson(rivera, { slug: 'arithmetic-lab', title: 'Fractions warm-up', base: M.defaults('arithmetic-lab', 5), versions: [] }).lesson;
  const lh = HL.handOutLesson(rivera, A, { lessonId: lesson.id, to: { kind: 'desk', id: ben.id }, grade: 'score' });
  assert.ok(lh.ok, JSON.stringify(lh));
  const cl = lh.classLessons[0].id, st = stepOf(cl);
  P.gameStarted(ben, cl, st); P.gameScore(ben, cl, st, 3);
  assert.deepEqual(reasonsOf(ben), [], 'one try: not yet');
  P.gameStarted(ben, cl, st);
  const tries = listOf().find(x => x.id === ben.id).reasons[0];
  assert.equal(tries.rule, 'tries'); assert.equal(tries.right, 3); assert.equal(tries.total, 10); assert.equal(tries.count, 2); assert.equal(tries.title, 'Fractions warm-up');
  // a reading quiz's first try under 60 %
  const book = LIB.books().find(b => b.pages.length >= 4 && (b.questions || []).length >= 3);
  const rd = HR.handOutReading(rivera, A, { bookId: book.id, to: { kind: 'desk', id: cleo.id } });
  assert.ok(rd.ok, JSON.stringify(rd));
  q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, marks, quiz_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    rd.classLesson.id, A.id, cleo.id, book.id, book.pages.length, book.pages.length, now(), '10000', now(), now(), now());
  const r1 = listOf().find(x => x.id === cleo.id).reasons;
  assert.equal(r1[0].rule, 'reading'); assert.equal(r1[0].right, 1); assert.equal(r1[0].total, 5); assert.equal(r1[0].read, false);
  q.run("UPDATE homeroom_reading SET marks='11100' WHERE class_lesson_id=? AND user_id=?", rd.classLesson.id, cleo.id);
  assert.deepEqual(reasonsOf(cleo), [], '3 of 5 is 60 %: not under');
  q.run("UPDATE homeroom_reading SET marks='10000' WHERE class_lesson_id=? AND user_id=?", rd.classLesson.id, cleo.id);
  // work piling up after due: three handouts past their due day
  const yesterday = new Date(now() - DAY).toISOString().slice(0, 10);
  for (const g of [pizza, sudoku]) assert.ok(HO.handOut(rivera, A, { gameId: g.id, to: { kind: 'desk', id: dev.id }, dueAt: yesterday }).ok);
  assert.deepEqual(reasonsOf(dev), [], 'two after due: not yet');
  assert.ok(HO.handOut(rivera, A, { gameId: ladder.id, to: { kind: 'desk', id: dev.id }, dueAt: yesterday }).ok);
  const od = listOf().find(x => x.id === dev.id).reasons[0];
  assert.equal(od.rule, 'overdue'); assert.equal(od.count, 3); assert.equal(od.key, 'n3');
  // live class: stuck for 3 minutes, a hand up for 4
  assert.ok(H.setLive(rivera, A, 'start').ok);
  const b0 = now() - HV.STUCK_MS - 60e3;
  q.run('UPDATE homeroom_rooms SET live_at=? WHERE class_id=?', b0 - 1000, A.id);
  const g1 = HO.handOut(rivera, A, { gameId: bees.id, to: { kind: 'desk', id: ava.id } });
  for (let at = b0; at < now(); at += 10000) HV.pulse(ava, A, { where: 'game', on: g1.classLesson.id, idle: 30 }, at);
  HV.pulse(ava, A, { where: 'game', on: g1.classLesson.id, idle: 30 });
  const stuck = listOf().find(x => x.id === ava.id).reasons[0];
  assert.equal(stuck.rule, 'stuck'); assert.equal(stuck.live, true); assert.equal(stuck.title, 'Counting Bees'); assert.ok(stuck.minutes >= 3);
  // extra time 2x: 4 minutes isn't stuck for them yet
  assert.ok(SUP.setSupport(rivera, A, ava.id, { time: 200 }).ok);
  assert.deepEqual(reasonsOf(ava), [], 'with extra time 2x, 6 minutes');
  const item = NL.compute(A).find(x => x.id === ava.id);
  assert.equal(item, undefined);
  assert.ok(SUP.setSupport(rivera, A, ava.id, { time: 100 }).ok);
  // a hand up with a question for 5 minutes
  HV.pulse(fay, A, { where: 'desk', idle: 2 });
  assert.ok(HV.raiseHand(fay, A, 'question').ok);
  assert.ok(!reasonsOf(fay).includes('hand'), 'just raised');
  q.run('UPDATE homeroom_live SET hand_at=? WHERE class_id=? AND user_id=?', now() - 5 * 60e3, A.id, fay.id);
  assert.ok(reasonsOf(fay).includes('hand'));
  // alphabetical, never ranked
  const names = listOf().map(x => x.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('absent students are never on the list; Missed while away is never after due by itself', () => {
  // Dev marked absent today: off the list though three handouts are after due
  assert.ok(reasonsOf(dev).includes('overdue'));
  assert.ok(AT.mark(rivera, A, dev.id, 'absent').ok);
  assert.equal(listOf().find(x => x.id === dev.id), undefined, 'absent: never flagged');
  assert.ok(AT.mark(rivera, A, dev.id, '').ok);
  // the same handouts given on a day he was absent: Missed while away, so not after due
  const ids = HO.boardView(A).desks[dev.id].filter(x => x.late).map(x => x.id);
  assert.equal(ids.length, 3);
  const given = now() - 2 * DAY;
  for (const id of ids) q.run('UPDATE homeroom_handouts SET created_at=? WHERE class_lesson_id=?', given, id);
  q.run("INSERT INTO homeroom_attendance(class_id, user_id, day, zone, status, by_kind, set_by, at) VALUES (?,?,?,?,?,?,?,?)", A.id, dev.id, AT.localDay('UTC', given), 'UTC', 'absent', 'teacher', rivera.id, given);
  assert.ok(!reasonsOf(dev).includes('overdue'), 'missed while away: not after due');
  q.run('DELETE FROM homeroom_attendance WHERE class_id=? AND user_id=?', A.id, dev.id);
  assert.ok(reasonsOf(dev).includes('overdue'));
});

test('Seen hides one reason until it changes; Snooze today hides the student until the next school day', () => {
  const od = listOf().find(x => x.id === dev.id).reasons.find(r => r.rule === 'overdue');
  assert.ok(NL.mark(rivera, A, { studentId: dev.id, state: 'seen', rule: 'overdue', key: od.key }).ok);
  assert.equal(listOf().find(x => x.id === dev.id), undefined);
  assert.equal(NL.shown(A, NL.compute(A)).hidden >= 1, true);
  // one more after due: a new key, back on the list
  assert.ok(HO.handOut(rivera, A, { gameId: bees.id, to: { kind: 'desk', id: dev.id }, dueAt: new Date(now() - DAY).toISOString().slice(0, 10) }).ok);
  assert.equal(listOf().find(x => x.id === dev.id).reasons[0].key, 'n4');
  // Snooze today
  assert.ok(NL.mark(rivera, A, { studentId: eli.id, state: 'snooze' }).ok);
  assert.equal(listOf().find(x => x.id === eli.id), undefined);
  assert.ok(NL.shown(A, NL.compute(A), now() + DAY).items.some(x => x.id === eli.id), 'back the next day');
  // back on the list at once
  assert.ok(NL.mark(rivera, A, { studentId: eli.id, state: '' }).ok);
  assert.ok(listOf().some(x => x.id === eli.id));
  // checks
  assert.equal(NL.mark(rivera, A, { studentId: eli.id, state: 'seen', rule: 'nope', key: 'x' }).code, 'badAction');
  assert.equal(NL.mark(rivera, A, { studentId: 'nobody', state: 'snooze' }).code, 'notInClass');
  assert.equal(NL.mark(aide, A, { studentId: eli.id, state: 'snooze' }).code, 'forbidden');
  assert.equal(NL.mark(other, A, { studentId: eli.id, state: 'snooze' }).code, 'notFound');
});

test('who sees Needs a look: the teacher and an aide (read only), a sub only live reasons with first names; never a student, a parent, another teacher or the projector', async () => {
  const t1 = await as(rivera)(`${API(A.id)}/needs`);
  assert.equal(t1.status, 200); assert.equal(t1.json.may, true); assert.ok(t1.json.items.length >= 4);
  assert.ok(t1.json.items.some(x => x.name === 'Ben Hill'));
  const a1 = await as(aide)(`${API(A.id)}/needs`);
  assert.equal(a1.status, 200); assert.equal(a1.json.may, false); assert.deepEqual(a1.json.items.map(x => x.id), t1.json.items.map(x => x.id));
  assert.equal((await as(aide)(`${API(A.id)}/needs`, { body: { studentId: ben.id, state: 'snooze' } })).status, 403, 'an aide never marks it');
  const m = await as(rivera)(`${API(A.id)}/needs`, { body: { studentId: ben.id, state: 'snooze' } });
  assert.equal(m.status, 200); assert.ok(!m.json.items.some(x => x.id === ben.id)); assert.match(m.json.toast, /Snoozed/);
  assert.ok((await as(rivera)(`${API(A.id)}/needs`, { body: { studentId: ben.id, state: '' } })).json.items.some(x => x.id === ben.id));
  for (const who of [ava, other]) assert.equal((await as(who)(`${API(A.id)}/needs`)).status, 404);
  const mom = createUser({ username: 'FuMom', password: 'grownpass12345', accountType: 'grownup' });
  assert.equal((await as(mom)(`${API(A.id)}/needs`)).status, 404, 'a parent');
  assert.equal((await as(null)(`${API(A.id)}/needs`)).status, 404, 'signed out');
  // the pulse carries it while live (the teacher's board)
  const pl = await as(rivera)(`${API(A.id)}/pulse`);
  assert.ok(pl.json.needs.items.some(x => x.id === ava.id && x.reasons.some(r => r.rule === 'stuck')));
  // the board's page data has it; the projector's page and poll never
  const pg = await as(rivera)(`/class/${A.id}/homeroom`);
  assert.match(pg.text, /"needs":\{"items":\[/);
  const pj = await as(rivera)(`/class/${A.id}/homeroom/projector`), ps = await as(rivera)(`${API(A.id)}/state`);
  for (const x of [pj.text, ps.text]) { assert.ok(!/"needs"|Needs a look|"reasons"/.test(x)); assert.ok(!NAMES.test(x.replace(/Room 6A/g, ''))); }
  // a student's desk and state never carry it
  const desk = await as(ava)(`/api/desk/${A.id}/state`);
  assert.ok(!/"needs"|"reasons"/.test(desk.text));
  // a sub: stuck and hand only, first names
  const link = SB.createLink(rivera, A, {});
  const ck = ((await call(`/sub/${link.token}`)).setCookie.match(/hr_sub=[^;]*/) || [''])[0];
  const st = (await call('/api/sub/state', { cookie: ck })).json;
  const rules = new Set(st.needs.flatMap(x => x.reasons.map(r => r.rule)));
  assert.ok(rules.has('stuck') && rules.has('hand')); for (const r of ['tries', 'reading', 'overdue', 'ask']) assert.ok(!rules.has(r), `a sub never sees ${r}`);
  assert.ok(st.needs.every(x => !/ /.test(x.name)), 'first names'); assert.ok(st.needs.some(x => x.name === 'Ava'));
  assert.ok(st.needs.every(x => x.reasons.every(r => !('title' in r))), 'no handout titles or progress');
  assert.equal((await call(`${API(A.id)}/needs`, { cookie: ck })).status, 403, 'the teacher\'s list is not a sub\'s');
});

test('onboarding: the guide once per teacher (kept on the server), Show me around again; the student\'s intro once', async () => {
  config.homeroomOnboarding = true;
  try {
    const p1 = await as(rivera)(`/class/${A.id}/homeroom`);
    assert.match(p1.text, /"tour":true/);
    assert.match((await as(rivera)(`/class/${E.id}/homeroom`)).text, /"joinCode":"[^"]+"/, 'the empty class\'s first step has its join code');
    assert.equal((await as(rivera)(`${API(A.id)}/tour`, { body: { done: true } })).status, 200);
    assert.equal(IN.seen(rivera, 'tour'), true);
    assert.match((await as(rivera)(`/class/${E.id}/homeroom`)).text, /"tour":false/, 'once per teacher, every class');
    assert.equal((await as(other)(`${API(A.id)}/tour`, { body: { done: true } })).status, 404, 'another teacher');
    // an aide gets no guide (their page has neither)
    assert.ok(!/"tour":/.test((await as(aide)(`/class/${A.id}/homeroom`)).text));
    assert.equal((await as(aide)(`${API(A.id)}/tour`, { body: { done: true } })).status, 403);
    // again on request (the server forgets it only when asked)
    assert.equal((await as(rivera)(`${API(A.id)}/tour`, { body: { done: false } })).json.seen, false);
    assert.match((await as(rivera)(`/class/${A.id}/homeroom`)).text, /"tour":true/);
    await as(rivera)(`${API(A.id)}/tour`, { body: { done: true } });
    // the student's intro card
    assert.match((await as(cleo)(`/class/${A.id}/desk`)).text, /"intro":true/);
    assert.equal((await as(cleo)(`/api/desk/${A.id}/intro`, { body: { done: true } })).status, 200);
    assert.match((await as(cleo)(`/class/${A.id}/desk`)).text, /"intro":false/);
    assert.equal((await as(rivera)(`/api/desk/${A.id}/intro`, { body: { done: true } })).status, 404, 'a teacher has no desk');
    assert.equal(IN.setSeen(cleo, 'nope').code, 'badAction');
  } finally { config.homeroomOnboarding = false; }
  assert.match((await as(ben)(`/class/${A.id}/desk`)).text, /"intro":false/, 'off with HOMEROOM_ONBOARDING=0');
});

test('Needs a look summed up by Oomba: placeholders only, the names back in the browser (the turn\'s who)', async () => {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1), after = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base0 = { model: params.model, usage: { input_tokens: 1, output_tokens: 1 } };
    if (after) return { ...base0, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Student A is stuck on Counting Bees: look at their desk. Student B has a few tries on the warm-up.' }] };
    return { ...base0, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu_needs', name: 'needsLook', input: {} }] };
  };
  const r = await as(rivera)('/api/companion/chat', { body: { text: 'Who needs a look today?', page: { type: 'homeroom', classId: A.id } } });
  assert.equal(r.status, 200, r.text); await C.allSettled();
  const sent = JSON.stringify(calls);
  assert.ok(calls.length >= 2);
  assert.match(sent, /Student A/);
  assert.ok(!NAMES.test(sent), 'no student name reaches the AI');
  for (const s of SECRETS()) assert.ok(!sent.includes(s), 'no username or id reaches the AI');
  const res = JSON.parse(calls[1].messages.at(-1).content.find(c => c.type === 'tool_result').content);
  assert.ok(res.students.length >= 4); assert.ok(res.students.every(x => /^Student [A-Z]\d*$/.test(x.student)));
  const turn = (await as(rivera)('/api/companion/chat')).json.chat.turns.filter(x => x.role === 'oomba').at(-1);
  assert.match(turn.text, /Student A/, 'the stored words keep the placeholder');
  assert.equal(turn.note.who['Student A'], listOf()[0].id, 'which placeholder is which student, for the page');
  assert.ok(!NAMES.test(turn.text));
  CO.hooks.create = null;
});

test('Oomba follow-ups: Finish class offers a card by rules (no AI call, no names); suggestions change nothing until confirmed', async () => {
  const calls = [];
  CO.hooks.create = async params => { calls.push(JSON.parse(JSON.stringify(params))); return { model: params.model, usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Noted.' }] }; };
  // a day plan per group, used and run, then Finish class
  const plan = HP.cleanPlan(rivera, F, { name: 'Fractions day', parts: [{ kind: 'slides', minutes: 5, title: 'Fractions' },
    { kind: 'work', minutes: 15, title: 'Pizza time', groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Building', gameId: sudoku.id }, { group: 'On track', gameId: ladder.id }] }] }).plan;
  const used = HP.usePlan(rivera, F, plan);
  assert.ok(used.ok, JSON.stringify(used));
  assert.ok(HP.runAction(rivera, F, 'start').ok); assert.ok(HP.runAction(rivera, F, 'next').ok);
  // Gia finished hers; the rest did not
  const ho = HP.todayOf(F).parts[1].handouts;
  const giaCard = HO.boardView(F).desks[gia.id].find(k => ho.includes(k.id));
  P.gameTime(gia, giaCard.id, stepOf(giaCard.id), 60); P.gameTime(gia, giaCard.id, stepOf(giaCard.id), 60);
  // Hal has several tries on a Score lesson plan, so he is on Needs a look
  const lesson = HL.saveLesson(rivera, { slug: 'arithmetic-lab', title: 'Times warm-up', base: M.defaults('arithmetic-lab', 7), versions: [] }).lesson;
  const lh = HL.handOutLesson(rivera, F, { lessonId: lesson.id, to: { kind: 'desk', id: hal.id }, grade: 'score' });
  const lcl = lh.classLessons[0].id, lst = stepOf(lcl);
  P.gameStarted(hal, lcl, lst); P.gameStarted(hal, lcl, lst); P.gameScore(hal, lcl, lst, 2);
  const weekRows = () => q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE class_id=?', F.id).n;
  const before = { rows: weekRows(), handouts: HO.openCount(F.id), area: JSON.stringify(H.roomOf(F.id).area) };
  const fin = await as(rivera)(`${API(F.id)}/plan`, { body: { action: 'finish' } });
  assert.equal(fin.status, 200, fin.text); assert.equal(fin.json.follow, true); assert.ok(fin.json.summary);
  assert.equal(calls.length, 0, 'the card is made by rules, with no AI call');
  assert.deepEqual({ rows: weekRows(), handouts: HO.openCount(F.id), area: JSON.stringify(H.roomOf(F.id).area) }, before, 'offering changes nothing');
  const chat = (await as(rivera)('/api/companion/chat')).json.chat;
  const turn = chat.turns.filter(x => x.role === 'oomba').at(-1), f = turn.note.follow;
  assert.ok(f, 'the follow-up card'); assert.ok(!NAMES.test(turn.text), 'its words have no names');
  assert.ok(!NAMES.test(JSON.stringify(f)), 'the card holds counts and ids, never names (the page puts them in)');
  assert.equal(f.counts.of, 4); assert.equal(f.counts.finished, 1); assert.equal(f.counts.allDone, 1); assert.equal(f.counts.partsTotal, 2); assert.equal(f.counts.partsDone, 1, 'the part on at Finish class is cut short');
  assert.deepEqual(f.look, [hal.id], 'who might need a look: ids');
  const kinds = f.sug.map(s => s.kind);
  assert.deepEqual(kinds, ['review', 'reteach', 'move', 'note'], 'a part with 1 of 4 finished: re-teach it');
  assert.match(f.sug.find(s => s.kind === 'reteach').label, /^Re-teach Pizza time on \w+$/);
  const review = f.sug.find(s => s.kind === 'review');
  assert.match(review.label, /Hand out a review lesson on \w+ to the Stretch group/);
  assert.match(review.confirm, /Nothing goes on desks until you start that plan/);
  // the next school day (a Friday's is Monday)
  const fri = Date.UTC(2026, 10, 27, 15);
  assert.equal(FU.nextSchoolDay(A, fri), '2026-11-30'); assert.equal(FU.nextSchoolDay(A, Date.UTC(2026, 10, 24, 15)), '2026-11-25');
  // confirmed: the review goes into the next school day's plan, for that group only
  const next = FU.nextSchoolDay(F);
  const r1 = await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followDo', value: 'review' } });
  assert.equal(r1.status, 200, r1.text); assert.match(r1.json.toast, /Added to \w+'s plan/);
  const day = HW.datedOf(F, next);
  assert.ok(day, 'a dated plan for the next school day');
  const rv = day.parts.at(-1);
  assert.equal(rv.kind, 'work'); assert.equal(rv.title, 'Review'); assert.equal(rv.only, true); assert.equal(rv.versions.length, 1); assert.equal(rv.versions[0].group, fStretch.id); assert.deepEqual(rv.versions[0].pick, { type: 'game', id: pizza.id });
  assert.equal(HO.openCount(F.id), before.handouts, 'nothing on desks yet');
  // the same one twice: done already
  assert.equal((await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followDo', value: 'review' } })).json.code, 'already');
  // move unfinished work
  assert.equal((await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followDo', value: 'move' } })).status, 200);
  const day2 = HW.datedOf(F, next);
  assert.equal(day2.parts.length, day.parts.length + 1); assert.equal(day2.parts.at(-1).title, 'Finish today\'s work'); assert.equal(day2.parts.at(-1).versions.length, 3);
  // re-teach: ten minutes of slides
  assert.equal((await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followDo', value: 'reteach' } })).status, 200);
  const day3 = HW.datedOf(F, next);
  assert.deepEqual([day3.parts.at(-1).kind, day3.parts.at(-1).title, day3.parts.at(-1).minutes], ['slides', 'Re-teach: Pizza time', 10]);
  // the note: the teacher's own words on the teacher's area
  assert.equal((await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followNote', value: '' } })).json.code, 'needText');
  const nt = await as(rivera)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followNote', value: 'Great work on fractions today! We finish the pizzas tomorrow.' } });
  assert.equal(nt.status, 200, nt.text);
  assert.ok(H.roomOf(F.id).area.__ann.notes.some(n => /finish the pizzas/.test(n.text)));
  // the card shows each as done, and only the class's own teacher can tap it
  const card = (await as(rivera)('/api/companion/chat')).json.chat.turns.find(x => x.id === turn.id).note.follow;
  assert.deepEqual(card.sug.filter(s => s.state === 'done').map(s => s.kind).sort(), ['move', 'note', 'reteach', 'review']);
  assert.equal((await as(other)('/api/companion/chat/act', { body: { turnId: turn.id, act: 'followDo', value: 'move' } })).status, 404);
  // the plan pill of that day picks the parts up (when the day comes): the strip has them
  const futureView = HP.teacherView(F, Date.parse(`${next}T15:00:00Z`));
  assert.equal(futureView.state, 'planned'); assert.ok(futureView.parts.some(p => p.title === 'Review'));
  // using that day's plan later: the review goes to that group only
  q.run("UPDATE homeroom_rooms SET day_plan='' WHERE class_id=?", F.id);
  const use2 = HP.usePlan(rivera, F, { ...day2, id: 'usetest01', parts: [{ ...rv, versions: [{ group: fStretch.id, pick: { type: 'game', id: bees.id } }] }] });
  assert.ok(use2.ok, JSON.stringify(use2));
  const ids = use2.plan.parts[0].handouts;
  const got = new Set(q.all(`SELECT user_id FROM class_lesson_students WHERE class_lesson_id IN (${ids.map(() => '?').join(',')})`, ...ids).map(r => r.user_id));
  assert.equal(ids.length, 1); assert.deepEqual([...got].sort(), [gia.id, hal.id].sort(), 'only that group: no one else gets it');
  // the AI's next turn reads the follow-up's words: no names, usernames or ids
  await as(rivera)('/api/companion/chat', { body: { text: 'Thanks. Anything else for tomorrow?', page: { type: 'homeroom', classId: F.id } } });
  await C.allSettled();
  const sent = JSON.stringify(calls);
  assert.ok(calls.length >= 1); assert.ok(!NAMES.test(sent)); for (const s of SECRETS()) assert.ok(!sent.includes(s));
  CO.hooks.create = null;
});

test('deleting: the account takes its seen marks and Needs a look marks; the class takes the class\'s', () => {
  assert.ok(NL.mark(rivera, A, { studentId: fay.id, state: 'snooze' }).ok);
  IN.setSeen(fay, 'desk', true);
  const look = () => q.get('SELECT COUNT(*) n FROM homeroom_look WHERE user_id=?', fay.id).n;
  assert.equal(look(), 1);
  assert.ok(deleteAccount(fay.id, boss, { by: 'admin', leaveSchools: true }).ok);
  assert.equal(look(), 0); assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_seen WHERE user_id=?', fay.id).n, 0);
  // a teacher's account: their name off the marks they made, the marks stay with the class
  const t2 = staff('Ms Second'); TOOLS.givePlan(t2.id);
  assert.ok(S.addToClass(boss, A.id, t2.id, 'teacher').ok);
  config.homeroomUsers.push(t2.username.toLowerCase());
  assert.ok(H.canUseClass(getUser(t2.id), A));
  assert.ok(NL.mark(getUser(t2.id), A, { studentId: cleo.id, state: 'snooze' }).ok);
  assert.ok(deleteAccount(t2.id, boss, { by: 'admin', parentMade: false, leaveSchools: true }).ok);
  const row = q.get('SELECT * FROM homeroom_look WHERE class_id=? AND user_id=?', A.id, cleo.id);
  assert.ok(row); assert.equal(row.set_by, null);
  // a student leaving the class takes theirs; the class deleted takes the rest
  assert.ok(S.removeFromClass(boss, A.id, cleo.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_look WHERE class_id=? AND user_id=?', A.id, cleo.id).n, 0);
  assert.ok(NL.mark(rivera, A, { studentId: eli.id, state: 'snooze' }).ok);
  S.classDeleted(A.id);   // (what a class delete runs: services/schools.js deleteClass, the school delete's BY_CLASS)
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_look WHERE class_id=?', A.id).n, 0);
});
