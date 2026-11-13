// Crate Stacker (seed-games/crate-stacker.html): Number Quest Launchpad Unit 3's game, a Kit 2 (Oomba3D) toy loading
// yard for grade 1, where a crate is a one and a tower of ten crates is a ten. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between crate-stacker:begin and crate-stacker:end): six a chapter, the numbers in the
//     ranges the unit teaches, every answer re-derived from the round's own numbers, the wrong choices the mistakes a
//     child really makes (the digits swapped, the tens added as ones, the new ten forgotten), the same first lap
//     every time;
//   - its words: every line it says is one of its own registered lines (the AI-voice allowlist), and what the number
//     chip shows (with a "?" or a sign in it) is never sent to be spoken;
//   - its registration: seeded, in the Number Quest course, tagged chapter by chapter with the codes units.json gives
//     the three steps, and its lesson parameters survive the play-params grammar;
//   - the game itself, in real Chromium inside the production game frame (frameDocument + the frame CSP + the sandbox),
//     for each chapter in lesson mode: it loads with no error and asks for nothing outside /vendor, a wrong answer
//     gets a hint and does not advance the round, every instruction is sent to be spoken, and a correct play of all
//     six rounds posts the game-over message (the course step's completion signal) exactly once, not before;
//     then the picture menu with no parameters, loading by hand (ten loose crates snap into a tower, Take one off,
//     the full truck), a tap on a truck in the yard itself, the keyboard, a 360 px phone and reduced motion.
// The play tests need a local Chromium; they are skipped when there is none. CS_SHOTS=<dir> saves screenshots there.
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
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/crate-stacker.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/crate-stacker.json'), 'utf8'));
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const UNIT = UNITS.units.find(u => u.tier === 'launchpad' && u.n === 3), STEPS = UNIT.steps;
const CHAPTERS = ['build', 'greater', 'add'];

// The game's own round maker and words, run on their own (no DOM, no 3D).
const CS = (() => {
  const box = {}; vm.runInNewContext(/\/\* crate-stacker:begin \*\/([\s\S]*?)\/\* crate-stacker:end \*\//.exec(HTML)[1], box);
  const plain = v => JSON.parse(JSON.stringify(v)), G = box.CrateStacker;   // plain objects of this realm, so deepEqual can compare them
  return { CHAPTERS: plain(G.CHAPTERS), SIGNS: plain(G.SIGNS), ROUNDS: G.ROUNDS, MAX: G.MAX, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)) };
})();
const T = lines.readGame('crate-stacker').strings.en;
const say = (key, v = {}) => T[key].replace(/\{(\w+)\}/g, (m, k) => v[k]);
const tensOf = n => Math.floor(n / 10), onesOf = n => n % 10;
/** "3 tens and 4 ones": the key of the line for these tens and ones ("1 ten" and "1 one" are lines of their own). */
const partsKey = (base, t, o) => `${base}.${t === 1 ? '1' : 'n'}${o === 1 ? '1' : 'n'}`;

