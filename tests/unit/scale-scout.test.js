// Scale Scout (seed-games/scale-scout.html): Number Quest Pro Unit 4's game (The Map Room, grade 7), a Kit 2 (Oomba3D)
// survey camp outside a village in the morning, with a paper map on a board. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Medieval Village in
//     the morning (Garden Count plays the same world by day), and it has no timer, no lives, no losing and no shop;
//   - its rounds (the pure block between scale-scout:begin and scale-scout:end): six a chapter, every answer worked
//     out again here from the words the round asks with and the numbers on the board as asked (never from the game's
//     own answer), every plan a player can make judged (every tile, every number the stepper can stand on), every
//     wrong plan answered with the game's own lines and a picture whose numbers are what that plan really gives; the
//     same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the words box prints the signs, what the chip and the board show and the button labels are never sent
//     to be spoken, and nothing is bought or sold;
//   - its registration: seeded, on the Learn shelf for grade 7, in the Number Quest course, tagged chapter by chapter
//     with the codes units.json gives the three steps, and its lesson parameters survive the play-params grammar; and
//     the unit's nine check items, each key worked out from the numbers in its question;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one plants a flag, and six right rounds post the game-over message exactly once, not before; then the
//     menu with no parameters, a round at the game's own speed with the real stepper buttons, the keyboard, a desktop,
//     a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. SS_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/scale-scout.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/scale-scout.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 4), STEPS = UNIT.steps;
const CHAPTERS = ['constant', 'scale', 'percent'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const SS = (() => {
  const box = {}; vm.runInNewContext(/\/\* scale-scout:begin \*\/([\s\S]*?)\/\* scale-scout:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.ScaleScout;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS }), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), view: (r, m, v) => plain(G.view(r, m, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), nt: v => G.nt(v), frac: (n, d) => G.frac(n, d) };
})();
const T = lines.readGame('scale-scout').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const printed = l => (typeof l === 'string' ? l : SS.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');
const near = (a, b) => Math.abs(a - b) < 1e-9;
/** A fraction or a mixed number as written ("1/2", "1 1/2", "3"), as a number. */
const num = s => { const m = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(s); return m ? +(m[1] || 0) + m[2] / m[3] : +s; };
/** Every plan a player can make in a round: each tile, or each number the stepper can stand on. */
function plans(r) {
  if (r.input === 'tiles') return r.choices;
  const out = []; for (let i = 0; r.step.min + i * r.step.by <= r.step.max + 1e-9; i++) out.push(Math.round((r.step.min + i * r.step.by) * 1000) / 1000);
  return out;
}
const SPOKEN_PARTS = { 'half a kilometer': 1 / 2, 'three quarters of a kilometer': 3 / 4, 'one and a half kilometers': 3 / 2, 'a quarter of an hour': 1 / 4, 'half an hour': 1 / 2 };
/** Is a list of points a proportional relationship? Every y over x the same, and (0, 0) on it when x = 0 is listed. */
const proportional = pts => { const k = pts.filter(p => p[0] > 0).map(p => p[1] / p[0]); return k.every(v => near(v, k[0])) && pts.filter(p => p[0] === 0).every(p => p[1] === 0); };
/** What a tile's equation gives for d when c centimeters are on the map (the three forms the game offers). */
function equation(t, c) {
  let m;
  if ((m = /^d = (\d+)c$/.exec(t))) return +m[1] * c;
  if ((m = /^d = c \+ (\d+)$/.exec(t))) return c + +m[1];
  if ((m = /^c = (\d+)d$/.exec(t))) return c / +m[1];
  assert.fail(`an equation reads "${t}"`);
}
/** The answer of a round, worked out here from the words it asks with (and, where the question is a picture, from
 *  the numbers on the board as asked): never from the game's own answer. A number for a stepper, the words on the
 *  right tile for tiles. */
function solve(r) {
  const q = r.ask.map(l => say(l[0], l[1])).join(' '), g = re => { const m = re.exec(q); assert.ok(m, `${r.kind}: "${q}" reads as ${re}`); return m.slice(1).map(Number); };
  const parts = r.pic.ask.parts;
  switch (r.kind) {
    case 'which': { const ok = parts[0].tabs.filter(t => proportional(t.rows.map(x => x.map(Number)))); assert.equal(ok.length, 1, 'one proportional table'); return ok[0].tag; }
    case 'ktable': { const [t, d] = g(/(\d+) hours, ([\d.]+) kilometers/); assert.ok(proportional(parts[0].tabs[0].rows.map(x => x.map(Number))), 'the table on the board is a steady pace'); assert.deepEqual(parts[0].tabs[0].rows[0].map(Number), [t, d]); return d / t; }
    case 'unit': { const m = /walks (.+?) in (.+?)\. How far in 1 hour\?/.exec(q); assert.ok(m, q); assert.ok(SPOKEN_PARTS[m[1]] && SPOKEN_PARTS[m[2]], q); const v = SPOKEN_PARTS[m[1]] / SPOKEN_PARTS[m[2]]; return `${v} km`; }
    case 'graphs': { const ok = parts[0].gs.filter(x => proportional(x.pts)); assert.equal(ok.length, 1, 'one proportional graph'); return ok[0].tag; }
    case 'kgraph': { const [t, d] = g(/passes (\d+) hours, ([\d.]+) kilometers/); assert.deepEqual([parts[0].point.x, parts[0].point.y], [t, d], 'the point on the graph is the point in the words'); return d / t; }
    case 'far': { const [d, t, n] = g(/walks (\d+) kilometers in (\d+) hours\. How far in (\d+) hours/); return `${d / t * n} km`; }
    case 'ground': { const [s, c] = g(/1 centimeter to (\d+) meters\. The mill is (\d+) centimeters/); assert.equal(parts[0].scale, `1 cm : ${s} m`); assert.deepEqual(parts[0].places, [{ at: c, name: 'mill' }]); return c * s; }
    case 'pin': { const [s, d] = g(/1 centimeter to (\d+) meters\. The tower is (\d+) meters/); assert.equal(parts[0].scale, `1 cm : ${s} m`); return d / s; }
    case 'equation': { const [s] = g(/1 centimeter to (\d+) meters/); const ok = r.opts.filter(o => [1, 2, 4, 7].every(c => near(equation(o.t, c), s * c))); assert.equal(ok.length, 1, 'one equation fits the scale'); return ok[0].t; }
    case 'area': { const [w, h, s] = g(/is (\d+) centimeters by (\d+) centimeters\. The scale is 1 centimeter to (\d+) meters/); return `${w * s * h * s} m²`; }
    case 'redraw': { const [a, c, b] = g(/1 centimeter to (\d+) meters shows a wall (\d+) centimeters long\. Draw it again at 1 centimeter to (\d+) meters/); return c * a / b; }
    case 'rgraph': { const [c, d] = g(/passes (\d+) centimeters, (\d+) meters/); assert.deepEqual([parts[0].point.x, parts[0].point.y], [c, d]); return d / c; }
    case 'drop': { const [a, b] = g(/held (\d+) liters\. Now it holds (\d+)/); assert.ok(b < a); return (a - b) / a * 100; }
    case 'rise': { const [a, b] = g(/gave (\d+) sacks of grain last year and (\d+) this year/); assert.ok(b > a); return (b - a) / a * 100; }
    case 'error': { const [m, real] = g(/said (\d+) meters\. The real distance is (\d+) meters/); return Math.abs(m - real) / real * 100; }
    case 'grow': { const [a, p] = g(/old path is (\d+) meters\. The new path is (\d+) percent/); return `${/longer/.test(q) ? a + a * p / 100 : a - a * p / 100} m`; }
    case 'before': { const [p, b] = g(/After a (\d+) percent drop, the tank holds (\d+) liters/); return `${b / (1 - p / 100)} L`; }
    case 'left': { const [t, p] = g(/route is (\d+) kilometers\. The scout has walked (\d+) percent/); return t - t * p / 100; }
    default: assert.fail(`no solver for ${r.kind}`);
  }
}
/** A hint's own numbers, checked as arithmetic: the line says what the plan `v` really gives. */
const HINTS = {
  'c.hint.pace.table': (x, v) => near(+x.n, v) && near(+x.a, v * x.t), 'c.hint.pace.graph': (x, v) => near(+x.n, v) && near(+x.a, v * x.t),
  'm.hint.short': (x, v, r) => +x.n === v && near(+x.a, v / r.p.s) && x.b === r.p.c, 'm.hint.pin': (x, v, r) => x.n === v && x.a === v * r.p.s && x.b === r.p.d,
  'm.hint.wall': (x, v, r) => x.n === v && x.a === v * r.p.b && x.b === r.p.len * r.p.a, 'm.hint.samelen': (x, v, r) => v === r.p.len && x.a === v * r.p.b && x.b === r.p.len * r.p.a,
  'm.hint.rate': (x, v, r) => x.n === v && x.a === v * x.c && x.b === r.p.d,
  'p.hint.drop': (x, v, r) => x.n === v && near(+x.b, x.a * (100 - v) / 100) && x.c === r.p.b, 'p.hint.rise': (x, v, r) => x.n === v && near(+x.b, x.a * (100 + v) / 100) && x.c === r.p.b,
  'p.hint.error': (x, v, r) => x.n === v && near(+x.b, x.a * v / 100) && x.c === Math.abs(r.p.a - r.p.b),
  'p.hint.sum': (x, v, r) => near(+x.n, v) && near(+x.a, +x.w + v) && x.b === r.p.t && near(+x.w, r.p.t * r.p.pc / 100),
};

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the village is a survey camp in the morning', () => {
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
  // the newest Medieval Village, in the morning: the world Garden Count plays by day, so the two never look alike
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/medieval-village')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.ok(HTML.includes(`start({ theme: 'medieval-village', version: '${shipped.at(-1)}', graphics: 'auto', time: 'morning', outline: true, settings: true })`), 'the newest shipped Medieval Village, in the morning');
  assert.match(fs.readFileSync(path.join(ROOT, 'seed-games/garden-count.html'), 'utf8'), /theme: 'medieval-village', version: '[\d.]+', graphics: 'auto', time: 'day'/, 'Garden Count is the same village by day');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, `public/vendor/themes/medieval-village/${shipped.at(-1)}/theme.json`), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `the Medieval Village has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/\['([a-z-]+)', -?[\d.]+, 0, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 30, `the village is furnished from the theme (${used} pieces placed)`);
  for (const id of ['ground', 'windmill', 'watermill', 'tower', 'farm-field', 'tent', 'flag-blue']) assert.ok(asked.includes(id), `the village has the ${id}`);
  // nothing to collect, nothing to shop at and nothing to guard: no coin, no chest, no market, no castle wall
  for (const id of asked) assert.ok(!/^(coin|chest|market|wall|castle|blacksmith)/.test(id), `${id}: no reward currency, no shop, no fort`);
  assert.match(HTML, /g\.hero\('rogue-hooded'/); assert.ok(theme.heroes.some(h => h.id === 'rogue-hooded'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the scout back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable|prompt\(/, 'nothing is typed');
  assert.doesNotMatch(HTML, /physics\(|rapier3d-compat'\)|creature\(|school\(|g\.controls\(/, 'no physics, no animal and nothing to steer: nothing chases, bites or falls');
});

test('rounds: six a chapter, every answer worked out again from the words, every plan judged, every wrong plan shown as it really turns out, the first lap always the same', () => {
  assert.deepEqual(SS.CHAPTERS, CHAPTERS); assert.equal(SS.ROUNDS, 6);
  assert.equal(SS.round('nowhere', 1, 0), null); assert.equal(SS.round('scale', 0, 0), null); assert.equal(SS.round('scale', 7, 0), null);
  const kinds = { constant: ['which', 'ktable', 'unit', 'graphs', 'kgraph', 'far'], scale: ['ground', 'pin', 'equation', 'area', 'redraw', 'rgraph'], percent: ['drop', 'rise', 'error', 'grow', 'before', 'left'] };
  const seen = new Map();
  let judged = 0, wrongs = 0;
  for (const chapter of CHAPTERS) for (let lap = 0; lap < 14; lap++) for (let n = 1; n <= 6; n++) {
    const r = SS.round(chapter, n, lap), where = `${chapter} ${n} lap ${lap}`;
    assert.deepEqual(r, SS.round(chapter, n, lap), `${where}: the same round every time it is asked for`);
    assert.equal(r.kind, kinds[chapter][n - 1], where); assert.equal(r.chapter, chapter); assert.equal(r.n, n);
    assert.ok(r.input === 'tiles' || r.input === 'step', where);
    // the board as asked and as found are what view() draws, and each is a list of drawn parts over lines
    assert.deepEqual(r.pic.ask, SS.view(r, 'ask', null), where); assert.deepEqual(r.pic.found, SS.view(r, 'found', null), where);
    for (const ov of [r.pic.ask, r.pic.found]) { assert.ok(ov.parts.length === 1 && ['tables', 'dline', 'graphs', 'graph', 'map', 'rect', 'walls', 'bar'].includes(ov.parts[0].k), where); assert.ok(ov.lines.length <= 2, `${where}: at most two lines of maths under the picture`); }
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
      assert.ok(['km', 'm', 'cm', '%'].includes(r.unit), where);
      for (const v of [r.step.min - r.step.by, r.step.max + r.step.by, r.step.min + r.step.by / 2, '3', null, NaN]) assert.equal(SS.judge(r, v), null, `${where}: ${v} is not a plan`);
    }
    for (const v of all) {
      const res = SS.judge(r, v); judged++;
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
        assert.doesNotMatch(say(k, x), /\b1 (kilometers|meters|centimeters|hours|liters|sacks)\b/, `${where}: ${say(k, x)}`);
      }
      assert.deepEqual(res.draw, SS.view(r, 'try', v), where);
      assert.ok(res.draw.parts.length === 1 && res.draw.lines.length >= 1 && res.draw.lines.length <= 2, `${where}: the plan's own picture, with a line that names what went wrong`);
      assert.notDeepEqual(res.draw, r.pic.ask, `${where}: plan ${v} changes the board`); assert.notDeepEqual(res.draw, r.pic.found, `${where}: plan ${v} is not drawn as the answer`);
      const part = res.draw.parts[0], p = r.p;
      // the numbers of the picture are the plan's own outcome
      if (r.kind === 'ground') { assert.ok(near(part.walk.to, v / p.s) && part.walk.t === `${v} m` && part.walk.tone === 'warn', `${where}: ${v} m is walked as ${v / p.s} cm`); assert.notEqual(part.walk.to, part.places[0].at, `${where}: and it does not end at the mill`); }
      if (r.kind === 'pin') assert.deepEqual([part.pin.at, part.walk.to, part.walk.t], [v, v, `${v * p.s} m`], `${where}: a pin at ${v} cm is ${v * p.s} m`);
      if (r.kind === 'redraw') assert.deepEqual([part.rows[1].cm, part.rows[1].tone, res.draw.lines[1]], [v, 'warn', `${v} × ${p.b} = ${v * p.b} m`], where);
      if (r.kind === 'kgraph' || r.kind === 'rgraph') { assert.ok(near(part.plan.slope, v) && near(part.plan.y, v * part.point.x) && part.plan.x === part.point.x, `${where}: the plan's line reaches ${v * part.point.x}`); assert.ok(!near(part.plan.y, part.point.y)); }
      if (r.kind === 'ktable') assert.deepEqual(part.tabs[0].extra.vals, part.tabs[0].rows.map(x => SS.nt(v * x[0])), `${where}: the plan's pace, row by row`);
      if (r.kind === 'drop') assert.ok(near(part.marks[0].v, p.a * (100 - v) / 100) && part.marks[0].tone === 'warn', where);
      if (r.kind === 'rise') assert.ok(near(part.marks[0].v, p.a * (100 + v) / 100) && part.marks[0].tone === 'warn', where);
      if (r.kind === 'error') assert.ok(near(part.segs[0].b - part.segs[0].a, p.a * v / 100), where);
      if (r.kind === 'left') assert.ok(near(part.segs[1].b - part.segs[1].a, v) && near(part.segs[0].b, p.t * p.pc / 100), where);
      if (r.kind === 'before') { const tried = num(r.opts[v].t.replace(' L', '')); assert.ok(near(part.ticks[0].v, tried) && near(part.segs[0].b, tried * (100 - p.pc) / 100) && !near(part.segs[0].b, p.b), `${where}: ${tried} L less ${p.pc}% is not ${p.b} L`); }
      if (r.kind === 'which' || r.kind === 'graphs') assert.equal((part.tabs || part.gs.filter(x => x.tone)).length, 1, `${where}: the one that was picked, and why it is not proportional`);
    }
    // what is said when it is right is true: the numbers of the line are the numbers of the round
    for (const [k, v] of [...r.ask, ...r.said]) assert.doesNotMatch(say(k, v), /\b1 (kilometers|meters|centimeters|hours|liters|sacks)\b|undefined|NaN/, `${where}: ${say(k, v)}`);
    // the found board carries the answer
    const found = JSON.stringify(r.pic.found);
    assert.ok(found.includes(r.input === 'tiles' ? String(want).replace(/ (km|m|L|m²)$/, '').replace(/^d = /, '') : SS.nt(want)), `${where}: the found board shows ${want}`);
    seen.set(`${chapter}/${n}`, (seen.get(`${chapter}/${n}`) || new Set()).add(JSON.stringify(r.p)));
  }
  assert.ok(judged > 2500 && wrongs > 2200, `every plan of 252 rounds was judged (${judged}, ${wrongs} wrong)`);
  // a replay brings other numbers (every round has at least three versions in fourteen laps)
  for (const [k, v] of seen) assert.ok(v.size >= 3, `${k}: ${v.size} versions`);
  // The first lap, by its numbers: the unit's own examples.
  const first = c => [1, 2, 3, 4, 5, 6].map(n => { const r = SS.round(c, n, 0); return r.input === 'tiles' ? r.opts[r.answer].t : `${r.answer} ${r.unit}`; });
  assert.deepEqual(first('constant'), ['A', '3.5 km', '2 km', 'B', '1.5 km', '20 km']);
  assert.deepEqual(first('scale'), ['1500 m', '8 cm', 'd = 250c', '600 m²', '3 cm', '250 m']);
  assert.deepEqual(first('percent'), ['25 %', '30 %', '4 %', '230 m', '50 L', '13 km']);
  assert.deepEqual(SS.round('constant', 1, 0).pic.ask.parts[0].tabs.map(t => t.rows.map(x => x.join(' → ')).join(', ')), ['1 → 3, 2 → 6, 3 → 9', '1 → 1, 2 → 4, 3 → 9', '1 → 3, 2 → 5, 3 → 7'], 'a steady walker, one that speeds up, and one with a head start that adds 2 each hour');
  assert.equal(box(SS.round('scale', 1, 0).ask), 'The map scale is 1 centimeter to 250 meters. The mill is 6 centimeters from the gate. How many meters is the walk?');
  assert.equal(box(SS.round('percent', 1, 0).ask), 'The water tank held 80 liters. Now it holds 60. What percent did it drop?');
  assert.equal(box(SS.round('percent', 3, 0).ask), 'Your survey said 48 meters. The real distance is 50 meters. What is the percent error?');
  // The slips the unit names, each answered by its own line.
  const hint = (c, n, v) => box(SS.judge(SS.round(c, n, 0), v).lines), tile = (c, n, t) => { const r = SS.round(c, n, 0); return box(r.hints[r.opts.findIndex(o => o.t === t)]); };
  assert.equal(tile('constant', 1, 'C'), 'That walker adds 2 kilometers each hour, but after a head start of 1. Double the time does not double the distance.');
  assert.equal(hint('constant', 2, 7), '7 kilometers is for 2 hours. Share it out over the 2 hours.');
  assert.equal(hint('constant', 2, 3), 'A pace of 3 an hour makes 6 in 2 hours. The table says 7.');
  assert.equal(tile('constant', 3, '1/8 km'), 'That multiplies the two numbers. A whole hour is longer, so the scout goes further.');
  assert.equal(tile('constant', 6, '14 km'), 'That adds 2 hours and 2 kilometers. A steady pace multiplies.');
  assert.equal(hint('scale', 1, 1250), '1250 meters reaches 5 on the map\'s ruler. The mill is at 6.');
  assert.equal(hint('scale', 2, 6), 'A pin at 6 on the ruler is 1500 meters on the ground. The tower is 2000 meters away.');
  assert.equal(tile('scale', 3, 'd = c + 250'), 'That adds 250 once. Every centimeter stands for 250 meters, so multiply.');
  assert.equal(tile('scale', 4, '60 m²'), 'That uses the scale once. Both sides are 10 times as long.');
  assert.equal(hint('scale', 5, 6), 'The same length at the new scale would be 48 meters. The real wall is 24 meters.');
  assert.equal(hint('scale', 5, 12), 'A wall of 12 on the ruler is 96 meters at the new scale. The real wall is 24 meters.');
  assert.equal(hint('percent', 1, 20), '20 is the liters that went. What percent of 80 is 20?');
  assert.equal(hint('percent', 1, 30), 'A 30% drop from 80 leaves 56. The tank holds 60.');
  assert.equal(hint('percent', 3, 2), '2 is the meters you were off. What percent of 50 is 2?');
  assert.equal(tile('percent', 4, '215 m'), 'That adds 15 meters. 15% of 200 is not 15 meters.');
  assert.equal(tile('percent', 5, '48 L'), 'That adds 20% of 40. The drop was 20% of the tank before, which was bigger.');
  assert.equal(hint('percent', 6, 7), '7 kilometers is the part already walked. How far is left?');
  // A plan that is a drawing is on the board as it is set; any other number stays on the stepper until it is run.
  for (const chapter of CHAPTERS) for (let n = 1; n <= 6; n++) { const r = SS.round(chapter, n, 0); if (r.input === 'step') assert.equal(r.onBoard, r.kind === 'pin' || r.kind === 'redraw', `${chapter} ${n}`); }
  const pin = SS.round('scale', 2, 0), wall = SS.round('scale', 5, 0);
  assert.equal(SS.view(pin, 'ask', 3).parts[0].pin.at, 3); assert.equal(SS.view(pin, 'ask', 3).parts[0].walk, undefined, 'a pin as set: no walk, and no meters, until it is run');
  assert.doesNotMatch(JSON.stringify(SS.view(pin, 'ask', 3)), /750/); assert.equal(SS.view(wall, 'ask', 9).parts[0].rows[1].cm, 9); assert.doesNotMatch(JSON.stringify(SS.view(wall, 'ask', 9)), /72|24/, 'a wall as set: its centimeters, not its meters');
  for (const [c, n] of [['constant', 2], ['constant', 5], ['scale', 1], ['scale', 6], ['percent', 1], ['percent', 2], ['percent', 3], ['percent', 6]]) { const r = SS.round(c, n, 0); assert.deepEqual(SS.view(r, 'ask', r.answer), r.pic.ask, `${c} ${n}: the board as asked does not change with the stepper`); }
  // Lesson parameters.
  assert.deepEqual(SS.params({ chapter: 'scale', lock: 1 }), { chapter: 'scale', lock: true }); assert.deepEqual(SS.params({ chapter: 'scale' }), { chapter: 'scale', lock: false });
  assert.deepEqual(SS.params({ chapter: 'shop', lock: 1 }), { chapter: '', lock: false }); assert.deepEqual(SS.params(null), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the words box prints the signs; nothing is bought or sold', () => {
  assert.ok(lines.TTS_GAMES.has('scale-scout'));
  const ok = text => lines.allowedLine('scale-scout', 'en', text);
  const NUMS = Object.fromEntries('nmabcdhkpqrstw'.split('').map((k, i) => [k, i + 2]));
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 82);
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket, no unit short form
    assert.doesNotMatch(T[k].replace(/\{\w+\}/g, '0'), /[−+×÷=<>≤≥≠|°()/\\^²→%]|-\d|\b(km|cm|m|L|h)\b/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 24, `${k} is short enough to hear: ${T[k]}`);
  }
  // a decimal goes where a number goes; a word never does, and neither does a sign
  assert.ok(ok('A pace of 2.5 an hour makes 5 in 2 hours. The table says 7.')); assert.ok(ok('Yes! 7 divided by 2 is 3.5. The constant is 3.5 kilometers an hour.'));
  assert.equal(ok('A pace of two an hour makes 5 in 2 hours. The table says 7.'), null); assert.equal(ok('A -5 percent drop from 80 leaves 60. The tank holds 60.'), null);
  assert.equal(ok('The water tank held 80 liters. Now it holds 60. Tell me a secret.'), null, 'only the game’s own lines');
  // what the chip and the board show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('Steady Pace'), null); assert.equal(ok('d = 250c'), null); assert.equal(ok('1 cm : 250 m'), null);
  // The words box prints a spoken line with its signs, and leaves the rest as words.
  const PRINT = [['Yes! 20 out of 80 is 25 percent.', 'Yes! 20 out of 80 is 25%.'], ['Yes! 6 times 250 is 1500 meters.', 'Yes! 6 × 250 is 1500 meters.'], ['Yes! 2000 divided by 250 is 8 centimeters.', 'Yes! 2000 ÷ 250 is 8 centimeters.'],
    ['Yes! 15 percent of 200 is 30, and 200 plus 30 is 230.', 'Yes! 15% of 200 is 30, and 200 + 30 is 230.'], ['Yes! 35 percent of 20 is 7, and 20 minus 7 is 13.', 'Yes! 35% of 20 is 7, and 20 − 7 is 13.'],
    ['Yes! Every centimeter is 250 meters, so d is 250 times c.', 'Yes! Every centimeter is 250 meters, so d is 250 times c.'], ['Yes! 4 quarter hours make 1 hour, and 4 times three quarters is 3 kilometers.', 'Yes! 4 quarter hours make 1 hour, and 4 times three quarters is 3 kilometers.'],
    ['Both sides are 10 times as long.', 'Both sides are 10 times as long.'], ['Yes! 7 divided by 2 is 3.5. The constant is 3.5 kilometers an hour.', 'Yes! 7 ÷ 2 is 3.5. The constant is 3.5 kilometers an hour.']];
  for (const [said, shown] of PRINT) assert.equal(SS.shown(said), shown);
  for (const [, shown] of PRINT.filter(x => /^Yes! \d+ (×|÷) /.test(x[1]))) assert.match(sayMath(shown).toLowerCase(), /times|divided by/, `the deck would say "${shown}" in words too`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const name of ['gate', 'mill', 'tower']) assert.ok(T[`show.name.${name}`], name);
  assert.deepEqual([T['ch.constant'], T['ch.scale'], T['ch.percent'], T.title], ['Steady Pace', 'Map and Ground', 'Percent Report', 'Scale Scout']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule)
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|kilometres?|centimetres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, in the game or in its listing; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|tax|tips?|markups?|discount|interest|commission|coins?|dollars?|cents?|market)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a survey, not a shop: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes.replace(/nothing is priced, bought or sold/, ''), SHOP);
  // kind: nothing is hunted, fought or guarded
  for (const text of [...Object.values(T), META.description, META.tags]) assert.doesNotMatch(text, /\b(sword|arrow|bow|fight|battle|attack|enemy|enemies|guard|war|hunt|weapon|spy)\b/i, text);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
  // the public listing never names the tier it was built for
  for (const text of [META.title, META.description, META.tags]) assert.doesNotMatch(text, /\bpro\b|towers|number quest/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('scale-scout'));
  assert.equal(META.slug, 'scale-scout'); assert.equal(META.title, 'Scale Scout'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['scale-scout'], { subject: 'math', from: 7, to: 7 }, 'on the Learn shelf as math for grade 7');
  for (const f of ['public/covers/scale-scout.jpg', 'public/og/scale-scout.jpg', 'scripts/covers/scale-scout.recipe.js', 'public/img/nq/scale-scout/steady-pace.webp', 'public/img/nq/scale-scout/map-and-ground.webp', 'public/img/nq/scale-scout/percent-report.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'scale-scout'), { slug: 'scale-scout', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('scale-scout'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.SCOUT_CHAPTERS, { constant: ['7.RP.A.2a', '7.RP.A.2b', '7.RP.A.1'], scale: ['7.G.A.1', '7.RP.A.2c', '7.RP.A.2d'], percent: ['7.RP.A.3', '7.EE.B.3'] });
  assert.deepEqual(TAGS.gameCodes('scale-scout', 'ccss-math'), Object.values(TAGS.SCOUT_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('scale-scout'));
  assert.equal(UNIT.title, 'The Map Room'); assert.equal(UNIT.stamp, 'Scale Gear'); assert.equal(UNIT.tool, 'scale-scout'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 3); assert.ok(UNITS.tiers.pro.stones.includes('Scale Gear')); assert.equal(UNITS.tiers.pro.status, 'building', 'Pro stays closed');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['4.1', 11, 'Is it proportional? Find the constant'], ['4.2', 12, 'Scale drawings and maps'], ['4.3', 13, 'Percent problems']]);
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.SCOUT_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(g.slug, 'scale-scout'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(SS.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '7', '']) assert.deepEqual(TAGS.stepGameCodes('scale-scout', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('scale-scout', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('scale-scout', 'ccss-math', '7', ''), Object.values(TAGS.SCOUT_CHAPTERS).flat(), 'an unlocked grade 7 step claims every code: the game is all grade 7');
  assert.deepEqual(TAGS.stepGameCodes('scale-scout', 'ccss-math', '6', ''), [], 'and a grade 6 step none');
  // the decks and the check: the three decks send the learner to the step's own chapter, and every check item keys one of its step's primary codes
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u4-pro.json'), 'utf8'));
  assert.equal(set.items.length, 9);
  STEPS.forEach((s, i) => {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, `seed-lessons/number-quest/course/pro/${s.n}.json`), 'utf8'));
    assert.deepEqual(deck.game, { slug: 'scale-scout', chapter: T[`ch.${CHAPTERS[i]}`], params: `chapter=${CHAPTERS[i]}&lock=1` }); assert.equal(deck.title, s.titles.pro);
    const mine = set.items.filter(it => it.lesson === s.n);
    assert.deepEqual(mine.map(it => it.id), deck.check); assert.equal(mine.length, 3);
    for (const it of mine) { assert.ok(s.standards.pro.primary.includes(it.cat), `${it.id}: ${it.cat} is a primary code of ${s.n}`); assert.equal(it.choices.length, 4); assert.equal(it.misconceptions[it.answer], 'correct'); assert.equal(it.misconceptions.filter(m => m === 'correct').length, 1); }
  });
});

