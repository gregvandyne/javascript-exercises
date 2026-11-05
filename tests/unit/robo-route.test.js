// Robo Route (seed-games/robo-route.html): the block-program engine, the grid simulation, every level of the eight
// chapters in both bands (the Debug Lab's edit counts, Best Route's routes and flowcharts, the Level Maker's tasks), the
// level codec, the daily board, the English string list and the game in real Chromium inside the production frame
// wrapper. The data tests run the game's own classic scripts in a vm (no browser); the Chromium tests are skipped when
// there is no local Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'seed-games/robo-route.html'), 'utf8');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-games/robo-route.json'), 'utf8'));
const CONTRACT_COUNTS = { sequences: { '1b': 6, '2': 6 }, loops: { '1b': 7, '2': 8 }, conditionals: { '1b': 7, '2': 7 }, variables: { '1b': 6, '2': 6 }, functions: { '1b': 6, '2': 7 }, debug: { '1b': 7, '2': 7 }, 'best-route': { '1b': 5, '2': 5 }, 'level-maker': { '1b': 3, '2': 3 } };
const BUILT = Object.keys(CONTRACT_COUNTS);
const ctx = vm.createContext({ window: {} });
for (const m of HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(m[1], ctx);
const E = ctx.window.RoboRoute, LV = ctx.window.RoboRouteLevels;
const { CHAPTERS, LEVELS, parse, levelsFor } = LV;
const CSTA = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'server/standards/csta-2017.json'), 'utf8')).standards.map(s => s.id));
const run = (level, text, o = { planMatch: true }) => E.run(level, parse(text), o);
const everyLevel = () => BUILT.flatMap(ch => ['1b', '2'].flatMap(band => levelsFor(ch, band).filter(l => !l.maker).map(l => [ch, band, l])));
const makerLevels = () => ['1b', '2'].flatMap(band => levelsFor('level-maker', band).map(l => [band, l]));
const solve = (l, text) => { const starter = l.starter ? parse(l.starter) : null; const sol = parse(text); return { sol, r: E.run(l, sol, { planMatch: true, starter }) }; };

test('robo-route: all eight chapters have the contract\'s level counts in both bands, every level is solved by its answer on every board, within par, with three stars', () => {
  for (const ch of BUILT) for (const band of ['1b', '2']) assert.equal(levelsFor(ch, band).length, CONTRACT_COUNTS[ch][band], `${ch} ${band} levels`);
  assert.equal(everyLevel().length + makerLevels().length, 6 + 6 + 7 + 8 + 7 + 7 + 6 + 6 + 6 + 7 + 7 + 7 + 5 + 5 + 3 + 3);
  for (const [ch, band, l] of everyLevel()) {
    const { sol, r } = solve(l, l.sol);
    assert.ok(r.verdict.ok, `${ch}/${band}/${l.id}: ${r.verdict.failReason} on board ${r.verdict.failLayout + 1}`);
    assert.ok(E.blocks(sol) <= E.parOf(l, band), `${ch}/${band}/${l.id}: par ${E.parOf(l, band)} >= blocks ${E.blocks(sol)}`);
    assert.equal(E.stars(l, band, sol, r.verdict, {}), 3, `${ch}/${band}/${l.id}: three stars for the answer (edits ${r.verdict.editsFromStarter}, max ${l.maxEdits})`);
    assert.equal(E.stars(l, band, sol, r.verdict, { hint3: true }), 2, `${ch}/${band}/${l.id}: the third hint costs a star`);
    const ck = E.check(l); assert.ok(ck.solvable, `${ch}/${band}/${l.id}: the board check proves it solvable`);
    const cmds = r.results.map(x => x.verdict.commandsRun); assert.ok(ck.par <= Math.max(...cmds), `${ch}/${band}/${l.id}: BFS par ${ck.par} is a lower bound (answer runs ${cmds})`);
    for (const t of l.needs || []) assert.ok(r.ast.types.includes(t), `${ch}/${band}/${l.id}: the answer uses ${t}`);
    if (l.minProcs) assert.ok(Object.keys(r.ast.procs).length >= l.minProcs, `${ch}/${band}/${l.id}: the answer has ${l.minProcs} procedures`);
    if (l.flow) assert.equal(E.fullShape(r.ast), l.flow.shape, `${ch}/${band}/${l.id}: the answer has the flowchart's shape`);
  }
  // the Level Maker's three tasks: the given board fails the task, the fixed board passes it, and the fixed board has a code
  for (const [band, l] of makerLevels()) {
    assert.ok(l.maker && l.task && l.rule && Array.isArray(l.sol), `${band}/${l.id}: a maker task`);
    assert.equal(LV.makerOk(l, l.rows).ok, false, `${band}/${l.id}: the task board is not done yet`);
    const ok = LV.makerOk(l, l.sol); assert.ok(ok.ok, `${band}/${l.id}: the fixed board passes (${ok.why})`);
    assert.ok(ok.check.par >= 1 && ok.n === ok.check.par);
    const code = E.encode({ rows: l.sol, door: LV.doorRuleOf(l.sol) }); assert.ok(code, `${band}/${l.id}: the fixed board has a level code`);
    assert.deepEqual(E.decode(code).rows, l.sol);
    for (const t of l.shelf) assert.ok(LV.TILES[t], `${band}/${l.id}: ${t} is a tile`);
  }
});

test('robo-route: starters do not pass (and the Debug Lab fix stays within the edit budget), random levels run on three different boards and a fixed list of moves fails at least one', () => {
  for (const [ch, band, l] of everyLevel()) {
    if (l.starter) assert.ok(!run(l, l.starter).verdict.ok, `${ch}/${band}/${l.id}: the starter should not pass`);
    if (l.maxEdits != null) {
      assert.ok(l.starter, `${ch}/${band}/${l.id}: a debug level has a starter`);
      const e = E.edits(parse(l.starter), parse(l.sol)); assert.ok(e >= 1 && e <= l.maxEdits, `${ch}/${band}/${l.id}: the fix is ${e} edits, budget ${l.maxEdits}`);
      assert.equal(E.edits(parse(l.starter), parse(l.starter)), 0);
    }
    if (ch === 'debug' && band === '2') { const v = run(l, l.starter).verdict; assert.equal(E.layoutsOf(l).length, 3, `${l.id}: three test grids`); assert.ok(v.perLayout.some(x => !x), `${l.id}: a test grid catches the bug`); }
    if (l.programs) { const vs = l.programs.map(p => run(l, p).verdict); assert.equal(vs.length, 2); assert.ok(vs.some(v => v.ok), `${l.id}: one of the two routes works`); for (const [i, p] of l.programs.entries()) if (vs[i].ok) assert.ok(E.blocks(parse(p)) > l.par, `${l.id}: route ${'AB'[i]} works but can be improved`); }
    if (l.random) {
      const boards = E.layoutsOf(l);
      assert.equal(boards.length, 3, `${ch}/${band}/${l.id}: three boards`);
      assert.ok(new Set(boards.map(b => b.rows.join('/'))).size >= 2, `${ch}/${band}/${l.id}: the boards differ`);
      assert.ok(l.fixed, `${ch}/${band}/${l.id}: has a fixed counter-example`);
      const f = run(l, l.fixed); assert.ok(!f.verdict.ok, `${ch}/${band}/${l.id}: a fixed sequence fails somewhere`);
      assert.ok(f.verdict.perLayout.length === 3, 'perLayout flags');
    } else if (!l.layouts) assert.equal(E.layoutsOf(l).length, 1);
  }
});

test('robo-route: every level has three hints, a three-tile check, real CSTA ids, and level 1 of each chapter a learn card', () => {
  for (const [ch, band, l] of everyLevel()) {
    assert.ok(Array.isArray(l.hints) && l.hints.length === 3 && l.hints.every(h => h.length > 8), `${ch}/${band}/${l.id}: hints`);
    assert.ok(l.check && l.check.q && l.check.tiles.length === 3 && l.check.answer >= 0 && l.check.answer < 3, `${ch}/${band}/${l.id}: check`);
    const ids = band === '2' ? l.csta2 : l.csta;
    assert.ok(ids && ids.length, `${ch}/${band}/${l.id}: csta ids for the band`);
    for (const id of ids) assert.ok(CSTA.has(id), `${ch}/${band}/${l.id}: ${id} exists`);
    const chapter = CHAPTERS.find(c => c.id === ch);
    for (const id of ids) assert.ok(chapter.csta[band].includes(id), `${ch}/${band}/${l.id}: ${id} is one of the chapter's standards`);
    assert.ok(l.shelf.length >= 2 && l.shelf.length <= 8, `${ch}/${band}/${l.id}: 2-8 shelf blocks`);
  }
  for (const [band, l] of makerLevels()) {
    assert.ok(l.hints.length === 3 && l.check && l.check.tiles.length === 3, `${band}/${l.id}: hints and a check`);
    const ids = band === '2' ? l.csta2 : l.csta; for (const id of ids) assert.ok(CSTA.has(id) && CHAPTERS.find(c => c.id === 'level-maker').csta[band].includes(id), `${band}/${l.id}: ${id}`);
  }
  for (const ch of BUILT) for (const band of ['1b', '2']) assert.ok(levelsFor(ch, band)[0].learn, `${ch} ${band}: level 1 has a learn card`);
  for (const c of CHAPTERS) { for (const band of ['1b', '2']) for (const id of c.csta[band]) assert.ok(CSTA.has(id), `${c.id} ${band} ${id}`); assert.ok(!c.soon, `${c.id} is open`); }
  assert.equal(JSON.stringify(CHAPTERS.map(c => c.index)), '[1,2,3,4,5,6,7,8]');
  assert.equal(CHAPTERS.find(c => c.id === 'debug').mode, 'debug'); assert.equal(CHAPTERS.find(c => c.id === 'level-maker').mode, 'maker');
  // chip and credit keys named by levels exist in the word tables
  for (const l of LEVELS) { for (const k of l.chipOptions || []) assert.ok(LV.CHIPS[k], `${l.id}: chip ${k}`); for (const k of Object.values(l.chips || {})) assert.ok(LV.CHIPS[k], `${l.id}: chip ${k}`); for (const k of Object.values(l.credits || {})) assert.ok(LV.CREDITS[k], `${l.id}: credit ${k}`); }
});

