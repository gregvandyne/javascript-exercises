// Manipulatives tasks you can practice (docs/manip-practice-tasks.md; docs/decisions.md "Manipulatives: tasks you can
// practice and assign"). For EVERY practice task of every tool (a converted tool's file in public/js/manip-tasks/), 50
// seeds: each variation has the right shape (prompt, setup, answer, 2 or 3 hints, explanation, solution), is the same
// for the same seed, the generator's own solution passes the checker (also after a trip through JSON, as the server gets
// it), a wrong answer fails (the starting board, a wrong number, the other choice), and a set never repeats a prompt.
// Phase 2: converting a tool adds it to CONVERTED below; nothing else here changes.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS, TOOL_TASKS, practiceTasks, variation, variations, check, taskOf, isPractice } from '../../public/js/manip-tasks.js';
import { shapeProblems, boxMatches, expandedMatches, checkWork, sigOf } from '../../public/js/manip-task-kit.js';

/** Tools whose every task is practice. */
const CONVERTED = ['rekenreks', 'base-ten-blocks', 'fraction-circles', 'fraction-tiles', 'bar-models', 'clock', 'pattern-blocks', 'geoboard', 'algebra-tiles',
  'xy-coordinate-board', 'two-color-counters', 'linking-cubes', 'color-tiles', 'hundred-board',
  'place-value-disks', 'number-lines', 'number-rods', 'money'];
const SEEDS = 50;
const json = x => JSON.parse(JSON.stringify(x));
/** A wrong typed answer for a box: the key plus one (numbers), else a word. */
const wrongBox = box => { const k = String(box.key).replace(/,/g, ''); return /^\d+(\.\d+)?$/.test(k) ? String(Number(k) + 1) : 'nope'; };

test('every one of the 300 tasks keeps its title, code, grade and notes, with a stable unique id', () => {
  const all = Object.entries(TASKS).flatMap(([slug, l]) => l.map(t => ({ slug, t })));
  assert.equal(all.length, 300);
  assert.equal(Object.keys(TASKS).length, 18);
  const ids = new Set();
  for (const { slug, t } of all) {
    for (const k of ['key', 'title', 'prompt', 'notes', 'ccss', 'grade']) assert.ok(typeof t[k] === 'string' && t[k], `${slug} ${t.title}: ${k}`);
    assert.match(t.key, /^[a-z0-9-]{3,40}$/);
    const id = `${slug}/${t.key}`; assert.ok(!ids.has(id), id); ids.add(id);
    assert.equal(taskOf(id).task, t);
    assert.ok(!/\u2014/.test(`${t.title} ${t.prompt} ${t.notes}`), `${id}: no em dash`);
  }
});

test('converted tools: every task is practice', () => {
  for (const slug of CONVERTED) for (const t of TASKS[slug]) assert.ok(isPractice(t), `${slug}/${t.key} has make()`);
  assert.deepEqual([...new Set(practiceTasks().map(x => x.slug))].sort(), [...CONVERTED].sort());
});

for (const { slug, task, id } of practiceTasks()) {
  test(`${id}: ${SEEDS} seeds are valid, solvable, checkable and distinct`, () => {
    const prompts = new Set();
    for (let s = 1; s <= SEEDS; s++) {
      const v = variation(id, s);
      assert.deepEqual(shapeProblems(v), [], `${id} seed ${s}: ${JSON.stringify(shapeProblems(v))}`);
      assert.equal(variation(id, s).prompt, v.prompt, 'the same seed gives the same variation');
      prompts.add(sigOf(v));
      // the generator's own answer is right, also as JSON (what the server gets)
      const sol = check(v, v.solution), solJ = check(json(v), json(v.solution));
      assert.ok(sol.correct, `${id} seed ${s}: its solution passes (${sol.feedback}) ${v.prompt}`);
      assert.ok(solJ.correct, `${id} seed ${s}: its solution passes after JSON`);
      // wrong answers fail, each with a calm line to look at
      const a = v.answer;
      if (a.board) {
        const r = check(v, { ...v.solution, board: v.setup });
        assert.equal(r.correct, false, `${id} seed ${s}: the starting board is not already the answer`);
        assert.equal(r.parts.board, false);
        assert.ok(r.feedback.length > 5);
      }
      if (a.box) {
        const r = check(v, { ...v.solution, box: wrongBox(a.box) });
        assert.equal(r.correct, false, `${id} seed ${s}: a wrong number fails`);
        assert.ok(r.feedback.length > 5);
        assert.equal(check(v, { ...v.solution, box: '' }).feedback, 'Type your answer in the box.');
        // typed with spaces (and commas for big numbers) still counts
        assert.ok(boxMatches(a.box, `  ${v.solution.box}  `), `${id}: spaces around the answer`);
      }
      if (a.choice) {
        const other = (a.choice.correct + 1) % a.choice.options.length;
        assert.equal(check(v, { ...v.solution, choice: other }).correct, false, `${id} seed ${s}: the other choice fails`);
        assert.equal(check(v, { ...v.solution, choice: null }).feedback, 'Pick an answer.');
      }
      // hints in Oomba's calm voice: plain words, no em dash, 2 or 3
      assert.ok(v.hints.length >= 2 && v.hints.length <= 3);
      assert.ok(v.hints.every(h => !/[!]{2}|\u2014/.test(h)));
      if (task.grade === 'K' || task.grade === '1') assert.ok(v.prompt.length <= 260, `${id}: a short prompt for grade ${task.grade}`);
    }
    assert.ok(prompts.size >= 20, `${id}: at least 20 distinct variations in ${SEEDS} seeds (${prompts.size})`);
    // a set never repeats a prompt
    const set = variations(id, 20, 7);
    assert.equal(set.length, 20);
    assert.equal(new Set(set.map(sigOf)).size, 20);
    assert.ok(TOOL_TASKS[slug].conds);
  });
}

test('expanded form: any order, commas and spaces, zero terms optional', () => {
  assert.ok(expandedMatches(2048, '2000 + 40 + 8'));
  assert.ok(expandedMatches(2048, '2,000+8+40'));
  assert.ok(expandedMatches(2048, '2000 + 0 + 40 + 8'));
  assert.ok(!expandedMatches(2048, '2048'));
  assert.ok(!expandedMatches(2048, '2000 + 48'));
  assert.ok(!expandedMatches(2048, '200 + 40 + 8'));
});

test('tolerant input: numbers with commas, decimals with or without a leading zero, a missing box or choice', () => {
  assert.ok(boxMatches({ key: '1139' }, '1,139'));
  assert.ok(boxMatches({ key: '2.55' }, '2.550'));
  assert.ok(boxMatches({ key: '0.5' }, '1/2'));
  assert.ok(boxMatches({ key: '0.85' }, '.85'));
  assert.ok(!boxMatches({ key: '7' }, ''));
  const v = { answer: { box: { key: '7' }, choice: { options: ['a', 'b'], correct: 1 } } };
  assert.deepEqual(checkWork({ conds: {} }, v, { box: '7', choice: 1 }).correct, true);
  const r = checkWork({ conds: {} }, v, { box: '7', choice: 0 });
  assert.equal(r.correct, false); assert.equal(r.partial, true);
});
