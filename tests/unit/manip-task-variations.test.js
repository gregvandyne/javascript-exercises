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
const LINT_SEEDS = 200;
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

// Titles show on desk cards, the player header and lists, for every variation: a title names the skill, never a number
// that changes with the seed ("Build 1,139" asking for 1,896). A number in a title is in every variation's prompt (or,
// for "1 or 10 more or less", one of them is); "a 4-digit number" and "within 20" name a size, not a number.
test('titles: any number a practice title names is in every variation it gives', () => {
  const bad = [];
  for (const { id, task } of practiceTasks()) {
    const t = task.title.replace(/\d-digit/g, '').replace(/within \d+/g, '');
    const nums = t.match(/\d[\d,.]*(?:\/\d+)?/g);
    if (!nums) continue;
    for (let s = 1; s <= SEEDS; s++) {
      const p = variation(id, s).prompt, has = nums.map(n => p.includes(n.replace(/[.,]$/, '')));
      if (/ or /.test(t) ? !has.some(Boolean) : !has.every(Boolean)) { bad.push(`${id} "${task.title}" seed ${s}: ${p}`); break; }
    }
  }
  assert.deepEqual(bad, []);
});

// Wording lint: a count of 1 never comes before a plural noun ("1 beads", "1 red cubes", "1 zero pairs"), and no
// line says the same thing twice ("30 minutes, which is 30 minutes"). Over 200 seeds of every practice task, every
// text a student reads: the prompt, the hints, the explanation, the box's label and say, the choices and the board's say.
const PLURALS = ['beads', 'cubes', 'tiles', 'disks', 'units', 'rows', 'columns', 'fives', 'tens', 'ones', 'hundreds', 'thousands',
  'tenths', 'hundredths', 'thousandths', 'flats', 'rods', 'pairs', 'squares', 'minutes', 'hours', 'coins', 'pieces', 'blocks',
  'counters', 'groups', 'jumps', 'points', 'sides', 'pegs', 'parts', 'circles', 'bars', 'cells', 'steps', 'ticks', 'degrees',
  'slices', 'triangles', 'hexagons', 'trapezoids', 'rhombuses', 'parallelograms', 'corners', 'chances', 'bills', 'dollars',
  'cents', 'pennies', 'nickels', 'dimes', 'quarters', 'sticks', 'trains', 'cards', 'pens', 'stickers', 'books', 'cookies',
  'grapes', 'crayons', 'apples', 'marbles', 'shells', 'balloons', 'stars', 'ladybugs', 'frogs', 'ducks', 'buttons',
  'kites', 'ways', 'shapes', 'cakes', 'pizzas', 'tortillas', 'sandwiches', 'ribbons', 'whole numbers', 'lines'];
