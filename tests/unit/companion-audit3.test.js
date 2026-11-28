// The owner's "chat audit 3" (docs/decisions.md "Oomba chat: audit 3 fixes"), item by item, with the AI a stand-in
// (services/companion.js hooks.create; harness: tests/unit/_companion-actions-harness.js):
//   1. a lesson plan the chat drafts never uses a hidden or live-only game (Sum Racer with the arcade off, Brain Board);
//   2. the progress reply reads the class now: students but nothing assigned says so first, never "no students";
//   3. a live game hosted from the chat leaves a trace on the class's Progress page (open now, then its results); the
//      card says results come once it is played and ended; teachers read "live games", not "live lessons";
//   4. the change card's link is named for what was assigned; the AI is told to use the class's full name;
//   5. the Studio's header is read again when a version lands (never "Nothing built yet" after a build);
//   6. a Figures worksheet page carries its worksheet, so the first paint is its real title and questions;
//   7. the Builder hand-off opens on Classroom game (&kind=classgame, a plain '&'), and the brief is the first message;
//   8. one vocabulary in the chat: game, lesson plan, worksheet.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const H = await import('./_companion-actions-harness.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const S = await import('../../server/services/schools.js');
const LS = await import('../../server/services/classlive-sessions.js');
const QL = await import('../../server/services/quick-live.js');
const LD = await import('../../server/services/lesson-draft.js');
const L = await import('../../server/services/lessons.js');
const F = await import('../../server/services/figures.js');
const games = await import('../../server/services/games.js');
const CO = await import('../../server/services/companion.js');
const { assignedLink } = await import('../../server/services/companion-actions/shared.js');
const { liveGameOf } = await import('../../server/live/live-games.js');
const { tFor } = await import('../../server/i18n/index.js');
const { firstKind } = await import('../../server/routes/build-setup.js');
H.boot();
test.after(() => LS._reset());

const read = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const html = async (p, cookie) => { const r = await H.get(p, cookie); assert.equal(r.status, 200, p); return r.text(); };

// ---------------------------------------------------------------- 1. no hidden game in a drafted lesson plan
test('1. the draft\'s games: no hidden official game (Sum Racer, arcade off) and no live-only one (Brain Board); a step naming one is saved as a written step', () => {
  const x = H.world();
  const was = config.arcade; config.arcade = false;
  try {
    const sum = games.getGameBySlug('sum-racer'), board = games.getGameBySlug('brain-board');
    assert.ok(sum && board, 'the seed has both');
    assert.equal(LD.stepGameOk(x.teacher, sum), false, 'Sum Racer is off while the arcade is hidden');
    assert.equal(LD.stepGameOk(x.teacher, board), false, 'Brain Board is hosted live only');
    const { catalog } = LD.catalogs(x.teacher, x.s.id);
    assert.ok(catalog.length > 0);
    const ids = new Set(catalog.map(g => g.id));
    assert.ok(!ids.has(sum.id), 'Sum Racer is not offered to the draft');
    assert.ok(!ids.has(board.id), 'Brain Board is not offered to the draft');
    for (const g of catalog) { const row = games.getGame(g.id); assert.equal(row.status, 'published', g.title); const lg = liveGameOf(row); assert.ok(!(lg && !lg.play), `${g.title} is live only`); }
    // The save checks again: a step that names Sum Racer anyway becomes a written step, never a game step.
    const open = games.getGame(catalog[0].id);
    const d = { ai: false, draft: { title: 'Adding to 20', summary: '', objectives: [], steps: [
      { kind: 'game', title: 'Race the sums', body: 'Play.', minutes: 10, gameId: sum.id },
      { kind: 'game', title: 'Practice', body: 'Play.', minutes: 10, gameId: open.id },
    ] } };
    const r = LD.save(x.teacher, x.s.id, d, { topic: 'adding' });
    assert.equal(r.ok, true);
    const steps = L.steps(r.lesson.id);
    assert.equal(steps.length, 2);
    assert.equal(steps[0].kind, 'text'); assert.equal(steps[0].game_id || null, null);
    assert.equal(steps[1].kind, 'game'); assert.equal(steps[1].game_id, open.id);
    // With the arcade on, Sum Racer is a game like any other again.
    config.arcade = true;
    assert.equal(LD.stepGameOk(x.teacher, sum), true);
  } finally { config.arcade = was; }
});

