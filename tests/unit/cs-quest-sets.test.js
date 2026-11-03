// CS Quest quiz banks (seed-lessons/cs-quest/sets/*.json): the fourteen unit banks the lesson materialiser derives
// warm-ups, exit tickets and unit reviews from. Every item is checked against the contract's itemSchema (4 choices, one
// right answer, 300/120 character limits, 15 or 20 seconds), the CSTA 2017 list (cat is a real id of the bank's level
// AND a primary id of the item's lesson), the lessons that reference items by id (every warm-up and exit-ticket id must
// exist in the named bank), the mastery rule's coverage (>= 3 bank items per standard id across the program), uniqueness,
// US spelling, and the real text rules: the game scanner over every string and the live-set filter the materialiser's
// SETS.createSet runs (cleanItems), so a bank can never fail to materialise on a teacher's account.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'seed-lessons/cs-quest/sets');
const { scanVersion } = await import('../../server/services/scanner.js');
const { cleanItems, LIMITS, SECS } = await import('../../server/services/classlive-sets.js');
const CSTA = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards;
const BY_ID = new Map(CSTA.map(s => [s.id, s]));

// The contract (contract-live-sets.json "sets"): id, the plan's item count, the bank's standards. The critic's CA-5 review
// items (1b-1.1-r2, 1b-1.5-r2, 1b-6.3-r2, 2-6.3-r2, 2-5.1-r2) come on top of the plan's counts; 1B-AP-08 and 1B-AP-12
// still had only two items each after them, so 1b-1.1-r3 and 1b-1.5-r3 were added to satisfy the ">= 3 per id" rule.
const SETS = [
  ['csq-u1-1b', 21 + 4, ['1B-AP-10', '1B-AP-08', '1B-AP-09', '1B-AP-11', '1B-AP-12']],
  ['csq-u1-2', 21, ['2-AP-10', '2-AP-13', '2-AP-12', '2-AP-11', '2-AP-14']],
  ['csq-u2-1b', 11, ['1B-AP-15', '1B-AP-16', '1B-AP-13', '1B-AP-17']],
  ['csq-u2-2', 11, ['2-AP-17', '2-AP-18', '2-AP-19', '2-AP-15']],
  ['csq-u3-1b', 13, ['1B-DA-06', '1B-DA-07', '1B-IC-20']],
  ['csq-u3-2', 13, ['2-DA-08', '2-DA-09', '2-IC-22']],
  ['csq-u4-1b', 13, ['1B-NI-04', '1B-NI-05']],
  ['csq-u4-2', 13, ['2-NI-04', '2-NI-05', '2-IC-23', '2-NI-06']],
  ['csq-u5-1b', 13, ['1B-CS-01', '1B-CS-02', '1B-CS-03']],
  ['csq-u5-2', 13 + 1, ['2-CS-02', '2-CS-01', '2-CS-03', '2-DA-07']],
  ['csq-u6-1b', 13 + 1, ['1B-IC-18', '1B-IC-19', '1B-IC-20', '1B-IC-21', '1B-AP-14']],
  ['csq-u6-2', 13 + 1, ['2-IC-20', '2-IC-21', '2-CS-01', '2-IC-23', '2-AP-16']],
  ['csq-u7-1b', 17, ['1B-AP-13', '1B-AP-16', '1B-AP-11', '1B-AP-15', '1B-IC-20', '1B-AP-17', '1B-AP-14']],
  ['csq-u7-2', 17, ['2-AP-18', '2-AP-13', '2-AP-10', '2-AP-17', '2-AP-15', '2-DA-09', '2-IC-22', '2-AP-19', '2-AP-16']],
];
const REVIEW_ADDS = ['1b-1.1-r2', '1b-1.1-r3', '1b-1.5-r2', '1b-1.5-r3', '1b-6.3-r2', '2-6.3-r2', '2-5.1-r2'];

