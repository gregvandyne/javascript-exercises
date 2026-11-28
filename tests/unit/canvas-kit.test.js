// Oomba Canvas (canvas/, docs/canvas-api.md): each manipulative's pure check / solve, the self-test (a broken answer key
// and an empty start that counts as right are both caught), the frozen kit file (its hash, canvas/SHIPPED.json, a fresh
// build), the words in every site language, the copied colour tokens, and the scanner's pinned-tag rule.
process.env.BRB_SILENT = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TOOLS, TOOL_IDS, selfTest, deal, cleanProblem, seeded, fitsRegroup, themeOf } from '../../canvas/src/logic.js';
import { WORDS, wordsFor } from '../../canvas/src/words.js';
import { TOKENS } from '../../canvas/src/style.js';
import { CANVAS_VERSIONS, CANVAS_LATEST, canvasTag, checkCanvas, canvasKit, canvasVersion, selfTestHtml, activityData, withActivityData } from '../../server/services/canvaskit.js';
import { scanVersion } from '../../server/services/scanner.js';
import { files as buildFiles } from '../../scripts/build-canvas.js';
import { CODES } from '../../server/i18n/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T = id => TOOLS[id];
const ok = (id, p, st) => T(id).check(cleanProblem({ tool: id, ...p }).p, st);

