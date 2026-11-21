// Oomba Figures 1.1.0: 3D solids (docs/figures-api.md "3D solids and nets"). Prisms, cylinders, pyramids, cones and
// spheres drawn to scale in oblique projection, hidden edges dashed; every stated number true; one way to draw each.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';
import { docGens } from './_solid-gens.js';

const OF = globalThis.OombaFigures;
const G = docGens();
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

test('prism: checks, look-alikes, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'prism', {
    good: [{ length: 8, width: 3, height: 5, unit: 'cm' }, { base: 'right', triBase: 6, triHeight: 8, height: 10, labels: { hyp: true } }, { base: 'regular', sides: 6, side: 4, height: 8, labels: { apothem: true } },
      { length: 6, width: 3, height: 5, oblique: true, lean: 2 }, { length: 5, width: 3, height: 4, names: true }, { base: 'isosceles', triBase: 6, triHeight: 4, height: 9, pose: 'stand', depth: 'left' },
      { length: 20, width: 2, height: 3, notToScale: true, drawAs: { length: 8, width: 3, height: 4 } }, { length: [5, 2], width: { sqrt: 2 }, height: 3, labels: { height: 'x' } }],
    bad: [[{ base: 'regular', sides: 4, side: 3, height: 5 }, /square base is base "rectangle"/], [{ base: 'isosceles', triBase: 4, triHeight: 2, height: 5 }, /right triangle/],
      [{ length: 8, width: 3 }, /give the height/], [{ length: 8, width: 3, height: 5, labels: { length: 9 } }, /labeled 9 but it is 8/], [{ length: 8, width: 3, height: 5, slant: 2 }, /does not take "slant"/],
      [{ length: 6, width: 3, height: 5, lean: 2 }, /goes with oblique/], [{ length: 6, width: 3, height: 5, oblique: true, lean: 2, edge: 9 }, /do not fit together/], [{ length: 100, width: 1, height: 1 }, /too far apart/],
      [{ length: 8, width: 3, height: 5, drawAs: { length: 2 } }, /only goes with notToScale/], [{ length: 2, width: 2, height: 2, cube: true }, /a cube is a prism/]],
    key: s => s.volume, gen: G.prism,
  });
});
test('prism: hidden edges are dashed, the answers are true, oblique faces are worked out from the 3D solid', () => {
  const s = OF.svg('prism', { length: 8, width: 3, height: 5, unit: 'cm' });
  assert.equal((s.match(/<g fill="none" stroke="[^"]+" stroke-width="1.6" stroke-dasharray="6 5" class="of-hidden">(.*?)<\/g>/)[1].match(/<line/g) || []).length, 3, 'a box shows 3 hidden edges');
  assert.match(s, />8</); assert.match(s, />5</);
  assert.doesNotMatch(OF.svg('prism', { length: 8, width: 3, height: 5, hidden: false }), /of-hidden"><line/);
  const p = OF.solve.prism({ length: 8, width: 3, height: 5 });
  assert.deepEqual([p.volume, p.surfaceArea, p.lateralArea, p.baseArea, p.faces, p.edges, p.vertices], [120, 158, 110, 24, 6, 12, 8]);
  const t = OF.solve.prism({ base: 'right', triBase: 6, triHeight: 8, height: 10 });
  assert.ok(near(t.volume, 240) && near(t.surfaceArea, 288) && near(t.values.hyp, 10));
  const o = OF.solve.prism({ length: 6, width: 3, height: 4, oblique: true, lean: 3 });
  assert.ok(near(o.volume, 72) && near(o.edge, 5) && near(o.lateralArea, 2 * 6 * 4 + 2 * 3 * 5), JSON.stringify(o));
  const h = OF.solve.prism({ base: 'regular', sides: 6, side: 4, height: 8 });
  assert.ok(near(h.baseArea, 6 * 4 * 4 * Math.sqrt(3) / 4) && near(h.values.apothem, 2 * Math.sqrt(3)));
  assert.match(OF.svg('prism', { length: 20, width: 2, height: 3, notToScale: true, drawAs: { length: 8, width: 3, height: 4 } }), /Not drawn to scale/);
  assert.equal(count(OF.svg('prism', { length: 5, width: 3, height: 4, names: true }), 'of-name'), 8);
  assert.doesNotMatch(OF.svg('prism', { length: 8, width: 3, height: 5 }, { hide: true }), /of-label/);
});
test('cylinder, cone and sphere: radius or diameter, slant heights true, exact multiples of π', async () => {
  await checkDataKind(assert, OF, 'cylinder', {
    good: [{ radius: 4, height: 10, unit: 'cm' }, { diameter: 12, height: 9 }, { radius: 3, height: 8, oblique: true, lean: 4, leanTo: 'left' }],
    bad: [[{ radius: 4, diameter: 8, height: 3 }, /not both/], [{ radius: 4 }, /give the height/], [{ radius: 4, height: 9, labels: { radius: 5 } }, /labeled 5 but it is 4/]],
    key: s => s.volume, gen: G.cylinder,
  });
  await checkDataKind(assert, OF, 'cone', {
    good: [{ radius: 5, height: 12, unit: 'cm', labels: { slant: true } }, { diameter: 10, slant: 13 }, { radius: 5, height: 12, slant: 13.02 }, { radius: 3, height: 6, oblique: true, lean: 3 }],
    bad: [[{ radius: 5, height: 12, labels: { slant: 14 } }, /labeled 14 but it is 13 \(√\(height² \+ radius²\)\)/], [{ radius: 5, slant: 5 }, /longer than the radius/], [{ radius: 5, height: 12, slant: 14 }, /do not fit together/], [{ radius: 3, oblique: true, lean: 1, height: 4, slant: 5 }, /no single slant height/]],
    key: s => s.volume, gen: G.cone,
  });
  await checkDataKind(assert, OF, 'sphere', {
    good: [{ radius: 6, unit: 'cm' }, { diameter: 14 }, { radius: 5, hemisphere: true }, { radius: 8, hemisphere: true, bowl: true }],
    bad: [[{ radius: 6, bowl: true }, /goes with hemisphere/], [{ radius: -1 }, /must be a length/], [{ radius: 6, height: 2 }, /does not take "height"/]],
    key: s => s.surfaceArea, gen: G.sphere,
  });
  const c = OF.solve.cylinder({ radius: 4, height: 10 });
  assert.deepEqual(c.exact, { volume: { pi: 160 }, baseArea: { pi: 16 }, circumference: { pi: 8 }, lateralArea: { pi: 80 }, surfaceArea: { pi: 112 } }); assert.ok(near(c.volume, 160 * Math.PI));
  assert.equal(OF.solve.cylinder({ radius: 3, height: 8, oblique: true, lean: 4 }).surfaceArea, null, 'no school formula for an oblique cylinder\'s side');
  const k = OF.solve.cone({ radius: 5, height: 12 });
  assert.ok(near(k.slant, 13) && near(k.lateralArea, 65 * Math.PI) && near(k.sectorAngle, 360 * 5 / 13)); assert.deepEqual(k.exact.surfaceArea, { pi: 90 });
  assert.deepEqual(OF.solve.cone({ radius: 4, height: 9 }).exact.lateralArea, { pi: [4, { sqrt: 97 }] });
  assert.deepEqual(OF.solve.sphere({ diameter: 14 }).exact.volume, { pi: { frac: [1372, 3] } });
  const hs = OF.solve.sphere({ radius: 5, hemisphere: true }); assert.ok(near(hs.surfaceArea, 75 * Math.PI) && near(hs.curvedArea, 50 * Math.PI));
  const d = OF.svg('cylinder', { diameter: 12, height: 9, unit: 'in' }); assert.match(d, /data-part="diameter"/); assert.match(d, />12</);
  assert.doesNotMatch(OF.svg('cone', { radius: 5, height: 12, labels: { slant: true } }, { hide: 'slant' }), /data-part="slant"/);
});
test('pyramid: height or slant height, both slant heights of a rectangular base, the generator', async () => {
  await checkDataKind(assert, OF, 'pyramid', {
    good: [{ length: 8, width: 6, height: 9, unit: 'cm' }, { length: 12, width: 12, slant: 10, showHeight: false }, { base: 'regular', sides: 6, side: 6, height: 10, labels: { apothem: true } }, { length: 6, width: 6, height: 5, oblique: true, lean: 3 }],
    bad: [[{ base: "right", length: 3, width: 4, height: 5 }, /"base" must be "rectangle", "regular"/], [{ length: 12, width: 12, slant: 6 }, /longer than half the width/], [{ length: 12, width: 12, height: 8, labels: { slant: 11 } }, /labeled 11 but it is 10/]],
    key: s => s.slant, gen: G.pyramid,
  });
  const p = OF.solve.pyramid({ length: 12, width: 12, slant: 10 });
  assert.ok(near(p.height, 8) && near(p.volume, 384) && near(p.lateralArea, 240) && near(p.surfaceArea, 384));
  const r = OF.solve.pyramid({ length: 8, width: 6, height: 4 }); assert.ok(near(r.slantLength, 5) && near(r.slantWidth, Math.sqrt(32)) && near(r.lateralArea, 40 + 6 * Math.sqrt(32)));
});
