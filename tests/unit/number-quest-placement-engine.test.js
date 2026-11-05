// Tally's Sorting Game (server/services/number-quest-placement.js, migration 0049; spec §4): the staircase
// rules exactly as specced — grade seed minus half a rung, correct up / wrong down half a rung, a rung
// confirmed on two correct at it, stop on ceiling+floor or budget — the locked crosswalk (ties to the
// lower unit), the plain-words Starting Point note with its caveat, soft landing, retakes that replace
// only on confirmation, the absolute grown-up override incl. disabling, and the 5-item test-out that
// never earns a stone. Engine serving is deterministic: a fixed seed replays the identical item sequence.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const P = await import('../../server/services/number-quest-placement.js');
const { generateItem, TEMPLATES } = await import('../../seed-lessons/number-quest/placement/generator.js');

let n = 0;
const newKid = () => auth.createUser({ username: `nqp${Date.now() % 1e6}x${++n}`, password: 'correct-horse-12', displayName: 'Kid' });
/** The full form of the item currently on a run's screen, regenerated the way the server grades it. */
function currentFull(runId, kid) {
  const row = q.get('SELECT current_item FROM nq_sort_runs WHERE id=? AND user_id=?', runId, kid.id);
  const c = JSON.parse(row.current_item);
  return { cur: c, full: generateItem(TEMPLATES.find(x => x.id === c.templateId), c.itemSeed) };
}
const answerFor = (full, wantCorrect) => (full.responseType === 'pick'
  ? { choice: wantCorrect ? full.answerIndex : (full.answerIndex + 1) % full.choices.length }
  : { value: wantCorrect ? String(full.answer) : String(Number(full.answer) + 7) });

test('migration 0049 made the placement tables', () => {
  const tables = q.all("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'nq_%' ORDER BY name").map(r => r.name);
  assert.ok(tables.includes('nq_placement') && tables.includes('nq_sort_runs') && tables.includes('nq_testout'));
});

test('seeding: grade minus half a rung, grown-up escape at grade 3, Launchpad form for K-2', () => {
  assert.equal(P.seedGrade('K'), 0);
  assert.equal(P.seedGrade(4), 4);
  assert.equal(P.seedGrade('grown-up'), 3);
  assert.equal(P.seedGrade(undefined), 3);
  assert.equal(P.seedRung(4), 3.5);
  assert.equal(P.seedRung(0), 0);
  assert.equal(P.seedRung(3), 2.5);
  assert.equal(P.formForGrade(2), 'launchpad');
  assert.equal(P.formForGrade(3), 'standard');
  const lp = P.createRunState({ grade: 1, seed: 'x' });
  assert.deepEqual(Object.keys(lp.strands), ['number', 'shape-measure', 'data-chance']); // algebra folds into number
  const st = P.createRunState({ grade: 5, seed: 'x' });
  assert.deepEqual(Object.keys(st.strands), ['number', 'algebra', 'shape-measure', 'data-chance']);
  assert.equal(st.strands.number.rung, 4.5);
});

test('the staircase: correct steps up half a rung, wrong steps down, two correct at a rung confirms it', () => {
  const state = P.createRunState({ grade: 4, seed: 'stairs' }); // every strand seeds at 3.5
  const s = state.strands.number;
  P.recordAnswer(state, 'number', true); assert.equal(s.rung, 4);
  P.recordAnswer(state, 'number', false); assert.equal(s.rung, 3.5);
  assert.equal(P.confirmedRung(s), null); // one correct at 3.5 is not a confirmation
  P.recordAnswer(state, 'number', true);
  assert.equal(P.confirmedRung(s), 3.5); // the second correct at 3.5 confirms it (not necessarily consecutive)
  // The staircase never leaves K.0–8.0.
  const top = P.createRunState({ grade: 8, seed: 't' });
  top.strands.number.rung = 8;
  P.recordAnswer(top, 'number', true);
  assert.equal(top.strands.number.rung, 8);
  const bottom = P.createRunState({ grade: 0, seed: 'b' });
  P.recordAnswer(bottom, 'number', false);
  assert.equal(bottom.strands.number.rung, 0);
});

test('stop rules: the budget caps a strand; a found ceiling + floor ends it sooner', () => {
  const state = P.createRunState({ grade: 4, seed: 'budget' });
  const s = state.strands['data-chance'];
  for (let i = 0; i < P.BUDGET.standard; i++) P.recordAnswer(state, 'data-chance', i % 2 === 0);
  assert.equal(s.items, P.BUDGET.standard);
  assert.equal(P.strandDone(s, 'standard'), true);
  // Confirmed 3.5, two misses at the rung above (4.0) and two below the seed: both ends found.
  const t = P.createRunState({ grade: 4, seed: 'cf' }).strands.number;
  t.correct = { '3.5': 2 }; t.misses = { '4': 2, '3': 2 }; t.items = 6;
  assert.equal(P.strandDone(t, 'standard'), true);
  // Only one end found: not done.
  const u = P.createRunState({ grade: 4, seed: 'cf2' }).strands.number;
  u.correct = { '3.5': 2 }; u.misses = { '4': 2 }; u.items = 4;
  assert.equal(P.strandDone(u, 'standard'), false);
});

