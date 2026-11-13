// Rocket Supply (seed-games/rocket-supply.html): Number Quest Launchpad Unit 5's game, a Kit 2 (Oomba3D) launch pad
// on a space base for grade 2: a pallet is a hundred, a rack is a ten, a canister is a one, and when the load is right
// the rocket lifts off. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between rocket-supply:begin and rocket-supply:end): six a chapter, the numbers in
//     the ranges the unit teaches, every answer re-derived here from the round's own numbers, the wrong choices the
//     mistakes a child really makes, the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), and what the number
//     chip shows (a sum, a sign, a number's name in words) is never sent to be spoken;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, the pods on the pad
//     are the numbers of the round, a wrong answer gets a hint, shows why and does not advance the round, every
//     instruction is sent to be spoken, and a correct play of all six rounds posts the game-over message (the course
//     step's completion signal) exactly once, not before; then the picture menu with no parameters, rounds at the
//     game's own speed (pods drop in, ten racks lock into a pallet, a sum is worked on the pad, the rocket lifts
//     off), the keyboard, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. RS_SHOTS=<dir> saves screenshots there.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const LOCAL = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const V = await import('../../server/services/vendor.js');
const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
const { vendorFile } = await import('../../server/services/snapshot.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const PP = await import('../../server/services/play-params.js');
const TAGS = await import('../../server/standards/official-tags.js');
const lines = await import('../../server/services/tts-lines.js');
const catalog = await import('../../server/services/course-catalog.js');
const { SHELF_INFO } = await import('../../server/learn.js');
const { SEED_GAMES } = await import('../../scripts/seed.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/rocket-supply.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/rocket-supply.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 5), STEPS = UNIT.steps;
const CHAPTERS = ['build', 'count', 'fuel'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const RS = (() => {
  const box = {}; vm.runInNewContext(/\/\* rocket-supply:begin \*\/([\s\S]*?)\/\* rocket-supply:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.RocketSupply;   // plain objects of this realm, so deepEqual can compare them
  return { CHAPTERS: plain(G.CHAPTERS), ROUNDS: G.ROUNDS, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)), parts: n => plain(G.parts(n)), expanded: G.expanded, name: G.name };
})();
const T = lines.readGame('rocket-supply').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const numeric = r => typeof r.answer === 'number';
/** A number's hundreds, tens and ones, worked out here. */
const hto = n => [Math.floor(n / 100), Math.floor(n / 10) % 10, n % 10];
/** A number in its parts as the chip writes it, worked out here: 407 is "400 + 7". */
const inParts = n => { const [h, t, o] = hto(n), s = []; if (h) s.push(h * 100); if (t) s.push(t * 10); if (o || !s.length) s.push(o); return s.join(' + '); };
/** A number's name in words, worked out here from a second table. */
const WORDS = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
  20: 'twenty', 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety' };
const named = n => { const h = Math.floor(n / 100), r = n % 100, w = []; if (h) w.push(WORDS[h] + ' hundred'); if (r || !h) w.push(WORDS[r] || `${WORDS[r - r % 10]}-${WORDS[r % 10]}`); return w.join(' '); };
const SIGN = { gt: '>', eq: '=', lt: '<' };
/** What the number chip shows for a round: while it is asked, and once it is found (`total`: the load so far in a build round). */
const chip = (r, found, total = 0) => (r.kind === 'build' ? inParts(found ? r.target : total) : r.kind === 'read' ? (found ? `${inParts(r.num)} = ${r.num}` : null) : r.kind === 'expand' ? `${inParts(r.num)} = ${found ? r.num : '?'}`
  : r.kind === 'name' ? named(r.num) + (found ? ` = ${r.num}` : '') : r.kind === 'skip' ? `${r.seq.join(', ')}, ${found ? r.answer : '?'}` : r.kind === 'compare' ? `${r.a} ${found ? SIGN[r.answer] : '?'} ${r.b}`
    : `${r.a} ${r.kind === 'add' ? '+' : '−'} ${r.b} = ${found ? r.answer : '?'}`);

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  assert.match(HTML, /start\(\{ theme: 'space-base', version: '1\.0\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Space Base, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/space-base')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/space-base/1.0.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Space Base 1.0.0 has the piece ${id}`);
  for (const m of HTML.matchAll(/(?:piece\(|\[)'((?:ground|slope|crater|landing|base|garage|tunnel|structure|drill|rocket-lander|lander|rover|solar|wind|cargo|containers|lights|rock)[a-z-]*)'/g)) assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`);
  for (const id of ['knight', 'barbarian', 'mage', 'rogue', 'rogue-hooded']) assert.ok(theme.heroes.some(h => h.id === id), `the theme has the adventurer ${id}`);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|game over!)\b/i, 'no timer, no lives, no losing, no countdown');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button wobble and bring
  // the helper back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(|performance\.now|Date\.now/);
});

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the first lap always the same', () => {
  assert.deepEqual([...RS.CHAPTERS], CHAPTERS); assert.equal(RS.ROUNDS, 6);
  assert.equal(RS.round('build', 0, 0), null); assert.equal(RS.round('build', 7, 0), null); assert.equal(RS.round('shapes', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(RS.round(ch, n, 0), RS.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, in kind: load, load with tens, read (an empty place, then three digits), parts, a name;
  // three skip counts and three signs; a fact, a sum, a difference, a fact, a sum, a difference
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => RS.round('build', n, 0)).map(r => r.kind + ':' + r.form), ['build:hto', 'build:tens', 'read:h0o', 'read:hto', 'expand:hto', 'name:teen']);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => RS.round('count', n, 0)).map(r => r.kind + ':' + (r.by || r.form)), ['skip:5', 'skip:10', 'skip:100', 'compare:h', 'compare:swap', 'compare:o']);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => RS.round('fuel', n, 0)).map(r => r.kind + (r.fact ? ':fact' : '')), ['add:fact', 'add', 'sub', 'sub:fact', 'add', 'sub']);
  assert.equal(RS.name(618), 'six hundred eighteen'); assert.equal(RS.name(342), 'three hundred forty-two'); assert.equal(RS.name(500), 'five hundred'); assert.equal(RS.name(407), 'four hundred seven');
  assert.equal(RS.expanded(342), '300 + 40 + 2'); assert.equal(RS.expanded(407), '400 + 7'); assert.equal(RS.expanded(470), '400 + 70'); assert.equal(RS.expanded(0), '0');
  /** Three different numbers, smallest first, the answer among them, all inside [lo, hi]. */
  const three = (r, lo, hi, at) => {
    assert.equal(r.choices.length, 3, at); assert.deepEqual([...r.choices].sort((a, b) => a - b), r.choices, `${at}: smallest first`); assert.equal(new Set(r.choices).size, 3, `${at}: three different numbers`);
    assert.ok(r.choices.includes(r.answer), `${at}: the answer is offered`);
    for (const v of r.choices) assert.ok(Number.isInteger(v) && v >= lo && v <= hi, `${at}: ${v} is a number from ${lo} to ${hi}`);
  };
  const seen = { forms: new Set(), pairs: new Set(), signs: new Set(), skips: new Set(), offRound: 0, zeroTens: 0, zeroOnes: 0, exactTen: 0, fromTen: 0, cross: 0 };
  for (let lap = 0; lap < 240; lap++) {
    const signs = [];
    for (let n = 1; n <= 6; n++) {
      for (const ch of CHAPTERS) {
        const r = RS.round(ch, n, lap), at = `${ch} ${n} lap ${lap}`;
        assert.ok(T[r.ask[0]], `${at}: the question ${r.ask[0]} is one of the game's lines`); for (const [k] of r.said) assert.ok(T[k], `${at}: ${k}`);
        for (const [k, v] of [r.ask, ...r.said]) assert.doesNotMatch(say(k, v), /undefined|\{/, `${at}: ${k} has all its numbers`);
        for (const [k, v] of [r.ask, ...r.said]) assert.doesNotMatch(say(k, v), /\b1 (hundreds|tens|ones)\b/, `${at}: no "1 tens" (${say(k, v)})`);
      }
      // ---- build: load (1-2), read (3-4), a number from its parts (5), a number from its name (6)
      const b = RS.round('build', n, lap), ba = `build ${n} lap ${lap}`; seen.forms.add(b.kind + ':' + b.form);
      assert.equal(b.kind, ['build', 'build', 'read', 'read', 'expand', 'name'][n - 1], ba);
      const x = b.kind === 'build' ? b.target : b.num, [h, t, o] = hto(x);
      assert.ok(Number.isInteger(x) && x >= 100 && x <= 999, `${ba}: a three-digit number (${x})`); assert.equal(b.answer, x, ba);
      if (b.kind === 'build') {
        assert.deepEqual(b.choices, [], ba);
        if (n === 1) { assert.deepEqual(b.stock, { h: true, t: true, o: true }, ba); assert.ok(h >= 2 && t >= 2 && o >= 2 && h + t + o <= 14, `${ba}: a few of each to load (${x})`); assert.deepEqual(b.ask, ['build.ask', { n: x }]); assert.deepEqual(b.said, [['parts', { h, t, o, n: x }]], ba); }
        else { assert.deepEqual(b.stock, { h: false, t: true, o: false }, `${ba}: racks only`); assert.ok(x % 10 === 0 && x >= 110 && x <= 140, `${ba}: more than ten tens (${x})`); assert.deepEqual(b.said, [['tens.said', { t: x / 10, n: x }]], ba); }
      } else {
        three(b, 10, 999, ba);
        if (b.form === 'h0o') { assert.equal(t, 0, ba); assert.ok(o >= 2, ba); assert.deepEqual(b.choices, [h * 10 + o, h * 100 + o, h * 100 + o * 10], `${ba}: 47, 407 and 470`); seen.zeroTens++; }
        if (b.form === 'ht0') { assert.equal(o, 0, ba); assert.ok(t >= 2, ba); assert.deepEqual(b.choices, [h * 10 + t, h * 100 + t, h * 100 + t * 10], `${ba}: 47, 407 and 470`); seen.zeroOnes++; }
        if (b.form === 'hto') { assert.equal(new Set([h, t, o]).size, 3, `${ba}: three different digits`); assert.ok(b.choices.includes(h * 100 + o * 10 + t), `${ba}: the tens and ones swapped (${h * 100 + o * 10 + t}) is offered`); }
        if (b.kind === 'read') assert.deepEqual(b.said, [b.form === 'h0o' ? ['read.zero.t', { h, o, n: x }] : b.form === 'ht0' ? ['read.zero.o', { h, t, n: x }] : ['parts', { h, t, o, n: x }]], ba);
        if (b.kind === 'expand') {
          const ps = inParts(x).split(' + ').map(Number);
          assert.deepEqual(b.ask, ps.length === 3 ? ['expand.ask3', { a: ps[0], b: ps[1], c: ps[2] }] : ['expand.ask2', { a: ps[0], b: ps[1] }], `${ba}: the parts are asked as they are written`);
          assert.equal(ps.reduce((s, v) => s + v, 0), x, ba); assert.equal(RS.expanded(x), inParts(x), ba);
        }
        if (b.kind === 'name') {
          assert.equal(b.words, named(x), `${ba}: ${x} in words`); assert.deepEqual(b.ask, ['name.ask', { n: x }], ba); assert.ok(b.words.length <= 27, `${ba}: the name fits the chip (${b.words})`);
          if (b.form === 'teen') { assert.equal(t, 1, ba); assert.deepEqual(b.choices, [h * 100 + o, x, h * 100 + o * 10], `${ba}: eighteen, not eight or eighty`); }
          else assert.ok(t >= 2 && o >= 1, ba);
        }
      }
      // ---- count: what comes next by 5s, 10s and 100s (1-3), then the sign between two numbers (4-6)
      const c = RS.round('count', n, lap), ca = `count ${n} lap ${lap}`;
      if (n <= 3) {
        const k = [5, 10, 100][n - 1];
        assert.equal(c.kind, 'skip', ca); assert.equal(c.by, k, ca); assert.equal(c.seq.length, 3, ca); three(c, 1, 1000, ca);
        assert.deepEqual(c.seq, [c.seq[0], c.seq[0] + k, c.seq[0] + 2 * k], `${ca}: steps of ${k}`); assert.equal(c.answer, c.seq[2] + k, ca);
        assert.ok(c.seq[0] >= 5 && c.answer <= 1000, `${ca}: within 1000`);
        if (k === 5) assert.equal(c.seq[0] % 5, 0, `${ca}: fives are counted on the fives`);
        assert.ok(c.choices.includes(c.seq[2] + 1), `${ca}: one more (${c.seq[2] + 1}) is offered`);
        assert.deepEqual(c.ask, ['skip.ask.' + k, {}]); assert.deepEqual(c.said, [['skip.said', { a: c.seq[0], b: c.seq[1], c: c.seq[2], d: c.answer }]], ca);
        if (k > 5 && c.seq[0] % k) seen.offRound++;
        if (Math.floor(c.seq[0] / 100) !== Math.floor(c.answer / 100) && k < 100) seen.cross++;
        seen.skips.add(k);
      } else {
        assert.equal(c.kind, 'compare', ca); assert.deepEqual(c.choices, ['gt', 'eq', 'lt'], ca);
        for (const v of [c.a, c.b]) assert.ok(Number.isInteger(v) && v >= 100 && v <= 999, `${ca}: ${v} has three digits`);
        assert.equal(c.answer, c.a > c.b ? 'gt' : c.a < c.b ? 'lt' : 'eq', `${ca}: ${c.a} and ${c.b}`);
        const A = hto(c.a), B2 = hto(c.b), at = A[0] !== B2[0] ? 'h' : A[1] !== B2[1] ? 't' : A[2] !== B2[2] ? 'o' : 'same';
        assert.equal(c.why, at, `${ca}: the first place that differs decides`);
        const i = 'hto'.indexOf(at), big = Math.max(A[i] ?? 0, B2[i] ?? 0), small = Math.min(A[i] ?? 0, B2[i] ?? 0);
        assert.deepEqual(c.said, [['cmp.' + c.answer, { a: c.a, b: c.b }], at === 'same' ? ['cmp.why.same', {}] : ['cmp.why.' + at, { x: big, y: small }]], ca);
        if (c.form === 'h') { const [lo, hi] = c.a < c.b ? [A, B2] : [B2, A]; assert.ok(lo[1] > hi[1] && lo[2] > hi[2], `${ca}: the smaller number has the bigger tens and ones`); }
        if (c.form === 'swap') assert.deepEqual([...A].sort(), [...B2].sort(), `${ca}: the same digits in another order`);
        signs.push(c.answer); seen.pairs.add(c.form); seen.signs.add(c.answer);
      }
      // ---- fuel: add and take away within 100 with a ten made or opened (2, 3, 5, 6), and facts within 20 (1, 4)
      const f = RS.round('fuel', n, lap), fa = `fuel ${n} lap ${lap}`;
      assert.equal(f.kind, [1, 2, 5].includes(n) ? 'add' : 'sub', fa); assert.equal(f.fact, n === 1 || n === 4, fa);
      assert.equal(f.answer, f.kind === 'add' ? f.a + f.b : f.a - f.b, `${fa}: ${f.a} and ${f.b}`); three(f, 1, 100, fa);
      assert.deepEqual(f.ask, [f.kind === 'add' ? 'add.ask' : 'sub.ask', { a: f.a, b: f.b }], fa);
      const ones = f.kind === 'add' ? f.a % 10 + f.b % 10 : f.a % 10 - f.b % 10;
      assert.equal(f.regroup, f.kind === 'add' ? ones >= 10 : ones < 0, fa); assert.equal(f.regroup, true, `${fa}: a ten is made or opened every time`);
      assert.deepEqual(f.said, [[f.kind === 'add' ? 'add.ten' : 'sub.ten', {}], [f.kind === 'add' ? 'sum.add' : 'sum.sub', { a: f.a, b: f.b, c: f.answer }]], fa);
      if (f.fact) { assert.ok(f.a <= 19 && f.b <= 9 && f.answer <= 20, `${fa}: a fact within 20`); if (f.kind === 'add') assert.ok(f.a <= 9, `${fa}: two one-digit numbers`); }
      else {
        assert.ok(f.a >= 10 && f.a <= 99 && f.b >= 10 && f.b <= 99 && f.answer >= 10 && f.answer <= 99, `${fa}: two-digit numbers within 100`);
        if (f.kind === 'add') { assert.ok(f.choices.includes(f.answer - 10), `${fa}: the new ten forgotten (${f.answer - 10}) is offered`); if (ones === 10) seen.exactTen++; }
        else { assert.ok(f.choices.includes(f.answer + 10), `${fa}: the ten not opened (${f.answer + 10}) is offered`); if (f.a % 10 === 0) seen.fromTen++; }
      }
    }
    assert.ok(new Set(signs).size >= 2, `count lap ${lap}: the three signs asked are not all the same`);
  }
  assert.deepEqual([...seen.forms].sort(), ['build:hto', 'build:tens', 'expand:h0o', 'expand:ht0', 'expand:hto', 'name:teen', 'name:ty', 'read:h0o', 'read:ht0', 'read:hto']);
  assert.deepEqual([...seen.pairs].sort(), ['eq', 'h', 'o', 'swap', 't'], 'hundreds differ, the same hundreds, the same hundreds and tens, swapped digits, the same number');
  assert.deepEqual([...seen.signs].sort(), ['eq', 'gt', 'lt']); assert.deepEqual([...seen.skips], [5, 10, 100]);
  assert.ok(seen.offRound >= 100 && seen.cross >= 20 && seen.zeroTens >= 100 && seen.zeroOnes >= 100 && seen.exactTen >= 100 && seen.fromTen >= 100, 'counting starts off a round number and crosses a hundred; empty tens and empty ones; a sum that makes a round ten and a difference from one');
  assert.deepEqual(RS.params({ chapter: 'count', lock: 1 }), { chapter: 'count', lock: true });
  assert.deepEqual(RS.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(RS.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and answer line is a registered spoken line, short enough for a seven-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('rocket-supply'));
  const ok = text => lines.allowedLine('rocket-supply', 'en', text);
  const NUMS = { a: 27, b: 5, c: 32, d: 4, n: 345, m: 6, h: 3, t: 4, o: 5, x: 8, y: 6 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 55);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what is shown in a line's place and the button labels are shown, never read; nor is a sum with its signs, nor a
  // number written in words
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('38 + 27 = ?'), null); assert.equal(ok('352 > 325'), null); assert.equal(ok('six hundred eighteen'), null); assert.equal(ok('300 + 40 + 2'), null);
  assert.equal(say('build.ask', { n: 243 }), 'Load 243.'); assert.equal(say('build.ask.tens', { n: 120 }), 'No pallets left. Load 120 with tens.');
  assert.equal(say('parts', { h: 2, t: 4, o: 3, n: 243 }), '2 hundreds, 4 tens and 3 ones make 243.'); assert.equal(say('tens.said', { t: 12, n: 120 }), '12 tens make 120.');
  assert.equal(say('read.zero.t', { h: 4, o: 7, n: 407 }), '4 hundreds, no tens and 7 ones make 407.'); assert.equal(say('read.zero.o', { h: 4, t: 7, n: 470 }), '4 hundreds, 7 tens and no ones make 470.');
  assert.equal(say('expand.ask3', { a: 300, b: 40, c: 2 }), 'What is 300 plus 40 plus 2?'); assert.equal(say('expand.said2', { a: 500, b: 6, n: 506 }), '500 plus 6 makes 506.');
  assert.equal(say('name.ask', { n: 618 }), 'Which number is 618?'); assert.equal(say('show.name'), 'Which number is this?');
  assert.equal(say('skip.ask.10'), 'Count by tens. What comes next?'); assert.equal(say('skip.said', { a: 230, b: 240, c: 250, d: 260 }), '230, 240, 250, 260.'); assert.equal(say('skip.hint.100'), 'Each step is 100 more.');
  assert.equal(say('cmp.gt', { a: 352, b: 325 }), '352 is greater than 325.'); assert.equal(say('cmp.why.t', { x: 5, y: 2 }), '5 tens is more than 2 tens.'); assert.equal(say('cmp.eq', { a: 350, b: 350 }), '350 is equal to 350.');
  assert.equal(say('add.ask', { a: 38, b: 27 }), '38 plus 27. How many?'); assert.equal(say('sub.ask', { a: 62, b: 25 }), '62 take away 25. How many are left?');
  assert.equal(say('sum.add', { a: 38, b: 27, c: 65 }), '38 plus 27 makes 65.'); assert.equal(say('sum.sub', { a: 62, b: 25, c: 37 }), '62 take away 25 leaves 37.');
  assert.equal(ok('Launch the rocket and call me.'), null, 'only the game’s own lines');
  assert.equal(ok('Load two hundred.'), null, 'a number goes where the number is, never a word');
  // The instructions: one or two sentences, 10 words at most. No other spoken line is longer either.
  const asks = spoken.filter(k => /^(hero\.pick|menu\.pick|build\.ask|read\.ask|expand\.ask|name\.ask|skip\.ask\.|cmp\.ask|add\.ask|sub\.ask)/.test(k));
  assert.equal(asks.length, 14);
  for (const k of asks) { assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`); assert.ok(say(k, { a: 300, b: 40, c: 2, n: 345 }).length <= 40, `${k} fits the words box: ${T[k]}`); }
  for (const k of spoken) assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const m of HTML.matchAll(/\['((?:build|read|expand|name|skip|cmp|add|sub|sum|tens)\.[a-z0-9._]+|parts)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the rounds use "${m[1]}", which the words do not have`);
  for (const k of ['read.hint', 'expand.hint', 'name.hint', 'skip.hint.5', 'skip.hint.10', 'skip.hint.100', 'cmp.hint.h', 'cmp.hint.t', 'cmp.hint.o', 'cmp.hint.same', 'add.hint', 'sub.hint', 'build.hint.h', 'build.hint.t', 'build.hint.o', 'build.hint.count', 'build.bundle.t', 'build.bundle.o',
    'build.full', 'build.empty', 'ch.build', 'ch.count', 'ch.fuel', 'btn.h', 'btn.t', 'btn.o', 'btn.off', 'btn.go', 'btn.gt', 'btn.eq', 'btn.lt', 'show.h', 'show.t', 'show.o', 'win', 'win.card']) assert.ok(T[k], k);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(price|buy|bought|sell|sold|shop|money|coins?|dollars?|cents?|pay|cost)\b/i, `a launch pad, not a shop: ${text}`);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('rocket-supply'));
  assert.equal(META.slug, 'rocket-supply'); assert.equal(META.title, 'Rocket Supply'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.doesNotMatch(META.description + META.tags, /\b(price|buy|sell|shop|money)\b/i);
  assert.deepEqual(SHELF_INFO['rocket-supply'], { subject: 'math', from: 2, to: 2 }, 'on the Learn shelf as math for grade 2');
  for (const f of ['public/covers/rocket-supply.jpg', 'public/og/rocket-supply.jpg', 'scripts/covers/rocket-supply.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'rocket-supply'), { slug: 'rocket-supply', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('rocket-supply'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.ROCKET_CHAPTERS, { build: ['2.NBT.A.1', '2.NBT.A.3'], count: ['2.NBT.A.2', '2.NBT.A.4'], fuel: ['2.NBT.B.5', '2.OA.B.2'] });
  assert.deepEqual(TAGS.gameCodes('rocket-supply', 'ccss-math'), Object.values(TAGS.ROCKET_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('rocket-supply'));
  assert.equal(UNIT.title, 'The Hundreds Hedge'); assert.equal(UNIT.stamp, 'Hundreds Seed'); assert.equal(UNIT.tool, 'rocket-supply');
  assert.deepEqual(STEPS.map(s => s.n), ['5.1', '5.2', '5.3']);
  assert.deepEqual(STEPS.map(s => [s.standards.launchpad.primary, s.standards.launchpad.also]), [[['2.NBT.A.1', '2.NBT.A.3'], []], [['2.NBT.A.2', '2.NBT.A.4'], []], [['2.NBT.B.5'], ['2.OA.B.2']]]);
  // the locked statements are the published ones, word for word
  const ccss = JSON.stringify(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')));
  const locked = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).launchpadCodes.codes;
  for (const code of Object.values(TAGS.ROCKET_CHAPTERS).flat()) assert.ok(locked[code] && ccss.includes(JSON.stringify(locked[code])), `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'rocket-supply'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(RS.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names: its primary codes,
    // then the ones it also touches
    for (const grade of ['K', '1', '2', '']) assert.deepEqual(TAGS.stepGameCodes('rocket-supply', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('rocket-supply', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('rocket-supply', 'ccss-math', '2', ''), ['2.NBT.A.1', '2.NBT.A.3', '2.NBT.A.2', '2.NBT.A.4', '2.NBT.B.5', '2.OA.B.2'], 'an unlocked grade 2 step claims the game’s grade 2 codes');
  assert.deepEqual(TAGS.stepGameCodes('rocket-supply', 'ccss-math', '1', ''), [], 'and nothing for grade 1');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.RS_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Rocket Supply' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type === 'brb:tts' && !d.pre) e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*'); });</script>`;
  const outside = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: page });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const f = u.startsWith(HOST + '/vendor/') && vendorFile(u);
    const types = { js: 'text/javascript', mjs: 'text/javascript', glb: 'model/gltf-binary', ogg: 'audio/ogg', json: 'application/json', webp: 'image/webp' };
    if (f) return route.fulfill({ status: 200, headers: { 'content-type': types[f.split('.').pop()] || 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) });
    outside.push(u); return route.abort();
  });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await p.goto(HOST + '/');
  const frame = p.frames().find(f => f.url() === HOST + '/frame');
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
  const state = () => frame.evaluate(() => window.__rs.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 30_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
const btn = (s, v) => '#rs-' + (numeric(s) ? 'n' + v : v);
/** The hint a wrong answer gets. */
const hintOf = s => (s.kind === 'read' ? T['read.hint'] : s.kind === 'expand' ? T['expand.hint'] : s.kind === 'name' ? T['name.hint'] : s.kind === 'skip' ? T['skip.hint.' + s.by] : s.kind === 'compare' ? T['cmp.hint.' + s.why] : s.kind === 'add' ? T['add.hint'] : T['sub.hint']);
/** The pods that stand on the pad while a round is asked: [pallets, racks, canisters], worked out here. */
function standing(s) {
  const add = (a, b) => a.map((v, i) => v + b[i]);
  if (s.kind === 'build' || s.kind === 'name' || s.kind === 'skip') return [0, 0, 0];
  if (s.kind === 'read' || s.kind === 'expand') return hto(s.num);
  if (s.kind === 'compare') return add(hto(s.a), hto(s.b));
  return s.kind === 'add' ? add(hto(s.a), hto(s.b)) : hto(s.a);
}
/** The clicks that load a round's number: pallets, racks and canisters (racks only when there are no pallets). */
function loading(s) { const [h, t, o] = hto(s.target); return s.stock.h ? [...Array(h).fill('h'), ...Array(t).fill('t'), ...Array(o).fill('o')] : Array(h * 10 + t).fill('t'); }

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong answer does not advance, six right rounds post game over once`, { skip, timeout: 420_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .rs-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five the other Launchpad games offer)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__rs.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-build, #menu').length), 0);
    await frame.evaluate(() => window.__rs.fast());   // no waiting between the steps of a round; the taps are the real ones
    await until(() => window.__rs.state().moving === 0, null, 90_000);   // round 1's pods have dropped in at the game's own speed
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const want = RS.round(chapter, round, 0);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: shown and spoken (a number's name is heard and written in words, never shown in digits)
      const asked = await text(frame, '#askt'), line = say(s.ask[0], s.ask[1]);
      assert.equal(asked, s.kind === 'name' ? T['show.name'] : line, `round ${round}: the instruction`);
      assert.ok(asked.length <= 40, `round ${round}: a short instruction on screen (${asked})`);
      assert.ok((await g.spoken()).includes(line), `round ${round}: "${line}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), chip(s, false), `round ${round}: the number chip`);
      if (s.kind === 'name') assert.doesNotMatch(asked + (await text(frame, '#sum')), /\d/, `round ${round}: the number is not given away in digits`);
      if (round === 1 || round === 4) await g.shot(`${chapter}-${round}`);
      // the pad: the pods standing on it are the numbers of the round
      assert.deepEqual(s.pods, standing(s), `round ${round}: ${chip(s, false) ?? s.num} stands on the pad`);
      assert.equal(s.ghosts, 0); assert.equal(s.launched, round - 1, `round ${round}: one lift-off for each round so far`);
      if (s.kind === 'skip') assert.deepEqual(s.boards, [...s.seq.map(String), '?'], `round ${round}: the numbers counted stand along the gauge, then a question mark`);
      if (s.kind === 'compare') assert.deepEqual(s.boards, [String(s.a), String(s.b)], `round ${round}: each load under its number`);
      if (s.kind === 'expand') assert.deepEqual(s.boards.map(Number), inParts(s.num).split(' + ').map(Number), `round ${round}: each place under what it is worth`);
      if (s.kind === 'read' || s.kind === 'name') assert.deepEqual(s.boards, [], `round ${round}: nothing gives the number away`);
      if (s.kind === 'build') {
        assert.deepEqual(await ids(frame, '#bar .rs-btn'), ['rs-h', 'rs-t', 'rs-o', 'rs-off', 'rs-go'], `round ${round}: load a hundred, a ten, a one; take one off; lift off`);
        assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .rs-btn')].map(b => b.disabled)), [!s.stock.h, false, !s.stock.o, false, false], `round ${round}: only what is in stock can be loaded`);
        // lift off with the wrong load: a hint, the same round, nothing reported
        await frame.click('#rs-off');
        assert.equal(await text(frame, '#hint'), T['build.empty'], `round ${round}: nothing to take off yet`);
        await frame.click('#rs-t'); await frame.click('#rs-go');
        const [h] = hto(s.target), after = await state();
        assert.deepEqual([after.round, after.phase, after.total, after.pods, after.launched], [round, 'play', 10, [0, 1, 0], round - 1], `round ${round}: a wrong load does not lift off`);
        assert.equal(await text(frame, '#hint'), s.form === 'tens' ? say('build.hint.count', { n: s.target }) : say('build.hint.h', { h }), `round ${round}: a wrong load gets a hint`);
        assert.deepEqual(after.boards, ['0', '1', '0'], `round ${round}: and each place shows how many it holds`);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('#rs-go.no').length), 1, `round ${round}: and a wobble on the button`);
        await frame.click('#rs-off');
        assert.deepEqual([(await state()).total, await text(frame, '#sum')], [0, '0']);
        // load it pod by pod: the chip shows the load so far in its parts, and ten racks lock into a pallet
        let total = 0;
        for (const k of loading(s)) {
          await frame.click('#rs-' + k); total += { h: 100, t: 10, o: 1 }[k];
          const now = await state();
          assert.deepEqual([now.total, now.pods, await text(frame, '#sum')], [total, hto(total), inParts(total)], `round ${round}: ${total} on the pad`);
          if (k === 't' && total === 100) assert.equal(await text(frame, '#hint'), T['build.bundle.t'], `round ${round}: ten tens lock into a hundred, and the game says so`);
        }
        assert.equal(total, s.target);
        assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
        await frame.click('#rs-go');
      } else {
        assert.deepEqual(await ids(frame, '#bar .rs-btn'), s.choices.map(v => btn(s, v).slice(1)), `round ${round}: one big button for each choice`);
        // a wrong answer: a hint and a wobble, the same round, nothing reported, and the pad shows why
        const wrong = s.choices.find(v => v !== s.answer);
        await frame.click(btn(s, wrong));
        const after = await state();
        assert.deepEqual([after.round, after.phase, after.screen, after.launched], [round, 'play', 'play', round - 1], `round ${round}: a wrong answer does not advance`);
        assert.equal(await text(frame, '#hint'), hintOf(s), `round ${round}: a wrong answer gets the round’s hint`);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.rs-btn.no').length), 1, `round ${round}: and a wobble on the button`);
        assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
        if (s.kind === 'read') assert.deepEqual(after.boards, hto(s.num).map(String), `round ${round}: each place shows how many it holds (an empty place shows 0)`);
        if (s.kind === 'skip') assert.deepEqual(after.boards.filter(b => b[0] === '+'), Array(3).fill('+' + s.by), `round ${round}: the hop between the marks is shown`);
        if (s.kind === 'compare') { const i = 'hto'.indexOf(s.why); assert.deepEqual(after.boards.slice().sort(), [String(s.a), String(s.b), String(hto(s.a)[i]), String(hto(s.b)[i])].sort(), `round ${round}: the place that decides is marked on both loads`); }
        if (s.kind === 'add') { assert.equal(after.work, true); assert.deepEqual([after.pods, after.ghosts], [hto(s.answer), 0], `round ${round}: the sum is worked on the pad: ten ones are a new rack`); }
        if (s.kind === 'sub') { const [, tb, ob] = hto(s.b); assert.equal(after.work, true); assert.deepEqual([after.pods, after.ghosts], [hto(s.answer), tb + ob], `round ${round}: a ten is opened, and what is taken away stays as outlines`); }
        await frame.click(btn(s, s.answer));
      }
      await until(r => { const t = window.__rs.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported, s.launched], ['end', 1, 6]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .rs-btn'), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('rocket-supply', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__rs.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(RS.round(chapter, 1, 1)).map(k => [k, s[k]])), RS.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; at the game’s own speed pods drop in, a sum is worked on the pad, and the rocket lifts off when the load is right', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__rs.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .rs-menu .rs-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-build', 'Load the Rocket'], ['ch-count', 'Count and Compare'], ['ch-fuel', 'Fuel Up']]);
  await g.shot('menu');
  // Fuel Up, round 2 (38 + 17), with nothing hurried
  await frame.click('#ch-fuel');
  await until(() => window.__rs.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.fact], ['fuel', false, 'add', true]);
  assert.ok(s.moving > 0, 'the canisters are on their way down');
  await until(() => window.__rs.state().moving === 0, null, 120_000);
  // round 1 right: the work is shown, then the rocket lifts off by itself, and a new one stands ready for round 2
  await frame.click('#rs-n' + s.answer);
  assert.equal((await state()).phase, 'right'); assert.equal(await text(frame, '#sum'), chip(s, true));
  await frame.click('#rs-n' + s.choices.find(v => v !== s.answer));   // a tap after the answer changes nothing
  assert.equal(await text(frame, '#hint'), null);
  await until(() => window.__rs.state().work === true && window.__rs.state().pods[1] === 1, null, 120_000);
  assert.deepEqual((await state()).pods, hto(s.answer), 'ten of the canisters locked into a rack');
  await until(() => window.__rs.state().flying === true, null, 120_000);
  assert.equal((await state()).launched, 1); assert.equal((await state()).round, 1, 'the rocket goes up before the next round comes');
  await g.shot('fuel-liftoff');
  await until(() => window.__rs.state().round === 2 && window.__rs.state().moving === 0, null, 180_000);
  s = await state();
  assert.deepEqual([s.kind, s.fact, s.flying, s.launched, s.pods], ['add', false, false, 1, standing(s)]);
  assert.equal((await g.msgs('brb:gameover')).length, 0);
  // a wrong number: the hint, and the sum is worked on the pad while the buttons wait; then another try
  await frame.click('#rs-n' + (s.answer - 10));
  assert.deepEqual([(await state()).phase, await text(frame, '#hint')], ['try', T['add.hint']]);
  await frame.click('#rs-n' + s.answer);   // a tap while the work is shown changes nothing
  assert.equal((await state()).phase, 'try');
  await g.shot('fuel-work');
  await until(() => window.__rs.state().phase === 'play', null, 180_000);
  s = await state();
  assert.deepEqual([s.work, s.pods, s.round, s.launched], [true, hto(s.answer), 2, 1], 'the answer stands on the pad as racks and canisters; the round goes on');
  assert.ok((await g.spoken()).includes(T['add.ten']), 'and the game says what happened: 10 ones make a new ten');
  await frame.click('#rs-n' + s.answer);
  await until(() => window.__rs.state().round === 3 && window.__rs.state().moving === 0, null, 180_000);
  // round 3 (taking away): a rack opens into ten canisters, and what is taken stays as outlines
  s = await state();
  assert.equal(s.kind, 'sub'); assert.deepEqual(s.pods, hto(s.a));
  await frame.click('#rs-n' + s.answer);
  await until(() => window.__rs.state().ghosts > 0, null, 180_000);
  const [, tb, ob] = hto(s.b);
  assert.deepEqual([(await state()).pods, (await state()).ghosts], [hto(s.answer), tb + ob]);
  await g.shot('fuel-take');
  await until(() => window.__rs.state().launched === 3, null, 180_000);
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();

  // Load the Rocket, at the game's own speed: each pod drops onto its place; the tenth canister locks into a rack
  const y = await open();
  await y.frame.click('#hero-rogue');
  await y.until(() => window.__rs.state().screen === 'menu');
  await y.frame.click('#ch-build');
  await y.until(() => window.__rs.state().screen === 'play' && window.__rs.state().moving === 0, null, 120_000);
  s = await y.state();
  assert.deepEqual([s.kind, s.total, s.pods], ['build', 0, [0, 0, 0]]);
  for (let i = 0; i < 10; i++) await y.frame.click('#rs-o');
  assert.deepEqual([(await y.state()).total, (await y.state()).pods, await text(y.frame, '#hint'), await text(y.frame, '#sum')], [10, [0, 1, 0], T['build.bundle.o'], '10'], 'ten ones are one ten');
  await y.frame.click('#rs-off');
  assert.deepEqual([(await y.state()).total, (await y.state()).pods], [9, [0, 0, 9]], 'taking the last one off opens the ten again');
  for (let i = 0; i < 9; i++) await y.frame.click('#rs-off');
  for (const k of loading(s)) await y.frame.click('#rs-' + k);
  await y.until(() => window.__rs.state().moving === 0, null, 120_000);
  await y.shot('build-loaded');
  await y.frame.click('#rs-go');
  assert.equal(await text(y.frame, '#sum'), chip(s, true));
  await y.until(() => window.__rs.state().flying === true, null, 120_000);
  await y.until(() => window.__rs.state().round === 2, null, 180_000);
  assert.equal((await y.state()).launched, 1);
  assert.deepEqual(y.errors, []); assert.deepEqual(y.outside, []);
  await y.ctx.close();
});

