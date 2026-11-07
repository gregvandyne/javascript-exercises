// Doodle Hoot's rules (window.DoodleCore, read from seed-games/doodle-hoot.html by server/live/doodle-core.js: the same
// code the game and Oomba Live run): graphemes in 13 languages, trays (every answer letter, decoys by level, no twins on
// Easy, never in answer order, never a rude word), the guess check, hints, points, and the stroke steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { doodle, source } from '../../server/live/doodle-core.js';

const { DoodleCore: C, DoodleWords: D } = doodle();
// (values made in the vm context have its own Array prototype: compare as JSON)
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

test('the blocks load from the game file and are frozen', () => {
  assert.match(source(), /doodle-core:begin[\s\S]*doodle-words:end/);
  assert.ok(Object.isFrozen(C) && Object.isFrozen(D));
  assert.equal(C.W, 1000); assert.equal(C.H, 750);
  assert.equal(C.PALETTE.length, 12); assert.equal(C.COLORS.length, 12); assert.equal(C.SIZES.length, 4);
  assert.equal(C.PAPER, '#FFFFFF');
});

test('graphemes: one tile per letter in every script, spaces split words', () => {
  deq(C.graphemes('café'), ['c', 'a', 'f', 'é']);
  deq(C.graphemes('café'), ['c', 'a', 'f', 'é'], 'NFD and NFC are the same letters');
  deq(C.parts('ice cream', 'en'), { g: ['i', 'c', 'e', 'c', 'r', 'e', 'a', 'm'], groups: [3, 5] });
  deq(C.graphemes('قطة', 'ar'), ['ق', 'ط', 'ة']);
  deq(C.graphemes('ענבים', 'he'), ['ע', 'נ', 'ב', 'י', 'ם']);
  deq(C.graphemes('きょうりゅう', 'ja'), ['き', 'ょ', 'う', 'り', 'ゅ', 'う'], 'small kana are their own tiles');
  deq(C.graphemes('ジェットコースター', 'ja').slice(-2), ['タ', 'ー'], 'the long vowel mark is a tile');
  deq(C.graphemes('長頸鹿', 'zh-Hant'), ['長', '頸', '鹿']);
  assert.equal(C.shown('é', 'fr'), 'É'); assert.equal(C.shown('ß', 'de'), 'ß', 'ß never becomes SS');
  assert.equal(C.shown('ё', 'ru'), 'Ё'); assert.equal(C.shown('ね', 'ja'), 'ね');
  assert.equal(C.dir('ar'), 'rtl'); assert.equal(C.dir('he'), 'rtl'); assert.equal(C.dir('fr'), 'ltr');
});

test('a tray: every answer letter (with its count), decoys by level, at most 20 tiles, the same for a seed', () => {
  for (const [w, lang] of [['banana', 'en'], ['schildkröte', 'de'], ['ice cream', 'en'], ['きょうりゅう', 'ja'], ['雲霄飛車', 'zh-Hant'], ['سلحفاة', 'ar'], ['ענבים', 'he'], ['черепаха', 'ru']]) {
    for (const lvl of [1, 2, 3]) {
      const t = C.buildTray(w, lang, lvl, C.rng(7), { pool: C.wordPool(D, lang) });
      const g = C.parts(w, lang).g;
      const count = arr => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
      const inTray = count(t.tray), inAns = count(g);
      for (const [x, n] of Object.entries(inAns)) assert.equal(inTray[x], n, `${w} ${x}`);
      assert.equal(t.tray.length, g.length + t.decoys.length);
      assert.ok(t.tray.length <= C.MAX_TILES);
      assert.equal(t.decoys.length, C.decoyCount(g.length, lvl), `${w} at ${lvl}`);
      for (const i of t.decoys) assert.ok(!g.includes(t.tray[i]), 'a decoy is never an answer letter');
      assert.equal(new Set(t.decoys.map(i => t.tray[i])).size, t.decoys.length, 'decoys never repeat');
      assert.ok(!t.tray.join('').includes(g.join('')), 'never in the answer order');
      deq(C.buildTray(w, lang, lvl, C.rng(7), { pool: C.wordPool(D, lang) }).tray, t.tray, 'a seed makes the same tray');
    }
  }
  deq([C.decoyCount(3, 1), C.decoyCount(10, 1), C.decoyCount(4, 2), C.decoyCount(14, 3), C.decoyCount(5, 1), C.decoyCount(2, 1)], [4, 4, 4, 6, 2, 4], 'a short word gets 4 at least');
});

test('an easy tray never sets a letter beside its twin (É/E, Ё/Е, final and plain Hebrew, the alef forms)', () => {
  const cases = [['étoile', 'fr'], ['élan', 'fr'], ['ёжик', 'ru'], ['ענבים', 'he'], ['أرنب', 'ar'], ['cœur', 'fr'], ['león', 'es']];
  for (const [w, lang] of cases) {
    const fam = new Set(C.parts(w, lang).g.map(C.twinKey));
    for (let seed = 1; seed <= 60; seed++) {
      const t = C.buildTray(w, lang, 1, C.rng(seed));
      for (const i of t.decoys) assert.ok(!fam.has(C.twinKey(t.tray[i])), `${w}: ${t.tray[i]} (seed ${seed})`);
    }
    // a harder tray may have one twin, never more
    for (let seed = 1; seed <= 60; seed++) {
      const t = C.buildTray(w, lang, 3, C.rng(seed));
      assert.ok(t.decoys.filter(i => fam.has(C.twinKey(t.tray[i]))).length <= 1);
    }
  }
  assert.equal(C.twinKey('é'), 'e'); assert.equal(C.twinKey('ё'), 'е'); assert.equal(C.twinKey('ם'), 'מ'); assert.equal(C.twinKey('أ'), 'ا');
});

