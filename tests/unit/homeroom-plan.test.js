// Homeroom: the day plan (docs/decisions.md "Homeroom: the day plan"; services/homeroom-plan.js, the Oomba chat's plan
// tools in services/companion.js, routes/homeroom.js /api/homeroom/:id/plan, public/js/homeroom-plan-time.js):
//   - the timer: Now, countdown, Next, Time's up that never moves on by itself, +5 min, Next, running behind;
//   - what the AI sends is checked and clamped (kinds, minutes, total, games, lessons, groups, titles);
//   - in the chat (a stand-in AI): draftDayPlan makes a card; the AI never sees a student's name or id; Use this plan
//     puts the handouts on desks per group (and whole class), Start plan, the pill's +5 / Next / Finish class with its
//     summary (counts only), unfinished handouts staying on desks;
//   - without the AI: a starting plan, "make work time 20 minutes", "swap the brain break", "use my ... plan again";
//   - saved plans (Save plan, Saved plans, useSavedPlan) and Copy to another class (groups found by name); a new lesson
//     built with the lesson builder's data model;
//   - who: only the class's teachers; the projector and desks get part names and the timer only.
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
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const RL = await import('../../server/services/ratelimit.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const { timing, clock, MIN } = await import('../../public/js/homeroom-plan-time.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HpBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Plan Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const A = S.createClass(boss, oak.id, { name: 'Room 7A', grade: '4', teacherId: rivera.id }).class;
const B = S.createClass(boss, oak.id, { name: 'Room 7B', grade: '4', teacherId: rivera.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Rao'].map(n => kidIn(A, n));
const eli = kidIn(B, 'Eli Moss');
const NAMES = /Ava|Stone|Ben\b|Hill|Cleo|Park|Dev\b|Rao|Eli\b|Moss/;
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 200 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-hp');
const sudoku = made('Sudoku Garden', 'sudoku-garden-hp');
const ladder = made('Word Ladder', 'word-ladder-hp');
made('Arithmetic Lab', 'arithmetic-lab');
const warmup = HL.saveLesson(rivera, { slug: 'arithmetic-lab', title: 'Fractions warm-up', base: M.defaults('arithmetic-lab', 5), versions: [] }).lesson;
// Groups in A: Stretch (Ava, Ben), Building (Cleo); Dev in none. B: Eli in Stretch.
const [stretch, onTrack, building] = H.roomOf(A.id).groups;
assert.ok(H.saveGroups(rivera, A, { groups: H.roomOf(A.id).groups, members: { [kids[0].id]: stretch.id, [kids[1].id]: stretch.id, [kids[2].id]: building.id } }).ok);
const bGroups = H.roomOf(B.id).groups;
assert.ok(H.saveGroups(rivera, B, { groups: bGroups, members: { [eli.id]: bGroups[0].id } }).ok);
const page = c => ({ type: 'homeroom', classId: c.id });

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
const say = async (who, text, pg) => { const r = await as(who)('/api/companion/chat', { body: { text, page: pg } }); assert.equal(r.status, 200, r.text); await C.allSettled(); return r.json; };
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const lastBot = async who => (await chatOf(who)).turns.filter(x => x.role === 'oomba').at(-1);
const act = (who, turnId, a, value) => as(who)('/api/companion/chat/act', { body: { turnId, act: a, ...(value !== undefined ? { value } : {}) } });
const resultOf = (calls, i) => JSON.parse(calls[i].messages.at(-1).content.find(c => c.type === 'tool_result').content);
const reset = c => q.run("UPDATE homeroom_rooms SET day_plan='' WHERE class_id=?", c.id);

test('the timer: Now and its countdown, Next, Time\'s up that never moves on by itself, +5 min, running behind', () => {
  const parts = [{ kind: 'slides', minutes: 8 }, { kind: 'work', minutes: 20 }, { kind: 'break', minutes: 3 }, { kind: 'exit', minutes: 5 }];
  const t0 = 1_000_000_000_000;
  assert.equal(timing(parts, null, t0).plannedMin, 36, 'planned: 36 minutes');
  const run = { idx: 0, startedAt: t0, partAt: t0, extra: 0 };
  let x = timing(parts, run, t0 + 3 * MIN);
  assert.equal(x.idx, 0); assert.equal(x.left, 5 * MIN); assert.equal(x.timesUp, false); assert.equal(x.next.kind, 'work'); assert.equal(x.behindMin, 0);
  assert.equal(clock(x.left), '5:00'); assert.equal(clock(65 * MIN + 5000), '1:05:05');
  // long past its time: still part 1 (only the teacher's Next moves on), Time's up, and how far behind, calmly
  x = timing(parts, run, t0 + 30 * MIN);
  assert.equal(x.idx, 0, 'never moves on by itself'); assert.equal(x.timesUp, true); assert.equal(x.left, -22 * MIN); assert.equal(x.behindMin, 22);
  // +5 min: the same part ends 5 minutes later
  x = timing(parts, { ...run, extra: 5 * MIN }, t0 + 10 * MIN);
  assert.equal(x.timesUp, false); assert.equal(x.left, 3 * MIN);
  // Next at minute 12 (4 late): the work part counts from then; behind is what the rest would make it
  x = timing(parts, { ...run, idx: 1, partAt: t0 + 12 * MIN }, t0 + 13 * MIN);
  assert.equal(x.part.kind, 'work'); assert.equal(x.left, 19 * MIN); assert.equal(x.behindMin, 4);
  // past the last part: done, nothing running
  x = timing(parts, { ...run, idx: 4, done: true }, t0 + 40 * MIN);
  assert.equal(x.done, true); assert.equal(x.part, null); assert.equal(x.usedMin, 40); assert.equal(x.behindMin, 4);
});

test('what the AI sends is checked: kinds, minutes and the total clamped, only real games, lessons and groups, titles without names', () => {
  const r = HP.cleanPlan(rivera, A, {
    name: 'Fractions day', topic: 'fractions',
    parts: [
      { kind: 'slides', minutes: 90, title: 'Fractions with Ava' },
      { kind: 'nap', minutes: 5 },
      { kind: 'work', minutes: 2, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'building', lessonId: warmup.id }, { group: 'Rockets', gameId: sudoku.id }, { group: 'On track', gameId: 'no-such-game' }], instructions: 'Play two rounds.' },
      { kind: 'break', minutes: 3, title: 'Stretch group dance', gameId: pizza.id },
      { kind: 'exit', minutes: 5, lessonId: 'not-mine' },
      { kind: 'work', minutes: 60 }, { kind: 'work', minutes: 60 }, { kind: 'work', minutes: 10 },
    ],
  });
  const p = r.plan;
  assert.deepEqual(p.parts.map(x => [x.kind, x.minutes]), [['slides', 30], ['work', 3], ['break', 3], ['exit', 5], ['work', 60], ['work', 19]], 'minutes in range; 120 in all');
  assert.equal(p.parts[0].title, '', 'a student\'s name in a title: dropped');
  assert.equal(p.parts[2].title, '', 'a group\'s name in a title: dropped (titles reach the projector)');
  assert.deepEqual(p.parts[2].versions, [], 'a brain break hands nothing out');
  assert.deepEqual(p.parts[1].versions, [{ group: stretch.id, pick: { type: 'game', id: pizza.id } }, { group: building.id, pick: { type: 'lesson', id: warmup.id } }]);
  assert.equal(p.parts[1].note, 'Play two rounds.');
  assert.deepEqual(p.parts[3].versions, [], 'not the teacher\'s lesson: left out');
  const codes = r.notes.map(n => n.k);
  for (const k of ['minutes', 'kind', 'group', 'pick', 'title', 'total']) assert.ok(codes.includes(k), `noted: ${k}`);
  // every group the same game: one handout for the whole class
  const same = HP.cleanPlan(rivera, A, { parts: [{ kind: 'work', minutes: 15, groups: [{ group: 'Stretch', gameId: pizza.slug }, { group: 'On track', gameId: pizza.id }, { group: 'Building', gameId: pizza.id }] }] }).plan;
  assert.deepEqual(same.parts[0].versions, [{ group: '', pick: { type: 'game', id: pizza.id } }], 'by slug or id; merged');
  // a lesson the builder makes: only Arithmetic Lab and Algebra Builder, with a known op
  const mk = HP.cleanPlan(rivera, A, { parts: [{ kind: 'work', minutes: 15, make: { slug: 'arithmetic-lab', op: 'multiply', title: 'Times tables' } }, { kind: 'exit', minutes: 5, make: { slug: 'crossword' } }] }).plan;
  assert.deepEqual(mk.parts[0].versions[0].pick, { type: 'make', slug: 'arithmetic-lab', op: 'multiply', title: 'Times tables' });
  assert.deepEqual(mk.parts[1].versions, []);
});

test('in the chat: Oomba drafts a card; the AI sees groups and titles, never a student; Use this plan puts the handouts on desks per group; the pill runs it', async () => {
  reset(A);
  const calls = standIn((p, i) => (i === 0 ? toolUse('getPageContext', {}) : i === 1 ? toolUse('draftDayPlan', {
    name: 'Fractions day', topic: 'fractions',
    parts: [{ kind: 'slides', minutes: 10, title: 'What is a fraction?' },
      { kind: 'work', minutes: 20, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Building', lessonId: warmup.id }], pick: { gameId: sudoku.id }, instructions: 'Two rounds, then check with a partner.' },
      { kind: 'break', minutes: 3, title: 'Simon says' }, { kind: 'exit', minutes: 5, pick: { gameId: ladder.id }, title: 'One thing I learned' }],
  }) : 'Here is a fractions day: slides, work time by group, a brain break and an exit check. Ask for changes or tap Use this plan.'));
  const j = await say(rivera, 'Plan today for fractions, with Ava and Ben on the pizza game', page(A));
  assert.ok(j.ok);
  // what the AI got: tools for plans, the class's groups and counts, titles; no student's name or id
  assert.ok(calls[0].tools.some(t => t.name === 'draftDayPlan') && calls[0].tools.some(t => t.name === 'useSavedPlan'));
  assert.match(calls[0].system, /Day plans \(this page is the class's Homeroom\)/);
  const sent = JSON.stringify(calls);
  assert.doesNotMatch(sent, NAMES, 'never a student name');
  for (const k of [...kids, eli]) { assert.ok(!sent.includes(k.id), 'never a student id'); assert.ok(!sent.includes(k.username), 'never a username'); }
  const ctx = resultOf(calls, 1).homeroom;
  assert.deepEqual(ctx.groups, [{ name: 'Stretch', students: 2 }, { name: 'On track', students: 0 }, { name: 'Building', students: 1 }]);
  assert.equal(ctx.class.students, 4);
  assert.ok(ctx.lessons.some(l => l.lessonId === warmup.id && l.title === 'Fractions warm-up'));
  assert.ok(ctx.oombaGames.some(g => g.gameId === pizza.id));
  const back = resultOf(calls, 2);
  assert.equal(back.shownOnCard, true);
  assert.deepEqual(back.plan.parts.map(x => [x.kind, x.minutes]), [['slides', 10], ['work', 20], ['break', 3], ['exit', 5]]);
  assert.deepEqual(back.plan.parts[1].handouts.map(h => h.for), ['everyone else', 'Stretch', 'Building']);
  // the card, dressed for the teacher's page
  const bot = await lastBot(rivera);
  const card = bot.note.plan;
  assert.equal(card.state, 'draft'); assert.equal(card.name, 'Fractions day'); assert.equal(card.total, 38); assert.equal(card.className, 'Room 7A');
  assert.deepEqual(card.parts[1].give.map(g => [g.who, g.what]), [['Everyone else', 'Sudoku Garden'], ['Stretch', 'Fraction Pizza'], ['Building', 'Fractions warm-up']]);
  assert.deepEqual(card.copy.map(c => c.name), ['Room 7B']);
  assert.equal((await as(rivera)(`/api/homeroom/${A.id}/plan`)).json.plan, null, 'nothing is today\'s plan before Use this plan');
  assert.equal(HO.boardView(A).handouts.length, 0, 'nothing on desks yet');

  // Use this plan: per group (Stretch: pizza, Building: the lesson), everyone else (On track and Dev, no group) Sudoku
  // desk by desk, and the exit check's game for the whole class
  const used = await act(rivera, bot.id, 'planUse');
  assert.equal(used.status, 200, used.text);
  assert.equal(used.json.plan.state, 'ready'); assert.equal(used.json.classId, A.id);
  assert.match(used.json.toast, /handouts are on desks/);
  const desk = k => HO.deskView(A, k).map(x => x.title).sort();
  assert.deepEqual(desk(kids[0]), ['Fraction Pizza', 'Word Ladder']);
  assert.deepEqual(desk(kids[1]), ['Fraction Pizza', 'Word Ladder']);
  assert.deepEqual(desk(kids[2]), ['Fractions warm-up', 'Word Ladder']);
  assert.deepEqual(desk(kids[3]), ['Sudoku Garden', 'Word Ladder']);
  const ladderHo = HO.boardView(A).handouts.find(h => h.title === 'Word Ladder');
  assert.equal(ladderHo.target, 'all'); assert.equal(ladderHo.students, 4);
  assert.equal(HO.boardView(A).handouts.find(h => h.title === 'Fraction Pizza').target, 'group');
  assert.equal(HO.boardView(A).handouts.find(h => h.title === 'Fraction Pizza').instructions, 'Two rounds, then check with a partner.');
  // the card follows; the same card can't put them on desks twice
  assert.equal((await lastBot(rivera)).note.plan.state, 'ready');
  const n0 = HO.boardView(A).handouts.length;
  assert.equal((await act(rivera, bot.id, 'planUse')).status, 200);
  assert.equal(HO.boardView(A).handouts.length, n0, 'used once');

  // Start plan from the card; the pill's view is the server's
  const st = await act(rivera, bot.id, 'planStart');
  assert.equal(st.json.plan.state, 'running'); assert.equal(st.json.plan.run.idx, 0);
  const t0 = HP.todayOf(A).run.startedAt;
  let v = HP.teacherView(A, t0 + 25 * MIN);
  assert.equal(v.run.idx, 0, 'Time\'s up never moves on by itself'); assert.equal(v.timesUp, true); assert.equal(v.behindMin, 15);
  assert.equal(HP.teacherView(A, t0 + 60 * MIN).run.idx, 0, 'not even an hour later');
  // +5 and Next through the route
  const more = await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'more' } });
  assert.equal(more.json.plan.run.extra, 5 * MIN);
  const nx = await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'next' } });
  assert.equal(nx.json.plan.run.idx, 1); assert.equal(nx.json.plan.run.extra, 0, '+5 was for that part only');
  // a student finishes the exit game; the summary counts it
  const exitCl = ladderHo.id;
  q.run("INSERT INTO step_progress(class_lesson_id, user_id, step_id, status, seconds, started_at, done_at, updated_at) VALUES (?,?,?,'done',200,?,?,?)", exitCl, kids[0].id, L.steps(L.getClassLesson(exitCl).lesson_id)[0].id, Date.now(), Date.now(), Date.now());
  const fin = await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'finish' } });
  assert.equal(fin.status, 200, fin.text);
  const s = fin.json.summary;
  assert.equal(s.partsTotal, 4); assert.equal(s.partsDone, 1, 'slides done; work time was on when class finished');
  assert.deepEqual(s.parts.map(x => [x.kind, x.planned, !!x.done, !!x.cut]), [['slides', 10, true, false], ['work', 20, false, true], ['break', 3, false, false], ['exit', 5, false, false]]);
  assert.deepEqual([s.parts[3].finished, s.parts[3].of], [1, 4], 'counts only');
  assert.deepEqual([s.parts[1].finished, s.parts[1].of], [0, 4]);
  assert.equal(s.homework, 7);
  assert.doesNotMatch(JSON.stringify(s), NAMES);
  for (const k of kids) assert.ok(!JSON.stringify(s).includes(k.id), 'no student in the summary');
  assert.equal(HO.boardView(A).handouts.length, n0, 'unfinished handouts stay on desks (homework)');
  assert.equal(fin.json.plan.state, 'finished');
  assert.equal((await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'next' } })).status, 400, 'nothing runs after Finish class');
});

