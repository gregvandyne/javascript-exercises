// Number Quest placement bank (seed-lessons/number-quest/placement): 266 templates across four strands
// and half-grade rungs K.0-8.0 (spec §4.3; repair round 3 added 12 mid-rung hands-on templates, six
// each for Number and Shape & Measure; the Pro lock of 2026-11-14 rebuilt rungs 6.0-8.0: 63 of the 72
// templates there were retired and 77 written, see tests/unit/number-quest-placement-pro.test.js). Checks the bank's shape, its Launchpad audio-first rules
// (§9), and that the generator produces solvable items with correct, unique keys for every template.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'seed-lessons/number-quest/placement');
const BANK = JSON.parse(fs.readFileSync(path.join(DIR, 'templates.json'), 'utf8'));
const PLACE = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'placement.json'), 'utf8'));
const CROSSWALK = PLACE.crosswalk;
const { generateItem, generateById, BY_ID, RETIRED } = await import('../../seed-lessons/number-quest/placement/generator.js');

test('bank holds 266 templates, no thin strand x rung cell', () => {
  assert.equal(BANK.templates.length, 266);
  assert.equal(BANK.templates.filter(t => t.rung < 6).length, 180, 'the 180 templates below rung 6 are the ones the bank has always had');
  const perStrand = {}, cells = new Map(), ids = new Set();
  for (const t of BANK.templates) {
    perStrand[t.strand] = (perStrand[t.strand] || 0) + 1;
    const k = `${t.strand}@${t.rungLabel}`; cells.set(k, (cells.get(k) || 0) + 1);
    assert.ok(!ids.has(t.id), `duplicate ${t.id}`); ids.add(t.id);
  }
  assert.deepEqual(perStrand, { number: 70, algebra: 63, 'shape-measure': 70, 'data-chance': 63 });
  assert.equal(cells.size, 4 * 17);
  for (const [k, n] of cells) assert.ok(n >= 3, `thin cell ${k}=${n}`);
  for (const [k, n] of cells) if (/@[678]\./.test(k)) assert.ok(n >= 4, `a rung 6.0-8.0 cell holds at least four templates (${k}=${n})`);
});

test('every template is fully tagged (strand, rung, CCSS, misconception, response type, reading load)', () => {
  for (const t of BANK.templates) {
    for (const f of ['id', 'strand', 'rung', 'rungLabel', 'grade', 'ccss', 'ccssDomain', 'ccssCluster', 'ccssClusterCode', 'lockStatus', 'misconception', 'responseType', 'readingLoad', 'archetype']) assert.ok(t[f] !== undefined && t[f] !== '' && t[f] !== null, `${t.id} missing ${f}`);
    assert.ok(['pick', 'numeric', 'count-out', 'drag', 'build'].includes(t.responseType), t.id);
    assert.ok(['none', 'low', 'standard'].includes(t.readingLoad), t.id);
    assert.ok(t.gen && typeof t.gen === 'object', t.id);
  }
});

test('Launchpad rules: low rungs are audio-first and reading-free at kindergarten', () => {
  for (const t of BANK.templates) {
    if (t.rung <= 2.5) assert.equal(t.audioFirst, true, t.id);
    if (t.rung < 3) assert.equal(t.launchpadSafe, true, t.id);
    if (t.rung < 1) assert.equal(t.readingLoad, 'none', t.id);
  }
  assert.ok(BANK.templates.filter(t => t.audioFirst).length >= 80);
});

test('every template generates solvable items with correct, unique keys', () => {
  for (const t of BANK.templates) {
    for (let seed = 1; seed <= 25; seed++) {
      const item = generateItem(t, seed);
      assert.ok(item.prompt && !item.prompt.includes('{'), `${t.id}:${seed} prompt`);
      assert.ok(item.answer !== undefined && item.answer !== '', `${t.id}:${seed} key`);
      if (t.responseType === 'pick') {
        // 4 choices; a two-way question (even or odd) has just its 2, never a nudged "odd (other)"
        assert.ok(item.choices.length === 4 || (item.choices.length === 2 && /even or odd/.test(item.prompt)), `${t.id}:${seed}`);
        assert.equal(new Set(item.choices.map(c => String(c.value))).size, item.choices.length, `${t.id}:${seed} unique`);
        assert.ok(!item.choices.some(c => / \(other\)$/.test(String(c.value))), `${t.id}:${seed} no nudged filler`);
        assert.equal(item.choices[item.answerIndex].value, item.answer, `${t.id}:${seed} key position`);
        for (const c of item.choices) if (c.value !== item.answer) assert.ok(c.misconception, `${t.id}:${seed} distractor tag`);
      } else if (item.servedAsPick) {
        // a word, a fraction or a number of 100 or more is never typed: it is served as buttons
        assert.ok(item.choices.length >= 2 && item.choices.length <= 4, `${t.id}:${seed} buttons`);
        assert.equal(new Set(item.choices.map(c => String(c.value))).size, item.choices.length, `${t.id}:${seed} unique`);
        assert.equal(item.choices[item.answerIndex].value, item.answer, `${t.id}:${seed} key position`);
        assert.ok(!item.choices.some(c => / \(other\)$/.test(String(c.value))), `${t.id}:${seed} no nudged filler`);
      } else {
        assert.equal(item.distractorMisconceptions.length, 3, `${t.id}:${seed}`);
        assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 100, `${t.id}:${seed}: a typed answer is a short whole number (${item.answer})`);
      }
    }
  }
});

