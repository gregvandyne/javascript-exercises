// Sub Zero (seed-games/sub-zero.html): Number Quest Pro Unit 2's game (The Cold Store, grades 6-7), a Kit 2 (Oomba3D)
// food-science lab at night with a thermometer that stands up as a number line. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, its import map is exactly
//     kit2ImportMap() (so a library bump that leaves the game behind fails here), it is the newest Busy Kitchen dressed
//     as a lab (night, no food piece loaded), and it has no timer, no lives and no losing;
//   - its rounds (the pure block between sub-zero:begin and sub-zero:end): six a chapter, every answer worked out again
//     here from what the round shows (the pot and the jar, the readings, the change), every wrong plan judged with one
//     of the game's own lines and drawn as it really turns out; the same first lap every time;
//   - its words: every line it says is a registered spoken line written the way it is said (no sign reaches the
//     voice), the screen prints the same line with the real signs (a true minus sign, a fraction, ÷ and ×), what the
//     chip and the lab screen show and the button labels are never sent to be spoken, and nothing is bought or sold;
//   - its registration: seeded, on the Learn shelf for grades 6-7, in the Number Quest course, tagged chapter by chapter
//     with the codes units.json gives the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, every instruction is
//     sent to be spoken (read-aloud is on by default), a wrong plan gets its hint and its picture and does not advance,
//     a right one stores a vial, and six right rounds post the game-over message exactly once, not before; then the
//     menu with no parameters, a round at the game's own speed, the keyboard, a drag on the thermometer, a desktop, a
//     390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. SZ_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/sub-zero.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/sub-zero.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'pro' && u.n === 2), STEPS = UNIT.steps;
const CHAPTERS = ['pour', 'below', 'change'];
const MINUS = '−';

// The game's own round maker and words, run on their own (no DOM, no 3D).
const SZ = (() => {
  const box = {}; vm.runInNewContext(/\/\* sub-zero:begin \*\/([\s\S]*?)\/\* sub-zero:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.SubZero;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain({ CHAPTERS: G.CHAPTERS, ROUNDS: G.ROUNDS, POUR: G.POUR }), round: (...a) => plain(G.round(...a)), judge: (r, v) => plain(G.judge(r, v)), params: p => plain(G.params(p)), shown: s => G.shown(s), deg: v => G.deg(v), chg: v => G.chg(v) };
})();
const T = lines.readGame('sub-zero').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];
/** A line as the screen prints it, and several lines as the words box shows them. */
const printed = l => (typeof l === 'string' ? l : SZ.shown(say(l[0], l[1])));
const box = ls => ls.map(printed).join(' ');

// What this test knows, written out here and never taken from the game.
/** A printed number: "4 1/2" is 4.5, "3/4" is 0.75, "−2.5°" is −2.5. */
const num = s => { const t = String(s).replace(MINUS, '-').replace('°', '').trim(), m = /^(-?)(?:(\d+) )?(\d+)\/(\d+)$/.exec(t); return m ? (m[1] ? -1 : 1) * ((+m[2] || 0) + m[3] / m[4]) : +t; };
/** A printed sum of two numbers: "4 + 3", "−4 + 3", "4 − 3". */
const sum = s => { const m = /^(\S+) ([+−]) (\S+)$/.exec(s); return num(m[1]) + (m[2] === '+' ? 1 : -1) * num(m[3]); };
const near = (a, b) => Math.abs(a - b) < 1e-9;
const vals = r => r.opts.map(o => o.v), right = r => r.opts[r.answer];

test('the file: the scanner passes it, nothing leaves the site, its import map is exactly kit2ImportMap(), and the kitchen is a lab', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.match(V.kit2ImportMap(), /oomba3d\/1\.2\.0\/oomba3d\.js/, 'the newest Oomba3D');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address, no network call, no device speech, no local store, no worker, no eval');
  // Busy Kitchen at night: the world Kitchen Rush plays by day, so the two never look alike
  assert.match(HTML, /start\(\{ theme: 'busy-kitchen', version: '1\.0\.0', graphics: 'auto', time: 'night', outline: true, settings: true \}\)/);
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/busy-kitchen')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.0', 'the newest shipped Busy Kitchen');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/busy-kitchen/1.0.0/theme.json'), 'utf8')), have = new Map(theme.pieces.map(p => [p.id, p]));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 14); for (const id of asked) assert.ok(have.has(id), `Busy Kitchen 1.0.0 has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/(?:piece\(|\[)'([a-z-]+)', -?[\d.]+, -?[\d.]+, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 22, `the lab is furnished from the theme (${used} pieces placed)`);
  // a lab, not a kitchen at dinner time and not a shop: no meal, no food, no order window, menu board or coin
  for (const id of asked) assert.ok(!have.get(id).tags.some(t => ['food', 'vegetable', 'collectible', 'shop', 'sign', 'coin', 'crate'].includes(t)), `${id} is furniture or lab ware, not food`);
  for (const id of ['fridge', 'oven', 'counter', 'counter-sink', 'jar', 'pot']) assert.ok(asked.includes(id), `the lab has the ${id}`);
  assert.match(HTML, /g\.hero\('rogue-hooded'/); assert.ok(theme.heroes.some(h => h.id === 'rogue-hooded'));
  assert.doesNotMatch(HTML, /hero\.pick|HEROES/, 'no helper picker: this is not the Launchpad game that shares the world');
  // every theme piece is washed in steel on a copy of its material (the shipped files are never changed)
  assert.match(HTML, /const c = x\.clone\(\); c\.onBeforeCompile/);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button shake and bring the helper back to standing
  // and two at the start: the loading screen's fallback wait for a first frame, and its removal after the fade
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 5);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
  assert.doesNotMatch(HTML, /<input|contenteditable|prompt\(/, 'nothing is typed');
});

