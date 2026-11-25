// Homeroom: the teacher's desk (docs/decisions.md "Homeroom: the teacher's desk"; services/homeroom-staged.js,
// routes/homeroom.js):
//   - a game, a lesson and a tool go on the teacher's own desk in a class with no students; staged, never assigned (no
//     class lesson is made); twice is once; take it off; a full desk; kept per class (another class has its own);
//   - Play / Preview links: the game's page, the lesson's own question set, the tool;
//   - only the class's teachers read or change it (other teachers, students: the site's 404); a co-teacher sees the
//     games but not another teacher's lesson; students never see it (desk page, desk state, See the room, projector);
//   - a teacher's account deleted takes their items;
//   - Whole class with nobody in the class: allowed (a game and a lesson), and a student who joins later gets it on
//     their desk and To do list; an empty group is still refused.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const HS = await import('../../server/services/homeroom-staged.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const AD = await import('../../server/services/account-delete.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Staged Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), co = staff('Mr Co'), other = staff('Ms Other');
for (const u of [rivera, co, other]) TOOLS.givePlan(u.id);
const empty = S.createClass(boss, oak.id, { name: 'Room Empty', teacherId: rivera.id }).class;
const second = S.createClass(boss, oak.id, { name: 'Room Two', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room Other', teacherId: other.id }).class;
assert.ok(S.addToClass(boss, empty.id, co.id).ok);
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kid2 = kidIn(second, 'Ava Stone');
config.homeroom = true; config.homeroomUsers = [rivera, co, other].map(u => u.username.toLowerCase());
config.manipulativesUsers = [rivera, co].map(u => u.username.toLowerCase());

const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=? WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza'), ladder = made('Word Ladder', 'word-ladder'), LAB = made('Arithmetic Lab', 'arithmetic-lab');
const lesson = HL.getMine(rivera, HL.saveLesson(rivera, { slug: 'arithmetic-lab', title: 'Long division warm-up', base: M.defaults('arithmetic-lab', 7), versions: [] }).lesson.id);
const stagedApi = (who, c, b) => as(who)(`/api/homeroom/${c.id}/staged`, b ? { body: b } : {});
const classLessons = c => q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id=?', c.id).n;

let gameItem, lessonItem;
test('a game, a lesson and a tool on the teacher\'s desk in a class with no students: staged, never assigned', async () => {
  assert.equal(H.studentsOf(empty.id).length, 0);
  let r = await stagedApi(rivera, empty, { action: 'add', pick: pizza.id });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.toast, /On your desk/);
  gameItem = r.json.staged.find(x => x.kind === 'game');
  assert.equal(gameItem.title, 'Fraction Pizza'); assert.equal(gameItem.pick, pizza.id); assert.equal(gameItem.href, '/play/fraction-pizza');
  r = await stagedApi(rivera, empty, { action: 'add', pick: `L:${lesson.id}` });
  assert.equal(r.status, 200, r.text);
  lessonItem = r.json.staged.find(x => x.kind === 'lesson');
  assert.equal(lessonItem.title, 'Long division warm-up'); assert.equal(lessonItem.pick, `L:${lesson.id}`);
  assert.equal(lessonItem.href, `/play/arithmetic-lab?chapter=${encodeURIComponent(lesson.base.set)}&lock=1`, 'Preview: the lesson\'s own question set');
  r = await stagedApi(rivera, empty, { action: 'add', pick: 'T:manipulatives' });
  assert.equal(r.status, 200, r.text);
  const tool = r.json.staged.find(x => x.kind === 'tool');
  assert.equal(tool.href, '/manipulatives'); assert.equal(tool.tool, true);
  // twice is once
  r = await stagedApi(rivera, empty, { action: 'add', pick: pizza.id });
  assert.equal(r.status, 200); assert.match(r.json.toast, /already on your desk/); assert.equal(r.json.staged.filter(x => x.kind === 'game').length, 1);
  assert.equal(classLessons(empty), 0, 'nothing assigned');
  // bad picks
  assert.equal((await stagedApi(rivera, empty, { action: 'add', pick: 'nope' })).json.code, 'pickGame');
  assert.equal((await stagedApi(rivera, empty, { action: 'add', pick: 'L:nope' })).json.code, 'noLesson');
  assert.equal((await stagedApi(rivera, empty, { action: 'add', pick: 'T:hammer' })).json.code, 'badStage');
  assert.equal((await stagedApi(rivera, empty, { action: 'fly' })).json.code, 'badAction');
  // the page has it, and the board draws My desk
  const page = await as(rivera)(`/class/${empty.id}/homeroom`);
  assert.equal(page.status, 200);
  assert.match(page.text, /"staged":\[\{"id":"d[a-z0-9]+","kind":"game"/);
  assert.match(page.text, /data-hritem="T:manipulatives"/, 'a tool in the panel can be picked for My desk');
});

test('kept per class and between visits; take it off; a full desk', async () => {
  assert.equal((await stagedApi(rivera, empty)).json.staged.length, 3);
  assert.equal((await stagedApi(rivera, second)).json.staged.length, 0, 'another class has its own desk');
  assert.ok((await stagedApi(rivera, second, { action: 'add', pick: ladder.id })).json.ok);
  assert.deepEqual(HS.storedOf(empty.id).map(x => x.kind), ['game', 'lesson', 'tool']);
  assert.equal((await stagedApi(rivera, empty)).json.staged.length, 3, 'still there after using another class');
  const tool = HS.storedOf(empty.id).find(x => x.kind === 'tool');
  let r = await stagedApi(rivera, empty, { action: 'remove', id: tool.id });
  assert.equal(r.status, 200); assert.match(r.json.toast, /Taken off your desk/); assert.equal(r.json.staged.length, 2);
  assert.equal((await stagedApi(rivera, empty, { action: 'remove', id: tool.id })).json.code, 'notStaged');
  // a full desk
  const list = HS.storedOf(second.id);
  q.run('UPDATE homeroom_rooms SET staged=? WHERE class_id=?', JSON.stringify([...list, ...Array.from({ length: HS.STAGED_MAX - 1 }, (_, i) => ({ id: `dx${i}`, kind: 'tool', ref: 'figures', by: rivera.id, at: 1 }))]), second.id);
  assert.equal(HS.stage(rivera, second, { pick: pizza.id }).code, 'deskFull');
  q.run('UPDATE homeroom_rooms SET staged=? WHERE class_id=?', JSON.stringify(list), second.id);
  // staging leaves the teacher's area's version alone (desks and the projector use it)
  const v = H.boardState(second.id).v;
  assert.ok(HS.stage(rivera, second, { pick: pizza.id }).ok);
  assert.equal(H.boardState(second.id).v, v);
});

test('only the class\'s teachers; a co-teacher sees the games, not another teacher\'s lesson; students never see it', async () => {
  for (const who of [other, kid2, null]) {
    assert.equal((await stagedApi(who, empty)).status, 404);
    assert.equal((await stagedApi(who, empty, { action: 'add', pick: ladder.id })).status, 404);
    assert.equal((await stagedApi(who, empty, { action: 'remove', id: gameItem.id })).status, 404);
  }
  assert.equal(HS.stage(other, empty, { pick: ladder.id }).code, 'notFound');
  assert.deepEqual(HS.stagedFor(other, empty), []);
  const coSees = (await stagedApi(co, empty)).json.staged;
  assert.deepEqual(coSees.map(x => x.kind), ['game'], 'a co-teacher: the game, not Ms Rivera\'s lesson');
  assert.equal((await stagedApi(co, empty, { action: 'remove', id: lessonItem.id })).json.code, 'notStaged');
  // Students: Room Two has Word Ladder and Fraction Pizza on the teacher's desk; nothing of it on Ava's side.
  const staged = HS.storedOf(second.id);
  assert.equal(staged.length, 2);
  const leak = text => staged.some(x => text.includes(x.id)) || /Word Ladder|Fraction Pizza|"staged"/.test(text);
  const desk = await as(kid2)(`/class/${second.id}/desk`);
  assert.equal(desk.status, 200);
  assert.ok(!leak(desk.text), 'the desk page');
  const st = await as(kid2)(`/api/desk/${second.id}/state`);
  assert.equal(st.status, 200); assert.ok(!leak(st.text), 'the desk state');
  assert.ok(!leak(JSON.stringify(H.roomForStudent(second, kid2))), 'See the room');
  assert.deepEqual(HO.deskView(second, kid2), [], 'no cards');
  assert.deepEqual(P.toDoFor(second.id, kid2.id), [], 'nothing to do');
  const proj = await as(rivera)(`/api/homeroom/${second.id}/state`);
  assert.ok(!leak(proj.text), 'the projector\'s poll');
  assert.ok(!leak((await as(rivera)(`/class/${second.id}/homeroom/projector`)).text), 'the projector page');
  assert.equal(classLessons(second), 0);
});

test('Whole class with nobody in the class: a game and a lesson wait for whoever joins', async () => {
  const give = b => as(rivera)(`/api/homeroom/${empty.id}/handouts`, { body: b });
  let r = await give({ gameId: pizza.id, to: { kind: 'all' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.toast, 'Fraction Pizza is handed out to the class. Students who join will get it.');
  const h = r.json.handouts.find(x => x.title === 'Fraction Pizza');
  assert.equal(h.target, 'all'); assert.equal(h.students, 0);
  assert.deepEqual(L.studentsOfLesson(h.id), [], 'the whole class, so a student who joins later gets it');
  r = await give({ lessonId: lesson.id, to: { kind: 'all' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.toast, /Long division warm-up is handed out to the class/);
  const hl = r.json.handouts.find(x => x.lesson);
  assert.equal(hl.students, 0); assert.deepEqual(L.studentsOfLesson(hl.id), []);
  // an empty group is still refused
  const g = H.roomOf(empty.id).groups[0];
  assert.equal((await give({ gameId: ladder.id, to: { kind: 'group', id: g.id } })).json.code, 'emptyGroup');
  // A student joins: both are on their desk and in their To do list.
  const late = kidIn(empty, 'Ben Late');
  const cards = HO.deskView(empty, late);
  assert.deepEqual(cards.map(x => x.title), ['Fraction Pizza', 'Long division warm-up']);
  assert.ok(cards[1].href.includes(`chapter=${lesson.base.set}`), 'the lesson as built');
  assert.equal(cards[0].next, true);
  assert.deepEqual(P.toDoFor(empty.id, late.id).map(x => x.id).sort(), [h.id, hl.id].sort());
  const st = await as(late)(`/class/${empty.id}/desk`);
  assert.equal(st.status, 200); assert.match(st.text, /Fraction Pizza/);
  assert.equal(HO.boardView(empty).handouts.find(x => x.id === h.id).students, 1);
});

test('a teacher\'s account deleted takes their items off every teacher\'s desk; the class\'s go with it', () => {
  const t = staff('Mr Temp'); TOOLS.givePlan(t.id);
  config.homeroomUsers.push(t.username.toLowerCase());
  assert.ok(S.addToClass(boss, second.id, t.id).ok);
  const hop = made('Map Hop', 'map-hop');
  const r = HS.stage(t, second, { pick: hop.id });
  assert.ok(r.ok && !r.already);
  assert.equal(HS.storedOf(second.id).length, 3);
  const res = AD.deleteAccount(t.id, boss, { by: 'admin', parentMade: false, leaveSchools: true });
  assert.ok(res.ok, JSON.stringify(res));
  const after = HS.storedOf(second.id);
  assert.ok(after.every(x => x.by !== t.id));
  assert.equal(after.length, 2, 'Ms Rivera\'s stay');
  // the class goes: its room row (and the desk with it) goes too
  const tmp = S.createClass(boss, oak.id, { name: 'Tmp', teacherId: rivera.id }).class;
  assert.ok(HS.stage(rivera, tmp, { pick: pizza.id }).ok);
  q.run('DELETE FROM classrooms WHERE id=?', tmp.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_rooms WHERE class_id=?', tmp.id).n, 0);
});
