// The owner's "chat audit 4" (28 Nov; docs/decisions.md "Oomba chat: audit 4 fixes"), item by item, with the AI a
// stand-in (services/companion.js hooks.create; harness: tests/unit/_companion-actions-harness.js):
//   1. assign from the chat: a lesson plan the chat just made is found and assigned; Arithmetic Lab offers the teacher's
//      own activities and assigns the one picked as its Assign page does; none: refused with the activity editor; the
//      Grammar Lab topic of audit 3 (Identifying Adjectives) still assigns;
//   2. the privacy filter: a surname that is a common English word is not taken out on its own ("4b math test",
//      "Test 881 Assign"); a first name, a full name and any other surname still are;
//   3. a live game that ended with nobody in it is in the class's Live games history ("Ended, no one joined");
//   4. a lesson plan made on a class page takes the class's grade;
//   5. a board's read-back lists its items' labels; a board made in the chat has Undo; the rounds a board takes;
//   6. a search for a lesson plan returns lesson plans; a game is only ever offered as a game;
//   7. where an answer's time goes (perf), and the page's class name up front.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const H = await import('./_companion-actions-harness.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const LS = await import('../../server/services/classlive-sessions.js');
const QL = await import('../../server/services/quick-live.js');
const SC = await import('../../server/services/scores.js');
const R = await import('../../server/services/classlive-results.js');
const M = await import('../../server/services/manipulatives.js');
const MC = await import('../../server/services/manip-chat.js');
const games = await import('../../server/services/games.js');
const GSETS = await import('../../server/services/game-sets.js');
const CO = await import('../../server/services/companion.js');
const { scrub, namesFrom, studentNames } = await import('../../server/builder/lesson.js');
H.boot();
test.after(() => LS._reset());

const read = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const html = async (p, cookie) => { const r = await H.get(p, cookie); assert.equal(r.status, 200, p); return r.text(); };
const grade4 = x => S.createClass({ id: x.teacher.id }, x.s.id, { name: '4b math', grade: '4' }).class;
const DIV = { k: 'divide', p: [[84, 4], [96, 3], [75, 5]], l: 'guided' };

// ---------------------------------------------------------------- 1a. a lesson plan made in the chat, then assigned
test('1a/4. "make a lesson plan on regrouping" on a grade 4 class page takes grade 4; "assign the regrouping lesson plan" finds it and assigns it', async () => {
  const x = H.world();
  const E = grade4(x);
  const page = { type: 'class', classId: E.id };
  let calls = H.standIn((p, i) => (i === 0 ? H.toolUse('makeLesson', { topic: 'regrouping' }) : 'Here is your lesson plan.'));
  await H.say(x, 'Make a lesson plan on regrouping', page);
  const r0 = H.resultOf(calls);
  assert.equal(r0.made, true, JSON.stringify(r0));
  assert.equal(r0.grade, '4', 'the page class\'s grade');
  const made = (await H.lastBot(x)).note.made;
  assert.equal(made.kind, 'lesson');
  assert.equal(L.getLesson(made.id).grade, '4');
  // findLesson lists the teacher's own lesson plans, labelled as lesson plans
  calls = H.standIn((p, i) => (i === 0 ? H.toolUse('findLesson', { name: 'the regrouping lesson plan' }) : 'Found it.'));
  await H.say(x, 'Assign the regrouping lesson plan', page);
  const f = H.resultOf(calls);
  assert.ok(f.lessonPlans && f.lessonPlans.some(l => l.title === L.getLesson(made.id).title && l.type === 'lesson plan'), JSON.stringify(f));
  assert.match(f.note, /assignLesson/);
  // and the action card assigns it (words, not the exact title)
  const c = await H.ask(x, 'assignLesson', { lesson: 'the regrouping lesson plan' }, page, 'Assign the regrouping lesson plan');
  assert.ok(!c.r.error, JSON.stringify(c.r));
  const done = await H.doIt(x, c.bot);
  assert.equal(L.classLessons(E.id).filter(cl => cl.lesson_id === made.id).length, 1, JSON.stringify(done.change));
});