test('rounds: six a chapter, every answer right for the reason the unit teaches, the first lap always the same', () => {
  assert.deepEqual([...SZ.CHAPTERS], CHAPTERS); assert.equal(SZ.ROUNDS, 6);
  assert.equal(SZ.round('pour', 0, 0), null); assert.equal(SZ.round('pour', 7, 0), null); assert.equal(SZ.round('shop', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(SZ.round(ch, n, 0), SZ.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it (what the words box prints, and the right answer)
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => SZ.round(ch, n, 0)), ans = r => (r.input === 'step' ? r.answer : right(r).t);
  assert.deepEqual(lap0('pour').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['jars', 'Pour 3 liters into jars that hold 1/2 of a liter each. How many jars do you fill?', 6],
    ['jars', 'Pour 4 1/2 liters into jars that hold 3/4 of a liter each. How many jars do you fill?', 6],
    ['expr', 'The pot holds 2 liters. Each jar holds 2/5 of a liter. Which division counts the jars?', '2 ÷ 2/5'],
    ['unit', 'You have 1 liter. Each jar holds 2/3 of a liter. How many jars does it fill?', '1 1/2'],
    ['part', 'You have 1/2 of a liter. The jar holds 3/4 of a liter. How full is the jar?', '2/3'],
    ['dec', 'Pour 2.4 liters into tubes that hold 0.3 of a liter each. How many tubes do you fill?', 8]]);
  assert.deepEqual(lap0('below').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['place', 'Set the marker to −8°.', -8], ['place', 'Set the marker to −2.5°.', -2.5], ['opp', 'The sample is at 6°. Set the marker to its opposite.', -6],
    ['order', 'Three readings. Which one is the coldest?', '−8°'], ['abs', 'Which reading is farthest from zero?', '−7°'],
    ['safe', 'The freezer must stay colder than −12°. Which reading is safe?', '−15°']]);
  assert.deepEqual(lap0('change').map(r => [r.kind, box(r.ask), ans(r)]), [
    ['reach', 'The sample is at −6°. Reach 4°. Set the change, then run it.', 10], ['reach', 'The sample is at 3°. Reach −5°. Set the change, then run it.', -8],
    ['pack', 'The chamber reads −2°. Take out the cold pack worth −5°. Set the new reading.', 3], ['same', 'Which sum is the same as 4 − (−3)?', '4 + 3'],
    ['rate', 'It cools 2.5° each minute for 4 minutes. What is the total change?', '−10°'],
    ['div', 'The reading drops from 0 to −12° in 4 equal steps. How big is each step?', '−3°']]);
  // and what is said and printed when each is found
  assert.deepEqual(lap0('pour').map(r => box(r.said)), ['Yes! 3 ÷ 1/2 = 6.', 'Yes! 4 1/2 ÷ 3/4 = 6.', 'Yes! Divide what you pour by the size of one jar. 2 ÷ 2/5 = 5.',
    'Yes! 1 ÷ 2/3 = 1 1/2. Dividing by 2/3 is the same as multiplying by 3/2.', 'Yes! 1/2 ÷ 3/4 = 2/3.', 'Yes! 2.4 ÷ 0.3 = 8.']);
  assert.deepEqual(lap0('below').map(r => box(r.said)), ['Yes! −8° is 8 below zero.', 'Yes! −2.5 is halfway between −2 and −3.', 'Yes! 6 and −6 are opposites, each 6 from zero.',
    'Yes! −8 < −2.5.', 'Yes! |−7| = 7.', 'Yes! −15 < −12: more than 12 below zero.']);
  assert.deepEqual(lap0('change').map(r => box(r.said)), ['Yes! −6 + 10 = 4.', 'Yes! 3 + (−8) = −5. That is the same as 3 − 8.', 'Yes! −2 − (−5) = 3. That is the same as −2 + 5.',
    'Yes! 4 − (−3) = 4 + 3, which is 7.', 'Yes! 4 × (−2.5) = −10.', 'Yes! −12 ÷ 4 = −3.']);
  assert.deepEqual(lap0('change').map(r => [printed(r.chip), printed(r.chipDone)]), [['−6 + ? = 4', '−6 + 10 = 4'], ['3 + ? = −5', '3 + (−8) = −5'], ['−2 − (−5) = ?', '−2 − (−5) = 3'],
    ['4 − (−3) = ?', '4 − (−3) = 7'], ['4 × (−2.5) = ?', '4 × (−2.5) = −10'], ['−12 ÷ 4 = ?', '−12 ÷ 4 = −3']]);

  const seen = { kinds: new Set(), spots: new Set(), keys: new Set(), wants: new Set(), signs: new Set() };
  const lineOk = (l, at) => { if (typeof l === 'string') return assert.doesNotMatch(l, /undefined|NaN|\{|-\d/, `${at}: ${l}`); assert.ok(T[l[0]] !== undefined, `${at}: ${l[0]} is one of the game's lines`); assert.doesNotMatch(say(l[0], l[1]), /undefined|NaN|\{/, `${at}: ${l[0]} has all its numbers`); seen.keys.add(l[0]); };
  const drawOk = (d, at) => { for (const l of d.lines || []) lineOk(l, at); for (const m of d.marks || []) { assert.ok(Number.isFinite(m.at) && typeof m.t === 'string' && ['ice', 'ok', 'warn', 'goal'].includes(m.tone), `${at}: mark ${JSON.stringify(m)}`); assert.doesNotMatch(m.t, /-\d/, at); } for (const a of d.arrows || []) assert.ok(Number.isFinite(a.from) && Number.isFinite(a.to) && a.from !== a.to, `${at}: arrow ${JSON.stringify(a)}`); };
  const common = (r, at) => {
    assert.ok(r.ask.length >= 1 && r.ask.length <= 3 && r.said.length >= 1 && r.said.length <= 2, at);
    for (const l of [...r.ask, ...r.said, r.chip, r.chipDone]) lineOk(l, at);
    for (const l of [...r.ask, ...r.said]) assert.ok(Array.isArray(l) && !/^(show|btn)\./.test(l[0]), `${at}: what is said is a spoken line (${l[0]})`);
    assert.ok(box(r.ask).length <= 100, `${at}: the instruction fits the words box (${box(r.ask).length})`);
    drawOk(r.pic.ask, at); drawOk(r.pic.found, at);
    if (r.pic.type === 'thermo') { const t = r.pic.th; assert.ok(t.min < 0 && t.max > 0, `${at}: zero is on the thermometer, between its ends`); for (const m of [...(r.pic.ask.marks || []), ...(r.pic.found.marks || [])]) assert.ok(m.at >= t.min && m.at <= t.max, `${at}: ${m.at} is on the thermometer`); for (const a of r.pic.found.arrows || []) assert.ok(Math.min(a.from, a.to) >= t.min && Math.max(a.from, a.to) <= t.max, at); }
    if (r.input === 'tiles') {
      // three tiles, all different, one right; every other has a hint, and the right one is judged right
      assert.equal(r.opts.length, 3, at); assert.deepEqual(r.choices, [0, 1, 2], at); assert.equal(new Set(r.opts.map(o => o.t)).size, 3, `${at}: the tiles differ (${r.opts.map(o => o.t)})`);
      for (const o of r.opts) assert.doesNotMatch(o.t, /-\d|undefined|NaN/, `${at}: a tile prints the true minus sign (${o.t})`);
      assert.deepEqual(SZ.judge(r, r.answer), { ok: true }, at);
      for (const i of r.choices.filter(v => v !== r.answer)) { const j = SZ.judge(r, i); assert.equal(j.ok, false, at); assert.ok(j.lines.length >= 1 && j.lines.length <= 2, at); for (const l of j.lines) lineOk(l, at); if (j.draw) drawOk(j.draw, at); }
      assert.equal(SZ.judge(r, 3), null, at); seen.spots.add(r.answer);
    } else {
      // a stepper: the right value is on it, every other value is a wrong plan with its own hint and its own picture
      const s = r.step; assert.ok(s.min <= r.answer && r.answer <= s.max && near(Math.round(r.answer / s.by) * s.by, r.answer) && s.start !== r.answer && s.start >= s.min && s.start <= s.max, `${at}: ${JSON.stringify(s)} holds ${r.answer}`);
      assert.deepEqual(SZ.judge(r, r.answer), { ok: true }, at); assert.equal(SZ.judge(r, s.max + s.by), null, at); assert.equal(SZ.judge(r, 'x'), null, at);
      for (let v = s.min; v <= s.max; v += s.by) if (v !== r.answer) { const j = SZ.judge(r, v); assert.equal(j.ok, false, `${at}: ${v}`); assert.ok(j.lines.length >= 1 && j.lines.length <= 2 && j.draw, `${at}: ${v} has a hint and a picture`); for (const l of j.lines) lineOk(l, at); drawOk(j.draw, `${at} tried ${v}`); }
    }
    seen.kinds.add(r.kind);
  };
  for (let lap = 0; lap < 300; lap++) {
    for (let n = 1; n <= 6; n++) {
      // ---- pour: how many jars of a fraction of a liter the pot fills (the quotient is the pot divided by the jar)
      const p = SZ.round('pour', n, lap), pa = `pour ${n} lap ${lap}`, pot = num(p.pic.pot.t), jar = num(p.pic.jar.t); common(p, pa);
      assert.equal(p.kind, ['jars', 'jars', 'expr', 'unit', 'part', 'dec'][n - 1], pa);
      assert.ok(near(p.pic.pot.v, pot) && near(p.pic.jar.v, jar) && jar > 0 && jar < 1, `${pa}: the pot ${p.pic.pot.t} and the jar ${p.pic.jar.t}, a fraction of a liter`);
      assert.ok(box(p.ask).includes(p.pic.pot.t) && box(p.ask).includes(p.pic.jar.t), `${pa}: the words give both amounts`);
      if (p.input === 'step') {
        assert.ok(near(p.answer, pot / jar) && Number.isInteger(p.answer) && p.answer >= 4 && p.answer <= 9, `${pa}: ${pot} ÷ ${jar} = ${p.answer} whole jars`);
        assert.equal(/\./.test(p.pic.pot.t), n === 6, `${pa}: decimals in round 6 only`);
        // too few: that many jars are full and the rest is still in the pot; too many: the pot fills the right number and the others stay empty
        const few = SZ.judge(p, p.answer - 2), many = SZ.judge(p, p.answer + 3);
        assert.deepEqual(few.lines, [L('p.hint.few')], pa); assert.ok(few.draw.jars === p.answer - 2 && few.draw.fill === p.answer - 2 && near(few.draw.left, 2 * jar), `${pa}: 2 jars' worth is left in the pot`);
        assert.deepEqual(many.lines, [L('p.hint.many')], pa); assert.ok(many.draw.jars === p.answer + 3 && near(many.draw.fill, p.answer) && many.draw.left === 0, pa); assert.deepEqual(many.draw.lines, [L('show.empty', { n: 3 })], pa);
        assert.equal(printed(p.chipDone), `${p.pic.pot.t} ÷ ${p.pic.jar.t} = ${p.answer}`, pa);
      } else if (p.kind === 'expr') {
        assert.equal(right(p).t, `${p.pic.pot.t} ÷ ${p.pic.jar.t}`, `${pa}: what is poured, divided by the size of one jar`);
        assert.deepEqual(p.opts.map(o => o.t).sort(), [`${p.pic.jar.t} ÷ ${p.pic.pot.t}`, `${p.pic.pot.t} × ${p.pic.jar.t}`, `${p.pic.pot.t} ÷ ${p.pic.jar.t}`].sort(), `${pa}: the division the wrong way round and the product are offered`);
        assert.ok(near(p.pic.found.fill, pot / jar), pa);
      } else {
        assert.ok(near(num(right(p).t), pot / jar), `${pa}: ${p.pic.pot.t} ÷ ${p.pic.jar.t} = ${right(p).t}`);
        if (p.kind === 'unit') { assert.equal(pot, 1, pa); assert.ok(p.opts.some(o => o.t === p.pic.jar.t), `${pa}: the size of the jar itself is offered, and is wrong`); assert.ok(pot / jar > 1, pa); }
        else { assert.ok(pot / jar < 1, `${pa}: less than one jar`); assert.ok(p.opts.some(o => near(num(o.t), jar / pot)), `${pa}: the division the wrong way round is offered`); assert.ok(p.opts.some(o => near(num(o.t), pot * jar)), `${pa}: the product is offered`); }
        assert.ok(near(p.pic.found.fill, pot / jar), pa);
      }

      // ---- below: numbers under zero on the thermometer
      const b = SZ.round('below', n, lap), ba = `below ${n} lap ${lap}`; common(b, ba);
      assert.equal(b.kind, ['place', 'place', 'opp', 'order', 'abs', 'safe'][n - 1], ba);
      if (b.kind === 'place') {
        assert.ok(b.answer < 0 && box(b.ask) === `Set the marker to ${SZ.deg(b.answer)}.`, `${ba}: a number below zero`);
        assert.equal(Number.isInteger(b.answer), n === 1, `${ba}: whole degrees, then halves`); assert.equal(b.step.by, n === 1 ? 1 : 0.5, ba); assert.equal(b.step.start, 0, ba);
        // the classic slip: the same size above zero
        assert.deepEqual(SZ.judge(b, -b.answer).lines, [L('b.hint.mirror', { n: -b.answer })], ba);
        assert.deepEqual(SZ.judge(b, b.answer + b.step.by).lines, [L('b.hint.down')], ba);
        if (n === 2) { if (b.answer - 1 >= b.step.min) assert.deepEqual(SZ.judge(b, b.answer - 1).lines, [L('b.hint.between', { a: Math.floor(-b.answer), b: Math.floor(-b.answer) + 1 })], ba); assert.ok(Math.floor(-b.answer) >= 1, ba); }
        assert.deepEqual(SZ.judge(b, b.answer + 1).draw.marks, [{ at: b.answer + 1, t: SZ.deg(b.answer + 1), tone: 'warn' }], `${ba}: the marker is shown where it was put`);
      } else if (b.kind === 'opp') {
        assert.ok(b.given !== 0 && b.answer === -b.given && box(b.ask).includes(`at ${SZ.deg(b.given)}.`), `${ba}: the opposite of ${b.given}`);
        assert.deepEqual(SZ.judge(b, b.given).lines, [L('b.hint.same')], ba); assert.deepEqual(SZ.judge(b, 0).lines, [L('b.hint.dist', { n: Math.abs(b.given) })], ba); seen.signs.add(Math.sign(b.given));
      } else if (b.kind === 'order') {
        const vs = vals(b); assert.ok(vs.every(Number.isFinite) && new Set(vs).size === 3, ba);
        assert.equal(right(b).v, b.want === 'colder' ? Math.min(...vs) : Math.max(...vs), `${ba}: the ${b.want === 'colder' ? 'least' : 'greatest'} of ${vs}`);
        assert.ok(vs.filter(v => v < 0).length >= 2, `${ba}: two readings below zero to compare`); assert.equal(b.want, lap % 2 ? 'warmer' : 'colder', ba);
        assert.deepEqual(b.opts.map(o => o.t), vs.map(SZ.deg), ba); seen.wants.add(b.want);
      } else if (b.kind === 'abs') {
        const vs = vals(b), far = Math.max(...vs.map(Math.abs)); assert.equal(Math.abs(right(b).v), far, `${ba}: the farthest of ${vs}`); assert.equal(vs.filter(v => Math.abs(v) === far).length, 1, ba);
        assert.ok(vs.some(v => v > 0) && vs.some(v => v < 0), `${ba}: readings on both sides of zero`); seen.signs.add(right(b).v > 0 ? 'abs+' : 'abs-');
        for (const i of b.choices.filter(v => v !== b.answer)) assert.deepEqual(SZ.judge(b, i).draw.arrows.map(a => [a.from, a.to, a.t]), [[0, vs[i], String(Math.abs(vs[i]))]], `${ba}: a wrong pick shows its own distance from zero`);
      } else {
        const vs = vals(b); assert.ok(b.limit < 0 && box(b.ask).includes(SZ.deg(b.limit)), ba);
        assert.deepEqual(vs.filter(v => v < b.limit), [right(b).v], `${ba}: one reading is colder than ${b.limit}`);
        assert.ok(vs.includes(-b.limit), `${ba}: the limit's size above zero is offered`); assert.ok(vs.some(v => v < 0 && v > b.limit), `${ba}: a reading below zero that is not cold enough is offered`);
      }

      // ---- change: the four operations with negative numbers, as moves on the thermometer
      const c = SZ.round('change', n, lap), ca = `change ${n} lap ${lap}`; common(c, ca);
      if (c.kind === 'reach') {
        assert.ok(n <= 2 && c.from + c.answer === c.to && Math.sign(c.from) === -Math.sign(c.to) && c.from !== 0, `${ca}: from ${c.from} by ${c.answer} to ${c.to}, across zero`);
        assert.equal(c.answer > 0, n === 1, `${ca}: up in round 1, down in round 2`); assert.equal(box(c.ask), `The sample is at ${SZ.deg(c.from)}. Reach ${SZ.deg(c.to)}. Set the change, then run it.`, ca);
        // a wrong plan is run: where it lands is drawn and said
        const j = SZ.judge(c, c.answer - Math.sign(c.answer)); assert.deepEqual(j.lines, [L(`c.hint.land.${c.to - Math.sign(c.answer) < 0 ? 'neg' : 'pos'}`, { n: Math.abs(c.to - Math.sign(c.answer)) }), L('c.hint.zero', { a: Math.abs(c.from), b: Math.abs(c.to) })], ca);
        assert.deepEqual(j.draw.arrows.map(a => [a.from, a.to, a.t]), [[c.from, c.to - Math.sign(c.answer), SZ.chg(c.answer - Math.sign(c.answer))]], `${ca}: the arrow of the plan that was run`);
        assert.deepEqual(SZ.judge(c, -c.answer).lines, [L(c.answer > 0 ? 'c.hint.sign.up' : 'c.hint.sign.down')], ca); assert.deepEqual(SZ.judge(c, 0).lines, [L('c.hint.none')], ca);
      } else if (c.kind === 'pack') {
        assert.ok(n === 3 && c.from < 0 && c.pack < 0 && c.answer === c.from - c.pack && c.step.start === c.from, `${ca}: ${c.from} − (${c.pack}) = ${c.answer}`);
        assert.ok(c.answer > c.from, `${ca}: taking cold away warms the chamber`);
        assert.deepEqual(SZ.judge(c, c.from + c.pack >= c.step.min ? c.from + c.pack : c.from - 1).lines, [L('c.hint.pack.cold')], `${ca}: the reading that goes down is the classic slip`);
        assert.deepEqual(SZ.judge(c, c.from).lines, [L('c.hint.pack.move')], ca);
        assert.equal(printed(c.chipDone), `${c.from} − (${c.pack}) = ${c.answer}`.replace(/-/g, MINUS), ca);
      } else if (c.kind === 'same') {
        const m = /^Which sum is the same as (\d+) − \(−(\d+)\)\?$/.exec(box(c.ask)); assert.ok(n === 4 && m, ca);
        assert.equal(sum(right(c).t), +m[1] + +m[2], `${ca}: ${right(c).t}`); assert.equal(c.opts.filter(o => sum(o.t) === +m[1] + +m[2]).length, 1, `${ca}: one tile has the value`);
        assert.ok(c.opts.some(o => sum(o.t) === +m[1] - +m[2]), `${ca}: the sign simply dropped is offered`);
      } else if (c.kind === 'rate') {
        assert.ok(n === 5 && c.rate < 0 && c.minutes >= 2, ca); assert.equal(right(c).v, c.rate * c.minutes, `${ca}: ${c.minutes} × ${c.rate}`);
        assert.ok(vals(c).includes(-c.rate * c.minutes) && vals(c).includes(c.rate - c.minutes), `${ca}: the positive product and the sum are offered`);
        assert.deepEqual(c.pic.found.arrows.map(a => a.to - a.from), Array(c.minutes).fill(c.rate), `${ca}: ${c.minutes} equal moves down`);
      } else if (c.kind === 'div') {
        assert.ok(n === 6 && lap % 2 === 0 && c.total < 0 && c.steps >= 2, ca); assert.equal(right(c).v, c.total / c.steps, `${ca}: ${c.total} ÷ ${c.steps}`);
        assert.ok(Number.isInteger(right(c).v) && vals(c).includes(-c.total / c.steps), `${ca}: the positive quotient is offered`);
        assert.deepEqual(c.pic.found.arrows.map(a => a.to - a.from), Array(c.steps).fill(c.total / c.steps), ca); assert.equal(c.pic.found.arrows.at(-1).to, c.total, ca);
      } else {
        assert.equal(c.kind, 'back', ca); assert.ok(n === 6 && lap % 2 === 1 && c.rate < 0, ca);
        assert.equal(right(c).v, -c.minutes * c.rate, `${ca}: (−${c.minutes}) × (${c.rate}) is positive`); assert.ok(right(c).v > 0 && vals(c).includes(c.minutes * c.rate), `${ca}: the negative product is offered`);
        assert.equal(c.pic.found.arrows[0].from, right(c).v, ca); assert.equal(c.pic.found.arrows.at(-1).to, 0, `${ca}: the reading comes down to 0 now`);
      }
    }
  }
  // over the laps: every kind of round, every way of asking, and the right tile in every place
  assert.deepEqual([...seen.kinds].sort(), ['abs', 'back', 'dec', 'div', 'expr', 'jars', 'opp', 'order', 'pack', 'part', 'place', 'rate', 'reach', 'safe', 'same', 'unit']);
  assert.deepEqual([...seen.spots].sort(), [0, 1, 2]); assert.deepEqual([...seen.wants].sort(), ['colder', 'warmer']); assert.deepEqual([...seen.signs].map(String).sort(), ['-1', '1', 'abs+', 'abs-']);
  for (const k of Object.keys(T).filter(k => /^[pbc]\./.test(k))) assert.ok(seen.keys.has(k), `${k} is used in some round`);
  // the nine set pours: each quotient is right, and no two of a round's three are the same problem
  for (const [n, set] of Object.entries(SZ.POUR)) { assert.equal(set.length, 3); assert.equal(new Set(set.map(P => `${P[1]}÷${P[3]}`)).size, 3, `round ${n}`); for (const P of set) { assert.ok(near(P[0], num(P[1])) && near(P[2], num(P[3])) && near(P[4], P[0] / P[2]), `round ${n}: ${P[1]} ÷ ${P[3]} = ${P[4]}`); if (P[5]) assert.ok(near(num(P[5]), P[4]), `round ${n}: ${P[5]}`); } }
  assert.deepEqual(SZ.params({ chapter: 'change', lock: 1 }), { chapter: 'change', lock: true });
  assert.deepEqual(SZ.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(SZ.params(undefined), { chapter: '', lock: false });
});

test('words: every line is a registered spoken line written as it is said; the screen prints it with the real signs; nothing is bought or sold', () => {
  assert.ok(lines.TTS_GAMES.has('sub-zero'));
  const ok = text => lines.allowedLine('sub-zero', 'en', text);
  const NUMS = { n: 3, m: 5, a: 4, b: 2, t: '7' };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 120);
  for (const k of spoken) {
    assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
    // the voice is handed words and digits only: no sign, no fraction slash, no bracket
    assert.doesNotMatch(T[k], /[−+×÷=<>|°()/\\^]|-\d/, `${k} is written the way it is said: ${T[k]}`);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 3, `${k} is at most three sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 22, `${k} is short enough to hear: ${T[k]}`);
  }
  // a decimal goes where a number goes; a word never does, and neither does a sign
  assert.ok(ok('Yes! 2.4 divided by 0.3 equals 8.')); assert.ok(ok('It cools 2.5 degrees each minute for 4 minutes. What is the total change?'));
  assert.equal(ok('Set the marker to negative eight degrees.'), null); assert.equal(ok('Set the marker to negative -8 degrees.'), null); assert.equal(ok('Set the marker to −8°.'), null, 'the printed form is never what is spoken');
  assert.equal(ok('Pour 3 liters into jars that hold 1 half of a gallon each. How many jars do you fill?'), null, 'only the game’s own lines');
  // what the chip and the lab screen show and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('Pour and Count'), null); assert.equal(ok('−6 + 10 = 4'), null);
  // The screen prints a spoken line with the real signs, and the deck's own read-aloud would say the printed line the
  // same way the game says it (seed-lessons/number-quest/math-text.js): one way of saying maths on the whole street.
  const PRINT = [['Yes! Negative 6 plus 10 equals 4.', 'Yes! −6 + 10 = 4.'], ['Yes! 3 plus negative 8 equals negative 5.', 'Yes! 3 + (−8) = −5.'], ['Yes! Negative 2 minus negative 5 equals 3.', 'Yes! −2 − (−5) = 3.'],
    ['Yes! 4 times negative 2.5 equals negative 10.', 'Yes! 4 × (−2.5) = −10.'], ['Yes! Negative 12 divided by 4 equals negative 3.', 'Yes! −12 ÷ 4 = −3.'], ['Yes! Negative 3 times negative 2 equals 6.', 'Yes! −3 × (−2) = 6.'],
    ['Yes! 4 and 1 half divided by 3 fourths equals 6.', 'Yes! 4 1/2 ÷ 3/4 = 6.'], ['Dividing by 2 thirds is the same as multiplying by 3 halves.', 'Dividing by 2/3 is the same as multiplying by 3/2.'],
    ['1 third times 1 half is 1 sixth. Divide instead.', '1/3 × 1/2 is 1/6. Divide instead.'], ['Yes! The absolute value of negative 7 equals 7.', 'Yes! |−7| = 7.'], ['Yes! Negative 8 is less than negative 2.5.', 'Yes! −8 < −2.5.'],
    ['Yes! Negative 4 is greater than negative 5.', 'Yes! −4 > −5.'], ['The sample is at negative 6 degrees.', 'The sample is at −6°.'], ['Negative 3 degrees is 3 steps from zero.', '−3° is 3 steps from zero.'],
    ['Removing negative 5 moves the reading up by 5.', 'Removing −5 moves the reading up by 5.'], ['Count 6 to reach zero, then 4 more.', 'Count 6 to reach zero, then 4 more.'], ['It happens 4 times. Multiply, do not add.', 'It happens 4 times. Multiply, do not add.']];
  for (const [said, shown] of PRINT) assert.equal(SZ.shown(said), shown);
  for (const [said, shown] of PRINT.filter(x => /^Yes! [^.]*equals/.test(x[0]) && !/absolute/.test(x[0]))) assert.equal(sayMath(shown).replace(/[()]/g, '').toLowerCase(), said.toLowerCase(), `the deck would say "${shown}" as the game does`);
  for (const k of spoken) { const s = SZ.shown(say(k, NUMS)); assert.doesNotMatch(s, /\d (degrees?|halves|half|thirds?|fourths?|fifths?|sixths?|eighths?|tenths?)\b|[Nn]egative \d|-\d|\d (plus|minus|times|divided by|equals) [\d(−]/, `${k} prints with its signs: ${s}`); }
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|speak|L|S)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined || T[m[1] + '.pos'] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  assert.deepEqual([T['ch.pour'], T['ch.below'], T['ch.change'], T.title], ['Pour and Count', 'Below Zero', 'Change the Reading', 'Sub Zero']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule), and the units by their US names
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(litres?|metres?|centre|colou?red|colours?|favourites?|grey|maths)\b/i, text);
  // nothing is bought, sold, priced, earned or owed, in the game or in its listing; and no hurry
  const SHOP = /[$€£¢]|\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|owe|earn|purchase|customer|order|tax|discount|interest|commission|coins?|dollars?|cents?)\b/i;
  for (const text of Object.values(T)) { assert.doesNotMatch(text, SHOP, `a lab, not a shop: ${text}`); assert.doesNotMatch(text, /\b(hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text); }
  assert.doesNotMatch(META.description + ' ' + META.tags + ' ' + META.notes.replace('nothing bought or sold', ''), SHOP);
  // written for ages 11 to 14, not for a five-year-old
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(little|tiny|yummy|yay|wow|helper|party|kitty|bunny)\b/i, text);
});

test('registration: seeded, on the Learn shelf, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('sub-zero'));
  assert.equal(META.slug, 'sub-zero'); assert.equal(META.title, 'Sub Zero'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['sub-zero'], { subject: 'math', from: 6, to: 7 }, 'on the Learn shelf as math for grades 6 and 7');
  for (const f of ['public/covers/sub-zero.jpg', 'public/og/sub-zero.jpg', 'scripts/covers/sub-zero.recipe.js', 'public/img/nq/sub-zero/pour-and-count.webp', 'public/img/nq/sub-zero/below-zero.webp', 'public/img/nq/sub-zero/change-the-reading.webp']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'sub-zero'), { slug: 'sub-zero', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('sub-zero'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.SUBZERO_CHAPTERS, { pour: ['6.NS.A.1', '6.NS.B.3'], below: ['6.NS.C.5', '6.NS.C.6', '6.NS.C.7'], change: ['7.NS.A.1', '7.NS.A.2', '7.NS.A.3'] });
  assert.deepEqual(TAGS.gameCodes('sub-zero', 'ccss-math'), Object.values(TAGS.SUBZERO_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('sub-zero'));
  assert.equal(UNIT.title, 'The Cold Store'); assert.equal(UNIT.stamp, 'Zero Gear'); assert.equal(UNIT.tool, 'sub-zero'); assert.equal(UNIT.planned, undefined); assert.equal(UNIT.reserved, undefined);
  assert.equal(UNIT.teacherNotes.length, 3); assert.ok(UNITS.tiers.pro.stones.includes('Zero Gear')); assert.equal(UNITS.tiers.pro.status, 'open', 'the grades 6-8 street is open to everyone (2026-11-15)');
  assert.deepEqual(STEPS.map(s => [s.n, s.order, s.titles.pro]), [['2.1', 5, 'Divide by a fraction'], ['2.2', 6, 'Below zero: opposites and absolute value'], ['2.3', 7, 'Add, subtract, multiply and divide with negatives']]);
  // the statements the unit's steps cite are locked with the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).proCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.SUBZERO_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.pro, st = s.standards.pro, id = CHAPTERS[i];
    assert.equal(s.reserved, undefined); assert.equal(g.slug, 'sub-zero'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`); assert.equal(g.chapter, g.chapterTitle);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(SZ.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['6', '7', '']) assert.deepEqual(TAGS.stepGameCodes('sub-zero', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('sub-zero', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('sub-zero', 'ccss-math', '6', ''), ['6.NS.A.1', '6.NS.B.3', '6.NS.C.5', '6.NS.C.6', '6.NS.C.7'], 'an unlocked grade 6 step claims the game’s grade 6 codes');
  assert.deepEqual(TAGS.stepGameCodes('sub-zero', 'ccss-math', '7', ''), ['7.NS.A.1', '7.NS.A.2', '7.NS.A.3'], 'and a grade 7 step its grade 7 codes');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.SZ_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
// lap: the lap the first play takes (0, the fixed lap, whose numbers the checks below know), or null for the
// random lap a play really takes.
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, lap = 0 } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Sub Zero' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__sz.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 60_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(1500); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
/** A wrong plan for a round: the slip the unit names where there is one. */
const wrongOf = s => (s.input === 'tiles' ? s.choices.find(v => v !== s.answer) : s.kind === 'place' ? -s.answer : s.kind === 'opp' ? s.given : s.kind === 'reach' ? s.answer - Math.sign(s.answer) : s.kind === 'pack' ? s.from - 1 : s.answer + 2);
/** What the stepper shows for a value. */
const valueText = (s, v) => (s.step.show === 'deg' ? SZ.deg(v) : s.step.show === 'chg' ? SZ.chg(v) : `${v} ${s.step.show}${v === 1 ? '' : 's'}`);
/** Try a plan with the real controls: the handle sets the stepper, the click runs it; or a click on a tile. */
async function tryPlan(g, s, v, tap) {
  const go = sel => (tap ? g.frame.tap(sel) : g.frame.click(sel));
  if (s.input === 'tiles') return go('#sz-n' + v);
  await g.frame.evaluate(x => window.__sz.act('set', x), v); return go('#sz-go');
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong plan shows what it does and does not advance, six right rounds post game over once`, { skip, timeout: 600_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1`, lap: null });   // the lap a real play takes
    const { frame, state, until } = g;
    // the start card: the chapter by its name, one Start button, no menu and no helper to pick
    let s = await state();
    assert.deepEqual([s.screen, s.lock, s.hero], ['start', true, 'rogue-hooded']);
    assert.deepEqual(await ids(frame, '#card .sz-btn'), ['start']); assert.equal(await text(frame, '#card h2'), T[`ch.${chapter}`]);
    assert.ok((await g.spoken()).includes(T['start.line']), 'read-aloud is on by default: the first line is sent to be spoken before any tap');
    await g.shot(`${chapter}-0-start`);
    await frame.click('#start');
    await until(() => window.__sz.state().screen === 'play');
    s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds], [chapter, true, 1, 6], 'straight into the locked chapter');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-pour, #ch-below, #menu').length), 0);
    await until(() => window.__sz.state().moving === 0, null, 120_000);   // round 1's screen has popped in at the game's own speed
    await frame.evaluate(() => window.__sz.fast());   // no waiting between the steps of a round; the clicks are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the screen as it is asked`);
      if (round === 1) { assert.ok(Number.isInteger(s.lap) && s.lap >= 1, 'a play takes a random lap, not the fixed lap 0'); g.lap1 = s.lap; } else assert.equal(s.lap, g.lap1, 'one lap for the whole play');
      const want = SZ.round(chapter, round, s.lap);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      // the instruction: printed with its signs, and every line of it sent to be spoken as it is said
      assert.equal(await text(frame, '#askt'), box(s.ask), `round ${round}: the instruction`);
      for (const [k, v] of s.ask) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), printed(s.chip), `round ${round}: the chip`);
      assert.deepEqual(s.onStage, { board: true, vials: round - 1 }, `round ${round}: the lab screen, and ${round - 1} vials in the freezer`);
      // the controls: a stepper with its value and a run button, or three tiles
      if (s.input === 'step') {
        assert.deepEqual(await ids(frame, '#bar > *'), ['sz-dn', 'sz-val', 'sz-up', 'sz-go'], `round ${round}: the stepper`);
        assert.equal(s.value, s.step.start); assert.equal(await text(frame, '#sz-val'), valueText(s, s.step.start), `round ${round}: the stepper starts at ${s.step.start}`);
        assert.equal(await text(frame, '#sz-go .l'), { jars: 'Pour', marker: 'Lock in' }[s.step.live] || 'Run');
      } else {
        assert.deepEqual(await ids(frame, '#bar > *'), ['sz-n0', 'sz-n1', 'sz-n2'], `round ${round}: three tiles`);
        assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .sz-btn')].map(b => b.getAttribute('aria-label'))), s.opts.map(o => o.t), `round ${round}: what the tiles say`);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('#bar .fr').length), s.opts.reduce((k, o) => k + (o.t.match(/\d+\/\d+/g) || []).length, 0), `round ${round}: every fraction on a tile is set one number over the other`);
      }
      await g.shot(`${chapter}-${round}`);
      // a wrong plan: its hint, a shake, the screen showing what the plan does, the same round, nothing reported
      const wrong = wrongOf(s), verdict = SZ.judge(s, wrong);
      await tryPlan(g, s, wrong);
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong plan does not advance, and the screen shows what it does`);
      assert.deepEqual(after.tried, verdict.draw || null, `round ${round}: the picture of the plan that was run`);
      assert.equal(await text(frame, '#hint'), box(verdict.lines), `round ${round}: the hint that says why`);
      for (const [k, v] of verdict.lines) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.sz-btn.no').length), 1, `round ${round}: and a shake on what was pressed`);
      assert.equal(after.onStage.vials, round - 1, `round ${round}: no vial for a wrong plan`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-tried`);
      if (s.input === 'step') {
        // a new plan takes the screen back to the question
        await frame.click(s.answer > wrong ? '#sz-up' : '#sz-dn');
        const again = await state(); assert.deepEqual([again.mode, again.tried, again.value], ['ask', null, wrong + (s.answer > wrong ? 1 : -1) * s.step.by], `round ${round}: stepping makes a new plan`);
        assert.equal(await text(frame, '#hint'), null);
      }
      await tryPlan(g, s, s.answer);
      await until(r => { const t = window.__sz.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .sz-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .sz-askt'), 'Six samples are in the deep freeze. Well done.');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines, and none carries a sign.
    for (const line of new Set(await g.spoken())) { assert.ok(lines.allowedLine('sub-zero', 'en', line), `"${line}" is a registered line`); assert.doesNotMatch(line, /[−×÷=°|]|\d\/\d/, `"${line}" is said in words`); }
    // Play again starts the chapter over (other numbers), and nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__sz.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.ok(s.lap >= 1 && s.lap !== g.lap1, 'Play again takes another lap'); assert.deepEqual(Object.fromEntries(Object.keys(SZ.round(chapter, 1, s.lap)).map(k => [k, s[k]])), SZ.round(chapter, 1, s.lap), 'the next lap’s first round');
    assert.equal(s.onStage.vials, 0, 'the rack is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a menu of the three chapters; at the game’s own speed a wrong plan shows what it does, a right one sends a vial to the freezer and only then the next round', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  assert.equal((await state()).screen, 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .sz-menu .sz-btn')].map(b => [b.id, b.querySelector('.l').textContent])), [['ch-pour', 'Pour and Count'], ['ch-below', 'Below Zero'], ['ch-change', 'Change the Reading']]);
  await g.shot('menu');
  // Change the Reading, round 1 (from −6° to 4°), with nothing hurried and the real + button
  await frame.click('#ch-change');
  await until(() => window.__sz.state().screen === 'play' && window.__sz.state().moving === 0, null, 120_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.value, s.onStage.vials], ['change', false, 'reach', 'ask', 0, 0]);
  for (let i = 0; i < 9; i++) await frame.click('#sz-up');
  assert.equal(await text(frame, '#sz-val'), '+9°'); assert.equal((await state()).mode, 'ask');
  await frame.click('#sz-go');
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', 'You landed on 3°. Count 6 to reach zero, then 4 more.']);
  await until(() => window.__sz.state().moving === 0, null, 120_000);   // the screen has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  await g.shot('change-tried');
  // the right plan: the chip shows the sum, the screen shows it found, a vial flies to the freezer, then round 2
  await frame.click('#sz-up'); await frame.click('#sz-go');
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), '−6 + 10 = 4'); assert.equal(await text(frame, '#askt'), 'Yes! −6 + 10 = 4.');
  await frame.click('#sz-up'); await frame.click('#sz-go');   // presses while the answer is showing change nothing
  assert.deepEqual([(await state()).phase, (await state()).value], ['right', 10]);
  assert.equal(s.onStage.vials, 1, 'the vial is on its way');
  await g.shot('change-found');
  await until(() => window.__sz.state().round === 2, null, 180_000);
  assert.deepEqual([(await state()).onStage.vials, (await state()).mode], [1, 'ask'], 'one vial in the rack, and the next screen');
  // back at the menu after a whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__sz.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__sz.state().round === n && window.__sz.state().phase === 'play', r); await frame.evaluate(() => window.__sz.act('solve')); }
  await until(() => window.__sz.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .sz-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__sz.state().screen === 'menu');
  assert.match(await text(frame, '#ch-change .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-pour .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score|value/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, a drag, phones and reduced motion: every control is a button a key can press; the top row is tidy, the lab screen is big, face on, in full view and clear of the helper', { skip, timeout: 900_000 }, async () => {
  // Keyboard only: Tab to Start, Enter; arrows move the stepper, Enter runs the plan; 1 to 3 pick a tile.
  const k = await open({ params: 'chapter=below&lock=1' });
  for (let i = 0; i < 8 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'start')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__sz.state().screen === 'play');
  await k.frame.evaluate(() => { window.__sz.fast(); const a = document.activeElement; if (a && a.blur) a.blur(); });
  for (let i = 0; i < 3; i++) await k.p.keyboard.press('ArrowUp');
  assert.equal(await text(k.frame, '#sz-val'), '3°', 'the up arrow moves the stepper up');
  await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), 'Too warm. Move the marker down.', 'Enter runs the plan'); assert.equal((await k.state()).round, 1);
  for (let i = 0; i < 11; i++) await k.p.keyboard.press(i % 2 ? '-' : 'ArrowDown');
  assert.equal(await text(k.frame, '#sz-val'), '−8°');
  await k.frame.focus('#sz-go'); await k.p.keyboard.press(' ');
  await k.until(() => window.__sz.state().round === 2);
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'sz-go', 'the next round keeps the keyboard on the controls');
  await k.frame.focus('#sz-dn'); await k.p.keyboard.press('Tab'); assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'sz-up', 'Tab walks the buttons in order');
  await k.frame.evaluate(() => { window.__sz.act('solve'); }); await k.until(() => window.__sz.state().round === 3);
  await k.frame.evaluate(() => { window.__sz.act('solve'); }); await k.until(() => window.__sz.state().round === 4 && window.__sz.state().phase === 'play');
  const s4 = await k.state(), miss = s4.choices.find(v => v !== s4.answer);
  await k.p.keyboard.press(String(miss + 1));
  assert.equal(await text(k.frame, '#hint'), box(SZ.judge(s4, miss).lines), 'a number key picks a tile');
  await k.p.keyboard.press(String(s4.answer + 1));
  await k.until(() => window.__sz.state().round === 5);
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // A drag: the mouse on the thermometer puts the marker there, and follows as it moves (Below Zero, round 1).
  const d = await open({ params: 'chapter=below&lock=1' });
  await d.frame.click('#start');
  await d.until(() => window.__sz.state().screen === 'play' && window.__sz.state().moving === 0, null, 120_000);
  await d.frame.evaluate(() => window.__sz.fast());
  const at = v => d.frame.evaluate(x => window.__sz.at(x), v);
  let [x, y] = await at(5);
  await d.p.mouse.move(x, y); await d.p.mouse.down();
  assert.equal((await d.state()).value, 5, 'pressing on 5 puts the marker on 5');
  [x, y] = await at(-8); await d.p.mouse.move(x, y, { steps: 6 });
  assert.equal((await d.state()).value, -8, 'and it follows the drag down to −8'); assert.equal(await text(d.frame, '#sz-val'), '−8°');
  await d.p.mouse.up();
  [x, y] = await at(2); await d.p.mouse.move(x, y); assert.equal((await d.state()).value, -8, 'a move with no button down changes nothing');
  await d.frame.click('#sz-go'); await d.until(() => window.__sz.state().round === 2);
  assert.deepEqual(d.errors, []);
  await d.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the controls are big and
  // apart; the lab screen is wide, keeps its 4 by 3 shape (so it faces the player), sits between the words and the
  // controls with nothing of the lab in front of it, and the helper and the freezer never cover any of it; the smallest
  // number or word on it is big enough to read, as asked and with a wrong plan drawn on it.
  const SIZES = [[960, 600, 'no-preference', false, 420, 15], [390, 844, 'no-preference', true, 330, 11.5], [360, 640, 'reduce', true, 270, 10]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#start') : m.frame.click('#start'));
      await m.until(() => window.__sz.state().screen === 'play');
      await m.frame.evaluate(() => window.__sz.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__sz.state().round === r && window.__sz.state().phase === 'play' && window.__sz.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), where = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, where);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar > *')].map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__sz.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), chest = box(sp.chest), w = board.right - board.left, h = board.bottom - board.top;
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)), three: top.length,
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 56 || b.width < 56).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // the lab screen: big, 4 by 3, on screen between the words and the controls, nothing in front of it
            wide: w, flat: Math.abs(w / h - 4 / 3) < 0.03, view: board.left >= 0 && board.right <= innerWidth && board.top >= line && board.bottom <= bar, clear: sp.board.clear, read: sp.board.small,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line, hidden: hit(board, hero) || hit(board, chest) };
        });
        let fit = await measure();
        const look = { inside: true, top: false, three: 3, oneLine: width > height ? true : null, small: 0, n: st.input === 'step' ? 4 : 3, overlap: false, scroll: false, wide: fit.wide, flat: true, view: true, clear: true, read: fit.read, helper: true, hidden: false };
        assert.deepEqual(fit, look, `${where}: on screen, the top row tidy, the controls big and apart, the lab screen flat, in view, unhidden and clear of the helper`);
        assert.ok(fit.wide >= wide, `${where}: the lab screen is ${fit.wide} px wide (at least ${wide})`);
        assert.ok(fit.read >= small, `${where}: the smallest number or word on the lab screen is ${fit.read} px (at least ${small})`);
        // a wrong plan drawn on the screen is held to the same
        await tryPlan(m, st, wrongOf(st), touch);
        fit = await measure();
        assert.equal((await m.state()).mode, 'hint', where); assert.ok(fit.read >= small, `${where}: the smallest mark of a wrong plan's picture is ${fit.read} px (at least ${small})`);
        assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden, fit.inside], [true, true, true, false, true], `${where}: the lab screen with a wrong plan on it`);
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(() => getComputedStyle(document.querySelector('.sz-btn.no')).outlineStyle), 'dashed', `${where}: with reduced motion a wrong plan shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        if (round === 1 && width === 390) await m.shot(`${chapter}-390`);
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(() => window.__sz.act('solve'));
      }
      await m.until(() => window.__sz.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
