// Tug of Math (seed-games/tug-of-math.html): the question generator per grade (whole-number answers, the right sizes,
// negatives only from grade 7, never the same question twice in a row, both teams equally hard), the computer opponent
// (a slow 2nd grader beats Easy, Hard is a real challenge), the game's words in all 13 languages, the scan, and the
// server's copy of the generator (server/live/tug-gen.js, for Oomba Live). The generator is checked against an
// evaluator written here, not against itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { scanVersion } from '../../server/services/scanner.js';
import { tug, load, source } from '../../server/live/tug-gen.js';
import * as lines from '../../server/services/tts-lines.js';

const html = fs.readFileSync('seed-games/tug-of-math.html', 'utf8');
const { TugGen: G, TugBot: B } = load(html);
const LANGS = ['en', 'en-GB', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];

// ---- an evaluator of the tokens, independent of the game's own maths
function js(tokens, x) {
  let s = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], next = tokens[i + 1];
    if (typeof t === 'number') { s += `(${t})`; if (next === 'x' || next === 'q') s += '*'; continue; }
    if (t === 'sqrt') { s += `Math.sqrt(${tokens[++i]})`; continue; }
    s += { add: '+', sub: '-', mul: '*', div: '/', lp: '(', rp: ')', sq: '**2', cu: '**3', pow: '**', pct: '/100', of: '*', x: `(${x})`, q: `(${x})` }[t];
  }
  return s;
}
const fn = tokens => vm.runInNewContext(`(x) => ${js(tokens, 'x')}`, { Math });
function solve(q) {
  const e = q.e, eq = e.indexOf('eq');
  if (eq < 0) return fn(e)(0);
  const L = fn(e.slice(0, eq)), R = fn(e.slice(eq + 1)), found = [];
  for (let x = -3000; x <= 3000; x++) if (Math.abs(L(x) - R(x)) < 1e-9) found.push(x);
  assert.equal(found.length, 1, `one solution for ${G.text(q)}: ${found.slice(0, 3)}`);
  return found[0];
}
const nums = q => q.e.filter(t => typeof t === 'number');

test('every grade: whole-number answers that the question really gives, the right sizes, negatives only from grade 7', () => {
  const LIM = { 1: [0, 20, 20], 2: [0, 100, 100], 3: [0, 1000, 1000], 4: [0, 2250, 2250], 5: [0, 5000, 5000], 6: [0, 400, 400], 7: [-200, 200, 200], 8: [-200, 1024, 400] };
  for (const g of G.GRADES) {
    const d = G.deck(g, 1000 + g), seen = new Set();
    for (let i = 0; i < 1500; i++) {
      const q = d.next(i % 2), label = `G${g} ${G.text(q)}`;
      assert.ok(Number.isInteger(q.a), `${label}: whole answer`);
      assert.equal(solve(q), q.a, `${label} = ${q.a}`);
      assert.ok(q.a >= LIM[g][0] && q.a <= LIM[g][1], `${label}: answer ${q.a} in range`);
      assert.ok(nums(q).every(n => Math.abs(n) <= LIM[g][2]), `${label}: numbers in range`);
      assert.ok(String(Math.abs(q.a)).length <= G.MAX_DIGITS, `${label}: fits the keypad`);
      if (g < 7) { assert.ok(q.a >= 0 && nums(q).every(n => n >= 0), `${label}: no negatives before grade 7`); }
      assert.ok(!/undefined|NaN|null/.test(G.text(q)), label);
      seen.add(q.k);
    }
    assert.equal([...seen].sort().join(), [...G.kinds(g)].sort().join(), `G${g}: every kind comes up`);
    assert.equal(G.needsMinus(g), g >= 7, `G${g}: the minus key`);
  }
  // grade 7 and 8 really do use negatives (else the minus key would be pointless)
  for (const g of [7, 8]) { const d = G.deck(g, 5); let neg = 0; for (let i = 0; i < 300; i++) if (d.next(0).a < 0) neg++; assert.ok(neg > 20, `G${g}: ${neg} negative answers`); }
});