test('Start, +5, Next and Finish: only while it runs; Next past the last part waits for Finish class', () => {
  reset(A);
  const plan = HP.cleanPlan(rivera, A, { parts: [{ kind: 'slides', minutes: 5 }, { kind: 'break', minutes: 2 }] }).plan;
  assert.ok(HP.usePlan(rivera, A, plan).ok);
  assert.equal(HP.runAction(rivera, A, 'more').code, 'notRunning');
  assert.equal(HP.runAction(rivera, A, 'finish').code, 'notRunning');
  const t = Date.now();
  assert.ok(HP.runAction(rivera, A, 'start', t).ok);
  for (let k = 0; k < 20; k++) assert.equal(HP.runAction(rivera, A, 'more', t + 1000).ok, true);
  assert.equal(HP.todayOf(A).run.extra, 60 * MIN, '+5 at most an hour on one part');
  assert.ok(HP.runAction(rivera, A, 'next', t + 6 * MIN).ok);
  assert.ok(HP.runAction(rivera, A, 'next', t + 9 * MIN).ok);
  const v = HP.teacherView(A, t + 10 * MIN);
  assert.equal(v.state, 'done'); assert.equal(v.run.done, true);
  assert.equal(HP.runAction(rivera, A, 'next', t + 10 * MIN).code, 'notRunning');
  const f = HP.runAction(rivera, A, 'finish', t + 11 * MIN);
  assert.deepEqual(f.summary.parts.map(x => [x.used, x.done]), [[6, true], [3, true]]);
  assert.equal(f.summary.used, 11); assert.equal(f.summary.planned, 7);
  // another plan can't be used while one runs
  reset(A);
  assert.ok(HP.usePlan(rivera, A, HP.cleanPlan(rivera, A, { parts: [{ kind: 'slides', minutes: 5 }] }).plan).ok);
  HP.runAction(rivera, A, 'start');
  assert.equal(HP.usePlan(rivera, A, HP.cleanPlan(rivera, A, { parts: [{ kind: 'break', minutes: 5 }] }).plan).code, 'planRunning');
  assert.ok(HP.runAction(rivera, A, 'clear').ok);
  assert.equal(HP.teacherView(A), null);
});

