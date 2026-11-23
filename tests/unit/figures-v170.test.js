// Oomba Figures 1.7.0 (docs/figures-api.md "Physics and the cladogram (1.7.0)"): a new version folder, the core and the
// same seven packs (physics gains circularMotion, fields, lever, torque, pendulum, spring and rollerCoaster; bio gains
// cladogram), built and locked like 1.5.0. 1.0.0 to 1.5.0 have shipped and never change: their files are byte for byte
// what the lock (and git) say. New builds (the Builder's tags, the Figures product, figuresKit by default) get 1.7.0,
// while a page pinned to an older version keeps its own files. Every figure the previous version drew (each catalog
// preset and generator figure, in every mode) draws the same SVG in 1.7.0, byte for byte, and checks and solves the same.
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
const CAT = await import('../../public/js/figures-catalog.js');
const { canvasKit } = await import('../../server/services/canvaskit.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OF = globalThis.OombaFigures;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const NEW = { physics: ['circularMotion', 'fields', 'lever', 'torque', 'pendulum', 'spring', 'rollerCoaster'], bio: ['cladogram'] };
const ALL_NEW = [...NEW.physics, ...NEW.bio];
const cmpV = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
/** The version before 1.7.0 (1.5.0 on this branch; 1.6.0 once it is merged). */
const PREV = Object.keys(L.FIG_VERSIONS['oomba-figures']).filter(v => cmpV(v, '1.7.0') < 0).sort(cmpV).pop();

test('1.0.0 to 1.5.0 are frozen: every file is what the lock says and what git has at the 1.5.0 release', () => {
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']) {
    const dir = path.join(ROOT, 'public/vendor/oomba-figures', v), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const f of ['manifest.json', ...Object.keys(m.files)]) {
      const b = fs.readFileSync(path.join(dir, f));
      assert.equal(sha256(b), L.FIG_LOCK.files[`oomba-figures/${v}/${f}`].sha256, `${v}/${f}`);
      let head = null;
      try { head = execFileSync('git', ['show', `a87f3fb8:public/vendor/oomba-figures/${v}/${f}`], { cwd: ROOT, maxBuffer: 1 << 26 }); } catch { /* a shallow clone without that commit */ }
      if (head) assert.ok(head.equals(b), `${v}/${f} is byte for byte the shipped file`);
    }
  }
});

test('new builds pin 1.7.0: the latest version, the Builder\'s tags, the Figures product and the server\'s copy; physics and bio have the new kinds', () => {
  assert.equal(version(), '1.7.0'); assert.equal(L.FIG_LATEST['oomba-figures'], '1.7.0'); assert.equal(OF.version, '1.7.0');
  assert.match(L.figTags(), /\/vendor\/oomba-figures\/1\.7\.0\/oomba-figures\.js/);
  assert.match(L.figTags(), /\/vendor\/oomba-figures\/1\.7\.0\/packs\/physics\.js/);
  assert.doesNotMatch(L.figTags(), /\/1\.5\.0\//);
  assert.equal(F.OF_VERSION, '1.7.0'); assert.equal(L.figuresKit().version, '1.7.0');
  assert.deepEqual(Object.keys(L.FIG_PACKS['1.7.0']), ['math', 'data', 'physics', 'chem', 'bio', 'econ', 'measure'], 'no new pack');
  const man = v => JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/oomba-figures/${v}/manifest.json`), 'utf8')).packs;
  for (const [pack, kinds] of Object.entries(NEW)) {
    assert.deepEqual(man('1.7.0')[pack].kinds.slice(-kinds.length), kinds);
    assert.deepEqual(man('1.7.0')[pack].kinds.slice(0, -kinds.length), man(PREV)[pack].kinds, `the ${pack} pack keeps its kinds`);
  }
  assert.deepEqual(L.figPacksFor(['lever', 'cladogram', 'reading']), ['physics', 'bio', 'measure']);
  const t = L.figTag('oomba-figures', undefined, { kinds: ['rollerCoaster'] });
  assert.deepEqual(L.checkFigures(`<title>x</title>${t}<script>OF.draw('rollerCoaster', { points: [{ height: 40 }, { height: 10 }] })</script>`).issues, []);
  for (const k of ALL_NEW) { assert.equal(L.figuresKit(PREV).kinds.includes(k), false, `${PREV} knows nothing of ${k}`); assert.ok(k.length <= 20, `${k} fits the Canvas kit`); }
  for (const v of Object.keys(L.FIG_VERSIONS['oomba-figures'])) assert.equal(L.figuresKit(v).version, v);
});

const OPTS = [{}, { print: true }, { hide: true }, { lang: 'de' }, { lang: 'he' }, { lang: 'ja', print: true }, { title: 'A figure', width: 300 }];
test('every figure the previous version drew draws the same bytes in 1.7.0, and checks and solves the same', () => {
  const old = L.figuresKit(PREV), now = L.figuresKit('1.7.0'), lg = canvasKit().logic;
  let n = 0;
  for (const K of CAT.KINDS) {
    if (!old.kinds.includes(K.id)) continue;
    const figs = K.presets.filter(d => !old.check(K.id, d).length);
    for (const g of K.gens) for (const seed of [3, 77]) { const p = lg.cleanProblem(lg.TOOLS[g.tool].gen(lg.seeded(seed), g)).p; if (p && p.fig) { const { kind, hide, ...d } = p.fig; if (!old.check(kind, d).length) figs.push(d); } }
    for (const d of figs) {
      assert.deepEqual([...now.check(K.id, d)], [], `${K.id} ${JSON.stringify(d)}`);
      for (const o of [...OPTS, ...K.hide.map(h => ({ hide: h }))]) { assert.equal(now.svg(K.id, d, o), old.svg(K.id, d, o), `${K.id} ${JSON.stringify(d)} ${JSON.stringify(o)}`); n++; }
      if (old.solve[K.id]) assert.deepEqual(JSON.parse(JSON.stringify(now.solve[K.id](d))), JSON.parse(JSON.stringify(old.solve[K.id](d))), `${K.id} solve`);
    }
  }
  assert.ok(n > 1000, `${n} figures compared`);
  // the source and the built 1.7.0 file draw the new kinds the same
  for (const K of CAT.KINDS.filter(k => ALL_NEW.includes(k.id))) for (const d of K.presets) for (const o of [{}, { print: true }]) assert.equal(now.svg(K.id, d, o), OF.svg(K.id, d, o), K.id);
  assert.equal(CAT.KINDS.filter(k => ALL_NEW.includes(k.id)).length, 8, 'all eight new kinds are in the catalog');
});
