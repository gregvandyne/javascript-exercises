// Oomba makes it, then reports what it checked (docs/decisions.md "Oomba makes it, then reports what it checked";
// services/companion-make.js, services/companion.js, services/figures-chat.js). The owner's live audit of 27 Nov 2026,
// flow by flow, with the AI a stand-in (services/companion.js hooks.create):
//   - no reply claims something was made without a made id (the server-side guard), and a Builder hand-off is worded
//     "I drafted ... Press ... to create it";
//   - "set up a base-ten blocks board showing 245": the board is made (My boards), read back, its card opens it;
//     -5 on a number board that cannot show it makes nothing;
//   - Figures: "a number line from 0 to 10, students plot numbers" asks first (no plotting format online), then makes
//     printable plot questions on 0 to 10 lines, whole numbers; a 0 to 2 line or decimals are refused; the right
//     options are spread (never all B); the title follows the range; an impossible triangle is refused with its reason;
//   - an empty class: points and the report say so first; "10 points" says one at a time;
//   - the progress report: counts only, no names, no supports;
//   - "Build a lesson" asks; "Assign it" asks in plain words; one-word messages send;
//   - "Assign Sum Racer" with the arcade off: in the teacher's folder, turned off, never "not on Oomba"; the closest open
//     lesson shares its topic (not Arithmetic Lab's long division);
//   - Grammar Lab: found and assigned for a teacher it lets in, not available otherwise; open to everyone (*), any
//     teacher's "practice for commas" finds the Commas unit (searchGames too), assign and classProgress work, the
//     prompt names it; with the flag off it is never offered;
//   - an attached plan with regrouping: the limit asked first, then the worksheet made with the plan's problems in one
//     step (never an empty worksheet first).
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
const D = await import('../../server/services/dash.js');
const G = await import('../../server/services/games.js');
const GF = await import('../../server/services/game-folders.js');
const M = await import('../../server/services/manipulatives.js');
const F = await import('../../server/services/figures.js');
const FC = await import('../../server/services/figures-chat.js');
const CM = await import('../../server/services/companion-make.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

function world({ kids = true } = {}) {
  const admin = createUser({ username: uname('CMAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Chat Make ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('CMT'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const A = S.createClass({ id: teacher.id }, s.id, { name: '4b math', grade: '4' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name, grade: '4' }).user; S.addToClass({ id: admin.id }, c.id, u.id, 'student'); return getUser(u.id); };
  const list = kids ? [kid('Maya Brook', A), kid('Leo Stone', A)] : [];
  return { s, admin: getUser(admin.id), teacher: getUser(teacher.id), A: S.getClass(A.id), kids: list, tc: cookieFor(teacher.id) };
}
/** The stand-in AI: script(params, i) -> a tool use or the reply's words (i: the call of this answer). */
function standIn(script) {
  const calls = []; let answerStart = 0;
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1);
    if (!(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result'))) answerStart = calls.length - 1;
    const r = await script(params, calls.length - 1 - answerStart, calls);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 8)}`, name, input }] });
const say = async (x, text, page = { type: 'teach' }, extra = {}) => { const r = await post('/api/companion/chat', { text, page, ...extra }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const act = async (cookie, turnId, a, value) => (await post('/api/companion/chat/act', { turnId, act: a, ...(value !== undefined ? { value } : {}) }, cookie)).json();
/** The last tool result the AI was given (in the newest call). */
const lastResult = calls => { for (let i = calls.length - 1; i >= 0; i--) { const m = calls[i].messages.at(-1); if (Array.isArray(m.content) && m.content[0] && m.content[0].type === 'tool_result') return JSON.parse(m.content[0].content); } return null; };
const reset = async x => { await C.allSettled(); CO.reset(x.teacher); };

test('the guard: no reply says something was made without a made id; a Builder hand-off says "I drafted ... Press ..."', async () => {
  const x = world();
  standIn(() => 'I set up a base-ten blocks board showing 245. The board is ready. Have fun!');
  await say(x, 'Set up a base-ten blocks board showing 245');
  let bot = await lastBot(x.tc);
  assert.doesNotMatch(bot.text, /I set up|is ready/, 'no false claim');
  assert.match(bot.text, /Nothing has been made yet\./);
  assert.equal(bot.note.made, undefined);
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=?", x.teacher.id).n, 0);
  // The Builder hand-off (COMPANION_BUILD=0): "I drafted ... Press Open the Builder".
  config.companionBuild = false;
  try {
    standIn((p, i) => (i === 0 ? toolUse('startBuild', { tool: 'builder', title: 'Adjective Hunt', brief: 'A classroom activity where students find the adjectives in sentences.' }) : 'I built Adjective Hunt for you. Open the card and press the final button.'));
    await say(x, 'Make a game where students find adjectives');
    bot = await lastBot(x.tc);
    assert.doesNotMatch(bot.text, /I built/);
    assert.match(bot.text, /I drafted Adjective Hunt\. Press Open the Builder to create it\./);
    assert.ok(bot.note.handoff, 'the hand-off card is there');
  } finally { config.companionBuild = true; }
  // Building in the chat (the default): the ask card, and the app's own words say nothing is built.
  standIn((p, i) => (i === 0 ? toolUse('startBuild', { title: 'Adjective Hunt' }) : 'I built Adjective Hunt for you.'));
  await say(x, 'Make a game where students find adjectives');
  bot = await lastBot(x.tc);
  assert.doesNotMatch(bot.text, /I built/);
  assert.match(bot.text, /Nothing is built until you say so\./);
  assert.ok(bot.note.build && !bot.note.handoff, 'the ask card, no hand-off');
  // A worksheet or a board is never a hand-off any more.
  const calls = standIn((p, i) => (i === 0 ? toolUse('startBuild', { tool: 'manipulatives', brief: 'A base ten board that shows 245 for the class.' }) : 'Ok.'));
  await say(x, 'Board for 245 please');
  assert.match(lastResult(calls).error, /makeBoard/);
  assert.equal(CM.claims('I set up a board.'), true); assert.equal(CM.claims('Which tool should I use?'), false);
  await reset(x);
});

test('"set up a base-ten blocks board showing 245": made in My boards, read back, the card opens that board; -5 makes nothing', async () => {
  const x = world();
  const calls = standIn((p, i) => (i === 0 ? toolUse('makeBoard', { tool: 'base-ten-blocks', title: 'Showing 245', steps: ['Count the hundreds, tens and ones.'], items: [{ value: 245, box: 'none' }] }) : 'I made a base-ten blocks board showing 245.'));
  await say(x, 'Set up a base-ten blocks board showing 245');
  const r = lastResult(calls);
  assert.equal(r.made, true); assert.equal(r.landed.items, 1);
  assert.match(JSON.stringify(r.landed.board), /245/, 'the board read back shows 245');
  const bot = await lastBot(x.tc);
  assert.equal(bot.text, 'I made a base-ten blocks board showing 245.', 'a true claim stays');
  const m = bot.note.made;
  assert.equal(m.kind, 'board'); assert.ok(m.id);
  assert.equal(m.href, `/manipulatives#board/${m.id}`, 'the card opens that exact board');
  const b = M.ownBoard(x.teacher, m.id);
  assert.ok(b, 'saved'); assert.equal(b.tool, 'base-ten-blocks'); assert.equal(b.kind, 'recent', 'in My boards (recent boards)');
  assert.ok(M.listRecent(x.teacher).some(y => y.id === m.id));
  assert.match(b.state, /245/);
  assert.deepEqual(bot.verify, { ok: true, landed: 1, notLanded: [] });
  // The board opens from its link (the page's own open: a recent board of theirs).
  const open = M.openBoard(x.teacher, m.id);
  assert.equal(open.ok, true);
  // -5 cannot be shown with base-ten blocks: nothing made, the AI is told why, and no claim survives.
  const calls2 = standIn((p, i) => (i === 0 ? toolUse('makeBoard', { tool: 'base-ten-blocks', items: [{ value: -5, box: 'none' }] }) : 'I set up the board with -5.'));
  const before = M.listRecent(x.teacher).length;
  await say(x, 'Set up base-ten blocks showing -5');
  assert.equal(lastResult(calls2).made, false);
  assert.equal(M.listRecent(x.teacher).length, before);
  assert.match((await lastBot(x.tc)).text, /Nothing has been made yet/);
  await reset(x);
});

test('Figures: "plot" asks first; then printable plot questions on 0 to 10 lines with whole numbers; other ranges and decimals refused', async () => {
  const x = world();
  const ask = 'Build a grade 4 worksheet with a number line from 0 to 10, 5 questions asking students to plot numbers.';
  const calls = standIn((p, i) => (i === 0 ? toolUse('makeWorksheet', { title: 'Number Line 0 to 10', grade: '4', items: [{ gen: 'numberLine' }] }) : 'Pick on the card.'));
  await say(x, ask);
  let r = lastResult(calls);
  assert.equal(r.made, false); assert.equal(r.askedFirst, true);
  let bot = await lastBot(x.tc);
  assert.equal(bot.note.ask.format, 'plot'); assert.match(bot.note.ask.question, /can't check a point students plot online/);
  assert.equal(F.listWorksheets(x.teacher).length, 0, 'nothing built before the teacher answered');
  // The teacher taps "Printable: students draw each point".
  const picked = await act(x.tc, bot.id, 'askPick', '0');
  const plot = at => ({ plot: { from: 0, to: 10, step: 1, at, label: 'P' }, question: `Plot point P at ${at}.` });
  const calls2 = standIn((p, i) => (i === 0 ? toolUse('makeWorksheet', { title: 'Plot on a Number Line 0 to 10', grade: '4', items: [plot(2), plot(5), plot(7), plot(9), plot(4), { plot: { from: 0, to: 2, step: 0.5, at: 1.5 }, question: 'Plot 1.5.' }] }) : 'I made a worksheet with 5 plotting questions on 0 to 10 lines.'));
  await say(x, picked.text);
  r = lastResult(calls2);
  assert.equal(r.made, true);
  assert.equal(r.landed.filter(y => y.now).length, 5, 'the five 0 to 10 questions');
  assert.ok(r.notLanded.some(y => /runs 0 to 2, not 0 to 10/.test(y.why)), 'the 0 to 2 line is refused, with why');
  bot = await lastBot(x.tc);
  const items = F.itemsOf(bot.note.made.id);
  assert.equal(items.length, 5);
  for (const it of items) {
    assert.equal(it.kind, 'numberLine'); assert.equal(it.hide, 'points', 'the student sees a blank line: they plot the point');
    assert.equal(it.data.from, 0); assert.equal(it.data.to, 10); assert.ok(Number.isInteger(it.data.points[0].at), 'whole numbers');
    assert.match(it.question, /^Plot/);
  }
  assert.equal(bot.note.made.href, `/figures/worksheets/${bot.note.made.id}`);
  // Whole numbers asked: a decimal point is refused.
  const facts = CM.requestFacts('Change to whole numbers 0 to 10 on the number line');
  assert.deepEqual(facts.range, [0, 10]); assert.equal(facts.whole, true);
  assert.match(FC.factProblem({ kind: 'numberLine', data: { from: 0, to: 10, step: 1, points: [{ at: 2.5 }] } }, facts), /whole numbers/);
  assert.equal(FC.factProblem({ kind: 'numberLine', data: { from: 0, to: 10, step: 1, points: [{ at: 3 }] } }, facts), '');
  await reset(x);
});

test('the right options are spread (never all B), and checked on the worksheet', async () => {
  const shape = (q0, right) => ({ kind: 'rectangle', question: q0, data: { AB: 5, BC: 5, square: true }, answerType: 'choice', choices: ['Circle', right, 'Triangle', 'Hexagon'].filter((v, k, a) => a.indexOf(v) === k), correct: 1 });
  const ops = [1, 2, 3, 4].map(k => ({ op: 'add', item: { ...shape(`Shape ${k}?`, 'Square'), answer: 'B) Square' } }));
  FC.spreadChoices(ops, () => 0.4);
  const pos = ops.map(o => o.item.correct);
  assert.ok(new Set(pos).size > 1, `not all at one letter: ${pos}`);
  for (const o of ops) { assert.equal(o.item.choices[o.item.correct], 'Square', 'the right option moved with its index'); assert.equal(o.item.answer, F.choiceText(o.item.choices, o.item.correct)); }
  // Through makeWorksheet: four multiple-choice questions all sent with B correct land at different letters.
  const x = world();
  standIn((p, i) => (i === 0 ? toolUse('makeWorksheet', { title: 'Name the shape', grade: '3', items: [1, 2, 3, 4].map(k => shape(`Which shape is figure ${k}?`, 'Square')) }) : 'Here it is.'));
  await say(x, 'A worksheet: 4 multiple choice questions naming a square');
  const made = (await lastBot(x.tc)).note.made;
  assert.ok(made && made.id, 'made');
  const correct = F.itemsOf(made.id).map(it => it.correct);
  assert.equal(correct.length, 4); assert.ok(new Set(correct).size > 1, `the answers are not all one letter: ${correct}`);
  await reset(x);
});

test('the title follows the range: "Number Line 0 to 10" becomes "Number Line 0 to 1000" when the lines run to 1000', async () => {
  const x = world();
  const w = F.createWorksheet(x.teacher, { title: 'Number Line 0 to 10', grade: '4', items: [{ kind: 'numberLine', data: { from: 0, to: 10, step: 1, points: [{ at: 5, label: 'P' }] }, question: 'Where is P?', answerType: 'number' }] });
  assert.ok(w.ok, JSON.stringify(w));
  standIn((p, i) => (i === 0 ? toolUse('editWorksheet', { edits: [{ op: 'replace', n: 1, item: { plot: { from: 0, to: 1000, step: 100, at: 900, label: 'P' }, question: 'Plot point P at 900.' } }] }) : 'I replaced question 1 with a 0 to 1000 line.'));
  await say(x, 'Point P at 900 on a 0 to 1000 line', { type: 'figures-sheet', sheetId: w.id });
  assert.equal(F.ownWorksheet(x.teacher, w.id).title, 'Number Line 0 to 1000');
  assert.equal(FC.retitle('Number Line 0 to 10', [{ kind: 'numberLine', data: { from: 0, to: 10 } }]), '', 'already right: unchanged');
  await reset(x);
});

test('an impossible figure is refused with its one-line reason, never swapped (a number question too)', async () => {
  const x = world();
  const calls = standIn((p, i) => (i === 0 ? toolUse('makeWorksheet', { title: 'Triangles', grade: '6', items: [{ kind: 'triangle', question: 'What is the perimeter?', data: { AB: 1, BC: 2, CA: 10 }, answerType: 'number', answerKey: 'perimeter' }] }) : 'Those sides cannot work. Want a 3-4-5 triangle instead?'));
  await say(x, 'A worksheet with a triangle with sides 1, 2 and 10');
  const r = lastResult(calls);
  assert.equal(r.made, false);
  assert.deepEqual(r.tellTeacher, ['1 + 2 is less than 10, so those sides can\'t make a triangle.']);
  const bot = await lastBot(x.tc);
  assert.match(bot.text, /Want a 3-4-5 triangle instead\? 1 \+ 2 is less than 10, so those sides can't make a triangle\./, 'the reason is said even when Oomba left it out');
  assert.equal(F.listWorksheets(x.teacher).length, 0, 'nothing made, nothing swapped');
  assert.deepEqual(FC.explainOf('numberLine', {}, 'OF.check: point 1: 999 is past the end of the line (the line runs from 0 to 10: widen the range to show it)'), { key: 'pastEnd', v: 999, from: 0, to: 10 });
  await reset(x);
});

test('an empty class: points and the report say so first, with how to add students; "10 points" says one at a time', async () => {
  const x = world({ kids: false });
  const calls = standIn((p, i) => (i === 0 ? toolUse('givePoint', { target: 'class', reason: 'teamwork', count: 10, classRef: '4b math' }) : 'Add students first.'));
  await say(x, 'Give 10 points to the whole 4b math class', { type: 'teach' });
  let r = lastResult(calls);
  assert.equal(r.given, 0); assert.ok(r.steps.length, 'the steps to add students');
  let bot = await lastBot(x.tc);
  assert.match(bot.text, /^4b math has no students yet, so no points can be given\./);
  assert.equal(bot.note.pick, undefined, 'no reason card before saying the class is empty');
  const calls2 = standIn((p, i) => (i === 0 ? toolUse('classProgress', { classRef: '4b math' }) : 'Add students and I can report.'));
  await say(x, 'Give me a progress report for 4b math');
  r = lastResult(calls2);
  assert.equal(r.students, 0);
  bot = await lastBot(x.tc);
  assert.match(bot.text, /^4b math has no students yet, so there's no progress to report\./);
  assert.ok(bot.note.steps.some(s => s.k === 'report'), 'a real step, never "Couldn\'t find that page"');
  // A class with students: 10 asked, one given, said first.
  const y = world();
  standIn((p, i) => (i === 0 ? toolUse('givePoint', { target: 'class', reason: 'teamwork', count: 10 }) : 'Done!'));
  await say(y, 'Give the class 10 points for teamwork', { type: 'dashboard', classId: y.A.id });
  bot = await lastBot(y.tc);
  assert.match(bot.text, /^Points go one at a time, so this is 1 point, not 10\. Done!/);
  assert.equal(D.classPoints(y.A).n, 1);
  await reset(x); await reset(y);
});

test('the progress report: counts only; never a student\'s name or supports', async () => {
  const x = world();
  const g = G.getGameBySlug('word-hunt');
  const a = GF.assignGame(x.teacher, x.A.id, g.id, {});
  assert.ok(a.ok, JSON.stringify(a));
  const calls = standIn((p, i) => (i === 0 ? toolUse('classProgress', {}) : 'Word Hunt: 0 of 2 finished so far.'));
  await say(x, 'How is my class doing?', { type: 'class', classId: x.A.id });
  const r = lastResult(calls);
  assert.equal(r.students, 2);
  assert.equal(r.assignments.length, 1); assert.equal(r.assignments[0].for, 2); assert.equal(r.assignments[0].finished, 0); assert.equal(r.assignments[0].notStarted, 2);
  const sent = JSON.stringify(calls);
  for (const k of x.kids) for (const v of [k.display_name, k.username, k.id, 'Maya', 'Leo']) assert.ok(!sent.includes(v), `never sent: ${v}`);
  assert.doesNotMatch(sent, /hasSupports|supports"|"iep|IEP/i, 'no supports or IEP data');
  await reset(x);
});

test('"Build a lesson" asks (no AI, nothing guessed); "Assign it" asks in plain words; a topic from history is refused; one word sends', async () => {
  const x = world();
  const calls = standIn(() => 'should not be called');
  await say(x, 'Build a lesson');
  let bot = await lastBot(x.tc);
  assert.equal(calls.length, 0, 'answered without the AI');
  assert.match(bot.text, /What topic is it on, and for which grade\?/);
  await say(x, 'Assign it');
  bot = await lastBot(x.tc);
  assert.match(bot.text, /Which game, lesson plan or worksheet should I assign\? Tell me its name/);
  assert.equal(bot.note.ask, undefined, 'no buttons made from old searches');
  // A guessed topic (not in the teacher's words): refused, nothing made.
  const c2 = standIn((p, i) => (i === 0 ? toolUse('makeLesson', { topic: 'Identifying Adjectives', grade: '4' }) : 'What topic would you like?'));
  await say(x, 'Make me one for my class please');
  assert.match(lastResult(c2).error, /not in the teacher's message/);
  assert.equal(q.get("SELECT COUNT(*) n FROM lessons WHERE owner_id=? AND kind!='game'", x.teacher.id).n, 0);
  // With the topic in the words: made by the library's own Draft with AI (its template while the AI rests), read back.
  standIn((p, i) => (i === 0 ? toolUse('makeLesson', { topic: 'adjectives', grade: '4', subject: 'ela' }) : 'I made a lesson plan on adjectives.'));
  await say(x, 'Build a lesson on adjectives for grade 4');
  bot = await lastBot(x.tc);
  assert.equal(bot.note.made.kind, 'lesson'); assert.ok(bot.note.made.n > 0);
  assert.match(bot.note.made.href, new RegExp(`^/teach/lessons/${bot.note.made.id}\\?drafted=`));
  // One word sends.
  standIn(() => 'Great.');
  const r = await post('/api/companion/chat', { text: 'Yes', page: { type: 'teach' } }, x.tc);
  assert.equal(r.status, 200);
  await reset(x);
});

test('"Assign Sum Racer" with the arcade off: in the teacher\'s folder, turned off, never "not on Oomba"; the closest open lesson shares its topic', async () => {
  const x = world();
  const sr = G.getGameBySlug('sum-racer');
  assert.ok(sr, 'Sum Racer is seeded');
  const fo = GF.createFolder(x.teacher, 'Fun Games');
  GF.addGame(x.teacher, fo.folder ? fo.folder.id : fo.id, sr.id);
  const was = config.arcade; config.arcade = false;
  try {
    const calls = standIn((p, i) => (i === 0 ? toolUse('findLesson', { name: 'Sum Racer' }) : 'I couldn\'t find a lesson called Sum Racer on Oomba. Try Arithmetic Lab.'));
    await say(x, 'Assign Sum Racer', { type: 'class', classId: x.A.id });
    const r = lastResult(calls);
    assert.deepEqual(r.turnedOff, [{ title: sr.title, folder: 'Fun Games' }]);
    assert.ok(!r.closestOpen.some(g => g.id === 'arithmetic-lab'), 'never Arithmetic Lab (long division) for addition');
    for (const g of r.closestOpen) assert.ok(g.sameTopic.length, 'shares a topic exactly');
    const bot = await lastBot(x.tc);
    assert.match(bot.text, new RegExp(`^${sr.title} is in your Fun Games folder, but that game is turned off on Oomba right now, so students can't play it\\.`));
    assert.doesNotMatch(bot.text, /couldn't find/i, 'never "not on Oomba"');
  } finally { config.arcade = was; }
  await reset(x);
});

test('Grammar Lab: found and assigned for a teacher it lets in (the course\'s own assign); not available for anyone else', async () => {
  const x = world();
  const was = { on: config.grammarLab, users: config.grammarLabUsers };
  config.grammarLab = true; config.grammarLabUsers = [x.teacher.username.toLowerCase()];
  try {
    const calls = standIn((p, i) => (i === 0 ? toolUse('findLesson', { name: 'Identifying Adjectives' }) : 'Found it in Grammar Lab.'));
    await say(x, 'Find Identifying Adjectives', { type: 'class', classId: x.A.id });
    const found = lastResult(calls).grammarLab;
    const hit = found.find(g => g.what === 'topic' && g.title === 'Identifying Adjectives');
    assert.ok(hit, JSON.stringify(found));
    standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'grammar', id: hit.id, classRef: x.A.id }) : 'Tap Assign on the card.'));
    await say(x, 'Assign Identifying Adjectives to 4b math', { type: 'class', classId: x.A.id });
    const bot = await lastBot(x.tc);
    assert.equal(bot.note.assign.kind, 'grammar');
    const r = await act(x.tc, bot.id, 'assign');
    assert.ok(r.chat, JSON.stringify(r));
    const done = (await lastBot(x.tc)).change;
    assert.equal(done.kind, 'assign');
    const row = q.get("SELECT l.kind FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id WHERE cl.id=?", done.clId);
    assert.equal(row.kind, 'grammar', 'a Grammar Lab assignment, by the course\'s own service');
    // Someone Grammar Lab does not let in: not available.
    config.grammarLabUsers = [];
    const c2 = standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'grammar', id: hit.id, classRef: x.A.id }) : 'Not available.'));
    await say(x, 'Assign Identifying Adjectives', { type: 'class', classId: x.A.id });
    assert.match(lastResult(c2).error, /not available/);
  } finally { config.grammarLab = was.on; config.grammarLabUsers = was.users; }
  await reset(x);
});

