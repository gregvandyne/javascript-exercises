// Sky Lines (seed-games/sky-lines.html): Number Quest Pro Unit 5's game (The Sky Wires, grade 8), a Kit 2 (Oomba3D)
// sky of floating islands at sunset with a board that shows a grid, islands and wires. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Sky Islands at sunset
//     (Lily Hop plays the same world by day), and it has no timer, no lives, no losing and no reward currency;
//   - its rounds (the pure block between sky-lines:begin and sky-lines:end): six a chapter, every answer worked out
//     again here from the words the round asks with and from what the board shows as asked (islands, tables, drawn
//     wires), never from the game's own answer; every plan a player can make judged (every stop of every dial, every
//     stepper value, every grid point, every tile); every wrong plan answered with one of the game's own lines and a
//     picture whose numbers are what that plan really gives; the same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the words box prints the signs, what the chip and the board show and the button labels are never sent
//     to be spoken, and nothing is bought or sold;
//   - its registration: seeded, on the Learn shelf for grade 8, in the Number Quest course, tagged chapter by chapter
//     with the codes units.json gives the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one plants a flag, and six right rounds post the game-over message exactly once, not before; then the
//     menu with no parameters, a round at the game's own speed with the real buttons, the keyboard, a drag on the
//     grid, a desktop, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. SL_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/sky-lines.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/sky-lines.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 5), STEPS = UNIT.steps;
const CHAPTERS = ['slope', 'rule', 'meet'];
const MINUS = '−';