test('1a. "the lesson plan you just made": with words that fit none, the one made in this conversation is the one meant', async () => {
  const x = H.world();
  const E = grade4(x);
  const page = { type: 'class', classId: E.id };
  H.standIn((p, i) => (i === 0 ? H.toolUse('makeLesson', { topic: 'regrouping', grade: '4' }) : 'Here it is.'));
  await H.say(x, 'Make a lesson plan on regrouping', page);
  const made = (await H.lastBot(x)).note.made;
  L.createLesson(x.teacher, x.s.id, { title: 'Fractions day' });
  const c = await H.ask(x, 'assignLesson', { lesson: 'the lesson plan you just made' }, page, 'Assign the lesson plan you just made');
  assert.ok(!c.r.error, JSON.stringify(c.r));
  assert.ok(c.r.what.includes(L.getLesson(made.id).title), c.r.what);
  assert.doesNotMatch(c.r.what, /Fractions day/);
});

test('1a. assignLesson offers only lesson plans: an assigned game\'s own row is never one of "their lesson plans"', async () => {
  const x = H.world();
  const wh = games.getGameBySlug('word-hunt');
  const GF = await import('../../server/services/game-folders.js');
  assert.equal(GF.assignGame(x.teacher, x.A.id, wh.id, {}).ok, true);
  const r = await H.refused(x, 'assignLesson', { lesson: 'word' }, /no lesson plans/i);
  assert.doesNotMatch(r.error, /Word Hunt/);
});

// ---------------------------------------------------------------- 1b. Arithmetic Lab: the teacher's own activities
test('1b. Arithmetic Lab: the teacher\'s saved activities are offered and the one picked is assigned as its Assign page does', async () => {
  const x = H.world();
  const g = games.getGameBySlug('arithmetic-lab');
  assert.ok(g, 'seeded');
  const a1 = GSETS.save(g.id, x.teacher.id, [DIV], null, 'arithmetic-lab', { title: 'Test 881 Assign' });
  GSETS.save(g.id, x.teacher.id, [{ ...DIV, p: [[48, 2]] }], null, 'arithmetic-lab', { title: 'Warm up' });
  const page = { type: 'class', classId: x.A.id };
  // findLesson: the activity by its own title
  let calls = H.standIn((p, i) => (i === 0 ? H.toolUse('findLesson', { name: 'Test 881 Assign' }) : 'Found it.'));
  await H.say(x, 'Assign Test 881 Assign', page);
  const f = H.resultOf(calls);
  assert.ok(f.yourActivities && f.yourActivities.some(s => s.title === 'Test 881 Assign' && s.game === 'Arithmetic Lab' && s.set === a1.id), JSON.stringify(f));
  // assign with no activity named: never "assign it from its Assign page"; the activities are offered
  calls = H.standIn((p, i) => (i === 0 ? H.toolUse('assign', { kind: 'game', id: 'arithmetic-lab' }) : 'Which activity?'));
  await H.say(x, 'Assign Arithmetic Lab', page);
  let r = H.resultOf(calls);
  assert.doesNotMatch(JSON.stringify(r), /Assign page/);
  assert.deepEqual(r.activities.map(s => s.title).sort(), ['Test 881 Assign', 'Warm up']);
  assert.equal((await H.lastBot(x)).note.assign, undefined, 'no card before one is picked');
  // the one picked (by its title)
  calls = H.standIn((p, i) => (i === 0 ? H.toolUse('assign', { kind: 'game', id: 'arithmetic-lab', set: 'Test 881 Assign' }) : 'Tap Assign.'));
  await H.say(x, 'Assign Test 881 Assign to Room 12 Owls', page);
  r = H.resultOf(calls);
  assert.equal(r.title, 'Test 881 Assign', JSON.stringify(r));
  const bot = await H.lastBot(x);
  const res = await H.act(x, bot.id, 'assign'); assert.equal(res.status, 200, await res.clone().text());
  const done = await H.lastBot(x);
  assert.equal(done.change.kind, 'assign');
  const cl = L.classLessons(x.A.id).find(y => y.id === done.change.clId);
  assert.equal(cl.title, 'Test 881 Assign', 'named after the activity, as the Assign page names it');
  assert.equal(cl.summary, 'Long division, 3 problems, Guided');
  assert.equal(L.steps(cl.lesson_id)[0].options, `chapter=${a1.id}&lock=1`, 'the same options as the Assign page');
  // Undo takes it off again
  await H.undo(x, done.id);
  assert.equal(L.classLessons(x.A.id).some(y => y.id === done.change.clId), false);
});