// The contract's lessons: band, lesson, primary CSTA ids, warm-up item ids (5; none for 7.2), exit-ticket item ids (3).
const LESSONS = [
  ['1B', '1.1', ['1B-AP-10', '1B-AP-08'], ['1b-u1-o1', '1b-1.1-r1', '1b-1.1-e1', '1b-1.1-e2', '1b-1.1-e3'], ['1b-1.1-e1', '1b-1.1-e2', '1b-1.1-e3']],
  ['2', '1.1', ['2-AP-10', '2-AP-13'], ['2-u1-o1', '2-1.1-r1', '2-1.1-e1', '2-1.1-e2', '2-1.1-e3'], ['2-1.1-e1', '2-1.1-e2', '2-1.1-e3']],
  ['1B', '1.2', ['1B-AP-10'], ['1b-1.1-e1', '1b-1.1-e2', '1b-1.2-r1', '1b-1.2-e1', '1b-1.1-r1'], ['1b-1.2-e1', '1b-1.2-e2', '1b-1.2-e3']],
  ['2', '1.2', ['2-AP-12'], ['2-1.1-e1', '2-1.1-e2', '2-1.2-r1', '2-1.2-e1', '2-1.1-r1'], ['2-1.2-e1', '2-1.2-e2', '2-1.2-e3']],
  ['1B', '1.3', ['1B-AP-10'], ['1b-1.2-e1', '1b-1.2-e2', '1b-1.3-r1', '1b-1.3-e1', '1b-1.2-r1'], ['1b-1.3-e1', '1b-1.3-e2', '1b-1.3-e3']],
  ['2', '1.3', ['2-AP-12'], ['2-1.2-e1', '2-1.2-e2', '2-1.3-r1', '2-1.3-e1', '2-1.2-r1'], ['2-1.3-e1', '2-1.3-e2', '2-1.3-e3']],
  ['1B', '1.4', ['1B-AP-09'], ['1b-1.3-e1', '1b-1.3-e2', '1b-1.4-r1', '1b-1.4-e1', '1b-1.3-r1'], ['1b-1.4-e1', '1b-1.4-e2', '1b-1.4-e3']],
  ['2', '1.4', ['2-AP-11'], ['2-1.3-e1', '2-1.3-e2', '2-1.4-r1', '2-1.4-e1', '2-1.3-r1'], ['2-1.4-e1', '2-1.4-e2', '2-1.4-e3']],
  ['1B', '1.5', ['1B-AP-11', '1B-AP-12'], ['1b-1.4-e1', '1b-1.4-e2', '1b-1.5-r1', '1b-1.5-e1', '1b-1.4-r1'], ['1b-1.5-e1', '1b-1.5-e2', '1b-1.5-e3']],
  ['2', '1.5', ['2-AP-14', '2-AP-13'], ['2-1.4-e1', '2-1.4-e2', '2-1.5-r1', '2-1.5-e1', '2-1.4-r1'], ['2-1.5-e1', '2-1.5-e2', '2-1.5-e3']],
  ['1B', '2.1', ['1B-AP-15'], ['1b-u2-o1', '1b-2.1-r1', '1b-2.1-e1', '1b-2.1-e2', '1b-2.1-e3'], ['1b-2.1-e1', '1b-2.1-e2', '1b-2.1-e3']],
  ['2', '2.1', ['2-AP-17'], ['2-u2-o1', '2-2.1-r1', '2-2.1-e1', '2-2.1-e2', '2-2.1-e3'], ['2-2.1-e1', '2-2.1-e2', '2-2.1-e3']],
  ['1B', '2.2', ['1B-AP-13', '1B-AP-16', '1B-AP-17'], ['1b-2.1-e1', '1b-2.1-e2', '1b-2.2-r1', '1b-2.2-e1', '1b-2.1-r1'], ['1b-2.2-e1', '1b-2.2-e2', '1b-2.2-e3']],
  ['2', '2.2', ['2-AP-15', '2-AP-18', '2-AP-19'], ['2-2.1-e1', '2-2.1-e2', '2-2.2-r1', '2-2.2-e1', '2-2.1-r1'], ['2-2.2-e1', '2-2.2-e2', '2-2.2-e3']],
  ['1B', '3.1', ['1B-DA-06'], ['1b-u3-o1', '1b-3.1-r1', '1b-3.1-e1', '1b-3.1-e2', '1b-3.1-e3'], ['1b-3.1-e1', '1b-3.1-e2', '1b-3.1-e3']],
  ['2', '3.1', ['2-DA-08'], ['2-u3-o1', '2-3.1-r1', '2-3.1-e1', '2-3.1-e2', '2-3.1-e3'], ['2-3.1-e1', '2-3.1-e2', '2-3.1-e3']],
  ['1B', '3.2', ['1B-DA-07'], ['1b-3.1-e1', '1b-3.1-e2', '1b-3.2-r1', '1b-3.2-e1', '1b-3.1-r1'], ['1b-3.2-e1', '1b-3.2-e2', '1b-3.2-e3']],
  ['2', '3.2', ['2-DA-09'], ['2-3.1-e1', '2-3.1-e2', '2-3.2-r1', '2-3.2-e1', '2-3.1-r1'], ['2-3.2-e1', '2-3.2-e2', '2-3.2-e3']],
  ['1B', '3.3', ['1B-DA-06', '1B-DA-07', '1B-IC-20'], ['1b-3.2-e1', '1b-3.2-e2', '1b-3.3-r1', '1b-3.3-e1', '1b-3.2-r1'], ['1b-3.3-e1', '1b-3.3-e2', '1b-3.3-e3']],
  ['2', '3.3', ['2-DA-08', '2-IC-22'], ['2-3.2-e1', '2-3.2-e2', '2-3.3-r1', '2-3.3-e1', '2-3.2-r1'], ['2-3.3-e1', '2-3.3-e2', '2-3.3-e3']],
  ['1B', '4.1', ['1B-NI-04'], ['1b-u4-o1', '1b-4.1-r1', '1b-4.1-e1', '1b-4.1-e2', '1b-4.1-e3'], ['1b-4.1-e1', '1b-4.1-e2', '1b-4.1-e3']],
  ['2', '4.1', ['2-NI-04'], ['2-u4-o1', '2-4.1-r1', '2-4.1-e1', '2-4.1-e2', '2-4.1-e3'], ['2-4.1-e1', '2-4.1-e2', '2-4.1-e3']],
  ['1B', '4.2', ['1B-NI-05'], ['1b-4.1-e1', '1b-4.1-e2', '1b-4.2-r1', '1b-4.2-e1', '1b-4.1-r1'], ['1b-4.2-e1', '1b-4.2-e2', '1b-4.2-e3']],
  ['2', '4.2', ['2-NI-05', '2-IC-23'], ['2-4.1-e1', '2-4.1-e2', '2-4.2-r1', '2-4.2-e1', '2-4.1-r1'], ['2-4.2-e1', '2-4.2-e2', '2-4.2-e3']],
  ['1B', '4.3', ['1B-NI-05'], ['1b-4.2-e1', '1b-4.2-e2', '1b-4.3-r1', '1b-4.3-e1', '1b-4.2-r1'], ['1b-4.3-e1', '1b-4.3-e2', '1b-4.3-e3']],
  ['2', '4.3', ['2-NI-06'], ['2-4.2-e1', '2-4.2-e2', '2-4.3-r1', '2-4.3-e1', '2-4.2-r1'], ['2-4.3-e1', '2-4.3-e2', '2-4.3-e3']],
  ['1B', '5.1', ['1B-CS-01', '1B-CS-02'], ['1b-u5-o1', '1b-5.1-r1', '1b-5.1-e1', '1b-5.1-e2', '1b-5.1-e3'], ['1b-5.1-e1', '1b-5.1-e2', '1b-5.1-e3']],
  ['2', '5.1', ['2-CS-02', '2-CS-01'], ['2-u5-o1', '2-5.1-r1', '2-5.1-e1', '2-5.1-e2', '2-5.1-e3'], ['2-5.1-e1', '2-5.1-e2', '2-5.1-e3']],
  ['1B', '5.2', ['1B-CS-03'], ['1b-5.1-e1', '1b-5.1-e2', '1b-5.2-r1', '1b-5.2-e1', '1b-5.1-r1'], ['1b-5.2-e1', '1b-5.2-e2', '1b-5.2-e3']],
  ['2', '5.2', ['2-CS-03'], ['2-5.1-e1', '2-5.1-e2', '2-5.2-r1', '2-5.2-e1', '2-5.1-r1'], ['2-5.2-e1', '2-5.2-e2', '2-5.2-e3']],
  ['1B', '5.3', ['1B-CS-02'], ['1b-5.2-e1', '1b-5.2-e2', '1b-5.3-r1', '1b-5.3-e1', '1b-5.2-r1'], ['1b-5.3-e1', '1b-5.3-e2', '1b-5.3-e3']],
  ['2', '5.3', ['2-DA-07'], ['2-5.2-e1', '2-5.2-e2', '2-5.3-r1', '2-5.3-e1', '2-5.2-r1'], ['2-5.3-e1', '2-5.3-e2', '2-5.3-e3']],
  ['1B', '6.1', ['1B-IC-18'], ['1b-u6-o1', '1b-6.1-r1', '1b-6.1-e1', '1b-6.1-e2', '1b-6.1-e3'], ['1b-6.1-e1', '1b-6.1-e2', '1b-6.1-e3']],
  ['2', '6.1', ['2-IC-20'], ['2-u6-o1', '2-6.1-r1', '2-6.1-e1', '2-6.1-e2', '2-6.1-e3'], ['2-6.1-e1', '2-6.1-e2', '2-6.1-e3']],
  ['1B', '6.2', ['1B-IC-19', '1B-IC-20'], ['1b-6.1-e1', '1b-6.1-e2', '1b-6.2-r1', '1b-6.2-e1', '1b-6.1-r1'], ['1b-6.2-e1', '1b-6.2-e2', '1b-6.2-e3']],
  ['2', '6.2', ['2-IC-21', '2-CS-01'], ['2-6.1-e1', '2-6.1-e2', '2-6.2-r1', '2-6.2-e1', '2-6.1-r1'], ['2-6.2-e1', '2-6.2-e2', '2-6.2-e3']],
  ['1B', '6.3', ['1B-IC-21', '1B-AP-14'], ['1b-6.2-e1', '1b-6.2-e2', '1b-6.3-r1', '1b-6.3-e1', '1b-6.2-r1'], ['1b-6.3-e1', '1b-6.3-e2', '1b-6.3-e3']],
  ['2', '6.3', ['2-IC-23', '2-AP-16'], ['2-6.2-e1', '2-6.2-e2', '2-6.3-r1', '2-6.3-e1', '2-6.2-r1'], ['2-6.3-e1', '2-6.3-e2', '2-6.3-e3']],
  ['1B', '7.1', ['1B-AP-13', '1B-AP-16', '1B-AP-11'], ['1b-u7-o1', '1b-7.1-r1', '1b-7.1-e1', '1b-7.1-e2', '1b-7.1-e3'], ['1b-7.1-e1', '1b-7.1-e2', '1b-7.1-e3']],
  ['2', '7.1', ['2-AP-18', '2-AP-13', '2-AP-10'], ['2-u7-o1', '2-7.1-r1', '2-7.1-e1', '2-7.1-e2', '2-7.1-e3'], ['2-7.1-e1', '2-7.1-e2', '2-7.1-e3']],
  ['1B', '7.2', ['1B-AP-15'], [], ['1b-7.2-e1', '1b-7.2-e2', '1b-7.2-e3']],
  ['2', '7.2', ['2-AP-17'], [], ['2-7.2-e1', '2-7.2-e2', '2-7.2-e3']],
  ['1B', '7.3', ['1B-IC-20', '1B-AP-15'], ['1b-7.2-e1', '1b-7.2-e2', '1b-7.3-r1', '1b-7.3-e1', '1b-7.2-r1'], ['1b-7.3-e1', '1b-7.3-e2', '1b-7.3-e3']],
  ['2', '7.3', ['2-AP-15', '2-DA-09', '2-IC-22'], ['2-7.2-e1', '2-7.2-e2', '2-7.3-r1', '2-7.3-e1', '2-7.2-r1'], ['2-7.3-e1', '2-7.3-e2', '2-7.3-e3']],
  ['1B', '7.4', ['1B-AP-17', '1B-AP-14'], ['1b-7.3-e1', '1b-7.3-e2', '1b-7.4-r1', '1b-7.4-e1', '1b-7.3-r1'], ['1b-7.4-e1', '1b-7.4-e2', '1b-7.4-e3']],
  ['2', '7.4', ['2-AP-19', '2-AP-16'], ['2-7.3-e1', '2-7.3-e2', '2-7.4-r1', '2-7.4-e1', '2-7.3-r1'], ['2-7.4-e1', '2-7.4-e2', '2-7.4-e3']],
].map(([band, lesson, csta, warmup, exit]) => ({ band, lesson, csta, warmup, exit }));
const primaries = (band, lesson) => (LESSONS.find(l => l.band === band && l.lesson === lesson) || { csta: [] }).csta;

