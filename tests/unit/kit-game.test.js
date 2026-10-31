// The Oomba Kit's game layer (Oomba.game, Oomba.level) and art packs without a browser: whole rounds run in a fake
// window with __brbTest.step(n) (deterministic), so the platformer physics, every gameplay part, the automatic juice
// hooks, the scenes' outcomes (win, lose, BRB.gameOver), the control presets and the pack registry are all checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeWin } from '../support/kit-fake.js';
import { createKit, VERSION } from '../../kit/src/index.js';
import { grid, generate, LEGEND, TILE } from '../../kit/src/level.js';
import * as animals from '../../kit/packs/art-animals.js';
import * as school from '../../kit/packs/art-school.js';
import * as biomes from '../../kit/packs/art-biomes.js';
import * as dress from '../../kit/packs/dress.js';

/** A game in a fake window, straight into play. -> {O, kit, g, w (the world), T (__brbTest), hold, release, win} */
function play(rows, spec = {}, o = {}) {
  const reported = [];
  const win = fakeWin({ brb: { version: 3, gameOver: r => reported.push(r), ...(o.brb || {}) } });
  const O = createKit(win), kit = O.debug.kit;
  if (o.before) o.before(O, kit);
  const g = O.game(Object.assign({ api: 1, title: 'Test', autorun: false, level: O.level.grid(rows, spec.legend || {}, { cell: 48 }) }, spec));
  if (o.start !== false) g.start();
  const T = win.__brbTest;
  const src = a => 'sim:' + a;
  const hold = a => { if (!kit.input.bindings[a].includes(src(a))) kit.input.bindings[a].push(src(a)); kit.input.srcDown(src(a)); };
  const release = a => kit.input.srcUp(src(a));
  return { O, kit, g, get w() { return g.world; }, T, hold, release, win, reported };
}
const FLAT = ['                              ', '  P                           ', '##############################'];

test('level.grid: one character per cell, a validated legend, ragged rows, tiles and spawns', () => {
  const L = grid(['  P  $', '##==~~##', '#'], { XY: 'fox', $: 'coin', z: 'bush' }, { cell: 32 });
  assert.equal(L.cols, 8); assert.equal(L.nrows, 3); assert.equal(L.cell, 32); assert.equal(L.w, 256);
  assert.ok(L.warnings.some(w => /"XY" must be one character/.test(w)), 'multi-character keys are rejected');
  assert.deepEqual([L.at(0, 1), L.at(2, 1), L.at(4, 1), L.at(5, 0), L.at(-1, 0), L.at(99, 2), L.at(0, 9)], [TILE.solid, TILE.ledge, TILE.water, TILE.empty, TILE.solid, TILE.solid, TILE.empty]);
  assert.deepEqual(L.start, { c: 2, r: 0 });
  assert.deepEqual(L.items.find(i => i.ch === '$').spec, 'coin', 'a game may override a built-in character');
  const bad = grid(['?P'], {}); assert.ok(bad.warnings.some(w => /"\?" is not in the legend/.test(w)));
  assert.ok(grid(['###']).warnings.some(w => /no player start/.test(w)));
  for (const k of Object.keys(LEGEND)) assert.equal([...k].length, 1);
  assert.equal(L.floorBelow(80, 0), 32, 'the ledge row is the floor at x=80');
});

test('level.generate: the same seed makes the same level, with a start, a flag, a checkpoint and pickups', () => {
  const a = generate({ seed: 7, length: 70 }), b = generate({ seed: 7, length: 70 }), c = generate({ seed: 8, length: 70 });
  assert.deepEqual(a.rows, b.rows); assert.notDeepEqual(a.rows, c.rows);
  const s = a.rows.join('\n');
  for (const ch of ['P', 'G', 'K', '$']) assert.ok(s.includes(ch), ch);
  assert.deepEqual(a.warnings, []);
});