test('Grammar Lab open to everyone (GRAMMAR_LAB_USERS=*): any teacher finds "commas", searchGames offers it, assign works, the prompt names it; with the flag off it is never offered', async () => {
  const x = world();
  const was = { on: config.grammarLab, users: config.grammarLabUsers };
  config.grammarLab = true; config.grammarLabUsers = ['*'];
  try {
    assert.ok(!was.users.includes(x.teacher.username.toLowerCase()), 'a teacher not on any list');
    // findLesson("commas"): the Commas unit, the class's grade band (grade 4: 3-5) first
    let calls = standIn((p, i) => (i === 0 ? toolUse('findLesson', { name: 'commas' }) : 'Here is the Commas unit.'));
    await say(x, 'practice for commas', { type: 'class', classId: x.A.id });
    const sys = calls[0].system.map ? calls[0].system.map(b => b.text || '').join('\n') : String(calls[0].system);
    assert.match(sys, /Grammar Lab: a K-12 grammar and writing course/, 'the prompt tells the model Grammar Lab exists');
    assert.match(sys, /proofread room/); assert.match(sys, /practice for commas/);
    const found = lastResult(calls).grammarLab;
    assert.ok(found && found.length, JSON.stringify(lastResult(calls)));
    assert.deepEqual([found[0].what, found[0].title, found[0].band], ['unit', 'Commas', '3-5'], JSON.stringify(found));
    // searchGames on the same words lists Grammar Lab too
    calls = standIn((p, i) => (i === 0 ? toolUse('searchGames', { topic: 'commas', grade: '4' }) : 'Grammar Lab has a Commas unit.'));
    await say(x, 'a game for commas, grade 4', { type: 'class', classId: x.A.id });
    const sg = lastResult(calls);
    assert.ok(sg.grammarLab.some(g => g.title === 'Commas' && g.band === '3-5'), JSON.stringify(sg));
    // explainOomba names it
    calls = standIn((p, i) => (i === 0 ? toolUse('explainOomba', { topic: 'what is on Oomba' }) : 'Lots.'));
    await say(x, 'what does Oomba offer?');
    assert.match(lastResult(calls).text, /Grammar Lab \(K-12 grammar and writing\)/);
    // assign the unit: the card, then Assign, then the class has it
    standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'grammar', id: found[0].id, classRef: x.A.id }) : 'Tap Assign on the card.'));
    await say(x, 'Assign the Commas unit to 4b math', { type: 'class', classId: x.A.id });
    const bot = await lastBot(x.tc);
    assert.equal(bot.note.assign.kind, 'grammar');
    const r = await act(x.tc, bot.id, 'assign');
    assert.ok(r.chat, JSON.stringify(r));
    const done = (await lastBot(x.tc)).change;
    const row = q.get("SELECT l.kind, l.title FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id WHERE cl.id=?", done.clId);
    assert.equal(row.kind, 'grammar'); assert.match(row.title, /Commas/);
    // classProgress: Grammar Lab counts (the assigned unit, and all topics mastered), never a name
    q.run("INSERT OR REPLACE INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?, 'grammar-lab', 'identifying-adjectives', 'k-2', 1, 1, 0, NULL, 1)", x.kids[0].id);
    calls = standIn((p, i) => (i === 0 ? toolUse('classProgress', { classRef: x.A.id }) : 'Here is how it is going.'));
    await say(x, 'How is 4b math doing?', { type: 'class', classId: x.A.id });
    const rep = lastResult(calls);
    assert.ok(rep.grammarLab && rep.grammarLab.some(u => u.unit === 'Commas'), JSON.stringify(rep));
    assert.deepEqual(rep.grammarLabAll, { studentsWithTopicsMastered: 1, topicsMastered: 1 });
    assert.doesNotMatch(JSON.stringify(rep), /Maya|Brook|Leo|Stone|support/i, 'no names, no supports');
    // the flag off: no Grammar Lab anywhere in the chat, and assign says it is not available
    config.grammarLab = false;
    calls = standIn((p, i) => (i === 0 ? toolUse('findLesson', { name: 'commas' }) : 'Not found.'));
    await say(x, 'practice for commas', { type: 'class', classId: x.A.id });
    const off = lastResult(calls);
    assert.equal(off.grammarLab, undefined, JSON.stringify(off));
    const sysOff = calls[0].system.map ? calls[0].system.map(b => b.text || '').join('\n') : String(calls[0].system);
    assert.doesNotMatch(sysOff, /Grammar Lab: a K-12/);
    calls = standIn((p, i) => (i === 0 ? toolUse('searchGames', { topic: 'commas' }) : 'Ok.'));
    await say(x, 'a game for commas', { type: 'class', classId: x.A.id });
    assert.equal(lastResult(calls).grammarLab, undefined);
    calls = standIn((p, i) => (i === 0 ? toolUse('explainOomba', {}) : 'Ok.'));
    await say(x, 'what does Oomba offer?');
    assert.doesNotMatch(lastResult(calls).text, /Grammar Lab/);
    const c2 = standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'grammar', id: found[0].id, classRef: x.A.id }) : 'Not available.'));
    await say(x, 'Assign the Commas unit', { type: 'class', classId: x.A.id });
    assert.match(lastResult(c2).error, /not available/);
  } finally { config.grammarLab = was.on; config.grammarLabUsers = was.users; }
  await reset(x);
});