const KINDS = ['recall', 'apply', 'analyze'];
const USES = { o: 'opener', e: 'exit', r: 'review' };
const BAND_PREFIX = { '1B': '1b', '2': '2' };
// British forms only (the content-lint test's regex also matches "color" and whitelists it; this one never matches US forms)
const UK = /\b(colours?|coloured|colouring|favourites?|grey|labelled|licence|organis(e|ed|ing)|practis(e|ed|ing)|neighbours?|recognis(e|ed|ing)|maths|centre|metres?|behaviours?|honour|catalogue|analys(e|ed|ing)|defence|travelled|modelling|cancelled|jewellery|tyres?|whilst|learnt|spelt|programme)\b/i;
const BAD = [[/\d{7,}/, 'a 7+ digit run'], [/@/, 'an @'], [/\/\/\w[\w.-]*\.\w{2,}/, 'a //host.tld link'], [/https?:/i, 'a URL scheme'], [/\bwww\./i, 'a www. link']];

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort() : [];
const banks = files.map(f => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }));
const bankOf = id => banks.find(b => b.id === id);
const allItems = banks.flatMap(b => b.items.map(it => ({ ...it, bank: b.id, band: b.band })));
const itemById = new Map(allItems.map(it => [it.id, it]));
const stringsOf = it => [it.q, ...it.choices, it.topic];

