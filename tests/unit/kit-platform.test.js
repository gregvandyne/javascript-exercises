// Oomba Kit on the platform: the built file matches its sources and its pinned SRI, version folders only grow, the
// size gate, the frame CSP, the scanner's pinned-tag rules, the screenshot worker's vendor routing, the /kit preview,
// and a source grep for things the kit must never do.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-kit-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const K = await import('../../server/services/kit.js');
const V = await import('../../server/services/vendor.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { frameCsp, frameDocument } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { bundle, bundlePack, packNames, minify, strip, cssComments, SIZE_CAPS } = await import('../../scripts/build-kit.js');
const { VERSION } = await import('../../kit/src/index.js');
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');

const KIT_DIR = path.join(ROOT, 'public/vendor/oomba-kit');
const sri = buf => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
const dist = v => fs.readFileSync(path.join(KIT_DIR, v, 'oomba-kit.js'));
const codes = html => scanVersion(html).issues.map(i => i.code);
const GAME = (tag, code = 'const s = Oomba.stage({ api: 1 });') => `<title>K</title>${tag}<script>${code}</script>`;

test('every version folder is pinned (and only grows); SRI and manifest match the files on disk', () => {
  const folders = fs.readdirSync(KIT_DIR).filter(f => /^\d+\.\d+\.\d+$/.test(f)).sort();
  assert.deepEqual(Object.keys(K.KIT_VERSIONS).sort(), folders, 'KIT_VERSIONS lists exactly the version folders');
  assert.ok(K.KIT_VERSIONS[K.KIT_LATEST]); assert.equal(K.KIT_LATEST, VERSION);
  for (const v of folders) {
    assert.equal(K.KIT_VERSIONS[v], sri(dist(v)), `${v}: the pinned hash is the file's`);
    const m = JSON.parse(fs.readFileSync(path.join(KIT_DIR, v, 'manifest.json'), 'utf8'));
    assert.equal(m.version, v); assert.equal(m.api, 1);
    for (const [f, h] of Object.entries(m.files)) assert.equal(h, sri(fs.readFileSync(path.join(KIT_DIR, v, f))), `${v}/${f}`);
    assert.match(fs.readFileSync(path.join(KIT_DIR, v, 'fonts/OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/i);
  }
  assert.ok(Object.isFrozen(K.KIT_VERSIONS));
});

const SHIPPED = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/SHIPPED.json'), 'utf8')).versions;
test('shipped versions are locked: their hash in KIT_VERSIONS never changes (kit/SHIPPED.json), and build-kit refuses to replace them', () => {
  for (const [v, h] of Object.entries(SHIPPED)) {
    assert.equal(K.KIT_VERSIONS[v], h, `kit ${v} shipped with ${h}: saved games pin that hash, so it can never change`);
    assert.equal(sri(dist(v)), h, `public/vendor/oomba-kit/${v}/oomba-kit.js changed after it shipped`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/build-kit.js'), 'utf8'), /SHIPPED\.json[\s\S]*has shipped/);
});

test('the built file is up to date with kit/src', async () => {
  const { code } = await bundle(); const min = cssComments((await minify(code)).code);
  const body = dist(VERSION).toString('utf8').replace(/^\/\*![^\n]*\*\/\n/, '');
  assert.equal(body, min, SHIPPED[VERSION]
    ? `kit/src changed but ${VERSION} has shipped: bump the patch version in kit/src/index.js and run node scripts/build-kit.js`
    : `kit/src changed: run node scripts/build-kit.js --replace (${VERSION} has not shipped yet)`);
});

const brot = buf => zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
test('size gate: oomba-kit.js is at most 95 KB brotli, and each art pack is under its own cap', () => {
  assert.equal(SIZE_CAPS.core, 95 * 1024);
  const br = brot(dist(VERSION));
  assert.ok(br <= SIZE_CAPS.core, `core: ${br} bytes brotli`);
  for (const name of packNames()) {
    assert.ok(SIZE_CAPS[name], `pack ${name} has a size cap in scripts/build-kit.js`);
    const b = brot(fs.readFileSync(path.join(KIT_DIR, VERSION, 'packs', name + '.js')));
    assert.ok(b <= SIZE_CAPS[name], `${name}: ${b} bytes brotli (cap ${SIZE_CAPS[name]})`);
  }
});

test('art packs: one pinned file per pack, SRI in KIT_PACKS and the manifest, up to date with kit/packs', async () => {
  const names = packNames();
  assert.deepEqual(names, ['art-animals', 'art-biomes', 'art-biomes-2', 'art-props', 'art-school', 'bridge-3d', 'dress', 'live', 'style-bold']);
  assert.deepEqual(Object.keys(K.KIT_PACKS).sort(), Object.keys(K.KIT_VERSIONS).sort(), 'every version lists its packs');
  assert.ok(Object.isFrozen(K.KIT_PACKS) && Object.isFrozen(K.KIT_PACKS[VERSION]));
  const m = JSON.parse(fs.readFileSync(path.join(KIT_DIR, VERSION, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.packs, names);
  for (const v of Object.keys(K.KIT_PACKS)) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(KIT_DIR, v, 'manifest.json'), 'utf8')).packs, Object.keys(K.KIT_PACKS[v]).sort(), `${v}: KIT_PACKS lists its own packs`);
  for (const n of names) {
    const file = fs.readFileSync(path.join(KIT_DIR, VERSION, 'packs', n + '.js'));
    assert.equal(K.KIT_PACKS[VERSION][n], sri(file), `${n}: the pinned hash is the file's`);
    assert.equal(m.files[`packs/${n}.js`], sri(file));
    const { code } = await minify(bundlePack(n, VERSION));
    assert.equal(file.toString('utf8').replace(/^\/\*![^\n]*\*\/\n/, ''), code, `kit/packs/${n}.js changed: run node scripts/build-kit.js --replace`);
    assert.match(file.toString('utf8'), new RegExp(`version:"${VERSION.replace(/\./g, '\\.')}"`), 'built for this kit version');
    assert.equal(K.kitPackTag(n), `<script src="/vendor/oomba-kit/${VERSION}/packs/${n}.js" integrity="${K.KIT_PACKS[VERSION][n]}" crossorigin="anonymous"></script>`);
  }
  assert.throws(() => K.kitPackTag('art-cars'), /unknown kit pack/);
  // shipped packs are locked like the core (kit/SHIPPED.json packs: version -> name -> sha384)
  const shippedPacks = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/SHIPPED.json'), 'utf8')).packs || {};
  for (const v of Object.keys(SHIPPED)) assert.ok(shippedPacks[v], `kit ${v} shipped: its packs are locked in kit/SHIPPED.json too`);
  for (const [v, packs] of Object.entries(shippedPacks)) for (const [n, h] of Object.entries(packs)) {
    assert.equal(K.KIT_PACKS[v][n], h, `kit ${v} pack ${n} shipped with ${h}`);
    assert.equal(sri(fs.readFileSync(path.join(KIT_DIR, v, 'packs', n + '.js'))), h, `${v} pack ${n} changed after it shipped`);
  }
});

test('scanner: a pack passes only as its exact pinned tag, after the kit tag of the same version', () => {
  const core = K.kitTag(), pack = K.kitPackTag('art-animals');
  assert.deepEqual(codes(GAME(core + pack)).filter(c => c.startsWith('kit') || c === 'external_script'), []);
  assert.deepEqual(codes(GAME(core + K.kitPackTag('art-school') + pack)).filter(c => c.startsWith('kit')), [], 'several packs');
  const bad = {
    before: pack + core,
    alone: pack,
    wrongSri: core + pack.replace(/integrity="[^"]+"/, 'integrity="sha384-AAAA"'),
    noCors: core + pack.replace(' crossorigin="anonymous"', ''),
    extra: core + pack.replace('></script>', ' async></script>'),
    unknown: core + `<script src="/vendor/oomba-kit/${VERSION}/packs/art-cars.js" integrity="${K.KIT_PACKS[VERSION]['art-animals']}" crossorigin="anonymous"></script>`,
    otherVersion: core + `<script src="/vendor/oomba-kit/9.9.9/packs/art-animals.js" integrity="${K.KIT_PACKS[VERSION]['art-animals']}" crossorigin="anonymous"></script>`,
  };
  for (const [name, t] of Object.entries(bad)) assert.ok(codes(GAME(t)).includes('kit_pin'), `${name}: ${codes(GAME(t))}`);
  assert.ok(scanVersion(GAME(pack + core)).issues.find(i => i.code === 'kit_pin').message.includes(core), 'the message gives the order and the exact tags');
  assert.ok(codes(GAME(core, "Oomba.__pk({ name: 'x' }, () => {});")).includes('kit_debug'), 'the pack hook is flagged');
  assert.ok(codes(GAME(core, `const u = '/vendor/oomba-kit/${VERSION}/packs/art-animals.js';`)).includes('kit_tag'));
});

test('a saved game that pins an unlocked pack\'s older hash (the live pack before teams) passes the scanner, counts as live-ready and is served with the current hash', async () => {
  const { hasLivePack } = await import('../../server/services/classlive-lint.js');
  for (const [v, packs] of Object.entries(K.KIT_PACKS_RETIRED)) {
    const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'kit/SHIPPED.json'), 'utf8'));
    for (const [name, olds] of Object.entries(packs)) {
      assert.ok(!(shipped.packs[v] || {})[name], `${v}/${name} is locked in SHIPPED.json: its hash may never change, so it can have no retired hashes`);
      for (const h of olds) {
        assert.notEqual(h, K.KIT_PACKS[v][name]);
        const old = K.kitPackTag(name, v).replace(K.KIT_PACKS[v][name], h);
        const html = GAME(K.kitTag(v) + old);
        assert.deepEqual(codes(html).filter(c => c.startsWith('kit')), [], 'the scanner accepts it');
        const up = K.upgradePackPins(html);
        assert.ok(up.includes(K.kitPackTag(name, v)) && !up.includes(h), 'rewritten to the current tag');
        const doc = frameDocument(html, { user: {}, game: { id: 'g', title: 'g' }, save: {}, canSave: false });
        assert.ok(doc.includes(K.KIT_PACKS[v][name]) && !doc.includes(h), 'the frame serves the current hash');
        if (name === 'live') assert.equal(hasLivePack(html), true);
      }
    }
  }
  // any other wrong hash still fails
  assert.ok(codes(GAME(K.kitTag() + K.kitPackTag('live').replace(/integrity="[^"]+"/, 'integrity="sha384-AAAA"'))).includes('kit_pin'));
});

test('two kits at once: new games get the latest; games pinned to an older shipped kit keep passing and loading', () => {
  const vs = Object.keys(K.KIT_VERSIONS).sort();
  assert.ok(vs.length >= 2 && vs.includes('1.0.0') && K.KIT_LATEST === VERSION && K.KIT_LATEST !== '1.0.0', vs.join(' '));
  assert.ok(K.kitTag().includes(`/oomba-kit/${K.KIT_LATEST}/`), 'kitTag() defaults to the latest');
  assert.ok(K.kitPackTag('dress').includes(`/oomba-kit/${K.KIT_LATEST}/packs/`), 'kitPackTag() too');
  for (const v of vs) {
    // an old saved game: its own kit tag and its own version's packs pass, and kitVersion() reads the pin
    const old = GAME(K.kitTag(v) + K.kitPacks(v).map(n => K.kitPackTag(n, v)).join(''));
    assert.deepEqual(codes(old).filter(c => c.startsWith('kit') || c === 'external_script'), [], v);
    assert.equal(K.kitVersion(old), v);
    assert.equal(vendorFile(`http://game.invalid${K.kitSrc(v)}`), path.join(KIT_DIR, v, 'oomba-kit.js'), `${v} is served`);
  }
  // mixing versions fails: a 1.1.0 pack after the 1.0.0 kit, or a pack that only the newer kit has
  assert.ok(codes(GAME(K.kitTag('1.0.0') + K.kitPackTag('dress'))).includes('kit_pin'), 'packs must match the kit tag');
  const newer = scanVersion(GAME(K.kitTag('1.0.0') + `<script src="/vendor/oomba-kit/1.0.0/packs/art-props.js" integrity="${K.KIT_PACKS[K.KIT_LATEST]['art-props']}" crossorigin="anonymous"></script>`)).issues.find(i => i.code === 'kit_pin');
  assert.ok(newer && newer.message.includes(`came with Oomba Kit ${K.KIT_LATEST}`) && newer.message.includes(K.kitTag()), newer && newer.message);
  assert.deepEqual(Object.keys(K.KIT_PACKS['1.0.0']).sort(), ['art-animals', 'art-biomes', 'art-school', 'dress', 'style-bold'], '1.0.0 keeps exactly the packs it shipped with');
});

test('the frame CSP allows the kit in script-src and font-src (images stay data:/blob: only)', () => {
  const csp = frameCsp('https://oomba.example');
  assert.match(csp.match(/script-src[^;]*/)[0], /https:\/\/oomba\.example\/vendor\/oomba-kit\//);
  assert.match(csp.match(/font-src[^;]*/)[0], /https:\/\/oomba\.example\/vendor\/oomba-kit\//);
  assert.match(csp, /img-src data: blob:;/); assert.match(csp, /connect-src 'none'/);
});

test('scanner: exactly the pinned tag passes; any other kit reference fails with an actionable message', () => {
  const tag = K.kitTag();
  assert.match(tag, /^<script src="\/vendor\/oomba-kit\/\d+\.\d+\.\d+\/oomba-kit\.js" integrity="sha384-[\w+/=]+" crossorigin="anonymous"><\/script>$/);
  const ok = scanVersion(GAME(tag));
  assert.deepEqual(ok.issues.filter(i => i.level === 'fail'), [], JSON.stringify(ok.issues));
  // attributes in another order / quoting are the same tag
  assert.deepEqual(codes(GAME(`<script crossorigin=anonymous integrity='${K.KIT_VERSIONS[VERSION]}' src="${K.kitSrc()}"></script>`)).filter(c => c.startsWith('kit') || c === 'external_script'), []);
  const bad = {
    wrongSri: `<script src="${K.kitSrc()}" integrity="sha384-AAAA" crossorigin="anonymous"></script>`,
    unknownVersion: `<script src="/vendor/oomba-kit/9.9.9/oomba-kit.js" integrity="${K.KIT_VERSIONS[VERSION]}" crossorigin="anonymous"></script>`,
    noCrossorigin: `<script src="${K.kitSrc()}" integrity="${K.KIT_VERSIONS[VERSION]}"></script>`,
    extraAttr: `<script src="${K.kitSrc()}" integrity="${K.KIT_VERSIONS[VERSION]}" crossorigin="anonymous" onload="x()"></script>`,
  };
  for (const [name, t] of Object.entries(bad)) { const c = codes(GAME(t)); assert.ok(c.includes('kit_pin'), `${name}: ${c}`); }
  assert.ok(codes(GAME(tag, "const u = '/vendor/oomba-kit/1.0.0/oomba-kit.js';")).includes('kit_tag'), 'bare path in code');
  assert.ok(codes(GAME(tag + `<script type="importmap">{"imports":{"k":"/vendor/oomba-kit/1.0.0/oomba-kit.js"}}</script>`)).includes('kit_tag'), 'kit in an import map');
  const msg = scanVersion(GAME(bad.wrongSri)).issues.find(i => i.code === 'kit_pin').message;
  assert.ok(msg.includes(K.kitTag()), 'the message gives the exact tag to use');
  // Three.js games are unchanged, and a kit game is not a 3D game (no device card).
  assert.deepEqual(codes(GAME(V.threeImportMap(), "")).filter(c => c === 'three_pin'), []);
  assert.equal(V.isThreeGame(GAME(tag)), false); assert.equal(V.deviceNeeds(GAME(tag)), null);
  assert.ok(codes(`<script src="/vendor/three/${V.THREE_VERSION}/three.module.min.js"></script>`).includes('three_pin'), 'three is still pinned');
});

test('the screenshot worker serves kit files from disk (and nothing outside the folders)', () => {
  const H = 'http://game.invalid';
  assert.equal(vendorFile(`${H}${K.kitSrc()}`), path.join(KIT_DIR, VERSION, 'oomba-kit.js'));
  assert.equal(vendorFile(`${H}/vendor/oomba-kit/${VERSION}/fonts/bricolage-latin.woff2`), path.join(KIT_DIR, VERSION, 'fonts/bricolage-latin.woff2'));
  assert.equal(vendorFile(`${H}/vendor/oomba-kit/${VERSION}/packs/art-animals.js`), path.join(KIT_DIR, VERSION, 'packs/art-animals.js'), 'packs route too');
  for (const bad of [`/vendor/oomba-kit/${VERSION}/../../three/x.js`, '/vendor/oomba-kit/1.0.0/nope.js', `/vendor/three/${V.THREE_VERSION}/fonts/x.js`, '/vendor/other/1.0.0/a.js']) assert.equal(vendorFile(H + bad), null, bad);
  assert.ok(vendorFile(`${H}${V.THREE_MODULE}`), 'three still routes');
});

test('reviewed game data packs (/vendor/data/<game>/<version>/) are allowed by the frame CSP and served from disk', () => {
  const H = 'http://game.invalid';
  assert.match(frameCsp('https://oomba.example').match(/script-src[^;]*/)[0], /https:\/\/oomba\.example\/vendor\/data\//);
  const root = path.join(path.dirname(KIT_DIR), 'data');
  const game = fs.readdirSync(root)[0], ver = fs.readdirSync(path.join(root, game))[0], file = fs.readdirSync(path.join(root, game, ver))[0];
  assert.equal(vendorFile(`${H}/vendor/data/${game}/${ver}/${file}`), path.join(root, game, ver, file));
  for (const bad of [`/vendor/data/${game}/${ver}/../../x.js`, `/vendor/data/${game}/${ver}/nope.js`, '/vendor/data/x.js', `/vendor/data/${game}/${ver}/sub/${file}`]) assert.equal(vendorFile(H + bad), null, bad);
});

test('the SDK passes the site theme (plumbing only); frames without one leave it to the device', () => {
  const doc = frameDocument(GAME(K.kitTag()), { user: { lang: 'en' }, game: { id: 'g', title: 'G' }, theme: 'dark' });
  assert.match(doc, /"theme":"dark"/);
  const sdk = fs.readFileSync(path.join(ROOT, 'public/sdk/brb-sdk.js'), 'utf8');
  assert.match(sdk, /theme: INIT\.theme === 'light' \|\| INIT\.theme === 'dark' \? INIT\.theme : ''/);
  assert.match(sdk, /motion: INIT\.motion === 'reduce' \|\| INIT\.motion === 'full' \? INIT\.motion : ''/);
});

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('/kit is admin-only (or KIT_PREVIEW=1); its frame is the real frame wrapper with the kit tag', async () => {
  assert.equal((await fetch(`${BASE}/kit`)).status, 404);
  assert.equal((await fetch(`${BASE}/kit/frame/core`)).status, 404);
  config.kitPreview = true;
  try {
    const page = await fetch(`${BASE}/kit`); assert.equal(page.status, 200);
    assert.match(await page.text(), /<iframe id="kitframe"[^>]*sandbox="allow-scripts allow-pointer-lock allow-orientation-lock"/);
    const f = await fetch(`${BASE}/kit/frame/core?l=ar&mode=dark`); assert.equal(f.status, 200);
    const csp = f.headers.get('content-security-policy');
    assert.match(csp, /^sandbox allow-scripts/); assert.match(csp, /vendor\/oomba-kit\//);
    const doc = await f.text();
    assert.ok(doc.includes(K.kitTag()), 'the pinned tag'); assert.match(doc, /"lang":"ar","dir":"rtl"/); assert.match(doc, /"theme":"dark"/);
    assert.equal((await fetch(`${BASE}/kit/frame/nope`)).status, 404);
    const gal = await (await fetch(`${BASE}/kit/frame/gallery`)).text();
    for (const n of Object.keys(K.KIT_PACKS[VERSION])) assert.ok(gal.includes(K.kitPackTag(n)), `the gallery loads ${n}`);
    const quest = await (await fetch(`${BASE}/kit/frame/quest`)).text();
    assert.ok(quest.indexOf(K.kitTag()) < quest.indexOf(K.kitPackTag('art-animals')), 'the kit tag first, then the packs');
    const { sceneHtml } = await import('../../server/routes/kit.js');
    for (const sc of ['quest', 'meadow']) { const iss = scanVersion(sceneHtml(sc)).issues; assert.deepEqual(iss.filter(i => i.level === 'fail'), [], `the ${sc} demo passes the scanner`); }
    const js = await fetch(`${BASE}${K.kitSrc()}`, { headers: { 'accept-encoding': 'br' } });
    assert.equal(js.status, 200); assert.equal(js.headers.get('access-control-allow-origin'), '*'); assert.match(js.headers.get('cache-control'), /immutable/);
    const font = await fetch(`${BASE}/vendor/oomba-kit/${VERSION}/fonts/bricolage-latin.woff2`);
    assert.equal(font.status, 200); assert.equal(font.headers.get('access-control-allow-origin'), '*');
  } finally { config.kitPreview = false; }
});

test('source grep: kit/src and kit/packs never use eval, Function(), the network, workers, dynamic import, Date.now, Math.random, blur filters or emoji', () => {
  const BANNED = [[/\beval\s*\(/, 'eval'], [/\bFunction\s*\(/, 'Function('], [/\bfetch\s*\(/, 'fetch'], [/XMLHttpRequest/, 'XHR'], [/\bWorker\b/, 'Worker'],
    [/\bimport\s*\(/, 'import('], [/Date\.now/, 'Date.now'], [/Math\.random/, 'Math.random'], [/shadowBlur/, 'shadowBlur'], [/\.filter\s*=/, '.filter ='],
    [/\bsetTimeout\b|\bsetInterval\b/, 'timers'], [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'emoji']];
  for (const dir of [path.join(ROOT, 'kit/src'), path.join(ROOT, 'kit/packs')]) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = strip(fs.readFileSync(path.join(dir, f), 'utf8'));   // code only: comments may name what is banned
    for (const [re, what] of BANNED) assert.doesNotMatch(src, re, `${f}: ${what}`);
  }
  for (const n of packNames()) for (const [re, what] of BANNED) assert.doesNotMatch(fs.readFileSync(path.join(KIT_DIR, VERSION, 'packs', n + '.js'), 'utf8'), re, `packs/${n}.js: ${what}`);
  const built = dist(VERSION).toString('utf8');
  for (const [re, what] of BANNED) assert.doesNotMatch(built, re, `dist: ${what}`);
});

test('cssComments drops the prose notes inside CSS strings and leaves code alone', () => {
  const css = '`.a{color:red}\n/* the card: a note */\n.b{x:1}/* a note */`';
  assert.equal(cssComments(css), '`.a{color:red}\n.b{x:1}`');
  const js = 'const re=/a*/g;const s="/* not a note */";/*! keep me */';
  assert.equal(cssComments(js), js);
});
