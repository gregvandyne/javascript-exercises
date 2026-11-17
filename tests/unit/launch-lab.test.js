// Launch Lab (seed-games/launch-lab.html): Number Quest Pro Unit 7's game (The Test Range, grades 6 to 8), a Kit 2
// (Oomba3D) test range on a red planet at sunset, with a data board, and the Pro finale, The Great Clock, its fourth
// chapter (seven rounds, one for each tower's gear). Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Space Base at sunset
//     (Rocket Supply plays the same world by day), and it has no timer, no lives, no losing, no shop and no wager;
//   - its rounds (the pure block between launch-lab:begin and launch-lab:end): six a chapter (the clock: seven), every answer worked out
//     again here from the words the round asks with and the data on the board as asked (never from the game's own
//     answer), every data set checked (a median really is the middle landing, a mean absolute deviation really is the
//     one the words give, a scatter plot really has the pattern it is said to have), every plan a player can make
//     judged (every tile, every number the stepper can stand on), every wrong plan answered with the game's own lines
//     and a picture whose numbers are what that plan really gives; the same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the words box prints the signs, what the chip and the board show and the button labels are never sent
//     to be spoken, and nothing is bought, sold, bet or won;
//   - its registration: seeded, on the Learn shelf for grades 6 to 8, in the Number Quest course, tagged chapter by
//     chapter with the codes units.json gives the three steps, and its lesson parameters survive the play-params
//     grammar; and the unit's twelve check items (three for the finale), each key worked out from the numbers in its question;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one sets a pod on the rack (in the clock, a gear in its socket), and six right rounds (the clock's seven)
//     post the game-over message exactly once, not before;
//     then the menu with no parameters, a round at the game's own speed with the real stepper buttons, the keyboard, a
//     desktop, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. LL_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/launch-lab.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/launch-lab.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 7), STEPS = UNIT.steps;
const CHAPTERS = ['spread', 'chance', 'trend', 'clock'];
const ROUNDS_OF = { spread: 6, chance: 6, trend: 6, clock: 7 };

