import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { scanVersion } = await import('../../server/services/scanner.js');
const { sanitizeGameHtml } = await import('../../server/services/sanitize.js');
const { frameDocument, FRAME_CSP, SANDBOX } = await import('../../server/services/frame.js');
const ok = '<title>T</title><style>body{background:#fff}</style><canvas id=c></canvas><script>const c=document.getElementById("c");BRB.sfx.play("win")</script>';
const s = js => `<title>T</title><canvas></canvas><script>${js}</script>`;

test('clean game passes', () => assert.equal(scanVersion(ok).status, 'pass'));
test('seed games pass', () => { for (const f of ['hero-of-sunvale', 'shark-plank', 'ring-rumble', 'footy-tycoon', 'connect-four', 'happy-putt', 'castle-clash', 'brick-drop', 'word-hunt', 'sum-racer', 'munch-maze', 'word-peek', 'swish-flick', 'loop-lab', 'beat-lanes']) assert.equal(scanVersion(fs.readFileSync(`seed-games/${f}.html`, 'utf8')).status, 'pass', f); });
for (const [name, js] of [['fetch', 'fetch("/x")'], ['xhr', 'new XMLHttpRequest()'], ['websocket', 'new WebSocket("wss://x")'], ['beacon', 'navigator.sendBeacon("/x")'], ['top', 'window.top.location="x"'], ['parent', 'parent.location.href="x"'], ['cookie', 'document.cookie'], ['eval', 'eval("1+1")'], ['newFunction', 'new Function("return 1")'], ['import', 'import("x.js")'], ['timerString', 'setTimeout("alert(1)", 10)'], ['open', 'window.open("x")']]) {
  test(`fails: ${name}`, () => assert.equal(scanVersion(s(js)).status, 'fail'));
}
test('fails: external link and script, form action', () => {
  assert.equal(scanVersion('<title>T</title><div><a href="https://evil.example.com">x</a></div>').status, 'fail');
  assert.equal(scanVersion('<title>T</title><script src="https://evil.example.com/x.js"></script>').status, 'fail');
  assert.equal(scanVersion('<title>T</title><form action="/steal"><input></form>').status, 'fail');
  assert.equal(scanVersion('<title>T</title><div style="background:url(http://x.example.org/a.png)">x</div>').status, 'fail');
});
test('allows Google Fonts; cdnjs libraries need a review', () => {
  assert.equal(scanVersion('<title>T</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito"><div>x</div>').status, 'pass');
  // an unknown cdnjs library is flagged for review, not passed
  assert.equal(scanVersion('<title>T</title><script src="https://cdnjs.cloudflare.com/ajax/libs/x/1/x.js"></script><div>x</div>').status, 'flag');
});
test('flags flashing', () => {
  assert.equal(scanVersion(s('setInterval(()=>{document.body.style.background=on?"red":"blue";on=!on}, 100)')).status, 'flag');
  assert.equal(scanVersion('<title>T</title><style>@keyframes blink{0%{background:red}50%{background:#fff}} .b{animation:blink .1s infinite}</style><div class=b>x</div>').status, 'flag');
  assert.equal(scanVersion(s('setInterval(()=>{x+=1}, 16)')).status, 'pass', 'a game loop is not flashing');
});
test('fails on profanity and asking for personal details', () => {
  assert.equal(scanVersion('<title>T</title><div>you are a shit player</div>').status, 'fail');
  assert.equal(scanVersion(s('prompt("Enter your real name")')).status, 'fail');
});
test('fails when over 2 MB', () => assert.equal(scanVersion('<title>T</title><div>' + 'x'.repeat(2.1 * 1024 * 1024) + '</div>').status, 'fail'));

test('sanitizer strips escape hatches', () => {
  const { html, removed } = sanitizeGameHtml('<base href="https://x"><meta http-equiv="refresh" content="0;url=https://x"><iframe src="https://x"></iframe><object data="x"></object><embed src="x"><link rel="stylesheet" href="https://evil.example/x.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=A"><form action="https://x" target="_top"><button formaction="https://x">b</button></form>');
  for (const bad of ['<base', 'http-equiv', '<iframe', '<object', '<embed', 'evil.example', 'action=', 'target=', 'formaction']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('fonts.googleapis.com')); assert.ok(removed.length >= 7);
});
test('frame document injects SDK + init before the game, CSP is strict', () => {
  const doc = frameDocument(ok, { user: { displayName: '</script><b>x' }, game: { id: 'g', title: 'T' }, save: {}, canSave: false });
  assert.ok(doc.indexOf('window.BRB') < doc.indexOf('<title>T</title>'));
  assert.ok(!doc.includes('</script><b>x'), 'init JSON is escaped');
  assert.match(FRAME_CSP, /connect-src 'none'/); assert.match(FRAME_CSP, /default-src 'none'/); assert.match(FRAME_CSP, /frame-ancestors 'self'/);
  assert.ok(!SANDBOX.includes('allow-same-origin'));
});
