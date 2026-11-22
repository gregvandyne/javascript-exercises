// Oomba Figures 1.5.0 (docs/figures-api.md "Chemistry: organic structures and atomic energy levels (1.5.0)"): a new
// version folder, the core and the same seven packs (chem gains skeletal and energyLevels), built and locked like 1.4.0.
// 1.0.0 to 1.4.0 have shipped and never change: their files are byte for byte what the lock (and git) say. New builds
// (the Builder's tags, the Figures product, figuresKit by default) get 1.5.0, while a page pinned to an older version
// keeps its own files. And every figure 1.4.0 drew (each catalog preset and generator figure, in every mode) draws the
// same SVG in 1.5.0, byte for byte, and checks and solves the same.
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

test('1.0.0 to 1.4.0 are frozen: every file is what the lock says and what git has at the 1.4.0 release', () => {
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0']) {
    const dir = path.join(ROOT, 'public/vendor/oomba-figures', v), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const f of ['manifest.json', ...Object.keys(m.files)]) {
      const b = fs.readFileSync(path.join(dir, f));
      assert.equal(sha256(b), L.FIG_LOCK.files[`oomba-figures/${v}/${f}`].sha256, `${v}/${f}`);
      let head = null;
      try { head = execFileSync('git', ['show', `d4d9875e:public/vendor/oomba-figures/${v}/${f}`], { cwd: ROOT, maxBuffer: 1 << 26 }); } catch { /* a shallow clone without that commit */ }
      if (head) assert.ok(head.equals(b), `${v}/${f} is byte for byte the shipped file`);
    }
  }
  let shipped = null;
  try { shipped = JSON.parse(execFileSync('git', ['show', 'd4d9875e:figures/SHIPPED.json'], { cwd: ROOT }).toString()).files; } catch { /* shallow */ }
  if (shipped) for (const [k, h] of Object.entries(shipped)) assert.deepEqual(L.FIG_LOCK.files[k], h, `${k}: its lock entry is unchanged`);
});

test('new builds pin 1.5.0: the latest version, the Builder\'s tags, the Figures product and the server\'s copy; the chem pack has the two new kinds', () => {
  assert.equal(version(), '1.5.0'); assert.equal(L.FIG_LATEST['oomba-figures'], '1.5.0'); assert.equal(OF.version, '1.5.0');
  assert.match(L.figTags(), /\/vendor\/oomba-figures\/1\.5\.0\/oomba-figures\.js/);
  assert.match(L.figTags(), /\/vendor\/oomba-figures\/1\.5\.0\/packs\/chem\.js/);
  assert.doesNotMatch(L.figTags(), /\/1\.4\.0\//);
  assert.equal(F.OF_VERSION, '1.5.0'); assert.equal(L.figuresKit().version, '1.5.0');
  assert.deepEqual(Object.keys(L.FIG_PACKS['1.5.0']), ['math', 'data', 'physics', 'chem', 'bio', 'econ', 'measure'], 'no new pack');
  const chem = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.5.0/manifest.json'), 'utf8')).packs.chem.kinds;
  assert.deepEqual(chem.slice(-2), ['skeletal', 'energyLevels']);
  assert.deepEqual(chem.slice(0, -2), JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.4.0/manifest.json'), 'utf8')).packs.chem.kinds, 'the chem pack keeps its kinds');
  assert.deepEqual(L.figPacksFor(['skeletal', 'energyLevels', 'reading']), ['chem', 'measure']);
  const t = L.figTag('oomba-figures', undefined, { kinds: ['skeletal'] });
  assert.deepEqual(L.checkFigures(`<title>x</title>${t}<script>OF.draw('skeletal', { smiles: 'CCO' })</script>`).issues, []);
  // a 1.4.0 page knows nothing of the new kinds
  assert.equal(L.figuresKit('1.4.0').kinds.includes('skeletal'), false); assert.equal(L.figuresKit('1.4.0').kinds.includes('energyLevels'), false);
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0']) assert.equal(L.figuresKit(v).version, v);
  for (const k of ['skeletal', 'energyLevels']) assert.ok(k.length <= 20, `${k}: a kind name fits the Canvas kit (20 characters)`);
});

const OPTS = [{}, { print: true }, { hide: true }, { lang: 'de' }, { lang: 'he' }, { lang: 'ja', print: true }, { title: 'A figure', width: 300 }];
test('every figure 1.4.0 drew draws the same bytes in 1.5.0, and checks and solves the same', () => {
  const old = L.figuresKit('1.4.0'), now = L.figuresKit('1.5.0'), lg = canvasKit().logic;
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
  // the source and the frozen 1.5.0 file draw the same, the new kinds included
  for (const K of CAT.KINDS.filter(k => ['skeletal', 'energyLevels'].includes(k.id))) for (const d of K.presets) for (const o of [{}, { print: true }]) assert.equal(L.figuresKit('1.5.0').svg(K.id, d, o), OF.svg(K.id, d, o), K.id);
  assert.equal(CAT.KINDS.filter(k => ['skeletal', 'energyLevels'].includes(k.id)).length, 2, 'both new kinds are in the catalog');
});
