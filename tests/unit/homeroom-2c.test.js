// Homeroom, step 2c (docs/decisions.md "Homeroom, step 2c"):
//   - the Classroom tab's overview at the top of Progress (services/homeroom-overview.js, routes/homeroom-overview.js):
//     a column per handout of the last 4 weeks, a lesson's versions merged into one column with each student's own
//     version's result, students in alphabetical order, cells per grading, the trend rule, the three numbers, the
//     Google Classroom status line; only for Homeroom teachers of the class (everyone else's Progress is unchanged);
//   - changing a handout's grading (all its versions), the class's teachers only;
//   - a comment and a sticker on a finished card: cleaned, limited, only on finished work, only by the class's
//     teachers; the student sees their own on the desk and the lesson page, never a classmate's; delete paths;
//   - team desks: make, move, split, refused cases, a handout dropped on a team goes to every member, See the room
//     shows the team once, "Team: names" on the desk, the shared pad any member writes (and a save that crossed a
//     teammate's comes back to merge); a student leaving the class leaves the team.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const OV = await import('../../server/services/homeroom-overview.js');
const SD = await import('../../server/services/school-delete.js');
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

const boss = createUser({ username: 'Hr2cBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Overview Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other'), plain = staff('Mx Plain');
for (const u of [rivera, other, plain]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 9C', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 9D', teacherId: other.id }).class;
const plainCls = S.createClass(boss, oak.id, { name: 'Room 9E', teacherId: plain.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
// Added out of alphabetical order on purpose.
const zoe = kidIn(cls, 'Zoe Young'), ava = kidIn(cls, 'Ava Stone'), mia = kidIn(cls, 'Mia Lopez'), ben = kidIn(cls, 'ben Hill');
const otherKid = kidIn(otherCls, 'Eli Moss');
kidIn(plainCls, 'Pia Plain');
// Mx Plain is not on the Homeroom list: their class keeps today's pages.
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());

function made(owner, { title = 'G', slug = null, seed = true } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, source=?, shelf='learn' WHERE id=?`, v.id, seed ? 'seed' : 'user', g.id);
  if (slug) q.run('UPDATE games SET slug=? WHERE id=?', slug, g.id);
  return games.getGame(g.id);
}
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const quest = made(official, { title: 'Number Hop', slug: 'number-hop' });
const tiles = made(official, { title: 'Tile Town', slug: 'tile-town' });
const pizza = made(official, { title: 'Pizza Parts', slug: 'pizza-parts' });
const mine = made(rivera, { title: 'My Quiz Game', seed: false });
const give = (who, body) => as(who)(`/api/homeroom/${cls.id}/handouts`, { body });
const doneAll = (u, clId) => { for (const s of L.steps(L.getClassLesson(clId).lesson_id)) assert.ok(P.markDone(u, clId, s.id).ok); };
const scoreOf = (u, clId, points, max = 10) => q.run("INSERT OR REPLACE INTO rubric_scores(class_lesson_id, step_id, user_id, rubric_id, snapshot, picks, points, max_points, scored_at) VALUES (?,?,?,?,?,?,?,?,?)", clId, '', u.id, 'rb-t', '{}', '[]', points, max, Date.now());
const DAY = 86400e3;

test('the trend rule, bands and the month: plain and tested', () => {
  assert.equal(OV.trendOf([]), null, 'no Score result: no trend');
  assert.equal(OV.trendOf([90]), 'steady');
  assert.equal(OV.trendOf([50]), 'support');
  assert.equal(OV.trendOf([60, 70, 75]), 'up', 'the latest 15 points above the first of the last 3');
  assert.equal(OV.trendOf([70, 72, 79]), 'steady', '9 points: steady');
  assert.equal(OV.trendOf([30, 45, 59]), 'support', 'improving but under 60 on average: needs support first');
  assert.equal(OV.trendOf([100, 20, 60, 61, 62]), 'steady', 'only the last 3 count');
  assert.equal(OV.trendOf([95, 80, 70]), 'steady', 'going down but well above 60 is steady, never ranked');
  assert.equal(OV.bandOf(80), 'ok'); assert.equal(OV.bandOf(79), 'mid'); assert.equal(OV.bandOf(59), 'low');
  assert.equal(OV.monthStart(Date.UTC(2026, 10, 25, 13)), Date.UTC(2026, 10, 1));
});

let hScore, hDone, hPrac, vA, vB;
test('the overview: columns of the last 4 weeks, versions merged, alphabetical rows, cells per grading, trends and numbers', async () => {
  // Score: a game for the whole class; Completion: one for Stretch; Not graded: practice; and a lesson in two versions.
  const room = H.roomOf(cls.id), [stretch, , building] = room.groups;
  assert.ok(H.saveGroups(rivera, cls, { groups: room.groups, members: { [ava.id]: stretch.id, [zoe.id]: stretch.id, [mia.id]: building.id, [ben.id]: building.id } }).ok);
  hScore = (await give(rivera, { gameId: quest.id, to: { kind: 'all' }, grade: 'score' })).json.handouts.find(h => h.title === 'Number Hop');
  hDone = (await give(rivera, { gameId: tiles.id, to: { kind: 'group', id: stretch.id }, grade: 'completion' })).json.handouts.find(h => h.title === 'Tile Town');
  hPrac = (await give(rivera, { gameId: mine.id, to: { kind: 'all' }, grade: 'none' })).json.handouts.find(h => h.title === 'My Quiz Game');
  // A lesson's two versions handed out together (batch): Stretch gets version A, Building version B.
  vA = HO.handOut(rivera, cls, { gameId: pizza.id, to: { kind: 'group', id: stretch.id }, grade: 'score' }).classLesson;
  vB = HO.handOut(rivera, cls, { gameId: pizza.id, to: { kind: 'group', id: building.id }, grade: 'score' }).classLesson;
  q.run("UPDATE homeroom_handouts SET hr_lesson='hl-1', batch='b-1' WHERE class_lesson_id IN (?,?)", vA.id, vB.id);
  // An old handout (5 weeks ago) is left out.
  const old = HO.handOut(rivera, cls, { gameId: made(official, { title: 'Old One' }).id, to: { kind: 'all' }, grade: 'score' }).classLesson;
  q.run('UPDATE homeroom_handouts SET created_at=? WHERE class_lesson_id=?', Date.now() - 35 * DAY, old.id);

  // results: Number Hop scores, the lesson's versions scored on each version
  doneAll(ava, hScore.id); scoreOf(ava, hScore.id, 9); doneAll(zoe, hScore.id); scoreOf(zoe, hScore.id, 4);
  doneAll(mia, hScore.id); // done, nothing scored
  doneAll(ava, hDone.id);
  doneAll(ben, hPrac.id);
  doneAll(ava, vA.id); scoreOf(ava, vA.id, 10); doneAll(zoe, vA.id); scoreOf(zoe, vA.id, 5); doneAll(mia, vB.id); scoreOf(mia, vB.id, 8);

  const ov = OV.overview(cls);
  assert.deepEqual(ov.columns.map(c => c.title), ['Pizza Parts', 'My Quiz Game', 'Tile Town', 'Number Hop'], 'newest first; the old one is out; the versions are one column');
  const lesson = ov.columns[0];
  assert.equal(lesson.versions, 2); assert.equal(lesson.kind, 'lesson'); assert.equal(lesson.grade, 'score');
  assert.equal(ov.columns[1].kind, 'mine'); assert.equal(ov.columns[1].grade, 'none');
  assert.equal(ov.columns[2].grade, 'completion'); assert.equal(ov.columns[3].kind, 'game');
  assert.deepEqual(ov.students.map(s => s.name), ['Ava Stone', 'ben Hill', 'Mia Lopez', 'Zoe Young'], 'alphabetical, case ignored, never by results');
  const row = n => ov.students.find(s => s.name === n);
  // each student's own version
  assert.deepEqual(row('Ava Stone').cells[0], { state: 'score', pct: 100, band: 'ok', clId: vA.id });
  assert.equal(row('Mia Lopez').cells[0].clId, vB.id); assert.equal(row('Mia Lopez').cells[0].pct, 80);
  assert.equal(row('Zoe Young').cells[0].band, 'low');
  assert.equal(row('ben Hill').cells[0].state, 'none', 'Building\'s version, not started');
  // Not graded is practice; Completion done / not done / not assigned
  assert.equal(row('ben Hill').cells[1].state, 'practiced'); assert.equal(row('Ava Stone').cells[1].state, 'practice');
  assert.equal(row('Ava Stone').cells[2].state, 'done'); assert.equal(row('Zoe Young').cells[2].state, 'notDone'); assert.equal(row('Mia Lopez').cells[2].state, 'na');
  // Score: % right; done but nothing scored: done
  assert.equal(row('Zoe Young').cells[3].pct, 40); assert.equal(row('Mia Lopez').cells[3].state, 'done');
  // trends from Score results oldest first: Ava 90 then 100 (steady, 10 up -> improving), Zoe 40, 50 (support), Mia 80 (steady), Ben none
  assert.equal(row('Ava Stone').trend, 'up'); assert.equal(row('Zoe Young').trend, 'support'); assert.equal(row('Mia Lopez').trend, 'steady'); assert.equal(row('ben Hill').trend, null);
  // finished: of the 13 open, assigned cells (4 Number Hop, 2 Tile Town, 4 practice, 4 lesson = 14; minus none) ...
  const cells = ov.students.flatMap(s => s.cells).filter(c => c.state !== 'na' && c.state !== 'locked');
  const fin = ov.students.flatMap(s => s.cells).filter(c => ['score', 'done', 'practiced'].includes(c.state)).length;
  assert.equal(ov.summary.finishedPct, Math.round((100 * fin) / cells.length));
  assert.equal(ov.summary.support, 1);
  assert.equal(ov.summary.month, OV.handoutCount(cls.id, OV.monthStart(Date.now())));
  assert.ok(ov.summary.month >= 4);
});

test('the overview on Progress: Homeroom teachers of the class only; the gradebook and CSV stay below, unchanged', async () => {
  const pg = await as(rivera)(`/class/${cls.id}/progress`);
  assert.equal(pg.status, 200);
  assert.match(pg.text, /id="hr-overview"/); assert.match(pg.text, /Class overview/);
  assert.ok(pg.text.indexOf('id="hr-overview"') < pg.text.indexOf('id="gb-lessons"'), 'above the full gradebook');
  assert.match(pg.text, /id="gb-lessons"/); assert.match(pg.text, /progress\.csv/);
  assert.match(pg.text, /students need support|student needs support/); assert.match(pg.text, /of handouts finished/); assert.match(pg.text, /handouts this month/);
  assert.match(pg.text, new RegExp(`href="/class/${cls.id}/progress/${hScore.id}"`), 'a column opens the lesson results page');
  assert.match(pg.text, new RegExp(`href="/class/${cls.id}/student/${ava.id}"`), 'a student opens the student report');
  assert.match(pg.text, /Graded by score/); assert.match(pg.text, /Graded by completion/); assert.match(pg.text, /Not graded/);
  assert.match(pg.text, /Needs support/); assert.match(pg.text, /Improving/);
  assert.match(pg.text, /homeroom-overview\.js/);
  // the rows in alphabetical order on the page too
  const at = n => pg.text.indexOf(`>${n}</a></th>`);
  assert.ok(at('Ava Stone') > 0 && at('Ava Stone') < at('ben Hill') && at('ben Hill') < at('Mia Lopez') && at('Mia Lopez') < at('Zoe Young'));
  // Another class's teacher can't see this class at all; a teacher without Homeroom keeps today's Progress page.
  assert.equal((await as(other)(`/class/${cls.id}/progress`)).status, 404);
  const pp = await as(plain)(`/class/${plainCls.id}/progress`);
  assert.equal(pp.status, 200); assert.doesNotMatch(pp.text, /hr-overview/); assert.doesNotMatch(pp.text, /homeroom-overview/);
  // Homeroom off: nobody gets it
  config.homeroom = false;
  assert.doesNotMatch((await as(rivera)(`/class/${cls.id}/progress`)).text, /hr-overview/);
  config.homeroom = true;
});

test('changing how a handout is graded: every version together; the class\'s teachers only', async () => {
  for (const who of [ava, other, plain, null]) assert.equal((await as(who)(`/api/homeroom/${cls.id}/handouts/${vA.id}/grade`, { body: { grade: 'none' } })).status, 404);
  assert.equal(L.gradeModeOf(vA.id), 'score');
  const bad = await as(rivera)(`/api/homeroom/${cls.id}/handouts/${vA.id}/grade`, { body: { grade: 'stars' } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'badGrade');
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/handouts/nope/grade`, { body: { grade: 'none' } })).status, 404);
  const r = await as(rivera)(`/api/homeroom/${cls.id}/handouts/${vA.id}/grade`, { body: { grade: 'completion' } });
  assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.ids.sort(), [vA.id, vB.id].sort());
  assert.equal(L.gradeModeOf(vA.id), 'completion'); assert.equal(L.gradeModeOf(vB.id), 'completion');
  assert.equal(OV.overview(cls).columns[0].grade, 'completion');
  assert.equal(OV.overview(cls).students.find(s => s.id === ava.id).cells[0].state, 'done');
  // another class's handout through this class's address: not there
  const oh = HO.handOut(other, otherCls, { gameId: quest.id, to: { kind: 'all' } }).classLesson;
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/handouts/${oh.id}/grade`, { body: { grade: 'none' } })).status, 404);
  assert.ok(q.get('SELECT 1 FROM audit_log WHERE action=? AND target=?', 'homeroom.grade', cls.id));
  await as(rivera)(`/api/homeroom/${cls.id}/handouts/${vA.id}/grade`, { body: { grade: 'score' } });
});

test('comments and stickers: on finished work, cleaned and limited, the class\'s teachers only; each student sees only their own', async () => {
  const fb = (who, clId, body) => as(who)(`/api/homeroom/${cls.id}/handouts/${clId}/feedback`, { body });
  for (const who of [ava, other, null]) assert.equal((await fb(who, hScore.id, { studentId: ava.id, comment: 'Hi', sticker: 'star' })).status, 404);
  let r = await fb(rivera, hScore.id, { studentId: ben.id, comment: 'Nice' });
  assert.equal(r.json.code, 'notFinished', 'Ben has not finished Number Hop');
  assert.equal((await fb(rivera, hDone.id, { studentId: mia.id, comment: 'x' })).json.code, 'notOnDesk', 'Tile Town is not on Mia\'s desk');
  assert.equal((await fb(rivera, hScore.id, { studentId: otherKid.id, comment: 'x' })).json.code, 'notOnDesk');
  assert.equal((await fb(rivera, hScore.id, { studentId: ava.id, sticker: 'selfie' })).json.code, 'badSticker');
  assert.equal((await fb(rivera, hScore.id, { studentId: ava.id, comment: 'y'.repeat(141) })).json.code, 'commentLong');
  assert.equal((await fb(rivera, hScore.id, { studentId: ava.id, comment: 'Call 555-123-4567' })).json.code, 'personal');
  r = await fb(rivera, hScore.id, { studentId: ava.id, comment: '  Great   work\u0007 on\n\n\nthe hops!  \nThird line', sticker: 'star' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.feedback.comment, 'Great work on\nthe hops!', 'cleaned: control characters out, spaces tidied, at most two lines');
  assert.equal(r.json.feedback.sticker, 'star'); assert.equal(r.json.feedback.src, '/img/stickers/ill/oomba-1.webp');
  assert.ok(r.json.desks[ava.id].find(x => x.id === hScore.id).fb, 'the teacher\'s board shows it on the card');
  await fb(rivera, hScore.id, { studentId: zoe.id, comment: 'Keep going', sticker: '' });
  // The student's desk: their own finished card has it; a classmate's never shows
  const desk = HO.deskView(cls, ava).find(x => x.id === hScore.id);
  assert.equal(desk.fb.sticker, 'star'); assert.match(desk.fb.comment, /^Great work on/);
  const page = await as(ava)(`/class/${cls.id}/desk`);
  assert.match(page.text, /oomba-1\.webp/); assert.doesNotMatch(page.text, /Keep going/);
  const st = await as(ava)(`/api/desk/${cls.id}/state`);
  assert.doesNotMatch(st.text, /Keep going/);
  // the lesson page: their own note, only theirs
  const lp = await as(ava)(`/class/${cls.id}/lessons/${hScore.id}`);
  assert.equal(lp.status, 200); assert.match(lp.text, /id="teacher-note"/); assert.match(lp.text, /Great work on/); assert.match(lp.text, /alt="Star"/);
  const zp = await as(zoe)(`/class/${cls.id}/lessons/${hScore.id}`);
  assert.match(zp.text, /Keep going/); assert.doesNotMatch(zp.text, /Great work on/);
  assert.doesNotMatch((await as(mia)(`/class/${cls.id}/lessons/${hScore.id}`)).text, /teacher-note/);
  // the poll's fingerprint moves when a note changes, so the desk gets it
  const v1 = HO.deskVersion(HO.deskView(cls, ava));
  await fb(rivera, hScore.id, { studentId: ava.id, comment: 'Even better', sticker: 'trophy' });
  assert.notEqual(HO.deskVersion(HO.deskView(cls, ava)), v1);
  // both empty removes it
  r = await fb(rivera, hScore.id, { studentId: zoe.id, comment: '', sticker: '' });
  assert.equal(r.json.feedback, null); assert.equal(HO.feedbackFor(hScore.id, zoe.id), null);
  // stored for the parents' view later; gone with the student leaving the class, and goes with the school
  assert.ok(q.get('SELECT 1 FROM homeroom_feedback WHERE class_lesson_id=? AND user_id=?', hScore.id, ava.id));
  assert.ok(SD.BY_CLASS.includes('homeroom_feedback'));
});

test('team desks: make, move, split; a handout on a team goes to every member; the desk, See the room and the shared pad', async () => {
  const team = body => as(rivera)(`/api/homeroom/${cls.id}/teams`, { body });
  for (const who of [ava, other, null]) assert.equal((await as(who)(`/api/homeroom/${cls.id}/teams`, { body: { action: 'make', members: [ava.id, zoe.id] } })).status, 404);
  assert.equal((await team({ action: 'make', members: [ava.id] })).json.code, 'teamTooSmall');
  assert.equal((await team({ action: 'make', members: [ava.id, otherKid.id] })).json.code, 'notInClass');
  let r = await team({ action: 'make', members: [ava.id, zoe.id] });
  assert.equal(r.status, 200, r.text);
  const t1 = r.json.team;
  assert.deepEqual(t1.members, [ava.id, zoe.id]);
  assert.deepEqual({ x: t1.x, y: t1.y }, H.roomOf(cls.id).seats[ava.id], 'where the first one sat');
  assert.equal((await team({ action: 'make', members: [zoe.id, mia.id] })).json.code, 'alreadyInTeam');
  r = await team({ action: 'move', id: t1.id, x: 1500, y: 900 });
  assert.equal(r.status, 200); assert.deepEqual([r.json.team.x, r.json.team.y], [1500, 900]);
  assert.equal((await team({ action: 'move', id: 'nope', x: 1, y: 1 })).json.code, 'noTeam');

  // a handout dropped on the team: every member, one assignment with exactly them
  const g = made(official, { title: 'Team Maze' });
  const give1 = await give(rivera, { gameId: g.id, to: { kind: 'team', id: t1.id }, grade: 'completion' });
  assert.equal(give1.status, 200, give1.text);
  const h = give1.json.handouts.find(x => x.title === 'Team Maze');
  assert.equal(h.target, 'team'); assert.deepEqual(L.studentsOfLesson(h.id).sort(), [ava.id, zoe.id].sort());
  assert.equal((await give(rivera, { gameId: g.id, to: { kind: 'team', id: 'nope' } })).json.code, 'noTeam');

  // the student's desk: "Team: names"; See the room shows the team desk once
  const room = H.roomForStudent(cls, ava);
  assert.deepEqual(room.team.names, [getUser(zoe.id).display_name], 'the others on the team, by the names classmates see');
  assert.equal(room.desks.some(d => d.id === ava.id || d.id === zoe.id), false, 'members are not drawn twice');
  assert.equal(room.teams.length, 1); assert.equal(room.teams[0].me, true);
  assert.deepEqual(room.teams[0].names.sort(), [getUser(ava.id).display_name, getUser(zoe.id).display_name].sort());
  const mroom = H.roomForStudent(cls, mia);
  assert.equal(mroom.team, null); assert.equal(mroom.teams[0].me, undefined);
  assert.equal(mroom.desks.length, 2, 'Mia and Ben alone, the team once');
  const page = await as(ava)(`/class/${cls.id}/desk`);
  assert.match(page.text, /"team":\{"id":/);

  // the shared pad: any member writes it, both read it; a save over a teammate's newer one comes back to merge
  const stroke = (x, c = '#141414') => ({ c, pts: [{ x, y: 0.1 }, { x: x + 0.1, y: 0.2 }] });
  r = await as(ava)(`/api/desk/${cls.id}/doodle`, { body: { strokes: [stroke(0.1)], base: 0 } });
  assert.equal(r.status, 200, r.text);
  const pv1 = r.json.pv;
  assert.deepEqual(H.doodleOf(cls.id, zoe.id).length, 1, 'Zoe sees Ava\'s stroke');
  let s = await as(zoe)(`/api/desk/${cls.id}/state?pv=0`);
  assert.equal(s.json.pv, pv1); assert.equal(s.json.strokes.length, 1);
  s = await as(zoe)(`/api/desk/${cls.id}/state?pv=${pv1}`);
  assert.equal(s.json.strokes, undefined, 'unchanged: no strokes again');
  r = await as(zoe)(`/api/desk/${cls.id}/doodle`, { body: { strokes: [stroke(0.1), stroke(0.5, '#1E88E5')], base: pv1 } });
  assert.equal(r.status, 200);
  // Ava saves from the old version: refused with the current pad (409), nothing lost
  const stale = await as(ava)(`/api/desk/${cls.id}/doodle`, { body: { strokes: [stroke(0.1), stroke(0.7)], base: pv1 } });
  assert.equal(stale.status, 409); assert.equal(stale.json.code, 'padChanged'); assert.equal(stale.json.strokes.length, 2);
  r = await as(ava)(`/api/desk/${cls.id}/doodle`, { body: { strokes: [...stale.json.strokes, stroke(0.7)], base: stale.json.pv } });
  assert.equal(r.status, 200); assert.equal(H.doodleOf(cls.id, zoe.id).length, 3);
  // Mia (not on the team) keeps her own pad; her state has no team pad
  assert.equal(H.doodleOf(cls.id, mia.id).length, 0);
  assert.equal((await as(mia)(`/api/desk/${cls.id}/state`)).json.pv, undefined);
  // the teacher's board has the team; the class page data too
  assert.equal(H.roomOf(cls.id).teams.length, 1);
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom`)).text, new RegExp(`"teams":\\[\\{"id":"${t1.id}"`));

  // split: back at their own desks, the shared pad is gone
  r = await team({ action: 'split', id: t1.id });
  assert.equal(r.status, 200); assert.deepEqual(r.json.teams, []);
  assert.equal(H.teamOf(cls.id, ava.id), null);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_doodles WHERE class_id=? AND user_id=?', cls.id, H.teamPadKey(t1.id)).n, 0);
  assert.equal(H.roomForStudent(cls, ava).desks.length, 4);

  // a student leaving the class leaves the team; a team left with one member is split
  const t2 = (await team({ action: 'make', members: [mia.id, ben.id, zoe.id] })).json.team;
  const leaver = kidIn(cls, 'Lea Leaving');
  const t3 = (await team({ action: 'make', members: [ava.id, leaver.id] })).json.team;
  await as(leaver)(`/api/desk/${cls.id}/doodle`, { body: { strokes: [stroke(0.2)], base: 0 } });
  assert.ok(S.removeFromClass(boss, cls.id, leaver.id).ok);
  const teams = H.roomOf(cls.id).teams;
  assert.deepEqual(teams.map(x => x.id), [t2.id], 'the two-person team is split');
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_doodles WHERE user_id=?', H.teamPadKey(t3.id)).n, 0);
  await team({ action: 'split', id: t2.id });
});

test('Also post to Google Classroom: asked for without a linked class, the handout is made and nothing is posted', async () => {
  const g = made(official, { title: 'Quiet Post' });
  const r = await give(rivera, { gameId: g.id, to: { kind: 'all' }, gcPost: true });
  assert.equal(r.status, 200, r.text);
  assert.doesNotMatch(r.json.toast, /Google Classroom/);
  // the board says whether the toggle shows (it needs Classroom on, connected, allowed and linked)
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom`)).text, /"gc":false/);
});
