// Figures: a friendlier number line (docs/decisions.md). The editor's forgiving number boxes and the number line's own
// helpers (public/js/figures-nl.js): what a teacher types (negatives, decimals with a point or a comma, fractions, π),
// what is still being typed, the range that widens to fit an interval or a point and "Keep 2 to 5", and every problem
// Oomba Figures can have with a number line placed next to the box or row it is about. Then the drawing itself, for a set
// of lines a teacher makes: ticks evenly spaced and numbered from 0, true minus signs, no float noise, open and closed
// circles, shading between the ends, arrows only where a set runs on. Oomba Figures is frozen (figures/SHIPPED.json):
// these cases check what the shipped number line draws, through the data the editor now hands it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import '../../figures/src/index.js';
import { parseNum, numShown, nlValue, nlWiden, nlFit, nlWhere } from '../../public/js/figures-nl.js';

const OF = globalThis.OombaFigures;
const ROOT = path.resolve(import.meta.dirname, '../..');
const all = (s, re) => [...s.matchAll(re)];
const ticks = s => all(/class="of-ticks">(.*?)<\/g>/.exec(s)[1], /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)"/g).map(m => ({ x: +m[1], major: +m[3] - +m[2] > 12 }));
const nums = s => all(s, /class="of-num">(.*?)<\/g>/g).map(m => all(m[1], />([^<]+)<\/text>/g).map(x => x[1]).join('/'));
const numX = s => all(s, /class="of-num"><text x="([-\d.]+)"/g).map(m => +m[1]);
const ends = s => all(s, /<circle cx="([-\d.]+)"[^>]*class="of-end (of-open|of-closed)"/g).map(m => ({ x: +m[1], open: m[2] === 'of-open' }));
const segs = s => all(s, /class="of-graph">(.*?)<\/g>/g).flatMap(m => all(m[1], /<line x1="([-\d.]+)" y1="[-\d.]+" x2="([-\d.]+)"/g).map(x => [+x[1], +x[2]]));
const rays = s => all(s, /<polygon points="([-\d.]+),[^"]*" fill="[^"]+" class="of-ray"/g).map(m => +m[1]);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: ${a} vs ${b}`);

test('parseNum: negatives (hyphen or true minus), decimals with a point or comma, fractions, π; typing in progress waits', () => {
  for (const [s, v] of [['3', 3], ['-3', -3], ['−3', -3], [' 2.5 ', 2.5], ['2,5', 2.5], ['-.5', -0.5], ['0', 0], ['3/4', [3, 4]], ['-3/4', [-3, 4]], ['8/4', 2], ['10', 10]]) assert.deepEqual(parseNum(s).value, v, s);
  assert.equal(parseNum('3.').value, 3, 'a point on its way to 3.5 draws 3 meanwhile');
  for (const s of ['', '-', '.', '-.', '3/', '-3 / ']) assert.ok(parseNum(s).partial || parseNum(s).empty, `${JSON.stringify(s)} is still being typed`);
  for (const s of ['abc', '3/0', '1e', '--3', '3-']) assert.ok(parseNum(s).bad, `${s} is not a number`);
  assert.ok(parseNum('2π').bad, 'π only where the figure takes it');
  for (const [s, v] of [['2π', { pi: 2 }], ['π', { pi: 1 }], ['-π', { pi: -1 }], ['π/2', { pi: [1, 2] }], ['3pi/4', { pi: [3, 4] }], ['0.5π', { pi: 0.5 }]]) assert.deepEqual(parseNum(s, { pi: true }).value, v, s);
  assert.ok(parseNum('2', { pi: true }).value === 2 && parseNum('π/', { pi: true }).partial);
});

test('numShown: the box shows a value as it is written, with no float noise', () => {
  assert.equal(numShown(-3), '-3'); assert.equal(numShown(0.1 + 0.2), '0.3'); assert.equal(numShown([1, 4]), '1/4'); assert.equal(numShown([-3, 4]), '-3/4');
  assert.equal(numShown({ pi: 2 }), '2π'); assert.equal(numShown({ pi: [1, 2] }), 'π/2'); assert.equal(numShown({ pi: -1 }), '-π'); assert.equal(numShown(undefined), '');
  for (const s of ['-3', '1/4', '2π', 'π/2', '-π', '0.3']) assert.equal(numShown(parseNum(s, { pi: true }).value), s, `round trip ${s}`);
});

test('nlWiden: the owner\'s line (from 2 to 5, an interval from -3 to 4) widens to -3 to 5 on its own ticks and then draws', () => {
  const d = { to: 5, step: 1, every: 1, intervals: [{ from: -3, to: 4, fromClosed: false }], from: 2 };
  assert.match(OF.check('numberLine', d).join(), /-3|−3/, 'Oomba Figures refuses it as it is');
  const w = nlWiden(d);
  assert.deepEqual(w.widened, { from: 2, to: 5, fromData: 2, toData: 5, newFrom: -3, newTo: 5, what: ['interval 1'] });
  assert.equal(w.data.from, -3); assert.equal(w.data.to, 5);
  assert.deepEqual(OF.check('numberLine', w.data), []);
  // on the step's own grid, both ends, points too; fractions stay fractions
  assert.deepEqual([nlWiden({ from: 0, to: 10, step: 2, points: [{ at: -3 }, { at: 13 }] }).data.from, nlWiden({ from: 0, to: 10, step: 2, points: [{ at: -3 }, { at: 13 }] }).data.to], [-4, 14]);
  const q = nlWiden({ from: 0, to: 1, step: [1, 4], points: [{ at: [5, 4] }] });
  assert.deepEqual(q.data.to, [5, 4]); assert.deepEqual(OF.check('numberLine', q.data), []);
  assert.equal(nlWiden({ from: 0.5, to: 2, step: 0.5, points: [{ at: -1.2 }] }).data.from, -1.5);
  // nothing to do, or nothing that can be done: the data is handed back as it is
  for (const d2 of [{ from: 0, to: 5, points: [{ at: 3 }] }, { from: 5, to: 0, points: [{ at: 9 }] }, { from: 0, to: 5, step: 0, points: [{ at: 9 }] }, { from: 0, to: 1, step: 0.01, points: [{ at: 50 }] }, { from: 0, to: { pi: 1 }, step: { pi: [1, 4] }, points: [{ at: 7 }] }]) {
    const r = nlWiden(d2); assert.equal(r.widened, null, JSON.stringify(d2)); assert.equal(r.data, d2);
  }
  // an end that runs off the line (left out) never asks for a wider line
  assert.equal(nlWiden({ from: -5, to: 5, intervals: [{ to: 2 }] }).widened, null);
});

test('nlFit: "Keep 2 to 5" keeps the teacher\'s range and leaves out what does not fit', () => {
  const d = { from: -3, to: 5, intervals: [{ from: -3, to: 4, fromClosed: false }, { from: 3 }], points: [{ at: 1 }, { at: 4, label: 'A' }] };
  const r = nlFit(d, 2, 5);
  assert.equal(r.removed, 2);
  assert.deepEqual(r.data, { from: 2, to: 5, intervals: [{ from: 3 }], points: [{ at: 4, label: 'A' }] });
  assert.deepEqual(OF.check('numberLine', r.data), []);
  assert.deepEqual(nlFit({ from: 0, to: 9, points: [{ at: 8 }] }, 0, 5).data, { from: 0, to: 5 });
});

test('nlWhere: every number line problem goes next to its box or row, in plain words the locales translate', () => {
  const cases = [
    [{ from: 5, to: 1 }, 'to', 'order'], [{ from: 0, to: 5, step: 0 }, 'step', 'stepPositive'], [{ from: 0, to: 5, step: -1 }, 'step', 'stepPositive'],
    [{ from: 0, to: 1, step: 0.3 }, 'step', 'stepFit'], [{ from: 0, to: 1, step: 0.001 }, 'step', 'tooMany'], [{ from: 0, to: 5, every: 1.5 }, 'every', 'every'],
    [{ from: 0, to: 5, every: -1 }, 'every', 'every'], [{ from: 'x', to: 5 }, 'from', 'needNumber'],
    [{ from: 0, to: 5, points: [{ at: 7 }] }, 'point 1', 'past'], [{ from: 0, to: 5, points: [{ label: 'P' }] }, 'point 1', 'needNumber'],
    [{ from: -5, to: 5, intervals: [{ from: -7 }] }, 'interval 1', 'past'], [{ from: -5, to: 5, intervals: [{ from: 3, to: 1 }] }, 'interval 1', 'ivOrder'],
    [{ from: -5, to: 5, intervals: [{ from: 1, to: 2 }, { from: 'a' }] }, 'interval 2', 'needNumber'],
  ];
  for (const [d, at, key] of cases) {
    const p = OF.check('numberLine', d); assert.ok(p.length, JSON.stringify(d));
    const w = nlWhere(p[0]); assert.equal(w.at, at, p[0]); assert.equal(w.key, key, p[0]);
  }
  assert.deepEqual(nlWhere(OF.check('numberLine', { from: -5, to: 5, intervals: [{ from: -7 }] })[0]).vars, { value: '-7' });
  assert.equal(nlWhere(OF.check('numberLine', { from: 0, to: 1, step: 0.001 })[0]).vars.count, 1000);
  assert.equal(nlWhere(OF.check('numberLine', { from: 0, to: 5, sequence: { expr: 'n', to: 6 } })[0]).at, null, 'the sequence (Advanced) stays with the panel');
  // the words exist in English and every translated language, with their placeholders and no em dashes
  const load = c => JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${c}.json`), 'utf8')).js['figures-editor'];
  for (const c of ['en', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) {
    const e = load(c);
    for (const k of ['order', 'stepPositive', 'stepFit', 'tooMany', 'every', 'needNumber', 'past', 'ivOrder']) assert.equal(typeof e.nl.why[k], 'string', `${c} nl.why.${k}`);
    assert.match(e.nl.why.past, /\{value\}/, c); assert.match(e.nl.why.tooMany, /\{count\}/, c); assert.match(e.nl.widened, /\{from\}[\s\S]*\{to\}|\{to\}[\s\S]*\{from\}/, c);
    for (const k of ['typeNumber', 'pm', 'stale', 'showCode', 'codeHelp']) assert.equal(typeof e[k], 'string', `${c} ${k}`);
    assert.doesNotMatch(JSON.stringify({ ...e.nl, typeNumber: e.typeNumber, showCode: e.showCode }), /\u2014/, c);
  }
  assert.equal(nlValue({ pi: [1, 2] }), Math.PI / 2);
});

