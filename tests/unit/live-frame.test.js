// Oomba Live in the game frame, in real Chromium inside the production wrapper (frameDocument + the frame CSP + the
// sandbox attribute): the SDK hands the page a private MessagePort with its first brb:ready, sends only well-formed
// messages over it (game event data with prose is dropped), turns text entry off in live frames only, and a page the
// frame navigates to gets no port. Needs a local Chromium; skipped when there is none. public/sdk/brb-sdk.js,
// docs/safety.md §12.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const { frameDocument, FRAME_CSP, SANDBOX } = await import('../../server/services/frame.js');
const HOST = 'http://game.invalid';
const LIVE = { v: 1, role: 'player', seat: 3, frame: 'game', nameMode: 'nicknames', mode: 'game', nicks: ['Brave Otter'], view: '3d', me: { seat: 3, name: 0, avatar: null, team: 0 } };
const init = live => ({ user: { displayName: 'Brave Otter', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'L' }, save: {}, canSave: false, ...(live ? { live } : {}) });

// A game that tries everything: typing, prompt, prose in an event, a well-formed event, a score.
const GAME = `<title>Live</title><body><input id="t" type="text"><textarea id="ta"></textarea><input id="r" type="range"><div id="ce" contenteditable="true">x</div><script>
window.__R = {};
setTimeout(function () {
  var R = window.__R;
  R.prompt = window.prompt('name?');
  R.inputRO = document.getElementById('t').readOnly; R.textareaRO = document.getElementById('ta').readOnly; R.rangeRO = document.getElementById('r').readOnly;
  R.ce = document.getElementById('ce').getAttribute('contenteditable');
  var late = document.createElement('input'); late.type = 'text'; document.body.appendChild(late);
  setTimeout(function () { R.lateRO = late.readOnly; late.readOnly = false; setTimeout(function () { R.lateBack = late.readOnly; }, 50); }, 50);
  R.live = !!(window.BRB && BRB.live && BRB.live.active);
  if (R.live) {
    R.prose = BRB.live.send('ev', { k: 'chat', d: 'hello there' });
    R.caps = BRB.live.send('ev', { k: 'pick', d: 'Hello' });
    R.deep = BRB.live.send('ev', { k: 'pick', d: { a: { b: { c: 1 } } } });
    R.good = BRB.live.send('ev', { k: 'pick', d: { item: 'red-gem', n: 3, ok: true } });
    R.score = BRB.live.send('sc', { n: 120 });
    R.host = BRB.live.send('st', { d: { x: 1 } });
    BRB.live.on(function (m) { R.got = m; });
  }
}, 60);
</script></body>`;

let browser;
test.after(async () => { if (browser) await browser.close(); });
async function run(live, gameHtml = GAME) {
  const { chromium } = await import('playwright-core');
  if (!browser) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext();
  const doc = frameDocument(gameHtml, init(live));
  // The page: takes the port from the first brb:ready only, records what comes over it, and answers on it.
  const page = `<!doctype html><meta charset=utf-8><iframe id=f sandbox="${SANDBOX}" src="${HOST}/frame"></iframe><script>
    window.__P = { ready: 0, ports: 0, msgs: [], loads: 0 };
    var f = document.getElementById('f');
    f.addEventListener('load', function () { __P.loads++; });
    addEventListener('message', function (e) {
      if (e.source !== f.contentWindow || e.origin !== 'null' || !e.data || e.data.type !== 'brb:ready') return;
      __P.ready++;
      if (e.ports && e.ports[0] && !__P.port) { __P.ports++; __P.port = e.ports[0]; __P.port.onmessage = function (ev) { __P.msgs.push(ev.data); }; __P.port.postMessage({ t: 'clk', s: 1000 }); }
    });
  </script>`;
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': FRAME_CSP }, body: doc });
    if (u === HOST + '/elsewhere') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<script>parent.postMessage({ brb: 1, type: "brb:ready" }, "*")</script>' });
    return route.abort();
  });
  const p = await ctx.newPage();
  await p.goto(HOST + '/', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  return { p, frame, ctx };
}

test('a live frame hands its port over once, sends only well-formed messages, and nothing can be typed', { skip, timeout: 60_000 }, async () => {
  const { p, frame, ctx } = await run(LIVE);
  const R = await frame.evaluate(() => window.__R);
  const P = await p.evaluate(() => ({ ready: __P.ready, ports: __P.ports, msgs: __P.msgs }));
  assert.equal(P.ports, 1, 'the port came with brb:ready');
  assert.equal(R.live, true);
  // no prose between players: strings with spaces or capitals, or data nested too deep, never leave the frame
  assert.equal(R.prose, false); assert.equal(R.caps, false); assert.equal(R.deep, false);
  assert.equal(R.good, true); assert.equal(R.score, true);
  assert.equal(R.host, false, 'a player frame cannot write the shared state');
  assert.deepEqual(P.msgs, [{ k: 'pick', d: { item: 'red-gem', n: 3, ok: true }, t: 'ev' }, { n: 120, t: 'sc' }]);
  assert.deepEqual(R.got, { t: 'clk', s: 1000 }, 'the page answers over the port');
  // text entry is off: prompt() returns null, text boxes and editable elements are read-only, even ones made later
  assert.equal(R.prompt, null);
  assert.equal(R.inputRO, true); assert.equal(R.textareaRO, true); assert.equal(R.rangeRO, false, 'a slider still works');
  assert.equal(R.ce, 'false');
  assert.equal(R.lateRO, true); assert.equal(R.lateBack, true, 'it cannot be switched back on');
  await ctx.close();
});

test('an ordinary game frame is unchanged (no port, typing works)', { skip, timeout: 60_000 }, async () => {
  const { p, frame, ctx } = await run(null);
  const R = await frame.evaluate(() => window.__R);
  const P = await p.evaluate(() => ({ ready: __P.ready, ports: __P.ports }));
  assert.equal(P.ready, 1); assert.equal(P.ports, 0);
  assert.equal(R.live, false); assert.equal(R.inputRO, false); assert.equal(R.ce, 'true');
  assert.notEqual(R.prompt, undefined);
  await ctx.close();
});

test('a live frame that navigates itself: the new page has no port and gets nothing', { skip, timeout: 60_000 }, async () => {
  const NAV = `<title>Nav</title><body><script>setTimeout(function () { location.href = '${HOST}/elsewhere'; }, 300);</script></body>`;
  const { p, ctx } = await run(LIVE, NAV);
  await p.waitForTimeout(800);
  const P = await p.evaluate(() => ({ ready: __P.ready, ports: __P.ports, loads: __P.loads }));
  assert.equal(P.loads, 2, 'the frame loaded twice (the page tears it down: public/js/live-common.js)');
  assert.equal(P.ports, 1, 'only the real frame ever handed over a port');
  assert.equal(P.ready, 2, 'the navigated page could only post a portless brb:ready');
  await ctx.close();
});