test('Oomba.game: the test hooks are the game\'s (start/win/skip), state() reports the round, and it runs the same every time', () => {
  const run = () => { const p = play(['                     ', '  P  $ $  $       G  ', '#####################']); p.hold('right'); p.T.step(90); return p; };
  const a = run(), b = run();
  assert.equal(typeof a.T.start, 'function'); assert.equal(typeof a.T.win, 'function');
  const s = a.T.state();
  assert.deepEqual([s.game, s.scene, s.total], [true, 'play', 3]);
  assert.ok(s.hero.x > 120 && s.got >= 1, JSON.stringify(s));
  assert.deepEqual(a.T.state().hero, b.T.state().hero, 'deterministic'); assert.equal(a.T.state().score, b.T.state().score);
});

test('platformer: kid-easy runs, jumps about 2.7 cells with a variable height, and lands with juice', () => {
  const p = play(FLAT), e = p.w.hero, y0 = e.y, events = [];
  p.w.on('land', () => events.push('land'));
  p.hold('jump'); let top = y0; for (let i = 0; i < 60; i++) { p.T.step(1); top = Math.min(top, e.y); } p.release('jump');
  p.T.step(60);
  const full = (y0 - top) / 48; assert.ok(full > 2.4 && full < 3, `full jump ${full} cells`);
  assert.equal(e.y, y0, 'lands back on the ground'); assert.deepEqual(events, ['land']);
  // a tap jump (released at once) is lower
  p.hold('jump'); p.T.step(1); p.release('jump'); top = y0; for (let i = 0; i < 60; i++) { p.T.step(1); top = Math.min(top, e.y); }
  assert.ok((y0 - top) / 48 < full * 0.6, 'variable jump height');
  // coyote time: a jump pressed a few steps after walking off a ledge still works
  const q = play(['     ', '  P  ', '###  ', '     ', '#####']); const h = q.w.hero; q.hold('right');
  let off = 0; for (let i = 0; i < 200 && !off; i++) { q.T.step(1); if (!q.w.body.grounded && h.x > 3 * 48) off = i; }
  q.T.step(3); const yBefore = h.y; q.hold('jump'); q.T.step(2); assert.ok(h.y < yBefore, 'coyote jump');
});

test('pickups: the magnet pulls sparks in, combos raise the points, hearts heal, keys count; the HUD and on.collect hear it', () => {
  const seen = [];
  const p = play(['           ', ' P $$$ H k ', '###########'], { hud: ['score', 'lives:3', 'count:spark'], on: { collect: (w, it) => seen.push(it.kindName) } });
  p.w.lives = 2;
  p.hold('right'); p.T.step(150);
  const s = p.T.state();
  assert.deepEqual(seen, ['spark', 'spark', 'spark', 'heart', 'key']);
  assert.equal(s.got, 3); assert.equal(s.total, 3); assert.equal(s.keys, 1); assert.equal(s.lives, 3, 'the heart healed');
  assert.equal(s.score, 10 + 12 + 14, 'combo bonus');
});

test('hazards: spikes hurt (hit-stop, shake, invulnerable blink, knockback), lives run out into the try-again scene and BRB.gameOver', async () => {
  const p = play(['           ', ' P  ^      ', '###########'], { hud: ['score', 'lives:1'] });
  const hits = []; p.w.on('hit', (w, z) => hits.push(z && z.kindName));
  p.hold('right'); p.T.step(60);
  assert.deepEqual(hits, ['spikes']); assert.equal(p.T.state().scene, 'lose');
  assert.deepEqual(p.reported, [{ won: false, score: 0 }]);
  // with "no fail" help, hurting never costs a life
  const q = play(['           ', ' P  ^      ', '###########'], { hud: ['lives:1'] }, { before: O => { O.settings.assist = 'nofail'; } });
  q.hold('right'); q.T.step(60); assert.equal(q.T.state().scene, 'play'); assert.ok(q.w.hero.invuln > 0 || q.T.state().lives === 1);
});

test('the goal wins: slow-mo and confetti, stars from what was collected, BRB.gameOver with the total', () => {
  const p = play(['           ', ' P $  $  G ', '###########'], { hud: ['score', 'lives:3'] });
  const won = []; p.w.on('win', () => won.push(p.T.state().scene));
  p.hold('right'); p.T.step(200);
  assert.deepEqual(won, ['goal']); assert.equal(p.w.stars(), 3);
  assert.equal(p.reported.length, 1); assert.equal(p.reported[0].won, true);
  assert.equal(p.reported[0].score, 10 + 12 + 3 * 25, 'points + lives bonus');
});