test('deterministic serving: same seed, same items; strands alternate; no template repeats', () => {
  const play = () => {
    const state = P.createRunState({ grade: 4, seed: 'fixed-seed' });
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const cur = P.serveNext(state);
      if (!cur) break;
      ids.push(`${cur.strand}:${cur.templateId}`);
      P.recordAnswer(state, cur.strand, i % 2 === 0);
    }
    return ids;
  };
  const a = play();
  assert.deepEqual(a, play());
  const strands = a.map(x => x.split(':')[0]);
  for (let i = 1; i < strands.length; i++) assert.notEqual(strands[i], strands[i - 1]); // a tour, not four exams
  const templates = a.map(x => x.split(':')[1]);
  assert.equal(new Set(templates).size, templates.length);
  // Every third served item is a manipulation type when the rung offers one: check at least the rule's
  // shape — served items 3, 6, 9… are manipulation unless their pool had none (verified by the pool).
  a.forEach((entry, i) => {
    if ((i + 1) % 3 !== 0) return;
    const [strand, id] = entry.split(':');
    const t = TEMPLATES.find(x => x.id === id);
    if (TEMPLATES.some(x => x.strand === strand && x.rung === t.rung && P.MANIPULATION_TYPES.includes(x.responseType))) {
      assert.ok(P.MANIPULATION_TYPES.includes(t.responseType), `item ${i + 1} should be manipulation`);
    }
  });
});

test('grading through regenerated keys: pick by index, numeric by value', () => {
  const state = P.createRunState({ grade: 6, seed: 'grade-me' });
  let sawPick = false, sawNumeric = false;
  for (let i = 0; i < 10 && !(sawPick && sawNumeric); i++) {
    const cur = P.serveNext(state);
    if (!cur) break;
    const full = generateItem(TEMPLATES.find(x => x.id === cur.templateId), cur.itemSeed);
    if (full.responseType === 'pick') {
      sawPick = true;
      assert.equal(P.gradeServed(cur.templateId, cur.itemSeed, { choice: full.answerIndex }).correct, true);
      assert.equal(P.gradeServed(cur.templateId, cur.itemSeed, { choice: (full.answerIndex + 1) % full.choices.length }).correct, false);
      // The public item carries no key: no answer, no answerIndex, choices are values only.
      assert.ok(!('answer' in cur.item) && !('answerIndex' in cur.item));
      assert.ok(cur.item.choices.every(c => Object.keys(c).join() === 'value'));
    } else if (typeof full.answer === 'number') {
      sawNumeric = true;
      assert.equal(P.gradeServed(cur.templateId, cur.itemSeed, { value: String(full.answer) }).correct, true);
      assert.equal(P.gradeServed(cur.templateId, cur.itemSeed, { value: String(full.answer + 3) }).correct, false);
    }
    P.recordAnswer(state, cur.strand, true);
  }
  assert.ok(sawPick && sawNumeric);
});

test('the crosswalk: first unmet profile wins, near-misses resolve low, low rungs flag the Launchpad gap', () => {
  assert.equal(P.crosswalk({ number: 2.5, algebra: 2.5, 'shape-measure': 2.5, 'data-chance': 2.5 }).node, 'explorer-2.1');
  assert.equal(P.crosswalk({ number: 3.5, algebra: 3, 'shape-measure': 2.5, 'data-chance': 2.5 }).node, 'explorer-3.1');
  // Every profile met: the strands point PAST the built street. The start is Unit 4's door, the
  // furthest built workshop, with beyondBuilt set — never an unbuilt Unit 5 node (repair round 3).
  const past = P.crosswalk({ number: 3.5, algebra: 3.5, 'shape-measure': 3, 'data-chance': 3 });
  assert.equal(past.node, 'explorer-4.1'); assert.equal(past.beyondBuilt, true);
  // One strand half a rung short of Unit 4's profile: still Unit 4 (the lower unit), not beyond.
  const at4 = P.crosswalk({ number: 3.5, algebra: 3.5, 'shape-measure': 3, 'data-chance': 2.5 });
  assert.equal(at4.node, 'explorer-4.1'); assert.equal(at4.beyondBuilt, false);
  const low = P.crosswalk({ number: 2, algebra: 3.5, 'shape-measure': 3, 'data-chance': 3 });
  assert.equal(low.node, 'explorer-0.1'); assert.equal(low.launchpadGap, true);
});