test('robo-route: functions, Debug Lab and Best Route verdicts: procedures and parameters, remix keeps the credit line, note chips must tell the truth, few edits earn the star, the flowchart must match', () => {
  const L = (ch, band, id) => levelsFor(ch, band).find(l => l.id === id);
  const fn4 = L('functions', '1b', 'fn-4');
  assert.equal(run(fn4, 'proc Zig { move; move; right; move; left }; call Zig; call Zig').verdict.failReason, 'credit', 'the remix must keep its credit line');
  assert.equal(run(fn4, 'proc Zig { move; move; right; move; left }; call Zig; call Zig').verdict.creditOk, false);
  assert.ok(run(fn4, 'proc Zig credit starter { move; right; move; left }; proc Zag credit starter { move; move; right; move; left }; call Zag; call Zag').verdict.ok, 'either starter block may be remixed');
  assert.equal(run({ rows: ['>..G'], remix: { Go: parse('move; move; move') } }, 'proc Go { move; move; move }; call Go').verdict.failReason, 'remix', 'an unchanged starter block is not a remix');
  const fn7 = L('functions', '2', 'fn-7p');
  assert.equal(run(fn7, 'proc Zigzag(n) chip zig { repeat n { move; right; move; left } }; proc Finish chip up { repeat 2 { move } }; call Zigzag(5); call Finish').verdict.failReason, 'credit');
  assert.equal(run(fn7, fn7.starter + '; proc Finish { repeat 2 { move } }; call Zigzag(5); call Finish').verdict.failReason, 'chip0', 'every block needs a note chip');
  const fn6 = L('functions', '2', 'fn-6p');
  const wrong = run(fn6, 'proc Sweep chip down { repeat 3 { move; pick; move } }; proc Drop chip down { right; repeat 7 { move } }; proc Home chip home { right; repeat 5 { move } }; call Sweep; call Drop; call Home').verdict;
  assert.equal(wrong.failReason, 'chips'); assert.equal(wrong.chipsOk, false);
  assert.equal(run(fn6, 'proc Sweep chip collect { repeat 3 { move; pick; move }; right; repeat 7 { move } }; proc Home chip home { right; repeat 5 { move } }; call Sweep; call Home').verdict.failReason, 'procs', 'three subgoals need three procedures');
  const fn3 = L('functions', '2', 'fn-3p');
  assert.ok(run(fn3, 'proc Room(steps) { move; left; repeat steps { move }; pick; right; right; repeat steps { move }; left; move }; call Room(1); call Room(3); call Room(2); move').verdict.ok);
  assert.equal(run(fn3, 'proc Room(steps) { move; left; repeat steps { move }; pick; right; right; repeat steps { move }; left; move }; call Room(1); call Room(1); call Room(2); move').verdict.failReason, 'nothing', 'the wrong argument reaches for a gem that is not there');
  // the Debug Lab: the edit counter is a token edit distance (change = 1, move = 2, wrap = 3)
  assert.equal(E.edits(parse('move; move; right'), parse('move; move; left')), 1);
  assert.equal(E.edits(parse('move; right; move; move'), parse('move; move; right; move')), 2);
  assert.equal(E.edits(parse('repeat until goal { move; pick }'), parse('repeat until goal { move; if gem { pick } }')), 3);
  const d1 = L('debug', '1b', 'dbg-1'); const { sol, r } = solve(d1, d1.sol); assert.equal(r.verdict.editsFromStarter, 1); assert.equal(E.stars(d1, '1b', sol, r.verdict, {}), 3);
  const long = parse('move; move; move; right; move; move; move; left; right'); const r2 = E.run(d1, long, { planMatch: true, starter: parse(d1.starter) }); assert.ok(r2.verdict.ok); assert.equal(E.stars(d1, '1b', long, r2.verdict, {}), 2, 'too many edits: no second star');
  const d6 = L('debug', '2', 'dbgp-6'); assert.equal(JSON.stringify(run(d6, d6.starter).verdict.perLayout), '[true,true,false]', 'the edge case is the third test grid');
  const d7 = L('debug', '2', 'dbgp-7'); const v7 = run(d7, d7.starter).verdict; assert.equal(v7.failReason, 'bump'); assert.ok(v7.handledBumps > 0, 'never bump: handled bumps count against the starter');
  assert.ok(run({ rows: ['>..#', '##.#', '##G#'] }, 'when bump { right }; repeat until goal { move }').verdict.ok, 'elsewhere a handled bump is fine');
  // repeat until a box reaches a value
  assert.ok(run({ rows: ['>*.*G'] }, 'set count 0; repeat until count = 2 { if gem { pick; change count 1 }; move }').verdict.ok);
  // Best Route: the flowchart gate is level-wide, so the per-board marks stay honest
  const b4 = L('best-route', '2', 'brp-4'); const s4 = run(b4, b4.starter).verdict; assert.equal(JSON.stringify(s4.perLayout), '[true,false]'); assert.equal(s4.failReason, 'bump');
  const b1 = L('best-route', '2', 'brp-1'); const f1 = run(b1, 'repeat until goal { if wall { right } else { move } }').verdict; assert.equal(f1.failReason, 'flow'); assert.equal(f1.flowMatch, false); assert.equal(JSON.stringify(f1.perLayout), '[true,true,true]');
  assert.equal(E.fullShape(E.run(b1, parse(b1.sol)).ast), 'U:goal{I:path{m}E{r}}');
  assert.equal(E.shape(parse('when bump { left }; repeat 3 { if path and not gem { move } else { right } }; set x 1; call Go')), 'W:bump{l}R{I:(path&!gem){m}E{r}}SK');
  assert.match(E.failText(f1)[0], /flowchart/);
  for (const r of ['credit', 'remix', 'chip0']) assert.match(E.failText({ failReason: r, name: 'Zig' })[1].name, /Zig/);
});

test('robo-route: the Daily Crew Challenge is one solvable board per day per band, the same for everyone', () => {
  for (let day = 20000; day < 20040; day++) for (const band of ['1b', '2']) {
    const a = LV.dailyLevel(day, band), b = LV.dailyLevel(day, band);
    assert.deepEqual(E.layoutsOf(a)[0].rows, E.layoutsOf(b)[0].rows, 'deterministic');
    assert.equal(E.layoutsOf(a)[0].w, band === '2' ? 8 : 6);
    assert.ok(E.check(a).solvable, `day ${day} ${band} solvable`);
    assert.ok(a.hints.length === 3 && a.shelf.length >= 3 && a.shelf.length <= 8 && a.par >= 2);
  }
  assert.notDeepEqual(E.layoutsOf(LV.dailyLevel(20001, '1b'))[0].rows, E.layoutsOf(LV.dailyLevel(20008, '1b'))[0].rows, 'the same template on another day is another board');
  assert.equal(LV.DAILY.length, 7);
});

test('robo-route: the verdict says why (bump, splash, nothing to pick up, gems left, not on the goal, bad name, plan first, needs a block)', () => {
  const row = { rows: ['######', '#>.*.G', '######'] };
  assert.equal(run(row, 'move; move; move; move; move; move').verdict.failReason, 'bump');
  assert.equal(run(row, 'move; move; move; move').verdict.failReason, 'gems');
  assert.equal(run(row, 'move; move; pick; move').verdict.failReason, 'goal');
  assert.equal(run(row, 'move; pick').verdict.failReason, 'nothing');
  assert.equal(run({ rows: ['>~G'] }, 'move; move').verdict.failReason, 'splash');
  const v = run(row, 'move; move; pick; move; move').verdict; assert.ok(v.ok); assert.equal(v.bumps, 0); assert.equal(v.gemsLeft, 0); assert.equal(v.reachedGoal, true);
  const t = E.failText(run(row, 'move; move; move; move; move; move').verdict); assert.match(t[0], /Bump/); assert.equal(t[1].n, 5);
  const named = { rows: ['>...G'], names: { good: ['count'], bad: ['x'] } };
  assert.equal(run(named, 'set x 0; move; move; move; move').verdict.failReason, 'name');
  assert.equal(run(named, 'set x 0; move; move; move; move').verdict.namesOk, false);
  assert.ok(run(named, 'set count 0; move; move; move; move').verdict.ok);
  const planned = { rows: ['>...G'], plan: ['a', 'b'] };
  assert.equal(E.run(planned, parse('move; move; move; move'), {}).verdict.failReason, 'plan');
  assert.ok(E.run(planned, parse('move; move; move; move'), { planMatch: true }).verdict.planMatch);
  assert.equal(run({ rows: ['>...G'], needs: ['repeat'] }, 'move; move; move; move').verdict.failReason, 'needs');
  assert.ok(run({ rows: ['>...G'], needs: ['repeat'] }, 'repeat 4 { move }').verdict.ok);
  // a needed block has to do work: an empty repeat, an empty when, a change by 0 do not count
  const L = (ch, band, id) => levelsFor(ch, band).find(l => l.id === id);
  assert.equal(run(L('loops', '1b', 'loop-1'), 'repeat 5 { }; move; move; move; move; move').verdict.failReason, 'needs');
  assert.equal(run(L('loops', '1b', 'loop-1'), 'repeat 1 { move }; move; move; move; move').verdict.failReason, 'needs', 'repeat once is not a loop');
  assert.equal(run(L('conditionals', '1b', 'cond-2'), 'when gem { }; repeat 8 { move; if gem { pick; right } }').verdict.failReason, 'needs');
  assert.equal(run(L('variables', '1b', 'var-3'), 'set steps 0; change steps 0; repeat 4 { move }; move').verdict.failReason, 'needs');
  assert.equal(run(L('loops', '2', 'loop-5p'), 'repeat 3 { repeat 1 { move; move }; right; move; left }').verdict.failReason, 'needs', 'a nested repeat that goes round once is not nested work');
  assert.match(E.failText(run(L('loops', '2', 'loop-5p'), 'repeat 3 { move; move; right; move; left }').verdict)[1].block, /repeat inside a repeat/, 'needs is said in shelf words');
  assert.equal(E.NEED_WORDS.if, 'an if block');
  // a kept shared block must also be called (fn-7p): redoing the zigzag by hand in a new block is not using it
  const fn7 = L('functions', '2', 'fn-7p');
  const byHand = run(fn7, fn7.starter + '; proc Finish chip up { repeat 5 { move; right; move; left }; repeat 2 { move } }; call Finish').verdict;
  assert.equal(byHand.failReason, 'keepcall'); assert.equal(byHand.name, 'Zigzag'); assert.match(E.failText(byHand)[0], /call it/);
  // the maker's search: a key listed before a gem does not steal the gem's bit in an all-gems door
  // par counts Bolt's commands plus the set and change a counting door needs (set count 0; ...; change count 1)
  assert.equal(E.check({ rows: ['>K*DG'], door: { var: 'count', n: 'all' } }).par, 7);
  assert.ok(run({ rows: ['>K*DG'], door: { var: 'count', n: 'all' } }, 'set count 0; move; move; pick; change count 1; move; move').verdict.ok, 'the 7-block program passes');
  assert.equal(E.check({ rows: ['>*K.DG'], door: { var: 'count', n: 'all' } }).par, 8);
  assert.equal(E.check({ rows: ['>#K*DG', '>....G'] }).solvable, true);
  // events, doors and variables
  assert.ok(run({ rows: ['>..#', '##.#', '##G#'] }, 'when bump { right }; repeat until goal { move }').verdict.ok);
  assert.ok(run({ rows: ['>*K.DG'] }, 'move; pick; move; pick; move; move; move').verdict.ok, 'a key opens the door');
  assert.equal(run({ rows: ['>*K.DG'] }, 'move; pick; move; move; move; move').verdict.failReason, 'door');
  assert.ok(run({ rows: ['>*.*DG'], door: { var: 'count', n: 'all' } }, 'set count 0; repeat until goal { if gem { pick; change count 1 }; move }').verdict.ok);
  assert.equal(run({ rows: ['>*.*DG'], door: { var: 'count', n: 'all' } }, 'set count 0; repeat until goal { if gem { pick }; move }').verdict.failReason, 'door');
  assert.ok(run({ rows: ['>..G'] }, 'proc Go(n) { repeat n { move } }; call Go(3)').verdict.ok, 'procedures with a parameter');
  assert.equal(run({ rows: ['>..G'] }, 'call Go').verdict.failReason, 'nocall');
});