test('without the AI: a starting plan from the teacher\'s own lessons, then "make work time 25 minutes", "swap the brain break"', async () => {
  reset(A);
  CO.hooks.create = null;   // no key, no stand-in: the AI is resting
  await say(rivera, 'Plan today on fractions', page(A));
  let bot = await lastBot(rivera);
  assert.ok(!bot.failed, 'a card, not "resting"');
  assert.match(bot.text, /simple plan to start from/);
  let p = bot.note.plan;
  assert.deepEqual(p.parts.map(x => [x.kind, x.minutes]), [['slides', 8], ['work', 20], ['break', 3], ['exit', 5]]);
  assert.deepEqual(p.parts[1].give.map(g => g.what), ['Fractions warm-up'], 'the teacher\'s own lesson that fits');
  assert.equal(p.name, 'fractions day');
  await say(rivera, 'make work time 25 minutes', page(A));
  bot = await lastBot(rivera); p = bot.note.plan;
  assert.equal(p.parts[1].minutes, 25); assert.equal(p.name, 'fractions day', 'the same plan, changed');
  await say(rivera, 'make work time 300 minutes', page(A));
  assert.equal((await lastBot(rivera)).note.plan.parts[1].minutes, 60, 'clamped');
  await say(rivera, 'swap the brain break', page(A));
  p = (await lastBot(rivera)).note.plan;
  assert.notEqual(p.parts[2].title, 'Stretch and wiggle'); assert.equal(p.parts[1].minutes, 60);
  // anything else on another page while it rests: resting as before
  await say(rivera, 'Find me a game about maps', { type: 'class', classId: A.id });
  assert.equal((await lastBot(rivera)).failed, 'resting');
});

