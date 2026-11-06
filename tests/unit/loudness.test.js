// public/js/loudness.js: the play page's loudness listener for Remi's Quiet Meadow (docs/safety.md "Loudness"). The
// RMS maths, the error states, the page's answer to each frame message, and the listener against a fake microphone and
// a fake AudioContext: the analyser is never connected to the speakers, stop() stops every track and closes the context,
// and the file has no recorder and no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rmsDb, bytesToFloat, stateOf, loudDecision, createListener } from '../../public/js/loudness.js';

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

test('the file: no recorder, no network, no storage, and the speakers are never named', () => {
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['MediaRecorder', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'destination']) assert.ok(!code.includes(bad), bad);
  const play = fs.readFileSync('public/js/play.js', 'utf8');
  assert.ok(!play.includes('MediaRecorder') && !play.includes('getUserMedia'), 'play.js never opens the microphone itself');
  assert.ok(/if \(!d\.mic\) toFrame\(\{ type: 'brb:loudState', state: 'off' \}\)/.test(play), 'any other game\'s page answers off');
  assert.ok(/import\('\/js\/loudness\.js'\)/.test(play), 'loudness.js is loaded only when needed');
});