test('the Starting Point note: plain words, the placed unit, and the caveat in the data', () => {
  const state = P.createRunState({ grade: 4, seed: 'note' });
  for (const k of Object.keys(state.strands)) { state.strands[k].correct = { '4': 2 }; state.strands[k].done = true; }
  state.strands['data-chance'].correct = { '2.5': 2 };
  const fin = P.finishRun(state);
  assert.equal(fin.startNode, 'explorer-4.1'); // data at 2.5 misses Unit 4's Data 3.0 profile
  assert.ok(fin.note.lines.some(l => l.startsWith('Number: solid to grade 4')));
  assert.ok(fin.note.lines.some(l => l.startsWith('Data & Chance: grade 2, growing') && l.includes('worth a look')));
  assert.equal(fin.note.caveat, P.CAVEAT);
  assert.match(fin.note.caveat, /not a grade/);
  assert.equal(fin.workshop, 'The Bakery'); // the child hears a place, never a rung
});

test('the beginning door places without a game; the override is absolute; disabling blocks a run', () => {
  const kid = newKid();
  const p = P.placeAtBeginning(kid, 5);
  assert.equal(p.startNode, 'explorer-1.1'); assert.equal(p.source, 'beginning');
  assert.equal(P.placeAtBeginning(kid, 1).startNode, 'explorer-0.1');
  const o = P.overrideStartNode(kid, 'explorer-3.1');
  assert.equal(o.startNode, 'explorer-3.1'); assert.equal(o.source, 'override');
  assert.equal(P.overrideStartNode(kid, 'explorer-9.1'), null);
  P.setPlacementDisabled(kid, true);
  assert.equal(P.startRun(kid, { grade: 4 }).disabled, true);
  P.setPlacementDisabled(kid, false);
  assert.ok(P.startRun(kid, { grade: 4 }).runId);
});

test('soft landing: two failed checks at the placed start offer the previous unit, quietly', () => {
  const kid = newKid();
  P.overrideStartNode(kid, 'explorer-3.1');
  let p = P.recordStartCheck(kid, 'explorer-3.1', false);
  assert.equal(p.softLandNode, null);
  p = P.recordStartCheck(kid, 'explorer-3.2', false);
  assert.equal(p.softLandNode, 'explorer-2.1');
  assert.equal(p.startNode, 'explorer-3.1'); // the placement itself never moved
  p = P.recordStartCheck(kid, 'explorer-3.1', true);
  assert.equal(p.softLandNode, null); assert.equal(p.startFails, 0);
  // A failed check in another unit counts for nothing.
  P.recordStartCheck(kid, 'explorer-3.1', false);
  p = P.recordStartCheck(kid, 'explorer-1.1', false);
  assert.equal(p.startFails, 1);
});

test('full runs: always-right lands at Unit 4 (past the built street, honestly flagged), always-wrong at the intro with the gap flagged', () => {
  const run = (kid, wantCorrect) => {
    const out = P.startRun(kid, { grade: 4 });
    let res = null, guard = 0;
    while (guard++ < 40) {
      const { full } = currentFull(out.runId, kid);
      const r = P.answerRun(kid, out.runId, answerFor(full, wantCorrect));
      if (r.result) { res = r.result; break; }
    }
    return res;
  };
  const hiKid = newKid();
  const hi = run(hiKid, true);
  assert.ok(hi); assert.equal(hi.startNode, 'explorer-4.1');
  // The strongest student lands on a real, named workshop, and both audiences hear the honest
  // version: the rest is still being built (repair round 3, blocker 2).
  assert.equal(hi.workshop, 'The Bakery');
  assert.equal(hi.beyondBuilt, true);
  assert.match(hi.beyondLine, /still being built/);
  assert.match(hi.note.placedUnit, /^Past Unit 4:/);
  assert.ok(!JSON.stringify(hi).includes('The next workshops on the street'), 'no fallback label anywhere');
  assert.ok(!JSON.stringify(hi).match(/score|percent/i)); // no score in anything the child is shown
  assert.equal(P.getPlacement(hiKid).startNode, 'explorer-4.1');
  const loKid = newKid();
  const lo = run(loKid, false);
  assert.ok(lo); assert.equal(lo.startNode, 'explorer-0.1'); assert.equal(lo.note.launchpadGap, true);
  assert.equal(P.getPlacement(loKid).startNode, 'explorer-0.1');
});

test('stopping early still places (partial note), and a retake replaces only on confirmation', () => {
  const kid = newKid();
  P.overrideStartNode(kid, 'explorer-2.1');
  const out = P.startRun(kid, { grade: 4 });
  const fin = P.finishEarly(kid, out.runId);
  assert.equal(fin.pendingRetake, true);
  assert.match(fin.note.partial, /stopped early/);
  assert.equal(P.getPlacement(kid).startNode, 'explorer-2.1'); // untouched until confirmed
  const applied = P.confirmRetake(kid, out.runId);
  assert.equal(applied.source, 'retake');
});

