// Keep Builder (seed-games/keep-builder.html): Number Quest Pro Unit 6's game (The Drafting Keep, grades 6-8), a Kit 2
// (Oomba3D) castle courtyard at sunset where a keep is being built, with the builder's plan on a board. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Castle Quest at sunset
//     (Balance Bridge plays the same world by day), and it has no timer, no lives, no losing, no shop and nothing that hurts;
//   - its rounds (the pure block between keep-builder:begin and keep-builder:end): six a chapter, every answer worked
//     out again here from the words the round asks with and the numbers on the board as asked (never from the game's
//     own answer), every plan a player can make judged (every tile, every number the stepper can stand on), every
//     wrong plan answered with the game's own lines and a picture whose numbers are what that plan really gives; the
//     same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the words box prints the signs, what the chip and the board show and the button labels are never sent
//     to be spoken, and nothing is bought or sold;
//   - its registration: seeded, on the Learn shelf for grades 6 to 8, in the Number Quest course, tagged chapter by
//     chapter with the codes units.json gives the three steps, and its lesson parameters survive the play-params
//     grammar; and the unit's nine check items, each key worked out from the numbers in its question;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one sets a stone on the keep, and six right rounds post the game-over message exactly once, not before;
//     then the menu with no parameters, a round at the game's own speed with the real stepper buttons, the keyboard, a
//     desktop, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. KB_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/keep-builder.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/keep-builder.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 6), STEPS = UNIT.steps;
const CHAPTERS = ['build', 'move', 'span'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const KB = (() => {
  const box = {}; vm.runInNewContext(/\/\* keep-builder:begin \*\/([\s\S]*?)\/\* keep-builder:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.KeepBuilder;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS }), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), view: (r, m, v) => plain(G.view(r, m, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), nt: v => G.nt(v) };
})();
const T = lines.readGame('keep-builder').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const printed = l => (typeof l === 'string' ? l : KB.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const sq = n => n * n;
const PLURAL = /(?<![\d.])1 (meters|crates|degrees|faces|kilometers|units)\b/;
/** Every plan a player can make in a round: each tile, or each number the stepper can stand on. */
function plans(r) {
  if (r.input === 'tiles') return r.choices;
  const out = []; for (let i = 0; r.step.min + i * r.step.by <= r.step.max + 1e-9; i++) out.push(Math.round((r.step.min + i * r.step.by) * 1000) / 1000);
  return out;
}
/** A move's rule, read from what its tile says, applied to one point (written here, apart from the game's own rules). */
function ruleOf(t) {
  let m;
  if ((m = /^\(x ([+−]) (\d+), y ([+−]) (\d+)\)$/.exec(t))) { const dx = (m[1] === '+' ? 1 : -1) * m[2], dy = (m[3] === '+' ? 1 : -1) * m[4]; return ([x, y]) => [x + dx, y + dy]; }
  const table = { '(−x, y)': ([x, y]) => [-x, y], '(x, −y)': ([x, y]) => [x, -y], '(−x, −y)': ([x, y]) => [-x, -y],
    '90° counterclockwise': ([x, y]) => [-y, x], '90° clockwise': ([x, y]) => [y, -x], '180°': ([x, y]) => [-x, -y] };
  assert.ok(table[t], `a move reads "${t}"`); return table[t];
}
const samePts = (a, b) => a.length === b.length && a.every((p, i) => near(p[0], b[i][0]) && near(p[1], b[i][1]));
/** The answer of a round, worked out here from the words it asks with (and, where the question is a picture, from
 *  the numbers on the board as asked): never from the game's own answer. A number for a stepper, the words on the
 *  right tile for tiles. */
function solve(r) {
  const q = r.ask.map(l => say(l[0], l[1])).join(' '), g = re => { const m = re.exec(q); assert.ok(m, `${r.kind}: "${q}" reads as ${re}`); return m.slice(1).map(Number); };
  const part = r.pic.ask.parts[0];
  const one = (ok, what) => { const hits = r.opts.filter(ok); assert.equal(hits.length, 1, `${r.kind}: exactly one tile ${what} (${r.opts.map(o => o.t)})`); return hits[0].t; };
  switch (r.kind) {
    case 'crates': { const [l, w, h] = g(/is ([\d.]+) meters long, ([\d.]+) meters wide and ([\d.]+) meters high\. Crates are cubes half a meter/); return String((l / 0.5) * (w / 0.5) * (h / 0.5)); }
    case 'net': { const [l, w, h] = g(/a box (\d+) meters by (\d+) meters by (\d+) meters/); assert.deepEqual(part.faces.map(f => f[3]).sort((a, b) => a - b), [l * w, l * w, l * h, l * h, w * h, w * h].sort((a, b) => a - b), 'the net on the board has the box\'s six faces'); return 2 * (l * w + l * h + w * h); }
    case 'banner': { const [h, a, b] = g(/trapezoid, (\d+) meters tall\. Its top edge is (\d+) meters and its bottom edge is (\d+) meters/); return `${(a + b) / 2 * h} m²`; }
    case 'ramp': { const [l, b, h] = g(/prism, (\d+) meters long\. Its end is a right triangle (\d+) meters across and (\d+) meters high/); return `${b * h / 2 * l} m³`; }
    case 'cistern': { const [l, w, v] = g(/is ([\d.]+) meters long and ([\d.]+) meters wide\. It must hold ([\d.]+) cubic meters/); return v / (l * w); }
    case 'roof': { const [l, b, h, s] = g(/prism, (\d+) meters long\. .* Each triangle is (\d+) meters across and (\d+) meters high, with sloping sides of (\d+) meters/); assert.ok(near(sq(s), sq(b / 2) + sq(h)), 'the sloping sides fit the triangle'); return `${b * h + (2 * s + b) * l} m²`; }
    case 'beams': { const [a] = g(/One angle is (\d+) degrees/); return 180 - a; }
    case 'corner': { const [a] = g(/One is (\d+) degrees/); const x = 90 - a; return one(o => { const m = /^x(?: \+ (\d+))? = (\d+)$/.exec(o.t); assert.ok(m, o.t); return x + (m[1] ? +m[1] : 0) === +m[2]; }, 'holds for the other part of a square corner'); }
    case 'slide': case 'flip': case 'turn': { const stone = part.polys.find(p => p.tone === 'stone').pts, gap = part.polys.find(p => p.tone === 'gap').pts; return one(o => samePts(stone.map(ruleOf(o.t)), gap), 'moves the stone onto the gap'); }
    case 'grow': { const stone = part.polys.find(p => p.tone === 'stone').pts, gap = part.polys.find(p => p.tone === 'gap').pts; const k = gap[0][0] / stone[0][0]; assert.ok(samePts(stone.map(([x, y]) => [x * k, y * k]), gap), 'the gap is the window times one factor from the origin'); return k; }
    case 'ladder': { const [h, f] = g(/wall is (\d+) meters high\. The ladder's foot stands (\d+) meters out/); return Math.sqrt(sq(f) + sq(h)); }
    case 'plank': { const [c, h] = g(/is (\d+) meters long\. Its top rests on a ledge (\d+) meters high/); return Math.sqrt(sq(c) - sq(h)); }
    case 'rope': { const [A, B] = part.pts; return Math.hypot(B.x - A.x, B.y - A.y); }
    case 'squares': { const [p, q2] = g(/areas of (\d+) and (\d+) square meters/); return String(p + q2); }
    case 'pole': { const [a, b, h] = g(/is ([\d.]+) meters by ([\d.]+) meters, and ([\d.]+) meters tall/); return `${KB.nt(Math.sqrt(sq(a) + sq(b) + sq(h)))} m`; }
    case 'corner3': return one(o => { const s = o.t.split(', ').map(x => parseFloat(x)).sort((a, b) => a - b); return s[0] + s[1] > s[2] && sq(s[0]) + sq(s[1]) === sq(s[2]); }, 'makes a square corner');
    default: assert.fail(`no solver for ${r.kind}`);
  }
}
/** A hint's own numbers, checked as arithmetic: the line says what the plan `v` really gives. */
const HINTS = {
  'b.hint.short': (x, v, r) => x.n === v && v < r.p.sa, 'b.hint.over': (x, v, r) => x.n === v && x.e === v - 2 * (r.p.l * r.p.w + r.p.l * r.p.h + r.p.w * r.p.h),
  'b.hint.inside': (x, v, r) => x.n === v && v === r.p.l * r.p.w * r.p.h, 'b.hint.three': (x, v, r) => x.n === v && v === r.p.l * r.p.w + r.p.l * r.p.h + r.p.w * r.p.h,
  'b.hint.cistern': (x, v, r) => +x.n === v && near(+x.a, r.p.l * r.p.w * v) && near(+x.b, r.p.l * r.p.w * r.p.h),
  'v.hint.bends': (x, v, r) => x.n === v && x.a === r.p.a && x.s === v + r.p.a && x.s !== 180, 'v.hint.across': (x, v, r) => x.n === v && v === r.p.a,
  's.hint.ladder': (x, v, r) => x.n === v && x.f === r.p.f && near(+x.t, Math.sqrt(sq(v) - sq(r.p.f)), 0.051) && x.h === r.p.h, 's.hint.flat': (x, v, r) => x.n === v && v <= r.p.f,
  's.hint.ramp': (x, v, r) => x.n === v && near(+x.t, Math.sqrt(sq(r.p.c) - sq(v)), 0.051) && x.h === r.p.h, 's.hint.toofar': (x, v, r) => x.n === v && v >= r.p.c,
  's.hint.added': (x, v) => x.a + x.b === v, 's.hint.minus': (x, v) => x.a - x.b === v, 's.hint.grid': (x, v) => x.a + x.b === v,
  's.hint.short': (x, v, r) => x.n === v && v < Math.hypot(r.p.dx, r.p.dy), 's.hint.past': (x, v, r) => x.n === v && v > Math.hypot(r.p.dx, r.p.dy),
  's.hint.notsquare': x => x.s === sq(x.a) + sq(x.b) && x.t === sq(x.c) && x.s !== x.t,
};

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the world is a castle courtyard at sunset', () => {
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
  // the newest Castle Quest, at sunset: the world Balance Bridge plays by day, so the two never look alike
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/castle-quest')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.ok(HTML.includes(`start({ theme: 'castle-quest', version: '${shipped.at(-1)}', graphics: 'auto', time: 'sunset', outline: true, settings: true })`), 'the newest shipped Castle Quest, at sunset');
  assert.match(fs.readFileSync(path.join(ROOT, 'seed-games/balance-bridge.html'), 'utf8'), /theme: 'castle-quest', version: '[\d.]+', graphics: 'auto', time: 'day'/, 'Balance Bridge is the same castle by day');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/themes/castle-quest/${shipped.at(-1)}/theme.json`), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Castle Quest has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/\['([a-z-]+)', -?[\d.]+, 0, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 30, `the courtyard is furnished from the theme (${used} pieces placed)`);
  for (const id of ['floor-stone', 'wall', 'castle-building', 'tower', 'stairs', 'block']) assert.ok(asked.includes(id), `the courtyard has the ${id}`);
  // nothing to collect, nothing to unlock and nothing that hurts: no coin, no chest, no key, no spikes; no animal
  for (const id of asked) assert.ok(!/^(coin|chest|key|spikes|feast)/.test(id), `${id}: no reward currency, no treasure, nothing that hurts`);
  assert.match(HTML, /g\.hero\('barbarian'/); assert.ok(theme.heroes.some(h => h.id === 'barbarian'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the builder back to standing
  // and two at the start: the loading screen's fallback wait for a first frame, and its removal after the fade
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 5);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable|prompt\(/, 'nothing is typed');
  assert.doesNotMatch(HTML, /physics\(|rapier3d-compat'\)|creature\(|school\(|g\.controls\(/, 'no physics, no animal and nothing to steer: nothing chases, bites or falls');
});

test('rounds: six a chapter, every answer worked out again from the words, every plan judged, every wrong plan shown as it really turns out, the first lap always the same', () => {
  assert.deepEqual(KB.CHAPTERS, CHAPTERS); assert.equal(KB.ROUNDS, 6);
  assert.equal(KB.round('nowhere', 1, 0), null); assert.equal(KB.round('move', 0, 0), null); assert.equal(KB.round('move', 7, 0), null);
  const kinds = { build: ['crates', 'net', 'banner', 'ramp', 'cistern', 'roof'], move: ['beams', 'corner', 'slide', 'flip', 'turn', 'grow'], span: ['ladder', 'plank', 'rope', 'squares', 'pole', 'corner3'] };
  const PARTS = ['box', 'floor', 'netbox', 'trap', 'prism', 'netroof', 'cross', 'corner', 'plane', 'lean', 'sqtri', 'tri3', 'beams3'];
  const seen = new Map();
  let judged = 0, wrongs = 0;
  for (const chapter of CHAPTERS) for (let lap = 0; lap < 14; lap++) for (let n = 1; n <= 6; n++) {
    const r = KB.round(chapter, n, lap), where = `${chapter} ${n} lap ${lap}`;
    assert.deepEqual(r, KB.round(chapter, n, lap), `${where}: the same round every time it is asked for`);
    assert.equal(r.kind, kinds[chapter][n - 1], where); assert.equal(r.chapter, chapter); assert.equal(r.n, n);
    assert.ok(r.input === 'tiles' || r.input === 'step', where);
    // the board as asked and as found are what view() draws, and each is one drawn part over lines
    assert.deepEqual(r.pic.ask, KB.view(r, 'ask', null), where); assert.deepEqual(r.pic.found, KB.view(r, 'found', null), where);
    for (const ov of [r.pic.ask, r.pic.found]) { assert.ok(ov.parts.length === 1 && PARTS.includes(ov.parts[0].k), where); assert.ok(ov.lines.length <= 2, `${where}: at most two lines of maths under the picture`); }
    // every line it asks, says or shows is one of the game's own, with a number in every place
    const allLines = [...r.ask, ...r.said, ...(Array.isArray(r.chip) ? [r.chip] : [])];
    for (const [k, v] of allLines) { assert.ok(T[k] !== undefined, `${where}: ${k}`); for (const ph of T[k].match(/\{\w+\}/g) || []) { const val = v[ph.slice(1, -1)]; assert.match(String(val), /^\d+(\.\d+)?$/, `${where}: ${k} ${ph} is a number (${val})`); } }
    const want = solve(r);
    const all = plans(r);
    if (r.input === 'tiles') {
      assert.equal(r.opts.length, 3, where); assert.equal(new Set(r.opts.map(o => o.t)).size, 3, `${where}: three different tiles (${r.opts.map(o => o.t)})`);
      assert.equal(r.opts[r.answer].t, want, `${where}: the right tile is the answer worked out from the words (${want})`);
      assert.deepEqual(Object.keys(r.hints).map(Number).sort(), r.choices.filter(i => i !== r.answer), `${where}: each wrong tile has its own hint`);
      assert.equal(new Set(Object.values(r.hints).map(h => JSON.stringify(h))).size, 2, `${where}: two different mistakes`);
    } else {
      assert.ok(near(r.answer, want), `${where}: the answer ${r.answer} is the one worked out from the words (${want})`);
      assert.ok(all.some(v => near(v, r.answer)), `${where}: the stepper can stand on the answer`);
      assert.ok(r.step.start !== r.answer && all.includes(r.step.start), `${where}: it starts on the stepper, and not on the answer`);
      assert.ok(Math.abs(r.answer - r.step.start) / r.step.by <= 10, `${where}: the answer is at most ten presses away`);
      assert.ok(['m', 'm²', '°', '×'].includes(r.unit), where);
      assert.equal(r.onBoard, false, `${where}: a number stays on the stepper until it is run`);
      for (const v of [r.step.min - r.step.by, r.step.max + r.step.by, r.step.min + r.step.by / 2, '3', null, NaN]) assert.equal(KB.judge(r, v), null, `${where}: ${v} is not a plan`);
      for (const v of all) assert.deepEqual(KB.view(r, 'ask', v), r.pic.ask, `${where}: the board as asked does not change with the stepper`);
    }
    for (const v of all) {
      const res = KB.judge(r, v); judged++;
      const right = r.input === 'tiles' ? r.opts[v].t === want : near(v, want);
      assert.equal(res.ok, right, `${where}: plan ${v} is ${right ? 'right' : 'wrong'}`);
      if (right) { assert.deepEqual(res, { ok: true }); continue; }
      wrongs++;
      // a wrong plan: one of the game's own lines, and a picture of what the plan really gives
      assert.ok(res.lines.length >= 1 && res.lines.length <= 2, where);
      for (const [k, x] of res.lines) {
        assert.ok(T[k] !== undefined && /\.hint\./.test(k), `${where}: ${k}`);
        for (const ph of T[k].match(/\{\w+\}/g) || []) assert.match(String(x[ph.slice(1, -1)]), /^\d+(\.\d+)?$/, `${where}: ${k} ${ph} is a number`);
        if (HINTS[k]) assert.ok(HINTS[k](x, v, r), `${where}: plan ${v}: "${say(k, x)}" is what the plan really gives`);
        assert.doesNotMatch(say(k, x), PLURAL, `${where}: ${say(k, x)}`);
      }
      assert.deepEqual(res.draw, KB.view(r, 'try', v), where);
      assert.ok(res.draw.parts.length === 1 && res.draw.lines.length >= 1 && res.draw.lines.length <= 2, `${where}: the plan's own picture, with a line that names what went wrong`);
      assert.notDeepEqual(res.draw, r.pic.ask, `${where}: plan ${v} changes the board`); assert.notDeepEqual(res.draw, r.pic.found, `${where}: plan ${v} is not drawn as the answer`);
      const part = res.draw.parts[0], p = r.p, tile = r.input === 'tiles' ? r.opts[v].t : null;
      // the numbers of the picture are the plan's own outcome
      if (r.kind === 'crates') assert.equal(part.cells.reduce((a, b) => a + b, 0), +tile, `${where}: ${tile} crates are laid on the floor`);
      if (r.kind === 'net') { const laid = part.fill.reduce((a, f, i) => a + f * part.faces[i][3], 0); assert.ok(near(laid, Math.min(v, p.sa), 1e-6) && part.spare === Math.max(0, v - p.sa), `${where}: ${v} m² of stone is laid face by face`); }
      if (r.kind === 'cistern') assert.equal(part.h, v, `${where}: the cistern drawn ${v} m tall`);
      if (r.kind === 'beams') assert.equal(part.b, p.a + v, `${where}: the beam turns to ${p.a + v}°`);
      if (r.kind === 'corner') { const m = /^x(?: \+ (\d+))? = (\d+)$/.exec(tile), x = +m[2] - (m[1] ? +m[1] : 0); assert.equal(part.wall, p.a + x, `${where}: x = ${x} puts the wall at ${p.a + x}°`); }
      if (r.kind === 'slide' || r.kind === 'flip' || r.kind === 'turn') { const img = part.polys.find(q => q.tone === 'warn').pts; assert.ok(samePts(img, p.piece.map(ruleOf(tile))) && !samePts(img, p.gap), `${where}: ${tile} puts the stone where its rule says, off the gap`); }
      if (r.kind === 'grow') { const img = part.polys.find(q => q.tone === 'warn').pts; assert.ok(samePts(img, p.piece.map(([x, y]) => [x * v, y * v])), `${where}: the copy at ${v}`); }
      if (r.kind === 'ladder') assert.ok(part.len === v && part.foot === p.f && near(part.top, v > p.f ? Math.sqrt(sq(v) - sq(p.f)) : 0), `${where}: a ${v} m ladder from ${p.f} m out`);
      if (r.kind === 'plank') assert.ok(part.len === p.c && part.foot === v && near(part.top, v < p.c ? Math.sqrt(sq(p.c) - sq(v)) : 0), `${where}: the plank with its foot ${v} m out`);
      if (r.kind === 'rope') { const s = part.segs[0]; assert.ok(near(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), v, 1e-6) && near((s.b[0] - p.A[0]) * (p.B[1] - p.A[1]), (s.b[1] - p.A[1]) * (p.B[0] - p.A[0]), 1e-6), `${where}: a rope of ${v} laid from A toward B`); }
      if (r.kind === 'squares') assert.ok(near(sq(part.cs), +tile), `${where}: a square of ${tile} has sides of ${part.cs}`);
      if (r.kind === 'corner3') { const s = tile.split(', ').map(x => parseFloat(x)); assert.deepEqual(part.sides, s); const ang = Math.acos((sq(s[0]) + sq(s[1]) - sq(s[2])) / (2 * s[0] * s[1])) * 180 / Math.PI; assert.equal(part.ang, `≈ ${Math.round(ang)}°`); assert.notEqual(Math.round(ang), 90, `${where}: clearly not a square corner`); }
    }
    // what is said when it is right is true: no "1 meters", nothing undefined
    for (const [k, v] of [...r.ask, ...r.said]) assert.doesNotMatch(say(k, v), new RegExp(PLURAL.source + '|undefined|NaN'), `${where}: ${say(k, v)}`);
    // the found board carries the answer
    const found = JSON.stringify(r.pic.found) + JSON.stringify(r.chipDone);
    if (['slide', 'flip', 'turn'].includes(r.kind)) assert.ok(samePts(r.pic.found.parts[0].polys.find(q => q.tone === 'ok').pts, r.p.gap), `${where}: the found board has the stone in the gap`);
    else { const shows = r.kind === 'corner' ? String(90 - r.p.a) : r.input === 'tiles' ? String(want).replace(/ (m|m²|m³)$/, '').split(' m, ')[0] : KB.nt(want); assert.ok(found.includes(shows), `${where}: the found board shows ${shows}`); }
    seen.set(`${chapter}/${n}`, (seen.get(`${chapter}/${n}`) || new Set()).add(JSON.stringify(r.p)));
  }
  assert.ok(judged > 3000 && wrongs > 2700, `every plan of 252 rounds was judged (${judged}, ${wrongs} wrong)`);
  // a replay brings other numbers (every round has at least three versions in fourteen laps)
  for (const [k, v] of seen) assert.ok(v.size >= 3, `${k}: ${v.size} versions`);
  // The first lap, by its numbers: the unit's own examples.
  const first = c => [1, 2, 3, 4, 5, 6].map(n => { const r = KB.round(c, n, 0); return r.input === 'tiles' ? r.opts[r.answer].t : `${r.answer} ${r.unit}`; });
  assert.deepEqual(first('build'), ['120', '32 m²', '12 m²', '30 m³', '3 m', '152 m²']);
  assert.deepEqual(first('move'), ['115 °', 'x + 35 = 90', '(x + 3, y + 4)', '(−x, y)', '90° counterclockwise', '2 ×']);
  assert.deepEqual(first('span'), ['5 m', '12 m', '5 m', '100', '13 m', '6 m, 8 m, 10 m']);
  assert.equal(box(KB.round('build', 1, 0).ask), 'The store room is 2.5 meters long, 3 meters wide and 2 meters high. Crates are cubes half a meter on each side. How many crates fill the room?');
  assert.equal(box(KB.round('move', 1, 0).ask), 'Two straight beams cross. One angle is 65°. What is the angle next to it?');
  assert.equal(box(KB.round('span', 1, 0).ask), 'The wall is 4 meters high. The ladder\'s foot stands 3 meters out. How long must it be to reach the top?');
  assert.deepEqual(KB.round('move', 3, 0).pic.ask.parts[0].polys.map(q => q.pts[0]), [[-2, -3], [1, 1]], 'the stone at (−2, −3) and its gap at (1, 1)');
  // The slips the unit names, each answered by its own line.
  const hint = (c, n, v) => box(KB.judge(KB.round(c, n, 0), v).lines), tile = (c, n, t) => { const r = KB.round(c, n, 0); return box(r.hints[r.opts.findIndex(o => o.t === t)]); };
  assert.equal(tile('build', 1, '15'), '15 is the room\'s volume in cubic meters. Each crate is only 1 eighth of a cubic meter.');
  assert.equal(hint('build', 2, 16), '16 covers only 3 faces. Each face has a twin on the other side of the box.');
  assert.equal(hint('build', 2, 12), '12 is the space inside, in cubic meters. Stone covers the outside: all 6 faces.');
  assert.equal(hint('build', 2, 34), 'Stone for 34 square meters covers the whole net and leaves 2 spare.');
  assert.equal(tile('build', 3, '18 m²'), 'That makes each side triangle a whole rectangle. A triangle is half of its rectangle.');
  assert.equal(tile('build', 4, '6 m³'), 'That is the area of one end only. The ramp goes back 5 meters.');
  assert.equal(hint('build', 5, 3.5), 'At a height of 3.5, the cistern holds 35 cubic meters. It must hold 30.');
  assert.equal(tile('build', 6, '128 m²'), 'That leaves out the two triangle ends of the roof.');
  assert.equal(hint('move', 1, 65), '65° is the angle across from it. The angle next to it makes a straight line with it.');
  assert.equal(hint('move', 1, 120), '120 and 65 make 185°, so that beam would bend. A straight line is 180°.');
  assert.equal(tile('move', 2, 'x = 35'), 'The two parts are not always equal. Together they make a square corner.');
  assert.equal(tile('move', 3, '(x + 4, y + 3)'), 'That swaps the two moves. The first number moves across, the second moves up or down.');
  assert.equal(tile('move', 4, '(−x, −y)'), 'Changing both signs turns the stone half way round the origin. That is a turn, not a flip.');
  assert.equal(hint('move', 6, 2.5), 'At a scale factor of 2.5, the copy comes out too big for the gap.');
  assert.equal(hint('span', 1, 7), 'That adds the two sides, 3 + 4. Square them, add the squares, then take the square root.');
  assert.equal(hint('span', 1, 6), 'A ladder of length 6, with its foot 3 meters out, reaches about 5.2 meters up. The wall is 4 meters.');
  assert.equal(hint('span', 2, 8), 'That takes 5 from 13. Subtract their squares instead, then find the square root.');
  assert.equal(hint('span', 3, 7), 'That walks along the grid lines, 3 across and 4 up or down. A rope goes straight.');
  assert.equal(tile('span', 4, '196'), 'That adds the two sides, 6 + 8, and then squares. Add the two areas instead.');
  assert.equal(tile('span', 5, '5 m'), 'That is the floor\'s diagonal only. Use it with the height in a second right triangle.');
  assert.equal(tile('span', 6, '5 m, 6 m, 7 m'), '5 squared plus 6 squared is 61, but 7 squared is 49. Those beams do not make a square corner.');
  // Lesson parameters.
  assert.deepEqual(KB.params({ chapter: 'move', lock: 1 }), { chapter: 'move', lock: true }); assert.deepEqual(KB.params({ chapter: 'move' }), { chapter: 'move', lock: false });
  assert.deepEqual(KB.params({ chapter: 'shop', lock: 1 }), { chapter: '', lock: false }); assert.deepEqual(KB.params(null), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the words box prints the signs; nothing is bought or sold', () => {
  assert.ok(lines.TTS_GAMES.has('keep-builder'));
  const ok = text => lines.allowedLine('keep-builder', 'en', text);
  const NUMS = Object.fromEntries('abcefhklnpqrstvw'.split('').map((k, i) => [k, i + 2]));
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 90);
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket, no unit short form
    assert.doesNotMatch(T[k].replace(/\{\w+\}/g, '0'), /[−+×÷=<>≤≥≠|°()/\\^²³√→%]|-\d|\b(km|cm|m|L|h)\b/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 24, `${k} is short enough to hear: ${T[k]}`);
  }
  // a decimal goes where a number goes; a word never does, and neither does a sign
  assert.ok(ok('At a height of 3.5, the cistern holds 35 cubic meters. It must hold 30.'));
  assert.equal(ok('At a height of three, the cistern holds 35 cubic meters. It must hold 30.'), null); assert.equal(ok('120 and -65 make 185 degrees, so that beam would bend. A straight line is 180 degrees.'), null);
  assert.equal(ok('Two straight beams cross. One angle is 65 degrees. Tell me a secret.'), null, 'only the game’s own lines');
  // what the chip and the board show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('Fill and Cover'), null); assert.equal(ok('(x + 3, y + 4)'), null); assert.equal(ok('3² + 4² = 5²'), null);
  // The words box prints a spoken line with its signs, and leaves the rest as words.
  const PRINT = [['Yes! Angles on a straight line make 180 degrees, and 180 minus 65 is 115.', 'Yes! Angles on a straight line make 180°, and 180 − 65 is 115.'], ['Yes! 5 crates across, 6 deep and 4 high. 5 times 6 times 4 is 120.', 'Yes! 5 crates across, 6 deep and 4 high. 5 × 6 × 4 is 120.'],
    ['Yes! 36 plus 64 is 100. The big square has sides of 10 meters.', 'Yes! 36 + 64 is 100. The big square has sides of 10 meters.'], ['Yes! 3 squared plus 4 squared is 9 plus 16, which is 25. The square root of 25 is 5.', 'Yes! 3 squared plus 4 squared is 9 + 16, which is 25. The square root of 25 is 5.']];
  for (const [said, shown] of PRINT) assert.equal(KB.shown(said), shown);
  for (const [, shown] of PRINT.filter(x => /\d (×|−) \d/.test(x[1]))) assert.match(sayMath(shown).toLowerCase(), /times|minus/, `the deck would say "${shown}" in words too`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  assert.deepEqual([T['ch.build'], T['ch.move'], T['ch.span'], T.title], ['Fill and Cover', 'Slide, Flip, Turn', 'Ladders and Spans', 'Keep Builder']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule)
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|kilometres?|centimetres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, in the game or in its listing; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|tax|tips?|markups?|discount|interest|commission|coins?|dollars?|cents?|market|treasure|gold)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a building site, not a shop: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes.replace(/nothing priced, bought or sold/, ''), SHOP);
  // kind: nothing is attacked, fought or guarded, though the world is a castle
  for (const text of [...Object.values(T), META.description, META.tags]) assert.doesNotMatch(text, /\b(sword|arrow|bow|fight|battle|attack|enemy|enemies|guard|war|siege|hunt|weapon|cannon|knight|spike|spikes|dungeon)\b/i, text);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
  // the public listing never names the tier it was built for
  for (const text of [META.title, META.description, META.tags]) assert.doesNotMatch(text, /\bpro\b|towers|number quest/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('keep-builder'));
  assert.equal(META.slug, 'keep-builder'); assert.equal(META.title, 'Keep Builder'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['keep-builder'], { subject: 'math', from: 6, to: 8 }, 'on the Learn shelf as math for grades 6 to 8');
  for (const f of ['public/covers/keep-builder.jpg', 'public/og/keep-builder.jpg', 'scripts/covers/keep-builder.recipe.js', 'public/img/nq/keep-builder/fill-and-cover.webp', 'public/img/nq/keep-builder/slide-flip-turn.webp', 'public/img/nq/keep-builder/ladders-and-spans.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'keep-builder'), { slug: 'keep-builder', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('keep-builder'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.KEEP_CHAPTERS, { build: ['6.G.A.1', '6.G.A.2', '6.G.A.4', '7.G.B.6'], move: ['7.G.B.5', '8.G.A.1', '8.G.A.3', '8.G.A.2', '8.G.A.4'], span: ['8.G.B.7', '8.G.B.8', '8.G.B.6', '8.EE.A.2'] });
  assert.deepEqual(TAGS.gameCodes('keep-builder', 'ccss-math'), Object.values(TAGS.KEEP_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('keep-builder'));
  assert.equal(UNIT.title, 'The Drafting Keep'); assert.equal(UNIT.stamp, 'Angle Gear'); assert.equal(UNIT.tool, 'keep-builder'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 3); assert.ok(UNITS.tiers.pro.stones.includes('Angle Gear')); assert.equal(UNITS.tiers.pro.status, 'open', 'the grades 6-8 street is open to everyone (2026-11-15)');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['6.1', 17, 'Area, surface area and volume'], ['6.2', 18, 'Angles and moves: slide, flip, turn, resize'], ['6.3', 19, 'The Pythagorean theorem']]);
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.KEEP_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(g.slug, 'keep-builder'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(KB.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '7', '8', '']) assert.deepEqual(TAGS.stepGameCodes('keep-builder', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('keep-builder', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('keep-builder', 'ccss-math', '6', ''), ['6.G.A.1', '6.G.A.2', '6.G.A.4'], 'an unlocked grade 6 step claims the grade 6 codes only');
  assert.deepEqual(TAGS.stepGameCodes('keep-builder', 'ccss-math', '7', ''), ['7.G.B.6', '7.G.B.5']);
  assert.deepEqual(TAGS.stepGameCodes('keep-builder', 'ccss-math', '8', ''), ['8.G.A.1', '8.G.A.3', '8.G.A.2', '8.G.A.4', '8.G.B.7', '8.G.B.8', '8.G.B.6', '8.EE.A.2']);
  // the decks and the check: the three decks send the learner to the step's own chapter, and every check item keys one of its step's primary codes
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u6-pro.json'), 'utf8'));
  assert.equal(set.items.length, 9);
  STEPS.forEach((s, i) => {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, `seed-lessons/number-quest/course/pro/${s.n}.json`), 'utf8'));
    assert.deepEqual(deck.game, { slug: 'keep-builder', chapter: T[`ch.${CHAPTERS[i]}`], params: `chapter=${CHAPTERS[i]}&lock=1` }); assert.equal(deck.title, s.titles.pro);
    const mine = set.items.filter(it => it.lesson === s.n);
    assert.deepEqual(mine.map(it => it.id), deck.check); assert.equal(mine.length, 3);
    for (const it of mine) { assert.ok(s.standards.pro.primary.includes(it.cat), `${it.id}: ${it.cat} is a primary code of ${s.n}`); assert.equal(it.choices.length, 4); assert.equal(it.misconceptions[it.answer], 'correct'); assert.equal(it.misconceptions.filter(m => m === 'correct').length, 1); }
  });
});

