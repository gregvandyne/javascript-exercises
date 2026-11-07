// Sum Racer choices (Number Quest fix round A5, shared with every course that races Sum Racer): the Rounding Run
// never asks to round a number that is already round, its wrong answers are a rounder's real slips (never a filler
// like 603 or 9,703), no track offers 0 unless 0 is the answer, and the race's review writes big numbers with commas.
import './_setup.js';
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
vm.runInContext(`${pure}\n;globalThis.__sr = { makeRng, genQuestion, makeChoices };`, ctx);
const { makeRng, genQuestion, makeChoices } = ctx.__sr;

test('Rounding Run: never an already-round number; wrong answers are the other neighbour, no rounding, or a place out', () => {
  const rng = makeRng(11);
  for (let i = 0; i < 3000; i++) {
    const q = genQuestion(9, rng, {});
    assert.notEqual(q.x % q.y, 0, `${q.text}: already round`);
    const ch = Array.from(makeChoices(q, rng));
    assert.equal(new Set(ch).size, 4, q.text);
    const down = Math.floor(q.x / q.y) * q.y, wp = q.y === 10 ? 100 : 10, slips = new Set([down, down + q.y, q.x, q.answer + q.y, q.answer - q.y, Math.round(q.x / wp) * wp, q.answer + 2 * q.y]);
    for (const c of ch) assert.ok(c === q.answer || slips.has(c), `${q.text}: ${c} is not a rounding slip [${ch}]`);
    assert.ok(ch.every(c => c > 0), `${q.text}: no 0 [${ch}]`);
  }
});

test('no track offers 0 unless the answer is 0 (the 3.2 sharing track offered 0 when the answer was 2)', () => {
  for (const track of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
    const rng = makeRng(track * 7);
    for (let i = 0; i < 2000; i++) {
      const q = genQuestion(track, rng, { progress: i % 10 });
      const ch = Array.from(makeChoices(q, rng));
      if (q.answer !== 0) assert.ok(!ch.includes(0), `track ${track}: ${q.text} [${ch}]`);
    }
  }
});

test('the race review writes the answer like the panel does (5,500, not 5500)', () => {
  assert.match(html, /LTR\(m\.text \+ ' = ' \+ qNum\(m\.answer\)\)/);
  assert.ok(!/m\.text \+ ' = ' \+ m\.answer\)/.test(html));
});