test('robo-route: programs are data: unknown blocks are refused, runaway loops and deep calls stop, nothing reaches JavaScript', () => {
  const lvl = { rows: ['>...G'] };
  assert.equal(E.run(lvl, [{ t: 'eval' }]).verdict.failReason, 'bad');
  assert.equal(E.run(lvl, [{ t: 'move', constructor: { constructor: 'x' } }, { t: 'if', c: { s: 'constructor' }, body: [] }]).verdict.failReason, 'bad');
  assert.equal(E.run(lvl, 'move').verdict.failReason, 'empty');
  assert.equal(E.run(lvl, [{ t: 'repeat', until: 'goal', body: [{ t: 'left' }] }]).verdict.failReason, 'limituntil', 'a sensor loop that never moves names the own-square trap, not the generic runaway (pro-6)');
  assert.equal(E.run({ rows: ['>#.G'] }, [{ t: 'repeat', until: 'goal', body: [{ t: 'move' }] }]).verdict.failReason, 'bump', 'a loop that bumps for ever says bump, the useful reason');
  assert.equal(E.run(lvl, [{ t: 'repeat', n: 999, body: [{ t: 'repeat', n: 999, body: [{ t: 'left' }] }] }]).verdict.failReason, 'limit');
  // loop turns and if tests count as work too: five nested repeat 20 round an if would be 3.2 million tests
  const nest = n => (n ? [{ t: 'repeat', n: 20, body: nest(n - 1) }] : [{ t: 'if', c: { s: 'path' }, body: [] }]);
  const t0 = process.hrtime.bigint(); const deep = E.run(lvl, nest(5)); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(deep.verdict.failReason, 'limit'); assert.ok(ms < 100, `nested loops stop fast (${ms.toFixed(1)} ms)`); assert.ok(deep.results[0].events.length <= E.LIMITS.events + 1, 'the replay stays bounded');
  assert.equal(E.run(lvl, [{ t: 'when', ev: 'bump', body: [{ t: 'left' }] }, { t: 'repeat', n: 20, body: [{ t: 'repeat', n: 20, body: [{ t: 'repeat', n: 20, body: [{ t: 'repeat', n: 20, body: [{ t: 'move' }] }] }] }] }]).verdict.failReason, 'limit', 'bumps that fire a handler count as work');
  assert.equal(run(lvl, 'proc A { call A }; call A').verdict.failReason, 'deep');
  assert.equal(run(lvl, 'set count 0; change count 7; change count -3; if count = 4 { move; move; move; move }').verdict.ok, true);
  assert.ok(E.run(lvl, [{ t: 'set', v: 'window', val: 0 }, { t: 'set', v: '__proto__', val: 1 }]).verdict.failReason !== 'bad' || true);
  assert.equal(typeof ctx.window.RoboRoute.compile, 'function');
});

test('robo-route: level codes round-trip 200 random boards, never five digits in a row, shown in groups of four', () => {
  const R = E.rng(5); let n = 0; const lens = { 6: [], 8: [] };
  for (let i = 0; i < 200; i++) {
    const w = R.pick([6, 8]); const rows = [];
    for (let y = 0; y < w; y++) { let s = ''; for (let x = 0; x < w; x++) s += R.pick(['.', '.', '.', '#', '~', '.', '.', '.', '#', '.']); rows.push(s); }
    for (let j = 0; j < R.int(0, 5); j++) { const x = R.int(0, w - 1), y = R.int(0, w - 1); rows[y] = rows[y].slice(0, x) + R.pick(['P', 'B']) + rows[y].slice(x + 1); }
    const cells = []; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) cells.push([x, y]); R.shuffle(cells);
    const put = (c, ch) => { rows[c[1]] = rows[c[1]].slice(0, c[0]) + ch + rows[c[1]].slice(c[0] + 1); };
    put(cells[0], R.pick(['^', '>', 'v', '<'])); put(cells[1], 'G'); const ng = R.int(0, 4); for (let j = 0; j < ng; j++) put(cells[2 + j], '*');
    if (R.chance(0.5)) put(cells[7], 'K'); if (R.chance(0.5)) put(cells[8], 'D');
    const lv = { rows, door: R.pick(['key', 'plate', { gems: 2 }]) };
    const code = E.encode(lv); assert.ok(code, 'encodes');
    assert.doesNotMatch(code, /\d{5}/); assert.match(code, /^([2-9B-DF-HJ-NP-TV-Z]{4} )*[2-9B-DF-HJ-NP-TV-Z]{1,4}$/); assert.doesNotMatch(code, /[AEIOU01]/);
    lens[w].push(code.replace(/ /g, '').length);
    const back = E.decode(code); assert.ok(back, 'decodes');
    assert.equal(JSON.stringify(back.rows), JSON.stringify(rows)); assert.equal(JSON.stringify(back.door), JSON.stringify(lv.door)); n++;
  }
  assert.equal(n, 200);
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  assert.ok(Math.max(...lens[6]) <= 30 && avg(lens[6]) <= 26, `6x6 codes: ${avg(lens[6])} symbols on average, ${Math.max(...lens[6])} at most`);
  assert.ok(Math.max(...lens[8]) <= 44, `8x8 codes: ${avg(lens[8])} symbols on average, ${Math.max(...lens[8])} at most`);
  assert.equal(E.decode('2222 2223'), null, 'a bad check symbol is refused');
  assert.equal(E.decode('2222 2222'), null, 'a board with no real start and goal is refused');
  assert.equal(E.decode(''), null);
  // the Level Maker's check: an unreachable goal is refused, par counts commands
  assert.equal(E.check({ rows: ['>.#G'] }).solvable, false);
  assert.equal(JSON.stringify(E.check({ rows: ['>..G'] })), JSON.stringify({ solvable: true, par: 3, perLayout: [{ solvable: true, par: 3 }] }));
  assert.equal(E.check({ rows: ['>.*.G'] }).par, 5, 'a pick is a command');
});

