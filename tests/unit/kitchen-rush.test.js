// Kitchen Rush (seed-games/kitchen-rush.html): Number Quest Launchpad Unit 7's game and the Launchpad finale, a Kit 2
// (Oomba3D) busy kitchen getting a garden party ready, for kindergarten to grade 2: the helper measures, tells the
// time, counts the tip jar, sorts and reads graphs, and in The Garden Gate looks back over the whole tier. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between kitchen-rush:begin and kitchen-rush:end): six a chapter, every answer
//     re-derived here from what the board draws (lengths, clock hands, coin values, counts); a wrong choice's hint is
//     one of the game's lines; the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), what the chip shows
//     and the button labels are never sent to be spoken, and nothing is bought, sold or priced;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the four steps (the finale among them), and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode, the finale too: it loads with no error and asks for nothing outside /vendor, the
//     board is on the wall, a wrong answer gets its hint, the board's "why" look and does not advance the round, every
//     instruction is sent to be spoken, a right answer puts a dish on the party table, and a correct play of all six
//     rounds posts the game-over message (the course step's completion signal) exactly once, not before; then the
//     picture menu with no parameters, a round at the game's own speed, the keyboard, a desktop, a 390 px and a 360 px
//     phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. KR_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/kitchen-rush.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/kitchen-rush.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 7), STEPS = UNIT.steps;
const CHAPTERS = ['measure', 'clock', 'chart', 'gate'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const KR = (() => {
  const box = {}; vm.runInNewContext(/\/\* kitchen-rush:begin \*\/([\s\S]*?)\/\* kitchen-rush:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.KitchenRush;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain(G), round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('kitchen-rush').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];
const pad = m => String(m).padStart(2, '0');

// What this test knows, written out here and never taken from the game.
const CENTS = { p: 1, n: 5, d: 10, q: 25 };
const AP = { breakfast: 'a.m.', snack: 'p.m.', bedtime: 'p.m.' };
const SIDES = { triangle: 3, square: 4, rectangle: 4, hexagon: 6, circle: 0 };
const SHARE = { 2: 'half', 3: 'third', 4: 'fourth' };
const vals = r => r.opts.map(o => o.v), right = r => r.opts[r.answer].v;

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML.replace("'http://www.w3.org/2000/svg'", ''), /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address (but the SVG namespace name), no network call, no device speech, no local store, no worker, no eval');
  assert.match(HTML, /start\(\{ theme: 'busy-kitchen', version: '1\.0\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Busy Kitchen, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/busy-kitchen')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/busy-kitchen/1.0.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Busy Kitchen 1.0.0 has the piece ${id}`);
  let used = 0;
  for (const m of HTML.matchAll(/(?:piece\(|\[)'([a-z-]+)', -?[\d.]+, -?[\d.]+, -?[\d.]+/g)) { used++; assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`); }
  assert.ok(used >= 30, `the kitchen is furnished from the theme (${used} pieces placed)`);
  for (const id of ['burger', 'stew', 'dinner', 'veggie-burger', 'cheese', 'lettuce']) assert.ok(asked.includes(id), `the dish ${id}`);
  // a kitchen, not a shop: the theme's order window, menu board and coin are left out (coins are drawn, face on, with their values)
  for (const id of ['order-window', 'menu', 'coin']) assert.ok(!asked.includes(id), `${id} is not used`);
  for (const id of ['knight', 'barbarian', 'mage', 'rogue', 'rogue-hooded']) assert.ok(theme.heroes.some(h => h.id === id), `the theme has the adventurer ${id}`);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|time is up|hurry|game over!)\b/i, 'no timer, no lives, no losing: the rush is the busy kitchen');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button wobble and bring
  // the helper back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(|Date\.now|performance\.now/);
});

