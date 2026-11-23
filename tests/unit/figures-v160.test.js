// Oomba Figures 1.6.0 (docs/figures-api.md "Chemistry: seven new figures (1.6.0)"): a new version folder, the core and the
// same seven packs (chem gains chromatography, galvanicCell, phaseDiagram, bondEnergy, equilibrium, rateLaw and vsepr),
// built and locked like 1.5.0. 1.0.0 to 1.5.0 have shipped and never change: their files are byte for byte what the lock
// (and git) say. New builds (the Builder's tags, the Figures product, figuresKit by default) got 1.6.0 until 1.7.0
// (figures-v170.test.js), while a page pinned to an older version keeps its own files. And every figure 1.5.0 drew (each catalog preset and generator figure,
// in every mode) draws the same SVG in 1.6.0, byte for byte, and checks and solves the same.
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

const NEW = ['chromatography', 'galvanicCell', 'phaseDiagram', 'bondEnergy', 'equilibrium', 'rateLaw', 'vsepr'];

test('1.0.0 to 1.5.0 are frozen: every file is what the lock says and what git has at the 1.5.0 release', () => {
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0']) {
    const dir = path.join(ROOT, 'public/vendor/oomba-figures', v), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    for (const f of ['manifest.json', ...Object.keys(m.files)]) {
      const b = fs.readFileSync(path.join(dir, f));
      assert.equal(sha256(b), L.FIG_LOCK.files[`oomba-figures/${v}/${f}`].sha256, `${v}/${f}`);
      let head = null;
      try { head = execFileSync('git', ['show', `6c70dba5:public/vendor/oomba-figures/${v}/${f}`], { cwd: ROOT, maxBuffer: 1 << 26 }); } catch { /* a shallow clone without that commit */ }
      if (head) assert.ok(head.equals(b), `${v}/${f} is byte for byte the shipped file`);
    }
  }
  let shipped = null;
  try { shipped = JSON.parse(execFileSync('git', ['show', '6c70dba5:figures/SHIPPED.json'], { cwd: ROOT }).toString()).files; } catch { /* shallow */ }
  if (shipped) for (const [k, h] of Object.entries(shipped)) assert.deepEqual(L.FIG_LOCK.files[k], h, `${k}: its lock entry is unchanged`);
});

test('1.6.0 shipped and is frozen like 1.5.0: pages pinned to it keep their own files, with the seven new chem kinds (new builds pin the latest: figures-v170.test.js)', () => {
  assert.notEqual(version(), '1.6.0'); assert.equal(L.FIG_LATEST['oomba-figures'], version()); assert.equal(F.OF_VERSION, version());
  assert.deepEqual(Object.keys(L.FIG_PACKS['1.6.0']), ['math', 'data', 'physics', 'chem', 'bio', 'econ', 'measure'], 'no new pack');
  const chem = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.6.0/manifest.json'), 'utf8')).packs.chem.kinds;
  assert.deepEqual(chem.slice(-7), NEW);
  assert.deepEqual(chem.slice(0, -7), JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.5.0/manifest.json'), 'utf8')).packs.chem.kinds, 'the chem pack keeps its kinds');
  for (const p of ['math', 'data', 'physics', 'bio', 'econ', 'measure']) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.6.0/manifest.json'), 'utf8')).packs[p].kinds, JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.5.0/manifest.json'), 'utf8')).packs[p].kinds, `the ${p} pack's kinds are 1.5.0's`);
  assert.deepEqual(L.figPacksFor([...NEW, 'reading'], '1.6.0'), ['chem', 'measure']);
  const t = L.figTag('oomba-figures', '1.6.0', { kinds: ['vsepr'] });
  assert.deepEqual(L.checkFigures(`<title>x</title>${t}<script>OF.draw('vsepr', { molecule: 'NH3' })</script>`).issues, []);
  // a 1.5.0 page knows nothing of the new kinds
  for (const k of NEW) assert.equal(L.figuresKit('1.5.0').kinds.includes(k), false, k);
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0', '1.6.0']) assert.equal(L.figuresKit(v).version, v);
  for (const k of NEW) assert.ok(k.length <= 20, `${k}: a kind name fits the Canvas kit (20 characters)`);
});

const OPTS = [{}, { print: true }, { hide: true }, { lang: 'de' }, { lang: 'he' }, { lang: 'ja', print: true }, { title: 'A figure', width: 300 }];
test('every figure 1.5.0 drew draws the same bytes in 1.6.0, and checks and solves the same', () => {
  const old = L.figuresKit('1.5.0'), now = L.figuresKit('1.6.0'), lg = canvasKit().logic;
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
  // the frozen 1.6.0 file and the source draw the same, its seven new kinds included
  for (const K of CAT.KINDS.filter(k => NEW.includes(k.id))) for (const d of K.presets) for (const o of [{}, { print: true }, { hide: true, lang: 'he' }]) assert.equal(L.figuresKit('1.6.0').svg(K.id, d, o), OF.svg(K.id, d, o), K.id);
  assert.equal(CAT.KINDS.filter(k => NEW.includes(k.id)).length, 7, 'all seven new kinds are in the catalog');
});
