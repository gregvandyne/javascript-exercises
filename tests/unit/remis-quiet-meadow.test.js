// Remi's Quiet Meadow (seed-games/remis-quiet-meadow.html): the level maths (dBFS to the gauge, smoothing), the room
// calibration and the "too loud" line, Remi's moods step by step (asleep, stirring, waking, grumpy, settling, the goal),
// stars, the game's words in all 13 languages, the scan, and child safety in the file itself (it never asks for the
// microphone and never records: the play page measures and passes a number).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scanVersion } from '../../server/services/scanner.js';
import * as lines from '../../server/services/tts-lines.js';

const html = fs.readFileSync('seed-games/remis-quiet-meadow.html', 'utf8');
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
const block = html.slice(html.indexOf('/* remi-core:begin */'), html.indexOf('/* remi-core:end */'));
const box = { window: {} }; vm.runInNewContext(block, box);
const C = box.window.RemiCore;

/** Run the core for `sec` seconds of a level function (t -> 0..100), smoothed like the game, at 20 steps a second. */
function run(s, sec, levelAt, { line = 50, held = () => false, dt = 0.05, start = 0, lv = { v: 0 } } = {}) {
  const ev = [];
  for (let i = 0; i < Math.round(sec / dt); i++) {
    const t = start + i * dt;
    lv.v = C.smooth(lv.v, levelAt(t), dt);
    const r = C.step(s, { level: lv.v, line, held: held(t), dt, rnd: (i * 0.37) % 1 });
    for (const e of r.events) ev.push({ ...e, t: Math.round(t * 100) / 100, state: s.state });
  }
  return ev;
}

test('dB to the gauge: -70 dBFS is 0, -10 is 100, clamped, and louder is always higher', () => {
  assert.equal(C.levelOf(-70), 0); assert.equal(C.levelOf(-10), 100); assert.equal(C.levelOf(-40), 50);
  assert.equal(C.levelOf(-100), 0); assert.equal(C.levelOf(0), 100); assert.equal(C.levelOf(NaN), 0); assert.equal(C.levelOf('x'), 0);
  let prev = -1; for (let db = -100; db <= 0; db += 0.5) { const l = C.levelOf(db); assert.ok(l >= prev); prev = l; }
});

test('smoothing: up fast (attack 0.12 s), down slowly (release 0.5 s), the same at any frame rate', () => {
  const reach = (from, to, dt) => { let v = from, t = 0; while (Math.abs(v - from) < Math.abs(to - from) * 0.632) { v = C.smooth(v, to, dt); t += dt; } return t; };
  for (const dt of [1 / 60, 1 / 30, 0.05]) {
    assert.ok(Math.abs(reach(0, 100, dt) - C.ATTACK) < 0.05, `attack ${dt}`);
    assert.ok(Math.abs(reach(100, 0, dt) - C.RELEASE) < 0.06, `release ${dt}`);
  }
  assert.equal(C.smooth(10, 50, 0), 10, 'no time, no change');
});

test('the line: the room\'s quiet plus the preset plus the fine slider, kept on the gauge', () => {
  assert.equal(C.line(30, 'whisper', 0), 40); assert.equal(C.line(30, 'quiet', 0), 48); assert.equal(C.line(30, 'group', 0), 60);
  assert.equal(C.line(undefined, 'quiet', 0), 48, 'uncalibrated: the room counts as 30');
  assert.equal(C.line(30, 'quiet', 10), 58); assert.equal(C.line(30, 'quiet', -10), 38);
  assert.equal(C.line(30, 'quiet', 99), 73, 'fine is capped at +25'); assert.equal(C.line(30, 'quiet', -99), 23);
  assert.equal(C.line(0, 'whisper', -25), 15, 'never under 15'); assert.equal(C.line(70, 'group', 25), 95, 'never over 95');
  assert.equal(C.line(30, 'bogus', 0), 48, 'an unknown preset is Quiet work');
});

test('calibration: the median of the room, too loud refused, no input refused', () => {
  const r = C.calibrate([22, 24, 90, 23, 25, 21, 24]);   // a cough does not move the median
  assert.deepEqual({ ok: r.ok, base: r.base }, { ok: true, base: 24 });
  assert.equal(C.line(r.base, 'quiet', 0), 42);
  assert.equal(C.calibrate([75, 80, 78, 77, 81]).why, 'tooLoud');
  assert.equal(C.calibrate([]).why, 'noInput'); assert.equal(C.calibrate([20, 21]).why, 'noInput', 'too few samples');
  assert.equal(C.median([3, 1, 2, 4]), 2.5); assert.equal(C.median([]), null);
});

