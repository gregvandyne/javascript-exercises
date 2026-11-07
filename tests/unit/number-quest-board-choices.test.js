// Number Quest's Brain Board lesson boards: every choice a child sees is a real, plausible answer
// to a different number, never a second right answer, a negative, a filler or a padded number.
// (Course audit, fix round A2: Expanded form offered the parts in reverse order, which is still
// a correct expanded form; Digit value on a ones digit offered a filler 1 and a padded 39; Round
// it could ask to round 56 to the nearest hundred with -100 as a choice.)
// The real generator runs in a stub kit world over many seeds, as in number-quest-parity-repair.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BB = fs.readFileSync(path.join(ROOT, 'seed-games/brain-board.html'), 'utf8');
const BLOCK = BB.slice(BB.indexOf('var nqPads'), BB.indexOf('L.ready('));
const STEPS = ['1.1', '2.3', '5.1', '5.3', '6.1', '6.2', '6.3'];
const RUNS = 40;

function board(step, seed) {
  const mode = `nq-${step.replace('.', '-')}`;
  let clock = seed * 7919;
  const FakeDate = { now: () => clock++ };
  const ctx = vm.createContext({ BRB: { params: { mode, lock: 1 } }, window: { BRB: { params: { mode, lock: 1 } } },
    O: { rand: s => { let x = s >>> 0 || 1; const next = () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x80000000; return { int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) }; } },
    Date: FakeDate, Math, String, Number, Object, Array });
  vm.runInContext(`var NQ_STEP = 'explorer-${step}';\n${BLOCK.replace(/var NQ_STEP = [^\n]*\n/, '')}\n;globalThis.__nq = { items: nqBoardItems(), pads: nqPads };`, ctx);
  return ctx.__nq;
}
const num = s => Number(String(s).replace(/,/g, ''));
const sumOf = s => String(s).split(' + ').reduce((a, p) => a + num(p), 0);

test('every lesson board: 25 tiles, four distinct choices, no padded filler, nothing negative', () => {
  for (const step of STEPS) for (let r = 1; r <= RUNS; r++) {
    const { items, pads } = board(step, r);
    assert.equal(items.length, 25, `${step}: 25 tiles`);
    assert.equal(pads, 0, `${step} run ${r}: no choice was padded in`);
    for (const it of items) {
      assert.equal(it.choices.length, 4, `${step}: four choices (${it.q})`);
      assert.equal(new Set(it.choices).size, 4, `${step}: distinct choices (${it.q}: ${it.choices})`);
      assert.ok(it.choices[it.answer] != null, `${step}: the key exists (${it.q})`);
      for (const c of it.choices) assert.ok(!/(^|\s)[-−]\d/.test(String(c)), `${step}: no negative choice (${it.q}: ${c})`);
      // A numeric answer (with or without a unit) never has a distractor of the same value.
      const lead = c => { const m = /^(?:About |\$)?([\d,]+)(?: (?:cents|cm|centimeters|meters|grams|square \w+))?$/.exec(String(c)); return m ? num(m[1]) : null; };
      if (lead(it.choices[it.answer]) != null && it.choices.every(c => lead(c) != null)) {
        const vals = it.choices.map(lead);
        assert.equal(vals.filter(v => v === vals[it.answer]).length, 1, `${step}: one choice holds the right value (${it.q}: ${it.choices})`);
      }
    }
  }
});

test('1.1 Expanded form: no distractor adds up to the number (parts in another order are still right)', () => {
  for (let r = 1; r <= RUNS; r++) for (const it of board('1.1', r).items.filter(i => i.cat === 'Expanded form')) {
    const n = num(/Which shows ([\d,]+) in expanded form\?/.exec(it.q)[1]);
    assert.equal(sumOf(it.choices[it.answer]), n, `${it.q}: the key adds up to the number`);
    it.choices.forEach((c, i) => { if (i !== it.answer) assert.notEqual(sumOf(c), n, `${it.q}: "${c}" is a second right answer`); });
    // and the wrong orders are gone for good: no choice is a reordering of the key's parts
    const key = it.choices[it.answer].split(' + ').sort().join();
    it.choices.forEach((c, i) => { if (i !== it.answer) assert.notEqual(c.split(' + ').sort().join(), key, `${it.q}: "${c}" reorders the key`); });
  }
});

test('1.1 Digit value: every choice is the same digit in some place (9, 90, 900, 9,000), the key in its own', () => {
  for (let r = 1; r <= RUNS; r++) for (const it of board('1.1', r).items.filter(i => i.cat === 'Digit value')) {
    const m = /In ([\d,]+), what is the value of the (\d)\?/.exec(it.q), d = Number(m[2]), digits = m[1].replace(/,/g, '');
    assert.deepEqual(Array.from(it.choices, num).sort((a, b) => a - b), [d, d * 10, d * 100, d * 1000], it.q);
    assert.equal(num(it.choices[it.answer]), d * 10 ** (digits.length - 1 - digits.indexOf(m[2])), it.q);
  }
});

test('1.1 Round it: three-digit numbers that need rounding, the key right, every distractor a plausible rounding', () => {
  for (let r = 1; r <= RUNS; r++) for (const it of board('1.1', r).items.filter(i => i.cat === 'Round it')) {
    const m = /Round ([\d,]+) to the nearest (ten|hundred)\./.exec(it.q), n = num(m[1]), unit = m[2] === 'ten' ? 10 : 100;
    assert.ok(n >= 100 && n <= 999 && n % 10 !== 0, `${it.q}: a three-digit number that needs rounding`);
    assert.equal(num(it.choices[it.answer]), Math.round(n / unit) * unit, it.q);
    for (const c of it.choices) {
      assert.ok(num(c) >= 0 && num(c) % 10 === 0, `${it.q}: "${c}" is a rounded number`);
      assert.ok(Math.abs(num(c) - n) <= 2 * unit + 100, `${it.q}: "${c}" is near the number`);
    }
  }
});

test('5.1 teaches what it asks: no liters or milliliters on the Measures board', () => {
  for (let r = 1; r <= 10; r++) for (const it of board('5.1', r).items) {
    assert.ok(!/liter|milliliter/i.test(it.q + it.choices.join()), `${it.q}: liters are not taught in 5.1`);
  }
});
