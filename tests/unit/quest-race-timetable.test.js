// Quest Race, Number Quest step 5.2 (Time and timetables): every generated time question reads like a clock.
// The generator lives inside seed-games/quest-race.html; this test lifts nqTimetableItems out of the page and runs it
// over many seeds. Each clock choice is H:MM (minutes 00-59), or the one deliberate no-trade mistake written the way a
// kid writes it, the start's hour with the minutes run past 60 ("9:65", like the bank item "9:60"). Never "10:0".
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
// A small seeded generator with the kit's two calls (int inclusive, shuffle in place).
function rand(seed) {
  let s = seed >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  return {
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    shuffle: arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}
const CLOCK = /^(\d{1,2}):([0-5]\d)$/;
const NO_TRADE = /^(\d{1,2}):([67]\d)$/;
const isTime = c => /^\d+:\d+$/.test(c);
const toMin = c => { const [h, m] = c.split(':').map(Number); return h * 60 + m; };

test('Quest Race 5.2: every time choice is H:MM or the deliberate H:6X/7X no-trade form, all choices distinct', () => {
  const gen = lift('nqTimetableItems');
  let noTradeSeen = 0, timeQs = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const items = gen(rand(seed));
    assert.equal(items.length, 8, 'eight questions');
    for (const it of items) {
      const where = `seed ${seed}: "${it.q}" [${it.choices.join(' | ')}]`;
      assert.equal(it.choices.length, 4, `${where}: four choices`);
      assert.equal(new Set(it.choices).size, 4, `${where}: choices are distinct`);
      assert.ok(it.answer >= 0 && it.answer < 4, `${where}: the answer is one of the choices`);
      assert.ok(!it.choices.some(c => / x\d$/.test(c)), `${where}: no filler choice`);
      const key = it.choices[it.answer];
      if (!it.choices.some(isTime)) continue;
      timeQs++;
      assert.match(key, CLOCK, `${where}: the right answer is a real clock time`);
      for (const c of it.choices) {
        assert.ok(isTime(c), `${where}: a time question offers only times`);
        if (CLOCK.test(c)) continue;
        assert.match(c, NO_TRADE, `${where}: "${c}" is neither H:MM nor the no-trade H:6X/7X form`);
        // The no-trade mistake is the right answer's minutes counted on from the hour before: same total minutes.
        assert.equal(toMin(c), toMin(key), `${where}: "${c}" models the no-trade error for ${key}`);
        assert.ok(/^A bus leaves/.test(it.q), `${where}: only the arrival questions carry the no-trade mistake`);
        noTradeSeen++;
      }
    }
  }
  assert.ok(timeQs > 3000 * 4, 'the clock questions were exercised');
  assert.ok(noTradeSeen > 100, 'the no-trade mistake shows up when a ride lands just past the hour');
});

test('Quest Race 5.2: an arrival on the hour offers the no-trade mistake as previous hour + 60, never "10:0"', () => {
  const gen = lift('nqTimetableItems');
  let onHour = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    for (const it of gen(rand(seed))) {
      const key = it.choices[it.answer];
      if (!/^A bus leaves/.test(it.q) || !/:00$/.test(key)) continue;
      onHour++;
      const h = +key.split(':')[0];
      assert.ok(it.choices.includes(`${h - 1}:60`), `seed ${seed}: "${it.q}" offers ${h - 1}:60 [${it.choices.join(' | ')}]`);
    }
  }
  assert.ok(onHour > 10, 'arrivals on the hour were generated');
});

test('Quest Race 5.2: the minutes-to-hours swap never says "0 minutes"', () => {
  const gen = lift('nqTimetableItems');
  for (let seed = 1; seed <= 500; seed++) {
    for (const it of gen(rand(seed))) {
      if (!/in hours and minutes/.test(it.q)) continue;
      for (const c of it.choices) assert.ok(!/\b0 minutes/.test(c), `seed ${seed}: "${c}"`);
    }
  }
});

// The Vault Run (Number Quest 7.4): every lock offers four distinct, real choices — never the " x<n>" filler the
// generator pads with when distractors collapse. Lock 1 used to collapse for a ones-place digit ("6 | 60 | 1 | 6 x3").
test('Quest Race 7.4: every Vault lock has four distinct real choices, and Lock 1 offers the digit at the other three places', () => {
  const gen = lift('nqVaultItems');
  for (let seed = 1; seed <= 3000; seed++) {
    const items = gen(rand(seed));
    for (const it of items) {
      const where = `seed ${seed}: "${it.q}" [${it.choices.join(' | ')}]`;
      assert.equal(new Set(it.choices).size, 4, `${where}: four distinct choices`);
      assert.ok(it.choices.every(c => !/ x\d$/.test(String(c))), `${where}: no filler choice`);
      assert.ok(it.answer >= 0 && it.answer < 4, `${where}: the answer is one of the choices`);
      const m = /^LOCK 1 · In ([\d,]+), what is the value of the (\d)\?$/.exec(it.q);
      if (m) {
        const d = +m[2];
        assert.deepEqual([...it.choices].map(c => +String(c).replace(/,/g, '')).sort((a, b) => a - b), [d, d * 10, d * 100, d * 1000], `${where}: the digit at each place`);
      }
    }
  }
});