// ---------------------------------------------------------------- the manipulatives
test('fraction bars: make 3/4 from eighths; only 6 eighths is right, other pieces and empty never are', () => {
  const p = { from: [3, 4], to: 8 };
  assert.equal(ok('fractions.equiv', p, { pieces: Array(6).fill(8) }).ok, true);
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [] }).hint.k, 'fbEmpty');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [8, 8, 8, 8] }).hint.k, 'fbMore');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: Array(7).fill(8) }).hint.k, 'fbLess');
  assert.deepEqual(ok('fractions.equiv', p, { pieces: [4, 4, 4] }).hint, { k: 'fbNotThese', v: { u: [1, 8] } }, '3/4 made of fourths is not "using eighths"');
  const q = cleanProblem({ tool: 'fractions.equiv', ...p }).p;
  assert.deepEqual(T('fractions.equiv').solve(q), { pieces: Array(6).fill(8) });
  assert.deepEqual(T('fractions.equiv').steps(q).filter(s => s.ans !== undefined).map(s => s.ans), [2, 6], 'one fourth = 2 eighths; 3 fourths = 6 eighths');
  assert.equal(T('fractions.equiv').solve(cleanProblem({ tool: 'fractions.equiv', from: [5, 6], to: 4 }).p), null, '5/6 cannot be made with fourths');
});
test('fraction bars: shade n of d parts, and compare two fractions with <, = or >', () => {
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 2, 4] }).ok, true, 'any three parts');
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 1] }).ok, false);
  assert.equal(ok('fractions.shade', { n: 3, d: 5 }, { on: [0, 0, 0] }).ok, false, 'a part counts once');
  assert.equal(ok('fractions.compare', { a: [2, 3], b: [3, 4] }, { pick: '<' }).ok, true);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: '=' }).ok, true);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: '>' }).ok, false);
  assert.equal(ok('fractions.compare', { a: [2, 4], b: [1, 2] }, { pick: null }).hint.k, 'fbPick');
  const c = cleanProblem({ tool: 'fractions.compare', a: [2, 3], b: [3, 4] }).p;
  assert.deepEqual(T('fractions.compare').steps(c).filter(s => s.ans !== undefined).map(s => s.ans), [8, 9], 'in twelfths: 8 and 9');
});
test('number line: a point at 3/4 (quarters) and a jump; the tick says left or right', () => {
  const p = { at: [3, 4], lo: 0, hi: 2, sub: 4 };
  assert.equal(ok('numberline.point', p, { tick: 3 }).ok, true);
  assert.equal(ok('numberline.point', p, { tick: 4 }).hint.k, 'fbLeft');
  assert.equal(ok('numberline.point', p, { tick: 1 }).hint.k, 'fbRight');
  assert.equal(ok('numberline.point', p, { tick: null }).hint.k, 'fbTap');
  assert.equal(ok('numberline.jump', { from: 3, by: 5, lo: 0, hi: 10, sub: 1 }, { tick: 8 }).ok, true);
  assert.equal(ok('numberline.jump', { from: [1, 2], by: [3, 4], lo: 0, hi: 2, sub: 4 }, { tick: 5 }).ok, true, '1/2 + 3/4 = 5/4: tick 5 of quarters');
  assert.equal(T('numberline.point').solve(cleanProblem({ tool: 'numberline.point', at: [1, 3], lo: 0, hi: 1, sub: 4 }).p), null, 'thirds are not on a quarters line');
  assert.equal(T('numberline.point').solve(cleanProblem({ tool: 'numberline.point', at: 3, lo: 0, hi: 2, sub: 1 }).p), null, 'off the line');
});
test('digit boxes: column add, subtract and multiply; the wrong column is named, leading empty boxes are fine', () => {
  const add = cleanProblem({ tool: 'digits.add', a: 478, b: 256 }).p, A = T('digits.add');
  assert.deepEqual(A.solve(add).ans, [4, 3, 7]);
  assert.equal(A.check(add, { ans: [4, 3, 7] }).ok, true);
  assert.equal(A.check(add, { ans: [4, 3, 7, null] }).ok, true, 'an empty box in front is fine');
  assert.deepEqual(A.check(add, { ans: [4, 2, 7] }).hint, { k: 'fbCol', v: { place: 'tens' } });
  assert.deepEqual(A.check(add, { ans: [4, null, 7] }).hint, { k: 'fbFill', v: { place: 'tens' } });
  assert.equal(A.check(add, A.start(add)).ok, false);
  assert.deepEqual(A.steps(add).filter(s => s.ans !== undefined).map(s => [s.k, s.ans]), [['colAdd', 14], ['colAddC', 13], ['colAddC', 7]]);
  const sub = cleanProblem({ tool: 'digits.sub', a: 503, b: 128 }).p, S = T('digits.sub');
  assert.equal(S.check(sub, S.solve(sub)).ok, true); assert.deepEqual(S.solve(sub).ans.filter(x => x !== null), [5, 7, 3]);
  assert.ok(S.steps(sub).some(s => s.k === 'colBorrow'), 'borrowing is a step');
  assert.equal(cleanProblem({ tool: 'digits.sub', a: 5, b: 9 }).p, undefined, 'no negative answers');
  const mul = cleanProblem({ tool: 'digits.mul', a: 47, b: 6 }).p, M = T('digits.mul');
  assert.deepEqual(M.solve(mul).ans.filter(x => x !== null), [2, 8, 2]);
  assert.equal(M.check(mul, { ans: [2, 8, 2, null] }).ok, true);
  assert.equal(cleanProblem({ tool: 'digits.mul', a: 47, b: 16 }).p, undefined, 'one digit only');
  const zero = cleanProblem({ tool: 'digits.sub', a: 7, b: 7 }).p;
  assert.equal(S.check(zero, S.start(zero)).ok, false, 'an answer of 0 still needs the 0');
  assert.equal(S.check(zero, S.solve(zero)).ok, true);
});
test('tiles: sort by a rule the kit knows (or the Builder\'s own groups) and put in order', () => {
  const s = cleanProblem({ tool: 'tiles.sort', rule: 'evenodd', items: [2, 7, 10, 13] }).p, SO = T('tiles.sort');
  assert.deepEqual(SO.solve(s).at, [0, 1, 0, 1]);
  assert.equal(SO.check(s, { at: [0, 1, 0, 1] }).ok, true);
  assert.deepEqual(SO.check(s, { at: [0, 1, 1, 1] }).hint, { k: 'fbSortWrong', v: { n: 1 } });
  assert.equal(SO.check(s, { at: [0, null, 0, 1] }).hint.k, 'fbSortAll');
  const m = cleanProblem({ tool: 'tiles.sort', rule: 'mult', n: 3, items: [9, 10] }).p;
  assert.deepEqual(SO.solve(m).at, [0, 1]);
  const own = cleanProblem({ tool: 'tiles.sort', bins: ['Shapes', 'Numbers'], items: [{ t: 'circle', bin: 0 }, { t: 'seven', bin: 1 }] }).p;
  assert.equal(SO.check(own, { at: [0, 1] }).ok, true);
  assert.equal(cleanProblem({ tool: 'tiles.sort', bins: ['A', 'B'], items: [{ t: 'x', bin: 5 }, { t: 'y', bin: 0 }] }).p, undefined, 'a group that does not exist');
  const o = cleanProblem({ tool: 'tiles.order', items: [[3, 4], [1, 2], [2, 3]] }).p, OR = T('tiles.order');
  assert.deepEqual(OR.solve(o).slots, [1, 2, 0], '1/2 < 2/3 < 3/4');
  assert.equal(OR.check(o, { slots: [1, 2, 0] }).ok, true);
  assert.equal(OR.check(o, { slots: [2, 1, 0] }).hint.k, 'fbOrderWrong');
  assert.equal(OR.check(o, { slots: [1, 1, 0] }).hint.k, 'fbOrderAll');
  assert.equal(cleanProblem({ tool: 'tiles.order', items: [[1, 2], [2, 4], 3] }).p, undefined, 'two equal tiles: no clear order');
});
test('every tool: its generator makes problems its worked answer solves, never right when empty, with steps and up to 3 hints', () => {
  // (the figure questions' generators are templates written by the Builder: tests/unit/canvas-print.test.js)
  for (const id of TOOL_IDS.filter(x => !x.startsWith('figure.'))) {
    const t = T(id);
    for (let i = 1; i <= 40; i++) {
      const c = cleanProblem(t.gen(seeded(i * 31), {}));
      assert.ok(c.p, `${id} #${i}: ${c.why}`);
      assert.equal(t.check(c.p, t.solve(c.p)).ok, true, `${id} #${i}: solve passes`);
      assert.equal(t.check(c.p, t.start(c.p)).ok, false, `${id} #${i}: empty is not right`);
      const h = t.hints(c.p); assert.ok(h.length >= 1 && h.length <= 3);
      for (const x of [t.task(c.p), t.ask(c.p), ...t.steps(c.p), ...h]) assert.ok(x.k in WORDS.en, `${id}: no word "${x.k}"`);
    }
  }
});
test('a fresh set per student: a seed of their own, no repeats against what they have seen', () => {
  const a = { gen: { tool: 'digits.add', digits: 2 }, config: { count: 5 } };
  const one = deal(a, { seed: 11 }), two = deal(a, { seed: 99 }), again = deal(a, { seed: 11 });
  assert.equal(one.length, 5); assert.deepEqual(one, again, 'the same seed, the same set (a resume)');
  assert.notDeepEqual(one, two, 'another student, another set');
  const seen = one.map(p => T(p.tool).key(p)), next = deal(a, { seed: 11, seen });
  assert.ok(next.every(p => !seen.includes(T(p.tool).key(p))), 'Try new ones never repeats');
  assert.equal(deal({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }, { tool: 'nope' }] }).length, 1, 'fixed problems: the good ones');
});

