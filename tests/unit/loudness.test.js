// public/js/loudness.js: the play page's loudness listener for Remi's Quiet Meadow (docs/safety.md "Loudness"). The
// RMS maths, the error states, the page's answer to each frame message, and the listener against a fake microphone and
// a fake AudioContext: the analyser is never connected to the speakers, stop() stops every track and closes the context,
// and the file has no recorder and no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rmsDb, bytesToFloat, stateOf, loudDecision, createListener, bridge } from '../../public/js/loudness.js';

const src = fs.readFileSync('public/js/loudness.js', 'utf8');

test('rmsDb: silence is -100, a full-scale sine about -3 dBFS, a DC offset is not sound, 0.1 steps', () => {
  assert.equal(rmsDb(new Float32Array(2048)), -100);
  assert.equal(rmsDb([]), -100); assert.equal(rmsDb(null), -100);
  const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 48000));
  assert.ok(Math.abs(rmsDb(sine) + 3.0) < 0.15, String(rmsDb(sine)));
  const quiet = sine.map(x => x * 0.01);
  assert.ok(Math.abs(rmsDb(quiet) + 43) < 0.2, String(rmsDb(quiet)));
  assert.equal(rmsDb(new Float32Array(1024).fill(0.5)), -100, 'a constant offset is silence');
  const shifted = sine.map(x => x * 0.01 + 0.3); assert.ok(Math.abs(rmsDb(shifted) - rmsDb(quiet)) < 0.15);
  const v = rmsDb(Float32Array.from({ length: 999 }, (_, i) => Math.sin(i) * 0.123)); assert.equal(Math.round(v * 10) / 10, v);
  assert.ok(rmsDb(new Float32Array(64).fill(1).map((x, i) => (i % 2 ? 1 : -1))) <= 0, 'never above 0');
});

test('bytesToFloat: 128 is silence, the old Safari fallback reads the same level', () => {
  assert.deepEqual([...bytesToFloat(new Uint8Array([128, 0, 255]))].map(x => Math.round(x * 100) / 100), [0, -1, 0.99]);
  const f = Float32Array.from({ length: 2048 }, (_, i) => Math.sin(i / 7) * 0.5), u = Uint8Array.from(f, x => Math.round(x * 128 + 128));
  assert.ok(Math.abs(rmsDb(bytesToFloat(u)) - rmsDb(f)) < 0.2);
});

test('stateOf: every failure becomes something the game can explain', () => {
  assert.equal(stateOf({ name: 'NotAllowedError' }), 'denied'); assert.equal(stateOf({ name: 'SecurityError' }), 'denied');
  assert.equal(stateOf({ name: 'NotFoundError' }), 'nodevice'); assert.equal(stateOf({ name: 'NotReadableError' }), 'busy');
  assert.equal(stateOf({ name: 'Whatever' }), 'unavailable'); assert.equal(stateOf(null), 'unavailable');
});

test('loudDecision: a page that may not listen always answers off; a start needs a real tap', () => {
  for (const op of ['hello', 'start', 'keep', 'stop', 'x']) assert.equal(loudDecision(false, op, true), 'off', op);
  assert.equal(loudDecision(true, 'hello', false), 'ready');
  assert.equal(loudDecision(true, 'start', true), 'start'); assert.equal(loudDecision(true, 'start', false), 'needsTap');
  assert.equal(loudDecision(true, 'keep', false), 'keep'); assert.equal(loudDecision(true, 'stop', false), 'stop'); assert.equal(loudDecision(true, 'nope', true), 'off');
});

