// Fraction Factory, the owner's Recipe Math order 6 note: an order of more than one whole (5/4 of a cake) starts with
// ONE cake and an Add a cake button; the second cake never appears by itself when a slicer is picked. Adding is
// capped at the wholes the order needs, an extra cake can be taken away again (its parts come off the tray), one
// slicer cuts every cake the same way (fourths stay fourths), 5/4 across two cakes still wins, wrong amounts keep
// their feedback, and the words Tally says match the new flow. The engine runs from the game file itself.
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
const E = ctx.FractionFactory, { LEVELS } = ctx.FractionFactoryLevels, en = ctx.FractionFactoryI18n.en;
const rc6 = LEVELS.find(l => l.id === 'rc-6');
const fresh = () => new E.Run(rc6, 1);

test('an order of more than one whole starts with one cake; a slicer never adds the second', () => {
  const run = fresh();
  assert.equal(run.goal.wholes, 2, '5/4 needs two cakes');
  assert.equal(run.s.wholes, 1, 'one cake on the table at the start');
  assert.ok(run.snapshot().canAddWhole, 'Add a cake is offered');
  run.act({ t: 'cut', n: 4 });
  assert.equal(run.s.wholes, 1, 'cutting does not bring a second cake');
  assert.equal(run.act({ t: 'tap', i: 4 }).ok, false, 'there is no part 5 until a second cake is added');
  for (let i = 0; i < 4; i++) run.act({ t: 'tap', i });
  const r = run.act({ t: 'serve' });
  assert.equal(r.why, 'more-wholes', 'a full cake that is still short says: add a cake');
  assert.ok(!run.s.done && !run.s.failed);
});

test('add a cake, cut both into fourths, serve 5/4: it wins (in either order of add and cut)', () => {
  const addFirst = fresh();
  assert.ok(addFirst.act({ t: 'add-whole' }).ok);
  assert.equal(addFirst.s.wholes, 2);
  addFirst.act({ t: 'cut', n: 4 });
  for (const i of [0, 1, 2, 3, 4]) assert.ok(addFirst.act({ t: 'tap', i }).ok, `part ${i}`);
  assert.ok(addFirst.act({ t: 'serve' }).done, '5/4 across two cakes is served');
  assert.equal(addFirst.stars(), 3);
  // cut first, then add: the new cake comes in with the same cut, so its parts are fourths too
  const cutFirst = fresh();
  cutFirst.act({ t: 'cut', n: 4 }); cutFirst.act({ t: 'add-whole' });
  assert.equal(cutFirst.s.denom, 4);
  for (const i of [0, 1, 2, 3, 7]) assert.ok(cutFirst.act({ t: 'tap', i }).ok);
  assert.ok(cutFirst.act({ t: 'serve' }).done);
  // the advice script adds the cake before it cuts
  const steps = E.solve(rc6, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(steps.slice(0, 2))), [{ t: 'add-whole' }, { t: 'cut', n: 4 }]);
});

test('one slicer cuts every cake the same way; re-slicing keeps the amount across both cakes', () => {
  const run = fresh();
  run.act({ t: 'add-whole' }); run.act({ t: 'cut', n: 4 });
  for (const i of [0, 1, 2, 3, 4]) run.act({ t: 'tap', i });
  run.act({ t: 'cut', n: 8 });
  assert.equal(run.takenCount, 10, '5 fourths re-sliced are 10 eighths');
  assert.ok([...run.s.taken].every(i => i < 16), 'all parts are on the two cakes');
  assert.ok(run.act({ t: 'serve' }).done, '10/8 is 5/4');
});

test('adding is capped at the wholes the order needs; a one-whole order never offers it', () => {
  const run = fresh();
  assert.ok(run.act({ t: 'add-whole' }).ok);
  assert.equal(run.act({ t: 'add-whole' }).ok, false, 'no third cake for 5/4');
  assert.equal(run.s.wholes, 2);
  assert.equal(run.snapshot().canAddWhole, false);
  for (const l of LEVELS.filter(x => E.goalOf(x).wholes === 1)) {
    const r = new E.Run(l, 1);
    assert.equal(r.act({ t: 'add-whole' }).ok, false, `${l.id}: one whole only`);
    assert.equal(r.act({ t: 'remove-whole' }).ok, false, `${l.id}: the first whole stays`);
    assert.equal(r.s.wholes, 1);
  }
  // any level of more than one whole, not only rc-6, gets the same flow (an add order whose sum is over one, too)
  const big = { id: 'x', type: 'add', a: [3, 4], b: [2, 4], denom: 4, whole: 'cake' };
  const x = new E.Run(big, 1);
  assert.equal(x.goal.wholes, 2); assert.equal(x.s.wholes, 1);
  assert.ok(E.play(big, E.solve(big, 1), 1).s.done, 'a 5/4 sum is solved with an added cake');
});