// The game's own round maker and words, run on their own (no DOM, no 3D).
const LL = (() => {
  const box = {}; vm.runInNewContext(/\/\* launch-lab:begin \*\/([\s\S]*?)\/\* launch-lab:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.LaunchLab;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS, GEARS: G.GEARS }), roundsOf: c => G.roundsOf(c), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), view: (r, m, v) => plain(G.view(r, m, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), nt: v => G.nt(v) };
})();
const T = lines.readGame('launch-lab').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const printed = l => (typeof l === 'string' ? l : LL.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sum = a => a.reduce((k, v) => k + v, 0);
const sorted = a => [...a].sort((p, q) => p - q);
/** The median, the mean, the mean absolute deviation, the range and the correlation, worked out here (never the game's). */
const median = a => { const s = sorted(a), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mean = a => sum(a) / a.length;
const mad = a => { const m = mean(a); return sum(a.map(v => Math.abs(v - m))) / a.length; };
const range = a => Math.max(...a) - Math.min(...a);
function corr(pts) { const mx = mean(pts.map(q => q[0])), my = mean(pts.map(q => q[1])); let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy); }
/** The least-squares line through points, and how far each point is from it. */
function fit(pts) { const mx = mean(pts.map(q => q[0])), my = mean(pts.map(q => q[1])), m = sum(pts.map(([x, y]) => (x - mx) * (y - my))) / sum(pts.map(([x]) => (x - mx) ** 2)); return { m, b: my - m * mx, off: ([x, y]) => y - (my + m * (x - mx)) }; }
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const frac = (n, d) => { const g = gcd(n, d); return d / g === 1 ? String(n / g) : `${n / g}/${d / g}`; };
/** Every plan a player can make in a round: each tile, or each number the stepper can stand on. */
function plans(r) {
  if (r.input === 'tiles') return r.choices;
  const out = []; for (let i = 0; r.step.min + i * r.step.by <= r.step.max + 1e-9; i++) out.push(Math.round((r.step.min + i * r.step.by) * 1000) / 1000);
  return out;
}
const GATES = { 'left or right': 2, 'left, middle or right': 3 }, BINS = { 'bin 1 or 2': 2, 'bin 1, 2 or 3': 3, 'bin 1, 2, 3 or 4': 4 };
/** The answer of a round, worked out here from the words it asks with and the data on the board as asked: never from
 *  the game's own answer. A number for a stepper, the words on the right tile for tiles. */
function solve(r) {
  const q = r.ask.map(l => say(l[0], l[1])).join(' '), g = re => { const m = re.exec(q); assert.ok(m, `${r.kind}: "${q}" reads as ${re}`); return m.slice(1).map(Number); };
  const part = r.pic.ask.parts[0];
  switch (r.kind) {
    case 'median': { const [n] = g(/^(\d+) probes landed/); const v = part.rows[0].vals; assert.equal(v.length, n); assert.equal(n % 2, 1, 'an odd count: one middle landing'); return median(v); }
    case 'mean': { const [n] = g(/these (\d+) probes/); const v = part.rows[0].vals; assert.equal(v.length, n); assert.ok(Number.isInteger(mean(v)), 'a whole mean'); return mean(v); }
    case 'consistent': {
      const [a, b] = part.rows.map(x => x.vals); assert.deepEqual(part.rows.map(x => x.tag), ['A', 'B']);
      assert.equal(median(a), median(b), 'the same middle'); assert.equal(mean(a), mean(b), 'and the same mean');
      const tight = range(a) < range(b) ? 'A' : 'B'; assert.ok((range(a) < range(b)) === (mad(a) < mad(b)) && range(a) !== range(b) && mad(a) !== mad(b), 'range and MAD agree on which spreads less');
      return tight;
    }
    case 'iqr': { const f = part.five; assert.ok(f.every((v, i) => i === 0 || v > f[i - 1]), 'five numbers in order'); return f[3] - f[1]; }
    case 'mad': { const [n, m] = g(/these (\d+) landings is (\d+) meters/); const v = part.rows[0].vals; assert.equal(v.length, n); assert.ok(near(mean(v), m), 'the mean the words give'); return mad(v); }
    case 'hist': { const [n] = g(/where (\d+) probes landed/); assert.equal(sum(part.bins.map(b => b.n)), n); return String(sum(part.bins.filter(b => +/^(\d+)/.exec(b.t)[1] >= 20).map(b => b.n))); }
    case 'model': { const [b, k] = g(/has (\d+) equal bins\. Stars mark (\d+) of them/); assert.equal(part.bins, b); assert.equal(part.stars.length, k); assert.ok(/equally likely/.test(q)); return k / b; }
    case 'freq': { const [n, c, t] = g(/In (\d+) drops, (\d+) landed in bin C\. At that rate, how many of (\d+) drops/); assert.equal(sum(part.bins.map(x => x.n)), n); assert.equal(part.bins[2].n, c); assert.equal(part.bins[2].t, 'C'); return c / n * t; }
    case 'estimate': { const [n] = g(/^(\d+) probes fell/); const L = /bin ([A-D]) from/.exec(q)[1], i = 'ABCD'.indexOf(L); assert.equal(sum(part.bins.map(x => x.n)), n); assert.equal(part.bins[i].t, L); return LL.nt(part.bins[i].n / n); }
    case 'not': { const [p] = g(/a star bin is ([\d.]+)\./); return Math.round((1 - p) * 10) / 10; }
    case 'table': {
      const m = /goes (.+?) at the gate, then drops into (.+?)\. Each way is equally likely\. What is the probability of (left|middle|right), then bin (\d)\?/.exec(q); assert.ok(m, q);
      const gw = GATES[m[1]], bw = BINS[m[2]]; assert.ok(gw && bw, q); assert.equal(part.gates.length, gw); assert.equal(part.bins, bw); assert.ok(+m[4] <= bw);
      return frac(1, gw * bw);
    }
    case 'expect': { const [p, n] = g(/a probability of ([\d.]+)\. How many of (\d+) drops/); return Math.round(p * n * 1000) / 1000; }
    case 'gap': { const [a, b] = part.rows.map(x => x.vals); assert.equal(a.length, 9); assert.equal(b.length, 9); return median(b) - median(a); }
    case 'mads': { const [s, a, b] = g(/deviation of (\d+) meters\. A's mean is (\d+) meters and B's is (\d+)/); const [ra, rb] = part.rows.map(x => x.vals); assert.ok(near(mean(ra), a) && near(mean(rb), b) && near(mad(ra), s) && near(mad(rb), s), 'the data have the means and the deviation the words give'); return (b - a) / s; }
    case 'sample': { const [n, t, c] = g(/sample of (\d+) probes came from a batch of (\d+)\. (\d+) of them/); assert.equal(part.n, n); assert.equal(part.marked.length, c); return c / n * t; }
    case 'assoc': { const r0 = corr(part.pts); assert.ok(Math.abs(r0) > 0.9 || Math.abs(r0) < 0.15, `a clear pattern or none (${r0})`); return Math.abs(r0) < 0.15 ? 'none' : r0 > 0 ? 'positive' : 'negative'; }
    case 'outlier': {
      const f = fit(part.pts), offs = part.tags.map(tg => Math.abs(f.off([tg.x, tg.y])));
      const far = offs.indexOf(Math.max(...offs)); assert.ok(offs.every((o, i) => i === far || o * 3 < offs[far]), `one tagged point far from the pattern (${offs})`);
      for (const tg of part.tags) assert.deepEqual(part.pts.find(pt => pt[0] === tg.x), [tg.x, tg.y], 'a tag names a point of the plot');
      return part.tags[far].t;
    }
    case 'predict': { const [a, c, b, d, x] = g(/power (\d+), distance (\d+), and power (\d+), distance (\d+)\. Predict the distance for power (\d+)/); return c + (x - a) * (d - c) / (b - a); }
    // the Great Clock: each a problem of more than one step, worked out here from its words (and its board, where it draws the data)
    case 'rate': { const [c, a, t] = g(/burns ([\d.]+) milliliters of oil every (\d+) hours\. At that rate, how many milliliters does it burn in (\d+) hours/); assert.equal(part.a, a); assert.equal(part.c, c); assert.equal(part.t, t); return c / a * t; }
    case 'temp': { const [s, w, h, c] = g(/at (\d+) below zero\. It warms ([\d.]+) degrees each hour for (\d+) hours, then cools (\d+) degrees/); assert.equal(part.s, -s, 'the thermometer starts where the words say'); return -s + w * h - c; }
    case 'undo': { const [p, q, r0] = g(/multiplied by (\d+), then ([\d.]+) is added, and ([\d.]+) comes out/); return (r0 - q) / p; }
    case 'error': { const [sv, rv] = g(/the clock is (\d+) meters\. The real path is (\d+) meters/); return Math.abs(rv - sv) / rv * 100; }
    case 'slope': { const [a, b] = g(/a platform (\d+) across and (\d+) up/); assert.deepEqual(part.pts, [[0, 0], [a, b]], 'the plane shows the foot and the platform'); return b / a; }
    case 'ladder': { const [a, b] = g(/clock face, (\d+) meters up the tower wall\. Its foot stands (\d+) meters out/); const c = Math.sqrt(a * a + b * b); assert.ok(Number.isInteger(c), 'a whole ladder'); assert.deepEqual([part.a, part.b], [a, b]); return c; }
    case 'missing': { const [m, a, b, c, d] = g(/mean of five landings is (\d+) meters\. Four of them landed at (\d+), (\d+), (\d+) and (\d+) meters/); assert.deepEqual(sorted(part.rows[0].vals), sorted([a, b, c, d]), 'the dot plot shows the four landings'); return 5 * m - (a + b + c + d); }
    default: assert.fail(`no solver for ${r.kind}`);
  }
}
/** A hint's own numbers, checked as arithmetic: the line says what the plan `v` really gives. */
const HINTS = {
  's.hint.median': (x, v, r) => x.n === v && x.a === r.p.vals.filter(y => y < v).length && x.b === r.p.vals.filter(y => y > v).length && x.h === (r.p.vals.length - 1) / 2 && (x.a > x.h || x.b > x.h),
  's.hint.mean': (x, v, r) => x.n === v && x.a === x.k * v && x.b === sum(r.p.vals) && x.k === r.p.vals.length,
  's.hint.iqr': (x, v, r) => x.n === v && x.b === x.a + v && x.a === r.p.five[1] && x.c === r.p.five[3],
  's.hint.mad': (x, v, r) => near(+x.n, v) && near(+x.a, x.k * v) && x.b === sum(r.p.vals.map(y => Math.abs(y - r.p.m))),
  'c.hint.model': (x, v, r) => near(+x.n, v) && near(+x.a, v * x.b) && x.k === r.p.k,
  'c.hint.freq': (x, v, r) => x.n === v && near(+x.a, v / x.t) && near(+x.b, x.c / x.m),
  'c.hint.not': (x, v, r) => near(+x.n, v) && near(+x.a, +x.p + v) && !near(+x.a, 1),
  'c.hint.expect': (x, v) => x.n === v && near(+x.a, v / x.m), 'c.hint.expect.about': (x, v) => x.n === v && Math.abs(+x.a - v / x.m) <= 0.005 + 1e-9 && !near(+x.a, v / x.m),
  't.hint.gap': (x, v) => x.n === v && x.b === x.a + v && x.b !== x.c,
  't.hint.mads': (x, v, r) => x.n === v && x.a === v * x.s && x.d === r.p.d && x.a !== x.d,
  't.hint.sample': (x, v) => x.n === v && near(+x.a, v / x.t), 't.hint.sample.about': (x, v) => x.n === v && Math.abs(+x.a - v / x.t) <= 0.005 + 1e-9 && !near(+x.a, v / x.t),
  't.hint.predict': (x, v, r) => x.c === r.p.yb - r.p.ya && x.x === r.p.x,
  'g.hint.rate': (x, v, r) => x.n === v && near(+x.b, v / x.t) && near(+x.q, x.c / x.a) && x.t === r.p.t,
  'g.hint.rate.about': (x, v) => x.n === v && Math.abs(+x.b - v / x.t) <= 0.005 + 1e-9 && !near(+x.b, v / x.t) && near(+x.q, x.c / x.a),
  'g.hint.temp.rise.below': (x, v, r) => v < 0 && x.n === -v && x.k === v - r.p.s && x.k > 0, 'g.hint.temp.rise.above': (x, v, r) => v > 0 && x.n === v && x.k === v - r.p.s,
  'g.hint.temp.rise.zero': (x, v, r) => v === 0 && x.k === -r.p.s, 'g.hint.temp.drop': (x, v, r) => v < r.p.s && x.n === -v && x.k === r.p.s - v, 'g.hint.temp.none': (x, v, r) => v === r.p.s && x.n === -v,
  'g.hint.temp.net': (x, v, r) => x.a === r.p.w * r.p.h && x.c === r.p.c && x.d === x.a - x.c,
  'g.hint.undo': (x, v, r) => x.n === v && x.a === v * x.p && near(+x.b, x.a + +x.q) && !near(+x.b, +x.r) && near(+x.r, r.p.r),
  'g.hint.error': (x, v, r) => x.n === v && near(+x.a, v * x.r / 100) && x.e === Math.abs(r.p.r - r.p.s) && !near(+x.a, x.e),
  'g.hint.slope': (x, v, r) => near(+x.n, v) && near(+x.c, v * x.a) && x.b === r.p.b && !near(+x.c, x.b),
  'g.hint.ladder': (x, v, r) => x.n === v && near(+x.h, Math.sqrt(v * v - x.b * x.b)) && x.a === r.p.a && +x.h !== x.a, 'g.hint.ladder.about': (x, v, r) => x.n === v && Math.abs(+x.h - Math.sqrt(v * v - x.b * x.b)) <= 0.005 + 1e-9 && x.a === r.p.a,
  'g.hint.ladder.short': (x, v) => x.n === v && v <= x.b,
  'g.hint.missing': (x, v, r) => x.n === v && x.a === sum(r.p.vals) + v && near(+x.b, x.a / 5) && !near(+x.b, x.m),
};

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the base is a test range at sunset', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  const engines = fs.readdirSync(path.join(ROOT, 'public/vendor/kit2/oomba3d')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.ok(V.kit2ImportMap().includes(`oomba3d/${engines.at(-1)}/oomba3d.js`), 'the newest shipped Oomba3D');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  // the newest Space Base, at sunset: the world Rocket Supply plays by day, so the two never look alike
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/space-base')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.ok(HTML.includes(`start({ theme: 'space-base', version: '${shipped.at(-1)}', graphics: 'auto', time: 'sunset', outline: true, settings: true })`), 'the newest shipped Space Base, at sunset');
  assert.match(fs.readFileSync(path.join(ROOT, 'seed-games/rocket-supply.html'), 'utf8'), /theme: 'space-base', version: '[\d.]+', graphics: 'auto', time: 'day'/, 'Rocket Supply is the same base by day');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/themes/space-base/${shipped.at(-1)}/theme.json`), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `the Space Base has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/\['([a-z-]+)', -?[\d.]+, 0, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 30, `the base is furnished from the theme (${used} pieces placed)`);
  for (const id of ['base-dome', 'landing-pad', 'rocket-lander', 'solar-panel', 'rover', 'cargo']) assert.ok(asked.includes(id), `the base has the ${id}`);
  // nothing to collect: no coin is loaded, and the cargo pods on the rack are not a currency
  assert.ok(!asked.includes('coin'), 'no reward currency');
  assert.match(HTML, /g\.hero\('rogue'/); assert.ok(theme.heroes.some(h => h.id === 'rogue'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the helper back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now|Math\.random/, 'no clock, and every data set comes from the seeded generator');
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable|prompt\(/, 'nothing is typed');
  assert.doesNotMatch(HTML, /physics\(|rapier3d-compat'\)|creature\(|school\(|g\.controls\(/, 'no physics, no animal and nothing to steer: nothing chases, bites or falls');
});

test('rounds: six a chapter (the clock: seven), every answer worked out again from the words and the data, every plan judged, every wrong plan shown as it really turns out, the first lap always the same', () => {
  assert.deepEqual(LL.CHAPTERS, CHAPTERS); assert.equal(LL.ROUNDS, 6);
  for (const c of CHAPTERS) assert.equal(LL.roundsOf(c), ROUNDS_OF[c], c);
  assert.equal(LL.round('nowhere', 1, 0), null); assert.equal(LL.round('chance', 0, 0), null); assert.equal(LL.round('chance', 7, 0), null);
  assert.equal(LL.round('clock', 0, 0), null); assert.equal(LL.round('clock', 8, 0), null); assert.ok(LL.round('clock', 7, 0), 'the clock has a seventh round');
  const kinds = { spread: ['median', 'mean', 'consistent', 'iqr', 'mad', 'hist'], chance: ['model', 'freq', 'estimate', 'not', 'table', 'expect'], trend: ['gap', 'mads', 'sample', 'assoc', 'outlier', 'predict'],
    clock: ['rate', 'temp', 'undo', 'error', 'slope', 'ladder', 'missing'] };
  assert.deepEqual(LL.GEARS, ['ratio', 'zero', 'variable', 'scale', 'slope', 'angle', 'chance'], 'one gear for each unit, in unit order');
  const PARTS = ['dots', 'box', 'hist', 'tower', 'bar', 'grid', 'sample', 'scatter', 'dnl', 'therm', 'machine', 'tri'];
  const seen = new Map();
  let judged = 0, wrongs = 0;
  for (const chapter of CHAPTERS) for (let lap = 0; lap < 14; lap++) for (let n = 1; n <= ROUNDS_OF[chapter]; n++) {
    const r = LL.round(chapter, n, lap), where = `${chapter} ${n} lap ${lap}`;
    assert.deepEqual(r, LL.round(chapter, n, lap), `${where}: the same round every time it is asked for`);
    assert.equal(r.kind, kinds[chapter][n - 1], where); assert.equal(r.chapter, chapter); assert.equal(r.n, n);
    if (chapter === 'clock') { assert.equal(r.gear, LL.GEARS[n - 1], where); assert.deepEqual(r.ask[0], [`g.gear.${n}`, {}], `${where}: the round names its gear first`); assert.equal(r.input, 'step', `${where}: every gear is planned on the stepper`); }
    assert.ok(r.input === 'tiles' || r.input === 'step', where);
    // the board as asked and as found are what view() draws, and each is one drawn part over at most two lines
    assert.deepEqual(r.pic.ask, LL.view(r, 'ask', null), where); assert.deepEqual(r.pic.found, LL.view(r, 'found', null), where);
    for (const ov of [r.pic.ask, r.pic.found]) { assert.ok(ov.parts.length === 1 && PARTS.includes(ov.parts[0].k), where); assert.ok(ov.lines.length <= 2, `${where}: at most two lines of maths under the picture`); }
    // every line it asks, says or shows is one of the game's own, with a number in every place
    const allLines = [...r.ask, ...r.said, ...(Array.isArray(r.chip) ? [r.chip] : [])];
    for (const [k, v] of allLines) { assert.ok(T[k] !== undefined, `${where}: ${k}`); for (const ph of T[k].match(/\{\w+\}/g) || []) { const val = v[ph.slice(1, -1)]; assert.match(String(val), /^\d+(\.\d+)?$/, `${where}: ${k} ${ph} is a number (${val})`); } }
    for (const ov of [r.pic.ask, r.pic.found]) for (const l of ov.lines) if (Array.isArray(l)) assert.ok(T[l[0]] !== undefined && /^show\./.test(l[0]), `${where}: ${l[0]} is a shown line`);
    const want = solve(r);
    const all = plans(r);
    if (r.input === 'tiles') {
      assert.equal(r.opts.length, 3, where); assert.equal(new Set(r.opts.map(o => o.t)).size, 3, `${where}: three different tiles (${r.opts.map(o => o.t)})`);
      assert.equal(r.opts[r.answer].t, want, `${where}: the right tile is the answer worked out from the words and the board (${want})`);
      assert.deepEqual(Object.keys(r.hints).map(Number).sort(), r.choices.filter(i => i !== r.answer), `${where}: each wrong tile has its own hint`);
      assert.equal(new Set(Object.values(r.hints).map(h => JSON.stringify(h))).size, 2, `${where}: two different mistakes`);
    } else {
      assert.ok(near(r.answer, want), `${where}: the answer ${r.answer} is the one worked out from the words and the board (${want})`);
      assert.ok(all.some(v => near(v, r.answer)), `${where}: the stepper can stand on the answer`);
      assert.ok(!near(r.step.start, r.answer) && all.includes(r.step.start), `${where}: it starts on the stepper, and not on the answer`);
      assert.ok(Math.abs(r.answer - r.step.start) / r.step.by <= 10 + 1e-9, `${where}: the answer is at most ten presses away`);
      assert.ok(['m', '', 'ml', '°', '%'].includes(r.unit), where);
      for (const v of [r.step.min - r.step.by, r.step.max + r.step.by, r.step.min + r.step.by / 2, '3', null, NaN]) assert.equal(LL.judge(r, v), null, `${where}: ${v} is not a plan`);
    }
    for (const v of all) {
      const res = LL.judge(r, v); judged++;
      const right = r.input === 'tiles' ? r.opts[v].t === want : near(v, want);
      assert.equal(res.ok, right, `${where}: plan ${v} is ${right ? 'right' : 'wrong'}`);
      if (right) { assert.deepEqual(res, { ok: true }); continue; }
      wrongs++;
      // a wrong plan: one or two of the game's own lines, and a picture of what the plan really gives
      assert.ok(res.lines.length >= 1 && res.lines.length <= 2, where);
      for (const [k, x] of res.lines) {
        assert.ok(T[k] !== undefined && /\.hint\./.test(k), `${where}: ${k}`);
        for (const ph of T[k].match(/\{\w+\}/g) || []) assert.match(String(x[ph.slice(1, -1)]), /^\d+(\.\d+)?$/, `${where}: ${k} ${ph} is a number`);
        if (HINTS[k]) assert.ok(HINTS[k](x, v, r), `${where}: plan ${v}: "${say(k, x)}" is what the plan really gives`);
        assert.doesNotMatch(say(k, x), /\b1 (meters|probes|drops|bins|landings)\b|undefined|NaN/, `${where}: ${say(k, x)}`);
      }
      assert.deepEqual(res.draw, LL.view(r, 'try', v), where);
      assert.ok(res.draw.parts.length === 1 && res.draw.lines.length >= 1 && res.draw.lines.length <= 2, `${where}: the plan's own picture, with a line that names what went wrong`);
      assert.notDeepEqual(res.draw, r.pic.ask, `${where}: plan ${v} changes the board`); assert.notDeepEqual(res.draw, r.pic.found, `${where}: plan ${v} is not drawn as the answer`);
      const part = res.draw.parts[0], p = r.p, line0 = typeof res.draw.lines[0] === 'string' ? res.draw.lines[0] : '';
      // the numbers of the picture are the plan's own outcome
      if (r.kind === 'median') { const mk = part.rows[0].marks[0]; assert.deepEqual([mk.v, mk.tone], [v, 'warn']); assert.deepEqual(res.draw.lines[0], ['show.sides', { a: p.vals.filter(y => y < v).length, b: p.vals.filter(y => y > v).length }], where); }
      if (r.kind === 'mean') assert.equal(line0, `${p.n} × ${v} = ${p.n * v} ≠ ${sum(p.vals)}`, where);
      if (r.kind === 'iqr') assert.deepEqual([part.span.a, part.span.b, part.span.tone], [p.five[1], p.five[1] + v, 'warn'], where);
      if (r.kind === 'mad') assert.equal(line0, `${p.n} × ${LL.nt(v)} = ${LL.nt(p.n * v)} ≠ ${p.t}`, where);
      if (r.kind === 'model') { assert.ok(near(part.plan, Math.round(v * p.bins * 100) / 100) && near(part.line.marks[0].v, v), `${where}: ${v} is drawn as ${v * p.bins} bins`); }
      if (r.kind === 'freq' || r.kind === 'sample' || r.kind === 'expect') { const tot = r.kind === 'expect' ? p.N : p.T; assert.match(line0, new RegExp(`^${v} ÷ ${tot} (= |≈ )`), where); assert.ok(line0.endsWith(` ≠ ${LL.nt(r.kind === 'expect' ? p.pr : p.c / p.N)}`), where); }
      if (r.kind === 'not') { assert.ok(near(part.segs[1].b - part.segs[1].a, v) && near(part.marks[0].v, p.pr + v), where); }
      if (r.kind === 'gap') { const sp = part.rows[1].span; assert.deepEqual([sp.a, sp.b, sp.tone], [median(p.rows[0]), median(p.rows[0]) + v, 'warn'], where); }
      if (r.kind === 'mads') { const sp = part.rows[1].span; assert.deepEqual([sp.a, sp.b, sp.steps], [p.a, p.a + v * p.s, v], where); }
      if (r.kind === 'predict') { assert.deepEqual([part.dot.x, part.dot.y, part.dot.tone], [p.x, v, 'warn'], where); assert.ok(!near(v, p.m * p.x + p.y0)); }
      if (r.kind === 'estimate') { const x = +r.opts[v].t; assert.equal(line0, `${r.opts[v].t} × ${p.N} = ${LL.nt(x * p.N)} ≠ ${p.counts[p.bin]}`, where); }
      if (r.kind === 'table') assert.equal(part.cells.length, r.opts[v].v === 'one' ? p.g : 1, where);
      if (r.kind === 'hist') { const counted = part.bins.filter(b => b.tone === 'warn').reduce((k, b) => k + b.n, 0); assert.equal(String(counted), r.opts[v].t, `${where}: the bars the tile counts are the ones drawn`); }
      if (r.kind === 'assoc') assert.equal(Math.sign(part.trend.m), { positive: 1, negative: -1, none: 0 }[r.opts[v].t], `${where}: the picked trend is drawn`);
      if (r.kind === 'outlier') assert.equal(part.ring.i, 'ABC'.indexOf(r.opts[v].v), where);
      if (r.kind === 'consistent') assert.equal(part.rows.filter(x => x.tone === 'warn').length, r.opts[v].v === 'same' ? 2 : 1, where);
      // the clock's plans, run: each picture holds what the plan really gives
      if (r.kind === 'rate') { assert.deepEqual([part.at.v, part.at.tone], [v, 'warn'], where); assert.match(line0, new RegExp(`^${v} ÷ ${p.t} (= |≈ )`), where); }
      if (r.kind === 'temp') { assert.deepEqual([part.end.v, part.from.v], [v, v - (p.a - p.c)], `${where}: the plan undone from its own end starts at ${v - p.a + p.c}`); assert.notEqual(part.from.v, p.s); assert.equal(part.hops[0].b - part.hops[0].a, p.a); assert.equal(part.hops[1].a - part.hops[1].b, p.c); }
      if (r.kind === 'undo') { assert.deepEqual(part.vals, [String(v), String(p.p * v), LL.nt(p.p * v + p.q)], `${where}: ${v} sent through the line`); assert.equal(line0, `${p.p} × ${v} + ${LL.nt(p.q)} = ${LL.nt(p.p * v + p.q)} ≠ ${LL.nt(p.r)}`); }
      if (r.kind === 'error') { const seg = part.segs[1]; assert.ok(near(seg.b - seg.a, p.r * v / 100) && seg.tone === 'warn', `${where}: ${v}% of the real length is drawn`); }
      if (r.kind === 'slope') { assert.deepEqual([part.trend.m, part.trend.b, part.dot.x, part.dot.y], [v, 0, p.a, v * p.a], `${where}: the wire at the plan's slope`); }
      if (r.kind === 'ladder') { assert.equal(part.lad.len, v); assert.ok(near(part.lad.up, v > p.b ? Math.sqrt(v * v - p.b * p.b) : 0), `${where}: the ladder reaches as high as it really does`); }
      if (r.kind === 'missing') { const row = part.rows[0]; assert.deepEqual(row.vals, sorted([...p.vals, v])); assert.deepEqual(row.ring, { v, tone: 'warn' }); assert.ok(near(row.marks[0].v, (sum(p.vals) + v) / 5), `${where}: the mean the plan's five really have`); }
    }
    // what is said when it is right is true: the numbers of the line are the numbers of the round
    for (const [k, v] of [...r.ask, ...r.said]) assert.doesNotMatch(say(k, v), /\b1 (meters|probes|drops|bins|landings)\b|undefined|NaN/, `${where}: ${say(k, v)}`);
    if (r.kind === 'median') { const [x] = r.said; assert.equal(x[1].m, want); assert.equal(sorted(r.p.vals)[x[1].k - 1], want, `${where}: probe ${x[1].k} in order is the middle one`); }
    if (r.kind === 'expect') { assert.notEqual(r.p.run, r.p.e, `${where}: the run comes out close to the model, not exactly`); assert.ok(Math.abs(r.p.run - r.p.e) <= 3); }
    // the clock's data, checked: a rational step on the way (a unit rate, a warming, a rational addend, a ratio) and a right triangle that is right
    if (r.kind === 'temp') { assert.ok(r.p.s < 0 && r.p.a > r.p.c, `${where}: below zero, and a net warming`); assert.ok(!Number.isInteger(r.p.w) || r.p.w === 2 || r.p.w === 3); }
    if (r.kind === 'ladder') assert.equal(r.p.a ** 2 + r.p.b ** 2, r.p.c ** 2, where);
    if (r.kind === 'missing') { assert.equal(mean([...r.p.vals, want]), r.p.m, `${where}: the five really have the mean the words give`); assert.notEqual(want, r.p.m); }
    // the found board carries the answer
    const found = JSON.stringify(r.pic.found);
    assert.ok(found.includes(r.input === 'tiles' ? (r.kind === 'assoc' ? `show.${r.p.kind}` : r.kind === 'consistent' || r.kind === 'outlier' ? '"ok"' : String(want)) : LL.nt(want)), `${where}: the found board shows ${want}`);
    seen.set(`${chapter}/${n}`, (seen.get(`${chapter}/${n}`) || new Set()).add(JSON.stringify(r.p)));
  }
  assert.ok(judged > 3000 && wrongs > 2700, `every plan of 350 rounds was judged (${judged}, ${wrongs} wrong)`);
  // a replay brings other numbers (every round has at least three versions in fourteen laps)
  for (const [k, v] of seen) assert.ok(v.size >= 3, `${k}: ${v.size} versions`);
  // The first lap, by its numbers: the unit's own examples.
  const first = c => Array.from({ length: ROUNDS_OF[c] }, (_, i) => i + 1).map(n => { const r = LL.round(c, n, 0); return r.input === 'tiles' ? r.opts[r.answer].t : `${r.answer} ${r.unit}`.trim(); });
  assert.deepEqual(first('spread'), ['14 m', '13 m', 'B', '5 m', '2 m', '12']);
  assert.deepEqual(first('chance'), ['0.3', '80', '0.35', '0.7', '1/6', '18']);
  assert.deepEqual(first('trend'), ['6 m', '3', '60', 'positive', 'B', '26 m']);
  assert.deepEqual(first('clock'), ['15 ml', '1 °', '6', '20 %', '1.5', '10 m', '15 m'], 'the Great Clock: the deck\'s own examples first');
  assert.equal(box(LL.round('clock', 1, 0).ask), 'Gear 1 of 7, the Ratio Gear. The clock\'s lantern burns 6 milliliters of oil every 4 hours. At that rate, how many milliliters does it burn in 10 hours?');
  assert.equal(box(LL.round('clock', 2, 0).ask), 'Gear 2 of 7, the Zero Gear. The cold store is at 6 below zero. It warms 2.5 degrees each hour for 4 hours, then cools 3 degrees. What is its temperature now?');
  assert.equal(box(LL.round('clock', 6, 0).ask), 'Gear 6 of 7, the Angle Gear. A ladder must reach the clock face, 8 meters up the tower wall. Its foot stands 6 meters out from the wall. How long is the ladder?');
  assert.deepEqual(LL.round('spread', 1, 0).pic.ask.parts[0].rows[0].vals, [11, 12, 12, 13, 14, 14, 14, 15, 17], 'the dot plot of the deck');
  assert.equal(box(LL.round('spread', 1, 0).ask), '9 probes landed on the test range. What is the median landing, in meters?');
  assert.equal(box(LL.round('chance', 2, 0).ask), 'In 50 drops, 20 landed in bin C. At that rate, how many of 200 drops would land in bin C?');
  assert.equal(box(LL.round('chance', 5, 0).ask), 'A probe goes left or right at the gate, then drops into bin 1, 2 or 3. Each way is equally likely. What is the probability of right, then bin 3?');
  assert.equal(box(LL.round('trend', 6, 0).ask), 'The trend line goes through power 2, distance 8, and power 6, distance 20. Predict the distance for power 8.');
  // The slips the unit names, each answered by its own line.
  const hint = (c, n, v) => box(LL.judge(LL.round(c, n, 0), v).lines), tile = (c, n, t) => { const r = LL.round(c, n, 0); return box(r.hints[r.opts.findIndex(o => o.t === t)]); };
  assert.equal(hint('spread', 1, 15), 'Landings below 15 meters: 7. Above it: 1. The median has at most 4 on each side.');
  assert.equal(hint('spread', 2, 14), '5 probes at 14 meters each would add to 70. These add to 65.');
  assert.equal(tile('spread', 3, 'the same'), 'Both have a middle of 14 meters, but one spreads much wider than the other.');
  assert.equal(hint('spread', 4, 12), '12 is the range, from the lowest to the highest. The box holds only the middle half.');
  assert.equal(hint('spread', 5, 8 / 4 + 0.5), 'A mean distance of 2.5 for 4 probes makes 10 in all. The distances add to 8.');
  assert.equal(tile('spread', 6, '17'), 'That counts the 15 to 19 bar too. Those probes landed under 20 meters.');
  assert.equal(hint('chance', 1, 0.4), 'A probability of 0.4 would mean 4 of the 10 bins. Stars mark 3.');
  assert.equal(tile('chance', 3, '0.25'), 'That treats the four bins as equally likely: 10 drops in each. This bin got 14 of the 40.');
  assert.equal(tile('chance', 3, '0.14'), 'That writes the count as a decimal. It was 14 out of 40 drops.');
  assert.equal(hint('chance', 4, 0.3), '0.3 is the chance of a star bin. The chance of no star is the rest of the way to 1.');
  assert.equal(tile('chance', 5, '1/5'), 'That adds the ways: 2 + 3 is 5. The table holds 6 outcomes.');
  assert.equal(hint('chance', 6, 20), '20 of 60 drops is a rate of about 0.33. The model says 0.3.');
  assert.equal(hint('trend', 2, 6), '6 is the gap in meters. How many deviations of 2 meters fit in it?');
  assert.equal(hint('trend', 3, 70), '70 out of 300 is a rate of about 0.23. The sample had 4 out of 20, a rate of 0.2.');
  assert.equal(tile('trend', 4, 'none'), 'There is a pattern: from left to right, the points go up.');
  assert.equal(hint('trend', 6, 27), 'From power 2 to power 6, the line rises 12 meters. Keep going to power 8.');
  assert.equal(hint('clock', 1, 12), 'That adds 6 more milliliters for 6 more hours. The oil goes up by 1.5 for each hour.');
  assert.equal(hint('clock', 1, 16), 'A plan of 16 in 10 hours is 1.6 an hour. The lantern burns 6 in 4 hours, 1.5 an hour.');
  assert.equal(hint('clock', 2, 4), 'That is after the warming only. Then it cools 3 degrees.');
  assert.equal(hint('clock', 2, 2), 'Ending at 2 above zero means a rise of 8 from the start. Warming 10 degrees and cooling 3 is a rise of 7.');
  assert.equal(hint('clock', 2, -8), 'Ending at 8 below zero means a drop of 2 from the start. Warming 10 degrees and cooling 3 is a rise of 7.');
  assert.equal(hint('clock', 3, 7), '7 × 3 is 21, and 21 + 5 is 26. The machine gave 23.');
  assert.equal(hint('clock', 4, 25), 'That compares the error with the survey\'s 48 meters. Percent error compares it with the real 60.');
  assert.equal(hint('clock', 5, 2), 'A rise of 2 for each 1 across reaches 8 up at 4 across. The platform is 6 up.');
  assert.equal(hint('clock', 6, 14), 'That adds the two sides. Square them and add, then find the square root.');
  assert.equal(hint('clock', 6, 11), 'A ladder of length 11 from 6 meters out reaches about 9.22 meters up. The clock face is 8 meters up.');
  assert.equal(hint('clock', 7, 14), 'That is the mean itself. The five landings must add to 70.');
  // A number on the stepper is never drawn on the board before it is run: the board as asked does not change with it.
  for (const chapter of CHAPTERS) for (let n = 1; n <= ROUNDS_OF[chapter]; n++) { const r = LL.round(chapter, n, 0); if (r.input === 'step') for (const v of plans(r)) assert.deepEqual(LL.view(r, 'ask', v), r.pic.ask, `${chapter} ${n}: the board as asked does not change with the stepper`); }
  // Lesson parameters.
  assert.deepEqual(LL.params({ chapter: 'chance', lock: 1 }), { chapter: 'chance', lock: true }); assert.deepEqual(LL.params({ chapter: 'chance' }), { chapter: 'chance', lock: false });
  assert.deepEqual(LL.params({ chapter: 'clock', lock: 1 }), { chapter: 'clock', lock: true }, 'the finale chapter'); assert.deepEqual(LL.params({ chapter: 'gate', lock: 1 }), { chapter: '', lock: false }); assert.deepEqual(LL.params(null), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the words box prints the signs; nothing is bought, sold, bet or won', () => {
  assert.ok(lines.TTS_GAMES.has('launch-lab'));
  const ok = text => lines.allowedLine('launch-lab', 'en', text);
  const NUMS = Object.fromEntries('abcdeghkmnpqrstwxy'.split('').map((k, i) => [k, i + 2]));
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 147, 'the 96 lines of the three teaching chapters and the 51 of the Great Clock');
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket, no unit short form
    assert.doesNotMatch(T[k].replace(/\{\w+\}/g, '0'), /[−+×÷=<>≤≥≠|°()/\\^²→%★≈]|-\d|\b(km|cm|m|L|h|P|MAD|IQR)\b/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 24, `${k} is short enough to hear: ${T[k]}`);
  }
  // a decimal goes where a number goes; a word never does, and neither does a sign
  assert.ok(ok('Yes! 20 out of 50 is a rate of 0.4, and 0.4 times 200 is 80.')); assert.ok(ok('Yes! A probe lands in a star bin or it does not, so 1 minus 0.3 is 0.7.'));
  assert.equal(ok('Yes! 20 out of 50 is a rate of four, and 0.4 times 200 is 80.'), null); assert.equal(ok('A probability of -0.4 would mean 4 of the 10 bins. Stars mark 3.'), null);
  assert.equal(ok('In 50 drops, 20 landed in bin C. Place a bet on bin C.'), null, 'only the game’s own lines');
  // what the chip and the board show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('Spread Test'), null); assert.equal(ok('P(★) = ?'), null); assert.equal(ok('1/6'), null);
  // The words box prints a spoken line with its signs, and leaves the rest as words.
  const PRINT = [['Yes! The landings add to 65, and 65 divided by 5 is 13 meters.', 'Yes! The landings add to 65, and 65 ÷ 5 is 13 meters.'], ['Yes! 20 out of 50 is a rate of 0.4, and 0.4 times 200 is 80.', 'Yes! 20 out of 50 is a rate of 0.4, and 0.4 × 200 is 80.'],
    ['Yes! A probe lands in a star bin or it does not, so 1 minus 0.3 is 0.7.', 'Yes! A probe lands in a star bin or it does not, so 1 − 0.3 is 0.7.'], ['Yes! 6 plus 4 plus 2 is 12 probes.', 'Yes! 6 + 4 + 2 is 12 probes.'],
    ['That counts the 20 to 24 bar only. The bars after it are farther still.', 'That counts the 20 to 24 bar only. The bars after it are farther still.'], ['Yes! 2 ways at the gate times 3 bins is 6 equally likely outcomes, and this is 1 of them.', 'Yes! 2 ways at the gate times 3 bins is 6 equally likely outcomes, and this is 1 of them.']];
  for (const [said, shown] of PRINT) assert.equal(LL.shown(said), shown);
  for (const [, shown] of PRINT.filter(x => /\d (×|÷) \d/.test(x[1]))) assert.match(sayMath(shown).toLowerCase(), /times|divided by/, `the deck would say "${shown}" in words too`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const k of ['show.x.power', 'show.x.mass', 'show.x.order', 'show.y', 'show.up', 'show.down', 'show.none', 'show.notfit.up', 'show.notfit.down', 'show.notfit.none']) assert.ok(T[k], k);
  assert.deepEqual([T['ch.spread'], T['ch.chance'], T['ch.trend'], T['ch.clock'], T.title], ['Spread Test', 'Drop Tower', 'Trend Watch', 'The Great Clock', 'Launch Lab']);
  for (let n = 1; n <= 7; n++) assert.match(T[`g.gear.${n}`], new RegExp(`^Gear ${n} of 7, the (Ratio|Zero|Variable|Scale|Slope|Angle|Chance) Gear\\.$`));
  for (const k of ['start.clock', 'win.clock', 'win.clock.title', 'show.hours', 'show.ml', 'show.x.across', 'show.y.up', 'show.fifth', 'show.in', 'show.out', 'show.clock.idle']) assert.ok(T[k], k);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule)
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|kilometres?|centimetres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, and chance is never a wager: no bet, no stake, no prize; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|tax|tips?|markups?|discount|interest|commission|coins?|dollars?|cents?|market)\b/i;
  const WAGER = /\b(bets?|betting|wagers?|gambl\w*|casino|lottery|jackpot|odds|stakes?|prizes?|win money|loot|raffle|dice|cards?|poker|roulette|slot machines?)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a test range, not a shop: ${text}`); assert.doesNotMatch(text, WAGER, `chance without a wager: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes.replace(/nothing is priced, bought, sold, bet or won, and chance is never a wager/, ''), SHOP);
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes.replace(/nothing is priced, bought, sold, bet or won, and chance is never a wager/, ''), WAGER);
  // kind: nothing is hunted, fought or guarded; a launcher sends probes, it never fires or shoots
  for (const text of [...Object.values(T), META.description, META.tags]) assert.doesNotMatch(text, /\b(sword|arrow|bow|fight|battle|attack|enemy|enemies|guard|war|hunt|weapon|spy|shoot|shots?|fire|fires|fired|missile|rocket fire|target|blast|explode|bomb)\b/i, text);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
  // the public listing never names the tier it was built for
  for (const text of [META.title, META.description, META.tags]) assert.doesNotMatch(text, /\bpro\b|towers|number quest/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches (the finale too)', () => {
  assert.ok(SEED_GAMES.includes('launch-lab'));
  assert.equal(META.slug, 'launch-lab'); assert.equal(META.title, 'Launch Lab'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['launch-lab'], { subject: 'math', from: 6, to: 8 }, 'on the Learn shelf as math for grades 6 to 8');
  for (const f of ['public/covers/launch-lab.jpg', 'public/og/launch-lab.jpg', 'scripts/covers/launch-lab.recipe.js', 'public/img/nq/launch-lab/spread-test.webp', 'public/img/nq/launch-lab/drop-tower.webp', 'public/img/nq/launch-lab/trend-watch.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'launch-lab'), { slug: 'launch-lab', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('launch-lab'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.LAB_CHAPTERS, { spread: ['6.SP.A.3', '6.SP.B.4', '6.SP.B.5', '6.SP.A.2'], chance: ['7.SP.C.5', '7.SP.C.6', '7.SP.C.7', '7.SP.C.8'], trend: ['7.SP.B.4', '8.SP.A.1', '7.SP.B.3', '7.SP.A.2', '8.SP.A.2'],
    clock: ['7.EE.B.3', '6.RP.A.3b', '7.NS.A.3', '7.EE.B.4a', '7.RP.A.3', '8.EE.B.5', '8.G.B.7', '6.SP.B.5'] });
  // the game's own library tags are its three teaching chapters' codes; the finale's are credited only to a step locked to it
  assert.deepEqual(TAGS.gameCodes('launch-lab', 'ccss-math'), [...TAGS.LAB_CHAPTERS.spread, ...TAGS.LAB_CHAPTERS.chance, ...TAGS.LAB_CHAPTERS.trend]);
  assert.ok(TAGS.LEVELLED.includes('launch-lab'));
  assert.equal(UNIT.title, 'The Test Range'); assert.equal(UNIT.stamp, 'Chance Gear'); assert.equal(UNIT.tool, 'launch-lab'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 4); assert.match(UNIT.teacherNotes[3], /^The Great Clock \(7\.4\) is the tier's finale/); assert.ok(UNITS.tiers.pro.stones.includes('Chance Gear')); assert.equal(UNITS.tiers.pro.status, 'open', 'the grades 6-8 street is open to everyone (2026-11-15)');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['7.1', 20, 'Center and spread'], ['7.2', 21, 'Chance: experiments and models'], ['7.3', 22, 'Compare two data sets and spot a trend'], ['7.4', 23, 'The Great Clock']]);
  // The finale is built: step 7.4 is an ordinary fourth step, as Launchpad's is, named by the tier's finale line.
  const fin = UNIT.steps.find(s => s.n === '7.4');
  assert.deepEqual([fin.planned, fin.reserved, fin.titles.pro, UNITS.tiers.pro.finale], [undefined, undefined, 'The Great Clock', '7.4']);
  assert.deepEqual(fin.standards.pro.primary, ['7.EE.B.3']); assert.deepEqual(fin.standards.pro.also, ['6.RP.A.3b', '7.NS.A.3', '7.EE.B.4a', '7.RP.A.3', '8.EE.B.5', '8.G.B.7', '6.SP.B.5'], 'one also-covers code from each unit');
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.LAB_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(s.planned, undefined); assert.equal(g.slug, 'launch-lab'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(LL.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '7', '8', '']) assert.deepEqual(TAGS.stepGameCodes('launch-lab', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('launch-lab', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('launch-lab', 'ccss-math', '6', ''), ['6.SP.A.3', '6.SP.B.4', '6.SP.B.5', '6.SP.A.2'], 'an unlocked grade 6 step claims the grade 6 codes only');
  assert.deepEqual(TAGS.stepGameCodes('launch-lab', 'ccss-math', '8', ''), ['8.SP.A.1', '8.SP.A.2'], 'and a grade 8 step the grade 8 ones');
  // the decks and the check: the four decks send the learner to the step's own chapter, and every check item keys one of its step's primary codes
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u7-pro.json'), 'utf8'));
  assert.equal(set.items.length, 12);
  STEPS.forEach((s, i) => {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, `seed-lessons/number-quest/course/pro/${s.n}.json`), 'utf8'));
    assert.deepEqual(deck.game, { slug: 'launch-lab', chapter: T[`ch.${CHAPTERS[i]}`], params: `chapter=${CHAPTERS[i]}&lock=1` }); assert.equal(deck.title, s.titles.pro);
    const mine = set.items.filter(it => it.lesson === s.n);
    assert.deepEqual(mine.map(it => it.id), deck.check); assert.equal(mine.length, 3);
    for (const it of mine) { assert.ok(s.standards.pro.primary.includes(it.cat), `${it.id}: ${it.cat} is a primary code of ${s.n}`); assert.equal(it.choices.length, 4); assert.equal(it.misconceptions[it.answer], 'correct'); assert.equal(it.misconceptions.filter(m => m === 'correct').length, 1); }
  });
});

