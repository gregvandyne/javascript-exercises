// The Oomba Kit's public API without a browser (a minimal fake window): the documented API reference
// (docs/kit-api.md) names exactly what exists, test hooks are honest, the two clocks, deprecations warn once, key
// sounds caption, the quiz refuses a wrong answer key, the loop pauses on a lost focus and the audio sleeps when hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKit } from '../../kit/src/index.js';
import { runLoop, Loop } from '../../kit/src/loop.js';
import { KitAudio } from '../../kit/src/audio.js';
import { distractors } from '../../kit/src/screens.js';
import { hairFor } from '../../kit/src/chars.js';
import { contrast } from '../../kit/src/color.js';
import { SKIN, HAIR } from '../../kit/src/tokens.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function fakeWin(o = {}) {
  const listeners = {};
  const el = tag => ({ tag, children: [], style: { setProperty() {} }, classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, on) { if (on === undefined ? !this._s.has(c) : on) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); }, insertBefore(c) { return this.appendChild(c); },
    addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, textContent: '' });
  const doc = { currentScript: null, documentElement: el('html'), head: el('head'), body: el('body'), createElement: el, getElementById: () => null, addEventListener: (k, f) => { (listeners['doc:' + k] = listeners['doc:' + k] || []).push(f); }, removeEventListener() {}, querySelectorAll: () => [], visibilityState: 'visible' };
  const warns = [];
  const win = { document: doc, location: { search: o.search || '' }, addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); }, removeEventListener() {}, console: { warn: (...a) => warns.push(a.join(' ')), error() {}, log() {} },
    navigator: {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, __listeners: listeners, __warns: warns };
  return win;
}

/** Every `Oomba.a.b(...)` the reference names must exist; every public name must be in the reference. */
test('docs/kit-api.md (what a model reads) names exactly what exists', async () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs/kit-api.md'), 'utf8');
  // with the pack that adds a public name (bridge-3d: Oomba.three) loaded, as a 3D game has it
  const w = fakeWin(), O = createKit(w); w.Oomba = O;
  const bridge = await import('../../kit/packs/bridge-3d.js'); O.__pk({ name: 'bridge-3d', version: O.version }, bridge.define);
  assert.equal(typeof O.three, 'function');
  const livePack = await import('../../kit/packs/live.js'); O.__pk({ name: 'live', version: O.version }, livePack.define);
  assert.equal(typeof O.live, 'object');
  const named = new Set([...doc.matchAll(/\bOomba\.([a-zA-Z]+(?:\.[a-zA-Z]+)*)/g)].map(m => m[1]));
  const at = p => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), O);
  for (const p of named) assert.notEqual(at(p), undefined, `docs/kit-api.md names Oomba.${p}, which does not exist`);
  for (const k of Object.keys(O)) assert.ok([...named].some(p => p === k || p.startsWith(k + '.')), `Oomba.${k} is public but not in docs/kit-api.md`);
  for (const ns of ['time', 'input', 'ui', 'juice', 'art', 'save', 'level']) for (const k of Object.keys(O[ns])) assert.ok(named.has(ns + '.' + k) || [...named].some(p => p.startsWith(ns + '.' + k + '.')), `Oomba.${ns}.${k} is public but not in docs/kit-api.md`);
  assert.doesNotMatch(doc, /Oomba\.debug|Oomba\.__pk|\bw\._/, 'nothing internal in the reference');
});

test('Oomba.debug exists only with ?okDebug=1, and is not enumerable', () => {
  assert.equal(createKit(fakeWin()).debug, undefined);
  const O = createKit(fakeWin({ search: '?okDebug=1' }));
  assert.ok(O.debug && O.debug.kit); assert.ok(!Object.keys(O).includes('debug'));
});

test('__brbTest is honest: start/win/skip appear only when the game registers them; state() says game:false until then', () => {
  const w = fakeWin(); const O = createKit(w); const T = w.__brbTest;
  assert.equal(typeof T.state, 'function'); assert.equal(T.start, undefined); assert.equal(T.state().game, false);
  O.test({ state: () => ({ level: 2 }), start: () => 'started' });
  assert.equal(T.start(), 'started'); assert.deepEqual([T.state().game, T.state().level], [true, 2]); assert.equal(T.win, undefined);
  O.scene = 'play'; assert.equal(T.state().scene, 'play');
  // a game's own __brbTest.start is never replaced
  const w2 = fakeWin(); w2.__brbTest = { start: () => 'mine' }; const O2 = createKit(w2); O2.test({ start: () => 'kit' }); assert.equal(w2.__brbTest.start(), 'mine');
});

