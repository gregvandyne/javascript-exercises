// Lantern Mix (seed-games/lantern-mix.html): the game of Number Quest's grades 6-8 street, Unit 1 (The Mixing Tower), a
// Kit 2 (Oomba3D) night workbench in Spooky Hollow where a lantern's glow comes from the ratio of two oils. The player
// plans with dials and then lights the lantern; the plan is run and its result shown. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between lantern-mix:begin and lantern-mix:end): six a chapter, the same first lap
//     every time, and EVERY plan the dials allow judged here independently from what the board draws: a mix by its
//     ratio (cross-multiplied, never by colour), a rate by the unit rate, a percent by the part and the whole. A wrong
//     plan names its mistake and gets the game's own hint lines;
//   - colour is never the only signal: equal ratios give the same glow, different ratios differ, the judge never reads
//     a colour, and every gauge is patterned and numbered;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), what the chip, the
//     board and the dials show is never sent to be spoken, and nothing is bought, sold or priced;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, read-aloud is on
//     by default (every instruction is sent to be spoken), the dials are real buttons and sliders, a wrong plan lights
//     the wrong glow, shows its result and its hint and does not advance, a right plan leaves a lantern on the rack,
//     and six right rounds post the game-over message (the course step's completion signal) exactly once, not before;
//     then the menu with no parameters, a round at the game's own speed, the keyboard, a desktop, a 390 px and a 360 px
//     phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. LM_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/lantern-mix.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/lantern-mix.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 1), STEPS = UNIT.steps;
const CHAPTERS = ['mix', 'rate', 'percent'];