test('the fourteen banks exist with the contract ids, titles, modes, standards and item counts', () => {
  assert.equal(banks.length, 14, `files in ${DIR}: ${files.join(', ')}`);
  for (const [id, count, tags] of SETS) {
    const b = bankOf(id);
    assert.ok(b, `${id} exists`);
    const [, unit, band] = /^csq-u(\d)-(1b|2)$/.exec(id);
    assert.equal(b.file, `u${unit}-${band}.json`, `${id} is in the file the contract names`);
    assert.equal(b.program, 'cs-quest'); assert.equal(b.kind, 'quiz'); assert.equal(b.unit, +unit); assert.equal(b.band, band === '1b' ? '1B' : '2');
    assert.match(b.title, band === '1b' ? /^CSQ Unit \d · .+ \(3-5\)$/ : /^CSQ Unit \d · .+ \(6-8\)$/);
    assert.ok(b.title.length <= LIMITS.title, `${id} title <= ${LIMITS.title}`);
    assert.deepEqual(b.modes, band === '1b' ? ['quest-race', 'battle', 'board'] : ['battle', 'quest-race', 'board']);
    assert.deepEqual(b.cstaTags, tags, `${id} cstaTags`);
    assert.equal(b.items.length, count, `${id} has ${count} items (plan count plus the review items ${REVIEW_ADDS.filter(x => x.startsWith(`${band}-${unit}.`)).join(', ') || 'none'})`);
    assert.ok(b.items.length <= LIMITS.items);
  }
  assert.equal(allItems.length, SETS.reduce((n, [, c]) => n + c, 0));
  for (const id of REVIEW_ADDS) assert.ok(itemById.has(id), `review item ${id} exists`);
});