// up to two words between the 1 and the noun: a color, "unit", "x", "zero", "square", "more", "$10", "half", "narrow"...
const ONE_PLURAL = new RegExp(`(?<![\\d$.,/−-])\\b1 (?:(?!(?:and|or|to|of|by|than|in|on|at|from|is|are|for|with|then|as|so|each|the|a|an)\\b)(?:\\$\\d+|[a-z²]+) ){0,2}?(?:${PLURALS.join('|')})\\b`);
const THERE_ARE_1 = /\bthere are 1 [a-z]/i;
const TAUTOLOGY = /(?<![\w.$:¢])([\w.:¢$]+(?: [\w.:¢$]+){0,3}),? which is \1(?![\w:¢]|\.\d)/;
/** Every text of a variation a student reads, as [where, text]. */
export function textsOf(v) {
  const a = v.answer || {}, out = [['prompt', v.prompt], ...(v.hints || []).map((h, i) => [`hint ${i + 1}`, h]), ['explain', v.explain]];
  if (a.box) out.push(['box label', a.box.label], ['box say', a.box.say]);
  if (a.choice) { (a.choice.options || []).forEach((o, i) => out.push([`choice ${i + 1}`, typeof o === 'string' ? o : (o && (o.label || o.text)) || ''])); out.push(['choice say', a.choice.say]); }
  for (const c of a.board || []) out.push(['board say', c && c.say]);
  return out.filter(([, t]) => typeof t === 'string' && t);
}
test('wording: no "1 beads" and no "X, which is X" in any practice task (200 seeds each)', () => {
  const bad = new Map(); // one line for each task and place: the first seed that slips
  for (const { id } of practiceTasks()) for (let s = 1; s <= LINT_SEEDS; s++) {
    for (const [where, t] of textsOf(variation(id, s))) {
      const m = t.match(ONE_PLURAL) || t.match(THERE_ARE_1) || t.match(TAUTOLOGY);
      if (m && !bad.has(`${id} ${where}`)) bad.set(`${id} ${where}`, `${id} seed ${s} ${where}: "${m[0]}" in "${t}"`);
    }
  }
  assert.deepEqual([...bad.values()], []);
});
test('wording lint catches the slips it is for', () => {
  assert.match('There are 1 leaves.', THERE_ARE_1);
  assert.doesNotMatch('There are 1 + 5 = 6 equal parts.', THERE_ARE_1);
  for (const t of ['There are 1 marbles.', 'Make 1 zero pairs.', 'build 4 rows of 1 blue tiles', '1 fives make 5 minutes', 'a 1 by 1 corner of 1 unit tiles', '3 tens and 1 ones'])
    assert.match(t, ONE_PLURAL, t);
  for (const t of ['1 bead', '11 beads', '$1 bills', '0.1 disks', '1/2 pieces', '21 cubes', 'is 1 more than 3', '1 less than 40', '10 groups of 1 make 10', 'sides 1 and 3 units long', '1 x² tile and 2 x tiles', 'taking away 1 yellow leaves 1 more red'])
    assert.doesNotMatch(t, ONE_PLURAL, t);
  assert.match('It is 30 minutes, which is 30 minutes.', TAUTOLOGY);
  assert.doesNotMatch('$4.10, which is 10 cents', TAUTOLOGY);
  assert.doesNotMatch('1 hour 30 minutes, which is 90 minutes', TAUTOLOGY);
});

// Checks that read the arrangement, not just the counts.
test('pattern blocks "Grow the pattern": the flower passes, a heap of the right blocks does not', () => {
  const id = 'pattern-blocks/grow-the-pattern';
  for (let s = 1; s <= SEEDS; s++) {
    const v = variation(id, s), sol = v.solution.board, mineOf = b => b.pieces.filter(p => !p.locked), hub = sol.pieces.find(p => p.kind === 'hex');
    const moved = f => { const b = json(sol); mineOf(b).forEach(f); return check(v, { ...v.solution, board: b }); };
    assert.ok(check(v, v.solution).correct, `${id} seed ${s}: the flower passes`);
    // placed by hand: a few pixels off everywhere still counts
    assert.ok(moved((p, i) => { p.x += [3, -2, 0, 2][i % 4]; p.y += [-2, 3, 2, 0][i % 4]; }).correct, `${id} seed ${s}: a hand-placed flower passes`);
    // the right counts in a row, away from the hexagon
    let r = moved((p, i) => { p.x = 100 + 110 * i; p.y = 300; p.rot = 0; });
    assert.equal(r.correct, false, `${id} seed ${s}: a row of the blocks fails`); assert.match(r.feedback, /around the hexagon/);
    // a pile against one side of the hexagon
    assert.equal(moved((p, i) => { p.x = hub.x + 100 + (i % 3) * 30; p.y = hub.y - 20 + Math.floor(i / 3) * 30; p.rot = 0; }).correct, false, `${id} seed ${s}: a pile beside the hexagon fails`);
    // all 12 stacked on one spot touching the hexagon
    assert.equal(moved(p => { p.x = hub.x + hub.w; p.y = hub.y; }).correct, false, `${id} seed ${s}: a stack fails`);
    // the inner ring right, the outer ring pulled away from it
    const inner = new Set(mineOf(sol).slice(0, 6).map(p => p.id));
    assert.equal(moved(p => { if (!inner.has(p.id)) { const dx = p.x + p.w / 2 - hub.x - hub.w / 2, dy = p.y + p.h / 2 - hub.y - hub.h / 2, k = 60 / Math.hypot(dx, dy); p.x += dx * k; p.y += dy * k; } }).correct, false, `${id} seed ${s}: an outer ring not touching the first fails`);
  }
});
test('geoboard "Squares of many sizes": the area asked is of the smallest, the middle or the biggest square', () => {
  const asked = new Set();
  for (let s = 1; s <= SEEDS; s++) asked.add(variation('geoboard/squares-of-many-sizes', s).prompt.match(/area of the (\w+) one/)[1]);
  assert.deepEqual([...asked].sort(), ['biggest', 'middle', 'smallest']);
});

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