test('an extra cake can be taken away again, and its parts leave the tray with it', () => {
  const run = fresh();
  run.act({ t: 'add-whole' }); run.act({ t: 'cut', n: 4 });
  for (const i of [0, 1, 4, 5]) run.act({ t: 'tap', i });
  assert.ok(run.act({ t: 'remove-whole' }).ok);
  assert.equal(run.s.wholes, 1);
  assert.deepEqual([...run.s.taken].sort(), [0, 1], 'the second cake’s parts come off');
  assert.equal(run.act({ t: 'remove-whole' }).ok, false, 'the first cake always stays');
  assert.ok(run.act({ t: 'add-whole' }).ok, 'and it can be added back');
  assert.equal(run.takenCount, 2, 'a cake added back comes in empty');
});

test('wrong amounts across two cakes keep their feedback', () => {
  const serve = taps => { const r = fresh(); r.act({ t: 'add-whole' }); r.act({ t: 'cut', n: 4 }); for (const i of taps) r.act({ t: 'tap', i }); return r.act({ t: 'serve' }); };
  assert.equal(serve([0, 1, 2, 3]).why, 'too-few', '4/4 is one whole, not 5/4');
  assert.equal(serve([0, 1, 2, 3, 4, 5]).why, 'too-many', '6/4');
  const thirds = fresh(); thirds.act({ t: 'add-whole' }); thirds.act({ t: 'cut', n: 3 }); thirds.act({ t: 'tap', i: 0 });
  assert.equal(thirds.act({ t: 'serve' }).why, 'cut-size', 'thirds cannot build 5/4');
  assert.equal(fresh().act({ t: 'serve' }).why, 'no-cut');
});

test('the words match the flow: Add a cake in the intro, the hints and the feedback, kept in the spoken block', () => {
  assert.match(rc6.intro, /Tap Add a cake to get a second cake, then cut both cakes into fourths/);
  assert.equal(en['intro.rc-6'], rc6.intro);
  rc6.hints.forEach((h, i) => assert.equal(en[`hint.rc-6.${i + 1}`], h));
  assert.ok(rc6.hints.some(h => /Add a cake/.test(h)), 'a hint names the button');
  assert.ok(!/fetch a second cake|Use two cakes and serve/.test(HTML), 'the old wording is gone');
  assert.match(en['why.more-wholes'], /Add a cake/);
  // the page: a second cake comes from the Add a cake card, never from the slicer
  assert.ok(HTML.includes("doAction({ t: 'add-whole' })") && HTML.includes("doAction({ t: 'remove-whole' })"));
  assert.ok(!HTML.includes('snap.denom ? run.goal.wholes : 1'), 'the slicer no longer decides how many cakes are drawn');
  assert.ok(HTML.includes('wholeSVG(L, snap.denom || 1, taken, snap.wholes,'), 'the cakes drawn are the cakes on the table');
  for (const t of [/[—]/]) assert.ok(!t.test(HTML.slice(HTML.indexOf('// ==== I18N START'), HTML.indexOf('// ==== I18N END'))), 'no em dashes in the spoken lines');
});

test('the play area adapts to the frame height: a side-by-side layout for wide, short frames', () => {
  assert.match(HTML, /@media \(min-aspect-ratio: 13\/10\)/);
  assert.match(HTML, /--ff-cake: clamp\(/);
  assert.match(HTML, /\.ff-whole svg\.ff-cake \{ width: var\(--ff-cake\); height: var\(--ff-cake\); \}/);
  assert.match(HTML, /@media \(max-height: 760px\), \(max-width: 899px\) \{ \.ff\[data-screen="level"\] \{ top: min\(var\(--ok-safe-top\), 66px\); \} \}/);
});
