// Number Quest Phase 1 surfaces (the Duolingo-lite UI + the teacher map): the course registered on the
// platform machinery with its single Explorer band, the path home rendering the street (nodes, lap rings,
// Tally Marks, the daily goal, greyed future units), and the teacher map publishing the locked CCSS-M
// statements for Units 1-4 with primary / also / builds-toward kept separate. The in-lesson moment wiring
// itself rides the generic step APIs (routes/courses.js) and is covered end to end by the shape asserted
// here: a passed check and a finished unit award through the progress service the path reads back.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const C = await import('../../server/services/courses.js');
const NQ = await import('../../server/services/number-quest-progress.js');
const auth = await import('../../server/auth.js');
const { pathPage, tallyBundles } = await import('../../server/views/number-quest-path.js');
const { mapTable, mapAndNotes } = await import('../../server/views/number-quest-teacher.js');
const { raw } = await import('../../server/views/html.js');
const { current } = await import('../../server/i18n/index.js');

const course = C.getCourse('number-quest');
let n = 0;
const newKid = () => auth.createUser({ username: `nqp${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });

test('the course is registered: one Explorer band, 13 steps, no deck problems, other courses untouched', () => {
  assert.ok(course);
  assert.equal(course.teacherPath, '/teachers/number-quest');
  assert.deepEqual(C.bandsFor(course), ['explorer']);
  assert.deepEqual(C.bandsFor(C.getCourse('cs-quest')), ['1b', '2']);
  const steps = C.steps(course, 'explorer');
  assert.equal(steps.length, 13);
  assert.equal(steps[0].key, 'explorer-0.1');
  assert.equal(steps.at(-1).key, 'explorer-4.3');
  assert.deepEqual(C.deckProblems('explorer', 'number-quest'), []);
  assert.equal(C.getStep(course, 'explorer-4.3').game.slug, 'fraction-factory');
  assert.equal(C.getStep(course, '2-4.3'), null, 'no Pro band exists yet');
  // Cyber Defenders was completed by Phase 2 on main (Units 5-6 + finale): 20 steps per band, not the 13 of its Phase 1.
  assert.equal(C.steps(C.getCourse('cyber-defenders'), '1b').length, 20);
  // Band choice is per course: '2' is refused for Number Quest, 'explorer' for CS Quest.
  const kid = newKid();
  assert.equal(C.setBand(kid, course, '2'), false);
  assert.equal(C.setBand(kid, course, 'explorer'), true);
  assert.equal(C.getBand(kid, course), 'explorer');
});

test('the catalogue carries the locked map: 31 statements, every cited code locked, practices named', () => {
  const cat = C.numberQuestCatalogue();
  assert.equal(cat.units.length, 5);
  assert.equal(Object.keys(cat.registry.explorerCodes.codes).length, 31);
  const locked = new Set(Object.keys(cat.registry.explorerCodes.codes));
  const clusters = new Set(Object.values(cat.registry.clusters).flatMap(g => Object.keys(g)));
  for (const u of cat.units) for (const s of u.steps) {
    const st = s.standards.explorer;
    for (const code of [...st.primary, ...st.also]) assert.ok(locked.has(code), `${s.n} cites unlocked ${code}`);
    // Builds toward may also name a whole cluster (3.1's 3.MD.C seed for area): preparation at cluster
    // level, labelled as such in the step's own note — never a statement the course does not teach.
    for (const code of st.buildsToward) assert.ok(locked.has(code) || clusters.has(code), `${s.n} builds toward unknown ${code}`);
    assert.ok(cat.registry.frameworks.practices.codes[s.mp], `${s.n} names a real practice`);
  }
  assert.deepEqual(cat.tier.stones, ['Counting Stone', 'Joining Stone', 'Grouping Stone', 'Sharing Stone']);
});

test('the teacher map table separates primary, also covers and builds toward, with statements on the chips', () => {
  const req = { t: current().t };
  const html = String(mapTable(req, C.numberQuestCatalogue()));
  assert.match(html, /Primary \(CCSS-M\)/);
  assert.match(html, /Also covers/);
  assert.match(html, /Builds toward/);
  assert.match(html, /4\.NBT\.A\.1/);
  assert.match(html, /title="[^"]*digit in one place represents ten times/i, 'a chip carries its statement');
  assert.match(html, /MP3/, 'the practice spotlight shows');
  assert.match(html, /Construct viable arguments/, 'with its plain name');
  assert.match(html, /The Bakery/, 'unit header rows group the steps');
});

test('the notes render unit titles escaped exactly once', () => {
  const req = { t: current().t };
  const el = (t, tag, key, vars = {}, attrs = '') => raw(`<${tag}${attrs}>${t(key, vars)}</${tag}>`);
  const html = String(mapAndNotes(req, C.numberQuestCatalogue(), el));
  assert.match(html, /Joining &amp; Splitting/);
  assert.doesNotMatch(html, /&amp;amp;/);
  assert.match(html, /Phase 0 standards lock/, 'the lock note prints with the map');
});

test('tally bundles group marks in fives, the five-bar gate drawn across', () => {
  assert.match(String(tallyBundles(0)), /No marks yet/);
  const thirteen = String(tallyBundles(13));
  assert.equal((thirteen.match(/nqp-t5/g) || []).length, 2, 'two full bundles in 13');
  assert.match(thirteen, /13 Tally Marks/);
  assert.match(String(tallyBundles(1)), /1 Tally Mark</);
});

test('the path home renders the street: HUD, nodes, lap words, stones and the greyed future', () => {
  const kid = newKid();
  C.setBand(kid, course, 'explorer');
  // Walk the intro and Unit 1 the win-gated way, earning what the step APIs award (check, mission, lap 1).
  const finish = key => {
    const step = C.getStep(course, key);
    C.markRead(kid, course, step);
    C.recordCheck(kid, course, step, { score: 3, passed: true });
    NQ.awardCheckPassed(kid, course, key);
    if (step.game) { C.markPlayed(kid, course, step); C.markCompleted(kid, course, step); NQ.awardMissionCompleted(kid, course, key); }
  };
  ['explorer-0.1', 'explorer-1.1', 'explorer-1.2', 'explorer-1.3'].forEach(finish);
  NQ.completeLap(kid, course, 'explorer', 1, 1);
  const ov = C.overview(kid, course, 'explorer');
  const html = String(pathPage({ course, ov, units: C.numberQuestCatalogue().units,
    marks: NQ.totalMarks(kid, course), daily: NQ.dailyStatus(kid, course),
    laps: Object.fromEntries(NQ.lapsForTier(kid, course, 'explorer').map(l => [l.unit, l])),
    placement: null, testedOut: [], canPick: true, bandSet: true, hasProgress: true }));
  assert.match(html, /130 Tally Marks/, 'checks 40 + missions 60 + lap 30');
  assert.match(html, /<span class="nqp-t5">/, 'tally bundles are real markup, never escaped text');
  assert.match(html, /Joining &amp; Splitting/, 'titles escape exactly once');
  assert.doesNotMatch(html, /&amp;amp;/, 'no double escaping anywhere on the street');
  assert.match(html, /Counting Stone planted/);
  assert.match(html, /Lap 1 done · Laps 2 and 3 are being built/, 'lap state in words, honest about the unbuilt laps');
  assert.match(html, /You are here/, 'the next open step is marked');
  assert.match(html, /href="\/courses\/number-quest\/explorer-2\.1"/, 'the next step is a door');
  assert.match(html, /Unit 5/, 'future units are on the street');
  assert.match(html, /Still being built/);
  assert.match(html, /Vault of Measures/);
  assert.match(html, /Today's goal/);
  assert.doesNotMatch(html, /🔒<\/span>\s*<span class="nqp-node-t">Big numbers/, 'a done step never shows as locked');
});

test('a fresh student gets the level picker and the Sorting Game invitation, and no false progress', () => {
  const kid = newKid();
  const ov = C.overview(kid, course, 'explorer');
  const html = String(pathPage({ course, ov, units: C.numberQuestCatalogue().units,
    marks: 0, daily: NQ.dailyStatus(kid, course), laps: {}, placement: null, testedOut: [],
    canPick: true, bandSet: false, hasProgress: false }));
  assert.match(html, /id="band-explorer"/);
  assert.match(html, /Sorting Game/);
  assert.match(html, /No marks yet/);
});