test('1. makeLesson from the chat: the plan it saves has no hidden game, even for a topic that names one', async () => {
  const x = H.world();
  const was = config.arcade; config.arcade = false;
  try {
    const sum = games.getGameBySlug('sum-racer');
    H.standIn((p, i) => (i === 0 ? H.toolUse('makeLesson', { topic: 'Sum Racer addition', grade: '1' }) : 'Here is your lesson plan.'));
    await H.say(x, 'Build a lesson plan on Sum Racer addition for grade 1', { type: 'teach' });
    const bot = await H.lastBot(x);
    const made = bot.note && bot.note.made;
    assert.ok(made && made.kind === 'lesson', JSON.stringify(bot.note));
    const gamesIn = L.steps(made.id).filter(s => s.kind === 'game').map(s => s.game_id);
    assert.ok(!gamesIn.includes(sum.id), 'Sum Racer is not in the plan');
  } finally { config.arcade = was; }
});

// ---------------------------------------------------------------- 2. the progress reply reads the class now
test('2. classProgress: no students says so; once a student is added, "students and nothing assigned yet", never "no students"', async () => {
  const x = H.world();
  const E = S.createClass({ id: x.teacher.id }, x.s.id, { name: '4b math', grade: '4' }).class;
  const page = { type: 'class', classId: E.id };
  let calls = H.standIn((p, i) => (i === 0 ? H.toolUse('classProgress', {}) : 'Here is how it is going.'));
  await H.say(x, 'How is 4b math doing?', page);
  assert.equal(H.resultOf(calls).students, 0);
  assert.match((await H.lastBot(x)).text, /4b math has no students yet/);
  // a student joins (as the chat's Add students does), then the same question
  const kid = S.createSchoolAccount({ id: x.admin.id }, x.s.id, { rosterName: 'Nia Park', grade: '4' }).user;
  S.addToClass({ id: x.admin.id }, E.id, kid.id, 'student');
  calls = H.standIn((p, i) => (i === 0 ? H.toolUse('classProgress', {}) : 'Assign something to start.'));
  await H.say(x, 'And now?', page);
  const r = H.resultOf(calls);
  assert.equal(r.students, 1); assert.deepEqual(r.assignments, []); assert.equal(r.className, '4b math');
  assert.match(r.note, /1 student and nothing assigned yet/); assert.match(r.note, /Never say the class has no students/);
  const text = (await H.lastBot(x)).text;
  assert.match(text, /^4b math has 1 student and nothing assigned yet/);
  assert.doesNotMatch(text, /no students/);
  assert.ok(!JSON.stringify(calls).includes('Nia Park'), 'the name never goes to the AI');
});

// ---------------------------------------------------------------- 3. a live game from the chat on the Progress page
test('3. hostLive: the card says results come once it is played; the class\'s Progress page shows the open game, then its results; "live games" for teachers', async () => {
  const x = H.world();
  const t = tFor('en');
  // teachers read the same words as everyone: no "live lessons" variant any more
  assert.equal(t.has('folders.liveHistoryNoneForTeachers'), false);
  assert.match(t('folders.liveHistoryNone'), /No live games/);
  const before = await html(`/class/${x.A.id}/progress`, x.tc);
  if (LS.liveOn()) assert.match(before, /No live games with this class yet/);
  assert.doesNotMatch(before, /live lessons/i);
  if (!LS.liveOn()) return;
  const c = await H.ask(x, 'hostLive', {}, undefined, 'Host Brain Board with my class');
  assert.match(c.r.what, /hosting a live game/); assert.match(c.r.what, /only once it is played and ended/);
  const done = await H.doIt(x, c.bot);
  assert.ok(done.change.lines.some(l => /once the game is played and ended/.test(l)), JSON.stringify(done.change.lines));
  assert.ok(done.change.links.some(l => l.href === `/class/${x.A.id}/progress#live-games`));
  const s = LS.hostSession(x.teacher.id);
  assert.equal(s.classId, x.A.id);
  // open now: its trace, with the way back to the host screen, and no "No live games" line
  const open = await html(`/class/${x.A.id}/progress`, x.tc);
  assert.match(open, /A live game is open now/); assert.ok(open.includes(`/live/host/${s.id}`));
  assert.doesNotMatch(open, /No live games with this class yet/);
  // played and ended: saved for the class, listed with its results
  s.startedAt = Date.now() - 60e3;
  LS.endSession(s.id, 'ended');
  const run = q.get('SELECT id, class_id FROM live_runs WHERE id=?', s.id);
  assert.ok(run, 'a played game is saved'); assert.equal(run.class_id, x.A.id);
  const after = await html(`/class/${x.A.id}/progress`, x.tc);
  assert.ok(after.includes(`/live/results/${s.id}`)); assert.doesNotMatch(after, /A live game is open now/);
});