// ---- a fake microphone and Web Audio
function fakes({ fail = null, state = 'running' } = {}) {
  const log = { connects: [], tracks: [], closed: 0, asked: null, intervals: 0, cleared: 0 };
  const track = () => { const t = { stopped: false, stop() { t.stopped = true; } }; log.tracks.push(t); return t; };
  const mediaDevices = { async getUserMedia(c) { log.asked = c; if (fail) { const e = new Error(fail); e.name = fail; throw e; } const ts = [track()]; return { getTracks: () => ts }; } };
  class AudioContext {
    constructor() { this.state = state; this.destination = { dest: true }; log.ctx = this; }
    createMediaStreamSource(s) { return { s, connect(n) { log.connects.push(['source', n]); }, disconnect() { log.disconnected = true; } }; }
    createAnalyser() { const a = { fftSize: 0, smoothingTimeConstant: 1, connect(n) { log.connects.push(['analyser', n]); }, getFloatTimeDomainData(b) { for (let i = 0; i < b.length; i++) b[i] = Math.sin(i / 3) * 0.25; } }; log.analyser = a; return a; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { log.closed++; this.state = 'closed'; return Promise.resolve(); }
  }
  let tick = null;
  const deps = { mediaDevices, AudioContext, setInterval: (fn) => { log.intervals++; tick = fn; return 7; }, clearInterval: () => { log.cleared++; tick = null; }, setTimeout: (fn) => { log.later = fn; return 1; } };
  return { log, deps, tick: () => tick && tick() };
}

test('the listener: no echo cancelling or gain tricks, the analyser goes nowhere, numbers come out, stop() stops it all', async () => {
  const f = fakes(), levels = [], states = [];
  const L = createListener({ onLevel: db => levels.push(db), onState: s => states.push(s) }, f.deps);
  assert.equal(await L.start(), 'on'); assert.deepEqual(states, ['on']); assert.equal(L.active(), true);
  assert.deepEqual(f.log.asked, { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  assert.deepEqual(f.log.connects.map(c => c[0]), ['source'], 'only the source is connected (to the analyser)');
  assert.equal(f.log.connects[0][1], f.log.analyser);
  assert.ok(!f.log.connects.some(c => c[1] && c[1].dest), 'never to the speakers');
  assert.equal(f.log.analyser.smoothingTimeConstant, 0); assert.equal(f.log.analyser.fftSize, 2048);
  f.tick(); f.tick();
  assert.equal(levels.length, 2); assert.ok(levels[0] < -10 && levels[0] > -20, String(levels[0]));
  L.stop();
  assert.ok(f.log.tracks.every(t => t.stopped), 'every track stopped'); assert.equal(f.log.closed, 1); assert.equal(f.log.cleared, 1); assert.equal(L.active(), false);
  f.tick(); assert.equal(levels.length, 2, 'nothing after stop');
});

test('the listener: refusals become states, no device API means unavailable, a suspended context asks for a tap', async () => {
  for (const [name, st] of [['NotAllowedError', 'denied'], ['NotFoundError', 'nodevice'], ['NotReadableError', 'busy']]) {
    const f = fakes({ fail: name }), states = [];
    assert.equal(await createListener({ onState: s => states.push(s) }, f.deps).start(), st); assert.deepEqual(states, [st]);
  }
  assert.equal(await createListener({}, { mediaDevices: null, AudioContext: null, setInterval, clearInterval, setTimeout }).start(), 'unavailable');
  const f = fakes({ state: 'suspended' }), states = [];
  const L = createListener({ onState: s => states.push(s) }, f.deps);
  f.deps.AudioContext.prototype.resume = function () { return new Promise(() => {}); };   // the browser ignores the resume
  await L.start(); f.log.later();
  assert.deepEqual(states, ['on', 'needsTap']); L.stop();
});

test('stopped while the browser prompt is up: the tracks it then gets are stopped at once', async () => {
  const f = fakes(); let release;
  f.deps.mediaDevices.getUserMedia = () => new Promise(r => { release = () => r({ getTracks: () => [f.log.tracks[0] || (f.log.tracks.push({ stopped: false, stop() { this.stopped = true; } }), f.log.tracks[0])] }); });
  const L = createListener({}, f.deps); const p = L.start(); L.stop(); release();
  assert.equal(await p, 'stopped'); assert.ok(f.log.tracks[0].stopped); assert.equal(L.active(), false);
});

// ---- the page's bridge, with a fake listener, a fake clock and no DOM
function fakeBridge() {
  const sent = [], ui = { pill: null, tap: null, mic: null }; let h = null, active = false, clock = 0, every = null, release = null;
  const L = { start: () => new Promise(r => { release = st => { if (st === 'on') { active = true; h.onState('on'); } r(st); }; }),   // the tracks exist only once the prompt is answered
    stop() { active = false; }, active: () => active, resume() { h.onState('on'); return Promise.resolve(); } };
  const b = bridge({ toFrame: m => sent.push(m.state || m.db) }, {
    listen: x => { h = x; return L; }, now: () => clock, every: fn => { every = fn; return 1; }, clearEvery: () => { every = null; }, events: false,
    ui: { pill: on => { ui.pill = on; }, tap: (on, fn) => { ui.tap = on ? fn : null; }, mic: on => { ui.mic = on; } } });
  return { b, sent, ui, L, state: s => h.onState(s), level: db => h.onLevel(db), tick: ms => { clock += ms; if (every) every(); }, release: st => release(st), get active() { return active; } };
}

test('bridge: hello is ready; a start needs a tap; on, numbers flow and the keep-alive holds the lease (6 s)', async () => {
  const f = fakeBridge();
  await f.b.message({ op: 'hello' }, false); assert.deepEqual(f.sent, ['ready']);
  await f.b.message({ op: 'start' }, false); assert.equal(f.sent.at(-1), 'needsTap'); assert.equal(f.active, false, 'no tap, no microphone');
  const p = f.b.message({ op: 'start' }, true); f.release('on'); await p;
  assert.equal(f.sent.at(-1), 'on'); assert.equal(f.ui.pill, true); assert.equal(f.ui.mic, true);
  f.level(-40); assert.equal(f.sent.at(-1), -40);
  f.tick(4000); await f.b.message({ op: 'keep' }); f.tick(4000); assert.equal(f.active, true, 'kept alive');
  f.tick(2500); assert.equal(f.active, false, 'no keep-alive for 6 s: stopped'); assert.equal(f.sent.at(-1), 'stopped'); assert.equal(f.ui.pill, false);
});

test('bridge: while the page waits for its own tap the lease waits (up to a minute), no numbers go out, and the tap renews it', async () => {
  const f = fakeBridge();
  const p = f.b.message({ op: 'start' }, true); f.release('on'); await p;
  f.state('needsTap'); assert.equal(f.sent.at(-1), 'needsTap'); assert.equal(typeof f.ui.tap, 'function');
  f.level(-30); assert.notEqual(f.sent.at(-1), -30, 'nothing measured while it waits');
  f.tick(10000); f.tick(10000); assert.equal(f.active, true, 'not stopped after 20 s without a keep-alive');
  f.ui.tap(); assert.equal(f.sent.at(-1), 'on'); assert.equal(f.ui.tap, null);
  f.tick(5000); assert.equal(f.active, true, 'the tap renewed the lease');
  f.state('needsTap'); f.tick(61000); assert.equal(f.active, false, 'a minute with no tap: stopped');
});

test('bridge: stopped while the browser prompt is up, the game is told (it does not wait 2 minutes)', async () => {
  const f = fakeBridge();
  const p = f.b.message({ op: 'start' }, true);
  f.b.stop('stopped'); assert.equal(f.sent.at(-1), 'stopped');
  f.release('stopped'); await p;
});

test('the file: no recorder, no network, no storage, and the speakers are never named', () => {
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['MediaRecorder', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'destination']) assert.ok(!code.includes(bad), bad);
  const play = fs.readFileSync('public/js/play.js', 'utf8');
  assert.ok(!play.includes('MediaRecorder') && !play.includes('getUserMedia'), 'play.js never opens the microphone itself');
  assert.ok(/if \(!d\.mic\) toFrame\(\{ type: 'brb:loudState', state: 'off' \}\)/.test(play), 'any other game\'s page answers off');
  assert.ok(/import\('\/js\/loudness\.js'\)/.test(play), 'loudness.js is loaded only when needed');
});

// ---- the frame's side (public/sdk/brb-sdk.js "Loudness"), with a fake parent, clock and send
function fakeSdk() {
  const sdk = fs.readFileSync('public/sdk/brb-sdk.js', 'utf8');
  const a = sdk.indexOf("  var LOUD_STATES"), b = sdk.indexOf('\n', sdk.indexOf("Object.defineProperty(loudApi, 'state'"));
  const sent = [], listeners = [], timers = []; let id = 0;
  const parent = {};
  const win = { addEventListener: (n, f) => { if (n === 'message') listeners.push(f); } };
  const add = (f, ms, every) => { timers.push({ id: ++id, f, ms, every, done: false }); return id; };
  const clear = i => { const t = timers.find(x => x.id === i); if (t) t.done = true; };
  const api = new Function('window', 'parentWin', 'send', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    sdk.slice(a, b) + '\nreturn loudApi;')(win, parent, (type, m) => sent.push(m.op), (f, ms) => add(f, ms, false), clear, (f, ms) => add(f, ms, true), clear);
  const page = state => listeners.forEach(f => f({ source: parent, data: { brb: 1, type: 'brb:loudState', state } }));
  const fire = ms => timers.filter(t => !t.done && t.ms === ms).forEach(t => { if (!t.every) t.done = true; t.f(); });
  return { api, sent, page, fire, keeps: () => sent.filter(x => x === 'keep').length, flush: () => new Promise(r => setImmediate(r)) };
}

test('SDK: keep-alives only after the game\'s own start (at once, then every 2 s, also while the page waits for a tap)', async () => {
  const f = fakeSdk();
  f.page('on');   // an "on" the game never asked for (a start from before a reload)
  assert.equal(f.keeps(), 0, 'no keep-alive'); assert.deepEqual(f.sent, ['stop'], 'and the page is told to stop'); assert.equal(f.api.state, 'idle');
  const p = f.api.start(); await f.flush(); assert.equal(f.sent.at(-1), 'hello');
  f.page('ready'); await f.flush(); assert.equal(f.sent.at(-1), 'start');
  f.page('on'); assert.equal(await p, 'on'); assert.equal(f.keeps(), 1, 'one keep at once');
  f.fire(2000); assert.equal(f.keeps(), 2);
  f.page('needsTap'); f.fire(2000); assert.equal(f.keeps(), 3, 'the lease stays alive while the page waits for its tap');
  f.page('on'); f.fire(2000); assert.equal(f.keeps(), 4);
  f.api.stop(); f.fire(2000); assert.equal(f.keeps(), 4, 'none after stop()');
  f.page('on'); assert.equal(f.sent.at(-1), 'stop', 'an on after stop() is refused');
});

test('SDK: a slow page does not lock the game into "no mic": a hello timeout is not remembered', async () => {
  const f = fakeSdk();
  const p = f.api.available(); f.fire(800); assert.equal(await p, false);
  const q = f.api.available(); await f.flush(); assert.equal(f.sent.filter(x => x === 'hello').length, 2, 'asked again');
  f.page('ready'); assert.equal(await q, true);
  assert.equal(await f.api.available(), true); assert.equal(f.sent.filter(x => x === 'hello').length, 2, 'the page\'s answer is remembered');
  const g = fakeSdk(); const r = g.api.available(); g.page('off'); assert.equal(await r, false); assert.equal(await g.api.available(), false);
  assert.equal(g.sent.filter(x => x === 'hello').length, 1, 'a real "off" is remembered');
});