test('the file: the scanner passes it, nothing leaves the site, and its import map is exactly kit2ImportMap()', () => {
  const r = scanVersion(HTML);
  assert.deepEqual(r.issues.filter(i => i.level === 'fail'), []);
  assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(HTML.includes(V.kit2ImportMap()), 'the literal pinned Kit 2 import map (run kit2ImportMap() again after a library bump)');
  assert.equal((HTML.match(/<script\b[^>]*type="importmap"/g) || []).length, 1, 'one import map');
  assert.deepEqual(V.checkThree(HTML), []); assert.deepEqual(V.checkKit2(HTML).issues, []);
  assert.deepEqual(V.deviceNeeds(HTML), { webgl2: true, importmap: true }, 'a device without WebGL2 or import maps gets the standard card');
  assert.doesNotMatch(HTML, /https?:\/\/|\bfetch\(|XMLHttpRequest|speechSynthesis|localStorage/, 'no outside address, no network call, no device speech, no local store');
  assert.match(HTML, /start\(\{ theme: 'toy-town', version: '1\.1\.0', graphics: 'auto', time: 'day', outline: true, settings: true \}\)/);
  // the newest shipped Toy Town, and every piece the game asks the theme for is one the theme has
  const shipped = fs.readdirSync(path.join(ROOT, 'public/vendor/themes/toy-town')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  assert.equal(shipped[shipped.length - 1], '1.1.0');
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/vendor/themes/toy-town/1.1.0/theme.json'), 'utf8')), have = new Set(theme.pieces.map(p => p.id));
  const asked = /const PIECES = \[([^\]]+)\]/.exec(HTML)[1].match(/'[a-z-]+'/g).map(x => x.slice(1, -1));
  assert.ok(asked.length >= 20); for (const id of asked) assert.ok(have.has(id), `Toy Town 1.1.0 has the piece ${id}`);
  for (const m of HTML.matchAll(/(?:piece\(|\[)'((?:building|car|tree|road|bush|street|water|fire|bench|forest)[a-z-]*)'/g)) assert.ok(asked.includes(m[1]), `${m[1]} is loaded before it is used`);
  assert.equal((HTML.match(/BRB\.gameOver\(/g) || []).length, 1, 'one completion call site, at the end of a chapter');
  assert.match(HTML, /BRB\.gameOver\(\{ won: true \}\)/);
  assert.doesNotMatch(HTML, /\b(lives left|you lose|out of time|countdown|game over!)\b/i, 'no timer, no lives, no losing');
});

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the first lap always the same', () => {
  assert.deepEqual([...CS.CHAPTERS], CHAPTERS); assert.equal(CS.ROUNDS, 6); assert.equal(CS.MAX, 99); assert.deepEqual([...CS.SIGNS], ['gt', 'eq', 'lt']);
  assert.equal(CS.round('build', 0, 0), null); assert.equal(CS.round('build', 7, 0), null); assert.equal(CS.round('shapes', 1, 0), null);
  for (const ch of CHAPTERS) for (let n = 1; n <= 6; n++) assert.deepEqual(CS.round(ch, n, 0), CS.round(ch, n, 0), `${ch} ${n}: seeded from the round number`);
  /** Three different numbers, smallest first, the answer among them, all inside [lo, hi]. */
  const three = (r, lo, hi, at) => {
    assert.equal(r.choices.length, 3, at); assert.deepEqual([...r.choices].sort((a, b) => a - b), r.choices, `${at}: smallest first`); assert.equal(new Set(r.choices).size, 3, `${at}: three different numbers`);
    assert.ok(r.choices.includes(r.answer), `${at}: the answer is offered`);
    for (const v of r.choices) assert.ok(Number.isInteger(v) && v >= lo && v <= hi, `${at}: ${v} is a number from ${lo} to ${hi}`);
  };
  const seen = { build: new Set(), read: new Set(), signs: new Set(), kinds: new Set(), sums: new Set() };
  for (let lap = 0; lap < 200; lap++) {
    const types = [];
    for (let n = 1; n <= 6; n++) {
      // build: load a number (1-3), then read a load (4-6)
      const b = CS.round('build', n, lap), at = `build ${n} lap ${lap}`;
      assert.equal(b.kind, n <= 3 ? 'build' : 'read', at);
      assert.equal(b.answer, b.tens * 10 + b.ones, `${at}: ${b.tens} tens and ${b.ones} ones`);
      if (b.kind === 'build') {
        assert.equal(b.ask, n === 3 ? 'parts' : 'number', at); assert.equal(b.choices, undefined, `${at}: built, not picked`);
        assert.ok(b.ones >= 1 && b.ones <= 9 && (n === 1 ? b.tens === 1 : n === 2 ? b.tens >= 2 && b.tens <= 4 : b.tens >= 5 && b.tens <= 9), `${at}: ${b.answer} in its range`);
        assert.ok(b.answer <= CS.MAX, `${at}: the truck can hold it`); seen.build.add(b.answer);
      } else if (n === 4) {
        assert.ok(b.tens >= 2 && b.ones >= 1 && b.tens !== b.ones, `${at}: two different digits`);
        assert.ok(b.choices.includes(b.ones * 10 + b.tens), `${at}: the digits the other way round (${b.ones * 10 + b.tens}) are offered`); three(b, 11, 99, at); seen.read.add(b.answer);
      } else if (n === 5) {
        assert.ok(b.ones === 0 && b.tens >= 2 && b.tens <= 9, `${at}: whole tens`);
        assert.deepEqual(b.choices, [b.tens, 10 + b.tens, b.answer], `${at}: ${b.tens} (the digit alone) and ${10 + b.tens} are the traps`);
      } else {
        assert.ok(b.tens === 10 && b.ones >= 1 && b.ones <= 9 && b.answer >= 101 && b.answer <= 109, `${at}: ten towers and a few crates`);
        assert.deepEqual(b.choices, [10 + b.ones, b.answer, 110 + b.ones], `${at}: past 100, never past 120`);
      }
      // greater: which truck has more (1-3), then the sign (4-6)
      const g = CS.round('greater', n, lap), gr = `greater ${n} lap ${lap}`;
      assert.equal(g.kind, n <= 3 ? 'more' : 'sign', gr); assert.equal(g.view, n === 3 || n === 6 ? 'numbers' : 'loads', gr);
      for (const v of [g.a, g.b]) assert.ok(Number.isInteger(v) && v >= 21 && v <= 99 && onesOf(v) >= 1, `${gr}: ${v} is a two-digit number with tens and ones`);
      assert.equal(g.look, tensOf(g.a) !== tensOf(g.b) ? 'tens' : g.a !== g.b ? 'ones' : 'same', `${gr}: tens first, then ones`);
      if (g.kind === 'more') {
        assert.notEqual(g.a, g.b, gr); assert.equal(g.answer, Math.max(g.a, g.b), gr); assert.deepEqual(g.choices, [g.a, g.b], `${gr}: the two trucks, left to right`);
        assert.equal(g.look, n === 2 ? 'ones' : 'tens', gr);
        if (n === 1) assert.ok(Math.abs(tensOf(g.a) - tensOf(g.b)) >= 2, `${gr}: the towers plainly differ`);
        if (n === 3) assert.deepEqual([tensOf(g.b), onesOf(g.b)], [onesOf(g.a), tensOf(g.a)], `${gr}: the same two digits, swapped`);
      } else {
        assert.deepEqual(g.choices, ['gt', 'eq', 'lt'], gr); assert.equal(g.answer, g.a > g.b ? 'gt' : g.a < g.b ? 'lt' : 'eq', `${gr}: ${g.a} and ${g.b}`);
        assert.equal(g.type, { tens: 'tens', ones: 'ones', same: 'equal' }[g.look], gr); types.push(g.type); seen.signs.add(g.answer);
        if (g.type === 'tens') { const hi = Math.max(g.a, g.b), lo = Math.min(g.a, g.b); assert.ok(onesOf(lo) > onesOf(hi), `${gr}: the smaller number has the bigger ones digit (${lo}, ${hi})`); }
      }
      // the lines that explain a comparison never need "1 ten" or "1 one"
      if (g.look === 'tens') assert.ok(Math.min(tensOf(g.a), tensOf(g.b)) >= 2, gr);
      if (g.look === 'ones') assert.ok(Math.min(onesOf(g.a), onesOf(g.b)) >= 2, gr);
      // add: tens more, ten more, ones more, ones over a ten, ten less, ones over a ten again
      const a = CS.round('add', n, lap), ad = `add ${n} lap ${lap}`;
      assert.equal(a.kind, ['tens', 'more10', 'ones', 'ones', 'less10', 'ones'][n - 1], ad);
      assert.equal(a.answer, a.kind === 'less10' ? a.a - a.b : a.a + a.b, `${ad}: ${a.a} and ${a.b}`);
      assert.ok(a.a >= 11 && a.a <= 99 && onesOf(a.a) >= 1 && a.answer >= 11 && a.answer <= 99, `${ad}: two-digit numbers, the total under 100`);
      three(a, 1, 99, ad); seen.kinds.add(a.kind); seen.sums.add(a.answer);
      if (a.kind === 'tens') { assert.ok(a.b % 10 === 0 && a.b >= 20 && a.b <= 40, ad); assert.ok(a.choices.includes(a.a + a.b / 10), `${ad}: the tens added as ones (${a.a + a.b / 10}) is offered`); assert.equal(onesOf(a.answer), onesOf(a.a), `${ad}: the ones stay`); }
      if (a.kind === 'more10' || a.kind === 'less10') { assert.equal(a.b, 10, ad); assert.equal(onesOf(a.answer), onesOf(a.a), `${ad}: the ones stay`); assert.ok(a.choices.includes(a.kind === 'more10' ? a.a + 1 : a.a - 1), `${ad}: one more or less (not ten) is offered`); }
      if (a.kind === 'ones') {
        assert.ok(a.b >= 2 && a.b <= 9, ad); assert.equal(a.cross, onesOf(a.a) + a.b > 10, `${ad}: whether the crates fill a tower`); assert.equal(a.cross, n !== 3, ad);
        assert.notEqual(onesOf(a.a) + a.b, 10, `${ad}: over a ten there are crates left to go on`);
        if (a.cross) assert.ok(a.choices.includes(a.answer - 10), `${ad}: the new ten forgotten (${a.answer - 10}) is offered`); else assert.equal(tensOf(a.answer), tensOf(a.a), `${ad}: the tens stay`);
      }
    }
    assert.deepEqual([...types].sort(), ['equal', 'ones', 'tens'], `greater lap ${lap}: rounds 4-6 are one of each kind`);
  }
  assert.deepEqual([...seen.build].filter(v => v < 20).sort((a, b) => a - b), [11, 12, 13, 14, 15, 16, 17, 18, 19], 'every teen is loaded');
  assert.ok(Math.max(...seen.build) >= 95 && Math.min(...seen.read) <= 25 && Math.max(...seen.read) >= 95, 'loads reach right across the two-digit numbers');
  assert.deepEqual([...seen.signs].sort(), ['eq', 'gt', 'lt'], 'all three signs are asked');
  assert.deepEqual([...seen.kinds].sort(), ['less10', 'more10', 'ones', 'tens']);
  assert.deepEqual(CS.params({ chapter: 'add', lock: 1 }), { chapter: 'add', lock: true });
  assert.deepEqual(CS.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(CS.params(undefined), { chapter: '', lock: false });
});

test('words: every instruction, hint and answer line is a registered spoken line, short enough for a six-year-old', () => {
  assert.ok(lines.TTS_GAMES.has('crate-stacker'));
  const ok = text => lines.allowedLine('crate-stacker', 'en', text);
  const NUMS = { a: 27, b: 5, c: 32, n: 34, m: 6, t: 3, o: 4 };
  const spoken = Object.keys(T).filter(k => !/^(btn\.|show\.|ch\.|round$|title$|loading$)/.test(k));
  assert.ok(spoken.length >= 40);
  for (const k of spoken) assert.deepEqual(ok(say(k, NUMS)), { text: say(k, NUMS), role: 'friendly' }, `${k}: "${say(k, NUMS)}" may be spoken, in the friendly voice`);
  // what the chip shows (a "?" or a sign may stand in it) and the button labels are shown, never read
  for (const k of Object.keys(T).filter(k => /^(btn\.|show\.)/.test(k))) assert.equal(ok(say(k, NUMS)), null, `${k} is not a spoken line`);
  assert.equal(say('build.ask', { n: 34 }), 'Load 34 crates.'); assert.equal(say('build.ask.parts.nn', { t: 5, o: 3 }), 'Load 5 tens and 3 ones.');
  assert.equal(say(partsKey('parts', 3, 4), { t: 3, o: 4, n: 34 }), '3 tens and 4 ones make 34.'); assert.equal(say(partsKey('parts', 1, 4), { o: 4, n: 14 }), '1 ten and 4 ones make 14.');
  assert.equal(say(partsKey('parts', 3, 1), { t: 3, n: 31 }), '3 tens and 1 one make 31.'); assert.equal(say(partsKey('parts', 1, 1)), '1 ten and 1 one make 11.');
  assert.equal(say(partsKey('parts', 4, 0), { t: 4, o: 0, n: 40 }), '4 tens and 0 ones make 40.'); assert.equal(say('read.hundred', { o: 4, n: 104 }), '10 tens make 100. 4 more makes 104.');
  assert.equal(say('gr.gt', { a: 52, b: 38 }), '52 is greater than 38.'); assert.equal(say('gr.lt', { a: 38, b: 52 }), '38 is less than 52.'); assert.equal(say('gr.eq', { a: 47, b: 47 }), '47 is equal to 47.');
  assert.equal(say('gr.why.tens', { a: 5, b: 3 }), '5 tens is more than 3 tens.');
  assert.equal(say('add.ask', { a: 27, b: 30 }), '27 and 30 more. How many?'); assert.equal(say('add.fill', { a: 27, b: 3, c: 30 }), '27 and 3 make 30.'); assert.equal(say('add.more', { b: 2, c: 32 }), '2 more makes 32.');
  assert.equal(say('more10.sum', { a: 46, c: 56 }), '10 more than 46 is 56.'); assert.equal(say('less10.ask', { a: 63 }), 'What is 10 less than 63?');
  assert.equal(say('show.q', { a: 34, b: 52 }), '34 ? 52'); assert.equal(say('show.lt', { a: 34, b: 52 }), '34 < 52'); assert.equal(say('show.add', { a: 27, b: 30, c: '?' }), '27 + 30 = ?'); assert.equal(say('show.sub', { a: 63, b: 10, c: 53 }), '63 − 10 = 53');
  assert.equal(say(partsKey('show.parts', 3, 4), { t: 3, o: 4 }), '3 tens and 4 ones'); assert.equal(say(partsKey('show.parts', 1, 1)), '1 ten and 1 one');
  assert.equal(ok('Load the crates and call me.'), null, 'only the game’s own lines');
  assert.equal(ok('Load many crates.'), null, 'a number goes where the number is, never a word');
  // The instructions (what the child is asked to do): at most two sentences, 8 words in all.
  const asks = ['hero.pick', 'menu.pick', 'build.ask', 'build.ask.parts.nn', 'build.ask.parts.n1', 'read.ask', 'more.ask', 'sign.ask', 'add.ask', 'more10.ask', 'less10.ask'];
  for (const k of asks) {
    assert.ok(T[k], k);
    assert.ok(T[k].split(/(?<=[.!?])\s+/).length <= 2, `${k} is one or two sentences: ${T[k]}`);
    assert.ok(T[k].split(/\s+/).length <= 8, `${k} is short: ${T[k]}`);
  }
  // No spoken line is long: 10 words at most.
  for (const k of spoken) assert.ok(T[k].split(/\s+/).length <= 10, `${k} is short enough to hear: ${T[k]}`);
  // Every key the game's code names exists in its words.
  for (const m of HTML.matchAll(/(?:fmt|say|hint|speak|right|sum)\('([a-z][a-zA-Z0-9.]*)'/g)) if (!m[1].endsWith('.')) assert.ok(T[m[1]] !== undefined, `the game uses "${m[1]}", which its words do not have`);
  for (const base of ['parts', 'show.parts']) for (const sfx of ['nn', 'n1', '1n', '11']) assert.ok(T[`${base}.${sfx}`], `${base}.${sfx}`);
  for (const k of ['build.hint.tens.n', 'build.hint.tens.1', 'build.hint.ones.n', 'build.hint.ones.1', 'gr.hint.tens', 'gr.hint.ones', 'gr.hint.same', 'gr.why.tens', 'gr.why.ones', 'gr.why.same', 'tens.hint', 'ones.hint', 'ones.hint.ten', 'more10.hint', 'less10.hint', 'more10.sum', 'less10.sum', 'ch.build', 'ch.greater', 'ch.add']) assert.ok(T[k], k);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /[–—]/, text);
  for (const text of Object.values(T)) assert.doesNotMatch(text, /\b(price|buy|sell|shop|money|coins?|dollars?|cents?|pay)\b/i, `a loading yard, not a shop: ${text}`);
});

test('registration: seeded, in the Number Quest course, and tagged chapter by chapter as units.json teaches', () => {
  assert.ok(SEED_GAMES.includes('crate-stacker'));
  assert.equal(META.slug, 'crate-stacker'); assert.equal(META.title, 'Crate Stacker'); assert.equal(META.category, 'learning'); assert.equal(META.shelf, 'learn'); assert.equal(META.players_max, 1);
  assert.doesNotMatch(META.description + META.tags, /\b(price|buy|sell|shop|money)\b/i);
  assert.deepEqual(SHELF_INFO['crate-stacker'], { subject: 'math', from: 1, to: 2 }, 'on the Learn shelf as math for grades 1 and 2');
  for (const f of ['public/covers/crate-stacker.jpg', 'public/og/crate-stacker.jpg', 'scripts/covers/crate-stacker.recipe.js']) assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  const nq = catalog.COURSES.find(c => c.slug === 'number-quest');
  assert.deepEqual(nq.games.find(g => g.slug === 'crate-stacker'), { slug: 'crate-stacker', topic: 'numbers', shared: true });
  assert.equal(catalog.courseOfSlug('crate-stacker'), null, 'shared: it keeps its own page in the library');
  assert.deepEqual(TAGS.CRATE_CHAPTERS, { build: ['1.NBT.B.2', '1.NBT.A.1'], greater: ['1.NBT.B.3'], add: ['1.NBT.C.4', '1.NBT.C.5'] });
  assert.deepEqual(TAGS.gameCodes('crate-stacker', 'ccss-math'), Object.values(TAGS.CRATE_CHAPTERS).flat());
  assert.ok(TAGS.LEVELLED.includes('crate-stacker'));
  assert.equal(UNIT.title, 'The Tens Trellis'); assert.equal(UNIT.stamp, 'Tens Seed'); assert.equal(UNIT.tool, 'crate-stacker');
  assert.deepEqual(STEPS.map(s => s.n), ['3.1', '3.2', '3.3']);
  STEPS.forEach((s, i) => {
    const g = s.game.launchpad, st = s.standards.launchpad, id = CHAPTERS[i];
    assert.equal(g.slug, 'crate-stacker'); assert.equal(g.params, `chapter=${id}&lock=1`); assert.equal(g.chapterTitle, T[`ch.${id}`], `${s.n}: the chapter is named as the game names it`);
    // the step's lesson parameters reach the game as they were written
    assert.equal(PP.cleanOptions(g.params), g.params);
    assert.deepEqual(PP.parseParams(g.params), { chapter: id, lock: 1 });
    assert.deepEqual(PP.unpackParams(PP.packParams(PP.parseParams(g.params))), { chapter: id, lock: 1 });
    assert.deepEqual(CS.params(PP.parseParams(g.params)), { chapter: id, lock: true });
    // and the step is credited with exactly the chapter's codes, whatever grade the lesson names: its primary codes,
    // then the ones it also touches
    for (const grade of ['K', '1', '']) assert.deepEqual(TAGS.stepGameCodes('crate-stacker', 'ccss-math', grade, g.params), [...st.primary, ...st.also], `${s.n}: chapter codes`);
  });
  assert.deepEqual(TAGS.stepGameCodes('crate-stacker', 'ccss-math', '', ''), [], 'an unlocked step with no grade claims nothing as practice');
  assert.deepEqual(TAGS.stepGameCodes('crate-stacker', 'ccss-math', '1', ''), Object.values(TAGS.CRATE_CHAPTERS).flat(), 'an unlocked grade 1 step claims the game’s grade 1 codes: all of them');
  assert.deepEqual(TAGS.stepGameCodes('crate-stacker', 'ccss-math', 'K', ''), [], 'and nothing for kindergarten');
});

// ---------------------------------------------------------------------------------------------- the game, played
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
const shotsDir = process.env.CS_SHOTS;

/** The game in the production frame, on a stand-in for the play page: it keeps the SDK's messages (window.__msgs) and
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read. */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch });
  const doc = frameDocument(HTML, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Crate Stacker' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
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
  const state = () => frame.evaluate(() => window.__cs.state());
  const msgs = type => p.evaluate(t => window.__msgs.filter(m => m.type === t), type);
  const spoken = async () => (await msgs('brb:tts')).map(m => m.text);
  const until = (fn, arg) => frame.waitForFunction(fn, arg, { timeout: 30_000 });
  const shot = async name => { if (shotsDir) { await p.waitForTimeout(900); await p.screenshot({ path: path.join(shotsDir, `${name}.png`) }); } };
  return { ctx, p, frame, state, msgs, spoken, until, shot, errors, outside };
}
const text = (frame, sel) => frame.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden ? e.textContent : null; }, sel);
const ids = (frame, sel) => frame.evaluate(s => [...document.querySelectorAll(s)].map(b => b.id), sel);
/** What the number chip shows for a round: while it is asked (with the truck holding `count` crates), then found. */
const shown = (s, found, count = 0) => {
  const parts = (t, o) => say(partsKey('show.parts', t, o), { t, o });
  if (s.kind === 'build') return found ? parts(s.tens, s.ones) : parts(tensOf(count), onesOf(count));
  if (s.kind === 'read') return found ? parts(s.tens, s.ones) : '? crates';
  if (s.kind === 'more') return found ? `${Math.max(s.a, s.b)} > ${Math.min(s.a, s.b)}` : `${s.a} ? ${s.b}`;
  if (s.kind === 'sign') return `${s.a} ${found ? { gt: '>', eq: '=', lt: '<' }[s.answer] : '?'} ${s.b}`;
  return `${s.a} ${s.kind === 'less10' ? '−' : '+'} ${s.b} = ${found ? s.answer : '?'}`;
};
/** The words that ask a round. */
const asks = s => (s.kind === 'build' ? (s.ask === 'parts' ? say('build.ask.parts.' + (s.ones === 1 ? 'n1' : 'nn'), { t: s.tens, o: s.ones }) : say('build.ask', { n: s.answer }))
  : s.kind === 'read' ? T['read.ask'] : s.kind === 'more' || s.kind === 'sign' ? T[`${s.kind}.ask`] : s.kind === 'more10' || s.kind === 'less10' ? say(`${s.kind}.ask`, { a: s.a }) : say('add.ask', { a: s.a, b: s.b }));
