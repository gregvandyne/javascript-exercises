// Oomba Figures 1.1.0: angles and parallel lines (docs/figures-api.md "Lines and angles"). Every ray and line is drawn at
// its true direction, so the figure's angles are their measures; a label that states a number states the true one, arcs
// claim equal angles only where they are, a right angle carries its square, and parallel arrows go only on lines that
// are parallel. Black on white in print, its measures left out when hidden, its name in every site language; a figure
// question generator for each kind passes the activity self-test; the frozen 1.1.0 file draws what the source draws.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { FIG_WORDS } from '../../figures/src/words.js';
import { CODES } from '../../server/i18n/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator } from './_geometry-gens.js';

const OF = globalThis.OombaFigures;
const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
const labelText = (s, part) => { const m = new RegExp(`<g class="of-(label|name)" data-part="${part}">(.*?)</g></g>`).exec(s); return m ? [...m[2].matchAll(/>([^<]+)<\/text>/g)].map(x => x[1]).join('') : null; };
const lineEnds = (s, part) => { const m = new RegExp(`<line x1="([-\\d.]+)" y1="([-\\d.]+)" x2="([-\\d.]+)" y2="([-\\d.]+)"[^>]*data-part="${part}"`).exec(s); return m ? m.slice(1).map(Number) : null; };
const dirOf = ([x1, y1, x2, y2]) => (Math.atan2(-(y2 - y1), x2 - x1) * 180) / Math.PI;

const GOOD = {
  angles: [{ rays: [0, 60], angles: [{ from: 0, to: 1 }] }, { rays: [{ dir: 0, name: 'A' }, { dir: 35, name: 'B' }, { dir: 90, name: 'C' }], vertex: 'O', angles: [{ from: 0, to: 1, label: 35 }, { from: 1, to: 2, label: 'x' }, { from: 0, to: 2, label: false }] },
    { rays: [0, 50, 180, 230], angles: [{ from: 0, to: 1, label: 50 }, { from: 2, to: 3, label: 'x' }] }, { rays: [0, 120, 250], angles: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 0 }] }, { rays: [0, 70], angles: [{ from: 1, to: 0, label: true }] }],
  parallelLines: [{}, { numbered: true }, { lines: ['m', 'n', 'p'], transversals: [{ angle: 70, name: 't' }, { angle: 110, at: 2, name: 's' }], angles: [{ line: 'n', transversal: 's', pos: 'below-left', label: true }] },
    { lines: [{ name: 'm' }, { name: 'n', tilt: 8 }], angles: [{ number: 2, label: true }, { number: 6, label: true }] }, { transversals: [{ angle: 90 }], angles: [{ number: 2 }], points: [{ line: 'm', transversal: 't', name: 'A' }] }],
};

test('good data: both kinds listed, no problems, one accessible <svg> and nothing undefined', () => {
  for (const k of ['angles', 'parallelLines']) {
    assert.ok(OF.kinds.includes(k)); assert.equal(typeof OF.solve[k], 'function');
    for (const d of GOOD[k]) {
      assert.deepEqual(OF.check(k, d), [], `${k} ${JSON.stringify(d)}`);
      const s = OF.svg(k, d, { title: 'Lines' });
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"[^>]*role="img" aria-label="Lines"/); assert.match(s, new RegExp(`class="of-fig of-${k}"`));
      assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/, `${k} ${JSON.stringify(d)}`);
    }
  }
});