// ---------------------------------------------------------------- the self-test
test('the self-test rejects a broken answer key and an empty start that counts as right, and names the problem', () => {
  assert.deepEqual(selfTest({ problems: [{ tool: 'fractions.equiv', from: [3, 4], to: 8 }] }), { ok: true, problems: [] });
  const r = selfTest({ problems: [{ tool: 'fractions.equiv', from: [3, 4], to: 8 }, { tool: 'fractions.equiv', from: [5, 6], to: 4 }, { tool: 'numberline.point', at: [1, 3], sub: 4 }, { tool: 'digits.add', a: 'x', b: 2 }, { tool: 'magic' }] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems.map(p => p.at), ['problem 2', 'problem 3', 'problem 4', 'problem 5']);
  assert.match(r.problems[0].why, /cannot be solved: 5\/6 cannot be made with pieces of 1\/4/);
  assert.match(r.problems[3].why, /unknown tool "magic"/);
  // an empty start that counts as right: a tool whose check passes on its own start state is caught
  const real = TOOLS['fractions.shade'].check;
  TOOLS['fractions.shade'].check = () => ({ ok: true, hint: null });
  try { assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }] }).problems[0].why, /the empty start already counts as right/); } finally { TOOLS['fractions.shade'].check = real; }
  // a worked answer that does not pass
  const solve = TOOLS['fractions.shade'].solve;
  TOOLS['fractions.shade'].solve = () => ({ on: [] });
  try { assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }] }).problems[0].why, /worked answer does not pass/); } finally { TOOLS['fractions.shade'].solve = solve; }
  assert.equal(selfTest({}).ok, false, 'no problems and no generator');
  assert.equal(selfTest({ gen: { tool: 'digits.mul' } }).ok, true);
  assert.match(selfTest({ problems: [{ tool: 'fractions.shade', n: 1, d: 2 }], hints: { 'fractions.shade': ['a', 'b', 'c', 'd'] } }).problems[0].why, /1 to 3 short lines/);
});
test('the server runs the kit\'s own frozen file: an activity page passes, a broken one names its problem', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'server/builder/templates/canvas.html'), 'utf8').replace('<!--CANVAS-->', canvasTag());
  assert.equal(canvasVersion(tpl), CANVAS_LATEST);
  assert.deepEqual(selfTestHtml(tpl), { ok: true, problems: [] });
  const bad = withActivityData(tpl, { ...activityData(tpl).data, problems: [{ tool: 'fractions.equiv', from: [5, 6], to: 4 }], gen: null });
  assert.equal(selfTestHtml(bad).ok, false); assert.match(selfTestHtml(bad).problems[0].why, /5\/6 cannot be made/);
  assert.match(selfTestHtml(tpl.replace(/"problems": \[/, '"problems": [,')).problems[0].why, /not valid JSON/);
  assert.equal(selfTestHtml('<p>an arcade game</p>'), null, 'not an activity: no self-test');
  const k = canvasKit();
  assert.deepEqual([...k.tools], TOOL_IDS, 'the frozen file has the same tools as the source');
});

