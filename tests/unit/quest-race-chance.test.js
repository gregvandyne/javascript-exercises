// Quest Race, Number Quest step 7.3 (Likely or not?): the chance Practice Race (mode=nq-7-3). The generator lives
// inside seed-games/quest-race.html; this test lifts nqChanceItems out of the page and runs it over many seeds. Every
// question is judged from a share of equal parts, and its key is the chance word that share names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'seed-games', 'quest-race.html'), 'utf8');
function lift(name) {
  const at = html.indexOf(`function ${name}(rnd) {`);
  assert.ok(at > 0, `${name} is in quest-race.html`);
  const end = html.indexOf('\n  }\n', at);
  return new Function(`${html.slice(at, end + 4)}; return ${name};`)();
}
function rand(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return {
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    shuffle: arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}
const WORDS = ['Certain', 'Likely', 'An even chance', 'Unlikely', 'Impossible'];
const expect = (k, n) => (k === n ? 'Certain' : k === 0 ? 'Impossible' : 2 * k === n ? 'An even chance' : 2 * k > n ? 'Likely' : 'Unlikely');

test('Quest Race 7.3: eight chance questions, each keyed to the word its share of parts names', () => {
  const gen = lift('nqChanceItems');
  const seen = new Set();
  for (let seed = 1; seed <= 500; seed++) {
    const items = gen(rand(seed));
    assert.equal(items.length, 8);
    for (const it of items) {
      const where = `seed ${seed}: "${it.q}"`;
      assert.equal(it.choices.length, 4, where); assert.equal(new Set(it.choices).size, 4, where);
      assert.ok(it.choices.every(c => WORDS.includes(c)), where);
      const m = /has (\d+) equal (?:parts|slices)|holds (\d+) counters/.exec(it.q); assert.ok(m, where);
      const n = +(m[1] || m[2]);
      const k = /none of them/.test(it.q) ? 0 : /all \d+ of them/.test(it.q) ? n : +/and (\d+) of them/.exec(it.q)[1];
      assert.equal(it.choices[it.answer], expect(k, n), where);
      seen.add(it.choices[it.answer]);
      assert.ok(!/\b0 /.test(it.q), `${where}: "none", never "0 of them"`);
    }
  }
  assert.deepEqual([...seen].sort(), [...WORDS].sort(), 'all five chance words come up as keys');
  assert.match(html, /if \(NQ_STEP === 'explorer-7\.3'\) \{ practiceGo\(nqChanceItems\(practice\.rnd\)\); return; \}/);
});