test('test-out: 5 items at unit depth, pass at 4, tested out — and never a stone', () => {
  const items = P.testOutItems(2, 'fixed');
  assert.equal(items.length, 5);
  assert.ok(items.every(i => i.item && !('answer' in i.item)));
  assert.deepEqual(P.testOutItems(9, 'fixed'), []); // only the locked units 1-4 have profiles
  const kid = newKid();
  const out = P.startRun(kid, { kind: 'testout', unit: 2 });
  let res = null, guard = 0;
  while (guard++ < 8) {
    const { full } = currentFull(out.runId, kid);
    const r = P.answerRun(kid, out.runId, answerFor(full, true));
    if (r.result) { res = r.result; break; }
  }
  assert.ok(res); assert.equal(res.passed, true); assert.equal(res.stoneEarned, false);
  assert.equal(res.marks.awarded, true); // Tally Marks for doing (progress layer), 20 for a passed test-out
  assert.deepEqual(P.testedOutUnits(kid), [2]);
  assert.equal(q.get('SELECT COUNT(*) n FROM course_progress WHERE user_id=?', kid.id).n, 0); // no step done, no stone
  // A failed test-out records nothing and can be retried another day.
  const kid2 = newKid();
  const out2 = P.startRun(kid2, { kind: 'testout', unit: 1 });
  let res2 = null; guard = 0;
  while (guard++ < 8) {
    const { full } = currentFull(out2.runId, kid2);
    const r = P.answerRun(kid2, out2.runId, answerFor(full, false));
    if (r.result) { res2 = r.result; break; }
  }
  assert.equal(res2.passed, false);
  assert.deepEqual(P.testedOutUnits(kid2), []);
});

test('repair round 3: no verbatim repeats inside one run, and hands-on items reach a standard-form run', () => {
  const drive = (seed, answerPattern) => {
    const state = P.createRunState({ grade: 4, seed });
    const sigs = [], manipStrands = [];
    let guard = 0;
    while (guard++ < 30) {
      const cur = P.serveNext(state);
      if (!cur) break;
      const full = generateItem(TEMPLATES.find(x => x.id === cur.templateId), cur.itemSeed);
      sigs.push(`${full.prompt} => ${full.answer}`);
      if (full.manip) manipStrands.push(cur.strand);
      P.recordAnswer(state, cur.strand, answerPattern(sigs.length));
      if (P.runFinished(state)) break;
    }
    return { sigs, manipStrands };
  };
  // Wandering runs (a fixed right/wrong rhythm, so strands climb and fall across the mid rungs):
  // the same prompt-and-answer pair must never be served twice, whatever the templates share.
  for (const seed of ['dup-1', 'dup-2', 'dup-3']) {
    const { sigs } = drive(seed, n => n % 3 !== 0);
    assert.ok(sigs.length >= 12, `${seed}: the run served a full tour (${sigs.length} items)`);
    assert.equal(new Set(sigs).size, sigs.length, `${seed}: no item repeats verbatim in one run`);
  }
  // An always-right standard run meets hands-on items regularly (every-third rule, mid-rung bank):
  // several of its items carry counters or a ten-frame build, in the strands the bank extended.
  const { sigs, manipStrands } = drive('hands-on', () => true);
  assert.equal(new Set(sigs).size, sigs.length, 'the always-right run has no repeats either');
  assert.ok(manipStrands.length >= 3, `hands-on items recur through the run (got ${manipStrands.length})`);
  assert.ok(manipStrands.some(s => s === 'number' || s === 'shape-measure'), 'hands-on items land in the extended strands');
});

test('repair round 3: a placement row saved with the old unbuilt start node reads as Unit 4\u2019s door', () => {
  const kid = newKid();
  q.run(`INSERT INTO nq_placement(user_id, course, grade, rungs, start_node, source, start_fails, soft_land_node, updated_at) VALUES (?,?,?,?,?,?,0,NULL,?)`,
    kid.id, 'number-quest', 4, '{}', 'explorer-5.1', 'sorting-game', Date.now());
  assert.equal(P.getPlacement(kid).startNode, 'explorer-4.1');
  // The "very beginning" door for grades 6-8 also lands on the furthest built workshop now.
  const g7 = newKid();
  assert.equal(P.placeAtBeginning(g7, 7).startNode, 'explorer-4.1');
  // And no route can name an unbuilt start node any more: the override list is built workshops only.
  assert.ok(P.START_NODES.every(n => n.built), 'every nameable start node is a built workshop');
  assert.ok(!P.START_NODES.some(n => n.node === 'explorer-5.1'));
  assert.equal(P.nodeInfo('explorer-4.1').workshop, 'The Bakery');
});
