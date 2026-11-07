// Tally's Sorting Game for young children (Number Quest fix round A5): a 6-9 year old is never asked to type a
// word, a fraction or a long number (those come as buttons), a typed answer is a short whole number, no prompt
// gives the answer away as a format hint, "1 green ball" is singular, the data strand's shell count says it is
// sorting, and the shell counters look like buttons before they are tapped. The earlier rules stay: no auto-read
// (read only on Listen), no emoji row in the words, and the 20 px gap above Stop.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateItem, generateById } from '../../seed-lessons/number-quest/placement/generator.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANK = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/placement/templates.json'), 'utf8'));

test('words, fractions and long numbers are buttons; only short whole numbers are typed', () => {
  let buttons = 0;
  for (const t of BANK.templates) for (let seed = 1; seed <= 30; seed++) {
    const it = generateItem(t, seed);
    if (it.choices) {
      buttons += it.servedAsPick ? 1 : 0;
      assert.ok(it.choices.some(c => c.value === it.answer), `${t.id}:${seed}`);
    } else {
      assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 100, `${t.id}:${seed}: typed "${it.answer}" (${it.prompt})`);
    }
    assert.doesNotMatch(it.prompt, /Answer like|Answer:|Answer "/, `${t.id}:${seed}: no format line that names the answer (${it.prompt})`);
  }
  assert.ok(buttons > 0);
  // the three the grade named
  const chance = BANK.templates.find(t => /certain, impossible/.test(JSON.stringify(t)) || t.archetype === 'chanceWord');
  if (chance) assert.ok(generateItem(chance, 1).choices, 'a chance word is a button');
  const shape = BANK.templates.find(t => t.archetype === 'shapeName');
  if (shape) assert.ok(generateItem(shape, 1).choices, 'a shape name is a button');
});

test('one green ball, not "1 green balls"; the data strand’s shell count is a sorted pile', () => {
  const sc = BANK.templates.filter(t => t.archetype === 'sortCount');
  let singular = 0;
  for (const t of sc) for (let seed = 1; seed <= 60; seed++) {
    const p = generateItem(t, seed).prompt;
    assert.doesNotMatch(p, /\b1 (red|blue|green) balls\b/, p);
    if (/\b1 green ball\b/.test(p)) singular++;
  }
  assert.ok(singular > 0, 'the singular was exercised');
  for (const t of BANK.templates.filter(t => t.strand === 'data-chance' && t.archetype === 'count')) {
    assert.match(generateItem(t, 2).prompt, /sorted the beach finds into piles/, `${t.id}: a data count says it is sorting`);
  }
  for (const t of BANK.templates.filter(t => t.strand !== 'data-chance' && t.archetype === 'count')) {
    assert.match(generateItem(t, 2).prompt, /^Count the \w+\. How many are there\?$/, t.id);
  }
});

test('the counters look tappable, and the earlier rules hold', () => {
  const css = fs.readFileSync(path.join(ROOT, 'public/css/number-quest.css'), 'utf8');
  const base = /\n\.nq-counter \{([^}]*)\}/.exec(css)[1];
  assert.match(base, /box-shadow: 0 3px 0/, 'a raised button');
  assert.match(base, /border: 2px solid var\(--ink/, 'a solid rim, not a faint line');
  assert.match(base, /opacity: 1/, 'full colour until counted');
  assert.match(css, /\.nq-counter\.is-counted \{ opacity: \.45/, 'only a counted one dims');
  const js = fs.readFileSync(path.join(ROOT, 'public/js/number-quest-placement.js'), 'utf8');
  assert.match(js, /No auto-read: the question is spoken only when the child taps Listen/);
  assert.ok(!/speak\(cur\.item\)/.test(js.slice(js.indexOf('function renderItem'), js.indexOf("$('nq-listen').addEventListener"))), 'renderItem never speaks');
  assert.match(css, /\.nq-stop-row \{ margin: 20px 0 8px; \}/, 'the 20 px gap');
  for (const t of BANK.templates.filter(t => t.archetype === 'count')) assert.doesNotMatch(generateById(t.id, 3).prompt, /\p{Extended_Pictographic}/u, `${t.id}: no emoji row in the words`);
});
