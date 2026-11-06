// Sum Racer's Trading Post (track 10): the course track Number Quest's steps 2.1 ("Joining big numbers") and 2.2
// ("Taking away, measuring gaps") send their missions to (level=10&mode=add|sub&lock=1). Every question is a 3- or
// 4-digit add or take-away that needs at least one trade, so "say the trade out loud" really comes up in the race.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games/sum-racer.html'), 'utf8');
const pure = html.slice(html.indexOf('const CONFIG'), html.indexOf('/* @@PURE-END */'));
const ctx = vm.createContext({});
vm.runInContext(`${pure}\n;globalThis.__sr = { CONFIG, makeRng, genQuestion, makeDeck, makeChoices, tradeColumns, noTradeAnswer };`, ctx);
const { CONFIG, makeRng, genQuestion, makeDeck, tradeColumns, noTradeAnswer } = ctx.__sr;

test('tradeColumns: hand-checked carries and borrows', () => {
  assert.deepEqual([...tradeColumns('+', 268, 475)], [0, 1], '8 + 5 carries, then 6 + 7 + 1 carries');
  assert.deepEqual([...tradeColumns('+', 3486, 2757)], [0, 1, 2]);
  assert.deepEqual([...tradeColumns('+', 321, 456)], [], 'no trade');
  assert.deepEqual([...tradeColumns('-', 512, 287)], [0, 1], '2 - 7 borrows, then 0 - 8 borrows');
  assert.deepEqual([...tradeColumns('-', 7030, 3985)], [0, 1, 2]);
  assert.deepEqual([...tradeColumns('-', 875, 432)], [], 'no trade');
  assert.equal(noTradeAnswer('+', 268, 475), 633);
  assert.equal(noTradeAnswer('-', 512, 287), 375);
});

test('track 10 exists as a course track and every question is a big add or take-away that needs a trade', () => {
  const tc = CONFIG.tracks.find(t => t.id === 10);
  assert.ok(tc, 'track 10');
  assert.equal(CONFIG.tracks.indexOf(tc), 9, 'tracks stay indexed by id');
  assert.match(html, /tn10: "Trading Post"/);
  assert.match(html, /tsa10: "Adding big numbers with trades"/);
  assert.match(html, /tss10: "Taking away big numbers with trades"/);
  const rng = makeRng(2026);
  let four = 0, add = 0;
  for (let i = 0; i < 400; i++) {
    const q = genQuestion(10, rng, { progress: i / 400 });
    assert.ok(q.op === '+' || q.op === '-', q.text);
    assert.ok(q.x >= 100 && q.y >= 100, `${q.text}: both numbers have at least three digits`);
    assert.ok(q.answer >= 10 && q.answer <= 9999, `${q.text} = ${q.answer}`);
    assert.ok(tradeColumns(q.op, q.x, q.y).length > 0, `${q.text} needs a trade`);
    assert.equal(q.answer, q.op === '+' ? q.x + q.y : q.x - q.y);
    if (q.x >= 1000) { four++; assert.match(q.text, /^\d,\d{3} [+−] \d,\d{3}$/, 'four digits read with a comma, like the lessons'); }
    if (q.op === '+') add++;
  }
  assert.ok(four > 80 && four < 240, `a mix of 3- and 4-digit questions (${four} of 400 four-digit)`);
  assert.ok(add > 120 && add < 280, `both operations when unlocked (${add} adds)`);
});

test('the lesson lock keeps one operation, and the choices offer the no-trade slip', () => {
  for (const op of ['+', '-']) {
    const deck = makeDeck(10, makeRng(op === '+' ? 5 : 6), { op });
    let slip = 0;
    for (let i = 0; i < 40; i++) {
      const q = deck.next(i / 40); deck.report(q, i % 7 !== 0);
      assert.equal(q.op, op, q.text);
      assert.ok(tradeColumns(q.op, q.x, q.y).length > 0, `${q.text} needs a trade`);
      assert.equal(q.choices.length, 4); assert.equal(new Set(q.choices).size, 4); assert.ok(q.choices.includes(q.answer));
      if (q.choices.includes(noTradeAnswer(q.op, q.x, q.y))) slip++;
    }
    assert.ok(slip >= 30, `${op}: the no-trade answer is usually one of the wrong choices (${slip} of 40)`);
  }
});

test('the existing tracks are untouched by the new one', () => {
  assert.deepEqual([...CONFIG.tracks.slice(0, 9).map(t => t.id)], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const rng = makeRng(9);
  for (let i = 0; i < 50; i++) { const q = genQuestion(3, rng, { progress: 0.9 }); assert.ok(q.answer <= 100 && !/,/.test(q.text)); }
  for (let i = 0; i < 50; i++) assert.equal(genQuestion(9, rng, {}).op, 'round');
});
