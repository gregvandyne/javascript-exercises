// Homeroom: week plans, due dates, copying plans (docs/decisions.md "Homeroom: week plans, due dates, copying plans";
// services/homeroom-week.js, services/homeroom-plan.js, services/homeroom-handouts.js due dates, the companion's
// draftWeekPlan and the week card's taps, services/gclassroom.js classroomDue):
//   - the class's school week in its time zone; what the AI sends for a week is checked and clamped (days, half days,
//     minutes, games, groups, titles); without the AI a week is still drafted, and changed ("Wednesday is a half day",
//     "move the quiz to Thursday", "swap Monday and Tuesday"), or a saved plan repeats all week;
//   - in the chat (a stand-in AI): draftWeekPlan makes a week card, nothing personal is sent; Use this week saves five
//     dated day plans; on each day (in the class's zone) the pill picks up that day's plan, never auto-advancing; the
//     week strip's swap and clear;
//   - due dates: stored with a time, checked, shown (board, desk, overview), sorted on the desk, after due for the
//     teacher only (never for a day the student was absent), Google Classroom's due date and time;
//   - copying a day or a week plan to another class: the preview (groups by name or default key, a missing group goes to
//     everyone), nothing made until use; Copy to next week;
//   - who: only the class's teachers; the account and the class going take the dated plans.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const HP = await import('../../server/services/homeroom-plan.js');
const HW = await import('../../server/services/homeroom-week.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const OV = await import('../../server/services/homeroom-overview.js');
const GC = await import('../../server/services/gclassroom.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const { timing, MIN } = await import('../../public/js/homeroom-plan-time.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { dueText } = await import('../../server/routes/homeroom-overview.js');
const { fmt } = await import('../../server/i18n/index.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

const DAY = 86400e3, realNow = Date.now;
/** The clock for a block (services and pages read Date.now). */
async function at(t, fn) { Date.now = () => t; try { return await fn(); } finally { Date.now = realNow; } }
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; Date.now = realNow; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HwBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Week Oak' }).school;
S.updateSchool(boss, oak.id, { settings: { timeZone: 'America/Los_Angeles' } });
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const A = S.createClass(boss, oak.id, { name: 'Room 5A', grade: '5', teacherId: rivera.id }).class;
const B = S.createClass(boss, oak.id, { name: 'Room 5C', grade: '5', teacherId: rivera.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park'].map(n => kidIn(A, n));
const eli = kidIn(B, 'Eli Moss');
const NAMES = /Ava|Stone|Ben\b|Hill|Cleo|Park|Eli\b|Moss/;
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 200 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-hw');
const sudoku = made('Sudoku Garden', 'sudoku-garden-hw');
const ladder = made('Word Ladder', 'word-ladder-hw');
made('Arithmetic Lab', 'arithmetic-lab');
const warmup = HL.saveLesson(rivera, { slug: 'arithmetic-lab', title: 'Fractions warm-up', base: M.defaults('arithmetic-lab', 5), versions: [] }).lesson;
// A: the default groups (Stretch: Ava, Ben; Building: Cleo). B (5C): its own groups, "On track" by name and Rockets.
const [stretch, , building] = H.roomOf(A.id).groups;
assert.ok(H.saveGroups(rivera, A, { groups: H.roomOf(A.id).groups, members: { [kids[0].id]: stretch.id, [kids[1].id]: stretch.id, [kids[2].id]: building.id } }).ok);
assert.ok(H.saveGroups(rivera, B, { groups: [{ id: 'g1', key: '', name: 'On track', color: '#1F9D63' }, { id: 'g2', key: '', name: 'Rockets', color: '#3F8FCF' }], members: { [eli.id]: 'g1' } }).ok);
const page = c => ({ type: 'homeroom', classId: c.id });
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
const say = async (who, text, pg) => { const r = await as(who)('/api/companion/chat', { body: { text, page: pg } }); assert.equal(r.status, 200, r.text); await C.allSettled(); return r.json; };
const lastBot = async who => (await as(who)('/api/companion/chat')).json.chat.turns.filter(x => x.role === 'oomba').at(-1);
const act = (who, turnId, a, value) => as(who)('/api/companion/chat/act', { body: { turnId, act: a, ...(value !== undefined ? { value } : {}) } });
const resultOf = (calls, i) => JSON.parse(calls[i].messages.at(-1).content.find(c => c.type === 'tool_result').content);
const clearAll = c => { q.run("UPDATE homeroom_rooms SET day_plan='' WHERE class_id=?", c.id); q.run('DELETE FROM homeroom_week_days WHERE class_id=?', c.id); for (const h of HO.boardView(c).handouts) HO.removeHandout(rivera, c, h.id); };
// Next school week in the class's zone (Los Angeles, UTC-8 in winter); a day of it at a local hour.
const NEXT = HW.weekOf(A, realNow(), 1);
const localAt = (iso, hour) => Date.parse(`${iso}T00:00:00Z`) + (hour + 8) * 3600e3;
const dayParts = (gameId, exit = 'One thing I learned') => [{ kind: 'slides', minutes: 5, title: 'Warm up' }, { kind: 'work', minutes: 20, gameId }, { kind: 'break', minutes: 3, title: 'Simon says' }, { kind: 'exit', minutes: 5, title: exit }];

test('the class\'s school week, counted in its time zone', () => {
  // Monday 30 Nov 2026, 10 pm in Los Angeles is already Tuesday in UTC: still Monday for the class
  const mon = Date.UTC(2026, 11, 1, 6, 0);
  assert.equal(HW.todayIso(A, mon), '2026-11-30');
  assert.deepEqual(HW.weekOf(A, mon), { start: '2026-11-30', days: ['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04'], today: '2026-11-30' });
  // Saturday and Sunday: the week ahead
  assert.equal(HW.weekOf(A, Date.UTC(2026, 11, 5, 20, 0)).start, '2026-12-07');
  assert.equal(HW.weekOf(A, Date.UTC(2026, 11, 6, 20, 0)).start, '2026-12-07');
  assert.equal(HW.weekOf(A, mon, 1).start, '2026-12-07', 'next week');
  assert.equal(HW.dayIndex('Wednesday'), 2); assert.equal(HW.dayIndex('thu'), 3); assert.equal(HW.dayIndex('Saturday'), -1);
});

test('what the AI sends for a week is checked: days, half days, minutes, games, groups, titles without names', () => {
  const r = HW.cleanWeek(rivera, A, {
    name: 'Fractions week with Ava', topic: 'fractions', week: 'next',
    days: [
      { day: 'Monday', parts: [{ kind: 'slides', minutes: 90, title: 'Fractions with Ben' }, { kind: 'work', minutes: 20, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Rockets', gameId: sudoku.id }] }] },
      { day: 'Wednesday', half: true, parts: [{ kind: 'work', minutes: 50, gameId: 'no-such-game' }, { kind: 'work', minutes: 40, lessonId: warmup.id }] },
      { day: 'Saturday', parts: [{ kind: 'slides', minutes: 5 }] },
      { day: 'Monday', parts: [{ kind: 'slides', minutes: 5 }] },
      { day: 'Friday', parts: [{ kind: 'nap', minutes: 5 }] },
    ],
  });
  const w = r.week;
  assert.equal(w.start, NEXT.start); assert.deepEqual(w.days.map(d => d.date), NEXT.days);
  assert.equal(w.name, '', 'a student\'s name in the week\'s name: dropped');
  assert.equal(w.days[0].plan.parts[0].minutes, 30, 'minutes clamped'); assert.equal(w.days[0].plan.parts[0].title, '');
  assert.deepEqual(w.days[0].plan.parts[1].versions, [{ group: stretch.id, pick: { type: 'game', id: pizza.id } }], 'an unknown group: left out');
  assert.equal(w.days[1].plan, null, 'Tuesday: no plan');
  assert.equal(w.days[2].half, true);
  assert.deepEqual(w.days[2].plan.parts.map(p => p.minutes), [50, 10], 'a half day: 60 minutes at most');
  assert.deepEqual(w.days[2].plan.parts[0].versions, [], 'an unknown game: left out');
  assert.equal(w.days[4].plan, null, 'Friday: nothing kept');
  assert.ok(r.notes.some(n => n.k === 'day' && n.day === 'Saturday'));
  assert.ok(r.notes.some(n => n.k === 'dayTwice' && n.day === 'Mon'));
  assert.ok(r.notes.some(n => n.k === 'group' && n.group === 'Rockets' && n.day === 'Mon'));
  assert.ok(r.notes.some(n => n.k === 'total' && n.day === 'Wed') || r.notes.some(n => n.k === 'minutes' && n.day === 'Wed'));
});

test('in the chat: a week card, nothing personal sent; Use this week saves five dated day plans; each day the pill picks up its plan, never moving on by itself', async () => {
  clearAll(A);
  const week = { name: 'Fractions week', topic: 'fractions', week: 'next', days: [
    { day: 'Monday', parts: [...dayParts(pizza.id).slice(0, 2), { kind: 'work', minutes: 10, groups: [{ group: 'Stretch', gameId: ladder.id }, { group: 'Building', lessonId: warmup.id }] }] },
    { day: 'Tuesday', parts: dayParts(sudoku.id) }, { day: 'Wednesday', parts: dayParts(ladder.id) }, { day: 'Thursday', parts: dayParts(pizza.id) },
    { day: 'Friday', parts: dayParts(sudoku.id, 'Quiz') }] };
  const calls = standIn((p, i) => (i === 0 ? toolUse('getPageContext', {}) : i === 1 ? toolUse('draftWeekPlan', week) : 'Here is next week: a short plan each day. Ask for changes or tap Use this week.'));
  await say(rivera, 'Plan next week on fractions; Ava and Ben need the harder pizza game', page(A));
  assert.ok(calls[0].tools.some(t => t.name === 'draftWeekPlan'));
  assert.match(calls[0].system, /Week plans: when the teacher asks for this week/);
  const sent = JSON.stringify(calls);
  assert.doesNotMatch(sent, NAMES, 'never a student name');
  for (const k of kids) assert.ok(!sent.includes(k.id), 'never a student id');
  const ctx = resultOf(calls, 1).homeroom;
  assert.equal(ctx.schoolWeek.days.length, 5);
  const back = resultOf(calls, 2);
  assert.equal(back.shownOnCard, true); assert.equal(back.week.days.length, 5);
  assert.equal(back.week.days[0].plan.parts[2].handouts.map(h => h.for).join(), 'Stretch,Building');
  const bot = await lastBot(rivera), card = bot.note.week;
  assert.equal(card.state, 'draft'); assert.equal(card.className, 'Room 5A'); assert.equal(card.days.length, 5);
  assert.deepEqual(card.days.map(d => d.date), NEXT.days);
  assert.equal(card.days[4].parts[3].title, 'Quiz');
  assert.deepEqual(card.copy.map(c => c.name), ['Room 5C']);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE class_id=?', A.id).n, 0, 'nothing saved before Use this week');

  // Use this week: five dated day plans, nothing on desks
  const used = await act(rivera, bot.id, 'planWeekUse');
  assert.equal(used.status, 200, used.text);
  assert.match(used.json.toast, /5 days saved/);
  assert.deepEqual(q.all('SELECT day FROM homeroom_week_days WHERE class_id=? ORDER BY day', A.id).map(r => r.day), NEXT.days);
  assert.equal(HO.boardView(A).handouts.length, 0, 'nothing on desks yet');
  assert.equal((await lastBot(rivera)).note.week.state, 'used');

  // Wednesday of that week, 8 am in Los Angeles: the pill has Wednesday's plan, waiting for Start
  const wed = localAt(NEXT.days[2], 8);
  await at(wed, async () => {
    const v = HP.teacherView(A);
    assert.equal(v.state, 'planned'); assert.deepEqual(v.parts.map(p => p.kind), ['slides', 'work', 'break', 'exit']);
    assert.equal(v.week.days.length, 5); assert.equal(v.week.days[2].today, true); assert.equal(v.week.days[1].past, true);
    assert.equal(HP.publicView(A), null, 'the projector and desks: nothing until it starts');
    // Wednesday 11 pm in Los Angeles is Thursday in UTC: still Wednesday's plan
    assert.equal(HP.teacherView(A, localAt(NEXT.days[2], 23)).id, v.id);
    // Start: the handouts go on desks and part 1 starts
    const r = await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'start' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.plan.state, 'running'); assert.match(r.json.toast, /handouts? (is|are) on desks/);
    assert.deepEqual(HO.deskView(A, kids[0]).map(x => x.title), ['Word Ladder']);
  });
  // an hour later: still part 1, Time's up (never moves on by itself)
  await at(wed + 60 * MIN, () => {
    const v = HP.teacherView(A);
    assert.equal(v.state, 'running'); assert.equal(v.run.idx, 0); assert.equal(v.timesUp, true);
    assert.equal(timing(v.parts, v.run, Date.now()).idx, 0);
  });
  // Thursday: Thursday's plan, Wednesday's handouts stay on desks as homework
  await at(localAt(NEXT.days[3], 8), () => {
    const v = HP.teacherView(A);
    assert.equal(v.state, 'planned'); assert.equal(v.week.days[3].today, true);
    assert.deepEqual(HO.deskView(A, kids[0]).map(x => x.title), ['Word Ladder']);
    // Put on desks (without starting): ready, Start is the teacher's
    const r = HP.runAction(rivera, A, 'use');
    assert.ok(r.ok); assert.equal(HP.teacherView(A).state, 'ready'); assert.equal(HP.teacherView(A).run, null);
    assert.ok(r.put.given >= 1);
  });
});

test('the week strip: swap two days, clear one; never a day already over; only the class\'s teachers', async () => {
  clearAll(A);
  const w = HW.cleanWeek(rivera, A, { name: 'Week', week: 'next', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d, i) => ({ day: d, name: `Day ${i + 1}`, parts: dayParts([pizza, sudoku, ladder][i % 3].id) })) }).week;
  assert.ok(HW.useWeek(rivera, A, w).ok);
  const tue = localAt(NEXT.days[1], 9);
  await at(tue, async () => {
    const r = await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'weekSwap', day: NEXT.days[3], with: NEXT.days[4] } });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.plan.week.days.map(d => d.plan && d.plan.name), ['Day 1', 'Day 2', 'Day 3', 'Day 5', 'Day 4']);
    assert.equal((await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'weekClear', day: NEXT.days[2] } })).status, 200);
    assert.equal(HP.teacherView(A).week.days[2].plan, undefined);
    assert.equal((await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'weekClear', day: NEXT.days[0] } })).json.code, 'pastDay', 'Monday is over');
    assert.equal((await as(other)(`/api/homeroom/${A.id}/plan`, { body: { action: 'weekClear', day: NEXT.days[3] } })).status, 404, 'not their class');
    assert.equal(HW.dayAction(other, A, 'weekClear', { day: NEXT.days[3] }).code, 'notFound');
    assert.equal(HP.teacherView(A).name, 'Day 2', 'today\'s plan');
  });
});