test('checkpoints and pits: falling off the level comes back to the last safe ground and costs a life', () => {
  const p = play(['             ', ' P  K        ', '#######   ###'], { hud: ['lives:3'] });
  const cps = []; p.w.on('checkpoint', (w, k) => cps.push(k.x));
  p.hold('right'); p.T.step(40); assert.equal(cps.length, 1); assert.equal(p.w.respawn.x, cps[0]);
  for (let i = 0; i < 300 && p.T.state().lives === 3; i++) p.T.step(1);
  p.release('right'); p.T.step(60);
  assert.equal(p.T.state().lives, 2); assert.ok(p.w.hero.y <= 2 * 48, 'back on the ground');
});

test('springs bounce higher than a jump; moving platforms carry the hero; crates are solid', () => {
  const p = play(['        ', '        ', '        ', '        ', '        ', ' P S    ', '########']);
  const e = p.w.hero, y0 = e.y; p.hold('right'); let top = y0;
  for (let i = 0; i < 80; i++) { p.T.step(1); top = Math.min(top, e.y); }
  assert.ok((y0 - top) / 48 > 3.2, `spring height ${(y0 - top) / 48}`);
  const q = play(['          ', '  P       ', '  M       ', '          ', '          ', '##########'], { legend: { M: { kind: 'mover', platform: { dx: 3, speed: 2 } } } });
  q.T.step(30); const h = q.w.hero, x0 = h.x; q.T.step(60);
  assert.ok(q.w.body.plat, 'standing on the platform'); assert.ok(h.x > x0 + 20, 'carried along');
  const c = play(['        ', ' P  C   ', '########']); c.hold('right'); c.T.step(120);
  assert.ok(c.w.hero.x < 4 * 48, 'the crate blocks the way');
});

test('doors need a key (a toast says so once); a key opens one and is used up', () => {
  const toasts = [];
  const p = play(['           ', ' P   D   G ', '###########'], {}, { before: (O, kit) => { kit.ui.toast = t => toasts.push(t); } });
  p.hold('right'); p.T.step(90); assert.ok(p.w.hero.x < 5 * 48, 'blocked'); assert.equal(toasts.length, 1); assert.match(toasts[0], /key/i);
  const q = play(['           ', ' P k D   G ', '###########']); q.hold('right'); q.T.step(90);
  assert.equal(q.T.state().keys, 0); assert.ok(q.w.hero.x > 6 * 48, 'through the door');
});

test('quiz gates: closed until answered (on.gate or the gate\'s own question); the hero waits in a story beat', async () => {
  const asked = [];
  const p = play(['             ', ' P   Q    G ', '#############'], { legend: { Q: { kind: 'gate', q: '2 + 2 = ?', a: 4, choices: [3, 4, 5, 6] } } },
    { before: (O, kit) => { kit.screens.ask = q => { asked.push(q.q); return Promise.resolve(asked.length > 1); }; } });
  p.hold('right'); p.T.step(60);
  assert.equal(p.T.state().scene, 'talk', 'a story beat while asking'); assert.ok(p.w.hero.x < 5 * 48);
  for (let i = 0; i < 5; i++) { await new Promise(r => setImmediate(r)); }
  assert.deepEqual(asked, ['2 + 2 = ?', '2 + 2 = ?'], 'asked again after a miss');
  assert.equal(p.w.find('gate').solidOn, false); assert.equal(p.T.state().scene, 'play');
  p.T.step(120); assert.ok(p.w.hero.x > 6 * 48, 'through the gate');
  // on.gate decides instead
  const q = play(['             ', ' P   Q    G ', '#############'], { on: { gate: () => true } }); q.hold('right'); q.T.step(40); await new Promise(r => setImmediate(r));
  assert.equal(q.w.find('gate').solidOn, false);
});

