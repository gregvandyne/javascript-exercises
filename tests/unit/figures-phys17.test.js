// The 1.7.0 kinds (docs/figures-api.md "Physics and the cladogram (1.7.0)"): circular motion, electric and magnetic
// field lines, the lever, torque, the pendulum, springs, the roller coaster and the cladogram. Their answers against the
// textbook formulas, the data they refuse and why, hide keeping each answer back, print in grayscale, their words in
// other languages, and their figure question generators.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
const CAT = await import('../../public/js/figures-catalog.js');
const F = await import('../../server/services/figures.js');

const OF = globalThis.OombaFigures;
const NEW = ['circularMotion', 'fields', 'lever', 'torque', 'pendulum', 'spring', 'rollerCoaster', 'cladogram'];
const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} is not ${b}`);
const S = (k, d) => OF.solve[k](d);
const texts = svg => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));

test('circular motion: a = v²/r, F = mv²/r, the tension at the top and bottom of a vertical circle, a conical pendulum, and the directions', () => {
  const s = S('circularMotion', { radius: 2, speed: 4, mass: 1.5 });
  near(s.acceleration, 8, 'a'); near(s.force, 12, 'F'); near(s.period, Math.PI, 'T'); near(s.omega, 2, 'ω');
  assert.equal(S('circularMotion', { start: 0 }).accelerationDir, 'left'); assert.equal(S('circularMotion', { start: 90 }).velocityDir, 'left');
  assert.equal(S('circularMotion', { start: 90, direction: 'cw' }).velocityDir, 'right'); assert.equal(S('circularMotion', { start: 270 }).accelerationDir, 'up');
  const v = S('circularMotion', { view: 'vertical', radius: 1, speed: 4, mass: 0.5 });
  near(v.contactTop, 0.5 * 16 - 4.9, 'T top'); near(v.contactBottom, 8 + 4.9, 'T bottom'); near(v.minSpeedTop, Math.sqrt(9.8), '√(gr)');
  near(S('circularMotion', { view: 'vertical', held: 'hill', radius: 20, speed: 10, mass: 1200 }).contactTop, 1200 * 9.8 - 1200 * 100 / 20, 'N on a hill');
  const c = S('circularMotion', { view: 'conical', length: 1.5, angle: 30, mass: 0.2 }), th = Math.PI / 6;
  near(c.radius, 0.75, 'r = L sin θ'); near(c.tension, 0.2 * 9.8 / Math.cos(th), 'T = mg/cos θ'); near(c.speed, Math.sqrt(9.8 * 0.75 * Math.tan(th)), 'v'); near(c.period, 2 * Math.PI * Math.sqrt(1.5 * Math.cos(th) / 9.8), 'period');
  assert.match(OF.check('circularMotion', { view: 'vertical', held: 'hill', radius: 5, speed: 10 })[0], /leaves the top of the hill/);
  assert.match(OF.check('circularMotion', { view: 'vertical', radius: 2, speed: 1 })[0], /cannot stay on the circle/);
  assert.match(OF.check('circularMotion', { view: 'conical', radius: 2 })[0], /works its radius out/);
  assert.ok(!texts(OF.svg('circularMotion', { radius: 2, speed: 4 }, { hide: 'values' })).some(t => /4 m\/s|2 m/.test(t)), 'hide values');
});

test('fields: the field at a point (a wire\'s right-hand rule, plates, charges), which point is stronger, attract or repel, and points on a charge refused', () => {
  const w = S('fields', { setup: 'wire', points: [{ name: 'P', x: 0, y: 100 }, { name: 'Q', x: 100, y: 0 }] });
  assert.equal(w.points.P.direction, 'left'); assert.equal(w.points.Q.direction, 'up'); assert.equal(w.field, 'magnetic'); assert.equal(w.stronger, 'same');
  assert.equal(S('fields', { setup: 'wire', current: 'in', points: [{ name: 'P', x: 0, y: 100 }] }).points.P.direction, 'right');
  assert.equal(S('fields', { setup: 'plates', points: [{ name: 'P', x: 0, y: 0 }] }).points.P.direction, 'down');
  assert.equal(S('fields', { setup: 'opposite', points: [{ name: 'P', x: 0, y: 0 }] }).points.P.direction, 'right');
  assert.equal(S('fields', { setup: 'like', points: [{ name: 'P', x: 0, y: 0 }] }).points.P.direction, 'none', 'no field midway between like charges');
  assert.equal(S('fields', { setup: 'charge', sign: '-', points: [{ name: 'P', x: 100, y: 0 }] }).points.P.direction, 'left', 'toward a negative charge');
  near(S('fields', { setup: 'charge', points: [{ name: 'P', x: 100, y: 0 }] }).points.P.strength, 1, 'unit strength 100 away', 1e-6);
  assert.equal(S('fields', { setup: 'charge', points: [{ name: 'P', x: 60, y: 0 }, { name: 'Q', x: 0, y: 120 }] }).stronger, 'P');
  assert.equal(S('fields', { charges: [{ q: 1, x: -130, y: 0 }, { q: -1, x: 130, y: 0 }] }).force, 'attract');
  assert.equal(S('fields', { charges: [{ q: -2, x: -130, y: 0 }, { q: -1, x: 130, y: 0 }] }).force, 'repel');
  assert.match(OF.check('fields', { setup: 'opposite', points: [{ name: 'P', x: -130, y: 0 }] })[0], /on a charge/);
  assert.match(OF.check('fields', { charges: [{ q: 1, x: 0, y: 0 }, { q: 1, x: 30, y: 0 }] })[0], /too close/);
  // the magnet's axis lines run to the figure's edges; hide true draws no lines; signs can be left off
  assert.ok((OF.svg('fields', { setup: 'magnet' }).match(/class="of-line"/g) || []).length >= 10);
  assert.equal((OF.svg('fields', { setup: 'opposite' }, { hide: true }).match(/class="of-line"/g) || []).length, 0);
  assert.equal((OF.svg('fields', { setup: 'magnet' }, { hide: 'signs' }).match(/>N</g) || []).length, 0);
});

test('lever: the effort that balances, the mechanical advantage, the class, masses weighed, and arms that do not suit the class refused', () => {
  const s = S('lever', { class: 1, effortArm: 1.5, loadArm: 0.5, load: 300 });
  near(s.effort, 100, 'effort'); near(s.advantage, 3, 'MA'); assert.equal(s.middle, 'fulcrum');
  const m = S('lever', { class: 2, effortArm: 1.2, loadArm: 0.3, load: 20, loadUnit: 'kg' });
  near(m.weight, 196, 'mg'); near(m.effort, 49, 'effort'); assert.equal(m.class, 2); assert.equal(m.effortDir, 'up');
  assert.equal(S('lever', { class: '3', effortArm: 0.1, loadArm: 0.35, load: 40 }).multiplies, 'distance');
  assert.match(OF.check('lever', { class: 2, effortArm: 0.2, loadArm: 0.5, load: 10 })[0], /class 2/);
  const hidden = texts(OF.svg('lever', { class: 1, effortArm: 1.5, loadArm: 0.5, load: 300 }, { hide: 'effort' }));
  assert.ok(hidden.includes('?') && !hidden.some(t => /100 N/.test(t)), hidden.join());
  assert.ok(texts(OF.svg('lever', { class: 1, effortArm: 1.5, loadArm: 0.5, load: 300 }, { lang: 'de' })).includes('Drehpunkt'));
});

test('torque: torques about a pivot, balance (value and place), two supports, a wall with a cable, and what cannot hold', () => {
  const p = S('torque', { loads: [{ at: 0.3, value: 6 }, { at: 0.9, value: 3 }] });
  assert.equal(p.turns, 'balanced'); near(p.net, 0, 'net'); near(p.pivotForce, 9, 'pivot');
  const q = S('torque', { loads: [{ at: 0.1, value: 4 }, { at: 0.8, value: 2 }] });
  near(q.net, 2 * 0.3 - 4 * 0.4, 'net'); assert.equal(q.turns, 'counterclockwise'); near(q.balanceDistance[2], 0.8, 'x for load 2'); near(q.balanceValue[2], 1.6 / 0.3, 'value for load 2');
  const t = S('torque', { support: 'two', length: 4, loads: [{ at: 1, value: 200, kind: 'resting' }], beam: 100 });
  near(t.forceB, (200 + 200) / 4, 'F_B'); near(t.forceA, 300 - 100, 'F_A');
  const w = S('torque', { support: 'wall', length: 2, loads: [{ at: 1.5, value: 50 }], cableAt: 2, cableAngle: 30 });
  near(w.tension, 75 / (2 * 0.5), 'T'); near(w.wallUp, 50 - 75 * 0.5, 'wall up', 1e-6);
  near(S('torque', { loads: [{ at: 0.2, value: 2, }], valueUnit: 'kg', g: 10 }).weights[1], 20, 'mass to weight');
  assert.match(OF.check('torque', { support: 'two', supportA: 0.5, supportB: 0.5, loads: [] })[0], /same place/);
  assert.match(OF.check('torque', { support: 'wall', cableAt: 0, loads: [{ at: 0.5, value: 2 }] })[0], /at the wall/);
  assert.ok(texts(OF.svg('torque', { loads: [{ at: 0.1, value: 4 }, { at: 0.8, value: 2, distanceLabel: 'x' }] })).includes('x'));
});

test('pendulum: the period, the drop, the speed and energy at the bottom, the tensions', () => {
  const s = S('pendulum', { length: 2, angle: 60, mass: 0.5 });
  near(s.period, 2 * Math.PI * Math.sqrt(2 / 9.8), 'T'); near(s.height, 1, 'h', 1e-12); near(s.speed, Math.sqrt(2 * 9.8), 'v', 1e-12); near(s.energy, 0.5 * 9.8, 'mgh', 1e-12);
  near(s.tensionBottom, 0.5 * 9.8 + 0.5 * 19.6 / 2, 'T at the bottom', 1e-12); assert.equal(s.fastest, 'B');
  assert.match(OF.check('pendulum', { angle: 10 })[0], /15 to 75/);
  assert.match(OF.check('pendulum', { forces: 'components' })[0], /picture "one"/);
  assert.ok(!texts(OF.svg('pendulum', { length: 2, angle: 60, mass: 0.5 }, { hide: true })).some(t => /2 m|0.5 kg|60°/.test(t)));
});

test('springs: F = kx, ½kx², a hanging mass\'s stretch, series and parallel, and the oscillation\'s period', () => {
  const s = S('spring', { k: 200, mass: 2 });
  near(s.extension, 0.098, 'x = mg/k'); near(s.force, 19.6, 'F'); near(s.energy, 0.5 * 200 * 0.098 ** 2, 'E'); near(s.period, 2 * Math.PI * Math.sqrt(2 / 200), 'T');
  near(S('spring', { springs: 2, joined: 'series', k: [100, 300], extension: 0.1 }).k, 75, 'series');
  near(S('spring', { springs: 3, joined: 'parallel', k: 100, extension: 0.1 }).k, 300, 'parallel');
  assert.equal(S('spring', { orientation: 'horizontal', k: 150, extension: -0.1, stretch: -0.3 }).state, 'compressed');
  assert.match(OF.check('spring', { k: 100, mass: 1, extension: 0.2 })[0], /not both/);
  assert.match(OF.check('spring', { picture: 'positions', springs: 2 })[0], /one spring/);
  assert.match(OF.check('spring', { orientation: 'horizontal', object: 'masses' })[0], /only hang/);
});

test('roller coaster: speeds from the conservation of energy, the fastest point, the loop\'s least height, and rough track ends the sums', () => {
  const s = S('rollerCoaster', { points: [{ height: 40 }, { height: 10 }, { height: 25 }, { height: 5 }] });
  near(s.speeds.B, Math.sqrt(2 * 9.8 * 30), 'v at B'); near(s.speeds.C, Math.sqrt(2 * 9.8 * 15), 'v at C'); assert.equal(s.fastest, 'D'); assert.equal(s.slowest, 'A');
  const l = S('rollerCoaster', { points: [{ height: 30 }, { height: 0 }, { height: 0 }, { height: 8 }], loop: { at: 3, radius: 8 } });
  near(l.loopMinHeight, 20, '2.5R'); assert.equal(l.makesLoop, 'yes'); near(l.loopTopSpeed, Math.sqrt(2 * 9.8 * 14), 'top speed');
  assert.equal(S('rollerCoaster', { points: [{ height: 18 }, { height: 0 }, { height: 0 }], loop: { at: 2, radius: 8 } }).makesLoop, 'no');
  const r = S('rollerCoaster', { points: [{ height: 20 }, { height: 5 }, { height: 12 }, { height: 2 }], rough: [2] });
  assert.deepEqual(Object.keys(r.speeds), ['A', 'B'], 'friction past B: no sums');
  assert.deepEqual(Object.keys(S('rollerCoaster', { points: [{ height: 10 }, { height: 20 }, { height: 0 }] }).speeds), ['A'], 'it never gets over the hill');
  near(S('rollerCoaster', { points: [{ height: 10 }, { height: 0 }], speed: 3, mass: 2 }).kinetic.B, 0.5 * 2 * (9 + 196), 'KE');
  assert.match(OF.check('rollerCoaster', { points: [{ height: 1 }] })[0], /2 to 8 points/);
  assert.ok(texts(OF.svg('rollerCoaster', { points: [{ height: 25, mark: 'h' }, { height: 0 }, { height: 0 }], loop: { at: 3, radius: 10 } })).includes('h'));
});

test('cladogram: the setups, ladders and trees, shared traits, the first trait, the outgroup, the boxed questions, and blanks', () => {
  const v = S('cladogram', { setup: 'vertebrates' });
  assert.equal(v.taxa, 7); assert.equal(v.shared.Jaws, 5); assert.equal(v.first, 'Notochord'); assert.equal(v.outgroup, 'Lancelet');
  assert.equal(S('cladogram', { setup: 'vertebrates', mark: [{ trait: 3 }] }).marked.shared, 5);
  const e = S('cladogram', { letters: 6, mark: ['4', '2'] });
  assert.equal(e.marked.earlier, 1); assert.equal(e.marked.firstTrait, '2');
  assert.equal(S('cladogram', { setup: 'letters', mark: ['2', '3'] }).marked.earlier, -1, 'traits on sister branches: neither came first');
  assert.equal(S('cladogram', { setup: 'letters', mark: [{ tip: 2 }] }).marked.sister, 'C');
  assert.equal(S('cladogram', { setup: 'letters', mark: [{ tip: 4 }] }).marked.sister, '', 'D\'s closest relatives are two taxa');
  assert.equal(S('cladogram', { setup: 'letters', mark: [{ tip: 6 }, { tip: 5 }, { tip: 4 }] }).marked.closer, 0);
  const tree = { tree: { trait: '', children: [{ name: 'Fungi' }, { trait: 'Chloroplasts', children: [{ name: 'Algae' }, { name: 'Moss' }] }] } };
  assert.equal(S('cladogram', tree).shared.Chloroplasts, 2);
  assert.match(OF.check('cladogram', { taxa: ['A', 'A'] })[0], /own name/);
  assert.match(OF.check('cladogram', { setup: 'apes', letters: 4 })[0], /one way/);
  assert.match(OF.check('cladogram', { setup: 'apes', mark: ['Hair'] })[0], /not one/);
  const blank = OF.svg('cladogram', { setup: 'vertebrates' }, { hide: 'traits' });
  assert.ok(!texts(blank).includes('Jaws') && texts(blank).includes('3.'), 'numbered blank lines');
  assert.match(OF.svg('cladogram', { setup: 'plants', style: 'rectangular' }, { lang: 'de' }), /aria-label="Stammbaum"/);
});

test('every preset of the new kinds draws on screen and in print, prints in grayscale, and hides each of its parts', () => {
  const GRAY = /^#(?:000000|FFFFFF|333333|CCCCCC|999999|F2F2F2|BBBBBB|EEEEEE|DDDDDD)$/i;
  for (const K of CAT.KINDS.filter(k => NEW.includes(k.id))) {
    assert.ok(K.presets.length >= 3, `${K.id} has presets`);
    for (const d of K.presets) {
      assert.deepEqual(OF.check(K.id, d), [], `${K.id} ${JSON.stringify(d)}`);
      const p = OF.svg(K.id, d, { print: true });
      for (const c of p.match(/#[0-9A-Fa-f]{6}\b/g) || []) assert.match(c, GRAY, `${K.id} prints ${c}`);
      for (const h of K.hide) assert.match(OF.svg(K.id, d, { hide: h }), /^<svg/);
      assert.ok(OF.solve[K.id](d), `${K.id} solves`);
    }
  }
});

test('the generators: every new one deals figures that pass OF.check, its answer is its OF.solve value, and the numbers change', () => {
  for (const K of CAT.KINDS.filter(k => NEW.includes(k.id))) {
    assert.ok(K.gens.length >= 3, `${K.id}: at least three question types`);
    for (const g of K.gens) {
      const seen = new Set();
      for (let seed = 1; seed <= 25; seed++) {
        const r = F.generate(g.id, seed * 104729); assert.ok(r, `${g.id} ${seed}`);
        assert.deepEqual(OF.check(r.kind, r.data), []);
        const raw = F.dealRaw(g.id, seed * 104729);
        if (r.answerType === 'choice') assert.equal(r.correct, Math.round(raw.answer), `${g.id}: the option is OF.solve's`);
        else assert.ok(Math.abs(r.value - raw.answer) <= 0.5 * 10 ** -r.dp + 1e-9, `${g.id}: ${r.value} is the formula's ${raw.answer}`);
        seen.add(r.answer);
      }
      assert.ok(seen.size >= 2, `${g.id} randomized`);
    }
  }
});