test('OF.check: data that cannot be drawn, or would say something false, is named and draws the card', () => {
  const cases = [
    ['angles', { rays: [0] }, /"rays" must list 2 to 8/],
    ['angles', { rays: [0, 360] }, /needs a direction "dir" from 0 up to 360/],
    ['angles', { rays: [0, 0] }, /points the same way/],
    ['angles', { rays: [0, 60], angles: [{ from: 0, to: 0 }] }, /two different rays/],
    ['angles', { rays: [0, 60], angles: [{ from: 0, to: 1, label: 50 }] }, /angle 1 is labeled 50 but it is 60°/],
    ['angles', { rays: [0, 40, 80, 130], angles: [{ from: 0, to: 1, arcs: 1 }, { from: 2, to: 3, arcs: 1 }] }, /arcs claim equal angles/],
    ['angles', { rays: [0, 60], drawAs: [0, 70] }, /only goes with notToScale: true/],
    ['angles', { rays: [0, 90], angles: [{ from: 0, to: 1 }], notToScale: true, drawAs: [0, 70] }, /is a right angle, so "drawAs" must draw it as one/],
    ['angles', { rays: [0, 60], color: 'red' }, /does not take "color"/],
    ['parallelLines', { transversals: [{ angle: 5 }] }, /from 10 to 170/],
    ['parallelLines', { angles: [{ number: 9 }] }, /"number" must be 1 to 8/],
    ['parallelLines', { angles: [{ pos: 'over' }] }, /"pos" must be one of/],
    ['parallelLines', { angles: [{ number: 2, label: 60 }] }, /is labeled 60 but it is 65°/],
    ['parallelLines', { angles: [{ number: 2, arcs: 1 }, { number: 1, arcs: 1 }] }, /arcs claim equal angles/],
    ['parallelLines', { lines: [{ name: 'm', arrows: 1 }, { name: 'n', tilt: 8, arrows: 1 }] }, /parallel arrows claim m and n are parallel, but they are not/],
    ['parallelLines', { lines: [{ name: 'm', arrows: 1 }, { name: 'n', arrows: 2 }] }, /parallel arrows on m claim it is parallel to another line with the same arrows/],
    ['parallelLines', { lines: [{ name: 'm' }, { name: 'n', tilt: 40 }] }, /"tilt" .* must be from −30 to 30/],
  ];
  for (const [k, d, re] of cases) {
    assert.match(OF.check(k, d).join('; '), re, `${k} ${JSON.stringify(d)}`);
    assert.match(OF.svg(k, d), /cannot be drawn/); assert.equal(OF.solve[k](d), null);
  }
});

test('to scale: each ray and line at its true direction; parallel lines drawn parallel, a tilted line tilted', () => {
  const s = OF.svg('angles', { rays: [0, 35, 90, 200] });
  [0, 35, 90, 200].forEach((deg, i) => { const d = dirOf(lineEnds(s, `r${i}`)); assert.ok(Math.abs(((d - deg + 540) % 360) - 180) < 0.2, `ray ${i}: ${d}`); });
  const p = OF.svg('parallelLines', { transversals: [{ angle: 65 }] });
  assert.ok(Math.abs(dirOf(lineEnds(p, 'p0')) - dirOf(lineEnds(p, 'p1'))) < 0.01); assert.ok(Math.abs(dirOf(lineEnds(p, 't0')) - 65) < 0.2);
  const t = OF.svg('parallelLines', { lines: [{ name: 'm' }, { name: 'n', tilt: 8 }] });
  assert.ok(Math.abs(dirOf(lineEnds(t, 'p1')) - dirOf(lineEnds(t, 'p0')) - 8) < 0.2);
  assert.equal(count(OF.svg('parallelLines', {}), 'of-arrow'), 2, 'one arrow on each parallel line'); assert.equal(count(t, 'of-arrow'), 0, 'none when a line is tilted');
});

