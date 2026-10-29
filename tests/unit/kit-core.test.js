// Oomba Kit core (kit/src, imported directly; no DOM): easing, tweens and springs, the seeded RNG, the fixed-step
// loop, input edges, i18n in the 13 site languages, save, settings, validate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ease, EASE_NAMES } from '../../kit/src/ease.js';
import { Tweener } from '../../kit/src/tween.js';
import { rand, mulberry32, seedOf, noise1 } from '../../kit/src/rand.js';
import { Loop, STEP_MS } from '../../kit/src/loop.js';
import { Input } from '../../kit/src/input.js';
import { I18n, splitUnits, normLang, dirOf } from '../../kit/src/i18n.js';
import { KEYS, LANGS, chromeStrings } from '../../kit/src/strings.js';
import { Save, memoryStorage } from '../../kit/src/save.js';
import { Settings } from '../../kit/src/settings.js';
import { validate, nearest, editDistance } from '../../kit/src/validate.js';
import { color, outline, rimWidth, nearestHue, PALETTE } from '../../kit/src/tokens.js';
import { contrast, hexToOklab, oklabToHex, mixHex } from '../../kit/src/color.js';

test('31 easings: exact ends, monotonic where expected, bounded overshoot', () => {
  assert.equal(EASE_NAMES.length, 31);
  for (const n of EASE_NAMES) {
    assert.ok(Math.abs(ease[n](0)) < 1e-9, `${n}(0)`); assert.ok(Math.abs(ease[n](1) - 1) < 1e-9, `${n}(1)`);
    let lo = 0, hi = 1, prev = 0, mono = true;
    for (let i = 1; i <= 200; i++) { const v = ease[n](i / 200); lo = Math.min(lo, v); hi = Math.max(hi, v); if (v < prev - 1e-9) mono = false; prev = v; }
    if (/^(linear|sine|quad|cubic|quart|quint|expo|circ)/.test(n)) assert.ok(mono, `${n} is monotonic`);
    if (/^back/.test(n)) assert.ok(lo > -0.2 && hi < 1.2, `${n} overshoot ${lo}..${hi}`);
    if (/^elastic/.test(n)) assert.ok(lo > -0.5 && hi < 1.5, `${n} overshoot ${lo}..${hi}`);
  }
});

test('tweens, timers and springs run on the kit clock only', async () => {
  const tw = new Tweener(); const o = { x: 0, a: 1 };
  const p = tw.tween(o, { x: 100 }, { ms: 200, ease: 'linear' });
  tw.tick(100); assert.equal(Math.round(o.x), 50);
  tw.tick(150); assert.equal(o.x, 100); assert.equal(await p, true);
  const d = tw.tween(o, { a: 0 }, { ms: 100, delay: 50 }); tw.tick(40); assert.equal(o.a, 1, 'still waiting for its delay'); d.cancel(); assert.equal(await d, false);
  let fired = 0; tw.after(30, () => fired++); const stop = tw.every(10, () => fired++);
  tw.tick(10); tw.tick(10); tw.tick(10); stop(); tw.tick(100);
  assert.equal(fired, 4, '3 every + 1 after');
  // spring (k 180, zeta .55) settles within tolerance; zeta >= 1 never overshoots
  const s = { v: 0 }; const sp = tw.spring(s, 'v', { k: 180, zeta: 0.55 }); sp.to(1);
  let peak = 0; for (let i = 0; i < 300; i++) { tw.tick(1000 / 60); peak = Math.max(peak, s.v); }
  assert.ok(Math.abs(s.v - 1) < 1e-3 && peak > 1.05, `settles at 1 after overshooting (${peak})`);
  const c = { v: 0 }; const cs = tw.spring(c, 'v', { k: 260, zeta: 1 }); cs.to(1); let over = 0; for (let i = 0; i < 300; i++) { tw.tick(1000 / 60); over = Math.max(over, c.v); }
  assert.ok(over <= 1 + 1e-6, 'critically damped: no overshoot');
});

test('seeded randomness: golden values, ranges, shuffle is a permutation', () => {
  const r = mulberry32(42);
  assert.deepEqual([r(), r(), r()].map(v => v.toFixed(8)), ['0.60110375', '0.44829056', '0.85246579']);
  assert.equal(seedOf('meadow'), seedOf('meadow')); assert.notEqual(seedOf('meadow'), seedOf('meadow2'));
  const g = rand('x'); for (let i = 0; i < 500; i++) { const n = g.int(2, 5); assert.ok(n >= 2 && n <= 5 && Number.isInteger(n)); }
  const a = [1, 2, 3, 4, 5, 6]; const sh = rand(9).shuffle(a); assert.deepEqual([...sh].sort(), a); assert.deepEqual(a, [1, 2, 3, 4, 5, 6], 'copy, not in place');
  for (let x = 0; x < 50; x += 0.37) assert.ok(Math.abs(noise1(x)) <= 1);
});