// ---------------------------------------------------------------- the frozen file
test('Oomba Canvas 1.0.0 to 1.6.1: the hashes in canvaskit.js and canvas/SHIPPED.json match the files, and a fresh build makes the latest\'s bytes', async () => {
  assert.deepEqual(Object.keys(CANVAS_VERSIONS), ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.4.1', '1.5.0', '1.6.0', '1.6.1']); assert.equal(CANVAS_LATEST, '1.6.1');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'canvas/SHIPPED.json'), 'utf8')).versions), ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.4.1', '1.5.0', '1.6.0', '1.6.1'], 'all nine are locked');
  const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'canvas/SHIPPED.json'), 'utf8')).versions;
  for (const [v, h] of Object.entries(CANVAS_VERSIONS)) {
    const f = fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'oomba-canvas.js'));
    assert.equal(`sha384-${crypto.createHash('sha384').update(f).digest('base64')}`, h, v);
    assert.equal(shipped[v], h, `${v} is locked in canvas/SHIPPED.json`);
    assert.ok(fs.existsSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'fonts/bricolage-latin.woff2')));
  }
  const built = await buildFiles();
  for (const [k, b] of Object.entries(built)) assert.ok(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', CANVAS_LATEST, k)).equals(b), `${k} matches canvas/src`);
  const js = built['oomba-canvas.js'].toString();
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|\beval\s*\(|new Function/, 'no network, no browser storage, no eval');
  assert.doesNotMatch(js, /<input|contenteditable|<textarea/i, 'no text field anywhere: digits only, through the kit');
  // 1.4.0: the one text box is the teacher's, renaming a saved worksheet in My worksheets (sets.js, school staff only)
  const inputs = [...js.matchAll(/h\('(input|textarea)'/g)];
  assert.equal(inputs.length, 1, 'one text box'); assert.ok(js.indexOf("h('input'") > js.indexOf('// ---- sets.js') && js.indexOf("h('input'") < js.indexOf('// ---- ui.js'), 'and it is in sets.js (My worksheets)');
});
test('Oomba Canvas 1.0.0 is byte-for-byte what shipped: its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.0.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped in #431 (it lists the sha384 of every file in the folder)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-Yw3RA6E5ZqCu586uJ81v16Mpg8PtGqsfgAREroRF0dW57Tda2oydd4+AX1fMMXki');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.0.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.0.0 folder');
  assert.equal(canvasKit('1.0.0').version, '1.0.0'); assert.equal(canvasKit('1.1.0').version, '1.1.0'); assert.equal(canvasKit('1.2.0').version, '1.2.0'); assert.equal(canvasKit('1.3.0').version, '1.3.0'); assert.equal(canvasKit('1.4.0').version, '1.4.0'); assert.equal(canvasKit('1.4.1').version, '1.4.1'); assert.equal(canvasKit('1.5.0').version, '1.5.0'); assert.equal(canvasKit('1.6.0').version, '1.6.0');
});
test('Oomba Canvas 1.1.0 is byte-for-byte what shipped (1.2.0 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.1.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped in #433
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-k0maynfnadJUm7ImgU2LYzorED8AmlVa+AL468oP4DMJLygnrxwHuAtx1tYTj0+B');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.1.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.1.0 folder');
});
test('Oomba Canvas 1.2.0 is byte-for-byte what shipped (1.3.0 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.2.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (Builder part 1)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-jF3ITeskhYEUCI9KTRkyMyRCfmJO7tmLuBsIHTKHK85u+zW8zBuW0DeQQLPwc6XV');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.2.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.2.0 folder');
});
test('Oomba Canvas 1.3.0 is byte-for-byte what shipped (1.4.0 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.3.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (Builder part 2, #447)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-WRPV5JDQPOlqcMBATzXuPgjmlRzinTkp/IcqRtVO+QJwsBDVxIF7crxpZOcmQoCz');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.3.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.3.0 folder');
});
test('Oomba Canvas 1.4.0 is byte-for-byte what shipped (1.4.1 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.4.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (My worksheets, #494)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-ktLFC72B1d1r6kAUY92/1XUqku937OiKxX1od3y0y/T0vst9SEyBxKO69qW8XSqH');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.4.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.4.0 folder');
});
test('Oomba Canvas 1.4.1 is byte-for-byte what shipped (1.5.0 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.4.1'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (the phone layout, #510)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-UaVamZ+0EU39pNBRfkEUmfHaLQrsUBZHOPl816VoXvMfDTizcjPtZVDl9F9+myEg');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.4.1');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.4.1 folder');
});
test('Oomba Canvas 1.5.0 is the Crossword look: the dotted mint board, the problem line in the dark Now bar, Check Crossword\'s flat green Go pill', () => {
  const css = v => fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'oomba-canvas.css'), 'utf8');
  const rule = (src, sel) => { const m = new RegExp(`(?:^|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm').exec(src); return m ? m[1] : ''; };
  const now = css('1.5.0'), old = css('1.4.1');
  // the board: mint paper with green dots (dark: dark green dots on near black), as Crossword and the classroom style
  assert.match(TOKENS.light, /--paper:#E1F1E1;--dots:#66C792;/); assert.match(TOKENS.dark, /--paper:#141414;--dots:#2E5A41;/);
  assert.match(rule(now, 'html,body'), /background-color:var\(--paper\);background-image:radial-gradient\(var\(--dots\) 1\.5px,transparent 1\.6px\);background-size:22px 22px/);
  assert.doesNotMatch(rule(now, '.oc'), /linear-gradient|background/, 'no cream graph paper over the board');
  assert.match(rule(old, '.oc'), /linear-gradient\(var\(--grid\)/, '1.4.1 keeps its graph paper');
  // the problem line: the dark Now bar (the site's --current / --on-current: ink in light, mint in dark)
  assert.match(TOKENS.light, /--current:#141414;--on-current:#FFFDF2;/); assert.match(TOKENS.dark, /--current:#66C792;--on-current:#141414;/);
  assert.match(rule(now, '.oc-task'), /background:var\(--current\);color:var\(--on-current\)/);
  assert.doesNotMatch(rule(now, '.oc-task'), /#E0699B/, 'no cream card with a pink edge');
  assert.match(rule(now, '.oc-task .oc-n'), /color:inherit/);
  assert.match(rule(old, '.oc-task'), /background:var\(--card\)/);
  // Check: Crossword's .cw-btn.cw-go, flat (no raised bottom edge): green fill and edge, white words (dark: mint, #10261A)
  assert.match(TOKENS.light, /--green:#1F9D63;--on-green:#fff;/); assert.match(TOKENS.dark, /--green:#66C792;--on-green:#10261A;/);
  assert.match(rule(now, '.oc-primary'), /background:var\(--green\);color:var\(--on-green\);box-shadow:inset 0 0 0 2px var\(--green\)/);
  assert.doesNotMatch(rule(now, '.oc-primary'), /-4px/);
  assert.match(rule(now, '.oc-btn'), /border-radius:999px/);
  assert.match(rule(now, '.oc-band .oc-btn:not(.oc-primary),.oc-endbtns .oc-btn:not(.oc-primary)'), /inset 0 0 0 2px var\(--text\)/, 'the other band and end buttons: an ink outline');
  assert.match(rule(old, '.oc-primary'), /inset 0 -4px 0 var\(--accent-press\)/, '1.4.1 keeps its raised Check');
  // style only: 1.5.0's script is 1.4.1's but for its version, its header comment and its styles
  const js = v => fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', v, 'oomba-canvas.js'), 'utf8').replace(/^\/\/ ---- style\.js[\s\S]*?(?=^\/\/ ---- teach\.js)/m, '').replace(/^\/\/ 1\.5\.0: .*\n(\/\/ .*\n)?/m, '').replace(/^\/\*! Oomba Canvas [\d.]+ /, '').replace(/const VERSION = '[\d.]+';/, '');
  assert.equal(js('1.5.0'), js('1.4.1'), 'no behavior changes');
  assert.equal(canvasKit('1.5.0').version, '1.5.0'); assert.equal(canvasKit('1.6.0').version, '1.6.0'); assert.equal(canvasKit('1.6.1').version, '1.6.1');
});
test('Oomba Canvas 1.5.0 is byte-for-byte what shipped (1.6.0 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.5.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (the Crossword look, #570)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-o/HKraZi2l7fudaUZXP/4J8jUYFQLxzv80f1OfA6Il5qPUczF7DRKgZMQ0lniE2R');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.5.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.5.0 folder');
});

test('Oomba Canvas 1.6.0 is byte-for-byte what shipped (1.6.1 is in new files): its manifest, and every file the manifest names', () => {
  const dir = path.join(ROOT, 'public/vendor/oomba-canvas/1.6.0'), h = b => `sha384-${crypto.createHash('sha384').update(b).digest('base64')}`;
  // the manifest as it shipped (the fourth audit, #712)
  assert.equal(h(fs.readFileSync(path.join(dir, 'manifest.json'))), 'sha384-g1nDqpFGwTFDtT/8OgYDxKrXIMj9DhaLfCmPEj5PpKj7+DFG7gKV7X1wrd5M5mtC');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  assert.equal(m.version, '1.6.0');
  for (const [f, want] of Object.entries(m.files)) assert.equal(h(fs.readFileSync(path.join(dir, f))), want, f);
  const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(dir, path.join(d, e.name))); }; walk(dir);
  assert.deepEqual(all.sort(), ['manifest.json', ...Object.keys(m.files)].sort(), 'nothing added to or taken from the 1.6.0 folder');
});

// ---------------------------------------------------------------- 1.6.1: the owner's fifth audit (docs/decisions.md)
test('1.6.1: a carry into a new leading column is a step of its own; the columns that get a carry; 1.6.0 unchanged', () => {
  const A = T('digits.add'), M = T('digits.mul'), W = WORDS.en;
  const say = x => W[x.k].replace(/\{(\w+)\}/g, (m, k) => { const v = x.v[k]; return typeof v === 'string' && v in W ? W[v] : String(v); });
  const boxes = (t, p) => t.steps(p).filter(s => s.ans !== undefined).map(s => [say(s), s.ans, s.col]);
  const P = (tool, a, b) => cleanProblem({ tool, a, b }).p;
  assert.deepEqual(boxes(A, P('digits.add', 64, 58)), [['Ones: 4 + 8 = ?', 12, 0], ['Tens: 6 + 5 + 1 carried = ?', 12, 1], ['Hundreds: just the 1 carried = ?', 1, 2]]);
  assert.deepEqual(boxes(A, P('digits.add', 93, 19)).at(-1), ['Hundreds: just the 1 carried = ?', 1, 2]);
  assert.deepEqual(boxes(A, P('digits.add', 957, 868)).map(b => b[1]), [15, 12, 18, 1], '3-digit sums with a 4-digit answer');
  assert.deepEqual(boxes(A, P('digits.add', 957, 868)).at(-1)[0], 'Thousands: just the 1 carried = ?');
  assert.deepEqual(boxes(A, P('digits.add', 478, 256)).map(b => b[1]), [14, 13, 7], 'no carry out of the top: no extra step');
  assert.deepEqual(boxes(M, P('digits.mul', 47, 3)).map(b => b[1]), [21, 14, 1]);
  assert.deepEqual(boxes(M, P('digits.mul', 9, 9)), [['Ones: 9 × 9 = ?', 81, 0], ['Tens: just the 8 carried = ?', 8, 1]]);
  assert.deepEqual(boxes(T('digits.sub'), P('digits.sub', 503, 128)).map(b => b[1]), [5, 7], 'subtraction: as before (no carries; four lines at most)');
  // the worked steps still end with "write" and "press Check"; the answer key reads the new line too
  assert.deepEqual(A.steps(P('digits.add', 64, 58)).slice(-2).map(s => s.k), ['colWrite', 'pressCheck']);
  assert.deepEqual(A.carriesTo(P('digits.add', 64, 58)), [1, 2]); assert.deepEqual(A.carriesTo(P('digits.add', 957, 868)), [1, 2, 3]);
  assert.deepEqual(A.carriesTo(P('digits.add', 23, 45)), []); assert.deepEqual(T('digits.sub').carriesTo(P('digits.sub', 503, 128)), []);
  assert.deepEqual(M.carriesTo(P('digits.mul', 47, 3)), [1, 2]);
  // the frozen 1.6.0 file keeps its own steps (activities pinned to it play as they did)
  assert.deepEqual([...canvasKit('1.6.0').logic.TOOLS['digits.add'].steps(P('digits.add', 64, 58)).filter(s => s.ans !== undefined).map(s => s.ans)], [12, 12]);
  assert.deepEqual([...canvasKit('1.6.1').logic.TOOLS['digits.add'].steps(P('digits.add', 64, 58)).filter(s => s.ans !== undefined).map(s => s.ans)], [12, 12, 1]);
  // the new step line is in every language, with its {values}, and no em dash
  for (const l of Object.keys(WORDS)) assert.ok(WORDS[l].colCarryOnly && WORDS[l].colCarryOnly.includes('{place}') && WORDS[l].colCarryOnly.includes('{c}') && !WORDS[l].colCarryOnly.includes('—'), l);
  assert.deepEqual(selfTest({ problems: [{ tool: 'digits.add', a: 64, b: 58 }, { tool: 'digits.mul', a: 47, b: 3 }] }, WORDS.en), { ok: true, problems: [] });
});
test('1.6.1: every hint of a column sum in the order Hint shows them, the column of the last mistake first', () => {
  const A = T('digits.add'), W = WORDS.en, p = cleanProblem({ tool: 'digits.add', a: 64, b: 58 }).p;
  const say = x => W[x.k].replace(/\{(\w+)\}/g, (m, k) => { const v = x.v[k]; return typeof v === 'string' && v in W ? W[v] : String(v); });
  const all = A.hintsAll(p, null, null).map(say);
  assert.deepEqual(all, ['Ones: Add 4 + 8. Is it 10 or more?', 'Ones: 4 + 8 = 12. Write 2 and carry 1 to the next column (Tens).', 'Tens: Add 6 + 5, then the 1 you carried. Is it 10 or more?', 'Tens: 6 + 5 + 1 = 12. Write 2 here and 1 in the box on its left.', 'Now check every box once more, from the ones to the left.']);
  const tens = A.hintsAll(p, { ans: [2, 3, null] }, 1).map(say);
  assert.deepEqual(tens.slice(0, 2), all.slice(2, 4), 'a mistake in the tens: its hints first');
  assert.deepEqual(new Set(tens), new Set(all), 'the same hints, in another order');
  assert.equal(A.hintsAll(p, { ans: [2, null, null] }, null).map(say)[0], all[2], 'else the first box not right yet');
  for (const id of ['digits.sub', 'digits.mul']) for (const x of T(id).hintsAll(cleanProblem({ tool: id, a: 503, b: 8 }).p, null, null)) assert.ok(x.k in W, `${id}: ${x.k}`);
});

// ---------------------------------------------------------------- 1.6.0: the owner's fourth audit (docs/decisions.md)
test('1.6.0: the column generator keeps the skill: regroup "some" / "all" / "none", the digits, and lo / hi inside them', () => {
  const A = T('digits.add'), S = T('digits.sub');
  const R = (tool, a, b) => { const c = []; let carry = 0; const x = String(a).split('').reverse().map(Number), y = String(b).split('').reverse().map(Number);
    if (tool === 'digits.add') for (let i = 0; i < Math.max(x.length, y.length); i++) { const s = (x[i] || 0) + (y[i] || 0) + carry; carry = s >= 10 ? 1 : 0; c.push(carry); }
    else for (let i = 0; i < x.length; i++) { const t = x[i] - carry, b2 = y[i] || 0; carry = t < b2 ? 1 : 0; c.push(carry); }
    return c; };
  for (let i = 1; i <= 200; i++) {
    const some = A.gen(seeded(i), { digits: 2, regroup: 'some' }), all = A.gen(seeded(i), { digits: 2, regroup: 'all' }), none = A.gen(seeded(i), { digits: 2, regroup: 'none' });
    for (const p of [some, all, none]) { assert.ok(p.a >= 10 && p.a <= 99 && p.b >= 10 && p.b <= 99, `${p.a} + ${p.b}: two digits`); }
    assert.ok(R('digits.add', some.a, some.b).some(Boolean), `${some.a} + ${some.b} carries`);
    assert.deepEqual(R('digits.add', all.a, all.b), [1, 1], `${all.a} + ${all.b} carries in both columns`);
    assert.ok(!R('digits.add', none.a, none.b).some(Boolean), `${none.a} + ${none.b} never carries`);
    const big = A.gen(seeded(i), { digits: 2, lo: 50, hi: 99, regroup: 'some' });
    assert.ok(big.a >= 50 && big.a <= 99 && big.b >= 50 && big.b <= 99, '"bigger numbers": larger, still two digits');
    const sub = S.gen(seeded(i), { digits: 3, regroup: 'some' });
    assert.ok(sub.a >= sub.b && sub.a >= 100 && R('digits.sub', sub.a, sub.b).some(Boolean), `${sub.a} − ${sub.b} borrows`);
  }
  assert.equal(A.gen(seeded(3), { digits: 2, lo: 5, hi: 500 }).a <= 99, true, 'lo and hi never change the number of digits');
  assert.deepEqual([fitsRegroup('digits.add', 40, 37, 'some'), fitsRegroup('digits.add', 42, 15, 'some'), fitsRegroup('digits.add', 21, 64, 'some')], [false, false, false], 'the audit\'s three');
  assert.deepEqual([fitsRegroup('digits.add', 46, 38, 'some'), fitsRegroup('digits.add', 46, 38, 'all'), fitsRegroup('digits.add', 68, 57, 'all')], [true, false, true]);
  assert.equal(selfTest({ gen: { tool: 'digits.add', digits: 2, regroup: 'some' } }).ok, true);
  assert.match(selfTest({ gen: { tool: 'digits.add', digits: 2, regroup: 'lots' } }).problems[0].why, /regroup must be "some"/);
  assert.match(selfTest({ gen: { tool: 'digits.add', digits: 1, regroup: 'all', lo: 1, hi: 4 } }).problems[0].why, /cannot be kept with these numbers/);
});
test('1.6.0: hints with the problem\'s own digits, for the column of the last mistake', () => {
  const add = cleanProblem({ tool: 'digits.add', a: 46, b: 38 }).p, A = T('digits.add'), W = WORDS.en;
  const say = x => W[x.k].replace(/\{(\w+)\}/g, (m, k) => { const v = x.v[k]; return typeof v === 'string' && v in W ? W[v] : String(v); });
  assert.deepEqual(A.hints(add).map(say), ['Ones: Add 6 + 8. Is it 10 or more?', 'Ones: 6 + 8 = 14. Write 4 and carry 1 to the next column (Tens).', 'Tens: 4 + 3 + 1 = 8. Write 8 in this column.']);
  assert.deepEqual(A.hints(add, { ans: [4, 7] }).map(say)[1], 'Tens: 4 + 3 + 1 = 8. Write 8 in this column.', 'the first box not right yet: the tens');
  assert.deepEqual(A.hints(add, { ans: [null, null] }, 1).map(say)[0], 'Tens: Add 4 + 3, then the 1 you carried. Is it 10 or more?', 'focus: the column of the last mistake');
  assert.equal(say(A.hints(cleanProblem({ tool: 'digits.add', a: 957, b: 868 }).p, null, 2)[1]), 'Hundreds: 9 + 8 + 1 = 18. Write 8 here and 1 in the box on its left.');
  const sub = cleanProblem({ tool: 'digits.sub', a: 503, b: 128 }).p, S = T('digits.sub');
  assert.deepEqual(S.hints(sub).map(say).slice(0, 2), ['Ones: 3 − 8. Is 3 big enough to take away 8?', 'Ones: 3 is less than 8, so take 1 from the next column (Tens). Now 13 − 8 = 5. Write 5 in this column.']);
  assert.match(say(S.hints(sub, null, 1)[0]), /^Tens: Its top digit is 0 and it gave 1 away, so first take 1 from the next column \(Hundreds\): it becomes 9\. Now 9 − 2 = 7\./);
  const mul = cleanProblem({ tool: 'digits.mul', a: 47, b: 6 }).p;
  assert.equal(say(T('digits.mul').hints(mul)[1]), 'Ones: 7 × 6 = 42. Write 2 and carry 4 to the next column (Tens).');
  // every language has every new word, with the same values (the words test below), and none uses an em dash
  for (const l of Object.keys(WORDS)) for (const k of ['hAdd10', 'hSub0', 'fbStep', 'endStars', 'sound']) assert.ok(WORDS[l][k] && !WORDS[l][k].includes('—'), `${l}.${k}`);
});
test('1.6.0: a problem\'s story ({a} and {b}) and the theme are data the kit checks', () => {
  const p = cleanProblem({ tool: 'digits.add', a: 46, b: 38, story: 'The farm packs {a} eggs, then {b} more. How many eggs?' }).p;
  assert.deepEqual(T('digits.add').task(p), { text: 'The farm packs 46 eggs, then 38 more. How many eggs?' });
  assert.equal(cleanProblem({ tool: 'digits.add', a: 46, b: 38, story: 'The farm packs 46 eggs.' }).p, undefined, 'a story without {a} and {b}');
  assert.match(cleanProblem({ tool: 'digits.add', a: 46, b: 38, story: '<b>{a}</b> {b}' }).why, /no < >/);
  const g = T('digits.add').gen(seeded(5), { digits: 2, story: 'A crate holds {a} eggs and another {b}. How many?' });
  assert.match(T('digits.add').task(cleanProblem(g).p).text, /^A crate holds \d\d eggs and another \d\d\. How many\?$/);
  assert.deepEqual(themeOf({ icon: '🐔', cheers: ['Egg-cellent!', ' ', 'x'.repeat(90)], end: 'Done!', other: 1 }), { icon: '🐔', cheers: ['Egg-cellent!', 'x'.repeat(60)], end: 'Done!' });
  assert.equal(themeOf({ icon: 'farm' }), null, 'an icon is one emoji, not a word');
  const base = { problems: [{ tool: 'digits.add', a: 23, b: 45 }] };
  assert.equal(selfTest({ ...base, task: { title: 'Farm', theme: { icon: '👩‍🌾', cheers: ['Yee-haw!'], end: 'All packed.' } } }).ok, true, 'a ZWJ emoji is one icon');
  assert.match(selfTest({ ...base, task: { theme: { cheers: 'yay' } } }).problems[0].why, /cheers must be up to 4 short lines/);
  assert.match(selfTest({ ...base, task: { theme: { icon: 'cow' } } }).problems[0].why, /icon must be one emoji/);
  assert.match(selfTest({ ...base, task: { theme: [] } }).problems[0].why, /task\.theme must be/);
});
test('1.1.0: config.supports, the help modes an activity offers; the self-test checks them; 1.0.0 ignores them', () => {
  const base = { config: { support: 'count', supports: ['count', 'guided'] }, problems: [{ tool: 'digits.add', a: 23, b: 45 }] };
  assert.deepEqual(selfTest(base), { ok: true, problems: [] });
  for (const [supports, why] of [[[], /supports must be a list/], [['count', 'count'], /each once/], [['loud'], /supports must be a list/], ['guided', /supports must be a list/]]) {
    const r = selfTest({ ...base, config: { supports } }); assert.equal(r.ok, false); assert.match(r.problems[0].why, why);
  }
  const off = selfTest({ ...base, config: { support: 'own', supports: ['count', 'guided'] } });
  assert.equal(off.ok, false); assert.match(off.problems[0].why, /support must be one of supports/);
  // the server's self-test runs each activity with the kit it pins: 1.0.0 knows nothing of supports and still passes it
  assert.deepEqual(JSON.parse(JSON.stringify(canvasKit('1.0.0').selfTest({ ...base, config: { supports: ['count', 'count'] } }))), { ok: true, problems: [] });
  assert.equal(canvasKit('1.1.0').selfTest({ ...base, config: { supports: ['count', 'count'] } }).ok, false);
  assert.equal(WORDS.en.helpMode, 'Help', 'the switcher\'s name, in every language (the words test below)');
});
test('the kit\'s words: every language has every key, with the same {values}', () => {
  const keys = Object.keys(WORDS.en), want = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  const langs = CODES.filter(c => c !== 'en-GB');
  for (const l of langs) {
    assert.ok(WORDS[l], `${l} is there`);
    const missing = keys.filter(k => typeof WORDS[l][k] !== 'string' || !WORDS[l][k].trim());
    assert.deepEqual(missing, [], `${l} is missing words`);
    for (const k of keys) assert.deepEqual(want(WORDS[l][k]), want(WORDS.en[k]), `${l}.${k} keeps its values`);
  }
  assert.equal(wordsFor('en-GB').check, 'Check'); assert.equal(wordsFor('zh-Hant').check, '檢查'); assert.equal(wordsFor('xx').hint, 'Hint');
});
test('the kit\'s colours are a copy of the site\'s tokens (light and dark)', () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/css/app.css'), 'utf8');
  const light = /:root\{([\s\S]*?)\n\}/.exec(app)[1], dark = /:root\[data-theme="dark"\]\{([\s\S]*?)\n\}\}/.exec(app)[1];
  const val = (block, name) => (new RegExp(`${name}:([^;]+);`).exec(block) || [])[1];
  for (const [mode, block] of [['light', light], ['dark', dark]]) {
    for (const m of TOKENS[mode].matchAll(/(--[\w-]+):([^;]+)/g)) {
      if (m[1] === '--shadow') continue;
      const site = val(block, m[1]) || (mode === 'dark' ? null : undefined);
      if (site !== null && site !== undefined) assert.equal(m[2].trim(), site.trim(), `${mode} ${m[1]}`);
    }
  }
});

// ---------------------------------------------------------------- the scanner
test('the scanner admits exactly the pinned Oomba Canvas tag and refuses altered ones', () => {
  const page = tag => `<title>A</title>${tag}<div id="oc-app"></div><script>Oc.activity({})</script>`;
  // both pinned versions: a new activity pins 1.1.0, and every activity saved on 1.0.0 keeps working
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.4.1', '1.5.0', '1.6.0', '1.6.1']) {
    const good = scanVersion(page(canvasTag(v)));
    assert.equal(good.status, 'pass', `${v}: ${JSON.stringify(good.issues)}`);
    assert.deepEqual(checkCanvas(page(canvasTag(v))).issues, [], v);
    assert.equal(canvasVersion(page(canvasTag(v))), v);
  }
  assert.equal(canvasTag(), canvasTag('1.6.1'));
  const swapped = canvasTag('1.0.0').replace(CANVAS_VERSIONS['1.0.0'], CANVAS_VERSIONS['1.1.0']);
  assert.equal(scanVersion(page(swapped)).status, 'fail', 'one version\'s file with the other\'s hash');
  const h = CANVAS_VERSIONS[CANVAS_LATEST];
  const bad = [
    canvasTag().replace(h, 'sha384-' + 'A'.repeat(64)),                               // another hash
    canvasTag().replace(CANVAS_LATEST, '9.9.9'),                                       // a version we do not have
    canvasTag().replace(' crossorigin="anonymous"', ''),                               // no crossorigin
    canvasTag().replace('></script>', ' data-x="1"></script>'),                        // anything extra
    canvasTag().replace('></script>', '>alert(1)</script>'),                           // code inside the tag
    `<script src="/vendor/oomba-canvas/1.0.0/other.js" integrity="${h}" crossorigin="anonymous"></script>`,
    `<img src="/vendor/oomba-canvas/1.0.0/oomba-canvas.js">`,                          // its files named elsewhere
  ];
  for (const b of bad) {
    const r = scanVersion(page(b));
    assert.equal(r.status, 'fail', b);
    assert.ok(r.issues.some(i => /^canvas_/.test(i.code) || i.code === 'external_script'), `${b}: ${JSON.stringify(r.issues)}`);
  }
});