test('rounds: six a chapter, every answer right for the reason the unit teaches, the first lap always the same', () => {
  assert.deepEqual([...KR.CHAPTERS], CHAPTERS); assert.equal(KR.ROUNDS, 6);
  assert.equal(KR.round('measure', 0, 0), null); assert.equal(KR.round('measure', 7, 0), null); assert.equal(KR.round('shop', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(KR.round(ch, n, 0), KR.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => KR.round(ch, n, 0));
  assert.deepEqual(lap0('measure').map(r => [r.kind, say(...r.ask), right(r)]), [['units', 'How many sugar cubes long is the baguette?', 6], ['units', 'How many beans long is the spoon?', 4], ['fair', 'Do the cubes measure it the right way?', 'no'],
    ['ruler', 'How many inches long is the carrot?', 5], ['ruler', 'How many centimeters long is the fork?', 7], ['longer', 'How many inches longer is the top one?', 3]]);
  assert.deepEqual([lap0('measure')[2].pic.lay, lap0('measure')[3].pic.from, lap0('measure')[4].pic.from, lap0('measure')[4].pic.to], ['gaps', 0, 2, 9], 'round 3 has gaps; round 4 starts at 0; round 5 is the trap: from 2 to 9');
  assert.ok(vals(lap0('measure')[4]).includes(9), 'the number at the fork’s end is offered, and is wrong');
  assert.deepEqual(lap0('clock').map(r => [r.kind, say(...r.ask), right(r)]), [['read', 'What time does the kitchen clock show?', '3:00'], ['match', 'Which clock shows the oven\'s time?', '4:30'], ['five', 'It is breakfast time. What time is it?', '7:10 a.m.'],
    ['coins', 'How many cents are in the tip jar?', 23], ['coins', 'How many cents are in the tip jar?', 42], ['dollar', 'How much money is in the tip jar?', 130]]);
  assert.deepEqual(lap0('clock').slice(3).map(r => [r.pic.coins.join(''), r.pic.bill, r.opts[r.answer].t]), [['ddppp', 0, '23¢'], ['qdnpp', 0, '42¢'], ['qn', 1, '$1.30']]);
  assert.deepEqual(lap0('chart').map(r => [r.kind, say(...r.ask), right(r)]), [['sort', 'Sort them. How many tomatoes are there?', 3], ['most', 'Which bin has the most?', 'carrot'], ['more', 'How many more carrots than tomatoes?', 3],
    ['pic', 'How many pears does the graph show?', 6], ['bar', 'How many more apples than plums?', 3], ['bar', 'How many apples and bananas altogether?', 8]]);
  assert.deepEqual(lap0('gate').map(r => [r.kind, say(...r.ask), right(r)]), [['teen', 'How many buns are on the trays?', 14], ['add', '8 carrots and 5 more. How many now?', 13], ['tens', '3 bags of 10 rolls and 6 more. How many?', 36],
    ['equal', 'Balance the scale. What number is missing?', 4], ['hund', '2 boxes of 100, 4 tens, 5 ones. How many?', 245], ['share', 'Equal shares of pie. What is one share called?', 'fourth']]);

  const seen = { asks: new Set(), kinds: new Set(), lays: new Set(), objs: new Set(), units: new Set(), clock: new Set(), meals: new Set(), coins: new Set(), spots: new Set(), wants: new Set(), shapes: new Set(), parts: new Set(), zero: 0 };
  const common = (r, at) => {
    assert.ok(T[r.ask[0]], `${at}: the question ${r.ask[0]} is one of the game's lines`); assert.ok(T[r.show[0]] && T[r.shown[0]], `${at}: the chip's ${r.show[0]} and ${r.shown[0]}`);
    assert.ok(r.said.length >= 1);
    for (const [k, v] of [r.ask, r.show, r.shown, ...r.said, ...Object.values(r.hints).flat()]) { assert.ok(T[k], `${at}: ${k}`); assert.doesNotMatch(say(k, v), /undefined|\{/, `${at}: ${k} has all its numbers`); }
    // two or three buttons, all different (what they say and what they stand for), one right; every other has a hint
    assert.ok(r.opts.length === 2 || r.opts.length === 3, at); assert.deepEqual(r.choices, r.opts.map((o, i) => i), at); assert.ok(r.choices.includes(r.answer), at);
    assert.equal(new Set(vals(r).map(String)).size, r.opts.length, `${at}: the choices differ (${vals(r)})`);
    assert.equal(new Set(r.opts.map(o => (o.clock ? `clock ${o.h}:${o.m}` : o.t || T[o.key]))).size, r.opts.length, `${at}: the buttons read differently`);
    for (const o of r.opts) { if (o.key) assert.ok(T[o.key], `${at}: ${o.key}`); if (typeof o.v === 'number') assert.ok(Number.isInteger(o.v) && o.v > 0, `${at}: a counting number (${o.v})`); }
    assert.deepEqual(Object.keys(r.hints).sort(), r.choices.filter(v => v !== r.answer).map(String).sort(), `${at}: a hint for every wrong choice`);
    seen.asks.add(r.ask[0]); seen.kinds.add(r.kind); seen.spots.add(r.answer);
  };
  for (let lap = 0; lap < 300; lap++) {
    for (let n = 1; n <= 6; n++) {
      // ---- measure: same-size units end to end, then a ruler, then how much longer
      const m = KR.round('measure', n, lap), ma = `measure ${n} lap ${lap}`, p = m.pic; common(m, ma);
      assert.equal(m.kind, ['units', 'units', 'fair', 'ruler', 'ruler', 'longer'][n - 1], ma);
      if (m.kind === 'units') {
        assert.ok(p.obj in KR.OBJ && p.unit === KR.OBJ[p.obj] && p.lay === 'good' && p.len >= 3 && p.len <= 8, ma);
        assert.equal(right(m), p.len, `${ma}: as many units as lie along it`); assert.deepEqual(vals(m).slice().sort((a, b) => a - b), [p.len - 1, p.len, p.len + 1], ma);
        assert.deepEqual([m.ask, m.said], [L('m.ask.units.' + p.obj), [L('m.said.units.' + p.unit, { n: p.len })]], ma); seen.units.add(p.unit);
      } else if (m.kind === 'fair') {
        assert.ok(KR.LAYS.includes(p.lay) && p.unit === 'cube' && p.len >= 4 && p.len <= 7, ma); assert.deepEqual(vals(m), ['yes', 'no'], ma);
        assert.equal(right(m), p.lay === 'good' ? 'yes' : 'no', `${ma}: only same-size units that touch end to end measure`);
        if (p.lay === 'mixed') assert.equal(p.len % 2, 0, `${ma}: a big and a small cube together fill two places`);
        assert.deepEqual([m.said, m.hints[1 - m.answer]], [[L('m.said.fair.' + p.lay)], [L('m.hint.fair.' + p.lay)]], ma); seen.lays.add(p.lay);
      } else if (m.kind === 'ruler') {
        assert.ok(p.unit in KR.RULER && p.max === KR.RULER[p.unit] && p.from >= 0 && p.to > p.from && p.to <= p.max && Number.isInteger(p.from) && Number.isInteger(p.to), ma);
        assert.equal(right(m), p.to - p.from, `${ma}: from ${p.from} to ${p.to}`);
        if (n === 4) { assert.equal(p.from, 0, `${ma}: round 4 starts at 0`); assert.equal(m.off, undefined, ma); assert.deepEqual(m.said, [L('m.said.' + p.unit, { n: p.to })], ma); }
        else {
          // the classic trap: it does not start at 0, and the number at its end is one of the wrong answers, with a hint that says where it starts
          assert.ok(m.off && p.from >= 1, `${ma}: round 5 does not start at 0`); const trap = vals(m).indexOf(p.to);
          assert.ok(trap >= 0 && trap !== m.answer, `${ma}: the number at the end (${p.to}) is offered`); assert.deepEqual(m.hints[trap], [L('m.hint.off', { n: p.from }), L('m.hint.spaces')], ma);
          assert.deepEqual(m.said, [L('m.said.off.' + p.unit, { a: p.from, b: p.to, n: p.to - p.from })], ma);
        }
        assert.equal(m.ask[0], `m.ask.${p.unit}.${p.obj}`, ma); seen.units.add(p.unit + (m.off ? '-off' : ''));
      } else {
        assert.ok(p.a.len > p.b.len && p.b.len >= 1 && p.a.len <= p.max && p.max === KR.RULER[p.unit] && p.a.obj !== p.b.obj, `${ma}: the top one is the longer`);
        assert.equal(right(m), p.a.len - p.b.len, ma); assert.deepEqual(vals(m).slice().sort((a, b) => a - b), [p.a.len - p.b.len, p.a.len, p.a.len + p.b.len].sort((a, b) => a - b), `${ma}: the gap, the longer one, and the two added`);
        assert.deepEqual(m.said, [L('m.said.longer', { a: p.a.len, b: p.b.len, n: p.a.len - p.b.len })], ma);
      }
      for (const o of [p.obj, p.a && p.a.obj, p.b && p.b.obj]) if (o) { assert.ok(o in KR.OBJ, ma); seen.objs.add(o); }

      // ---- clock: the hour and the half hour, the oven, five minutes with a.m. and p.m.; then the tip jar
      const c = KR.round('clock', n, lap), ca = `clock ${n} lap ${lap}`, q = c.pic; common(c, ca);
      assert.equal(c.kind, ['read', 'match', 'five', 'coins', 'coins', 'dollar'][n - 1], ca);
      if (n <= 3) {
        assert.ok(Number.isInteger(q.h) && q.h >= 1 && q.h <= 12 && q.m % 5 === 0 && q.m >= 0 && q.m < 60, ca);
        if (n <= 2) assert.ok(q.m === 0 || q.m === 30, `${ca}: grade 1 tells the hour and the half hour`); else assert.ok(q.m !== 0 && q.m !== 30, `${ca}: grade 2 tells five minutes`);
        const time = `${q.h}:${pad(q.m)}`;
        if (c.kind === 'match') {
          assert.ok(c.opts.every(o => o.clock && o.h >= 1 && o.h <= 12 && o.m % 5 === 0), `${ca}: three clock faces`); assert.deepEqual([c.opts[c.answer].h, c.opts[c.answer].m], [q.h, q.m], `${ca}: the face that shows the oven's ${time}`);
          assert.deepEqual(c.show, L('show.time', { t: time }), `${ca}: the chip shows the oven's time`);
        } else {
          assert.ok(c.opts.every(o => /^\d{1,2}:\d\d( [ap]\.m\.)?$/.test(o.t) && o.t === o.v && +o.t.split(':')[0] >= 1 && +o.t.split(':')[0] <= 12), `${ca}: three times (${c.opts.map(o => o.t)})`);
          assert.equal(right(c), c.kind === 'five' ? `${time} ${AP[c.meal]}` : time, ca);
        }
        if (c.kind === 'five') {
          assert.ok(c.meal in KR.MEALS && q.meal === c.meal, ca); assert.ok(vals(c).includes(`${time} ${AP[c.meal] === 'a.m.' ? 'p.m.' : 'a.m.'}`), `${ca}: the same time at the other end of the day is offered`);
          assert.ok((c.meal === 'breakfast' && q.h >= 6 && q.h <= 8) || (c.meal === 'snack' && q.h >= 3 && q.h <= 4) || (c.meal === 'bedtime' && q.h >= 7 && q.h <= 8), `${ca}: ${c.meal} at ${time}`);
          assert.deepEqual([c.ask, c.said], [L('c.ask.five.' + c.meal), [L('c.said.five.' + c.meal, { h: q.h, m: pad(q.m) })]], ca); seen.meals.add(c.meal);
        }
        seen.clock.add(`${c.kind}:${q.m === 0 ? 'hour' : q.m === 30 ? 'half' : 'five'}`);
      } else {
        const sum = q.coins.reduce((a, k) => a + CENTS[k], 0), bill = c.kind === 'dollar' ? 1 : 0;
        assert.ok(q.coins.length + bill >= 2 && q.coins.length + bill <= 8 && q.coins.every(k => k in CENTS), `${ca}: ${q.coins}`); assert.equal(q.bill, bill, ca);
        assert.equal(right(c), bill * 100 + sum, `${ca}: the value of ${q.coins.join(' ')}${bill ? ' and a dollar bill' : ''}`);
        if (n === 4) assert.ok(!q.coins.includes('q') && q.coins.includes('p'), `${ca}: round 4 has no quarters`);
        if (n === 5) assert.ok(q.coins.includes('q') && sum < 100, `${ca}: round 5 has a quarter`);
        // an amount is written with its sign: cents with ¢, dollars with $ and two places
        assert.equal(c.opts[c.answer].t, bill ? `$1.${pad(sum)}` : `${sum}¢`, ca); for (const o of c.opts) assert.match(o.t, /^(\d+¢|\$\d\.\d\d)$/, `${ca}: ${o.t}`);
        assert.ok(vals(c).includes(q.coins.length + bill) || vals(c).includes((q.coins.length + bill) * 100), `${ca}: counting the pieces, not their values, is offered`);
        assert.deepEqual(c.said, [bill ? L('k.said.dollar', { n: sum }) : L('k.said.cents', { n: sum })], ca); q.coins.forEach(k => seen.coins.add(k));
      }

      // ---- chart: two and three bins, then a picture graph and a bar graph of four fruits
      const g = KR.round('chart', n, lap), ga = `chart ${n} lap ${lap}`, d = g.pic, count = k => d.counts[d.kinds.indexOf(k)]; common(g, ga);
      assert.equal(new Set(d.kinds).size, d.kinds.length, ga); assert.equal(d.kinds.length, n === 1 ? 2 : n <= 3 ? 3 : 4, `${ga}: up to three bins, then four categories`);
      assert.ok(d.kinds.every(k => (n <= 3 ? KR.VEG : KR.FRUIT).includes(k)), ga); assert.ok(d.counts.every(x => Number.isInteger(x) && x >= 1 && x <= 8), ga);
      assert.equal(new Set(d.counts).size, d.counts.length, `${ga}: no two the same, so "most" and "more" have one answer`); assert.ok(d.mark.every(k => d.kinds.includes(k)), ga);
      if (g.kind === 'sort') { assert.equal(right(g), count(d.mark[0]), ga); assert.equal(g.ask[0], 'ch.ask.count.' + d.mark[0], ga); }
      else if (g.kind === 'most') { assert.deepEqual(vals(g), d.kinds, `${ga}: a button for each bin, in order`); assert.equal(count(right(g)), Math[g.want === 'most' ? 'max' : 'min'](...d.counts), ga); assert.equal(g.ask[0], 'ch.ask.' + g.want, ga); }
      else if (g.kind === 'more') { const [a, b] = d.mark; assert.ok(count(a) > count(b), ga); assert.equal(right(g), count(a) - count(b), ga); assert.equal(g.ask[0], `ch.ask.more.${a}.${b}`, ga); }
      else if (g.kind === 'total') { assert.equal(right(g), d.counts.reduce((a, b) => a + b, 0), ga); }
      else if (g.kind === 'pic') { assert.equal(right(g), count(d.mark[0]), ga); assert.equal(g.ask[0], 'ch.ask.pic.' + d.mark[0], ga); for (const v of vals(g)) assert.ok(d.counts.includes(v), `${ga}: every choice is a row of the graph`); }
      else {
        assert.equal(g.kind, 'bar', ga);
        if (g.want === 'more' || g.want === 'fewer') {
          const [, , first, second] = /^ch\.ask\.bar\.(more|fewer)\.(\w+)\.(\w+)$/.exec(g.ask[0]);
          assert.ok(g.want === 'more' ? count(first) > count(second) : count(first) < count(second), `${ga}: ${first} really has ${g.want} than ${second}`);
          assert.equal(right(g), Math.abs(count(first) - count(second)), ga); assert.deepEqual(d.mark.slice().sort(), [first, second].sort(), ga);
        } else if (g.want === 'all') { const [, a, b] = /^ch\.ask\.all\.(\w+)\.(\w+)$/.exec(g.ask[0]); assert.equal(right(g), count(a) + count(b), ga); }
        else { assert.equal(g.want, 'all4', ga); assert.equal(right(g), d.counts.reduce((a, b) => a + b, 0), ga); assert.ok(right(g) <= 20, ga); }
      }
      seen.wants.add(g.kind + (g.want ? ':' + g.want : ''));

      // ---- gate: one round from each earlier unit
      const e = KR.round('gate', n, lap), ea = `gate ${n} lap ${lap}`, x = e.pic; common(e, ea);
      if (n === 1) { assert.equal(e.kind, 'teen', ea); assert.ok(x.n >= 11 && x.n <= 19, ea); assert.equal(right(e), x.n, `${ea}: a full tray of ten and ${x.n - 10} more`); assert.deepEqual(e.said, [L('g.said.teen', { a: x.n - 10, n: x.n })], ea); }
      else if (n === 2) { assert.equal(e.kind, 'add', ea); assert.ok(x.a <= 9 && x.b <= 9 && x.a + x.b > 10 && x.a + x.b <= 20, `${ea}: adding over ten, within 20`); assert.equal(right(e), x.a + x.b, ea); assert.deepEqual(e.ask, L('g.ask.add', { a: x.a, b: x.b }), ea); }
      else if (n === 3) { assert.equal(e.kind, 'tens', ea); assert.ok(x.t >= 2 && x.t <= 9 && x.o >= 1 && x.o <= 9, ea); assert.equal(right(e), x.t * 10 + x.o, ea); assert.ok(vals(e).includes(x.o * 10 + x.t), `${ea}: the digits the other way round are offered`); }
      else if (n === 4 && e.kind === 'equal') { assert.equal(x.a + x.b, x.c + x.d, `${ea}: both sides the same`); assert.equal(right(e), x.d, ea); assert.ok(vals(e).includes(x.a + x.b), `${ea}: the left side's total is offered (the "answer comes next" mistake)`); assert.ok(x.a + x.b <= 12, ea); }
      else if (n === 4) { assert.equal(e.kind, 'story', ea); assert.ok(x.a > x.b && x.a <= 9, ea); assert.equal(right(e), x.a - x.b, ea); }
      else if (n === 5) { assert.equal(e.kind, 'hund', ea); assert.ok(x.h >= 1 && x.h <= 4 && x.t >= 0 && x.t <= 9 && x.o >= 1 && x.o <= 9, ea); assert.equal(right(e), x.h * 100 + x.t * 10 + x.o, ea); if (x.t === 0) { seen.zero++; assert.ok(vals(e).includes(x.h * 10 + x.o), `${ea}: the number without its zero is offered`); } }
      else if (e.kind === 'share') { assert.ok([2, 3, 4].includes(x.parts), ea); assert.deepEqual(vals(e), ['half', 'third', 'fourth'], ea); assert.equal(right(e), SHARE[x.parts], ea); seen.parts.add(x.parts); }
      else { assert.equal(e.kind, 'shape', ea); assert.ok(x.shape in SIDES && KR.SHAPES[x.shape] === x.thing, ea); assert.equal(right(e), x.shape, ea); assert.ok(!(vals(e).includes('square') && vals(e).includes('rectangle')), `${ea}: a square is a rectangle too, so never both`); seen.shapes.add(x.shape); }
      if (n === 4) assert.equal(e.kind, lap % 2 === 0 ? 'equal' : 'story', `${ea}: equal sides and a story turn about`);
      if (n === 6) assert.equal(e.kind, lap % 2 === 0 ? 'share' : 'shape', `${ea}: shares and shapes turn about`);
    }
  }
  // over the laps: every way of asking, every thing to measure, every coin, and the right button in every place
  assert.deepEqual([...seen.lays].sort(), ['gaps', 'good', 'mixed', 'overlap']); assert.equal(seen.objs.size, 6);
  assert.deepEqual([...seen.units].sort(), ['bean', 'cm', 'cm-off', 'cube', 'grape', 'in', 'in-off']);
  assert.deepEqual([...seen.clock].sort(), ['five:five', 'match:half', 'match:hour', 'read:half', 'read:hour']); assert.deepEqual([...seen.meals].sort(), ['bedtime', 'breakfast', 'snack']);
  assert.deepEqual([...seen.coins].sort(), ['d', 'n', 'p', 'q']); assert.deepEqual([...seen.spots].sort(), [0, 1, 2]);
  assert.deepEqual([...seen.wants].sort(), ['bar:all', 'bar:all4', 'bar:fewer', 'bar:more', 'more', 'most:fewest', 'most:most', 'pic', 'sort', 'total']);
  assert.deepEqual([...seen.parts].sort(), [2, 3, 4]); assert.deepEqual([...seen.shapes].sort(), ['circle', 'hexagon', 'rectangle', 'square', 'triangle']); assert.ok(seen.zero > 20, 'a number with no tens comes up');
  assert.deepEqual([...seen.kinds].sort(), ['add', 'bar', 'coins', 'dollar', 'equal', 'fair', 'five', 'hund', 'longer', 'match', 'more', 'most', 'pic', 'read', 'ruler', 'shape', 'share', 'sort', 'story', 'teen', 'tens', 'total', 'units']);
  for (const k of Object.keys(T).filter(k => /^(m|c|k|ch|g)\.ask\./.test(k))) assert.ok(seen.asks.has(k), `${k} is asked in some round`);
  assert.deepEqual(KR.params({ chapter: 'gate', lock: 1 }), { chapter: 'gate', lock: true });
  assert.deepEqual(KR.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(KR.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and answer line is a registered spoken line, short enough for a five-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('kitchen-rush'));
  const ok = text => lines.allowedLine('kitchen-rush', 'en', text);
  const NUMS = { n: 3, m: '05', a: 4, b: 2, c: 5, d: 6, h: 7, t: '7:05' };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.(measure|clock|chart|gate)$|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 175);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what the chip and the board show and the button labels are shown, never read (unless the same words are a spoken line too)
  const spokenText = new Set(spoken.map(k => say(k, NUMS)));
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) if (!spokenText.has(say(k, NUMS))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('23¢'), null); assert.equal(ok('$1.30'), null); assert.equal(ok('6 + 2 = 4 + ?'), null); assert.equal(ok('Carrots'), null);
  assert.equal(say('m.ask.units.baguette'), 'How many sugar cubes long is the baguette?'); assert.equal(say('m.hint.off', { n: 2 }) + ' ' + say('m.hint.spaces'), 'It starts at 2, not at 0. Count the spaces from its start to its end.');
  assert.equal(say('m.said.off.cm', { a: 2, b: 9, n: 7 }), 'Yes! From 2 to 9 is 7 centimeters.'); assert.equal(say('m.said.fair.gaps'), 'No. There are gaps between the cubes.');
  assert.equal(say('c.hint.short', { n: 3 }), 'The short hand shows the hour. It is 3.'); assert.equal(say('c.said.five.breakfast', { h: 7, m: '10' }), 'Yes! 7:10 a.m., in the morning.');
  assert.equal(say('k.said.cents', { n: 23 }), 'Yes! That makes 23 cents.'); assert.equal(say('k.said.dollar', { n: 30 }), 'Yes! 1 dollar and 30 cents.'); assert.equal(say('k.hint.bill'), 'The bill is 1 dollar. That is 100 cents.');
  assert.equal(say('ch.said.more', { a: 5, b: 2, n: 3 }), 'Yes! 5 is 3 more than 2.'); assert.equal(say('g.said.tens', { a: 3, b: 6, n: 36 }), 'Yes! 3 tens and 6 ones make 36.');
  assert.equal(ok('How many sugar cubes long is the table?'), null, 'only the game’s own lines');
  assert.equal(ok('Yes! That makes twenty cents.'), null, 'a number goes where the number is, never a word');
  // Every spoken line: one or two sentences, 10 words at most; an instruction fits the words box.
  for (const k of spoken) { assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`); }
  const asks = spoken.filter(k => /\.ask\./.test(k));
  assert.equal(asks.length, 56); for (const k of asks) assert.ok(say(k, NUMS).length <= 50, `${k} fits the words box`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak|chip|L)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const k of ['ch.measure', 'ch.clock', 'ch.chart', 'ch.gate', 'btn.yes', 'btn.no', 'btn.half', 'btn.third', 'btn.fourth', 'win', 'win.card', 'win.gate', 'show.unit.in', 'show.unit.cm', 'show.graph', 'show.key']) assert.ok(T[k], k);
  assert.deepEqual([T['ch.measure'], T['ch.clock'], T['ch.chart'], T['ch.gate'], T.title], ['Measure It', 'Clocks and Coins', 'Sort and Chart', 'The Garden Gate', 'Kitchen Rush']);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // US spelling (the course's rule), and the units by their US names
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(centimetres?|metres?|colou?red|colours?|favourites?|grey)\b/i, text);
  // coins are counted for their value only: nothing is bought, sold, priced, earned or owed, and there is no shop
  const SHOP = /\b(price[sd]?|buy|buys|bought|sell|sells|sold|shop|shops|store|pay|pays|paid|cost|costs|sale|spend|spent|cheap|expensive|change back|owe|earn|purchase|customer|order)\b/i;
  for (const text of Object.values(T)) assert.doesNotMatch(text, SHOP, `a kitchen, not a shop: ${text}`);
  assert.doesNotMatch(META.description + ' ' + META.tags, SHOP);
  // and no hurry: the "rush" is in the title only
  for (const [k, text] of Object.entries(T)) if (k !== 'title') assert.doesNotMatch(text, /\b(rush|hurry|quick|fast|faster|late|seconds? left|timer)\b/i, text);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('kitchen-rush'));
  assert.equal(META.slug, 'kitchen-rush'); assert.equal(META.title, 'Kitchen Rush'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.deepEqual(SHELF_INFO['kitchen-rush'], { subject: 'math', from: 0, to: 2 }, 'on the Learn shelf as math for kindergarten to grade 2 (its sorting chapter carries K.MD.B.3)');
  for (const f of ['public/covers/kitchen-rush.jpg', 'public/og/kitchen-rush.jpg', 'scripts/covers/kitchen-rush.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'kitchen-rush'), { slug: 'kitchen-rush', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('kitchen-rush'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.KITCHEN_CHAPTERS, { measure: ['1.MD.A.2', '2.MD.A.1'], clock: ['1.MD.B.3', '2.MD.C.7', '2.MD.C.8'], chart: ['K.MD.B.3', '1.MD.C.4', '2.MD.D.10'],
    gate: ['1.OA.C.6', '1.NBT.B.2', '2.NBT.A.1', 'K.NBT.A.1', '1.OA.D.7', '1.G.A.3'] });
  // the game's own tags are what it teaches (measurement and data); the finale chapter's review codes belong to a step locked to it
  assert.deepEqual(TAGS.gameCodes('kitchen-rush', 'ccss-math'), [...TAGS.KITCHEN_CHAPTERS.measure, ...TAGS.KITCHEN_CHAPTERS.clock, ...TAGS.KITCHEN_CHAPTERS.chart]);
  assert.ok(TAGS.LEVELLED.includes('kitchen-rush'));
  assert.equal(UNIT.title, 'The Measuring Meadow'); assert.equal(UNIT.stamp, 'Measuring Seed'); assert.equal(UNIT.tool, 'kitchen-rush');
  assert.ok(UNITS.tiers.launchpad.stones.includes('Measuring Seed')); assert.equal(UNITS.tiers.launchpad.status, 'open'); assert.equal(UNITS.tiers.launchpad.finale, '7.4');
  assert.deepEqual(STEPS.map(s => [s.n, s.titles.launchpad]), [['7.1', 'How long is it?'], ['7.2', 'Clocks and coins'], ['7.3', 'Sort it and chart it'], ['7.4', 'The Garden Gate']]);
  // the statements the unit locks carry the published text, word for word
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/standards.json'), 'utf8')).launchpadCodes.codes;
  const ccss = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/ccss-math.json'), 'utf8')).standards.map(s => [s.id, s.statement]));
  for (const code of Object.values(TAGS.KITCHEN_CHAPTERS).flat()) assert.equal(reg[code], ccss[code], `${code}: the published statement`);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'kitchen-rush'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(KR.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['K', '1', '2', '']) assert.deepEqual(TAGS.stepGameCodes('kitchen-rush', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  // the finale: a mixed review that locks nothing new (every code is an earlier unit's), one code for each of Units 1 to 6
  const earlier = new Set(UNITS.units.filter(u => u.tier === 'launchpad' && u.n < 7).flatMap(u => u.steps.flatMap(s => [...s.standards.launchpad.primary, ...s.standards.launchpad.also])));
  const unitOf = code => UNITS.units.find(u => u.tier === 'launchpad' && u.n < 7 && u.steps.some(s => [...s.standards.launchpad.primary, ...s.standards.launchpad.also].includes(code))).n;
  for (const code of TAGS.KITCHEN_CHAPTERS.gate) assert.ok(earlier.has(code), `${code} was taught in an earlier unit`);
  assert.deepEqual(TAGS.KITCHEN_CHAPTERS.gate.map(unitOf).sort(), [1, 2, 3, 4, 5, 6], 'one code from each of Units 1 to 6');
  assert.deepEqual(TAGS.stepGameCodes('kitchen-rush', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('kitchen-rush', 'ccss-math', 'K', ''), ['K.MD.B.3'], 'an unlocked kindergarten step claims the game’s kindergarten code');
  assert.deepEqual(TAGS.stepGameCodes('kitchen-rush', 'ccss-math', '1', ''), ['1.MD.A.2', '1.MD.B.3', '1.MD.C.4'], 'an unlocked grade 1 step its grade 1 codes');
  assert.deepEqual(TAGS.stepGameCodes('kitchen-rush', 'ccss-math', '2', ''), ['2.MD.A.1', '2.MD.C.7', '2.MD.C.8', '2.MD.D.10'], 'and a grade 2 step its grade 2 codes');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.KR_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Kitchen Rush' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const state = () => frame.evaluate(() => window.__kr.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 30_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
const btn = v => '#kr-n' + v;
/** The hint a wrong choice gets: its lines, one after the other. */
const hintOf = (s, v) => s.hints[v].map(([k, a]) => say(k, a)).join(' ');
/** What a button shows: a number, a time or an amount; a word (with its sign or picture); or a clock face (its 12, 3, 6 and 9). */
const face = o => (o.clock ? '12369' : (o.v === 'yes' ? '✔️' : o.v === 'no' ? '✖️' : '') + (o.t || '') + (o.key ? T[o.key] : ''));

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong answer shows why and does not advance, six right rounds post game over once`, { skip, timeout: 420_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .kr-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five the other Launchpad games offer)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__kr.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-measure, #ch-gate, #menu').length), 0);
    await until(() => window.__kr.state().moving === 0, null, 90_000);   // round 1's board has popped in at the game's own speed
    await frame.evaluate(() => window.__kr.fast());   // no waiting between the steps of a round; the taps are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play'); assert.equal(s.mode, 'ask', `round ${round}: the board as it is asked`);
      const want = KR.round(chapter, round, 0);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.equal(asked, say(s.ask[0], s.ask[1]), `round ${round}: the instruction`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), say(...s.show), `round ${round}: the chip`);
      await g.shot(`${chapter}-${round}`);
      // the kitchen holds the board, and one dish on the party table for each round already finished
      assert.deepEqual(s.onStage, { board: true, dishes: round - 1 }, `round ${round}: the board and ${round - 1} dishes`);
      // the choices: big buttons at the bottom, each showing what the round offers
      assert.deepEqual(await ids(frame, '#bar .kr-btn'), s.choices.map(v => btn(v).slice(1)), `round ${round}: one button for each choice`);
      assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#bar .kr-btn')].map(b => b.textContent)), s.opts.map(face), `round ${round}: what the buttons say`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('#bar .kr-btn svg').length), s.opts.filter(o => o.clock || o.pic).length, `round ${round}: a picture on each picture button`);
      // a wrong answer: its hint, a wobble, the board's "why" look, the same round, nothing reported
      const wrong = s.choices.find(v => v !== s.answer);
      await frame.click(btn(wrong));
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen, after.mode], [round, 'play', 'play', 'hint'], `round ${round}: a wrong answer does not advance, and the board shows why`);
      assert.equal(await text(frame, '#hint'), hintOf(s, wrong), `round ${round}: a wrong answer gets the hint that says why`);
      for (const [k, v] of s.hints[wrong]) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.kr-btn.no').length), 1, `round ${round}: and a wobble on what was tapped`);
      assert.equal(after.onStage.dishes, round - 1, `round ${round}: no dish for a wrong answer`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await g.shot(`${chapter}-${round}-hint`);
      await frame.click(btn(s.answer));
      await until(r => { const t = window.__kr.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .kr-btn'), ['again'], 'locked: play again, and no way to another chapter');
    assert.equal(await text(frame, '#card .kr-askt'), chapter === 'gate' ? 'The garden gate is open. Well done!' : 'The party is ready. Well done!');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('kitchen-rush', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__kr.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(KR.round(chapter, 1, 1)).map(k => [k, s[k]])), KR.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal(s.onStage.dishes, 0, 'the party table is cleared for the next lap');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the four chapters; at the game’s own speed a wrong answer shows why, a right one sends a dish to the party table and only then the next round', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__kr.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .kr-menu .kr-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-measure', 'Measure It'], ['ch-clock', 'Clocks and Coins'], ['ch-chart', 'Sort and Chart'], ['ch-gate', 'The Garden Gate']]);
  await g.shot('menu');
  // Clocks and Coins, round 1 (what time does the kitchen clock show?), with nothing hurried
  await frame.click('#ch-clock');
  await until(() => window.__kr.state().screen === 'play' && window.__kr.state().moving === 0, null, 120_000);
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.mode, s.onStage.dishes], ['clock', false, 'read', 'ask', 0]);
  const wrong = s.choices.find(v => v !== s.answer);
  await frame.click(btn(wrong));
  assert.deepEqual([(await state()).phase, (await state()).mode, await text(frame, '#hint')], ['play', 'hint', hintOf(s, wrong)]);
  await until(() => window.__kr.state().moving === 0, null, 120_000);   // the board has shaken its head
  assert.equal((await state()).round, 1); assert.equal((await g.msgs('brb:gameover')).length, 0);
  // the right answer: the chip shows the time, the board shows it found, a dish flies to the table, then round 2
  await frame.click(btn(s.answer));
  s = await state();
  assert.deepEqual([s.phase, s.mode, s.round], ['right', 'found', 1]); assert.equal(await text(frame, '#sum'), '3:00');
  assert.equal(await frame.evaluate(() => document.querySelectorAll('.kr-btn.go').length), 1);
  await frame.click(btn(wrong));   // a tap while the answer is showing changes nothing
  assert.equal((await state()).phase, 'right');
  assert.equal(s.onStage.dishes, 1, 'the dish is on its way');
  await g.shot('clock-found');
  await until(() => window.__kr.state().round === 2, null, 180_000);
  assert.deepEqual([(await state()).onStage.dishes, (await state()).mode], [1, 'ask'], 'one dish on the party table, and the next board');
  // back at the menu after a whole chapter the quick way: the chapter has its star, and the others are still offered
  await frame.evaluate(() => window.__kr.fast());
  for (let r = 2; r <= 6; r++) { await until(n => window.__kr.state().round === n && window.__kr.state().phase === 'play', r); await frame.evaluate(() => window.__kr.act('answer', window.__kr.state().answer)); }
  await until(() => window.__kr.state().screen === 'end');
  assert.deepEqual(await ids(frame, '#card .kr-btn'), ['again', 'menu'], 'unlocked: play again, or more jobs');
  await frame.click('#menu');
  await until(() => window.__kr.state().screen === 'menu');
  assert.match(await text(frame, '#ch-clock .i'), /⭐/); assert.doesNotMatch(await text(frame, '#ch-gate .i'), /⭐/);
  assert.equal((await g.msgs('brb:gameover')).length, 1);
  for (const m of await g.msgs('brb:save')) assert.doesNotMatch(JSON.stringify(m), /round|hero|answer|score/, 'only which chapters are finished is saved');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();
});