test('1b. Arithmetic Lab with no activity saved: refused, with the activity editor to open', async () => {
  const x = H.world();
  const calls = H.standIn((p, i) => (i === 0 ? H.toolUse('assign', { kind: 'game', id: 'arithmetic-lab' }) : 'You have none yet.'));
  await H.say(x, 'Assign Arithmetic Lab', { type: 'class', classId: x.A.id });
  const r = H.resultOf(calls);
  assert.match(r.error, /no saved activities/i);
  assert.match(r.error, /\/play\/arithmetic-lab\?mode=assign/);
  assert.match(r.error, /Nothing was assigned\.$/);
});

// ---------------------------------------------------------------- 1c. audit 3's Grammar Lab assign still works
test('1c. regression: "Identifying Adjectives" (Grammar Lab) is still found and assigned from the chat', async () => {
  const x = H.world();
  const was = { on: config.grammarLab, users: config.grammarLabUsers };
  config.grammarLab = true; config.grammarLabUsers = [x.teacher.username.toLowerCase()];
  try {
    const calls = H.standIn((p, i) => (i === 0 ? H.toolUse('findLesson', { name: 'Identifying Adjectives' }) : 'Found it.'));
    await H.say(x, 'Assign Identifying Adjectives', { type: 'class', classId: x.A.id });
    const hit = H.resultOf(calls).grammarLab.find(gl => gl.what === 'topic' && gl.title === 'Identifying Adjectives');
    assert.ok(hit);
    H.standIn((p, i) => (i === 0 ? H.toolUse('assign', { kind: 'grammar', id: hit.id }) : 'Tap Assign.'));
    await H.say(x, 'Assign Identifying Adjectives', { type: 'class', classId: x.A.id });
    const bot = await H.lastBot(x);
    assert.equal(bot.note.assign.kind, 'grammar');
    assert.equal((await H.act(x, bot.id, 'assign')).status, 200);
    assert.equal((await H.lastBot(x)).change.kind, 'assign');
  } finally { config.grammarLab = was.on; config.grammarLabUsers = was.users; }
});

// ---------------------------------------------------------------- 2. the privacy filter
test('2. a surname that is a common English word is not taken out on its own; first names, full names and other surnames are', () => {
  const names = namesFrom(['Jamie Test', 'Nia Okafor', 'Sam Brown']);
  const s = t => scrub(t, names).text;
  assert.equal(s('rename 4b math to 4b math test'), 'rename 4b math to 4b math test');
  assert.equal(s('Test 881 Assign'), 'Test 881 Assign');
  assert.equal(s('A brown fox, a Brown bag'), 'A brown fox, a Brown bag');
  assert.equal(s('Jamie Test did it'), '[student] did it', 'a full name');
  assert.equal(s('Jamie did it'), '[student] did it', 'a first name');
  assert.equal(s('Okafor forgot, okafor too'), '[student] forgot, [student] too', 'a surname that is not a common word');
  assert.equal(s('Nia Okafor'), '[student]');
});

test('2. in the chat: the rename and the activity title reach the AI as typed; the student\'s full name does not', async () => {
  const x = H.world();
  const admin = { id: x.admin.id };
  const kid = S.createSchoolAccount(admin, x.s.id, { rosterName: 'Jamie Test', grade: '3' }).user;
  S.addToClass(admin, x.A.id, kid.id, 'student');
  assert.equal(CO.cleanText(x.teacher, 'Test 881 Assign'), 'Test 881 Assign');
  const calls = H.standIn(() => 'OK.');
  await H.say(x, 'rename 4b math to 4b math test', { type: 'teach' });
  const sent = H.sentToAi(calls);
  assert.match(sent, /rename 4b math to 4b math test/);
  assert.ok(!sent.includes(S.getClass(x.A.id) && kid.username), 'never the username');
  const c2 = H.standIn(() => 'OK.');
  await H.say(x, 'Give Jamie Test a point', { type: 'teach' });
  const sent2 = H.sentToAi(c2);
  assert.ok(!sent2.includes('Jamie'), 'the full name is taken out');
  assert.match(sent2, /\[student \d+\] a point/);
  assert.ok(studentNames(x.teacher).every(n => n.name.toLowerCase() !== 'test'), 'the surname alone is not on the list');
});