test('two clocks: Oomba.after / time.after stop with the game; time.real.after runs through the pause screen', () => {
  const O = createKit(fakeWin({ search: '?okDebug=1' })), loop = O.debug.kit.loop;
  const fired = [];
  O.after(100, () => fired.push('game')); O.time.after(100, () => fired.push('time')); O.time.real.after(100, () => fired.push('real'));
  O.time.pause('menu'); loop.frame(0); for (let t = 16; t <= 400; t += 16) loop.frame(t);
  assert.deepEqual(fired, ['real'], 'paused: only real time runs');
  O.time.resume('menu'); for (let t = 416; t <= 800; t += 16) loop.frame(t);
  assert.deepEqual(fired.sort(), ['game', 'real', 'time']);
});

test('deprecate() warns once; an unknown api version warns; key sounds caption (throttled), others do not', () => {
  const w = fakeWin({ search: '?okDebug=1' }); const O = createKit(w), kit = O.debug.kit;
  kit.deprecate('Oomba.old', 'use Oomba.new'); kit.deprecate('Oomba.old');
  assert.equal(w.__warns.filter(m => /Oomba\.old is deprecated/.test(m)).length, 1);
  const shown = []; kit.ui.caption = t => shown.push(t);
  O.sfx('correct'); assert.deepEqual(shown, [], 'captions off: nothing');
  O.settings.captions = true;
  O.sfx('correct'); O.sfx('correct'); O.sfx('select'); O.sfx('hurt'); O.sfx('pop', { caption: 'sndGate' }); O.sfx('wrong', { caption: false });
  assert.deepEqual(shown, ['[ding]', '[ouch]', '[gate opens]'], 'key sounds caption once each (throttled); plain sounds do not');
});

test('ui.ask: one answer field by value (a or answer), index for a tile; refuses an answer that is not a choice', async () => {
  const w = fakeWin(); const O = createKit(w);
  await assert.rejects(() => O.ui.ask({ q: '7 x 6?', a: 41, choices: [40, 42, 48, 36] }), /not one of the choices/);
  await assert.rejects(() => O.ui.ask({ q: 'x', answer: 3, choices: [4, 5, 6, 7] }), /not one of the choices/, 'a number is a value, never an index');
  assert.ok(w.__warns.some(m => /ui\.ask/.test(m)));
  const d = distractors(42, 4, '7 × 6'); assert.equal(d.length, 4); assert.ok(d.includes('42')); assert.equal(new Set(d).size, 4);
  assert.deepEqual(distractors(42, 4, '7 × 6'), d, 'seeded by the question');
});

test('the loop pauses on a lost focus and on a hidden page; the audio thread sleeps while hidden', () => {
  const w = fakeWin(); const L = new Loop(); const calls = [];
  L.onBlur = () => calls.push('blur'); L.onHide = () => calls.push('hide'); L.onShow = () => calls.push('show');
  const stop = runLoop(L, w);
  w.__listeners.blur[0](); assert.equal(L.paused, true); assert.ok(L.reasons.has('blur'));
  w.__listeners.focus[0](); assert.equal(L.paused, false);
  w.document.visibilityState = 'hidden'; w.__listeners['doc:visibilitychange'][0](); assert.ok(L.reasons.has('hidden'));
  w.document.visibilityState = 'visible'; w.__listeners['doc:visibilitychange'][0](); assert.equal(L.paused, false);
  assert.deepEqual(calls, ['blur', 'hide', 'show']); stop();
  const A = new KitAudio({}); const st = []; A.ctx = { state: 'running', currentTime: 3, suspend() { st.push('s'); this.state = 'suspended'; }, resume() { st.push('r'); this.state = 'running'; return Promise.resolve(); } };
  A.suspend(); A.resume(); assert.deepEqual(st, ['s', 'r']); assert.ok(A.nextNote > 3, 'the music clock restarts');
});

test('hair reads against the face (moves toward 3:1 within a recognisable shift)', () => {
  for (const [name, h] of Object.entries(HAIR)) for (const s of SKIN) {
    const out = hairFor(h, s), before = contrast(h, s), after = contrast(out, s);
    assert.ok(after >= Math.min(3, before) - 1e-9, `${name} on ${s}: never worse`);
    if (before >= 3) assert.equal(out, h, 'already fine: unchanged');
  }
  assert.ok(contrast(hairFor(HAIR.cocoa, SKIN[6]), SKIN[6]) > contrast(HAIR.cocoa, SKIN[6]) + 0.5, 'cocoa hair on dark skin lifts clearly');
});