test('NPCs and signs talk once you are near (read aloud in a bubble); on.talk can run the scene', async () => {
  const said = [];
  const p = play(['             ', ' P   N  i   ', '#############'], { legend: { N: { kind: 'npc', species: 'bunny', say: ['hello', 'bye'] }, i: { kind: 'sign', say: 'Go right!' } } },
    { before: (O, kit) => { kit.screens.bubble = (who, text) => { said.push(text); return Promise.resolve(); }; } });
  p.hold('right'); p.T.step(50); for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(said, ['hello', 'bye']);
  p.T.step(80); for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
  assert.deepEqual(said, ['hello', 'bye', 'Go right!']);
  assert.equal(p.w.find('npc').kind, 'bunny');
});

test('topdown moves in both axes and stops at walls; tap moves toward the pointer; unknown controls warn', () => {
  const p = play(['#######', '#     #', '#  P  #', '#     #', '#######'], { controls: 'topdown' });
  const e = p.w.hero, y0 = e.y; p.hold('up'); p.T.step(60);
  assert.ok(e.y < y0 - 20, 'moves up'); assert.ok(e.y > 48, 'the wall stops it');
  const q = play(FLAT, { controls: 'tap' });
  q.kit.input.pointer.down = true; q.kit.input.pointer.x = 900; q.kit.input.pointer.y = 300; q.T.step(40);
  assert.ok(q.w.hero.x > 140, 'walks toward the held pointer');
  const r = play(FLAT, { controls: 'jetpack' }); assert.ok(r.win.__warns.some(w => /unknown controls "jetpack"/.test(w)));
});

test('water: swimming is safe (slow sink, a swim stroke); splash water sends you back to the bank', () => {
  const p = play(['        ', ' P      ', '##~~~###', '##~~~###', '########']);
  p.hold('right'); p.T.step(40); p.release('right'); p.T.step(30);
  assert.equal(p.w.body.water, true); assert.equal(p.T.state().lives, 3, 'no harm');
  const q = play(['        ', ' P      ', '##~~~###', '##~~~###', '########'], { legend: { '~': { kind: 'water', splash: true } } });
  q.hold('right'); q.T.step(40); q.release('right'); q.T.step(60);
  assert.ok(q.w.hero.x < 2 * 48 + 10, 'back on the bank'); assert.equal(q.T.state().lives, 2);
});

test('walkers turn at walls and ledges; stompable enemies can be bounced on', () => {
  const p = play(['          ', ' P   E    ', '###  #####'], { controls: 'none' });
  const r = p.w.find('roller'), xs = []; for (let i = 0; i < 300; i++) { p.T.step(1); xs.push(r.x); }
  assert.ok(Math.min(...xs) >= 5 * 48 && Math.max(...xs) <= 10 * 48, 'stays on its ledge'); assert.ok(Math.max(...xs) - Math.min(...xs) > 3 * 48, 'walks to both ends');
});

test('art packs: Oomba.pack reports what a pack added; species, props and biomes become usable; wrong versions are refused', () => {
  const win = fakeWin(); const O = createKit(win), kit = O.debug.kit;
  assert.equal(O.pack('art-animals'), null); assert.ok(win.__warns.some(w => /not loaded/.test(w)));
  O.__pk({ name: 'art-animals', version: VERSION }, animals.define); O.__pk({ name: 'art-school', version: VERSION }, school.define); O.__pk({ name: 'art-biomes', version: VERSION }, biomes.define); O.__pk({ name: 'dress', version: VERSION }, dress.define);
  const a = O.pack('art-animals');
  assert.deepEqual(a.species, ['cat', 'dog', 'bear', 'mouse', 'owl', 'penguin', 'duck']);
  assert.ok(O.art.species.length >= 13, 'the cast reaches 13 species');
  assert.ok(O.pack('art-school').props.length >= 25); assert.ok(O.art.props.school.includes('abacus') && O.art.props.learning.includes('tile'));
  assert.deepEqual(O.pack('art-biomes').biomes, ['jungle', 'reef', 'city', 'moon', 'autumn']); assert.ok(O.art.biomes.length >= 11);
  assert.deepEqual(O.packs.sort(), ['art-animals', 'art-biomes', 'art-school', 'dress']);
  assert.equal(O.char({ species: 'owl' }).species, 'owl'); assert.equal(O.char({ species: 'pengiun' }).species, 'penguin', 'typos snap to the nearest species');
  const s = O.stage({ api: 1, biome: 'jungle' }); assert.equal(s.biome, 'jungle'); assert.ok(s.atlas.has('ground:moon') && s.atlas.has('chalkboard'));
  const e = s.add('cat', { x: 0, y: 0 }); assert.equal(e.kind, 'cat');
  assert.equal(O.__pk({ name: 'x', version: '9.9.9' }, () => {}), null); assert.ok(win.__warns.some(w => /is for kit 9\.9\.9/.test(w)));
  assert.equal(O.pack('art-cars'), null); assert.ok(win.__warns.some(w => /no such pack/.test(w)));
  assert.ok(!Object.keys(O).includes('__pk'), 'the pack hook is not part of the public API');
});