// ---------------------------------------------------------------- 3. a live game that nobody joined
test('3. a class live game ended with nobody in it is in the Live games history ("Ended, no one joined"), not in scores or the gradebook', async () => {
  const x = H.world();
  if (!LS.liveOn()) return;
  const r = QL.openQuick(x.teacher, x.A, QL.quickPlan(x.teacher, x.A, {}), 'en');
  assert.equal(r.ok, true);
  const s = LS.hostSession(x.teacher.id);
  assert.match(await html(`/class/${x.A.id}/progress`, x.tc), /A live game is open now/);
  LS.endSession(s.id, 'ended');
  const run = q.get('SELECT * FROM live_runs WHERE id=?', s.id);
  assert.ok(run, 'the run is kept'); assert.equal(run.class_id, x.A.id); assert.equal(run.players, 0);
  const page = await html(`/class/${x.A.id}/progress`, x.tc);
  assert.doesNotMatch(page, /No live games with this class yet/);
  assert.match(page, /Ended, no one joined/);
  assert.ok(!page.includes(`/live/results/${s.id}`), 'no results page to open');
  assert.equal(SC.classLive(x.A.id).runs.some(y => y.id === s.id), false, 'not a gradebook column');
  assert.equal(R.hostRuns(x.teacher.id).some(y => y.id === s.id), false, 'not in the host\'s results list');
});

// ---------------------------------------------------------------- 5. the board's read-back and Undo
const BOARD = { title: 'Add 15', steps: ['Add 15 to each number.'], items: [10, 20, 30, 40, 50].map(v => ({ value: v, box: 'answer', label: '+ 15' })) };
test('5. the read-back lists each item\'s label, so "+ 15" can be checked', () => {
  const c = MC.buildChange(BOARD, 'base-ten-blocks').change;
  assert.ok(c, 'built');
  const back = MC.readBack('base-ten-blocks', c);
  assert.equal(back.items.length, 5);
  assert.deepEqual(back.items.map(it => it.label), ['+ 15', '+ 15', '+ 15', '+ 15', '+ 15']);
});

test('5. a board made in the chat has Undo (the board is taken off My boards again)', async () => {
  const x = H.world();
  H.standIn((p, i) => (i === 0 ? H.toolUse('makeBoard', { tool: 'base-ten-blocks', ...BOARD }) : 'The board has 5 problems.'));
  await H.say(x, 'Make a board with 5 add 15 problems', { type: 'teach' });
  const bot = await H.lastBot(x);
  assert.equal(bot.note.made.kind, 'board');
  assert.ok(bot.change && bot.change.canUndo, JSON.stringify(bot.change));
  assert.ok(M.ownBoard(x.teacher, bot.note.made.id));
  await H.undo(x, bot.id);
  assert.equal(M.ownBoard(x.teacher, bot.note.made.id), null, 'gone again');
});

test('5. a change on the open board: its Undo survives a reload (the page keeps the board before the change)', () => {
  const js = read('public/js/manip-chat.js');
  assert.match(js, /sessionStorage/);
  assert.match(js, /keepSnap|saveSnap/);
});

