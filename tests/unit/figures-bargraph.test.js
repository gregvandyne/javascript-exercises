// Oomba Figures 1.1.0: the bar graph (docs/figures-api.md "Data displays"). Bars as long as their values on an axis
// from 0, double (grouped) or stacked, a key, hatching in print; labels that state a number must be the value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const ONE = { categories: ['Soccer', 'Tennis', 'Golf'], values: [12, 4, 6], ytitle: 'Students' };
const TWO = { categories: ['Apple', 'Pear'], series: [{ name: 'Boys', values: [8, 5] }, { name: 'Girls', values: [6, 7] }] };
const bars = s => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*class="of-bar"/g)].map(m => m.slice(1).map(Number));

test('barGraph: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'barGraph', {
    good: [ONE, TWO, { ...TWO, stacked: true }, { ...ONE, direction: 'bars', heading: 'Sports' }, { ...ONE, labels: { Tennis: 'x' } }],
    bad: [[{ categories: ['A', 'B'], values: [3] }, /must list 2 numbers/], [{ ...ONE, from: 2 }, /must start at 0/], [{ ...ONE, to: 10 }, /widen it/],
      [{ ...ONE, labels: { Tennis: 5 } }, /Tennis bar is labeled 5 but it is 4/], [{ categories: ['A'], values: [1], series: [] }, /not both/], [{ ...ONE, colour: 'red' }, /does not take "colour"/]],
    key: s => s.total,
  });
});
test('barGraph: heights are the values, the key and the hatching in print, hide', () => {
  const b = bars(OF.svg('barGraph', ONE)); assert.equal(b.length, 3);
  assert.ok(Math.abs(b[0][3] / b[1][3] - 3) < 0.01, 'a bar of 12 is 3 times a bar of 4');
  assert.equal(count(OF.svg('barGraph', TWO), 'of-key'), 1);
  const p = OF.svg('barGraph', { ...TWO, series: [...TWO.series, { name: 'Staff', values: [1, 2] }] }, { print: true });
  assert.match(p, /<pattern id="of-barGraph-[a-z0-9]+-hatch"/); assert.match(p, /fill="url\(#of-barGraph-[a-z0-9]+-hatch\)"/);
  assert.equal(bars(OF.svg('barGraph', ONE, { hide: 'Tennis' })).length, 2, 'a bar left for the student to draw');
  assert.equal(count(OF.svg('barGraph', ONE, { hide: 'values' }), 'of-value'), 0); assert.equal(count(OF.svg('barGraph', ONE), 'of-value'), 3);
  const s = OF.solve.barGraph(TWO); assert.deepEqual(s.values, { Apple: 14, Pear: 12 }); assert.deepEqual(s.most, ['Apple']); assert.equal(s.series[1].total, 13);
});
test('the Builder asks for the data displays, probability figures and the protractor in all 12 languages', async () => {
  const { figureWords } = await import('../../server/builder/figures.js');
  const said = { en: ['a bar graph of pets', 'box and whisker plot', 'stem-and-leaf', 'a Venn diagram', 'two-way table', 'reading a protractor', 'tree diagram for two coins'], es: ['un diagrama de caja', 'diagrama de árbol'], fr: ['un diagramme en boîte', 'arbre de probabilités'],
    de: ['ein Kreisdiagramm', 'Baumdiagramm'], it: ['un istogramma', 'goniometro'], pt: ['um diagrama de caixa', 'transferidor'], nl: ['een boomdiagram', 'gradenboog'], ru: ['гистограмма', 'транспортир'],
    ja: ['箱ひげ図', '分度器'], 'zh-Hant': ['盒鬚圖', '量角器'], ar: ['المدرج التكراري', 'المنقلة'], he: ['דיאגרמת עוגה', 'מד זווית'] };
  for (const [l, ts] of Object.entries(said)) for (const t of ts) assert.ok(figureWords(t), `${l}: ${t}`);
  for (const t of ['Equivalent fractions', 'Spelling words', 'a box of crayons', 'apple pie recipe']) assert.equal(figureWords(t), false, t);
});
