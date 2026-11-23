// Oomba Figures 1.1.0 is split by subject (docs/figures-api.md "The core and its packs"): the core (oomba-figures.js:
// the drawing core, words, math labels, the formula language, the notice, the grid and the registry) and its packs
// (packs/math.js, data.js, physics.js, chem.js, measure.js; since 1.3.0 bio.js, since 1.4.0 econ.js; 1.5.0 adds two chem kinds, 1.6.0 seven more), each a classic script that registers its kinds into the
// core. Each file has its own pinned tag (SRI, crossorigin), the scanner admits a pack only after the core of its
// version, the CSP and the screenshot worker name each pack file, the lock and manifest list each, the server's copy runs
// the core and every pack, and the self-tests fail a page that draws a kind whose pack tag is missing. 1.0.0 (one file)
// is unchanged, and so is 1.1.0 (shipped): pages pinned to either keep working. New builds get the latest (1.6.0).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
const L = await import('../../server/services/figlibs.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { frameCsp } = await import('../../server/services/frame.js');
const { selfTestHtml, canvasTag } = await import('../../server/services/canvaskit.js');
const { PARTS, PACKS, partFile } = await import('../../scripts/build-figures.js');
const { KIND_PACKS, PACK_NAMES } = await import('../../figures/src/core.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = L.FIG_LATEST['oomba-figures'], VRE = V.replace(/\./g, '\\.');
const DIR = path.join(ROOT, 'public/vendor/oomba-figures', V);
const OF = globalThis.OombaFigures;
const sri = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const run = files => { const ctx = vm.createContext({ console: { warn: () => {} } }); for (const f of files) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx); return ctx.OombaFigures; };

test('the packs: every kind in exactly one part, the same seven names everywhere, and nothing but the core in common', () => {
  assert.deepEqual(PACKS, ['math', 'data', 'physics', 'chem', 'bio', 'econ', 'measure']);
  assert.deepEqual([...PACK_NAMES], PACKS); assert.deepEqual([...L.FIG_PACK_NAMES], PACKS);
  assert.deepEqual(Object.keys(L.FIG_LIB_FILES), ['jsxgraph', 'smiles-drawer', 'oomba-figures'], 'the packs map is not one of the libraries');
  assert.deepEqual(L.FIG_LIB_FILES.packs['oomba-figures'], Object.fromEntries(PACKS.map(p => [p, `packs/${p}.js`])));
  assert.deepEqual(OF.kinds, Object.keys(KIND_PACKS), 'with every pack loaded, every kind (in the 1.0.0 order, then the new ones)');
  for (const k of OF.kinds) assert.ok(['core', ...PACKS].includes(OF.packOf(k)), k);
  assert.equal(OF.packOf('nope'), null); assert.equal(OF.packOf('constructor'), null);
  const all = Object.values(PARTS).flat();
  assert.equal(new Set(all).size, all.length, 'each module in one part');
  // the ported modules all land somewhere
  for (const f of fs.readdirSync(path.join(ROOT, 'figures/src/ported')).filter(f => f.endsWith('.js'))) assert.ok(all.includes(`figures/src/ported/${f}`), f);
});

test('the core alone draws the grid, names the pack any other kind needs, and is not frozen shut before the packs load', () => {
  const C = run(['oomba-figures.js']);
  assert.deepEqual([...C.kinds], ['grid']); assert.deepEqual([...C.packs], ['core']);
  assert.match(C.svg('grid', { x: [-5, 5], y: [-5, 5] }), /^<svg /);
  for (const [k, pack] of [['bohr', 'chem'], ['triangle', 'math'], ['barGraph', 'data'], ['freeBody', 'physics'], ['reading', 'measure']]) {
    assert.match(C.check(k, {}).join(), new RegExp(`in the ${pack} pack, which this page does not load: add the ${pack} pack's pinned tag after the Oomba Figures tag`), k);
    assert.match(C.svg(k, {}), /cannot be drawn/, `${k}: a card, never a wrong figure`);
    assert.equal(C[k], undefined, `${k}: no shortcut until its pack loads`);
  }
  // a pack loaded after the core adds its kinds, shortcuts and solvers; the core's own properties stay fixed
  const ctx = vm.createContext({ console: { warn: () => {} } });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'oomba-figures.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'packs/chem.js'), 'utf8'), ctx);
  const F = ctx.OombaFigures;
  assert.deepEqual([...F.kinds], ['grid', ...Object.keys(KIND_PACKS).filter(k => KIND_PACKS[k] === 'chem')]); assert.deepEqual([...F.packs], ['core', 'chem']);
  assert.equal(F.svg('bohr', { element: 'Na' }), OF.svg('bohr', { element: 'Na' }));
  assert.deepEqual([...F.solve.bohrShells(11)], OF.solve.bohrShells(11)); assert.equal(typeof F.bohr, 'function');
  vm.runInContext('OombaFigures.svg = () => "x"; OombaFigures.bohr = null; OombaFigures.solve.halfLife = null', ctx);
  assert.match(F.svg('bohr', { element: 'Na' }), /^<svg /, 'nothing a pack or page adds can replace what is there');
  assert.equal(typeof F.solve.halfLife, 'function');
  // the same pack twice changes nothing; a pack without its core does nothing (and says so)
  vm.runInContext(fs.readFileSync(path.join(DIR, 'packs/chem.js'), 'utf8'), ctx);
  assert.deepEqual([...F.packs], ['core', 'chem']);
  const warned = []; const lone = vm.createContext({ console: { warn: m => warned.push(m) } });
  vm.runInContext(fs.readFileSync(path.join(DIR, 'packs/physics.js'), 'utf8'), lone);
  assert.equal(lone.OombaFigures, undefined); assert.match(warned.join(), new RegExp(`physics pack needs the Oomba Figures ${VRE} tag before it`));
  // the registry refuses a pack that brings a kind that is not its own
  assert.throws(() => vm.runInContext('OombaFigures._core.register("math", { grid: { check: () => [], draw: () => null } })', ctx), /must bring exactly/);
});

test('the core and every pack together draw byte for byte what the source draws', () => {
  const F = run(['oomba-figures.js', ...PACKS.map(p => `packs/${p}.js`)]);
  assert.deepEqual([...F.kinds], OF.kinds); assert.deepEqual([...F.packs], ['core', ...PACKS]);
  assert.deepEqual(Object.keys(F.solve).sort(), Object.keys(OF.solve).sort()); assert.deepEqual(Object.keys(F.data).sort(), Object.keys(OF.data).sort());
  assert.equal(F.svg('lewis', { molecule: 'H2O' }, { print: true }), OF.svg('lewis', { molecule: 'H2O' }, { print: true }));
  assert.deepEqual([...L.figuresKit(V).kinds], [...F.kinds], 'the server\'s copy loads the core and every pack');
  assert.equal(L.figuresKit('1.1.0').svg('numberLine', { from: 0, to: 4, step: [1, 2], every: 2, values: false, size: 'large' }, { print: true }), OF.svg('numberLine', { from: 0, to: 4, step: [1, 2], every: 2, values: false, size: 'large' }, { print: true }), 'canvas-print\'s fixed 1.1.0 number line');
});

test('tags: the core tag, then the pinned pack tags, each with its own SRI and crossorigin; picked from the kinds', () => {
  const core = L.figTag('oomba-figures', V, { packs: [] });
  assert.equal(core, `<script src="/vendor/oomba-figures/${V}/oomba-figures.js" integrity="${sri(fs.readFileSync(path.join(DIR, 'oomba-figures.js')))}" crossorigin="anonymous"></script>`);
  for (const p of PACKS) assert.equal(L.figPackTag(p), `<script src="/vendor/oomba-figures/${V}/packs/${p}.js" integrity="${sri(fs.readFileSync(path.join(DIR, `packs/${p}.js`)))}" crossorigin="anonymous"></script>`, p);
  assert.equal(L.figTag('oomba-figures'), [core, ...PACKS.map(p => L.figPackTag(p))].join('\n'), 'no choice: every pack, in order');
  assert.equal(L.figTag('oomba-figures', V, { kinds: ['reading', 'bohr', 'grid', 'freeBody', 'bohr'] }), [core, L.figPackTag('physics'), L.figPackTag('chem'), L.figPackTag('measure')].join('\n'));
  assert.equal(L.figTag('oomba-figures', V, { kinds: ['grid'] }), core, 'the grid is in the core');
  assert.deepEqual(L.figPacksFor(['triangle', 'histogram', 'nope']), ['math', 'data']);
  assert.equal(L.figTag('oomba-figures', '1.0.0'), `<script src="/vendor/oomba-figures/1.0.0/oomba-figures.js" integrity="${L.FIG_VERSIONS['oomba-figures']['1.0.0']}" crossorigin="anonymous"></script>`, '1.0.0: one file, one tag, as before');
  assert.equal(L.figTag('oomba-figures', '1.0.0', { kinds: ['bohr'] }), L.figTag('oomba-figures', '1.0.0'));
  assert.throws(() => L.figPackTag('biology'), /unknown/); assert.throws(() => L.figPackTag('math', '1.0.0'), /unknown/);
});

test('the lock and the manifest list each pack with its sha256 and SRI, and the kinds it brings', () => {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.core, { file: 'oomba-figures.js', kinds: ['grid'] });
  assert.deepEqual(Object.keys(m.packs), PACKS);
  for (const p of PACKS) {
    const b = fs.readFileSync(path.join(DIR, partFile(p)));
    assert.equal(m.packs[p].file, `packs/${p}.js`); assert.deepEqual(m.packs[p].kinds, Object.keys(KIND_PACKS).filter(k => KIND_PACKS[k] === p));
    assert.deepEqual(m.files[`packs/${p}.js`], { sha256: sha256(b), sri: sri(b) });
    assert.deepEqual(L.FIG_LOCK.files[`oomba-figures/${V}/packs/${p}.js`], { sha256: sha256(b), sri: sri(b) });
    assert.equal(L.FIG_PACKS[V][p], sri(b));
  }
  assert.equal(L.FIG_PACKS['1.0.0'], undefined, '1.0.0 has no packs');
  assert.deepEqual(L.FIG_KIND_PACKS[V], { ...KIND_PACKS });
});