test('a game can use pack art in its legend (and w.spawn), and warns about kinds it does not know', () => {
  const p = play(['           ', ' P  N  a   ', '###########'], { biome: 'moon', legend: { N: { kind: 'npc', species: 'penguin', say: 'hi' }, a: 'abacus' } },
    { before: O => { O.__pk({ name: 'art-animals', version: VERSION }, animals.define); O.__pk({ name: 'art-school', version: VERSION }, school.define); O.__pk({ name: 'art-biomes', version: VERSION }, biomes.define); O.__pk({ name: 'dress', version: VERSION }, dress.define); } });
  assert.equal(p.w.find('npc').kind, 'penguin'); assert.ok(p.w.find('abacus'));
  const x = p.w.spawn('owl', { c: 3, r: 1 }); assert.equal(x.kind, 'owl');
  p.w.spawn('unicorn', { c: 3, r: 1 }); assert.ok(p.win.__warns.some(w => /unicorn/.test(w)));
});

// ---- phase 2 review fixes -----------------------------------------------------------------------------------------
const tick = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

test('a collected pickup pops away and is gone: out of w.all() at once, removed from the stage within about 400 ms', async () => {
  const p = play(['           ', ' P $       ', '###########']);
  const s = p.w.find('spark'); assert.ok(s);
  p.hold('right'); let taken = 0;
  for (let i = 0; i < 120 && !taken; i++) { p.T.step(1); if (p.w.got) taken = i; }
  assert.ok(taken, 'collected'); p.release('right');
  assert.equal(p.w.all('spark').length, 0, 'w.all() no longer returns it'); assert.equal(p.w.find('spark'), null);
  assert.ok(s.collecting, 'the pop-away animation runs');
  for (let i = 0; i < 24; i++) { p.T.step(1); await tick(1); }   // 400 ms
  assert.equal(s.dead, true, 'removed after the pop'); assert.ok(!p.w.stage.entities.includes(s) || s.dead);
  assert.equal(p.T.state().got, 1);
});

test('gates and talk: a handler that returns nothing still gets the built-in quiz or lines; false skips them', async () => {
  const asked = [];
  const mk = gate => play(['             ', ' P   Q    G ', '#############'], { legend: { Q: { kind: 'gate', q: 'qKey', a: 4, choices: [3, 4, 5, 6] } }, strings: { en: { qKey: 'Two plus two?' } }, on: { gate } },
    { before: (O, kit) => { kit.screens.ask = q => { asked.push(q.q); return Promise.resolve(true); }; } });
  const a = mk(w => { w.said = true; }); a.hold('right'); a.T.step(60); await tick();
  assert.deepEqual(asked, ['Two plus two?'], 'the built-in quiz runs (its key translated)'); assert.equal(a.w.find('gate').solidOn, false);
  const b = mk(() => false); b.hold('right'); b.T.step(60); await tick();
  assert.equal(asked.length, 1, 'false: no built-in quiz'); assert.equal(b.w.find('gate').solidOn, true);
  const said = [];
  const c = play(['             ', ' P   N       ', '#############'], { legend: { N: { kind: 'npc', species: 'frog', say: ['hello'] } }, on: { talk: () => {} } },
    { before: (O, kit) => { kit.screens.bubble = (who, text) => { said.push(text); return Promise.resolve(); }; } });
  c.hold('right'); c.T.step(50); await tick();
  assert.deepEqual(said, ['hello'], 'on.talk returning nothing keeps the NPC\'s lines');
});

