// Fraction Factory (seed-games/fraction-factory.html): Tally the cat's bakery for Number Quest Unit 4 (The Bakery).
// The engine and every level are read from the game file itself (the classic scripts run in a vm): every level is
// solved by its advice() script, the empty run never passes, wrong serves are clues (never fails) that cost stars,
// the fraction arithmetic is hand-checked against known answers, the chapters host the Explorer 4.1/4.2/4.3 missions,
// the progress label and the class quest number follow their grammar, and the standards lock's game mapping agrees.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/fraction-factory.html'), 'utf8');
const { kitTag, kitPackTag } = await import('../../server/services/kit.js');
const { scanVersion } = await import('../../server/services/scanner.js');

function loadData(html) {
  const ctx = vm.createContext({});
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
  return { E: ctx.FractionFactory, D: ctx.FractionFactoryLevels };
}
const { E, D } = loadData(HTML);
const { LEVELS, CHAPTERS, THEN } = D;
const J = v => JSON.parse(JSON.stringify(v));
const levelsFor = (ch, band) => LEVELS.filter(l => l.ch === ch && l.bands.includes(band));
const CONTRACT = { folds: 3, 'first-cuts': 6, 're-slice': 6, recipe: 6 };

test('fraction-factory: the exact kit 1.1.5 tag and its packs, the metadata, and a clean scan', () => {
  assert.ok(HTML.startsWith('<title>Fraction Factory</title>'));
  assert.ok(HTML.includes(kitTag()), 'the byte-exact kit tag');
  for (const p of ['art-props', 'art-animals', 'art-school', 'style-bold']) assert.ok(HTML.includes(kitPackTag(p)), `${p} pack tag`);
  assert.ok(HTML.indexOf('<div id="game">') < HTML.indexOf(kitTag()), 'the game div comes before the kit');
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.equal(scanVersion(HTML).status, 'pass', JSON.stringify(scanVersion(HTML).issues));
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/fraction-factory.json'), 'utf8'));
  assert.equal(meta.slug, 'fraction-factory');
  assert.equal(meta.title, 'Fraction Factory');
  assert.equal(meta.category, 'learning');
  // Tally debuts here: the kit-cat spec lives in this game's own source
  assert.ok(HTML.includes("tally: { species: 'cat', wear: ['scarf'], colors: { base: 'peach', accent: 'mint' } }"), 'Tally spec in game source');
  assert.ok(HTML.includes('tallySVG'), 'the game draws its own Tally portrait');
  // win-gated credit: gameOver only at chapter completion, never per level
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'exactly one BRB.gameOver(...) call site (chapter end)');
});

test('fraction-factory: the chapters and the Unit 4 mission contract', () => {
  assert.deepEqual(J(CHAPTERS.map(c => c.id)), ['folds', 'first-cuts', 're-slice', 'recipe']);
  assert.deepEqual(J(CHAPTERS.map(c => c.index)), [1, 2, 3, 4]);
  for (const ch of CHAPTERS) for (const band of ['1b', '2']) assert.equal(levelsFor(ch.id, band).length, CONTRACT[ch.id], `${ch.id} ${band}`);
  assert.equal(LEVELS.length, 21);
  const ids = new Set(LEVELS.map(l => l.id)); assert.equal(ids.size, LEVELS.length, 'level ids unique');
  for (const l of LEVELS) {
    assert.ok(l.intro && l.hints.length === 3 && l.check && l.check.tiles.length === 3 && l.check.tiles[l.check.answer], `${l.id} carries intro, 3 hints and a 3-tile check`);
  }
  // the course catalogue (standards lock) names this game for steps 4.1, 4.2 and 4.3 with these chapter titles
  const units = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
  const u4 = units.units.find(u => u.n === 4);
  const want = { '4.1': 'First Cuts', '4.2': 'Re-Slice', '4.3': 'Recipe Math' };
  for (const s of u4.steps) {
    const g = s.game.explorer;
    assert.equal(g.slug, 'fraction-factory', `${s.n} is a Fraction Factory mission`);
    assert.equal(g.chapterTitle, want[s.n], `${s.n} chapter title`);
    assert.ok(CHAPTERS.some(c => c.title === g.chapterTitle), `${s.n} chapter exists in the game`);
  }
  for (const band of ['1b', '2']) for (const [from, to] of Object.entries(THEN[band])) assert.ok(CHAPTERS.some(c => c.id === to.ch), `THEN ${band} ${from} -> ${to.ch}`);
});

test('fraction-factory: fraction arithmetic, hand-checked', () => {
  assert.deepEqual(J(E.frac(2, 4)), [1, 2]);
  assert.deepEqual(J(E.frac(6, 8)), [3, 4]);
  assert.ok(E.sameValue([1, 2], [2, 4]) && E.sameValue([2, 3], [4, 6]) && !E.sameValue([1, 2], [2, 6]));
  assert.deepEqual(J(E.addFrac([1, 4], [2, 4])), [3, 4]);
  assert.deepEqual(J(E.addFrac([1, 2], [1, 4])), [3, 4], 'the Jumble lesson: 1/2 + 1/4 is 3/4, never 2/6');
  assert.deepEqual(J(E.addFrac([1, 3], [1, 6])), [1, 2]);
  assert.deepEqual(J(E.addFrac([3, 8], [2, 8])), [5, 8]);
  assert.ok(E.cmpFrac([1, 3], [1, 4]) > 0, 'a third is bigger than a fourth');
  assert.ok(E.cmpFrac([3, 4], [5, 8]) > 0);
  assert.equal(E.fmt([5, 4]), '5/4');
});