const page = (tags, js = "document.body.append(OF.draw('bohr', { element: 'Na' }))") => `<title>Atoms</title>${tags}<div id="q"></div><script>${js}</script>`;
test('the scanner admits a pinned pack tag only after the core tag of its version, once', () => {
  const core = L.figTag('oomba-figures', V, { packs: [] }), chem = L.figPackTag('chem');
  for (const ok of [core + chem, L.figTag('oomba-figures'), `${L.figTags()}`, core + L.figPackTag('math') + chem]) {
    assert.equal(scanVersion(page(ok)).status, 'pass', JSON.stringify(scanVersion(page(ok)).issues)); assert.deepEqual(L.checkFigures(page(ok)).issues, []);
  }
  assert.deepEqual(L.figurePacks(page(core + L.figPackTag('math') + chem)), ['math', 'chem']);
  assert.deepEqual(L.figureLibs(page(core + chem)), { 'oomba-figures': V }, 'a pack is not a library of its own');
  const h = L.FIG_PACKS[V].chem;
  const bad = [
    [chem + core, new RegExp(`must come after the Oomba Figures ${VRE} tag`)],                                        // before the core
    [chem, /must come after/],                                                                               // no core
    [L.figTag('oomba-figures', '1.0.0') + chem, new RegExp(`must come after the Oomba Figures ${VRE} tag`)],           // another version's core
    [core + chem + chem, /loaded twice/],
    [core + core, /loaded twice/],
    [core + chem.replace(h, L.FIG_PACKS[V].math), /wrong integrity/],                                 // another pack's hash
    [core + chem.replace(h, `sha384-${'A'.repeat(64)}`), /wrong integrity/],
    [core + chem.replace(' crossorigin="anonymous"', ''), /needs crossorigin/],
    [core + chem.replace('></script>', ' defer></script>'), /must be exactly/],
    [core + chem.replace('></script>', '>alert(1)</script>'), /must be exactly/],
    [core + chem.replace('packs/chem.js', 'packs/biology.js'), /pack or version we do not have/],
    [core + chem.replace(`/${V}/`, '/9.9.9/'), /pack or version we do not have/],
    [core + `<script src="/vendor/oomba-figures/${V}/packs/" crossorigin="anonymous"></script>`, /./],
    [core + `<img src="/vendor/oomba-figures/${V}/packs/chem.js">`, /in a way we do not allow/],
  ];
  for (const [b, re] of bad) {
    const r = scanVersion(page(b)), msg = r.issues.map(i => i.message).join(' | ');
    assert.equal(r.status, 'fail', b); assert.match(msg, re, b);
  }
});

