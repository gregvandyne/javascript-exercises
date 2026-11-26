// Homeroom step 4c (docs/decisions.md "Homeroom: K-2 mode, absent and at home"; services/homeroom-attendance.js):
//   - K-2 mode: on by itself for a K, 1 or 2 class, the class's teachers turn it on or off for the class and per student;
//     the desk page and its poll say so; the notebook draws or types; K-2 reading notes (a drawing, a feeling, a word);
//   - attendance: a teacher or a sub marks Absent or At home for today (a sub's marks are logged; an aide only sees them);
//     an absent desk is left out of live status, Needs a look and Finish class's counts ("2 absent");
//   - missed handouts: given on a day a student was absent, they stay on the desk as missed and are never late by
//     themselves in Progress;
//   - at home: no hand or hall pass; a question from home waits in Hands until answered;
//   - deleting: the rows go with the class, the school and the account.
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
const HV = await import('../../server/services/homeroom-live.js');
const HP = await import('../../server/services/homeroom-plan.js');
const HA = await import('../../server/services/homeroom-aides.js');
const SB = await import('../../server/services/homeroom-sub.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const HR = await import('../../server/services/homeroom-reading.js');
const NB = await import('../../server/services/notebook.js');
const P = await import('../../server/services/progress.js');
const LIB = await import('../../server/services/library.js');
const SD = await import('../../server/services/school-delete.js');
const games = await import('../../server/services/games.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, setCookie: r.headers.get('set-cookie') || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : (o.cookie || '') });

const boss = createUser({ username: 'K2Boss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'K2 Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), aide = staff('Mr Aide'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const k1 = S.createClass(boss, oak.id, { name: 'Room 1K', teacherId: rivera.id, grade: '1' }).class;
const g4 = S.createClass(boss, oak.id, { name: 'Room 4F', teacherId: rivera.id, grade: '4' }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [ava, ben, cleo, dev] = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Shah'].map(n => kidIn(k1, n));
const [fay, gus] = ['Fay Gold', 'Gus Fox'].map(n => kidIn(g4, n));
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
assert.ok(HA.addStaff(rivera, k1, aide.id).ok);
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon='🐝' WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const bees = made('Counting Bees', 'counting-bees-k2'), shapes = made('Shape Hunt', 'shape-hunt-k2'), rhymes = made('Rhyme Time', 'rhyme-time-k2');
const C = id => `/api/homeroom/${id}`;

test('K-2 mode: on by grade, the class turned on or off, one student over the class; the desk and the notebook say so', async () => {
  assert.deepEqual(AT.classK2(k1), { mode: '', auto: true, on: true });
  assert.deepEqual(AT.classK2(g4), { mode: '', auto: false, on: false });
  assert.equal(AT.k2For(k1, ava.id), true); assert.equal(AT.k2For(g4, fay.id), false);
  // the desk page carries it (its class and the poll)
  const page = await as(ava)(`/class/${k1.id}/desk`);
  assert.equal(page.status, 200); assert.match(page.text, /class="hd hd-k2"/);
  assert.equal((await as(ava)(`/api/desk/${k1.id}/state`)).json.k2, true);
  assert.equal((await as(fay)(`/api/desk/${g4.id}/state`)).json.k2, false);
  assert.ok(!/class="hd hd-k2"/.test((await as(fay)(`/class/${g4.id}/desk`)).text));
  // the class's teacher turns it on for grade 4 (aide and another teacher cannot)
  assert.equal((await as(aide)(`${C(k1.id)}/k2`, { body: { mode: 'off' } })).status, 403);
  assert.equal((await as(other)(`${C(g4.id)}/k2`, { body: { mode: 'on' } })).status, 404);
  assert.equal((await as(rivera)(`${C(g4.id)}/k2`, { body: { mode: 'sideways' } })).status, 400);
  const on = await as(rivera)(`${C(g4.id)}/k2`, { body: { mode: 'on' } });
  assert.equal(on.status, 200); assert.deepEqual(on.json.k2, { mode: 'on', auto: false, on: true });
  assert.equal(AT.k2For(g4, fay.id), true);
  // ...and off for one student of it (and back to the class's)
  const one = await as(rivera)(`${C(g4.id)}/k2`, { body: { studentId: gus.id, mode: 'off' } });
  assert.deepEqual(one.json.k2Students, { [gus.id]: 'off' });
  assert.equal(AT.k2For(g4, gus.id), false); assert.equal(AT.k2For(g4, fay.id), true);
  assert.equal((await as(rivera)(`${C(g4.id)}/k2`, { body: { studentId: ava.id, mode: 'on' } })).json.code, 'notInClass');
  assert.ok(AT.setStudentK2(rivera, g4, gus.id, '').ok);
  assert.equal(AT.k2For(g4, gus.id), true);
  assert.ok(AT.setClassK2(rivera, g4, '').ok);
  assert.equal(AT.k2For(g4, fay.id), false);
  // the teacher's page has the setting; the notebook of a K-2 student draws or types
  const hp = await as(rivera)(`/class/${k1.id}/hub`);
  assert.match(hp.text, /"k2":\{"mode":"","auto":true,"on":true\}/);
  assert.equal(NB.mine(ava).k2, true);
  assert.equal(NB.mine(fay).k2, undefined);
});

test('the notebook keeps a drawing on a page, cleaned and limited', async () => {
  const book = NB.mine(ava), page = book.tabs[0].pages[0];
  const stroke = { c: '#1E88E5', pts: [{ x: 0.1, y: 0.2 }, { x: 2, y: -1 }, { x: 0.3, y: 0.3 }] };
  const r = await as(ava)(`/api/notebook/pages/${page.id}`, { body: { body: '<p>My cat</p>', drawing: [stroke, { c: 'red', pts: [{ x: 0.5, y: 0.5 }] }, { c: 'javascript:x', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.drawing, [{ c: '#1E88E5', pts: [{ x: 0.1, y: 0.2 }, { x: 1, y: 0 }, { x: 0.3, y: 0.3 }] }, { c: '#141414', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]);
  assert.equal(NB.mine(ava).tabs[0].pages[0].drawing.length, 2);
  // text alone keeps the drawing; too many strokes is refused
  assert.equal((await as(ava)(`/api/notebook/pages/${page.id}`, { body: { body: '<p>My cat Tom</p>' } })).json.drawing.length, 2);
  const many = Array.from({ length: NB.DRAWING.strokes + 1 }, () => ({ c: '#141414', pts: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }] }));
  assert.equal((await as(ava)(`/api/notebook/pages/${page.id}`, { body: { body: '<p>x</p>', drawing: many } })).json.code, 'drawingFull');
  // the teacher reads it with the drawing
  assert.equal(NB.forTeacher(rivera, ava.id).tabs[0].pages[0].drawing.length, 2);
});

test('attendance: the teacher marks Absent and At home for today; an aide sees but cannot; others not at all', async () => {
  let tz = 'America/Chicago';
  assert.equal((await as(aide)(`${C(k1.id)}/attendance`, { body: { studentId: ava.id, status: 'absent' } })).status, 403);
  assert.equal(AT.mark(aide, k1, ava.id, 'absent').code, 'forbidden');
  assert.equal(AT.mark(other, k1, ava.id, 'absent').code, 'notFound');
  assert.equal(AT.mark(ava, k1, ava.id, 'absent').code, 'notFound');
  assert.equal(AT.mark(rivera, k1, fay.id, 'absent').code, 'notInClass');
  assert.equal(AT.mark(rivera, k1, ava.id, 'sick').code, 'badAction');
  const r = await as(rivera)(`${C(k1.id)}/attendance`, { body: { studentId: dev.id, status: 'absent', tz } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.att, { [dev.id]: 'absent' });
  assert.ok(AT.mark(rivera, k1, cleo.id, 'home', { tz }).ok);
  assert.deepEqual(AT.marksToday(k1.id), { [dev.id]: 'absent', [cleo.id]: 'home' });
  // one mark a day: a new one replaces it, '' is here again
  assert.ok(AT.mark(rivera, k1, cleo.id, 'absent', { tz }).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_attendance WHERE class_id=? AND user_id=?', k1.id, cleo.id).n, 1);
  assert.ok(AT.mark(rivera, k1, cleo.id, 'home', { tz }).ok);
  // an aide's board shows them (the handouts view), the aide's own Homeroom page loads
  const hv = await as(aide)(`${C(k1.id)}/handouts`);
  assert.equal(hv.status, 200); assert.deepEqual(hv.json.att, { [dev.id]: 'absent', [cleo.id]: 'home' });
  // yesterday's mark is not today's
  q.run('UPDATE homeroom_attendance SET day=day-86400000 WHERE class_id=? AND user_id=?', k1.id, cleo.id);
  assert.deepEqual(AT.marksToday(k1.id), { [dev.id]: 'absent' });
  q.run('UPDATE homeroom_attendance SET day=day+86400000 WHERE class_id=? AND user_id=?', k1.id, cleo.id);
});

test('an absent desk: no live status or cursor, out of Needs a look, Today and Finish class counts (shown on its own)', async () => {
  const plan = HP.cleanPlan(rivera, k1, { parts: [{ kind: 'work', minutes: 10, title: 'Bees', versions: [{ pick: { type: 'game', id: bees.id } }] }] }).plan;
  const used = HP.usePlan(rivera, k1, plan);
  assert.ok(used.ok, JSON.stringify(used));
  assert.ok(H.setLive(rivera, k1, 'start').ok);
  // Dev (absent) pulses anyway: still Absent, never Stuck, no cursor
  const t0 = now();
  for (const u of [ava, dev]) HV.pulse(u, k1, { where: 'desk', cur: [[0, 0.5, 0.5], [100, 0.6, 0.6]] }, t0);
  const lv = HV.liveView(k1, HO.boardView(k1), t0 + HV.STUCK_MS + 1000);
  assert.equal(lv.desks[dev.id].st, 'absent'); assert.ok(!lv.desks[dev.id].cur);
  assert.notEqual(lv.desks[ava.id].st, 'absent');
  // the plan: Finish class counts the present students only, absent apart
  assert.ok(HP.runAction(rivera, k1, 'start').ok);
  const fin = HP.runAction(rivera, k1, 'finish');
  assert.ok(fin.ok);
  assert.equal(fin.summary.absent, 1);
  assert.equal(fin.summary.parts[0].of, 3, 'Ava, Ben and Cleo; not Dev');
  assert.equal(fin.summary.homework, 3);
  HP.runAction(rivera, k1, 'clear');
});

test('at home: no hand or hall pass; a question from home waits in Hands until answered (a few words, or none)', async () => {
  // Cleo is At home today (marked), class is live
  assert.ok(H.liveOf(k1.id));
  assert.equal((await as(cleo)(`/api/desk/${k1.id}/hand`, { body: { action: 'raise', kind: 'bathroom' } })).json.code, 'atHome');
  assert.equal((await as(cleo)(`/api/desk/${k1.id}/hand`, { body: { action: 'raise', kind: 'question' } })).json.code, 'atHome');
  const st = (await as(cleo)(`/api/desk/${k1.id}/state`)).json;
  assert.equal(st.home, 'home'); assert.equal(st.me.home, true);
  // in class (Ava): hands as always, no asking from home
  assert.equal((await as(ava)(`/api/desk/${k1.id}/state`)).json.home, '');
  assert.equal((await as(ava)(`/api/desk/${k1.id}/ask`, { body: { kind: 'question' } })).json.code, 'notHome');
  assert.ok((await as(ava)(`/api/desk/${k1.id}/hand`, { body: { action: 'raise', kind: 'help' } })).json.ok);
  // Cleo asks with pictures only (K-2) and with a few words
  const a1 = await as(cleo)(`/api/desk/${k1.id}/ask`, { body: { kind: 'help' } });
  assert.equal(a1.status, 200); assert.equal(a1.json.asks.length, 1);
  assert.equal((await as(cleo)(`/api/desk/${k1.id}/ask`, { body: { kind: 'sing' } })).json.code, 'badKind');
  assert.equal((await as(cleo)(`/api/desk/${k1.id}/ask`, { body: { kind: 'question', text: 'x'.repeat(AT.ASK_MAX + 1) } })).json.code, 'tooLong');
  assert.ok((await as(cleo)(`/api/desk/${k1.id}/ask`, { body: { kind: 'question', text: '  What is   a  tens frame? ' } })).json.ok);
  // the teacher sees them in Hands, marked at home (the live poll and the handouts view)
  const pulse = (await as(rivera)(`${C(k1.id)}/pulse`)).json;
  assert.equal(pulse.asks.length, 2); assert.equal(pulse.asks[1].text, 'What is a tens frame?'); assert.equal(pulse.asks[1].name, 'Cleo Park');
  assert.equal(pulse.desks[cleo.id].home, true); assert.ok(!pulse.desks[cleo.id].cur, 'no cursor from home');
  assert.equal(pulse.hands.length, 1, 'only Ava\'s hand');
  // At most 3 waiting
  assert.ok(AT.ask(cleo, k1, { kind: 'question' }).ok);
  assert.equal(AT.ask(cleo, k1, { kind: 'question' }).code, 'tooManyAsks');
  // an aide answers one; the student's desk says the teacher saw it
  const ans = await as(aide)(`${C(k1.id)}/asks`, { body: { id: pulse.asks[0].id } });
  assert.equal(ans.status, 200); assert.equal(ans.json.asks.length, 2);
  const mine = (await as(cleo)(`/api/desk/${k1.id}/state`)).json.asks;
  assert.ok(mine.find(x => x.id === pulse.asks[0].id).answeredAt);
  assert.equal((await as(rivera)(`${C(k1.id)}/asks`, { body: { id: 'nope' } })).status, 404);
  // marking At home lowers a hand that was up; outside live class every desk is "outside" and may ask
  assert.ok(AT.mark(rivera, k1, ava.id, 'home').ok);
  assert.equal(HV.handsView(k1).hands.length, 0);
  assert.ok(AT.mark(rivera, k1, ava.id, '').ok);
  assert.ok(H.setLive(rivera, k1, 'end').ok);
  assert.equal((await as(ben)(`/api/desk/${k1.id}/state`)).json.home, 'outside');
  assert.ok((await as(ben)(`/api/desk/${k1.id}/ask`, { body: { kind: 'question', text: 'Is it due today?' } })).json.ok);
});

test('missed while absent: on the desk as missed, never late by itself in Progress', async () => {
  // Dev is absent today: a handout due yesterday given today is missed for him, late for nobody who was absent
  const yesterday = new Date(now() - 2 * 86400e3).toISOString().slice(0, 10);
  const r = HO.handOut(rivera, k1, { gameId: shapes.id, to: { kind: 'all' }, instructions: 'Find 3 circles.', dueAt: yesterday });
  assert.ok(r.ok, JSON.stringify(r));
  const cards = (await as(dev)(`/api/desk/${k1.id}/state`)).json.cards;
  const card = cards.find(x => x.id === r.classLesson.id);
  assert.equal(card.missed, true); assert.equal(card.instructions, 'Find 3 circles.');
  assert.ok(!(await as(ava)(`/api/desk/${k1.id}/state`)).json.cards.find(x => x.id === r.classLesson.id).missed);
  const gb = P.classProgress(k1.id), col = gb.lessons.findIndex(l => l.id === r.classLesson.id);
  const cell = who => gb.students.find(p => p.id === who.id).cells[col];
  assert.equal(cell(dev).late, false); assert.equal(cell(dev).excused, true); assert.equal(cell(dev).done, 0);
  assert.equal(cell(ava).late, true, 'a present student\'s missing work is late as always');
  // the handout of an earlier day is not missed: his absence was today
  q.run('UPDATE homeroom_handouts SET created_at=created_at-3*86400000 WHERE class_lesson_id=?', r.classLesson.id);
  assert.ok(!(await as(dev)(`/api/desk/${k1.id}/state`)).json.cards.find(x => x.id === r.classLesson.id).missed);
  q.run('UPDATE homeroom_handouts SET created_at=created_at+3*86400000 WHERE class_lesson_id=?', r.classLesson.id);
});

test('a sub takes attendance (logged in While you were out); a sub answers a question from home', async () => {
  const made2 = SB.createLink(rivera, k1, {});
  assert.ok(made2.ok);
  const open = await call(`/sub/${made2.token}`);
  const ck = (open.setCookie.match(/hr_sub=[^;]*/) || [''])[0];
  assert.match(ck, /^hr_sub=/);
  const st0 = (await call('/api/sub/state', { cookie: ck })).json;
  assert.equal(st0.desks.find(d => d.id === dev.id).att, 'absent');
  assert.ok(st0.asks.length >= 1, 'questions from home show for the sub');
  const m = await call('/api/sub/attendance', { cookie: ck, body: { studentId: ben.id, status: 'absent' } });
  assert.equal(m.status, 200); assert.equal(m.json.state.desks.find(d => d.id === ben.id).att, 'absent');
  assert.equal((await call('/api/sub/attendance', { cookie: ck, body: { studentId: fay.id, status: 'absent' } })).status, 400);
  assert.ok((await call('/api/sub/attendance', { cookie: ck, body: { studentId: ben.id, status: 'home' } })).json.ok);
  const ask = st0.asks[0];
  assert.ok((await call('/api/sub/asks', { cookie: ck, body: { id: ask.id } })).json.ok);
  // the teacher's attendance address is not the sub's
  assert.equal((await call(`${C(k1.id)}/attendance`, { cookie: ck, body: { studentId: ben.id, status: '' } })).status, 403);
  const rows = q.all('SELECT action, student FROM homeroom_sub_log WHERE link_id=? ORDER BY at', made2.link.id).map(r => `${r.action}:${r.student || ''}`);
  assert.ok(rows.includes(`attend:absent:${ben.id}`) && rows.includes(`attend:home:${ben.id}`) && rows.includes('hand:ask:'), rows.join(','));
  const note = SB.notesFor(k1).find(n => n.id === made2.link.id);
  assert.equal(note.counts['attend:absent'], 1); assert.equal(note.counts['attend:home'], 1);
  assert.equal(q.get('SELECT by_kind FROM homeroom_attendance WHERE class_id=? AND user_id=?', k1.id, ben.id).by_kind, 'sub');
});

test('K-2 reading notes: a drawing, how they liked it and a word, on the book\'s notebook page; only in K-2 mode', async () => {
  const book = LIB.books().find(b => b.pages.length >= 4 && b.questions && b.questions.length);
  const give = HR.handOutReading(rivera, k1, { bookId: book.id, to: { kind: 'desk', id: ava.id }, order: 'any' });
  assert.ok(give.ok, JSON.stringify(give));
  const cl = give.classLesson.id, t = now();
  q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, quiz_src, marks, solved, quiz_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, cl, k1.id, ava.id, book.id, book.pages.length, book.pages.length, t, 'library', '111', '111', t, t, t);
  const labels = { happened: 'Something that happened', word: 'A new word', think: 'What I think', k2drew: 'What happened (my drawing)', 'feel.love': 'I loved it.', 'feel.like': 'I liked it.', 'feel.ok': 'It was OK.' };
  const draw = [{ c: '#FF6B4A', pts: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.5 }] }];
  assert.equal(HR.saveNotes(ava, k1, cl, { k2: { drawing: [], feel: 'love' } }, labels).code, 'drawFirst');
  assert.equal(HR.saveNotes(ava, k1, cl, { k2: { drawing: draw, feel: 'meh' } }, labels).code, 'pickFeel');
  // through the desk's address, with the student's language
  const r = await as(ava)(`/api/desk/${k1.id}/reading/${cl}`, { body: { action: 'notes', notes: { k2: { drawing: draw, feel: 'love', word: ' bunny <b> ' } } } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.step, 'done');
  const pg = q.get('SELECT title, body, drawing FROM notebook_pages WHERE id=?', r.json.page);
  assert.equal(pg.title, book.title);
  assert.match(pg.body, /What happened \(my drawing\)/); assert.match(pg.body, /I loved it\./); assert.match(pg.body, /bunny &lt;b&gt;/);
  assert.equal(JSON.parse(pg.drawing).length, 1);
  // not in K-2 mode: the K-2 form is refused (the 3 notes are what's asked)
  const g2 = HR.handOutReading(rivera, g4, { bookId: book.id, to: { kind: 'desk', id: fay.id }, order: 'any' });
  q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, quiz_src, marks, solved, quiz_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, g2.classLesson.id, g4.id, fay.id, book.id, book.pages.length, book.pages.length, t, 'library', '111', '111', t, t, t);
  assert.equal(HR.saveNotes(fay, g4, g2.classLesson.id, { k2: { drawing: draw, feel: 'love' } }, labels).code, 'noteEmpty');
});

test('deleting: attendance, K-2 settings and questions go with the student leaving, the account, the class and the school', async () => {
  for (const t of ['homeroom_k2', 'homeroom_attendance', 'homeroom_asks']) assert.ok(SD.BY_CLASS.includes(t), t);
  AT.setStudentK2(rivera, g4, gus.id, 'off'); AT.mark(rivera, g4, gus.id, 'home'); AT.ask(gus, g4, { kind: 'question' });
  const n = (t, u) => q.get(`SELECT COUNT(*) n FROM ${t} WHERE user_id=?`, u.id).n;
  assert.deepEqual(['homeroom_k2', 'homeroom_attendance', 'homeroom_asks'].map(t => n(t, gus)), [1, 1, 1]);
  assert.equal(deleteAccount(gus.id, boss, { by: 'admin', leaveSchools: true }).ok, true);
  assert.deepEqual(['homeroom_k2', 'homeroom_attendance', 'homeroom_asks'].map(t => n(t, gus)), [0, 0, 0]);
  // a student leaving the class
  assert.ok(n('homeroom_attendance', cleo) > 0);
  assert.ok(n('homeroom_asks', cleo) > 0);
  S.removeFromClass(boss, k1.id, cleo.id);
  assert.equal(n('homeroom_attendance', cleo), 0); assert.equal(n('homeroom_asks', cleo), 0);
  // the school (and its classes)
  const cnt = t => q.get(`SELECT COUNT(*) n FROM ${t} WHERE class_id IN (?,?)`, k1.id, g4.id).n;
  assert.ok(cnt('homeroom_attendance') > 0 && cnt('homeroom_asks') > 0);
  assert.equal(SD.deleteSchool(boss, oak.id).ok, true);
  assert.deepEqual(['homeroom_k2', 'homeroom_attendance', 'homeroom_asks'].map(cnt), [0, 0, 0]);
});
