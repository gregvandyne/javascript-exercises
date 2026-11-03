// CS Quest catalogue loader and materialiser (server/services/lesson-templates.js) and its routes (server/routes/cs-quest.js)
// on an in-memory database: every lesson file present materialises into a teacher's library (folders, lesson fields,
// template_key / version, the steps in order with their minutes summing to 45, canonical options, standards, rubrics, the
// quiz step with cat and secs kept, the hosted-live warm-up, the 7.2 build step on the quiz template), the derived live
// sets (warm-up, exit ticket, one unit review per unit and band, subject 'cs-quest'), idempotent re-materialising and
// "Add again", the QUIZ_STEPS-off and game-not-published text steps, reset to the catalogue version (P21), and the JSON
// routes: from-template (one lesson, a unit, a path), assign-unit with a cadence (P17), builder-status (P18), catalog,
// coverage. The 17 lesson files not written yet are skipped by name; the bank-dependent checks skip when owner B's
// banks are not in seed-lessons/cs-quest/sets/.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const SETS = await import('../../server/services/classlive-sets.js');
const PP = await import('../../server/services/play-params.js');
const games = await import('../../server/services/games.js');
const CSTA = await import('../../server/standards/csta.js');
const T = await import('../../server/services/lesson-templates.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'CsqTplBoss', password: 'secret123', role: 'admin' });
const official = createUser({ username: 'OombaAcademy', password: 'secret123' });
const oak = S.createSchool(boss, { name: 'Oak Catalogue' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 4B' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const outsider = createUser({ username: 'CsqOutsider', password: 'secret123' });
function seedGame(slug, title) {
  const g = games.createGame(official.id, { title, slug, source: 'seed', category: 'learning' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  return games.getGame(g.id);
}
const GAME = Object.fromEntries([['robo-route', 'Robo Route'], ['data-detective', 'Data Detective'], ['packet-post', 'Packet Post'], ['inside-the-machine', 'Inside the Machine'],
  ['quest-race', 'Quest Race'], ['question-battle', 'Question Battle'], ['would-you-rather-live', 'Would You Rather (Live)']].map(([s, t]) => [s, seedGame(s, t)]));

const cat = T.catalogue();
const present = T.templates();
const haveBanks = cat.banks.size === 14;
const noBanks = !haveBanks && `owner B's 14 banks are not in seed-lessons/cs-quest/sets (${cat.banks.size} found)`;
const minutes = steps => steps.reduce((n, s) => n + s.minutes, 0);
const DAY = 86400e3, day = s => Date.parse(`${s}T00:00:00Z`);

test('catalogue loader: units, paths, the lesson files present, missing keys, banks, unit and path keys, set titles', () => {
  assert.equal(cat.program.slug, 'cs-quest');
  assert.equal(cat.units.length, 7); assert.equal(cat.paths.length, 4);
  assert.equal(present.length + cat.missing.length, 46, 'every key is present or missing');
  assert.ok(present.length >= 29, `${present.length} lesson files`);
  for (const l of present) { assert.ok(T.isKey(l.key)); assert.equal(T.getTemplate(l.key), l); assert.equal(T.getTemplate(l.key.toUpperCase()), l, 'keys are case-insensitive'); assert.ok(l.unitTitle && l.file); }
  assert.equal(T.getTemplate('csq-3-9.9'), null); assert.equal(T.getTemplate(''), null);
  assert.deepEqual(present.slice(0, 4).map(l => l.key), ['csq-1b-1.1', 'csq-2-1.1', 'csq-1b-1.2', 'csq-2-1.2'], 'program order: lesson, then band');
  assert.deepEqual(T.templates({ band: '2', unit: 1 }).map(l => l.key), ['csq-2-1.1', 'csq-2-1.2', 'csq-2-1.3', 'csq-2-1.4', 'csq-2-1.5']);
  const u1 = T.unitKeys(1, '1b'); assert.deepEqual(u1.keys, ['csq-1b-1.1', 'csq-1b-1.2', 'csq-1b-1.3', 'csq-1b-1.4', 'csq-1b-1.5']); assert.deepEqual(u1.missing, []);
  assert.equal(T.unitKeys(9, '1b'), null); assert.equal(T.unitKeys(1, '3'), null);
  const core = T.pathKeys('core10-no-builder', '1B');
  assert.deepEqual([...core.keys, ...core.missing].length, 10, 'Core 10 lists ten keys');
  assert.ok(core.keys.includes('csq-1b-1.2') && core.keys.includes('csq-1b-6.1'));
  assert.ok(!core.keys.some(k => /-7\./.test(k)), 'no Builder lesson in the default path');
  assert.equal(T.pathKeys('nope', '1B'), null);
  assert.equal(T.unitOf(7).needsSchoolPlan, true); assert.equal(T.pathOf('full').lessons.length, 23);
  const loops = T.getTemplate('csq-1b-1.2');
  assert.deepEqual(T.setTitles(loops), { warmup: 'CSQ 1.2 warm-up · Loops (3-5)', exit: 'CSQ 1.2 exit ticket (3-5)', review: 'CSQ Unit 1 review (3-5)' });
  assert.deepEqual(T.setTitles(T.getTemplate('csq-2-1.2')), { warmup: 'CSQ 1.2 warm-up · Loops (6-8)', exit: 'CSQ 1.2 exit ticket (6-8)', review: 'CSQ Unit 1 review (6-8)' });
  if (haveBanks) {
    assert.equal(T.bankOf('csq-u1-1b').band, '1B');
    assert.deepEqual(T.bankItems('csq-u1-1b', loops.exit.items).map(it => it.id), loops.exit.items, 'exit items in order');
    assert.equal(T.bankItems('csq-u1-1b', ['1b-1.2-e1', 'nope']), null, 'a missing item: null, never a hole');
  }
  assert.equal(T.bankItems('csq-u9-1b', ['x']), null);
});

test('materialise: a lesson lands in CS Quest / Unit folders with its fields, template_key and version; steps in order sum to 45', () => {
  const r = T.materialise(ana, oak.id, 'csq-1b-1.2');
  assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.created, true);
  const l = r.lesson;
  assert.equal(l.title, 'CS Quest 1.2 · Again and again (Loops)'); assert.equal(l.subject, 'Computer science'); assert.equal(l.grade, 'Grades 3-5');
  assert.equal(l.template_key, 'csq-1b-1.2'); assert.equal(l.template_version, 1); assert.equal(l.owner_id, ana.id); assert.equal(l.school_id, oak.id);
  assert.match(l.objectives, /^Spot steps that repeat/m, 'I-can lines as objectives, capitalised, one per line');
  const tree = L.folderTree(ana.id, oak.id);
  const unit = tree.find(f => f.id === l.folder_id), top = tree.find(f => f.id === unit.parent_id);
  assert.equal(unit.name, 'Unit 1 · Think Like a Robot (Grades 3-5)'); assert.equal(top.name, 'CS Quest'); assert.equal(top.parent_id, null);
  const steps = L.steps(l.id), tpl = T.getTemplate('csq-1b-1.2');
  assert.deepEqual(steps.map(s => s.title), tpl.steps.map(s => s.title));
  assert.equal(minutes(steps), 45);
  assert.deepEqual(steps.map(s => s.kind), ['text', 'game', 'game', haveBanks ? 'quiz' : 'text', 'question']);
  const [today, warm, play, exit, words] = steps;
  assert.match(today.body, /^Do Now: /); assert.doesNotMatch(today.body, /CS Quest|1B-AP/);
  assert.equal(warm.game_id, GAME['quest-race'].id); assert.ok(P.hostedLive(warm), 'the warm-up is hosted live (Play hidden)'); assert.equal(warm.options, ''); assert.equal(warm.standards, '');
  assert.equal(play.game_id, GAME['robo-route'].id); assert.equal(play.options, 'chapter=loops&band=1b&lock=1'); assert.equal(play.standards, '1B-AP-10'); assert.match(play.body, /quest code, it is 2 1 0 0/);
  assert.equal(words.kind, 'question'); assert.equal(words.standards, '1B-AP-10'); assert.match(words.body, /A loop ___, and programmers like it because ___\./);
  assert.deepEqual(L.rubricOf(words), tpl.exit.rubric, 'rubric: "exit" resolves to exit.rubric in the platform shape');
  if (haveBanks) {
    assert.equal(exit.kind, 'quiz'); assert.equal(exit.minutes, 3); assert.equal(exit.set_id, r.sets.exit.id);
    const items = L.quizItemsOf(exit); assert.equal(items.length, 3);
    for (const [i, it] of items.entries()) { const bank = T.bankItems('csq-u1-1b', [tpl.exit.items[i]])[0]; assert.equal(it.cat, bank.cat, 'cat kept'); assert.equal(it.secs, bank.secs, 'secs kept'); assert.equal(it.q, bank.q); assert.ok(tpl.csta.primary.includes(it.cat)); }
  }
  // a second teacher gets their own folders and copy; an outsider and the wrong school are refused
  const r2 = T.materialise(ben, oak.id, 'csq-1b-1.2'); assert.ok(r2.ok); assert.notEqual(r2.lesson.id, l.id); assert.notEqual(r2.lesson.folder_id, l.folder_id);
  assert.equal(T.materialise(outsider, oak.id, 'csq-1b-1.2').code, 'notFound');
  assert.equal(T.materialise(ana, 'no-such-school', 'csq-1b-1.2').code, 'notFound');
  assert.equal(T.materialise(ana, oak.id, 'csq-1b-9.9').code, 'notFound');
});

test('derived sets: warm-up (5 items, 15 s), exit ticket (3 items, cat kept) and one unit review per unit and band, subject cs-quest, in My sets', { skip: noBanks }, () => {
  const r = T.materialise(ana, oak.id, 'csq-1b-1.3');
  assert.ok(r.ok, JSON.stringify(r));
  const tpl = T.getTemplate('csq-1b-1.3');
  for (const k of ['warmup', 'exit', 'review']) { assert.ok(r.sets[k], k); assert.equal(r.sets[k].subject, 'cs-quest'); assert.equal(r.sets[k].owner_id, ana.id); assert.equal(r.sets[k].title, T.setTitles(tpl)[k]); }
  const warm = SETS.itemsOf(r.sets.warmup); assert.equal(warm.length, 5); assert.ok(warm.every(it => it.secs === 15 && it.cat && it.choices.length === 4));
  assert.deepEqual(warm.map(it => it.q), T.bankItems('csq-u1-1b', tpl.warmup.items).map(it => it.q), 'the five items in the lesson order');
  const exit = SETS.itemsOf(r.sets.exit); assert.equal(exit.length, 3); assert.ok(exit.every(it => tpl.csta.primary.includes(it.cat)));
  const review = SETS.itemsOf(r.sets.review); assert.equal(review.length, T.bankOf('csq-u1-1b').items.length, 'the whole bank');
  assert.ok(review.every(it => !/^(1B|2)-/.test(it.cat)), 'review items carry the topic, never a code'); assert.ok(review.some(it => it.cat === 'Loops'));
  assert.ok(SETS.listFor(ana).mine.some(s => s.id === r.sets.review.id && s.ready), 'ready to host from My sets');
  // the unit review is one set per unit and band: 1.2 made it, 1.3 refreshed it
  assert.equal(q.get("SELECT COUNT(*) n FROM live_sets WHERE owner_id=? AND title=? AND archived_at IS NULL", ana.id, 'CSQ Unit 1 review (3-5)').n, 1);
  // a set a teacher archived comes back fresh; one they still have is reused (no clutter)
  SETS.archiveSet(ana, r.sets.exit.id);
  const again = T.materialise(ana, oak.id, 'csq-1b-1.3', { again: true });
  assert.notEqual(again.sets.exit.id, r.sets.exit.id); assert.equal(again.sets.warmup.id, r.sets.warmup.id); assert.equal(again.sets.review.id, r.sets.review.id);
  assert.equal(q.get("SELECT COUNT(*) n FROM live_sets WHERE owner_id=? AND subject='cs-quest' AND archived_at IS NULL", ana.id).n, 3 + 2, '1.2: warm-up, exit, review; 1.3: warm-up, exit');
});

test('every lesson file present materialises: kinds, 45 minutes, canonical options, standards, rubrics, templates, quest codes in bodies', () => {
  const sam = S.createSchoolAccount(boss, oak.id, { rosterName: 'Sam Teacher', role: 'teacher' }).user;
  for (const tpl of present) {
    const r = T.materialise(sam, oak.id, tpl.key);
    assert.ok(r.ok, `${tpl.key}: ${JSON.stringify(r)}`);
    assert.equal(r.notes.filter(n => n.code !== 'bankMissing').length, 0, `${tpl.key}: no notes with every game published: ${JSON.stringify(r.notes)}`);
    const steps = L.steps(r.lesson.id);
    assert.equal(steps.length, tpl.steps.length, `${tpl.key}: one step per catalogue step`);
    assert.equal(minutes(steps), 45, `${tpl.key}: 45 minutes`);
    assert.equal(r.lesson.template_key, tpl.key); assert.equal(r.lesson.template_version, tpl.version);
    for (const [i, s] of steps.entries()) {
      const c = tpl.steps[i], at = `${tpl.key} "${c.title}"`;
      assert.equal(s.minutes, c.minutes, at);
      if (c.kind === 'quiz') { assert.equal(s.title, haveBanks ? 'Exit ticket' : T.PAPER_EXIT_TITLE, at); assert.equal(s.kind, haveBanks ? 'quiz' : 'text', at); if (haveBanks) assert.ok(L.quizItemsOf(s).every(it => it.cat && it.secs), `${at}: cat and secs on every item`); continue; }
      assert.equal(s.title, c.title, at); assert.equal(s.kind, c.kind, at);
      if (c.kind === 'game') {
        assert.equal(s.game_slug, c.gameSlug, at);
        if (c.live) { assert.ok(P.hostedLive(s), `${at}: hosted live`); assert.equal(s.options, '', at); if (c.live === 'warmup') assert.equal(s.game_slug, T.WARMUP_GAME[tpl.band], at); }
        else { assert.equal(s.options, c.options, at); assert.equal(PP.cleanOptions(s.options), s.options, `${at}: canonical options`); assert.equal(PP.parseParams(s.options).lock, 1, at); assert.ok(s.body.includes(c.questCode), `${at}: the quest code is in the body`); assert.equal(s.standards, c.standards.join(','), at); }
      }
      if (c.kind === 'question' || c.kind === 'build') {
        assert.equal(s.standards, (c.standards || []).join(','), at);
        const lines = c.rubric === 'exit' ? tpl.exit.rubric : c.rubric || [];
        assert.deepEqual(L.rubricOf(s), lines.map(x => ({ line: x.line, ids: x.ids || [], levels: x.levels || [] })), `${at}: rubric`);
        for (const id of L.rubricOf(s).flatMap(x => x.ids)) assert.ok(CSTA.isId(id));
      }
      if (c.kind === 'build') assert.equal(s.template, 'quiz', `${at}: the capstone starts from the quiz template`);
      else assert.equal(s.template, '', at);
    }
    for (const id of tpl.csta.primary) assert.ok(steps.some(s => s.standards.split(',').includes(id)), `${tpl.key}: ${id} on a step (Practiced)`);
  }
});

test('7.2 build day: Builder etiquette replaces the warm-up; the build step carries template quiz, the Program line with no ids, the message placeholder first (the Studio prefill)', () => {
  for (const [key, id] of [['csq-1b-7.2', '1B-AP-15'], ['csq-2-7.2', '2-AP-17']]) {
    const tpl = T.getTemplate(key); if (!tpl) continue;
    const r = T.materialise(ana, oak.id, key); assert.ok(r.ok, JSON.stringify(r));
    const steps = L.steps(r.lesson.id);
    assert.ok(!steps.some(s => s.title === 'Warm-up (live)'), `${key}: no warm-up`);
    assert.equal(steps[1].kind, 'text'); assert.equal(steps[1].title, 'Builder etiquette');
    const build = steps.find(s => s.kind === 'build');
    assert.ok(build, `${key}: a build step`); assert.equal(build.title, 'Build your game'); assert.equal(build.minutes, 18);
    assert.equal(build.template, 'quiz'); assert.equal(build.standards, id);
    const rubric = L.rubricOf(build); assert.equal(rubric.length, 1); assert.equal(rubric[0].line, 'Program'); assert.deepEqual(rubric[0].ids, [], 'builds toward only: evidence for nothing'); assert.equal(rubric[0].levels.length, 4);
    assert.match(build.body.slice(0, 300), /^Paste your team's Builder message here \(up to 300 characters\)\./, 'the first 300 characters are the prefill');
    assert.equal(minutes(steps), 45);
  }
});

test('idempotent: the same key answers the existing copy at this version; again makes a fresh copy; status and libraryStatus report Update available on an older copy', () => {
  const key = 'csq-2-1.1';
  const first = T.materialise(ana, oak.id, key); assert.ok(first.ok); assert.equal(first.created, true);
  const same = T.materialise(ana, oak.id, key); assert.ok(same.ok); assert.equal(same.created, false); assert.equal(same.lesson.id, first.lesson.id); assert.equal(same.steps.length, first.steps.length);
  assert.equal(T.copiesOf(ana, oak.id, key).length, 1);
  const again = T.materialise(ana, oak.id, key, { again: true }); assert.equal(again.created, true); assert.notEqual(again.lesson.id, first.lesson.id);
  assert.equal(T.copiesOf(ana, oak.id, key).length, 2);
  let st = T.status(ana, oak.id, key);
  assert.deepEqual([st.inLibrary, st.updateAvailable, st.current.id, st.copies.length, st.version], [true, false, again.lesson.id, 2, 1]);
  assert.equal(T.status(ana, oak.id, 'csq-9-1.1'), null);
  assert.equal(T.status(ben, oak.id, key).inLibrary, false, 'per teacher');
  // an older copy (the catalogue moved on): Update available, and materialise makes the new version instead of answering it
  q.run('UPDATE lessons SET template_version=0 WHERE owner_id=? AND template_key=?', ana.id, key);
  st = T.status(ana, oak.id, key); assert.equal(st.updateAvailable, true);
  const lib = T.libraryStatus(ana, oak.id);
  assert.equal(lib.size, present.length, 'one status per lesson file present');
  assert.equal(lib.get(key).updateAvailable, true); assert.equal(lib.get(key).copies.length, 2); assert.equal(lib.get('csq-1b-1.2').inLibrary, true);
  const upd = T.materialise(ana, oak.id, key); assert.equal(upd.created, true); assert.equal(upd.lesson.template_version, 1);
  assert.equal(T.status(ana, oak.id, key).updateAvailable, false, 'the newest copy is current');
  assert.equal(T.copiesOf(ana, oak.id, key).length, 3);
});

test('QUIZ_STEPS off: the exit ticket is a text step "Exit ticket (paper or live)" (noted); on again: a quiz step', { skip: noBanks }, () => {
  config.quizSteps = false;
  try {
    const r = T.materialise(ana, oak.id, 'csq-1b-1.4');
    assert.ok(r.ok, JSON.stringify(r));
    const exit = L.steps(r.lesson.id).at(-2);
    assert.equal(exit.kind, 'text'); assert.equal(exit.title, T.PAPER_EXIT_TITLE); assert.equal(exit.minutes, 3); assert.match(exit.body, /half-sheet or hosts the questions live/);
    assert.deepEqual(r.notes, [{ code: 'quizStepsOff', step: 'Exit ticket' }]);
    assert.ok(r.sets.exit, 'the exit set exists anyway (Host exit ticket live)');
    assert.equal(minutes(L.steps(r.lesson.id)), 45);
  } finally { config.quizSteps = true; }
  const r = T.materialise(ana, oak.id, 'csq-1b-1.4', { again: true });
  assert.equal(L.steps(r.lesson.id).at(-2).kind, 'quiz'); assert.deepEqual(r.notes, []);
});

test('a game that is not published becomes a text step "game not available yet" (never silently skipped); hosted-live warm-ups too', () => {
  q.run("UPDATE games SET status='draft' WHERE slug IN ('data-detective', 'quest-race')");
  try {
    assert.equal(T.publishedGame('data-detective'), null); assert.ok(T.publishedGame('robo-route'));
    const r = T.materialise(ana, oak.id, 'csq-1b-3.1');
    assert.ok(r.ok, JSON.stringify(r));
    const steps = L.steps(r.lesson.id);
    assert.equal(steps.length, T.getTemplate('csq-1b-3.1').steps.length, 'no step is skipped');
    const warm = steps[1], play = steps[2];
    assert.equal(warm.kind, 'text'); assert.equal(warm.title, 'Warm-up (live)'); assert.match(warm.body, /not available yet/);
    assert.equal(play.kind, 'text'); assert.equal(play.title, 'Play: Sort & Group'); assert.match(play.body, /Goal: /); assert.match(play.body, /not available yet/); assert.equal(play.game_id, null); assert.equal(play.options, '');
    assert.deepEqual(r.notes.map(n => [n.code, n.step, n.slug]), [['gameNotPublished', 'Warm-up (live)', 'quest-race'], ['gameNotPublished', 'Play: Sort & Group', 'data-detective']]);
    assert.equal(minutes(steps), 45);
  } finally { q.run("UPDATE games SET status='published' WHERE slug IN ('data-detective', 'quest-race')"); }
});

test('reset to the CS Quest version (P21): a fresh copy takes the old copy\'s classes, unit and dates; the old copy is unassigned and keeps its work', () => {
  const key = 'csq-1b-2.1';
  const old = T.materialise(ana, oak.id, key).lesson;
  const unit = L.createUnit(ana, cls.id, 'Bug Hunters').unit;
  const cl = L.assign(ana, cls.id, old.id, { unitId: unit.id, opensAt: '2026-03-02', dueAt: '2026-03-06' }).classLesson;
  const text = L.steps(old.id)[0];
  assert.ok(P.markDone(mia, cl.id, text.id).ok, 'a student worked in it');
  const other = S.createClass(ben, oak.id, { name: 'Ben 5D' }).class;
  assert.ok(L.assign(boss, other.id, old.id, {}).ok, "the school admin put Ana's copy in Ben's class, which Ana does not manage");
  const r = T.resetLesson(ana, old.id);
  assert.ok(r.ok, JSON.stringify(r));
  assert.notEqual(r.lesson.id, old.id); assert.equal(r.lesson.template_key, key); assert.equal(r.lesson.folder_id, old.folder_id, 'same folder');
  assert.equal(r.moved.length, 1); assert.equal(r.moved[0].classId, cls.id); assert.deepEqual(r.kept, [other.id]);
  const now = L.classLessons(cls.id).find(x => x.lesson_id === r.lesson.id);
  assert.ok(now, 'the fresh copy is in the class'); assert.equal(now.unit_id, unit.id); assert.equal(now.opens_at, day('2026-03-02')); assert.equal(now.due_at, day('2026-03-06'));
  assert.ok(!L.classLessons(cls.id).some(x => x.lesson_id === old.id), 'the old copy left the class');
  assert.ok(q.get('SELECT removed_at FROM class_lessons WHERE id=?', cl.id).removed_at, 'unassigned, not deleted');
  assert.ok(P.get(cl.id, text.id, mia.id), 'the student work stays with the removed row');
  assert.ok(L.getLesson(old.id), 'the old copy stays in the library');
  assert.equal(T.resetLesson(ben, old.id).code, 'notFound', 'not their lesson');
  const plain = L.createLesson(ana, oak.id, { title: 'Not from the catalogue' }).lesson;
  assert.equal(T.resetLesson(ana, plain.id).code, 'notFound', 'no template_key: nothing to reset to');
});

test('materialiseUnit / materialisePath: every key in order, missing files reported, refusals skipped', () => {
  const kim = S.createSchoolAccount(boss, oak.id, { rosterName: 'Kim Teacher', role: 'teacher' }).user;
  const u1 = T.materialiseUnit(kim, oak.id, 1, '2');
  assert.ok(u1.ok); assert.deepEqual(u1.lessons.map(x => x.key), ['csq-2-1.1', 'csq-2-1.2', 'csq-2-1.3', 'csq-2-1.4', 'csq-2-1.5']); assert.ok(u1.lessons.every(x => x.created)); assert.deepEqual(u1.skipped, []); assert.deepEqual(u1.missing, []);
  assert.deepEqual(L.lessonsIn(kim.id, oak.id, u1.lessons[0].lesson.folder_id).map(l => l.title), u1.lessons.map(x => x.lesson.title), 'in the unit folder, in order');
  const twice = T.materialiseUnit(kim, oak.id, 1, '2'); assert.ok(twice.lessons.every(x => !x.created), 'idempotent');
  assert.equal(T.materialiseUnit(kim, oak.id, 8, '2').code, 'notFound'); assert.equal(T.materialiseUnit(kim, oak.id, 1, 'x').code, 'notFound');
  const core = T.materialisePath(kim, oak.id, 'core10-no-builder', '1b');
  assert.ok(core.ok); assert.equal(core.lessons.length + core.missing.length, 10); assert.ok(core.lessons.some(x => x.key === 'csq-1b-6.1'));
  assert.equal(T.materialisePath(kim, oak.id, 'nope', '1b').code, 'notFound');
  const many = T.materialiseMany(kim, oak.id, ['csq-1b-1.1', 'csq-1b-9.9']);
  assert.equal(many.lessons.length, 1); assert.deepEqual(many.skipped, [{ key: 'csq-1b-9.9', code: 'notFound' }]);
});

test('coverage(): one row per CSTA id with lessons, steps, chapters, items and rubric lines; the practices table', () => {
  const m = T.coverage();
  assert.equal(m.ids.length, 44); assert.equal(m.lessons, present.length); assert.equal(m.complete, cat.missing.length === 0);
  const loops = m.ids.find(s => s.id === '1B-AP-10');
  assert.deepEqual(loops.primary, ['1.1', '1.2', '1.3']); assert.ok(loops.buildsToward.includes('7.2'));
  assert.ok(loops.activities.some(a => a.slug === 'robo-route' && a.chapter === 'loops' && a.chapterTitle === 'Loops' && a.levels === 7));
  assert.ok(loops.steps.some(s => s.lesson === '1.2' && s.step === 'In your own words' && s.kind === 'question'));
  assert.ok(loops.rubric.some(r => r.lesson === '1.2'));
  if (haveBanks) assert.ok(loops.items.exit >= 8 && loops.items.byLesson.includes('1.2'));
  assert.ok(loops.primaryOutsideUnit7);
  const ic20 = m.ids.find(s => s.id === '1B-IC-20');
  assert.ok(ic20.steps.some(s => s.lesson === '6.2' && s.kind === 'question'), 'CA-2: 1B-IC-20 on the question step of 6.2');
  assert.ok(!ic20.activities.some(a => a.lesson === '6.2'), 'and not on its game step');
  for (let p = 1; p <= 7; p++) assert.deepEqual(Object.keys(m.practices[p]).map(Number), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(m.practices[2][2].includes('1B-AP-16'), 'P2 in unit 2 from 1B-AP-16');
  for (const s of m.ids) for (const r of s.rubric) assert.ok(r.line && r.lesson);
});

test('routes: from-template (one lesson, a unit, a path, the one-body form), reset-template; staff only; refusals as JSON codes', async () => {
  const api = as(ana);
  let r = await api('/api/lessons/from-template/csq-1b-1.5', { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.ok, true); assert.equal(r.json.created, true); assert.equal(r.json.lesson.templateKey, 'csq-1b-1.5'); assert.match(r.json.lesson.url, /^\/teach\/lessons\//);
  assert.ok('warmup' in r.json.sets && 'exit' in r.json.sets && 'review' in r.json.sets);
  const id = r.json.lesson.id;
  r = await api('/api/lessons/from-template/csq-1b-1.5', { method: 'POST', body: {} }); assert.equal(r.json.created, false); assert.equal(r.json.lesson.id, id, 'idempotent through the API');
  r = await api('/api/lessons/from-template/csq-1b-1.5', { method: 'POST', body: { again: true } }); assert.equal(r.json.created, true); assert.notEqual(r.json.lesson.id, id);
  r = await api('/api/lessons/from-template/csq-1b-9.9', { method: 'POST', body: {} }); assert.equal(r.status, 404); assert.equal(r.json.code, 'notFound');
  r = await api('/api/lessons/from-template/unit/2', { method: 'POST', body: { band: '2' } });
  assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.lessons.map(x => x.key), ['csq-2-2.1', 'csq-2-2.2']); assert.ok(r.json.lessons.every(x => x.id && x.title && x.created)); assert.deepEqual(r.json.missing, []);
  r = await api('/api/lessons/from-template/unit/2', { method: 'POST', body: {} }); assert.equal(r.status, 400); assert.equal(r.json.code, 'band');
  r = await api('/api/lessons/from-template/path/cs-ed-week', { method: 'POST', body: { band: '1b' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.lessons.length + r.json.missing.length, 5);
  r = await api('/api/lessons/from-template/path/nope', { method: 'POST', body: { band: '1b' } }); assert.equal(r.status, 404);
  r = await api('/api/lessons/from-template', { method: 'POST', body: { key: 'csq-2-6.1' } }); assert.equal(r.status, 200); assert.equal(r.json.lesson.templateKey, 'csq-2-6.1');
  r = await api('/api/lessons/from-template', { method: 'POST', body: { keys: ['csq-2-6.2', 'csq-2-6.3'] } }); assert.equal(r.status, 200); assert.equal(r.json.lessons.length, 2);
  r = await api('/api/lessons/from-template', { method: 'POST', body: { unit: 6, band: '1B' } }); assert.equal(r.status, 200); assert.equal(r.json.lessons.length, 3);
  r = await api('/api/lessons/from-template', { method: 'POST', body: {} }); assert.equal(r.status, 400); assert.equal(r.json.code, 'badRequest');
  r = await api('/api/lessons/from-template', { method: 'POST', body: { schoolId: 'elsewhere', key: 'csq-2-6.1' } }); assert.equal(r.status, 200, 'an unknown schoolId falls back to the first staff school');
  r = await api(`/api/lessons/${id}/reset-template`, { method: 'POST', body: {} }); assert.equal(r.status, 200, r.text); assert.equal(r.json.old.id, id); assert.notEqual(r.json.lesson.id, id); assert.deepEqual(r.json.moved, []);
  // not staff: 404 everywhere; signed out: 401
  for (const who of [mia, outsider]) {
    assert.equal((await as(who)('/api/lessons/from-template/csq-1b-1.5', { method: 'POST', body: {} })).status, 404);
    assert.equal((await as(who)('/api/cs-quest/catalog')).status, 404);
  }
  assert.equal((await fetch(`${base}/api/cs-quest/catalog`)).status, 401);
});

test('routes: assign-unit with a cadence (P17): keys are materialised first, a class unit is made, dates per lesson; lessonIds and unitId forms; refusals', async () => {
  const api = as(ana);
  const c2 = S.createClass(ana, oak.id, { name: 'Ana 6C' }).class;
  let r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2', start: '2026-02-02', cadence: 'twice-weekly' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.ok, true);
  assert.equal(r.json.unit.name, 'Unit 1 · Think Like a Robot');
  assert.deepEqual(r.json.assigned.map(a => a.key), ['csq-2-1.1', 'csq-2-1.2', 'csq-2-1.3', 'csq-2-1.4', 'csq-2-1.5']);
  assert.deepEqual(r.json.assigned.map(a => [a.opensAt, a.dueAt]), [['2026-02-02', '2026-02-04'], ['2026-02-05', '2026-02-08'], ['2026-02-09', '2026-02-11'], ['2026-02-12', '2026-02-15'], ['2026-02-16', '2026-02-23']], 'Mon / Thu; due the day before the next opens; the last a week on');
  assert.deepEqual(r.json.materialised.map(m => m.key), ['csq-2-1.2', 'csq-2-1.3', 'csq-2-1.4', 'csq-2-1.5'], 'the four Ana did not have yet were materialised on the way (1.1 Pro she had)');
  const rows = L.classLessons(c2.id);
  assert.equal(rows.length, 5); assert.ok(rows.every(x => x.unit_id === r.json.unit.id)); assert.equal(rows[0].opens_at, day('2026-02-02'));
  // the same unit again: nothing new, everything alreadyAssigned, the same class unit reused
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2', start: '2026-03-02' } });
  assert.equal(r.status, 200); assert.deepEqual(r.json.skipped.map(s => s.code), ['alreadyAssigned', 'alreadyAssigned', 'alreadyAssigned', 'alreadyAssigned', 'alreadyAssigned']); assert.equal(L.unitsOf(c2.id).length, 1);
  // keys + a named unit + dueDays; lessonIds + an existing unitId
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { keys: ['csq-2-2.1', 'csq-2-2.2'], unitName: 'Bug Hunters', start: '2026-03-02', cadence: 'weekly', dueDays: 3 } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.unit.name, 'Bug Hunters'); assert.deepEqual(r.json.assigned.map(a => [a.key, a.opensAt, a.dueAt]), [['csq-2-2.1', '2026-03-02', '2026-03-05'], ['csq-2-2.2', '2026-03-09', '2026-03-12']]);
  const own = L.createLesson(ana, oak.id, { title: 'My own extra' }).lesson; L.addStep(ana, own.id, { kind: 'text', body: 'x' });
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { lessonIds: [own.id], unitId: r.json.unit.id, start: '2026-04-06', cadence: 'daily' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.assigned[0].lessonId, own.id); assert.equal(r.json.assigned[0].key, null);
  // a path, materialised on the way (Core 10 for 1B): the unit is named after the path
  const c3 = S.createClass(ana, oak.id, { name: 'Ana 4D' }).class;
  r = await api(`/api/classes/${c3.id}/assign-unit`, { method: 'POST', body: { path: 'core10-no-builder', band: '1b', start: '2026-09-07' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.unit.name, 'Core 10 (no Builder)'); assert.equal(r.json.assigned.length + r.json.missing.length, 10); assert.ok(r.json.materialised.some(m => m.key === 'csq-1b-2.2'), 'the one Core 10 lesson Ana did not have yet was materialised on the way');
  // refusals
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2', start: 'not a day' } }); assert.equal(r.status, 400); assert.equal(r.json.code, 'badDate');
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2', cadence: 'monthly' } }); assert.equal(r.status, 400); assert.equal(r.json.code, 'badCadence');
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1 } }); assert.equal(r.status, 400); assert.equal(r.json.code, 'band');
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 9, band: '2' } }); assert.equal(r.status, 404);
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: {} }); assert.equal(r.status, 400); assert.equal(r.json.code, 'badRequest');
  r = await api(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { keys: ['csq-1b-9.9'] } }); assert.equal(r.status, 404);
  const bensClass = S.createClass(ben, oak.id, { name: 'Ben 7E' }).class;
  r = await api(`/api/classes/${bensClass.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2' } }); assert.equal(r.status, 404, 'not her class');
  r = await as(mia)(`/api/classes/${c2.id}/assign-unit`, { method: 'POST', body: { unit: 1, band: '2' } }); assert.equal(r.status, 404);
});

test('routes: catalog, lessons/:key, coverage and builder-status JSON for the teacher pages', async () => {
  const api = as(ana);
  let r = await api('/api/cs-quest/catalog');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.program.slug, 'cs-quest'); assert.equal(r.json.units.length, 7); assert.equal(r.json.paths[0].id, 'core10-no-builder'); assert.equal(r.json.school.id, oak.id);
  assert.deepEqual(r.json.missing, cat.missing); assert.equal(r.json.flags.quizSteps, true); assert.equal(r.json.builder.state, 'resting');
  const l12 = r.json.units[0].lessons[1]; assert.equal(l12.n, '1.2');
  assert.equal(l12.bands['1B'].key, 'csq-1b-1.2'); assert.equal(l12.bands['1B'].questCode, '2 1 0 0'); assert.equal(l12.bands['1B'].status.inLibrary, true, 'Ana added it earlier'); assert.equal(l12.bands['2'].params, 'chapter=loops&band=2&lock=1');
  const l31 = r.json.units[2].lessons[0]; assert.equal(l31.bands['2'].file, !!T.getTemplate('csq-2-3.1')); if (!l31.bands['2'].file) assert.equal(l31.bands['2'].status, null);
  assert.ok(!JSON.stringify(r.json).match(/\$\s?\d/), 'no prices');
  r = await api('/api/cs-quest/lessons/csq-1b-1.2');
  assert.equal(r.status, 200); assert.equal(r.json.lesson.key, 'csq-1b-1.2'); assert.equal(r.json.setTitles.exit, 'CSQ 1.2 exit ticket (3-5)'); assert.equal(r.json.status.inLibrary, true); assert.equal(r.json.builder, undefined);
  r = await api('/api/cs-quest/lessons/csq-1b-7.2'); if (r.status === 200) assert.equal(r.json.builder.state, 'resting', 'unit 7 pages carry the Builder status');
  assert.equal((await api('/api/cs-quest/lessons/csq-1b-9.9')).status, 404);
  r = await api('/api/cs-quest/coverage'); assert.equal(r.status, 200); assert.equal(r.json.ids.length, 44); assert.ok(r.json.practices['7']);
  r = await api('/api/cs-quest/builder-status'); assert.equal(r.status, 200);
  assert.deepEqual([r.json.on, r.json.state, r.json.why, r.json.teamsPerPeriod, r.json.pools], [false, 'resting', 'noKey', 8, { free: false, paid: false }]);
  assert.equal((await as(mia)('/api/cs-quest/builder-status')).status, 404);
});
