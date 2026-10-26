// 3D step 1: the self-hosted, pinned Three.js. The files match their pinned hashes, the scanner accepts exactly the
// pinned import map and rejects every other way of loading Three.js, the frame tells the SDK which games are 3D,
// the frame CSP allows only the site's /vendor/three/ path, and /vendor is served with long caching and CORS.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.TRUST_PROXY = '1';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-vendor-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const V = await import('../../server/services/vendor.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const { sanitizeGameHtml } = await import('../../server/services/sanitize.js');
const { frameDocument, frameCsp, FRAME_CSP, requestOrigin, frameOrigins } = await import('../../server/services/frame.js');
const { loadTemplate } = await import('../../server/builder/templates/index.js');
const { createApp } = await import('../../server/app.js');

const MODULE = 'three.module.min.js', CORE = 'three.core.min.js';
const DIR = path.join(ROOT, 'public', 'vendor', 'three', V.THREE_VERSION);
const sri = f => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(f)).digest('base64');
const codes = r => r.issues.map(i => i.code);
const GAME3D = (map, code = "import * as THREE from 'three'; new THREE.Scene();") => `<title>T</title><canvas></canvas>${map}<script type="module">${code}</script>`;
const mapWith = obj => `<script type="importmap">${JSON.stringify(obj)}</script>`;
const PINNED = { imports: { three: V.THREE_MODULE }, integrity: { [V.THREE_MODULE]: V.THREE_SRI[V.THREE_MODULE], [V.THREE_CORE]: V.THREE_SRI[V.THREE_CORE] } };