test('keyboard, phones and reduced motion: every choice is a button a key can press; the top row is tidy, the board is big, face on, in full view and clear of the helper', { skip, timeout: 900_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the answer buttons.
  const k = await open({ params: 'chapter=measure&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__kr.state().screen === 'play');
  const s = await k.state();
  await k.frame.evaluate(() => window.__kr.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus(btn(wrong)); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), hintOf(s, wrong), 'Enter on a wrong button: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus(btn(0));
  for (let i = 0; i < s.answer; i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'kr-n' + s.answer, 'Tab walks the buttons in order');
  await k.p.keyboard.press(' ');
  await k.until(() => window.__kr.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^kr-n\d$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter (the finale too): the
  // words, the chip and the round dots never touch each other or the gear button (one line on a wide screen); the
  // buttons are big and apart; the board is wide, keeps its 4 by 3 shape (so it faces the player), sits between the
  // words and the buttons with nothing of the kitchen in front of it, and the helper (the box is as wide as the
  // Wizard's hat) and the party table never cover any of it; the smallest number or word on it is big enough to read.
  const SIZES = [[960, 600, 'no-preference', false, 380, 13], [390, 844, 'no-preference', true, 330, 11.5], [360, 640, 'reduce', true, 280, 10.5]];
  for (const [width, height, reducedMotion, touch, wide, small] of SIZES) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-mage') : m.frame.click('#hero-mage'));
      await m.until(() => window.__kr.state().screen === 'play');
      await m.frame.evaluate(() => window.__kr.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__kr.state().round === r && window.__kr.state().phase === 'play' && window.__kr.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the camera has settled on this round
        const st = await m.state(), at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        const measure = () => m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar .kr-btn')].map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__kr.spot(), line = r($('line')).bottom, bar = r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const board = box(sp.board.box), hero = box(sp.hero), table = box(sp.table), w = board.right - board.left, h = board.bottom - board.top;
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)), three: top.length,
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // the board: big, 4 by 3, on screen between the words and the buttons, nothing in front of it
            wide: w, flat: Math.abs(w / h - 4 / 3) < 0.03, view: board.left >= 0 && board.right <= innerWidth && board.top >= line && board.bottom <= bar, clear: sp.board.clear, read: sp.board.small,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line, hidden: hit(board, hero) || hit(board, table) };
        });
        let fit = await measure();
        const look = { inside: true, top: false, three: 3, oneLine: width > height ? true : null, small: 0, n: st.choices.length, overlap: false, scroll: false, wide: fit.wide, flat: true, view: true, clear: true, read: fit.read, helper: true, hidden: false };
        assert.deepEqual(fit, look, `${at}: on screen, the top row tidy, the buttons big and apart, the board flat, in view, unhidden and clear of the helper`);
        assert.ok(fit.wide >= wide, `${at}: the board is ${fit.wide} px wide (at least ${wide})`);
        assert.ok(fit.read >= small, `${at}: the smallest number or word on the board is ${fit.read} px (at least ${small})`);
        // the "why" look (after a wrong answer) is held to the same: its counting marks and rings are readable too
        const miss = btn(st.choices.find(v => v !== st.answer));
        await (touch ? m.frame.tap(miss) : m.frame.click(miss));
        fit = await measure();
        assert.equal((await m.state()).mode, 'hint', at); assert.ok(fit.read >= small, `${at}: the smallest mark of the board's "why" look is ${fit.read} px (at least ${small})`);
        assert.deepEqual([fit.flat, fit.view, fit.clear, fit.hidden], [true, true, true, false], `${at}: the board with its hint showing`);
        if (round === 1 && reducedMotion === 'reduce') {
          assert.equal(await m.frame.evaluate(id => getComputedStyle(document.querySelector(id)).outlineStyle, miss), 'dashed', `${at}: with reduced motion a wrong tap shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(v => window.__kr.act('answer', v), st.answer);
      }
      await m.until(() => window.__kr.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