test('loop: fixed 60 Hz steps, at most 5 a frame, hit-stop, slow-mo, pause, step(n)', () => {
  let n = 0; const L = new Loop({ update: () => n++ });
  L.frame(0); assert.equal(n, 1, 'first frame runs one step');
  L.frame(1000 / 30); assert.equal(n, 3, '33 ms -> 2 steps');
  L.frame(1000 / 30 + 500); assert.equal(n, 8, 'a long frame is capped at 5 steps');
  const T = 1000 / 30 + 500, before = n; L.hitstop(60); L.frame(T + 16); L.frame(T + 32); L.frame(T + 48); assert.equal(n, before, 'no updates during hit-stop');
  L.frame(T + 120); assert.ok(n > before);
  const b2 = n; L.slowmo(0.5, 1000); for (let t = T + 136; t <= T + 1136; t += 1000 / 60) L.frame(t); assert.ok(n - b2 >= 28 && n - b2 <= 33, `half speed ~30 steps (${n - b2})`);
  L.pause('modal'); const b3 = n; L.frame(T + 1200); L.frame(T + 1300); assert.equal(n, b3); assert.equal(L.paused, true);
  L.resume('modal'); L.step(10); assert.equal(n, b3 + 10, 'step(n) runs n updates');
  const s = L.frameStats(); assert.ok(s.p50 > 0 && s.max <= 100);
  assert.ok(Math.abs(L.game - L.steps * STEP_MS) < 1e-6, 'game time is steps x 1/60 s');
});

test('input: actions, latched edges (a tap shorter than a frame counts), axis, gamepad', () => {
  const I = new Input();
  I.srcDown('Space'); I.srcUp('Space'); I.update();
  assert.equal(I.pressed('jump'), true, 'latched tap'); assert.equal(I.pressed('confirm'), true);
  I.update(); assert.equal(I.down('jump'), false); assert.equal(I.released('jump'), true);
  I.srcDown('KeyD'); I.update(); assert.deepEqual({ ...I.axis() }, { x: 1, y: 0 });
  I.srcDown('ArrowUp'); I.update(); const a = I.axis(); assert.ok(Math.abs(Math.hypot(a.x, a.y) - 1) < 1e-9, 'diagonal is normalised');
  I.srcUp('KeyD'); I.srcUp('ArrowUp'); I.update();
  const pad = { connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })), axes: [-0.9, 0] };
  I.update([pad]); assert.equal(I.pressed('jump'), true, 'pad A jumps'); assert.ok(I.axis().x < -0.8, 'left stick');
  I.map({ dash: ['ShiftLeft'] }); I.srcDown('ShiftLeft'); I.update([]); assert.equal(I.down('dash'), true);
});

test('i18n: every chrome key in all 13 languages, plurals, numbers, RTL, typewriter units', () => {
  assert.equal(LANGS.length, 13);
  const all = chromeStrings();
  for (const l of LANGS) for (const k of KEYS) assert.ok(typeof all[l][k] === 'string' && all[l][k].length, `${l}.${k}`);
  const t = new I18n('ru');
  assert.equal(t.t('sparks', { n: 1 }), '1 искра'); assert.equal(t.t('sparks', { n: 3 }), '3 искры'); assert.equal(t.t('sparks', { n: 5 }), '5 искр');
  const ar = new I18n('ar'); assert.equal(ar.dir, 'rtl'); assert.equal(ar.t('sparks', { n: 2 }), 'شرارتان');
  assert.equal(new I18n('he').dir, 'rtl'); assert.equal(dirOf('en'), 'ltr');
  const en = new I18n('en'); assert.equal(en.t('sparksOf', { n: 3, total: 12 }), '3 of 12'); assert.equal(en.t('nope'), 'nope');
  en.strings({ en: { hi: 'Hi {name}' }, fr: { hi: 'Salut {name}' } }); assert.equal(en.t('hi', { name: 'Zoe' }), 'Hi Zoe');
  const de = new I18n('de'); assert.equal(de.num(1234.5), '1.234,5');
  assert.equal(normLang('pt-BR'), 'pt'); assert.equal(normLang('zh-TW'), 'zh-Hant'); assert.equal(normLang('xx'), 'en'); assert.equal(normLang('en-GB'), 'en-GB');
  new I18n('fr').strings({ en: { only: 'English' } }); assert.equal(new I18n('fr').t('play'), 'Jouer');
  const g = new I18n('fr'); g.strings({ en: { only: 'English only' } }); assert.equal(g.t('only'), 'English only', 'missing language falls back to en');
  assert.deepEqual(splitUnits('مرحبا بك', 'ar').filter(s => s.trim()), ['مرحبا', 'بك'], 'Arabic by word');
  assert.equal(splitUnits('こんにちは', 'ja').length, 5, 'Japanese by character');
  assert.equal(splitUnits('👍🏽a', 'en').length, 2, 'never splits a grapheme cluster');
});