// The check items, each solved here from its own numbers: exactly one choice is right, and it is the key.
test('the nine check items: each key is the one right choice, worked out from the numbers in the question', () => {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u6-pro.json'), 'utf8')), by = Object.fromEntries(set.items.map(it => [it.id, it]));
  const key = id => by[id].choices[by[id].answer];
  const mixed = s => { const m = /^(\d+)(?: (\d+)\/(\d+))?$/.exec(s); return +m[1] + (m[2] ? m[2] / m[3] : 0); };
  // 6.1: cubes of 1/2 m in a box with fractional edges; a box's surface area; a trapezoid's area
  let m = /A box is ([\d /]+) m long, ([\d /]+) m wide and ([\d /]+) m high\. How many cubes with edges of 1\/2 m/.exec(by['nq-pro-6.1-e1'].q);
  assert.equal(key('nq-pro-6.1-e1'), String(m.slice(1).map(mixed).reduce((a, x) => a * x / 0.5, 1)));
  m = /A box is (\d+) cm by (\d+) cm by (\d+) cm/.exec(by['nq-pro-6.1-e2'].q); const [l, w, h] = m.slice(1).map(Number);
  assert.equal(key('nq-pro-6.1-e2'), `${2 * (l * w + l * h + w * h)} cm²`);
  m = /parallel sides of (\d+) m and (\d+) m\. The distance between them is (\d+) m/.exec(by['nq-pro-6.1-e3'].q); assert.equal(key('nq-pro-6.1-e3'), `${(+m[1] + +m[2]) / 2 * m[3]} m²`);
  // 6.2: the angle next to a known one; a flip over the y-axis; lengths after a turn
  m = /One of the four angles is (\d+)°\. What is the angle next to it/.exec(by['nq-pro-6.2-e1'].q); assert.equal(key('nq-pro-6.2-e1'), `${180 - m[1]}°`);
  m = /Point P \((−?\d+), (−?\d+)\) is reflected over the y-axis/.exec(by['nq-pro-6.2-e2'].q); const num = s => +s.replace('−', '-'), fmt = n => String(n).replace('-', '−');
  assert.equal(key('nq-pro-6.2-e2'), `(${fmt(-num(m[1]))}, ${fmt(num(m[2]))})`);
  m = /with sides of (\d+), (\d+) and (\d+) units is turned/.exec(by['nq-pro-6.2-e3'].q); assert.equal(key('nq-pro-6.2-e3'), `${m[1]}, ${m[2]} and ${m[3]} units`);
  // 6.3: a ladder's height, the distance between two points, the longest pole in a room
  m = /A ladder (\d+) m long leans on a wall\. Its foot is (\d+) m from the wall/.exec(by['nq-pro-6.3-e1'].q); assert.equal(key('nq-pro-6.3-e1'), `${Math.sqrt(sq(m[1]) - sq(m[2]))} m`);
  m = /between the points \((−?\d+), (−?\d+)\) and \((−?\d+), (−?\d+)\)/.exec(by['nq-pro-6.3-e2'].q); assert.equal(key('nq-pro-6.3-e2'), String(Math.hypot(num(m[3]) - num(m[1]), num(m[4]) - num(m[2]))));
  m = /A room is (\d+) m long, (\d+) m wide and (\d+) m tall/.exec(by['nq-pro-6.3-e3'].q); assert.equal(key('nq-pro-6.3-e3'), `${Math.sqrt(sq(m[1]) + sq(m[2]) + sq(m[3]))} m`);
  // and no other choice is also right: every wrong choice is a different number from the key
  for (const it of set.items) { assert.equal(new Set(it.choices).size, 4, `${it.id}: four different choices`); assert.ok(/\?$/.test(it.q), it.id); }
  for (const id of ['nq-pro-6.3-e1', 'nq-pro-6.3-e3']) for (const c of by[id].choices) { const r = /^√(\d+) m$/.exec(c); if (r) assert.ok(Math.sqrt(+r[1]) % 1 !== 0, `${id}: ${c} is not secretly the key`); }
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.KB_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
// lap: the lap the first play takes (0, the fixed lap, whose numbers the checks below know), or null for the
// random lap a play really takes.
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, lap = 0 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Keep Builder' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__kb.state());
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
const planText = (s, v) => (s.unit === '×' ? '× ' + KB.nt(v) : s.unit === '°' ? KB.nt(v) + '°' : KB.nt(v) + ' ' + s.unit);
const CONTROLS = { tiles: ['kb-n0', 'kb-n1', 'kb-n2'], step: ['kb-dn', 'kb-val', 'kb-up', 'kb-go'] };
/** Try a plan with the real controls: the handle sets the plan, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#kb-n' + v);
  await g.frame.evaluate(x => window.__kb.act('set', x), v); return go('#kb-go');
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it gives and does not advance, six right rounds post game over once`, { skip, timeout: 900_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1`, lap: null });   // the lap a real play takes
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'barbarian']);
    assert.deepEqual(await ids(frame, '#card .kb-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T['start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__kb.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, 6], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-build, #ch-move, #ch-span, #menu').length), 0);
    await until(() => window.__kb.state().moving === 0, null, 180_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__kb.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      if (round === 1) { assert.ok(Number.isInteger(s.lap) && s.lap >= 1, 'a play takes a random lap, not the fixed lap 0'); g.lap1 = s.lap; } else assert.equal(s.lap, g.lap1, 'one lap for the whole play');
      const want = KB.round(chapter, round, s.lap);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      assert.equal(await text(frame, '#askt'), box(s.ask), `round ${round}: the instruction`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, stones: round - 1 }, `round ${round}: the board, and ${round - 1} stones on the keep`);
      // the controls: a stepper and Run, or three tiles
      assert.deepEqual(await ids(frame, '#bar > *'), CONTROLS[s.input], `round ${round}: the controls`);
      if (s.input === 'step') {
        assert.equal(s.value, s.step.start); assert.equal(await text(frame, '#kb-val'), planText(s, s.step.start), `round ${round}: the stepper starts at ${s.step.start}`);
        assert.equal(await text(frame, '#kb-go .l'), 'Run');
      } else assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .kb-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the board showing what the plan gives, the same round, nothing reported
      const wrong = wrongOf(s), verdict = KB.judge(s, wrong);
      assert.equal(verdict.ok, false);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the board shows what it gives`);
      assert.deepEqual(after.tried, verdict.draw, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.kb-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.stones, round - 1, `round ${round}: no stone for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input === 'step') {
        // a new plan takes the board back to the question
        await frame.click('#kb-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried], ['ask', null], `round ${round}: changing the plan makes a new plan`);
        assert.ok(Math.abs(again.value - (wrong - s.step.by)) < 1e-9, `round ${round}: one press down`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__kb.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .kb-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .kb-askt'), 'Six stones are on the keep. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('keep-builder', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=<>≥²°√()%]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__kb.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.ok(s.lap >= 1 && s.lap !== g.lap1, 'Play again takes another lap'); assert.deepEqual(Object.fromEntries(Object.keys(KB.round(chapter, 1, s.lap)).map(k => [k, s[k]])), KB.round(chapter, 1, s.lap), 'the next lap’s first round');
    assert.equal(s.onStage.stones, 0, 'the keep is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed the real buttons set a plan, a wrong plan bends the beam, a right one sets a stone and only then the next round', { skip, timeout: 900_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .kb-menu .kb-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-build', 'Fill and Cover'], ['ch-move', 'Slide, Flip, Turn'], ['ch-span', 'Ladders and Spans']]);
  await g.shot('menu');
  // Slide, Flip, Turn, round 1 (two beams cross, one angle is 65°), with nothing hurried and the real buttons
  await frame.click('#ch-move');
  await until(() => window.__kb.state().screen === 'play' && window.__kb.state().moving === 0, null, 180_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.onStage.stones], ['move', false, 'beams', 'ask', 90, 0]);
  // six presses: 120° on the stepper, and the board still shows only the question
  for (let i = 0; i < 6; i++) await frame.click('#kb-up');
  assert.equal(await text(frame, '#kb-val'), '120°'); assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried], [120, 'ask', null]);
  await frame.click('#kb-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', '120 and 65 make 185°, so that beam would bend. A straight line is 180°.']);
  assert.deepEqual((await state()).tried.parts[0], { k: 'cross', a: 65, b: 185, labels: ['65°', '120°'], tone: 'warn' }, 'the board bends the beam to 185°');
  await until(() => window.__kb.state().moving === 0, null, 180_000);   // the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('move-tried');
  // one press down is a new plan (the board goes back to the question), and it is the right one
  await frame.click('#kb-dn');
  assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried, await text(frame, '#hint')], [115, 'ask', null, null]);
  await frame.click('#kb-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), 'x + 65° = 180°, x = 115°'); assert.equal(await text(frame, '#askt'), 'Yes! Angles on a straight line make 180°, and 180 − 65 is 115.');
  await frame.click('#kb-up'); await frame.click('#kb-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', 115]);
  assert.equal(s.onStage.stones, 1, 'the stone is on its way');
  await g.shot('move-found');
  await until(() => window.__kb.state().round === 2, null, 240_000);
  assert.deepEqual([(await state()).onStage.stones, (await state()).mode], [1, 'ask'], 'one stone on the keep, and the next board');
  // round 2: three equations as tiles; a wrong one opens the corner flat
  await until(() => window.__kb.state().moving === 0, null, 180_000);
  s = await state(); assert.equal(s.kind, 'corner');
  const flat = s.opts.findIndex(o => o.t === 'x + 35 = 180');
  await frame.click('#kb-n' + flat); assert.equal((await state()).tried.parts[0].wall, 180); assert.equal((await state()).round, 2);
  // back at the menu after the whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__kb.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__kb.state().round === n && window.__kb.state().phase === 'play', r); await frame.evaluate(() => window.__kb.act('solve')); }
  await until(() => window.__kb.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .kb-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__kb.state().screen === 'menu');
  assert.match(await text(frame, '#ch-move .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-span .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, phones and reduced motion: every control is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the builder', { skip, timeout: 1_500_000 }, async () => {
  // Keyboard only, Ladders and Spans: Tab to Start, Enter; arrows move the stepper, Enter runs the plan; 1 to 3 pick a tile.
  const k = await open({ params: 'chapter=span&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__kb.state().screen === 'play');
  await k.frame.evaluate(() => { window.__kb.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 4; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#kb-val'), '7 m', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'That adds the two sides, 3 + 4. Square them, add the squares, then take the square root.', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 3; i++) await k.p.keyboard.press(i % 2 ? '=' : 'ArrowRight');
  await k.p.keyboard.press('-'); await k.p.keyboard.press('ArrowDown'); await k.p.keyboard.press('_'); await k.p.keyboard.press('ArrowLeft'); await k.p.keyboard.press('ArrowDown');
  assert.equal(await text(k.frame, '#kb-val'), '5 m');
  await k.frame.focus('#kb-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__kb.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'kb-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#kb-dn'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'kb-up', 'Tab walks the buttons in order');
  await k.p.keyboard.press('Enter'); assert.equal((await k.state()).value, 6, 'Enter on a stepper button presses it, and does not run the plan'); assert.equal((await k.state()).mode, 'ask');
  for (const r of [2, 3]) { await k.until(n => window.__kb.state().round === n && window.__kb.state().phase === 'play', r); await k.frame.evaluate(() => { window.__kb.act('solve'); }); }
  await k.until(() => window.__kb.state().round === 4 && window.__kb.state().phase === 'play');
  await k.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  const s4 = await k.state(), miss = s4.choices.find(v => v !== s4.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(KB.judge(s4, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s4.answer + 1));
  await k.until(() => window.__kb.state().round === 5);
  for (const r of [5, 6]) { await k.until(n => window.__kb.state().round === n && window.__kb.state().phase === 'play', r); await k.frame.evaluate(() => { window.__kb.act('solve'); }); }
  await k.until(() => window.__kb.state().screen === 'end');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart and their words fit inside them; the board is wide, keeps its 4 by 3 shape (so it faces the player), sits
  // between the words and the controls with nothing of the courtyard in front of it, and the builder and the keep
  // never cover any of it; the smallest number or word on it is big enough to read, as asked and with a wrong plan drawn on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 12], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__kb.state().screen === 'play');
      await m.frame.evaluate(() => window.__kb.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__kb.state().round === r && window.__kb.state().phase === 'play' && window.__kb.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), kids = [...document.querySelectorAll('#bar > *')], bs = kids.map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__kb.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), chest = box(sp.chest), w = board.right - board.left, h = board.bottom - board.top;
          // the words on a control stay inside it (no clipped tile)
          const spill = kids.filter(b => [...b.querySelectorAll('.big, .l')].some(t => r(t).left < r(b).left - 0.5 || r(t).right > r(b).right + 0.5 || r(t).bottom > r(b).bottom + 0.5)).length;
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
        assert.deepEqual(fit, look, `${where}: on screen, the top row tidy, the controls big and apart, the board flat, in view, unhidden and clear of the builder`);
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
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.kb-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__kb.act('solve'));
      }
      await m.until(() => window.__kb.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
