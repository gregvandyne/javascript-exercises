// The Big Divide's new math (docs/decisions.md "The Big Divide: remainders, decimals, addition and subtraction"): the
// sheets in tools/box-by-box/src/lib (pure, so Node loads the TypeScript as it is). Each sheet is checked by working it
// box by box with its own right digits, and against the numbers worked out another way.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));

/** A seeded random, so a failure can be run again. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const cellsOf = (sheet, kind) => sheet.cells.filter((c) => c.kind === kind);
const boxAt = (sheet, id) => sheet.cells.find((c) => c.kind === 'box' && c.id === id);

// ---------------------------------------------------------------- the bring-down arrows

test('long division: an arrow for each bring-down, from the digit straight down to its box, drawn once the box is filled', () => {
  const s = L.divideSheet({ dividend: 9452, divisor: 7 });
  const downs = s.steps.filter((st) => st.kind === 'bringDown');
  const arrows = cellsOf(s, 'arrow');
  assert.equal(downs.length, 3);
  assert.equal(arrows.length, 3, 'one arrow per bring-down');
  downs.forEach((st, i) => {
    const a = arrows[i];
    const b = boxAt(s, st.boxes[0]);
    assert.equal(a.after, st.boxes[0], 'drawn when its box is filled');
    assert.equal(a.row, 1, 'from the number being divided');
    assert.equal(a.toRow, b.row, 'down to the brought-down box');
    assert.equal(a.col, b.col, 'straight down: the same column');
    assert.ok(st.lit.includes(a.key), 'lit with its step');
    // nothing else sits in the arrow's column between the two
    const between = s.cells.filter((c) => (c.kind === 'box' || c.kind === 'given') && c.col === a.col && c.row > a.row && c.row < a.toRow);
    assert.deepEqual(between, [], `nothing under the arrow ${i + 1}`);
  });
  assert.equal(cellsOf(L.divideSheet({ dividend: 96, divisor: 32 }), 'arrow').length, 0, 'no bring-down, no arrow');
});
