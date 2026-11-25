// Mistake Hunt's sample library (docs/decisions.md "Mistake Hunt: a library of sample passages"): hundreds of correct
// passages for grades 1-8 in seed-games/mistake-hunt-samples/, written into the game by scripts/mistake-hunt-samples.mjs.
// Each must plant its grade's mistakes and pass the server's own set rules (cleanProofItems), so "Use in my set" and
// Save never fail on a sample.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { readSamples, build } = await import('../../scripts/mistake-hunt-samples.mjs');
const { proofCore } = await import('../../server/services/proof-core.js');
const { cleanProofItems } = await import('../../server/services/game-sets.js');
const { cleanText } = await import('../../server/services/textfilter.js');
const P = proofCore();
const html = fs.readFileSync('seed-games/mistake-hunt.html', 'utf8');
const samples = readSamples();
const TOPICS = ['animals', 'science', 'space', 'earth', 'history', 'world', 'everyday', 'sports', 'arts', 'inventions'];
const count = g => (g <= 1 ? 3 : g <= 3 ? 5 : 6);   // the builder's defaultCount

test('the game holds the library exactly as the files have it', () => {
  assert.equal(build(html), html, 'run node scripts/mistake-hunt-samples.mjs');
  assert.match(html, /var defaultCount = function \(g\) \{ return g <= 1 \? 3 : g <= 3 \? 5 : 6; \};/, 'the count the tests assume');
});

test('hundreds of passages: 40 a grade from 1 to 8, 4 a topic in each grade, ids and titles unique', () => {
  assert.ok(samples.length >= 320, `${samples.length} passages`);
  for (let g = 1; g <= 8; g++) {
    const mine = samples.filter(s => s.g === g);
    assert.equal(mine.length, 40, `grade ${g}`);
    for (const k of TOPICS) assert.equal(mine.filter(s => s.topic === k).length, 4, `grade ${g}: ${k}`);
  }
  assert.equal(new Set(samples.map(s => s.id)).size, samples.length);
  assert.equal(new Set(samples.map(s => s.t)).size, samples.length, 'titles');
  assert.equal(new Set(samples.map(s => s.x)).size, samples.length, 'texts');
});

test('every passage plants its grade\'s mistakes and saves as a set (the server\'s own rules)', () => {
  const bad = [];
  for (const s of samples) {
    if (P.normText(s.x) !== s.x || !cleanText(s.x, 1500).ok || !cleanText(s.t, 60).ok) { bad.push(`${s.id}: text`); continue; }
    for (const seed of [1, 2, 3]) {
      const m = P.plant(s.x, { types: P.preset(s.g), n: count(s.g), seed });
      if (m.length < count(s.g)) { bad.push(`${s.id}: ${m.length} mistakes`); break; }
      const set = cleanProofItems([{ t: s.t, x: s.x, g: s.g, m, o: { h: true, s: true, n: 'total' } }]);
      if (!set) { bad.push(`${s.id}: refused as a set (seed ${seed})`); break; }
    }
  }
  assert.deepEqual(bad, []);
});

test('the library screen: grades, topics, Play it and Use in my set', () => {
  assert.match(html, /if \(SAMPLES.length\) c.appendChild\(bigChoice\('', '📖', t\('samplesH'\)/, 'on the home screen');
  for (const k of ['samplesH', 'samplesSub', 'playIt', 'useIt', 'allTopics', ...TOPICS.map(k => `tp.${k}`)]) assert.ok(html.includes(`"${k}":`), k);
  assert.match(html, /function useOne\(s\)/); assert.match(html, /function playOne\(s\)/);
  assert.match(html, /sampleId: s\.id/, 'each sample keeps its own work');
});

// The same levels as the game's levelOf (seed-games/mistake-hunt.html), read from the game itself.
const levelSrc = /function levelOf\(g, lvl\) \{[\s\S]*?\n  \}/.exec(html)[0];
const levelOf = new Function('P', 'defaultCount', `${levelSrc}; return levelOf;`)(P, count);

test('difficulty: Easy plants fewer and earlier kinds and tells each kind; Hard plants more and tells nothing', () => {
  for (let g = 1; g <= 8; g++) {
    const e = levelOf(g, 'easy'), m = levelOf(g, 'medium'), h = levelOf(g, 'hard');
    assert.ok(e.n < m.n && m.n < h.n, `grade ${g}: counts ${e.n} < ${m.n} < ${h.n}`);
    assert.ok(e.types.every(k => P.BY[k].gr <= Math.max(0, g - 1) && P.BY[k].g !== 'sent'), `grade ${g}: easy kinds are earlier ones`);
    assert.ok(h.types.length >= m.types.length, `grade ${g}: hard has at least medium's kinds`);
    assert.deepEqual([e.o.n, m.o.n, h.o.n], ['type', 'total', 'none']);
  }
  const bad = [];
  for (const s of samples) for (const lvl of ['easy', 'hard']) {
    const L = levelOf(s.g, lvl), m = P.plant(s.x, { types: L.types, n: L.n, seed: 4 });
    const want = lvl === 'easy' ? 2 : count(s.g) + 1;   // a short text may not hold all of Hard's extra three
    if (m.length < want) bad.push(`${s.id} ${lvl}: ${m.length}`);
    else if (!cleanProofItems([{ t: s.t, x: s.x, g: s.g, m, o: L.o }])) bad.push(`${s.id} ${lvl}: refused as a set`);
  }
  assert.deepEqual(bad, []);
  assert.match(html, /levelChips\(S\.sd,/, 'the library picks a level');
  assert.match(html, /levelChips\(d\.lvl \|\| ''/, 'and so does the builder');
});