test('w.ask translates its question, hint and string choices (string keys), keeping the right answer', async () => {
  let seen = null;
  const p = play(FLAT, { strings: { en: { q1: 'Which is red?', apple: 'Apple', sky: 'Sky', h1: 'Think of fruit' } } }, { before: (O, kit) => { kit.screens.ask = q => { seen = q; return Promise.resolve(true); }; } });
  await p.w.ask({ q: 'q1', a: 'apple', choices: ['sky', 'apple'], hint: 'h1' });
  assert.equal(seen.q, 'Which is red?'); assert.deepEqual(seen.choices, ['Sky', 'Apple']); assert.equal(seen.index, 1); assert.equal(seen.hint, 'Think of fruit');
});

test("controls 'none': no hero input, but the world still works: a hero moved from code picks up sparks and reaches the goal", () => {
  const p = play(['           ', ' P  $   G  ', '###########'], { controls: 'none' });
  const e = p.w.hero, x0 = e.x;
  p.hold('right'); p.T.step(30); assert.equal(e.x, x0, 'the keys do not move the hero');
  for (let i = 0; i < 200 && p.T.state().scene === 'play'; i++) { e.x += 2.5; p.T.step(1); }
  assert.equal(p.w.got, 1, 'the spark counts'); assert.equal(p.T.state().scene, 'goal', 'the goal wins');
});

test('results: one level -> "Play again" leads (no Next); w.win({title, submit: false}) names a winner and stays off the leaderboard; no lives bonus without a lives widget', async () => {
  const cards = [];
  const p = play(['           ', ' P  $  G   ', '###########'], { hud: ['score'] }, { before: (O, kit) => { kit.screens.win = o => { cards.push(o); return new Promise(() => {}); }; } });
  let ts = 0; const run = q => { q.T.step(5); q.kit.loop.frame(ts += 50); };
  p.hold('right'); for (let i = 0; i < 400 && !cards.length; i++) { run(p); await tick(1); }
  assert.equal(cards.length, 1); assert.equal(cards[0].next, false, 'single level: no Next');
  assert.equal(p.reported[0].score, 10, 'no lives bonus without a lives widget');
  const two = play(FLAT, { hud: ['score'] }, { before: (O, kit) => { kit.screens.win = o => { cards.push(o); return new Promise(() => {}); }; } });
  two.w.win({ title: 'Mia wins!', who: { species: 'cat' }, submit: false, score: 3 });
  for (let i = 0; i < 300 && cards.length < 2; i++) { run(two); await tick(1); }
  assert.equal(cards[1].title, 'Mia wins!'); assert.equal(cards[1].best, null); assert.deepEqual(two.reported, [], 'not submitted');
  assert.equal(cards[1].hero.species, 'cat');
});

test('__brbTest.win() resolves once the results card shows (never waits for a button); w.setHero changes the results hero', async () => {
  const cards = [];
  const p = play(FLAT, {}, { before: (O, kit) => { kit.screens.win = o => { cards.push(o); return new Promise(() => {}); }; } });
  p.w.setHero({ species: 'frog' });
  let done = false; p.T.win().then(v => { done = v; });
  let ts = 0; for (let i = 0; i < 300 && !done; i++) { p.T.step(5); p.kit.loop.frame(ts += 50); await tick(1); }
  assert.equal(done, true); assert.equal(cards[0].hero.species, 'frog', 'the results card shows the new hero');
});

