// Crate Stacker (seed-games/crate-stacker.html): Number Quest Launchpad Unit 3's game, a Kit 2 (Oomba3D) toy loading
// yard for grade 1, where a crate is a one and a tower of ten crates is a ten. Checked here:
//   - the file: the scanner passes it with no fail issue, it loads nothing from another site, and its import map is
//     exactly kit2ImportMap() (so a library bump that leaves the game behind fails here);
//   - its rounds (the pure block between crate-stacker:begin and crate-stacker:end): six a chapter, the numbers in the
//     ranges the unit teaches, every answer re-derived from the round's own numbers, the wrong choices the mistakes a
//     child really makes (the digits swapped, the tens added as ones, the new ten forgotten); every play new questions
//     (a fresh lap), never one twice in a play, none of the last plays' where there is room; mode=same the fixed set;
//   - its voice coach (the pure block between crate-coach:begin and crate-coach:end): one line at a time, each waiting
//     for the one before to end, never one cut off; a stuck or failed line lets the game go on;
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
  return { CHAPTERS: plain(G.CHAPTERS), SIGNS: plain(G.SIGNS), ROUNDS: G.ROUNDS, MAX: G.MAX, round: (...a) => plain(G.round(...a)), params: p => plain(G.params(p)),
    qid: r => G.qid(r), plan: (...a) => plain(G.plan(...a)), freshLap: (...a) => G.freshLap(...a) };
})();
const COACH = (() => { const box = {}; vm.runInNewContext(/\/\* crate-coach:begin \*\/([\s\S]*?)\/\* crate-coach:end \*\//.exec(HTML)[1], box); return box.CrateCoach; })();
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

test('rounds: six a chapter, in the unit’s number ranges, every answer right, the same round for the same lap', () => {
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
  assert.deepEqual(CS.params({ chapter: 'add', lock: 1 }), { chapter: 'add', lock: true, same: false });
  assert.deepEqual(CS.params({ chapter: 'nope', lock: 1 }), { chapter: '', lock: false, same: false }, 'an unknown chapter opens the menu, unlocked');
  assert.deepEqual(CS.params(undefined), { chapter: '', lock: false, same: false });
  assert.deepEqual(CS.params({ chapter: 'add', lock: 1, mode: 'same' }), { chapter: 'add', lock: true, same: true }, 'mode=same: the fixed questions, the same for everyone');
  assert.deepEqual(CS.params(PP.parseParams('chapter=build&lock=1&mode=same')), { chapter: 'build', lock: true, same: true }, 'and it survives the play-params grammar');
});

test('new questions every play: a fresh lap each time, never a question twice in a play, not the last plays’ where there is room', () => {
  for (const ch of CHAPTERS) {
    // the fixed set (mode=same) is lap 0 exactly as it always was: the first draw of every round
    assert.deepEqual(CS.plan(ch, 0, []).map(({ id, ...r }) => r), [1, 2, 3, 4, 5, 6].map(n => CS.round(ch, n, 0)), `${ch}: mode=same keeps the fixed questions`);
    assert.deepEqual(CS.plan(ch, 0, []), CS.plan(ch, 0, []), `${ch}: a lap always plans the same play`);
    // two plays, as the game starts them (a fresh random lap each), ask different questions
    const lapA = CS.freshLap(Math.random, []), lapB = CS.freshLap(Math.random, [lapA]);
    assert.notEqual(lapA, lapB); assert.ok(lapA >= 1 && lapA < 2 ** 31 && Number.isInteger(lapA));
    const A = CS.plan(ch, lapA, []), B2 = CS.plan(ch, lapB, A.map(r => r.id));
    assert.notDeepEqual(A.map(r => r.id), B2.map(r => r.id), `${ch}: two plays give two different sequences`);
    // many plays: six different questions in each, every round of the kind and range its number asks for, and the
    // next play keeps clear of the last two plays' questions wherever the round has room
    let clash = 0, rounds = 0;
    const seq = new Set();
    let avoid = [];
    for (let play = 0; play < 300; play++) {
      const lap = CS.freshLap(Math.random, []), P = CS.plan(ch, lap, avoid);
      assert.equal(P.length, 6); assert.equal(new Set(P.map(r => r.id)).size, 6, `${ch} lap ${lap}: no question twice in a play (${P.map(r => r.id)})`);
      P.forEach((r, i) => {
        assert.equal(r.n, i + 1); assert.equal(r.id, CS.qid(r));
        const base = CS.round(ch, i + 1, lap); assert.equal(r.kind, base.kind, `${ch} ${i + 1}: same kind of round`);
        for (const k of ['ask', 'view', 'type', 'cross']) if (k in base) assert.equal(r[k], base[k], `${ch} ${i + 1}: same ${k}`);
        if (ch === 'build' && i < 3) assert.equal(r.tens >= 5, base.tens >= 5, `${ch} ${i + 1}: the same tens range`);
        if (avoid.includes(r.id)) clash++; rounds++;
      });
      seq.add(P.map(r => r.id).join(' '));
      avoid = [...avoid, ...P.map(r => r.id)].slice(-12);
    }
    assert.ok(seq.size >= 295, `${ch}: plays hardly ever repeat a whole set (${seq.size} different sets in 300)`);
    assert.ok(clash / rounds < 0.02, `${ch}: a question from the last two plays comes back only where the round has no other (${clash} of ${rounds})`);
  }
  // the rounds a fresh lap makes are as right as lap 0's (the long rounds test above covers laps 0-199; here random laps)
  for (let i = 0; i < 200; i++) {
    const lap = CS.freshLap(Math.random, []);
    for (const r of CS.plan('add', lap, [])) { assert.equal(r.answer, r.kind === 'less10' ? r.a - r.b : r.a + r.b); assert.ok(r.answer >= 11 && r.answer <= 99 && r.choices.includes(r.answer)); }
    for (const r of CS.plan('build', lap, [])) { assert.equal(r.answer, r.tens * 10 + r.ones); if (r.kind === 'build') assert.ok(r.answer <= 99); }
    for (const r of CS.plan('greater', lap, [])) assert.equal(r.answer, r.kind === 'more' ? Math.max(r.a, r.b) : r.a > r.b ? 'gt' : r.a < r.b ? 'lt' : 'eq');
  }
});

/** A clock for the coach: timers run when the test moves time on. */
function fakeClock() {
  let t = 0, seq = 0; const timers = new Map();
  return {
    now: () => t,
    setTimeout: (f, ms) => { const id = ++seq; timers.set(id, { at: t + ms, f }); return id; },
    clearTimeout: id => timers.delete(id),
    tick(ms) { const end = t + ms; for (;;) { let next = null; for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x]; if (!next) break; timers.delete(next[0]); t = next[1].at; next[1].f(); } t = end; },
  };
}
test('the voice coach: each line waits for the one before to end, nothing is cut off, and a failed or stuck line never holds the game', () => {
  // a voice that plays each line for 40 ms a character (a stand-in for the AI voice), and records what it was asked
  const clock = fakeClock(), played = [], ends = [];
  const voice = (text, onend) => { played.push([text, clock.now()]); clock.setTimeout(() => { ends.push([text, clock.now()]); onend(); }, 40 * text.length); return true; };
  const prefetched = [];
  const c = COACH.coach({ ...clock, speak: voice, prefetch: t => prefetched.push(t) });
  let next = null;
  c.say('52 is greater than 38.', true); c.say('5 tens is more than 3 tens.', true);
  assert.deepEqual(played.map(p => p[0]), ['52 is greater than 38.'], 'one line at a time');
  assert.deepEqual(prefetched, ['5 tens is more than 3 tens.'], 'the line that waits is fetched ahead, so it starts on time');
  c.idle(() => { next = clock.now(); }, 12000);   // the next round waits for the coach
  clock.tick(500);
  assert.equal(next, null, 'the next round has not started while the line is being said');
  clock.tick(5000);
  assert.deepEqual(played.map(p => p[0]), ['52 is greater than 38.', '5 tens is more than 3 tens.']);
  assert.equal(played[1][1], ends[0][1], 'the second line starts when the first has ended, not before');
  assert.equal(next, ends[1][1], 'and the next round starts when the last line has ended');
  assert.deepEqual([...c.log.map(l => l.why)], ['ended', 'ended']);

  // a new instruction (not queued) drops the lines still waiting, never the one being said
  c.say('Look at the tens first.', false); c.say('Count the tens.', true); c.say('Which truck has more?', false);
  clock.tick(10000);
  assert.deepEqual(played.slice(2).map(p => p[0]), ['Look at the tens first.', 'Which truck has more?']);
  assert.ok(c.log.every(l => l.why === 'ended'), 'every line said to its end');

  // the player moves on: waiting lines dropped, the one being said ends by itself
  c.say('27 and 3 make 30.', true); c.say('2 more makes 32.', true); c.skip();
  clock.tick(10000);
  assert.deepEqual(played.slice(-1).map(p => p[0]), ['27 and 3 make 30.']);

  // a failed line (the voice cannot start it: no voice, muted) ends at once: the game goes straight on
  const f = fakeClock(), fc = COACH.coach({ ...f, speak: () => false });
  let went = null; fc.say('Load 34 crates.', false); fc.idle(() => { went = f.now(); }, 12000);
  assert.equal(went, 0, 'a line that cannot be said does not hold the round'); assert.equal(fc.log[0].why, 'silent');
  // a stuck line (started, but its end never comes: audio that stalls) is let go after its cap, never the 12 s wait
  const k = fakeClock(), kc = COACH.coach({ ...k, speak: () => true });
  let went2 = null; kc.say('52 is greater than 38.', true); kc.idle(() => { went2 = k.now(); }, 12000);
  k.tick(20000);
  assert.equal(kc.log[0].why, 'timeout'); assert.ok(went2 > 0 && went2 <= 3500 + 80 * 22, `a stuck line lets the game go on after ${went2} ms`);
  // a voice that throws is a failed line too
  const e = fakeClock(), ec = COACH.coach({ ...e, speak: () => { throw new Error('no audio'); } });
  let went3 = null; ec.say('Pick a game.', false); ec.idle(() => { went3 = e.now(); }); assert.equal(went3, 0);
  // and the round's own cap: with a coach that never settles, the round still goes on after the max wait
  const m = fakeClock(), mc = COACH.coach({ ...m, speak: () => true, cap: () => 1e9 });
  let went4 = null; mc.say('Which sign goes in the middle?', true); mc.idle(() => { went4 = m.now(); }, 12000); m.tick(13000);
  assert.equal(went4, 12000);
  // in the game: every line goes through the coach (one BRB.speak call site, queued), and a right answer waits for it
  assert.equal((HTML.match(/B\.speak\(/g) || []).length, 1, 'one call to the platform voice: the coach’s');
  assert.match(HTML, /B\.speak\(text, \{ lang: 'en', voice: 'friendly', queue: true, onend \}\)/);
  assert.match(HTML, /afterLine\(ms, advance\)/, 'the next round waits for the coach');
  assert.doesNotMatch(HTML, /stopSpeaking|later\(ms, nextRound\)/, 'nothing stops a line, and no round starts on a timer alone');
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
    assert.deepEqual(CS.params(PP.parseParams(g.params)), { chapter: id, lock: true, same: false }, `${s.n}: a lesson step gets new questions every play`);
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
 *  answers a speech request with "no AI voice here" at once, as the play page does when a line cannot be read; with
 *  voice: <ms a character>, it answers with a real sound that long instead (a stand-in AI voice, 300 ms to arrive). */
async function open({ params = '', width = 960, height = 600, reducedMotion = 'no-preference', touch = false, html = HTML, voice = 0, colorScheme = 'light' } = {}) {
  const { chromium } = await import('playwright-core');
  browser ||= await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch, colorScheme });
  const doc = frameDocument(html, { user: { displayName: 'T', avatar: 'x', lang: 'en' }, game: { id: 'g', title: 'Crate Stacker' }, save: {}, canSave: false, params: PP.parseParams(params), tts: { langs: ['en'] } });
  const page = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>
<script>window.__msgs = []; const VOICE = ${Number(voice) || 0};
function wav(ms) { const rate = 8000, n = Math.round(rate * ms / 1000), b = new ArrayBuffer(44 + n), v = new DataView(b), s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128 + Math.round(16 * Math.sin(i / 5))); return b; }
addEventListener('message', e => { const d = e.data; if (!d || d.brb !== 1) return; window.__msgs.push(d);
  if (d.type !== 'brb:tts' || d.pre || d.check) return;
  if (!VOICE) return e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: false, why: 'off' }, '*');
  setTimeout(() => { const buf = wav(VOICE * d.text.length); e.source.postMessage({ brb: 1, type: 'brb:tts', id: d.id, ok: true, buf }, '*', [buf]); }, 300); });</script>`;
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
    const first = await state(), PLAN = CS.plan(chapter, first.lap, first.avoid);
    assert.deepEqual([first.same, first.avoid], [false, []], 'a play of its own (no mode=same), nothing played before on this page');
    assert.ok(first.lap >= 1, 'a fresh lap, not the fixed set');
    assert.deepEqual(first.plan, PLAN.map(r => r.id), 'the play is the plan its lap makes');
    for (let round = 1; round <= 6; round++) {
      s = await state();
      assert.equal(s.round, round); assert.equal(s.phase, 'play');
      const { chapter: ch, n, ...want } = PLAN[round - 1];
      assert.deepEqual([ch, n], [chapter, round]);
      assert.deepEqual(Object.fromEntries(Object.keys(want).map(k => [k, s[k]])), want, `round ${round} is the round the play's plan has`);
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
    // Play again starts the chapter over (new questions: a new lap, none of this play's where the round has room),
    // and finishing it would report again; nothing more is posted now.
    await frame.click('#again');
    await until(() => window.__cs.state().screen === 'play');
    const again = await state();
    assert.equal(again.round, 1);
    assert.notEqual(again.lap, first.lap); assert.deepEqual(again.avoid, first.plan, 'the last play’s questions are kept clear of');
    assert.notDeepEqual(again.plan, first.plan, 'a different sequence of questions');
    assert.ok(again.plan.filter(id => first.plan.includes(id)).length <= 1, `at most a question in common (a small range): ${again.plan} / ${first.plan}`);
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

test('the numbers above the haze: the chip and every truck number are page text over the 3D yard, crisp and high contrast, light and dark', { skip, timeout: 900_000 }, async () => {
  // The Beautiful graphics level (light glow on), where the yard's haze and glow washed the truck numbers out.
  const high = HTML.replace("graphics: 'auto'", "graphics: 'high'");
  for (const [colorScheme, width, height, chapter] of [['light', 960, 600, 'add'], ['dark', 960, 600, 'greater'], ['dark', 390, 700, 'build']]) {
    const g = await open({ params: `chapter=${chapter}&lock=1`, html: high, colorScheme, width, height });
    try {
      await g.frame.click('#hero-mage');
      // the Beautiful level is slow on a software renderer: the truck takes its time to drive in
      await g.frame.waitForFunction(() => window.__cs.state().screen === 'play' && window.__cs.state().moving === 0, null, { timeout: 180_000 });
      const s = await g.state(), n = s.kind === 'more' || s.kind === 'sign' ? 2 : chapter === 'add' ? 2 : 1;
      await g.frame.waitForFunction(k => window.__cs.boards().length >= k, n, { timeout: 60_000 });   // placed on the next drawn frame
      const look = await g.frame.evaluate(() => {
        const lum = c => { const [r, gg, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * gg + 0.0722 * b; };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const canvas = document.querySelector('canvas'), z = e => getComputedStyle(e).zIndex;
        // the hit test sees what is drawn on top at a point; the words layer lets taps through (pointer-events: none), so
        // it takes part in the hit test only while this looks
        const probe = document.createElement('style'); probe.textContent = '#cs, #cs * { pointer-events: auto !important; } #cs #tags { pointer-events: none !important; } #cs #tags .cs-tag { pointer-events: auto !important; }'; document.head.append(probe);
        const top = e => { const r = e.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at === e || e.contains(at); };
        const tags = [...document.querySelectorAll('#tags .cs-tag')].filter(t => !t.hidden), sum = document.getElementById('sum');
        return {
          layers: { cs: z(document.getElementById('cs')), canvasInHud: document.getElementById('cs').contains(canvas), canvasBefore: !!(canvas.compareDocumentPosition(document.getElementById('cs')) & Node.DOCUMENT_POSITION_FOLLOWING) },
          sum: { onTop: top(sum), contrast: ratio(getComputedStyle(sum).color, getComputedStyle(sum).backgroundColor) },
          tags: tags.map(t => ({ text: t.textContent, onTop: top(t), contrast: ratio(getComputedStyle(t).color, getComputedStyle(t).backgroundColor), h: t.getBoundingClientRect().height, inCanvas: canvas.contains(t) })),
          probe: probe.remove(),
        };
      });
      const at = `${chapter} ${colorScheme} ${width}px`;
      assert.deepEqual(look.layers, { cs: '2', canvasInHud: false, canvasBefore: true }, `${at}: the words and numbers are a layer above the canvas`);
      assert.ok(look.sum.onTop, `${at}: nothing lies over the number chip`); assert.ok(look.sum.contrast >= 7, `${at}: the chip is ink on mint (${look.sum.contrast.toFixed(1)}:1)`);
      const want = s.kind === 'more' || s.kind === 'sign' ? [String(s.a), String(s.b)] : chapter === 'add' ? [String(s.a), '+' + s.b] : [String(s.ask === 'parts' ? '?' : 0)];
      assert.deepEqual(look.tags.map(t => t.text).sort(), want.sort(), `${at}: the truck numbers (${JSON.stringify(look.tags)})`);
      for (const t of look.tags) {
        assert.ok(t.onTop, `${at}: nothing (no haze, no glow) lies over the truck number ${t.text}`);
        assert.ok(t.contrast >= 12, `${at}: ${t.text} is ink on cream or gold (${t.contrast.toFixed(1)}:1)`);
        assert.ok(t.h >= 24 && !t.inCanvas, `${at}: ${t.text} is big page text, not a picture in the canvas`);
      }
      // the number board follows its truck: it is where the sign is over the cab
      const board = (await g.frame.evaluate(() => window.__cs.boards()))[0], spot = await g.frame.evaluate(() => window.__cs.spot('a'));
      assert.ok(board.y + board.h < spot.left[1], `${at}: the board is above its truck`);
      assert.deepEqual(g.errors, []);
    } finally { await g.ctx.close(); }
  }
});

test('the voice coach in the game: the next question waits for the coach’s last line, nothing is cut off, and a voice that fails does not hold the game', { skip, timeout: 420_000 }, async () => {
  /** Answer round 1 right and watch the yard's sound: each line's audio start and end, any line paused before its end,
   *  and when round 2's words appear. */
  const watch = async g => {
    await g.frame.click('#hero-mage');
    await g.until(() => window.__cs.state().screen === 'play' && window.__cs.state().moving === 0);
    await g.until(() => window.__cs.state().voice === 'idle');   // the question has been said
    const s = await g.state();
    await g.frame.evaluate(() => {
      window.__ev = []; const T = () => performance.now();
      let r = window.__cs.state().round; const tick = () => { const st = window.__cs.state(); if (st.round !== r) { r = st.round; window.__ev.push(['round', T()]); } setTimeout(tick, 10); }; tick();
      const A = window.Audio.prototype, play = A.play;
      A.play = function () { const a = this; if (String(a.src).startsWith('blob:')) { window.__ev.push(['start', T()]); a.addEventListener('ended', () => window.__ev.push(['end', T()]), { once: true }); a.addEventListener('pause', () => { if (!a.ended) window.__ev.push(['cut', T()]); }, { once: true }); } return play.apply(this, arguments); };
      window.__t0 = T();
    });
    await g.frame.click('#cs-n' + s.answer);
    await g.until(() => window.__cs.state().round === 2);
    await g.until(() => window.__cs.state().voice === 'idle');
    const ev = await g.frame.evaluate(() => window.__ev.map(([k, t]) => [k, Math.round(t - window.__t0)]));
    const lines = await g.frame.evaluate(() => window.__cs.lines().filter(l => l.asked >= window.__t0).map(l => ({ text: l.text, why: l.why })));
    return { s, ev, lines };
  };
  // A voice that takes 0.3 s to arrive and 150 ms a character (the two lines of the feedback: about 7.5 s in all, more
  // than the 5.2 s the feedback stays on screen).
  const g = await open({ params: 'chapter=greater&lock=1', voice: 150 });
  try {
    const { s, ev, lines } = await watch(g);
    const at = k => ev.filter(e => e[0] === k).map(e => e[1]);
    const [round] = at('round'), ends = at('end'), starts = at('start');
    assert.deepEqual(at('cut'), [], `no line is cut off (${JSON.stringify(ev)})`);
    assert.deepEqual(lines.slice(0, 2).map(l => l.text), [`${Math.max(s.a, s.b)} is greater than ${Math.min(s.a, s.b)}.`, `${Math.max(tensOf(s.a), tensOf(s.b))} tens is more than ${Math.min(tensOf(s.a), tensOf(s.b))} tens.`]);
    assert.ok(lines.slice(0, 2).every(l => l.why === 'ended'), `both feedback lines were said to their end: ${JSON.stringify(lines)}`);
    assert.ok(starts[1] >= ends[0] - 5, `the second line starts after the first has ended (${JSON.stringify(ev)})`);
    assert.ok(round >= ends[1] - 5, `the next question comes after the last feedback line has ended (${round} ms, line ended at ${ends[1]} ms)`);
    assert.ok(round > 5200, 'and the feedback had its full time on screen');
    assert.ok(starts[2] >= ends[1] - 5 && starts[2] >= round, 'the next question’s words come after that');
    assert.deepEqual(g.errors, []);
  } finally { await g.ctx.close(); }

  // A voice that fails (the play page answers "no AI voice", and this machine has no voice of its own): the game goes on
  // after the feedback's own time, with nothing waiting on a sound that will never come.
  const f = await open({ params: 'chapter=greater&lock=1' });
  try {
    const r2 = await watch(f), [round2] = r2.ev.filter(e => e[0] === 'round').map(e => e[1]);
    assert.ok(round2 >= 5200 && round2 < 5200 + 4000, `the next question comes on time (${round2} ms)`);
    assert.deepEqual(f.errors, []);
  } finally { await f.ctx.close(); }
});
