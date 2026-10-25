// Static scanner safety suite: escape hatches fail, flashing is flagged, every shipped game passes,
// and everything the Builder's mock writes (templates + tune-up layer) passes too.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { scanVersion } = await import('../../server/services/scanner.js');
const { sanitizeGameHtml } = await import('../../server/services/sanitize.js');
const { listTemplates, templateHtml, fallbackHtml } = await import('../../server/builder/catalog.js');
const { withLayer } = await import('../../server/builder/layer.js');
const { threeImportMap } = await import('../../server/services/vendor.js');

const GAME = body => `<title>T</title><style>body{margin:0}</style><canvas id="c"></canvas><script>${body}</script>`;
const codes = r => r.issues.map(i => i.code);

test('network, escape and eval APIs fail the scan', () => {
  for (const [src, code] of [
    ['fetch("https://evil.example/x")', 'network'], ['fetch (url)', 'network'], ['new XMLHttpRequest()', 'network'], ['new WebSocket("wss://x")', 'network'],
    ['navigator.sendBeacon("/x")', 'network'], ['import("https://x/y.js")', 'network'], ['window.top.location = "x"', 'escape'], ['parent.location.href', 'escape'],
    ['document.cookie', 'privacy'], ['eval(text)', 'eval'], ['new Function("return 1")', 'eval'], ['setTimeout("alert(1)", 10)', 'eval'], ['window.open("x")', 'escape'],
  ]) {
    const r = scanVersion(GAME(src));
    assert.equal(r.status, 'fail', src); assert.ok(codes(r).includes(code), `${src} -> ${codes(r)}`);
  }
});
test('external links and scripts fail the scan', () => {
  let r = scanVersion('<title>x</title><a href="https://example.com">Click</a><canvas></canvas>');
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('link'));
  r = scanVersion('<title>x</title><script src="https://evil.example/x.js"></script><canvas></canvas>');
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('external_script'));
  r = scanVersion(GAME('const img = "https://tracker.example/pixel.gif";'));
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('external_url'));
  r = scanVersion('<title>x</title><form action="https://x.example"><input></form>');
  assert.equal(r.status, 'fail');
  r = scanVersion('<title>x</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka"><canvas></canvas>');
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
});
test('only pinned libraries pass; unknown cdnjs is flagged for a human, Three.js from anywhere but the site fails', () => {
  // The self-hosted, pinned Three.js import map (what 3D games use) passes.
  let r = scanVersion(`<title>x</title>${threeImportMap()}<script type="module">import * as T from "three";</script><canvas></canvas>`);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  // Three.js from cdnjs (any version, even one that used to be allowed) fails: there is one pinned, self-hosted build.
  r = scanVersion('<title>x</title><script type="importmap">{"imports":{"three":"https://cdnjs.cloudflare.com/ajax/libs/three.js/0.186.1/three.module.min.js"}}</script><script type="module">import * as T from "three";</script><canvas></canvas>');
  assert.equal(r.status, 'fail'); assert.ok(codes(r).includes('three_pin'));
  // An unknown cdnjs script (e.g. a huge Babylon build the scanner cannot read) is flagged, not passed.
  r = scanVersion('<title>x</title><script src="https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.40.1/babylon.js"></script><canvas></canvas>');
  assert.equal(r.status, 'flag'); assert.ok(codes(r).includes('unknown_cdnjs'));
  // Unknown cdnjs inside an import map is flagged too.
  r = scanVersion('<title>x</title><script type="importmap">{"imports":{"e":"https://cdnjs.cloudflare.com/ajax/libs/evil/1/e.js"}}</script><canvas></canvas>');
  assert.equal(r.status, 'flag'); assert.ok(codes(r).includes('unknown_cdnjs'));
});
test('WebRTC and network built from pieces or reached by name still fail', () => {
  for (const src of [
    "new window['RTC'+'PeerConnection']()",          // split string + bracket access
    "var n=String.fromCharCode(102,101,116,99,104);window[n]()", // fromCharCode -> 'fetch'
    "var a=['f','e','t','c','h'].join('');window[a]", // join -> 'fetch'
    "var x='RTC'+'PeerConnection'; new window[x]()",  // assembled identifier
    "window['fe'+'tch']('http://x')",                 // concat in bracket access
    "var s=atob('UlRDUGVlckNvbm5lY3Rpb24=');",        // base64 -> RTCPeerConnection
  ]) assert.equal(scanVersion(GAME(src)).status, 'fail', src);
  // Benign uses of the same tools stay clean.
  assert.equal(scanVersion(GAME("var r=s=>s.replace(/[a-z]/g,c=>String.fromCharCode((c.charCodeAt(0)-84)%26+97));")).status, 'pass');
  assert.equal(scanVersion(GAME("var word=['s','c','o','r','e'].join('');")).status, 'pass');
  assert.equal(scanVersion(GAME("var G={frames:[]};G.frames.push(1);")).status, 'pass', 'a game object named frames is fine');
});
test('frame/window-borrowing attempts are flagged for a human', () => {
  for (const src of [
    "var f=document.createElement('iframe');document.body.appendChild(f);f.contentWindow",
    "document.querySelector('iframe').contentDocument",
    "document.write('<b>x</b>')",
    "var w=window.frames[0];",
  ]) { const r = scanVersion(GAME(src)); assert.equal(r.status, 'flag', src); assert.ok(codes(r).includes('frame'), src); }
});
test('flashing faster than three times a second is flagged', () => {
  let r = scanVersion(GAME('setInterval(() => { document.body.style.background = on ? "#fff" : "#000"; on = !on; }, 100)'));
  assert.equal(r.status, 'flag'); assert.ok(codes(r).includes('flashing'));
  r = scanVersion('<title>x</title><style>@keyframes strobe{0%{background:#fff}50%{background:#000}} body{animation:strobe 200ms infinite}</style><div>hi</div>');
  assert.equal(r.status, 'flag'); assert.ok(codes(r).includes('flashing'));
  r = scanVersion(GAME('setInterval(() => { document.body.style.background = on ? "#fff" : "#000"; }, 1000)'));
  assert.equal(r.status, 'pass', 'slow colour changes are fine');
});
test('personal-info prompts and visible profanity fail', () => {
  assert.ok(codes(scanVersion('<title>x</title><p>Type your address here</p><canvas></canvas>')).includes('personal_info'));
  assert.ok(codes(scanVersion(GAME('const msg = "you are shit";'))).includes('profanity'));
});
test('the three seed games pass', () => {
  for (const f of ['shark-plank', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'castle-clash', 'brick-drop', 'word-hunt', 'sum-racer', 'munch-maze', 'word-peek', 'swish-flick', 'loop-lab', 'beat-lanes']) {
    const r = scanVersion(sanitizeGameHtml(fs.readFileSync(path.join(ROOT, 'seed-games', f + '.html'), 'utf8')).html);
    assert.equal(r.status, 'pass', `${f}: ${JSON.stringify(r.issues)}`);
  }
});
test('every Start-from template (or the built-in fallback) passes, also with the Builder tune-up layer', async () => {
  const tune = { speed: 1.5, tint: '#ff5fb0', hero: ['🍎', '🐉'], name: ['Fruit Catch', 'Dragon Catch'], level2: true };
  assert.equal(scanVersion(fallbackHtml()).status, 'pass');
  assert.equal(scanVersion(withLayer(fallbackHtml(), tune)).status, 'pass');
  for (const t of await listTemplates()) {
    const { html } = await templateHtml(t.key);
    let r = scanVersion(sanitizeGameHtml(html).html); assert.equal(r.status, 'pass', `${t.key}: ${JSON.stringify(r.issues)}`);
    r = scanVersion(withLayer(html, tune)); assert.equal(r.status, 'pass', `${t.key}+layer: ${JSON.stringify(r.issues)}`);
  }
  const dir = path.join(ROOT, 'server/builder/templates');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.html'))) {
    const r = scanVersion(fs.readFileSync(path.join(dir, f), 'utf8')); assert.equal(r.status, 'pass', `${f}: ${JSON.stringify(r.issues)}`);
  }
});