test('round seeds: with no seed, each round deals differently; __brbTest.seed(n) pins every round; spec.seed replays its rounds', () => {
  const firsts = s => { const p = play(FLAT, s); const a = p.w.rand.float(); p.g.restart('play'); return [a, p.w.rand.float(), p]; };
  const [a1, a2] = firsts({}); assert.notEqual(a1, a2, 'Play again deals new cards');
  const [b1, b2] = firsts({ seed: 5 }), [c1, c2] = firsts({ seed: 5 }); assert.equal(b1, c1); assert.equal(b2, c2); assert.notEqual(b1, b2);
  const p = play(FLAT, {}); p.T.seed(42); p.g.restart('play'); const x = p.w.rand.float(); p.g.restart('play'); assert.equal(p.w.rand.float(), x);
});

test('the eye never draws with a negative radius, however small the character is baked', async () => {
  const { ringEye } = await import('../../kit/src/grammar.js');
  const radii = []; const P2 = globalThis.Path2D, orig = P2.prototype.arc;
  P2.prototype.arc = function (x, y, r, ...a) { radii.push(r); return orig ? orig.call(this, x, y, r, ...a) : undefined; };
  try { for (const px of [4, 8, 12, 20, 60, 200]) ringEye({ fill() {}, stroke() {} }, { px, s: px / 160 }, 0, 0, 19, 0.17); } finally { P2.prototype.arc = orig; }
  assert.ok(radii.length >= 6 && radii.every(r => r >= 0.5), JSON.stringify(radii));
});

test('art packs define each name once (no duplicate props)', () => {
  for (const pack of [animals, school, biomes]) {
    const names = []; const rec = n => names.push(n);
    pack.define({ P: new Proxy({}, { get: () => ['#000', '#111', '#222', '#333'] }), INK: '#000', CREAM: '#fff', rand: () => () => 0.5, adjust: c => c, mix: c => c, text() {}, ink: new Proxy({}, { get: () => () => {} }),
      species: rec, prop: rec, biome: rec });
    assert.equal(new Set(names).size, names.length, `${pack.PACK.name}: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  }
});

test('ui.button takes an icon name (or SVG); an unknown name warns instead of printing the word', () => {
  const win = fakeWin(); const O = createKit(win);
  const b = O.ui.button('Fire', { icon: 'up' }); assert.match(b.innerHTML, /<svg/);
  O.ui.button('Fire', { icon: 'rocketship' }); assert.ok(win.__warns.some(w => /unknown icon "rocketship"/.test(w)));
});

test('Space and Enter on a focused game button press it (never also jump); the HUD pause button keeps Space as jump', () => {
  const ls = {}; const win = fakeWin(); const O = createKit(win), kit = O.debug.kit;
  const fw = { addEventListener: (t, f) => { ls[t] = f; }, removeEventListener() {} };
  kit.input.attach(fw, { addEventListener() {}, removeEventListener() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
  const target = sel => ({ tagName: 'BUTTON', closest: s => (s.includes(sel) ? {} : null) });
  let prevented = 0; const ev = (code, t) => ({ code, target: t, repeat: false, preventDefault: () => { prevented++; } });
  ls.keydown(ev('Space', target('button'))); kit.input.update(); assert.equal(kit.input.down('jump'), false); assert.equal(prevented, 0, 'the browser presses the button');
  ls.keyup({ code: 'Space' });
  const hud = { tagName: 'BUTTON', closest: s => (s === '.ok-modal' ? null : {}) };   // inside .ok-hud
  ls.keydown(ev('Space', hud)); kit.input.update(); assert.equal(kit.input.down('jump'), true); assert.equal(prevented, 1);
});

test("the flag meter follows the hero to the goal in controls 'none' games too, until the game sets it itself", () => {
  const p = play(['             ', ' P        G  ', '#############'], { controls: 'none', hud: ['score', 'progress'] });
  const pg = p.w.hud.progress, seen = []; pg.auto = v => { seen.push(v); };   // (the fake DOM has no bar to fill)
  for (let i = 0; i < 40; i++) { p.w.hero.x += 6; p.T.step(1); }
  assert.ok(seen.length && seen[seen.length - 1] > 0.3, 'it fills as the hero moves');
  pg.set(0.1); const n = seen.length; for (let i = 0; i < 10; i++) { p.w.hero.x += 6; p.T.step(1); }
  assert.equal(seen.length, n, 'once the game sets it, the kit leaves it alone');
});