test('saved plans: Save plan names it, "use my Fractions day plan again", Saved plans, Copy to another class (groups by name), a lesson the builder makes', async () => {
  reset(A); reset(B);
  standIn((p, i) => (i === 0 ? toolUse('draftDayPlan', { name: 'Fractions day', parts: [{ kind: 'slides', minutes: 5 }, { kind: 'work', minutes: 15, groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Building', gameId: sudoku.id }] }, { kind: 'exit', minutes: 5, make: { slug: 'arithmetic-lab', op: 'multiply', title: 'Times check' } }] }) : 'Drafted.'));
  await say(rivera, 'Plan a fractions day', page(A));
  const bot = await lastBot(rivera);
  assert.equal((await act(rivera, bot.id, 'planSave', '')).status, 400, 'a name is needed');
  const sv = await act(rivera, bot.id, 'planSave', 'Fractions day');
  assert.equal(sv.status, 200, sv.text);
  assert.equal((await lastBot(rivera)).note.plan.savedAs.name, 'Fractions day');
  assert.equal(HP.listSaved(rivera).length, 1);
  assert.equal((await act(rivera, bot.id, 'planSave', '  fractions day ')).status, 200);
  assert.equal(HP.listSaved(rivera).length, 1, 'the same name (any case) replaces it');
  assert.equal((await act(rivera, bot.id, 'planSave', 'Fractions day')).status, 200);
  const saved = q.get('SELECT parts FROM homeroom_day_plans WHERE owner_id=?', rivera.id).parts;
  assert.match(saved, /"group":"k:stretch"/, 'groups kept by their identity, never a student');
  assert.doesNotMatch(saved, NAMES);

  // the AI: "use my Fractions day plan again"
  const calls = standIn((p, i) => (i === 0 ? toolUse('useSavedPlan', { name: 'fractions' }) : 'Here it is again.'));
  await say(rivera, 'use my Fractions day plan again', page(A));
  assert.equal(resultOf(calls, 1).shownOnCard, true);
  let card = (await lastBot(rivera)).note.plan;
  assert.equal(card.from.name, 'Fractions day'); assert.equal(card.state, 'draft');
  standIn((p, i) => (i === 0 ? toolUse('useSavedPlan', { name: 'spelling' }) : 'None by that name.'));
  await say(rivera, 'use my spelling plan', page(A));
  // without the AI too
  CO.hooks.create = null;
  await say(rivera, 'use my fractions plan again', page(A));
  card = (await lastBot(rivera)).note.plan;
  assert.equal(card.from.name, 'Fractions day');
  // Saved plans on the card: a new card from it
  const pick = await act(rivera, (await lastBot(rivera)).id, 'planPick', HP.listSaved(rivera)[0].id);
  assert.equal(pick.status, 200, pick.text);

  // Copy to Room 7B: Stretch found there by name (Eli), Building too (no students: skipped when handing out)
  const cp = await act(rivera, bot.id, 'planCopy', B.id);
  assert.equal(cp.status, 200, cp.text);
  const bBot = await lastBot(rivera);
  assert.equal(bBot.note.plan.classId, B.id); assert.equal(bBot.note.plan.className, 'Room 7B');
  assert.match(bBot.text, /Room 7B/);
  assert.deepEqual(bBot.note.plan.parts[1].give.map(g => g.who), ['Stretch', 'Building']);
  assert.equal((await act(rivera, bot.id, 'planCopy', A.id)).status, 404, 'not to the same class');
  const otherCls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: other.id }).class;
  assert.equal((await act(rivera, bot.id, 'planCopy', otherCls.id)).status, 404, 'only the teacher\'s own classes');
  // used in 7B: Eli gets the pizza game; the exit check is a new Arithmetic Lab lesson made by the builder's own model
  const u = await act(rivera, bBot.id, 'planUse');
  assert.equal(u.status, 200, u.text);
  assert.deepEqual(HO.deskView(B, eli).map(x => x.title).sort(), ['Fraction Pizza', 'Times check']);
  const ml = HL.listMine(rivera).find(l => l.title === 'Times check');
  assert.ok(ml, 'a real lesson of the teacher\'s'); assert.equal(ml.base.op, 'multiply');
  assert.deepEqual(ml.versions.map(v => v.label), ['Stretch', 'On track', 'Building'], 'a version per group');
  assert.equal(HP.todayOf(B).parts[2].versions[0].pick.type, 'lesson', 'the plan now names that lesson');
  assert.equal(HP.todayOf(A), null, 'Room 7A is untouched');
});

test('who: only the class\'s teachers; the projector and desks get part names and the timer, never a name or a group', async () => {
  reset(A);
  const plan = HP.cleanPlan(rivera, A, { parts: [{ kind: 'work', minutes: 10, title: 'Pizza fractions', groups: [{ group: 'Stretch', gameId: pizza.id }, { group: 'Building', gameId: sudoku.id }] }, { kind: 'exit', minutes: 5 }] }).plan;
  assert.ok(HP.usePlan(rivera, A, plan).ok);
  for (const who of [other, kids[0], null]) {
    assert.equal((await as(who)(`/api/homeroom/${A.id}/plan`)).status, 404);
    assert.equal((await as(who)(`/api/homeroom/${A.id}/plan`, { body: { action: 'start' } })).status, 404);
  }
  assert.equal(HP.runAction(other, A, 'start').code, 'notFound');
  assert.equal(HP.usePlan(other, A, plan).code, 'notFound');
  assert.equal((await as(rivera)(`/api/homeroom/${A.id}/plan`, { body: { action: 'start' } })).status, 200);
  const proj = await as(rivera)(`/api/homeroom/${A.id}/state`);
  assert.deepEqual(Object.keys(proj.json.plan).sort(), ['done', 'endsAt', 'next', 'now', 'part', 'timesUp']);
  assert.deepEqual(proj.json.plan.part, { kind: 'work', title: 'Pizza fractions' });
  assert.deepEqual(proj.json.plan.next, { kind: 'exit', title: '' });
  const projPage = await as(rivera)(`/class/${A.id}/homeroom/projector`);
  assert.match(projPage.text, /id="hr-projplan"/);
  const desk = await as(kids[0])(`/api/desk/${A.id}/state`);
  assert.deepEqual(desk.json.plan.part, { kind: 'work', title: 'Pizza fractions' });
  for (const body of [JSON.stringify(proj.json.plan), JSON.stringify(desk.json.plan)]) { assert.doesNotMatch(body, NAMES); assert.doesNotMatch(body, /Stretch|Building|Fraction Pizza|Sudoku/); }
  // the board's page carries the pill's view; the companion knows this page is a Homeroom
  const board = await as(rivera)(`/class/${A.id}/homeroom`);
  assert.match(board.text, /id="hr-plan"/);
  assert.match(board.text, /&quot;type&quot;:&quot;homeroom&quot;|"type":"homeroom"/);
  assert.equal(CO.pageOf(rivera, page(A)).type, 'homeroom');
  assert.equal(CO.pageOf(other, page(A)).type, 'other', 'another teacher: not this Homeroom');
  // a card's act for a class the teacher no longer runs: refused
  config.homeroomUsers = [other.username.toLowerCase()];
  try { assert.equal(CO.pageOf(rivera, page(A)).type, 'class'); } finally { config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase()); }
});

test('the account goes: its saved plans go too', () => {
  const t = staff('Ms Gone'); TOOLS.givePlan(t.id);
  config.homeroomUsers = [...config.homeroomUsers, t.username.toLowerCase()];
  const c = S.createClass(boss, oak.id, { name: 'Room 3', teacherId: t.id }).class;
  assert.ok(HP.savePlan(t, c, HP.cleanPlan(t, c, { parts: [{ kind: 'slides', minutes: 5 }] }).plan, 'Mine').ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_day_plans WHERE owner_id=?', t.id).n, 1);
  assert.ok(deleteAccount(t.id, boss, { by: 'admin', parentMade: false, leaveSchools: true }).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_day_plans WHERE owner_id=?', t.id).n, 0);
});