test('keyboard, phones and reduced motion: everything is a big button a key can press, the pad and its pods are in view, and the helper hides none of them', { skip, timeout: 900_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the answer buttons.
  const k = await open({ params: 'chapter=count&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__rs.state().screen === 'play');
  const s = await k.state();
  assert.equal(s.kind, 'skip');
  await k.frame.evaluate(() => window.__rs.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus('#rs-n' + wrong); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), T['skip.hint.5'], 'Enter on the wrong number: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus('#rs-n' + s.choices[0]);
  for (let i = 0; i < s.choices.indexOf(s.answer); i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'rs-n' + s.answer, 'Tab walks the answer buttons in order');
  await k.p.keyboard.press(' ');
  await k.until(() => window.__rs.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^rs-n\d+$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // The top row at desktop width: the words, the chip and the round dots sit on one line and never touch each other
  // or the gear button, in every round of every chapter (the longest instruction and the widest chip among them). Then
  // a 390 px phone, and a 360 px phone with reduced motion: everything fits, the buttons are big, the pods are big
  // enough to count, the helper (as wide as the Wizard's hat) stands clear of every pod and number, and a wrong tap
  // still shows.
  for (const [width, height, reducedMotion, touch] of [[960, 600, 'no-preference', false], [390, 844, 'no-preference', true], [360, 640, 'reduce', true]]) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-mage') : m.frame.click('#hero-mage'));
      await m.until(() => window.__rs.state().screen === 'play');
      await m.frame.evaluate(() => window.__rs.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__rs.state().round === r && window.__rs.state().phase === 'play' && window.__rs.state().moving === 0, round, 120_000);
        let st = await m.state();
        const at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        // a build round is measured with its number loaded; every other round as it is asked
        if (st.kind === 'build') for (const kind of loading(st)) await m.frame.evaluate(v => window.__rs.act('load', v), kind);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar .rs-btn')].map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__rs.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const things = [sp.pods, sp.labels].filter(Boolean).map(box), each = sp.each.map(box), hero = box(sp.hero), rocket = box(sp.rocket), hint = vis($('hint')) ? r($('hint')) : null;
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)),
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // every pod and number board, the rocket and the helper are drawn between the words and the buttons
            view: things.every(b => b.left > 0 && b.right < innerWidth && b.top > line && b.bottom < bar), things: things.length,
            rocket: rocket.left >= 0 && rocket.right <= innerWidth && rocket.top > line && rocket.bottom < bar,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line && hero.bottom < bar, hidden: each.some(b => hit(b, hero)),
            hint: hint ? each.some(b => hit(b, hint)) : null, size: sp.size };
        });
        const fit = await measure();
        assert.deepEqual(fit, { inside: true, top: false, oneLine: width > height ? true : null, small: 0, n: st.kind === 'build' ? 5 : 3, overlap: false, scroll: false, view: true, rocket: true, helper: true, hidden: false, hint: null, things: fit.things, size: fit.size },
          `${at}: on screen, the top row tidy, the buttons big and apart, the pods, the numbers and the rocket in view, the helper clear of them`);
        assert.ok(fit.things > 0 || st.kind === 'name', `${at}: something stands on the pad (only a number that is heard starts with an empty pad)`);
        // a canister is big enough to see and count in its stack of five: at least 15 px across on a desktop, 10 px on a
        // 390 px phone and 9 px on a 360 px one; where two loads are compared, 10, 8 and 6.5 px
        const two = st.kind === 'compare';
        assert.ok(fit.size >= (width >= 900 ? (two ? 10 : 15) : width >= 390 ? (two ? 8 : 10) : (two ? 6.5 : 9)), `${at}: a canister is ${fit.size} px across`);
        if (st.kind !== 'build') {
          // a wrong pick: the hint stands clear of the pods and the numbers, and what the pad then shows is still in view
          const miss = btn(st, st.choices.find(v => v !== st.answer)).slice(1);
          await (touch ? m.frame.tap('#' + miss) : m.frame.click('#' + miss));
          const shown = await measure();
          assert.deepEqual([shown.view, shown.hidden, shown.hint, shown.helper], [true, false, false, true], `${at}: after a wrong pick the hint covers nothing, and everything is still in view`);
          if (round === 1 && reducedMotion === 'reduce') assert.equal(await m.frame.evaluate(id => getComputedStyle(document.getElementById(id)).outlineStyle, miss), 'dashed', `${at}: with reduced motion a wrong tap shows as a dashed outline`);
          assert.equal((await m.state()).round, round);
        }
        if (round === 1 && reducedMotion === 'reduce') await m.shot(`${chapter}-360`);
        // finish the round the quick way (the handle), so the next one can be measured
        st = await m.state();
        await m.frame.evaluate(([kind, v]) => (kind === 'build' ? window.__rs.act('go') : window.__rs.act('answer', v)), [st.kind, st.answer]);
      }
      await m.until(() => window.__rs.state().screen === 'end', null, 60_000);
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