test('3. endLive on a game nobody played: the card says it has no results', async () => {
  const x = H.world();
  if (!LS.liveOn()) return;
  const r = QL.openQuick(x.teacher, x.A, QL.quickPlan(x.teacher, x.A, {}), 'en');
  assert.equal(r.ok, true);
  const e = await H.ask(x, 'endLive', {}, { type: 'teach' }, 'End the live game');
  const done = await H.doIt(x, e.bot);
  assert.ok(done.change.lines.some(l => /Nobody played it, so it has no results/.test(l)), JSON.stringify(done.change.lines));
});

// ---------------------------------------------------------------- 4. the card's link, the class's full name
test('4. the change card\'s link is named for what was assigned (game, lesson plan, worksheet, book)', async () => {
  const t = tFor('en');
  assert.equal(assignedLink('c1', t, 'game').label, "See the class's games");
  assert.equal(assignedLink('c1', t, 'lesson').label, "See the class's lesson plans");
  assert.equal(assignedLink('c1', t, 'sheet').label, "See the class's worksheets");
  assert.equal(assignedLink('c1', t, 'book').label, "See the class's books");
  assert.equal(assignedLink('c1', t).label, "See the class's assignments");
  assert.equal(assignedLink('c1', t).href, '/class/c1?view=assigned');
  // the chat's own Assign card: the change says what was assigned, and the page names the link for it
  const x = H.world();
  H.standIn((p, i) => (i === 0 ? H.toolUse('assign', { kind: 'game', id: 'word-hunt', classRef: 'Room 12 Owls' }) : 'Tap Assign.'));
  await H.say(x, 'Assign Word Hunt to Room 12 Owls', { type: 'teach' });
  const bot = await H.lastBot(x);
  const res = await H.act(x, bot.id, 'assign'); assert.equal(res.status, 200, await res.clone().text());
  const done = await H.lastBot(x);
  assert.equal(done.change.kind, 'assign'); assert.equal(done.change.what, 'game');
  const js = read('public/js/companion.js');
  assert.match(js, /x\.change\.what/);
  // a lesson plan assigned with the action card: the lesson plans link
  const lesson = L.createLesson(x.teacher, x.s.id, { title: 'Fractions day' }).lesson;
  L.addStep(x.teacher, lesson.id, { kind: 'text', title: 'Read', body: 'Read the page.', minutes: 5 });
  const c = await H.ask(x, 'assignLesson', { lesson: 'Fractions day' });
  assert.ok(!c.r.error, JSON.stringify(c.r));
  const d2 = await H.doIt(x, c.bot);
  assert.ok(d2.change.links.some(l => l.label === "See the class's lesson plans"), JSON.stringify(d2.change.links));
});

test('4 and 8. the system prompt: the class\'s full name, and one vocabulary (game, lesson plan, worksheet)', async () => {
  const x = H.world();
  const calls = H.standIn(() => 'Hello!');
  await H.say(x, 'Hi', { type: 'teach' });
  const sys = typeof calls[0].system === 'string' ? calls[0].system : JSON.stringify(calls[0].system);
  assert.match(sys, /name a class by its full name/); assert.match(sys, /never shortened to the words the teacher typed/);
  assert.match(sys, /A "game" is one playable thing/); assert.match(sys, /A "lesson plan" is/); assert.match(sys, /A "worksheet" is/);
  assert.match(sys, /Never call a game a "lesson"/);
  assert.doesNotMatch(sys, /call a single playable thing .* a "lesson"/);
  // the chat's own card strings
  const t = tFor('en');
  assert.match(t('js.companion.hello'), /a game, a book, a worksheet/);
  assert.equal(t('js.companion.idea.game.label'), 'Find a game');
  assert.match(t('js.companion.step.games', { q: 'x' }), /^Searched games/);
  assert.match(t('js.companion.act.assignments.lesson.ask', { title: 'A', class: 'B' }), /lesson plan/);
  assert.equal(t('js.companion.made.open.lesson'), 'Open the lesson plan');
  assert.equal(t('js.companion.hand.builder'), 'Game in the Builder');
});

// ---------------------------------------------------------------- 5. the Studio header after a build
test('5. Studio: a new version reads the header back (current version, status), never "Nothing built yet" after a build', () => {
  const js = read('public/js/studio.js');
  const fn = js.slice(js.indexOf('async function refreshLiveLine'), js.indexOf('function renderSafety'));
  assert.match(fn, /'current'/); assert.match(fn, /'status'/);
  assert.match(fn, /renderTop\(\); renderLive\(\); renderSafety\(\)/);
  assert.match(js, /ev === 'version'\) \{[^\n]*refreshLiveLine\(\)/);
});