test('every item matches the itemSchema: id grammar, lesson, use, kind, secs, lengths, four unique choices, answer index', () => {
  for (const b of banks) {
    const prefix = BAND_PREFIX[b.band];
    for (const it of b.items) {
      const where = `${b.id} ${it.id}`;
      assert.deepEqual(Object.keys(it), ['id', 'lesson', 'use', 'cat', 'topic', 'kind', 'secs', 'q', 'choices', 'answer'], `${where}: exactly the schema's fields, in order`);
      const m = new RegExp(`^${prefix}-(?:(${b.unit}\\.\\d)-([er])(\\d)|u${b.unit}-(o)(\\d))$`).exec(it.id);
      assert.ok(m, `${where}: id is ${prefix}-<lesson>-e<n>, ${prefix}-<lesson>-r<n> or ${prefix}-u${b.unit}-o<n>`);
      const lesson = m[1] || `${b.unit}.1`, letter = m[2] || m[4];
      assert.equal(it.lesson, lesson, `${where}: lesson matches the id (openers belong to the unit's first lesson)`);
      assert.equal(it.use, USES[letter], `${where}: use matches the id letter`);
      assert.ok(KINDS.includes(it.kind), `${where}: kind`);
      assert.ok([15, 20].includes(it.secs) && SECS.includes(it.secs), `${where}: secs 15 or 20`);
      assert.equal(typeof it.q, 'string'); assert.ok(it.q.trim().length >= 8 && it.q.length <= LIMITS.q, `${where}: question 8..${LIMITS.q} chars`);
      assert.ok(Array.isArray(it.choices) && it.choices.length === 4, `${where}: four choices`);
      for (const c of it.choices) assert.ok(typeof c === 'string' && c.trim().length >= 1 && c.length <= LIMITS.choice, `${where}: choice 1..${LIMITS.choice} chars: ${c}`);
      assert.equal(new Set(it.choices.map(c => c.trim().toLowerCase())).size, 4, `${where}: choices are different`);
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 4, `${where}: answer index`);
      assert.ok(typeof it.topic === 'string' && it.topic.length >= 3 && it.topic.length <= LIMITS.cat, `${where}: topic (Brain Board column) 3..${LIMITS.cat} chars`);
      assert.ok(it.cat.length <= LIMITS.cat);
      for (const s of stringsOf(it)) assert.equal(s, s.trim(), `${where}: no stray spaces: ${JSON.stringify(s)}`);
    }
    // the same lesson always shows the same column name on the board
    const topics = new Map();
    for (const it of b.items) { assert.ok(!topics.has(it.lesson) || topics.get(it.lesson) === it.topic, `${b.id}: one topic per lesson (${it.lesson})`); topics.set(it.lesson, it.topic); }
    assert.equal(new Set([...topics.values()]).size, topics.size, `${b.id}: lessons have different column names`);
    // the right answer's slot varies (the plan lists it first for readability only)
    assert.ok(new Set(b.items.map(it => it.answer)).size >= 3, `${b.id}: the right answer sits in at least three different slots`);
  }
  assert.ok(allItems.some(it => it.answer === 3) && allItems.some(it => it.answer === 0), 'every slot is used somewhere');
});