// The check items, each solved here from its own numbers: exactly one choice is right, and it is the key.
test('the nine check items: each key is the one right choice, worked out from the numbers in the question', () => {
  const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/sets/u4-pro.json'), 'utf8')), by = Object.fromEntries(set.items.map(it => [it.id, it]));
  const key = id => by[id].choices[by[id].answer];
  // 4.1 e1: the one list of (hours, kilometers) pairs with the same kilometers for each hour
  const lists = by['nq-pro-4.1-e1'].choices.map(c => [...c.matchAll(/\((\d+), (\d+)\)/g)].map(m => [+m[1], +m[2]]));
  assert.deepEqual(lists.map(proportional), [false, true, false, false]); assert.equal(by['nq-pro-4.1-e1'].answer, 1);
  // 4.1 e2: liters per minute, the same in every pair
  const pump = [...by['nq-pro-4.1-e2'].q.matchAll(/(\d+) liters after (\d+) minutes/g)].map(m => m[1] / m[2]);
  assert.deepEqual(pump, [2.5, 2.5, 2.5]); assert.equal(key('nq-pro-4.1-e2'), '2.5');
  assert.equal(key('nq-pro-4.1-e3'), 'The line passes through (0, 0)');
  // 4.2: 8 cm at 200 m for each cm; d = 50c; a 4 cm by 3 cm room at 2 m for each cm
  let m = /1 cm : (\d+) m\. Two wells are (\d+) cm apart/.exec(by['nq-pro-4.2-e1'].q); assert.equal(key('nq-pro-4.2-e1'), `${m[1] * m[2]} m`);
  const fits = t => [1, 2, 5].every(c => { const mm = /^d = (\d+)c$/.exec(t); return !!mm && mm[1] * c === 50 * c; });
  assert.deepEqual(by['nq-pro-4.2-e2'].choices.map(fits), [true, false, false, false]); assert.equal(by['nq-pro-4.2-e2'].answer, 0);
  // the three other equations each fail for 2 cm on the map, which is 100 m on the ground
  for (const [t, holds] of [['c = 50d', 2 === 50 * 100], ['d = c + 50', 100 === 2 + 50], ['d + c = 50', 100 + 2 === 50]]) { assert.ok(by['nq-pro-4.2-e2'].choices.includes(t)); assert.equal(holds, false, t); }
  m = /is (\d+) cm by (\d+) cm\. The scale is 1 cm : (\d+) m/.exec(by['nq-pro-4.2-e3'].q); assert.equal(key('nq-pro-4.2-e3'), `${m[1] * m[3] * m[2] * m[3]} m²`);
  // 4.3: percent increase, percent error, and the one discount item (worded about a third person)
  m = /was (\d+) cm tall\. Now it is (\d+) cm/.exec(by['nq-pro-4.3-e1'].q); assert.equal(key('nq-pro-4.3-e1'), `${(m[2] - m[1]) / m[1] * 100}%`);
  m = /shows (\d+) grams for a weight that is really (\d+) grams/.exec(by['nq-pro-4.3-e2'].q); assert.equal(key('nq-pro-4.3-e2'), `${(m[2] - m[1]) / m[2] * 100}%`);
  m = /marked at \$(\d+)\. Ms\. Okoro has a (\d+)% discount/.exec(by['nq-pro-4.3-e3'].q); assert.equal(key('nq-pro-4.3-e3'), `$${m[1] * (100 - m[2]) / 100}`);
  for (const it of set.items) assert.equal(new Set(it.choices).size, 4, `${it.id}: four different choices`);
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.SS_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Scale Scout' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__ss.state());
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
const planText = (s, v) => SS.nt(v) + (s.unit === '%' ? '%' : ' ' + s.unit);
const CONTROLS = { tiles: ['ss-n0', 'ss-n1', 'ss-n2'], step: ['ss-dn', 'ss-val', 'ss-up', 'ss-go'] };
/** Try a plan with the real controls: the handle sets the plan, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#ss-n' + v);
  await g.frame.evaluate(x => window.__ss.act('set', x), v); return go('#ss-go');
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it gives and does not advance, six right rounds post game over once`, { skip, timeout: 900_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'rogue-hooded']);
    assert.deepEqual(await ids(frame, '#card .ss-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T['start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__ss.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, 6], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-constant, #ch-scale, #menu').length), 0);
    await until(() => window.__ss.state().moving === 0, null, 180_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__ss.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      const want = SS.round(chapter, round, 0);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      assert.equal(await text(frame, '#askt'), box(s.ask), `round ${round}: the instruction`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, flags: round - 1 }, `round ${round}: the board, and ${round - 1} flags on the survey line`);
      // the controls: a stepper and Run, or three tiles
      assert.deepEqual(await ids(frame, '#bar > *'), CONTROLS[s.input], `round ${round}: the controls`);
      if (s.input === 'step') {
        assert.equal(s.value, s.step.start); assert.equal(await text(frame, '#ss-val'), planText(s, s.step.start), `round ${round}: the stepper starts at ${s.step.start}`);
        assert.equal(await text(frame, '#ss-go .l'), 'Run');
      } else assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .ss-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the board showing what the plan gives, the same round, nothing reported
      const wrong = wrongOf(s), verdict = SS.judge(s, wrong);
      assert.equal(verdict.ok, false);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the board shows what it gives`);
      assert.deepEqual(after.tried, verdict.draw, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.ss-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.flags, round - 1, `round ${round}: no flag for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input === 'step') {
        // a new plan takes the board back to the question
        await frame.click('#ss-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried], ['ask', null], `round ${round}: changing the plan makes a new plan`);
        assert.ok(Math.abs(again.value - (wrong - s.step.by)) < 1e-9, `round ${round}: one press down`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__ss.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .ss-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .ss-askt'), 'Six flags are on the survey line. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('scale-scout', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=<>≥²%]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__ss.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(SS.round(chapter, 1, 1)).map(k => [k, s[k]])), SS.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal(s.onStage.flags, 0, 'the survey line is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed the real buttons set a plan, a wrong plan is walked on the map, a right one plants a flag and only then the next round', { skip, timeout: 900_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .ss-menu .ss-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-constant', 'Steady Pace'], ['ch-scale', 'Map and Ground'], ['ch-percent', 'Percent Report']]);
  await g.shot('menu');
  // Map and Ground, round 1 (the mill, 6 cm away at 1 cm to 250 m), with nothing hurried and the real buttons
  await frame.click('#ch-scale');
  await until(() => window.__ss.state().screen === 'play' && window.__ss.state().moving === 0, null, 180_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.onStage.flags], ['scale', false, 'ground', 'ask', 0, 0]);
  // five presses: 1250 m on the stepper, and the board still shows only the question
  for (let i = 0; i < 5; i++) await frame.click('#ss-up');
  assert.equal(await text(frame, '#ss-val'), '1250 m'); assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried], [1250, 'ask', null]);
  await frame.click('#ss-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', '1250 meters reaches 5 on the map\'s ruler. The mill is at 6.']);
  assert.deepEqual((await state()).tried.parts[0].walk, { to: 5, tone: 'warn', t: '1250 m' }, 'the board walks 1250 m: 5 cm, short of the mill');
  await until(() => window.__ss.state().moving === 0, null, 180_000);   // the walk has been walked and the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('scale-tried');
  // one more press is a new plan (the board goes back to the question), and it is the right one
  await frame.click('#ss-up');
  assert.deepEqual([(await state()).value, (await state()).mode, (await state()).tried, await text(frame, '#hint')], [1500, 'ask', null, null]);
  await frame.click('#ss-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), '6 cm → 1500 m'); assert.equal(await text(frame, '#askt'), 'Yes! 6 × 250 is 1500 meters.');
  await frame.click('#ss-up'); await frame.click('#ss-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', 1500]);
  assert.equal(s.onStage.flags, 1, 'the flag is on its way');
  await g.shot('scale-found');
  await until(() => window.__ss.state().round === 2, null, 240_000);
  assert.deepEqual([(await state()).onStage.flags, (await state()).mode], [1, 'ask'], 'one flag on the survey line, and the next board');
  // round 2: the pin is a drawing, so the board shows it as it is set (and no meters until it is run)
  await until(() => window.__ss.state().moving === 0, null, 180_000);
  s = await state(); assert.deepEqual([s.kind, s.onBoard, s.value], ['pin', true, 6]);
  await frame.click('#ss-up'); assert.equal((await state()).value, 7); assert.equal(await text(frame, '#ss-val'), '7 cm'); assert.equal((await state()).mode, 'ask');
  // back at the menu after the whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__ss.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__ss.state().round === n && window.__ss.state().phase === 'play', r); await frame.evaluate(() => window.__ss.act('solve')); }
  await until(() => window.__ss.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .ss-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__ss.state().screen === 'menu');
  assert.match(await text(frame, '#ch-scale .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-percent .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, phones and reduced motion: every control is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the scout', { skip, timeout: 1_500_000 }, async () => {
  // Keyboard only, Percent Report: Tab to Start, Enter; arrows move the stepper, Enter runs the plan; 1 to 3 pick a tile.
  const k = await open({ params: 'chapter=percent&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__ss.state().screen === 'play');
  await k.frame.evaluate(() => { window.__ss.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 4; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#ss-val'), '20%', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), '20 is the liters that went. What percent of 80 is 20?', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 3; i++) await k.p.keyboard.press(i % 2 ? '=' : 'ArrowRight');
  await k.p.keyboard.press('-'); await k.p.keyboard.press('ArrowDown');
  assert.equal(await text(k.frame, '#ss-val'), '25%');
  await k.frame.focus('#ss-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__ss.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'ss-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#ss-dn'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'ss-up', 'Tab walks the buttons in order');
  await k.p.keyboard.press('Enter'); assert.equal((await k.state()).value, 5, 'Enter on a stepper button presses it, and does not run the plan'); assert.equal((await k.state()).mode, 'ask');
  for (const r of [2, 3]) { await k.until(n => window.__ss.state().round === n && window.__ss.state().phase === 'play', r); await k.frame.evaluate(() => { window.__ss.act('solve'); }); }
  await k.until(() => window.__ss.state().round === 4 && window.__ss.state().phase === 'play');
  await k.frame.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  const s4 = await k.state(), miss = s4.choices.find(v => v !== s4.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(SS.judge(s4, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s4.answer + 1));
  await k.until(() => window.__ss.state().round === 5);
  for (const r of [5, 6]) { await k.until(n => window.__ss.state().round === n && window.__ss.state().phase === 'play', r); await k.frame.evaluate(() => { window.__ss.act('solve'); }); }
  await k.until(() => window.__ss.state().screen === 'end');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart and their words fit inside them; the board is wide, keeps its 4 by 3 shape (so it faces the player), sits
  // between the words and the controls with nothing of the village in front of it, and the scout and the survey line
  // never cover any of it; the smallest number or word on it is big enough to read, as asked and with a wrong plan drawn on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 12], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__ss.state().screen === 'play');
      await m.frame.evaluate(() => window.__ss.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__ss.state().round === r && window.__ss.state().phase === 'play' && window.__ss.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), kids = [...document.querySelectorAll('#bar > *')], bs = kids.map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__ss.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
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
        assert.deepEqual(fit, look, `${where}: on screen, the top row tidy, the controls big and apart, the board flat, in view, unhidden and clear of the scout`);
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
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.ss-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__ss.act('solve'));
      }
      await m.until(() => window.__ss.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