test('silence: Remi sleeps and the quiet clock counts', () => {
  const s = C.make({ goal: 0 }); const ev = run(s, 30, () => 20);
  assert.equal(s.state, 'asleep'); assert.equal(s.wakes, 0); assert.ok(Math.abs(s.quiet - 30) < 0.06); assert.deepEqual(ev, []);
});

test('a single clap makes him stir at most: no wake-up', () => {
  const s = C.make(); const ev = run(s, 6, t => (t >= 1 && t < 1.2 ? 95 : 20));
  assert.equal(s.wakes, 0); assert.ok(!ev.some(e => e.type === 'wake'));
  assert.ok(ev.some(e => e.type === 'stir'), 'he stirs'); assert.equal(s.state, 'asleep', 'and settles again');
});

test('getting close to the line: he stirs (ear, tail, a peek or a murmur) with gaps, and stays asleep', () => {
  const s = C.make(); const ev = run(s, 10, () => 45);   // line 50, near band 40..50
  const stirs = ev.filter(e => e.type === 'stir');
  assert.equal(s.state, 'stirring'); assert.equal(s.wakes, 0);
  assert.ok(stirs.length >= 3 && stirs.length <= 5, `stirs every ~2.5 s (${stirs.length})`);
  for (const e of stirs) assert.ok(C.STIRS.includes(e.act));
  assert.ok(s.quiet > 9.9, 'stirring is still asleep: the clock runs');
});

test('1.6 s over the line wakes him once; the sequence yawns, grumbles, then he is grumpy', () => {
  const s = C.make(); const ev = run(s, 6, t => (t < 2.2 ? 85 : 20));
  const types = ev.map(e => e.type);
  assert.equal(types.filter(x => x === 'wake').length, 1); assert.equal(s.wakes, 1);
  const i = types.indexOf('wake');
  assert.deepEqual(types.slice(i, i + 4), ['wake', 'yawn', 'grumble', 'grumpy']);
  const w = ev[i]; assert.ok(w.t > 1.5 && w.t < 2.2, `wakes after about 1.5 s over the line (${w.t})`);
});

test('noise on 70% of the time still wakes him (the over-the-line count is leaky, not reset)', () => {
  const s = C.make(); run(s, 4, t => ((t % 1) < 0.7 ? 92 : 10));
  assert.equal(s.wakes, 1);
});

test('while held (Remi\'s own sound), the room is not listened to', () => {
  const s = C.make(); const ev = run(s, 5, () => 95, { held: () => true });
  assert.equal(s.wakes, 0); assert.equal(s.state, 'asleep'); assert.deepEqual(ev, []);
  const g = C.make(); run(g, 2.2, () => 90); run(g, 3, () => 90); assert.equal(g.state, 'grumpy');
  run(g, 6, () => 10, { held: () => true }); assert.equal(g.state, 'grumpy', 'calm while held does not count either');
});

test('grumpy + 4 s of calm: he lies back down and is asleep again; the clock never counts while he is awake', () => {
  const s = C.make(); run(s, 2.2, () => 90); run(s, 3, () => 90);
  assert.equal(s.state, 'grumpy'); const q = s.quiet;
  const ev = run(s, 3.9, () => 15); assert.equal(s.state, 'grumpy', 'not yet'); assert.equal(s.quiet, q);
  const ev2 = run(s, 3, () => 15);
  assert.deepEqual(ev2.map(e => e.type), ['settle', 'asleep']); assert.equal(s.state, 'asleep');
  assert.ok(s.quiet > q && s.quiet - q < 1.5, 'the clock runs again only once he is asleep');
  assert.deepEqual(ev, []);
});

test('noise while he lies down makes him grumpy again, with no extra wake-up', () => {
  const s = C.make(); run(s, 2.2, () => 90); run(s, 3, () => 90); run(s, 4.5, () => 10);
  assert.equal(s.state, 'settling');
  const ev = run(s, 1.2, () => 92);
  assert.ok(ev.some(e => e.type === 'regrump')); assert.equal(s.state, 'grumpy'); assert.equal(s.wakes, 1);
});

test('the goal: celebrate once, then nothing more; no goal never ends', () => {
  const s = C.make({ goal: 10 }); const ev = run(s, 15, () => 10);
  assert.deepEqual(ev.map(e => e.type), ['goal']); assert.equal(s.state, 'celebrate'); assert.equal(s.done, true); assert.equal(s.quiet, 10);
  const n = C.make({ goal: 0 }); run(n, 1900, () => 10, { dt: 0.25 }); assert.equal(n.state, 'asleep'); assert.ok(n.quiet > 1800);
  const w = C.make({ goal: 3 }); run(w, 2.2, () => 90); run(w, 10, () => 90); assert.equal(w.state, 'grumpy', 'the clock does not run while awake, so no goal');
});

