// Balance Bridge (seed-games/balance-bridge.html): Number Quest Launchpad Unit 4's game, a Kit 2 (Oomba3D) see-saw
// drawbridge over a castle moat for grades 1 and 2: stone blocks on each side, level when both sides are the same.
// Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between balance-bridge:begin and balance-bridge:end): six a chapter, the numbers in
//     the ranges the unit teaches, every answer re-derived from the round's own two sides, the equals sign not always
//     at the end, the wrong choices the mistakes a child really makes, the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), and what the number
//     chip shows (with a "?" or a sign in it) is never sent to be spoken;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, Rapier runs the
//     bridge, the blocks on each side are the numbers of the sum, a wrong answer gets a hint and does not advance the
//     round, every instruction is sent to be spoken, and a correct play of all six rounds posts the game-over message
//     (the course step's completion signal) exactly once, not before; then the picture menu with no parameters, a
//     round at the game's own speed (a wrong number is tried on the bridge and leans it, the right one levels it and
//     the helper walks across), the keyboard, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. BB_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/balance-bridge.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/balance-bridge.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 4), STEPS = UNIT.steps;
const CHAPTERS = ['equal', 'story', 'groups'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const BB = (() => {
  const box = {}; vm.runInNewContext(/\/\* balance-bridge:begin \*\/([\s\S]*?)\/\* balance-bridge:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.BalanceBridge;   // plain objects of this realm, so deepEqual can compare them
  return { CHAPTERS: plain(G.CHAPTERS), ROUNDS: G.ROUNDS, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)), text: G.text, value: G.value };
})();
const T = lines.readGame('balance-bridge').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const numeric = r => typeof r.answer === 'number';
/** What a side is worth, worked out here from its terms (x in place of the number to find). */
const worth = (side, x) => side.reduce((s, t) => s + (t.op === '-' ? -1 : 1) * (t.q ? x : t.n), 0);
/** The sum as the chip writes it, worked out here. */
const written = (side, x) => side.map((t, i) => (i ? (t.op === '-' ? ' − ' : ' + ') : '') + (t.rows ? Array(t.rows).fill(t.cols).join(' + ') : t.q ? (x ?? '?') : t.n)).join('');
const chip = (r, found) => (r.kind === 'parity' ? (found ? `${r.num} = ${r.rv} + ${r.rv}${r.answer === 'odd' ? ' + 1' : ''}` : `${r.num} blocks`)
  : `${written(r.L, found && numeric(r) ? r.answer : null)} = ${written(r.R, found && numeric(r) ? r.answer : null)}${found && r.kind === 'true' ? (r.answer === 'yes' ? ' ✔' : ' ✘') : ''}`);

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  assert.match(HTML, /start\(\{ theme: 'castle-quest', version: '1\.1\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Castle Quest, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/castle-quest')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.1.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/castle-quest/1.1.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Castle Quest 1.1.0 has the piece ${id}`);
  for (const m of HTML.matchAll(/(?:piece\(|\[)'((?:castle|tower|wall|pillar|floor|tree|forest|bush|hill|mountain|rock|well|banner|barrel|crate|torch|chest|block)[a-z-]*)'/g)) assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`);
  for (const id of ['knight', 'barbarian', 'mage', 'rogue', 'rogue-hooded']) assert.ok(theme.heroes.some(h => h.id === id), `the theme has the adventurer ${id}`);
  // the bridge is a Rapier body on a hinge, asked for through Oomba3D, with the game's own spring behind it
  assert.match(HTML, /await g\.physics\(\)/); assert.match(HTML, /JointData\.revolute\(/); assert.match(HTML, /mode: 'simple'/);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button wobble and bring
  // the helper back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 4);
  assert.doesNotMatch(HTML, /setInterval\(/);
});

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the first lap always the same', () => {
  assert.deepEqual([...BB.CHAPTERS], CHAPTERS); assert.equal(BB.ROUNDS, 6);
  assert.equal(BB.round('equal', 0, 0), null); assert.equal(BB.round('equal', 7, 0), null); assert.equal(BB.round('shapes', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(BB.round(ch, n, 0), BB.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap opens on the brief's own examples in kind: a sum and its total, a number and itself, two sums
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => BB.round('equal', n, 0).form), ['ab_c', 'n_n', 'ab_cd', 'a_q_c', 'c_q_b', 'ab_q']);
  assert.deepEqual([1, 2, 3].map(n => BB.round('equal', n, 0).answer), ['yes', 'yes', 'no']);
  /** Three different numbers, smallest first, the answer among them, all inside [lo, hi]. */
  const three = (r, lo, hi, at) => {
    assert.equal(r.choices.length, 3, at); assert.deepEqual([...r.choices].sort((a, b) => a - b), r.choices, `${at}: smallest first`); assert.equal(new Set(r.choices).size, 3, `${at}: three different numbers`);
    assert.ok(r.choices.includes(r.answer), `${at}: the answer is offered`);
    for (const v of r.choices) assert.ok(Number.isInteger(v) && v >= lo && v <= hi, `${at}: ${v} is a number from ${lo} to ${hi}`);
  };
  /** Every number written on a side is a whole number from lo to hi, and so is what each side is worth. */
  const within = (r, lo, hi, at) => { for (const t of [...r.L, ...r.R]) if (!t.q) assert.ok(Number.isInteger(t.n) && t.n >= lo && t.n <= hi, `${at}: ${t.n}`); for (const v of [r.lv, r.rv]) assert.ok(v >= 0 && v <= hi, `${at}: a side worth ${v}`); };
  const seen = { forms: new Set(), tf: new Set(), eqFirst: 0, parity: new Set(), arrays: new Set(), doubles: new Set() };
  for (let lap = 0; lap < 240; lap++) {
    const truths = [], par = [];
    for (let n = 1; n <= 6; n++) {
      for (const ch of CHAPTERS) {
        const r = BB.round(ch, n, lap), at = `${ch} ${n} lap ${lap}`;
        // what each side is worth is worked out here from its terms, never taken from the game
        assert.equal(r.lv, worth(r.L, numeric(r) ? r.answer : 0), `${at}: the left side`); assert.equal(r.rv, worth(r.R, numeric(r) ? r.answer : 0), `${at}: the right side`);
        assert.equal(BB.text(r.L) + ' = ' + BB.text(r.R), written(r.L) + ' = ' + written(r.R), `${at}: the sum as it is written`);
        const unknowns = [...r.L, ...r.R].filter(t => t.q).length;
        if (numeric(r)) {
          assert.equal(r.lv, r.rv, `${at}: with ${r.answer} in, both sides are the same (${written(r.L, r.answer)} = ${written(r.R, r.answer)})`);
          assert.equal(unknowns, r.kind === 'double' ? 2 : 1, `${at}: one number to find`);
          // no other choice balances the bridge
          for (const v of r.choices) if (v !== r.answer) assert.notEqual(worth(r.L, v), worth(r.R, v), `${at}: ${v} does not balance`);
          // a number to find is never taken away, so a bigger try is always a heavier side
          for (const side of [r.L, r.R]) for (const t of side) if (t.q) assert.notEqual(t.op, '-', at);
        } else assert.equal(unknowns, 0, `${at}: nothing hidden`);
        // a taking away never takes more than is there, and takes small blocks that are there to take
        for (const side of [r.L, r.R]) side.forEach((t, i) => { if (t.op === '-') { assert.ok(i > 0, at); const before = worth(side.slice(0, i), numeric(r) ? r.answer : 0); assert.ok(t.n <= before, `${at}: ${t.n} from ${before}`); } });
        assert.ok(T[r.ask[0]], `${at}: the question ${r.ask[0]} is one of the game's lines`); for (const [k] of r.said) assert.ok(T[k], `${at}: ${k}`);
        for (const [k, v] of [r.ask, ...r.said]) assert.doesNotMatch(say(k, v), /undefined|\{/, `${at}: ${k} has all its numbers`);
      }
      // ---- equal: true or not true (1-3), then the missing number (4-6)
      const e = BB.round('equal', n, lap), ea = `equal ${n} lap ${lap}`;
      assert.equal(e.kind, n <= 3 ? 'true' : 'find', ea); within(e, 1, 20, ea); seen.forms.add(e.form);
      if (e.kind === 'true') {
        assert.deepEqual(e.choices, ['yes', 'no'], ea); assert.equal(e.answer, e.lv === e.rv ? 'yes' : 'no', `${ea}: ${written(e.L)} = ${written(e.R)}`);
        assert.equal(e.form, n === 1 ? 'ab_c' : n === 3 ? 'ab_cd' : lap % 2 ? 'c_ab' : 'n_n', ea);
        if (e.answer === 'no') assert.ok(Math.abs(e.lv - e.rv) <= 2, `${ea}: a near miss, not a wild one`);
        if (e.form === 'ab_cd' && e.answer === 'yes') assert.notEqual(e.L[0].n, e.R[0].n, `${ea}: two different sums of the same number`);
        truths.push(e.answer); seen.tf.add(e.form + ':' + e.answer);
        assert.deepEqual(e.said, [e.answer === 'yes' ? ['tf.yes', { n: e.lv }] : ['tf.no', { a: e.lv, b: e.rv }]], ea);
      } else {
        three(e, 1, 20, ea);
        assert.equal(e.form, n === 4 ? 'a_q_c' : n === 5 ? 'c_q_b' : lap % 2 ? 'ab_qd' : 'ab_q', ea);
        if (e.form === 'a_q_c') assert.ok(e.choices.includes(e.R[0].n), `${ea}: the total itself (${e.R[0].n}) is offered`);
        if (e.form === 'c_q_b') assert.ok(e.choices.includes(e.L[0].n), `${ea}: the number before the equals sign (${e.L[0].n}) is offered`);
        if (e.form === 'ab_qd') assert.ok(e.choices.includes(e.L[0].n + e.L[1].n), `${ea}: the left side's total (${e.L[0].n + e.L[1].n}, "the answer comes next") is offered`);
        if (e.form === 'ab_q') assert.equal(e.L[0].n, e.L[1].n, `${ea}: a double`);
        assert.deepEqual(e.said[e.said.length - 1], ['both', {}], ea);
      }
      // the equals sign is not at the end when the right side is more than one bare number
      if (e.R.length > 1 || (e.L.length === 1 && e.R.length === 1)) seen.eqFirst++;
      // ---- story: within 20 (1-4), within 100 (5), two steps (6)
      const s = BB.round('story', n, lap), sa = `story ${n} lap ${lap}`;
      assert.equal(s.kind, 'story', sa); assert.equal(s.form, ['add', 'take', 'part', 'compare', 'need', 'two'][n - 1], sa);
      three(s, 1, n <= 4 ? 20 : 100, sa); within(s, 1, n <= 4 ? 20 : 100, sa); seen.forms.add(s.form);
      if (n === 5) { assert.ok(s.answer % 10 === 0 && s.R[0].n > 20, `${sa}: tens more, to a number past 20`); assert.ok(s.choices.includes(s.answer / 10), `${sa}: the tens said as ones (${s.answer / 10}) is offered`); }
      if (n === 6) { assert.equal(s.L.length, 3, `${sa}: two steps`); assert.deepEqual(s.L.map(t => t.op || ''), ['', '+', '-'], sa); assert.ok(s.choices.includes(s.L[0].n + s.L[1].n), `${sa}: stopping after the first step (${s.L[0].n + s.L[1].n}) is offered`); assert.ok(s.L[2].n <= s.L[0].n % 10, `${sa}: the blocks that roll away are loose ones`); }
      if (n === 2) assert.deepEqual(s.L.map(t => t.op || ''), ['', '-'], sa);
      if (n === 3 || n === 5) assert.ok(s.L[1].q && s.R.length === 1, `${sa}: a part to find`);
      if (n === 4) assert.ok(s.R[1].q && s.L.length === 1 && s.L[0].n > s.R[0].n, `${sa}: how many more to match the bigger side`);
      // ---- groups: odd or even (1-2), a double (3-4), rows (5-6)
      const g = BB.round('groups', n, lap), ga = `groups ${n} lap ${lap}`;
      assert.equal(g.kind, ['parity', 'parity', 'double', 'double', 'array', 'array'][n - 1], ga);
      if (g.kind === 'parity') {
        assert.ok(g.num >= 6 && g.num <= 20, `${ga}: ${g.num} blocks, up to 20`); assert.equal(g.answer, g.num % 2 ? 'odd' : 'even', ga); assert.deepEqual(g.choices, ['even', 'odd'], ga);
        assert.equal(g.lv + g.rv, g.num, `${ga}: every block is on the bridge`); assert.ok(g.lv - g.rv === (g.num % 2), `${ga}: shared one to each side; an odd number leaves one over on the left`);
        par.push(g.answer); seen.parity.add(g.num);
      } else if (g.kind === 'double') {
        assert.ok(g.num % 2 === 0 && g.num >= 6 && g.num <= 20, `${ga}: an even number up to 20`); assert.equal(g.answer * 2, g.num, ga); three(g, 1, 20, ga);
        assert.deepEqual(g.said, [['sum.add', { a: g.answer, b: g.answer, c: g.num }], ['both', {}]], ga); seen.doubles.add(g.num);
      } else {
        assert.ok(g.rows >= 2 && g.rows <= 5 && g.cols >= 2 && g.cols <= 5, `${ga}: up to 5 rows and 5 columns`); assert.equal(g.answer, g.rows * g.cols, ga); three(g, 2, 30, ga);
        assert.equal(written(g.L), Array(g.rows).fill(g.cols).join(' + '), `${ga}: the rows written as equal addends`);
        assert.ok(g.choices.includes(g.rows + g.cols) || g.rows + g.cols === g.answer, `${ga}: rows and columns added (${g.rows + g.cols}) is offered`); seen.arrays.add(g.rows + 'x' + g.cols);
      }
    }
    assert.ok(truths.includes('yes') && truths.includes('no'), `equal lap ${lap}: at least one true and one not true`);
    assert.deepEqual([...par].sort(), ['even', 'odd'], `groups lap ${lap}: one even number and one odd`);
  }
  assert.deepEqual([...seen.forms].sort(), ['a_q_c', 'ab_c', 'ab_cd', 'ab_q', 'ab_qd', 'add', 'c_ab', 'c_q_b', 'compare', 'n_n', 'need', 'part', 'take', 'two']);
  for (const f of ['ab_c', 'n_n', 'c_ab', 'ab_cd']) for (const a of ['yes', 'no']) assert.ok(seen.tf.has(`${f}:${a}`), `${f} is sometimes ${a}`);
  assert.ok(seen.eqFirst >= 240 * 2, 'at least two rounds a lap have the equals sign somewhere other than the end');
  assert.ok(Math.min(...seen.parity) <= 7 && Math.max(...seen.parity) >= 18 && seen.doubles.has(20) && seen.arrays.has('5x5') && seen.arrays.has('2x5'), 'the whole range is reached: to 20, and rows up to 5 by 5');
  assert.deepEqual(BB.params({ chapter: 'story', lock: 1 }), { chapter: 'story', lock: true });
  assert.deepEqual(BB.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(BB.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, story, hint and answer line is a registered spoken line, short enough for a six-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('balance-bridge'));
  const ok = text => lines.allowedLine('balance-bridge', 'en', text);
  const NUMS = { a: 27, b: 5, c: 32, d: 4, e: 9, n: 34, m: 6, h: 17, r: 3, x: 8 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 35);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what the chip shows and the button labels are shown, never read; nor is a sum with its signs
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('8 + ? = 11'), null); assert.equal(ok('5 = ? − 3'), null);
  assert.equal(say('tf.ask.ab_c', { a: 5, b: 2, c: 7 }), 'Is 5 plus 2 the same as 7?'); assert.equal(say('tf.ask.n_n', { a: 6, b: 6 }), 'Is 6 the same as 6?');
  assert.equal(say('tf.ask.ab_cd', { a: 4, b: 1, c: 5, d: 2 }), 'Is 4 plus 1 the same as 5 plus 2?'); assert.equal(say('tf.ask.c_ab', { c: 7, a: 8, b: 1 }), 'Is 7 the same as 8 take away 1?');
  assert.equal(say('find.ask.a_q_c', { a: 8, c: 11 }), '8 plus what is the same as 11?'); assert.equal(say('find.ask.c_q_b', { c: 5, b: 3 }), '5 is the same as what take away 3?');
  assert.equal(say('find.ask.ab_q', { a: 6, b: 6 }), '6 plus 6 is the same as what?'); assert.equal(say('tf.no', { a: 5, b: 7 }), 'Not true. 5 is not the same as 7.');
  assert.equal(say('st.add', { a: 7, b: 5 }), '7 stones. 5 more come. How many now?'); assert.equal(say('st.two', { a: 34, b: 20, c: 3 }), '34 stones. 20 more come. 3 roll away. How many now?');
  assert.equal(say('st.two.sum', { a: 34, b: 20, c: 54, d: 3, e: 51 }), '34 and 20 make 54. Take away 3: 51.'); assert.equal(say('st.compare.sum', { a: 15, x: 6, b: 9 }), '15 is 6 more than 9.');
  assert.equal(say('par.even', { n: 8, h: 4 }), '8 is even. 4 and 4 make 8.'); assert.equal(say('par.odd', { n: 7 }), '7 is odd. One is left over.'); assert.equal(say('arr.ask', { r: 3, c: 4 }), '3 rows of 4. How many?');
  assert.equal(say('show.blocks', { n: 7 }), '7 blocks');
  assert.equal(ok('Cross the bridge and call me.'), null, 'only the game’s own lines');
  assert.equal(ok('Is five plus 2 the same as 7?'), null, 'a number goes where the number is, never a word');
  // The instructions: an ordinary question is one or two sentences, 10 words at most. A story is up to four
  // sentences of at most 6 words each, 60 characters on the screen with two-digit numbers in.
  const asks = spoken.filter(k => /^(hero\.pick|menu\.pick|tf\.ask\.|find\.ask\.|par\.ask|dbl\.ask|arr\.ask)/.test(k)), stories = spoken.filter(k => /^st\.(add|take|part|compare|need|two)$/.test(k));
  assert.equal(asks.length, 13); assert.equal(stories.length, 6);
  for (const k of asks) { assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short: ${T[k]}`); }
  for (const k of stories) {
    const parts = T[k].split(/(?<=[.!?])\s+/);
    assert.ok(parts.length <= 4, `${k}: ${T[k]}`); for (const p of parts) assert.ok(p.split(/\s+/).length <= 6, `${k}: a short sentence (${p})`);
    assert.ok(say(k, { a: 34, b: 20, c: 57 }).length <= 60, `${k} fits the words box`); assert.match(parts[parts.length - 1], /^How many .*\?$/, `${k} ends on its question`);
  }
  // No other spoken line is long: 10 words at most.
  for (const k of spoken.filter(k => !stories.includes(k))) assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const m of HTML.matchAll(/\['((?:tf|find|st|sum|par|dbl|arr|try)\.[a-z._]+|both)'/g)) assert.ok(T[m[1]] !== undefined, `the rounds use "${m[1]}", which the words do not have`);
  for (const k of ['tf.hint', 'par.hint', 'try.light', 'try.heavy', 'ch.equal', 'ch.story', 'ch.groups', 'btn.yes', 'btn.no', 'btn.even', 'btn.odd', 'win', 'win.card']) assert.ok(T[k], k);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(price|buy|bought|sell|sold|shop|money|coins?|dollars?|cents?|pay|cost)\b/i, `a castle, not a shop: ${text}`);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('balance-bridge'));
  assert.equal(META.slug, 'balance-bridge'); assert.equal(META.title, 'Balance Bridge'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.doesNotMatch(META.description + META.tags, /\b(price|buy|sell|shop|money)\b/i);
  assert.deepEqual(SHELF_INFO['balance-bridge'], { subject: 'math', from: 1, to: 2 }, 'on the Learn shelf as math for grades 1 and 2');
  for (const f of ['public/covers/balance-bridge.jpg', 'public/og/balance-bridge.jpg', 'scripts/covers/balance-bridge.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'balance-bridge'), { slug: 'balance-bridge', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('balance-bridge'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.BRIDGE_CHAPTERS, { equal: ['1.OA.D.7', '1.OA.D.8'], story: ['1.OA.A.1', '2.OA.A.1'], groups: ['2.OA.C.3', '2.OA.C.4'] });
  assert.deepEqual(TAGS.gameCodes('balance-bridge', 'ccss-math'), Object.values(TAGS.BRIDGE_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('balance-bridge'));
  assert.equal(UNIT.title, 'The Balance Bridge'); assert.equal(UNIT.stamp, 'Balance Seed'); assert.equal(UNIT.tool, 'balance-bridge');
  assert.deepEqual(STEPS.map(s => s.n), ['4.1', '4.2', '4.3']);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'balance-bridge'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(BB.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names: its primary codes,
    // then the ones it also touches
    for (const grade of ['K', '1', '2', '']) assert.deepEqual(TAGS.stepGameCodes('balance-bridge', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('balance-bridge', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('balance-bridge', 'ccss-math', '1', ''), ['1.OA.D.7', '1.OA.D.8', '1.OA.A.1'], 'an unlocked grade 1 step claims the game’s grade 1 codes');
  assert.deepEqual(TAGS.stepGameCodes('balance-bridge', 'ccss-math', '2', ''), ['2.OA.A.1', '2.OA.C.3', '2.OA.C.4'], 'an unlocked grade 2 step its grade 2 codes');
  assert.deepEqual(TAGS.stepGameCodes('balance-bridge', 'ccss-math', 'K', ''), [], 'and nothing for kindergarten');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.BB_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Balance Bridge' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__bb.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 30_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
const btn = (s, v) => '#bb-' + (numeric(s) ? 'n' + v : v);
/** The hint a wrong answer gets. */
const hintOf = (s, v) => (s.kind === 'true' ? T['tf.hint'] : s.kind === 'parity' ? T['par.hint'] : v < s.answer ? T['try.light'] : T['try.heavy']);
/** What stands on each side while the round is asked: the small blocks, the tens slabs, the ghosts of blocks taken
 *  away and the chests, worked out here from the round's terms (numbers over 20 stand as tens and ones). */
function standing(s, x = null) {
  const side = terms => {
    const out = { ones: 0, tens: 0, ghosts: 0, chests: 0 };
    for (const t of terms) {
      const v = t.q ? x : t.n;
      if (t.op === '-') { out.ghosts += v; if (out.ones >= v) out.ones -= v; continue; }   // "? − 3" with the chest still shut: three ghosts beside it
      if (v == null) { out.chests++; continue; }
      if (v > 20 && s.kind !== 'array') { out.tens += Math.floor(v / 10); out.ones += v % 10; } else out.ones += v;
    }
    return out;
  };
  return { l: side(s.L), r: side(s.R) };
}
const heavy = b => ({ l: b.l.ones + 10 * b.l.tens, r: b.r.ones + 10 * b.r.tens });
const leanOf = (w, held) => (held || w.l === w.r ? 'level' : w.l > w.r ? 'left' : 'right');

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong answer does not advance, six right rounds post game over once`, { skip, timeout: 420_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.equal((await state()).physics, 'rapier', 'Rapier started inside the production frame: the bridge is its rigid body');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .bb-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five the other Launchpad games offer)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__bb.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-equal, #menu').length), 0);
    await frame.evaluate(() => window.__bb.fast());   // no waiting between the steps of a round; the taps are the real ones
    await until(() => window.__bb.state().moving === 0, null, 90_000);   // round 1's blocks have dropped in at the game's own speed
    let crossed = 0;
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const want = BB.round(chapter, round, 0);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.equal(asked, say(s.ask[0], s.ask[1]), `round ${round}: the instruction`);
      assert.ok(asked.length <= (s.kind === 'story' ? 60 : 44), `round ${round}: a short instruction on screen (${asked})`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), chip(s, false), `round ${round}: the number chip`);
      if (round === 1 || round === 4) await g.shot(`${chapter}-${round}`);
      // the bridge: the blocks standing on each side are the numbers of the sum, a chest where a number is hidden
      const stand = standing(s), held = s.kind === 'true' || s.kind === 'parity';
      assert.deepEqual(s.blocks, stand, `round ${round}: ${chip(s, false)} stands on the bridge`);
      assert.deepEqual(s.weight, heavy(stand), `round ${round}: and weighs what it shows`);
      assert.deepEqual([s.held, s.lean], [held, leanOf(heavy(stand), held)], `round ${round}: ${held ? 'posts hold the bridge level until the answer' : 'the bridge leans to the heavier side'}`);
      assert.deepEqual(await ids(frame, '#bar .bb-btn'), s.choices.map(v => btn(s, v).slice(1)), `round ${round}: one big button for each choice`);
      // a wrong answer: a hint and a wobble, the same round, nothing reported
      const wrong = s.choices.find(v => v !== s.answer);
      await frame.click(btn(s, wrong));
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.crossed], [round, 'play', 'play', crossed], `round ${round}: a wrong answer does not advance`);
      assert.equal(await text(frame, '#hint'), hintOf(s, wrong), `round ${round}: a wrong answer gets the round’s hint`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.bb-btn.no').length), 1, `round ${round}: and a wobble on the button`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await frame.click(btn(s, s.answer));
      await until(r => { const t = window.__bb.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      // the helper walks across when (and only when) the two sides are the same
      if (s.lv === s.rv) crossed++;
      if (round < 6) assert.equal((await state()).crossed, crossed, `round ${round}: ${s.lv === s.rv ? 'level, so the helper crossed' : 'not level, so the helper stayed'}`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .bb-btn'), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('balance-bridge', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__bb.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(BB.round(chapter, 1, 1)).map(k => [k, s[k]])), BB.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; at the game’s own speed a wrong number is tried on the bridge, the right one levels it and the helper walks across', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__bb.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .bb-menu .bb-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-equal', 'Same on Both Sides'], ['ch-story', 'Castle Stories'], ['ch-groups', 'Pairs and Rows']]);
  await g.shot('menu');
  // Castle Stories, round 1 (8 stones, 5 more come), with nothing hurried: the blocks drop in a number at a time
  await frame.click('#ch-story');
  await until(() => window.__bb.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.form, s.physics], ['story', false, 'add', 'rapier']);
  assert.ok(s.moving > 0, 'the blocks are on their way down');
  await until(() => window.__bb.state().moving === 0, null, 120_000);
  s = await state();
  const a = s.L[0].n + s.L[1].n;
  assert.deepEqual([s.weight, s.lean, s.side, s.crossed], [{ l: a, r: 0 }, 'left', -1, 0], 'both numbers have landed on the left; the bridge leans left');
  await until(() => window.__bb.state().angle > 0.1, null, 120_000);
  assert.ok((await frame.evaluate(() => window.__bb.heroAt()))[0] < -3.5, 'the helper waits on the left bank');
  // a wrong number is tried: its blocks drop onto the right side, the bridge shows the mistake, and they go again
  const low = s.choices.find(v => v < s.answer), high = s.choices.find(v => v > s.answer);
  assert.ok(low != null && high == null, 'round 1 offers a number that is too small');
  const tryOn = async (v, lean, hint, a) => {
    await frame.click('#bb-n' + v);
    assert.equal((await state()).phase, 'try'); assert.equal(await text(frame, '#hint'), hint);
    await frame.click('#bb-n' + s.answer);   // a tap while the number is being tried changes nothing
    await until(n => { const t = window.__bb.state(); return t.weight.r === n && t.blocks.r.ones === n; }, v, 120_000);
    assert.deepEqual([(await state()).lean, (await state()).phase, (await state()).trial], [lean, 'try', v], `${v} on the right: the bridge leans ${lean}`);
    if (lean === 'right') await until(() => window.__bb.state().angle < -0.1, null, 120_000);   // it really tips the other way
    if (lean === 'right') await g.shot('story-try');
    await until(() => window.__bb.state().phase === 'play', null, 120_000);
    const back = await state();
    assert.deepEqual([back.weight, back.blocks.r, back.round], [{ l: a, r: 0 }, { ones: 0, tens: 0, ghosts: 0, chests: 1 }, s.round], 'the tried blocks are gone, the chest is back, the round goes on');
  };
  await tryOn(low, 'left', 'Too light. Try a bigger number.', a);
  assert.equal((await state()).crossed, 0);
  // the right number: the bridge comes level, and only then does the helper walk across to the other bank
  await frame.click('#bb-n' + s.answer);
  assert.equal((await state()).phase, 'right'); assert.equal(await text(frame, '#sum'), chip(s, true));
  await until(n => window.__bb.state().weight.r === n, s.answer, 120_000);
  assert.equal((await state()).lean, 'level');
  await until(() => window.__bb.state().crossed === 1, null, 180_000);
  assert.ok(Math.abs((await state()).angle) < 0.02, 'the bridge was level and still when the helper set off');
  await g.shot('story-cross');
  await until(() => window.__bb.state().round === 2, null, 180_000);
  assert.ok((await frame.evaluate(() => window.__bb.heroAt()))[0] > 3.5, 'the helper is on the right bank for the next round');
  assert.equal((await g.msgs('brb:gameover')).length, 0);
  // round 2 (some roll away): the blocks that are taken away drop in, then roll off, and their ghosts stay
  s = await state();
  assert.equal(s.form, 'take');
  await until(() => window.__bb.state().moving === 0, null, 180_000);
  s = await state();
  assert.deepEqual([s.blocks.l, s.weight], [{ ones: s.L[0].n - s.L[1].n, tens: 0, ghosts: s.L[1].n, chests: 0 }, { l: s.answer, r: 0 }], 'what is left stands on the bridge; what rolled away is a ghost');
  // and a number that is too big tips the bridge the other way
  const big = s.choices.find(v => v > s.answer);
  assert.ok(big != null);
  await tryOn(big, 'right', 'Too heavy. Try a smaller number.', s.answer);
  assert.equal((await state()).crossed, 1);
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();

  // Same on Both Sides, round 1: the posts hold the bridge until the answer; then it shows the truth by itself
  const y = await open();
  await y.frame.click('#hero-rogue');
  await y.until(() => window.__bb.state().screen === 'menu');
  await y.frame.click('#ch-equal');
  await y.until(() => window.__bb.state().screen === 'play' && window.__bb.state().moving === 0, null, 120_000);
  s = await y.state();
  assert.deepEqual([s.kind, s.held, s.lean, s.answer], ['true', true, 'level', 'yes']);
  await y.frame.click('#bb-no');
  assert.deepEqual([(await y.state()).phase, (await y.state()).held, await text(y.frame, '#hint')], ['play', true, 'Count each side. Are they the same?']);
  await y.frame.click('#bb-yes');
  await y.until(() => window.__bb.state().held === false, null, 120_000);
  assert.equal(await text(y.frame, '#sum'), chip(s, true));
  await y.until(() => window.__bb.state().crossed === 1, null, 180_000);
  assert.deepEqual(y.errors, []); assert.deepEqual(y.outside, []);
  await y.ctx.close();
});

test('keyboard, phones and reduced motion: everything is a big button a key can press, the bridge and its blocks are in view, and the helper hides none of them', { skip, timeout: 600_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the answer buttons.
  const k = await open({ params: 'chapter=groups&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__bb.state().screen === 'play');
  const s = await k.state();
  assert.equal(s.kind, 'parity');
  await k.frame.evaluate(() => window.__bb.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus('#bb-' + wrong); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), T['par.hint'], 'Enter on the wrong word: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus('#bb-' + s.choices[0]);
  for (let i = 0; i < s.choices.indexOf(s.answer); i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'bb-' + s.answer, 'Tab walks the answer buttons in order');
  await k.p.keyboard.press(' ');
  await k.until(() => window.__bb.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^bb-(even|odd)$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // The top row at desktop width: the words, the chip and the round dots sit on one line and never touch each other
  // or the gear button, in every round of every chapter (the longest story and the widest chip among them). Then a
  // 390 px phone, and a 360 px phone with reduced motion: everything fits, the buttons are big, the blocks are big
  // enough to count, the helper stands clear of them, and a wrong tap still shows.
  for (const [width, height, reducedMotion, touch] of [[960, 600, 'no-preference', false], [390, 844, 'no-preference', true], [360, 640, 'reduce', true]]) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-rogue') : m.frame.click('#hero-rogue'));
      await m.until(() => window.__bb.state().screen === 'play');
      await m.frame.evaluate(() => window.__bb.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__bb.state().round === r && window.__bb.state().phase === 'play' && window.__bb.state().moving === 0, round, 120_000);
        const st = await m.state(), at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        const fit = await m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar .bb-btn')].map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__bb.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const things = [sp.blocks, sp.labels].filter(Boolean).map(box), hero = box(sp.hero);
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)),
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // the bridge end to end, every block and number board, and the helper are drawn between the words and the buttons
            view: sp.left[0] > 2 && sp.right[0] < innerWidth - 2 && sp.left[1] < bar && sp.right[1] < bar && things.every(b => b.left > 0 && b.right < innerWidth && b.top > line && b.bottom < bar),
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line && hero.bottom < bar, hidden: things.slice(0, 1).some(b => hit(b, hero)), size: sp.size };
        });
        assert.deepEqual(fit, { inside: true, top: false, oneLine: width > height ? true : null, small: 0, n: st.choices.length, overlap: false, scroll: false, view: true, helper: true, hidden: false, size: fit.size },
          `${at}: on screen, the top row tidy, the buttons big and apart, the bridge and its blocks in view, the helper clear of the blocks`);
        // a block is big enough to count: at least 21 px across on a 390 px phone, 19 px on a 360 px one, 30 px on a desktop
        assert.ok(fit.size >= (width >= 900 ? 30 : width >= 390 ? 21 : 19), `${at}: a block is ${fit.size} px across`);
        if (round === 1 && reducedMotion === 'reduce') {
          const miss = btn(st, st.choices.find(v => v !== st.answer)).slice(1);
          await m.frame.tap('#' + miss);
          assert.equal(await m.frame.evaluate(id => getComputedStyle(document.getElementById(id)).outlineStyle, miss), 'dashed', `${at}: with reduced motion a wrong tap shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(v => window.__bb.act('answer', v), st.answer);
      }
      await m.until(() => window.__bb.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