// ---------------------------------------------------------------- 6. the worksheet's first paint
test('6. a Figures worksheet page carries the worksheet: its title and questions on the first paint, never a false empty state', async () => {
  const x = H.world();
  if (!F.canMake(x.teacher)) return;
  const made = F.createWorksheet(x.teacher, { purpose: 'worksheet' });
  assert.equal(made.ok, true);
  F.updateWorksheet(x.teacher, made.id, { title: 'Angles on a line' });
  const page = await html(`/figures/worksheets/${made.id}`, x.tc);
  const m = /<script type="application\/json" id="fg-sheet">([^<]*)<\/script>/.exec(page);
  assert.ok(m, 'the page data');
  const P = JSON.parse(m[1]);
  assert.equal(P.id, made.id);
  assert.ok(P.worksheet, 'the worksheet comes with the page'); assert.equal(P.worksheet.title, 'Angles on a line');
  assert.ok(Array.isArray(P.worksheet.items));
  const js = read('public/js/figures-sheet.js');
  assert.match(js, /if \(P\.worksheet\) W = P\.worksheet;\n {2}shell\(\);/);
  assert.match(js, /!W && P\.id \? `<li class="fg-empty muted">\$\{esc\(t\('js\.figures-sheet\.loading'\)\)\}/);
  // a new worksheet has none
  const fresh = await html('/figures/worksheets/new', x.tc);
  assert.match(fresh, /"worksheet":null/);
});

// ---------------------------------------------------------------- 7. the Builder hand-off
test('7. startBuild: the card opens the Builder on Classroom game (&kind=classgame, a plain "&"); the brief is kept whole', async () => {
  const x = H.world();
  // The hand-off card is what a teacher gets with building in the chat off (docs/decisions.md "Builder in the chat
  // (phase 2)": with it on, startBuild makes the ask card instead).
  const was = config.companionBuild; config.companionBuild = false;
  try {
  const brief = 'A matching game: students match equivalent fractions (1/2 and 2/4) in rounds of six pairs, with a hint after two misses.';
  H.standIn((p, i) => (i === 0 ? H.toolUse('startBuild', { tool: 'builder', title: 'Fraction match', grade: '4', brief, practice: 'equivalent fractions' }) : 'I drafted a brief for Fraction match. Press Open the Builder to build it.'));
  await H.say(x, 'Make a game for equivalent fractions', { type: 'class', classId: x.A.id });
  const bot = await H.lastBot(x);
  const h = bot.note.handoff;
  assert.equal(h.href, `/build/new?for=class&class=${x.A.id}&kind=classgame`);
  assert.ok(!h.href.includes('&amp;'));
  assert.equal(h.brief, brief, 'the brief word for word');
  const r = await (await H.act(x, bot.id, 'handoff')).json();
  assert.equal(r.handoff.href, h.href);
  // the page starts on Classroom game, not Classroom lesson
  assert.equal(firstKind({ teacher: true, forClass: true, asked: 'classgame' }), 'classgame');
  const page = await html(h.href, x.tc);
  assert.match(page, /id="su-brief"/);
  assert.match(page, /"canvas":\{"kind":"classgame"/, 'the setup starts on Classroom game');
  // the browser: the hand-off lands in the brief box (not the activity's lesson box), and the brief is the first message
  const cjs = read('public/js/companion.js');
  assert.match(cjs, /location\.pathname === '\/build\/new' \? 'su-brief'/);
  const bjs = read('public/js/buildsetup.js');
  assert.match(bjs, /\$\('#su-brief'\)\.addEventListener\('input'/);
  assert.match(bjs, /const withBrief = text => \[String\(text \|\| ''\)\.trim\(\), S\.brief\]/);
  assert.match(bjs, /if \(isEmpty\(plan\) && !told\) return direct\(btn\);/);
  assert.match(bjs, /\.\.\.\(told \? \{ text: told \} : \{\}\)/);
  } finally { config.companionBuild = was; }
});

test('7. the runner: a game plan\'s told (the brief) is the first Builder message, intact', async () => {
  const R = await import('../../server/builder/runner.js');
  const src = read('server/builder/runner.js');
  assert.match(src, /const told = plan && typeof plan\.told === 'string' && \(plan\.kind === 'activity' \|\| plan\.brief === true\)/);
  assert.match(read('public/js/buildsetup.js'), /told, \.\.\.\(S\.brief \? \{ brief: true \} : \{\}\)/);
  assert.match(src, /if \(plan\) text = told \? scrub\(told/);
  assert.ok(R.submit);
  // the system prompt's hand-off line: a game, opened on Classroom game
  const sys = CO.TOOLS ? JSON.stringify(CO.TOOLS) : '';
  if (sys) assert.match(sys, /it opens on Classroom game/);
});