test('fraction-factory: every level is solved by its advice script; the empty run never passes', () => {
  for (const l of LEVELS) {
    const empty = new E.Run(l, 1);
    assert.ok(!empty.s.done, `${l.id}: doing nothing does not pass`);
    if (l.type !== 'compare') assert.ok(empty.serve().wrong, `${l.id}: serving an untouched tray is wrong`);
    const run = E.play(l, E.solve(l, 1), 1);
    assert.ok(run.s.done, `${l.id} solved`);
    assert.equal(run.stars(), 3, `${l.id} clean solve earns 3 stars`);
    // the goal is the mathematically right value
    const goal = new E.Run(l, 1).goal;
    if (l.type === 'slice') assert.ok(E.sameValue(goal.value, l.target), `${l.id} goal is the target`);
    if (l.type === 'add') assert.ok(E.sameValue(goal.value, E.addFrac(l.a, l.b)), `${l.id} goal is the true sum`);
    if (l.type === 'equiv') assert.ok(E.sameValue(goal.value, l.from) && goal.denom === l.denom, `${l.id} goal keeps the value at the new cut`);
  }
});

test('fraction-factory: manipulation details — re-slicing rescales, wrong serves cost stars but never fail', () => {
  const eq = LEVELS.find(l => l.id === 'rs-1');
  const run = new E.Run(eq, 1);
  assert.equal(run.takenCount, 1); assert.equal(run.s.denom, 2);        // starts as 1/2, already on the tray
  run.act({ t: 'cut', n: 4 });
  assert.equal(run.takenCount, 2, 're-slicing 1/2 into fourths doubles the taken count: 2/4, same amount');
  assert.ok(run.act({ t: 'serve' }).done);
  // the Jumble's fault, played wrong on purpose: adding the bottoms (2/6) must not pass
  const rc5 = LEVELS.find(l => l.id === 'rc-5');
  const wrong = E.play(rc5, [{ t: 'cut', n: 6 }, { t: 'tap', i: 0 }, { t: 'tap', i: 1 }, { t: 'serve' }], 1);
  assert.ok(!wrong.s.done && wrong.s.wrong === 1 && !wrong.s.failed, '2/6 is a clue, not a fail');
  const fixed = E.play(rc5, E.solve(rc5, 1), 1);
  assert.ok(fixed.s.done && E.sameValue([fixed.takenCount, fixed.s.denom], [3, 4]), 'fixed the Jumble way: 3/4');
  // a messy solve still serves, with 1 star
  const fc3 = LEVELS.find(l => l.id === 'fc-3');
  const messy = new E.Run(fc3, 1);
  messy.act({ t: 'serve' }); messy.act({ t: 'serve' });
  for (const a of E.solve(fc3, 1)) messy.act(a);
  assert.ok(messy.s.done && messy.stars() === 1, 'two wrong serves then a solve = 1 star');
  // 5/4 needs two wholes
  const rc6 = LEVELS.find(l => l.id === 'rc-6');
  const big = E.play(rc6, E.solve(rc6, 1), 1);
  assert.ok(big.s.done && big.goal.wholes === 2 && big.takenCount === 5, 'five fourths across two cakes');
});

test('fraction-factory: the label grammar and the class quest number round-trip', () => {
  assert.equal(E.label(3, 6, 'orders', 7, null), '3/6 orders, 7 stars');
  assert.equal(E.label(3, 6, 'orders', 7, { ok: 2, n: 3 }), '3/6 orders, 7 stars, 2/3 checks');
  assert.ok(E.LABEL_RE.test(E.label(6, 6, 'orders', 18, { ok: 6, n: 6 })));
  for (const ch of CHAPTERS) for (const band of ['1b', '2']) {
    const digits = E.questDigits({ chapter: ch.id, band, mode: 'play', level: 2 }, CHAPTERS);
    assert.deepEqual(J(E.questCode(digits, CHAPTERS)), { chapter: ch.id, band, mode: 'play', level: 2 }, `round-trip ${digits}`);
  }
  assert.equal(E.questCode('9900', CHAPTERS), null);
  assert.equal(E.questCode('123', CHAPTERS), null);
  const p = E.cleanParams({ chapter: 'recipe', band: '2', level: '3', lock: '1' }, CHAPTERS);
  assert.deepEqual(J(p), { present: true, chapter: 'recipe', band: '2', level: 3, lock: true });
  assert.deepEqual(J(E.cleanParams({ chapter: 'nope' }, CHAPTERS)), { present: false });
});