/** The hint a wrong answer gets. */
const hintOf = s => (s.kind === 'read' ? T['read.hint'] : s.kind === 'more' || s.kind === 'sign' ? T[`gr.hint.${s.look}`] : s.kind === 'ones' ? say('ones.hint' + (s.cross ? '.ten' : ''), { a: s.a }) : T[`${s.kind}.hint`]);
const btn = (s, v) => '#cs-' + (s.kind === 'sign' ? v : 'n' + v);

for (const chapter of CHAPTERS) {
  test(`lesson mode, ${chapter}: loads clean, a wrong answer does not advance, six right rounds post game over once`, { skip, timeout: 420_000 }, async () => {
    const g = await open({ params: `chapter=${chapter}&lock=1` });
    const { frame, state, until } = g;
    assert.equal((await state()).screen, 'hero');
    assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .cs-btn')].map(b => b.textContent)), ['Knight', 'Explorer', 'Wizard', 'Ranger', 'Hooded Ranger'], 'the theme’s five adventurers, by the theme’s names (the five Garden Count and Lily Hop offer)');
    await g.shot(`${chapter}-0-helper`);
    await frame.click('#hero-mage');
    await until(() => window.__cs.state().screen === 'play');
    let s = await state();
    assert.deepEqual([s.chapter, s.lock, s.round, s.rounds, s.hero], [chapter, true, 1, 6, 'mage'], 'straight into the locked chapter, no menu');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#ch-build, #menu').length), 0);
    await frame.evaluate(() => window.__cs.fast());   // short pauses between rounds; the taps are the real ones
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const { chapter: ch, n, ...want } = CS.round(chapter, round, 0);
      assert.deepEqual([ch, n], [chapter, round]);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round its number seeds`);
      const asked = await text(frame, '#askt');
      assert.equal(asked, asks(s), `round ${round}: the instruction`);
      assert.ok(asked.length <= 40, `round ${round}: a short instruction on screen (${asked})`);
      assert.ok((await g.spoken()).includes(asked), `round ${round}: "${asked}" was sent to be spoken`);
      assert.equal(await text(frame, '#sum'), shown(s, false), `round ${round}: the number chip`);
      if (round === 1 || round === 4) await g.shot(`${chapter}-${round}`);
      if (s.kind === 'build') {
        // an empty truck, four loading buttons, and the sign on the cab (hidden when the number is asked in parts)
        assert.deepEqual(await ids(frame, '#bar .cs-btn'), ['cs-ten', 'cs-one', 'cs-off', 'cs-go']);
        assert.deepEqual([s.count, s.load, s.sign], [0, { tens: 0, ones: 0 }, s.ask === 'parts' ? '?' : '0']);
        // Go on the wrong load: a hint that names what is needed, the same round, nothing reported
        await frame.click('#cs-one'); await frame.click('#cs-go');
        assert.equal((await state()).phase, 'play', `round ${round}: a wrong load does not advance`);
        assert.equal(await text(frame, '#hint'), say('build.hint.tens.' + (s.tens === 1 ? '1' : 'n'), { t: s.tens }), `round ${round}: the tens are missing, so the hint asks for them`);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.cs-btn.no').length), 1, `round ${round}: and a wobble on Go`);
        assert.equal((await g.msgs('brb:gameover')).length, 0);
        await frame.click('#cs-off');
        for (let i = 0; i < s.tens; i++) await frame.click('#cs-ten');
        await frame.click('#cs-go');
        assert.equal(await text(frame, '#hint'), say('build.hint.ones.' + (s.ones === 1 ? '1' : 'n'), { o: s.ones }), `round ${round}: the tens are right, so the hint asks for the ones`);
        for (let i = 0; i < s.ones; i++) await frame.click('#cs-one');
        const built = await state();
        assert.deepEqual([built.count, built.load, built.sign], [s.answer, { tens: s.tens, ones: s.ones }, s.ask === 'parts' ? '?' : String(s.answer)], `round ${round}: ${s.tens} towers and ${s.ones} crates on the truck, the sign following`);
        assert.equal(await text(frame, '#sum'), shown(s, false, s.answer), `round ${round}: the chip follows the load`);
        await frame.click('#cs-go');
      } else {
        assert.deepEqual(await ids(frame, '#bar .cs-btn'), s.choices.map(v => btn(s, v).slice(1)), `round ${round}: one big button for each choice`);
        if (s.kind === 'read') assert.deepEqual([s.load, s.sign], [{ tens: s.tens, ones: s.ones }, '?'], `round ${round}: the load is on the truck, its number hidden`);
        if (s.kind === 'more' || s.kind === 'sign') {
          assert.deepEqual([s.load, s.loadB], s.view === 'loads' ? [{ tens: tensOf(s.a), ones: onesOf(s.a) }, { tens: tensOf(s.b), ones: onesOf(s.b) }] : [{ tens: 0, ones: 0 }, { tens: 0, ones: 0 }], `round ${round}: two loads, or two closed loads with numerals only`);
          assert.equal(s.sign, String(s.a));
        }
        if (chapter === 'add') assert.deepEqual([s.load, s.sign], [{ tens: tensOf(s.a), ones: onesOf(s.a) }, String(s.a)], `round ${round}: the truck starts with ${s.a}`);
        // a wrong answer: a hint and a wobble, the same round, nothing reported
        await frame.click(btn(s, s.choices.find(v => v !== s.answer)));
        const after = await state();
        assert.deepEqual([after.round, after.phase, after.screen], [round, 'play', 'play'], `round ${round}: a wrong answer does not advance`);
        assert.equal(await text(frame, '#hint'), hintOf(s), `round ${round}: a wrong answer gets the round’s hint`);
        assert.equal(await frame.evaluate(() => document.querySelectorAll('.cs-btn.no').length), 1, `round ${round}: and a wobble on the button`);
        assert.equal((await g.msgs('brb:gameover')).length, 0, `round ${round}: no completion before the sixth round is right`);
        await frame.click(btn(s, s.answer));
      }
      await until(r => { const t = window.__cs.state(); return t.round > r || t.screen === 'end'; }, round);
      const said = await g.spoken(), has = (line, why) => assert.ok(said.includes(line), `round ${round}: "${line}" is said (${why})`);
      // what is true is said
      if (s.kind === 'build' || (s.kind === 'read' && s.tens < 10)) has(say(partsKey('parts', s.tens, s.ones), { t: s.tens, o: s.ones, n: s.answer }), 'the number as tens and ones');
      if (s.kind === 'read' && s.tens === 10) has(`10 tens make 100. ${s.ones} more makes ${s.answer}.`, 'past one hundred');
      if (s.kind === 'more') has(`${Math.max(s.a, s.b)} is greater than ${Math.min(s.a, s.b)}.`, 'the greater number first');
      if (s.kind === 'sign') has(`${s.a} is ${{ gt: 'greater than', eq: 'equal to', lt: 'less than' }[s.answer]} ${s.b}.`, 'the sign read aloud');
      if (s.look === 'tens') has(`${Math.max(tensOf(s.a), tensOf(s.b))} tens is more than ${Math.min(tensOf(s.a), tensOf(s.b))} tens.`, 'tens first');
      if (s.look === 'ones') has(`${Math.max(onesOf(s.a), onesOf(s.b))} ones is more than ${Math.min(onesOf(s.a), onesOf(s.b))} ones.`, 'then ones');
      if (s.look === 'same') has('Same tens. Same ones.', 'equal');
      if (s.kind === 'tens' || s.kind === 'ones') has(`${s.a} and ${s.b} make ${s.answer}.`, 'the sum');
      if (s.kind === 'ones' && s.cross) { const fill = 10 - onesOf(s.a); has(`${s.a} and ${fill} make ${s.a + fill}.`, 'filling the tower'); has(`${s.b - fill} more makes ${s.answer}.`, 'the crates after the ten'); }
      if (s.kind === 'more10') has(`10 more than ${s.a} is ${s.answer}.`, 'ten more');
      if (s.kind === 'less10') has(`10 less than ${s.a} is ${s.answer}.`, 'ten less');
    }
    s = await state();
    assert.deepEqual([s.screen, s.reported], ['end', 1]);
    const over = await g.msgs('brb:gameover');
    assert.equal(over.length, 1, 'the course step’s completion signal, once');
    assert.equal(over[0].won, true);
    assert.deepEqual(await ids(frame, '#card .cs-btn'), ['again'], 'locked: play again, and no way to another chapter');
    await g.shot(`${chapter}-end`);
    // Every line it tried to say is one of its own registered lines.
    for (const line of new Set(await g.spoken())) assert.ok(lines.allowedLine('crate-stacker', 'en', line), `"${line}" is a registered line`);
    // Play again starts the chapter over (new numbers), and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__cs.state().screen === 'play');
    assert.equal((await state()).round, 1);
    assert.equal((await g.msgs('brb:gameover')).length, 1);
    assert.deepEqual(g.errors, []);
    assert.deepEqual(g.outside, [], 'the game asked for nothing outside /vendor');
    await g.ctx.close();
  });
}

test('no parameters: a picture menu of the three chapters; loading by hand bundles ten ones into a tower; a tap on a truck is the answer', { skip, timeout: 420_000 }, async () => {
  const g = await open();
  const { frame, state, until } = g;
  await frame.click('#hero-knight');
  await until(() => window.__cs.state().screen === 'menu');
  assert.deepEqual(await frame.evaluate(() => [...document.querySelectorAll('#card .cs-menu .cs-btn')].map(b => [b.id, b.querySelector('.l').textContent])),
    [['ch-build', 'Load the Truck'], ['ch-greater', 'Which Has More?'], ['ch-add', 'Add More Crates']]);
  await g.shot('menu');
  // Load the Truck, at the game's own speed: a crate really drops onto the truck, and the helper rides on the cab
  await frame.click('#ch-build');
  await until(() => window.__cs.state().screen === 'play');
  let s = await state();
  assert.deepEqual([s.chapter, s.lock, s.kind, s.count], ['build', false, 'build', 0]);
  await until(() => window.__cs.state().moving === 0);   // the truck has driven in
  assert.ok((await frame.evaluate(() => window.__cs.heroAt()))[1] > 1.2, 'the helper stands on the cab roof');
  await frame.click('#cs-one');
  assert.ok((await state()).moving >= 1, 'the crate is on its way down');
  await until(() => window.__cs.state().moving === 0);
  assert.deepEqual((await state()).load, { tens: 0, ones: 1 });
  // nine more loose crates: the tenth snaps the ten into one tower, said aloud, and the chip and the sign follow
  await frame.evaluate(() => window.__cs.fast());
  for (let i = 2; i <= 9; i++) await frame.click('#cs-one');
  assert.deepEqual([(await state()).load, await text(frame, '#sum'), (await state()).sign], [{ tens: 0, ones: 9 }, '0 tens and 9 ones', '9']);
  await frame.click('#cs-one');
  assert.deepEqual([(await state()).load, (await state()).count, await text(frame, '#sum'), (await state()).sign], [{ tens: 1, ones: 0 }, 10, '1 ten and 0 ones', '10'], 'ten loose crates are one tower');
  assert.equal(await text(frame, '#hint'), '10 ones make 1 ten.'); assert.ok((await g.spoken()).includes('10 ones make 1 ten.'));
  // Take one off undoes the last crate (the tower comes apart again); on an empty truck it only says so
  await frame.click('#cs-off');
  assert.deepEqual([(await state()).load, (await state()).count], [{ tens: 0, ones: 9 }, 9]);
  for (let i = 0; i < 9; i++) await frame.click('#cs-off');
  assert.deepEqual([(await state()).load, (await state()).count], [{ tens: 0, ones: 0 }, 0]);
  await frame.click('#cs-off');
  assert.equal(await text(frame, '#hint'), 'The truck is empty.'); assert.equal((await state()).count, 0);
  // the truck holds 99 at most: nine towers and nine crates, then a kind word, never a hundredth crate
  for (let i = 0; i < 9; i++) { await frame.click('#cs-ten'); await frame.click('#cs-one'); }
  assert.deepEqual([(await state()).load, (await state()).count, await text(frame, '#sum')], [{ tens: 9, ones: 9 }, 99, '9 tens and 9 ones']);
  await frame.click('#cs-one'); await frame.click('#cs-ten');
  assert.equal(await text(frame, '#hint'), 'The truck is full.'); assert.equal((await state()).count, 99);
  assert.equal((await state()).round, 1, 'none of this ends the round');
  assert.deepEqual(g.errors, []); assert.deepEqual(g.outside, []);
  await g.ctx.close();

  // Which Has More?: the yard itself. A tap on the truck with fewer crates hints; a tap on the other is the answer.
  const y = await open();
  await y.frame.click('#hero-rogue');
  await y.until(() => window.__cs.state().screen === 'menu');
  await y.frame.click('#ch-greater');
  await y.until(() => window.__cs.state().screen === 'play');
  s = await y.state();
  assert.deepEqual([s.kind, s.view, s.tall], ['more', 'loads', false]);
  const tap = async which => { const at = await y.frame.evaluate(w => window.__cs.spot(w).mid, which); await y.p.mouse.click(at[0], at[1]); };
  const [less, more] = s.a < s.b ? ['a', 'b'] : ['b', 'a'];
  await tap(less);
  assert.deepEqual([(await y.state()).phase, (await y.state()).round], ['play', 1]);
  assert.equal(await text(y.frame, '#hint'), T[`gr.hint.${s.look}`]);
  await tap(more);
  assert.equal((await y.state()).phase, 'right');
  assert.equal(await text(y.frame, '#sum'), shown(s, true), 'the chip shows the two numbers with the sign between them');
  assert.ok(await y.frame.evaluate(v => document.getElementById('cs-n' + v).classList.contains('go'), s.answer), 'and the button of that truck turns green');
  await y.frame.evaluate(() => window.__cs.fast());
  await y.until(() => window.__cs.state().round === 2);
  assert.equal((await y.msgs('brb:gameover')).length, 0);
  assert.deepEqual(y.errors, []); assert.deepEqual(y.outside, []);
  await y.ctx.close();
});

test('keyboard, a 360 px phone and reduced motion: everything is a big button a key can press, and every load is in view', { skip, timeout: 420_000 }, async () => {
  // Keyboard only: Tab to the helper, Enter; then Tab, Enter and Space on the answer buttons.
  const k = await open({ params: 'chapter=greater&lock=1' });
  for (let i = 0; i < 12 && !(await k.frame.evaluate(() => document.activeElement && document.activeElement.id === 'hero-knight')); i++) await k.p.keyboard.press('Tab');
  await k.p.keyboard.press('Enter');
  await k.until(() => window.__cs.state().screen === 'play');
  const s = await k.state();
  assert.equal(s.kind, 'more');
  await k.frame.evaluate(() => window.__cs.fast());
  const wrong = s.choices.find(v => v !== s.answer);
  await k.frame.focus('#cs-n' + wrong); await k.p.keyboard.press('Enter');
  assert.equal(await text(k.frame, '#hint'), T[`gr.hint.${s.look}`], 'Enter on the wrong number: the hint');
  assert.equal((await k.state()).round, 1);
  await k.frame.focus('#cs-n' + s.choices[0]);
  for (let i = 0; i < s.choices.indexOf(s.answer); i++) await k.p.keyboard.press('Tab');
  assert.equal(await k.frame.evaluate(() => document.activeElement.id), 'cs-n' + s.answer, 'Tab walks the answer buttons in order');
  await k.p.keyboard.press(' ');
  assert.equal(await text(k.frame, '#sum'), shown(s, true), 'Space on the right number: the chip is filled in');
  await k.until(() => window.__cs.state().round === 2);
  assert.ok(await k.frame.evaluate(() => /^cs-n\d+$/.test(document.activeElement.id)), 'the next round keeps the keyboard on the buttons');
  assert.deepEqual(k.errors, []);
  await k.ctx.close();

  // The top row at desktop width: the words, the chip and the round dots sit on one line and never touch each other
  // or the gear button, in every round of every chapter (the longest instruction and the widest chip among them).
  // Then a 360 px phone with reduced motion: everything fits, the buttons are big, a wrong tap still shows.
  for (const [width, height, reducedMotion, touch] of [[960, 600, 'no-preference', false], [360, 640, 'reduce', true]]) {
    for (const chapter of CHAPTERS) {
      const m = await open({ params: `chapter=${chapter}&lock=1`, width, height, reducedMotion, touch });
      await (touch ? m.frame.tap('#hero-rogue') : m.frame.click('#hero-rogue'));
      await m.until(() => window.__cs.state().screen === 'play');
      await m.frame.evaluate(() => window.__cs.fast());
      for (let round = 1; round <= 6; round++) {
        await m.until(r => window.__cs.state().round === r && window.__cs.state().phase === 'play', round);
        const st = await m.state(), at = `${chapter} round ${round} at ${width} px`;
        assert.equal(st.tall, width < height, at);
        const press = async id => (touch ? m.frame.tap('#' + id) : m.frame.click('#' + id));
        if (st.kind === 'build') { for (let i = 0; i < 9; i++) { await press('cs-ten'); await press('cs-one'); } }   // the fullest truck: nine towers and nine crates
        const fit = await m.frame.evaluate(() => {
          const r = e => e.getBoundingClientRect(), vis = e => e && !e.hidden && r(e).width > 0, $ = id => document.getElementById(id);
          const top = ['ask', 'sum', 'dots'].map($).filter(vis).map(r), gear = r(document.querySelector('.o3-gear')), bs = [...document.querySelectorAll('#bar .cs-btn')].map(r);
          const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          const st = window.__cs.state(), spots = ['a', 'b'].map(w => window.__cs.spot(w)).filter(Boolean), line = r($('line')).bottom, bar = r($('bar')).top;
          return { inside: [...top, ...bs].every(b => b.left >= 0 && b.right <= innerWidth + 0.5 && b.top >= 0 && b.bottom <= innerHeight + 0.5),
            top: top.some((a, i) => top.some((b, j) => j > i && hit(a, b))) || top.some(a => hit(a, gear)),
            oneLine: innerWidth > innerHeight ? top.every(a => a.top < top[0].bottom && a.bottom > top[0].top) : null,
            small: bs.filter(b => b.height < 60 || b.width < 60).length, n: bs.length, overlap: bs.some((a, i) => bs.some((b, j) => j > i && hit(a, b))), scroll: document.documentElement.scrollWidth > innerWidth,
            // every truck, end to end and up to the top of its load, is drawn between the words and the buttons
            view: spots.every(p => p.left[0] > 2 && p.right[0] < innerWidth - 2 && p.top[1] > line && p.left[1] < bar && p.right[1] < bar), trucks: spots.length, count: st.count };
        });
        const n = st.kind === 'build' ? 4 : st.kind === 'more' ? 2 : 3;
        assert.deepEqual(fit, { inside: true, top: false, oneLine: width > height ? true : null, small: 0, n, overlap: false, scroll: false, view: true, trucks: st.kind === 'more' || st.kind === 'sign' ? 2 : 1, count: st.kind === 'build' ? 99 : 0 },
          `${at}: on screen, the top row tidy, the buttons big and apart, every load in view`);
        if (round === 1 && touch) {
          const miss = st.kind === 'build' ? 'cs-go' : btn(st, st.choices.find(v => v !== st.answer)).slice(1);
          await press(miss);
          assert.equal(await m.frame.evaluate(id => getComputedStyle(document.getElementById(id)).outlineStyle, miss), 'dashed', `${at}: with reduced motion a wrong tap shows as a dashed outline`);
          assert.equal((await m.state()).round, 1);
          await m.shot(`${chapter}-360`);
        }
        // finish the round the quick way (the handle), so the next one can be measured
        if (st.kind === 'build') await m.frame.evaluate(({ t, o }) => { const h = window.__cs; for (let i = 0; i < 18; i++) h.act('off'); for (let i = 0; i < t; i++) h.act('ten'); for (let i = 0; i < o; i++) h.act('one'); h.act('go'); }, { t: st.tens, o: st.ones });
        else await m.frame.evaluate(v => window.__cs.act('answer', v), st.answer);
      }
      await m.until(() => window.__cs.state().screen === 'end');
      assert.deepEqual(m.errors, []); assert.deepEqual(m.outside, []);
      await m.ctx.close();
    }
  }
});