test('5/7. the rounds a board change takes: the stand-in checks the labels in the read-back and stops at the first call that shows them', async () => {
  const x = H.world();
  const st = MC.buildChange({ title: '', steps: [], items: [] }, 'base-ten-blocks').change;
  const page = { type: 'manip', tool: 'base-ten-blocks' };
  const times = [];
  const calls = H.standIn(async (p, i) => {
    const t0 = Date.now();
    const last = p.messages.at(-1);
    const res = Array.isArray(last.content) && last.content.find(c => c.type === 'tool_result');
    times.push({ round: i, ms: Date.now() - t0 });
    if (res) {
      const r = JSON.parse(res.content);
      const labels = ((r.landed && r.landed.board && r.landed.board.items) || []).map(it => it.label);
      if (labels.length === 5 && labels.every(l => l === '+ 15')) return 'Your board has 5 problems, each labelled + 15.';
      if (i >= 4) return 'I put 5 problems on, but could not check the labels.';
    }
    return H.toolUse('changeBoard', BOARD);
  });
  const r = await H.post('/api/companion/chat', { text: 'Put 5 problems on the board, each + 15', page, board: { tool: 'base-ten-blocks', title: '', state: JSON.parse(st.state) } }, x.tc);
  assert.equal(r.status, 200);
  const { allSettled } = await import('../../server/services/oomba-chat.js'); await allSettled();
  const bot = await H.lastBot(x);
  assert.equal(calls.length, 2, `one changeBoard round and the reply (was up to ${CO.limitsOf(x.teacher).steps + 1})`);
  assert.equal(bot.note.perf.calls, 2);
  assert.match(bot.text, /labelled \+ 15/);
  // where the time went, from perf (the stand-in's own time is ~0 ms: the rest is the server's work)
  console.log('# perf (board, stand-in):', JSON.stringify(bot.note.perf), 'rounds:', times.length);
});

// ---------------------------------------------------------------- 6. vocabulary: lesson plans are lesson plans
test('6. findLesson for a lesson plan: lesson plans under lessonPlans; a game is labelled a game and never "the closest lesson plan"', async () => {
  const x = H.world();
  const calls = H.standIn((p, i) => (i === 0 ? H.toolUse('findLesson', { name: 'Arithmetic Lab lesson plan' }) : 'No lesson plan by that name.'));
  await H.say(x, 'Find my Arithmetic Lab lesson plan', { type: 'class', classId: x.A.id });
  const r = H.resultOf(calls);
  assert.deepEqual(r.lessonPlans, []);
  for (const g of r.catalog) assert.equal(g.type, 'game');
  assert.match(r.note, /no lesson plan/i);
  assert.match(r.note, /never offer a game as a lesson plan/i);
  assert.match(calls[0].system, /never offer a game as the closest lesson plan/i);
});

// ---------------------------------------------------------------- 7. where an answer's time goes
// A realistic answer with the stand-in: "assign the regrouping lesson plan" on a class page (find, then the card, then
// the reply), each model call taking MODEL_MS as a stand-in for the model's own time. perf says how many calls, how long
// the model and the tools took and how big the prompt is. The class's name stays out of the first call (the privacy
// rule of tests/unit/companion-points.test.js: the AI gets it only by asking with getPageContext).
test('7. perf: a find-then-assign answer is 3 model calls; the server\'s own tool time is small; the prompt sizes are counted', async () => {
  const x = H.world();
  const E = grade4(x);
  const page = { type: 'class', classId: E.id };
  L.createLesson(x.teacher, x.s.id, { title: 'Regrouping with addition', grade: '4' });
  const MODEL_MS = 40;
  const calls = H.standIn(async (p, i) => {
    await new Promise(r => setTimeout(r, MODEL_MS));
    if (i === 0) return H.toolUse('findLesson', { name: 'the regrouping lesson plan' });
    if (i === 1) return H.toolUse('doAction', { action: 'assignLesson', params: { lesson: 'regrouping lesson plan' } });
    return 'Tap Do it on the card to assign Regrouping with addition.';
  });
  await H.say(x, 'Assign the regrouping lesson plan', page);
  const bot = await H.lastBot(x);
  assert.equal(calls.length, 3);
  assert.ok(bot.note.action, 'the card');
  const perf = bot.note.perf;
  assert.equal(perf.calls, 3);
  assert.ok(perf.modelMs >= 3 * MODEL_MS);
  assert.ok(perf.toolMs < 1000, `tools ${perf.toolMs} ms`);
  assert.ok(perf.sys > 0 && perf.tools > 0);
  assert.doesNotMatch(calls[0].system, /4b math/, 'the class name only when asked');
  console.log('# perf (find then assign, stand-in at', MODEL_MS, 'ms a call):', JSON.stringify(perf), 'ms:', bot.note.ms);
});