test('cat is a real CSTA id of the bank level and a primary id of the item lesson; bank tags and item tags agree', () => {
  for (const b of banks) {
    const used = new Set();
    for (const it of b.items) {
      const s = BY_ID.get(it.cat);
      assert.ok(s, `${b.id} ${it.id}: ${it.cat} is a CSTA 2017 id`);
      assert.equal(s.level, b.band, `${b.id} ${it.id}: ${it.cat} is level ${b.band}`);
      const prim = primaries(b.band, it.lesson);
      assert.ok(prim.includes(it.cat), `${b.id} ${it.id}: ${it.cat} is a primary id of lesson ${it.lesson} (${prim.join(', ')})`);
      assert.ok(b.cstaTags.includes(it.cat), `${b.id} ${it.id}: ${it.cat} is in the bank's cstaTags`);
      used.add(it.cat);
    }
    for (const tag of b.cstaTags) assert.ok(used.has(tag), `${b.id}: cstaTag ${tag} has at least one item`);
  }
});

test('every lesson warm-up (5) and exit ticket (3) resolves to items of its unit bank; exit items are the lesson own exit items', () => {
  for (const l of LESSONS) {
    const bankId = `csq-u${l.lesson[0]}-${BAND_PREFIX[l.band]}`;
    const b = bankOf(bankId);
    assert.ok(b, `${bankId} for lesson ${l.band} ${l.lesson}`);
    const ids = new Set(b.items.map(it => it.id));
    assert.ok(l.warmup.length === 5 || (l.lesson === '7.2' && l.warmup.length === 0), `${l.band} ${l.lesson}: 5 warm-up items (none for 7.2)`);
    assert.equal(new Set(l.warmup).size, l.warmup.length, `${l.band} ${l.lesson}: warm-up ids differ`);
    for (const id of l.warmup) assert.ok(ids.has(id), `${l.band} ${l.lesson}: warm-up item ${id} exists in ${bankId}`);
    assert.equal(l.exit.length, 3, `${l.band} ${l.lesson}: 3 exit items`);
    for (const id of l.exit) {
      const it = itemById.get(id);
      assert.ok(it && ids.has(id), `${l.band} ${l.lesson}: exit item ${id} exists in ${bankId}`);
      assert.equal(it.lesson, l.lesson, `${id}: an exit item of its own lesson`);
      assert.equal(it.use, 'exit');
    }
    // every exit item of a lesson is on its ticket (e1..e3), and the ticket carries every primary id of the lesson at least once
    assert.deepEqual(b.items.filter(it => it.lesson === l.lesson && it.use === 'exit').map(it => it.id), l.exit, `${l.band} ${l.lesson}: the ticket is e1..e3`);
    const onTicket = new Set(l.exit.map(id => itemById.get(id).cat));
    for (const id of l.csta) assert.ok(onTicket.has(id) || b.items.some(it => it.lesson === l.lesson && it.cat === id), `${l.band} ${l.lesson}: primary id ${id} has an item in the lesson`);
  }
});

