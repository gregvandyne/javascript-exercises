// Oomba Figures 1.2.0 (docs/figures-api.md "Chemistry (1.2.0)"): a new version folder, the core and its five packs,
// built and locked like 1.1.0. 1.0.0 and 1.1.0 have shipped and never change: their files are byte for byte what the
// lock (and git) say. New builds (the Builder's tags, the Figures product, figuresKit by default) get 1.2.0, while a
// page pinned to 1.0.0 or 1.1.0 keeps its own files. And every chemistry and reading figure 1.1.0 could draw draws the
// same SVG in 1.2.0, byte for byte, unless the data uses one of the new options.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
const L = await import('../../server/services/figlibs.js');
const { version } = await import('../../scripts/build-figures.js');
const F = await import('../../server/services/figures.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OF = globalThis.OombaFigures;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

test('1.0.0 and 1.1.0 are frozen: every file is what the lock says and what git has at the 1.1.0 release', () => {
  for (const v of ['1.0.0', '1.1.0']) {
    const dir = path.join(ROOT, 'public/vendor/oomba-figures', v), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const f of ['manifest.json', ...Object.keys(m.files)]) {
      const b = fs.readFileSync(path.join(dir, f));
      assert.equal(sha256(b), L.FIG_LOCK.files[`oomba-figures/${v}/${f}`].sha256, `${v}/${f}`);
      let head = null;
      try { head = execFileSync('git', ['show', `b91541f0:public/vendor/oomba-figures/${v}/${f}`], { cwd: ROOT, maxBuffer: 1 << 26 }); } catch { /* a shallow clone without that commit */ }
      if (head) assert.ok(head.equals(b), `${v}/${f} is byte for byte the shipped file`);
    }
  }
  const shipped = JSON.parse(execFileSync('git', ['show', 'b91541f0:figures/SHIPPED.json'], { cwd: ROOT }).toString()).files;
  for (const [k, h] of Object.entries(shipped)) assert.deepEqual(L.FIG_LOCK.files[k], h, `${k}: its lock entry is unchanged`);
});

test('1.2.0 shipped and is frozen like 1.1.0: pages pinned to it keep their own files (new builds pin 1.3.0: figures-v130.test.js)', () => {
  assert.notEqual(version(), '1.2.0'); assert.equal(L.FIG_LATEST['oomba-figures'], version());
  assert.deepEqual(Object.keys(L.FIG_PACKS['1.2.0']), ['math', 'data', 'physics', 'chem', 'measure']);
  // a page pinned to an older version is still admitted and still runs its own files
  for (const v of ['1.0.0', '1.1.0', '1.2.0']) {
    const t = L.figTag('oomba-figures', v), r = L.checkFigures(`<title>x</title>${t}<script>OF.draw('bohr', { element: 'Na' })</script>`);
    assert.deepEqual(r.issues, [], v); assert.equal(L.figuresKit(v).version, v);
  }
  assert.equal(F.OF_VERSION, version());
  // canvas-print keeps its fixed 1.1.0 number line
  assert.equal(fs.readFileSync(path.join(ROOT, 'server/services/canvas-print.js'), 'utf8').match(/LINE_FIGURES = '([\d.]+)'/)[1], '1.1.0');
});

// Every chemistry and reading figure 1.1.0 drew, in every mode: the same bytes from 1.2.0.
const OLD = {
  bohr: [{ element: 'Na' }, { element: 'Cl', charge: -1 }, { element: 'Mg', charge: 2 }, { element: 'Fe', shells: [2, 8, 14, 2] }, { Z: 1 }, { element: 'Ca' }, { element: 'O', charge: -2 }],
  orbitals: [{ element: 'O' }, { element: 'Fe', charge: 2 }, { element: 'Cr' }, { element: 'Cu', charge: 1 }, { element: 'Kr' }, { element: 'Br', charge: -1 }, { Z: 26, config: true }],
  lewis: [{ molecule: 'H2O' }, { molecule: 'CO2' }, { molecule: 'NH4' }, { molecule: 'OH', style: 'dots' }, { molecule: 'C2H4' }, { atoms: [{ el: 'O', x: 0, y: 0, lone: 2 }, { el: 'O', x: 1.2, y: 0, lone: 2 }], bonds: [{ a: 0, b: 1, order: 2 }] }],
  halfLife: [{ halfLife: 5, start: 80, unit: 'days', yunit: 'g' }, { halfLife: 2.5 }, { halfLife: 10, tmax: 40, marks: false }],
  titration: [{ acid: 'weak', base: 'strong', pKa: 4.76, ca: 0.1, cb: 0.1, v0: 25 }, { acid: 'strong', base: 'strong' }, { acid: 'strong', base: 'weak', flask: 'base' }, { acid: 'strong', base: 'weak', pKb: 4.75 }],
  reading: [{ type: 'thermometer', value: 23.5, min: -10, max: 50, step: 1, major: 10 }, { type: 'cylinder', value: 42, min: 0, max: 100, step: 2 }, { type: 'cylinder', value: 34, min: 0, max: 50, step: 2, major: 10 },
    { type: 'spring', value: 3.5, min: 0, max: 10, step: 0.5, major: 1 }, { type: 'ruler', value: 4.3, start: 0, max: 15, step: 0.1, unit: 'cm' }, { type: 'ruler', value: [27, 8], max: 6, step: [1, 8], unit: 'in' },
    { type: 'caliper', value: 23.45, leastCount: 0.05 }, { type: 'caliper', value: 34.7, leastCount: 0.1, zero: 0.3 }, { type: 'micrometer', value: 7.38 }, { type: 'micrometer', value: 6.384, estimate: true },
    { type: 'spring', value: 1.5, min: 0, max: 5, step: 0.1, major: 1, masses: [100, 50], g: 10 }, { type: 'thermometer', value: 300, min: 270, max: 320, step: 1, unit: 'K' }],
};
const OPTS = [{}, { print: true }, { hide: true }, { hide: 'value' }, { hide: 'electrons' }, { hide: 'nucleus' }, { hide: 'arrows' }, { hide: 'lone' }, { hide: 'marks' }, { lang: 'de' }, { lang: 'he' }, { lang: 'ja', print: true }, { title: 'A figure', width: 300 }];
test('every chemistry and reading figure 1.1.0 drew draws the same bytes in 1.2.0 (and checks and solves the same)', () => {
  const old = L.figuresKit('1.1.0');
  let n = 0;
  for (const [kind, list] of Object.entries(OLD)) for (const d of list) {
    assert.deepEqual([...old.check(kind, d)], [], `${kind} ${JSON.stringify(d)} is a 1.1.0 figure`);
    assert.deepEqual(OF.check(kind, d), [], `${kind} ${JSON.stringify(d)}`);
    for (const o of OPTS) { assert.equal(OF.svg(kind, d, o), old.svg(kind, d, o), `${kind} ${JSON.stringify(d)} ${JSON.stringify(o)}`); n++; }
    if (old.solve[kind]) assert.deepEqual(JSON.parse(JSON.stringify(OF.solve[kind](d))), JSON.parse(JSON.stringify(old.solve[kind](d))), `${kind} solve`);
  }
  for (const s of ['titration', 'halfLife', 'bohrShells', 'config', 'configText']) assert.equal(typeof OF.solve[s], 'function', s);
  assert.equal(OF.solve.titration(OLD.titration[0], 12.5), old.solve.titration(OLD.titration[0], 12.5));
  assert.deepEqual({ ...OF.solve.config('Fe', 2) }, { ...old.solve.config('Fe', 2) });
  assert.ok(n > 500, `${n} figures compared`);
});