test('the vendored files are Three.js r185.1, with its licence, and match the pinned hashes', () => {
  assert.equal(V.THREE_VERSION, '0.185.1');
  assert.equal(V.THREE_SRI[V.THREE_MODULE], sri(path.join(DIR, MODULE)));
  assert.equal(V.THREE_SRI[V.THREE_CORE], sri(path.join(DIR, CORE)));
  assert.match(fs.readFileSync(path.join(DIR, 'LICENSE'), 'utf8'), /The MIT License[\s\S]*three\.js authors/);
  assert.match(fs.readFileSync(path.join(DIR, CORE), 'utf8').slice(0, 400), /const \w="185"/, 'REVISION 185');
  assert.match(fs.readFileSync(path.join(DIR, MODULE), 'utf8'), /from"\.\/three\.core\.min\.js"/, 'the module imports the core next to it');
  for (const f of [MODULE, CORE]) assert.doesNotMatch(fs.readFileSync(path.join(DIR, f), 'utf8'), /\bimport\s*\(/, `${f} has no dynamic import()`);
});

test('the scanner accepts exactly the pinned import map', () => {
  let r = scanVersion(GAME3D(V.threeImportMap()));
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  // Same map, other key order and whitespace.
  const reordered = `<script type=importmap>\n{"integrity":{"${V.THREE_CORE}":"${V.THREE_SRI[V.THREE_CORE]}","${V.THREE_MODULE}":"${V.THREE_SRI[V.THREE_MODULE]}"},\n "imports":{"three":"${V.THREE_MODULE}"}}\n</script>`;
  r = scanVersion(GAME3D(reordered)); assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  // The Star Island template carries the very same text.
  assert.ok(loadTemplate('island').includes(V.threeImportMap()));
});

test('the scanner rejects other versions, other hosts and unpinned forms of Three.js', () => {
  const bad = {
    'another vendored version': mapWith({ imports: { three: '/vendor/three/0.184.0/three.module.min.js' }, integrity: { '/vendor/three/0.184.0/three.module.min.js': 'sha384-x', '/vendor/three/0.184.0/three.core.min.js': 'sha384-y' } }),
    'no integrity': mapWith({ imports: { three: V.THREE_MODULE } }),
    'only one integrity line': mapWith({ imports: { three: V.THREE_MODULE }, integrity: { [V.THREE_MODULE]: V.THREE_SRI[V.THREE_MODULE] } }),
    'a wrong hash': mapWith({ ...PINNED, integrity: { ...PINNED.integrity, [V.THREE_CORE]: 'sha384-AAAA' } }),
    'an extra mapping': mapWith({ ...PINNED, imports: { ...PINNED.imports, 'three/addons/': '/vendor/three/0.185.1/addons/' } }),
    'scopes': mapWith({ ...PINNED, scopes: { '/': { three: V.THREE_MODULE } } }),
    'cdnjs': mapWith({ imports: { three: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js' } }),
    'unpkg': mapWith({ imports: { three: 'https://unpkg.com/three@0.185.1/build/three.module.js' } }),
    'broken JSON': '<script type="importmap">{ "imports": { "three": </script>',
  };
  for (const [what, map] of Object.entries(bad)) {
    const r = scanVersion(GAME3D(map));
    assert.equal(r.status, 'fail', what); assert.ok(codes(r).includes('three_pin'), `${what}: ${JSON.stringify(r.issues)}`);
  }
  // Without the map, straight from the vendor path, or with add-ons.
  let r = scanVersion(GAME3D(''));
  assert.equal(r.status, 'fail'); assert.match(r.issues.find(i => i.code === 'three_pin').message, /without the import map/);
  r = scanVersion(GAME3D('', `import * as THREE from '${V.THREE_MODULE}';`));
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('three_pin'));
  r = scanVersion(GAME3D(V.threeImportMap(), "import * as THREE from 'three'; import { OrbitControls } from 'three/addons/controls/OrbitControls.js';"));
  assert.equal(r.status, 'fail'); assert.match(r.issues.find(i => i.code === 'three_pin').message, /add-on/);
  r = scanVersion(`<title>T</title><canvas></canvas><script src="${V.THREE_MODULE}"></script>`);
  assert.equal(r.status, 'fail');
  r = scanVersion('<title>T</title><canvas></canvas><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>');
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('three_pin'));
  // Words in an ordinary script are not an import.
  const quiz = '<title>Q</title><canvas></canvas><script>const Q = "Count from \'three\' to \'ten\'"; const R = "import \'three\' cats";</script>';
  assert.equal(V.isThreeGame(quiz), false); assert.equal(scanVersion(quiz).status, 'pass', JSON.stringify(scanVersion(quiz).issues));
  // Ordinary 2D games and every launch game are untouched; the one 3D launch game uses exactly the pinned form.
  for (const f of fs.readdirSync(path.join(ROOT, 'seed-games')).filter(x => x.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(ROOT, 'seed-games', f), 'utf8');
    assert.equal(V.isThreeGame(html), f === 'hero-of-sunvale.html', f); assert.deepEqual(V.checkThree(html), [], f);
  }
});

test('the sanitizer keeps import maps and module scripts', () => {
  const html = GAME3D(V.threeImportMap());
  const out = sanitizeGameHtml(html);
  assert.equal(out.html, html); assert.deepEqual(out.removed, []);
});

test('3D games are flagged to the SDK (device check); 2D games are not', () => {
  const init = { user: { displayName: 'P', lang: 'fr' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false, deviceText: { title: 'Titre', text: 'Texte' } };
  const boot = doc => JSON.parse(doc.match(/window\.__BRB_INIT__=(\{.*?\});<\/script>/)[1]);
  const b3 = boot(frameDocument(loadTemplate('island'), init));
  assert.deepEqual(b3.device, { webgl2: true, importmap: true, title: 'Titre', text: 'Texte' });
  assert.equal(b3.deviceText, undefined);
  const b2 = boot(frameDocument(loadTemplate('catch'), init));
  assert.equal(b2.device, undefined, 'a 2D game gets no device check'); assert.equal(b2.deviceText, undefined);
  assert.deepEqual(V.deviceNeeds(GAME3D(V.threeImportMap())), { webgl2: true, importmap: true });
  assert.equal(V.deviceNeeds(loadTemplate('runner')), null);
});

test('the frame CSP allows only the site\'s own /vendor/three/ path, never other site scripts or odd hosts', () => {
  assert.doesNotMatch(FRAME_CSP, /vendor/, 'no origin, no vendor source');
  const csp = frameCsp('https://oomba.example');
  assert.match(csp, /script-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/oomba\.example\/vendor\/three\/;/);
  assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /'self'/, "not 'self': that would allow every site script");
  for (const o of ['https://x.example; script-src *', 'javascript:alert(1)', 'https://a b', 'ftp://x.example']) assert.doesNotMatch(frameCsp(o), /vendor/, o);
  assert.equal(requestOrigin({ protocol: 'https', host: 'oomba.example' }), 'https://oomba.example');
  assert.equal(requestOrigin({ protocol: 'http', host: 'localhost:5810' }), 'http://localhost:5810');
  assert.equal(requestOrigin({ protocol: 'http', host: 'evil.example;script-src *' }), '');
  // A list: each plain origin once; odd ones are left out.
  assert.match(frameCsp(['https://play.example.com', 'http://internal:3000', 'HTTPS://PLAY.EXAMPLE.COM', 'https://x.example; script-src *']),
    /script-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/play\.example\.com\/vendor\/three\/ http:\/\/internal:3000\/vendor\/three\/;/);
});

test('PUBLIC_URL: the frame CSP names the public origin (a CDN rewrites Host) and still the name the request came in on', () => {
  const saved = config.publicUrl;
  try {
    config.publicUrl = 'https://play.example.com';   // config.js has already turned PUBLIC_URL into an origin
    const behindCdn = { protocol: 'https', host: 'origin-alb.internal' };
    assert.equal(requestOrigin(behindCdn), 'https://play.example.com', 'PUBLIC_URL wins over the Host header');
    assert.deepEqual(frameOrigins(behindCdn), ['https://play.example.com', 'https://origin-alb.internal']);
    assert.deepEqual(frameOrigins({ protocol: 'https', host: 'play.example.com' }), ['https://play.example.com'], 'no duplicate');
    assert.deepEqual(frameOrigins({ protocol: 'http', host: 'evil.example;script-src *' }), ['https://play.example.com'], 'an odd Host is left out');
    config.publicUrl = '';
    assert.equal(requestOrigin(behindCdn), 'https://origin-alb.internal', 'unset: the request, as before');
    assert.deepEqual(frameOrigins(behindCdn), ['https://origin-alb.internal']);
  } finally { config.publicUrl = saved; }
});

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('/vendor is served with a year of immutable caching and CORS; a 3D frame gets the vendor CSP and the device check', async () => {
  let res = await fetch(`${BASE}/vendor/three/${V.THREE_VERSION}/${MODULE}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(res.headers.get('cache-control'), /max-age=31536000/); assert.match(res.headers.get('cache-control'), /immutable/);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(sri(path.join(DIR, MODULE)), 'sha384-' + crypto.createHash('sha384').update(Buffer.from(await res.arrayBuffer())).digest('base64'));
  res = await fetch(`${BASE}/vendor/three/${V.THREE_VERSION}/nope.js`); assert.equal(res.status, 404);
  // A malformed escape is answered by express.static (404), never a server error (with or without compression asked for).
  for (const enc of ['', 'gzip, br']) { res = await fetch(`${BASE}/vendor/three/%E0%A4%A.js`, { headers: enc ? { 'accept-encoding': enc } : {} }); assert.equal(res.status, 404, enc); }
  res = await fetch(`${BASE}/vendor/three/${V.THREE_VERSION}/${MODULE}`, { method: 'OPTIONS', headers: { origin: 'null', 'access-control-request-method': 'GET', 'access-control-request-headers': 'x-forwarded-for' } });
  assert.equal(res.status, 204, 'a preflight is answered');
  assert.equal(res.headers.get('access-control-allow-origin'), '*'); assert.equal(res.headers.get('access-control-allow-headers'), 'x-forwarded-for');

  // Sign up, start from Star Island, open the preview frame.
  let cookie = '';
  const call = async (p, opts = {}) => {
    const r = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}), ...(opts.body ? { 'content-type': 'application/json' } : {}) }, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) if (c.startsWith('brb_session=')) cookie = c.split(';')[0];
    return r;
  };
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username: 'VendorKid', password: 'secret12' }) })).status, 200);
  const made = await (await call('/api/studio/new', { method: 'POST', body: JSON.stringify({ template: 'island' }) })).json();
  assert.ok(made.ok);
  const studio = await (await call(`/studio/${made.id}`)).text();
  const src = studio.match(/src="(\/frame\/[^"]+)"/)[1];
  // Behind a proxy (TRUST_PROXY=1) the origin comes from X-Forwarded-Proto/Host.
  const frame = await call(src, { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'oomba.example' } });
  assert.equal(frame.status, 200);
  assert.match(frame.headers.get('content-security-policy'), /script-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com https:\/\/oomba\.example\/vendor\/three\/;/);
  const doc = await frame.text();
  assert.match(doc, /"device":\{"webgl2":true,"importmap":true,"title":"This game needs a newer device or browser"/);
  assert.ok(doc.includes(V.threeImportMap()), 'the import map reaches the frame intact');
  const direct = await call(src);
  assert.match(direct.headers.get('content-security-policy'), new RegExp(`${BASE.replace(/[.:/]/g, '\\$&')}/vendor/three/;`));
  // It publishes like any game (for friends straight away; Everyone would go to review), and its play frame is 3D too.
  const pub = await call(`/api/studio/${made.id}/publish`, { method: 'POST', body: JSON.stringify({ visibility: 'friends' }) });
  const pj = await pub.json();
  assert.equal(pub.status, 200, JSON.stringify(pj)); assert.equal(pj.state.status.code, 'live');
  const play = await (await call(`/play/${pj.state.game.slug}`)).text();
  const live = await (await call(play.match(/src="(\/frame\/[^"]+)"/)[1])).text();
  assert.match(live, /"device":\{"webgl2":true,"importmap":true/);
});

test('PUBLIC_URL over HTTP: a temporary name before moving day and a Host-rewriting CDN both get a working 3D frame', async () => {
  let cookie = '';
  const call = async (p, opts = {}) => {
    const r = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), ...(cookie ? { cookie } : {}), ...(opts.body ? { 'content-type': 'application/json' } : {}) }, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) if (c.startsWith('brb_session=')) cookie = c.split(';')[0];
    return r;
  };
  assert.equal((await call('/api/auth/signup', { method: 'POST', body: JSON.stringify({ username: 'VendorKidTwo', password: 'secret12' }) })).status, 200);
  const made = await (await call('/api/studio/new', { method: 'POST', body: JSON.stringify({ template: 'island' }) })).json();
  const src = (await (await call(`/studio/${made.id}`)).text()).match(/src="(\/frame\/[^"]+)"/)[1];
  const saved = config.publicUrl;
  config.publicUrl = 'https://play.example.com';
  try {
    const scripts = async headers => (await call(src, { headers })).headers.get('content-security-policy').match(/script-src[^;]*/)[0];
    // Caddy on the temporary name (Host kept): the page loads /vendor/three/ from new.example.com.
    assert.equal(await scripts({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'new.example.com' }),
      "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://play.example.com/vendor/three/ https://new.example.com/vendor/three/");
    // Front Door / CloudFront rewrote Host to the origin's name: the browser is on PUBLIC_URL.
    assert.equal(await scripts({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'origin.play.example.com' }),
      "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://play.example.com/vendor/three/ https://origin.play.example.com/vendor/three/");
    assert.equal(await scripts({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'play.example.com' }),
      "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://play.example.com/vendor/three/");
  } finally { config.publicUrl = saved; }
});