// The game's own round maker, judge and words, run on their own (no DOM, no 3D).
const PURE = /\/\* lantern-mix:begin \*\/([\s\S]*?)\/\* lantern-mix:end \*\//.exec(HTML)[1];
const LM = (() => {
  const box = {}; vm.runInNewContext(PURE, box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.LanternMix;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain(G), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), glow: (a, b) => plain(G.glow(a, b)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('lantern-mix').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];

/** Every setting the round's dials allow (a locked dial has one). */
function plans(r) {
  let out = [{}];
  for (const d of r.dials) { const next = []; for (const p of out) for (let x = d.min; x <= d.max; x += d.step) next.push({ ...p, [d.id]: x }); out = next; }
  return out;
}
// What this test knows about each kind of round, written out here and never taken from the game's judge: whether a
// plan is right, from the numbers the board draws.
const FACTOR = { km: 1000, l: 1000, h: 60 };
const RIGHT = {
  copy: (p, v) => v.a > 0 && v.b > 0 && v.a * p.q === v.b * p.p,
  scale: (p, v) => v.a === p.k * p.p && v.a * p.q === v.b * p.p,
  fill: (p, v) => v.a > 0 && v.a * p.q === v.b * p.p && v.a + v.b === p.t,
  table: (p, v) => v.a === p.m * p.p && v.b === p.m * p.q,
  back: (p, v) => v.b === p.k * p.q && v.a * p.q === v.b * p.p,
  // more amber: a bigger share of amber in the same total (a / t against p / (p + q)), with both oils in
  warmer: (p, v) => v.a > 0 && v.b > 0 && v.a + v.b === p.t && (p.more === 'amber' ? v.a * (p.p + p.q) > p.p * p.t : v.a * (p.p + p.q) < p.p * p.t),
  unit: (p, v) => v.a * p.h === p.x,
  tank: (p, v) => v.a === p.u * p.t,
  'scale.rate': (p, v) => v.a * p.h === p.x * p.t,
  hours: (p, v) => v.a * p.x === p.v * p.h,
  two: (p, v) => v.a * p.a.h === p.a.x && v.b * p.b.h === p.b.x,
  speed: (p, v) => v.a * p.h === p.x * p.t,
  of: (p, v) => v.a * 100 === p.p * p.w,
  what: (p, v) => v.a * p.w === 100 * p.v,
  whole: (p, v) => v.a * p.p === 100 * p.v,
  convert: (p, v) => v.a === p.x * FACTOR[p.type],
  posts: (p, v) => v.a * p.s === p.k * 1000,
};
const kindOf = r => (r.chapter === 'rate' && r.kind === 'scale' ? 'scale.rate' : r.kind);
const KINDS = { mix: ['copy', 'scale', 'fill', 'table', 'back', 'warmer'], rate: ['unit', 'tank', 'scale', 'hours', 'two', 'speed'], percent: ['of', 'of', 'what', 'whole', 'convert', 'posts'] };

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.match(V.kit2ImportMap(), /oomba3d\/1\.2\.0\/oomba3d\.js/, 'the newest Oomba3D');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  assert.match(HTML, /start\(\{ theme: 'spooky-hollow', version: '1\.0\.0', graphics: 'auto', time: 'night', outline: true, settings: true \}\)/, 'Spooky Hollow at night, with the gear button');
  // the newest shipped Spooky Hollow, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/spooky-hollow')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/spooky-hollow/1.0.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Spooky Hollow 1.0.0 has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/(?:piece\(|\[)'([a-z-]+)', -?[\d.]+, -?[\d.]+, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 30, `the hollow is furnished from the theme (${used} pieces placed)`);
  for (const id of ['lantern', 'bench', 'arch', 'pumpkin-lantern']) assert.ok(asked.includes(id), `the piece ${id}`);
  // a workbench, not a shop or a treasure hunt: no coins, no chest, no reward currency
  for (const id of ['coin', 'chest']) assert.ok(!asked.includes(id), `${id} is not used`);
  assert.doesNotMatch(HTML, /g\.coins\(|g\.score\(/, 'no coins and no score');
  const heroes = /const HEROES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.deepEqual(heroes, ['skelly', 'rattles', 'captain-clank', 'mage', 'rogue-hooded']);
  for (const id of heroes) assert.ok(theme.heroes.some(h => h.id === id), `the theme has the hero ${id}`);
  // kid-safe: the spooky world stays friendly. No animals (so nothing can chase), nothing solid in the way, no scares.
  assert.doesNotMatch(HTML, /g\.creature\(|g\.school\(|g\.controls\(|g\.physics\(/, 'nothing moves about on its own, and there is nothing to run from or into');
  assert.doesNotMatch(HTML, /\b(ghost|ghoul|zombie|monster|blood|grave|coffin|tomb|dead|death|kill|haunt|scream|scare|scary|creepy|curse|witch|demon|bite|chase)\w*/i, 'a quiet night garden: no scary words anywhere in the file');
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers end a button wobble and bring the lamplighter
  // back to standing. Nothing ends a round on a clock.
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 2);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  // answers by dials only: sliders and buttons, never a typed number or a name
  assert.doesNotMatch(HTML, /type = 'text'|type="text"|type = 'number'|type="number"|<textarea|contenteditable|prompt\(/);
  assert.match(HTML, /r\.type = 'range'/);
});

test('rounds: six a chapter, the first lap always the same, and every plan the dials allow judged right or wrong for the reason the unit teaches', () => {
  assert.deepEqual([...LM.CHAPTERS], CHAPTERS); assert.equal(LM.ROUNDS, 6);
  assert.equal(LM.round('mix', 0, 0), null); assert.equal(LM.round('mix', 7, 0), null); assert.equal(LM.round('shop', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(LM.round(ch, n, 0), LM.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it (the plan's own examples: 2 : 3 into 15 parts, 6 ml in 4 hours for 10
  // hours, 30% of 250 ml, 3 km lit every 250 m)
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => LM.round(ch, n, 0));
  assert.deepEqual(lap0('mix').map(r => [r.kind, say(...r.ask), r.want]), [
    ['copy', 'The gate lantern mixes amber to blue as 2 to 3. Mix the same glow.', { a: 2, b: 3 }],
    ['scale', 'Same glow, bigger lantern: 2 to 3. Amber is set to 6 parts. Set the blue.', { a: 6, b: 9 }],
    ['fill', 'The big lantern holds 15 parts. Fill it with the gate glow, 2 to 3.', { a: 6, b: 9 }],
    ['table', 'Five lanterns share one glow. Mix the missing lantern.', { a: 4, b: 12 }],
    ['back', 'The glow is 3 amber to 4 blue. Blue is set to 12 parts. Set the amber.', { a: 9, b: 12 }],
    ['warmer', 'Use all 10 parts and both oils. Glow more amber than the gate, 2 to 3.', { a: 5, b: 5 }]]);
  assert.deepEqual(lap0('rate').map(r => [r.kind, say(...r.ask), r.want]), [
    ['unit', 'This lantern burns 12 milliliters in 4 hours. How much does it burn in 1 hour?', { a: 3 }],
    ['tank', 'It burns 3 milliliters each hour. Fill the tank to last 7 hours.', { a: 21 }],
    ['scale', 'It burns 6 milliliters in 4 hours. Fill the tank to last 10 hours.', { a: 15 }],
    ['hours', 'It burns 8 milliliters in 2 hours. The tank holds 20 milliliters. How many hours will it glow?', { a: 5 }],
    ['two', 'Lantern A burns 9 milliliters in 3 hours. Lantern B burns 10 in 5. Set each rate for 1 hour.', { a: 3, b: 2 }],
    ['speed', 'The lamplighter walks 150 meters in 3 minutes at a steady pace. How far in 8 minutes?', { a: 400 }]]);
  assert.deepEqual(lap0('percent').map(r => [r.kind, say(...r.ask), r.want]), [
    ['of', 'The tank holds 80 milliliters. Fill it to 50 percent.', { a: 40 }],
    ['of', 'The tank holds 250 milliliters. Fill it to 30 percent.', { a: 75 }],
    ['what', 'The tank holds 200 milliliters and has 50 in it. What percent full is it?', { a: 25 }],
    ['whole', '20 milliliters fills 25 percent of a tank. How much does the full tank hold?', { a: 80 }],
    ['convert', 'The path is 2.5 kilometers long. Set its length in meters.', { a: 2500 }],
    ['posts', 'The path is 3 kilometers long. One lantern lights 250 meters of it. How many lanterns light it all?', { a: 12 }]]);
  // the mistakes the unit is about, each named by the judge with the hint that answers it
  const why = (ch, n, v) => { const j = LM.judge(LM.round(ch, n, 0), v); assert.equal(j.ok, false); return [j.why, j.hint.map(([k, a]) => say(k, a)).join(' ')]; };
  assert.deepEqual(why('mix', 2, { a: 6, b: 7 }), ['add', 'Adding the same amount to both parts changes the glow. Multiply both parts by the same number instead.'], 'kept the difference (2 : 3 as 6 : 7), not the ratio');
  assert.deepEqual(why('mix', 1, { a: 3, b: 2 }), ['swap', 'That is 3 amber to 2 blue. The order of a ratio matters.']);
  assert.deepEqual(why('mix', 1, { a: 0, b: 3 }), ['none', 'Pour some of each oil first.']);
  assert.deepEqual(why('mix', 3, { a: 4, b: 6 }), ['total', 'The glow matches. But the lantern holds 15 parts, and you poured 10.'], 'the right glow in the wrong amount');
  assert.deepEqual(why('mix', 3, { a: 7, b: 8 }), ['amber', 'Too amber. Compare the two bars on the board. The gate pours 2 of amber for every 3 of blue.'], 'the right amount in the wrong glow');
  assert.deepEqual(why('mix', 4, { a: 2, b: 6 }), ['row', 'The glow matches. But that lantern is already in the row. Mix the missing one.']);
  assert.deepEqual(why('mix', 6, { a: 4, b: 6 }), ['same', '4 to 6 is the same glow as 2 to 3.'], 'an equal ratio is not "more amber"');
  assert.deepEqual(why('mix', 6, { a: 3, b: 7 }), ['blue', 'That glows more blue than the gate. Pour more amber.']);
  assert.deepEqual(why('mix', 6, { a: 6, b: 5 }), ['total', 'Use all 10 parts. You poured 11.']);
  assert.deepEqual(why('rate', 1, { a: 8 }), ['subtract', 'Do not subtract the hours. Share 12 milliliters equally over 4 hours.']);
  assert.deepEqual(why('rate', 1, { a: 4 }), ['high', 'At a rate of 4, 4 hours would burn 16 milliliters, not 12.'], 'the plan is run: what it would really burn');
  assert.deepEqual(why('rate', 2, { a: 10 }), ['add', 'Adding does not keep the rate. It needs 3 milliliters for each of the 7 hours.']);
  assert.deepEqual(why('rate', 3, { a: 12 }), ['add', 'Adding does not keep the rate. In 1 hour it burns 1.5 milliliters. Build on that.'], '6 ml and 6 more hours is not 12 ml');
  assert.deepEqual(why('rate', 3, { a: 14 }), ['low', 'That tank runs dry too soon. In 1 hour it burns 1.5 milliliters. Build on that.']);
  assert.deepEqual(why('rate', 4, { a: 3 }), ['low', 'By hour 3 it has burned 12 milliliters, not 20. It burns 4 milliliters each hour.']);
  assert.deepEqual(why('rate', 5, { a: 3, b: 5 }), ['b', 'Lantern B: share 10 milliliters equally over 5 hours.']);
  assert.deepEqual(why('rate', 6, { a: 450 }), ['high', 'That is too far. In 1 minute the lamplighter walks 50 meters.']);
  assert.deepEqual(why('percent', 2, { a: 30 }), ['label', '30 percent is not the same as 30 milliliters. 10 percent of 250 milliliters is 25 milliliters.'], 'the percent read as an amount');
  assert.deepEqual(why('percent', 3, { a: 50 }), ['label', '50 milliliters is not 50 percent. Compare it with the full tank. 50 percent of 200 milliliters would be 100 milliliters.']);
  assert.deepEqual(why('percent', 4, { a: 20 }), ['part', 'The full tank holds more than the part you see. 25 percent is 1 of 4 equal parts.']);
  assert.deepEqual(why('percent', 5, { a: 250 }), ['hundred', '1 kilometer is 1000 meters, not 100.']);
  assert.deepEqual(why('percent', 6, { a: 10 }), ['low', 'First change 3 kilometers to 3000 meters. A count of 10 lights only 2500 meters.']);
  // a plan off a dial's own stops, or with a dial missing, is never right
  for (const v of [{ a: 2.5, b: 3 }, { a: 2 }, { a: -2, b: -3 }, { a: '2', b: '3' }, null]) assert.equal(LM.judge(LM.round('mix', 1, 0), v).ok, false, JSON.stringify(v));
  assert.equal(LM.judge(LM.round('percent', 2, 0), { a: 76 }).ok, false); assert.equal(LM.judge(LM.round('mix', 2, 0), { a: 4, b: 6 }).ok, false, 'a locked dial cannot be turned');

  const seen = { asks: new Set(), kinds: new Set(), whys: new Set(), types: new Set(), more: new Set(), ratios: new Set(), judged: 0, open: 0 };
  const LAPS = 150;
  for (let lap = 0; lap < LAPS; lap++) {
    for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) {
      const r = LM.round(ch, n, lap), at = `${ch} ${n} lap ${lap}`, p = r.pic, right = RIGHT[kindOf(r)];
      assert.equal(r.kind, KINDS[ch][n - 1], at); assert.ok(right, at);
      assert.ok(T[r.ask[0]] && T[r.show[0]], `${at}: the question ${r.ask[0]} and the chip's ${r.show[0]} are the game's lines`);
      for (const [k, v] of [r.ask, r.show]) assert.doesNotMatch(say(k, v), /undefined|\{|NaN/, `${at}: ${k} has all its numbers`);
      // one or two dials, each a short run of stops a slider and two buttons can reach; a locked dial has one stop
      assert.ok(r.dials.length === 1 || r.dials.length === 2, at); assert.deepEqual(r.dials.map(d => d.id), r.dials.length === 2 ? ['a', 'b'] : ['a'], at);
      for (const d of r.dials) {
        assert.ok(T[d.key] && T['unit.' + d.unit] !== undefined, `${at}: the dial ${d.key} and its unit ${d.unit}`);
        assert.ok(Number.isInteger(d.min) && Number.isInteger(d.max) && Number.isInteger(d.step) && d.step >= 1 && d.min >= 0 && d.max >= d.min && (d.max - d.min) % d.step === 0, `${at}: whole stops`);
        assert.ok((d.max - d.min) / d.step <= 50, `${at}: at most 50 stops on a dial (${(d.max - d.min) / d.step})`);
        assert.equal(d.lock, d.min === d.max, at); assert.equal(d.start, d.min, `${at}: a dial starts at its lowest stop, so the answer is never there to begin with`);
      }
      assert.ok(r.dials.some(d => !d.lock), `${at}: something to set`);
      // every plan the dials allow, judged here from the board's numbers: the game agrees on each one
      const all = plans(r), rightOnes = all.filter(v => right(p, v));
      assert.ok(rightOnes.length >= 1, `${at}: a right plan exists`);
      if (r.kind === 'copy') assert.ok(rightOnes.length >= 2, `${at}: more than one way in (${rightOnes.length} right plans)`);
      if (r.kind === 'warmer' || r.kind === 'copy') { if (rightOnes.length >= 2) seen.open++; }
      else assert.equal(rightOnes.length, 1, `${at}: exactly one right plan`);
      assert.ok(right(p, r.want), `${at}: the round's own example is right`);
      assert.ok(!right(p, Object.fromEntries(r.dials.map(d => [d.id, d.start]))), `${at}: the dials do not start on the answer`);
      for (const v of all) {
        const j = LM.judge(r, v); seen.judged++;
        assert.equal(j.ok, right(p, v), `${at}: the plan ${JSON.stringify(v)} is ${right(p, v) ? 'right' : 'wrong'}`);
        const said = j.ok ? [...j.said, j.shown] : j.hint;
        assert.ok(said.length >= 1 && said.length <= 3, at);
        for (const [k, a] of said) { assert.ok(T[k], `${at}: ${k} is one of the game's lines`); assert.doesNotMatch(say(k, a), /undefined|\{|NaN|Infinity/, `${at}: ${k} has all its numbers (${say(k, a)})`); }
        if (!j.ok) { assert.ok(typeof j.why === 'string' && j.why, at); seen.whys.add(`${ch}:${j.why}`); }
      }
      // what the board draws agrees with what is asked
      if (ch === 'mix') {
        assert.equal(gcd(p.p, p.q), 1, `${at}: the gate's ratio in lowest terms`); assert.notEqual(p.p, p.q, at); seen.ratios.add(`${p.p}:${p.q}`);
        if (r.kind === 'fill') assert.equal(p.t % (p.p + p.q), 0, `${at}: the lantern holds a whole number of batches`);
        if (r.kind === 'table') assert.ok(p.m >= 2 && p.m <= p.cols && p.cols * Math.max(p.p, p.q) <= 20, `${at}: the missing lantern is in the row and on the dials`);
        if (r.kind === 'warmer') { seen.more.add(p.more); assert.equal(p.t, 2 * (p.p + p.q), at); }
      } else if (ch === 'rate' && r.kind !== 'two') {
        assert.ok(Number.isInteger(p.x) && Number.isInteger(p.h) || r.kind === 'tank', at);
        if (r.kind === 'scale') assert.ok(!Number.isInteger(p.u) && p.t !== p.h, `${at}: the rate for 1 hour is not a whole number, and the time is new`);
      } else if (r.kind === 'two') assert.notEqual(p.a.u, p.b.u, `${at}: one lantern burns less`);
      else if (r.kind === 'convert') seen.types.add(p.type);
      else if (r.kind === 'of' || r.kind === 'what') assert.notEqual(r.want.a, r.kind === 'of' ? p.p : p.v, `${at}: the percent and the amount are different numbers`);
      seen.asks.add(r.ask[0]); seen.kinds.add(`${ch}:${r.kind}`);
    }
  }
  assert.equal(seen.kinds.size, 17, 'seventeen kinds of round (two fill-to-a-percent rounds)');
  assert.deepEqual([...seen.types].sort(), ['h', 'km', 'l']); assert.deepEqual([...seen.more].sort(), ['amber', 'blue']); assert.ok(seen.ratios.size >= 10);
  assert.ok(seen.open > 1.5 * LAPS, `rounds with more than one right plan: ${seen.open}`); assert.equal(plans(LM.round('mix', 6, 0)).filter(v => RIGHT.warmer(LM.round('mix', 6, 0).pic, v)).length, 5, 'the first lap: 5 : 5, 6 : 4, 7 : 3, 8 : 2 and 9 : 1 all glow more amber than 2 : 3'); assert.ok(seen.judged > 100000, `${seen.judged} plans judged`);
  for (const w of ['mix:add', 'mix:swap', 'mix:none', 'mix:amber', 'mix:blue', 'mix:total', 'mix:row', 'mix:same', 'rate:subtract', 'rate:add', 'rate:low', 'rate:high', 'rate:zero', 'rate:a', 'rate:b', 'rate:both',
    'percent:label', 'percent:part', 'percent:hundred', 'percent:low', 'percent:high', 'percent:zero']) assert.ok(seen.whys.has(w), `the mistake ${w} comes up and is named`);
  for (const k of Object.keys(T).filter(k => /^(x|r|p)\.ask\./.test(k))) assert.ok(seen.asks.has(k), `${k} is asked in some round`);
  assert.deepEqual(LM.params({ chapter: 'rate', lock: 1 }), { chapter: 'rate', lock: true });
  assert.deepEqual(LM.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(LM.params(undefined), { chapter: '', lock: false });
});
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }

test('colour is never the only signal: a match is decided by the ratio, equal ratios glow the same, and every gauge is patterned and numbered', () => {
  // the glow is a function of the ratio alone
  assert.deepEqual(LM.glow(2, 3), LM.glow(4, 6)); assert.deepEqual(LM.glow(2, 3), LM.glow(200, 300)); assert.deepEqual(LM.glow(6, 9), { p: 2, q: 3, hue: 145.8, css: 'hsl(145.8, 100%, 60%)' });
  assert.notDeepEqual(LM.glow(2, 3), LM.glow(3, 2)); assert.equal(LM.glow(0, 0), null); assert.equal(LM.glow(-1, 2), null);
  assert.equal(LM.glow(1, 0).hue, 42, 'all amber'); assert.equal(LM.glow(0, 1).hue, 215, 'all blue');
  const hues = new Map();
  for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) {
    const g = LM.glow(a, b); if (!g) continue;
    const k = `${g.p}:${g.q}`;
    assert.equal(a * g.q, b * g.p, `${a} : ${b} in lowest terms is ${k}`);
    if (hues.has(g.hue)) assert.equal(hues.get(g.hue), k, `two different ratios never share a glow (${k} and ${hues.get(g.hue)} at hue ${g.hue})`); else hues.set(g.hue, k);
  }
  assert.ok(hues.size > 200, `${hues.size} different glows on the dials`);
  // more amber is always a warmer hue (toward 42), more blue a cooler one (toward 215)
  assert.ok(LM.glow(3, 2).hue < LM.glow(1, 1).hue && LM.glow(1, 1).hue < LM.glow(2, 3).hue);
  // the judge works from the numbers: it never asks for a glow, a hue or a colour
  const judges = PURE.slice(PURE.indexOf('function judgeMix'), PURE.indexOf('/* ---- rate'));
  assert.match(judges, /side = a \* q - b \* p/, 'cross-multiplied whole numbers: no rounding, no colour');
  assert.doesNotMatch(judges, /glow\(|hue|css|hsl|color|colour/i);
  assert.doesNotMatch(PURE.slice(PURE.indexOf('function judge(')), /glow\(|hue|css/);
  // what the player sees: amber parts are striped and blue parts are dotted (drawn, not only tinted), each gauge has
  // its count written beside it, and the two glows are also compared as bars
  assert.match(HTML, /Colour is never the only signal: amber is striped, blue is dotted, an empty slot is an outline/);
  assert.match(HTML, /if \(tone === 'a'\) for \(let i = -h; i < w; i \+= 17\)[^\n]*X\.stroke\(\)/, 'stripes on amber');
  assert.match(HTML, /else for \(let i = 10; i < w; i \+= 18\)[^\n]*X\.arc\(/, 'dots on blue');
  assert.match(HTML, /text\(`\$\{a\} : \$\{b\}`/, 'the plan in numbers beside its gauge');
  assert.match(HTML, /share\(230, 590, 620, 50, p, q,[^\n]*share\(230, 668, 620, 50, a, b,/, 'the gate and the plan as two bars');
  // the dials are named in words (Amber parts, Blue parts), and their values are numbers
  assert.equal(T['dial.amber'], 'Amber parts'); assert.equal(T['dial.blue'], 'Blue parts');
  // the hints say which way the glow is off in words, never "the wrong colour"
  for (const k of ['x.hint.amber', 'x.hint.blue', 'x.hint.side.amber', 'x.hint.side.blue']) assert.match(T[k], /amber|blue/);
});

test('words: every instruction, hint and answer line is a registered spoken line; what the chip, the board and the dials show is never read', () => {
  assert.ok(lines.TTS_GAMES.has('lantern-mix'));
  const ok = text => lines.allowedLine('lantern-mix', 'en', text);
  const NUMS = { n: 3, m: 5, a: 4, b: 2, c: 5, d: 6, h: 7, t: 8, p: 30, q: 3, k: 2, s: 250, w: 200, v: 60, x: 2.5, u: 1.5, r: 3, f: 1000 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|dial\.|unit\.|ch\.(mix|rate|percent)$|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 93);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what the chip, the board and the dials show and the button labels are shown, never read
  const spokenText = new Set(spoken.map(k => say(k, NUMS)));
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.|dial\.|unit\.)/.test(k))) if (T[k] && !spokenText.has(say(k, NUMS))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('2 : 3 = 6 : 9'), null); assert.equal(ok('30% of 250 ml'), null); assert.equal(ok('Amber parts'), null); assert.equal(ok('Light it'), null);
  assert.equal(say('x.said.same', { a: 6, b: 9, p: 2, q: 3 }) + ' ' + say('x.said.times', { k: 3 }), 'A match! 6 to 9 glows just like 2 to 3. Both parts were multiplied by 3.');
  assert.equal(say('x.said.fill', { k: 3, p: 2, q: 3, t: 15 }), 'A match! 3 batches of 2 and 3 fill all 15 parts.');
  assert.equal(say('r.said.scale', { u: 1.5, t: 10, v: 15 }), 'Yes! 1.5 milliliters an hour for 10 hours is 15 milliliters.');
  assert.equal(say('p.said.of', { p: 30, w: 250, v: 75 }), 'Yes! 30 percent of 250 is 75 milliliters.');
  assert.equal(say('p.said.posts', { m: 3000, s: 250, v: 12 }), 'Yes! 3000 meters divided by 250 is 12 lanterns.');
  assert.deepEqual(ok('Yes! 1.5 milliliters an hour for 10 hours is 15 milliliters.'), { text: 'Yes! 1.5 milliliters an hour for 10 hours is 15 milliliters.', role: 'friendly' }, 'a decimal is a number');
  assert.equal(ok('The gate lantern mixes amber to blue as two to three. Mix the same glow.'), null, 'a number goes where the number is, never a word');
  assert.equal(ok('The gate lantern mixes amber to red as 2 to 3. Mix the same glow.'), null, 'only the game’s own lines');
  // Spoken lines are written for the ear: units in words (the voice never has to read "ml" or "%"), no signs, one or
  // two sentences, at most 20 words; an instruction fits the words box.
  for (const k of spoken) {
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 20, `${k} is short enough to hear: ${T[k]}`);
    assert.doesNotMatch(T[k], /%|\bml\b|\bkm\b|\bmin\b|[×÷=→]|\} : \{|\d m\b/, `${k} spells its units out: ${T[k]}`);
  }
  const asks = spoken.filter(k => /\.ask\./.test(k));
  assert.equal(asks.length, 20); for (const k of asks) assert.ok(say(k, NUMS).length <= 110, `${k} fits the words box (${say(k, NUMS).length})`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak|chip|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  assert.deepEqual([T['ch.mix'], T['ch.rate'], T['ch.percent'], T.title], ['Match the Glow', 'Burn Rate', 'Fill and Convert', 'Lantern Mix']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule), and the units by their US names
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(millilitres?|kilometres?|litres?|metres?|colou?red|colours?|favourites?|grey)\b/i, text);
  // neutral contexts (owner decision 3): nothing is bought, sold, priced, taxed or discounted, and there is no interest
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|store|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|order(ed|s)?|tax(es)?|discount(s|ed)?|tips?|interest|commission|coins?|dollars?|cents?|money)\b/i;
  for (const [k, text] of Object.entries(T)) if (k !== 'x.hint.swap') assert.doesNotMatch(text, SHOP, `a workbench, not a shop: ${text}`);
  assert.doesNotMatch(T['x.hint.swap'].replace('The order of a ratio matters.', ''), SHOP);
  assert.doesNotMatch(META.description + ' ' + META.tags, SHOP);
  // and no hurry, and nothing unkind or frightening
  for (const text of Object.values(T)) { assert.doesNotMatch(text, /\b(hurry|quick|quickly|faster|late|seconds? left|timer|wrong|bad|fail(ed)?|lose|lost|stupid|silly)\b/i, text); assert.doesNotMatch(text, /\b(ghost|monster|scar(y|e)|creepy|haunted|grave|dead|blood)\b/i, text); }
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('lantern-mix'));
  assert.equal(META.slug, 'lantern-mix'); assert.equal(META.title, 'Lantern Mix'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['lantern-mix'], { subject: 'math', from: 6, to: 6 }, 'on the Learn shelf as math for grade 6 (every code it carries is a grade 6 statement)');
  for (const f of ['public/covers/lantern-mix.jpg', 'public/og/lantern-mix.jpg', 'scripts/covers/lantern-mix.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'lantern-mix'), { slug: 'lantern-mix', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('lantern-mix'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.LANTERN_CHAPTERS, { mix: ['6.RP.A.1', '6.RP.A.3a'], rate: ['6.RP.A.2', '6.RP.A.3b'], percent: ['6.RP.A.3c', '6.RP.A.3d'] });
  assert.deepEqual(TAGS.gameCodes('lantern-mix', 'ccss-math'), [...TAGS.LANTERN_CHAPTERS.mix, ...TAGS.LANTERN_CHAPTERS.rate, ...TAGS.LANTERN_CHAPTERS.percent]);
  assert.ok(TAGS.LEVELLED.includes('lantern-mix'));
  // the unit is built (its planned and reserved flags are gone), on a street that is still closed
  assert.equal(UNIT.title, 'The Mixing Tower'); assert.equal(UNIT.stamp, 'Ratio Gear'); assert.equal(UNIT.tool, 'lantern-mix');
  assert.ok(!('planned' in UNIT) && !('reserved' in UNIT)); for (const s of STEPS) assert.ok(!('reserved' in s), s.n);
  assert.equal(UNIT.teacherNotes.length, 3);
  assert.ok(UNITS.tiers.pro.stones.includes('Ratio Gear')); assert.equal(UNITS.tiers.pro.status, 'building', 'the grades 6-8 street stays closed: only the platform admin sees it');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro, s.mp]), [['1.1', 2, 'Ratios and equal mixes', 'MP7'], ['1.2', 3, 'Unit rates', 'MP2'], ['1.3', 4, 'Percent and changing units', 'MP6']]);
  // the statements the unit locks carry the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.LANTERN_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(g.slug, 'lantern-mix'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(LM.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    assert.deepEqual(st.also, []);
    for (const grade of ['6', '7', '8', '']) assert.deepEqual(TAGS.stepGameCodes('lantern-mix', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('lantern-mix', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('lantern-mix', 'ccss-math', '6', ''), ['6.RP.A.1', '6.RP.A.3a', '6.RP.A.2', '6.RP.A.3b', '6.RP.A.3c', '6.RP.A.3d'], 'an unlocked grade 6 step claims the game’s grade 6 codes');
  assert.deepEqual(TAGS.stepGameCodes('lantern-mix', 'ccss-math', '7', ''), [], 'and a grade 7 step none: the game has no grade 7 code');
  // the game's own page never names the closed street
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.title, /\bPro\b|Towers|Mixing Tower|Ratio Gear|Great Clock/);
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.LM_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Lantern Mix' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__lm.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 60_000) => frame.waitForFunction(fn, arg, { timeout, polling: 200 });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
const hintOf = j => j.hint.map(([k, a]) => say(k, a)).join(' ');
const unitText = (d, v) => { const u = T['unit.' + d.unit]; return String(v) + (u ? (d.unit === 'pct' ? '' : ' ') + u : ''); };
/** A wrong plan for a round: one stop off the round's example on its first free dial (never, by chance, another right plan). */
function wrongPlan(r) {
  const d = r.dials.find(x => !x.lock), right = RIGHT[kindOf(r)];
  for (const by of [d.step, -d.step, 2 * d.step, -2 * d.step]) { const v = { ...r.want, [d.id]: r.want[d.id] + by }; if (v[d.id] >= d.min && v[d.id] <= d.max && !right(r.pic, v)) return v; }
  throw new Error('no wrong plan near the example');
}
/** Turn a dial to a value with its own buttons, as a player would (one press a stop). */
async function turn(frame, d, from, to, touch) {
  const sel = `#dial-${d.id}-${to > from ? 'up' : 'dn'}`;
  for (let i = Math.abs(to - from) / d.step; i > 0; i--) await (touch ? frame.tap(sel) : frame.click(sel));
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, read-aloud is on, a wrong plan is run and shown and does not advance, six right rounds post game over once`, { skip, timeout: 600_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .lm-btn')].map(b => b.textContent)), ['Skelly', 'Rattles', 'Captain Clank', 'Wizard', 'Hooded Ranger'], 'five lamplighters, by the theme’s names');
    assert.ok((await g.spoken()).includes('Pick your lamplighter.'), 'read-aloud is on by default: the first line is sent to be spoken with no setting touched');
    await g.shot(`${chapter}-0-hero`);
    await frame.click('#hero-rattles');
    await until(() => window.__lm.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'rattles'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-mix, #ch-percent, #menu').length), 0);
    await until(() => window.__lm.state().moving === 0, null, 180_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__lm.fast());   // no waiting between the steps of a round; the presses are the real ones
    for (let round = 1; round <= 6; round++) {
      await until(n => window.__lm.state().round === n && window.__lm.state().phase === 'play', round);
      s = await state();
      assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      const want = LM.round(chapter, round, 0), at = `${chapter} round ${round}`;
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `${at} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.equal(asked, say(...want.ask), `${at}: the instruction`);
      assert.ok((await g.spoken()).includes(asked), `${at}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), say(...want.show), `${at}: the chip`);
      assert.deepEqual(s.onStage, { board: true, lit: round - 1, trial: [], glows: s.onStage.glows }, `${at}: the board, and ${round - 1} lanterns on the rack`);
      // the workbench: one dial for each thing to set, each a named slider with a minus and a plus button and its
      // value in numbers; a locked dial shows its value only; then the Light button. Nothing to type in.
      assert.deepEqual(await ids(frame, '#dials .lm-dial'), want.dials.map(d => 'dial-' + d.id), at);
      for (const d of want.dials) {
        const ui = await frame.evaluate(id => { const b = document.getElementById('dial-' + id), r = b.querySelector('input'); return { name: b.querySelector('.lm-dl span').textContent, val: b.querySelector('output').textContent, lock: b.classList.contains('lock'),
          range: r && { type: r.type, min: +r.min, max: +r.max, step: +r.step, value: +r.value, label: r.labels[0].textContent }, steps: [...b.querySelectorAll('button')].map(x => [x.id, x.getAttribute('aria-label')]) }; }, d.id);
        assert.equal(ui.val, unitText(d, d.start), `${at}: the dial ${d.id} shows its value with its unit`);
        if (d.lock) assert.deepEqual([ui.name, ui.lock, ui.range, ui.steps], [T[d.key] + ' 🔒', true, null, []], `${at}: a set dial is shown, locked`);
        else assert.deepEqual([ui.name, ui.lock, ui.range, ui.steps], [T[d.key], false, { type: 'range', min: d.min, max: d.max, step: d.step, value: d.start, label: T[d.key] + unitText(d, d.start) },
          [[`dial-${d.id}-dn`, `${T[d.key]}: less`], [`dial-${d.id}-up`, `${T[d.key]}: more`]]], `${at}: a slider and two buttons, named`);
      }
      assert.equal(await frame.evaluate(() => document.querySelectorAll('#lm input:not([type="range"]), #lm textarea, #lm select').length), 0, `${at}: nothing to type`);
      assert.equal(await text(frame, '#light'), '🔥Light it');
      await g.shot(`${chapter}-${round}`);
      // a wrong plan, set and run: the lantern lights in the glow the plan made, the board shows what the plan really
      // did, the hint says why, the Light button wobbles; the round stays open and nothing is reported
      const wrong = wrongPlan(want), jw = LM.judge(want, wrong);
      if (round === 1) for (const d of want.dials.filter(x => !x.lock)) await turn(frame, d, d.start, wrong[d.id]);   // with the real buttons, a press a stop
      else await frame.evaluate(v => window.__lm.act('set', v), wrong);
      assert.deepEqual((await state()).vals, wrong, `${at}: the dials hold the plan`);
      for (const d of want.dials) assert.equal(await text(frame, `#dial-${d.id}-val`), unitText(d, wrong[d.id]), `${at}: the dial ${d.id} shows ${wrong[d.id]}`);
      assert.equal((await state()).mode, 'ask', `${at}: turning a dial runs nothing`);
      assert.equal(await text(frame, '#hint'), null, `${at}: no hint before the plan is run`);
      await frame.click('#light');
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode, after.runs, after.last], [round, 'play', 'play', 'hint', 1, jw.why], `${at}: a wrong plan does not advance, and the board shows what it made`);
      assert.equal(await text(frame, '#hint'), hintOf(jw), `${at}: the hint that says why`);
      for (const [k, v] of jw.hint) assert.ok((await g.spoken()).includes(say(k, v)), `${at}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('#light.no').length), 1, `${at}: and a wobble on the Light button`);
      assert.equal(after.onStage.lit, round - 1, `${at}: no lantern kept for a wrong plan`);
      if (chapter === 'mix') assert.deepEqual(after.onStage.trial, [LM.glow(wrong.a, wrong.b).css], `${at}: the trial lantern glows as ${wrong.a} : ${wrong.b} does, not as the gate does`);
      else assert.equal(after.onStage.trial.length, 1, `${at}: a pale trial light`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `${at}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-hint`);
      // the right plan: a new plan puts the trial light out and the board back to planning; then it is lit
      await frame.evaluate(v => window.__lm.act('set', v), want.want);
      const replan = await state();
      assert.deepEqual([replan.mode, replan.onStage.trial], ['ask', []], `${at}: a new plan clears the last run`);
      const jr = LM.judge(want, want.want);
      await frame.click('#light');
      await until(r => { const t = window.__lm.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of jr.said) assert.ok(said.includes(say(k, v)), `${at}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .lm-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .lm-askt'), 'Six lanterns glow on the rack. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('lantern-mix', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__lm.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(LM.round(chapter, 1, 1)).map(k => [k, s[k]])), LM.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal(s.onStage.lit, 0, 'the rack is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed a wrong plan shows its result, a right one leaves its glow on the rack and only then the next round', { skip, timeout: 900_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-skelly');
  await until(() => window.__lm.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .lm-menu .lm-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-mix', 'Match the Glow'], ['ch-rate', 'Burn Rate'], ['ch-percent', 'Fill and Convert']]);
  await g.shot('menu');
  // Match the Glow, round 1 (the gate's 2 : 3), with nothing hurried
  await frame.click('#ch-mix');
  await until(() => window.__lm.state().screen === 'play' && window.__lm.state().moving === 0, null, 240_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.onStage.lit], ['mix', false, 'copy', 'ask', 0]);
  // 3 : 2, the ratio the wrong way round: the lantern lights amber-heavy, and the hint says the order matters
  await frame.evaluate(() => window.__lm.act('set', { a: 3, b: 2 }));
  await frame.click('#light');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.last, await text(frame, '#hint')], ['play', 'hint', 'swap', 'That is 3 amber to 2 blue. The order of a ratio matters.']);
  assert.deepEqual(s.onStage.trial, [LM.glow(3, 2).css]);
  await until(() => window.__lm.state().moving === 0, null, 240_000);   // the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  // 4 : 6, an equal ratio that is not the gate's own numbers: a match, because the ratio decides
  await frame.evaluate(() => window.__lm.act('set', { a: 4, b: 6 }));
  await frame.click('#light');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), '2 : 3 = 4 : 6');
  assert.equal(await text(frame, '#askt'), 'A match! 4 to 6 glows just like 2 to 3.');
  assert.ok((await g.spoken()).includes('Both parts were multiplied by 2.'));
  assert.deepEqual(s.onStage.glows, [LM.glow(2, 3).css], 'the kept lantern glows exactly as the gate does');
  assert.equal(await frame.evaluate(() => document.querySelectorAll('#light.ok').length), 1);
  await frame.click('#light');   // a press while the answer is showing changes nothing
  await frame.evaluate(() => window.__lm.act('set', { a: 1, b: 1 }));
  s = await state(); assert.equal(s.phase, 'right'); assert.deepEqual(s.vals, { a: 4, b: 6 }, 'the dials are still while the answer shows');
  await g.shot('mix-found');
  await until(() => window.__lm.state().round === 2, null, 300_000);
  assert.deepEqual([(await state()).onStage.lit, (await state()).mode], [1, 'ask'], 'one lantern on the rack, and the next board');
  // back at the menu after a whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__lm.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__lm.state().round === n && window.__lm.state().phase === 'play', r); await frame.evaluate(() => window.__lm.act('solve')); }
  await until(() => window.__lm.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .lm-btn'), ['again', 'menu'], 'unlocked: play again, or more benches');
  await frame.click('#menu');
  await until(() => window.__lm.state().screen === 'menu');
  assert.match(await text(frame, '#ch-mix .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-rate .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|vals|answer|score/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, phones and reduced motion: every dial works from the keyboard and by touch; the top row is tidy, every control is big, the board is face on, in full view and clear of the lamplighter', { skip, timeout: 1_500_000 }, async () => {
  // Keyboard only: Tab to a lamplighter, Enter; then the arrow keys on a slider, Space on a plus button, Enter on Light.
  const k = await open({ params: 'chapter=mix&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-skelly')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__lm.state().screen === 'play');
  await k.frame.evaluate(() => window.__lm.fast());
  await k.frame.focus('#dial-a-range');
  await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('ArrowRight'); await k.p.keyboard.press('ArrowLeft');
  assert.deepEqual((await k.state()).vals, { a: 2, b: 0 }, 'the arrow keys turn a slider, a stop a press');
  assert.equal(await k.frame.evaluate(() => document.getElementById('dial-a-range').getAttribute('aria-valuetext')), '2');
  const order = [];
  for (let i = 0; i < 5; i++) { await k.p.keyboard.press('Tab'); order.push(await k.frame.evaluate(() => document.activeElement.id)); }
  assert.deepEqual(order, ['dial-a-up', 'dial-b-dn', 'dial-b-range', 'dial-b-up', 'light'], 'Tab walks the workbench in order, ending on Light');
  await k.frame.focus('#dial-b-up');
  await k.p.keyboard.press(' '); await k.p.keyboard.press(' ');
  assert.deepEqual((await k.state()).vals, { a: 2, b: 2 }, 'Space on a plus button');
  await k.frame.focus('#light'); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'Too amber. Compare the two bars on the board. The gate pours 2 of amber for every 3 of blue.', 'Enter on Light runs the plan: 2 : 2 is too amber');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus('#dial-b-up'); await k.p.keyboard.press('Enter');
  await k.frame.focus('#light'); await k.p.keyboard.press('Enter');
  await k.until(() => window.__lm.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'light', 'the next round keeps the keyboard on the workbench');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); every control on the
  // workbench is at least 44 px and none overlap; the board is wide, keeps its 4 by 3 shape (so it faces the player),
  // sits between the words and the workbench with nothing of the hollow in front of it, and the lamplighter and the
  // rack never cover any of it; the smallest number or word on it is big enough to read. The same holds with a hint
  // showing (the hint box sits over the workbench, and the board moves up to clear it).
  const SIZES = [[1280, 800, 'no-preference', false, 420, 16], [390, 844, 'no-preference', true, 330, 11.5], [360, 640, 'reduce', true, 250, 9]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-mage') : m.frame.click('#hero-mage'));
      await m.until(() => window.__lm.state().screen === 'play');
      await m.frame.evaluate(() => window.__lm.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__lm.state().round === r && window.__lm.state().phase === 'play' && window.__lm.state().moving === 0, round, 180_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const head = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), ctl = [...document.querySelectorAll('#bar button, #bar input[type="range"], #say')].filter(vis).map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__lm.spot(), line = r($('line')).bottom, low = Math.min(r($('bar')).top, vis($('hint')) ? r($('hint')).top : 1e9), box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), rack = box(sp.rack), w = board.right - board.left, h = board.bottom - board.top;
          return { inside: [...head, ...ctl].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            head: head.some((a, i) => head.some((b, j) => j > i && hit(a, b))) || head.some(a => hit(a, gear)), three: head.length,
            oneLine: innerWidth > innerHeight ? head.every(a => a.top < head[0].bottom && a.bottom > head[0].top) : null,
            small: ctl.filter(b => b.height < 44 || b.width < 44).length, overlap: ctl.some((a, i) => ctl.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            hintIn: !vis($('hint')) || (r($('hint')).left >= 0 && r($('hint')).right <= innerWidth && r($('hint')).bottom <= r($('bar')).top + 0.5),
            // the board: big, 4 by 3, on screen between the words and the workbench, nothing in front of it
            wide: w, flat: Math.abs(w / h - 4 / 3) < 0.03, view: board.left >= 0 && board.right <= innerWidth && board.top >= line && board.bottom <= low, clear: sp.board.clear, read: sp.board.small,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line, hidden: hit(board, hero) || hit(board, rack) };
        });
        let fit = await measure();
        const look = { inside: true, head: false, three: 3, oneLine: width > height ? true : null, small: 0, overlap: false, scroll: false, hintIn: true, wide: fit.wide, flat: true, view: true, clear: true, read: fit.read, helper: true, hidden: false };
        assert.deepEqual(fit, look, `${at}: on screen, the top row tidy, the controls big and apart, the board flat, in view, unhidden and clear of the lamplighter`);
        assert.ok(fit.wide >= wide, `${at}: the board is ${fit.wide} px wide (at least ${wide})`);
        assert.ok(fit.read >= small, `${at}: the smallest number or word on the board is ${fit.read} px (at least ${small})`);
        // a wrong plan, run: the board's result look and the hint box are held to the same
        const wrong = wrongPlan(st);
        const d = st.dials.find(x => !x.lock);
        if (round === 1) await turn(m.frame, d, st.vals[d.id], wrong[d.id], touch); else await m.frame.evaluate(v => window.__lm.act('set', v), wrong);
        await m.frame.evaluate(v => window.__lm.act('set', v), wrong);
        await (touch ? m.frame.tap('#light') : m.frame.click('#light'));
        await m.p.waitForTimeout(120);
        fit = await measure();
        assert.equal((await m.state()).mode, 'hint', at); assert.ok(fit.read >= small, `${at}: the smallest mark of the board's result look is ${fit.read} px (at least ${small})`);
        assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden, fit.hintIn, fit.inside, fit.scroll], [true, true, true, false, true, true, false], `${at}: the board with its hint showing`);
        assert.ok(fit.wide >= wide * 0.8, `${at}: with the hint showing the board is still ${fit.wide} px wide`);
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.getElementById('light')).outlineStyle), 'dashed', `${at}: with reduced motion a plan that did not work shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__lm.act('solve'));
      }
      await m.until(() => window.__lm.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
