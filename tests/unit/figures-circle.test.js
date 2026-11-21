// Oomba Figures 1.1.0: the circle (docs/figures-api.md "The circle"). Points at their true directions, so every measure
// on the figure is true (an inscribed angle is half its arc; the angle between chords is half the sum of its arcs;
// tangents from one point are equal); a stated number must be the true angle, arc or length; angles only on drawn lines.
// OF.solve gives circumference, area, arcs, sectors and segments. Print, hide, languages, the frozen file, the generator.
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
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

const INSCRIBED = { points: [{ name: 'A', at: 210 }, { name: 'B', at: 330 }, { name: 'C', at: 100 }], lines: [{ from: 'O', to: 'A' }, { from: 'O', to: 'B' }, { from: 'C', to: 'A' }, { from: 'C', to: 'B' }], angles: [{ at: 'O', from: 'A', to: 'B' }, { at: 'C', from: 'A', to: 'B', label: 'x' }] };
const SECTOR = { radius: 6, unit: 'cm', points: [{ name: 'A', at: 30 }, { name: 'B', at: 130 }], lines: [{ from: 'O', to: 'A', label: true }, { from: 'O', to: 'B' }], angles: [{ at: 'O', from: 'A', to: 'B' }], arcs: [{ from: 'A', to: 'B', length: true }], sectors: [{ from: 'A', to: 'B' }] };
const TANGENTS = { radius: 3, points: [{ name: 'P', at: 0, dist: 2 }], lines: [{ tangentFrom: 'P', side: 'left', touch: 'A', ticks: 1 }, { tangentFrom: 'P', side: 'right', touch: 'B', ticks: 1 }, { from: 'O', to: 'A' }, { from: 'O', to: 'B' }], angles: [{ at: 'P', from: 'A', to: 'B', label: 'x' }, { at: 'O', from: 'A', to: 'B' }] };
const CHORDS = { center: false, centerDot: false, points: [{ name: 'A', at: 150 }, { name: 'B', at: 340 }, { name: 'C', at: 60 }, { name: 'D', at: 230 }], lines: [{ from: 'A', to: 'B' }, { from: 'C', to: 'D' }], crossings: [{ name: 'E', lines: [0, 1] }], angles: [{ at: 'E', from: 'C', to: 'A', label: 'x' }], arcs: [{ from: 'C', to: 'A' }, { from: 'D', to: 'B' }] };
const PARTS = { points: [{ name: 'A', at: 200 }, { name: 'B', at: 20 }, { name: 'C', at: 125 }, { name: 'F', at: 155 }, { name: 'G', at: 45 }, { name: 'H', at: 75 }], lines: [{ from: 'A', to: 'B' }, { from: 'O', to: 'C' }, { tangent: 'F' }, { from: 'G', to: 'H', extend: 'both' }], segments: [{ from: 'G', to: 'H' }] };
const GOOD = [INSCRIBED, SECTOR, TANGENTS, CHORDS, PARTS];

test('good data: no problems, one accessible <svg>, nothing undefined', () => {
  assert.ok(OF.kinds.includes('circle'));
  for (const d of GOOD) {
    assert.deepEqual(OF.check('circle', d), [], JSON.stringify(d));
    const s = OF.svg('circle', d, { title: 'Circle' });
    assert.match(s, /role="img" aria-label="Circle"/); assert.match(s, /class="of-circle"/); assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/);
  }
});