test('OF.solve: measures and relationships', () => {
  const a = OF.solve.angles(GOOD.angles[1]);
  assert.deepEqual(a.angles.map(x => x.measure), [35, 55, 90]); assert.deepEqual(a.pairs[0].relations, ['adjacent', 'complementary']);
  assert.deepEqual(OF.solve.angles(GOOD.angles[2]).pairs[0].relations, ['vertical']);
  assert.deepEqual(OF.solve.angles({ rays: [0, 50, 180], angles: [{ from: 0, to: 1 }, { from: 1, to: 2 }] }).pairs[0].relations, ['adjacent', 'supplementary', 'linear pair']);
  assert.equal(OF.solve.angles(GOOD.angles[4]).angles[0].measure, 290, 'counterclockwise from "from": a reflex angle');
  const p = OF.solve.parallelLines({ angles: [{ number: 2 }, { number: 6 }, { number: 3 }, { number: 7 }, { number: 8 }] });
  assert.equal(p.parallel, true); assert.deepEqual(p.numbered, { 1: 115, 2: 65, 3: 65, 4: 115, 5: 115, 6: 65, 7: 65, 8: 115 });
  const rel = (i, j) => p.pairs.find(x => (x.a === i && x.b === j) || (x.a === j && x.b === i));
  assert.equal(rel(0, 1).relation, 'corresponding'); assert.ok(rel(0, 1).equal); assert.equal(rel(0, 2).relation, 'vertical');
  assert.equal(rel(0, 3).relation, 'alternate exterior'); assert.equal(rel(2, 1).relation, 'alternate interior'); assert.equal(rel(0, 4).relation, 'same-side exterior'); assert.equal(rel(0, 4).sum, 180);
  const np = OF.solve.parallelLines({ lines: [{ name: 'm' }, { name: 'n', tilt: 8 }], angles: [{ number: 2 }, { number: 6 }] });
  assert.equal(np.parallel, false); assert.equal(np.pairs[0].relation, 'corresponding'); assert.equal(np.pairs[0].equal, false, 'not equal when the lines are not parallel');
});

test('what it says: labels as math, a right angle\'s square, numbers on the eight angles', () => {
  const s = OF.svg('angles', GOOD.angles[1]);
  assert.equal(labelText(s, 'a0'), '35°', 'a number on an angle is in degrees'); assert.equal(labelText(s, 'a1'), 'x'); assert.equal(count(s, 'of-square'), 1); assert.equal(labelText(s, 'v'), 'O');
  assert.equal(labelText(OF.svg('angles', GOOD.angles[0]), 'a0'), '60°', 'label true writes the measure');
  const n = OF.svg('parallelLines', { numbered: true });
  for (let i = 1; i <= 8; i++) assert.equal(labelText(n, `n${i}`), String(i));
  assert.equal(labelText(OF.svg('parallelLines', GOOD.parallelLines[2]), 'a0'), '110°');
  assert.equal(count(OF.svg('parallelLines', GOOD.parallelLines[4]), 'of-square'), 1, 'a transversal at 90°');
});

test('print, hide, languages, and the frozen 1.1.0 file', () => {
  const F = figuresKit('1.1.0');
  for (const k of ['angles', 'parallelLines']) for (const d of GOOD[k]) {
    const p = OF.svg(k, d, { print: true });
    assert.doesNotMatch(p, /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1/, `${k}: no Oomba colors in print`); assert.match(p, new RegExp(`of-${k} of-print`));
    assert.equal(F.svg(k, d), OF.svg(k, d)); assert.equal(F.svg(k, d, { print: true, lang: 'fr', hide: true }), OF.svg(k, d, { print: true, lang: 'fr', hide: true }));
  }
  const full = OF.svg('angles', GOOD.angles[1]), hid = OF.svg('angles', GOOD.angles[1], { hide: true });
  assert.equal(count(hid, 'of-label'), 0); assert.equal(count(hid, 'of-name'), count(full, 'of-name')); assert.equal(count(hid, 'of-arc'), count(full, 'of-arc'), 'marks stay');
  assert.equal(labelText(OF.svg('parallelLines', GOOD.parallelLines[2], { hide: 'angles' }), 'a0'), null);
  for (const c of CODES) {
    const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]];
    for (const k of ['angles', 'parallelLines']) { assert.ok(W[k], `${c} ${k}`); assert.ok(OF.svg(k, GOOD[k][0], { lang: c }).includes(`<title>${W[k]}</title>`)); }
  }
  assert.equal(labelText(OF.svg('angles', { rays: [0, 37.5], angles: [{ from: 0, to: 1 }] }, { lang: 'de' }), 'a0'), '37,5°');
  assert.match(figuresKit('1.0.0').check('angles', GOOD.angles[0])[0], /unknown figure/);
});

test('the generators pass the self-test, and every set dealt is a true figure with the key solve() gives', async () => {
  await checkGenerator(assert, 'angles', s => s.angles[1].measure);
  await checkGenerator(assert, 'parallelLines', s => s.angles[1].measure);
});