// The check items, each solved here from its own numbers: exactly one choice is right, and it is the key.
test('the twelve check items: each key is the one right choice, worked out from the numbers in the question', () => {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u7-pro.json'), 'utf8')), by = Object.fromEntries(set.items.map(it => [it.id, it]));
  const key = id => by[id].choices[by[id].answer];
  // 7.1: a median from an unordered list; an interquartile range from five numbers; a center against a spread
  let m = /landed at ([\d, and]+) meters/.exec(by['nq-pro-7.1-e1'].q); const land = m[1].match(/\d+/g).map(Number);
  assert.equal(land.length, 7); assert.equal(key('nq-pro-7.1-e1'), `${median(land)} m`);
  assert.ok(!by['nq-pro-7.1-e1'].choices.includes(`${LL.nt(mean(land))} m`), 'the mean is not offered, so the median is the only center');
  m = /lowest (\d+), lower quartile (\d+), median (\d+), upper quartile (\d+), highest (\d+)/.exec(by['nq-pro-7.1-e2'].q); assert.equal(key('nq-pro-7.1-e2'), `${m[4] - m[2]} m`);
  m = /median of (\d+) m and an interquartile range of (\d+) m\. Launcher B's have a median of (\d+) m and an interquartile range of (\d+) m/.exec(by['nq-pro-7.1-e3'].q);
  assert.equal(m[1], m[3], 'the same center'); assert.ok(+m[4] > +m[2]); assert.equal(key('nq-pro-7.1-e3'), "B's landings vary more than A's");
  // 7.2: unlikely is near 0 (and no probability is over 1); a prediction at the run's rate; a probability from equal bins
  const probs = by['nq-pro-7.2-e1'].choices.map(Number); assert.deepEqual(probs.filter(p => p > 0 && p < 0.5), [0.15]); assert.equal(key('nq-pro-7.2-e1'), '0.15');
  m = /dropped (\d+) times and landed in bin D (\d+) times\. About how many times would you expect bin D in (\d+) drops/.exec(by['nq-pro-7.2-e2'].q); assert.equal(key('nq-pro-7.2-e2'), String(m[2] / m[1] * m[3]));
  m = /has (\d+) equal bins: (\d+) red, (\d+) blue and (\d+) green/.exec(by['nq-pro-7.2-e3'].q); assert.equal(+m[2] + +m[3] + +m[4], +m[1]); assert.equal(key('nq-pro-7.2-e3'), frac(+m[3], +m[1]));
  // 7.3: means apart in deviations; a falling pattern; the point off the pattern
  m = /A: mean (\d+) m, mean absolute deviation (\d+) m\. Launcher B: mean (\d+) m, mean absolute deviation (\d+) m/.exec(by['nq-pro-7.3-e1'].q); assert.equal(m[2], m[4]); assert.equal(key('nq-pro-7.3-e1'), String((m[3] - m[1]) / m[2]));
  assert.match(by['nq-pro-7.3-e2'].q, /goes up, the distance goes down/); assert.equal(key('nq-pro-7.3-e2'), 'a negative association');
  const pts = [...by['nq-pro-7.3-e3'].q.matchAll(/\((\d+), (\d+)\)/g)].map(x => [+x[1], +x[2]]), f = fit(pts.filter(p => key('nq-pro-7.3-e3') !== `(${p[0]}, ${p[1]})`));
  const offs = pts.map(p => Math.abs(f.off(p))), worst = offs.indexOf(Math.max(...offs));
  assert.equal(key('nq-pro-7.3-e3'), `(${pts[worst][0]}, ${pts[worst][1]})`); assert.ok(offs.filter((o, i) => i !== worst).every(o => o < 1e-9), 'every other point is exactly on the pattern');
  // 7.4: a signed change in steps; a unit rate for a longer time; an equation undone (every one a multi-step problem)
  m = /at (−?\d+)°C\. It warms ([\d.]+)°C each minute for (\d+) minutes, then cools (\d+)°C/.exec(by['nq-pro-7.4-e1'].q); const t0 = +m[1].replace('−', '-');
  assert.equal(key('nq-pro-7.4-e1'), `${t0 + m[2] * m[3] - m[4]}°C`.replace('-', '−'));
  m = /burns (\d+) milliliters of oil in (\d+) hours\. At that rate, how many milliliters does it burn in (\d+) hours/.exec(by['nq-pro-7.4-e2'].q); assert.equal(key('nq-pro-7.4-e2'), `${m[1] / m[2] * m[3]} milliliters`);
  m = /multiplies a number by (\d+), then adds ([\d.]+)\. The number ([\d.]+) comes out/.exec(by['nq-pro-7.4-e3'].q); assert.equal(key('nq-pro-7.4-e3'), String((m[3] - m[2]) / m[1]));
  for (const it of set.items) assert.equal(new Set(it.choices).size, 4, `${it.id}: four different choices`);
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.LL_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
// lap: the lap the first play takes (0, the fixed lap, whose numbers the checks below know), or null for the
// random lap a play really takes.
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, lap = 0 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Launch Lab' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__ll.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 60_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
/** A wrong plan for a round: a wrong tile, or the stepper one step off the answer. */
const wrongOf = s => (s.input === 'tiles' ? s.choices.find(v => v !== s.answer) : s.answer + s.step.by <= s.step.max ? s.answer + s.step.by : s.answer - s.step.by);
/** What the stepper shows for a plan. */
const planText = (s, v) => LL.nt(v).replace('-', '−') + (s.unit ? (/^[°%]$/.test(s.unit) ? '' : ' ') + s.unit : '');
const CONTROLS = { tiles: ['ll-n0', 'll-n1', 'll-n2'], step: ['ll-dn', 'll-val', 'll-up', 'll-go'] };
/** Try a plan with the real controls: the handle sets the plan, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#ll-n' + v);
  await g.frame.evaluate(x => window.__ll.act('set', x), v); return go('#ll-go');
}

for (const chapter of CHAPTERS) {
  const RN = ROUNDS_OF[chapter];
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it gives and does not advance, ${RN} right rounds post game over once`, { skip, timeout: 900_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1`, lap: null });   // the lap a real play takes
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'rogue']);
    assert.deepEqual(await ids(frame, '#card .ll-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T[chapter === 'clock' ? 'start.clock' : 'start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__ll.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, RN], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-spread, #ch-chance, #ch-trend, #ch-clock, #menu').length), 0);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#dots i').length), RN, `${RN} round dots`);
    await until(() => window.__ll.state().moving === 0, null, 180_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__ll.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= RN; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      if (round === 1) { assert.ok(Number.isInteger(s.lap) && s.lap >= 1, 'a play takes a random lap, not the fixed lap 0'); g.lap1 = s.lap; } else assert.equal(s.lap, g.lap1, 'one lap for the whole play');
      const want = LL.round(chapter, round, s.lap);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      assert.equal(await text(frame, '#askt'), box(s.ask), `round ${round}: the instruction`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, pods: round - 1 }, `round ${round}: the board, and ${round - 1} pods on the rack`);
      // the controls: a stepper and Run, or three tiles
      assert.deepEqual(await ids(frame, '#bar > *'), CONTROLS[s.input], `round ${round}: the controls`);
      if (s.input === 'step') {
        assert.equal(s.value, s.step.start); assert.equal(await text(frame, '#ll-val'), planText(s, s.step.start), `round ${round}: the stepper starts at ${s.step.start}`);
        assert.equal(await text(frame, '#ll-go .l'), 'Run');
      } else assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .ll-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the board showing what the plan gives, the same round, nothing reported
      const wrong = wrongOf(s), verdict = LL.judge(s, wrong);
      assert.equal(verdict.ok, false);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the board shows what it gives`);
      assert.deepEqual(after.tried, verdict.draw, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.ll-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.pods, round - 1, `round ${round}: no pod for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input === 'step') {
        // a new plan takes the board back to the question
        await frame.click('#ll-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried], ['ask', null], `round ${round}: changing the plan makes a new plan`);
        assert.ok(Math.abs(again.value - (wrong - s.step.by)) < 1e-9, `round ${round}: one press down`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__ll.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .ll-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .ll-askt'), T[chapter === 'clock' ? 'win.clock' : 'win.card']);
    assert.equal(s.deck, RN, chapter === 'clock' ? 'all seven gears are in the clock' : 'six pods on the rack');
    if (chapter === 'clock') assert.equal(await text(frame, '#card h1'), 'The clock runs!');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('launch-lab', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=<>≥²%★≈]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__ll.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.ok(s.lap >= 1 && s.lap !== g.lap1, 'Play again takes another lap'); assert.deepEqual(Object.fromEntries(Object.keys(LL.round(chapter, 1, s.lap)).map(k => [k, s[k]])), LL.round(chapter, 1, s.lap), 'the next lap’s first round');
    assert.equal(s.onStage.pods, 0, 'the rack is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}


test('no parameters: a menu of the four chapters; at the game’s own speed the real buttons set a plan, a wrong plan is run and drawn, a right one sets a pod and only then the next round', { skip, timeout: 900_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .ll-menu .ll-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-spread', 'Spread Test'], ['ch-chance', 'Drop Tower'], ['ch-trend', 'Trend Watch'], ['ch-clock', 'The Great Clock']]);
  await g.shot('menu');
  // Spread Test, round 1 (nine landings, the median 14 m), with nothing hurried and the real buttons
  await frame.click('#ch-spread');
  await until(() => window.__ll.state().screen === 'play' && window.__ll.state().moving === 0, null, 180_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.onStage.pods], ['spread', false, 'median', 'ask', 10, 0]);
  // three presses: 13 m on the stepper, and the board still shows only the question
  for (let i = 0; i < 3; i++) await frame.click('#ll-up');
  assert.equal(await text(frame, '#ll-val'), '13 m'); assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried], [13, 'ask', null]);
  await frame.click('#ll-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', 'Landings below 13 meters: 3. Above it: 5. The median has at most 4 on each side.']);
  assert.deepEqual((await state()).tried.parts[0].rows[0].marks, [{ v: 13, t: '13 m', tone: 'warn' }], 'the board draws the plan as a line at 13 m, with 5 landings past it');
  await until(() => window.__ll.state().moving === 0, null, 180_000);   // the probe has flown and the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('spread-tried');
  // one more press is a new plan (the board goes back to the question), and it is the right one
  await frame.click('#ll-up');
  assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried, await text(frame, '#hint')], [14, 'ask', null, null]);
  await frame.click('#ll-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), 'median = 14 m'); assert.equal(await text(frame, '#askt'), 'Yes! In order, probe 5 of 9 is the middle one. It landed at 14 meters.');
  await frame.click('#ll-up'); await frame.click('#ll-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', 14]);
  assert.equal(s.onStage.pods, 1, 'the pod is on its way');
  await g.shot('spread-found');
  await until(() => window.__ll.state().round === 2, null, 240_000);
  assert.deepEqual([(await state()).onStage.pods, (await state()).mode], [1, 'ask'], 'one pod on the rack, and the next board');
  // back at the menu after the whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__ll.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__ll.state().round === n && window.__ll.state().phase === 'play', r); await frame.evaluate(() => window.__ll.act('solve')); }
  await until(() => window.__ll.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .ll-btn'), ['again', 'menu'], 'unlocked: play again, or more tests');
  await frame.click('#menu');
  await until(() => window.__ll.state().screen === 'menu');
  assert.match(await text(frame, '#ch-spread .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-chance .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, phones and reduced motion: every control is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the helper', { skip, timeout: 1_500_000 }, async () => {
  // Keyboard only, Drop Tower: Tab to Start, Enter; arrows move the stepper, Enter runs the plan; 1 to 3 pick a tile.
  const k = await open({ params: 'chapter=chance&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__ll.state().screen === 'play');
  await k.frame.evaluate(() => { window.__ll.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 4; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#ll-val'), '0.4', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'A probability of 0.4 would mean 4 of the 10 bins. Stars mark 3.', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 3; i++) await k.p.keyboard.press(i % 2 ? '=' : 'ArrowRight');
  for (let i = 0; i < 4; i++) await k.p.keyboard.press(i % 2 ? 'ArrowDown' : '-');
  assert.equal(await text(k.frame, '#ll-val'), '0.3');
  await k.frame.focus('#ll-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__ll.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'll-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#ll-dn'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'll-up', 'Tab walks the buttons in order');
  await k.p.keyboard.press('Enter'); assert.equal((await k.state()).value, 10, 'Enter on a stepper button presses it, and does not run the plan'); assert.equal((await k.state()).mode, 'ask');
  await k.frame.evaluate(() => { window.__ll.act('solve'); });
  await k.until(() => window.__ll.state().round === 3 && window.__ll.state().phase === 'play');
  await k.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  const s3 = await k.state(), miss = s3.choices.find(v => v !== s3.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(LL.judge(s3, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s3.answer + 1));
  await k.until(() => window.__ll.state().round === 4);
  for (const r of [4, 5, 6]) { await k.until(n => window.__ll.state().round === n && window.__ll.state().phase === 'play', r); await k.frame.evaluate(() => { window.__ll.act('solve'); }); }
  await k.until(() => window.__ll.state().screen === 'end');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart and their words fit inside them; the board is wide, keeps its 4 by 3 shape (so it faces the player), sits
  // between the words and the controls with nothing of the base in front of it, and the helper and the rack
  // never cover any of it; the smallest number or word on it is big enough to read, as asked and with a wrong plan drawn on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 12], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__ll.state().screen === 'play');
      await m.frame.evaluate(() => window.__ll.fast());
      for (let round = 1; round <= ROUNDS_OF[chapter]; round++) {
        await m.until(r => window.__ll.state().round === r && window.__ll.state().phase === 'play' && window.__ll.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), kids = [...document.querySelectorAll('#bar > *')], bs = kids.map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__ll.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
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
        // every wrong plan a tile can make, or two the stepper can, drawn on the board and held to the same
        const tries = st.input === 'tiles' ? st.choices.filter(v => v !== st.answer) : [wrongOf(st), st.step.max === st.answer ? st.step.min : st.step.max];
        for (const v of tries) {
          await tryPlan(m, st, v, touch);
          fit = await measure();
          assert.equal((await m.state()).mode, 'hint', where); assert.ok(fit.read >= small, `${where}: the smallest mark of a wrong plan's picture is ${fit.read} px (at least ${small})`);
          assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden, fit.inside, fit.spill], [true, true, true, false, true, 0], `${where}: the board with a wrong plan on it`);
        }
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.ll-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__ll.act('solve'));
      }
      await m.until(() => window.__ll.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});