test('OF.check: what cannot be drawn or would lie is named, and draws the card', () => {
  const cases = [
    [{ points: [{ name: 'A' }] }, /"at" must be its direction/],
    [{ points: [{ name: 'A', at: 10 }, { name: 'A', at: 20 }] }, /two places are called A/],
    [{ points: [{ name: 'A', at: 10, dist: 0.5 }], lines: [{ tangent: 'A' }] }, /must name a point on the circle/],
    [{ points: [{ name: 'P', at: 10, dist: 0.5 }], lines: [{ tangentFrom: 'P', side: 'left' }] }, /a point outside the circle/],
    [{ points: [{ name: 'A', at: 10 }], lines: [{ from: 'A', to: 'Z' }] }, /two different places/],
    [{ ...INSCRIBED, angles: [{ at: 'C', from: 'A', to: 'B', label: 70 }] }, /∠ACB is labeled 70 but it is 60°/],
    [{ ...INSCRIBED, angles: [{ at: 'A', from: 'B', to: 'C' }] }, /both its rays must be drawn lines from A/],
    [{ ...SECTOR, arcs: [{ from: 'A', to: 'B', length: true, label: 9 }] }, /arc AB is labeled 9 but it is 10\.47/],
    [{ ...SECTOR, arcs: [{ from: 'A', to: 'B', label: 120 }] }, /arc AB is labeled 120 but it is 100°/],
    [{ ...SECTOR, lines: [{ from: 'O', to: 'A', label: 5 }, { from: 'O', to: 'B' }] }, /OA is labeled 5 but it is 6/],
    [{ ...SECTOR, radius: undefined, arcs: [{ from: 'A', to: 'B', length: true }] }, /needs the circle's "radius"/],
    [{ ...INSCRIBED, lines: [...INSCRIBED.lines.slice(0, 2), { from: 'C', to: 'A', ticks: 1 }, { from: 'C', to: 'B', ticks: 1 }], angles: [] }, /ticks claim equal lengths CA and CB, but they are not/],
    [{ ...CHORDS, crossings: [{ name: 'E', lines: [0, 5] }] }, /crossing 1 must be/],
  ];
  for (const [d, re] of cases) { assert.match(OF.check('circle', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('circle', d), /cannot be drawn/); assert.equal(OF.solve.circle(d), null); }
});

test('the truth of the theorems, from the drawing: inscribed half the central, chords half the arcs, tangents equal', () => {
  const s = OF.solve.circle(INSCRIBED);
  assert.ok(near(s.angles[0], 120)); assert.ok(near(s.angles[1], 60), 'the inscribed angle is half the central angle on the same arc');
  const c = OF.solve.circle(CHORDS);
  assert.ok(near(c.angles[0], (c.arcs[0].degrees + c.arcs[1].degrees) / 2), 'the angle between two chords is half the sum of the arcs they cut off');
  const t = OF.solve.circle(TANGENTS);
  assert.ok(near(t.lines[0].length, t.lines[1].length)); assert.ok(near(t.lines[0].length, 3 * Math.sqrt(3))); assert.ok(near(t.angles[0] + t.angles[1], 180), 'a tangent quadrilateral: P and O add up to 180°');
  assert.equal(count(OF.svg('circle', TANGENTS), 'of-square'), 2, 'radius to tangent: right angles, marked by themselves');
  const sec = OF.solve.circle(SECTOR);
  assert.ok(near(sec.circumference, 12 * Math.PI) && near(sec.area, 36 * Math.PI)); assert.equal(sec.areaPi, 36);
  assert.ok(near(sec.arcs[0].length, (100 / 360) * 12 * Math.PI)); assert.ok(near(sec.sectors[0].area, (100 / 360) * 36 * Math.PI));
  const p = OF.solve.circle({ ...PARTS, radius: 2 });
  assert.deepEqual(p.lines.map(l => l.type), ['diameter', 'radius', 'tangent', 'secant']); assert.ok(near(p.lines[0].length, 4));
  const seg = p.segments[0], th = (30 * Math.PI) / 180; assert.ok(near(seg.area, 2 * (th - Math.sin(th))), 'a segment: sector less triangle');
});

test('what it says, print, hide, languages, the frozen 1.1.0 file, and the generator', async () => {
  const f = OF.svg('circle', SECTOR);
  assert.equal(labelText(f, 'arc0'), '10.5cm'); assert.equal(labelText(f, 'a0'), '100°'); assert.equal(labelText(f, 'l0'), '6cm'); assert.equal(count(f, 'of-shade'), 1);
  assert.equal(labelText(OF.svg('circle', INSCRIBED), 'a1'), 'x'); assert.equal(labelText(OF.svg('circle', CHORDS), 'ptx0'), 'E'); assert.equal(labelText(OF.svg('circle', CHORDS), 'o'), null, 'center: false');
  const F = figuresKit('1.1.0');
  for (const d of GOOD) {
    assert.doesNotMatch(OF.svg('circle', d, { print: true }), /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1|#CFE8D2/);
    assert.equal(F.svg('circle', d, { lang: 'ar' }), OF.svg('circle', d, { lang: 'ar' }));
  }
  const h = OF.svg('circle', SECTOR, { hide: true });
  assert.equal(count(h, 'of-label'), 0); assert.ok(count(h, 'of-name') >= 3); assert.equal(count(h, 'of-arc'), 1, 'the angle\'s arc stays');
  assert.equal(labelText(OF.svg('circle', SECTOR, { hide: 'arcs' }), 'arc0'), null); assert.equal(labelText(OF.svg('circle', SECTOR, { hide: 'arcs' }), 'l0'), '6cm');
  for (const c of CODES) { const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]]; assert.ok(OF.svg('circle', INSCRIBED, { lang: c }).includes(`<title>${W.circle}</title>`), c); }
  assert.equal(labelText(OF.svg('circle', SECTOR, { lang: 'de' }), 'arc0'), '10,5cm');
  await checkGenerator(assert, 'circle', s => s.angles[1]);
});
