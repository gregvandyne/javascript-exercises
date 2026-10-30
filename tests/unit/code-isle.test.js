// Code Isle (seed-games/code-isle.html): the kids' code interpreter, Pip's world and every level, run from the game file itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('seed-games/code-isle.html', 'utf8');
const classic = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const ctx = vm.createContext({});
for (const src of classic) vm.runInContext(src, ctx);
const C = ctx.CodeIsle, { LEVELS, SANDBOX, CHAPTERS } = ctx.CodeIsleLevels;
const run = (level, code) => C.runLevel(level, code);
const flat = { id: 't', map: ['~~~~~~~', '~Psssf~', '~~~~~~~'] };
const logs = code => { const r = run(flat, code); assert.ok(!r.syntax, r.syntax && r.syntax.message); const s = r.results[0].sim; if (s.error) throw s.error; return [...s.logs]; };
const err = code => { const r = run(flat, code); return r.syntax || r.results[0].sim.error; };

test('every level is solved with three stars by its answer, in every test world', () => {
  assert.equal(LEVELS.length, 48);
  for (const l of LEVELS) {
    const r = run(l, l.sol);
    assert.ok(!r.syntax, `${l.id}: ${r.syntax && r.syntax.message}`);
    r.results.forEach((x, i) => assert.ok(x.verdict.ok, `${l.id} world ${i + 1}: ${x.verdict.fails.join(' / ')}`));
    assert.equal(r.stars, 3, `${l.id}: stars`);
  }
});

test('no starter code already passes, and every level has its lesson and hints', () => {
  for (const l of LEVELS) {
    const r = run(l, l.starter);
    assert.ok(!r.ok, `${l.id}: the starter code should not finish the level`);
    assert.ok(l.learn && l.learn.title && l.learn.code && l.hints.length >= 2 && l.goal && l.story, `${l.id}: texts`);
    assert.ok(CHAPTERS.some(c => c.id === l.ch), `${l.id}: chapter`);
  }
  assert.ok(run(SANDBOX, SANDBOX.starter).ok);
});

test('the interpreter speaks enough JavaScript', () => {
  assert.deepEqual(logs('console.log(1 + 2 * 3, 2 ** 3, 10 - 4 - 3, 7 % 3, "a" + 1 + 2, 1 + 2 + "a")'), ['7 8 3 1 a12 3a']);
  assert.deepEqual(logs('let a = [3, 1, 2]; a.push(5); console.log(a, a.length, a.map(x => x * 2), a.filter(x => x > 1).join("-"))'), ['[3, 1, 2, 5] 4 [6, 2, 4, 10] 3-2-5']);
  assert.deepEqual(logs('const o = { n: 2, hi() { return this.n * 10; } }; o.n++; console.log(o.hi(), o.n)'), ['30 3']);
  assert.deepEqual(logs('function f(n) { if (n <= 1) return 1; return n * f(n - 1); } console.log(f(5))'), ['120']);
  assert.deepEqual(logs('let s = 0; for (let i = 0; i < 10; i++) { if (i % 2) continue; if (i > 6) break; s += i; } console.log(s)'), ['12']);
  assert.deepEqual(logs('let n = 0; do { n++; } while (n < 3); console.log(`n=${n}`, n > 2 ? "big" : "small", null ?? "d")'), ['n=3 big d']);
  assert.deepEqual(logs('for (const c of ["a", "b"]) console.log(c.toUpperCase())'), ['A', 'B']);
});

test('kids get friendly errors with line numbers', () => {
  assert.match(err('pip.forwrd();').message, /Did you mean forward/);
  assert.match(err('forward();').message, /pip\.forward/);
  assert.match(err('Pip.forward();').message, /Capital letters matter/);
  assert.match(err('pip.forward;').message, /needs \( \)/);
  assert.match(err('if (x = 3) {}').message, /===/);
  assert.match(err('pip.say("hi);').message, /closing quote/);
  assert.match(err('const c = 1;\nc = 2;').message, /const/);
  assert.equal(err('let x = 1;\n\npip.forward(9);').line, 3);
  assert.match(err('pip.forward(9);').message, /Splash/);
  assert.match(err('pip.build("stne");').message, /Did you mean stone/);
});

test('kids\' code is fenced in: no way out to real JavaScript, and runaway code stops', () => {
  assert.equal(err('"x".constructor.constructor("return 1")()').kind !== undefined, true);
  assert.deepEqual(logs('console.log(typeof "x".constructor, typeof [].constructor, typeof globalThis, typeof window)'), ['undefined undefined undefined undefined']);
  assert.match(err('while (true) {}').message, /very long time/);
  assert.match(err('function g() { g(); } g();').message, /calling itself/);
  assert.match(err('let a = []; while (true) a.push(1);').message, /too big|very long/);
  assert.match(err('for (;;) pip.turnLeft();').message, /tired|very long/);
});

test('a finished build is kept as a small diff and can be put back', () => {
  const l = LEVELS.find(x => x.id === '2-1');
  const r = run(l, l.sol);
  const diff = C.diffSim(l, r.results[0].sim);
  assert.equal(diff.length, 7);
  const fresh = C.applyDiff(new C.Sim(l, 0), JSON.parse(JSON.stringify(diff)));
  assert.equal(fresh.col(5, 2).blocks.join(), 'wood');
  assert.equal(C.applyDiff(new C.Sim(l, 0), [[3, 2, 'wood,lava,stone', 'dragon', 0]]).col(3, 2).blocks.join(), 'wood,stone', 'unknown blocks and items are dropped');
});
