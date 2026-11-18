// Machine Line (seed-games/machine-line.html): Number Quest Pro Unit 3's game (The Machine Hall, grades 6-7), a Kit 2
// (Oomba3D) factory street at sunset with a board that shows a line of machines. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Toy Town at sunset
//     (Crate Stacker plays the same world by day), and it has no timer, no lives, no losing and no balance;
//   - its rounds (the pure block between machine-line:begin and machine-line:end): six a chapter, every answer worked
//     out again here from the words the round asks with (never from the game's own target), every plan a player can
//     make judged (every order of every block, every stepper value, every ray), every wrong plan answered with one of
//     the game's own lines and a picture whose numbers are what that plan really gives; the same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the words box prints the signs between numbers, what the chip and the board show and the button labels
//     are never sent to be spoken, and nothing is bought or sold;
//   - its registration: seeded, on the Learn shelf for grades 6-7, in the Number Quest course, tagged chapter by chapter
//     with the codes units.json gives the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one loads a crate, and six right rounds post the game-over message exactly once, not before; then the
//     menu with no parameters, a round at the game's own speed with the real block buttons, the keyboard, a drag on the
//     number line, a desktop, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. ML_SHOTS=<dir> saves screenshots there.
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
const { sayMath } = await import('../../seed-lessons/number-quest/math-text.js');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/machine-line.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/machine-line.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 3), STEPS = UNIT.steps;
const CHAPTERS = ['build', 'same', 'undo'];
const MINUS = '−';

