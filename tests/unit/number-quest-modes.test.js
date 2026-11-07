// Number Quest lesson modes ask only what their slides teach (fix round A4): every Brain Board board and
// Quest Race race a Number Quest step opens draws from that step's allowed question kinds and nothing else,
// and the choices it offers read right (cent / cents, no 0 dimes, no 135 hours, no padded filler).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BB = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');
const QR = fs.readFileSync(path.join(ROOT, 'seed-games/quest-race.html'), 'utf8');
const BLOCK = BB.slice(BB.indexOf('var nqPads'), BB.indexOf('L.ready('));

function board(step, seed) {
  let clock = seed * 7919;
  const ctx = vm.createContext({ O: { rand: s => { let x = s >>> 0 || 1; const next = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000; return { int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) }; } },
    Date: { now: () => clock++ }, Math, String, Number, Object, Array, BRB: {}, window: {} });
  vm.runInContext(`var NQ_STEP = 'explorer-${step}';\n${BLOCK}\n;globalThis.__nq = nqBoardItems();`, ctx);
  return Array.from(ctx.__nq);
}
function race(name, seed) {
  const at = QR.indexOf(`function ${name}(rnd) {`), end = QR.indexOf('\n  }\n', at);
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const rnd = { int: (a, b) => a + Math.floor(next() * (b - a + 1)), shuffle: a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
  return new Function(`var nqPads = 0; ${QR.slice(at, end + 4)}; return function (r) { var items = ${name}(r); return { items: items, pads: nqPads }; };`)()(rnd);
}

// The columns each board may have: one per skill its deck teaches.
const COLUMNS = {
  '1.1': ['Digit value', 'Expanded form', 'Bigger number', 'Where it sits', 'Round it'],
  '2.3': ['Draw the story', 'Joining stories', 'Gap stories', 'Two steps', 'Estimate first'],
  '5.1': ['Centimeters', 'Kilograms', 'Count the units', 'Add the measure', 'Which is longer'],
  '5.3': ['Coin values', 'Make the price', 'Change back', 'Add the prices', 'Dollars and cents'],
  '6.1': ['Count the sides', 'Square corners', 'Quadrilateral?', 'Families', 'Turns'],
  '6.2': ['Fence it', 'Carpet it', 'Count the squares', 'Fence or carpet?', 'Same fence'],
  '6.3': ['Parallel or not', 'Fold it', 'Lines of symmetry', 'Grid addresses', 'Swap trap'],
};
// Words a board must never use because its slides never teach them.
const UNTAUGHT = {
  '5.1': /liter|milliliter/i,
  '6.1': /octagon|trapezoid|rhombus|parallelogram|exactly one square corner/i,
  '6.2': /missing side|one side is/i,
  '6.3': /\bray\b|turn|quadrilateral|rectangle|rhombus|family/i,
};

test('every Brain Board lesson board draws only from its own columns, and never from untaught words', () => {
  for (const [step, cols] of Object.entries(COLUMNS)) for (let seed = 1; seed <= 25; seed++) {
    const items = board(step, seed);
    assert.deepEqual([...new Set(items.map(i => i.cat))].sort(), [...cols].sort(), `${step}: its columns`);
    for (const it of items) {
      // neither the question nor any choice names what the slides never teach
      if (UNTAUGHT[step]) assert.doesNotMatch(it.q + ' | ' + it.choices.join(' | '), UNTAUGHT[step], `${step}: "${it.q}" [${it.choices.join(' | ')}]`);
    }
  }
});

test('6.1 Shape Hunt: only the five shapes the lesson draws, named with the right article', () => {
  for (let seed = 1; seed <= 10; seed++) for (const it of board('6.1', seed)) {
    assert.doesNotMatch(it.q + it.choices.join(), /octagon|trapezoid|rhombus|parallelogram/i, it.q);
    assert.doesNotMatch(it.q, /\ba [aeiou]/i, `"${it.q}": a before a vowel`);
  }
});

test('the odd choices are gone: no 0 for a rounding, cent for one cent, no 0 dimes, one "and", real conversion slips', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const it of board('1.1', seed).filter(i => i.cat === 'Round it')) assert.ok(!it.choices.includes('0'), `${it.q}: ${it.choices}`);
    for (const it of board('5.3', seed)) {
      for (const c of it.choices) assert.doesNotMatch(c, /^1 cents$/, `${it.q}: "${c}"`);
      if (it.cat === 'Make the price') {
        assert.doesNotMatch(it.q, /\b0 (quarters|dimes|nickels|pennies)/, it.q);
        assert.ok((it.q.match(/ and /g) || []).length <= 1, `${it.q}: one "and"`);
      }
    }
    for (const it of board('5.1', seed)) {
      const m = /A ribbon is (\d) meters long/.exec(it.q) || /How many grams are in (\d) kilograms/.exec(it.q);
      if (!m) continue;
      const a = +m[1], key = it.cat === 'Centimeters' ? 100 : 1000, slips = it.cat === 'Centimeters' ? [10, 1000, 1] : [100, 10, 1];
      assert.deepEqual(Array.from(it.choices, c => +c.replace(/,/g, '')).sort((x, y) => x - y), [a * key, ...slips.map(k => a * k)].sort((x, y) => x - y), `${it.q}: each wrong answer is a real conversion slip`);
    }
  }
});

test('Quest Race 5.2 hops forward only: no start time found backwards, no hours swap, no "135 hours"', () => {
  for (let seed = 1; seed <= 500; seed++) {
    const { items, pads } = race('nqTimetableItems', seed);
    assert.equal(items.length, 8);
    assert.equal(pads, 0, `seed ${seed}: nothing padded`);
    for (const it of items) {
      assert.match(it.q, /^(A bus leaves at|Practice runs from|A tour starts at|The timetable says Bus)/, it.q);
      assert.doesNotMatch(it.q + it.choices.join(), /did it start|hours/i, it.q);
    }
  }
});

test('Quest Race 1.3 patterns: four distinct real choices, never a padded 18', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const { items, pads } = race('nqPatternItems', seed);
    assert.equal(pads, 0, `seed ${seed}: no padded choice`);
    for (const it of items) assert.equal(new Set(it.choices).size, 4, it.q);
  }
});