test('the curriculum: grade 1 within 20, grade 2 within 100, grade 3 facts to 10 × 10, equations from grade 7', () => {
  const pick = (g, k, n = 400) => { const out = []; for (let s = 0; out.length < n; s++) { const q = G.make(g, G.rng(s + 1), null, k); out.push(q); } return out; };
  for (const q of pick(1, 'a20')) assert.ok(q.a > 10 && q.a <= 20 && nums(q).every(n => n < 20));
  for (const q of pick(1, 's20')) assert.ok(q.a >= 0 && nums(q)[0] <= 20);
  for (const q of pick(2, 'a100')) assert.ok(q.a <= 100);
  for (const q of pick(3, 'mul')) assert.ok(nums(q).every(n => n >= 2 && n <= 10));
  for (const q of pick(3, 'div')) assert.ok(nums(q)[1] <= 10 && q.a <= 10);
  for (const q of pick(4, 'd1')) assert.equal(nums(q)[0] % nums(q)[1], 0, 'division with no remainder');
  for (const q of pick(6, 'pct')) assert.ok([10, 20, 25, 50, 75].includes(nums(q)[0]));
  for (const q of pick(8, 'root')) assert.equal(q.e[0], 'sqrt');
  assert.ok(G.kinds(7).includes('eq1') && G.kinds(8).includes('eq2') && !G.kinds(6).some(k => /^eq/.test(k)));
  assert.equal(G.form(pick(7, 'eq1', 1)[0]), 'x');
  assert.equal(G.form(pick(1, 'm10', 1)[0]), 'box');
  // what the question looks like
  assert.equal(G.text({ e: [7, 'mul', 8] }), '7 × 8');
  assert.equal(G.text({ e: [-13, 'sub', -19] }), '−13 − (−19)');
  assert.equal(G.text({ e: [3, 'x', 'add', 5, 'eq', -7] }), '3x + 5 = −7');
  assert.equal(G.text({ e: ['lp', 35, 'sub', 7, 'rp', 'div', 4] }), '(35 − 7) ÷ 4');
  assert.equal(G.text({ e: [25, 'pct', 'of', 80] }, 'de'), '25% de 80');
  assert.equal(G.text({ e: [-3, 'cu'] }), '(−3)³');
  assert.equal(G.text({ e: [2, 'pow', 10] }), '2¹⁰');
  assert.equal(G.text({ e: ['sqrt', 144] }), '√144');
});

/** A question's form with its numbers masked (the number of digits kept for numbers that size the work: m1's 2 or 3
 *  digits, pow's base); signs and small differences in size do not count. */
const shape = q => q.e.map((t, i) => {
  if (typeof t !== 'number') return /^(eq1|eq2|iops)$/.test(q.k) && (t === 'add' || t === 'sub') ? '±' : t;   // "x + −5" is written "x − 5"
  if (q.k === 'm1' && i === 0) return 'n' + String(Math.abs(t)).length;
  if (q.k === 'pow' && i === 0) return 'b' + (t === 2 && q.e[1] === 'pow' ? '2' : '');
  if (q.k === 'pct' && i === 0) return 'p' + t;
  return 'n';
}).join(' ');
test('never the same question twice in a row; both teams get the same kind of question at the same point', () => {
  for (const g of G.GRADES) for (let seed = 1; seed <= 20; seed++) {
    const d = G.deck(g, seed), A = [], R = [];
    for (let i = 0; i < 60; i++) { A.push(d.next(0)); if (i % 3 !== 2) R.push(d.next(1)); }   // the teams answer at different speeds
    for (const side of [A, R]) for (let i = 1; i < side.length; i++) assert.notEqual(G.text(side[i]), G.text(side[i - 1]), `G${g} seed ${seed}: repeat`);
    for (let i = 0; i < R.length; i++) {
      assert.equal(A[i].k, R[i].k, `G${g} seed ${seed} question ${i}: same kind`);
      // the same form too (2-digit × 1-digit against 2-digit × 1-digit, not against 3-digit; the same equation shape)
      assert.equal(shape(A[i]), shape(R[i]), `G${g} seed ${seed} question ${i}: ${G.text(A[i])} | ${G.text(R[i])}`);
      assert.equal(A[i].n, i); assert.equal(R[i].n, i);
      assert.equal(G.kindAt(g, seed, i), A[i].k);
    }
    // a different question for each team, almost always (the other team cannot copy)
    const same = R.filter((q, i) => G.text(q) === G.text(A[i])).length;
    assert.ok(same <= R.length / 10, `G${g} seed ${seed}: ${same} identical pairs`);
  }
  // the same seed gives the same match (the live server and a replay agree)
  const a = G.deck(4, 99), b = G.deck(4, 99);
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(a.next(i % 2)), JSON.stringify(b.next(i % 2)));
});