test('a tray that would spell a rude word is shuffled again, then gets new decoys; a failed order is never used', () => {
  let calls = 0;
  const t = C.buildTray('cat', 'en', 1, C.rng(3), { bad: () => ++calls < 3 });
  assert.ok(calls >= 3, 'asked again until it passed');
  assert.equal(t.tray.length, 3 + C.decoyCount(3, 1));
  // 40 bad orders: new decoys, and the tray it uses is one that passed
  const seen = []; calls = 0;
  const t2 = C.buildTray('banana', 'en', 2, C.rng(5), { bad: text => { seen.push(text); return ++calls <= 45; } });
  assert.equal(seen.at(-1), t2.tray.join('')); assert.ok(calls > 45);
  // every order of every decoy set bad: the answer's own tiles, in an order that passed
  calls = 0;
  const t3 = C.buildTray('banana', 'en', 2, C.rng(5), { bad: () => ++calls <= 400 });
  assert.equal(t3.decoys.length, 0); assert.equal(t3.tray.length, 6); assert.notEqual(t3.tray.join(''), 'banana');
});

test('the game\'s own rude-word check (on its own, with no server): the site\'s lists hashed, anywhere in the tiles', async () => {
  for (const x of ['porneais', 'fagqnrmfdie', 'cumlieb', 'xxSHITxx', 'ちんこあ']) assert.equal(C.rude(x), true, x);
  for (const x of ['cat', 'banana', 'schildkröte', 'черепаха', 'ענבים']) assert.equal(C.rude(x), false, x);
  // a tray made with no bad() of its own uses it
  for (let seed = 1; seed <= 200; seed++) assert.equal(C.rude(C.buildTray('cucumber', 'en', 3, C.rng(seed)).tray.join('')), false);
  // the hashes in the game are the site's lists as they are now (node scripts/doodle-bad.mjs writes them)
  const B = await import('../../scripts/doodle-bad.mjs');
  const html = (await import('node:fs')).readFileSync('seed-games/doodle-hoot.html', 'utf8');
  assert.ok(html.includes(B.block()), 'doodle-hoot.html: the rude-word hashes are out of date: node scripts/doodle-bad.mjs');
  assert.equal(B.hash('abc'), C.hash('abc'));
  assert.ok(!/\b(fuck|shit|porn)\b/i.test(html), 'no rude word is written in the game file');
});

test('the guess check: tray positions in slot order; twins of one letter stand in for each other', () => {
  const tray = ['n', 'a', 'b', 'x', 'a', 'n', 'a', 'q', 'b'], ans = ['b', 'a', 'n', 'a', 'n', 'a'];
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 6]), true);
  assert.equal(C.check(tray, ans, [8, 6, 5, 1, 0, 4]), true, 'any b, any a, any n');
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5]), false, 'too short');
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 5]), false, 'a tile used twice');
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 9]), false, 'out of range');
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 1.5]), false);
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 6], { 0: 8 }), true, 'a hint slot takes any tile with its letter (a hint landing mid-guess)');
  assert.equal(C.check(tray, ans, [8, 1, 0, 4, 5, 6], { 0: 8 }), true);
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 5, 6], { 1: 6 }), true);
  assert.equal(C.check(tray, ans, [8, 1, 0, 4, 5, 6], { 0: 1 }), false, 'a hint slot still needs its letter');
  assert.equal(C.check(tray, ans, [2, 1, 0, 4, 7, 6]), false, 'wrong letter');
});

test('hints never fill more than half the word; points by speed and order; the drawer by share', () => {
  for (const len of [1, 2, 3, 7, 8, 14]) for (let s = 1; s < 20; s++) {
    const p = C.hintPlan(len, C.rng(s));
    assert.equal(p.length, Math.floor(len / 2)); assert.equal(new Set(p).size, p.length);
    assert.ok(p.every(i => i >= 0 && i < len));
  }
  assert.equal(C.guessPoints(80000, 80000, 0, 0), 120); assert.equal(C.guessPoints(0, 80000, 5, 0), 50);
  assert.equal(C.guessPoints(40000, 80000, 1, 0), 85); assert.equal(C.guessPoints(0, 80000, 3, 5), 30, 'never below 30');
  assert.equal(C.drawPoints(0, 4), 0); assert.equal(C.drawPoints(4, 4), 120); assert.equal(C.drawPoints(1, 3), 40); assert.equal(C.drawPoints(1, 0), 0);
  deq(C.HINTS.map(h => h.at), [0.4, 0.55, 0.75, 0.85]);
});

test('strokes: points kept 3 units apart, long steps cut to at most 127', () => {
  deq(C.keep(null, 10.4, -5), [10, 0]);
  assert.equal(C.keep([10, 10], 11, 11), null);
  deq(C.keep([10, 10], 13, 10), [13, 10]);
  deq(C.keep([0, 0], 2000, 9999), [1000, 750], 'clamped to the board');
  const st = C.steps([0, 0], [300, 0, 300, 10]);
  assert.ok(st.every(v => Math.abs(v) <= 127));
  let x = 0, y = 0; for (let i = 0; i < st.length; i += 2) { x += st[i]; y += st[i + 1]; }
  deq([x, y], [300, 10], 'the steps add up to the points');
});

test('render draws on any 2D context without the DOM', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])), set: (o, k, v) => ((o[k] = v), true) });
  C.render(ctx, [{ s: 0, c: 3, w: 2, e: 0, pts: [10, 10, 100, 100] }, { s: 1, c: 0, w: 0, e: 1, pts: [5, 5] }], 0.5);
  assert.ok(calls.some(c => c[0] === 'fillRect'));
  assert.ok(calls.some(c => c[0] === 'lineTo')); assert.ok(calls.some(c => c[0] === 'arc'), 'a dot');
});