test('an attached plan with regrouping: the limit asked first (no empty worksheet), then the plan\'s problems in one step', async () => {
  const x = world();
  const file = CO.addDoc(x.teacher, { name: 'plan.docx', kind: 'docx', pages: 1, words: 40, cut: false, text: 'Grade 4. Two-digit addition with regrouping. Problems: 64+28, 53+49, 76+18, 45+57, 29+63. Exit ticket: 58+36.' });
  const sums = [[64, 28], [53, 49], [76, 18], [45, 57], [29, 63], [58, 36]];
  const items = sums.map(([a, b]) => ({ kind: 'barGraph', question: `How many in all? (${a} + ${b})`, data: { categories: ['First', 'Second'], values: [a, b], ytitle: 'Count' }, answerType: 'number', answerKey: 'total' }));
  const calls = standIn((p, i) => (i === 0 ? toolUse('readUpload', { fileId: file.id }) : i === 1 ? toolUse('makeWorksheet', { title: 'Two-digit addition', grade: '4', items }) : 'Pick on the card.'));
  await say(x, 'Turn my attached plan into a worksheet', { type: 'teach' }, { file: file.id });
  assert.equal(lastResult(calls).askedFirst, true);
  let bot = await lastBot(x.tc);
  assert.equal(bot.note.ask.format, 'columns');
  assert.equal(F.listWorksheets(x.teacher).length, 0, 'never an empty worksheet first');
  const picked = await act(x.tc, bot.id, 'askPick', '0');
  const c2 = standIn((p, i) => (i === 0 ? toolUse('makeWorksheet', { title: 'Two-digit addition', grade: '4', items }) : 'I made the worksheet with your 6 problems.'));
  await say(x, picked.text);
  assert.equal(lastResult(c2).made, true);
  bot = await lastBot(x.tc);
  const sheets = F.listWorksheets(x.teacher);
  assert.equal(sheets.length, 1, 'one worksheet');
  const its = F.itemsOf(bot.note.made.id);
  assert.equal(its.length, 6, 'the plan\'s six problems, in one step');
  assert.deepEqual(its.map(it => it.answer), ['92', '102', '94', '102', '92', '94']);
  await reset(x);
});

test('latency: the page goes with the first call (no getPageContext round trip), the prompt is cached, and the answer counts its calls', async () => {
  const x = world();
  const calls = standIn(() => 'Your class has 2 students.');
  await say(x, 'How many students are in this class?', { type: 'class', classId: x.A.id });
  assert.equal(calls.length, 1, 'one model call');
  assert.match(calls[0].system, /The page now: \{"page":"class","class":\{"id":/);
  assert.doesNotMatch(calls[0].system, /4b math/, 'without the class name');
  assert.deepEqual(calls[0].cache_control, { type: 'ephemeral' });
  const bot = await lastBot(x.tc);
  assert.equal(bot.note.perf.calls, 1); assert.ok(bot.note.perf.sys > 0 && bot.note.perf.tools > 0);
  await reset(x);
});