// ---- the computer: a match simulated the way the game plays it (one pull per right answer, the line at ±8)
function match(grade, diff, kidMs, kidAcc, seed, len = 90000, line = 8) {
  const d = G.deck(grade, seed), bot = B.make(diff, seed), r = G.rng(seed ^ 77);
  const t = [kidMs * (0.8 + 0.4 * r()), 0]; let pos = 0;
  d.next(0); let res = bot.next(d.next(1)); t[1] = res.ms;
  for (;;) {
    const side = t[0] <= t[1] ? 0 : 1, now = t[side]; if (now > len) break;
    if (side === 0) { const ok = r() < kidAcc; if (ok) pos++; d.next(0); t[0] = now + (ok ? 350 : 1100) + kidMs * (0.8 + 0.4 * r()); }
    else { if (res.ok) pos--; const was = res.ok; res = bot.next(d.next(1)); t[1] = now + (was ? 500 : 600 + B.STUMBLE) + res.ms; }
    if (Math.abs(pos) >= line) break;
  }
  return Math.sign(pos);
}
const rate = (grade, diff, ms, acc, n = 400) => { let w = 0; for (let s = 1; s <= n; s++) if (match(grade, diff, ms, acc, s * 7919) > 0) w++; return w / n; };

test('the computer: a slow 2nd grader beats Easy; Hard beats a steady player; harder levels are quicker and surer', () => {
  assert.ok(rate(2, 'easy', 9000, 0.8) >= 0.8, 'a slow 2nd grader (9 s an answer, 80% right) beats Easy at least 4 times in 5');
  assert.ok(rate(1, 'easy', 9000, 0.8) >= 0.75, 'and so does a slow 1st grader, mostly');
  assert.ok(rate(3, 'hard', 5000, 0.85) <= 0.3, 'Hard beats a steady player (5 s, 85%) at least 7 times in 10');
  assert.ok(rate(3, 'hard', 3000, 0.9) >= 0.3, 'a quick, sure player can still beat Hard');
  for (const g of G.GRADES) {
    const q = G.deck(g, 3).next(1), avg = diff => { const b = B.make(diff, 5); let ms = 0, ok = 0; for (let i = 0; i < 400; i++) { const r = b.next(q); ms += r.ms; ok += r.ok; } return [ms / 400, ok / 400]; };
    const [e, n, h] = ['easy', 'normal', 'hard'].map(avg);
    assert.ok(e[0] > n[0] && n[0] > h[0], `G${g}: Easy is slower than Normal, Normal than Hard`);
    assert.ok(e[1] < n[1] && n[1] < h[1], `G${g}: and less often right`);
  }
  // a wrong answer is a believable number, never negative before grade 7
  const b = B.make('easy', 1);
  for (let i = 0; i < 300; i++) { const q = G.deck(2, i).next(1), r = b.next(q); assert.ok(Number.isInteger(r.v) && r.v >= 0); assert.equal(r.ok, r.v === q.a); }
  // thinking time grows with how hard the question is
  const slow = B.make('normal', 9), fast = B.make('normal', 9);
  let a = 0, c = 0; for (let i = 0; i < 200; i++) { a += slow.next({ k: 'eq2', a: 1, g: 8 }).ms; c += fast.next({ k: 'a10', a: 1, g: 1 }).ms; }
  assert.ok(a > c * 1.5);
});