test('generation is reproducible per seed and varies across seeds', () => {
  const t = BANK.templates.find(x => x.archetype === 'multiply' && x.rung >= 3) || BANK.templates.find(x => x.archetype === 'add');
  assert.deepEqual(generateById(t.id, 7), generateById(t.id, 7));
  const prompts = new Set(Array.from({ length: 20 }, (_, i) => generateById(t.id, i + 1).prompt));
  assert.ok(prompts.size >= 5, 'items should vary per attempt');
  // BY_ID also finds the retired templates (retired.json): never served, still gradable for an item already dealt.
  assert.equal(BY_ID.size, 266 + RETIRED.length); assert.equal(RETIRED.length, 63);
});

test('crosswalk (in placement.json, the strand lock) routes to the lower unit and never certifies', () => {
  assert.match(CROSSWALK.about, /LOWER unit/);
  assert.match(CROSSWALK.softLanding, /override is absolute/);
  assert.ok(CROSSWALK.entryProfiles['explorer-1.1']);
});

test('templates respect the standards lock: every rung is locked, and every template cites a cluster its rung names', () => {
  // Until the Pro lock (2026-11-14) rungs 6.0-8.0 were "deferred-pro-phase" with no cluster code, yet served. Now
  // all 17 rungs are locked, so the one rule holds for every template in the bank.
  for (const t of BANK.templates) {
    assert.equal(t.lockStatus, 'locked', t.id);
    assert.equal(typeof t.ccssClusterCode, 'string', `${t.id}: tagged with its cluster code`);
    assert.ok(PLACE.strands[t.strandLabel].lockedRungs[t.rungLabel].clusters.includes(t.ccssClusterCode), t.id);
    assert.equal(/^[678]\./.test(t.ccssClusterCode), t.rung >= 6, `${t.id}: a grade 6-8 cluster sits at a rung of 6.0 or over, and nowhere else`);
  }
  for (const strand of Object.values(PLACE.strands)) assert.equal(strand.deferredRungs, undefined, 'no rung is deferred any more');
});

test('structure promised in words is the structure rendered: "R rows of P" items carry rows x perRow', () => {
  // Greg's catch (2026-11-05): a countUnitSquares item said "4 rows of 6 squares" while the counters
  // rendered in a flat wrap (5,5,5,5,4) — the picture contradicted the words, though the total and
  // the key were right. The generator now carries the arrangement in the manip (rows, perRow) and
  // the page renders exactly that. This guard ties the two together for every bank template whose
  // words promise an arrangement, so a future archetype cannot reintroduce the mismatch.
  const src = fs.readFileSync(path.join(ROOT, 'public/js/number-quest-placement.js'), 'utf8');
  assert.ok(src.includes('nq-counter-row') && src.includes('perRow'), 'the placement page renders structured rows');
  let checked = 0;
  for (const t of BANK.templates) {
    for (let s = 0; s < 40; s++) {
      const item = generateItem(t, `structure-${s}`);
      const m = /(\d+) rows of (\d+)/.exec(item.prompt);
      if (!m) continue;
      checked++;
      const rows = Number(m[1]), per = Number(m[2]);
      assert.ok(item.manip, `${t.id} promises rows but carries no manip`);
      assert.equal(item.manip.kind, 'count-out', t.id);
      assert.equal(item.manip.rows, rows, `${t.id}: manip.rows must equal the promised rows ("${item.prompt}")`);
      assert.equal(item.manip.perRow, per, `${t.id}: manip.perRow must equal the promised row size ("${item.prompt}")`);
      assert.equal(item.manip.count, rows * per, `${t.id}: manip.count must be rows x perRow`);
    }
  }
  assert.ok(checked > 100, `the guard actually exercised structured items (${checked})`);
});