test('the frame CSP and the screenshot worker name each pack file, never the packs folder', () => {
  const csp = frameCsp('https://oomba.example'), script = /script-src ([^;]+)/.exec(csp)[1].split(' ');
  for (const p of PACKS) { const u = `/vendor/oomba-figures/${V}/packs/${p}.js`; assert.ok(script.includes(`https://oomba.example${u}`), p); assert.ok(L.figureFile(u), p); }
  assert.ok(!script.some(s => /\/packs\/$/.test(s)), 'no folder');
  for (const f of [`/vendor/oomba-figures/${V}/packs/`, `/vendor/oomba-figures/${V}/packs/x.js`, `/vendor/oomba-figures/${V}/packs/../LICENSE`, '/vendor/oomba-figures/1.0.0/packs/math.js']) assert.equal(L.figureFile(f), null, f);
});

test('a page that draws a kind whose pack tag is missing: named, with the tag to add (activity self-test and the playtest check)', () => {
  const core = L.figTag('oomba-figures', V, { packs: [] });
  assert.deepEqual(L.figureKindsIn("OF.draw('bohr', x); OF.svg(\"titration\"); OF.triangle({}); const f = { kind: 'histogram' }; OF.draw(k)"), ['bohr', 'titration', 'triangle', 'histogram']);
  const miss = L.missingFigurePacks(page(core, "OF.draw('freeBody', d); OF.draw('grid', g)"));
  assert.deepEqual(miss.map(m => [m.pack, m.kinds, m.tag]), [['physics', ['freeBody'], L.figPackTag('physics')]]);
  assert.deepEqual(L.missingFigurePacks(page(core + L.figPackTag('physics'), "OF.draw('freeBody', d)")), []);
  assert.deepEqual(L.missingFigurePacks(page(L.figTag('oomba-figures', '1.0.0'), "OF.draw('freeBody', d)")), [], '1.0.0 is one file');
  // the classroom activity's self-test (the Builder refuses to save it)
  const figQ = { tool: 'figure.number', q: 'What is the reading?', fig: { kind: 'reading', type: 'thermometer', value: 23, min: 0, max: 50, step: 1, hide: 'value' }, answer: 23, unit: '°C', work: ['The reading is 23 °C.'] };
  const act = tags => `<title>R</title>\n${tags}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify({ config: { count: 1 }, task: { title: 'R' }, problems: [figQ] })}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  const bad = selfTestHtml(act(core));
  assert.equal(bad.ok, false); assert.match(bad.problems[0].why, new RegExp(`need the Oomba Figures measure pack: add its pinned tag right after the Oomba Figures tag: <script src="/vendor/oomba-figures/${VRE}/packs/measure\\.js"`));
  assert.deepEqual(selfTestHtml(act(core + '\n' + L.figPackTag('measure'))), { ok: true, problems: [] });
  assert.deepEqual(selfTestHtml(act(L.figTag('oomba-figures', undefined, { kinds: ['reading'] }))), { ok: true, problems: [] });
  assert.deepEqual(selfTestHtml(act(L.figTag('oomba-figures', '1.0.0'))), { ok: true, problems: [] }, 'pages pinned to 1.0.0 work exactly as before');
});

test('1.1.0 (shipped) is frozen: its files are what the lock says, its tags are still admitted, and its frozen copy still draws', () => {
  const D = path.join(ROOT, 'public/vendor/oomba-figures/1.1.0');
  for (const f of ['oomba-figures.js', ...PACKS.filter(p => p !== 'bio' && p !== 'econ').map(p => `packs/${p}.js`), 'LICENSE', 'manifest.json']) assert.equal(sha256(fs.readFileSync(path.join(D, f))), L.FIG_LOCK.files[`oomba-figures/1.1.0/${f}`].sha256, f);
  const t = L.figTag('oomba-figures', '1.1.0', { kinds: ['bohr', 'reading'] });
  assert.match(t, /\/vendor\/oomba-figures\/1\.1\.0\/packs\/chem\.js/); assert.equal(scanVersion(page(t)).status, 'pass');
  const F = L.figuresKit('1.1.0');
  assert.equal(F.version, '1.1.0'); assert.equal(F.kinds.length, 50, 'its 50 kinds, no more');
  assert.equal(F.svg('bohr', { element: 'Na' }), OF.svg('bohr', { element: 'Na' }), 'an old kind draws the same');
});