test('the game\'s words: every key in all 13 languages, the same placeholders, and its lines for AI voices', () => {
  const block = html.slice(html.indexOf('// ==== I18N START ===='), html.indexOf('// ==== I18N END ===='));
  const box = {}; vm.runInNewContext(block + '\nthis.I18N = I18N;', box);
  const I = box.I18N, keys = Object.keys(I.en);
  assert.ok(keys.length >= 40);
  for (const l of LANGS) {
    assert.ok(I[l], l);
    assert.deepEqual(Object.keys(I[l]).sort(), keys.slice().sort(), `${l}: every key`);
    for (const k of keys) {
      assert.equal(typeof I[l][k], 'string', `${l}.${k}`);
      assert.deepEqual((I[l][k].match(/\{\w+\}/g) || []).sort(), (I.en[k].match(/\{\w+\}/g) || []).sort(), `${l}.${k}: placeholders`);
    }
  }
  assert.ok(lines.TTS_GAMES.has('tug-of-math'));
  assert.ok(lines.gameLines('tug-of-math', 'fr').length > 10);
});

test('the scan passes, the kit is pinned, and the json describes the game in every language', () => {
  const r = scanVersion(html);
  assert.equal(r.status, 'pass', JSON.stringify(r).slice(0, 400));
  assert.match(html, /<script src="\/vendor\/oomba-kit\/1\.1\.5\/oomba-kit\.js" integrity="sha384-[^"]+" crossorigin="anonymous"><\/script>/);
  assert.ok(!/BRB\.poll|fetch\(|<input/.test(html), 'no poll, no network, no typing boxes (live frames are read-only)');
  const j = JSON.parse(fs.readFileSync('seed-games/tug-of-math.json', 'utf8'));
  assert.equal(j.slug, 'tug-of-math'); assert.equal(j.category, 'learning'); assert.equal(j.featured, true); assert.equal(j.age_rating, 'everyone');
  assert.ok(j.notes.length > 200 && /tug-of-math-v1/.test(j.notes));
  for (const l of LANGS.filter(x => x !== 'en')) assert.ok(j.l10n[l] && j.l10n[l].description && j.l10n[l].tags, `l10n ${l}`);
  assert.ok(JSON.parse(fs.readFileSync('scripts/seed.js', 'utf8').match(/export const SEED_GAMES = (\[[^\]]*\])/)[1].replace(/'/g, '"')).includes('tug-of-math'));
});

test('the server reads the same generator from the game (for Oomba Live)', () => {
  const s = tug();
  assert.equal(source(html), source());
  const a = s.TugGen.deck(5, 42), b = G.deck(5, 42);
  for (let i = 0; i < 30; i++) assert.equal(JSON.stringify(a.next(i % 2)), JSON.stringify(b.next(i % 2)));
  assert.ok(Object.isFrozen(s.TugGen));
  const q = s.TugGen.deck(7, 1).next(0);
  assert.equal(s.TugGen.check(q, q.a), true);
  assert.equal(s.TugGen.check(q, q.a + 1), false);
  assert.equal(s.TugGen.check(q, String(q.a)), false, 'only numbers count');
  assert.equal(s.TugGen.check(q, q.a + 0.5), false);
  // a question travels as words and numbers only (a live game event allows nothing else)
  for (const g of G.GRADES) { const d = G.deck(g, 8); for (let i = 0; i < 200; i++) for (const t of d.next(i % 2).e) assert.ok(typeof t === 'number' || /^[a-z]{1,4}$/.test(t), `${t}`); }
});