test('without the AI: a week spread over the days, then "Wednesday is a half day", "move the quiz to Thursday", "swap Monday and Tuesday", a saved plan all week', async () => {
  clearAll(A);
  CO.hooks.create = null;
  await say(rivera, 'Plan next week on fractions', page(A));
  let card = (await lastBot(rivera)).note.week;
  assert.ok(card, 'a week card without the AI');
  assert.equal(card.days.filter(d => d.parts).length, 5);
  assert.ok(card.days.every(d => d.parts.some(p => p.kind === 'work' && p.give.length)), 'a lesson or game each day');
  assert.equal(card.days[0].parts[1].give[0].what, 'Fractions warm-up', 'the teacher\'s own lesson that fits first');
  assert.equal(card.days[4].parts[3].title, 'Quiz');
  await say(rivera, 'Wednesday is a half day', page(A));
  card = (await lastBot(rivera)).note.week;
  assert.equal(card.days[2].half, true); assert.ok(card.days[2].total <= HW.HALF_MAX && card.days[2].total < card.days[1].total);
  await say(rivera, 'move the quiz to Thursday', page(A));
  card = (await lastBot(rivera)).note.week;
  assert.ok(card.days[3].parts.some(p => p.title === 'Quiz')); assert.ok(!card.days[4].parts.some(p => p.title === 'Quiz'));
  const monName = card.days[0].parts[1].give[0].what, tueName = card.days[1].parts[1].give[0].what;
  await say(rivera, 'swap Monday and Tuesday', page(A));
  card = (await lastBot(rivera)).note.week;
  assert.equal(card.days[0].parts[1].give[0].what, tueName); assert.equal(card.days[1].parts[1].give[0].what, monName);
  // a saved plan on every day
  assert.ok(HP.savePlan(rivera, A, HP.cleanPlan(rivera, A, { parts: dayParts(ladder.id) }).plan, 'Ladder day').ok);
  await say(rivera, 'Repeat my Ladder day plan all week', page(A));
  card = (await lastBot(rivera)).note.week;
  assert.ok(card.days.every(d => d.parts && d.parts[1].give[0].what === 'Word Ladder'));
});

