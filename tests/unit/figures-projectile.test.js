// Projectile motion (docs/figures-api.md "Projectile motion"): the real parabola from the speed, angle, launch height
// and g, drawn to one scale; OF.solve gives the range, greatest height and time of flight; undrawable data is refused.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkGenerator, checkWords, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;

test('the numbers are the physics: range, greatest height, time of flight, from level ground and from a cliff, with g settable', () => {
  const s = OF.solve.projectile({ speed: 20, angle: 45 });
  assert.ok(Math.abs(s.range - 400 / 9.8) < 1e-9); assert.ok(Math.abs(s.maxHeight - 200 / 19.6) < 1e-9); assert.ok(Math.abs(s.time - (2 * 20 * Math.SQRT1_2) / 9.8) < 1e-9);
  const c = OF.solve.projectile({ speed: 12, angle: 0, height: 20, g: 10, positions: 4 });
  assert.ok(Math.abs(c.time - 2) < 1e-12); assert.ok(Math.abs(c.range - 24) < 1e-9); assert.equal(c.maxHeight, 20); assert.equal(c.positions.length, 4);
  assert.ok(Math.abs(c.positions[3].y) < 1e-9 && Math.abs(c.positions[1].x - 12) < 1e-9, 'the last ball lands; equal time steps');
  assert.ok(Math.abs(OF.solve.projectile({ speed: 20, angle: 45, g: 1.62 }).range - 400 / 1.62) < 1e-6, 'the Moon');
  // the path drawn is the parabola: its quadratic curve ends at the range, to one scale across and up
  const svg = OF.svg('projectile', { speed: 20, angle: 45, marks: ['range', 'height'] });
  const m = /class="of-path"/.test(svg) && /d="M ([-\d.]+) ([-\d.]+) Q ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)" [^>]*class="of-path"/.exec(svg);
  const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number);
  assert.ok(Math.abs(y1 - y0) < 0.02, 'lands at the launch height'); assert.ok(Math.abs(cx - (x0 + x1) / 2) < 0.02);
  // a parabola's peak is half way up to its control point: (y0 - cy) / 2 over the range is H / R
  assert.ok(Math.abs(((y0 - cy) / 2) / (x1 - x0) - s.maxHeight / s.range) < 1e-3, 'one scale across and up');
  assert.match(svg, /R = 40\.8 m/); assert.match(svg, /H = 10\.2 m/);
});
test('check: undrawable or wrong data is named and draws the card', () => {
  const cases = [[{ speed: 20, angle: 2 }, /5 to 85/], [{ speed: 20, angle: 90 }, /5 to 85/], [{ speed: 0, angle: 30 }, /speed/], [{ speed: 10, angle: 30, g: 0 }, /"g"/],
    [{ speed: 10, angle: 30, marks: ['cliff'] }, /needs a "height"/], [{ speed: 10, angle: 30, letters: true }, /give "positions"/], [{ speed: 30, angle: 5, height: 0 }, /5 to 85|too flat/],
    [{ speed: 1, angle: 0, height: 500 }, /too tall/], [{ speed: 10, angle: 30, spin: 3 }, /not used/]];
  for (const [d, re] of cases) { assert.match(OF.check('projectile', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('projectile', d), /cannot be drawn/); }
  assert.deepEqual(OF.check('projectile', { speed: 12, angle: 0, height: 20 }), [], 'launched flat off a cliff');
});
test('hide, print and words', async () => {
  const d = { speed: 20, angle: 45, marks: ['range', 'height'], positions: 3, letters: true };
  assert.match(OF.svg('projectile', d, { hide: 'range' }), />R<\/text>/); assert.doesNotMatch(OF.svg('projectile', d, { hide: 'range' }), /R = /);
  const blank = OF.svg('projectile', d, { hide: true });
  assert.doesNotMatch(blank, /of-path/); assert.match(blank, />H<\/text>/);
  assert.ok(PRINT_OK(OF.svg('projectile', d, { print: true })));
  await checkWords(assert, ['projectile']);
  assert.match(OF.svg('projectile', d, { lang: 'de' }), /aria-label="Wurfbewegung"/); assert.match(OF.svg('projectile', d, { lang: 'de' }), /R = 40,8 m/);
});
test('a generator: the range, randomized, its key from OF.solve', async () => { await checkGenerator(assert, 'projectile', s => s.range); });