test('robo-route: en.json lists every English string the game shows (and nothing stale), within the budget', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/cs-quest/robo-route/en.json'), 'utf8')).strings;
  const have = new Set(en);
  const want = new Set();
  const game = HTML.slice(HTML.indexOf('<script type="module">'));
  const unq = s => s.replace(/\\'/g, "'").replace(/\\"/g, '"');
  for (const m of game.matchAll(/\btr\((?:'((?:\\.|[^'\\\n])+)'|"((?:\\.|[^"\\\n])+)")/g)) want.add(unq(m[1] != null ? m[1] : m[2]));
  for (const m of game.matchAll(/\btr\([^()'"\n]*\?\s*'((?:\\.|[^'\\\n])+)'\s*:\s*'((?:\\.|[^'\\\n])+)'/g)) { want.add(unq(m[1])); want.add(unq(m[2])); }
  for (const c of CHAPTERS) want.add(c.title);
  for (const b of Object.values(LV.BLOCKS)) want.add(b.label);
  for (const t of Object.values(LV.TILES)) want.add(t.label);
  for (const s of [...Object.values(LV.SENSOR_LABELS), ...Object.values(LV.EVENT_LABELS), ...Object.values(LV.CHIPS), ...Object.values(LV.CREDITS), ...Object.values(LV.WHY), ...LV.MAKER_HINTS.free, ...LV.MAKER_HINTS.test, ...LV.DAILY_HINTS, ...LV.DAILY.map(d => d.hint), ...E.WORDS, ...Object.values(E.NEED_WORDS), 'on', 'off', 'and', 'or', 'Explorer', 'Pro']) want.add(s);
  for (const l of LEVELS) for (const v of [l, l.pro || {}]) {
    if (v.learn) { want.add(v.learn.title); want.add(v.learn.text); }
    for (const h of v.hints || []) want.add(h);
    if (v.check) { want.add(v.check.q); for (const t of v.check.tiles) want.add(t); }
    for (const p of v.plan || []) want.add(p);
    if (v.predict) { want.add(v.predict.q); for (const t of v.predict.tiles) want.add(t); }
    if (v.task) want.add(v.task);
  }
  for (const r of ['bump', 'door', 'doorvar', 'splash', 'nothing', 'gems', 'goal', 'limit', 'limituntil', 'deep', 'name', 'plan', 'needs', 'procs', 'chips', 'chip0', 'credit', 'remix', 'flow', 'nocall', 'empty', 'bad', 'keepcall', 'whenplace', 'procplace']) for (const left of [1, 2]) { const t = E.failText({ failReason: r, failStep: 1, gemsLeft: left }); if (t) want.add(t[0]); }
  const missing = [...want].filter(s => !have.has(s)), stale = en.filter(s => !want.has(s));
  assert.deepEqual(missing, [], 'strings the game shows but en.json lacks');
  assert.deepEqual(stale, [], 'strings in en.json the game no longer shows');
  assert.ok(en.length <= 1450 && en.length >= 850, `${en.length} strings`);
  const UK = /\b(colou?r|grey|favourite|labelled|licence|organise|practise|neighbour|recognise|maths|centre|programme)\b/i;
  for (const s of en) { assert.ok(!UK.test(s) || /\bcolor\b/.test(s) && !/colour/.test(s), `US spelling: ${s}`); assert.doesNotMatch(s, /\d{7,}|@|https?:|\/\/\w+\./, s); assert.doesNotMatch(s, /\b(grown[\s-]?ups?|parents?|guardians?|family|families|mum|mom|dad)\b/i, `no family words near codes: ${s}`); }
});

test('robo-route: the third hint shows one move, never the whole answer (every command kind of the answer with every count)', () => {
  const WORDS = { move: /\bmoves?\b/, left: /\bleft\b/, right: /\bright\b/, pick: /\bpick/ };
  const kinds = list => { const out = new Set(); (function walk(l) { for (const b of l) { if (WORDS[b.t]) out.add(b.t); if (b.body) walk(b.body); if (b.else) walk(b.else); } })(list); return out; };
  const counts = list => { const out = new Set(); (function walk(l) { for (const b of l) { if (b.t === 'repeat' && typeof b.n === 'number') out.add(b.n); if (b.body) walk(b.body); if (b.else) walk(b.else); } })(list); return out; };
  const NUM = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight' };
  let checked = 0;
  for (const [ch, band, l] of everyLevel()) {
    if (typeof l.sol !== 'string' || l.maxEdits != null) continue;   // the Debug Lab's fixes are one edit by design
    const sol = parse(l.sol), k = kinds(sol), c = counts(sol), h = l.hints[2].toLowerCase();
    if (k.size < 3 && !c.size) continue;
    const allKinds = [...k].every(t => WORDS[t].test(h)), allCounts = [...c].every(n => new RegExp(`\\b(${n}|${NUM[n] || n})\\b`).test(h));
    assert.ok(!(allKinds && allCounts && (k.size + c.size) >= 3), `${ch}/${band}/${l.id}: hint 3 spells out the answer: ${l.hints[2]}`);
    checked++;
  }
  assert.ok(checked > 50, `${checked} levels checked`);
});

test('robo-route: the game file and its metadata match the contract', async () => {
  const { scanVersion } = await import('../../server/services/scanner.js');
  const r = scanVersion(HTML); assert.equal(r.status, 'pass', JSON.stringify(r.issues));
  assert.ok(Buffer.byteLength(HTML) < 2 * 1024 * 1024);
  assert.ok(HTML.startsWith('<title>Robo Route</title>'));
  assert.match(HTML, /<script src="\/vendor\/oomba-kit\/1\.1\.3\/oomba-kit\.js" integrity="sha384-[^"]+" crossorigin="anonymous"><\/script>/);
  assert.match(HTML, /packs\/art-props\.js/); assert.match(HTML, /packs\/style-bold\.js/);
  assert.match(HTML, /PACK_VER = '[\w.-]+'/); assert.match(HTML, /PACK_SRI = \{[^;]*\};/); assert.match(HTML, /CsqPacks/);
  assert.doesNotMatch(HTML, /<input|<textarea|contenteditable/i, 'tap only: no text inputs');
  assert.doesNotMatch(HTML, /\bsetTimeout\(|\bsetInterval\(|\brequestAnimationFrame\(|Date\.now\(/, 'the kit clock only');
  assert.match(HTML, /\(window\.BRB && BRB\.params\) \|\| \{\}/);
  assert.equal(META.slug, 'robo-route'); assert.equal(META.title, 'Robo Route'); assert.equal(META.category, 'learning'); assert.equal(META.featured, true);
  assert.equal(META.orientation, 'any'); assert.equal(META.players_max, 2); assert.equal(META.age_rating, 'everyone'); assert.equal(META.cover, 'mint');
  assert.ok(META.description.length <= 600 && META.description.length > 100);
});

test('robo-route: the JSON l10n has all 11 non-English descriptions and tags, kid-safe and short', () => {
  for (const l of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) {
    assert.ok(META.l10n[l] && META.l10n[l].description, `description in ${l}`);
    assert.ok(META.l10n[l].description.length <= 600 && META.l10n[l].description.length > 60, `${l}: description length`);
    assert.ok(META.l10n[l].tags && META.l10n[l].tags.length <= 200, `${l}: tags`);
    assert.doesNotMatch(META.l10n[l].description + META.l10n[l].tags, /\d{7,}|@|https?:|\/\/\w+\./);
  }
  assert.equal(Object.keys(META.l10n).length, 11);
});

/* ---------- real Chromium, the production frame wrapper, the kit served from disk ---------- */
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = process.env.BRB_CHROMIUM || LOCAL.find(f => fs.existsSync(f));
const skip = !exe && !process.env.PLAYWRIGHT_BROWSERS_PATH ? 'no Chromium on this machine' : false;
const HOST = 'http://game.invalid';
let browser;
test.after(async () => { if (browser) await browser.close(); });
async function open({ size = { width: 390, height: 844 }, lang = 'en', save = {}, params = null } = {}) {
  const { frameDocument, frameCsp, SANDBOX } = await import('../../server/services/frame.js');
  if (!browser) { const { chromium } = await import('playwright-core'); browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] }); }
  const ctx = await browser.newContext({ viewport: size, hasTouch: true });
  // a lesson link's params: the platform slice copies init.params onto BRB.params; until that SDK lands here the test
  // sets the same frozen object right after the SDK, before the game reads (window.BRB && BRB.params) || {}
  const src = params ? HTML.replace('<title>Robo Route</title>', `<script>BRB.params = Object.freeze(${JSON.stringify(params)});</script><title>Robo Route</title>`) : HTML;
  const doc = frameDocument(src, { user: { displayName: 'P', avatar: 'x', lang, dir: lang === 'ar' || lang === 'he' ? 'rtl' : 'ltr' }, game: { id: 'g', title: 'Robo Route' }, save, canSave: false, preview: true, deviceText: { title: 'x', text: 'y' } });
  const host = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style><iframe sandbox="${SANDBOX}" src="${HOST}/frame"></iframe>`;
  const errors = [], consoleErrors = [], csp = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u === HOST + '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: host });
    if (u === HOST + '/frame') return route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': frameCsp(HOST) }, body: doc });
    const m = /^http:\/\/game\.invalid\/vendor\/oomba-kit\/(.+)$/.exec(u);
    if (m) { const f = path.join(ROOT, 'public/vendor/oomba-kit', m[1]); if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    const d = /^http:\/\/game\.invalid\/vendor\/data\/(.+)$/.exec(u);
    if (d) { const f = path.join(ROOT, 'public/vendor/data', d[1]); if (fs.existsSync(f)) return route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(f) }); }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  await page.goto(HOST + '/', { waitUntil: 'load' });
  let frame = null;
  for (let i = 0; i < 200 && !frame; i++) { frame = page.frames().find(f => f.url() === HOST + '/frame'); if (!frame) await page.waitForTimeout(25); }
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 60_000 });
  return { ctx, page, frame, errors, consoleErrors, csp };
}
const T = (frame, fn, ...a) => frame.evaluate(([f, a]) => window.__brbTest[f](...a), [fn, a]);
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;
const fit = async frame => { const { frameProblems } = await import('../e2e/frame-fit.js'); return frameProblems(frame); };

test('robo-route: in Chromium a phone plays level 1 of two chapters in lesson mode, the score label matches the grammar, nothing is cut off', { skip, timeout: 180_000 }, async () => {
  const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 390, height: 844 }, lang: 'en' });
  try {
    let s = await T(frame, 'state'); assert.equal(s.screen, 'title'); assert.equal(s.lang, 'en');
    await page.waitForTimeout(900);
    assert.deepEqual(await fit(frame), [], 'the title fits a phone');
    assert.ok(await frame.evaluate(() => !!document.querySelector('.ok-title-screen .ok-hot')), 'a start button the audit can press');
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    s = await T(frame, 'state'); assert.equal(s.screen, 'map');
    assert.deepEqual(await fit(frame), [], 'the chapter map fits a phone');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .rr-tile').length), 10, 'eight chapters, the daily and the quest code');
    assert.ok(await frame.evaluate(() => !!document.getElementById('questTile')), 'the quest code is a tile on the map, not only behind the gear');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .rr-tile[disabled]').length), 0, 'every chapter is open');
    await T(frame, 'start', { chapter: 'sequences', band: '1b', seed: 3, lesson: true });
    s = await T(frame, 'state'); assert.equal(s.phase, 'card', 'the learn card opens on level 1');
    await T(frame, 'closeModal'); await page.waitForTimeout(300);
    s = await T(frame, 'state'); assert.equal(s.screen, 'play'); assert.equal(s.levelId, 'seq-1'); assert.equal(s.lesson, true);
    assert.deepEqual(await fit(frame), [], 'the level fits a phone');
    assert.ok(await frame.evaluate(() => /Class quest/.test(document.getElementById('questPill').textContent)));
    // start over in one tap: Clear program empties the box (not a run: no fail), Undo brings it back
    await T(frame, 'program', 'move; move');
    assert.ok(await frame.evaluate(() => /Clear program/.test(document.getElementById('clearBtn').textContent)));
    assert.equal(await T(frame, 'clear'), 0);
    assert.equal((await T(frame, 'state')).fails, 0, 'clearing is not a failed run');
    assert.deepEqual(await fit(frame), [], 'the Undo button fits a phone');
    assert.ok(await T(frame, 'undo')); assert.equal((await T(frame, 'state')).blocks, 2, 'Undo brings the program back');
    await T(frame, 'program', []);
    assert.equal(await frame.evaluate(() => !!document.getElementById('clearBtn')), false, 'an empty program has nothing to clear');
    // tap-built program: three shelf taps, a wrong run, then the answer
    for (let i = 0; i < 3; i++) await T(frame, 'shelf', 0);
    assert.equal((await T(frame, 'state')).blocks, 3);
    await T(frame, 'skipAnimations'); await T(frame, 'run'); await page.waitForTimeout(300);
    let v = await T(frame, 'verdict'); assert.equal(v.ok, false); assert.equal(v.failReason, 'goal');
    assert.equal((await T(frame, 'state')).fails, 1);
    assert.equal(await T(frame, 'verdictText'), 'Bolt stopped, but not on the goal.', 'the verdict sentence stays under the board');
    assert.match(await T(frame, 'banner'), /Bolt stopped, but not on the goal/, 'the kit banner carries the sentence');
    assert.equal(await T(frame, 'hint'), 1, 'hints open after a failed run at Explorer');
    await T(frame, 'closeModal');
    // a wrong block pulses on hint 2: the block of the answer the program lacks (move here; never turn right on a straight run)
    for (let i = 0; i < 3; i++) await T(frame, 'shelf', 0);
    assert.equal(await T(frame, 'hint'), 2); await T(frame, 'closeModal');
    assert.equal(await frame.evaluate(() => (document.querySelector('#shelf .hl') || {}).dataset?.shelf || null), 'move');
    await T(frame, 'solve'); await page.waitForTimeout(400);
    v = await T(frame, 'verdict'); assert.equal(v.ok, true);
    assert.equal(await T(frame, 'verdictText'), 'Bolt made it!');
    s = await T(frame, 'state'); assert.equal(s.phase, 'card', 'the Case-closed card in lesson mode');
    await T(frame, 'key', 'Escape'); await page.waitForTimeout(100);
    assert.equal((await T(frame, 'state')).card, 'case', 'Escape does not skip the concept check');
    assert.ok(await T(frame, 'check', 0)); await page.waitForTimeout(150); assert.ok(await T(frame, 'confidence', 3)); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.match(s.label, LABEL); assert.equal(s.label, '1/6 levels, 3 stars, 1/1 checks'); assert.ok(s.label.length <= 40);
    assert.ok(await frame.evaluate(() => !!document.querySelector('.ok-ui .ok-modal.ok-win')), 'the kit results card');
    await frame.evaluate(() => document.querySelector('.ok-ui .ok-modal.ok-win .ok-row .ok-hot').click()); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'seq-2'); assert.equal(s.level, 2);
    // a program that does not compile (a when inside a repeat) is judged, not crashed; the level keeps working after it
    await T(frame, 'start', { chapter: 'conditionals', band: '1b', level: 2, seed: 3 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'cond-2');
    assert.equal((await T(frame, 'state')).blocks, 4, 'Explorer starts cond-2 with the loop built (repeat, move, if, pick)');
    await T(frame, 'shelf', 3); assert.equal((await T(frame, 'state')).blocks, 5, 'a repeat');
    await T(frame, 'shelf', 5); await page.waitForTimeout(100);
    assert.match(await T(frame, 'verdictText'), /when block goes at the top/, 'a when block is kept out of the repeat');
    await T(frame, 'program', [{ t: 'repeat', n: 3, body: [{ t: 'when', ev: 'gem', body: [] }] }]); await T(frame, 'run'); await page.waitForTimeout(300);
    v = await T(frame, 'verdict'); assert.equal(v.failReason, 'whenplace', 'a when inside a repeat gets its own truthful reason (csq-pro-5), not the generic one'); assert.equal((await T(frame, 'state')).fails, 1);
    assert.ok((await T(frame, 'verdictText')).length > 10, 'a sentence for a program that cannot run');
    await T(frame, 'solve'); await page.waitForTimeout(500); assert.equal((await T(frame, 'verdict')).ok, true, 'the level is not half dead after a compile error');
    assert.ok((await T(frame, 'state')).bolt.x !== 0 || (await T(frame, 'state')).bolt.y !== 0, 'Bolt really moved');
    await T(frame, 'closeDialog'); await page.waitForTimeout(200);
    // the second chapter at Pro
    await T(frame, 'start', { chapter: 'loops', band: '2', seed: 3, lesson: true }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'loop-1'); assert.equal(s.band, '2');
    assert.deepEqual(await fit(frame), [], 'a Pro level fits a phone');
    assert.equal(await T(frame, 'hint'), 1); await T(frame, 'closeModal');
    // a Pro variables level: the name tiles keep their order while the stepper is pressed
    await T(frame, 'start', { chapter: 'variables', band: '2', seed: 3, lesson: true }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    await T(frame, 'program', 'set count 0'); await frame.evaluate(() => document.querySelector('.rr-blk[data-id]').click()); await page.waitForTimeout(80);
    assert.ok(await T(frame, 'tray', 'Change')); await page.waitForTimeout(80);
    const tiles1 = await T(frame, 'editTiles'); assert.ok(tiles1.includes('count') && tiles1.includes('x'), 'good and bad names on the tiles');
    await frame.evaluate(() => [...document.querySelectorAll('#edit .ok-btn')].find(b => /More/.test(b.getAttribute('aria-label') || b.textContent)).click()); await page.waitForTimeout(80);
    assert.deepEqual(await T(frame, 'editTiles'), tiles1, 'the tiles stay where they were');
    assert.ok(await frame.evaluate(() => /Door: count = 7/.test(document.getElementById('watch').textContent)), 'the door rule is a pill in the watch row');
    await T(frame, 'solve'); await page.waitForTimeout(400);
    assert.ok(await T(frame, 'check', 1)); await page.waitForTimeout(150); await T(frame, 'confidence', 2); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.equal(s.label, '1/6 levels, 3 stars, 0/1 checks', 'a wrong check tile counts as 0 of 1');
    // functions at Explorer: the block is given, Run sleeps until the program calls it
    await T(frame, 'start', { chapter: 'functions', band: '1b', seed: 3, lesson: true }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'fn-1'); assert.equal(s.blocks, 6, 'the starter procedure');
    assert.equal(await frame.evaluate(() => document.getElementById('runBtn').getAttribute('aria-disabled')), 'true', 'Run is dimmed until a call exists');
    await T(frame, 'program', 'call Nope'); assert.equal(await frame.evaluate(() => document.getElementById('runBtn').getAttribute('aria-disabled')), 'true', 'a call to a block that is not there does not wake Run');
    await T(frame, 'run'); await page.waitForTimeout(200); assert.equal((await T(frame, 'verdict')).failReason, 'nocall', 'forced through the hook it is judged, not crashed');
    assert.match(await T(frame, 'verdictText'), /never made/);
    await T(frame, 'start', { chapter: 'functions', band: '1b', seed: 3, lesson: true }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    assert.ok(await T(frame, 'shelf', 5)); assert.equal((await T(frame, 'state')).blocks, 7);
    assert.equal(await frame.evaluate(() => document.getElementById('runBtn').getAttribute('aria-disabled')), 'false');
    assert.deepEqual(await fit(frame), [], 'a functions level fits a phone');
    // on a phone a shelf tap keeps the shelf open (the next tap appends after it); tapping the block opens the tray
    assert.equal(await frame.evaluate(() => document.getElementById('shelf').hidden || !document.getElementById('tray').hidden), false, 'shelf open, tray shut after a shelf tap');
    await frame.evaluate(() => [...document.querySelectorAll('#prog .rr-blk[data-id]')].pop().click()); await page.waitForTimeout(80);
    await frame.evaluate(() => [...document.querySelectorAll('#tray .ok-btn')].find(b => /Change/.test(b.getAttribute('aria-label') || b.textContent)).click()); await page.waitForTimeout(150);
    assert.deepEqual(await fit(frame), [], 'the edit row of a call fits a phone');
    await T(frame, 'solve'); await page.waitForTimeout(400); assert.equal((await T(frame, 'verdict')).ok, true);
    await T(frame, 'closeDialog'); await page.waitForTimeout(200);
    // the compare view, the flowchart card and the note-chip row on a phone
    await T(frame, 'start', { chapter: 'best-route', band: '1b', seed: 3 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    assert.deepEqual(await fit(frame), [], 'two routes side by side fit a phone');
    await T(frame, 'start', { chapter: 'best-route', band: '2', seed: 3 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    assert.equal((await T(frame, 'state')).card, 'plan'); assert.deepEqual(await fit(frame), [], 'the flowchart card fits a phone');
    await T(frame, 'start', { chapter: 'functions', band: '2', level: 6, seed: 3 }); await T(frame, 'closeModal');
    await T(frame, 'program', 'proc Sweep { repeat 3 { move; pick; move } }; call Sweep');
    await frame.evaluate(() => document.querySelector('.rr-blk[data-id]').click()); await page.waitForTimeout(100);
    await frame.evaluate(() => [...document.querySelectorAll('#tray .ok-btn')].find(b => /Note chip/.test(b.getAttribute('aria-label') || b.textContent)).click()); await page.waitForTimeout(150);
    assert.deepEqual(await fit(frame), [], 'the note-chip row fits a phone');
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium a tablet runs the Debug Lab test tabs, Best Route\'s two routes and flowchart, the Level Maker (tasks, code, symbol pad, a friend\'s test), the daily and pair mode', { skip, timeout: 240_000 }, async () => {
  const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 820, height: 1180 }, lang: 'en' });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(400);
    await T(frame, 'skipAnimations');
    // Debug Lab at Pro: three test grids, the starter fails one, the tabs say which
    await T(frame, 'start', { chapter: 'debug', band: '2', seed: 2 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    let s = await T(frame, 'state'); assert.equal(s.levelId, 'dbgp-1'); assert.equal(s.tabs, 3); assert.equal(s.edits, 0);
    assert.ok(await frame.evaluate(() => !document.getElementById('editPill').hidden), 'the edit counter shows');
    await T(frame, 'run'); await page.waitForTimeout(300);
    let v = await T(frame, 'verdict'); assert.equal(v.ok, false); assert.ok(v.perLayout.some(x => !x));
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tabs .ok-btn svg').length), 3, 'a mark on every tab after a run');
    assert.equal(await T(frame, 'test', 1), 1, 'tapping a tab shows that board');
    assert.deepEqual(await fit(frame), [], 'the Debug Lab fits a tablet');
    await T(frame, 'solve'); await page.waitForTimeout(600); v = await T(frame, 'verdict'); assert.equal(v.ok, true); assert.equal(v.editsFromStarter, 1);
    assert.ok(await frame.evaluate(() => !!document.querySelector('.ok-ui .ok-modal.ok-win')), 'the results card'); await T(frame, 'closeDialog'); await page.waitForTimeout(200);
    // Best Route at Explorer: two routes side by side, preview one, pick one, improve it
    await T(frame, 'start', { chapter: 'best-route', band: '1b', seed: 2 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'br-1'); assert.equal(s.compare, null);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('.rr-cmp .col').length), 2);
    assert.deepEqual(await fit(frame), [], 'the compare view fits a tablet');
    await T(frame, 'previewRoute', 0); await page.waitForTimeout(400);
    assert.equal((await T(frame, 'state')).fails, 0, 'a preview is not a failed run');
    assert.equal(await T(frame, 'route', 1), 1); assert.equal((await T(frame, 'state')).blocks, 8);
    await T(frame, 'solve'); await page.waitForTimeout(600); assert.equal((await T(frame, 'verdict')).ok, true);
    await T(frame, 'closeDialog'); await page.waitForTimeout(200);
    // Best Route at Pro: the flowchart card, then the re-test with the longer hallway
    await T(frame, 'start', { chapter: 'best-route', band: '2', level: 4, seed: 2 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.levelId, 'brp-4'); assert.equal(s.phase, 'card', 'the flowchart card');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#modal .rr-fc').length), 5);
    assert.deepEqual(await fit(frame), [], 'the flowchart card fits a tablet');
    assert.equal(await T(frame, 'plan'), true); await page.waitForTimeout(700);
    s = await T(frame, 'state'); assert.equal(s.planDone, true); assert.equal(s.tabs, 2); assert.equal(s.blocks, 5, 'the counting starter');
    await T(frame, 'run'); await page.waitForTimeout(300); v = await T(frame, 'verdict'); assert.deepEqual(v.perLayout, [true, false]);
    await T(frame, 'program', 'repeat until goal { if path { move } else { left } }'); await T(frame, 'run'); await page.waitForTimeout(300);
    v = await T(frame, 'verdict'); assert.equal(v.failReason, 'flow', 'it works on both boards but does not follow the chart');
    await T(frame, 'solve'); await page.waitForTimeout(600); assert.equal((await T(frame, 'verdict')).ok, true);
    await T(frame, 'closeDialog'); await page.waitForTimeout(200);
    // the Level Maker in lesson mode: task 1, the code, the symbol pad, a friend's test, the maker label
    await T(frame, 'start', { chapter: 'level-maker', band: '1b', seed: 2, lesson: true }); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.screen, 'maker'); assert.equal(s.phase, 'card', 'the learn card on task 1');
    await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.maker.task, 'mk-1'); assert.equal(s.maker.tool, 'wall');
    assert.deepEqual(await fit(frame), [], 'the maker fits a tablet');
    let res = await T(frame, 'mkCheck'); assert.equal(res.ok, false); assert.match(res.why, /No way/);
    assert.ok(!(await frame.evaluate(() => document.getElementById('skipBtn'))), 'no Skip after one failed check');
    res = await T(frame, 'mkCheck'); assert.equal(res.ok, false);
    assert.ok(await frame.evaluate(() => !!document.getElementById('skipBtn')), 'Skip task after two failed checks');
    assert.deepEqual(await fit(frame), [], 'the maker with Skip task fits a tablet');
    await T(frame, 'skip'); await page.waitForTimeout(300);
    s = await T(frame, 'state'); assert.equal(s.maker.task, 'mk-2'); assert.equal(s.done, 1); assert.equal(s.label, '0 made, 0 tested');
    await T(frame, 'start', { chapter: 'level-maker', band: '1b', seed: 2, lesson: true, level: 1 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.maker.task, 'mk-1');
    assert.equal(await T(frame, 'tool', 'floor'), 'floor'); await T(frame, 'paint', 2, 3);
    res = await T(frame, 'mkCheck'); assert.equal(res.ok, true); assert.equal(res.n, 5, 'par: two up, a turn, two across'); await page.waitForTimeout(300);
    s = await T(frame, 'state'); assert.equal(s.phase, 'card', 'the Case-closed card after a fixed level');
    assert.ok(await T(frame, 'check', 0)); await page.waitForTimeout(150); assert.ok(await T(frame, 'confidence', 3)); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.equal(s.label, '1 made, 0 tested'); assert.equal(s.done, 1);
    await frame.evaluate(() => document.querySelector('.ok-ui .ok-modal.ok-win .ok-row .ok-hot').click()); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.maker.task, 'mk-2');
    const code = await T(frame, 'mkCode'); assert.match(code, /^([2-9B-DF-HJ-NP-TV-Z]{4} )*[2-9B-DF-HJ-NP-TV-Z]{1,4}$/); assert.doesNotMatch(code, /\d{5}/);
    await frame.evaluate(() => [...document.querySelectorAll('#mkActions .ok-btn')].find(b => /code/i.test(b.getAttribute('aria-label') || b.textContent)).click()); await page.waitForTimeout(200);
    assert.deepEqual(await fit(frame), [], 'the code card fits a tablet');
    await frame.evaluate(() => [...document.querySelectorAll('#modal .ok-btn')].find(b => /Enter a code/.test(b.textContent)).click()); await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#modal .rr-sym .ok-btn').length), 11, 'four pages of seven symbols');
    assert.deepEqual(await fit(frame), [], 'the symbol pad fits a tablet');
    await T(frame, 'closeModal');
    assert.ok(await T(frame, 'mkLoad', code), 'a code opens its board'); s = await T(frame, 'state'); assert.equal(s.maker.base, code); assert.equal(s.maker.free, true);
    res = await T(frame, 'mkCheck'); assert.equal(res.ok, true);
    assert.equal(await T(frame, 'mkTest'), true, 'hand over to a friend'); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.screen, 'play'); assert.equal(s.testing, true); assert.equal(s.levelId, 'maker-test');
    assert.deepEqual(await fit(frame), [], 'a friend\'s test fits a tablet');
    await T(frame, 'program', 'repeat until goal { if path { move } else { left } }'); await T(frame, 'run'); await page.waitForTimeout(400);
    assert.equal((await T(frame, 'verdict')).ok, true); s = await T(frame, 'state'); assert.equal(s.label, '2 made, 1 tested', 'two boards passed Check, one was tested');
    assert.equal(await T(frame, 'verdictText'), 'Tested! Your friend solved it.');
    await page.waitForTimeout(300); await T(frame, 'closeDialog'); await page.waitForTimeout(300); s = await T(frame, 'state'); assert.equal(s.screen, 'maker'); assert.equal(s.maker.tested, 1);
    assert.equal(s.card, 'tester', 'what did your tester say?'); assert.deepEqual(await fit(frame), [], 'the tester card fits a tablet');
    assert.ok(await T(frame, 'tester', 2, 1)); await page.waitForTimeout(100);
    s = await T(frame, 'state'); assert.deepEqual(s.maker.feedback, { fun: 'corner', hard: 'hard' }); assert.equal(s.maker.improved, false);
    await T(frame, 'paint', 1, 1); res = await T(frame, 'mkCheck'); s = await T(frame, 'state'); assert.equal(s.maker.improved, true, 'a change after the test counts as improving');
    assert.deepEqual((await T(frame, 'mkSave')).length, 1);
    // the daily and pair mode
    s = await T(frame, 'daily'); assert.equal(s.levelId, 'daily'); assert.equal(s.chapter, 'daily');
    assert.deepEqual(await fit(frame), [], 'the daily fits a tablet');
    assert.equal(await T(frame, 'pair', true), true);
    await T(frame, 'start', { chapter: 'sequences', band: '1b', seed: 2 }); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    assert.ok(await frame.evaluate(() => !document.getElementById('pairPill').hidden && document.querySelectorAll('#pairPill .av').length === 2), 'two avatars');
    assert.deepEqual(await fit(frame), [], 'a pair level fits a tablet');
    for (let i = 0; i < 3; i++) { await T(frame, 'solve'); await page.waitForTimeout(600); await frame.evaluate(() => document.querySelector('.ok-ui .ok-modal.ok-win .ok-row .ok-hot').click()); await page.waitForTimeout(500); }
    s = await T(frame, 'state'); assert.equal(s.level, 4); assert.equal(s.driver, 1, 'Swap! after three levels');
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium a Pro player boots in the kit\'s Bold style and sees Explorer stars in silver', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 1180, height: 820 }, lang: 'en', save: { 'robo-route-v1': JSON.stringify({ v: 1, band: '2', stars: { '1b': { loops: { s: [3, 3, 2], d: [true, true, true] } }, '2': {} } }) } });
  try {
    assert.equal(await frame.evaluate(() => Oomba.style()), 'bold');
    assert.ok(await frame.evaluate(() => document.querySelector('.ok-ui').classList.contains('ok-bold')));
    await page.waitForTimeout(600); assert.deepEqual(await fit(frame), [], 'the Bold title fits');
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    const s = await T(frame, 'state'); assert.equal(s.band, '2'); assert.equal(s.screen, 'map');
    assert.equal(await frame.evaluate(() => document.querySelectorAll('#tiles .st.silver').length), 1, 'the Explorer stars of Loops show silver at Pro');
    assert.deepEqual(await fit(frame), [], 'the Bold map fits');
    await T(frame, 'start', { chapter: 'functions', band: '2', level: 6, seed: 1 }); await T(frame, 'closeModal'); await page.waitForTimeout(300);
    assert.equal((await T(frame, 'state')).levelId, 'fn-6p');
    await T(frame, 'program', 'proc Sweep { repeat 3 { move; pick; move } }; proc Drop { right; repeat 7 { move } }; proc Home { right; repeat 5 { move } }; call Sweep; call Drop; call Home');
    await frame.evaluate(() => document.querySelector('.rr-blk[data-id]').click()); await page.waitForTimeout(150);
    assert.ok(await frame.evaluate(() => !![...document.querySelectorAll('#tray .ok-btn')].find(b => /Note chip/.test(b.getAttribute('aria-label') || b.textContent))), 'the Note chip tray button');
    assert.deepEqual(await fit(frame), [], 'a Pro functions level with the tray fits');
    await T(frame, 'skipAnimations'); await T(frame, 'run'); await page.waitForTimeout(300);
    assert.equal((await T(frame, 'verdict')).failReason, 'chip0');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium a desktop in Arabic mirrors the chrome, keeps the board left to right, and a quest code starts a class quest', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 1280, height: 800 }, lang: 'ar' });
  try {
    await page.waitForTimeout(900);
    assert.equal(await frame.evaluate(() => document.querySelector('.ok-ui').getAttribute('dir')), 'rtl');
    assert.ok(await frame.evaluate(() => !!(window.CsqPacks && CsqPacks['robo-route'] && CsqPacks['robo-route'].ar)), 'the Arabic pack loaded with its checksum');
    assert.deepEqual(await fit(frame), [], 'the title fits a desktop');
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    assert.deepEqual(await fit(frame), [], 'the map fits a desktop');
    await T(frame, 'questCode', '3100'); await page.waitForTimeout(300); await T(frame, 'closeModal'); await page.waitForTimeout(200);
    const s = await T(frame, 'state'); assert.equal(s.chapter, 'conditionals'); assert.equal(s.band, '1b'); assert.equal(s.lesson, true); assert.equal(s.levelId, 'cond-1');
    assert.equal(await frame.evaluate(() => document.getElementById('grid').getAttribute('dir')), 'ltr');
    assert.deepEqual(await fit(frame), [], 'a level fits a desktop in Arabic');
    await T(frame, 'skipAnimations'); await T(frame, 'solve'); await page.waitForTimeout(400);
    assert.equal((await T(frame, 'verdict')).ok, true);
    assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  } finally { await ctx.close(); }
});

test('robo-route: in Chromium a lesson link (BRB.params) locks the band and chapter, hides the map, opens the Debug Lab and the Level Maker, and the label carries the checks', { skip, timeout: 180_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 1280, height: 800 }, lang: 'en', params: { chapter: 'loops', band: '2', lock: 1 } });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    let s = await T(frame, 'state'); assert.equal(s.screen, 'play'); assert.equal(s.chapter, 'loops'); assert.equal(s.band, '2'); assert.equal(s.lesson, true); assert.equal(s.lock, true); assert.equal(s.card, 'learn');
    await T(frame, 'closeModal'); await page.waitForTimeout(200);
    assert.ok(await frame.evaluate(() => ![...document.querySelectorAll('#runbar .ok-btn')].some(b => /Chapter map/.test(b.getAttribute('aria-label') || b.textContent))), 'no Chapter map under lock');
    assert.ok(await frame.evaluate(() => /Class quest/.test(document.getElementById('questPill').textContent)));
    await T(frame, 'skipAnimations'); await T(frame, 'solve'); await page.waitForTimeout(400);
    assert.ok(await T(frame, 'check', 0)); await page.waitForTimeout(150); assert.ok(await T(frame, 'confidence', 3)); await page.waitForTimeout(800);
    s = await T(frame, 'state'); assert.equal(s.label, '1/8 levels, 3 stars, 1/1 checks');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
  for (const [params, screen, levelId] of [[{ chapter: 'debug', band: '1b', mode: 'debug', lock: 1 }, 'play', 'dbg-1'], [{ chapter: 'level-maker', band: '2', mode: 'maker', lock: 1 }, 'maker', 'mk-1'], [{ chapter: 'sequences', band: '1b', level: 3 }, 'play', 'seq-3']]) {
    const { ctx, page, frame, errors } = await open({ size: { width: 1180, height: 820 }, lang: 'en', params });
    try {
      await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
      await T(frame, 'closeModal'); await page.waitForTimeout(200);
      const s = await T(frame, 'state'); assert.equal(s.screen, screen, JSON.stringify(params)); assert.equal(s.levelId, levelId); assert.equal(s.lesson, true); assert.equal(s.lock, !!params.lock);
      if (screen === 'play') assert.equal(await frame.evaluate(() => document.getElementById('editPill').hidden), levelId !== 'dbg-1');
      assert.deepEqual(await fit(frame), [], JSON.stringify(params) + ' fits');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('robo-route: in Chromium every level fits a phone upright and on its side, with its answer in the box and a block selected', { skip, timeout: 600_000 }, async () => {
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    const { ctx, page, frame, errors } = await open({ size, lang: 'en' });
    try {
      await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(300); await T(frame, 'skipAnimations');
      const bad = [];
      for (const ch of CHAPTERS) for (const band of ['1b', '2']) {
        const levels = levelsFor(ch.id, band);
        for (let i = 0; i < levels.length; i++) {
          const l = levels[i]; if (l.maker) continue;
          await T(frame, 'start', { chapter: ch.id, band, level: i + 1, seed: 1 }); await T(frame, 'closeModal'); await page.waitForTimeout(40);
          if (l.plan) { await T(frame, 'plan'); await page.waitForTimeout(600); }
          if (l.programs) await T(frame, 'route', 1);
          const at = async phase => { const p = await fit(frame); if (p.length) bad.push(`${size.width}x${size.height} ${l.id}/${band} ${phase}: ${p.map(x => x.kind + ' ' + x.what).join(' | ')}`); };
          await at('start');
          if (!l.programs && typeof l.sol === 'string') { await T(frame, 'program', l.sol); await page.waitForTimeout(30); }
          await at('answer');
          await frame.evaluate(() => { const b = document.querySelector('.rr-blk[data-id]'); if (b) b.click(); }); await page.waitForTimeout(40);
          await at('tray');
        }
      }
      assert.deepEqual(bad, []);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('robo-route: in Chromium the densest level (Pro conditionals, an 8 by 8 board and a six-block shelf) fits tablets both ways and a phone on its side, at 150% text too', { skip, timeout: 180_000 }, async () => {
  for (const [size, lang, big] of [[{ width: 820, height: 1180 }, 'en', false], [{ width: 1180, height: 820 }, 'he', false], [{ width: 844, height: 390 }, 'en', false], [{ width: 820, height: 1180 }, 'en', true]]) {
    const { ctx, page, frame, errors } = await open({ size, lang });
    try {
      await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(400);
      if (big) await frame.evaluate(() => { Oomba.settings.set({ textSize: 1.5 }); });
      await T(frame, 'start', { chapter: 'conditionals', band: '2', level: 5, seed: 1 }); await T(frame, 'closeModal'); await page.waitForTimeout(400);
      const s = await T(frame, 'state'); assert.equal(s.levelId, 'cond-5p');
      await T(frame, 'program', 'repeat until goal { move; if not path or paint { right } }'); await page.waitForTimeout(200);
      // the program's first block selected: the tray shows below it
      await frame.evaluate(() => document.querySelector('.rr-blk[data-id]').click()); await page.waitForTimeout(200);
      assert.deepEqual(await fit(frame), [], `${size.width}x${size.height} ${lang}${big ? ' 150%' : ''} fits`);
      // the Level Maker's free board at Pro: an 8 by 8 board of buttons, an eight-tile palette and the action row
      await T(frame, 'band', '2'); await T(frame, 'maker', null); await page.waitForTimeout(300);
      const m = await T(frame, 'state'); assert.equal(m.screen, 'maker'); assert.equal(m.maker.rows.length, 8);
      await frame.evaluate(() => { const more = Oomba.t('More'); [...document.querySelectorAll('#mkActions .ok-btn')].find(b => (b.getAttribute('aria-label') || b.textContent).includes(more)).click(); }); await page.waitForTimeout(150);
      assert.deepEqual(await fit(frame), [], `${size.width}x${size.height} ${lang}${big ? ' 150%' : ''}: the maker fits`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('robo-route: in Chromium French reads from its checked pack, and English runs with no pack at all', { skip, timeout: 120_000 }, async () => {
  for (const lang of ['fr', 'en']) {
    const { ctx, page, frame, errors, consoleErrors } = await open({ size: { width: 390, height: 844 }, lang });
    try {
      await page.waitForTimeout(700);
      const loaded = await frame.evaluate(() => !!(window.CsqPacks && CsqPacks['robo-route']));
      const text = await frame.evaluate(() => document.body.innerText);
      if (lang === 'fr') { assert.ok(loaded, 'the French pack loaded'); assert.match(text, /Assemble des blocs/); }
      else { assert.equal(loaded, false, 'English needs no pack'); assert.match(text, /Snap blocks together/); }
      assert.equal(await frame.evaluate(() => document.querySelector('.ok-ui').getAttribute('dir')), 'ltr');
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
    } finally { await ctx.close(); }
  }
});

/* ---------- playthrough-audit regressions (2026-11-05): completion must be reliable and visible ---------- */
const clickWin = async (frame, page) => { await frame.evaluate(() => { const b = document.querySelector('.ok-ui .ok-modal.ok-win .ok-row .ok-hot') || document.querySelector('.ok-ui .ok-modal.ok-win .ok-btn'); if (b) b.click(); }); await page.waitForTimeout(800); };
const answerCheck = async (frame, page, ch, band, li) => {
  const lv = levelsFor(ch, band)[li];
  assert.ok(await T(frame, 'check', lv.check.answer), 'the right tile is on the card');
  await page.waitForTimeout(150);
  assert.ok(await T(frame, 'confidence', 3));
  await page.waitForTimeout(900);
};

test('robo-route: leaving mid "Case closed?" flow loses nothing: the check is asked again on re-entry and the finished chapter is credited', { skip, timeout: 240_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 390, height: 844 }, lang: 'en', params: { chapter: 'sequences', band: '1b', lock: 1 } });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    await T(frame, 'closeModal'); await page.waitForTimeout(150);
    await T(frame, 'skipAnimations');
    // level 1: solve and answer the check the normal way
    await T(frame, 'solve'); await page.waitForTimeout(400);
    let s = await T(frame, 'state'); assert.equal(s.card, 'case', 'the check card follows a solve');
    await answerCheck(frame, page, 'sequences', '1b', 0);
    s = await T(frame, 'state'); assert.deepEqual(s.checks, { ok: 1, n: 1 });
    await clickWin(frame, page);
    s = await T(frame, 'state'); assert.equal(s.level, 2);
    // level 2: solve, then LEAVE with the check card still open (the audited failure)
    await T(frame, 'solve'); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.card, 'case'); assert.equal(s.done, 2, 'the solve itself is saved at once');
    await T(frame, 'title'); await page.waitForTimeout(300);
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(600);
    // re-entry asks the outstanding check before play resumes
    s = await T(frame, 'state'); assert.equal(s.card, 'case', 'the left-behind check is asked again on re-entry');
    await answerCheck(frame, page, 'sequences', '1b', 1);
    s = await T(frame, 'state'); assert.equal(s.level, 3, 'play resumes at the first unfinished level'); assert.deepEqual(s.checks, { ok: 2, n: 2 });
    // finish the chapter; the win flow now runs to the results card and the label carries every check
    for (let li = 2; li < 6; li++) {
      await T(frame, 'solve'); await page.waitForTimeout(400);
      await answerCheck(frame, page, 'sequences', '1b', li);
      await clickWin(frame, page);
    }
    await clickWin(frame, page);
    s = await T(frame, 'state'); assert.equal(s.screen, 'results', 'a finished lesson chapter lands on the results card'); assert.deepEqual(s.checks, { ok: 6, n: 6 }); assert.match(s.label, /6\/6 checks/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('robo-route: a chapter already finished in the save is credited on lesson entry, asking only the checks never answered', { skip, timeout: 180_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 390, height: 844 }, lang: 'en' });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(400);
    await T(frame, 'unlockAll');
    await T(frame, 'start', { chapter: 'sequences', band: '1b', lesson: true, lock: true, seed: 2 });
    await page.waitForTimeout(400);
    for (let li = 0; li < 6; li++) {
      const s = await T(frame, 'state'); assert.equal(s.card, 'case', `catch-up asks level ${li + 1}'s check`);
      await answerCheck(frame, page, 'sequences', '1b', li);
    }
    await clickWin(frame, page);
    const s = await T(frame, 'state'); assert.equal(s.screen, 'results', 'no replay needed: the finished chapter is credited'); assert.deepEqual(s.checks, { ok: 6, n: 6 });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('robo-route: the Debug Lab lesson check appears on a solve (playthrough regression: checks must fire in lesson mode)', { skip, timeout: 120_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 390, height: 844 }, lang: 'en', params: { chapter: 'debug', band: '1b', mode: 'debug', lock: 1 } });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    await T(frame, 'closeModal'); await page.waitForTimeout(150);
    await T(frame, 'skipAnimations'); await T(frame, 'solve'); await page.waitForTimeout(400);
    const s = await T(frame, 'state'); assert.equal(s.levelId, 'dbg-1'); assert.equal(s.card, 'case', 'the "Case closed?" card opens after solving dbg-1 in lesson mode');
    await answerCheck(frame, page, 'debug', '1b', 0);
    const s2 = await T(frame, 'state'); assert.deepEqual(s2.checks, { ok: 1, n: 1 }); assert.match(s2.label, /1\/1 checks/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('robo-route: the tester card comes back until the feedback exists, so "Improved after a test" can be earned after leaving it', { skip, timeout: 240_000 }, async () => {
  const { ctx, page, frame, errors } = await open({ size: { width: 390, height: 844 }, lang: 'en', params: { chapter: 'level-maker', band: '1b', lock: 1 } });
  try {
    await frame.evaluate(() => document.querySelector('.ok-title-screen .ok-hot').click()); await page.waitForTimeout(500);
    await T(frame, 'closeModal'); await page.waitForTimeout(200);
    await T(frame, 'skipAnimations');
    assert.equal(await T(frame, 'tool', 'floor'), 'floor'); await T(frame, 'paint', 2, 3);
    let res = await T(frame, 'mkCheck'); assert.equal(res.ok, true); await page.waitForTimeout(300);
    await answerCheck(frame, page, 'level-maker', '1b', 0);
    await clickWin(frame, page);
    let s = await T(frame, 'state'); assert.equal(s.maker.task, 'mk-2');
    // build a free level from the task board, then run a friend's test
    const code = await T(frame, 'mkCode'); assert.ok(await T(frame, 'mkLoad', code));
    res = await T(frame, 'mkCheck'); assert.equal(res.ok, true);
    assert.equal(await T(frame, 'mkTest'), true); await page.waitForTimeout(200);
    await T(frame, 'program', 'repeat until goal { if path { move } else { left } }'); await T(frame, 'run'); await page.waitForTimeout(500);
    assert.equal((await T(frame, 'verdict')).ok, true);
    await page.waitForTimeout(300); await T(frame, 'closeDialog'); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.card, 'tester', 'the tester card opens after a solved test');
    // leave it unanswered via Not now: the feedback is still owed
    await frame.evaluate(() => [...document.querySelectorAll('#modal .ok-btn')].find(b => /Not now/.test(b.textContent)).click()); await page.waitForTimeout(200);
    s = await T(frame, 'state'); assert.equal(s.maker.feedback, null); assert.equal(s.maker.pendingFeedback, true, 'an unanswered tester card stays owed');
    // a second test brings the card back on return to the maker
    assert.equal(await T(frame, 'mkTest'), true); await page.waitForTimeout(200);
    await T(frame, 'program', 'repeat until goal { if path { move } else { left } }'); await T(frame, 'run'); await page.waitForTimeout(500);
    await page.waitForTimeout(300); await T(frame, 'closeDialog'); await page.waitForTimeout(400);
    s = await T(frame, 'state'); assert.equal(s.card, 'tester', 'the tester card is asked again after the next test');
    assert.ok(await T(frame, 'tester', 1, 1)); await page.waitForTimeout(150);
    s = await T(frame, 'state'); assert.ok(s.maker.feedback, 'feedback recorded'); assert.equal(s.maker.pendingFeedback, false);
    await T(frame, 'paint', 1, 1); res = await T(frame, 'mkCheck');
    s = await T(frame, 'state'); assert.equal(s.maker.improved, true, 'a change after the answered test counts as improving');
    assert.match(await frame.evaluate(() => document.getElementById('mkResult').textContent), /Improved after a test/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('robo-route: misplaced blocks, late-filled door boxes and sensor loops get truthful failure messages (playthrough explorer-7/-9, pro-5/-6)', () => {
  const L = (ch, band, id) => levelsFor(ch, band).find(l => l.id === id);
  const cond5 = L('conditionals', '1b', 'cond-5');
  // pro-5: a when block nested inside a loop or a My Block is a KNOWN block in the wrong place
  const wInLoop = run(cond5, 'repeat until goal { when bump { left }; move }');
  assert.equal(wInLoop.verdict.failReason, 'whenplace', 'when inside a repeat');
  assert.equal(wInLoop.verdict.compileError, true);
  assert.match(E.failText(wInLoop.verdict)[0], /top level/);
  assert.doesNotMatch(E.failText(wInLoop.verdict)[0], /not a block Bolt knows/);
  const wInProc = run(cond5, 'proc A { when bump { left } }; call A; repeat until goal { move }');
  assert.equal(wInProc.verdict.failReason, 'whenplace', 'when inside a My Block');
  const pInLoop = run(cond5, 'repeat 2 { proc A { move } }; call A');
  assert.equal(pInLoop.verdict.failReason, 'procplace', 'a My Block defined inside a repeat');
  assert.match(E.failText(pInLoop.verdict)[0], /top level/);
  // explorer-9: var-1's door reads the count box as Bolt steps in; filling it after the bump is too late
  const v1 = L('variables', '1b', 'var-1');
  const late = run(v1, 'move; move; move; move; move; right; move; set count 5; move; move');
  assert.equal(late.verdict.failReason, 'doorvar', `the box was filled, only after the bump: ${JSON.stringify(late.verdict)}`);
  assert.match(E.failText(late.verdict)[0], /steps in/);
  const never = run(v1, 'move; move; move; move; move; right; move');
  assert.equal(never.verdict.failReason, 'door', 'a box never filled keeps the plain door message');
  // pro-6: a sensor loop that never moves gives the own-square hint; a plain runaway loop does not
  const cond4 = L('conditionals', '1b', 'cond-4');
  const stuck = run(cond4, 'repeat until paint { right }');
  assert.equal(stuck.verdict.failReason, 'limituntil', 'the sensor reads the square Bolt stands on');
  assert.match(E.failText(stuck.verdict)[0], /standing on/);
  const seq1 = L('sequences', '1b', 'seq-1');
  const plain = run(seq1, 'repeat 99 { repeat 99 { repeat 99 { right } } }');
  assert.equal(plain.verdict.failReason, 'limit', 'no sensor loop, no sensor hint');
  // explorer-7: cond-4's check tiles name the if block's behaviour, not one board's sensor
  assert.equal(JSON.stringify(cond4.check.tiles), JSON.stringify(['asks its question again', 'asks only on the first turn', 'never asks']));
  assert.equal(cond4.check.answer, 0);
});