test('due dates: a day and a time, checked, shown on the board and the desk, sorted on Next up, after due for the teacher only', async () => {
  clearAll(A);
  // Tuesday next week, 9 am in Los Angeles
  const tue = localAt(NEXT.days[1], 9);
  await at(tue, () => {
    assert.equal(HO.handOut(rivera, A, { gameId: pizza.id, to: { kind: 'all' }, dueTime: '15:00' }).code, 'badDate', 'a time needs a day');
    assert.equal(HO.handOut(rivera, A, { gameId: pizza.id, to: { kind: 'all' }, dueAt: NEXT.days[4], dueTime: '25:00' }).code, 'badDate');
    // any order: no due date, due Friday 3 pm, due today (end of day)
    assert.ok(HO.handOut(rivera, A, { gameId: ladder.id, to: { kind: 'all' }, order: 'any' }).ok);
    const fri = HO.handOut(rivera, A, { gameId: pizza.id, to: { kind: 'all' }, order: 'any', dueAt: NEXT.days[4], dueTime: '15:00' });
    assert.ok(fri.ok, fri.code);
    assert.ok(HO.handOut(rivera, A, { gameId: sudoku.id, to: { kind: 'all' }, order: 'any', dueAt: NEXT.days[1] }).ok);
    const ho = HO.boardView(A).handouts.find(h => h.id === fri.classLesson.id);
    assert.equal(ho.dueMin, 900); assert.equal(ho.due, Date.parse(`${NEXT.days[4]}T00:00:00Z`));
    assert.equal(ho.dueBy, Date.parse(`${NEXT.days[4]}T23:00:00Z`), '3 pm in Los Angeles');
    // the desk: soonest due first (Next up), no due date last; no lateness for students ever
    const desk = HO.deskView(A, kids[0]);
    assert.deepEqual(desk.map(x => x.title), ['Sudoku Garden', 'Fraction Pizza', 'Word Ladder']);
    assert.equal(desk[0].next, true);
    assert.ok(desk.every(x => !('late' in x)));
    // a lesson with a due time too
    const ls = HL.handOutLesson(rivera, A, { lessonId: warmup.id, to: { kind: 'all' }, dueAt: NEXT.days[2], dueTime: '08:30' });
    assert.ok(ls.ok, ls.code);
    assert.equal(q.get('SELECT due_min FROM homeroom_handouts WHERE class_lesson_id=?', ls.classLessons[0].id).due_min, 510);
  });
  // In order cards keep their places; the any-order ones around them still go by due
  assert.deepEqual(HO.byDue([{ id: 'a', inOrder: true }, { id: 'b', dueBy: 5 }, { id: 'c', inOrder: true }, { id: 'd', dueBy: 2 }]).map(x => x.id), ['a', 'd', 'c', 'b']);
  // Ava is absent on Tuesday; Wednesday morning: the Tuesday handout is after due for Ben and Cleo, never for Ava
  await at(tue + 60 * MIN, () => assert.ok(AT.mark(rivera, A, kids[0].id, 'absent').ok));
  await at(tue + 2 * 60 * MIN, () => assert.ok(HO.handOut(rivera, A, { gameId: made('Bingo', 'bingo-hw').id, to: { kind: 'all' }, dueAt: NEXT.days[1], dueTime: '14:00' }).ok));
  await at(localAt(NEXT.days[2], 8), () => {
    const b = HO.boardView(A), bingo = b.handouts.find(h => h.title === 'Bingo'), sud = b.handouts.find(h => h.title === 'Sudoku Garden');
    assert.equal(b.desks[kids[1].id].find(x => x.id === bingo.id).late, true, 'after due, for the teacher');
    assert.equal(b.desks[kids[0].id].find(x => x.id === bingo.id).late, undefined, 'missed while away: never after due by itself');
    assert.equal(b.desks[kids[1].id].find(x => x.id === sud.id).late, true);
    assert.equal(b.desks[kids[1].id].find(x => x.id === b.handouts.find(h => h.title === 'Fraction Pizza').id).late, undefined, 'not due yet');
    // the overview: when it is due under the column, after due in the cell (not for Ava)
    const ov = OV.overview(A);
    const col = ov.columns.findIndex(x => x.id === bingo.id);
    assert.equal(ov.columns[col].dueMin, 840);
    const cell = n => ov.students.find(s => s.name === n).cells[col];
    assert.equal(cell('Ben Hill').afterDue, true); assert.equal(cell('Ava Stone').afterDue, undefined);
    // the student's desk still says only when it was due
    assert.ok(HO.deskView(A, kids[1]).every(x => !('late' in x)));
  });
  assert.equal(dueText(fmt('en'), Date.parse(`${NEXT.days[4]}T00:00:00Z`), 900).replace(/\s/g, ' '), `${new Date(`${NEXT.days[4]}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}, 3:00 PM`);
});

test('Google Classroom: a handout\'s due time is the coursework\'s due date and time; without one, the end of the day', async () => {
  clearAll(A);
  const now0 = localAt(NEXT.days[0], 9);
  await at(now0, () => {
    const a = HO.handOut(rivera, A, { gameId: pizza.id, to: { kind: 'all' }, dueAt: NEXT.days[4], dueTime: '15:00' });
    const b = HO.handOut(rivera, A, { gameId: sudoku.id, to: { kind: 'all' }, dueAt: NEXT.days[4] });
    const cl = id => ({ ...L.getClassLesson(id), tz: 'America/Los_Angeles' });
    const [y, m, d] = NEXT.days[4].split('-').map(Number);
    assert.deepEqual(GC.classroomDue(cl(a.classLesson.id), now0), { dueDate: { year: y, month: m, day: d }, dueTime: { hours: 23, minutes: 0 } }, '3 pm in Los Angeles is 23:00 UTC');
    const end = GC.classroomDue(cl(b.classLesson.id), now0);
    assert.deepEqual(end.dueTime, { hours: 7, minutes: 59 }, 'the end of the day there');
    // a school without a zone: the zone of the teacher who set the time
    const noZone = { ...L.getClassLesson(a.classLesson.id), tz: '' };
    q.run("UPDATE homeroom_handouts SET due_zone='America/New_York' WHERE class_lesson_id=?", a.classLesson.id);
    assert.deepEqual(GC.classroomDue(noZone, now0).dueTime, { hours: 20, minutes: 0 }, '3 pm in New York');
    // past due: left off (Classroom refuses it)
    assert.equal(GC.classroomDue(cl(a.classLesson.id), localAt(NEXT.days[4], 16)), null);
  });
});

test('copying a plan: the preview first (groups by name or key, a missing group goes to everyone), nothing made until it is used; a week too, and Copy to next week', async () => {
  clearAll(A); clearAll(B);
  standIn((p, i) => (i === 0 ? toolUse('draftDayPlan', { name: 'Fractions day', parts: [{ kind: 'slides', minutes: 5 }, { kind: 'work', minutes: 15, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'On track', gameId: sudoku.id }, { group: 'Building', gameId: ladder.id }] }, { kind: 'exit', minutes: 5, make: { slug: 'arithmetic-lab', op: 'multiply', title: 'Times check' } }] }) : 'Drafted.'));
  await say(rivera, 'Plan today on fractions', page(A));
  const bot = await lastBot(rivera);
  const lessons0 = HL.listMine(rivera).length, turns0 = (await as(rivera)('/api/companion/chat')).json.chat.turns.length;
  const pv = await act(rivera, bot.id, 'planCopyPreview', B.id);
  assert.equal(pv.status, 200, pv.text);
  const p = pv.json.preview;
  assert.equal(p.className, 'Room 5C'); assert.equal(p.kind, 'day');
  assert.deepEqual(p.parts[1].give.map(g => [g.who, g.what, g.everyone]), [['', 'Fraction Pizza', true], ['On track', 'Sudoku Garden', false]], 'On track found by its name; Stretch goes to everyone');
  assert.deepEqual(p.missing.map(m => [m.group, m.to]), [['Stretch', 'everyone'], ['Building', 'none']]);
  assert.equal(p.parts[2].give[0].type, 'make');
  assert.equal((await as(rivera)('/api/companion/chat')).json.chat.turns.length, turns0, 'the preview changes nothing');
  // the copy: a card for 5C; no handout and no new lesson in 5C until it is used there
  assert.equal((await act(rivera, bot.id, 'planCopy', B.id)).status, 200);
  const copy = (await lastBot(rivera)).note.plan;
  assert.equal(copy.className, 'Room 5C');
  assert.equal(HO.boardView(B).handouts.length, 0); assert.equal(HL.listMine(rivera).length, lessons0);
  const used = await act(rivera, (await lastBot(rivera)).id, 'planUse');
  assert.equal(used.status, 200, used.text);
  assert.equal(HL.listMine(rivera).length, lessons0 + 1, 'the lesson is made at use time, in 5C');
  assert.deepEqual(HO.deskView(B, eli).map(x => x.title).sort(), ['Sudoku Garden', 'Times check'].sort());
  // someone else can't preview a copy to a class that isn't theirs
  const mine = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: other.id }).class;
  assert.equal((await act(rivera, bot.id, 'planCopyPreview', mine.id)).status, 404);

  // a week: the preview names the days; Copy to next week a week later
  clearAll(B);
  standIn((p2, i) => (i === 0 ? toolUse('draftWeekPlan', { name: 'Fractions week', days: [{ day: 'Monday', parts: [{ kind: 'work', minutes: 20, groups: [{ group: 'Stretch', gameId: pizza.id }] }] }, { day: 'Tuesday', parts: dayParts(sudoku.id) }] }) : 'Drafted.'));
  await say(rivera, 'This week\'s plan please', page(A));
  const wb = await lastBot(rivera);
  const wp = (await act(rivera, wb.id, 'planWeekCopyPreview', B.id)).json.preview;
  assert.equal(wp.kind, 'week'); assert.equal(wp.days.length, 5);
  assert.deepEqual(wp.days[0].parts[0].give.map(g => [g.who, g.everyone]), [['', true]]);
  assert.deepEqual(wp.missing.map(m => [m.group, m.to]), [['Stretch', 'everyone']]);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE class_id=?', B.id).n, 0);
  assert.equal((await act(rivera, wb.id, 'planWeekCopy', B.id)).status, 200);
  assert.equal((await lastBot(rivera)).note.week.className, 'Room 5C');
  assert.equal((await act(rivera, wb.id, 'planWeekNext')).status, 200);
  const nx = (await lastBot(rivera)).note.week;
  assert.equal(nx.className, 'Room 5A');
  assert.equal(nx.start, new Date(Date.parse(`${wb.note.week.start}T00:00:00Z`) + 7 * DAY).toISOString().slice(0, 10));
  assert.equal(nx.days[1].parts[1].give[0].what, 'Sudoku Garden');
});

test('the account goes: the dated plans it made go too; a class deleted takes its own', () => {
  const t = staff('Ms Gone'); TOOLS.givePlan(t.id);
  config.homeroomUsers = [...config.homeroomUsers, t.username.toLowerCase()];
  const c = S.createClass(boss, oak.id, { name: 'Room 3', teacherId: t.id }).class;
  const w = HW.cleanWeek(t, c, { week: 'next', days: [{ day: 'Monday', parts: [{ kind: 'slides', minutes: 5 }] }] }).week;
  assert.ok(HW.useWeek(t, c, w).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE created_by=?', t.id).n, 1);
  assert.ok(deleteAccount(t.id, boss, { by: 'admin', parentMade: false, leaveSchools: true }).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE created_by=?', t.id).n, 0);
  const c2 = S.createClass(boss, oak.id, { name: 'Room 4', teacherId: rivera.id }).class;
  assert.ok(HW.useWeek(rivera, c2, HW.cleanWeek(rivera, c2, { week: 'next', days: [{ day: 'Monday', parts: [{ kind: 'slides', minutes: 5 }] }] }).week).ok);
  S.classDeleted(c2.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_week_days WHERE class_id=?', c2.id).n, 0);
});
