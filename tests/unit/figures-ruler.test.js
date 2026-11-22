// Oomba Figures 1.1.0: the ruler, a reading (docs/figures-api.md "The ruler"). The object's ends sit exactly on their
// marks; a length a student cannot read is refused; hide the value for the student.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';
import { docGens } from './_solid-gens.js';

const OF = globalThis.OombaFigures;
test('reading (ruler): checks, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'reading', {
    good: [{ type: 'ruler', value: 4.3, max: 15, step: 0.1 }, { type: 'ruler', value: 7, max: 15, step: 1 }, { type: 'ruler', value: 4.35, max: 10, step: 0.1 },
      { type: 'ruler', value: [27, 8], max: 6, step: [1, 8], unit: 'in' }, { type: 'ruler', value: 2.5, start: 1, max: 6, step: 0.125, unit: 'in' }, { type: 'ruler', value: 3.5, max: 30, step: 0.5 }],
    bad: [[{ type: 'ruler', value: 4.33, max: 15, step: 0.1 }, /cannot read it/], [{ type: 'ruler', value: 3.3, max: 6, step: 0.25, unit: 'in' }, /on a mark/], [{ type: 'ruler', value: 10, start: 6, max: 15, step: 0.1 }, /runs past the end/],
      [{ type: 'ruler', value: 4, max: 15, step: 0.2 }, /must be 1, 0.5 or 0.1 cm/], [{ type: 'ruler', value: 4, max: 40, step: 1 }, /from 2 to 30/], [{ type: 'ruler', value: 4, max: 15, step: 1, unit: 'mm' }, /"cm" or "in"/],
      [{ type: 'ruler', value: 4, max: 15, step: 1, min: 2 }, /starts at 0/], [{ type: 'ruler', value: 4, max: 15, step: 1, major: 5 }, /does not take "major"/]],
    key: s => s.value, gen: docGens().ruler, title: W => W.ruler,
  });
});
test('ruler: the object sits on its marks, the reading is written as the ruler reads it, the other scales are unchanged', () => {
  const s = OF.svg('reading', { type: 'ruler', value: 4.3, start: 1, max: 15, step: 0.1 });
  const m = /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="of-level"/.exec(s), x0 = 20 + 22, per = 32;
  assert.ok(Math.abs(Number(m[1]) - (x0 + per)) < 0.01 && Math.abs(Number(m[2]) - 4.3 * per) < 0.01, 'from 1 cm to 5.3 cm');
  assert.match(s, />4.3 cm</); assert.match(OF.svg('reading', { type: 'ruler', value: 4.3, max: 15, step: 0.1 }, { hide: 'value' }), />______ cm</);
  assert.match(OF.svg('reading', { type: 'ruler', value: [27, 8], max: 6, step: [1, 8], unit: 'in' }), />3 3\/8 in</);
  assert.deepEqual(OF.solve.reading({ type: 'ruler', value: 2.5, start: 1, max: 6, step: 0.125, unit: 'in' }), { type: 'ruler', value: 2.5, length: 2.5, start: 1, end: 3.5, unit: 'in', text: '2 1/2' });
  assert.equal(count(OF.svg('reading', { type: 'ruler', value: 4, max: 15, step: 0.1 }), 'of-value'), 1);
  assert.equal((OF.svg('reading', { type: 'ruler', value: 4, max: 6, step: [1, 16], unit: 'in' }).match(/<line /g) || []).length, 97, 'every sixteenth marked');
  assert.deepEqual(OF.solve.reading({ type: 'thermometer', value: 23.5, min: -10, max: 50, step: 1 }), { type: 'thermometer', value: 23.5, unit: '°C' });
});
