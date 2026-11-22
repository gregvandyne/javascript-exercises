// Motion from segments (docs/figures-api.md "Motion graphs from segments, and motion maps"): the motionGraph extension
// (acceleration-time, and position, velocity and acceleration stacked, all from the same segments) and the motionMap
// kind. They agree with each other because they come from one motion; old motionGraph data draws exactly as in 1.0.0.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator, checkWords, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;
const CART = [{ kind: 'faster', speed: 4, duration: 4 }, { kind: 'forward', speed: 4, duration: 4 }, { kind: 'slower', speed: 0, duration: 4 }, { kind: 'rest', duration: 3 }];

test('motionGraph without the new options draws byte for byte what 1.0.0 drew', () => {
  const F = figuresKit('1.0.0'), data = [
    { type: 'velocity-time', points: [[0, 0], [4, 12], [10, 12]], shade: true }, { type: 'distance-time', points: [[0, 0], [10, 50], [20, 50]], marks: [1, 2] },
    { type: 'displacement-time', points: [[0, 5], [3, -4], [8, 0]], tunit: 'min', yunit: 'km' }, { type: 'velocity-time', points: [[0, 3], [2, 3]], ymax: 10, xstep: 0.5 }];
  for (const d of data) for (const o of [{}, { print: true }, { hide: true }, { hide: 'area' }, { lang: 'ar' }]) assert.equal(OF.svg('motionGraph', d, o), F.svg('motionGraph', d, o), JSON.stringify([d, o]));
  assert.equal(OF.check('motionGraph', { type: 'distance-time', points: [[0, 5], [2, 3]] }).join(), F.check('motionGraph', { type: 'distance-time', points: [[0, 5], [2, 3]] }).join());
});
test('the three graphs agree: position is the area under velocity, acceleration its slope', () => {
  const s = OF.solve.motionGraph({ segments: CART, type: 'velocity-time' });
  assert.deepEqual(s.pieces.map(p => [p.a, p.x1]), [[1, 8], [0, 24], [-1, 32], [0, 32]]);
  assert.equal(s.distance, 32); assert.equal(s.end, 15);
  for (const p of s.pieces) assert.ok(Math.abs(p.x1 - p.x0 - ((p.v0 + p.v1) / 2) * (p.t1 - p.t0)) < 1e-12);
  const back = OF.solve.motionGraph({ segments: [{ kind: 'forward', speed: 2, duration: 3 }, { kind: 'slower', speed: 0, duration: 2 }, { kind: 'faster', speed: 3, duration: 2, dir: 'back' }], start: 5, type: 'position-time' });
  assert.equal(back.finish, 5 + 6 + 2 - 3); assert.equal(back.distance, 6 + 2 + 3); assert.equal(back.displacement, 5);
  const svg = OF.svg('motionGraph', { segments: CART, graphs: ['position', 'velocity', 'acceleration'], marks: true });
  assert.equal((svg.match(/class="of-position"/g) || []).length, 1); assert.equal((svg.match(/class="of-acceleration"/g) || []).length, 4, 'each jump in acceleration breaks the line');
  assert.match(svg, /Acceleration \(m\/s²\)/);
  // the map's dots are the position graph's values at equal times
  const map = OF.solve.motionMap({ segments: CART, dt: 1 });
  for (const q of map.dots) assert.ok(Math.abs(q.x - s.at(q.t).x) < 1e-12);
  assert.deepEqual(map.dots.slice(0, 5).map(q => q.x), [0, 0.5, 2, 4.5, 8]);
});
test('motion map: equal speeds draw equal arrows, twice as fast twice as long; turning back starts a row above', () => {
  const svg = OF.svg('motionMap', { segments: [{ kind: 'forward', speed: 2, duration: 3 }, { kind: 'forward', speed: 4, duration: 3 }], dt: 1 });
  const lens = [...svg.matchAll(/<g class="of-velocity"><g><line x1="([\d.]+)"[^>]*\/><polygon points="([\d.]+),/g)].map(m => +m[2] - +m[1]);
  assert.equal(lens.length, 7); assert.ok(Math.abs(lens[1] - lens[0]) < 0.02 && Math.abs(lens[4] / lens[1] - 2) < 0.02, lens.join());
  const there = OF.svg('motionMap', { segments: [{ kind: 'forward', speed: 2, duration: 3 }, { kind: 'back', speed: 2, duration: 3 }], dt: 1 });
  const ys = new Set([...there.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="5.5"/g)].map(m => m[1]));
  assert.equal(ys.size, 2, 'two rows');
});
test('check: what cannot be drawn truthfully is named', () => {
  const g = [[{ segments: [{ kind: 'forward', speed: 4, duration: 2 }, { kind: 'faster', speed: 3, duration: 2 }], type: 'velocity-time' }, /already moving at 4/],
    [{ type: 'acceleration-time', points: [[0, 0], [1, 1]] }, /drawn from "segments"/], [{ segments: CART, type: 'velocity-time', graphs: ['velocity'] }, /not both/],
    [{ segments: [{ kind: 'back', speed: 2, duration: 2 }], type: 'distance-time' }, /never goes down/], [{ segments: [{ kind: 'zoom', speed: 2, duration: 2 }], type: 'velocity-time' }, /"kind"/],
    [{ segments: CART, graphs: ['position', 'position'] }, /one to three/]];
  for (const [d, re] of g) { assert.match(OF.check('motionGraph', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('motionGraph', d), /cannot be drawn/); }
  const m = [[{ segments: CART, dt: 2 }, /not a whole number of steps/], [{ segments: [{ kind: 'rest', duration: 4 }], dt: 1 }, /never moves/], [{ segments: CART, dt: 0.1 }, /2 to 40 steps/], [{ segments: CART }, /"dt"/]];
  for (const [d, re] of m) { assert.match(OF.check('motionMap', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('motionMap', d), /cannot be drawn/); }
});
test('hide, print and words', async () => {
  const d = { segments: CART, dt: 1, labels: 'times', acceleration: true };
  assert.match(OF.svg('motionMap', d), /of-velocity/); assert.doesNotMatch(OF.svg('motionMap', d, { hide: 'arrows' }), /of-velocity|of-acceleration/);
  assert.doesNotMatch(OF.svg('motionGraph', { segments: CART, type: 'acceleration-time' }, { hide: true }), /of-acceleration/);
  assert.ok(PRINT_OK(OF.svg('motionMap', d, { print: true }))); assert.ok(PRINT_OK(OF.svg('motionGraph', { segments: CART, graphs: ['velocity', 'acceleration'] }, { print: true })));
  await checkWords(assert, ['position', 'acceleration', 'motionMap']);
  assert.match(OF.svg('motionGraph', { segments: CART, type: 'acceleration-time' }, { lang: 'es' }), /Aceleración/);
});
test('generators: the acceleration from a velocity-time graph, and the distance on a motion map', async () => {
  await checkGenerator(assert, 'motionGraph', s => s.pieces[0].a);
  await checkGenerator(assert, 'motionMap', s => s.distance);
});