test('the drawing: ticks, numbers, circles, shading and arrows are right for the lines a teacher makes', () => {
  const draw = d => { assert.deepEqual(OF.check('numberLine', d), [], JSON.stringify(d)); const s = OF.svg('numberLine', d); assert.doesNotMatch(s, /NaN|Infinity|undefined|cannot be drawn/); return s; };
  const xOf = (s, d, v) => { const t = ticks(s); return t[0].x + ((v - d.from) / (d.to - d.from)) * 600; };

  // the owner's line, widened: -3 to 5, -3 < x <= 4 (open at -3, closed at 4, shaded between, no arrows)
  let d = nlWiden({ from: 2, to: 5, step: 1, every: 1, intervals: [{ from: -3, to: 4, fromClosed: false }] }).data, s = draw(d);
  assert.equal(ticks(s).length, 9);
  assert.deepEqual(nums(s), ['−3', '−2', '−1', '0', '1', '2', '3', '4', '5'], 'true minus signs');
  const e = ends(s); assert.equal(e.length, 2);
  near(e[0].x, xOf(s, d, -3), 'open circle at -3'); assert.equal(e[0].open, true);
  near(e[1].x, xOf(s, d, 4), 'closed circle at 4'); assert.equal(e[1].open, false);
  assert.deepEqual(segs(s).map(([a, b]) => [Math.round(a), Math.round(b)]), [[Math.round(xOf(s, d, -3)), Math.round(xOf(s, d, 4))]], 'shaded from -3 to 4 only');
  assert.equal(rays(s).length, 0);
  near(ticks(s)[8].x - ticks(s)[0].x, 600, 'the line is 600 long');
  for (const [i, x] of numX(s).entries()) near(x, ticks(s)[i].x, `number ${i} under its tick`);

  // x >= -2 on -5..5: closed at -2, shaded to an arrow past 5
  d = { from: -5, to: 5, intervals: [{ from: -2 }] }; s = draw(d);
  assert.deepEqual(ends(s).map(x => x.open), [false]); near(ends(s)[0].x, xOf(s, d, -2), 'closed at -2');
  assert.equal(rays(s).length, 1); assert.ok(rays(s)[0] > ticks(s).at(-1).x, 'the arrow is past the last tick, to the right');
  assert.ok(segs(s)[0][1] > ticks(s).at(-1).x, 'the shading runs past 5 to its arrow');

  // x < -1 or x >= 3: two arrows, open at -1, closed at 3
  d = { from: -5, to: 5, intervals: [{ to: -1, toClosed: false }, { from: 3 }] }; s = draw(d);
  assert.deepEqual(ends(s).map(x => x.open), [true, false]); assert.equal(rays(s).length, 2);
  assert.ok(rays(s)[0] < ticks(s)[0].x && rays(s)[1] > ticks(s).at(-1).x, 'one arrow each way');

  // decimals: 0 to 1 by 0.1 (no float noise), numbered every 5th from 0
  s = draw({ from: 0, to: 1, step: 0.1 });
  assert.deepEqual(nums(s), ['0', '0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1']);
  s = draw({ from: -1, to: 0.5, step: 0.1, every: 5 });
  assert.deepEqual(nums(s), ['−1', '−0.5', '0', '0.5']); assert.equal(ticks(s).filter(t => t.major).length, 4, 'numbered ticks are the long ones');

  // fractions: 0 to 2 by quarters, P at 3/4 on its tick, no value given away
  d = { from: 0, to: 2, step: [1, 4], every: 4, points: [{ at: [3, 4], label: 'P' }] }; s = draw(d);
  assert.deepEqual(nums(s), ['0', '1', '2']); assert.equal(ticks(s).length, 9);
  near(ends(s)[0].x, ticks(s)[3].x, 'P on the third quarter');
  s = draw({ from: 0, to: 1, step: [1, 3] }); assert.deepEqual(nums(s), ['0', '1/3', '2/3', '1']);

  // all below 0, and a large range
  assert.deepEqual(nums(draw({ from: -20, to: -10, step: 2 })), ['−20', '−18', '−16', '−14', '−12', '−10']);
  s = draw({ from: 0, to: 1000, step: 10, every: 10 }); assert.equal(ticks(s).length, 101); assert.deepEqual(nums(s), ['0', '100', '200', '300', '400', '500', '600', '700', '800', '900', '1000']);

  // a cross replaces its tick; a point on an interval's end closes that circle
  d = { from: 0, to: 5, points: [{ at: 2, mark: 'cross' }] }; s = draw(d);
  assert.equal(ticks(s).length, 5, 'the tick under the cross is left out'); assert.match(s, /class="of-cross"/);
  s = draw({ from: 0, to: 5, intervals: [{ from: 1, to: 3, toClosed: false }], points: [{ at: 3 }] });
  assert.deepEqual(ends(s).map(x => x.open), [false, false], 'the point fills the open end it sits on');

  // a widened line from a point the teacher typed past the end draws that point on the line
  d = nlWiden({ from: 0, to: 10, step: 1, points: [{ at: 12, label: 'A' }] }).data; s = draw(d);
  assert.equal(d.to, 12); near(ends(s)[0].x, ticks(s).at(-1).x, 'A at 12, the new last tick');
});
