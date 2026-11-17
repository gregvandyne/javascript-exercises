// Fraction Factory, the owner's "I still don't see the difference between pro and explorer": the two bands share no
// orders. Explorer keeps Unit 4 (First Folds, First Cuts, Re-Slice, Recipe Math); Pro has its own four chapters, built
// with the same cut-and-tray hands: Common Cuts (adding unlike parts), Take Away (subtracting them), Scale Up
// (multiplying) and Share Out (how many servings of a unit fraction fit). Pro's slicer adds tenths and twelfths.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/fraction-factory.html'), 'utf8');
const ctx = vm.createContext({});
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const E = ctx.FractionFactory, { LEVELS, CHAPTERS, THEN } = ctx.FractionFactoryLevels;
const lv = id => LEVELS.find(l => l.id === id);
const chaptersOf = band => [...new Set(LEVELS.filter(l => l.bands.includes(band)).map(l => l.ch))];

test('Explorer and Pro play different chapters and never share an order', () => {
  assert.deepEqual(chaptersOf('1b'), ['folds', 'first-cuts', 're-slice', 'recipe']);
  assert.deepEqual(chaptersOf('2'), ['common-cuts', 'take-away', 'scale-up', 'share-out']);
  const ex = new Set(LEVELS.filter(l => l.bands.includes('1b')).map(l => l.id));
  for (const l of LEVELS.filter(l => l.bands.includes('2'))) assert.ok(!ex.has(l.id), `${l.id} is Pro only`);
  assert.deepEqual(Object.keys(THEN['2']), ['common-cuts', 'take-away', 'scale-up']);
  for (const ch of chaptersOf('2')) assert.ok(CHAPTERS.find(c => c.id === ch), ch);
  // Pro's slicer has tenths and twelfths; Explorer's is unchanged
  for (const l of LEVELS.filter(l => l.bands.includes('2'))) assert.deepEqual([...l.cuts], [2, 3, 4, 6, 8, 10, 12]);
  assert.deepEqual([...E.CUTS], [2, 3, 4, 6, 8]);
  for (const l of LEVELS.filter(l => l.bands.includes('1b'))) assert.equal(l.cuts, undefined);
  assert.equal(new E.Run(lv('rc-1'), 1).act({ t: 'cut', n: 12 }).ok, false, 'no twelfths in Explorer');
  assert.ok(new E.Run(lv('cc-2'), 1).act({ t: 'cut', n: 12 }).ok, 'twelfths in Pro');
});

test('the Pro goals are the right amounts', () => {
  const g = id => E.goalOf(lv(id));
  assert.deepEqual([...g('cc-2').value], [7, 12]); assert.equal(g('cc-2').take, 7);
  assert.deepEqual([...g('cc-6').value], [17, 12]); assert.equal(g('cc-6').wholes, 2);
  assert.deepEqual([...g('ta-6').value], [11, 12]); assert.equal(g('ta-6').wholes, 1);
  assert.deepEqual([...g('su-2').value], [8, 3]); assert.equal(g('su-2').wholes, 3);
  assert.deepEqual([...g('su-4').value], [1, 2]); assert.equal(g('su-4').take, 6);
  assert.equal(g('so-2').servings, 6); assert.equal(g('so-2').denom, 4); assert.equal(g('so-2').wholes, 2);
  assert.equal(g('so-5').servings, 5); assert.equal(g('so-5').wholes, 3);
  for (const l of LEVELS.filter(l => l.bands.includes('2'))) {
    const run = E.play(l, E.solve(l, 1), 1);
    assert.ok(run.s.done && run.stars() === 3, `${l.id} is solved by its advice script`);
  }
});

test('a product is served by any cut that builds it exactly; a share-out needs the serving cut', () => {
  const half = new E.Run(lv('su-4'), 1);   // 2/3 x 3/4 = 6/12 = 1/2
  half.act({ t: 'cut', n: 2 }); half.act({ t: 'tap', i: 0 });
  assert.ok(half.act({ t: 'serve' }).done, 'one half, cut in halves, is right');
  const thirds = new E.Run(lv('su-4'), 1); thirds.act({ t: 'cut', n: 3 }); thirds.act({ t: 'tap', i: 0 });
  assert.equal(thirds.act({ t: 'serve' }).why, 'cut-size', 'thirds cannot build one half');
  const fine = new E.Run(lv('so-3'), 1);   // 3/4 / 1/8 = 6: eighths only (sixteenths would count 12)
  fine.act({ t: 'cut', n: 4 }); for (let i = 0; i < 3; i++) fine.act({ t: 'tap', i });
  assert.equal(fine.act({ t: 'serve' }).why, 'div-cut', 'the amount in fourths is not a count of eighths');
  assert.equal(fine.act({ t: 'cut', n: 8 }).ok, true);
  assert.equal(fine.takenCount, 6, 're-slicing keeps the amount: 6 eighths');
  assert.ok(fine.act({ t: 'serve' }).done);
  const sub = new E.Run(lv('ta-2'), 1); sub.act({ t: 'cut', n: 12 }); for (let i = 0; i < 8; i++) sub.act({ t: 'tap', i });
  assert.equal(sub.act({ t: 'serve' }).why, 'too-many', '8/12 is not 3/4 - 1/6');
  assert.ok(new E.Run(lv('su-2'), 1).canAddWhole(), 'Scale Up can take more cakes');
  assert.match(HTML, /'div-cut': '([^']+)'/); assert.match(HTML, /"why\.div-cut": /);
});

test('the map says what each band plays; the controls are one card (slicer, tray, Serve and Hint)', () => {
  assert.match(HTML, /BAND_BLURB = \{ '1b': 'Explorer · grades 3–5: [^']+', '2': 'Pro · [^']+' \}/);
  assert.match(HTML, /ctrl\.classList\.add\('ff-panel'\)/);
  assert.match(HTML, /'1 · Slicer: cut into'/); assert.match(HTML, /'2 · On the tray'/);
  assert.match(HTML, /\.ff-stage\[data-n="3"\] \.ff-whole svg\.ff-cake \{/);
});