// The game's own round maker and words, run on their own (no DOM, no 3D).
const ML = (() => {
  const box = {}; vm.runInNewContext(/\/\* machine-line:begin \*\/([\s\S]*?)\/\* machine-line:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.MachineLine;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS }), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), nt: v => G.nt(v),
    opText: o => G.opText(o), expr: (o, v) => G.expr(o, v), same: (a, b) => G.same(a, b), op: (c, k) => plain(G.op(c, k)), sign: (d, c) => G.sign(d, c) };
})();
const T = lines.readGame('machine-line').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];
/** A line as the screen prints it, and several lines as the words box shows them. */
const printed = l => (typeof l === 'string' ? l : ML.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');

// ---- What this test knows about the maths, written out here and never taken from the game. ----
/** A printed number: "−4" is −4. */
const num = s => +String(s).replace(MINUS, '-');
/** What a machine does, read off the words written on it: "× 3", "+ 5", "− 2", "÷ 2", "( )²". */
const machine = t => { const m = /^([×+−÷]) (\d+)$/.exec(t); if (t === '( )²') return x => x * x; assert.ok(m, `a machine reads "${t}"`); const k = +m[2]; return { '×': x => x * k, '+': x => x + k, [MINUS]: x => x - k, '÷': x => x / k }[m[1]]; };
/** A number sent through machines, one after the other: every value on the way. */
const ride = (texts, x) => texts.reduce((vals, t) => [...vals, machine(t)(vals.at(-1))], [x]);
const out = (texts, x) => ride(texts, x).at(-1);
/** A printed expression in one letter, worked out for a number: "3n + 5", "3(n + 4)", "(n + 6) ÷ 2", "2n²", "(2n)²", "8x − (3x + 2)". */
function evalExpr(s, x) {
  let pos = 0; const src = s.replace(/\s+/g, '');
  const peek = () => src[pos], eat = c => { assert.equal(src[pos], c, `"${s}" at ${pos}`); pos++; };
  const atom = () => {
    let v;
    if (peek() === '(') { eat('('); v = sum(); eat(')'); }
    else if (/[a-z]/.test(peek())) { pos++; v = x; }
    else { const m = /^\d+(\.\d+)?/.exec(src.slice(pos)); assert.ok(m, `a number in "${s}" at ${pos}`); pos += m[0].length; v = +m[0]; }
    while (peek() === '²') { pos++; v *= v; }
    return v;
  };
  // a number, a letter and a bracket written side by side are multiplied; a power binds tighter than that
  const term = () => { let v = atom(); for (;;) { if (peek() === '×') { pos++; v *= atom(); } else if (peek() === '÷') { pos++; v /= atom(); } else if (peek() !== undefined && /[a-z(\d]/.test(peek())) v *= atom(); else return v; } };
  const sum = () => { let v = term(); for (;;) { if (peek() === '+') { pos++; v += term(); } else if (peek() === MINUS) { pos++; v -= term(); } else return v; } };
  const v = sum(); assert.equal(pos, src.length, `all of "${s}" was read`); return v;
}
const XS = [0, 1, 2, 3, 4, 5, 7, 11, -2, 0.5];
const sameFn = (f, g) => XS.every(x => Math.abs(f(x) - g(x)) < 1e-9);
/** What each instruction means, as a function of the input, from the numbers in its words. */
const MEANS = {
  'g.ask.more': v => x => v.a * x + v.b, 'g.ask.story': v => x => v.a * x + v.b, 'g.ask.group': v => x => v.a * (x + v.b), 'g.ask.read': v => x => (x + v.b) / v.a,
  'g.ask.eval': v => x => v.a * x + v.b, 'g.ask.sqmul': v => x => v.a * x * x, 'g.ask.mulsq': v => x => (v.a * x) * (v.a * x),
  's.lineA.am': v => x => (x + v.b) * v.a, 's.lineA.ma': v => x => v.a * x + v.c, 's.lineA.m': v => x => v.a * x, 's.lineB.ma': v => x => v.a * x + v.c, 's.lineB.sq': () => x => x * x,
  's.ask.combine': v => x => v.a * x + v.b * x + v.c, 's.ask.minus': v => x => v.a * x - (v.b * x + v.c),
  'u.line.a': v => x => x + v.b, 'u.line.s': v => x => x - v.b, 'u.line.m': v => x => v.a * x, 'u.line.ma': v => x => v.a * x + v.b, 'u.line.ms': v => x => v.a * x - v.b, 'u.line.am': v => x => (x + v.b) * v.a,
};
const meaning = l => MEANS[l[0]](l[1]);
const vals = r => r.opts.map(o => o.v), right = r => r.opts[r.answer];
/** Every plan a player can build: each ordered choice of different blocks, from none to all the slots. */
function plans(r) {
  const res = [[]], n = r.build.blocks.length;
  const grow = p => { if (p.length === r.build.slots) return; for (let i = 0; i < n; i++) if (!p.includes(i)) { res.push([...p, i]); grow([...p, i]); } };
  grow([]); return res;
}
/** A row of the board, checked: each value is what the machine before it makes of the value before that. */
function rowOk(row, at) {
  assert.ok(Array.isArray(row.vals) && row.vals.length === row.ops.length + 1, `${at}: one value box more than machines`);
  for (const m of row.ops) { if (m.slot) continue; assert.equal(typeof m.t, 'string', at); machine(m.t); assert.ok(m.tone === undefined || ['ok', 'warn'].includes(m.tone), at); }
  for (const v of row.vals) assert.doesNotMatch(v, /-\d|undefined|NaN/, `${at}: ${v}`);
  if (row.vals.every(v => /^−?\d+(\.\d+)?$/.test(v)) && row.ops.every(m => !m.slot)) assert.deepEqual(row.vals.map(num), ride(row.ops.map(m => m.t), num(row.vals[0])), `${at}: the numbers on the row are what its machines make (${row.vals})`);
  if (row.back) { assert.equal(row.back.length, row.ops.length, at); row.back.forEach(machine); }
}

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the town is a factory street at sunset', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.match(V.kit2ImportMap(), /oomba3d\/1\.2\.0\/oomba3d\.js/, 'the newest Oomba3D');
  const engines = fs.readdirSync(path.join(ROOT, 'public/vendor/kit2/oomba3d')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(engines.at(-1), '1.2.0', 'the newest shipped Oomba3D');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  // Toy Town at sunset: the world Crate Stacker plays by day, so the two never look alike
  assert.match(HTML, /start\(\{ theme: 'toy-town', version: '1\.1\.0', graphics: 'auto', time: 'sunset', outline: true, settings: true \}\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'seed-games/crate-stacker.html'), 'utf8'), /theme: 'toy-town', version: '1\.1\.0', graphics: 'auto', time: 'day'/, 'Crate Stacker is the same town by day');
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/toy-town')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.1.0', 'the newest shipped Toy Town');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/toy-town/1.1.0/theme.json'), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 18); for (const id of asked) assert.ok(have.has(id), `Toy Town 1.1.0 has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/(?:piece\(|\[)'([a-z-]+)', -?[\d.]+, -?[\d.]+, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 18, `the street is furnished from the theme (${used} pieces placed)`);
  for (const id of ['ground', 'road', 'building-a', 'building-h', 'streetlight', 'tree', 'box']) assert.ok(asked.includes(id), `the street has the ${id}`);
  // nothing to collect or to drive: no coin, and no car to steer or to be chased by
  for (const id of asked) assert.ok(!/^(coin|car-)/.test(id), `${id}: no reward currency and no traffic`);
  assert.match(HTML, /g\.hero\('mage'/); assert.ok(theme.heroes.some(h => h.id === 'mage'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the helper back to standing
  // and two at the start: the loading screen's fallback wait for a first frame, and its removal after the fade
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 5);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  assert.doesNotMatch(HTML, /<input|contenteditable|prompt\(/, 'nothing is typed');
  assert.doesNotMatch(HTML, /physics\(|rapier3d-compat'\)|creature\(|school\(/, 'no physics and no animal: nothing chases, bites or falls');
});

test('lines of machines: an expression is printed the way its line is built, and two lines are compared as polynomials, never as text', () => {
  const o = (c, k) => ML.op(c, k);
  const CASES = [[[o('m', 3), o('a', 5)], '3n + 5'], [[o('a', 5), o('m', 3)], '3(n + 5)'], [[o('a', 6), o('d', 2)], '(n + 6) ÷ 2'], [[o('d', 2), o('a', 6)], 'n ÷ 2 + 6'], [[o('q'), o('m', 2)], '2n²'], [[o('m', 2), o('q')], '(2n)²'],
    [[o('q'), o('s', 4)], 'n² − 4'], [[o('s', 4), o('q')], '(n − 4)²'], [[o('m', 2), o('m', 3)], '6n'], [[o('m', 5), o('s', 2)], '5n − 2'], [[o('s', 2), o('m', 5)], '5(n − 2)'], [[o('a', 2), o('a', 3)], 'n + 2 + 3'], [[o('m', 3), o('d', 2)], '3n ÷ 2'], [[], 'n']];
  for (const [ops, want] of CASES) {
    assert.equal(ML.expr(ops, 'n'), want);
    for (const x of XS) assert.ok(Math.abs(evalExpr(want, x) - out(ops.map(ML.opText), x)) < 1e-9, `${want} at ${x} is what the line gives`);
  }
  // equal lines written differently are the same; lines that agree at one or two inputs only are not
  assert.equal(ML.same([o('a', 2), o('m', 3)], [o('m', 3), o('a', 6)]), true, '3(x + 2) = 3x + 6');
  assert.equal(ML.same([o('m', 2), o('m', 3)], [o('m', 6)]), true); assert.equal(ML.same([o('a', 2), o('a', 3)], [o('a', 5)]), true);
  assert.equal(ML.same([o('a', 4), o('d', 2)], [o('d', 2), o('a', 2)]), true, '(x + 4) ÷ 2 = x ÷ 2 + 2, with no rounding');
  assert.equal(ML.same([o('a', 1), o('q')], [o('q'), o('a', 1)]), false, '(x + 1)² is not x² + 1, though both give 1 for 0');
  assert.equal(ML.same([o('m', 2)], [o('q')]), false, '2x and x² agree for 0 and 2 only');
  assert.equal(ML.same([o('a', 2), o('m', 3)], [o('m', 3), o('a', 2)]), false); assert.equal(ML.same([o('d', 3)], [o('d', 2)]), false);
  assert.equal(ML.same([o('m', 1), o('d', 3), o('m', 3)], []), true, 'x ÷ 3 × 3 = x exactly');
});

test('rounds: six a chapter, every answer right for the reason the unit teaches, every plan judged, the first lap always the same', () => {
  assert.deepEqual([...ML.CHAPTERS], CHAPTERS); assert.equal(ML.ROUNDS, 6);
  assert.equal(ML.round('build', 0, 0), null); assert.equal(ML.round('build', 7, 0), null); assert.equal(ML.round('shop', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(ML.round(ch, n, 0), ML.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it (what the words box prints, and the right answer)
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => ML.round(ch, n, 0));
  const ans = r => (r.input === 'tiles' ? right(r).t : r.input === 'build' ? r.answer.map(i => ML.opText(r.build.blocks[i])).join(', ') : r.input === 'ray' ? `x ${ML.sign(r.answer.dir, r.ray.closed)} ${r.answer.at}` : r.answer);
  assert.deepEqual(lap0('build').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['write', 'Build 5 more than 3 times n.', '× 3, + 5'],
    ['eval', 'The line is times 3, then plus 5. Send in 4. What comes out?', '17'],
    ['group', 'Build 3 times the sum of n and 4.', '+ 4, × 3'],
    ['read', 'The line is plus 6, then divided by 2. Which expression is it?', '(n + 6) ÷ 2'],
    ['power', 'The line squares the input, then multiplies by 2. Send in 3. What comes out?', '18'],
    ['story', 'A truck carries n crates of 6 toys each, and 2 loose toys. Build the number of toys.', '× 6, + 2']]);
  assert.deepEqual(lap0('same').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['always', 'Line A is plus 2, then times 3. Line B is times 3, then plus 6. Do they always match?', 'always'],
    ['expand', 'Line A is plus 2, then times 3. Build line B to match it. Line B multiplies first.', '+ 6'],
    ['combine', 'Build one short line for 2x + 3x + 4.', '× 5, + 4'],
    ['factor', 'Line A is times 4, then plus 12. Build line B to match it. Line B adds first.', '+ 3, × 4'],
    ['some', 'Line A is times 2. Line B squares the input. Do they always match?', 'sometimes'],
    ['minus', 'Build one short line for 8x minus the sum of 3x and 2.', '× 5, − 2']]);
  assert.deepEqual(lap0('undo').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['add', 'The line is plus 7. The output is 12. What went in?', 5], ['times', 'The line is times 4. The output is 28. What went in?', 7],
    ['order', 'The line is times 3, then plus 5. Which line undoes it?', '− 5 → ÷ 3'],
    ['two', 'The line is times 3, then plus 5. The output is 23. What went in?', 6], ['bracket', 'The line is plus 2, then times 5. The output is 35. What went in?', 5],
    ['ray', 'The line is times 2, then plus 4. The output must be less than 20. Which inputs work?', 'x < 8']]);
  // what the chip shows before and after, and what is said and printed when each is found
  assert.deepEqual(lap0('build').map(r => [printed(r.chip), printed(r.chipDone)]), [['build the line', '3n + 5'], ['3n + 5, n = 4', '3 × 4 + 5 = 17'], ['build the line', '3(n + 4)'], ['which expression?', '(n + 6) ÷ 2'], ['2n², n = 3', '2 × 3² = 18'], ['build the line', '6n + 2']]);
  assert.deepEqual(lap0('same').map(r => [printed(r.chip), printed(r.chipDone)]), [['3(x + 2) ? 3x + 6', '3(x + 2) = 3x + 6'], ['3(x + 2) = 3x + ?', '3(x + 2) = 3x + 6'], ['2x + 3x + 4 = ?', '2x + 3x + 4 = 5x + 4'], ['4x + 12 = 4(x + ?)', '4x + 12 = 4(x + 3)'],
    ['2x ? x²', '2x = x² for 0 and 2'], ['8x − (3x + 2) = ?', '8x − (3x + 2) = 5x − 2']]);
  assert.deepEqual(lap0('undo').map(r => [printed(r.chip), printed(r.chipDone)]), [['x + 7 = 12', 'x = 5'], ['4x = 28', 'x = 7'], ['which way back?', '− 5 → ÷ 3'], ['3x + 5 = 23', 'x = 6'], ['5(x + 2) = 35', 'x = 5'], ['2x + 4 < 20', 'x < 8']]);
  assert.deepEqual(lap0('build').map(r => box(r.said)), ['Yes! Multiply n by 3 first, then add 5.', 'Yes! 3 × 4 is 12, and 12 + 5 is 17.', 'Yes! Add 4 first, then multiply the whole sum by 3.', 'Yes! The brackets keep the sum together, so all of it is divided.',
    'Yes! 3 squared is 9, and 2 × 9 is 18.', 'Yes! 6 toys for each of the n crates, then 2 loose toys.']);
  assert.deepEqual(lap0('same').map(r => box(r.said)), ['Yes! 3 times the sum is 3 × x + 3 × 2. They always match.', 'Yes! 3 × x, plus 3 × 2, which is 6.', 'Yes! 2x + 3x is 5x, and the 4 stays.', 'Yes! 12 is 4 × 3, so 4 is a factor of both parts.',
    'Yes! They match for 0 and for 2 only. One matching input is not proof.', 'Yes! 8x − 3x is 5x, and the 2 is taken away too.']);
  assert.deepEqual(lap0('undo').map(r => box(r.said)), ['Yes! 12 − 7 = 5.', 'Yes! 28 ÷ 4 = 7.', 'Yes! Undo plus 5 first, then undo times 3.', 'Yes! 23 − 5 is 18, and 18 ÷ 3 is 6.', 'Yes! 35 ÷ 5 is 7, and 7 − 2 is 5.',
    'Yes! 20 − 4 is 16, and 16 ÷ 2 is 8. Every input less than 8 works.']);

  const seen = { kinds: new Set(), spots: new Set(), keys: new Set(), askKeys: new Map(), probes: new Set(), slips: new Set(), halves: 0, witness: new Set() };
  const lineOk = (l, at) => { if (typeof l === 'string') return assert.doesNotMatch(l, /undefined|NaN|\{|-\d|null/, `${at}: ${l}`); assert.ok(T[l[0]] !== undefined, `${at}: ${l[0]} is one of the game's lines`); assert.doesNotMatch(say(l[0], l[1]), /undefined|NaN|\{|-\d/, `${at}: ${l[0]} has all its numbers`); seen.keys.add(l[0]); };
  const drawOk = (d, at) => {
    for (const l of d.lines || []) lineOk(l, at);
    assert.ok((d.rows || []).length <= 2 && (d.lines || []).length <= 3 && (d.rows || []).length + (d.lines || []).length >= 1, `${at}: the picture fits the board`);
    for (const row of d.rows || []) rowOk(row, at);
    if (d.head) assert.doesNotMatch(d.head, /-\d|undefined/, at);
    if (d.ray) { assert.ok(d.ray.min === 0 && d.ray.max === 12 && typeof d.ray.closed === 'boolean', at); for (const m of d.ray.marks || []) assert.ok(m.at >= d.ray.min && m.at <= d.ray.max && ['ok', 'warn'].includes(m.tone), `${at}: the mark at ${m.at} is on the number line`); }
  };
  /** The checks every round passes; returns what the instruction means, as functions of the input. */
  const common = (r, at) => {
    assert.ok(r.ask.length >= 1 && r.ask.length <= 3 && r.said.length >= 1 && r.said.length <= 2, at);
    for (const l of [...r.ask, ...r.said, r.chip, r.chipDone]) lineOk(l, at);
    for (const l of [...r.ask, ...r.said]) assert.ok(Array.isArray(l) && !/^(show|btn)\./.test(l[0]), `${at}: what is said is a spoken line (${l[0]})`);
    assert.ok(box(r.ask).length <= 100, `${at}: the instruction fits the words box (${box(r.ask).length})`);
    assert.ok(printed(r.chip).length <= 20 && printed(r.chipDone).length <= 24, `${at}: the chip is short (${printed(r.chip)} / ${printed(r.chipDone)})`);
    assert.equal(r.v, r.chapter === 'build' ? 'n' : 'x', `${at}: the letter`);
    drawOk(r.pic.ask, at); drawOk(r.pic.found, at);
    for (const l of r.ask) seen.askKeys.set(l[0], (seen.askKeys.get(l[0]) || 0) + 1);
    seen.kinds.add(`${r.chapter}:${r.kind}`);
    return r.ask.filter(l => MEANS[l[0]]).map(meaning);
  };
  /** Three tiles, all different, one right; every other has a hint and a picture, and the right one is judged right. */
  const tilesOk = (r, at) => {
    assert.equal(r.opts.length, 3, at); assert.deepEqual(r.choices, [0, 1, 2], at); assert.equal(new Set(r.opts.map(o => o.t)).size, 3, `${at}: the tiles differ (${r.opts.map(o => o.t)})`);
    for (const o of r.opts) { assert.doesNotMatch(o.t, /-\d|undefined|NaN/, `${at}: a tile prints the true minus sign (${o.t})`); assert.ok(o.t.length <= 12, `${at}: a tile is short (${o.t})`); }
    assert.deepEqual(ML.judge(r, r.answer), { ok: true }, at);
    for (const i of r.choices.filter(v => v !== r.answer)) { const j = ML.judge(r, i); assert.equal(j.ok, false, at); assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, `${at}: a wrong tile has a hint and a picture`); for (const l of j.lines) lineOk(l, at); drawOk(j.draw, `${at} tile ${i}`); }
    assert.equal(ML.judge(r, 3), null, at); seen.spots.add(r.answer);
  };
  /** A round answered by building: every plan is judged right exactly when its line does what the words ask, for
   *  every input; a wrong plan is run, and the picture and the hint give the outputs that plan and the right line
   *  really give for the same input. */
  const buildOk = (r, at, want, o = {}) => {
    const B = r.build, texts = p => [...B.fixed, ...p.map(i => B.blocks[i])].map(ML.opText);
    assert.ok(B.blocks.length === 4 && new Set(B.blocks.map(ML.opText)).size === 4, `${at}: four different blocks (${B.blocks.map(ML.opText)})`);
    assert.ok(B.slots >= 1 && B.slots <= 2 && B.fixed.length + B.slots <= 2 && r.answer.length === B.slots, at);
    let rights = 0;
    for (const p of plans(r)) {
      const j = ML.judge(r, p), where = `${at} plan [${texts(p)}]`;
      if (p.length < B.slots) { assert.deepEqual(j, { ok: false, lines: [L('m.hint.fill')], draw: null }, `${where}: an unfinished line is not run`); lineOk(j.lines[0], where); continue; }
      const f = x => out(texts(p), x), equal = sameFn(f, want), fine = equal && (!o.first || texts(p)[0][0] === o.first);
      assert.equal(j.ok, fine, `${where}: ${fine ? 'does' : 'does not do'} what the words ask`);
      if (fine) { rights++; continue; }
      assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, `${where}: a hint and a picture`); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
      if (equal) { assert.deepEqual(j.lines, [L('s.hint.copy')], `${where}: the same outputs, but it is line A again`); continue; }
      // the plan is run: the last hint line names an input, what the plan gives for it and what it should give
      const [key, v] = j.lines.at(-1); assert.equal(key, 'm.hint.run', where);
      assert.ok(Number.isInteger(v.n) && v.n >= 1 && v.n <= 12, where); assert.equal(v.a, f(v.n), `${where}: ${v.n} in gives ${f(v.n)}`); assert.equal(v.b, want(v.n), `${where}: and should give ${want(v.n)}`); assert.notEqual(v.a, v.b, where);
      assert.ok(Number.isInteger(v.a) && v.a >= 0 && Number.isInteger(v.b) && v.b >= 0, `${where}: whole numbers, none below zero, for the voice`);
      const mine = j.draw.rows.at(-1); assert.deepEqual(mine.ops.map(m => m.t), texts(p), `${where}: the picture is the line that was built`); assert.equal(num(mine.vals[0]), v.n, where); assert.equal(num(mine.vals.at(-1)), v.a, where);
      for (const m of mine.ops) assert.equal(m.tone, 'warn', where);
      seen.probes.add(v.n);
    }
    assert.equal(rights, o.rights || 1, `${at}: ${o.rights || 1} right plan`);
    assert.deepEqual(ML.judge(r, r.answer), { ok: true }, at); assert.equal(ML.judge(r, [0, 0]), null, at); assert.equal(ML.judge(r, [9]), null, at); assert.equal(ML.judge(r, 'x'), null, at); assert.equal(ML.judge(r, [0, 1, 2]), null, at);
    // what the board shows as found is the right line with a number riding it
    const done = r.pic.found.rows.at(-1); assert.ok(sameFn(x => out(done.ops.map(m => m.t), x), want), `${at}: the line shown as found`);
  };
  /** A round answered with a stepper: only the right value gives the output, and every other value is run. */
  const stepOk = (r, at, f) => {
    const s = r.step, n = Math.round((s.max - s.min) / s.by);
    assert.ok(s.min === 0 && s.start === 0 && s.start !== r.answer && r.answer > 0 && r.answer <= s.max && [1, 0.5].includes(s.by), `${at}: ${JSON.stringify(s)} holds ${r.answer}`);
    assert.equal(f(r.answer), r.out, `${at}: ${r.answer} in gives ${r.out}`); assert.ok(Number.isInteger(r.out) && r.out > 0, at);
    assert.deepEqual(ML.judge(r, r.answer), { ok: true }, at); assert.equal(ML.judge(r, s.max + s.by), null, at); assert.equal(ML.judge(r, -1), null, at); assert.equal(ML.judge(r, 'x'), null, at); if (s.by === 1) assert.equal(ML.judge(r, 1.5), null, at);
    for (let i = 0; i <= n; i++) {
      const v = s.min + i * s.by; if (v === r.answer) continue;
      const j = ML.judge(r, v), where = `${at} tried ${v}`, got = f(v);
      assert.notEqual(got, r.out, `${where}: only one input gives the output`);
      assert.equal(j.ok, false, where); assert.ok(j.lines.length === 1 && j.draw, where); lineOk(j.lines[0], where); drawOk(j.draw, where);
      assert.deepEqual(j.draw.rows[0].vals.map(num), ride(r.line.map(ML.opText), v), `${where}: the plan is run and every value is shown`); assert.equal(j.draw.rows[0].vals.map(num).at(-1), got, where);
      const [key, vars] = j.lines[0];
      if (/^u\.hint\.(high|low)/.test(key)) { assert.equal(key, got > r.out ? 'u.hint.high' : got < 0 ? 'u.hint.low.neg' : 'u.hint.low.pos', where); assert.deepEqual(vars, { n: v, a: Math.abs(got), b: r.out }, where); }
      else seen.slips.add(key);
    }
    if (s.by === 0.5) seen.halves++;
  };

  for (let lap = 0; lap < 300; lap++) {
    for (let n = 1; n <= 6; n++) {
      // ---- build: an expression as a line of machines
      const g = ML.round('build', n, lap), ga = `build ${n} lap ${lap}`, [gf] = common(g, ga), gv = g.ask[0][1];
      assert.equal(g.kind, ['write', 'eval', 'group', 'read', 'power', 'story'][n - 1], ga);
      if (g.input === 'build') {
        buildOk(g, ga, gf);
        assert.equal(printed(g.chipDone), ML.expr(g.answer.map(i => g.build.blocks[i]), 'n'), ga); assert.ok(sameFn(x => evalExpr(printed(g.chipDone), x), gf), `${ga}: ${printed(g.chipDone)} is what the words ask`);
        // the same blocks the other way round are offered, and are named as that
        const swap = ML.judge(g, [...g.answer].reverse()); assert.deepEqual(swap.lines[0], L(g.kind === 'group' ? 'm.hint.first.add' : 'm.hint.first.mul'), ga);
      } else if (g.kind === 'eval' || g.kind === 'power') {
        tilesOk(g, ga); const t = gv.n, a = gv.a;
        assert.equal(+right(g).t, gf(t), `${ga}: ${t} in gives ${gf(t)}`); assert.ok(vals(g).every(Number.isInteger) && new Set(vals(g)).size === 3, ga);
        if (g.kind === 'eval') assert.deepEqual([...vals(g)].sort((x, y) => x - y), [gf(t), a * (t + gv.b), t + a + gv.b].sort((x, y) => x - y), `${ga}: adding first and adding instead of multiplying are offered`);
        else { assert.equal(g.ask[0][0], lap % 2 ? 'g.ask.mulsq' : 'g.ask.sqmul', ga); assert.deepEqual([...vals(g)].sort((x, y) => x - y), [a * t * t, a * t * a * t, 2 * a * t].sort((x, y) => x - y), `${ga}: the other way round and doubling for squaring are offered`); }
        assert.deepEqual(g.pic.found.rows[0].vals.map(num), ride(g.line.map(ML.opText), t), ga);
        const eq = /^(.*) = (\d+)$/.exec(printed(g.chipDone)); assert.ok(eq && evalExpr(eq[1], 0) === +eq[2] && +eq[2] === gf(t), `${ga}: ${printed(g.chipDone)} is true`);
        for (const i of g.choices.filter(v => v !== g.answer)) { const d = ML.judge(g, i).draw, m = /^(.*) = (\d+)$/.exec(d.lines[0]); assert.ok(m && evalExpr(m[1], 0) === +m[2] && +m[2] === g.opts[i].v, `${ga}: the picture of a wrong tile works out to that tile (${d.lines[0]})`); assert.equal(num(d.rows[0].vals.at(-1)), g.opts[i].v, ga); }
      } else {
        tilesOk(g, ga);
        assert.ok(sameFn(x => evalExpr(right(g).t, x), gf), `${ga}: ${right(g).t} is the line`);
        for (const o of g.opts.filter(o => o !== right(g))) assert.ok(!sameFn(x => evalExpr(o.t, x), gf), `${ga}: ${o.t} is a different expression`);
        assert.ok(g.opts.some(o => o.t === `n + ${gv.b} ÷ ${gv.a}`), `${ga}: the line with no brackets is offered`);
      }

      // ---- same: expressions that are equal
      const s = ML.round('same', n, lap), sa = `same ${n} lap ${lap}`, sf = common(s, sa);
      if (n === 1 || n === 5) {
        tilesOk(s, sa); const [A, Bf] = sf; assert.equal(sf.length, 2, sa);
        // always, sometimes or never, counted over many inputs (two different lines of degree two or less agree at two inputs at most)
        const grid = []; for (let x = -40; x <= 40; x += 0.5) grid.push(x);
        const hits = grid.filter(x => A(x) === Bf(x)).length, truth = hits === grid.length ? 'always' : hits === 0 ? 'never' : 'sometimes';
        assert.equal(right(s).t, truth, `${sa}: the two lines match ${truth}`); assert.deepEqual(s.opts.map(o => o.t), ['always', 'sometimes', 'never'], sa);
        assert.equal(s.kind, { always: 'always', never: 'never', sometimes: 'some' }[truth], sa); if (truth === 'sometimes') assert.ok(hits === 2, `${sa}: two matching inputs`);
        assert.deepEqual(s.lineA.map(ML.opText).map(machine).reduce((v, f) => f(v), 3), A(3), sa); assert.equal(out(s.lineB.map(ML.opText), 3), Bf(3), sa);
        // a table on the board is true, line by line
        for (const d of [s.pic.found, ...s.choices.filter(v => v !== s.answer).map(i => ML.judge(s, i).draw)]) for (const l of d.lines.filter(l => typeof l === 'string' && /^x = /.test(l))) { const m = /^x = (\d+): (\d+) and (\d+)$/.exec(l); assert.ok(m && A(+m[1]) === +m[2] && Bf(+m[1]) === +m[3], `${sa}: ${l}`); }
        for (const i of s.choices.filter(v => v !== s.answer)) for (const [k, v] of ML.judge(s, i).lines) {
          if (k === 's.hint.differ') assert.ok(A(v.n) === v.a && Bf(v.n) === v.b && v.a !== v.b, `${sa}: ${say(k, v)}`);
          if (k === 's.hint.match') assert.ok(A(v.n) === v.a && Bf(v.n) === v.a && v.n !== 0, `${sa}: ${say(k, v)}`);
          if (k === 's.hint.gap') assert.ok(grid.every(x => Math.abs(A(x) - Bf(x)) === v.n) && v.n > 0, `${sa}: ${say(k, v)}`);
        }
        if (truth === 'never') assert.ok(grid.every(x => A(x) - Bf(x) === s.said[0][1].n), `${sa}: line A is always ${s.said[0][1].n} more`);
        if (truth === 'sometimes') assert.ok(A(s.said[0][1].a) === Bf(s.said[0][1].a) && A(0) === Bf(0), sa);
      } else {
        const want = sf[0]; assert.equal(sf.length, 1, sa);
        assert.equal(s.kind, { 2: 'expand', 3: 'combine', 4: 'factor', 6: 'minus' }[n], sa);
        buildOk(s, sa, want, n === 4 ? { first: '+' } : {});
        if (n === 2) { assert.equal(s.build.fixed.length, 1, sa); assert.equal(ML.opText(s.build.fixed[0])[0], '×', `${sa}: line B multiplies first`); const v = s.ask[0][1]; assert.ok(s.build.blocks.some(b => ML.opText(b) === `+ ${v.b}`), `${sa}: the number not multiplied is offered`); }
        if (n === 4) { const v = s.ask[0][1], copy = [s.build.blocks.findIndex(b => ML.opText(b) === `× ${v.a}`), s.build.blocks.findIndex(b => ML.opText(b) === `+ ${v.c}`)]; assert.deepEqual(ML.judge(s, copy).lines, [L('s.hint.copy')], `${sa}: line A itself is not a rebuild`); assert.equal(s.build.first, 'a', sa); }
        if (s.head) { assert.ok(sameFn(x => evalExpr(s.head, x), want), `${sa}: the heading ${s.head} is what the words ask`); assert.equal(s.pic.ask.head, s.head, sa); }
        const eq = printed(s.chipDone).split(' = '); assert.equal(eq.length, 2, sa); assert.ok(sameFn(x => evalExpr(eq[0], x), x => evalExpr(eq[1], x)) && sameFn(x => evalExpr(eq[1], x), want), `${sa}: ${printed(s.chipDone)} is true for every input`);
        if (s.lineA) assert.ok(sameFn(x => out(s.lineA.map(ML.opText), x), want), sa);
      }

      // ---- undo: equations and inequalities
      const u = ML.round('undo', n, lap), ua = `undo ${n} lap ${lap}`, [uf] = common(u, ua);
      assert.equal(u.kind, ['add', 'times', 'order', 'two', 'bracket', 'ray'][n - 1], ua);
      assert.ok(sameFn(x => out(u.line.map(ML.opText), x), uf), `${ua}: the line is the line of the words`);
      if (u.input === 'step') {
        stepOk(u, ua, uf); const c = u.ask[1][1].c; assert.equal(c, u.out, ua); assert.equal(u.ask[1][0], 'u.ask.in', ua);
        const eq = /^(.*) = (\d+)$/.exec(printed(u.chip)); assert.ok(eq && +eq[2] === c && sameFn(x => evalExpr(eq[1], x), uf), `${ua}: the chip ${printed(u.chip)} is the equation`);
        assert.equal(printed(u.chipDone), `x = ${u.answer}`, ua);
        assert.deepEqual(u.pic.found.rows[0].vals.map(num), ride(u.line.map(ML.opText), u.answer), ua);
        // the way back under the found line undoes each machine
        u.pic.found.rows[0].back.forEach((t, i) => { const f = machine(ML.opText(u.line[i])), b = machine(t); assert.ok(XS.every(x => Math.abs(b(f(x)) - x) < 1e-9), `${ua}: ${t} undoes ${ML.opText(u.line[i])}`); });
        if (n === 1) { const again = u.line[0].c === 'a' ? c + u.line[0].k : c - u.line[0].k; if (again >= 0 && again <= u.step.max) assert.deepEqual(ML.judge(u, again).lines, [L(u.line[0].c === 'a' ? 'u.hint.again.plus' : 'u.hint.again.minus', { b: u.line[0].k })], `${ua}: doing the machine again is named`); assert.equal(u.line[0].c, lap % 2 ? 's' : 'a', ua); }
        if (n === 2 && c - u.line[0].k <= u.step.max) assert.deepEqual(ML.judge(u, c - u.line[0].k).lines, [L('u.hint.sub', { a: u.line[0].k })], `${ua}: subtracting to undo a multiplication is named`);
        if (n >= 4) { const mid = ride(u.line.map(ML.opText), u.answer)[1], between = n === 5 ? c / u.line[1].k : mid; if (between !== u.answer && between <= u.step.max) assert.match(ML.judge(u, between).lines[0][0], /^u\.hint\.half\./, `${ua}: undoing one machine only is named`); }
        if (n === 4) assert.equal(u.line[1].c, lap % 2 ? 's' : 'a', ua);
      } else if (u.kind === 'order') {
        tilesOk(u, ua);
        const way = t => t.split(' → '), undoes = t => XS.every(x => Math.abs(out(way(t), uf(x)) - x) < 1e-9);
        assert.ok(undoes(right(u).t), `${ua}: ${right(u).t} undoes the line`); for (const o of u.opts.filter(o => o !== right(u))) assert.ok(!undoes(o.t), `${ua}: ${o.t} does not`);
        assert.ok(u.opts.some(o => o.t === u.line.map(ML.opText).join(' → ')), `${ua}: the line itself is offered`);
        assert.ok(u.opts.some(o => o.t === [...way(right(u).t)].reverse().join(' → ')), `${ua}: the right machines in the wrong order are offered`);
      } else {
        // which inputs work: every whole and half number is tried against the words
        const lt = u.ask[1][0] === 'u.ask.lt', c = u.ask[1][1].c, works = x => (lt ? uf(x) < c : uf(x) >= c), inRay = (x, p) => (p.dir === 'left' ? (u.ray.closed ? x <= p.at : x < p.at) : (u.ray.closed ? x >= p.at : x > p.at));
        assert.equal(u.ask[1][0], lap % 2 ? 'u.ask.ge' : 'u.ask.lt', ua); assert.equal(u.ray.closed, !lt, `${ua}: the end is in only for "at least"`); assert.equal(u.limit, c, ua);
        const grid = []; for (let x = -6; x <= 20; x += 0.5) grid.push(x);
        assert.ok(grid.every(x => works(x) === inRay(x, u.answer)), `${ua}: the ray ${JSON.stringify(u.answer)} is exactly the inputs that work`);
        assert.deepEqual(u.answer, { at: u.ray.at, dir: u.ray.dir }, ua); assert.ok(u.step.start.at !== u.answer.at && u.step.start.dir !== u.answer.dir, `${ua}: both the end and the side have to be set`);
        assert.equal(printed(u.chip), `${ML.expr(u.line, 'x')} ${lt ? '<' : '≥'} ${c}`, ua); assert.equal(printed(u.chipDone), `x ${lt ? '<' : '≥'} ${u.answer.at}`, ua);
        assert.deepEqual(ML.judge(u, { ...u.answer }), { ok: true }, ua); assert.equal(ML.judge(u, { at: 13, dir: 'left' }), null, ua); assert.equal(ML.judge(u, { at: 3, dir: 'up' }), null, ua); assert.equal(ML.judge(u, 3), null, ua); assert.equal(ML.judge(u, { at: 2.5, dir: 'left' }), null, ua);
        for (let at = 0; at <= 12; at++) for (const dir of ['left', 'right']) {
          if (at === u.answer.at && dir === u.answer.dir) continue;
          const p = { at, dir }, j = ML.judge(u, p), where = `${ua} tried ${JSON.stringify(p)}`;
          assert.equal(j.ok, false, where); assert.equal(j.lines.length, 2, where); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
          // the witness: a whole number the plan gets wrong, with the output it really gives
          const [[k1, v1], [k2, v2]] = j.lines, w = v1.n;
          assert.ok(Number.isInteger(w) && w >= 0 && inRay(w, p) !== works(w), `${where}: ${w} is where the plan is wrong`); assert.equal(v1.a, uf(w), `${where}: ${w} gives ${uf(w)}`);
          assert.equal(k1, inRay(w, p) ? 'u.hint.in' : 'u.hint.out', where); assert.equal(k2, `u.hint.${works(w) ? 'is' : 'not'}.${lt ? 'lt' : 'ge'}`, where); assert.deepEqual(v2, { a: uf(w), b: c }, where);
          assert.deepEqual([j.draw.ray.at, j.draw.ray.dir, j.draw.ray.tone], [at, dir, 'warn'], `${where}: the ray that was planned is drawn`); assert.deepEqual(j.draw.ray.marks.map(m => [m.at, num(m.t)]), [[w, uf(w)]], where);
          assert.deepEqual(j.draw.rows[0].vals.map(num), ride(u.line.map(ML.opText), w), where); assert.deepEqual(j.draw.lines, [`x ${ML.sign(dir, u.ray.closed)} ${at} ?`], where);
          seen.witness.add(k1 + (w === u.answer.at ? ':end' : ''));
        }
      }
    }
  }
  // over the laps: every kind of round, the right tile in every place, every line of the game used, both halves and whole numbers, every named slip
  assert.deepEqual([...seen.kinds].sort(), ['build:eval', 'build:group', 'build:power', 'build:read', 'build:story', 'build:write', 'same:always', 'same:combine', 'same:expand', 'same:factor', 'same:minus', 'same:never', 'same:some',
    'undo:add', 'undo:bracket', 'undo:order', 'undo:ray', 'undo:times', 'undo:two']);
  assert.deepEqual([...seen.spots].sort(), [0, 1, 2]);
  assert.deepEqual([...seen.slips].sort(), ['u.hint.again.minus', 'u.hint.again.plus', 'u.hint.half.minus', 'u.hint.half.plus', 'u.hint.half.times', 'u.hint.sub']);
  assert.ok(seen.halves >= 50, `halves are solved for on some replays (${seen.halves})`);
  assert.deepEqual([...seen.witness].sort(), ['u.hint.in', 'u.hint.in:end', 'u.hint.out', 'u.hint.out:end'], 'a wrong ray is answered from inside and from outside the plan, and at the end itself');
  for (const k of Object.keys(T).filter(k => /^[gmsu]\./.test(k))) assert.ok(seen.keys.has(k), `${k} is used in some round`);
  for (const k of Object.keys(MEANS)) assert.ok(seen.askKeys.has(k), `${k} is asked in some round`);
  assert.deepEqual(ML.params({ chapter: 'undo', lock: 1 }), { chapter: 'undo', lock: true });
  assert.deepEqual(ML.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(ML.params(undefined), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the words box prints the signs; nothing is bought or sold', () => {
  assert.ok(lines.TTS_GAMES.has('machine-line'));
  const ok = text => lines.allowedLine('machine-line', 'en', text);
  const NUMS = { n: 3, m: 5, a: 4, b: 2, c: 7, t: '9' };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 95);
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket
    assert.doesNotMatch(T[k], /[−+×÷=<>≤≥≠|°()/\\^²→]|-\d/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 22, `${k} is short enough to hear: ${T[k]}`);
  }
  // a decimal goes where a number goes; a word never does, and neither does a sign or a letter
  assert.ok(ok('2.5 in gives 8. That is more than 7.')); assert.ok(ok('Yes! 8 minus 3 is 5, and 5 divided by 2 is 2.5.'));
  assert.equal(ok('Build five more than 3 times n.'), null); assert.equal(ok('Build -5 more than 3 times n.'), null); assert.equal(ok('Build 5 more than 3 times y.'), null, 'only the letter the line was written with');
  assert.equal(ok('3 in gives x. That is more than 7.'), null); assert.equal(ok('The line is times 3, then plus 5. Tell me a secret.'), null, 'only the game’s own lines');
  // what the chip and the board show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('Build the Line'), null); assert.equal(ok('3x + 5 = 23'), null); assert.equal(ok('x < 8'), null);
  // The words box prints a spoken line with the signs between numbers (and between a number and x), and leaves words about n as words.
  const PRINT = [['Yes! 3 times 4 is 12, and 12 plus 5 is 17.', 'Yes! 3 × 4 is 12, and 12 + 5 is 17.'], ['Yes! 23 minus 5 is 18, and 18 divided by 3 is 6.', 'Yes! 23 − 5 is 18, and 18 ÷ 3 is 6.'], ['Yes! 12 minus 7 equals 5.', 'Yes! 12 − 7 = 5.'],
    ['Yes! 28 divided by 4 equals 7.', 'Yes! 28 ÷ 4 = 7.'], ['Yes! 2 x plus 3 x is 5 x, and the 4 stays.', 'Yes! 2x + 3x is 5x, and the 4 stays.'], ['Build one short line for 8 x minus the sum of 3 x and 2.', 'Build one short line for 8x minus the sum of 3x and 2.'],
    ['The 3 multiplies both parts: 3 times x and 3 times 2.', 'The 3 multiplies both parts: 3 × x and 3 × 2.'], ['7 in gives negative 2. That is less than 9.', '7 in gives −2. That is less than 9.'], ['Build 5 more than 3 times n.', 'Build 5 more than 3 times n.'],
    ['The line is times 3, then plus 5. The output is 23. What went in?', 'The line is times 3, then plus 5. The output is 23. What went in?'], ['Squaring 3 means 3 times 3. It does not mean 3 times 2.', 'Squaring 3 means 3 × 3. It does not mean 3 × 2.'],
    ['Yes! 3 squared is 9, and 2 times 9 is 18.', 'Yes! 3 squared is 9, and 2 × 9 is 18.'], ['8 is in your set. It gives 20.', '8 is in your set. It gives 20.']];
  for (const [said, shown] of PRINT) assert.equal(ML.shown(said), shown);
  // and the deck's own read-aloud would say the printed sums the way the game says them (seed-lessons/number-quest/math-text.js)
  for (const [said, shown] of PRINT.filter(x => /^Yes! \d+ (minus|divided by) \d+ equals/.test(x[0]))) assert.equal(sayMath(shown).toLowerCase(), said.toLowerCase(), `the deck would say "${shown}" as the game does`);
  for (const k of spoken) { const s = ML.shown(say(k, NUMS)); assert.doesNotMatch(s, /[Nn]egative \d|-\d|\d (plus|minus|times|divided by|equals) [\d(−]|\d x\b/, `${k} prints with its signs: ${s}`); }
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  assert.deepEqual([T['ch.build'], T['ch.same'], T['ch.undo'], T.title], ['Build the Line', 'Same Output', 'Run It Back', 'Machine Line']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule)
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, in the game or in its listing; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|tax|discount|interest|commission|coins?|dollars?|cents?)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a factory line, not a shop: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes, SHOP);
  // this game has no balance (Balance Bridge, for grades 1 and 2, owns the see-saw)
  for (const text of [...Object.values(T), META.description, META.tags]) assert.doesNotMatch(text, /\b(balance[ds]?|see-?saw|scales?|weigh[st]?)\b/i, text);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
  // the public listing never names the tier it was built for
  for (const text of [META.title, META.description, META.tags]) assert.doesNotMatch(text, /\bpro\b|towers|number quest/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('machine-line'));
  assert.equal(META.slug, 'machine-line'); assert.equal(META.title, 'Machine Line'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['machine-line'], { subject: 'math', from: 6, to: 7 }, 'on the Learn shelf as math for grades 6 and 7');
  for (const f of ['public/covers/machine-line.jpg', 'public/og/machine-line.jpg', 'scripts/covers/machine-line.recipe.js', 'public/img/nq/machine-line/build-the-line.webp', 'public/img/nq/machine-line/same-output.webp', 'public/img/nq/machine-line/run-it-back.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'machine-line'), { slug: 'machine-line', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('machine-line'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.MACHINE_CHAPTERS, { build: ['6.EE.A.2', '6.EE.B.6', '6.EE.A.1'], same: ['6.EE.A.3', '6.EE.A.4', '7.EE.A.1', '7.EE.A.2'], undo: ['6.EE.B.7', '7.EE.B.4a', '6.EE.B.5', '6.EE.B.8', '7.EE.B.4b'] });
  assert.deepEqual(TAGS.gameCodes('machine-line', 'ccss-math'), Object.values(TAGS.MACHINE_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('machine-line'));
  assert.equal(UNIT.title, 'The Machine Hall'); assert.equal(UNIT.stamp, 'Variable Gear'); assert.equal(UNIT.tool, 'machine-line'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 3); assert.ok(UNITS.tiers.pro.stones.includes('Variable Gear')); assert.equal(UNITS.tiers.pro.status, 'open', 'the grades 6-8 street is open to everyone (2026-11-15)');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['3.1', 8, 'Write and work out expressions'], ['3.2', 9, 'Expressions that are equal'], ['3.3', 10, 'Solve equations and inequalities']]);
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.MACHINE_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(g.slug, 'machine-line'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(ML.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '7', '']) assert.deepEqual(TAGS.stepGameCodes('machine-line', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('machine-line', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('machine-line', 'ccss-math', '6', ''), ['6.EE.A.2', '6.EE.B.6', '6.EE.A.1', '6.EE.A.3', '6.EE.A.4', '6.EE.B.7', '6.EE.B.5', '6.EE.B.8'], 'an unlocked grade 6 step claims the game’s grade 6 codes');
  assert.deepEqual(TAGS.stepGameCodes('machine-line', 'ccss-math', '7', ''), ['7.EE.A.1', '7.EE.A.2', '7.EE.B.4a', '7.EE.B.4b'], 'and a grade 7 step its grade 7 codes');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.ML_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
// lap: the lap the first play takes (0, the fixed lap, whose numbers the checks below know), or null for the
// random lap a play really takes.
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, lap = 0 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Machine Line' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 180_000 });
  if (lap != null) await frame.evaluate(n => window.__brbTest.lap(n), lap);
  const state = () => frame.evaluate(() => window.__ml.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 60_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
/** A wrong plan for a round: the slip the unit names where there is one. */
const wrongOf = s => (s.input === 'tiles' ? s.choices.find(v => v !== s.answer) : s.input === 'build' ? (s.build.slots === 2 ? [...s.answer].reverse() : [s.build.blocks.findIndex((b, i) => i !== s.answer[0])]) : s.input === 'ray' ? { at: s.answer.at, dir: s.answer.dir === 'left' ? 'right' : 'left' } : s.answer + s.step.by);
/** What the controls show for a plan. */
const planText = (s, v) => (s.input === 'ray' ? `x ${ML.sign(v.dir, s.ray.closed)} ${v.at}` : `x = ${v}`);
const CONTROLS = { tiles: ['ml-n0', 'ml-n1', 'ml-n2'], build: ['ml-b0', 'ml-b1', 'ml-b2', 'ml-b3', 'ml-go'], step: ['ml-dn', 'ml-val', 'ml-up', 'ml-go'], ray: ['ml-dn', 'ml-flip', 'ml-up', 'ml-go'] };
/** Try a plan with the real controls: the handle sets the plan, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#ml-n' + v);
  await g.frame.evaluate(x => window.__ml.act('set', x), v); return go('#ml-go');
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it does and does not advance, six right rounds post game over once`, { skip, timeout: 600_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1`, lap: null });   // the lap a real play takes
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'mage']);
    assert.deepEqual(await ids(frame, '#card .ml-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T['start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__ml.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, 6], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-build, #ch-same, #menu').length), 0);
    await until(() => window.__ml.state().moving === 0, null, 120_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__ml.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      if (round === 1) { assert.ok(Number.isInteger(s.lap) && s.lap >= 1, 'a play takes a random lap, not the fixed lap 0'); g.lap1 = s.lap; } else assert.equal(s.lap, g.lap1, 'one lap for the whole play');
      const want = ML.round(chapter, round, s.lap);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      // Build the Line's first round starts with the order-of-operations rule, then the instruction
      const rule = chapter === 'build' && round === 1 ? [['o.rule', {}]] : [];
      assert.equal(await text(frame, '#askt'), box([...rule, ...s.ask]), `round ${round}: the instruction`);
      for (const [k, v] of rule) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: the rule was sent to be spoken`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, crates: round - 1 }, `round ${round}: the board, and ${round - 1} crates on the dock`);
      // the controls: machine blocks and Run, a stepper and Run, a ray with its flip button, or three tiles
      assert.deepEqual(await ids(frame, '#bar > *'), CONTROLS[s.input], `round ${round}: the controls`);
      if (s.input === 'build') {
        assert.deepEqual(s.value, []); assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .blk')].map(b => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])), s.build.blocks.map(b => [ML.opText(b), 'false']), `round ${round}: four blocks, none in the line yet`);
      } else if (s.input === 'step') {
        assert.equal(s.value, s.step.start); assert.equal(await text(frame, '#ml-val'), planText(s, s.step.start), `round ${round}: the stepper starts at ${s.step.start}`);
      } else if (s.input === 'ray') {
        assert.deepEqual(s.value, s.step.start); assert.equal(await text(frame, '#ml-flip .big'), planText(s, s.step.start));
      } else assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .ml-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
      if (s.input !== 'tiles') assert.equal(await text(frame, '#ml-go .l'), 'Run');
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the board showing what the plan does, the same round, nothing reported
      const wrong = wrongOf(s), verdict = ML.judge(s, wrong);
      assert.equal(verdict.ok, false);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the board shows what it does`);
      assert.deepEqual(after.tried, verdict.draw || null, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.ml-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.crates, round - 1, `round ${round}: no crate for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input !== 'tiles') {
        // a new plan takes the board back to the question
        await frame.click(s.input === 'build' ? '#ml-b' + wrong[0] : s.input === 'ray' ? '#ml-flip' : '#ml-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried], ['ask', null], `round ${round}: changing the plan makes a new plan`);
        assert.deepEqual(again.value, s.input === 'build' ? wrong.slice(1) : s.input === 'ray' ? { ...s.answer } : wrong - s.step.by, `round ${round}`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__ml.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .ml-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .ml-askt'), 'Six crates are on the dock. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('machine-line', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=<>≥²]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__ml.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.ok(s.lap >= 1 && s.lap !== g.lap1, 'Play again takes another lap'); assert.deepEqual(Object.fromEntries(Object.keys(ML.round(chapter, 1, s.lap)).map(k => [k, s[k]])), ML.round(chapter, 1, s.lap), 'the next lap’s first round');
    assert.equal(s.onStage.crates, 0, 'the dock is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed the real block buttons build a line, a wrong plan shows what it does, a right one sends a crate to the dock and only then the next round', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .ml-menu .ml-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-build', 'Build the Line'], ['ch-same', 'Same Output'], ['ch-undo', 'Run It Back']]);
  await g.shot('menu');
  // Build the Line, round 1 (5 more than 3 times n), with nothing hurried and the real buttons
  await frame.click('#ch-build');
  await until(() => window.__ml.state().screen === 'play' && window.__ml.state().moving === 0, null, 120_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.onStage.crates], ['build', false, 'write', 'ask', [], 0]);
  const [mul, add] = s.answer;
  // nothing in the line yet: Run asks for the slots to be filled, and no number is shown
  await frame.click('#ml-go');
  assert.deepEqual([(await state()).mode, (await state()).tried, await text(frame, '#hint')], ['hint', null, 'Fill every slot in the line, then run it.']);
  // plus 5 first, then times 3: the line is run as built
  await frame.click('#ml-b' + add); await frame.click('#ml-b' + mul);
  assert.deepEqual((await state()).value, [add, mul]); assert.equal((await state()).mode, 'ask');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .blk[aria-pressed="true"]')].map(b => b.getAttribute('aria-label')).sort()), ['+ 5', '× 3']);
  await frame.click('#ml-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', 'Right machines, wrong way round. Without brackets, multiplying comes before adding or subtracting, so the times machine goes first. 1 in: your line gives 18. It should give 8.']);
  assert.deepEqual((await state()).tried.rows[0].vals, ['1', '6', '18'], 'the board runs 1 through plus 5, then times 3');
  await until(() => window.__ml.state().moving === 0, null, 120_000);   // the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('build-tried');
  // a third block with the line full takes the last slot; a block that is in the line comes out when it is pressed again
  const spare = [0, 1, 2, 3].find(i => i !== mul && i !== add);
  await frame.click('#ml-b' + spare); assert.deepEqual((await state()).value, [add, spare]);
  await frame.click('#ml-b' + add); assert.deepEqual((await state()).value, [spare]);
  await frame.click('#ml-b' + spare); assert.deepEqual((await state()).value, []);
  // the right plan: the chip shows the expression, the board shows it found, a crate rides to the dock, then round 2
  await frame.click('#ml-b' + mul); await frame.click('#ml-b' + add); await frame.click('#ml-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), '3n + 5'); assert.equal(await text(frame, '#askt'), 'Yes! Multiply n by 3 first, then add 5.');
  await frame.click('#ml-b' + spare); await frame.click('#ml-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', [mul, add]]);
  assert.equal(s.onStage.crates, 1, 'the crate is on its way');
  await g.shot('build-found');
  await until(() => window.__ml.state().round === 2, null, 180_000);
  assert.deepEqual([(await state()).onStage.crates, (await state()).mode], [1, 'ask'], 'one crate on the dock, and the next board');
  // back at the menu after a whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__ml.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__ml.state().round === n && window.__ml.state().phase === 'play', r); await frame.evaluate(() => window.__ml.act('solve')); }
  await until(() => window.__ml.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .ml-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__ml.state().screen === 'menu');
  assert.match(await text(frame, '#ch-build .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-undo .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, a drag, phones and reduced motion: every control is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the helper', { skip, timeout: 900_000 }, async () => {
  // Keyboard only, Run It Back: Tab to Start, Enter; arrows move the stepper, Enter runs the plan; 1 to 3 pick a tile; F flips the ray.
  const k = await open({ params: 'chapter=undo&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__ml.state().screen === 'play');
  await k.frame.evaluate(() => { window.__ml.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 3; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#ml-val'), 'x = 3', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), '3 in gives 10. That is less than 12.', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 4; i++) await k.p.keyboard.press(i % 2 ? '=' : 'ArrowRight');
  await k.p.keyboard.press('-'); await k.p.keyboard.press('ArrowDown');
  assert.equal(await text(k.frame, '#ml-val'), 'x = 5');
  await k.frame.focus('#ml-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__ml.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'ml-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#ml-dn'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'ml-up', 'Tab walks the buttons in order');
  await k.frame.evaluate(() => { window.__ml.act('solve'); }); await k.until(() => window.__ml.state().round === 3 && window.__ml.state().phase === 'play');
  const s3 = await k.state(), miss = s3.choices.find(v => v !== s3.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(ML.judge(s3, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s3.answer + 1));
  await k.until(() => window.__ml.state().round === 4);
  for (const r of [4, 5]) { await k.until(n => window.__ml.state().round === n && window.__ml.state().phase === 'play', r); await k.frame.evaluate(() => { window.__ml.act('solve'); }); }
  await k.until(() => window.__ml.state().round === 6 && window.__ml.state().phase === 'play');
  await k.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('f');
  assert.deepEqual((await k.state()).value, { at: 8, dir: 'left' }, 'the arrows move the end of the ray and F flips it'); assert.equal(await text(k.frame, '#ml-flip .big'), 'x < 8');
  await k.p.keyboard.press('F'); assert.equal(await text(k.frame, '#ml-flip .big'), 'x > 8');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), '7 is not in your set. It gives 18. 18 is less than 20, so that input works.');
  await k.frame.focus('#ml-flip'); await k.p.keyboard.press('Enter'); await k.frame.focus('#ml-go'); await k.p.keyboard.press('Enter');
  await k.until(() => window.__ml.state().screen === 'end');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Keyboard only, Build the Line: 1 to 4 put a block in or take it out, Backspace takes the last one out, Enter runs.
  const kb = await open({ params: 'chapter=build&lock=1' });
  await kb.frame.click('#start'); await kb.until(() => window.__ml.state().screen === 'play');
  await kb.frame.evaluate(() => { window.__ml.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  const b1 = await kb.state(), [m1, a1] = b1.answer;
  await kb.p.keyboard.press(String(a1 + 1)); await kb.p.keyboard.press(String(m1 + 1));
  assert.deepEqual((await kb.state()).value, [a1, m1], 'number keys put blocks into the line');
  await kb.p.keyboard.press('Enter');
  assert.equal((await kb.state()).mode, 'hint'); assert.match(await text(kb.frame, '#hint'), /^Right machines, wrong way round\. Without brackets, multiplying comes before adding or subtracting, so the times machine goes first\./);
  await kb.p.keyboard.press('Backspace'); assert.deepEqual((await kb.state()).value, [a1], 'Backspace takes the last block out');
  await kb.p.keyboard.press(String(a1 + 1)); assert.deepEqual((await kb.state()).value, [], 'the key of a block in the line takes it out');
  await kb.p.keyboard.press(String(m1 + 1)); await kb.p.keyboard.press(String(a1 + 1)); await kb.p.keyboard.press('Enter');
  await kb.until(() => window.__ml.state().round === 2);
  assert.deepEqual(kb.errors, []);
  await kb.ctx.close();

  // A drag: the mouse on the board's number line puts the end of the ray there, and follows as it moves (Run It Back, round 6).
  const d = await open({ params: 'chapter=undo&lock=1' });
  await d.frame.click('#start');
  await d.until(() => window.__ml.state().screen === 'play' && window.__ml.state().moving === 0, null, 120_000);
  await d.frame.evaluate(() => window.__ml.fast());
  for (let r = 1; r <= 5; r++) { await d.until(n => window.__ml.state().round === n && window.__ml.state().phase === 'play', r); await d.frame.evaluate(() => { window.__ml.act('solve'); }); }
  await d.until(() => window.__ml.state().round === 6 && window.__ml.state().phase === 'play' && window.__ml.state().moving === 0);
  await d.p.waitForTimeout(200);
  const at = v => d.frame.evaluate(x => window.__ml.at(x), v);
  let [x, y] = await at(3);
  await d.p.mouse.move(x, y); await d.p.mouse.down();
  assert.deepEqual((await d.state()).value, { at: 3, dir: 'right' }, 'pressing on 3 puts the end of the ray on 3');
  [x, y] = await at(8); await d.p.mouse.move(x, y, { steps: 6 });
  assert.deepEqual((await d.state()).value, { at: 8, dir: 'right' }, 'and it follows the drag along to 8'); assert.equal(await text(d.frame, '#ml-flip .big'), 'x > 8');
  await d.p.mouse.up();
  [x, y] = await at(2); await d.p.mouse.move(x, y); assert.equal((await d.state()).value.at, 8, 'a move with no button down changes nothing');
  await d.frame.click('#ml-flip'); await d.frame.click('#ml-go'); await d.until(() => window.__ml.state().screen === 'end');
  assert.deepEqual(d.errors, []);
  await d.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart and their words fit inside them; the board is wide, keeps its 4 by 3 shape (so it faces the player), sits
  // between the words and the controls with nothing of the street in front of it, and the helper and the dock never
  // cover any of it; the smallest number or word on it is big enough to read, as asked and with a wrong plan drawn on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 12], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__ml.state().screen === 'play');
      await m.frame.evaluate(() => window.__ml.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__ml.state().round === r && window.__ml.state().phase === 'play' && window.__ml.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), kids = [...document.querySelectorAll('#bar > *')], bs = kids.map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__ml.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), chest = box(sp.chest), w = board.right - board.left, h = board.bottom - board.top;
          // the words on a control stay inside it (no clipped tile)
          const spill = kids.filter(b => [...b.querySelectorAll('.big, .l')].some(t => r(t).left < r(b).left - 0.5 || r(t).right > r(b).right + 0.5)).length;
          const tiny = Math.min(...kids.flatMap(b => [...b.querySelectorAll('.big, .l')]).concat($('askt'), $('sum')).map(t => parseFloat(getComputedStyle(t).fontSize)));
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)), three: top.length,
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 56 || b.width < 56).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth, spill, tiny,
            // the board: big, 4 by 3, on screen between the words and the controls, nothing in front of it
            wide: w, flat: Math.abs(w / h - 4 / 3) < 0.03, view: board.left >= 0 && board.right <= innerWidth && board.top >= line && board.bottom <= bar, clear: sp.board.clear, read: sp.board.small,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line, hidden: hit(board, hero) || hit(board, chest) };
        });
        let fit = await measure();
        const look = { inside: true, top: false, three: 3, oneLine: width > height ? true : null, small: 0, n: CONTROLS[st.input].length, overlap: false, scroll: false, spill: 0, tiny: fit.tiny, wide: fit.wide, flat: true, view: true, clear: true, read: fit.read, helper: true, hidden: false };
        assert.deepEqual(fit, look, `${where}: on screen, the top row tidy, the controls big and apart, the board flat, in view, unhidden and clear of the helper`);
        assert.ok(fit.wide >= wide, `${where}: the board is ${fit.wide} px wide (at least ${wide})`);
        assert.ok(fit.read >= small, `${where}: the smallest number or word on the board is ${fit.read} px (at least ${small})`);
        assert.ok(fit.tiny >= 13, `${where}: the smallest words on the controls and in the words box are ${fit.tiny} px (at least 13)`);
        // a wrong plan drawn on the board is held to the same
        await tryPlan(m, st, wrongOf(st), touch);
        fit = await measure();
        assert.equal((await m.state()).mode, 'hint', where); assert.ok(fit.read >= small, `${where}: the smallest mark of a wrong plan's picture is ${fit.read} px (at least ${small})`);
        assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden, fit.inside, fit.spill], [true, true, true, false, true, 0], `${where}: the board with a wrong plan on it`);
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.ml-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__ml.act('solve'));
      }
      await m.until(() => window.__ml.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