// The game's own round maker and words, run on their own (no DOM, no 3D).
const SL = (() => {
  const box = {}; vm.runInNewContext(/\/\* sky-lines:begin \*\/([\s\S]*?)\/\* sky-lines:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.SkyLines;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS, COLS: G.COLS, ROWS: G.ROWS }), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), nt: v => G.nt(v),
    ft: (a, b) => G.ft(a, b), mt: m => G.mt(m), expr: (m, b) => G.expr(m, b), rule: (m, b) => G.rule(m, b), pt: (x, y) => G.pt(x, y) };
})();
const T = lines.readGame('sky-lines').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];
/** A line as the screen prints it, and several lines as the words box shows them. */
const printed = l => (typeof l === 'string' ? l : SL.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');

// ---- What this test knows about the maths, written out here and never taken from the game. ----
/** A printed number: "−4" is −4, "3/2" is 1.5. */
const num = s => { const m = /^(−?)(\d+(?:\.\d+)?)(?:\/(\d+))?$/.exec(String(s).trim()); assert.ok(m, `a number reads "${s}"`); return (m[1] ? -1 : 1) * +m[2] / (m[3] ? +m[3] : 1); };
/** The right side of a printed rule, as a function of x: "2x + 1", "−x + 7", "1/2 x + 2", "2x", "3", "2(x + 1)", "6x − 1". */
function fn(s) {
  let m = /^(\d+)\(x \+ (\d+)\)$/.exec(s); if (m) return x => +m[1] * (x + +m[2]);
  m = /^(?:(−?)(\d+(?:\/\d+)?)? ?x)?(?: ?([+−]) (\d+)|(−?\d+))?$/.exec(s); assert.ok(m && s, `a rule reads "${s}"`);
  const k = m[0].includes('x') ? (m[1] ? -1 : 1) * (m[2] ? num(m[2]) : 1) : 0, c = m[4] ? (m[3] === MINUS ? -1 : 1) * +m[4] : m[5] ? num(m[5]) : 0;
  return x => k * x + c;
}
const XS = [0, 1, 2, 3, 4, 5, 7, 11, -2, 0.5];
const sameFn = (f, g) => XS.every(x => Math.abs(f(x) - g(x)) < 1e-9);
/** The wire each spoken rule line means, as a function of x, from the numbers in its words. */
const WIRE = { k: v => x => v.m * x + v.b, one: v => x => x + v.b, neg: v => x => -x + v.b, negk: v => x => -v.m * x + v.b, group: v => x => v.a * (x + v.b) };
const wireOf = (r, id) => { const l = r.ask.find(q => q[0].startsWith(`e.${id}.`)); assert.ok(l, `${r.chapter} ${r.n}: wire ${id} is told`); return WIRE[l[0].split('.')[2]](l[1]); };
const vals = r => r.opts.map(o => o.v), right = r => r.opts[r.answer];
/** Every stop of a dial or a stepper. */
const stops = d => Array.from({ length: Math.round((d.max - d.min) / d.by) + 1 }, (_, i) => d.min + i * d.by);
/** The numbers of a hint line whose key says which are below zero (…at.pn: the first is not, the second is). */
const signed = ([key, v], names) => { const s = key.split('.').pop(); assert.equal(s.length, names.length, key); return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, names.includes(k) && s[names.indexOf(k)] === 'n' ? -x : x])); };
const inWin = (win, x, y) => x >= win[0] && x <= win[0] + 12 && y >= win[1] && y <= win[1] + 8;
/** A wire of a picture, as a function. */
const wf = w => x => w.m * x + w.b;

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the sky is the newest Sky Islands at sunset', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  const engines = fs.readdirSync(path.join(ROOT, 'public/vendor/kit2/oomba3d')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.ok(V.kit2ImportMap().includes(`oomba3d/${engines.at(-1)}/oomba3d.js`), `the newest shipped Oomba3D (${engines.at(-1)})`);
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  // Sky Islands at sunset: the world Lily Hop plays by day, so the two never look alike
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/sky-islands')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), newest = shipped.at(-1);
  assert.ok(HTML.includes(`start({ theme: 'sky-islands', version: '${newest}', graphics: 'auto', time: 'sunset', outline: true, settings: true })`), `the newest shipped Sky Islands (${newest}), at sunset`);
  assert.match(fs.readFileSync(path.join(ROOT, 'seed-games/lily-hop.html'), 'utf8'), /theme: 'sky-islands', version: '[\d.]+', graphics: 'auto', time: 'day'/, 'Lily Hop is the same sky by day');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/themes/sky-islands/${newest}/theme.json`), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 9); for (const id of asked) assert.ok(have.has(id), `Sky Islands ${newest} has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/(?:piece\(|\[)'([a-z-]+)', -?[\d.]+, -?[\d.]+, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 28, `the sky is furnished from the theme (${used} pieces placed)`);
  for (const id of ['platform-large', 'island-round', 'brick', 'cloud', 'grass', 'flag']) assert.ok(asked.includes(id), `the sky has the ${id}`);
  // nothing to collect: no coin and no coin block
  for (const id of asked) assert.ok(!/^coin/.test(id), `${id}: no reward currency`);
  assert.match(HTML, /g\.hero\('rogue'/); assert.ok(theme.heroes.some(h => h.id === 'rogue'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the rigger back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  assert.doesNotMatch(HTML, /<input|contenteditable|prompt\(/, 'nothing is typed');
  assert.doesNotMatch(HTML, /physics\(|rapier3d-compat'\)|creature\(|school\(|askQuestion\(/, 'no physics and no animal: nothing chases, bites or falls; and not the kit\'s quiz');
});

test('numbers on the board: a steepness is a fraction in lowest terms, a rule is written as y = mx + b, and the true minus sign is used', () => {
  for (const [rise, run, want] of [[6, 4, '3/2'], [4, 6, '2/3'], [-6, 6, '−1'], [-6, 8, '−3/4'], [6, 2, '3'], [0, 5, '0'], [3, -6, '−1/2'], [-4, -2, '2']]) { assert.equal(SL.ft(rise, run), want); assert.ok(Math.abs(num(want) - rise / run) < 1e-9); }
  for (const [m, want] of [[1.5, '3/2'], [-0.5, '−1/2'], [2, '2'], [0, '0'], [-3, '−3'], [0.5, '1/2']]) assert.equal(SL.mt(m), want);
  const RULES = [[2, 1, '2x + 1'], [-1, 7, '−x + 7'], [0.5, 2, '1/2 x + 2'], [2, 0, '2x'], [0, 3, '3'], [1, 4, 'x + 4'], [6, -1, '6x − 1'], [-0.5, 7, '−1/2 x + 7'], [-2, 8, '−2x + 8'], [0, 0, '0'], [1, 0, 'x'], [-1, 0, '−x'], [1.5, 0, '3/2 x']];
  for (const [m, b, want] of RULES) { assert.equal(SL.expr(m, b), want); assert.equal(SL.rule(m, b), 'y = ' + want); assert.ok(sameFn(fn(want), x => m * x + b), `${want} read back is the same wire`); }
  assert.equal(SL.pt(-2, 3), '(−2, 3)'); assert.equal(SL.nt(-4), '−4'); assert.equal(SL.nt(2.5), '2.5');
  assert.ok(sameFn(fn('2(x + 1)'), x => 2 * x + 2));
});

test('rounds: six a chapter, every answer right for the reason the unit teaches, every plan judged, the first lap always the same', () => {
  assert.deepEqual([...SL.CHAPTERS], CHAPTERS); assert.equal(SL.ROUNDS, 6); assert.deepEqual([SL.COLS, SL.ROWS], [12, 8]);
  assert.equal(SL.round('slope', 0, 0), null); assert.equal(SL.round('slope', 7, 0), null); assert.equal(SL.round('shop', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(SL.round(ch, n, 0), SL.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it (what the words box prints, and the right answer)
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => SL.round(ch, n, 0));
  const ans = r => (r.input === 'tiles' ? right(r).t : r.input === 'wire' ? (r.dials.b ? SL.rule(r.answer.m, r.answer.b) : SL.mt(r.answer.m)) : r.input === 'point' ? SL.pt(r.answer.x, r.answer.y) : r.answer);
  assert.deepEqual(lap0('slope').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['through', 'String a wire from island A to island B. Set its steepness.', '3/2'],
    ['stairs', 'The small stair goes 2 across and 1 up. The big stair goes 6 across. How far up?', '3'],
    ['down', 'String a wire from island A down to island B. Set its steepness.', '−1'],
    ['read', 'What is the steepness of this wire?', '2/3'],
    ['rate', 'A cable car climbs 2 meters in 4 seconds, at a steady rate. Set the wire to match.', '1/2'],
    ['compare', 'Car A is the wire. Car B climbs 5 meters in 2 seconds. Which car climbs faster?', 'car B']]);
  assert.deepEqual(lap0('rule').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['reach', 'The wire starts at height 2 and climbs 1 for every 2 across. Set its height at 6 across.', 5],
    ['table', 'Read the table. Set the start height and the steepness of its wire.', 'y = 2x + 1'],
    ['story', 'A glider starts at height 6 and drops 1 for each step across. Set its wire.', 'y = −x + 6'],
    ['two', 'A wire passes through islands A and B. Set its start height and its steepness.', 'y = 1/2 x + 2'],
    ['graph', 'Which rule makes this wire?', 'y = 2x + 1'],
    ['bent', 'One table does not make a straight wire. Which one?', 'table B']]);
  assert.deepEqual(lap0('meet').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['level', 'Wire A is 2x + 1. Wire B is x + 4. How far across are they at the same height?', 3],
    ['plat', 'Wire A is 2x + 1. Wire B is −x + 7. Put the platform where they cross.', '(2, 5)'],
    ['cross', 'The two wires are drawn. Which point is on both?', '(2, 3)'],
    ['none', 'Wire A is 2x + 1. Wire B is 2x + 4. How many points do they share?', 'none'],
    ['all', 'Wire A is 2x + 4. Wire B is 2 times the sum of x and 2. How many points do they share?', 'every point'],
    ['sides', 'Wire A is 2 times the sum of x and 1. Wire B is x + 5. How far across are they at the same height?', 3]]);
  // what the chip shows before and after, and what is said and printed when each is found
  assert.deepEqual(lap0('slope').map(r => [printed(r.chip), printed(r.chipDone)]), [['how steep?', 'steepness 3/2'], ['1/2 = ?/6', '1/2 = 3/6'], ['how steep?', 'steepness −1'], ['how steep?', 'steepness 2/3'], ['how fast?', '1/2 m each second'], ['faster car?', '2 < 2.5']]);
  assert.deepEqual(lap0('rule').map(r => [printed(r.chip), printed(r.chipDone)]), [['height at 6 across?', '1/2 × 6 + 2 = 5'], ['y = ?x + ?', 'y = 2x + 1'], ['y = ?x + ?', 'y = −x + 6'], ['y = ?x + ?', 'y = 1/2 x + 2'], ['y = ?x + ?', 'y = 2x + 1'], ['which one bends?', 'table B: +1, +2, +3']]);
  assert.deepEqual(lap0('meet').map(r => [printed(r.chip), printed(r.chipDone)]), [['2x + 1 = x + 4', 'x = 3'], ['the crossing?', '(2, 5)'], ['the crossing?', '(2, 3)'], ['2x + 1 = 2x + 4', 'no solution'], ['2x + 4 = 2(x + 2)', 'true for every x'], ['2(x + 1) = x + 5', 'x = 3']]);
  assert.deepEqual(lap0('slope').map(r => box(r.said)), ['Yes! It goes up 6 for 4 across. Steepness is up over across.', 'Yes! 6 across is 3 × 2, and 3 × 1 is 3. Same steepness.', 'Yes! It goes down 6 for 6 across, so the steepness is below 0.',
    'Yes! It goes up 4 for 6 across. Steepness is up over across.', 'Yes! 2 meters in 4 seconds is 0.5 meters each second.', 'Yes! Car B climbs 2.5 meters each second, and car A only 2.']);
  assert.deepEqual(lap0('rule').map(r => box(r.said)), ['Yes! 6 across climbs 3, and 2 + 3 is 5.', 'Yes! It starts at 1 and goes up 2 for each step across.', 'Yes! It starts at 6 and goes down 1 for each step across.',
    'Yes! Up 2 for 4 across. Followed back to 0 across, the wire is at height 2.', 'Yes! It starts at 1 and goes up 2 for each step across.', 'Yes! Its steps are not all the same, so its points bend off a straight wire.']);
  assert.deepEqual(lap0('meet').map(r => box(r.said)), ['Yes! At 3 across both wires are at height 7.', 'Yes! At 2 across both wires are at height 5.', 'Yes! That point is on both wires, so it fits both rules.', 'Yes! Same steepness, different start. They never meet.',
    'Yes! Both rules give the same height every time. It is one wire.', 'Yes! 2x + 2 = x + 5 when x is 3.']);

  const seen = { kinds: new Set(), spots: new Set(), keys: new Set(), slips: new Set(), answers: new Map() };
  const lineOk = (l, at) => { if (typeof l === 'string') return assert.doesNotMatch(l, /undefined|NaN|\{|-\d|null/, `${at}: ${l}`); assert.ok(T[l[0]] !== undefined, `${at}: ${l[0]} is one of the game's lines`); assert.doesNotMatch(say(l[0], l[1]), /undefined|NaN|\{|-\d/, `${at}: ${l[0]} has all its numbers`); seen.keys.add(l[0]); };
  /** A picture of the board: at most two lines of maths under a grid or tables, everything on the grid a real place. */
  const drawOk = (d, at) => {
    assert.ok(d && (d.lines || []).length <= 2, `${at}: at most two lines under the picture`); for (const l of d.lines || []) lineOk(l, at);
    if (d.tables) { assert.ok(d.tables.length === 1 || d.tables.length === 3, at); for (const t of d.tables) assert.ok(t.xs.length === 4 && t.ys.length === 4 && t.xs.every(Number.isInteger) && t.ys.every(Number.isInteger), `${at}: a table of four whole pairs`); return; }
    assert.ok(Array.isArray(d.win) && (String(d.win) === '0,0' || String(d.win) === '-6,-4'), `${at}: the first quadrant, or all four`);
    for (const p of d.pts || []) assert.ok(inWin(d.win, p.x, p.y) && Number.isInteger(p.y * 2) && Number.isInteger(p.x * 2) && (!p.tone || ['ok', 'warn'].includes(p.tone)), `${at}: the island (${p.x}, ${p.y}) is on the grid`);
    for (const w of d.wires || []) { assert.ok(Number.isFinite(w.m) && Number.isFinite(w.b) && (!w.tone || ['ok', 'warn'].includes(w.tone)), at); if (w.tone === 'warn') assert.equal(w.dash, true, `${at}: a wrong wire is dashed as well as orange`); }
    for (const s of d.stairs || []) assert.ok(inWin(d.win, s.x, s.y) && inWin(d.win, s.x + s.run, s.y) && s.run > 0 && (s.riseT === '?' || num(s.riseT) === Math.abs(s.rise)) && num(s.runT) === s.run, `${at}: a stair with its lengths`);
    if (d.plat) assert.ok(inWin(d.win, d.plat.x, d.plat.y), `${at}: the platform is on the grid`);
    for (const q of d.gaps || []) assert.ok(q.x >= d.win[0] && q.x <= d.win[0] + 12 && Number.isFinite(q.y0) && Number.isFinite(q.y1), at);
  };
  /** The checks every round passes. */
  const common = (r, at) => {
    assert.ok(r.ask.length >= 1 && r.ask.length <= 3 && r.said.length === 1, at);
    for (const l of [...r.ask, ...r.said, r.chip, r.chipDone]) lineOk(l, at);
    for (const l of [...r.ask, ...r.said]) assert.ok(Array.isArray(l) && !/^(show|btn)\./.test(l[0]), `${at}: what is said is a spoken line (${l[0]})`);
    assert.ok(box(r.ask).length <= 100, `${at}: the instruction fits the words box (${box(r.ask).length})`);
    assert.ok(printed(r.chip).length <= 20 && printed(r.chipDone).length <= 24, `${at}: the chip is short (${printed(r.chip)} / ${printed(r.chipDone)})`);
    drawOk(r.pic.ask, at); drawOk(r.pic.found, at);
    seen.kinds.add(`${r.chapter}:${r.kind}`);
    const k = `${r.chapter} ${r.n}`; if (!seen.answers.has(k)) seen.answers.set(k, new Set()); seen.answers.get(k).add(JSON.stringify(r.input === 'tiles' ? right(r).t : r.answer));
  };
  /** Three tiles, all different; `want` says which one is right; every other has a hint and a picture. */
  const tilesOk = (r, at, want) => {
    assert.equal(r.opts.length, 3, at); assert.deepEqual(r.choices, [0, 1, 2], at); assert.equal(new Set(r.opts.map(o => o.t)).size, 3, `${at}: the tiles differ (${r.opts.map(o => o.t)})`);
    for (const o of r.opts) { assert.doesNotMatch(o.t, /-\d|undefined|NaN/, `${at}: a tile prints the true minus sign (${o.t})`); assert.ok(o.t.length <= 12, `${at}: a tile is short (${o.t})`); }
    const rights = r.opts.filter(want); assert.equal(rights.length, 1, `${at}: exactly one tile is right (${r.opts.map(o => o.t)})`); assert.equal(rights[0], right(r), `${at}: and it is the keyed one`);
    assert.deepEqual(SL.judge(r, r.answer), { ok: true }, at);
    for (const i of r.choices.filter(v => v !== r.answer)) { const j = SL.judge(r, i); assert.equal(j.ok, false, at); assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, `${at}: a wrong tile has a hint and a picture`); for (const l of j.lines) lineOk(l, at); drawOk(j.draw, `${at} tile ${i}`); }
    assert.equal(SL.judge(r, 3), null, at); seen.spots.add(r.answer);
  };
  /** A wire round: every stop of the dials is judged right exactly when the wire it makes does what `fits` asks;
   *  a wrong wire is drawn as set, and the hint and the picture give the height it really has where it misses. */
  const wireOk = (r, at, fits, wireFor) => {
    const D = r.dials, ms = stops(D.m), bs = D.b ? stops(D.b) : [undefined];
    assert.ok(D.m.start === 0 && D.m.by === 0.5 && ms.includes(r.answer.m) && (!D.b || (D.b.start === 0 && bs.includes(r.answer.b))), `${at}: the dials hold the answer`);
    assert.equal(SL.judge(r, D.b ? { m: 0, b: 0 } : { m: 0 }).ok, false, `${at}: the dials do not start on the answer`);
    let rights = 0;
    for (const m of ms) for (const b of bs) {
      const v = D.b ? { m, b } : { m }, j = SL.judge(r, v), w = wireFor(v), where = `${at} plan ${JSON.stringify(v)}`, fine = fits(w);
      assert.equal(j.ok, fine, `${where}: ${fine ? 'is' : 'is not'} the wire the words ask for`);
      if (fine) { rights++; continue; }
      assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, `${where}: a hint and a picture`); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
      const mine = j.draw.wires[0]; assert.ok(j.draw.wires.length === 1 && mine.tone === 'warn' && sameFn(wf(mine), w), `${where}: the picture is the wire that was set`);
      const gap = j.draw.gaps[0]; assert.ok(Math.abs(gap.y0 - w(gap.x)) < 1e-9 && gap.y0 !== gap.y1, `${where}: the gap starts on the wire, at ${gap.x} across, and ends where it should be`);
      const last = j.lines.at(-1); seen.slips.add(j.lines.length > 1 ? j.lines[0][0] : 'none');
      if (/^w\.hint\.at\./.test(last[0])) { const n = signed(last, ['a', 'b']); assert.deepEqual([n.a, n.b], [gap.y0, gap.y1], where); }
      else if (/^r\.hint\.miss\./.test(last[0])) { const n = signed(last, ['a']); assert.deepEqual([n.n, n.a, n.b], [gap.x, gap.y0, gap.y1], where); }
      else { assert.equal(last[0], 'p.hint.at', where); assert.deepEqual([last[1].n, last[1].a, last[1].b], [gap.x, gap.y0, gap.y1], where); }
    }
    assert.equal(rights, 1, `${at}: one right plan`);
    assert.deepEqual(SL.judge(r, r.answer), { ok: true }, at);
    for (const bad of [null, 3, 'x', { m: 0.25, b: 0 }, { m: 9 }, D.b ? { m: 1 } : { m: 1, b: 1 }, D.b ? { m: 1, b: 9 } : { m: 'x' }]) assert.equal(SL.judge(r, bad), null, `${at}: ${JSON.stringify(bad)} is no plan`);
    const done = r.pic.found.wires[0]; assert.ok(fits(wf(done)) && done.tone === 'ok', `${at}: the wire shown as found`);
  };

  for (let lap = 0; lap < 12; lap++) {
    // ---- slope
    for (let n = 1; n <= 6; n++) {
      const r = SL.round('slope', n, lap), at = `slope ${n} lap ${lap}`; common(r, at);
      if (r.kind === 'through' || r.kind === 'down') {
        // the two islands are on the board as asked; the wire starts at A and must pass through B
        const [A, B] = r.pic.ask.pts; assert.deepEqual([A.t, B.t], ['A', 'B'], at); assert.ok(B.x > A.x && (r.kind === 'down' ? B.y < A.y : B.y > A.y), `${at}: B is to the right of A, and ${r.kind === 'down' ? 'lower' : 'higher'}`);
        assert.equal(r.pic.ask.wires, undefined, `${at}: no wire is drawn before the plan is run`);
        assert.equal(String(r.win), r.kind === 'down' ? '-6,-4' : '0,0', at); if (r.kind === 'down') assert.ok(A.x < 0 && A.y > 0 && B.x > 0 && B.y < 0, `${at}: from the second quadrant to the fourth`);
        const m = (B.y - A.y) / (B.x - A.x); assert.equal(r.answer.m, m, `${at}: rise over run`);
        wireOk(r, at, w => Math.abs(w(B.x) - B.y) < 1e-9, v => x => A.y + v.m * (x - A.x));
        const st = r.pic.found.stairs[0]; assert.deepEqual([st.x, st.y, st.run, st.rise], [A.x, A.y, B.x - A.x, B.y - A.y], `${at}: the stair from A to B`);
        assert.deepEqual(r.said[0][1], { a: Math.abs(B.y - A.y), b: B.x - A.x }, at); assert.equal(r.said[0][0], m < 0 ? 'w.said.down' : 'w.said.up', at);
        assert.equal(printed(r.chipDone), 'steepness ' + SL.ft(B.y - A.y, B.x - A.x), at);
      } else if (r.kind === 'stairs') {
        const { a, b } = r.ask[0][1], { c } = r.ask[1][1], up = b * c / a;
        assert.ok(Number.isInteger(up) && Number.isInteger(c / a), `${at}: whole numbers`);
        tilesOk(r, at, o => o.v === up);
        // the wire is drawn only as far as the small stair, so the big stair's height cannot be read off it
        const w = r.pic.ask.wires[0], [small, big] = r.pic.ask.stairs; assert.ok(sameFn(wf(w), x => b / a * x) && w.to === small.x + small.run && big.x >= w.to, at);
        assert.deepEqual([small.run, small.rise, big.run, big.rise, big.riseT], [a, b, c, 0, '?'], at); assert.equal(wf(w)(small.x), small.y, `${at}: the small stair is under the wire`); assert.equal(wf(w)(big.x), big.y, at);
        const fb = r.pic.found.stairs[1]; assert.equal(fb.rise, up, at); assert.equal(wf(w)(fb.x + fb.run), fb.y + fb.rise, `${at}: the big stair ends on the wire`);
        for (const i of r.choices.filter(v => v !== r.answer)) { const wb = SL.judge(r, i).draw.stairs[1]; assert.equal(wb.rise, r.opts[i].v, at); assert.notEqual(wf(w)(wb.x + wb.run), wb.y + wb.rise, `${at}: a wrong stair leaves the wire`); }
        assert.deepEqual(r.said[0][1], { c, k: c / a, a, b, t: up }, at);
      } else if (r.kind === 'read') {
        const [A, B] = r.pic.ask.pts, w = wf(r.pic.ask.wires[0]); assert.ok(w(A.x) === A.y && w(B.x) === B.y, `${at}: the drawn wire passes through both islands`);
        assert.ok(A.x < 0 && B.x > 0 && A.y * B.y < 0, `${at}: the islands are in two different quadrants`);
        const m = (B.y - A.y) / (B.x - A.x); tilesOk(r, at, o => Math.abs(num(o.t) - m) < 1e-9); assert.equal(right(r).t, SL.ft(B.y - A.y, B.x - A.x), at);
        assert.deepEqual(r.opts.map(o => num(o.t)).sort((p, q) => p - q), [m, 1 / m, -m].sort((p, q) => p - q), `${at}: the wrong tiles are the slope upside down and the slope with the other sign`);
      } else if (r.kind === 'rate') {
        const { a, b } = r.ask[0][1]; assert.equal(r.answer.m, a / b, `${at}: meters over seconds`); assert.equal(r.dials.m.min, 0, at);
        wireOk(r, at, w => Math.abs(w(b) - a) < 1e-9 && w(0) === 0, v => x => v.m * x);
        assert.deepEqual(r.said[0][1], { a, b, k: a / b }, at);
      } else {
        const A = r.pic.ask.pts.find(p => p.x > 0), w = wf(r.pic.ask.wires[0]); assert.ok(r.pic.ask.wires[0].t === 'A' && w(0) === 0 && w(A.x) === A.y, `${at}: car A's wire runs from the start through its marked point`);
        const { a, b } = r.ask[0][1], ka = A.y / A.x, kb = a / b, want = ka > kb ? 'A' : kb > ka ? 'B' : 'same';
        tilesOk(r, at, o => o.v === want); assert.deepEqual(vals(r), ['A', 'B', 'same'], at);
        for (const i of r.choices.filter(v => v !== r.answer)) assert.deepEqual(SL.judge(r, i).lines, [L('p.hint.a', { a: A.y, b: A.x, k: ka }), L('p.hint.b', { a, b, k: kb })], `${at}: both rates, worked out`);
        assert.deepEqual(r.said[0], want === 'same' ? L('p.said.same', { a: ka }) : L(want === 'A' ? 'p.said.a' : 'p.said.b', { a: ka, b: kb }), at);
      }
    }
    // ---- rule
    for (let n = 1; n <= 6; n++) {
      const r = SL.round('rule', n, lap), at = `rule ${n} lap ${lap}`; common(r, at); assert.equal(String(r.win), '0,0', at);
      /** A start height and a steady change, from the words "starts at height b and climbs (drops) r for every n across". */
      const told = l => { const v = l[1], down = /down1?$/.test(l[0]); return x => v.b + (down ? -1 : 1) * v.r / (v.n || 1) * x; };
      if (r.kind === 'reach') {
        const f = told(r.ask[0]), { x } = r.ask[1][1], s = r.step;
        assert.equal(r.answer, f(x), `${at}: the height at ${x} across`); assert.ok(Number.isInteger(r.answer) && r.answer > 0 && r.answer <= s.max && s.min === 0 && s.start === 0 && s.by === 1 && s.name === 'h', at);
        assert.equal(r.pic.ask.wires, undefined, `${at}: no wire is drawn before the plan is run`); assert.deepEqual([r.pic.ask.pts[0].x, r.pic.ask.pts[0].y], [0, f(0)], `${at}: only the start is marked`);
        assert.deepEqual(SL.judge(r, r.answer), { ok: true }, at); for (const bad of [-1, 9, 1.5, 'x', null]) assert.equal(SL.judge(r, bad), null, at);
        for (const v of stops(s).filter(q => q !== r.answer)) {
          const j = SL.judge(r, v), where = `${at} tried ${v}`; assert.equal(j.ok, false, where); assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, where); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
          assert.deepEqual([j.draw.plat.x, j.draw.plat.y, j.draw.plat.tone], [x, v, 'warn'], `${where}: the platform where it was set`);
          const last = j.lines.at(-1);
          if (/^r\.hint\.never\./.test(last[0])) { assert.ok(f(1) > f(0) ? v < f(0) : v > f(0), `${where}: the wire never is at that height`); assert.deepEqual(last[1], { b: f(0), a: v }, where); assert.equal(j.draw.wires, undefined, where); }
          else { assert.equal(last[0], 'r.hint.where', where); assert.equal(f(last[1].n), v, `${where}: the wire is at height ${v} at ${last[1].n} across`); assert.ok(last[1].n >= 0 && last[1].n <= 12 && last[1].n !== x && last[1].x === x && last[1].a === v, where);
            const w = j.draw.wires[0]; assert.ok(sameFn(wf(w), f) && w.to === last[1].n && w.to !== x, `${where}: the wire is drawn as far as that height, never to the answer`); }
          if (j.lines.length > 1) seen.slips.add(j.lines[0][0]);
        }
      } else if (r.kind === 'table' || r.kind === 'story' || r.kind === 'two') {
        // the points the wire must pass, read from what the round shows or tells
        let pts;
        if (r.kind === 'table') { const t = r.pic.ask.tables[0]; pts = t.xs.map((x, i) => [x, t.ys[i]]); assert.equal(pts[0][0], 0, `${at}: the table starts at 0`); }
        else if (r.kind === 'story') { const f = told(r.ask[0]); pts = [[0, f(0)], [1, f(1)], [4, f(4)]]; assert.deepEqual(r.pic.ask.pts, [], `${at}: nothing is marked: the story tells it all`); }
        else { pts = r.pic.ask.pts.map(p => [p.x, p.y]); assert.ok(pts.length === 2 && pts[0][0] > 0 && pts[1][0] > pts[0][0], `${at}: two islands, neither at 0 across`); }
        const m = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]), b = pts[0][1] - m * pts[0][0];
        assert.deepEqual(r.answer, { m, b }, `${at}: the steepness and the start height`); assert.ok(pts.every(([x, y]) => m * x + b === y), `${at}: one straight wire passes every point`);
        if (r.pic.ask.wires) assert.fail(`${at}: no wire is drawn before the plan is run`);
        wireOk(r, at, w => pts.every(([x, y]) => Math.abs(w(x) - y) < 1e-9), v => x => v.m * x + v.b);
        assert.equal(printed(r.chipDone), SL.rule(m, b), at);
      } else if (r.kind === 'graph') {
        const w = wf(r.pic.ask.wires[0]); tilesOk(r, at, o => sameFn(fn(o.t.replace(/^y = /, '')), w));
        for (const o of r.opts) assert.match(o.t, /^y = /, at);
        for (const i of r.choices.filter(v => v !== r.answer)) { const d = SL.judge(r, i).draw; assert.ok(sameFn(wf(d.wires[0]), w) && sameFn(wf(d.wires[1]), fn(r.opts[i].t.replace(/^y = /, ''))) && d.wires[1].tone === 'warn', `${at}: the wire of the wrong rule, beside the real one`); }
      } else {
        const tabs = r.pic.ask.tables, steady = t => new Set(t.ys.slice(1).map((y, i) => (y - t.ys[i]) / (t.xs[i + 1] - t.xs[i]))).size === 1;
        assert.deepEqual(tabs.map(t => t.t), ['A', 'B', 'C'], at); assert.equal(tabs.filter(t => !steady(t)).length, 1, `${at}: one table changes its step`);
        tilesOk(r, at, o => !steady(tabs.find(t => t.t === o.v))); assert.deepEqual(vals(r), ['A', 'B', 'C'], at);
        for (const i of r.choices.filter(v => v !== r.answer)) { const t = tabs[i], j = SL.judge(r, i), d = t.ys[1] - t.ys[0]; assert.deepEqual(j.lines, [L(d < 0 ? 'r.hint.steady.down' : 'r.hint.steady.up', { a: Math.abs(d) })], at); assert.ok(t.xs.every((x, k) => wf(j.draw.wires[0])(x) === t.ys[k]), `${at}: its points do lie on one wire`); }
        assert.deepEqual(r.pic.found.pts.map(p => [p.x, p.y]), tabs[r.answer].xs.map((x, k) => [x, tabs[r.answer].ys[k]]), `${at}: the bent table's points`); assert.equal(r.pic.found.wires.length, 0, at);
      }
    }
    // ---- meet
    for (let n = 1; n <= 6; n++) {
      const r = SL.round('meet', n, lap), at = `meet ${n} lap ${lap}`; common(r, at); assert.equal(String(r.win), '0,0', at);
      if (r.kind === 'level' || r.kind === 'sides') {
        const A = wireOf(r, 'A'), B = wireOf(r, 'B'), s = r.step, sols = stops(s).filter(x => A(x) === B(x));
        assert.deepEqual(sols, [r.answer], `${at}: one place where the two rules are equal`); assert.ok(r.answer > 0 && s.start === 0 && s.name === 'x' && A(1) - A(0) !== B(1) - B(0), at);
        if (r.kind === 'sides') assert.match(r.ask[0][0], /^e\.A\.group$/, `${at}: brackets to multiply out`);
        assert.equal(r.pic.ask.wires, undefined, `${at}: no wire is drawn before the plan is run`);
        assert.equal(printed(r.chip).split(' = ').length, 2, at); const [lhs, rhs] = printed(r.chip).split(' = '); assert.ok(sameFn(fn(lhs), A) && sameFn(fn(rhs), B), `${at}: the chip is the equation of the two rules`);
        assert.deepEqual(SL.judge(r, r.answer), { ok: true }, at); for (const bad of [-1, 9, 1.5, 'x', null]) assert.equal(SL.judge(r, bad), null, at);
        for (const v of stops(s).filter(q => q !== r.answer)) {
          const j = SL.judge(r, v), where = `${at} tried ${v}`; assert.equal(j.ok, false, where); assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, where); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
          const nn = signed(j.lines.at(-1), ['a', 'b']); assert.deepEqual([nn.n, nn.a, nn.b], [v, A(v), B(v)], `${where}: the two heights there`);
          assert.ok(sameFn(wf(j.draw.wires[0]), A) && sameFn(wf(j.draw.wires[1]), B) && j.draw.wires.every(w => w.to === v), `${where}: both wires, as far as the plan`); assert.deepEqual([j.draw.gaps[0].x, j.draw.gaps[0].y0, j.draw.gaps[0].y1], [v, A(v), B(v)], where);
          if (j.lines.length > 1) { assert.equal(j.lines[0][0], 'm.hint.dist', where); const g = r.ask[0][1]; assert.equal(g.a * v + g.b, B(v), `${where}: the answer of someone who multiplied only the x`); seen.slips.add('m.hint.dist'); }
        }
        const pl = r.pic.found.plat; assert.deepEqual([pl.x, pl.y], [r.answer, A(r.answer)], at);
      } else if (r.kind === 'plat') {
        const A = wireOf(r, 'A'), B = wireOf(r, 'B'); let rights = 0;
        assert.equal(r.pic.ask.wires, undefined, `${at}: no wire is drawn before the plan is run`);
        for (let x = 0; x <= 12; x++) for (let y = 0; y <= 8; y++) {
          const j = SL.judge(r, { x, y }), fine = A(x) === y && B(x) === y, where = `${at} platform (${x}, ${y})`;
          assert.equal(j.ok, fine, where); if (fine) { rights++; assert.deepEqual(r.answer, { x, y }, where); continue; }
          assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, where); for (const l of j.lines) lineOk(l, where); drawOk(j.draw, where);
          const nn = signed(j.lines[0], ['a', 'b']); assert.deepEqual([nn.n, nn.a, nn.b], [x, A(x), B(x)], `${where}: the two heights there`);
          if (j.lines[1]) { const k = j.lines[1][0]; seen.slips.add(k); assert.ok(k === 'm.hint.plat' ? A(x) === B(x) && j.lines[1][1].a === y : k === 'm.hint.only.A' ? A(x) === y && B(x) !== y : k === 'm.hint.only.B' && B(x) === y && A(x) !== y, `${where}: ${k}`); }
          else assert.ok(A(x) !== y && B(x) !== y && A(x) !== B(x), where);
          assert.deepEqual([j.draw.plat.x, j.draw.plat.y, j.draw.plat.tone], [x, y, 'warn'], where); assert.ok(j.draw.wires.every(w => w.to === x), where);
        }
        assert.equal(rights, 1, `${at}: one point is on both wires`);
        assert.deepEqual(r.grid, { min: [0, 0], max: [12, 8], start: r.grid.start }, at); assert.equal(SL.judge(r, r.grid.start).ok, false, at);
        for (const bad of [null, 3, { x: 1 }, { x: 1.5, y: 2 }, { x: 13, y: 2 }, { x: 2, y: -1 }]) assert.equal(SL.judge(r, bad), null, at);
      } else if (r.kind === 'cross') {
        const [A, B] = r.pic.ask.wires.map(wf); assert.ok(r.pic.ask.wires[1].dash === true && !r.pic.ask.wires[0].dash, `${at}: the second wire is dashed, never told apart by its color alone`);
        const P = o => { const m = /^\((−?\d+), (−?\d+)\)$/.exec(o.t); assert.ok(m, o.t); return [num(m[1]), num(m[2])]; };
        tilesOk(r, at, o => { const [x, y] = P(o); return A(x) === y && B(x) === y; });
        for (const o of r.opts) { const [x, y] = P(o); assert.ok(inWin([0, 0], x, y), `${at}: ${o.t} is on the grid`); }
        const [rx, ry] = P(right(r)), sw = r.opts.find(o => o.v === 'swap'), st = r.opts.find(o => o.v === 'start');
        assert.deepEqual(P(sw), [ry, rx], at); assert.ok(A(ry) !== rx && B(ry) !== rx, `${at}: the swapped point is on neither wire`);
        const [sx, sy] = P(st), who = SL.judge(r, r.opts.indexOf(st)).lines[0][0]; assert.ok(sx === 0 && (who === 'm.hint.only.A' ? A(0) === sy && B(0) !== sy : who === 'm.hint.only.B' && B(0) === sy && A(0) !== sy), `${at}: a start that is on one wire only`);
      } else {
        const A = wireOf(r, 'A'), B = wireOf(r, 'B'), same = A(1) - A(0) === B(1) - B(0), want = same ? (A(0) === B(0) ? 'all' : 'none') : 'one';
        assert.equal(r.kind, want, at); tilesOk(r, at, o => o.v === want); assert.deepEqual(vals(r), ['none', 'one', 'all'], at);
        assert.deepEqual(r.opts.map(o => o.t), ['none', 'one', 'every point'], at);
        const d = r.pic.found; assert.ok(sameFn(wf(d.wires[0]), A) && sameFn(wf(d.wires[1]), B), `${at}: both wires as found`);
        if (want === 'one') { const x = (B(0) - A(0)) / ((A(1) - A(0)) - (B(1) - B(0))); assert.deepEqual([d.plat.x, d.plat.y], [x, A(x)], at); assert.equal(printed(r.chipDone), 'x = ' + x, at); }
        else assert.equal(printed(r.chipDone), want === 'none' ? 'no solution' : 'true for every x', at);
        for (const i of r.choices.filter(v => v !== r.answer)) { const l = SL.judge(r, i).lines[0];
          if (l[0] === 'm.hint.gap') assert.deepEqual(l[1], { m: A(1) - A(0), n: Math.abs(A(0) - B(0)) }, at);
          if (l[0] === 'm.hint.expand') { assert.ok(sameFn(x => l[1].a * (x + l[1].b), B) && sameFn(x => l[1].a * x + l[1].c, A), at); }
          if (l[0] === 'm.hint.starts') assert.notEqual(A(0), B(0), at); }
      }
    }
  }
  // every kind of round is played, every tile place is used, and a replay brings other numbers
  assert.deepEqual([...seen.kinds].sort(), ['meet:all', 'meet:cross', 'meet:level', 'meet:none', 'meet:one', 'meet:plat', 'meet:sides', 'rule:bent', 'rule:graph', 'rule:reach', 'rule:story', 'rule:table', 'rule:two', 'slope:compare', 'slope:down', 'slope:rate', 'slope:read', 'slope:stairs', 'slope:through']);
  assert.deepEqual([...seen.spots].sort(), [0, 1, 2]);
  for (const [k, set] of seen.answers) assert.ok(set.size >= 2, `${k}: a replay asks for another answer (${[...set]})`);
  for (const slip of ['w.hint.flat', 'w.hint.sign.up', 'w.hint.sign.down', 's.hint.flip', 'p.hint.flip', 'r.hint.swap', 'r.hint.m', 'r.hint.b', 'r.hint.climb', 'r.hint.every', 'm.hint.dist', 'm.hint.plat', 'm.hint.only.A', 'm.hint.only.B', 'none']) assert.ok(seen.slips.has(slip), `the slip ${slip} is named somewhere`);
  // every spoken line of the words is used by some round or hint (nothing is registered that the game never says)
  const used = new Set([...seen.keys, 'menu.pick', 'start.line', 'win', 'win.card']);
  assert.deepEqual(Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k) && !used.has(k)), [], 'every spoken line is said somewhere');
  // lesson parameters
  assert.deepEqual(SL.params({ chapter: 'rule', lock: 1 }), { chapter: 'rule', lock: true }); assert.deepEqual(SL.params({ chapter: 'shop', lock: 1 }), { chapter: '', lock: false }); assert.deepEqual(SL.params(null), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the words box prints the signs; nothing is bought or sold', () => {
  assert.ok(lines.TTS_GAMES.has('sky-lines'));
  const ok = text => lines.allowedLine('sky-lines', 'en', text);
  const NUMS = { n: 3, m: 5, a: 4, b: 2, c: 7, t: '9', k: 2.5, x: 6, r: 1, d: 8 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 97);
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket
    assert.doesNotMatch(T[k], /[−+×÷=<>≤≥≠|°()/\\^²→]|-\d/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 22, `${k} is short enough to hear: ${T[k]}`);
  }
  // a line that can meet a number below zero has a wording for each case, and each says "negative" where its key says n
  for (const k of ['w.hint.at.pp', 'w.hint.at.np', 'w.hint.at.pn', 'w.hint.at.nn', 'm.hint.at.pp', 'm.hint.at.pn']) assert.equal((T[k].match(/negative \{/g) || []).length, (k.split('.').pop().match(/n/g) || []).length, k);
  assert.ok(!T['m.hint.at.np'] && !T['m.hint.at.nn'], 'wire A never goes below zero on the grid, so it has no such wording');
  assert.equal((T['r.hint.miss.n'].match(/negative \{/g) || []).length, 1); assert.doesNotMatch(T['r.hint.miss.p'], /negative/);
  // a decimal goes where a number goes; a word never does, and neither does a sign or a letter
  assert.ok(ok('At island B your wire is at height 4.5, not 6.')); assert.ok(ok('Yes! 2 meters in 4 seconds is 0.5 meters each second.'));
  assert.equal(ok('At island B your wire is at height -6, not 6.'), null); assert.equal(ok('At island B your wire is at height six, not 6.'), null); assert.equal(ok('Wire A is 2 y plus 1.'), null, 'only the letter the line was written with');
  assert.equal(ok('Wire A is 2 x plus 1. Tell me a secret.'), null, 'only the game’s own lines');
  // what the chip and the board show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('How Steep'), null); assert.equal(ok('y = 2x + 1'), null); assert.equal(ok('2x + 1 = x + 4'), null);
  // The words box prints a spoken line with its signs, and leaves plain words as words.
  const PRINT = [['Wire A is 2 x plus 1.', 'Wire A is 2x + 1.'], ['Wire B is negative x plus 7.', 'Wire B is −x + 7.'], ['Wire B is negative 2 x plus 8.', 'Wire B is −2x + 8.'], ['Wire B is x plus 4.', 'Wire B is x + 4.'],
    ['Yes! 2 x plus 2 equals x plus 5 when x is 3.', 'Yes! 2x + 2 = x + 5 when x is 3.'], ['At island B your wire is at height negative 6, not 6.', 'At island B your wire is at height −6, not 6.'],
    ['Yes! 6 across climbs 3, and 2 plus 3 is 5.', 'Yes! 6 across climbs 3, and 2 + 3 is 5.'], ['Yes! 4 across drops 4, and 7 minus 4 is 3.', 'Yes! 4 across drops 4, and 7 − 4 is 3.'],
    ['Yes! 6 across is 3 times 2, and 3 times 1 is 3. Same steepness.', 'Yes! 6 across is 3 × 2, and 3 × 1 is 3. Same steepness.'], ['2 times the sum of x and 2 is 2 x plus 4. That is wire A again.', '2 times the sum of x and 2 is 2x + 4. That is wire A again.'],
    ['String a wire from island A down to island B. Set its steepness.', 'String a wire from island A down to island B. Set its steepness.'], ['At 3 across, wire A is at height 7 and wire B is at height negative 2.', 'At 3 across, wire A is at height 7 and wire B is at height −2.']];
  for (const [said, shown] of PRINT) assert.equal(SL.shown(said), shown);
  for (const k of spoken) { const s = SL.shown(say(k, NUMS)); assert.doesNotMatch(s, /[Nn]egative [\dx]|-\d|\d (plus|minus|equals) [\d(−]|\d x\b/, `${k} prints with its signs: ${s}`); }
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L|LS|per)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.') && !/^(w\.hint\.at|m\.hint\.at|r\.hint\.miss)$/.test(m[1])) assert.ok(T[m[1]] !== undefined || T[m[1] + '1'] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  assert.deepEqual([T['ch.slope'], T['ch.rule'], T['ch.meet'], T.title], ['How Steep', 'Wire Rules', 'Meeting Point', 'Sky Lines']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule)
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, in the game or in its listing; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|tax|discount|interest|commission|coins?|dollars?|cents?)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a sky of wires, not a shop: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes, SHOP);
  // nothing chases, bites or hurts, and nobody falls
  for (const text of [...Object.values(T), META.description, META.tags]) assert.doesNotMatch(text, /\b(fall|falls|fell|crash|crashes|hurt|hurts|fight|shoot|weapon|enemy|enemies|monster|chase[sd]?|bite[sd]?|die[sd]?|dead|kill)\b/i, text);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
  // the public listing never names the tier it was built for
  for (const text of [META.title, META.description, META.tags]) assert.doesNotMatch(text, /\bpro\b|towers|number quest/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('sky-lines'));
  assert.equal(META.slug, 'sky-lines'); assert.equal(META.title, 'Sky Lines'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['sky-lines'], { subject: 'math', from: 8, to: 8 }, 'on the Learn shelf as math for grade 8');
  for (const f of ['public/covers/sky-lines.jpg', 'public/og/sky-lines.jpg', 'scripts/covers/sky-lines.recipe.js', 'public/img/nq/sky-lines/how-steep.webp', 'public/img/nq/sky-lines/wire-rules.webp', 'public/img/nq/sky-lines/meeting-point.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'sky-lines'), { slug: 'sky-lines', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('sky-lines'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.SKY_CHAPTERS, { slope: ['8.EE.B.5', '8.EE.B.6', '6.NS.C.8'], rule: ['8.F.B.4', '8.F.A.1', '8.F.A.3', '6.EE.C.9'], meet: ['8.EE.C.7', '8.EE.C.8'] });
  assert.deepEqual(TAGS.gameCodes('sky-lines', 'ccss-math'), Object.values(TAGS.SKY_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('sky-lines'));
  assert.equal(UNIT.title, 'The Sky Wires'); assert.equal(UNIT.stamp, 'Slope Gear'); assert.equal(UNIT.tool, 'sky-lines'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 3); assert.ok(UNITS.tiers.pro.stones.includes('Slope Gear')); assert.equal(UNITS.tiers.pro.status, 'open', 'the grades 6-8 street is open to everyone (2026-11-15)');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['5.1', 14, 'Slope: the steepness of a line'], ['5.2', 15, 'y = mx + b: a line as a rule'], ['5.3', 16, 'Solve linear equations and find where two lines meet']]);
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.SKY_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(g.slug, 'sky-lines'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(SL.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '8', '']) assert.deepEqual(TAGS.stepGameCodes('sky-lines', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('sky-lines', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('sky-lines', 'ccss-math', '8', ''), ['8.EE.B.5', '8.EE.B.6', '8.F.B.4', '8.F.A.1', '8.F.A.3', '8.EE.C.7', '8.EE.C.8'], 'an unlocked grade 8 step claims the game’s grade 8 codes');
  assert.deepEqual(TAGS.stepGameCodes('sky-lines', 'ccss-math', '6', ''), ['6.NS.C.8', '6.EE.C.9'], 'and a grade 6 step its grade 6 codes');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.SL_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
// lap: the lap the first play takes (0, the fixed lap, whose numbers the checks below know), or null for the
// random lap a play really takes.
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, lap = 0 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Sky Lines' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__sl.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 60_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
/** A wrong plan for a round: one stop off the answer, the point beside it, or another tile. */
const wrongOf = s => (s.input === 'tiles' ? s.choices.find(v => v !== s.answer) : s.input === 'wire' ? { ...s.answer, m: s.answer.m === s.dials.m.max ? s.answer.m - 0.5 : s.answer.m + 0.5 } : s.input === 'point' ? { x: s.answer.x + 1, y: s.answer.y } : s.answer + 1);
/** What the stepper shows for a plan (a wire's stepper starts on its steepness). */
const planText = (s, v) => (s.input === 'wire' ? SL.mt(v.m) : SL.nt(v));
const controlsOf = s => (s.input === 'tiles' ? ['sl-n0', 'sl-n1', 'sl-n2'] : s.input === 'point' ? ['sl-l', 'sl-d', 'sl-u', 'sl-r', 'sl-go'] : s.input === 'wire' && s.dials.b ? ['sl-dn', 'sl-dial', 'sl-up', 'sl-go'] : ['sl-dn', 'sl-val', 'sl-up', 'sl-go']);
/** Try a plan with the real controls: the handle sets the plan, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#sl-n' + v);
  await g.frame.evaluate(x => window.__sl.act('set', x), v); return go('#sl-go');
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it does and does not advance, six right rounds post game over once`, { skip, timeout: 600_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1`, lap: null });   // the lap a real play takes
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'rogue']);
    assert.deepEqual(await ids(frame, '#card .sl-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T['start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__sl.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, 6], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-slope, #ch-rule, #menu').length), 0);
    await until(() => window.__sl.state().moving === 0, null, 120_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__sl.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      if (round === 1) { assert.ok(Number.isInteger(s.lap) && s.lap >= 1, 'a play takes a random lap, not the fixed lap 0'); g.lap1 = s.lap; } else assert.equal(s.lap, g.lap1, 'one lap for the whole play');
      const want = SL.round(chapter, round, s.lap);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      assert.equal(await text(frame, '#askt'), box(s.ask), `round ${round}: the instruction`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, flags: round - 1 }, `round ${round}: the board, and ${round - 1} flags on the far island`);
      // the controls: a stepper and Run (with the dial button for a wire of two dials), four arrows and Run, or three tiles
      assert.deepEqual(await ids(frame, '#bar > *'), controlsOf(s), `round ${round}: the controls`);
      if (s.input === 'wire') {
        assert.deepEqual(s.value, s.dials.b ? { m: 0, b: 0 } : { m: 0 }); assert.equal(s.dial, 'm');
        assert.equal(await text(frame, s.dials.b ? '#sl-dial .big' : '#sl-val .big'), '0', `round ${round}: the stepper starts at 0`);
        assert.equal(await text(frame, s.dials.b ? '#sl-dial .l' : '#sl-val .l'), s.dials.b ? '⇄ steepness' : 'steepness');
      } else if (s.input === 'step') {
        assert.equal(s.value, 0); assert.equal(await text(frame, '#sl-val .big'), '0'); assert.equal(await text(frame, '#sl-val .l'), s.step.name === 'h' ? 'height' : 'across');
      } else if (s.input === 'point') {
        assert.deepEqual(s.value, s.grid.start); assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .step')].map(b => b.getAttribute('aria-label'))), ['Left', 'Down', 'Up', 'Right']);
      } else assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .sl-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
      if (s.input !== 'tiles') assert.equal(await text(frame, '#sl-go .l'), 'Run');
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the board showing what the plan does, the same round, nothing reported
      const wrong = wrongOf(s), verdict = SL.judge(s, wrong);
      assert.equal(verdict.ok, false);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the board shows what it does`);
      assert.deepEqual(after.tried, verdict.draw || null, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.sl-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.flags, round - 1, `round ${round}: no flag for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input !== 'tiles') {
        // a new plan takes the board back to the question
        await frame.click(s.input === 'point' ? '#sl-l' : '#sl-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried], ['ask', null], `round ${round}: changing the plan makes a new plan`);
        assert.deepEqual(again.value, s.input === 'wire' ? { ...wrong, m: wrong.m - 0.5 } : s.input === 'point' ? { x: wrong.x - 1, y: wrong.y } : wrong - 1, `round ${round}`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__sl.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .sl-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .sl-askt'), 'Six flags are flying on the far island. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('sky-lines', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=<>≥²]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__sl.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.ok(s.lap >= 1 && s.lap !== g.lap1, 'Play again takes another lap'); assert.deepEqual(Object.fromEntries(Object.keys(SL.round(chapter, 1, s.lap)).map(k => [k, s[k]])), SL.round(chapter, 1, s.lap), 'the next lap’s first round');
    assert.equal(s.onStage.flags, 0, 'the far island is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed the real buttons set a wire, a wrong plan shows where it goes, a right one plants a flag and only then the next round', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .sl-menu .sl-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-slope', 'How Steep'], ['ch-rule', 'Wire Rules'], ['ch-meet', 'Meeting Point']]);
  await g.shot('menu');
  // Wire Rules, round 2 (the table 1, 3, 5, 7), with nothing hurried and the real buttons: round 1 the quick way first
  await frame.click('#ch-rule');
  await until(() => window.__sl.state().screen === 'play' && window.__sl.state().moving === 0, null, 120_000);
  await frame.evaluate(() => { window.__sl.fast(); window.__sl.act('solve'); });
  await until(() => window.__sl.state().round === 2 && window.__sl.state().phase === 'play');
  await frame.evaluate(() => window.__sl.fast(false));
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.dial, s.onStage.flags], ['rule', false, 'table', 'ask', { m: 0, b: 0 }, 'm', 1]);
  // Run with the dials at 0: the flat wire y = 0 is run as set
  await frame.click('#sl-go');
  assert.deepEqual([(await state()).mode, await text(frame, '#hint')], ['hint', 'At 0 across your wire is at height 0, not 1.']);
  // the steepness up to 1, then the other dial: the start height up to 2 (the two numbers the wrong way round)
  await frame.click('#sl-up'); await frame.click('#sl-up');
  assert.deepEqual([(await state()).value, (await state()).mode, await text(frame, '#sl-dial .big')], [{ m: 1, b: 0 }, 'ask', '1']);
  await frame.click('#sl-dial');
  assert.deepEqual([(await state()).dial, await text(frame, '#sl-dial .big'), await text(frame, '#sl-dial .l')], ['b', '0', '⇄ start height']);
  await frame.click('#sl-up'); await frame.click('#sl-up');
  assert.deepEqual((await state()).value, { m: 1, b: 2 });
  await frame.click('#sl-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', 'The number added is the start height. The number with x is the steepness. At 0 across your wire is at height 2, not 1.']);
  assert.deepEqual((await state()).tried.wires, [{ m: 1, b: 2, tone: 'warn', dash: true }], 'the board draws the wire y = x + 2 as it was set');
  await until(() => window.__sl.state().moving === 0, null, 120_000);   // the board has shaken its head
  assert.equal((await state()).round, 2); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('rule-tried');
  // the stops end at the ends of the dial: the start height cannot go below 0
  for (let i = 0; i < 4; i++) await frame.click('#sl-dn');
  assert.deepEqual((await state()).value, { m: 1, b: 0 });
  // the right plan: start height 1, steepness 2
  await frame.click('#sl-up'); await frame.click('#sl-dial'); await frame.click('#sl-up'); await frame.click('#sl-up');
  assert.deepEqual((await state()).value, { m: 2, b: 1 });
  await frame.click('#sl-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 2]); assert.equal(await text(frame, '#sum'), 'y = 2x + 1'); assert.equal(await text(frame, '#askt'), 'Yes! It starts at 1 and goes up 2 for each step across.');
  await frame.click('#sl-up'); await frame.click('#sl-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', { m: 2, b: 1 }]);
  assert.equal(s.onStage.flags, 2, 'the flag is on its way');
  await g.shot('rule-found');
  await until(() => window.__sl.state().round === 3, null, 180_000);
  assert.deepEqual([(await state()).onStage.flags, (await state()).mode], [2, 'ask'], 'two flags on the far island, and the next board');
  // back at the menu after a whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__sl.fast());
  for (let r = 3; r <= 6; r++) { await until(n => window.__sl.state().round === n && window.__sl.state().phase === 'play', r); await frame.evaluate(() => window.__sl.act('solve')); }
  await until(() => window.__sl.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .sl-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__sl.state().screen === 'menu');
  assert.match(await text(frame, '#ch-rule .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-meet .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, a drag, phones and reduced motion: every control is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the rigger', { skip, timeout: 900_000 }, async () => {
  // Keyboard only, Meeting Point: Tab to Start, Enter; arrows move the stepper, Enter runs; the four arrows move the platform; 1 to 3 pick a tile.
  const k = await open({ params: 'chapter=meet&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__sl.state().screen === 'play');
  await k.frame.evaluate(() => { window.__sl.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 2; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#sl-val .big'), '2', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'At 2 across, wire A is at height 5 and wire B is at height 6.', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 3; i++) await k.p.keyboard.press(i % 2 ? '=' : 'ArrowRight');
  await k.p.keyboard.press('-'); await k.p.keyboard.press('ArrowDown');
  assert.equal(await text(k.frame, '#sl-val .big'), '3');
  await k.frame.focus('#sl-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__sl.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'sl-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#sl-l'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'sl-d', 'Tab walks the buttons in order');
  await k.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  // the platform starts at (6, 1): four to the left and four up is (2, 5)
  for (let i = 0; i < 4; i++) await k.p.keyboard.press('ArrowLeft'); for (let i = 0; i < 5; i++) await k.p.keyboard.press('ArrowUp'); await k.p.keyboard.press('ArrowDown');
  assert.deepEqual((await k.state()).value, { x: 2, y: 5 }, 'the four arrows move the platform');
  await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'At 3 across, wire A is at height 7 and wire B is at height 4.');
  await k.p.keyboard.press('ArrowLeft'); await k.p.keyboard.press('Enter');
  await k.until(() => window.__sl.state().round === 3 && window.__sl.state().phase === 'play');
  const s3 = await k.state(), miss = s3.choices.find(v => v !== s3.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(SL.judge(s3, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s3.answer + 1));
  await k.until(() => window.__sl.state().round === 4);
  for (const r of [4, 5, 6]) { await k.until(n => window.__sl.state().round === n && window.__sl.state().phase === 'play', r); await k.frame.evaluate(() => { window.__sl.act('solve'); }); }
  await k.until(() => window.__sl.state().screen === 'end');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Keyboard only, Wire Rules round 2: the arrows turn the dial the stepper is on, and F changes the dial.
  const kb = await open({ params: 'chapter=rule&lock=1' });
  await kb.frame.click('#start'); await kb.until(() => window.__sl.state().screen === 'play');
  await kb.frame.evaluate(() => { window.__sl.fast(); window.__sl.act('solve'); });
  await kb.until(() => window.__sl.state().round === 2 && window.__sl.state().phase === 'play');
  await kb.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 4; i++) await kb.p.keyboard.press('ArrowUp');
  await kb.p.keyboard.press('f'); await kb.p.keyboard.press('ArrowUp'); await kb.p.keyboard.press('ArrowUp'); await kb.p.keyboard.press('ArrowDown');
  assert.deepEqual([(await kb.state()).value, (await kb.state()).dial], [{ m: 2, b: 1 }, 'b'], 'F changes the dial the arrows turn');
  await kb.p.keyboard.press('F'); assert.equal((await kb.state()).dial, 'm'); assert.equal(await text(kb.frame, '#sl-dial .big'), '2');
  assert.equal(await kb.frame.evaluate(() => document.getElementById('sl-dial').getAttribute('aria-label')), 'steepness 2. Other dial');
  await kb.p.keyboard.press('Enter');
  await kb.until(() => window.__sl.state().round === 3);
  assert.deepEqual(kb.errors, []);
  await kb.ctx.close();

  // A drag: the mouse on the board's grid puts the platform on the nearest grid point, and follows as it moves (Meeting Point, round 2).
  const d = await open({ params: 'chapter=meet&lock=1' });
  await d.frame.click('#start');
  await d.until(() => window.__sl.state().screen === 'play' && window.__sl.state().moving === 0, null, 120_000);
  await d.frame.evaluate(() => { window.__sl.fast(); window.__sl.act('solve'); });
  await d.until(() => window.__sl.state().round === 2 && window.__sl.state().phase === 'play' && window.__sl.state().moving === 0);
  await d.p.waitForTimeout(200);
  const at = (x, y) => d.frame.evaluate(([px, py]) => window.__sl.at(px, py), [x, y]);
  let [x, y] = await at(9, 2);
  await d.p.mouse.move(x, y); await d.p.mouse.down();
  assert.deepEqual((await d.state()).value, { x: 9, y: 2 }, 'pressing on (9, 2) puts the platform there');
  [x, y] = await at(2, 5); await d.p.mouse.move(x + 4, y - 3, { steps: 6 });
  assert.deepEqual((await d.state()).value, { x: 2, y: 5 }, 'and it follows the drag to the nearest grid point');
  await d.p.mouse.up();
  [x, y] = await at(7, 7); await d.p.mouse.move(x, y); assert.deepEqual((await d.state()).value, { x: 2, y: 5 }, 'a move with no button down changes nothing');
  await d.frame.click('#sl-go'); await d.until(() => window.__sl.state().round === 3);
  // on a round with no platform, a press on the board changes nothing
  [x, y] = await at(4, 4); await d.p.mouse.click(x, y); assert.equal((await d.state()).value, null);
  assert.deepEqual(d.errors, []);
  await d.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart and their words fit inside them; the board is wide, keeps its 4 by 3 shape (so it faces the player and its
  // squares are square), sits between the words and the controls with nothing of the sky in front of it, and the rigger
  // and the far island never cover any of it; the smallest number or word on it is big enough to read, as asked and
  // with a wrong plan drawn on it, when the hint sits under the board and never on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 12], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__sl.state().screen === 'play');
      await m.frame.evaluate(() => window.__sl.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__sl.state().round === r && window.__sl.state().phase === 'play' && window.__sl.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), kids = [...document.querySelectorAll('#bar > *')], bs = kids.map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__sl.spot(), line = r($('line')).bottom, bar = vis($('hint')) ? r($('hint')).top : r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), chest = box(sp.chest), w = board.right - board.left, h = board.bottom - board.top;
          // the words on a control stay inside it (no clipped tile), and the chip shows all of its words (`cut`)
          const spill = kids.filter(b => [...b.querySelectorAll('.big, .l')].some(t => r(t).left < r(b).left - 0.5 || r(t).right > r(b).right + 0.5)).length;
          const tiny = Math.min(...kids.flatMap(b => [...b.querySelectorAll('.big, .l')]).concat($('askt'), $('sum'), vis($('hint')) ? [$('hint')] : []).map(t => parseFloat(getComputedStyle(t).fontSize)));
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)), three: top.length,
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 56 || b.width < 56).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth, spill, tiny, cut: $('sum').scrollWidth > $('sum').clientWidth + 1,
            // the board: big, 4 by 3, on screen between the words and the controls (or the hint), nothing in front of it
            wide: w, flat: Math.abs(w / h - 4 / 3) < 0.03, view: board.left >= 0 && board.right <= innerWidth && board.top >= line && board.bottom <= bar, clear: sp.board.clear, read: sp.board.small,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line, hidden: hit(board, hero) || hit(board, chest) };
        });
        let fit = await measure();
        const look = { inside: true, top: false, three: 3, oneLine: width > height ? true : null, small: 0, n: controlsOf(st).length, overlap: false, scroll: false, spill: 0, tiny: fit.tiny, cut: false, wide: fit.wide, flat: true, view: true, clear: true, read: fit.read, helper: true, hidden: false };
        assert.deepEqual(fit, look, `${where}: on screen, the top row tidy, the controls big and apart, the board flat, in view, unhidden and clear of the rigger`);
        assert.ok(fit.wide >= wide, `${where}: the board is ${fit.wide} px wide (at least ${wide})`);
        assert.ok(fit.read >= small, `${where}: the smallest number or word on the board is ${fit.read} px (at least ${small})`);
        assert.ok(fit.tiny >= 13, `${where}: the smallest words on the controls and in the words box are ${fit.tiny} px (at least 13)`);
        // a wrong plan drawn on the board is held to the same, and its hint sits under the board, never on it
        await tryPlan(m, st, wrongOf(st), touch);
        await m.p.waitForTimeout(60);
        fit = await measure();
        assert.equal((await m.state()).mode, 'hint', where); assert.ok(fit.read >= small, `${where}: the smallest mark of a wrong plan's picture is ${fit.read} px (at least ${small})`);
        assert.ok(fit.wide >= wide * 0.8, `${where}: with a hint under it the board is still ${fit.wide} px wide`); assert.ok(fit.tiny >= 13, `${where}: the hint's words are ${fit.tiny} px`);
        assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden, fit.inside, fit.spill, fit.helper], [true, true, true, false, true, 0, true], `${where}: the board with a wrong plan on it, above its hint`);
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.sl-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__sl.act('solve'));
      }
      await m.until(() => window.__sl.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
