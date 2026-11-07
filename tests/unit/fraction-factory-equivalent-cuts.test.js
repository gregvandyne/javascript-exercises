// Fraction Factory, Number Quest fix round A5: the uncut whole never gives the order's cut away, and an
// equivalent finer cut serves a slice or recipe order (1/2 = 2/4, the Re-Slice lesson), while a cut that cannot
// build the order exactly is still the wrong size. Re-Slice orders keep their own named-cut rule. The engine is
// run from the game file itself, as in fraction-factory.test.js.
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
const E = ctx.FractionFactory, { LEVELS } = ctx.FractionFactoryLevels;
const level = id => LEVELS.find(l => l.id === id);
const serveAfter = (id, cut, taps) => {
  const run = new E.Run(level(id), 1);
  run.act({ t: 'cut', n: cut });
  for (let i = 0; i < taps; i++) run.act({ t: 'tap', i });
  return run.act({ t: 'serve' });
};

test('the uncut whole is drawn whole: one part, no cut lines, until a slicer is picked', () => {
  assert.ok(!HTML.includes('wholeSVG(L, snap.denom || L.denom'), 'the order’s own denominator is never drawn before a cut');
  assert.ok(HTML.includes('wholeSVG(L, snap.denom || 1,'), 'an uncut whole is drawn in one part');
  assert.match(HTML, /if \(denom === 1\) \{ \/\/ a whole cake/, 'a whole cake is one round, not a degenerate sector');
  assert.match(HTML, /'A whole cake, not cut yet'/);
});

test('an equivalent finer cut serves the order; a cut that cannot build it is the wrong size', () => {
  const half = LEVELS.find(l => l.type === 'slice' && l.target[0] === 1 && l.target[1] === 2 && l.ch === 'first-cuts');
  assert.ok(half, 'First Cuts has a 1/2 order');
  assert.ok(serveAfter(half.id, 2, 1).done, '1/2 cut into halves, 1 taken');
  assert.ok(serveAfter(half.id, 4, 2).done, '1/2 cut into fourths, 2 taken: 2/4 = 1/2');
  assert.ok(serveAfter(half.id, 8, 4).done, '1/2 cut into eighths, 4 taken');
  assert.equal(serveAfter(half.id, 4, 1).why, 'too-few', '1/4 is not 1/2');
  assert.equal(serveAfter(half.id, 4, 3).why, 'too-many');
  assert.equal(serveAfter(half.id, 3, 1).why, 'cut-size', 'thirds cannot build a half');
  // Every slice and recipe order: its own cut and every finer multiple of it both serve.
  for (const l of LEVELS.filter(x => x.type === 'slice' || x.type === 'add')) {
    const g = E.goalOf(l);
    for (const n of E.CUTS.filter(c => c % g.denom === 0)) {
      assert.ok(serveAfter(l.id, n, g.take * n / g.denom).done, `${l.id}: cut into ${n} serves ${g.take * n / g.denom}/${n}`);
    }
    for (const n of E.CUTS.filter(c => c % g.denom !== 0)) assert.equal(serveAfter(l.id, n, 1).why, 'cut-size', `${l.id}: ${n} cannot build it`);
  }
});

test('Re-Slice orders keep their named cut, and the kinder wrong-size line says why', () => {
  for (const l of LEVELS.filter(x => x.type === 'equiv')) {
    const g = E.goalOf(l), other = E.CUTS.find(c => c !== g.denom && c % g.denom === 0 && c !== l.from[1]);
    if (!other) continue;
    const run = new E.Run(l, 1); run.act({ t: 'cut', n: other }); const r = run.act({ t: 'serve' });
    assert.equal(r.why, 'reslice', `${l.id}: the order names its cut`);
  }
  assert.match(HTML, /'cut-size': 'Those parts cannot build this order exactly\. Pick a slicer whose parts fit it/);
});