test('stars: 3 for 0-1 wake-ups, 2 for 2-3, 1 for more', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(C.stars), [3, 3, 2, 2, 1, 1]);
});

test('the same steps always give the same Remi', () => {
  const a = C.make({ goal: 60 }), b = C.make({ goal: 60 }), f = t => 30 + 40 * Math.sin(t * 1.3) + 25 * Math.sin(t * 4.1);
  const ea = run(a, 50, f), eb = run(b, 50, f);
  assert.deepEqual(ea, eb); assert.deepEqual(a, b);
  assert.ok(ea.length > 3, 'something happened');
});

test('the words: every key in all 13 languages, the same placeholders, Remi named in each', () => {
  const blk = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
  const b = {}; vm.runInNewContext(blk + '\nthis.I18N = I18N;', b);
  const I = b.I18N, keys = Object.keys(I.en);
  assert.ok(keys.length > 50);
  const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of LANGS) {
    assert.ok(I[l], l);
    for (const k of keys) { assert.ok(typeof I[l][k] === 'string' && I[l][k].length, `${l}.${k}`); assert.equal(ph(I[l][k]), ph(I.en[k]), `${l}.${k} placeholders`); }
    assert.ok(I[l].title.includes('Remi'), `${l}: Remi stays Remi`);
    assert.ok(!Object.values(I[l]).some(v => typeof v !== 'string'), `${l}: no plural objects`);
  }
  // every key the game uses exists in English
  const game = html.slice(html.indexOf('// ==== I18N END ===='));
  const used = [...new Set([...game.matchAll(/\bt\('([A-Za-z_]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')))];
  for (const k of used) assert.ok(k in I.en, `t('${k}') is in the block`);
  for (const st of ['denied', 'nodevice', 'busy', 'unavailable', 'off']) { assert.ok(I.en['noMic_' + st] && I.en['noMic_' + st + '_p'], st); }
});

test('AI voices: registered, and only the calm lines are spoken (never while it listens)', () => {
  assert.ok(lines.TTS_GAMES.has('remis-quiet-meadow'));
  const g = lines.readGame('remis-quiet-meadow'), en = lines.gameLines('remis-quiet-meadow', 'en', g);
  assert.ok(en.length >= 5 && en.length < 12, `a few lines (${en.length})`);
  assert.ok(en.some(x => /Nothing is recorded/.test(x.text || x)), 'the privacy note can be read aloud');
});

test('the scan passes, the kit is pinned, and the json describes the game in every language', () => {
  assert.equal(scanVersion(html).status, 'pass');
  assert.ok(html.includes('<script src="/vendor/oomba-kit/1.1.3/oomba-kit.js" integrity="sha384-'), 'kit 1.1.3, pinned');
  assert.ok(!/packs\//.test(html), 'no packs');
  const j = JSON.parse(fs.readFileSync('seed-games/remis-quiet-meadow.json', 'utf8'));
  assert.equal(j.slug, 'remis-quiet-meadow'); assert.equal(j.title, "Remi's Quiet Meadow"); assert.equal(j.category, 'learning'); assert.equal(j.featured, true);
  assert.equal(j.players_max, 1); assert.equal(j.age_rating, 'everyone'); assert.match(j.description, /nothing is recorded/i);
  for (const l of LANGS.filter(x => x !== 'en' && x !== 'en-GB')) assert.ok(j.l10n[l] && j.l10n[l].title.includes('Remi') && j.l10n[l].description && j.l10n[l].tags, `l10n ${l}`);
});

test('child safety in the file: it never asks for the microphone, never records, never sends', () => {
  for (const bad of ['getUserMedia', 'mediaDevices', 'MediaRecorder', 'createMediaStreamSource', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'sendBeacon']) assert.ok(!html.includes(bad), bad);
  assert.ok(html.includes('BRB.loudness'), 'it only reads the number the page passes');
  assert.ok(/storage\.set\(KEY, \{ preset: CFG\.preset, fine: CFG\.fine, goal: CFG\.goal, base: CFG\.base \}\)/.test(html), 'only the teacher\'s settings are saved');
  assert.ok(html.includes("BRB.gameOver({ won: true, score: null })"), 'no score is submitted');
});

test('the art is our own: drawn in the file, no pictures embedded', () => {
  assert.ok(!/<img\b|data:image|\.png|\.jpe?g|\.webp/i.test(html), 'no image files');
  assert.ok(html.includes('/* remi-art:begin */') && html.includes('window.RemiArt'));
});