test('mastery coverage: at least three bank items per standard id across the program (CA-5)', () => {
  const count = new Map(CSTA.map(s => [s.id, 0]));
  for (const it of allItems) count.set(it.cat, count.get(it.cat) + 1);
  const short = [...count].filter(([, n]) => n < 3).map(([id, n]) => `${id} (${n})`);
  assert.deepEqual(short, [], `ids with fewer than 3 bank items: ${short.join(', ')}`);
  // every id that is a primary of some lesson is tagged in that band (all 44 are primaries somewhere)
  const prim = new Set(LESSONS.flatMap(l => l.csta));
  for (const s of CSTA) assert.ok(prim.has(s.id), `${s.id} is a primary id of some lesson`);
});

test('no duplicate ids anywhere; no duplicate stems inside a bank', () => {
  assert.equal(itemById.size, allItems.length, 'item ids are unique across the program');
  for (const b of banks) {
    const stems = new Map();
    for (const it of b.items) {
      const k = it.q.trim().toLowerCase();
      assert.ok(!stems.has(k), `${b.id}: ${it.id} repeats the stem of ${stems.get(k)}`);
      stems.set(k, it.id);
    }
  }
});

test('kid-safe text: no digit runs, handles or links; US spelling; the real scanner and the live-set filter both accept every bank', () => {
  const all = [];
  for (const b of banks) {
    for (const it of b.items) {
      for (const s of stringsOf(it)) {
        all.push(s);
        for (const [re, why] of BAD) assert.ok(!re.test(s), `${b.id} ${it.id} has ${why}: ${s}`);
        assert.ok(!UK.test(s), `${b.id} ${it.id}: US spelling please: ${s}`);
        assert.ok(!/\btype your password\b/i.test(s), `${b.id} ${it.id}: never "type your password"`);
      }
    }
    all.push(b.title);
    // what the materialiser does (SETS.createSet -> cleanItems): rude words, personal information and link-like text refused
    const c = cleanItems(b.items.map(({ q, choices, answer, secs, cat }) => ({ q, choices, answer, secs, cat })));
    assert.ok(c.ok, `${b.id}: the live-set filter accepts the bank (${c.code} at item ${c.at}: ${c.at != null ? b.items[c.at].id : ''})`);
    assert.equal(c.items.length, b.items.length);
    for (let i = 0; i < c.items.length; i++) { assert.equal(c.items[i].q, b.items[i].q, `${b.id}: ${b.items[i].id} survives the filter unchanged`); assert.deepEqual(c.items[i].choices, b.items[i].choices); assert.equal(c.items[i].cat, b.items[i].cat); }
    // the unit review replaces cat by the lesson's topic: still a valid set
    assert.ok(cleanItems(b.items.map(({ q, choices, answer, secs, topic }) => ({ q, choices, answer, secs, cat: topic }))).ok, `${b.id}: the review set (cat = topic) is valid`);
  }
  // the real game scanner's text rules (profanity in every language, personal-info and family-code prompts, contact info)
  const probe = `<title>T</title><canvas></canvas><script>const S=${JSON.stringify(all)};</script>`;
  const r = scanVersion(probe);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues || r, null, 1));
});
