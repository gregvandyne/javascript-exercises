// Tally's Sorting Game (Number Quest fix round A6): the strand the child is shown ("Now showing Tally: Data & Chance")
// matches what the item asks, no wrong answer is impossible (a negative, or 0 where 0 is no one's mistake), and a
// count of one names one thing ("1 loose counter", "1 cup of flour"). Checked over the whole bank and many seeds.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateItem, pluralFix } from '../../seed-lessons/number-quest/placement/generator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/placement/templates.json'), 'utf8'));
const SEEDS = 40;

// What each strand's questions are about: a Shape & Measure item names a shape or a measure, a Data & Chance item
// a chart, graph, sorting, data or chance, and a bare "Which number is greater" belongs to Number only.
const ABOUT = {
  'shape-measure': /shape|side|angle|symmetry|triangle|square|rectangle|hexagon|pentagon|octagon|circle|cm\b|meter|metre|gram|minute|hour|o'clock|cents|area|perimeter|volume|units|cubes|long|fence|garden|liter|litre|kilogram|centimet|millimet|meters|inches|feet|pounds|ounces|°/i,
  'data-chance': /chart|graph|sorted|data|likely|chance|mean|median|bag|spinner|coin is flipped|tally/i,
};
test('every item is labelled with the strand it really asks about', () => {
  for (const t of BANK.templates) for (let seed = 1; seed <= SEEDS; seed++) {
    const it = generateItem(t, seed), where = `${t.id} (${t.strand}) seed ${seed}: "${it.prompt}"`;
    if (ABOUT[t.strand]) assert.match(it.prompt, ABOUT[t.strand], where);
    if (t.strand !== 'number' && t.strand !== 'algebra') assert.doesNotMatch(it.prompt, /^Which number is greater/, where);
    if (t.strand !== 'data-chance') assert.doesNotMatch(it.prompt, /\b(likely|chart|graph)\b/i, where);
  }
});

test('no impossible wrong answer: nothing negative, and no 0 for a positive answer, unless the page has negatives', () => {
  for (const t of BANK.templates) for (let seed = 1; seed <= SEEDS; seed++) {
    const it = generateItem(t, seed);
    if (!it.choices || typeof it.answer !== 'number' || it.answer <= 0 || /(^|[^\d])-\d/.test(it.prompt)) continue;
    for (const c of it.choices) {
      if (typeof c.value !== 'number') continue;
      assert.ok(c.value >= 0, `${t.id}:${seed} "${it.prompt}" offers ${c.value}`);
      assert.ok(c.value > 0, `${t.id}:${seed} "${it.prompt}" offers 0`);
    }
  }
});

test('a count of one names one thing, across the whole bank', () => {
  assert.equal(pluralFix('1 loose counters, 1 more counters, 1 cups of flour, 2 cups'), '1 loose counter, 1 more counter, 1 cup of flour, 2 cups');
  const PLURAL_AFTER_ONE = /\b1 (?:(?:loose|more|red|blue|green|full|equal|unit|cubic|square) )*(counters|cups|balls|marbles|stickers|treats|friends|groups|frames|hours|minutes|apples|pieces|points|seeds|shells|stars|blocks|birds|cubes|squares|sides|layers|rows|piles|notebooks|triangles|hexagons|angles|units|meters|grams|kilograms|cents|dollars|circles)\b/;
  for (const t of BANK.templates) for (let seed = 1; seed <= SEEDS; seed++) {
    const it = generateItem(t, seed);
    assert.doesNotMatch(it.prompt, PLURAL_AFTER_ONE, `${t.id}:${seed}`);
    assert.doesNotMatch(it.prompt, /\ba [aeiou]/i, `${t.id}:${seed}`);
  }
});
