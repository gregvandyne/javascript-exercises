// Oomba's Hub actions (services/companion-actions/homeroom.js): attendance, supports, groups, handing out and taking
// back, Needs a look, live class and the parents' view, each a card first, done only on Do it with the Hub's own
// service, read back, with Undo where it has one. Students are only placeholders: no name reaches the AI.
// Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const H = await import('./_companion-actions-harness.js');
const TOOLS = await import('./_tools-plan.js');
const { config } = await import('../../server/config.js');
const { q, now } = await import('../../server/db.js');
const S = await import('../../server/services/schools.js');
const G = await import('../../server/services/games.js');
const HR = await import('../../server/services/homeroom.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const SUP = await import('../../server/services/homeroom-supports.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const NL = await import('../../server/services/homeroom-look.js');
const PV = await import('../../server/services/homeroom-parents.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
TOOLS.plansOn();
H.boot();

/** A world whose teacher may run the Hub: the flag on, on its list, the Teacher plan. */
function hub() {
  const x = H.world();
  TOOLS.givePlan(x.teacher.id);
  config.homeroom = true;
  config.homeroomUsers = [...(config.homeroomUsers || []), x.teacher.username.toLowerCase()];
  assert.ok(HR.canUseClass(x.teacher, x.A), 'the teacher may use the Hub');
  return x;
}
const PAGE = x => ({ type: 'homeroom', classId: x.A.id });
const ask = (x, action, params, words = 'Please do it') => H.ask(x, action, params, PAGE(x), words);
const NAMES = ['Maya', 'Brook', 'Leo Stone'];
function noNames(calls, x) {
  const sent = H.sentToAi(calls);
  for (const n of NAMES) assert.ok(!sent.includes(n), `${n} went to the AI`);
  return sent;
}
const handouts = c => HO.boardView(c).handouts.filter(h => !h.cls);
const game = slug => G.getGameBySlug(slug);

test('takeAttendance: a card first, marked only on Do it, read back; Undo puts the marks back; everyone present', async () => {
  const x = hub();
  const a = await ask(x, 'takeAttendance', { students: ['[student 1]'], status: 'absent' }, 'Maya Brook is absent today');
  assert.equal(a.r.waitingForTeacher, true, JSON.stringify(a.r));
  assert.match(a.r.what, /Mark 1 student absent/);
  assert.match(a.card.title, /1 student absent today in Room 12 Owls/);
  assert.ok(a.card.lines.some(l => /Maya Brook/.test(l)), 'the name is on the teacher\'s own card');
  assert.equal(AT.statusOf(x.A.id, x.maya.id), '', 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  assert.equal(AT.statusOf(x.A.id, x.maya.id), 'absent');
  assert.match(done.change.lines[0], /Marked 1 student absent/);
  await H.undo(x, done.id);
  assert.equal(AT.statusOf(x.A.id, x.maya.id), '');
  noNames(a.calls, x);
  // everyone present: the marks of today go; Undo brings them back
  assert.ok(AT.mark(x.teacher, x.A, x.leo.id, 'home').ok);
  const all = await ask(x, 'takeAttendance', { everyone: 'present' }, 'Everyone is here');
  assert.match(all.card.title, /everyone in Room 12 Owls here/);
  assert.equal(AT.statusOf(x.A.id, x.leo.id), 'home');
  const d2 = await H.doIt(x, all.bot);
  assert.equal(AT.statusOf(x.A.id, x.leo.id), '');
  await H.undo(x, d2.id);
  assert.equal(AT.statusOf(x.A.id, x.leo.id), 'home');
  // refusals
  await H.refused(x, 'takeAttendance', { students: ['[student 1]'], status: 'late' }, /no Late mark/, PAGE(x));
  await H.refused(x, 'takeAttendance', { students: ['Maya Brook'], status: 'absent' }, /placeholder/, PAGE(x));
  await H.refused(x, 'takeAttendance', { status: 'absent' }, /Say which students/, PAGE(x));
  await H.refused(x, 'takeAttendance', { classRef: 'Room 20 Bears', everyone: 'present' }, /not one of the teacher's classes/, PAGE(x));
});

test('the Hub off for the teacher: refused with the reason, nothing changed', async () => {
  const x = hub();
  config.homeroom = false;
  try { await H.refused(x, 'startClass', {}, /The Hub is turned off/, PAGE(x)); } finally { config.homeroom = true; }
  const list = config.homeroomUsers;
  config.homeroomUsers = list.filter(n => n !== x.teacher.username.toLowerCase());
  try { await H.refused(x, 'takeAttendance', { everyone: 'present' }, /not turned on for this teacher/, PAGE(x)); } finally { config.homeroomUsers = list; }
  assert.equal(HR.liveOf(x.A.id), null);
});

test('setSupport: only what was asked changes, on Do it; the AI never hears the name or what the student had; Undo', async () => {
  const x = hub();
  assert.ok(SUP.setSupport(x.teacher, x.A, x.maya.id, { big: true }).ok);
  const a = await ask(x, 'setSupport', { student: '[student 1]', extraTime: '1.5x', readAloud: 'on' }, 'Give Maya Brook extra time and read aloud');
  assert.equal(a.r.waitingForTeacher, true, JSON.stringify(a.r));
  assert.match(a.card.title, /Maya Brook/);
  assert.ok(a.card.lines.includes('Bigger text'), 'the card shows what stays (page only)');
  assert.deepEqual(SUP.supportOf(x.A.id, x.maya.id), { time: 100, read: false, simple: false, big: true }, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  assert.deepEqual(SUP.supportOf(x.A.id, x.maya.id), { time: 150, read: true, simple: false, big: true });
  await H.undo(x, done.id);
  assert.deepEqual(SUP.supportOf(x.A.id, x.maya.id), { time: 100, read: false, simple: false, big: true });
  noNames(a.calls, x);
  // the student's current supports never go to the AI (only what the teacher asked for)
  assert.ok(!/big/i.test(JSON.stringify(a.r)), JSON.stringify(a.r));
  await H.refused(x, 'setSupport', { student: '[student 1]' }, /Say which support/, PAGE(x));
  await H.refused(x, 'setSupport', { student: '[student 1]', extraTime: '3x' }, /none, 1\.5x or 2x/, PAGE(x));
});

test('makeGroups: N mixed groups or groups from placeholders, on Do it; Undo puts the groups back', async () => {
  const x = hub();
  const was = HR.roomOf(x.A.id).groups.map(g => g.id);
  const a = await ask(x, 'makeGroups', { count: '2' }, 'Make 2 mixed groups');
  assert.match(a.card.title, /2 groups in Room 12 Owls/);
  assert.deepEqual(HR.roomOf(x.A.id).groups.map(g => g.id), was, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  const room = HR.roomOf(x.A.id);
  assert.equal(room.groups.length, 2);
  assert.ok(room.members[x.maya.id] && room.members[x.leo.id] && room.members[x.maya.id] !== room.members[x.leo.id], 'mixed into both groups');
  await H.undo(x, done.id);
  assert.deepEqual(HR.roomOf(x.A.id).groups.map(g => g.id), was);
  // from placeholders
  const b = await ask(x, 'makeGroups', { groups: [{ name: 'Readers', students: ['[student 1]', '[student 2]'] }] }, 'Put Maya Brook and Leo Stone in Readers');
  assert.ok(b.card.lines.some(l => /Readers: .*Maya Brook/.test(l)));
  await H.doIt(x, b.bot);
  const r2 = HR.roomOf(x.A.id);
  assert.equal(r2.groups[0].name, 'Readers'); assert.equal(r2.members[x.maya.id], r2.groups[0].id); assert.equal(r2.members[x.leo.id], r2.groups[0].id);
  noNames([a.calls, b.calls], x);
  await H.refused(x, 'makeGroups', { count: '9' }, /2 to 8/, PAGE(x));
  await H.refused(x, 'makeGroups', { groups: [{ name: 'A', students: ['Maya Brook'] }] }, /placeholder/, PAGE(x));
});

test('handOut: an Oomba lesson to every desk, a group or one desk, on Do it; Undo takes it back; a lesson plan of their own', async () => {
  const x = hub();
  const a = await ask(x, 'handOut', { game: 'word-hunt', to: 'everyone' }, 'Hand out Word Hunt');
  assert.equal(a.r.waitingForTeacher, true, JSON.stringify(a.r));
  assert.match(a.card.warn, /students' desks/);
  assert.match(a.card.title, /Word Hunt.*every desk.*Room 12 Owls/);
  assert.equal(handouts(x.A).length, 0, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  const list = handouts(x.A);
  assert.equal(list.length, 1); assert.equal(list[0].target, 'all');
  await H.undo(x, done.id);
  assert.equal(handouts(x.A).length, 0, 'taken back with Undo');
  // one desk, with a due day
  const b = await ask(x, 'handOut', { game: game('word-hunt').id, to: '[student 1]', due: '2026-12-04' }, 'Give Maya Brook Word Hunt for Friday');
  assert.match(b.card.title, /Maya Brook/);
  await H.doIt(x, b.bot);
  const one = handouts(x.A)[0];
  assert.equal(one.target, 'desk');
  assert.deepEqual(HO.boardView(x.A).desks[x.leo.id].filter(c => c.id === one.id), [], 'only that desk');
  // the same lesson again on that desk: refused before a card
  await H.refused(x, 'handOut', { game: 'word-hunt', to: '[student 1]' }, /already has it/, PAGE(x));
  // a lesson plan of their own
  assert.ok(HL.saveLesson(x.teacher, { slug: 'algebra-builder', title: 'Balance practice', base: M.defaults('algebra-builder', 2) }).ok);
  const c = await ask(x, 'handOut', { lesson: 'balance', to: 'everyone' });
  await H.doIt(x, c.bot);
  assert.ok(handouts(x.A).some(h => h.title === 'Balance practice' && h.lesson));
  noNames([a.calls, b.calls, c.calls], x);
  await H.refused(x, 'handOut', { game: 'no such lesson at all', to: 'everyone' }, /No Oomba lesson/, PAGE(x));
  await H.refused(x, 'handOut', { game: 'word-hunt', to: 'the dragons' }, /not one of the class's groups/, PAGE(x));
});

test('takeBack: off every desk or one desk on Do it (work kept); Undo hands it out again', async () => {
  const x = hub();
  const r = HO.handOut(x.teacher, x.A, { gameId: game('word-hunt').id, to: { kind: 'all' } });
  assert.ok(r.ok);
  const clId = r.classLesson.id;
  const a = await ask(x, 'takeBack', { handout: 'word hunt' });
  assert.match(a.card.warn, /Their work is kept/);
  assert.match(a.card.title, /every desk/);
  assert.ok(HO.handoutOf(x.A, clId), 'still there before the tap');
  const done = await H.doIt(x, a.bot);
  assert.equal(HO.handoutOf(x.A, clId), null);
  await H.undo(x, done.id);
  assert.ok(HO.handoutOf(x.A, clId), 'the same handout back with Undo');
  // one desk
  const b = await ask(x, 'takeBack', { handout: 'Word Hunt', student: '[student 1]' }, 'Take Word Hunt off Maya Brook\'s desk');
  assert.match(b.card.title, /Maya Brook/);
  const d2 = await H.doIt(x, b.bot);
  const desks = () => HO.boardView(x.A).desks;
  assert.ok(!desks()[x.maya.id].some(c => c.id === clId)); assert.ok(desks()[x.leo.id].some(c => c.id === clId));
  await H.undo(x, d2.id);
  assert.ok(desks()[x.maya.id].some(c => c.id === clId), 'back on that desk');
  noNames([a.calls, b.calls], x);
  await H.refused(x, 'takeBack', { handout: 'nothing like it' }, /Nothing handed out has that name/, PAGE(x));
});

test('needsSeen and needsSnooze: by the "Student A" of Needs a look, never a name; Undo puts the list back', async () => {
  const x = hub();
  // Leo: three handouts after due (work piling up), so he is the only one on the list
  const yesterday = new Date(now() - 2 * 86400e3).toISOString().slice(0, 10);
  const picks = G.listVisible(x.teacher, { official: true, shelf: 'learn', order: 'plays', limit: 60 }).filter(g => HO.handable(x.teacher, g)).slice(0, 3);
  assert.equal(picks.length, 3);
  for (const g of picks) assert.ok(HO.handOut(x.teacher, x.A, { gameId: g.id, to: { kind: 'desk', id: x.leo.id }, dueAt: yesterday }).ok);
  const list = () => NL.shown(x.A, NL.compute(x.A)).items;
  assert.deepEqual(list().map(i => i.id), [x.leo.id]);
  const a = await ask(x, 'needsSeen', { student: 'Student A' }, 'I checked on Student A');
  assert.equal(a.r.waitingForTeacher, true, JSON.stringify(a.r));
  assert.match(a.card.title, /Leo Stone/);
  assert.ok(a.card.lines.includes('Work piling up after due'));
  assert.equal(list().length, 1, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  assert.equal(list().length, 0);
  await H.undo(x, done.id);
  assert.equal(list().length, 1);
  const b = await ask(x, 'needsSnooze', { student: 'Student A' });
  const d2 = await H.doIt(x, b.bot);
  assert.equal(list().length, 0);
  await H.undo(x, d2.id);
  assert.equal(list().length, 1);
  const sent = noNames([a.calls, b.calls], x);
  assert.ok(!/overdue|after due|piling/i.test(JSON.stringify([H.resultOf(a.calls), H.resultOf(b.calls)])), 'why they are on the list is not in the action\'s result');
  assert.ok(!sent.includes(x.leo.id), 'no student id to the AI');
  await H.refused(x, 'needsSeen', { student: 'Student B' }, /not on Needs a look now/, PAGE(x));
  await H.refused(x, 'needsSeen', { student: 'Leo Stone' }, /like "Student A"/, PAGE(x));
  await H.refused(x, 'needsSeen', { student: 'Student A', reason: 'stuck' }, /not on the list for that reason/, PAGE(x));
});

test('startClass and endClass: live class only on Do it; Undo ends a class Oomba started; endClass has no Undo', async () => {
  const x = hub();
  const a = await ask(x, 'startClass', {}, 'Start class');
  assert.match(a.card.warn, /students' screens/);
  assert.equal(a.card.undoable, true);
  assert.equal(HR.liveOf(x.A.id), null, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  assert.ok(HR.liveOf(x.A.id));
  await H.undo(x, done.id);
  assert.equal(HR.liveOf(x.A.id), null);
  await H.refused(x, 'endClass', {}, /not live now/, PAGE(x));
  assert.ok(HR.setLive(x.teacher, x.A, 'start').ok);
  await H.refused(x, 'startClass', {}, /already on/, PAGE(x));
  const b = await ask(x, 'endClass', {}, 'End class');
  assert.equal(b.card.undoable, false);
  assert.ok(HR.liveOf(x.A.id), 'still live before the tap');
  await H.doIt(x, b.bot);
  assert.equal(HR.liveOf(x.A.id), null);
});

test('parentsView: on or off on Do it, with the parents warning; Undo puts it back', async () => {
  const x = hub();
  assert.equal(PV.parentsOn(x.A), true);
  const a = await ask(x, 'parentsView', { on: 'off' }, 'Turn off the parents view');
  assert.match(a.card.warn, /Parents will see this class/);
  assert.match(a.card.title, /Turn off the parents' view of Room 12 Owls/);
  assert.equal(PV.parentsOn(S.getClass(x.A.id)), true, 'nothing before the tap');
  const done = await H.doIt(x, a.bot);
  assert.equal(PV.parentsOn(S.getClass(x.A.id)), false);
  await H.undo(x, done.id);
  assert.equal(PV.parentsOn(S.getClass(x.A.id)), true);
  await H.refused(x, 'parentsView', { on: 'maybe' }, /on or off/, PAGE(x));
});

test('another teacher\'s class or an archived one: no Hub card', async () => {
  const x = hub();
  q.run('UPDATE classrooms SET archived_at=? WHERE id=?', now(), x.B.id);
  await H.refused(x, 'parentsView', { classRef: 'Room 14 Foxes', on: 'off' }, /Nothing was changed/, PAGE(x));
  await H.refused(x, 'startClass', { classRef: 'Room 20 Bears' }, /not one of the teacher's classes/, PAGE(x));
});