test('save: versioned, migrates, size-guarded, batched writes', () => {
  const store = memoryStorage();
  const s = new Save(store); s.define({ v: 1, defaults: { best: 0, hats: [] } });
  s.set({ best: 12 }); assert.equal(store.get('__ok_save'), null, 'nothing written until flush'); s.flush();
  assert.deepEqual(store.get('__ok_save'), { v: 1, d: { best: 12, hats: [] } });
  const s2 = new Save(store); s2.define({ v: 2, defaults: { best: 0, stars: 0 }, migrate: (old, from) => ({ best: old.best, stars: from }) });
  assert.deepEqual(s2.get(), { best: 12, stars: 1 });
  const warns = []; s2.warn = w => warns.push(w); s2.set({ big: 'x'.repeat(40000) }); assert.equal(s2.flush(), false); assert.equal(warns.length, 1);
  const s3 = new Save(store); s3.define({ v: 3, defaults: { fresh: true } }); assert.deepEqual(s3.get(), { fresh: true }, 'no migrate: start fresh');
});

test('settings: validated, saved, reduced motion from setting > BRB.motion > media query', () => {
  const store = memoryStorage();
  const mq = { matches: true, addEventListener() {} };
  const win = { matchMedia: () => mq };
  const s = new Settings({ storage: store, win, brb: { motion: '' } });
  assert.equal(s.reduced, true, 'media query');
  s.patch({ motion: 'full', textSize: 3, speed: 0.75, bogus: 1 });
  assert.equal(s.reduced, false); assert.equal(s.get('textSize'), 1, 'bad value ignored'); assert.equal(s.get('speed'), 0.75);
  assert.equal(store.get('__ok_settings').speed, 0.75);
  assert.equal(new Settings({ storage: memoryStorage(), win, brb: { motion: 'full' } }).reduced, false, 'BRB.motion beats the media query');
});

test('validate: species, colours, sizes, legends, parts', () => {
  const c = validate('char', { species: 'foxx', size: 9, colors: { base: '#FF6A5A' } });
  assert.equal(c.spec.species, 'fox'); assert.equal(c.spec.size, 1.4); assert.equal(c.spec.colors.base, 'coral'); assert.ok(Object.isFrozen(c.spec));
  assert.equal(validate('char', { species: 'dragonzilla' }).spec.species, 'oomba');
  assert.equal(nearest('buny', ['bunny', 'frog'], 'x'), 'bunny'); assert.equal(editDistance('kitten', 'sitting'), 3);
  const L = validate('legend', { '@': 'gem', ab: 'oops', '🐝': 'bee' });
  assert.deepEqual(Object.keys(L.spec), ['@', '🐝']); assert.match(L.warnings.join(), /"ab" must be one character/);
  const P = validate('parts', ['bob', 'teleport']); assert.deepEqual(P.spec, ['bob']); assert.match(P.warnings[0], /teleport/);
  const g = validate('game', { size: [10, 99999], howTo: [1, 2, 3, 4] }); assert.deepEqual(g.spec.size, [320, 2160]); assert.equal(g.spec.howTo.length, 3);
});

test('tokens: brand values fixed, roles, outline formula, night lifts L but never spark', () => {
  assert.equal(color('player'), '#66C792'); assert.equal(color('mint', 'shade'), '#1F9D63'); assert.equal(color('reward'), '#FFD23F'); assert.equal(color('spark', 'shade'), '#C99A00');
  assert.equal(color('hazard'), PALETTE.coral[2]); assert.equal(color('nonsense'), '#141414');
  assert.equal(color('reward', 'base', true), '#FFD23F', 'spark stays exactly #FFD23F at night');
  assert.ok(hexToOklab(color('player', 'base', true))[0] > hexToOklab('#66C792')[0] + 0.04, 'night lifts objects +0.05 L');
  assert.equal(outline(10), 2); assert.equal(outline(60), 0.055 * 60); assert.equal(outline(500), 6); assert.equal(rimWidth(2), 2); assert.equal(rimWidth(6), 2.7);
  assert.equal(nearestHue('#FF6A5A').hue, 'coral');
  assert.equal(oklabToHex(...hexToOklab('#66C792')), '#66C792', 'OKLab round trip');
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.ok(contrast('#141414', '#FFFDF2') > 15);
});
