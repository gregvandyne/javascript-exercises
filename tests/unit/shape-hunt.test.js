// Shape Hunt (seed-games/shape-hunt.html): Number Quest Launchpad Unit 6's game, a Kit 2 (Oomba3D) tidy-up treasure
// hunt in a cosy house for kindergarten to grade 2: shapes hide among the furniture, and the helper finds them, builds
// with them and shares them. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between shape-hunt:begin and shape-hunt:end): six a chapter, every answer re-derived
//     here from what defines a shape, from the pieces' own sizes, or from the shares on the card; colour and size never
//     the clue; a wrong choice's hint names the attribute that rules it out; the same first lap every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), and what the chip
//     shows and the button labels are never sent to be spoken;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, what stands in the
//     room is what the round asks about, a wrong answer gets its hint and does not advance the round, every
//     instruction is sent to be spoken, and a correct play of all six rounds posts the game-over message (the course
//     step's completion signal) exactly once, not before; then the picture menu with no parameters, rounds at the
//     game's own speed (wrong pieces are tried on the outline and go again, the right ones fly in and snap), the
//     keyboard, a 390 px and a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. SH_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/shape-hunt.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/shape-hunt.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 6), STEPS = UNIT.steps;
const CHAPTERS = ['find', 'build', 'share'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const SH = (() => {
  const box = {}; vm.runInNewContext(/\/\* shape-hunt:begin \*\/([\s\S]*?)\/\* shape-hunt:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.ShapeHunt;   // plain objects of this realm, so deepEqual can compare them
  return { ...plain(G), round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('shape-hunt').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const L = (k, v = {}) => [k, v];

// What this test knows about shapes, written out here and never taken from the game.
const SIDES = { circle: 0, triangle: 3, square: 4, rectangle: 4, hexagon: 6 };
const ATTR_OF = { sides3: s => SIDES[s] === 3, sides4: s => s === 'square', sides6: s => SIDES[s] === 6, round: s => s === 'circle', point: s => s === 'cone', ball: s => s === 'sphere', faces: s => s === 'cube' };
const FLAT = Object.keys(SIDES), SOLID = ['cube', 'cone', 'cylinder', 'sphere'];
// The pieces: one unit is the side of the small square. Areas worked out here from the geometry.
const AREA = { tri: 1 / 2, sq: 1, etri: Math.sqrt(3) / 4, trap: 3 * Math.sqrt(3) / 4, half: Math.PI / 2, quarter: Math.PI / 4 };
const CURVED = { half: true, quarter: true };
const MADE = { square: [1, ['tri', 'tri']], rectangle: [2, ['sq', 'sq']], house: [1 + Math.sqrt(3) / 4, ['sq', 'etri']], hexagon: [3 * Math.sqrt(3) / 2, ['trap', 'trap']], hexagon6: [3 * Math.sqrt(3) / 2, Array(6).fill('etri')], circle: [Math.PI, ['half', 'half']] };
const TOWERS = { tower: ['cube', 'cone'], rocket: ['cylinder', 'cone'] };
const SHARE = { 2: 'half', 3: 'third', 4: 'fourth' };

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML.replace("'http://www.w3.org/2000/svg'", ''), /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage|\bWorker\(|\beval\(|new Function/, 'no outside address (but the SVG namespace name), no network call, no device speech, no local store, no worker, no eval');
  assert.match(HTML, /start\(\{ theme: 'cosy-home', version: '1\.0\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Cosy Home, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/cosy-home')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.0.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/cosy-home/1.0.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Cosy Home 1.0.0 has the piece ${id}`);
  for (const m of HTML.matchAll(/(?:piece\(|\[)'((?:floor|wall|couch|armchair|table|stool|bookshelf|shelf|cabinet|lamp|rug|picture|books?|pillow|cactus|chest|chair|bed)[a-z-]*)'/g)) assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`);
  for (const id of ['knight', 'barbarian', 'mage', 'rogue', 'rogue-hooded']) assert.ok(theme.heroes.some(h => h.id === id), `the theme has the adventurer ${id}`);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|game over!)\b/i, 'no timer, no lives, no losing');
  // a round's steps are run by the game loop: the only wall-clock timers hide a hint, end a button wobble and bring
  // the helper back to standing
  assert.equal((HTML.match(/setTimeout\(/g) || []).length, 3);
  assert.doesNotMatch(HTML, /setInterval\(/);
});

test('rounds: six a chapter, every answer right for the reason the unit teaches, the first lap always the same', () => {
  assert.deepEqual([...SH.CHAPTERS], CHAPTERS); assert.equal(SH.ROUNDS, 6);
  assert.equal(SH.round('find', 0, 0), null); assert.equal(SH.round('find', 7, 0), null); assert.equal(SH.round('bridge', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(SH.round(ch, n, 0), SH.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  // the first lap, as the unit's steps teach it
  const lap0 = ch => [1, 2, 3, 4, 5, 6].map(n => SH.round(ch, n, 0));
  assert.deepEqual(lap0('find').map(r => r.ask[0]), ['find.ask.triangle', 'find.ask.square', 'find.ask.cone', 'find.ask.sides3', 'find.ask.round', 'find.ask.not']);
  assert.equal(lap0('find')[1].items[lap0('find')[1].answer].look, 'turned', 'the square of round 2 is a turned square'); assert.equal(lap0('find')[3].items[lap0('find')[3].answer].look, 'thin', 'the 3 sides of round 4 are a long thin triangle');
  assert.equal(lap0('find')[5].fake, 'open');
  assert.deepEqual(lap0('build').map(r => [r.target, r.recipe.join('+')]), [['square', 'tri+tri'], ['rectangle', 'sq+sq'], ['house', 'sq+etri'], ['hexagon', 'trap+trap'], ['tower', 'cube+cone'], ['hexagon6', 'etri+etri+etri+etri+etri+etri']]);
  assert.deepEqual(lap0('share').map(r => [r.kind, r.item, r.ask[0], r.answer]), [['equal', 'pizza', 'share.ask.eq.pizza', 'no'], ['pick', 'cake', 'share.ask.pick2', lap0('share')[1].answer], ['pick', 'rug', 'share.ask.pick4', lap0('share')[2].answer],
    ['name', 'pie', 'share.ask.name', 'third'], ['whole', 'blanket', 'share.ask.whole2', 2], ['bigger', 'pizza', 'share.ask.big24', 'half']]);

  const seen = { asks: new Set(), looks: new Set(), tone: new Set(), size: new Set(), spot: new Set(), fakes: new Set(), whys: new Set(), targets: new Set(), cuts: new Set(), names: new Set(), pairs: new Set(), eq: new Set(), picks: new Set(), wholes: new Set(), items: new Set() };
  const lines2 = (r, at) => {
    assert.ok(T[r.ask[0]], `${at}: the question ${r.ask[0]} is one of the game's lines`); assert.ok(T[r.show] && T[r.shown], `${at}: the chip's ${r.show} and ${r.shown}`);
    assert.ok(r.said.length >= 1); for (const [k] of r.said) assert.ok(T[k], `${at}: ${k}`);
    for (const [k, v] of [r.ask, ...r.said, ...Object.values(r.hints).flat()]) { assert.ok(T[k], `${at}: ${k}`); assert.doesNotMatch(say(k, v), /undefined|\{/, `${at}: ${k} has all its numbers`); }
    // every choice but the answer has a hint, and the answer has none
    assert.ok(r.choices.includes(r.answer), at); assert.equal(new Set(r.choices.map(String)).size, r.choices.length, at);
    assert.deepEqual(Object.keys(r.hints).sort(), r.choices.filter(v => v !== r.answer).map(String).sort(), `${at}: a hint for every wrong choice`);
    seen.asks.add(r.ask[0]);
  };
  for (let lap = 0; lap < 300; lap++) {
    for (let n = 1; n <= 6; n++) {
      // ---- find: four things in the room, exactly one of them what is asked for
      const f = SH.round('find', n, lap), fa = `find ${n} lap ${lap}`; lines2(f, fa);
      assert.equal(f.kind, ['name', 'name', 'name', 'attr', 'attr', 'not'][n - 1], fa); assert.equal(f.items.length, 4, fa); assert.deepEqual(f.choices, [0, 1, 2, 3], fa);
      const set = f.solid ? SOLID : FLAT;
      if (f.kind === 'not') {
        // three real triangles that look different, and one look-alike: open, or with a curved side
        assert.ok(['open', 'curvy'].includes(f.fake), fa); assert.equal(f.items.filter(it => it.shape === 'triangle').length, 3, fa); assert.equal(f.items[f.answer].shape, f.fake, fa);
        assert.equal(new Set(f.items.filter(it => it.shape === 'triangle').map(it => it.look)).size, 3, `${fa}: three different triangles`);
        assert.ok(f.items.every(it => it.line), `${fa}: all four are drawn the same way, as lines, so only the gap or the curve differs`);
        for (const i of [0, 1, 2, 3]) if (i !== f.answer) assert.deepEqual(f.hints[i], [L('has.real'), L('want.' + f.fake)], fa);
        assert.deepEqual(f.said, [L('yes.' + f.fake)], fa); seen.fakes.add(f.fake);
      } else {
        const is = f.kind === 'name' ? s => s === f.target : ATTR_OF[f.attr];
        assert.ok(set.includes(f.target), fa); assert.ok(is(f.target), `${fa}: the target has what is asked`);
        assert.deepEqual(f.items.map((it, i) => (is(it.shape) ? i : -1)).filter(i => i >= 0), [f.answer], `${fa}: exactly one thing is right`);
        assert.equal(new Set(f.items.map(it => it.shape)).size, 4, `${fa}: four different shapes`); for (const it of f.items) assert.ok(set.includes(it.shape), `${fa}: ${it.shape} is ${f.solid ? 'a solid' : 'flat'}`);
        // a square is a rectangle too: it never sits beside a rectangle that is asked for by name
        if (f.kind === 'name' && f.target === 'rectangle') assert.ok(!f.items.some(it => it.shape === 'square'), fa);
        assert.equal(f.ask[0], 'find.ask.' + (f.kind === 'name' ? f.target : f.attr), fa);
        assert.equal(!!f.solid, n === 3 || ['point', 'ball', 'faces'].includes(f.attr), fa);
        const key = f.kind === 'name' ? f.target : f.attr, look = f.items[f.answer].look;
        assert.deepEqual(f.said, look === 'plain' ? [L('yes.' + key)] : [L('yes.' + key), L(`still.${f.target}.${look}`)], `${fa}: what is said, and that a turned or stretched shape is still itself`);
        // a wrong tap: what that shape has, then what is wanted
        f.items.forEach((it, i) => { if (i !== f.answer) assert.deepEqual(f.hints[i], [L('has.' + it.shape), L('want.' + key)], fa); });
        if (n === 2) assert.notEqual(look, 'plain', `${fa}: round 2 asks for a shape that is turned, thin or upside down`);
        seen.looks.add(f.target + ':' + look);
      }
      for (const it of f.items) { assert.ok(Number.isInteger(it.tone) && it.tone >= 0 && it.tone < 6 && [0, 1, 2].includes(it.size), fa); if (it.shape in SH.FLAT) assert.ok(SH.FLAT[it.shape].looks.includes(it.look), `${fa}: ${it.shape} ${it.look}`); }
      assert.equal(new Set(f.items.map(it => it.tone)).size, 4, `${fa}: four colours`);
      seen.tone.add(f.items[f.answer].tone); seen.size.add(f.items[f.answer].size + ':' + Math.max(...f.items.map(it => it.size)) + ':' + Math.min(...f.items.map(it => it.size))); seen.spot.add(f.answer);

      // ---- build: the pieces that make the outline, and two sets that do not, each for a reason that is true
      const b = SH.round('build', n, lap), ba = `build ${n} lap ${lap}`; lines2(b, ba);
      assert.equal(b.sets.length, 3, ba); assert.deepEqual(b.choices, [0, 1, 2], ba); assert.equal(new Set(b.sets.map(s => [...s].sort().join('+'))).size, 3, `${ba}: three different sets`);
      assert.deepEqual(b.sets[b.answer], b.recipe, ba); for (const s of b.sets) assert.ok(s.length >= 2 && s.length <= 6, `${ba}: two or more pieces`);
      if (b.kind === 'solid') {
        assert.deepEqual(b.recipe, TOWERS[b.target], ba); assert.ok(n === 5, ba);
        b.sets.forEach((s, i) => { if (i === b.answer) return; assert.equal(s.length, 2, ba); const top = s[1] !== b.recipe[1]; assert.ok(top !== (s[0] !== b.recipe[0]), `${ba}: one solid is wrong, the other right`);
          assert.equal(b.whys[i], top ? 'top.' + b.recipe[1] : 'base.' + b.recipe[0], ba); assert.deepEqual(b.hints[i], [L('no.' + b.whys[i])], ba); });
      } else {
        const [area, recipe] = MADE[b.target]; assert.deepEqual(b.recipe, recipe, ba);
        const sum = s => s.reduce((a, k) => a + AREA[k], 0), curved = s => s.some(k => CURVED[k]);
        assert.ok(Math.abs(sum(b.recipe) - area) < 1e-9, `${ba}: the pieces cover the outline exactly (${sum(b.recipe)} of ${area})`);
        assert.equal(curved(b.recipe), b.target === 'circle', ba);
        for (const k of b.sets.flat()) assert.ok(Math.abs(SH.PIECE[k].area - AREA[k]) < 0.001, `${ba}: the game's size of ${k}`);
        b.sets.forEach((s, i) => {
          if (i === b.answer) return assert.equal(b.whys[i], null, ba);
          // the reason, worked out here: a curved side the outline has not (or none where it has one), else too little or too much
          const why = b.target !== 'circle' && curved(s) ? 'curved' : b.target === 'circle' && !curved(s) ? 'straight' : sum(s) < area ? 'gap' : 'over';
          assert.ok(Math.abs(sum(s) - area) > 0.1 || why === 'curved' || why === 'straight', `${ba}: ${s.join('+')} is not the same size as the outline`);
          assert.equal(b.whys[i], why, `${ba}: ${s.join('+')}`); assert.deepEqual(b.hints[i], [L('no.' + why)], ba);
        });
      }
      assert.equal(b.ask[0], 'build.ask.' + b.name, ba); assert.deepEqual(b.said, [L('build.said.' + b.target)], ba); assert.equal(b.shown, 'show.made.' + b.target, ba);
      for (const w of b.whys) if (w) seen.whys.add(w); seen.targets.add(b.target);

      // ---- share: equal or not, halves and fourths, the name of a share, the whole, which is bigger
      const s = SH.round('share', n, lap), sa = `share ${n} lap ${lap}`; lines2(s, sa);
      assert.equal(s.kind, ['equal', 'pick', 'pick', 'name', 'whole', 'bigger'][n - 1], sa); assert.ok(s.item in SH.ITEMS, sa); seen.items.add(s.item);
      for (const c of s.cards) {
        assert.equal(c.item, s.item, `${sa}: the same thing on every card`); assert.ok([2, 3, 4].includes(c.parts), sa);
        assert.ok(SH.CUTS[SH.ITEMS[c.item]][c.equal ? 'eq' : 'un'][c.parts].includes(c.cut), `${sa}: ${c.item} cut ${c.cut}`); seen.cuts.add(`${SH.ITEMS[c.item]}:${c.equal ? 'eq' : 'un'}:${c.parts}:${c.cut}`);
      }
      if (s.kind === 'equal') {
        assert.equal(s.cards.length, 1, sa); assert.deepEqual(s.choices, ['yes', 'no'], sa); assert.equal(s.answer, s.cards[0].equal ? 'yes' : 'no', sa);
        assert.deepEqual(s.ask, L('share.ask.eq.' + s.item, { n: s.cards[0].parts }), `${sa}: as many helpers as shares`); assert.deepEqual(s.said, [L(s.cards[0].equal ? 'share.eq.yes' : 'share.eq.no')], sa);
        assert.equal(s.cards[0].equal, lap % 2 === 1, `${sa}: equal and not equal turn about`); seen.eq.add(s.answer);
      } else if (s.kind === 'pick') {
        assert.equal(s.cards.length, 3, sa); assert.deepEqual(s.choices, [0, 1, 2], sa); if (n === 2) assert.equal(s.parts, 2, sa);
        assert.deepEqual(s.cards.map((c, i) => (c.equal && c.parts === s.parts ? i : -1)).filter(i => i >= 0), [s.answer], `${sa}: exactly one card shows ${s.parts} equal shares`);
        assert.equal(s.cards.filter(c => !c.equal && c.parts === s.parts).length, 1, `${sa}: one has ${s.parts} shares that are not equal`); assert.equal(s.cards.filter(c => c.equal && c.parts !== s.parts).length, 1, `${sa}: one has another number of equal shares`);
        s.cards.forEach((c, i) => { if (i !== s.answer) assert.deepEqual(s.hints[i], c.equal ? [L('share.has', { n: c.parts }), L('share.want.' + s.parts)] : [L('share.uneq')], sa); });
        assert.deepEqual([s.ask, s.said], [L('share.ask.pick' + s.parts), [L('share.said.' + s.parts)]], sa); seen.picks.add(s.parts);
      } else if (s.kind === 'name') {
        const c = s.cards[0]; assert.ok(s.cards.length === 1 && c.equal && c.out && c.parts === s.parts, `${sa}: equal shares, one pulled out`);
        assert.equal(s.choices.length, 3, sa); assert.ok(!(s.choices.includes('fourth') && s.choices.includes('quarter')), `${sa}: a fourth and a quarter are the same, never both offered`);
        assert.equal(s.answer === 'quarter' ? 'fourth' : s.answer, SHARE[c.parts], `${sa}: one of ${c.parts} equal shares`); assert.deepEqual(s.said, [L('share.name.' + s.answer)], sa);
        for (const v of s.choices) if (v !== s.answer) assert.deepEqual(s.hints[v], [L('share.hint.name', { n: c.parts })], sa);
        seen.names.add(s.answer);
      } else if (s.kind === 'whole') {
        const c = s.cards[0]; assert.ok(s.cards.length === 1 && c.equal && c.apart, sa); assert.deepEqual(s.choices, [2, 3, 4], sa); assert.equal(s.answer, c.parts, `${sa}: as many shares as the whole has`);
        assert.deepEqual([s.ask, s.said], [L('share.ask.whole' + c.parts), [L('share.whole.' + c.parts)]], sa); seen.wholes.add(c.parts);
      } else {
        assert.equal(s.cards.length, 2, sa); assert.ok(s.cards.every(c => c.equal && c.out && c.mark), `${sa}: one share of each pulled out`); assert.notEqual(s.cards[0].parts, s.cards[1].parts, sa);
        assert.deepEqual(s.choices, s.cards.map(c => SHARE[c.parts]), `${sa}: a button under each card`);
        const fewer = Math.min(...s.cards.map(c => c.parts)), more = Math.max(...s.cards.map(c => c.parts));
        assert.equal(s.answer, SHARE[fewer], `${sa}: fewer shares of the same thing, so a bigger piece (1/${fewer} > 1/${more})`); assert.ok(1 / fewer > 1 / more);
        assert.deepEqual([s.ask, s.said], [L(`share.ask.big${fewer}${more}`), [L(`share.big.${fewer}${more}`), L('share.more')]], sa); seen.pairs.add(`${fewer}${more}`);
      }
    }
  }
  // colour, size and place are never the clue: over the laps the right thing takes every colour, is the biggest, the
  // smallest and in between, and stands on every spot
  assert.equal(seen.tone.size, 6); assert.equal(seen.spot.size, 4); for (const k of ['0:2:0', '1:2:0', '2:2:0']) assert.ok(seen.size.has(k), `the right thing is sometimes size ${k[0]} of 0-2`);
  for (const k of ['triangle:plain', 'triangle:flip', 'triangle:thin', 'triangle:right', 'square:turned', 'rectangle:tall', 'hexagon:turned', 'circle:plain', 'cube:plain', 'cone:plain', 'cylinder:plain', 'sphere:plain']) assert.ok(seen.looks.has(k), `${k} is asked for`);
  assert.deepEqual([...seen.fakes].sort(), ['curvy', 'open']);
  assert.deepEqual([...seen.targets].sort(), ['circle', 'hexagon', 'hexagon6', 'house', 'rectangle', 'rocket', 'square', 'tower']);
  assert.deepEqual([...seen.whys].sort(), ['base.cube', 'base.cylinder', 'curved', 'gap', 'over', 'straight', 'top.cone']);
  assert.deepEqual([...seen.eq].sort(), ['no', 'yes']); assert.deepEqual([...seen.picks].sort(), [2, 3, 4]); assert.deepEqual([...seen.wholes].sort(), [2, 3, 4]);
  assert.deepEqual([...seen.names].sort(), ['fourth', 'half', 'quarter', 'third']); assert.deepEqual([...seen.pairs].sort(), ['23', '24', '34']); assert.equal(seen.items.size, 5);
  assert.ok(seen.cuts.size >= 18, `every way of cutting is used (${seen.cuts.size})`);
  for (const k of Object.keys(T).filter(k => /^(find|build|share)\.ask\./.test(k))) assert.ok(seen.asks.has(k), `${k} is asked in some round`);
  assert.deepEqual(SH.params({ chapter: 'build', lock: 1 }), { chapter: 'build', lock: true });
  assert.deepEqual(SH.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(SH.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and answer line is a registered spoken line, short enough for a five-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('shape-hunt'));
  const ok = text => lines.allowedLine('shape-hunt', 'en', text);
  const NUMS = { n: 3, m: 6 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.equal(spoken.length, 134);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what the chip shows and the button labels are shown, never read (unless the same words are a spoken line too)
  const spokenText = new Set(spoken.map(k => say(k, NUMS)));
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) if (!spokenText.has(say(k, NUMS))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(ok('½ or ¼'), null); assert.equal(ok('2 triangles'), null); assert.equal(ok('One half'), null);
  assert.equal(say('find.ask.triangle'), 'Tap the triangle.'); assert.equal(say('find.ask.sides3'), 'Tap the shape with 3 sides.'); assert.equal(say('find.ask.round'), 'Tap the shape with no corners.');
  assert.equal(say('find.ask.not'), 'Which one is not a triangle?'); assert.equal(say('has.square') + ' ' + say('want.triangle'), 'That one has 4 equal sides. A triangle has 3 sides.');
  assert.equal(say('still.triangle.flip'), 'Upside down, it is still a triangle.'); assert.equal(say('still.square.turned'), 'Turned round, it is still a square.');
  assert.equal(say('build.said.square'), 'Two triangles make a square.'); assert.equal(say('build.said.hexagon6'), 'Six triangles make a hexagon.'); assert.equal(say('build.said.tower'), 'A cube and a cone make a tower.');
  assert.equal(say('share.ask.eq.pizza', { n: 2 }), '2 helpers share a pizza. Are the shares equal?'); assert.equal(say('share.ask.big24'), 'Which is bigger: a half or a fourth?');
  assert.equal(say('share.whole.2'), 'Two halves make one whole.'); assert.equal(say('share.said.4'), 'Four equal shares are fourths, or quarters.'); assert.equal(say('share.has', { n: 4 }), 'That one has 4 equal shares.');
  assert.equal(ok('Tap the pentagon.'), null, 'only the game’s own lines');
  assert.equal(ok('two helpers share a pizza. Are the shares equal?'), null, 'a number goes where the number is, never a word');
  // Every spoken line: one or two sentences, 10 words at most; an instruction fits the words box.
  for (const k of spoken) { assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`); assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`); }
  const asks = spoken.filter(k => /\.ask\./.test(k));
  assert.equal(asks.length, 38); for (const k of asks) assert.ok(say(k, NUMS).length <= 50, `${k} fits the words box`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak|chip)\('([a-z][a-zA-Z0-9._]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const k of ['ch.find', 'ch.build', 'ch.share', 'btn.yes', 'btn.no', 'btn.half', 'btn.third', 'btn.fourth', 'btn.quarter', 'win', 'win.card', ...Object.keys(SH.PIECE).map(k => 'show.piece.' + k)]) assert.ok(T[k], k);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  // food is shared between helpers, never bought or sold
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(price|buy|bought|sell|sold|shop|money|coins?|dollars?|cents?|pay|cost)\b/i, `a home, not a shop: ${text}`);
  // the hint for a wrong shape names what that shape has; for a wrong set of pieces, what is wrong with them
  for (const s of [...FLAT, ...SOLID]) { assert.match(T['has.' + s], /^That one (has|is) /, s); assert.ok(T['want.' + s] && T['yes.' + s] && T['find.ask.' + s] && T['show.' + s], s); }
  for (const s of FLAT.filter(x => SIDES[x])) assert.match(T['has.' + s], new RegExp(`\\b${s === 'rectangle' ? '2 long sides and 2 short' : SIDES[s]}\\b`), `${s}: its sides are counted`);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('shape-hunt'));
  assert.equal(META.slug, 'shape-hunt'); assert.equal(META.title, 'Shape Hunt'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1); assert.equal(META.featured, true);
  assert.doesNotMatch(META.description + META.tags, /\b(price|buy|sell|shop|money)\b/i);
  assert.deepEqual(SHELF_INFO['shape-hunt'], { subject: 'math', from: 0, to: 2 }, 'on the Learn shelf as math for kindergarten to grade 2');
  for (const f of ['public/covers/shape-hunt.jpg', 'public/og/shape-hunt.jpg', 'scripts/covers/shape-hunt.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'shape-hunt'), { slug: 'shape-hunt', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('shape-hunt'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.SHAPE_CHAPTERS, { find: ['K.G.A.2', '1.G.A.1'], build: ['K.G.B.6', '1.G.A.2'], share: ['1.G.A.3', '2.G.A.3'] });
  assert.deepEqual(TAGS.gameCodes('shape-hunt', 'ccss-math'), Object.values(TAGS.SHAPE_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('shape-hunt'));
  assert.equal(UNIT.title, 'The Shape Shed'); assert.equal(UNIT.stamp, 'Shape Seed'); assert.equal(UNIT.tool, 'shape-hunt');
  assert.ok(UNITS.tiers.launchpad.stones.includes('Shape Seed')); assert.equal(UNITS.tiers.launchpad.status, 'building');
  assert.deepEqual(STEPS.map(s => s.n), ['6.1', '6.2', '6.3']);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'shape-hunt'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(SH.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names
    for (const grade of ['K', '1', '2', '']) assert.deepEqual(TAGS.stepGameCodes('shape-hunt', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('shape-hunt', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('shape-hunt', 'ccss-math', 'K', ''), ['K.G.A.2', 'K.G.B.6'], 'an unlocked kindergarten step claims the game’s kindergarten codes');
  assert.deepEqual(TAGS.stepGameCodes('shape-hunt', 'ccss-math', '1', ''), ['1.G.A.1', '1.G.A.2', '1.G.A.3'], 'an unlocked grade 1 step its grade 1 codes');
  assert.deepEqual(TAGS.stepGameCodes('shape-hunt', 'ccss-math', '2', ''), ['2.G.A.3'], 'and a grade 2 step its grade 2 code');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.SH_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Shape Hunt' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__sh.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg, timeout = 30_000) => frame.waitForFunction(fn, arg, { timeout });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
const btn = v => '#sh-' + (typeof v === 'number' ? 'n' + v : v);
const inRoom = s => s.chapter === 'find' || s.kind === 'pick';
/** The hint a wrong choice gets: its lines, one after the other. */
const hintOf = (s, v) => s.hints[v].map(([k, a]) => say(k, a)).join(' ');
/** What a round puts in the room while it is asked, worked out here from the round. */
function staged(s) {
  if (s.chapter === 'find') return { cards: s.solid ? 0 : 4, solids: s.solid ? 4 : 0, ghosts: 0, board: false, pieces: [] };
  if (s.chapter === 'build') return { cards: 0, solids: 0, ghosts: s.kind === 'solid' ? 2 : 0, board: s.kind === 'flat', pieces: [] };
  return { cards: s.cards.length, solids: 0, ghosts: 0, board: false, pieces: [] };
}

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong answer does not advance, six right rounds post game over once`, { skip, timeout: 420_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .sh-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five the other Launchpad games offer)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__sh.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-find, #menu').length), 0);
    await until(() => window.__sh.state().moving === 0, null, 90_000);   // round 1's things have popped in at the game's own speed
    await frame.evaluate(() => window.__sh.fast());   // no waiting between the steps of a round; the taps are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const want = SH.round(chapter, round, 0);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.equal(asked, say(s.ask[0], s.ask[1]), `round ${round}: the instruction`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), T[s.show], `round ${round}: the chip`);
      await g.shot(`${chapter}-${round}`);
      // the room holds what the round asks about: four shapes or solids, the board or the ghost tower, the share cards
      assert.deepEqual(s.onStage, staged(s), `round ${round}: what stands in the room`);
      // the choices: clear buttons over the things in the room, or big buttons at the bottom
      assert.deepEqual(await ids(frame, inRoom(s) ? '#spots .sh-spot' : '#bar .sh-btn'), s.choices.map(v => btn(v).slice(1)), `round ${round}: one button for each choice`);
      assert.equal(await frame.evaluate(() => document.getElementById('bar').hidden), inRoom(s), `round ${round}: the bottom bar shows only when the round uses buttons`);
      // a wrong answer: its hint and a wobble, the same round, nothing reported
      const wrong = s.choices.find(v => v !== s.answer);
      await frame.click(btn(wrong));
      const after = await state();
      assert.deepEqual([after.round, after.phase, after.screen], [round, 'play', 'play'], `round ${round}: a wrong answer does not advance`);
      assert.equal(await text(frame, '#hint'), hintOf(s, wrong), `round ${round}: a wrong answer gets the hint that says why`);
      for (const [k, v] of s.hints[wrong]) assert.ok((await g.spoken()).includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
      assert.equal(await frame.evaluate(() => document.querySelectorAll('.sh-btn.no, .sh-spot.no').length), 1, `round ${round}: and a wobble on what was tapped`);
      assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
      await frame.click(btn(s.answer));
      await until(r => { const t = window.__sh.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken();
      for (const [k, v] of s.said) assert.ok(said.includes(say(k, v)), `round ${round}: "${say(k, v)}" is said`);
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .sh-btn'), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('shape-hunt', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new shapes), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__sh.state().screen === 'play');
    s = await state();
    assert.equal(s.round, 1); assert.deepEqual(Object.fromEntries(Object.keys(SH.round(chapter, 1, 1)).map(k => [k, s[k]])), SH.round(chapter, 1, 1), 'the second lap’s first round');
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; at the game’s own speed wrong pieces are tried on the outline and go again, the right ones fly in and snap', { skip, timeout: 600_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__sh.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .sh-menu .sh-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-find', 'Find the Shape'], ['ch-build', 'Build It'], ['ch-share', 'Equal Shares']]);
  await g.shot('menu');
  // Build It, round 1 (which pieces make the square?), with nothing hurried
  await frame.click('#ch-build');
  await until(() => window.__sh.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.target, s.kind], ['build', false, 'square', 'flat']);
  assert.deepEqual(s.onStage, { cards: 0, solids: 0, ghosts: 0, board: true, pieces: [] }, 'the board with the ghost outline, and no piece on it yet');
  // a wrong set is tried: its pieces fly to the outline, do not fit, and go again
  const wrong = s.choices.find(v => v !== s.answer);
  await frame.click(btn(wrong));
  assert.equal((await state()).phase, 'try'); assert.equal((await state()).trial, wrong); assert.equal(await text(frame, '#hint'), hintOf(s, wrong));
  await frame.click(btn(s.answer));   // a tap while the pieces are being tried changes nothing
  assert.equal((await state()).phase, 'try');
  await until(n => window.__sh.state().onStage.pieces.length === n, s.sets[wrong].length, 120_000);
  assert.deepEqual((await state()).onStage.pieces, s.sets[wrong], 'the pieces that were picked are the ones on the board');
  assert.equal((await state()).snapped, 0, 'they do not snap in');
  await g.shot('build-try');
  await until(() => window.__sh.state().phase === 'play', null, 180_000);
  assert.deepEqual([(await state()).onStage.pieces, (await state()).round, (await state()).snapped], [[], 1, 0], 'the tried pieces are gone and the round goes on');
  assert.equal((await g.msgs('brb:gameover')).length, 0);
  // the right set: each piece flies in and snaps into the outline, one after the other, and only then the next round
  await frame.click(btn(s.answer));
  assert.equal((await state()).phase, 'right'); assert.equal(await text(frame, '#sum'), T[s.shown]);
  await until(n => window.__sh.state().snapped === n, s.recipe.length, 180_000);
  assert.deepEqual([(await state()).onStage.pieces, (await state()).round], [s.recipe, 1], 'both triangles are in the square');
  await g.shot('build-snap');
  await until(() => window.__sh.state().round === 2, null, 180_000);
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();

  // Find the Shape, round 1 at the game's own speed: a tap on a shape in the room itself (through its clear button)
  const y = await open();
  await y.frame.click('#hero-rogue');
  await y.until(() => window.__sh.state().screen === 'menu');
  await y.frame.click('#ch-find');
  await y.until(() => window.__sh.state().screen === 'play' && window.__sh.state().moving === 0, null, 120_000);
  s = await y.state();
  assert.equal(s.ask[0], 'find.ask.triangle');
  const spot = await y.frame.evaluate(() => window.__sh.spot());
  const mid = c => [(c.btn[0] + c.btn[2]) / 2, (c.btn[1] + c.btn[3]) / 2];
  const miss = spot.cands.find(c => c.v !== s.answer), hit = spot.cands.find(c => c.v === s.answer);
  await y.p.mouse.click(...mid(miss));
  assert.deepEqual([(await y.state()).phase, (await y.state()).round, await text(y.frame, '#hint')], ['play', 1, hintOf(s, miss.v)], 'a click on another shape in the room: its hint, the same round');
  await y.p.mouse.click(...mid(hit));
  assert.equal((await y.state()).phase, 'right'); assert.equal(await y.frame.evaluate(() => document.querySelectorAll('.sh-spot.go').length), 1);
  await y.until(() => window.__sh.state().round === 2, null, 180_000);
  // and a share round: the shares of a whole come back together when the answer is found
  assert.deepEqual(y.errors, []); assert.deepEqual(y.outside, []);
  await y.ctx.close();
});

test('keyboard, phones and reduced motion: every choice is a button a key can press; the top row is tidy, every shape in the room is big, in full view and clear of the helper', { skip, timeout: 900_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the clear buttons over the shapes.
  const k = await open({ params: 'chapter=find&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__sh.state().screen === 'play');
  const s = await k.state();
  await k.frame.evaluate(() => window.__sh.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus(btn(wrong)); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), hintOf(s, wrong), 'Enter on the wrong shape: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus(btn(0));
  for (let i = 0; i < s.answer; i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'sh-n' + s.answer, 'Tab walks the shapes in order');
  assert.match(await k.frame.evaluate(() => document.activeElement.getAttribute('aria-label')), /^Shape \d$/, 'a shape’s button is named by its place, never by its answer');
  await k.p.keyboard.press(' ');
  await k.until(() => window.__sh.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^sh-n\d$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the shapes');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // Desktop, a 390 px phone, and a 360 px phone with reduced motion, every round of every chapter: the words, the chip
  // and the round dots never touch each other or the gear button (one line on a wide screen); the buttons are big and
  // apart; every thing to tap in the room is at least 44 px (far more), inside the screen between the words and the
  // buttons, not behind any furniture, and clear of the helper (the box is as wide as the Wizard's hat).
  for (const [width, height, reducedMotion, touch] of [[960, 600, 'no-preference', false], [390, 844, 'no-preference', true], [360, 640, 'reduce', true]]) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-mage') : m.frame.click('#hero-mage'));
      await m.until(() => window.__sh.state().screen === 'play');
      await m.frame.evaluate(() => window.__sh.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__sh.state().round === r && window.__sh.state().phase === 'play' && window.__sh.state().moving === 0, round, 120_000);
        await m.p.waitForTimeout(120);   // a frame, so the clear buttons sit where the camera now shows the shapes
        const st = await m.state(), at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        const fit = await m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar .sh-btn')].filter(b => !$('bar').hidden).map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const sp = window.__sh.spot(), line = r($('line')).bottom, bar = $('bar').hidden ? innerHeight : r($('bar')).top, box = b => ({ left: b[0], top: b[1], right: b[2], bottom: b[3] });
          const cands = sp.cands.map(c => ({ btn: box(c.btn), box: box(c.box), clear: c.clear })), things = sp.things.map(t => ({ box: box(t.box), clear: t.clear })), hero = box(sp.hero);
          const inView = b => b.left >= 0 && b.right <= innerWidth && b.top >= line && b.bottom <= bar;
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)), three: top.length,
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // the things to tap: big, on screen, on their shapes, apart from each other, not behind furniture, clear of the helper
            spots: cands.length, tiny: cands.filter(c => c.btn.right - c.btn.left < 44 || c.btn.bottom - c.btn.top < 44).length, least: Math.min(999, ...cands.map(c => Math.min(c.btn.right - c.btn.left, c.btn.bottom - c.btn.top))),
            view: cands.every(c => inView(c.btn) && inView(c.box)) && things.every(t => inView(t.box)), on: cands.every(c => Math.abs(c.btn.left - c.box.left) <= 3 && Math.abs(c.btn.right - c.box.right) <= 3 && Math.abs(c.btn.top - c.box.top) <= 3 && Math.abs(c.btn.bottom - c.box.bottom) <= 3),
            apart: !cands.some((a, i) => cands.some((b, j) => j > i && hit(a.btn, b.btn))), blocked: [...cands, ...things].filter(c => !c.clear).length,
            helper: hero.left >= 0 && hero.right <= innerWidth && hero.top > line && hero.bottom <= bar, hidden: [...cands.map(c => c.btn), ...things.map(t => t.box)].filter(b => hit(b, hero)).length };
        });
        const room = inRoom(st);
        assert.deepEqual(fit, { inside: true, top: false, three: 3, oneLine: width > height ? true : null, small: 0, n: room ? 0 : st.choices.length, overlap: false, scroll: false,
          spots: room ? st.choices.length : 0, tiny: 0, least: fit.least, view: true, on: true, apart: true, blocked: 0, helper: true, hidden: 0 },
          `${at}: on screen, the top row tidy, the buttons big and apart, every shape big, in view, unhidden and clear of the helper`);
        // a shape to tap is bigger than the 44 px a finger needs: 56 px or more on a 390 px phone, 50 px on a 360 px one, 70 px on a desktop
        if (room) assert.ok(fit.least >= (width >= 900 ? 70 : width >= 390 ? 56 : 50), `${at}: the smallest thing to tap is ${fit.least} px`);
        if (round === 1 && reducedMotion === 'reduce') {
          const miss = btn(st.choices.find(v => v !== st.answer));
          await m.frame.tap(miss);
          assert.equal(await m.frame.evaluate(id => getComputedStyle(document.querySelector(id)).outlineStyle, miss), 'dashed', `${at}: with reduced motion a wrong tap shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        // finish the round the quick way (the handle), so the next one can be measured
        await m.frame.evaluate(v => window.__sh.act('answer', v), st.answer);
      }
      await m.until(() => window.__sh.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
